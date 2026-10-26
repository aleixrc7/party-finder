import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AUTH_MESSAGES,
  ApiErrorSchema,
  CalendarEntrySchema,
  CalendarQuerySchema,
  CreateCalendarEntryRequestSchema,
  CreateEventTemplateRequestSchema,
  EMAIL_MAX_LENGTH,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  EmailSchema,
  ErrorCode,
  EventTemplatePageSchema,
  LoginRequestSchema,
  MAX_CAPACITY,
  MeResponseSchema,
  PaginationQuerySchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
  ResendVerificationRequestSchema,
  ResendVerificationResponseSchema,
  UNVERIFIED_ACCOUNT_TTL_DAYS,
  UpdateEventTemplateRequestSchema,
  VERIFICATION_TOKEN_MAX_LENGTH,
  VERIFICATION_TOKEN_TTL_HOURS,
  VerifyEmailRequestSchema,
  VerifyEmailResponseSchema,
  daysInRangeInclusive,
  toValidationErrorDetails,
} from '../src';

const UUID = '3f2a6c1e-8b4d-4e2f-9a7b-1c2d3e4f5a6b';

describe('EventType', () => {
  it('has a Spanish label for every value', () => {
    expect(Object.keys(EVENT_TYPE_LABELS).sort()).toEqual([...EVENT_TYPES].sort());
    expect(EVENT_TYPE_LABELS.DND).toBe('D&D');
    expect(EVENT_TYPE_LABELS.PELUQUERIA).toBe('Peluquería');
  });
});

describe('EmailSchema', () => {
  it('trims and lowercases', () => {
    expect(EmailSchema.parse('  Ana.Garcia@Example.COM ')).toBe('ana.garcia@example.com');
  });

  it('accepts exactly 254 characters and rejects 255', () => {
    const domain = '@example.com';
    const at254 = `${'a'.repeat(64)}.${'b'.repeat(254 - 65 - domain.length)}${domain}`;
    expect(at254).toHaveLength(EMAIL_MAX_LENGTH);
    expect(EmailSchema.safeParse(at254).success).toBe(true);
    expect(EmailSchema.safeParse(`c${at254}`).success).toBe(false);
  });

  it.each(['', 'ana', 'ana@', '@example.com', 'ana@example', 'ana @example.com', 'a@b@c.com'])(
    'rejects %j',
    (email) => {
      expect(EmailSchema.safeParse(email).success).toBe(false);
    },
  );
});

describe('RegisterRequestSchema', () => {
  const valid = {
    username: 'ana_01-x',
    email: 'ana@example.com',
    password: 'secret123',
    captchaToken: 'tok',
  };

  it('accepts a valid body', () => {
    expect(RegisterRequestSchema.parse(valid)).toEqual(valid);
  });

  it('normalizes the email', () => {
    expect(RegisterRequestSchema.parse({ ...valid, email: ' ANA@Example.com' }).email).toBe(
      'ana@example.com',
    );
  });

  it('requires a valid email', () => {
    const { email: _email, ...withoutEmail } = valid;
    expect(RegisterRequestSchema.safeParse(withoutEmail).success).toBe(false);
    expect(RegisterRequestSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(
      false,
    );
  });

  it.each(['ab', 'a'.repeat(31), 'con espacio', 'ñandú', 'ana!'])(
    'rejects username %j',
    (username) => {
      expect(RegisterRequestSchema.safeParse({ ...valid, username }).success).toBe(false);
    },
  );

  it('rejects short passwords and missing captcha', () => {
    expect(RegisterRequestSchema.safeParse({ ...valid, password: '1234567' }).success).toBe(false);
    expect(RegisterRequestSchema.safeParse({ ...valid, captchaToken: '' }).success).toBe(false);
  });

  it('rejects unknown fields', () => {
    expect(RegisterRequestSchema.safeParse({ ...valid, isAdmin: true }).success).toBe(false);
  });
});

describe('generic 202 responses', () => {
  it('register and resend-verification share the exact same body', () => {
    const body = { message: AUTH_MESSAGES.VERIFICATION_EMAIL_SENT };
    expect(RegisterResponseSchema.parse(body)).toEqual(body);
    expect(ResendVerificationResponseSchema.parse(body)).toEqual(body);
  });

  it('rejects any other text and never carries the user', () => {
    expect(RegisterResponseSchema.safeParse({ message: 'Usuario creado' }).success).toBe(false);
    expect(
      RegisterResponseSchema.parse({
        message: AUTH_MESSAGES.VERIFICATION_EMAIL_SENT,
        user: { id: UUID, username: 'ana' },
      }),
    ).toEqual({ message: AUTH_MESSAGES.VERIFICATION_EMAIL_SENT });
  });
});

describe('VerifyEmailRequestSchema', () => {
  const token = 'q7Lr0b6m3JxZQ1n9vYk2pT8sWfE4hA5cD0gU-iO_aBc';

  it('accepts a token in the body', () => {
    expect(token).toHaveLength(43);
    expect(VerifyEmailRequestSchema.parse({ token })).toEqual({ token });
  });

  it('checks only the shape (malformed tokens are INVALID_OR_EXPIRED_TOKEN, not 400 validation)', () => {
    expect(VerifyEmailRequestSchema.safeParse({ token: 'short!' }).success).toBe(true);
  });

  it('rejects a missing, empty, oversized or non-string token and unknown fields', () => {
    expect(VerifyEmailRequestSchema.safeParse({}).success).toBe(false);
    expect(VerifyEmailRequestSchema.safeParse({ token: '' }).success).toBe(false);
    expect(
      VerifyEmailRequestSchema.safeParse({ token: 'x'.repeat(VERIFICATION_TOKEN_MAX_LENGTH + 1) })
        .success,
    ).toBe(false);
    expect(VerifyEmailRequestSchema.safeParse({ token: 123 }).success).toBe(false);
    expect(VerifyEmailRequestSchema.safeParse({ token, email: 'a@b.co' }).success).toBe(false);
  });

  it('pins the success message', () => {
    expect(
      VerifyEmailResponseSchema.safeParse({ message: AUTH_MESSAGES.EMAIL_VERIFIED }).success,
    ).toBe(true);
    expect(VerifyEmailResponseSchema.safeParse({ message: 'OK' }).success).toBe(false);
  });
});

describe('ResendVerificationRequestSchema', () => {
  it('normalizes the email and rejects anything else', () => {
    expect(ResendVerificationRequestSchema.parse({ email: 'Bruno@Example.com ' })).toEqual({
      email: 'bruno@example.com',
    });
    expect(ResendVerificationRequestSchema.safeParse({ email: 'bruno' }).success).toBe(false);
    expect(
      ResendVerificationRequestSchema.safeParse({ email: 'bruno@example.com', username: 'b' })
        .success,
    ).toBe(false);
  });
});

describe('verification constants', () => {
  it('match the plan', () => {
    expect(VERIFICATION_TOKEN_TTL_HOURS).toBe(24);
    expect(UNVERIFIED_ACCOUNT_TTL_DAYS).toBe(7);
    expect(ErrorCode.EMAIL_NOT_VERIFIED).toBe('EMAIL_NOT_VERIFIED');
    expect(ErrorCode.INVALID_OR_EXPIRED_TOKEN).toBe('INVALID_OR_EXPIRED_TOKEN');
  });
});

describe('LoginRequestSchema', () => {
  it('does not apply username rules (generic 401 instead of 400)', () => {
    expect(LoginRequestSchema.safeParse({ username: 'a b', password: 'x' }).success).toBe(true);
  });
});

describe('MeResponseSchema', () => {
  it('accepts null user', () => {
    expect(MeResponseSchema.parse({ user: null })).toEqual({ user: null });
  });
});

describe('CreateEventTemplateRequestSchema', () => {
  const minimal = { name: 'LAN', description: 'Trae tu PC', type: 'LAN_PARTY' };

  it('accepts the minimal body and trims text', () => {
    expect(CreateEventTemplateRequestSchema.parse({ ...minimal, name: '  LAN  ' }).name).toBe(
      'LAN',
    );
  });

  it('accepts optional fields and null', () => {
    const body = {
      ...minimal,
      imageUrl: 'http://localhost:9000/party-finder-images/a.webp',
      attendees: 10,
      startTime: '22:00',
      endTime: '02:30',
    };
    expect(CreateEventTemplateRequestSchema.parse(body)).toEqual(body);
    expect(
      CreateEventTemplateRequestSchema.safeParse({ ...minimal, attendees: null }).success,
    ).toBe(true);
  });

  it.each([
    ['blank name', { name: '   ' }],
    ['name too long', { name: 'x'.repeat(81) }],
    ['description too long', { description: 'x'.repeat(1001) }],
    ['unknown type', { type: 'FIESTA' }],
    ['attendees 0', { attendees: 0 }],
    ['attendees 11', { attendees: MAX_CAPACITY + 1 }],
    ['attendees decimal', { attendees: 2.5 }],
    ['time 24:00', { startTime: '24:00' }],
    ['time 9:00', { endTime: '9:00' }],
    ['javascript url', { imageUrl: 'javascript:alert(1)' }],
    ['unknown field', { ownerId: UUID }],
  ])('rejects %s', (_label, patch) => {
    expect(CreateEventTemplateRequestSchema.safeParse({ ...minimal, ...patch }).success).toBe(
      false,
    );
  });
});

describe('UpdateEventTemplateRequestSchema', () => {
  it('accepts a partial update and null to clear', () => {
    expect(UpdateEventTemplateRequestSchema.parse({ imageUrl: null })).toEqual({ imageUrl: null });
  });

  it('rejects an empty body and null on required fields', () => {
    expect(UpdateEventTemplateRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdateEventTemplateRequestSchema.safeParse({ name: null }).success).toBe(false);
  });
});

describe('PaginationQuerySchema', () => {
  it('coerces query strings and applies defaults', () => {
    expect(PaginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(PaginationQuerySchema.parse({ page: '3', pageSize: '50' })).toEqual({
      page: 3,
      pageSize: 50,
    });
  });

  it('caps pageSize at 50', () => {
    expect(PaginationQuerySchema.safeParse({ pageSize: '51' }).success).toBe(false);
    expect(PaginationQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('CalendarQuerySchema', () => {
  it('accepts a 42-day range (inclusive)', () => {
    expect(daysInRangeInclusive('2026-09-28', '2026-11-08')).toBe(42);
    expect(CalendarQuerySchema.safeParse({ from: '2026-09-28', to: '2026-11-08' }).success).toBe(
      true,
    );
  });

  it('accepts a single day', () => {
    expect(CalendarQuerySchema.safeParse({ from: '2026-10-09', to: '2026-10-09' }).success).toBe(
      true,
    );
  });

  it('rejects 43 days, reversed ranges and impossible dates', () => {
    expect(CalendarQuerySchema.safeParse({ from: '2026-09-28', to: '2026-11-09' }).success).toBe(
      false,
    );
    expect(CalendarQuerySchema.safeParse({ from: '2026-10-10', to: '2026-10-09' }).success).toBe(
      false,
    );
    expect(CalendarQuerySchema.safeParse({ from: '2026-02-30', to: '2026-03-01' }).success).toBe(
      false,
    );
  });

  it('handles DST changes and leap years', () => {
    expect(daysInRangeInclusive('2026-03-01', '2026-03-31')).toBe(31);
    expect(daysInRangeInclusive('2028-02-01', '2028-02-29')).toBe(29);
  });
});

describe('CreateCalendarEntryRequestSchema', () => {
  it('validates capacity bounds', () => {
    const body = { templateId: UUID, date: '2026-10-12', capacity: 1 };
    expect(CreateCalendarEntryRequestSchema.safeParse(body).success).toBe(true);
    expect(CreateCalendarEntryRequestSchema.safeParse({ ...body, capacity: 0 }).success).toBe(
      false,
    );
    expect(CreateCalendarEntryRequestSchema.safeParse({ ...body, capacity: 11 }).success).toBe(
      false,
    );
    expect(
      CreateCalendarEntryRequestSchema.safeParse({ ...body, date: '2026-10-12T00:00:00Z' }).success,
    ).toBe(false);
  });
});

describe('response schemas', () => {
  const user = { id: UUID, username: 'ana' };
  const template = {
    id: UUID,
    owner: user,
    name: 'LAN',
    description: 'Trae tu PC',
    type: 'LAN_PARTY',
    imageUrl: null,
    attendees: 6,
    startTime: '18:00',
    endTime: null,
    createdAt: '2026-10-09T10:00:00.000Z',
    updatedAt: '2026-10-09T10:00:00.000Z',
  };

  it('parses a calendar entry', () => {
    const entry = {
      id: UUID,
      date: '2026-10-12',
      capacity: 6,
      attendeeCount: 1,
      attendees: [user],
      addedBy: user,
      template,
      createdAt: '2026-10-09T10:00:00.000Z',
      isAttending: true,
      canDelete: true,
    };
    expect(CalendarEntrySchema.parse(entry)).toEqual(entry);
  });

  it('parses a template page', () => {
    const page = { items: [template], page: 1, pageSize: 20, total: 1, totalPages: 1 };
    expect(EventTemplatePageSchema.parse(page)).toEqual(page);
  });
});

describe('errors', () => {
  it('ApiError allows optional details', () => {
    expect(ApiErrorSchema.safeParse({ code: 'DAY_FULL', message: 'x' }).success).toBe(true);
    expect(ApiErrorSchema.safeParse({ message: 'x' }).success).toBe(false);
  });

  it('converts Zod issues into ValidationErrorDetails', () => {
    const result = z.object({ capacity: z.number().max(10) }).safeParse({ capacity: 11 });
    expect(result.success).toBe(false);
    if (result.success) return;
    const details = toValidationErrorDetails(result.error);
    expect(details.issues).toHaveLength(1);
    expect(details.issues[0]?.path).toEqual(['capacity']);
  });
});
