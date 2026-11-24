# Goals & Exercise History (+ OVE-241 Native Weekly Scheduling) — Runbook

This runbook covers what you do outside the codebase for Pitch 21i and the separate chore OVE-241 (native weekly scheduling parity). Both ship in one staging update:

- check the staging delivery
- create the two test accounts
- run five iPhone checks in one sitting

Production promotion is **not** part of this runbook. It needs your separate approval after you accept both on the iPhone.

Nothing here needs a migration, an environment change, a native build, or Stripe. The runtime fingerprint is unchanged (`f98506f78a`), so the development build already on your iPhone (`86e673d0`) takes the update.

## 1. Start from zero

### A. The checkout

```bash
cd ~/Dev/overload-training
git checkout staging
git pull --ff-only origin staging
git status --short --branch     # "## staging...origin/staging" and nothing under it
git log --oneline -1            # the 21i delivery-record commit (§8) or later
```

### B. Servers: none needed

You don't need a local Next.js server or Metro. The staging deployment serves the API, and the phone loads the published staging update. If Metro is still running from earlier work, stop it with Ctrl-C in its window, so the phone can't pick up a local bundle.

### C. The iPhone on the staging update

1. Open **Overload Dev**. If it reopens the last project, shake the phone and tap **Go home**.
2. Tap **Enter URL manually** and enter `https://u.expo.dev/3b322e4a-1bf6-422e-9feb-3aa859dffb46?channel-name=staging`.
3. Open More → **Diagnostics** and check these rows:

| Row | Expected |
| --- | --- |
| Environment / API / Supabase project | `staging` / the `overload-training-git-staging-…vercel.app` host / `vdxrmfadikwzodjljbdi` |
| Running | `EAS update` |
| Update group | the group in §8 |
| Commit | the commit in §8 |
| Runtime | `f98506f78a` |

If Diagnostics shows an older group, force-close Overload Dev (swipe it away) and open the URL again.

### D. The staging web app (for the parity checks)

`https://overload-training-git-staging-wtrhodes02-gmailcoms-projects.vercel.app`

Sign in to Vercel in that browser first (Deployment Protection), then sign in to Overload with the same test account. Production is `www.overloadtraining.app`. Never use it for these checks.

## 2. The two test accounts

| Account | Profile | What it holds |
| --- | --- | --- |
| **Primary** (Pro) | `21i-combined` | The gym story, anchored on the day you create it. **This week:** today Upper B, then Lower B, rest, Upper A, Lower A, rest, rest. Every planned day can still be swapped or skipped. **Gyms:** machines trained at Northside Strength and Riverside Fitness, plus Harbor Barbell with no history. **History:** 30+ finished workouts across two blocks, with RIR on the last two Bench sessions. **Goals:** Bench 225 × 5 (active, with progress), Leverage Chest Press 180 × 10 at Northside (active), Squat 135 × 5 (already met, so it shows one "Goal reached" card), and Military Press 155 × 5 (archived). |
| **Secondary** (Free) | `21i-free` | The standard story on the Free plan, with one active goal: Bench 225 × 5. |

Edge cases are covered by the automated suites, not by more accounts. These include sparse history, corrections, duplicate goals, archived exercises, scheduling conflicts, the time zone, and isolation (§6).

## 3. Create the accounts (on the day you test)

A story is anchored to the day the account is created. If you create it today and test tomorrow, today's Upper B turns into a missed day. The strip then waits for that answer and won't move anything. **Create the accounts on the day you test.** Each takes about two and a half minutes.

```bash
cd ~/Dev/overload-training
set -a; . apps/web/.env.overload-dev; set +a
# Prints only the project ref. It must read vdxrmfadikwzodjljbdi (overload-dev).
node -e 'console.log("Supabase project:", new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0])'

day=$(date +%m%d)
npm run dev:test-account -- --email "21i-combined-$day@example.com" --profile 21i-combined --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email "21i-free-$day@example.com"     --profile 21i-free     --confirm-ref vdxrmfadikwzodjljbdi --execute
```

A good run of each prints `ENGINE CHECK PASSED`. Before that comes the resource check, which reads the app's own goals and week, for example:

```text
  Goals:     Barbell Bench Press 225 lb × 5 84%; Leverage Chest Press @ Northside Strength 180 lb × 10 …%
  History:   Barbell Squat 135 lb × 5 (reached); Standing Military Press 155 lb × 5 (archived)
  This week: Tue Upper B · Wed Lower B · Thu rest · Fri Upper A · Sat Lower A · Sun rest · Mon rest
ENGINE CHECK PASSED
```

Some failures and what to do:

- **"Transaction API error: … expired transaction":** nothing was written. Run the same line again.
- **`ENGINE CHECK MISMATCH`:** the data was kept. Send me the lines, and use a new email.
- **No `--execute`:** that's a dry run, and it writes nothing.

The command refuses non-test emails, any project but `overload-dev`, and accounts that already hold data.

### Passwords

Each password is in an owner-only file and is never printed. To copy one to the clipboard:

```bash
day=$(date +%m%d)
sed -n 's/^PASSWORD=//p' ~/.overload-dev/accounts/21i-combined-$day@example.com.txt | tr -d '\n' | pbcopy
sed -n 's/^PASSWORD=//p' ~/.overload-dev/accounts/21i-free-$day@example.com.txt     | tr -d '\n' | pbcopy
```

Universal Clipboard pastes it on the iPhone.

### Running a check again

A used account can't be rewound. Make another with a new email and the same profile, such as `21i-combined-$day-2@example.com`.

## 4. iPhone acceptance: five checks in one sitting

Sign in once as the **primary** account and do checks 1 to 4 in order. Each one leaves the week ready for the next. Sign out once for check 5's Free part.

### Check 1 — Goals (primary)

1. Open **Goals**. You should see one **Goal reached** card, "Barbell Squat · 135 lb × 5" (the history already meets it). It plays one success haptic. Then two active goals:
   - Bench 225 lb × 5, with a percent and a bar.
   - Leverage Chest Press · Northside Strength 180 lb × 10.
2. Tap **Done** on the card. It goes away, and it doesn't come back when you leave and return.
3. Tap the Bench goal. It shows the target, the percent, **Best** (e1RM from a set and a date), and **Target** e1RM. Compare with the web: open `/goals` there. The numbers should be identical.
4. Tap **Exercise history**. Native history opens. Go back.
5. Back on Goals, tap **New goal**, search "lat", and pick **Wide-Grip Lat Pulldown**. It's a machine, so it asks **Measured at** and preselects a gym. Enter 150 lb and 10 reps, then tap **Set goal**. The goal opens, and it's also listed on the web.
6. Tap **Goal history (2)**. It lists Squat (Reached) and Military Press (Archived). Tap one to open it.

### Check 2 — Exercise history and the chart (primary)

1. Go to More → Exercises → **Barbell Bench Press** → **History and records**. This is now native, with no web link.
2. Check that **Next time** shows a call, and **Records** shows Best set, Best e1RM (an estimate), Heaviest weight, and Rep records.
3. Check the **Trend · e1RM** chart. Tap a few points: the line under the chart changes to that date, value, and sets. **Show values** lists every point.
4. Under **Sessions**, the newest two Bench sessions show **RIR 2 · 1 · 1**. Tap a date to open that workout, then go back to the same place.
5. Open More → Exercises → **Leverage Chest Press** → History. Switch the gym chips between Northside and Riverside. Records, the chart, and sessions all change together.
6. Compare one exercise with the web's `/exercises/<id>` page. The sessions, records, and current e1RM should match.

### Check 3 — Weekly scheduling (primary)

1. Open **Today**. The strip shows seven days. Today is circled and selected, and Upper B is below the strip with **Swap day** and **Skip workout** above it.
2. Tap tomorrow (**Lower B**). A preview shows its exercises, Swap day, Skip workout, and the note "Today already has Upper B…". Train today isn't offered.
3. Tap **Swap day**, choose the day with **Upper A**, check "This week after the swap", then tap **Swap days**. Tomorrow now shows Upper A, and that later day shows Lower B.
4. Pull down to refresh: the change stays. Open the staging web Today: it shows the same week.
5. Optional: History → next week shows every workout back on its usual day.

### Check 4 — Train today and Skip (primary, continuing)

1. Tap **Swap day** on today's Upper B. Choose the rest day right after tomorrow, then tap **Swap days**. Today is now a rest day.
2. Tap tomorrow (Upper A after check 3), then **Train today** → **Move to today**. The gym sheet opens. Pick a gym, and the workout opens. Log one set, then go back.
3. Tomorrow is now a rest day, so Upper A isn't on two days. Today shows Upper A in progress.
4. Tap **Lower A** later in the week → **Skip workout** → confirm. The cell shows "Skipped", crossed out.
5. Pull down to refresh: everything persists, and the web shows the same.

### Check 5 — Workout regression and the Free state

1. Primary: **Resume** today's workout. Logging works. On a card, tap **About this exercise** → **History and records**. History opens over the workout. Its session dates aren't links there. Go back twice, and the workout is untouched with your entries kept.
2. Sign out (More → Sign out). Sign in as the **Free** account.
3. Open **Goals**. Bench 225 lb × 5 shows its percent: goals are Free.
4. Open More → Exercises → Barbell Bench Press → History and records. The sessions, Best set, and Heaviest weight show. Best e1RM reads "— Part of Pro", Trend reads "The e1RM trend is part of Pro.", and there's one quiet Pro note with no link. There are no calls next to the sessions.

Report anything that differs as a defect, and say which check and step.

## 5. Web/iPhone parity matrix

| Area | Web | iPhone | Same source | Result |
| --- | --- | --- | --- | --- |
| Active goals, percent, best, target e1RM | `/goals`, `/goals/{id}` | G1, G3 | `listActiveGoals`, `getGoalDetail` after `reconcileGoalCompletionsSafely` | equal (automated: E1/E3 integration; manual: Check 1) |
| Goal reached card, acknowledge once | `/goals`, Today | G1, G3 | `listUnacknowledgedCompletions`, `acknowledgeGoalCompletion` | equal. Today's goals block isn't on the phone (RD-8, intentional) |
| Set goal: rules and messages | `/goals/new/{id}` | G4, G5 | `getGoalFormContext`, `createGoal`, shared `parseGoalInput` | equal; the phone adds a retry key (no duplicate on resend) |
| Archive goal (no undo) | goal page | G3 | `archiveGoal` | equal |
| Goal history | `/goals/history` | G2 | `listGoalHistory` | equal |
| Exercise sessions as logged (RIR, swaps, not counted, gym) | `/exercises/{id}` | X2 | gated `getExerciseHistory` | equal |
| Records (best set, best e1RM, heaviest, rep records, most reps) | same | X2 | same | equal |
| Trend points | e1RM, Weight, and Reps tabs, plus the projected-RIR overlay | one chart: e1RM (loaded) or reps (bodyweight) | same points | **intentional difference**: the Weight view and the overlay stay on the web (RD-6) |
| Machine gym scopes | gym select | gym chips | same scopes | equal |
| Free: withheld fields and one note | upgrade note with a link | Pro note without a link (no purchase flow in the app) | `gateHistory` | equal values; the note's link is intentionally absent |
| Week strip states, preview, the "today taken" note | web Today | native Today | `getThisWeek` | equal |
| Skip / Train today / Swap (including with a rest day) | dialogs | system alerts, plus a page sheet for Swap | `skipUpcomingWorkout`, `rescheduleWorkout` | equal answers, replay, stale conflict |
| Train today then start | `/log/start` | gym sheet and unfinished warning | `POST /workouts` | equal (`performedOn` today, `scheduledFor` authored) |

**Discrepancies found and resolved in this run:** none in shared data. Every number on both clients comes from the same server functions. The two intentional differences are recorded above as RD-6 and RD-8 in the spec.

## 6. What the automated suites cover (no extra accounts needed)

- **Isolation (one case per new endpoint):** another account's goal, exercise history, form context, and schedule reads and writes are 404 or empty, and nothing is written.
- **Goal create:** retry with the same key, the same key with a different body (409), a race to the one-active-goal index (one 201, one 409), every validation rule, already-met at creation.
- **Corrections:** a corrected past set changes records, best e1RM, and the goal percent on the next read.
- **Free:** the e1RM trend, best e1RM, rep records, and calls are withheld by the server, and `locked` is set.
- **Scheduling:** skip and replay, Train today then start, swap two workouts, swap with a rest day, stale conflict, a missed day blocks moves, and the authored plan is never written.

## 7. Verification record

This run was on 2026-11-24. The suites ran on the combined branch, and the staging checks ran on `staging` at `112737c`.

| Check | Result |
| --- | --- |
| Lint and typecheck (root, web, mobile, shared) | pass. Lint: 0 errors, 1 pre-existing warning in `history-week.ts`. |
| Format | pass (Prettier on every changed file) |
| Web unit (`npm test`) | 2,772 passed |
| Mobile (`jest`) | 556 passed after the review fixes |
| Workspace boundaries (`posttest`) | pass |
| Integration, full (`npm run test:integration`) | **1,569 passed, 112 suites.** Covers the isolation suite, with every new endpoint in the auth, suspension, and version matrix plus a cross-account case; goals and history (13); scheduling (7); and the 21i profiles. |
| Production web build (`next build`, placeholder env) | pass |
| Client-bundle secret scan (`verify:client-bundle`) | OK |
| iOS export (`expo export --platform ios`) | 1,484 modules; no secret patterns in the bundle |
| Diff secret scan | nothing found |
| Runtime fingerprint | `f98506f78a`, unchanged |
| Independent read-only review of the combined diff | No isolation, Free/Pro leak, goal-lifecycle, idempotency, or backward-compatibility issue. Four mobile defects were found and fixed in #314: 5a, 5b, 5c, 5d. |
| Staging API (`vercel curl`, real `overload-dev` accounts) | **30/30 passed.** The 11 new endpoints answer 401 without a token. Pro: goals, detail, history, exercise history (8 e1RM points, RIR on 2 sessions), machine gym scopes, and this week. Free: plain history with Pro fields withheld (`locked`), and goals Free. Cross-account reads and skips are 404. Goal create: 201, then a replay with the same id, then 409 for a reused key, then 409 for a duplicate. Archive and its replay, and acknowledge, pass. Swap, then replay `unchanged`, then a stale request 409. Skip and its replay pass. Rest-day swap, then Train today, then start on today, pass. |
| Simulator and physical iPhone | **not run by the pipeline.** §4 is for you. |

## 8. Delivery record

| Item | Value |
| --- | --- |
| Docs PR | #308 (`bdf815f`): pitch, design, spec, OVE-241 chore spec |
| 21i PRs | #309 OVE-242, #310 OVE-243, #311 OVE-244, #312 OVE-245, #314 OVE-246 (with the review fixes) |
| OVE-241 PR | #313 (`b49fae8`) |
| Sync before the run | #307: `main` (the OVE-240 release) merged into `staging` |
| Staging HEAD at publish | **`112737c`** |
| Staging web deployment | Vercel: success, for `112737c` |
| Staging update group | **`4e76746e-3938-463b-befb-f813e66dd126`** |
| iOS update ID | `01a20f56-1c49-79a0-bc52-17e385b7e741` |
| Channel / branch | `staging` / `staging` |
| Commit | `112737c` |
| Runtime | `f98506f78acfef2f8bfc764d2e31f16475e2f501` (`f98506f78a`) |
| Compatible build | EAS development build `86e673d0` (the one on your iPhone) |
| Update URL | `https://u.expo.dev/3b322e4a-1bf6-422e-9feb-3aa859dffb46?channel-name=staging` |
| Dashboard | https://expo.dev/accounts/wtrhodes/projects/overload/updates/4e76746e-3938-463b-befb-f813e66dd126 |
| Design canvas | https://claude.ai/artifact/4TV52JUVhE5TrH6YveNbk3 |

On the iPhone, More → Diagnostics must show update group `4e76746e`, commit `112737c`, and runtime `f98506f78a`.

**Test accounts the run made.** These are on overload-dev, anchored 2026-11-24, with password files in `~/.overload-dev/accounts/`. If you test on a later day, make fresh ones (§3).

| Email | Profile | Check |
| --- | --- | --- |
| `21i-combined@example.com` | `21i-combined` | Goals Bench 225 × 5 86% and Leverage Chest Press @ Northside 180 × 10 75%. History: Squat reached, Military Press archived. Week: Upper B · Lower B · rest · Upper A · Lower A · rest · rest. ENGINE CHECK PASSED. Read only by the staging checks. |
| `21i-free@example.com` | `21i-free` | Free. Bench 225 × 5 86%. ENGINE CHECK PASSED. Read only, apart from one refused cross-account skip. |
| `21i-verify@example.com` | `21i-combined` | **Used by the staging write checks**: a Lat Pulldown goal created then archived, the Squat card acknowledged, a swap, a skip, a rest-day swap, Train today, and a started workout. Don't use it for the acceptance checks. |

## 9. Owner acceptance (2026-11-24)

The owner tested staging update `4e76746e` (commit `112737c`, runtime `f98506f78a`) on a physical iPhone, on development build `86e673d0`. **5 of 5 acceptance groups passed:**

1. **Goals:** Goal reached acknowledgement; the active goal list and the percent; goal detail; navigation to exercise history; creating a goal; completed and archived history.
2. **Exercise history and the chart:** native history; personal records; chart interaction; set details and RIR; gym-specific machine history; native navigation.
3. **Weekly scheduling:** seven-day navigation; preview; swapping two workout days; the updated schedule persisting after a refresh.
4. **Train today and Skip:** swapping a workout with a rest day; Train today, then starting the moved workout and saving a set, with no duplicate pending occurrence; skipping ahead of time; persistence.
5. **Workout regression and the Free state:** resuming an active workout; exercise history from a card, returning with the workout state and saved sets intact; Free goals and basic history; Pro intelligence gated by the server.

No defects were reported, so no corrected update was needed.

## 10. Production release and sync (2026-11-24)

- **Release:** #316, cut from `main` and squash-merged as **`707f981`**. It carries 21i and OVE-241 together.
- **Production:** deployment `dpl_12bDctz58Te8CEbmmJsNfTkDiWAE` is Ready on `www.overloadtraining.app`. The non-destructive smoke checks passed 18/18.
- **Not needed:** no migration and no environment change.
- **Sync:** `main` was merged back into `staging` by #317 (`8abe95f`).
- **Record:** `docs/releases/2026-11-21i-goals-history-ove-241-production.md`.
- **The iPhone app stays on staging.** No Production Expo update, TestFlight build, or Production-connected build was made; that's slice 21l.
- **Still deferred by decision (spec RD-6, RD-8):**
  - on the phone: the web's Weight trend view and RIR-projection overlay;
  - on the web Today: the goals block.
