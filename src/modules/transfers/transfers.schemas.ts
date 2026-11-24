import { z } from 'zod';
import { APP_CONSTANTS } from '../../config/env';

export const createTransferSchema = z.object({
  recipientIdentifier: z
    .string({
      required_error:
        'recipientIdentifier (recipient email, account number, or wallet ID) is required',
    })
    .trim()
    .min(3, 'recipientIdentifier must be at least 3 characters')
    .max(255),
  amountKobo: z
    .number({
      required_error: 'amountKobo is required',
      invalid_type_error: 'amountKobo must be an integer in kobo (e.g. 250000 for ₦2,500.00)',
    })
    .int('amountKobo must be a whole integer in minor units (kobo)')
    .min(
      APP_CONSTANTS.MIN_TRANSACTION_AMOUNT_KOBO,
      `Minimum transfer amount is ${APP_CONSTANTS.MIN_TRANSACTION_AMOUNT_KOBO} kobo`,
    )
    .max(
      APP_CONSTANTS.MAX_TRANSACTION_AMOUNT_KOBO,
      `Maximum transfer amount is ${APP_CONSTANTS.MAX_TRANSACTION_AMOUNT_KOBO} kobo`,
    ),
  narration: z.string().trim().max(250).optional().default('Wallet to wallet transfer'),
});

export type CreateTransferInput = z.infer<typeof createTransferSchema>;
