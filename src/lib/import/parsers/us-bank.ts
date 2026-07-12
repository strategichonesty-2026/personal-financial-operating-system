import type { StatementParser, StatementPeriod, ParsedTransaction } from './types';
import type { ExtractedPdf } from '../pdf-extractor';

const MONTH_MAP: Record<string,number> = {
  jan:1,feb:2,mar:3,apr:4,may:5,jun:6,
  jul:7,aug:8,sep:9,oct:10,nov:11,dec:12
};

const COL = {
  MONTH_X_MIN: 18.0,  MONTH_X_MAX: 30.0,
  DAY_X_MIN:   35.0,  DAY_X_MAX:   50.0,
  DESC1_X_MIN: 50.0,  DESC1_X_MAX: 210.0,
  DESC2_X_MIN: 200.0, DESC2_X_MAX: 420.0,
  AMT_X_MIN:   540.0, AMT_X_MAX:   590.0,
  DASH_X_MIN:  580.0, DASH_X_MAX:  592.0,
};

const SKIP_PATTERNS = [
  /^total/i, /^new balance/i, /^\$/,
  /^effective /i, /^u\.s\. bancorp/i,
  /withdrawals subtotal/i, /deposits.*credits/i,
  /average account balance/i, /consumer pricing/i,
  /^reserve line/i, /^ending balance/i, /^beginning balance/i,
  /^balance summary/i, /^date$/i, /^amount$/i,
  /^description/i, /^ref number/i,
  /balances only appear/i, /^page$/i,
];

function groupByRow(items: {x:number;y:number;text:string;page:number}[]) {
  const sorted = [...items].sort((a,b) => a.page-b.page || a.y-b.y || a.x-b.x);
  const rows: typeof items[] = [];
  let cur: typeof items = [], curY: number|null = null, curPage: number|null = null;
  for (const item of sorted) {
    if (!item.text.trim()) continue;
    const samePage = curPage === null || item.page === curPage;
    const sameRow  = curY === null || Math.abs(item.y - curY) <= 3;
    if (samePage && sameRow) {
      cur.push(item);
      if (curY === null) { curY = item.y; curPage = item.page; }
    } else {
      if (cur.length) rows.push(cur);
      cur = [item]; curY = item.y; curPage = item.page;
    }
  }
  if (cur.length) rows.push(cur);
  return rows;
}

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[,$]/g, '').trim();
  if (!/^\d+\.\d{2}$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  return cents === 0 ? null : cents;
}

export function parseUSBank(pdf: ExtractedPdf, period: StatementPeriod): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const seen = new Set<string>();
  const rows = groupByRow(pdf.items);
  const stmtYear = period.year;
  const stmtMonth = period.month;

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx]!;

    // Extract month name (Dec, Jan, etc.)
    const monthItem = row.find(i => i.x >= COL.MONTH_X_MIN && i.x <= COL.MONTH_X_MAX && /^[a-zA-Z]{3}$/.test(i.text));
    // Extract day number
    const dayItem = row.find(i => i.x >= COL.DAY_X_MIN && i.x <= COL.DAY_X_MAX && /^\d{1,2}$/.test(i.text));
    // Extract amount
    const amtItem = row.find(i => i.x >= COL.AMT_X_MIN && i.x <= COL.AMT_X_MAX);
    // Extract debit dash
    const isDash = row.some(i => i.x >= COL.DASH_X_MIN && i.x <= COL.DASH_X_MAX && i.text === '-');

    if (!amtItem) continue;
    const amtCents = parseAmount(amtItem.text);
    if (!amtCents) continue;

    // Description: combine desc1 and desc2 columns
    const descItems = row.filter(i => i.x >= COL.DESC1_X_MIN && i.x <= COL.DESC2_X_MAX);
    const desc = descItems.map(i => i.text).join(' ').trim();
    if (!desc || desc.length < 3) continue;
    if (SKIP_PATTERNS.some(p => p.test(desc))) continue;

    // Build date
    let date: string;
    if (monthItem && dayItem) {
      const mon = MONTH_MAP[monthItem.text.toLowerCase()];
      const day = parseInt(dayItem.text);
      if (mon && day) {
        // If month > stmtMonth, it's prior year (e.g. Dec in a Jan statement)
        const yr = mon > stmtMonth ? stmtYear - 1 : stmtYear;
        date = `${yr}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      } else {
        date = `${stmtYear}-${String(stmtMonth).padStart(2,'0')}-01`;
      }
    } else {
      // Skip rows without a date (ref lines, totals)
      continue;
    }

    const direction: 'debit'|'credit' = isDash ? 'debit' : 'credit';
    const key = `${rowIdx}|${date}|${desc}|${amtCents}|${direction}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({ date, rawDescription: desc, amountCents: amtCents, direction });
  }

  return results;
}

export const USBankParser: StatementParser = {
  institution: 'us_bank',
  parse(_text: string, _period: StatementPeriod): ParsedTransaction[] { return []; },
};
