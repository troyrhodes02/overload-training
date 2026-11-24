-- Week schedule adjustments (OVE-240). HAND-WRITTEN, reviewed.
--
-- Additive only. Nothing is dropped, renamed, truncated, or altered, and no
-- existing row is written.
--
--   schedule_moves (OWNED): one row per planned occurrence the lifter moved
--   within its block week ("Train today" or "Swap days" on Today). It holds
--   the occurrence's identity (session_id + authored_on) and where it is
--   trained this week instead (moved_to). The authored Session weekday is
--   never changed, so later weeks keep their normal schedule. Reached only
--   through the account-scoped client; removed with the account; part of its
--   export. A planning fact, never logged history: removing a session from a
--   plan removes its moves first, in the application's own transaction. Every
--   reference RESTRICTs, like every other owned table; nothing cascades.
--
-- Deny-all RLS like every table (no policy), the shared user_id-immutable
-- trigger, and same-owner triggers on both parents.
-- Applied to production only by a human, from the runbook, after a backup.
-- ASCII only: the embedded test Postgres runs in WIN1252.

-- CreateTable: schedule_moves (owned)
CREATE TABLE "schedule_moves" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "mesocycle_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "authored_on" DATE NOT NULL,
    "moved_to" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "schedule_moves_pkey" PRIMARY KEY ("id"),
    -- A move stays inside its block week.
    CONSTRAINT "schedule_moves_same_week_check" CHECK (ABS("moved_to" - "authored_on") <= 6)
);

CREATE UNIQUE INDEX "schedule_moves_session_id_authored_on_key"
  ON "schedule_moves" ("session_id", "authored_on");
CREATE INDEX "schedule_moves_mesocycle_id_idx" ON "schedule_moves" ("mesocycle_id");
CREATE INDEX "schedule_moves_user_id_idx" ON "schedule_moves" ("user_id");

ALTER TABLE "schedule_moves" ADD CONSTRAINT "schedule_moves_mesocycle_id_fkey"
  FOREIGN KEY ("mesocycle_id") REFERENCES "mesocycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "schedule_moves" ADD CONSTRAINT "schedule_moves_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "schedule_moves" ADD CONSTRAINT "schedule_moves_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Deny-all RLS: no policy, so Supabase's Data API (anon key) reaches nothing.
ALTER TABLE "schedule_moves" ENABLE ROW LEVEL SECURITY;

-- Every owned parent has the same owner (shared trigger, 9_account_ownership_2_enforce).
CREATE TRIGGER "schedule_moves_same_owner_mesocycle_id"
  BEFORE INSERT OR UPDATE OF "mesocycle_id", "user_id" ON "schedule_moves"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('mesocycles', 'mesocycle_id', 'false');
CREATE TRIGGER "schedule_moves_same_owner_session_id"
  BEFORE INSERT OR UPDATE OF "session_id", "user_id" ON "schedule_moves"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('sessions', 'session_id', 'false');

-- An owned row never changes owner (shared trigger, 9_account_ownership_2_enforce).
CREATE TRIGGER "schedule_moves_user_id_immutable" BEFORE UPDATE OF "user_id" ON "schedule_moves"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
