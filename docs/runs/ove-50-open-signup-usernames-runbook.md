# OVE-50 — Open signup & usernames — Production Runbook

**Who runs this:** the product's owner, by hand, from a trusted machine.
Everything below was built and verified on the **local** Supabase stack and an
embedded test database only. Production was never read or changed, no
production secret was set, and nothing was merged to `main`.

**What it ships:**

- **Self-signup** with first name, last name, username, email, and the password typed twice. There is no invite code.
- **A unique username** for every new account.
- **Settings** gains a Username field (first and last name were already there).

**What changes in the database:** one additive migration,
`prisma/migrations/9c_profile_username`:

```sql
ALTER TABLE "profiles" ADD COLUMN "username" TEXT;
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_username_format"
  CHECK ("username" IS NULL OR "username" ~ '^[a-z0-9_]{3,20}$');
CREATE UNIQUE INDEX "profiles_username_key" ON "profiles"("username");
```

Every existing profile gets `NULL` (no username yet). No table is created, so
RLS doesn't change. No row is rewritten, and logged history is not touched.
The unique index and the CHECK make duplicate or malformed usernames
impossible at the database level, whatever the app does.

**What changes in configuration:**

- The invite code is gone. `OVERLOAD_INVITE_CODE` is ignored from this release on.
- Signup is controlled by a new server-only switch, **`OVERLOAD_SIGNUP_OPEN`**. Signup is open only when it is `true` (case and surrounding spaces ignored), and closed for anything else or when it is unset.

So merging this **closes signup** until you set the switch (§7), even if you
had opened invite-only signup before.

**Two ordering rules:**

1. **Apply the migration before the code deploys.** Prisma reads every
   `profiles` column, so code that knows about `username` fails on every
   signed-in page against a database without it. The reverse order is safe:
   old code ignores the extra column.
2. **Open signup last**, only after §1–§6 pass and Multi-User Foundation is
   verified in production (`.claude/CLAUDE.md`).

No secrets appear in this file. **Warning:** the repository's `.env` has held
production values; every command below names its connection explicitly.

---

## 0. Order of operations

| # | Step | Signup state | Reversible? |
| - | ---- | ------------ | ----------- |
| 1 | Prerequisites: production on Pitch 10 and its migrations | as before | — |
| 2 | Back up production | as before | — |
| 3 | Apply `9c_profile_username` to production | as before | yes (§9), but don't |
| 4 | Verify the migration (read-only SQL) | as before | — |
| 5 | Review and squash-merge PR **#67** → Vercel deploys | **closed** | yes (instant rollback) |
| 6 | Verify in production; set your own username | closed | — |
| 7 | Add the signup rate limit, then open signup | **open** | yes (unset + redeploy) |

Do not merge before §3–§4 pass. Do not do §7 before §6.

---

## 1. Prerequisites

- [ ] `main` includes Pitch 10 (#62) and it is live in production.
- [ ] Multi-User Foundation's production verification is recorded
      (`docs/runs/08-multi-user-foundation-report.md`). Signup must not open
      until it is (§7).
- [ ] Production has every migration up to and including
      `9b_profile_appearance`, and **only** `9c_profile_username` pending:

```powershell
# From the repo root, with this branch checked out (not merged):
#   git fetch; git checkout feat/ove-50-open-signup-usernames
$env:PROD_DIRECT_URL = "postgresql://postgres.<ref>:<password>@<direct-host>:5432/postgres"  # Supabase → Connect → Direct
$env:DIRECT_URL   = $env:PROD_DIRECT_URL
$env:DATABASE_URL = $env:PROD_DIRECT_URL   # Prisma CLI only; nothing runs the app here
npx prisma migrate status
```

Expected: "Following migration have not yet been applied: 9c_profile_username"
and nothing else. **If any other migration is listed, stop.** Production is
not where this release assumes; finish the Pitch 10 runbook first.

---

## 2. Back up production

Use the local stack's container so `pg_dump` matches the server version (as in
earlier runbooks):

```powershell
docker exec supabase_db_overload pg_dump "$env:PROD_DIRECT_URL" -Fc -n public -f /tmp/prod-public-pre-username.dump
docker cp supabase_db_overload:/tmp/prod-public-pre-username.dump "$HOME\overload-backups\prod-public-pre-username-$(Get-Date -Format yyyyMMdd-HHmm).dump"
```

Keep it outside the repository. Run the verification queries now and note
query 6 (the counts):

```powershell
Get-Content docs/runs/ove-50-sql/verify-username.sql | docker exec -i supabase_db_overload psql "$env:PROD_DIRECT_URL" -At
```

Before the migration, queries 1–3 return nothing and query 4 errors
("column username does not exist"). That is expected; note query 6.

---

## 3. Apply the migration

```powershell
npx prisma migrate deploy
```

Expected: "Applying migration `9c_profile_username`" then "All migrations have
been successfully applied." It is three statements on a small table and takes
well under a second.

If it fails, Prisma records the migration as failed. Run §4's queries 1–3 to
see which of the three statements took effect, then stop and investigate.
Don't merge, and don't re-run until you know why it failed. The likeliest
cause, a connection problem, leaves nothing applied.

---

## 4. Verify the migration

```powershell
Get-Content docs/runs/ove-50-sql/verify-username.sql | docker exec -i supabase_db_overload psql "$env:PROD_DIRECT_URL" -At
```

- [ ] Query 1: `username|YES|text`
- [ ] Query 2: `profiles_username_key`
- [ ] Query 3: `profiles_username_format|CHECK (((username IS NULL) OR (username ~ '^[a-z0-9_]{3,20}$'::text)))`
- [ ] Query 4: `<your number of accounts>|0|0` (nobody has a username yet)
- [ ] Query 5: `t` and `0` (RLS on, no policies)
- [ ] Query 6: identical to the counts you noted in §2

Rehearsed on the local stack: `username|YES|text`, `profiles_username_key`,
the CHECK above, `1|0|0`, `t`, `0`, and history counts unchanged
(463 logged sets).

Then clear the shell variables:

```powershell
Remove-Item Env:PROD_DIRECT_URL, Env:DIRECT_URL, Env:DATABASE_URL
```

---

## 5. Merge and deploy

- [ ] Review PR **#67** (the review findings and audit are on the PR).
- [ ] Vercel → Project → Settings → Environment Variables (Production):
  - **Delete `OVERLOAD_INVITE_CODE`** if it exists. It does nothing anymore, and leaving it would mislead later.
  - Do **not** add `OVERLOAD_SIGNUP_OPEN` yet.
- [ ] Squash-merge #67 into `main`. Vercel deploys production.
- [ ] Move OVE-50 to Done.

Supabase Auth settings don't change. **"Allow new users to sign up" stays
OFF**, even with self-signup open. Accounts are created by the app's server
after its own checks (signup switch, names, unique username). Turning the
Supabase setting on would let anyone create accounts with the public anon key
and skip those checks.

---

## 6. Verify in production (your own account)

- [ ] Sign in works; Today, Plan, History, Goals, Gyms unchanged.
- [ ] `/signup` shows "Signup isn't open" (the switch isn't set).
- [ ] Login's footer reads "New to Overload? Create an account".
- [ ] Settings → Profile shows an empty **Username** field. Choose your username
      and Save → "Settings saved". Reload: it's still there, in lowercase.
- [ ] Try `admin` → "That username isn't available." (reserved); nothing saved.
- [ ] If friends already have accounts: ask them to choose a username in
      Settings. Until they do, theirs stays empty, which is allowed. They can
      still save their name and timezone without one, and once they've chosen
      one they can change it but not clear it.

---

## 7. Open signup

Only after §1 (Multi-User Foundation verified in production) and §6.

### 7.1 Rate-limit signup first

With no invite code, anyone on the internet can reach the signup form, and
the server creates accounts with the admin API, which Supabase does not rate
limit. Add a limit at the edge before opening:

- Vercel → Project → **Firewall** → **Configure** → **New Rule**, if your plan
  offers rate limiting:
  - **If** Request Path *equals* `/signup` **and** Method *equals* `POST`
  - **Then** Rate Limit: e.g. **5 requests per 60 seconds**, keyed by IP,
    action **Deny** (429).
  - Save, then **Publish**.

The signup form submits as a POST to `/signup`, so this limits account
creation without touching sign-in or anything else.

### 7.2 Turn the switch on

1. Vercel → Production env → add `OVERLOAD_SIGNUP_OPEN` = `true` (server only,
   no `NEXT_PUBLIC_`). **Redeploy** (env changes need a new deployment).
2. Private window → `/signup`: the form shows (first name, last name, username,
   email, password, confirm password).
3. Check the guards without creating anything:
   - Password and Confirm password different → "Passwords don't match."
   - Your own username → "That username is taken."
   - Nothing appears in Authentication → Users.
4. Create one throwaway account (e.g. `+test` on your own email) to confirm
   signup works end to end. Then delete it from **its** Settings → Delete
   account (the app's flow removes its rows, its username, and its login).

**Close signup again:** delete `OVERLOAD_SIGNUP_OPEN` and redeploy. Existing
accounts are unaffected.

### 7.3 Keep an eye on it

- Authentication → Users: unexpected accounts? Close signup (above), then
  investigate. A stranger's account holds only their own data; they can delete
  it themselves, or you can remove it from the dashboard and clean up with
  `docs/runs/09-sql/orphans.sql` (Accounts runbook).
- What open signup reveals: the form says "An account with this email already
  exists." and "That username is taken." Both are unavoidable with unique
  emails and usernames and no email verification. Neither reveals anything
  else about the account. The rate limit makes bulk probing slow.

---

## 8. A friend forgot their password

Unchanged: there is still no in-app reset (no email provider). Follow the
Accounts runbook §8 (`docs/runs/09-accounts-signup-login-password-reset-runbook.md`).

---

## 9. Rollback and recovery

| Situation | What to do |
| --------- | ---------- |
| The deploy misbehaves | Vercel → Deployments → previous production deployment → **Instant Rollback**. Leave the column in place: the previous code ignores it, so rolling code back is safe on its own. The previous code reads `OVERLOAD_INVITE_CODE`; if you deleted it (§5), signup stays closed after the rollback, which is safe. |
| #67 was merged before the migration (signed-in pages error) | Apply §3 immediately (it is safe while the new code is live). Or Instant Rollback first, then §3, then redeploy. |
| Junk signups | Delete `OVERLOAD_SIGNUP_OPEN` and redeploy (closes signup at once). Tighten the §7.1 rule. Remove unwanted accounts as in §7.3. |
| Someone wants a username another account holds | Not possible by design; usernames are first come, first served. You never edit usernames by hand in production. |
| You really need the column gone | Only after the code is rolled back to a version that doesn't know it: `DROP INDEX "profiles_username_key"; ALTER TABLE "profiles" DROP CONSTRAINT "profiles_username_format"; ALTER TABLE "profiles" DROP COLUMN "username";` then remove the row for `9c_profile_username` from `_prisma_migrations`. This discards every account's username (no training data). Not expected to be needed. |
| Restore from the §2 backup | Never needed for this migration (it rewrites no data). If it ever is, restore into a throwaway local database first and compare. |

---

## 10. What was verified (local stack + embedded test DB only)

- Format, lint, typecheck: pass.
- Unit 43 suites / 748 tests. Includes: the signup switch; username rules and
  their agreement with the database CHECK; signup orchestration including
  confirm mismatch, a taken username, a lost race compensated, and a
  different conflict not reported as "taken"; guard tests (only the gate
  reads the switch, no invite code anywhere, only signup asks whether a
  username is free).
- Integration 34 suites / 436 tests. Includes the isolation suite's username
  cases:
  - another account can't take, change, or read a username, in any case;
  - the availability check answers yes/no only;
  - the database refuses duplicates, uppercase, and malformed values;
  - two concurrent saves of one name: exactly one wins;
  - a taken name at signup creates nothing;
  - an account without a username still saves name and timezone;
  - a username can't be cleared once set.
  
  Also the schema checks for the column, index, and CHECK.
- `prisma migrate diff` from the migrations to the schema: empty (no drift).
- The migration applied to the **local** Supabase stack with
  `prisma migrate deploy`; `docs/runs/ove-50-sql/verify-username.sql`
  rehearsed there (results in §4).
- Production build with the switch on; `verify:client-bundle` OK.
- Default e2e 26 passed (signup closed without the switch). Accounts e2e 14
  passed on the local stack, including:
  - no invite field;
  - mismatched passwords create nothing;
  - a capitalized username is stored lowercase;
  - email taken; username taken in another case creates nothing;
  - Settings rename, another account refused the name, the old name freed;
  - an account from before usernames saves its timezone with the field
    empty, then picks one, which can't be cleared afterwards.
  
  Temporary accounts only, each removed through the app.
- Screens checked at phone width in light and dark (signup with errors,
  Settings with the username field and its error).
- Local data unchanged afterwards: 1 profile, 1 auth user, 463 logged sets.
- Production: **not touched.**
