import { Request, Response, NextFunction } from 'express';

export function internalAuth(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['x-internal-key'];
  const expected = process.env.INTERNAL_API_KEY;

  if (!expected) {
    console.warn('INTERNAL_API_KEY not set — internal endpoints are UNPROTECTED');
    return next();
  }

  if (key !== expected) {
    res.status(401).json({ success: false, error: 'Invalid internal API key' });
    return;
  }

  next();
}
