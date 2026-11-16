---
version: 1.0.0
status: approved
author: Claude Code (unattended pipeline run, 2026-11-15)
last_updated: 2026-11-15
pitch_reference: docs/pitches/mvp-5b-mobile-app/21e-workout-loop/pitch.md
design_reference: docs/pitches/mvp-5b-mobile-app/21e-workout-loop/design.md
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
linear_issue: Linear milestone "Pitch 21e — Workout Loop"
---

# Workout Loop — Technical Specification

**Design:** `design.md` in this folder. Its §15 (Mobile design) is the binding native visual contract. There is no `preview.tsx`: a mobile-only slice's visual contract is the design doc's Mobile design section (pipeline guide §5 step 3, Appendix D5; `overload-mobile-ui`), so step 3 is recorded as skipped.

## 1. Summary

The Workout Loop makes the iPhone app log a planned strength workout end to end — Today, start or resume, the logging card, finish, a basic summary, and all-time History — against the same records the web writes. It adds **six account-scoped mobile API endpoints** that wrap existing web modules unchanged (`startOrResumeWorkout`, `getWorkoutView`, `logSetAndReconcile`, `completeWorkoutAndReconcile`, `getHistoryWeek`, `getLoggedWorkoutDetail` with its gated summary), and **native screens** that render the existing shared contracts with the existing shared card rules.

The core abstraction: **the server is the only authority, and the phone is a renderer with drafts.** Every number the card offers comes from `ExerciseCardDto` (Prescription-Aware Intelligence's `weightContext`, `suggestedWeightLbs`, `previousPerformance`, `referencePerformance`), fed through the shared `offerFor`, `activeSetNumber`, and `formatCardContext` the web card already uses. A set exists only once `PUT …/sets/{setNumber}` answers 200 with the stored `LoggedSet`. Natural keys make every write retry-safe, so the phone needs no offline queue, no local store, and no idempotency table.

"Working" means: a lifter signed in on the staging build starts today's workout, logs every set (the box offers this recurring workout's weight, or stays empty with a reference line), force-quits and resumes with every saved set intact, finishes once, sees a summary, finds the workout in native History beside earlier weeks and blocks, and the staging web app shows the identical workout. No web behavior, schema, or migration changes.

## 2. Problem

- The app cannot yet start a workout: the mobile API has no workout endpoints (`apps/web/src/app/api/mobile/v1` holds only app-config, me, today, gyms, accounts, password-reset, appearance).
- The app cannot yet show a logging card, so the Prescription-Aware Intelligence contract (trusted / reference-only / none) has no native consumer.
- The app cannot yet record a set, finish a workout, or read History, so a lifter must open the web to train.
- This blocks 21f (every remaining logging behavior builds on the card and these endpoints) and 21g (insights render inside this card and summary).

## 3. Scope and non-scope

### In scope

- API: `POST /workouts`, `GET /workouts/{loggedSessionId}`, `PUT /logged-exercises/{loggedExerciseId}/sets/{setNumber}`, `POST /workouts/{loggedSessionId}/complete`, `GET /history?week=`, `GET /history/{loggedSessionId}`, and (Checkpoint A, RD-23) `PUT /mesocycles/{mesocycleId}/missed-days/{missedOn}`; two additive response types in `@overload/shared/contracts`; the endpoint registry, static guards, and isolation-suite cases for each.
- Native: Today (all dashboard kinds, including resolving a missed day: log it late, shift, skip; RD-23), start/resume with the start-time gym rule (RD-4), the workout screen and logging card, finish with its confirmation, the basic summary, History week and logged-workout detail, loading/empty/error/unreachable states, haptics, keypad bar, light/dark.

### Out of scope

- **21f:** `PUT /workouts/{id}/gym`, swap, skip and undo, RIR entry in the app (the endpoint accepts `rir` because the web's write does; the app never sends one), adding an extra set, `PATCH /sets/{id}`, planned-set edits, cardio writes, the full bodyweight and fixed-target experience.
- **21g:** rendering any `progression` entry, `sessionSummary`, scheduled-deload banner, suggested loads, Pro note. The API still returns the gated objects the contracts define; the app ignores them in this slice.
- **Separate pitches:** Jump to Exercise, History Calendar, Exercise History Contexts, Planned Workout Guidance, Deload Customization.
- No change to any web page, server action, write module, progression code, or schema.

## 4. Core concepts

| Concept | Description |
| --- | --- |
| Occurrence | A planned `Session` on one scheduled date. The natural key of a `LoggedSession` is `(sessionId, scheduledFor)`; starting twice returns the same workout. |
| `LoggedExercise` plan context | Copied at start (planned sets, rep range, planned exercise). The card reads it; a later plan edit never reinterprets a started workout. |
| `LoggedSet` natural key | `(loggedExerciseId, setNumber)`. An identical re-send returns the stored row; different values are `conflict`. |
| Weight context | `ExerciseCardDto.weightContext`: `"trusted"` (this recurring workout's comparable last time, and `suggestedWeightLbs` its weight unless bodyweight), `"reference_only"` (`referencePerformance` shown, nothing offered), `"none"`. Decided only by the server. |
| Offer | The value pre-filled in the active row's weight box: the highest saved set's weight in this card, else the trusted working weight, else nothing (`offerFor`). Local state; never written on its own. |
| Draft | Typed, unsent numbers in the active row. Component state only; dropped when the workout screen unmounts. Never persisted. |
| Completion | `completeWorkout`: at least one set; untouched exercises recorded as not done; idempotent. |
| History week | `getHistoryWeek`: one week, anchored on the active block's start weekday (Monday with none), bounded by the first logged day and this week (or the active block's last week). All-time. |

## 5. States and lifecycle

```text
LoggedSession.status: in_progress → complete   (one-way; complete is terminal)
```

| From | To | Trigger | Side effects |
| --- | --- | --- | --- |
| (none) | `in_progress` | `POST /workouts`, a due occurrence of the active block | LoggedSession + LoggedExercises (plan context copied) in one transaction |
| `in_progress` | `in_progress` | `POST /workouts` again | none (a gym re-attach only while no set exists, the existing rule) |
| `in_progress` | `in_progress` | `PUT …/sets/n` | one LoggedSet + any baseline correction in the set's transaction; goal reconciliation after commit |
| `in_progress` | `complete` | `POST …/complete` with ≥1 set | untouched exercises `skippedAt`; `completedAt`; goal reconciliation after commit |
| `complete` | `complete` | `POST …/complete` again | none; `completedAt` keeps its first value |
| `complete` | — | `PUT …/sets/n` | refused `invalid_state_transition` |

Client view states per active row: `draft → checking → saving → saved | failed(network) | conflict | finished-elsewhere`. Only `saved` comes from a server 200.

## 6. Mobile API contract

All under `/api/mobile/v1`, built with `mobileRoute` (version gate → `getUser(token)` → no-create account → suspension → last-active → per-account rate limit → handler → JSON or the error envelope). Every endpoint is **Free** (capture and history). Gated parts are serialized exactly as the gated readers return them (`locked`, null Pro fields). `Cache-Control: no-store` on every answer.

| # | Method + path | Wraps | Request | 200 response | Retry safety | Errors |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | `POST /workouts` | `startOrResumeWorkout` | `StartWorkoutRequest` `{ sessionId, scheduledFor, gymId }` (≤ 4 KiB) | `StartWorkoutResponseDto` `{ loggedSessionId }` | natural key `(sessionId, scheduledFor)`; concurrent starts resolve to one row (existing P2002 re-run) | 400 `validation_error` (not a string, bad date, no/archived gym, not in the active block, not scheduled that day, a future day); 404 `not_found` (session missing or another account's) |
| E2 | `GET /workouts/{loggedSessionId}` | `getWorkoutView` | — | `WorkoutViewDto` `{ workout, progression }` (progression gated) | read | 404 `not_found` (missing, malformed, or another account's) |
| E3 | `PUT /logged-exercises/{loggedExerciseId}/sets/{setNumber}` | `logSetAndReconcile` | `LogSetRequest` `{ weightLbs?, reps, rir? }` (≤ 4 KiB) | `LoggedSetDto` | natural key; identical → 200 with the stored row; different → 409 | 400 `validation_error` (with `details.weightLbs` / `reps` / `rir` / `setNumber`); 400 `invalid_state_transition` (finished workout, skipped exercise); 404 `not_found`; 409 `conflict` |
| E4 | `POST /workouts/{loggedSessionId}/complete` | `completeWorkoutAndReconcile` | no body (any body ignored) | `CompleteWorkoutResponseDto` `{ loggedSessionId, status: "complete" }` | idempotent: already complete → 200, nothing changes | 400 `validation_error` (no set logged); 404 `not_found` |
| E5 | `GET /history?week=YYYY-MM-DD` | `getHistoryWeek` | `week` optional; anything else resolves as the web does (this week, clamped to bounds) | `HistoryWeekDto` | read | — |
| E7 | `PUT /mesocycles/{mesocycleId}/missed-days/{missedOn}` (Checkpoint A, RD-23) | `resolveMissedDay` | `ResolveMissedDayRequest` `{ outcome: "shifted" \| "skipped" }` (≤ 4 KiB) | `MissedDayResolutionDto` `{ id, missedOn, outcome }` | natural key `(mesocycleId, missedOn)`: the same outcome → 200 with the stored resolution; a different one → 409 | 400 `validation_error` (any other outcome, a bad date, today or later, nothing planned, logged, already shifted away); 404 `not_found` (block missing, malformed, or another account's); 409 `conflict` |
| E6 | `GET /history/{loggedSessionId}` | `getLoggedWorkoutDetail` + gated `getSessionProgressionSummary` + `getSessionGoalSummary` | — | `LoggedWorkoutDetailViewDto` `{ detail, summary, goals }` | read | 404 `not_found` |

**Path parameters.** `loggedSessionId` and `loggedExerciseId` are passed to the lib functions as strings; the lib's `isUuid` check turns a malformed id into `not_found` (never a 500, never a distinct error). `setNumber` must match `^[1-9][0-9]{0,2}$` or the handler answers 400 `validation_error` with `details.setNumber`; the lib applies the plan/extra-set range.

**Body fields** (E1, E3) are type-checked in the handler only for shape (`string`; `number | null | undefined`), and every value rule stays in the existing lib (`checkWeightLbs`, `checkLoggedReps`, RIR, set-number range), so there is one rule set for both clients. A shape error is 400 `validation_error` with `details.<field>`. Unknown fields are ignored. No body field names an account; the account is the token's.

**New shared types** (`packages/shared/src/contracts/logging.ts`, additive):

```ts
/** `POST /workouts`: the started or resumed workout. */
export type StartWorkoutResponseDto = { loggedSessionId: string };

/** `POST /workouts/{loggedSessionId}/complete`. */
export type CompleteWorkoutResponseDto = {
  loggedSessionId: string;
  status: "complete";
};
```

`LoggedSetDto` (views.ts) already exists; a server serializer `toLoggedSetDto` (`apps/web/src/lib/api/mobile/serialize.ts`) maps the Prisma row (Decimal → number, Date → ISO string).

**Backward compatibility.** All seven endpoints are new, so no v1 response changes shape. `MOBILE_MIN_APP_VERSION` is not raised. The existing staging build (runtime `f98506f78a`) receives the 21e JavaScript as an over-the-air update (RD-17).

**Rate limit.** The existing 120 requests per account per minute covers a workout (one set write plus one workout refetch per set); no change.

## 7. UI integration

### Screen → endpoint map

| Screen (design §15) | Route (`apps/mobile/src/app`) | Reads | Writes |
| --- | --- | --- | --- |
| T1 Today | `(tabs)/today/index.tsx` | `GET /today`, `GET /gyms` (on Start) | `POST /workouts` |
| W1 Workout | `workout/[loggedSessionId]/index.tsx` (root stack, over the tabs) | `GET /workouts/{id}` | `PUT …/sets/{n}`, `POST …/complete` |
| S1 Summary | `workout/[loggedSessionId]/summary.tsx` | `GET /history/{id}` | — |
| H1 History | `(tabs)/history/index.tsx` (`week` route param) | `GET /history?week=` | — |
| H2 Logged workout | `(tabs)/history/[loggedSessionId].tsx` | `GET /history/{id}` | — |

`RootNavigator` adds `<Stack.Screen name="workout" />` inside the signed-in `Stack.Protected` group. `workout/_layout.tsx` is a native `Stack` with the 21d `stackScreenOptions` (standard titles). Today's "View workout" pushes `/history/{id}` (the History tab's H2), and H2's "Resume workout" pushes `/workout/{id}`.

### Data layer (`apps/mobile/src/api/training.ts`)

TanStack Query, the 21d client and retry policy (temporary failures retry twice for reads; mutations never auto-retry).

| Key | Query | Notes |
| --- | --- | --- |
| `["today"]` | `GET /today` | refetch on focus and foreground |
| `["gyms"]` | `GET /gyms` | fetched on demand when Start needs it |
| `["workout", id]` | `GET /workouts/{id}` | `staleTime` 0 |
| `["history-week", week ?? "current"]` | `GET /history?week=` | `placeholderData: keepPreviousData` while moving between weeks |
| `["history-workout", id]` | `GET /history/{id}` | |

Mutations: `useStartWorkout`, `useLogSet`, `useCompleteWorkout`. After a successful set, the returned `LoggedSetDto` is merged into `["workout", id]` (row `setNumber` → `saved: true`, values and `loggedSetId` from the server), then `["workout", id]`, `["today"]`, and `history-*` are invalidated. After completion, `["today"]`, `["workout", id]`, and `history-*` are invalidated. Every key is removed by `clearAccountQueries` on sign-out (it removes all but app-config).

### Pure card model (`apps/mobile/src/workout/card-model.ts`)

No I/O; unit-tested. It contains no training rule — only the wiring of server fields into the shared functions.

```ts
/** The trusted working weight, or null. Anything but "trusted" offers nothing (RD-8). */
export function trustedWorkingWeight(card: ExerciseCardDto): number | null;
/** The active row's offer: shared offerFor over the server's sets and trustedWorkingWeight. */
export function cardOffer(card: ExerciseCardDto): Offer | null;
/** The context and reference lines: shared formatCardContext with the workout's name and date. */
export function cardContext(card: ExerciseCardDto, workout: WorkoutDto): { line: string; reference: string | null };
/** Typed weight text → number for the shared rule: trims, accepts "," as the decimal mark (RD-11). */
export function parseWeightText(text: string): number;
/** The first card with an unlogged planned set (skipped/unavailable passed over), else the last. */
export function initialExerciseIndex(workout: WorkoutDto): number;
/** The finish confirmation's list: not-skipped exercises with fewer saved planned sets than planned. */
export function unfinishedExercises(workout: WorkoutDto): { name: string; done: number; planned: number }[];
/** Summary counts from the logged record: exercises with ≥1 set, and saved sets. */
export function summaryCounts(detail: LoggedWorkoutDetailDto): { exercises: number; sets: number };
/** How a card renders: "log" | "bodyweight" | "not_done" | "unavailable". */
export function cardMode(card: ExerciseCardDto): CardMode;
```

### Forms and validation (client pre-check)

| Field | Keyboard | Pre-check (before any request) | Server |
| --- | --- | --- | --- |
| Weight (when `requiresExternalWeight`) | `decimal-pad` | `checkWeightLbs(parseWeightText(text))` → the shared message | `checkWeightLbs` again in `logSet` |
| Reps | `number-pad` | `checkLoggedReps(Number(text) or 0)` → the shared message | `checkLoggedReps` |

### Interaction details

- Keypad bar: React Native `InputAccessoryView` (iOS core). Weight field: **Next** focuses reps. Reps field: **Log set** = the card button.
- Keyboard avoidance: `ScrollView` with `automaticallyAdjustKeyboardInsets` and `keyboardShouldPersistTaps="handled"`.
- Haptics (`ui/haptics.ts`): add `haptic.light` (`impactAsync(Light)`) for a saved set; `success` on finish; `warning` on a field error or failed save.
- Repeated taps: the mutation's pending state disables Log set / Start / Finish.
- Gym choice on Start: `ActionSheetIOS.showActionSheetWithOptions`.
- Finish confirmation: `Alert.alert` with the design §6 F1 copy.
- External links: `Linking.openURL(webOrigin + path)` for "Open Overload on the web" and H2's "Edit on the web".

### Client scope and platform impact

Mobile UI plus additive mobile API endpoints in `apps/web`. Shared logic is reused, never copied: `offerFor`, `activeSetNumber`, `formatCardContext`, `formatSetSummary`, `formatRepTarget`, `formatWeightLbs`, `checkWeightLbs`, `checkLoggedReps`, `rirSuffix`. No web UI change.

### User guidance

None in this slice (design §13): no tour step (the native tour is 21k) and no release-note entry (the app is staging-only until 21l).

## 8. Data model

**No schema change and no migration.** No new owned model, so no RLS statement, scope registration, deletion, or export change. Retry safety rests on the existing unique keys `LoggedSession(sessionId, scheduledFor)` and `LoggedSet(loggedExerciseId, setNumber)`; the `ApiIdempotencyKey` table is not used (it is for create endpoints without a natural key).

| Field / concept | Stored? | Computed from |
| --- | --- | --- |
| `weightContext`, `suggestedWeightLbs`, `previousPerformance`, `referencePerformance` | no | the server's card read (Prescription-Aware Intelligence) |
| Offer, active set, context lines | no | the shared card rules on the phone, from the server's fields |
| Summary counts | no | the logged record |

## 9. Authorization and access control

- Every endpoint is `mobileRoute`: the account is the verified token's, through the no-create resolver; a suspended account gets 403 before any read.
- Every read and write goes through account-scoped lib functions on `account.db`. Another account's session, workout, logged exercise, or week reads exactly like a missing one: 404 `not_found` with the same message, and History never lists another account's rows.
- Route files import only lib modules allowed by `tests/unit/mobile-api-guards.test.ts` (no `@/lib/db`, no `@prisma/client`, no `requireAccount`, no cookies, no redirects).
- Gating: E2 uses `getWorkoutView` (gated `getOccurrenceProgression`), E6 uses gated `getSessionProgressionSummary` with the request's entitlement. No handler calls `gatherRows`, `describeScope`, or `getExerciseProgression`. Free capture is never gated: E1, E3, E4, E5, and the non-progression parts of E2 and E6 behave the same for Free and Pro.
- Mobile: tokens stay in the Keychain (21d); no account id is sent anywhere; the query cache is removed on sign-out.

## 10. Validation rules

| Input | Validation | Error |
| --- | --- | --- |
| E1 `sessionId`, `scheduledFor`, `gymId` | strings; then the lib (UUID, ISO date, active gym, active block, scheduled, not future) | `validation_error` / `not_found` |
| E3 `setNumber` (path) | `^[1-9][0-9]{0,2}$`; then the lib's plan/extra range | `validation_error` (`details.setNumber`) |
| E3 `weightLbs` | `number | null | undefined` shape; then `checkWeightLbs` (above 0, ≤ 9,999.99, ≤ 2 decimals) or null for bodyweight | `validation_error` (`details.weightLbs`) |
| E3 `reps` | `number` shape; then `checkLoggedReps` (integer 1–1,000) | `validation_error` (`details.reps`) |
| E3 `rir` | `number | null | undefined` shape; then the lib's RIR rule | `validation_error` (`details.rir`) |
| Body | JSON object, ≤ 4 KiB (`readJsonObject`) | `validation_error` |

No new limit is introduced. Internal errors answer the generic `internal_error` message.

## 11. Testing strategy

### API — `apps/web/tests/integration/isolation/mobile-api.int.test.ts` (extended)

Every new registry entry gets: the authentication/suspension/version matrix (`accountEndpointMatrix`), and isolation cases:

```text
E1  GIVEN A's session  WHEN B starts it (with B's gym)       THEN 404, no LoggedSession for B or A created
    GIVEN A's session  WHEN A starts it with B's gym          THEN 400 validation_error, nothing created
E2  GIVEN A's workout  WHEN B reads it                        THEN 404, body has no A marker
E3  GIVEN A's logged exercise WHEN B logs set 1               THEN 404, A's snapshot unchanged
E4  GIVEN A's workout  WHEN B completes it                    THEN 404, still in_progress
E5  GIVEN A's history  WHEN B reads any week (incl. A's dates) THEN no A marker; hasAnyHistory false for an empty B
E6  GIVEN A's finished workout WHEN B reads it                THEN 404
    Free account: E6 summary is locked with null Pro fields; E2 progression entries locked
```

### API behavior — `apps/web/tests/integration/mobile-workout-loop.int.test.ts` (new)

```text
Happy path   start → GET workout → PUT set 1..n for each exercise → complete → GET history week shows it complete → GET history/{id} shows the sets
Retry        POST /workouts twice → same loggedSessionId, one LoggedSession row
             PUT set 1 identical twice → 200 both, one LoggedSet row, same id
             PUT set 1 different values → 409 conflict, stored row unchanged
             POST complete twice → 200 both, completedAt unchanged
State        PUT a set after complete → 400 invalid_state_transition, no row
             complete with no sets → 400 validation_error
Validation   setNumber "0", "abc", "1000" → 400 details.setNumber; weightLbs "185" (string) → 400 details.weightLbs;
             weightLbs 185.125 → 400 tooPrecise message; reps 0 → 400; non-JSON body → 400
Free         an account with no Pro source starts, logs, completes, and reads history (200 each)
Prescription-aware (through E2's JSON, reusing the prescription-aware fixtures):
             Saturday Push bench 255 trusted → weightContext "trusted", suggestedWeightLbs 255, previousPerformance.sessionName "Push"
             Wednesday Upper first time → "reference_only", suggestedWeightLbs null, referencePerformance.sessionName "Push"
             Wednesday Upper with 230 history → "trusted", 230 (never 255)
             6–8 → 8–10 → 6–8 → the 6–8 block-1 weight is not trusted
             machine: baseline 50, latest comparable 55 → suggestedWeightLbs 55
Archived     an exercise archived after logging still appears in E6 detail with archived true and its sets
History      a week in an earlier block (two blocks back) returns kind "logged" with that block's workout; prevWeekStart null at the first week
Plan edit    start a workout, then change the session's rep range in the plan → E2 still shows the copied range
```

### Missed days — `apps/web/tests/integration/mobile-missed-day.int.test.ts` (Checkpoint A, RD-23)

```text
Block        starts T-2; "Missed Upper" planned T-1, "Later Lower" T+2; week 2 repeats both
Prompt       GET /today → missed_day for T-1, daysAgo 1
Shift        E7 shifted → Today offers Missed Upper today; Later Lower moves T+2 → T+3; week 2 unchanged (T+6, T+9)
Skip         E7 skipped → Today is rest (twice); History shows it skipped; one resolution row
Retry        same outcome twice → identical 200; a different outcome → 409; still one row
Refusals     logged_late, no outcome, a bad date, today, the future, a day with nothing planned → 400; a bad block id → 404; no row
Log late     E1 with the missed date → that day's workout (repeat → same id); Today moves on; finish → rest; no resolution row
Free         a Free account resolves its own missed day
```
Isolation adds E7's matrix plus: B can't resolve A's missed day (404 identical to a missing block, an account id in the body ignored, A unchanged), and A's and B's resolutions stay their own.

### Static guards (`tests/unit/mobile-api-guards.test.ts`)

The registry lists exactly the six new route methods; each is `mobileRoute`; none imports a forbidden module or names an account id; the existing guard that no handler calls an ungated builder covers them.

### Contracts (`tests/unit/mobile-contracts.test.ts`)

`StartWorkoutResponseDto` and `CompleteWorkoutResponseDto` are JSON-safe.

### Mobile (`apps/mobile/tests`)

```text
card-model    trusted → offer = suggestedWeightLbs; reference_only/none/unknown string → no offer even if suggestedWeightLbs is non-null
              after set 1 saved at 230 → offer 230 "same as set 1"; an unsaved set never sets the offer
              bodyweight → no offer; parseWeightText("182,5") = 182.5, "" → NaN
              initialExerciseIndex skips done, skipped, and archived cards; unfinishedExercises; summaryCounts
today         renders pending (Start), in_progress (Resume, "2 of 4 exercises logged"), complete (Done, View workout), rest, no plan, missed day (Open on the web, dimmed day not pressable)
start         one gym → POST with it; two gyms → action sheet; zero gyms → inline note, no request
logging card  reference_only → weight box empty, reference line shown; trusted → box shows 255 and caption "last time"
              Log set → "Saving…" and inputs read-only; a network failure keeps the typed numbers and shows the message
              a 200 → the row shows as logged with the server's values; a 409 → "already logged" and refetch
              invalid weight → field message, no request
finish        unfinished → Alert with the list; success → summary route
history       renders a week, earlier blocks, empty state; ‹ disabled at prevWeekStart null
```

### Unverified by a run (owner checkpoints)

Interactive simulator logging, physical-iPhone logging, force-close and resume on a device, keypad and safe-area behavior, haptics, VoiceOver, light/dark on device, and the staging OTA. A run can build the app, launch the simulator, and take screenshots, but cannot tap.

## 12. Acceptance criteria

**API**
- [ ] E1–E6 exist, are in the registry, pass the static guards, and each has isolation cases.
- [ ] Starting twice, logging an identical set twice, and finishing twice each leave exactly one row and the first values.
- [ ] A different re-send of a set is 409 and changes nothing; a set after finishing is refused.
- [ ] A Free account starts, logs, finishes, and reads history; gated parts are `locked`.
- [ ] E2 carries the Prescription-Aware fields unchanged: trusted, reference-only, none, the rep-range return, and the machine 55-not-50 cases.
- [ ] E5 reaches a week in an earlier block; E6 shows archived exercises with their sets.
- [ ] No web page, action, write module, schema, or migration changed; the full web suite stays green.

**Mobile**
- [ ] Today renders every dashboard kind per design §6 and §15; Start/Resume/View workout behave as specified; the date is the account's.
- [ ] The card offers only the server's trusted weight or a saved set's weight; reference-only and none leave the box empty; an unknown `weightContext` offers nothing.
- [ ] A row is shown logged only after a 200; failures keep the typed numbers; conflicts refresh.
- [ ] Finish confirms unfinished exercises, completes once, and shows the summary; Today then shows Done.
- [ ] History moves week by week back to the first logged week, lists earlier blocks, and opens read-only details.
- [ ] No new native dependency; `apps/mobile/package.json` and `app.config.ts` unchanged; the update publishes to the existing staging runtime.
- [ ] Mobile lint, typecheck, and tests pass.

**Device (owner)**
- [ ] Runbook checkpoints A (simulator, local API) and B/C (iPhone, staging update after the merge) pass.

## 13. Explicit non-goals

- ❌ A second progression engine, client-side compatibility or lineage, client weight estimation. **Permanent.**
- ❌ Offline logging, a local workout store, background sync. **Permanent** (CLAUDE.md).
- ❌ A purchase or upgrade flow in the app. **Deferred** to the store pitches.
- ❌ Swap, skip, gym change, RIR entry, extra sets, set or planned-set edits, missed-day choices, cardio logging. **Deferred** to 21f.
- ❌ Progression calls, evidence, deload banner, full summary. **Deferred** to 21g.
- ❌ Rest timer. **Permanent.**

## Resolved Decisions

| # | Decision | Rationale | Authority |
| --- | --- | --- | --- |
| RD-1 | Six endpoints (E1–E6) at the paths in §6, the audit's workout-loop table and the 21b request contracts. | The audit inventoried them and the shared request types already name these paths. | `mobile-audit.md` §2 ("21d — workout loop"); `contracts/requests.ts` (Q1) |
| RD-2 | Each endpoint wraps the existing module unchanged; no web semantics, schema, or migration change. | One backend, one training model; the modules already enforce the state rules (F-T1, F-T3, F-T6, F-T9). | CLAUDE.md mobile rules; pitch §10 (Q1, Q10) |
| RD-3 | Retry safety is the natural keys; no `Idempotency-Key` on these writes. | CLAUDE.md lists logging a set and starting a workout as natural-key writes; completion is idempotent. | CLAUDE.md mobile API rules (Q8) |
| RD-4 | Starting needs a gym (`StartWorkoutRequest.gymId`, `requireActiveGym`). One active gym → used without a question; two or more → an action sheet "Where are you training?"; none → "Add the gym you train at on the web first." Changing the gym after start stays 21f. | The backend requires a gym to start; the web asks the same question at start with the first gym preselected. Asking only when there is a choice is the native mapping of that existing step, not 21f's gym management. | pitch §3 C4 ("use the existing backend's established gym selection and defaults"); web `GymPicker` (Q7) |
| RD-5 | A missed day shows the web's state: the prompt's facts, with today's day dimmed and inert. ~~"Open Overload on the web"; native resolution is 21f.~~ **Amended by RD-23:** the phone resolves it. | The web makes the day below inert until the missed day is resolved; letting the phone start it would diverge from the web's rule. | web Today page; pitch §4 (Q7); RD-23 |
| RD-6 | W1 and S1 live in a root-level `workout` stack over the tabs. | The keypad and card get the whole screen and no tab switch can interrupt a set; Back returns to the opening tab. | `overload-mobile-ui` thumb-first rule; design §4 (Q3) |
| RD-7 | One exercise at a time with Previous/Next (the web runner's model), opening on the first exercise with an unlogged planned set. | Matches the web; no exercise list to jump around keeps Jump to Exercise separate while leaving room for it. Opening on the first unfinished card is what Resume means. | web `WorkoutRunner`; pitch §4 (Jump to Exercise) (Q3, Q4) |
| RD-8 | The card's working weight is `weightContext === "trusted" ? suggestedWeightLbs : null`, then the shared `offerFor`; context text is the shared `formatCardContext`. Any other or unknown `weightContext` offers nothing. | The server already nulls the weight outside "trusted"; the guard makes an unknown additive value safe instead of trusted, as the pitch requires. | PAI contract (`ExerciseCardDto`); pitch §3 G (Q2) |
| RD-9 | Set write flow: PUT; on 200 merge the returned `LoggedSetDto` into the workout cache and refetch; on a network/timeout/5xx failure keep the draft and say so (Log set again re-sends the same PUT); on 409 show "Set N was already logged." and refetch; on `invalid_state_transition` show the server's message and refetch. | Only the server confirms a set; an identical re-send is a replay, so a retry can't duplicate. | CLAUDE.md second invariant; web card's conflict handling (Q8, Q9) |
| RD-10 | The phone pre-checks weight and reps with the shared `checkWeightLbs` / `checkLoggedReps` and their messages; the server checks again. | One rule set for both clients; no new limit. | 21b shared validation; pitch C6 |
| RD-11 | Weight text accepts "," as the decimal mark (iOS `decimal-pad` shows the locale's separator). | Parsing only; without it a comma-locale phone could not enter 182.5. The value rule is unchanged. | iOS keypad behavior (Q3) |
| RD-12 | The app sends no `rir`, offers no Add set, and logged rows are read-only. Extra sets already logged on the web are displayed. | RIR entry, extra-set entry, and corrections are 21f; showing existing records keeps them honest. | pitch §4 (21f) |
| RD-13 | Finish is in the nav bar (enabled after a saved set) and replaces Next on the last card; unfinished exercises are listed in a system alert using the web runner's rule and copy before `POST …/complete`. | The server's completion rule is unchanged; the list is a presentation of server state, exactly as the web computes it. | web `WorkoutRunner`; design F1 (Q10) |
| RD-14 | The basic summary reads `GET /history/{id}` and shows the name, date, gym, "N exercises · M sets" (exercises with ≥1 set; saved sets), and each exercise's `formatSetSummary` or "Not done". No progression, goals, chart, or duration. | Smallest useful confirmation (roadmap: basic here, full in 21g); no duration source is reliable; omission beats a misleading call. | mobile roadmap 21e/21g; pitch §3 E (Q5) |
| RD-15 | History is the web's week model over `GET /history?week=`, with ‹ › arrows, "This week", and the server's Earlier blocks list; no swipe paging, no calendar. In-progress rows open H2 with "Resume workout". | All-time, one week per request (the web's efficient read), no new infrastructure; the calendar is a separate pitch. | `history-week.ts`; pitch §3 F (Q6, Q11) |
| RD-16 | H2 always shows "Edit on the web" to the web's `/history/{id}`; Today's "View workout" opens H2 in the History tab. | Correction is 21f; the web is the recovery path. One H2 route avoids duplicating it per stack. | pitch §4; design §6 |
| RD-17 | No new native dependency and no change to `apps/mobile/package.json`, `app.config.ts`, or config plugins; everything uses React Native core and the build's existing modules (`InputAccessoryView`, `ActionSheetIOS`, `Alert`, `expo-haptics`). | Any native change alters the fingerprint, and the owner's installed staging build would stop receiving updates. | 21d runbook §7; 21d memory of the fingerprint |
| RD-18 | No tour step and no release-note entry. | The native tour is 21k; the app is staging-only and has no What's New until 21j. | design §13; `overload-onboarding` |
| RD-19 | Every endpoint is Free; E2 and E6 return their gated parts as the gated readers produce them, and the app renders none of them in 21e. | Capture and history are never gated; serializing the defined contracts now avoids a v1 change in 21g. | CLAUDE.md plans; `contracts/views.ts` |
| RD-20 | **Owner gate.** The feature PR stays open after the suite and review are green. The owner reviews the design on the simulator against a local API on overload-dev (runbook Checkpoint A, `EXPO_PUBLIC_LOCAL_API_ORIGIN`, Metro only) and authorizes the merge; the iPhone and OTA checks (B, C) run against staging after the merge, with fixes in this slice. | The pitch says merge only after owner approval (§11 step 14) and its Q12 makes the card and session flow an owner review; the iPhone can't reach the new endpoints until they're on staging, which is the mobile roadmap's "how each slice runs". | pitch §11, Q12, Q13; mobile-roadmap "How each slice runs"; 21d precedent |
| RD-21 | Exercises the app can't log in this slice render honestly: marked not done on the web → "Not done today." + "To log it, undo that on the web."; an archived planned exercise with no substitute → "Unavailable — this exercise was archived." + "Swap it on the web, or finish without it." Finishing remains possible. | Never hide or corrupt a record; the web holds the recovery path. | pitch §4, Q7 |
| RD-22 | Bodyweight exercises (`requiresExternalWeight` false) log reps only with no weight box, sending `weightLbs: null`. | The backend already defines a bodyweight set; without it a normal workout with pull-ups can't be logged. Weighted-bodyweight and fixed-target refinements stay 21f. | `LogSetInput` contract; pitch §4 |
| RD-23 | **Native missed-day resolution (owner-approved at Checkpoint A, Option B).** Today's missed-day card offers the web's three choices. *Log it late* is E1 with `scheduledFor` = the missed date, through the same Start flow (gym choice, busy guard); no resolution row. *Shift the week* and *Skip it* each confirm in a system alert (the web's shift wording, plus "You can't undo this." because a resolution is immutable), then E7, which wraps `resolveMissedDay` unchanged; Today and History refetch from the server. A failure keeps the card and says what failed. Swap, RIR, extra sets, gym change after start, and cardio stay 21f. | The owner chose not to leave the app for a scheduling decision. The backend already owns the rule (one function, scoped, retry-safe, immutable), so the phone adds one thin endpoint and no scheduling logic; the web confirms only Shift, and the owner asked for both to confirm. | Owner decision, Checkpoint A (2026-11-15); CLAUDE.md "Missed days"; web `MissedDayPrompt` |
| RD-24 | **One in-screen tab header and one card surface.** Every tab root renders `TabScreen` → `ScreenHeader` (uppercase context line, a 30/36 title, optional subtitle) and sets `headerShown: false`; pushed screens keep the system back header, so two headers never compete. The native large title (configured but not rendering in the dev build; cause unconfirmed) is no longer relied on. Cards are `Surface` (card color, token border, `radius.xl`); status reads as a `Chip` in words. The 30-point title and `tint()` live only in `apps/mobile/src/ui/theme.ts`, not the shared tokens. | Checkpoint A found no visible titles and cards that barely separated from the dark background. One header and one surface keep every screen composed the same way; a native-only title size avoids changing the web's type scale. | Owner approval of the design canvas (Checkpoint A); `overload-mobile-ui` |
| RD-25 | **One semantic `attention` token**: light `#a15c00` (5.2:1 on card, 4.9:1 on background), dark `#e0a33a` (8.3:1, 8.9:1), in `packages/shared/src/design/status-colors.ts` and `globals.css` (`--attention` in every block; the parity test checks globals.css = tokens.ts + status-colors.ts). **Not in `tokens.ts`:** `app.config.ts` imports that file for the splash background, so it is a native fingerprint input, and editing it moved the runtime off `f98506f78a` (OVE-209). A guard pins its bytes; at the next native rebuild the status colors move into `ColorTokens`. Used only for a scheduling problem that needs the lifter (the missed-day card's outline and icon). Never decoration; `primary` unchanged. | `deload` is a progression status and is 3.6:1 on white in light; reusing it would blur two meanings and miss AA. | Owner approval (Checkpoint A, item 3) |
| RD-26 | **The approved visual refinement** (design §15a): Today's single workout card with week, status chip, size, list, and one action, and an "Also today" section; History's week-switcher card, date-column rows with chips, Earlier blocks; the logging card's progress segments with "Exercise n of N · date · gym", a larger name, reference-only history in its own panel, a highlighted active row, saved rows tinted only after the server's 200; Plan and Goals as deliberate web hand-offs. No offer, prefill, save, or navigation rule changed. | The owner approved the canvas direction and these specific refinements for 21e. | Owner approval (Checkpoint A, item 2); design canvas |

## Open Questions

None blocking. Upstream items for the owner are in the PR's owner notes.

## 14. Future considerations

21f adds the gym, swap, skip, RIR, extra-set, and correction endpoints beside these and turns the card's honest-edge variants into controls. 21g renders the `progression` entries E2 and E6 already return. The card's one-exercise model can gain a jump list (Jump to Exercise) without changing the endpoints.
