/* eslint-disable @typescript-eslint/no-extraneous-class */
import { Module } from '@nestjs/common';
import type { AppOverrides } from '../common/core.module';
import { ENV, MAIL_SENDER, OVERRIDES } from '../common/tokens';
import type { Env } from '../config/env';
import type { MailSender } from './mail-sender';
import { MailService } from './mail.service';
import { ResendMailSender } from './resend-mail-sender';
import { SmtpMailSender } from './smtp-mail-sender';

export function createMailSender(env: Env): MailSender {
  switch (env.MAIL_TRANSPORT) {
    case 'smtp':
      return new SmtpMailSender(env);
    case 'resend':
      return new ResendMailSender(env);
    default:
      throw new Error(
        `Unknown MAIL_TRANSPORT "${env.MAIL_TRANSPORT}" (expected "smtp" or "resend")`,
      );
  }
}

@Module({
  providers: [
    {
      provide: MAIL_SENDER,
      inject: [ENV, OVERRIDES],
      useFactory: (env: Env, overrides: AppOverrides) =>
        overrides.mailSender ?? createMailSender(env),
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
