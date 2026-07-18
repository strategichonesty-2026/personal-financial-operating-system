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

// New format column ranges (Apr 2026+): Sale x=36, Post x=99, Desc x=162, Amt x=535+
const COL2 = {
  SALE_MIN:  33.0, SALE_MAX:  40.0,
  POST_MIN:  96.0, POST_MAX: 103.0,
  DESC_MIN: 158.0, DESC_MAX: 535.0,
  AMT_MIN:  535.0, AMT_MAX:  585.0,
};

function parseAmountV2(raw: string): number | null {
  const text = raw.replace(/[$,\s]/g, '').replace(/^-/, '');
  if (!/^\d+\.\d{2}$/.test(text)) return null;
  const val = Math.round(parseFloat(text) * 100);
  return raw.includes('-') ? -val : val;
}

export function parseCiti(pdf: ExtractedPdf, period: StatementPeriod): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const rows = groupByRow(pdf.items);

  // Detect format: new format has sale dates at x~36, old at x~63
  const hasNewFormat = pdf.items.some(i => i.x >= 33 && i.x <= 40 && DATE_RE.test(i.text.trim()));

  if (hasNewFormat) {
    // New format (Apr 2026+)
    let currentSection: 'credit' | 'debit' = 'debit';
    for (const row of rows) {
      const rowText = row.map(i => i.text).join(' ');
      if (/payments.*credits.*adjustments/i.test(rowText)) { currentSection = 'credit'; continue; }
      if (/standard purchases|purchases/i.test(rowText) && !/description/i.test(rowText)) { currentSection = 'debit'; continue; }
      if (/^fees charged$|^interest charged$|account summary|totals year/i.test(rowText.trim())) { currentSection = 'debit'; continue; }
      if (/^total fees|^total interest/i.test(rowText.trim())) continue;

      const saleItems = row.filter(i => i.x>=COL2.SALE_MIN&&i.x<=COL2.SALE_MAX);
      const postItems = row.filter(i => i.x>=COL2.POST_MIN&&i.x<=COL2.POST_MAX);
      const descItems = row.filter(i => i.x>=COL2.DESC_MIN&&i.x<=COL2.DESC_MAX);
      const amtItems  = row.filter(i => i.x>=COL2.AMT_MIN &&i.x<=COL2.AMT_MAX);

      // Accept sale date (purchases) OR post date (payments have no sale date)
      const dateItem = saleItems[0] ?? postItems[0];
      if (!dateItem) continue;
      const dateText = dateItem.text ?? '';
      if (!DATE_RE.test(dateText)) continue;

      // Check for separate "-" sign item just before amount
      const hasMinus = row.some(i => i.x >= 530 && i.x < 548 && i.text.trim() === '-');
      const amtRaw = amtItems.map(i=>parseAmountV2(i.text)).find(v=>v!==null)??null;
      if (amtRaw===null) continue;

      const desc = descItems.map(i=>i.text).filter(t=>t!=='$').join(' ').trim();
      if (!desc) continue;
      if (/^total/i.test(desc)) continue;

      const [mStr,dStr] = dateText.split('/');
      const month = parseInt(mStr??'0',10), day = parseInt(dStr??'0',10);
      if (!month||!day) continue;
      const year = month>period.month?period.year-1:period.year;
      const isoDate = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

      // Payments: negative sign OR payment keyword OR section = credit
      const isPayment = hasMinus || amtRaw < 0 || PAYMENT_RE.test(desc) || currentSection === 'credit';
      const direction = isPayment ? 'credit' : 'debit';
      results.push({ date:isoDate, rawDescription:desc, amountCents:Math.abs(amtRaw), direction });
    }
  } else {
    // Original format (Dec 2025 - Mar 2026)
    for (const row of rows) {
      const saleItems = row.filter(i => i.x>=COL.SALE_MIN&&i.x<=COL.SALE_MAX);
      const postItems = row.filter(i => i.x>=COL.POST_MIN&&i.x<=COL.POST_MAX);
      const descItems = row.filter(i => i.x>=COL.DESC_MIN&&i.x<=COL.DESC_MAX);
      const amtItems  = row.filter(i => i.x>=COL.AMT_MIN &&i.x<=COL.AMT_MAX);

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
  }
  return results;
}

export const CitiParser: StatementParser = {
  institution: 'citi',
  parse(_text: string, _period: StatementPeriod): ParsedTransaction[] { return []; },
};
