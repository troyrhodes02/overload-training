-- Library & Gyms Setup (Pitch 2) — Exercise classification, provenance,
-- favorites; non-blank names. HAND-WRITTEN, reviewed.
--
-- Prisma's generated diff for the String -> enum change is DROP COLUMN +
-- ADD COLUMN, which would destroy data. This migration converts the existing
-- columns IN PLACE with ALTER COLUMN ... TYPE ... USING, so any existing rows
-- are preserved, and a value outside the canonical vocabulary makes the
-- migration FAIL LOUDLY rather than lose data. No table is created or dropped,
-- no column is dropped or renamed, and no row is inserted.

-- CreateEnum
CREATE TYPE "MuscleGroup" AS ENUM ('chest', 'back', 'lower_back', 'traps', 'shoulders', 'biceps', 'triceps', 'forearms', 'core', 'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'neck');

-- CreateEnum
CREATE TYPE "Equipment" AS ENUM ('barbell', 'ez_bar', 'dumbbell', 'kettlebell', 'cable', 'machine', 'plate_loaded', 'bodyweight', 'band', 'medicine_ball', 'exercise_ball', 'foam_roller', 'other');

-- AlterTable (in place; the muscle_group index survives the type change)
ALTER TABLE "exercises"
  ALTER COLUMN "muscle_group" TYPE "MuscleGroup" USING "muscle_group"::"MuscleGroup",
  ALTER COLUMN "equipment_type" TYPE "Equipment" USING "equipment_type"::"Equipment",
  ADD COLUMN "secondary_muscles" "MuscleGroup"[] NOT NULL DEFAULT ARRAY[]::"MuscleGroup"[],
  ADD COLUMN "source_id" TEXT,
  ADD COLUMN "is_favorite" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "exercises_source_id_key" ON "exercises"("source_id");

-- Helper for the "no duplicate secondary muscles" CHECK (a CHECK constraint
-- cannot contain a subquery). Pure and data-free. EXECUTE is revoked from
-- PUBLIC and from Supabase's anon/authenticated roles, so it is not callable
-- through the Data API's RPC endpoint either.
CREATE FUNCTION "overload_array_is_distinct"(anyarray) RETURNS boolean
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  AS $$ SELECT count(*) = count(DISTINCT x) FROM unnest($1) AS t(x) $$;

REVOKE ALL ON FUNCTION "overload_array_is_distinct"(anyarray) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION "overload_array_is_distinct"(anyarray) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION "overload_array_is_distinct"(anyarray) FROM authenticated;
  END IF;
END $$;

-- Classification and provenance invariants, enforced by the database as a
-- second layer behind application validation.
ALTER TABLE "exercises"
  -- A name is required and may not be blank (names are NOT unique, by design).
  ADD CONSTRAINT "exercises_name_not_blank" CHECK (char_length(btrim("name")) > 0),
  -- The primary muscle never also appears as a secondary muscle.
  ADD CONSTRAINT "exercises_secondary_excludes_primary" CHECK (NOT ("muscle_group" = ANY ("secondary_muscles"))),
  -- A secondary muscle is listed at most once.
  ADD CONSTRAINT "exercises_secondary_distinct" CHECK ("overload_array_is_distinct"("secondary_muscles")),
  -- Imported rows carry a source id; custom rows never do.
  ADD CONSTRAINT "exercises_provenance" CHECK (("is_custom" AND "source_id" IS NULL) OR (NOT "is_custom" AND "source_id" IS NOT NULL)),
  -- Custom exercises have no image.
  ADD CONSTRAINT "exercises_custom_has_no_image" CHECK (NOT "is_custom" OR "image_ref" IS NULL);

ALTER TABLE "gyms"
  ADD CONSTRAINT "gyms_name_not_blank" CHECK (char_length(btrim("name")) > 0);

-- Row-level security: no table is created by this migration, so every table
-- keeps Foundation's deny-all RLS with NO policies. Do not add a policy here.
