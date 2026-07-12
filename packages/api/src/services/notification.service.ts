import { db } from '../db/client.js';
import {
  notificationChannels, alertRules, alertHistory, alertAcknowledgements,
  type NotificationChannelConfig, type AlertSeverity, type EscalationStep,
} from '../db/schema.js';
import { recordAuditEvent } from './audit.service.js';
import { eq, and, desc } from 'drizzle-orm';
import { createHmac } from 'crypto';

// ─── Channel CRUD ──────────────────────────────────────────

export async function getAllChannels(tenantId: string) {
  return db.select().from(notificationChannels)
    .where(eq(notificationChannels.tenantId, tenantId))
    .orderBy(desc(notificationChannels.createdAt));
}

export async function getChannelById(tenantId: string, id: string) {
  const rows = await db.select().from(notificationChannels)
    .where(and(eq(notificationChannels.id, id), eq(notificationChannels.tenantId, tenantId)));
  return rows[0] ?? null;
}

export async function createChannel(tenantId: string, data: {
  name: string;
  type: string;
  config: NotificationChannelConfig;
  onMonitorDown?: boolean;
  onMonitorRecovery?: boolean;
  onTestFailure?: boolean;
  onTestRecovery?: boolean;
}) {
  const rows = await db.insert(notificationChannels).values({
    tenantId,
    name: data.name,
    type: data.type,
    config: data.config,
    onMonitorDown: data.onMonitorDown ?? true,
    onMonitorRecovery: data.onMonitorRecovery ?? true,
    onTestFailure: data.onTestFailure ?? true,
    onTestRecovery: data.onTestRecovery ?? false,
  }).returning();
  return rows[0];
}

export async function updateChannel(tenantId: string, id: string, data: Partial<{
  name: string; enabled: boolean; config: NotificationChannelConfig;
  onMonitorDown: boolean; onMonitorRecovery: boolean;
  onTestFailure: boolean; onTestRecovery: boolean;
}>) {
  await db.update(notificationChannels)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(notificationChannels.id, id), eq(notificationChannels.tenantId, tenantId)));
  return getChannelById(tenantId, id);
}

export async function deleteChannel(tenantId: string, id: string) {
  const result = await db.delete(notificationChannels)
    .where(and(eq(notificationChannels.id, id), eq(notificationChannels.tenantId, tenantId)));
  return result.rowCount! > 0;
}

// ─── Alert Rules CRUD ──────────────────────────────────────

export async function getAllRules(tenantId: string) {
  return db.select().from(alertRules)
    .where(eq(alertRules.tenantId, tenantId))
    .orderBy(desc(alertRules.createdAt));
}

export async function createRule(tenantId: string, data: {
  name: string; sourceType: string; sourceId?: string;
  channelIds: string[]; escalationChain?: EscalationStep[];
  quietHoursStart?: string; quietHoursEnd?: string; quietHoursTimezone?: string;
}) {
  const rows = await db.insert(alertRules).values({
    tenantId,
    name: data.name,
    sourceType: data.sourceType,
    sourceId: data.sourceId ?? null,
    channelIds: data.channelIds,
    escalationChain: data.escalationChain ?? null,
    quietHoursStart: data.quietHoursStart ?? null,
    quietHoursEnd: data.quietHoursEnd ?? null,
    quietHoursTimezone: data.quietHoursTimezone ?? 'UTC',
  }).returning();
  return rows[0];
}

export async function deleteRule(tenantId: string, id: string) {
  const result = await db.delete(alertRules)
    .where(and(eq(alertRules.id, id), eq(alertRules.tenantId, tenantId)));
  return result.rowCount! > 0;
}

// ─── Alert History ─────────────────────────────────────────

export async function getAlertHistory(tenantId: string, opts?: { limit?: number; status?: string }) {
  const conditions = [eq(alertHistory.tenantId, tenantId)];
  if (opts?.status) conditions.push(eq(alertHistory.status, opts.status));
  return db.select().from(alertHistory)
    .where(and(...conditions))
    .orderBy(desc(alertHistory.createdAt))
    .limit(opts?.limit ?? 50);
}

export async function acknowledgeAlert(alertId: string, userId: string, note?: string) {
  await db.insert(alertAcknowledgements).values({ alertId, userId, note });
  await db.update(alertHistory)
    .set({ status: 'acknowledged', acknowledgedAt: new Date(), acknowledgedBy: userId })
    .where(eq(alertHistory.id, alertId));
}

// ─── Core Alert Dispatcher ─────────────────────────────────

interface AlertEvent {
  tenantId: string;
  sourceType: 'monitor' | 'test';
  sourceId: string;
  sourceName: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export async function sendAlert(event: AlertEvent) {
  // Find matching alert rules
  const rules = await db.select().from(alertRules)
    .where(
      and(
        eq(alertRules.tenantId, event.tenantId),
        eq(alertRules.enabled, true),
      )
    );

  const matchingRules = rules.filter((rule) => {
    if (rule.sourceType === 'all') return true;
    if (rule.sourceType !== event.sourceType) return false;
    if (rule.sourceId && rule.sourceId !== event.sourceId) return false;
    return true;
  });

  for (const rule of matchingRules) {
    // Check quiet hours for non-critical alerts
    if (event.severity !== 'critical' && rule.quietHoursStart && rule.quietHoursEnd) {
      if (isQuietHours(rule.quietHoursStart, rule.quietHoursEnd, rule.quietHoursTimezone || 'UTC')) {
        continue;
      }
    }

    // Send to direct channels first
    for (const channelId of rule.channelIds) {
      const channel = await db.select().from(notificationChannels)
        .where(eq(notificationChannels.id, channelId));
      if (!channel[0] || !channel[0].enabled) continue;

      if (!isEventRelevantToChannelOnChannel(event, channel[0])) continue;

      await dispatchToChannel(channel[0], event, rule.id);
    }

    // Send to escalation chain with delays
    if (rule.escalationChain && rule.escalationChain.length > 0) {
      let accumulatedDelay = 0;

      for (const step of rule.escalationChain) {
        accumulatedDelay += step.delayMinutes;

        const channel = await db.select().from(notificationChannels)
          .where(eq(notificationChannels.id, step.channelId));
        if (!channel[0] || !channel[0].enabled) continue;

        // Use setTimeout for dev; production should use SQS delayed messages
        const delayMs = accumulatedDelay * 60 * 1000;
        if (delayMs > 0 && delayMs < 86400000) { // max 24h
          setTimeout(() => {
            dispatchToChannel(channel[0], event, rule.id).catch((err) => {
              console.error(`Escalation dispatch failed for ${channel[0].name}:`, err);
            });
          }, delayMs);
        } else {
          // Immediate dispatch for delay 0 or very long delays
          await dispatchToChannel(channel[0], event, rule.id);
        }

        recordAuditEvent({
          tenantId: event.tenantId,
          action: 'notification.escalate',
          resource: `rule:${rule.id}`,
          details: { channel: channel[0].name, delayMinutes: accumulatedDelay, step },
          success: true,
        });
      }
    }
  }
}

function isEventRelevantToChannelOnChannel(
  event: AlertEvent,
  channel: typeof notificationChannels.$inferSelect,
): boolean {
  if (event.sourceType === 'monitor') {
    if (event.severity === 'recovery') return channel.onMonitorRecovery ?? true;
    return channel.onMonitorDown ?? true;
  }
  if (event.sourceType === 'test') {
    if (event.severity === 'recovery') return channel.onTestRecovery ?? true;
    return channel.onTestFailure ?? true;
  }
  return true;
}

function isQuietHours(start: string, end: string, tz: string): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz,
    });
    const [h, m] = formatter.format(now).split(':').map(Number);
    const currentMinutes = h * 60 + m;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;

    if (startMin > endMin) {
      // crosses midnight
      return currentMinutes >= startMin || currentMinutes < endMin;
    }
    return currentMinutes >= startMin && currentMinutes < endMin;
  } catch {
    return false;
  }
}

// ─── Channel Dispatchers ───────────────────────────────────

async function dispatchToChannel(
  channel: typeof notificationChannels.$inferSelect,
  event: AlertEvent,
  ruleId: string,
) {
  const severityEmoji: Record<string, string> = {
    critical: '🔴', warning: '🟡', info: '🔵', recovery: '🟢',
  };

  let status = 'sent';
  let errorMessage: string | null = null;

  try {
    const config = channel.config as NotificationChannelConfig;

    switch (channel.type) {
      case 'email':
        await sendEmail(config.email!.addresses, event, severityEmoji[event.severity]);
        break;
      case 'sms':
        await sendSms(config.sms!.phoneNumbers, event);
        break;
      case 'phone':
        await sendPhoneCall(config.phone!.phoneNumbers, config.phone!.message, event);
        break;
      case 'pagerduty':
        await sendPagerDuty(config.pagerduty!.routingKey, event);
        break;
      case 'slack':
        await sendSlack(config.slack!.webhookUrl, event, severityEmoji[event.severity]);
        break;
      case 'discord':
        await sendDiscord(config.discord!.webhookUrl, event, severityEmoji[event.severity]);
        break;
      case 'webhook':
        await sendWebhook(config.webhook!.url, config.webhook!.method, config.webhook!.headers, event);
        break;
    }
  } catch (err: any) {
    status = 'failed';
    errorMessage = err.message;
  }

  // Record in history
  await db.insert(alertHistory).values({
    tenantId: event.tenantId,
    ruleId,
    channelId: channel.id,
    channelType: channel.type,
    sourceType: event.sourceType,
    sourceId: event.sourceId,
    sourceName: event.sourceName,
    severity: event.severity,
    title: event.title,
    message: event.message,
    status,
    deliveredAt: status === 'sent' ? new Date() : null,
    errorMessage,
    metadata: event.metadata,
  });

  recordAuditEvent({
    tenantId: event.tenantId,
    action: 'notification.dispatch',
    resource: `channel:${channel.id}`,
    details: { type: channel.type, status, error: errorMessage, severity: event.severity },
    success: status === 'sent',
  });
}

// ─── Email ─────────────────────────────────────────────────

async function sendEmail(addresses: string[], event: AlertEvent, emoji: string) {
  // Production: use AWS SES or SendGrid
  // Dev: log to console (or use Mailpit in docker-compose)
  console.log(`[EMAIL] To: ${addresses.join(', ')}`);
  console.log(`  Subject: ${emoji} ${event.title}`);
  console.log(`  Body: ${event.message}`);

  // Placeholder for SES integration:
  // import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
  // const ses = new SESClient({});
  // await ses.send(new SendEmailCommand({
  //   Source: 'alerts@fusionpulse.colefusion.net',
  //   Destination: { ToAddresses: addresses },
  //   Message: {
  //     Subject: { Data: `${emoji} ${event.title}` },
  //     Body: { Text: { Data: event.message } },
  //   },
  // }));
}

// ─── SMS ───────────────────────────────────────────────────

async function sendSms(phoneNumbers: string[], event: AlertEvent) {
  // Production: use AWS SNS or Twilio
  console.log(`[SMS] To: ${phoneNumbers.join(', ')}`);
  console.log(`  Message: ${event.title}: ${event.message}`);

  // Placeholder for SNS integration:
  // import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
  // const sns = new SNSClient({});
  // for (const phone of phoneNumbers) {
  //   await sns.send(new PublishCommand({
  //     PhoneNumber: phone,
  //     Message: `${event.title}\n\n${event.message}`,
  //   }));
  // }
}

// ─── Phone Call ────────────────────────────────────────────

async function sendPhoneCall(phoneNumbers: string[], customMessage: string | undefined, event: AlertEvent) {
  // Production: use Twilio to make voice calls with TTS
  const message = customMessage || `Alert: ${event.title}. ${event.message}`;
  console.log(`[PHONE] Calling: ${phoneNumbers.join(', ')}`);
  console.log(`  Message: ${message}`);

  // Placeholder for Twilio integration:
  // import twilio from 'twilio';
  // const client = twilio(TWILIO_SID, TWILIO_AUTH);
  // for (const phone of phoneNumbers) {
  //   await client.calls.create({
  //     url: `https://twimlets.com/echo?Twiml=%3CResponse%3E%3CSay%3E${encodeURIComponent(message)}%3C/Say%3E%3C/Response%3E`,
  //     to: phone,
  //     from: TWILIO_PHONE_NUMBER,
  //   });
  // }
}

// ─── PagerDuty ─────────────────────────────────────────────

async function sendPagerDuty(routingKey: string, event: AlertEvent) {
  // PagerDuty Events API v2
  const severityMap: Record<string, 'error' | 'warning' | 'info'> = {
    critical: 'error', warning: 'warning', info: 'info', recovery: 'info',
  };

  const payload = event.severity === 'recovery'
    ? {
        routing_key: routingKey,
        event_action: 'resolve',
        payload: {
          summary: `${event.sourceName}: ${event.title} — RESOLVED`,
          source: 'FusionPulse',
          severity: 'info',
          component: event.sourceType,
          custom_details: { message: event.message },
        },
      }
    : {
        routing_key: routingKey,
        event_action: 'trigger',
        payload: {
          summary: `${event.sourceName}: ${event.title}`,
          source: 'FusionPulse',
          severity: severityMap[event.severity] || 'error',
          component: event.sourceType,
          custom_details: { message: event.message },
        },
      };

  const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`PagerDuty API error: ${response.status} ${await response.text()}`);
  }
}

// ─── Slack ─────────────────────────────────────────────────

async function sendSlack(webhookUrl: string, event: AlertEvent, emoji: string) {
  const colorMap: Record<string, string> = {
    critical: '#dc3545', warning: '#ffc107', info: '#17a2b8', recovery: '#28a745',
  };

  const payload = {
    attachments: [{
      color: colorMap[event.severity] || '#6c757d',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `${emoji} ${event.title}` },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Source:*\n${event.sourceName}` },
            { type: 'mrkdwn', text: `*Severity:*\n${event.severity.toUpperCase()}` },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: event.message },
        },
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: `FusionPulse by ColeFusion | <https://dashboard.fusionpulse.colefusion.net|View Dashboard>`,
          }],
        },
      ],
    }],
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook error: ${response.status}`);
  }
}

// ─── Discord ───────────────────────────────────────────────

async function sendDiscord(webhookUrl: string, event: AlertEvent, emoji: string) {
  const colorMap: Record<string, number> = {
    critical: 0xdc3545, warning: 0xffc107, info: 0x17a2b8, recovery: 0x28a745,
  };

  const payload = {
    embeds: [{
      title: `${emoji} ${event.title}`,
      description: event.message,
      color: colorMap[event.severity] || 0x6c757d,
      fields: [
        { name: 'Source', value: event.sourceName, inline: true },
        { name: 'Severity', value: event.severity.toUpperCase(), inline: true },
      ],
      footer: { text: 'FusionPulse by ColeFusion' },
      timestamp: new Date().toISOString(),
    }],
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook error: ${response.status}`);
  }
}

// ─── Generic Webhook ───────────────────────────────────────

async function sendWebhook(
  url: string,
  method: 'POST' | 'PUT' | undefined,
  headers: Record<string, string> | undefined,
  event: AlertEvent,
) {
  const payload = {
    event: 'alert',
    severity: event.severity,
    source: { type: event.sourceType, id: event.sourceId, name: event.sourceName },
    title: event.title,
    message: event.message,
    timestamp: new Date().toISOString(),
    metadata: event.metadata,
    brand: { product: 'FusionPulse', company: 'ColeFusion' },
  };

  const response = await fetch(url, {
    method: method || 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Webhook error: ${response.status}`);
  }
}

// ─── Convenience: Trigger alerts from monitor/test events ──

export async function onMonitorDown(tenantId: string, monitorId: string, name: string, statusCode?: number, responseTimeMs?: number) {
  await sendAlert({
    tenantId,
    sourceType: 'monitor',
    sourceId: monitorId,
    sourceName: name,
    severity: 'critical',
    title: `Monitor Down: ${name}`,
    message: `Monitor "${name}" is DOWN.${statusCode ? ` Last status: ${statusCode}.` : ''}${responseTimeMs ? ` Response time: ${responseTimeMs}ms.` : ''}`,
    metadata: { statusCode, responseTimeMs },
  });
}

export async function onMonitorRecovery(tenantId: string, monitorId: string, name: string) {
  await sendAlert({
    tenantId,
    sourceType: 'monitor',
    sourceId: monitorId,
    sourceName: name,
    severity: 'recovery',
    title: `Monitor Recovered: ${name}`,
    message: `Monitor "${name}" is back UP.`,
  });
}

export async function onTestFailure(tenantId: string, testId: string, name: string, errorMessage?: string) {
  await sendAlert({
    tenantId,
    sourceType: 'test',
    sourceId: testId,
    sourceName: name,
    severity: 'critical',
    title: `Test Failed: ${name}`,
    message: errorMessage ? `Test "${name}" failed: ${errorMessage}` : `Test "${name}" failed.`,
    metadata: { errorMessage },
  });
}

export async function onTestRecovery(tenantId: string, testId: string, name: string) {
  await sendAlert({
    tenantId,
    sourceType: 'test',
    sourceId: testId,
    sourceName: name,
    severity: 'recovery',
    title: `Test Recovered: ${name}`,
    message: `Test "${name}" is passing again.`,
  });
}
