import type { StatementParser, StatementPeriod, ParsedTransaction } from './types';
import type { ExtractedPdf, PdfTextItem } from '../pdf-extractor';

// Wells Fargo column X ranges (pdfminer coordinates from real statement analysis)
const COL = {
  DATE_MIN:  60.0, DATE_MAX:  62.5,  // savings=60.8, checking=61.5
  DESC_MIN:  90.0, DESC_MAX: 330.0,  // savings=94, checking=142
  DEP_MIN:  395.0, DEP_MAX:  435.0,
  WD_MIN:   465.0, WD_MAX:   505.0,
  BAL_MIN:  520.0, BAL_MAX:  555.0,
};

const DATE_RE   = /^\d{1,2}\/\d{1,2}$/;
const AMOUNT_RE = /^\d{1,3}(?:,\d{3})*\.\d{2}$/;

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,]/g, '').trim();
  // Test against cleaned string (no commas) — allow any number of digits before decimal
  return /^\d+\.\d{2}$/.test(cleaned) ? Math.round(parseFloat(cleaned) * 100) : null;
}

function groupByRow(items: PdfTextItem[]): PdfTextItem[][] {
  // Must group by page first — same y on different pages are unrelated rows
  const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const rows: PdfTextItem[][] = [];
  let current: PdfTextItem[] = [];
  let currentY: number | null = null;
  let currentPage: number | null = null;

  for (const item of sorted) {
    if (!item.text.trim()) continue;
    const samePage = currentPage === null || item.page === currentPage;
    const sameRow  = currentY === null || Math.abs(item.y - currentY) <= 5;
    if (samePage && sameRow) {
      current.push(item);
      if (currentY === null) currentY = item.y;
      if (currentPage === null) currentPage = item.page;
    } else {
      if (current.length) rows.push(current);
      current = [item];
      currentY = item.y;
      currentPage = item.page;
    }
  }
  if (current.length) rows.push(current);
  return rows;
}

export function parseWellsFargo(
  pdf: ExtractedPdf,
  period: StatementPeriod
): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const rows = groupByRow(pdf.items);

  for (const row of rows) {
    const dateItems = row.filter(i => i.x >= COL.DATE_MIN && i.x <= COL.DATE_MAX);
    const descItems = row.filter(i => i.x >= COL.DESC_MIN && i.x <= COL.DESC_MAX);
    const depItems  = row.filter(i => i.x >= COL.DEP_MIN  && i.x <= COL.DEP_MAX);
    const wdItems   = row.filter(i => i.x >= COL.WD_MIN   && i.x <= COL.WD_MAX);
    const balItems  = row.filter(i => i.x >= COL.BAL_MIN  && i.x <= COL.BAL_MAX);

    // Multi-line description: row has desc text but no date and no amount
    // Append it to the previous transaction's description
    const hasDate   = dateItems.length > 0 && DATE_RE.test(dateItems[0]?.text ?? '');
    const hasAmount = depItems.some(i => parseAmount(i.text) !== null) ||
                      wdItems.some(i => parseAmount(i.text) !== null);
    const hasDesc   = descItems.length > 0;

    if (!hasDate && !hasAmount && hasDesc && results.length > 0) {
      const continuation = descItems.map(i => i.text).filter(t => t !== '$').join(' ').trim();
      // Only append if it looks like a real description continuation:
      // - Not a page marker, total row, or footer
      // - Not mostly numbers/symbols
      // - Short enough to be a description continuation (under 60 chars)
      const isPageMarker    = /page \d+ of \d+/i.test(continuation);
      const isTotalRow      = /^(total|subtotal|\$\s*total)/i.test(continuation);
      const isFooter        = /all rights reserved|wells fargo bank|©/i.test(continuation);
      const isMostlyNumbers = /^[\d\s\$\.,\-\+%]+$/.test(continuation);
      const hasRealWords    = /[a-zA-Z]{3,}/.test(continuation);
      const isContinuation  = continuation.length > 0 &&
                              continuation.length < 80 &&
                              hasRealWords &&
                              !isPageMarker && !isTotalRow &&
                              !isFooter && !isMostlyNumbers;
      if (isContinuation) {
        results[results.length - 1]!.rawDescription += ' ' + continuation;
      }
      continue;
    }

    if (!dateItems.length) continue;
    const dateText = dateItems[0]?.text ?? '';
    if (!DATE_RE.test(dateText)) continue;

    const depAmt = depItems.map(i => parseAmount(i.text)).find(v => v !== null) ?? null;
    const wdAmt  = wdItems.map(i => parseAmount(i.text)).find(v => v !== null) ?? null;
    const balAmt = balItems.map(i => parseAmount(i.text)).find(v => v !== null) ?? null;

    if (depAmt === null && wdAmt === null) continue;

    const desc = descItems
      .map(i => i.text)
      .filter(t => t !== '$')
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

export const WellsFargoParser: StatementParser = {
  institution: 'wells_fargo',
  parse(_text: string, _period: StatementPeriod): ParsedTransaction[] {
    return []; // coordinate parsing used via parseWellsFargo()
  },
};
