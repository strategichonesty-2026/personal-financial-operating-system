import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { db } = await import('@/lib/db');
    const { importBatches } = await import('@/lib/db/schema/import-batches');
    const { stagedTransactions } = await import('@/lib/db/schema/staged-transactions');
    const { eq, and, isNotNull, or } = await import('drizzle-orm');
    const { runReconciliation } = await import('@/lib/reconciliation/engine');

    // Get all posted batches with balances and period dates
    const batches = await db.select().from(importBatches).where(
      and(
        eq(importBatches.userId, userId),
        or(eq(importBatches.status, 'posted'), eq(importBatches.status, 'needs_review')),
        isNotNull(importBatches.openingBalanceCents),
        isNotNull(importBatches.closingBalanceCents),
        isNotNull(importBatches.periodStart),
        isNotNull(importBatches.periodEnd),
        isNotNull(importBatches.accountId),
      )
    );

    // Group by accountId and sort by periodStart for carry-forward
    const byAccount: Record<string, typeof batches> = {};
    for (const b of batches) {
      const key = b.accountId!;
      if (!byAccount[key]) byAccount[key] = [];
      byAccount[key].push(b);
    }
    for (const key of Object.keys(byAccount)) {
      byAccount[key].sort((a, b) =>
        (a.periodStart ?? '').localeCompare(b.periodStart ?? '')
      );
    }

    const results: { batchId: string; filename: string; status: string; differenceCents: number }[] = [];

    for (const [, acctBatches] of Object.entries(byAccount)) {
      let carryForwardClosing: number | null = null;

      for (const batch of acctBatches) {
        try {
          // Use carry-forward closing as opening if available
          const openingBalanceCents = carryForwardClosing ?? batch.openingBalanceCents!;
          const closingBalanceCents = batch.closingBalanceCents!;

          // Get transactions for this batch
          const txns = await db.select().from(stagedTransactions)
            .where(eq(stagedTransactions.batchId, batch.id));

          const statementTransactions = txns.map(t => ({
            date: t.txnDate ?? '',
            description: t.description ?? t.rawDescription ?? '',
            amountCents: t.amountCents ?? 0,
            direction: t.direction as 'debit' | 'credit',
          }));

          const result = await runReconciliation({
            userId,
            accountId: batch.accountId!,
            periodStart: batch.periodStart!,
            periodEnd: batch.periodEnd!,
            openingBalanceCents,
            closingBalanceCents,
            statementTransactions,
          });

          // Update batch status based on reconciliation result
          const newStatus = result.differenceCents === 0 ? 'reconciled' : 'needs_review';
          await db.update(importBatches).set({ status: newStatus }).where(eq(importBatches.id, batch.id));

          // Carry forward closing balance for next month
          carryForwardClosing = closingBalanceCents;

          results.push({
            batchId: batch.id,
            filename: batch.filename,
            status: result.differenceCents === 0 ? 'reconciled' : 'needs_review',
            differenceCents: result.differenceCents,
          });
        } catch (err) {
          results.push({ batchId: batch.id, filename: batch.filename, status: 'error', differenceCents: 0 });
          carryForwardClosing = null; // reset carry-forward on error
        }
      }
    }

    const reconciled = results.filter(r => r.status === 'reconciled').length;
    const needsReview = results.filter(r => r.status === 'needs_review').length;

    return NextResponse.json({ ok: true, results, reconciled, needsReview, total: results.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
