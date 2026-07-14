import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticate } from '../../middleware/auth.js';
import type { Request, Response, NextFunction } from 'express';

vi.mock('jwks-rsa', () => ({
  default: vi.fn(() => ({
    getSigningKey: vi.fn((_kid: string, cb: (err: Error | null, key: any) => void) => {
      cb(null, { getPublicKey: () => 'mock-public-key' });
    }),
  })),
}));

describe('auth middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should extract user from valid HS256 JWT in Authorization header', () => {
    const token = jwt.sign(
      {
        sub: 'user-123',
        email: 'test@example.com',
        tenant_id: 'tenant-1',
        username: 'testuser',
      },
      'test-jwt-secret',
      { algorithm: 'HS256' },
    );
    req.headers = { authorization: `Bearer ${token}` };

    authenticate(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.id).toBe('user-123');
    expect(req.user!.sub).toBe('user-123');
    expect(req.user!.email).toBe('test@example.com');
    expect(req.user!.tenantId).toBe('tenant-1');
    expect(req.user!.role).toBe('root');
    expect(req.user!.userType).toBe('root');
    expect(req.user!.username).toBe('testuser');
  });

  it('should reject missing Authorization header (401)', () => {
    authenticate(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Missing or invalid authorization header',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject invalid token (401)', () => {
    req.headers = { authorization: 'Bearer invalid-token' };

    authenticate(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid token format',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle Cognito JWK verification (mock jwks-rsa)', async () => {
    const header = { alg: 'RS256', kid: 'mock-kid', typ: 'JWT' };
    const payload = {
      sub: 'cognito-user',
      email: 'cognito@example.com',
      client_id: 'test-client-id',
      'custom:tenant_id': 'tenant-1',
      'custom:role': 'admin',
      'custom:user_type': 'user',
    };
    const b64h = Buffer.from(JSON.stringify(header)).toString('base64url');
    const b64p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token = `${b64h}.${b64p}.fakesignature`;

    req.headers = { authorization: `Bearer ${token}` };

    authenticate(req as Request, res as Response, next);

    await vi.waitFor(() => {
      expect(res.status).toHaveBeenCalledWith(401);
    });
    expect(next).not.toHaveBeenCalled();
  });
});
