# Contract changelog

The contract is `packages/shared` (Zod schemas, enums, constants), `docs/openapi.yaml`
and `prisma/schema.prisma`. Only the Architect changes it, always the three together.

Versioning: **major** when something breaks compatibility, **minor** when something is
added, **patch** for fixes that change no behaviour. The version lives in
`CONTRACT_VERSION` (`packages/shared/src/constants.ts`), `info.version` in
`docs/openapi.yaml` and `version` in `packages/shared/package.json`.

## v1.0.0 — 2026-10-09

Initial contract. Affects **Backend and Frontend**.

### Data model

- `users`, `event_templates`, `calendar_entries`, `attendances`, as in the plan.
- `username` is `CITEXT`: unique and looked up case-insensitively (`Ana` = `ana`).
- CHECK constraints in the initial migration: username format, name/description length
  (trimmed, not blank), `attendees` 1–10, `start_time`/`end_time` `HH:mm`, `capacity` 1–10.
- `calendar_entries.template_id` is `ON DELETE RESTRICT`; `attendances` cascade with
  their entry (and their user).
- The 4-entries-per-day rule is not a DB constraint: the API enforces it in a transaction.

### Endpoints

All 15 endpoints of the plan, with these details fixed by the contract:

- Every non-2xx response is `ApiError { code, message, details? }`. Known `code` values are
  in `ErrorCode`. `VALIDATION_ERROR` carries `details.issues[] { path, message }`.
- Every `POST`/`PATCH`/`DELETE` requires `X-CSRF-Token` (from `GET /auth/csrf`), including
  login and register. Missing or invalid → `403 CSRF_INVALID`. Fetch a new token after
  login, register and logout.
- Protected endpoints without a session → `401 UNAUTHENTICATED`.
- An `:id` that is not a UUID → `400 VALIDATION_ERROR`.
- Unknown body fields → `400 VALIDATION_ERROR`.
- Any endpoint may also return `429 RATE_LIMITED` (with `Retry-After`) and `500 INTERNAL_ERROR`.
- `POST /auth/register` opens a session (sets the cookie), like login. Bad CAPTCHA →
  `400 CAPTCHA_FAILED`.
- `POST /auth/login` validates only the shape of the body, so a malformed username gets the
  same generic `401 INVALID_CREDENTIALS` as a wrong password.
- `GET /event-templates` lists every user's templates, newest first, `page` ≥ 1,
  `pageSize` 1–50 (default 20). Response: `{ items, page, pageSize, total, totalPages }`.
- Templates are returned with `owner { id, username }`; the UI compares it with `/auth/me`.
- `PATCH /event-templates/:id`: partial; `null` clears an optional field; empty body → 400.
- `startTime`/`endTime` are independent; `endTime < startTime` is allowed (past midnight).
- `POST /uploads/image`: multipart field `file`; JPEG, PNG or WebP (no SVG), max 5 MB.
- `GET /calendar?from&to`: both inclusive, `to - from + 1 ≤ 42`, entries ordered by date
  then creation. Public; `isAttending`/`canDelete` are `false` without a session.
- `POST /calendar/entries`: `404 NOT_FOUND` if the template does not exist.
- `POST /calendar/entries/:id/attendance` returns `201` with the updated `CalendarEntry`.
- `DELETE /calendar/entries/:id/attendance`: `404` if the entry does not exist or the user
  is not attending.

### Shared package (`@party-finder/shared`)

- `EventType`, `EVENT_TYPES`, `EventTypeSchema`, `EVENT_TYPE_LABELS` (Spanish).
- Constants: `MAX_EVENTS_PER_DAY`, `MIN_CAPACITY`, `MAX_CAPACITY`, `MAX_IMAGE_BYTES`,
  `MAX_CALENDAR_RANGE_DAYS`, `ALLOWED_IMAGE_MIME_TYPES`, `UPLOAD_IMAGE_FIELD`, username,
  password and text limits, pagination limits, `CSRF_HEADER`, `SESSION_COOKIE_NAME`.
- Request and response Zod schemas with inferred types for every endpoint.
- `endpoints`: machine-readable index (method, path, access, CSRF, schemas, status codes and
  error codes). A test keeps it in sync with `docs/openapi.yaml`.
- `toValidationErrorDetails(zodError)` to build `VALIDATION_ERROR` details the same way on
  both sides.
