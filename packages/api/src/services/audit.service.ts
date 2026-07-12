import { db } from '../db/client.js';
import { auditLogs } from '../db/schema.js';
import { eq, and, desc, gte, sql, count } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

export interface AuditEvent {
  tenantId?: string;
  userId?: string;
  action: string;
  resource?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  durationMs?: number;
  success?: boolean;
}

export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      tenantId: event.tenantId || null,
      userId: event.userId || null,
      action: event.action,
      resource: event.resource || null,
      details: (event.details || {}) as Record<string, unknown>,
      ip: event.ip || null,
      userAgent: event.userAgent || null,
      durationMs: event.durationMs || null,
      success: event.success !== false,
    });

    logger.info(`audit:${event.action}`, {
      tenantId: event.tenantId,
      userId: event.userId,
      resource: event.resource,
      success: event.success !== false,
    });
  } catch (err) {
    logger.error('Failed to record audit event', { action: event.action, error: String(err) });
  }
}

export async function queryAuditLogs(tenantId: string, opts?: {
  limit?: number;
  offset?: number;
  action?: string;
  since?: Date;
}) {
  const conditions = [eq(auditLogs.tenantId, tenantId)];
  if (opts?.action) conditions.push(eq(auditLogs.action, opts.action));
  if (opts?.since) conditions.push(gte(auditLogs.createdAt, opts.since));

  const rows = await db.select().from(auditLogs)
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(opts?.limit || 50)
    .offset(opts?.offset || 0);

  const totalResult = await db.select({ total: count() }).from(auditLogs).where(and(...conditions));
  return { rows, total: Number(totalResult[0]?.total || 0) };
}
