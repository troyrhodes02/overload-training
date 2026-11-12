-- Admin Center & Feedback: screenshots a lifter attaches to a feedback message.
--
-- Additive: one new owned table. The image bytes live in the private
-- feedback-screenshots Storage bucket (written and read only by the service
-- role, deny-all like every app table); this row holds only the object path and
-- metadata. RLS is enabled with NO policies (deny-all), so the Data API sees
-- nothing; Prisma bypasses RLS. Ownership is immutable (shared trigger function
-- from 9_account_ownership_2_enforce). Foreign keys to the owner's profile and
-- to the parent feedback row are both ON DELETE RESTRICT, so account deletion
-- removes attachments explicitly (before their Feedback parent) and history
-- never cascades away.
-- ASCII only: the embedded test Postgres runs in WIN1252.

CREATE TABLE "feedback_attachments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "feedback_id" UUID NOT NULL,
    "object_path" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_attachments_pkey" PRIMARY KEY ("id"),
    -- The image types the upload path accepts (src/lib/feedback/attachment-validation.ts).
    CONSTRAINT "feedback_attachments_content_type_check"
      CHECK ("content_type" IN ('image/png', 'image/jpeg', 'image/webp')),
    -- Per-file size cap mirrored from the validation module (3 MB).
    CONSTRAINT "feedback_attachments_size_bytes_check"
      CHECK ("size_bytes" > 0 AND "size_bytes" <= 3000000),
    -- Up to 4 screenshots per message, ordered 0..3.
    CONSTRAINT "feedback_attachments_position_check"
      CHECK ("position" >= 0 AND "position" <= 3)
);

CREATE INDEX "feedback_attachments_feedback_id_position_idx"
  ON "feedback_attachments" ("feedback_id", "position");

ALTER TABLE "feedback_attachments" ADD CONSTRAINT "feedback_attachments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "feedback_attachments" ADD CONSTRAINT "feedback_attachments_feedback_id_fkey"
  FOREIGN KEY ("feedback_id") REFERENCES "feedback"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Deny-all. Do not add policies for anon or authenticated.
ALTER TABLE "feedback_attachments" ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER "feedback_attachments_user_id_immutable" BEFORE UPDATE OF "user_id" ON "feedback_attachments"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();

-- Same-owner second layer (9_account_ownership_2_enforce): an attachment may
-- reference only its own account's feedback row, never another account's.
CREATE TRIGGER "feedback_attachments_same_owner_feedback_id"
  BEFORE INSERT OR UPDATE OF "feedback_id", "user_id" ON "feedback_attachments"
  FOR EACH ROW EXECUTE FUNCTION "overload_assert_same_owner"('feedback', 'feedback_id', 'false');
