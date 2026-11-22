---
version: 1.0.0
status: approved
author: Claude Code (unattended pipeline run, 2026-11-22)
last_updated: 2026-11-22
pitch_reference: docs/pitches/mvp-5b-mobile-app/21h-plans-library-gyms/pitch.md
design_reference: docs/pitches/mvp-5b-mobile-app/21h-plans-library-gyms/design.md
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
linear_issue: Linear milestone "Pitch 21h — Plans, Library & Gyms"
---

# Plans, Library & Gyms — Technical Specification

**Design:** `design.md` in this folder. Its §15 (Mobile design) is the binding native visual contract. There is no `preview.tsx`: step 3 is recorded as *Skipped — mobile-only pitch; native visual contract provided by the Mobile design section and `/overload-mobile-ui`.* The visual review artifact is the design canvas (RD-20).

## 1. Summary

Plans, Library & Gyms gives the iPhone app the training structure and personal resources around the workout: the active block with its dated week and its sessions (read-only), the exercise library with search, muscle filter, and favorites, custom exercise create and archive, and gym create and archive. It adds **nine account-scoped mobile API endpoint methods**, each a thin shell over the module the web already uses (`listExercises`, `getExercise`, `createCustomExercise`, `setExerciseFavorite`, `archiveExercise`/`restoreExercise`, `createGym`, `archiveGym`/`restoreGym`, and two plan reads composed from `getMesocycleWeek`, `getWeekSchedule`, and `getSessionDetail`).

The core abstraction is *the phone renders the server's plan*. The plan overview is one server-side view (`src/lib/views/plan.ts`) that takes the account's today (its time zone), the active block, and the existing effective-schedule rules, and returns a seven-day dated week plus the authored template. The phone does no schedule math. The two creates are the first users of 21c's `withIdempotency`, so a retried create returns the first answer and never a second row.

"Working" means: a lifter opens Plan and sees the same block, week number, deload weeks, and per-day states the web shows on Plan and History; opens a session and sees the authored exercises in order with the web's prescription text; searches the library and stars an exercise that the web then shows starred; adds a custom exercise or a gym from the phone and can use it in the next workout; archives one, and every past workout still names it. No plan row, logged row, or baseline is written by any of this, except the Exercise, ExerciseFavorite, Gym, and ApiIdempotencyKey rows the named actions create or change.

## 2. Problem

- The app cannot yet show the plan: the Plan tab is a web link (21d RD-12).
- The app cannot yet show an exercise's classification, image, or favorite state outside the swap picker, nor star one.
- The app cannot yet add a custom exercise or a gym, so a lifter at a new gym, or with a movement the library lacks, has to open the web before logging (Today's no-gym state links out).
- No mobile create endpoint exists, so 21c's idempotency mechanism has no caller yet.

This supports PRD journeys *Split & Mesocycle Setup* (reading the plan), *Exercise Library & Custom Exercises*, and *Gym Management*, on the phone. It unlocks 21i (exercise history, which hangs off the exercise detail screen) and 21l (a beta with plan reference on the phone).

## 3. Scope and non-scope

### In scope

- Plan overview (P1): active block summary and position, deload weeks, the dated effective week with a week stepper, the authored session list, counts of other blocks, empty state.
- Session (P2): authored exercises in order with prescription, bodyweight flag, Custom/Archived, the weekday's planned cardio.
- Library (L1): search, All/Favorites, primary-muscle filter, paging, star toggle.
- Exercise detail (X1) in three contexts (Plan, More, over the workout), with favorite and (own custom, not from a workout) archive with screen-scoped undo.
- New exercise (L2) and new gym (G3) modals, retry-safe.
- Gyms (G1) and gym (G2) with archive and undo.
- Workout card "About this exercise"; Today's no-gym state opens G3.
- Shared: `formatPrescription` (moved from the web component), additive DTO fields and new DTOs; web plan row uses the shared function.
- Development test-account profiles for every 21h scenario, a parity matrix, and the runbook.

### Out of scope

- Any plan write: create, edit, clone, activate, archive, reorder, rename, planned-cardio edits (web-only; pitch §11).
- Browsing archived or draft blocks on the phone (RD-4).
- Editing a custom exercise or a gym, an archived-items screen, baseline review or correction (none exists on the web; RD-7, RD-11).
- Exercise history, records, trend chart, goals (21i). The detail links to the web for history.
- Tour step or release note (RD-19).
- User-uploaded images, maps, GPS, geocoding, location permission (permanent or deferred per pitch §11).

## 4. Core concepts

| Concept | Description |
| --- | --- |
| Plan overview | A read composed on the server: the active `Mesocycle` (at most one), its authored template, and one dated mesocycle week of the effective schedule, in the account's time zone. Derived, never stored. |
| Block position | `upcoming` (today before the start date), `running` (week n of L, and whether n is a scheduled-deload week), or `ended` (today after the planned end). From `mesocycleWeekForDate` and `plannedEndDate`. |
| Deload weeks | Every week w in 1..L with `isScheduledDeloadWeek(w, deloadEveryWeeks)`. Computed on the server and sent as a list. |
| Plan week | Seven calendar days of one block week (start + 7(n−1) … +6). Each day carries zero or more effective occurrences (a shift can put two on one day) and the day's cardio occurrences, from `getWeekSchedule` unchanged. Rest = a day with no occurrence. |
| Authored template | The block's sessions by ISO weekday plus unscheduled sessions (`getMesocycleWeek`), with each weekday's planned cardio. |
| Planned exercise | A `SessionExercise` as authored. Gains a derived `requiresExternalWeight` (false only for bodyweight equipment, `requiresExternalWeight` in `@overload/shared/exercises/loading-mode`). |
| Favorite | An `ExerciseFavorite` row (owned, unique per account and exercise). Exists since Multi-User Foundation (spec R12). The shared `Exercise.isFavorite` column stays unread and unwritten. |
| Custom exercise | An `Exercise` with `isCustom = true` and the account's `userId`; no image (DB CHECK). Archive sets `deletedAt` only. |
| Gym | A `Gym` row: name and an optional free-text address. Archive sets `deletedAt` only. No baseline is created, read, or written by these actions. |
| Create intent | One user decision to save a form. The app sends one `Idempotency-Key` per intent and reuses it on a retry of the same values. |

## 5. States and lifecycle

| Object | From | To | Allowed? | Side effects |
| --- | --- | --- | --- | --- |
| `Exercise` (own custom) | — | active | yes (POST /exercises) | one Exercise row; one ApiIdempotencyKey row, same transaction |
| `Exercise` (own custom) | active | archived | yes (PUT …/archived true) | `deletedAt` set; favorite row kept (spec D11); history, plan slots, goals, baselines untouched |
| `Exercise` (own custom) | archived | active | yes (PUT …/archived false), offered only as the screen's Undo | `deletedAt` cleared |
| `Exercise` (library) | any | any | **no**: `not_found` | none |
| `ExerciseFavorite` | absent ↔ present | | yes, active exercises only; archived → `invalid_state_transition` | idempotent insert/delete |
| `Gym` | — | active | yes (POST /gyms) | one Gym row; one ApiIdempotencyKey row; **no** GymExerciseBaseline |
| `Gym` | active ↔ archived | | yes (PUT …/archived), restore only as Undo | `deletedAt` only |
| Plan, session, logged rows | — | — | read only | none |

The archive write is idempotent and absolute (`archived: true|false`), so a retry writes nothing more (RD-9).

## 6. Mobile API contract

All under `/api/mobile/v1`, built with `mobileRoute` (version gate → token → account → suspension → rate limit → handler → JSON or the error envelope). The account is the verified token's. Every endpoint is **Free** (no capability). None calls a progression reader, gated or ungated. All are additive: no existing response changes shape, and the minimum app version stays as configured.

| # | Method and path | Module(s) | Request | Success | Errors | Retry |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | `GET /plan?week=n` | `getPlanOverview` (new view) | `week` optional integer; clamped to 1..L; anything else → current week | 200 `PlanOverviewDto` | — | read |
| E2 | `GET /mesocycles/{mesocycleId}/sessions/{sessionId}` | `getPlanSession` (new view over `getSessionDetail`) | — | 200 `PlanSessionDto` | 404 `not_found` (missing, other account, or ids that don't belong together) | read |
| E3 | `GET /exercises?view=&muscle=&q=&limit=` | `parseLibraryParams` + `listExercises` | the web's params, tolerant | 200 `ExerciseList` | — | read |
| E4 | `GET /exercises/{exerciseId}` | `getExercise` (resolves archived) | — | 200 `ExerciseDetailDto` | 404 | read |
| E5 | `POST /exercises` + `Idempotency-Key` | `withIdempotency` + `createCustomExercise` | `CreateCustomExerciseRequest` | **201** `ExerciseDetailDto` | 400 `validation_error` (fields in `details`, or a missing/invalid key), 409 `conflict` (key reused with a different body) | key replay: same status and body, `Idempotent-Replayed: true` |
| E6 | `PUT /exercises/{exerciseId}/favorite` | `setExerciseFavorite` | `SetFavoriteRequest` | 200 `SetFavoriteResponseDto` | 400, 404, 409 `invalid_state_transition` (archived) | absolute |
| E7 | `PUT /exercises/{exerciseId}/archived` | `archiveExercise` / `restoreExercise` | `SetArchivedRequest` | 200 `SetArchivedResponseDto` | 400, 404 (library or another account's) | absolute |
| E8 | `POST /gyms` + `Idempotency-Key` | `withIdempotency` + `createGym` | `CreateGymRequest` | **201** `GymListItemDto` | 400, 409 | key replay |
| E9 | `PUT /gyms/{gymId}/archived` | `archiveGym` / `restoreGym` | `SetArchivedRequest` | 200 `SetArchivedResponseDto` | 400, 404 | absolute |

Bodies are read with `readJsonObject` under a 4 KB cap (`RESOURCE_BODY_LIMIT`). Shapes are checked in the adapter (`typeof` only); every rule stays in the module. Idempotency scopes: `"POST /v1/exercises"`, `"POST /v1/gyms"`. The existing `GET /gyms` is reused unchanged for G1/G2 and the start flow.

### Shared contracts (`packages/shared/src/contracts`)

```ts
// plan.ts (additive)
export type PlannedExerciseDto = { /* existing fields */ requiresExternalWeight: boolean };

export type PlanBlockPosition =
  | { kind: "upcoming"; startsOn: string }      // IsoDate
  | { kind: "running"; week: number; scheduledDeloadWeek: boolean }
  | { kind: "ended"; endedOn: string };

export type PlanDaySessionDto = {
  sessionId: string;
  sessionName: string;
  state: WeekDayState;                 // History's server states
  loggedSessionId: string | null;
};

export type PlanDayDto = {
  dateIso: string;
  dayLabel: string;                    // "Mon, Nov 16"
  isToday: boolean;
  sessions: PlanDaySessionDto[];       // empty = rest day
  cardio: CardioOccurrenceDto[];
};

export type PlanWeekDto = {
  weekNumber: number;
  lengthWeeks: number;
  rangeLabel: string;
  scheduledDeloadWeek: boolean;
  isCurrentWeek: boolean;
  days: PlanDayDto[];                  // always 7, in date order
};

export type PlanBlockDto = {
  summary: MesocycleSummaryDto;
  position: PlanBlockPosition;
  deloadWeeks: number[];
  /** Index 0 = Monday … 6 = Sunday (the web plan page's template). */
  template: (SessionSummaryDto | null)[];
  templateCardio: (PlannedCardioDto | null)[];
  unscheduled: SessionSummaryDto[];
  week: PlanWeekDto;
};

/** `GET /plan`. */
export type PlanOverviewDto = {
  today: string;
  block: PlanBlockDto | null;
  otherBlocks: { drafts: number; previous: number };
};

/** `GET /mesocycles/{id}/sessions/{id}`. */
export type PlanSessionDto = Omit<SessionDetailDto, "occupancy"> & {
  cardio: PlannedCardioDto | null;     // the session's weekday; null when unscheduled
};

// exercises.ts
export type SetFavoriteResponseDto = { id: string; isFavorite: boolean };
export type SetArchivedResponseDto = { id: string; archived: boolean };

// requests.ts
export type SetArchivedRequest = { archived: boolean };
```

`WeekDayState` and `CardioOccurrenceDto` are imported from the existing contracts. `CreateCustomExerciseRequest`, `CreateGymRequest`, and `SetFavoriteRequest` already exist (21b) and are used as written.

### Server modules

| Module | New / changed | Notes |
| --- | --- | --- |
| `src/lib/views/plan.ts` | new | `getPlanOverview(account, week?)`, `getPlanSession(account, mesocycleId, sessionId)`; reads only, scoped client |
| `src/lib/plan/week-grid.ts` | new, pure | `planWeekDays(weekStart, today, days, cardio)`, `blockPosition(...)`, `deloadWeeksOf(L, N)`; unit-tested |
| `src/lib/plan/queries.ts` | changed | `toPlannedExercise` adds `requiresExternalWeight` |
| `src/lib/exercises/queries.ts` | changed | export `toExerciseDetail(row, isFavorite)` used by `getExercise` and by E5 (the created row is read inside the transaction, so a read outside it would miss it) |
| `src/lib/api/mobile/resources.ts` | new | adapters `readPlan`, `readPlanSession`, `readExercises`, `readExercise`, `createExerciseFromRequest`, `setFavoriteFromRequest`, `setExerciseArchivedFromRequest`, `createGymFromRequest`, `setGymArchivedFromRequest` |
| 9 route files | new | `exercises/route.ts` (GET, POST), `exercises/[exerciseId]/route.ts`, `…/favorite`, `…/archived`, `gyms/route.ts` (adds POST), `gyms/[gymId]/archived`, `plan/route.ts`, `mesocycles/[mesocycleId]/sessions/[sessionId]/route.ts` |
| `tests/support/mobile-endpoints.ts` | changed | the nine entries |

`getPlanOverview` reads: the active block id (`findFirst status active`), two counts (draft, archived), then `getMesocycleWeek` and `getWeekSchedule(account, week)` in parallel. It does not read `listMesocyclesForHome` (the whole plan graph of every block).

## 7. UI integration

### Screen → endpoint map

| Screen | Route (`apps/mobile/src/app`) | Reads | Writes |
| --- | --- | --- | --- |
| P1 Plan | `(tabs)/plan/index` | E1 | — |
| P2 Session | `(tabs)/plan/session/[sessionId]?mesocycleId=` | E2 | — |
| X1 from Plan | `(tabs)/plan/exercise/[exerciseId]` | E4 | E6, E7 |
| L1 Library | `(tabs)/more/exercises/index` | E3 | E6 |
| X1 from More | `(tabs)/more/exercises/[exerciseId]` | E4 | E6, E7 |
| X1 over a workout | `exercise/[exerciseId]` (root stack, `context=workout`) | E4 | E6 |
| L2 New exercise | `exercise-new` (root modal) | — | E5 |
| G1 Gyms | `(tabs)/more/gyms/index` | `GET /gyms` | — |
| G2 Gym | `(tabs)/more/gyms/[gymId]` | `GET /gyms` (cache) | E9 |
| G3 New gym | `gym-new` (root modal) | — | E8 |
| Today no-gym | existing | — | opens G3 |
| Workout card | existing | — | opens X1 |

### Data layer (`apps/mobile/src/api/resources.ts`)

- `RESOURCE_KEYS`: `plan(week|null)` → `["plan", week ?? "current"]`; `planSession(m, s)`; `exercises(filters)` → `["exercises", view, muscle, q, limit]`; `exercise(id)`; gyms reuse `TRAINING_KEYS.gyms` (`["gyms"]`, the start flow's key).
- `usePlan(week)` with `keepPreviousData`, `staleTime: OVERVIEW_STALE_MS`, and a re-read on focus; `markTrainingStale` and `invalidateTraining` also mark `["plan"]` stale (no refetch), so a logged set changes the day chips on the next view.
- `useExercises(filters)` with `keepPreviousData`; the search text is debounced 300 ms in the screen.
- `useToggleFavorite`: optimistic `setQueryData` on every cached `["exercises"]` list and `["exercise", id]`; on error restore the snapshot; on settle invalidate `["exercises"]`, `["exercise", id]`, and `["swap"]` (favorites sort first in the picker).
- `useCreateExercise`, `useCreateGym`: `POST` with the `Idempotency-Key` header; on success invalidate `["exercises"]` and `["swap"]` (exercise) or `["gyms"]` (gym).
- `useSetExerciseArchived`, `useSetGymArchived`: on success update the detail cache and invalidate `["exercises"]`, `["swap"]`, `["plan-session"]`, `["plan"]` (exercise) or `["gyms"]` (gym).
- The client's `RequestOptions` gains `headers?: Record<string, string>` (merged after the defaults; cannot override Authorization or the version header).
- `newIdempotencyKey()` (`src/api/idempotency.ts`): `ovl-<time36>-<16 random base36>`, within the server's `[A-Za-z0-9._:-]{8,255}`. `useIntentKey(values)` returns the same key while the serialized values are unchanged and a new one when they change.

### Pure models (no I/O, unit-tested)

- `plan/plan-model.ts`: `positionLine(position, summary)`, `cadenceLine(summary, deloadWeeks)`, `dayRows(week)` (labels, chips from History's words, accessibility labels), `stepper(week)`.
- `plan/session-model.ts`: `plannedRow(e)` → title, prescription (shared `formatPrescription`), detail line ("Chest · Barbell" / "Bodyweight · reps only"), chips, archived note.
- `library/library-model.ts`: `countLine(list)`, `emptyStateFor(list, filters)` (the four empties), `nextLimit(limit)` (+50, max 1000).
- `library/exercise-model.ts`: `detailActions(detail, context)` → `{ favorite: boolean, archive: boolean }`.
- `ui/notice-store.ts`: a tiny in-memory store for the "Added X." notice the modals leave for L1/G1 (cleared on sign-out with the Pro-note store).

### Components

As design §10. `ChipGroup` (single or multi select, wrapping or one scrolling row) serves the muscle filter and the two form grids. `ExerciseImage` renders RN `Image` (`resizeMode="contain"`) and falls back to a letter tile on a null URL or a load error. Shared History day-state words and tones move from `HistoryScreen.tsx` to `history/day-state.ts` and both screens import them.

### Interaction details

- X1's archive is hidden when `context=workout` and when the exercise is not the account's own (`canArchive`) or already archived; the favorite button is hidden when archived.
- After an archive, X1 and G2 keep a local snapshot showing "Archived" with Undo; Undo calls the same endpoint with `archived: false`. Leaving the screen ends the undo window.
- L2/G3 validate with the shared parsers before sending; server `details` map to the same fields; a non-field failure is one `Banner` with the 21f wording (`changeFailureMessage`).
- The workout card's ••• sheet gets `"details"` ("About this exercise") first in every state; it pushes `/exercise/{performedExerciseId}?context=workout` and calls no write.
- More's "Exercises" and "Gyms" rows push the native screens (chevron, not external).

### Client scope and platform impact

Mobile (iOS) plus one shared-copy move on the web. See design §14. The admin area is untouched.

### User guidance

None in 21h (RD-19).

## 8. Data model

**No migration, no new table, no schema change.** Every row 21h writes already has a table with RLS enabled and scope-layer and isolation coverage: `Exercise` (custom), `ExerciseFavorite`, `Gym`, `ApiIdempotencyKey` (21c).

| Field / concept | Stored? | Computed from |
| --- | --- | --- |
| Block position, deload weeks, plan week, rest days, `isToday` | no | block dates, cadence, account today, effective schedule |
| `requiresExternalWeight` | no | `equipmentType` |
| Favorite | yes (`ExerciseFavorite`) | lifter's toggle |

## 9. Authorization and access control

- Every handler gets the account from the verified token; no id in a body or query is an account id.
- Reads and writes run on `account.db`. Another account's mesocycle, session, custom exercise, or gym is `not_found`, identical to a missing one. A library exercise is readable and favoritable by every account, and never archivable (`requireOwnCustom` → `not_found`).
- An `Idempotency-Key` is per account (scoped client, `(user_id, key)` unique): reusing another account's key creates this account's row and reveals nothing.
- Suspended accounts: 403 on every new endpoint (pipeline). Version gate: 426 below the minimum.
- No new endpoint returns Pro data. A static guard (existing, `no ungated builder in mobile handlers`) still applies; a new isolation test asserts a Free account receives the same E1–E4 bodies as Pro.

## 10. Validation rules

| Field | Rule (module) | Error |
| --- | --- | --- |
| `name` (exercise) | trimmed, 1–100 | `validation_error`, `details.name` |
| `primaryMuscle` | one of the 16 | `details.primaryMuscle` |
| `equipmentType` | one of the 13 | `details.equipmentType` |
| `secondaryMuscles` | array of muscles, unique, ≤15, not the primary | `details.secondaryMuscles` |
| `name` (gym) | trimmed, 1–80 | `details.name` |
| `address` | null or string ≤200 | `details.address` |
| `isFavorite`, `archived` | boolean | `validation_error` with the field in `details` |
| `Idempotency-Key` | `[A-Za-z0-9._:-]{8,255}` | `validation_error`, `details["Idempotency-Key"]` |
| `week` | integer; otherwise ignored | — |
| ids | UUID; otherwise `not_found` | — |

Duplicate names are allowed (no duplicate detection exists on the web; RD-8).

## 11. Development-only test accounts

Extends `npm run dev:test-account` (21f OVE-219; 21g). Guards unchanged: `overload-dev` only, `--confirm-ref vdxrmfadikwzodjljbdi`, test-domain emails, refuses accounts holding other data, password file in `~/.overload-dev/accounts`, no delete or reset.

| Scenario | Profile | What it holds | New? |
| --- | --- | --- | --- |
| A Active plan | `standard` | Strength Block 2 active, week 4 of 6, deload every 6 (week 6); four sessions Mon/Tue/Thu/Fri; Strength Block 1 archived | reuse |
| A′ Deload placement | `scheduled-deload` | today in a deload week | reuse |
| B No active plan | `no-plan` | an account with a profile and no training data | new (no seed) |
| C Detailed session | `session-detail` | Upper A with Bench 3×6–8, Pullups 3×8–10 (bodyweight), Incline DB 3×10 (fixed), Crunches 3×15 (bodyweight, fixed), plus planned cardio | new variant (bodyweight + cardio) |
| D Library and favorites | `library` | standard, plus favorites on Barbell Bench Press, Barbell Squat, Side Lateral Raise, and one custom exercise "Landmine Press" (favorited) | new (resources) |
| E Custom exercises | `custom-exercises` | anchored yesterday: yesterday's Upper A had OHP swapped to custom "Landmine Press", 3 sets logged, finished; plus "Banded Face Pull" (active) and "Cable Y Raise" (archived) | new (resources) |
| F Gyms | `gyms` | the `gym` story (machines at Northside and Riverside, Harbor Barbell empty), plus "Downtown Annex" with a location, and Riverside Fitness archived (its history kept) | new (resources) |
| G Active workout | `recovery` | today's Upper A started, Bench sets 1–2 saved | reuse |
| H Isolation | `isolation-resources-a`, `isolation-resources-b` | distinct custom exercises, favorites, and gyms per account | new (resources) |

**Resource step.** A profile may name a resource plan (`scripts/dev-test-account/resources.ts`, pure description). After the demo seed, it is applied in **one transaction** through the real write modules only: `createCustomExercise`, `setExerciseFavorite`, `archiveExercise`, `createGym`, `archiveGym`, and for `custom-exercises` `swapExercise`, `logSet`, `completeWorkout` on the seeded in-progress workout (the `recovery` variant anchored yesterday). No row is inserted any other way. A re-run on a seeded account skips both steps.

**Resource check.** After seeding, the command prints the authoritative reads (the plan view's block and week, `listExercises` favorites and own custom exercises, `listActiveGyms`, archived names) and fails with exit 2 on a mismatch with the plan, like the 21g engine check. The integration test runs each new profile against the test database.

## 12. Testing strategy

### API — `apps/web/tests/integration/mobile-plans-library-gyms.int.test.ts` (new; route handlers, real DB)

```text
GIVEN an active block started 2 weeks ago WHEN GET /plan THEN position running week 3, deloadWeeks = [N, 2N…≤L], 7 days in date order, today marked once, rest days have no sessions, template by weekday, otherBlocks counts drafts and archived
GIVEN ?week=1, ?week=999, ?week=abc THEN week 1, week L, the current week
GIVEN a shifted missed day THEN the shifted session sits on its effective date with state "shifted" and the original day is rest
GIVEN a block starting next week / one that ended THEN position upcoming / ended
GIVEN no active block (with a draft and an archived one) THEN block null, otherBlocks {1,1}
GIVEN planned cardio on a weekday THEN templateCardio has it and the week's day carries its occurrence
GIVEN GET /plan and GET session THEN the account's table snapshot is unchanged (no writes)
GIVEN a session WHEN GET session THEN exercises in position order, fixed target min=max, bodyweight requiresExternalWeight false, archived slot isArchived, the weekday's cardio
GIVEN mismatched mesocycle/session ids THEN 404
GIVEN GET /exercises?q=bench press THEN every word matched; ?q=% and ?q=_ are literal; ?muscle=chest primary only; ?view=favorites only favorites; limit paging total stays
GIVEN an archived custom exercise THEN absent from E3, present in E4 with isArchived
GIVEN POST /exercises with a key THEN 201 detail isCustom, no image; same key and body → same body, Idempotent-Replayed, one row; same key other body → 409; no key → 400; invalid fields → 400 with details and no row and no key row
GIVEN a created custom exercise THEN it appears in E3 and in swap-candidates for its muscle
GIVEN PUT favorite true twice THEN one row; false twice THEN none; on an archived exercise → 409; B's favorites unaffected
GIVEN PUT archived true on a library exercise → 404 and nothing changes; on own custom THEN deletedAt set; history GET /history/{id} still names it and flags it archived; the plan session shows isArchived; false restores
GIVEN POST /gyms THEN 201, replay-safe; GET /gyms lists it; POST /workouts with it starts; no GymExerciseBaseline row is created
GIVEN PUT gyms/{id}/archived true THEN hidden from GET /gyms; a past workout at it still shows its name; every GymExerciseBaseline row is unchanged
GIVEN a Free account THEN E1–E4 bodies have the same shape as Pro and contain no progression field
```

### Isolation — `tests/integration/isolation/mobile-api.int.test.ts`

Each of the nine new registry entries gets `accountEndpointMatrix` plus cross-account cases: B reading A's block, session, custom exercise (by id, by list, by search for its name) gets nothing of A (`aMarkers` absent); B favoriting, archiving, or restoring A's custom exercise or gym gets 404 and A's rows are unchanged (`snapshotAccount`); B's create with A's idempotency key creates B's own row. The coverage test fails if an entry has no case.

### Fixtures — `tests/integration/dev-test-account-profiles.int.test.ts`

Each new profile seeds and passes its resource check; `custom-exercises` has the custom exercise in a finished workout's performed exercise; `gyms` has an archived gym that still resolves in a past workout; the demo-seed statement budget (<2,500) holds for `session-detail`.

### Static guards and contracts

The registry/route parity test (existing) covers the nine. The workout-lock guard is unaffected (no new LoggedSession/LoggedExercise/LoggedSet writer outside the existing modules; the fixture's resource step calls the modules).

### Web unit

`formatPrescription` cases; the web plan row prints the identical string; `week-grid.ts` pure cases (seven days, two sessions on one day, cardio placement, today flag, deload weeks for N > L, position boundaries at start and end dates).

### Mobile (`apps/mobile/tests`)

- `plan.test.tsx`: P1 active, upcoming, ended, no plan (with and without drafts), loading, error; the stepper fetches `?week=` and keeps the old week visible; day rows' labels and chips; tapping a session pushes P2; no request other than GET.
- `session.test.tsx`: order, prescriptions, bodyweight line, Custom/Archived, cardio row, not found; a row pushes X1.
- `library.test.tsx`: search debounce and request params; favorites view; muscle chip; Show more; the four empty states; the star is optimistic and reverts with a banner on failure; More's rows push native screens.
- `exercise-detail.test.tsx`: contexts (archive hidden from a workout, for library rows, when archived); archive confirm → PUT → Archived + Undo → PUT false.
- `new-exercise.test.tsx`: shared validation messages, primary removed from secondaries, Save sends the key; a timeout then Save resends the **same** key; changing a field after a failure sends a **new** key; server field errors map; success leaves the notice.
- `gyms.test.tsx`: list, empty, detail, archive and undo, new gym form (same key rules), Today's no-gym action opens G3.
- `workout-details.test.tsx`: the ••• sheet lists "About this exercise" in every state; choosing it pushes the route and sends no request.
- `idempotency.test.ts`: key format, uniqueness, `useIntentKey` stability.
- Fingerprint test unchanged and green (no native input changes).

### Unverified by a run (owner checks)

Everything on a device or simulator: layout, Dynamic Type, VoiceOver, dark mode, keyboard, haptics, image loading over the network, backgrounding, and a real network failure. Listed in the runbook.

## 13. Acceptance criteria

**Plan (A, B)**
- [ ] The Plan tab shows the active block's name, dates, "Week n of L" (or upcoming/ended), deload cadence with the deload weeks, split, and session count, matching the web plan page.
- [ ] The week list has seven dated days, today marked, rest days plain, each session with History's state word; the stepper walks 1..L.
- [ ] No active plan shows the empty state with the web link and the draft count when drafts exist.

**Session (B)**
- [ ] Exercises in plan order with the web's prescription text; fixed targets print one number; bodyweight reads "reps only"; archived slots marked; the weekday's planned cardio shown.
- [ ] Opening a session or an exercise from it writes nothing.

**Library and favorites (C, D)**
- [ ] Search, All/Favorites, and the muscle filter return the web's results for the same inputs; custom exercises marked; archived ones absent.
- [ ] Starring on the phone shows on the web and vice versa; another account sees no change.

**Custom exercises (E)**
- [ ] A new custom exercise saved on the phone appears in the phone and web libraries and in the swap picker; a retried save creates one.
- [ ] Archiving one leaves past workouts and plans naming it; only own custom exercises offer Archive.

**Gyms (F)**
- [ ] A gym added on the phone appears on the web and in the start-workout sheet; a retried save creates one; archiving hides it from pickers and keeps it in past workouts; no baseline changes.

**Workout and Today (G)**
- [ ] "About this exercise" opens the performed exercise over the workout and back returns with typed values intact; nothing is saved or swapped.
- [ ] Today's no-gym state adds a gym natively.

**Security (I)**
- [ ] All nine endpoints pass the isolation matrix and the cross-account cases; library exercises cannot be archived; creates are retry-safe; no Pro field appears.

## 14. Explicit non-goals

- ❌ Native plan building or editing. **Deferred** (web-only; roadmap).
- ❌ Archived/draft block browsing on the phone. **Deferred** (RD-4).
- ❌ Editing custom exercises or gyms; archived-items screen. **Deferred** pending an upstream decision (Library & Gyms Setup D12).
- ❌ Exercise history, records, chart, goals. **Deferred** to 21i.
- ❌ Maps, GPS, geocoding, location permission for gyms. **Deferred** (location-aware phase).
- ❌ User-uploaded exercise images, videos. **Permanent for this build.**
- ❌ Program generation, AI coach, social, ads, purchase flow in the app. **Permanent.**

## Resolved Decisions

| # | Decision | Rationale | Authority |
| --- | --- | --- | --- |
| RD-1 | Plan lives in the existing Plan tab (P1 → P2 → X1); the library and gyms live under More (replacing the two web links). The tab bar is unchanged. | Keeps Today, History, and the workout one tap away; More already listed Exercises and Gyms. | Pitch Q1; 21d tab shell; design §4 |
| RD-2 | P1 shows the dated **effective** week (server, account time zone, shifts applied) first, then the **authored** template. | The pitch asks for the current week and day; the web shows the template on Plan and the effective week on History. Both are the same data in the same words. | Pitch Q2; `getWeekSchedule`, `getMesocycleWeek` |
| RD-3 | Week states use History's words (`STATE_LABEL`), including "Upcoming" for a past unresolved day. A clearer wording for that case on all three surfaces is an owner follow-up. | A third wording would create drift; Today's missed-day prompt handles that day. | Pitch §10.8; parity policy (21g) |
| RD-4 | Only the active block is browsable on the phone; drafts and earlier blocks are counted with a web link. | Roadmap scope is "read-only plan, week, and session views"; History already covers earlier logged workouts. | Pitch Q3; mobile roadmap 21h |
| RD-5 | Planned cardio shows type and minutes on the week day and on the session for its weekday, worded "Planned", never as a record. | Cardio is type and duration only. | Pitch Q4; CLAUDE.md cardio rule |
| RD-6 | Library fields and filters are the web's exactly: name search (every word), All/Favorites, primary muscle; page size 50, max 1000. | No new classification. | Pitch Q5; `library-params.ts` |
| RD-7 | Favorites reuse the existing owned `ExerciseFavorite` table and `setExerciseFavorite`. No migration. | Favorites already persist per account (Multi-User Foundation R12); the pitch's possible gap does not exist. | Pitch Q6, Q17; schema |
| RD-8 | Custom exercises: create (name, primary, equipment, secondaries) and archive with undo, exactly as the web. **No edit.** Duplicate names allowed. | The web has no edit; Library & Gyms Setup D12 deferred editing pending an upstream amendment; building it would be a new management model. | Pitch Q7, §4; Pitch 02 spec D12 |
| RD-9 | Archive endpoints take an absolute `{archived: boolean}`; restore is offered only as the screen's Undo. | Retry-safe by value; the web's only unarchive is Undo (D30). | 21f absolute-write convention; Pitch 02 D30 |
| RD-10 | Custom exercises have no image; the phone shows a letter tile in lists and no image block on detail. | No upload path; DB CHECK. | Pitch Q8; Architecture |
| RD-11 | Gyms: name and optional free-text location; create and archive with undo; **no edit**; no baseline review. | The web has exactly these; baselines are maintained only by logging. | Pitch Q9, Q11; Pitch 02 D18 |
| RD-12 | Archived gyms and exercises keep resolving in History and plans by name with "Archived" where the existing reads already mark them. | Existing read rules (no `deletedAt` filter on history reads). | Pitch Q10; CLAUDE.md Layer 1 |
| RD-13 | From a workout, "About this exercise" stacks X1 over the workout on the root stack, with favorite but no archive and no swap. | The workout stays mounted (drafts kept); passive browsing never acts on the workout. | Pitch Q12, §5.12 |
| RD-14 | Nine additive endpoint methods (E1–E9); `GET /gyms` reused; no endpoint for gym detail (G2 reads the list cache). | Minimum additive surface. | Pitch Q13; 21c RD-12 |
| RD-15 | Everything in 21h is Free; E1–E4 carry no progression field; the exercise detail omits history (21i). | Plan placement in the pitch; capture and reference are Free. | Pitch Q14, §7 |
| RD-16 | Reuse: `getMesocycleWeek`, `getWeekSchedule`, `getSessionDetail`, `listExercises`, `getExercise`, the write modules, `GET /gyms`, the start flow's gym sheet, the swap picker (unchanged). | No competing implementation. | Pitch Q15 |
| RD-17 | Scope fits Medium: no plan writes, no new model, existing modules. | Inspection of current code. | Pitch Q16 |
| RD-18 | No owner-approval boundary is crossed: no migration, no destructive operation, no location permission, no Production step. | — | Pitch Q17; CLAUDE.md stop conditions |
| RD-19 | No tour step or release note (native tour is 21k; What's New in the app is 21j). | As 21g. | Pitch Q-none; 21g RD |
| RD-20 | Visual review artifact: the design canvas https://claude.ai/artifact/AUnjRRijnmme7T6kKDr23Q (light and dark, illustrative data; private to the owner). | Pipeline guide step 3 for mobile-only slices. | Pipeline guide §5 |
| RD-21 | Creates send one `Idempotency-Key` per intent: same values → same key on retry; changed values → new key. | Matches 21c's semantics (same key + different body = 409). | 21c spec §12 |
| RD-22 | In-content search field, segmented control, chip rows, and a star button instead of a header search bar, pickers, or swipe actions. | Testable, consistent with existing fields, no hidden gestures, no native dependency. | overload-mobile-ui |
| RD-23 | The prescription string moves to `@overload/shared/plan/rep-target` (`formatPrescription`); the web row imports it. Identical output. | One wording for both clients. | Parity policy |
| RD-24 | Fixtures: reuse `standard`, `scheduled-deload`, `recovery`; add `no-plan`, `session-detail`, `library`, `custom-exercises`, `gyms`, `isolation-resources-a/b`; resources applied through the write modules in one transaction. | Pitch §14: no identical accounts relabelled; real domain logic. | Pitch §14; 21f RD-26 |
| RD-25 | Tickets are end-to-end per capability (plan; library and detail; favorites and custom exercises; gyms; fixtures, parity, and acceptance), stacked on the feature branch. | The run prompt asks for end-to-end tickets rather than area halves. | Run prompt §10 |

## Open Questions

1. **(Owner, non-blocking)** Should custom exercises and gyms become editable (name; gym location)? The PRD journey mentions renaming a custom exercise; Library & Gyms Setup deferred it pending an upstream amendment, and 21h keeps parity with the web by not adding it.
2. **(Owner, non-blocking)** Should a past day with nothing logged read "Not logged" instead of "Upcoming" on History (web and phone) and the plan week? Default: unchanged.

## 15. Future considerations

- 21i hangs exercise history and goals off X1 (the "History and records" row becomes native).
- Archived/draft block browsing can reuse E2 and a block-scoped variant of E1 without a contract break (`PlanOverviewDto` is an object).
- If editing is approved, `PATCH /exercises/{id}` and `PATCH /gyms/{id}` are absolute writes and need no idempotency key.
