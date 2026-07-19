import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';
import { recordAuditEvent } from '../services/audit.service.js';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: duration,
      ip: req.ip,
      userAgent: req.headers['user-agent']?.slice(0, 120),
    });
  });

  next();
}

export function audit(tenantId: string | undefined, userId: string | undefined, action: string, resource?: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();
    const originalJson = res.json.bind(res);

    res.json = function (body: any) {
      const duration = Date.now() - start;
      const success = res.statusCode < 400;

      recordAuditEvent({
        tenantId: tenantId || req.user?.tenantId,
        userId: userId || req.user?.id || req.user?.sub,
        action,
        resource,
        details: { method: req.method, path: req.path },
        ip: req.ip,
        userAgent: req.headers['user-agent']?.slice(0, 200),
        durationMs: duration,
        success,
      });

      return originalJson(body);
    } as Response['json'];

    next();
  };
}
