import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { sendContactEmail } from '../services/contact.service.js';

export const contactRouter = Router();

// ─── Spam detection helpers ─────────────────────────────────

const SPAM_PATTERNS = [
  /\b(crypto|bitcoin|btc|eth|invest|withdraw|bonus|casino|seo services|buy now|click here)\b/i,
  /\b(cheap|viagra|cialis|enlargement|refinance|mortgage|loan)\b/i,
  /\b(smm panel|insta(gram)? followers|tiktok followers)\b/i,
];

// Common non-spam keywords that legitimate dev/tech inquiries contain
const LEGITIMATE_KEYWORDS = /\b(api|sdk|integration|endpoint|documentation|bug|feature request|pricing|deploy|migrate|self[- ]hosted|enterprise|billing|monitor|test|ci[- ]cd|pipeline)\b/i;

function isLikelySpam(message: string): boolean {
  // Empty or very short messages
  if (message.length < 10) return true;

  // Gibberish detection: ratio of unique chars to total chars
  const uniqueChars = new Set(message.toLowerCase().replace(/\s/g, '')).size;
  const charRatio = uniqueChars / message.length;
  // Very high unique char ratio suggests keyboard-mashing
  if (charRatio > 0.85 && message.length > 30) return true;

  // Excessive URLs (more than 2)
  const urlCount = (message.match(/https?:\/\//g) || []).length;
  if (urlCount > 2) return true;

  // Spam keyword patterns — but be lenient if message also has legitimate keywords
  const hasLegitKeywords = LEGITIMATE_KEYWORDS.test(message);
  const spamMatchCount = SPAM_PATTERNS.filter((p) => p.test(message)).length;
  if (spamMatchCount >= 2 && !hasLegitKeywords) return true;
  if (spamMatchCount >= 3) return true;

  // All-caps sections longer than 60 chars (shouting/spam)
  const capsBlocks = message.match(/[A-Z\s]{20,}/g);
  if (capsBlocks && capsBlocks.some((b) => b.length > 60)) return true;

  return false;
}

// ─── Schema with multi-layer honeypot and timing check ──────

const contactSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  reason: z.enum(['sales', 'support', 'partnership', 'other']).default('other'),
  message: z.string().min(1).max(5000),

  // Honeypot fields — hidden from real users, bots often fill them in
  website: z.string().max(0).optional(),
  phone: z.string().max(0).optional(),
  company: z.string().max(0).optional(),

  // Timestamp of when the page was loaded (ms epoch).
  // If the form is submitted less than 3 seconds after load, it's a bot.
  _loadTime: z.preprocess((v) => typeof v === 'string' ? parseInt(v, 10) : v, z.number()).optional(),

  // Math challenge — simple arithmetic to block automated bots
  _a: z.preprocess((v) => typeof v === 'string' ? parseInt(v, 10) : v, z.number()).optional(),
  _b: z.preprocess((v) => typeof v === 'string' ? parseInt(v, 10) : v, z.number()).optional(),
  _answer: z.preprocess((v) => typeof v === 'string' ? parseInt(v, 10) : v, z.number()).optional(),
});

// ─── Rate limiting ─────────────────────────────────────────

// Tier 1: IP-based — 5 submissions per IP per hour
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
  // 1. IP rate limit
  const ip = req.ip || 'unknown';
  if (isRateLimited(ip)) {
    res.status(429).json({ success: false, error: 'Too many requests — please try again later.' });
    return;
  }

  // 2. Multi-honeypot check — any hidden field filled = bot
  if (req.body.website || req.body.phone || req.body.company) {
    res.status(200).json({ success: true });
    return;
  }

  // 3. Timing check — submitted too fast (< 3s from page load)
  if (req.body._loadTime && Date.now() - req.body._loadTime < 3000) {
    res.status(200).json({ success: true });
    return;
  }

  // 4. Math challenge — verify the user answered correctly
  const { _a, _b, _answer } = req.body;
  if (typeof _a !== 'number' || typeof _b !== 'number' || typeof _answer !== 'number' || _a + _b !== _answer) {
    res.status(200).json({ success: true });
    return;
  }

  // 5. Content-based spam detection
  if (isLikelySpam(req.body.message)) {
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
