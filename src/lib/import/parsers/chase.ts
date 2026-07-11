import type { StatementParser, StatementPeriod, ParsedTransaction } from './types';
import type { ExtractedPdf } from '../pdf-extractor';

// Chase Amazon column layout:
// x=111.6 = Description
// x=112.5 = Order Number sub-line (skip)
// x=466-470 = Amount
// Two sections in PDF:
//   Payments/Credits section: amounts are negative (e.g. -150.00)
//   Purchases section: amounts are positive (e.g. 8.64)
// We parse BOTH but track direction from sign

// Chase Amazon column layout (from real PDF):
// Date:        x=63-75
// Description: x=111-350 (main line x=111.6, order number sub-line x=112.5 — skip)
// Amount:      x=466-470
const COL = {
  DATE_MIN:  60.0, DATE_MAX:  80.0,
  DESC_MIN: 110.0, DESC_MAX: 350.0,
  AMT_MIN:  460.0, AMT_MAX:  475.0,
};

const DATE_RE = /^\d{1,2}\/\d{2}$/;

const AMOUNT_RE = /^-?\d{1,3}(?:,\d{3})*\.\d{2}$/;

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,]/g, '').trim();
  if (!AMOUNT_RE.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
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

export function parseChase(pdf: ExtractedPdf, period: StatementPeriod): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const rows = groupByRow(pdf.items);

  // Track seen key to deduplicate (same txn can appear in payments + purchases sections)
  const seen = new Set<string>();
  let lastDate: string | null = null;

  for (const row of rows) {
    const dateItems = row.filter(i => i.x>=COL.DATE_MIN&&i.x<=COL.DATE_MAX);
    const descItems = row.filter(i => i.x>=COL.DESC_MIN&&i.x<=COL.DESC_MAX);
    const amtItems  = row.filter(i => i.x>=COL.AMT_MIN &&i.x<=COL.AMT_MAX);

    // Update running date if this row has a valid date
    if (dateItems.length) {
      const dateText = dateItems[0]?.text?.trim() ?? '';
      if (DATE_RE.test(dateText)) {
        const [mStr, dStr] = dateText.split('/');
        const m = parseInt(mStr ?? '0', 10);
        const d = parseInt(dStr ?? '0', 10);
        if (m && d) {
          const y = m > period.month ? period.year - 1 : period.year;
          lastDate = `\${y}-\${String(m).padStart(2,'0')}-\${String(d).padStart(2,'0')}`;
        }
      }
    }

    if (!descItems.length || !amtItems.length) continue;
    if (!lastDate) continue;

    const desc = descItems.map(i=>i.text).join(' ').trim();
    if (desc.startsWith('Order Number') || desc.length < 3) continue;
    if (/\$[\d,]+/.test(desc)) continue;
    if (/^[\d,\.]+$/.test(desc.trim())) continue;

    const amtRaw = amtItems.map(i=>parseAmount(i.text)).find(v=>v!==null) ?? null;
    if (amtRaw === null) continue;

    // Deduplicate: date + description + amount
    const key = `\${lastDate}|\${desc}|\${Math.abs(amtRaw)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const isCredit = amtRaw < 0;
    results.push({
      date:           lastDate,
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
