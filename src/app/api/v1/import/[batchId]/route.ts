import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const runtime = 'nodejs';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { batchId } = params;
  const { db } = await import('@/lib/db');
  const { stagedTransactions, journalEntries, journalEntryLines, importBatches } = await import('@/lib/db/schema');
  const { eq, and, inArray } = await import('drizzle-orm');

  const batch = await db.select({ id: importBatches.id })
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)))
    .limit(1);

  if (batch.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const staged = await db.select({ journalEntryId: stagedTransactions.journalEntryId })
    .from(stagedTransactions).where(eq(stagedTransactions.batchId, batchId));

  const jeIds = staged.map(r => r.journalEntryId).filter((id): id is string => id !== null);

  if (jeIds.length > 0) {
    await db.delete(journalEntryLines).where(inArray(journalEntryLines.journalEntryId, jeIds));
    await db.delete(journalEntries).where(inArray(journalEntries.id, jeIds));
  }
  await db.delete(stagedTransactions).where(eq(stagedTransactions.batchId, batchId));
  await db.delete(importBatches).where(eq(importBatches.id, batchId));

  return NextResponse.json({ ok: true, deletedBatchId: batchId });
}
