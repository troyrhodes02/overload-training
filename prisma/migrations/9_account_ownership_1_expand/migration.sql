-- Multi-User Foundation (Pitch 8) -- Stage 1: EXPAND.
--
-- Additive only. Ownership becomes representable without being required, so
-- this migration coexists with every existing row and with the pre-pitch code
-- (which keeps writing NULL user_id until it is replaced):
--   * profiles            -- one row per account (PK = Supabase auth user id),
--                           holding the account's IANA timezone.
--   * exercise_favorites  -- per-account favorites (replaces the shared
--                           exercises.is_favorite flag, which stays in place,
--                           unread and unwritten -- spec R12).
--   * user_id UUID NULL   -- on every owned table and on exercises (NULL there
--                           means a shared library row), FK -> profiles
--                           ON DELETE RESTRICT ON UPDATE RESTRICT, indexed.
--
-- Nothing is backfilled, dropped, renamed, inserted, or made NOT NULL here.
-- Stage 2 (scripts/operator/account-ownership) assigns every existing row to
-- the named account; Stage 3 (9_account_ownership_2_enforce) makes ownership
-- mandatory only after that is proven complete. Both new tables get
-- row-level security with no policy (deny-all), like every other table.

-- AlterTable
ALTER TABLE "cardio_logs" ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "exercises" ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "goals" ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "gym_exercise_baselines" ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "gyms" ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "logged_exercises" ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "logged_sessions" ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "logged_sets" ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "mesocycles" ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "missed_day_resolutions" ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "planned_cardio" ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "session_exercises" ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "user_id" UUID;

-- CreateTable
CREATE TABLE "profiles" (
    "user_id" UUID NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "time_zone" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "exercise_favorites" (
    "user_id" UUID NOT NULL,
    "exercise_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_favorites_pkey" PRIMARY KEY ("user_id","exercise_id")
);

-- CreateIndex
CREATE INDEX "exercise_favorites_exercise_id_idx" ON "exercise_favorites"("exercise_id");

-- CreateIndex
CREATE INDEX "cardio_logs_user_id_idx" ON "cardio_logs"("user_id");

-- CreateIndex
CREATE INDEX "exercises_user_id_idx" ON "exercises"("user_id");

-- CreateIndex
CREATE INDEX "goals_user_id_idx" ON "goals"("user_id");

-- CreateIndex
CREATE INDEX "gym_exercise_baselines_user_id_idx" ON "gym_exercise_baselines"("user_id");

-- CreateIndex
CREATE INDEX "gyms_user_id_idx" ON "gyms"("user_id");

-- CreateIndex
CREATE INDEX "logged_exercises_user_id_idx" ON "logged_exercises"("user_id");

-- CreateIndex
CREATE INDEX "logged_sessions_user_id_idx" ON "logged_sessions"("user_id");

-- CreateIndex
CREATE INDEX "logged_sets_user_id_idx" ON "logged_sets"("user_id");

-- CreateIndex
CREATE INDEX "mesocycles_user_id_idx" ON "mesocycles"("user_id");

-- CreateIndex
CREATE INDEX "missed_day_resolutions_user_id_idx" ON "missed_day_resolutions"("user_id");

-- CreateIndex
CREATE INDEX "planned_cardio_user_id_idx" ON "planned_cardio"("user_id");

-- CreateIndex
CREATE INDEX "session_exercises_user_id_idx" ON "session_exercises"("user_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- AddForeignKey
ALTER TABLE "mesocycles" ADD CONSTRAINT "mesocycles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gyms" ADD CONSTRAINT "gyms_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gym_exercise_baselines" ADD CONSTRAINT "gym_exercise_baselines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "logged_sessions" ADD CONSTRAINT "logged_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "logged_exercises" ADD CONSTRAINT "logged_exercises_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "missed_day_resolutions" ADD CONSTRAINT "missed_day_resolutions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "logged_sets" ADD CONSTRAINT "logged_sets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "planned_cardio" ADD CONSTRAINT "planned_cardio_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cardio_logs" ADD CONSTRAINT "cardio_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "exercise_favorites" ADD CONSTRAINT "exercise_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "exercise_favorites" ADD CONSTRAINT "exercise_favorites_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security: deny-all on both new tables. No policy is added; the
-- Data API returns nothing, and Prisma remains the only door.
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exercise_favorites" ENABLE ROW LEVEL SECURITY;
