import { db } from '@/lib/db';
import {
  stagedTransactions, journalEntries, journalEntryLines, accounts, auditLog, AUDIT_EVENTS
} from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// ACCOUNT CODE → UUID MAP (real Neon UUIDs)
// ---------------------------------------------------------------------------
const ACCOUNT_IDS: Record<string, string> = {
  '1011': 'ea3dc024-95ca-412d-90d7-ab93a0de4ea9',
  '1012': '89fb9b6a-634e-44b2-b98a-535bf4988e5a',
  '1013': '26f24223-a34d-42f0-9cc8-81e049b233d8',
  '1014': '55a0b455-9512-4ba9-a063-1bab7fdee6d7',
  '1015': '3a9dc5de-be96-46a9-b4ef-fee55bb928c7',
  '1016': 'af26b25b-5fb4-478b-91a9-6ccc6fa5efd6',
  '1021': '80013b42-5941-4b38-8c22-c6f2f629f29e',
  '1022': '9aac19c1-a48d-4e78-ac50-7d88711ddc54',
  '2011': 'b01b6747-c5e4-45f1-8bfd-3499388d5108',
  '2012': 'c653eb83-ca2d-49e7-9a73-4c9934bb2b73',
  '2013': '8ad3001a-486d-498a-ab5c-c1582915025f',
  '2014': '8bbe8b88-e09b-411f-9dd8-0d23970726da',
  '2015': '0b1b5aeb-7442-4cb8-9df5-b32ded9a5c33',
  '2023': '0954bdd3-7e01-46cb-a7f6-e42ea097962f',
'2024': 'a2640d30-cd24-42d7-a597-9f10b6256abc',
  '2025': 'c4ef492e-95f8-46a0-8605-c3ae12b3f712',
  '6104': '41f69001-6d60-424b-b96c-0ac4624c3a9e',  
'2031': '3d2b2b39-a254-4c94-a090-0f67cba1694a',
  '3030': 'dd9a2abc-7f30-4182-9de2-90b76e296efa',
  '4011': '09d54433-1d16-46aa-ac4b-6d8c57003e70',
  '4032': 'e75f6c49-e54c-4503-b0b5-ff895eb0bd4f',
  '4041': '058280a9-b522-4b3b-9c2e-c99cd17532fc',
  '5011': 'de0fec66-e14d-4254-b4ca-5ee51af95710',
  '5031': '1e305bbf-c29e-4429-83d3-4552f98175a6',
  '5032': 'a6de4123-31b1-4dcc-a812-a0fb9e4719d6',
  '5033': '59671622-c88d-497d-99a2-dd72629a91ae',
  '5044': 'd445e2a1-0739-4c18-8573-55ce8022e30e',
  '5071': '04daf78f-8324-4058-be20-72ec905232fe',
  '5081': '337a70fc-ace5-47b3-8969-41f7a03ac40f',
  '6035': '29a25efb-ae29-49e1-9476-7ff4b5435a8c',
  '6081': 'f87bcb45-1350-45c0-9554-d3d345a701ba',
  '6091': '1a7968c7-0f6b-4cc0-aebc-d8c57e4bdf5d',
  '6103': 'a01f6e7e-c9d8-4eb3-a335-830d81058a1f',
};

// ---------------------------------------------------------------------------
// CATEGORY CODE → ACCOUNT CODE (from parser output)
// ---------------------------------------------------------------------------
const CATEGORY_TO_ACCOUNT: Record<string, string> = {
  '4011': '4011', '4021': '4032', '1041': '1021',
  '5011': '5011', '5021': '5021', '5031': '5031',
  '5041': '5031', '5061': '6081', '5071': '6035',
  '5081': '5071', '5082': '5032', '5091': '5044',
  '5101': '5041', '6021': '6103',
};

// ---------------------------------------------------------------------------
// DESCRIPTION-BASED POSTING RULES
// ---------------------------------------------------------------------------
interface PostingRule {
  pattern: RegExp;
  debitCode?: string;
  creditCode?: string;
  isTransfer?: boolean;
  transferToCode?: string;
  isCCPayment?: boolean;
  liabilityCode?: string;
  isTransferIn?: boolean;
  sourceCode?: string;
}

const DESCRIPTION_RULES: PostingRule[] = [
  // PAYROLL
  { pattern: /from wells fargo bank/i,       debitCode: '1011', creditCode: '4011' },
  { pattern: /from wells fargo ifi/i,        debitCode: '1011', creditCode: '4011' },
  // RENTAL INCOME
  { pattern: /homes plus realt/i,            debitCode: '1014', creditCode: '4032' },
  { pattern: /pmt from sabin thapa/i,        debitCode: '1015', creditCode: '4032' },
  // INTEREST
  { pattern: /^interest payment$/i,          debitCode: '1014', creditCode: '4041' },
  // RENTAL MORTGAGES
  { pattern: /prmi payments.*0251/i,         debitCode: '5014', creditCode: '1011' },
  { pattern: /prmi payments.*4937/i,         debitCode: '5015', creditCode: '1011' },
  // HOUSING
  { pattern: /nsm dbamr.cooper|nsm.*cooper/i,debitCode: '5011', creditCode: '1015' },
  { pattern: /cpenergy|centerpoint/i,        debitCode: '5031', creditCode: '1015' },
  { pattern: /electronic withdrawal to city of blaine/i, debitCode: '5031', creditCode: '1015' },
  { pattern: /comcast|xfinity/i,             debitCode: '5032', creditCode: '1015' },
  { pattern: /concertfin/i,                  debitCode: '5033', creditCode: '1015' },
  // PHONE
  { pattern: /t-mobile|tmobile/i,            debitCode: '5071', creditCode: '1015' },
  { pattern: /pmt to saurav shrestha/i,      debitCode: '5071', creditCode: '1011' },
  // INSURANCE
  { pattern: /nationwide/i,                  debitCode: '5044', creditCode: '1015' },
  // BNPL
  { pattern: /affirm/i,                      debitCode: '5081', creditCode: '1011' },
  { pattern: /atgpay/i,                      debitCode: '5081', creditCode: '1011' },
  // SUBSCRIPTIONS
  { pattern: /to subscription/i,             debitCode: '6035', creditCode: '1011' },
  // GYM
  { pattern: /fitness abc|xperience fitness/i,debitCode: '6081',creditCode: '1011' },
  // INVESTMENTS
  { pattern: /to acorns invest/i,            isTransfer: true, transferToCode: '1021' },
  { pattern: /to acorns later/i,             isTransfer: true, transferToCode: '1022' },
  // AMAZON
  { pattern: /amazon\.com/i,                 debitCode: '6081', creditCode: '2012' },
  // MISC PERSONAL
  { pattern: /holiday store/i,               debitCode: '6103', creditCode: '1011' },
  { pattern: /pmt to jay lamsal/i,           debitCode: '6103', creditCode: '1011' },
  { pattern: /zelle to shrestha nepali/i,    debitCode: '6103', creditCode: '1011' },
  { pattern: /wfcu direct db/i,              debitCode: '6091', creditCode: '1011' },
  // SYNCHRONY / SAM'S CLUB
  { pattern: /online payment thank you/i,    isCCPayment: true, liabilityCode: '2015' },
  { pattern: /online payment, thank you/i,      isCCPayment: true, liabilityCode: '2013' },
  { pattern: /automatic payment - thank you/i,   isCCPayment: true, liabilityCode: '2012' },
  { pattern: /sam's club \d+/i,             debitCode: '6081', creditCode: '2015' },
  { pattern: /google.*google one/i,          debitCode: '6035', creditCode: '2015' },
  { pattern: /interest charge/i,             debitCode: '5081', creditCode: '2015' },
  // INTEREST CHARGES (all credit cards — debit to interest expense 5081)
  { pattern: /purchase interest charge/i,    debitCode: '5081', creditCode: '2012' },
  { pattern: /interest charge on purchases/i,debitCode: '5081', creditCode: '2013' },
  { pattern: /interest charge on cash/i,     debitCode: '5081', creditCode: '2013' },
  { pattern: /interest charge/i,             debitCode: '5081', creditCode: '2012' },
  { pattern: /periodic rate/i,               debitCode: '5081', creditCode: '2015' },
  { pattern: /minimum interest/i,            debitCode: '5081', creditCode: '2015' },
  // CC PAYMENTS
  { pattern: /chase credit crd epay/i,       isCCPayment: true, liabilityCode: '2012' },
  { pattern: /citi card online payment/i,    isCCPayment: true, liabilityCode: '2013' },
  { pattern: /wf credit card auto pay/i,     isCCPayment: true, liabilityCode: '2014' },
// PAYROLL appearing in non-WF accounts
  { pattern: /wells fargo bank des:payroll/i,                          creditCode: '4011' },
{ pattern: /wells fargo bank des:payrll dep/i,                     creditCode: '4011' },
  { pattern: /bestify tax advi/i,                                     debitCode: '6091', creditCode: '1016' },
  { pattern: /electronic withdrawal to citi card online/i,            isCCPayment: true, liabilityCode: '2013' },
{ pattern: /wells fargo bank payroll/i,                    creditCode: '4011' },
  { pattern: /mobile banking payment to crd 5787/i,          isCCPayment: true, liabilityCode: '2016' },
  { pattern: /mobile banking payment to crd 3463/i,          isCCPayment: true, liabilityCode: '2014' },
  { pattern: /mobile banking payment to crd 9292/i,          isCCPayment: true, liabilityCode: '2014' },
  // BOA CC 5787 payments
  { pattern: /online banking payment to crd 5787/i,                    isCCPayment: true, liabilityCode: '2016' },
  { pattern: /online payment from chk.*5787/i,                         isCCPayment: true, liabilityCode: '2016' },
 { pattern: /online banking payment to crd 3463/i,           isCCPayment: true, liabilityCode: '2014' },
  { pattern: /online banking payment to crd 9292/i,           isCCPayment: true, liabilityCode: '2014' },
  { pattern: /online payment from chk.*3463/i,                isCCPayment: true, liabilityCode: '2014' },
  { pattern: /online payment from chk.*9292/i,                isCCPayment: true, liabilityCode: '2014' },
{ pattern: /zelle payment from gopu shrestha.*book and promotion/i, debitCode: '1016', creditCode: '6104' },
  { pattern: /zelle payment from gopu shrestha.*phone payment/i,      debitCode: '1016', creditCode: '5071' },
  { pattern: /zelle payment from gopu shrestha.*pay credit card/i,    isTransferIn: true, sourceCode: '1011' },
  { pattern: /zelle payment from gopu shrestha.*cc payment/i,         isTransferIn: true, sourceCode: '1011' },
  { pattern: /zelle payment from gopu shrestha.*t.?mobile/i,          debitCode: '1011', creditCode: '5071' },
  { pattern: /zelle payment from gopu shrestha/i,                     isTransferIn: true, sourceCode: '1011' },
  // GROCERIES on CC
  { pattern: /aldi\s+\d+/i,                                   debitCode: '5021', creditCode: '2014' },
 { pattern: /bank of america credit card bill payment/i,              isCCPayment: true, liabilityCode: '2016' },
  { pattern: /^cc payment$/i,                                          isCCPayment: true, liabilityCode: '2016' },
  { pattern: /payment - thank you.*5787/i,                               isCCPayment: true, liabilityCode: '2016' },
  { pattern: /payment - thank you.*9292/i,                               isCCPayment: true, liabilityCode: '2014' },
  { pattern: /payment - thank you.*3463/i,                               isCCPayment: true, liabilityCode: '2014' },
  // CPA / PROFESSIONAL FEES
  { pattern: /zelle payment to santosh timilsina/i,                    debitCode: '6091', creditCode: '1015' },
  // ZELLE FROM SELF

{ pattern: /electronic withdrawal to wells fargo card/i, isCCPayment: true, liabilityCode: '2024' },
  { pattern: /us bank.*credit card|usbank.*autopay/i,      isCCPayment: true, liabilityCode: '2025' },
  { pattern: /irs treas 310.*tax ref/i,                    creditCode: '4012' },
  { pattern: /mn dept of reven.*mnsttaxrfd/i,              creditCode: '4012' },
  { pattern: /cardmember serv.*web pymt/i,                 isCCPayment: true, liabilityCode: '2012' }, 

 { pattern: /to samsclub mstrcrd/i,         isCCPayment: true, liabilityCode: '2011' },
  // INTERNAL TRANSFERS — out
  { pattern: /to account \*{0,4}1353/i,      isTransfer: true, transferToCode: '1015' },
// US BANK INTERNAL TRANSFERS
  { pattern: /transfer to account 104788091353/i,   isTransfer: true, transferToCode: '1015' },
  { pattern: /transfer from account 104784156820/i, isTransferIn: true, sourceCode: '1014' },
  // ROCKET MORTGAGE
  { pattern: /electronic withdrawal to rocket mortgage/i, debitCode: '5011', creditCode: '1014' }, 
 { pattern: /recurring transfer to.*way2save/i, isTransfer: true, transferToCode: '1013' },
  { pattern: /pmt to gopu boa tm/i,          isTransfer: true, transferToCode: '1016' },
  { pattern: /zelle to boa gopu/i,           isTransfer: true, transferToCode: '1016' },
  // INTERNAL TRANSFERS — in
  { pattern: /from account \*{0,4}6820/i,    isTransferIn: true, sourceCode: '1014' },
  { pattern: /recurring transfer from.*checking/i, isTransferIn: true, sourceCode: '1011' },
  // ZELLE FROM FAMILY
  { pattern: /zelle from shrestha chini/i,   creditCode: '4012' },
  { pattern: /zelle from shrestha/i,           debitCode: '1011', creditCode: '6103' },
];

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function resolveId(
  code: string,
  accountByCode: Map<string, { id: string; code: string }>
): string | null {
  const acct = accountByCode.get(code);
  if (acct) return acct.id;
  return ACCOUNT_IDS[code] ?? null;
}

// ---------------------------------------------------------------------------
// MAIN EXPORT
// ---------------------------------------------------------------------------
export interface PostingResult {
  posted: number;
  skipped: number;
  errors: string[];
}

export async function postStagedTransactions(
  batchId: string,
  userId: string,
  transactionIds?: string[]
): Promise<PostingResult> {
  const result: PostingResult = { posted: 0, skipped: 0, errors: [] };

  const whereClause = transactionIds
    ? inArray(stagedTransactions.id, transactionIds)
    : eq(stagedTransactions.batchId, batchId);

  const staged = await db.select().from(stagedTransactions).where(whereClause);
  const toPost = staged.filter(t => t.status === 'pending' && !t.journalEntryId);
  result.skipped = staged.length - toPost.length;

  if (!toPost.length) return result;

  const allAccounts = await db.select().from(accounts);
  const accountByCode = new Map(allAccounts.map(a => [a.code, a]));
  const accountById   = new Map(allAccounts.map(a => [a.id, a]));

  for (const txn of toPost) {
    try {
      const bankAccount = accountById.get(txn.accountId);
      if (!bankAccount) {
        result.errors.push(`Account not found for txn ${txn.id}`);
        result.skipped++;
        continue;
      }

      let debitAccountId: string | null = null;
      let creditAccountId: string | null = null;

      // 1. Description-based rules
      const desc = (txn.rawDescription ?? txn.description ?? '').trim();
      const rule = DESCRIPTION_RULES.find(r => r.pattern.test(desc));

      if (rule) {
        if (rule.isTransfer) {
          const otherId = resolveId(rule.transferToCode!, accountByCode);
          if (txn.direction === 'debit') {
            debitAccountId  = otherId;
            creditAccountId = bankAccount.id;
          } else {
            debitAccountId  = bankAccount.id;
            creditAccountId = otherId;
          }
        } else if (rule.isTransferIn) {
          debitAccountId  = bankAccount.id;
          creditAccountId = resolveId(rule.sourceCode!, accountByCode);
        } else if (rule.isCCPayment) {
          debitAccountId  = resolveId(rule.liabilityCode!, accountByCode);
          creditAccountId = bankAccount.id;
        } else {
          // Use bankAccount.id for the side matching transaction direction
          // Only use rule codes for the CONTRA account
          if (txn.direction === 'debit') {
            // Money leaving bank account: credit bank, debit expense/contra
            debitAccountId  = resolveId(rule.debitCode!, accountByCode);
            creditAccountId = bankAccount.id;
          } else {
            // Money entering bank account: debit bank, credit income/contra
            debitAccountId  = bankAccount.id;
            creditAccountId = resolveId(rule.creditCode!, accountByCode);
          }
        }
      }

      // 2. Category code fallback
      if (!debitAccountId || !creditAccountId) {
        const contraCode = txn.categoryCode
          ? (CATEGORY_TO_ACCOUNT[txn.categoryCode] ?? null)
          : null;
        const miscId = resolveId('6103', accountByCode)!;
        const isAsset = bankAccount.type === 'asset';
        const isLiability = bankAccount.type === 'liability';

        if (isLiability) {
          if (txn.direction === 'debit') {
            const exp = contraCode ? accountByCode.get(contraCode) : null;
            debitAccountId  = exp?.id ?? miscId;
            creditAccountId = bankAccount.id;
          } else {
            debitAccountId  = bankAccount.id;
            creditAccountId = miscId;
          }
        } else if (isAsset) {
          if (txn.direction === 'debit') {
            const exp = contraCode ? accountByCode.get(contraCode) : null;
            debitAccountId  = exp?.id ?? miscId;
            creditAccountId = bankAccount.id;
          } else {
            const inc = contraCode ? accountByCode.get(contraCode) : null;
            debitAccountId  = bankAccount.id;
            creditAccountId = inc?.id ?? miscId;
          }
        } else {
          result.errors.push(`Unknown account type for txn ${txn.id}`);
          result.skipped++;
          continue;
        }
      }

      if (!debitAccountId || !creditAccountId) {
        result.errors.push(`Could not resolve accounts for: ${desc}`);
        result.skipped++;
        continue;
      }

      // 3. Create journal entry
      const entryId = crypto.randomUUID();
      await db.insert(journalEntries).values({
        id:          entryId,
        entryDate:   new Date(txn.txnDate),
        description: txn.description,
        reference:   txn.batchId,
        createdBy:   userId,
      });

      await db.insert(journalEntryLines).values([
        { journalEntryId: entryId, accountId: debitAccountId,  amountCents: txn.amountCents, side: 'debit',  memo: txn.description },
        { journalEntryId: entryId, accountId: creditAccountId, amountCents: txn.amountCents, side: 'credit', memo: txn.description },
      ]);

      await db.update(stagedTransactions)
        .set({ status: 'posted', journalEntryId: entryId, postedAt: new Date() })
        .where(eq(stagedTransactions.id, txn.id));

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

  // Update batch status to 'posted' if all transactions are now posted
  if (result.posted > 0) {
    const { importBatches } = await import('@/lib/db/schema/import-batches');
    await db.update(importBatches)
      .set({ status: 'posted' })
      .where(eq(importBatches.id, batchId));
  }

  return result;
}
