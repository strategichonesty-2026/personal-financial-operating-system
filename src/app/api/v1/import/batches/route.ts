import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { db } = await import('@/lib/db');
  const { importBatches } = await import('@/lib/db/schema/import-batches');
  const { stagedTransactions } = await import('@/lib/db/schema/staged-transactions');
  const { accounts } = await import('@/lib/db/schema/accounts');
  const { eq, count } = await import('drizzle-orm');

  const batches = await db
    .select({
      id: importBatches.id,
      filename: importBatches.filename,
      institution: importBatches.institution,
      accountId: importBatches.accountId,
      accountName: accounts.name,
      periodStart: importBatches.periodStart,
      periodEnd: importBatches.periodEnd,
      status: importBatches.status,
    })
    .from(importBatches)
    .leftJoin(accounts, eq(importBatches.accountId, accounts.id))
    .where(eq(importBatches.userId, userId));

  const counts = await db
    .select({ batchId: stagedTransactions.batchId, status: stagedTransactions.status, cnt: count() })
    .from(stagedTransactions)
    .groupBy(stagedTransactions.batchId, stagedTransactions.status);

  const countMap: Record<string, { pending: number; posted: number; duplicate: number }> = {};
  for (const row of counts) {
    if (!countMap[row.batchId]) countMap[row.batchId] = { pending: 0, posted: 0, duplicate: 0 };
    if (row.status === 'pending') countMap[row.batchId].pending = Number(row.cnt);
    if (row.status === 'posted') countMap[row.batchId].posted = Number(row.cnt);
    if (row.status === 'duplicate') countMap[row.batchId].duplicate = Number(row.cnt);
  }

  // Extract last4 from account name e.g. "Wells Fargo Checking (4184)" -> "4184"
  function extractLast4(name: string | null): string {
    if (!name) return '????';
    const m1 = name.match(/\((\d{4})\)/);
    if (m1) return m1[1];
    const m2 = name.match(/(\d{4})$/);
    return m2 ? m2[1] : '????';
  }

  const enriched = batches.map(b => {
    const c = countMap[b.id] ?? { pending: 0, posted: 0, duplicate: 0 };
    return {
      id: b.id,
      filename: b.filename,
      institution: b.institution,
      accountRef: extractLast4(b.accountName),
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      status: b.status,
      transactionCount: c.pending + c.posted + c.duplicate,
      pendingCount: c.pending,
      postedCount: c.posted,
    };
  });

  return NextResponse.json({ batches: enriched });
}
