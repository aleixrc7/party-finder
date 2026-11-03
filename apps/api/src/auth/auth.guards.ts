import { timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CSRF_HEADER, SESSION_COOKIE_NAME } from '@party-finder/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CLIENT_IP } from '../common/core.module';
import type { ClientIpResolver } from '../common/client-ip';
import { IS_PUBLIC, SKIP_RATE_LIMIT } from '../common/decorators';
import { AppError } from '../common/errors';
import { RateLimitService } from '../common/rate-limit.service';
import type { RateRule } from '../common/rate-limit.service';
import { SessionService } from './session.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_HEADER_LOWER = CSRF_HEADER.toLowerCase();

export const IP_RATE_LIMITS = 'ipRateLimits';
export type IpRateLimit = Pick<RateRule, 'name' | 'limit' | 'windowSeconds'>;

/** Extra per-IP limit for a route, on top of the general 100 requests per minute. */
export const IpRateLimited = (...limits: IpRateLimit[]) => SetMetadata(IP_RATE_LIMITS, limits);

export const GENERAL_LIMIT: IpRateLimit = { name: 'general:ip', limit: 100, windowSeconds: 60 };

export function clientIpOf(resolver: ClientIpResolver, req: FastifyRequest): string {
  return resolver.resolve(req.socket.remoteAddress, req.headers);
}

/** 1st guard: per-IP rate limits (general + route specific). */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(RateLimitService) private readonly limiter: RateLimitService,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(CLIENT_IP) private readonly clientIp: ClientIpResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT, targets)) return true;
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const ip = clientIpOf(this.clientIp, req);
    const routeLimits = this.reflector.get<IpRateLimit[] | undefined>(
      IP_RATE_LIMITS,
      context.getHandler(),
    );
    const rules = [GENERAL_LIMIT, ...(routeLimits ?? [])].map((limit) => ({
      ...limit,
      subject: ip,
    }));
    await this.limiter.consume(...rules);
    return true;
  }
}

/**
 * 2nd guard: loads the session from the cookie (refreshing its sliding expiry and the cookie)
 * and enforces CSRF on every POST, PATCH and DELETE.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const session = await this.sessions.load(req.cookies[SESSION_COOKIE_NAME]);
    if (session) {
      req.appSession = session;
      this.sessions.setCookie(reply, session.id); // slide the cookie together with the Redis TTL
    }

    if (!SAFE_METHODS.has(req.method.toUpperCase())) {
      const header = req.headers[CSRF_HEADER_LOWER];
      const sent = Array.isArray(header) ? header[0] : header;
      if (!session || !sent || !tokensEqual(session.csrf, sent)) throw AppError.csrfInvalid();
    }
    return true;
  }
}

function tokensEqual(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** 3rd guard: every route needs a logged-in user unless it is marked `@Public()`. */
@Injectable()
export class AuthRequiredGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (!req.appSession?.userId) throw AppError.unauthenticated();
    return true;
  }
}
