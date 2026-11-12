-- Public Landing Page & Changelog (spec 20 section 8). HAND-WRITTEN, reviewed.
--
-- Additive only. Nothing is dropped, renamed, truncated, or cascaded, and no
-- row is written. Two changes:
--   signup_campaign            - a closed enum of allowlisted campaigns
--                                (today only 'blizzy').
--   profiles.signup_campaign   - a nullable owned column on a table that
--                                already has deny-all RLS (no new table, so no
--                                new RLS statement is needed). NULL = the
--                                account did not arrive from a campaign. Set
--                                once by signup's profile creation from a
--                                validated first-party cookie; never updated.
-- Applied to production only by a human, from the runbook, after a backup.
-- ASCII only: the embedded test Postgres runs in WIN1252.

-- CreateEnum
CREATE TYPE "signup_campaign" AS ENUM ('blizzy');

-- AlterTable: additive nullable column on the already-RLS profiles table.
ALTER TABLE "profiles" ADD COLUMN "signup_campaign" "signup_campaign";
