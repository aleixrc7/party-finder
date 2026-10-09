import { z } from 'zod';

/**
 * Known values of `ApiError.code`. Clients must still tolerate unknown codes
 * (the wire format types `code` as a plain string).
 */
export const ErrorCode = {
  /** 400: body, query or params failed schema validation. `details` is `ValidationErrorDetails`. */
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  /** 400: the CAPTCHA token was missing, expired or rejected. */
  CAPTCHA_FAILED: 'CAPTCHA_FAILED',
  /** 401: the endpoint requires a session and there is none. */
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  /** 401: login failed. Deliberately generic: never says whether the username exists. */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** 403: missing or invalid `X-CSRF-Token` header. */
  CSRF_INVALID: 'CSRF_INVALID',
  /** 403: authenticated, but not allowed to act on this resource. */
  FORBIDDEN: 'FORBIDDEN',
  /** 404: the resource does not exist (or the user is not attending, for attendance DELETE). */
  NOT_FOUND: 'NOT_FOUND',
  /** 409: username already registered (comparison is case-insensitive). */
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  /** 409: the template is used by at least one calendar entry and cannot be deleted. */
  TEMPLATE_IN_USE: 'TEMPLATE_IN_USE',
  /** 409: the day already has MAX_EVENTS_PER_DAY entries. */
  DAY_FULL: 'DAY_FULL',
  /** 409: the entry already has `capacity` attendees. */
  ENTRY_FULL: 'ENTRY_FULL',
  /** 409: the current user is already attending this entry. */
  ALREADY_ATTENDING: 'ALREADY_ATTENDING',
  /** 413: upload larger than MAX_IMAGE_BYTES. */
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  /** 415: upload is not one of ALLOWED_IMAGE_MIME_TYPES (checked on the real content). */
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  /** 429: rate limit exceeded. The response carries a `Retry-After` header. */
  RATE_LIMITED: 'RATE_LIMITED',
  /** 500: unexpected server error. Never leaks internals. */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** The single error format returned by every non-2xx response. */
export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** `details` of a `VALIDATION_ERROR`. `path` points to the offending field, e.g. `["capacity"]`. */
export const ValidationIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export const ValidationErrorDetailsSchema = z.object({
  issues: z.array(ValidationIssueSchema),
});
export type ValidationErrorDetails = z.infer<typeof ValidationErrorDetailsSchema>;

/** Converts a ZodError into `ValidationErrorDetails`, so front and back report issues the same way. */
export function toValidationErrorDetails(error: z.ZodError): ValidationErrorDetails {
  return {
    issues: error.issues.map((issue) => ({
      path: issue.path.map((segment) => (typeof segment === 'symbol' ? String(segment) : segment)),
      message: issue.message,
    })),
  };
}
