import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

// GET /api/v1/health
// Public endpoint — no auth required
// Returns system health status

export async function GET() {
  const checks: Record<string, { status: string; detail?: string }> = {};

  // Check database connectivity
  try {
    await db.execute(sql`SELECT 1`);
    checks['database'] = { status: 'ok', detail: 'Neon Postgres connected' };
  } catch (error) {
    checks['database'] = {
      status: 'error',
      detail: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Check environment variables
  const requiredEnvVars = [
    'DATABASE_URL',
    'CLERK_SECRET_KEY',
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'ANTHROPIC_API_KEY',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
  ];

  const missingEnvVars = requiredEnvVars.filter((v) => !process.env[v]);
  checks['environment'] = missingEnvVars.length === 0
    ? { status: 'ok', detail: 'All required env vars present' }
    : { status: 'warning', detail: `Missing: ${missingEnvVars.join(', ')}` };

  const allOk = Object.values(checks).every((c) => c.status === 'ok');

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      version: '0.1.0',
      milestone: 'M1 — Foundation',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 207 }
  );
}
