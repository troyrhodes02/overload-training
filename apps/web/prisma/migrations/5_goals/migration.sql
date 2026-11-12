-- Goals (Pitch 6) — HAND-WRITTEN, reviewed.
--
-- Additive only: one enum, four nullable columns on the existing (empty,
-- previously unused) goals table, one FK, indexes, and CHECK constraints. No
-- table/column is dropped or renamed, no row is inserted, updated, or deleted,
-- nothing cascades on delete. No new table, so no new RLS statement: goals has
-- had deny-all RLS (no policies) since 0_init. No progress / percent / e1RM
-- column exists — goal progress is derived on read from logged_sets.

-- CreateEnum: why an archived goal left the active list.
CREATE TYPE "GoalArchiveReason" AS ENUM ('completed', 'manual');

-- AlterTable: optional measurement gym (machine/cable goals) and lifecycle metadata.
ALTER TABLE "goals"
  ADD COLUMN "gym_id" UUID,
  ADD COLUMN "archive_reason" "GoalArchiveReason",
  ADD COLUMN "archived_at" TIMESTAMPTZ,
  ADD COLUMN "completion_acknowledged_at" TIMESTAMPTZ;

-- AddForeignKey: Restrict, so a gym referenced by a goal can never be hard-deleted.
ALTER TABLE "goals" ADD CONSTRAINT "goals_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "goals_gym_id_idx" ON "goals"("gym_id");

-- CreateIndex
CREATE INDEX "goals_status_idx" ON "goals"("status");

-- CreateIndex: at most ONE active goal per exercise, at any gym (spec R6/R49).
CREATE UNIQUE INDEX "goals_one_active_per_exercise" ON "goals"("exercise_id") WHERE "status" = 'active';

-- Check: a target is a positive weight and at least one rep.
ALTER TABLE "goals" ADD CONSTRAINT "goals_target_positive"
  CHECK ("target_weight_lbs" > 0 AND "target_reps" >= 1);

-- Check: lifecycle columns agree with status. Active goals carry no archive
-- metadata; archived goals always carry a reason and a time.
ALTER TABLE "goals" ADD CONSTRAINT "goals_lifecycle_consistent" CHECK (
  ("status" = 'active' AND "archive_reason" IS NULL AND "archived_at" IS NULL AND "completion_acknowledged_at" IS NULL)
  OR
  ("status" = 'archived' AND "archive_reason" IS NOT NULL AND "archived_at" IS NOT NULL)
);

-- Check: only a completed goal can have its completion acknowledged.
ALTER TABLE "goals" ADD CONSTRAINT "goals_ack_completed_only"
  CHECK ("completion_acknowledged_at" IS NULL OR "archive_reason" = 'completed');
