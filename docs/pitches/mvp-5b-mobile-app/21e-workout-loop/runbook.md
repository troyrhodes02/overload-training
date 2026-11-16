# Pitch 21e — Workout Loop: Owner Runbook

**What changed outside the code:** nothing. There is no migration, no new environment variable, no Supabase, Vercel, Stripe, or EAS change, and no new native module. The app's native fingerprint is unchanged (`f98506f78a`), so the development build already on your iPhone (EAS `86e673d0`) receives 21e as a staging over-the-air update. No rebuild.

The seven new endpoints are additive under `/api/mobile/v1`:

- `POST /workouts`, `GET /workouts/{id}`, `PUT /logged-exercises/{id}/sets/{n}`, and `POST /workouts/{id}/complete`;
- `GET /history` and `GET /history/{id}`;
- since Checkpoint A, `PUT /mesocycles/{id}/missed-days/{date}`.

Since round 2's findings, `GET /today`, `GET /workouts/{id}`, and `GET /history/{id}` also accept an optional `?fields=core` (spec RD-28). The app sends it so the server skips progression calls, summaries, and goals the app doesn't show yet. Without it, every answer is unchanged.

The one new shared color, `attention`, lives in `packages/shared/src/design/status-colors.ts`, not `tokens.ts` (which would change the fingerprint). On the web it is a CSS variable no screen uses yet. They reach the staging URL only when the feature branch merges into `staging`.

**The gate (spec RD-20).** The feature PR stays open until you approve the design in Checkpoint A (simulator, local API). Then you authorize the merge into `staging`, and Checkpoints B and C run on the iPhone against staging. Fixes from B and C land in this slice.

## 1. Test data

Always use fresh disposable accounts seeded with the demo story, never the QA fixture or your own account. §2.4 has a helper that makes one in a single command.

- **Today as the anchor:** Upper A is pending today.
- **Yesterday as the anchor:** Upper A was missed yesterday, and Lower A is today.

The demo seed creates two blocks ("Strength Block 1" and "Strength Block 2", with Upper A, Lower A, Upper B, and Lower B) and two gyms (Northside Strength and Riverside Fitness). That makes Start show the gym action sheet, and gives History an earlier block. The demo's workouts share no lift, so the reference-only state needs one lift in two workouts. On the web, add Barbell Bench Press (3 × 10–12) to Lower A (§2.5 B4).

## 2. Checkpoint A — iOS Simulator, against a local API (before the merge)

Round 2 covered the refinements you approved at round 1: native missed-day resolution (spec RD-23), the shared tab header and card surface (RD-24), the attention color (RD-25), and the refined Today, History, logging, Plan, and Goals (RD-26, design §15a). **Round 3** retests your round 2 findings: a finished workout offered Resume (fixed, RD-27, OVE-210), and the workout screens were slow (RD-28, OVE-211; §2.6 says what speed to expect). Nothing here touches Production, and none of it needs a migration or an environment change.

**Round 3 needs a fresh server build.** The fixes are in both the web server and the app: rebuild in terminal 1 (§2.2, `npm run build` included) and restart Metro with `--clear` (§2.3). An old server still works with the new app, just without the speed-up.

**Why a local API.** The 21e endpoints aren't on staging until this feature merges. A simulator talking to staging gets `404 not_found` for every workout, History, and missed-day request. Since OVE-203 the app says "History isn't available from this server" instead of an empty list, with the request and code underneath in development builds.

### 2.1 Run the right code

```bash
git checkout feature/21e-workout-loop && git pull
git log --oneline -1   # the newest OVE-20x commit on the feature branch
```

The web server and Metro both serve this checkout.

### 2.2 Terminal 1: the web app on overload-dev

```bash
cd apps/web
set -a; . ./.env.overload-dev; set +a
# .env and .env.local hold other values (Stripe, flags); the process
# environment wins, so pin them off for the local run.
export STRIPE_BILLING_ENABLED=false PLAN_IMPORT_ENABLED=false \
  STRIPE_SECRET_KEY=placeholder STRIPE_WEBHOOK_SECRET=placeholder \
  STRIPE_PRICE_ID_MONTHLY=placeholder STRIPE_PRICE_ID_ANNUAL=placeholder \
  OVERLOAD_SIGNUP_MODE=closed TURNSTILE_DISABLED=true
npm run build && npx next start -p 3200
```

Check it from another terminal. Both requests must answer `{"error":{"code":"unauthorized",…}}`, which means the routes exist. A 404 means old code.

```bash
curl -s localhost:3200/api/mobile/v1/history -H 'x-overload-app-version: 0.1.0'
curl -s -X PUT localhost:3200/api/mobile/v1/mesocycles/x/missed-days/2026-01-01 -H 'x-overload-app-version: 0.1.0'
```

### 2.3 Terminal 2: the app

Stop any running `expo run:ios` or Metro first (Ctrl-C), because `EXPO_PUBLIC_*` values are read when Metro starts.

```bash
grep -q EXPO_PUBLIC_LOCAL_API_ORIGIN apps/mobile/.env.local || \
  echo 'EXPO_PUBLIC_LOCAL_API_ORIGIN=http://localhost:3200' >> apps/mobile/.env.local
cd apps/mobile && npx expo start --dev-client --clear
```

1. In the simulator, open **Overload Dev** and connect to `http://localhost:8081`.
2. **Confirm the API:** More → Diagnostics → **API** must read `localhost:3200`. If it shows the `overload-training-git-staging-…` host, stop Metro and start it again with `--clear`.
3. **Hide the development tools button** (the floating gear). It is Expo's development-build tool, not app UI. Shake (Device → Shake) and turn off "Show tools button".

### 2.4 Fresh disposable accounts

Never use the QA fixture or your own account, and never reuse an account from an earlier round: a missed-day resolution can't be undone. Make four new accounts. Change the `rN` suffix each round (r3 here).

| Account | Seeded with | Today shows | Used for |
| --- | --- | --- | --- |
| `21e-ca-r3-p@example.com` | today as the anchor | Upper A, **Ready** | The loop and trusted weights |
| `21e-ca-r3-late@example.com` | yesterday as the anchor | Upper A missed yesterday, Lower A waiting | Log it late, then reference-only weights |
| `21e-ca-r3-shift@example.com` | yesterday as the anchor | the same | Shift the week |
| `21e-ca-r3-skip@example.com` | yesterday as the anchor | the same | Skip it |

The demo story puts Upper A on day 1 of Block 2, week 4, and Lower A on day 2. Anchoring a seed to yesterday therefore leaves yesterday's Upper A unlogged, which is a real missed day, and Lower A is today.

```bash
cd apps/web
set -a; . ./.env.overload-dev; set +a
YESTERDAY=$(TZ=America/Chicago date -v-1d +%F)   # the demo account's time zone

# One account: provision (password saved to a temporary HOME, never printed),
# find its user id by signing in (prints only the id), then seed.
seed_account() {  # seed_account <email> <username> [anchor]
  local H; H="$(mktemp -d)"
  HOME="$H" npx tsx scripts/operator/provision-dev-test-user/cli.ts \
    --confirm-ref vdxrmfadikwzodjljbdi --email "$1" --username "$2" --execute >/dev/null || return 1
  local ID; ID=$(node -e '
    const [url, key, f] = process.argv.slice(1);
    const t = require("fs").readFileSync(f, "utf8");
    const email = /^EMAIL=(.*)$/m.exec(t)[1], password = /^PASSWORD=(.*)$/m.exec(t)[1];
    fetch(url + "/auth/v1/token?grant_type=password", { method: "POST",
      headers: { apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ email, password }) })
      .then((r) => r.json()).then((j) => console.log(j.user.id));
  ' "$NEXT_PUBLIC_SUPABASE_URL" "$NEXT_PUBLIC_SUPABASE_ANON_KEY" "$H/.overload-dev/test-user.txt")
  echo "$1 → $ID (password: $H/.overload-dev/test-user.txt)"
  local anchor=(); [ -n "$3" ] && anchor=(--anchor "$3")
  npx tsx --require ./scripts/demo/server-only-shim.cjs scripts/demo/cli.ts \
    --user-id "$ID" --confirm-ref vdxrmfadikwzodjljbdi "${anchor[@]}" \
    --execute --confirm-user "$ID" 2>&1 | grep -E "Seeded|Refus|rror"
}

seed_account 21e-ca-r3-p@example.com     car3p
seed_account 21e-ca-r3-late@example.com  car3late  "$YESTERDAY"
seed_account 21e-ca-r3-shift@example.com car3shift "$YESTERDAY"
seed_account 21e-ca-r3-skip@example.com  car3skip  "$YESTERDAY"
```

Each seed takes about two and a half minutes, so all four take about ten. A seed is one transaction of about 2,300 queries, each a round trip of about 50 ms to overload-dev's database in Montreal. That fits inside the transaction's three-minute limit since OVE-212; before that it needed about 3,000 queries and usually ran out. If a slow connection still stops it with "Transaction API error: … expired transaction", nothing was written. Run the same `npx tsx … scripts/demo/cli.ts` line again for that user id (shown on the line above it). Running it without `--execute` is a dry run: it shows EMPTY or SEEDED with the row counts and writes nothing. Sign in with the email and the password from its file. To switch accounts in the app: More → Sign out, then sign in.

### 2.5 The walkthrough

**A. Today and the loop** (account `p`)

Dates below are examples: yours are the day you run this, and "missed on" is yesterday's weekday.

1. Today shows the header (the date, **Today**, the greeting), then one card: "WEEK 4", the **Ready** chip, **Upper A**, "4 exercises", the four exercises, and **Start workout**.
2. Tap **Start workout**. The action sheet "Where are you training?" lists the two demo gyms. Pick one, and the workout opens on Barbell Bench Press.
3. The progress bars show four segments with "Exercise 1 of 4 · Sunday, November 15 · <gym>". The weight box already holds the **trusted** weight, with "last time" under it.
4. Type reps and tap **Log set 1**. The row turns tinted with a check, set 2 is highlighted, and its weight reads "same as set 1".
5. **Failed save:** press Ctrl-C in terminal 1, type reps, and tap Log set. You should see "Couldn't save — Overload needs a connection. Your numbers are still here.", and nothing turns saved. Start the server again (`npx next start -p 3200`, no rebuild) and tap Log set. It saves once.
6. **Close and resume:** run `xcrun simctl terminate booted app.overloadtraining.dev`, then open Overload Dev again. Today shows **In progress** and "n of 4 exercises logged". **Resume workout** opens the first unfinished exercise with every saved set.
7. **Finish:** go Next to the last exercise and tap **Finish workout**. The alert lists what's unfinished. Tap Finish workout to reach the summary, then **Done**. Today shows Upper A with the **Done** chip and **View workout** at once, with no Resume at any point.
   - **View workout** opens the read-only record with every set and no **Resume workout** button. Wait a few seconds: it stays that way.
   - Back on Today, switch straight to History: Upper A already reads **Done**, never In progress.
   - Background the app (Home: Cmd-Shift-H), open it again: still **Done**.
   - On a second account, repeat with **View in History** on the summary instead of Done: the same read-only record, no Resume.
8. **History:** the header ("EVERY WORKOUT YOU'VE LOGGED", **History**), then the week card. Upper A has the **Done** chip and opens read-only with every set.
   - ‹ reaches earlier weeks, and **This week** comes back.
   - **Earlier blocks** lists Strength Block 1, and its first week opens.

**B. Log it late, then reference-only** (account `late`)

1. Today shows an amber-outlined card: "Upper A was missed on Saturday", then "Choose what happens to it. Today's workout opens after.", then three rows: **Log it late**, **Shift the week**, and **Skip it**. Below it, Lower A is dimmed with a **Waiting** chip and can't be tapped.
2. Tap **Log it late**, then pick a gym. The workout opens on Upper A, and the progress line reads "… Saturday, November 14 · a past day · <gym>". The weights are trusted.
3. Log a set and finish. Today now shows **Lower A**, **Ready**. History has Upper A on Saturday as **Done**.
4. **Reference-only:** on the web (`http://localhost:3200`, signed in as this account), go to Plan → Strength Block 2 → Lower A → **Add exercise** → Barbell Bench Press, 3 sets × 10–12. Back in the app, pull to refresh Today and start Lower A.
5. On the bench card, the weight box is **empty**. The line reads "Nothing logged in Lower A at 10–12 reps yet.", and a separate panel reads "For reference: Upper A · 6–8 reps · …". Squat and RDL still offer trusted weights.

**C. Shift the week** (account `shift`)

1. Tap **Shift the week**. An alert asks "Shift the rest of this week?" and explains that remaining days move forward one day, next week is unchanged, and this can't be undone.
2. Tap **Cancel**. Nothing changes.
3. Tap **Shift the week** again and confirm. A note says "This week shifted forward a day.", and Today shows **Upper A**, **Ready**.
4. History, this week: Upper A is today (**Shifted**), Lower A is tomorrow, and Upper B and Lower B each moved a day. › to next week shows its normal days.

**D. Skip it** (account `skip`)

1. Tap **Skip it**. An alert asks "Skip Upper A?". Confirm with **Skip it**.
2. A note says "Skipped Upper A. Past weeks stay as planned.", and Today shows **Lower A**, **Ready**.
3. Pull to refresh. The missed card does not come back.
4. History shows Upper A on Saturday as **Skipped**.

**E. Plan, Goals, More**

Each tab has the same header. Plan and Goals each show one card: what the web does, then **Open Plan on the web** or **Open Goals on the web**, then one line of reassurance.

**F. Both appearances**

Switch with More → Appearance → Dark (or Light), then repeat A1, A3–A4, B1, B5, the History week, and Plan. Check that cards separate from the background, the amber outline is readable, and nothing is clipped.

Remove the `EXPO_PUBLIC_LOCAL_API_ORIGIN` line from `apps/mobile/.env.local` after Checkpoint A.

| # | Check | Expected |
| --- | --- | --- |
| A1 | Tab headers | Every tab shows its context line and title. No empty band, and no doubled header |
| A2 | Today | One workout card: week, chip, name, size, exercises, one primary action. Cardio sits under "Also today" |
| A3 | Start | One gym opens directly. Two gyms ask with an action sheet. No gym says "Add the gym you train at on the web first." |
| A4 | Card, trusted | Progress line, prescription, the "Last time in …" line, the trusted weight prefilled with its caption, the active row highlighted |
| A5 | Card, reference-only | Weight box empty, the "Nothing logged in …" line, and a separate "For reference" panel (B5) |
| A6 | Log a set | "Saving…", then a tinted row with a check, a light tap, and focus moves to the next set |
| A7 | Failed save | The message keeps your numbers, nothing turns saved, and a retry saves once |
| A8 | Resume | After a force-close, Today says In progress and Resume restores every saved set |
| A9 | Finish | The alert lists unfinished exercises. Then the summary, then Today shows Done and View workout at once. View workout, View in History, the History tab, and a return from the background all show the workout done and read-only. Resume never appears for it (RD-27) |
| A10 | Log it late | Starts Saturday's workout ("a past day"). Afterward Today shows Lower A |
| A11 | Shift | The confirmation can be cancelled. Confirming moves the rest of the week one day and leaves next week unchanged |
| A12 | Skip | The confirmation appears. Afterward the card doesn't return, and History shows Skipped |
| A13 | History | Week card, date column, chips, ‹ and ›, This week, Earlier blocks. A workout opens with every set |
| A14 | Light and dark | F passes in both |

### 2.6 What speed to expect, and what isn't measured

The round 2 slowness had two sources, measured from this Mac against overload-dev (spec RD-28):

- **The server did work the app doesn't show.** Today, opening a workout, and the workout record computed progression calls, summaries, and goals the 21e app doesn't display. With `?fields=core` they're skipped. Whole request, before → after: Today 2.2 s → 0.53 s, opening an in-progress workout 2.3 s → 0.52 s, the workout record 1.5 s → 0.36 s. Server time alone:
  - Today with the day done: 1.6 s → 0.32 s.
  - Opening an in-progress workout: 2.5 s → 0.32 s.
  - The workout record (the summary and History's detail): 1.2 s → 0.16 s.
- **This setup is slow by construction.** Each database query travels from your Mac to overload-dev's database in Montreal and back, about 50 ms, and the server makes several in a row. Every request also pays about 0.27 s to check the sign-in, the account, and the rate limit. On Vercel, next to the database, the same work takes a fraction of that.

**Still slow by design:**

- Saving a set takes about 0.6 s of server time here. The set and its gym baseline are written in one transaction (10 queries), and that guarantee stays. The card says "Saving…" until the server confirms.
- Finishing takes about 0.5 s.

**Not measured:** how the simulator itself renders. The simulator runs a development bundle (React in development mode, Expo's dev tools, an unoptimized JavaScript bundle), which makes taps, Next and Previous, and screen changes slower than a release build. Moving between exercises sends no request at all. To check rendering in the simulator, open the dev menu (Ctrl-Cmd-Z) → **Toggle performance monitor** and watch the JS frame rate while tapping Next. Checkpoint B on the iPhone runs the same development build, so judge final speed on staging after the merge, and on TestFlight later.

**Approve** by replying in the feature PR with A1–A14 pass or fail and "merge approved". The run (or you) then squash-merges the feature PR into `staging`.

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
| Automated, round 1 | Web unit and integration (including the isolation suite and `mobile-workout-loop.int.test.ts`), mobile Jest, lint, typecheck, format, build, iOS bundle, fingerprint | Run, 2026-11-15 |
| Automated, round 2 | Web unit 2,677 and integration 102 suites / 1,170 tests (including `mobile-missed-day.int.test.ts` and the new isolation cases); mobile Jest 212; lint, typecheck, format, `next build`, `expo export --platform ios`; fingerprint `f98506f78a` | Run, 2026-11-15 |
| Round 2 data path, local API on overload-dev (no simulator) | The §2.4 helper provisions and seeds as written. Seeding with yesterday as the anchor gives `missed_day` (Upper A, yesterday) with Lower A waiting. **Shift:** 200, a repeat returns the same resolution, a different outcome is 409, Upper A moves to today and the rest of the week moves one day. **Skip:** 200, Today shows Lower A twice in a row, History says skipped. **Log late:** Saturday's workout with trusted weights, a repeated set is one set, finish leaves Today on Lower A. **Reference-only:** bench added to Lower A gives `reference_only` with no suggested weight and a reference to Upper A 6–8, while squat and RDL stay trusted. **Cross-account:** another account's resolve is 404 | Run, 2026-11-15 (throwaway accounts `21e-missed-v1…v3`, `21e-ca-verify*`) |
| Automated, round 3 | RD-27 (OVE-210) and RD-28 (OVE-211). Web unit 2,677; integration 102 suites / 1,173 tests (including the `?fields=core` cases); mobile Jest 228; lint, typecheck, format, `next build`, `expo export --platform ios`; fingerprint `f98506f78a`. An independent review found one more stale-Resume path (a failed status read), fixed with its own test. `completion-sync.test.tsx` runs the real screens on the real router with the app's query defaults against a slow fake server, and reproduced the owner's finding before the fix | Run, 2026-11-16 |
| Round 3 timing, local server on overload-dev | Each database round trip about 50 ms; the sign-in check about 0.27 s per request. Server time full → core: Today (day done) 1.6 s → 0.32 s, Today (in progress) 0.8 s → 0.32 s, opening an in-progress workout 2.5 s → 0.32 s, the workout record 1.2 s → 0.16 s. A set save is about 0.6 s (one transaction, unchanged). End to end through the new build (median of 5): Today (day done) 2.2 s → 0.53 s, Today (pending) 1.15 s → 0.51 s, opening an in-progress workout 2.3 s → 0.52 s, the workout record 1.5 s → 0.36 s | Run, 2026-11-16 (throwaway accounts `21e-perf-1`, `21e-perf-2`) |
| Demo seed on overload-dev (OVE-212) | It had been timing out at 180 s: 2,994 sequential statements × about 51 ms per round trip. Now 2,298 statements. Seeded `21e-ca-r2-p@example.com` (empty, anchor 2026-11-16) in 153 s end to end. The dry run reads SEEDED with exact fixture counts (2 gyms, 2 blocks, 8 sessions, 22 planned exercises, 32 workouts all complete, 88 logged exercises, 264 sets), and there are 7 gym baselines, all machine or cable | Run, 2026-11-16 |
| A — Simulator, local API | Round 1: History failed against staging (fixed, OVE-203); titles were missing (fixed, OVE-205). Round 2: the loop worked end to end; a finished workout offered Resume (fixed, OVE-210), and the workout screens were slow (OVE-211, §2.6). **Round 3: passed.** Every §2.5 check passed (A1–A14, B–F): the loop, the summary, Today and History in step at once after Finish with no Resume (the round 2 bug is resolved), faster screens, and Log it late, Shift the week, and Skip it. Merge approved into staging only | Owner, 2026-11-16 |
| B — iPhone | Not yet run (needs the merge) | |
| C — Staging update | Not yet run (needs the merge) | |
