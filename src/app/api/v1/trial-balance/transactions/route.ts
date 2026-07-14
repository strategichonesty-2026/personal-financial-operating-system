import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { journalEntries, journalEntryLines } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 });

  const rows = await db
    .select({
      entryId: journalEntries.id,
      entryDate: journalEntries.entryDate,
      description: journalEntries.description,
      amountCents: journalEntryLines.amountCents,
      side: journalEntryLines.side,
      memo: journalEntryLines.memo,
      reference: journalEntries.reference,
    })
    .from(journalEntryLines)
    .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
    .where(eq(journalEntryLines.accountId, accountId))
    .orderBy(journalEntries.entryDate);

  return NextResponse.json({ transactions: rows });
}
