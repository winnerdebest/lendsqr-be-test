import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { APP_CONSTANTS, env } from '../../config/env';
import { AppError } from '../errors/AppError';
import { UserRole } from '../types/entities';

export interface AuthUserPayload {
  userId: string;
  email: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
      rawBody?: Buffer;
    }
  }
}

export function signAccessToken(payload: AuthUserPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: APP_CONSTANTS.JWT_EXPIRES_IN,
  });
}

export function verifyAccessToken(token: string): AuthUserPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUserPayload;
    if (!decoded || typeof decoded.userId !== 'string' || typeof decoded.email !== 'string') {
      throw AppError.unauthorized('Invalid authentication token payload');
    }
    return {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role === 'admin' ? 'admin' : 'user',
    };
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw AppError.unauthorized('Invalid or expired authentication token');
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw AppError.unauthorized('Missing or malformed Authorization Bearer header');
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw AppError.unauthorized('Authentication token is empty');
    }
    req.user = verifyAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    if (!req.user || req.user.role !== 'admin') {
      next(AppError.forbidden('Admin privileges required for this action', 'FORBIDDEN'));
      return;
    }
    next();
  });
}
