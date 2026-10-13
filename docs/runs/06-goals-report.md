# Pitch 6 — Goals — Run Report

Autonomous pipeline run for **Goals** (slug `06-goals`), Linear project
**Overload V1** (`P-OVE-1`). Classification: UI-bearing, merge-on-green (creates
and archives Goal records; never writes, deletes, or edits `LoggedSet` history,
never alters Gym baselines, RLS, or auth).

## Delivery

- **Feature PR:** [#36](https://github.com/troyrhodes02/overload-training/pull/36) — `feat/06-goals` → `main`
- **Merge status:** _REVIEW_PENDING_
- **Linear issues** (milestone *Goals*, `839d13f4-6bd3-4734-8b18-431a4b9b5f46`; chained via blockedBy; all In Review with PRs merged into the feature branch):
  - **OVE-30** — Goal model, derived progress & creation flow — PR #37
  - **OVE-31** — Goal completion, acknowledgement, manual archive & history — PR #38
  - **OVE-32** — Goals on the dashboard & post-session summary — PR #39
- **Artifacts:** pitch `pitches/06-goals.md`; design `docs/design/06-goals-design-doc.md`; preview `docs/previews/06-goals-preview.tsx`; spec `docs/specs/06-goals-spec.md` (Resolved Decisions R1–R68); runbook `docs/runs/06-goals-runbook.md`; progress `docs/runs/06-goals-progress.md`.

## Goal model

`Goal` (existing Foundation table, extended by additive migration `5_goals`):

| Field | Notes |
| ----- | ----- |
| `exerciseId` | stable Exercise identity (FK Restrict) |
| `gymId` (new, nullable) | measurement Gym — set **iff** `isGymVariable(exercise)`; FK Restrict |
| `targetWeightLbs` `Decimal(6,2)`, `targetReps` | lifter-authored target; CHECK `> 0` / `≥ 1` |
| `status` `active \| archived` | existing enum |
| `archiveReason` (new) `completed \| manual` | why it left the active list |
| `archivedAt` (new) | completion time when reason = completed |
| `completionAcknowledgedAt` (new) | the one-time "Goal reached" card was dismissed |

- **Lifecycle:** `active → archived/completed` (automatic, once) or `active → archived/manual` (lifter). Archived never returns to active. CHECK `goals_lifecycle_consistent` keeps the columns coherent; `goals_ack_completed_only` limits acknowledgement to completed goals.
- **One active goal per exercise — global:** partial unique index `goals_one_active_per_exercise (exercise_id) WHERE status='active'`; the app pre-checks and returns `conflict` (with `existingGoalId`) — blocked, never replaced, also when a different Gym is chosen.
- **No hard delete:** no delete path exists (static guard); FKs are Restrict.
- **No stored performance:** no percent / current / best / target e1RM / date column (static schema guard).

## e1RM reuse

- Goal code imports **`estimateOneRepMax` from `src/lib/progression/e1rm.ts`** (Pitch 5) for the target, and Pitch 5's **`sessionE1rm`** (via `getQualifyingSessionE1rms`) for current best.
- Behavior-preserving refactor in Pitch 5's module: `bestWorkingSet` (the set behind `sessionE1rm`; `sessionE1rm` returns identical values) and `getQualifyingSessionE1rms` (read-only export built on the existing `gatherRows` + `qualifyingSequence`). All Pitch 5 suites unchanged and green.
- **Proof no second formula exists:** `grep -rn "reps / 30" src` matches only `src/lib/progression/e1rm.ts`; `export function estimateOneRepMax` is defined once; invariant guards assert both, plus that `src/lib/goals/progress.ts` imports the canonical estimator and that goal UI computes no goal math.

## Progress semantics

- **Current best** = maximum qualifying **session-level** e1RM in scope, across all mesocycles. Qualifying = Pitch 5's: session `complete`, all planned working sets present, not a scheduled-deload week, performed exercise (swaps count to what was done).
- **Best, not latest:** a weaker newer session never lowers it (tie → earliest).
- **Existing history counts immediately** — no goal start-date filter.
- **Percent** = `min(100, floor(best / target × 100 + 1e-9))` — floored so only a met target reads 100; capped at 100; precise ratio internally.
- **No history** → `percent: null`, UI "No performance recorded yet" (never 0%, no bar).
- **Reached** = `best ≥ target − 1e-9` (identical weight × reps always counts).

## Gym behavior

- **Gym-consistent** (`!isGymVariable`): no Gym stored or accepted (a submitted `gymId` is rejected); history spans all gyms.
- **Gym-variable** (machine/cable): an **active** Gym is required at creation; progress uses only that Gym's qualifying history.
- **Global one-active-goal rule holds** for gym-variable exercises — a second goal at another Gym is a `conflict`.
- **No cross-Gym machine comparison, no conversion ratios; `GymExerciseBaseline` is never read** by goal code (static guard) and never counts as evidence (integration test: baseline present, no performance → unmeasured).

## Completion

- **Already-achieved creation:** `createGoal` inserts and runs the completion engine for the new goal in the same transaction → `archived/completed` with `archivedAt = createdAt` ("Already reached" variant of the card); no artificial active goal remains.
- **Reconciliation mechanism (one engine):** `reconcileGoalCompletions` — a conditional `updateMany WHERE id AND status='active'` — called (a) inside `createGoal`, (b) post-commit and best-effort (`reconcileGoalCompletionsSafely`) after `logSetAction`, `completeWorkoutAction`, `editLoggedSetAction`, and (c) at request time before `/goals`, `/goals/[goalId]`, `/goals/history`, and the non-pending dashboard render. It never runs inside a LoggedSet transaction; a failure is logged and swallowed (unit-tested), so goals can never fail or roll back a logged set. No cron, no queue.
- **Idempotency:** a goal transitions at most once; repeated and concurrent reconciliations return `[]` and never rewrite `archivedAt` (integration-tested).
- **One-time acknowledgement:** `completionAcknowledgedAt`, set once by **Done** or **Set a new goal**; idempotent.
- **Completed-goal stability:** a downward correction after completion leaves the goal `archived/completed` with the same `archivedAt` (integration-tested). No code path sets `status = active` on an existing goal.
- **Next goal:** "Set a new goal" opens a **blank** form for the same lift (and its Gym if still active); no goal is ever created automatically (static + integration guard).

## Archive interactions

- **Exercise archived:** its active goal stays listed/readable with an "Exercise archived" marker and can be archived by hand; new goals for it are refused (picker excludes it; server rejects it). No hidden side effect added to the Pitch 2 archive flow.
- **Gym archived:** a machine goal there stays readable, still scoped to that Gym ("Gym archived"), never remapped; new goals can't target that Gym.
- **Manual archive:** confirmation dialog, no undo, record kept, exercise freed.
- **History:** `/goals/history` (newest first) with outcome + dates; archived exercises/gyms named "(archived)"; archived detail shows the outcome, not a re-derived percentage.

## UI

- **Preview:** `docs/previews/06-goals-preview.tsx` (written as `.tsx` per the run prompt's explicit gate and the Pitch 4/5 precedent; the `overload-ui-design` skill and a stored preference default to `.html` — flagged for the lifter).
- **Conformance:** verified in a real browser against the local Supabase CLI stack (phone 375px light + dark, desktop): goals list with reached card / measured / no-history rows, picker with "Active goal", free and machine forms (blank numbers, gym helper), inline validation, duplicate alert, measured and no-history detail, archive dialog, history, archived detail with "Set a new goal", and the missed-day dashboard showing no goal content. No console errors, no horizontal overflow. Accent-only goal surfaces; no progress/deload color on any goal element.
- **Justified deviations:** (1) dates render in UTC ("Oct 13, 2026"), following the app's all-UTC calendar convention (Pitch 4 deferred a lifter timezone). (2) A "Gym archived" outline badge sits on the gym line rather than replacing it, matching the preview's archived-context frame. (3) The preview's dashboard frames show a "trend ›" summary from Pitch 5; the implementation keeps Pitch 5's existing summary exactly and appends the Goals rows below it.

## Verification

_VERIFICATION_PENDING_

## Review

_REVIEW_PENDING_

## Required upstream amendments

Recorded per the run prompt; no approved planning doc was edited.

1. **Gym-variable Goal context:** a machine/cable Goal requires a Gym so its target and progress use comparable history.
2. **One active Goal per Exercise remains global:** a Gym-variable Exercise cannot have simultaneous active Goals at multiple Gyms.
3. **Current best:** maximum qualifying historical session-level e1RM in the applicable Pitch 5 scope (scheduled-deload performances excluded, as in Pitch 5's qualifying sequence).
4. **Goal progress source:** best historical performance, not latest.
5. **No-history state:** unknown/unmeasured, not 0%.
6. **Manual archive** supported; Goal hard-delete is not (and archive has no undo).
7. **Completed Goal stability:** completed Goals never reopen after historical corrections.
8. **Already-achieved creation:** completes immediately when existing qualifying history already satisfies it.
9. **Archived Exercise/Gym:** existing Goal history stays visible; an active Goal is never silently destroyed and may be manually archived.
10. **Celebration:** restrained one-time acknowledgement; no gamification framework.
11. **Architecture Goal model amendment:** the Data Model's Goal entry ("references an Exercise, target weight, target rep count, status (active/archived), timestamps") should add optional **Gym scope**, **archive reason (completed/manual)**, **archived-at**, and **completion-acknowledged-at**, and state that one-active-per-Exercise is enforced by a partial unique index.
12. **Architecture Open Question resolved:** "second active goal blocked or replaces" → **blocked**.
13. **Percentage display rule:** floored (not rounded) whole percent so 100% appears only when the target is met — a refinement of the PRD's "percentage" not stated upstream.
14. **Completion boundary:** completion is a stored lifecycle event reconciled post-commit and at read time (never in the logging transaction); the Architecture "Consistency & State" section should mention it beside `GymExerciseBaseline` as the second stored, non-derived state.

## Downstream status

No remaining core feature depends on Goals. **Cardio Logging (Pitch 7) must remain independent of strength progression, e1RM, and Goal logic** — no shared abstraction was created; a static guard asserts goal code contains no cardio references.
