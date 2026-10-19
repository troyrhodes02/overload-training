-- Multi-User Foundation runbook (counts). Read-only. See docs/runs/08-multi-user-foundation-runbook.md.
SELECT 'mesocycles' t, count(*) n FROM mesocycles UNION ALL
SELECT 'sessions', count(*) FROM sessions UNION ALL
SELECT 'session_exercises', count(*) FROM session_exercises UNION ALL
SELECT 'exercises', count(*) FROM exercises UNION ALL
SELECT 'exercises_custom', count(*) FROM exercises WHERE is_custom UNION ALL
SELECT 'exercises_favorite_flag', count(*) FROM exercises WHERE is_favorite UNION ALL
SELECT 'gyms', count(*) FROM gyms UNION ALL
SELECT 'gym_exercise_baselines', count(*) FROM gym_exercise_baselines UNION ALL
SELECT 'logged_sessions', count(*) FROM logged_sessions UNION ALL
SELECT 'logged_exercises', count(*) FROM logged_exercises UNION ALL
SELECT 'logged_sets', count(*) FROM logged_sets UNION ALL
SELECT 'missed_day_resolutions', count(*) FROM missed_day_resolutions UNION ALL
SELECT 'goals', count(*) FROM goals UNION ALL
SELECT 'planned_cardio', count(*) FROM planned_cardio UNION ALL
SELECT 'cardio_logs', count(*) FROM cardio_logs
ORDER BY 1;
