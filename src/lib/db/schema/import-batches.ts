import { pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core';

export const importBatches = pgTable('import_batches', {
  id:           text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:       text('user_id').notNull(),
  institution:  text('institution').notNull(),
  accountId:    text('account_id'),
  filename:     text('filename').notNull(),
  r2Key:        text('r2_key').notNull(),
  status:       text('status').notNull().default('pending'),
  rowCount:     integer('row_count'),
  errorMessage: text('error_message'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ImportBatch    = typeof importBatches.$inferSelect;
export type NewImportBatch = typeof importBatches.$inferInsert;
