import type { StatementPeriod, ParsedTransaction } from './types';
import type { ExtractedPdf } from '../pdf-extractor';

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : Math.round(n * 100);
}

function parseMMDD(text: string): { month: number; day: number } | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  return { month: parseInt(m[1]!), day: parseInt(m[2]!) };
}

function resolveYear(month: number, period: StatementPeriod): number {
  return month > period.month ? period.year - 1 : period.year;
}

// WF Credit Card parser
// Layout: Trans Date | Post Date | Ref# | Description | Credits | Charges
export function parseWFCreditCard(
  pdf: ExtractedPdf,
  period: StatementPeriod
): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const items = pdf.items as Array<{ x: number; y: number; text: string; page: number }>;

  // Find transaction section — look for "Transactions" header
  const txnHeaderIdx = items.findIndex(i => /^transactions$/i.test(i.text.trim()));
  if (txnHeaderIdx < 0) return results;

  // Only process items after the Transactions header
  const txnItems = items.slice(txnHeaderIdx);

  // Group by y coordinate
  const rowMap = new Map<number, typeof items>();
  for (const item of txnItems) {
    const yKey = Math.round(item.y * 2) / 2;
    if (!rowMap.has(yKey)) rowMap.set(yKey, []);
    rowMap.get(yKey)!.push(item);
  }

  const rows = Array.from(rowMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, items]) => items.sort((a, b) => a.x - b.x));

  for (const row of rows) {
    // Trans date at x~82, must be MM/DD format
    const dateItem = row.find(i => i.x >= 78 && i.x <= 95);
    if (!dateItem) continue;
    const parsed = parseMMDD(dateItem.text);
    if (!parsed) continue;

    // Credits at x~501, Charges at x~555
    const creditItem = row.find(i => i.x >= 495 && i.x <= 530);
    const chargeItem = row.find(i => i.x >= 548 && i.x <= 580);
    const creditAmt = creditItem ? parseAmount(creditItem.text) : null;
    const chargeAmt = chargeItem ? parseAmount(chargeItem.text) : null;

    if (creditAmt === null && chargeAmt === null) continue;

    // Description at x~245
    const descItems = row.filter(i => i.x >= 240 && i.x <= 495);
    const desc = descItems.map(i => i.text).join(' ').trim();
    if (!desc) continue;

    // Skip totals rows
    if (/^total/i.test(desc)) continue;

    const year = resolveYear(parsed.month, period);
    const isoDate = `${year}-${String(parsed.month).padStart(2,'0')}-${String(parsed.day).padStart(2,'0')}`;

    results.push({
      date: isoDate,
      rawDescription: desc,
      amountCents: creditAmt ?? chargeAmt ?? 0,
      direction: creditAmt !== null ? 'credit' : 'debit',
    });
  }

  return results;
}

// USB Credit Card parser  
// Layout: Post Date | Trans Date | Ref# | Description | Amount [CR]
// Sections: "Purchases and Other Debits" = debit, "Payments and Other Credits" = credit, "Fees" = debit
export function parseUSBCreditCard(
  pdf: ExtractedPdf,
  period: StatementPeriod
): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const items = pdf.items as Array<{ x: number; y: number; text: string; page: number }>;

  // Find "Transactions" header
  const txnHeaderIdx = items.findIndex(i => /^transactions$/i.test(i.text.trim()));
  if (txnHeaderIdx < 0) return results;

  const txnItems = items.slice(txnHeaderIdx);

  // Group items into rows with 1.5px tolerance
  // Items within 1.5px of each other vertically are on the same row
  const rows: Array<Array<{ x: number; y: number; text: string; page: number }>> = [];
  const sorted = [...txnItems].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);

  for (const item of sorted) {
    const lastRow = rows[rows.length - 1];
    const lastY = lastRow?.[0]?.y ?? -999;
    if (lastRow && Math.abs(item.y - lastY) <= 1.5) {
      lastRow.push(item);
    } else {
      rows.push([item]);
    }
  }

  // Sort each row by x
  for (const row of rows) row.sort((a, b) => a.x - b.x);

  let currentSection: 'debit' | 'credit' = 'debit';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowText = row.map(r => r.text.trim()).join(' ');

    // Detect section headers
    if (/purchases and other debits/i.test(rowText) || /^fees$/i.test(rowText.trim())) {
      currentSection = 'debit';
      continue;
    }
    if (/payments and other credits/i.test(rowText)) {
      currentSection = 'credit';
      continue;
    }

    // Skip total/header rows
    if (/^total|^post|^trans|^date|^ref|^transaction|year-to-date|fees charged|interest charged/i.test(rowText)) continue;

    // Date: "12" "/" "29" at x~64-80
    const dateParts = row.filter(r => r.x >= 60 && r.x <= 90).map(r => r.text.trim()).join('');
    const dateMatch = dateParts.match(/^(\d{2})\/(\d{2})$/);
    if (!dateMatch) continue;

    const month = parseInt(dateMatch[1]!);
    const day = parseInt(dateMatch[2]!);

    // Amount at x~465-490
    const amtItem = row.find(r => r.x >= 460 && /^\$[\d,]+\.\d{2}$/.test(r.text.trim()));
    if (!amtItem) continue;
    const amt = parseAmount(amtItem.text);
    if (!amt) continue;

    // Description at x~172-460
    const desc = row.filter(r => r.x >= 168 && r.x < 460).map(r => r.text.trim()).filter(Boolean).join(' ');
    if (!desc) continue;

    const year = resolveYear(month, period);
    const isoDate = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

    results.push({
      date: isoDate,
      rawDescription: desc,
      amountCents: amt,
      direction: currentSection,
    });
  }

  return results;
}
