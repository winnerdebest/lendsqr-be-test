import { z } from 'zod';
import { env } from '../../config/env';

export const fundWalletSchema = z.object({
  amountKobo: z
    .number({
      required_error: 'amountKobo is required',
      invalid_type_error: 'amountKobo must be an integer in kobo (e.g. 500000 for ₦5,000.00)',
    })
    .int('amountKobo must be a whole integer in minor units (kobo)')
    .min(
      env.MIN_TRANSACTION_AMOUNT_KOBO,
      `Minimum funding amount is ${env.MIN_TRANSACTION_AMOUNT_KOBO} kobo`,
    )
    .max(
      env.MAX_TRANSACTION_AMOUNT_KOBO,
      `Maximum funding amount is ${env.MAX_TRANSACTION_AMOUNT_KOBO} kobo`,
    ),
  narration: z.string().trim().max(250).optional().default('Wallet funding deposit'),
  mode: z.enum(['auto', 'paystack', 'simulated']).optional().default('auto'),
  callbackUrl: z.string().url().optional(),
});

export type FundWalletInput = z.infer<typeof fundWalletSchema>;
