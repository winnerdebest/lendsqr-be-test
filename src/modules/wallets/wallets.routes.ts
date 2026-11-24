import { Request, Response, Router } from 'express';
import { AppError } from '../../common/errors/AppError';
import { requireAuth, verifyAccessToken } from '../../common/middleware/auth';
import { requireIdempotency } from '../../common/middleware/idempotency';
import { validateRequest } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { realtimeHub } from '../../common/utils/realtime';
import { sendSuccess } from '../../common/utils/response';
import { transfersService } from '../transfers/transfers.service';
import { fundWalletSchema } from './wallets.schemas';
import { walletsService } from './wallets.service';

export const walletsRouter = Router();
export const webhooksRouter = Router();

walletsRouter.get(
  '/resolve',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const identifier = String(req.query.identifier || '').trim();
    if (!identifier || identifier.length < 3) {
      throw AppError.badRequest('Please provide an account number or email to resolve');
    }
    const resolved = await transfersService.lookupRecipientPreview(
      req.user!.userId,
      identifier,
    );
    sendSuccess(res, resolved, 'Account resolved successfully', 200);
  }),
);

walletsRouter.get('/stream', (req: Request, res: Response, next) => {
  try {
    const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    const headerToken = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice('Bearer '.length).trim()
      : '';
    const token = queryToken || headerToken;
    if (!token) {
      throw AppError.unauthorized('Authentication token required for live stream');
    }

    const user = verifyAccessToken(token);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    const removeClient = realtimeHub.addClient(user.userId, res);
    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        // ignore
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      removeClient();
    });
  } catch (err) {
    next(err);
  }
});

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
