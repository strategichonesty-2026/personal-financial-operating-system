import { db } from '@/lib/db';
import {
  stagedTransactions, journalEntries, journalEntryLines, accounts, auditLog, AUDIT_EVENTS
} from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

// Category code → expense account code mapping
const CATEGORY_TO_ACCOUNT: Record<string, string> = {
  '4011': '4011', // Payroll → Income: Payroll
  '4021': '4021', // Rental Income → Income: Rental
  '1041': '1041', // Investment
  '5011': '5011', // Mortgage
  '5021': '5021', // Groceries
  '5031': '5031', // Gas & Fuel
  '5041': '5041', // Utilities
  '5061': '5061', // Shopping Online
  '5071': '5071', // Subscriptions
  '5081': '5081', // Phone
  '5082': '5082', // Internet
  '5091': '5091', // Auto Insurance
  '5101': '5101', // Auto Loan
  '6021': '6021', // Software & Tools
};

// Fallback expense account for uncategorized transactions
const UNCATEGORIZED_EXPENSE = '5099'; // General Expense
const UNCATEGORIZED_INCOME  = '4099'; // General Income

export interface PostingResult {
  posted: number;
  skipped: number;
  errors: string[];
}

export async function postStagedTransactions(
  batchId: string,
  userId: string,
  transactionIds?: string[] // if undefined, post all pending in batch
): Promise<PostingResult> {
  const result: PostingResult = { posted: 0, skipped: 0, errors: [] };

  // 1. Load staged transactions to post
  const whereClause = transactionIds
    ? inArray(stagedTransactions.id, transactionIds)
    : eq(stagedTransactions.batchId, batchId);

  const staged = await db
    .select()
    .from(stagedTransactions)
    .where(whereClause);

  const toPost = staged.filter(t => t.status === 'pending' && !t.journalEntryId);
  result.skipped = staged.length - toPost.length;

  if (!toPost.length) return result;

  // 2. Load all accounts into a lookup map
  const allAccounts = await db.select().from(accounts);
  const accountByCode = new Map(allAccounts.map(a => [a.code, a]));
  const accountById   = new Map(allAccounts.map(a => [a.id, a]));

  // 3. Post each transaction
  for (const txn of toPost) {
    try {
      const bankAccount = accountById.get(txn.accountId);
      if (!bankAccount) {
        result.errors.push(`Account not found for txn ${txn.id}`);
        result.skipped++;
        continue;
      }

      // Determine the contra account (expense/income)
      const categoryCode = txn.categoryCode;
      const contraCode = categoryCode
        ? (CATEGORY_TO_ACCOUNT[categoryCode] ?? null)
        : null;

      const isAsset     = bankAccount.type === 'asset';
      const isLiability = bankAccount.type === 'liability';

      // Determine debit/credit sides based on account type and transaction direction
      let debitAccountId: string;
      let creditAccountId: string;

      if (isLiability) {
        // Credit card account
        if (txn.direction === 'debit') {
          // Charge: DEBIT expense, CREDIT liability
          const expenseAccount = contraCode
            ? accountByCode.get(contraCode)
            : accountByCode.get(UNCATEGORIZED_EXPENSE);
          if (!expenseAccount) {
            // Create fallback
            result.errors.push(`No expense account for category ${categoryCode} on txn ${txn.id}`);
            result.skipped++;
            continue;
          }
          debitAccountId  = expenseAccount.id;
          creditAccountId = bankAccount.id;
        } else {
          // Payment: DEBIT liability, CREDIT asset (unknown which asset — use suspense)
          const suspenseAccount = accountByCode.get('9001'); // Suspense account
          debitAccountId  = bankAccount.id;
          creditAccountId = suspenseAccount?.id ?? bankAccount.id;
        }
      } else if (isAsset) {
        // Checking/savings account
        if (txn.direction === 'debit') {
          // Withdrawal: DEBIT expense, CREDIT asset
          const expenseAccount = contraCode
            ? accountByCode.get(contraCode)
            : accountByCode.get(UNCATEGORIZED_EXPENSE);
          if (!expenseAccount) {
            result.errors.push(`No expense account for txn ${txn.id}`);
            result.skipped++;
            continue;
          }
          debitAccountId  = expenseAccount.id;
          creditAccountId = bankAccount.id;
        } else {
          // Deposit: DEBIT asset, CREDIT income
          const incomeAccount = contraCode
            ? accountByCode.get(contraCode)
            : accountByCode.get(UNCATEGORIZED_INCOME);
          if (!incomeAccount) {
            result.errors.push(`No income account for txn ${txn.id}`);
            result.skipped++;
            continue;
          }
          debitAccountId  = bankAccount.id;
          creditAccountId = incomeAccount.id;
        }
      } else {
        result.errors.push(`Unknown account type ${bankAccount.type} for txn ${txn.id}`);
        result.skipped++;
        continue;
      }

      // 4. Create journal entry
      const entryId = crypto.randomUUID();
      await db.insert(journalEntries).values({
        id:          entryId,
        entryDate:   new Date(txn.txnDate),
        description: txn.description,
        reference:   txn.batchId,
        createdBy:   userId,
      });

      // 5. Create two journal entry lines (double-entry)
      await db.insert(journalEntryLines).values([
        {
          journalEntryId: entryId,
          accountId:      debitAccountId,
          amountCents:    txn.amountCents,
          side:           'debit',
          memo:           txn.description,
        },
        {
          journalEntryId: entryId,
          accountId:      creditAccountId,
          amountCents:    txn.amountCents,
          side:           'credit',
          memo:           txn.description,
        },
      ]);

      // 6. Mark staged transaction as posted
      await db
        .update(stagedTransactions)
        .set({
          status:        'posted',
          journalEntryId: entryId,
          postedAt:      new Date(),
        })
        .where(eq(stagedTransactions.id, txn.id));

      // 7. Audit log
      await db.insert(auditLog).values({
        userId,
        eventType:  AUDIT_EVENTS.TRANSACTION_POSTED,
        entityType: 'staged_transaction',
        entityId:   txn.id,
        payload:    { journalEntryId: entryId, status: 'posted' },
      });

      result.posted++;

    } catch (err) {
      result.errors.push(`Error posting txn ${txn.id}: ${String(err)}`);
      result.skipped++;
    }
  }

  return result;
}
