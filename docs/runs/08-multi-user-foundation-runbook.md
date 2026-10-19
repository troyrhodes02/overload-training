# Pitch 8 — Multi-User Foundation — Production Runbook

**Who runs this:** the product's owner, by hand, from a trusted machine. The
autonomous pipeline prepared and rehearsed it and never touched production.
**What it does:** converts the single-user production database to account
ownership without losing, changing, or reassigning anything, then deploys the
code that depends on it.
**What it never does:** enable signup. Public signup stays **disabled** in
`overload-prod` throughout and after this runbook. Opening signup is the
Accounts pitch's decision, after this runbook's verification gate passes.

No secrets appear here. Connection strings come from the Supabase dashboard
(`overload-prod` → Project Settings → Database). **Warning:** the repository's
`.env` has held production values. Every command below sets the connection
explicitly; never rely on `.env` silently.

---

## 0. What changes, in order

| Stage | Command | Effect | App during stage |
| ----- | ------- | ------ | ---------------- |
| Backup | `pg_dump` | Full copy of `public` + the auth account list | normal |
| 1 Expand | `prisma db execute` + `migrate resolve` | `profiles`, `exercise_favorites` (RLS on); nullable `user_id` on owned tables | normal (old code ignores the new columns) |
| 2 Assign | ownership backfill CLI | every existing row → your account; your profile + timezone; favorites copied | **don't use the app** |
| 3 Enforce | `prisma migrate deploy` | `user_id` NOT NULL, per-account unique rules, same-owner + immutability triggers | **old code can't write** — deploy next |
| Deploy | merge feature PR #49 → Vercel | new code (account-scoped) goes live | normal |
| Verify | queries + browser checks | prove nothing changed for you and a second account sees nothing | normal |

**Order matters — deploy the code only after Stage 3.** If the new code runs
before Stage 2, the first page you open creates your profile with UTC (the
fallback for accounts without one), and Stage 2 then refuses because the zone
differs from the one you pass. (Recovery: §8 R3.)

Plan a quiet 30-minute window. Don't log workouts from Stage 2 until the deploy
finishes.

---

## 1. Prerequisites

- [ ] Feature PR **#49** reviewed and approved, all ticket PRs (#50–#54) merged into it, checks green. **Do not merge it yet** — the merge deploys the code (§6).
- [ ] Local checkout of `feat/08-multi-user-foundation` at the approved commit; `npm ci` done.
- [ ] Docker running (for `pg_dump`/`psql` matching the server version: the local `supabase_db_overload` container, from `npx supabase start`).
- [ ] The production **direct** connection string (port 5432, or the Session pooler if the direct host is unreachable — never the transaction pooler, port 6543, for these steps).
- [ ] Your account's **timezone** — the zone your days already follow today:
  - In the browser you use Overload on: DevTools → Application → Cookies → `overload-tz` (URL-decode it, e.g. `America%2FChicago` → `America/Chicago`), **or**
  - DevTools console: `Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - It must be an IANA name (`America/Chicago`, not `CST`).
- [ ] Your account's **email** exactly as in `overload-prod` → Authentication → Users.
- [ ] Confirm signup is **off**: `overload-prod` → Authentication → Sign In / Providers → "Allow new users to sign up" disabled.

PowerShell setup for this session (values from the dashboard; nothing is written to disk):

```powershell
$env:PROD_DIRECT_URL = "postgresql://postgres.<ref>:<password>@<direct-host>:5432/postgres"
$env:OWNER_EMAIL     = "<your account email>"
$env:OWNER_TZ        = "America/Chicago"        # your zone from above
$env:DIRECT_URL      = $env:PROD_DIRECT_URL     # what Prisma and the backfill read
$env:DATABASE_URL    = $env:PROD_DIRECT_URL     # never used to run the app here
$ProdHost = ([uri]($env:PROD_DIRECT_URL -replace '^postgresql','http')).Host
$ProdHost                                         # check: the overload-prod host
```

---

## 2. Rehearse on a copy of production (required before §3)

The pipeline rehearsed every step below on the local development stack with
real-shaped data (record in §9). This step repeats it on **your production
data**, still without changing production: dump (read-only), restore into a
throwaway local database, run Stages 1–3 there, and compare.

```powershell
# 2.1 Read-only dump of production: the app schema, plus the auth account list.
docker exec supabase_db_overload pg_dump "$env:PROD_DIRECT_URL" -Fc -n public -f /tmp/prod-public.dump
docker exec supabase_db_overload psql "$env:PROD_DIRECT_URL" -At -c "\copy (select id, email from auth.users) to '/tmp/prod-users.csv' csv"

# 2.2 Restore into a throwaway database on the local stack.
docker exec supabase_db_overload psql -U postgres -c "DROP DATABASE IF EXISTS overload_prodcopy" -c "CREATE DATABASE overload_prodcopy"
docker exec supabase_db_overload pg_restore -U postgres --no-owner --no-acl -d overload_prodcopy /tmp/prod-public.dump
docker exec supabase_db_overload psql -U postgres -d overload_prodcopy -c "CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY, email text NOT NULL);" -c "\copy auth.users from '/tmp/prod-users.csv' csv"
```

Then run §3–§5 against the copy, with these values instead of production
(`127.0.0.1` is local, so the backfill needs no `--confirm-host`):

```powershell
$env:DIRECT_URL   = "postgresql://postgres:postgres@127.0.0.1:54322/overload_prodcopy"
$env:DATABASE_URL = $env:DIRECT_URL
```

Expected: every check in §3–§5 passes, the before/after counts and
fingerprints match, and Stage 2's output says `identical` for every table.
**Stop and investigate if anything differs.** Afterwards:
`docker exec supabase_db_overload psql -U postgres -c "DROP DATABASE overload_prodcopy"`
and delete `/tmp/prod-*.{dump,csv}` from the container.

Switch back to production before continuing:

```powershell
$env:DIRECT_URL = $env:PROD_DIRECT_URL; $env:DATABASE_URL = $env:PROD_DIRECT_URL
```

---

## 3. Backup and baseline (immediately before Stage 1)

```powershell
# 3.1 Fresh full backup of the app schema + the auth account list (keep both).
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
docker exec supabase_db_overload pg_dump "$env:PROD_DIRECT_URL" -Fc -n public -f /tmp/backup-$stamp.dump
docker cp supabase_db_overload:/tmp/backup-$stamp.dump ".\backup-pre-ownership-$stamp.dump"
docker exec supabase_db_overload pg_restore -l /tmp/backup-$stamp.dump | Select-String "TABLE DATA" | Measure-Object   # expect > 0
```

Also take a Supabase dashboard backup if your plan offers one (Database →
Backups). The `pg_dump` file is the restore path this runbook uses.

```powershell
# 3.2 Baseline row counts and value fingerprints (save the output).
docker cp docs/runs/08-sql/counts.sql supabase_db_overload:/tmp/counts.sql
docker cp docs/runs/08-sql/fingerprint.sql supabase_db_overload:/tmp/fingerprint.sql
docker exec supabase_db_overload psql "$env:PROD_DIRECT_URL" -At -F"|" -f /tmp/counts.sql      > counts-before.txt
docker exec supabase_db_overload psql "$env:PROD_DIRECT_URL" -At -F"|" -f /tmp/fingerprint.sql > fingerprint-before.txt

# 3.3 Migration state: exactly the two ownership stages pending.
npx prisma migrate status
#   Following migrations have not yet been applied:
#   9_account_ownership_1_expand
#   9_account_ownership_2_enforce
```

**Never run a bare `npx prisma migrate deploy` before Stage 2** — it would apply
both stages; the enforce stage then refuses (nothing changed by it), and you
must clean up with §8 R4.

---

## 4. Stage 1 — Expand

```powershell
npx prisma db execute --file prisma/migrations/9_account_ownership_1_expand/migration.sql
npx prisma migrate resolve --applied 9_account_ownership_1_expand
npx prisma migrate status        # expect: only 9_account_ownership_2_enforce pending
```

Additive only: two new tables (RLS enabled, no policy) and nullable `user_id`
columns. The current production code keeps working unchanged.

---

## 5. Stage 2 — Assign, then Stage 3 — Enforce

```powershell
# 5.1 Dry run (default; writes nothing). PowerShell drops npm "--" options, so call tsx directly.
npx tsx --conditions=react-server scripts/operator/account-ownership/cli.ts --email $env:OWNER_EMAIL --time-zone $env:OWNER_TZ
```

Read the report. It must show: your email resolving to your account
(`1 account(s) in auth`), your zone, every table's rows "N of N" unowned, your
custom exercises, the favorites to copy, and the library count (with any
library exercises archived in the single-user era — see §10). Any `REFUSED`
line stops here (nothing changed).

```powershell
# 5.2 Execute (one transaction; refuses a non-local host without the exact host).
npx tsx --conditions=react-server scripts/operator/account-ownership/cli.ts --email $env:OWNER_EMAIL --time-zone $env:OWNER_TZ --execute --confirm-host $ProdHost
```

Expected: "Assigned in one transaction", `profile created 1`, and **every table
`identical`** in the before → after block. Anything else rolls back by itself
(nothing partial). Re-running is safe (it reports zero changes).

```powershell
# 5.3 Stage 3 — enforce (applies only 9_account_ownership_2_enforce now).
npx prisma migrate deploy
npx prisma migrate status        # expect: Database schema is up to date!
```

The enforce migration checks completeness itself first and refuses, changing
nothing, if anything is unowned or crosses accounts (§8 R4).

---

## 6. Deploy the code

Merge feature PR **#49** into `main`. Vercel deploys production. Wait for the
deployment to be **Ready** before using the app. No new environment variables
are needed (`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_*` are
unchanged).

---

## 7. Verify in production (the rollout gate)

### 7.1 Data preserved (queries)

```powershell
docker exec supabase_db_overload psql "$env:PROD_DIRECT_URL" -At -F"|" -f /tmp/counts.sql      > counts-after.txt
docker exec supabase_db_overload psql "$env:PROD_DIRECT_URL" -At -F"|" -f /tmp/fingerprint.sql > fingerprint-after.txt
Compare-Object (Get-Content counts-before.txt) (Get-Content counts-after.txt)            # expect: no output
Compare-Object (Get-Content fingerprint-before.txt) (Get-Content fingerprint-after.txt)  # expect: no output
docker cp docs/runs/08-sql/verify.sql supabase_db_overload:/tmp/verify.sql
docker exec supabase_db_overload psql "$env:PROD_DIRECT_URL" -At -F": " -f /tmp/verify.sql
```

`verify.sql` must report: 0 owned tables with nullable `user_id`; 0 rows not
owned by your account; 0 library rows with an owner; 0 custom rows without one;
1 profile with your zone; 20 same-owner triggers; 15 immutability triggers;
**0 public tables without RLS; 0 RLS policies**; the two `_per_user` indexes
only; `anon can execute trigger fns: f`.

### 7.2 Your experience unchanged (browser, your normal device)

- [ ] Today shows the same session (or rest / complete / missed-day state) as before, for today's date.
- [ ] Plan: same active block, sessions, planned exercises, cardio.
- [ ] History: past weeks and a past workout's sets unchanged.
- [ ] Goals: same goals and percentages.
- [ ] Gyms: same gyms. An exercise you use shows the same progression tag and trend.
- [ ] A library exercise's page has no "Archive exercise" button; your custom exercises still do.
- [ ] Late evening check (optional): before midnight in your zone, Today still shows today.

### 7.3 Isolation with a second, controlled account (signup stays off)

1. `overload-prod` → Authentication → Users → **Add user** → `isolation-check@<your domain>` with a strong password, auto-confirm. (This is an admin action; it does **not** enable signup.)
2. In a private window, sign in as that user. Expect: Today "No active plan", empty Plan / History / Goals / Gyms, the full shared library, none of your custom exercises.
3. From your own session copy three URLs — a mesocycle (`/plan/<id>`), a past workout (`/history/<id>`), a custom exercise (`/exercises/<id>`) — and open each in the private window. Each must show **"We couldn't find that page."**, exactly like `/plan/00000000-0000-4000-8000-000000000000`.
4. Don't create anything as the check account. Sign out, then delete it: Authentication → Users → delete, and remove the profile it got on first sign-in:
   ```powershell
   docker exec supabase_db_overload psql "$env:PROD_DIRECT_URL" -c "DELETE FROM profiles WHERE user_id = '<check account id>' AND NOT EXISTS (SELECT 1 FROM gyms WHERE user_id = '<check account id>')"
   ```
   (If you did create something as it, delete those rows first; the profile delete is restricted while it owns rows.)

### 7.4 Gate

All of §7.1–§7.3 pass → Multi-User Foundation is **verified in production**.
Record the date in the run report. Only then may the Accounts pitch begin the
path to signup. Signup stays disabled until that pitch says otherwise.

---

## 8. Recovery

| # | Situation | State | What to do |
| - | --------- | ----- | ---------- |
| R1 | Stage 1 (`db execute`) errors | additive script; may be partly applied | Don't run `migrate resolve`. Restore the §3 backup (R6), fix the cause, start again at §3. |
| R2 | Stage 2 refuses (`REFUSED` / `BackfillRefused`) | **nothing changed** (one transaction) | Read the reason, fix it (wrong email, zone, extra auth user), rerun 5.1 → 5.2. |
| R3 | Stage 2 refuses "profile with a different timezone" | new code ran before Stage 2 and created a UTC profile | If it owns nothing else: `DELETE FROM profiles WHERE user_id = '<your id>'` then rerun 5.2. Never edit any other row. |
| R4 | Stage 3 (`migrate deploy`) fails | **nothing changed** by it (verified atomic); recorded as failed | `npx prisma migrate resolve --rolled-back 9_account_ownership_2_enforce`; read the message (unowned rows → rerun 5.2; cross-account reference → stop and investigate); then `npx prisma migrate deploy` again. |
| R5 | Deploy is broken after Stage 3 | schema enforced | Fix forward if small. Otherwise Vercel → Deployments → previous production deployment → **Instant Rollback** *and* restore the backup (R6) — the old code cannot write to the enforced schema. |
| R6 | Full restore | — | **Overwrites anything logged since the backup.** `docker cp .\backup-pre-ownership-<stamp>.dump supabase_db_overload:/tmp/restore.dump`, then `docker exec supabase_db_overload pg_restore --clean --if-exists --no-owner --no-acl -n public -d "$env:PROD_DIRECT_URL" /tmp/restore.dump`. Confirm with `counts.sql` / `fingerprint.sql` against the §3 baseline and `npx prisma migrate status` (both ownership stages pending). The auth account list is untouched by this pitch, so it needs no restore. |

Never use `prisma migrate reset`, `db push --force-reset`, or `--accept-data-loss` on production.

---

## 9. Rehearsal record (pipeline, local development stack)

Run 2026-10-19 on the Supabase CLI local stack (`127.0.0.1:54322`), whose data
mirrors production's shape (one auth account; 3 mesocycles, 9 sessions, 39
planned exercises, 877 exercises incl. 1 custom, 2 gyms incl. 1 archived, 10
baselines, 36 logged sessions, 157 logged exercises, 463 logged sets, 2 missed
days, 5 goals, 2 planned cardio, 4 cardio logs):

1. `pg_dump -Fc` backup (616 KB, 66 table-data entries); counts + fingerprints recorded.
2. Stage 1 via `prisma db execute` + `migrate resolve --applied` → only enforce pending.
3. Stage 2 dry run → resolved the one account case-insensitively, all rows "N of N"; execute → all 13 tables `identical`; rerun → zero changes.
4. Stage 3 via `prisma migrate deploy` → applied; `migrate status` up to date.
5. Counts before/after: **no difference**. Fingerprints (md5 of every row excluding `user_id`) before/after: **no difference**.
6. `verify.sql`: 0 nullable owned `user_id`; 0 foreign-owned rows; library ownerless; 1 profile (`America/Chicago`); 20 + 15 triggers; 0 tables without RLS; 0 policies; per-user indexes only; `anon` cannot execute the trigger functions.
7. Production build against the local stack, browser smoke test with the migrated account and two temporary accounts: **23/23 checks pass** — the original account's Today, plan, history, workout detail, gyms, goals, and progression render its data; a library exercise shows no Archive control; a second account sees an empty app and the full library, gets "We couldn't find that page." for the first account's mesocycle, workout, and custom exercise (identical to a random id), and its own gym is invisible to a third account; zero page errors. Temporary accounts and their rows were removed and the original account's credentials restored exactly.

Also verified in the integration suite (throwaway databases): Prisma's runner
applies the enforce migration atomically (a failure at its very end left no
change and recorded the migration as failed), the enforce stage refuses an
incomplete backfill and pre-existing cross-account references, and the whole
chain applies cleanly to an empty database.

---

## 10. Notes for the operator

- **Legacy library archives.** If you archived any *library* exercise in the single-user era, it stays archived (globally hidden from pickers) — the conversion changes no library row, and no account can archive or restore library rows anymore. The dry run prints the count. Un-archiving is a product decision (run report, open question 1).
- **`exercises.is_favorite`** is now unused (favorites live in `exercise_favorites`); it is kept so no data-holding column is dropped. Remove it later with a deliberate migration.
- **Travel.** "Today" now follows your stored zone, not the browser's. Until Settings can edit it, change it with `UPDATE profiles SET time_zone = '<IANA zone>' WHERE user_id = '<your id>'`.
- **Seeding a friend's plan** (later, after Accounts): `scripts/import/real-plan` now requires `--account-email`.
