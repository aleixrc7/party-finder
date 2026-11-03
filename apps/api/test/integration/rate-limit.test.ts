/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions on test fixtures keep the tests short */
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { Client, TEST_PASSWORD, createTestContext, createUser } from '../helpers/test-app';
import type { TestContext } from '../helpers/test-app';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext(inject('databaseUrl'), inject('redisUrl'), {
    env: { RATE_LIMIT_DISABLED: 'false' },
  });
});
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

async function clientAt(ip: string): Promise<Client> {
  const client = new Client(ctx, ip);
  await client.fetchCsrf();
  return client;
}

describe('rate limiting', () => {
  it('login: 5 attempts per minute per IP, then 429 with Retry-After', async () => {
    const client = await clientAt('192.0.2.1');
    for (let i = 0; i < 5; i++) {
      const res = await client.post('/auth/login', {
        username: `ghost${i}`,
        password: 'password-1',
      });
      expect(res.status).toBe(401);
    }
    const blocked = await client.post('/auth/login', {
      username: 'ghost9',
      password: 'password-1',
    });
    expect(blocked.status).toBe(429);
    expect(blocked.json).toEqual({
      code: 'RATE_LIMITED',
      message: 'Demasiados intentos, prueba más tarde',
    });
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(Number(blocked.headers.get('retry-after'))).toBeLessThanOrEqual(60);
    // another IP is unaffected
    const other = await clientAt('192.0.2.2');
    expect(
      (await other.post('/auth/login', { username: 'ghost', password: 'password-1' })).status,
    ).toBe(401);
  });

  it('login: 10 attempts per 15 minutes per username across rotating IPs', async () => {
    await createUser(ctx, { username: 'victima' });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const client = await clientAt(`192.0.3.${i + 1}`);
      const res = await client.post('/auth/login', {
        username: 'Victima',
        password: 'wrong-pass-1',
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    // a correct password is also blocked while the limit holds
    const legit = await clientAt('192.0.3.99');
    expect(
      (await legit.post('/auth/login', { username: 'victima', password: TEST_PASSWORD })).status,
    ).toBe(429);
  });

  it('login: progressive delay after 5 consecutive failures for a username', async () => {
    const timings: number[] = [];
    for (let i = 0; i < 7; i++) {
      const client = await clientAt(`192.0.4.${i + 1}`);
      const started = Date.now();
      const res = await client.post('/auth/login', {
        username: 'objetivo',
        password: 'wrong-pass-1',
      });
      expect(res.status).toBe(401);
      timings.push(Date.now() - started);
    }
    expect(Math.max(...timings.slice(0, 4))).toBeLessThan(400);
    expect(timings[5]).toBeGreaterThanOrEqual(480); // 6th failure: 500 ms
    expect(timings[6]).toBeGreaterThanOrEqual(980); // 7th failure: 1 s
  });

  it('login: a successful login clears the failure counter', async () => {
    const user = await createUser(ctx, { username: 'recupera' });
    for (let i = 0; i < 4; i++) {
      const client = await clientAt(`192.0.5.${i + 1}`);
      await client.post('/auth/login', { username: user.username, password: 'wrong-pass-1' });
    }
    const ok = await clientAt('192.0.5.50');
    expect(
      (await ok.post('/auth/login', { username: user.username, password: TEST_PASSWORD })).status,
    ).toBe(200);
    expect(await ctx.redis.keys('fail:*')).toHaveLength(0);
  });

  it('register: 3 per hour per IP', async () => {
    const client = await clientAt('192.0.6.1');
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await client.post('/auth/register', {
        username: `usuario${i}`,
        email: `u${i}@example.com`,
        password: TEST_PASSWORD,
        captchaToken: 'ok',
      });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([202, 202, 202, 429]);
  });

  it('resend-verification: 1 per minute per email (also for unknown emails), different emails are independent', async () => {
    const client = await clientAt('192.0.7.1');
    const first = await client.post('/auth/resend-verification', { email: 'nadie@example.com' });
    expect(first.status).toBe(202);
    const second = await client.post('/auth/resend-verification', { email: 'NADIE@example.com' });
    expect(second.status).toBe(429);
    expect(second.json).toMatchObject({ code: 'RATE_LIMITED' });
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0);
    const other = await client.post('/auth/resend-verification', { email: 'otro@example.com' });
    expect(other.status).toBe(202);
  });

  it('resend-verification: 5 per day per email', async () => {
    const key = await (async () => {
      const client = await clientAt('192.0.8.1');
      await client.post('/auth/resend-verification', { email: 'diario@example.com' });
      return (await ctx.redis.keys('rl:resend:email:minute:*'))[0]!;
    })();
    const dayKey = key.replace('resend:email:minute', 'resend:email:day');
    expect(Number(await ctx.redis.get(dayKey))).toBe(1);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      await ctx.redis.del(key); // skip the 1-per-minute window to reach the daily cap
      const client = await clientAt(`192.0.8.${i + 2}`);
      statuses.push(
        (await client.post('/auth/resend-verification', { email: 'diario@example.com' })).status,
      );
    }
    expect(statuses).toEqual([202, 202, 202, 202, 429]);
  });

  it('verify-email: 10 per minute per IP', async () => {
    const client = await clientAt('192.0.9.1');
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await client.post('/auth/verify-email', { token: `token-${i}` })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('general: 100 requests per minute per IP, health excluded', async () => {
    const client = new Client(ctx, '192.0.10.1');
    for (let i = 0; i < 100; i++) {
      expect((await client.get('/auth/me')).status).toBe(200);
    }
    const blocked = await client.get('/auth/me');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect((await client.get('/health')).status).toBe(200);
  });

  it('never stores usernames or emails in clear in Redis', async () => {
    const client = await clientAt('192.0.11.1');
    await client.post('/auth/login', { username: 'nombre-visible', password: 'password-1' });
    await client.post('/auth/resend-verification', { email: 'visible@example.com' });
    const keys = (await ctx.redis.keys('*')).join('\n');
    expect(keys).not.toContain('nombre-visible');
    expect(keys).not.toContain('visible@example.com');
  });
});

describe('client IP resolution', () => {
  it('honours CF-Connecting-IP from a trusted proxy (separate counters per client IP)', async () => {
    const a = await clientAt('198.51.100.1');
    const b = await clientAt('198.51.100.2');
    for (let i = 0; i < 5; i++)
      await a.post('/auth/login', { username: 'x', password: 'password-1' });
    expect((await a.post('/auth/login', { username: 'x', password: 'password-1' })).status).toBe(
      429,
    );
    expect((await b.post('/auth/login', { username: 'y', password: 'password-1' })).status).toBe(
      401,
    );
  });

  it('ignores forwarded headers when the peer is not a trusted proxy', async () => {
    const untrusted = await createTestContext(inject('databaseUrl'), inject('redisUrl'), {
      env: { RATE_LIMIT_DISABLED: 'false', TRUSTED_PROXIES: '203.0.113.9' },
    });
    try {
      await untrusted.reset();
      const client = new Client(untrusted, '198.51.100.7'); // sent as a header, but the peer is 127.0.0.1
      await client.fetchCsrf();
      // Rotating the spoofed header does not escape the limit: all requests come from 127.0.0.1
      let blocked = 0;
      for (let i = 0; i < 7; i++) {
        const spoof = new Client(untrusted, `198.51.100.${10 + i}`);
        spoof.cookie = client.cookie;
        spoof.csrf = client.csrf;
        const res = await spoof.post('/auth/login', { username: 'x', password: 'password-1' });
        if (res.status === 429) blocked += 1;
      }
      expect(blocked).toBeGreaterThanOrEqual(2);
    } finally {
      await untrusted.close();
    }
  });
});
