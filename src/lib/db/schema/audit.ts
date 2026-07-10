import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

// Audit log is IMMUTABLE — no updatedAt, no deletedAt
// Insert only — never update or delete
export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id'),           // null for system events
  eventType: text('event_type').notNull(),
  // statement_imported | transaction_staged | ai_categorized |
  // user_corrected | rule_created | transaction_posted |
  // report_generated | user_login | user_logout
  entityType: text('entity_type'),   // "import_batch" | "staged_tx" | etc.
  entityId: text('entity_id'),
  payload: jsonb('payload'),         // event-specific data
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

// All valid event types — enforced at application level
export const AUDIT_EVENTS = {
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  STATEMENT_IMPORTED: 'statement_imported',
  TRANSACTION_STAGED: 'transaction_staged',
  AI_CATEGORIZED: 'ai_categorized',
  USER_CORRECTED: 'user_corrected',
  RULE_CREATED: 'rule_created',
  TRANSACTION_POSTED: 'transaction_posted',
  REPORT_GENERATED: 'report_generated',
} as const;

export type AuditEventType = typeof AUDIT_EVENTS[keyof typeof AUDIT_EVENTS];
