import { pgTable, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

export const stagedTransactions = pgTable('staged_transactions', {
  id:                text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  batchId:           text('batch_id').notNull(),
  accountId:         text('account_id').notNull(),
  txnDate:           text('txn_date').notNull(),
  description:       text('description').notNull(),
  rawDescription:    text('raw_description').notNull(),
  amountCents:       integer('amount_cents').notNull(),
  direction:         text('direction').notNull(),
  merchantName:      text('merchant_name'),
  categoryCode:      text('category_code'),
  transferCandidate: boolean('transfer_candidate').notNull().default(false),
  transferPairId:    text('transfer_pair_id'),
  duplicateHash:     text('duplicate_hash').notNull(),
  status:            text('status').notNull().default('pending'),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type StagedTransaction    = typeof stagedTransactions.$inferSelect;
export type NewStagedTransaction = typeof stagedTransactions.$inferInsert;
