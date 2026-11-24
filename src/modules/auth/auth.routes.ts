import { Request, Response, Router } from 'express';
import { requireAuth } from '../../common/middleware/auth';
import { validateRequest } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendSuccess } from '../../common/utils/response';
import { loginSchema, registerSchema } from './auth.schemas';
import { authService } from './auth.service';

export const authRouter = Router();
export const usersRouter = Router();

authRouter.post(
  '/register',
  validateRequest(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.register(req.body);
    sendSuccess(res, result, 'User account and wallet created successfully', 201);
  }),
);

authRouter.post(
  '/login',
  validateRequest(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login(req.body);
    sendSuccess(res, result, 'Login successful', 200);
  }),
);

usersRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const profile = await authService.getProfile(req.user!.userId);
    sendSuccess(res, profile, 'User profile retrieved successfully', 200);
  }),
);
