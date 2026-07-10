import { db } from '@/lib/db';
import { merchantPatterns } from '@/lib/db/schema';
import type { ParsedTransaction } from './parsers/types';

export interface NormalizedTransaction extends ParsedTransaction {
  merchantName: string | null;
  categoryCode: string | null;
  isTransfer: boolean;
}

// Load all patterns from DB once per import batch
export async function loadPatterns() {
  return db.select().from(merchantPatterns);
}

type Pattern = Awaited<ReturnType<typeof loadPatterns>>[number];

export function normalizeTransaction(
  txn: ParsedTransaction,
  patterns: Pattern[]
): NormalizedTransaction {
  const desc = txn.rawDescription.toUpperCase();

  for (const p of patterns) {
    if (matchesPattern(desc, p.pattern.toUpperCase())) {
      return {
        ...txn,
        merchantName: p.merchantName,
        categoryCode: p.defaultCategoryCode,
        isTransfer: p.isTransfer,
      };
    }
  }

  return {
    ...txn,
    merchantName: null,
    categoryCode: null,
    isTransfer: false,
  };
}

// Convert SQL LIKE pattern to JS match
// % = any sequence of chars, _ = any single char
function matchesPattern(text: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  return new RegExp(`^${escaped}$`).test(text);
}
