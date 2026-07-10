import { pgTable, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: text('code').notNull().unique(),        // e.g. "5011"
  name: text('name').notNull(),                 // e.g. "Rent - NSM / Cooper"
  type: text('type').notNull(),                 // asset|liability|equity|income|expense
  subtype: text('subtype'),                     // bank|credit_card|loan|investment
  parentId: text('parent_id'),                  // self-reference for hierarchy
  institution: text('institution'),             // "Wells Fargo"
  accountRef: text('account_ref'),              // last 4 digits
  isActive: boolean('is_active').notNull().default(true),
  taxSchedule: text('tax_schedule'),            // "C"|"E"|"B"|null
  isDeductible: boolean('is_deductible').notNull().default(false),
  normalBalance: text('normal_balance').notNull(), // "debit"|"credit"
  // Opening balance in cents (set during Milestone 2)
  openingBalanceCents: integer('opening_balance_cents').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
