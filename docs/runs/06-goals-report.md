# Pitch 6 — Goals — Run Report

Autonomous pipeline run for **Goals** (slug `06-goals`), Linear project
**Overload V1** (`P-OVE-1`). Classification: UI-bearing, merge-on-green (creates
and archives Goal records; never writes, deletes, or edits `LoggedSet` history,
never alters Gym baselines, RLS, or auth).

## Delivery

- **Feature PR:** [#36](https://github.com/troyrhodes02/overload-training/pull/36) — `feat/06-goals` → `main`
- **Merge status:** ✅ Squash-merged into `main` on green — final feature commit **`407c7f4`** ("Goals (Pitch 6) (#36)").
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
- **Justified deviations:** (1) Goal dates render in UTC (e.g. "Oct 13, 2026" for an evening-CDT action), following the app's all-UTC calendar convention (Pitch 4 deferred a lifter timezone). (2) The preview's day-complete frame abbreviates Pitch 5's summary rows; the implementation keeps Pitch 5's summary exactly and appends the Goals rows beneath it. The dashboard goal block (day complete / rest / no plan) was verified by unit and integration tests; the local stack's dashboard was in a missed-day state, which correctly showed no goal content.

## Verification

Run on the integrated feature branch after the audit fixes (tree identical to the merged commit) and re-confirmed on `main` post-merge:

| Check | Result |
| ----- | ------ |
| `npm run lint` | ✅ clean |
| `npm run typecheck` | ✅ clean (the post-merge run first hit a stale, git-ignored `.next/dev/types` file left by the local dev server; cleared, then clean) |
| `npm run format:check` | ✅ clean |
| `npm test` (unit) | ✅ 271 passed / 25 suites |
| `npm run test:integration` (embedded Postgres) | ✅ 219 passed / 17 suites |
| `npm run build` | ✅ compiled (goal routes dynamic or partial-prerendered; no build-time reconciliation) |
| `npm run test:e2e` (Playwright) | ✅ 22 passed (incl. 5 Goals auth-boundary routes) |
| `npm run verify:client-bundle` | ✅ no server secret in `.next/static` |
| GitHub checks on #36 | ✅ Vercel build + preview comments |
| Local browser check (Supabase CLI stack) | ✅ phone light/dark + desktop; no console errors; no horizontal overflow |

Goals proofs (automated unless noted):

- **Canonical e1RM reuse:** guards assert `estimateOneRepMax` is defined once, there is no `reps / 30` outside `e1rm.ts`, `progress.ts` imports the canonical estimator, and goal UI computes no goal math. Unit tests: a 1-rep target equals the weight; 225 × 12 goes through the estimator.
- **Target validation:** missing exercise; missing, zero, negative, non-numeric, or over-limit weight; missing, zero, negative, non-whole, or over-limit reps; archived or unknown exercise rejected; extra form fields (date, e1RM) never read.
- **Gym-consistent creation:** no gym required; a submitted gym is rejected; best spans gyms.
- **Gym-variable creation:** gym required; archived gym rejected; progress only at the selected gym; another gym's heavier history and a baseline row are ignored.
- **One active goal per exercise:** a second goal is a `conflict` (with `existingGoalId`), never a replacement, also at a different gym; different exercises coexist; a raw second active insert fails on the partial unique index.
- **Manual archive:** record kept as `archived/manual`; exercise freed; re-archive is `invalid_state_transition`; no delete path (static guard).
- **Current best:** max selected; weaker newer session ignored; tie keeps earliest; a swap counts to the performed exercise only; partial, in-progress, and scheduled-deload performances excluded.
- **No-history:** `percent: null`, never 0%.
- **Percentage:** below (87%), exact (100%, reached), above (capped at 100, ratio > 1), 99.6% shows 99, float-stable.
- **Existing history:** a goal created long after the history uses it immediately (no start-date filter).
- **Already-achieved creation:** `archived/completed` immediately with `archivedAt = createdAt`; no active goal remains; slot freed.
- **Automatic completion:** below target stays active; exact target completes; through the real `logSet` + `completeWorkout` path it completes once and the record is kept.
- **Idempotency:** repeated and concurrent reconciles make one transition and never change `archivedAt`; acknowledgement is recorded once.
- **New goal flow:** no goal is created automatically (count stays 1; static guard: only `createGoalAction` creates goals); the "Set a new goal" link carries no numbers.
- **Historical correction, active goal:** `editLoggedSet` moves 87% → 79% → 90% with nothing stored; an upward correction completes on reconcile.
- **Historical correction, completed goal:** a downward correction leaves the goal `archived/completed` with the same `archivedAt`.
- **No logged-history mutation:** create, reconcile, archive, and acknowledge leave `LoggedSet` rows (values and `updatedAt`) and baselines byte-identical; static guards: goal code never writes logged history, baselines, plan, exercises, or gyms; the existing LoggedSet write-path guard stays green.
- **Exercise / Gym archive:** goals stay readable and marked; new goals refused; gym never remapped; hard delete of a referenced exercise or gym rejected by FK Restrict.
- **Dashboard:** unit test: goals shown only for complete / rest / no plan, never for missed-day / pending / in-progress. Visual: the missed-day dashboard showed no goal content.
- **Post-session:** touched goal 87% → 90%; completed-by-this-workout shows "Goal reached"; untouched goals, goals created after the workout, and machine goals at another gym are absent; swaps count to the performed exercise; in-progress and scheduled-deload sessions touch nothing; a goal completed earlier is not re-announced.
- **UI-preview conformance (visual):** browser screenshots matched the preview's goal list, reached card, picker, forms, validation, duplicate alert, detail (measured / no-history), archive dialog, history, archived detail, mobile action bars, and both appearance modes.
- **No forbidden scope:** static guards: no date/deadline/pace/feasibility/gamification/cardio terms in goal code or copy, no progress/date columns on `Goal`, no confetti/notification/scheduler dependency.

## Review

`/code-review` (high) on PR #36 posted **10 inline findings**. `/overload-review-audit` dispositions (summary comment on #36):

| # | Finding | Disposition |
|---|---|---|
| 1 | Session summary showed goals created after the workout | **Implemented**: `createdAt ≤ completedAt` bound; regression test |
| 2 | `createGoal`'s in-transaction reconcile read on a second connection | **Implemented**: optional read client threaded through Pitch 5's read layer (read-only) |
| 3 | New-goal pages didn't reconcile before render | **Implemented** |
| 4 | Set-save reconcile ran per-goal reads sequentially | **Implemented**: parallel measurement (scan-all kept, R56) |
| 5 | History read 2–3× per render | **Skipped**: negligible at one-user scale; CLAUDE.md rejects performance coupling |
| 6 | Mutation during server render vs CLAUDE.md data-access rule | **Discussed, kept** (spec R54, run decision #31); amendment 15 below |
| 7 | Scope rule duplicated between engine and reads | **Implemented**: single `goalPerformances` |
| 8 | Summary re-derived the reached rule | **Implemented**: `computeGoalProgress(...).reached` |
| 9 | Redundant `sessionE1rm` recompute | **Skipped**: keeps one authority for session e1RM |
| 10 | "Already reached" relies on a shared timestamp | **Deferred**: narrow code comment at `createGoal` |

**Implement 6 · Defer 1 · Skip 2 · Discuss 1.** No blocking finding; nothing expanded scope.

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

15. **CLAUDE.md data-access note:** "Mutations run through server actions" should acknowledge the one sanctioned exception: the idempotent Goal completion reconciliation (through the Goal write module) that goal-bearing server components run at request time, behind auth.
16. **Preview format:** the run prompts name `.tsx` previews while the `overload-ui-design` skill and a stored preference say `.html`; Pitches 4–6 followed the run prompts. One convention should be chosen upstream.

## Downstream status

No remaining core feature depends on Goals. **Cardio Logging (Pitch 7) must remain independent of strength progression, e1RM, and Goal logic** — no shared abstraction was created; a static guard asserts goal code contains no cardio references.
