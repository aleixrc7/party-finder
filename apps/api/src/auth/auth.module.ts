/* eslint-disable @typescript-eslint/no-extraneous-class */
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { AppOverrides } from '../common/core.module';
import { CAPTCHA_VERIFIER, ENV, LOGGER, OVERRIDES } from '../common/tokens';
import type { Env } from '../config/env';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { TurnstileVerifier } from './captcha';
import { AuthController } from './auth.controller';
import { AuthRequiredGuard, RateLimitGuard, SessionGuard } from './auth.guards';
import { AuthService } from './auth.service';
import { CleanupService } from './cleanup.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import type { Logger } from 'pino';

@Module({
  imports: [UsersModule, MailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    PasswordService,
    CleanupService,
    {
      provide: CAPTCHA_VERIFIER,
      inject: [ENV, LOGGER, OVERRIDES],
      useFactory: (env: Env, logger: Logger, overrides: AppOverrides) =>
        overrides.captchaVerifier ?? new TurnstileVerifier(env, logger),
    },
    // Global guards run in this order: rate limit, session + CSRF, authentication required.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: AuthRequiredGuard },
  ],
  exports: [SessionService],
})
export class AuthModule {}
