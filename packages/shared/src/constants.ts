/** Contract version. Must match `info.version` in docs/openapi.yaml. */
export const CONTRACT_VERSION = '2.0.0';

// Calendar rules
export const MAX_EVENTS_PER_DAY = 4;
export const MIN_CAPACITY = 1;
export const MAX_CAPACITY = 10;
/** Maximum number of days (both ends inclusive) a single `GET /calendar` may cover: 6 weeks. */
export const MAX_CALENDAR_RANGE_DAYS = 42;

// Uploads
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Accepted upload MIME types. SVG is deliberately excluded. The server checks the real file type. */
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Name of the multipart field that carries the file in `POST /uploads/image`. */
export const UPLOAD_IMAGE_FIELD = 'file';

// Users
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]+$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
/** RFC 5321 limit. Emails are trimmed and lowercased before this check. */
export const EMAIL_MAX_LENGTH = 254;

// Email verification
/** A verification token expires this many hours after it is issued. Single use. */
export const VERIFICATION_TOKEN_TTL_HOURS = 24;
/**
 * Random bytes per token. The token travels base64url-encoded without padding (43 chars);
 * the database stores only the SHA-256 of that string, as 64 lowercase hex chars.
 */
export const VERIFICATION_TOKEN_BYTES = 32;
/** Upper bound on the token string the API accepts (shape check only, see `VerifyEmailRequestSchema`). */
export const VERIFICATION_TOKEN_MAX_LENGTH = 256;
/** Unverified accounts are deleted this many days after sign-up, freeing username and email. */
export const UNVERIFIED_ACCOUNT_TTL_DAYS = 7;
/** Per-email resend limits, on top of the per-IP limit. The UI may use them for a cooldown. */
export const RESEND_VERIFICATION_COOLDOWN_SECONDS = 60;
export const RESEND_VERIFICATION_MAX_PER_DAY = 5;
/** Web page the email link opens: `{WEB_ORIGIN}/verificar-email?token=<token>`. Never an API URL. */
export const VERIFY_EMAIL_WEB_PATH = '/verificar-email';

// Event templates
export const TEMPLATE_NAME_MAX_LENGTH = 80;
export const TEMPLATE_DESCRIPTION_MAX_LENGTH = 1000;
export const IMAGE_URL_MAX_LENGTH = 2048;
/** `HH:mm`, 24-hour clock, 00:00–23:59. */
export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

// HTTP
/** Header every data-modifying request (POST, PATCH, DELETE) must carry. */
export const CSRF_HEADER = 'X-CSRF-Token';
/** Name of the httpOnly session cookie. Clients never read it; listed for the API and tests. */
export const SESSION_COOKIE_NAME = 'pf_session';
