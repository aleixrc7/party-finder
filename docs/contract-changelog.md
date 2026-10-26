# Contract changelog

The contract is `packages/shared` (Zod schemas, enums, constants), `docs/openapi.yaml`
and `prisma/schema.prisma`. Only the Architect changes it, always the three together.

Versioning: **major** when something breaks compatibility, **minor** when something is
added, **patch** for fixes that change no behaviour. The version lives in
`CONTRACT_VERSION` (`packages/shared/src/constants.ts`), `info.version` in
`docs/openapi.yaml` and `version` in `packages/shared/package.json`.

## v2.0.0 — 2026-10-26

**Breaking.** Adds email verification (plan of 2026-10-26, "Email verification").
Affects **Backend and Frontend**. Nothing had been deployed, so the initial migration
was regenerated in place instead of adding a second one: drop your local database
(`pnpm db:reset`) before running v2.

### What changes and who it affects

| Change                                                                                                                          | Backend | Frontend |
| ------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- |
| `POST /auth/register` body adds `email`; response is `202 { message }` instead of `201 { user }` + cookie. No session, no user. | ✓       | ✓        |
| New `POST /auth/verify-email` (`{ token }` → `200 { message }`, `400 INVALID_OR_EXPIRED_TOKEN`, `429`).                         | ✓       | ✓        |
| New `POST /auth/resend-verification` (`{ email }` → always `202 { message }`, `429`).                                           | ✓       | ✓        |
| `POST /auth/login` adds `403 EMAIL_NOT_VERIFIED` (only after a correct password).                                               | ✓       | ✓        |
| New error codes `EMAIL_NOT_VERIFIED`, `INVALID_OR_EXPIRED_TOKEN`.                                                               | ✓       | ✓        |
| Exact auth message texts pinned in `AUTH_MESSAGES` and in `openapi.yaml`.                                                       | ✓       | ✓        |
| `users.email`, `users.email_verified_at`, new `email_verification_tokens` table.                                                | ✓       |          |
| Mailpit in Docker Compose; mail variables in `.env.example`.                                                                    | ✓       | (QA)     |

### Endpoints

- `POST /auth/register`: body `{ username, email, password, captchaToken }`. Answers
  `202 { message: "Si los datos son válidos, recibirás un correo electrónico." }` in every
  case — new email or already registered (then nothing is created and the email tells the
  owner they already have an account). Only a taken username (public) returns
  `409 USERNAME_TAKEN`. It no longer sets the session cookie and no longer returns the user.
  Errors otherwise unchanged (`400 VALIDATION_ERROR | CAPTCHA_FAILED`, `403 CSRF_INVALID`, `429`).
- `POST /auth/verify-email` (new, public, CSRF): body `{ token }`. The token always travels
  in the body, never in an API query string. `200 { message: "Tu cuenta está verificada. Ya
puedes iniciar sesión." }`; no session is opened (the user logs in afterwards). Any token
  problem (malformed, unknown, expired, used) → `400 INVALID_OR_EXPIRED_TOKEN` with the
  message "El enlace de verificación no es válido o ha caducado." and no `details`;
  `400 VALIDATION_ERROR` only if the body is not `{ token: string }`. `429` per IP.
- `POST /auth/resend-verification` (new, public, CSRF): body `{ email }`. Always `202` with
  the same body as register, whether the email is unknown, unverified or verified. For an
  unverified account it invalidates older tokens and sends a new one. 1 per minute and 5 per
  day per email (counted the same for unknown emails) plus per IP → `429 RATE_LIMITED`.
  `400 VALIDATION_ERROR` only for a malformed body (independent of whether the email exists).
- `POST /auth/login`: still by **username**. Correct password + unverified email →
  `403 EMAIL_NOT_VERIFIED` ("Debes verificar tu correo electrónico antes de iniciar
  sesión."), no session. Wrong password → always `401 INVALID_CREDENTIALS`
  ("Usuario o contraseña incorrectos."), verified or not. `403` can now be
  `CSRF_INVALID` or `EMAIL_NOT_VERIFIED`: read `code`.
- CSRF: fetch a new token after login and logout (register no longer changes the session).

### Email link

- The email links to the web app: `{WEB_ORIGIN}/verificar-email?token=<token>`
  (`VERIFY_EMAIL_WEB_PATH`). The page POSTs the token on load and uses
  `Referrer-Policy: no-referrer`.
- Token: 32 random bytes, base64url without padding (43 chars), valid 24 h, single use.
  The DB stores only `sha256(token string)` as 64 lowercase hex chars.

### Data model

- `users.email`: `VARCHAR(254)`, unique, CHECK `email = lower(email)` and a basic
  `x@y` format CHECK. The API stores the value produced by `EmailSchema` (trimmed,
  lowercased).
- `users.email_verified_at`: nullable `TIMESTAMPTZ`; no login while null.
- `email_verification_tokens`: `id`, `user_id` → `users` (`ON DELETE CASCADE`),
  `token_hash` (`CHAR(64)`, unique, CHECK `^[0-9a-f]{64}$`), `expires_at`, `used_at`,
  `created_at`; index on `user_id`.
- Unverified accounts are deleted after 7 days (`UNVERIFIED_ACCOUNT_TTL_DAYS`); their tokens
  go with them (cascade).
- Seed: 3 verified users (`ana`, `bruno`, `carla`, `<name>@example.com`) and 1 unverified
  user (`dani`) with a fresh token; the seed prints dani's verification link (dev only).

### Shared package (`@party-finder/shared` 2.0.0)

- New constants: `EMAIL_MAX_LENGTH` (254), `VERIFICATION_TOKEN_TTL_HOURS` (24),
  `VERIFICATION_TOKEN_BYTES` (32), `VERIFICATION_TOKEN_MAX_LENGTH` (256),
  `UNVERIFIED_ACCOUNT_TTL_DAYS` (7), `RESEND_VERIFICATION_COOLDOWN_SECONDS` (60),
  `RESEND_VERIFICATION_MAX_PER_DAY` (5), `VERIFY_EMAIL_WEB_PATH`.
- New `AUTH_MESSAGES` with the exact Spanish texts (UI shows them verbatim).
- New schemas: `EmailSchema`, `VerificationEmailSentResponseSchema`,
  `VerifyEmailRequestSchema`, `VerifyEmailResponseSchema`,
  `ResendVerificationRequestSchema`, `ResendVerificationResponseSchema`.
- Changed: `RegisterRequestSchema` (+`email`), `RegisterResponseSchema` (now the generic
  `{ message }`). `ErrorCode` adds `EMAIL_NOT_VERIFIED`, `INVALID_OR_EXPIRED_TOKEN`.
- `endpoints` adds `verifyEmail` and `resendVerification`; `register` success is `202`.

### Infra

- `infra/docker-compose.yml`: `mailpit` (`axllent/mailpit:v1.31.6`), SMTP `localhost:1025`,
  UI `http://localhost:8025`, volume and healthcheck.
- `infra/.env.example`: `MAIL_TRANSPORT`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`,
  `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `MAIL_PROVIDER_API_KEY` (empty),
  `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT`. `WEB_ORIGIN` is also the base of email links.

## v1.0.0 — 2026-10-09

> Superseded by v2.0.0: register no longer opens a session (see above).

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
