/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions on test fixtures keep the tests short */
import { AUTH_MESSAGES } from '@party-finder/shared';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../src/auth/auth.service';
import { RateLimitService } from '../../src/common/rate-limit.service';
import { hashToken } from '../../src/users/users.service';

const registerBody = {
  username: 'ana',
  email: 'ana@example.com',
  password: 'correct-horse',
  captchaToken: 'ok',
};

function uniqueError(target: string) {
  return new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: [target] },
  });
}

function make() {
  const users = {
    findByUsername: vi.fn().mockResolvedValue(null),
    findByEmail: vi.fn().mockResolvedValue(null),
    createUnverified: vi.fn().mockResolvedValue({ id: 'u1' }),
    replaceVerificationToken: vi.fn().mockResolvedValue(undefined),
    verifyWithTokenHash: vi.fn().mockResolvedValue(true),
  };
  const passwords = {
    hash: vi.fn().mockResolvedValue('$argon2id$hash'),
    verify: vi.fn().mockResolvedValue(true),
    verifyDummy: vi.fn().mockResolvedValue(false),
  };
  const sessions = {
    regenerate: vi.fn().mockResolvedValue({ id: 's1', csrf: 'c', userId: 'u1', username: 'ana' }),
    destroy: vi.fn().mockResolvedValue(undefined),
  };
  const mail = {
    sendVerification: vi.fn().mockResolvedValue(undefined),
    sendAlreadyRegistered: vi.fn().mockResolvedValue(undefined),
  };
  const limiter = {
    consume: vi.fn().mockResolvedValue(undefined),
    registerLoginFailure: vi.fn().mockResolvedValue(1),
    clearLoginFailures: vi.fn().mockResolvedValue(undefined),
  };
  const captcha = { verify: vi.fn().mockResolvedValue(true) };
  const logger = { info: vi.fn(), error: vi.fn() };
  const service = new AuthService(
    users as never,
    passwords as never,
    sessions as never,
    mail as never,
    limiter as never,
    captcha as never,
    logger as never,
  );
  return { service, users, passwords, sessions, mail, limiter, captcha };
}

describe('AuthService.register', () => {
  it('creates the user with a hashed password and the token hash, then mails the plain token', async () => {
    const { service, users, mail } = make();
    const result = await service.register(registerBody, '1.1.1.1');
    expect(result).toEqual({ message: AUTH_MESSAGES.VERIFICATION_EMAIL_SENT });
    const input = users.createUnverified.mock.calls[0]![0];
    expect(input).toMatchObject({
      username: 'ana',
      email: 'ana@example.com',
      passwordHash: '$argon2id$hash',
    });
    const [to, name, token] = mail.sendVerification.mock.calls[0]!;
    expect([to, name]).toEqual(['ana@example.com', 'ana']);
    expect(input.tokenHash).toBe(hashToken(token));
    expect(input.tokenHash).not.toBe(token);
  });

  it('fails with CAPTCHA_FAILED before touching the database', async () => {
    const { service, users, captcha } = make();
    captcha.verify.mockResolvedValue(false);
    await expect(service.register(registerBody, '1.1.1.1')).rejects.toMatchObject({
      status: 400,
      code: 'CAPTCHA_FAILED',
    });
    expect(users.createUnverified).not.toHaveBeenCalled();
  });

  it('409 USERNAME_TAKEN when the username exists', async () => {
    const { service, users } = make();
    users.findByUsername.mockResolvedValue({ id: 'x' });
    await expect(service.register(registerBody, '1.1.1.1')).rejects.toMatchObject({
      status: 409,
      code: 'USERNAME_TAKEN',
    });
  });

  it('for an existing email: same result, nothing created, notice sent, and the password is still hashed', async () => {
    const { service, users, mail, passwords } = make();
    users.findByEmail.mockResolvedValue({ email: 'ana@example.com', username: 'ana_old' });
    const result = await service.register(registerBody, '1.1.1.1');
    expect(result).toEqual({ message: AUTH_MESSAGES.VERIFICATION_EMAIL_SENT });
    expect(users.createUnverified).not.toHaveBeenCalled();
    expect(mail.sendVerification).not.toHaveBeenCalled();
    expect(mail.sendAlreadyRegistered).toHaveBeenCalledWith('ana@example.com', 'ana_old');
    expect(passwords.hash).toHaveBeenCalledTimes(1);
  });

  it('maps a unique violation on username to 409 and on email to the generic 202', async () => {
    const a = make();
    a.users.createUnverified.mockRejectedValue(uniqueError('username'));
    await expect(a.service.register(registerBody, '1.1.1.1')).rejects.toMatchObject({
      code: 'USERNAME_TAKEN',
    });

    const b = make();
    b.users.createUnverified.mockRejectedValue(uniqueError('email'));
    b.users.findByEmail
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ email: 'ana@example.com', username: 'other' });
    expect(await b.service.register(registerBody, '1.1.1.1')).toEqual({
      message: AUTH_MESSAGES.VERIFICATION_EMAIL_SENT,
    });
    expect(b.mail.sendAlreadyRegistered).toHaveBeenCalledTimes(1);
  });

  it('rethrows unexpected database errors', async () => {
    const { service, users } = make();
    users.createUnverified.mockRejectedValue(new Error('connection lost'));
    await expect(service.register(registerBody, '1.1.1.1')).rejects.toThrow('connection lost');
  });
});

describe('AuthService.verifyEmail', () => {
  it('looks the token up by its hash, never by the plain value', async () => {
    const { service, users } = make();
    await expect(service.verifyEmail('plain-token')).resolves.toEqual({
      message: AUTH_MESSAGES.EMAIL_VERIFIED,
    });
    expect(users.verifyWithTokenHash).toHaveBeenCalledWith(hashToken('plain-token'));
  });

  it('400 INVALID_OR_EXPIRED_TOKEN with the exact message and no details when the token is not valid', async () => {
    const { service, users } = make();
    users.verifyWithTokenHash.mockResolvedValue(false);
    const error = await service.verifyEmail('x').catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 400,
      code: 'INVALID_OR_EXPIRED_TOKEN',
      message: AUTH_MESSAGES.INVALID_OR_EXPIRED_TOKEN,
    });
    expect((error as { details?: unknown }).details).toBeUndefined();
  });
});

describe('AuthService.resendVerification', () => {
  it('replaces the token and mails the new one for an unverified user', async () => {
    const { service, users, mail } = make();
    users.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'ana@example.com',
      username: 'ana',
      emailVerifiedAt: null,
    });
    expect(await service.resendVerification({ email: 'ana@example.com' })).toEqual({
      message: AUTH_MESSAGES.VERIFICATION_EMAIL_SENT,
    });
    expect(users.replaceVerificationToken).toHaveBeenCalledWith(
      'u1',
      hashToken(mail.sendVerification.mock.calls[0]![2]),
    );
  });

  it('answers the same and sends nothing for unknown and already verified emails', async () => {
    const { service, users, mail } = make();
    const a = await service.resendVerification({ email: 'nadie@example.com' });
    users.findByEmail.mockResolvedValue({ id: 'u2', emailVerifiedAt: new Date() });
    const b = await service.resendVerification({ email: 'ya@example.com' });
    expect(a).toEqual(b);
    expect(mail.sendVerification).not.toHaveBeenCalled();
    expect(users.replaceVerificationToken).not.toHaveBeenCalled();
  });

  it('applies 1 per minute and 5 per day per email before looking anything up', async () => {
    const { service, limiter } = make();
    await service.resendVerification({ email: 'ana@example.com' });
    const rules = limiter.consume.mock.calls[0]!;
    expect(rules).toEqual([
      expect.objectContaining({ limit: 1, windowSeconds: 60, subject: 'ana@example.com' }),
      expect.objectContaining({ limit: 5, windowSeconds: 86_400, subject: 'ana@example.com' }),
    ]);
  });
});

describe('AuthService.login', () => {
  const user = { id: 'u1', username: 'Ana', passwordHash: 'h', emailVerifiedAt: new Date() };

  it('success: clears failures and regenerates the session', async () => {
    const { service, users, sessions, limiter } = make();
    users.findByUsername.mockResolvedValue(user);
    const result = await service.login({ username: 'ana', password: 'pw' }, 'old-session');
    expect(result.user).toEqual({ id: 'u1', username: 'Ana' });
    expect(sessions.regenerate).toHaveBeenCalledWith('old-session', { id: 'u1', username: 'Ana' });
    expect(limiter.clearLoginFailures).toHaveBeenCalledWith('ana');
    expect(limiter.consume).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, windowSeconds: 900, subject: 'ana' }),
    );
  });

  it('unknown username: verifies against the dummy hash and answers the generic 401', async () => {
    const { service, passwords, limiter } = make();
    const error = await service
      .login({ username: 'ghost', password: 'pw' }, undefined)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: AUTH_MESSAGES.INVALID_CREDENTIALS,
    });
    expect(passwords.verifyDummy).toHaveBeenCalledWith('pw');
    expect(passwords.verify).not.toHaveBeenCalled();
    expect(limiter.registerLoginFailure).toHaveBeenCalledWith('ghost');
  });

  it('wrong password: the same 401', async () => {
    const { service, users, passwords, sessions } = make();
    users.findByUsername.mockResolvedValue(user);
    passwords.verify.mockResolvedValue(false);
    await expect(
      service.login({ username: 'ana', password: 'bad' }, undefined),
    ).rejects.toMatchObject({
      status: 401,
      message: AUTH_MESSAGES.INVALID_CREDENTIALS,
    });
    expect(sessions.regenerate).not.toHaveBeenCalled();
  });

  it('unverified email is 403 only AFTER the password is correct, and opens no session', async () => {
    const { service, users, passwords, sessions } = make();
    users.findByUsername.mockResolvedValue({ ...user, emailVerifiedAt: null });
    await expect(
      service.login({ username: 'ana', password: 'pw' }, undefined),
    ).rejects.toMatchObject({
      status: 403,
      code: 'EMAIL_NOT_VERIFIED',
      message: AUTH_MESSAGES.EMAIL_NOT_VERIFIED,
    });
    expect(sessions.regenerate).not.toHaveBeenCalled();

    passwords.verify.mockResolvedValue(false); // wrong password on the same unverified account
    await expect(
      service.login({ username: 'ana', password: 'bad' }, undefined),
    ).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('delays the response from the 5th consecutive failure', async () => {
    vi.useFakeTimers();
    try {
      const { service, limiter } = make();
      limiter.registerLoginFailure.mockResolvedValue(6);
      expect(RateLimitService.delayForFailures(6)).toBe(1000);
      let settled = false;
      const pending = service.login({ username: 'ghost', password: 'pw' }, undefined).catch(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(500);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(600);
      await pending;
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('logout destroys the session', async () => {
    const { service, sessions } = make();
    await service.logout('s1');
    expect(sessions.destroy).toHaveBeenCalledWith('s1');
  });
});
