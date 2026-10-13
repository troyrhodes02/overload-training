-- Flexible workouts — HAND-WRITTEN, reviewed.
--
-- Additive only: one nullable column on logged_exercises recording that the
-- lifter didn't do a planned exercise. No table/column is dropped or renamed,
-- no row is inserted, updated, or deleted, nothing cascades, no RLS change
-- (logged_exercises has had deny-all RLS since 0_init). Existing rows keep
-- NULL (= not skipped), so history is untouched.

ALTER TABLE "logged_exercises" ADD COLUMN "skipped_at" TIMESTAMPTZ;
