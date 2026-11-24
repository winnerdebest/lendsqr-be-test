import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .default('postgresql://postgres:postgres@localhost:5432/lendsqr_wallet'),
  JWT_SECRET: z
    .string()
    .min(16, 'JWT_SECRET must be at least 16 characters')
    .default('lendsqr-super-secret-jwt-key-change-in-production-2026'),
  ADJUTOR_API_KEY: z.string().optional().default(''),
  PAYSTACK_SECRET_KEY: z.string().optional().default(''),
});

export type EnvConfig = z.infer<typeof envSchema>;

export const env: EnvConfig = envSchema.parse(process.env);

export const APP_CONSTANTS = {
  SERVICE_NAME: 'lendsqr-wallet-service',
  JWT_EXPIRES_IN: '24h',
  BCRYPT_SALT_ROUNDS: 10,
  ADJUTOR_BASE_URL: 'https://adjutor.lendsqr.com/v2',
  PAYSTACK_BASE_URL: 'https://api.paystack.co',
  MIN_TRANSACTION_AMOUNT_KOBO: 10000, // ₦100.00
  MAX_TRANSACTION_AMOUNT_KOBO: 1000000000, // ₦10,000,000.00
  IDEMPOTENCY_TTL_HOURS: 24,
  DEFAULT_ADMIN_EMAIL: 'admin@lendsqr.com',
  DEFAULT_ADMIN_PASSWORD: 'AdminPassword123!',
  DEFAULT_ADMIN_PHONE: '+2348000000000',
} as const;
