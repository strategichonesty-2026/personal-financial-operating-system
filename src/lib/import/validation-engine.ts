/**
 * PFOS Import Validation Engine
 * 
 * Runs automatically after every import.
 * Compares imported transaction totals against PDF-stated balances.
 * Flags discrepancies immediately so issues are caught at import time,
 * not after reconciliation fails.
 * 
 * LESSON LEARNED LOG (living document):
 * 
 * 2026-07-13 | BofA comma amount bug
 *   Problem:  Amounts like $1,080.92 parsed as $1.00
 *   Cause:    parseFloat('1,080.92') stops at comma → returns 1
 *   Fix:      Strip commas AFTER regex test, not before. Use parseAmount() everywhere.
 *   Rule:     NEVER call parseFloat() directly on raw PDF text. Always use parseAmount().
 * 
 * 2026-07-13 | BofA combined PDF - wrong account balances
 *   Problem:  1961 checking and 6951 savings had identical (wrong) balances
 *   Cause:    Balance extractor found first "Beginning balance" in PDF (checking's)
 *             and used it for both accounts
 *   Fix:      Scope balance search to account section using "Account number:" header
 *   Rule:     For combined PDFs, always scope extraction to account section, not full PDF.
 * 
 * 2026-07-13 | Duplicate batches on re-import
 *   Problem:  Re-importing created new batch; old batch still had wrong data
 *   Cause:    Duplicate detection uses transaction hash, not batch-level dedup
 *   Fix:      Always DELETE old batch before re-importing
 *   Rule:     If "0 staged, N dupes skipped" → old batch exists. Delete it first.
 * 
 * 2026-07-13 | Next.js server caches old parser code
 *   Problem:  Parser fix applied but imports still used old code
 *   Cause:    Next.js dev server caches compiled modules
 *   Fix:      pkill -f "next dev" && npm run dev && rm -rf .next if still stale
 *   Rule:     After ANY parser code change, restart the dev server before testing.
 */

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
  calculatedClosingCents: number | null;
  expectedClosingCents: number | null;
  differenceCents: number | null;
  creditTotalCents: number;
  debitTotalCents: number;
}

export interface ValidationWarning {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationInput {
  institution: string;
  filename: string;
  parsed: { amountCents: number; direction: 'debit' | 'credit' }[];
  openingBalanceCents: number | null;
  closingBalanceCents: number | null;
  inserted: number;
  duplicates: number;
}

export function validateImport(input: ValidationInput): ValidationResult {
  const { institution, filename, parsed, openingBalanceCents, closingBalanceCents, inserted, duplicates } = input;
  const warnings: ValidationWarning[] = [];

  // Calculate totals from imported transactions
  const creditTotalCents = parsed
    .filter(t => t.direction === 'credit')
    .reduce((sum, t) => sum + t.amountCents, 0);
  const debitTotalCents = parsed
    .filter(t => t.direction === 'debit')
    .reduce((sum, t) => sum + t.amountCents, 0);

  // Rule 1: Check for suspiciously small amounts (comma bug detector)
  // Any transaction amount that is a round dollar under $10 on a non-trivial account
  // is suspicious — could be a truncated comma amount
  const suspiciousAmounts = parsed.filter(t => 
    t.amountCents > 0 && 
    t.amountCents < 1000 && 
    t.amountCents % 100 === 0 &&
    institution === 'bofa' // BofA is where we've seen this
  );
  if (suspiciousAmounts.length > 0) {
    warnings.push({
      code: 'SUSPICIOUS_ROUND_AMOUNTS',
      message: `${suspiciousAmounts.length} transaction(s) have suspiciously small round amounts (e.g. $1.00, $2.00). Possible comma parsing bug. Check amounts > $999.`,
      severity: 'warning',
    });
  }

  // Rule 2: Validate balance math if we have opening and closing
  let calculatedClosingCents: number | null = null;
  let differenceCents: number | null = null;

  if (openingBalanceCents !== null && closingBalanceCents !== null) {
    // For asset accounts (checking/savings): closing = opening + credits - debits
    // For liability accounts (CC): closing = opening + debits - credits
    const isLiability = filename.toLowerCase().includes('cc') || 
                        filename.toLowerCase().includes('credit');
    
    if (isLiability) {
      calculatedClosingCents = openingBalanceCents + debitTotalCents - creditTotalCents;
    } else {
      calculatedClosingCents = openingBalanceCents + creditTotalCents - debitTotalCents;
    }

    differenceCents = calculatedClosingCents - closingBalanceCents;

    if (differenceCents !== 0) {
      const diffDollars = (Math.abs(differenceCents) / 100).toFixed(2);
      warnings.push({
        code: 'BALANCE_MISMATCH',
        message: `Imported transactions don't match PDF balance. Off by $${diffDollars}. ` +
          `Expected closing: $${(closingBalanceCents/100).toFixed(2)}, ` +
          `Calculated: $${(calculatedClosingCents/100).toFixed(2)}. ` +
          `Check for missing or incorrect transactions.`,
        severity: 'error',
      });
    }
  } else {
    warnings.push({
      code: 'NO_BALANCES',
      message: 'Opening/closing balances not extracted from PDF. Cannot validate totals. Reconciliation will require manual balance entry.',
      severity: 'warning',
    });
  }

  // Rule 3: All dupes, nothing inserted
  if (inserted === 0 && duplicates > 0) {
    warnings.push({
      code: 'ALL_DUPLICATES',
      message: `All ${duplicates} transactions were duplicates — nothing new imported. If re-importing after a fix, delete the old batch first.`,
      severity: 'warning',
    });
  }

  // Rule 3b: Required fields per institution
  const requiredFieldChecks: { field: string; value: unknown; institution?: string }[] = [
    { field: 'periodStart', value: input.periodStart },
    { field: 'periodEnd',   value: input.periodEnd },
    { field: 'openingBalance', value: openingBalanceCents },
    { field: 'closingBalance', value: closingBalanceCents },
  ];
  for (const check of requiredFieldChecks) {
    if (check.value === null || check.value === undefined) {
      warnings.push({
        code: `MISSING_${check.field.toUpperCase()}`,
        message: `Could not extract ${check.field} from PDF. ` +
          `Add extraction pattern for ${institution} in pdf-extractor.ts or balance-extractor.ts.`,
        severity: 'warning',
      });
    }
  }

  // Rule 4: No transactions parsed at all
  if (parsed.length === 0) {
    warnings.push({
      code: 'NO_TRANSACTIONS',
      message: 'No transactions were parsed from this PDF. Parser may not support this statement format.',
      severity: 'error',
    });
  }

  const hasErrors = warnings.some(w => w.severity === 'error');

  return {
    valid: !hasErrors,
    warnings,
    calculatedClosingCents,
    expectedClosingCents: closingBalanceCents,
    differenceCents,
    creditTotalCents,
    debitTotalCents,
  };
}
