import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireFeature, getEffectiveLimits } from '../services/feature-enforcement.service.js';
import * as monitorService from '../services/monitor.service.js';

export const monitorsRouter = Router();

const createMonitorSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional(),
  expectedStatus: z.number().int().min(100).max(599).optional(),
  expectedBody: z.string().optional(),
  intervalSeconds: z.number().int().min(60).max(86400).optional(),
  locations: z.array(z.string()).optional(),
});

monitorsRouter.get('/', async (req, res) => {
  const monitors = await monitorService.getAllMonitors(req.user!.tenantId);
  // Attach latest result to each monitor
  const enriched = await Promise.all(monitors.map(async (m: any) => {
    const latest = await monitorService.getLatestResult(req.user!.tenantId, m.id);
    return { ...m, latestResult: latest || null };
  }));
  res.json({ success: true, data: enriched });
});

monitorsRouter.get('/:id', async (req, res) => {
  const monitor = await monitorService.getMonitorById(req.user!.tenantId, req.params.id);
  if (!monitor) return res.status(404).json({ success: false, error: 'Monitor not found' });
  res.json({ success: true, data: monitor });
});

monitorsRouter.post('/', requireFeature('monitors'), validate(createMonitorSchema), async (req, res) => {
  const limits = await getEffectiveLimits(req.user!.tenantId);
  const clampedInterval = req.body.intervalSeconds
    ? Math.max(req.body.intervalSeconds, limits.monitorIntervalSeconds)
    : undefined;
  const monitor = await monitorService.createMonitor(req.user!.tenantId, { ...req.body, intervalSeconds: clampedInterval });
  res.status(201).json({ success: true, data: monitor });
});

monitorsRouter.put('/:id', validate(createMonitorSchema.partial()), async (req, res) => {
  const monitor = await monitorService.updateMonitor(req.user!.tenantId, req.params.id as string, req.body);
  if (!monitor) return res.status(404).json({ success: false, error: 'Monitor not found' });
  res.json({ success: true, data: monitor });
});

monitorsRouter.delete('/:id', async (req, res) => {
  const deleted = await monitorService.deleteMonitor(req.user!.tenantId, req.params.id);
  if (!deleted) return res.status(404).json({ success: false, error: 'Monitor not found' });
  res.json({ success: true });
});

monitorsRouter.post('/:id/check', async (req, res) => {
  try {
    const result = await monitorService.runMonitorCheck(req.user!.tenantId, req.params.id);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

monitorsRouter.get('/:id/history', async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const history = await monitorService.getMonitorHistory(req.user!.tenantId, req.params.id, limit);
  res.json({ success: true, data: history });
});
