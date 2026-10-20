# Pitch 10 — Personalization & Navigation Polish — Production Runbook

**Who runs this:** the product's owner, by hand, from a trusted machine. The
autonomous pipeline built and verified everything on the **local** Supabase
stack and an embedded test database only. It never read or changed
production, never set a production secret, and never merged to `main`.

**What it ships:** the Today greeting, the Appearance setting (Light / Dark /
System) in Settings, and phone navigation (menu button + sheet; desktop rail
unchanged).

**What changes in the database:** one additive migration,
`prisma/migrations/9b_profile_appearance`:

```sql
CREATE TYPE "appearance" AS ENUM ('system', 'light', 'dark');
ALTER TABLE "profiles" ADD COLUMN "appearance" "appearance" NOT NULL DEFAULT 'system';
```

Every existing profile reads `system`, which is exactly today's behavior
(follow the device). No table is created, so there is no RLS change; no row is
rewritten except to receive the column default; logged history is not touched.

**What does not change:** no environment variable, no Vercel setting, no
Supabase Auth setting, no secret, no email, no signup state. Signup stays
exactly as the Accounts runbook left it.

**The one ordering rule:** apply the migration **before** the code deploys.
Prisma reads every `profiles` column, so code that knows about `appearance`
running against a database without it fails on every signed-in page. The
reverse order is safe: old code ignores the extra column.

No secrets appear in this file. **Warning:** the repository's `.env` has held
production values; every command below names its connection explicitly.

---

## 0. Order of operations

| # | Step | Reversible? |
| - | ---- | ----------- |
| 1 | Prerequisites: production is on the Accounts release and its migrations | — |
| 2 | Back up production | — |
| 3 | Apply `9b_profile_appearance` to production | yes (§7), but don't |
| 4 | Verify the migration (read-only SQL) | — |
| 5 | Review and squash-merge feature PR **#62** → Vercel deploys | yes (instant rollback) |
| 6 | Manual verification in production | — |

Do not merge #62 before §3–§4 pass.

---

## 1. Prerequisites

- [ ] `main` includes the Accounts release (#56) and it is live in production.
- [ ] Production has every migration up to and including
      `9_account_ownership_2_enforce`, and **only** `9b_profile_appearance`
      pending:

```powershell
# From the repo root, on main + this branch's migration folder (i.e. after
# checking out feat/10-personalization-navigation-polish, without merging).
$env:PROD_DIRECT_URL = "postgresql://postgres.<ref>:<password>@<direct-host>:5432/postgres"  # Supabase → Connect → Direct
$env:DIRECT_URL   = $env:PROD_DIRECT_URL
$env:DATABASE_URL = $env:PROD_DIRECT_URL   # Prisma CLI only; nothing runs the app here
npx prisma migrate status
```

Expected: "Following migration have not yet been applied: 9b_profile_appearance"
and nothing else. **If any other migration is listed, stop** — production is
not where this release assumes (finish the Multi-User Foundation / Accounts
runbooks first).

---

## 2. Back up production

Use the local stack's container so `pg_dump` matches the server version
(same as the Multi-User Foundation runbook):

```powershell
docker exec supabase_db_overload pg_dump "$env:PROD_DIRECT_URL" -Fc -n public -f /tmp/prod-public-pre-appearance.dump
docker cp supabase_db_overload:/tmp/prod-public-pre-appearance.dump "$HOME\overload-backups\prod-public-pre-appearance-$(Get-Date -Format yyyyMMdd-HHmm).dump"
```

Keep it outside the repository. Note the counts from
`docs/runs/10-sql/verify-appearance.sql` query 5 before migrating:

```powershell
Get-Content docs/runs/10-sql/verify-appearance.sql | docker exec -i supabase_db_overload psql "$env:PROD_DIRECT_URL" -At
```

(Query 1 returns nothing and query 2 returns nothing before the migration; that is expected.)

---

## 3. Apply the migration

```powershell
npx prisma migrate deploy
```

Expected: "Applying migration `9b_profile_appearance`" then "All migrations
have been successfully applied." It is two statements and takes well under a
second; nothing is locked for longer than adding a defaulted column.

---

## 4. Verify the migration

```powershell
Get-Content docs/runs/10-sql/verify-appearance.sql | docker exec -i supabase_db_overload psql "$env:PROD_DIRECT_URL" -At
```

- [ ] Query 1: `appearance|NO|'system'::appearance|appearance`
- [ ] Query 2: `system`, `light`, `dark`
- [ ] Query 3: every profile `system` (count = your number of accounts)
- [ ] Query 4: `t` and `0` (RLS on, no policies)
- [ ] Query 5: identical to the counts you noted in §2

Then clear the shell variables:

```powershell
Remove-Item Env:PROD_DIRECT_URL, Env:DIRECT_URL, Env:DATABASE_URL
```

---

## 5. Merge and deploy

- [ ] Review feature PR **#62** (all ticket PRs #63–#66 are squashed into it;
      the run's review findings are addressed — see the run report).
- [ ] Squash-merge #62 into `main`. Vercel deploys production.
- [ ] Move OVE-46…OVE-49 to Done.

---

## 6. Manual verification (production, your own account)

Phone (or a ≤ 767px window):

- [ ] Today shows one heading line with your first name (if you've set it in
      Settings; without a name it reads e.g. "Good morning. Push Day 1 is up.")
      and a true clause for today. Reload: same sentence.
- [ ] No bottom navigation bar. The ☰ button opens the sheet with Today, Plan,
      History, Goals, Exercises, Gyms, then Settings; choosing one closes it.
      Escape / tapping outside closes it.
- [ ] A screen with a bottom action (e.g. Gyms → Add gym) has it at the very
      bottom edge.
- [ ] Mid-workout (Resume a workout): the sheet opens and closes without
      touching the numbers you typed.

Settings:

- [ ] Appearance shows **System** selected.
- [ ] Choose Dark: the app switches at once. Reload: still Dark, with no flash
      of light. Open Overload on another device: Dark after signing in.
- [ ] Choose System, then flip your device's dark mode: Overload follows.
- [ ] Choose your preferred setting and leave it.

Desktop (≥ 768px):

- [ ] The left rail and header look exactly as before; no ☰ button.

If a friend has an account: their appearance is untouched by yours (each
starts at System).

---

## 7. Rollback and recovery

| Situation | What to do |
| --------- | ---------- |
| The deploy misbehaves | Vercel → Deployments → previous production deployment → **Instant Rollback**. Leave the column in place: the previous code ignores it, so rolling code back is safe on its own. |
| #62 was merged before the migration (signed-in pages error) | Apply §3 immediately (it is safe while the new code is live) — or Instant Rollback first, then §3, then redeploy. |
| You really need the column gone | Only after the code is rolled back to a version that doesn't know it: `ALTER TABLE "profiles" DROP COLUMN "appearance"; DROP TYPE "appearance";` then remove the row for `9b_profile_appearance` from `_prisma_migrations`. This discards every account's appearance choice (display preferences only; no training data). Not expected to be needed. |
| Restore from the §2 backup | Never needed for this migration (it rewrites no data). If it ever is, restore into a throwaway local database first and compare. |

---

## 8. What was verified (local stack + embedded test DB only)

Recorded in the run report (`docs/runs/10-personalization-navigation-polish-report.md`
§3), in short:

- Format, lint, typecheck, unit, integration (incl. the permanent isolation
  suite with the new `isolation/greeting.int.test.ts` and appearance cases in
  `isolation/profile.int.test.ts`; schema and RLS suites), production build.
- The migration applied to the **local** Supabase stack with
  `prisma migrate deploy`; `docs/runs/10-sql/verify-appearance.sql` rehearsed
  there (column, enum, all `system`, RLS on with 0 policies, history counts
  unchanged — 463 logged sets).
- Local-stack browser suites (`npm run test:e2e:accounts`): Accounts lifecycle
  plus the new Personalization suite (greeting for a first visit, appearance
  default/instant/persistent/per-account/System-live, phone sheet, desktop
  rail unchanged, missing timezone). Temporary accounts only, each removed
  through the app's deletion flow.
- Production: **not touched.**
