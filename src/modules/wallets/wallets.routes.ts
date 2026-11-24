import { Request, Response, Router } from 'express';
import { requireAuth } from '../../common/middleware/auth';
import { requireIdempotency } from '../../common/middleware/idempotency';
import { validateRequest } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendSuccess } from '../../common/utils/response';
import { fundWalletSchema } from './wallets.schemas';
import { walletsService } from './wallets.service';

export const walletsRouter = Router();
export const webhooksRouter = Router();

walletsRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const wallet = await walletsService.getMyWallet(req.user!.userId);
    sendSuccess(res, wallet, 'Wallet details retrieved successfully', 200);
  }),
);

walletsRouter.post(
  '/fund',
  requireAuth,
  requireIdempotency,
  validateRequest(fundWalletSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await walletsService.fundWallet(req.user!.userId, req.body);
    const statusCode = result.status === 'successful' ? 201 : 202;
    const message =
      result.status === 'successful'
        ? 'Wallet funded successfully'
        : 'Paystack funding transaction initialized';
    sendSuccess(res, result, message, statusCode);
  }),
);

walletsRouter.get(
  '/fund/verify/:reference',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await walletsService.verifyPaystackFunding(String(req.params.reference));
    sendSuccess(res, result, 'Funding payment verified and wallet credited', 200);
  }),
);

webhooksRouter.post(
  '/paystack',
  asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers['x-paystack-signature'] as string | undefined;
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
    const result = await walletsService.handlePaystackWebhook(rawBody, signature, req.body);
    sendSuccess(res, result, 'Webhook processed', 200);
  }),
);
