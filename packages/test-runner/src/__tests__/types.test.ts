import type { TestRunRequest, TestRunResult, TestStep } from '../types.js';

describe('types', () => {
  describe('TestStep', () => {
    it('should allow constructing a valid TestStep with all fields', () => {
      const step: TestStep = {
        action: 'click',
        target: '#btn',
        value: 'hello',
        url: 'http://example.com',
        timeout: 5000,
        description: 'Click the button',
      };

      expect(step.action).toBe('click');
      expect(step.target).toBe('#btn');
      expect(step.value).toBe('hello');
      expect(step.url).toBe('http://example.com');
      expect(step.timeout).toBe(5000);
      expect(step.description).toBe('Click the button');
    });

    it('should allow optional fields to be omitted', () => {
      const step: TestStep = { action: 'navigate' };

      expect(step.target).toBeUndefined();
      expect(step.value).toBeUndefined();
      expect(step.url).toBeUndefined();
      expect(step.timeout).toBeUndefined();
      expect(step.description).toBeUndefined();
    });
  });

  describe('TestRunRequest', () => {
    it('should allow constructing a valid TestRunRequest', () => {
      const request: TestRunRequest = {
        runId: 'test-1',
        tenantId: 'tenant-1',
        testType: 'e2e',
        testId: 'test-case-1',
        baseUrl: 'http://example.com',
        steps: [
          { action: 'navigate', url: '/home' },
          { action: 'click', target: '#btn' },
        ],
      };

      expect(request.runId).toBe('test-1');
      expect(request.tenantId).toBe('tenant-1');
      expect(request.testType).toBe('e2e');
      expect(request.testId).toBe('test-case-1');
      expect(request.baseUrl).toBe('http://example.com');
      expect(request.steps).toHaveLength(2);
    });
  });

  describe('TestRunResult', () => {
    it('should allow constructing a valid TestRunResult', () => {
      const result: TestRunResult = {
        runId: 'test-1',
        status: 'passed',
        durationMs: 1234,
        stepsPassed: 2,
        stepsTotal: 2,
        screenshotPaths: ['screenshot.png'],
      };

      expect(result.runId).toBe('test-1');
      expect(result.status).toBe('passed');
      expect(result.durationMs).toBe(1234);
      expect(result.stepsPassed).toBe(2);
      expect(result.stepsTotal).toBe(2);
      expect(result.screenshotPaths).toEqual(['screenshot.png']);
    });

    it('should allow error status and errorMessage', () => {
      const result: TestRunResult = {
        runId: 'test-2',
        status: 'error',
        durationMs: 500,
        stepsPassed: 0,
        stepsTotal: 1,
        errorMessage: 'Something went wrong',
        screenshotPaths: [],
      };

      expect(result.status).toBe('error');
      expect(result.errorMessage).toBe('Something went wrong');
    });

    it('should allow failed status', () => {
      const result: TestRunResult = {
        runId: 'test-3',
        status: 'failed',
        durationMs: 300,
        stepsPassed: 1,
        stepsTotal: 3,
        screenshotPaths: [],
      };

      expect(result.status).toBe('failed');
    });
  });
});
