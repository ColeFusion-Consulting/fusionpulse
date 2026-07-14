import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { requireUserType } from '../middleware/auth.js';
import { requireFeature } from '../services/feature-enforcement.service.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export const usersRouter = Router();

// All user management endpoints require root user
usersRouter.use(requireUserType('root'));

// GET /users — list all users in tenant
usersRouter.get('/', async (req, res) => {
  const tenantUsers = await db.select().from(users).where(eq(users.tenantId, req.user!.tenantId));
  res.json({ success: true, data: tenantUsers });
});

// POST /users/invite — invite a new user
const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(['admin', 'member']).default('member'),
});

usersRouter.post('/invite', requireFeature('users'), validate(inviteSchema), async (req, res) => {
  const { email, name, role } = req.body;
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    tenantId: req.user!.tenantId,
    email,
    name: name || null,
    userType: 'user',
    role,
  });
  res.status(201).json({ success: true, data: { id: userId } });
});

// DELETE /users/:id — remove a user
usersRouter.delete('/:id', async (req, res) => {
  const userId = req.params.id as string;
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user.length || user[0].tenantId !== req.user!.tenantId) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  // Don't allow deleting yourself
  if (user[0].id === req.user!.id) {
    res.status(400).json({ success: false, error: 'Cannot remove yourself' });
    return;
  }
  await db.delete(users).where(eq(users.id, userId));
  res.json({ success: true });
});
