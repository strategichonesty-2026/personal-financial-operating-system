import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getTrialBalance, toDollars } from '@/lib/accounting/engine';
import { logEvent, AUDIT_EVENTS } from '@/lib/audit';

// GET /api/v1/reports/trial-balance
// Returns trial balance for all accounts with activity

export async function GET() {
  try {
    const user = await requireAuth();

    const trialBalance = await getTrialBalance();

    // Log report generation
    await logEvent({
      userId: user.id,
      eventType: AUDIT_EVENTS.REPORT_GENERATED,
      entityType: 'report',
      payload: { reportType: 'trial_balance' },
    });

    // Format for API response
    const formatted = trialBalance.accounts.map(a => ({
      code: a.accountCode,
      name: a.accountName,
      type: a.accountType,
      normalBalance: a.normalBalance,
      debit: toDollars(a.debitTotal),
      credit: toDollars(a.creditTotal),
      balance: toDollars(a.balance),
    }));

    return NextResponse.json({
      data: {
        accounts: formatted,
        totals: {
          debits: toDollars(trialBalance.totalDebits),
          credits: toDollars(trialBalance.totalCredits),
          difference: toDollars(trialBalance.totalDebits - trialBalance.totalCredits),
        },
        isBalanced: trialBalance.isBalanced,
        generatedAt: new Date().toISOString(),
      },
      error: null,
    });

  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Trial Balance API]', error);
    return NextResponse.json({ data: null, error: 'Internal server error' }, { status: 500 });
  }
}
