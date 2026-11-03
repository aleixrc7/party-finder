/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions on test fixtures keep the tests short */
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  UsersService,
  generateVerificationToken,
  hashToken,
  isUniqueViolation,
  tokenExpiry,
} from '../../src/users/users.service';

function prismaError(code: string, target?: unknown) {
  return new Prisma.PrismaClientKnownRequestError('boom', {
    code,
    clientVersion: 'test',
    meta: target === undefined ? undefined : { target },
  });
}

describe('verification tokens', () => {
  it('are 32 random bytes in base64url (43 chars) and unique', () => {
    const a = generateVerificationToken();
    const b = generateVerificationToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
  });

  it('are stored as the SHA-256 hex of the token string', () => {
    const { token, tokenHash } = generateVerificationToken();
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(hashToken(token));
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('expire 24 hours after issue', () => {
    const now = new Date('2031-01-01T10:00:00Z');
    expect(tokenExpiry(now).toISOString()).toBe('2031-01-02T10:00:00.000Z');
  });
});

describe('isUniqueViolation', () => {
  it('matches P2002 on the given field only', () => {
    expect(isUniqueViolation(prismaError('P2002', ['username']), 'username')).toBe(true);
    expect(isUniqueViolation(prismaError('P2002', ['email']), 'username')).toBe(false);
    expect(isUniqueViolation(prismaError('P2002', 'users_email_key'), 'email')).toBe(true);
    expect(isUniqueViolation(prismaError('P2003', ['username']), 'username')).toBe(false);
    expect(isUniqueViolation(new Error('x'), 'username')).toBe(false);
  });
});

describe('UsersService', () => {
  function make() {
    const tx = {
      emailVerificationToken: {
        updateMany: vi.fn(),
        findUnique: vi.fn(),
        deleteMany: vi.fn(),
        create: vi.fn(),
      },
      user: { updateMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      user: { deleteMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
      emailVerificationToken: { deleteMany: vi.fn() },
    };
    return { tx, prisma, service: new UsersService(prisma as never) };
  }

  it('looks usernames up case-insensitively', async () => {
    const { prisma, service } = make();
    await service.findByUsername('Ana');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { username: { equals: 'Ana', mode: 'insensitive' } },
    });
  });

  it('verifies a user by claiming the token with one conditional update', async () => {
    const { tx, service } = make();
    tx.emailVerificationToken.updateMany.mockResolvedValue({ count: 1 });
    tx.emailVerificationToken.findUnique.mockResolvedValue({ userId: 'u1' });
    expect(await service.verifyWithTokenHash('h'.repeat(64))).toBe(true);
    const claim = tx.emailVerificationToken.updateMany.mock.calls[0]![0];
    expect(claim.where).toMatchObject({ tokenHash: 'h'.repeat(64), usedAt: null });
    expect(claim.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(tx.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1', emailVerifiedAt: null } }),
    );
  });

  it('returns false and changes nothing when the token cannot be claimed', async () => {
    const { tx, service } = make();
    tx.emailVerificationToken.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.verifyWithTokenHash('x')).toBe(false);
    expect(tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('replaces tokens: deletes the unused ones and stores the new hash in one transaction', async () => {
    const { tx, service } = make();
    await service.replaceVerificationToken('u1', 'newhash');
    expect(tx.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', usedAt: null },
    });
    expect(tx.emailVerificationToken.create.mock.calls[0]![0].data).toMatchObject({
      userId: 'u1',
      tokenHash: 'newhash',
    });
  });

  it('deleteStale removes unverified users older than 7 days and expired tokens only', async () => {
    const { prisma, service } = make();
    prisma.user.deleteMany.mockResolvedValue({ count: 2 });
    prisma.emailVerificationToken.deleteMany.mockResolvedValue({ count: 5 });
    const now = new Date('2031-01-10T00:00:00Z');
    expect(await service.deleteStale(now)).toEqual({ users: 2, tokens: 5 });
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: { emailVerifiedAt: null, createdAt: { lt: new Date('2031-01-03T00:00:00Z') } },
    });
    expect(prisma.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
  });
});
