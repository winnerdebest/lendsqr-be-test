import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SERVICE_NAME: z.string().default('lendsqr-wallet-service'),
  DATABASE_URL: z
    .string()
    .default('postgresql://postgres:postgres@localhost:5432/lendsqr_wallet'),
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET must be at least 16 characters')
    .default('lendsqr-super-secret-jwt-key-change-in-production-2026'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  ADMIN_API_KEY: z
    .string()
    .min(8, 'ADMIN_API_KEY must be at least 8 characters')
    .default('lendsqr-admin-secret-key-2026'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(14).default(10),
  ADJUTOR_BASE_URL: z.string().url().default('https://adjutor.lendsqr.com/v2'),
  ADJUTOR_API_KEY: z.string().optional().default(''),
  KARMA_FAIL_CLOSED: z
    .string()
    .optional()
    .default('false')
    .transform((val) => val === 'true' || val === '1'),
  PAYSTACK_BASE_URL: z.string().url().default('https://api.paystack.co'),
  PAYSTACK_SECRET_KEY: z.string().optional().default(''),
  PAYSTACK_CALLBACK_URL: z
    .string()
    .optional()
    .default('https://winner-orluvictor-lendsqr-be-test.onrender.com/v1/wallets/fund/verify'),
  MIN_TRANSACTION_AMOUNT_KOBO: z.coerce.number().int().positive().default(10000), // ₦100.00 default min, configurable
  MAX_TRANSACTION_AMOUNT_KOBO: z.coerce.number().int().positive().default(1000000000), // ₦10,000,000.00
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().int().positive().default(24),
});

export type EnvConfig = z.infer<typeof envSchema>;

export const env: EnvConfig = envSchema.parse(process.env);
