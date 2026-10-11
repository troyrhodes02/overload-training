---
version: 1.0.0
status: approved
author: Autonomous pipeline run (Claude)
last_updated: 2026-10-11
pitch_reference: pitches/04-guided-workout-logging.md
design_reference: docs/design/04-guided-workout-logging-design-doc.md
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
ui_preview_reference: docs/previews/04-guided-workout-logging-preview.tsx
linear_issue: (milestone "Guided Workout Logging", Overload V1)
---

# Guided Workout Logging — Technical Specification

## 2. Summary

Guided Workout Logging turns a planned `Session` into a `LoggedSession`: the authored plan is read-only input, and everything the lifter does produces `LoggedExercise` and `LoggedSet` rows through one controlled write path. Nothing about progress, e1RM, or deload is computed or stored here — this pitch records facts; Pitch 5 interprets them.

The core abstractions are: (1) a **LoggedSession** keyed to exactly one planned occurrence (a `Session` on a specific authored calendar date) with an explicit `status`; (2) a **controlled write module** `src/lib/logging/logged-sets.ts` that is the only code allowed to create/update a `LoggedSet`, and which — in the same transaction as the set write that completes an exercise — establishes or corrects that gym's `GymExerciseBaseline` for gym-variable exercises; and (3) an **effective-schedule** module that derives the real training calendar from the authored `Mesocycle` plus dated `MissedDayResolution` records, without ever mutating the plan.

"Working" means: a set entered at Downtown Gym is saved exactly as typed; the gym baseline for a machine is established on first use and corrected (same transaction) only when the session's median working weight deviates ≥ 15%; a missed Friday can be logged late, shifted, or skipped and never re-prompts incorrectly; a mistyped weight is correctable from History; and no progression value is ever stored.

## 3. Problem

- The app cannot yet record a set against the gym it was performed at, so a machine's weight at two gyms collapses into one number.
- The app cannot yet persist what the lifter actually did against the plan, so Pitch 5 has nothing trustworthy to evaluate.
- The app cannot yet tell that a planned day was missed, so it would show that day's plan forever.
- The app cannot yet substitute an unavailable or archived planned exercise without corrupting the plan or the history.
- The app cannot yet correct a data-entry mistake in a past set.

This pitch produces the trustworthy source data that unlocks Progressive Overload Engine (Pitch 5) and Goals (Pitch 6).

## 4. Scope and non-scope

### In scope
Dashboard today-states (pending / in-progress / complete / rest) and the missed-day prompt; starting/resuming a `LoggedSession` idempotently; workout-level gym selection with lock-after-first-set; guided per-exercise set logging with positive weight/reps validation; partial persistence and resume; exercise and day completion (explicit, atomic); same-primary-muscle Exercise Swap (locked after first set; required for archived planned exercises); dated missed-day resolution (log-late / shift / skip) with current-week-only shift and end-of-week drop; gym-variable baseline establishment and ≥15% correction, isolated per gym+exercise, atomic with the completing set write; week-at-a-glance history, logged-workout detail, and past-log weight/reps correction; logged-history integrity (Restrict, archival readable).

### Out of scope
Progress/hold/deload tags, e1RM, trends, charts, next-weight recommendations (**Pitch 5**); scheduled-deload load reduction (**Pitch 5**); goals and goal percentage (**Pitch 6**); LoggedSet deletion / whole-workout deletion (**permanent**); editing exercise identity, gym, date, planned slot, or a missed-day resolution after confirmation (**not approved here**); extra/ad-hoc sets and warm-up sets (**Pitch 4 default: planned working sets only**); "save swap to template" / any plan mutation (**permanent for logging**); auto-resolving missed days (**permanent**); GPS/geolocation/implicit gym creation (**permanent**); RPE/RIR (**deferred**); cardio (**Pitch 7**).

## 5. Core concepts

| Concept | Description |
| ------- | ----------- |
| Planned occurrence | A scheduled `Session` (non-null `dayOfWeek`) on one authored calendar date within the active `Mesocycle`. Its stable identity is `(sessionId, authoredDate)`. `authoredDate` = the unique date within mesocycle week *w* whose ISO weekday equals `session.dayOfWeek`. |
| `LoggedSession` | The record of training on one planned occurrence. At most one per occurrence (idempotent). Carries `scheduledFor` (= `authoredDate`, the identity key), `status`, and nullable `completedAt`. |
| `LoggedExercise` | One performed exercise occurrence inside a `LoggedSession`, created from a `SessionExercise` at start. Records the **performed** `exerciseId` (changes on swap) plus a snapshot of plan context: `plannedExerciseId`, `plannedSets`, `targetRepMin`, `targetRepMax`, and `sessionExerciseId`. |
| `LoggedSet` | One weight-and-reps entry (lbs), belonging to one `LoggedExercise`, unique on `(loggedExerciseId, setNumber)`. The only source of truth for performance. Editable (weight/reps) forever; never deleted. |
| `GymExerciseBaseline` | Current working weight for one **gym-variable** exercise at one gym, `(gymId, exerciseId)` unique. Stored because logged sets alone cannot reconstruct per-gym expectation. Written only by the logging completion path. |
| `MissedDayResolution` | A dated record (`mesocycleId`, `missedOn`, `outcome`) resolving a missed planned day as `logged_late` / `shifted` / `skipped`. Immutable in Pitch 4. The effective schedule is derived from the plan plus these. |
| `isGymVariable(exercise)` | The single authority deciding per-gym baselines, from `equipmentType` alone: `true` iff `machine` or `cable`. |
| Representative session weight | The **median** of a completed `LoggedExercise`'s planned-working-set weights, used for baseline establish/correct. |
| Effective schedule | The real calendar derived from authored occurrences transformed by resolutions, computed **independently per mesocycle week** (a shift never crosses a week boundary). |

Preserved distinctions: `Session`/`SessionExercise` are never written during logging; archive (soft delete) removes from selection only, never from history; there is no ownership column (single-user); no progression value is stored.

## 6. States and lifecycle

```text
LoggedSession.status: in_progress | complete   (new enum LoggedSessionStatus)
MissedDayResolution.outcome: logged_late | shifted | skipped   (new enum MissedDayOutcome)
```

| From | To | Allowed? | Side effects |
| ---- | -- | -------- | ------------ |
| (none) | `LoggedSession.in_progress` | yes, on Start/Resume/Log-late | creates session + `LoggedExercise` rows from the plan snapshot; **never** writes the template |
| `in_progress` | `complete` | yes, only when every required `LoggedExercise` is complete and no performed exercise is archived | sets `status=complete`, `completedAt=now()`; final set write + any baseline correction + completion in **one transaction** |
| `complete` | `in_progress` | no | completion is terminal for the workout loop; past sets remain editable via History (a correction, not reopening) |
| (none) | `MissedDayResolution` | yes, one per `(mesocycleId, missedOn)` | immutable; derives effective schedule; never writes the template |

A `LoggedExercise` is **complete** when it has exactly `plannedSets` valid `LoggedSet` rows (set numbers `1..plannedSets`, each weight>0 and reps>0) **and** its performed `exerciseId` is active (`deletedAt = null`). There is no destructive `LoggedSession` state.

**Atomic side effects:** a `LoggedSet` write and any baseline establish/correct it triggers happen together; marking a `LoggedSession` complete and persisting its final set happen together. A set must never exist with its required baseline update missing, and a baseline must never update for a set that failed to save.

## 7. UI integration

Reference the design doc and `docs/previews/04-guided-workout-logging-preview.tsx` (binding for layout/hierarchy unless a Resolved Decision supersedes). Screens and the server reads/actions that back them:

| Screen | Data needed (read) | Actions |
| ------ | ------------------ | ------- |
| Today dashboard | `getTodayDashboard()` → occurrence + state (pending/in_progress/complete/rest) + oldest unresolved missed day | `startWorkoutAction`, navigate to runner |
| Missed-day prompt | oldest `MissedDayResolution`-free missed occurrence | `resolveMissedDayAction` |
| Gym selection | `listActiveGyms()` (Pitch 2) | `startWorkoutAction` / `changeGymAction` |
| Workout runner / exercise card | `getWorkout(loggedSessionId)` → per-exercise DTO with plan context, prior/baseline weight, saved sets | `logSetAction`, `swapExerciseAction`, `changeGymAction`, `completeWorkoutAction` |
| Swap picker | `getSwapCandidates(loggedExerciseId)` → active, same `primaryMuscle` | `swapExerciseAction` |
| Completion summary | `getWorkout` (counts) | `completeWorkoutAction` (if not already) |
| Week at a glance | `getWeekSchedule(weekIso)` → effective day states | week nav; open detail |
| Logged workout detail | `getLoggedWorkoutDetail(loggedSessionId)` | open edit dialog |
| Past-log correction | the set row | `editLoggedSetAction` |

**Client islands only:** the set-entry card, swap picker, missed-day prompt, gym picker, and edit dialog are client components that call server actions; they never access Prisma or Supabase. Server components do all reads. shadcn/ui: `Card`, `Button`, `Input` (numeric `inputMode`), `RadioGroup`, `Drawer`/`Sheet`/`Dialog`, `Alert`, `Skeleton`, Sonner. Primary actions sit at the bottom at 44px; dialogs trap focus; state labels never rely on color alone (no status colors exist in this pitch).

## 8. Data model

All core logged tables already exist from Foundation with the correct `onDelete: Restrict` chain, `@@unique([loggedExerciseId, setNumber])`, `@@unique([gymId, exerciseId])`, and **no** progression/e1RM columns. Pitch 4 adds two enums, columns to `LoggedSession` and `LoggedExercise`, and one new table — all via a single additive migration.

### Relationship to existing schema

| From | Relation | To | Description |
| ---- | -------- | -- | ----------- |
| `LoggedSession` | belongs to (nullable, Restrict) | `Mesocycle`, `Session` | the planned occurrence fulfilled |
| `LoggedExercise` | belongs to (Restrict) | `LoggedSession`, `Exercise` (performed), `Gym?` | performed exercise + workout gym |
| `LoggedExercise` | **new** belongs to | `Exercise` (planned, Restrict), `SessionExercise?` (SetNull) | plan provenance |
| `LoggedSet` | belongs to (Restrict) | `LoggedExercise` | factual entry |
| `GymExerciseBaseline` | belongs to (Restrict) | `Gym`, `Exercise` | per-gym working weight |
| `MissedDayResolution` | **new** belongs to (Restrict) | `Mesocycle`, `Session?` | dated resolution |

### Enums (new)

```prisma
enum LoggedSessionStatus {
  in_progress
  complete
}

enum MissedDayOutcome {
  logged_late
  shifted
  skipped
}
```

### Updated model — `LoggedSession`

```prisma
model LoggedSession {
  // ...existing fields (mesocycleId?, sessionId?, performedOn, completedAt, ...)
  /// Stable identity of the planned occurrence this session fulfills: the
  /// authored calendar date of the Session in its mesocycle week. The idempotency
  /// key — opening/resuming never creates a second row for the same occurrence.
  scheduledFor DateTime            @map("scheduled_for") @db.Date
  /// Explicit completion state; never inferred from navigation or age.
  status       LoggedSessionStatus @default(in_progress)

  // One LoggedSession per planned occurrence. NULLs are distinct in Postgres, so
  // this only constrains real session-backed occurrences (all of Pitch 4's).
  @@unique([sessionId, scheduledFor])
}
```

`performedOn` is set to `scheduledFor` (the occurrence date) at creation; `completedAt` is set with `status=complete`. `status` is the authority; `completedAt` is its timestamp.

### Updated model — `LoggedExercise`

```prisma
model LoggedExercise {
  // ...existing fields (loggedSessionId, exerciseId [performed], gymId?, position, ...)
  /// Plan provenance snapshot (Resolved Decision 8/amendment 10): later plan edits
  /// must never make an old workout unintelligible. The performed exercise is
  /// `exerciseId`; what was planned is recorded here.
  plannedExerciseId String  @map("planned_exercise_id") @db.Uuid
  sessionExerciseId String? @map("session_exercise_id") @db.Uuid
  plannedSets       Int     @map("planned_sets")
  targetRepMin      Int     @map("target_rep_min")
  targetRepMax      Int     @map("target_rep_max")

  plannedExercise Exercise         @relation("PlannedExercise", fields: [plannedExerciseId], references: [id], onDelete: Restrict)
  sessionExercise SessionExercise? @relation(fields: [sessionExerciseId], references: [id], onDelete: SetNull)

  @@index([plannedExerciseId])
}
```

`exerciseId` (performed) starts equal to `plannedExerciseId` and changes only via swap. `sessionExerciseId` is `SetNull` so editing the plan later never cascades history away; the snapshot (`plannedSets`, `targetRepMin`, `targetRepMax`, `plannedExerciseId`) is the durable contract for Pitch 5.

### New model — `MissedDayResolution`

```prisma
model MissedDayResolution {
  id          String           @id @default(uuid()) @db.Uuid
  mesocycleId String           @map("mesocycle_id") @db.Uuid
  /// The planned Session occurrence that was missed (nullable only if the plan
  /// slot is later removed; the dated record still stands).
  sessionId   String?          @map("session_id") @db.Uuid
  /// The authored calendar date that was missed (DATE, no zone).
  missedOn    DateTime         @map("missed_on") @db.Date
  outcome     MissedDayOutcome
  createdAt   DateTime         @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime         @updatedAt @map("updated_at") @db.Timestamptz

  mesocycle Mesocycle @relation(fields: [mesocycleId], references: [id], onDelete: Restrict)
  session   Session?  @relation(fields: [sessionId], references: [id], onDelete: SetNull)

  // One resolution per missed planned day. Immutable in Pitch 4.
  @@unique([mesocycleId, missedOn])
  @@index([mesocycleId])
  @@map("missed_day_resolutions")
}
```

### Row-level security (new table)

Prisma does not manage RLS; the migration that creates `missed_day_resolutions` must enable deny-all RLS. Existing tables keep their Foundation RLS (new columns need no re-enable).

```sql
ALTER TABLE "missed_day_resolutions" ENABLE ROW LEVEL SECURITY;
-- Deny-all. No policies. The anon Data API must return nothing.
```

### Derived fields

| Field / Concept | Stored? | Computed From | Notes |
| --------------- | ------- | ------------- | ----- |
| today's occurrence + state | no | plan + resolutions + logged sessions | `getTodayDashboard` |
| effective schedule / week states | no | plan + resolutions + logged sessions | per-week pure computation |
| exercise/day completeness | no | `LoggedSet` rows vs `plannedSets` | `getWorkout` |
| suggested/prior weight | no | gym baseline (gym-variable) or recent `LoggedSet` (gym-consistent) | display only; never auto-saved |
| `progressionTag`, e1RM, goal % | **no — not computed in Pitch 4** | — | Pitch 5/6 |
| `GymExerciseBaseline.weightLbs` | yes | median working weight at exercise completion | only stored derived-ish value |

Schema conventions (snake_case `@@map`/`@map`, UUIDs, `@db.Timestamptz`, `weightLbs` Decimal, `onDelete: Restrict` on logged chain) are followed. No ownership column is added.

## 9. Authorization and access control

Two layers, both required:

1. **Authentication in application code.** Every route is behind the authenticated shell (Foundation middleware); every server action calls `requireUser()` first, then the write module.
2. **RLS deny-all** on every table including the new `missed_day_resolutions`, closing the Supabase Data API. Prisma bypasses RLS; the server-side auth check is what protects server code.

```ts
export async function logSetAction(input: LogSetInput): Promise<ActionResult<{ setId: string }>> {
  await requireUser();               // re-check in the action, not only middleware
  return toActionResult(() => logSet(input)); // only logged-sets.ts writes a LoggedSet
}
```

| Resource | Read | Create | Update | Delete |
| -------- | ---- | ------ | ------ | ------ |
| LoggedSession | auth | auth (start/resume) | auth (complete) | never |
| LoggedExercise | auth | auth (start) | auth (swap, before first set) | never |
| LoggedSet | auth | auth, **only** via `logged-sets.ts` | auth, **only** via `logged-sets.ts` (edit) | never |
| GymExerciseBaseline | auth | auth, only via logging completion path | auth, only via logging completion path | never |
| MissedDayResolution | auth | auth (one per day) | never (immutable) | never |

The Supabase client is used for the auth session only — never to query application tables.

## 10. Storage model

Not applicable. This feature touches no Supabase Storage (exercise images are read-only from Pitch 2; custom exercises have none).

## 11. Server actions and API surface

Reads are server-component Prisma calls in `src/lib/logging/queries.ts` and `src/lib/logging/schedule.ts`. Mutations are server actions in `src/app/(app)/log/actions.ts` and `src/app/(app)/history/actions.ts` that call write modules. No public API, no route handlers.

### Write modules

`src/lib/logging/logged-sets.ts` — **the only** `LoggedSet` write path:

```ts
// logSet(input, tx?) — create one set; on completion of the exercise, establish/correct
//   the gym baseline in the SAME transaction. Retry-idempotent on (loggedExerciseId,setNumber).
type LogSetInput = { loggedExerciseId: string; setNumber: number; weightLbs: number; reps: number };
export async function logSet(input: LogSetInput, tx?: Prisma.TransactionClient): Promise<LoggedSet>;

// editLoggedSet(input, tx?) — correct weight/reps of an existing set. NO baseline replay.
type EditLoggedSetInput = { loggedSetId: string; weightLbs: number; reps: number };
export async function editLoggedSet(input: EditLoggedSetInput, tx?: Prisma.TransactionClient): Promise<LoggedSet>;
```

`logSet` behavior: validate positive weight+reps; `create` the set; on unique violation `(loggedExerciseId,setNumber)` fetch the existing row — if its weight/reps equal the input, return it (idempotent retry); otherwise raise `conflict` (deliberate changes go through `editLoggedSet`). After a successful create, if the write makes the `LoggedExercise` complete and the **performed** exercise `isGymVariable` and the session has a `gymId`, call `applyBaselineOnCompletion(loggedExerciseId, tx)` in the same transaction.

`src/lib/gyms/baselines.ts`:

```ts
export const BASELINE_CORRECTION_THRESHOLD_PERCENT = 15; // Bucket C tunable default
export function medianWeight(weights: Decimal[]): Decimal; // odd→middle, even→mean of two middle
// Establish if no (gymId,exerciseId) baseline exists; else correct iff deviation ≥ threshold.
// Scoped to (gymId, exerciseId) ONLY. Never rewrites a LoggedSet.
export async function applyBaselineOnCompletion(loggedExerciseId: string, tx: Prisma.TransactionClient): Promise<void>;
```

Deviation test (float-safe, Decimal math): correct iff `|median − baseline| × 100 ≥ baseline × 15`. Establish (no prior row) is never a correction.

`src/lib/exercises/gym-variable.ts`: `export function isGymVariable(exercise: { equipmentType: EquipmentValue }): boolean` → `equipmentType === "machine" || equipmentType === "cable"`. Single authority.

`src/lib/logging/sessions.ts`:

```ts
// startOrResumeWorkout — idempotent on (sessionId, scheduledFor). Creates LoggedExercise rows
//   from the plan snapshot. Never writes Session/SessionExercise.
export async function startOrResumeWorkout(input: { sessionId: string; scheduledFor: string; gymId: string }): Promise<{ loggedSessionId: string }>;
export async function changeGym(input: { loggedSessionId: string; gymId: string }): Promise<void>; // only if zero LoggedSets exist
export async function swapExercise(input: { loggedExerciseId: string; newExerciseId: string }): Promise<void>; // only if zero sets; same primaryMuscle; active
export async function completeWorkout(input: { loggedSessionId: string }): Promise<void>; // atomic; validates completeness
```

`src/lib/logging/missed-days.ts`:

```ts
export async function resolveMissedDay(input: { mesocycleId: string; missedOn: string; outcome: MissedDayOutcome }): Promise<void>; // conflict if already resolved
```

### Server actions

| Action | Input | Output | Side effects / errors |
| ------ | ----- | ------ | --------------------- |
| `startWorkoutAction` | `{ sessionId, scheduledFor, gymId }` | `{ loggedSessionId }` | creates/resumes session; `validation_error` if gym archived/missing |
| `changeGymAction` | `{ loggedSessionId, gymId }` | `{ ok }` | `invalid_state_transition` if any LoggedSet exists (gym locked) |
| `logSetAction` | `LogSetInput` | `{ setId }` | via `logSet`; `validation_error` (≤0); `conflict` (changed retry) |
| `swapExerciseAction` | `{ loggedExerciseId, newExerciseId }` | `{ ok }` | `invalid_state_transition` if a set exists; `validation_error` if different primary muscle / archived |
| `completeWorkoutAction` | `{ loggedSessionId }` | `{ ok }` | `validation_error` listing incomplete/unresolved exercises |
| `editLoggedSetAction` | `{ loggedSetId, weightLbs, reps }` | `{ ok }` | via `editLoggedSet`; `validation_error` (≤0); **no** baseline replay |
| `resolveMissedDayAction` | `{ mesocycleId, missedOn, outcome }` | `{ ok }` | `conflict` if already resolved |

All actions return `ActionResult<T>` (`src/lib/actions/result.ts`), call `requireUser()` first, and `refresh()`/`redirect()` on success.

### Effective-schedule module (`src/lib/logging/schedule.ts`, pure)

```ts
// authoredDate(startDate, week, dayOfWeek) → the calendar date within mesocycle week `week`
//   whose ISO weekday === dayOfWeek. Uses src/lib/plan/calendar.ts only.
// effectiveWeekSchedule(ctx) → per-day effective occurrences + state for one mesocycle week,
//   applying that week's MissedDayResolutions in chronological order:
//     - skipped: occurrence marked Skipped, no loggable slot
//     - logged_late: occurrence stays at its authored date
//     - shifted: later same-week occurrences move +1 calendar day; any pushed beyond the
//       week's last day is DROPPED (never carried into next week)
//   Shifts are computed INDEPENDENTLY per week; week W+1 always starts from the authored plan.
// oldestUnresolvedMissedDay(ctx, today) → the earliest authored occurrence with effective date
//   < today, no complete LoggedSession, and no MissedDayResolution.
```

## 12. Validation rules

| Field | Validation | Error |
| ----- | ---------- | ----- |
| `weightLbs` (log + edit) | finite number, **> 0**, ≤ 9999.99, ≤ 2 decimals | `validation_error` "Enter a weight above 0." |
| `reps` (log + edit) | integer, **> 0**, ≤ 1000 | `validation_error` "Enter reps above 0." |
| `setNumber` | integer in `1..plannedSets` | `validation_error` (no ad-hoc extra sets) |
| partial input | weight-only or reps-only is **not** persisted | client keeps draft; server never writes |
| `gymId` (start) | exists, `deletedAt = null` | `validation_error` "Choose an active gym." |
| `changeGym` | no `LoggedSet` exists for the session | `invalid_state_transition` "Gym is locked once sets are logged." |
| `swapExercise` | candidate active + same `primaryMuscle`; no set logged on that occurrence | `validation_error` / `invalid_state_transition` |
| `complete` | all exercises complete; no performed exercise archived | `validation_error` with `details` naming what remains |
| `resolveMissedDay` | no existing resolution for `(mesocycleId, missedOn)`; `outcome` in enum | `conflict` / `validation_error` |

Zero/empty/negative weight or reps is rejected (Resolved Decision 11) — invalid history is harder to undo than a strict rule. Unusual-but-valid input (a weight far from baseline) is **not** an error; it triggers baseline correction instead. Enum values are validated; raw DB errors never leak.

## 13. UI data contracts

```ts
type DashboardDto =
  | { kind: "rest" }
  | { kind: "no_plan" }
  | { kind: "missed_day"; missed: { mesocycleId: string; sessionId: string; sessionName: string; missedOn: string; daysAgo: number }; below: DashboardTodayDto | null }
  | DashboardTodayDto;

type DashboardTodayDto = {
  kind: "pending" | "in_progress" | "complete";
  sessionId: string;
  loggedSessionId: string | null;   // null when pending (not yet started)
  sessionName: string;
  scheduledFor: string;             // authored date (ISO)
  week: number;
  gymName: string | null;           // set once a gym is chosen
  exercises: { name: string; scheme: string; done: boolean }[];
  setsLogged?: number;              // complete state summary
};

type ExerciseCardDto = {
  loggedExerciseId: string;
  performedExerciseName: string;
  plannedExerciseName: string;      // differs when swapped
  swapped: boolean;
  performedArchived: boolean;       // forces substitution
  isGymVariable: boolean;
  gymName: string | null;           // shown on the card only when isGymVariable
  gymLocked: boolean;               // true once any set exists in the session
  swapLocked: boolean;              // true once a set exists on this occurrence
  plannedSets: number;
  plannedRepRange: { min: number; max: number };
  suggestedWeightLbs: number | null;// baseline or recent set; display only
  sets: { setNumber: number; weightLbs: number | null; reps: number | null; saved: boolean }[];
  // NO progressionTag, NO estimatedOneRepMax in Pitch 4.
};

type WeekScheduleDto = {
  weekStartIso: string;
  days: { dateIso: string; label: string; sessionName: string | null;
          state: "upcoming" | "in_progress" | "complete" | "skipped" | "shifted" | "rest";
          loggedSessionId: string | null }[];
};

type LoggedWorkoutDetailDto = {
  loggedSessionId: string;
  sessionName: string;
  dateIso: string;
  gymName: string | null;           // name even if the gym is archived
  exercises: { performedName: string; plannedName: string; swapped: boolean; archived: boolean;
               sets: { loggedSetId: string; setNumber: number; weightLbs: number; reps: number }[] }[];
};
```

DTOs expose only what screens need; credentials, the service-role key, and raw Prisma errors stay server-side. No derived progression field names appear (none exist yet).

## 14. Testing strategy

Risk-ranked (CLAUDE.md): logged-history integrity first, then baseline isolation/atomicity, then missed-day handling, then auth/RLS. Anything writing/deleting logged history is never lean.

### 1. Logged history integrity (adversarial, first)
```text
GIVEN a static scan of the codebase
THEN no application module outside src/lib/logging/logged-sets.ts calls prisma.loggedSet.create/update/delete
GIVEN an Exercise or Gym referenced by a LoggedExercise
WHEN a hard delete is attempted
THEN onDelete: Restrict rejects it and history stays readable
GIVEN an Exercise/Gym is archived (deletedAt set)
THEN its historical LoggedExercises still resolve its name (never "Unknown")
GIVEN a retried logSet for an already-persisted (loggedExerciseId,setNumber) with identical values
THEN it returns the existing set and creates no duplicate
GIVEN a retried logSet with different values
THEN it raises conflict (not a silent overwrite); editLoggedSet is the change path
GIVEN any code path
THEN no LoggedSet deletion function exists
```

### 2. Validation
```text
empty / zero / negative weight → validation_error, nothing persisted
empty / zero / negative reps → validation_error, nothing persisted
weight-only (no reps) and reps-only (no weight) → no LoggedSet created
setNumber outside 1..plannedSets → validation_error (no extra sets)
edit to zero weight or zero reps → validation_error
```

### 3. State transitions / partial & completion
```text
start creates one LoggedSession (in_progress) + LoggedExercise rows from the plan snapshot
opening/resuming the same occurrence returns the SAME loggedSessionId (idempotent, no duplicate)
a partial workout (some sets) survives and resumes as in_progress
incomplete exercise blocks completeWorkout
performed exercise archived+unresolved blocks completeWorkout
all required sets present + all performed active → complete succeeds; status=complete, completedAt set
a completed workout's sets remain editable via History
gym can be changed before the first set; blocked after the first persisted set
swap allowed before the first set; blocked after
```

### 4. Side effects — gym baselines (isolation + atomicity)
```text
first completed gym-variable exercise at Gym A establishes the baseline (NOT a correction); no Gym B row touched
median: [100,100,100]→100; [90,100,110]→100; [100,100,110,110]→105
15% boundary: baseline 100 → median 114 (14%) no change; 115 (15%) correct; 116 correct
correction at Gym A leaves Gym B's baseline unchanged; exercise A leaves exercise B unchanged
free-weight / plate_loaded exercise creates NO baseline row
baseline uses the PERFORMED (swapped) exercise + the session gym, never the planned exercise
a forced failure in the completing transaction leaves BOTH the set and the baseline unchanged
baseline correction never rewrites any LoggedSet
editing a historical set does NOT replay/recompute baselines
```

### 5. Security / privacy
```text
unauthenticated request to a log/history route → redirect to /login
every server action rejects without an auth session
anon-key Data API returns nothing for missed_day_resolutions (RLS deny-all), as for every table
gym address never appears in dashboard/runner/history DTOs (only gym name)
```

### 6. Missed-day handling
```text
a past planned day with no completion and no resolution is detected as missed
exactly three outcomes offered; only the OLDEST unresolved day is prompted
skip persists and never re-prompts that occurrence
log-late targets the original missed date (scheduledFor = missedOn), not today
shift moves remaining CURRENT-week occurrences +1 day; next week returns to authored alignment
a shifted occurrence pushed beyond the week is DROPPED, does not spill into next week, and does not re-prompt
consecutive misses: oldest resolved first, schedule recomputed, then next evaluated; no compounding across weeks
no auto-resolution exists (no timeout/inference)
a confirmed resolution is immutable (no ordinary edit path); re-resolving the same day → conflict
```

### 7. Integration scenarios
```text
start at Downtown → log 3 sets of a machine → complete → baseline established; History shows the day
swap an unavailable machine for an active same-muscle exercise before logging → logged occurrence records the substitute; Session template unchanged
miss Friday → shift → the week view reflects shifted days; next week authored
edit last Tuesday's mistyped weight from History → stored value changes; baseline unchanged
```

### 8. UI behavior
```text
save failure keeps the entered numbers and shows a distinct error from a load failure
a saved set renders settled with ✓; an unsaved row renders as draft
completed-day dashboard shows the quiet state, never tomorrow's plan, never progression/goal content
hold/progress/deload: NO tag and NO status color appears anywhere (none computed)
```

### 9. Regression
```text
Pitch 2/3 suites still pass; no Session/SessionExercise write occurs during any logging path
no tag/e1RM column exists on any logged table (schema assertion)
```

## 15. Acceptance criteria

**Logged history & write path**
- [ ] `LoggedSet` is created/updated only through `src/lib/logging/logged-sets.ts` (static test enforced).
- [ ] Start/resume is idempotent per `(sessionId, scheduledFor)`; no duplicate `LoggedSession`.
- [ ] `LoggedSession.status` is explicit (`in_progress`/`complete`), never inferred.
- [ ] Hard delete of a referenced `Exercise`/`Gym` is rejected; archived rows stay readable in history.
- [ ] No LoggedSet deletion exists; past sets are weight/reps-correctable.

**Logging & completion**
- [ ] Guided card shows all planned sets together with positive-only weight/reps validation.
- [ ] Partial workouts persist and resume; day completes only when every required exercise is complete.
- [ ] Completion is explicit and atomic (final set + baseline + status together).
- [ ] Completed-day dashboard is neutral (no progression/goal content).

**Gym & baselines**
- [ ] Gym chosen before logging; locked after the first set; only active gyms; archived gyms readable in history.
- [ ] `isGymVariable` = machine/cable only; free-weight/plate make no baseline.
- [ ] First gym-variable log establishes (not corrects); baselines isolated per gym+exercise; ≥15% median deviation corrects going forward; corrections never rewrite sets; editing history does not replay baselines.

**Swap**
- [ ] Swap offers only active same-`primaryMuscle` exercises; records on the occurrence only; never mutates the template; locked after the first set; archived planned exercise requires substitution and blocks completion until resolved; no eligible candidate → cannot false-complete.

**Missed days**
- [ ] Three outcomes; dated resolution persisted; plan never mutated; oldest resolved first; shift scoped to the current week; end-of-week occurrence dropped (no spillover); skip doesn't re-prompt; resolutions immutable; no auto-resolution.

**Security**
- [ ] Routes/actions require auth; new table has RLS deny-all; no browser DB access; gym address never surfaced in logging/history.

## 16. Explicit non-goals

- ❌ Progress/hold/deload tags, e1RM, trends, charts, recommendations. **Deferred (Pitch 5).**
- ❌ Scheduled-deload load reduction. **Deferred (Pitch 5).**
- ❌ Goals / goal percentage / completion content. **Deferred (Pitch 6).**
- ❌ LoggedSet or whole-workout deletion. **Permanent.**
- ❌ Editing exercise identity / gym / date / planned slot / missed-day resolution in history. **Permanent for Pitch 4.**
- ❌ Extra/ad-hoc sets; warm-up sets. **Deferred** (a future pitch may add deliberately).
- ❌ "Save swap to template" / plan mutation from logging. **Permanent.**
- ❌ Auto-resolving missed days; GPS/geofencing; implicit gym creation. **Permanent.**
- ❌ RPE/RIR. **Deferred.** ❌ Cardio. **Deferred (Pitch 7).**
- ❌ Program/mesocycle generation; social features; cardio progression; nutrition/body-composition. **Permanent.**

## Resolved Decisions

Authority: the Pitch 4 one-shot run prompt (controlling for this run), `CLAUDE.md` invariants, the PRD, and the Architecture Doc. Each item below is approved for this build; none is re-opened downstream.

1. **Session vs LoggedSession permanently distinct.** `Session`/`SessionExercise` = authored template; `LoggedSession`/`LoggedExercise`/`LoggedSet` = history. Logging never writes the template. *Authority: CLAUDE.md invariant; pitch.*
2. **One occurrence → ≤1 LoggedSession.** Idempotency key `(sessionId, scheduledFor)` where `scheduledFor` = the authored date. Open/refresh/resume never duplicate. *Authority: run prompt #2.*
3. **Explicit status.** `LoggedSessionStatus { in_progress, complete }`; completion is never inferred. *Run prompt #3.*
4. **Gym at workout level.** Chosen at start from active gyms; all LoggedExercises inherit it; never auto-created. *Run prompt #4.*
5. **Gym locked after first LoggedSet.** Correctable before any set exists. *Run prompt #5.*
6. **Start/resume never mutates the plan.** *Run prompt #6.*
7. **One LoggedExercise per SessionExercise**, recording performed exercise while preserving the planned occurrence. *Run prompt #7.*
8. **Plan-context snapshot on LoggedExercise** (`plannedExerciseId`, `sessionExerciseId` SetNull, `plannedSets`, `targetRepMin/Max`) so later plan edits can't make history unintelligible. *Run prompt #8; amendment 10.*
9. **One controlled LoggedSet write path:** `src/lib/logging/logged-sets.ts` only. *Run prompt #9; CLAUDE.md.*
10. **LoggedSet stores only facts** (exercise, set number, weight, reps, timestamps). No derived interpretation. *Run prompt #10.*
11. **Positive weight AND reps required;** zero/empty/negative rejected. *Run prompt #11.*
12. **Planned working sets only;** no Add Set in Pitch 4. `setNumber ∈ 1..plannedSets`. *Run prompt #12 (product default).*
13. **No warm-up model.** *Run prompt #13.*
14. **`(loggedExerciseId, setNumber)` unique;** retry conflicts/idempotent, never duplicates; deliberate change via edit path. *Run prompt #14.*
15. **Partial input is not history;** persist only when both values valid. *Run prompt #15.*
16. **Exercise complete** when every planned working-set slot has one valid LoggedSet. *Run prompt #16.*
17. **Session complete** when every required LoggedExercise is complete (archived-unresolved blocks). *Run prompt #17.*
18. **Completion explicit & atomic** (final set + baseline + status in one transaction). *Run prompt #18; CLAUDE.md.*
19. **Completed sessions remain history-editable** (correction, not reopening). *Run prompt #19.*
20. **Today's unresolved workout is the dashboard's primary state.** *Run prompt #20.*
21. **Completed-today dashboard is neutral** (no tags/e1RM/goal/analytics). Recorded as Required upstream amendment 1. *Run prompt #21.*
22. **Completion summary is factual & minimal** (session, gym, exercises, set count). *Run prompt #22; amendment 8.*
23. **Week-at-a-glance/history surface** included (not a statistics dashboard). *Run prompt #23.*
24. **Logged workout detail shows factual history** (no derived values). *Run prompt #24.*
25. **Swap eligibility = active + same `primaryMuscle` only;** secondary overlap doesn't qualify; favorites don't affect eligibility. *Run prompt #25; method-note.*
26. **Swap affects one LoggedExercise occurrence only;** never the template/other workouts. *Run prompt #26; CLAUDE.md.*
27. **Swap locked once a LoggedSet exists** for that occurrence. *Run prompt #27 (product default); amendment 3.*
28. **Archived planned exercise requires explicit substitution;** never reactivated/dropped/auto-chosen. *Run prompt #28; PRD.*
29. **No eligible substitute → cannot false-complete;** never cross muscle groups. *Run prompt #29.*
30. **Missed day = past planned lifting day, no completion, no resolution;** detected from plan + effective-week state + logged history + resolutions, not UI. *Run prompt #30.*
31. **Exactly three outcomes:** `logged_late`, `shifted`, `skipped`. *Run prompt #31; PRD.*
32. **Resolutions persisted as dated records;** effective schedule derived; template never mutated. *Run prompt #32.*
33. **Resolutions immutable in Pitch 4.** Recorded as amendment 4. *Run prompt #33 (product default).*
34. **Log-late targets the original missed occurrence** (`scheduledFor = missedOn`); UI shows the historical date; entry timestamp is `createdAt`. *Run prompt #34.*
35. **Skip** persists, creates no fake history, doesn't re-prompt. *Run prompt #35.*
36. **Shift affects only the current mesocycle week;** next week returns to authored alignment; never mutates `dayOfWeek`. *Run prompt #36; PRD.*
37. **A shifted occurrence beyond the current week is dropped** (no next-week spillover, no repeated prompting). Recorded as amendment 5. *Run prompt #37 (product default).*
38. **Consecutive misses processed chronologically** (oldest first, recompute, then next); per-week-independent computation prevents compounding. *Run prompt #38.*
39. **Never auto-resolve** (no timeout/inference). *Run prompt #39; guide.*
40. **Gym-variable = `machine` + `cable`** (verified canonical `Equipment` values; no name parsing); one authority `isGymVariable`. Mapping recorded in `docs/planning/method-note.md`. *Run prompt #40; method-note.*
41. **Free-weight / plate-consistent exercises get no baseline row** (no zero placeholders). *Run prompt #41.*
42. **Baselines keyed by `(gymId, exerciseId)`;** never shared across gyms; no global baseline. *Run prompt #42.*
43. **First completed working-set collection at a gym establishes** the baseline (not a correction). *Run prompt #43; PRD.*
44. **Representative weight = median** of the completed planned-working-set weights (`100,100,110,110 → 105`). Not first/max/mean/latest. *Run prompt #44.*
45. **Correction threshold = 15%** of the median-vs-baseline deviation; float-safe Decimal comparison; `BASELINE_CORRECTION_THRESHOLD_PERCENT`. Tunable **Bucket C** default (surfaced in run report). *Run prompt #45.*
46. **Establish/correct at exercise completion** using the completed working sets, transactionally consistent; never per-set, never async. *Run prompt #46.*
47. **Baseline correction never rewrites LoggedSets.** *Run prompt #47; CLAUDE.md.*
48. **Baseline changes affect only the current `(gymId, exerciseId)`.** *Run prompt #48.*
49. **Current working weight is not stored on SessionExercise;** derive from gym baseline (gym-variable) or recent LoggedSets (gym-consistent). *Run prompt #49; guide.*
50. **Suggested/prior weight is display-only,** never auto-submitted as history. *Run prompt #50.*
51. **Past-log correction supports weight + reps only;** not exercise/gym/mesocycle/session/set-number/day/resolution. *Run prompt #51.*
52. **No LoggedSet deletion.** *Run prompt #52; guide.*
53. **Historical edit does not replay baseline history;** current baseline stays the latest established/corrected value. Recorded as amendment 6. *Run prompt #53 (product default).*
54. **Editing the most recent set does not alter the baseline** either; correction path is baseline-neutral and deterministic. *Run prompt #54.*
55. **Referenced Exercise/Gym hard deletes fail** (`onDelete: Restrict`); history stays readable. *Run prompt #55; CLAUDE.md.*
56. **Archival never hides history;** archived rows render by name in historical views. *Run prompt #56.*
57. **LoggedSet writes + baseline changes + completion are atomic** (no contradictory combinations). *Run prompt #57; CLAUDE.md.*

**Additional implementation decisions resolved by this spec (authority ordering in CLAUDE.md):**
- **A1. Schedule anchoring.** `scheduledFor`/`authoredDate` is the unique date in mesocycle week *w* whose ISO weekday equals `session.dayOfWeek`, computed via `src/lib/plan/calendar.ts` (the single week-math authority). *Rationale: calendar.ts owns week math; no second implementation.*
- **A2. LoggedExercise initialization.** On start, `exerciseId := plannedExerciseId := SessionExercise.exerciseId`; swap updates `exerciseId` only. Archived planned exercise initializes equal and is flagged for required substitution (no nullable performed exercise needed). *Rationale: keeps `exerciseId` NOT NULL and history readable.*
- **A3. Retry semantics.** `logSet` catches the unique violation; identical values → idempotent return; differing values → `conflict`. *Rationale: Decision 14 without destructive upsert.*
- **A4. Per-week-independent effective schedule.** Shifts are applied within a single week only; weeks are computed independently so no cross-week compounding can occur. *Rationale: Decisions 36–38, simplest correct model.*
- **A5. `status` authority.** `LoggedSession.status` is authoritative; `completedAt` is its timestamp, written together. *Rationale: single source, matches `Mesocycle.status` convention.*

## 17. Open questions

None blocking. All product-mechanics gaps named in the pitch are resolved above. The only item carried forward is calibration, not a blocker:

1. **Baseline correction threshold value (15%).** A tunable Bucket C default, not PRD-derived. It ships as the named constant `BASELINE_CORRECTION_THRESHOLD_PERCENT` and is flagged for review/tuning from lived data (Architecture Doc's identified top risk). Non-blocking.

## 18. Future considerations

- `LoggedExercise`'s plan-context snapshot and the untouched `LoggedSet` facts are exactly what the Progressive Overload Engine needs to compute `progressionTag` and e1RM on read, and what Goals needs for percentage — with no logging redesign.
- `MissedDayResolution` + the effective-schedule module give Pitch 5 a stable mapping from calendar date to mesocycle week (including scheduled-deload weeks) without re-deriving the plan.
- `GymExerciseBaseline` is shaped so a future dedicated baseline-maintenance feature (e.g. replay/recompute after bulk history edits) can attach without touching logged history.
