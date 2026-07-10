import type { NormalizedTransaction } from './normalizer';

export interface TransferCandidate {
  txn: NormalizedTransaction;
  hash: string;
  isDuplicate: boolean;
  transferCandidate: boolean;
  transferPairIndex: number | null; // index in same array
}

// Flag transfer candidates within a batch
// Two transactions are a transfer pair if:
//   1. Same amount
//   2. One is debit, other is credit
//   3. Dates within 3 days
//   4. Either isTransfer=true from merchant patterns OR description matches known patterns
export function detectTransfers(
  items: { txn: NormalizedTransaction; hash: string; isDuplicate: boolean }[]
): TransferCandidate[] {
  const result: TransferCandidate[] = items.map(item => ({
    ...item,
    transferCandidate: item.txn.isTransfer,
    transferPairIndex: null,
  }));

  for (let i = 0; i < result.length; i++) {
    if (result[i].isDuplicate) continue;

    for (let j = i + 1; j < result.length; j++) {
      if (result[j].isDuplicate) continue;

      const a = result[i].txn;
      const b = result[j].txn;

      // Must be opposite directions
      if (a.direction === b.direction) continue;

      // Must match amount
      if (a.amountCents !== b.amountCents) continue;

      // Must be within 3 days
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      const diffDays = Math.abs(dateA - dateB) / (1000 * 60 * 60 * 24);
      if (diffDays > 3) continue;

      // Mark both as transfer candidates
      result[i].transferCandidate = true;
      result[j].transferCandidate = true;
      result[i].transferPairIndex = j;
      result[j].transferPairIndex = i;
      break;
    }
  }

  return result;
}
