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

function searchText(fullText: string, ...patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const m = fullText.match(pattern);
    if (m) {
      const val = parseDollar(m[1] ?? '');
      if (val !== null) return val;
    }
  }
  return null;
}

export function extractBalances(pdf: ExtractedPdf, institution: string): StatementBalances {
  // Join all text items with space — handles cases where label and amount are separate items
  const text = pdf.items.map(i => i.text).join(' ');

  switch (institution) {
    case 'wells_fargo':
      return {
        openingBalanceCents: searchText(text,
          /beginning balance on [\d/]+\s+\$?([\d,]+\.\d{2})/i,
          /beginning balance\s+\$?([\d,]+\.\d{2})/i
        ),
        closingBalanceCents: searchText(text,
          /ending balance on [\d/]+\s+\$?([\d,]+\.\d{2})/i,
          /ending balance\s+\$?([\d,]+\.\d{2})/i
        ),
      };

    case 'us_bank':
      return {
        openingBalanceCents: searchText(text,
          /beginning balance\s+\$?([\d,]+\.\d{2})/i,
          /previous balance\s+\$?([\d,]+\.\d{2})/i
        ),
        closingBalanceCents: searchText(text,
          /ending balance\s+\$?([\d,]+\.\d{2})/i,
          /new balance\s+\$?([\d,]+\.\d{2})/i
        ),
      };

    case 'synchrony':
      return {
        openingBalanceCents: searchText(text,
          /previous balance\s+\$?([\d,]+\.\d{2})/i
        ),
        closingBalanceCents: searchText(text,
          /new balance\s+\$?([\d,]+\.\d{2})/i,
          /statement balance\s+\$?([\d,]+\.\d{2})/i
        ),
      };

    case 'chase':
      return {
        openingBalanceCents: searchText(text,
          /previous balance\s+\$?([\d,]+\.\d{2})/i
        ),
        closingBalanceCents: searchText(text,
          /new balance\s+\$?([\d,]+\.\d{2})/i
        ),
      };

    case 'citi':
      return {
        openingBalanceCents: searchText(text,
          /previous balance\s+\$?([\d,]+\.\d{2})/i
        ),
        closingBalanceCents: searchText(text,
          /new balance\s+\$?([\d,]+\.\d{2})/i,
          /total balance\s+\$?([\d,]+\.\d{2})/i
        ),
      };

    case 'bofa':
      return {
        openingBalanceCents: searchText(text,
          /beginning balance\s+\$?([\d,]+\.\d{2})/i
        ),
        closingBalanceCents: searchText(text,
          /ending balance\s+\$?([\d,]+\.\d{2})/i
        ),
      };

    default:
      return { openingBalanceCents: null, closingBalanceCents: null };
  }
}
