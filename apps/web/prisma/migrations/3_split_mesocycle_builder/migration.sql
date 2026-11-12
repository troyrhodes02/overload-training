-- Split & Mesocycle Builder (Pitch 3) — part 2 of 2. HAND-WRITTEN, reviewed.
--
-- Plan lifecycle and plan-shape invariants (spec "Data Model", D38–D41, D49,
-- D61). Columns are converted IN PLACE with ALTER COLUMN ... TYPE ... USING,
-- so any existing rows are preserved, and a value outside the new vocabulary
-- makes the migration FAIL LOUDLY rather than lose data. No table is created
-- or dropped, no column is dropped or renamed, and no row is inserted or
-- deleted. Every table keeps Foundation's deny-all RLS with NO policies.

-- CreateEnum: the structure a mesocycle started from (a label only).
CREATE TYPE "SplitType" AS ENUM ('ppl', 'arnold', 'bro', 'custom');

-- Mesocycles: drafts by default; split type as an enum; start date as a
-- calendar date (no time, no zone).
ALTER TABLE "mesocycles"
  ALTER COLUMN "status" SET DEFAULT 'draft',
  ALTER COLUMN "split_type" TYPE "SplitType" USING "split_type"::"SplitType",
  ALTER COLUMN "start_date" TYPE DATE USING ("start_date" AT TIME ZONE 'UTC')::date;

ALTER TABLE "mesocycles"
  ADD CONSTRAINT "mesocycles_name_not_blank" CHECK (char_length(btrim("name")) > 0),
  ADD CONSTRAINT "mesocycles_length_weeks_positive" CHECK ("length_weeks" >= 1),
  ADD CONSTRAINT "mesocycles_deload_week_positive" CHECK ("deload_week" >= 1),
  -- A draft may be incomplete; the live plan may not (spec D5, D7, D61).
  ADD CONSTRAINT "mesocycles_active_is_well_formed" CHECK (
    "status" <> 'active' OR ("start_date" IS NOT NULL AND "deload_week" <= "length_weeks")
  );

-- CreateIndex
CREATE INDEX "mesocycles_status_idx" ON "mesocycles"("status");

-- At most one active mesocycle (spec D2, D49). Prisma cannot express a partial
-- index; `prisma migrate diff` ignores it, so the schema-drift guard holds.
CREATE UNIQUE INDEX "mesocycles_single_active" ON "mesocycles"("status") WHERE "status" = 'active';

-- Sessions: a name is required; days are ISO weekdays 1 (Mon) … 7 (Sun) or
-- NULL (not on the schedule); zero or one session per weekday (spec D14, D41).
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_name_not_blank" CHECK (char_length(btrim("name")) > 0),
  ADD CONSTRAINT "sessions_day_of_week_range" CHECK ("day_of_week" IS NULL OR "day_of_week" BETWEEN 1 AND 7);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_mesocycle_id_day_of_week_key" ON "sessions"("mesocycle_id", "day_of_week");

-- Planned exercises: positive set count, positive and ordered rep range, one
-- occurrence of an exercise per session (spec D20–D22).
ALTER TABLE "session_exercises"
  ADD CONSTRAINT "session_exercises_planned_sets_positive" CHECK ("planned_sets" >= 1),
  ADD CONSTRAINT "session_exercises_rep_min_positive" CHECK ("target_rep_min" >= 1),
  ADD CONSTRAINT "session_exercises_rep_range_ordered" CHECK ("target_rep_max" >= "target_rep_min");

-- CreateIndex
CREATE UNIQUE INDEX "session_exercises_session_id_exercise_id_key" ON "session_exercises"("session_id", "exercise_id");

-- Row-level security: no table is created by this migration, so every table
-- keeps Foundation's deny-all RLS with NO policies. Do not add a policy here.
