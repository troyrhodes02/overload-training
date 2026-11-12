-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MesocycleStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('active', 'archived');

-- CreateTable
CREATE TABLE "mesocycles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "length_weeks" INTEGER NOT NULL,
    "deload_week" INTEGER NOT NULL,
    "split_type" TEXT NOT NULL,
    "status" "MesocycleStatus" NOT NULL DEFAULT 'active',
    "start_date" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "mesocycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "mesocycle_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "day_of_week" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_exercises" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "planned_sets" INTEGER NOT NULL,
    "target_rep_min" INTEGER NOT NULL,
    "target_rep_max" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "session_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "muscle_group" TEXT NOT NULL,
    "equipment_type" TEXT NOT NULL,
    "image_ref" TEXT,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gyms" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "gyms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_exercise_baselines" (
    "id" UUID NOT NULL,
    "gym_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "weight_lbs" DECIMAL(6,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "gym_exercise_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logged_sessions" (
    "id" UUID NOT NULL,
    "mesocycle_id" UUID,
    "session_id" UUID,
    "performed_on" TIMESTAMPTZ NOT NULL,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "logged_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logged_exercises" (
    "id" UUID NOT NULL,
    "logged_session_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "gym_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "logged_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logged_sets" (
    "id" UUID NOT NULL,
    "logged_exercise_id" UUID NOT NULL,
    "set_number" INTEGER NOT NULL,
    "weight_lbs" DECIMAL(6,2) NOT NULL,
    "reps" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "logged_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "target_weight_lbs" DECIMAL(6,2) NOT NULL,
    "target_reps" INTEGER NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cardio_logs" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "performed_on" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cardio_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sessions_mesocycle_id_idx" ON "sessions"("mesocycle_id");

-- CreateIndex
CREATE INDEX "session_exercises_session_id_position_idx" ON "session_exercises"("session_id", "position");

-- CreateIndex
CREATE INDEX "session_exercises_exercise_id_idx" ON "session_exercises"("exercise_id");

-- CreateIndex
CREATE INDEX "exercises_muscle_group_idx" ON "exercises"("muscle_group");

-- CreateIndex
CREATE INDEX "exercises_deleted_at_idx" ON "exercises"("deleted_at");

-- CreateIndex
CREATE INDEX "gyms_deleted_at_idx" ON "gyms"("deleted_at");

-- CreateIndex
CREATE INDEX "gym_exercise_baselines_exercise_id_idx" ON "gym_exercise_baselines"("exercise_id");

-- CreateIndex
CREATE UNIQUE INDEX "gym_exercise_baselines_gym_id_exercise_id_key" ON "gym_exercise_baselines"("gym_id", "exercise_id");

-- CreateIndex
CREATE INDEX "logged_sessions_performed_on_idx" ON "logged_sessions"("performed_on");

-- CreateIndex
CREATE INDEX "logged_sessions_mesocycle_id_idx" ON "logged_sessions"("mesocycle_id");

-- CreateIndex
CREATE INDEX "logged_exercises_logged_session_id_position_idx" ON "logged_exercises"("logged_session_id", "position");

-- CreateIndex
CREATE INDEX "logged_exercises_exercise_id_idx" ON "logged_exercises"("exercise_id");

-- CreateIndex
CREATE INDEX "logged_exercises_gym_id_idx" ON "logged_exercises"("gym_id");

-- CreateIndex
CREATE UNIQUE INDEX "logged_sets_logged_exercise_id_set_number_key" ON "logged_sets"("logged_exercise_id", "set_number");

-- CreateIndex
CREATE INDEX "goals_exercise_id_idx" ON "goals"("exercise_id");

-- CreateIndex
CREATE INDEX "cardio_logs_performed_on_idx" ON "cardio_logs"("performed_on");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_mesocycle_id_fkey" FOREIGN KEY ("mesocycle_id") REFERENCES "mesocycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_exercise_baselines" ADD CONSTRAINT "gym_exercise_baselines_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_exercise_baselines" ADD CONSTRAINT "gym_exercise_baselines_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logged_sessions" ADD CONSTRAINT "logged_sessions_mesocycle_id_fkey" FOREIGN KEY ("mesocycle_id") REFERENCES "mesocycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logged_sessions" ADD CONSTRAINT "logged_sessions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logged_exercises" ADD CONSTRAINT "logged_exercises_logged_session_id_fkey" FOREIGN KEY ("logged_session_id") REFERENCES "logged_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logged_exercises" ADD CONSTRAINT "logged_exercises_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logged_exercises" ADD CONSTRAINT "logged_exercises_gym_id_fkey" FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logged_sets" ADD CONSTRAINT "logged_sets_logged_exercise_id_fkey" FOREIGN KEY ("logged_exercise_id") REFERENCES "logged_exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security: DENY-ALL on every table.
-- Prisma connects directly to Postgres and bypasses RLS (as the table owner),
-- so this does not affect application queries. It closes Supabase's public
-- Data API, which is reachable with the anon key: with RLS enabled and NO
-- policies, the Data API returns nothing. Every table is covered, including
-- _prisma_migrations (also reachable through the Data API).
--
-- Do NOT add a policy for the anon or authenticated role to make a query work.
-- Application data goes through Prisma; RLS stays deny-all.
ALTER TABLE "mesocycles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session_exercises" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exercises" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gyms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gym_exercise_baselines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "logged_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "logged_exercises" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "logged_sets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cardio_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
