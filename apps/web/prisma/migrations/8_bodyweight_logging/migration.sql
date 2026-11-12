-- Bodyweight logging — HAND-WRITTEN, reviewed.
--
-- A pure bodyweight set (Exercise.equipment_type = 'bodyweight') is reps only;
-- its external weight is NULL — never 0, never a fake positive number, never a
-- guessed bodyweight. Which exercises may store NULL is decided in the one
-- write module (src/lib/logging/logged-sets.ts) via requiresExternalWeight();
-- every other exercise still requires weight > 0 there.
--
-- Relaxing NOT NULL is metadata-only: no row is inserted, updated, or deleted,
-- no existing weight value changes, nothing is dropped or renamed, nothing
-- cascades, no RLS change (logged_sets has had deny-all RLS since 0_init).
--
-- The CHECK makes 0 / negative unstorable at the database layer: a stored
-- weight is either a real positive load or NULL (no external load). Existing
-- rows already satisfy it (the write module has always rejected weight <= 0);
-- if any row did not, this migration fails loudly and changes nothing — stop
-- and investigate, do not hand-edit history to force it.

ALTER TABLE "logged_sets" ALTER COLUMN "weight_lbs" DROP NOT NULL;

ALTER TABLE "logged_sets"
  ADD CONSTRAINT "logged_sets_weight_positive_or_null"
  CHECK ("weight_lbs" IS NULL OR "weight_lbs" > 0);
