-- Wing-It Workouts (Pitch 25, OVE-267). HAND-WRITTEN, reviewed.
--
-- Additive only. No table or column is dropped, renamed, or truncated, and no
-- existing row is rewritten: every existing logged session becomes
-- kind = 'planned' through the column default.
--
--   logged_sessions.kind: 'planned' (an occurrence of a Session in a
--     Mesocycle, every row before this migration) or 'wing_it' (a workout with
--     no plan). The shape of each kind is a CHECK. A kind never changes.
--   logged_sessions.gym_id: the workout gym of a Wing-It workout, which exists
--     before it has any exercise. NULL on every planned workout (its gym stays
--     on its exercises, unchanged). RESTRICT, same-owner trigger.
--   One OPEN Wing-It workout per account: a partial unique index, so a retried
--     or concurrent start can never create a second one.
--   logged_exercises plan snapshot (planned_sets, target_rep_min,
--     target_rep_max) becomes nullable: all three set, or all three NULL for an
--     open-ended exercise of a Wing-It workout (no invented target). A trigger
--     ties a NULL snapshot to a Wing-It parent and a set one to a planned
--     parent.
--
-- No new table, so no RLS change (every table stays deny-all).
-- Applied to production only by a human, from the runbook, after a backup.
-- ASCII only: the embedded test Postgres runs in WIN1252.

CREATE TYPE "LoggedSessionKind" AS ENUM ('planned', 'wing_it');

ALTER TABLE "logged_sessions"
  ADD COLUMN "kind" "LoggedSessionKind" NOT NULL DEFAULT 'planned',
  ADD COLUMN "gym_id" UUID;

ALTER TABLE "logged_sessions" ADD CONSTRAINT "logged_sessions_gym_id_fkey"
  FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A Wing-It workout has no session and no mesocycle, and has a gym. A planned
-- workout never has a session gym; its session and mesocycle are written by
-- its one writer (startOrResumeWorkout) as before, and the database has never
-- required them, so this does not start to (spec RD-16). Every existing row
-- (kind = 'planned', gym_id NULL) satisfies it.
ALTER TABLE "logged_sessions" ADD CONSTRAINT "logged_sessions_kind_shape_check" CHECK (
  ("kind" = 'planned' AND "gym_id" IS NULL)
  OR ("kind" = 'wing_it' AND "session_id" IS NULL AND "mesocycle_id" IS NULL AND "gym_id" IS NOT NULL)
);

CREATE UNIQUE INDEX "logged_sessions_one_open_wing_it_per_user"
  ON "logged_sessions" ("user_id") WHERE "kind" = 'wing_it' AND "status" = 'in_progress';
CREATE INDEX "logged_sessions_gym_id_idx" ON "logged_sessions" ("gym_id");

-- Every owned parent has the same owner (shared trigger, 9_account_ownership_2_enforce).
CREATE TRIGGER "logged_sessions_same_owner_gym_id"
  BEFORE INSERT OR UPDATE OF "gym_id", "user_id" ON "logged_sessions"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('gyms', 'gym_id', 'false');

-- A workout's kind is what it recorded; it never changes.
CREATE FUNCTION "overload_logged_session_kind_immutable"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
  AS $$
BEGIN
  IF NEW."kind" IS DISTINCT FROM OLD."kind" THEN
    RAISE EXCEPTION 'logged_sessions.kind is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "logged_sessions_kind_immutable"
  BEFORE UPDATE OF "kind" ON "logged_sessions"
  FOR EACH ROW EXECUTE FUNCTION "overload_logged_session_kind_immutable"();

ALTER TABLE "logged_exercises"
  ALTER COLUMN "planned_sets" DROP NOT NULL,
  ALTER COLUMN "target_rep_min" DROP NOT NULL,
  ALTER COLUMN "target_rep_max" DROP NOT NULL;

ALTER TABLE "logged_exercises" ADD CONSTRAINT "logged_exercises_plan_snapshot_check" CHECK (
  ("planned_sets" IS NOT NULL AND "target_rep_min" IS NOT NULL AND "target_rep_max" IS NOT NULL)
  OR ("planned_sets" IS NULL AND "target_rep_min" IS NULL AND "target_rep_max" IS NULL
      AND "session_exercise_id" IS NULL)
);

-- A NULL snapshot only under a Wing-It workout; a set one only under a planned one.
CREATE FUNCTION "overload_logged_exercise_snapshot_matches_kind"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
  AS $$
DECLARE
  parent_kind "LoggedSessionKind";
BEGIN
  SELECT "kind" INTO parent_kind FROM "logged_sessions" WHERE "id" = NEW."logged_session_id";
  IF parent_kind IS NULL THEN
    RETURN NEW; -- the foreign key reports a missing parent
  END IF;
  IF parent_kind = 'wing_it' AND NEW."planned_sets" IS NOT NULL THEN
    RAISE EXCEPTION 'a Wing-It workout exercise has no plan snapshot'
      USING ERRCODE = 'check_violation';
  END IF;
  IF parent_kind = 'planned' AND NEW."planned_sets" IS NULL THEN
    RAISE EXCEPTION 'a planned workout exercise keeps its plan snapshot'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "logged_exercises_snapshot_matches_kind"
  BEFORE INSERT OR UPDATE OF "planned_sets", "target_rep_min", "target_rep_max", "logged_session_id"
  ON "logged_exercises"
  FOR EACH ROW EXECUTE FUNCTION "overload_logged_exercise_snapshot_matches_kind"();

REVOKE ALL ON FUNCTION "overload_logged_session_kind_immutable"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "overload_logged_exercise_snapshot_matches_kind"() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION "overload_logged_session_kind_immutable"() FROM anon;
    REVOKE ALL ON FUNCTION "overload_logged_exercise_snapshot_matches_kind"() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION "overload_logged_session_kind_immutable"() FROM authenticated;
    REVOKE ALL ON FUNCTION "overload_logged_exercise_snapshot_matches_kind"() FROM authenticated;
  END IF;
END $$;
