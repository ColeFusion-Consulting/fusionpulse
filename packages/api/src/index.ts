import dns from 'node:dns';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { authenticate, requireRole, requireUserType } from './middleware/auth.js';
import { requestLogger } from './middleware/audit.js';
import { authRouter } from './routes/auth.js';
import { provisioningRouter } from './routes/provisioning.js';
import { monitorsRouter } from './routes/monitors.js';
import { testsRouter } from './routes/tests.js';
import { aiRouter } from './routes/ai.js';
import { notificationsRouter } from './routes/notifications.js';
import { billingRouter, handleStripeWebhook } from './routes/billing.js';
import { usersRouter } from './routes/users.js';
import { apiKeysRouter } from './routes/api-keys.js';
import { testPlanRouter } from './routes/test-plans.js';
import { auditRouter } from './routes/audit.js';
import { statusPageRouter } from './routes/statuspage.js';
import { contactRouter } from './routes/contact.js';
import { warmUpSesClient } from './services/contact.service.js';

// This host's network is IPv4-only. Prefer IPv4 DNS resolution to avoid
// any happy-eyeballs-style delay on outbound calls (SES, Stripe, OpenAI).
dns.setDefaultResultOrder('ipv4first');

const app = express();
const PORT = Number(process.env.API_PORT || process.env.PORT) || 3001;

// ─── Middleware ──────────────────────────────────────────────
app.use((req, res, next) => {
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);
  (req as any).requestId = requestId;
  next();
});

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173,https://app.fusionpulse.colefusion.net').split(',');
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' },
});

app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// ─── Public routes ──────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'fusionpulse-api', version: '0.1.0', uptime: process.uptime() });
});

// Public auth routes (signup, login, refresh, logout) — rate limited
app.use('/api/auth', authLimiter, authRouter);

// Public provisioning routes (authenticated via provisioning token, not regular JWT)
app.use('/api/provisioning', provisioningRouter);

// Public status pages (no auth)
app.use('/api/status', statusPageRouter);

// Public contact form (no auth)
app.use('/api/contact', contactRouter);

// Stripe webhook — raw body, no auth (Stripe can't provide Bearer tokens).
// Mounted via app.post() so Express won't fall through to the authenticate
// middleware on the billingRouter below.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// ─── Auth-protected routes ───────────────────────────────────
app.use('/api/monitors', authenticate, monitorsRouter);
app.use('/api/tests', authenticate, testsRouter);
app.use('/api/ai', authenticate, aiLimiter, aiRouter);
app.use('/api/notifications', authenticate, notificationsRouter);
app.use('/api/billing', authenticate, billingRouter);
app.use('/api/users', authenticate, usersRouter);

// ─── Error handler ──────────────────────────────────────────
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ─── Start ──────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`FusionPulse API running on http://0.0.0.0:${PORT}`);
  warmUpSesClient();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  const { closePool } = await import('./db/client.js');
  await closePool();
  process.exit(0);
});
