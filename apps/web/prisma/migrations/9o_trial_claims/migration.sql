-- Signup hardening (item 2a): one Pro trial per person, shipped DARK.
--
--   trial_claims - a new standalone, UN-OWNED system table (like
--                  auth_throttle): no owner column, no foreign key, and only a
--                  SHA-256 hash of the normalized email key plus the id of the
--                  account that claimed the trial. RLS is enabled with NO
--                  policy (deny-all), so the Data API sees nothing; Prisma
--                  bypasses RLS. No FK, so it never blocks account deletion
--                  and a claim outlives its account by design.
--
-- Purely additive. The application reads and writes this table ONLY when
-- TRIAL_DEDUPE_ENABLED=true (default off), so code that includes this
-- migration file runs unchanged against a database where it has not been
-- applied yet. No backfill.
-- ASCII only: the embedded test Postgres runs in WIN1252.

-- CreateTable
CREATE TABLE "trial_claims" (
    "key_hash"   TEXT NOT NULL,
    "claimed_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_claims_pkey" PRIMARY KEY ("key_hash")
);

-- Row-level security: deny-all (no policy). Prisma is the only door.
ALTER TABLE "trial_claims" ENABLE ROW LEVEL SECURITY;
