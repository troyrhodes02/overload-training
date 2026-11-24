---
version: 1.0.0
status: approved
author: Claude Code (unattended pipeline run, 2026-11-24)
last_updated: 2026-11-24
pitch_reference: docs/pitches/mvp-5b-mobile-app/21i-goals-exercise-history/pitch.md
design_reference: docs/pitches/mvp-5b-mobile-app/21i-goals-exercise-history/design.md
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
linear_issue: Linear milestone "Pitch 21i — Goals & Exercise History"
---

# Goals & Exercise History — Technical Specification

**Design:** `design.md` in this folder. Its §15 (Mobile design) is the binding native visual contract. There is no `preview.tsx`: step 3 is recorded as *Skipped — mobile-only pitch; native visual contract provided by the Mobile design section and `/overload-mobile-ui`.* The visual review artifact is the design canvas (RD-19).

## 1. Summary

Goals & Exercise History gives the iPhone app the lifter's strength goals and each exercise's own history. It adds **eight account-scoped mobile API endpoint methods**, each a thin shell over the module the web already uses: the goal reads in `src/lib/goals/queries.ts`, the goal writes in `src/lib/goals/goals.ts` (`createGoal`, `archiveGoal`, `acknowledgeGoalCompletion`), and the gated exercise-history read `getExerciseHistory` with `getExerciseGoals`.

The core abstraction is *the phone renders the server's goals and history*. Goal pages on the web run the completion check (`reconcileGoalCompletionsSafely`) before they read. A new view module, `src/lib/views/goals.ts`, does the same for the API, so a met target arrives on the phone already archived as reached, exactly as on the web. The exercise history is the same gated DTO the web page renders: on a Free account the server has already withheld the e1RM trend, the best e1RM, the rep records, the per-session calls, and "Next time", and set `locked`.

"Working" means: a lifter opens Goals and sees the same goals, percents, and best sessions as the web; sets a goal from the phone that the web then lists; a retried set never makes two goals; a reached goal shows its card once; an exercise's history lists every logged session with the web's sets, RIR, swap notes, and dates, plus the records and one trend chart (Pro); a Free account sees the plain history and one quiet note. No logged set, plan, baseline, gym, or exercise is written by any of this. The only writes are the Goal rows the named actions create or change, the idempotency rows, and the web's own completion check.

## 2. Problem

- The Goals tab is a web link (21d RD-12; 21e RD-24).
- The exercise detail (21h) links to the web for "History and records".
- No mobile endpoint reads goals or exercise history, or writes a goal.

## 3. Scope and non-scope

### In scope

- G1 Goals, G2 Goal history, G3 Goal (active and archived), the Goal-reached card, archive.
- G4 Pick the lift and G5 Set goal (retry-safe create).
- X2 Exercise history: scope (gym) selection for machines, Next time (Pro), records, one trend chart, sessions (recent and all), goals on the lift, links to H2 and G3/G5.
- X1's history row becomes native.
- E1–E8, shared contracts, the goals view module, registry, guards, isolation, integration tests.
- Dev test-account profiles `21i-combined` and `21i-free`, plus automated-only fixtures.

### Out of scope

- Any change to goal rules, progress math, records, trends, calls, or gating.
- The Weight trend view and the projected-RIR overlay (web only; RD-6).
- Today's goals block on the phone (RD-8).
- Weekly scheduling (OVE-241, its own chore and spec).
- Billing, tour, release notes, Android, Production.

## 4. Core concepts

- **Goal.** Exercise + target weight × reps (+ gym for a machine or cable). One active goal per exercise per account (DB partial unique index). Progress = best qualifying session e1RM in scope ÷ target e1RM, floored, capped at 100, null with no performance. Completion is one conditional transition `active → archived/completed`, run by the reconcile engine.
- **Reached card.** A completed goal with `completionAcknowledgedAt = null`. Acknowledging is idempotent.
- **Exercise history scope.** Gym-consistent lifts: all gyms. Machines and cables: one gym at a time (`scope` = gym id, or `none` for legacy rows), defaulting to the gym most recently trained in a finished workout.
- **Gating.** `gateHistory` (unchanged) on the server. The phone renders what it receives and never derives a withheld value.

## 5. States and lifecycle

Unchanged from Goals (Pitch 6): active → archived (completed | manual). There is no reopen, no edit, and no delete. Reconciliation runs post-commit after logging writes (`workflows.ts`, unchanged), before every goal read (E1, E2, E3, E7), and at creation (inside `createGoal`'s transaction). It never runs inside a LoggedSet transaction.

## 6. Mobile API contract

All under `/api/mobile/v1`, built with `mobileRoute` (token, version gate, rate limit, error envelope). All are Free. Ids from another account answer 404 `not_found`, exactly like missing ids.

| # | Method and path | Request | 200/201 body | Errors | Module |
| --- | --- | --- | --- | --- | --- |
| E1 | `GET /goals` | — | `GoalsOverviewDto` | — | `getGoalsOverview` (reconciles first) |
| E2 | `GET /goals/history` | — | `GoalHistoryListDto` | — | `getGoalHistoryView` (reconciles first) |
| E3 | `GET /goals/{goalId}` | — | `GoalDetailDto` | 404 | `getGoalDetailView` (reconciles first) |
| E4 | `POST /goals` + `Idempotency-Key` | `CreateGoalRequest` | 201 `CreateGoalResponseDto` | 400 `validation_error` (shape, key, or a rule, with field `details`), 409 `conflict` with `details.existingGoalId` (also when two different requests race to the one-active-goal index), 409 `conflict` for a key reused with a different body | `createGoal` in `withIdempotency` |
| E5 | `PUT /goals/{goalId}/archived` | `{ archived: true }` | `ArchiveGoalResponseDto` | 400 (`archived` not `true`), 404 | `archiveGoal`; already archived → 200 with its outcome |
| E6 | `PUT /goals/{goalId}/acknowledged` | `{ acknowledged: true }` | `AcknowledgeGoalResponseDto` | 400, 404, 409 `invalid_state_transition` (not a reached goal) | `acknowledgeGoalCompletion` |
| E7 | `GET /exercises/{exerciseId}/goal-form?gymId=` | — | `GoalFormContextDto` | — (`kind: "not_found"` in the body, as the web) | `getGoalFormContextView` (reconciles first) |
| E8 | `GET /exercises/{exerciseId}/history?scope=&sessions=all` | — | `ExerciseHistoryViewDto` | 404 | `getExerciseHistory` (gated) + `getExerciseGoals` |

Status codes follow the 21c error map unchanged: `validation_error` and `invalid_state_transition` are 400, `not_found` 404, `conflict` 409.

### Shared contracts (`packages/shared/src/contracts`)

`goals.ts` gains:

```ts
export type GoalsOverviewDto = {
  /** Unacknowledged "Goal reached" cards, most recent first. */
  reached: GoalReachedDto[];
  /** Active goals, oldest first. */
  active: ActiveGoalDto[];
  /** Reached and archived goals in the history. */
  historyCount: number;
};
export type GoalHistoryListDto = { goals: GoalHistoryDto[] };
export type CreateGoalResponseDto = { id: string; outcome: "active" | "completed" };
export type ArchiveGoalResponseDto = { id: string; archived: true; outcome: "completed" | "manual" };
export type AcknowledgeGoalResponseDto = { id: string; acknowledged: true };
```

`requests.ts` already holds `CreateGoalRequest` (21b) and it is reused unchanged: the phone checks the typed values with the shared `parseGoalInput` first (the same messages), then sends numbers; the server parses again and its field messages come back in `details`.

`progression.ts` (or a new `exercise-history.ts`) gains `ExerciseHistoryViewDto = { history: ExerciseHistoryDto; goals: ExerciseGoalsDto }`, re-exporting `ExerciseHistoryDto` from `progression/history-types`.

`GoalReachedDto.newGoalHref` and `GoalDetailDto.newGoalHref` stay (web paths). The phone uses them only as "is a new goal allowed" and derives the target exercise and gym from the goal's own fields with the same rule as the web (`newGoalHrefFor`, RD-10).

### Server modules

- `src/lib/views/goals.ts` (new): `getGoalsOverview`, `getGoalHistoryView`, `getGoalDetailView`, `getGoalFormContextView`. Each calls `reconcileGoalCompletionsSafely(account)` first, then the existing read. The static guard in `tests/unit/mobile-api-guards.test.ts` that pins the reconcile callers gains this file.
- `src/lib/api/mobile/goals.ts` (new): request-shape adapters for E4–E6 and E8 (`createGoalFromRequest` with `withIdempotency` scope `POST /v1/goals`; `setGoalArchivedFromRequest`; `acknowledgeGoalFromRequest`; `readExerciseHistory`, which parses `scope` (≤ 64 chars) and `sessions=all`).
- Route files under `src/app/api/mobile/v1/goals/…` and `…/exercises/[exerciseId]/{history,goal-form}`.
- Nothing in `src/lib/goals/` or `src/lib/progression/` changes.

## 7. UI integration

### Screen → endpoint map

| Screen | Reads | Writes |
| --- | --- | --- |
| G1 Goals | E1 | E6 (card) |
| G2 Goal history | E2 | — |
| G3 Goal | E3 | E5, E6 |
| G4 Pick the lift | `GET /exercises` (21h), E1 (cached, for "Goal set" chips) | — |
| G5 Set goal | E7 | E4 |
| X2 Exercise history | E8 | — |
| X1 Exercise | 21h E4 | — |

### Routes (`apps/mobile/src/app`)

- Goals stack: `(tabs)/goals/index` (G1), `goals/history` (G2), `goals/[goalId]` (G3), `goals/new` (G4).
- In each of the Goals, Plan, and More stacks: `exercise-history/[exerciseId]` (X2) and `logged/[loggedSessionId]` (H2). The Goals stack also gets `exercise/[exerciseId]` (X1).
- Root: `goal-new` (G5, modal, `?exerciseId=&gymId=&from=`), and `exercise-history/[exerciseId]` (X2 over the workout, beside the 21h `exercise/[exerciseId]`). From over a workout, X2's session dates are not links (RD-12).
- A small `exercise-history/routes.ts` builds hrefs from the current stack, so X1 → X2 → H2 stays in the stack the lifter is in.

### Data layer (`apps/mobile/src/api/goals.ts`, new)

- Keys: `["goals"]`, `["goals-history"]`, `["goal", id]`, `["goal-form", exerciseId, gymId]`, `["exercise-history", exerciseId, scope, all]`.
- Reads use `OVERVIEW_STALE_MS` and `useRefetchWhenFocused`; failed refetches keep the last answer (TanStack default) and the screen shows the "Showing what was last loaded" banner.
- `useCreateGoal` sends `Idempotency-Key` from `useIntentKey(values)` (21h RD-21).
- After E4/E5/E6: invalidate the goal keys and `["exercise-history"]`. After any training write (`markTrainingStale`, `invalidateTraining`, `applyConfirmedCompletion`, the set correction): mark `["goals"]`, `["goals-history"]`, `["goal"]`, and `["exercise-history"]` stale without refetching, so the next visit re-reads (Q13).
- Sign-out already removes every account query (`clearAccountQueries`).

### Pure models (no I/O, unit-tested)

- `goals/goal-model.ts`: row labels, accessibility sentences, the new-goal target rule (exercise archived → picker; else exercise + gym if the gym is active), the reached-card copy.
- `exercise-history/history-model.ts`: which sections show (from `locked`, `records`, `trend`, `next`), the scope chips, session row text (shared `formatSetLine`/`formatRirLine`, the web's muted call words), the trend view choice (e1RM for loaded, reps for bodyweight).
- `exercise-history/chart-model.ts`: the plot geometry from the server's points only — y-range padding and three nice ticks, x positions (even spacing, ≥ 28 pt), up to four x labels, nearest-point selection, the summary label. No value is computed except positions.

### Components

As design §10. The chart draws with `View`s (absolute-positioned segments rotated by `transform`), so it needs no new native module and keeps the runtime fingerprint (RD-5).

### Interaction details

- G5 disables "Set goal" while saving; a synchronous ref guards a double tap.
- The reached card's success haptic fires once per goal per app session (`reached-seen` in memory).
- Chart: `onStartShouldSetResponder` / `onResponderMove` pick the nearest point; selection haptic on change.

### Client scope and platform impact

Mobile only. The web is unchanged except the guard list (§12) and the new server modules, which no web page uses. Old app versions ignore the new endpoints.

### User guidance

No tour step or release note (RD-17).

## 8. Data model

No schema change, no migration. Rows written: `Goal` (create, archive, acknowledge; completion through the existing engine) and `ApiIdempotencyKey` (21c table) for E4.

## 9. Authorization and access control

- Every endpoint resolves the account from the verified token (`mobileRoute`), reads and writes through `account.db`, and treats another account's goal or exercise id as not found.
- E8 calls only the gated `getExerciseHistory`; no ungated builder (`gatherRows`, `describeScope`, `getExerciseProgression`) is reachable from a route (existing guard).
- Goals are Free on every plan, as on the web (Pitch 19 spec §5; OVE-120 matrix). No Pro value is in any goal DTO: the goal's best e1RM is the Free goal-progress value the web shows on Free too.
- An entitlement change applies on the next read (each request resolves the entitlement).

## 10. Validation rules

Exactly the shared goal parser (`parseGoalInput`) and `createGoal`'s rules: active exercise, external weight, gym required iff gym-variable and active, one active goal per exercise, weight > 0 and ≤ 9,999.99 with ≤ 2 decimals, whole reps in range. The adapter only checks shape (strings or numbers; `gymId` string or null) and the body limit (4 KB).

## 11. Development-only test accounts

`npm run dev:test-account` gains two profiles (and the `goals` resource step), overload-dev only, with the existing guards:

- **`21i-combined`**: the `gym` story (machines at two gyms, 30+ finished workouts across blocks with RIR) plus goals created through `createGoal`: an active free-weight goal with measurable progress, an active machine goal at one gym, a goal history already meets (so it completes at creation and shows one reached card), and one manually archived goal; and a block week whose remaining days allow Swap, Train today, and Skip (verified by the command's check). The read-back prints the goals and the week.
- **`21i-free`**: the standard story on Free, with one active goal, so Free goals and the locked history show.
- Automated-only scenarios (sparse, correction, isolation, archived exercise) are integration-test fixtures, not accounts.

## 12. Testing strategy

### API — `apps/web/tests/integration/mobile-goals-history.int.test.ts` (new; route handlers, real DB)

- E1: reconciles first (a goal met by history arrives as a reached card, not active), active order, history count, percent null with no performance.
- E2/E3: archived exercise and gym still resolve; another account's goal → 404; a malformed id → 404.
- E4: valid → 201 and visible in E1; missing exercise, bad weight, bad reps → 400 with field details; second active goal → 409 with `existingGoalId`; same key + same body → the first answer, one row; same key + different body → 409; double submit with two keys → one 201, one 409; bodyweight, machine without gym, and archived gym → 400 with field details; already-reached → `outcome: "completed"`.
- E5: archives; replay → 200 unchanged; `archived: false` → 400; another account → 404.
- E6: idempotent; an active goal → 409 `invalid_state_transition`.
- E7: each `kind`.
- E8: Pro gets records, trend, calls; Free gets the withheld DTO with `locked`; a machine's scope defaults and switches; `sessions=all`; swaps attribute to the performed exercise; a corrected past set changes records, trend, and the goal percent on the next read; an archived exercise resolves.

### Isolation — `tests/integration/isolation/mobile-api.int.test.ts`

One case per new endpoint: B reads or writes A's goal or exercise history → 404 (or B's own empty data), and A's rows are unchanged.

### Static guards and contracts

- Registry gains E1–E8; route guards unchanged and passing.
- Reconcile callers list gains `src/lib/views/goals.ts`.
- `mobile-contracts.test.ts`: the new DTOs are assignable from the server types.

### Mobile (`apps/mobile/tests`)

- Models: goal rows, reached copy, new-goal target rule, history sections Free vs Pro, session rows, chart geometry (0/1/2/many points, flat series, large/small ranges, deload marks, nearest point, scroll width).
- Screens (renderRouter): G1 states, G3 archive alert, G5 field errors and double-tap, X2 Pro and Free, X1 row pushes X2 in the same stack, history from a workout does not touch the workout.

### Unverified by a run (owner checks)

Device feel, chart touch, VoiceOver, Dynamic Type, light/dark on the device (runbook).

## 13. Acceptance criteria

- [ ] Goals tab lists active goals with the web's target, percent, and best; empty, loading, error states.
- [ ] Set a goal from the phone; it appears on the web; retry and double tap make one goal; duplicate, invalid, bodyweight, no-gym, archived cases answer as on the web.
- [ ] A reached goal shows its card once; Done or Set a new goal acknowledges it; it stays in Goal history.
- [ ] Archive goal moves it to history (no undo).
- [ ] Exercise history shows every session as logged (dates, sets, RIR, swaps, workout, gym), across blocks; machines one gym at a time.
- [ ] Records and the chart match the web for a Pro account; a Free account gets the plain history, best set, heaviest, and one Pro note.
- [ ] After a past set is corrected, records, chart, and goal percent change on the next visit.
- [ ] X1's history row opens X2 natively; history from a workout leaves the workout untouched.
- [ ] E1–E8 pass isolation, retry, and compatibility tests; no new native dependency; fingerprint unchanged.

## 14. Explicit non-goals

New formulas, records, or chart types; goal edit or unarchive; dated goals; suggestions; a Today goals block; Weight view; projected overlay; sharing; billing; Production.

## Resolved Decisions

| # | Decision | Rationale | Authority |
| --- | --- | --- | --- |
| RD-1 | Goals live in the existing Goals tab (21d placeholder replaced); G4/G3/G2 push in its stack; G5 is a root modal so every entry point opens one form. | The tab already exists; Today, History, Plan, and the workout stay one tap away. | Q1; 21d RD-12 |
| RD-2 | Goal actions are the web's only: set, archive (no undo, alert first), acknowledge the reached card. No edit, no unarchive, no delete. Replacement = archive then set a new goal (the web's duplicate message). | `goals.ts` has exactly these; Goals spec R9. | Q2; `src/lib/goals/goals.ts` |
| RD-3 | Goals and their progress are Free, including the goal's best e1RM and target e1RM. Exercise-history Pro fields stay withheld by `gateHistory`. | Pitch 19 spec §5 ("Goal progress and the e1RM used for it stay Free"); OVE-120 matrix. | Q3; Pitch 19 |
| RD-4 | The reached moment is the web's calm card on G1 and G3, acknowledged on the server, with one success haptic per goal per app session; not on the logging card. | No duplicate celebration; logging is never interrupted. | Q4; Goals R34, R58 |
| RD-5 | The chart is built from React Native `View`s (rotated segments, dots, squares), no SVG or chart library. | No native module → the runtime fingerprint `f98506f78a` and the installed build `86e673d0` stay valid; one chart needs no library. | Q11; CLAUDE.md (no new deps without flagging) |
| RD-6 | One chart: e1RM for a loaded lift (Pro), reps for a bodyweight lift (Free). The web's Weight view and the projected-RIR overlay stay web-only for now. | The pitch authorizes one chart on e1RM; the reps line is the bodyweight equivalent the web shows Free. | Q9, Q10; pitch §5.9 |
| RD-7 | Long histories: even spacing ≥ 28 pt, horizontal scroll opening at the newest point; no range filter (the web has none); every point stays reachable, and "Show values" lists them all. | Parity; no dropped records. | Q10 |
| RD-8 | Today keeps its 21e–21g content; the web's Today goals block is not added in 21i. | Goals have their own tab; the pitch's scope is the goal screens. Recorded as a parity difference. | Q17; pitch §4 |
| RD-9 | X2 order follows the web page (Next time, Pro note, Records, Trend, Sessions, Goals); "About this exercise" becomes a top row. | Same reading order; X1 already shows About. | Q6; Pitch 16 spec §7 |
| RD-10 | "Set a new goal" target: an archived exercise opens the picker; otherwise the same exercise, with the goal's gym preselected only while active. | The web's `newGoalHrefFor`. | Q5, Q14 |
| RD-11 | Records are the web's: best set, best e1RM (Pro), heaviest weight, rep-record frontier (Pro), most reps (bodyweight). Working sets of finished workouts; deload weeks excluded; per gym for machines. | `computeRecords`, Pitch 16. | Q7, Q8 |
| RD-12 | Session dates push H2 in the current stack; over a workout they are plain text, so nothing stacks a second workout's editor over the live one. | Context is preserved; the workout stays intact. | Q5; pitch §5.7 |
| RD-13 | Freshness: training writes mark goal and history reads stale; screens re-read when shown; no value is computed on the phone. | Q13; no stored derived value. | CLAUDE.md derived-values rule |
| RD-14 | Entitlement changes apply on the next read; a failed read keeps the last answer with the stale banner and never shows Pro values beyond what that answer held. | Q16 | 21g insight read rules |
| RD-15 | Eight additive endpoints (E1–E8); no change to existing responses. | Q15 | 21c RD-12 |
| RD-16 | Scope fits Medium: all logic exists; work is adapters, one view module, native screens, and one chart. | Q18 | Inspection |
| RD-17 | No tour step or release note. | Native tour is 21k; in-app What's New is 21j. | 21g, 21h |
| RD-18 | Tickets are end-to-end per capability: OVE-242 goals; OVE-243 set a goal; OVE-244 exercise history; OVE-245 the chart; OVE-246 fixtures, parity, runbook, and the staging update. Each merges into `staging` through its own PR. The scheduling chore is OVE-241. | The run prompt §23. | Run prompt |
| RD-19 | Visual review artifact: the design canvas https://claude.ai/artifact/4TV52JUVhE5TrH6YveNbk3 (light and dark, illustrative data; private to the owner). It also carries the OVE-241 week strip and swap sheet. | Pipeline guide step 3. | Pipeline guide §5 |
| RD-20 | Manual acceptance uses one primary account (`21i-combined`) and one Free account (`21i-free`); edge cases are automated. | Run prompt §28. | Run prompt |

## Open Questions

1. **(Owner, non-blocking)** Should the phone's Today show the web's goals block (reached cards and up to three active goals)? Default: no (RD-8).
2. **(Owner, non-blocking)** Should the Weight trend and the projected-RIR overlay come to the phone? Default: web only (RD-6).

## 15. Future considerations

- `ExerciseHistoryViewDto` is an object, so a weight series or a range filter can be added without a contract break.
- The chart component can serve the Weight view later with no new dependency.
