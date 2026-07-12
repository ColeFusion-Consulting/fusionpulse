export interface TestStep {
  action: string;
  target?: string;
  value?: string;
  url?: string;
  timeout?: number;
  description?: string;
}

export interface TestRunRequest {
  runId: string;
  tenantId: string;
  testType: 'e2e' | 'api' | 'http';
  testId: string;
  baseUrl: string;
  steps: TestStep[];
}

export interface TestRunResult {
  runId: string;
  status: 'passed' | 'failed' | 'error';
  durationMs: number;
  stepsPassed: number;
  stepsTotal: number;
  errorMessage?: string;
  screenshotPaths: string[];
}
