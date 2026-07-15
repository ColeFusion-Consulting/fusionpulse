import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../../db/client.js';
import { generateTestSteps, analyzeFailure, healSelector } from '../../services/ai.service.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockFetchRawResponse(text: string) {
  return { ok: true, json: vi.fn().mockResolvedValue({ choices: [{ message: { content: text } }] }) };
}

function mockInsert() {
  const valuesFn = vi.fn().mockResolvedValue(undefined);
  const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
  (db.insert as ReturnType<typeof vi.fn>).mockImplementation(insertFn);
}

describe('generateTestSteps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert();
  });

  it('should parse JSON response and return steps', async () => {
    mockFetch.mockResolvedValue(mockFetchRawResponse(JSON.stringify({
      steps: [
        { action: 'navigate', url: '/', description: 'Go home' },
        { action: 'assertText', target: 'h1', value: 'Welcome', description: 'Check heading' },
      ],
      suggestedName: 'Homepage Test',
      suggestedDescription: 'Verify homepage loads',
    })));

    const result = await generateTestSteps('tenant-1', { prompt: 'Test the homepage' });

    expect(result.steps).toHaveLength(2);
    expect(result.suggestedName).toBe('Homepage Test');
    expect(result.suggestedDescription).toBe('Verify homepage loads');
  });

  it('should handle JSON wrapped in markdown code fences', async () => {
    mockFetch.mockResolvedValue(mockFetchRawResponse(
      '```json\n{"steps":[{"action":"navigate","url":"/"}],"suggestedName":"X","suggestedDescription":"Y"}\n```',
    ));

    const result = await generateTestSteps('tenant-1', { prompt: 'Test' });

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].action).toBe('navigate');
  });

  it('should handle AI returning text before and after JSON', async () => {
    mockFetch.mockResolvedValue(mockFetchRawResponse(
      'Here are the steps:\n{"steps":[{"action":"click","target":".btn"}],"suggestedName":"X","suggestedDescription":"Y"}\nDone.',
    ));

    const result = await generateTestSteps('tenant-1', { prompt: 'Test click' });

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].action).toBe('click');
  });

  it('should use fallback names when AI returns incomplete JSON', async () => {
    mockFetch.mockResolvedValue(mockFetchRawResponse(JSON.stringify({ steps: [] })));

    const result = await generateTestSteps('tenant-1', { prompt: 'My custom test' });

    expect(result.suggestedName).toBe('AI Generated Test');
    expect(result.suggestedDescription).toBe('My custom test');
  });

  it('should persist generation to database', async () => {
    mockFetch.mockResolvedValue(mockFetchRawResponse(JSON.stringify({
      steps: [{ action: 'screenshot', description: 'Final state' }],
      suggestedName: 'N',
      suggestedDescription: 'D',
    })));

    await generateTestSteps('tenant-1', { prompt: 'Test' });

    expect(db.insert).toHaveBeenCalled();
  });

  it('should pass context when provided', async () => {
    mockFetch.mockResolvedValue(mockFetchRawResponse(JSON.stringify({
      steps: [],
      suggestedName: 'X',
      suggestedDescription: 'Y',
    })));

    await generateTestSteps('tenant-1', { prompt: 'Test', context: 'App is a todo list', suiteId: 'suite-1' });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.messages[1].content).toContain('todo list');
  });

  it('should fall back to Llama when no OpenAI key configured', async () => {
    const origKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    mockFetch.mockResolvedValue(mockFetchRawResponse(JSON.stringify({
      steps: [],
      suggestedName: 'X',
      suggestedDescription: 'Y',
    })));

    await generateTestSteps('tenant-1', { prompt: 'Test' });

    expect(mockFetch.mock.calls[0][0]).toContain('192.168.50.205');

    if (origKey) process.env.OPENAI_API_KEY = origKey;
  });
});

describe('analyzeFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call AI with failure context', async () => {
    mockFetch.mockResolvedValue(mockFetchRawResponse('The selector .btn is missing'));

    const result = await analyzeFailure('tenant-1', {
      errorMessage: 'Element not found',
      testSteps: [{ action: 'click', target: '.btn', description: 'Click button' }],
    });

    expect(result).toBe('The selector .btn is missing');
  });

  it('should handle missing screenshotUrl gracefully', async () => {
    mockFetch.mockResolvedValue(mockFetchRawResponse('No screenshot available'));

    const result = await analyzeFailure('tenant-1', {
      errorMessage: 'Timeout',
      testSteps: [],
    });

    expect(result).toBe('No screenshot available');
  });

  it('should throw on AI error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429, json: vi.fn() });

    await expect(analyzeFailure('tenant-1', {
      errorMessage: 'X',
      testSteps: [],
    })).rejects.toThrow();
  });
});

describe('healSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return parsed selector and confidence', async () => {
    mockFetch.mockResolvedValue(mockFetchRawResponse(
      '{"selector":"#new-button","confidence":0.92}',
    ));

    const result = await healSelector('tenant-1', {
      failedSelector: '.old-btn',
      domSnapshot: '<button id="new-button">Submit</button>',
      intent: 'Click submit button',
    });

    expect(result.selector).toBe('#new-button');
    expect(result.confidence).toBe(0.92);
  });

  it('should fall back to original selector when JSON not found', async () => {
    mockFetch.mockResolvedValue(mockFetchRawResponse('I cannot find a replacement selector'));

    const result = await healSelector('tenant-1', {
      failedSelector: '.old-btn',
      domSnapshot: '<div></div>',
      intent: 'Click',
    });

    expect(result.selector).toBe('.old-btn');
    expect(result.confidence).toBe(0);
  });

  it('should truncate DOM snapshot to 3000 chars', async () => {
    const longDom = '<div>' + 'a'.repeat(5000) + '</div>';
    mockFetch.mockResolvedValue(mockFetchRawResponse('{"selector":"#x","confidence":0.5}'));

    await healSelector('tenant-1', {
      failedSelector: '.old-btn',
      domSnapshot: longDom,
      intent: 'Click',
    });

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.messages[1].content.length).toBeLessThan(4000);
    expect(callBody.messages[1].content).toContain('<div>');
  });
});
