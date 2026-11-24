import { Request, Response, Router } from 'express';
import { requireAuth } from '../../common/middleware/auth';
import { requireIdempotency } from '../../common/middleware/idempotency';
import { validateRequest } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendSuccess } from '../../common/utils/response';
import { createTransferSchema } from './transfers.schemas';
import { transfersService } from './transfers.service';

export const transfersRouter = Router();

transfersRouter.post(
  '/',
  requireAuth,
  requireIdempotency,
  validateRequest(createTransferSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const receipt = await transfersService.transferFunds(req.user!.userId, req.body);
    sendSuccess(res, receipt, 'Transfer completed successfully', 201);
  }),
);
