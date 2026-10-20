-- Open signup & usernames (OVE-50): read-only checks for migration
-- 9c_profile_username. Safe to run any time; changes nothing.

-- 1. The column exists: nullable text.
SELECT column_name, is_nullable, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'profiles'
   AND column_name = 'username';

-- 2. The unique index exists.
SELECT indexname FROM pg_indexes
 WHERE schemaname = 'public' AND tablename = 'profiles'
   AND indexname = 'profiles_username_key';

-- 3. The shape constraint exists.
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conname = 'profiles_username_format';

-- 4. Usernames so far (right after the migration: every profile has none).
SELECT count(*) AS profiles,
       count(username) AS with_username,
       count(DISTINCT username) AS distinct_usernames
  FROM profiles;

-- 5. RLS still on for profiles, still no policies (deny-all).
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass;
SELECT count(*) AS policies FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles';

-- 6. History untouched: compare with the counts you took before migrating.
SELECT (SELECT count(*) FROM profiles)        AS profiles,
       (SELECT count(*) FROM logged_sessions) AS logged_sessions,
       (SELECT count(*) FROM logged_sets)     AS logged_sets,
       (SELECT count(*) FROM goals)           AS goals;
