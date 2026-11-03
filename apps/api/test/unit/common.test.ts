/* eslint-disable @typescript-eslint/no-non-null-assertion -- assertions on test fixtures keep the tests short */
import { HttpException, NotFoundException } from '@nestjs/common';
import {
  CalendarQuerySchema,
  CreateCalendarEntryRequestSchema,
  ErrorCode,
} from '@party-finder/shared';
import { describe, expect, it, vi } from 'vitest';
import { CleanupService } from '../../src/auth/cleanup.service';
import { AllExceptionsFilter } from '../../src/common/all-exceptions.filter';
import { AppError, ERROR_MESSAGES } from '../../src/common/errors';
import { ZodPipe, parseWith } from '../../src/common/zod.pipe';
import { createLogger } from '../../src/common/logger';

function runFilter(exception: unknown) {
  const sent: { status?: number; body?: unknown; headers?: Record<string, string> } = {};
  const reply = {
    headers: (h: Record<string, string>) => {
      sent.headers = h;
      return reply;
    },
    status: (s: number) => {
      sent.status = s;
      return reply;
    },
    type: () => reply,
    send: (b: unknown) => {
      sent.body = b;
    },
  };
  const logger = { error: vi.fn() };
  new AllExceptionsFilter(logger as never).catch(exception, {
    switchToHttp: () => ({ getResponse: () => reply }),
  } as never);
  return { ...sent, logger };
}

describe('AllExceptionsFilter', () => {
  it('serialises AppError as { code, message, details? }', () => {
    expect(runFilter(AppError.conflict('DAY_FULL'))).toMatchObject({
      status: 409,
      body: { code: 'DAY_FULL', message: ERROR_MESSAGES.DAY_FULL },
    });
    const withDetails = runFilter(AppError.validation({ issues: [] }));
    expect(withDetails.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Datos no válidos',
      details: { issues: [] },
    });
    expect(Object.keys(runFilter(AppError.notFound()).body as object)).toEqual(['code', 'message']);
  });

  it('adds Retry-After to 429', () => {
    const out = runFilter(AppError.rateLimited(12.2));
    expect(out.status).toBe(429);
    expect(out.headers).toEqual({ 'Retry-After': '13' });
  });

  it('maps framework errors into the contract format', () => {
    expect(runFilter(new NotFoundException())).toMatchObject({
      status: 404,
      body: { code: 'NOT_FOUND' },
    });
    expect(runFilter(new HttpException('x', 405))).toMatchObject({ status: 404 });
    expect(runFilter(new HttpException('x', 413))).toMatchObject({
      status: 413,
      body: { code: 'PAYLOAD_TOO_LARGE' },
    });
    expect(runFilter(new HttpException('x', 422))).toMatchObject({
      status: 400,
      body: { code: 'VALIDATION_ERROR' },
    });
    expect(
      runFilter(
        Object.assign(new Error('x'), { code: 'FST_ERR_CTP_BODY_TOO_LARGE', statusCode: 413 }),
      ),
    ).toMatchObject({
      status: 413,
    });
    expect(
      runFilter(Object.assign(new Error('x'), { code: 'FST_REQ_FILE_TOO_LARGE', statusCode: 413 })),
    ).toMatchObject({
      status: 413,
    });
    expect(
      runFilter(
        Object.assign(new Error('x'), { code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE', statusCode: 415 }),
      ),
    ).toMatchObject({
      status: 400,
      body: { code: 'VALIDATION_ERROR' },
    });
  });

  it('answers 500 INTERNAL_ERROR without leaking the cause, and logs it', () => {
    const out = runFilter(new Error('password=hunter2 connection refused'));
    expect(out.status).toBe(500);
    expect(out.body).toEqual({
      code: ErrorCode.INTERNAL_ERROR,
      message: ERROR_MESSAGES.INTERNAL_ERROR,
    });
    expect(JSON.stringify(out.body)).not.toContain('hunter2');
    expect(out.logger.error).toHaveBeenCalled();
    expect(runFilter('a string was thrown').status).toBe(500);
  });
});

describe('ZodPipe', () => {
  it('returns parsed data (coercions and transforms applied)', () => {
    const pipe = new ZodPipe(CalendarQuerySchema);
    expect(pipe.transform({ from: '2031-01-01', to: '2031-01-10' })).toEqual({
      from: '2031-01-01',
      to: '2031-01-10',
    });
  });

  it('throws 400 VALIDATION_ERROR with issues and path', () => {
    const error = (() => {
      try {
        parseWith(CreateCalendarEntryRequestSchema, {
          templateId: 'x',
          date: '2031-01-01',
          capacity: 99,
          extra: 1,
        });
      } catch (e) {
        return e as AppError;
      }
    })()!;
    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(400);
    const issues = (error.details as { issues: { path: unknown[]; message: string }[] }).issues;
    expect(issues.some((i) => i.path[0] === 'capacity')).toBe(true);
    expect(issues.some((i) => i.path[0] === 'templateId')).toBe(true);
  });

  it('rejects unknown fields (strict schemas)', () => {
    expect(() =>
      parseWith(CreateCalendarEntryRequestSchema, {
        templateId: '00000000-0000-4000-8000-000000000000',
        date: '2031-01-01',
        capacity: 3,
        addedBy: 'x',
      }),
    ).toThrow();
  });
});

describe('CleanupService', () => {
  it('runs the stale-data cleanup and reports the counts', async () => {
    const users = { deleteStale: vi.fn().mockResolvedValue({ users: 3, tokens: 7 }) };
    const logger = { info: vi.fn(), error: vi.fn() };
    const service = new CleanupService(users as never, logger as never);
    expect(await service.run()).toEqual({ users: 3, tokens: 7 });
    expect(logger.info).toHaveBeenCalledWith({ users: 3, tokens: 7 }, expect.any(String));
  });

  it('never crashes the scheduler when the database fails', async () => {
    const users = { deleteStale: vi.fn().mockRejectedValue(new Error('db down')) };
    const logger = { info: vi.fn(), error: vi.fn() };
    expect(await new CleanupService(users as never, logger as never).run()).toEqual({
      users: 0,
      tokens: 0,
    });
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('logger redaction', () => {
  it('censors cookies, authorization, CSRF headers and credential-like fields', () => {
    const lines: string[] = [];
    const logger = createLogger('info', { write: (chunk: string) => void lines.push(chunk) });
    logger.info(
      {
        req: {
          headers: {
            cookie: 'pf_session=SECRETSESSION',
            authorization: 'Bearer SECRETBEARER',
            'x-csrf-token': 'SECRETCSRF',
          },
        },
        res: { headers: { 'set-cookie': 'pf_session=SECRETSET' } },
        body: { password: 'SECRETPASS', token: 'SECRETTOKEN', captchaToken: 'SECRETCAPTCHA' },
        user: { password: 'SECRETPASS2' },
      },
      'request',
    );
    const out = lines.join('');
    for (const secret of [
      'SECRETSESSION',
      'SECRETBEARER',
      'SECRETCSRF',
      'SECRETSET',
      'SECRETTOKEN',
      'SECRETCAPTCHA',
      'SECRETPASS2',
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('[redacted]');
  });
});
