import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env';
import { AppError } from './errors';
import { ENV, REDIS } from './tokens';

export interface RateRule {
  /** Namespace, e.g. `login:ip`. */
  name: string;
  /** Raw identifier (IP, username, email). Hashed with HMAC before it reaches Redis. */
  subject: string;
  limit: number;
  windowSeconds: number;
}

/** INCR + EXPIRE in one atomic step. Returns `{ count, ttlMs }`. */
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) ttl = tonumber(ARGV[1]) end
return { count, ttl }
`;

const FAILURE_WINDOW_SECONDS = 15 * 60;
const FAILURES_BEFORE_DELAY = 5;

/**
 * Fixed-window rate limiting on Redis. Written in-house (instead of @nestjs/throttler) because
 * the limits are keyed by IP, username and email at once and must be counted inside handlers.
 */
@Injectable()
export class RateLimitService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** HMAC so usernames and emails are never stored in Redis in clear. */
  private key(prefix: string, name: string, subject: string): string {
    const digest = createHmac('sha256', this.env.SESSION_SECRET)
      .update(subject.toLowerCase())
      .digest('base64url')
      .slice(0, 32);
    return `${prefix}:${name}:${digest}`;
  }

  /** Counts one hit against every rule and throws 429 (with `Retry-After`) if any is exceeded. */
  async consume(...rules: RateRule[]): Promise<void> {
    if (this.env.RATE_LIMIT_DISABLED) return;
    let worstRetry = 0;
    for (const rule of rules) {
      const result = (await this.redis.eval(
        HIT_SCRIPT,
        1,
        this.key('rl', rule.name, rule.subject),
        String(rule.windowSeconds * 1000),
      )) as [number, number];
      const [count, ttlMs] = result;
      if (count > rule.limit) worstRetry = Math.max(worstRetry, Math.ceil(ttlMs / 1000));
    }
    if (worstRetry > 0) throw AppError.rateLimited(worstRetry);
  }

  /** Records a failed login for `username` and returns how many failures are in the window. */
  async registerLoginFailure(username: string): Promise<number> {
    const result = (await this.redis.eval(
      HIT_SCRIPT,
      1,
      this.key('fail', 'login', username),
      String(FAILURE_WINDOW_SECONDS * 1000),
    )) as [number, number];
    return result[0];
  }

  async clearLoginFailures(username: string): Promise<void> {
    await this.redis.del(this.key('fail', 'login', username));
  }

  /** Progressive delay once a username has 5 or more consecutive failures: 0.5s, 1s, 2s ... 8s. */
  static delayForFailures(failures: number): number {
    if (failures < FAILURES_BEFORE_DELAY) return 0;
    return Math.min(500 * 2 ** (failures - FAILURES_BEFORE_DELAY), 8000);
  }
}
