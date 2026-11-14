# Release record: Pitch 21c — Mobile API & Auth Foundation (to Production)

**Release branch:** `release/21c-mobile-api-auth-foundation`, cut from `main` at `b6bc857` (the 21b release).
**Content:** one cherry-pick of the staging squash commit `b36a9cc` (feature PR #206, tickets OVE-176..180 and the review audit), plus this record. The release tree before this record is byte-identical to `staging` at `b36a9cc` (`4480cc2`).

Nothing below has been done to Production. Every step is yours.

## 1. What Production gains

- `GET /api/mobile/v1/app-config` (public), and `GET /api/mobile/v1/me`, `/today`, `/gyms` (bearer token, verified with Supabase `getUser`). Any other `/api/mobile/*` path gets a JSON 404.
- The web's Today and workout pages render from the shared views. Their output is identical (parity-checked against the `staging` build).
- One additive migration, `9p_mobile_api`.
- No client exists yet. Until the 21l beta build ships, nothing calls the API except you.

## 2. Production migrations

### Which ones

The run could not read Production's migration history: it holds no Production credentials, by design. The read-only status check in step 4 decides. Possible pending migrations, in this order:

| Migration | In `main` since | Applied to Production? | What it does |
| --- | --- | --- | --- |
| `9o_trial_claims` | the pre-mobile hardening release (OVE-148) | **unknown.** Its runbook made it optional. | Creates the un-owned `trial_claims` table (RLS on). Unused while `TRIAL_DEDUPE_ENABLED` is unset. |
| `9p_mobile_api` | this release | **no** | Creates the owned `api_idempotency_keys` table (RLS on, no policies, immutable `user_id`, RESTRICT FK to profiles, unique `(user_id, key)`), and adds the enum value `auth_throttle_action.mobile_api_request` |

Prisma applies migrations in order. If `9o` is still pending, `migrate deploy` applies it before `9p`. That is safe: the table stays empty and unused until you set `TRIAL_DEDUPE_ENABLED=true`, which this release does not do. If step 4 shows **anything else** pending, or any failed or rolled-back migration, stop: that is an unexpected schema state.

### Compatibility with the application running in Production today

Both migrations are additive and compatible with the currently deployed code (`b6bc857`):

- The old code never queries `api_idempotency_keys` or `trial_claims`.
- The old code reads `auth_throttle` only through a raw `count` statement, so a new enum value cannot break a Prisma read.
- The table's FK to `profiles` is RESTRICT. The old code's account deletion would only be blocked by rows in `api_idempotency_keys`, and nothing writes rows there in this release (no endpoint uses idempotency yet).

### Order: migration first, then the code

The new code's account deletion and data export read `api_idempotency_keys`. Deploying the code before `9p` would break account deletion and the export in Production. So: **apply the migration, verify it, then merge the release PR.**

## 3. Production migration runbook (owner-operated)

Run from the release worktree (`apps/web` on `release/21c-mobile-api-auth-foundation`), which has no `.env` file. The guarded `db:migrate:dev` wrapper refuses Production by design; Production uses `prisma migrate deploy` from this runbook, after a backup, as for every earlier Production migration.

1. **Backup.** In the Supabase dashboard for `overload-prod` (ref `ycxvdiklpefyhdclxyau`) → Database → Backups, confirm a backup from the last few minutes (or take an on-demand one), and note its time. Optionally also run `pg_dump "$DIRECT_URL" -Fc -f overload-prod-pre-21c-$(date -u +%Y%m%dT%H%MZ).dump` with a `pg_dump` that matches the server's major version.
2. **Shell.** In a new terminal, export the Production connection strings for this shell only (never into a file):
   ```bash
   cd <repo>/../overload-training-release-21c/apps/web
   git log --oneline -1          # the release branch head
   export DIRECT_URL='<overload-prod direct or session-pooler URL>'
   export DATABASE_URL="$DIRECT_URL"
   ```
3. **Identity (read-only).**
   ```bash
   node -e 'const u=new URL(process.env.DIRECT_URL);console.log(u.hostname, decodeURIComponent(u.username))'
   # expect the Production ref ycxvdiklpefyhdclxyau in the host or user name, and NEVER vdxrmfadikwzodjljbdi
   psql "$DIRECT_URL" -At -c "SELECT pg_catalog.obj_description(n.oid,'pg_namespace') FROM pg_catalog.pg_namespace n WHERE n.nspname='overload_target'"
   # expect NO output: Production never carries the dev identity marker
   ```
4. **Status (read-only).**
   ```bash
   npx prisma migrate status
   psql "$DIRECT_URL" -c "SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5"
   ```
   Continue only if the pending list is exactly `9p_mobile_api`, or `9o_trial_claims` then `9p_mobile_api`, with no failed or rolled-back rows and no drift warning.
5. **Apply.**
   ```bash
   npx prisma migrate deploy      # never migrate dev, db push, or migrate reset
   ```
6. **Verify (read-only).**
   ```bash
   npx prisma migrate status      # expect: Database schema is up to date!
   psql "$DIRECT_URL" <<'SQL'
   SELECT relrowsecurity FROM pg_class WHERE relname = 'api_idempotency_keys';                  -- t
   SELECT count(*) FROM pg_policies WHERE tablename = 'api_idempotency_keys';                    -- 0
   SELECT count(*) FROM api_idempotency_keys;                                                   -- 0
   SELECT tgname FROM pg_trigger WHERE tgrelid = 'api_idempotency_keys'::regclass AND NOT tgisinternal;  -- api_idempotency_keys_user_id_immutable
   SELECT 'mobile_api_request' = ANY (enum_range(NULL::auth_throttle_action)::text[]);           -- t
   SELECT relrowsecurity FROM pg_class WHERE relname = 'trial_claims';                           -- t
   SQL
   ```
7. **Close the shell** (or `unset DIRECT_URL DATABASE_URL`).
8. **Then** merge the release PR into `main`. Vercel deploys Production.

## 4. Production environment

- `MOBILE_MIN_APP_VERSION`, `MOBILE_LATEST_APP_VERSION`, `MOBILE_MAINTENANCE`: **leave unset.** The defaults serve every version with maintenance off. The run could not read Vercel's Production variables (no Vercel CLI session here). Confirm in Vercel → Settings → Environment Variables (Production) that none is set.
- No other variable is added or changed. `app-config` reports only whether signup is open (from the existing `OVERLOAD_SIGNUP_MODE`) and whether plan import is on (the existing `PLAN_IMPORT_ENABLED`). It never reports the invite code, keys, URLs, or the admin list, and it enables nothing: there is no mobile signup.

## 5. Production smoke test (after the deploy)

```bash
P=https://<production host>/api/mobile/v1
curl -s $P/app-config
# {"minimumAppVersion":"0.0.0","latestAppVersion":"0.0.0","killSwitches":{"planImportEnabled":<bool>,"maintenance":false},"signupMode":"<public|closed>"}
curl -s -i -H 'X-Overload-App-Version: 1.0.0' $P/me | head -1      # HTTP/... 401 (JSON body, code unauthorized)
curl -s -i $P/nope | head -1                                         # 404, JSON
```

Optional, with your own account's token (signInWithPassword with the Production anon key, as in the 21c runbook §3): `GET /me` returns your own email, and `GET /today` returns your Today.

Web, signed in as yourself:
- Today, start or resume a workout, and History look as before.
- Goals look as before.
- Settings → Download your data still downloads.

Signed out, `/history` still redirects to `/login`.

## 6. Rollback

- **Code:** in Vercel, promote the previous Production deployment (`b6bc857`), or revert the merge commit on `main` through a PR. The old code runs correctly on the migrated schema (§2). Before relying on account deletion under the old code, confirm `SELECT count(*) FROM api_idempotency_keys` is `0` (nothing in this release writes it).
- **Schema** (only after a code rollback, and only if you want the table gone):
  ```sql
  DROP TABLE "api_idempotency_keys";
  DELETE FROM _prisma_migrations WHERE migration_name = '9p_mobile_api';
  ```
  The enum value `mobile_api_request` can't be dropped in Postgres and is harmless to leave. A later `migrate deploy` re-applies `9p` cleanly (`ADD VALUE IF NOT EXISTS`). For `9o`, follow its own runbook (OVE-148).
- **Last resort:** restore the step 1 backup. This loses anything written after it.

## 7. After the release

Synchronize `main` back into `staging` with a normal merge commit through a PR (the same procedure as #205). That needs your go-ahead.
