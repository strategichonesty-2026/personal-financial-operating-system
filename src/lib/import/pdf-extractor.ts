

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  page: number;
}

export interface PdfMeta {
  institution: string | null;
  accountLast4: string | null;
  year: number | null;
  month: number | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface ExtractedPdf {
  items: PdfTextItem[];
  text:  string;
  pages: number;
  filename: string;
  meta: PdfMeta;
}

const MONTH_MAP: Record<string,string> = {
  january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',
  july:'07',august:'08',september:'09',october:'10',november:'11',december:'12',
  jan:'01',feb:'02',mar:'03',apr:'04',jun:'06',
  jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
};

function parseMonthDayYear(s: string): string | null {
  const m = s.match(/^(\w+)\s+(\d{1,2}),?\s*(\d{4})$/);
  if (!m) return null;
  const mon = MONTH_MAP[m[1]!.toLowerCase()];
  if (!mon) return null;
  return `${m[3]}-${mon}-${m[2]!.padStart(2,'0')}`;
}

export async function extractPdfText(
  buffer: Buffer,
  filename: string
): Promise<ExtractedPdf> {
  try {
    // Use pdfjs-dist directly (works in both local and Vercel serverless)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs') as any;
    // Use fake worker for serverless environments (Vercel)
    const { GlobalWorkerOptions } = pdfjsLib;
    GlobalWorkerOptions.workerSrc = '';
    // Import fake worker to enable serverless PDF parsing
    // @ts-ignore
    await import('pdfjs-dist/legacy/build/pdf.worker.mjs').catch(() => {});

    const pdfDoc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
    const extractedItems: PdfTextItem[] = [];

    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();
      const pageHeight = viewport.height;
      for (const item of textContent.items as any[]) {
        if (!('str' in item)) continue;
        const str = item.str.trim();
        if (!str) continue;
        const tx = item.transform as number[];
        const x = Math.round((tx[4] ?? 0) * 10) / 10;
        const y = Math.round((pageHeight - (tx[5] ?? 0)) * 10) / 10;
        extractedItems.push({ text: str, x, y, page: pageNum });
      }
    }

    const items = extractedItems;
    const text = items.map(i => i.text).join(' ');

    const allMatches = Array.from(filename.matchAll(/\b(\d{4})\b/g))
      .filter(m => !['2024','2025','2026','2027'].includes(m[1]??'')); 
    const fnMatch = allMatches[allMatches.length - 1];
    let accountLast4 = fnMatch?.[1] ?? null;

    // BofA: "Account number: 3940 0087 1961" — last 4 digits
    if (!accountLast4) {
      const acctNumItem = items.find(i => /^account number:/i.test(i.text.trim()));
      if (acctNumItem) {
        const digits = acctNumItem.text.replace(/\s/g, '').match(/\d{4}$/);
        if (digits) accountLast4 = digits[0];
      }
    }

    // USB Credit Card: "Ending in" label + "#### #### #### 0546" on same row
    if (!accountLast4) {
      const endingInItem = items.find(i => /^ending in$/i.test(i.text.trim()));
      if (endingInItem) {
        const sameRow = items.filter(i =>
          i.page === endingInItem.page && Math.abs(i.y - endingInItem.y) <= 3 && i.x > endingInItem.x
        );
        const maskedItem = sameRow.sort((a,b) => a.x-b.x).find(i => /\d{4}$/.test(i.text.trim()));
        if (maskedItem) {
          const m = maskedItem.text.trim().match(/(\d{4})$/);
          if (m) accountLast4 = m[1]!;
        }
      }
    }

    // Citi: "Account number ending in: 4621" as single item
    if (!accountLast4) {
      const citiAcct = items.find(i => /account number ending in:/i.test(i.text));
      if (citiAcct) {
        const m = citiAcct.text.match(/(\d{4})\s*$/);
        if (m) accountLast4 = m[1]!;
      }
    }

    // WF Credit Card: "Account ending in 6317" as single text item
    if (!accountLast4) {
      const wfCCAcct = items.find(i => /^account ending in \d{4}$/i.test(i.text.trim()));
      if (wfCCAcct) {
        const m = wfCCAcct.text.trim().match(/(\d{4})$/);
        if (m) accountLast4 = m[1]!;
      }
    }

    // Fallback: extract last4 from PDF "Account ending XXXX" or "ending in XXXX"
    if (!accountLast4) {
      const endingIdx = items.findIndex(i => /^ending(\s+in)?$/i.test(i.text.trim()));
      if (endingIdx >= 0) {
        const label = items[endingIdx]!;
        const sameRow = items.filter(i =>
          i.page === label.page && Math.abs(i.y - label.y) <= 3 && i.x > label.x
        );
        const last4Item = sameRow.sort((a,b) => a.x-b.x).find(i => /^\d{4}$/.test(i.text.trim()));
        if (last4Item) accountLast4 = last4Item.text.trim();
      }
    }

    let periodStart: string | null = null;
    let periodEnd: string | null = null;

    // US Bank: "Dec 18, 2025 [through] Jan 21, 2026" as separate PDF items
    const throughIdx = items.findIndex(i => i.text.trim().toLowerCase() === 'through');
    if (throughIdx > 0) {
      periodStart = parseMonthDayYear(items[throughIdx - 1]?.text?.trim() ?? '');
      periodEnd   = parseMonthDayYear(items[throughIdx + 1]?.text?.trim() ?? '');
    }

    // Citi: "Billing Period: 03/04/26-04/02/26" as single combined item
    if (!periodStart || !periodEnd) {
      const billingCombined = items.find(i => /billing period:/i.test(i.text));
      if (billingCombined) {
        const m = billingCombined.text.match(/(\d{2})\/(\d{2})\/(\d{2})[-–](\d{2})\/(\d{2})\/(\d{2})/);
        if (m) {
          periodStart = `20${m[3]}-${m[1]}-${m[2]}`;
          periodEnd   = `20${m[6]}-${m[4]}-${m[5]}`;
        }
      }
    }

    // Citi: "Billing" + "Period:" + "12/03/25-01/02/26" as separate items on same row
    if (!periodStart || !periodEnd) {
      const billingIdx = items.findIndex(i => /^billing$/i.test(i.text.trim()));
      if (billingIdx >= 0) {
        const label = items[billingIdx]!;
        // Find date range item on same row
        const sameRow = items.filter(i =>
          i.page === label.page && Math.abs(i.y - label.y) <= 3 && i.x > label.x
        );
        for (const item of sameRow) {
          const m = item.text.match(/(\d{2})\/(\d{2})\/(\d{2})[-–](\d{2})\/(\d{2})\/(\d{2})/);
          if (m) {
            periodStart = `20${m[3]}-${m[1]}-${m[2]}`;
            periodEnd   = `20${m[6]}-${m[4]}-${m[5]}`;
            break;
          }
        }
      }
    }

    // Chase: "Opening/Closing Date  12/26/25 - 01/25/26"
    if (!periodStart || !periodEnd) {
      const chaseIdx = items.findIndex(i => /opening\/closing date/i.test(i.text));
      if (chaseIdx >= 0) {
        const label = items[chaseIdx]!;
        const same = items.filter(i => i.page===label.page && Math.abs(i.y-label.y)<=3 && i.x>label.x);
        const dateRange = same.sort((a,b)=>a.x-b.x)[0]?.text ?? '';
        const m = dateRange.match(/(\d{2})\/(\d{2})\/(\d{2})\s*-\s*(\d{2})\/(\d{2})\/(\d{2})/);
        if (m) {
          const yr1 = 2000+parseInt(m[3]!), yr2 = 2000+parseInt(m[6]!);
          periodStart = `${yr1}-${m[1]}-${m[2]}`;
          periodEnd   = `${yr2}-${m[4]}-${m[5]}`;
        }
      }
    }

    // WF Credit Card: "Statement Period 06/06/2026 to 07/07/2026" as single item
    if (!periodStart || !periodEnd) {
      const wfCCPeriod = items.find(i => /^statement period/i.test(i.text.trim()));
      if (wfCCPeriod) {
        const m = wfCCPeriod.text.match(/(\d{2})\/(\d{2})\/(\d{4})\s+to\s+(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) {
          periodStart = `${m[3]}-${m[1]}-${m[2]}`;
          periodEnd   = `${m[6]}-${m[4]}-${m[5]}`;
        }
      }
    }

    // Synchrony: "31 Day Billing Cycle from 12/17/2025 to 01/16/2026"
    if (!periodStart || !periodEnd) {
      const syncIdx = items.findIndex(i => /billing cycle from/i.test(i.text));
      if (syncIdx >= 0) {
        const m = items[syncIdx]!.text.match(/(\d{2}\/\d{2}\/\d{4})\s+to\s+(\d{2}\/\d{2}\/\d{4})/);
        if (m) {
          const [sm,sd,sy] = m[1]!.split('/');
          const [em,ed,ey] = m[2]!.split('/');
          periodStart = `${sy}-${sm}-${sd}`;
          periodEnd   = `${ey}-${em}-${ed}`;
        }
      }
    }

    // BofA checking/savings: "for December 20, 2025 to January 21, 2026"
    if (!periodStart || !periodEnd) {
      const m = text.match(/for\s+(\w+ \d+,\s*\d{4})\s+to\s+(\w+ \d+,\s*\d{4})/i);
      if (m) {
        periodStart = parseMonthDayYear(m[1] ?? '');
        periodEnd   = parseMonthDayYear(m[2] ?? '');
      }
    }

    // BofA CC: "December 24 - January 23, 2026"
    if (!periodStart || !periodEnd) {
      const m = text.match(/(\w+ \d+)\s*-\s*(\w+ \d+,\s*\d{4})/);
      if (m) {
        const endStr   = m[2] ?? '';
        const endYear  = parseInt(endStr.match(/\d{4}/)?.[0] ?? '0');
        const startStr = m[1] ?? '';
        const startMonth = startStr.match(/^(\w+)/)?.[1]?.toLowerCase() ?? '';
        // If start month is later in year than end month, start is prior year
        const lateMonths = ['july','august','september','october','november','december'];
        const startYear = lateMonths.includes(startMonth) ? endYear - 1 : endYear;
        periodStart = parseMonthDayYear(`${startStr}, ${startYear}`);
        periodEnd   = parseMonthDayYear(endStr);
      }
    }

    // WF fallback: "Beginning balance on MM/DD"
    if (!periodStart) {
      const m = text.match(/beginning balance on (\d{1,2})\/(\d{1,2})/i);
      if (m) {
        const bm = parseInt(m[1]??'0'), bd = parseInt(m[2]??'0');
        periodStart = `2026-${String(bm).padStart(2,'0')}-${String(bd).padStart(2,'0')}`;
      }
    }
    if (!periodEnd) {
      const m = text.match(/ending balance on (\d{1,2})\/(\d{1,2})/i);
      if (m) {
        const em = parseInt(m[1]??'0'), ed = parseInt(m[2]??'0');
        periodEnd = `2026-${String(em).padStart(2,'0')}-${String(ed).padStart(2,'0')}`;
      }
    }

    const meta: PdfMeta = {
      institution: null, accountLast4, year: null, month: null, periodStart, periodEnd,
    };

    return { items, text, pages: items.length > 0 ? Math.max(...items.map(i => i.page)) : 0, filename, meta };

  } catch (err) {
    throw new Error(`PDF extraction failed: ${String(err)}`);
  }
}

export function detectInstitution(text: string): string | null {
  const t = text.toUpperCase();
  if (t.includes('BANK OF AMERICA') || t.includes('BANKOFAMERICA'))  return 'bofa';
  if (/U\.S\.\s*BANK\s*SHIELD/i.test(text) || /U\.S\.\s*BANK.*VISA/i.test(text)) return 'usb_credit';
  if (t.includes('UNI-STATEMENT') || t.includes('800-US BANKS') ||
      t.includes('USBANK') || t.includes('U.S. BANK') ||
      t.includes('CARDMEMBER SERVICE'))  return 'us_bank';
  if (t.includes('CITICARDS') || t.includes('COSTCO ANYWHERE VISA')) return 'citi';
  if (t.includes('SYNCHRONY'))                                    return 'synchrony';
  if (/WELLS FARGO REFLECT|WELLS FARGO.*VISA|WELLS FARGO.*CREDIT CARD/i.test(text)) return 'wf_credit';
  if (t.includes('WELLS FARGO'))                                  return 'wells_fargo';
  if (t.includes('CHASE'))                                        return 'chase';
  return null;
}
