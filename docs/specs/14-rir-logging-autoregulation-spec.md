---
version: 1.1.0
status: approved
author: Claude Code (autonomous pipeline run)
last_updated: 2026-10-21
pitch_reference: pitches/14-rir-logging-autoregulation.md
design_reference: docs/design/14-rir-logging-autoregulation-design-doc.md
preview_reference: docs/previews/14-rir-logging-autoregulation-preview.html
prd_reference: docs/planning/prd.md (approved multi-user PRD; RIR named only as planned work)
architecture_reference: docs/planning/architecture.md
upstream_specs: docs/specs/05-progressive-overload-engine-spec.md, docs/specs/04-guided-workout-logging-spec.md, docs/specs/13-faster-logging-ux-spec.md
method_note: docs/planning/method-note.md
linear_issue: Milestone "RIR Logging & Autoregulation" (Overload V1)
---

# RIR Logging & Autoregulation — Technical Specification

> Written in an unattended pipeline run (CLAUDE.md, Autonomous Pipeline Policy). The skill's risky-data-model checkpoint does not apply; every decision is recorded under **Resolved Decisions** with its authority. The UI preview is the binding visual contract (CLAUDE.md, UI-bearing pitches); this spec adds technical detail and does not redesign it.

## 1. Metadata

See front matter. Feature name (roadmap, exact): **RIR Logging & Autoregulation**.

## 2. Summary

RIR Logging & Autoregulation adds one optional, per-set fact to logged history — **reps in reserve**, an integer `0–4` where `4` means "4 or more", or **NULL** meaning "not recorded" — and lets the existing reactive progression rule read it in exactly two places. The fact is written only by the canonical write module (`src/lib/logging/logged-sets.ts`) in the same write as the set's weight and reps, and corrected through the same `editLoggedSet` path. Nothing else is stored: the call stays computed on read.

The core abstraction is a **post-rule qualifier**. The Progressive Overload Engine's ladder (insufficient → reactive Deload → Progress candidate → e1RM stall gate) runs first and unchanged. Then RIR from the planned working sets of the **most recent qualifying performance** (same scope the rule already uses) may: **(A)** turn a `progress` into a `hold` when any of those sets was reported at `0`; or **(B)** turn a `stalled` into a `progress` when every one of those sets was reported at `2` or more. The engine reports which, if either, applied (`rirEffect`), and the card, day-complete summary, and exercise page print one sentence for it.

"Working" means: a set logged without RIR costs the same 18 taps and 18 keystrokes as Faster Logging UX on the representative workout and stores `rir = NULL`; a set logged with RIR stores exactly the chosen integer; old history evaluates byte-for-byte as before; the same reps at `0` vs `2+` RIR produce different, explained calls; and scheduled-deload suppression, gym scope, baselines, bodyweight, e1RM, goals, and account isolation are untouched.

## 3. Problem

- The app cannot yet record how hard a set was, so `185 × 8` at failure and `185 × 8` with three in the tank are the same row (pitch §1).
- The engine therefore cannot tell a top-of-range set that was ground out from one that was owned, and recommends +5 for both (pitch §4.6).
- The e1RM stall gate cannot tell a real plateau from a lifter who simply repeated a comfortable load, and flags both as `Hold — trend flat` (pitch §4.9).
- Pitch 15 (Smarter & Explainable Progression) needs a deterministic, stable effort signal to cite in evidence lines (pitch §11).

## 4. Scope and non-scope

### In scope

- `LoggedSet.rir` (nullable `Int`, DB CHECK `0..4`), additive migration, no backfill.
- Write path: `logSet` / `editLoggedSet` accept, validate, and store RIR; idempotency includes it; edit distinguishes "unchanged" from "clear".
- Reads: card, History day, and the progression read layer carry RIR.
- Engine: `evaluateReactiveDecision` with the two qualifiers and `rirEffect`; constants in `src/lib/progression/config.ts`.
- UI (preview-bound): `RirPicker` on the active row and in `EditSetDialog`; logged-row and History suffix; reason lines on card, summary, exercise page.
- Tests: unit, integration (embedded Postgres), local-stack e2e incl. the tap count; method-note entry.
- Guidance ticket via `/overload-onboarding`.

### Out of scope

Required RIR; backfilled or inferred RIR; treating NULL as 0; any learned, probabilistic, or opaque model; a second engine; changing any existing threshold (R4–R6, R22–R24 of the Progressive Overload Engine spec); RIR in e1RM, goals, working weight, prefill, or baselines; RIR creating or cancelling a reactive Deload; RIR on extra sets, incomplete performances, or scheduled-deload weeks; planned/target RIR in the plan; carrying RIR between sets; an RIR chart, average, or analytics view; Pitch 15's recommendation copy; rest timer; readiness/recovery inputs; auth/account changes; external services.

## 5. Core concepts

| Concept | Description |
| ------- | ----------- |
| `LoggedSet.rir` | Optional reported reps in reserve for one performed set. `NULL` = not recorded (no effort information). `0` = no rep left. `1`, `2`, `3` = about that many left. `4` = four **or more** (shown `4+`). Persisted, never derived. Independent of `reps`: `reps = 8, rir = 2` means 8 completed. |
| RIR scale | `RIR_VALUES = [0, 1, 2, 3, 4]`, `RIR_MAX = 4`. One module: `src/lib/logging/rir.ts` (pure, client-safe). |
| Latest qualifying performance | The last element of the engine's existing `qualifyingSequence(perfs)` (completed, all planned working sets present, not a scheduled-deload week; gym-scoped for gym-variable by the caller). The only performance whose RIR the engine reads. |
| Working sets | The planned working sets `1..plannedSets` the engine already evaluates. Extras never carry RIR into evaluation. |
| At the limit (case A) | ≥ 1 working set of the latest qualifying performance has `rir !== null && rir <= RIR_AT_LIMIT` (`0`). |
| Reps to spare (case B) | **Every** working set of the latest qualifying performance has `rir !== null && rir >= RIR_TO_SPARE_MIN` (`2`). One `NULL` set fails it. |
| `rirEffect` | Derived, never stored: `"held_at_limit" \| "released_stall" \| null`. Which qualifier changed the base call. |
| Base call | What the unchanged Pitch 5 ladder returns: `insufficient \| hold \| progress \| deload \| stalled`. |

Invariants: RIR is never added to reps; never read by `estimateOneRepMax`, `sessionE1rm`, `bestWorkingSet`, `getQualifyingSessionE1rms`, `currentWorkingWeightLbs`, baselines, goals, or the offer; a history with every `rir` NULL yields exactly the base call with `rirEffect: null`.

## 6. States and lifecycle

### Effort qualifier (pure; computed on every read)

| Base call | Condition on latest qualifying performance | Final call | `rirEffect` |
| --------- | ------------------------------------------ | ---------- | ----------- |
| `insufficient` | any | `insufficient` | `null` |
| `deload` | any | `deload` | `null` |
| `hold` | any | `hold` | `null` |
| `stalled` | every working set `rir >= 2` | `progress` | `released_stall` |
| `stalled` | otherwise | `stalled` | `null` |
| `progress` | any working set `rir <= 0` | `hold` | `held_at_limit` |
| `progress` | otherwise | `progress` | `null` |

- Case B can only arise where the stall gate operates (≥ `STALL_WINDOW_SESSIONS` qualifying points, external load). A `progress` from B can never meet A (no `0` among all-≥2 sets), so the table is total and order-independent.
- Bodyweight (`e1rmApplicable: false`): base never `stalled`, so only A applies.
- Scheduled-deload weeks: `getOccurrenceProgression` and `getPlannedProgression` return before evaluating (Pitch 5 R37); deload-week performances are excluded from the sequence (R38), so their RIR is never "latest".

### Set write lifecycle (unchanged shape)

Draft (client) → `logSetAction` → one `LoggedSet` row with `rir` → `editLoggedSetAction` may change `weightLbs`, `reps`, and/or `rir`. No delete. No state on the set beyond its values.

## 7. UI integration

The preview (`docs/previews/14-rir-logging-autoregulation-preview.html`, sections 01–08) is binding for hierarchy, controls, states, copy, and responsive behavior.

### Screens and surfaces

| Surface | Data | Actions |
| ------- | ---- | ------- |
| Exercise card, active row (`/log/[id]`) | `ExerciseCardDto.sets[].rir` | choose/clear RIR in the draft; Log set sends it |
| Exercise card, logged row | `rir` | suffix `· n RIR` only when not null; opens `EditSetDialog` |
| Exercise card note slot | `progression.rirEffect` | reason line A or B (preview §05) |
| `EditSetDialog` (card + History) | stored `rir` | change / clear; Save sends `rir` |
| History day (`/history/[id]`) | `LoggedWorkoutDetailDto.sets[].rir` | suffix |
| Day-complete summary (`/`) | `SessionProgressionSummaryDto.exercises[].rirEffect` | muted `at your limit — holding` / `reps to spare` under the name |
| Exercise page (`/exercises/[id]`) | `ExerciseProgressionDto.rirEffect` | reason sentence under the call |
| Dashboard planned list | — | **no change** (R20) |

### Components

| Component | Contract | Notes |
| --------- | -------- | ----- |
| `RirPicker` (new, `src/components/logging/rir-picker.tsx`, client) | `{ value: number \| null; onChange(v: number \| null): void; disabled?: boolean; label: string; showLabel?: boolean }` | Radix `ToggleGroup` (`radix-ui` package, already a dependency) `type="single"` (renders a radiogroup, R31), five items `0…4` rendered `0 1 2 3 4+`; empty string ⇄ `null`. Items `h-11 min-w-11`, outline (shadcn `toggleVariants({variant:"outline"})`), on-state neutral: `data-[state=on]:bg-accent data-[state=on]:text-foreground data-[state=on]:border-foreground/60` — never `primary`. `onPointerDown={e => e.preventDefault()}` on items so focus and the phone keyboard stay in the field (R13 of Faster Logging UX). One tab stop, arrow keys rove (Radix default). Group `aria-label` e.g. `Set 2 reps in reserve (optional)`; item `aria-label` `0`…`4 or more`. Disabled while saving (`aria-disabled`, inert). |
| `ExerciseCard` | `Draft` gains `rir: number \| null` (default `null`, never carried) | picker below fields/caption on the active row only; reset by keying the draft per set number (a new set's draft starts at null); `logSetAction({... rir })`; Enter in reps submits with the selected value |
| `EditSetDialog` | new prop `rir: number \| null`; state resets to it on open | `RirPicker` under Reps with label `RIR (optional)`; helper `Tap the selected value to clear.` when set, `Not recorded.` when null; Save sends `rir` (explicit `null` when cleared) |
| `CardProgression` (type in `exercise-card.tsx`) | gains `rirEffect: RirEffect` | reason line in the existing note slot; scheduled-deload line wins (as today) |
| `formatRir` / `rirSuffix` (`src/lib/logging/rir.ts`) | `formatRir(4) === "4+"`; `rirSuffix(null) === ""` | the one formatter for card, History, dialog labels |
| `rirReason(effect)` (`src/lib/progression/rir-copy.ts`, pure) | returns the exact sentences below | one source of copy for card, summary, exercise page |

**Copy (exact):**

| Effect | Card / exercise page | Summary |
| ------ | -------------------- | ------- |
| `held_at_limit` | `Top of the range, but at your limit last time (0 RIR) — holding.` | `at your limit — holding` |
| `released_stall` | `e1RM is flat, but every set last time had 2+ in reserve — ready to go up.` | `reps to spare` |

The figures in the copy are rendered from the constants (`RIR_AT_LIMIT`, `RIR_TO_SPARE_MIN`) so copy and rule cannot drift.

### Forms and validation (client mirrors server; server is authoritative)

| Field | Type | Required | Client | Server |
| ----- | ---- | -------- | ------ | ------ |
| `rir` | integer 0–4 or null | no | only the five chips can produce a value | §12 |

An absent RIR never produces an error, warning, disabled submit, or "incomplete" state.

## 8. Data model

### Relationship to existing schema

| From | Relation | To | Description |
| ---- | -------- | -- | ----------- |
| `LoggedSet.rir` | column | — | new nullable scalar on an existing owned model; no new model, no new relation |

### Updated model

```prisma
model LoggedSet {
  // …existing fields unchanged…
  /// Reported reps in reserve (RIR Logging & Autoregulation). NULL = not
  /// recorded — never 0, never inferred or backfilled. 0..4 where 4 means
  /// "4 or more". CHECK rir IS NULL OR rir BETWEEN 0 AND 4 (migration 9f).
  /// Written only by src/lib/logging/logged-sets.ts. Never read by e1RM,
  /// baselines, goals, or the weight offer.
  rir              Int?     @map("rir")
}
```

### Migration `prisma/migrations/9f_logged_set_rir/migration.sql` (hand-written, ASCII only)

```sql
-- RIR Logging & Autoregulation -- HAND-WRITTEN, reviewed.
-- Additive: one nullable column, no default. Every existing row reads NULL
-- ("not recorded"); no row is inserted, updated, or deleted; nothing is
-- dropped, renamed, or cascaded; RLS on logged_sets is unchanged (deny-all
-- since 0_init); the ownership triggers are unaffected.
ALTER TABLE "logged_sets" ADD COLUMN "rir" INTEGER;
ALTER TABLE "logged_sets"
  ADD CONSTRAINT "logged_sets_rir_range"
  CHECK ("rir" IS NULL OR ("rir" >= 0 AND "rir" <= 4));
```

- Named `9f_…` so it sorts after `9e_release_seen` (Prisma applies folders lexicographically; `10_…` would sort before `1_…`) (R7).
- Adding a nullable column without a default is a catalog-only change in Postgres; it does not rewrite the table (R6).
- No RLS statement: no table is created. The RLS suite still covers `logged_sets`.

### Derived fields

| Field | Stored? | Computed from | Notes |
| ----- | ------- | ------------- | ----- |
| `rirEffect` | **no** | latest qualifying performance's working-set `rir` + base call | engine output; DTO field |
| progression tag | no | unchanged | `held_at_limit` renders as no tag |
| e1RM | no | weight, reps (never `rir`) | unchanged |

## 9. Authorization and access control

- No new action or route. `logSetAction` and `editLoggedSetAction` already `requireAccount()` first; the write module runs on the account-scoped client, so `rir` can be written only to the acting account's own set; another account's `loggedSetId` is `not_found` (unchanged).
- `rir` is a column of an owned model: every read already goes through `account.db`. No new `prisma.<model>` call outside the scoped layer; the static guards stay green.
- The acting account is never taken from input; `rir` is the only new input field and carries no identity.
- RLS: unchanged deny-all on `logged_sets`.

## 10. Storage model

Not applicable.

## 11. Server modules and action surface

### 11.1 `src/lib/logging/rir.ts` (new, pure, client-safe)

```ts
export const RIR_VALUES = [0, 1, 2, 3, 4] as const;
export const RIR_MAX = 4;
export type Rir = (typeof RIR_VALUES)[number];
export function isRir(v: unknown): v is Rir; // integer, 0..RIR_MAX
export function formatRir(r: number): string; // 4 → "4+", else String(r)
export function rirSuffix(r: number | null): string; // null → "", else `· ${formatRir(r)} RIR`
export function rirAccessibleName(r: number): string; // 4 → "4 or more"
```

### 11.2 Write module `src/lib/logging/logged-sets.ts`

```ts
export type LogSetInput = {
  loggedExerciseId: string;
  setNumber: number;
  weightLbs?: number | null;
  reps: number;
  /** Optional reps in reserve. Omitted or null → stored NULL (not recorded). */
  rir?: number | null;
};

export type EditLoggedSetInput = {
  loggedSetId: string;
  weightLbs?: number | null;
  reps: number;
  /**
   * undefined → leave the stored RIR unchanged (an older client never clears it);
   * null → clear to "not recorded"; 0..4 → set.
   */
  rir?: number | null;
};
```

- `validateValues` gains RIR: if `rir` is not `undefined`/`null` and not `isRir(rir)` → `details.rir = "Choose an RIR from 0 to 4+."` in the same `validation_error` (combined with weight/reps details).
- `logSet`: stores `rir ?? null`. Idempotency: an existing row is returned only if weight, reps, **and** `rir` (null-safe) all match; otherwise `conflict` (unchanged message). A retry carries the same draft, so it still dedupes.
- `editLoggedSet`: `data: { weightLbs, reps, ...(input.rir !== undefined ? { rir: input.rir } : {}) }`. Still never touches exercise, gym, set number, date, or baselines (Guided Workout Logging D51–D54).
- `applyBaselineOnCompletion` is called exactly as before; RIR never reaches it.

### 11.3 Actions

`logSetAction(input: LogSetInput)` and `editLoggedSetAction(input: { loggedSetId; weightLbs?; reps; rir?: number | null })` pass `rir` through unchanged. Result shapes unchanged. Goal reconciliation unchanged.

### 11.4 Reads

- `getWorkout` (`src/lib/logging/queries.ts`): `ExerciseCardDto.sets[]` gains `rir: number | null` (null for unsaved rows). `previousPerformance` is **not** extended (R16).
- `getLoggedWorkoutDetail`: `sets[]` gains `rir: number | null`.
- `gatherRows` (`src/lib/progression/queries.ts`): `WorkingSet` gains `rir: number | null`, mapped from the row.

### 11.5 Engine `src/lib/progression/engine.ts`

```ts
export type WorkingSet = { setNumber: number; weightLbs: number | null; reps: number; rir: number | null };
export type RirEffect = "held_at_limit" | "released_stall" | null; // re-exported from types.ts (client-safe)
export type ReactiveDecision = { state: ReactiveState; base: ReactiveState; rirEffect: RirEffect };

/** The unchanged Pitch 5 ladder (today's evaluateReactive body). */
function evaluateBase(perfs: Performance[], opts): ReactiveState;

export function evaluateReactiveDecision(perfs: Performance[], opts?: { e1rmApplicable?: boolean }): ReactiveDecision {
  const base = evaluateBase(perfs, opts);
  const latest = qualifyingSequence(perfs).at(-1);
  if (!latest) return { state: base, base, rirEffect: null };
  if (base === "stalled" && hasRepsToSpare(latest)) return { state: "progress", base, rirEffect: "released_stall" };
  if (base === "progress" && hasSetAtLimit(latest)) return { state: "hold", base, rirEffect: "held_at_limit" };
  return { state: base, base, rirEffect: null };
}
/** Kept for callers/tests that only need the state. */
export function evaluateReactive(perfs, opts): ReactiveState { return evaluateReactiveDecision(perfs, opts).state; }

export function hasSetAtLimit(p: Performance): boolean;   // some working set: rir !== null && rir <= RIR_AT_LIMIT
export function hasRepsToSpare(p: Performance): boolean;  // length > 0 && every working set: rir !== null && rir >= RIR_TO_SPARE_MIN
```

Constants added to `src/lib/progression/config.ts` (Bucket C, flagged for review):

```ts
/** A working set reported at or below this RIR was taken to the limit (case A). */
export const RIR_AT_LIMIT = 0;
/** Every working set at or above this RIR releases a flat-trend hold (case B). */
export const RIR_TO_SPARE_MIN = 2;
```

### 11.6 Read layer `src/lib/progression/queries.ts`

`getExerciseProgression`, `getOccurrenceProgression`, `getPlannedProgression`, `getSessionProgressionSummary` call `evaluateReactiveDecision` and expose `rirEffect` (null in a scheduled-deload week and whenever the qualifier didn't change the call). The tag is derived from the **final** state (`held_at_limit` → no tag; `released_stall` → `progress` with its usual `+5` suggestion through the existing `progressSuggestion`). `getQualifyingSessionE1rms`, `toPoints`, `currentE1rm` ignore `rir`.

### Error format

Unchanged `ActionResult`. New detail key `rir` under `validation_error`.

## 12. Validation rules

| Field | Validation | Error |
| ----- | ---------- | ----- |
| `rir` (log) | `undefined`/`null` allowed (stored NULL); else integer `0..4` | `validation_error`, `details.rir = "Choose an RIR from 0 to 4+."` |
| `rir` (edit) | `undefined` = unchanged; `null` = clear; else integer `0..4` | same |
| `rir` types | reject non-integers (`1.5`), negatives, `> 4`, strings (`"2"`), `NaN`, booleans | same |
| DB | `CHECK (rir IS NULL OR rir BETWEEN 0 AND 4)` | a bypass fails loudly |
| weight / reps | unchanged (Guided Workout Logging, bodyweight rules) | unchanged |

RIR has no relationship constraint with reps (any `rir` with any valid `reps`), and bodyweight sets accept RIR with `weightLbs` NULL.

## 13. UI data contracts

```ts
// src/lib/progression/types.ts (client-safe)
export type RirEffect = "held_at_limit" | "released_stall" | null;

// ExerciseCardDto.sets[i]
{ setNumber; loggedSetId; weightLbs; reps; saved; extra; rir: number | null }

// LoggedWorkoutDetailDto.exercises[i].sets[j]
{ loggedSetId; setNumber; weightLbs; reps; extra; rir: number | null }

// ExerciseProgressionDto, OccurrenceProgressionDto, PlannedProgressionDto,
// SessionProgressionSummaryDto.exercises[i] each gain:
rirEffect: RirEffect;
```

`rirEffect` is the one name on every surface. No surface infers it from `rir` values on the client.

## 14. Testing strategy

Risk order follows CLAUDE.md → Testing: isolation, history integrity, baselines, engine, then UI.

### 14.1 Unit (`tests/unit/`, no DB)

```text
progression-engine.test.ts (extended) + progression-rir.test.ts (new)
GIVEN any fixture history with every rir NULL (the existing engine fixtures, re-run)
WHEN evaluateReactiveDecision runs
THEN state === the legacy evaluateReactive result for that fixture and rirEffect === null   [regression, AC-2]

GIVEN 2 qualifying all-top performances; latest working sets rir [2, 1, 0]
THEN state "hold", base "progress", rirEffect "held_at_limit"                                 [case A, AC-3]
GIVEN same reps; latest rir [2, 2, 3]  → "progress", null                                     [AC-3 pair]
GIVEN same reps; latest rir [null, null, 0] → "hold", "held_at_limit"                         [partial coverage, A]
GIVEN same reps; latest [0, …] but the EARLIER performance had 0 and the latest [2,2,2] → "progress"  [latest only]
GIVEN 3 qualifying all-top, flat e1RM (stalled); latest rir [3, 2, 2] → "progress", "released_stall" [case B]
GIVEN stalled; latest rir [3, null, 2] → "stalled", null                                      [partial coverage, B]
GIVEN stalled; latest rir [2, 2, 1] → "stalled", null                                          [boundary 1 < 2]
GIVEN stalled; latest rir [4, 4, 4] → "progress", "released_stall"                             [4+]
GIVEN deload base (2 consecutive below-min) with latest rir [4,4,4] → "deload", null           [never cancels]
GIVEN hold base (top not reached) with latest rir [0,0,0] → "hold", null                       [never deloads / never notes]
GIVEN hold base with latest [4,4,4] → "hold", null                                             [never creates progress]
GIVEN insufficient (1 performance) with rir [0] → "insufficient", null
GIVEN bodyweight (e1rmApplicable false), 2 all-top, latest [1, 0] → "hold", "held_at_limit"; latest [3,3] → "progress"
GIVEN scheduled-deload performance as the chronologically last, with rir [0,0,0]; the latest QUALIFYING is [2,2,2] → unaffected by the deload week
GIVEN incomplete latest performance (fewer than planned sets) with rir 0 → ignored (not qualifying)
Determinism: same input twice → deep-equal output; input order shuffled → same output
Constants: RIR_AT_LIMIT === 0, RIR_TO_SPARE_MIN === 2 imported from config (no literals in engine)

rir.test.ts: isRir accepts 0..4 ints only; formatRir(4) "4+"; rirSuffix(null) ""; rirSuffix(0) "· 0 RIR"
rir-copy.test.ts: rirReason strings exact; figures come from constants
rir-picker.test.tsx: nothing pressed by default; click 2 → onChange(2); click 2 again → onChange(null); disabled ignores clicks; group label; "4+" item named "4 or more"; pointerdown default prevented
exercise-card-set-states.test.tsx (extended): active row shows picker unselected; logged row suffix only when rir !== null (0 shows "· 0 RIR"); after a set logs, next draft rir null; logSetAction receives rir from the picker and null when untouched; bodyweight: no weight input, picker present, weightLbs null sent; only the active row has a picker
edit-set-dialog.test.tsx (extended): opens with stored rir; clear → sends rir: null; untouched → sends stored rir; History default trigger unchanged
invariant-guards / deliberate-absences (extended): no `rir` read in e1rm.ts, baselines.ts, goals, or set-entry offer code (static search); still no tag/e1rm/rirEffect column in schema.prisma
```

### 14.2 Integration (embedded Postgres; ASCII migration)

```text
logging.int.test.ts (extended) / rir-logging.int.test.ts (new)
- log without rir → row.rir NULL; with 0 → 0 (not NULL); with 4 → 4
- invalid 5, -1, 1.5, "2", NaN → validation_error details.rir; no row written; baseline untouched
- retry identical (incl. rir) → same row; retry same weight/reps different rir → conflict, row unchanged
- edit rir only (weight/reps resent unchanged) → only rir changes; weight, reps, set number, exercise, gym, createdAt unchanged
- edit omit rir → rir unchanged; edit rir null → NULL
- edit never calls the baseline path (baseline row updatedAt unchanged)
- gym-variable completion with rir → baseline established/corrected exactly as without rir (same value)
bodyweight-logging.int.test.ts (extended): reps + rir, weight NULL; supplying weight still rejected
schema.int.test.ts / migration: column exists, nullable, CHECK rejects 5 and -1 via raw insert; pre-existing rows read NULL after migrate (seed rows before applying 9f in a migration test)
progression.int.test.ts (extended) / progression-rir.int.test.ts (new), through real rows:
- case A and the AC-3 pair through getExerciseProgression + getOccurrenceProgression
- case B, including +5 suggestion present
- editing a past set's rir from 0 → 2 flips held_at_limit → progress (and back on clear → progress, null effect)
- mixed history: older sessions NULL, latest with rir → evaluated; all NULL → identical to a snapshot of pre-pitch output
- scheduled deload week: rir logged there → tag null, rirEffect null; next normal week uses the last non-deload qualifying performance
- gym scope: cable with rir 0 at Gym B leaves Gym A's call and Gym A's baseline unchanged
- goals: goal progress identical with and without rir on the same sets
isolation/logging.int.test.ts (extended): account B cannot edit A's set rir (not_found, row unchanged); B's workout/history/progression reads never include A's rir; B's call is unaffected by A's rir on the same library exercise
history-integrity, rls, guards: unchanged and green
```

### 14.3 E2E, local Supabase stack (`e2e/accounts/rir-logging.spec.ts`, new; `faster-logging.spec.ts` kept)

```text
- faster-logging.spec.ts unchanged: RIR-unset run still ≤ 18 taps and 18 keystrokes (AC-1); add: the active row has an RIR group with nothing pressed; logged rows show no suffix
- log a weighted set with RIR 2 → logged row "· 2 RIR"; DB row rir = 2
- next set: no chip pressed; log without RIR → no suffix; DB rir NULL (missing ≠ 0)
- bodyweight: reps + RIR 0 → "16 reps · 0 RIR", weight NULL
- correction: open a logged row → stored RIR pressed → change → Save → "Set updated", suffix updated; clear → suffix gone, DB NULL; weight/reps unchanged
- chip tap keeps focus in reps (document.activeElement unchanged) at 375×812 touch
- seeded history (two all-top sessions, latest with a 0) → exercise page shows "Holding" + case A sentence; correct that set to 2 in History → exercise page shows Progress (AC-3 end to end)
- 375 light and 1280 dark screenshots of card, dialog, exercise page reviewed against the preview
```

### 14.4 Tap-count measurement (AC-1)

Method note "Set entry and tap-count method", unchanged: representative workout, 375×812 touch, counter-only drivers. Report three runs on the integrated branch: **RIR unset** (must be exactly 18 taps / 18 keystrokes), RIR on the last set of each exercise (expected 22 / 18), RIR on every set (expected 29 / 18). The RIR-unset run is the AC; the other two document cost.

### 14.5 Regression

Every existing unit, integration, accounts-e2e, and default-e2e test passes unchanged except where a test constructs `WorkingSet` literals (add `rir: null`) or snapshots a DTO (add `rir`/`rirEffect`). No assertion is weakened.

## 15. Acceptance criteria

### AC-1 — Optional RIR without meaningful slowdown (roadmap DoD 1)
- [ ] A set can be logged with or without RIR on weighted and bodyweight cards.
- [ ] With RIR unset, the representative workout is 18 taps and 18 keystrokes (equal to Faster Logging UX), with the same focus sequence.
- [ ] No RIR-related error, warning, or disabled state exists for an unset value.

### AC-2 — Mixed historical evaluation (roadmap DoD 2)
- [ ] Every pre-existing row reads `rir = NULL` after migration; no row is otherwise changed.
- [ ] A history with no RIR produces the same call as before for every fixture.
- [ ] Mixed histories evaluate by the documented rule (latest qualifying performance only; NULL never counts as 0 or as 2+).

### AC-3 — RIR can change an explainable outcome (roadmap DoD 3)
- [ ] Same reps: latest `0` → Hold with the case A sentence; latest all `2+` → Progress.
- [ ] Flat e1RM: latest all `2+` → Progress with the case B sentence; any NULL → `Hold — trend flat`.
- [ ] Editing a past RIR changes the next computed call; nothing is stored.

### Supporting behavior (pitch §6, §16)
- [ ] RIR is written only by `logged-sets.ts`, in the same write as weight/reps; unconfirmed chips write nothing.
- [ ] Missing and zero are distinct in DB, DTOs, and UI.
- [ ] Scheduled-deload suppression, gym-scoped evaluation, baselines, e1RM, goals, and bodyweight logging are unchanged (tests in §14).
- [ ] Account isolation suite green and extended.
- [ ] UI matches the preview (§01–§06) at 375, 320, and 1280, light and dark.
- [ ] Guidance ticket: tour decision recorded; one significant What's New entry; no mechanism change.

## 16. Explicit non-goals

- ❌ Required RIR; per-plan or per-exercise RIR targets. **Deferred** (needs its own pitch).
- ❌ Backfilling or inferring RIR. **Permanent** for existing history.
- ❌ RIR-adjusted e1RM or "reps to failure". **Deferred**; would need an approved rule.
- ❌ RIR creating or cancelling a reactive Deload. **Deferred** until lived data supports a rule.
- ❌ Learned/probabilistic autoregulation. **Permanent** for this build.
- ❌ Recommendation copy and evidence lines beyond the two sentences. **Pitch 15.**
- ❌ RIR analytics, charts, averages. **Deferred** (Exercise History & PR Intelligence may show it).
- ❌ Rest timer; readiness, sleep, soreness inputs. **Permanent** for this build.

## Resolved Decisions

Authority order (CLAUDE.md): 1 approved planning docs · 2 CLAUDE.md and skills · 3 codebase patterns · 4 judgment. "Design" = the design doc v1.0 decisions; "Preview" = the binding preview.

| # | Decision | Rationale | Authority |
| - | -------- | --------- | --------- |
| R1 | **Stop before merge.** | The pitch changes what the set write stores. | Run prompt; pitch §15; guide D1 |
| R2 | Preview is `docs/previews/14-…-preview.html`, not the run prompt's `.tsx`. | Owner standard for previews. | Owner feedback memory; `overload-ui-design` |
| R3 | RIR values `0, 1, 2, 3, 4` with `4` = "4 or more", shown `4+`. | Common RIR-based effort scale tops out around 4; estimates beyond are too rough; fits 320px. | Judgment (design §4.1); pitch §14 delegates |
| R4 | Storage: nullable `LoggedSet.rir Int`; NULL = not recorded. No default, no sentinel. | Missing ≠ 0 must be structural (guide 4.3 "make silent-failure rules structural"). | Pitch §4.2, §9.2; CLAUDE.md |
| R5 | DB `CHECK (rir IS NULL OR rir BETWEEN 0 AND 4)`. | Invalid values cannot reach history even through a bypass. | Pitch §13; Bodyweight migration pattern (8) |
| R6 | No backfill; additive catalog-only migration; existing rows NULL. | Pitch no-go; no data rewrite. | Pitch §7, §10 |
| R7 | Migration folder `9f_logged_set_rir`. | Lexicographic ordering keeps it after `9e`. | Codebase pattern |
| R8 | RIR written only by `logged-sets.ts` in the same `logSet` write; corrected only by `editLoggedSet`. | Canonical write path. | CLAUDE.md Layer 1; pitch §9.8 |
| R9 | Edit: `rir` `undefined` = unchanged, `null` = clear. | An older client or a partial payload can never silently erase RIR (pitch Journey E). | Judgment; pitch §5 E |
| R10 | Idempotency compares `rir` too; a differing retry is `conflict`. | A retry carries the same draft; a different value is a deliberate change that belongs to edit. | Guided Workout Logging D14 pattern |
| R11 | RIR is read only from the **planned working sets** of the **latest qualifying performance**, in the rule's existing scope. | Uses the engine's own evidence window; excludes extras, incomplete, deload-week, other-gym sets; one older hard session can't hold back a lift since done with room to spare (pitch §9.5). | Pitch 5 R8–R12, R38; judgment |
| R12 | **Case A:** base `progress` + any working set `rir ≤ RIR_AT_LIMIT (0)` → `hold`, effect `held_at_limit`. | Reaching the top only at failure = own the load first; holding is the conservative direction and self-corrects next session. Qualifies an existing Progress; never creates a call. | Pitch §4.6, §9.3; guide 4.3 "round in the safe direction" |
| R13 | **Case B:** base `stalled` + **every** working set `rir ≥ RIR_TO_SPARE_MIN (2)` → `progress`, effect `released_stall`. | The stall gate exists to avoid blind bumps; full explicit spare capacity means the flat trend is the repeated load, not a plateau. Less conservative, so it needs complete coverage; 1 RIR is within typical estimate error. | Pitch §4.9, §9.6; Pitch 5 R22–R25 |
| R14 | Partial coverage: A needs one reported `0`; B needs all reported `≥ 2`; NULL never counts as either. | Never assume missing values resemble recorded ones. | Pitch §9.6, §4.11 |
| R15 | RIR never changes `insufficient`, `deload`, or ordinary `hold`; never creates a Deload and never cancels one. | Deload keeps defensive precedence (Pitch 5 R7); a subjective value can't outweigh repeated missed reps, nor trigger a deload alone (pitch §4.8, §9.5). Recorded as the determined deload/hold behavior. | Pitch §4.7–4.8; Pitch 5 R6–R7 |
| R16 | RIR is not added to reps, not used by e1RM/goals/baselines/offer, and the "Last time" context line does not show it. | Pitch §4.2, §4.9, §4.13; keep the line short (Faster Logging UX). | Pitch; method note |
| R17 | Constants `RIR_AT_LIMIT = 0`, `RIR_TO_SPARE_MIN = 2` in `src/lib/progression/config.ts`; `RIR_MAX = 4` in `src/lib/logging/rir.ts`. Bucket C, flagged for review; written to the method note. | CLAUDE.md: named constants, no magic numbers. | CLAUDE.md |
| R18 | Existing thresholds unchanged (2/2/2/3, +5, 90%). | Pitch §14 "must not be reopened". | Pitch; Pitch 5 R4–R6, R22–R24 |
| R19 | `rirEffect` is derived and returned by the engine; never stored; tag derives from the final state. | Computed on read. | CLAUDE.md |
| R20 | Reason line on card, day-complete summary, exercise page; none on the dashboard planned list. | Sufficient explainability without Pitch 15's evidence lines; dashboard stays one thing per row. | Design §7 Screen 5; pitch §4.14, §9.11 |
| R21 | `held_at_limit` renders **no tag**; `released_stall` renders the normal Progress tag + suggestion. | Hold is a non-event; no new tag or color. | CLAUDE.md; Preview §05 |
| R22 | Chips are a Radix `ToggleGroup` (existing `radix-ui` dependency), outline, 44px, neutral on-state, no focus steal. | No new dependency; preserves the keyboard-up behavior. | CLAUDE.md stack; Faster Logging UX R13; Preview §08 |
| R23 | RIR is never pre-selected or carried between sets. | It is an answer, like reps (Faster Logging UX R7). | Pitch §4.2; design principle 1 |
| R24 | Picker on the active row only, below the fields; logged/upcoming rows stay control-free. | Method note rule for new card controls. | Method note |
| R25 | AC-1 metric: RIR-unset run = 18 taps / 18 keystrokes on the representative workout (exact equality, not "≤ + margin"). | "Not meaningfully slower" made objective and repeatable. | Pitch §8 AC-1; method note |
| R26 | Scheduled deload: chips work and RIR is stored; nothing reactive is computed; no reason line. | Suppression unchanged. | Pitch §4.10; Pitch 5 R37–R38 |
| R27 | No new owned model → isolation coverage registry unchanged; the logging isolation test is extended for `rir`. | Ownership via existing `LoggedSet.userId`. | CLAUDE.md first invariant |
| R28 | Tour: **no step and no copy change** (confirmed by `/overload-onboarding` in OVE-65: the `logging` step anchors to Today and still reads true — the card still takes the weight and reps you lifted; the RIR chips are labelled on the card itself, which the tour never opens; rubric default is no step). Release note: one significant entry `2026-10-21-reps-in-reserve` / "Reps in reserve" with a **provisional** date the human sets to the merge day. | Skill rubric; no invented ship date. | Pitch §12; What's New content contract |
| R29 | `evaluateReactive` keeps its signature (returns `.state`) so existing callers/tests remain valid. | Minimal churn; no second engine. | Codebase pattern; pitch §9.4 |
| R30 | Below 360px the RIR label sits on its own line above the chips and the chips share the row (`flex-1`, `gap-1`), so each stays ≥ 44px and nothing overflows the card at 320px. | Found in the OVE-64 browser walkthrough: the preview's one-line row overflowed by ~30px at 320 (the preview mis-measured the active row's inner width). Same kind of sizing refinement as Faster Logging UX R26. | Judgment; preview §06 intent (no horizontal scroll, 44px targets) |
| R31 | The picker's accessible semantics are Radix's single-select toggle group as shipped: `role="radiogroup"` with `role="radio"` items and `aria-checked` (not `aria-pressed`). Group name `Set N RIR (reps in reserve, optional)` — it must not contain the substring `Set N reps`, so the reps field's name stays unique. | Uses the existing `radix-ui` primitive unmodified (R22); a radio group is the correct ARIA for one-of-five with an empty state; the name change removed a real label collision found by the e2e. | CLAUDE.md stack; judgment |
| R32 | Faster Logging UX's control-count checks (unit + e2e) count the RIR group as exactly one control, separately, and still require every other control to stay at its Pitch 13 count; its AC-1 tap test now asserts exactly 18 taps / 18 keystrokes. | Accounts for the one control this pitch deliberately adds (design §12) without weakening any assertion; R25 made exact. | Design §12; R25 |

## 17. Open questions

None blocking. Bucket C values (R3, R12, R13, R17) are flagged for owner review in the run report.

## 18. Future considerations

- Pitch 15 consumes `rirEffect` and `base` to write evidence lines ("held because set 3 was at 0 RIR on Oct 20").
- A later pitch may add planned/target RIR per session exercise; `LoggedSet.rir` is already per set.
- Lived data may justify an RIR-informed deload rule; it would be a new qualifier row in §6, not a new engine.
