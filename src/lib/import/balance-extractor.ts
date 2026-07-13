import type { ExtractedPdf } from './pdf-extractor';

export interface StatementBalances {
  openingBalanceCents: number | null;
  closingBalanceCents: number | null;
}

function parseDollar(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '').trim();
  if (!/^-?\d+\.\d{2}$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

function findAmountOnSameRow(pdf: ExtractedPdf, labelPattern: RegExp): number | null {
  const labelIdx = pdf.items.findIndex(i => labelPattern.test(i.text));
  if (labelIdx < 0) return null;
  const labelItem = pdf.items[labelIdx]!;
  // Try same-row coordinate match first
  const sameRow = pdf.items.filter(i =>
    i.page === labelItem.page &&
    Math.abs(i.y - labelItem.y) <= 5 &&
    i.x > labelItem.x
  );
  for (const item of sameRow.sort((a,b) => a.x - b.x)) {
    const val = parseDollar(item.text);
    if (val !== null) return val;
  }
  // Fallback: check next few items in document order
  for (let j = labelIdx + 1; j < Math.min(labelIdx + 5, pdf.items.length); j++) {
    const val = parseDollar(pdf.items[j]!.text);
    if (val !== null) return val;
  }
  return null;
}

export function extractBalances(pdf: ExtractedPdf, institution: string): StatementBalances {
  switch (institution) {
    case 'wells_fargo':
      return {
        openingBalanceCents: findAmountOnSameRow(pdf, /beginning balance/i),
        closingBalanceCents: findAmountOnSameRow(pdf, /ending balance on/i),
      };
    case 'us_bank': {
      // US Bank: opening on same row as 'Beginning Balance on'
      // Closing: amount may be on next line after 'Ending Balance on'
      const opening = findAmountOnSameRow(pdf, /beginning balance on/i);
      const closingIdx = pdf.items.findIndex(i => /ending balance on/i.test(i.text));
      let closing: number | null = null;
      if (closingIdx >= 0) {
        // Check same row first
        closing = findAmountOnSameRow(pdf, /ending balance on/i);
        // If not found or zero, check next 8 items
        if (!closing) {
          for (let j = closingIdx + 1; j < Math.min(closingIdx + 8, pdf.items.length); j++) {
            const val = parseDollar(pdf.items[j]!.text);
            if (val !== null && val > 0) { closing = val; break; }
          }
        }
      }
      return { openingBalanceCents: opening, closingBalanceCents: closing };
    }
    case 'synchrony':
      return {
        openingBalanceCents: findAmountOnSameRow(pdf, /previous balance/i),
        closingBalanceCents: findAmountOnSameRow(pdf, /new balance/i) ?? findAmountOnSameRow(pdf, /statement balance/i),
      };
    case 'chase': {
      const opening = findAmountOnSameRow(pdf, /previous balance/i);
      const closing = findAmountOnSameRow(pdf, /^new balance$/i) ?? findAmountOnSameRow(pdf, /new balance/i);
      return { openingBalanceCents: opening, closingBalanceCents: closing };
    }
    case 'citi':
      return {
        openingBalanceCents: findAmountOnSameRow(pdf, /previous balance/i),
        closingBalanceCents: findAmountOnSameRow(pdf, /new balance/i) ?? findAmountOnSameRow(pdf, /total balance/i),
      };
    case 'bofa':
      return {
        openingBalanceCents: findAmountOnSameRow(pdf, /beginning balance/i),
        closingBalanceCents: findAmountOnSameRow(pdf, /ending balance/i),
      };
    default:
      return { openingBalanceCents: null, closingBalanceCents: null };
  }
}
