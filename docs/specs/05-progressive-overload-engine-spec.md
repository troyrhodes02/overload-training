---
version: 1.0.0
status: approved
author: Autonomous pipeline (Pitch 5 run)
last_updated: 2026-10-12
pitch_reference: pitches/05-progressive-overload-engine.md
design_reference: docs/design/05-progressive-overload-engine-design-doc.md
preview_reference: docs/previews/05-progressive-overload-engine-preview.tsx
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
method_note_reference: docs/planning/method-note.md
linear_issue: (milestone "Progressive Overload Engine", Overload V1)
---

# Progressive Overload Engine — Technical Spec

## 2. Summary

The Progressive Overload Engine reads the `LoggedSet` history Pitch 4 produced and, on every read, derives whether each Exercise should **Progress**, **Hold**, or **Deload**, plus an **e1RM trend** and a **suggested next load** — storing none of it. The core abstraction is a **pure function over a chronological list of qualifying performances**: a performance is one completed `LoggedExercise` occurrence (all planned working sets present) carrying its own preserved plan context (`plannedSets`, `targetRepMin`, `targetRepMax`), the exercise actually performed, its gym, and the effective mesocycle week of the occurrence. The engine never writes; a server read layer gathers performances through Prisma and feeds the pure engine.

Two systems stay strictly separate: the **reactive** per-Exercise call (progress/deload/stall), and the **scheduled** mesocycle-wide deload week. During a scheduled-deload week the reactive engine is suppressed entirely and those occurrences are excluded from reactive threshold sequences, while remaining visible — distinctly marked — on the e1RM chart.

"Working" means: a free-weight lift that hit the top of its range for two consecutive qualifying sessions shows **Progress** with a `+5 lb` suggestion; a machine lift's progression and trend are read in a single gym's context (never mixing nominal pounds across gyms); a scheduled-deload week shows a 90%-rounded-down load and no tags; and editing any past set changes every derived conclusion on the next read with no recompute step and no stored tag.

## 3. Problem

The app records what the lifter did but says nothing about what it means:

- It cannot yet say whether Barbell Bench Press should go up, because nothing evaluates logged reps against the planned rep range.
- It cannot yet show how a lift's strength has moved, because no e1RM is computed anywhere.
- It cannot yet withhold a progress call when the reps say "go up" but demonstrated strength is flat.
- It cannot yet reduce load for a scheduled deload week, nor stop a deliberately light week from reading as failure.
- It cannot yet guarantee that correcting a mistyped weight from three weeks ago changes the resulting call — because there is no call.

This pitch closes those gaps and produces the one canonical `estimateOneRepMax` that Goals (Pitch 6) will reuse. It blocks Pitch 6 and completes the Brief's core job.

## 4. Scope and non-scope

### In scope

- A named-constant progression config at `src/lib/progression/config.ts`.
- One canonical Epley `estimateOneRepMax`, a per-set e1RM, and a session-level (max) e1RM point.
- A pure reactive engine: minimum history, Progress threshold, reactive Deload threshold, Hold, precedence, e1RM stall gate.
- Scheduled-deload detection (effective mesocycle week), 90% load suggestion rounded down to the load step, reactive suppression, and sequence exclusion.
- Gym scope: gym-consistent Exercises evaluated globally; gym-variable Exercises evaluated and charted per `(exerciseId, gymId)`.
- `+5 lb` Progress suggestion derived from the existing Pitch 4 working-weight source (never applied, never mutating).
- Server read layer producing DTOs for: dashboard/today, logging card, session summary, exercise progression detail (with gym selector), and e1RM chart points.
- The `ProgressTag` / chart / gym-selector UI per the design doc and preview.
- Automatic derived-on-read correction after past-log edits (no new write path).

### Out of scope

- **Goals** (target weight×reps, percentage, completion, archive, new-goal) — Pitch 6. Pitch 5 only exports the shared `estimateOneRepMax`.
- A numeric reduced target for **reactive** Deload (only scheduled deload computes 90%).
- Any stored tag, stored e1RM, stored trend, cache table, cron, scheduler, or background job.
- Auto-applying `+5 lb`, mutating `SessionExercise`, `GymExerciseBaseline`, future `LoggedSet`s, or the authored plan.
- Cross-gym nominal-weight conversion ratios for machines.
- RPE/RIR; cardio progression; multi-exercise analytics.

## 5. Core concepts

| Concept | Description |
| ------- | ----------- |
| **Qualifying performance** | One completed `LoggedExercise`: all `plannedSets` working sets (`setNumber 1..plannedSets`) present, belonging to a `LoggedSession` with `status = complete`. Carries its own plan context (`targetRepMin/Max`, `plannedSets`), performed `exerciseId`, `gymId`, and effective mesocycle week. The only unit the engine evaluates. |
| **Historical plan context** | The `LoggedExercise` snapshot (`plannedSets`, `targetRepMin`, `targetRepMax`). Every performance is judged against **its own** range, never today's `SessionExercise`. (Decision R8.) |
| **Effective mesocycle week** | The mesocycle week of a performance's occurrence, from its `LoggedSession.scheduledFor` (the authored occurrence date), via `mesocycleWeekForDate`. Log-late and shift keep the authored occurrence week; shifts never cross a week boundary (Pitch 4). (Decisions R41.) |
| **Scheduled-deload week** | Week `w` where `deloadEveryWeeks > 0 && w % deloadEveryWeeks === 0`. Mesocycle-wide planned recovery. |
| **Reactive call** | Per-Exercise `progress` / `deload` / `stalled` / `hold` / `insufficient`, derived from qualifying performances. |
| **Session-level e1RM point** | Max Epley estimate among a performance's valid working sets (Decision R18). One point per completed performance. |
| **Gym scope** | For `isGymVariable(exercise) === true`, all progression and trend evaluation is partitioned by `gymId`. Otherwise it is global across gyms. (Decisions R11–R14.) |
| **Suggested load** | Display-only number: Progress → working-weight source `+5`; scheduled deload → working-weight source `×0.90` floored to 5. Never written. |

Preserved distinctions: `Session`/`SessionExercise` are never written by this engine; Hold is a valid, tagless, non-error state; scheduled vs reactive deload never share a treatment; there is no ownership column.

## 6. States and lifecycle

The engine stores no state and adds no DB status. It computes a reactive result enum per Exercise (per gym scope for gym-variable):

```text
ReactiveState: insufficient | hold | progress | deload | stalled
OccurrenceContext (today/card): normal | scheduled_deload
```

### Reactive precedence (Decision R7 / pitch §Source-Gap 8) — deterministic order

| Step | Condition | Result |
| ---- | --------- | ------ |
| 1 | Occurrence is in a scheduled-deload week | **suppressed** (`scheduled_deload`); no reactive eval; occurrence excluded from sequences |
| 2 | Qualifying performances in scope `< MIN_QUALIFYING_SESSIONS` | `insufficient` (no tag) |
| 3 | Reactive Deload threshold met | `deload` |
| 4 | Raw Progress threshold met, and qualifying `< STALL_WINDOW` | `progress` |
| 5 | Raw Progress threshold met, qualifying `>= STALL_WINDOW`, stall gate passes | `progress` |
| 6 | Raw Progress threshold met, qualifying `>= STALL_WINDOW`, stall gate fails | `stalled` |
| 7 | otherwise | `hold` |

Deload is evaluated **before** Progress, so in any defensive conflict Deload wins (never recommend adding load when recent history shows repeated below-range work). Step 1 outranks everything: a scheduled-deload occurrence yields no reactive result even if computed.

Atomic side effects: **none** — Pitch 5 performs no writes. Past-log edits use Pitch 4's `editLoggedSet` transaction; the next read recomputes.

## 7. UI integration

Reference the design doc and `docs/previews/05-progressive-overload-engine-preview.tsx` for visual detail.

### Screens / surfaces

| Surface | Data needed | Actions |
| ------- | ----------- | ------- |
| Dashboard / today | per planned exercise: reactive tag (free-weight now; gym-variable deferred until gym chosen), scheduled-deload banner + 90% load | Start workout (Pitch 4) |
| Logging card | per exercise: tag, suggested load (if any), gym context, "View trend" link | set entry (Pitch 4); navigate to trend |
| Session summary | per performed exercise: tag + suggested next + trend link; scheduled-deload note | Done |
| Exercise progression detail (`/exercises/[id]`) | current reactive state in active scope, suggested load, e1RM chart points, gym list (gym-variable) | switch gym (`?gym=`) |

### Components

| Component | Data contract | Notes |
| --------- | ------------- | ----- |
| `ProgressTag` (client-safe, pure) | `state: "progress" \| "deload" \| "stalled"` | returns `null` for hold/insufficient/suppressed; text label always present; stalled uses deload color + `AlertTriangle`, never the word "Deload" |
| `E1rmChart` (client island) | `points: E1rmPointDto[]`, `scope?: string` | Recharts `LineChart` in `ResponsiveContainer`, `primary` line; scheduled-deload points marked (shape + muted); read-only; accessible caption/table |
| `GymSelector` (client island) | `gyms: {id,name}[]`, `value` | gym-variable only, rendered when `>= 2` gyms have qualifying history; writes `?gym=` query param |
| `ScheduledDeloadBanner` | none | muted week-level banner; mutually exclusive with reactive tags |

`E1rmChart` and `GymSelector` are the only new client islands; they receive server-computed data and hold no data access. Recharts is the approved charting library (Architecture / CLAUDE.md) and is added as a dependency here.

## 8. Data model

**No schema changes.** Pitch 5 adds no models, no columns, no enums, no migrations. Every output is derived on read from existing tables.

### Tables read

| From | Relation | To | Use |
| ---- | -------- | -- | --- |
| `LoggedExercise` | →`sets` | `LoggedSet` | reps/weights for e1RM and thresholds |
| `LoggedExercise` | →`loggedSession` | `LoggedSession` | `status = complete`, `scheduledFor`, `mesocycleId` |
| `LoggedExercise` | →`exercise` | `Exercise` | `equipmentType` → `isGymVariable`; name |
| `LoggedExercise` | `.gymId` | `Gym` | gym scope + gym name |
| `LoggedSession` | →`mesocycle` | `Mesocycle` | `startDate`, `deloadEveryWeeks` → effective week + scheduled-deload |
| `GymExerciseBaseline` | `(gymId, exerciseId)` | — | working-weight source for gym-variable suggestions (read only) |

### Derived fields (all computed on read, none stored)

| Field / Concept | Stored? | Computed From | Notes |
| --------------- | ------- | ------------- | ----- |
| reactive tag (`progress`/`deload`/`stalled`/none) | **no** | qualifying performances + plan context + week | per Exercise, per gym scope for gym-variable |
| `estimateOneRepMax` | **no** | a set's `weightLbs`,`reps` | one shared function; Goals reuse |
| session-level e1RM point | **no** | max per-set e1RM of a performance | one per completed performance |
| e1RM trend | **no** | chronological session points in scope | no trend rows |
| suggested next load | **no** | Pitch 4 working-weight source `+5` or `×0.90` | display only |

RLS: no new tables, so no new `ENABLE ROW LEVEL SECURITY` statements. The derived-state invariant is enforced by a static test asserting `schema.prisma` contains no progression/e1RM columns.

## 9. Authorization and access control

No new resources. The engine is read-only, invoked from server components and from the exercise-detail page already behind `(app)` auth. The gym-selector island changes a query param only; it triggers no mutation. Server reads start from the existing authenticated layout; no server action in this pitch performs a write, so there is no new write-path auth surface. The Supabase client is not used for any application data here.

## 10. Storage model

Not applicable. No Storage interaction.

## 11. Server actions and API surface

Pitch 5 adds **no mutations**. All output is produced by server-side read functions (server components call them directly). There is no new server action because there is nothing to write.

New read module: `src/lib/progression/queries.ts` (server-only, Prisma). Representative signatures:

```ts
// server-only
export async function getExerciseProgression(
  exerciseId: string,
  gymId?: string | null, // selected gym scope for gym-variable; ignored otherwise
): Promise<ExerciseProgressionDto | null>;

// Per-exercise reactive tag + suggestion for a planned occurrence (today/card),
// honoring scheduled-deload suppression for that occurrence's week.
export async function getOccurrenceProgression(
  loggedExerciseId: string,
): Promise<OccurrenceProgressionDto>;

// Session summary: reactive result + suggestion per performed exercise.
export async function getSessionProgressionSummary(
  loggedSessionId: string,
): Promise<SessionProgressionSummaryDto>;
```

These compose the pure engine (`src/lib/progression/engine.ts`) with Prisma reads. The existing Pitch 4 DTOs (`ExerciseCardDto`, `DashboardExercisePreview`, the completion view, the exercise-detail page) are **extended** with the derived fields rather than replaced, so logging behavior is untouched.

## 11a. Pure domain contracts (the heart of this spec)

All core logic is pure and lives under `src/lib/progression/`, importable without Prisma or React (Decision: Goals reuse e1RM without chart/DB deps).

### `config.ts` — named constants (no magic numbers anywhere else)

```ts
/** Minimum completed qualifying performances before any reactive call. */
export const MIN_QUALIFYING_SESSIONS = 2;
/** Consecutive qualifying performances required for a raw Progress candidate. */
export const PROGRESS_CONSECUTIVE_SESSIONS = 2;
/** Consecutive qualifying performances required for a reactive Deload. */
export const DELOAD_CONSECUTIVE_SESSIONS = 2;
/** e1RM stall window; the gate only operates once this many qualifying points exist. */
export const STALL_WINDOW_SESSIONS = 3;
/** Suggested load increment on a valid Progress (lbs). */
export const PROGRESS_INCREMENT_LBS = 5;
/** Scheduled-deload working-load factor. */
export const SCHEDULED_DELOAD_FACTOR = 0.9;
/** Load granularity for rounding the scheduled-deload suggestion (lbs). */
export const LOAD_STEP_LBS = 5;
```

All are **Bucket C tunable defaults** (not PRD-derived); expected to be re-tuned from lived usage.

### `e1rm.ts` — one canonical formula

```ts
/**
 * Epley estimated 1-rep max. THE one formula; Goals (Pitch 6) import this exact
 * function. Special case: 1 rep returns the weight exactly.
 *   e1RM = weight * (1 + reps / 30);  reps === 1 -> weight
 */
export function estimateOneRepMax(weightLbs: number, reps: number): number;

/** Max Epley estimate among a performance's valid working sets (Decision R18). */
export function sessionE1rm(
  workingSets: { weightLbs: number; reps: number }[],
): number;
```

Validation/handling: `reps >= 1`, `weightLbs > 0` (matches Pitch 4's stored constraints, so historical data is always valid). Reps far above the expected range still use the same formula (no second branch); the function never throws on valid stored data.

### `engine.ts` — pure reactive evaluator

```ts
export type Performance = {
  loggedExerciseId: string;
  dateIso: string;          // LoggedSession.scheduledFor (effective-week identity)
  week: number;             // effective mesocycle week of the occurrence
  scheduledDeload: boolean; // week % deloadEveryWeeks === 0
  gymId: string | null;
  complete: boolean;        // all plannedSets working sets present
  repMin: number;           // this performance's own planned range
  repMax: number;
  workingSets: { setNumber: number; weightLbs: number; reps: number }[];
};

export type ReactiveState =
  | "insufficient" | "hold" | "progress" | "deload" | "stalled";

/**
 * The qualifying sequence: complete performances that are NOT scheduled-deload,
 * chronological. Incomplete and scheduled-deload performances are excluded
 * (Decisions R9, R24, R38, R43–R44). For gym-variable exercises the caller must
 * pass only the selected gym's performances (Decisions R12, R16, R42).
 */
export function qualifyingSequence(perfs: Performance[]): Performance[];

/** The full precedence ladder in §6. Pure; no suggestion number (needs DB). */
export function evaluateReactive(perfs: Performance[]): ReactiveState;

/** True iff every working set reached the top of that performance's range. */
export function isAllTop(p: Performance): boolean;        // every reps >= repMax
/** True iff at least one working set fell below that performance's minimum. */
export function hasBelowMin(p: Performance): boolean;     // some reps < repMin
```

Engine rules (exact):

- `evaluateReactive` filters to `qualifyingSequence`. If length `< MIN_QUALIFYING_SESSIONS` → `insufficient`.
- **Deload** (checked first): the most recent `DELOAD_CONSECUTIVE_SESSIONS` qualifying performances each satisfy `hasBelowMin` → `deload`.
- **Progress candidate**: the most recent `PROGRESS_CONSECUTIVE_SESSIONS` qualifying performances each satisfy `isAllTop`.
  - If candidate and qualifying length `< STALL_WINDOW_SESSIONS` → `progress` (stall gate not yet active — Decision R24; preserves the 2-session threshold).
  - If candidate and qualifying length `>= STALL_WINDOW_SESSIONS`: take the most recent `STALL_WINDOW_SESSIONS` session-level e1RM points; `start = oldest`, `end = newest`. `end > start` → `progress`; `end <= start` → `stalled` (Decisions R22–R25).
- Else → `hold`.

Fixed-range sanity: a `5–5` range makes `repMin === repMax === 5`; `isAllTop` and `hasBelowMin` both behave correctly (all reps `>= 5` for progress; any `< 5` for deload).

### `deload.ts` — scheduled-deload helpers (pure)

```ts
export function isScheduledDeloadWeek(week: number, deloadEveryWeeks: number): boolean;
// deloadEveryWeeks > 0 && week > 0 && week % deloadEveryWeeks === 0

/** 90% of a working-weight context, floored to the load step; never above 90%. */
export function scheduledDeloadLoad(baseLbs: number): number;
// Math.floor((baseLbs * SCHEDULED_DELOAD_FACTOR) / LOAD_STEP_LBS) * LOAD_STEP_LBS
```

Worked: `200 → 180`, `185 → 166.5 → 165`, `100 → 90`. Floor guarantees the suggestion never exceeds the raw 90% target (Decision R35). If the repository later introduces a stronger canonical weight-step abstraction, reuse it while preserving round-down-not-above semantics.

### Suggested-load derivation (query layer, reuses Pitch 4 source)

| Case | Working-weight source | Suggestion |
| ---- | --------------------- | ---------- |
| Progress, gym-consistent | latest `LoggedSet.weightLbs` for that exercise (existing Pitch 4 `suggestedWeight` source) | `+ PROGRESS_INCREMENT_LBS` |
| Progress, gym-variable | selected gym's `GymExerciseBaseline.weightLbs` | `+ PROGRESS_INCREMENT_LBS` |
| Scheduled deload, gym-consistent | latest `LoggedSet.weightLbs` | `scheduledDeloadLoad(...)` |
| Scheduled deload, gym-variable | selected/current gym's baseline | `scheduledDeloadLoad(...)` |
| No working-weight context | — | **omit the number**; show state only (Decisions R31, R36) |

The suggestion is never written and never mutates the baseline, plan, or any set (Decisions R28, R30, R34, R47).

## 12. Validation rules

The engine consumes already-validated stored data (Pitch 4 enforces `weightLbs > 0`, `reps >= 1`, planned sets). No new user input is introduced except the `?gym=` query param:

| Input | Validation | Behavior |
| ----- | ---------- | -------- |
| `?gym=<uuid>` | must be a UUID of a gym with qualifying history for this exercise | invalid/absent → default to the most-recent gym with history; never error the page |

Defensive: if a performance is structurally incomplete (fewer sets than `plannedSets`), it is excluded from the qualifying sequence rather than rejected. If no working-weight context exists for a suggestion, the number is omitted, never guessed.

## 13. UI data contracts

```ts
export type ProgressionTag = "progress" | "deload" | "stalled"; // null => hold/none

export type SuggestedLoadDto = {
  lbs: number;
  kind: "progress_increment" | "scheduled_deload"; // "+5" vs "90%"
} | null;

export type E1rmPointDto = {
  dateIso: string;
  dateLabel: string;       // formatPlanDate
  e1rm: number;            // rounded for display
  scheduledDeload: boolean; // marked on chart; excluded from calls
  gymName: string | null;  // present for gym-variable scope
};

export type ExerciseProgressionDto = {
  exerciseId: string;
  exerciseName: string;
  isGymVariable: boolean;
  isArchived: boolean;
  // Active gym scope (gym-variable only):
  gyms: { id: string; name: string }[]; // gyms with qualifying history; >=2 => show selector
  selectedGymId: string | null;
  selectedGymName: string | null;
  // Derived current state in the active scope:
  tag: ProgressionTag | null;        // null => hold (render nothing)
  state: "insufficient" | "hold" | "progress" | "deload" | "stalled";
  suggestion: SuggestedLoadDto;      // present only for progress in this view
  currentE1rm: number | null;
  qualifyingCount: number;
  points: E1rmPointDto[];            // chronological; includes scheduled-deload (marked)
};

export type OccurrenceProgressionDto = {
  loggedExerciseId: string;
  scheduledDeloadWeek: boolean;      // true => no tag, show 90% load
  tag: ProgressionTag | null;        // null during scheduled deload or hold/insufficient
  suggestion: SuggestedLoadDto;      // +5 (progress) or 90% (scheduled deload) or null
  hasTrend: boolean;                 // >=1 point => show "View trend"
};

export type SessionProgressionSummaryDto = {
  loggedSessionId: string;
  scheduledDeloadWeek: boolean;
  exercises: {
    performedExerciseId: string;
    performedExerciseName: string;
    tag: ProgressionTag | null;
    suggestion: SuggestedLoadDto;
    hasTrend: boolean;
  }[];
};
```

Derived names (`tag`, `estimateOneRepMax`/`e1rm`, `suggestion`) are identical across every surface. No credentials or raw Prisma rows cross the boundary.

## 14. Testing strategy

Pure functions are tested exhaustively; the read layer with an integration DB. Priority order matches CLAUDE.md (history integrity → baseline isolation → progression engine → missed-day → auth/RLS).

**1. Derived-state invariants (adversarial, first)**
- GIVEN `schema.prisma` WHEN scanned THEN no `progressionTag`/`needsDeload`/`stalled`/`e1rm`/`latestE1rm`/`trend`/`suggestedWeight`/`nextWeight` column exists (static guard, extends the Pitch 1 guard).
- GIVEN the repo WHEN scanned THEN no cron/scheduler/queue/background-job module is introduced.
- GIVEN Pitch 5 code WHEN scanned THEN it contains no `prisma.loggedSet.create/update/delete` and no `GymExerciseBaseline` write (engine is read-only; the only LoggedSet writer remains `src/lib/logging/logged-sets.ts`).

**2. Epley**
- `estimateOneRepMax(200, 1) === 200` (special case).
- `estimateOneRepMax(185, 8) ≈ 185 * (1 + 8/30)`.
- Exactly one implementation exists (grep guard); progression + chart both import it; it is exported for Goals and has no chart/Prisma import.

**3. Session-level e1RM** — max set wins; changing which set is strongest changes the point.

**4. Minimum history** — 0 → none; 1 → none; 2 → eligible.

**5. Progress threshold** (`3×6–8`) — `8/8/8` ×2 consecutive → progress; one non-top set in one session → not progress. Exact boundaries.

**6. Reactive Deload** (`3×8–10`) — a sub-8 set in each of 2 consecutive → deload; sub-8 in only one → not deload.

**7. Hold** — neither threshold → `hold`, `tag === null`.

**8. Precedence** — conflicting state → deload beats progress; scheduled-deload suppression beats all reactive.

**9. Stall window** — 2 qualifying all-top → progress (gate inactive); 3 qualifying, `end > start` → progress; `end === start` → stalled; `end < start` → stalled; stalled `!== deload`.

**10. Free-weight cross-gym** — qualifying performances at different gyms form one sequence; one global trend.

**11. Machine/cable gym scope** — build history at Gym A and Gym B for one machine exercise; Gym A threshold uses only A; Gym B only B; A chart excludes B points and vice-versa; no single cross-gym nominal series; Gym B insufficient history is not satisfied by Gym A.

**12. Gym-specific Progress suggestion** — machine Progress at Gym A → Gym A baseline `+5`; Gym B baseline untouched/unused; displaying the suggestion mutates no baseline.

**13. Free-weight Progress suggestion** — latest working context `+5`; writes nothing.

**14. Scheduled deload** — designated week → 90% suggestion; sets/range unchanged; reactive progress, deload, and stall all suppressed.

**15. Scheduled-deload rounding** — `200 → 180`, `185 → 165`, `100 → 90`; never above raw 90%.

**16. No working-load context** — scheduled-deload state present, numeric omitted.

**17. Scheduled-deload sequence exclusion** — normal, scheduled-deload, normal → the deload performance is not one of the consecutive reactive sessions.

**18. Scheduled-deload chart** — deload point visible + marked; excluded from stall window.

**19. Shifted workouts** — shifted into deload week → deload applies; shifted out → normal. (Given Pitch 4 within-week shifts, the effective week equals the authored week; the test asserts the week source is the occurrence, not `performedOn`/entry time.)

**20. Log-late** — evaluation uses the occurrence's historical week, not the data-entry timestamp.

**21. Skipped day** — no LoggedExercise → no evidence; never a below-range performance.

**22. Partial workout** — incomplete LoggedExercise excluded from sequences.

**23. Historical rep ranges** — performances with different ranges each judged against their own range.

**24. Swap history** — swapped sets count toward the performed exercise, not the planned one.

**25. Past-log editing** — edit via Pitch 4 path; on next read set e1RM, session point, chart, tag, and stall may change; no recompute row written.

**26. Past scheduled-deload edit** — remains excluded from reactive evaluation.

**27. Existing invariants stay green** — no LoggedSet writes outside the module; archival preserves history; referenced hard delete rejected; baseline isolation & atomicity.

**28. UI behavior** — `ProgressTag` renders nothing for hold/insufficient/suppressed; stalled distinct from deload; chart read-only; gym selector only with ≥2 gym histories; mobile layout matches the preview.

## 15. Acceptance criteria

**Engine**
- [ ] Progress shown only when: ≥2 qualifying history, all working sets at top for 2 consecutive qualifying sessions, not scheduled-deload-suppressed, not stall-vetoed.
- [ ] Reactive Deload shown only when ≥1 working set below minimum in each of 2 consecutive qualifying sessions, not suppressed.
- [ ] Hold renders no tag; insufficient history renders no tag.
- [ ] Deload takes precedence over Progress; scheduled-deload suppression takes precedence over all reactive calls.

**e1RM**
- [ ] One canonical Epley `estimateOneRepMax`; 1 rep → weight; exported for Goals; no second formula.
- [ ] Session point = max working-set e1RM; trend is chronological and derived; crosses mesocycles; gym-scoped for gym-variable.

**Stall**
- [ ] 2 qualifying → Progress may appear; 3 qualifying → gate active; `end <= start` → stalled, `!== deload`.

**Suggestions**
- [ ] Progress → `+5` from the correct working-weight source; scheduled deload → 90% floored to 5; never applied; never mutates baseline/plan/history; omitted when no context.

**Gym semantics**
- [ ] Gym-consistent global; gym-variable scoped to `(exerciseId, gymId)`; no cross-gym nominal line; no invented conversion.

**Historical correction**
- [ ] Editing a past set changes derived reads automatically; no recompute button, job, or stored result; past scheduled-deload stays suppressed.

**Derived-never-stored**
- [ ] No tag/e1RM/trend/recommendation column, table, or cache; no cron/scheduler/job.

**UI**
- [ ] Matches the preview for Progress, Deload, Hold (no tag), stalled, scheduled-deload, suggested load, e1RM chart, gym-scoped machine trend, and mobile.

## 16. Explicit non-goals

- ❌ Program/mesocycle generation. **Permanent.** A `+5` suggestion is a load hint, not a plan edit.
- ❌ Social/sharing/leaderboard/streak/celebration. **Permanent.**
- ❌ Progression analysis of cardio. **Permanent.**
- ❌ Stored progression tag / e1RM / trend cache. **Permanent** (core invariant).
- ❌ Cron / scheduler / background recompute. **Permanent.**
- ❌ Auto-applied `+5`, auto-modified `SessionExercise`/baseline/future sets. **Permanent.**
- ❌ Cross-gym machine-weight conversion ratios. **Permanent** (contradicts the gym-baseline premise).
- ❌ Goals (targets, %, completion, archive). **Deferred** to Pitch 6 (reuses `estimateOneRepMax`).
- ❌ Numeric target for reactive Deload. **Deferred** (only scheduled deload computes a number here).
- ❌ RPE/RIR. **Deferred.**

## Resolved Decisions

Every decision below is approved authority for this run (from the run prompt's Pre-resolved decisions). Rationale and authority recorded; not to be reopened.

| # | Decision | Rationale | Authority |
| - | -------- | --------- | --------- |
| R1 | Progression tags, e1RM, stall, suggestions are **never stored**; computed on read. | A stored tag goes stale when history is edited; a computed one cannot. Data volume is trivial. | CLAUDE.md core invariant; pitch "Derived, Never Stored"; run prompt §1 |
| R2 | **No** cron/scheduler/queue/worker/recompute job. | Derived-on-read makes past-log edits propagate automatically; a job adds sync risk with no value. | CLAUDE.md (no scheduler); run prompt §2 |
| R3 | Constants live in `src/lib/progression/config.ts`; no magic numbers elsewhere. | Single tunable home; matches `lib/progression/config.ts` responsibility named in CLAUDE.md. | CLAUDE.md; pitch "Thresholds are named constants" |
| R4 | Minimum qualifying history = **2**. | Below 2 there is no consecutive sequence; false calls forbidden. | Pitch §1; run prompt §3 |
| R5 | Progress = top of range on **every** working set for **2** consecutive qualifying sessions. | Pitch threshold; deterministic. | Pitch §2; run prompt §4 |
| R6 | Reactive Deload = ≥1 working set below minimum in **2** consecutive qualifying sessions. | Requires repeated evidence, not one bad day. | Pitch §3; run prompt §5 |
| R7 | Hold = neither; **no tag**. | Absence is the signal; symmetry is not a reason to add a badge. | CLAUDE.md; pitch §4/§32; run prompt §6 |
| R8 | Each historical performance uses the rep range that applied when performed (`LoggedExercise` snapshot). | Pitch 4 preserves plan context precisely to allow this; never reinterpret old history against today's plan. | Pitch §13; method-note; run prompt §8 |
| R9 | Only completed planned working sets participate; warm-ups/extra/partials excluded. | Pitch 4 supports planned working sets only. | Pitch §Edge; run prompt §9 |
| R10 | Progression belongs to the **performed** exercise (swaps count there, not the planned one). | Plan-vs-logged distinction; `exerciseId` is performed. | Pitch §12; run prompt §10 |
| R11 | Gym-consistent exercises → **global** progression + trend across gyms. | Free-weight/`plate_loaded` resistance is comparable across locations. | Pitch §29; run prompt §11 |
| R12 | Gym-variable exercises → progression scoped to `(exerciseId, gymId)`. | Nominal machine pounds are not comparable across gyms (product's second premise). | PRD; pitch §28/§Source-Gap 6; run prompt §12 |
| R13 | Gym-variable e1RM trend is gym-scoped; one gym's series at a time; compact gym selector when >1 gym has history. | Preserves gym-specific weight semantics; avoids a deceptive cross-gym line. | Pitch §Source-Gap 6; run prompt §13 |
| R14 | Gym-variable recommendation is gym-scoped; before gym selection, no fabricated machine recommendation. | A nominal increment is not valid at every gym. | Pitch §7 (Source Gaps); run prompt §14–15 |
| R16 | A new gym has independent history; <2 qualifying there → no call even if another gym has history. | The other gym's nominal performance is not qualifying evidence here. | run prompt §16 |
| R17 | One Epley `estimateOneRepMax` (`w*(1+reps/30)`, 1 rep → `w`); Goals reuse it. | One interpretation of strength across progression and goals. | Pitch §7; run prompt §17 |
| R18 | Session-level e1RM = **max** Epley among the performance's working sets. | Represents demonstrated capacity, not fatigue average. Upstream left this open; introduced by Pitch 5. | Pitch §9/§Source-Gap 1; run prompt §18 |
| R19 | e1RM trend is chronological, derived; gym-scoped for gym-variable. No trend rows, no latest-e1RM field. | Core invariant. | Pitch §10; run prompt §19 |
| R20 | Trend crosses mesocycle boundaries (within gym scope for gym-variable). | A new block doesn't erase strength history. | Pitch §11; run prompt §20 |
| R21 | Historical e1RM points use actual `LoggedSet` weight; never rewritten by later baseline changes. | A set is factual history; the baseline is future-facing context. | Pitch §Gym-context; run prompt §21 |
| R22 | Stall window = most recent **3** qualifying points (same gym scope for gym-variable). | Secondary stall detector per standing default. | Pitch §15; run prompt §22 |
| R23 | Stall compares oldest vs newest of the window: `end > start` passes; `end <= start` withholds. | Standing pipeline resolution. | Pitch §16; run prompt §23 |
| R24 | Stall gate activates only at 3 qualifying points; with exactly 2 all-top, Progress proceeds. | Otherwise the documented 2-session threshold is secretly 3. | Pitch §Source-Gap 2; run prompt §24 |
| R25 | Stalled ≠ Deload; distinct restrained attention state, never Deload styling/word. Copy: "Hold — trend flat". | Rep threshold met but strength flat; not repeated below-range. | Pitch §17; run prompt §25 |
| R26 | Stall only gates Progress; it is not an independent Deload mechanism. | If reactive Deload fires, return Deload. | Pitch §18; run prompt §26 |
| R27 | Progress increment = **+5 lb** (named constant). | Standing default; suggestion-only. | Pitch §5; run prompt §27 |
| R28 | Progress suggestion never auto-applied (no plan/baseline/future-set/history mutation). | Recommendation is not action. | Pitch §5/§35; run prompt §28 |
| R29 | Free-weight Progress suggestion = latest Pitch 4 working-weight context `+5`; no new stored current-weight field. | Reuse the single Pitch 4 weight source. | Pitch §6; run prompt §29 |
| R30 | Machine Progress suggestion = that gym's baseline `+5`; never another gym's; never updates the baseline on display. | Baseline changes only via Pitch 4 logging/correction. | Pitch §6/§21; run prompt §30 |
| R31 | No applicable working-weight context → show the tag, omit the number. | Fail safe; never fabricate. | Pitch §Edge; run prompt §31 |
| R32 | Scheduled and reactive deload are separate systems. | Explicit project authority. | CLAUDE.md; pitch §Scheduled; run prompt §32 |
| R33 | Scheduled-deload load = **90%** of normal; sets & rep range unchanged. | Standing default. | Pitch §20; run prompt §33 |
| R34 | Scheduled-deload weight source = same as normal logging (baseline / latest) ×0.90; no separate deload-weight field. | One weight source. | Pitch §21; run prompt §34 |
| R35 | Scheduled-deload load rounds **down** to nearest 5 lb (`LOAD_STEP_LBS`); never above raw 90%. | Practical loadable number; never prescribe more than target. Upstream left rounding open; introduced by Pitch 5. No stronger weight-step abstraction exists in the repo today. | Pitch §22/§Source-Gap 4; run prompt §35 |
| R36 | No normal working-weight context → scheduled-deload state shows without a numeric load. | Never fabricate. | Pitch §Edge; run prompt §36 |
| R37 | Reactive progression fully suppressed during scheduled deload (not computed-and-hidden). | Explicit authority. | CLAUDE.md; pitch §23; run prompt §37 |
| R38 | Scheduled-deload performances excluded from reactive/stall sequences (still real history). | Deliberately reduced work is not reactive evidence. | Pitch §24; run prompt §38 |
| R39 | Scheduled-deload points remain visible on the e1RM chart, visually marked; excluded from sequences. | Separate historical visibility from reactive eligibility. Upstream open; Pitch 5 interpretation. | Pitch §Source-Gap 5; run prompt §39 |
| R40 | Reactive evaluation resumes immediately after the scheduled-deload week. | Suppression is week-scoped. | Pitch §DoD 11; run prompt §40 |
| R41 | Scheduled-deload context comes from the **effective occurrence** week (shift/log-late), not the entry timestamp. Given Pitch 4 within-week shifts, effective week == authored `scheduledFor` week. | PRD shift semantics; the week source must be the occurrence. | PRD; pitch §25–26; run prompt §41 |
| R42 | Current result uses the most recent qualifying history in the correct scope (gym-scoped for gym-variable). | A later performance at another gym must not supersede this gym's machine state. | run prompt §42 |
| R43 | Skipped days are not failed performances (no LoggedExercise, no evidence). | Absence ≠ below-range. | Pitch §Edge; run prompt §43 |
| R44 | Incomplete workouts are not qualifying performances. | Only completed required working sets qualify. | Pitch §Edge; run prompt §44 |
| R45 | Past-log edits change all derived outcomes on next read; no recompute path. | Core invariant. | Pitch §39; run prompt §45 |
| R46 | Editing a scheduled-deload set never makes that occurrence qualify for reactive progression. | Suppression is permanent for that occurrence. | Pitch §40; run prompt §46 |
| R47 | Editing history never rewrites gym baseline state; Pitch 5 reads baselines, never replays them. | Honors Pitch 4 baseline contract. | method-note; pitch §Gym-context; run prompt §47 |
| R48 | Chart: one exercise at a time; one gym series for gym-variable with a selector when >1 gym; one global series otherwise. | One readable trend, not a dashboard. | Pitch §36; run prompt §48 |
| R49 | One chart point per completed performance occurrence (date, e1RM, deload marker, gym where useful); not per set. | Readability. | Pitch §37; run prompt §49 |
| R50 | Chart is read-only; corrections happen via Pitch 4's history editor. | No drag/edit interactions. | Pitch §38; run prompt §50 |
| R51 | Progression appears only at decision-relevant surfaces (today after gym, logging view, progression detail, post-session). | No indiscriminate badging. | Pitch §34; run prompt §51 |
| R52 | Post-session summary gains progression interpretation; Goals absent. | Pitch 4's summary was factual-only because progression didn't exist. | Pitch §52-equivalent; run prompt §52 |
| R53 | Hold stays visually quiet (no Progress/Deload/Hold badge). | Nothing to act on. | run prompt §53 |
| R54 | e1RM is a reusable domain function, independent of chart components, so Goals can import it. | Roadmap makes Goals depend on it. | Pitch §Downstream; run prompt §54 |
| R55 | Goals are not built here. | Pitch 6 owns them. | Pitch §Out-of-scope; run prompt §55 |

### Precedence of scheduled-deload with gym-variable (resolved composition)

For a gym-variable exercise on today's card, evaluation requires both the gym (for scope) and the occurrence week (for suppression). If the gym is not yet selected, the card shows neither a reactive tag nor a fabricated number (R14/R15); once selected, if the occurrence week is a scheduled-deload week, suppression (R37) applies and the 90% suggestion uses that gym's baseline (R34).

## 17. Open questions

None blocking. All Source Gaps named in the pitch are resolved above (R18, R24, R25, R35, R39, R12–R14, R7). The sole non-blocking item: the stalled-state exact user-facing copy is owned by design ("Hold — trend flat" is the preview's choice and is adopted).

## 18. Future considerations

- **Goals (Pitch 6)** import `estimateOneRepMax` and the session-point/trend derivation directly; goal percentage = `estimateOneRepMax(currentBest) / estimateOneRepMax(target)`. No second formula. The `src/lib/progression/e1rm.ts` module is deliberately free of Prisma and React imports so Goals can depend on it cleanly.
- The progression config is a single tunable surface; lived-usage tuning of thresholds/increment/deload factor changes only `config.ts`.
- Gym-scoped trend DTOs leave room for a future per-mesocycle annotation overlay without schema change.
