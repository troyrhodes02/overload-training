-- Workout Plan Import & Review (Pitch 22, OVE-109). HAND-WRITTEN, reviewed.
--
-- Additive only. One nullable column on an existing table; nothing dropped,
-- renamed, truncated, or cascaded, and no row is written.
--
--   import_sessions.sources_purged_at  - RETRIABLE BLOB-DELETE TOMBSTONE.
--       Null means the stored private-bucket source objects for this session
--       still need removing. A TERMINAL session (confirmed / discarded / expired
--       / purged) whose blob delete has not yet fully succeeded is left with
--       sources_purged_at = NULL so it is an OBSERVABLE, RETRIABLE tombstone:
--           WHERE sources_purged_at IS NULL AND status IN
--             ('confirmed','discarded','expired','purged')
--       The lazy per-request sweep (src/lib/import/retention.ts) and the operator
--       cleanup script (scripts/operator/plan-import-cleanup) retry it. A failed
--       blob delete NEVER undoes a confirmed plan; it only leaves this null.
--
-- RLS is already enabled (deny-all, no policy) on import_sessions from 9l; a
-- column add does not change that. ASCII only (embedded test Postgres is WIN1252).

-- AlterTable: the retriable tombstone marker (nullable; existing rows stay NULL).
ALTER TABLE "import_sessions" ADD COLUMN "sources_purged_at" TIMESTAMPTZ;

-- A partial index so the sweep/operator find pending-cleanup terminal sessions
-- cheaply without scanning live imports.
CREATE INDEX "import_sessions_sources_pending_idx"
  ON "import_sessions" ("status")
  WHERE "sources_purged_at" IS NULL;
