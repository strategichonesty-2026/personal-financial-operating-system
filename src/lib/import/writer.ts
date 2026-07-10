import { db } from '@/lib/db';
import { importBatches, stagedTransactions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { TransferCandidate } from './transfer-detector';

export async function writeStagedTransactions(
  batchId: string,
  accountId: string,
  items: TransferCandidate[]
): Promise<{ inserted: number; duplicates: number }> {
  let inserted = 0;
  let duplicates = 0;

  for (const item of items) {
    const status = item.isDuplicate ? 'duplicate' : 'pending';

    await db.insert(stagedTransactions).values({
      id:                crypto.randomUUID(),
      batchId,
      accountId,
      txnDate:           item.txn.date,
      description:       item.txn.merchantName ?? item.txn.rawDescription,
      rawDescription:    item.txn.rawDescription,
      amountCents:       item.txn.amountCents,
      direction:         item.txn.direction,
      merchantName:      item.txn.merchantName,
      categoryCode:      item.txn.categoryCode,
      transferCandidate: item.transferCandidate,
      transferPairId:    null, // linked in second pass if needed
      duplicateHash:     item.hash,
      status,
    });

    if (item.isDuplicate) duplicates++;
    else inserted++;
  }

  // Update batch row count
  await db
    .update(importBatches)
    .set({ rowCount: items.length, status: 'done', updatedAt: new Date() })
    .where(eq(importBatches.id, batchId));

  return { inserted, duplicates };
}
