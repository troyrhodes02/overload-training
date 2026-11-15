-- Prescription-Aware Intelligence, release backward compatibility (OVE-197;
-- spec RD-21, amending RD-3). `sessions.lineage_id` gets a database-generated
-- default, so any writer that omits it — the application version deployed
-- before this feature, a rolled-back deployment, or the current code, whose
-- Prisma schema now declares the same default — gets a fresh, independent
-- lineage. A writer that supplies it (cloneMesocycle, carrying a recurring
-- workout into the next block) keeps the value it supplied.
--
-- Metadata only: existing rows are untouched (every one already has a lineage
-- from 9q), no table rewrite, no lock beyond the brief catalog update.
-- `gen_random_uuid()` is built into PostgreSQL 13+. The NOT NULL constraint,
-- the per-mesocycle unique index, and the immutability trigger from 9q are
-- unchanged.

ALTER TABLE "sessions" ALTER COLUMN "lineage_id" SET DEFAULT gen_random_uuid();
