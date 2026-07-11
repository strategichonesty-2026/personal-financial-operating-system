import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runImportPipeline } from '@/lib/import/pipeline';

export const runtime = 'nodejs';

// POST /api/v1/import
// Body: multipart/form-data
//   file         — PDF file
//   accountId    — UUID of the account
//   year         — statement year (number)
//   month        — statement month 1-12 (number)
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file                = formData.get('file') as File | null;
    const accountId           = formData.get('accountId') as string | null;
    const yearStr             = formData.get('year') as string | null;
    const monthStr            = formData.get('month') as string | null;
    const institutionOverride = formData.get('institution') as string | null;

    if (!file)      return NextResponse.json({ error: 'No file'      }, { status: 400 });
    if (!accountId) return NextResponse.json({ error: 'No accountId' }, { status: 400 });
    if (!yearStr)   return NextResponse.json({ error: 'No year'      }, { status: 400 });
    if (!monthStr)  return NextResponse.json({ error: 'No month'     }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    // Use provided year/month, or fall back to auto-detected from PDF
    const year  = yearStr  ? parseInt(yearStr, 10)  : null;
    const month = monthStr ? parseInt(monthStr, 10) : null;

    if (!year || !month) {
      return NextResponse.json({ error: 'Could not detect statement period — please select manually' }, { status: 400 });
    }

    const result = await runImportPipeline(
      buffer,
      file.name,
      accountId,
      userId,
      year,
      month,
      institutionOverride || null
    );

    return NextResponse.json({ ok: true, ...result });

  } catch (error) {
    console.error('Import pipeline error:', error);
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}

// GET /api/v1/import — list recent import batches
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { db } = await import('@/lib/db');
  const { importBatches } = await import('@/lib/db/schema');
  const { eq, desc } = await import('drizzle-orm');

  const batches = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.userId, userId))
    .orderBy(desc(importBatches.createdAt))
    .limit(20);

  return NextResponse.json({ ok: true, batches });
}
