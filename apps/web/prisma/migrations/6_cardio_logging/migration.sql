-- Cardio Logging (Pitch 7) — HAND-WRITTEN, reviewed.
--
-- Additive only: one new table (planned_cardio) and new columns on the existing
-- cardio_logs table. No table/column is dropped or renamed, no row is inserted,
-- updated, or deleted, nothing cascades on delete, no RLS policy is added. The
-- new table gets Foundation's deny-all RLS (no policies). cardio_logs has never
-- been written (static guard since Foundation), so its new NOT NULL columns are
-- safe without a backfill; were a row ever present, this migration would fail
-- loudly and change nothing. No metric, gym, tag, trend, or e1RM column exists.

-- CreateTable: the cardio planned for one weekday of a mesocycle (the plan).
CREATE TABLE "planned_cardio" (
    "id" UUID NOT NULL,
    "mesocycle_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "planned_cardio_pkey" PRIMARY KEY ("id")
);

-- RLS: deny-all (no policies). Prisma is the only door.
ALTER TABLE "planned_cardio" ENABLE ROW LEVEL SECURITY;

-- CreateIndex: zero or one planned cardio item per weekday of a mesocycle.
CREATE UNIQUE INDEX "planned_cardio_mesocycle_id_day_of_week_key" ON "planned_cardio"("mesocycle_id", "day_of_week");

-- AddForeignKey: Restrict (mesocycles are never deleted; nothing cascades).
ALTER TABLE "planned_cardio" ADD CONSTRAINT "planned_cardio_mesocycle_id_fkey" FOREIGN KEY ("mesocycle_id") REFERENCES "mesocycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Check: a real weekday, whole positive minutes, and a trimmed non-empty type.
ALTER TABLE "planned_cardio" ADD CONSTRAINT "planned_cardio_day_valid"
  CHECK ("day_of_week" BETWEEN 1 AND 7);
ALTER TABLE "planned_cardio" ADD CONSTRAINT "planned_cardio_duration_valid"
  CHECK ("duration_min" BETWEEN 1 AND 600);
ALTER TABLE "planned_cardio" ADD CONSTRAINT "planned_cardio_type_valid"
  CHECK ("type" = btrim("type") AND char_length("type") BETWEEN 1 AND 40);

-- AlterTable: a CardioLog records one planned occurrence — identified by its
-- mesocycle and authored date — with an immutable snapshot of what was planned.
ALTER TABLE "cardio_logs"
  ADD COLUMN "mesocycle_id" UUID NOT NULL,
  ADD COLUMN "scheduled_for" DATE NOT NULL,
  ADD COLUMN "planned_type" TEXT NOT NULL,
  ADD COLUMN "planned_duration_min" INTEGER NOT NULL;

-- CreateIndex: at most one CardioLog per planned occurrence (the idempotency key).
CREATE UNIQUE INDEX "cardio_logs_mesocycle_id_scheduled_for_key" ON "cardio_logs"("mesocycle_id", "scheduled_for");

-- AddForeignKey: Restrict, so a mesocycle with cardio history can never be hard-deleted.
ALTER TABLE "cardio_logs" ADD CONSTRAINT "cardio_logs_mesocycle_id_fkey" FOREIGN KEY ("mesocycle_id") REFERENCES "mesocycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Check: actual and planned minutes are whole and positive; types are trimmed and non-empty.
ALTER TABLE "cardio_logs" ADD CONSTRAINT "cardio_logs_duration_valid"
  CHECK ("duration_min" BETWEEN 1 AND 600 AND "planned_duration_min" BETWEEN 1 AND 600);
ALTER TABLE "cardio_logs" ADD CONSTRAINT "cardio_logs_type_valid"
  CHECK ("type" = btrim("type") AND char_length("type") BETWEEN 1 AND 40
     AND "planned_type" = btrim("planned_type") AND char_length("planned_type") BETWEEN 1 AND 40);
