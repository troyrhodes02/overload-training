# Pitch 16 — Exercise History & PR Intelligence — Runbook

This runbook covers everything outside the codebase for shipping Exercise History & PR Intelligence. The autonomous run did not read, write, or migrate `overload-prod`, and changed no secret, environment variable, Vercel setting, or Supabase setting. Signup stays as the OVE-50 runbook left it.

**What ships:**
- `/exercises/[id]` becomes the exercise's history, in this order: **Next time** (the existing call and its two lines), **Records** (best set; best e1RM, labelled an estimate, from that set; heaviest weight; rep records — the most reps at a weight or heavier; most reps for bodyweight), **Trend** (e1RM or Weight tab; Reps for bodyweight), **Sessions** (each session's sets as logged, RIR, swap note, and the call that session led to; 10 recent, "View all"), **Goals** (active and past goals on the lift), **About** (image, muscles, equipment).
- Machines and cables show **one gym at a time** ("History at …" selector; archived gyms and legacy rows with no gym get their own option). No figure combines two gyms.
- Entry points: library rows (unchanged), the logging card's `View history ›`, the day-complete `history ›`, the goal page's `Exercise history ›`, and exercise names on a logged workout (`/history/[id]`).
- One new tour step ("Exercises", step 7 of 9 on a phone, 6 of 8 on desktop) and one significant What's New entry, "Exercise history and records".

**What changes in the database:** nothing. No migration, column, table, trigger, or RLS change (`git diff main -- prisma/` is empty). The page performs reads only.

**What does not change:** every progression rule, threshold, RIR qualifier, and recommendation sentence; scheduled-deload suppression; gym baselines; the set write and correction paths; e1RM; goals and how they complete; account scoping.

**Merge behavior:** merge on green (spec R1; pipeline guide D1). The run merges the feature PR (#90) itself only if every check passes and no protected boundary was crossed; otherwise the PR stays open and the steps below are yours.

---

## 0. Order of operations

| # | Step | Who | Reversible? |
| - | ---- | --- | ----------- |
| 1 | Release-note date matches the day it reaches production (§2) | run (if it merges) / you | yes, until it ships |
| 2 | Squash-merge #90 → Vercel deploys production (§3) | run or you | yes (instant rollback) |
| 3 | Post-deploy checks on your own account (§4) | you | — |
| 4 | Move OVE-70…72 to Done | you | — |

There is no human-only production action required to ship this pitch: no migration, no data change, no setting.

## 1. Before you look

- Open `docs/previews/16-exercise-history-pr-intelligence-preview.html` (light and dark switch at the top) — the visual contract.
- Spec: `docs/specs/16-exercise-history-pr-intelligence-spec.md`, Resolved Decisions R1–R31. Worth your review: **R10** rep records = the rep-max frontier, capped at 6 rows; **R12** the per-session call is the current engine run on the history up to that session (it shows what today's rules say about that history, not what the screen said on the day); **R16** 10 recent sessions; **R30** one column at every width (the app shell is 640px wide, so the preview's two-column desktop was dropped); **R31** the new tour step.

## 2. The release note's date

`src/lib/release-notes/entries.ts` top entry: `id: "2026-10-22-exercise-history"`, `date: "2026-10-22"`.

- If #90 is merged on **2026-10-22**, nothing to do.
- If it merges on a later day, before merging change **both** `date` and the id's date prefix to the merge day (e.g. `2026-10-23-exercise-history`) in one commit on the feature branch. Never date it earlier than it ships. Once it is in production it is published: never re-date or re-id it again (every account's seen point refers to it).

Unrelated observation (not changed by this run): Pitch 15's entry `2026-10-21-clearer-progression-calls` still carries its provisional 2026-10-21 date although #86 merged on 2026-10-22; it is published now, so leave it (method note: never re-date a published entry).

## 3. Merge and deploy

Squash-merge #90 into `main`. Vercel builds and deploys production. There is no migration step. Previews of #90 run against the dev project, never `overload-prod`.

## 4. Post-deploy checks (production, your own account)

All read-only. Use an exercise you have trained for a few weeks.

**History correctness**
1. Open the exercise from Exercises. Next time shows the same tag and two lines the day-complete summary showed after your last workout of it.
2. Records: Best set is a set you actually did (check it on the workout it names); Best e1RM says "estimate" and names that same set; Heaviest weight is the heaviest working set you logged; each rep-record row is a weight you lifted, with more reps as the weight goes down.
3. Sessions: the newest row's call matches Next time. Deload-week sessions say "Deload week"; a workout where you skipped a planned set says "Not counted".
4. A goal on the lift shows the same percent as the Goals page.

**Gym context** (a machine or cable you've used at two gyms)
5. "History at" shows the gym you trained at last. Switch to the other gym: every section's heading changes gym and no number from the first gym remains. There is no "all gyms" option.
6. A free-weight lift trained at two gyms shows one history with each session's gym named.

**Corrections**
7. Correct a set on a past workout (History → that day → edit). Reopen the exercise: the records, trend point, and that session's call (and every later one) reflect the correction.

**Entry points and guidance**
8. Start a workout: the card's `View history ›` opens the exercise (a machine card opens on that gym). Finish: `history ›` on the summary works.
9. The What's New dialog shows "Exercise history and records" once; Settings → What's New lists it.
10. Settings → Replay tour: the "Exercises" step points at the Exercises rail item (desktop) or the Exercises heading (phone).

**Read-only**
11. Nothing on the page offers to edit a set, a plan, a weight, or a goal (only the existing favourite star and, for a custom exercise, Archive).

## 5. Rollback

- Vercel → Deployments → promote the previous production deployment (instant). Nothing in the database depends on this code, so rollback is clean.
- A rollback removes the What's New entry from the dialog and page along with the code. If it had already reached production, it counts as published: when the feature ships again, keep its id and date unchanged.
- The tour: accounts don't store step positions, so a rollback simply removes the step.

## 6. Regression testing

| Suite | Command | Where |
| ----- | ------- | ----- |
| Unit | `npm test` | anywhere |
| Integration | `npm run test:integration` | embedded Postgres (never a real project) |
| Accounts e2e | `npm run test:e2e:accounts` | local Supabase stack only (`npx supabase start`); the config refuses anything but 127.0.0.1 |
| Default e2e | `npx playwright test` | local |

The new e2e `e2e/accounts/exercise-history.spec.ts` covers the values, two gyms, a correction, the entry points, empty/sparse/bodyweight, and 320/375 overflow. **`.env` holds production values**: never run DB commands without overriding to the local stack.

## 7. Publishing the release note

The entry ships with the deploy (it is repository content). Confirm §2's date before merging; after the deploy, §4 step 9 confirms it is visible once.
