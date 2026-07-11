import type { StatementParser, StatementPeriod, ParsedTransaction } from './types';
import type { ExtractedPdf } from '../pdf-extractor';

// US Bank column layout (from coordinate analysis):
// x=207.3 = Description
// x=558-568 = Amount (trailing dash = debit)
// Skip: x=70 (REF lines), x=221 (transfer ref lines)

const COL = {
  DESC_MIN: 200.0, DESC_MAX: 420.0,
  AMT_MIN:  545.0, AMT_MAX:  572.0,
};

// Summary rows to skip
const SKIP_PATTERNS = [
  /^total/i, /^new balance/i, /^\$/,
  /^effective /i, /^u\.s\. bancorp/i, /checks on canadian/i,
  /^tracer fee/i, /^initiation fee/i, /^for foreign/i,
  /withdrawals subtotal/i, /deposits.*credits/i,
  /average account balance/i, /consumer pricing information/i,
  /^reserve line/i, /^ending balance/i, /^beginning balance/i,
];

function parseAmount(text: string): { cents: number; direction: 'debit'|'credit' } | null {
  const isDebit = text.trim().endsWith('-');
  const cleaned = text.replace(/[,$\- ]/g, '').trim();
  if (!/^\d+\.\d{2}$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  if (cents === 0) return null;
  return { cents, direction: isDebit ? 'debit' : 'credit' };
}

function groupByRow(items: {x:number,y:number,text:string,page:number}[]) {
  // Must group by page first — same y on different pages are unrelated rows
  const sorted = [...items].sort((a,b) => a.page-b.page||b.y-a.y||a.x-b.x);
  const rows: typeof items[] = [];
  let cur: typeof items = [], curY: number|null = null, curPage: number|null = null;
  for (const item of sorted) {
    if (!item.text.trim()) continue;
    const samePage = curPage===null||item.page===curPage;
    const sameRow  = curY===null||Math.abs(item.y-curY)<=3;
    if (samePage && sameRow) {
      cur.push(item);
      if (curY===null) curY=item.y;
      if (curPage===null) curPage=item.page;
    } else {
      if (cur.length) rows.push(cur);
      cur=[item]; curY=item.y; curPage=item.page;
    }
  }
  if(cur.length)rows.push(cur);
  return rows;
}

export function parseUSBank(pdf: ExtractedPdf, period: StatementPeriod): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const seen = new Set<string>();
  const rows = groupByRow(pdf.items);
  const fallbackDate = `${period.year}-${String(period.month).padStart(2,'0')}-01`;

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]!;
    const descItems = row.filter(i => i.x>=COL.DESC_MIN && i.x<=COL.DESC_MAX);
    const amtItems  = row.filter(i => i.x>=COL.AMT_MIN  && i.x<=COL.AMT_MAX);

    if (!amtItems.length || !descItems.length) continue;
    const amtParsed = amtItems.map(i=>parseAmount(i.text)).find(v=>v!==null)??null;
    if (!amtParsed) continue;

    const desc = descItems.map(i=>i.text).join(' ').trim();
    if (!desc || desc.length < 3) continue;
    if (SKIP_PATTERNS.some(p => p.test(desc))) continue;

    // Include rowIdx in key — same desc+amount can appear multiple times (e.g. Acorns $5 weekly)
    const page = row[0]?.page ?? 0;
    const key = `${page}|${rowIdx}|${desc}|${amtParsed.cents}|${amtParsed.direction}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      date:           fallbackDate,
      rawDescription: desc,
      amountCents:    amtParsed.cents,
      direction:      amtParsed.direction,
    });
  }
  return results;
}

export const USBankParser: StatementParser = {
  institution: 'us_bank',
  parse(_text: string, _period: StatementPeriod): ParsedTransaction[] { return []; },
};
