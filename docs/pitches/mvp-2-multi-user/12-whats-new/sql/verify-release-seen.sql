-- What's New: read-only checks for migration 9e_release_seen.
-- Safe to run any time; changes nothing.

-- 1. The table exists with its columns (user_id PK; last_seen_release_id,
--    last_seen_at, created_at, updated_at all NOT NULL).
SELECT column_name, is_nullable, udt_name
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'release_seen'
 ORDER BY ordinal_position;

-- 2. RLS on, no policies (deny-all), the owner trigger, and the constraints.
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.release_seen'::regclass;
SELECT count(*) AS policies FROM pg_policies WHERE schemaname = 'public' AND tablename = 'release_seen';
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.release_seen'::regclass AND NOT tgisinternal;
SELECT conname FROM pg_constraint WHERE conrelid = 'public.release_seen'::regclass ORDER BY conname;

-- 3. Rows: right after the migration, 0 (every existing account has no row:
--    shown nothing, and no entry ships with What's New). Later: one row per
--    account created through signup while entries exist, plus one per
--    account the dialog has been shown to.
SELECT count(*) AS rows FROM release_seen;
SELECT last_seen_release_id, count(*) AS accounts
  FROM release_seen GROUP BY last_seen_release_id ORDER BY last_seen_release_id DESC;

-- 4. History untouched: compare with the counts you took before migrating.
SELECT (SELECT count(*) FROM profiles)        AS profiles,
       (SELECT count(*) FROM tour_progress)   AS tour_progress,
       (SELECT count(*) FROM logged_sessions) AS logged_sessions,
       (SELECT count(*) FROM logged_sets)     AS logged_sets,
       (SELECT count(*) FROM goals)           AS goals;
