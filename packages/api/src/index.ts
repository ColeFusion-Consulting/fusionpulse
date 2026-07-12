import dns from 'node:dns';
import express from 'express';
import cors from 'cors';
import { authenticate, requireRole, requireUserType } from './middleware/auth.js';
import { requestLogger } from './middleware/audit.js';
import { authRouter } from './routes/auth.js';
import { provisioningRouter } from './routes/provisioning.js';
import { monitorsRouter } from './routes/monitors.js';
import { testsRouter } from './routes/tests.js';
import { aiRouter } from './routes/ai.js';
import { notificationsRouter } from './routes/notifications.js';
import { billingRouter } from './routes/billing.js';
import { usersRouter } from './routes/users.js';
import { apiKeysRouter } from './routes/api-keys.js';
import { auditRouter } from './routes/audit.js';
import { statusPageRouter } from './routes/statuspage.js';
import { contactRouter } from './routes/contact.js';
import { warmUpSesClient } from './services/contact.service.js';

// This host's network is IPv4-only. Prefer IPv4 DNS resolution to avoid
// any happy-eyeballs-style delay on outbound calls (SES, Stripe, OpenAI).
dns.setDefaultResultOrder('ipv4first');

const app = express();
const PORT = Number(process.env.API_PORT) || 3001;

// ─── Middleware ──────────────────────────────────────────────
app.use(cors());

// Stripe webhook needs raw body — mount before JSON middleware
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// ─── Public routes ──────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'fusionpulse-api', version: '0.1.0', uptime: process.uptime() });
});

// Public auth routes (signup, login, refresh, logout)
app.use('/api/auth', authRouter);

// Public provisioning routes (authenticated via provisioning token, not regular JWT)
app.use('/api/provisioning', provisioningRouter);

// Public status pages (no auth)
app.use('/api/status', statusPageRouter);

// Public contact form (no auth)
app.use('/api/contact', contactRouter);

// ─── Auth-protected routes ───────────────────────────────────
app.use('/api/monitors', authenticate, monitorsRouter);
app.use('/api/tests', authenticate, testsRouter);
app.use('/api/ai', authenticate, aiRouter);
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
