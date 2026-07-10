import type { StatementParser, StatementPeriod, ParsedTransaction } from './types';
import type { ExtractedPdf } from '../pdf-extractor';

const COL = {
  SALE_MIN: 62.0, SALE_MAX: 65.0,
  DESC_MIN: 124.0, DESC_MAX: 360.0,
  AMT_MIN:  350.0, AMT_MAX:  480.0,
};

const DATE_RE = /^\d{2}\/\d{2}$/;

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,]/g, '').trim();
  if (!/^-?\d+\.\d{2}$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

function groupByRow(items: {x:number,y:number,text:string,page:number}[]) {
  const sorted = [...items].sort((a,b) => b.y-a.y||a.x-b.x);
  const rows: typeof items[] = [];
  let cur: typeof items = [], curY: number|null = null;
  for (const item of sorted) {
    if (!item.text.trim()) continue;
    if (curY===null||Math.abs(item.y-curY)<=3){cur.push(item);if(curY===null)curY=item.y;}
    else{if(cur.length)rows.push(cur);cur=[item];curY=item.y;}
  }
  if(cur.length)rows.push(cur);
  return rows;
}

export function parseCiti(pdf: ExtractedPdf, period: StatementPeriod): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const rows = groupByRow(pdf.items);
  for (const row of rows) {
    const saleItems = row.filter(i => i.x>=COL.SALE_MIN&&i.x<=COL.SALE_MAX);
    const descItems = row.filter(i => i.x>=COL.DESC_MIN&&i.x<=COL.DESC_MAX);
    const amtItems  = row.filter(i => i.x>=COL.AMT_MIN &&i.x<=COL.AMT_MAX);
    if (!saleItems.length) continue;
    const dateText = saleItems[0]?.text??'';
    if (!DATE_RE.test(dateText)) continue;
    const amtRaw = amtItems.map(i=>parseAmount(i.text)).find(v=>v!==null)??null;
    if (amtRaw===null) continue;
    const desc = descItems.map(i=>i.text).join(' ').trim();
    if (!desc) continue;
    const [mStr,dStr] = dateText.split('/');
    const month = parseInt(mStr??'0',10), day = parseInt(dStr??'0',10);
    if (!month||!day) continue;
    const year = month>period.month?period.year-1:period.year;
    const isoDate = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    results.push({ date:isoDate, rawDescription:desc, amountCents:Math.abs(amtRaw), direction:amtRaw<0?'credit':'debit' });
  }
  return results;
}

export const CitiParser: StatementParser = {
  institution: 'citi',
  parse(_text: string, _period: StatementPeriod): ParsedTransaction[] { return []; },
};
