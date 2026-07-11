import { pgTable, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

export const reconciliations = pgTable('reconciliations', {
  id:                      text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  accountId:               text('account_id').notNull(),
  periodStart:             timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd:               timestamp('period_end', { withTimezone: true }).notNull(),
  openingBalanceCents:     integer('opening_balance_cents').notNull(),
  closingBalanceCents:     integer('closing_balance_cents').notNull(),
  statementCreditsCents:   integer('statement_credits_cents').notNull().default(0),
  statementDebitsCents:    integer('statement_debits_cents').notNull().default(0),
  calculatedBalanceCents:  integer('calculated_balance_cents').notNull().default(0),
  differenceCents:         integer('difference_cents').notNull().default(0),
  matchedCount:            integer('matched_count').notNull().default(0),
  unmatchedStatementCount: integer('unmatched_statement_count').notNull().default(0),
  unmatchedLedgerCount:    integer('unmatched_ledger_count').notNull().default(0),
  confidenceScore:         integer('confidence_score').notNull().default(0),
  status:                  text('status').notNull().default('draft'),
  reconciledBy:            text('reconciled_by').notNull(),
  reconciledAt:            timestamp('reconciled_at', { withTimezone: true }),
  createdAt:               timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:               timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const reconciliationItems = pgTable('reconciliation_items', {
  id:                   text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  reconciliationId:     text('reconciliation_id').notNull(),
  statementDescription: text('statement_description'),
  statementDate:        timestamp('statement_date', { withTimezone: true }),
  statementAmountCents: integer('statement_amount_cents'),
  statementDirection:   text('statement_direction'),
  journalEntryId:       text('journal_entry_id'),
  stagedTxnId:          text('staged_txn_id'),
  matchType:            text('match_type').notNull(),
  matchScore:           integer('match_score').notNull().default(0),
  suggestion:           text('suggestion'),
  suggestionCategory:   text('suggestion_category'),
  isResolved:           boolean('is_resolved').notNull().default(false),
  resolvedNote:         text('resolved_note'),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Reconciliation        = typeof reconciliations.$inferSelect;
export type NewReconciliation     = typeof reconciliations.$inferInsert;
export type ReconciliationItem    = typeof reconciliationItems.$inferSelect;
export type NewReconciliationItem = typeof reconciliationItems.$inferInsert;
