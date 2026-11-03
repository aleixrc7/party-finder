import { Inject, Injectable } from '@nestjs/common';
import { VERIFY_EMAIL_WEB_PATH } from '@party-finder/shared';
import type { Logger } from 'pino';
import { ENV, LOGGER, MAIL_SENDER } from '../common/tokens';
import type { Env } from '../config/env';
import type { MailMessage, MailSender } from './mail-sender';
import { alreadyRegisteredEmail, verificationEmail } from './mail-templates';

@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_SENDER) private readonly sender: MailSender,
    @Inject(ENV) private readonly env: Env,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  /** `{WEB_ORIGIN}/verificar-email?token=...`. A web page, never an API URL. */
  buildVerificationLink(token: string): string {
    const base = this.env.WEB_ORIGIN.replace(/\/+$/, '');
    return `${base}${VERIFY_EMAIL_WEB_PATH}?token=${encodeURIComponent(token)}`;
  }

  /**
   * Sends without ever throwing: a delivery failure must not break the HTTP response (the user
   * can ask for a resend). The error is logged without the message, the link or the token.
   */
  private async deliver(kind: string, message: MailMessage): Promise<void> {
    try {
      await this.sender.send(message);
    } catch (error) {
      const err = error as { name?: string; code?: string };
      this.logger.error(
        { mail: kind, errName: err.name, errCode: err.code },
        'Email delivery failed',
      );
    }
  }

  sendVerification(to: string, username: string, token: string): Promise<void> {
    return this.deliver(
      'verification',
      verificationEmail(to, username, this.buildVerificationLink(token)),
    );
  }

  sendAlreadyRegistered(to: string, username: string): Promise<void> {
    const loginUrl = `${this.env.WEB_ORIGIN.replace(/\/+$/, '')}/`;
    return this.deliver('already-registered', alreadyRegisteredEmail(to, username, loginUrl));
  }
}
