---
version: 1.3.0
status: approved
author: Claude Code (autonomous pipeline run)
last_updated: 2026-10-22
pitch_reference: pitches/16-exercise-history-pr-intelligence.md (Linear doc caa8ea68-1d70-4f2d-b29b-443eda0005c7)
design_reference: docs/design/16-exercise-history-pr-intelligence-design-doc.md (v1.0)
preview_reference: docs/previews/16-exercise-history-pr-intelligence-preview.html (binding visual contract)
prd_reference: approved multi-user PRD (Downloads/prd (1).md) — no dedicated section; criteria traced to the Pitch Roadmap
architecture_reference: approved multi-user Architecture Doc (Downloads/architecture (1).md)
upstream_specs: 04-guided-workout-logging, 05-progressive-overload-engine, 06-goals, 14-rir-logging-autoregulation, 15-smarter-explainable-progression
linear_issue: (milestone "Exercise History & PR Intelligence"; issues recorded in docs/runs/16-exercise-history-pr-intelligence-progress.md)
---

# Exercise History & PR Intelligence — Technical Specification

## 1. Summary

Exercise History & PR Intelligence turns the existing exercise page (`/exercises/[id]`) into the exercise's history: the current call and why, records (best set, best e1RM, heaviest weight, rep records), the trend (e1RM, actual load, or reps), every session with the call it led to, and the goals set on the lift. Everything is a **read**. One server read (`getExerciseHistory`) gathers the exercise's logged performances once through the account-scoped layer, resolves the scope (global, or one gym for machine/cable), and feeds the same rows to (a) the existing progression description that every other surface uses, (b) a new pure module that derives records, per-session calls, and trend points, and (c) nothing else. Goals come from the existing Goals read layer, filtered to the exercise.

The core abstraction is **one history, many projections, all computed on read**. There is no new table, column, cache, or stored analytic. The per-session "recent progression decision" is the existing engine (`evaluateReactiveDecision`) run on the scope's history up to and including that session; the newest counted session's call is therefore identical to the current call by construction. A corrected set changes every record, point, and call on the next read with no recompute path.

"Working" means: for any exercise the acting account can open, the page shows only that account's history; a machine or cable exercise is shown one gym at a time and no figure on the page ever combines two gyms; best set and best e1RM agree with the Goals feature's "best"; the newest call equals the call the card and the day-complete summary show for the same history; archived exercises and gyms keep their whole history; and opening, switching, or expanding anything writes nothing.

## 2. Problem

- The app cannot yet show what a lifter actually did on one exercise across sessions in one place; the logged sets live only inside each day's workout detail.
- The app cannot yet name a best set, a heaviest weight, or rep records, so "have I lifted this before?" requires scrolling History.
- The app cannot yet show how its own calls evolved (when Bench was ready to go up, when it held, when it deloaded), so a hold or deload today can't be checked against the record that produced it.
- The app shows goals only on the Goals screens, so "how close is my bench goal, and what did I already reach?" is a separate trip.
- For machines and cables, the only per-gym view is the e1RM chart; the gym rule has no records or session view to protect yet.

Upstream: Pitch Roadmap → Exercise History & PR Intelligence (DoD 1–3). Depends on the Progressive Overload Engine and Goals; uses RIR Logging & Autoregulation and Smarter & Explainable Progression.

## 3. Scope and non-scope

### In scope

1. `/exercises/[id]` rebuilt as the exercise history (design doc §7 Screens 1–6; preview §01–§08).
2. A server read `getExerciseHistory` and a pure module `src/lib/progression/history.ts` (records, rep-record frontier, per-session calls, trend points).
3. A server read `getExerciseGoals` in the Goals read layer (active + archived goals for one exercise, unchanged Goals semantics).
4. Entry-point changes: logging-card and day-complete links renamed "history" and given `?gym=` for machines; goal page link renamed; exercise names on the workout detail link to their history (design doc §7 Screen 7).
5. The loading skeleton for the page.
6. Tests: unit (pure module), integration (read layer incl. isolation, gym isolation, corrections, archive, read-only), e2e (page), static guards.
7. User guidance ticket (`overload-onboarding`): tour-step decision and a significant release note.

### Out of scope

- Any change to the engine, thresholds, RIR qualifiers, recommendation wording, e1RM formula, goal rules, gym baseline logic, or the logged-set write/edit path.
- Any schema change or migration. Any stored record, PR flag, call history, or cache.
- An "all gyms" view for a machine/cable, or any comparison across gyms.
- Date-range pickers, filters, exports, custom charts, volume/tonnage/intensity metrics.
- Celebratory UI: badges on records, "New PR" notices, animations, colour for records, streaks.
- Goal creation/editing changes (the page only links to the existing goal pages and form).
- Correcting sets on this page (corrections stay on `/history/[loggedSessionId]`).

## 4. Core concepts

| Concept | Description |
| ------- | ----------- |
| **Performance row** | One `LoggedExercise` of the performed exercise (`exerciseId`), with its preserved plan context (`plannedSets`, `targetRepMin/Max`), session status, `scheduledFor`, effective mesocycle week, scheduled-deload flag, gym, and every logged set. Gathered once per read by the existing `gatherRows` (extended, §11.1). Rows with zero sets are not sessions and never appear on this page. |
| **Scope** | The set of rows the page shows at once. Gym-consistent exercise (`!isGymVariable`): one scope, `global`, all rows. Gym-variable exercise: one scope per `gymId` present on a row with ≥ 1 set, plus `none` when such a row has `gymId = null`. Exactly one scope is selected per render. |
| **Record population** | The **working sets** (`1 ≤ setNumber ≤ plannedSets`) of rows in scope whose session is `complete` and whose week is **not** a scheduled-deload week. Identical to the population of `getQualifyingSessionE1rms` (Goals' "demonstrated strength", R38 of the engine spec). Extra sets, unfinished sessions, and deload weeks never set a record. |
| **Best set** | `bestWorkingSet` over the loaded record population in chronological order (date, `loggedExerciseId`, `setNumber`): the set with the highest `estimateOneRepMax`; ties keep the earliest. Same interpretation as `sessionE1rm` and Goals' best. Loaded exercises only. |
| **Best e1RM** | `estimateOneRepMax(bestSet)` — always from the Best set; displayed rounded, labelled "estimate". |
| **Heaviest weight** | The set with the greatest `weightLbs`; tie → most reps; tie → earliest. Loaded only. |
| **Rep records** | The rep-max frontier: for each distinct load, descending, the most reps at that load; listed only when it exceeds the best reps at every heavier load. Each entry's set is the earliest achieving that (load, reps). Capped at `REP_RECORDS_MAX = 6` (heaviest first). The first entry is always the Heaviest weight. |
| **Most reps** | Bodyweight exercises only: the set with the most reps; tie earliest. The only record for reps-only lifts. |
| **Call after a session** | For a counted row (`complete` and not a deload week): `evaluateReactiveDecision(scopeRowsUpToAndIncluding(row), { e1rmApplicable: externalLoad }).state`. Other rows carry a status instead (§6). Computed on every read; never stored. |
| **Current call** | The existing `ExerciseProgressionDto` fields (`tag`, `recommendation`, `insufficientNote`) for the selected scope — the same function the page used before this pitch, now fed the page's rows. |
| **Trend point** | One per **finished** row in scope with ≥ 1 working set (deload-week rows included and marked, as the existing e1RM chart does). e1RM view: the existing `toPoints` value. Weight view: the maximum `weightLbs` among loaded working sets. Reps view (bodyweight): the maximum reps among working sets. |

Invariants:

1. Every value on the page is a pure function of the account's logged rows, plan snapshots, mesocycle weeks, the exercise's equipment, and goals — read in one request, stored nowhere.
2. For a gym-variable exercise, every record, point, call, and session row on the page comes from exactly one scope. There is no code path that passes rows from two scopes to the history module.
3. The newest counted row's call equals the current call's `state` for the same scope and rows.
4. Best set / Best e1RM equal the Goals best (`computeGoalProgress(...).best`) for the same scope (a gym-consistent goal: the global scope; a machine goal: its gym's scope).
5. No function reached from the page writes. (No server action is added; the page's only existing actions are favourite and archive of a custom exercise, unchanged.)

## 5. States and lifecycle

No entity gains a state. The page has display states:

| Condition (selected scope) | Next time | Records | Trend | Sessions |
| -------------------------- | --------- | ------- | ----- | -------- |
| exercise has no row with sets in any scope | — | — | — | — (one empty block) |
| scope `none` | "Calls for machines are made per gym." | shown | shown | rows, no call |
| fewer than 2 qualifying rows | `insufficientNote` (existing copy) | shown if the record population is non-empty | text if < 2 points | rows with their statuses |
| otherwise | existing tag + recommendation | shown | chart (≥ 2 points) | rows with calls |

## 6. Per-session call column

`SessionCallDto.kind`, decided in this order for each row in scope:

| Order | Condition | `kind` | Rendering |
| ----- | --------- | ------ | --------- |
| 1 | scope is `none` | `none` | nothing |
| 2 | session not `complete` | `in_progress` | muted "In progress" |
| 3 | week is a scheduled-deload week | `deload_week` | muted "Deload week" (no reactive evaluation — suppression) |
| 4 | fewer working sets than `plannedSets` | `not_counted` | muted "Not counted"; accessible detail "{n} of {planned} planned sets" |
| 5 | engine state `insufficient` | `insufficient` | muted "Not enough history" |
| 6 | engine state `progress` / `deload` / `stalled` | same | existing `ProgressTag` |
| 7 | engine state `hold` | `hold` | muted "Hold" (plain text, never a badge) |

Ordering of "up to and including": the engine's `byDate` (`dateIso`, then `loggedExerciseId`). The prefix passed to the engine contains every scope row with `byDate(x, row) <= 0`; the engine's own `qualifyingSequence` drops incomplete and deload rows, so rows 2–4 never influence later calls (unchanged engine semantics).

## 7. UI integration

Design doc §7 and the preview are binding for hierarchy, copy, and states. This section fixes the technical shape.

### 7.1 Route `/exercises/[id]` (server component)

| Step | Behaviour |
| ---- | --------- |
| 1 | `requireAccount()`; `getExercise(account, id)` (resolves archived; another account's custom id → null → `notFound()`). |
| 2 | Parse `searchParams`: `gym` (uuid or the literal `none`; anything else ignored), `sessions` (`all` or ignored), `from` (unchanged back link). |
| 3 | `getExerciseHistory(account, exercise.id, { scope: gym, allSessions })` and `getExerciseGoals(account, exercise.id)` in parallel. |
| 4 | Render, at every width: header → scope line (machines/cables with history) → Next time → Records → Trend → Sessions → Goals → About, in one column (R30). |
| 5 | `metadata.title` stays `"Exercise · Overload"`. `loading.tsx` follows the new order (design doc §7). |

### 7.2 Components

| Component | Kind | Data | Notes |
| --------- | ---- | ---- | ----- |
| `ExerciseHistoryHeader` | server | `ExerciseDto` | thumb `sm`, name, meta `{primary} · {equipment}`, badges, `FavoriteButton` (not when archived) |
| `GymSelector` (existing) | client | `scopes`, `selected` | label "History at"; `aria-label="Gym for this history"`; options = scope labels (`"{name} (archived)"`, `"No gym recorded"`); writes `?gym=` via `router.replace`, preserving other params; with one scope renders plain text instead (server) |
| `ProgressTag`, `Recommendation` (existing) | shared | current call | unchanged |
| `ExerciseRecords` | server | `ExerciseRecordsDto` | one bordered card; rep records as a `<table>` with `<caption>` and `th scope="col"` |
| `ExerciseTrend` | client island | `TrendDto`s | shadcn `Tabs` (`e1RM`, `Weight`) for loaded exercises, none for bodyweight; Recharts `LineChart` per view reusing `E1rmChart`'s frame, colours, deload dot, and visually hidden table; < 2 points → the text line instead of a chart. The tab is local UI state (not in the URL). |
| `SessionHistoryList` | server | `SessionRowDto[]` | `<ul>`; the date is a `Link` to `/history/{loggedSessionId}`; set line built by `formatSetLine` (§13) |
| `ExerciseGoals` | server | `ExerciseGoalsDto` | active row reuses `GoalProgressBar`; rows link to `/goals/{goalId}` |
| `ExerciseAbout` | server | `ExerciseDto` | `ExerciseThumb size="lg"`, the existing `dl`, `ArchiveExerciseButton` for an active custom exercise |

No component on the page calls a server action other than the existing `FavoriteButton` and `ArchiveExerciseButton`.

### 7.3 Entry points

| Surface | Change |
| ------- | ------ |
| `ExerciseCard` (`src/components/logging/exercise-card.tsx`) | `progression.hasTrend` → `progression.historyHref: string \| null`; link text `View history ›`. `historyHref` is set when the occurrence's scope has ≥ 1 finished row (any loading mode); `/exercises/{performedExerciseId}` plus `?gym={gymId}` for a gym-variable exercise with a gym. |
| Day complete (`src/app/(app)/page.tsx`) | same field on `SessionProgressionSummaryDto.exercises[]`; link text `history ›`. |
| Goal page (`/goals/[goalId]`) | link text `e1RM trend ›` → `Exercise history ›` (href unchanged, already carries `?gym=`). |
| Workout detail (`/history/[loggedSessionId]`) | `LoggedWorkoutDetailDto.exercises[]` gains `historyHref` (`/exercises/{exerciseId}` + `?gym={gymId}` when gym-variable and the row has a gym); the performed name renders as a `Link` (`text-primary`), the "(as planned)/(swapped from …)" note stays plain. |

`PlannedProgressionDto.hasTrend` is left as is (no surface renders it as a link).

### 7.4 Accessibility

Records are text with visible labels; "estimate" is a word. The rep-record table has a caption and column headers. Each chart keeps a visually hidden table of every point (date, value, sets for the Weight view, deload flag). Calls are words; `ProgressTag` unchanged. The scope `Select` and the `Tabs` are stock shadcn controls with accessible names.

## 8. Data model

**No schema change. No migration.** Every value is derived on read.

| Field / concept | Stored? | Computed from |
| --------------- | ------- | ------------- |
| Best set, Best e1RM, Heaviest, Rep records, Most reps | no | record population (§4) |
| Call after a session | no | `evaluateReactiveDecision` on the scope prefix |
| Trend points (e1RM / Weight / Reps) | no | finished working sets |
| Scopes | no | `LoggedExercise.gymId` of rows with sets |
| Goal percent / best | no | existing `computeGoalProgress` |

Relationships read (all existing): `LoggedExercise → LoggedSet`, `LoggedExercise → Gym` (name, `deletedAt`), `LoggedExercise → LoggedSession → Mesocycle` (`startDate`, `deloadEveryWeeks`), `LoggedExercise → plannedExercise` (name, for the swap note), `Goal → Exercise/Gym`.

## 9. Authorization and access control

- The page is behind the existing middleware and `requireAccount()`; the acting `userId` comes from the session only.
- Every read runs on `account.db` (the account-scoped client). New reads start from owned models (`loggedExercise.findMany({ where: { exerciseId } })`, `goal.findMany({ where: { exerciseId } })`); no read traverses from `Exercise` into an owned relation (the scope layer refuses it).
- A library exercise is shared, but its history on the page is the viewer's own rows; another account's custom exercise id resolves to not-found exactly like a missing id. `?gym=` is navigation state: an id that is not one of the acting account's scopes for this exercise is ignored (default scope), never an error and never a probe (the response for "another account's gym id" is byte-identical in content to "a random uuid").
- No new table, so RLS is unchanged (deny-all everywhere; the standing RLS suite stays green).
- No new server action. No `prisma.` import outside the scoped layer (the existing static guard covers new files).

## 10. Storage model

Not applicable (exercise images are read exactly as today).

## 11. Server reads

### 11.1 `src/lib/progression/queries.ts` (changed, read-only)

- `gatherRows` gains, per row: `allSets` (every set incl. extras, with `rir`), `sessionComplete` (existing `finished`), `inProgress`, `gymArchived`, `plannedExerciseId`, `plannedExerciseName`, and `loggedSessionId` (existing). The engine-facing `perf` is unchanged.
- The body of `getExerciseProgression` after gathering is extracted into an internal `describeScope(account, exercise, rows, scope, when)` that both `getExerciseProgression` (unchanged behaviour and output) and `getExerciseHistory` call. Existing callers and their tests must be unaffected.
- `toPoints` and `currentE1rm` are reused for the e1RM view.

### 11.2 `getExerciseHistory` — `src/lib/progression/history-queries.ts` (new, `server-only`)

```ts
export async function getExerciseHistory(
  account: Account,
  exerciseId: string,
  opts: { scope?: string | null; allSessions?: boolean },
): Promise<ExerciseHistoryDto | null>; // null when the exercise is not visible to the account
```

1. Load the exercise (`account.db.exercise.findUnique`, archived included).
2. `rows = gatherRows(account, exerciseId)`; drop rows with zero sets.
3. Scopes: global (`!isGymVariable`), or one per distinct `gymId` (non-null) plus `none` if any row has `gymId = null`; ordered by each scope's latest `dateIso` desc (then name), `none` last.
4. Selected scope: the requested one if it is a uuid in the list or `none` in the list; else the scope of the most recent **finished** row (gym-variable), else the most recent row; `null` when there are no rows.
5. `scopeRows` = rows of the selected scope.
6. `next`: scope `none` → `{ kind: "no_gym" }`; else `describeScope(...)` on `scopeRows` with `when: "next"` → `{ tag, recommendation, insufficientNote }`.
7. `records`, `calls`, `trend` from the pure module (§11.3) on `scopeRows`.
8. `sessions`: `scopeRows` newest first (reverse `byDate`), `RECENT_SESSIONS = 10` unless `allSessions`; `total` = all.
9. Dates formatted with `formatMonthDay(iso, accountToday(account))` ("Oct 9", or "Oct 9, 2025" in another year).

Performs exactly one `gatherRows` plus the reads `describeScope` already does (`currentWorkingWeightLbs`). No writes, no `$transaction`.

### 11.3 `src/lib/progression/history.ts` (new, pure, client-safe types)

```ts
export const RECENT_SESSIONS = 10;
export const REP_RECORDS_MAX = 6;

export type HistorySet = { setNumber: number; weightLbs: number | null; reps: number; rir: number | null };
export type HistoryRow = { perf: Performance; finished: boolean; workingSets: HistorySet[]; extraSets: HistorySet[] };

export function recordPopulation(rows: HistoryRow[]): (HistorySet & { dateIso: string; loggedExerciseId: string })[];
export function computeRecords(rows: HistoryRow[], externalLoad: boolean): ExerciseRecords | null;
export function repRecordFrontier(sets: LoadedRecordSet[], max?: number): LoadedRecordSet[];
export function callsBySession(rows: HistoryRow[], opts: { externalLoad: boolean; noGymScope: boolean }): Map<string, SessionCallKind>;
export function weightPoints(rows: HistoryRow[]): TrendPoint[];
export function repsPoints(rows: HistoryRow[]): TrendPoint[];
```

Uses only `estimateOneRepMax`, `bestWorkingSet`, `loadedSets` (`e1rm.ts`) and `evaluateReactiveDecision`, `byDate` (`engine.ts`). It must not define a second e1RM, a second ordering, or any threshold.

### 11.4 `getExerciseGoals` — `src/lib/goals/queries.ts` (added, read-only)

```ts
export async function getExerciseGoals(account: Account, exerciseId: string): Promise<ExerciseGoalsDto>;
```

`account.db.goal.findMany({ where: { exerciseId } })` with the existing include; active → existing `activeDto` (same percent/best as the Goals page); archived → existing `toHistory`, ordered `archivedAt desc, id`. `newGoalHref`: `/goals/new/{exerciseId}` when the exercise is not archived, requires external weight, and has no active goal (machine/cable: add `?gymId=` for the page's selected gym when that gym is active — the page passes it in). It does **not** call `reconcileGoalCompletions` (a write); a reached-but-unarchived active goal shows its computed percent (100) until a Goals surface reconciles it.

## 12. Validation rules

| Input | Validation | Behaviour |
| ----- | ---------- | --------- |
| `params.id` | resolved by `getExercise` (uuid check inside) | not visible → `notFound()` |
| `?gym` | uuid in this exercise's scopes, or `none` when that scope exists | otherwise ignored → default scope |
| `?sessions` | exactly `all` | otherwise recent 10 |
| `?from` | existing `backHref` (known params only) | unchanged |

## 13. UI data contracts

```ts
export type HistoryScopeDto = { key: string; /* gym uuid | "none" | "global" */ label: string; archived: boolean };

export type SessionCallKind =
  | "progress" | "deload" | "stalled" | "hold" | "insufficient"
  | "deload_week" | "not_counted" | "in_progress" | "none";

export type SessionRowDto = {
  loggedExerciseId: string;
  loggedSessionId: string;
  dateIso: string;
  dateLabel: string;               // "Oct 9"
  gymName: string | null;          // set only for a gym-consistent exercise
  gymArchived: boolean;
  workingSets: { weightLbs: number | null; reps: number; rir: number | null }[];
  extraSets: { weightLbs: number | null; reps: number }[];
  plannedSets: number;
  swappedFromName: string | null;  // planned exercise name when performed ≠ planned
  call: SessionCallKind;
};

export type RecordSetDto = { weightLbs: number; reps: number; dateIso: string; dateLabel: string };

export type ExerciseRecordsDto =
  | {
      kind: "loaded";
      bestSet: RecordSetDto;
      bestE1rm: number;            // Math.round(estimateOneRepMax(bestSet))
      heaviest: RecordSetDto;
      repRecords: RecordSetDto[];  // frontier, heaviest first, ≤ REP_RECORDS_MAX
    }
  | { kind: "bodyweight"; mostReps: { reps: number; dateIso: string; dateLabel: string } };

export type TrendPointDto = {
  dateIso: string;
  dateLabel: string;
  value: number;                   // e1RM (rounded), heaviest load, or most reps
  scheduledDeload: boolean;
  setsLabel: string;               // "185 × 10, 10, 10" / "20, 20 reps" — tooltip + hidden table
};
export type TrendDto = { points: TrendPointDto[]; latest: number | null /* last non-deload point */ };

export type ExerciseHistoryDto = {
  exerciseId: string;
  gymVariable: boolean;
  externalLoad: boolean;
  hasHistory: boolean;
  scopes: HistoryScopeDto[];       // [] for gym-consistent; machines: gyms (+ none)
  selectedScope: HistoryScopeDto | null;
  next:
    | { kind: "call"; tag: ProgressionTag | null; recommendation: RecommendationDto | null; insufficientNote: string | null }
    | { kind: "no_gym" }
    | null;                        // null when no history
  records: ExerciseRecordsDto | null;
  trend: { e1rm: TrendDto | null; weight: TrendDto | null; reps: TrendDto | null };
  sessions: { rows: SessionRowDto[]; total: number; showingAll: boolean };
};

export type ExerciseGoalsDto = {
  active: ActiveGoalDto | null;
  past: GoalHistoryDto[];
  newGoalEligible: boolean;        // the page adds ?gymId= for a machine's selected active gym
  bodyweight: boolean;
};
```

Pure, client-safe formatter (`src/lib/progression/history-format.ts`):

- `formatSetLine(row, externalLoad)`: same load on every working set → `185 × 10 · 10 · 9`; otherwise `185 × 8 · 190 × 7 · 190 × 6`; extra sets appended as ` + 135 × 15`; bodyweight → `20 · 20 reps`. Loads print without float noise (`102.5`, `185`).
- `formatRirLine(row)`: `RIR 2 · 1 · –` (`–` for an unrecorded set, `4+` for 4), or `null` when no working set has RIR.

No DTO carries a userId, another account's data, or raw Prisma objects. `DecisionEvidence` stays server-side (only the built strings cross).

## 14. Testing strategy

### 14.1 Unit (`tests/unit/exercise-history.test.ts`, `exercise-history-format.test.ts`)

```text
GIVEN working sets 205×5, 195×6, 185×10, 180×10, 175×10
THEN repRecordFrontier = [205×5, 195×6, 185×10]; 180×10 and 175×10 are absent

GIVEN 185×10 on Oct 9 and Oct 20
THEN bestSet = Oct 9 (earliest tie); heaviest = 185×10 Oct 9 (tie → most reps → earliest)

GIVEN a session in a scheduled-deload week with 225×3
THEN it sets no record and its trend point has scheduledDeload = true

GIVEN extra sets (setNumber > plannedSets) heavier than any working set
THEN no record uses them; formatSetLine shows them after " + "

GIVEN an unfinished session with a heavier set
THEN no record and no trend point uses it; its call is in_progress

GIVEN a finished session with 2 of 3 planned sets
THEN call = not_counted; its working sets DO count toward records (finished, demonstrated strength)

GIVEN bodyweight rows
THEN records.kind = "bodyweight" (most reps), no e1RM, trend.e1rm and trend.weight are null

GIVEN the Pitch 16 preview's Bench history (14 rows)
THEN callsBySession equals the preview's calls row for row (fixture mirrors the preview)

GIVEN any random history (property sweep, 2,000 generated histories)
THEN the latest counted row's call == evaluateReactiveDecision(all rows).state
 AND every call equals evaluateReactiveDecision(prefix).state (no second ladder)
 AND bestSet's e1RM == max session e1RM over the record population (== Goals best)

GIVEN rows with scope "none"
THEN every call is "none"
```

Static guards (`tests/unit/exercise-history-guards.test.ts`):

- `history.ts` / `history-format.ts` import nothing from `@prisma/client`, `@/lib/db`, `server-only`, React.
- `history.ts`, `history-queries.ts`, and `src/app/(app)/exercises/[id]/**` contain no `.create(`, `.update(`, `.upsert(`, `.delete(`, `createMany`, `updateMany`, `deleteMany`, `$transaction`, `reconcileGoalCompletions`.
- No new e1RM formula: `history.ts` does not contain `/ 30` or `1 + ` arithmetic on reps (imports `estimateOneRepMax`).
- The page contains no celebratory vocabulary: no `New PR`, `PR!`, `🎉`, `confetti`, `streak`, `badge` component use on records.

### 14.2 Integration (`tests/integration/exercise-history.int.test.ts`, embedded Postgres)

| Case | Proves |
| ---- | ------ |
| Machine logged at Gym A (150×10) and Gym B (110×12) | scope A shows only A's sessions/records/points/calls; scope B only B's; no DTO field contains the other gym's values; default scope = most recent finished gym |
| Free weight at two gyms | one global scope; rows carry their gym names; records span both |
| Correction | edit a past set through `editLoggedSet` (the canonical path) from 225×3 to 215×3 → heaviest, frontier, best set, trend point, and the calls after that session change on the next read |
| Archive | soft-archive the custom exercise and the gym → page still returns full history; scope label `(archived)`; `newGoalEligible` false for the archived exercise |
| Calls vs current | for every fixture history, the latest counted row's call == `getExerciseProgression(...).state` for the same scope, and the tag/recommendation equal `getOccurrenceProgression` for a completed occurrence in that scope |
| Goals agree | `getExerciseHistory().records.bestSet` == `getGoalDetail().best` for a gym-consistent goal and for a machine goal at its gym; `getExerciseGoals` lists active + archived (completed/manual) with Goals' own labels |
| No-gym legacy rows | a gym-variable row with `gymId = null` forms the `none` scope; no calls; records/trend present |
| Read-only | snapshot of every owned table's row count and `max(updated_at)` before and after `getExerciseHistory` + `getExerciseGoals` (all scopes, both session modes) is identical, including `goals` and `gym_exercise_baselines` |
| Empty | an exercise with no rows → `hasHistory: false`, `records: null`, `next: null`, no points |
| Sparse | one finished session → records present, `trend.e1rm.points.length === 1`, call `insufficient`, `next.insufficientNote` set |

Isolation (`tests/integration/isolation/exercise-history.int.test.ts`, registered in `coverage.ts` notes; no new owned model):

- Account B opening a **library** exercise A has trained sees no rows, records, calls, points, or goals of A (`hasHistory: false`).
- Account B opening A's **custom** exercise id → `null` (not-found), same as a random uuid.
- `?gym=<A's gym id>` from B → ignored, same output as no param.
- `getExerciseGoals` for B never returns A's goals.

### 14.3 E2E (`e2e/accounts/exercise-history.spec.ts`, local stack)

- Seeded account with bench history: page shows Next time, the four record labels with the expected values, the trend with both tabs, 10 rows + "View all N sessions", goals; phone (375) and desktop (1280); light and dark screenshots saved to `test-results/exercise-history/`.
- Machine at two gyms: switching the select changes every section's gym label and numbers.
- Correction journey: edit a set on the workout detail, return → heaviest/best/call updated.
- Entry points: card "View history ›" (with `?gym=` for a machine), day-complete "history ›", goal "Exercise history ›", workout-detail name link.
- No horizontal overflow at 320 and 375.

### 14.4 Standing suites

Lint, typecheck, format, unit, integration (incl. RLS, cross-account isolation, history integrity, baselines, deload suppression), build, client-bundle check, accounts e2e, default e2e — all green and unweakened.

## 15. Acceptance criteria

**AC-1 Complete exercise-level history (Roadmap DoD 1)**
- [ ] `/exercises/[id]` shows, for an exercise with history: Next time (tag + two lines), Records (Best set, Best e1RM · estimate, Heaviest weight, Rep records), Trend (e1RM and Weight views), Sessions (sets, RIR, call per row, View all), Goals (active + past), About.
- [ ] Bodyweight: Most reps; Reps trend; no e1RM or `lb` anywhere; the goals line.
- [ ] No history: one empty block, no zeros or axes; one session: records + text trend + `Not enough history`.
- [ ] Every number matches the logged sets after a correction on the next read.
- [ ] Archived exercise/gym keep their full history.

**AC-2 No cross-gym machine/cable comparison (DoD 2)**
- [ ] A machine/cable page shows one gym's scope at a time; every scoped section names the gym; no DTO for one scope contains another scope's values; there is no all-gyms option.
- [ ] Gym-consistent exercises keep one global scope.

**AC-3 Records, not rewards (DoD 3)**
- [ ] No badge, icon, colour, animation, toast, or "new record" wording attaches to any record; progress/deload colours appear only in the engine's tags.

**Consistency**
- [ ] The newest counted session's call equals Next time's call and the card/summary call for the same history.
- [ ] Best set equals the Goals best for the same scope.
- [ ] Opening, switching scope or chart, and expanding sessions write nothing.

**Entry points and guidance**
- [ ] Card `View history ›`, day-complete `history ›`, goal `Exercise history ›`, workout-detail names link, machines carry `?gym=`.
- [ ] Guidance ticket: tour decision recorded and applied through the registry; significant release note added with its real shipping date.

## 16. Explicit non-goals

- ❌ New progression rules, thresholds, RIR qualifiers, or recommendation wording. **Permanent for this pitch.**
- ❌ Stored PRs, stored calls, or any cache of derived values. **Permanent** (CLAUDE.md derived-values rule).
- ❌ All-gyms machine/cable views or cross-gym comparisons. **Permanent.**
- ❌ Gamification (badges, streaks, confetti, "New PR"). **Permanent.**
- ❌ Social/sharing/leaderboards. **Permanent.**
- ❌ Volume, tonnage, readiness, fatigue, velocity metrics; date filters; exports. **Out of scope** (a later pitch would have to propose them).
- ❌ Program generation. **Permanent.**

## Resolved Decisions

Authority order (CLAUDE.md, Autonomous Pipeline Policy): approved planning docs → CLAUDE.md and skills → codebase patterns → judgment. "Pitch" = `pitches/16-…`; "DD" = the design doc; "D1" = pipeline guide Appendix D1.

| # | Decision | Rationale | Authority |
| - | -------- | --------- | --------- |
| R1 | **Merge on green**, conditional: the run merges only if the implemented diff has no schema/migration, no write-path change, no scoping change, no auth/RLS change; otherwise stop before merge. | D1 lists this feature as merge-on-green unless the pitch trips the rule; this spec adds no schema, write, or scoping change. | Run prompt; guide D1; pitch §15 |
| R2 | The preview is `.html`, not the run prompt's `-preview.tsx`. | Owner's recorded preference; the skill writes `.html` and refuses `.tsx` outputs. | Memory "UI previews as HTML"; `overload-ui-design` |
| R3 | The history view **is** `/exercises/[id]`; no new route or nav item. | Every existing entry point already lands there; pitch §14 forbids unrelated navigation changes. | Pitch §14; DD §6 |
| R4 | Entry links renamed "history"; machine links carry `?gym=`; the card link shows for any finished history in scope (bodyweight included); workout-detail names link. | The page now holds more than the trend; landing in the wrong gym's book would mislead. | DD §6, Screen 7 |
| R5 | Scope: gym-consistent → one global scope; machine/cable → one per gym with rows, plus `none` for legacy null-gym rows; default = most recent finished gym. | `isGymVariable` is the single authority; the engine already scopes per gym; dropping null-gym rows would hide history (CLAUDE.md archived-history rule). | Engine spec R11–R14; CLAUDE.md; DD §4.1 |
| R6 | Scope `none` gets no calls ("Calls for machines are made per gym."). | The engine defers machine calls until a gym exists (R14/R15); inventing a call for an unattributable scope would be a new rule. | Engine spec R14, R15 |
| R7 | Record population = working sets of finished sessions outside scheduled-deload weeks — the Goals population. | One notion of demonstrated strength; guarantees Best set == Goals best. | Goals spec; `getQualifyingSessionE1rms` |
| R8 | Best set = `bestWorkingSet` (highest e1RM, earliest tie); Best e1RM = its estimate, labelled "estimate". | The codebase's only "best set" ranking; reuse beats inventing (pitch §4.7 asks for a documented, non-arbitrary interpretation). | `e1rm.ts`; guide §4.3 |
| R9 | Heaviest weight = max load; tie → most reps; tie → earliest. | A real completed set (pitch §4.8); the tie rule shows the strongest performance at that load. | Pitch §4.8 |
| R10 | Rep records = rep-max frontier (load desc, listed only if reps beat every heavier load), cap `REP_RECORDS_MAX = 6`. | Never ranks a lighter longer set above a heavier one (pitch §4.9, §9.6); bounded (pitch §9.5). 6 is a **Bucket C** display cap, flagged for review. | Judgment; Bucket C |
| R11 | Bodyweight records = Most reps in one working set only. | Reps-only rule: no load, no e1RM (pitch §4.7, §4.9). | `loading-mode.ts`; pitch |
| R12 | Calls = the engine on the scope prefix up to each session, computed on read; statuses for in-progress, deload week, short, and no-gym rows. | Faithful without storage (pitch §4.12, §9.3, §9.9); suppression preserved; the newest call equals the current call by construction. Calls reflect current rules on current data, said in one caption line. | CLAUDE.md derived values; engine spec |
| R13 | An ordinary hold in the Call column is the muted word "Hold", not a tag. | The engine's "hold renders no tag" rule; a history column still needs a word to be readable. | CLAUDE.md; DD §4.4 |
| R14 | Weight view = heaviest working-set load per finished session; Reps view (bodyweight) = most reps. | Every plotted number was really on the bar (pitch §4.3); median would plot loads never lifted. | Pitch §4.3; DD §4.5 |
| R15 | A chart needs ≥ 2 points; one point is a sentence. The call threshold stays the engine's `MIN_QUALIFYING_SESSIONS`. | Pitch §9.7; no page-specific threshold. | Pitch §4.14 |
| R16 | Recent sessions = 10 (`RECENT_SESSIONS`), `?sessions=all` for the rest; list, not table. | Phone-first (pitch §13); bounded default. Bucket C display constant. | DD §7 |
| R17 | Goals section lists every goal on the exercise regardless of selected gym; machine goals name their gym. | Goals are already per-gym objects measured at their own gym; listing compares nothing. | Goals spec R16–R19 |
| R18 | The page never calls `reconcileGoalCompletions`. | Pitch §4.19 read-only; completion stays with the Goals surfaces. | Pitch §4.19 |
| R19 | "Set a goal" link only when the exercise is active, loaded, and has no active goal; machines pre-select the selected scope's gym if active. | Mirrors `getGoalFormContext` eligibility; no new goal functionality. | Goals spec |
| R20 | No schema change; one new pure module + one new server read; `describeScope` extracted from `getExerciseProgression` so both share rows and wording. | Pitch §9.12; one evaluation per surface. | CLAUDE.md; Pitch 15 R3–R5 |
| R21 | Extra sets are shown in Sessions but never set records or points. | Same as e1RM/Goals (working sets only); keeps records consistent. | Engine spec R18 |
| R22 | A finished session short of planned sets counts toward records/points but its call is `not_counted`. | Records = demonstrated strength (Goals rule); the call follows the engine's completeness rule. | Goals spec; engine R9/R44 |
| R23 | Dates: `formatMonthDay` against the account's today ("Oct 9"; year shown when different). | Existing formatter; per-account today (CLAUDE.md). | Pitch 15 R17; CLAUDE.md |
| R24 | The trend tab is local client state, not a URL param. | Pure presentation; keeps the server render single. | Judgment |
| R25 | `?gym=` values not in the acting account's scopes are silently ignored. | Navigation state; never reveal or probe another account (not-found ≡ missing). | CLAUDE.md first invariant |
| R26 | Tickets: (1) read layer + pure module + tests → (2) page UI + entry points + e2e → (3) user guidance, chained blockedBy. | Medium-large PR-sized units in dependency order; guidance last. | Guide §5 step 6 |
| R27 | Tour step: recommended on `/exercises` (desktop rail item / phone heading), final call by `overload-onboarding`; release note significant, dated the production (merge) day. | Pitch §12; the What's New contract forbids planned or backdated dates. | Pitch §12; method note release-note contract |
| R28 | The archived exercise keeps its history and loses favourite, archive, and Set a goal; archived gyms stay selectable as `(archived)`. | Archive is never deletion (pitch §4.17). | CLAUDE.md; Goals R39–R41 |
| R29 | "Current" e1RM header and the Weight/Reps "Last" value come from the latest non-deload point. | Existing `currentE1rm` rule (R42); same for the new views. | Engine spec R42 |
| R30 | One column at every width; the design doc's and preview's two-column desktop layout is superseded (design doc v1.1, preview regenerated). | The app shell caps every page at `max-w-screen-sm` (640px); a 20rem side column would leave a ~288px main column, narrower than a phone. Desktop gains chart height, not a column — the shell's established rule. Changing the shell is out of scope. Found while implementing OVE-71. | Codebase pattern (`app-shell.tsx`); design doc §10 |
| R31 | Guidance (`overload-onboarding`, OVE-72): one new tour step `exercises` on `/exercises` after `goals` (rail order), anchored to the Exercises rail item (`nav-exercises`, desktop) and the Exercises heading (`page-exercises`, phone); copy in the design doc's "Tour steps added" table, which the registry test now reads alongside the Onboarding Tour's table. One significant What's New entry `2026-10-22-exercise-history`, dated the merge (production) day. Existing lifters learn of the step from What's New; the tour never re-opens by itself (Onboarding Tour R5). | The history is reached through Exercises, which the tour never visited, so the lifter must discover it (skill rubric: a new screen). Pinned registry tests updated for the ninth step, not weakened. | `overload-onboarding`; Onboarding Tour spec R9; What's New content contract |
| R32 | Review audit of #90: every history link for a machine/cable occurrence names its scope — its gym, or `?gym=none` for a legacy row with no gym — through the one helper `exerciseHistoryHref` (the goal page uses it too); the no-gym scope's prose says "with no gym recorded" (headings keep the label); the trend axis never goes below zero; the goal-form link rule is one function, `newGoalFormHref`. Read reuse and the per-prefix sort are deferred to OVE-73. | Landing a no-gym row's link on another gym's history would show the wrong book (AC-2). The rest are defects or duplication the pitch introduced. | Review audit; R5, R19, R25 |

## Open Questions

None blocking. Bucket C display constants (`REP_RECORDS_MAX = 6`, `RECENT_SESSIONS = 10`) are flagged for owner review in the run report.

## 18. Future considerations

- Exercise history is the natural target for a future per-exercise deep link from the iOS shell and Live Activity.
- If a later pitch changes the engine's rules, the Call column re-reads history under the new rules automatically; a future "as shown at the time" view would need its own pitch and a deliberate decision about storing snapshots.
