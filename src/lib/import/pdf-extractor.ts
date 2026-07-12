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

const EXTRACTOR_URL = process.env.PDF_EXTRACTOR_URL ?? 'https://web-production-e3aba.up.railway.app';
const EXTRACTOR_KEY = process.env.PDF_EXTRACTOR_KEY ?? 'pfos-extractor-2026';

export async function extractPdfText(
  buffer: Buffer,
  filename: string
): Promise<ExtractedPdf> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: 'application/pdf' });
  formData.append('file', blob, filename);

  const res = await fetch(`${EXTRACTOR_URL}/extract`, {
    method: 'POST',
    headers: { 'x-api-key': EXTRACTOR_KEY },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Extractor error ${res.status}: ${err}`);
  }

  const data = await res.json() as { ok: boolean; items: PdfTextItem[]; meta: PdfMeta };
  if (!data.ok) throw new Error('Extractor returned ok=false');

  const items = data.items;
  const pages = items.length ? Math.max(...items.map(i => i.page)) : 0;
  const text  = items.map(i => i.text).join(' ');

  // Extract actual statement period dates from PDF items
  const meta = { ...data.meta, periodStart: null as string|null, periodEnd: null as string|null };
  // Extract last4 from filename if extractor didn't find it
  if (!meta.accountLast4) {
    const fnMatch = filename.match(/\b(\d{4})\b/);
    if (fnMatch) meta.accountLast4 = fnMatch[1] ?? null;
  }
  const beginMatch = text.match(/beginning balance on (\d{1,2})\/(\d{1,2})/i);
  const endMatch   = text.match(/ending balance on (\d{1,2})\/(\d{1,2})/i);
  if (beginMatch && meta.year && meta.month) {
    const bm = parseInt(beginMatch[1]??'0'), bd = parseInt(beginMatch[2]??'0');
    const byr = bm > meta.month ? meta.year - 1 : meta.year;
    meta.periodStart = `${byr}-${String(bm).padStart(2,'0')}-${String(bd).padStart(2,'0')}`;
  }
  if (endMatch && meta.year && meta.month) {
    const em = parseInt(endMatch[1]??'0'), ed = parseInt(endMatch[2]??'0');
    meta.periodEnd = `${meta.year}-${String(em).padStart(2,'0')}-${String(ed).padStart(2,'0')}`;
  }
  return { items, text, pages, filename, meta };
}

export function detectInstitution(text: string): string | null {
  const t = text.toUpperCase();
  if (t.includes('UNI-STATEMENT') || t.includes('800-US BANKS') ||
      t.includes('USBANK') || t.includes('U.S. BANK'))           return 'us_bank';
  if (t.includes('BANK OF AMERICA'))                              return 'bofa';
  if (t.includes('CITICARDS') || t.includes('COSTCO ANYWHERE VISA')) return 'citi';
  if (t.includes('SYNCHRONY'))                                    return 'synchrony';
  if (t.includes('CHASE'))                                        return 'chase';
  if (t.includes('WELLS FARGO'))                                  return 'wells_fargo';
  return null;
}
