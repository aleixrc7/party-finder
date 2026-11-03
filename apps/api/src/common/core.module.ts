import { Global, Inject, Module } from '@nestjs/common';
import type { DynamicModule, OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { CaptchaVerifier } from '../auth/captcha';
import type { Env } from '../config/env';
import type { MailSender } from '../mail/mail-sender';
import type { ObjectStorage } from '../uploads/object-storage';
import { ClientIpResolver } from './client-ip';
import { PrismaService } from './prisma.service';
import { RateLimitService } from './rate-limit.service';
import { ENV, LOGGER, OVERRIDES, REDIS } from './tokens';

/** Replaceable collaborators, so tests can run without SMTP, Cloudflare or S3. */
export interface AppOverrides {
  mailSender?: MailSender;
  captchaVerifier?: CaptchaVerifier;
  objectStorage?: ObjectStorage;
}

export const CLIENT_IP = Symbol('CLIENT_IP');

@Global()
@Module({})
export class CoreModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  static forRoot(env: Env, logger: Logger, overrides: AppOverrides): DynamicModule {
    const providers = [
      { provide: ENV, useValue: env },
      { provide: LOGGER, useValue: logger },
      { provide: OVERRIDES, useValue: overrides },
      {
        provide: REDIS,
        useFactory: () =>
          new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, enableReadyCheck: true }),
      },
      { provide: CLIENT_IP, useValue: new ClientIpResolver(env.TRUSTED_PROXIES) },
      PrismaService,
      RateLimitService,
    ];
    return {
      module: CoreModule,
      providers,
      exports: [ENV, LOGGER, OVERRIDES, REDIS, CLIENT_IP, PrismaService, RateLimitService],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    this.redis.disconnect();
  }
}
