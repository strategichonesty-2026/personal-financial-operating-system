import type { StatementPeriod } from './types';
import type { ExtractedPdf, PdfTextItem } from '../pdf-extractor';

export interface ParsedTransaction {
  date: string;
  rawDescription: string;
  amountCents: number;
  direction: 'debit' | 'credit';
  balance?: number;
}

// Wells Fargo column X ranges (from coordinate analysis of real statements)
// pdfreader x units differ from pdfminer — scaled by ~7.2x
// pdfminer x=61.5  → pdfreader x≈8.5
// pdfminer x=142.5 → pdfreader x≈19.8
// pdfminer x=411.8 → pdfreader x≈57.2
// pdfminer x=480.0 → pdfreader x≈66.7
// pdfminer x=537.8 → pdfreader x≈74.7

const COL = {
  DATE_MIN: 7.0,  DATE_MAX: 11.0,
  DESC_MIN: 18.0, DESC_MAX: 44.0,
  DEP_MIN:  54.0, DEP_MAX:  61.0,
  WD_MIN:   63.0, WD_MAX:   71.0,
  BAL_MIN:  72.0, BAL_MAX:  79.0,
};

const DATE_RE   = /^\d{1,2}\/\d{1,2}$/;
const AMOUNT_RE = /^\d{1,3}(?:,\d{3})*\.\d{2}$/;

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,]/g, '').trim();
  if (!AMOUNT_RE.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

function groupByRow(items: PdfTextItem[]): PdfTextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: PdfTextItem[][] = [];
  let currentRow: PdfTextItem[] = [];
  let currentY: number | null = null;

  for (const item of sorted) {
    if (!item.text) continue;
    if (currentY === null || Math.abs(item.y - currentY) <= 0.5) {
      currentRow.push(item);
      if (currentY === null) currentY = item.y;
    } else {
      if (currentRow.length) rows.push(currentRow);
      currentRow = [item];
      currentY = item.y;
    }
  }
  if (currentRow.length) rows.push(currentRow);
  return rows;
}

export function parseWellsFargo(
  pdf: ExtractedPdf,
  period: StatementPeriod
): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];

  // Filter out left-margin noise (x < 7) and very wide text blocks
  const items = pdf.items.filter(i => i.x >= 7.0);

  const rows = groupByRow(items);

  for (const row of rows) {
    const dateItems = row.filter(i => i.x >= COL.DATE_MIN && i.x <= COL.DATE_MAX);
    const descItems = row.filter(i => i.x >= COL.DESC_MIN && i.x <= COL.DESC_MAX);
    const depItems  = row.filter(i => i.x >= COL.DEP_MIN  && i.x <= COL.DEP_MAX);
    const wdItems   = row.filter(i => i.x >= COL.WD_MIN   && i.x <= COL.WD_MAX);
    const balItems  = row.filter(i => i.x >= COL.BAL_MIN  && i.x <= COL.BAL_MAX);

    if (!dateItems.length) continue;
    const dateText = dateItems[0]?.text ?? '';
    if (!DATE_RE.test(dateText)) continue;

    const depAmt = depItems.map(i => parseAmount(i.text)).find(v => v !== null) ?? null;
    const wdAmt  = wdItems.map(i => parseAmount(i.text)).find(v => v !== null) ?? null;
    const balAmt = balItems.map(i => parseAmount(i.text)).find(v => v !== null) ?? null;

    if (depAmt === null && wdAmt === null) continue;

    const desc = descItems
      .map(i => i.text)
      .filter(t => !t.match(/^\$$/))  // remove stray $ signs
      .join(' ')
      .trim();

    const parts = dateText.split('/');
    const month = parseInt(parts[0] ?? '0', 10);
    const day   = parseInt(parts[1] ?? '0', 10);
    if (!month || !day) continue;

    const year = month > period.month ? period.year - 1 : period.year;
    const isoDate = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

    results.push({
      date:           isoDate,
      rawDescription: desc,
      amountCents:    depAmt ?? wdAmt ?? 0,
      direction:      depAmt !== null ? 'credit' : 'debit',
      balance:        balAmt ?? undefined,
    });
  }

  return results;
}

// StatementParser interface adapter
import type { StatementParser } from './types';

export const WellsFargoParser: StatementParser = {
  institution: 'wells_fargo',
  parse(text: string, period: StatementPeriod) {
    // text-only fallback — coordinate parsing happens in pipeline via parsePdf()
    return [];
  },
};
