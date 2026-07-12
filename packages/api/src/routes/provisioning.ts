import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { onProvisioningEvent, getProvisioningStatus } from '../services/provisioning.service.js';
import type { ProvisioningEvent, ProvisioningCompleteEvent } from '../types/index.js';

export const provisioningRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

// GET /provisioning/events/:tenantId — SSE endpoint for real-time provisioning updates
provisioningRouter.get('/events/:tenantId', (req: Request, res: Response) => {
  const tenantId = String(req.params.tenantId || '');
  const token = String(req.query.token || '');

  if (!token) {
    res.status(401).json({ success: false, error: 'Missing provisioning token' });
    return;
  }

  // Validate provisioning token
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (payload.tenantId !== tenantId || payload.type !== 'provisioning') {
      res.status(403).json({ success: false, error: 'Invalid provisioning token' });
      return;
    }
  } catch {
    res.status(403).json({ success: false, error: 'Invalid or expired provisioning token' });
    return;
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected', tenantId })}\n\n`);

  // Send current status
  getProvisioningStatus(tenantId).then((job) => {
    if (job) {
      res.write(`data: ${JSON.stringify({
        type: 'status',
        step: job.currentStep,
        progress: job.progress,
        status: job.status,
        steps: job.steps,
        stepsCompleted: job.stepsCompleted,
      })}\n\n`);
    }
  });

  // Listen for provisioning events
  const cleanup = onProvisioningEvent(tenantId, (event: ProvisioningEvent | ProvisioningCompleteEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);

    if (event.status === 'completed' || event.status === 'failed') {
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    }
  });

  // Clean up on client disconnect
  req.on('close', () => {
    cleanup();
  });
});

// GET /provisioning/status/:tenantId — REST polling endpoint
provisioningRouter.get('/status/:tenantId', async (req: Request, res: Response) => {
  const tenantId = String(req.params.tenantId || '');
  const token = String(req.query.token || '');

  if (!token) {
    res.status(401).json({ success: false, error: 'Missing provisioning token' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (payload.tenantId !== tenantId || payload.type !== 'provisioning') {
      res.status(403).json({ success: false, error: 'Invalid provisioning token' });
      return;
    }
  } catch {
    res.status(403).json({ success: false, error: 'Invalid or expired provisioning token' });
    return;
  }

  try {
    const job = await getProvisioningStatus(tenantId);
    if (!job) {
      res.status(404).json({ success: false, error: 'Provisioning job not found' });
      return;
    }
    res.json({ success: true, data: job });
  } catch (err: any) {
    console.error('Provisioning status error:', err);
    res.status(500).json({ success: false, error: 'Failed to get provisioning status' });
  }
});
