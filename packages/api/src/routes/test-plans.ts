import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import * as testPlanService from '../services/test-plan.service.js';

export const testPlanRouter = Router();

const generateSchema = z.object({
  siteUrl: z.string().url(),
  name: z.string().max(200).optional(),
});

const updateSchema = z.object({
  name: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['draft', 'review', 'approved', 'implemented']).optional(),
  userFeedback: z.string().max(5000).optional(),
});

const approveSchema = z.object({
  feedback: z.string().max(5000).optional(),
});

// GET /test-plans — list all plans
testPlanRouter.get('/', async (req, res) => {
  const plans = await testPlanService.getTestPlans(req.user!.tenantId);
  res.json({ success: true, data: plans });
});

// GET /test-plans/:id — get a specific plan
testPlanRouter.get('/:id', async (req, res) => {
  const plan = await testPlanService.getTestPlanById(req.user!.tenantId, req.params.id as string);
  if (!plan) return res.status(404).json({ success: false, error: 'Test plan not found' });
  res.json({ success: true, data: plan });
});

// POST /test-plans/generate — generate a new AI test plan
testPlanRouter.post('/generate', validate(generateSchema), async (req, res) => {
  try {
    const plan = await testPlanService.generateTestPlan(req.user!.tenantId, req.body.siteUrl, req.body.name);
    res.status(201).json({ success: true, data: plan });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT /test-plans/:id — update a plan
testPlanRouter.put('/:id', validate(updateSchema), async (req, res) => {
  const plan = await testPlanService.updateTestPlan(req.user!.tenantId, req.params.id as string, req.body);
  if (!plan) return res.status(404).json({ success: false, error: 'Test plan not found' });
  res.json({ success: true, data: plan });
});

// POST /test-plans/:id/approve — mark as reviewed with optional feedback
testPlanRouter.post('/:id/approve', validate(approveSchema), async (req, res) => {
  try {
    const plan = await testPlanService.approveTestPlan(req.user!.tenantId, req.params.id as string, req.body.feedback);
    res.json({ success: true, data: plan });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});
