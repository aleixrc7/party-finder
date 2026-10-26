import { z } from 'zod';
import { EmailSchema, UserSummarySchema, UsernameSchema } from './common';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  VERIFICATION_TOKEN_MAX_LENGTH,
} from './constants';
import { AUTH_MESSAGES } from './messages';

export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`)
  .max(PASSWORD_MAX_LENGTH, `Máximo ${PASSWORD_MAX_LENGTH} caracteres`);

/**
 * Body of `202` for register and resend-verification. Always this exact message, so the
 * response never reveals whether the email (or an account) exists.
 */
export const VerificationEmailSentResponseSchema = z.object({
  message: z.literal(AUTH_MESSAGES.VERIFICATION_EMAIL_SENT),
});
export type VerificationEmailSentResponse = z.infer<typeof VerificationEmailSentResponseSchema>;

// POST /auth/register
export const RegisterRequestSchema = z.strictObject({
  username: UsernameSchema,
  /** Trimmed and lowercased by the schema. */
  email: EmailSchema,
  password: PasswordSchema,
  /** Cloudflare Turnstile token obtained by the client widget. */
  captchaToken: z.string().min(1, 'Completa el CAPTCHA').max(2048),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type RegisterRequestInput = z.input<typeof RegisterRequestSchema>;

/**
 * Register never opens a session and never returns the user: it answers `202` with the
 * generic message whether the email is new or already registered. Only a taken
 * username (public information) returns `409 USERNAME_TAKEN`.
 */
export const RegisterResponseSchema = VerificationEmailSentResponseSchema;
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

// POST /auth/verify-email
/**
 * The token always travels in this body, never in an API query string. Only the shape is
 * checked here: a token that is malformed, unknown, expired or already used gets the same
 * `400 INVALID_OR_EXPIRED_TOKEN`, with no further detail.
 */
export const VerifyEmailRequestSchema = z.strictObject({
  token: z.string().min(1).max(VERIFICATION_TOKEN_MAX_LENGTH),
});
export type VerifyEmailRequest = z.infer<typeof VerifyEmailRequestSchema>;

/** The account is verified. No session is opened: the user logs in afterwards. */
export const VerifyEmailResponseSchema = z.object({
  message: z.literal(AUTH_MESSAGES.EMAIL_VERIFIED),
});
export type VerifyEmailResponse = z.infer<typeof VerifyEmailResponseSchema>;

// POST /auth/resend-verification
export const ResendVerificationRequestSchema = z.strictObject({
  /** Trimmed and lowercased by the schema. */
  email: EmailSchema,
});
export type ResendVerificationRequest = z.infer<typeof ResendVerificationRequestSchema>;
export type ResendVerificationRequestInput = z.input<typeof ResendVerificationRequestSchema>;

/** Same body as register's 202, whether or not the email exists or is already verified. */
export const ResendVerificationResponseSchema = VerificationEmailSentResponseSchema;
export type ResendVerificationResponse = z.infer<typeof ResendVerificationResponseSchema>;

// POST /auth/login
/**
 * Login is by username (not email). It only checks shape, not the username rules: a
 * malformed username must produce the same generic 401 as a wrong password, not a 400
 * that reveals the rules.
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
