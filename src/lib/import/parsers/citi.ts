import type { StatementParser, StatementPeriod, ParsedTransaction } from './types';
import type { ExtractedPdf } from '../pdf-extractor';

// Citi Costco Visa column X ranges (confirmed from real PDF coordinate dump)
// Sale date col:  x=63-66   (purchase transactions)
// Post date col:  x=93-97   (payment rows use POST date only, no sale date)
// Description:    x=129-300
// Amount:         x=350-365 (confirmed: -$100.00 at 355.7, -$60.00 at 358.3)
// Sidebar legal:  x=316.8+ right column — excluded by DESC_MAX=300
// Multi-line account summary blocks (x=70, text contains newlines) — skipped by DATE_RE
const COL = {
  SALE_MIN:  62.0, SALE_MAX:  66.0,
  POST_MIN:  90.0, POST_MAX:  97.0,   // payment rows only have post date
  DESC_MIN: 124.0, DESC_MAX: 300.0,
  AMT_MIN:  330.0, AMT_MAX:  370.0,   // confirmed: amounts at x=355-358
};

// Payment keywords — Citi shows these as description on payment rows
const PAYMENT_RE = /payment|autopay|thank you/i;

const DATE_RE = /^\d{2}\/\d{2}$/;

function parseAmount(raw: string): number | null {
  let text = raw.replace(/[$,]/g, '').replace(/\s*CR$/i, '').trim();
  const isCrSuffix = /CR$/i.test(raw.replace(/[$,\s]/g, ''));
  if (!/^-?\d+\.\d{2}$/.test(text)) return null;
  let val = Math.round(parseFloat(text) * 100);
  if (isCrSuffix && val > 0) val = -val;
  return val;
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

export function parseCiti(pdf: ExtractedPdf, period: StatementPeriod): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const rows = groupByRow(pdf.items);
  for (const row of rows) {
    const saleItems = row.filter(i => i.x>=COL.SALE_MIN&&i.x<=COL.SALE_MAX);
    const postItems = row.filter(i => i.x>=COL.POST_MIN&&i.x<=COL.POST_MAX);
    const descItems = row.filter(i => i.x>=COL.DESC_MIN&&i.x<=COL.DESC_MAX);
    const amtItems  = row.filter(i => i.x>=COL.AMT_MIN &&i.x<=COL.AMT_MAX);

    // Accept sale date (purchases) OR post date (payments — no sale date col)
    const dateItem = saleItems[0] ?? postItems[0];
    if (!dateItem) continue;
    const dateText = dateItem.text ?? '';
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
    const isPayment = PAYMENT_RE.test(desc);
    const direction = (amtRaw < 0 || isPayment) ? 'credit' : 'debit';
    results.push({ date:isoDate, rawDescription:desc, amountCents:Math.abs(amtRaw), direction });
  }
  return results;
}

export const CitiParser: StatementParser = {
  institution: 'citi',
  parse(_text: string, _period: StatementPeriod): ParsedTransaction[] { return []; },
};
