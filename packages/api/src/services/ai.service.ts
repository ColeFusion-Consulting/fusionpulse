import { db } from '../db/client.js';
import { aiGenerations, type TestStep } from '../db/schema.js';

const LLAMA_URL = process.env.LLAMA_URL || 'http://192.168.50.205:8080/v1/chat/completions';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callAI(messages: ChatMessage[]): Promise<string> {
  if (OPENAI_KEY) {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({ model: AI_MODEL, messages, temperature: 0.3, max_tokens: 2048 }),
    });
    if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content || '';
  }

  const response = await fetch(LLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: AI_MODEL, messages, temperature: 0.3, max_tokens: 2048 }),
  });
  if (!response.ok) throw new Error(`Llama error: ${response.status}`);
  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

const SYSTEM_PROMPT = `You are a QA test engineer. You generate structured E2E test steps for Playwright-based browser testing.

You MUST respond with ONLY a valid JSON object. No markdown, no code fences.

JSON format:
{
  "steps": [
    { "action": "navigate", "url": "/", "description": "Go to homepage" },
    { "action": "waitForSelector", "target": "h1", "description": "Wait for heading" },
    { "action": "assertText", "target": "h1", "value": "Welcome", "description": "Verify heading" },
    { "action": "click", "target": "a[href='/login']", "description": "Click login" },
    { "action": "type", "target": "input[name='email']", "value": "user@example.com", "description": "Enter email" },
    { "action": "screenshot", "description": "Take screenshot" }
  ],
  "suggestedName": "Login Flow Test",
  "suggestedDescription": "Tests the login flow"
}

Available actions:
- navigate: Go to URL. Use "url".
- click: Click element. Use "target" (CSS selector).
- type: Type into input. Use "target" and "value".
- waitForSelector: Wait for element. Use "target".
- waitForNavigation: Wait for navigation.
- screenshot: Full-page screenshot.
- assertText: Assert element contains text. Use "target" and "value".
- assertElementExists: Assert element exists. Use "target".
- scrollToElement: Scroll to element. Use "target".

Prefer data-testid, id, or name attributes over tag names.`;

export async function generateTestSteps(tenantId: string, request: {
  prompt: string;
  context?: string;
  suiteId?: string;
}): Promise<{ steps: TestStep[]; suggestedName: string; suggestedDescription: string }> {
  const userMessage = `Generate E2E test steps:

Description: ${request.prompt}
${request.context ? `Context: ${request.context}` : ''}

Respond with ONLY the JSON object.`;

  const content = await callAI([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ]);

  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1];
  const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objectMatch) jsonStr = objectMatch[0];

  const parsed = JSON.parse(jsonStr);

  await db.insert(aiGenerations).values({
    tenantId,
    prompt: request.prompt,
    generatedSteps: parsed.steps || [],
    modelUsed: OPENAI_KEY ? 'openai:' + AI_MODEL : 'local:' + AI_MODEL,
    tokensUsed: 0,
    costCents: OPENAI_KEY ? Math.ceil((parsed.steps?.length || 0) * 0.1) : 0,
  });

  return {
    steps: parsed.steps || [],
    suggestedName: parsed.suggestedName || 'AI Generated Test',
    suggestedDescription: parsed.suggestedDescription || request.prompt,
  };
}

export async function analyzeFailure(tenantId: string, data: {
  errorMessage: string;
  screenshotUrl?: string;
  testSteps: TestStep[];
}): Promise<string> {
  return callAI([
    {
      role: 'system',
      content: 'You are a QA analyst. Analyze test failures and suggest fixes. Be concise and specific.',
    },
    {
      role: 'user',
      content: `Test failed with error: ${data.errorMessage}\n\nTest steps: ${JSON.stringify(data.testSteps, null, 2)}\n\nWhat went wrong and how to fix it?`,
    },
  ]);
}

export async function healSelector(tenantId: string, data: {
  failedSelector: string;
  domSnapshot: string;
  intent: string;
}): Promise<{ selector: string; confidence: number }> {
  const content = await callAI([
    {
      role: 'system',
      content: 'You are a Playwright selector expert. Given a broken selector and DOM snapshot, suggest a working replacement. Respond with JSON: { "selector": "...", "confidence": 0.0-1.0 }',
    },
    {
      role: 'user',
      content: `Broken selector: ${data.failedSelector}\nIntent: ${data.intent}\nDOM snapshot:\n${data.domSnapshot.substring(0, 3000)}`,
    },
  ]);

  const match = content.match(/\{[\s\S]*\}/);
  if (match) {
    return JSON.parse(match[0]);
  }
  return { selector: data.failedSelector, confidence: 0 };
}
