import type { LoggerService } from '@nestjs/common';
import pino from 'pino';
import type { DestinationStream, Logger } from 'pino';

/** Paths never written to logs, whatever the log level. Bodies are never logged at all. */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'headers.cookie',
  'headers.authorization',
  'headers["x-csrf-token"]',
  '*.password',
  '*.token',
  '*.captchaToken',
];

export function createLogger(level: string, stream?: DestinationStream): Logger {
  return pino({ level, redact: { paths: REDACT_PATHS, censor: '[redacted]' } }, stream);
}

/** Lets NestJS internals log through the same pino instance. */
export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}
  log(message: unknown, context?: string): void {
    this.logger.info({ context }, String(message));
  }
  error(message: unknown, ...rest: unknown[]): void {
    this.logger.error({ context: rest.at(-1) }, String(message));
  }
  warn(message: unknown, context?: string): void {
    this.logger.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string): void {
    this.logger.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string): void {
    this.logger.trace({ context }, String(message));
  }
}
