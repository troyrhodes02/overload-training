-- Personalization & Navigation Polish: read-only checks for migration
-- 9b_profile_appearance. Safe to run any time; changes nothing.

-- 1. The column exists, NOT NULL, default 'system', type "appearance".
SELECT column_name, is_nullable, column_default, udt_name
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'profiles'
   AND column_name = 'appearance';

-- 2. The enum has exactly system, light, dark (in that order).
SELECT e.enumlabel
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
 WHERE t.typname = 'appearance'
 ORDER BY e.enumsortorder;

-- 3. Every profile has a value (right after the migration: all 'system').
SELECT appearance, count(*) FROM profiles GROUP BY appearance ORDER BY 1;

-- 4. RLS still on for profiles, still no policies (deny-all).
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass;
SELECT count(*) AS policies FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles';

-- 5. History untouched: compare with the counts you took before migrating.
SELECT (SELECT count(*) FROM profiles)      AS profiles,
       (SELECT count(*) FROM logged_sessions) AS logged_sessions,
       (SELECT count(*) FROM logged_sets)    AS logged_sets,
       (SELECT count(*) FROM goals)          AS goals;
