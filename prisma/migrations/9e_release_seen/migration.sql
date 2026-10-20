-- What's New: per-account release-notes seen state (spec 12 section 8).
--
-- Additive: one new, empty owned table. No existing table or column changes,
-- and no row is written: a new account's row is created at signup, and an
-- account with no row (every account that exists when this runs) has been
-- shown nothing. No entry ships with What's New, so nothing is unseen at
-- rollout. RLS is enabled with NO policies (deny-all), so the Data API sees
-- nothing; Prisma bypasses RLS. Ownership is immutable (shared trigger
-- function from 9_account_ownership_2_enforce). The only foreign key is to the
-- owner's own profile, so no same-owner trigger applies.
-- ASCII only: the embedded test Postgres runs in WIN1252.

CREATE TABLE "release_seen" (
    "user_id" UUID NOT NULL,
    "last_seen_release_id" TEXT NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "release_seen_pkey" PRIMARY KEY ("user_id"),
    -- The id format the catalog enforces (src/lib/release-notes/catalog.ts).
    CONSTRAINT "release_seen_last_seen_release_id_check"
      CHECK ("last_seen_release_id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("last_seen_release_id") <= 64)
);

ALTER TABLE "release_seen" ADD CONSTRAINT "release_seen_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Deny-all. Do not add policies for anon or authenticated.
ALTER TABLE "release_seen" ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER "release_seen_user_id_immutable" BEFORE UPDATE OF "user_id" ON "release_seen"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
