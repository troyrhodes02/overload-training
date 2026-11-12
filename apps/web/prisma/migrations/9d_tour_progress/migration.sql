-- Onboarding Tour: per-account tour progress (spec 11 section 8).
--
-- Additive: one enum type and one new, empty owned table. No existing table
-- or column changes, and no row is written: a new account's row is created
-- DUE when its profile is established at signup, so every account that exists
-- when this migration runs has no row and is never toured automatically
-- (standing resolution: treated as already offered; it can replay from
-- Settings). RLS is enabled with NO policies (deny-all), so the Data API sees
-- nothing; Prisma bypasses RLS. Ownership is immutable (shared trigger
-- function from 9_account_ownership_2_enforce). The only foreign key is to the
-- owner's own profile, so no same-owner trigger applies.
-- ASCII only: the embedded test Postgres runs in WIN1252.

CREATE TYPE "tour_outcome" AS ENUM ('completed', 'skipped');

CREATE TABLE "tour_progress" (
    "user_id" UUID NOT NULL,
    "offered_at" TIMESTAMPTZ,
    "outcome" "tour_outcome",
    "outcome_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tour_progress_pkey" PRIMARY KEY ("user_id"),
    -- An outcome always carries its time, and a time never stands alone.
    CONSTRAINT "tour_progress_outcome_at_check" CHECK (("outcome" IS NULL) = ("outcome_at" IS NULL))
);

ALTER TABLE "tour_progress" ADD CONSTRAINT "tour_progress_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Deny-all. Do not add policies for anon or authenticated.
ALTER TABLE "tour_progress" ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER "tour_progress_user_id_immutable" BEFORE UPDATE OF "user_id" ON "tour_progress"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
