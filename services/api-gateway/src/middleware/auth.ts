import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticationError } from '@exchange/errors';
import type { JwtPayload } from '@exchange/types';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      userId?: string;
    }
  }
}

export function createAuthMiddleware(jwtSecret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid authorization header');
    }

    const token = authHeader.slice(7);

    try {
      const payload = jwt.verify(token, jwtSecret) as JwtPayload;
      req.user = payload;
      req.userId = payload.sub;
      next();
    } catch {
      throw new AuthenticationError('Invalid or expired token');
    }
  };
}

export function optionalAuth(jwtSecret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload = jwt.verify(token, jwtSecret) as JwtPayload;
        req.user = payload;
        req.userId = payload.sub;
      } catch {
        // Ignore invalid tokens for optional auth
      }
    }
    next();
  };
}
