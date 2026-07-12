import {
  pgTable, uuid, text, timestamp, boolean, integer, jsonb, index, uniqueIndex,
} from 'drizzle-orm/pg-core';

// ─── Tenants ────────────────────────────────────────────────
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan').notNull().default('free'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  settings: jsonb('settings').default({}).$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ─── Users ──────────────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  name: text('name'),
  role: text('role').notNull().default('member'),
  cognitoSub: text('cognito_sub').unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  uniqueIndex('users_tenant_email_idx').on(t.tenantId, t.email),
]);

// ─── Monitors (HTTP status checks) ──────────────────────────
export const monitors = pgTable('monitors', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  method: text('method').default('GET'),
  expectedStatus: integer('expected_status').default(200),
  expectedBody: text('expected_body'),
  intervalSeconds: integer('interval_seconds').default(300),
  enabled: boolean('enabled').default(true),
  locations: text('locations').array().default(['us-east-1']),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('monitors_tenant_idx').on(t.tenantId),
]);

// ─── Test Suites ────────────────────────────────────────────
export const testSuites = pgTable('test_suites', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('test_suites_tenant_idx').on(t.tenantId),
]);

// ─── Test Cases (E2E browser tests) ─────────────────────────
export const testCases = pgTable('test_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  suiteId: uuid('suite_id').notNull().references(() => testSuites.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  steps: jsonb('steps').notNull().$type<TestStep[]>(),
  enabled: boolean('enabled').default(true),
  scheduleCron: text('schedule_cron'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('test_cases_tenant_idx').on(t.tenantId),
  index('test_cases_suite_idx').on(t.suiteId),
]);

// ─── API Tests ──────────────────────────────────────────────
export const apiTests = pgTable('api_tests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  method: text('method').notNull().default('GET'),
  headers: jsonb('headers').default({}).$type<Record<string, string>>(),
  body: jsonb('body'),
  assertions: jsonb('assertions').notNull().$type<ApiAssertion[]>(),
  enabled: boolean('enabled').default(true),
  intervalSeconds: integer('interval_seconds').default(300),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('api_tests_tenant_idx').on(t.tenantId),
]);

// ─── Test Runs ──────────────────────────────────────────────
export const testRuns = pgTable('test_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  testType: text('test_type').notNull(),
  testId: uuid('test_id').notNull(),
  status: text('status').notNull(),
  durationMs: integer('duration_ms'),
  stepsPassed: integer('steps_passed'),
  stepsTotal: integer('steps_total'),
  errorMessage: text('error_message'),
  screenshotUrls: text('screenshot_urls').array(),
  aiAnalysis: text('ai_analysis'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('test_runs_tenant_idx').on(t.tenantId),
  index('test_runs_test_idx').on(t.testId),
  index('test_runs_created_idx').on(t.createdAt),
]);

// ─── Monitor Results ────────────────────────────────────────
export const monitorResults = pgTable('monitor_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  monitorId: uuid('monitor_id').notNull().references(() => monitors.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  statusCode: integer('status_code'),
  responseTimeMs: integer('response_time_ms'),
  bodySnippet: text('body_snippet'),
  errorMessage: text('error_message'),
  checkedAt: timestamp('checked_at').defaultNow().notNull(),
}, (t) => [
  index('monitor_results_tenant_idx').on(t.tenantId),
  index('monitor_results_monitor_idx').on(t.monitorId),
  index('monitor_results_checked_idx').on(t.checkedAt),
]);

// ─── AI Generations ─────────────────────────────────────────
export const aiGenerations = pgTable('ai_generations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  prompt: text('prompt').notNull(),
  generatedSteps: jsonb('generated_steps').$type<TestStep[]>(),
  modelUsed: text('model_used'),
  tokensUsed: integer('tokens_used'),
  costCents: integer('cost_cents'),
  accepted: boolean('accepted'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Usage Records ──────────────────────────────────────────
export const usageRecords = pgTable('usage_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  metric: text('metric').notNull(),
  quantity: integer('quantity').notNull().default(1),
  recordedAt: timestamp('recorded_at').defaultNow().notNull(),
}, (t) => [
  index('usage_records_tenant_idx').on(t.tenantId),
  index('usage_records_metric_idx').on(t.metric),
]);

// ─── Notification Channels (destinations for alerts) ────────
export const notificationChannels = pgTable('notification_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'email' | 'sms' | 'phone' | 'pagerduty' | 'slack' | 'webhook' | 'discord'
  enabled: boolean('enabled').default(true),
  config: jsonb('config').notNull().$type<NotificationChannelConfig>(),
  // Which events trigger this channel
  onMonitorDown: boolean('on_monitor_down').default(true),
  onMonitorRecovery: boolean('on_monitor_recovery').default(true),
  onTestFailure: boolean('on_test_failure').default(true),
  onTestRecovery: boolean('on_test_recovery').default(false),
  // Escalation: minutes to wait before escalating to next channel
  escalationDelayMinutes: integer('escalation_delay_minutes').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('notification_channels_tenant_idx').on(t.tenantId),
]);

// ─── Alert Rules (link monitors/tests to notification channels)
export const alertRules = pgTable('alert_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  enabled: boolean('enabled').default(true),
  // What triggers this rule
  sourceType: text('source_type').notNull(), // 'monitor' | 'test_suite' | 'test_case' | 'all'
  sourceId: uuid('source_id'), // null = apply to all sources of sourceType
  // Which channels to notify
  channelIds: text('channel_ids').array().notNull().default([]),
  // Escalation chain: ordered list of channel IDs with increasing urgency
  escalationChain: jsonb('escalation_chain').$type<EscalationStep[]>(),
  // Quiet hours (no non-critical alerts)
  quietHoursStart: text('quiet_hours_start'), // "22:00"
  quietHoursEnd: text('quiet_hours_end'),     // "08:00"
  quietHoursTimezone: text('quiet_hours_timezone').default('UTC'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => [
  index('alert_rules_tenant_idx').on(t.tenantId),
]);

// ─── Alert History ──────────────────────────────────────────
export const alertHistory = pgTable('alert_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  ruleId: uuid('rule_id').references(() => alertRules.id),
  channelId: uuid('channel_id').references(() => notificationChannels.id),
  channelType: text('channel_type').notNull(),
  // What triggered this alert
  sourceType: text('source_type').notNull(), // 'monitor' | 'test'
  sourceId: uuid('source_id').notNull(),
  sourceName: text('source_name'),
  // Alert details
  severity: text('severity').notNull(), // 'critical' | 'warning' | 'info' | 'recovery'
  title: text('title').notNull(),
  message: text('message').notNull(),
  // Delivery status
  status: text('status').notNull().default('pending'), // 'pending' | 'sent' | 'delivered' | 'failed' | 'acknowledged'
  deliveredAt: timestamp('delivered_at'),
  acknowledgedAt: timestamp('acknowledged_at'),
  acknowledgedBy: text('acknowledged_by'),
  errorMessage: text('error_message'),
  // Metadata
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => [
  index('alert_history_tenant_idx').on(t.tenantId),
  index('alert_history_status_idx').on(t.status),
  index('alert_history_created_idx').on(t.createdAt),
]);

// ─── Alert Acknowledgements ─────────────────────────────────
export const alertAcknowledgements = pgTable('alert_acknowledgements', {
  id: uuid('id').primaryKey().defaultRandom(),
  alertId: uuid('alert_id').notNull().references(() => alertHistory.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id),
  note: text('note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ─── Types ──────────────────────────────────────────────────
export interface TestStep {
  action: 'navigate' | 'click' | 'type' | 'waitForSelector' | 'screenshot' | 'assertText' | 'assertElementExists' | 'waitForNavigation' | 'scrollToElement';
  target?: string;
  value?: string;
  url?: string;
  timeout?: number;
  description?: string;
}

export interface ApiAssertion {
  type: 'status' | 'body' | 'header' | 'jsonPath';
  target?: string;
  operator?: 'equals' | 'contains' | 'matches' | 'gt' | 'lt';
  value?: string | number;
}

export type NotificationChannelType = 'email' | 'sms' | 'phone' | 'pagerduty' | 'slack' | 'webhook' | 'discord';

export interface NotificationChannelConfig {
  // Email
  email?: { addresses: string[] };
  // SMS
  sms?: { phoneNumbers: string[] };
  // Phone call
  phone?: { phoneNumbers: string[]; message?: string };
  // PagerDuty
  pagerduty?: { routingKey: string; integrationKey: string };
  // Slack
  slack?: { webhookUrl: string; channelId?: string; channelName?: string };
  // Discord
  discord?: { webhookUrl: string };
  // Generic webhook
  webhook?: { url: string; method?: 'POST' | 'PUT'; headers?: Record<string, string> };
}

export interface EscalationStep {
  channelId: string;
  delayMinutes: number; // minutes after previous step before escalating
}

export type AlertSeverity = 'critical' | 'warning' | 'info' | 'recovery';
export type AlertSource = 'monitor' | 'test';
export type AlertStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'acknowledged';
