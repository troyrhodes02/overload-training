-- Admin Center & Feedback (Pitch 17) - read-only verification for migration
-- 9g_admin_center_feedback. Safe to run before and after the migration;
-- writes nothing. Run with: psql "<connection>" -At -f this file.

-- 1. The two new profile columns.
SELECT column_name || '|' || is_nullable || '|' || udt_name || '|' || coalesce(column_default, '')
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'profiles'
   AND column_name IN ('status', 'last_active_on')
 ORDER BY column_name;

-- 2. The new tables: RLS on, zero policies (deny-all).
SELECT c.relname || '|' || c.relrowsecurity || '|' ||
       (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN ('feedback', 'admin_audit_entries')
 ORDER BY c.relname;

-- 3. Triggers: immutable feedback owner, append-only audit log.
SELECT tgname FROM pg_trigger
 WHERE NOT tgisinternal AND tgrelid IN ('public.feedback'::regclass, 'public.admin_audit_entries'::regclass)
 ORDER BY tgname;

-- 4. The append-only function is not callable by the Data API roles.
SELECT r.rolname || '|' || has_function_privilege(r.rolname, 'public.overload_reject_change()', 'EXECUTE')
  FROM pg_roles r WHERE r.rolname IN ('anon', 'authenticated') ORDER BY r.rolname;

-- 5. Counts: every account is active right after the migration; no feedback
-- or audit rows exist yet; last-active is empty until the first visit.
SELECT 'profiles|' || count(*) || '|active=' || count(*) FILTER (WHERE status = 'active')
       || '|suspended=' || count(*) FILTER (WHERE status = 'suspended')
       || '|seen=' || count(last_active_on)
  FROM public.profiles;
SELECT 'feedback|' || count(*) FROM public.feedback;
SELECT 'admin_audit_entries|' || count(*) FROM public.admin_audit_entries;

-- 6. Training data is untouched (compare with the counts noted before the
-- migration).
SELECT 'logged_sets|' || count(*) FROM public.logged_sets;
SELECT 'logged_sessions|' || count(*) FROM public.logged_sessions;
SELECT 'mesocycles|' || count(*) FROM public.mesocycles;
SELECT 'goals|' || count(*) FROM public.goals;
