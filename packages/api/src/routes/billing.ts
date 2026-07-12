import { Router, raw } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import * as billingService from '../services/billing.service.js';
import Stripe from 'stripe';

export const billingRouter = Router();

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe && process.env.STRIPE_SECRET_KEY) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-06-24.dahlia' });
  }
  return _stripe!;
}

// ─── Get current plan + usage ──────────────────────────────

billingRouter.get('/status', async (req, res) => {
  const [subscription, usage] = await Promise.all([
    billingService.getSubscriptionStatus(req.user!.tenantId),
    billingService.getUsageSummary(req.user!.tenantId),
  ]);
  res.json({ success: true, data: { subscription, usage } });
});

// ─── Get available plans ───────────────────────────────────

billingRouter.get('/plans', async (req, res) => {
  const plans = Object.entries(billingService.PLANS).map(([key, plan]) => ({
    id: key,
    name: plan.name,
    monthlyPrice: plan.monthlyPrice,
    features: plan.features,
    limits: {
      monitorIntervalSeconds: plan.monitorIntervalSeconds,
      maxMonitors: plan.maxMonitors,
      maxTestCases: plan.maxTestCases,
      maxTestRunsPerMonth: plan.maxTestRunsPerMonth,
      maxAiGenerationsPerMonth: plan.maxAiGenerationsPerMonth,
      maxNotificationChannels: plan.maxNotificationChannels,
      maxUsers: plan.maxUsers,
    },
  }));
  res.json({ success: true, data: plans });
});

// ─── Checkout session ──────────────────────────────────────

const checkoutSchema = z.object({
  plan: z.enum(['starter', 'pro', 'business']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

billingRouter.post('/checkout', validate(checkoutSchema), async (req, res) => {
  try {
    const { sessionId, url } = await billingService.createCheckoutSession(
      req.user!.tenantId,
      req.body.plan,
      req.body.successUrl,
      req.body.cancelUrl,
    );
    res.json({ success: true, data: { sessionId, url } });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ─── Customer portal ───────────────────────────────────────

const portalSchema = z.object({
  returnUrl: z.string().url(),
});

billingRouter.post('/portal', validate(portalSchema), async (req, res) => {
  try {
    const { url } = await billingService.createPortalSession(req.user!.tenantId, req.body.returnUrl);
    res.json({ success: true, data: { url } });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ─── Stripe webhook (raw body required) ────────────────────

billingRouter.post('/webhook', raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('STRIPE_WEBHOOK_SECRET not set, skipping webhook verification');
    res.json({ received: true });
    return;
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(req.body, sig!, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  try {
    await billingService.handleWebhook(event);
    res.json({ received: true });
  } catch (err: any) {
    console.error('Webhook handler error:', err);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// ─── Usage tracking ────────────────────────────────────────

billingRouter.post('/usage/record', async (req, res) => {
  const { metric, quantity } = req.body;
  if (!metric) {
    res.status(400).json({ success: false, error: 'metric required' });
    return;
  }
  await billingService.recordUsage(req.user!.tenantId, metric, quantity || 1);
  res.json({ success: true });
});

billingRouter.get('/usage', async (req, res) => {
  const usage = await billingService.getUsageSummary(req.user!.tenantId);
  res.json({ success: true, data: usage });
});
