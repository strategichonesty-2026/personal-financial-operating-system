import { PdfReader } from 'pdfreader';

export interface ExtractedPdf {
  text: string;
  pages: number;
  filename: string;
}

export function extractPdfText(
  buffer: Buffer,
  filename: string
): Promise<ExtractedPdf> {
  return new Promise((resolve, reject) => {
    const lines: string[] = [];
    let pageCount = 0;

    new PdfReader().parseBuffer(buffer, (err, item) => {
      if (err) {
        reject(err);
      } else if (!item) {
        // End of file
        resolve({
          text: lines.join('\n'),
          pages: pageCount,
          filename,
        });
      } else if (item.page) {
        pageCount = item.page;
      } else if (item.text) {
        lines.push(item.text);
      }
    });
  });
}

// Detect institution from PDF text
export function detectInstitution(text: string): string | null {
  const t = text.toUpperCase();
  if (t.includes('WELLS FARGO'))                          return 'wells_fargo';
  if (t.includes('U.S. BANK') || t.includes('US BANK'))  return 'us_bank';
  if (t.includes('BANK OF AMERICA'))                      return 'bofa';
  if (t.includes('CHASE'))                                return 'chase';
  if (t.includes('SYNCHRONY'))                            return 'synchrony';
  if (t.includes('CITI') || t.includes('COSTCO ANYWHERE VISA')) return 'citi';
  return null;
}
