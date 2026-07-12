import { Router } from 'express';
import * as statusPageService from '../services/statuspage.service.js';

export const statusPageRouter = Router();

// ─── Public status page (no auth) ─────────────────────────

statusPageRouter.get('/:slug', async (req, res) => {
  const status = await statusPageService.getPublicStatus(req.params.slug);
  if (!status) {
    res.status(404).json({ success: false, error: 'Status page not found' });
    return;
  }
  res.json({ success: true, data: status });
});

statusPageRouter.get('/:slug/history/:monitorId', async (req, res) => {
  const days = Number(req.query.days) || 30;
  const history = await statusPageService.getUptimeHistory(req.params.slug, req.params.monitorId, days);
  if (!history) {
    res.status(404).json({ success: false, error: 'Monitor not found' });
    return;
  }
  res.json({ success: true, data: history });
});

// ─── Badge endpoints (for embedding) ──────────────────────

statusPageRouter.get('/:slug/badge.svg', async (req, res) => {
  const status = await statusPageService.getPublicStatus(req.params.slug);
  if (!status) {
    res.status(404).send('Not found');
    return;
  }

  const statusColors: Record<string, string> = {
    all_operational: '#22c55e',
    partial_outage: '#eab308',
    major_outage: '#ef4444',
  };

  const color = statusColors[status.status] || '#6b7280';
  const label = status.status === 'all_operational' ? 'Operational' :
                status.status === 'partial_outage' ? 'Degraded' : 'Outage';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="170" height="22">
  <rect width="70" height="22" fill="#374151" rx="3"/>
  <text x="35" y="15" text-anchor="middle" fill="#9ca3af" font-family="Arial" font-size="11" font-weight="bold">Status</text>
  <rect x="72" width="96" height="22" fill="${color}" rx="3"/>
  <text x="120" y="15" text-anchor="middle" fill="#fff" font-family="Arial" font-size="11" font-weight="bold">${label}</text>
</svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(svg);
});

// ─── Uptime badge (shows percentage) ──────────────────────

statusPageRouter.get('/:slug/uptime.svg', async (req, res) => {
  const status = await statusPageService.getPublicStatus(req.params.slug);
  if (!status) {
    res.status(404).send('Not found');
    return;
  }

  // Calculate average uptime across all monitors
  const monitors = status.monitors as Array<{ uptime24h: number }>;
  const avgUptime = monitors.length > 0
    ? monitors.reduce((sum, m) => sum + m.uptime24h, 0) / monitors.length
    : 100;

  const uptimeStr = avgUptime >= 99.9 ? '99.9%' :
                    avgUptime >= 99 ? `${avgUptime.toFixed(1)}%` :
                    `${avgUptime.toFixed(1)}%`;

  const color = avgUptime >= 99.9 ? '#22c55e' :
                avgUptime >= 99 ? '#eab308' : '#ef4444';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="130" height="22">
  <rect width="70" height="22" fill="#374151" rx="3"/>
  <text x="35" y="15" text-anchor="middle" fill="#9ca3af" font-family="Arial" font-size="11" font-weight="bold">Uptime</text>
  <rect x="72" width="56" height="22" fill="${color}" rx="3"/>
  <text x="100" y="15" text-anchor="middle" fill="#fff" font-family="Arial" font-size="11" font-weight="bold">${uptimeStr}</text>
</svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(svg);
});
