# Plans, Library & Gyms — Runbook

What you do outside the codebase for Pitch 21h: check the staging delivery, create test accounts, and run the iPhone acceptance checks. Production promotion is **not** part of this runbook. It needs your separate approval after you've accepted 21h on the iPhone.

Nothing here needs a migration, an environment change, a native build, or Stripe.

## 1. Start from zero

### A. The checkout

```bash
cd ~/Dev/overload-training
git checkout staging
git pull --ff-only origin staging
git status --short --branch     # "## staging...origin/staging" and nothing under it
git log --oneline -1            # the 21h merge or delivery-record commit (§9)
```

### B. Servers: none needed

You need no local Next.js server and no Metro for the iPhone checks. The staging deployment serves the 21h API, and the phone loads the published staging update. Start Metro or a local server only to debug code that isn't on staging yet; the 21g runbook §1 B–C has those steps, unchanged.

If Metro is running from earlier work, stop it (Ctrl-C in its window) before testing the update, so the phone can't pick up a local bundle.

### C. The iPhone on the staging update

1. Open **Overload Dev**. If it reopens the last project, shake the phone → **Go home**.
2. Tap **Enter URL manually** and enter `https://u.expo.dev/3b322e4a-1bf6-422e-9feb-3aa859dffb46?channel-name=staging`.
3. More → **Diagnostics** must show:

| Row | Expected |
| --- | --- |
| Environment / API / Supabase project | `staging` / the `overload-training-git-staging-…vercel.app` host / `vdxrmfadikwzodjljbdi` |
| Running | `EAS update` |
| Update group | the 21h group in §9 |
| Commit | the 21h commit in §9 |
| Runtime | `f98506f78a` |

If Diagnostics shows an older group, force-close Overload Dev (swipe it away) and open the URL again.

### D. The staging web app

`https://overload-training-git-staging-wtrhodes02-gmailcoms-projects.vercel.app`

Sign in to Vercel in that browser first (Deployment Protection), then to Overload with the same test account. Production is `www.overloadtraining.app`; never use it for these checks.

## 2. The test accounts

Each scenario has its own account. Reused 21f/21g profiles are named as they are; the 21h ones are new.

| Scenario | Profile | What it holds |
| --- | --- | --- |
| A Active plan | `standard` | Strength Block 2 active: week 4 of 6, deload every 6 weeks (week 6). Upper A, Lower A, Upper B, Lower B on four weekdays; rest days between. Strength Block 1 archived. Today: Upper A ready. |
| A′ Deload week | `scheduled-deload` | Today is in week 4 of a block that deloads every 4th week. |
| B No active plan | `no-plan` | An account with no training data at all. |
| C Detailed session | `session-detail` | Today's Upper A: Bench 3 × 6–8, Pullups 3 × 8–10 (bodyweight), Incline Dumbbell Press 3 × 10 (fixed), Crunches 3 × 15 (bodyweight, fixed); planned cardio on Upper A's day and on a rest day. |
| D Library and favorites | `library` | The standard story, plus favorites on Barbell Bench Press, Barbell Squat, Side Lateral Raise, and the lifter's own **Landmine Press** (Shoulders · Barbell, secondary Triceps), also a favorite. |
| E Custom exercises | `custom-exercises` | Yesterday's Upper A was finished with Standing Military Press swapped for the custom **Landmine Press** (95 × 10, 9, 8). Also **Banded Face Pull** (active) and **Cable Y Raise** (archived). Today: Lower A. |
| F Gyms | `gyms` | Upper B today; machines trained at Northside Strength and Riverside Fitness; Harbor Barbell (no history); **Downtown Annex** (location "410 Main St, 2nd floor"); **Riverside Fitness archived** with its history and machine weights kept. |
| G Active workout | `recovery` | Today's Upper A started at Northside, Bench sets 1–2 saved. |
| H Isolation | `isolation-resources-a`, `isolation-resources-b` | A: Alpha Landmine Press, favorite Bench, gym Alpha Annex. B: Bravo Sled Push, favorite Pullups, gym Bravo Garage. |

Every account is Pro (comp). Everything in 21h is Free, so Pro changes nothing on these screens; `--access free` (21g runbook §3) switches one if you want to see that for yourself.

## 3. Create fresh test accounts

A story is anchored to the day the account is created. **Create the accounts on the day you test.** Each takes about two and a half minutes (`no-plan` about thirty seconds).

```bash
cd ~/Dev/overload-training
set -a; . apps/web/.env.overload-dev; set +a
# Prints only the project ref. It must read vdxrmfadikwzodjljbdi (overload-dev).
node -e 'console.log("Supabase project:", new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0])'
```

One at a time (add a suffix such as `-1123` for each testing day, so every run is a fresh account):

```bash
npm run dev:test-account -- --email 21h-plan@example.com           --profile standard              --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21h-deload@example.com         --profile scheduled-deload      --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21h-no-plan@example.com        --profile no-plan               --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21h-session@example.com        --profile session-detail        --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21h-library@example.com        --profile library               --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21h-custom@example.com         --profile custom-exercises      --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21h-gyms@example.com           --profile gyms                  --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21h-active-workout@example.com --profile recovery              --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21h-isolation-a@example.com    --profile isolation-resources-a --confirm-ref vdxrmfadikwzodjljbdi --execute
npm run dev:test-account -- --email 21h-isolation-b@example.com    --profile isolation-resources-b --confirm-ref vdxrmfadikwzodjljbdi --execute
```

Or all of them in one go, with a day suffix:

```bash
day=$(date +%m%d)
for pair in plan:standard deload:scheduled-deload no-plan:no-plan session:session-detail \
            library:library custom:custom-exercises gyms:gyms active-workout:recovery \
            isolation-a:isolation-resources-a isolation-b:isolation-resources-b; do
  name=${pair%%:*}; profile=${pair#*:}
  npm run dev:test-account --silent -- --email "21h-$name-$day@example.com" --profile "$profile" \
    --confirm-ref vdxrmfadikwzodjljbdi --execute
done
```

A successful 21h run ends with the resource check and `ENGINE CHECK PASSED`, for example (ids and dates will be yours):

```text
  profile:  gyms (fixture: gym; Pro, comp)
  extras:   1 gym(s); archive Riverside Fitness (through the app's write modules, one transaction)
  ...
Seeded in one transaction: 3 gyms, 32 workouts, 264 sets, 0 planned cardio, 0 cardio logs.
Added in one transaction: gym "Downtown Annex", archived gym "Riverside Fitness".
Password file (owner-only, never printed): /Users/<you>/.overload-dev/accounts/21h-gyms@example.com.txt
  plan:     Pro (progression insights on)

Engine check (the gated server reader, read-only):
  Today: Upper B, week 4, pending
    ...
Resource check (the app's own reads, read-only):
  Plan:      Strength Block 2, week 4 of 6, deload weeks 6
  Favorites: none
  Own:       none
  Gyms:      Downtown Annex (410 Main St, 2nd floor), Harbor Barbell, Northside Strength
ENGINE CHECK PASSED
```

`ENGINE CHECK MISMATCH` (exit code 2) means a read disagreed with the profile's promise. The data is real and was kept. Send me the lines, and use a new email.

Leave off `--execute` for a dry run (it writes nothing). The command refuses non-test emails, any project but `overload-dev`, and accounts holding other data. It never edits, resets, or deletes training data.

If a seed stops with "Transaction API error: … expired transaction", nothing was written; run the same line again.

### Passwords

Each password is in an owner-only file and is never printed:

```bash
sed -n 's/^PASSWORD=//p' ~/.overload-dev/accounts/21h-plan@example.com.txt | tr -d '\n' | pbcopy
```

Universal Clipboard pastes it on the iPhone. Sign in with the email and that password on the iPhone (More → Sign out first) and on the staging web app.

### Running a case again

A consumed account can't be rewound. Make another with a new email and the same profile (for example `21h-custom-2@example.com`). There is no delete command, by design; an account can delete itself on the staging web app (Settings → Delete account).

## 4. iPhone acceptance checklist

Run in order. Each line is one thing to look at; **Expect** is what you should see. Compare with the staging web app where a line says *web*.

### Test 1 — Active plan (`21h-plan`)

1. Plan tab. **Expect:** the card "Strength Block 2" with **Active**, the date range, **Week 4 of 6**, "Deload every 6 weeks · week 6", "Custom · 4 sessions".
2. **This week** shows "Week 4", the week's date range, seven day rows. Today's row has the date in blue and **Today**; Upper A says **Upcoming**. Days with no session say **Rest**.
3. Tap **‹** three times. **Expect:** weeks 3, 2, 1, each with **Done** on its four sessions; ‹ is disabled at week 1. Tap **›** to week 6: "· Deload week" under the header.
4. Under **Sessions**: four rows in weekday order ("Monday · Upper A 4" and so on, by this block's weekdays).
5. Below: "Edit this plan on the web. 1 earlier block is on the web." **Open Plan on the web** opens the browser.
6. *Web:* Plan → Strength Block 2: same name, dates, length, deload cadence, and the same sessions on the same weekdays.

### Test 1′ — Deload week (`21h-deload`)

1. Plan tab. **Expect:** the position line reads "Week 4 of … · Deload week"; this week's header says "· Deload week". Today's card on Today shows the deload-week banner (21g), so the two agree.

### Test 2 — Session detail (`21h-session`)

1. Plan → tap today's row (or Sessions → Upper A). **Expect:** title "Upper A", "<weekday> · 4 exercises · Strength Block 2".
2. Rows in order: 1 Barbell Bench Press "3 sets · 6–8 reps" "Chest · Barbell"; 2 Pullups "3 sets · 8–10 reps" "Bodyweight · reps only"; 3 Incline Dumbbell Press "3 sets · 10 reps" (fixed); 4 Crunches "3 sets · 15 reps" "Bodyweight · reps only".
3. Last row: "Cardio · <activity> · <n> min", "Planned for <weekday>".
4. Footnote: "This is the plan. A swap, a skipped exercise, or an extra set in a workout changes that workout only."
5. Tap Pullups → the exercise page; back returns to the session, scrolled where you were.
6. Go to Today. **Expect:** Upper A is still **Ready** (browsing started nothing). History shows nothing new.
7. *Web:* Plan → the block → Upper A: the same four exercises, order, and "3 sets · 6–8 reps"-style lines.

### Test 3 — Library (`21h-library`)

1. More → **Exercises**. **Expect:** a search field, **All | Favorites**, a row of muscle chips starting "All muscles", "Showing 50 of …", rows with images.
2. Type "bench press". **Expect:** after a short pause, only names with both words.
3. Clear it; tap **Back** in the chips. **Expect:** only exercises whose primary muscle is Back.
4. Tap an exercise with an image. **Expect:** the photo whole (not cropped), name, "Back · <equipment>", Primary/Secondary/Equipment/Type rows, "History and records — On the web".
5. Search "landmine". **Expect:** Landmine Press with **Custom** and a letter tile instead of an image; its page has no image block, "Type: Your exercise".
6. Search "zzzz". **Expect:** "No exercises match “zzzz”." with **Add your own exercise**.
7. Scroll to the end of All and tap **Show more**. **Expect:** 50 more.

### Test 4 — Favorites (`21h-library`)

1. Exercises → **Favorites**. **Expect:** Barbell Bench Press, Barbell Squat, Landmine Press, Side Lateral Raise, each with a filled star.
2. Tap Squat's star. **Expect:** it empties at once and the row stays until you refresh (as on the web).
3. *Web:* Exercises → Favorites: Squat is gone; star one there, pull to refresh on the phone, and it appears.
4. Open an exercise, tap **Add to favorites** → it reads **In favorites**.

### Test 5 — Custom exercises (`21h-custom`)

1. More → Exercises → **+**. Fill Name "Sled Push", Primary **Quads**, Equipment **Other**, Save. **Expect:** the sheet closes, "Added Sled Push." with **View** at the top of the library.
2. Save with nothing filled. **Expect:** "Enter a name.", "Choose a primary muscle.", "Choose the equipment." under their fields; nothing saved.
3. Choose Shoulders as primary. **Expect:** Shoulders disappears from Secondary muscles.
4. *Web:* Exercises: Sled Push is there with Custom.
5. Start today's Lower A, tap ••• on a quads exercise → Swap → Quads. **Expect:** Sled Push is offered. Cancel the swap.
6. Exercises → Landmine Press → **Archive exercise** → the alert "Archive Landmine Press? It leaves the library and the pickers. Past workouts and plans keep it." → Archive. **Expect:** Archived chip, "Archived. Past workouts keep it." with **Undo**; the favorite button is gone.
7. History → yesterday's Upper A. **Expect:** "Landmine Press" (swapped for Standing Military Press) with 95 × 10, 9, 8, marked archived.
8. Back on Landmine Press: **Undo** → "Restored."; it's back in the library.
9. Cable Y Raise isn't in the library (archived). There is no edit for an own exercise (the web has none either).

### Test 6 — Gyms (`21h-gyms`)

1. More → **Gyms**. **Expect:** Downtown Annex with "410 Main St, 2nd floor", Harbor Barbell, Northside Strength; no Riverside. Footer: "Machines and cables keep their own working weights at each gym."
2. **+** → Name "Garage Gym", Location empty → Save. **Expect:** "Added Garage Gym."; it's in the list.
3. Today → **Start workout** → the gym sheet lists Downtown Annex, Garage Gym, Harbor Barbell, Northside Strength. Pick **Garage Gym**. On the machine (Leverage Chest Press) the weight box is not filled with Northside's machine weight: a new gym starts fresh. Go back to Today without logging.
4. Gyms → Northside Strength → **Archive gym** → alert "… Past workouts keep it, and its machine weights stay with it." → Archive. **Expect:** Archived and **Undo**. Undo → "Restored."
5. History → a week with Upper B at Riverside Fitness. **Expect:** the workout still names Riverside Fitness.
6. *Web:* Gyms shows the same list (Garage Gym included, Riverside absent).

### Test 7 — Active workout (`21h-active-workout`)

1. Today → **Resume workout**. On Bench, type 185 in set 3's weight box but don't save.
2. ••• → **About this exercise**. **Expect:** the Barbell Bench Press page over the workout, with no Archive.
3. Back. **Expect:** the same card, set 3's box still holds 185 (not saved), sets 1–2 still saved.
4. Tab to Plan and back to Today → Resume. **Expect:** one workout (not two), sets 1–2 saved.

### Test 8 — Isolation (`21h-isolation-a`, `21h-isolation-b`)

1. As A: Exercises → search "Alpha" → Alpha Landmine Press; Favorites lists Barbell Bench Press and Alpha Landmine Press; Gyms lists Alpha Annex.
2. More → Sign out; sign in as B.
3. As B: searching "Alpha" finds nothing; Favorites lists Pullups and Bravo Sled Push only; Gyms lists Bravo Garage and B's demo gyms, never Alpha Annex.

### Test 9 — Accessibility and reliability (any account)

1. Settings app → Display → switch Light/Dark. **Expect:** Plan, Exercises, the exercise page, Gyms, and both forms readable in both.
2. Accessibility → Larger Text to a large size. **Expect:** names wrap, chips wrap under names, nothing cut off, every button reachable.
3. In New exercise / New gym, tap Name: the keyboard never covers the field; Save stays in the header.
4. Background the app on Plan; reopen. **Expect:** the same screen.
5. Airplane mode → pull to refresh on Plan. **Expect:** a "needs a connection" message, not an empty plan. Try New gym → Save: "Couldn't add the gym — Overload needs a connection. Your entries are still here." Airplane mode off → Save again: one gym is added, not two.
6. VoiceOver on: a week day reads like "Wed, Nov 18, today, Upper A, Upcoming"; a star reads "Add <name> to favorites".
7. Log one set in any workout and finish it, to confirm logging still works end to end.

## 5. Web/iPhone parity matrix (21h)

Baseline: the 21g matrix (21g runbook §10). "Same" means the same server read, the same words, or both.

| Capability | Web | iPhone | Shared authority | Difference | Intentional? | Verified |
| --- | --- | --- | --- | --- | --- | --- |
| Active block identity | Plan home card and block page | P1 card | `getMesocycleWeek` summary | none in content | — | integration E1 |
| Current week, position | Today's "week n"; History's week | P1 "Week n of L", upcoming/ended | calendar `mesocycleWeekForDate`, account today | the web plan page shows no current week; the phone does | yes: the pitch asks for it on the plan | integration E1, tz test |
| Deload placement | block page "deload every N weeks" | cadence line + deload weeks + week marker | `isScheduledDeloadWeek` | the phone lists the weeks | yes: same rule, more explicit | unit week-grid |
| Week schedule (effective) | History's week | P1 This week (all 7 days, rest days) | `getWeekSchedule` (unchanged output) | the phone adds rest days and a stepper over the block's weeks | yes | integration shift test |
| Day states | History words | same words (`history/day-state.ts`) | `WeekDayState` | none; "Upcoming" on a past unresolved day on both (Open Question 2) | — | mobile plan test |
| Session prescription | "3 sets · 6–8 reps" | identical | `formatPrescription` (shared now) | the phone adds "Chest · Barbell" / "Bodyweight · reps only" | yes: no hover or thumbnail detail on the phone | unit, mobile |
| Planned cardio | block page per weekday | session row + week day line | `PlannedCardio`, cardio week | none in content | — | integration E2 |
| Exercise names, classification | library and detail | same | taxonomy labels | none | — | integration E3/E4 |
| Images | thumb + detail | tile + hero (contain) | `exerciseImageUrl` | none | — | integration (URL); device unverified |
| Search | every word, literal `%`/`_` | same request | `parseLibraryParams` + `libraryWhere` | none | — | integration |
| Filters | All/Favorites, primary muscle | same | same | none | — | integration, mobile |
| Favorites | star, optimistic, row stays | same | `setExerciseFavorite` | none | — | integration, mobile |
| Custom exercise fields | name, primary, equipment, secondaries | same, chips | `parseCustomExerciseInput` | chips instead of selects | yes: native pattern | mobile |
| Custom create / archive / undo | create, archive dialog + undo toast | create, archive alert + screen Undo | write module | undo lasts while the screen is open, not 5 s | yes: no toasts on native | integration, mobile |
| Custom edit | none | none | — | — | — (Open Question 1) | — |
| Gym details | list: name + location | list + gym page | `listActiveGyms` | the phone has a gym page | yes: destructive action off the list row | mobile |
| Gym create / archive / undo | form; row menu + undo toast | modal; gym page + Undo | `createGym`, `archiveGym` | as above | yes | integration, mobile |
| Archived references | History and plans name them, "Archived" | same reads | no `deletedAt` filter on history | none | — | integration |
| Loading / empty | skeletons, the web's empty sentences | same sentences | — | none in words | — | mobile |
| Error / retry | inline errors | described load errors, failure banners | `describeLoadError`, `changeFailureMessage` | — | — | mobile |
| Retry safety of creates | form submit (no key) | `Idempotency-Key` | `withIdempotency` | the web form can double-submit on a slow network; the phone can't | known, pre-existing web behavior (the mobile audit's server-action table marks both web creates "No: duplicate") | integration |

**Deliberate web-only exception:** creating and editing plans (blocks, sessions, exercises, cardio), cloning, activation, plan import.

**Discrepancies found and corrected in 21h:** the prescription wording now has one source (`formatPrescription`), and History's day words are shared on the phone. No other discrepancy needed a web change.

## 6. Known limitations

- Device-only behavior is unverified until you run §4: layout, Dynamic Type, VoiceOver, dark mode, the keyboard, haptics, image loading, backgrounding.
- The phone browses only the active block; drafts and earlier blocks are on the web.
- No edit for custom exercises or gyms (as on the web). Decide it upstream if you want it (spec Open Question 1).
- Undo after an archive lasts while that screen is open; afterwards there is no unarchive on either client.

## 7. Verification record

Filled in at the staging merge (§9).

## 8. Native runtime

No native dependency, config, or token change: the runtime fingerprint stays `f98506f78a`, so the existing development build (`86e673d0`) receives the update. `react-native`'s own `Image` shows exercise photos; `expo-haptics`' `selectionAsync` is in the installed module.

## 9. Delivery record

Filled in at the staging merge and the staging update.
