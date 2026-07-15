import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const batchId   = searchParams.get('batchId');
  const accountId = searchParams.get('accountId');

  if (!batchId || !accountId) {
    return NextResponse.json({ error: 'batchId and accountId required' }, { status: 400 });
  }

  const rows = await db.execute(sql`
    SELECT
      st.id            AS staged_id,
      st.txn_date,
      st.description,
      st.amount_cents  AS staged_amount_cents,
      st.direction,
      st.status        AS staged_status,
      jel.side,
      jel.amount_cents AS posted_amount_cents,
      jel.memo,
      je.entry_date
    FROM staged_transactions st
    JOIN import_batches ib
      ON ib.id = st.batch_id
      AND ib.user_id = ${userId}
    LEFT JOIN journal_entries je
      ON je.id = st.journal_entry_id
    LEFT JOIN journal_entry_lines jel
      ON jel.journal_entry_id = je.id
      AND jel.account_id = ${accountId}
    WHERE st.batch_id   = ${batchId}
      AND st.account_id = ${accountId}
    ORDER BY st.txn_date ASC
  `);

  return NextResponse.json({ transactions: rows.rows });
}
