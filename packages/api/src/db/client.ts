import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://fusionpulse:fusionpulse@localhost:5432/fusionpulse',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export const db = drizzle(pool, { schema });

export async function setTenantContext(tenantId: string) {
  await pool.query(`SET app.tenant_id = '${tenantId}'`);
}

export async function closePool() {
  await pool.end();
}
