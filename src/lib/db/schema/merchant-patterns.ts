import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const merchantPatterns = pgTable('merchant_patterns', {
  id:                  text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  pattern:             text('pattern').notNull().unique(),
  merchantName:        text('merchant_name').notNull(),
  defaultCategoryCode: text('default_category_code'),
  isTransfer:          boolean('is_transfer').notNull().default(false),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type MerchantPattern    = typeof merchantPatterns.$inferSelect;
export type NewMerchantPattern = typeof merchantPatterns.$inferInsert;
