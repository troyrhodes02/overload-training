# QA fixture account (overload-dev)

One realistic, fully populated test account on the development project (`overload-dev`, ref `vdxrmfadikwzodjljbdi`) that you can reset to the same baseline before every manual web or iPhone test session. Tooling: `apps/web/scripts/qa-fixture/` (OVE-173). It never runs against Production or the local stack.

## 1. The designated test account

The fixture acts on **one auth user you name by id** on every run. It never picks an account, never acts on several, and refuses any account whose email is not on a reserved, non-routable test domain (`example.com`, `example.net`, `example.org`, or anything under `.test`, `.example`, `.invalid`, `.localhost`). Real accounts use real email domains, so a real account can never be a target.

Use the existing development tester, `overload-staging-tester@example.com`. If it does not exist yet, create it with the provisioner (see `docs/technical/staging-environment.md` → "Reusable staging test account"); it creates the auth user, its profile, and a comp Pro entitlement, with no training data.

Find its id (read-only), in the overload-dev SQL editor:

```sql
select id, email from auth.users where email = 'overload-staging-tester@example.com';
```

Or Supabase dashboard → overload-dev → Authentication → Users → the user → **User UID**.

The account must have signed in once (or been provisioned) so its Overload profile exists. If it has none, the tool refuses and tells you so.

**One-time project check.** Every operator tool verifies the database identity marker before writing. If the tool reports it missing, run the two lines it prints in the overload-dev SQL editor (they create an empty `overload_target` schema with a comment; no table).

## 2. Environment

Export the **development** values in the shell (the tool never reads `.env`). `DATABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` are required and must both name `vdxrmfadikwzodjljbdi`; `DIRECT_URL`, if set, must too. No service-role key is needed.

```sh
export DATABASE_URL='<overload-dev transaction pooler URL, port 6543>'
export NEXT_PUBLIC_SUPABASE_URL='https://vdxrmfadikwzodjljbdi.supabase.co'
export QA_USER='<the test account uuid>'
```

Run every command from the repository root.

## 3. Verify (read-only)

```sh
npm run qa:verify -- --user-id "$QA_USER" --confirm-ref vdxrmfadikwzodjljbdi
```

Reports `EMPTY` (no training data), `BASELINE` (matches, anchored today), `STALE` (matches, but reset on an earlier day, so today's workout no longer lines up), or `DRIFTED` (differs; each failed check is listed, exit code 2). It checks row counts, the profile, onboarding, an active comp (by the same rule the entitlement resolver uses), and the values of every seeded section (plans, history, sets, goals, gyms, cardio, favorites, preferences) against the committed baseline fingerprint, so an edited past set reads as drift. It writes nothing.

## 4. Seed (empty account only)

```sh
npm run qa:seed -- --user-id "$QA_USER" --confirm-ref vdxrmfadikwzodjljbdi                                    # dry run
npm run qa:seed -- --user-id "$QA_USER" --confirm-ref vdxrmfadikwzodjljbdi --execute --confirm-user "$QA_USER"  # write
```

Seed refuses an account that already holds any training data. Use reset instead.

## 5. Reset (before every test session)

```sh
npm run qa:reset -- --user-id "$QA_USER" --confirm-ref vdxrmfadikwzodjljbdi                                       # dry run: counts, what goes, what stays
npm run qa:reset -- --user-id "$QA_USER" --confirm-ref vdxrmfadikwzodjljbdi --execute --confirm-destroy "$QA_USER"  # delete and restore
```

**This deletes the test account's training data.** Expect it to take a minute or two over the pooler (several thousand writes; the transaction allows ten minutes). It runs in one transaction: the deletes and the new baseline commit together, and any failure leaves the account exactly as it was. There is no `--force`; the only confirmation is `--confirm-destroy` repeating the same account id.

### What a reset deletes (this account only)

`LoggedSet`, `LoggedExercise`, `GymExerciseBaseline`, `Goal`, `CardioLog`, `MissedDayResolution`, `LoggedSession`, `PlannedCardio`, `SessionExercise`, `Session`, `Mesocycle`, `ExerciseFavorite`, the account's **custom** `Exercise` rows, `Gym`, and the mobile API's retry records (`ApiIdempotencyKey`). Every delete uses the account-deletion module's own removal steps, through the account-scoped client and in that module's order, so another account and the shared library cannot be reached.

### What a reset keeps

- The Supabase Auth user (never deleted or recreated) and the `Profile` row. The profile's first and last name, time zone (`America/Chicago`), and appearance are rewritten to the baseline; the username is kept.
- `TourProgress` and `ReleaseSeen`, rewritten to "tour finished" and "What's New caught up".
- `Entitlement` rows: trial and revoked rows are kept, and an active comp is kept. If the comp has expired (or there is none), the reset revokes the expired one and adds a fresh comp (reason `tester`, no end date), so the account is always Pro after a reset.
- `BillingAccount` and `PromoRedemption` (the Stripe mirror; never written), `Feedback` and attachments, and plan-import data (`ImportSession`, `ImportSourcePart`, `ImportUsageDay`). An import linked to one of the account's blocks is unlinked, not deleted (below).
- The shared exercise library, global configuration, and every other account.

A confirmed plan import keeps a link to the block it created, and a block cannot be deleted while it is linked. So, inside the same transaction and before deleting the blocks, the reset unlinks **this account's own** plan imports from its blocks and keeps the import records (still confirmed, with no linked plan; the import page then shows the finished import without an "Open plan" link). The dry run shows how many it would unlink. Do not use `npm run plan-import:cleanup` for this: that tool works across every account and never touches a confirmed import.

## 6. The baseline (fixture `qa-v1`)

All dates are relative to the reset day ("today" in America/Chicago), so the plan is current whenever you reset.

| Area | What you get |
| --- | --- |
| Account | Quinn Tester, America/Chicago, appearance System, onboarding tour finished, What's New caught up, comp Pro (reason `tester`; no Stripe customer, subscription, or invoice) |
| Gyms | Northside Strength (location "Example City") and Riverside Fitness |
| Exercises | Library lifts only (never copied), plus one custom exercise, Landmine Squat; favorites: Barbell Bench Press - Medium Grip, Barbell Squat, Pullups, Landmine Squat |
| Plan | Strength Block 1 (5 weeks, deload every 5th week; archived) and Strength Block 2 (6 weeks, active, now in week 4). Four sessions a week: Upper A, Lower A, Upper B, Lower B. Free weights, machines, cables, bodyweight (Pullups), ranged targets (6–8, 10–12) and a fixed one (Barbell Deadlift 2 × 5) |
| Today | Upper A, ready to start (nothing logged today) |
| History | About eight weeks of completed workouts, the scheduled deload week included, with RIR on Block 2's bench, squat, and deadlift; Upper B alternates gyms, so the Leverage Chest Press and Seated Cable Rows have a different working weight at each gym |
| Missed day | Block 2 week 2's Lower B, resolved as skipped (no prompt on Today) |
| Cardio | Incline walk (30 min) and Stationary bike (40 min) planned on the two rest days; five sessions logged, one planned bike left unlogged (shown as missed) |
| Goals | Bench 225 × 5 active and partway; Leverage Chest Press 160 × 12 at Northside active (gym-scoped); Barbell Squat 205 × 7 reached (its "Goal reached" card waits on the Goals page); Standing Military Press 135 × 5 archived by hand |
| Engine | Barbell Bench Press - Medium Grip: ready to go up. Incline Dumbbell Press: hold. Standing Military Press: deload. Nothing derived is stored; the app computes it on read |

Not seeded, by design: a Free-plan state (revoke the comp in Admin, or use a second account), a shifted missed day, plan-import drafts, feedback, and billing.

## 7. What to test

| Surface | Where | What to expect |
| --- | --- | --- |
| Active workout | Today → Start (Upper A) | Card per exercise with the working weight offered; log sets, RIR, skip, extra set, change gym, finish |
| Completed history | History → any earlier week | Every block's workouts; open one and edit a past set (the call on that lift follows the edit) |
| Missed day | History → Block 2, week 2 | Lower B shown as skipped |
| Progression (Pro) | Today's list, the workout cards, an exercise page | Bench says go up, Incline Dumbbell Press hold, Standing Military Press deload, each with its one-line reason |
| Gym baselines | Exercises → Leverage Chest Press | One history per gym; a different working weight at Northside and Riverside |
| Exercise history (Pro) | Exercises → Barbell Bench Press - Medium Grip | Records, the e1RM trend, every session with its sets and RIR |
| Goals | Goals | Two active with progress, the reached card for squat, goal history with the archived military press |
| Cardio | Today on a rest day; History | Planned and logged cardio; the unlogged bike shown as missed |
| Pro visibility | Settings → Plan & Billing | Comped Pro; no purchase needed. For the Free view, revoke the comp in Admin, then reset to restore it |

After a session, reset to start the next one from the same baseline. Changing `scripts/qa-fixture/fixture.ts` changes the baseline: bump `QA_FIXTURE_VERSION` and update `scripts/qa-fixture/baseline.ts` (the integration test prints the new section hashes).
