import { Router } from 'express';
import { queryAuditLogs } from '../services/audit.service.js';
import { requireUserType } from '../middleware/auth.js';

export const auditRouter = Router();

auditRouter.use(requireUserType('root'));

auditRouter.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const action = req.query.action as string | undefined;
  const since = req.query.since ? new Date(req.query.since as string) : undefined;

  const result = await queryAuditLogs(req.user!.tenantId, { limit, offset, action, since });
  res.json({ success: true, data: result });
});
