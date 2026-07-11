export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  page: number;
}

export interface ExtractedPdf {
  items: PdfTextItem[];
  text:  string;
  pages: number;
  filename: string;
}

const EXTRACTOR_URL = process.env.PDF_EXTRACTOR_URL ?? 'https://web-production-e3aba.up.railway.app';
const EXTRACTOR_KEY = process.env.PDF_EXTRACTOR_KEY ?? 'pfos-extractor-2026';

export async function extractPdfText(
  buffer: Buffer,
  filename: string
): Promise<ExtractedPdf> {
  const formData = new FormData();
  const blob = new Blob([buffer], { type: 'application/pdf' });
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

  const data = await res.json() as { ok: boolean; items: PdfTextItem[] };
  if (!data.ok) throw new Error('Extractor returned ok=false');

  const items = data.items;
  const pages = items.length ? Math.max(...items.map(i => i.page)) : 0;
  const text  = items.map(i => i.text).join(' ');

  return { items, text, pages, filename };
}

export function detectInstitution(text: string): string | null {
  const t = text.toUpperCase();
  if (t.includes('UNI-STATEMENT') || t.includes('800-US BANKS') ||
      t.includes('USBANK') || t.includes('U.S. BANK'))           return 'us_bank';
  if (t.includes('WELLS FARGO'))                                  return 'wells_fargo';
  if (t.includes('CITICARDS') || t.includes('COSTCO ANYWHERE VISA')) return 'citi';
  if (t.includes('SYNCHRONY'))                                    return 'synchrony';
  if (t.includes('CHASE'))                                        return 'chase';
  if (t.includes('BANK OF AMERICA'))                              return 'bofa';
  return null;
}
