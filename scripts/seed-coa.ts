// Chart of Accounts seed script
// Seeds all accounts from COA v2 (finalized in Milestone 0)
// Run once: npx tsx scripts/seed-coa.ts

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { loadEnvConfig } from '@next/env';
import * as schema from '../src/lib/db/schema';

loadEnvConfig(process.cwd());

const sql = neon(process.env['DATABASE_URL']!);
const db = drizzle(sql, { schema });

// ── Chart of Accounts — v2 FINAL ─────────────────────────────────────────────
// Based on Milestone 0 real statement analysis
// Amounts will be in cents when opening balances are posted

const COA = [
  // ── ASSETS (1000s) ──────────────────────────────────────────────────────────
  { code: '1011', name: 'Wells Fargo Everyday Checking (4184)', type: 'asset', subtype: 'bank', normalBalance: 'debit', institution: 'Wells Fargo', accountRef: '4184', openingBalanceCents: 141018 },
  { code: '1012', name: 'Wells Fargo Team Member Checking', type: 'asset', subtype: 'bank', normalBalance: 'debit', institution: 'Wells Fargo', openingBalanceCents: 586207 },
  { code: '1013', name: 'Wells Fargo Way2Save Savings (8029)', type: 'asset', subtype: 'bank', normalBalance: 'debit', institution: 'Wells Fargo', accountRef: '8029', openingBalanceCents: 53415 },
  { code: '1014', name: 'U.S. Bank Gold Checking (6820)', type: 'asset', subtype: 'bank', normalBalance: 'debit', institution: 'U.S. Bank', accountRef: '6820', openingBalanceCents: 99664 },
  { code: '1015', name: 'U.S. Bank Smartly Checking — Joint (1353)', type: 'asset', subtype: 'bank', normalBalance: 'debit', institution: 'U.S. Bank', accountRef: '1353', openingBalanceCents: 435524 },
  { code: '1016', name: 'Bank of America Adv Plus Checking (1961)', type: 'asset', subtype: 'bank', normalBalance: 'debit', institution: 'Bank of America', accountRef: '1961', openingBalanceCents: 197962 },
  { code: '1017', name: 'Bank of America Regular Savings (6951)', type: 'asset', subtype: 'bank', normalBalance: 'debit', institution: 'Bank of America', accountRef: '6951', openingBalanceCents: 215367 },
  { code: '1018', name: 'Cash on Hand', type: 'asset', subtype: 'cash', normalBalance: 'debit', openingBalanceCents: 0 },
  { code: '1021', name: 'Acorns Invest', type: 'asset', subtype: 'investment', normalBalance: 'debit', openingBalanceCents: 0 },
  { code: '1022', name: 'Acorns Later (IRA)', type: 'asset', subtype: 'investment', normalBalance: 'debit', openingBalanceCents: 0 },
  { code: '1031', name: 'Prepaid Expenses', type: 'asset', subtype: 'prepaid', normalBalance: 'debit', openingBalanceCents: 0 },
  { code: '1032', name: 'Security Deposits', type: 'asset', subtype: 'other', normalBalance: 'debit', openingBalanceCents: 0 },

  // ── LIABILITIES (2000s) ─────────────────────────────────────────────────────
  { code: '2011', name: "Sam's Club Mastercard (1629)", type: 'liability', subtype: 'credit_card', normalBalance: 'credit', institution: 'Synchrony', accountRef: '1629', openingBalanceCents: 58927 },
  { code: '2012', name: 'Amazon Visa (2877)', type: 'liability', subtype: 'credit_card', normalBalance: 'credit', institution: 'Chase', accountRef: '2877', openingBalanceCents: 36957 },
  { code: '2013', name: 'Costco Anywhere Visa (4621)', type: 'liability', subtype: 'credit_card', normalBalance: 'credit', institution: 'Citi', accountRef: '4621', openingBalanceCents: 85735 },
  { code: '2014', name: 'Bank of America Visa (9292)', type: 'liability', subtype: 'credit_card', normalBalance: 'credit', institution: 'Bank of America', accountRef: '9292', openingBalanceCents: 100143 },
  { code: '2021', name: 'Tesla Auto Loan — TD Auto Finance (X2009)', type: 'liability', subtype: 'loan', normalBalance: 'credit', institution: 'TD Auto Finance', accountRef: 'X2009', openingBalanceCents: 1892827 },
  { code: '2022', name: 'WFCU Credit Union Loan', type: 'liability', subtype: 'loan', normalBalance: 'credit', isActive: false, openingBalanceCents: 0 },
  { code: '2023', name: 'Affirm BNPL', type: 'liability', subtype: 'loan', normalBalance: 'credit', openingBalanceCents: 0 },
  { code: '2031', name: 'Solar System Payment — ConcertFin', type: 'liability', subtype: 'loan', normalBalance: 'credit', openingBalanceCents: 0 },

  // ── EQUITY (3000s) ──────────────────────────────────────────────────────────
  { code: '3010', name: 'Opening Balance Equity', type: 'equity', normalBalance: 'credit', openingBalanceCents: 0 },
  { code: '3020', name: 'Retained Earnings', type: 'equity', normalBalance: 'credit', openingBalanceCents: 0 },
  { code: '3030', name: "Owner's Draw", type: 'equity', normalBalance: 'debit', openingBalanceCents: 0 },

  // ── INCOME (4000s) ──────────────────────────────────────────────────────────
  { code: '4011', name: 'Salary — Primary Employer', type: 'income', normalBalance: 'credit' },
  { code: '4012', name: 'Salary — Other / Secondary', type: 'income', normalBalance: 'credit' },
  { code: '4021', name: 'Book Sales — Strategic Honesty Publishing', type: 'income', normalBalance: 'credit', taxSchedule: 'C' },
  { code: '4022', name: 'Consulting / Coaching Income', type: 'income', normalBalance: 'credit', taxSchedule: 'C' },
  { code: '4023', name: 'Speaking Fees', type: 'income', normalBalance: 'credit', taxSchedule: 'C' },
  { code: '4031', name: 'Rental Income — Sabin Thapa (Zelle)', type: 'income', normalBalance: 'credit', taxSchedule: 'E' },
  { code: '4032', name: 'Rental Income — Himalayan Homes / Frank', type: 'income', normalBalance: 'credit', taxSchedule: 'E' },
  { code: '4041', name: 'Zelle Received — Family', type: 'income', normalBalance: 'credit' },
  { code: '4042', name: 'Reimbursements Received', type: 'income', normalBalance: 'credit' },
  { code: '4051', name: 'Bank Interest Income', type: 'income', normalBalance: 'credit', taxSchedule: 'B' },
  { code: '4052', name: 'Investment Returns — Acorns', type: 'income', normalBalance: 'credit', taxSchedule: 'B' },

  // ── ESSENTIAL EXPENSES (5000s) ──────────────────────────────────────────────
  { code: '5011', name: 'Rent — NSM / Cooper', type: 'expense', normalBalance: 'debit' },
  { code: '5012', name: 'Renters Insurance', type: 'expense', normalBalance: 'debit' },
  { code: '5013', name: 'Home Maintenance', type: 'expense', normalBalance: 'debit' },
  { code: '5021', name: 'Groceries', type: 'expense', normalBalance: 'debit' },
  { code: '5022', name: 'Household Supplies', type: 'expense', normalBalance: 'debit' },
  { code: '5031', name: 'Gas & Electric — CenterPoint Energy', type: 'expense', normalBalance: 'debit' },
  { code: '5032', name: 'Internet & Cable — Xfinity', type: 'expense', normalBalance: 'debit' },
  { code: '5033', name: 'Solar System Payment — ConcertFin', type: 'expense', normalBalance: 'debit' },
  { code: '5034', name: 'Water & Sewer', type: 'expense', normalBalance: 'debit' },
  { code: '5041', name: 'Tesla Auto Loan — Principal', type: 'expense', normalBalance: 'debit' },
  { code: '5042', name: 'Tesla Auto Loan — Interest', type: 'expense', normalBalance: 'debit' },
  { code: '5043', name: 'Fuel — Costco Gas', type: 'expense', normalBalance: 'debit' },
  { code: '5044', name: 'Auto Insurance — Nationwide', type: 'expense', normalBalance: 'debit' },
  { code: '5045', name: 'Auto Maintenance', type: 'expense', normalBalance: 'debit' },
  { code: '5051', name: 'Life Insurance — NYLife of Arizona', type: 'expense', normalBalance: 'debit' },
  { code: '5052', name: 'Health Insurance', type: 'expense', normalBalance: 'debit' },
  { code: '5061', name: 'Medical', type: 'expense', normalBalance: 'debit' },
  { code: '5062', name: 'Pharmacy — CVS', type: 'expense', normalBalance: 'debit' },
  { code: '5063', name: 'Medical Equipment — AdaptHealth', type: 'expense', normalBalance: 'debit' },
  { code: '5071', name: 'T-Mobile', type: 'expense', normalBalance: 'debit' },
  { code: '5072', name: 'Xfinity Mobile', type: 'expense', normalBalance: 'debit' },
  { code: '5081', name: 'Affirm BNPL', type: 'expense', normalBalance: 'debit' },

  // ── DISCRETIONARY EXPENSES (6000s) ──────────────────────────────────────────
  { code: '6011', name: 'Restaurants', type: 'expense', normalBalance: 'debit' },
  { code: '6012', name: 'Fast Food', type: 'expense', normalBalance: 'debit' },
  { code: '6013', name: 'Coffee & Cafes', type: 'expense', normalBalance: 'debit' },
  { code: '6021', name: 'Home Depot', type: 'expense', normalBalance: 'debit' },
  { code: '6022', name: 'Menards', type: 'expense', normalBalance: 'debit' },
  { code: '6031', name: 'Amazon Prime', type: 'expense', normalBalance: 'debit' },
  { code: '6032', name: 'Google One', type: 'expense', normalBalance: 'debit' },
  { code: '6033', name: 'Walmart+', type: 'expense', normalBalance: 'debit' },
  { code: '6034', name: 'Apple Services', type: 'expense', normalBalance: 'debit' },
  { code: '6035', name: 'Other Subscriptions', type: 'expense', normalBalance: 'debit' },
  { code: '6041', name: 'ChatGPT / OpenAI', type: 'expense', normalBalance: 'debit', taxSchedule: 'C', isDeductible: true },
  { code: '6042', name: 'HeyGen', type: 'expense', normalBalance: 'debit', taxSchedule: 'C', isDeductible: true },
  { code: '6043', name: 'Pictory AI', type: 'expense', normalBalance: 'debit', taxSchedule: 'C', isDeductible: true },
  { code: '6044', name: 'Other AI Tools', type: 'expense', normalBalance: 'debit', taxSchedule: 'C', isDeductible: true },
  { code: '6051', name: 'Xperience Fitness', type: 'expense', normalBalance: 'debit' },
  { code: '6061', name: 'Movies & Events', type: 'expense', normalBalance: 'debit' },
  { code: '6071', name: 'JustFab', type: 'expense', normalBalance: 'debit' },
  { code: '6072', name: 'Other Clothing', type: 'expense', normalBalance: 'debit' },
  { code: '6081', name: 'Amazon Marketplace', type: 'expense', normalBalance: 'debit' },
  { code: '6082', name: 'Other Online Shopping', type: 'expense', normalBalance: 'debit' },
  { code: '6091', name: 'Zelle Sent — Family', type: 'expense', normalBalance: 'debit' },
  { code: '6092', name: 'Charitable Giving', type: 'expense', normalBalance: 'debit', taxSchedule: 'A' },
  { code: '6101', name: 'Vehicle / License Fees', type: 'expense', normalBalance: 'debit' },
  { code: '6102', name: 'Postage & Shipping', type: 'expense', normalBalance: 'debit' },
  { code: '6103', name: 'Miscellaneous', type: 'expense', normalBalance: 'debit' },

  // ── INTEREST & TAXES (7000s) ─────────────────────────────────────────────────
  { code: '7011', name: "CC Interest — Sam's Club", type: 'expense', normalBalance: 'debit' },
  { code: '7012', name: 'CC Interest — Costco Visa', type: 'expense', normalBalance: 'debit' },
  { code: '7013', name: 'CC Interest — BofA Visa', type: 'expense', normalBalance: 'debit' },
  { code: '7014', name: 'CC Interest — Amazon Visa', type: 'expense', normalBalance: 'debit' },
  { code: '7015', name: 'CC Interest — Other', type: 'expense', normalBalance: 'debit' },
  { code: '7021', name: 'Federal Income Tax', type: 'expense', normalBalance: 'debit' },
  { code: '7022', name: 'State Income Tax — Minnesota', type: 'expense', normalBalance: 'debit' },
  { code: '7023', name: 'Self-Employment Tax', type: 'expense', normalBalance: 'debit', taxSchedule: 'SE' },
];

async function seedCOA() {
  console.log('🌱 Seeding Chart of Accounts...');
  console.log(`   ${COA.length} accounts to insert`);

  let inserted = 0;
  let skipped = 0;

  for (const account of COA) {
    try {
      await db.insert(schema.accounts).values({
        code: account.code,
        name: account.name,
        type: account.type,
        subtype: account.subtype ?? null,
        institution: account.institution ?? null,
        accountRef: account.accountRef ?? null,
        isActive: account.isActive ?? true,
        taxSchedule: account.taxSchedule ?? null,
        isDeductible: account.isDeductible ?? false,
        normalBalance: account.normalBalance,
        openingBalanceCents: account.openingBalanceCents ?? 0,
      }).onConflictDoNothing();
      inserted++;
    } catch {
      skipped++;
    }
  }

  console.log(`✅ Inserted: ${inserted} accounts`);
  if (skipped > 0) console.log(`⏭️  Skipped (already exist): ${skipped}`);
}

async function postOpeningBalances() {
  console.log('\n📒 Posting opening balance journal entries...');

  // Get system user (first user in DB)
  const users = await db.select().from(schema.users).limit(1);
  if (!users[0]) {
    console.log('⚠️  No users found — sign in to the app first, then run this script again');
    return;
  }
  const userId = users[0].id;

  // Get all accounts with opening balances
  const accounts = await db.select().from(schema.accounts);
  const accountMap = new Map(accounts.map(a => [a.code, a]));

  // Opening balance accounts with non-zero balances
  const openingAccounts = COA.filter(a => (a.openingBalanceCents ?? 0) > 0);

  if (openingAccounts.length === 0) {
    console.log('ℹ️  No opening balances to post');
    return;
  }

  // Build journal entry lines
  // Assets (debit normal) → DR asset, CR Opening Balance Equity
  // Liabilities (credit normal) → DR Opening Balance Equity, CR liability
  const lines: { accountId: string; amountCents: number; side: 'debit' | 'credit'; memo: string }[] = [];
  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const acct of openingAccounts) {
    const dbAccount = accountMap.get(acct.code);
    if (!dbAccount) continue;

    const cents = acct.openingBalanceCents!;

    if (acct.type === 'asset') {
      lines.push({ accountId: dbAccount.id, amountCents: cents, side: 'debit', memo: 'Opening balance' });
      totalAssets += cents;
    } else if (acct.type === 'liability') {
      lines.push({ accountId: dbAccount.id, amountCents: cents, side: 'credit', memo: 'Opening balance' });
      totalLiabilities += cents;
    }
  }

  // Balancing entry to Opening Balance Equity
  const equityAccount = accountMap.get('3010');
  if (!equityAccount) {
    console.log('❌ Opening Balance Equity account (3010) not found');
    return;
  }

  const netEquity = totalAssets - totalLiabilities;
  if (netEquity > 0) {
    lines.push({ accountId: equityAccount.id, amountCents: netEquity, side: 'credit', memo: 'Net opening equity' });
  } else if (netEquity < 0) {
    lines.push({ accountId: equityAccount.id, amountCents: Math.abs(netEquity), side: 'debit', memo: 'Net opening equity' });
  }

  // Validate balance
  const totalDebits = lines.filter(l => l.side === 'debit').reduce((s, l) => s + l.amountCents, 0);
  const totalCredits = lines.filter(l => l.side === 'credit').reduce((s, l) => s + l.amountCents, 0);

  if (totalDebits !== totalCredits) {
    console.log(`❌ Opening balances do not balance: DR ${totalDebits} vs CR ${totalCredits}`);
    return;
  }

  // Insert journal entry
  const entryId = crypto.randomUUID();
  await db.insert(schema.journalEntries).values({
    id: entryId,
    entryDate: new Date('2026-01-01'),
    description: 'Opening balances — January 2026',
    reference: 'MILESTONE-0-DISCOVERY',
    isOpening: true,
    createdBy: userId,
  });

  await db.insert(schema.journalEntryLines).values(lines.map(l => ({
    journalEntryId: entryId,
    accountId: l.accountId,
    amountCents: l.amountCents,
    side: l.side,
    memo: l.memo,
  })));

  console.log(`✅ Opening balance entry posted`);
  console.log(`   Total assets:      $${(totalAssets / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`   Total liabilities: $${(totalLiabilities / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`   Net equity:        $${(netEquity / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`   Entry balances:    ${totalDebits === totalCredits ? '✅ YES' : '❌ NO'}`);
}

async function main() {
  console.log('════════════════════════════════════════');
  console.log('  PFOS — Milestone 2: Seed COA + Opening Balances');
  console.log('════════════════════════════════════════\n');

  await seedCOA();
  await postOpeningBalances();

  console.log('\n════════════════════════════════════════');
  console.log('  Done! Next: npm run db:push then verify at /api/v1/reports/trial-balance');
  console.log('════════════════════════════════════════');

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
