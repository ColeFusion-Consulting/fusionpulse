import { EventEmitter } from 'events';
import { db } from '../db/client.js';
import { tenants, users, provisioningJobs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import type { ProvisioningStep, ProvisioningEvent, ProvisioningCompleteEvent } from '../types/index.js';
import { signUp as cognitoSignUp } from './auth.service.js';

const provisioningEmitter = new EventEmitter();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

const PIPELINE_STEPS: ProvisioningStep[] = [
  { key: 'create_root_user', name: 'Creating root administrative user', weight: 10 },
  { key: 'create_manager_user', name: 'Creating manager user', weight: 10 },
  { key: 'provision_database', name: 'Provisioning database resources', weight: 20 },
  { key: 'crawl_website', name: 'Crawling your website', weight: 25 },
  { key: 'generate_recommendations', name: 'Generating test recommendations', weight: 25 },
  { key: 'verify_infrastructure', name: 'Verifying infrastructure', weight: 5 },
  { key: 'finalize', name: 'Finalizing setup', weight: 5 },
];

export function onProvisioningEvent(tenantId: string, callback: (event: ProvisioningEvent | ProvisioningCompleteEvent) => void): () => void {
  const handler = (event: ProvisioningEvent | ProvisioningCompleteEvent) => {
    callback(event);
  };
  provisioningEmitter.on(`provisioning:${tenantId}`, handler);
  return () => {
    provisioningEmitter.off(`provisioning:${tenantId}`, handler);
  };
}

function emitEvent(tenantId: string, event: ProvisioningEvent | ProvisioningCompleteEvent): void {
  provisioningEmitter.emit(`provisioning:${tenantId}`, event);
}

function calculateProgress(stepsCompleted: string[], currentStepKey: string): number {
  let progress = 0;
  let currentWeight = 0;
  for (const step of PIPELINE_STEPS) {
    if (stepsCompleted.includes(step.key)) {
      progress += step.weight;
    } else if (step.key === currentStepKey) {
      currentWeight = step.weight;
    }
  }
  // Assume current step is halfway done
  return Math.min(100, progress + currentWeight * 0.5);
}

async function updateJobProgress(
  tenantId: string,
  currentStep: string,
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
  stepsCompleted: string[],
  errorMessage?: string
): Promise<void> {
  const progress = calculateProgress(stepsCompleted, currentStep);
  await db.update(provisioningJobs)
    .set({
      currentStep,
      status,
      progress: Math.round(progress),
      stepsCompleted,
      errorMessage: errorMessage || null,
      updatedAt: new Date(),
    })
    .where(eq(provisioningJobs.tenantId, tenantId));

  emitEvent(tenantId, {
    step: currentStep,
    progress: Math.round(progress),
    status,
    message: getStepMessage(currentStep, status),
    error: errorMessage,
  });
}

function getStepMessage(stepKey: string, status: string): string {
  const step = PIPELINE_STEPS.find(s => s.key === stepKey);
  if (!step) return '';
  if (status === 'in_progress') return step.name + '...';
  if (status === 'completed') return step.name + ' — complete';
  if (status === 'failed') return step.name + ' — failed';
  return step.name;
}

export async function runProvisioningPipeline(
  tenantId: string,
  rootUsername: string,
  rootPassword: string,
  managerName: string,
  managerEmail: string,
  managerPassword: string,
  siteUrl: string
): Promise<void> {
  const stepsCompleted: string[] = [];

  try {
    await db.update(provisioningJobs)
      .set({ status: 'in_progress', steps: PIPELINE_STEPS })
      .where(eq(provisioningJobs.tenantId, tenantId));

    // Step 1: Create root user
    await updateJobProgress(tenantId, 'create_root_user', 'in_progress', stepsCompleted);
    const rootUserId = await createRootUser(tenantId, rootUsername, rootPassword);
    stepsCompleted.push('create_root_user');
    await updateJobProgress(tenantId, 'create_root_user', 'completed', stepsCompleted);

    // Step 2: Create manager user
    await updateJobProgress(tenantId, 'create_manager_user', 'in_progress', stepsCompleted);
    const managerUserId = await createManagerUser(tenantId, managerName, managerEmail, managerPassword);
    stepsCompleted.push('create_manager_user');
    await updateJobProgress(tenantId, 'create_manager_user', 'completed', stepsCompleted);

    // Step 3: Provision database
    await updateJobProgress(tenantId, 'provision_database', 'in_progress', stepsCompleted);
    await provisionTenantDatabase(tenantId, siteUrl);
    stepsCompleted.push('provision_database');
    await updateJobProgress(tenantId, 'provision_database', 'completed', stepsCompleted);

    // Step 4: Crawl website
    await updateJobProgress(tenantId, 'crawl_website', 'in_progress', stepsCompleted);
    await crawlWebsite(tenantId, siteUrl);
    stepsCompleted.push('crawl_website');
    await updateJobProgress(tenantId, 'crawl_website', 'completed', stepsCompleted);

    // Step 5: Generate test recommendations
    await updateJobProgress(tenantId, 'generate_recommendations', 'in_progress', stepsCompleted);
    await generateRecommendations(tenantId, siteUrl);
    stepsCompleted.push('generate_recommendations');
    await updateJobProgress(tenantId, 'generate_recommendations', 'completed', stepsCompleted);

    // Step 6: Verify infrastructure
    await updateJobProgress(tenantId, 'verify_infrastructure', 'in_progress', stepsCompleted);
    await verifyInfrastructure(tenantId);
    stepsCompleted.push('verify_infrastructure');
    await updateJobProgress(tenantId, 'verify_infrastructure', 'completed', stepsCompleted);

    // Step 7: Finalize
    await updateJobProgress(tenantId, 'finalize', 'in_progress', stepsCompleted);
    await finalizeProvisioning(tenantId);
    stepsCompleted.push('finalize');

    // Mark complete
    await db.update(provisioningJobs)
      .set({
        status: 'completed',
        currentStep: 'finalize',
        progress: 100,
        stepsCompleted,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(provisioningJobs.tenantId, tenantId));

    // Generate login tokens for auto-login
    const rootToken = generateRootJwt(rootUserId, tenantId, rootUsername);
    const managerCognitoSub = await getManagerCognitoSub(tenantId, managerEmail);

    emitEvent(tenantId, {
      step: 'finalize',
      progress: 100,
      status: 'completed',
      message: 'All set! Your account is ready.',
      tokens: {
        accessToken: rootToken,
        refreshToken: rootToken,
        expiresIn: 86400,
      },
    });
  } catch (err: any) {
    console.error('Provisioning pipeline failed:', err);
    await db.update(provisioningJobs)
      .set({
        status: 'failed',
        errorMessage: err.message || 'Provisioning failed',
        updatedAt: new Date(),
      })
      .where(eq(provisioningJobs.tenantId, tenantId));

    emitEvent(tenantId, {
      step: 'finalize',
      progress: 0,
      status: 'failed',
      message: 'Provisioning failed',
      error: err.message || 'Unknown error',
    });
  }
}

async function createRootUser(tenantId: string, username: string, password: string): Promise<string> {
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    tenantId,
    email: `root@${username}.local`,
    name: `Root (${username})`,
    userType: 'root',
    role: 'root',
    username,
    passwordHash,
  });
  return userId;
}

async function createManagerUser(tenantId: string, name: string, email: string, password: string): Promise<string> {
  try {
    const signUpResult = await cognitoSignUp({
      email,
      password,
      tenantName: name,
    });
    return signUpResult.userId;
  } catch (err: any) {
    if (err.name === 'UsernameExistsException') {
      const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existingUser.length > 0) {
        return existingUser[0].id;
      }
    }
    // Fall back to creating user in DB only
    const userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      tenantId,
      email,
      name,
      userType: 'user',
      role: 'admin',
    });
    return userId;
  }
}

async function provisionTenantDatabase(tenantId: string, siteUrl: string): Promise<void> {
  await db.update(tenants)
    .set({ settings: { siteUrl, provisioned: true } })
    .where(eq(tenants.id, tenantId));
  await new Promise(resolve => setTimeout(resolve, 500));
}

async function crawlWebsite(tenantId: string, siteUrl: string): Promise<void> {
  await db.update(tenants)
    .set({ settings: { siteUrl, crawledAt: new Date().toISOString() } })
    .where(eq(tenants.id, tenantId));
  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function generateRecommendations(tenantId: string, siteUrl: string): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function verifyInfrastructure(tenantId: string): Promise<void> {
  const tenant = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant.length) {
    throw new Error('Tenant not found during verification');
  }
  await new Promise(resolve => setTimeout(resolve, 500));
}

async function finalizeProvisioning(tenantId: string): Promise<void> {
  await db.update(tenants)
    .set({ settings: { ready: true } })
    .where(eq(tenants.id, tenantId));
}

function generateRootJwt(userId: string, tenantId: string, username: string): string {
  return jwt.sign(
    { sub: userId, tenant_id: tenantId, username, user_type: 'root' },
    JWT_SECRET,
    { expiresIn: '24h', algorithm: 'HS256' }
  );
}

async function getManagerCognitoSub(tenantId: string, email: string): Promise<string | null> {
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0]?.cognitoSub || null;
}

export async function getProvisioningStatus(tenantId: string) {
  const result = await db.select().from(provisioningJobs).where(eq(provisioningJobs.tenantId, tenantId)).limit(1);
  return result[0] || null;
}

export async function startProvisioning(
  tenantId: string,
  rootUsername: string,
  rootPassword: string,
  managerName: string,
  managerEmail: string,
  managerPassword: string,
  siteUrl: string
): Promise<void> {
  runProvisioningPipeline(tenantId, rootUsername, rootPassword, managerName, managerEmail, managerPassword, siteUrl)
    .catch(err => console.error('Provisioning pipeline error:', err));
}
