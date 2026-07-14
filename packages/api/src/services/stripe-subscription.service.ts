import Stripe from 'stripe';
import type { PlanId, AddonId, AddonDefinition } from '../types/subscription.js';

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe && process.env.STRIPE_SECRET_KEY) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-06-24.dahlia' });
  }
  return _stripe!;
}

function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export const ADDONS: Record<AddonId, AddonDefinition> = {
  ai_repair_agent: {
    id: 'ai_repair_agent',
    name: 'AI Repair Agent',
    description: 'Automatic test repair and maintenance powered by AI',
    monthlyPrice: 1500,
    stripePriceId: process.env.STRIPE_AI_REPAIR_AGENT_PRICE_ID || 'price_ai_repair_agent',
  },
  e2e_video_recordings: {
    id: 'e2e_video_recordings',
    name: 'E2E Video Recordings',
    description: 'Record and review video of every test run',
    monthlyPrice: 1000,
    stripePriceId: process.env.STRIPE_E2E_VIDEO_PRICE_ID || 'price_e2e_video',
  },
  stealth_browser: {
    id: 'stealth_browser',
    name: 'Stealth Browser + CAPTCHA',
    description: 'Undetectable browser automation with CAPTCHA solving',
    monthlyPrice: 500,
    stripePriceId: process.env.STRIPE_STEALTH_PRICE_ID || 'price_stealth',
  },
  phone_alerts: {
    id: 'phone_alerts',
    name: 'Phone Call Alerts',
    description: 'Receive phone calls for critical alerts',
    monthlyPrice: 800,
    stripePriceId: process.env.STRIPE_PHONE_ALERTS_PRICE_ID || 'price_phone_alerts',
  },
  multi_region: {
    id: 'multi_region',
    name: 'Multi-Region Checks',
    description: 'Run checks from multiple global regions',
    monthlyPrice: 1200,
    stripePriceId: process.env.STRIPE_MULTI_REGION_PRICE_ID || 'price_multi_region',
  },
};

export async function createCustomer(tenantId: string, email: string, name: string): Promise<string> {
  if (!isStripeConfigured()) {
    return 'mock_customer_' + tenantId;
  }

  const customer = await getStripe().customers.create({
    email,
    name,
    metadata: { tenantId },
  });

  return customer.id;
}

export async function createSubscription(
  customerId: string,
  planId: PlanId,
  addons: AddonId[],
): Promise<{ subscriptionId: string; clientSecret?: string }> {
  if (!isStripeConfigured() || customerId.startsWith('mock_')) {
    return { subscriptionId: 'mock_sub_' + customerId };
  }

  const planPriceId = getPlanPriceId(planId);
  const lineItems: Stripe.SubscriptionCreateParams.Item[] = [];

  if (planPriceId) {
    lineItems.push({ price: planPriceId, quantity: 1 });
  }

  for (const addonId of addons) {
    const addon = ADDONS[addonId];
    if (addon) {
      lineItems.push({ price: addon.stripePriceId, quantity: 1 });
    }
  }

  const subscription = await getStripe().subscriptions.create({
    customer: customerId,
    items: lineItems,
    metadata: { plan: planId, addons: addons.join(',') },
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent'],
  });

  const invoice = subscription.latest_invoice as any;
  const clientSecret: string | undefined = invoice?.payment_intent?.client_secret || undefined;

  return { subscriptionId: subscription.id, clientSecret };
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  if (!isStripeConfigured() || subscriptionId.startsWith('mock_')) {
    return;
  }

  await getStripe().subscriptions.cancel(subscriptionId);
}

export async function handleSubscriptionWebhook(event: Stripe.Event): Promise<void> {
  if (!isStripeConfigured()) return;

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(`Checkout completed for customer ${session.customer}`);
      break;
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      console.log(`Payment succeeded for invoice ${invoice.id}`);
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      console.error(`Payment failed for customer ${invoice.customer}`);
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      console.log(`Subscription ${sub.id} updated to ${sub.status}`);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      console.log(`Subscription ${sub.id} deleted`);
      break;
    }
  }
}

function getPlanPriceId(planId: PlanId): string | null {
  switch (planId) {
    case 'free': return null;
    case 'starter': return process.env.STRIPE_STARTER_PRICE_ID || '';
    case 'pro': return process.env.STRIPE_PRO_PRICE_ID || '';
    case 'business': return process.env.STRIPE_BUSINESS_PRICE_ID || '';
  }
}
