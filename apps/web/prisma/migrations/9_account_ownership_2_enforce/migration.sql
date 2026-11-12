-- Multi-User Foundation (Pitch 8) - Stage 3: ENFORCE.
--
-- Runs only AFTER Stage 2 (scripts/operator/account-ownership) has assigned
-- every pre-ownership row to the existing account. It:
--   1. refuses - before changing anything - if any owned row is unowned, a
--      custom exercise has no owner, a library exercise has one, or any row
--      already references a parent that belongs to a different account;
--   2. makes user_id NOT NULL on every owned table;
--   3. adds exercises_custom_is_owned (library <=> ownerless, custom <=> owned);
--   4. re-scopes the two rules that were global only because there was one
--      lifter: one active mesocycle, and one active goal per exercise, now
--      per account;
--   5. installs the database second layer: a same-owner trigger on every owned
--      relation (a child can only reference its own account's parents, or a
--      shared library exercise) and an ownership-immutability trigger on every
--      table with user_id.
--
-- The whole script runs as one statement batch, so it applies atomically: a
-- failure anywhere leaves the schema exactly as Stage 1 left it (verified by
-- the rehearsal tests). Nothing is inserted, deleted, dropped (other than the
-- two global indexes it replaces), or renamed, and no RLS policy is added.
-- ASCII only: the embedded test Postgres runs in WIN1252.

-- 1. Completeness guard ------------------------------------------------------
DO $$
DECLARE
  t text;
  n bigint;
  rel text[];
  relations text[][] := ARRAY[
    ARRAY['sessions', 'mesocycle_id', 'mesocycles'],
    ARRAY['session_exercises', 'session_id', 'sessions'],
    ARRAY['gym_exercise_baselines', 'gym_id', 'gyms'],
    ARRAY['logged_sessions', 'mesocycle_id', 'mesocycles'],
    ARRAY['logged_sessions', 'session_id', 'sessions'],
    ARRAY['logged_exercises', 'logged_session_id', 'logged_sessions'],
    ARRAY['logged_exercises', 'session_exercise_id', 'session_exercises'],
    ARRAY['logged_exercises', 'gym_id', 'gyms'],
    ARRAY['logged_sets', 'logged_exercise_id', 'logged_exercises'],
    ARRAY['missed_day_resolutions', 'mesocycle_id', 'mesocycles'],
    ARRAY['missed_day_resolutions', 'session_id', 'sessions'],
    ARRAY['goals', 'gym_id', 'gyms'],
    ARRAY['planned_cardio', 'mesocycle_id', 'mesocycles'],
    ARRAY['cardio_logs', 'mesocycle_id', 'mesocycles']
  ];
  exercise_refs text[][] := ARRAY[
    ARRAY['session_exercises', 'exercise_id'],
    ARRAY['gym_exercise_baselines', 'exercise_id'],
    ARRAY['logged_exercises', 'exercise_id'],
    ARRAY['logged_exercises', 'planned_exercise_id'],
    ARRAY['goals', 'exercise_id'],
    ARRAY['exercise_favorites', 'exercise_id']
  ];
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mesocycles', 'sessions', 'session_exercises', 'gyms',
    'gym_exercise_baselines', 'logged_sessions', 'logged_exercises',
    'logged_sets', 'missed_day_resolutions', 'goals', 'planned_cardio',
    'cardio_logs'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE user_id IS NULL', t) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'Ownership backfill incomplete: % has % row(s) without an owner. Run the Stage 2 backfill (scripts/operator/account-ownership) first; nothing was changed.', t, n;
    END IF;
  END LOOP;

  SELECT count(*) INTO n FROM "exercises" WHERE "is_custom" AND "user_id" IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Ownership backfill incomplete: % custom exercise(s) without an owner; nothing was changed.', n;
  END IF;
  SELECT count(*) INTO n FROM "exercises" WHERE NOT "is_custom" AND "user_id" IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION '% library exercise(s) have an owner; library rows must stay shared. Nothing was changed.', n;
  END IF;

  FOREACH rel SLICE 1 IN ARRAY relations LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I c JOIN %I p ON p.id = c.%I WHERE p.user_id IS DISTINCT FROM c.user_id',
      rel[1], rel[3], rel[2]) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION '% row(s) of %.% reference a % row of a different account; nothing was changed.', n, rel[1], rel[2], rel[3];
    END IF;
  END LOOP;
  FOREACH rel SLICE 1 IN ARRAY exercise_refs LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I c JOIN "exercises" e ON e.id = c.%I WHERE e.user_id IS NOT NULL AND e.user_id IS DISTINCT FROM c.user_id',
      rel[1], rel[2]) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION '% row(s) of %.% reference another account''s custom exercise; nothing was changed.', n, rel[1], rel[2];
    END IF;
  END LOOP;
END $$;

-- 2. Ownership becomes mandatory -------------------------------------------
-- AlterTable
ALTER TABLE "cardio_logs" ALTER COLUMN "user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "goals" ALTER COLUMN "user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "gym_exercise_baselines" ALTER COLUMN "user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "gyms" ALTER COLUMN "user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "logged_exercises" ALTER COLUMN "user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "logged_sessions" ALTER COLUMN "user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "logged_sets" ALTER COLUMN "user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "mesocycles" ALTER COLUMN "user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "missed_day_resolutions" ALTER COLUMN "user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "planned_cardio" ALTER COLUMN "user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "session_exercises" ALTER COLUMN "user_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "sessions" ALTER COLUMN "user_id" SET NOT NULL;

-- 3. Library rows are ownerless; custom rows are owned ----------------------
ALTER TABLE "exercises"
  ADD CONSTRAINT "exercises_custom_is_owned" CHECK (
    ("is_custom" AND "user_id" IS NOT NULL) OR (NOT "is_custom" AND "user_id" IS NULL)
  );

-- 4. Per-account uniqueness (replaces the single-lifter global rules) -------
DROP INDEX "mesocycles_single_active";
CREATE UNIQUE INDEX "mesocycles_single_active_per_user"
  ON "mesocycles"("user_id") WHERE "status" = 'active';

DROP INDEX "goals_one_active_per_exercise";
CREATE UNIQUE INDEX "goals_one_active_per_exercise_per_user"
  ON "goals"("user_id", "exercise_id") WHERE "status" = 'active';

-- 5. Database second layer --------------------------------------------------
-- A child row may only reference a parent of its own account. TG_ARGV:
-- parent table, foreign-key column, and whether an ownerless (shared library)
-- parent is allowed. A missing parent is left to the foreign key.
CREATE FUNCTION "overload_assert_same_owner"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
  AS $$
DECLARE
  parent_table text := TG_ARGV[0];
  fk_column text := TG_ARGV[1];
  allow_shared boolean := TG_ARGV[2]::boolean;
  fk_value uuid;
  parent_owner uuid;
  parent_rows bigint;
BEGIN
  EXECUTE format('SELECT ($1).%I', fk_column) USING NEW INTO fk_value;
  IF fk_value IS NULL THEN
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT user_id FROM %I WHERE id = $1', parent_table)
    USING fk_value INTO parent_owner;
  -- EXECUTE does not set FOUND; the row count is the only reliable signal.
  GET DIAGNOSTICS parent_rows = ROW_COUNT;
  IF parent_rows = 0 THEN
    RETURN NEW;
  END IF;
  IF parent_owner IS NULL AND allow_shared THEN
    RETURN NEW;
  END IF;
  IF parent_owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'cross-account reference refused: %.% must belong to the same account', TG_TABLE_NAME, fk_column
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- Ownership never changes once set.
CREATE FUNCTION "overload_user_id_immutable"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
  AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'ownership of a % row never changes', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- Not callable through the Data API's RPC endpoint (Pitch 2 precedent).
REVOKE ALL ON FUNCTION "overload_assert_same_owner"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "overload_user_id_immutable"() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION "overload_assert_same_owner"() FROM anon;
    REVOKE ALL ON FUNCTION "overload_user_id_immutable"() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION "overload_assert_same_owner"() FROM authenticated;
    REVOKE ALL ON FUNCTION "overload_user_id_immutable"() FROM authenticated;
  END IF;
END $$;

CREATE TRIGGER "sessions_same_owner_mesocycle_id"
  BEFORE INSERT OR UPDATE OF "mesocycle_id", "user_id" ON "sessions"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('mesocycles', 'mesocycle_id', 'false');

CREATE TRIGGER "session_exercises_same_owner_session_id"
  BEFORE INSERT OR UPDATE OF "session_id", "user_id" ON "session_exercises"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('sessions', 'session_id', 'false');
CREATE TRIGGER "session_exercises_same_owner_exercise_id"
  BEFORE INSERT OR UPDATE OF "exercise_id", "user_id" ON "session_exercises"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('exercises', 'exercise_id', 'true');

CREATE TRIGGER "gym_exercise_baselines_same_owner_gym_id"
  BEFORE INSERT OR UPDATE OF "gym_id", "user_id" ON "gym_exercise_baselines"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('gyms', 'gym_id', 'false');
CREATE TRIGGER "gym_exercise_baselines_same_owner_exercise_id"
  BEFORE INSERT OR UPDATE OF "exercise_id", "user_id" ON "gym_exercise_baselines"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('exercises', 'exercise_id', 'true');

CREATE TRIGGER "logged_sessions_same_owner_mesocycle_id"
  BEFORE INSERT OR UPDATE OF "mesocycle_id", "user_id" ON "logged_sessions"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('mesocycles', 'mesocycle_id', 'false');
CREATE TRIGGER "logged_sessions_same_owner_session_id"
  BEFORE INSERT OR UPDATE OF "session_id", "user_id" ON "logged_sessions"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('sessions', 'session_id', 'false');

CREATE TRIGGER "logged_exercises_same_owner_logged_session_id"
  BEFORE INSERT OR UPDATE OF "logged_session_id", "user_id" ON "logged_exercises"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('logged_sessions', 'logged_session_id', 'false');
CREATE TRIGGER "logged_exercises_same_owner_exercise_id"
  BEFORE INSERT OR UPDATE OF "exercise_id", "user_id" ON "logged_exercises"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('exercises', 'exercise_id', 'true');
CREATE TRIGGER "logged_exercises_same_owner_planned_exercise_id"
  BEFORE INSERT OR UPDATE OF "planned_exercise_id", "user_id" ON "logged_exercises"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('exercises', 'planned_exercise_id', 'true');
CREATE TRIGGER "logged_exercises_same_owner_session_exercise_id"
  BEFORE INSERT OR UPDATE OF "session_exercise_id", "user_id" ON "logged_exercises"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('session_exercises', 'session_exercise_id', 'false');
CREATE TRIGGER "logged_exercises_same_owner_gym_id"
  BEFORE INSERT OR UPDATE OF "gym_id", "user_id" ON "logged_exercises"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('gyms', 'gym_id', 'false');

CREATE TRIGGER "logged_sets_same_owner_logged_exercise_id"
  BEFORE INSERT OR UPDATE OF "logged_exercise_id", "user_id" ON "logged_sets"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('logged_exercises', 'logged_exercise_id', 'false');

CREATE TRIGGER "missed_day_resolutions_same_owner_mesocycle_id"
  BEFORE INSERT OR UPDATE OF "mesocycle_id", "user_id" ON "missed_day_resolutions"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('mesocycles', 'mesocycle_id', 'false');
CREATE TRIGGER "missed_day_resolutions_same_owner_session_id"
  BEFORE INSERT OR UPDATE OF "session_id", "user_id" ON "missed_day_resolutions"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('sessions', 'session_id', 'false');

CREATE TRIGGER "goals_same_owner_exercise_id"
  BEFORE INSERT OR UPDATE OF "exercise_id", "user_id" ON "goals"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('exercises', 'exercise_id', 'true');
CREATE TRIGGER "goals_same_owner_gym_id"
  BEFORE INSERT OR UPDATE OF "gym_id", "user_id" ON "goals"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('gyms', 'gym_id', 'false');

CREATE TRIGGER "planned_cardio_same_owner_mesocycle_id"
  BEFORE INSERT OR UPDATE OF "mesocycle_id", "user_id" ON "planned_cardio"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('mesocycles', 'mesocycle_id', 'false');

CREATE TRIGGER "cardio_logs_same_owner_mesocycle_id"
  BEFORE INSERT OR UPDATE OF "mesocycle_id", "user_id" ON "cardio_logs"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('mesocycles', 'mesocycle_id', 'false');

CREATE TRIGGER "exercise_favorites_same_owner_exercise_id"
  BEFORE INSERT OR UPDATE OF "exercise_id", "user_id" ON "exercise_favorites"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('exercises', 'exercise_id', 'true');

CREATE TRIGGER "profiles_user_id_immutable" BEFORE UPDATE OF "user_id" ON "profiles"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "mesocycles_user_id_immutable" BEFORE UPDATE OF "user_id" ON "mesocycles"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "sessions_user_id_immutable" BEFORE UPDATE OF "user_id" ON "sessions"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "session_exercises_user_id_immutable" BEFORE UPDATE OF "user_id" ON "session_exercises"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "exercises_user_id_immutable" BEFORE UPDATE OF "user_id" ON "exercises"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "exercise_favorites_user_id_immutable" BEFORE UPDATE OF "user_id" ON "exercise_favorites"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "gyms_user_id_immutable" BEFORE UPDATE OF "user_id" ON "gyms"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "gym_exercise_baselines_user_id_immutable" BEFORE UPDATE OF "user_id" ON "gym_exercise_baselines"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "logged_sessions_user_id_immutable" BEFORE UPDATE OF "user_id" ON "logged_sessions"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "logged_exercises_user_id_immutable" BEFORE UPDATE OF "user_id" ON "logged_exercises"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "logged_sets_user_id_immutable" BEFORE UPDATE OF "user_id" ON "logged_sets"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "missed_day_resolutions_user_id_immutable" BEFORE UPDATE OF "user_id" ON "missed_day_resolutions"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "goals_user_id_immutable" BEFORE UPDATE OF "user_id" ON "goals"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "planned_cardio_user_id_immutable" BEFORE UPDATE OF "user_id" ON "planned_cardio"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "cardio_logs_user_id_immutable" BEFORE UPDATE OF "user_id" ON "cardio_logs"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
