-- Multi-User Foundation runbook (verify). Read-only. See docs/runs/08-multi-user-foundation-runbook.md.
-- Run in section 7.1, BEFORE creating the section 7.3 check account (it assumes one profile).
SELECT 'owned tables with nullable user_id', count(*) FROM information_schema.columns WHERE table_schema='public' AND column_name='user_id' AND is_nullable='YES' AND table_name <> 'exercises';
SELECT 'rows not owned by the account', (SELECT count(*) FROM mesocycles WHERE user_id <> (SELECT user_id FROM profiles LIMIT 1)) + (SELECT count(*) FROM logged_sets WHERE user_id <> (SELECT user_id FROM profiles LIMIT 1));
SELECT 'library rows with an owner', count(*) FROM exercises WHERE NOT is_custom AND user_id IS NOT NULL;
SELECT 'custom rows without an owner', count(*) FROM exercises WHERE is_custom AND user_id IS NULL;
SELECT 'profiles', count(*) FROM profiles;
SELECT 'profile time zone', time_zone FROM profiles;
SELECT 'same-owner triggers', count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE p.proname='overload_assert_same_owner';
SELECT 'immutability triggers', count(*) FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE p.proname='overload_user_id_immutable';
SELECT 'public tables without RLS', count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;
SELECT 'RLS policies in public', count(*) FROM pg_policies WHERE schemaname='public';
SELECT 'per-account indexes', string_agg(indexname, ',' ORDER BY indexname) FROM pg_indexes WHERE indexname IN ('mesocycles_single_active_per_user','goals_one_active_per_exercise_per_user','mesocycles_single_active','goals_one_active_per_exercise');
SELECT 'anon can execute trigger fns', bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')) FROM pg_proc p WHERE p.proname IN ('overload_assert_same_owner','overload_user_id_immutable');
