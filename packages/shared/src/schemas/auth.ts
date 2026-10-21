import { z } from 'zod';
import { LIMITS } from '../constants.js';

export const emailSchema = z
  .string()
  .trim()
  .min(3, 'Email is required')
  .max(254, 'Email is too long')
  .email('Enter a valid email address')
  .transform((value) => value.toLowerCase());

/**
 * Deliberately a length + composition rule rather than a long blocklist: easy to
 * explain in the UI, and the same rule runs on both sides.
 */
export const passwordSchema = z
  .string()
  .min(LIMITS.passwordMin, `Password must be at least ${LIMITS.passwordMin} characters`)
  .max(LIMITS.passwordMax, 'Password is too long')
  .refine((value) => /[a-z]/.test(value), 'Include at least one lowercase letter')
  .refine((value) => /[A-Z]/.test(value), 'Include at least one uppercase letter')
  .refine((value) => /[0-9]/.test(value), 'Include at least one number');

export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(LIMITS.nameMin, 'Enter your full name')
      .max(LIMITS.nameMax, 'Name is too long'),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmNewPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'Passwords do not match',
    path: ['confirmNewPassword'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'Choose a password you have not used here before',
    path: ['newPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  hasProfile: boolean;
}
