-- Accounts runbook: per-account row counts. Read-only.
-- Usage: psql "$PROD" -v uid=<auth user id> -At -F"|" -f account-counts.sql
SELECT 'profiles' t, count(*) n FROM profiles WHERE user_id = :'uid' UNION ALL
SELECT 'mesocycles', count(*) FROM mesocycles WHERE user_id = :'uid' UNION ALL
SELECT 'sessions', count(*) FROM sessions WHERE user_id = :'uid' UNION ALL
SELECT 'session_exercises', count(*) FROM session_exercises WHERE user_id = :'uid' UNION ALL
SELECT 'exercises_custom', count(*) FROM exercises WHERE user_id = :'uid' UNION ALL
SELECT 'exercise_favorites', count(*) FROM exercise_favorites WHERE user_id = :'uid' UNION ALL
SELECT 'gyms', count(*) FROM gyms WHERE user_id = :'uid' UNION ALL
SELECT 'gym_exercise_baselines', count(*) FROM gym_exercise_baselines WHERE user_id = :'uid' UNION ALL
SELECT 'logged_sessions', count(*) FROM logged_sessions WHERE user_id = :'uid' UNION ALL
SELECT 'logged_exercises', count(*) FROM logged_exercises WHERE user_id = :'uid' UNION ALL
SELECT 'logged_sets', count(*) FROM logged_sets WHERE user_id = :'uid' UNION ALL
SELECT 'missed_day_resolutions', count(*) FROM missed_day_resolutions WHERE user_id = :'uid' UNION ALL
SELECT 'goals', count(*) FROM goals WHERE user_id = :'uid' UNION ALL
SELECT 'planned_cardio', count(*) FROM planned_cardio WHERE user_id = :'uid' UNION ALL
SELECT 'cardio_logs', count(*) FROM cardio_logs WHERE user_id = :'uid' UNION ALL
SELECT 'library_exercises (all accounts)', count(*) FROM exercises WHERE user_id IS NULL
ORDER BY 1;
