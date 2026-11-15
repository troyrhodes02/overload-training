-- Prescription-Aware Intelligence (spec §8; RD-2..RD-4): every session gets a
-- durable recurring-workout identity. Additive and non-destructive: one new
-- column on "sessions", backfilled to each row's own id (a self-reference, so
-- no relationship between rows or accounts is created), then NOT NULL, unique
-- per mesocycle, indexed, and immutable. No logged table is touched. New rows
-- get a fresh value from Prisma's client-side uuid default (no DB default);
-- cloneMesocycle copies the source session's value.

ALTER TABLE "sessions" ADD COLUMN "lineage_id" UUID;

UPDATE "sessions" SET "lineage_id" = "id" WHERE "lineage_id" IS NULL;

ALTER TABLE "sessions" ALTER COLUMN "lineage_id" SET NOT NULL;

CREATE UNIQUE INDEX "sessions_mesocycle_id_lineage_id_key"
  ON "sessions"("mesocycle_id", "lineage_id");

CREATE INDEX "sessions_lineage_id_idx" ON "sessions"("lineage_id");

-- A session's lineage never changes (the same posture as user_id, Pitch 8).
CREATE FUNCTION "overload_session_lineage_immutable"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
  AS $$
BEGIN
  IF NEW.lineage_id IS DISTINCT FROM OLD.lineage_id THEN
    RAISE EXCEPTION 'a session''s lineage never changes'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- Not callable through the Data API's RPC endpoint (Pitch 2 precedent).
REVOKE ALL ON FUNCTION "overload_session_lineage_immutable"() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION "overload_session_lineage_immutable"() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION "overload_session_lineage_immutable"() FROM authenticated;
  END IF;
END $$;

CREATE TRIGGER "sessions_lineage_id_immutable"
  BEFORE UPDATE OF "lineage_id" ON "sessions"
  FOR EACH ROW EXECUTE FUNCTION "overload_session_lineage_immutable"();
