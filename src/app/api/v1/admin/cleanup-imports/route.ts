import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { importBatches, stagedTransactions } from '@/lib/db/schema';

// POST /api/v1/admin/cleanup-imports
// Deletes ALL staged_transactions and import_batches for the current user
// One-time use — remove this endpoint after use

export async function POST() {
  try {
    await requireAuth();

    // Delete all staged transactions first (FK constraint)
    const deletedTxns = await db
      .delete(stagedTransactions)
      .returning({ id: stagedTransactions.id });

    // Delete all import batches
    const deletedBatches = await db
      .delete(importBatches)
      .returning({ id: importBatches.id });

    return NextResponse.json({
      ok: true,
      deletedTransactions: deletedTxns.length,
      deletedBatches: deletedBatches.length,
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Cleanup API]', error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
