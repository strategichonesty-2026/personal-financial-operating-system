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

function findFirst(text: string, pattern: RegExp): number | null {
  const m = text.match(pattern);
  if (!m) return null;
  return parseDollar(m[1] ?? '');
}

function findAll(text: string, pattern: RegExp): number[] {
  const results: number[] = [];
  let m;
  const re = new RegExp(pattern.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    const v = parseDollar(m[1] ?? '');
    if (v !== null) results.push(v);
  }
  return results;
}

export function extractBalances(pdf: ExtractedPdf, institution: string): StatementBalances {
  const text = pdf.items.map(i => i.text).join(' ');

  switch (institution) {
    case 'wells_fargo': {
      // WF: "Beginning balance on MM/DD $X" then "Ending balance on MM/DD $X"
      // Find ALL matches — first = opening, last = closing
      const beginMatches = findAll(text, /beginning balance on [\d/]+\s+\$?([\d,]+\.\d{2})/i);
      const endMatches   = findAll(text, /ending balance on [\d/]+\s+\$?([\d,]+\.\d{2})/i);
      return {
        openingBalanceCents: beginMatches[0] ?? null,
        closingBalanceCents: endMatches[0] ?? null,
      };
    }

    case 'us_bank': {
      const beginMatches = findAll(text, /beginning balance\s+\$?([\d,]+\.\d{2})/i);
      const endMatches   = findAll(text, /ending balance\s+\$?([\d,]+\.\d{2})/i);
      return {
        openingBalanceCents: beginMatches[0] ?? findFirst(text, /previous balance\s+\$?([\d,]+\.\d{2})/i),
        closingBalanceCents: endMatches[0]   ?? findFirst(text, /new balance\s+\$?([\d,]+\.\d{2})/i),
      };
    }

    case 'synchrony':
      return {
        openingBalanceCents: findFirst(text, /previous balance\s+\$?([\d,]+\.\d{2})/i),
        closingBalanceCents: findFirst(text, /new balance\s+\$?([\d,]+\.\d{2})/i)
          ?? findFirst(text, /statement balance\s+\$?([\d,]+\.\d{2})/i),
      };

    case 'chase':
      return {
        openingBalanceCents: findFirst(text, /previous balance\s+\$?([\d,]+\.\d{2})/i),
        closingBalanceCents: findFirst(text, /new balance\s+\$?([\d,]+\.\d{2})/i),
      };

    case 'citi':
      return {
        openingBalanceCents: findFirst(text, /previous balance\s+\$?([\d,]+\.\d{2})/i),
        closingBalanceCents: findFirst(text, /new balance\s+\$?([\d,]+\.\d{2})/i)
          ?? findFirst(text, /total balance\s+\$?([\d,]+\.\d{2})/i),
      };

    case 'bofa':
      return {
        openingBalanceCents: findFirst(text, /beginning balance\s+\$?([\d,]+\.\d{2})/i),
        closingBalanceCents: findFirst(text, /ending balance\s+\$?([\d,]+\.\d{2})/i),
      };

    default:
      return { openingBalanceCents: null, closingBalanceCents: null };
  }
}
