import type { StatementParser, StatementPeriod, ParsedTransaction } from './types';
import type { ExtractedPdf } from '../pdf-extractor';

const COL = {
  REF_MIN:  68.0, REF_MAX:  80.0,
  DESC_MIN: 178.0, DESC_MAX: 445.0,
  AMT_MIN:  445.0, AMT_MAX:  470.0,
};

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[$,]/g, '').trim();
  if (!/^-?\d+\.\d{2}$/.test(cleaned)) return null;
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

// Synchrony PDFs pack multiple refs/descs/amts into single text blocks at the same x.
// Strategy: split each block by newline, then zip ref lines with desc lines and amt lines.
export function parseSynchrony(pdf: ExtractedPdf, period: StatementPeriod): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const seen = new Set<string>();
  const fallbackDate = `${period.year}-${String(period.month).padStart(2,'0')}-01`;

  // Only process pages that have transaction data (skip cover/legal pages)
  const txnPages = [...new Set(pdf.items.map(i => i.page))].filter(p => {
    const pageItems = pdf.items.filter(i => i.page === p);
    return pageItems.some(i => i.x >= COL.REF_MIN && i.x <= COL.REF_MAX &&
      /^[A-Z0-9]{10,}/.test(i.text.trim().split('\n')[0]));
  });

  for (const page of txnPages) {
    const pageItems = pdf.items.filter(i => i.page === page);

    // Get all ref blocks on this page, split by newline
    const refBlocks = pageItems
      .filter(i => i.x >= COL.REF_MIN && i.x <= COL.REF_MAX)
      .sort((a, b) => b.y - a.y);

    // Get all desc blocks, split by newline
    const descBlocks = pageItems
      .filter(i => i.x >= COL.DESC_MIN && i.x <= COL.DESC_MAX)
      .sort((a, b) => b.y - a.y);

    // Get all amount blocks, split by newline
    const amtBlocks = pageItems
      .filter(i => i.x >= COL.AMT_MIN && i.x <= COL.AMT_MAX)
      .sort((a, b) => b.y - a.y);

    // Expand multi-line blocks into individual ref entries with their y positions
    const refs: { ref: string; y: number }[] = [];
    for (const block of refBlocks) {
      const lines = block.text.trim().split('\n').map(l => l.trim()).filter(l => /^[A-Z0-9]{10,}$/.test(l));
      const lineHeight = lines.length > 1 ? 10 : 0;
      lines.forEach((ref, idx) => refs.push({ ref, y: block.y - idx * lineHeight }));
    }

    // Expand desc blocks — skip continuation lines starting with ','
    const descs: { text: string; y: number }[] = [];
    for (const block of descBlocks) {
      const lines = block.text.trim().split('\n').map(l => l.trim());
      const mainLines = lines.filter(l => !l.startsWith(',') && l.length > 0);
      const lineHeight = 10;
      mainLines.forEach((text, idx) => descs.push({ text, y: block.y - idx * lineHeight }));
    }

    // Expand amount blocks
    const amts: { cents: number; y: number }[] = [];
    for (const block of amtBlocks) {
      const lines = block.text.trim().split('\n').map(l => l.trim());
      const lineHeight = 10;
      lines.forEach((line, idx) => {
        const parsed = parseAmount(line);
        if (parsed !== null) amts.push({ cents: parsed, y: block.y - idx * lineHeight });
      });
    }

    // Match refs to nearest desc and amt by y proximity
    for (const ref of refs) {
      if (!/^[A-Z0-9]{10,}$/.test(ref.ref)) continue;

      const nearestDesc = descs.reduce((best, d) =>
        Math.abs(d.y - ref.y) < Math.abs(best.y - ref.y) ? d : best,
        descs[0] ?? { text: '', y: 0 }
      );

      const nearestAmt = amts.reduce((best, a) =>
        Math.abs(a.y - ref.y) < Math.abs(best.y - ref.y) ? a : best,
        amts[0] ?? { cents: 0, y: 0 }
      );

      if (!nearestDesc?.text || nearestAmt?.cents === undefined) continue;
      if (Math.abs(nearestAmt.y - ref.y) > 30) continue; // too far

      const key = `${ref.ref}|${nearestDesc.text}|${nearestAmt.cents}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        date: fallbackDate,
        rawDescription: nearestDesc.text,
        amountCents: Math.abs(nearestAmt.cents),
        direction: nearestAmt.cents < 0 ? 'credit' : 'debit',
      });
    }
  }

  return results;
}

export const SynchronyParser: StatementParser = {
  institution: 'synchrony',
  parse(_text: string, _period: StatementPeriod): ParsedTransaction[] { return []; },
};
