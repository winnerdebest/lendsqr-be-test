import { Request, Response, Router } from 'express';
import { requireAdmin } from '../../common/middleware/auth';
import { validateRequest } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { sendSuccess } from '../../common/utils/response';
import { addBlacklistSchema, userStatusActionSchema } from './admin.schemas';
import { adminService } from './admin.service';

export const adminRouter = Router();

adminRouter.use(requireAdmin);

adminRouter.get(
  '/users',
  asyncHandler(async (_req: Request, res: Response) => {
    const users = await adminService.listUsers();
    sendSuccess(res, { users, count: users.length }, 'Users retrieved successfully', 200);
  }),
);

adminRouter.patch(
  '/users/:id/block',
  validateRequest(userStatusActionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await adminService.blockUser(String(req.params.id), req.body);
    sendSuccess(res, result, 'User account blocked successfully', 200);
  }),
);

adminRouter.patch(
  '/users/:id/unblock',
  validateRequest(userStatusActionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await adminService.unblockUser(String(req.params.id), req.body);
    sendSuccess(res, result, 'User account unblocked successfully', 200);
  }),
);

adminRouter.get(
  '/blacklist',
  asyncHandler(async (_req: Request, res: Response) => {
    const items = await adminService.listBlacklist();
    sendSuccess(res, { items, count: items.length }, 'Blacklist entries retrieved', 200);
  }),
);

adminRouter.post(
  '/blacklist',
  validateRequest(addBlacklistSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const record = await adminService.addBlacklistIdentity(req.body);
    sendSuccess(res, record, 'Identity added to local blacklist', 201);
  }),
);

adminRouter.delete(
  '/blacklist/:identity',
  asyncHandler(async (req: Request, res: Response) => {
    await adminService.removeBlacklistIdentity(String(req.params.identity));
    sendSuccess(
      res,
      { identity: String(req.params.identity), removed: true },
      'Identity removed from local blacklist',
      200,
    );
  }),
);
