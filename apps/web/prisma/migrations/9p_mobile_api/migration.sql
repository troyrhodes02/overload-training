-- Mobile API & Auth Foundation (Pitch 21c, OVE-178). HAND-WRITTEN, reviewed.
--
-- Additive only. Nothing is dropped, renamed, truncated, or cascaded, and no
-- existing row is written.
--
--   1. auth_throttle_action gains 'mobile_api_request': the per-account rate
--      limit for the mobile API, counted in the existing un-owned
--      auth_throttle table (a SHA-256 key hash and a window count only; no
--      account id is stored).
--   2. api_idempotency_keys (OWNED): one row per (account, Idempotency-Key),
--      holding the request's scope and hash and the first successful
--      response, so a retried create returns that response instead of
--      creating twice. Reached only through the account-scoped client;
--      removed with the account; part of its export. No client-supplied
--      primary key: the key is unique per account only.
--
-- Deny-all RLS like every table (no policy), the shared user_id-immutable
-- trigger, and a RESTRICT foreign key to profiles (account deletion removes
-- these rows first, in its own transaction).
-- Applied to production only by a human, from the runbook, after a backup.
-- ASCII only: the embedded test Postgres runs in WIN1252.

-- AlterEnum: additive value (not used in this transaction).
ALTER TYPE "auth_throttle_action" ADD VALUE IF NOT EXISTS 'mobile_api_request';

-- CreateTable: api_idempotency_keys (owned)
CREATE TABLE "api_idempotency_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "api_idempotency_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "api_idempotency_keys_key_check" CHECK (char_length("key") BETWEEN 8 AND 255),
    CONSTRAINT "api_idempotency_keys_status_check" CHECK ("response_status" IS NULL OR "response_status" BETWEEN 200 AND 299)
);

CREATE UNIQUE INDEX "api_idempotency_keys_user_id_key_key"
  ON "api_idempotency_keys" ("user_id", "key");
CREATE INDEX "api_idempotency_keys_user_id_idx" ON "api_idempotency_keys" ("user_id");

ALTER TABLE "api_idempotency_keys" ADD CONSTRAINT "api_idempotency_keys_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Deny-all RLS: no policy, so Supabase's Data API (anon key) reaches nothing.
ALTER TABLE "api_idempotency_keys" ENABLE ROW LEVEL SECURITY;

-- An owned row never changes owner (shared trigger, 9_account_ownership_2_enforce).
CREATE TRIGGER "api_idempotency_keys_user_id_immutable" BEFORE UPDATE OF "user_id" ON "api_idempotency_keys"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
