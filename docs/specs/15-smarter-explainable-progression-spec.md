---
version: 1.1.0
status: approved
author: Claude Code (autonomous pipeline run)
last_updated: 2026-10-21
pitch_reference: pitches/15-smarter-explainable-progression.md (Linear doc 155772a8-5c74-439d-84e5-64aa67927ba0)
design_reference: docs/design/15-smarter-explainable-progression-design-doc.md (v1.0)
preview_reference: docs/previews/15-smarter-explainable-progression-preview.html (binding visual contract)
prd_reference: C:\Users\wtrho\Downloads\prd (1).md (approved multi-user PRD; repo docs/planning/prd.md is the stale single-user copy)
roadmap_reference: C:\Users\wtrho\Downloads\pitch-roadmap (1).md → Smarter & Explainable Progression
architecture_reference: docs/planning/architecture.md
upstream_specs: docs/specs/05-progressive-overload-engine-spec.md, docs/specs/14-rir-logging-autoregulation-spec.md, docs/specs/13-faster-logging-ux-spec.md, docs/specs/04-guided-workout-logging-spec.md
linear_issue: milestone "Smarter & Explainable Progression" (identifiers recorded in docs/runs/15-smarter-explainable-progression-progress.md)
---

# Smarter & Explainable Progression — Technical Specification

## 1. Metadata

See the header. Feature name (roadmap, exact): **Smarter & Explainable Progression**. UI-bearing; no schema change; no migration.

## 2. Summary

Smarter & Explainable Progression turns each progression call the engine already makes into a **recommendation**: one *action* line (what to do, with a load only where the engine has one) and one *evidence* line (the facts the engine judged), shown on the four surfaces that already show a call — the exercise card, Today's planned list, Today's day-complete summary, and the exercise page.

The core abstraction is **evidence emitted by the engine, words built by one pure function.** `evaluateReactiveDecision` keeps every rule and threshold exactly as it is, and additionally returns a small structured `evidence` value produced *in the same branch* that returns the call (the windows it judged, the latest counted session's reps and range, the RIR qualifier it applied). A single client-safe module, `src/lib/progression/recommendation.ts`, maps `(state, rirEffect, evidence, load context)` to the two strings. The read layer attaches the result to every progression DTO. Nothing is stored; every recommendation is rebuilt on every read, so a corrected set changes the words the next time a page renders.

"Working" means: for any history, the displayed action belongs to the same call as the tag (Progress → try/add/go past; Hold → stay/hold steady; Deload → lower/back off; deload week → the planned 90%); the evidence names only facts the engine used; no weight appears where the engine has none; RIR appears only when `rirEffect` is set; reading any surface writes nothing.

## 3. Problem

- The app cannot yet say *why* a lift is tagged Deload, so a reactive deload looks arbitrary.
- The app cannot yet say what a Hold means for this lift (stay at what? what's left to earn the next step?), because an ordinary hold renders nothing at all.
- The app cannot yet explain a Progress beyond the number, so the lifter can't check the call against their memory of the sessions.
- The card's `Try 190 lb (+5)` is computed from the latest logged set **including sets logged today**, while the call itself ignores today's unfinished session — so mid-workout the number drifts (log 190, and the card says `Try 195`) while the call and its reasons don't. That is a recommendation that doesn't match the evaluation it sits beside.
- Exercise History & PR Intelligence needs "the current recommendation and why" and has no shared, engine-backed source to reuse.

## 4. Scope and non-scope

### In scope

1. Engine: a structured `evidence` value on `ReactiveDecision`, produced by the existing branches. Rules, thresholds, precedence, and the returned `state`/`base`/`rirEffect` are unchanged.
2. `src/lib/progression/recommendation.ts`: the copy catalog (design doc §4.4) as one pure, client-safe builder.
3. Read layer: `recommendation` on `OccurrenceProgressionDto`, `SessionProgressionSummaryDto.exercises[]`, `ExerciseProgressionDto`, and `PlannedProgressionDto` (evidence only rendered there); the "last time" vs date rule; the gym suffix for machines and cables.
4. The card's working weight read **as of before the occurrence** while its session is in progress (R9).
5. UI: one `Recommendation` component; the card's note/suggestion slot, the planned list's tagged rows, the day-complete rows, and the exercise page's Progression block, per the preview.
6. Retire `src/lib/progression/rir-copy.ts` (its two sentences move into the catalog as P3 and H1).
7. Tests: engine evidence, builder catalog, a generated-history correspondence sweep, static guards (no UI-side evaluation), integration (all surfaces, gym scope, deload-week suppression, edit recomputation, mid-workout stability, non-mutation, isolation), e2e, and the unchanged tap count.
8. `docs/planning/method-note.md`: a new entry, "Recommendation and evidence" (R27).
9. User guidance via `/overload-onboarding` (final ticket).

### Out of scope

New or changed thresholds; any second evaluation (UI or server); a reactive-deload load; bodyweight weight/variation prescriptions; AI or generated text; stored recommendation text; any plan, weight, baseline, or goal write; RIR rule changes; scheduled-deload changes; OVE-61 (the working-weight source's extra-set and log-late ordering limits — R10); the History day page; any new route, page, chart, or history view (Exercise History & PR Intelligence); notifications; schema or migration changes; account, signup, or email work.

## 5. Core concepts

| Concept | Description |
| ------- | ----------- |
| **Call** | The engine's final `ReactiveState` (`insufficient`, `hold`, `progress`, `deload`, `stalled`) plus `rirEffect`, or the occurrence's scheduled-deload suppression. Unchanged. |
| **Evidence** (`DecisionEvidence`) | A structured, derived value returned with the call by the branch that decided it. It carries only facts the branch read. Never stored. |
| **Counted session** | A qualifying performance (Pitch 5 R9/R38/R44): complete, every planned working set, not a scheduled-deload week, in scope (this gym for machines and cables). |
| **Latest counted session** | `qualifyingSequence(perfs).at(-1)`. |
| **Latest finished performance** | The most recent performance in scope whose `LoggedSession.status = complete` (complete sets or not, deload week or not). |
| **Recommendation** | `{ kind, tone, action, evidence }` strings built by `buildRecommendation`. Derived on read, never stored. |
| **When** | `today` when the occurrence's session is not complete (the card advises the workout in front of the lifter) or for the planned list; `next` when the judged history includes the finished session (day-complete summary, exercise page, a card of a completed session). |
| **Working weight** | The single Pitch 4 source (`currentWorkingWeightLbs`). Hold's `Stay at {w}` and Progress's `{w} + 5` read the same value, so there is never a second weight authority. |

## 6. States and lifecycle

No persisted state. The evaluation pipeline per read:

```text
gatherRows (unchanged) → scope (gym for machines/cables) →
  scheduled-deload occurrence?  ── yes → S1 (no engine call; unchanged)
                                └─ no  → evaluateReactiveDecision → { state, base, rirEffect, evidence }
→ load context (suggestion via currentWorkingWeightLbs; R9 exclusion while in progress)
→ buildRecommendation(...)  → { kind, tone, action, evidence } | null
```

Evidence per branch of `evaluateBase` / `evaluateReactiveDecision` (precedence unchanged):

| Branch (existing) | `state` | `evidence.kind` | Fields |
| ----------------- | ------- | --------------- | ------ |
| `seq.length < MIN_QUALIFYING_SESSIONS` | `insufficient` | `insufficient` | `qualifying`, `required` |
| deload window all `hasBelowMin` | `deload` | `deload` | `sessions` (= window length), `repMin` (number if every window performance shares it, else `null`) |
| progress candidate, no external load / `seq < STALL_WINDOW` / trend rose | `progress` | `progress` | `sessions`, `repMax` (shared or `null`) |
| progress candidate, trend `end ≤ start` | `stalled` | `stalled` | `sessions`, `window` (= `STALL_WINDOW_SESSIONS`), `repMax` |
| not a progress candidate, latest counted session all-top | `hold` | `hold_top_once` | `repMax` (latest's), `sessions` (= `PROGRESS_CONSECUTIVE_SESSIONS`), `latest` |
| not a progress candidate, latest counted session short of the top | `hold` | `hold_short` | `reps` (latest's working sets, set order), `repMin`, `repMax`, `latest` |
| RIR case B applied | `progress` | `released_stall` | `rirToSpare` (= `RIR_TO_SPARE_MIN`), `latest` |
| RIR case A applied | `hold` | `held_at_limit` | `rirAtLimit` (= `RIR_AT_LIMIT`), `latest` |

`latest` is `{ loggedExerciseId, dateIso }` of the latest counted session. The evidence kind is a total function of the branch taken, so `state` and `evidence.kind` can never disagree (asserted by the sweep, §14.1).

## 7. UI integration

Reference: design doc Screens 1–4 and the preview (§01–§08). The preview is binding for hierarchy, placement, tone, and states.

### Screens and surfaces

| Surface | Data | Change |
| ------- | ---- | ------ |
| Exercise card `/log/[id]` (`ExerciseCard`) | `CardProgression.recommendation` (when `today`, or `next` for a completed session) | The note slot (deload-week note / stall note / RIR line) and the `SuggestedLoad` line are **replaced** by `<Recommendation>` under the context/swap lines. Tag position unchanged. |
| Today planned list `/` | `PlannedProgressionDto.recommendation` | A tagged row (`tag !== null`) renders `recommendation.evidence` on its own full-width line under the row. Right side unchanged (`SuggestedLoad` + tag, scheme, or `once gym is set`). Hold rows and deload-week rows unchanged. |
| Today day complete `/` (`CompleteBlock`) | `SessionProgressionSummaryDto.exercises[].recommendation` (`next`) | Each performed exercise is a block: name + tag + `trend ›`, then `<Recommendation>`. The short RIR phrase and right-side `SuggestedLoad` are removed (the action carries the number). Deload week unchanged. |
| Exercise page `/exercises/[id]` (`ProgressionSection`) | `ExerciseProgressionDto.recommendation` (`next`), `insufficientNote` | Tag (if any) then `<Recommendation>`; `Holding`, `Suggested next:` and the RIR line are removed. Insufficient: `insufficientNote` replaces "Not enough history yet". Chart unchanged. |

### Components

| Component | Contract | Notes |
| --------- | -------- | ----- |
| `Recommendation` (`src/components/progression/recommendation.tsx`, new, server-safe, no hooks) | `{ recommendation: RecommendationDto \| null; className?: string }` | `null` → renders nothing. `<div className="mt-2 space-y-0.5">` with `<p>` action (`text-sm tabular-nums`, `font-medium text-foreground` when `tone === "strong"`, else `text-muted-foreground`) and `<p>` evidence (`text-xs text-muted-foreground tabular-nums`). No truncation, no icon, no interactive element. |
| `ProgressTag` | unchanged | |
| `SuggestedLoad` | unchanged | Used by the planned list only after this pitch. |
| `ScheduledDeloadBanner` | unchanged | |

The card stays a client island; `Recommendation` has no hooks, so it renders inside it. No new focusable element anywhere (Faster Logging UX tap count 18/18 and control counts unchanged).

### Forms and validation

None. Nothing in this pitch accepts input.

## 8. Data model

**No change.** No model, column, enum, index, migration, trigger, or RLS change. `schema.prisma` and `prisma/migrations/` must be byte-identical to `main` at the end of the pitch (checked in verification).

### Derived fields

| Field | Stored? | Computed from | Notes |
| ----- | ------- | ------------- | ----- |
| `evidence` (`DecisionEvidence`) | no | the performances the engine evaluated | per read |
| `recommendation` (`RecommendationDto`) | no | call + evidence + working weight + gym name + when | per read |
| `insufficientNote` | no | `evidence` (`insufficient`) + gym name | exercise page only |

## 9. Authorization and access control

Unchanged and inherited: every surface reads through `requireAccount()` and the account-scoped `account.db` (Multi-User Foundation). No new server action and no new route. A foreign exercise id on `/exercises/[id]` stays not-found (`getExerciseProgression` → `null`); a foreign `loggedExerciseId` yields `null` from `getOccurrenceProgression`. Evidence is built only from rows the scoped client returns, so it cannot carry another account's data. RLS deny-all unchanged.

## 10. Storage model

Not applicable.

## 11. Server modules and surface

### 11.1 Engine `src/lib/progression/engine.ts`

```ts
export type PerformanceRef = { loggedExerciseId: string; dateIso: string };

export type DecisionEvidence =
  | { kind: "insufficient"; qualifying: number; required: number }
  | { kind: "deload"; sessions: number; repMin: number | null }
  | { kind: "progress"; sessions: number; repMax: number | null }
  | { kind: "stalled"; sessions: number; window: number; repMax: number | null }
  | { kind: "hold_top_once"; repMax: number; sessions: number; latest: PerformanceRef }
  | { kind: "hold_short"; reps: number[]; repMin: number; repMax: number; latest: PerformanceRef }
  | { kind: "held_at_limit"; rirAtLimit: number; latest: PerformanceRef }
  | { kind: "released_stall"; rirToSpare: number; latest: PerformanceRef };

export type ReactiveDecision = {
  state: ReactiveState;
  base: ReactiveState;
  rirEffect: RirEffect;
  evidence: DecisionEvidence; // new; produced by the branch that returned `state`
};
```

- `evaluateBase` attaches evidence at each existing `return`; no condition, constant, or order changes. `evaluateReactive` (state only) is unchanged.
- `DecisionEvidence` and `PerformanceRef` are re-exported from `types.ts` (client-safe).
- Shared-range helper: `sharedValue(perfs, pick)` → the value if every performance agrees, else `null` (R14).

### 11.2 Builder `src/lib/progression/recommendation.ts` (new, pure, client-safe; replaces `rir-copy.ts`)

```ts
export type RecommendationKind = "progress" | "hold" | "deload" | "scheduled_deload";
export type RecommendationDto = {
  kind: RecommendationKind;
  tone: "strong" | "quiet";
  action: string;
  evidence: string;
};

export type RecommendationInput =
  | {
      scheduledDeload: true;
      externalLoad: boolean;
      deloadLoadLbs: number | null; // the existing 90% suggestion, null without context
    }
  | {
      scheduledDeload: false;
      state: ReactiveState;
      rirEffect: RirEffect;
      evidence: DecisionEvidence;
      externalLoad: boolean;
      workingWeightLbs: number | null; // currentWorkingWeightLbs (R9 exclusion applied by caller)
      progressLoadLbs: number | null;  // the existing SuggestedLoad lbs on Progress, else null
      gymName: string | null;          // set only for a gym-variable scope
      latestIsLastTime: boolean;       // §4.3 of the design doc
      when: "today" | "next";
    };

export function buildRecommendation(input: RecommendationInput): RecommendationDto | null;
export function insufficientNote(e: DecisionEvidence, gymName: string | null): string | null; // null unless kind === "insufficient"
```

Rules (the design doc §4.4 catalog, verbatim; `{when}` = `today` / `next time`; `{When}` = `Today` / `Next time`; `{gym}` = ` at ${gymName}` when non-null; `{last}` = `last time` when `latestIsLastTime`, else `on ${formatPlanDate-short(latest.dateIso)}` (e.g. `on Oct 13`), `{Last}` capitalised):

| Input | kind / tone | action | evidence |
| ----- | ----------- | ------ | -------- |
| scheduled deload, `externalLoad && deloadLoadLbs` | `scheduled_deload` / quiet | `Deload week: {d} lb ({pct}%)` | `Planned recovery, not a verdict. Calls resume next week.` |
| scheduled deload, otherwise | `scheduled_deload` / quiet | `Deload week` | same |
| `insufficient` | — | **returns `null`** | — |
| `progress` + `progressLoadLbs` (loaded) | `progress` / strong | `Try {s} lb {when} (+{inc} lb)` | per evidence (below) |
| `progress`, loaded, no load | `progress` / strong | `Ready to add weight {when}` | per evidence |
| `progress`, bodyweight | `progress` / strong | `{When}, go past {repMax} reps or make it harder` (`the top of the range` when `repMax` null) | per evidence |
| `hold` / `stalled`, loaded with `workingWeightLbs` | `hold` / quiet | `Stay at {w} lb {when}` | per evidence |
| `hold`, bodyweight or no weight | `hold` / quiet | `Hold steady {when}` | per evidence |
| `deload`, loaded | `deload` / strong | `Lower the weight {when}` | per evidence |
| `deload`, bodyweight | `deload` / strong | `Back off {when}` | per evidence |

Evidence strings by `evidence.kind`:

| kind | string |
| ---- | ------ |
| `progress` | `{repMax} reps on every set, {n} sessions running{gym}`; `repMax` null → `Top of the range on every set, {n} sessions running{gym}` |
| `released_stall` | `e1RM flat, but every set {last} had {rirToSpare}+ in reserve{gym}` |
| `held_at_limit` | `Top of the range, but at your limit {last} ({rirAtLimit} RIR){gym}` |
| `stalled` | `Top of the range {n} sessions running, but e1RM hasn't risen over {window} sessions{gym}` |
| `hold_top_once` | `{repMax} on every set {last}; progress needs {n} sessions running{gym}` |
| `hold_short` | `{Last}: {r1}, {r2}, … of {repMin}–{repMax}{gym}` |
| `deload` | `A set below {repMin} reps, {n} sessions running{gym}`; `repMin` null → `A set below the range, {n} sessions running{gym}` |

`{inc}` = `PROGRESS_INCREMENT_LBS`, `{pct}` = `Math.round(SCHEDULED_DELOAD_FACTOR * 100)`. Every figure is a constant from `config.ts` or a value from `evidence` / the load context; the module contains no numeric literal other than `0`, `1` (string indexing) and `100` (percentage, rounding) (guard, §14.1).

Defensive mapping: if `state` and `evidence.kind` ever disagree (they cannot, §6), `buildRecommendation` throws in development/test and returns `null` in production (never a wrong sentence). `insufficientNote`: `Not enough history yet{gym}: {qualifying} of {required} complete sessions.`

### 11.3 Working weight `src/lib/logging/queries.ts`

`currentWorkingWeightLbs(account, exerciseId, gymId, gymVariable, opts?: WorkingWeightOptions)` with `{ completedOnly?: boolean; baselineWrittenBefore?: Date }` (v1.1, review audit; supersedes v1.0's `excludeLoggedExerciseId`). `completedOnly` limits the latest-set lookup to completed workouts; `baselineWrittenBefore` treats a baseline written at or after that instant (by the in-progress workout) as no context. Every progression read passes `completedOnly`; the in-progress card also passes its session's `createdAt`. Without options, behaviour is byte-identical (the Faster Logging UX card offer and every other caller are untouched). The read layer then applies the trust gate (R33) before printing a number.

### 11.4 Read layer `src/lib/progression/queries.ts`

| Function | Change |
| -------- | ------ |
| `getOccurrenceProgression(account, loggedExerciseId)` | Reads the occurrence's session `status` and gym name. `when = status === "complete" ? "next" : "today"`. While not complete, suggestions and the hold weight read `currentWorkingWeightLbs(..., { excludeLoggedExerciseId })` (R9). Scheduled-deload: `recommendation` = S1 from the existing 90% suggestion. Otherwise `buildRecommendation` from the decision. `latestIsLastTime` = latest counted session is the latest finished performance in scope (finished = session complete; today's in-progress occurrence is never finished). Adds `recommendation` to the DTO. |
| `getSessionProgressionSummary` | Unchanged composition (reuses `getOccurrenceProgression`, so summary and card never disagree); carries `recommendation`. The summary's session is complete, so `when = next`. |
| `getExerciseProgression(account, exerciseId, gymId?)` | Adds `recommendation` (`when = next`, gym name for gym-variable) and `insufficientNote` (non-null only for `insufficient`). No R9 exclusion (no occurrence). |
| `getPlannedProgression` | Adds `recommendation` from the exercise-level evaluation with `when = today`; `null` for gym-variable (deferred until gym, R14/R15 Pitch 5) and in a scheduled-deload week (the list shows only the existing 90% load). |

The existing `tag`, `rirEffect`, `suggestion`, `hasTrend`, `state` fields stay (the tag still renders; `suggestion` still feeds the planned list's right side).

### 11.5 Actions

None added or changed. `logSetAction` / `editLoggedSetAction` already revalidate the affected paths; the next render rebuilds recommendations.

### Error format

Not applicable (no new action). A read failure behaves as today (the page's error boundary); the card's progression map falls back to `recommendation: null` when `getOccurrenceProgression` returns `null`.

## 12. Validation rules

No input. Builder preconditions (asserted in tests, never thrown at users): numbers are finite; `reps` non-empty for `hold_short`; `gymName` set only for gym-variable scopes.

## 13. UI data contracts

```ts
// src/lib/progression/types.ts (client-safe) — additions
export type RecommendationDto = {
  kind: "progress" | "hold" | "deload" | "scheduled_deload";
  tone: "strong" | "quiet";
  action: string;
  evidence: string;
};

export type OccurrenceProgressionDto = {
  loggedExerciseId: string;
  scheduledDeloadWeek: boolean;
  tag: ProgressionTag | null;
  rirEffect: RirEffect;
  suggestion: SuggestedLoadDto;
  hasTrend: boolean;
  recommendation: RecommendationDto | null; // new
};

// SessionProgressionSummaryDto.exercises[] gains `recommendation: RecommendationDto | null`
// ExerciseProgressionDto gains `recommendation: RecommendationDto | null; insufficientNote: string | null`
// PlannedProgressionDto gains `recommendation: RecommendationDto | null`

// src/components/logging/exercise-card.tsx
export type CardProgression = {
  tag: ProgressionTag | null;
  recommendation: RecommendationDto | null; // replaces rirEffect + suggestion on the card
  scheduledDeloadWeek: boolean;
  hasTrend: boolean;
};
```

The field name `recommendation` is identical on every DTO. `DecisionEvidence` never crosses to the client (the strings do).

## 14. Testing strategy

### 14.1 Unit (`tests/unit/`, no DB)

**Engine evidence** (`progression-evidence.test.ts`, new)

```text
GIVEN 1 counted session                         THEN insufficient {qualifying:1, required:2}
GIVEN 185×10,10,10 twice (8–10), seq < 3        THEN progress {sessions:2, repMax:10}
GIVEN ranges 8–10 then 6–8, both all-top        THEN progress {repMax:null}
GIVEN 3 all-top, e1RM equal / falling           THEN stalled {sessions:2, window:3, repMax}
GIVEN latest all-top, previous not              THEN hold_top_once {repMax, sessions:2, latest}
GIVEN latest 10,9,8 of 8–10                     THEN hold_short {reps:[10,9,8], repMin:8, repMax:10}
GIVEN two sessions each with a set < min        THEN deload {sessions:2, repMin}
GIVEN case A / case B histories (Pitch 14)      THEN held_at_limit {rirAtLimit:0} / released_stall {rirToSpare:2}
GIVEN scheduled-deload perfs between            THEN excluded from windows (unchanged), latest is the counted one
```

**Regression:** every existing `progression-engine`, `progression-rir`, `progression-deload`, `progression-e1rm` assertion on `state`/`base`/`rirEffect` stays and passes unchanged.

**Builder catalog** (`progression-recommendation.test.ts`, new): one case per design-doc catalog row × loaded/bodyweight × gym/no gym × today/next, asserting exact strings, including P2, the `repMax`/`repMin` null wording, the `{last}` date form, S1 with and without a load, and `insufficient → null`. `insufficientNote` with and without a gym.

**Correspondence sweep (AC-2):** 2,000 seeded-random histories (2–6 performances, random ranges, reps, weights, RIR including `null`, deload weeks, incomplete performances, loaded and bodyweight) → `evaluateReactiveDecision` → `buildRecommendation`. For every history assert:
- `kind` ↔ `state`: progress→`progress`, hold/stalled→`hold`, deload→`deload`, insufficient→`null`;
- action prefix ∈ the allowed set for that kind (`Try`/`Ready to add`/`…go past` | `Stay at`/`Hold steady` | `Lower the weight`/`Back off`);
- the evidence mentions `RIR` or `in reserve` **iff** `rirEffect !== null`;
- a bodyweight action never contains `lb`; a deload action never contains a digit;
- the evidence's numbers are a subset of {window/session constants, the latest counted session's reps and range, the window's shared range};
- no forbidden phrase (`fatigue`, `overtrain`, `injur`, `optimal`, `guarantee`, `perfect`, `should`, `recover` outside S1).

**Static guards** (extend `invariant-guards.test.ts`):
- no file under `src/app/` or `src/components/` imports `@/lib/progression/engine` or calls `evaluateReactive*` (no UI-side evaluation);
- the action/evidence sentences live only in `recommendation.ts` (`go past`, `Stay at`, `Lower the weight`, `sessions running` appear in no other `src/` file);
- `recommendation.ts` imports nothing server-only or Prisma, and contains no numeric literal other than `0`, `1`, `100`;
- `rir-copy.ts` no longer exists and nothing imports it.

**Components** (`recommendation.test.tsx`, new; `exercise-card-*.test.tsx` extended): renders both lines; tone classes; `null` renders nothing; no element with a role or `tabIndex`; the card renders the recommendation in place of the old note/suggestion and its control count is unchanged.

### 14.2 Integration (embedded Postgres; `tests/integration/progression-recommendation.int.test.ts`, new)

Histories are written through the canonical write path (`logSet`/`editLoggedSet`, `startOrResume`, `completeSession`) as in `progression.int.test.ts`.

```text
Surfaces agree:   card (completed occurrence), summary, page → identical recommendation for the same evaluation
P1 free weight:   page "Try 190 lb next time (+5 lb)" / "10 reps on every set, 2 sessions running"
P1 bodyweight:    "Next time, go past 12 reps or make it harder"; no "lb"
H4 / H3:          "Stay at 60 lb next time" + "Last time: 10, 9, 8 of 8–10" / hold_top_once wording
D1 cable, Gym A:  "Lower the weight …", evidence ends " at Gym A"; Gym B's page for the same exercise independent
RIR A / B:        H1 / P3 wording; same reps with RIR NULL → no RIR wording
H2:               stalled wording; no e1RM figures
Deload week:      card S1 "Deload week: 170 lb (90%)"; an exercise the rule flagged shows no Deload words; next week resumes
Date rule:        latest counted Oct 13, Oct 20 finished with 2/3 sets → "on Oct 13"; otherwise "last time"
Planned list:     tagged free-weight row carries evidence; gym-variable null; deload week null
Mid-workout (R9): in-progress occurrence; log set 1 at 190 → card action still "Try 190 lb today (+5 lb)";
                  after completeSession → summary "… next time" from the completed history
Edit recompute:   editLoggedSet past set 10→8 → next read turns P1 into H4 with the corrected reps
Non-mutation:     snapshot every row (and updatedAt) of mesocycles, sessions, session_exercises, gyms,
                  gym_exercise_baselines, logged_sessions, logged_exercises, logged_sets, goals before;
                  read every surface (page, planned, card occurrence, summary) for every scenario;
                  snapshot after → deep-equal
```

**Isolation** (`tests/integration/isolation/progression.int.test.ts`, new; registered in `coverage.ts` if that registry lists read paths): B reading A's exercise id → `null`; B's occurrence id for A's logged exercise → `null`; A's history never changes B's recommendation for the shared library exercise; B's recommendation evidence never contains A's numbers.

**Standing invariants** keep passing unchanged: history-integrity, logging, bodyweight-logging, gyms/baselines, progression, progression-rir, goals, rls, schema, all `isolation/*`, guards.

### 14.3 E2E, local Supabase stack (`e2e/accounts/explainable-progression.spec.ts`, new)

A fresh account logs two complete sessions of a free-weight exercise at the top of range (through the UI), then:
1. Today day-complete shows `Try {w+5} lb next time (+5 lb)` and `… reps on every set, 2 sessions running`.
2. The exercise page shows the same two lines.
3. Correct one past set in History below the top → both surfaces show `Stay at … next time` and the corrected reps.
4. Phone (375) and desktop (1280), light and dark screenshots for preview comparison.
The account is removed through the app afterwards. `faster-logging.spec.ts` (exact 18 taps / 18 keystrokes) and `rir-logging.spec.ts` are updated only where they assert the retired RIR sentences, replacing them with the new evidence strings (no assertion loosened).

### 14.4 Regression

Unit, integration, both e2e configs, `npm run verify:client-bundle`, lint, typecheck, prettier, build. `git diff main -- prisma/` empty.

## 15. Acceptance criteria

### AC-1 — Evidence for every non-trivial recommendation (roadmap DoD 1)
- [ ] Every Progress, Deload, Hold — trend flat, RIR-qualified, and ordinary Hold call on the card, summary, and exercise page shows an evidence line; tagged planned-list rows show it.
- [ ] The evidence is built from the engine's `evidence` for that evaluation (sweep + integration).

### AC-2 — Recommendation text matches the engine (roadmap DoD 2)
- [ ] The sweep's kind/prefix/RIR/number assertions hold for 2,000 histories.
- [ ] No UI-side evaluation (guard). Card, summary, and page agree (integration).
- [ ] The card's number is stable through an in-progress workout (R9).
- [ ] Corrected history changes the recommendation on the next read (integration + e2e).

### AC-3 — Recommendations do not modify stored training data (roadmap DoD 3)
- [ ] Reading every surface leaves every plan, weight, baseline, set, and goal row byte-identical (integration snapshot).
- [ ] No new action; no write path added (`git diff` review; guards).

### Supporting (pitch §6, §16)
- [ ] Actionable wording for Progress, Hold, reactive Deload, bodyweight (catalog tests).
- [ ] RIR named only when `rirEffect` is set; missing RIR never shown or inferred.
- [ ] Deload week: no reactive words anywhere; S1 only.
- [ ] Machines and cables: evidence names the gym; other gyms independent.
- [ ] Faster Logging UX tap count unchanged (18/18) and no new focus stop.
- [ ] Implementation matches the preview's hierarchy, tone, and states at 375/1280, light and dark.
- [ ] Final guidance ticket via `/overload-onboarding`.

## 16. Explicit non-goals

- ❌ New/changed thresholds or rules. **Permanent for this pitch** (roadmap Defers).
- ❌ A reactive-deload load, bodyweight weight or variation prescriptions. **Deferred** — needs its own rule in a future pitch.
- ❌ AI or generated coaching text. **Permanent** (pitch §7).
- ❌ Stored recommendation text or tags. **Permanent** (CLAUDE.md).
- ❌ Any write from a recommendation. **Permanent** (roadmap DoD 3).
- ❌ Exercise history view, PR intelligence, new charts. **Deferred** to Exercise History & PR Intelligence.
- ❌ OVE-61 working-weight source change. **Deferred** (owner decision, R10).
- ❌ Program generation, social features, cardio progression. **Permanent.**

## Resolved Decisions

Authority order (CLAUDE.md, Autonomous Pipeline Policy): approved planning docs → CLAUDE.md and skills → codebase patterns → judgment.

| # | Decision | Rationale | Authority |
| - | -------- | --------- | --------- |
| R1 | **Stop before merge.** Leave the feature PR open for human approval. | CLAUDE.md: "If [the run prompt] is silent, stop before merge"; the run prompt grants no explicit merge authority; the pitch (bucket A) proposes it; guide D1 "When unsure, stop". Guide D1's roadmap default for this feature is merge-on-green — flagged in the report. | CLAUDE.md; pitch §14, §15; guide §4.2, D1 |
| R2 | The preview is `docs/previews/15-smarter-explainable-progression-preview.html`, not the run prompt's `.tsx`. | The owner's standing preview format. | Owner feedback memory; overload-ui-design skill |
| R3 | **Evidence is emitted by the engine branch that decides the call**; the UI never evaluates. | One evaluation, so text and tag cannot diverge (pitch §9.2; AC-2). | Pitch §4.7, §9.2; Pitch 5 R1 |
| R4 | **One builder** (`recommendation.ts`) owns every sentence; `rir-copy.ts` is retired into it. | One explanation everywhere and the reuse point for Exercise History & PR Intelligence. | Pitch §4.11, §11; design §3.4 |
| R5 | Recommendations are **computed on every read and carried as strings on DTOs**; never stored. | Stale text is impossible; edits propagate. | CLAUDE.md (derived on read); pitch §9.11 |
| R6 | **Loads only where the engine has one**: Progress `{w}+5` (existing `SuggestedLoad`) and the deload week's existing 90%. | Any other number is a new progression rule. | Pitch §4.1, §9.1; Pitch 5 R27, R33 |
| R7 | **Reactive Deload has no number**: `Lower the weight` / `Back off`. | The engine defines no reactive reduction; borrowing 90% would merge the two deload systems. | Pitch §4.3, §10; CLAUDE.md two deload systems |
| R8 | **Bodyweight Progress** points at the plan's own top of range: `go past {repMax} reps or make it harder`. | The only rep figure the engine has; no weight, no invented variation. | Pitch §4.4; Pitch 5 bodyweight branch |
| R9 | **The card's numbers are read from finished history** while its session is in progress. *(v1.0 excluded only the current occurrence; superseded by R33 after review.)* | The call ignores today's unfinished session; its number must too, or the card advises `Try 195` after the lifter logs 190. | Pitch §4.7 (AC-2); Pitch 5 R29 |
| R10 | **OVE-61 is not absorbed** (extra sets and log-late ordering in the working-weight source). The Hold `{w}` uses the same source and inherits its limits. | OVE-61 reserves this for the owner and changes Faster Logging's prefill (what gets written). | OVE-61 acceptance; pitch §10 "no changes to canonical logged-set writes" |
| R11 | **Ordinary Hold**: no tag, two muted lines on card, summary, page; nothing new on the planned list. | Restrained hold, yet actionable. | Pitch §4.2, §9.6; Pitch 5 R7, R53; design §3.3 |
| R12 | **Planned list**: evidence on its own full-width line, tagged rows only; right side unchanged. | Keeps one thing on the right (Pitch 14 R20); avoids squeezing at 375 (preview). | Design Screen 2; preview §05 |
| R13 | **The stall evidence names the rule, not e1RM figures** (`hasn't risen over 3 sessions`). | The gate compares unrounded values; rounded figures could read equal on a fall. | Pitch 5 R23; pitch §9.5 |
| R14 | **Mixed planned ranges** in a window → `top of the range` / `below the range`. | No single number is true for both sessions. | Pitch 5 R8 |
| R15 | **Progress evidence names the rep rule only**; a passing stall gate is not cited. | The gate passing is the absence of a blocker; concision. | Pitch §4.5; design §4.4 |
| R16 | **RIR is mentioned only when `rirEffect` is set** (P3, H1). | Evidence that didn't decide the call is not cited; missing ≠ 0. | Pitch §4.6, §9.5, §9.9; Pitch 14 R11–R14 |
| R17 | **"Last time" only when the latest counted session is the latest finished one in scope; otherwise its date** (`on Oct 13`). Applies to the RIR sentences too. | Prevents the evidence contradicting the card's `Last time` line after an incomplete or deload-week session. | Pitch §4.7; design §4.3 |
| R18 | **When**: `today` on the card while the session is in progress and on the planned list; `next` on the summary, the page, and a completed session's card. | The judged history determines which session the advice is for. | Design §4.2 |
| R19 | **Deload week (S1)**: `Deload week: {d} lb (90%)` + `Planned recovery, not a verdict. Calls resume next week.`; summary and planned list unchanged. | Keeps the existing voice; suppression untouched (no engine call). | Pitch §4.9; Pitch 5 R37, R40 |
| R20 | **Not enough history** is not a recommendation (`null`); the exercise page states `{q} of {required} complete sessions`. | Missing is not a hold; factual count. | Pitch 5 R4; guide §4.3 "missing is not zero" |
| R21 | **Gym suffix** ` at {gym}` on every machine/cable evidence line; never on free weights. | Gym context visible; no cross-gym reading. | Pitch §4.8; Pitch 5 R12–R14 |
| R22 | **Advisory verbs** `Try` / `Stay at` / `Lower`; forbidden-phrase list enforced in tests. | No certainty or physiological claims. | Pitch §4.3, §4.12, §9.4 |
| R23 | **No schema change, no migration, no new action or route.** | Presentation of existing evaluation only. | Pitch §6, §10 |
| R24 | The day-complete row drops the short RIR phrase and the right-side `SuggestedLoad`; the action carries the number. | One place for the number; matches the preview. | Preview §05 |
| R25 | The exercise page drops `Holding` and `Suggested next:`; insufficient uses `insufficientNote`. | The action line says it more usefully. | Design Screen 4; preview §06 |
| R26 | Builder disagreement guard: throw in dev/test, `null` in production. | A wrong sentence is worse than none. | Guide §4.3 "silence over a weak claim" |
| R27 | **Method note entry** "Recommendation and evidence (established by Smarter & Explainable Progression)": the evidence kinds, the builder as the only copy source, R6–R9, R16–R18. | Exercise History & PR Intelligence consumes it. | Guide §4.5; CLAUDE.md (method-note exception) |
| R28 | **Guidance (decided by `/overload-onboarding` in OVE-68)**: both mechanisms have shipped. **No tour change**: no new screen or control was added, and the `logging` step ("Overload uses them to tell you when to progress, hold, or deload") stays true; a richer text line is not a discoverable control. **One significant What's New entry**, `2026-10-21-clearer-progression-calls` / "Clearer progression calls", with a **provisional** date (the day it was written), set to the merge day by the human at merge (runbook §2), never backdated. | The skill's rubric; pitch §12 ("a richer evidence line does not automatically justify another tour step"); the entry changes what lifters notice about their core recommendation. | Pitch §12; overload-onboarding rubric; What's New spec §8 |
| R29 | **Tickets**: (1) engine evidence + builder + read layer + R9 + unit/integration/isolation; (2) UI surfaces + component tests + e2e + preview comparison; (3) user guidance. blockedBy chain 1 → 2 → 3. | Coherent medium-large PRs; UI depends on DTOs. | Run prompt; guide §5 step 6 |
| R31 | The Library & Gyms Setup guard "no recommendation code" (`deliberate-absences.test.ts`) is narrowed by **exactly** the progression vocabulary (`recommendation(s)`, `RecommendationDto/Input/Kind/State`, `buildRecommendation`); any other "recommend" (a verb, recommended exercises or programs) still fails, and a new guard proves the builder never lists, ranks, or picks exercises. | That guard bans exercise-library personalization; the roadmap names progression recommendations as this feature. Narrowing the word, not the intent. | Pitch 2 spec §4, §16; roadmap → Smarter & Explainable Progression |
| R32 | `rir-copy.ts` is retired in the UI ticket (OVE-67), not OVE-66, because the surfaces that import it change there; the "rir-copy gone" guard lands with it. | Keeps OVE-66 free of UI edits. | Ticket split R29 |
| R33 | **Review audit (#86 findings 1, 3, 5): the number is the judged session's, or none.** Progression reads take the single working-weight source from **completed workouts only**, and a free-weight number (Hold's `{w}`, Progress's `{w}+5`, and the planned list's `Try …`) is printed only when it equals the load of the **last working set of the latest counted session** (`ReactiveDecision.latestLoadLbs`); otherwise it is withheld ("Hold steady", "Ready to add weight"). Machines and cables keep the gym baseline as authority. | An extra back-off set or a log-late ordering could otherwise print a weight the evidence contradicts; withholding is the safe direction and keeps one weight source. | Pitch 5 R29–R31; guide §4.3 "silence over a weak claim"; OVE-61 |
| R34 | **Review audit (#86 finding 2): a baseline the in-progress workout rewrote is not that workout's context.** The in-progress card reads the baseline only if it was written before the session started; otherwise the number is withheld. | A ≥15% correction mid-workout would otherwise move today's advice. | Pitch 5 R30; R9 |
| R35 | **Review audit (#86 finding 6): release-note copy** says a deload "says where your sets fell short" (it names the shortfall rule, not the sets). | Describe only what shipped (pitch §12). | overload-onboarding; What's New spec §8 |
| R36 | **Review audit dispositions not implemented:** finding 4 (advice around an upcoming / current scheduled-deload week) **deferred to OVE-69** (needs an owner decision about the pre-existing exercise-page tag); finding 7 (derive the weight from the evidence) **deferred to OVE-61**; findings 8 (extra per-hold weight read on the planned list) and 10 (keep `suggestion`/`rirEffect` on DTOs) **skipped** with reasons on #86. | Scope and authority. | Review audit |
| R30 | Existing tests that assert the retired RIR sentences (`progression-rir.test.ts`, `rir-logging.spec.ts`) are updated to the new strings; their behavioural assertions (state, rirEffect) are untouched. | Copy moved, behaviour didn't; no assertion is weakened. | CLAUDE.md verification honesty |

## 17. Open questions

None blocking. Carried for the owner (report): OVE-61 scope (R10); whether a reactive-deload load should exist (R7, needs a rule-bearing pitch); the guide's merge default for this feature (R1).

## 18. Future considerations

- Exercise History & PR Intelligence renders `ExerciseProgressionDto.recommendation` as "the current recommendation and why", and may add "recent progression decisions" by evaluating historical prefixes through the same engine and builder.
- If OVE-61 lands, every `{w}` improves automatically (one source).
- A future rule-bearing pitch that defines a reactive reduction or a bodyweight progression target adds an `evidence`/load field and one catalog row; nothing else changes.
