import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { extractPdfText, detectInstitution } from '@/lib/import/pdf-extractor';

export const runtime = 'nodejs';

// POST /api/v1/import/detect
// Accepts PDF, returns detected metadata only (no import)
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = await extractPdfText(buffer, file.name);
    const institution = extracted.meta.institution ?? detectInstitution(extracted.text);

    return NextResponse.json({
      ok: true,
      filename: file.name,
      institution,
      accountLast4: extracted.meta.accountLast4,
      year:  extracted.meta.year,
      month: extracted.meta.month,
      pages: extracted.pages,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
