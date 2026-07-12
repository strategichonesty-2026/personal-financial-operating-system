import { db } from '@/lib/db';
import { importBatches, parserAudit } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { extractPdfText, detectInstitution } from './pdf-extractor';
import { getParser } from './parsers';
import { parseWellsFargo } from './parsers/wells-fargo';
import { parseCiti }       from './parsers/citi';
import { parseSynchrony }  from './parsers/synchrony';
import { parseChase }      from './parsers/chase';
import { parseUSBank }     from './parsers/us-bank';
import { loadPatterns, normalizeTransaction } from './normalizer';
import { filterDuplicates } from './duplicate-detector';
import { detectTransfers } from './transfer-detector';
import { writeStagedTransactions } from './writer';
import { extractBalances } from './balance-extractor';

export interface PipelineResult {
  batchId: string;
  institution: string;
  pages: number;
  parsed: number;
  inserted: number;
  duplicates: number;
  rawItemCount: number;
  rowsGrouped: number;
  transfersFound: number;
  openingBalanceCents: number | null;
  closingBalanceCents: number | null;
  periodStart: string;
  periodEnd: string;
  accountId: string;
}

export async function runImportPipeline(
  buffer: Buffer,
  filename: string,
  accountId: string,
  userId: string,
  statementYear: number,
  statementMonth: number,
  institutionOverride?: string | null
): Promise<PipelineResult> {
  const extracted = await extractPdfText(buffer, filename);
  const institution = institutionOverride ?? detectInstitution(extracted.text);
  if (!institution) throw new Error('Could not detect institution from PDF. Please select manually.');

  const parser = getParser(institution);
  if (!parser) throw new Error(`No parser available for institution: ${institution}`);

  const batchId = crypto.randomUUID();
  await db.insert(importBatches).values({
    id: batchId, userId, institution, accountId, filename,
    r2Key: `imports/${userId}/${batchId}/${filename}`,
    status: 'processing',
  });

  try {
    const period = { year: statementYear, month: statementMonth };
    const coordinateParsers: Record<string, typeof parseWellsFargo> = {
      wells_fargo: parseWellsFargo,
      citi:        parseCiti,
      synchrony:   parseSynchrony,
      chase:       parseChase,
      us_bank:     parseUSBank,
    };
    const coordinateParser = coordinateParsers[institution];
    const parsed = coordinateParser
      ? coordinateParser(extracted, period)
      : parser.parse(extracted.text, period);

    const patterns = await loadPatterns();
    const normalized = parsed.map(txn => normalizeTransaction(txn, patterns));
    const withDuplicates = await filterDuplicates(accountId, normalized);
    const withTransfers = detectTransfers(
      withDuplicates.map(item => ({ ...item, txn: normalizeTransaction(item.txn, patterns) }))
    );
    const { inserted, duplicates } = await writeStagedTransactions(batchId, accountId, withTransfers);
    const transfersFound = withTransfers.filter(i => i.transferCandidate).length;

    // Extract opening/closing balances from PDF text
    const balances = extractBalances(extracted, institution);

    // Compute period start/end ISO strings
    const periodStart = `${statementYear}-${String(statementMonth).padStart(2,'0')}-01`;
    const lastDay = new Date(statementYear, statementMonth, 0).getDate();
    const periodEnd = `${statementYear}-${String(statementMonth).padStart(2,'0')}-${lastDay}`;

    await db.insert(parserAudit).values({
      batchId, userId, institution, filename,
      accountId: accountId ?? null,
      statementYear, statementMonth,
      pagesExtracted:    extracted.pages,
      rawItemCount:      extracted.items.length,
      rowsGrouped:       0,
      rowsParsed:        parsed.length,
      rowsSkippedFilter: 0,
      rowsSkippedDedup:  duplicates,
      normalized:        normalized.length,
      duplicatesFound:   duplicates,
      transfersFound, inserted,
      status: 'success',
    });

    return {
      batchId, institution,
      pages: extracted.pages,
      parsed: parsed.length,
      inserted, duplicates,
      rawItemCount: extracted.items.length,
      rowsGrouped: 0,
      transfersFound,
      openingBalanceCents: balances.openingBalanceCents,
      closingBalanceCents: balances.closingBalanceCents,
      periodStart, periodEnd, accountId,
    };

  } catch (err) {
    try {
      await db.insert(parserAudit).values({
        batchId, userId,
        institution: institution ?? 'unknown',
        filename, accountId: accountId ?? null,
        statementYear, statementMonth,
        pagesExtracted: 0, rawItemCount: 0, rowsGrouped: 0,
        rowsParsed: 0, rowsSkippedFilter: 0, rowsSkippedDedup: 0,
        normalized: 0, duplicatesFound: 0, transfersFound: 0, inserted: 0,
        status: 'error', errorMessage: String(err),
      });
    } catch { /* don't mask original error */ }
    await db.update(importBatches).set({ status: 'error', errorMessage: String(err), updatedAt: new Date() }).where(eq(importBatches.id, batchId));
    throw err;
  }
}
