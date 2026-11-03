import { Inject, Injectable } from '@nestjs/common';
import { AUTH_MESSAGES, ErrorCode } from '@party-finder/shared';
import type {
  LoginRequest,
  RegisterRequest,
  ResendVerificationRequest,
  UserSummary,
} from '@party-finder/shared';
import type { Logger } from 'pino';
import { AppError } from '../common/errors';
import { RateLimitService } from '../common/rate-limit.service';
import type { RequestSession } from '../common/request-context';
import { CAPTCHA_VERIFIER, LOGGER } from '../common/tokens';
import { MailService } from '../mail/mail.service';
import {
  generateVerificationToken,
  hashToken,
  isUniqueViolation,
  UsersService,
} from '../users/users.service';
import type { CaptchaVerifier } from './captcha';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

export const LOGIN_USER_LIMIT = { name: 'login:user', limit: 10, windowSeconds: 15 * 60 };
export const RESEND_EMAIL_LIMITS = [
  { name: 'resend:email:minute', limit: 1, windowSeconds: 60 },
  { name: 'resend:email:day', limit: 5, windowSeconds: 24 * 60 * 60 },
];

@Injectable()
export class AuthService {
  constructor(
    @Inject(UsersService) private readonly users: UsersService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(RateLimitService) private readonly limiter: RateLimitService,
    @Inject(CAPTCHA_VERIFIER) private readonly captcha: CaptchaVerifier,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /**
   * Creates an unverified user. The answer never depends on whether the email already exists:
   * for a registered email nothing is created and the owner gets an "already have an account"
   * notice instead of a link. Only a taken username (public) is a 409.
   */
  async register(body: RegisterRequest, ip: string): Promise<{ message: string }> {
    if (!(await this.captcha.verify(body.captchaToken, ip))) throw AppError.captchaFailed();

    // Hash first on every path, so the work done does not depend on whether the email exists.
    const passwordHash = await this.passwords.hash(body.password);

    if (await this.users.findByUsername(body.username)) throw AppError.conflict('USERNAME_TAKEN');

    const existing = await this.users.findByEmail(body.email);
    if (existing) {
      void this.mail.sendAlreadyRegistered(existing.email, existing.username);
      return { message: AUTH_MESSAGES.VERIFICATION_EMAIL_SENT };
    }

    const { token, tokenHash } = generateVerificationToken();
    try {
      await this.users.createUnverified({
        username: body.username,
        email: body.email,
        passwordHash,
        tokenHash,
      });
    } catch (error) {
      if (isUniqueViolation(error, 'username')) throw AppError.conflict('USERNAME_TAKEN');
      if (isUniqueViolation(error, 'email')) {
        // Lost a race with another registration of the same email: behave as "already exists".
        const owner = await this.users.findByEmail(body.email);
        if (owner) void this.mail.sendAlreadyRegistered(owner.email, owner.username);
        return { message: AUTH_MESSAGES.VERIFICATION_EMAIL_SENT };
      }
      throw error;
    }
    // After the commit. Failures are logged by MailService and never reach the response.
    void this.mail.sendVerification(body.email, body.username, token);
    return { message: AUTH_MESSAGES.VERIFICATION_EMAIL_SENT };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const ok = await this.users.verifyWithTokenHash(hashToken(token));
    if (!ok) {
      throw new AppError(
        400,
        ErrorCode.INVALID_OR_EXPIRED_TOKEN,
        AUTH_MESSAGES.INVALID_OR_EXPIRED_TOKEN,
      );
    }
    return { message: AUTH_MESSAGES.EMAIL_VERIFIED };
  }

  /** Always the same answer. Limits are counted the same for unknown emails. */
  async resendVerification(body: ResendVerificationRequest): Promise<{ message: string }> {
    await this.limiter.consume(
      ...RESEND_EMAIL_LIMITS.map((limit) => ({ ...limit, subject: body.email })),
    );
    const user = await this.users.findByEmail(body.email);
    if (user && !user.emailVerifiedAt) {
      const { token, tokenHash } = generateVerificationToken();
      await this.users.replaceVerificationToken(user.id, tokenHash);
      void this.mail.sendVerification(user.email, user.username, token);
    }
    return { message: AUTH_MESSAGES.VERIFICATION_EMAIL_SENT };
  }

  /**
   * Login by username. Wrong credentials are always the same 401, and an unknown username still
   * pays for a password verification. Only after a correct password does an unverified email
   * become 403 EMAIL_NOT_VERIFIED. The session id is regenerated on success.
   */
  async login(
    body: LoginRequest,
    previousSessionId: string | undefined,
  ): Promise<{ user: UserSummary; session: RequestSession }> {
    await this.limiter.consume({ ...LOGIN_USER_LIMIT, subject: body.username });

    const user = await this.users.findByUsername(body.username);
    const passwordOk = user
      ? await this.passwords.verify(user.passwordHash, body.password)
      : await this.passwords.verifyDummy(body.password);

    if (!user || !passwordOk) {
      const failures = await this.limiter.registerLoginFailure(body.username);
      const delay = RateLimitService.delayForFailures(failures);
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      throw new AppError(401, ErrorCode.INVALID_CREDENTIALS, AUTH_MESSAGES.INVALID_CREDENTIALS);
    }
    if (!user.emailVerifiedAt) {
      throw new AppError(403, ErrorCode.EMAIL_NOT_VERIFIED, AUTH_MESSAGES.EMAIL_NOT_VERIFIED);
    }

    await this.limiter.clearLoginFailures(body.username);
    const session = await this.sessions.regenerate(previousSessionId, {
      id: user.id,
      username: user.username,
    });
    this.logger.info({ userId: user.id }, 'User logged in');
    return { user: { id: user.id, username: user.username }, session };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.destroy(sessionId);
  }
}
