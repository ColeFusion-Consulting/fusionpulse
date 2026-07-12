import { db } from '../db/client.js';
import { monitors, monitorResults } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';

export async function getAllMonitors(tenantId: string) {
  return db.select().from(monitors)
    .where(eq(monitors.tenantId, tenantId))
    .orderBy(desc(monitors.createdAt));
}

export async function getMonitorById(tenantId: string, id: string) {
  const rows = await db.select().from(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.tenantId, tenantId)));
  return rows[0] ?? null;
}

export async function createMonitor(tenantId: string, data: {
  name: string; url: string; method?: string;
  expectedStatus?: number; expectedBody?: string;
  intervalSeconds?: number; locations?: string[];
}) {
  const rows = await db.insert(monitors).values({
    tenantId,
    name: data.name,
    url: data.url,
    method: data.method ?? 'GET',
    expectedStatus: data.expectedStatus ?? 200,
    expectedBody: data.expectedBody ?? null,
    intervalSeconds: data.intervalSeconds ?? 300,
    locations: data.locations ?? ['us-east-1'],
    enabled: true,
  }).returning();
  return rows[0];
}

export async function updateMonitor(tenantId: string, id: string, data: Partial<{
  name: string; url: string; method: string;
  expectedStatus: number; expectedBody: string;
  intervalSeconds: number; enabled: boolean; locations: string[];
}>) {
  await db.update(monitors)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(monitors.id, id), eq(monitors.tenantId, tenantId)));
  return getMonitorById(tenantId, id);
}

export async function deleteMonitor(tenantId: string, id: string) {
  const result = await db.delete(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.tenantId, tenantId)));
  return result.rowCount! > 0;
}

export async function runMonitorCheck(tenantId: string, monitorId: string) {
  const monitor = await getMonitorById(tenantId, monitorId);
  if (!monitor) throw new Error('Monitor not found');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const start = Date.now();

  try {
    const response = await fetch(monitor.url, {
      method: monitor.method || 'GET',
      signal: controller.signal,
      redirect: 'follow',
    });

    const durationMs = Date.now() - start;
    const body = await response.text();

    let status = 'up';
    if (response.status !== (monitor.expectedStatus ?? 200)) status = 'down';
    if (monitor.expectedBody && !body.includes(monitor.expectedBody)) status = 'down';

    const rows = await db.insert(monitorResults).values({
      tenantId,
      monitorId,
      status,
      statusCode: response.status,
      responseTimeMs: durationMs,
      bodySnippet: body.substring(0, 500),
    }).returning();

    // Check for state change and fire alerts
    await emitMonitorAlerts(tenantId, monitorId, monitor.name, status, response.status, durationMs);

    return rows[0];
  } catch (err: any) {
    const rows = await db.insert(monitorResults).values({
      tenantId,
      monitorId,
      status: 'error',
      responseTimeMs: Date.now() - start,
      errorMessage: err.message || 'Unknown error',
    }).returning();

    // Error counts as "down" — fire alerts on state change
    await emitMonitorAlerts(tenantId, monitorId, monitor.name, 'error', undefined, Date.now() - start);

    return rows[0];
  } finally {
    clearTimeout(timeout);
  }
}

export async function getMonitorHistory(tenantId: string, monitorId: string, limit = 50) {
  return db.select().from(monitorResults)
    .where(and(eq(monitorResults.tenantId, tenantId), eq(monitorResults.monitorId, monitorId)))
    .orderBy(desc(monitorResults.checkedAt))
    .limit(limit);
}

export async function getLatestResult(tenantId: string, monitorId: string) {
  const rows = await db.select().from(monitorResults)
    .where(and(eq(monitorResults.tenantId, tenantId), eq(monitorResults.monitorId, monitorId)))
    .orderBy(desc(monitorResults.checkedAt))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Alert Emission ────────────────────────────────────────

async function emitMonitorAlerts(
  tenantId: string,
  monitorId: string,
  monitorName: string,
  currentStatus: string,
  statusCode?: number,
  responseTimeMs?: number,
) {
  // Get the two most recent results to detect state change
  const recent = await db.select().from(monitorResults)
    .where(and(eq(monitorResults.tenantId, tenantId), eq(monitorResults.monitorId, monitorId)))
    .orderBy(desc(monitorResults.checkedAt))
    .limit(2);

  // If we only have one result (first check), no state change to detect
  if (recent.length < 2) return;

  const previousStatus = recent[1].status;

  // State changed from up → down/error
  if (previousStatus === 'up' && currentStatus !== 'up') {
    const { onMonitorDown } = await import('./notification.service.js');
    await onMonitorDown(tenantId, monitorId, monitorName, statusCode, responseTimeMs);
  }

  // State changed from down/error → up (recovery)
  if (previousStatus !== 'up' && currentStatus === 'up') {
    const { onMonitorRecovery } = await import('./notification.service.js');
    await onMonitorRecovery(tenantId, monitorId, monitorName);
  }
}
