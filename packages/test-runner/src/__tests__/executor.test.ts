import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockBrowserClose = vi.hoisted(() => vi.fn());
const mockNewContext = vi.hoisted(() => vi.fn());
const mockIsConnected = vi.hoisted(() => vi.fn().mockReturnValue(true));
const mockPageGoto = vi.hoisted(() => vi.fn());
const mockPageClick = vi.hoisted(() => vi.fn());
const mockPageFill = vi.hoisted(() => vi.fn());
const mockPageScreenshot = vi.hoisted(() => vi.fn().mockResolvedValue(Buffer.from('')));
const mockPageWaitForSelector = vi.hoisted(() => vi.fn());

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: mockNewContext,
      close: mockBrowserClose,
      isConnected: mockIsConnected,
    }),
  },
}));

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
}));

import { runTest, closeRunner } from '../executor.js';

describe('executor', () => {
  let mockPage: Record<string, any>;
  let mockContext: Record<string, any>;

  beforeEach(() => {
    mockPage = {
      goto: mockPageGoto,
      click: mockPageClick,
      fill: mockPageFill,
      screenshot: mockPageScreenshot,
      waitForSelector: mockPageWaitForSelector,
      $: vi.fn(),
      textContent: vi.fn(),
      locator: vi.fn().mockReturnValue({ scrollIntoViewIfNeeded: vi.fn() }),
    };

    mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn(),
    };

    mockNewContext.mockResolvedValue(mockContext);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('runTest', () => {
    it('should execute navigate step', async () => {
      mockPageGoto.mockResolvedValue(undefined);

      const result = await runTest({
        runId: 'r1',
        tenantId: 't1',
        testType: 'e2e',
        testId: 't1',
        baseUrl: 'http://example.com',
        steps: [{ action: 'navigate', url: '/home' }],
      });

      expect(mockPageGoto).toHaveBeenCalledWith(
        'http://example.com/home',
        expect.objectContaining({ waitUntil: 'networkidle' }),
      );
      expect(result).toMatchObject({ stepsPassed: 1, stepsTotal: 1, status: 'passed' });
    });

    it('should execute click step', async () => {
      mockPageWaitForSelector.mockResolvedValue(undefined);
      mockPageClick.mockResolvedValue(undefined);

      const result = await runTest({
        runId: 'r1',
        tenantId: 't1',
        testType: 'e2e',
        testId: 't1',
        baseUrl: 'http://example.com',
        steps: [{ action: 'click', target: '#btn' }],
      });

      expect(mockPageWaitForSelector).toHaveBeenCalledWith('#btn', expect.any(Object));
      expect(mockPageClick).toHaveBeenCalledWith('#btn');
      expect(result.status).toBe('passed');
    });

    it('should execute type step', async () => {
      mockPageWaitForSelector.mockResolvedValue(undefined);
      mockPageFill.mockResolvedValue(undefined);

      const result = await runTest({
        runId: 'r1',
        tenantId: 't1',
        testType: 'e2e',
        testId: 't1',
        baseUrl: 'http://example.com',
        steps: [{ action: 'type', target: '#input', value: 'hello' }],
      });

      expect(mockPageWaitForSelector).toHaveBeenCalledWith('#input', expect.any(Object));
      expect(mockPageFill).toHaveBeenCalledWith('#input', 'hello');
      expect(result.status).toBe('passed');
    });

    it('should execute screenshot step', async () => {
      mockPageScreenshot.mockResolvedValue(Buffer.from('fake-image'));

      const result = await runTest({
        runId: 'r1',
        tenantId: 't1',
        testType: 'e2e',
        testId: 't1',
        baseUrl: 'http://example.com',
        steps: [{ action: 'screenshot' }],
      });

      expect(mockPageScreenshot).toHaveBeenCalledWith(
        expect.objectContaining({ fullPage: true }),
      );
      expect(result.status).toBe('passed');
    });

    it('should handle multiple steps where one fails', async () => {
      mockPageGoto.mockResolvedValue(undefined);
      mockPageWaitForSelector.mockRejectedValue(new Error('Element not found'));

      const result = await runTest({
        runId: 'r1',
        tenantId: 't1',
        testType: 'e2e',
        testId: 't1',
        baseUrl: 'http://example.com',
        steps: [
          { action: 'navigate', url: '/' },
          { action: 'click', target: '#missing' },
        ],
      });

      expect(result).toMatchObject({
        stepsPassed: 1,
        stepsTotal: 2,
        status: 'error',
        errorMessage: expect.stringContaining('Step 2'),
      });
    });

    it('should return correct result structure', async () => {
      mockPageGoto.mockResolvedValue(undefined);

      const result = await runTest({
        runId: 'r-id',
        tenantId: 't-id',
        testType: 'e2e',
        testId: 'test-1',
        baseUrl: 'http://example.com',
        steps: [
          { action: 'navigate', url: '/' },
          { action: 'navigate', url: '/about' },
        ],
      });

      expect(result).toHaveProperty('runId', 'r-id');
      expect(result).toHaveProperty('status', 'passed');
      expect(result).toHaveProperty('durationMs');
      expect(typeof result.durationMs).toBe('number');
      expect(result).toHaveProperty('stepsPassed', 2);
      expect(result).toHaveProperty('stepsTotal', 2);
      expect(result).toHaveProperty('errorMessage');
      expect(result).toHaveProperty('screenshotPaths');
      expect(Array.isArray(result.screenshotPaths)).toBe(true);
    });
  });

  describe('closeRunner', () => {
    it('should call browser.close()', async () => {
      mockPageGoto.mockResolvedValue(undefined);

      await runTest({
        runId: 'init',
        tenantId: 't',
        testType: 'e2e',
        testId: 't',
        baseUrl: 'http://example.com',
        steps: [{ action: 'navigate', url: '/' }],
      });

      await closeRunner();
      expect(mockBrowserClose).toHaveBeenCalled();
    });
  });
});
