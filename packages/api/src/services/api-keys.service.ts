import { db } from '../db/client.js';
import { apiKeys } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

export interface CreateApiKeyInput {
  name: string;
  expiresAt?: string;
}

export interface ApiKeyRecord {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  enabled: boolean;
  createdAt: Date;
}

function generateApiKey(): { raw: string; hashed: string; prefix: string } {
  const raw = `fp_${crypto.randomBytes(32).toString('hex')}`;
  const hashed = crypto.createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 12);
  return { raw, hashed, prefix };
}

export async function createKey(tenantId: string, input: CreateApiKeyInput) {
  const { raw, hashed, prefix } = generateApiKey();
  await db.insert(apiKeys).values({
    tenantId,
    name: input.name,
    key: hashed,
    keyPrefix: prefix,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
  });
  return { raw, prefix, name: input.name };
}

export async function listKeys(tenantId: string) {
  const keys = await db.select().from(apiKeys).where(eq(apiKeys.tenantId, tenantId));
  return keys.map((k) => ({
    id: k.id,
    name: k.name,
    keyPrefix: k.keyPrefix,
    lastUsedAt: k.lastUsedAt,
    expiresAt: k.expiresAt,
    enabled: k.enabled,
    createdAt: k.createdAt,
  }));
}

export async function deleteKey(tenantId: string, id: string) {
  const result = await db.delete(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.tenantId, tenantId)))
    .returning({ id: apiKeys.id });
  return result.length > 0;
}

export async function toggleKey(tenantId: string, id: string, enabled: boolean) {
  const result = await db.update(apiKeys)
    .set({ enabled })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.tenantId, tenantId)))
    .returning({ id: apiKeys.id });
  return result.length > 0;
}

export async function verifyApiKey(rawKey: string): Promise<{ tenantId: string } | null> {
  const hashed = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keys = await db.select().from(apiKeys).where(eq(apiKeys.key, hashed)).limit(1);
  const key = keys[0];
  if (!key || !key.enabled) return null;
  if (key.expiresAt && new Date() > key.expiresAt) return null;
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  return { tenantId: key.tenantId };
}
