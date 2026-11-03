import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

/** Repo root: this file lives in apps/api/{src,dist}/config. */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

/**
 * Loads `.env.local` and then `.env` from the repo root into `process.env`.
 * Variables that are already set win, then `.env.local` wins over `.env`. Missing files are ignored.
 * Nothing is ever printed.
 */
export function loadEnvFiles(): void {
  loadDotenv({
    path: [path.join(REPO_ROOT, '.env.local'), path.join(REPO_ROOT, '.env')],
    quiet: true,
  });
}

const boolString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== '' ? value.trim() : undefined));

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    API_HOST: optionalString,
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    WEB_ORIGIN: z.url(),
    SESSION_SECRET: z.string().min(16, 'SESSION_SECRET must have at least 16 characters'),
    TURNSTILE_SECRET_KEY: z.string().min(1),
    TURNSTILE_VERIFY_URL: z
      .url()
      .default('https://challenges.cloudflare.com/turnstile/v0/siteverify'),

    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),

    S3_ENDPOINT: z
      .url()
      .optional()
      .or(z.literal('').transform(() => undefined)),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: boolString.default(false),
    S3_PUBLIC_URL: z.url(),

    MAIL_TRANSPORT: z.string().min(1).default('smtp'),
    MAIL_FROM: z.string().min(3),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    SMTP_SECURE: boolString.default(false),
    MAIL_PROVIDER_API_KEY: optionalString,

    /** Comma-separated IPs or CIDRs of reverse proxies whose forwarded headers are trusted. */
    TRUSTED_PROXIES: optionalString,
    /** Development and QA only: turns every rate limit off. Refused in production. */
    RATE_LIMIT_DISABLED: boolString.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.SESSION_SECRET.length < 32) {
        ctx.addIssue({
          code: 'custom',
          path: ['SESSION_SECRET'],
          message: 'SESSION_SECRET must have at least 32 characters in production',
        });
      }
      if (env.RATE_LIMIT_DISABLED) {
        ctx.addIssue({
          code: 'custom',
          path: ['RATE_LIMIT_DISABLED'],
          message: 'RATE_LIMIT_DISABLED cannot be used in production',
        });
      }
    }
    if (env.MAIL_TRANSPORT !== 'smtp' && !env.MAIL_PROVIDER_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_PROVIDER_API_KEY'],
        message: 'MAIL_PROVIDER_API_KEY is required when MAIL_TRANSPORT is not "smtp"',
      });
    }
  });

export type Env = z.output<typeof EnvSchema>;

/** Validates the environment. Throws an Error that lists variable names only, never values. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(env)'}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}
