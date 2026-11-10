-- Workout Plan Import & Review (Pitch 22, spec section 8). HAND-WRITTEN, reviewed.
--
-- Additive only. Nothing is dropped, renamed, truncated, or cascaded, and no
-- row is written. Four new tables and two new enums:
--   import_sessions      - OWNED. The state machine of one import attempt: its
--                          status, source kind, the staged ImportDraft JSON
--                          (observed fields + edits + issues; NOTHING here is a
--                          stored progression tag or e1RM), sanitized model
--                          accounting, a compare-and-set extraction lease, a safe
--                          error CATEGORY, the created draft mesocycle after
--                          confirm (unique, for idempotency), and a retention
--                          clock. FK to profiles ON DELETE RESTRICT; user_id
--                          immutable (shared trigger, 9_account_ownership_2_enforce);
--                          same-owner trigger on mesocycle_id (FK to mesocycles
--                          ON DELETE RESTRICT, unique).
--   import_source_parts  - OWNED. One ordered part of a source bundle: inline
--                          text OR a private storage object reference (XOR CHECK).
--                          Child of import_sessions. FK RESTRICT; user_id
--                          immutable; same-owner trigger on session_id.
--   import_usage_days    - OWNED. Per-account atomic daily started-attempt
--                          counter (like auth_throttle). FK RESTRICT; user_id
--                          immutable. Unique (user_id, day_key).
--   import_spend_ledger  - UN-OWNED system table (like auth_throttle /
--                          webhook_events): a global provider-spend ledger. No
--                          owner column, no FK, no personal data. Unique (month_key).
-- Every new table enables RLS with NO policy (deny-all); Prisma bypasses RLS.
-- CHECK constraints mirror the caps in src/lib/import/constants.ts.
-- ASCII only: the embedded test Postgres runs in WIN1252.

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('created', 'uploaded', 'extracting', 'review', 'needs_input', 'not_a_plan', 'confirming', 'confirmed', 'failed_retryable', 'failed_final', 'discarded', 'expired', 'purged');
CREATE TYPE "import_source_kind" AS ENUM ('text', 'pdf', 'image');

-- CreateTable: import_sessions (owned)
CREATE TABLE "import_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'created',
    "source_kind" "import_source_kind" NOT NULL,
    "draft" JSONB,
    "draft_version" INTEGER NOT NULL DEFAULT 0,
    "model_id" TEXT,
    "prompt_version" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "lease_token" TEXT,
    "lease_expires_at" TIMESTAMPTZ,
    "error_code" TEXT,
    "mesocycle_id" UUID,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "import_sessions_pkey" PRIMARY KEY ("id"),
    -- Draft version and attempt/token counters are never negative.
    CONSTRAINT "import_sessions_draft_version_check" CHECK ("draft_version" >= 0),
    CONSTRAINT "import_sessions_attempt_count_check" CHECK ("attempt_count" >= 0),
    CONSTRAINT "import_sessions_input_tokens_check" CHECK ("input_tokens" IS NULL OR "input_tokens" >= 0),
    CONSTRAINT "import_sessions_output_tokens_check" CHECK ("output_tokens" IS NULL OR "output_tokens" >= 0)
);

CREATE UNIQUE INDEX "import_sessions_mesocycle_id_key" ON "import_sessions" ("mesocycle_id");
CREATE INDEX "import_sessions_user_id_idx" ON "import_sessions" ("user_id");
CREATE INDEX "import_sessions_user_id_status_idx" ON "import_sessions" ("user_id", "status");
CREATE INDEX "import_sessions_user_id_expires_at_idx" ON "import_sessions" ("user_id", "expires_at");

ALTER TABLE "import_sessions" ADD CONSTRAINT "import_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "import_sessions" ADD CONSTRAINT "import_sessions_mesocycle_id_fkey"
  FOREIGN KEY ("mesocycle_id") REFERENCES "mesocycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: import_source_parts (owned)
CREATE TABLE "import_source_parts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT,
    "object_path" TEXT,
    "content_type" TEXT,
    "size_bytes" INTEGER,
    "sha256" TEXT,
    "page_count" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_source_parts_pkey" PRIMARY KEY ("id"),
    -- Position is 0-based and never negative.
    CONSTRAINT "import_source_parts_position_check" CHECK ("position" >= 0),
    -- Exactly one of text / object_path is set (a text part XOR a file part).
    CONSTRAINT "import_source_parts_source_xor_check"
      CHECK (("text" IS NOT NULL) <> ("object_path" IS NOT NULL)),
    -- Pasted/typed text is capped at 20,000 characters (constants.ts).
    CONSTRAINT "import_source_parts_text_len_check"
      CHECK ("text" IS NULL OR char_length("text") <= 20000),
    -- A file part is at most 10 MiB and at most 20 pages (constants.ts).
    CONSTRAINT "import_source_parts_size_bytes_check"
      CHECK ("size_bytes" IS NULL OR ("size_bytes" > 0 AND "size_bytes" <= 10485760)),
    CONSTRAINT "import_source_parts_page_count_check"
      CHECK ("page_count" IS NULL OR ("page_count" > 0 AND "page_count" <= 20))
);

CREATE UNIQUE INDEX "import_source_parts_session_id_position_key"
  ON "import_source_parts" ("session_id", "position");
CREATE INDEX "import_source_parts_user_id_idx" ON "import_source_parts" ("user_id");
CREATE INDEX "import_source_parts_session_id_position_idx"
  ON "import_source_parts" ("session_id", "position");

ALTER TABLE "import_source_parts" ADD CONSTRAINT "import_source_parts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "import_source_parts" ADD CONSTRAINT "import_source_parts_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "import_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: import_usage_days (owned)
CREATE TABLE "import_usage_days" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day_key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "import_usage_days_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "import_usage_days_count_check" CHECK ("count" >= 0)
);

CREATE UNIQUE INDEX "import_usage_days_user_id_day_key_key"
  ON "import_usage_days" ("user_id", "day_key");
CREATE INDEX "import_usage_days_user_id_idx" ON "import_usage_days" ("user_id");

ALTER TABLE "import_usage_days" ADD CONSTRAINT "import_usage_days_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- CreateTable: import_spend_ledger (un-owned system table)
CREATE TABLE "import_spend_ledger" (
    "id" UUID NOT NULL,
    "month_key" TEXT NOT NULL,
    "reserved_micros" BIGINT NOT NULL DEFAULT 0,
    "actual_micros" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "import_spend_ledger_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "import_spend_ledger_reserved_micros_check" CHECK ("reserved_micros" >= 0),
    CONSTRAINT "import_spend_ledger_actual_micros_check" CHECK ("actual_micros" >= 0)
);

CREATE UNIQUE INDEX "import_spend_ledger_month_key_key" ON "import_spend_ledger" ("month_key");

-- Deny-all RLS on every new table. The Data API must return nothing. Do not add
-- any policy for anon or authenticated.
ALTER TABLE "import_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_source_parts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_usage_days" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "import_spend_ledger" ENABLE ROW LEVEL SECURITY;

-- Second layer (9_account_ownership_2_enforce): ownership is immutable on every
-- owned table. import_spend_ledger is un-owned, so it has no such trigger.
CREATE TRIGGER "import_sessions_user_id_immutable" BEFORE UPDATE OF "user_id" ON "import_sessions"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "import_source_parts_user_id_immutable" BEFORE UPDATE OF "user_id" ON "import_source_parts"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "import_usage_days_user_id_immutable" BEFORE UPDATE OF "user_id" ON "import_usage_days"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();

-- Same-owner second layer: a source part may reference only its own account's
-- import session; an import session's created mesocycle must be its own account's.
CREATE TRIGGER "import_source_parts_same_owner_session_id"
  BEFORE INSERT OR UPDATE OF "session_id", "user_id" ON "import_source_parts"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('import_sessions', 'session_id', 'false');
CREATE TRIGGER "import_sessions_same_owner_mesocycle_id"
  BEFORE INSERT OR UPDATE OF "mesocycle_id", "user_id" ON "import_sessions"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('mesocycles', 'mesocycle_id', 'false');
