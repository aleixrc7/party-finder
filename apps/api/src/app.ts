import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { CSRF_HEADER, MAX_IMAGE_BYTES } from '@party-finder/shared';
import type { Logger } from 'pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import type { AppOverrides } from './common/core.module';
import { createLogger, PinoNestLogger } from './common/logger';
import type { Env } from './config/env';

/** 1 MB for JSON bodies. File uploads are streamed and capped separately (5 MB). */
export const BODY_LIMIT_BYTES = 1024 * 1024;

export interface CreateAppOptions {
  env: Env;
  overrides?: AppOverrides;
  /** Defaults to a pino logger at `env.LOG_LEVEL`. */
  logger?: Logger;
}

/** Builds the fully configured application (does not listen). Shared by `main.ts` and tests. */
export async function createApp(options: CreateAppOptions): Promise<NestFastifyApplication> {
  const { env } = options;
  const logger = options.logger ?? createLogger(env.LOG_LEVEL);

  const adapter = new FastifyAdapter({
    loggerInstance: logger,
    bodyLimit: BODY_LIMIT_BYTES,
    // Forwarded headers are interpreted by our own ClientIpResolver (TRUSTED_PROXIES), not Fastify.
    trustProxy: false,
  });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env, logger, options.overrides ?? {}),
    adapter,
    { logger: new PinoNestLogger(logger), abortOnError: false },
  );

  app.useGlobalFilters(new AllExceptionsFilter(logger));

  // A POST/DELETE without a body but with `Content-Type: application/json` (typical for
  // `fetch(..., { method: 'POST', headers })`) must not fail JSON parsing.
  adapter.getInstance().addHook('onRequest', (req, _reply, done) => {
    const type = req.headers['content-type'];
    if (req.headers['content-length'] === '0' && type?.startsWith('application/json')) {
      delete req.headers['content-type'];
    }
    done();
  });

  await app.register(fastifyHelmet);
  await app.register(fastifyCookie);
  await app.register(fastifyCors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', CSRF_HEADER],
    maxAge: 600,
  });
  await app.register(fastifyMultipart, {
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 2 },
  });

  app.enableShutdownHooks();
  return app;
}
