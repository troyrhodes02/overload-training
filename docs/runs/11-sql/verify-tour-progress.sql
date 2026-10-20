-- Onboarding Tour: read-only checks for migration 9d_tour_progress.
-- Safe to run any time; changes nothing.

-- 1. The table exists with its columns (user_id PK; offered_at, outcome,
--    outcome_at nullable; created_at, updated_at NOT NULL).
SELECT column_name, is_nullable, udt_name
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'tour_progress'
 ORDER BY ordinal_position;

-- 2. The enum has exactly completed, skipped (in that order).
SELECT e.enumlabel
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
 WHERE t.typname = 'tour_outcome'
 ORDER BY e.enumsortorder;

-- 3. RLS on, no policies (deny-all), the owner trigger and the outcome check.
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tour_progress'::regclass;
SELECT count(*) AS policies FROM pg_policies WHERE schemaname = 'public' AND tablename = 'tour_progress';
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.tour_progress'::regclass AND NOT tgisinternal;
SELECT conname FROM pg_constraint WHERE conrelid = 'public.tour_progress'::regclass ORDER BY conname;

-- 4. Rows: right after the migration, 0 (every existing account has no row,
--    so none is ever toured automatically). Later: one row per account
--    created through signup since the deploy, plus any account that replayed.
SELECT count(*) AS rows,
       count(*) FILTER (WHERE offered_at IS NULL AND outcome IS NULL) AS due,
       count(*) FILTER (WHERE outcome = 'completed') AS completed,
       count(*) FILTER (WHERE outcome = 'skipped') AS skipped
  FROM tour_progress;

-- 5. History untouched: compare with the counts you took before migrating.
SELECT (SELECT count(*) FROM profiles)        AS profiles,
       (SELECT count(*) FROM logged_sessions) AS logged_sessions,
       (SELECT count(*) FROM logged_sets)     AS logged_sets,
       (SELECT count(*) FROM goals)           AS goals;
