import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { Client, WEB_ORIGIN, createTestContext, loggedInClient } from '../helpers/test-app';
import type { TestContext } from '../helpers/test-app';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext(inject('databaseUrl'), inject('redisUrl'));
});
afterAll(() => ctx.close());
beforeEach(() => ctx.reset());

describe('base and cross-cutting security', () => {
  it('GET /health reports ok without a session', async () => {
    const res = await new Client(ctx).get('/health');
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ status: 'ok' });
  });

  it('sets Helmet security headers', async () => {
    const res = await new Client(ctx).get('/health');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBeTruthy();
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('CORS names only WEB_ORIGIN, with credentials', async () => {
    const allowed = await fetch(`${ctx.url}/auth/me`, { headers: { origin: WEB_ORIGIN } });
    expect(allowed.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN);
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');
    const denied = await fetch(`${ctx.url}/auth/me`, {
      headers: { origin: 'https://evil.example.com' },
    });
    // The header only ever names WEB_ORIGIN, so browsers block any other origin.
    expect(denied.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN);
    expect(denied.headers.get('access-control-allow-origin')).not.toBe('https://evil.example.com');

    const preflight = await fetch(`${ctx.url}/auth/login`, {
      method: 'OPTIONS',
      headers: {
        origin: WEB_ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-csrf-token',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
      'x-csrf-token',
    );
    expect(preflight.headers.get('access-control-allow-origin')).toBe(WEB_ORIGIN);
  });

  it('rejects JSON bodies over 1 MB with 413 PAYLOAD_TOO_LARGE in the contract format', async () => {
    const client = new Client(ctx);
    await client.fetchCsrf();
    const res = await client.post('/auth/login', {
      username: 'a',
      password: 'x'.repeat(1_100_000),
    });
    expect(res.status).toBe(413);
    expect(res.json).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('malformed JSON is a 400 VALIDATION_ERROR, never a stack trace', async () => {
    const client = new Client(ctx);
    await client.fetchCsrf();
    const res = await client.request('POST', '/auth/login', {
      payload: '{"username": ',
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Datos no válidos' });
    expect(res.body).not.toMatch(/at |node_modules|SyntaxError/);
  });

  it('accepts POST/DELETE with a JSON content type and an empty body', async () => {
    const { client } = await loggedInClient(ctx, '10.60.0.1');
    const res = await client.request('POST', '/auth/logout', {
      headers: { 'content-type': 'application/json' },
    });
    expect(res.status).toBe(204);
  });

  it('unknown routes use the error format (404 NOT_FOUND)', async () => {
    const res = await new Client(ctx).get('/no-existe');
    expect(res.status).toBe(404);
    expect(res.json).toEqual({ code: 'NOT_FOUND', message: 'No encontrado' });
  });

  it('serves routes without an /api prefix', async () => {
    expect((await new Client(ctx).get('/api/auth/me')).status).toBe(404);
    expect((await new Client(ctx).get('/auth/me')).status).toBe(200);
  });

  it('every error body is { code, message, details? } with Spanish text', async () => {
    const client = new Client(ctx);
    await client.fetchCsrf();
    const samples = [
      await client.get('/event-templates'),
      await client.post('/auth/login', {}),
      await client.get('/calendar'),
      await client.post('/auth/login', { username: 'a', password: 'b' }, { noCsrf: true }),
    ];
    for (const res of samples) {
      expect(res.status).toBeGreaterThanOrEqual(400);
      const body = res.json as Record<string, unknown>;
      expect(Object.keys(body).every((k) => ['code', 'message', 'details'].includes(k))).toBe(true);
      expect(typeof body.code).toBe('string');
      expect(typeof body.message).toBe('string');
    }
  });
});
