export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'USER_BLOCKED'
  | 'RECIPIENT_BLOCKED'
  | 'USER_BLACKLISTED'
  | 'NOT_FOUND'
  | 'DUPLICATE_USER'
  | 'DUPLICATE_ENTRY'
  | 'REQUEST_IN_PROGRESS'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'INSUFFICIENT_FUNDS'
  | 'SELF_TRANSFER'
  | 'INVALID_AMOUNT'
  | 'PAYMENT_VERIFICATION_FAILED'
  | 'EXTERNAL_SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details: unknown[];
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: ErrorCode,
    details: unknown[] = [],
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, code: ErrorCode = 'VALIDATION_ERROR', details: unknown[] = []): AppError {
    return new AppError(message, 400, code, details);
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message: string, code: ErrorCode = 'FORBIDDEN', details: unknown[] = []): AppError {
    return new AppError(message, 403, code, details);
  }

  static notFound(message: string): AppError {
    return new AppError(message, 404, 'NOT_FOUND');
  }

  static conflict(message: string, code: ErrorCode = 'DUPLICATE_ENTRY', details: unknown[] = []): AppError {
    return new AppError(message, 409, code, details);
  }

  static unprocessable(message: string, code: ErrorCode, details: unknown[] = []): AppError {
    return new AppError(message, 422, code, details);
  }

  static serviceUnavailable(message: string): AppError {
    return new AppError(message, 503, 'EXTERNAL_SERVICE_UNAVAILABLE');
  }
}
