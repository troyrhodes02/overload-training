-- Public Accounts, Recovery & Support (spec 18 section 7). HAND-WRITTEN, reviewed.
--
-- Additive only. Nothing is dropped, renamed, truncated, or cascaded, and no
-- row is written. Three changes:
--   profiles.email_verified_at - a nullable owned column on a table that
--                                already has deny-all RLS (no new RLS statement
--                                needed). NULL = unverified; set only by the
--                                verification flow; gates nothing in this build.
--   auth_throttle              - a new standalone, UN-OWNED system table (like
--                                admin_audit_entries): a pre-auth rate limiter
--                                with no owner column, no foreign key, and NO
--                                personal data (only a SHA-256 hash of the
--                                throttle key and a window bucket). RLS is
--                                enabled with NO policy (deny-all), so the Data
--                                API sees nothing; Prisma bypasses RLS. No FK,
--                                so it never blocks account deletion.
--   AdminAuditAction           - gains the 'account_reset_email_sent' value for
--                                the owner-only "send reset email" action.
-- ASCII only: the embedded test Postgres runs in WIN1252.

-- AlterTable: additive nullable column on the already-RLS profiles table.
ALTER TABLE "profiles" ADD COLUMN "email_verified_at" TIMESTAMPTZ;

-- CreateEnum
CREATE TYPE "auth_throttle_action" AS ENUM ('signup', 'password_reset_request');

-- CreateTable
CREATE TABLE "auth_throttle" (
    "key_hash"     TEXT NOT NULL,
    "action"       "auth_throttle_action" NOT NULL,
    "window_start" INTEGER NOT NULL,
    "count"        INTEGER NOT NULL DEFAULT 0,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMPTZ NOT NULL,

    CONSTRAINT "auth_throttle_pkey" PRIMARY KEY ("key_hash", "action", "window_start")
);

-- CreateIndex: supports a best-effort periodic prune, if ever added.
CREATE INDEX "auth_throttle_created_at_idx" ON "auth_throttle" ("created_at");

-- AlterEnum: additive new value. Nothing in this migration USES it, so it is
-- safe alongside the other DDL (Postgres only forbids USING a newly added enum
-- value in the transaction that added it, not adding it). The DB type is
-- "AdminAuditAction" (the Prisma enum has no @@map), not a snake_case name.
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'account_reset_email_sent';

-- Deny-all. The Data API must return nothing for this table. Do not add any
-- policy for anon or authenticated.
ALTER TABLE "auth_throttle" ENABLE ROW LEVEL SECURITY;
