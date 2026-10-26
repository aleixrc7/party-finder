-- Contract v2.0.0 — initial schema (regenerated for v2: users.email,
-- users.email_verified_at and email_verification_tokens). Nothing had been deployed.
-- Generated with `prisma migrate diff --from-empty`, then extended by hand with
-- the CITEXT extension and the CHECK constraints Prisma cannot express.

-- Case-insensitive usernames ("Ana" and "ana" are the same user).
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('LAN_PARTY', 'JUEGO_ONLINE', 'PLAN_GATO', 'DND', 'PASEO', 'PSICOLOGO', 'PELUQUERIA', 'OTROS');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" CITEXT NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3),
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_templates" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "type" "event_type" NOT NULL,
    "image_url" VARCHAR(2048),
    "attendees" SMALLINT,
    "start_time" CHAR(5),
    "end_time" CHAR(5),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "event_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_entries" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "capacity" SMALLINT NOT NULL,
    "added_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "entry_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("entry_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE INDEX "event_templates_owner_id_idx" ON "event_templates"("owner_id");

-- CreateIndex
CREATE INDEX "event_templates_created_at_idx" ON "event_templates"("created_at");

-- CreateIndex
CREATE INDEX "calendar_entries_date_idx" ON "calendar_entries"("date");

-- CreateIndex
CREATE INDEX "calendar_entries_template_id_idx" ON "calendar_entries"("template_id");

-- CreateIndex
CREATE INDEX "calendar_entries_added_by_idx" ON "calendar_entries"("added_by");

-- CreateIndex
CREATE INDEX "attendances_user_id_idx" ON "attendances"("user_id");

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_templates" ADD CONSTRAINT "event_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "event_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "calendar_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CheckConstraints (hand-written; keep in sync with packages/shared/src/constants.ts)
ALTER TABLE "users"
  ADD CONSTRAINT "users_username_format_check"
  CHECK ("username"::text ~ '^[A-Za-z0-9_-]{3,30}$'),
  -- Stored lowercase so the unique index is effectively case-insensitive.
  -- Max length (254) is the VARCHAR(254) type itself.
  ADD CONSTRAINT "users_email_lowercase_check"
  CHECK ("email" = lower("email")),
  ADD CONSTRAINT "users_email_format_check"
  CHECK ("email" ~ '^[^@[:space:]]+@[^@[:space:]]+$');

-- Only the SHA-256 of the token is stored: exactly 64 lowercase hex chars.
ALTER TABLE "email_verification_tokens"
  ADD CONSTRAINT "email_verification_tokens_token_hash_format_check"
  CHECK ("token_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "event_templates"
  ADD CONSTRAINT "event_templates_name_length_check"
  CHECK (char_length(btrim("name")) BETWEEN 1 AND 80),
  ADD CONSTRAINT "event_templates_description_length_check"
  CHECK (char_length(btrim("description")) BETWEEN 1 AND 1000),
  ADD CONSTRAINT "event_templates_attendees_check"
  CHECK ("attendees" IS NULL OR "attendees" BETWEEN 1 AND 10),
  ADD CONSTRAINT "event_templates_start_time_format_check"
  CHECK ("start_time" IS NULL OR "start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "event_templates_end_time_format_check"
  CHECK ("end_time" IS NULL OR "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "calendar_entries"
  ADD CONSTRAINT "calendar_entries_capacity_check"
  CHECK ("capacity" BETWEEN 1 AND 10);
