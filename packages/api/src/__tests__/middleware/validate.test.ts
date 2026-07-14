import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import type { Request, Response, NextFunction } from 'express';

describe('validate middleware', () => {
  const testSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    age: z.number().min(0),
  });

  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { body: {}, query: {} };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  it('should pass through valid body matching Zod schema', () => {
    req.body = { name: 'John', email: 'john@test.com', age: 30 };

    validate(testSchema)(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should reject invalid body with 400 and path errors', () => {
    req.body = { name: '', email: 'invalid', age: -1 };

    validate(testSchema)(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Validation failed',
      details: expect.arrayContaining([
        expect.objectContaining({ path: 'name', message: expect.any(String) }),
        expect.objectContaining({ path: 'email', message: expect.any(String) }),
        expect.objectContaining({ path: 'age', message: expect.any(String) }),
      ]),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should validate query params when source="query"', () => {
    const querySchema = z.object({ page: z.coerce.number().int().min(1) });
    req.query = { page: '2' };

    validate(querySchema, 'query')(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.query).toEqual({ page: 2 });
  });
});
