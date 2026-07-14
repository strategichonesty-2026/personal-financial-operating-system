import { db } from '@/lib/db';
import {
  journalEntries, journalEntryLines,
  reconciliations, reconciliationItems, accounts,
} from '@/lib/db/schema';
import { eq, and, gte, lte } from 'drizzle-orm';

export interface StatementTransaction {
  description: string;
  date: string;
  amountCents: number;
  direction: 'debit' | 'credit';
}

export interface ReconcileInput {
  accountId:             string;
  userId:                string;
  periodStart:           string;
  periodEnd:             string;
  openingBalanceCents:   number;
  closingBalanceCents:   number;
  statementTransactions: StatementTransaction[];
}

export interface Suggestion {
  category: 'interest' | 'fee' | 'timing' | 'duplicate' | 'missing' | 'unimported';
  description: string;
  amountCents?: number;
  probability: number;
}

export interface MatchedItem {
  matchType:             'exact' | 'fuzzy' | 'unmatched_statement' | 'unmatched_ledger';
  matchScore:            number;
  statementDescription?: string;
  statementDate?:        string;
  statementAmountCents?: number;
  statementDirection?:   'debit' | 'credit';
  journalEntryId?:       string;
  ledgerDescription?:    string;
  ledgerAmountCents?:    number;
}

export interface ReconcileResult {
  reconciliationId:        string;
  statementCreditsCents:   number;
  statementDebitsCents:    number;
  calculatedBalanceCents:  number;
  differenceCents:         number;
  statementBalances:       boolean;
  matchedCount:            number;
  unmatchedStatementCount: number;
  unmatchedLedgerCount:    number;
  suggestions:             Suggestion[];
  confidenceScore:         number;
  status:                  'complete' | 'flagged';
  items:                   MatchedItem[];
}

const DATE_TOLERANCE_MS = 3 * 24 * 60 * 60 * 1000;

function normalizeDesc(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function descSimilarity(a: string, b: string): number {
  const na = new Set(normalizeDesc(a).split(' ').filter(w => w.length > 2));
  const nb = new Set(normalizeDesc(b).split(' ').filter(w => w.length > 2));
  const intersection = Array.from(na).filter(w => nb.has(w));
  const union = new Set(Array.from(na).concat(Array.from(nb)));
  return union.size === 0 ? 0 : Math.round((intersection.length / union.size) * 100);
}

function calcMatchScore(
  stmt: StatementTransaction,
  ledger: { description: string; amountCents: number; entryDate: Date; direction: string }
): number {
  let score = 0;
  if (stmt.amountCents === ledger.amountCents) score += 40;
  else if (Math.abs(stmt.amountCents - ledger.amountCents) < 100) score += 20;
  if (stmt.direction === ledger.direction) score += 20;
  const dateDiff = Math.abs(new Date(stmt.date).getTime() - ledger.entryDate.getTime());
  if (dateDiff === 0) score += 25;
  else if (dateDiff <= DATE_TOLERANCE_MS) score += 15;
  score += Math.round(descSimilarity(stmt.description, ledger.description) * 0.15);
  return Math.min(score, 100);
}

function generateSuggestions(
  unmatchedStmt: StatementTransaction[],
  unmatchedLedger: Array<{ description: string; amountCents: number }>
): Suggestion[] {
  const out: Suggestion[] = [];
  for (const s of unmatchedStmt) {
    const d = s.description.toLowerCase();
    if (d.includes('interest') || d.includes('apy')) {
      out.push({ category: 'interest', description: `Interest $${(s.amountCents/100).toFixed(2)} not in PFOS`, amountCents: s.amountCents, probability: 95 });
    } else if (d.includes('fee') || d.includes('service charge')) {
      out.push({ category: 'fee', description: `Bank fee $${(s.amountCents/100).toFixed(2)} not in PFOS`, amountCents: s.amountCents, probability: 90 });
    } else if (d.includes('zelle') || d.includes('bank of america') || d.includes('bofa')) {
      out.push({ category: 'unimported', description: `"${s.description}" — account not imported yet`, amountCents: s.amountCents, probability: 85 });
    } else if (d.includes('credit card') || d.includes('bill pay') || d.includes('online payment')) {
      out.push({ category: 'timing', description: `CC/bill payment $${(s.amountCents/100).toFixed(2)} — timing difference`, amountCents: s.amountCents, probability: 75 });
    } else {
      out.push({ category: 'missing', description: `"${s.description}" ($${(s.amountCents/100).toFixed(2)}) not in PFOS`, amountCents: s.amountCents, probability: 60 });
    }
  }
  for (const l of unmatchedLedger) {
    out.push({ category: 'timing', description: `PFOS has "${l.description}" ($${(l.amountCents/100).toFixed(2)}) not on statement`, amountCents: l.amountCents, probability: 65 });
  }
  return out.sort((a, b) => b.probability - a.probability);
}

function calcConfidence(total: number, matched: number, diff: number, suggestions: Suggestion[]): number {
  if (total === 0) return 0;
  let score = Math.round((matched / total) * 70);
  if (diff === 0) score += 20;
  else if (Math.abs(diff) < 100) score += 10;
  score -= suggestions.filter(s => s.probability >= 80).length * 5;
  return Math.max(0, Math.min(100, score));
}

export async function runReconciliation(input: ReconcileInput): Promise<ReconcileResult> {
  const { accountId, userId, periodStart, periodEnd,
          openingBalanceCents, closingBalanceCents, statementTransactions } = input;

  const start = new Date(periodStart);
  const end   = new Date(periodEnd);

  const lines = await db
    .select({
      journalEntryId: journalEntryLines.journalEntryId,
      amountCents:    journalEntryLines.amountCents,
      side:           journalEntryLines.side,
      memo:           journalEntryLines.memo,
      entryDate:      journalEntries.entryDate,
      description:    journalEntries.description,
    })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
    .where(and(
      eq(journalEntryLines.accountId, accountId),
      gte(journalEntries.entryDate, start),
      lte(journalEntries.entryDate, end)
    ));

  const ledgerItems = lines.map(l => ({
    journalEntryId: l.journalEntryId,
    description:    l.description || l.memo || '',
    amountCents:    l.amountCents,
    direction:      l.side,
    entryDate:      l.entryDate,
  }));

  // L1
  const statementCreditsCents = statementTransactions.filter(t => t.direction === 'credit').reduce((s,t) => s+t.amountCents, 0);
  const statementDebitsCents  = statementTransactions.filter(t => t.direction === 'debit').reduce((s,t) => s+t.amountCents, 0);

  // Determine account type for correct balance formula
  const accountRecord = (await db.select().from(accounts).where(eq(accounts.id, accountId)))[0];
  const isLiability = accountRecord?.type === 'liability';

  // Asset:     Opening + Credits - Debits = Closing
  // Liability: Opening + Debits - Credits = Closing (purchases increase balance, payments reduce it)
  const calculatedBalanceCents = isLiability
    ? openingBalanceCents + statementDebitsCents - statementCreditsCents
    : openingBalanceCents + statementCreditsCents - statementDebitsCents;
  const differenceCents = calculatedBalanceCents - closingBalanceCents;

  // L2 matching
  const items: MatchedItem[] = [];
  const usedLedger = new Set<number>();
  const unmatchedStmt: StatementTransaction[] = [];

  for (const stmt of statementTransactions) {
    let best = 0, bestIdx = -1;
    for (let i = 0; i < ledgerItems.length; i++) {
      if (usedLedger.has(i)) continue;
      const li = ledgerItems[i];
      if (!li) continue;
      const s = calcMatchScore(stmt, li);
      if (s > best) { best = s; bestIdx = i; }
    }
    if (bestIdx >= 0 && best >= 40) {
      usedLedger.add(bestIdx);
      const l = ledgerItems[bestIdx];
      if (!l) { unmatchedStmt.push(stmt); continue; }
      items.push({
        matchType: best === 100 ? 'exact' : 'fuzzy',
        matchScore: best,
        statementDescription: stmt.description,
        statementDate: stmt.date,
        statementAmountCents: stmt.amountCents,
        statementDirection: stmt.direction,
        journalEntryId: l.journalEntryId,
        ledgerDescription: l.description,
        ledgerAmountCents: l.amountCents,
      });
    } else {
      unmatchedStmt.push(stmt);
    }
  }

  // L3
  const unmatchedLedger = ledgerItems.filter((_, i) => !usedLedger.has(i));
  for (const s of unmatchedStmt) {
    items.push({ matchType: 'unmatched_statement', matchScore: 0, statementDescription: s.description, statementDate: s.date, statementAmountCents: s.amountCents, statementDirection: s.direction });
  }
  for (const l of unmatchedLedger) {
    items.push({ matchType: 'unmatched_ledger', matchScore: 0, journalEntryId: l.journalEntryId, ledgerDescription: l.description, ledgerAmountCents: l.amountCents });
  }

  // L4 + L5
  const suggestions = generateSuggestions(unmatchedStmt, unmatchedLedger);
  const matchedCount = items.filter(i => i.matchType === 'exact' || i.matchType === 'fuzzy').length;
  const confidenceScore = calcConfidence(statementTransactions.length, matchedCount, differenceCents, suggestions);
  const status = differenceCents === 0 ? 'complete' : 'flagged';

  // L6 — save
  const reconciliationId = crypto.randomUUID();
  await db.insert(reconciliations).values({
    id: reconciliationId, accountId,
    periodStart: start, periodEnd: end,
    openingBalanceCents, closingBalanceCents,
    statementCreditsCents, statementDebitsCents,
    calculatedBalanceCents, differenceCents,
    matchedCount,
    unmatchedStatementCount: unmatchedStmt.length,
    unmatchedLedgerCount: unmatchedLedger.length,
    confidenceScore, status,
    reconciledBy: userId, reconciledAt: new Date(),
  });

  for (const item of items) {
    const sug = suggestions.find(s => s.amountCents === item.statementAmountCents);
    await db.insert(reconciliationItems).values({
      reconciliationId,
      statementDescription: item.statementDescription,
      statementDate: item.statementDate ? new Date(item.statementDate) : undefined,
      statementAmountCents: item.statementAmountCents,
      statementDirection: item.statementDirection,
      journalEntryId: item.journalEntryId,
      matchType: item.matchType,
      matchScore: item.matchScore,
      suggestion: sug?.description,
      suggestionCategory: sug?.category,
    });
  }

  return {
    reconciliationId, statementCreditsCents, statementDebitsCents,
    calculatedBalanceCents, differenceCents,
    statementBalances: differenceCents === 0,
    matchedCount, unmatchedStatementCount: unmatchedStmt.length,
    unmatchedLedgerCount: unmatchedLedger.length,
    suggestions, confidenceScore, status, items,
  };
}
