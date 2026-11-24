import { z } from 'zod';

export const userStatusActionSchema = z.object({
  reason: z
    .string({ required_error: 'Reason is required for audit trail' })
    .trim()
    .min(3, 'Reason must be at least 3 characters')
    .max(500),
  actor: z.string().trim().min(2).max(100).optional().default('admin'),
});

export const addBlacklistSchema = z.object({
  identity: z
    .string({ required_error: 'Identity (email, phone, or BVN) is required' })
    .trim()
    .min(3, 'Identity must be at least 3 characters')
    .max(255),
  reason: z
    .string({ required_error: 'Reason for blacklisting is required' })
    .trim()
    .min(3, 'Reason must be at least 3 characters')
    .max(500),
});

export type UserStatusActionInput = z.infer<typeof userStatusActionSchema>;
export type AddBlacklistInput = z.infer<typeof addBlacklistSchema>;
