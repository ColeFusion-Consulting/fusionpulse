import { db } from '../db/client.js';
import { testPlans, type TestPlanPage, type TestPlanCase } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { recordAuditEvent } from './audit.service.js';
import { callAI } from './ai.service.js';

const PLAN_SYSTEM_PROMPT = `You are a QA test planning engineer. Given a website URL, generate a comprehensive test plan.
Return ONLY valid JSON with this exact structure:
{
  "pages": [{ "path": "/login", "title": "Login Page", "elements": ["email input", "password input", "submit button"] }],
  "suggestedCases": [{ "name": "User can log in with valid credentials", "description": "Verify successful login flow", "priority": "critical", "steps": ["Navigate to /login", "Enter email", "Enter password", "Click submit", "Verify dashboard loads"], "pagePath": "/login" }]
}
Cover authentication, core workflows, error states, edge cases, and responsive behavior.`;

export async function generateTestPlan(tenantId: string, siteUrl: string, name?: string) {
  recordAuditEvent({ tenantId, action: 'testplan.generate', details: { siteUrl } });

  // Call AI to generate the test plan
  let pages: TestPlanPage[] = [];
  let suggestedCases: TestPlanCase[] = [];

  try {
    const aiResponse = await callAI([
      { role: 'system', content: PLAN_SYSTEM_PROMPT },
      { role: 'user', content: `Generate a test plan for: ${siteUrl}\n\nThe site is a web application. Include authentication, core workflows, error handling, and edge cases.` },
    ]);

    const parsed = JSON.parse(aiResponse);
    pages = parsed.pages || [];
    suggestedCases = (parsed.suggestedCases || []).map((c: any, i: number) => ({
      ...c,
      id: `gen-${i + 1}`,
      priority: c.priority || 'medium',
    }));
  } catch (err) {
    // If AI fails, create a basic template
    pages = [{ path: '/', title: 'Home Page', elements: ['navigation', 'content'] }];
    suggestedCases = [
      { id: 'gen-1', name: 'Page loads successfully', description: 'Verify the site loads without errors', priority: 'critical' as const, steps: ['Navigate to site', 'Verify page loads', 'Check for console errors'], pagePath: '/' },
      { id: 'gen-2', name: 'Navigation works', description: 'Verify all navigation links work', priority: 'high' as const, steps: ['Click each nav link', 'Verify correct page loads'], pagePath: '/' },
    ];
  }

  const planId = randomUUID();
  await db.insert(testPlans).values({
    id: planId,
    tenantId,
    name: name || `Test Plan - ${new Date().toLocaleDateString()}`,
    description: `AI-generated test plan for ${siteUrl}`,
    siteUrl,
    status: 'draft',
    pages,
    suggestedCases,
  });

  recordAuditEvent({
    tenantId, action: 'testplan.created', resource: `plan:${planId}`,
    details: { siteUrl, pages: pages.length, cases: suggestedCases.length },
  });

  return { id: planId, pages, suggestedCases };
}

export async function getTestPlans(tenantId: string) {
  return db.select().from(testPlans).where(eq(testPlans.tenantId, tenantId)).orderBy(desc(testPlans.createdAt));
}

export async function getTestPlanById(tenantId: string, id: string) {
  const rows = await db.select().from(testPlans).where(eq(testPlans.id, id));
  return rows[0] || null;
}

export async function updateTestPlan(tenantId: string, id: string, data: {
  name?: string;
  description?: string;
  status?: string;
  userFeedback?: string;
  suggestedCases?: TestPlanCase[];
}) {
  await db.update(testPlans)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(testPlans.id, id));
  recordAuditEvent({ tenantId, action: 'testplan.update', resource: `plan:${id}`, details: { status: data.status } });
  return getTestPlanById(tenantId, id);
}

export async function approveTestPlan(tenantId: string, id: string, feedback?: string) {
  const plan = await getTestPlanById(tenantId, id);
  if (!plan) throw new Error('Test plan not found');

  await db.update(testPlans)
    .set({ status: 'review', userFeedback: feedback || null, updatedAt: new Date() })
    .where(eq(testPlans.id, id));

  recordAuditEvent({
    tenantId, action: 'testplan.review', resource: `plan:${id}`,
    details: { feedback: feedback?.slice(0, 200) },
  });

  // If feedback is provided, regenerate with the feedback incorporated
  if (feedback && plan.siteUrl) {
    try {
      const aiResponse = await callAI([
        { role: 'system', content: PLAN_SYSTEM_PROMPT },
        { role: 'user', content: `Refine the test plan for ${plan.siteUrl} based on this feedback: ${feedback}\n\nReturn the updated pages and suggestedCases in the same JSON format.` },
      ]);
      const parsed = JSON.parse(aiResponse);
      await db.update(testPlans)
        .set({ pages: parsed.pages || plan.pages, suggestedCases: parsed.suggestedCases || plan.suggestedCases, updatedAt: new Date() })
        .where(eq(testPlans.id, id));
    } catch {}
  }

  return getTestPlanById(tenantId, id);
}
