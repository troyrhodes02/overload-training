-- Personalization & Navigation Polish: the account's appearance preference.
--
-- Additive: one enum type and one NOT NULL column with a default, so every
-- existing profile reads 'system' (the default) and nothing else changes.
-- No new table, so no RLS change: profiles already has RLS enabled with no
-- policies, and that stays true. The ownership triggers guard user_id only.
-- ASCII only: the embedded test Postgres runs in WIN1252.

CREATE TYPE "appearance" AS ENUM ('system', 'light', 'dark');

ALTER TABLE "profiles" ADD COLUMN "appearance" "appearance" NOT NULL DEFAULT 'system';
