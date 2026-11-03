import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SESSION_COOKIE_NAME } from '@party-finder/shared';
import type { FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import type { RequestSession, SessionData } from '../common/request-context';
import { ENV, REDIS } from '../common/tokens';
import type { Env } from '../config/env';

/** Sliding expiry: every request that carries a live session pushes it 7 days forward. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class SessionService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Redis only ever sees the SHA-256 of the session id, so a Redis dump cannot be replayed. */
  private key(id: string): string {
    return `sess:${createHash('sha256').update(id).digest('hex')}`;
  }

  static isWellFormedId(id: unknown): id is string {
    return typeof id === 'string' && SESSION_ID_PATTERN.test(id);
  }

  /** Creates a session. Without `user` it is anonymous: it only carries the CSRF token. */
  async create(user?: { id: string; username: string }): Promise<RequestSession> {
    const id = randomBytes(32).toString('base64url');
    const data: SessionData = {
      userId: user?.id ?? null,
      username: user?.username ?? null,
      csrf: randomBytes(32).toString('base64url'),
    };
    await this.redis.set(this.key(id), JSON.stringify(data), 'EX', SESSION_TTL_SECONDS);
    return { id, ...data };
  }

  /** Loads a session and refreshes its expiry in one atomic step (GETEX). */
  async load(id: string | undefined): Promise<RequestSession | null> {
    if (!SessionService.isWellFormedId(id)) return null;
    const raw = await this.redis.getex(this.key(id), 'EX', SESSION_TTL_SECONDS);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as SessionData;
      return { id, ...data };
    } catch {
      return null;
    }
  }

  async destroy(id: string): Promise<void> {
    await this.redis.del(this.key(id));
  }

  /** New id and new CSRF token for a user; the previous session (if any) is destroyed. */
  async regenerate(
    previousId: string | undefined,
    user: { id: string; username: string },
  ): Promise<RequestSession> {
    if (previousId) await this.destroy(previousId);
    return this.create(user);
  }

  /** Drops any `Set-Cookie` for the session cookie already queued on this reply. */
  private dropQueuedCookie(reply: FastifyReply): void {
    const queued = reply.getHeader('set-cookie');
    if (queued === undefined) return;
    const kept = (Array.isArray(queued) ? queued : [String(queued)]).filter(
      (cookie) => !cookie.startsWith(`${SESSION_COOKIE_NAME}=`),
    );
    if (kept.length > 0) void reply.header('set-cookie', kept);
    else void reply.removeHeader('set-cookie');
  }

  setCookie(reply: FastifyReply, id: string): void {
    this.dropQueuedCookie(reply);
    void reply.setCookie(SESSION_COOKIE_NAME, id, {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
    });
  }

  clearCookie(reply: FastifyReply): void {
    this.dropQueuedCookie(reply);
    void reply.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
  }
}
