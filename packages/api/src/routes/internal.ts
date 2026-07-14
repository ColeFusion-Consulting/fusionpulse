import { Router } from 'express';
import { internalAuth } from '../middleware/internal-auth.js';
import { recordRun } from '../services/test.service.js';

export const internalRouter = Router();

internalRouter.use(internalAuth);

internalRouter.post('/test-runs', async (req, res) => {
  const { runId, tenantId, testType, testId, status, durationMs, stepsPassed, stepsTotal, errorMessage, screenshotPaths } = req.body;

  if (!runId || !tenantId || !testType) {
    res.status(400).json({ success: false, error: 'Missing required fields: runId, tenantId, testType' });
    return;
  }

  try {
    await recordRun({
      id: runId,
      tenantId,
      testType,
      testId: testId || '',
      status,
      durationMs: durationMs || 0,
      stepsPassed: stepsPassed || 0,
      stepsTotal: stepsTotal || 0,
      errorMessage,
      screenshotUrls: screenshotPaths || [],
    });
    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to record test run:', err);
    res.status(500).json({ success: false, error: 'Failed to record test run' });
  }
});
