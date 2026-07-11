import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { runReconciliation, ReconcileInput } from '@/lib/reconciliation/engine';

export async function POST(req: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body: ReconcileInput = await req.json();
    if (!body.accountId || !body.periodStart || !body.periodEnd) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const result = await runReconciliation({ ...body, userId });
    return NextResponse.json(result);
  } catch (err) {
    console.error('Reconcile error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({ message: 'Use POST to run reconciliation' });
}
