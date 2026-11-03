import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env';

const base = {
  WEB_ORIGIN: 'http://localhost:5173',
  SESSION_SECRET: 'a-session-secret-with-enough-length',
  TURNSTILE_SECRET_KEY: 'turnstile',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://:p@localhost:6379',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY: 'access',
  S3_SECRET_KEY: 'secret',
  S3_PUBLIC_URL: 'http://localhost:9000/bucket',
  MAIL_FROM: 'Test <t@example.com>',
};

describe('parseEnv', () => {
  it('applies defaults and coerces types', () => {
    const env = parseEnv({
      ...base,
      API_PORT: '4000',
      S3_FORCE_PATH_STYLE: 'true',
      SMTP_PORT: '2525',
    });
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 4000,
      S3_FORCE_PATH_STYLE: true,
      SMTP_PORT: 2525,
      MAIL_TRANSPORT: 'smtp',
      RATE_LIMIT_DISABLED: false,
      LOG_LEVEL: 'info',
    });
    expect(parseEnv(base).API_PORT).toBe(3000);
  });

  it('treats empty optional variables as undefined (as in infra/.env.example)', () => {
    const env = parseEnv({
      ...base,
      SMTP_USER: '',
      SMTP_PASSWORD: '',
      MAIL_PROVIDER_API_KEY: '',
      S3_ENDPOINT: '',
    });
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.MAIL_PROVIDER_API_KEY).toBeUndefined();
    expect(env.S3_ENDPOINT).toBeUndefined();
  });

  it('lists the offending variable names but never their values', () => {
    const secret = 'super-secret-value-that-must-not-leak';
    let message = '';
    try {
      parseEnv({
        ...base,
        SESSION_SECRET: 'short',
        DATABASE_URL: undefined,
        REDIS_URL: secret,
        WEB_ORIGIN: secret,
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('SESSION_SECRET');
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain(secret);
    expect(message).not.toContain('short');
  });

  it('requires a 32+ character secret and no disabled rate limits in production', () => {
    expect(() =>
      parseEnv({ ...base, NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(20) }),
    ).toThrow(/SESSION_SECRET/);
    expect(() =>
      parseEnv({
        ...base,
        NODE_ENV: 'production',
        SESSION_SECRET: 'x'.repeat(40),
        RATE_LIMIT_DISABLED: 'true',
      }),
    ).toThrow(/RATE_LIMIT_DISABLED/);
    expect(
      parseEnv({ ...base, NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40) }).NODE_ENV,
    ).toBe('production');
  });

  it('needs MAIL_PROVIDER_API_KEY for a non-smtp transport', () => {
    expect(() => parseEnv({ ...base, MAIL_TRANSPORT: 'resend' })).toThrow(/MAIL_PROVIDER_API_KEY/);
    expect(
      parseEnv({ ...base, MAIL_TRANSPORT: 'resend', MAIL_PROVIDER_API_KEY: 'key' }).MAIL_TRANSPORT,
    ).toBe('resend');
  });
});
