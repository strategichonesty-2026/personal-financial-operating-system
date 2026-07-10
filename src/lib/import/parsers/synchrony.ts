import type { StatementParser, StatementPeriod, ParsedTransaction } from './types';
import type { ExtractedPdf } from '../pdf-extractor';

const COL = {
  REF_MIN: 70.0, REF_MAX: 80.0,
  DESC_MIN: 178.0, DESC_MAX: 455.0,
  AMT_MIN: 448.0, AMT_MAX: 465.0,
};

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

export function parseSynchrony(pdf: ExtractedPdf, period: StatementPeriod): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const rows = groupByRow(pdf.items);
  const isoDate = `${period.year}-${String(period.month).padStart(2,'0')}-01`;
  for (const row of rows) {
    const refItems  = row.filter(i => i.x>=COL.REF_MIN &&i.x<=COL.REF_MAX);
    const descItems = row.filter(i => i.x>=COL.DESC_MIN&&i.x<=COL.DESC_MAX);
    const amtItems  = row.filter(i => i.x>=COL.AMT_MIN &&i.x<=COL.AMT_MAX);
    if (!refItems.length) continue;
    const ref = refItems[0]?.text??'';
    if (!/^[A-Z0-9]{10,}$/.test(ref)) continue;
    const amtRaw = amtItems.map(i=>parseAmount(i.text)).find(v=>v!==null)??null;
    if (amtRaw===null) continue;
    const desc = descItems.map(i=>i.text).filter(t=>!t.startsWith(',')).join(' ').trim();
    if (!desc) continue;
    results.push({ date:isoDate, rawDescription:desc, amountCents:Math.abs(amtRaw), direction:amtRaw<0?'credit':'debit' });
  }
  return results;
}

export const SynchronyParser: StatementParser = {
  institution: 'synchrony',
  parse(_text: string, _period: StatementPeriod): ParsedTransaction[] { return []; },
};
