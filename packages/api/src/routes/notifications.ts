import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireFeature } from '../services/feature-enforcement.service.js';
import * as notificationService from '../services/notification.service.js';

export const notificationsRouter = Router();

// ─── Notification Channels ─────────────────────────────────

const channelConfigSchema = z.object({
  email: z.object({ addresses: z.array(z.string().email()) }).optional(),
  sms: z.object({ phoneNumbers: z.array(z.string()) }).optional(),
  phone: z.object({ phoneNumbers: z.array(z.string()), message: z.string().optional() }).optional(),
  pagerduty: z.object({ routingKey: z.string(), integrationKey: z.string() }).optional(),
  slack: z.object({ webhookUrl: z.string().url(), channelId: z.string().optional(), channelName: z.string().optional() }).optional(),
  discord: z.object({ webhookUrl: z.string().url() }).optional(),
  webhook: z.object({ url: z.string().url(), method: z.enum(['POST', 'PUT']).optional(), headers: z.record(z.string()).optional() }).optional(),
}).refine((data) => {
  const types = ['email', 'sms', 'phone', 'pagerduty', 'slack', 'discord', 'webhook'];
  return types.some((t) => data[t as keyof typeof data] !== undefined);
}, { message: 'At least one channel config must be provided' });

const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['email', 'sms', 'phone', 'pagerduty', 'slack', 'discord', 'webhook']),
  config: channelConfigSchema,
  onMonitorDown: z.boolean().optional(),
  onMonitorRecovery: z.boolean().optional(),
  onTestFailure: z.boolean().optional(),
  onTestRecovery: z.boolean().optional(),
});

notificationsRouter.get('/channels', async (req, res) => {
  const channels = await notificationService.getAllChannels(req.user!.tenantId);
  res.json({ success: true, data: channels });
});

notificationsRouter.get('/channels/:id', async (req, res) => {
  const channel = await notificationService.getChannelById(req.user!.tenantId, req.params.id as string);
  if (!channel) return res.status(404).json({ success: false, error: 'Channel not found' });
  res.json({ success: true, data: channel });
});

notificationsRouter.post('/channels', requireFeature('notificationChannels'), validate(createChannelSchema), async (req, res) => {
  const channel = await notificationService.createChannel(req.user!.tenantId, req.body);
  res.status(201).json({ success: true, data: channel });
});

notificationsRouter.put('/channels/:id', validate(createChannelSchema.partial()), async (req, res) => {
  const channel = await notificationService.updateChannel(req.user!.tenantId, req.params.id as string, req.body);
  if (!channel) return res.status(404).json({ success: false, error: 'Channel not found' });
  res.json({ success: true, data: channel });
});

notificationsRouter.delete('/channels/:id', async (req, res) => {
  const deleted = await notificationService.deleteChannel(req.user!.tenantId, req.params.id as string);
  if (!deleted) return res.status(404).json({ success: false, error: 'Channel not found' });
  res.json({ success: true });
});

// ─── Alert Rules ───────────────────────────────────────────

const escalationStepSchema = z.object({
  channelId: z.string().uuid(),
  delayMinutes: z.number().int().min(0).max(1440),
});

const createRuleSchema = z.object({
  name: z.string().min(1).max(100),
  sourceType: z.enum(['monitor', 'test_suite', 'test_case', 'all']),
  sourceId: z.string().uuid().optional(),
  channelIds: z.array(z.string().uuid()).min(1),
  escalationChain: z.array(escalationStepSchema).optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  quietHoursTimezone: z.string().optional(),
});

notificationsRouter.get('/rules', async (req, res) => {
  const rules = await notificationService.getAllRules(req.user!.tenantId);
  res.json({ success: true, data: rules });
});

notificationsRouter.post('/rules', validate(createRuleSchema), async (req, res) => {
  const rule = await notificationService.createRule(req.user!.tenantId, req.body);
  res.status(201).json({ success: true, data: rule });
});

notificationsRouter.delete('/rules/:id', async (req, res) => {
  const deleted = await notificationService.deleteRule(req.user!.tenantId, req.params.id as string);
  if (!deleted) return res.status(404).json({ success: false, error: 'Rule not found' });
  res.json({ success: true });
});

// ─── Alert History ─────────────────────────────────────────

notificationsRouter.get('/alerts', async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const status = req.query.status as string | undefined;
  const alerts = await notificationService.getAlertHistory(req.user!.tenantId, { limit, status });
  res.json({ success: true, data: alerts });
});

notificationsRouter.post('/alerts/:id/acknowledge', async (req, res) => {
  await notificationService.acknowledgeAlert(
    req.params.id as string,
    req.user!.id,
    req.body.note,
  );
  res.json({ success: true });
});

// ─── Test alert (for setup verification) ───────────────────

notificationsRouter.post('/channels/:id/test', async (req, res) => {
  const channel = await notificationService.getChannelById(req.user!.tenantId, req.params.id as string);
  if (!channel) return res.status(404).json({ success: false, error: 'Channel not found' });

  try {
    // Import the dispatch function dynamically to avoid circular deps
    const { sendAlert } = await import('../services/notification.service.js');
    await sendAlert({
      tenantId: req.user!.tenantId,
      sourceType: 'monitor',
      sourceId: '00000000-0000-0000-0000-000000000000',
      sourceName: 'Test Alert',
      severity: 'info',
      title: 'FusionPulse Test Alert',
      message: 'This is a test notification from FusionPulse by ColeFusion. If you received this, your alerting is configured correctly.',
    });
    res.json({ success: true, message: 'Test alert sent' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
