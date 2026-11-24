import { Response } from 'express';
import { ErrorCode } from '../errors/AppError';

export interface SuccessEnvelope<T> {
  status: 'success';
  message: string;
  data: T;
}

export interface ErrorEnvelope {
  status: 'error';
  message: string;
  error: {
    code: ErrorCode;
    details: unknown[];
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Request successful',
  statusCode = 200,
): Response<SuccessEnvelope<T>> {
  return res.status(statusCode).json({
    status: 'success',
    message,
    data,
  });
}

export function sendError(
  res: Response,
  message: string,
  statusCode: number,
  code: ErrorCode,
  details: unknown[] = [],
): Response<ErrorEnvelope> {
  return res.status(statusCode).json({
    status: 'error',
    message,
    error: {
      code,
      details,
    },
  });
}
