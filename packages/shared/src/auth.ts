import { z } from 'zod';
import { UserSummarySchema, UsernameSchema } from './common';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USERNAME_MAX_LENGTH } from './constants';

export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, `Máximo ${PASSWORD_MAX_LENGTH} caracteres`);

// POST /auth/register
export const RegisterRequestSchema = z.strictObject({
  username: UsernameSchema,
  password: PasswordSchema,
  /** Cloudflare Turnstile token obtained by the client widget. */
  captchaToken: z.string().min(1, 'Completa el CAPTCHA').max(2048),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

/** Register also opens a session: the response sets the session cookie. */
export const RegisterResponseSchema = z.object({ user: UserSummarySchema });
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

// POST /auth/login
/**
 * Login only checks shape, not the username rules: a malformed username must
 * produce the same generic 401 as a wrong password, not a 400 that reveals the rules.
 */
export const LoginRequestSchema = z.strictObject({
  username: z
    .string()
    .min(1)
    .max(USERNAME_MAX_LENGTH * 4),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({ user: UserSummarySchema });
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// GET /auth/me
export const MeResponseSchema = z.object({ user: UserSummarySchema.nullable() });
export type MeResponse = z.infer<typeof MeResponseSchema>;

// GET /auth/csrf
export const CsrfResponseSchema = z.object({ token: z.string().min(1) });
export type CsrfResponse = z.infer<typeof CsrfResponseSchema>;
