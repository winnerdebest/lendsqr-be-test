import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { sendError } from '../utils/response';

export function notFoundHandler(req: Request, res: Response): void {
  sendError(
    res,
    `Route ${req.method} ${req.originalUrl} not found`,
    404,
    'NOT_FOUND',
  );
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode, err.code, err.details);
    return;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    sendError(res, 'Request validation failed', 400, 'VALIDATION_ERROR', details);
    return;
  }

  // Handle malformed JSON body from express.json()
  if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
    sendError(res, 'Malformed JSON payload', 400, 'VALIDATION_ERROR');
    return;
  }

  // Log unexpected errors in non-test environments without leaking stack traces to clients
  if (process.env.NODE_ENV !== 'test') {
    console.error('[UnhandledError]', err);
  }

  sendError(
    res,
    'An unexpected internal server error occurred',
    500,
    'INTERNAL_ERROR',
  );
}
