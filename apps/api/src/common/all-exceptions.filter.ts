import { Catch, HttpException, Inject } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { ErrorCode } from '@party-finder/shared';
import type { ApiError } from '@party-finder/shared';
import type { FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { AppError, ERROR_MESSAGES } from './errors';
import { LOGGER } from './tokens';

interface Mapped {
  status: number;
  body: ApiError;
  headers?: Record<string, string>;
}

function body(code: ErrorCode, message: string, details?: unknown): ApiError {
  return details === undefined ? { code, message } : { code, message, details };
}

/** Maps framework (Fastify / Nest) errors that do not come from our own code. */
function mapForeign(exception: unknown): Mapped | null {
  const err = exception as { code?: string; statusCode?: number; status?: number } | null;
  if (!err || typeof err !== 'object') return null;

  if (err.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || err.code === 'FST_REQ_FILE_TOO_LARGE') {
    return {
      status: 413,
      body: body(ErrorCode.PAYLOAD_TOO_LARGE, ERROR_MESSAGES.PAYLOAD_TOO_LARGE),
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status === 404 || status === 405) {
      return { status: 404, body: body(ErrorCode.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND) };
    }
    if (status === 413) {
      return {
        status: 413,
        body: body(ErrorCode.PAYLOAD_TOO_LARGE, ERROR_MESSAGES.PAYLOAD_TOO_LARGE),
      };
    }
    if (status >= 400 && status < 500) {
      return {
        status: 400,
        body: body(ErrorCode.VALIDATION_ERROR, ERROR_MESSAGES.VALIDATION_ERROR),
      };
    }
    return null;
  }
  // Fastify parser errors (invalid JSON, wrong content type, missing multipart, ...) are 4xx.
  const status = err.statusCode ?? err.status;
  if (typeof err.code === 'string' && err.code.startsWith('FST_') && status && status < 500) {
    return {
      status: 400,
      body: body(ErrorCode.VALIDATION_ERROR, ERROR_MESSAGES.VALIDATION_ERROR),
    };
  }
  if (exception instanceof SyntaxError && status === 400) {
    return {
      status: 400,
      body: body(ErrorCode.VALIDATION_ERROR, ERROR_MESSAGES.VALIDATION_ERROR),
    };
  }
  return null;
}

/** The single error format of the contract: `{ code, message, details? }`. Never leaks internals. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    let mapped: Mapped;

    if (exception instanceof AppError) {
      mapped = {
        status: exception.status,
        body: body(exception.code, exception.message, exception.details),
        headers: exception.headers,
      };
    } else {
      const foreign = mapForeign(exception);
      if (foreign) {
        mapped = foreign;
      } else {
        // Log the class and message only: never request bodies, cookies or tokens.
        const err = exception instanceof Error ? exception : new Error('Non-error thrown');
        this.logger.error(
          { err: { name: err.name, message: err.message, stack: err.stack } },
          'Unhandled error',
        );
        mapped = {
          status: 500,
          body: body(ErrorCode.INTERNAL_ERROR, ERROR_MESSAGES.INTERNAL_ERROR),
        };
      }
    }

    if (mapped.headers) void reply.headers(mapped.headers);
    void reply.status(mapped.status).type('application/json; charset=utf-8').send(mapped.body);
  }
}
