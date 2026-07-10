import { NextResponse } from 'next/server';
import { seedMerchantPatterns } from '@/lib/db/seeds/merchant-patterns';

// POST /api/v1/admin/seed-merchants
// One-time seed — safe to call multiple times (onConflictDoNothing)
export async function POST() {
  try {
    await seedMerchantPatterns();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
