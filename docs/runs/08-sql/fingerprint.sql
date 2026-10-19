-- Multi-User Foundation runbook (fingerprint). Read-only. See docs/runs/08-multi-user-foundation-runbook.md.
SELECT t.tbl, (xpath('/row/c/text()', query_to_xml(format(
  'SELECT count(*)::text || '':'' || md5(coalesce(string_agg((to_jsonb(x) - ''user_id'')::text, ''|'' ORDER BY x.id), '''')) AS c FROM %I x', t.tbl), false, true, '')))[1]::text AS fingerprint
FROM (VALUES ('mesocycles'),('sessions'),('session_exercises'),('exercises'),('gyms'),('gym_exercise_baselines'),('logged_sessions'),('logged_exercises'),('logged_sets'),('missed_day_resolutions'),('goals'),('planned_cardio'),('cardio_logs')) AS t(tbl)
ORDER BY 1;
