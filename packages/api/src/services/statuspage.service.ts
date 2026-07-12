import { db } from '../db/client.js';
import { tenants, monitors, monitorResults } from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';

// ─── Get public status by tenant slug ─────────────────────

export async function getPublicStatus(slug: string) {
  // Look up tenant by slug
  const tenantRows = await db.select({
    id: tenants.id,
    name: tenants.name,
    slug: tenants.slug,
    settings: tenants.settings,
  }).from(tenants).where(eq(tenants.slug, slug));

  const tenant = tenantRows[0];
  if (!tenant) return null;

  // Get all enabled monitors
  const monitorRows = await db.select().from(monitors)
    .where(and(eq(monitors.tenantId, tenant.id), eq(monitors.enabled, true)))
    .orderBy(monitors.name);

  // For each monitor, get the latest result and uptime stats
  const monitorStatuses = await Promise.all(
    monitorRows.map(async (monitor) => {
      const latest = await db.select().from(monitorResults)
        .where(eq(monitorResults.monitorId, monitor.id))
        .orderBy(desc(monitorResults.checkedAt))
        .limit(1);

      // Get uptime percentage (last 24h)
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const results24h = await db.select({
        status: monitorResults.status,
        count: sql<number>`count(*)`,
      }).from(monitorResults)
      .where(
        and(
          eq(monitorResults.monitorId, monitor.id),
          sql`${monitorResults.checkedAt} >= ${last24h}`,
        )
      )
      .groupBy(monitorResults.status);

      const totalChecks = results24h.reduce((sum, r) => sum + Number(r.count), 0);
      const upChecks = results24h.find((r) => r.status === 'up');
      const uptime24h = totalChecks > 0
        ? ((Number(upChecks?.count ?? 0) / totalChecks) * 100)
        : 100;

      // Get average response time (last 1h)
      const last1h = new Date(Date.now() - 60 * 60 * 1000);
      const avgResponse = await db.select({
        avg: sql<number>`coalesce(avg(${monitorResults.responseTimeMs}), 0)`,
      }).from(monitorResults)
      .where(
        and(
          eq(monitorResults.monitorId, monitor.id),
          sql`${monitorResults.checkedAt} >= ${last1h}`,
        )
      );

      const currentStatus = latest[0]?.status ?? 'unknown';
      // Determine overall status based on recent history
      const overallStatus = uptime24h >= 99.9 ? 'operational' :
                           uptime24h >= 95 ? 'degraded' :
                           currentStatus === 'up' ? 'operational' : 'down';

      return {
        id: monitor.id,
        name: monitor.name,
        url: monitor.url,
        status: overallStatus,
        currentStatus,
        uptime24h: Math.round(uptime24h * 100) / 100,
        lastChecked: latest[0]?.checkedAt ?? null,
        responseTimeMs: Math.round(Number(avgResponse[0]?.avg ?? 0)),
      };
    })
  );

  // Overall status
  const anyDown = monitorStatuses.some((m) => m.status === 'down');
  const anyDegraded = monitorStatuses.some((m) => m.status === 'degraded');
  const overallStatus = anyDown ? 'major_outage' :
                        anyDegraded ? 'partial_outage' :
                        'all_operational';

  // Get page config from tenant settings
  const settings = (tenant.settings ?? {}) as Record<string, any>;

  return {
    tenant: {
      name: tenant.name,
      slug: tenant.slug,
    },
    status: overallStatus,
    monitors: monitorStatuses,
    branding: {
      showPoweredBy: settings.statusPageShowPoweredBy !== false,
      customMessage: settings.statusPageMessage || null,
      logo: settings.statusPageLogo || null,
    },
  };
}

// ─── Get uptime history (for graphs) ──────────────────────

export async function getUptimeHistory(slug: string, monitorId: string, days = 30) {
  const tenantRows = await db.select({ id: tenants.id }).from(tenants)
    .where(eq(tenants.slug, slug));
  if (!tenantRows[0]) return null;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const results = await db.select({
    date: sql<string>`date(${monitorResults.checkedAt})`,
    status: monitorResults.status,
    count: sql<number>`count(*)`,
  }).from(monitorResults)
  .where(
    and(
      eq(monitorResults.tenantId, tenantRows[0].id),
      eq(monitorResults.monitorId, monitorId),
      sql`${monitorResults.checkedAt} >= ${since}`,
    )
  )
  .groupBy(sql`date(${monitorResults.checkedAt})`, monitorResults.status)
  .orderBy(sql`date(${monitorResults.checkedAt})`);

  // Transform to daily uptime percentages
  const byDate: Record<string, { up: number; total: number }> = {};
  for (const row of results) {
    if (!byDate[row.date]) byDate[row.date] = { up: 0, total: 0 };
    byDate[row.date].total += Number(row.count);
    if (row.status === 'up') byDate[row.date].up += Number(row.count);
  }

  return Object.entries(byDate).map(([date, data]) => ({
    date,
    uptime: data.total > 0 ? Math.round((data.up / data.total) * 10000) / 100 : 100,
  }));
}
