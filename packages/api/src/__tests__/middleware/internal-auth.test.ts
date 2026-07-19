import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { internalAuth } from '../../middleware/internal-auth.js';
import type { Request, Response, NextFunction } from 'express';

describe('internal auth middleware', () => {
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
    vi.unstubAllEnvs();
  });

  it('should pass with valid x-internal-key header', () => {
    req.headers = { 'x-internal-key': 'test-internal-key' };

    internalAuth(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should reject with wrong key (401)', () => {
    req.headers = { 'x-internal-key': 'wrong-key' };

    internalAuth(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid internal API key',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should pass when INTERNAL_API_KEY not set (warning mode)', () => {
    vi.stubEnv('INTERNAL_API_KEY', '');

    internalAuth(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
