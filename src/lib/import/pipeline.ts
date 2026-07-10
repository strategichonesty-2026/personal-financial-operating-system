import { db } from '@/lib/db';
import { importBatches } from '@/lib/db/schema';
import { extractPdfText, detectInstitution } from './pdf-extractor';
import { getParser } from './parsers';
import { loadPatterns, normalizeTransaction } from './normalizer';
import { filterDuplicates } from './duplicate-detector';
import { detectTransfers } from './transfer-detector';
import { writeStagedTransactions } from './writer';

export interface PipelineResult {
  batchId: string;
  institution: string;
  pages: number;
  parsed: number;
  inserted: number;
  duplicates: number;
}

export async function runImportPipeline(
  buffer: Buffer,
  filename: string,
  accountId: string,
  userId: string,
  statementYear: number,
  statementMonth: number
): Promise<PipelineResult> {
  // 1. Extract text from PDF
  const extracted = await extractPdfText(buffer, filename);

  // 2. Detect institution
  const institution = detectInstitution(extracted.text);
  if (!institution) {
    throw new Error('Could not detect institution from PDF. Please select manually.');
  }

  // 3. Get parser
  const parser = getParser(institution);
  if (!parser) {
    throw new Error(`No parser available for institution: ${institution}`);
  }

  // 4. Create import batch record
  const batchId = crypto.randomUUID();
  await db.insert(importBatches).values({
    id:          batchId,
    userId,
    institution,
    accountId,
    filename,
    r2Key:       `imports/${userId}/${batchId}/${filename}`,
    status:      'processing',
  });

  try {
    // 5. Parse transactions
    const parsed = parser.parse(extracted.text, {
      year: statementYear,
      month: statementMonth,
    });

    // 6. Load merchant patterns
    const patterns = await loadPatterns();

    // 7. Normalize each transaction
    const normalized = parsed.map(txn => normalizeTransaction(txn, patterns));

    // 8. Detect duplicates
    const withDuplicates = await filterDuplicates(accountId, normalized);

    // 9. Detect transfers
    const withTransfers = detectTransfers(withDuplicates);

    // 10. Write to staged_transactions
    const { inserted, duplicates } = await writeStagedTransactions(
      batchId,
      accountId,
      withTransfers
    );

    return {
      batchId,
      institution,
      pages: extracted.pages,
      parsed: parsed.length,
      inserted,
      duplicates,
    };

  } catch (err) {
    // Mark batch as error
    await db
      .update(importBatches)
      .set({ status: 'error', errorMessage: String(err), updatedAt: new Date() })
      .where(({ id }) => id === batchId);
    throw err;
  }
}
