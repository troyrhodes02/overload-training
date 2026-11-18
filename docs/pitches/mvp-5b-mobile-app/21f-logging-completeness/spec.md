---
version: 1.0.0
status: approved
author: Claude Code (unattended pipeline run, 2026-11-17)
last_updated: 2026-11-17
pitch_reference: docs/pitches/mvp-5b-mobile-app/21f-logging-completeness/pitch.md
design_reference: docs/pitches/mvp-5b-mobile-app/21f-logging-completeness/design.md
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
linear_issue: Linear milestone "Pitch 21f — Logging Completeness"
---

# Logging Completeness — Technical Specification

**Design:** `design.md` in this folder. Its §15 (Mobile design) is the binding native visual contract. There is no `preview.tsx`: step 3 is recorded as *Skipped — mobile-only pitch; native visual contract provided by the Mobile design section and `/overload-mobile-ui`.* The visual review artifact is the design canvas linked from design §15.

## 1. Summary

Logging Completeness gives the iPhone app every logging behavior the web already has beyond the plain loop: changing the workout's gym, swapping or skipping an exercise, reps in reserve, extra sets, correcting a saved set, lowering one workout's planned-set count, and logging or correcting cardio. It adds **eight account-scoped mobile API endpoints**, each a thin shell over the module the web's own server actions call (`changeGym`, `getSwapContext`, `swapExercise`, `setExerciseSkipped`, `editLoggedSetAndReconcile`, `editPlannedSetsAndReconcile`, `logCardio`, `editCardioLog`), and the native controls and three modal screens that use them.

The core abstraction is unchanged from 21e: **the server is the only authority, and the phone is a renderer with drafts.** Every new write is one request whose 200 is the only thing that makes the change real, and every one is safe to repeat because it sets an absolute value or is keyed by a natural key. The phone holds no training rule: whether a gym is locked, a swap allowed, a set number valid, or a planned count lowerable is decided by the existing modules, and the phone shows their answer.

"Working" means: a lifter on the staging build starts today's workout at the other gym and sees that gym's machine history, swaps a taken machine for another lift in any muscle group, marks an exercise not done and undoes it, logs sets with and without RIR, adds an extra set, corrects a set in today's workout and in a workout finished last week, counts a short exercise as planned, logs today's cardio, and the staging web app shows exactly the same records. No schema, migration, entitlement, native dependency, or web screen changes.

## 2. Problem

- The app cannot yet change the gym after Start, so a workout started at the wrong gym shows the wrong machine history until the lifter opens the web.
- The app cannot yet swap or skip an exercise: an archived planned exercise or a taken machine ends in "Swap it on the web" (21e RD-21).
- The app cannot yet record RIR, an extra set, or a correction: 21e's card sends no `rir`, offers no Add set, and its saved rows are read-only (21e RD-12).
- The app cannot yet log cardio: Today says "log it on the web for now".
- The mobile API has no endpoint for any of these (`apps/web/src/app/api/mobile/v1` holds the 21c–21e routes only).
- This blocks 21g (insights render on a card that must already be complete) and the beta gate, which needs the full workout experience.

## 3. Scope and non-scope

### In scope

- API: E8–E15 (§6), seven additive response types in `@overload/shared/contracts`, the endpoint registry, static guards, and isolation-suite cases for each.
- One narrow change to a web module: `setExerciseSkipped` keeps the existing `skippedAt` when asked to skip an exercise that is already skipped (RD-3).
- Native: the gym line and Change gym, the card's More sheet, the swap modal, skip and undo, the unavailable card's Swap, RIR entry, Add set, the edit-set modal, the fewer-sets confirmation, set correction and fewer-sets from the logged workout, and cardio logging and correction from Today and History.
- Development-only test-account tooling: demo seed variants and a `dev:test-account` command (§11).

### Out of scope

- **21g:** rendering any progression entry, suggested load, deload banner, or Pro note. The app keeps sending `?fields=core`.
- **21h:** gym, library, and plan screens. Adding a gym or a custom exercise stays on the web.
- **Shipped in 21e:** missed-day resolution, the gym choice at Start, bodyweight reps-only entry. Regression coverage only.
- No change to any web page, server action, write rule, progression code, or schema. No plan (template) write from the phone.
- No deletion of a logged set, cardio record, or anything else.

## 4. Core concepts

| Concept | Description |
| --- | --- |
| Workout gym | Every `LoggedExercise` of a workout carries the same `gymId`, set at Start. `changeGym` rewrites it on all of them, and only while the workout has no `LoggedSet` (`WorkoutDto.gymLocked` false). A saved set is never re-attached to another gym. |
| Performed vs planned exercise | `LoggedExercise.exerciseId` (performed) and `plannedExerciseId`. A swap writes only the performed id, only before the exercise's first set, only in an in-progress workout. `Session` and `SessionExercise` are never written while logging. |
| Not done | `LoggedExercise.skippedAt`. Set by the lifter (only with no sets), cleared by Undo or by a swap, and set by `completeWorkout` on untouched exercises. A fact; no set is created. |
| RIR | `LoggedSet.rir`: an integer 0–4 (4 means "4 or more") or NULL ("not recorded", never 0). The scale and wording are `@overload/shared/logging/rir`. |
| Extra set | A set numbered above `plannedSets`. Allowed only once every planned set is saved, in sequence, at most `MAX_EXTRA_SETS` (10). Recorded and shown; never read by progression, goals, or baselines. |
| Set correction | `editLoggedSet`: weight, reps, and RIR of one existing row, by its id. Never its exercise, gym, set number, or date. Allowed in any workout state. Never replays a gym baseline. |
| Planned-set snapshot | `LoggedExercise.plannedSets`, copied from the plan at Start. `editPlannedSets` may only lower it (≥ 1), on this occurrence only. |
| Cardio occurrence | One planned cardio day of the active block, keyed `(mesocycleId, scheduledFor)` where `scheduledFor` is its authored date. `logCardio` records type and whole minutes once; a repeat returns the existing record unchanged with `alreadyLogged: true`. |
| Weight context | Unchanged (Prescription-Aware Intelligence): the server decides `trusted` / `reference_only` / `none` per card, scoped to the workout's gym for machines and cables. After a gym change or a swap the phone refetches the workout and renders the new answer. |

## 5. States and lifecycle

No new state or transition. The existing rules, which the endpoints surface unchanged:

| Action | Allowed when | Otherwise |
| --- | --- | --- |
| Change gym (E8) | no set in the workout | 400 `invalid_state_transition` "The gym is locked once sets are logged." |
| Swap (E10) | workout in progress and no set on the exercise | 400 `invalid_state_transition` ("This workout is already finished." / "Sets are logged — this exercise is locked.") |
| Skip (E11, `skipped: true`) | workout in progress and no set on the exercise | 400 `invalid_state_transition` |
| Undo skip (E11, `skipped: false`) | workout in progress | 400 `invalid_state_transition` |
| Log a set with RIR, or an extra set (E3, existing) | workout in progress, exercise not skipped, set number in range | as 21e |
| Correct a set (E12) | always (in progress or complete) | — |
| Lower planned sets (E13) | always; the new count is 1..current | 400 `validation_error` |
| Log cardio (E14) | the block is active, the day is a planned cardio occurrence that was not shifted away, and it is today or earlier | 404 `not_found` (no such planned day, or another account's block) / 400 `invalid_state_transition` |
| Correct cardio (E15) | always | — |

Client view states per write: `idle → sending → confirmed | failed(network) | refused(server message)`. Only `confirmed` (a 200) changes what the screen shows as saved.

## 6. Mobile API contract

All under `/api/mobile/v1`, built with `mobileRoute` (version gate → `getUser(token)` → no-create account → suspension → last-active → per-account rate limit → handler → JSON or the error envelope). Every endpoint is **Free**. `Cache-Control: no-store` on every answer. Adapters live in a new `apps/web/src/lib/api/mobile/logging.ts`, beside `workouts.ts`, and check only a request's shape; every value rule stays in the module both clients call.

| # | Method + path | Wraps | Request | 200 response | Retry safety | Errors |
| --- | --- | --- | --- | --- | --- | --- |
| E8 | `PUT /workouts/{loggedSessionId}/gym` | `changeGym` | `ChangeGymRequest` `{ gymId }` | `ChangeGymResponseDto` `{ loggedSessionId, gymId }` | absolute value: the same gym again writes the same value | 400 `validation_error` (`details.gymId`: not a string, missing, archived, or another account's gym); 400 `invalid_state_transition`; 404 `not_found` |
| E9 | `GET /logged-exercises/{loggedExerciseId}/swap-candidates?muscle=` | `getSwapContext` | `muscle` optional; an unknown value falls back to the planned group (the web's rule) | `SwapContextDto` | read | 404 `not_found` |
| E10 | `PUT /logged-exercises/{loggedExerciseId}/exercise` | `swapExercise` | `SwapExerciseRequest` `{ newExerciseId }` | `SwapExerciseResponseDto` `{ loggedExerciseId, exerciseId }` | absolute value | 400 `validation_error` (`details.newExerciseId` for a non-string; "That exercise isn't available." for a missing, archived, or another account's exercise); 400 `invalid_state_transition`; 404 `not_found` |
| E11 | `PUT /logged-exercises/{loggedExerciseId}/skipped` | `setExerciseSkipped` | `SetSkippedRequest` `{ skipped }` | `SetSkippedResponseDto` `{ loggedExerciseId, skipped }` | absolute value; a repeated skip keeps the first timestamp (RD-3) | 400 `validation_error` (`details.skipped`: not a boolean); 400 `invalid_state_transition`; 404 `not_found` |
| E12 | `PATCH /sets/{loggedSetId}` | `editLoggedSetAndReconcile` | `EditLoggedSetRequest` `{ weightLbs?, reps, rir? }` | `LoggedSetDto` | absolute values: an identical repeat stores the same values | 400 `validation_error` (`details.weightLbs` / `reps` / `rir`); 404 `not_found` |
| E13 | `PATCH /logged-exercises/{loggedExerciseId}/planned-sets` | `editPlannedSetsAndReconcile` | `EditPlannedSetsRequest` `{ plannedSets }` | `EditPlannedSetsResponseDto` `{ loggedExerciseId, plannedSets }` | absolute value; the same count again is the module's no-op | 400 `validation_error` (not a whole number ≥ 1, or above the current count); 404 `not_found` |
| E14 | `PUT /mesocycles/{mesocycleId}/cardio-logs/{scheduledFor}` | `logCardio` | `LogCardioRequest` `{ type, durationMin }` | `LogCardioResponseDto` `{ cardioLogId, alreadyLogged }` | natural key `(mesocycleId, scheduledFor)`: a repeat returns the stored record, unchanged, with `alreadyLogged: true` | 400 `validation_error` (`details.type` / `durationMin`, or a bad date); 400 `invalid_state_transition`; 404 `not_found` |
| E15 | `PATCH /cardio-logs/{cardioLogId}` | `editCardioLog` | `EditCardioLogRequest` `{ type, durationMin }` | `EditCardioLogResponseDto` `{ cardioLogId }` | absolute values | 400 `validation_error`; 404 `not_found` |

**Bodies** are read with `readJsonObject` (≤ 4 KiB, `WORKOUT_BODY_LIMIT`). Shape checks in the adapter: E8 `gymId` string; E10 `newExerciseId` string; E11 `skipped` boolean. E12, E13, E14, and E15 pass their values to the module as sent, because the module's own rules refuse anything that is not a real number or usable text with the web's message in `details`. Unknown fields are ignored. No field names an account.

**E12 and `rir`.** `rir` absent leaves the stored value; `null` clears it; 0–4 sets it (`EditLoggedSetInput`, unchanged). The adapter passes `rir` only when the body has the key, so an absent key can never become `null`.

**E13's answer** reports the stored count after the call (the requested count on success).

**Path parameters** go to the modules as strings; their `isUuid` checks turn a malformed id into `not_found`. E14's `scheduledFor` is parsed by the module (`parseIsoDate`).

**New shared types** (`packages/shared/src/contracts/logging.ts` and `cardio.ts`, additive):

```ts
/** `PUT /workouts/{loggedSessionId}/gym`. */
export type ChangeGymResponseDto = { loggedSessionId: string; gymId: string };
/** `PUT /logged-exercises/{loggedExerciseId}/exercise`: the performed exercise now. */
export type SwapExerciseResponseDto = { loggedExerciseId: string; exerciseId: string };
/** `PUT /logged-exercises/{loggedExerciseId}/skipped`. */
export type SetSkippedResponseDto = { loggedExerciseId: string; skipped: boolean };
/** `PATCH /logged-exercises/{loggedExerciseId}/planned-sets`. */
export type EditPlannedSetsResponseDto = { loggedExerciseId: string; plannedSets: number };
/** `PUT /mesocycles/{mesocycleId}/cardio-logs/{scheduledFor}`. */
export type LogCardioResponseDto = { cardioLogId: string; alreadyLogged: boolean };
/** `PATCH /cardio-logs/{cardioLogId}`. */
export type EditCardioLogResponseDto = { cardioLogId: string };
```

The request types (`ChangeGymRequest`, `SwapExerciseRequest`, `SetSkippedRequest`, `EditLoggedSetRequest`, `EditPlannedSetsRequest`, `LogCardioRequest`, `EditCardioLogRequest`) and `SwapContextDto`, `LoggedSetDto` already exist from 21b.

**Backward compatibility.** All eight endpoints are new. No v1 response changes shape and no existing endpoint changes behavior for a client that exists (E3 already accepted `rir` and extra set numbers). `MOBILE_MIN_APP_VERSION` is not raised. The 21e app keeps working against a server with 21f; the 21f app needs a server with 21f (staging after the merge).

**Rate limit.** The existing 120 requests per account per minute is not changed. The swap picker makes one read per muscle-group change.

## 7. UI integration

### Screen → endpoint map

| Screen (design §6, §15) | Route (`apps/mobile/src/app`) | Reads | Writes |
| --- | --- | --- | --- |
| T1 Today | `(tabs)/today/index.tsx` | `GET /today` | opens C1 |
| W1 Workout | `workout/[loggedSessionId]/index.tsx` | `GET /workouts/{id}`, `GET /gyms` (Change gym) | E3 (with `rir`, extras), E8, E11, E13 |
| X1 Swap | `workout/[loggedSessionId]/swap.tsx` (`loggedExerciseId`) | E9 | E10 |
| E1 Edit set | `workout/[loggedSessionId]/edit-set.tsx` (`loggedSetId`, `from`) | the cached workout (`from=workout`) or logged workout (`from=history`) | E12 |
| C1 Cardio | `cardio.tsx` (occurrence parameters) | — | E14, E15 |
| H1 History | `(tabs)/history/index.tsx` | `GET /history?week=` | opens C1 |
| H2 Logged workout | `(tabs)/history/[loggedSessionId].tsx` | `GET /history/{id}` | E13; opens E1 |

`RootNavigator` registers the three modal routes inside the signed-in group with `presentation: "modal"` and the themed header. Each modal sets its own header buttons (Cancel; Save where there is one).

### Data layer (`apps/mobile/src/api/training.ts`, extended)

| Hook | Request | On the 200 |
| --- | --- | --- |
| `useChangeGym` | E8 | refetch `["workout", id]` and wait for it; mark Today and History stale |
| `useSwapCandidates(loggedExerciseId, muscle)` | E9, key `["swap", id, muscle ?? "planned"]`, `staleTime` 60 s, previous list kept while the next loads | — |
| `useSwapExercise` | E10 | refetch and wait for `["workout", id]`; remove `["swap", id]`; mark the rest stale |
| `useSetSkipped` | E11 | write `skipped` into the cached card, then refetch `["workout", id]`; mark the rest stale |
| `useLogSet` (existing) | E3, now with `rir` | as 21e |
| `useEditSet` | E12 | merge the returned `LoggedSetDto` into `["workout", id]` and `["history-workout", id]`; mark Today, History, and both stale |
| `useEditPlannedSets` | E13 | refetch `["workout", id]` and `["history-workout", id]`; mark the rest stale |
| `useLogCardio`, `useEditCardio` | E14, E15 | invalidate `["today"]` and `["history-week"]` |

Mutations never auto-retry (the 21d default). Every key is removed by `clearAccountQueries` on sign-out.

### Pure models (no I/O, unit-tested)

```ts
// apps/mobile/src/workout/card-model.ts (extended)
/** The set with inputs: planned first, then the pending extra row (shared activeSetNumber). */
export function cardActiveSet(card: ExerciseCardDto, pendingExtra?: number | null): number | null;
/** The next extra set number once every planned set is saved, else null. */
export function nextExtraSetNumber(card: ExerciseCardDto): number | null;
/** Saved planned (non-extra) sets. */
export function savedWorkingSets(card: ExerciseCardDto): number;

// apps/mobile/src/workout/exercise-actions.ts (new)
export type ExerciseAction = "swap" | "skip" | "fewer_sets";
/** The More rows the server's state allows for this card, and the sheet's message. */
export function exerciseActions(card: ExerciseCardDto, workout: WorkoutDto): { actions: ExerciseAction[]; message: string | null };
/** The fewer-sets confirmation, or null when it doesn't apply (no saved set, or none short). */
export function fewerSetsConfirmation(e: { name: string; plannedSets: number; savedWorkingSets: number }): { title: string; message: string; confirm: string; plannedSets: number } | null;

// apps/mobile/src/workout/edit-set-model.ts (new)
export type EditableSet = { loggedSetId: string; setNumber: number; exerciseName: string; requiresExternalWeight: boolean; weightLbs: number | null; reps: number; rir: number | null; dateIso: string | null };
export function findEditableSet(source: WorkoutDto | LoggedWorkoutDetailDto, loggedSetId: string): EditableSet | null;
/** The PATCH body: weight only for a weighted lift; `rir` only when it changed. */
export function editSetBody(original: EditableSet, draft: { weightLbs: number | null; reps: number; rir: number | null }): EditLoggedSetRequest;

// apps/mobile/src/cardio/cardio-model.ts (new)
export type CardioTarget = { mesocycleId: string; scheduledFor: string } | { cardioLogId: string };
/** Today's and History's rows from the server's entries; what each row can do. */
export function cardioRowAction(entry: Pick<CardioOccurrenceDto, "state" | "log">): "log" | "edit" | null;
```

None contains a training rule: `exerciseActions` reads only `workout.status`, `card.skipped`, `card.performedArchived`, and whether a row is saved, which are the server's facts; the server still decides every write.

### Forms and validation (client pre-check, then the server)

| Field | Keyboard | Pre-check | Server |
| --- | --- | --- | --- |
| Card and E1 weight | `decimal-pad` | `checkWeightLbs(parseWeightText(text))` | `checkWeightLbs` |
| Card and E1 reps | `number-pad` | `checkLoggedReps(parseRepsText(text))` | `checkLoggedReps` |
| RIR | chips from `RIR_VALUES` | none needed | `isRir` |
| C1 activity, minutes | default; `number-pad` | `parseCardioEntry` | `parseCardioEntry` |

### Interaction details

- **Keyboard.** The card's inputs, keypad bars, Done, and `useKeepAboveKeyboard` are unchanged (21e RD-29, RD-30). The RIR row is inside the active row's measured view, so the hook keeps it above the keyboard. Every control that opens a sheet or modal calls `Keyboard.dismiss()` first. The modals use no `InputAccessoryView`: their actions are header buttons (RD-13).
- **More.** `ActionSheetIOS.showActionSheetWithOptions` with the exercise name as title and the lock reason as message.
- **Change gym.** `useFetchGyms`, then the 21e `pickGymFromSheet` with the current gym's name marked "(current)".
- **Confirmation P1.** `Alert.alert`.
- **Haptics.** `haptic.light` on each confirmed write here; `haptic.warning` on a refusal or failure.
- **Repeated taps.** Each control is disabled while its mutation is pending, and the modals guard Save synchronously as Finish does.

### Client scope and platform impact

Mobile UI plus additive mobile API endpoints in `apps/web`. Shared logic is reused, never copied: `RIR_VALUES`, `formatRir`, `rirAccessibleName`, `rirSpoken`, `rirSuffix`, `activeSetNumber`, `offerFor`, `loggedRowLabel`, `checkWeightLbs`, `checkLoggedReps`, `formatRepTarget`, `parseCardioEntry`, `CARDIO_TYPE_SUGGESTIONS`, `MUSCLE_GROUPS`, `MUSCLE_GROUP_LABELS`. No web UI change.

### User guidance

None (design §13): no tour step and no release-note entry.

## 8. Data model

**No schema change and no migration.** No new owned model, so no RLS statement, scope registration, deletion, or export change. Retry safety rests on absolute writes and on the existing unique keys `LoggedSet(loggedExerciseId, setNumber)` and `CardioLog(mesocycleId, scheduledFor)`. The `ApiIdempotencyKey` table is not used: none of these is a create without a natural key.

| Field / concept | Stored? | Computed from |
| --- | --- | --- |
| Which More actions a card offers | no | the workout read |
| Weight context after a gym change or swap | no | the server's card read |
| Progression tags, e1RM, trends after a correction | no | the logged sets, on the next read |
| `GymExerciseBaseline` | yes | written only by `applyBaselineOnCompletion` in a set's transaction; **not** touched by any 21f endpoint except through E3's existing path |

## 9. Authorization and access control

- Every endpoint is `mobileRoute`: the account is the verified token's; a suspended account gets 403 before any read.
- Every read and write goes through account-scoped lib functions on `account.db`. Another account's workout, logged exercise, logged set, block, cardio log, gym, or custom exercise behaves exactly like a missing one: 404 `not_found` (or, for a gym or exercise named in a body, the same "isn't available" validation message as a missing one), and nothing of the other account's is changed or revealed.
- Route files import only modules the static guards allow; no handler names an account id.
- Free: no capability check on any of the eight. No handler calls a progression builder. `logSetAndReconcile`, `editLoggedSetAndReconcile`, and `editPlannedSetsAndReconcile` stay the only callers of goal reconciliation after a write.
- `LoggedSet` rows are written only by `logged-sets.ts` (`logSet`, `editLoggedSet`); no adapter or route touches `loggedSet` directly.

## 10. Validation rules

| Input | Validation | Error |
| --- | --- | --- |
| E8 `gymId` | string; then `requireActiveGym` | `validation_error` (`details.gymId`) |
| E9 `muscle` | any string; unknown → the planned group | — |
| E10 `newExerciseId` | string; then an active exercise the account can see | `validation_error` |
| E11 `skipped` | boolean | `validation_error` (`details.skipped`) |
| E12 `weightLbs`, `reps`, `rir` | the module's `validateValues` against the performed exercise's loading mode | `validation_error` (`details.*`) |
| E13 `plannedSets` | whole number, 1..current | `validation_error` |
| E14, E15 `type`, `durationMin` | `parseCardioEntry` (trimmed text 1–40; whole minutes 1–600) | `validation_error` (`details.type`, `details.durationMin`) |
| Any body | JSON object, ≤ 4 KiB | `validation_error` |

No new limit is introduced.

## 11. Development-only test accounts

The owner tests each capability on its own disposable `overload-dev` account. Two changes make that one command per account.

**Demo seed variants (`apps/web/scripts/demo`).** `executeDemoSeed(account, anchorIso, variant)` and `inspectDemoTarget(account, variant)` take a variant; `standard` is today's fixture, byte for byte in what it writes.

| Variant | Differs from `standard` | Gives the tester |
| --- | --- | --- |
| `standard` | — | Upper A ready today; two gyms; 32 finished workouts; a cable lift (lat pulldown) never done at Riverside |
| `gym` | The split is ordered so **Upper B** is today; a third gym, "Harbor Barbell", with no history | Today's machines have different last weights at Northside and Riverside, a dumbbell lift that is the same at both, and a gym where both machines are a first time |
| `bodyweight` | Upper A is Barbell Bench Press 3 × 6–8, **Pullups** 3 × 8–10 (bodyweight), Incline Dumbbell Press **3 × 10** (fixed target), **Crunches** 3 × 15 (bodyweight, abs, fixed target), each with eight weeks of history | Bodyweight, abs, and fixed-target lifts in today's workout with real last-time lines |
| `cardio` | Planned cardio in the active block on Upper A's weekday (Incline Walk, 20 min) and on a rest day (Bike, 30 min), planned with the block; past weeks logged, one left missed, one longer than planned | Cardio beside today's lifting, a cardio-only day two days later, and cardio history |

All variants write through the same application modules in one transaction; nothing derived is stored. Planned cardio's creation date is set to the block's start, the same single timestamp adjustment the QA fixture makes, because a cardio occurrence exists only from its plan row's creation date. `DemoCounts` gains `plannedCardio` and `cardioLogs` so a re-run recognizes its own fixture.

**`npm run dev:test-account` (`apps/web/scripts/dev-test-account`).** One command that provisions an account and seeds it:

```text
npm run dev:test-account -- --email <addr> --profile <standard|gym|bodyweight|cardio|missed> \
  --confirm-ref vdxrmfadikwzodjljbdi [--username <name>] [--execute]
```

- Guards, before any connection: the provisioning tool's own target guard (the development project only; Production refused with no override; the service-role key must belong to that project), the database identity marker, and the QA fixture's reserved-test-domain rule for the email.
- Reuses `executeProvision` (a confirmed auth user, its profile, comp Pro) and `executeDemoSeed`. It adds no write path of its own.
- A profile is a seed variant plus an anchor: `missed` is `standard` anchored to **yesterday** in the account's time zone, so Upper A is a real missed day and Lower A waits. Every other profile is anchored to **today** in the account's time zone, read when the command runs.
- Dry run by default. With `--execute`: an account that doesn't exist is created and seeded; an existing empty account is seeded; an account already holding that fixture is left alone; an account holding anything else is refused. It never edits, merges, resets, or deletes.
- The generated password goes only to `~/.overload-dev/accounts/<email>.txt` (owner-only, never overwritten, never printed). The command prints the account id, profile, anchor, counts, and that file's path.
- There is no cleanup command: the repository's only deletion paths are an account deleting itself and the QA fixture reset for its one designated account, and this tool adds none.

## 12. Testing strategy

### API isolation — `apps/web/tests/integration/isolation/mobile-api.int.test.ts` (extended)

Every new registry entry gets the authentication, suspension, and version matrix, and:

```text
E8   GIVEN A's workout          WHEN B changes its gym (to B's gym)      THEN 404; A's logged exercises keep A's gym
     GIVEN A's workout          WHEN A names B's gym                      THEN 400 validation_error identical to a missing gym; unchanged
E9   GIVEN A's logged exercise  WHEN B reads swap candidates              THEN 404
     GIVEN B's custom exercise  WHEN A reads candidates for its muscle    THEN it is not listed; A's own custom exercise is
E10  GIVEN A's logged exercise  WHEN B swaps it                           THEN 404; unchanged
     GIVEN B's custom exercise  WHEN A swaps to it                        THEN 400 identical to a missing exercise; unchanged
E11  GIVEN A's logged exercise  WHEN B skips it                           THEN 404; skippedAt still null
E12  GIVEN A's logged set       WHEN B edits it                           THEN 404; weight, reps, rir, updatedAt unchanged
E13  GIVEN A's logged exercise  WHEN B lowers its planned sets            THEN 404; unchanged
E14  GIVEN A's planned cardio   WHEN B logs it (A's block id and date)    THEN 404 identical to a missing block; no CardioLog for A or B
E15  GIVEN A's cardio log       WHEN B edits it                           THEN 404; unchanged
An account id in any body is ignored. Free accounts can call all eight.
```

### API behavior — `apps/web/tests/integration/mobile-logging-completeness.int.test.ts` (new)

```text
Gym          change before any set → 200, every LoggedExercise has the new gym, GET workout shows it
             the same gym again → 200, unchanged; after a set → 400 invalid_state_transition, gyms unchanged
             a machine with history at gym 1 only: started at gym 2 → weightContext "none"/first-time; after E8 to gym 1 → "trusted" with gym 1's weight
             first set of a machine at a new gym establishes that gym's baseline row; the other gym's row is byte-identical before and after
             a free-weight lift gets no baseline row at either gym
Swap         candidates open on the planned group; ?muscle=back lists Back; an unknown muscle falls back; favorites first; the performed exercise is excluded
             swap → exerciseId changes, plannedExerciseId and the SessionExercise are unchanged; GET workout shows swapped true and "Swapped from"
             the same swap again → 200, same row; after a set → 400; on a finished workout → 400; to an archived exercise → 400
             a swap clears skippedAt
Skip         skip → skippedAt set, no LoggedSet created; skip again → 200 and skippedAt is the SAME instant; undo → null; logging a set while skipped → 400
             skip with a set logged → 400; on a finished workout → 400; finish with one skipped and one logged → complete
RIR          E3 with rir 2 → stored 2; omitted → NULL (not 0); rir 0 → stored 0; rir 5, 1.5, "2" → 400 details.rir and no row
             identical re-send including rir → the same row; the same numbers with a different rir → 409
Extra sets   set 4 of 3 before set 3 → 400 details.setNumber; after all three → 200 and extra true in the workout read; the 11th extra → 400
Edit         E12 weight and reps → same id, loggedExerciseId, setNumber, createdAt; updatedAt moves; row count unchanged
             rir absent → stored rir kept; rir null → cleared; rir 3 → set; a bodyweight set with a weight → 400; without → 200 and weight stays NULL
             identical PATCH twice → identical stored values, one row
             on a COMPLETE workout → 200; the workout stays complete; completedAt unchanged
             no baseline replay: edit a set of a machine exercise whose baseline exists → the GymExerciseBaseline row is byte-identical
             derived values follow: the History detail and the next occurrence's last-time line read the corrected numbers on the next read
             an unknown or malformed id → 404
Planned sets lower 3 → 2 with 2 sets logged → 200, plannedSets 2, both LoggedSets intact, the SessionExercise still 3
             2 → 2 → 200 no-op; 2 → 3 → 400; 0, 1.5, "2" → 400; a later Start of the same session copies 3 again
             lower below the logged count (3 logged, set 1) → the third set reads extra, and no row is deleted
Cardio       E14 on today's planned day → 200 alreadyLogged false; Today and the History week show it complete with its values
             the same PUT again, and with different values → 200 alreadyLogged true, the stored record unchanged, one row
             a day with no planned cardio, a future day, a bad date, a draft block → refused, no row
             type "", 41 characters, minutes 0, 1.5, 601 → 400 with details; E15 corrects type and minutes, keeps the plan snapshot and dates
             cardio never changes the dashboard kind, creates no LoggedSession, and no progression read includes it
Bodyweight   a bodyweight exercise logs reps only (NULL weight) through E3 and corrects through E12; a weight is refused
Fixed target a 3 × 10 exercise reads plannedRepRange {10,10} and logs like any other
Regression   the 21e loop file and the missed-day file stay green unchanged
```

### Static guards and contracts

`tests/unit/mobile-api-guards.test.ts`: the registry lists exactly the eight new route methods; each is `mobileRoute`; none imports a forbidden module or names an account id. `tests/unit/mobile-contracts.test.ts`: the six new response types are JSON-safe. The existing guard that only `logged-sets.ts` writes a `LoggedSet` covers the new adapter file.

### Web unit

`setExerciseSkipped` replay keeps the timestamp (covered in the integration file). Demo seed: each variant seeds an empty account, re-inspects as seeded, stays under the statement budget, and `standard` writes exactly what it did before (`tests/integration/demo-seed.int.test.ts`). `dev:test-account`: argument parsing, profile → variant and anchor, the reserved-domain and target guards, and the credentials path (`tests/unit/dev-test-account.test.ts`).

### Mobile (`apps/mobile/tests`)

```text
exercise-actions   no set → swap + skip; a set saved, short → fewer_sets only, with the lock message; all saved → none; finished → none
                   fewerSetsConfirmation: count = saved working sets; null with none saved or none short
card (RIR)         chips render 0 1 2 3 4+; tap selects, tap again clears; Log set sends rir; untouched sends no rir; the next set starts unselected
                   a chip press never blurs the focused input; a saved row reads "· 2 RIR" and "2 reps in reserve"
card (extras)      Add set appears only when every planned set is saved; it adds "Set 4 · extra" with inputs; saving sends setNumber 4
card (skip/undo)   More ▸ Didn't do → PUT skipped true → the not-done card; Undo → PUT false → rows back; a failure keeps the card and shows the message
card (unavailable) Swap exercise opens X1; Didn't do works
gym                Change gym shows while not locked; one gym → the note; choosing → PUT gym then the workout refetches; hidden once a set is saved
swap               opens on the planned chip; another chip refetches with ?muscle=; search filters; empty group and no-match states; a row → PUT exercise → back
                   Cancel sends nothing; a failed swap keeps the list and search; locked state
edit set           opens on stored values from the workout and from history; Save disabled until changed; PATCH body omits rir unless changed; null when cleared
                   bodyweight: no weight field and no weightLbs sent; a network failure keeps the typed values and the modal; a retry sends the same body once
                   the corrected row shows the server's values in the card and in H2
fewer sets         the alert names the count; confirm → PATCH planned-sets; the card reads "All 2 sets logged."; Cancel sends nothing
cardio             Today row Log → C1 prefilled from the plan → PUT; alreadyLogged → the alert; logged row → C1 prefilled from the record → PATCH
                   validation messages under their fields; a failure keeps the form; History rows: logged → edit, missed/today → log, upcoming → inert
keyboard           (extends keyboard-and-next) after opening and closing More, the edit modal, and the swap modal, every input still has its own keypad bar
                   with pointerEvents none on its placeholder; after Next → Previous → Next the RIR row and inputs of each card mount fresh
                   the active row (with RIR) is the measured row kept above the keyboard
regression         the 21e suites (today, workout, completion-sync, history, navigation) stay green
```

### Unverified by a run (owner checks)

Everything on a simulator or a physical iPhone: the action sheets, modal presentation and dismissal, keyboard behavior around the RIR row and after each modal, VoiceOver, Dynamic Type, haptics, light and dark on a device, and receiving the staging update. The runbook lists them.

## 13. Acceptance criteria

**API**
- [ ] E8–E15 exist, are in the registry, pass the static guards, and each has isolation cases.
- [ ] Each write repeated leaves the same stored state and one row.
- [ ] A swap never writes `plannedExerciseId`, `Session`, or `SessionExercise`; lowering planned sets never writes `SessionExercise` or deletes a set.
- [ ] A correction keeps the set's identity and associations, is allowed on a finished workout, and leaves every `GymExerciseBaseline` row untouched.
- [ ] A first machine set at another gym touches only that gym's baseline row.
- [ ] RIR omitted is NULL, never 0.
- [ ] Cardio logged twice is one record.
- [ ] A Free account can call all eight; no response carries a Pro result that the gated readers would withhold.
- [ ] No web page, action, schema, or migration changed; `setExerciseSkipped` is the only module change, and the full web suite stays green.

**Mobile**
- [ ] The gym can be changed before the first set; after it, the control is gone and the gym still shows.
- [ ] Swap, skip, undo, RIR, Add set, correction, fewer sets, and cardio each work from the screens in design §6 and show as done only after the server's 200.
- [ ] A failed write keeps what was typed and can be retried.
- [ ] Bodyweight lifts never show or send a weight; a fixed target prints as one number.
- [ ] The 21e keyboard behavior holds on every card after any modal or sheet.
- [ ] No new native dependency; `apps/mobile/package.json` and `app.config.ts` are unchanged; the runtime fingerprint is unchanged.
- [ ] Mobile lint, typecheck, and tests pass.

**Tooling**
- [ ] `dev:test-account` creates each profile on `overload-dev`, refuses Production and any non-test email, and never prints a password.

**Device (owner)**
- [ ] The runbook's iPhone checklist passes on the staging update.

## 14. Explicit non-goals

- ❌ A second progression engine, or any training rule on the phone. **Permanent.**
- ❌ Offline logging, a local queue, background sync. **Permanent.**
- ❌ Deleting a logged set or a cardio record. **Permanent** (no delete exists).
- ❌ Raising a workout's planned-set count, or editing the plan from the workout. **Not built**: the web has no such action; more than planned is an extra set.
- ❌ Changing a saved set's exercise, gym, set number, or date. **Permanent** for corrections.
- ❌ Cardio metrics beyond type and minutes. **Permanent** until a pitch decides otherwise.
- ❌ Progression calls, evidence, the deload banner, the Pro note. **Deferred** to 21g.
- ❌ Gym, library, and plan management on the phone. **Deferred** to 21h.
- ❌ A purchase or upgrade flow in the app. **Deferred** to the store pitches.

## Resolved Decisions

Authority order: the approved planning docs, `CLAUDE.md` and the skills, existing code, then judgment. "Run prompt §4.x" is the owner's pre-resolved guidance in the 21f run prompt, treated as approved doc authority.

| # | Decision | Rationale | Authority |
| --- | --- | --- | --- |
| RD-1 | Eight endpoints (E8–E15) at the paths in §6: the audit's "complete workout" table minus the missed-day endpoint that shipped in 21e, and the request types 21b already named. | The audit inventoried them and the shared request contracts already carry these paths. | `mobile-audit.md` §2; `contracts/requests.ts` (pitch Q11) |
| RD-2 | Each endpoint wraps the existing module unchanged. No schema, migration, or web UI change. | One backend, one training model; the modules already enforce every state rule. | CLAUDE.md mobile rules; run prompt §4.1 |
| RD-3 | `setExerciseSkipped` keeps the existing `skippedAt` when the exercise is already skipped. It is the only module change. | The audit asks for it ("keep the existing timestamp") so a retried skip is a true no-op. The web's own behavior is otherwise identical: the web UI never offers Skip on a skipped card. | `mobile-audit.md` §2; CLAUDE.md "safe to retry" |
| RD-4 | Retry safety is absolute values and natural keys. No `Idempotency-Key` on any of the eight. | CLAUDE.md lists absolute edits and cardio logging as natural-key writes; none is a create without a key. | CLAUDE.md mobile API rules |
| RD-5 | **Gym (pitch Q3).** The gym is chosen at Start (21e) and can be changed from the workout only while no set is saved, through the same action sheet. After the first set it is locked: the control is removed, and the gym stays in the progress line and on each machine and cable card. | That is `changeGym`'s rule and the web runner's behavior. It is what protects logged sets and baselines: nothing saved is ever re-attached, and a baseline is only written by a set at the gym it was logged at. Gym management stays 21h. | `sessions.ts` `changeGym`; web `WorkoutRunner`; run prompt §4.2 |
| RD-6 | **Swap (pitch Q4, Q5).** The picker opens on the planned exercise's muscle group and can list any group. A swap is allowed before the exercise's first set in an in-progress workout, can be repeated (swap again) until then, and writes only the performed exercise. | The current web behavior since Workout Logging Refinements, which CLAUDE.md records as superseding the PRD's same-muscle rule. | CLAUDE.md "Planned versus logged"; `swapExercise`; run prompt §4.3 |
| RD-7 | **Skip (pitch Q5).** "Didn't do this exercise" is offered only with no sets saved, behind More; Undo is on the not-done card while the workout is in progress. A partly logged exercise cannot be skipped; finishing records untouched exercises as not done. No confirmation alert. | The web's rules exactly. More then the row is two deliberate taps, the action is reversible, and Overload confirms only what cannot be undone. | `setExerciseSkipped`; web `ExerciseCard`; design principles |
| RD-8 | **RIR (pitch Q1).** Integers 0–4, shown `0 1 2 3 4+`; optional; nothing selected by default; never carried to the next set; an untouched choice sends no `rir` (stored NULL, never 0). | The shared scale and the web card's behavior (RIR Logging R3, R4, R23). | `@overload/shared/logging/rir`; web `ExerciseCard` |
| RD-9 | **RIR display and edit (pitch Q2).** A saved set shows its RIR on the card and in History; it can be changed or cleared in Edit set, in progress or after completion. Save sends `rir` only when it changed. | The web's `EditSetDialog` rule, which exists so a weight correction can never erase a stored RIR. | web `EditSetDialog`; `EditLoggedSetInput` |
| RD-10 | **Corrections (pitch Q7).** Any saved set of any of the account's workouts can be corrected, from the card and from the logged workout. Values only. The record's id, exercise, gym, set number, and dates never change, nothing is deleted or recreated, and no baseline is replayed. | `editLoggedSet`'s contract and CLAUDE.md's second invariant. | CLAUDE.md; `logged-sets.ts`; run prompt §4.4 |
| RD-11 | **Planned-set count (pitch Q6).** Two existing, occurrence-scoped mechanisms, and nothing else: *more than planned* is **Add set** (an extra set, recorded and labelled, never counted by progression); *fewer than planned* is `editPlannedSets`, which only lowers this occurrence's snapshot. The web has no action in logging that changes the plan, so the phone has none. | The module's own documentation: raising the snapshot "would re-interpret the day upward and silently reclassify extra sets as working ones". | `sessions.ts` `editPlannedSets`; `logged-sets.ts` `isAllowedSetNumber`; run prompt §4.6 |
| RD-12 | The phone offers the fewer-sets correction only when at least one planned set is saved and fewer are saved than planned, and always to exactly the saved working count, behind one confirmation that says it cannot be raised again. It is offered on the card (More) and in the logged workout. | The web offers it under the same condition and defaults to that count. Fixing the number to what was logged means the phone can never reclassify a working set as extra; the server's wider rule is unchanged. Offering it during the workout is allowed by the module (no status rule) and is what the pitch §5.6 asks for. | web history page and `EditPlannedSetsDialog`; pitch §5.6 |
| RD-13 | Swap, Edit set, and Cardio are native modal routes on the root stack with header Cancel and Save. No `InputAccessoryView` in them. No new native dependency; `apps/mobile/package.json`, `app.config.ts`, and `packages/shared/src/design/tokens.ts` are not edited, so the runtime fingerprint is unchanged and the slice ships as a staging update. | Header actions can't be covered by the keyboard, which avoids repeating the 21e device defects. Any native change would strand the installed build. | 21e RD-17, RD-29, RD-30; run prompt §4.10 |
| RD-14 | **Card density (pitch Q10).** Weight, reps, and Log set are untouched; RIR is one optional row inside the active set; swap, skip, and fewer sets sit behind one More button; a saved row is the tap target for its own correction; Add set appears only after the planned sets. | The fast path must not get longer. | design §2; `overload-mobile-ui` |
| RD-15 | **Bodyweight and fixed targets (pitch Q8).** No new rule. A bodyweight lift (equipment `bodyweight`, which includes the library's abs movements) logs and corrects reps only and never sends a weight; a single target prints through `formatRepTarget` as one number. This slice adds the reps-only correction and tests. | The Workout Logging Refinements audit found bodyweight and abs compliant; 21e RD-22 shipped reps-only entry. | `loading-mode.ts`; `rep-target.ts`; 21e RD-22 |
| RD-16 | **Cardio (pitch Q9).** Cardio never changes the day's lifting state and is never needed to finish a workout. It is logged from Today (a row beside lifting, the focal block on a cardio-only day) and from History (today's and missed rows), and corrected from either. A repeat is "Already logged", shown as an alert, and never overwrites. | Cardio Logging's rules (R24, R34, R66) and the web's dashboard. | `cardio-logs.ts`; web `CardioCards`, `CardioFocal`; run prompt §4.8 |
| RD-17 | **Missed days (pitch §5.8, Q12).** No change. The 21e implementation is kept as is and covered by its existing tests plus the checklist. | Shipped and accepted on the iPhone in 21e. | 21e RD-23; run prompt §4.9 |
| RD-18 | **Already delivered by 21e (pitch Q12):** the gym choice at Start, reps-only bodyweight entry, display of swapped / extra / RIR values recorded on the web, missed-day resolution, read-only cardio lines. These get regression coverage, not new work. | Inspection of the 21e code. | 21e spec RD-4, RD-12, RD-22, RD-23 |
| RD-19 | The app keeps `?fields=core` on its three reads. | It still renders no calls, summaries, or goals; that is 21g. | 21e RD-28 |
| RD-20 | Every endpoint and control is Free. | Capture and correction are never gated. | CLAUDE.md plans; run prompt §4.11 |
| RD-21 | H2's "Edit on the web" button and its note are removed. | The phone now corrects sets itself; an external link that is no longer needed is removed, not kept. | design §11 |
| RD-22 | Drafts (typed numbers and an RIR choice) live in the card's component state: they survive opening and closing a sheet or modal, and are dropped when the lifter moves to another exercise or leaves the workout. | Unchanged from 21e and the web. The pitch's "RIR survives navigation and resume" is about saved RIR, which is the server's. | 21e spec §4 (Draft); web `WorkoutRunner` |
| RD-23 | No tour step and no release-note entry. | The native tour is 21k; the app is staging-only. | 21e RD-18 |
| RD-24 | Step 3: no `preview.tsx`; the web-style preview is recorded as skipped in the run prompt's words, and a design canvas is published as the visual review artifact the pipeline guide asks of a mobile-only slice. | Both the run prompt and the pipeline guide are satisfied; the canvas is not a new approval gate. | run prompt step 3; pipeline guide §5 step 3, D5 |
| RD-25 | **Merge.** The feature PR is merged into `staging` when the suite, review, and audit are green, and the staging update is published if the runtime is unchanged. There is no pre-merge owner checkpoint in this slice. | The owner authorized it in the run prompt; the iPhone can only reach the new endpoints once they are on staging. | run prompt ("I authorize…"), step 14 |
| RD-26 | **Test accounts** are made by `dev:test-account` over demo seed variants (§11), one disposable account per scenario, anchored to the account's own today when the command runs. No cleanup command is added. | The owner asked for independent, reproducible states from a repository command; a new deletion path would breach CLAUDE.md's rule that the QA fixture reset is the only other user of the deletion steps. | run prompt §6; CLAUDE.md first invariant |
| RD-27 | The demo seed's cardio variant sets a planned cardio row's `createdAt` to its block's start. | A cardio occurrence exists only from its plan row's creation date; in the story the cardio was planned with the block. The QA fixture already makes this one adjustment, to a plan row, never to logged history. | `scripts/qa-fixture/qa.ts`; `cardio/schedule.ts` |
| RD-28 | **Review audit (PR #264).** Nine of ten review findings were applied: a modal goes back at most once and only while it is still open; More and Swap are disabled while a set is saving; a correction and a skip cancel any read still on its way before they update the screen, and Edit set reads the cache instead of refetching; a cardio save waits for Today and History before its form closes; an exercise archived **after** a set was logged stays loggable (its sets stay visible and correctable, and the rest can be logged) instead of showing "choose a substitute" with two actions the server refuses; the swap list is marked stale, not removed; one failure-message helper and one `shapeError`; dead code removed. The tenth, a rare overlap between a swap and a first set inside the existing server modules, is deferred to OVE-220: it is existing behavior, and the app no longer sends both at once. | Each applied finding is a defect this slice introduced, so it is in scope; the server-side one changes shared write modules and deserves its own ticket and staging verification. | `overload-review-audit`; CLAUDE.md second invariant |

## Open Questions

None blocking. One upstream finding for the owner (in the PR's owner notes): a planned cardio row's occurrence floor compares its creation instant's **UTC** date with the block's calendar dates, so cardio planned in the evening in a US time zone does not appear for that same day. It is existing web behavior, outside this slice, and is not changed here.

## 15. Future considerations

21g renders the `progression` entries the workout read already returns, on this card, and adds the Pro note. 21h adds gym and library management, after which "Add another on the web" hand-offs here become native links. The More sheet has room for Jump to Exercise and other per-exercise actions without changing the card.
