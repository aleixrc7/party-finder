/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions on test fixtures keep the tests short */
import { describe, expect, it, vi } from 'vitest';
import { SESSION_TTL_SECONDS, SessionService } from '../../src/auth/session.service';
import type { Env } from '../../src/config/env';

function fakeRedis() {
  const store = new Map<string, { value: string; ttl: number }>();
  return {
    store,
    set: vi.fn((key: string, value: string, _ex: string, ttl: number) => {
      store.set(key, { value, ttl });
      return Promise.resolve('OK');
    }),
    getex: vi.fn((key: string, _ex: string, ttl: number) => {
      const entry = store.get(key);
      if (entry) entry.ttl = ttl;
      return Promise.resolve(entry?.value ?? null);
    }),
    del: vi.fn((key: string) => Promise.resolve(store.delete(key) ? 1 : 0)),
  };
}

const make = (nodeEnv: Env['NODE_ENV'] = 'test') => {
  const redis = fakeRedis();
  return { redis, service: new SessionService(redis as never, { NODE_ENV: nodeEnv } as Env) };
};

describe('SessionService', () => {
  it('creates an anonymous session: random 43-char id, CSRF token, 7-day TTL, hashed key', async () => {
    const { service, redis } = make();
    const a = await service.create();
    const b = await service.create();
    expect(a.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.id).not.toBe(b.id);
    expect(a.csrf).not.toBe(b.csrf);
    expect(a).toMatchObject({ userId: null, username: null });
    const key = [...redis.store.keys()][0]!;
    expect(key).toMatch(/^sess:[0-9a-f]{64}$/);
    expect(key).not.toContain(a.id);
    expect(redis.store.get(key)!.ttl).toBe(SESSION_TTL_SECONDS);
  });

  it('loads a session and slides its expiry', async () => {
    const { service, redis } = make();
    const created = await service.create({ id: 'u1', username: 'ana' });
    const key = [...redis.store.keys()][0]!;
    redis.store.get(key)!.ttl = 5;
    const loaded = await service.load(created.id);
    expect(loaded).toEqual(created);
    expect(redis.store.get(key)!.ttl).toBe(SESSION_TTL_SECONDS);
  });

  it('refuses malformed ids without touching Redis, and unknown or corrupt sessions', async () => {
    const { service, redis } = make();
    for (const id of [
      undefined,
      '',
      'short',
      'x'.repeat(44),
      `a b${'c'.repeat(40)}`,
      '../../etc',
    ]) {
      expect(await service.load(id)).toBeNull();
    }
    expect(redis.getex).not.toHaveBeenCalled();
    expect(await service.load('A'.repeat(43))).toBeNull();
    redis.getex.mockResolvedValueOnce('not json');
    expect(await service.load('B'.repeat(43))).toBeNull();
  });

  it('regenerate destroys the previous session and issues a new id and CSRF token', async () => {
    const { service, redis } = make();
    const old = await service.create();
    const fresh = await service.regenerate(old.id, { id: 'u1', username: 'ana' });
    expect(fresh.id).not.toBe(old.id);
    expect(fresh.csrf).not.toBe(old.csrf);
    expect(await service.load(old.id)).toBeNull();
    expect(await service.load(fresh.id)).toMatchObject({ userId: 'u1' });
    expect(redis.store.size).toBe(1);
  });

  it('destroy removes the session', async () => {
    const { service } = make();
    const s = await service.create({ id: 'u1', username: 'ana' });
    await service.destroy(s.id);
    expect(await service.load(s.id)).toBeNull();
  });

  it('sets an httpOnly, SameSite=Lax cookie, Secure only in production', () => {
    const calls: unknown[][] = [];
    const reply = {
      getHeader: () => undefined,
      setCookie: (...args: unknown[]) => calls.push(args),
    };
    make('development').service.setCookie(reply as never, 'id1');
    make('production').service.setCookie(reply as never, 'id2');
    expect(calls[0]![2]).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });
    expect(calls[1]![2]).toMatchObject({ secure: true });
  });
});
