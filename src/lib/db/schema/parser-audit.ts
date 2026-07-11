import { pgTable, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';

// Parser audit log — immutable record of every import attempt
// Supports Layer 6 of the reconciliation engine (full audit trail)
export const parserAudit = pgTable('parser_audit', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  batchId:      text('batch_id').notNull(),           // FK to import_batches
  userId:       text('user_id').notNull(),
  institution:  text('institution').notNull(),
  filename:     text('filename').notNull(),
  accountId:    text('account_id'),
  statementYear:  integer('statement_year').notNull(),
  statementMonth: integer('statement_month').notNull(),

  // Extractor output
  pagesExtracted:   integer('pages_extracted').notNull().default(0),
  rawItemCount:     integer('raw_item_count').notNull().default(0),

  // Parser stages
  rowsGrouped:      integer('rows_grouped').notNull().default(0),
  rowsParsed:       integer('rows_parsed').notNull().default(0),
  rowsSkippedFilter: integer('rows_skipped_filter').notNull().default(0),
  rowsSkippedDedup: integer('rows_skipped_dedup').notNull().default(0),

  // Pipeline stages
  normalized:       integer('normalized').notNull().default(0),
  duplicatesFound:  integer('duplicates_found').notNull().default(0),
  transfersFound:   integer('transfers_found').notNull().default(0),
  inserted:         integer('inserted').notNull().default(0),

  // Skip reasons breakdown (JSON array of {reason, count})
  skipReasons:  jsonb('skip_reasons'),

  // Final status
  status:       text('status').notNull().default('success'), // success | error
  errorMessage: text('error_message'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ParserAudit    = typeof parserAudit.$inferSelect;
export type NewParserAudit = typeof parserAudit.$inferInsert;
