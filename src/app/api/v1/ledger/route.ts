import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db.execute(sql`
    SELECT
      a.id                AS account_id,
      a.code              AS account_code,
      a.name              AS account_name,
      a.type              AS account_type,
      a.normal_balance,
      ib.id               AS batch_id,
      ib.institution,
      ib.period_start,
      ib.period_end,
      ib.opening_balance_cents,
      ib.closing_balance_cents,
      ib.status           AS batch_status,
      COALESCE(SUM(CASE WHEN jel.side = 'debit'  THEN jel.amount_cents ELSE 0 END), 0) AS total_debits_cents,
      COALESCE(SUM(CASE WHEN jel.side = 'credit' THEN jel.amount_cents ELSE 0 END), 0) AS total_credits_cents,
      COUNT(DISTINCT st.id) AS transaction_count
    FROM import_batches ib
    JOIN accounts a ON a.id = ib.account_id
    LEFT JOIN staged_transactions st ON st.batch_id = ib.id
    LEFT JOIN journal_entries je ON je.id = st.journal_entry_id
    LEFT JOIN journal_entry_lines jel
      ON jel.journal_entry_id = je.id
      AND jel.account_id = a.id
    WHERE ib.user_id = ${userId}
    GROUP BY
      a.id, a.code, a.name, a.type, a.normal_balance,
      ib.id, ib.institution, ib.period_start, ib.period_end,
      ib.opening_balance_cents, ib.closing_balance_cents, ib.status
    ORDER BY a.code ASC, ib.period_start ASC
  `);

  return NextResponse.json({ rows: rows.rows });
}
