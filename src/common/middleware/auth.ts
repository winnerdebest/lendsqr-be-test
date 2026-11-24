import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { APP_CONSTANTS, env } from '../../config/env';
import { AppError } from '../errors/AppError';

export interface AuthUserPayload {
  userId: string;
  email: string;
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

export function requireAdminKey(req: Request, _res: Response, next: NextFunction): void {
  try {
    const providedKey = req.headers['x-admin-key'];
    if (typeof providedKey !== 'string' || !providedKey.trim()) {
      throw AppError.unauthorized('Missing x-admin-key header for admin endpoint');
    }

    const expectedBuf = Buffer.from(env.ADMIN_API_KEY, 'utf8');
    const providedBuf = Buffer.from(providedKey.trim(), 'utf8');

    if (
      expectedBuf.length !== providedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, providedBuf)
    ) {
      throw AppError.forbidden('Invalid admin API key', 'FORBIDDEN');
    }

    next();
  } catch (error) {
    next(error);
  }
}
