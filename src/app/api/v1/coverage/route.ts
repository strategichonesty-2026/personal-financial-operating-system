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
      a.id          AS account_id,
      a.code        AS account_code,
      a.name        AS account_name,
      a.type        AS account_type,
      ib.id         AS batch_id,
      ib.period_start,
      ib.period_end,
      ib.status     AS batch_status,
      ib.opening_balance_cents,
      ib.closing_balance_cents
    FROM import_batches ib
    JOIN accounts a ON a.id = ib.account_id
    WHERE ib.user_id = ${userId}
      AND ib.period_start IS NOT NULL
      AND ib.status != 'error'
    ORDER BY a.code ASC, ib.period_start ASC
  `);

  const allPeriods = rows.rows
    .map((r: Record<string, unknown>) => r.period_start as string)
    .filter(Boolean).sort();

  if (allPeriods.length === 0) return NextResponse.json({ accounts: [], months: [] });

  const minDate = new Date(allPeriods[0] + 'T00:00:00Z');
  const maxDate = new Date(allPeriods[allPeriods.length - 1] + 'T00:00:00Z');

  const months: string[] = [];
  const cur = new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), 1));
  const end = new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), 1));
  while (cur <= end) {
    months.push(cur.toISOString().slice(0, 7));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }

  const accountMap = new Map<string, { account_id: string; account_code: string; account_name: string; account_type: string; imported: Map<string, { batch_id: string; status: string; opening: number | null; closing: number | null; period_start: string | null; period_end: string | null }>; }>();

  for (const row of rows.rows as Record<string, unknown>[]) {
    const id = row.account_id as string;
    if (!accountMap.has(id)) {
      accountMap.set(id, { account_id: id, account_code: row.account_code as string, account_name: row.account_name as string, account_type: row.account_type as string, imported: new Map() });
    }
    const monthKey = (row.period_start as string).slice(0, 7);
    accountMap.get(id)!.imported.set(monthKey, { batch_id: row.batch_id as string, status: row.batch_status as string, opening: row.opening_balance_cents as number | null, closing: row.closing_balance_cents as number | null, period_start: row.period_start as string | null, period_end: row.period_end as string | null });
  }

  const accounts = Array.from(accountMap.values()).map(a => ({
    account_id: a.account_id, account_code: a.account_code,
    account_name: a.account_name, account_type: a.account_type,
    months: months.map(m => ({
      month: m,
      ...(a.imported.has(m) ? { status: 'imported', ...a.imported.get(m) } : { status: 'missing', batch_id: null, opening: null, closing: null }),
    })),
    imported_count: a.imported.size,
    missing_count: months.length - a.imported.size,
  }));

  return NextResponse.json({ accounts, months });
}
