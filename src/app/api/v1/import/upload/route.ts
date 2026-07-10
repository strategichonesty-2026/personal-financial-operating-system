import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { extractPdfText, detectInstitution } from '@/lib/import/pdf-extractor';

export const runtime = 'nodejs'; // pdf-parse needs Node runtime, not Edge

// POST /api/v1/import/upload
// Accepts: multipart/form-data with field "file" (PDF)
// Returns: { text, pages, institution, filename }
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = await extractPdfText(buffer, file.name);
    const institution = detectInstitution(extracted.text);

    return NextResponse.json({
      ok: true,
      filename: extracted.filename,
      pages: extracted.pages,
      institution,
      // Return first 500 chars for debugging — remove in production
      preview: extracted.text.slice(0, 500),
    });

  } catch (error) {
    console.error('PDF extraction error:', error);
    return NextResponse.json(
      { error: 'Failed to extract PDF text' },
      { status: 500 }
    );
  }
}
