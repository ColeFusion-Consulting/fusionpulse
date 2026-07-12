import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import * as aiService from '../services/ai.service.js';

export const aiRouter = Router();

const generateSchema = z.object({
  prompt: z.string().min(10).max(2000),
  context: z.string().max(2000).optional(),
  suiteId: z.string().uuid().optional(),
});

const healSchema = z.object({
  failedSelector: z.string(),
  domSnapshot: z.string().max(10000),
  intent: z.string(),
});

const analyzeSchema = z.object({
  errorMessage: z.string(),
  screenshotUrl: z.string().url().optional(),
  testSteps: z.array(z.any()),
});

aiRouter.post('/generate', validate(generateSchema), async (req, res) => {
  try {
    const result = await aiService.generateTestSteps(req.user!.tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

aiRouter.post('/heal', validate(healSchema), async (req, res) => {
  try {
    const result = await aiService.healSelector(req.user!.tenantId, req.body);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

aiRouter.post('/analyze', validate(analyzeSchema), async (req, res) => {
  try {
    const analysis = await aiService.analyzeFailure(req.user!.tenantId, req.body);
    res.json({ success: true, data: { analysis } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
