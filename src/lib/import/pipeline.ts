import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { importBatches, parserAudit } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { extractPdfText, detectInstitution } from './pdf-extractor';
import { getParser } from './parsers';
import { parseWellsFargo } from './parsers/wells-fargo';
import type { ExtractedPdf } from './pdf-extractor';
import type { StatementPeriod, ParsedTransaction } from './parsers/types';
import { parseCiti }       from './parsers/citi';
import { parseSynchrony }  from './parsers/synchrony';
import { parseChase }      from './parsers/chase';
import { parseUSBank }     from './parsers/us-bank';
import { parseBofa, extractBofaPeriod } from './parsers/bofa';
import { loadPatterns, normalizeTransaction } from './normalizer';
import { filterDuplicates } from './duplicate-detector';
import { detectTransfers } from './transfer-detector';
import { writeStagedTransactions } from './writer';
import { extractBalances } from './balance-extractor';
import { validateImport } from './validation-engine';

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
  periodStart: string | null;
  periodEnd: string | null;
  validation?: { valid: boolean; warnings: { code: string; message: string; severity: string }[] };
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

  // ── DUPLICATE PREVENTION ────────────────────────────────────────────────────
  // Use EXTRACT on period_start to match year+month regardless of day.
  // Also check status != 'processing' to skip incomplete batches.
  const dupCheck = await db.execute(sql`
    SELECT id, filename FROM import_batches
    WHERE user_id    = ${userId}
      AND account_id = ${accountId}
      AND status    != 'processing'
      AND EXTRACT(YEAR  FROM period_start::date) = ${statementYear}
      AND EXTRACT(MONTH FROM period_start::date) = ${statementMonth}
    LIMIT 1
  `);
  if (dupCheck.rows.length > 0) {
    throw new Error(`DUPLICATE: This account already has a statement for ${statementYear}-${String(statementMonth).padStart(2,'0')}. Originally imported as "${dupCheck.rows[0]?.filename}".`);
  }
  // ─────────────────────────────────────────────────────────────────────────

  const batchId = crypto.randomUUID();
  try {
    await db.insert(importBatches).values({
      id: batchId, userId, institution, accountId, filename,
      r2Key: `imports/${userId}/${batchId}/${filename}`,
      status: 'processing',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unique_account_period') || msg.includes('unique constraint')) {
      throw new Error(`Already imported: this account already has a statement for ${statementYear}-${String(statementMonth).padStart(2,'0')}. Delete the existing batch first to re-import.`);
    }
    throw e;
  }

  try {
    const period = { year: statementYear, month: statementMonth };
    type CoordinateParser = (pdf: ExtractedPdf, period: StatementPeriod) => ParsedTransaction[];
    const coordinateParsers: Record<string, CoordinateParser> = {
      bofa:         (pdf, period) => parseBofa(pdf, period, filename.match(/(\d{4})/)?.[1]),
      citi:        parseCiti,
      synchrony:   parseSynchrony,
      chase:       parseChase,
      us_bank:     parseUSBank,
    };
    let statementDepositsCents: number | null = null;
    let statementWithdrawalsCents: number | null = null;
    let parsed: ParsedTransaction[];
    if (institution === 'wells_fargo') {
      const wfResult = parseWellsFargo(extracted, period);
      parsed = wfResult.transactions;
      statementDepositsCents = wfResult.statementDepositsCents;
      statementWithdrawalsCents = wfResult.statementWithdrawalsCents;
    } else {
      const coordinateParser = coordinateParsers[institution];
      parsed = coordinateParser
        ? coordinateParser(extracted, period)
        : parser.parse(extracted.text, period);
    }

    const patterns = await loadPatterns();
    const normalized = parsed.map(txn => normalizeTransaction(txn, patterns));


    const withDuplicates = await filterDuplicates(accountId, normalized);
    const withTransfers = detectTransfers(
      withDuplicates.map(item => ({ ...item, txn: normalizeTransaction(item.txn, patterns) }))
    );
    const { inserted, duplicates } = await writeStagedTransactions(batchId, accountId, withTransfers);
    const transfersFound = withTransfers.filter(i => i.transferCandidate).length;

    // Extract opening/closing balances from PDF text
    const balances = extractBalances(extracted, institution, filename);

    // If all transactions are duplicates, skip validation — data already exists
    // from a prior import. Mark as done immediately.
    const allDuplicates = inserted === 0 && duplicates > 0;

    // Run import validation — catch parser errors early
    const validation = allDuplicates
      ? { valid: true, warnings: [{ code: 'ALL_DUPLICATES', message: `All ${duplicates} transactions already imported.`, severity: 'info' }] }
      : validateImport({
          institution,
          filename,
          parsed,
          openingBalanceCents: balances.openingBalanceCents,
          closingBalanceCents: balances.closingBalanceCents,
          statementDepositsCents,
          statementWithdrawalsCents,
          inserted,
          duplicates,
        });

    // Use extracted period dates from PDF; fall back to filename year only
    const filenameYear = filename.match(/20(\d{2})/)?.[0] ?? String(statementYear);
    const periodStart = extracted.meta.periodStart ?? null;
    const periodEnd   = extracted.meta.periodEnd   ?? null;

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

    // Save balances and period to import_batches
    await db.update(importBatches).set({
      openingBalanceCents: balances.openingBalanceCents ?? undefined,
      closingBalanceCents: balances.closingBalanceCents ?? undefined,
      periodStart: periodStart ?? undefined,
      periodEnd:   periodEnd   ?? undefined,
      status: validation.valid ? 'done' : 'needs_validation',
    }).where(eq(importBatches.id, batchId));

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
      validation: { valid: validation.valid, warnings: validation.warnings },
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
    // Delete the failed batch entirely — error batches with NULL period_start
    // cause duplicate check bypass and clutter the reconcile tab.
    await db.delete(importBatches).where(eq(importBatches.id, batchId));
    throw err;
  }
}

