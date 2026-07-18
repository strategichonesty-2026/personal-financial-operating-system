import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export async function GET() {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get latest closing balance per account from most recent statement
  const result = await db.execute(sql`
    SELECT 
      a.id, a.code, a.name, a.type,
      ib.closing_balance_cents,
      ib.period_end
    FROM accounts a
    JOIN import_batches ib ON ib.account_id = a.id
    WHERE ib.account_id = a.id
      AND ib.period_end = (
        SELECT MAX(ib2.period_end) 
        FROM import_batches ib2 
        WHERE ib2.account_id = a.id
          AND ib2.user_id = ${userId}
      )
      AND ib.user_id = ${userId}
      AND a.type IN ('asset', 'liability')
    ORDER BY a.type, a.code
  `);

  const accounts = result.rows as Array<{
    id: string;
    code: string;
    name: string;
    type: string;
    closing_balance_cents: number;
    period_end: string;
  }>;

  const assets = accounts.filter(a => a.type === 'asset');
  const liabilities = accounts.filter(a => a.type === 'liability');

  const totalCashCents = assets.reduce((s, a) => s + Number(a.closing_balance_cents), 0);
  const totalOwedCents = liabilities.reduce((s, a) => s + Number(a.closing_balance_cents), 0);
  const netWorthCents = totalCashCents - totalOwedCents;

  // Get income and expense totals from journal entry lines
  const incomeExpense = await db.execute(sql`
    SELECT a.type,
      SUM(CASE WHEN jel.side='credit' THEN jel.amount_cents ELSE 0 END) as credits,
      SUM(CASE WHEN jel.side='debit' THEN jel.amount_cents ELSE 0 END) as debits
    FROM journal_entry_lines jel
    JOIN accounts a ON a.id = jel.account_id
    WHERE a.type IN ('income', 'expense')
    GROUP BY a.type
  `);

  const incomeRow = (incomeExpense.rows as any[]).find(r => r.type === 'income');
  const expenseRow = (incomeExpense.rows as any[]).find(r => r.type === 'expense');
  const moneyInCents = Number(incomeRow?.credits ?? 0);
  const moneyOutCents = Number(expenseRow?.debits ?? 0) - Number(expenseRow?.credits ?? 0);

  return NextResponse.json({
    assets,
    liabilities,
    totalCashCents,
    totalOwedCents,
    netWorthCents,
    moneyInCents,
    moneyOutCents,
  });
}
