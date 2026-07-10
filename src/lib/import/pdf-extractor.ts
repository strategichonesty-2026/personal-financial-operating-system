import { PdfReader } from 'pdfreader';

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  page: number;
}

export interface ExtractedPdf {
  items: PdfTextItem[];
  text:  string;   // flat text for institution detection
  pages: number;
  filename: string;
}

export function extractPdfText(
  buffer: Buffer,
  filename: string
): Promise<ExtractedPdf> {
  return new Promise((resolve, reject) => {
    const items: PdfTextItem[] = [];
    let pageCount = 0;
    let currentPage = 0;

    new PdfReader().parseBuffer(buffer, (err, item) => {
      if (err) {
        reject(err);
      } else if (!item) {
        resolve({
          items,
          text: items.map(i => i.text).join(' '),
          pages: pageCount,
          filename,
        });
      } else if (item.page) {
        currentPage = item.page;
        pageCount = item.page;
      } else if (item.text && item.x !== undefined && item.y !== undefined) {
        items.push({
          text: item.text.trim(),
          x:    Math.round(item.x * 10) / 10,
          y:    Math.round(item.y * 10) / 10,
          page: currentPage,
        });
      }
    });
  });
}

export function detectInstitution(text: string): string | null {
  const t = text.toUpperCase();
  if (t.includes('WELLS FARGO'))                               return 'wells_fargo';
  if (t.includes('U.S. BANK') || t.includes('US BANK'))       return 'us_bank';
  if (t.includes('BANK OF AMERICA'))                           return 'bofa';
  if (t.includes('CHASE'))                                     return 'chase';
  if (t.includes('SYNCHRONY'))                                 return 'synchrony';
  if (t.includes('CITI') || t.includes('COSTCO ANYWHERE VISA')) return 'citi';
  return null;
}
