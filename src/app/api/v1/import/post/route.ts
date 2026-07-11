import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { postStagedTransactions } from '@/lib/import/posting-engine';

// POST /api/v1/import/post
// Body: { batchId: string, transactionIds?: string[] }
// Posts approved staged transactions → journal entries
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json() as { batchId: string; transactionIds?: string[] };
    if (!body.batchId) return NextResponse.json({ error: 'batchId required' }, { status: 400 });

    const result = await postStagedTransactions(body.batchId, userId, body.transactionIds);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[Post API]', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
