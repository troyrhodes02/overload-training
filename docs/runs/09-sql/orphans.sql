-- Accounts runbook: profiles whose auth identity no longer exists. Read-only.
-- Expect 0 rows. A row here is either a deletion whose last step was
-- interrupted (retry it from the app) or a lazily created profile that
-- outlived an identity removed outside the app.
SELECT p.user_id, p.created_at
FROM profiles p
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id);
