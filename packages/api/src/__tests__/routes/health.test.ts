import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';

describe('GET /api/health', () => {
  it('should return 200 with status, service, version, uptime', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('service', 'fusionpulse-api');
    expect(res.body).toHaveProperty('version', '0.1.0');
    expect(res.body).toHaveProperty('uptime');
    expect(typeof res.body.uptime).toBe('number');
  });
});
