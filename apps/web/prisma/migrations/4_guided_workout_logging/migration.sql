-- Guided Workout Logging (Pitch 4) — HAND-WRITTEN, reviewed.
--
-- Additive only: two enums, new columns on logged_sessions and logged_exercises,
-- and one new table (missed_day_resolutions). No table/column is dropped or
-- renamed, no row is inserted or deleted, nothing cascades on delete. The new
-- table gets Foundation's deny-all RLS (no policies). The logged tables are
-- empty before this pitch (logging begins here), so the new NOT NULL columns
-- are safe without a backfill.

-- CreateEnum: explicit LoggedSession completion state (never inferred).
CREATE TYPE "LoggedSessionStatus" AS ENUM ('in_progress', 'complete');

-- CreateEnum: how a missed planned day was reconciled.
CREATE TYPE "MissedDayOutcome" AS ENUM ('logged_late', 'shifted', 'skipped');

-- AlterTable: a LoggedSession carries the authored occurrence date it fulfills
-- (the idempotency key) and an explicit status.
ALTER TABLE "logged_sessions"
  ADD COLUMN "scheduled_for" DATE NOT NULL,
  ADD COLUMN "status" "LoggedSessionStatus" NOT NULL DEFAULT 'in_progress';

-- AlterTable: a LoggedExercise preserves the plan context it was logged against,
-- so later plan edits cannot make old history unintelligible. exercise_id is the
-- PERFORMED exercise; planned_exercise_id is the immutable planned one.
ALTER TABLE "logged_exercises"
  ADD COLUMN "planned_exercise_id" UUID NOT NULL,
  ADD COLUMN "session_exercise_id" UUID,
  ADD COLUMN "planned_sets" INTEGER NOT NULL,
  ADD COLUMN "target_rep_min" INTEGER NOT NULL,
  ADD COLUMN "target_rep_max" INTEGER NOT NULL;

-- CreateTable: a dated missed-day resolution. The effective schedule is derived
-- from the Mesocycle plus these; the authored Session template is never mutated.
CREATE TABLE "missed_day_resolutions" (
    "id" UUID NOT NULL,
    "mesocycle_id" UUID NOT NULL,
    "session_id" UUID,
    "missed_on" DATE NOT NULL,
    "outcome" "MissedDayOutcome" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "missed_day_resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "logged_exercises_planned_exercise_id_idx" ON "logged_exercises"("planned_exercise_id");

-- CreateIndex: one LoggedSession per planned occurrence.
CREATE UNIQUE INDEX "logged_sessions_session_id_scheduled_for_key" ON "logged_sessions"("session_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "missed_day_resolutions_mesocycle_id_idx" ON "missed_day_resolutions"("mesocycle_id");

-- CreateIndex: one resolution per missed planned day.
CREATE UNIQUE INDEX "missed_day_resolutions_mesocycle_id_missed_on_key" ON "missed_day_resolutions"("mesocycle_id", "missed_on");

-- AddForeignKey: plan provenance. Restrict so an in-use exercise can't be hard-deleted.
ALTER TABLE "logged_exercises" ADD CONSTRAINT "logged_exercises_planned_exercise_id_fkey" FOREIGN KEY ("planned_exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: SetNull so editing the plan never cascades history away.
ALTER TABLE "logged_exercises" ADD CONSTRAINT "logged_exercises_session_exercise_id_fkey" FOREIGN KEY ("session_exercise_id") REFERENCES "session_exercises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missed_day_resolutions" ADD CONSTRAINT "missed_day_resolutions_mesocycle_id_fkey" FOREIGN KEY ("mesocycle_id") REFERENCES "mesocycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missed_day_resolutions" ADD CONSTRAINT "missed_day_resolutions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enable deny-all row-level security on the new table (CLAUDE.md security invariant).
ALTER TABLE "missed_day_resolutions" ENABLE ROW LEVEL SECURITY;
