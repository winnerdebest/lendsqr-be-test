import { z } from 'zod';

export const registerSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Invalid email address format')
    .max(255),
  phone: z
    .string({ required_error: 'Phone number is required' })
    .trim()
    .regex(
      /^\+?[0-9]{10,15}$/,
      'Phone number must contain 10 to 15 digits (optionally prefixed with +)',
    ),
  firstName: z
    .string({ required_error: 'First name is required' })
    .trim()
    .min(2, 'First name must be at least 2 characters')
    .max(100),
  lastName: z
    .string({ required_error: 'Last name is required' })
    .trim()
    .min(2, 'Last name must be at least 2 characters')
    .max(100),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128),
});

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Invalid email address format'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required'),
});

export const setPinSchema = z.object({
  pin: z
    .string({ required_error: '4-digit transfer PIN is required' })
    .trim()
    .regex(/^\d{4}$/, 'Transfer PIN must be exactly 4 digits'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SetPinInput = z.infer<typeof setPinSchema>;
