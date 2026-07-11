import { execFile, spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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

// Path to our Python extraction script
const SCRIPT_PATH = join(process.cwd(), 'scripts', 'extract_pdf.py');

export async function extractPdfText(
  buffer: Buffer,
  filename: string
): Promise<ExtractedPdf> {
  // Write buffer to temp file
  const tmpPath = join(tmpdir(), `pfos_${Date.now()}_${filename}`);
  await writeFile(tmpPath, buffer);

  try {
    const { stdout } = await execFileAsync('python3', [SCRIPT_PATH, tmpPath], {
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    const items: PdfTextItem[] = JSON.parse(stdout);
    const pages = items.length ? Math.max(...items.map(i => i.page)) : 0;
    const text  = items.map(i => i.text).join(' ');

    return { items, text, pages, filename };

  } finally {
    await unlink(tmpPath).catch(() => {}); // cleanup temp file
  }
}

export function detectInstitution(text: string): string | null {
  const t = text.toUpperCase();
  // Check USB before WF — USB statements mention Wells Fargo in payroll deposits
  if (t.includes('UNI-STATEMENT') || t.includes('800-US BANKS') ||
      t.includes('USBANK') || t.includes('U.S. BANK'))           return 'us_bank';
  if (t.includes('WELLS FARGO'))                                  return 'wells_fargo';
  if (t.includes('BANK OF AMERICA'))                            return 'bofa';
  if (t.includes('CHASE'))                                      return 'chase';
  if (t.includes('SYNCHRONY'))                                  return 'synchrony';
  if (t.includes('CITI') || t.includes('COSTCO ANYWHERE VISA')) return 'citi';
  return null;
}
