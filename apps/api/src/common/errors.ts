import { ErrorCode, MAX_EVENTS_PER_DAY, MAX_IMAGE_BYTES } from '@party-finder/shared';

/** Spanish user-facing texts for each error code (the ones in docs/openapi.yaml). */
export const ERROR_MESSAGES = {
  VALIDATION_ERROR: 'Datos no válidos',
  CAPTCHA_FAILED: 'No se pudo verificar el CAPTCHA',
  UNAUTHENTICATED: 'Debes iniciar sesión',
  CSRF_INVALID: 'Token CSRF no válido',
  FORBIDDEN: 'No tienes permiso para esta acción',
  NOT_FOUND: 'No encontrado',
  USERNAME_TAKEN: 'Ese nombre de usuario ya está en uso',
  TEMPLATE_IN_USE: 'La plantilla está en uso en el calendario',
  DAY_FULL: `Este día ya tiene ${MAX_EVENTS_PER_DAY} eventos`,
  ENTRY_FULL: 'El evento está completo',
  ALREADY_ATTENDING: 'Ya estás apuntado a este evento',
  PAYLOAD_TOO_LARGE: `El archivo supera los ${MAX_IMAGE_BYTES / (1024 * 1024)} MB`,
  UNSUPPORTED_MEDIA_TYPE: 'Solo se admiten imágenes JPEG, PNG o WebP',
  RATE_LIMITED: 'Demasiados intentos, prueba más tarde',
  INTERNAL_ERROR: 'Error interno del servidor',
} as const;

type ConflictCode =
  'USERNAME_TAKEN' | 'TEMPLATE_IN_USE' | 'DAY_FULL' | 'ENTRY_FULL' | 'ALREADY_ATTENDING';

/** An error that maps 1:1 to the contract's `{ code, message, details? }` format. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static validation(details: unknown): AppError {
    return new AppError(400, ErrorCode.VALIDATION_ERROR, ERROR_MESSAGES.VALIDATION_ERROR, details);
  }
  /** A validation error on a single field, in the same shape as schema errors. */
  static invalidField(path: string, message: string): AppError {
    return AppError.validation({ issues: [{ path: [path], message }] });
  }
  static captchaFailed(): AppError {
    return new AppError(400, ErrorCode.CAPTCHA_FAILED, ERROR_MESSAGES.CAPTCHA_FAILED);
  }
  static unauthenticated(): AppError {
    return new AppError(401, ErrorCode.UNAUTHENTICATED, ERROR_MESSAGES.UNAUTHENTICATED);
  }
  static csrfInvalid(): AppError {
    return new AppError(403, ErrorCode.CSRF_INVALID, ERROR_MESSAGES.CSRF_INVALID);
  }
  static forbidden(): AppError {
    return new AppError(403, ErrorCode.FORBIDDEN, ERROR_MESSAGES.FORBIDDEN);
  }
  static notFound(): AppError {
    return new AppError(404, ErrorCode.NOT_FOUND, ERROR_MESSAGES.NOT_FOUND);
  }
  static conflict(code: ConflictCode): AppError {
    return new AppError(409, ErrorCode[code], ERROR_MESSAGES[code]);
  }
  static payloadTooLarge(): AppError {
    return new AppError(413, ErrorCode.PAYLOAD_TOO_LARGE, ERROR_MESSAGES.PAYLOAD_TOO_LARGE);
  }
  static unsupportedMedia(): AppError {
    return new AppError(
      415,
      ErrorCode.UNSUPPORTED_MEDIA_TYPE,
      ERROR_MESSAGES.UNSUPPORTED_MEDIA_TYPE,
    );
  }
  static rateLimited(retryAfterSeconds: number): AppError {
    return new AppError(429, ErrorCode.RATE_LIMITED, ERROR_MESSAGES.RATE_LIMITED, undefined, {
      'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))),
    });
  }
}
