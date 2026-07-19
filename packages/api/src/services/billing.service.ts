import Stripe from 'stripe';
import { db } from '../db/client.js';
import { tenants, users, monitors, testCases, testSuites, testRuns, usageRecords, notificationChannels } from '../db/schema.js';
import { eq, and, sql, gte, count } from 'drizzle-orm';

let stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-06-24.dahlia' });
  }
  return stripe!;
}

// ─── Plan Definitions ──────────────────────────────────────

export type PlanLimitKey = 'monitors' | 'testCases' | 'testRunsPerMonth' | 'aiGenerationsPerMonth' | 'notificationChannels' | 'users';

export const OVERAGE_RATES: Record<PlanLimitKey, { rateCents: number; label: string }> = {
  monitors: { rateCents: 199, label: 'Monitors' },           // $1.99/monitor/mo overage
  testCases: { rateCents: 99, label: 'Test Cases' },         // $0.99/test case/mo
  testRunsPerMonth: { rateCents: 1, label: 'Test Runs' },    // $0.01/run overage
  aiGenerationsPerMonth: { rateCents: 5, label: 'AI Generations' }, // $0.05/gen overage
  notificationChannels: { rateCents: 299, label: 'Notification Channels' }, // $2.99/channel
  users: { rateCents: 999, label: 'Users' },                  // $9.99/user overage
};

export const PLANS = {
  free: {
    name: 'Free',
    priceId: null,
    monthlyPrice: 0,
    monitorIntervalSeconds: 60,
    maxMonitors: 10,
    maxTestCases: 25,
    maxTestRunsPerMonth: 500,
    maxAiGenerationsPerMonth: 50,
    maxNotificationChannels: 2,
    maxUsers: 3,
    features: ['HTTP status checks', 'Basic E2E tests', '50 AI generations/mo', 'Email alerts'],
  },
  starter: {
    name: 'Starter',
    priceId: process.env.STRIPE_STARTER_PRICE_ID || '',
    monthlyPrice: 5,
    monitorIntervalSeconds: 15,
    maxMonitors: 50,
    maxTestCases: 200,
    maxTestRunsPerMonth: 5000,
    maxAiGenerationsPerMonth: 500,
    maxNotificationChannels: 5,
    maxUsers: 10,
    features: ['15-second intervals', '50 monitors', '500 AI generations/mo', 'Slack + PagerDuty alerts', 'Multi-location checks'],
  },
  pro: {
    name: 'Pro',
    priceId: process.env.STRIPE_PRO_PRICE_ID || '',
    monthlyPrice: 15,
    monitorIntervalSeconds: 5,
    maxMonitors: 200,
    maxTestCases: 1000,
    maxTestRunsPerMonth: 25000,
    maxAiGenerationsPerMonth: 2000,
    maxNotificationChannels: 15,
    maxUsers: 25,
    features: ['5-second intervals', '200 monitors', 'AI auto-heal selectors', 'Phone call alerts', 'Custom webhooks', 'Priority support'],
  },
  business: {
    name: 'Business',
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID || '',
    monthlyPrice: 49,
    monitorIntervalSeconds: 5,
    maxMonitors: 1000,
    maxTestCases: 5000,
    maxTestRunsPerMonth: 100000,
    maxAiGenerationsPerMonth: 10000,
    maxNotificationChannels: 50,
    maxUsers: 100,
    features: ['Multi-region', '1000 monitors', 'Unlimited AI', 'SLA guarantees', 'SSO/SAML', 'Dedicated support', 'Custom integrations'],
  },
} as const;

export type PlanTier = keyof typeof PLANS;

// ─── Subscription Management ───────────────────────────────

export async function createCheckoutSession(tenantId: string, plan: PlanTier, successUrl: string, cancelUrl: string) {
  const planConfig = PLANS[plan];
  if (!planConfig.priceId) throw new Error('Cannot checkout for free plan');

  const tenantRows = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  const tenant = tenantRows[0];
  if (!tenant) throw new Error('Tenant not found');

  let customerId = tenant.stripeCustomerId;

  // Create Stripe customer if needed
  if (!customerId) {
    const customer = await getStripe().customers.create({
      name: tenant.name,
      metadata: { tenantId, slug: tenant.slug },
    });
    customerId = customer.id;
    await db.update(tenants)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(tenants.id, tenantId));
  }

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: planConfig.priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { tenantId, plan },
    subscription_data: { metadata: { tenantId, plan } },
  });

  return { sessionId: session.id, url: session.url };
}

export async function createPortalSession(tenantId: string, returnUrl: string) {
  const tenantRows = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  const tenant = tenantRows[0];
  if (!tenant?.stripeCustomerId) throw new Error('No billing account found');

  const session = await getStripe().billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: returnUrl,
  });

  return { url: session.url };
}

export async function getSubscriptionStatus(tenantId: string) {
  const tenantRows = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  const tenant = tenantRows[0];
  if (!tenant?.stripeCustomerId) {
    return { plan: 'free' as PlanTier, status: 'active', currentPeriodEnd: null };
  }

  const subscriptions = await getStripe().subscriptions.list({
    customer: tenant.stripeCustomerId,
    status: 'active',
    limit: 1,
  });

  const sub = subscriptions.data[0];
  if (!sub) {
    return { plan: 'free' as PlanTier, status: 'active', currentPeriodEnd: null };
  }

  return {
    plan: (sub.metadata.plan || 'free') as PlanTier,
    status: sub.status,
    currentPeriodEnd: null as Date | null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    subscriptionId: sub.id,
  };
}

// ─── Stripe Webhooks ───────────────────────────────────────

export async function handleWebhook(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = session.metadata?.tenantId;
      const plan = session.metadata?.plan as PlanTier;
      if (tenantId && plan) {
        await db.update(tenants)
          .set({
            plan,
            stripeSubscriptionId: session.subscription as string,
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, tenantId));
      }
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      if (tenantId) {
        const plan = (sub.metadata.plan || 'free') as PlanTier;
        await db.update(tenants)
          .set({
            plan: sub.status === 'active' ? plan : 'free',
            updatedAt: new Date(),
          })
          .where(eq(tenants.id, tenantId));
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      if (tenantId) {
        await db.update(tenants)
          .set({ plan: 'free', stripeSubscriptionId: null, updatedAt: new Date() })
          .where(eq(tenants.id, tenantId));
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      // Could send alert to tenant admin — for now just log
      console.error(`Payment failed for customer ${invoice.customer}`);
      break;
    }
  }
}

// ─── Usage Metering ────────────────────────────────────────

export async function recordUsage(tenantId: string, metric: string, quantity = 1) {
  await db.insert(usageRecords).values({ tenantId, metric, quantity });
}

export async function getUsage(tenantId: string, metric: string, periodStart?: Date) {
  const start = periodStart || getMonthStart();
  const rows = await db.select({
    total: sql<number>`coalesce(sum(${usageRecords.quantity}), 0)`,
  }).from(usageRecords)
  .where(
    and(
      eq(usageRecords.tenantId, tenantId),
      eq(usageRecords.metric, metric),
      gte(usageRecords.recordedAt, start),
    )
  );
  return Number(rows[0]?.total ?? 0);
}

export async function getUsageSummary(tenantId: string) {
  const plan = await getSubscriptionStatus(tenantId);
  const planConfig = PLANS[plan.plan];
  const start = getMonthStart();

  const [aiUsage, runUsage, monitorCountResult, testCaseResult, userResult, channelResult] = await Promise.all([
    getUsage(tenantId, 'ai_generation', start),
    getUsage(tenantId, 'test_run', start),
    db.select({ total: count() }).from(monitors).where(eq(monitors.tenantId, tenantId)),
    db.select({ total: count() }).from(testCases).where(eq(testCases.tenantId, tenantId)),
    db.select({ total: count() }).from(users).where(eq(users.tenantId, tenantId)),
    db.select({ total: count() }).from(notificationChannels).where(eq(notificationChannels.tenantId, tenantId)),
  ]);

  const monitorCount = Number(monitorCountResult[0]?.total ?? 0);
  const testCaseCount = Number(testCaseResult[0]?.total ?? 0);
  const userCount = Number(userResult[0]?.total ?? 0);
  const channelCount = Number(channelResult[0]?.total ?? 0);

  const overage = calculateOverage(plan.plan, {
    monitors: monitorCount,
    testCases: testCaseCount,
    testRunsPerMonth: runUsage,
    aiGenerationsPerMonth: aiUsage,
    notificationChannels: channelCount,
    users: userCount,
  });

  return {
    plan: plan.plan,
    planName: planConfig.name,
    monthlyPrice: planConfig.monthlyPrice,
    usage: {
      monitors: { used: monitorCount, limit: planConfig.maxMonitors },
      testCases: { used: testCaseCount, limit: planConfig.maxTestCases },
      aiGenerations: { used: aiUsage, limit: planConfig.maxAiGenerationsPerMonth },
      testRuns: { used: runUsage, limit: planConfig.maxTestRunsPerMonth },
      notificationChannels: { used: channelCount, limit: planConfig.maxNotificationChannels },
      users: { used: userCount, limit: planConfig.maxUsers },
    },
    overage,
  };
}

export function calculateOverage(plan: PlanTier, current: Record<PlanLimitKey, number>): {
  items: { metric: PlanLimitKey; label: string; overage: number; rateCents: number; totalCents: number }[];
  totalCents: number;
} {
  const planConfig = PLANS[plan];
  const items: { metric: PlanLimitKey; label: string; overage: number; rateCents: number; totalCents: number }[] = [];
  let totalCents = 0;

  const limits: Record<PlanLimitKey, number> = {
    monitors: planConfig.maxMonitors,
    testCases: planConfig.maxTestCases,
    testRunsPerMonth: planConfig.maxTestRunsPerMonth,
    aiGenerationsPerMonth: planConfig.maxAiGenerationsPerMonth,
    notificationChannels: planConfig.maxNotificationChannels,
    users: planConfig.maxUsers,
  };

  for (const [key, limit] of Object.entries(limits)) {
    const metric = key as PlanLimitKey;
    const used = current[metric];
    const overage = Math.max(0, used - limit);
    if (overage > 0) {
      const rate = OVERAGE_RATES[metric];
      const itemTotal = overage * rate.rateCents;
      items.push({ metric, label: rate.label, overage, rateCents: rate.rateCents, totalCents: itemTotal });
      totalCents += itemTotal;
    }
  }

  return { items, totalCents };
}

// ─── Helpers ───────────────────────────────────────────────

function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

// ─── Metered billing (pro+ plans) ─────────────────────────

// For metered billing, Stripe tracks usage per subscription item.
// Call this at end of billing period or in real-time.
export async function reportMeteredUsage(subscriptionId: string, quantity: number) {
  const sub = await getStripe().subscriptions.retrieve(subscriptionId);
  const items = sub.items.data;
  // Find the metered item (first item for now)
  const item = items[0];
  if (item) {
    // Stripe v22: usage records are reported via the subscription item
    await getStripe().subscriptionItems.update(item.id, {
      quantity: item.quantity! + quantity,
    });
  }
}
