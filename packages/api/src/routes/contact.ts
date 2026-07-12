import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { sendContactEmail } from '../services/contact.service.js';

export const contactRouter = Router();

const contactSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  reason: z.enum(['sales', 'support', 'partnership', 'other']).default('other'),
  message: z.string().min(1).max(5000),
  // Honeypot — real users never see/fill this field; bots often do.
  website: z.string().max(0).optional(),
});

// Very small in-memory rate limit: 5 submissions per IP per hour.
// Resets on process restart — fine for a low-volume contact form.
const submissionsByIp = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (submissionsByIp.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  submissionsByIp.set(ip, timestamps);
  return timestamps.length > MAX_PER_WINDOW;
}

contactRouter.post('/', validate(contactSchema), (req, res) => {
  const ip = req.ip || 'unknown';
  if (isRateLimited(ip)) {
    res.status(429).json({ success: false, error: 'Too many requests — please try again later.' });
    return;
  }

  // Honeypot tripped — silently pretend success so bots don't learn.
  if (req.body.website) {
    res.status(200).json({ success: true });
    return;
  }

  // Respond immediately — the visitor shouldn't wait on SES latency (which
  // has been observed to occasionally take 10s+ on this host). Send the
  // email in the background and just log if it ultimately fails; nothing
  // in the submitted data is time-sensitive enough to justify blocking.
  res.status(200).json({ success: true });

  sendContactEmail(req.body).catch((err) => {
    console.error('Failed to send contact email (background):', err);
  });
});
