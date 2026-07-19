import { vi } from 'vitest';

vi.mock('../db/client.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  setTenantContext: vi.fn(),
  closePool: vi.fn(),
}));

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_ISSUER = 'test-issuer';
process.env.JWT_AUDIENCE = 'test-audience';
process.env.INTERNAL_API_KEY = 'test-internal-key';
process.env.CORS_ORIGINS = 'http://localhost:3000';
