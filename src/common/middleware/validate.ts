import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';

type RequestTarget = 'body' | 'query' | 'params';

export function validateRequest<T>(schema: ZodSchema<T>, target: RequestTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[target]);
      req[target] = parsed as never;
      next();
    } catch (error) {
      next(error);
    }
  };
}
