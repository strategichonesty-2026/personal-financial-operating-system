import type { StatementParser, StatementPeriod, ParsedTransaction } from './types';
import type { ExtractedPdf } from '../pdf-extractor';

// Chase Amazon column layout (confirmed from real PDF coordinate dump)
// Description: x=111.6 (main), x=112.5 (Order Number sub-line — skip)
// Amount:      x=459-471 (varies by amount width)
// Dates: NOT present as separate coordinate items — not parseable from coordinates
const COL = {
  DESC_MIN: 110.0, DESC_MAX: 350.0,
  AMT_MIN:  455.0, AMT_MAX:  475.0,
};

const AMOUNT_RE = /^-?\d{1,3}(?:,\d{3})*\.\d{2}$/;

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,]/g, '').trim();
  if (!AMOUNT_RE.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

function groupByRow(items: {x:number,y:number,text:string,page:number}[]) {
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

export function parseChase(pdf: ExtractedPdf, period: StatementPeriod): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const rows = groupByRow(pdf.items);
  const isoDate = `${period.year}-${String(period.month).padStart(2,'0')}-25`;
  const seen = new Set<string>();

  for (const row of rows) {
    const descItems = row.filter(i => i.x>=COL.DESC_MIN&&i.x<=COL.DESC_MAX);
    const amtItems  = row.filter(i => i.x>=COL.AMT_MIN &&i.x<=COL.AMT_MAX);
    if (!descItems.length || !amtItems.length) continue;

    const desc = descItems.map(i=>i.text).join(' ').trim();
    if (desc.startsWith('Order Number') || desc.length < 3) continue;
    if (/\$[\d,]+/.test(desc)) continue;
    if (/^[\d,\.]+$/.test(desc.trim())) continue;

    const amtRaw = amtItems.map(i=>parseAmount(i.text)).find(v=>v!==null) ?? null;
    if (amtRaw === null) continue;

    const key = `${desc}|${Math.abs(amtRaw)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const isCredit = amtRaw < 0;
    results.push({
      date:           isoDate,
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
