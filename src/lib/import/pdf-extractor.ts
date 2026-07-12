import { execFile } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

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

export async function extractPdfText(
  buffer: Buffer,
  filename: string
): Promise<ExtractedPdf> {
  // Write buffer to temp file
  const tmpPath = join(tmpdir(), `pfos-${randomUUID()}.pdf`);
  await writeFile(tmpPath, buffer);

  try {
    const scriptPath = join(process.cwd(), 'scripts', 'extract-pdf.mjs');
    const raw = await new Promise<string>((resolve, reject) => {
      execFile('node', [scriptPath, tmpPath], { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      });
    });

    const data = JSON.parse(raw) as { ok: boolean; pages: number; items: PdfTextItem[] };
    if (!data.ok) throw new Error('Extractor returned ok=false');

    const items = data.items;
    const text = items.map(i => i.text).join(' ');

    const allMatches = Array.from(filename.matchAll(/\b(\d{4})\b/g))
      .filter(m => !['2024','2025','2026','2027'].includes(m[1]??''));
    const fnMatch = allMatches[allMatches.length - 1];
    const accountLast4 = fnMatch?.[1] ?? null;

    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    const beginMatch = text.match(/beginning balance on (\d{1,2})\/(\d{1,2})/i);
    const endMatch   = text.match(/ending balance on (\d{1,2})\/(\d{1,2})/i);
    if (beginMatch) {
      const bm = parseInt(beginMatch[1]??'0'), bd = parseInt(beginMatch[2]??'0');
      periodStart = `2026-${String(bm).padStart(2,'0')}-${String(bd).padStart(2,'0')}`;
    }
    if (endMatch) {
      const em = parseInt(endMatch[1]??'0'), ed = parseInt(endMatch[2]??'0');
      periodEnd = `2026-${String(em).padStart(2,'0')}-${String(ed).padStart(2,'0')}`;
    }

    const meta: PdfMeta = {
      institution: null, accountLast4, year: null, month: null, periodStart, periodEnd,
    };

    return { items, text, pages: data.pages, filename, meta };

  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

export function detectInstitution(text: string): string | null {
  const t = text.toUpperCase();
  if (t.includes('UNI-STATEMENT') || t.includes('800-US BANKS') ||
      t.includes('USBANK') || t.includes('U.S. BANK'))           return 'us_bank';
  if (t.includes('BANK OF AMERICA'))                              return 'bofa';
  if (t.includes('CITICARDS') || t.includes('COSTCO ANYWHERE VISA')) return 'citi';
  if (t.includes('SYNCHRONY'))                                    return 'synchrony';
  if (t.includes('WELLS FARGO'))                                  return 'wells_fargo';
  if (t.includes('CHASE'))                                        return 'chase';
  return null;
}
