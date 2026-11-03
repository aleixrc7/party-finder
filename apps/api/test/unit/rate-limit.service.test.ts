import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/common/errors';
import { RateLimitService } from '../../src/common/rate-limit.service';
import type { Env } from '../../src/config/env';

function makeService(evalResults: [number, number][], disabled = false) {
  const queue = [...evalResults];
  const redis = {
    eval: vi.fn((..._args: unknown[]) => Promise.resolve(queue.shift() ?? [1, 60_000])),
    del: vi.fn(() => Promise.resolve(1)),
  };
  const env = {
    SESSION_SECRET: 'secret-for-hmac-0123456789',
    RATE_LIMIT_DISABLED: disabled,
  } as Env;
  return { service: new RateLimitService(redis as never, env), redis };
}

const rule = { name: 'login:ip', subject: '1.2.3.4', limit: 5, windowSeconds: 60 };

describe('RateLimitService', () => {
  it('allows hits up to the limit', async () => {
    const { service } = makeService([[5, 30_000]]);
    await expect(service.consume(rule)).resolves.toBeUndefined();
  });

  it('throws 429 RATE_LIMITED with Retry-After from the key TTL once the limit is exceeded', async () => {
    const { service } = makeService([[6, 42_500]]);
    const error = await service.consume(rule).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      headers: { 'Retry-After': '43' },
    });
  });

  it('checks every rule and reports the longest wait', async () => {
    const { service, redis } = makeService([
      [6, 10_000],
      [11, 600_000],
    ]);
    const error = await service
      .consume(rule, { ...rule, name: 'login:user', limit: 10 })
      .catch((e: unknown) => e);
    expect(redis.eval).toHaveBeenCalledTimes(2);
    expect(error).toMatchObject({ headers: { 'Retry-After': '600' } });
  });

  it('hashes the subject: usernames and emails never reach Redis in clear, case-insensitively', async () => {
    const { service, redis } = makeService([
      [1, 1000],
      [1, 1000],
    ]);
    await service.consume({ ...rule, subject: 'Maria@Example.com' });
    await service.consume({ ...rule, subject: 'maria@example.com' });
    const keys = redis.eval.mock.calls.map((call) => call[2] as string);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toMatch(/^rl:login:ip:[A-Za-z0-9_-]{32}$/);
    expect(keys[0]).not.toContain('maria');
  });

  it('does nothing when disabled', async () => {
    const { service, redis } = makeService([], true);
    await service.consume(rule);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('tracks login failures and clears them', async () => {
    const { service, redis } = makeService([[3, 900_000]]);
    expect(await service.registerLoginFailure('ana')).toBe(3);
    await service.clearLoginFailures('ana');
    expect(redis.del).toHaveBeenCalledTimes(1);
  });

  it('delays progressively from the 5th consecutive failure, capped at 8 seconds', () => {
    expect([1, 4].map((n) => RateLimitService.delayForFailures(n))).toEqual([0, 0]);
    expect([5, 6, 7, 8, 9, 20].map((n) => RateLimitService.delayForFailures(n))).toEqual([
      500, 1000, 2000, 4000, 8000, 8000,
    ]);
  });
});
