---
version: 1.0.0
status: approved
author: Claude Code (autonomous pipeline run)
last_updated: 2026-10-20
pitch_reference: pitches/13-faster-logging-ux.md (Linear doc 3a938d8d-d8ec-41da-a348-e6e93473834b)
design_reference: docs/design/13-faster-logging-ux-design-doc.md (v1.1)
preview_reference: docs/previews/13-faster-logging-ux-preview.html (binding visual contract)
prd_reference: Downloads/prd (1).md (approved multi-user set; docs/planning/prd.md is the stale single-user copy)
architecture_reference: Downloads/architecture (1).md
roadmap_reference: Downloads/pitch-roadmap (1).md → Pitch 13: Faster Logging UX
linear_issue: Milestone "Faster Logging UX" (Overload V1) — tickets listed in docs/runs/13-faster-logging-ux-progress.md
---

# Faster Logging UX — Technical Specification

## 1. Metadata

See the header. Feature name, exactly as the roadmap: **Faster Logging UX**. Slug `13-faster-logging-ux`.

## 2. Summary

Faster Logging UX refines the Guided Workout Logging exercise card so an ordinary set is one tap after its reps are typed, and so the lifter can see what they did last time without leaving the card. It is a **presentation and read-path** change: the write path for a set (`logSetAction` → `logSet` in `src/lib/logging/logged-sets.ts`) and for a correction (`editLoggedSetAction` → `editLoggedSet`) are reused unchanged. No schema, migration, table, column, action, or write module is added or changed.

The core abstraction is **one active set row**. The card derives, from the server's records alone, which planned set is next (the *active* set), which are *logged* (rows that exist in `LoggedSet`, rendered as text), and which are *upcoming*. The active row is the only place with inputs. Its weight box holds an **offer** — the account's working weight for the first set, or the weight of the most recently logged set in this card — that is local, editable UI state and is never persisted on its own. Reps are never offered. Pressing **Log set** (or Enter) sends exactly what the boxes hold through the canonical action. "A box is a draft; a plain number is history" (design doc §3).

"Working" means: on the representative workout (§14.4) the scripted phone-width walk from the open workout to the dashboard takes fewer screen taps than the Pitch 4 card on the same seeded data; every confirmed set lands in `LoggedSet` exactly as entered and nothing else is written; machines and cables never borrow a weight or a "last time" from another gym; bodyweight stays reps only; and every standing invariant suite stays green.

## 3. Problem

- The app cannot yet show **what the lifter did last time** on the card; it shows one number (`last: 185 lbs`), and for a machine or cable at a gym with no baseline that number can come from **another gym** (`suggestedWeight` falls back to the latest weight logged anywhere — `src/lib/logging/queries.ts`). That is the cross-gym assumption pitch §9.2 forbids and that the Guided Workout Logging (§8 derived fields) and Progressive Overload Engine (§11 suggested-load table, R14) specs never authorised.
- The app cannot yet **carry the weight from set to set**: every unsaved row is prefilled from the working weight at page load, so after set 1 goes to 190, sets 2 and 3 still say 185.
- The app cannot yet tell a **prefilled** box from a **typed** one, and shows a logged set as a pair of disabled inputs, so pending and logged look alike (pitch §4.7, §9.9).
- The card **never moves focus**, ignores Enter, and uses 36px Save buttons: every set costs a tap on the reps field plus a tap on Save.
- A mistyped set can only be **corrected** from History → day → edit, three screens away mid-workout (pitch §4.9, Journey G).

## 4. Scope and non-scope

### In scope

1. **Previous-performance context** (the "Last time" line), gym-scoped for gym-variable exercises.
2. **Gym-scoped working weight**: the set-1 offer (and, because it is the one working-weight source, the existing display-only suggestions) never use another gym's weight for a machine or cable.
3. **Active-row set entry**: logged / active / saving / upcoming / error states, weight offer + reuse, reps never offered.
4. **Focus and keyboard**: Enter flow, focus after a confirmed set, focus hand-off to Next, numeric keypads, `enterKeyHint`, keyboard kept up across sets.
5. **Touch targets**: 48px set fields, 44px Log set, logged rows, runner buttons, Change gym, View trend.
6. **In-card correction**: a logged row opens the existing `EditSetDialog` (History's correction flow).
7. **Runner**: `Next: {exercise}` label, no auto-advance.
8. **Measurement**: the scripted before/after tap count and visible-control count on the representative workout.
9. **Guidance**: the final guidance ticket via `overload-onboarding` (tour decision + one release-note entry).

### Out of scope

- Any change to `logSet`, `editLoggedSet`, `applyBaselineOnCompletion`, validation rules, error messages of the write modules, the baseline threshold, or the progression engine (pitch §7, §10).
- Prefilling reps; prefilling the +5 Progress or 90% deload suggestion; auto-logging, auto-completing, auto-advancing (pitch §4.3, §9.4).
- A rest timer, RIR, new recommendations, exercise-history pages (pitch §7; Pitch 14/15 and Exercise History & PR Intelligence own those).
- The start-workout gym picker, the swap picker, History's layout, missed-day handling, auth, signup, account deletion, email (pitch §7).
- A sticky bottom logging bar or any new always-visible card control (pitch AC-2).

## 5. Core concepts

| Concept | Description |
| ------- | ----------- |
| **Logged set** | A `LoggedSet` row for this `LoggedExercise`. Rendered from the server DTO only, as plain text (`185 lbs × 8`, `18 reps`) with a check. Tappable to correct. |
| **Active set** | `activeSetNumber(sets, plannedSets, pendingExtra)` — the lowest planned set number with no logged row; when every planned set is logged, the pending extra row (after Add set) or none. The only row with inputs. Pure, derived on every render. |
| **Upcoming set** | A planned set above the active one with no logged row. Not interactive. |
| **Offer** | The value placed in the active row's weight box when the lifter has not typed one. Local UI state, never persisted on its own. Exactly: bodyweight → none; else the weight of the **highest-numbered logged set** in this card (caption `same as set N`); else the account's **working weight** (`workingWeightLbs`, caption `last time`); else none (empty box, no caption). |
| **Working weight** | The existing single weight source `currentWorkingWeightLbs` (Pitch 4 R50; Pitch 5 R29/R34), now gym-scoped for gym-variable: this gym's `GymExerciseBaseline`, else the latest weight logged **at this gym**; for gym-consistent exercises the latest weight logged anywhere (unchanged). Never another gym's for a machine or cable. Null for bodyweight. |
| **Dirty weight** | The lifter typed into (or cleared) the active weight box. A dirty value is theirs and is never replaced by a changed offer; an untouched box always shows the current offer. |
| **Previous performance** | The account's most recent earlier `LoggedExercise` of the **performed** exercise with ≥ 1 logged set (§11.1). Gym-scoped for gym-variable. Read-only, display-only, never fed to the engine. |
| **Confirmation** | A Log set press or Enter in the reps field. The only event that calls `logSetAction`. |

Invariants (all existing, restated because this pitch touches their surface):

- `LoggedSet` is written only by `src/lib/logging/logged-sets.ts`; the card calls only `logSetAction` (create) and, through `EditSetDialog`, `editLoggedSetAction` (correct).
- Every read goes through the account-scoped client (`account.db`); the acting account comes from `requireAccount()`, never from the client.
- `Session` / `SessionExercise` are never written while logging.
- Derived values (tag, e1RM, previous-performance line) are computed on read; nothing is stored.

## 6. States and lifecycle

### Set-row state machine (client; derived + local)

| State | Derived from | Inputs | Transition |
| ----- | ------------ | ------ | ---------- |
| `upcoming` | planned set > active, no logged row | none | becomes `active` when every lower planned set is logged |
| `active` (prepared / edited) | `setNumber === activeSetNumber` | weight (if external load) + reps | Log set → validate → `saving` (valid) or `error` (invalid) |
| `saving` | local `pendingSet === setNumber` | disabled | success → server data refresh → `logged`; failure → `error` |
| `error` | local error for `setNumber` | enabled, numbers kept | Log set → `saving` again (idempotent retry) |
| `logged` | a `LoggedSet` exists in the DTO | none (row is a button) | tap → `EditSetDialog`; dialog save → still `logged` with corrected values |

There is **no** local "optimistically logged" state: a row shows the check only when the refreshed server DTO contains the set (pitch §9.4: transitions follow successful confirmation).

### Server lifecycle

Unchanged. `LoggedSession.status` (`in_progress` → `complete`), skip/undo, swap lock, gym lock, completion confirmation: all as Guided Workout Logging ships them.

## 7. UI integration

The design doc v1.1 and the preview are binding for hierarchy, copy, states, and sizes. This section maps them onto code.

### Screens and surfaces

| Surface | File | Change |
| ------- | ---- | ------ |
| Workout runner `/log/[loggedSessionId]` | `src/components/logging/workout-runner.tsx` | `Next: {name}` label (truncate, full accessible name), `h-11` Previous/Next/Finish and Change gym, focus hand-off to/from cards, Next/Finish ref |
| Exercise card | `src/components/logging/exercise-card.tsx` | rewritten set list: logged rows, one active row (form), upcoming rows; Last time line; completion line; offer + reuse; focus rules; `View trend` 44px |
| Edit set dialog | `src/components/logging/edit-set-dialog.tsx` | optional `trigger` prop (default: the existing `edit` button) and reset of field state to the stored values every time it opens. Content, copy, validation, and action unchanged |
| History detail | `src/app/(app)/history/[loggedSessionId]/page.tsx` | none (uses the default trigger) |
| Workout page | `src/app/(app)/log/[loggedSessionId]/page.tsx` | none beyond passing the richer DTO (it already passes `workout`) |

### Components

| Component | Data contract | Notes |
| --------- | ------------- | ----- |
| `ExerciseCard` | `exercise: ExerciseCardDto` (§13), `gymLocked`, `swapSlot`, `progression`, **new** `focusOnMount: boolean`, **new** `onPlannedSetsDone?: () => void` | `focusOnMount` is true only when the card was reached by Next/Previous (never on page load). `onPlannedSetsDone` fires once when a confirmed write completes the planned sets, so the runner can focus Next/Finish. |
| Active row | internal | a `<form noValidate onSubmit>`; weight `Input` + reps `Input` + `Button type="submit" size="lg"`. The button has `onPointerDown={e => e.preventDefault()}` so it never takes focus from the field (keeps the phone keyboard up). |
| Logged row | internal | `EditSetDialog` with `trigger` = a full-row `<button type="button">` (`min-h-11 w-full rounded-md px-2 text-left hover:bg-muted/50 focus-visible:ring-2`). Accessible name: `Set 1, 185 pounds, 8 reps, logged. Correct this set` (bodyweight: `Set 1, 18 reps, logged. Correct this set`). |
| Pure helpers | `src/lib/logging/set-entry.ts` (new, no imports beyond types and `calendar.ts`; client-safe) | `activeSetNumber`, `offerFor`, `formatPreviousPerformance`, `formatSetSummary`, `loggedRowLabel` — all unit-tested |

### shadcn/ui integration

- `Input` with `className="h-12 pr-12 text-lg font-medium tracking-tight tabular-nums"` and an absolutely positioned muted unit (`lbs` / `reps`, `pointer-events-none`), inside a `relative` wrapper. Weight: `inputMode="decimal" enterKeyHint="next" autoComplete="off"`. Reps: `inputMode="numeric" pattern="[0-9]*" enterKeyHint="done" autoComplete="off"`. `aria-label`s unchanged: `Set N weight in pounds`, `Set N reps`. The caption is `aria-describedby` on the weight field.
- `Button size="lg"` (h-11) for Log set; label `Log set` with `Check` icon; below 360px viewport the label is `Log` (`<span className="max-[359px]:hidden"> set</span>`), never wrapping. Saving: disabled, label `Saving…`.
- Active row container: `rounded-md border-l-2 border-primary bg-muted/40 p-2 space-y-1.5`.
- Upcoming row: `flex min-h-9 items-center gap-3 px-2 text-sm text-muted-foreground` with `Set N` and `—`; screen-reader text `Set N, not logged yet`.
- Logged numbers: `text-base tabular-nums text-foreground`, unit `text-sm text-muted-foreground`; `Check` `size-4 text-primary aria-hidden`.
- Errors: `<p role="alert" className="text-xs text-destructive">` under the active row.
- Completion: `<p className="text-sm text-muted-foreground">All N sets logged.</p>` (N = planned sets) once every planned set is logged and no extra row is pending.
- Tokens only; light and dark per `globals.css`. No new tokens.

### Focus rules (design doc §7, normative)

| Moment | Implementation |
| ------ | -------------- |
| Page load | no focus call. `focusOnMount` is false for the first card the runner renders. |
| Weight field focus, value is the (non-dirty) offer | `onFocus` → `event.currentTarget.select()` |
| Enter in weight | `onKeyDown` Enter → `preventDefault()`, focus reps |
| Enter in reps | form submit → confirm |
| Confirm, invalid | focus the field at fault (weight first) |
| Confirm, write fails | focus reps |
| Confirm, write succeeds | set `focusNext` ref; after the refreshed DTO changes `activeSetNumber` (`useLayoutEffect` on it), focus the new active row's reps field, or its weight field when it has no offer; if no active row remains and the planned sets just completed, call `onPlannedSetsDone()` |
| `onPlannedSetsDone` (runner) | focus the Next button, or Finish workout on the last exercise |
| Next / Previous | runner sets `focusOnMount` for the next render; the new card focuses its active field by the same rule, or its title (`tabIndex={-1}` heading) when nothing is left |
| EditSetDialog closes | Radix default: focus returns to the logged row |

### Forms and validation (client mirrors server; server is authoritative)

| Field | Type | Required | Rule | Message |
| ----- | ---- | -------- | ---- | ------- |
| weight | decimal string → number | if `requiresExternalWeight` | finite, > 0 (server also ≤ 9999.99) | `Enter a weight above 0.` |
| reps | string → integer | yes | integer > 0 (server also ≤ 1000) | `Enter reps above 0.` |

Server `validation_error` with `details` → show `details.weightLbs` / `details.reps` (else `message`) under the row and focus that field. `conflict` → show the message and `router.refresh()`. Any other failure → the action's message (`Couldn't save. Your numbers are still here.`).

## 8. Data model

**No change.** No Prisma model, field, enum, index, migration, trigger, or RLS statement is added, altered, or removed. `prisma migrate status` on the local stack must remain "up to date" with the same migration list as `main`.

### Relationship to existing schema (read only)

| From | Relation | To | Used for |
| ---- | -------- | -- | -------- |
| `LoggedExercise.exerciseId` | many → one | `Exercise` | previous performance of the performed exercise (`@@index([exerciseId])`) |
| `LoggedExercise.gymId` | many → one | `Gym` | gym scope for gym-variable (`@@index([gymId])`) |
| `LoggedExercise.loggedSessionId` | many → one | `LoggedSession.scheduledFor` | "on or before this workout's date" ordering |
| `GymExerciseBaseline (gymId, exerciseId)` | — | — | working weight for gym-variable (read only) |

### Derived fields

| Field / Concept | Stored? | Computed from | Notes |
| --------------- | ------- | ------------- | ----- |
| `previousPerformance` | no | the account's `LoggedExercise` + `LoggedSet` rows | §11.1 |
| `suggestedWeightLbs` (the working weight; name kept) | no | baseline / latest set (gym-scoped for gym-variable) | §11.2 |
| active set, offer, caption, set states | no (client) | DTO + local typed values | never sent to the server except as a confirmed set |
| progression tag / e1RM / suggested load | no | unchanged engine | unchanged |

## 9. Authorization and access control

- Every read added here runs inside `getWorkout(account, …)` on `account.db` (the DMMF query extension that applies `userId` to every owned model). No raw `prisma` import is added outside `src/lib/data`; the standing guard tests (`tests/unit/account-isolation-guards.test.ts`, `tests/unit/invariant-guards.test.ts`) must pass unchanged.
- `getWorkout` of another account's `loggedSessionId` is still `null` → `notFound()`; previous performance can only ever be computed from the acting account's rows, so another account's history is neither shown nor detectable (same exercise id, same gym name, same dates produce nothing).
- The card's only mutations are the existing server actions, which call `requireAccount()` first. No new action, route handler, or client fetch.
- RLS stays deny-all; no table is touched.

## 10. Storage model

Not applicable.

## 11. Server reads and module surface

### 11.1 `previousPerformance` (in `src/lib/logging/queries.ts`, server-only)

```ts
export type PreviousPerformanceDto = {
  dateIso: string;            // the earlier workout's scheduledFor (YYYY-MM-DD)
  gymScoped: boolean;         // true for gym-variable: "Last time here"
  sets: { setNumber: number; weightLbs: number | null; reps: number }[]; // setNumber asc, extras included
};

async function previousPerformance(
  account: Account,
  current: { loggedExerciseId: string; exerciseId: string; gymId: string | null; gymVariable: boolean;
             scheduledFor: Date; createdAt: Date },
): Promise<PreviousPerformanceDto | null>;
```

Selection (one `findFirst` on `account.db.loggedExercise`):

- `exerciseId = current.exerciseId` (the **performed** exercise), `id ≠ current.loggedExerciseId`, `sets: { some: {} }`.
- gym-variable: `gymId = current.gymId`; if `current.gymId` is null → return `null` without querying (no gym, no machine context). Gym-consistent (free weight, plate-loaded, bodyweight): any gym.
- "earlier": `loggedSession.scheduledFor < current.scheduledFor`, **or** same `scheduledFor` and `createdAt < current.createdAt`.
- order: `loggedSession.scheduledFor desc`, then `createdAt desc`. Any mesocycle; archived exercises/gyms are not filtered (history rule).
- include `sets` ordered by `setNumber asc` (weights as numbers; `null` stays `null` for bodyweight).

### 11.2 Working weight — gym scope (`suggestedWeight` / `currentWorkingWeightLbs`)

```ts
// gym-variable (machine, cable):
//   gymId null                → null
//   baseline at (gymId, ex)   → baseline
//   else latest set with weight at THIS gym (loggedExercise: { exerciseId, gymId }) → that weight
//   else                      → null            // never another gym's weight
// gym-consistent: latest set with a non-null weight for the exercise, any gym (unchanged)
```

This is the only behavior change in a server function. Its consumers: the card's set-1 offer, and `getOccurrenceProgression` / `getExerciseProgression` suggested loads (Pitch 5). For those, the effect is that a machine/cable exercise at a gym with no baseline and no history there shows the tag without a number (Pitch 5 R31/R36) instead of a number derived from another gym — which is what the Pitch 5 suggested-load table already specifies. No rule, threshold, or tag changes.

### 11.3 `getWorkout` DTO additions

`ExerciseCardDto` gains `previousPerformance` and each set row gains `loggedSetId` (§13). `getWorkout` must select `createdAt` on each `LoggedExercise` and `scheduledFor` on the session (already present). Reads run per exercise as today (a workout has ≤ ~10 exercises; no N+1 concern worth a new index — the existing `exerciseId` and `gymId` indexes serve them).

### 11.4 `src/lib/logging/set-entry.ts` (new, pure, client-safe)

```ts
export type CardSet = { setNumber: number; weightLbs: number | null; reps: number | null; saved: boolean; extra: boolean };

/** Lowest planned set with no logged row; else the pending extra; else null. */
export function activeSetNumber(sets: CardSet[], plannedSets: number, pendingExtra: number | null): number | null;

/** The weight offered to the active row and its caption source. */
export function offerFor(args: { requiresExternalWeight: boolean; sets: CardSet[]; workingWeightLbs: number | null }):
  | { weightLbs: number; source: { kind: "previous_set"; setNumber: number } | { kind: "working_weight" } }
  | null;

/** "185 × 8, 8, 7" | "185 × 8, 190 × 6, 190 × 5" | "18, 15 reps". */
export function formatSetSummary(sets: { weightLbs: number | null; reps: number }[]): string;

/** The context line: "Last time · Oct 13 · 185 × 8, 8, 7", "Last time here · …",
 *  "First time on this at Downtown Gym.", or "First time logging this." */
export function formatPreviousPerformance(args: {
  previous: { dateIso: string; gymScoped: boolean; sets: { weightLbs: number | null; reps: number }[] } | null;
  isGymVariable: boolean; gymName: string | null; referenceIso: string;
}): string;
```

- Weights print without trailing zeros (`182.5`, `185`).
- Dates: `formatMonthDay(iso, referenceIso)` added to `src/lib/plan/calendar.ts` (the one home for date semantics): `Oct 13`, or `Dec 29, 2025` when the year differs from the reference (this workout's date). UTC string math like the rest of the module.
- gym-variable with no previous performance and a gym → `First time on this at {gymName}.`; otherwise no previous performance → `First time logging this.`

### Error format

Unchanged `ActionResult` (api-conventions). No new codes.

## 12. Validation rules

Server validation is unchanged and authoritative (`validateValues` in `logged-sets.ts`):

| Field | Validation | Error |
| ----- | ---------- | ----- |
| `weightLbs` (external load) | number, finite, > 0, ≤ 9999.99 | `validation_error` · `Enter a weight above 0.` |
| `weightLbs` (bodyweight) | absent / null (any value rejected) | `validation_error` · `This is a bodyweight exercise — log reps only.` |
| `reps` | integer, 1–1000 | `validation_error` · `Enter reps above 0.` |
| `setNumber` | planned 1..plannedSets any order; extras sequential after the plan | `validation_error` |
| retry with identical values | idempotent: returns the existing set | — |
| same set, different values | `conflict` · `That set is already logged. Edit it from history to change it.` | |

A prefilled (offered) weight is validated exactly like a typed one. The client sends `weightLbs: null` for bodyweight, never a number.

## 13. UI data contracts

```ts
export type ExerciseCardDto = {
  loggedExerciseId: string;
  performedExerciseName: string;
  plannedExerciseName: string;
  performedExerciseId: string;
  plannedPrimaryMuscle: string;
  swapped: boolean;
  performedArchived: boolean;
  isGymVariable: boolean;
  requiresExternalWeight: boolean;
  gymName: string | null;              // gym-variable only (unchanged)
  plannedSets: number;
  plannedRepRange: { min: number; max: number };
  /** The working weight (set-1 offer); gym-scoped for gym-variable (§11.2). Null for bodyweight. */
  suggestedWeightLbs: number | null;
  /** NEW: §11.1. Null = no earlier performance in scope. */
  previousPerformance: PreviousPerformanceDto | null;
  skipped: boolean;
  sets: {
    setNumber: number;
    /** NEW: the LoggedSet id when saved, for in-card correction; null otherwise. */
    loggedSetId: string | null;
    weightLbs: number | null;
    reps: number | null;
    saved: boolean;
    extra: boolean;
  }[];
};
```

`WorkoutDto` is unchanged apart from carrying the richer `ExerciseCardDto`. No credential, raw row, or Prisma error reaches the client.

## 14. Testing strategy

Risk-ranked per `CLAUDE.md` → Testing: cross-account isolation and logged-history integrity first.

### 14.1 Unit (`tests/unit/`, no DB)

`tests/unit/set-entry.test.ts`:

```text
GIVEN sets [1 saved, 2 –, 3 –], planned 3 → active 2
GIVEN sets [1 saved, 2 –, 3 saved] (resumed gap) → active 2
GIVEN all planned saved, no pending extra → null; pending extra 4 → 4
GIVEN bodyweight → offerFor = null, whatever is logged
GIVEN no logged set, working 185 → {185, working_weight}
GIVEN set 1 logged at 190, working 185 → {190, previous_set 1}
GIVEN sets 1 @190, 2 @195 logged → {195, previous_set 2}
GIVEN no logged set, working null → null (nothing invented)
formatSetSummary: same weight → "185 × 8, 8, 7"; mixed → "185 × 8, 190 × 6, 190 × 5"; bodyweight → "18, 15 reps"; 182.5 prints "182.5"
formatPreviousPerformance: free → "Last time · Oct 13 · …"; gym-variable → "Last time here · Oct 13 · …";
  gym-variable none → "First time on this at Downtown Gym."; none → "First time logging this.";
  other year → "Dec 29, 2025"
formatMonthDay("2026-10-13","2026-10-20") = "Oct 13"
```

`tests/unit/exercise-card-loading-mode.test.tsx` (updated) and `tests/unit/exercise-card-set-states.test.tsx` (new), static render (`renderToStaticMarkup`, actions and router mocked):

```text
bodyweight: no weight input anywhere; logged row reads "15 reps"; active row has only a reps input
weighted, set 1 logged: exactly one weight input and one reps input (the active row); logged row is a button
  with "185" and "× 8" and no <input>; upcoming row has no input and reads "—"
offer: set 2's weight input value is set 1's weight with caption "same as set 1"; reps input value is ""
first set: weight value = suggestedWeightLbs with caption "last time"; none → empty, no caption
gym-variable none: "First time on this at Downtown Gym."; previous: "Last time here · Oct 13 · 50 × 12, 12, 11"
all planned logged: no input; "All 3 sets logged."; Add set present
visible controls (AC-2): set 1 of 3 logged → inputs 2, Log set 1, logged-row buttons 1 — fewer than Pitch 4's 6 inputs + 2 Save
Log set is type=submit inside a form with noValidate; inputs carry inputMode decimal/numeric, enterKeyHint next/done
```

`tests/unit/edit-set-dialog.test.tsx` (new, static): the default trigger still renders `edit` (History unchanged); a supplied trigger replaces it.

### 14.2 Integration (embedded Postgres)

`tests/integration/logging-reads.int.test.ts` (extend) — previous performance and working weight:

```text
GIVEN a free-weight exercise logged last week (185×8,8,7) and today's workout started
WHEN getWorkout → previousPerformance = {dateIso: last week, gymScoped: false, sets [185×8,185×8,185×7]}
GIVEN history at gym A only for a cable exercise; today's workout at gym B
WHEN getWorkout → previousPerformance null; suggestedWeightLbs null            (no cross-gym)
GIVEN baseline at gym A = 50, history at A → at A: previousPerformance gymScoped, suggestedWeightLbs 50
GIVEN cable history at gym B without a baseline (partial) → at B: suggestedWeightLbs = B's latest weight
GIVEN a free-weight exercise logged at gym A → at gym B: previousPerformance from A (global rule)
GIVEN a bodyweight exercise logged (null weights) → sets carry weightLbs null; suggestedWeightLbs null
GIVEN the current workout already has sets → previousPerformance never returns the current LoggedExercise
GIVEN a later-dated workout exists (logging a past day late) → previousPerformance is the latest one dated on or before this workout
GIVEN an exercise swapped in → previousPerformance is the performed (substitute) exercise's
GIVEN an earlier LoggedExercise with no sets (skipped) → ignored
saved set rows carry loggedSetId = the LoggedSet id
getWorkout performs no write: owned-row counts identical before/after (snapshotAccount)
```

`tests/integration/progression.int.test.ts` (extend): a gym-variable exercise with history only at another gym, in a scheduled-deload week at the new gym → the occurrence's suggested load is `null` (state only, R36), not 90% of the other gym's weight. Everything else in the suite unchanged and green (no rule change).

`tests/integration/isolation/logging.int.test.ts` (extend): account B performs the same library exercise at a gym with A's name and dates; B's `getWorkout` previous performance and working weight reflect only B's rows (B with no history → `First time` path, null weight); A's unchanged. B's `getWorkout(A's loggedSessionId)` stays null.

Standing suites, run unchanged: `history-integrity`, `logging`, `bodyweight-logging`, `flexible-workouts`, `gyms` (baselines), `progression`, `goals`, `rls`, `schema`, every `isolation/*`, plus the unit guards (`invariant-guards`, `account-isolation-guards`, `deliberate-absences`).

### 14.3 E2E, local Supabase stack (`e2e/accounts/faster-logging.spec.ts`)

Runs in `npm run test:e2e:accounts` (production build, local stack only, temporary accounts removed through the app's deletion flow). Context: `viewport 375×812, hasTouch: true, isMobile: true`, Chrome.

1. **Representative workout and tap count (AC-1).** Seed §14.4, start the workout through the UI (Today → Start → Downtown Gym → Start logging), then drive the after-path with the counting driver. Assert: taps ≤ the design target (18) and strictly fewer than the recorded baseline; the database then holds exactly the 11 expected sets with exactly the entered values, the Pushdown baseline at Downtown Gym is 50, and the workout is `complete`.
2. **No unconfirmed writes (AC-3).** On a fresh workout: with set 1's weight offered and reps typed but not confirmed, press Next, Previous, reload, and Change gym → `LoggedSet` count for the account is unchanged (0). After Log set → count +1 with the entered values. After set 1, set 2 shows the offer in a box; navigating away and back → still 1 set.
3. **Focus flow.** After Log set, `document.activeElement` is set 2's reps input; after the last planned set it is the Next button; after Next it is the new card's reps input; on page load nothing in the card is focused.
4. **Reuse after a change (Journey B).** Set 1 typed 65 (offer 60) → set 2's box holds 65 with `same as set 1`.
5. **Bodyweight (Journey E).** The Pushups card has no weight input; logged rows read `18 reps`; the stored weight is NULL.
6. **Correction from the card (Journey G).** Tap a logged row → `Edit set 2 — …` dialog with the stored values → change reps → Save → row shows the new reps, `Set updated` toast, set count unchanged, the row's id unchanged.
7. **Visible controls (AC-2).** On a 3-set card with set 1 logged, count visible `input, button, a` inside the card plus the runner bar; record it; assert ≤ 8.
8. **Phone width and theme.** At 320px the active row stays on one line (`Log` label) and the page has no horizontal scroll; every Log set / row / runner button box is ≥ 44px tall; screenshots in light and dark for the fidelity check.

### 14.4 Tap-count measurement (repeatable method)

**Representative workout** (design doc §8), seeded by `e2e/accounts/support/representative-workout.ts` for a temporary account through the local stack's Postgres (the account is created through signup first; only its own rows are written; the suite deletes the account afterwards):

| | Exercise (library row) | Equipment | Plan | History (one week earlier, complete, Downtown Gym) | Driven today |
| - | ---------------------- | --------- | ---- | ------------------------------------------------- | ------------ |
| 1 | Barbell Bench Press - Medium Grip | barbell | 3 × 6–8 | 185 × 8, 8, 7 | 185 × 8, 185 × 8, 185 × 7 |
| 2 | Incline Dumbbell Press | dumbbell | 3 × 8–10 | 60 × 10, 10, 9 | 65 × 9, 65 × 8, 65 × 8 |
| 3 | Triceps Pushdown | cable | 3 × 10–12 | 50 × 12, 12, 11 (+ baseline 50 at Downtown Gym) | 50 × 12, 50 × 12, 50 × 11 |
| 4 | Pushups | bodyweight | 2 × 12–20 | 18, 15 | 18, 16 |

Active mesocycle "Hypertrophy Block 3", 5 weeks, deload every 5; today is week 2 (not a deload week); session "Push Day 1" on today's weekday in the account's timezone; one active gym "Downtown Gym".

**What is counted.** From the workout page loaded (after Start logging) to the dashboard URL after Finish workout:

- **tap** = one pointer activation on a page element (`locator.tap()`), including a tap on an input to focus it. A field the app has already focused is **not** tapped. Keys on the on-screen keyboard are not taps.
- **keystroke** = one key on the keyboard (`page.keyboard.press/type`, one per character), reported separately.
- The driver never uses `fill()`, `focus()`, or JavaScript to set values; it checks `document.activeElement` before each field and taps only when the field is not focused.
- Replacing a value: on the Pitch 4 card, tap the field, `End` (not counted: it stands for tapping at the end of the value), one Backspace per character, then the digits. On this pitch's card, tap the field (the offer is selected on focus), then the digits.
- The shortest valid path for each UI is driven: Pitch 4 — per set tap weight (only when it must change), tap reps, Save; Next per exercise; Finish. This pitch — Log set per set, a tap on a field only when it is not focused or the weight must change; Next per exercise; Finish.

**Before / after.** The "after" driver is the e2e test above. The "before" driver (`e2e/accounts/support/tap-count-baseline.spec.ts`, skipped unless `OVERLOAD_TAP_BASELINE=1`, and meaningful only against the Pitch 4 card) is run once against `main` @ `fe34d00` from a git worktree with the same local-stack configuration and the same seed module; the run report records both numbers and the commit each ran on. Re-running both on any later commit reproduces the comparison.

**Expected** (design estimate): before 29 taps, after 18. The reported numbers are the measured ones.

**Limits stated with the result.** Playwright on desktop Chrome with touch emulation does not reproduce iOS Safari's keyboard. Whether the iOS keyboard stays up between sets (the Log set button doesn't take focus, and focus moves to the next reps field after the write) is a real-device check in the runbook; if iOS drops the keyboard, each set the app focuses for the lifter costs one extra tap on its reps field (nine sets in this workout) and the after-count is at most 18 + 9 = 27 (still fewer than 29). The report states both.

### 14.5 UI fidelity (manual, recorded)

Compare 375px light/dark and desktop screenshots of the card states in §14.3 with preview §01–§06: hierarchy, copy, controls, sizes, tokens. Any deviation is fixed or recorded as a Resolved Decision.

### 14.6 Regression

The full unit, integration, default e2e, and accounts e2e suites; `npm run build`; `npm run verify:client-bundle`; lint, typecheck, `prettier --check`; `prisma validate`; local `prisma migrate status` up to date; local DB pre-existing counts unchanged after all runs.

## 15. Acceptance criteria

### AC-1 — Measurably fewer taps (roadmap DoD 1)

- [ ] The representative workout's after-path takes fewer screen taps than the before-path, both measured by §14.4 on the same seed; both numbers and commits are in the run report.

### AC-2 — No additional always-visible controls (roadmap DoD 2)

- [ ] The card has no control that the Pitch 4 card lacked in some form; the visible-control count on a 3-set card with set 1 logged is lower than before (design 12 → 8) and asserted ≤ 8.
- [ ] No rest timer, RIR field, sticky bar, or new button on the card.

### AC-3 — Prefill never writes unconfirmed values (roadmap DoD 3)

- [ ] No `LoggedSet` is created or modified without a Log set press or Enter in the reps field (e2e §14.3.2).
- [ ] Reps are never prefilled; Progress/deload suggestions never prefill.
- [ ] A row shows as logged only when the server's record exists.

### Supporting behavior (pitch §6, §16)

- [ ] Last time line: free weight global; machine/cable this gym only; `First time …` when none; never another gym's number.
- [ ] Set-1 offer from the gym-scoped working weight; later sets offer the most recently logged set's weight; editable; caption shows the source until edited.
- [ ] Focus/keyboard per §7; numeric keypads; Enter flow; nothing focuses on load.
- [ ] 48px set fields; ≥ 44px Log set, logged rows, runner buttons, Change gym, View trend.
- [ ] Logged / active / saving / upcoming / error states per the preview.
- [ ] `Next: {exercise}`; focus to Next after the last planned set; no auto-advance.
- [ ] A logged set can be corrected from the card through the existing dialog and action; History's edit is unchanged.
- [ ] Bodyweight is reps only; stored weight stays NULL.
- [ ] Account isolation, logged-history, baseline, RLS, and progression suites green; no schema change.
- [ ] Guidance ticket: tour decision recorded; one significant release-note entry in `entries.ts` per the What's New contract.

## 16. Explicit non-goals

- ❌ Rest timer. **Permanent** (roadmap: decided against).
- ❌ RIR input or autoregulation. **Deferred** to RIR Logging & Autoregulation.
- ❌ New recommendation logic or a second weight source. **Deferred** to Smarter & Explainable Progression / permanent respectively.
- ❌ Exercise history and PR pages. **Deferred** to Exercise History & PR Intelligence.
- ❌ Prefilled reps; auto-log; auto-advance. **Permanent for this card** (data integrity).
- ❌ Program generation, social features, cardio progression. **Permanent.**

## Resolved Decisions

Recorded under the Autonomous Pipeline Policy. Authority order: approved planning docs → `CLAUDE.md` and skills → codebase patterns → judgment.

| # | Decision | Rationale | Authority |
| - | -------- | --------- | --------- |
| R1 | The controlling planning docs are the owner's multi-user set in `Downloads/` (`pitch-roadmap (1).md` carries Pitch 13 and its three DoD criteria). `docs/planning/` is the stale single-user copy and is not edited, except `method-note.md`. | Standing since Pitch 8 R1. | Standing resolution; CLAUDE.md run rules |
| R2 | The preview is `docs/previews/13-faster-logging-ux-preview.html`, not the run prompt's `.tsx`. | Skill rule and owner feedback. | `overload-ui-design`; owner memory; Pitch 9–12 precedent |
| R3 | **Stop before merge to `main`.** | Run prompt's mandatory gate; pitch §15; guide D1 names Faster Logging UX ("prefill changes what gets written"). No migration, so nothing must precede the deploy, but a human approves the merge. | Run prompt; pitch; guide D1 |
| R4 | One active row: only the lowest unlogged planned set (or the pending extra) has inputs; upcoming rows are read-only; entry is in set order. The server still accepts any order. | Fewer visible controls (AC-2), unambiguous state (pitch §9.9). | Design doc §3, Screen 1; pitch §4.7 |
| R5 | "A box is a draft; a plain number is history": logged sets render as text from the server DTO only; an offer is always inside an input with a source caption. | Pitch §4.2/§4.7/§9.1. | Design doc §3; preview §01 |
| R6 | Set-1 offer = the existing working-weight source; later sets offer the **highest-numbered logged set's** weight in the card; extras the same. | Reuse the one weight source (Pitch 5 R29/R34); reuse follows the most recent confirmed set (pitch §4.3). Highest set number = most recent in performed order and is derivable from the DTO alone. | Pitch §4.2–4.3; Pitch 5 R29 |
| R7 | **Reps are never prefilled**, copied, or suggested. | Pitch §4.3 ("must not … copy its reps without confirmation"); reps vary with fatigue, so a carried rep count is the likeliest silently-wrong value (pitch §9.1). Round in the safe direction. | Pitch; guide §4.3 |
| R8 | Progress +5 and scheduled-deload 90% never prefill; during a deload week the box offers the working weight and the existing deload line states the load. | Pitch 5 decided suggestions are display-only (card comment OVE-28); pitch §7 forbids changing deload behavior. | Pitch 5 R28/R30; pitch §7 |
| R9 | Working weight for gym-variable is scoped to the workout's gym: baseline, else the latest weight logged at that gym, else none. The cross-gym fallback is removed. Gym-consistent unchanged. | Pitch §4.1/§9.2/no-go "no cross-gym machine-weight assumptions"; the Pitch 4 derived-fields table and Pitch 5 suggested-load table already define gym-variable as the selected gym's baseline. The same-gym latest fallback keeps a useful offer after a partial workout without crossing gyms. | Pitch; Pitch 4 §8; Pitch 5 §11, R14 |
| R10 | R9 also changes the Pitch 5 suggested load for that one case (gym-variable, nothing at this gym) from a cross-gym number to no number. Recorded, not a rule change: tags, thresholds, and every other suggestion are unchanged, and Pitch 5 R31/R36 already say "omit the number" when there is no context. | One weight source must stay one (R29/R34); a second, unscoped source for suggestions would be the drift the guide warns about. | Pitch 5 R29/R31/R34/R36; guide §4.3 |
| R11 | Previous performance = the most recent earlier `LoggedExercise` of the **performed** exercise with ≥ 1 set, on or before this workout's date (ties by creation time), any mesocycle; gym-variable at this gym only; extras included; skipped/empty ones ignored. | "Last time" must be what was actually done (pitch §4.1); logging a past day late must not show a later workout as "last time". | Pitch §4.1; Journey D |
| R12 | Context copy: `Last time · Oct 13 · 185 × 8, 8, 7`; gym-variable `Last time here · …`; gym-variable with nothing at this gym `First time on this at {gym}.` (whether or not other gyms have history — true either way, and it needs no cross-gym query); otherwise `First time logging this.` Dates via a new `formatMonthDay` in `calendar.ts` (year added when it differs). | Design doc v1.1 (refined from v1.0, which only named the other-gym case); missing is not zero. | Design doc; guide §4.3 |
| R13 | Focus moves only after the lifter's action: none on page load; after a confirmed set → next reps (or weight when no offer); after the last planned set → Next/Finish; after Next/Previous → the new card's active field. Log set does not take focus (`pointerdown` preventDefault) so the phone keyboard stays up. | Pitch §4.4 ("support the lifter's actions rather than unexpectedly interrupting them"). | Design doc §7 |
| R14 | Enter in the reps field confirms the set (form submit); Enter in weight moves to reps. A keyboard Enter is an explicit confirmation. | Pitch §4.4/4.5; keyboard operability. | Design doc §7; design-doc skill (set entry keyboard-operable) |
| R15 | No optimistic logged state: the row turns logged, and the next set becomes active, only after the write succeeds and the refreshed DTO contains it. | Pitch §9.4 ("transitions should follow successful confirmation"). | Pitch |
| R16 | No auto-advance between exercises; `Next: {exercise}` names the destination; Finish keeps its unfinished-exercise confirmation. | Pitch §9.4, §9.8. | Design doc Screen 4 |
| R17 | Logged rows open the existing `EditSetDialog` (History's correction flow) via a new optional `trigger` prop; the dialog re-reads the stored values on every open. No inline editing of a logged row. | Fewer modal hops than History → day → dialog (pitch §4.9) while keeping the confirmed correction safeguard (pitch §9.8, Journey G); reusing the component keeps one correction path. | Pitch; design doc Screen 3 |
| R18 | Touch targets: set fields 48px; Log set, logged rows, runner buttons, Change gym, View trend ≥ 44px; upcoming rows 36px (not interactive). Below 360px, Log set shows `Log`. | Pitch §4.6; skill 44px minimum. | Design doc §4/§10; preview §05 |
| R19 | Numeric keyboards: weight `inputMode="decimal"`, reps `inputMode="numeric"` + `pattern="[0-9]*"`; `enterKeyHint` next/done; `autoComplete="off"`; the form is `noValidate` so the pattern never shows a native tooltip. | Pitch §4.5. | Design doc §6 |
| R20 | No schema or migration. The DTO gains `previousPerformance` and `loggedSetId`; the field name `suggestedWeightLbs` is kept (now documented as the working weight) to avoid churn. | Smallest change; the existing indexes serve the reads. | Codebase patterns |
| R21 | Tap-count method = §14.4 (screen taps vs keystrokes, focus-aware driver, same seed, same viewport, before on `fe34d00`, after on the feature branch); results recorded in the run report with the iOS caveat. Written to `method-note.md` for RIR Logging (whose DoD is "logging speed is not meaningfully slower"). | Pitch §8 AC-1, §9.10; the guide says constants a later pitch consumes go to the method note. | Pitch; guide §4.5 |
| R22 | The before-driver is committed (skipped unless `OVERLOAD_TAP_BASELINE=1`) so the comparison is repeatable; it is documentation of the baseline, not a regression test. | Repeatability (pitch §8, §13). | Pitch |
| R23 | Tickets: (1) read path + pure helpers, (2) card + runner UI, (3) e2e + measurement + method note, (4) guidance. Linear chain 1 → 2 → 3 → 4. | Medium-large, coherent PRs; guidance last (pitch §12). | Run prompt; guide §5 step 6 |
| R24 | Tour: **no new step and no copy change** (to be confirmed by `overload-onboarding` in the guidance ticket). The `logging` step ("enter the weight and reps you lifted") stays accurate; nothing new must be discovered to benefit; in-card correction duplicates History's toured path. | Skill rubric ("a performance improvement" → no step). | `overload-onboarding`; pitch §12 |
| R25 | Release note: one **significant** entry at the top of `RELEASE_NOTES`, title `Faster workout logging`, body per design doc §13 (final wording by the skill against the shipped behavior). Because the run stops before merge, the entry is committed with a **provisional** date and id (the day the guidance ticket is written) and the runbook's pre-merge step sets `date` and the id's date prefix to the merge day in the same PR before merging; an unpublished entry may be re-dated, a published one never. | What's New contract: "dated the day the change reaches production"; Pitch 12 runbook §8: "add it in the same PR, dated the day you merge". The run cannot know that day, so it is a human step, and the report says the entry has not shipped. | Pitch 12 spec §8; method note; run prompt |

## 17. Open questions

None blocking. Every pitch §14 question is resolved above. The one fact the run cannot settle is whether iOS Safari keeps its keyboard up between sets; it changes only the after-count's iOS figure (§14.4) and is a real-device check in the runbook.

## 18. Future considerations

- **RIR Logging & Autoregulation** adds an optional RIR selector beside reps on the active row only; logged rows gain the value as text. The active-row model keeps that to one extra control on one row, and the method-note tap-count method measures that it is "not meaningfully slower".
- **Exercise History & PR Intelligence** can link from the Last time line's date to the earlier workout; `previousPerformance` is the read it would extend.
- **Apple platform**: a native shell gets the same focus rules for free; iOS keyboard behavior is re-checked there.
