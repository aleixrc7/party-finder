import { createHash, randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { SESSION_COOKIE_NAME } from '@party-finder/shared';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Redis } from 'ioredis';
import { createApp } from '../../src/app';
import { createLogger } from '../../src/common/logger';
import { parseEnv } from '../../src/config/env';
import type { Env } from '../../src/config/env';
import { FakeCaptcha, FakeMailSender, FakeStorage } from './fakes';

export const WEB_ORIGIN = 'http://localhost:5173';
export const S3_PUBLIC_URL = 'http://storage.test/party-finder-images';
export const TEST_PASSWORD = 'correct-horse-battery';

export interface TestContext {
  app: NestFastifyApplication;
  /** Base URL of the listening server (real HTTP: `app.inject` needs Node >= 20.19). */
  url: string;
  env: Env;
  mail: FakeMailSender;
  storage: FakeStorage;
  prisma: PrismaClient;
  redis: Redis;
  /** Resets Postgres and Redis to an empty state. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

export function testEnv(
  databaseUrl: string,
  redisUrl: string,
  extra: Record<string, string> = {},
): Env {
  return parseEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    WEB_ORIGIN,
    SESSION_SECRET: 'test-session-secret-0123456789abcdef',
    TURNSTILE_SECRET_KEY: 'test',
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    S3_BUCKET: 'party-finder-images',
    S3_ACCESS_KEY: 'test',
    S3_SECRET_KEY: 'test',
    S3_PUBLIC_URL,
    MAIL_FROM: 'Test <test@example.com>',
    RATE_LIMIT_DISABLED: 'true',
    // Tests run over loopback and simulate client addresses with `CF-Connecting-IP`.
    TRUSTED_PROXIES: '127.0.0.1,::1',
    ...extra,
  });
}

export async function createTestContext(
  databaseUrl: string,
  redisUrl: string,
  options: { env?: Record<string, string>; logStream?: { write(chunk: string): void } } = {},
): Promise<TestContext> {
  const env = testEnv(databaseUrl, redisUrl, options.env);
  const mail = new FakeMailSender();
  const storage = new FakeStorage(S3_PUBLIC_URL);
  const logger = options.logStream
    ? createLogger('trace', options.logStream)
    : createLogger('silent');
  const app = await createApp({
    env,
    logger,
    overrides: { mailSender: mail, captchaVerifier: new FakeCaptcha(), objectStorage: storage },
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = await app.getUrl();

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const redis = new Redis(redisUrl);
  return {
    app,
    url,
    env,
    mail,
    storage,
    prisma,
    redis,
    async reset() {
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE attendances, calendar_entries, event_templates, email_verification_tokens, users RESTART IDENTITY CASCADE',
      );
      await redis.flushdb();
      mail.clear();
    },
    async close() {
      await app.close();
      await prisma.$disconnect();
      redis.disconnect();
    },
  };
}

let hashCache: string | undefined;
async function passwordHash(): Promise<string> {
  hashCache ??= await hash(TEST_PASSWORD);
  return hashCache;
}

let counter = 0;
export async function createUser(
  ctx: TestContext,
  overrides: { username?: string; email?: string; verified?: boolean } = {},
) {
  counter += 1;
  const username = overrides.username ?? `user${counter}_${randomBytes(2).toString('hex')}`;
  return ctx.prisma.user.create({
    data: {
      username,
      email: overrides.email ?? `${username.toLowerCase()}@example.com`,
      passwordHash: await passwordHash(),
      emailVerifiedAt: overrides.verified === false ? null : new Date(),
    },
  });
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  payload?: Buffer | string;
  form?: FormData;
  /** Do not send the CSRF header even if the client has a token. */
  noCsrf?: boolean;
}

/** A cookie-jar HTTP client over real HTTP, with its own simulated client IP. */
export class Client {
  cookie: string | null = null;
  csrf: string | null = null;

  constructor(
    private readonly ctx: TestContext,
    readonly ip = '10.0.0.1',
  ) {}

  async request(method: string, url: string, options: RequestOptions = {}) {
    const headers: Record<string, string> = { 'cf-connecting-ip': this.ip, ...options.headers };
    if (this.cookie) headers.cookie = this.cookie;
    if (this.csrf && !options.noCsrf && method !== 'GET') headers['x-csrf-token'] = this.csrf;
    let body: FormData | Buffer | string | undefined = options.form ?? options.payload;
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    const res = await fetch(this.ctx.url + url, { method, headers, body });
    const text = await res.text();
    const setCookie = res.headers.getSetCookie();
    this.absorbCookie(setCookie);
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, json, body: text, headers: res.headers, setCookie };
  }

  private absorbCookie(list: string[]): void {
    const mine = list.filter((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`)).at(-1);
    if (!mine) return;
    const pair = mine.split(';')[0] ?? '';
    const cleared = pair.endsWith('=') || /Expires=Thu, 01 Jan 1970/i.test(mine);
    this.cookie = cleared ? null : pair;
  }

  get = (url: string, options?: RequestOptions) => this.request('GET', url, options);
  post = (url: string, body?: unknown, options?: RequestOptions) =>
    this.request('POST', url, { ...options, body });
  patch = (url: string, body?: unknown, options?: RequestOptions) =>
    this.request('PATCH', url, { ...options, body });
  delete = (url: string, options?: RequestOptions) => this.request('DELETE', url, options);

  /** Fetches a CSRF token (creating an anonymous session if needed). */
  async fetchCsrf(): Promise<string> {
    const { json } = await this.get('/auth/csrf');
    this.csrf = (json as { token: string }).token;
    return this.csrf;
  }

  /** Logs in through the API, then fetches the new CSRF token (it changes on login). */
  async login(username: string, password = TEST_PASSWORD) {
    await this.fetchCsrf();
    const result = await this.post('/auth/login', { username, password });
    if (result.status === 200) await this.fetchCsrf();
    return result;
  }

  /** Multipart upload of a single file in field `file` (or `field`). */
  upload(
    url: string,
    file: Buffer,
    filename = 'file.bin',
    contentType = 'application/octet-stream',
    field = 'file',
  ) {
    const form = new FormData();
    form.append(field, new Blob([file], { type: contentType }), filename);
    return this.request('POST', url, { form });
  }
}

/** A logged-in client for a freshly created, verified user. */
export async function loggedInClient(
  ctx: TestContext,
  ip: string,
  overrides: { username?: string } = {},
) {
  const user = await createUser(ctx, overrides);
  const client = new Client(ctx, ip);
  const res = await client.login(user.username);
  if (res.status !== 200) throw new Error(`Test login failed: ${res.status}`);
  return { client, user };
}
