# Pitch 21g — Insights in the Workout: Owner Runbook

**What changed outside the code:** nothing. There is no migration, no new environment variable, and no Supabase, Vercel, Stripe, or EAS change. There is also no new native module. The app's native fingerprint is unchanged (`f98506f78a`), so the development build already on your iPhone receives 21g as a staging over-the-air update. No rebuild is needed.

**The API change is one additive field.** `OccurrenceProgressionDto.insufficientNote` is the server's "Not enough history yet…" sentence. There is no new endpoint. The phone now reads the existing gated `GET /workouts/{id}` and `GET /history/{id}` without `?fields=core`, in a query separate from logging. 21e and 21f builds still send `?fields=core` and are unaffected.

**The development tooling has two additions:**
- Fourteen new `npm run dev:test-account` profiles. Each is checked through the real engine.
- `--access free|pro`, which switches a disposable dev account between Pro and Free (§3).

**The gate.** This slice merges into `staging` on a green suite. You accept it on the physical iPhone afterwards (§4). Nothing here reaches Production; that is a separate promotion you authorize.

Every command below runs from a new Terminal window. Nothing assumes a shell function or an earlier session.

## 1. Start from zero

### A. The checkout

```bash
cd ~/Dev/overload-training
git checkout staging
git pull --ff-only origin staging
git status --short --branch     # "## staging...origin/staging" and nothing under it
git log --oneline -1            # the 21g merge commit (§9 records it)
```

### B. Local web server (optional)

You don't need this for the iPhone. After the merge, the staging deployment serves 21g, and both the iPhone and the simulator talk to staging. Start a local server only to debug against `overload-dev` with code that isn't on staging yet.

**Terminal 1:**

```bash
cd ~/Dev/overload-training/apps/web
set -a; . ./.env.overload-dev; set +a
# .env and .env.local hold other values (Stripe, flags). The process
# environment wins, so pin them off for the local run.
export STRIPE_BILLING_ENABLED=false PLAN_IMPORT_ENABLED=false \
  STRIPE_SECRET_KEY=placeholder STRIPE_WEBHOOK_SECRET=placeholder \
  STRIPE_PRICE_ID_MONTHLY=placeholder STRIPE_PRICE_ID_ANNUAL=placeholder \
  OVERLOAD_SIGNUP_MODE=closed TURNSTILE_DISABLED=true
npm run build && npx next start -p 3200
```

The server is ready when it prints `✓ Ready`. Check it from another window:

```bash
curl -s localhost:3200/api/mobile/v1/workouts/x -H 'x-overload-app-version: 0.1.0'
```

It should answer `{"error":{"code":"unauthorized",…}}`. The server runs on **port 3200** and reads only `apps/web/.env.overload-dev`, which names the `overload-dev` project. Stop it with Ctrl-C.

### C. Metro and the Simulator (optional)

The iPhone is the acceptance device; the simulator is useful for a quick look. This Mac's Xcode has no Simulator window, so you drive it through the Claude desktop app's simulator view.

**Terminal 2:**

```bash
cd ~/Dev/overload-training/apps/mobile
grep -c EXPO_PUBLIC_LOCAL_API_ORIGIN .env.local   # must print 0: Metro then talks to staging
npx expo start --dev-client --clear
```

Metro is ready when it prints `Waiting on http://localhost:8081`. Then, in a third window:

```bash
xcrun simctl boot "iPhone 18 Pro" 2>/dev/null; xcrun simctl launch "iPhone 18 Pro" app.overloadtraining.dev
```

In **Overload Dev**, connect to `http://localhost:8081`, then open More → Diagnostics:
- **API** must show the `overload-training-git-staging-…vercel.app` host.
- **Supabase project** must show `vdxrmfadikwzodjljbdi`.

Neither can be Production: the app's environment list holds only `staging` (`packages/shared/src/mobile/environment.ts`).

To point the simulator at the local server from B instead:
1. Add `EXPO_PUBLIC_LOCAL_API_ORIGIN=http://localhost:3200` to `apps/mobile/.env.local`.
2. Restart Metro with `--clear`.
3. **Remove the line again afterwards.**

That variable is honored only by Metro development bundles; a staging update never carries it.

Stop Metro with Ctrl-C in Terminal 2.

### D. The iPhone on the staging update

Stop Metro (or don't use it): the phone loads the published update, not your Mac.

1. Open **Overload Dev**. If it reopens the last project, shake the phone → **Go home**.
2. Tap **Enter URL manually** and enter `https://u.expo.dev/3b322e4a-1bf6-422e-9feb-3aa859dffb46?channel-name=staging`. It opens the newest update on `staging` for this build's runtime.
3. More → **Diagnostics** must show the values recorded in §9:

| Row | Expected |
| --- | --- |
| Environment / API / Supabase project | `staging` / the `overload-training-git-staging-…vercel.app` host / `vdxrmfadikwzodjljbdi` |
| Running | `EAS update` |
| Update group | the 21g group in §9 |
| Commit | the 21g staging commit in §9 |
| Runtime | `f98506f78a` |

If Diagnostics shows an older group, force-close Overload Dev (swipe it away) and open the URL again.

### E. The staging web app

`https://overload-training-git-staging-wtrhodes02-gmailcoms-projects.vercel.app`

1. Sign in to Vercel in that browser first (the staging URL keeps Deployment Protection).
2. Sign in to Overload with the same test account's email and password.

This is never the Production site: Production is `www.overloadtraining.app`. The web shows the same calls on Today's planned list and on the workout card (`/log/…`).

## 2. What each test account is

Each account is disposable and lives only in `overload-dev`. It's seeded with the demo story through the application's own write paths: a fictional lifter, two blocks, and about 32 finished workouts. So its history, RIR, and calls are real: **no call is stored or faked**.

A **profile** changes only facts (the sets lifted, their RIR, or the block's deload cadence), so that today the unchanged engine reaches one call. Every promise below was checked through the gated card reader by `tests/integration/dev-test-account-profiles.int.test.ts` (19 tests, passing). The command also prints an **engine check** for the account it just made.

Today's workout is **Upper A** unless noted: Barbell Bench Press (shown in the app as **Barbell Bench Press - Medium Grip**; "Bench" below) 3 × 6–8, Standing Military Press 3 × 6–8, Incline Dumbbell Press 3 × 8–12, and Wide-Grip Lat Pulldown 3 × 10–12 (a cable: its call is per gym). The default gym is Northside Strength.

| Email | Profile | Plan | Verified starting state (today's card) |
| --- | --- | --- | --- |
| `21g-progress@example.com` | `progress` | Pro | Bench **Progress**: "Try 185 lb today (+5 lb)". Military Press **Deload**: "Lower the weight today". Incline **Hold**: "Stay at 60 lb today" |
| `21g-hold@example.com` | `hold` | Pro | Bench **Hold**: "Stay at 180 lb today", why: "Last time: 8, 7, 7 of 6–8" |
| `21g-reactive-deload@example.com` | `reactive-deload` | Pro | Bench **Deload**: "Lower the weight today", why: "A set below 6 reps, 2 sessions running" |
| `21g-rir@example.com` | `rir` | Pro | Bench **Hold**, held at the limit: "Stay at 180 lb today", why: "…at your limit last time (0 RIR)". Military Press **Progress**, stall released: "Try 115 lb today (+5 lb)", why: "e1RM flat, but every set last time had 2+ in reserve". Incline **Hold — trend flat** (one set's RIR not recorded, so no release) |
| `21g-scheduled-deload@example.com` | `scheduled-deload` | Pro | Banner "Deload week · 90% load across the split". Bench "Deload week: 160 lb (90%)". Military Press "Deload week: 100 lb (90%)" (its history is a reactive deload: suppressed) |
| `21g-post-deload@example.com` | `post-deload` | Pro | No banner (last week was the deload). Bench **Progress**: "Try 180 lb today (+5 lb)" |
| `21g-insufficient@example.com` | `insufficient` | Pro | Each free-weight lift: "Not enough history yet: 1 of 2 complete sessions." The cable: "…at Northside Strength: 1 of 2…". The earlier block shows only as reference (empty weight box) |
| `21g-gym@example.com` | `gym` | Pro | **Upper B.** Leverage Chest Press at Northside: a call with "…at Northside Strength". At Riverside Fitness: "Not enough history yet at Riverside Fitness: 1 of 2…". At Harbor Barbell: "…0 of 2…" |
| `21g-edit@example.com` | `edit` | Pro | Bench **Hold**: "Stay at 180 lb today" (last time 180 × 8, 8, 7 at RIR 1, 1, 0) |
| `21g-free@example.com` | `free` | **Free** | The standard story. Every lift with history shows the Pro note, with no call and no link |
| `21g-entitlement@example.com` | `entitlement` | Pro, switchable | As `progress`; then `--access free` / `--access pro` (§3) |
| `21g-summary@example.com` | `summary` | Pro | As `progress`: finish it with a swap and a skip |
| `21g-recovery@example.com` | `recovery` | Pro | Today's Upper A **already started**: Bench sets 1–2 saved (180 × 8, 8). Call Progress |
| `21g-isolation-a@example.com` | `isolation-a` | Pro | The standard story |
| `21g-isolation-b@example.com` | `isolation-b` | Pro | Different data: the bodyweight story (Pullups, Crunches) |

**Dates.** A story is anchored to the account's own today (America/Chicago) when you run the command, so create accounts on the day you test. After midnight Chicago time, an unused "today" becomes a missed day; that's correct behavior.

## 3. Create fresh test accounts

Each account takes about two and a half minutes (one transaction to `overload-dev`). The whole set of fifteen takes about forty minutes, so start them before you pick up the phone, or create only the ones for the checks you're about to run.

**Terminal (any):**

```bash
cd ~/Dev/overload-training
set -a; . apps/web/.env.overload-dev; set +a
# Prints only the project ref. It must read vdxrmfadikwzodjljbdi (overload-dev).
node -e 'console.log("Supabase project:", new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0])'
```

One account at a time:

```bash
npm run dev:test-account -- --email 21g-progress@example.com         --profile progress         --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21g-hold@example.com             --profile hold             --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21g-reactive-deload@example.com  --profile reactive-deload  --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21g-rir@example.com              --profile rir              --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21g-scheduled-deload@example.com --profile scheduled-deload --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21g-post-deload@example.com      --profile post-deload      --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21g-insufficient@example.com     --profile insufficient     --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21g-gym@example.com              --profile gym              --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21g-edit@example.com             --profile edit             --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21g-free@example.com             --profile free             --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21g-entitlement@example.com      --profile entitlement      --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21g-summary@example.com          --profile summary          --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21g-recovery@example.com         --profile recovery         --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21g-isolation-a@example.com      --profile isolation-a      --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21g-isolation-b@example.com      --profile isolation-b      --confirm-ref vdxrmfadikwzodjljbdi --execute
```

Or all fifteen in one go (each email is the profile name):

```bash
for p in progress hold reactive-deload rir scheduled-deload post-deload insufficient gym \
         edit free entitlement summary recovery isolation-a isolation-b; do
  npm run dev:test-account --silent -- --email "21g-$p@example.com" --profile "$p" \
    --confirm-ref vdxrmfadikwzodjljbdi --execute
done
```

A successful run ends with the engine check. The user id and dates below will be yours:

```text
Overload dev test account — EXECUTE  target=hosted project vdxrmfadikwzodjljbdi (via …pooler.supabase.com) — confirmed
  email:    21g-hold@example.com
  profile:  hold (fixture: hold; Pro, comp)
  account:  would be created (email pre-confirmed, no email sent, comp Pro)
  user id:  <uuid> (created)
  anchor:   2026-11-19 (America/Chicago)

Seeded in one transaction: 2 gyms, 32 workouts, 264 sets, 0 planned cardio, 0 cardio logs.
Password file (owner-only, never printed): /Users/<you>/.overload-dev/accounts/21g-hold@example.com.txt
  plan:     Pro (progression insights on)

Engine check (the gated server reader, read-only):
  Today: Upper A, week 4, pending
    Barbell Bench Press - Medium Grip — hold: Stay at 180 lb today
    Standing Military Press — deload: Lower the weight today
    Incline Dumbbell Press — hold: Stay at 60 lb today
    Wide-Grip Lat Pulldown — machine/cable: its call is made per gym, on the workout card
ENGINE CHECK PASSED
```

**`ENGINE CHECK MISMATCH`** (exit code 2) means the engine disagreed with the profile's promise. The account and its data are real and were kept. Send me the lines, and use a new email for a fresh one.

Leave off `--execute` for a dry run. It shows what would be created, or an existing account's state (`EMPTY`, `SEEDED`, or `CONFLICT`) with row counts, and writes nothing.

**What the command refuses:**
- Any email not on a reserved test domain (`example.com` and the like).
- Any project but `overload-dev`. Production has no override.
- An account that already holds other training data.

It never edits, merges, resets, or deletes training data.

**If a seed stops** with "Transaction API error: … expired transaction", the connection was slow and nothing was written. Run the same line again: the account now exists and is empty, so it gets seeded.

### Switch an account between Pro and Free (development only)

```bash
npm run dev:test-account -- --email 21g-entitlement@example.com --access free --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21g-entitlement@example.com --access pro  --confirm-ref vdxrmfadikwzodjljbdi --execute
```

**`free`** ends the account's comp Pro by setting its `revokedAt`, the same column the admin center's revoke sets. Nothing is deleted. **`pro`** grants a new comp. Neither touches Stripe.

The command refuses an account with a trial or a billing record, because comp then wouldn't decide its plan. Every account this tool creates has neither. After switching, it prints the plan and the engine check: Free shows `locked (Pro note)` on each lift.

### Passwords

Each password is in its own owner-only file and was never printed. To put one on the clipboard without showing it (Universal Clipboard then pastes it on the iPhone):

```bash
sed -n 's/^PASSWORD=//p' ~/.overload-dev/accounts/21g-progress@example.com.txt | tr -d '\n' | pbcopy
```

To read it on screen instead: `cat ~/.overload-dev/accounts/21g-progress@example.com.txt`.

**Sign in** with the email and that password, both on the iPhone (More → Sign out first if needed) and on the staging web app. To change accounts in the app: More → Sign out, then sign in.

### Running a case again

A consumed account can't be rewound. Make another with a new email and the same profile; the username follows the email:

```bash
npm run dev:test-account -- --email 21g-edit-2@example.com --profile edit --confirm-ref vdxrmfadikwzodjljbdi --execute
```

### Cleanup

There is no delete command, by design. The repository's only deletion paths are an account deleting itself and the QA fixture reset for its one designated account. Disposable accounts are inert and can be left.

To remove one for good, sign in as it on the staging web app → Settings → Delete account, with its password. To remove the local password files: `rm ~/.overload-dev/accounts/21g-*.txt`.

## 4. iPhone acceptance checklist

Run these in order. **(H)** marks a high-risk check: a wrong result there would mislead a lifter or leak data. For every check, compare with the staging web app signed in as the same account: open **Today** (planned list) and **Start/Resume** the same workout (`/log/…` card). Mark each pass or fail yourself; nothing here is marked for you.

**"Consumes"** means that logging or finishing changes the account's state. To repeat a check, make a new account with the same profile (§3).

### Calls on the card

1. **Progress (H)** — `21g-progress`.
   - Start Upper A at Northside. Bench shows the **Progress** chip and "Try 185 lb today (+5 lb)".
   - Tap the call: "8 reps on every set, 2 sessions running" appears. Tap again: it hides.
   - Web: the same sentence. Doesn't consume.
2. **Suggested weight stays advice (H)** — same account.
   - The Set 1 weight box shows **180** with "last time", not 185.
   - Type 185, log a set: it saves 185. Plan and other cards unchanged.
   - Consumes Bench set 1.
3. **Hold** — `21g-hold`.
   - Bench: no chip; the muted line "Stay at 180 lb today". Its why: "Last time: 8, 7, 7 of 6–8".
   - With VoiceOver, the call reads "Hold: Stay at 180 lb today."
4. **Reactive Deload** — `21g-reactive-deload`.
   - Bench: **Deload** chip, "Lower the weight today", why "A set below 6 reps, 2 sessions running".
   - No weight number in the call.
5. **RIR-aware (H)** — `21g-rir`.
   - Bench: no chip, "Stay at 180 lb today", why "…at your limit last time (0 RIR)".
   - Next → Military Press: **Progress**, "Try 115 lb today (+5 lb)", why "e1RM flat, but every set last time had 2+ in reserve".
6. **Missing RIR is not 0 (H)** — same account.
   - Incline: chip **Hold — trend flat**, "Stay at 60 lb today". Its last workout had one set with no RIR, so no release happens.
   - In History, open that workout: its third Incline set shows no RIR, and the Bench third set shows "0 RIR".
7. **Scheduled-deload banner** — `21g-scheduled-deload`.
   - Today shows "Deload week · 90% load across the split" above the day card, and "Week 4 · Deload week".
   - Start: the same banner at the top of the workout. Bench: "Deload week: 160 lb (90%)"; tap: "Planned recovery, not a verdict. Calls resume next week."
8. **Reactive suppressed (H)** — same account.
   - Military Press (a reactive-deload history) shows "Deload week: 100 lb (90%)" and **no Deload chip**.
9. **After the deload** — `21g-post-deload`.
   - No banner on Today or the workout. Bench: **Progress**, "Try 180 lb today (+5 lb)".
10. **Not enough history (H)** — `21g-insufficient`.
    - Every free-weight lift: "Not enough history yet: 1 of 2 complete sessions." No chip and no number.
    - The weight box is empty, and the earlier block shows only "For reference: …".
    - Web Today: no calls on these lifts.
11. **Gym-specific (H)** — `21g-gym`. Today is Upper B.
    - Start at **Northside**: Leverage Chest Press shows a call whose why ends "at Northside Strength".
    - Before logging, tap **Change gym** → Riverside Fitness. The call briefly shows loading, then "Not enough history yet at Riverside Fitness: 1 of 2 complete sessions."
    - Change to Harbor Barbell: "…0 of 2…".
    - Northside's numbers never appear at the other gyms.
12. **Correction refreshes the call (H)** — `21g-edit`.
    - Bench: "Stay at 180 lb today".
    - History → the last Upper A → Bench Set 3 (180 lbs × 7 · 0 RIR) → set reps to 8 → Save.
    - Back on Today → Start Upper A. Bench now reads "Stay at 180 lb today", why "…at your limit last time (0 RIR)".
    - Correct that set's RIR to 1. Bench now reads **Progress**, "Try 185 lb today (+5 lb)".
    - The web agrees after each step, and History shows one set edited, never a new one.

### Free and access

13. **Free locked state (H)** — `21g-free`.
    - Each card with history shows "Progress, hold, and deload calls for this lift are part of Pro." with an ✕, and **no link, price, or button**.
    - Logging, RIR, swap, skip, and History all work.
    - Tap ✕: the note disappears on every card until the app restarts.
14. **Free API protection (H)** — same account, on the Mac:
    ```bash
    # Get a token by signing in through Supabase Auth (anon key only; never printed).
    cd ~/Dev/overload-training; set -a; . apps/web/.env.overload-dev; set +a
    PW=$(sed -n 's/^PASSWORD=//p' ~/.overload-dev/accounts/21g-free@example.com.txt)
    TOKEN=$(curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" -H 'content-type: application/json' \
      -d "{\"email\":\"21g-free@example.com\",\"password\":\"$PW\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).access_token'); unset PW
    vercel curl https://overload-training-git-staging-wtrhodes02-gmailcoms-projects.vercel.app/api/mobile/v1/today -- -s -H "authorization: Bearer $TOKEN" -H 'x-overload-app-version: 0.1.0' \
      | node -pe 'const t=JSON.parse(require("fs").readFileSync(0)); JSON.stringify(t.plannedProgression.map(p=>[p.progression.tag,p.progression.recommendation,p.progression.locked]))'
    ```
    Expect every entry as `[null,null,"progression_insights"]`: no tag and no sentence ever reach a Free account. The token is used only in this shell.
15. **Pro → Free (H)** — `21g-entitlement`.
    - Start Upper A: Bench shows Progress.
    - Leave the app open on the card. On the Mac, run `--access free` (§3). Send the app to the background and bring it back (or go back to Today and Resume).
    - The call is replaced by the Pro note, and no Pro sentence remains.
    - Run `--access pro` and bring the app back: the call returns.

### Summary

16. **Finish and the full summary (H)** — `21g-summary`.
    - Log Bench 3 × 8 at 180 with RIR 2 on set 1; add an extra set 4.
    - Military Press: More → **Didn't do this exercise**.
    - Incline: More → Swap → any chest lift; log 2 sets.
    - Finish (accept the unfinished alert).
    - The summary shows:
      - "Upper A complete", the date, Northside Strength, and the counts;
      - Bench sets "1  180 lbs × 8 · 2 RIR", "2  180 lbs × 8", "3  180 lbs × 8", "4  … · extra", with a **Progress** chip and "Try 185 lb next time (+5 lb)";
      - Military Press "Not done";
      - the substitute with "swapped from Incline Dumbbell Press" and "2 of 3 planned sets — …".
17. **Summary matches History** — same account.
    - View in History: every set and value is identical.
    - Back on Today: the done day shows **View summary**. Opening it again shows the same summary and doesn't finish anything again.
    - The web's day-complete block shows the same next-time calls.

### Failure and recovery

18. **Insight read fails, logging doesn't** — `21g-recovery`.
    - Resume while online: Bench shows its call.
    - Turn on Airplane Mode. Send the app to the background and bring it back.
    - The call is replaced by "Couldn't load the call for this lift." with **Retry**. It never keeps showing the old call as current. The sets stay on screen.
    - Turn Airplane Mode off: the call loads again by itself (or tap Retry). Nothing was marked saved while offline.
19. **Network loss during set logging** — same account.
    - Type Bench set 3 (180, 8). Turn on Airplane Mode, then Log set: the numbers stay and a save message shows.
    - Turn it off and Log set again: it saves once.
20. **Force-close and resume** — same account.
    - Force-close, reopen, Resume. Bench sets 1–3 are saved, and the call is shown again after loading.
21. **Keyboard and focus (H)** — any Pro account.
    - Tap the weight box, then tap the call while the keyboard is up: the evidence opens, and the keyboard and focus stay.
    - Done dismisses the keyboard without losing values. Log set on the keypad bar works.
    - Next/Previous: inputs take taps, and the call's open/closed choice is kept per exercise.
    - No text is clipped in focused fields.

### Parity, isolation, accessibility, regression

22. **Web/mobile parity (H)** — `21g-rir` and `21g-progress`.
    - Each card's sentence on the phone equals the web's Today planned list and the web workout card for the same account and gym.
23. **Isolation (H)** — `21g-isolation-a` and `21g-isolation-b`.
    - Sign in as A on the phone and B on the web. Neither ever shows the other's exercises, gyms, workouts, or calls.
    - Using a History link from A in B's session returns "not found".
24. **Light and dark** — any account.
    - In both appearances, the chips (green Progress, amber Deload / Hold — trend flat), the banner, the Pro note, and the summary are legible.
25. **Largest text** — Settings → Accessibility → Larger Text at max.
    - The call, the evidence, and the banner wrap without clipping, and Log set stays reachable.
26. **VoiceOver** — any Pro account.
    - The call reads "<Progress / Hold / Hold — trend flat / Reassess / Deload / Deload week>: <sentence>." with hint "Shows why", and the state "expanded" once opened.
    - The Pro note's ✕ reads "Dismiss: …".
27. **21f regression** — `21g-progress` (or a fresh `standard`).
    - Gym change before the first set; swap, skip, and undo; RIR; correct a saved set; fewer sets; bodyweight (`21g-isolation-b`); cardio; missed day (`--profile missed`); finish; History.
    - All behave as in 21f.
28. **No purchase path** — every account.
    - Nowhere in the app is there a checkout, price, subscribe, "Explore Pro", or external purchase link.

## 5. Known limitations

- Today's planned list on the phone shows no calls (spec RD-9). The calls are on the workout card and in the summary. The web's Today shows them.
- The Pro note's dismissal lasts until the app restarts. The phone has no preference store; adding one is 21j's.
- The History record (H2) shows no calls, as on the web.
- The summary has no chart (the one native chart is 21i's). It shows goal percentages when the workout moved a goal; the fixtures hold no goals.
- During an entitlement change, an open card updates on its next read: screen focus, app foreground, or a write that changes a call. Not instantly.

## 6. What stays yours

- Everything in §4 (the physical iPhone).
- Any Production promotion. 21g is not released.

## 7. Verification record

Recorded at the end of the run (§9).

## 8. Native runtime

No native dependency and no change to `tokens.ts`, `app.config.ts`, or `apps/mobile/package.json` scripts. The fingerprint is `f98506f78a`, the same as the installed development build.

## 9. Delivery record

_Filled in after the staging merge and the staging update._
