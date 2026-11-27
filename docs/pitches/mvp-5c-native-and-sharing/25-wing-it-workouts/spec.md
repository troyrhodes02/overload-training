# Wing-It Workouts — Technical Specification

> Pitch 25 (MVP 5C). Inputs: `pitch.md`, `design.md`, `preview.tsx` (binding visual contract for the web), the PRD, the Architecture Doc, `CLAUDE.md`, and the code as it stands on `staging` at `56c756c`. Client scope: web and iPhone, one run. Plan placement: Free.

## 1. Summary

A Wing-It workout is a `LoggedSession` of a new kind, `wing_it`, with no mesocycle and no session, a workout gym on the session row, and `LoggedExercise` rows whose plan snapshot (`plannedSets`, `targetRepMin`, `targetRepMax`) is NULL. It is started from Today on either client, gets exercises added while training, logs sets through `logged-sets.ts`, and finishes through `completeWorkout`. It appears in History, counts toward exercise history, records, the e1RM trend, goals, and gym baselines, and is never fed to the progression engine. One open Wing-It workout per account is enforced by a partial unique index.

## 2. Problem

See `pitch.md` §1. The model already reserves the shape (`LoggedSession.mesocycleId` and `sessionId` are nullable with no writer, audit row "probably reserved for wing-it workouts"), but `LoggedExercise` requires a plan snapshot and the gym lives only on exercises.

## 3. Scope and non-scope

**In scope:** migration `9t_wing_it_workouts`; the Wing-It domain module; read-path integration (Today, workout, history week, logged detail, unfinished list, exercise history, qualifying e1RMs, card context, baselines); three new mobile endpoints and additive fields; web Today, start, runner, picker, history; native Today, start, runner, picker, history; tests; a release note; runbook.

**Out of scope:** exercise suggestions, converting to a plan, any change to the planned start flow's server rules, the engine, its constants, entitlements, billing, the tour registry, and Production.

## 4. Core concepts

| Term | Meaning |
| --- | --- |
| Wing-It workout | `LoggedSession.kind = wing_it`. `mesocycleId`, `sessionId` NULL; `gymId` NOT NULL. Shown as "Wing-It workout". |
| Planned workout | `kind = planned` (every existing row). `sessionId`, `mesocycleId` written by `startOrResumeWorkout`; `gymId` NULL (the gym stays on its exercises, unchanged). |
| Open-ended exercise | A `LoggedExercise` with NULL plan snapshot. Only inside a Wing-It workout. Every logged set is a working set; there are no extra sets. |
| Active workout | An in-progress workout with at least one saved set — the definition Today's unfinished list already uses ("a workout with no saved set is left out"). |
| Open Wing-It workout | The account's one in-progress Wing-It workout, with or without sets. |

## 5. States and lifecycle

```
(none) --start(gym)--> open (in_progress, 0 exercises)
open --add exercise / remove empty exercise / change gym (no sets) / log set--> open
open --finish (>=1 set)--> complete   (untouched exercises stamped skippedAt, as planned)
complete --correct a set--> complete   (editLoggedSet; no baseline replay)
```

- **Start** (`startWingItWorkout`): if an open Wing-It workout exists, return it (`resumed: true`), and if it has no set and a different gym was chosen, move it to that gym. Otherwise, if any active workout exists, refuse with `conflict` and `details { loggedSessionId, sessionName }`. Otherwise create it: `scheduledFor` and `performedOn` = today in the account's timezone (the planned convention of a date at UTC midnight), `status in_progress`. A concurrent second create loses the partial unique index; the transaction re-runs and resumes the winner (the `startOrResumeWorkout` retry pattern).
- **Planned start while a Wing-It workout is active:** the server rule is unchanged (21g "warn, never forbid"): refusing it would let a Wing-It workout block the plan. New clients include an active Wing-It workout in the existing unfinished-workout warning, with Resume first.
- **Abandon:** an open Wing-It workout with no set is a draft: it is not listed as unfinished, never shown in History as anything but "In progress" with no sets, and the next Start resumes it. Nothing deletes a row. There is no "discard workout". An exercise with no sets can be removed: it is marked not done (the existing `setExerciseSkipped`), and every Wing-It read hides an open-ended exercise that is marked and has no sets.

## 6. Data model — migration `9t_wing_it_workouts` (hand-written, additive)

```sql
CREATE TYPE "LoggedSessionKind" AS ENUM ('planned', 'wing_it');
ALTER TABLE logged_sessions ADD COLUMN kind "LoggedSessionKind" NOT NULL DEFAULT 'planned';
ALTER TABLE logged_sessions ADD COLUMN gym_id uuid NULL REFERENCES gyms(id) ON DELETE RESTRICT;
ALTER TABLE logged_sessions ADD CONSTRAINT logged_sessions_kind_shape_check CHECK (
  (kind = 'planned' AND gym_id IS NULL)
  OR (kind = 'wing_it' AND session_id IS NULL AND mesocycle_id IS NULL AND gym_id IS NOT NULL));
-- trigger: a kind never changes
CREATE UNIQUE INDEX logged_sessions_one_open_wing_it_per_user
  ON logged_sessions (user_id) WHERE kind = 'wing_it' AND status = 'in_progress';
CREATE INDEX logged_sessions_gym_id_idx ON logged_sessions (gym_id);
-- same-owner trigger for gym_id (shared overload_assert_same_owner)
ALTER TABLE logged_exercises ALTER COLUMN planned_sets DROP NOT NULL,
  ALTER COLUMN target_rep_min DROP NOT NULL, ALTER COLUMN target_rep_max DROP NOT NULL;
ALTER TABLE logged_exercises ADD CONSTRAINT logged_exercises_plan_snapshot_check CHECK (
  (planned_sets IS NOT NULL AND target_rep_min IS NOT NULL AND target_rep_max IS NOT NULL)
  OR (planned_sets IS NULL AND target_rep_min IS NULL AND target_rep_max IS NULL AND session_exercise_id IS NULL));
-- trigger: a NULL snapshot only under a wing_it session, a non-NULL one only under a planned session
```

- **Why the existing model cannot carry it safely:** the plan snapshot is NOT NULL and defines "working sets" (1..plannedSets) everywhere; any value written for a Wing-It exercise would be an invented target (RD-6, RD-10). A Wing-It workout starts with no exercises, so its gym has no row to live on. A kind column makes the unplanned identity explicit and lets the database check the shape instead of trusting every writer.
- **Existing rows:** every row becomes `planned` with `gym_id` NULL, which satisfies the CHECK. The planned half does not newly require `session_id`/`mesocycle_id`: the database never did, and test fixtures model planned history without a session. The runbook still counts such rows read-only before the Production migration, for the record.
- **RLS:** no new table. The enum, column, and constraints do not touch RLS (tables already deny-all).
- **Compatibility:** relaxing NOT NULL and adding a defaulted column are invisible to the deployed web and the installed app until Wing-It rows exist, which only new code writes.
- **Prisma:** `enum LoggedSessionKind`, `LoggedSession.kind @default(planned)`, `LoggedSession.gymId` + `gym` relation (Restrict), `Gym.loggedSessions`, nullable snapshot fields. The partial index and CHECKs are documented on the model (precedent: `goals_one_active_per_exercise_per_user`). The enum is added to `packages/shared/src/enums.ts` (`LOGGED_SESSION_KINDS`) with the parity test.
- **History invariants kept:** `LoggedSet` untouched; every FK Restrict; no column dropped or renamed; `plannedExerciseId` stays NOT NULL and is the chosen exercise for a Wing-It exercise (there is no "planned" one; equal ids mean "not swapped").

## 7. Server modules

### 7.1 `apps/web/src/lib/logging/wing-it.ts` (new; writes `LoggedSession`/`LoggedExercise`, never `LoggedSet`)

Every function takes the acting `Account`, runs on the scoped client, accepts an optional scoped transaction, and calls `lockWorkoutForUpdate` before its first write to a workout (the OVE-220 guard covers this file).

- `startWingItWorkout(account, { gymId }, tx?) → { loggedSessionId, resumed }`.
- `addWingItExercise(account, { loggedSessionId, exerciseId }, tx?) → { loggedExerciseId, exerciseId, added }`. Wing-It and in progress, else `invalid_state_transition`; exercise active and visible (library or own custom), else `validation_error` "That exercise isn't available."; already in the workout → return that entry (`added: false`; natural key, so a retry or a duplicate pick never creates a second card); at most `WING_IT_MAX_EXERCISES = 30` (shared, Bucket C). New row: `exerciseId = plannedExerciseId = chosen`, `gymId = session.gymId`, `position = max + 1`, NULL snapshot.
- **Remove** is the existing `setExerciseSkipped(skipped: true)` (only with no sets, only while in progress). `isShownOpenEnded` is the one rule every Wing-It read applies to hide it; adding the exercise again clears the mark. No row is deleted (the invariant guard keeps `LoggedExercise` deletes inside account deletion).
- `getAddExerciseContext(account, loggedSessionId, muscle) → AddExerciseContextDto | null` (read): active exercises visible to the account, all groups by default or one group, favorites first, `inWorkout` flag.
- `getWingItToday(account) → WingItTodayDto` (read): `open`, `finishedToday`, `blockedBy`.

### 7.2 Changes to existing modules

| Module | Change |
| --- | --- |
| `logged-sets.ts` | `isAllowedSetNumber`: with `plannedSets` NULL, a set number is allowed when it is 1..`WING_IT_MAX_SETS` (20, Bucket C) and every lower number is logged, or it is a replay. Baseline call unchanged. |
| `gyms/baselines.ts` | With NULL `plannedSets`, the working sets are every logged set; the exercise is "complete" once it has one loaded set. Same transaction, same `(gymId, exerciseId)` row, same median and threshold. |
| `sessions.ts` | `changeGym` also writes `LoggedSession.gymId` for Wing-It. `swapExercise` refuses a Wing-It exercise (`invalid_state_transition` "Remove it and add the exercise you're doing instead."). `editPlannedSets` refuses a NULL snapshot. `startOrResumeWorkout` unchanged. `completeWorkout` unchanged. |
| `queries.ts` | `getWorkout` adds `kind`, Wing-It name and gym, open-ended cards; `loadCardHistory` reads planned rows only (planned cards unchanged); `getLoggedWorkoutDetail` adds `kind`/`openEnded`; `listUnfinishedWorkouts` names Wing-It workouts and counts all their sets; `loggedPreview` tolerates NULL. |
| `history-week.ts` | Logged view: Wing-It name, `kind`. Active view: `wingItWorkouts` for the week. |
| `progression/queries.ts` | `gatherRows` reads `kind = planned` only (engine input unchanged). New `gatherWingItRows` (strength rows). `getQualifyingSessionE1rms` includes finished Wing-It rows. `getSessionProgressionSummary` → null for Wing-It. `getOccurrenceProgression` → null for an open-ended exercise. |
| `progression/history-queries.ts` | Records, trends, and Sessions include Wing-It rows; segments, anchors, and calls use planned rows only; a Wing-It session's call is `none`. |
| `shared/progression/history.ts` | `HistoryRow.perf` narrowed to the strength fields (`StrengthPerformance`); `callsBySession` takes `JudgedHistoryRow` (full `Performance`). No logic change. |
| `views/today.ts`, `views/workout.ts` | `wingIt` on Today; no progression read for a Wing-It workout. |
| `accounts/export.ts` | No change (rows are exported as stored; the new columns ride along). |

### 7.3 Transactions, retry, and concurrency

| Case | Outcome |
| --- | --- |
| Start tapped twice, two tabs, web + phone | Partial unique index; the loser's transaction re-runs and resumes. One workout. |
| Add exercise twice | Natural key (session, exercise): the second returns the first entry. Serialized by the workout lock. |
| Remove twice | `setExerciseSkipped` keeps the first mark: the same answer, nothing more written. |
| Same set twice | Existing `logSet` replay rule (identical → stored row; different → 409). |
| Finish twice | Existing idempotent completion. |
| Remove vs. first set, concurrently | Both take the workout lock: either the set lands first (remove refused) or the mark lands first (the set is refused: "marked as not done"). |
| Add after finish | Refused under the lock (`invalid_state_transition`). |
| Planned start vs. Wing-It start at the same instant | Both may be created with no sets; neither loses data. Accepted (no account-wide lock: it would add a statement to every set write, OVE-212 seed budget). |
| Stale client overwrites | No write is last-write-wins on a set: a different value for a saved set number is a 409, corrections go through `editLoggedSet`. |

## 8. Mobile API contract (`/api/mobile/v1`, additive)

New endpoints (`mobileRoute`; token, version gate, suspension, rate limit as every route):

| # | Method and path | Body | 200 response | Retry safety |
| --- | --- | --- | --- | --- |
| W1 | `POST /wing-it-workouts` | `{ gymId }` | `StartWingItResponseDto { loggedSessionId, resumed }` | one open per account |
| W2 | `GET /workouts/{loggedSessionId}/exercise-candidates?muscle=` | — | `AddExerciseContextDto` | read |
| W3 | `PUT /workouts/{loggedSessionId}/exercises/{exerciseId}` | none | `AddWingItExerciseResponseDto { loggedExerciseId, exerciseId, added }` | natural key |
Remove uses the existing `PUT /logged-exercises/{loggedExerciseId}/skipped` (21f E11), unchanged.

W1 refusal while another workout is active: 409 `conflict`, `details: { loggedSessionId, sessionName }`. W3 on a planned workout: 400 `invalid_state_transition` (the existing status for that code).

Additive fields (all optional on the type where an older server could omit them; the server always sends them):

- `TodayDto.wingIt?: WingItTodayDto` — `{ open: WingItSummaryDto | null; finishedToday: WingItSummaryDto[]; blockedBy: { loggedSessionId; sessionName } | null }`, `WingItSummaryDto = { loggedSessionId, gymName, exerciseCount, setsLogged, startedOn }`.
- `WorkoutDto.kind?`, `LoggedWorkoutDetailDto.kind?`, `UnfinishedWorkoutDto.kind?`, `LoggedHistoryDay.workouts[].kind?` — `"planned" | "wing_it"`.
- `ExerciseCardDto.openEnded?`, `LoggedWorkoutDetailDto.exercises[].openEnded?`, `PreviousPerformanceDto.openEnded?`.
- `HistoryWeekView` active variant `wingItWorkouts?: WingItHistoryRowDto[]` (`{ loggedSessionId, dateIso, dayLabel, sessionName, state }`).

**Legacy values for TestFlight 1.0.0 (2)** (no runtime validation; it reads the old fields only):

| Field on a Wing-It row | Value | Old client result |
| --- | --- | --- |
| `ExerciseCardDto.plannedSets` | number of rows sent (saved sets + the one open row while in progress) | one open row, logs the next set |
| `ExerciseCardDto.plannedRepRange` | `{ min: 1, max: 1000 }` (the shared reps limits) | scheme reads "n × 1–1000"; cosmetic |
| `sets[].extra` | false | no extra-set path needed |
| `LoggedWorkoutDetailDto.exercises[].plannedSets` | sets logged | no "x of y planned" line, no correction offer |
| `PreviousPerformanceDto.repRange` (Wing-It cards only) | `{ min: 1, max: 1000 }` | reference line prints a range; cosmetic |
| `sessionName` everywhere | "Wing-It workout" | readable in History and the unfinished list |
| `DashboardDto` | unchanged kinds | the old Today ignores `wingIt` |

The old client can open a Wing-It workout from History or the unfinished list, log the next set, and finish. Its action sheet may offer Swap or "fewer sets", which the server refuses with a message. No discriminator changes, no field removed, the minimum app version is not raised. A compatibility unit test runs the old card model (`card-model.ts` functions as on `main`) against a Wing-It `ExerciseCardDto`.

## 9. UI integration

### Screen → endpoint map

| Screen | Web (server component / action) | iPhone (endpoint) |
| --- | --- | --- |
| Today | `getTodayView` → `wingIt` | `GET /today` |
| Start | `startWingItAction(gymId)` on `/log/wing-it` | W1 |
| Runner | `getWorkoutView` | `GET /workouts/{id}` |
| Picker | `getAddExerciseContext` on `/log/{id}/add`, `addWingItExerciseAction` | W2, W3 |
| Remove | `setExerciseSkippedAction` (existing) | existing `PUT …/skipped` |
| Sets / gym / finish | existing actions | existing endpoints |
| History | `getHistoryWeek`, `getLoggedWorkoutDetail` | `GET /history`, `GET /history/{id}` |

Shared copy and pure rules: `packages/shared/src/logging/wing-it.ts` — `WING_IT_NAME`, button and helper sentences, `wingItBlockedMessage`, `openEndedSchemeLine`, `wingItSummaryLine`, `WING_IT_MAX_EXERCISES`, `WING_IT_MAX_SETS`, `LEGACY_OPEN_REP_RANGE`, `filterAddCandidates`.

UI requirements carried from `preview.tsx`: the Wing-It section is its own card below the planned block (outside the inert missed-day region), secondary button except in the no-plan state, one open row per open-ended card, "Add exercise" under the card navigation, the picker's "All muscle groups" default and "In this workout" marker, and History rows for Wing-It workouts on their day in active weeks.

### User guidance

Release note `2026-11-27-wing-it-workouts` (What's New, significant). No tour step (design §13).

## 10. Authorization and access control

- Identity from the session (web) or verified bearer token (mobile). Every read and write on `account.db`; another account's workout, exercise, or gym is `not_found` / "isn't available", never forbidden.
- No capability check: Free. The workout view's progression list is empty for Wing-It (there is no call to lock), so a Free account is never shown a locked note there.
- Suspended accounts: refused by the existing pipeline/`requireAccount`.

## 11. Validation rules

`gymId`: an active gym of the account. `exerciseId`: an active exercise visible to the account. Set values: the existing shared weight, reps, and RIR rules. Set number: sequential from 1, at most 20. Exercises per Wing-It workout: at most 30. `muscle`: a muscle group or `all`; anything else falls back to `all`.

## 12. Testing strategy

- **Integration, domain (`tests/integration/wing-it.int.test.ts`):** start with no plan; start with an active plan leaves `mesocycles`, `sessions`, `session_exercises`, `missed_day_resolutions`, `schedule_moves` byte-identical and Today's planned kind unchanged after start and after finish (the mandatory regression); missed-day detection unchanged; resume; one open per account (sequential and concurrent); refused while another workout is active, allowed when it has no sets; add / duplicate add / remove / remove with sets refused / add after finish refused; set numbering; finish; baselines (first establishes, deviation corrects, other gym untouched, free weight none); e1RM qualifying rows and goals include Wing-It; engine rows exclude Wing-It and a planned card's call is unchanged by a Wing-It workout between two planned ones; history week (active and logged views), detail, unfinished list; multiple Wing-It workouts in one day; Free with the free-Pro period off and on; database constraints (CHECK, trigger, partial index, Restrict on a set-bearing exercise).
- **Isolation (`tests/integration/isolation/`):** a second account cannot read, add to, remove from, log in, change the gym of, or finish the first account's Wing-It workout, and cannot use its gym or custom exercise; every new endpoint has cases in `mobile-api.int.test.ts`; the registry lists them.
- **Mobile API (`tests/integration/mobile-wing-it.int.test.ts`):** W1–W3 happy paths, remove through the existing skip endpoint, shapes, 401/403/426, conflict details, legacy values on `GET /workouts/{id}` and `GET /history/{id}`, `GET /today` `wingIt`.
- **Static guards:** workout-lock guard covers `wing-it.ts`; `LoggedSet` writers unchanged; enum parity.
- **Web unit:** Wing-It copy, the open-ended card rows, the Today section states (jsdom).
- **Mobile unit:** `WingItSection`, `useStartWingIt` (single gym, sheet, conflict, busy guard), `AddExerciseScreen` filter and duplicate handling, open-ended `ExerciseCard`, exercise actions, History group, and the legacy-client compatibility test.
- **Unverified by a run:** the simulator and the physical iPhone (owner checks, runbook).

## 13. Acceptance criteria

1. Today offers Wing-It in no-plan, rest, scheduled, missed, completed, open, and finished states on both clients.
2. A Wing-It workout starts with no exercises, takes exercises at any time, logs sets with the normal card, finishes, and appears in History identified as "Wing-It workout".
3. After a Wing-It workout the scheduled workout, plan, mesocycle, and missed-day state are unchanged.
4. Starting Wing-It never creates a second open Wing-It workout and never starts while another workout holds saved sets.
5. Machine and cable sets establish or correct only the chosen gym's baseline in the set's transaction.
6. Wing-It sets appear in exercise history, records, the e1RM trend, and goal progress, with no progress, hold, or deload call.
7. All new endpoints pass the isolation suite; the full suite passes; TestFlight 1.0.0 (2) compatibility test passes.

## 14. Explicit non-goals

Exercise suggestions; converting to a plan; reordering exercises (the stepper order is the order added); a discard-workout action; a tour step; any Production action.

## Resolved Decisions

Owner pre-resolved (run prompt of 2026-11-27):

- **RD-1 Both clients together.** One run builds web and iPhone on one backend. *Owner.*
- **RD-2 Free.** No capability check in the lifecycle; independent of `OVERLOAD_FREE_PRO_PERIOD`. *Owner; roadmap plan placement.*
- **RD-3 Always on Today.** Every dashboard state, including with an active plan. *Owner.*
- **RD-4 Scheduled workouts independent.** No write to plan, schedule, or missed-day rows from any Wing-It path. *Owner; roadmap DoD.*
- **RD-5 One active workout.** Implemented as §5: one open Wing-It workout (index), and Wing-It start refused while an active workout exists. *Owner.*
- **RD-6 No plan required.** No hidden plan; NULL snapshot. *Owner.*
- **RD-7 Existing logging engine.** `logged-sets.ts` is the only set writer. *Owner; CLAUDE.md.*
- **RD-8 Dynamic exercise list.** Starts empty; add at any time; logged sets never touched. *Owner.*
- **RD-9 Gym-aware.** Workout gym on the session; machine baselines per gym; no GPS. *Owner.*
- **RD-10 No invented progression.** History and e1RM only; no tag, no planned-vs-actual. *Owner; Architecture Doc open question default.*
- **RD-11 Normal History.** Same history surfaces, identified by name and `kind`. *Owner.*
- **RD-12 Shared account-owned data.** Same tables, scoped client, mobile through the API only. *Owner; CLAUDE.md.*
- **RD-13 No suggestions.** *Owner; roadmap defers.*
- **RD-14 Protect Production TestFlight.** Staging-only delivery; no runtime change. *Owner.*
- **RD-15 Preserve billing.** No billing or entitlement change. *Owner.*

Decided in this run:

- **RD-16 Kind column plus CHECK, not "sessionId IS NULL".** Explicit identity the database checks (immutable by trigger); the History Calendar needs it. Every read decides Wing-It by `kind`, never by a NULL session. The CHECK is strict for `wing_it` (no session, no mesocycle, a gym) and requires only `gym_id IS NULL` for `planned`: the database never required a planned row's session, 19 integration suites seed planned history without one, and adding that requirement is not this pitch's concern. *Judgment; CLAUDE.md layered enforcement.*
- **RD-17 Gym on the session for Wing-It only.** A Wing-It workout exists before any exercise; planned workouts keep the gym on exercises (gym_id NULL by CHECK) so no planned code changes. *Judgment.*
- **RD-18 Nullable plan snapshot, guarded.** CHECK (all or none, none only without a session exercise) and a parent-kind trigger. *CLAUDE.md "nothing invented"; RD-6.*
- **RD-19 `plannedExerciseId` = the chosen exercise.** Keeps the column NOT NULL and "swapped" false; no swap on Wing-It (remove and add instead). *Judgment; smallest change.*
- **RD-20 Active workout = in progress with a saved set.** The 21g unfinished-list definition; an empty planned start never blocks Wing-It. *Codebase pattern.*
- **RD-21 Planned start never refused because of Wing-It.** Clients warn (21g pattern); a refusal would let a deviation block the plan. *21g OVE-228 "warn, never forbid"; RD-4.*
- **RD-22 One card per exercise per Wing-It workout.** Adding again opens the existing card; makes W3 a natural-key PUT (no Idempotency-Key table write). *CLAUDE.md natural-key retry rule.*
- **RD-23 Remove = the existing "not done" mark, never a delete.** The invariant guard (`tests/unit/invariant-guards.test.ts`) and CLAUDE.md keep every `LoggedExercise` delete inside account deletion, so an unused Wing-It exercise is marked not done (only with no sets) and hidden by Wing-It reads; adding it again restores it. No discard of a workout. *CLAUDE.md first and second invariants; existing 21f endpoint.*
- **RD-24 Baseline per set for open-ended exercises.** Working sets = every logged set; applied in the set's transaction with the existing median and 15% threshold. Applying at Finish would move a baseline write outside the set's transaction. *CLAUDE.md baseline invariant.*
- **RD-25 Engine rows exclude Wing-It.** `gatherRows` reads planned rows only; strength reads (records, trend, goals) add Wing-It rows separately. A finished-but-short row inside a segment would change a planned call. *Engine semantics (WLR RD-3).*
- **RD-26 No weight prefill on Wing-It cards.** Reference "Last time" only (any workout, gym-scoped for machines). Prescription-Aware RD forbids another workout's weight as an offer. *PAI spec §7.2.*
- **RD-27 Planned cards ignore Wing-It history.** `loadCardHistory` reads planned rows only, so planned cards, offers, and references are unchanged. *RD-4; compatibility.*
- **RD-28 Legacy numeric values (§8).** Old fields stay numbers with documented neutral values; new clients read `openEnded`/`kind`. *Mobile API backward-compatibility rule.*
- **RD-29 Limits.** 30 exercises, 20 sets per exercise (Bucket C, input sanity, flagged for review). *Judgment.*
- **RD-30 No tour step.** The native tour is under TestFlight review and Today's step already covers the day; a release note only. *RD-14; overload-onboarding.*
- **RD-31 Picker lists all groups by default.** "All muscle groups" first, favorites first, search over the listed group; same component pattern as Swap. *Design §6.8.*

Decided after the independent review of the feature branch:

- **RD-32 Picker returns to the server's card.** The iPhone picker passes the card the server answered with (new, restored, or already there) to the workout, which shows it; the web does the same with `?exercise=`. *Review #1; design §6.8.*
- **RD-33 Only shown cards count toward 30; a finished workout's picker is closed.** *Review #2, #3.*
- **RD-34 A Wing-It workout is dated by its start.** One started before midnight and finished after shows on its start day (Today's "finished today" and History), as a planned workout keeps its date. *Review #5; consistency with planned dating.*
- **RD-35 The planned card's trend link stays planned-only.** `getExerciseProgression`/`trendExists` feed the planned card; the Exercise History page, which the link opens, includes Wing-It sets. *Review #6; RD-25.*
- **RD-36 Per-set baselines can move with warm-ups.** Accepted: the median damps one light set, nothing offers the baseline as a weight today (PAI RD-9), and it is re-tunable from history. Revisit before any feature reads it as an offer. *Review #10; Architecture Doc top risk.*

## Open Questions

None that block the build. Upstream amendments for the owner: the Architecture Doc's open question "Wing-it workouts: how progression treats an exercise with no planned rep range" is settled by RD-10/RD-25 and can be moved to Settled; the data-model section can note `LoggedSession.kind` and `gymId`.

## 15. Future considerations

History Calendar (Pitch 26) reads `kind` for "wing-it days". Converting a Wing-It workout to a planned session, exercise suggestions, and reordering are separate decisions.
