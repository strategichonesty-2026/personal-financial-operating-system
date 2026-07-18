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
// Layout: Post Date | Trans Date | Ref# | Description | Amount CR
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

  // Group by y coordinate with tolerance
  const rowMap = new Map<number, typeof items>();
  for (const item of txnItems) {
    const yKey = Math.round(item.y * 2) / 2;
    if (!rowMap.has(yKey)) rowMap.set(yKey, []);
    rowMap.get(yKey)!.push(item);
  }

  const rows = Array.from(rowMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([y, items]) => ({ y, items: items.sort((a, b) => a.x - b.x) }));

  let i = 0;
  while (i < rows.length) {
    const row = rows[i]!;
    const rowItems = row.items;

    // Post date at x~64, format "07" "/" "08" split items
    const dateItems = rowItems.filter(i => i.x >= 60 && i.x <= 85 && /^\d{2}$/.test(i.text.trim()));
    if (dateItems.length === 0) { i++; continue; }

    // Look for slash between date parts
    const slashItem = rowItems.find(i => i.x >= 74 && i.x <= 85 && i.text.trim() === '/');
    if (!slashItem) { i++; continue; }

    // Reconstruct date from split items: "07" "/" "08"
    const dateParts = rowItems.filter(i => i.x >= 60 && i.x <= 90).map(i => i.text.trim()).join('');
    const dateMatch = dateParts.match(/(\d{2})\/(\d{2})/);
    if (!dateMatch) { i++; continue; }

    const month = parseInt(dateMatch[1]!);
    const day = parseInt(dateMatch[2]!);

    // Amount at x~480+, may have CR on next item
    const amtItem = rowItems.find(i => i.x >= 475 && /\$[\d,]+\.\d{2}/.test(i.text));
    if (!amtItem) { i++; continue; }

    const amt = parseAmount(amtItem.text);
    if (amt === null) { i++; continue; }

    // Check for CR suffix — means credit (payment)
    const crItem = rowItems.find(i => i.x >= 510 && i.text.trim() === 'CR');
    // Also check next row for CR
    const nextRowCR = rows[i+1]?.items.find(j => j.x >= 510 && j.text.trim() === 'CR' && Math.abs(j.y - row.y) <= 8);
    const isCredit = crItem !== undefined || nextRowCR !== undefined;

    // Description at x~172
    const descItems = rowItems.filter(i => i.x >= 168 && i.x <= 475);
    let desc = descItems.map(i => i.text).join(' ').trim();

    // Check next row for description continuation
    if (rows[i+1]) {
      const nextDesc = rows[i+1]!.items.filter(j => j.x >= 168 && j.x <= 475 && !/^\d{2}$/.test(j.text.trim()));
      if (nextDesc.length > 0 && !rows[i+1]!.items.some(j => j.x >= 60 && j.x <= 85 && /^\d{2}$/.test(j.text.trim()))) {
        desc += ' ' + nextDesc.map(j => j.text).join(' ').trim();
      }
    }

    if (!desc || /^total/i.test(desc)) { i++; continue; }

    const year = resolveYear(month, period);
    const isoDate = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

    results.push({
      date: isoDate,
      rawDescription: desc,
      amountCents: amt,
      direction: isCredit ? 'credit' : 'debit',
    });

    i++;
  }

  return results;
}
