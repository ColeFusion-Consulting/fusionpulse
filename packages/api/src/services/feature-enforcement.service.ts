import { PLANS } from './billing.service.js';
import { db } from '../db/client.js';
import { tenants, monitors, testCases, testRuns, aiGenerations, notificationChannels, users } from '../db/schema.js';
import { eq, and, count, gte } from 'drizzle-orm';

export type FeatureKey = 'monitors' | 'testCases' | 'testRunsPerMonth' | 'aiGenerationsPerMonth' | 'notificationChannels' | 'users' | 'monitoredSites';

export interface FeatureLimits {
  monitors: number;
  testCases: number;
  testRunsPerMonth: number;
  aiGenerationsPerMonth: number;
  notificationChannels: number;
  users: number;
  monitoredSites: number;
  monitorIntervalSeconds: number;
}

export async function getEffectiveLimits(tenantId: string): Promise<FeatureLimits> {
  const tenant = await db.select().from(tenants).where(eq(tenants.id, tenantId)).then(r => r[0]);
  const plan = PLANS[tenant.plan as keyof typeof PLANS] || PLANS.free;
  const overrides = (tenant.settings as any)?.featureOverrides || {};

  return {
    monitors: overrides.maxMonitors ?? plan.maxMonitors,
    testCases: overrides.maxTestCases ?? plan.maxTestCases,
    testRunsPerMonth: overrides.maxTestRunsPerMonth ?? plan.maxTestRunsPerMonth,
    aiGenerationsPerMonth: overrides.maxAiGenerationsPerMonth ?? plan.maxAiGenerationsPerMonth,
    notificationChannels: overrides.maxNotificationChannels ?? plan.maxNotificationChannels,
    users: overrides.maxUsers ?? plan.maxUsers,
    monitoredSites: 1,
    monitorIntervalSeconds: plan.monitorIntervalSeconds,
  };
}

export async function checkLimit(tenantId: string, feature: FeatureKey): Promise<{ allowed: boolean; current: number; limit: number; message?: string }> {
  const limits = await getEffectiveLimits(tenantId);

  let current = 0;
  const limit = limits[feature];

  switch (feature) {
    case 'monitors':
      current = await db.select({ count: count() }).from(monitors).where(eq(monitors.tenantId, tenantId)).then(r => Number(r[0].count));
      break;
    case 'testCases':
      current = await db.select({ count: count() }).from(testCases).where(eq(testCases.tenantId, tenantId)).then(r => Number(r[0].count));
      break;
    case 'testRunsPerMonth': {
      const firstOfMonth = new Date(); firstOfMonth.setDate(1); firstOfMonth.setHours(0, 0, 0, 0);
      current = await db.select({ count: count() }).from(testRuns)
        .where(and(eq(testRuns.tenantId, tenantId), gte(testRuns.createdAt, firstOfMonth)))
        .then(r => Number(r[0].count));
      break;
    }
    case 'aiGenerationsPerMonth': {
      const firstOfMonth = new Date(); firstOfMonth.setDate(1); firstOfMonth.setHours(0, 0, 0, 0);
      current = await db.select({ count: count() }).from(aiGenerations)
        .where(and(eq(aiGenerations.tenantId, tenantId), gte(aiGenerations.createdAt, firstOfMonth)))
        .then(r => Number(r[0].count));
      break;
    }
    case 'notificationChannels':
      current = await db.select({ count: count() }).from(notificationChannels).where(eq(notificationChannels.tenantId, tenantId)).then(r => Number(r[0].count));
      break;
    case 'users':
      current = await db.select({ count: count() }).from(users).where(eq(users.tenantId, tenantId)).then(r => Number(r[0].count));
      break;
    case 'monitoredSites':
      current = await db.select({ count: count() }).from(monitors).where(and(eq(monitors.tenantId, tenantId), eq(monitors.enabled, true))).then(r => Number(r[0].count));
      break;
  }

  return { allowed: current < limit, current, limit };
}

export function requireFeature(feature: FeatureKey) {
  return async (req: any, res: any, next: any) => {
    const tenantId = req.user!.tenantId;
    const result = await checkLimit(tenantId, feature);
    if (!result.allowed) {
      return res.status(403).json({
        success: false,
        error: `Plan limit reached: ${result.current}/${result.limit} ${feature}. Upgrade your plan or contact support to increase limits.`,
        data: result,
      });
    }
    next();
  };
}
