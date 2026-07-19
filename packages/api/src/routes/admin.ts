import { Router } from 'express';
import { requireUserType } from '../middleware/auth.js';
import { db } from '../db/client.js';
import { tenants } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { PLANS } from '../services/billing.service.js';
import { getEffectiveLimits } from '../services/feature-enforcement.service.js';

export const adminRouter = Router();
adminRouter.use(requireUserType('root'));

adminRouter.get('/tenants', async (req, res) => {
  const all = await db.select().from(tenants).orderBy(tenants.createdAt);
  res.json({ success: true, data: all });
});

adminRouter.get('/tenants/:id/limits', async (req, res) => {
  const limits = await getEffectiveLimits(req.params.id as string);
  res.json({ success: true, data: limits });
});

adminRouter.put('/tenants/:id/overrides', async (req, res) => {
  const { overrides } = req.body;
  const tenant = await db.select().from(tenants).where(eq(tenants.id, req.params.id as string)).then(r => r[0]);
  if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

  const settings = (tenant.settings || {}) as any;
  settings.featureOverrides = overrides;

  await db.update(tenants).set({ settings }).where(eq(tenants.id, req.params.id as string));
  const limits = await getEffectiveLimits(req.params.id as string);

  res.json({ success: true, data: { overrides, effective: limits } });
});

adminRouter.delete('/tenants/:id/overrides', async (req, res) => {
  const tenant = await db.select().from(tenants).where(eq(tenants.id, req.params.id as string)).then(r => r[0]);
  if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

  const settings = (tenant.settings || {}) as any;
  delete settings.featureOverrides;

  await db.update(tenants).set({ settings }).where(eq(tenants.id, req.params.id as string));
  res.json({ success: true, data: { message: 'Overrides cleared' } });
});

adminRouter.get('/plans', async (req, res) => {
  res.json({ success: true, data: PLANS });
});
