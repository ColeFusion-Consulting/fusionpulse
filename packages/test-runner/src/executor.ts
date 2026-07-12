import { chromium, type Browser, type Page } from 'playwright';
import type { TestRunRequest, TestRunResult, TestStep } from './types.js';
import { mkdirSync } from 'fs';

const SCREENSHOT_DIR = './data/screenshots';
mkdirSync(SCREENSHOT_DIR, { recursive: true });

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browserInstance;
}

async function executeStep(page: Page, step: TestStep, baseUrl: string): Promise<{ passed: boolean; error?: string }> {
  const timeout = step.timeout ?? 10000;

  try {
    switch (step.action) {
      case 'navigate': {
        const url = step.url?.startsWith('http') ? step.url : new URL(step.url || '/', baseUrl).toString();
        await page.goto(url, { waitUntil: 'networkidle', timeout });
        return { passed: true };
      }
      case 'click': {
        await page.waitForSelector(step.target!, { timeout });
        await page.click(step.target!);
        return { passed: true };
      }
      case 'type': {
        await page.waitForSelector(step.target!, { timeout });
        await page.fill(step.target!, step.value || '');
        return { passed: true };
      }
      case 'waitForSelector': {
        await page.waitForSelector(step.target!, { timeout });
        return { passed: true };
      }
      case 'waitForNavigation': {
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout });
        return { passed: true };
      }
      case 'screenshot': {
        const filename = `step-${Date.now()}.png`;
        await page.screenshot({ path: `${SCREENSHOT_DIR}/${filename}`, fullPage: true });
        return { passed: true };
      }
      case 'assertText': {
        await page.waitForSelector(step.target!, { timeout });
        const text = await page.textContent(step.target!);
        if (text?.includes(step.value || '')) return { passed: true };
        return { passed: false, error: `Expected "${step.value}" not found in "${text?.substring(0, 100)}"` };
      }
      case 'assertElementExists': {
        const el = await page.$(step.target!);
        if (el) return { passed: true };
        return { passed: false, error: `Element "${step.target}" not found` };
      }
      case 'scrollToElement': {
        await page.waitForSelector(step.target!, { timeout });
        await page.locator(step.target!).scrollIntoViewIfNeeded();
        return { passed: true };
      }
      default:
        return { passed: false, error: `Unknown action: ${(step as any).action}` };
    }
  } catch (err: any) {
    return { passed: false, error: err.message || 'Step failed' };
  }
}

export async function runTest(request: TestRunRequest): Promise<TestRunResult> {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const startTime = Date.now();
  let stepsPassed = 0;
  let lastError: string | undefined;
  const screenshotPaths: string[] = [];

  try {
    for (let i = 0; i < request.steps.length; i++) {
      const step = request.steps[i];
      const result = await executeStep(page, step, request.baseUrl);

      if (result.passed) {
        stepsPassed++;
      } else {
        lastError = `Step ${i + 1} (${step.action}): ${result.error}`;
        const filename = `fail-${request.runId}-${Date.now()}.png`;
        await page.screenshot({ path: `${SCREENSHOT_DIR}/${filename}`, fullPage: true });
        screenshotPaths.push(filename);
        break;
      }
    }
  } catch (err: any) {
    lastError = err.message || 'Test execution failed';
    const filename = `error-${request.runId}-${Date.now()}.png`;
    try {
      await page.screenshot({ path: `${SCREENSHOT_DIR}/${filename}`, fullPage: true });
      screenshotPaths.push(filename);
    } catch {}
  } finally {
    await context.close();
  }

  return {
    runId: request.runId,
    status: stepsPassed === request.steps.length ? 'passed' : 'error',
    durationMs: Date.now() - startTime,
    stepsPassed,
    stepsTotal: request.steps.length,
    errorMessage: lastError,
    screenshotPaths,
  };
}

export async function closeRunner() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
