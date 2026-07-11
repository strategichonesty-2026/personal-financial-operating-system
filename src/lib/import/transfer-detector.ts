import type { NormalizedTransaction } from './normalizer';

export interface TransferCandidate {
  txn: NormalizedTransaction;
  hash: string;
  isDuplicate: boolean;
  transferCandidate: boolean;
  transferPairIndex: number | null;
}

export function detectTransfers(
  items: { txn: NormalizedTransaction; hash: string; isDuplicate: boolean }[]
): TransferCandidate[] {
  const result: TransferCandidate[] = items.map(item => ({
    ...item,
    transferCandidate: item.txn.isTransfer,
    transferPairIndex: null,
  }));

  for (let i = 0; i < result.length; i++) {
    const ri = result[i];
    if (!ri || ri.isDuplicate) continue;

    for (let j = i + 1; j < result.length; j++) {
      const rj = result[j];
      if (!rj || rj.isDuplicate) continue;

      const a = ri.txn;
      const b = rj.txn;

      if (a.direction === b.direction) continue;
      if (a.amountCents !== b.amountCents) continue;
      // Don't pair merchant refunds as transfers — both descriptions are merchant names
      const aIsAmazon = /amazon|amzn/i.test(a.rawDescription);
      const bIsAmazon = /amazon|amzn/i.test(b.rawDescription);
      if (aIsAmazon && bIsAmazon) continue;

      const diffDays = Math.abs(
        new Date(a.date).getTime() - new Date(b.date).getTime()
      ) / (1000 * 60 * 60 * 24);
      if (diffDays > 3) continue;

      ri.transferCandidate = true;
      rj.transferCandidate = true;
      ri.transferPairIndex = j;
      rj.transferPairIndex = i;
      break;
    }
  }

  return result;
}
