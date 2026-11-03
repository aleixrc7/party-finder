import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AppError } from './errors';
import type { AuthenticatedUser } from './request-context';

export const IS_PUBLIC = 'isPublic';
export const SKIP_RATE_LIMIT = 'skipRateLimit';

/** Marks a route as reachable without a session. Every other route requires one (401). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Excludes a route from the general per-IP rate limit (health checks). */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT, true);

function userOf(ctx: ExecutionContext): AuthenticatedUser | null {
  const session = ctx.switchToHttp().getRequest<FastifyRequest>().appSession;
  if (!session?.userId || !session.username) return null;
  return { id: session.userId, username: session.username };
}

/** The logged-in user. Only use on routes that are not `@Public()`. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const user = userOf(ctx);
  if (!user) throw AppError.unauthenticated();
  return user;
});

/** The logged-in user or `null` (for public routes that personalise their answer). */
export const OptionalUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  userOf(ctx),
);
