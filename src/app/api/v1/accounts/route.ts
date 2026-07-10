import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { db, schema } from '@/lib/db';
import { getAccountBalance, toDollars } from '@/lib/accounting/engine';
import { eq, isNull, and } from 'drizzle-orm';

// GET /api/v1/accounts
// Returns all active accounts with current balances

export async function GET() {
  try {
    await requireAuth();

    const accounts = await db
      .select()
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.isActive, true),
          isNull(schema.accounts.deletedAt)
        )
      )
      .orderBy(schema.accounts.code);

    // Get balance for each account
    const withBalances = await Promise.all(
      accounts.map(async (account) => {
        const balanceCents = await getAccountBalance(account.id);
        return {
          id: account.id,
          code: account.code,
          name: account.name,
          type: account.type,
          subtype: account.subtype,
          institution: account.institution,
          accountRef: account.accountRef,
          normalBalance: account.normalBalance,
          taxSchedule: account.taxSchedule,
          isDeductible: account.isDeductible,
          balance: toDollars(balanceCents),
          balanceCents,
        };
      })
    );

    // Group by type for easy UI consumption
    const grouped = {
      assets: withBalances.filter(a => a.type === 'asset'),
      liabilities: withBalances.filter(a => a.type === 'liability'),
      equity: withBalances.filter(a => a.type === 'equity'),
      income: withBalances.filter(a => a.type === 'income'),
      expenses: withBalances.filter(a => a.type === 'expense'),
    };

    // Compute summary totals
    const totalAssets = grouped.assets.reduce((s, a) => s + a.balanceCents, 0);
    const totalLiabilities = grouped.liabilities.reduce((s, a) => s + a.balanceCents, 0);
    const netWorth = totalAssets - totalLiabilities;

    return NextResponse.json({
      data: {
        accounts: withBalances,
        grouped,
        summary: {
          totalAssets: toDollars(totalAssets),
          totalLiabilities: toDollars(totalLiabilities),
          netWorth: toDollars(netWorth),
        },
      },
      error: null,
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Accounts API]', error);
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
