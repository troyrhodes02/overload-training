# OVE-241 — Native Weekly Scheduling Parity: Chore Spec

**Linear:** OVE-241 (chore, separate from Pitch 21i; ships in the same staging update).
**Source feature:** OVE-240, web Today's week strip. Staging PR #305 (`db6aa57`), released by #306 (`c31638b` on `main`). Its owner runbook is `docs/pitches/mvp-5a-web-fixes/chores/ove-240-week-schedule-adjustments/runbook.md`.
**Client scope:** mobile (iOS) UI, plus three additive mobile API endpoints over the released server modules. No web UI change, no schema change, no migration.
**Capability:** Free (scheduling is capture, as on the web).

Why a spec and not a bare ticket: the work adds API endpoints and a native control with real layout decisions. It changes nothing an account can do beyond what the web already allows, needs no schema change, and so stays a chore (pipeline guide Appendix F). This file is its design and implementation note.

## 1. What the released backend does (authoritative)

These modules are reused unchanged:

- **Read:** `getThisWeek(account)` in `apps/web/src/lib/logging/this-week.ts` returns the current block week, or null with no active block or outside it. It has seven days, each with `workout` (sessionId, `scheduledFor` = authored date, state upcoming | in_progress | complete | skipped, `loggedSessionId`, `movedFrom`, `adjustable`, exercises with scheme) and `skipped[]`. It also returns `blockedReason` (a missed day waits for an answer), `scheduledDeloadWeek`, and `today` (the account's time zone).
- **Skip:** `skipUpcomingWorkout(account, {mesocycleId, sessionId, scheduledFor})` in `schedule-adjustments.ts` records the existing *skipped* MissedDayResolution. A replay returns success, and it never toggles. A finished, started, or past workout is refused with `invalid_state_transition`.
- **Move / swap:** `rescheduleWorkout(account, {mesocycleId, sessionId, scheduledFor, from, to, occupant})` writes `schedule_moves` for one week. The request states what the lifter saw (`from`, plus the `occupant` on `to`, or null for a rest day). A replay of a finished change answers `unchanged`. A stale request is a `conflict` ("Your week changed. Reload to see it, then try again."). Both days must be today or later in this week. A move needs no waiting missed day and no started workout. The block's row lock serializes moves with each other and with workout starts.
- **Start after a move:** the existing `POST /workouts` with `{sessionId, scheduledFor: <authored date>, gymId}`. The start path writes `performedOn` = the new day. Nothing else changes.
- **Effective schedule:** Today, History, Plan, unfinished workouts, and missed-day detection already read the moves (OVE-240). The phone already shows web changes correctly.

## 2. Mobile API (additive)

| # | Method and path | Body | Answer | Errors |
| --- | --- | --- | --- | --- |
| S1 | `GET /this-week` | — | `ThisWeekResponseDto = { week: ThisWeekDto \| null }` | — |
| S2 | `POST /mesocycles/{mesocycleId}/schedule/skip` | `{ sessionId, scheduledFor }` | `{ missedOn, outcome: "skipped" }` | 400 shape, 404, 409 `invalid_state_transition`, 422 |
| S3 | `POST /mesocycles/{mesocycleId}/schedule/move` | `{ sessionId, scheduledFor, from, to, occupant: { sessionId, scheduledFor } \| null }` | `{ status: "moved" \| "unchanged" }` | 400 shape, 404, 409 `conflict` (stale) or `invalid_state_transition`, 422 |

- The `ThisWeek*` types move from `this-week.ts` into `packages/shared/src/contracts/schedule.ts`. The web module re-exports them, so the web's output is checked against the contract by the compiler.
- S2 and S3 are retry-safe by the domain's replay rule (natural key: the occurrence and the stated placement). Like 21e's start and 21f's absolute writes, they take no `Idempotency-Key`. A replay never writes twice, and a request that no longer matches is a conflict, never a second move.
- The adapters (`src/lib/api/mobile/schedule.ts`) only check shape: strings, a nullable occupant object, and a 4 KB body. Every rule stays in the modules.
- Another account's block, session, or occurrence answers 404 (`loadAdjustableWeek` uses the scoped lock, and `findOccurrence` uses the scoped week).

## 3. Native design (Today)

**Placement.** On Today, between the header and the day's content: the stale banner, the resolution note, and the unfinished-workout reminders stay above the strip and are always visible. Under the strip sits the selected day's content. On today, that is Today's existing dashboard block, unchanged. On any other day, a preview card takes its place. There is no strip without an active block week (`week: null`), and Today is then exactly as before.

```text
┌──────────────────────────────────┐
│ TUESDAY, NOVEMBER 24             │
│ Today                            │
│ Good evening, Sam.               │
│ This week · Week 3 of 5          │
│ ┌──┬──┬──┬──┬──┬──┬──┐           │
│ │Mo│Tu│We│Th│Fr│Sa│Su│           │
│ │23│(24)25│26│27│28│29│         │
│ │✓Up│Lo│Up│Re│Lo│Re│Re│        │
│ └──┴──┴──┴──┴──┴──┴──┘           │
│ [Swap day]  [Skip workout]       │  ← only when today's workout is adjustable
│ ┌──────────────────────────────┐ │
│ │ Today's workout (unchanged)  │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

- **Cells.** Each cell is a Pressable, 44 pt or larger, with the weekday, the day number (today in a filled `primary` circle), and a one-line label: the workout name, "Rest", or a struck-through "Skipped". A finished workout shows a checkmark. Past days are dimmed. The selected cell has a `primary` border and the `secondary` fill. VoiceOver reads the web's sentence ("Wed, Nov 25, Upper B, planned"). A selection haptic plays.
- **Heading.** "This week · Week 3 of 5", plus " · Deload week" when it applies. When `blockedReason` is set, a muted line under the strip says it ("Answer the missed workout first, then you can change this week.") and every action is hidden.
- **Today's actions.** When today's workout is adjustable and nothing blocks, a row of two text buttons sits above the dashboard block: "Swap day" and "Skip workout".
- **Preview card (another day).** It shows the day label ("Wed, Nov 25" and " · earlier this week" if past), then the workout name with its state word, then "Moved this week from Thu, Nov 26." when moved. An upcoming workout lists its exercises with their schemes. "Resume workout" appears for an in-progress workout and "View workout" for a finished one. An adjustable workout gets "Train today" (only when today has no workout), "Swap day", and "Skip workout". The web's note explains a taken today ("Today already has Upper A. To train Lower A today, swap the two days."). A rest day reads "Rest day". Skipped workouts are listed ("Lower B is skipped this week."). The card ends with "Back to today".
- **Skip.** A system alert: "Skip Lower A this week?" / "Lower A on Wed, Nov 25 is marked skipped. It won't come back as a missed workout, and next week is unchanged. A skip can't be undone." [Cancel] [Skip workout]. On success: a success haptic, the banner "Lower A skipped this week.", and a refresh.
- **Train today.** A system alert: "Train Lower A today?" / "Lower A moves from Wed, Nov 25 to today, for this week only. Wednesday becomes a rest day. Next week is unchanged. Then choose your gym to start." [Cancel] [Move to today]. On success the existing start flow runs (gym sheet and unfinished-workout warning) for `{sessionId, scheduledFor}`. If the lifter cancels the gym choice, the workout stays moved to today and Today shows it, as on the web.
- **Swap.** A page sheet (React Native `Modal`, `presentationStyle="pageSheet"`) titled "Swap Lower A with…". It lists this week's days from today on, except the workout's own day: "Today — Upper A", "Thu, Nov 26 — Rest". A day whose workout can't move is disabled with "done", "started", or "can't move". Choosing a day shows "This week after the swap" with the two lines. "Swap days" confirms and Cancel closes. On success the banner reads "Week updated. Next week is unchanged."
- **Errors.** A refusal is shown in place, using the server's words. A `conflict` adds a "Reload" action that re-reads the week. The phone never shows success before the server answers. Buttons disable while a request is in flight, and a ref guard stops double taps.
- **Freshness.** S1 is re-read when Today is shown and after any write. Every schedule write invalidates `today`, `today-insights`, `this-week`, the history weeks, and the plan. Every training write (start, finish, set) marks `this-week` stale.

**Differences from the web.** Skip and Train today use system alerts instead of dialogs, and Swap uses a page sheet with the web's radio list as rows. On the web, selecting another day hides Today's block. On the phone it does too, but the unfinished reminders stay visible because they are cross-day state. Otherwise the copy is the web's.

## 4. Tests

- **Web integration** (`tests/integration/mobile-schedule.int.test.ts`):
  - S1 matches `getThisWeek`. S1 is null with no active block.
  - S2 skips, a replay succeeds, and a finished, started, past, or other account's workout is refused or 404.
  - S3 trains today (then `POST /workouts` starts on today with `performedOn` = today and `scheduledFor` = the authored date). It swaps two workouts and swaps with a rest day. A replay is `unchanged`. A stale occupant is 409. A missed day waiting refuses a move.
  - Next week is unchanged. A web change shows in S1 and Today.
- **Isolation:** one case per endpoint (B on A's mesocycle, session, or occurrence → 404, and A's week is unchanged).
- **Registry and guards:** S1–S3 are registered. The contract assignability test covers `ThisWeekDto`.
- **Mobile unit:**
  - The week model: cell labels, accessibility sentences, which actions show, swap options and their disabled reasons, and the "after the swap" lines.
  - Screen tests: the strip renders, selecting a day previews it, Skip confirms and calls S2, Train today calls S3 then the start flow, Swap selects and confirms, a conflict offers Reload, and no strip appears with `week: null`.
- **Unverified by a run:** the feel on a device, the sheet on a small iPhone, and VoiceOver. These are owner checks in the 21i runbook (Check 3 and Check 4).

## 5. Acceptance

The OVE-241 ticket's acceptance list, plus:
- Skip, Train today, and Swap, including with a rest day, work on the phone. They survive a refresh and show the same on the web, and the reverse is also true.
- Completed, started, skipped, and past workouts can't be changed. A retry changes nothing.
- Missed-day handling, the unfinished-workout reminders, and the deload-week banner behave as before.
- No new native dependency. The runtime fingerprint is unchanged.
