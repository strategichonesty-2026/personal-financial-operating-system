import type { StatementPeriod, ParsedTransaction } from './types';
import type { ExtractedPdf, PdfTextItem } from '../pdf-extractor';

// ─── Column ranges (from real PDF coordinate analysis) ───────────────────────
const CHK_SAV = {
  DATE_MIN:  30, DATE_MAX:  55,   // x≈36
  DESC_MIN:  80, DESC_MAX: 520,   // x≈91
  AMT_MIN:  530, AMT_MAX:  570,   // x≈550 (deposits positive, withdrawals negative)
};

const CC = {
  TXN_DATE_MIN:  30, TXN_DATE_MAX:  60,   // x≈36
  DESC_MIN:     110, DESC_MAX:     490,   // x≈117
  AMT_MIN:      490, AMT_MAX:      570,   // x≈504
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const DATE_SHORT_RE = /^\d{1,2}\/\d{2}$/;       // CC: "01/02"
const DATE_LONG_RE  = /^\d{2}\/\d{2}\/\d{2}$/;  // Chk: "12/30/25"
const AMOUNT_RE     = /^-?\d{1,3}(?:,\d{3})*\.\d{2}$/;

function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!AMOUNT_RE.test(trimmed)) return null;
  const cleaned = trimmed.replace(/[$,]/g, '');
  return Math.round(parseFloat(cleaned) * 100);
}

function groupByRow(items: PdfTextItem[]): PdfTextItem[][] {
  const sorted = [...items].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const rows: PdfTextItem[][] = [];
  let current: PdfTextItem[] = [];
  let currentY: number | null = null;
  let currentPage: number | null = null;

  for (const item of sorted) {
    if (!item.text.trim()) continue;
    const samePage = currentPage === null || item.page === currentPage;
    const sameRow  = currentY  === null || Math.abs(item.y - currentY) <= 3;
    if (samePage && sameRow) {
      current.push(item);
      if (currentY    === null) currentY    = item.y;
      if (currentPage === null) currentPage = item.page;
    } else {
      if (current.length) rows.push(current);
      current    = [item];
      currentY   = item.y;
      currentPage = item.page;
    }
  }
  if (current.length) rows.push(current);
  return rows;
}

// Parse MM/DD/YY → YYYY-MM-DD (checking/savings format)
function parseLongDate(text: string, period: StatementPeriod): string {
  const [mm, dd, yy] = text.split('/').map(Number);
  const year = 2000 + (yy ?? 0);
  return `${year}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
}

// Parse MM/DD → YYYY-MM-DD (CC format, no year on transactions)
function parseShortDate(text: string, period: StatementPeriod): string {
  const [mm, dd] = text.split('/').map(Number);
  // Determine year: if month > period month by a lot, it's prior year
  let year = period.year;
  if (mm && mm > (period.month + 1)) year = period.year - 1;
  return `${year}-${String(mm).padStart(2,'0')}-${String(dd ?? 0).padStart(2,'0')}`;
}

// ─── Checking / Savings parser ────────────────────────────────────────────────
// BofA combines checking + savings in one PDF.
// We detect which account to parse by looking at page headers.
// The caller passes accountId; we parse ALL transactions from matching section.
// Strategy: parse all transactions from the full PDF, tag by section.

function parseCheckingOrSavings(
  pdf: ExtractedPdf,
  period: StatementPeriod
): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const rows = groupByRow(pdf.items);

  // Track which section we're in: deposits or withdrawals
  let inTransactions = false;

  for (const row of rows) {
    const rowText = row.map(i => i.text).join(' ');

    // Section markers — skip the Account Summary lines (y < 350)
    // Real transaction section headers appear after the summary block
    if (rowText.includes('Deposits and other additions') ||
        rowText.includes('Withdrawals and other subtractions')) {
      const rowY = row[0]?.y ?? 0;
      if (rowY > 350) {
        inTransactions = true;
      }
      continue;
    }

    // Stop at totals or next section headers
    if (rowText.includes('Total deposits') ||
        rowText.includes('Total withdrawals') ||
        rowText.includes('Account summary') ||
        rowText.includes('Your account is enrolled')) {
      continue;
    }

    if (!inTransactions) continue;

    const dateItems = row.filter(i => i.x >= CHK_SAV.DATE_MIN && i.x <= CHK_SAV.DATE_MAX);
    const descItems = row.filter(i => i.x >= CHK_SAV.DESC_MIN && i.x <= CHK_SAV.DESC_MAX);
    const amtItems  = row.filter(i => i.x >= CHK_SAV.AMT_MIN  && i.x <= CHK_SAV.AMT_MAX);

    if (!dateItems.length) continue;
    const dateText = dateItems[0]?.text ?? '';
    if (!DATE_LONG_RE.test(dateText)) continue;

    const amtRaw = amtItems.map(i => i.text.trim()).find(t => AMOUNT_RE.test(t));
    if (!amtRaw) continue;

    const amtCents = parseAmount(amtRaw);
    if (!amtCents || amtCents === 0) continue;

    const desc = descItems.map(i => i.text).filter(t => t !== '$').join(' ').trim();
    const date = parseLongDate(dateText, period);

    results.push({
      date,
      rawDescription: desc,
      amountCents: Math.abs(amtCents),
      direction: amtCents < 0 ? 'debit' : 'credit',
    });
  }

  return results;
}

// ─── Credit Card parser ───────────────────────────────────────────────────────
function parseCreditCard(
  pdf: ExtractedPdf,
  period: StatementPeriod
): ParsedTransaction[] {
  const results: ParsedTransaction[] = [];
  const rows = groupByRow(pdf.items);

  let inTransactions = false;
  let currentSection: 'payments' | 'purchases' | 'interest' | null = null;

  for (const row of rows) {
    const rowText = row.map(i => i.text).join(' ');

    // Section detection
    if (rowText.includes('Payments and Other Credits')) {
      inTransactions = true;
      currentSection = 'payments';
      continue;
    }
    if (rowText.includes('Purchases and Adjustments')) {
      inTransactions = true;
      currentSection = 'purchases';
      continue;
    }
    if (rowText.includes('Interest Charged')) {
      currentSection = 'interest';
      continue;
    }
    if (rowText.includes('TOTAL PAYMENTS') ||
        rowText.includes('TOTAL PURCHASES') ||
        rowText.includes('TOTAL INTEREST') ||
        rowText.includes('TOTAL FEES')) {
      continue;
    }
    // Interest rows — include as debits
    if (currentSection === 'interest' && rowText.includes('TOTAL INTEREST')) continue;
    if (!inTransactions) continue;

    const dateItems = row.filter(i => i.x >= CC.TXN_DATE_MIN && i.x <= CC.TXN_DATE_MAX);
    const descItems = row.filter(i => i.x >= CC.DESC_MIN     && i.x <= CC.DESC_MAX);
    const amtItems  = row.filter(i => i.x >= CC.AMT_MIN      && i.x <= CC.AMT_MAX);

    if (!dateItems.length) continue;
    const dateText = dateItems[0]?.text ?? '';
    if (!DATE_SHORT_RE.test(dateText)) continue;

    // Amount: may be split across two items (e.g. "-" and "26.00")
    const amtTexts = amtItems.map(i => i.text.trim());
    // Handle split amounts: ["-", "$", "1,079.89"] or ["-", "26.00"]
    const neg = amtTexts.includes('-');
    const num = amtTexts.find(t => AMOUNT_RE.test(t.trim()));
    if (!num) continue;
    const amtCents = parseAmount(neg ? `-${num}` : num) ?? 0;
    if (amtCents === 0) continue;

    const desc = descItems.map(i => i.text).filter(t => t !== '$').join(' ').trim();
    const date = parseShortDate(dateText, period);

    // For CC: payments are credits (reduce balance), purchases are debits
    const direction: 'debit' | 'credit' =
      currentSection === 'payments' ? 'credit' : 'debit';

    results.push({
      date,
      rawDescription: desc,
      amountCents: Math.abs(amtCents),
      direction,
    });
  }

  return results;
}

// ─── Main exported parser ─────────────────────────────────────────────────────
// BofA combined PDF contains both checking (1961) and savings (6951).
// We detect which account by looking for account number in the PDF items.
export function parseBofa(
  pdf: ExtractedPdf,
  period: StatementPeriod,
  accountLast4?: string
): ParsedTransaction[] {
  // Detect if this is a CC statement
  const allText = pdf.items.map(i => i.text).join(' ');
  const isCC = allText.includes('Purchases and Adjustments') ||
               allText.includes('Payments and Other Credits') ||
               allText.includes('New Balance Total');

  if (isCC) {
    return parseCreditCard(pdf, period);
  }

  // Checking/savings: BofA combined PDF has both accounts.
  // Filter items to only the relevant account's pages.
  // Account sections are identified by "Account number: XXXX XXXX XXXX" headers.
  // 1961 = checking (pages 3-4), 6951 = savings (pages 5+)
  // Strategy: filter items by page range based on account number in page header.

  if (accountLast4) {
    // Find pages that belong to this account
    const accountPages = new Set<number>();
    for (const item of pdf.items) {
      if (item.text.includes(accountLast4) && item.x > 400) {
        // Page header contains account number — mark nearby pages
        accountPages.add(item.page);
        accountPages.add(item.page + 1); // transactions often span next page
      }
    }

    if (accountPages.size > 0) {
      // Find the NEXT account's starting page to set an upper bound
      const accountPagesSorted = Array.from(accountPages).sort((a, b) => a - b);
      const minPage = accountPagesSorted[0] ?? 1;
      
      // Find where the next account section starts (next "Account number:" header after our pages)
      const nextAccountPage = pdf.items
        .filter(i => i.text.startsWith('Account number:') && i.page > minPage && !i.text.includes(accountLast4))
        .map(i => i.page)
        .sort((a, b) => a - b)[0] ?? 999;

      const filteredPdf = {
        ...pdf,
        items: pdf.items.filter(i => i.page >= minPage && i.page < nextAccountPage),
      };
      return parseCheckingOrSavings(filteredPdf, period);
    }
  }

  // Fallback: parse all transactions (works if only one account type uploaded)
  return parseCheckingOrSavings(pdf, period);
}

// ─── Period extraction ────────────────────────────────────────────────────────
export function extractBofaPeriod(pdf: ExtractedPdf): { periodStart: string; periodEnd: string } | null {
  for (const item of pdf.items) {
    // Checking/savings: "for December 20, 2025 to January 21, 2026"
    const m1 = item.text.match(/for\s+(\w+ \d+,\s*\d{4})\s+to\s+(\w+ \d+,\s*\d{4})/i);
    if (m1) {
      const start = parseMonthDayYear(m1[1] ?? '');
      const end   = parseMonthDayYear(m1[2] ?? '');
      if (start && end) return { periodStart: start, periodEnd: end };
    }
    // CC: "December 24 - January 23, 2026"
    const m2 = item.text.match(/(\w+ \d+)\s*[-–]\s*(\w+ \d+,\s*\d{4})/i);
    if (m2) {
      const endStr   = m2[2] ?? '';
      const endYear  = endStr.match(/\d{4}/)?.[0] ?? '';
      const startStr = `${m2[1] ?? ''}, ${endYear}`;
      const start = parseMonthDayYear(startStr);
      const end   = parseMonthDayYear(endStr);
      if (start && end) return { periodStart: start, periodEnd: end };
    }
  }
  return null;
}

const MONTHS: Record<string, string> = {
  january:'01', february:'02', march:'03', april:'04', may:'05', june:'06',
  july:'07', august:'08', september:'09', october:'10', november:'11', december:'12',
};

function parseMonthDayYear(str: string): string | null {
  const m = str.trim().match(/(\w+)\s+(\d+),?\s*(\d{4})/);
  if (!m) return null;
  const month = MONTHS[(m[1] ?? '').toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${String(m[2]).padStart(2,'0')}`;
}
