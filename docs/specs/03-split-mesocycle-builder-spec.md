---
version: 1.0.0
status: approved
author: Autonomous pipeline (Claude Code)
last_updated: 2026-10-08
pitch_reference: pitches/03-split-mesocycle-builder.md
design_reference: docs/design/03-split-mesocycle-builder-design-doc.md
ui_preview_reference: docs/previews/03-split-mesocycle-builder-preview.html
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
linear_issue: see docs/runs/03-split-mesocycle-builder-progress.md (milestone "Split & Mesocycle Builder")
---

# Split & Mesocycle Builder

## Summary

Split & Mesocycle Builder lets the lifter author a training block: a **Mesocycle** (name, calendar start date, length in weeks, scheduled deload week, starting split structure) containing **Sessions** (named planned workout templates) placed on at most one weekday each, and each Session's ordered **SessionExercises** (an Exercise from the library, a planned set count, and a target rep range). Presets (Push / Pull / Legs, Arnold, Bro) create named empty Sessions on fixed days and nothing else. Sessions can be duplicated onto another day as independent copies, and a whole Mesocycle can be cloned forward into a new draft.

The core abstraction is **a plan lifecycle with one gate**: every Mesocycle is created or cloned as `draft`, can be edited freely while incomplete, and becomes `active` only through an explicit activation that re-checks a pure **readiness** function inside the activation transaction and archives the previously active Mesocycle in the same transaction. At most one Mesocycle is active, guaranteed both by the transaction and by a partial unique index. Readiness, "needs attention", and "archived exercise in this slot" are all **computed on read** from the plan rows and `Exercise.deletedAt`; nothing about readiness is stored.

"Working" means: a lifter on a phone can create "Strength Block" from the Push / Pull / Legs preset and get six empty sessions on Mon–Sat; fill each with exercises from the library with sets and rep ranges; see a checklist of exactly what blocks activation; activate it and see the previous block archived; duplicate Push Day 1 onto Thursday and edit the copy without touching Monday; clone the block forward into a draft that starts the day after it ends, with archived exercises carried into their slots and marked for repair. No `LoggedSession`, `LoggedExercise`, `LoggedSet`, `GymExerciseBaseline`, or `Goal` row is read or written by any of it.

---

## Problem

- The app cannot yet say what the lifter intends to train. Guided Workout Logging (Pitch 4) has no "today's planned session", no planned set count, and no rep range to show on the logging card.
- The Progressive Overload Engine (Pitch 5) evaluates logged sets **against the planned rep range** and suppresses the reactive check during the **scheduled deload week**. Neither value exists yet.
- The Foundation schema has `Mesocycle`, `Session`, and `SessionExercise` tables but no lifecycle beyond `active`/`archived`, no way to express an incomplete plan, no calendar semantics for the start date, and no constraints on day assignment, set counts, or rep ranges.
- Supports PRD journey **"Setting up a mesocycle and split"** and MVP feature **Split & Mesocycle Setup**, including both of its edge cases (empty mesocycle cannot go live; archived exercises in a clone surface as needing attention). Depends on Library & Gyms Setup (sessions reference exercises); unlocks Guided Workout Logging and Cardio Logging.

---

## Scope and Non-Scope

### In Scope

- Mesocycle lifecycle `draft → active → archived`, plus `draft → archived` (Archive draft); one active at a time; atomic activation.
- Mesocycle create (preset or Custom), details edit (name, start date, length, deload week), readiness evaluation, activation, archive draft.
- Preset structures for PPL, Arnold, Bro (named empty sessions on fixed days); Custom = empty week.
- Session create, rename, move between days / off the schedule, duplicate, remove; zero-or-one session per weekday; explicit replace flow for occupied days.
- SessionExercise add (from the library picker), edit sets/rep range, replace exercise, remove, reorder (up/down).
- Archived-exercise repair state (derived), surfaced on the week, in the session, in readiness, and in clone setup.
- Clone-forward of active/archived mesocycles into a new draft, with defaults.
- Calendar semantics module (end date, clone default start, week number for a date).
- Plan UI: `/plan`, `/plan/new`, `/plan/clone`, `/plan/clone/[sourceId]`, `/plan/[mesocycleId]`, `/plan/[mesocycleId]/details`, `/plan/[mesocycleId]/sessions/[sessionId]`, `/plan/[mesocycleId]/sessions/[sessionId]/add`; "Plan" nav item.

### Out of Scope

- Workout logging and any write or read of `LoggedSession`/`LoggedExercise`/`LoggedSet` (Pitch 4). Today's dashboard stays unchanged.
- Working, starting, target, or percentage-based weights on a planned exercise (never in this pitch; working weight belongs to logging/progression).
- Progress/hold/deload tags, e1RM, scheduled-deload load reduction (Pitch 5). The deload week is recorded only.
- Missed days, day completion, shifting, "current week" UI (Pitch 4).
- In-workout Exercise Swap (Pitch 4). Replacing an exercise in the plan is plan editing, not a swap.
- Gym assignment of sessions or mesocycles (gym attribution belongs to logging).
- Cardio planning on split days (Pitch 7).
- Goals (Pitch 6).
- Unarchiving a mesocycle, hard-deleting a mesocycle, plan versioning/history (D37).
- **Permanent non-goal:** program generation. Presets never create SessionExercises; nothing suggests an exercise, set count, rep range, or weight.

---

## Core Concepts

| Concept | Description |
| ------- | ----------- |
| `Mesocycle` | One training block. `name` (required, non-blank, not unique), `startDate` (calendar date, nullable in a draft, required to be active), `lengthWeeks` (≥ 1), `deloadWeek` (≥ 1; ≤ `lengthWeeks` required to be active), `splitType` (the structure it started from), `status`. Has many Sessions. |
| `MesocycleStatus` | `draft` \| `active` \| `archived`. Stored. |
| `SplitType` | `ppl` \| `arnold` \| `bro` \| `custom`. Records the starting structure; a label only, fixed at creation, copied by clone. |
| `Session` | A planned workout template in one Mesocycle. `name` (required, non-blank, not unique), `dayOfWeek` (1 = Monday … 7 = Sunday, or null = "Not on the schedule"). Has many SessionExercises. Never a performed workout and never an auth session. |
| `SessionExercise` | One planned exercise slot: `exerciseId`, `position` (0-based order), `plannedSets` (≥ 1), `targetRepMin` (≥ 1), `targetRepMax` (≥ `targetRepMin`). At most one per (session, exercise). |
| Archived reference (derived) | A SessionExercise whose Exercise has `deletedAt` set. Not stored. Rendered as a repair slot; blocks activation. |
| Readiness (derived) | `evaluateReadiness(plan)` → `{ ready, issues[] }`. Pure, computed on read and inside activation. Never stored. |
| Scheduled session | A Session with non-null `dayOfWeek`. Only scheduled sessions must be non-empty to activate. |
| Clone | A new draft Mesocycle whose Sessions and SessionExercises are field-by-field copies of a source's. No link to the source is stored. |

**Distinctions to preserve:**

- `Session` (plan) vs. `LoggedSession` (a day trained, Pitch 4). Nothing in this pitch writes either logged model.
- Plan removal (deleting a `Session` or `SessionExercise` row, authoring) vs. Exercise archival (setting `Exercise.deletedAt`, Library). Plan screens never archive or delete an Exercise.
- Scheduled deload week (recorded configuration) vs. reactive deload (Pitch 5 computed tag). This pitch has neither behavior.
- Mesocycle archival is a status, not a soft-delete column; archived mesocycles stay fully readable.

---

## States and Lifecycle

### MesocycleStatus

```text
draft     created or cloned; editable; may be incomplete
active    the current plan; editable; at most one
archived  previous block (or an abandoned draft); read-only; clone source
```

### State Transition Rules

| From | To | Allowed? | Side effects (one transaction) |
| ---- | -- | -------- | ------------------------------ |
| (none) | `draft` | yes — create, clone | Preset sessions or cloned sessions/slots inserted in the same transaction as the mesocycle. |
| `draft` | `active` | yes, only via `activateMesocycle`, only if `evaluateReadiness` is ready **inside the transaction** and the caller's `expectedActiveId` matches the current active id | Current `active` (if any) → `archived`, then this draft → `active`. Partial unique index rejects a concurrent second active (`conflict`). |
| `draft` | `archived` | yes — Archive draft | none |
| `active` | `archived` | only as the side effect of activating another draft | — |
| `active` | `draft` | no — `invalid_state_transition` | |
| `archived` | anything | no — `invalid_state_transition` (clone forward instead) | |

- Every plan write (details, sessions, slots) requires the parent mesocycle to be `draft` or `active`; `archived` → `invalid_state_transition` "Archived mesocycles are read-only. Clone it forward to change it."
- An `active` mesocycle may become not-ready through edits (e.g. an exercise archived in the library, or its last exercise removed from a scheduled session). It **stays active**; the UI shows "Needs attention" (D44). The DB still guarantees an active block has a start date and an in-range deload week.
- Confirmation: activation and archive-draft are confirmed in the UI (AlertDialog); the server does not require a confirmation token beyond `expectedActiveId`.

---

## UI Integration

> The design doc defines behavior; the UI preview `docs/previews/03-split-mesocycle-builder-preview.html` is the **binding visual contract** for hierarchy, visible controls, state presentation, copy, responsive behavior, and interaction structure. The implementation translates its `.ov-*` recipes back to the app's shadcn/ui components (`data`-level mapping: `ov-btn`→`Button`, `ov-badge`→`Badge`, `ov-input`→`Input`, `ov-alert`→`Alert`, `ov-select`→`Select`, `ov-tabs`→`Tabs`, `ov-dialog`→`Dialog`/`AlertDialog`, `ov-menu`→`DropdownMenu modal={false}`, `ov-toast`→Sonner, `ov-sk`→`Skeleton`, radio cards→`RadioGroup`).

### Screens

| Screen | Route | Data needed | Actions |
| ------ | ----- | ----------- | ------- |
| Plan home | `/plan` | `listMesocyclesForHome()` | links to new / clone / mesocycle |
| New mesocycle | `/plan/new` | preset definitions (pure) | `createMesocycleAction` |
| Choose clone source | `/plan/clone` | `listCloneSources()` | link to setup |
| Clone setup | `/plan/clone/[sourceId]` | `getCloneSetup(sourceId)` | `cloneMesocycleAction` |
| Mesocycle week | `/plan/[mesocycleId]` | `getMesocycleWeek(id)` (+ current active id/name) | add/move/duplicate/remove session, activate, archive draft |
| Edit details | `/plan/[mesocycleId]/details` | `getMesocycleWeek(id)` header fields | `updateMesocycleDetailsAction` |
| Session builder | `/plan/[mesocycleId]/sessions/[sessionId]` | `getSessionDetail(mesocycleId, sessionId)` | rename, move, duplicate, remove session; edit/replace/remove/reorder slots |
| Exercise picker | `/plan/[mesocycleId]/sessions/[sessionId]/add` | `getSessionDetail` + `listExercises(filters)` | `addSessionExerciseAction`, `replaceSessionExerciseAction` |

All routes live under `src/app/(app)/plan/`, inherit the authenticated layout, and are server components; `notFound()` for a missing or mismatched id.

### Components (client islands only where interactive)

| Component | Kind | Notes |
| --------- | ---- | ----- |
| `MesocycleStatusBadge` | server | draft/active/archived badge |
| `MesocycleForm` | client | create (with `StructureRadioCards`), clone, details variants; manual `startTransition` submit (Pitch 2 pattern) so entries survive a failed save |
| `ReadinessPanel` | server | issues rendered with `readinessIssueMessage` + link target |
| `WeekList` / `UnscheduledList` | server | rows link to sessions; `SessionRowMenu` island per row |
| `SessionRowMenu` | client | Move / Duplicate / Remove; opens `DayPickerDialog`, `RemoveSessionDialog` |
| `DayPickerDialog` | client | shows occupancy; on `conflict` with `details.occupiedBy`, shows the replace confirmation and retries with `replace: true` |
| `AddSessionDialog`, `RenameSessionDialog` | client | |
| `ActivateButton` + `ActivateDialog`, `ArchiveDraftDialog` | client | AlertDialog |
| `PlannedExerciseList` | client | rows open `PlannedExerciseDialog`; reorder mode with up/down |
| `PlannedExerciseDialog` | client | add (empty fields) / edit (filled) / archived variant |
| `LibraryControls` | client (reused) | gains `basePath` and `extraParams` props; behavior unchanged on `/exercises` |
| `PickerResults` | client | rows → add dialog or replace confirm; "In session" rows disabled |
| `StickyActions` | server | bottom action bar pattern |

### Forms and Validation

| Field | Type | Required | Validation | Notes |
| ----- | ---- | -------- | ---------- | ----- |
| `name` (mesocycle) | text | yes | trimmed 1–80 | not unique |
| `startDate` | `YYYY-MM-DD` | no (draft) | valid calendar date if present | never prefilled for a new mesocycle |
| `lengthWeeks` | int | yes | 1–52 | 52 is an input-sanity bound, not a product rule |
| `deloadWeek` | int | yes | ≥ 1, ≤ 52; ≤ length required only for an active block | a draft may save deload > length (readiness lists it) |
| `splitType` | enum | yes (create) | ppl/arnold/bro/custom | not editable after create |
| `name` (session) | text | yes | trimmed 1–80 | not unique |
| `dayOfWeek` | int \| null | — | 1–7 or null | |
| `plannedSets` | int | yes | 1–20 | |
| `targetRepMin` | int | yes | 1–100 | |
| `targetRepMax` | int | yes | 1–100, ≥ min | never swapped; equal allowed |

---

## Data Model

### Relationship to Existing Schema

| From | Relation | To | Description |
| ---- | -------- | -- | ----------- |
| `Mesocycle` | 1–n | `Session` | existing; `onDelete: Cascade` (mesocycles are never deleted by the app) |
| `Session` | 1–n | `SessionExercise` | existing; `onDelete: Cascade` — removing a Session removes its plan slots (D53) |
| `SessionExercise` | n–1 | `Exercise` | existing; `onDelete: Restrict` — an archived Exercise stays referenced |
| `LoggedSession` | n–1 | `Mesocycle`, `Session` | existing; `onDelete: Restrict` — once Pitch 4 logs against a session, removing it fails loudly rather than detaching history |

No new tables. No new relations. No ownership column.

### Updated Models

```prisma
enum MesocycleStatus {
  draft
  active
  archived
}

enum SplitType {
  ppl
  arnold
  bro
  custom
}

model Mesocycle {
  id          String          @id @default(uuid()) @db.Uuid
  name        String
  lengthWeeks Int             @map("length_weeks")
  deloadWeek  Int             @map("deload_week")
  splitType   SplitType       @map("split_type")
  status      MesocycleStatus @default(draft)
  /// Calendar date (no time, no zone). Week 1 begins on this date.
  startDate   DateTime?       @map("start_date") @db.Date
  createdAt   DateTime        @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime        @updatedAt @map("updated_at") @db.Timestamptz

  sessions       Session[]
  loggedSessions LoggedSession[]

  @@index([status])
  @@map("mesocycles")
}

model Session {
  // …existing fields…
  /// 1 = Monday … 7 = Sunday; null = not on the schedule.
  dayOfWeek   Int?     @map("day_of_week")

  // Zero or one session per weekday (NULLs are distinct, so any number unscheduled).
  @@unique([mesocycleId, dayOfWeek])
}

model SessionExercise {
  // …existing fields…
  // One occurrence of an Exercise per Session.
  @@unique([sessionId, exerciseId])
}
```

### Migrations (hand-written, non-destructive)

Two migrations, because Postgres cannot use a newly added enum value in the same transaction that adds it, and Prisma applies each migration file as one transaction.

`2_mesocycle_draft_status/migration.sql`:

```sql
ALTER TYPE "MesocycleStatus" ADD VALUE IF NOT EXISTS 'draft' BEFORE 'active';
```

`3_split_mesocycle_builder/migration.sql` (in place; no DROP, RENAME, INSERT, DELETE, cascade, or policy):

```sql
CREATE TYPE "SplitType" AS ENUM ('ppl', 'arnold', 'bro', 'custom');

ALTER TABLE "mesocycles"
  ALTER COLUMN "status" SET DEFAULT 'draft',
  ALTER COLUMN "split_type" TYPE "SplitType" USING "split_type"::"SplitType",
  ALTER COLUMN "start_date" TYPE DATE USING ("start_date" AT TIME ZONE 'UTC')::date;

ALTER TABLE "mesocycles"
  ADD CONSTRAINT "mesocycles_name_not_blank" CHECK (char_length(btrim("name")) > 0),
  ADD CONSTRAINT "mesocycles_length_weeks_positive" CHECK ("length_weeks" >= 1),
  ADD CONSTRAINT "mesocycles_deload_week_positive" CHECK ("deload_week" >= 1),
  ADD CONSTRAINT "mesocycles_active_is_well_formed" CHECK (
    "status" <> 'active' OR ("start_date" IS NOT NULL AND "deload_week" <= "length_weeks")
  );

CREATE INDEX "mesocycles_status_idx" ON "mesocycles"("status");
-- At most one active mesocycle (not expressible in Prisma; drift-compatible).
CREATE UNIQUE INDEX "mesocycles_single_active" ON "mesocycles"("status") WHERE "status" = 'active';

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_name_not_blank" CHECK (char_length(btrim("name")) > 0),
  ADD CONSTRAINT "sessions_day_of_week_range" CHECK ("day_of_week" IS NULL OR "day_of_week" BETWEEN 1 AND 7);
CREATE UNIQUE INDEX "sessions_mesocycle_id_day_of_week_key" ON "sessions"("mesocycle_id", "day_of_week");

ALTER TABLE "session_exercises"
  ADD CONSTRAINT "session_exercises_planned_sets_positive" CHECK ("planned_sets" >= 1),
  ADD CONSTRAINT "session_exercises_rep_min_positive" CHECK ("target_rep_min" >= 1),
  ADD CONSTRAINT "session_exercises_rep_range_ordered" CHECK ("target_rep_max" >= "target_rep_min");
CREATE UNIQUE INDEX "session_exercises_session_id_exercise_id_key" ON "session_exercises"("session_id", "exercise_id");
```

Production has no mesocycle rows yet (nothing could create them before this pitch), so the in-place casts operate on zero rows; if a row did exist with a non-enum `split_type`, the cast fails loudly instead of losing data.

### Row-Level Security

No table is created. Every table keeps Foundation's deny-all RLS with no policies; the existing `rls.int.test.ts` keeps proving it.

### Derived Fields

| Field / Concept | Stored? | Computed From | Notes |
| --------------- | ------- | ------------- | ----- |
| readiness / issues | no | mesocycle fields, sessions, slots, `Exercise.deletedAt` | `evaluateReadiness` (pure) |
| archived slot | no | `exercise.deletedAt != null` | |
| planned end date | no | `startDate + 7·lengthWeeks − 1` days | `plannedEndDate` |
| clone default start | no | `startDate + 7·lengthWeeks` days | `cloneDefaultStartDate` |
| week number for a date | no | `floor((date − startDate)/7) + 1` | `mesocycleWeekForDate`; for Pitch 4/5, unused by UI here |

---

## Calendar semantics (D59)

- `startDate` is a calendar date (`DATE`). Prisma returns it as a JS `Date` at 00:00 UTC; the app converts to/from `YYYY-MM-DD` only through `src/lib/plan/calendar.ts` and never applies local-time arithmetic.
- Weeks are 7-day blocks anchored at the start date, regardless of weekday. Week `n` covers `startDate + 7(n−1)` … `startDate + 7n − 1`. A start on Wednesday makes Week 1 Wednesday–Tuesday.
- Session days are weekdays (ISO 1 = Monday … 7 = Sunday) and repeat every week of the block.
- `plannedEndDate = startDate + 7·lengthWeeks − 1`; `cloneDefaultStartDate = plannedEndDate + 1`.
- Display: `formatPlanDate("2026-11-02") → "Mon, Nov 2"`, ranges `"Mon, Sep 28 – Sun, Nov 1"`, always UTC-formatted.

---

## Authorization and Access Control

1. **Authentication in application code.** Every plan route renders under `(app)/layout.tsx` (`requireUser()`), and **every** server action in `src/app/(app)/plan/actions.ts` calls `await requireUser()` before parsing input or calling a write module.
2. **RLS deny-all** on every table (unchanged). The Supabase client is never used for plan data.

```ts
export async function activateMesocycleAction(input: { mesocycleId: string; expectedActiveId: string | null }) {
  await requireUser();
  const result = await toActionResult(() => activateMesocycle(input), "Couldn't activate. Nothing changed.");
  if (result.ok) refresh();
  return result;
}
```

| Resource | Read | Create | Update | Delete |
| -------- | ---- | ------ | ------ | ------ |
| `Mesocycle` | authenticated, server components | `createMesocycle`, `cloneMesocycle` | `updateMesocycleDetails`, `activateMesocycle`, `archiveDraftMesocycle` | never |
| `Session` | authenticated | `addSession`, `duplicateSession` (+ preset/clone inside mesocycle writes) | `renameSession`, `moveSession` | `removeSession` (plan authoring, D53) |
| `SessionExercise` | authenticated | `addSessionExercise` (+ duplicate/clone) | `updateSessionExercise`, `replaceSessionExercise`, `moveSessionExercise` | `removeSessionExercise` (D54) |
| `Exercise`, `Gym`, logged models, baselines, goals | unchanged | never written by this pitch | never | never |

**Write-module guard:** `Mesocycle`, `Session`, and `SessionExercise` rows are created/updated/deleted only in `src/lib/plan/mesocycles.ts` and `src/lib/plan/sessions.ts` (static test).

---

## Server Actions and API Surface

### Modules

| Module | Kind | Contents |
| ------ | ---- | -------- |
| `src/lib/plan/presets.ts` | pure | `SPLIT_TYPES`, `SPLIT_TYPE_LABELS`, `PRESET_STRUCTURES: Record<SplitType, { dayOfWeek; name }[]>` |
| `src/lib/plan/calendar.ts` | pure | `DAYS_OF_WEEK`, `parseIsoDate`, `toIsoDate`, `addDays`, `plannedEndDate`, `cloneDefaultStartDate`, `mesocycleWeekForDate`, `formatPlanDate`, `formatPlanRange` |
| `src/lib/plan/validation.ts` | pure | limits, `parseMesocycleDetails`, `parseSessionName`, `parseDayOfWeek`, `parsePlannedExercise` |
| `src/lib/plan/readiness.ts` | pure | `evaluateReadiness`, `readinessIssueMessage`, `ReadinessIssue` |
| `src/lib/plan/mesocycles.ts` | server write | `createMesocycle`, `updateMesocycleDetails`, `activateMesocycle`, `archiveDraftMesocycle`, `cloneMesocycle` |
| `src/lib/plan/sessions.ts` | server write | `addSession`, `renameSession`, `moveSession`, `duplicateSession`, `removeSession`, `addSessionExercise`, `updateSessionExercise`, `replaceSessionExercise`, `removeSessionExercise`, `moveSessionExercise` |
| `src/lib/plan/queries.ts` | server read | `listMesocyclesForHome`, `getMesocycleWeek`, `getSessionDetail`, `listCloneSources`, `getCloneSetup`, `getActiveMesocycleSummary` |
| `src/app/(app)/plan/actions.ts` | server actions | one action per write, auth first |

Every write function takes an optional `Prisma.TransactionClient` and wraps itself in `prisma.$transaction` when none is given (CLAUDE.md composition rule).

### Write operations

| Function | Input | Output | Side effects / errors |
| -------- | ----- | ------ | --------------------- |
| `createMesocycle` | `{ name, startDate?, lengthWeeks, deloadWeek, splitType }` | `{ id }` | Inserts draft + preset sessions (no slots). `validation_error`. |
| `updateMesocycleDetails` | `{ mesocycleId, name, startDate?, lengthWeeks, deloadWeek }` | `{ id }` | archived → `invalid_state_transition`; active with no start date or deload > length → `validation_error` (D61). |
| `activateMesocycle` | `{ mesocycleId, expectedActiveId: string \| null }` | `{ id, archivedId: string \| null }` | Tx: load plan, must be draft, readiness must pass (`invalid_state_transition`, details lists issue codes), current active id must equal `expectedActiveId` (`conflict`), archive current, activate target. Unique-index violation → `conflict`. |
| `archiveDraftMesocycle` | `{ mesocycleId }` | `{ id }` | only draft → archived. |
| `cloneMesocycle` | `{ sourceMesocycleId, name, startDate?, lengthWeeks, deloadWeek }` | `{ id }` | Source must be active/archived. Tx: new draft with source `splitType`; each session copied (`name`, `dayOfWeek`); each slot copied (`exerciseId`, `position`, `plannedSets`, `targetRepMin`, `targetRepMax`) explicitly field by field — including archived exercises. Reads no logged/goal/baseline table. |
| `addSession` | `{ mesocycleId, name, dayOfWeek: number \| null, replace?: boolean }` | `{ id }` | Occupied day and `!replace` → `conflict` `details.occupiedBy` = occupant name; with `replace`, occupant → `dayOfWeek = null` first. |
| `renameSession` | `{ sessionId, name }` | `{ id }` | |
| `moveSession` | `{ sessionId, dayOfWeek: number \| null, replace?: boolean }` | `{ id }` | same occupancy rule; moving to its own day is a no-op. |
| `duplicateSession` | `{ sessionId, dayOfWeek: number \| null, replace?: boolean }` | `{ id }` | New session named `"<name> Copy"` (source part truncated to fit 80), slots copied field by field; same occupancy rule. |
| `removeSession` | `{ sessionId }` | `{ id }` | Deletes the session (slots cascade). |
| `addSessionExercise` | `{ sessionId, exerciseId, plannedSets, targetRepMin, targetRepMax }` | `{ id }` | Exercise must exist and be active (archived → `validation_error` "That exercise is archived."); already in session → `validation_error` "Already in this session."; appended at the end. |
| `updateSessionExercise` | `{ sessionExerciseId, plannedSets, targetRepMin, targetRepMax }` | `{ id }` | |
| `replaceSessionExercise` | `{ sessionExerciseId, exerciseId }` | `{ id }` | New exercise active and not already in the session; keeps sets, reps, position. |
| `removeSessionExercise` | `{ sessionExerciseId }` | `{ id }` | Deletes the slot; renumbers remaining positions 0..n−1. Exercise row untouched. |
| `moveSessionExercise` | `{ sessionExerciseId, direction: "up" \| "down" }` | `{ id }` | Swaps positions with the neighbor in one tx; at an edge → no-op. |

Every session/slot write loads the parent mesocycle and rejects `archived` (`invalid_state_transition`). Ids that are not UUIDs or not found → `not_found`.

### Error Response Format

`ActionResult<T>` from `src/lib/actions/result.ts`. This pitch adds `conflict` to `ErrorCode` (api-conventions already defines it).

| Code | When |
| ---- | ---- |
| `validation_error` | field rules, archived/duplicate exercise on add/replace, active details rules |
| `not_found` | missing or mismatched ids |
| `invalid_state_transition` | writes to archived; activating non-draft or not-ready; archiving non-draft; cloning a draft |
| `conflict` | occupied day without `replace`; active block changed since the page loaded; concurrent activation; unique violations |
| `internal_error` | anything else (logged server-side; never leaks Prisma text) |

---

## Validation Rules

| Field | Validation | Error |
| ----- | ---------- | ----- |
| mesocycle `name` | string, trimmed 1–80 | `validation_error` "Enter a name." / "Keep the name to 80 characters or fewer." |
| `startDate` | empty → null; else `^\d{4}-\d{2}-\d{2}$` and a real date | "Enter a valid date." |
| `lengthWeeks` | integer 1–52 | "Enter a whole number of weeks, 1 or more." / "Keep it to 52 weeks or fewer." |
| `deloadWeek` | integer 1–52 | "Enter a whole number, 1 or more." |
| `deloadWeek` vs length | draft: allowed (readiness issue); active: `validation_error` "An active block needs a deload week inside it." | |
| active `startDate` null | `validation_error` "An active block needs a start date." | |
| `splitType` | one of the four | "Choose a structure." |
| session `name` | trimmed 1–80 | "Enter a name." |
| `dayOfWeek` | null or integer 1–7 | "Choose a day." |
| `plannedSets` | integer 1–20 | "Enter at least 1 set." / "Keep sets to 20 or fewer." |
| `targetRepMin` | integer 1–100 | "Enter at least 1 rep." / "Keep reps to 100 or fewer." |
| `targetRepMax` | integer 1–100, ≥ min | "The top of the range can't be below the bottom." |

Numbers arrive as strings from forms; parsing accepts only `^\d+$` (no decimals, signs, or exponents). The DB CHECKs back up the app rules.

---

## UI Data Contracts

```ts
type MesocycleStatusValue = "draft" | "active" | "archived";

type MesocycleSummaryDto = {
  id: string;
  name: string;
  status: MesocycleStatusValue;
  splitType: SplitTypeValue;
  splitLabel: string;              // "Push / Pull / Legs"
  startDate: string | null;        // YYYY-MM-DD
  endDate: string | null;          // planned end, YYYY-MM-DD
  lengthWeeks: number;
  deloadWeek: number;
  sessionCount: number;
  issueCount: number;              // readiness issues (computed on read)
  updatedAt: string;
};

type MesocycleHomeDto = { active: MesocycleSummaryDto | null; drafts: MesocycleSummaryDto[]; previous: MesocycleSummaryDto[] };

type PlannedExerciseDto = {
  id: string;                      // SessionExercise id
  exerciseId: string;
  exerciseName: string;
  primaryMuscleLabel: string;
  equipmentLabel: string;
  isCustom: boolean;
  imageUrl: string | null;
  isArchived: boolean;             // derived from Exercise.deletedAt
  plannedSets: number;
  targetRepMin: number;
  targetRepMax: number;
  position: number;
};

type SessionSummaryDto = { id: string; name: string; dayOfWeek: number | null; exerciseCount: number; archivedCount: number };

type MesocycleWeekDto = MesocycleSummaryDto & {
  week: (SessionSummaryDto | null)[];   // index 0 = Monday … 6 = Sunday
  unscheduled: SessionSummaryDto[];
  readiness: { ready: boolean; issues: ReadinessIssue[] };
  activeOther: { id: string; name: string } | null; // the currently active block if it isn't this one
};

type SessionDetailDto = {
  id: string; name: string; dayOfWeek: number | null;
  mesocycle: { id: string; name: string; status: MesocycleStatusValue };
  exercises: PlannedExerciseDto[];
  week: { dayOfWeek: number; sessionName: string | null }[]; // occupancy for the day picker
};

type CloneSetupDto = {
  source: MesocycleSummaryDto;
  defaults: { name: string; startDate: string | null; lengthWeeks: number; deloadWeek: number };
  exerciseCount: number;
  archivedReferences: { exerciseName: string; sessionName: string }[];
};

type ReadinessIssue =
  | { code: "name_missing" }
  | { code: "start_date_missing" }
  | { code: "length_invalid" }
  | { code: "deload_out_of_range"; deloadWeek: number; lengthWeeks: number }
  | { code: "nothing_scheduled" }
  | { code: "session_empty"; sessionId: string; sessionName: string; dayOfWeek: number }
  | { code: "exercise_archived"; sessionId: string; sessionName: string; sessionExerciseId: string; exerciseName: string }
  | { code: "exercise_plan_invalid"; sessionId: string; sessionName: string; sessionExerciseId: string; exerciseName: string };
```

Readiness order: name, start date, length, deload, nothing scheduled, empty scheduled sessions (Mon→Sun), archived slots (scheduled sessions Mon→Sun, then unscheduled; by position), invalid slots. Empty **unscheduled** sessions are not issues; archived slots in unscheduled sessions are.

---

## Testing Strategy

Runner: Jest (unit) and Jest + embedded Postgres 18 (integration), Playwright (unauthenticated boundary), per Foundation. Integration tests run against the throwaway DB only.

### 1. Pure modules (unit)

```text
TEST: presets_exact_structures
THEN: PPL = Mon Push Day 1, Tue Pull Day 1, Wed Leg Day 1, Thu Push Day 2, Fri Pull Day 2, Sat Leg Day 2, Sun none
      Arnold = Chest & Back 1, Shoulders & Arms 1, Legs 1, Chest & Back 2, Shoulders & Arms 2, Legs 2, Sun none
      Bro = Chest, Back, Shoulders, Legs, Arms, Sat none, Sun none; Custom = []
      presets.ts contains no exercise, set, rep, or weight field

TEST: calendar_end_and_clone_start      (2026-09-28, 5 weeks → end 2026-11-01, clone start 2026-11-02)
TEST: calendar_week_for_date            (start Wed: week 1 Wed–Tue; before start → null; after end → week > length)
TEST: validation_rep_range_never_swapped (min 10, max 8 → error on max; 5–5 valid; 0 sets invalid; "3.5" invalid)
TEST: readiness_*                       (each rule; draft ready; empty unscheduled ignored; archived in unscheduled counts; order)
```

### 2. Lifecycle (integration)

```text
TEST: new_mesocycle_is_draft_with_defaults_allowed       — create w/o start date → status draft
TEST: incomplete_draft_saves_but_cannot_activate         — invalid_state_transition, status unchanged
TEST: valid_draft_activates                              — status active
TEST: activation_archives_previous_atomically            — A active, B activated → A archived, B active
TEST: never_two_active_db_level                           — raw UPDATE to make a 2nd active → unique violation
TEST: expected_active_mismatch_conflict                  — nothing changes
TEST: activation_rechecks_readiness_in_tx                — archive the only exercise after page load → refused
TEST: archived_is_read_only                              — every write → invalid_state_transition
TEST: archived_readable_and_cloneable
TEST: active_db_check                                    — raw UPDATE active with deload > length → CHECK violation
TEST: active_details_rules / draft_deload_past_length_saves_and_lists_issue
TEST: archive_draft_only_from_draft
```

### 3. Presets & schedule (integration)

```text
TEST: preset_creates_exact_sessions_and_zero_session_exercises (each preset, count(session_exercises)=0)
TEST: custom_creates_no_sessions
TEST: rest_day_valid_one_session_valid_two_impossible (unique index; app conflict)
TEST: occupied_day_not_overwritten_without_replace (conflict, occupant unchanged)
TEST: replace_moves_occupant_off_schedule (occupant.dayOfWeek = null, still exists)
```

### 4. Session builder (integration)

```text
TEST: add_uses_active_library_exercise; add_archived_rejected; same_exercise_twice_rejected (app + DB)
TEST: sets_and_rep_bounds (app + DB CHECKs); equal_min_max_valid
TEST: order_persists_and_moves_swap; remove_renumbers
TEST: remove_slot_leaves_exercise_row_identical (deletedAt null, isFavorite unchanged)
TEST: empty_draft_session_ok; scheduled_empty_session_blocks_activation
TEST: replace_keeps_sets_reps_position
```

### 5. Duplication (integration)

```text
TEST: duplicate_is_new_row_with_copied_slots (exercise, order, sets, reps)
TEST: editing_copy_does_not_touch_source; removing_copy_keeps_source
TEST: duplicate_copies_archived_reference_as_repair_slot
TEST: duplicate_copies_no_history (logged_* counts unchanged)
```

### 6. Clone-forward (integration)

```text
TEST: clone_is_new_draft_source_unchanged (deep snapshot equality before/after)
TEST: clone_copies_sessions_days_names_slots_length_deload_split
TEST: clone_defaults (name "<src> Copy", start = end + 1, editable)
TEST: clone_independent_both_ways
TEST: clone_copies_no_logged_rows_goals_or_baselines (seed a LoggedSession/LoggedExercise/LoggedSet/Goal/GymExerciseBaseline against the source; counts unchanged)
TEST: clone_archived_reference_preserved_not_reactivated_not_replaced; clone_unresolved_cannot_activate; replace_or_remove_repairs
TEST: clone_of_draft_rejected
```

### 7. Invariant / static guards (unit)

```text
TEST: plan_rows_written_only_by_plan_modules
TEST: no_logged_baseline_goal_cardio_writes_anywhere (existing guard, plan models removed from it)
TEST: deliberate_absences (no isGymVariable/applyBaselineCorrection/estimateOneRepMax/progressionTag/swapExercise/resolveMissedDay/logSet; no weight field on SessionExercise; no gymId on Session/Mesocycle; routes = exercises, gyms, plan)
TEST: every_plan_action_requires_user_first
TEST: migration_safety (existing guard now covers 2_ and 3_)
TEST: schema_drift (existing)
```

### 8. Browser (Playwright)

Unauthenticated requests to every `/plan…` route redirect to `/login`. Authenticated flows are verified manually against the local Supabase stack (D65).

### Test Data Factories

`tests/integration/support/plan-factories.ts`: `createTestExercise(overrides)`, `createTestMesocycle({ status, startDate, … })`, `createTestSession`, `createTestSessionExercise`, `seedLoggedHistoryFor(sessionId, exerciseId)` (raw rows, test-only).

---

## Acceptance Criteria

1. **Lifecycle**
   - [ ] New and cloned mesocycles are drafts; an incomplete draft saves; it cannot activate.
   - [ ] A ready draft activates; the previous active is archived in the same transaction; two active mesocycles can never exist.
   - [ ] Archived mesocycles are readable, read-only, and cloneable.
2. **Configuration**
   - [ ] Length defaults to 5 and deload to 5 in the form; both editable; deload > length is surfaced, never moved; start date required to activate.
3. **Presets**
   - [ ] PPL, Arnold, Bro create exactly the approved named sessions on the approved days; Custom creates none; no preset creates a SessionExercise, set count, rep range, or weight.
4. **Schedule**
   - [ ] Zero or one session per weekday; occupied days require explicit replace; displaced sessions are kept unscheduled.
5. **Session builder**
   - [ ] Picker reuses library search, Favorites, primary-muscle filter; archived exercises never offered; no duplicate exercise per session; sets ≥ 1; reps ≥ 1; min ≤ max; equal allowed; order persists; removing a slot never touches the Exercise.
6. **Duplication**
   - [ ] Independent copy with exercises, order, sets, reps; no history.
7. **Clone-forward**
   - [ ] New draft; source unchanged; plan copied; defaults (name + Copy, start = end + 1); no history, goals, or baselines; archived references preserved for repair and block activation until fixed.
8. **UI contract**
   - [ ] Screens match the preview's hierarchy, controls, states, copy, and phone-first layout.
9. **Deliberate absences**
   - [ ] No logging, LoggedSet path, progression, planned weight, gym on sessions, missed-day, swap, cardio, or generated programming.

---

## Explicit Non-Goals

- ❌ Program or mesocycle generation, including filling presets. **Permanent.** Clone-forward is approved and is not generation.
- ❌ Social or shared templates. **Permanent.**
- ❌ Planned weights on SessionExercise. **Not in this build** (working weight is a logging/progression concern).
- ❌ Logging, missed days, swap, progression, deload execution, cardio planning, goals. **Deferred** to their pitches.
- ❌ Plan versioning. **Deferred** (D37).

---

## Resolved Decisions

Decisions **D1–D37** are the pre-resolved decisions supplied in the Split & Mesocycle Builder run prompt ("Pre-resolved decisions" §1–§37); per that prompt they are approved authority, recorded here, not re-opened. Decisions **D38+** were resolved autonomously under the authority order (`CLAUDE.md` > approved planning docs as amended by the pitch and pre-resolved decisions > design doc > UI preview > this spec).

| # | Decision | Source / rationale |
| - | -------- | ------------------ |
| D1 | Lifecycle `draft`/`active`/`archived`; every new or cloned mesocycle starts `draft`; `active` only via explicit activation after readiness; archived stays readable and cloneable. `draft` is a **required upstream amendment** to the Architecture Doc. | Pre-resolved §1 |
| D2 | At most one active; activating with another active requires UI confirmation; confirmed → previous archived, draft active, atomically; never silently replaced. | Pre-resolved §2 |
| D3 | Readiness = name, start date, valid length, deload within length, ≥ 1 scheduled session, every scheduled session non-empty, every slot with valid sets and rep range, no archived references. Rest days valid. | Pre-resolved §3 |
| D4 | Mesocycle name required, not unique. | Pre-resolved §4 |
| D5 | Start date required before activation; calendar dates; never inferred from creation date. | Pre-resolved §5 |
| D6 | Length is a positive whole number, default 5 as an editable pre-fill; no narrow maximum. | Pre-resolved §6 |
| D7 | Deload default 5; `1 ≤ deload ≤ length`; shrinking length never moves deload; invalid state surfaced and blocks activation; no load reduction. | Pre-resolved §7 |
| D8 | PPL: Mon Push Day 1, Tue Pull Day 1, Wed Leg Day 1, Thu Push Day 2, Fri Pull Day 2, Sat Leg Day 2, Sun Rest; independent sessions; no content. | Pre-resolved §8 |
| D9 | Arnold: Mon Chest & Back 1, Tue Shoulders & Arms 1, Wed Legs 1, Thu Chest & Back 2, Fri Shoulders & Arms 2, Sat Legs 2, Sun Rest. | Pre-resolved §9 |
| D10 | Bro: Mon Chest, Tue Back, Wed Shoulders, Thu Legs, Fri Arms, Sat Rest, Sun Rest. | Pre-resolved §10 |
| D11 | Custom creates no sessions. | Pre-resolved §11 |
| D12 | Preset structure fully editable afterwards. | Pre-resolved §12 |
| D13 | Presets never choose exercises, favorites, sets, reps, weights, progression, or gym. Permanent. | Pre-resolved §13 |
| D14 | Zero or one lifting session per day. | Pre-resolved §14 |
| D15 | Assigning/duplicating onto an occupied day needs explicit replace/cancel; never overwrite or double-book. | Pre-resolved §15 (displaced handling: D56) |
| D16 | `Session` = planned template only. | Pre-resolved §16 |
| D17 | Session name required, not unique. | Pre-resolved §17 |
| D18 | Draft sessions may be empty; an empty scheduled session blocks activation. | Pre-resolved §18 |
| D19 | Exercise selection reuses the Pitch 2 library contract (search, Favorites, primary muscle, identity, archived exclusion). | Pre-resolved §19 (implementation: D57) |
| D20 | One occurrence of an Exercise per Session (product default introduced by this run). | Pre-resolved §20 |
| D21 | `plannedSets ≥ 1`. | Pre-resolved §21 |
| D22 | Rep bounds ≥ 1, min ≤ max, equal valid, never reordered. | Pre-resolved §22 |
| D23 | Explicit lifter-controlled order; mechanism chosen by design (D52). | Pre-resolved §23 |
| D24 | Removing a slot is plan editing; Exercise untouched. | Pre-resolved §24 |
| D25 | Removing a session is plan editing; nothing else touched. | Pre-resolved §25 |
| D26 | Duplication creates an independent session copying exercises, order, sets, reps. | Pre-resolved §26 |
| D27 | Duplicate name `<source> Copy`, editable. | Pre-resolved §27 |
| D28 | Duplication copies no history, gym, weight, progression, or completion. | Pre-resolved §28 |
| D29 | Archived references in a duplicated session become repair slots; never reactivated or replaced. | Pre-resolved §29 |
| D30 | Clone creates a new draft; source never mutated. | Pre-resolved §30 |
| D31 | Clone copies split type, length, deload, sessions, days, names, exercises, order, sets, reps. | Pre-resolved §31 |
| D32 | Clone never copies logged data, completion, missed-day state, progression, e1RM, goals, baselines. | Pre-resolved §32 |
| D33 | Clone name default `<source> Copy`; uniqueness not required. | Pre-resolved §33 |
| D34 | Clone pre-fills length, deload, split type. | Pre-resolved §34 |
| D35 | Clone start date defaults to source planned end + 1 day; editable. | Pre-resolved §35 |
| D36 | Archived references in a clone are explicit repair items blocking activation; never dropped, substituted, unarchived, or auto-favorited. | Pre-resolved §36 |
| D37 | No historical versioning subsystem; authoring edits allowed. | Pre-resolved §37 |
| D38 | **Two migrations** (`2_mesocycle_draft_status` adds the enum value alone; `3_split_mesocycle_builder` uses it). | Postgres forbids using a new enum value in the transaction that added it, and Prisma runs each migration file in one transaction. |
| D39 | **`start_date` converted in place from `timestamptz` to `date`** (`USING (start_date AT TIME ZONE 'UTC')::date`). | Calendar-date semantics (D5) without timezone drift; in-place, data-preserving; zero rows exist in production. |
| D40 | **`split_type` converted in place to enum `SplitType`**; fixed at creation; a label only; copied by clone. | Closed set the app validates; DB-level guarantee; Pitch 2 precedent (D20 there). Changing it later would imply re-generating structure, which presets must not do. |
| D41 | **Day encoding ISO 1 = Monday … 7 = Sunday**, Monday-first UI; `CHECK 1–7`; `UNIQUE (mesocycle_id, day_of_week)` (NULLs distinct). | Matches the design's Monday-first week; the unique index enforces D14 at the DB. |
| D42 | **Unscheduled sessions exist** (`dayOfWeek = null`, "Not on the schedule"). Empty unscheduled sessions don't block activation; archived references in them do. | Gives replacement a non-destructive home (D56); the downstream contract requires no unresolved references anywhere in an active plan. |
| D43 | **Archived reference is derived** (`SessionExercise.exercise.deletedAt != null`); no new column or table. | The FK is Restrict and exercises are never hard-deleted, so the original identity and name survive; computing it on read also covers the PRD library edge case (archiving an exercise used by a plan surfaces it). **No data-model amendment needed** for repair state. |
| D44 | **Active mesocycles are editable**; an edit or a library archive that makes one not-ready leaves it active with a "Needs attention" panel. | Pre-resolved §37 allows editing the current plan; blocking edits can't prevent library archival anyway. |
| D45 | **Archived mesocycles are read-only; no unarchive.** | Pre-resolved §1 ("no longer the current training plan"); clone forward is the path back. |
| D46 | **Archive draft** (`draft → archived`) exists; mesocycles are never hard-deleted. | Abandoned drafts must be clearable without a hard delete (not named in the pitch → stop condition 4). |
| D47 | **Clone sources are active and archived mesocycles; drafts are not.** | "Clone a prior mesocycle" — a draft is not a prior block. |
| D48 | **Activation confirmation always shown**; the action carries `expectedActiveId`, and a mismatch is `conflict`. | Makes the confirmed replacement exactly the one that happens. |
| D49 | **Single active enforced twice**: activation transaction + partial unique index `mesocycles_single_active`. | Experiment: `prisma migrate diff` ignores partial indexes and CHECKs, so the drift guard stays green. |
| D50 | **Sets and rep range are entered when adding an exercise** (dialog fields start empty); columns stay `NOT NULL` with CHECKs. | No app-chosen defaults (D13 spirit); no nullable "incomplete" slot state to reason about. |
| D51 | **Input sanity bounds**: names ≤ 80, length ≤ 52, sets ≤ 20, reps ≤ 100. | Prevent pathological input; far above real programming; not product rules. |
| D52 | **Ordering = reorder mode with up/down buttons**; positions contiguous 0..n−1; adjacent swap in one transaction; no unique index on position. | Mobile-first (pitch rabbit hole 8); avoids deferred-constraint gymnastics. |
| D53 | **Remove session = delete the Session row; slots cascade** (existing FK). Confirmed in an AlertDialog. A future `LoggedSession → Session` Restrict makes removal of a trained session fail loudly. | Pre-resolved §25 names removal; history safety preserved for Pitch 4. |
| D54 | **Remove slot = delete the SessionExercise row and renumber**; done from the edit dialog with a toast; no undo. | Pre-resolved §24; low-stakes authoring, quick to re-add. |
| D55 | **Duplicate name** `"<name> Copy"` with the source part truncated to keep ≤ 80; the UI lands on the copy. | Pre-resolved §27 + validation bound. |
| D56 | **Replacing an occupied day moves the displaced session to "Not on the schedule"** instead of deleting it. | Pre-resolved §15 allows it "if the design supports unassigned sessions"; non-destructive. |
| D57 | **Picker is a route** (`…/add`) using the library's URL params, `listExercises`, and `LibraryControls` (new `basePath`/`extraParams` props). Exercises already in the session render "In session" and are not selectable. | One data rule set (D19); server-rendered, no client fetch. |
| D58 | **Replace keeps sets, reps, position**; target must be active and not already in the session. | Pre-resolved §29/§36 repair path; D20. |
| D59 | **Calendar semantics** as in "Calendar semantics" above; one module `src/lib/plan/calendar.ts` is the only place week math happens. | Pitch: "do not let week numbering vary between features." |
| D60 | **New mesocycle start date is empty**, never prefilled. | Pre-resolved §5. |
| D61 | **Deload past length may be saved in a draft; rejected for an active block** (app + DB CHECK `mesocycles_active_is_well_formed`). | Pre-resolved §7 ("surface… before activation") + D44 well-formedness for the live plan. |
| D62 | **`conflict` added to `ErrorCode`.** | api-conventions defines it; occupied days and stale activation need it. |
| D63 | **Nav: "Plan" between Today and Exercises** (`CalendarRange` icon). | Design doc IA. |
| D64 | **shadcn `radio-group` and `alert-dialog` primitives added** from the already-installed `radix-ui` package; no new dependency. | Design doc + preview. |
| D65 | **Authenticated browser flows verified manually against the local Supabase CLI stack**; Playwright automates the unauthenticated boundary. | No test Auth backend in CI; production is off-limits. |
| D66 | **Plan write-module guard**: `Mesocycle`/`Session`/`SessionExercise` rows are written only in `src/lib/plan/mesocycles.ts` and `src/lib/plan/sessions.ts`. | Mirrors the Exercise and LoggedSet module guards. |
| D67 | **`mesocycleWeekForDate` exists but no "current week" UI.** | Defines semantics now for Pitch 4/5 without executing the plan. |
| D68 | **Readiness computed on read**, never stored. | CLAUDE.md derived-value posture. |
| D69 | **`Session.position` left unused** (default 0); scheduled sessions order by day, unscheduled by `createdAt`. | Day is the order; no new ordering concept needed. |
| D70 | **UI previews are static offline HTML galleries** (`docs/previews/*.html`), per the user's direction during this run; the `overload-ui-design` skill was rewritten accordingly. | User instruction 2026-10-08. |

---

## Open Questions

None blocking. Carried upstream (run report → Required upstream amendments):

1. Architecture Doc: Mesocycle status gains `draft`; one active at a time; `splitType` enum; `startDate` is a calendar date.
2. Preset skeletons and the "structure only" boundary documented upstream.
3. Zero-or-one session per day; unscheduled sessions.
4. One occurrence of an exercise per session.
5. Readiness/activation behavior.
6. Clone-forward defaults.
7. Session/slot removal as plan editing (distinct from Exercise archival).
8. No model amendment is needed for archived-reference repair (derived, D43).

For Pitch 4: what removing or editing a session means once logged history references it (today: removal fails on the Restrict FK); whether a "current week" indicator belongs on the dashboard.

---

## Future Considerations

- Guided Workout Logging reads the active mesocycle (`status = active`), `mesocycleWeekForDate`, the session whose `dayOfWeek` matches today's ISO weekday, and its ordered SessionExercises with `plannedSets` and target rep range. It must still handle an archived exercise in the active plan (D44).
- The Progressive Overload Engine reads `targetRepMin/Max` and `deloadWeek` from the plan.
- Cardio Logging can attach to `(mesocycleId, dayOfWeek)` without changing these tables.

---

## Ticket Breakdown (build order)

1. **Mesocycle lifecycle & setup** — migrations 2/3, schema, presets/calendar/validation/readiness modules, `mesocycles.ts` (create, details, activate, archive draft), queries, Plan nav, Plan home, New mesocycle, week screen (read view, readiness panel, activate/archive dialogs), Edit details, guard updates, radio-group/alert-dialog primitives.
2. **Weekly schedule & sessions** — `sessions.ts` session ops (add, rename, move, remove, replace flow), day picker, add/rename/remove dialogs, unscheduled list, session builder shell (header, menu, empty/read-only).
3. **Session exercises & picker** — slot ops (add, edit, replace, remove, reorder), picker route with `LibraryControls` reuse, planned-exercise dialog, reorder mode, archived repair state.
4. **Session duplication** — `duplicateSession`, Duplicate menu item + day picker mode, independence tests.
5. **Clone-forward** — `cloneMesocycle`, clone source + setup screens, archived-reference summary, no-history tests, final deliberate-absence guards.
