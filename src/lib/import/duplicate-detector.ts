import { createHash } from 'crypto';
import { db } from '@/lib/db';
import { stagedTransactions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { ParsedTransaction } from './parsers/types';

export function buildHash(
  accountId: string,
  txn: ParsedTransaction
): string {
  const raw = `${accountId}|${txn.date}|${txn.amountCents}|${txn.rawDescription}`;
  return createHash('sha256').update(raw).digest('hex');
}

export async function filterDuplicates(
  accountId: string,
  transactions: ParsedTransaction[]
): Promise<{ txn: ParsedTransaction; hash: string; isDuplicate: boolean }[]> {
  // Build hashes for all incoming transactions
  const withHashes = transactions.map(txn => ({
    txn,
    hash: buildHash(accountId, txn),
    isDuplicate: false,
  }));

  // Check existing hashes in staged_transactions
  const existingRows = await db
    .select({ duplicateHash: stagedTransactions.duplicateHash })
    .from(stagedTransactions)
    .where(eq(stagedTransactions.accountId, accountId));

  const existingHashes = new Set(existingRows.map(r => r.duplicateHash));

  // Detect duplicates within the current batch
  // For transactions sharing same hash (same date+amount+desc — e.g. weekly Acorns $5),
  // append a sequence counter so each occurrence gets a unique hash
  const seenInBatch = new Map<string, number>();

  return withHashes.map(item => {
    const count = seenInBatch.get(item.hash) ?? 0;
    seenInBatch.set(item.hash, count + 1);

    // First occurrence: check against existing; subsequent: always unique (new txn same pattern)
    if (count === 0) {
      const isDuplicate = existingHashes.has(item.hash);
      // Use original hash for first occurrence
      return { ...item, isDuplicate };
    } else {
      // Append sequence to make hash unique for repeated same-pattern transactions
      const seqHash = item.hash + `|seq${count}`;
      const isDuplicate = existingHashes.has(seqHash);
      return { ...item, hash: seqHash, isDuplicate };
    }
  });
}
