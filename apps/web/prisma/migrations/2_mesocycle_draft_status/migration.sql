-- Split & Mesocycle Builder (Pitch 3) — part 1 of 2. HAND-WRITTEN, reviewed.
--
-- Adds the `draft` lifecycle state (spec D1). This file contains ONLY the enum
-- change: Postgres cannot use a newly added enum value inside the transaction
-- that added it, and Prisma applies each migration file in one transaction, so
-- everything that uses 'draft' (the column default) lives in migration 3.
-- Additive only: no table, column, or row is dropped, renamed, or changed.

ALTER TYPE "MesocycleStatus" ADD VALUE IF NOT EXISTS 'draft' BEFORE 'active';
