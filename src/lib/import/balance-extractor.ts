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
  const labelItem = pdf.items.find(i => labelPattern.test(i.text));
  if (!labelItem) return null;
  const sameRow = pdf.items.filter(i =>
    i.page === labelItem.page &&
    Math.abs(i.y - labelItem.y) <= 3 &&
    i.x > labelItem.x
  );
  for (const item of sameRow.sort((a,b) => a.x - b.x)) {
    const val = parseDollar(item.text);
    if (val !== null) return val;
  }
  return null;
}

export function extractBalances(pdf: ExtractedPdf, institution: string): StatementBalances {
  switch (institution) {
    case 'wells_fargo': {
      const t = pdf.items.map(i => i.text).join(' ');
      const bm = t.match(/beginning balance on [\d/]+\s+\$?([\d,]+\.\d{2})/i);
      const em = t.match(/ending balance on [\d/]+\s+\$?([\d,]+\.\d{2})/i);
      return {
        openingBalanceCents: bm?.[1] ? Math.round(parseFloat(bm[1].replace(/,/g,'')) * 100) : null,
        closingBalanceCents: em?.[1] ? Math.round(parseFloat(em[1].replace(/,/g,'')) * 100) : null,
      };
    }
    case 'us_bank':
      return {
        openingBalanceCents: findAmountOnSameRow(pdf, /beginning balance/i) ?? findAmountOnSameRow(pdf, /previous balance/i),
        closingBalanceCents: findAmountOnSameRow(pdf, /ending balance/i) ?? findAmountOnSameRow(pdf, /new balance/i),
      };
    case 'synchrony':
      return {
        openingBalanceCents: findAmountOnSameRow(pdf, /previous balance/i),
        closingBalanceCents: findAmountOnSameRow(pdf, /new balance/i) ?? findAmountOnSameRow(pdf, /statement balance/i),
      };
    case 'chase':
      return {
        openingBalanceCents: findAmountOnSameRow(pdf, /previous balance/i),
        closingBalanceCents: findAmountOnSameRow(pdf, /new balance/i),
      };
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
