# Pitch 24 — Workout Logging Refinements: runbook

Everything the owner does outside the codebase for this pitch. There is **no migration, no new environment variable, no new service, and no data change**. Production promotion is a separate, owner-approved release (`docs/pipeline/production-promotion-prompt.md`).

## 1. Review on staging

The staging URL runs against `overload-dev` (synthetic data only). Sign in with a dev test account that is on its trial or comped, so it is Pro.

1. **Below-minimum (Pro).** Plan an exercise at 3 × 6–10. Log one complete workout at 90 × 8, 8, 8 and finish. Log a second at 90 × 3, 8, 8 and finish.
   - The day-complete summary and the exercise page should read "Reassess the weight next time" with "Last time: 3, 8, 8 of 6–10, below 6. A deload follows 2 complete sessions running below 6." There is no tag and no "Stay at 90 lb".
   - A third complete workout with a set below 6 should give the Deload tag and "Lower the weight next time".
2. **Fixed target.** In Plan, open an exercise and choose **Fixed**, enter 10, and save. The row reads "3 sets · 10 reps". Today and the logging card read "3 × 10".
3. **Swap.** Start a workout and tap Swap exercise. The picker opens on the planned muscle. Choose **Core** under Muscle group, then pick Crunches. The card shows "· bodyweight, reps only" and takes reps only.
4. **Free.** On a Free test account (trial ended, no comp), the same history shows the quiet Pro note in place of the reassess line. Logging and planning are unchanged.
5. **Public copy** (reworked in OVE-118). Signed out, `/pricing` opens with "Every new account starts with 14 days of Pro, free" and three steps, then one short trial line per plan card and the trial questions. With billing off, nothing offers a way to pay. `/blizzy` no longer exists: signed out it goes to sign-in, signed in it is not found.
6. **Admin.** With your id in `OVERLOAD_ADMIN_USER_IDS` (Preview scope), `/admin/accounts` shows a Plan column (Pro / Pro trial / Comped / Free). A non-admin gets not-found.
7. **What's New.** The entry "Single rep targets and wider swaps" opens once, then not again.

## 2. Before promotion to Production

- Set the release-note entry's `date` and id prefix (`2026-11-11-single-rep-targets-and-wider-swaps` in `src/lib/release-notes/entries.ts`) to the actual production-ship day.
- No migration and no environment change are needed.

## 3. Decisions waiting on the owner (non-blocking)

- **Load-free abs filed as "other" or "exercise ball"** (Ab Roller, Suspended Reverse Crunch, Exercise Ball Crunch) still ask for a weight under the existing loading-mode rule. Lifters can use a custom Bodyweight exercise. Making them reps-only would mean a catalog equipment change for rows that may already carry logged weights. See spec Open Question 1.
- **Short workouts and the Deload window.** A workout finished short with a set below the minimum triggers a reassess, but it never counts toward the two-session Deload. See spec Open Question 2.
