import { ErrorCode, ValidationErrorDetailsSchema } from '@party-finder/shared';

export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';
const NETWORK_ERROR_MESSAGE = 'No se pudo conectar con el servidor. Inténtalo de nuevo.';
const UNEXPECTED_ERROR_MESSAGE = 'Ha ocurrido un error inesperado. Inténtalo de nuevo.';

interface ApiRequestErrorInit {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  retryAfterSeconds?: number | null;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly retryAfterSeconds: number | null;

  constructor({ status, code, message, details, retryAfterSeconds = null }: ApiRequestErrorInit) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function networkError() {
  return new ApiRequestError({
    status: 0,
    code: NETWORK_ERROR_CODE,
    message: NETWORK_ERROR_MESSAGE,
  });
}

export function unexpectedError(status: number) {
  return new ApiRequestError({
    status,
    code: ErrorCode.INTERNAL_ERROR,
    message: UNEXPECTED_ERROR_MESSAGE,
  });
}

export function hasErrorCode(error: unknown, code: string) {
  return error instanceof ApiRequestError && error.code === code;
}

function formatWait(seconds: number) {
  return seconds < 60 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`;
}

export function errorMessage(error: unknown) {
  if (!(error instanceof ApiRequestError)) {
    return UNEXPECTED_ERROR_MESSAGE;
  }
  if (error.code === ErrorCode.RATE_LIMITED && error.retryAfterSeconds) {
    return `${error.message} (espera ${formatWait(error.retryAfterSeconds)})`;
  }
  return error.message;
}

export function fieldErrors(error: unknown) {
  if (!hasErrorCode(error, ErrorCode.VALIDATION_ERROR)) {
    return [];
  }
  const details = ValidationErrorDetailsSchema.safeParse((error as ApiRequestError).details);
  if (!details.success) {
    return [];
  }
  return details.data.issues.flatMap(({ path, message }) => {
    const field = path[0];
    return typeof field === 'string' ? [{ field, message }] : [];
  });
}
