import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { importBatches, reconciliations, stagedTransactions } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const batches = await db.select().from(importBatches)
    .where(eq(importBatches.userId, userId))
    .orderBy(desc(importBatches.createdAt))
    .limit(50);

  const batchesWithMeta = await Promise.all(batches.map(async (b) => {
    const txnCount = await db.select({ count: sql<number>`count(*)` })
      .from(stagedTransactions).where(eq(stagedTransactions.batchId, b.id));
    const recon = await db.select().from(reconciliations)
      .where(eq(reconciliations.accountId, b.accountId))
      .orderBy(desc(reconciliations.createdAt)).limit(1);
    return {
      id: b.id, filename: b.filename, institution: b.institution,
      accountId: b.accountId, status: b.status, createdAt: b.createdAt,
      txnCount: Number(txnCount[0]?.count ?? 0),
      reconciliation: recon[0] ?? null,
    };
  }));

  return NextResponse.json({ ok: true, batches: batchesWithMeta });
}
