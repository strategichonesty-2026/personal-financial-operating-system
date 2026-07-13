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

    // US Bank: "Dec 18, 2025 [through] Jan 21, 2026" as separate PDF items
    const throughIdx = items.findIndex(i => i.text.trim().toLowerCase() === 'through');
    if (throughIdx > 0) {
      periodStart = parseMonthDayYear(items[throughIdx - 1]?.text?.trim() ?? '');
      periodEnd   = parseMonthDayYear(items[throughIdx + 1]?.text?.trim() ?? '');
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
