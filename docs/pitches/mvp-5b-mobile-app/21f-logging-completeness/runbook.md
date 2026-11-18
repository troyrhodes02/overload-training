# Pitch 21f — Logging Completeness: Owner Runbook

**What changed outside the code:** nothing. There is no migration, no new environment variable, no Supabase, Vercel, Stripe, or EAS change, and no new native module. The app's native fingerprint is unchanged (`f98506f78a`), so the development build already on your iPhone receives 21f as a staging over-the-air update. No rebuild.

Eight new endpoints are additive under `/api/mobile/v1` (spec §6):

- `PUT /workouts/{id}/gym`
- `GET /logged-exercises/{id}/swap-candidates`, `PUT /logged-exercises/{id}/exercise`
- `PUT /logged-exercises/{id}/skipped`
- `PATCH /sets/{id}`, `PATCH /logged-exercises/{id}/planned-sets`
- `PUT /mesocycles/{id}/cardio-logs/{date}`, `PATCH /cardio-logs/{id}`

One web module changed by one rule: marking an exercise not done twice keeps the first time it was marked (spec RD-3). No web screen changed.

One new repository command, for development only: `npm run dev:test-account` (§3).

**The gate.** This slice merges into `staging` on a green suite (spec RD-25). You accept it on the physical iPhone afterwards (§4). Nothing here reaches Production: that is a separate promotion you authorize.

Every command below is run from a new Terminal window. Nothing assumes a shell function or an earlier session.

## 1. Start from zero

### A. The checkout

```bash
cd ~/Dev/overload-training
git checkout staging
git pull --ff-only origin staging
git status --short --branch     # "## staging...origin/staging" and nothing under it
git log --oneline -1            # the 21f merge commit (§7 records it)
```

### B. Local web server (optional)

You don't need this to test 21f: after the merge, the staging deployment serves the new endpoints, and both the iPhone and the simulator talk to staging. Start a local server only to debug against `overload-dev` with code that isn't on staging yet.

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

It is ready when it prints `✓ Ready` and this, from another window, answers `{"error":{"code":"unauthorized",…}}` (a 404 means old code):

```bash
curl -s -X PATCH localhost:3200/api/mobile/v1/sets/x -H 'x-overload-app-version: 0.1.0' -H 'content-type: application/json' -d '{}'
```

The server runs on **port 3200** and reads only `apps/web/.env.overload-dev`, which names the `overload-dev` project. Stop it with Ctrl-C.

### C. Simulator (optional)

The iPhone is the acceptance device. The simulator is useful for a quick look. This Mac's Xcode has no Simulator window, so you drive it through the Claude desktop app's simulator view, as in the 21e checkpoints.

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

In **Overload Dev**, connect to `http://localhost:8081`. Check More → Diagnostics → **API**: it must show the `overload-training-git-staging-…vercel.app` host and **Supabase project** `vdxrmfadikwzodjljbdi`. Neither can be Production: the app's environment list holds only `staging` (`packages/shared/src/mobile/environment.ts`).

To point the simulator at the local server from B instead, add `EXPO_PUBLIC_LOCAL_API_ORIGIN=http://localhost:3200` to `apps/mobile/.env.local`, restart Metro with `--clear`, and **remove the line again afterwards**. It is honored only by Metro development bundles: a staging update never carries it.

Stop Metro with Ctrl-C in Terminal 2.

### D. The iPhone on the staging update

Metro should be **stopped** (or simply not used): the phone loads the published update, not your Mac.

1. Open **Overload Dev**. If it reopens the last project, shake the phone → **Go home**.
2. Tap **Enter URL manually** and enter `https://u.expo.dev/3b322e4a-1bf6-422e-9feb-3aa859dffb46?channel-name=staging`. It opens the newest update on `staging` for this build's runtime.
3. More → **Diagnostics** must show:

| Row | Expected |
| --- | --- |
| Environment / API / Supabase project | `staging` / the `overload-training-git-staging-…vercel.app` host / `vdxrmfadikwzodjljbdi` |
| Running | `EAS update` |
| Update group | the first 8 characters of the group in §7 |
| Commit | the first 7 characters of the commit in §7 |
| Runtime | `f98506f78a` |

If Diagnostics shows an older group, force-close Overload Dev and open the URL again.

### E. The staging web app

`https://overload-training-git-staging-wtrhodes02-gmailcoms-projects.vercel.app`

Sign in to Vercel in that browser first (the staging URL keeps Deployment Protection), then sign in to Overload with the same test account's email and password. This is never the Production site: Production is `www.overloadtraining.app`.

## 2. What each test account is

Each account is disposable, lives only in `overload-dev`, and is seeded with the demo story (fictional lifter, two blocks, 32 finished workouts, 264 sets) through the application's own write paths, so its history, baselines, and "last time" lines are real. A **profile** arranges the story so one scenario is ready today:

| Profile | Today shows | Built for |
| --- | --- | --- |
| `standard` | **Upper A**, Ready: Barbell Bench Press, Standing Military Press, Incline Dumbbell Press, Wide-Grip Lat Pulldown. Two gyms | Swap, skip, RIR, corrections, set counts, recovery, isolation |
| `gym` | **Upper B**, Ready: Leverage Chest Press and Seated Cable Rows (both trained at Northside and at Riverside, with different weights) and Side Lateral Raise (dumbbells). A third gym, Harbor Barbell, with no history | Gym selection and machine history |
| `bodyweight` | **Upper A**, Ready: Barbell Bench Press 3 × 6–8, **Pullups** 3 × 8–10 (bodyweight), Incline Dumbbell Press **3 × 10**, **Crunches** 3 × 15 (bodyweight, abs) | Bodyweight and fixed targets |
| `cardio` | **Upper A**, Ready, with **Incline Walk · 20 min** under "Also today". Earlier weeks hold logged cardio, one longer than planned, and one missed | Cardio |
| `missed` | **Upper A was missed yesterday**; Lower A waits | The three missed-day outcomes |

**Dates.** A story is anchored to the account's own today (America/Chicago) at the moment you run the command; `missed` is anchored to yesterday. So create accounts on the day you test. After midnight Chicago time an unused "today" workout becomes a missed day, which is correct behavior, not a fault.

## 3. Create fresh test accounts

Each account takes about two and a half minutes (one transaction of about 2,300 statements to `overload-dev`). Fourteen take about thirty-five minutes, so start them before you pick up the phone, or create only the ones for the checks you're about to run.

**Terminal (any):**

```bash
cd ~/Dev/overload-training
set -a; . apps/web/.env.overload-dev; set +a
# Prints only the project ref. It must read vdxrmfadikwzodjljbdi (overload-dev).
node -e 'console.log("Supabase project:", new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0])'
```

One account at a time:

```bash
npm run dev:test-account -- --email 21f-gym@example.com          --profile gym        --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21f-swap@example.com         --profile standard   --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21f-skip@example.com         --profile standard   --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21f-rir@example.com          --profile standard   --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21f-edit@example.com         --profile standard   --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21f-setcount@example.com     --profile standard   --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21f-bodyweight@example.com   --profile bodyweight --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21f-cardio@example.com       --profile cardio     --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21f-missed-late@example.com  --profile missed     --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21f-missed-shift@example.com --profile missed     --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21f-missed-skip@example.com  --profile missed     --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21f-recovery@example.com     --profile standard   --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21f-isolation-a@example.com  --profile standard   --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21f-isolation-b@example.com  --profile standard   --confirm-ref vdxrmfadikwzodjljbdi --execute
```

Or all fourteen in one go:

```bash
for pair in gym:gym swap:standard skip:standard rir:standard edit:standard setcount:standard \
            bodyweight:bodyweight cardio:cardio missed-late:missed missed-shift:missed missed-skip:missed \
            recovery:standard isolation-a:standard isolation-b:standard; do
  npm run dev:test-account --silent -- --email "21f-${pair%%:*}@example.com" --profile "${pair##*:}" \
    --confirm-ref vdxrmfadikwzodjljbdi --execute
done
```

A successful run ends like this (the id and date will be yours):

```text
Overload dev test account — EXECUTE  target=hosted project vdxrmfadikwzodjljbdi (via …pooler.supabase.com) — confirmed
  email:    21f-gym@example.com
  profile:  gym (fixture: gym)
  account:  would be created (email pre-confirmed, no email sent, comp Pro)
  user id:  <uuid> (created)
  anchor:   2026-11-17 (America/Chicago)

Seeded in one transaction: 3 gyms, 32 workouts, 264 sets, 0 planned cardio, 0 cardio logs.
Password file (owner-only, never printed): /Users/<you>/.overload-dev/accounts/21f-gym@example.com.txt
```

Leave off `--execute` for a dry run: it shows what would be created, or an existing account's state (`EMPTY`, `SEEDED`, or `CONFLICT`) with row counts, and writes nothing.

**What the command refuses.** Any email not on a reserved test domain (`example.com` and the like). Any project but `overload-dev`; Production has no override. An account that already holds other training data. It never edits, merges, resets, or deletes.

**If a seed stops** with "Transaction API error: … expired transaction", the connection was slow and nothing was written. Run the same line again: the account now exists and is empty, so it is seeded.

### Passwords

Each password is in its own owner-only file and was never printed. To put one on the clipboard without showing it (Universal Clipboard then pastes it on the iPhone):

```bash
sed -n 's/^PASSWORD=//p' ~/.overload-dev/accounts/21f-gym@example.com.txt | tr -d '\n' | pbcopy
```

To read it on screen instead: `cat ~/.overload-dev/accounts/21f-gym@example.com.txt`.

**Sign in** on the iPhone (More → Sign out first if needed) and on the staging web app with the email and that password. To change accounts in the app: More → Sign out, then sign in.

### Running a case again

A consumed account can't be rewound. Make another with a new email and the same profile; the username follows the email:

```bash
npm run dev:test-account -- --email 21f-gym-2@example.com --profile gym --confirm-ref vdxrmfadikwzodjljbdi --execute
```

### Cleanup

There is no delete command, by design: the repository's only deletion paths are an account deleting itself and the QA fixture reset for its one designated account. Disposable accounts are inert and can be left. To remove one for good, sign in as it on the staging web app → Settings → Delete account, with its password. To remove the local password files: `rm ~/.overload-dev/accounts/21f-*.txt`.

## 4. iPhone acceptance checklist

Run on the physical iPhone on the staging update (§1 D). "Web" means the staging web app (§1 E) signed in as the same account. Record pass or fail for each in §7. None of these has been run on a device by the pipeline.

**Highest risk, do these first:** 8 and 9 (corrections to logged sets), 1 to 3 (gym history and baselines), 4 and 5 (swap provenance), 20 (keyboard after navigation), 18 (retries).

| # | Check | Account | Uses up the account? |
| --- | --- | --- | --- |
| 1 | Gym selection and machine history per gym | `21f-gym` | Yes |
| 2 | Gym-consistent weight | `21f-gym` | (same run) |
| 3 | First-time machine at another gym | `21f-gym` | (same run) |
| 4 | Swap within the same muscle group | `21f-swap` | Yes |
| 5 | Swap with a different muscle-group filter | `21f-swap` | (same run) |
| 6 | Skip an exercise, undo, and finish | `21f-skip` | Yes |
| 7 | Optional RIR, and editing it | `21f-rir` | Yes |
| 8 | Correcting a saved set in today's workout | `21f-edit` | Yes |
| 9 | Correcting a set in a finished workout | `21f-edit` | No (repeatable) |
| 10 | More than planned: Add set | `21f-setcount` | Yes |
| 11 | Fewer than planned, with nothing lost | `21f-setcount` | (same run) |
| 12 | Bodyweight lift | `21f-bodyweight` | Yes |
| 13 | Fixed-target lift | `21f-bodyweight` | (same run) |
| 14 | Cardio logging and History | `21f-cardio` | Yes |
| 15 | Missed day: Log it late | `21f-missed-late` | Yes |
| 16 | Missed day: Shift the week | `21f-missed-shift` | Yes |
| 17 | Missed day: Skip it | `21f-missed-skip` | Yes |
| 18 | Network failure and safe retry | `21f-recovery` | Yes |
| 19 | Force-close and resume | `21f-recovery` | (same run) |
| 20 | Exercise navigation and keyboard | `21f-recovery` | (same run) |
| 21 | Web and phone agree | every account | — |
| 22 | Another account can't see it | `21f-isolation-a`, `-b` | No |
| 23 | Light, dark, larger text, VoiceOver | any | No |
| 24 | 21e loop: finish, summary, History | `21f-skip` or `21f-recovery` | (same run) |

### 1 to 3. Gym history (`21f-gym`)

1. Today shows **Upper B**, Ready. Tap **Start workout** → the sheet "Where are you training?" lists Harbor Barbell, Northside Strength, Riverside Fitness. Pick **Riverside Fitness**.
2. **Leverage Chest Press** card: the line reads "Last time in Upper B · …" with `160 × …`, and the weight box holds **160** ("last time"). Next → **Seated Cable Rows**: **155**.
3. Next → **Side Lateral Raise** (dumbbells): **25**, and the card shows no gym. *(Check 2: a free-weight lift is the same lift anywhere.)*
4. Previous to the first card. Tap **Change gym** under the progress line → the sheet marks "Riverside Fitness (current)". Pick **Northside Strength**. The progress line now ends "· Northside Strength", chest press offers **130**, cable rows **145**, lateral raise still **25**. *(Check 1.)*
5. **Change gym** → **Harbor Barbell**. Chest press reads "First time on this at Harbor Barbell." and the weight box is **empty**. Lateral raise still offers 25. *(Check 3.)*
6. Type 110 and 12 on chest press and log all three sets. **Change gym** is gone as soon as set 1 is saved.
7. **Web:** History → today's Upper B shows "Harbor Barbell" and the three sets. Exercises → Leverage Chest Press: its history at Northside and Riverside is unchanged, and Harbor now has its own.
8. **Negative:** there is no way to change the gym now. That is the rule: a saved set never moves to another gym.

### 4 and 5. Swap (`21f-swap`)

1. Start Upper A at either gym. On **Incline Dumbbell Press**, tap **•••** (More) → the sheet is titled with the exercise and lists **Swap exercise**, **Didn't do this exercise**, Cancel.
2. **Swap exercise** → the modal "Swap exercise" reads "Instead of Incline Dumbbell Press" and "Planned: Chest · today only, your plan stays the same". The first chip, **Chest**, is selected.
3. Type in **Search exercises**, clear it, then tap an exercise. The modal closes and the card shows the new name with "Swapped from Incline Dumbbell Press". *(Check 4.)*
4. On **Wide-Grip Lat Pulldown**: More → Swap exercise → scroll the chips and tap **Biceps** (or any other group) → the list changes → pick one. The card shows it, "Swapped from Wide-Grip Lat Pulldown". *(Check 5.)*
5. **Cancel:** open Swap on another exercise and tap **Cancel**. Nothing changes.
6. Log one set on a swapped exercise, then open More on it: the sheet says "Sets are logged, so this exercise can't be swapped or marked not done." (it may offer "I meant to do fewer sets").
7. Finish the workout. **Web:** History → the workout shows each performed exercise "(swapped from …)". Plan → Strength Block 2 → Upper A still lists the original four exercises. Tomorrow's and next week's Upper A are unchanged.

### 6. Skip (`21f-skip`)

1. Start Upper A. On **Standing Military Press**: More → **Didn't do this exercise**. The card reads "Not done today. It won't count toward progression." with **Undo — I'll log it**.
2. Tap **Undo — I'll log it**: the set rows return. Mark it not done again.
3. Log the other exercises' sets as you like and tap **Finish workout**. The alert lists only unfinished exercises you didn't mark; finish.
4. **Web:** History → the workout shows Standing Military Press "Not done." with no sets. No set was invented for it.
5. **Negative:** an exercise with a logged set offers no "Didn't do this exercise".

### 7. RIR (`21f-rir`)

1. Start Upper A. On Barbell Bench Press the active set has a row **RIR 0 1 2 3 4+** with nothing selected.
2. Type reps, tap **2**, then **Log set 1**. The saved row reads "180 lbs × 8 · 2 RIR". Set 2's RIR row starts with nothing selected.
3. Log set 2 **without** RIR: its row shows no RIR. Log set 3 with **0**: it reads "· 0 RIR".
4. On set 3's row before logging, tap a chip twice: it selects, then clears.
5. Tap the saved set 1 → **Edit set 1**: RIR shows **2** selected. Tap **3**, **Save**. The row reads "· 3 RIR". Open it again, tap **3** (clears it, "Not recorded."), **Save**: the row shows no RIR.
6. **Web:** History → the workout shows the same RIR on each set (none where not recorded, never 0 for those).

### 8 and 9. Corrections (`21f-edit`)

1. Start Upper A and log two sets of Barbell Bench Press.
2. Tap saved **Set 1** → **Edit set 1**. Save is dimmed until you change something. Change the weight to 182.5 and tap **Save**. The row reads "182.5 lbs × …". *(Check 8.)*
3. Open it again, change reps, and tap **Cancel**: nothing changes.
4. **Finished workout:** History → ‹ to last week → open **Upper A** → tap a set row → **Edit set** shows the date under the exercise name. Change the reps and **Save**. The row shows the new value, and the workout still reads Done in History. *(Check 9.)*
5. **Web:** the same workout shows the same corrected numbers. The set count is unchanged: no set was added or removed.
6. **Web, baselines:** correct a set of **Wide-Grip Lat Pulldown** in a finished workout on the phone, then open Exercises → Wide-Grip Lat Pulldown on the web: the corrected set is in its history, at the same gym, on the same date.
7. **Negative:** in Edit set, enter weight `180.125` → "Use at most two decimal places." under Weight, and nothing is saved.

### 10 and 11. Set counts (`21f-setcount`)

1. Start Upper A. Log all three sets of Barbell Bench Press. The card reads "All 3 sets logged." and offers **Add set**.
2. **Add set** → a row "Set 4" marked **extra** with the last weight offered ("same as set 3"). Log it: the row reads "… · extra". The card still says "All 3 sets logged." *(Check 10: more than planned is an extra set; the plan's count doesn't change.)*
3. On **Standing Military Press** log sets 1 and 2 only. More → **I meant to do fewer sets** → the alert "Count 2 sets as the plan for this workout?" explains that only this workout changes and it can't be raised again. **Cancel** first: nothing changes.
4. More → **I meant to do fewer sets** → **Count 2 sets**. The card reads "All 2 sets logged." and both sets are still there. *(Check 11.)*
5. Finish. **Web:** History → the workout shows Bench with four sets (the fourth "extra") and Military Press with two sets and no "2 of 3 planned sets" note. Plan → Upper A still plans **3** sets of each.
6. **Also from History on the phone:** in an account where an exercise was left short, open the workout in History → under that exercise "N of M planned sets — …" and **I meant to do fewer** does the same.

### 12 and 13. Bodyweight and fixed targets (`21f-bodyweight`)

1. Start Upper A. **Pullups**: the line under the name reads "3 × 8–10 · bodyweight, reps only". There is **no weight box**, only reps, and "Last time in Upper A · … · 10, 10, 9 reps". Log three sets with reps only. *(Check 12.)*
2. Tap a saved Pullups set → Edit set shows "Bodyweight — reps only." and no Weight field. Change reps, Save.
3. **Incline Dumbbell Press** reads "3 × 10" (one number, not "10–10"), with the weight offered. Log it. *(Check 13.)*
4. **Crunches** reads "3 × 15 · bodyweight, reps only". Log it.
5. **Web:** History → Pullups and Crunches show "N reps" with no "0 lbs" anywhere; the plan shows Incline Dumbbell Press as 3 × 10.

### 14. Cardio (`21f-cardio`)

1. Today shows Upper A, Ready, and under **Also today**: "Incline Walk · 20 min", "Planned cardio", **Log**. Start workout is still the primary button.
2. Tap **Log** → **Log cardio**: "… · Planned Incline Walk · 20 min", Activity "Incline Walk", Minutes "20". Change minutes to 25 and tap **Save**.
3. Today's row now shows a check, "Incline Walk · 25 min", "Planned 20 min". The lifting card is unchanged (still Ready).
4. Tap the row → **Edit cardio** → tap the **Treadmill** suggestion, set 30, **Save**. The row reads "Treadmill · 30 min".
5. History → this week: the cardio line reads Done. ‹ to last week: one cardio line reads **Missed**; tap it → Log cardio → Save: it reads Done. A line marked **Upcoming** can't be tapped.
6. **Web:** History shows the same cardio lines with the same type and minutes.
7. **Negative:** in Log cardio clear Activity and set Minutes to 0 → "Enter the activity." and "Enter whole minutes, 1 or more." under their fields; nothing saves.
8. Two days after seeding, the same account shows a **cardio-only day**: a "Cardio" card with a primary **Log cardio**.

### 15 to 17. Missed day (`21f-missed-late`, `-shift`, `-skip`)

Each account opens on "Upper A was missed on <yesterday>" with Lower A dimmed and Waiting.

- **15 (`-late`):** **Log it late** → pick a gym → the workout opens on yesterday's Upper A ("… · a past day · <gym>"). Log a set, finish. Today then shows Lower A, Ready. History has Upper A yesterday, Done.
- **16 (`-shift`):** **Shift the week** → Cancel changes nothing → confirm → Today shows Upper A, Ready. History: the rest of this week moved one day; next week is unchanged.
- **17 (`-skip`):** **Skip it** → confirm → Today shows Lower A, Ready. Pull to refresh: the card doesn't return. History shows Upper A yesterday, Skipped.

On any of them, after resolving, start the workout and use one 21f action (a swap or an RIR) to confirm they work on a late-logged or shifted day.

### 18 to 20. Recovery and keyboard (`21f-recovery`)

1. Start Upper A. Turn on **Airplane Mode**. Type reps, pick an RIR, tap **Log set 1** → "Couldn't save — Overload needs a connection. Your numbers are still here." The numbers and the RIR choice stay; nothing shows as logged.
2. Still offline: More → Didn't do this exercise → "Couldn't update this exercise — Overload needs a connection."; the card is unchanged. Open a saved set (after logging one online) → change it → Save → "Couldn't save — … Your correction is still here."; the sheet stays open.
3. Turn Airplane Mode **off** and tap the same button again: it saves **once**. *(Check 18.)* On the web, the set appears once.
4. Mid-workout, swipe the app away. Reopen Overload Dev and the staging URL: Today shows **In progress**, **Resume workout** opens the first unfinished exercise with every saved set, its RIR, any swap, and the gym. *(Check 19.)*
5. **Keyboard:** tap weight → the bar reads **Done** and **Next**; Next → reps, the bar reads **Done** and **Log set N**. The whole active row, including the RIR chips, sits above the keyboard. Tap an RIR chip with the keyboard open: the keyboard stays.
6. Tap **•••**, then Cancel. Tap a saved set, then Cancel. Open Swap, then Cancel. After each, tap weight and reps: each opens the keyboard on the first tap.
7. **Next**, **Previous**, **Next** several times, tapping weight and reps on each exercise: every field takes its first tap. On a long exercise name the Next button stays one line. *(Check 20.)*
8. After **Add set**, the new row's fields take focus and have their own Done / Log set bar.

### 21. Web and phone agree

After each case above, the staging web app shows the same workout, sets, RIR, swaps, not-done exercises, extra sets, planned counts, gym, and cardio. Then correct a set **on the web** and pull to refresh on the phone: the phone shows the web's value.

### 22. Isolation (`21f-isolation-a`, `21f-isolation-b`)

1. As `-a`: start Upper A, log a set, swap an exercise, log today's... (it has no cardio; that's fine).
2. Sign out, sign in as `-b`: Today shows its own Upper A, Ready, not started. History holds only its own workouts. Nothing of `-a`'s is visible anywhere.
3. On the web, signed in as `-b`, paste the URL of one of `-a`'s workouts (copy it while signed in as `-a`): it reads not found.

### 23. Appearance and accessibility

- More → Appearance → **Dark**, then **Light**: repeat steps from 7, 8, 10, and 14. The selected RIR chip, the selected muscle chip, saved rows, and the cardio row read clearly in both.
- Settings → Accessibility → Display & Text Size → **Larger Text** at the largest size: the RIR chips wrap instead of shrinking, the active row stays above the keyboard, Edit set and Log cardio scroll, and Save and Cancel stay in the header.
- **VoiceOver:** the More button reads "More for <exercise>"; chips read "Set 2 RIR 2" and "4 or more", with "selected"; a saved row reads "Set 1, 180 pounds, 8 reps, 2 reps in reserve, logged" and hints that it opens for correction; the cardio button reads "Log cardio: Incline Walk, <date>".

### 24. The 21e loop

On any account: finish a workout → the summary → **Done** → Today shows Done and View workout at once, with no Resume. History reaches the first week with ‹ and lists **Earlier blocks**. A reopened finished workout is read-only except for corrections.

## 5. Known limitations

- **Simulator and device checks were not run by the pipeline.** Everything in §4 is yours.
- **A draft is dropped when you move to another exercise** (typed numbers and an RIR choice that weren't logged), as on the web. It survives opening and closing a sheet or modal.
- **The planned count can only go down**, and only to the sets already logged. More than planned is an extra set. There is no plan editing on the phone.
- **Adding a gym or a custom exercise is still on the web** (21h). With one gym, Change gym says so.
- **Cardio planned in the evening (US time) doesn't appear until the next day.** A planned cardio row counts from its creation date in UTC. This is existing web behavior, not part of this slice (owner notes).
- **No progression calls, deload banner, or Pro note on the phone yet** (21g).

## 6. What stays yours

- The iPhone acceptance in §4, and telling the run "21f accepted" or what failed.
- Production: a separate promotion you authorize. It needs no migration and no environment change. The mobile API change is additive, so the installed build keeps working.
- The app stays staging-only until 21l: no Production Expo update, TestFlight build, or App Store submission.

## 7. Verification record

| Checkpoint | Result | Who, when |
| --- | --- | --- |
| Automated | See the feature PR's owner notes (#264) for the suite results of the final commit | Run, 2026-11-17 |
| Test-account command on `overload-dev` | Each profile created once as a throwaway `21f-verify-*@example.com` account and read back through a local API server on `overload-dev` (results in the owner notes) | Run, 2026-11-17 |
| Staging merge and update | Staging commit, update group, update id, and runtime: in the feature PR's owner notes (#264) | Run, 2026-11-17 |
| iPhone acceptance (§4) | **Not run.** Owner | — |
