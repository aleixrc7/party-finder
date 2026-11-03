import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';
import {
  UNVERIFIED_ACCOUNT_TTL_DAYS,
  VERIFICATION_TOKEN_BYTES,
  VERIFICATION_TOKEN_TTL_HOURS,
} from '@party-finder/shared';
import { PrismaService, TX_OPTIONS } from '../common/prisma.service';

export function generateVerificationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(VERIFICATION_TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

/** What the database stores: sha256 of the token string, 64 lowercase hex chars. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenExpiry(now = new Date()): Date {
  return new Date(now.getTime() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000);
}

/** True when `error` is a unique-constraint violation that involves `field`. */
export function isUniqueViolation(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.some((t) => String(t).includes(field));
  return typeof target === 'string' && target.includes(field);
}

@Injectable()
export class UsersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Username lookups are case-insensitive (the column is CITEXT). */
  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /** Creates an unverified user and its first verification token atomically. */
  async createUnverified(input: {
    username: string;
    email: string;
    passwordHash: string;
    tokenHash: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        username: input.username,
        email: input.email,
        passwordHash: input.passwordHash,
        verificationTokens: {
          create: { tokenHash: input.tokenHash, expiresAt: tokenExpiry() },
        },
      },
    });
  }

  /** Invalidates every unused token of the user and stores a new one (one transaction). */
  async replaceVerificationToken(userId: string, tokenHash: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.deleteMany({ where: { userId, usedAt: null } });
      await tx.emailVerificationToken.create({
        data: { userId, tokenHash, expiresAt: tokenExpiry() },
      });
    }, TX_OPTIONS);
  }

  /**
   * Consumes a token and verifies its user in a single transaction. The claim is one
   * conditional UPDATE, so two simultaneous requests with the same token cannot both succeed.
   * Returns false for an unknown, expired or already used token.
   */
  async verifyWithTokenHash(tokenHash: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.emailVerificationToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return false;
      const token = await tx.emailVerificationToken.findUnique({ where: { tokenHash } });
      if (!token) return false;
      await tx.user.updateMany({
        where: { id: token.userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      });
      return true;
    }, TX_OPTIONS);
  }

  /** Daily cleanup: stale unverified accounts (their tokens cascade) and expired tokens. */
  async deleteStale(now = new Date()): Promise<{ users: number; tokens: number }> {
    const cutoff = new Date(now.getTime() - UNVERIFIED_ACCOUNT_TTL_DAYS * 24 * 60 * 60 * 1000);
    const users = await this.prisma.user.deleteMany({
      where: { emailVerifiedAt: null, createdAt: { lt: cutoff } },
    });
    const tokens = await this.prisma.emailVerificationToken.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return { users: users.count, tokens: tokens.count };
  }
}
