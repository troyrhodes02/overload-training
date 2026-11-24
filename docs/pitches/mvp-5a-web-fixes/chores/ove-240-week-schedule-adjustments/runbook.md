# OVE-240 — This Week's Schedule on Today: Owner Runbook

**What changed outside the code:** one additive migration, `9s_schedule_moves`. It adds a single owned table, `schedule_moves`, with deny-all RLS (no policies), the shared `user_id`-immutable trigger, and same-owner triggers on `mesocycle_id` and `session_id`. Every foreign key is RESTRICT. Account deletion removes the table's rows first, and the data export includes them. Nothing is dropped, renamed, or rewritten. No environment variable, provider, Stripe, Supabase setting, or Expo step is involved.

**Client scope:** web UI only. The iPhone app has no new screens. It reads the same effective schedule through the unchanged mobile API, so a week changed on the web shows correctly on the phone's Today and History.

**Capability:** Free (scheduling is capture, not interpretation).

## 1. Database

| Project | State | Who |
| --- | --- | --- |
| overload-dev | applied by the run with the guarded wrapper | the run |
| Production | **not applied**. Apply it **before** the release PR merges. | you, from the release record (`docs/releases/2026-11-ove-240-week-schedule-production.md`), after a backup |

The code reads `schedule_moves` on every Today, History, and workout-start request. Deploying the code before the migration would break those pages. The old code ignores the new table, so applying the migration first is safe and leaves no time pressure.

## 2. How it behaves (for checking)

- **The strip.** It shows the seven days of the current block week, with today selected. Tapping another day shows a preview of that day in place of Today's block. Nothing changes until you confirm in a dialog.
- **Skip workout.** This works on a not-yet-started workout today or later this week. It is stored as the existing *skipped* missed-day resolution for that occurrence, so it never prompts as missed. It can't be undone, and the dialog says so.
- **Train today.** This works on a later workout this week, when today has no workout. The workout moves to today, and the usual start flow (gym choice) opens. The workout keeps its identity (its planned date is `scheduledFor`) and records today as `performedOn`. Its original day becomes free. If today already has a workout, the preview says to swap the two days instead.
- **Swap day.** Two days, each today or later, trade workouts. A workout can also trade with a rest day. Finished or started workouts can't be moved, and the dialog greys them out.
- **What never changes.** The authored weekday, next week, logged sets, gyms, RIR, exercise swaps, and the scheduled-deload week (a move stays inside its block week).
- **Missed days come first.** While a missed day waits for an answer, nothing moves. The strip says why.
- **Retries and stale pages.** A retried request changes nothing. A request from a stale page gets "Your week changed. Reload…" and writes nothing.

## 3. Staging check (about 10 minutes, phone browser)

Make a disposable account:

```bash
npm run dev:test-account -- --help        # pick a profile with an active block
```

Or sign up a new account on staging and build a block that starts today, with **Pull** today, **Push** tomorrow, a rest day after that, and **Legs** on day 4.

1. Today shows a 7-day strip. Today is circled and selected.
2. Tap tomorrow. The preview shows Push and its exercises, with **Train today** hidden (today has Pull), **Swap day**, and **Skip workout**.
3. **Swap day** → choose Today → the preview reads "Today: Push / tomorrow: Pull" → **Swap days**. Today's workout is now Push. Tomorrow shows Pull. Refresh: the change persists.
4. Start Push and log a set. History's week shows Push today and Pull tomorrow.
5. Tap Legs (day 4) → **Skip workout** → confirm. Legs shows struck through as Skipped.
6. In another disposable block where today is a rest day, tap a later workout → **Train today** → confirm. The gym choice opens. Start it, and Today shows it.
7. Open History → next week: every workout is on its authored day.

## 4. Not verified by the run

- A physical iPhone, Android, or the native app on a device. The native app makes no new calls, so only its existing screens are affected.
- Production: everything in the release record is a human step.

## 5. Rollback

- **Code:** promote the previous Production deployment in Vercel, or revert the release merge through a PR. The old code ignores `schedule_moves`. Moves already made stop applying, so those weeks show their authored days again. Logged workouts and skips are unaffected.
- **Schema** (only if you want the table gone after a code rollback): `DROP TABLE "schedule_moves";` and delete the `9s_schedule_moves` row from `_prisma_migrations`. This loses only the one-week moves.
