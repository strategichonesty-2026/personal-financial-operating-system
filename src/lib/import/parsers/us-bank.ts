import type { StatementParser, StatementPeriod, ParsedTransaction } from './types';
import type { ExtractedPdf } from '../pdf-extractor';

const COL = {
  DESC_MIN: 55.0, DESC_MAX: 210.0,
  SUBDESC_MIN: 205.0, SUBDESC_MAX: 410.0,
  AMT_MIN: 540.0, AMT_MAX: 565.0,
};

function parseAmount(text: string): { cents: number; direction: 'debit'|'credit' } | null {
  const isDebit = text.trim().endsWith('-');
  const cleaned = text.replace(/[,$\-]/g, '').trim();
  if (!/^\d+\.\d{2}$/.test(cleaned)) return null;
  return { cents: Math.round(parseFloat(cleaned)*100), direction: isDebit?'debit':'credit' };
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

export function parseUSBank(pdf: ExtractedPdf, period: StatementPeriod): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const rows = groupByRow(pdf.items);
  const fallbackDate = `${period.year}-${String(period.month).padStart(2,'0')}-01`;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const descItems    = row.filter(i => i.x>=COL.DESC_MIN    &&i.x<=COL.DESC_MAX);
    const subdescItems = row.filter(i => i.x>=COL.SUBDESC_MIN &&i.x<=COL.SUBDESC_MAX);
    const amtItems     = row.filter(i => i.x>=COL.AMT_MIN     &&i.x<=COL.AMT_MAX);
    if (!amtItems.length) continue;
    const amtParsed = amtItems.map(i=>parseAmount(i.text)).find(v=>v!==null)??null;
    if (!amtParsed) continue;
    const desc = [...descItems,...subdescItems].map(i=>i.text).join(' ').trim();
    if (!desc||desc.length<3) continue;
    let isoDate = fallbackDate;
    for (let j=i+1; j<=i+2&&j<rows.length; j++) {
      for (const item of rows[j]!) {
        const m = item.text.match(/On (\d{2})\/(\d{2})\/(\d{2})/);
        if (m) { isoDate=`20${m[3]}-${m[1]}-${m[2]}`; break; }
      }
    }
    results.push({ date:isoDate, rawDescription:desc, amountCents:amtParsed.cents, direction:amtParsed.direction });
  }
  return results;
}

export const USBankParser: StatementParser = {
  institution: 'us_bank',
  parse(_text: string, _period: StatementPeriod): ParsedTransaction[] { return []; },
};
