/** Contract version. Must match `info.version` in docs/openapi.yaml. */
export const CONTRACT_VERSION = '1.0.0';

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
