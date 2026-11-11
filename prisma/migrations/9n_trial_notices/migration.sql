-- Trial upgrade UX & trial notices (OVE-112). HAND-WRITTEN, reviewed.
--
-- Additive only. Nothing is dropped, renamed, truncated, or cascaded, and no
-- row is written. Two nullable owned columns on a table that already has
-- deny-all RLS (no new table, so no new RLS statement is needed):
--   profiles.trial_ending_notice_at  - when the "trial ends tomorrow" notice
--                                      was shown to the account (NULL = never)
--   profiles.trial_ended_notice_at   - when the "trial has ended" notice was
--                                      shown to the account (NULL = never)
-- Presentation state only: entitlement resolution never reads them.
-- Applied to production only by a human, from the runbook, after a backup.
-- ASCII only: the embedded test Postgres runs in WIN1252.

-- AlterTable: additive nullable columns on the already-RLS profiles table.
ALTER TABLE "profiles" ADD COLUMN "trial_ending_notice_at" TIMESTAMPTZ;
ALTER TABLE "profiles" ADD COLUMN "trial_ended_notice_at" TIMESTAMPTZ;
