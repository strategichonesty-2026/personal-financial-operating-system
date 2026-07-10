import { pgTable, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

// Journal entries — every financial event
export const journalEntries = pgTable('journal_entries', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  entryDate: timestamp('entry_date', { withTimezone: true }).notNull(),
  description: text('description').notNull(),
  reference: text('reference'),        // e.g. import batch ID
  isOpening: boolean('is_opening').notNull().default(false),
  createdBy: text('created_by').notNull(), // user ID
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// Journal entry lines — the General Ledger
// Every entry must have debits = credits
export const journalEntryLines = pgTable('journal_entry_lines', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  journalEntryId: text('journal_entry_id').notNull().references(() => journalEntries.id),
  accountId: text('account_id').notNull(),
  amountCents: integer('amount_cents').notNull(), // always positive
  side: text('side').notNull(),                   // "debit" | "credit"
  memo: text('memo'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;
export type JournalEntryLine = typeof journalEntryLines.$inferSelect;
export type NewJournalEntryLine = typeof journalEntryLines.$inferInsert;
