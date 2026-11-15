# Pitch 21e — Workout Loop: Owner Runbook

**What changed outside the code:** nothing. There is no migration, no new environment variable, no Supabase, Vercel, Stripe, or EAS change, and no new native module. The app's native fingerprint is unchanged (`f98506f78a`), so the development build already on your iPhone (EAS `86e673d0`) receives 21e as a staging over-the-air update. No rebuild.

The six new endpoints are additive under `/api/mobile/v1` (`POST /workouts`, `GET /workouts/{id}`, `PUT /logged-exercises/{id}/sets/{n}`, `POST /workouts/{id}/complete`, `GET /history`, `GET /history/{id}`). They reach the staging URL only when the feature branch merges into `staging`.

**The gate (spec RD-20).** The feature PR stays open until you approve the design in Checkpoint A (simulator, local API). Then you authorize the merge into `staging`, and Checkpoints B and C run on the iPhone against staging. Fixes from B and C land in this slice.

## 1. Test data

Use a throwaway account, so the QA fixture's baseline stays intact:

```bash
cd apps/web
set -a; . ./.env.overload-dev; set +a
HOME="$(mktemp -d)" npx tsx scripts/operator/provision-dev-test-user/cli.ts \
  --confirm-ref vdxrmfadikwzodjljbdi --email 21e-check@example.com --username check21e --execute
# Seed demo history (anchored to today) for the printed user id:
npx tsx --require ./scripts/demo/server-only-shim.cjs scripts/demo/cli.ts \
  --user-id <uuid> --confirm-ref vdxrmfadikwzodjljbdi --execute --confirm-user <uuid>
```

The provision tool prints the password once. The QA fixture account (`npm run qa:verify`) also works for read checks; if you log on it, `npm run qa:reset` restores it.

The demo seed creates two blocks ("Strength Block 1" and "Strength Block 2", with Upper A, Lower A, Upper B, and Lower B) and two gyms (Northside Strength and Riverside Fitness), so Start shows the gym action sheet and History has an earlier block. For the Prescription-Aware states (B3–B5) you need one lift in two recurring workouts: on the web, add a lift Upper A already has to Upper B (or the reverse), then open Upper B's day on the phone. Its first time shows the reference line with an empty box; after you log it, the next Upper B offers its own weight.

## 2. Checkpoint A — iOS Simulator, against a local API (before the merge)

The new endpoints aren't on staging yet, so the simulator talks to a local web server on overload-dev. Only Metro development bundles honor the local origin.

```bash
# Terminal 1 — the web app on overload-dev (from the repo root)
cd apps/web
set -a; . ./.env.overload-dev; set +a
# .env and .env.local in this checkout hold other values (Stripe, flags);
# the process environment wins, so pin them off for the local run.
export STRIPE_BILLING_ENABLED=false PLAN_IMPORT_ENABLED=false \
  STRIPE_SECRET_KEY=placeholder STRIPE_WEBHOOK_SECRET=placeholder \
  STRIPE_PRICE_ID_MONTHLY=placeholder STRIPE_PRICE_ID_ANNUAL=placeholder \
  OVERLOAD_SIGNUP_MODE=closed TURNSTILE_DISABLED=true
npm run build && npx next start -p 3200

# Terminal 2 — the app (from the repo root)
echo 'EXPO_PUBLIC_LOCAL_API_ORIGIN=http://localhost:3200' >> apps/mobile/.env.local
npm run start -w @overload/mobile     # then open Overload Dev in the simulator → http://localhost:8081
```

Remove the `EXPO_PUBLIC_LOCAL_API_ORIGIN` line after Checkpoint A. More → Diagnostics shows the API host, so you can confirm which one you're on.

| # | Check | Expected |
| --- | --- | --- |
| A1 | Today | The greeting, the account's date, today's workout card (name, "Week N · M exercises", each exercise's sets × reps), **Start workout** |
| A2 | Start | With one gym it opens the workout. With two or more, an action sheet "Where are you training?" asks first. With none: "Add the gym you train at on the web first." |
| A3 | Card | The exercise, "3 × 8–10", the "Last time in Push · …" line, all planned sets, the active row with a weight box (decimal pad) and reps box (number pad), the bar above the keypad (Next / Log set), **Log set 1** |
| A4 | Log a set | Type reps, tap Log set: "Saving…", then the row shows "Set 1 · 255 lbs × 5 ✓", a light tap, and focus moves to set 2's reps with the weight offered ("same as set 1") |
| A5 | Failure | Stop the local server (Ctrl-C in terminal 1), log a set: "Couldn't save — Overload needs a connection. Your numbers are still here." and nothing turns logged. Start the server again and tap Log set: it saves once |
| A6 | Move | Next: <name> and Previous step through exercises; nothing auto-advances |
| A7 | Finish | With something unfinished: an alert lists it. Finish workout → the summary ("Push complete", "N exercises · M sets", each exercise's sets) → **Done** → Today shows "Push · Done" |
| A8 | History | The week with Done / Upcoming rows, ‹ to earlier weeks, **This week**, **Earlier blocks**; a workout opens read-only with every set and **Edit on the web** |
| A9 | Appearance | Repeat A1, A3, and A8 in Dark (More → Appearance) |

**Approve** by replying in the feature PR with A1–A9 pass/fail and "merge approved". The run (or you) then squash-merges the feature PR into `staging`.

## 3. After the merge — Checkpoint B (iPhone) and C (staging update)

Publish the update from the repository root on a clean, pushed `staging`:

```bash
git checkout staging && git pull
npm run mobile:update:staging -- --message "21e Workout Loop"
```

It prints `Runtime f98506f78a: 1 staging development build(s) can receive this update`, the update group, and the commit. On the iPhone: open **Overload Dev** → **Enter URL manually** → `https://u.expo.dev/3b322e4a-1bf6-422e-9feb-3aa859dffb46?channel-name=staging` (21d runbook §5).

| # | Check | Expected |
| --- | --- | --- |
| C1 | Receive | More → Diagnostics: this publish's update group and commit, runtime `f98506f78a`, API host the staging URL |
| B1 | Full workout | Start, log every planned set of today's workout one-handed, finish, see the summary |
| B2 | Force-close | Mid-workout, swipe the app away, reopen: Today shows **Resume workout** and "N of M exercises logged"; Resume opens the first unfinished exercise with every saved set |
| B3 | Trusted weight | An exercise this recurring workout has done before: the box shows its weight and "last time"; the line reads "Last time in <this workout> · …" |
| B4 | Reference only | The same lift in a second workout for the first time: the box is **empty**; "Nothing logged in <workout> at 6–8 reps yet." and a quieter "For reference: Push · …" line |
| B5 | Empty | A lift never logged: empty box, "First time logging this." |
| B6 | Airplane Mode | Log a set in Airplane Mode: the failure message, numbers kept, nothing logged. Airplane Mode off, Log set: saved once |
| B7 | Web agrees | On the staging web app, the same account: History shows the workout complete with the same sets; Today shows it done |
| B8 | History all-time | ‹ back to the first week; Earlier blocks reaches an older block; its workouts open with their sets |
| B9 | Feel | Keypads, the bar above them, nothing hidden under the keyboard or home indicator, light and dark, VoiceOver reads "Set 2 weight in pounds", "Set 1, 255 pounds, 5 reps, logged" |

Record the results in §5.

## 4. What stays yours

- Checkpoint A and the merge approval (§2), then B and C on the iPhone (§3).
- Removing the local-API line from `apps/mobile/.env.local` after Checkpoint A.
- Production: nothing in this slice. The 21e endpoints reach Production only through the promotion workflow, and the app stays staging-only until 21l.

## 5. Verification record

| Checkpoint | Result | Who, when |
| --- | --- | --- |
| Automated (run) | See the feature PR: web unit + integration (incl. the isolation suite and `mobile-workout-loop.int.test.ts`), mobile jest, lint, typecheck, format, build, iOS bundle, fingerprint | Run, 2026-11-15 |
| A — Simulator, local API | Not yet run | |
| B — iPhone | Not yet run (needs the merge) | |
| C — Staging update | Not yet run (needs the merge) | |
