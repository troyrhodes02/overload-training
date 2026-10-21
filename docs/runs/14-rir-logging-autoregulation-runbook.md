# Pitch 14 — RIR Logging & Autoregulation — Runbook

This runbook covers everything a human does outside the codebase to ship RIR Logging & Autoregulation. The autonomous run did not merge to `main`. It did not read, write, or migrate `overload-prod`, and it changed no secret, environment variable, Vercel setting, or Supabase setting. Signup is as the OVE-50 runbook left it. Migration `9f` was applied **only** to the local Supabase CLI stack and to the throwaway test databases.

**What ships:**
- an optional reps-in-reserve choice (`0 1 2 3 4+`) on the active set of the logging card, for weighted and bodyweight exercises
- RIR shown on logged sets and in History, and correctable or clearable in the existing edit dialog
- two documented ways RIR changes the progression result, each with one explanatory line:
  - **A:** the top of the range reached at 0 RIR → Hold
  - **B:** a flat e1RM trend with every set at 2+ → Progress
- one What's New entry, "Reps in reserve"

**What changes in the database:** migration `9f_logged_set_rir` adds one **nullable** column, `logged_sets.rir` (INTEGER, `CHECK rir IS NULL OR rir BETWEEN 0 AND 4`, no default). It's additive and catalog-only, with no backfill. Every existing set reads NULL, meaning "not recorded", which is not 0. No table, trigger, or RLS change.

**What does not change:**
- Every set write still goes through `logSetAction` / `editLoggedSetAction`, so `logged-sets.ts` remains the only writer.
- The baselines, the e1RM formula, goals, the working weight and its offer, the scheduled-deload rule, and every existing progression threshold are untouched.
- The tour is unchanged.

**Merge behavior:** stop before merge (spec R1). Feature PR **#81** waits for your approval.

---

## 0. Order of operations

| # | Step | Reversible? |
| - | ---- | ----------- |
| 1 | Review #81; open the preview HTML | — |
| 2 | Pre-merge: set the release note's date (§2) | — |
| 3 | Pre-merge: real-shaped-data check (§3) and real-device check (§4) | — |
| 4 | Prerequisites: production is on the Pitch 13 release; only `9f` pending (§5) | — |
| 5 | Back up production (§6) | — |
| 6 | Apply `9f_logged_set_rir` to production (§7) | yes (§11), but don't |
| 7 | Verify the migration, read-only (§8) | — |
| 8 | Squash-merge #81 → Vercel deploys production (§9) | yes (instant rollback) |
| 9 | Post-deploy checks (§10) | — |

**Apply the migration before you merge.** The new build reads and writes `logged_sets.rir`, and every `LoggedSet` query includes the column, so the new build against an un-migrated database would fail on every workout page. The old build doesn't care whether the column exists, so migrating first is safe on its own. Do §6–§9 back to back.

---

## 1. Before you review

- Feature PR: https://github.com/troyrhodes02/overload-training/pull/81. Ticket PRs #82–#85 are squash-merged into it.
- Visual contract: open `docs/previews/14-rir-logging-autoregulation-preview.html` in a browser (works offline).
- The rules, in one place: spec §6 and the method note's "RIR scale and progression qualifiers". The constants `RIR_AT_LIMIT = 0` and `RIR_TO_SPARE_MIN = 2` are **Bucket C defaults** that need your review.
- Measured interaction cost (run report §4): **RIR unset is 18 taps / 18 keystrokes**, the same as Faster Logging UX. RIR on the last set of each exercise is 22 / 18; on every set, 29 / 18.

## 2. Pre-merge: set the release note's date (required)

`src/lib/release-notes/entries.ts` has the new top entry dated **provisionally** `2026-10-21`, the day it was written. An entry is dated the day it reaches production (What's New spec §8). On the day you merge:

1. On the feature branch, edit the top entry:
   - `date: "YYYY-MM-DD"` → the merge day (your local date)
   - `id: "YYYY-MM-DD-reps-in-reserve"` → the same date prefix (CI requires the id to start with its date)
   - delete the four-line "PROVISIONAL date" comment
2. Commit (`OVE-65 date the RIR release note`), push, and wait for CI.

If you merge on 2026-10-21, only the comment removal is needed. **Never change the date or id after it reaches production.**

Note on Pitch 13: `2026-10-20-faster-workout-logging` reached `main` on 2026-10-21 with its provisional date and comment still in place. It's published now, so leave its date and id alone. You may delete its stale PROVISIONAL comment; that comment-only edit changes nothing for anyone.

## 3. Pre-merge: verify with real-shaped data

CLAUDE.md requires anything that changes what reaches `LoggedSet` to be verified with real-shaped data before production. The run did this on the **local** stack: a production build, temporary accounts, the representative workout, and `e2e/accounts/rir-logging.spec.ts`. To repeat it against the Supabase **dev** project, use a dev-project preview with **9f applied to the dev project first**. Never point a preview at `overload-prod`.

Locally (needs `npx supabase start`; the configs refuse anything but 127.0.0.1):

```powershell
npm run test:e2e:accounts
```

Or by hand on a preview or local `next start`:

- [ ] Start today's workout. Set 1's row has `RIR  0 1 2 3 4+` under the fields with nothing selected. Type reps and tap **Log set** without touching RIR. The row reads `185 lbs × 8 ✓`, with nothing after it.
- [ ] On set 2, tap `2`, then **Log set**. The row reads `185 lbs × 8 · 2 RIR`. Set 3 starts with nothing selected.
- [ ] Tap a chip while the reps field is focused: the keyboard stays up and the cursor stays in reps.
- [ ] Tap a selected chip again: it clears.
- [ ] Bodyweight (Pushups): there's only a reps box plus RIR, and a logged set reads `16 reps · 0 RIR`.
- [ ] History → today → **edit** a set: the stored RIR is selected. Change it and Save (`Set updated`). Clear it (`Not recorded.`) and Save: the suffix disappears. Weight and reps are unchanged.
- [ ] Case A:
  1. On an exercise you hit the top of the range on last session, do it again with any set at **0**.
  2. The day-complete summary shows `at your limit — holding`, and the exercise page shows `Holding` plus "Top of the range, but at your limit last time (0 RIR) — holding."
  3. Edit that set's RIR to 2: the exercise page now shows Progress with a suggested next weight.
- [ ] Old days logged before this release read exactly as before, with no suffix and no placeholder.

## 4. Real-device check (human only)

Desktop Chrome's touch emulation doesn't reproduce a phone keyboard. On an **iPhone (Safari)**, and an **Android phone (Chrome)** if you have one:

- [ ] Tapping an RIR chip while typing reps keeps the number pad up. The design prevents the chip from taking focus. If iOS drops the keyboard anyway, recording RIR costs one extra tap per set. Note it on #81; it isn't a data problem.
- [ ] The five chips are comfortable one-handed targets and don't scroll sideways at your phone's width. Below 360px the `RIR` label sits above the chips.

## 5. Prerequisites

- [ ] `main` includes Faster Logging UX (#76), and it's live in production.
- [ ] Production has every migration through `9e_release_seen`, and **only** `9f_logged_set_rir` is pending:

```powershell
# From the repo root, with feat/14-rir-logging-autoregulation checked out (do not merge yet).
$env:PROD_DIRECT_URL = "postgresql://postgres.<ref>:<password>@<direct-host>:5432/postgres"  # Supabase → Connect → Direct
$env:DIRECT_URL   = $env:PROD_DIRECT_URL
$env:DATABASE_URL = $env:PROD_DIRECT_URL   # Prisma CLI only; nothing runs the app here
npx prisma migrate status
```

Expected: "Following migration have not yet been applied: 9f_logged_set_rir", and nothing else. **If any other migration is listed, stop** and finish the earlier runbooks first.

## 6. Back up production

```powershell
docker exec supabase_db_overload pg_dump "$env:PROD_DIRECT_URL" -Fc -n public -f /tmp/prod-public-pre-rir.dump
docker cp supabase_db_overload:/tmp/prod-public-pre-rir.dump "$HOME\overload-backups\prod-public-pre-rir-$(Get-Date -Format yyyyMMdd-HHmm).dump"
```

Keep the dump outside the repository. Then note query 4's counts before migrating:

```powershell
Get-Content docs/runs/14-sql/verify-rir.sql | docker exec -i supabase_db_overload psql "$env:PROD_DIRECT_URL" -At
```

Before the migration, queries 1–3 return nothing or error on the missing column. That's expected.

## 7. Apply the migration

```powershell
npx prisma migrate deploy
```

Expected: "Applying migration `9f_logged_set_rir`", then "All migrations have been successfully applied." Adding a nullable column with no default doesn't rewrite the table; it takes well under a second.

## 8. Verify the migration

```powershell
Get-Content docs/runs/14-sql/verify-rir.sql | docker exec -i supabase_db_overload psql "$env:PROD_DIRECT_URL" -At
```

- [ ] Query 1: `rir|YES|int4|(none)`
- [ ] Query 2: `logged_sets_rir_range|CHECK (((rir IS NULL) OR ((rir >= 0) AND (rir <= 4))))`, then `t`, then `0`
- [ ] Query 3: `<sets>|0`, meaning no RIR was invented, and an empty breakdown
- [ ] Query 4: identical to the counts you noted in §6, including `total_reps` and `total_weight_lbs`

Then clear the shell variables:

```powershell
Remove-Item Env:PROD_DIRECT_URL, Env:DIRECT_URL, Env:DATABASE_URL
```

The run rehearsed this file on the local stack after applying 9f there. It returned `rir|YES|int4|(none)`, the CHECK, `t`, `0`, `463|0`, and unchanged counts.

## 9. Merge and deploy

1. Confirm §2 is done (the release note is dated the merge day).
2. Mark #81 ready (it's a draft), then squash-merge it into `main`. Vercel deploys production.
3. Once production is verified (§10), move OVE-62 through OVE-65 to **Done** in Linear.

## 10. Post-deploy checks (production, your own account)

- [ ] On your next full page load, the **What's new** dialog shows **Reps in reserve** once. Tap **Got it** and reload: it doesn't come back. Settings → What's New lists it with the date you set.
- [ ] Log one real set without RIR and one with. History shows the RIR suffix only on the second.
- [ ] **Mixed history:**
  - Your past months of sets show no RIR and give the same progression results as before the deploy. A history with no RIR evaluates identically; that's tested.
  - RIR only starts to matter once a newly logged session becomes "the latest qualifying performance" for a lift, and only in cases A and B.
- [ ] A scheduled deload week still shows only `Deload week — recovery, not a verdict.` RIR logged there never affects any result.
- [ ] **Behavior notes**, which are intended changes, not regressions:
  - A lift that reached the top of its range with a set logged at **0 RIR** now holds and says why. Without RIR, or with 1+ on every set, it's Progress as before.
  - A lift showing `Hold — trend flat` whose last session had **2+ RIR on every working set** now shows Progress with the reason.

## 11. Rollback and recovery

| Situation | What to do |
| --------- | ---------- |
| The deploy misbehaves | Vercel → Deployments → the previous production deployment → **Instant Rollback**. The old build ignores the `rir` column, so the database needs nothing. RIR values recorded meanwhile stay stored and come back with a redeploy. |
| You want to undo the migration | **Don't drop the column.** It would destroy every RIR a lifter recorded, which counts as logged history, and dropping a column is a destructive step no runbook here sanctions. With the column left in place, the old build is fully functional. If it ever truly has to go, take a fresh backup first and treat it as its own reviewed change. |
| The migration failed partway | It runs as one statement pair. Prisma marks it failed; re-run `npx prisma migrate status`. If the column exists without the CHECK, run `npx prisma migrate resolve --rolled-back 9f_logged_set_rir`, then `ALTER TABLE logged_sets DROP COLUMN rir;` (it can hold no values yet), then `migrate deploy` again. Restore from §6 only if anything else is wrong, which this migration can't cause. |
| A lifter recorded a wrong RIR | They correct or clear it from the card (tap the logged set) or from History. Results recompute on the next read. |
| The release note's wording is wrong after it shipped | Correct `title` and `body` in place (never the date or id), or set `significant: false`. |
| You want different thresholds | Change `RIR_AT_LIMIT` / `RIR_TO_SPARE_MIN` in `src/lib/progression/config.ts`, plus the method note and spec. Nothing is stored, so every result follows on the next read. |

## 12. Regression testing (what to run, and where)

All of these run locally; none touches production.

```powershell
npx prettier --check . ; npm run lint ; npx tsc --noEmit
npm test                        # unit
npm run test:integration        # embedded throwaway Postgres (migration rehearsal included)
npm run test:e2e:accounts       # production build against the LOCAL Supabase stack
npx playwright test             # default e2e
npm run verify:client-bundle    # after a build
```

Key suites for this pitch:
- `tests/unit/progression-rir.test.ts`: cases A and B, coverage, boundaries, and a 500-history no-RIR regression sweep
- `tests/integration/rir-logging.int.test.ts` and `rir-migration.int.test.ts`
- `tests/integration/progression-rir.int.test.ts`
- `e2e/accounts/rir-logging.spec.ts`, and `faster-logging.spec.ts`, which now asserts exactly 18 / 18 with RIR unset
- The standing guards in `tests/unit/invariant-guards.test.ts`: RIR is never read by e1RM, baselines, goals, or the offer, and is never added to reps

## 13. Publishing the release note

The release note is published by the production deploy in §9. Nothing else publishes it: no email, no push. Accounts that existed before the entry's date see the dialog once on their next full page load. Accounts created after it start caught up. After publication the entry is permanent, so only its wording may be corrected (What's New content contract, method note).
