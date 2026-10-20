# Pitch 11 — Onboarding Tour — Production Runbook

**Who runs this:** the product's owner, by hand, from a trusted machine. The
autonomous pipeline built and verified everything on the **local** Supabase
stack and an embedded test database only. It never read or changed
production, never set a production secret, and never merged to `main`.

**What it ships:** a short guided tour over the real interface (Today, logging,
Plan, History, Goals, Gyms, Settings) that opens by itself once for a **new**
account, can be skipped at any step, and can be replayed any time from
Settings → Tour → **Replay tour**.

**What changes in the database:** one additive migration,
`prisma/migrations/9d_tour_progress`: a new enum `tour_outcome` and a new,
empty owned table `tour_progress` (RLS enabled with no policies, an
immutable-owner trigger, a CHECK that an outcome always has its time).
**No row is written** and no existing table or column changes; logged history
is not touched.

**Rollout behavior (spec R6):**

| Account | What happens after the deploy |
| ------- | ----------------------------- |
| Any account that exists when 9d is applied (yours, and any friend's) | No `tour_progress` row → **never toured automatically**. Settings → Replay tour works and records its outcome. |
| An account created through signup after the deploy | Its row is created *due* at signup → the tour opens by itself on its first page, once. Finishing, skipping, pressing Escape, using browser Back, or reloading mid-tour all spend it. |
| An account created between applying 9d and the deploy (old signup code) | No row → never toured automatically (the strict reading of "existed before rollout"). Replay works. |
| A hand-provisioned account (no signup; profile created lazily) | No row → never toured automatically. |

**What does not change:** no environment variable, no Vercel setting, no
Supabase Auth setting, no secret, no email, no signup state. Signup stays
exactly as the OVE-50 runbook left it (`OVERLOAD_SIGNUP_OPEN`).

**The one ordering rule:** apply the migration **before** the code deploys.
Every signed-in page now reads `tour_progress` (the layout asks whether the
account is due), and signup writes to it; code that knows about the table
running against a database without it fails on every signed-in page. The
reverse order is safe: old code ignores the extra table.

No secrets appear in this file. **Warning:** the repository's `.env` has held
production values; every command below names its connection explicitly.

---

## 0. Order of operations

| # | Step | Reversible? |
| - | ---- | ----------- |
| 1 | Prerequisites: production is on the OVE-50 release and its migrations | — |
| 2 | Back up production | — |
| 3 | Apply `9d_tour_progress` to production | yes (§7), but don't |
| 4 | Verify the migration (read-only SQL) | — |
| 5 | Review and squash-merge feature PR **#68** → Vercel deploys | yes (instant rollback) |
| 6 | Manual verification in production | — |

Do not merge #68 before §3–§4 pass. Do §3–§5 back to back, so as few accounts
as possible are created in between (they would simply never be auto-toured).

---

## 1. Prerequisites

- [ ] `main` includes OVE-50 (#67) and it is live in production.
- [ ] Production has every migration up to and including
      `9c_profile_username`, and **only** `9d_tour_progress` pending:

```powershell
# From the repo root, on the feature branch's migration folder (check out
# feat/11-onboarding-tour without merging).
$env:PROD_DIRECT_URL = "postgresql://postgres.<ref>:<password>@<direct-host>:5432/postgres"  # Supabase → Connect → Direct
$env:DIRECT_URL   = $env:PROD_DIRECT_URL
$env:DATABASE_URL = $env:PROD_DIRECT_URL   # Prisma CLI only; nothing runs the app here
npx prisma migrate status
```

Expected: "Following migration have not yet been applied: 9d_tour_progress"
and nothing else. **If any other migration is listed, stop** — finish the
earlier runbooks (Pitch 10's `9b_profile_appearance`, OVE-50's
`9c_profile_username`) first.

---

## 2. Back up production

```powershell
docker exec supabase_db_overload pg_dump "$env:PROD_DIRECT_URL" -Fc -n public -f /tmp/prod-public-pre-tour.dump
docker cp supabase_db_overload:/tmp/prod-public-pre-tour.dump "$HOME\overload-backups\prod-public-pre-tour-$(Get-Date -Format yyyyMMdd-HHmm).dump"
```

Keep it outside the repository. Note the counts from query 5 of
`docs/runs/11-sql/verify-tour-progress.sql` before migrating:

```powershell
Get-Content docs/runs/11-sql/verify-tour-progress.sql | docker exec -i supabase_db_overload psql "$env:PROD_DIRECT_URL" -At
```

(Before the migration, queries 1–4 return nothing or error on the missing
table; that is expected.)

---

## 3. Apply the migration

```powershell
npx prisma migrate deploy
```

Expected: "Applying migration `9d_tour_progress`" then "All migrations have
been successfully applied." It creates one empty table and takes well under a
second.

---

## 4. Verify the migration

```powershell
Get-Content docs/runs/11-sql/verify-tour-progress.sql | docker exec -i supabase_db_overload psql "$env:PROD_DIRECT_URL" -At
```

- [ ] Query 1: `user_id|NO|uuid`, `offered_at|YES|timestamptz`,
      `outcome|YES|tour_outcome`, `outcome_at|YES|timestamptz`,
      `created_at|NO|timestamptz`, `updated_at|NO|timestamptz`
- [ ] Query 2: `completed`, `skipped`
- [ ] Query 3: `t`, `0`, `tour_progress_user_id_immutable`, and the constraints
      `tour_progress_outcome_at_check`, `tour_progress_pkey`,
      `tour_progress_user_id_fkey`
- [ ] Query 4: `0|0|0|0` (no account is due, so nobody is auto-toured)
- [ ] Query 5: identical to the counts you noted in §2

Then clear the shell variables:

```powershell
Remove-Item Env:PROD_DIRECT_URL, Env:DIRECT_URL, Env:DATABASE_URL
```

---

## 5. Merge and deploy

- [ ] Review feature PR **#68** (ticket PRs #69–#71 are squashed into it; the
      run's review findings are addressed — see the run report).
- [ ] Squash-merge #68 into `main`. Vercel deploys production.
- [ ] Move OVE-51…OVE-53 to Done.

---

## 6. Manual verification (production)

Your own account (it existed before the tour):

- [ ] Sign in: **no tour** opens. Reload a few pages: still none.
- [ ] Settings shows a **Tour** section between Appearance and Delete account
      with **Replay tour**.
- [ ] Phone (≤ 767px): Replay tour → "1 of 8" on Today (the heading is
      outlined), Next → the day's card, Next → the ☰ menu button, then Plan,
      History, Goals, Gyms (each page's heading), then Settings (the Replay
      button) with **Done**. Done returns to Settings. The ☰ sheet never opens
      by itself.
- [ ] Desktop (≥ 768px): Replay tour → "1 of 7"; Plan, History, Goals, Gyms
      point at the left rail items; the card sits beside them.
- [ ] Skip tour or Escape at any step closes it where you are. Nothing on the
      page is pressable while the tour is open, and everything works after.
- [ ] Your training data is unchanged (Today, History, Goals look as before).

A new account (optional; signup is open behind `OVERLOAD_SIGNUP_OPEN`):

- [ ] Create a throwaway account: its first page opens the tour at step 1.
      Finish or skip it, reload, sign out and in: it does not open again.
- [ ] Delete the throwaway account from Settings → Delete account.

Afterwards, query 4 of `verify-tour-progress.sql` counts one row per account
created since the deploy (plus any account that replayed).

---

## 7. Rollback and recovery

| Situation | What to do |
| --------- | ---------- |
| The deploy misbehaves | Vercel → Deployments → previous production deployment → **Instant Rollback**. Leave the table in place: the previous code ignores it. |
| #68 was merged before the migration (signed-in pages error) | Apply §3 immediately (safe while the new code is live), or Instant Rollback first, then §3, then redeploy. |
| The tour opens for someone it shouldn't | Not expected: only rows created by the new signup code are due. To stop one account's automatic tour, a human may run `UPDATE tour_progress SET offered_at = now() WHERE user_id = '<that account's id>' AND offered_at IS NULL;` (name the account explicitly; it changes nothing else). |
| You really need the table gone | Only after the code is rolled back to a version that doesn't know it: `DROP TABLE "tour_progress"; DROP TYPE "tour_outcome";` then remove the `9d_tour_progress` row from `_prisma_migrations`. This discards only tour state (no training data). Not expected to be needed. |
| Restore from the §2 backup | Never needed for this migration (it writes no data). If it ever is, restore into a throwaway local database first and compare. |

---

## 8. What was verified (local stack + embedded test DB only)

Recorded in the run report (`docs/runs/11-onboarding-tour-report.md` §3), in
short:

- Format, lint, typecheck, unit (registry pinned to the design doc, engine,
  card placement, data-only extensibility, mechanism guards), integration
  (tour progress, the permanent isolation suite with the new
  `isolation/tour.int.test.ts`, account deletion, ownership enforcement, the
  9d migration rehearsal, RLS and schema suites), production build, and the
  client-bundle secret check.
- The migration applied to the **local** Supabase stack with
  `prisma migrate deploy`; this runbook's `verify-tour-progress.sql` rehearsed
  there: columns, enum, RLS on with 0 policies, trigger and constraints,
  0 rows, history counts unchanged (463 logged sets).
- Local-stack browser suites (`npm run test:e2e:accounts`): Accounts lifecycle,
  Personalization, and the new Onboarding Tour suite (first login, play-through
  at 375 and 1280 with every step's target checked, Done/Skip/Escape/abandon,
  replay, crossing md, browser Back). Temporary accounts only, each removed
  through the app's deletion flow; the local database was unchanged afterwards.
- Production: **not touched.**
