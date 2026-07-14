import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getTrialBalance } from '@/lib/accounting/engine';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tb = await getTrialBalance();
  return NextResponse.json(tb);
}
