import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';

    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    const items: { text: string; x: number; y: number; page: number }[] = [];

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
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

    return NextResponse.json({ ok: true, items, meta: {} });
  } catch (err) {
    console.error('Local extract error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
