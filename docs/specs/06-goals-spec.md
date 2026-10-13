---
version: 1.0.0
status: approved
author: Autonomous pipeline (Pitch 6 run)
last_updated: 2026-10-12
pitch_reference: pitches/06-goals.md
design_reference: docs/design/06-goals-design-doc.md
preview_reference: docs/previews/06-goals-preview.tsx
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
method_note_reference: docs/planning/method-note.md
upstream_spec: docs/specs/05-progressive-overload-engine-spec.md
linear_issue: (milestone "Goals", Overload V1)
---

# Goals — Technical Spec

## 2. Summary

Goals lets the lifter store a **user-authored, undated strength target** — one Exercise, a target weight, a target rep count, and (for a machine/cable Exercise) the Gym it is measured at — and shows how close his **demonstrated** strength is to it. The core abstraction is a split between two kinds of state: the **Goal record** (stored: target, context, lifecycle) and **Goal progress** (derived on every read: target e1RM, best qualifying session e1RM, ratio, displayed percentage). Progress is computed by Pitch 5's canonical `estimateOneRepMax` over Pitch 5's qualifying performances; nothing about performance is ever stored on a Goal.

The one place derived state becomes a stored event is **completion**. When the best qualifying session e1RM meets the target e1RM, a single idempotent, conditional transition (`active → archived`, reason `completed`) records it. That transition lives in exactly one function, `reconcileGoalCompletions`, which runs at a small set of server-side boundaries — after a goal is created, after a workout completes / a set is logged / a past set is edited (post-commit, best-effort), and before goal-bearing pages render. It never runs inside a `LoggedSet` transaction, so a Goal problem can never roll back training history. Once archived, a Goal never reopens.

"Working" means: Bench 315 × 1 with a best qualifying session of 235 × 5 reads **87%**; a weaker later session does not lower it; correcting that 235 to 245 raises it on the next read; logging 160 × 7 on Overhead Press against a 155 × 8 goal completes it, archives it, shows one calm "Goal reached" card until acknowledged, and offers a blank form for the next goal; a Chest Press Machine goal at Downtown Gym ignores every Chest Press Machine session at Campus Rec Center; and a second active Bench goal is refused at any gym.

## 3. Problem

- The app cannot yet hold a long-term target, so "how close am I to 315 × 1?" is unanswerable.
- It computes e1RM (Pitch 5) but nothing compares it to a target the lifter chose.
- It has no lifecycle for a target being reached, no acknowledgement, and no history of past targets.
- The dashboard's day-complete / rest state has nothing to lead with (PRD: "surfacing something like active goal progress").

Goals depends on Pitch 5 (shared e1RM) and has no downstream dependent. Cardio Logging (Pitch 7) stays independent of it.

## 4. Scope and non-scope

### In scope

- Goal persistence: optional Gym scope, lifecycle metadata (archive reason/time, completion acknowledgement), one-active-per-Exercise DB uniqueness, positivity checks. Migration `5_goals`.
- Goal creation (active Exercise; active Gym iff gym-variable; positive weight; whole reps ≥ 1; duplicate blocked; already-achieved completes immediately).
- Goal progress (target e1RM, best qualifying session e1RM in scope, no-history, floored percent capped at 100).
- Completion reconciliation (one engine, several boundaries), idempotency, completed-goal stability, one-time acknowledgement.
- Manual archive (no undo, no delete).
- UI: nav item, `/goals`, `/goals/new`, `/goals/new/[exerciseId]`, `/goals/[goalId]`, `/goals/history`, dashboard goal block, post-session goal rows, Goal-reached card.
- A non-behavioral refactor of Pitch 5's read layer to export qualifying session e1RM performances, and of `e1rm.ts` to expose the best working set.

### Out of scope

- Dates, deadlines, reminders, projected completion, on-track/behind, pacing, feasibility, difficulty, rate prediction (Post-MVP "Dated Goals").
- Suggested / generated / auto-incremented goals; goal-driven plan, rep-range, threshold, or baseline changes.
- Editing a goal's target in place; goal hard delete; undoing an archive; reopening an archived goal.
- A per-goal chart (the Exercise e1RM trend already exists — linked, not duplicated).
- Notifications, streaks, badges, XP, confetti, sound.
- Cardio / nutrition / body-composition goals.

## 5. Core concepts

| Concept | Stored? | Description |
| ------- | ------- | ----------- |
| `Goal` | yes | One target for one Exercise: `targetWeightLbs × targetReps`, optional `gymId`, lifecycle. |
| Goal scope | derived from record | `gymId` null → **global** (all gyms) for a gym-consistent Exercise; `gymId` set → that Gym only for a gym-variable Exercise. Decided by `isGymVariable(exercise)` at creation. |
| Target e1RM | no | `estimateOneRepMax(targetWeightLbs, targetReps)` — 1 rep → the weight. |
| Qualifying performance | no | Pitch 5's: a `LoggedExercise` whose session is `complete`, with all planned working sets present, not in a scheduled-deload week, for the **performed** exercise, in scope. |
| Session e1RM | no | Pitch 5's `sessionE1rm(workingSets)` — max Epley over the performance's planned working sets. |
| Current best | no | Max session e1RM over qualifying performances in scope, across all mesocycles, regardless of when the goal was created. `null` when none. |
| Progress ratio | no | `currentBest / targetE1rm` (precise). |
| Display percent | no | `min(100, floor(ratio × 100 + 1e-9))`. Absent (null) when unmeasured. |
| Reached | no (until reconciled) | `currentBest ≥ targetE1rm − 1e-9`. |
| Completion | **yes, once** | The stored lifecycle event `archived/completed` with `archivedAt`. Never reverted. |
| Acknowledgement | yes, once | `completionAcknowledgedAt` — the reached card has been seen and dismissed. |

Invariants:

- **At most one `active` Goal per Exercise**, regardless of Gym (partial unique index).
- **Goals never write** `LoggedSet`, `LoggedExercise`, `LoggedSession`, `GymExerciseBaseline`, `Session`, `SessionExercise`, `Mesocycle`, `Exercise`, or `Gym`.
- **`GymExerciseBaseline` is never read** by goal progress.
- **No stored performance on a Goal**: no percent, current/best e1RM, target e1RM, progress, date target.
- No ownership column (single-user).

## 6. States and lifecycle

```text
Goal.status: active | archived
Goal.archiveReason (archived only): completed | manual
```

| From | To | Trigger | Side effects |
| ---- | -- | ------- | ------------ |
| (none) | `active` | `createGoal` | — |
| (none) → `active` → `archived/completed` (same transaction) | | `createGoal` when existing history already meets the target | `archivedAt = createdAt` (marks "already reached") |
| `active` | `archived/completed` | `reconcileGoalCompletions` finds `reached` | `archivedAt = now`; acknowledgement pending |
| `active` | `archived/manual` | `archiveGoal` (lifter) | `archivedAt = now` |
| `archived/completed` (unacknowledged) | same, acknowledged | `acknowledgeGoalCompletion` | `completionAcknowledgedAt = now` (once) |
| `archived/*` | `active` | — | **never** (no reopen, no undo) |
| any | deleted | — | **never** |

The completion transition is a conditional update (`WHERE id = ? AND status = 'active'`), so repeated or concurrent reconciliations transition a goal at most once and never rewrite `archivedAt`.

## 7. UI integration

Detailed UI: design doc Screens 1–9 and the preview.

| Screen | Route | Data | Actions |
| ------ | ----- | ---- | ------- |
| Goals overview | `/goals` | `listUnacknowledgedCompletions()`, `listActiveGoals()`, `countGoalHistory()` | New goal; open goal; ack (card) |
| Pick exercise | `/goals/new` | `listExercises(filters)` (library query; active only) + `activeGoalExerciseMap()` | open form / open existing goal |
| Target form | `/goals/new/[exerciseId]` | `getGoalFormContext(exerciseId, gymId?)` | `createGoalAction` |
| Goal detail | `/goals/[goalId]` | `getGoalDetail(goalId)` | `archiveGoalAction`; ack (card) |
| Goal history | `/goals/history` | `listGoalHistory()` | open goal |
| Dashboard | `/` (day complete / rest / no plan only) | `getSessionGoalSummary(loggedSessionId)`, `listUnacknowledgedCompletions()`, `listActiveGoals()` (first 3) | ack (card) |

Pages that show goal state call `reconcileGoalCompletionsSafely()` **before** reading (see §11b).

Client islands (call server actions only): `GoalTargetForm`, `ArchiveGoalButton`, `GoalReachedCard` actions. Everything else is server-rendered. **No goal math in React components** — components receive DTOs with `percent`/labels precomputed.

shadcn/ui: `Dialog` for archive (not destructive variant), `Select` for gym, `Input` (`inputMode` decimal/numeric), `Alert` for duplicate/no-gym, `Badge variant="outline"` for archived context, `Skeleton` loaders, Sonner toasts. Goal surfaces use `primary`/`muted` tokens only — never `progress`/`deload`.

Nav: `AppNav` gains `{ href: "/goals", label: "Goals", icon: Target }` after History.

## 8. Data model

### Relationship to existing schema

| From | Relation | To | Description |
| ---- | -------- | -- | ----------- |
| `Goal.exerciseId` | many → one, `Restrict` | `Exercise` | existing; stable identity |
| `Goal.gymId` | many → one, optional, `Restrict` | `Gym` | **new**; set iff gym-variable |

### Updated model

```prisma
/// Goals (Pitch 6): why an archived goal left the active list.
enum GoalArchiveReason {
  completed
  manual
}

model Goal {
  id              String             @id @default(uuid()) @db.Uuid
  exerciseId      String             @map("exercise_id") @db.Uuid
  /// Measurement gym — set iff the Exercise is gym-variable (machine/cable).
  gymId           String?            @map("gym_id") @db.Uuid
  targetWeightLbs Decimal            @map("target_weight_lbs") @db.Decimal(6, 2)
  targetReps      Int                @map("target_reps")
  status          GoalStatus         @default(active)
  archiveReason   GoalArchiveReason? @map("archive_reason")
  archivedAt      DateTime?          @map("archived_at") @db.Timestamptz
  /// The one-time "Goal reached" card was dismissed. Completed goals only.
  completionAcknowledgedAt DateTime? @map("completion_acknowledged_at") @db.Timestamptz
  createdAt       DateTime           @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime           @updatedAt @map("updated_at") @db.Timestamptz

  exercise Exercise @relation(fields: [exerciseId], references: [id], onDelete: Restrict)
  gym      Gym?     @relation(fields: [gymId], references: [id], onDelete: Restrict)

  // No progress / e1RM / percent column: progress is derived on read.
  // One active goal per exercise: partial unique index goals_one_active_per_exercise (migration 5).
  @@index([exerciseId])
  @@index([gymId])
  @@index([status])
  @@map("goals")
}
```

`Gym` gains `goals Goal[]`.

### Migration `5_goals` (hand-written, additive)

```sql
CREATE TYPE "GoalArchiveReason" AS ENUM ('completed', 'manual');

ALTER TABLE "goals"
  ADD COLUMN "gym_id" UUID,
  ADD COLUMN "archive_reason" "GoalArchiveReason",
  ADD COLUMN "archived_at" TIMESTAMPTZ,
  ADD COLUMN "completion_acknowledged_at" TIMESTAMPTZ;

ALTER TABLE "goals" ADD CONSTRAINT "goals_gym_id_fkey"
  FOREIGN KEY ("gym_id") REFERENCES "gyms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "goals_gym_id_idx" ON "goals"("gym_id");
CREATE INDEX "goals_status_idx" ON "goals"("status");

-- At most one active goal per exercise, at any gym.
CREATE UNIQUE INDEX "goals_one_active_per_exercise" ON "goals"("exercise_id") WHERE "status" = 'active';

ALTER TABLE "goals" ADD CONSTRAINT "goals_target_positive"
  CHECK ("target_weight_lbs" > 0 AND "target_reps" >= 1);
ALTER TABLE "goals" ADD CONSTRAINT "goals_lifecycle_consistent" CHECK (
  ("status" = 'active'   AND "archive_reason" IS NULL     AND "archived_at" IS NULL     AND "completion_acknowledged_at" IS NULL)
  OR
  ("status" = 'archived' AND "archive_reason" IS NOT NULL AND "archived_at" IS NOT NULL)
);
ALTER TABLE "goals" ADD CONSTRAINT "goals_ack_completed_only"
  CHECK ("completion_acknowledged_at" IS NULL OR "archive_reason" = 'completed');
```

No table is created, so no new RLS statement is needed; `goals` already has RLS enabled with no policies (migration `0_init`), and the RLS test continues to assert it. No row is inserted, updated, or deleted; nothing is dropped. The `goals` table has no application writer before this pitch, so the new constraints hold for any existing row (default `active`, nulls).

### Derived fields

| Field | Stored? | Computed from |
| ----- | ------- | ------------- |
| `targetE1rm` | no | `estimateOneRepMax(targetWeightLbs, targetReps)` |
| `bestE1rm` / `bestSet` / `bestDateIso` | no | qualifying performances in scope (Pitch 5 read layer) |
| `percent` | no | floor(best/target × 100), ≤ 100; null if no history |
| `reached` | no | `best ≥ target − ε` |
| `alreadyReached` | no | `archiveReason = completed AND archivedAt = createdAt` |
| `status/archiveReason/archivedAt` | yes | lifecycle |

## 9. Authorization and access control

Every goal route lives under `src/app/(app)` (layout `requireUser()`; `proxy.ts` redirect). Every goal server action calls `requireUser()` first. Goals are read/written only through Prisma in `src/lib/goals/*`; the Supabase client never touches `goals`. RLS deny-all remains on `goals`. No delete operation exists for goals.

## 10. Storage model

Not applicable.

## 11. Server actions and API surface

`src/app/(app)/goals/actions.ts` — each action: `requireUser()` → write module → `ActionResult`.

```ts
type GoalFormState = {
  result: ActionResult<{ id: string; outcome: "active" | "completed" }> | null;
  values: { exerciseId: string; gymId: string; targetWeightLbs: string; targetReps: string };
};

// createGoalAction(prev: GoalFormState, formData: FormData): Promise<GoalFormState>
//   success → redirect(`/goals/${id}`) (outcome "active": `?created=1` → "Goal set" toast;
//             outcome "completed": no toast, the page leads with the Goal-reached card)
//   failure → values echoed back; errors per field in result.error.details;
//             duplicate → code "conflict", details.existingGoalId.

// archiveGoalAction(goalId: string): Promise<ActionResult<{ id: string }>>
//   active → archived/manual. Already archived → invalid_state_transition. Unknown → not_found.

// acknowledgeGoalCompletionAction(goalId: string): Promise<ActionResult<{ id: string }>>
//   Sets completionAcknowledgedAt once. Idempotent when already acknowledged.
//   Active or manually archived goal → invalid_state_transition. Unknown → not_found.
```

Existing actions gain a **post-commit, best-effort** reconciliation (they await the write first; the reconciliation is wrapped so it can never change the action's result):

| Action | After success |
| ------ | ------------- |
| `completeWorkoutAction` | `await reconcileGoalCompletionsSafely()` |
| `logSetAction` | `await reconcileGoalCompletionsSafely()` |
| `editLoggedSetAction` | `await reconcileGoalCompletionsSafely()` |

## 11a. Domain modules

| Module | Kind | Contents |
| ------ | ---- | -------- |
| `src/lib/progression/e1rm.ts` | pure (Pitch 5) | + `bestWorkingSet(sets)`; `sessionE1rm` re-expressed through it (**no behavior change**) |
| `src/lib/progression/queries.ts` | read (Pitch 5) | + `getQualifyingSessionE1rms(exerciseId, gymId \| null)` built on the existing `gatherRows` + `qualifyingSequence` (read-only) |
| `src/lib/goals/progress.ts` | pure | `goalTargetE1rm`, `bestPerformance`, `computeGoalProgress`, `displayPercent`, `formatGoalTarget` |
| `src/lib/goals/validation.ts` | pure | `parseGoalInput(raw)` |
| `src/lib/goals/goals.ts` | **the only Goal writer** | `createGoal`, `archiveGoal`, `acknowledgeGoalCompletion`, `reconcileGoalCompletions`, `reconcileGoalCompletionsSafely` |
| `src/lib/goals/queries.ts` | read (`server-only`) | DTO builders listed in §13 |

```ts
// src/lib/progression/e1rm.ts (addition)
export function bestWorkingSet<T extends { weightLbs: number; reps: number }>(sets: T[]): T | null;
// sessionE1rm(sets) === (best ? estimateOneRepMax(best.weightLbs, best.reps) : 0)  — unchanged results

// src/lib/progression/queries.ts (addition)
export type QualifyingE1rm = {
  loggedExerciseId: string;
  loggedSessionId: string;
  dateIso: string;
  gymId: string | null;
  e1rm: number;                                // precise (unrounded) session e1RM
  bestSet: { weightLbs: number; reps: number }; // the working set that produced it
};
export async function getQualifyingSessionE1rms(
  exerciseId: string,
  gymId: string | null, // null → all gyms; id → that gym only
): Promise<QualifyingE1rm[]>; // chronological

// src/lib/goals/progress.ts
export const GOAL_REACHED_EPSILON = 1e-9;
export function goalTargetE1rm(targetWeightLbs: number, targetReps: number): number; // = estimateOneRepMax
export function bestPerformance(perfs: QualifyingE1rm[]): QualifyingE1rm | null;     // max e1rm; ties → earliest
export function displayPercent(ratio: number): number;                              // min(100, floor(r×100+ε))
export type GoalProgress = {
  targetE1rm: number;
  best: { e1rm: number; weightLbs: number; reps: number; dateIso: string } | null;
  ratio: number | null;
  percent: number | null;   // null ⇔ no qualifying history ("No performance recorded yet")
  reached: boolean;         // best.e1rm >= targetE1rm − ε
};
export function computeGoalProgress(
  target: { targetWeightLbs: number; targetReps: number },
  perfs: QualifyingE1rm[],
): GoalProgress;
```

## 11b. Completion reconciliation (the one engine)

```ts
// src/lib/goals/goals.ts
export async function reconcileGoalCompletions(
  opts?: { goalIds?: string[]; now?: Date },
  tx?: Prisma.TransactionClient,
): Promise<string[]>; // ids that transitioned in THIS call
```

1. Load `active` goals (optionally restricted to `goalIds`) with their exercise.
2. For each, gather qualifying performances in its scope (`gymId` for gym-variable, else global) and `computeGoalProgress`.
3. If `reached`: `updateMany({ where: { id, status: "active" }, data: { status: "archived", archiveReason: "completed", archivedAt: now } })`; the id is returned only when `count === 1`.

Properties:

- **Deterministic & idempotent:** a goal transitions at most once; a second call finds it archived and does nothing; `archivedAt` is written once.
- **Never inside a logging transaction:** callers run it after the `LoggedSet` / session write has committed. `reconcileGoalCompletionsSafely()` catches and logs any error and returns `[]`, so a Goal failure cannot fail or roll back a set write, a workout completion, or a page render.
- **Recoverable:** if a post-commit reconciliation is missed (crash, error), the next goal-bearing read reconciles. No cron, no queue.
- **One engine:** `createGoal`, the three logging actions, and the goal-bearing pages all call this function; nothing else writes `status = archived, archiveReason = completed`.

Call sites:

| Boundary | Call |
| -------- | ---- |
| `createGoal` | inside its transaction, `reconcileGoalCompletions({ goalIds: [id], now: createdAt }, tx)` |
| `completeWorkoutAction`, `logSetAction`, `editLoggedSetAction` | after success: `reconcileGoalCompletionsSafely()` |
| `/goals`, `/goals/[goalId]`, `/goals/history`, dashboard (day complete / rest / no plan) | before reading: `reconcileGoalCompletionsSafely()` |

## 11c. Create / archive / acknowledge

`createGoal(raw, now = new Date())` in one `prisma.$transaction`:

1. `parseGoalInput` (§12) — field errors → `validation_error` with `details`.
2. Exercise must exist and have `deletedAt = null` → else `validation_error` (`exerciseId: "Pick an active exercise."`).
3. `gymVariable = isGymVariable(exercise)`:
   - gym-variable: `gymId` required, must exist and be active → `gymId: "Choose the gym this goal is measured at."` / `"That gym is archived. Choose an active gym."`;
   - gym-consistent: `gymId` must be absent → `gymId: "This lift isn't measured per gym."`.
4. If an `active` goal exists for the exercise → `conflict`: "{Exercise} already has an active goal. Archive it to set a different one." with `details.existingGoalId`. (The partial unique index is the backstop for a concurrent insert: a `P2002` is mapped to the same `conflict`.)
5. Insert `active` with `createdAt = now`.
6. `reconcileGoalCompletions({ goalIds: [id], now }, tx)` → outcome `"completed"` if it transitioned, else `"active"`.

`archiveGoal({ goalId }, now)` — `updateMany where { id, status: "active" }` → `archived/manual/now`. Zero rows: `not_found` if absent, else `invalid_state_transition` ("This goal is already in your goal history.").

`acknowledgeGoalCompletion({ goalId }, now)` — `updateMany where { id, archiveReason: "completed", completionAcknowledgedAt: null }` → `now`. Zero rows: `not_found` if absent; `invalid_state_transition` if not a completed goal; otherwise success (already acknowledged — idempotent).

None of these functions ever calls `delete` on a goal.

## 12. Validation rules

| Field | Validation | Error message (`validation_error` detail) |
| ----- | ---------- | ------------------------------------------ |
| `exerciseId` | present, UUID, existing, active | "Pick an active exercise." |
| `gymId` | gym-variable: present, UUID, existing, active; gym-consistent: absent | see §11c |
| `targetWeightLbs` | present, finite number, `> 0`, `≤ 9999.99` (matches `LoggedSet` / `Decimal(6,2)`) | "Enter a weight above 0." |
| `targetReps` | present, integer (no decimals), `1 ≤ reps ≤ 1000` (matches `LoggedSet`) | "Enter whole reps, 1 or more." |
| any date / note / e1RM / percent field | not accepted (ignored by the parser; no column exists) | — |

Server validation is authoritative; the form also validates inline and keeps typed values on failure.

## 13. UI data contracts

```ts
type GoalContextDto = {
  goalId: string;
  exerciseId: string;
  exerciseName: string;
  exerciseArchived: boolean;
  gymId: string | null;
  gymName: string | null;
  gymArchived: boolean;
  targetWeightLbs: number;
  targetReps: number;
  targetLabel: string;            // "315 lb × 1"
  createdAtIso: string;
};

type ActiveGoalDto = GoalContextDto & {
  percent: number | null;         // null → "No performance recorded yet"
  targetE1rm: number;             // rounded for display
  best: { e1rm: number; weightLbs: number; reps: number; dateIso: string; dateLabel: string } | null;
};

type GoalHistoryDto = GoalContextDto & {
  outcome: "completed" | "manual";
  archivedAtIso: string;
};

type GoalReachedDto = GoalContextDto & {
  alreadyReached: boolean;
  newGoalHref: string;            // /goals/new/[exerciseId](?gymId=) or /goals/new if exercise archived
};

type GoalDetailDto =
  | ({ kind: "active" } & ActiveGoalDto)
  | ({ kind: "archived"; unacknowledged: boolean; alreadyReached: boolean;
       newGoalHref: string | null } & GoalHistoryDto);  // newGoalHref null if exercise archived or has another active goal

type SessionGoalRowDto = {
  goalId: string;
  exerciseName: string;
  targetLabel: string;            // "315 × 1" compact
  kind: "progress" | "reached";
  percentBefore: number | null;   // null when this was the first measured session
  percentAfter: number | null;    // null for "reached"
};

type GoalFormContextDto =
  | { kind: "ok"; exercise: { id: string; name: string; meta: string; imageUrl: string | null };
      gymVariable: boolean; gyms: { id: string; name: string }[]; defaultGymId: string | null }
  | { kind: "duplicate"; exerciseName: string; existing: ActiveGoalDto }
  | { kind: "no_gyms"; exerciseName: string }
  | { kind: "archived_exercise"; exerciseName: string }
  | { kind: "not_found" };
```

Query functions (`src/lib/goals/queries.ts`): `listActiveGoals()` (createdAt asc), `listGoalHistory()` (archivedAt desc), `countGoalHistory()`, `listUnacknowledgedCompletions()` (archivedAt desc), `getGoalDetail(goalId)`, `getGoalFormContext(exerciseId, gymId?)`, `activeGoalExerciseMap()` (exerciseId → goalId), `getSessionGoalSummary(loggedSessionId)`.

`getSessionGoalSummary` (design Screen 8): for the session's **complete** state only —

- **progress rows:** each `active` goal that has a qualifying performance from this `loggedSessionId` in its scope; `percentAfter` from all qualifying performances, `percentBefore` from those excluding this session (null if none); `percentBefore` is omitted from display when equal.
- **reached rows:** each `archived/completed` goal with `createdAt ≤ session.completedAt ≤ archivedAt` whose scope has a qualifying performance from this session with `e1rm ≥ targetE1rm − ε`.
- No row for any other goal. Order: goal `createdAt` asc.

## 14. Testing strategy

### Unit (`tests/unit`)

| Area | Cases |
| ---- | ----- |
| `goal-progress.test.ts` | 1-rep target = weight; 225 × 12 target via `estimateOneRepMax`; best = max (not latest); tie → earliest; no history → `percent null`, `reached false`, ratio null; below (87%), exact (100%, reached), above (capped 100, reached); floor (99.6 → 99, not reached); float stability (0.87 → 87) |
| `goal-validation.test.ts` | missing exercise; missing / 0 / negative / > 9999.99 / non-numeric weight; missing / 0 / negative / 2.5 / > 1000 reps; extra fields ignored |
| `progression-e1rm.test.ts` | `bestWorkingSet` returns max-estimate set; `sessionE1rm` unchanged results |
| `invariant-guards.test.ts` | Goal writes only in `src/lib/goals/goals.ts`; `src/lib/goals/**` never writes `loggedSet`/`loggedExercise`/`loggedSession`/`gymExerciseBaseline`/`session`/`sessionExercise`/`mesocycle`/`exercise`/`gym`; no `goal.delete`/`deleteMany` anywhere; goals never read `gymExerciseBaseline`; `estimateOneRepMax` still defined once and no `reps / 30` elsewhere; schema has no `progressPercent`/`currentE1rm`/`bestE1rm`/`targetE1rm`/`targetDate`/`deadline`/`dueDate` on Goal; no confetti/gamification/notification dependency; no cardio→goal coupling |

### Integration (`tests/integration/goals.int.test.ts`, embedded Postgres)

| Area | Cases |
| ---- | ----- |
| Creation | free-weight goal w/o gym ✓; free-weight with gym → rejected; machine without gym → rejected; machine with archived gym → rejected; archived exercise → rejected; custom exercise ✓ |
| One active | second goal same exercise → `conflict`; second at another gym (machine) → `conflict`; goals on different exercises coexist; raw insert of a second active row → DB unique violation; archived + new active coexist |
| Manual archive | active → archived/manual, record kept; same exercise then accepts a new goal; archive twice → `invalid_state_transition`; no delete path |
| Progress scope | free-weight best spans gyms; machine best only at its gym (other gym's heavier history ignored); baseline row present but no performance → unmeasured |
| Current best | max of several; weaker newer session doesn't lower it; swap counts to performed exercise only; incomplete / in-progress excluded; scheduled-deload performance excluded; history before goal creation counts; older mesocycle counts |
| Completion | already-achieved creation → archived/completed with `archivedAt = createdAt`, slot free; below target stays active; new qualifying performance reaching target → reconcile completes; reconcile twice → second returns `[]`, `archivedAt` unchanged; concurrent reconciles → one transition |
| Acknowledge | sets once; second call no-op success, timestamp unchanged; on active/manual → `invalid_state_transition` |
| Corrections | `editLoggedSet` lowering best on active goal lowers percent (no stored value to go stale); raising it to target → reconcile completes; lowering below target after completion → goal stays archived/completed |
| No history mutation | goal create/archive/ack/reconcile leave `LoggedSet` rows + values and `GymExerciseBaseline` rows byte-identical |
| Archive interactions | exercise archived → goals readable via `listActiveGoals`/`getGoalDetail` with `exerciseArchived`; gym archived → readable, `gymArchived`, gymId unchanged; hard delete of exercise/gym with goals → FK Restrict error |
| Session summary | touched active goal shows before→after; untouched goal absent; goal completed by the session shows `reached`; machine goal at another gym not touched |
| Schema | migration constraints: lifecycle CHECK, positive CHECK, ack-completed-only CHECK; RLS still enabled on `goals` (existing `rls.int.test.ts`) |

### E2E

`e2e/goals.spec.ts`: unauthenticated `/goals`, `/goals/new`, `/goals/history`, `/goals/<uuid>`, `/goals/new/<uuid>` redirect to `/login` (the e2e harness has no real Supabase backend, consistent with prior pitches).

### Regression

All prior unit, integration (history integrity, baseline isolation/atomicity, progression, missed days, RLS), and e2e suites remain green. Pitch 5's progression results are unchanged by the e1rm/queries refactor.

## 15. Acceptance criteria

**Creation**
- [ ] A goal can be created with an active Exercise, target weight, and target reps; a machine/cable Exercise also requires an active Gym.
- [ ] Invalid weight/reps, missing fields, archived exercises, and archived gyms are rejected with field errors.
- [ ] Goals on different Exercises coexist; a second active goal on the same Exercise is blocked at any Gym, never silently replaced.

**Progress**
- [ ] Target e1RM and current best both go through Pitch 5's `estimateOneRepMax`; no second formula exists.
- [ ] Current best is the max qualifying session e1RM in scope (global for gym-consistent, selected Gym for gym-variable), including history before the goal existed.
- [ ] Percentage is floored, whole, capped at 100; no history reads "No performance recorded yet", never 0%.
- [ ] Past-log edits change an active goal's percentage on the next read; no progress value is stored.

**Lifecycle**
- [ ] Reaching the target completes and archives the goal exactly once; an already-achieved new goal completes immediately.
- [ ] A completed goal never reopens after a downward correction.
- [ ] Manual archive preserves the record and frees the Exercise; no delete or undo exists.
- [ ] The Goal-reached card appears until acknowledged, then never again; "Set a new goal" opens a blank target form for the same Exercise.

**Surfaces**
- [ ] Goals nav item; overview, picker, form, detail, history match the preview.
- [ ] Dashboard shows goal content only when no workout is pending; post-session shows only goals the workout touched.
- [ ] Archived exercise/gym context is shown, never hidden or remapped.
- [ ] No dates, pacing, suggestions, notifications, or gamification anywhere.

## 16. Explicit non-goals

- ❌ Dated goals, pacing, feasibility. **Deferred** (Post-MVP).
- ❌ Suggested / generated / auto-raised goals. **Permanent** (the lifter authors targets).
- ❌ Goal deletion, archive undo, goal reopening. **Not in this build.**
- ❌ Streaks, badges, XP, confetti, sound. **Permanent.**
- ❌ Social or shared goals. **Permanent.**
- ❌ Cardio, nutrition, body-composition goals. **Permanent** for this build.

## Resolved Decisions

Pre-resolved by the run (approved authority; restated with rationale):

- **R1 Goal = undated weight × reps target for one Exercise.** PRD definition; not a mesocycle, session target, recommendation, deadline, or forecast.
- **R2 Creation inputs:** Exercise, target weight, target reps; plus Gym iff gym-variable. No date, mesocycle, note, manual e1RM, percent, or ETA — none has a column.
- **R3 Stable identity:** `Goal.exerciseId` (UUID FK); renames never disconnect.
- **R4 Imported and custom Exercises** are both eligible if active.
- **R5 Archived Exercises** are not offered and are rejected server-side; their existing goals stay readable.
- **R6/R18 One active goal per Exercise, globally** — enforced by `goals_one_active_per_exercise`; Gym is measurement context, not a second slot.
- **R7 Block, never replace** — `conflict` with `existingGoalId`; the first goal is never auto-archived.
- **R8 Lifecycle** `active | archived` + `archiveReason completed | manual`; no hard delete.
- **R9/R37 Manual archive** frees the Exercise, touches no training history; confirmation dialog.
- **R10/R28 Archived goals never reactivate** (no code path sets `status = active` on update).
- **R11 Reuse `estimateOneRepMax`** from `src/lib/progression/e1rm.ts`; guarded statically.
- **R12 Target e1RM derived**, never entered.
- **R13 Current best = max qualifying session e1RM** using Pitch 5's `sessionE1rm` over Pitch 5's qualifying performances.
- **R14 Best, not latest.**
- **R15 Existing history counts immediately** — no goal start-date filter.
- **R16 Gym-consistent goals are global**; **R17 gym-variable goals require one active Gym** and are measured there only; **R19 no cross-gym machine comparison**; **R20 `GymExerciseBaseline` is never goal evidence** (not even read).
- **R21/R22 Percent** = `min(100, …)` whole number; precise ratio internally.
- **R23 No history ≠ 0%** — `percent: null` + "No performance recorded yet".
- **R24 Progress is derived**, never stored.
- **R25 Completion** at `best ≥ target`; archives as completed, record kept.
- **R26 Already-achieved creation completes immediately** via the normal engine in the creation transaction.
- **R27 Idempotent completion** via conditional update; `archivedAt` written once.
- **R29 Active goal progress moves freely** with corrections until completion.
- **R30 Completion never endangers `LoggedSet`** — reconciliation runs post-commit, best-effort, never in a logging transaction.
- **R31 One engine** (`reconcileGoalCompletions`) at the boundaries in §11b.
- **R32–R34 Restrained, one-time celebration** identifying Exercise, target, and Gym where relevant; persisted acknowledgement, no notification framework.
- **R35/R36 "Set a new goal"** opens a blank form; Overload never proposes a number.
- **R39–R41 Exercise/Gym archival** leaves goals readable and marked; no cascade, no silent close, no remap; manual archive offered.
- **R42/R43 Dashboard:** pending workout first; goals fill day-complete / rest / no-plan states, concisely.
- **R44 Post-session** shows only touched goals; **R45 goals and progression tags are independent.**
- **R46/R47 History** viewable and visually separate from active goals.

Implementation decisions made in this spec:

- **R48 Schema shape:** `gymId` (nullable FK Restrict), `archiveReason` enum, `archivedAt`, `completionAcknowledgedAt`; completion time = `archivedAt` when `archiveReason = completed` (no separate `completedAt` — one timestamp per event, so they can't disagree). DB CHECKs keep lifecycle columns consistent.
- **R49 Uniqueness in the database:** partial unique index on `exercise_id WHERE status='active'`; the app pre-checks for a friendly message and maps a racing `P2002` to the same `conflict`.
- **R50 Qualifying = Pitch 5's qualifying sequence** (complete session, all planned working sets, not a scheduled-deload week). Scheduled-deload performances are excluded from goal best, matching Pitch 5's "current e1RM" and reactive sequences; a deliberately reduced week is not a strength test.
- **R51 Scope by `isGymVariable(exercise)`:** gym-variable → `goal.gymId`; gym-consistent → global. Equipment is immutable after creation, so a goal's scope can never change.
- **R52 Floored percentage** (`floor(r × 100 + 1e-9)`): the display reads 100% only when the target is truly met; 99.6% shows 99%. ε guards float noise in both flooring and the reached comparison (`GOAL_REACHED_EPSILON = 1e-9`), so identical weight × reps on both sides always counts as reached.
- **R53 Best tie-break:** earliest qualifying performance (when the strength was first demonstrated).
- **R54 Read-boundary reconciliation:** goal-bearing pages reconcile before rendering, so an achieved active goal never renders as an active 100% row even if a post-commit reconciliation was missed. Writes during a server render are acceptable here because the transition is idempotent, derived from committed history, server-only, and behind auth.
- **R55 Action-boundary reconciliation runs after `logSetAction` too** (not only `completeWorkoutAction`): a set may be added to an already-complete session, which can create a qualifying performance. Cheap and idempotent.
- **R56 Reconcile scans all active goals** (no per-exercise filter at action boundaries): the set is tiny (single user), and filtering by touched exercises adds a correctness surface (swaps, gyms) for no benefit.
- **R57 "Already reached"** = `archivedAt = createdAt` (the creation transaction stamps both with the same `now`). No extra column.
- **R58 Acknowledgement:** both **Set a new goal** and **Done** acknowledge; acknowledgement is idempotent; the card shows on `/goals`, the goal's detail, and the dashboard's non-pending states only.
- **R59 No undo on manual archive** (unlike Exercise/Gym archive): restoring would be a reopen, which R10 forbids; re-creating is one tap from history.
- **R60 Historical goals show no re-derived percentage:** the lifecycle outcome is the record; showing today's derived number beside "Reached" could contradict it after a correction.
- **R61 Gym-consistent create with a `gymId` is rejected** rather than silently dropped, so no goal can carry a misleading scope.
- **R62 Target validation mirrors `LoggedSet` limits** (`> 0`, `≤ 9999.99`; reps integer 1–1000), the same units and column type.
- **R63 Routes:** `/goals`, `/goals/new` (library picker reused), `/goals/new/[exerciseId]` (`?gymId=` preselect), `/goals/[goalId]`, `/goals/history`. Nav item "Goals" (`Target` icon) after History.
- **R64 Active list order** = `createdAt` asc (stable; percentages never reorder it). Dashboard shows the first 3.
- **R65 Goal surfaces use the accent only;** progress green / deload amber stay exclusive to Pitch 5 tags.
- **R66 Duplicate on the form** shows the existing goal (target + percent) with **View goal**; for a machine goal the copy names its gym.
- **R67 Pitch 5 refactor is behavior-preserving:** `bestWorkingSet` + `getQualifyingSessionE1rms` are additive exports; `sessionE1rm` returns identical values; Pitch 5's suites must stay green unchanged.
- **R68 Preview format:** `.tsx` per the run gate and Pitch 4/5 precedent.

## 17. Open questions

None blocking. All routine questions are resolved above (R48–R68); Architecture Open Question "Goals: second active goal blocked or replaces" is resolved as **blocked** (R7).

## 18. Future considerations

- Dated goals / feasibility (Post-MVP) can add nullable columns to `Goal` without touching progress derivation.
- If a future pitch allows equipment edits, goal scope (R51) must be revisited.
- Architecture's Goal entry should be amended to include optional Gym scope and completion/manual-archive metadata (run report, upstream amendment 11).
