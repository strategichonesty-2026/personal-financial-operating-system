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

  // Also detect duplicates within the current batch
  const seenInBatch = new Set<string>();

  return withHashes.map(item => {
    const isDuplicate = existingHashes.has(item.hash) || seenInBatch.has(item.hash);
    seenInBatch.add(item.hash);
    return { ...item, isDuplicate };
  });
}
