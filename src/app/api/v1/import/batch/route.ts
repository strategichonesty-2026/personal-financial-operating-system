import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { stagedTransactions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const batchId = req.nextUrl.searchParams.get('batchId');
  if (!batchId) return NextResponse.json({ error: 'Missing batchId' }, { status: 400 });

  const rows = await db
    .select()
    .from(stagedTransactions)
    .where(eq(stagedTransactions.batchId, batchId));

  const transactions = rows.map(r => ({
    description: r.description,
    date: r.txnDate,
    amountCents: r.amountCents,
    direction: r.direction,
  }));

  return NextResponse.json({ ok: true, transactions });
}
