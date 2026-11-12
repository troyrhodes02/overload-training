-- RIR Logging & Autoregulation -- HAND-WRITTEN, reviewed.
--
-- One optional fact per logged set: reported reps in reserve. NULL means "not
-- recorded" (no effort information) and is never treated as 0. Values are
-- 0..4, where 4 means "4 or more". Which values may be written is decided in
-- the one write module (src/lib/logging/logged-sets.ts); the CHECK makes any
-- other value unstorable even outside it.
--
-- Additive only: one nullable column with no default. In Postgres this is a
-- catalog-only change (no table rewrite). Every existing row reads NULL; no row
-- is inserted, updated, or deleted; no existing value changes; nothing is
-- dropped, renamed, or cascaded. RLS on logged_sets is unchanged (deny-all
-- since 0_init) and the ownership triggers are unaffected. There is no
-- backfill: past sets were logged without RIR and stay that way.
--
-- Named 9f_ so it sorts after 9e_release_seen (Prisma applies migration
-- directories in byte order; a 10_ directory would sort before 1_).

ALTER TABLE "logged_sets" ADD COLUMN "rir" INTEGER;

ALTER TABLE "logged_sets"
  ADD CONSTRAINT "logged_sets_rir_range"
  CHECK ("rir" IS NULL OR ("rir" >= 0 AND "rir" <= 4));
