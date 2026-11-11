-- RIR Logging & Autoregulation: read-only checks for migration 9f_logged_set_rir.
-- Safe to run any time; changes nothing.

-- 1. The column exists: nullable integer, no default.
SELECT column_name, is_nullable, udt_name, coalesce(column_default, '(none)') AS column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'logged_sets' AND column_name = 'rir';

-- 2. The range check, and RLS still on with no policy (deny-all).
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.logged_sets'::regclass AND conname = 'logged_sets_rir_range';
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.logged_sets'::regclass;
SELECT count(*) AS policies FROM pg_policies WHERE schemaname = 'public' AND tablename = 'logged_sets';

-- 3. No RIR was invented: right after the migration every row is NULL
--    (with_rir = 0). Later, with_rir counts only sets a lifter recorded it on.
SELECT count(*) AS sets, count(rir) AS with_rir FROM logged_sets;
SELECT rir, count(*) AS sets FROM logged_sets WHERE rir IS NOT NULL GROUP BY rir ORDER BY rir;

-- 4. History untouched: compare with the counts you took before migrating.
SELECT (SELECT count(*) FROM profiles)               AS profiles,
       (SELECT count(*) FROM logged_sessions)        AS logged_sessions,
       (SELECT count(*) FROM logged_exercises)       AS logged_exercises,
       (SELECT count(*) FROM logged_sets)            AS logged_sets,
       (SELECT count(*) FROM gym_exercise_baselines) AS baselines,
       (SELECT coalesce(sum(reps), 0) FROM logged_sets)        AS total_reps,
       (SELECT coalesce(sum(weight_lbs), 0) FROM logged_sets)  AS total_weight_lbs;
