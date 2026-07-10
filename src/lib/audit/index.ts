// Audit logging service
// IMMUTABLE — every call is an INSERT only
// Never update or delete audit log entries

import { db, schema } from '@/lib/db';
import { AUDIT_EVENTS, type AuditEventType } from '@/lib/db/schema/audit';

export { AUDIT_EVENTS };

type LogEventParams = {
  userId?: string;
  eventType: AuditEventType;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  ipAddress?: string;
};

// Log an audit event — fire and forget
// Never throws — audit failures should not break the main flow
export async function logEvent(params: LogEventParams): Promise<void> {
  try {
    await db.insert(schema.auditLog).values({
      userId: params.userId ?? null,
      eventType: params.eventType,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      payload: params.payload ?? null,
      ipAddress: params.ipAddress ?? null,
    });
  } catch (error) {
    // Log to console but never throw — audit must not break business logic
    console.error('[AUDIT] Failed to log event:', params.eventType, error);
  }
}

// Convenience: log user login
export async function logUserLogin(userId: string, ipAddress?: string) {
  return logEvent({
    userId,
    eventType: AUDIT_EVENTS.USER_LOGIN,
    entityType: 'user',
    entityId: userId,
    ipAddress,
  });
}

// Convenience: log statement imported
export async function logStatementImported(
  userId: string,
  importBatchId: string,
  payload: Record<string, unknown>
) {
  return logEvent({
    userId,
    eventType: AUDIT_EVENTS.STATEMENT_IMPORTED,
    entityType: 'import_batch',
    entityId: importBatchId,
    payload,
  });
}

// Convenience: log transaction posted to GL
export async function logTransactionPosted(
  userId: string,
  journalEntryId: string,
  payload: Record<string, unknown>
) {
  return logEvent({
    userId,
    eventType: AUDIT_EVENTS.TRANSACTION_POSTED,
    entityType: 'journal_entry',
    entityId: journalEntryId,
    payload,
  });
}
