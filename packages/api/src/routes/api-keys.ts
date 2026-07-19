import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import * as apiKeyService from '../services/api-keys.service.js';

export const apiKeysRouter = Router();

const createSchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
});

const toggleSchema = z.object({
  enabled: z.boolean(),
});

// GET /keys — list all API keys
apiKeysRouter.get('/', async (req, res) => {
  const keys = await apiKeyService.listKeys(req.user!.tenantId);
  res.json({ success: true, data: keys });
});

// POST /keys — create a new API key
apiKeysRouter.post('/', validate(createSchema), async (req, res) => {
  const key = await apiKeyService.createKey(req.user!.tenantId, req.body);
  // Return the raw key only on creation — it won't be shown again
  res.status(201).json({ success: true, data: key });
});

// PUT /keys/:id/toggle — enable/disable a key
apiKeysRouter.put('/:id/toggle', validate(toggleSchema), async (req, res) => {
  const ok = await apiKeyService.toggleKey(req.user!.tenantId, req.params.id as string, req.body.enabled);
  if (!ok) return res.status(404).json({ success: false, error: 'Key not found' });
  res.json({ success: true });
});

// DELETE /keys/:id — delete a key
apiKeysRouter.delete('/:id', async (req, res) => {
  const ok = await apiKeyService.deleteKey(req.user!.tenantId, req.params.id as string);
  if (!ok) return res.status(404).json({ success: false, error: 'Key not found' });
  res.json({ success: true });
});
