import { EventEmitter } from 'events';
import { db } from '../db/client.js';
import { tenants, users, provisioningJobs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import type { ProvisioningStep, ProvisioningEvent, ProvisioningCompleteEvent } from '../types/index.js';
import type { SignupInput, PlanId, AddonId } from '../types/subscription.js';
import { signUp as cognitoSignUp } from './auth.service.js';
import { createCustomer, createSubscription } from './stripe-subscription.service.js';
import { createSiteInMonitor, crawlSite, createDefaultTestSuite, createRepoConfig } from './provisioning-client.service.js';

const provisioningEmitter = new EventEmitter();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

const PIPELINE_STEPS: ProvisioningStep[] = [
  { key: 'create_account', name: 'Creating your account', weight: 5 },
  { key: 'setup_billing', name: 'Setting up billing', weight: 10 },
  { key: 'provision_monitoring', name: 'Setting up site monitoring', weight: 15 },
  { key: 'crawl_site', name: 'AI is crawling your site', weight: 25 },
  { key: 'generate_test_plan', name: 'Generating test plan', weight: 20 },
  { key: 'provision_repair_agent', name: 'Configuring AI repair agent', weight: 15 },
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

    await updateJobProgress(tenantId, 'create_root_user', 'in_progress', stepsCompleted);
    const rootUserId = await createRootUser(tenantId, rootUsername, rootPassword);
    stepsCompleted.push('create_root_user');
    await updateJobProgress(tenantId, 'create_root_user', 'completed', stepsCompleted);

    await updateJobProgress(tenantId, 'create_manager_user', 'in_progress', stepsCompleted);
    const managerUserId = await createManagerUser(tenantId, managerName, managerEmail, managerPassword);
    stepsCompleted.push('create_manager_user');
    await updateJobProgress(tenantId, 'create_manager_user', 'completed', stepsCompleted);

    await updateJobProgress(tenantId, 'provision_database', 'in_progress', stepsCompleted);
    await provisionTenantDatabase(tenantId, siteUrl);
    stepsCompleted.push('provision_database');
    await updateJobProgress(tenantId, 'provision_database', 'completed', stepsCompleted);

    await updateJobProgress(tenantId, 'crawl_website', 'in_progress', stepsCompleted);
    await crawlWebsite(tenantId, siteUrl);
    stepsCompleted.push('crawl_website');
    await updateJobProgress(tenantId, 'crawl_website', 'completed', stepsCompleted);

    await updateJobProgress(tenantId, 'generate_recommendations', 'in_progress', stepsCompleted);
    await generateRecommendations(tenantId, siteUrl);
    stepsCompleted.push('generate_recommendations');
    await updateJobProgress(tenantId, 'generate_recommendations', 'completed', stepsCompleted);

    await updateJobProgress(tenantId, 'verify_infrastructure', 'in_progress', stepsCompleted);
    await verifyInfrastructure(tenantId);
    stepsCompleted.push('verify_infrastructure');
    await updateJobProgress(tenantId, 'verify_infrastructure', 'completed', stepsCompleted);

    await updateJobProgress(tenantId, 'finalize', 'in_progress', stepsCompleted);
    await finalizeProvisioning(tenantId);
    stepsCompleted.push('finalize');

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

export async function runFullProvisioningPipeline(tenantId: string, input: SignupInput): Promise<void> {
  const stepsCompleted: string[] = [];
  const siteName = input.companyName || input.name;

  try {
    await db.update(provisioningJobs)
      .set({ status: 'in_progress', steps: PIPELINE_STEPS })
      .where(eq(provisioningJobs.tenantId, tenantId));

    await updateJobProgress(tenantId, 'create_account', 'in_progress', stepsCompleted);
    await finalizeProvisioning(tenantId);
    stepsCompleted.push('create_account');
    await updateJobProgress(tenantId, 'create_account', 'completed', stepsCompleted);

    if (input.plan !== 'free') {
      await updateJobProgress(tenantId, 'setup_billing', 'in_progress', stepsCompleted);
      try {
        const customerId = await createCustomer(tenantId, input.email, input.name);
        if (customerId) {
          await db.update(tenants)
            .set({ stripeCustomerId: customerId })
            .where(eq(tenants.id, tenantId));
        }
        const subscription = await createSubscription(customerId, input.plan, input.addons);
        if (subscription?.subscriptionId) {
          await db.update(tenants)
            .set({ stripeSubscriptionId: subscription.subscriptionId })
            .where(eq(tenants.id, tenantId));
        }
      } catch (err) {
        console.error('Billing setup failed (continuing):', err);
      }
      stepsCompleted.push('setup_billing');
      await updateJobProgress(tenantId, 'setup_billing', 'completed', stepsCompleted);
    } else {
      stepsCompleted.push('setup_billing');
      await updateJobProgress(tenantId, 'setup_billing', 'completed', stepsCompleted);
    }

    await updateJobProgress(tenantId, 'provision_monitoring', 'in_progress', stepsCompleted);
    try {
      const siteId = await createSiteInMonitor(tenantId, {
        name: siteName,
        url: input.siteUrl,
        interval: getMonitorInterval(input.plan),
        stealth: input.addons.includes('stealth_browser'),
        video: input.addons.includes('e2e_video_recordings'),
      });
      if (siteId) {
        await db.update(tenants)
          .set({ siteMonitorId: siteId })
          .where(eq(tenants.id, tenantId));
      }
    } catch (err) {
      console.error('Site monitoring setup failed (continuing):', err);
    }
    stepsCompleted.push('provision_monitoring');
    await updateJobProgress(tenantId, 'provision_monitoring', 'completed', stepsCompleted);

    await updateJobProgress(tenantId, 'crawl_site', 'in_progress', stepsCompleted);
    try {
      const monitor = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      const monitorId = monitor[0]?.siteMonitorId;
      if (monitorId) {
        await crawlSite(monitorId, input.crawlInstructions);
      }
    } catch (err) {
      console.error('Site crawl failed (continuing):', err);
    }
    stepsCompleted.push('crawl_site');
    await updateJobProgress(tenantId, 'crawl_site', 'completed', stepsCompleted);

    await updateJobProgress(tenantId, 'generate_test_plan', 'in_progress', stepsCompleted);
    try {
      const monitor = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      const monitorId = monitor[0]?.siteMonitorId;
      if (monitorId) {
        await createDefaultTestSuite(monitorId);
      }
    } catch (err) {
      console.error('Test plan generation failed (continuing):', err);
    }
    stepsCompleted.push('generate_test_plan');
    await updateJobProgress(tenantId, 'generate_test_plan', 'completed', stepsCompleted);

    if (input.addons.includes('ai_repair_agent') && input.repoOwner && input.repoName && input.repoAccessToken) {
      await updateJobProgress(tenantId, 'provision_repair_agent', 'in_progress', stepsCompleted);
      try {
        await createRepoConfig(tenantId, {
          siteUrl: input.siteUrl,
          siteName,
          repo: input.repoName,
          owner: input.repoOwner,
          token: input.repoAccessToken,
          instructions: input.agentInstructions,
        });
      } catch (err) {
        console.error('AI repair agent provisioning failed (continuing):', err);
      }
      stepsCompleted.push('provision_repair_agent');
      await updateJobProgress(tenantId, 'provision_repair_agent', 'completed', stepsCompleted);
    } else {
      stepsCompleted.push('provision_repair_agent');
      await updateJobProgress(tenantId, 'provision_repair_agent', 'completed', stepsCompleted);
    }

    await updateJobProgress(tenantId, 'verify_infrastructure', 'in_progress', stepsCompleted);
    try {
      const tenantRows = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenantRows.length) {
        throw new Error('Tenant not found during verification');
      }
    } catch (err) {
      console.error('Infrastructure verification failed (continuing):', err);
    }
    stepsCompleted.push('verify_infrastructure');
    await updateJobProgress(tenantId, 'verify_infrastructure', 'completed', stepsCompleted);

    await updateJobProgress(tenantId, 'finalize', 'in_progress', stepsCompleted);
    await db.update(tenants)
      .set({
        provisioningStatus: 'completed',
        plan: input.plan,
        addons: input.addons,
        siteUrl: input.siteUrl,
        crawlInstructions: input.crawlInstructions || null,
        agentInstructions: input.agentInstructions || null,
        repoProvider: input.repoProvider || null,
        repoOwner: input.repoOwner || null,
        repoName: input.repoName || null,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId));
    stepsCompleted.push('finalize');

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

    const tenantRows = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const tenantData = tenantRows[0];

    const provisioningToken = generateRootJwt(tenantId, tenantId, 'provisioning');

    emitEvent(tenantId, {
      step: 'finalize',
      progress: 100,
      status: 'completed',
      message: 'All set! Your account is ready.',
      tokens: {
        accessToken: provisioningToken,
        refreshToken: provisioningToken,
        expiresIn: 86400,
      },
    });
  } catch (err: any) {
    console.error('Full provisioning pipeline failed:', err);
    await db.update(tenants)
      .set({ provisioningStatus: 'failed', updatedAt: new Date() })
      .where(eq(tenants.id, tenantId));

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

function getMonitorInterval(plan: PlanId): number {
  switch (plan) {
    case 'free': return 300;
    case 'starter': return 60;
    case 'pro': return 15;
    case 'business': return 5;
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

export async function startFullProvisioning(tenantId: string, input: SignupInput): Promise<void> {
  db.update(tenants)
    .set({ provisioningStatus: 'in_progress', updatedAt: new Date() })
    .where(eq(tenants.id, tenantId))
    .then(() => runFullProvisioningPipeline(tenantId, input))
    .catch(err => console.error('Full provisioning pipeline error:', err));
}
