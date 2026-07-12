// Double-entry accounting engine
// ALL accounting logic lives here — never in UI or API routes
//
// Rules enforced:
// 1. Every journal entry must balance (debits = credits)
// 2. Amounts are always stored as positive integers (cents)
// 3. Direction is explicit: "debit" or "credit"
// 4. No entry is posted without balance validation

import { db, schema } from '@/lib/db';
import { eq, sql, and, isNull } from 'drizzle-orm';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

// ── Types ─────────────────────────────────────────────────────────────────────

export type JournalEntryLine = {
  accountId: string;
  amountCents: number;  // always positive
  side: 'debit' | 'credit';
  memo?: string;
};

export type CreateJournalEntryInput = {
  entryDate: Date;
  description: string;
  reference?: string;
  isOpening?: boolean;
  lines: JournalEntryLine[];
  createdBy: string;
};

export type AccountBalance = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  debitTotal: number;   // cents
  creditTotal: number;  // cents
  balance: number;      // cents — positive means normal balance side
};

// ── Core: Create Journal Entry ────────────────────────────────────────────────

export async function createJournalEntry(
  input: CreateJournalEntryInput
): Promise<string> {

  // Validate: must have at least 2 lines
  if (input.lines.length < 2) {
    throw new Error('ACCOUNTING: Journal entry requires at least 2 lines');
  }

  // Validate: amounts must be positive
  for (const line of input.lines) {
    if (line.amountCents <= 0) {
      throw new Error(`ACCOUNTING: Amount must be positive, got ${line.amountCents}`);
    }
  }

  // Validate: debits must equal credits (THE fundamental rule)
  const totalDebits = input.lines
    .filter(l => l.side === 'debit')
    .reduce((sum, l) => sum + l.amountCents, 0);

  const totalCredits = input.lines
    .filter(l => l.side === 'credit')
    .reduce((sum, l) => sum + l.amountCents, 0);

  if (totalDebits !== totalCredits) {
    throw new Error(
      `ACCOUNTING: Entry does not balance. ` +
      `Debits: ${totalDebits} cents, Credits: ${totalCredits} cents, ` +
      `Difference: ${totalDebits - totalCredits} cents`
    );
  }

  // ── Dedup guard: skip if identical entry already exists ──────────────────
  const totalDebitAmount = input.lines
    .filter(l => l.side === 'debit')
    .reduce((sum, l) => sum + l.amountCents, 0);

  const existing = await db
    .select({ id: schema.journalEntries.id })
    .from(schema.journalEntries)
    .innerJoin(
      schema.journalEntryLines,
      eq(schema.journalEntryLines.journalEntryId, schema.journalEntries.id)
    )
    .where(
      and(
        eq(schema.journalEntries.entryDate, input.entryDate),
        eq(schema.journalEntries.description, input.description),
        eq(schema.journalEntryLines.amountCents, totalDebitAmount),
        eq(schema.journalEntryLines.side, 'debit')
      )
    )
    .limit(1);

  if (existing[0]) {
    console.log(`[DEDUP] Skipping duplicate: "${input.description}" ${input.entryDate.toISOString().slice(0,10)} $${totalDebitAmount/100}`);
    return existing[0].id;
  }

  // Insert journal entry + lines in a transaction
  const entryId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    // Insert header
    await tx.insert(schema.journalEntries).values({
      id: entryId,
      entryDate: input.entryDate,
      description: input.description,
      reference: input.reference ?? null,
      isOpening: input.isOpening ?? false,
      createdBy: input.createdBy,
    });

    // Insert lines
    await tx.insert(schema.journalEntryLines).values(
      input.lines.map(line => ({
        journalEntryId: entryId,
        accountId: line.accountId,
        amountCents: line.amountCents,
        side: line.side,
        memo: line.memo ?? null,
      }))
    );
  });

  // Log to audit trail
  await logEvent({
    userId: input.createdBy,
    eventType: AUDIT_EVENTS.TRANSACTION_POSTED,
    entityType: 'journal_entry',
    entityId: entryId,
    payload: {
      description: input.description,
      amountCents: totalDebits,
      lineCount: input.lines.length,
    },
  });

  return entryId;
}

// ── Account Balance Calculation ───────────────────────────────────────────────

export async function getAccountBalance(accountId: string): Promise<number> {
  const account = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, accountId))
    .limit(1);

  if (!account[0]) throw new Error(`Account not found: ${accountId}`);

  const lines = await db
    .select({
      side: schema.journalEntryLines.side,
      total: sql<number>`sum(${schema.journalEntryLines.amountCents})`,
    })
    .from(schema.journalEntryLines)
    .where(eq(schema.journalEntryLines.accountId, accountId))
    .groupBy(schema.journalEntryLines.side);

  let debits = 0;
  let credits = 0;

  for (const line of lines) {
    if (line.side === 'debit') debits = Number(line.total);
    else credits = Number(line.total);
  }

  // Normal balance rules:
  // Assets + Expenses: increase with DEBIT → balance = debits - credits
  // Liabilities + Equity + Income: increase with CREDIT → balance = credits - debits
  const normalBalance = account[0].normalBalance;
  if (normalBalance === 'debit') {
    return debits - credits;
  } else {
    return credits - debits;
  }
}

// ── Trial Balance ─────────────────────────────────────────────────────────────

export async function getTrialBalance(): Promise<{
  accounts: AccountBalance[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}> {
  const accounts = await db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.isActive, true),
        isNull(schema.accounts.deletedAt)
      )
    )
    .orderBy(schema.accounts.code);

  const result: AccountBalance[] = [];
  let totalDebits = 0;
  let totalCredits = 0;

  for (const account of accounts) {
    const lines = await db
      .select({
        side: schema.journalEntryLines.side,
        total: sql<number>`coalesce(sum(${schema.journalEntryLines.amountCents}), 0)`,
      })
      .from(schema.journalEntryLines)
      .where(eq(schema.journalEntryLines.accountId, account.id))
      .groupBy(schema.journalEntryLines.side);

    let debitTotal = 0;
    let creditTotal = 0;

    for (const line of lines) {
      if (line.side === 'debit') debitTotal = Number(line.total);
      else creditTotal = Number(line.total);
    }

    // Skip accounts with no activity
    if (debitTotal === 0 && creditTotal === 0) continue;

    const balance = account.normalBalance === 'debit'
      ? debitTotal - creditTotal
      : creditTotal - debitTotal;

    result.push({
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      accountType: account.type,
      normalBalance: account.normalBalance,
      debitTotal,
      creditTotal,
      balance,
    });

    totalDebits += debitTotal;
    totalCredits += creditTotal;
  }

  return {
    accounts: result,
    totalDebits,
    totalCredits,
    isBalanced: totalDebits === totalCredits,
  };
}

// ── Helper: dollars to cents ──────────────────────────────────────────────────

export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function toDollars(cents: number): number {
  return cents / 100;
}
