import type { StatementParser, StatementPeriod, ParsedTransaction } from './types';
import type { ExtractedPdf } from '../pdf-extractor';

// Chase Amazon column layout:
// Date:        x=26.6 format MM/DD
// Description: x=111.6 (main), x=112.5 (Order Number sub-line — skip)
// Amount:      x=459-471 (negative = credit/payment, positive = purchase)
const COL = {
  DATE_MIN:  24.0, DATE_MAX:  35.0,
  DESC_MIN: 110.0, DESC_MAX: 450.0,
  AMT_MIN:  455.0, AMT_MAX:  480.0,
};

const AMOUNT_RE = /^-?\d{1,3}(?:,\d{3})*\.\d{2}$/;
const DATE_RE   = /^(\d{1,2})\/(\d{2})$/;

const SKIP = [
  /^order number$/i, /new balance/i, /minimum payment/i,
  /previous balance/i, /account summary/i, /payments and other/i,
  /^purchases$/i, /^fees charged/i, /^total interest/i, /^interest charged$/i, /^account activity/i,
  /^date of/i, /^transaction$/i, /^\$/,
];

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,]/g, '').trim();
  if (!AMOUNT_RE.test(cleaned)) return null;
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

export function parseChase(pdf: ExtractedPdf, period: StatementPeriod): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const seen = new Set<string>();
  const rows = groupByRow(pdf.items);

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]!;

    const dateItem = row.find(i => i.x>=COL.DATE_MIN && i.x<=COL.DATE_MAX && DATE_RE.test(i.text));
    const amtItem  = row.find(i => i.x>=COL.AMT_MIN  && i.x<=COL.AMT_MAX);
    const descItems = row.filter(i => i.x>=COL.DESC_MIN && i.x<=COL.DESC_MAX);

    if (!amtItem || !descItems.length) continue;

    const desc = descItems.map(i=>i.text).join(' ').trim();
    if (!desc || desc.length < 3) continue;
    if (SKIP.some(p => p.test(desc))) continue;
    if (/^order number/i.test(desc)) continue;

    const amtRaw = parseAmount(amtItem.text);
    if (amtRaw === null) continue;

    // Build date from MM/DD + statement year
    let date = `${period.year}-${String(period.month).padStart(2,'0')}-01`;
    if (dateItem) {
      const m = DATE_RE.exec(dateItem.text);
      if (m) {
        const mon = parseInt(m[1]!), day = parseInt(m[2]!);
        // If month > statement month, it's prior year (e.g. Dec in Jan statement)
        const yr = mon > period.month ? period.year - 1 : period.year;
        date = `${yr}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      }
    } else {
      continue; // skip rows without dates (headers, sub-lines)
    }

    const isCredit = amtRaw < 0;
    const key = `${rowIdx}|${date}|${desc}|${Math.abs(amtRaw)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      date,
      rawDescription: desc,
      amountCents:    Math.abs(amtRaw),
      direction:      isCredit ? 'credit' : 'debit',
    });
  }
  return results;
}

export const ChaseParser: StatementParser = {
  institution: 'chase',
  parse(_text: string, _period: StatementPeriod): ParsedTransaction[] { return []; },
};
