import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../../db/client.js';
import { getPublicStatus, getUptimeHistory } from '../../services/statuspage.service.js';

function createQueryResult(data: any) {
  const chain: any = { then: vi.fn((resolve: any) => resolve(data)) };
  for (const m of ['select', 'from', 'where', 'orderBy', 'limit', 'groupBy']) {
    chain[m] = vi.fn(() => chain);
  }
  return chain;
}

describe('statuspage service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getPublicStatus should return overall "all_operational" when all monitors are up', async () => {
    const tenant = {
      id: 'tenant-1',
      name: 'Test Tenant',
      slug: 'test',
      settings: {},
    };
    const monitors = [
      {
        id: 'mon-1',
        tenantId: 'tenant-1',
        name: 'Main Website',
        url: 'https://example.com',
        method: 'GET',
        expectedStatus: 200,
        intervalSeconds: 300,
        enabled: true,
        locations: ['us-east-1'],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const latestResult = [{ status: 'up', checkedAt: new Date() }];
    const uptimeResult = [{ status: 'up', count: '10' }];
    const avgResult = [{ avg: 150 }];

    db.select = vi
      .fn()
      .mockReturnValueOnce(createQueryResult([tenant]))
      .mockReturnValueOnce(createQueryResult(monitors))
      .mockReturnValueOnce(createQueryResult(latestResult))
      .mockReturnValueOnce(createQueryResult(uptimeResult))
      .mockReturnValueOnce(createQueryResult(avgResult));

    const result = await getPublicStatus('test');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('all_operational');
    expect(result!.monitors).toHaveLength(1);
    expect(result!.monitors[0].status).toBe('operational');
    expect(result!.monitors[0].uptime24h).toBe(100);
    expect(result!.monitors[0].currentStatus).toBe('up');
  });

  it('getUptimeHistory should return daily grouped percentages', async () => {
    const tenant = { id: 'tenant-1' };
    const uptimeRows = [
      { date: '2026-07-01', status: 'up', count: '20' },
      { date: '2026-07-01', status: 'down', count: '5' },
      { date: '2026-07-02', status: 'up', count: '25' },
    ];

    db.select = vi
      .fn()
      .mockReturnValueOnce(createQueryResult([tenant]))
      .mockReturnValueOnce(createQueryResult(uptimeRows));

    const result = await getUptimeHistory('test', 'mon-1', 30);

    expect(result).toHaveLength(2);
    expect(result![0]).toEqual({ date: '2026-07-01', uptime: 80 });
    expect(result![1]).toEqual({ date: '2026-07-02', uptime: 100 });
  });
});
