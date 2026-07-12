import { db } from '../db/client.js';
import { testSuites, testCases, testRuns, type TestStep } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';

// ─── Suites ─────────────────────────────────────────────────
export async function getAllSuites(tenantId: string) {
  return db.select().from(testSuites)
    .where(eq(testSuites.tenantId, tenantId))
    .orderBy(desc(testSuites.createdAt));
}

export async function createSuite(tenantId: string, data: { name: string; description?: string }) {
  const rows = await db.insert(testSuites).values({
    tenantId,
    name: data.name,
    description: data.description ?? null,
  }).returning();
  return rows[0];
}

export async function deleteSuite(tenantId: string, id: string) {
  const result = await db.delete(testSuites)
    .where(and(eq(testSuites.id, id), eq(testSuites.tenantId, tenantId)));
  return result.rowCount! > 0;
}

// ─── Cases ──────────────────────────────────────────────────
export async function getAllCases(tenantId: string, suiteId?: string) {
  const conditions = [eq(testCases.tenantId, tenantId)];
  if (suiteId) conditions.push(eq(testCases.suiteId, suiteId));
  return db.select().from(testCases)
    .where(and(...conditions))
    .orderBy(desc(testCases.createdAt));
}

export async function getCaseById(tenantId: string, id: string) {
  const rows = await db.select().from(testCases)
    .where(and(eq(testCases.id, id), eq(testCases.tenantId, tenantId)));
  return rows[0] ?? null;
}

export async function createCase(tenantId: string, data: {
  suiteId: string; name: string; description?: string;
  steps: TestStep[]; enabled?: boolean; scheduleCron?: string;
}) {
  const rows = await db.insert(testCases).values({
    tenantId,
    suiteId: data.suiteId,
    name: data.name,
    description: data.description ?? null,
    steps: data.steps,
    enabled: data.enabled !== false,
    scheduleCron: data.scheduleCron ?? null,
  }).returning();
  return rows[0];
}

export async function updateCase(tenantId: string, id: string, data: Partial<{
  name: string; description: string; steps: TestStep[];
  enabled: boolean; scheduleCron: string;
}>) {
  const updateData: Record<string, any> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.steps !== undefined) updateData.steps = data.steps;
  if (data.enabled !== undefined) updateData.enabled = data.enabled;
  if (data.scheduleCron !== undefined) updateData.scheduleCron = data.scheduleCron;
  updateData.updatedAt = new Date();

  await db.update(testCases)
    .set(updateData)
    .where(and(eq(testCases.id, id), eq(testCases.tenantId, tenantId)));
  return getCaseById(tenantId, id);
}

export async function deleteCase(tenantId: string, id: string) {
  const result = await db.delete(testCases)
    .where(and(eq(testCases.id, id), eq(testCases.tenantId, tenantId)));
  return result.rowCount! > 0;
}

// ─── Runs ───────────────────────────────────────────────────
export async function getRunHistory(tenantId: string, caseId?: string, limit = 50) {
  const conditions = [eq(testRuns.tenantId, tenantId)];
  if (caseId) conditions.push(eq(testRuns.testId, caseId));
  return db.select().from(testRuns)
    .where(and(...conditions))
    .orderBy(desc(testRuns.createdAt))
    .limit(limit);
}

export async function recordRun(data: {
  tenantId: string; testType: string; testId: string;
  status: string; durationMs?: number;
  stepsPassed?: number; stepsTotal?: number;
  errorMessage?: string; screenshotUrls?: string[];
  aiAnalysis?: string;
}) {
  const rows = await db.insert(testRuns).values(data).returning();

  // Check for state change and fire alerts
  await emitTestAlerts(data.tenantId, data.testId, data.status);

  return rows[0];
}

// ─── Alert Emission ────────────────────────────────────────

async function emitTestAlerts(
  tenantId: string,
  testId: string,
  currentStatus: string,
) {
  // Get the two most recent runs for this test to detect state change
  const recent = await db.select().from(testRuns)
    .where(and(eq(testRuns.tenantId, tenantId), eq(testRuns.testId, testId)))
    .orderBy(desc(testRuns.createdAt))
    .limit(2);

  if (recent.length < 2) return;

  const previousStatus = recent[1].status;

  // Test went from passing → failing
  if (previousStatus === 'passed' && currentStatus !== 'passed') {
    // Look up the test name for the alert
    const testRows = await db.select({ name: testCases.name }).from(testCases)
      .where(eq(testCases.id, testId));
    const testName = testRows[0]?.name ?? testId;

    const { onTestFailure } = await import('./notification.service.js');
    await onTestFailure(tenantId, testId, testName, recent[0].errorMessage ?? undefined);
  }

  // Test went from failing → passing (recovery)
  if (previousStatus !== 'passed' && currentStatus === 'passed') {
    const testRows = await db.select({ name: testCases.name }).from(testCases)
      .where(eq(testCases.id, testId));
    const testName = testRows[0]?.name ?? testId;

    const { onTestRecovery } = await import('./notification.service.js');
    await onTestRecovery(tenantId, testId, testName);
  }
}
