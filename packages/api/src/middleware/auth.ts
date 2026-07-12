import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import type { AuthUser } from '../types/index.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';

// JWKS client for Cognito - fetches public keys to verify JWT signatures
const jwksUri = `https://cognito-idp.${AWS_REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`;
const client = jwksClient({
  jwksUri,
  cache: true,
  cacheMaxAge: 600000, // 10 minutes
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

function getSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err, key) => {
      if (err) {
        reject(err);
        return;
      }
      const signingKey = key?.getPublicKey();
      if (!signingKey) {
        reject(new Error('Unable to get signing key'));
        return;
      }
      resolve(signingKey);
    });
  });
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  // Decode token to get the kid (key ID) from the header
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || !decoded.header.kid) {
    res.status(401).json({ success: false, error: 'Invalid token format' });
    return;
  }

  // Get the signing key and verify the token
  getSigningKey(decoded.header.kid)
    .then((signingKey) => {
      const verified = jwt.verify(token, signingKey, {
        algorithms: ['RS256'],
        issuer: `https://cognito-idp.${AWS_REGION}.amazonaws.com/${USER_POOL_ID}`,
        // Cognito access tokens use 'client_id' instead of 'aud', so we skip audience check
        // and verify client_id manually below
      }) as jwt.JwtPayload;

      // Verify the token is for our client
      const tokenClientId = verified.client_id || verified.aud;
      if (tokenClientId !== CLIENT_ID) {
        throw new Error('Invalid client_id in token');
      }

      req.user = {
        id: verified.sub || '',
        sub: verified.sub || '',
        email: verified.email || '',
        tenantId: verified['custom:tenant_id'] || '',
        role: verified['custom:role'] || 'member',
      };

      next();
    })
    .catch((err) => {
      console.error('JWT verification error:', err);
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
    });
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
