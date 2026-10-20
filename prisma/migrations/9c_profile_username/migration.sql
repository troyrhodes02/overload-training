-- Open signup & usernames (OVE-50): each account's unique username.
--
-- Additive: one nullable column, one unique index, one CHECK constraint.
-- Every existing profile reads NULL (no username yet) and nothing else
-- changes; no row is rewritten and logged history is not touched.
--
-- Usernames are stored lowercase, so the unique index makes them unique
-- regardless of case, and the CHECK constraint guarantees the stored shape
-- even if application validation were bypassed. Postgres allows many NULLs
-- under a unique index, so accounts without a username do not collide.
--
-- No new table, so no RLS change: profiles already has RLS enabled with no
-- policies, and that stays true. The ownership triggers guard user_id only.
-- ASCII only: the embedded test Postgres runs in WIN1252.

ALTER TABLE "profiles" ADD COLUMN "username" TEXT;

ALTER TABLE "profiles" ADD CONSTRAINT "profiles_username_format"
  CHECK ("username" IS NULL OR "username" ~ '^[a-z0-9_]{3,20}$');

CREATE UNIQUE INDEX "profiles_username_key" ON "profiles"("username");
