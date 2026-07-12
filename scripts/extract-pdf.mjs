import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerPath = join(__dirname, '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');

const pdfjsLib = await import('../node_modules/pdfjs-dist/legacy/build/pdf.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;

const inputPath = process.argv[2];
if (!inputPath) { process.stderr.write('No input path'); process.exit(1); }

const buffer = readFileSync(inputPath);
const pdfDoc = await (pdfjsLib.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true })).promise;

const items = [];
for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.0 });
  const textContent = await page.getTextContent();
  const pageHeight = viewport.height;
  for (const item of textContent.items) {
    if (!('str' in item)) continue;
    const str = item.str.trim();
    if (!str) continue;
    const tx = item.transform;
    const x = Math.round(tx[4] * 10) / 10;
    const y = Math.round((pageHeight - tx[5]) * 10) / 10;
    items.push({ text: str, x, y, page: pageNum });
  }
}

process.stdout.write(JSON.stringify({ ok: true, pages: pdfDoc.numPages, items }));
