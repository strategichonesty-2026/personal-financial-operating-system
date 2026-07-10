import * as pdfParse from 'pdf-parse';

export interface ExtractedPdf {
  text: string;
  pages: number;
  filename: string;
}

export async function extractPdfText(
  buffer: Buffer,
  filename: string
): Promise<ExtractedPdf> {
  const data = await pdfParse(buffer);
  return {
    text: data.text,
    pages: data.numpages,
    filename,
  };
}

// Detect institution from PDF text
export function detectInstitution(text: string): string | null {
  const t = text.toUpperCase();
  if (t.includes('WELLS FARGO'))         return 'wells_fargo';
  if (t.includes('U.S. BANK') || t.includes('US BANK')) return 'us_bank';
  if (t.includes('BANK OF AMERICA'))     return 'bofa';
  if (t.includes('CHASE'))               return 'chase';
  if (t.includes('SYNCHRONY'))           return 'synchrony';
  if (t.includes('CITI') || t.includes('COSTCO ANYWHERE VISA')) return 'citi';
  return null;
}
