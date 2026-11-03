/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions on test fixtures keep the tests short */
import { randomBytes } from 'node:crypto';
import {
  AUTH_MESSAGES,
  CsrfResponseSchema,
  LoginResponseSchema,
  MeResponseSchema,
  SESSION_COOKIE_NAME,
  VerificationEmailSentResponseSchema,
  VerifyEmailResponseSchema,
} from '@party-finder/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { CleanupService } from '../../src/auth/cleanup.service';
import { SESSION_TTL_SECONDS } from '../../src/auth/session.service';
import {
  Client,
  TEST_PASSWORD,
  createTestContext,
  createUser,
  loggedInClient,
  sha256,
} from '../helpers/test-app';
import type { TestContext } from '../helpers/test-app';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext(inject('databaseUrl'), inject('redisUrl'));
});
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

async function freshClient(ip = '10.1.0.1'): Promise<Client> {
  const client = new Client(ctx, ip);
  await client.fetchCsrf();
  return client;
}

const registerBody = (over: Record<string, unknown> = {}) => ({
  username: 'nuevo_usuario',
  email: 'Nuevo@Example.com ',
  password: TEST_PASSWORD,
  captchaToken: 'ok',
  ...over,
});

describe('CSRF and sessions', () => {
  it('GET /auth/csrf creates an anonymous session and returns a stable token', async () => {
    const client = new Client(ctx);
    const first = await client.get('/auth/csrf');
    expect(first.status).toBe(200);
    const token = CsrfResponseSchema.parse(first.json).token;
    expect(client.cookie).toMatch(new RegExp(`^${SESSION_COOKIE_NAME}=`));
    const setCookie = first.setCookie.join(' | ');
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).not.toMatch(/Secure/i); // only in production
    const second = await client.get('/auth/csrf');
    expect(CsrfResponseSchema.parse(second.json).token).toBe(token);
  });

  it('rejects POST without or with a wrong CSRF token (403 CSRF_INVALID)', async () => {
    const client = await freshClient();
    const missing = await client.post(
      '/auth/login',
      { username: 'a', password: 'b' },
      { noCsrf: true },
    );
    expect(missing.status).toBe(403);
    expect(missing.json).toEqual({ code: 'CSRF_INVALID', message: 'Token CSRF no válido' });
    client.csrf = 'x'.repeat(43);
    const wrong = await client.post('/auth/login', { username: 'a', password: 'b' });
    expect(wrong.status).toBe(403);
    // No session at all: no token can be valid
    const bare = await new Client(ctx).post('/auth/login', { username: 'a', password: 'b' });
    expect(bare.json).toMatchObject({ code: 'CSRF_INVALID' });
  });

  it('a malformed or unknown session cookie is treated as anonymous', async () => {
    const client = new Client(ctx);
    client.cookie = `${SESSION_COOKIE_NAME}=not-a-real-session`;
    const me = await client.get('/auth/me');
    expect(MeResponseSchema.parse(me.json).user).toBeNull();
  });

  it('sets Secure on the cookie in production', async () => {
    const prod = await createTestContext(inject('databaseUrl'), inject('redisUrl'), {
      env: { NODE_ENV: 'production', RATE_LIMIT_DISABLED: 'false' },
    });
    try {
      const res = await new Client(prod).get('/auth/csrf');
      expect(res.setCookie.join(' | ')).toMatch(/Secure/i);
    } finally {
      await prod.close();
    }
  });
});

describe('POST /auth/register', () => {
  it('creates an unverified user, answers 202 with the generic message and starts no session', async () => {
    const client = await freshClient();
    const res = await client.post('/auth/register', registerBody());
    expect(res.status).toBe(202);
    expect(VerificationEmailSentResponseSchema.parse(res.json)).toEqual({
      message: AUTH_MESSAGES.VERIFICATION_EMAIL_SENT,
    });

    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'nuevo@example.com' } });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);

    const me = await client.get('/auth/me');
    expect(MeResponseSchema.parse(me.json).user).toBeNull();

    const token = ctx.mail.lastToken('nuevo@example.com');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const mail = ctx.mail.to('nuevo@example.com')[0]!;
    expect(mail.text).toContain(`http://localhost:5173/verificar-email?token=${token}`);
    expect(mail.html).toContain('verificar-email?token=');
    expect(mail.subject).toMatch(/Verifica/);
  });

  it('stores only the SHA-256 of the token, expiring in 24 hours', async () => {
    const client = await freshClient();
    await client.post('/auth/register', registerBody());
    const token = ctx.mail.lastToken('nuevo@example.com')!;
    const rows = await ctx.prisma.emailVerificationToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(sha256(token));
    expect(rows[0]!.tokenHash).not.toBe(token);
    const hours = (rows[0]!.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
    expect(rows[0]!.usedAt).toBeNull();
  });

  it('answers byte-for-byte the same for a new and an already registered email', async () => {
    const owner = await createUser(ctx, { username: 'duena', email: 'duena@example.com' });
    const a = await freshClient('10.1.0.2');
    const fresh = await a.post('/auth/register', registerBody({ email: 'otra@example.com' }));
    const b = await freshClient('10.1.0.3');
    const taken = await b.post(
      '/auth/register',
      registerBody({ username: 'otro_nombre', email: 'duena@example.com' }),
    );
    expect(taken.status).toBe(fresh.status);
    expect(taken.body).toBe(fresh.body);
    // Nothing was created for the existing email, and its owner got a notice without a link
    expect(await ctx.prisma.user.count({ where: { username: 'otro_nombre' } })).toBe(0);
    const notice = ctx.mail.to('duena@example.com');
    expect(notice).toHaveLength(1);
    expect(notice[0]!.text).not.toContain('token=');
    expect(notice[0]!.text).toContain(owner.username);
    expect(notice[0]!.subject).toMatch(/Ya tienes una cuenta/);
    expect(ctx.mail.lastToken('duena@example.com')).toBeNull();
  });

  it('returns 409 USERNAME_TAKEN for a taken username (case-insensitive)', async () => {
    await createUser(ctx, { username: 'Maria', email: 'maria@example.com' });
    const client = await freshClient();
    const res = await client.post('/auth/register', registerBody({ username: 'MARIA' }));
    expect(res.status).toBe(409);
    expect(res.json).toEqual({
      code: 'USERNAME_TAKEN',
      message: 'Ese nombre de usuario ya está en uso',
    });
  });

  it('returns 400 CAPTCHA_FAILED when the captcha is rejected', async () => {
    const client = await freshClient();
    const res = await client.post('/auth/register', registerBody({ captchaToken: 'bad-captcha' }));
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ code: 'CAPTCHA_FAILED' });
    expect(await ctx.prisma.user.count()).toBe(0);
  });

  it('returns 400 VALIDATION_ERROR with issues for invalid and unknown fields', async () => {
    const client = await freshClient();
    const res = await client.post(
      '/auth/register',
      registerBody({ password: 'short', admin: true }),
    );
    expect(res.status).toBe(400);
    const body = res.json as { code: string; details: { issues: { path: unknown[] }[] } };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details.issues.length).toBeGreaterThan(0);
    const bad = await client.post('/auth/register', registerBody({ email: 'no-es-un-correo' }));
    expect(bad.json).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('still answers 202 when sending the email fails', async () => {
    ctx.mail.failWith = new Error('smtp down');
    try {
      const client = await freshClient();
      const res = await client.post('/auth/register', registerBody());
      expect(res.status).toBe(202);
      expect(await ctx.prisma.user.count()).toBe(1);
    } finally {
      ctx.mail.failWith = null;
    }
  });
});

describe('POST /auth/verify-email and login', () => {
  async function registerAndGetToken(email = 'ana@example.com', username = 'ana_nueva') {
    const client = await freshClient();
    await client.post('/auth/register', registerBody({ email, username }));
    return { client, token: ctx.mail.lastToken(email)! };
  }

  it('sign-up -> token -> verification -> successful login', async () => {
    const { client, token } = await registerAndGetToken();
    const verify = await client.post('/auth/verify-email', { token });
    expect(verify.status).toBe(200);
    expect(VerifyEmailResponseSchema.parse(verify.json).message).toBe(AUTH_MESSAGES.EMAIL_VERIFIED);
    // verification opens no session
    expect(MeResponseSchema.parse((await client.get('/auth/me')).json).user).toBeNull();

    const row = await ctx.prisma.emailVerificationToken.findFirstOrThrow();
    expect(row.usedAt).not.toBeNull();
    expect((await ctx.prisma.user.findFirstOrThrow()).emailVerifiedAt).not.toBeNull();

    const login = await client.post('/auth/login', {
      username: 'ANA_NUEVA',
      password: TEST_PASSWORD,
    });
    expect(login.status).toBe(200);
    const parsed = LoginResponseSchema.parse(login.json);
    expect(parsed.user.username).toBe('ana_nueva');
    expect(JSON.stringify(login.json)).not.toMatch(/email|password|hash/i);
  });

  it('login before verifying: 403 EMAIL_NOT_VERIFIED with the right password, 401 with a wrong one', async () => {
    const { client } = await registerAndGetToken();
    const cookieBefore = client.cookie;
    const right = await client.post('/auth/login', {
      username: 'ana_nueva',
      password: TEST_PASSWORD,
    });
    expect(right.status).toBe(403);
    expect(right.json).toEqual({
      code: 'EMAIL_NOT_VERIFIED',
      message: AUTH_MESSAGES.EMAIL_NOT_VERIFIED,
    });
    expect(client.cookie).toBe(cookieBefore); // no new session
    expect(MeResponseSchema.parse((await client.get('/auth/me')).json).user).toBeNull();

    const wrong = await client.post('/auth/login', {
      username: 'ana_nueva',
      password: 'incorrecta-123',
    });
    expect(wrong.status).toBe(401);
    expect(wrong.json).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: AUTH_MESSAGES.INVALID_CREDENTIALS,
    });
  });

  it('rejects tampered, unknown, malformed and empty-ish tokens with the same 400', async () => {
    const { client, token } = await registerAndGetToken();
    const expected = {
      code: 'INVALID_OR_EXPIRED_TOKEN',
      message: AUTH_MESSAGES.INVALID_OR_EXPIRED_TOKEN,
    };
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    for (const bad of [
      tampered,
      randomBytes(32).toString('base64url'),
      'x',
      ' ',
      "'; DROP TABLE users;--",
    ]) {
      const res = await client.post('/auth/verify-email', { token: bad });
      expect(res.status).toBe(400);
      expect(res.json).toEqual(expected);
    }
    expect((await ctx.prisma.user.findFirstOrThrow()).emailVerifiedAt).toBeNull();
    const shape = await client.post('/auth/verify-email', { token: 123 });
    expect(shape.json).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects an expired token and a reused token', async () => {
    const { client, token } = await registerAndGetToken();
    await ctx.prisma.emailVerificationToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await client.post('/auth/verify-email', { token });
    expect(expired.status).toBe(400);
    expect(expired.json).toMatchObject({ code: 'INVALID_OR_EXPIRED_TOKEN' });
    expect((await ctx.prisma.user.findFirstOrThrow()).emailVerifiedAt).toBeNull();

    await ctx.prisma.emailVerificationToken.updateMany({
      data: { expiresAt: new Date(Date.now() + 60_000) },
    });
    expect((await client.post('/auth/verify-email', { token })).status).toBe(200);
    const reused = await client.post('/auth/verify-email', { token });
    expect(reused.status).toBe(400);
    expect(reused.json).toMatchObject({ code: 'INVALID_OR_EXPIRED_TOKEN' });
  });

  it('only one of several simultaneous verifications with the same token succeeds', async () => {
    const { token } = await registerAndGetToken();
    const clients = await Promise.all([1, 2, 3, 4, 5].map((n) => freshClient(`10.2.0.${n}`)));
    const results = await Promise.all(clients.map((c) => c.post('/auth/verify-email', { token })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(4);
  });
});

describe('POST /auth/resend-verification', () => {
  it('invalidates the previous token and sends a new one', async () => {
    const client = await freshClient();
    await client.post('/auth/register', registerBody());
    const oldToken = ctx.mail.lastToken('nuevo@example.com')!;
    const res = await client.post('/auth/resend-verification', { email: 'NUEVO@example.com' });
    expect(res.status).toBe(202);
    const newToken = ctx.mail.lastToken('nuevo@example.com')!;
    expect(newToken).not.toBe(oldToken);
    expect(ctx.mail.to('nuevo@example.com')).toHaveLength(2);

    expect((await client.post('/auth/verify-email', { token: oldToken })).status).toBe(400);
    expect((await client.post('/auth/verify-email', { token: newToken })).status).toBe(200);
  });

  it('answers exactly the same for unknown, unverified and verified emails', async () => {
    await createUser(ctx, { username: 'verificada', email: 'verificada@example.com' });
    await createUser(ctx, {
      username: 'pendiente',
      email: 'pendiente@example.com',
      verified: false,
    });
    const bodies: string[] = [];
    let n = 0;
    for (const email of ['nadie@example.com', 'pendiente@example.com', 'verificada@example.com']) {
      const client = await freshClient(`10.3.0.${++n}`);
      const res = await client.post('/auth/resend-verification', { email });
      expect(res.status).toBe(202);
      bodies.push(res.body);
    }
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0]!)).toEqual({ message: AUTH_MESSAGES.VERIFICATION_EMAIL_SENT });
    expect(ctx.mail.to('pendiente@example.com')).toHaveLength(1);
    expect(ctx.mail.to('nadie@example.com')).toHaveLength(0);
    expect(ctx.mail.to('verificada@example.com')).toHaveLength(0);
  });

  it('returns 400 only for a malformed body', async () => {
    const client = await freshClient();
    const res = await client.post('/auth/resend-verification', { email: 'nope' });
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('login, me and logout', () => {
  it('logs in, regenerates the session id and destroys the old one', async () => {
    const user = await createUser(ctx, { username: 'Laura' });
    const client = await freshClient();
    const anonymousCookie = client.cookie!;
    const anonymousCsrf = client.csrf!;

    const res = await client.post('/auth/login', { username: 'laura', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(LoginResponseSchema.parse(res.json).user).toEqual({ id: user.id, username: 'Laura' });
    expect(client.cookie).not.toBe(anonymousCookie);
    const setCookie = res.setCookie.join(' | ');
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).toMatch(new RegExp(`Max-Age=${SESSION_TTL_SECONDS}`));

    const old = new Client(ctx);
    old.cookie = anonymousCookie;
    old.csrf = anonymousCsrf;
    const oldPost = await old.post('/auth/logout');
    expect(oldPost.status).toBe(403); // the old session is gone

    expect(MeResponseSchema.parse((await client.get('/auth/me')).json).user).toEqual({
      id: user.id,
      username: 'Laura',
    });
    // The CSRF token is new too
    expect(client.csrf).toBe(anonymousCsrf);
    expect(
      (await client.post('/event-templates', { name: 'n', description: 'd', type: 'PASEO' }))
        .status,
    ).toBe(403);
    await client.fetchCsrf();
    expect(client.csrf).not.toBe(anonymousCsrf);
  });

  it('gives the same 401 for an unknown user, a wrong password and a malformed username', async () => {
    await createUser(ctx, { username: 'existente' });
    const bodies = new Set<string>();
    let n = 0;
    for (const creds of [
      { username: 'existente', password: 'mal-password-1' },
      { username: 'no_existe', password: 'mal-password-1' },
      { username: 'x y!', password: 'mal-password-1' },
    ]) {
      const client = await freshClient(`10.4.0.${++n}`);
      const res = await client.post('/auth/login', creds);
      expect(res.status).toBe(401);
      bodies.add(res.body);
    }
    expect(bodies.size).toBe(1);
    expect(JSON.parse([...bodies][0]!)).toEqual({
      code: 'INVALID_CREDENTIALS',
      message: 'Usuario o contraseña incorrectos.',
    });
  });

  it('validates the login body shape (400) and rejects unknown fields', async () => {
    const client = await freshClient();
    expect((await client.post('/auth/login', { username: 'a' })).status).toBe(400);
    expect((await client.post('/auth/login', { username: 'a', password: 'b', x: 1 })).status).toBe(
      400,
    );
  });

  it('keeps the session alive with a sliding 7-day expiry', async () => {
    const { client } = await loggedInClient(ctx, '10.5.0.1');
    const keys = (await ctx.redis.keys('sess:*')).filter(Boolean);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) await ctx.redis.expire(key, 100);
    await client.get('/auth/me');
    const ttls = await Promise.all(keys.map((key) => ctx.redis.ttl(key)));
    expect(Math.max(...ttls)).toBeGreaterThan(SESSION_TTL_SECONDS - 60);
  });

  it('logout destroys the session in Redis and clears the cookie', async () => {
    const { client } = await loggedInClient(ctx, '10.5.0.2');
    const sessionsBefore = await ctx.redis.keys('sess:*');
    const stale = client.cookie!;
    const res = await client.post('/auth/logout');
    expect(res.status).toBe(204);
    expect(res.body).toBe('');
    expect(res.setCookie.join(' | ')).toMatch(/pf_session=;/);
    expect((await ctx.redis.keys('sess:*')).length).toBe(sessionsBefore.length - 1);
    const replay = new Client(ctx);
    replay.cookie = stale;
    expect(MeResponseSchema.parse((await replay.get('/auth/me')).json).user).toBeNull();
  });

  it('logout without a session is 401 (with CSRF) or 403 (without)', async () => {
    const client = await freshClient();
    const res = await client.post('/auth/logout');
    expect(res.status).toBe(401);
    expect(res.json).toEqual({ code: 'UNAUTHENTICATED', message: 'Debes iniciar sesión' });
    expect((await new Client(ctx).post('/auth/logout')).status).toBe(403);
  });
});

describe('daily cleanup job', () => {
  it('deletes only unverified accounts older than 7 days and expired tokens', async () => {
    const day = 24 * 60 * 60 * 1000;
    const oldUnverified = await createUser(ctx, {
      username: 'viejo_sin_verificar',
      verified: false,
    });
    const newUnverified = await createUser(ctx, {
      username: 'nuevo_sin_verificar',
      verified: false,
    });
    const oldVerified = await createUser(ctx, { username: 'viejo_verificado' });
    await ctx.prisma.user.updateMany({
      where: { id: { in: [oldUnverified.id, oldVerified.id] } },
      data: { createdAt: new Date(Date.now() - 8 * day) },
    });
    const token = (userId: string, expiresAt: Date) =>
      ctx.prisma.emailVerificationToken.create({
        data: { userId, tokenHash: sha256(randomBytes(8).toString('hex')), expiresAt },
      });
    await token(oldUnverified.id, new Date(Date.now() - 7 * day));
    await token(newUnverified.id, new Date(Date.now() + day)); // valid: kept
    await token(newUnverified.id, new Date(Date.now() - 1000)); // expired: removed
    await token(oldVerified.id, new Date(Date.now() - 2 * day)); // expired: removed

    const cleanup = ctx.app.get(CleanupService);
    const result = await cleanup.run();
    expect(result.users).toBe(1);

    const users = await ctx.prisma.user.findMany({ orderBy: { username: 'asc' } });
    expect(users.map((u) => u.username)).toEqual(['nuevo_sin_verificar', 'viejo_verificado']);
    const tokens = await ctx.prisma.emailVerificationToken.findMany();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.userId).toBe(newUnverified.id);
  });
});

describe('logging', () => {
  it('never writes passwords, tokens, cookies or CSRF tokens to the logs', async () => {
    const lines: string[] = [];
    const logged = await createTestContext(inject('databaseUrl'), inject('redisUrl'), {
      logStream: { write: (chunk: string) => void lines.push(chunk) },
    });
    try {
      await logged.reset();
      const password = 'super-secret-pass-98765';
      const client = new Client(logged, '10.9.0.1');
      await client.fetchCsrf();
      await client.post('/auth/register', registerBody({ password }));
      const token = logged.mail.lastToken('nuevo@example.com')!;
      await client.post('/auth/verify-email', { token });
      await client.post('/auth/verify-email', { token: 'tampered-token-value-123456' });
      await client.post('/auth/login', { username: 'nuevo_usuario', password });
      await client.post('/auth/login', {
        username: 'nuevo_usuario',
        password: 'wrong-pass-4567890',
      });
      const secrets = [
        password,
        'wrong-pass-4567890',
        token,
        'tampered-token-value-123456',
        client.cookie!.split('=')[1]!,
        client.csrf!,
      ];
      logged.mail.failWith = new Error(`boom ${token}`);
      await client.post('/auth/resend-verification', { email: 'nuevo@example.com' });
      const text = lines.join('');
      expect(text.length).toBeGreaterThan(0); // logging is on
      for (const secret of secrets) expect(text).not.toContain(secret);
      expect(text).not.toContain('verificar-email?token');
    } finally {
      await logged.close();
    }
  });
});
