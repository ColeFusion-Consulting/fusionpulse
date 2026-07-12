import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { AuthUser } from '../types/index.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWT_ISSUER = process.env.JWT_ISSUER || '';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || '';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      issuer: JWT_ISSUER || undefined,
      audience: JWT_AUDIENCE || undefined,
    }) as jwt.JwtPayload;

    req.user = {
      id: decoded.sub || '',
      sub: decoded.sub || '',
      email: decoded.email || '',
      tenantId: decoded['custom:tenant_id'] || '',
      role: decoded['custom:role'] || 'member',
    };

    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

function getJwtSecret(): string {
  // In production, fetch from Cognito JWKS
  // For local dev, use a static secret
  return process.env.JWT_SECRET || 'local-dev-secret-do-not-use-in-production';
}
