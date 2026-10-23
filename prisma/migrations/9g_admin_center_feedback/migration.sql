-- Admin Center & Feedback (spec 17 section 8).
--
-- Additive only. Every existing profile becomes `active` with no last-active
-- date; no other row is written. Two new tables:
--   feedback             - OWNED by the sender (user_id -> profiles, RESTRICT),
--                          removed with the account by the deletion module.
--   admin_audit_entries  - ADMIN-ONLY: no owner column and no foreign keys
--                          (spec R11), append-only by trigger.
-- RLS is enabled with NO policies (deny-all) on both, so the Data API sees
-- nothing; Prisma bypasses RLS. ASCII only: the embedded test Postgres runs
-- in WIN1252.

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('bug', 'idea', 'question', 'other');

-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('account_suspend', 'account_reactivate', 'feedback_handled', 'feedback_reopened', 'feedback_recategorized');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "last_active_on" DATE,
ADD COLUMN     "status" "AccountStatus" NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" "FeedbackCategory" NOT NULL,
    "message" TEXT NOT NULL,
    "handled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id"),
    -- Stored trimmed (src/lib/feedback/validation.ts), 1-2000 characters.
    CONSTRAINT "feedback_message_check"
      CHECK ("message" = btrim("message") AND char_length("message") BETWEEN 1 AND 2000)
);

-- CreateTable
CREATE TABLE "admin_audit_entries" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "kind" "AdminAuditAction" NOT NULL,
    "target_user_id" UUID NOT NULL,
    "feedback_id" UUID,
    "detail" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_entries_pkey" PRIMARY KEY ("id"),
    -- detail carries {from, to} for a recategorization and nothing otherwise.
    CONSTRAINT "admin_audit_entries_detail_check"
      CHECK (("kind" = 'feedback_recategorized') = ("detail" IS NOT NULL)),
    -- feedback actions name their feedback row; account actions do not.
    CONSTRAINT "admin_audit_entries_feedback_check"
      CHECK (("kind" IN ('feedback_handled', 'feedback_reopened', 'feedback_recategorized')) = ("feedback_id" IS NOT NULL))
);

-- CreateIndex
CREATE INDEX "feedback_user_id_created_at_idx" ON "feedback"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "feedback_handled_at_created_at_idx" ON "feedback"("handled_at", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_entries_created_at_idx" ON "admin_audit_entries"("created_at");

-- CreateIndex
CREATE INDEX "admin_audit_entries_target_user_id_created_at_idx" ON "admin_audit_entries"("target_user_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_entries_feedback_id_idx" ON "admin_audit_entries"("feedback_id");

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Ownership never changes (shared trigger function from 9_account_ownership_2_enforce).
CREATE TRIGGER "feedback_user_id_immutable" BEFORE UPDATE OF "user_id" ON "feedback"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();

-- The audit log is append-only: no UPDATE and no DELETE, from any path.
CREATE FUNCTION "overload_reject_change"() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
  AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END $$;

-- Not callable through the Data API's RPC endpoint (Pitch 2 precedent).
REVOKE ALL ON FUNCTION "overload_reject_change"() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION "overload_reject_change"() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION "overload_reject_change"() FROM authenticated;
  END IF;
END $$;

CREATE TRIGGER "admin_audit_entries_append_only" BEFORE UPDATE OR DELETE ON "admin_audit_entries"
  FOR EACH ROW EXECUTE FUNCTION "overload_reject_change"();

-- Deny-all. Do not add policies for anon or authenticated.
ALTER TABLE "feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_audit_entries" ENABLE ROW LEVEL SECURITY;
