import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  const body = await req.json();
  const { type, page, message, error_details } = body;

  await db.execute(sql`
    INSERT INTO feedback (user_id, type, page, message, error_details)
    VALUES (
      ${userId ?? 'anonymous'},
      ${type ?? 'error'},
      ${page ?? null},
      ${message ?? null},
      ${error_details ? JSON.stringify(error_details) : null}
    )
  `);

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const { userId } = auth();
  const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

  if (userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await db.execute(sql`
    SELECT id, user_id, type, page, message, error_details, status, created_at
    FROM feedback
    ORDER BY created_at DESC
    LIMIT 100
  `);

  return NextResponse.json({ feedback: result.rows });
}

export async function PATCH(req: NextRequest) {
  const { userId } = auth();
  const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

  if (userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, status } = await req.json();
  await db.execute(sql`
    UPDATE feedback SET status = ${status} WHERE id = ${id}
  `);

  return NextResponse.json({ ok: true });
}
