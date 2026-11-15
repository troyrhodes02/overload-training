---
version: 1.0.0
status: approved
author: Claude Code (autonomous pipeline run)
last_updated: 2026-11-15
pitch_reference: docs/pitches/mvp-5c-native-and-sharing/prescription-aware-intelligence/pitch.md
design_reference: docs/pitches/mvp-5c-native-and-sharing/prescription-aware-intelligence/design.md
preview_reference: docs/pitches/mvp-5c-native-and-sharing/prescription-aware-intelligence/preview.tsx
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
linear_issue: OVE-192, OVE-193, OVE-194, OVE-195, OVE-196 (milestone "Prescription-Aware Intelligence")
---

# Prescription-Aware Intelligence — Technical Spec

## 1. Summary

Every piece of workout context Overload derives — the set-1 weight offer, the card's "Last time" line, the reactive progress/hold/deload call, the +5 lb and scheduled-deload numbers, and the exercise page's calls — is read today from "the most recent performance of this exercise" (gym-scoped for machines and cables). This spec scopes all of them to a **recurring exercise**: the exercise inside one durable recurring workout. Push's bench and Upper's bench keep separate weight memory and separate progression calls, while records, the e1RM trend, and goals stay exercise-wide.

The core abstraction is a pure, shared **segment** function. A recurring exercise is identified by `(session lineage, performed exerciseId)`, plus the gym for gym-variable equipment. Its history is walked newest to oldest, collecting performances whose copied prescription (rep range, and target RIR once Planned Workout Guidance records one) is compatible with the anchor occurrence, and stopping at the first incompatible one. Every reader passes that segment to the **unchanged** pure engine and takes its weights from the same rows. Durable identity across cloned blocks comes from one new immutable column, `Session.lineageId`.

"Working" means: Wednesday's 6–8 bench is offered 230 lb from Upper and never Saturday's 255 lb; a Wednesday miss never deloads Saturday; returning to an old rep range starts a new streak; a machine progressed from 50 to 55 lb is offered 55 lb; and the card, Today, the finish summary, and the exercise page agree. No `LoggedSet` changes, no baseline write changes, and no Production change.

## 2. Problem

- The app cannot yet tell bench in Push from bench in Upper. `gatherRows` (`src/lib/progression/queries.ts`) reads `where: { exerciseId }`, `workingWeight` and `previousPerformance` (`src/lib/logging/queries.ts`) read the most recent performance of the exercise, so alternating workouts anchor each other.
- The app cannot yet keep a workout's identity across blocks. `cloneMesocycle` creates new `Session` rows with no link to their source.
- The app cannot yet stop a returning prescription from inheriting an old streak, because the engine's windows read the last N qualifying performances (`evaluateBase`, `packages/shared/src/progression/engine.ts`).
- The app offers a sticky machine baseline before real history (`workingWeight` reads `GymExerciseBaseline` first), so progress below 15% is never offered, and a machine Progress call repeats "+5" from the stale baseline.
- The scheduled-deload 90% number is exercise-wide (`scheduledDeloadSuggestion`), so Wednesday's deload week can be 90% of Saturday.

## 3. Scope and non-scope

**In scope**

- `Session.lineageId` (schema, migration, clone inheritance, fresh on create and duplicate, immutability, per-mesocycle uniqueness).
- A shared pure module for recurring identity, compatibility, and segments.
- Prefill readers: the set-1 working weight, the "Last time" line, and a new reference performance, all on the card (`getWorkout`).
- Progression readers: the occurrence call (card), the finish summary, Today's planned list, the scheduled-deload number, and the exercise page's "Next time" and per-session calls.
- Removing `GymExerciseBaseline` from every read path; its write path is unchanged.
- Additive contract changes in `@overload/shared/contracts` and the history types.
- Web UI per `design.md` and `preview.tsx`: the card's lines, the exercise page's per-workout "Next time", and session rows naming their workout.
- A release-note entry; `method-note.md` updates.

**Out of scope** (each a separate pitch)

- Planned Workout Guidance: target RIR, rest, notes, their copies onto `LoggedExercise`, plan-import mapping. This spec's compatibility rule accepts target RIR inputs and treats them as unrecorded until that pitch supplies them.
- Deload Customization: percentages, a Free deload number, a Use weight action.
- Exercise History Contexts: chart series or a workout selector. The trend, records, and goals stay exactly as they are.
- Jump to Exercise.
- Retiring or changing baseline writes; dropping the table.
- Any native screen (the card contract is ready for slice 21e).

## 4. Core concepts

| Concept | Description |
| --- | --- |
| `Session.lineageId` | Opaque, immutable UUID naming a recurring workout across blocks. Inherited by `cloneMesocycle`, fresh for every other session create. Unique per mesocycle. Not a foreign key. Persisted. |
| Recurring exercise | `(lineageId of the LoggedSession's Session, performed exerciseId)`, plus `gymId` when `isGymVariable(exercise)`. Derived. A `LoggedSession` with no session has no recurring identity. |
| Prescription | The copied plan values a performance was evaluated against: `targetRepMin`, `targetRepMax` (on `LoggedExercise`), and `targetRirMin`/`targetRirMax` once Planned Workout Guidance adds them (null until then). The plan's `SessionExercise` values for an occurrence not yet started. |
| Compatible | Same rep range, and target RIR compatible under the effective-target rule (§6). Set count, session name, weekday, order, notes do not matter. |
| Segment | The contiguous run of the recurring exercise's history, newest to oldest, up to the first incompatible performance. Derived on read, never stored. Includes scheduled-deload-week and short performances (each consumer filters them as it already does). |
| Trusted prefill | The top planned working set of the most recent segment performance before the occurrence, in the same scheduled-deload status, with a loaded planned working set. |
| Reference performance | When there is no trusted prefill: the most recent earlier performance of the performed exercise (gym-scoped for gym-variable) that is outside the trusted set. Display only. |
| `GymExerciseBaseline` | Still written exactly as before; no longer read for any prefill, suggestion, or call. |

## 5. States and lifecycle

No new state machine. `lineageId` has one transition: assigned at insert. It never changes (database trigger). Plan writes that create sessions:

| Writer | lineageId |
| --- | --- |
| `createMesocycle` (presets), `addSession`, import confirm (via `addSession`) | fresh (Prisma `@default(uuid())`) |
| `duplicateSession` | fresh (pitch decision 8) |
| `cloneMesocycle` | the source session's `lineageId` |

## 6. Identity, compatibility, and segment rules

Pure module `packages/shared/src/progression/recurring.ts` (no Prisma, no React, no environment):

```ts
export type Prescription = {
  repMin: number;
  repMax: number;
  /** Null until Planned Workout Guidance records a target. */
  targetRirMin: number | null;
  targetRirMax: number | null;
};

export type RecurringKey = {
  lineageId: string | null;
  exerciseId: string;
  /** Set only for gym-variable equipment; null means "any gym". */
  gymId: string | null;
};

export type SegmentCandidate = {
  id: string; // loggedExerciseId
  dateIso: string;
  /** Tie-break for same-date occurrences: createdAt ISO, then id. */
  orderKey: string;
  key: RecurringKey;
  prescription: Prescription;
};

export function sameRecurringExercise(a: RecurringKey, b: RecurringKey, gymVariable: boolean): boolean;
export function currentSegment<T extends SegmentCandidate>(
  candidates: readonly T[],
  anchor: { key: RecurringKey; prescription: Prescription; gymVariable: boolean },
): T[]; // chronological (oldest first), the contiguous compatible run ending at the newest
```

Rules (Resolved Decisions RD-4 to RD-7):

1. **Identity.** A candidate belongs to the anchor's recurring exercise iff `lineageId` is non-null on both and equal, `exerciseId` is equal, and, for gym-variable equipment, `gymId` is equal. A null lineage (no session) never matches.
2. **Walk.** Sort the matching candidates newest first (date, then `orderKey`, then id). Start with `effective = anchor.prescription` target RIR (may be null).
3. **Compatibility of each candidate in order:** rep range equal (`repMin` and `repMax`), else stop. Target RIR: if the candidate's target is null, compatible. If `effective` is null, compatible and `effective := candidate's target`. Otherwise compatible iff equal (both min and max), else stop.
4. **Result:** the collected run, returned oldest first.

Consequences:

| History → anchor | Result |
| --- | --- |
| Missing target → recorded | continues (no reset when Guidance ships) |
| Recorded A → recorded B | breaks |
| Recorded A → missing | continues; A becomes the effective target |
| A → missing → B | breaks at A; missing never bridges two recorded targets |
| 6–8 → 8–10 → 6–8 | the second 6–8 run starts empty; the first is never stitched |
| set count 3 → 2 | continues |
| rename, weekday move, order change, clone | continues |
| swap during logging | the swapped-in exercise has its own key; the planned exercise's segment is not broken by an absent week |
| duplicate session | new lineage → empty |

## 7. Readers

### 7.1 One loader

`src/lib/logging/recurring-history.ts` (server-only) loads, through `account.db`, every `LoggedExercise` of a performed exercise with: id, `createdAt`, `gymId`, `plannedSets`, `targetRepMin`/`targetRepMax`, its sets, and its `loggedSession { status, scheduledFor, createdAt, session { name, lineageId }, mesocycle { startDate, deloadEveryWeeks } }`. It returns rows with the recurring key, prescription, `scheduledDeload` (via `isScheduledDeloadWeek`), session name, and whether it is finished. `gatherRows` is extended with the same fields (`lineageId`, `sessionName`, `createdAtIso`) so progression rows can be segmented with the same function.

### 7.2 Card prefill and lines (`getWorkout`) — Free

For each card (the current `LoggedExercise`, its workout date, its `createdAt`, its deload status):

1. `before` = candidates dated before the occurrence, or same date and created earlier (the existing OVE-61 bound), excluding the current occurrence.
2. `segment = currentSegment(before, anchor)` where the anchor is the current occurrence's key and copied prescription.
3. `trusted = segment` filtered to the occurrence's scheduled-deload status.
4. `suggestedWeightLbs` = the top planned working set (`1 ≤ setNumber ≤ plannedSets`, non-null weight) of the most recent `trusted` row that has one; else null. Bodyweight (`!requiresExternalWeight`) → null as today.
5. `previousPerformance` = the most recent `trusted` row with at least one set, with `sessionName` and `repRange`; else null.
6. `referencePerformance` = when `previousPerformance` is null, the most recent row of `before` (gym-scoped for gym-variable; no gym → none, as today) with at least one set that is not in `trusted`; else null.
7. `weightContext` = `"trusted"` if `suggestedWeightLbs` is non-null, else `"reference_only"` if `referencePerformance` is non-null, else `"none"`.
8. `workingWeightFromBaseline` = always `false` (field kept for compatibility).

The baseline is not read.

### 7.3 Progression readers — Pro (`progression_insights`), gates unchanged

| Reader | Anchor | Rows passed to the engine |
| --- | --- | --- |
| `computeOccurrenceProgression(le)` (card; finish summary reuses it) | the occurrence's key + copied prescription | `currentSegment` of all the exercise's rows (as today the engine reads all history, not only earlier-dated rows) |
| `computePlannedProgression` (Today) | pending: the `SessionExercise` (session, exercise) values; in progress: that workout's `LoggedExercise` for the exercise | segment of all rows |
| `describeScope` per exercise-page entry | see §7.5 | segment of the scope's rows |
| `callsBySession` | each row anchored at itself | segment of rows up to and including it |

The engine (`evaluateReactiveDecision`) is called unchanged. Scheduled-deload suppression stays where it is: the occurrence and planned readers suppress in a scheduled-deload week; `qualifyingSequence` drops deload-week performances.

**The number** (`describeDecision`, `scheduledDeloadSuggestion`): the base weight is `segmentWorkingWeight(segmentRows)` = the top planned working set of the most recent **finished, non-scheduled-deload** segment row with a loaded planned working set. `trusted = base !== null && base === decision.latestTopLoadLbs` for every equipment type (the previous gym-variable short-circuit is removed, RD-10). Progress prints `base + PROGRESS_INCREMENT_LBS`; a scheduled-deload week prints `scheduledDeloadLoad(base)` (90%, rounded down to 5 lb, unchanged). No base → no number (R31/R36).

`currentWorkingWeightLbs` and the `baselineWrittenBefore` option are removed (no remaining callers); `progression-gate-guards` lists are updated to the new function names.

### 7.4 Today

`getTodayView` passes `{ exerciseId, sessionId, loggedSessionId }` per planned exercise. `getPlannedProgression(account, input, opts)` resolves the anchor: a started workout's `LoggedExercise` (performed exercise in that logged session) for its copied range, else the `SessionExercise (sessionId, exerciseId)`; the lineage from the session. Gym-variable lifts still defer until a gym is chosen (no call). The contract (`plannedProgression: { exerciseId, progression }[]`) is unchanged; `exerciseId` stays unique within a session.

### 7.5 Exercise page

`getExerciseHistory` keeps records, trend, goals, and the session list exercise-wide (gym-scoped for machines). It adds:

- `nextByWorkout: HistoryWorkoutNextDto[]`: one entry per recurring exercise of this exercise planned in the active mesocycle (ordered by session position; anchor = that `SessionExercise`'s range, lineage = that session's), else one entry for the recurring exercise of the scope's most recent performance (anchor = its copy). Each entry runs `describeScope` on its segment within the selected scope. Machines with no gym keep `{ kind: "no_gym" }`.
- `next` (existing field): the single entry's value when there is exactly one, otherwise null. Old readers never see an exercise-wide call that contradicts a per-workout one.
- `SessionRowDto.sessionName: string | null`, and each row's `call` from its own segment.

`gateHistory` applies the existing Free withholding to every `nextByWorkout` entry.

## 8. Data model

```prisma
model Session {
  // …existing fields…
  /// Durable identity of a recurring workout (Prescription-Aware Intelligence).
  /// Fresh on create and duplicate; copied from the source by cloneMesocycle.
  /// Immutable (trigger sessions_lineage_id_immutable). Not a foreign key.
  lineageId   String   @default(uuid()) @map("lineage_id") @db.Uuid

  @@unique([mesocycleId, lineageId])
  @@index([lineageId])
}
```

Migration `9q_session_lineage` (hand-written, additive, non-destructive):

```sql
ALTER TABLE "sessions" ADD COLUMN "lineage_id" uuid;
UPDATE "sessions" SET "lineage_id" = "id" WHERE "lineage_id" IS NULL;
ALTER TABLE "sessions" ALTER COLUMN "lineage_id" SET NOT NULL;
CREATE UNIQUE INDEX "sessions_mesocycle_id_lineage_id_key" ON "sessions"("mesocycle_id", "lineage_id");
CREATE INDEX "sessions_lineage_id_idx" ON "sessions"("lineage_id");

CREATE FUNCTION "overload_session_lineage_immutable"() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.lineage_id IS DISTINCT FROM OLD.lineage_id THEN
    RAISE EXCEPTION 'a session''s lineage never changes' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "overload_session_lineage_immutable"() FROM PUBLIC;
-- (plus the anon/authenticated REVOKE block used by 9_account_ownership_2_enforce)
CREATE TRIGGER "sessions_lineage_id_immutable" BEFORE UPDATE OF "lineage_id" ON "sessions"
  FOR EACH ROW EXECUTE FUNCTION "overload_session_lineage_immutable"();
```

No new table, so no new RLS statement; `sessions` keeps RLS enabled with no policies. The backfill writes each session's own id onto itself: no cross-row or cross-account relationship is created, and no logged table is touched. `@default(uuid())` is client-side, so every Prisma insert supplies a value; there is no DB default.

| Field / concept | Stored? | Computed from |
| --- | --- | --- |
| `Session.lineageId` | yes | assigned at insert |
| recurring key, prescription, segment | no | logged rows + copies + lineage |
| suggested/prefilled weight, Last time, reference | no | segment rows |
| progression tag, recommendation, numbers | no | engine over segment rows |
| `GymExerciseBaseline.weightLbs` | yes (unchanged writes) | not read by any surface but export |

## 9. Authorization and access control

- Every read goes through `account.db` (scoped). Lineage is compared in memory between rows the acting account already owns, so a lineage value can never match another account's rows. Lineage is never accepted from client input: no action or route parses it.
- `cloneMesocycle` reads its source through the scoped transaction; another account's mesocycle is not found (unchanged).
- Capabilities: prefill, Last time, reference = Free. Calls, recommendations, numbers = `progression_insights`; gates `gateOccurrence`, `gatePlanned`, `gateSessionSummary`, `gateHistory` apply unchanged, including to `nextByWorkout`.

## 10. Server actions and API surface

No new action or route. Changed read functions:

```ts
getPlannedProgression(account, input: { exerciseId: string; sessionId: string; loggedSessionId: string | null }, opts)
// was getPlannedProgression(account, exerciseId, opts)
```

**Mobile API (`/api/mobile/v1`).** Verified: the only endpoints are `app-config`, `me`, `me/appearance`, `today`, `gyms`, `accounts`, `password-reset`. `/today` serves `plannedProgression` with an unchanged shape and corrected values. No mobile endpoint serves the card or the exercise page yet, so the card and history contract additions have no installed reader; they are additive for slice 21e/21i.

## 11. Validation rules

No new input. The migration's invariants (NOT NULL, unique per mesocycle, immutable) are enforced by the database.

## 12. UI data contracts (additive)

```ts
// packages/shared/src/contracts/logging.ts
export type PreviousPerformanceDto = {
  dateIso: string;
  gymScoped: boolean;
  sets: { setNumber: number; weightLbs: number | null; reps: number }[];
  /** The workout it was logged in ("Push"); null when it had none. */
  sessionName: string | null;
  repRange: { min: number; max: number };
};
export type ReferencePerformanceDto = PreviousPerformanceDto;
export type WeightContext = "trusted" | "reference_only" | "none";
// ExerciseCardDto gains:
//   referencePerformance: ReferencePerformanceDto | null;
//   weightContext: WeightContext;
// and keeps workingWeightFromBaseline (always false).

// packages/shared/src/progression/history-types.ts
export type HistoryWorkoutNextDto = {
  sessionName: string;
  repRange: { min: number; max: number };
  next: HistoryNextDto;
};
// ExerciseHistoryDto gains nextByWorkout: HistoryWorkoutNextDto[]
// SessionRowDto gains sessionName: string | null
```

Formatting lives in `packages/shared/src/logging/set-entry.ts` so web and mobile render the same words: `formatPreviousPerformance` gains the workout ("Last time in Push · Nov 8 · 255 × 5, 5, 4"), and `formatNothingYet` / `formatReferencePerformance` produce the design's other two lines.

## 13. Testing strategy

Unit (pure, `tests/unit/recurring-segment.test.ts`):

```text
GIVEN Sat 3–5 and Wed 6–8 rows WHEN Wed anchors THEN segment holds only Wed rows
GIVEN 6–8, 6–8, 8–10, 8–10, 6–8(anchor) THEN segment empty (no B1 stitch)
GIVEN null,null,RIR1–2 history and anchor RIR1–2 THEN all three in segment
GIVEN RIR1–2 history and anchor RIR3 THEN empty
GIVEN RIR3, null, RIR1–2(newest) and anchor null THEN segment = [RIR1–2] only
GIVEN set counts 3,3,2 THEN continuous
GIVEN machine rows at two gyms THEN only the anchor gym's rows
GIVEN null lineage rows THEN never in a segment
```

Integration (embedded Postgres, scenarios A–L):

```text
A first Sat: suggestedWeightLbs null, previous null, reference null, weightContext none; call insufficient
B first Wed after Sat 255: suggested null, reference = Push 3–5 255×…, weightContext reference_only; no call from Sat
C second Sat → 255; second Wed → 230; calls independent (Sat progress, Wed hold)
D Tue/Fri hip abduction same gym/range: each offers its own weight; a Fri correction of the baseline changes neither offer nor call
E baseline 50, last comparable 55 → offer 55; Progress prints 60
F 55 then 45 → offer 45; history still shows 55
G 6–8, 8–10, 6–8 across clones → empty + reference; insufficient call; no stitched streak
H (pure) RIR rules above
I deload week: Sat's 90% from Sat's last normal week, Wed's from Wed's; never from a deload-week row; reactive call suppressed
J edit an older set → offers/calls recompute; lineage unchanged; baseline untouched
K rename + move + clone → same lineage, prefill and segment continue; old rows keep their block's session name
L account B with a session forced to A's lineage value (test-only raw insert) sees nothing of A; machine weights never cross gyms
```

Plus: clone copies lineage and duplicate/addSession/createMesocycle/import mint fresh ones; updating `lineage_id` raises; `(mesocycle_id, lineage_id)` unique; the migration touches no logged table; existing baseline suites (isolation, atomicity, first-log, 15% boundary, no replay) pass unchanged; no read path selects `gymExerciseBaseline` except export (static guard); Free accounts get no call/number from any reader including `nextByWorkout`; card/Today/summary/exercise page agree for one occurrence; the isolation suite covers the new fields.

## 14. Acceptance criteria

- [ ] Wednesday's 6–8 bench never prefills Saturday's 255 lb; it shows Push's performance only as `For reference`.
- [ ] Each recurring exercise has its own progress/hold/deload call; Saturday never moves Wednesday's call or the reverse.
- [ ] Returning to an earlier rep range starts a new segment.
- [ ] Target RIR (when present) follows the effective-target rule; missing history is preserved.
- [ ] A machine's offer is its latest comparable logged weight at that gym; the baseline is never read.
- [ ] Baseline writes, gym isolation, atomicity, first-log establishment, 15% threshold, and no-replay are unchanged.
- [ ] Scheduled-deload numbers use the same recurring exercise's last normal week; suppression unchanged.
- [ ] Cloning keeps lineage; duplicating starts fresh; renaming and moving keep it.
- [ ] The card, Today, finish summary, and exercise page give the same call for one occurrence.
- [ ] Records, trend, goals, and e1RM are unchanged and exercise-wide.
- [ ] Free/Pro boundaries unchanged; no Pro value reaches Free through any reader or the `/today` endpoint.
- [ ] Contract changes are additive; `next` is null when an exercise has two or more recurring workouts.

## 15. Explicit non-goals

- ❌ New strength formulas, RIR thresholds, e1RM, goal, or PR changes. **Permanent for this feature.**
- ❌ Planned starting weights. **Permanent.**
- ❌ Intensity classifications. **Permanent.**
- ❌ Target RIR, rest, notes; deload percentages; chart series; jump to exercise. **Deferred** to their pitches.
- ❌ Retiring baseline writes or dropping the table. **Deferred** (owner decision).
- ❌ Rest timer, program generation, coaching. **Permanent.**

## Resolved Decisions

| # | Decision | Rationale | Authority |
| --- | --- | --- | --- |
| RD-1 | The pitch lives in `docs/pitches/mvp-5c-native-and-sharing/prescription-aware-intelligence/` with no number; the owner adds it to the roadmap and PRD and assigns its number. | No free number exists (39+ is Nutrition) and a run does not edit `docs/planning/`. Adding a feature contradicts nothing; it is an amendment. | CLAUDE.md (docs layout, run may not edit planning) |
| RD-2 | Identity is `Session.lineageId` + performed exerciseId (+ gym for gym-variable). | Unique within a block because a session holds an exercise once (Pitch 3 D20); a `SessionExercise` identity is only needed if D20 is relaxed. | Pitch decision 1; schema |
| RD-3 | `lineageId` uses Prisma `@default(uuid())` (no DB default), backfilled to `id`, NOT NULL, unique `(mesocycleId, lineageId)`, indexed, immutable by trigger, no FK. | Fresh values need no app code; the backfill is a self-reference; no FK means deleting a draft root session blocks nothing. | Pitch decision 1; Pitch 8 trigger precedent |
| RD-4 | Clone copies lineage; duplicate, add, presets, and import confirm mint fresh. | Pitch decision 1 and 8. | Pitch |
| RD-5 | Compatibility = equal rep range + effective-target RIR rule (§6). Set count, name, weekday, order, notes ignored. | Pitch decisions 6 and 7; deterministic, no thresholds. | Pitch |
| RD-6 | Segments are contiguous runs walked from the newest performance; deload-week and short performances stay in the run and are filtered by each consumer as today. | Pitch decision 5; the engine already excludes deload and short rows correctly. | Pitch; engine.ts |
| RD-7 | `LoggedExercise` has no target RIR yet, so every target is null and the RIR term is inert until Planned Workout Guidance copies targets onto `LoggedExercise`. | Pitch decision 7 and the Guidance boundary. | Pitch |
| RD-8 | The card's prefill and Last time come from the segment before the occurrence, in the occurrence's deload status; the reference is the most recent other earlier performance (gym-scoped for machines). | Pitch decisions 3, 4, 6; keeps the OVE-61 before-bound. | Pitch; Faster Logging UX |
| RD-9 | The baseline is removed from every read; `currentWorkingWeightLbs` and `baselineWrittenBefore` are removed; `workingWeightFromBaseline` is kept in the contract as always false; the "working weight" caption no longer appears. Supersedes Guided Workout Logging R49/R50, Progressive Overload Engine R29/R30/R34, Faster Logging UX R9/R27, Smarter & Explainable Progression R34. | Pitch decisions 10 and 12; those are pitch-spec decisions (not planning docs) and are superseded here as Workout Logging Refinements superseded the swap rule. PRD §Gym-Specific Weight Tracking and architecture.md describe baseline writes and per-gym tracking, which remain true. | Pitch; authority order |
| RD-10 | The progression number is the top set of the latest finished, non-deload segment row, printed only when it equals the engine's latest counted top load, for all equipment. | Pitch decisions 9 and 15; one rule for free weights and machines. | Pitch; Smarter & Explainable R33 |
| RD-11 | Today anchors on a started workout's copied values, else the plan's `SessionExercise`. | Pitch decision 13; mirrors the dashboard's existing logged/planned preview split. | Pitch; queries.ts |
| RD-12 | Exercise page: `nextByWorkout` per recurring exercise planned in the active block (else the most recent one); `next` = the single entry or null; session rows name their workout and their calls use their own segment. | Pitch decisions 9 and 17; no chart redesign. | Pitch |
| RD-13 | "Last time in {session}" uses the logged workout's own `Session.name`; each block's rows keep their own names. | Factual labels (pitch §3); no name snapshot needed because Session rows are per block. | Pitch; schema |
| RD-14 | The card contract gains `referencePerformance` and `weightContext`; `PreviousPerformanceDto` gains `sessionName` and `repRange`; history types gain `nextByWorkout` and `SessionRowDto.sessionName`. No mobile endpoint serves these yet. | Pitch decision 17; verified route list. | Pitch; codebase |
| RD-15 | Guidance: one non-significant release note; no tour step. | The card's anatomy is unchanged. | overload-onboarding |
| RD-16 | The migration is applied to `overload-dev` with the dev wrapper before the feature merges into `staging`; if dev credentials are unavailable to the run, the feature PR stays open for the owner. | The staging deployment reads `lineage_id` once merged. | CLAUDE.md (migrations to overload-dev) |

## Open Questions

None blocking. Owner amendments are listed in the feature PR's owner notes (roadmap/PRD entry and number; optional CLAUDE.md wording on the baseline's role).

## 16. Future considerations

- Planned Workout Guidance copies target RIR onto `LoggedExercise`; `toPrescription` then reads it and the RIR term activates with no other change.
- Exercise History Contexts can draw series per recurring exercise from the same key and break lines at segment boundaries.
- Deload Customization reads its base from `segmentWorkingWeight`.
- Retiring baseline writes needs the PRD and spec amendments listed in the owner notes.
