import { Request, Response, Router } from 'express';
import { requireAuth } from '../../common/middleware/auth';
import { validateRequest } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendSuccess } from '../../common/utils/response';
import {
  ListTransactionsQuery,
  listTransactionsQuerySchema,
  transactionsService,
} from './transactions.service';

export const transactionsRouter = Router();

transactionsRouter.get(
  '/',
  requireAuth,
  validateRequest(listTransactionsQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await transactionsService.listUserTransactions(
      req.user!.userId,
      req.query as unknown as ListTransactionsQuery,
    );
    sendSuccess(res, result, 'Transactions retrieved successfully', 200);
  }),
);

transactionsRouter.get(
  '/:reference',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await transactionsService.getTransactionByReference(
      req.user!.userId,
      String(req.params.reference),
    );
    sendSuccess(res, result, 'Transaction details retrieved successfully', 200);
  }),
);
