import type { StatementParser, StatementPeriod, ParsedTransaction } from './types';
import type { ExtractedPdf } from '../pdf-extractor';

// Synchrony Sam's Club column layout (page 3):
// Date:        x=38.2  format MM/DD
// Ref#:        x=72.5  (skip)
// Description: x=181.7
// Amount:      x=449-458 (negative = credit/payment)

const COL = {
  DATE_MIN:  36.0, DATE_MAX:  45.0,
  DESC_MIN: 178.0, DESC_MAX: 445.0,
  AMT_MIN:  445.0, AMT_MAX:  470.0,
};

const DATE_RE = /^\d{1,2}\/\d{2}$/;

const SKIP = [
  /^payments$/i, /^purchases$/i, /^other credits$/i,
  /^transaction detail$/i, /^date$/i, /^description$/i,
  /^amount$/i, /^fees$/i, /^interest charges$/i,
  /^reference/i, /^total$/i,
];

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,]/g, '').trim();
  if (!/^-?\d+\.\d{2}$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

function groupByRow(items: {x:number,y:number,text:string,page:number}[]) {
  const sorted = [...items].sort((a,b) => a.page-b.page||a.y-b.y||a.x-b.x);
  const rows: typeof items[] = [];
  let cur: typeof items = [], curY: number|null = null, curPage: number|null = null;
  for (const item of sorted) {
    if (!item.text.trim()) continue;
    const samePage = curPage===null||item.page===curPage;
    const sameRow  = curY===null||Math.abs(item.y-curY)<=3;
    if (samePage && sameRow) {
      cur.push(item);
      if (curY===null) { curY=item.y; curPage=item.page; }
    } else {
      if (cur.length) rows.push(cur);
      cur=[item]; curY=item.y; curPage=item.page;
    }
  }
  if (cur.length) rows.push(cur);
  return rows;
}

export function parseSynchrony(pdf: ExtractedPdf, period: StatementPeriod): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const seen = new Set<string>();
  const rows = groupByRow(pdf.items);

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]!;

    const dateItem = row.find(i => i.x>=COL.DATE_MIN && i.x<=COL.DATE_MAX && DATE_RE.test(i.text));
    const amtItem  = row.find(i => i.x>=COL.AMT_MIN  && i.x<=COL.AMT_MAX);
    const descItems = row.filter(i => i.x>=COL.DESC_MIN && i.x<=COL.DESC_MAX);

    if (!dateItem || !amtItem || !descItems.length) continue;

    const desc = descItems.map(i=>i.text).join(' ').trim();
    if (!desc || desc.length < 2) continue;
    if (SKIP.some(p => p.test(desc))) continue;

    const amtCents = parseAmount(amtItem.text);
    if (amtCents === null) continue;

    const [mStr, dStr] = dateItem.text.split('/');
    const mon = parseInt(mStr??'0'), day = parseInt(dStr??'0');
    if (!mon || !day) continue;
    const yr = mon > period.month ? period.year - 1 : period.year;
    const date = `${yr}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

    const key = `${rowIdx}|${date}|${desc}|${Math.abs(amtCents)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      date,
      rawDescription: desc,
      amountCents: Math.abs(amtCents),
      direction: amtCents < 0 ? 'credit' : 'debit',
    });
  }
  return results;
}

export const SynchronyParser: StatementParser = {
  institution: 'synchrony',
  parse(_text: string, _period: StatementPeriod): ParsedTransaction[] { return []; },
};
