import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import * as testService from '../services/test.service.js';

export const testsRouter = Router();

const createSuiteSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

const createCaseSchema = z.object({
  suiteId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  steps: z.array(z.object({
    action: z.enum(['navigate', 'click', 'type', 'waitForSelector', 'screenshot', 'assertText', 'assertElementExists', 'waitForNavigation', 'scrollToElement']),
    target: z.string().optional(),
    value: z.string().optional(),
    url: z.string().optional(),
    timeout: z.number().optional(),
    description: z.string().optional(),
  })).min(1),
  enabled: z.boolean().optional(),
  scheduleCron: z.string().optional(),
});

// ─── Suites ─────────────────────────────────────────────────
testsRouter.get('/suites', async (req, res) => {
  const suites = await testService.getAllSuites(req.user!.tenantId);
  res.json({ success: true, data: suites });
});

testsRouter.post('/suites', validate(createSuiteSchema), async (req, res) => {
  const suite = await testService.createSuite(req.user!.tenantId, req.body);
  res.status(201).json({ success: true, data: suite });
});

testsRouter.delete('/suites/:id', async (req, res) => {
  const deleted = await testService.deleteSuite(req.user!.tenantId, req.params.id);
  if (!deleted) return res.status(404).json({ success: false, error: 'Suite not found' });
  res.json({ success: true });
});

// ─── Cases ──────────────────────────────────────────────────
testsRouter.get('/cases', async (req, res) => {
  const suiteId = req.query.suiteId as string | undefined;
  const cases = await testService.getAllCases(req.user!.tenantId, suiteId);
  res.json({ success: true, data: cases });
});

testsRouter.get('/cases/:id', async (req, res) => {
  const tc = await testService.getCaseById(req.user!.tenantId, req.params.id);
  if (!tc) return res.status(404).json({ success: false, error: 'Test case not found' });
  res.json({ success: true, data: tc });
});

testsRouter.post('/cases', validate(createCaseSchema), async (req, res) => {
  const tc = await testService.createCase(req.user!.tenantId, req.body);
  res.status(201).json({ success: true, data: tc });
});

testsRouter.put('/cases/:id', validate(createCaseSchema.partial()), async (req, res) => {
  const tc = await testService.updateCase(req.user!.tenantId, req.params.id as string, req.body);
  if (!tc) return res.status(404).json({ success: false, error: 'Test case not found' });
  res.json({ success: true, data: tc });
});

testsRouter.delete('/cases/:id', async (req, res) => {
  const deleted = await testService.deleteCase(req.user!.tenantId, req.params.id);
  if (!deleted) return res.status(404).json({ success: false, error: 'Test case not found' });
  res.json({ success: true });
});

// ─── Runs ───────────────────────────────────────────────────
testsRouter.get('/runs', async (req, res) => {
  const caseId = req.query.caseId as string | undefined;
  const limit = Number(req.query.limit) || 50;
  const runs = await testService.getRunHistory(req.user!.tenantId, caseId, limit);
  res.json({ success: true, data: runs });
});
