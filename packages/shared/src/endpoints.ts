import type { z } from 'zod';
import {
  LoginRequestSchema,
  LoginResponseSchema,
  CsrfResponseSchema,
  MeResponseSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
  ResendVerificationRequestSchema,
  ResendVerificationResponseSchema,
  VerifyEmailRequestSchema,
  VerifyEmailResponseSchema,
} from './auth';
import {
  AttendResponseSchema,
  CalendarQuerySchema,
  CalendarResponseSchema,
  CreateCalendarEntryRequestSchema,
  CreateCalendarEntryResponseSchema,
} from './calendar';
import { IdParamsSchema } from './common';
import { ErrorCode } from './errors';
import {
  CreateEventTemplateRequestSchema,
  EventTemplatePageSchema,
  EventTemplateSchema,
  ListEventTemplatesQuerySchema,
  UpdateEventTemplateRequestSchema,
} from './event-templates';
import { UploadImageResponseSchema } from './uploads';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * - `public`: no session needed (may still personalise the response if there is one).
 * - `authenticated`: any logged-in user, otherwise 401.
 * - `owner`: the template's owner, otherwise 403.
 * - `creator`: the user who added the calendar entry, otherwise 403.
 */
export type EndpointAccess = 'public' | 'authenticated' | 'owner' | 'creator';

export interface EndpointDef {
  method: HttpMethod;
  /** OpenAPI-style path (`{id}`), exactly as in docs/openapi.yaml. */
  path: string;
  access: EndpointAccess;
  /** Whether the request must carry the `X-CSRF-Token` header. */
  csrf: boolean;
  params?: z.ZodType;
  query?: z.ZodType;
  /** JSON body schema, or `'multipart'` for file uploads. */
  body?: z.ZodType | 'multipart';
  success: {
    status: 200 | 201 | 202 | 204;
    /** `null` means no body (204). */
    schema: z.ZodType | null;
  };
  /** Error statuses this endpoint can return, with the `ApiError.code` values for each. */
  errors: Partial<Record<400 | 401 | 403 | 404 | 409 | 413 | 415 | 429, readonly ErrorCode[]>>;
}

const { VALIDATION_ERROR, UNAUTHENTICATED, CSRF_INVALID, FORBIDDEN, NOT_FOUND } = ErrorCode;

/** Machine-readable index of the contract. Kept in sync with docs/openapi.yaml by a test. */
export const endpoints = {
  /** No session is opened. 202 is identical whether or not the email already exists. */
  register: {
    method: 'POST',
    path: '/auth/register',
    access: 'public',
    csrf: true,
    body: RegisterRequestSchema,
    success: { status: 202, schema: RegisterResponseSchema },
    errors: {
      400: [VALIDATION_ERROR, ErrorCode.CAPTCHA_FAILED],
      403: [CSRF_INVALID],
      409: [ErrorCode.USERNAME_TAKEN],
      429: [ErrorCode.RATE_LIMITED],
    },
  },
  /** No session is opened. Any token problem is the same 400 INVALID_OR_EXPIRED_TOKEN. */
  verifyEmail: {
    method: 'POST',
    path: '/auth/verify-email',
    access: 'public',
    csrf: true,
    body: VerifyEmailRequestSchema,
    success: { status: 200, schema: VerifyEmailResponseSchema },
    errors: {
      400: [ErrorCode.INVALID_OR_EXPIRED_TOKEN, VALIDATION_ERROR],
      403: [CSRF_INVALID],
      429: [ErrorCode.RATE_LIMITED],
    },
  },
  /** 202 is identical whether the email is unknown, unverified or already verified. */
  resendVerification: {
    method: 'POST',
    path: '/auth/resend-verification',
    access: 'public',
    csrf: true,
    body: ResendVerificationRequestSchema,
    success: { status: 202, schema: ResendVerificationResponseSchema },
    errors: {
      400: [VALIDATION_ERROR],
      403: [CSRF_INVALID],
      429: [ErrorCode.RATE_LIMITED],
    },
  },
  /** 403 EMAIL_NOT_VERIFIED only after the password has been validated. */
  login: {
    method: 'POST',
    path: '/auth/login',
    access: 'public',
    csrf: true,
    body: LoginRequestSchema,
    success: { status: 200, schema: LoginResponseSchema },
    errors: {
      400: [VALIDATION_ERROR],
      401: [ErrorCode.INVALID_CREDENTIALS],
      403: [CSRF_INVALID, ErrorCode.EMAIL_NOT_VERIFIED],
      429: [ErrorCode.RATE_LIMITED],
    },
  },
  logout: {
    method: 'POST',
    path: '/auth/logout',
    access: 'authenticated',
    csrf: true,
    success: { status: 204, schema: null },
    errors: { 401: [UNAUTHENTICATED], 403: [CSRF_INVALID] },
  },
  getMe: {
    method: 'GET',
    path: '/auth/me',
    access: 'public',
    csrf: false,
    success: { status: 200, schema: MeResponseSchema },
    errors: {},
  },
  getCsrfToken: {
    method: 'GET',
    path: '/auth/csrf',
    access: 'public',
    csrf: false,
    success: { status: 200, schema: CsrfResponseSchema },
    errors: {},
  },
  listEventTemplates: {
    method: 'GET',
    path: '/event-templates',
    access: 'authenticated',
    csrf: false,
    query: ListEventTemplatesQuerySchema,
    success: { status: 200, schema: EventTemplatePageSchema },
    errors: { 400: [VALIDATION_ERROR], 401: [UNAUTHENTICATED] },
  },
  createEventTemplate: {
    method: 'POST',
    path: '/event-templates',
    access: 'authenticated',
    csrf: true,
    body: CreateEventTemplateRequestSchema,
    success: { status: 201, schema: EventTemplateSchema },
    errors: { 400: [VALIDATION_ERROR], 401: [UNAUTHENTICATED], 403: [CSRF_INVALID] },
  },
  updateEventTemplate: {
    method: 'PATCH',
    path: '/event-templates/{id}',
    access: 'owner',
    csrf: true,
    params: IdParamsSchema,
    body: UpdateEventTemplateRequestSchema,
    success: { status: 200, schema: EventTemplateSchema },
    errors: {
      400: [VALIDATION_ERROR],
      401: [UNAUTHENTICATED],
      403: [CSRF_INVALID, FORBIDDEN],
      404: [NOT_FOUND],
    },
  },
  deleteEventTemplate: {
    method: 'DELETE',
    path: '/event-templates/{id}',
    access: 'owner',
    csrf: true,
    params: IdParamsSchema,
    success: { status: 204, schema: null },
    errors: {
      400: [VALIDATION_ERROR],
      401: [UNAUTHENTICATED],
      403: [CSRF_INVALID, FORBIDDEN],
      404: [NOT_FOUND],
      409: [ErrorCode.TEMPLATE_IN_USE],
    },
  },
  uploadImage: {
    method: 'POST',
    path: '/uploads/image',
    access: 'authenticated',
    csrf: true,
    body: 'multipart',
    success: { status: 201, schema: UploadImageResponseSchema },
    errors: {
      400: [VALIDATION_ERROR],
      401: [UNAUTHENTICATED],
      403: [CSRF_INVALID],
      413: [ErrorCode.PAYLOAD_TOO_LARGE],
      415: [ErrorCode.UNSUPPORTED_MEDIA_TYPE],
    },
  },
  getCalendar: {
    method: 'GET',
    path: '/calendar',
    access: 'public',
    csrf: false,
    query: CalendarQuerySchema,
    success: { status: 200, schema: CalendarResponseSchema },
    errors: { 400: [VALIDATION_ERROR] },
  },
  createCalendarEntry: {
    method: 'POST',
    path: '/calendar/entries',
    access: 'authenticated',
    csrf: true,
    body: CreateCalendarEntryRequestSchema,
    success: { status: 201, schema: CreateCalendarEntryResponseSchema },
    errors: {
      400: [VALIDATION_ERROR],
      401: [UNAUTHENTICATED],
      403: [CSRF_INVALID],
      404: [NOT_FOUND],
      409: [ErrorCode.DAY_FULL],
    },
  },
  deleteCalendarEntry: {
    method: 'DELETE',
    path: '/calendar/entries/{id}',
    access: 'creator',
    csrf: true,
    params: IdParamsSchema,
    success: { status: 204, schema: null },
    errors: {
      400: [VALIDATION_ERROR],
      401: [UNAUTHENTICATED],
      403: [CSRF_INVALID, FORBIDDEN],
      404: [NOT_FOUND],
    },
  },
  attend: {
    method: 'POST',
    path: '/calendar/entries/{id}/attendance',
    access: 'authenticated',
    csrf: true,
    params: IdParamsSchema,
    success: { status: 201, schema: AttendResponseSchema },
    errors: {
      400: [VALIDATION_ERROR],
      401: [UNAUTHENTICATED],
      403: [CSRF_INVALID],
      404: [NOT_FOUND],
      409: [ErrorCode.ENTRY_FULL, ErrorCode.ALREADY_ATTENDING],
    },
  },
  unattend: {
    method: 'DELETE',
    path: '/calendar/entries/{id}/attendance',
    access: 'authenticated',
    csrf: true,
    params: IdParamsSchema,
    success: { status: 204, schema: null },
    errors: {
      400: [VALIDATION_ERROR],
      401: [UNAUTHENTICATED],
      403: [CSRF_INVALID],
      404: [NOT_FOUND],
    },
  },
} as const satisfies Record<string, EndpointDef>;

export type EndpointName = keyof typeof endpoints;
