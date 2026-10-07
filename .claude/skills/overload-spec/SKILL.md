---
name: overload-spec
description: >
  Generate detailed technical specifications for Overload features. Use when
  creating new feature specs, updating existing specs, or when the user mentions
  "spec", "specification", "technical design", "implementation spec", or needs to
  document an Overload pitch for implementation. Specs follow a consistent
  structure with product context, data model changes, Prisma schema design,
  server action surfaces, UI integration, testing strategy, acceptance criteria,
  and explicit scope boundaries. Requires an expanded pitch and a design doc as
  input, with the PRD and Architecture Doc used as upstream references.
---

# Overload Specification Generator

Generate detailed technical specifications for Overload features following established project conventions.

Specs sit after the pitch and design-doc stages. They translate product and design intent into build-ready technical direction without becoming ticket-level task lists.

Overload's planning chain:

```text
Product Brief → PRD → Pitch Roadmap → Pitch → Design Doc → Technical Spec → Tickets → Build
```

The spec answers: **how should this feature be built?**

It defines data shape, mutations, server/client boundaries, validation, integration points, testing strategy, and acceptance criteria. It does not drift into product discovery or pixel-level visual design.

## Technical ground truth

**Read `CLAUDE.md` before writing any spec.** It is the authoritative statement of this project's stack, invariants, security rules, and product boundaries. Where a spec and `CLAUDE.md` conflict, `CLAUDE.md` wins. Read `docs/planning/architecture.md` for the rationale behind those decisions and for its Open Questions list, which a spec must not silently settle.

The following are inlined here only because this skill acts on them in nearly every spec:

- **Schema format:** Prisma schema (`schema.prisma`). Raw SQL appears only for what Prisma cannot manage, which in practice means enabling row-level security on each table.
- **Styling system:** Tailwind CSS with shadcn/ui. Do not introduce Material UI, styled-components, CSS modules, or a second component library.
- **Data-access idiom:** server-first. Server components read through Prisma; mutations are server actions that call the write modules. No client-side `fetch()` for application data.
- **Derived state:** the progress/hold/deload tag and the e1RM trend are computed on read and never stored. A spec that adds a column for either is wrong.

Everything else — the access model, what infrastructure the project deliberately lacks, what is deferred, the ranked invariants — comes from `CLAUDE.md` at invocation time. Do not restate it here.

## Prerequisites

Before writing a spec, ensure you have:

1. **Expanded pitch document** at `pitches/NN-pitch-name.md` — the scoped slice, problem, appetite, in-scope features, boundaries, definition of done, rabbit holes, no-gos, dependencies. Supplied by the user; this skill does not generate pitches. If it is missing, stop and ask for it.
2. **Design document** at `docs/design/NN-pitch-name-design-doc.md` — UI/UX behavior, screens, flows, states. See `overload-design-doc`.
3. **`docs/planning/prd.md`** — MVP features, acceptance criteria, user journeys, edge cases, Post-MVP boundaries.
4. **`docs/planning/architecture.md`** — approved stack, rationale, and Open Questions.
5. **`CLAUDE.md`** — repo engineering ground truth and invariants.
6. **Existing schema and migrations** — current `schema.prisma`, migration history, and the RLS state of every table.
7. **Existing app code** — directory structure, `lib/db.ts`, the write modules under `lib/`, the theme, and test patterns.

## File conventions

- **Filename:** `NN-pitch-name-spec.md`, matching the pitch's number and slug (`04-guided-workout-logging-spec.md`).
- **Location:** `docs/specs/`
- **Format:** Markdown with `prisma`, `sql`, `ts`, `tsx`, and `text` code blocks.
- **Schema examples:** Prisma. Include raw SQL only for enabling row-level security.
- **UI examples:** TSX using shadcn/ui components and Tailwind classes.

A blank scaffold lives at `assets/spec-template.md`. Use it when starting a spec from scratch.

## Required sections

Every spec must include these sections in order. Omit a section only when it genuinely does not apply to the feature — an empty section is worse than an absent one.

### 1. Metadata header

```markdown
---
version: 1.0.0
status: draft | review | approved
author: [name]
last_updated: YYYY-MM-DD
pitch_reference: [link or filename]
design_reference: [link or filename]
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
linear_issue: [issue ID, if applicable]
---
```

- Include every available upstream reference.
- Use the exact pitch and feature names from the roadmap and PRD (Foundation, Library & Gyms Setup, Split & Mesocycle Builder, Guided Workout Logging, Progressive Overload Engine, Goals, Cardio Logging). Do not rename features between documents.

### 2. Summary

Two to three paragraphs covering: what the feature does in one sentence; the core technical abstraction or mental model; how it fits Overload's training workflow; and what "working" means from an implementation perspective.

Worked example, abstraction first: "Guided Workout Logging turns a planned `Session` into a `LoggedSession`: the plan is read-only, and everything the lifter does produces `LoggedSet` rows. Nothing about progress is stored. 'Working' means a set entered at Downtown Gym is saved, its gym baseline is corrected in the same transaction when warranted, and the next read of the dashboard reflects it."

### 3. Problem

The specific technical or product gap this feature closes: current pain points, questions the system cannot answer today, why this blocks downstream work, which PRD journey it supports, which pitch it unlocks or depends on.

Worked examples, in the form "the app cannot yet…":

- The app cannot yet record a set against the gym it was performed at, so a machine's weight at two gyms collapses into one number.
- The app cannot yet say whether Hack Squat should go up, because there is no logged history to evaluate.
- The app cannot yet tell that Monday was skipped, so it would show Monday's plan forever.
- The app cannot yet show how close 315 × 1 is, because no e1RM exists to compare against.

### 4. Scope and non-scope

**In scope** — the exact feature behaviors this spec covers.

**Out of scope** — deferred or explicitly excluded behavior.

- Pull boundaries from the pitch and PRD.
- Explicitly name adjacent features that might tempt implementation creep. Example: the Guided Workout Logging spec produces raw logged data, and tagging it progress or deload belongs to the Progressive Overload Engine spec.
- If something is Post-MVP, say so.
- Do not relitigate permanent non-goals unless the feature is near one of them.

### 5. Core concepts

Define each entity, field, derived concept, or behavior the feature introduces.

| Concept | Description |
| ------- | ----------- |
| `LoggedSet` | One weight-and-reps entry, in lbs, belonging to exactly one `LoggedExercise`. The only source of truth for performance. Editable after the fact. |
| `GymExerciseBaseline` | Current working weight for one machine-based exercise at one gym. Stored, because logged sets alone cannot reconstruct it. |

Include: cardinality, required vs. nullable, derived vs. persisted, key distinctions between similar concepts, business invariants.

Overload-specific distinctions to preserve:

- `Session` is a planned template; `LoggedSession` is a day actually trained. Never write to the template while logging.
- A scheduled deload week and a reactive per-exercise deload are separate systems; the reactive check is suppressed during the scheduled week.
- Hold is a valid state that looks like "no data": it has no tag by design, and it is not an error.
- Archive (soft delete) removes something from selection lists, never from history.
- There is no ownership column. Overload is single-user, so no model carries a user or tenant key. Do not add one.

### 6. States and lifecycle

Valid states, transitions, and side effects. Use the exact values from `docs/planning/architecture.md` → Data Model.

```text
Mesocycle.status: active | archived
Goal.status: active | archived
```

`LoggedSession` completion status and the persistence of skipped and shifted days are open in the Architecture Doc. A spec that needs them must define them, mark the decision in Open Questions, and not present invented names as settled.

| From | To | Allowed? | Side effects |
| ---- | -- | -------- | ------------ |
| `Goal.active` | `Goal.archived` | yes, automatically at 100% progress | goal completion card offered; no data deleted |
| `Mesocycle.active` | `Mesocycle.archived` | yes | sessions and logged history remain readable |
| `Mesocycle.archived` | `Mesocycle.active` | not specified | decide in the Split & Mesocycle Builder spec |

- Only include state tables relevant to the current feature.
- Document terminal states and how they affect active views.
- Document confirmation behavior for destructive or surprising transitions. In Overload nothing is destructive, since removal is archival, so prefer undo over a confirmation dialog.
- Document the side-effect writes that must be atomic, such as a `LoggedSet` and its baseline correction.

### 7. UI integration

Reference the design doc for detailed UI/UX. This section specifies how the technical implementation supports the UI.

**Screens** — for each: purpose, data needed, actions.

**Components** — for each: data contract, notes.

**Forms and validation** — for each field: type, required, validation, notes.

**shadcn/ui integration** — document only where it matters: component choice, required variants, disabled and loading states, dialog behavior, accessibility expectations, theme token usage, responsive behavior. Do not restate the visual design; that is the design doc's job. Client components are interactive islands only (the logging card, swap picker, missed-day prompt, library search, charts); they call server actions and never hold data access.

### 8. Data model

Use Prisma schema. Raw SQL appears only for enabling row-level security (below).

**Relationship to existing schema** — a table of from / relation / to / description.

**New models** — full definitions with real field names, types, nullability, defaults, indexes, and mappings.

```prisma
model LoggedExercise {
  id              String   @id @default(uuid()) @db.Uuid
  loggedSessionId String   @map("logged_session_id") @db.Uuid
  exerciseId      String   @map("exercise_id") @db.Uuid
  gymId           String?  @map("gym_id") @db.Uuid
  position        Int
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz

  // History is never cascaded away. Every reference in the logged chain is Restrict.
  loggedSession LoggedSession @relation(fields: [loggedSessionId], references: [id], onDelete: Restrict)
  exercise      Exercise      @relation(fields: [exerciseId], references: [id], onDelete: Restrict)
  gym           Gym?          @relation(fields: [gymId], references: [id], onDelete: Restrict)
  sets          LoggedSet[]

  // No progression tag column and no e1RM column. Both are computed on read.
  @@index([loggedSessionId, position])
  @@index([exerciseId])
  @@map("logged_exercises")
}
```

**Updated models** — show only new or changed fields.

**Enums** — prefer Prisma enums for closed sets the Data Model names (`active`, `archived`). Use validated strings only where the planning docs leave the values open, and say so.

**Schema conventions:**

- Tables and columns map to `snake_case` with `@@map` and `@map`; model and field names stay PascalCase and camelCase.
- Identifiers are UUIDs; timestamps are `@db.Timestamptz` with `createdAt` and `updatedAt`.
- Weights are stored in lbs as decimals, and the column name carries the unit when ambiguity is possible (`weightLbs`).
- `Exercise` and `Gym` carry a nullable `deletedAt` for soft delete. Relations from logged history to them use `onDelete: Restrict`.
- Index every foreign key used in a join, and any column a list is filtered or sorted by.

**Row-level security** — Prisma does not manage it, so every migration that creates a table also enables RLS, with no policies:

```sql
ALTER TABLE "logged_exercises" ENABLE ROW LEVEL SECURITY;
-- Deny-all. Do not add policies for anon or authenticated to make something work.
```

**Derived fields** — a table of field / stored? / computed from / notes. Default posture: computed on read.

| Field / Concept | Stored? | Computed From | Notes |
| --------------- | ------- | ------------- | ----- |
| `progressionTag` | no | logged sets, planned rep range, mesocycle week | `progress`, `deload`, or none (hold) |
| `estimatedOneRepMax` | no | a logged set's weight and reps | one shared function; also used by goals |
| `goalProgressPercent` | no | goal target and current best, both through the same e1RM function | |
| `GymExerciseBaseline.weightLbs` | yes | corrected at log time | cannot be rebuilt from sets alone |

### 9. Authorization and access control

Overload is single-user: there is no per-row ownership, no tenant column, and no role model. Access control has two layers, and the spec must express both.

1. **Authentication in application code.** Every route and server action requires the authenticated session. Re-check it inside server actions, not just in middleware.
2. **Row-level security deny-all in the database.** It closes Supabase's public Data API, which the anon key can reach. Prisma bypasses RLS, so RLS is not what protects server code, and server code is not what protects the Data API. Neither layer is sufficient alone.

```ts
// Every server action starts with the auth check, then calls a write module.
export async function archiveGymAction(gymId: string) {
  await requireAuthenticatedUser(); // name set by the Foundation spec
  return archiveGym({ gymId });     // sets deletedAt; never prisma.gym.delete
}
```

Document required access per resource: read, create, update, delete.

- Never rely on the client to enforce anything.
- Never use the Supabase client to query application tables.
- There is no privileged path or sanctioned exception to the invariant. Do not invent one.

### 10. Storage model

Include only when the feature touches Supabase Storage (Library & Gyms Setup). The only content is public-domain exercise images from free-exercise-db, imported once by a seed script. Custom exercises have no image. There are no user uploads in this build.

The planning docs do not decide whether the bucket is public or private. The Library & Gyms Setup spec must state the posture and list it in Open Questions as blocking.

### 11. Server actions and API surface

Overload's posture: reads happen in server components via Prisma, and mutations are server actions that call the write modules. Add a route handler only where a server action cannot work (for example, an auth callback). There is no public API.

For each operation document: input type, output type, side effects.

```ts
type LogSetInput = { loggedExerciseId: string; setNumber: number; weightLbs: number; reps: number };

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; details?: Record<string, string> } };

// logSetAction(input: LogSetInput): Promise<ActionResult<{ setId: string }>>
// Side effects: inserts LoggedSet; applies gym baseline correction in the same transaction.
```

**Error response format** — the `ActionResult` shape above, with codes from the table in `references/api-conventions.md`.

See `references/api-conventions.md` for naming, result shapes, listing and filtering, idempotency, and the avoid list. Read it when specifying any operation.

### 12. Validation rules

Server-side validation for all inputs: field / validation / error code.

| Field | Validation | Error |
| ----- | ---------- | ----- |
| `weightLbs` | number, not negative | `validation_error` |
| `reps` | integer, at least 1 | `validation_error` |

- Validate on the server even if the UI validates first.
- Block input that is structurally invalid. Allow unusual but valid input: a weight far from a gym's baseline is not an error, because it may be a different machine, so it triggers baseline correction instead of rejection.
- How a zero weight or zero reps entry is handled is not settled upstream; the Guided Workout Logging spec must decide it.
- Do not allow invalid enum values.
- Do not leak internal database errors.

### 13. UI data contracts

The DTOs the UI consumes.

```ts
type ExerciseCardDto = {
  loggedExerciseId: string;
  exerciseName: string;
  gymName: string | null;        // null for free-weight exercises
  plannedSets: number;
  plannedRepRange: { min: number; max: number };
  sets: { setNumber: number; weightLbs: number | null; reps: number | null }[];
  progressionTag: "progress" | "deload" | null; // computed on read; null means hold
  estimatedOneRepMax: number | null;            // computed on read
};
```

- DTOs should match what screens need, not expose raw rows blindly.
- Credentials, the service-role key, and raw Prisma errors stay server-side.
- Derived field names (`progressionTag`, `estimatedOneRepMax`, `goalProgressPercent`) must be identical across every surface that shows them.

### 14. Testing strategy

Organize by feature area using GIVEN/WHEN/THEN. See `references/testing-patterns.md` for the full category definitions and templates.

Required categories:

1. **Happy path**
2. **Validation**
3. **State transitions**
4. **Side effects**
5. **Security / privacy** — history cannot be destroyed, RLS blocks the anon key on every table, and unauthenticated requests are redirected
6. **Edge cases**
7. **Integration scenarios**
8. **UI behavior**
9. **Regression tests**

Overload's risk-ranked priorities (must match `CLAUDE.md` → Testing):

1. Logged history integrity, adversarial and first
2. Gym baseline isolation and atomicity
3. The progression engine
4. Missed-day handling
5. Auth and RLS

Lean tests are fine for plain CRUD (library, gyms, cardio). Anything that writes or deletes logged history is never lean.

### 15. Acceptance criteria

Checkbox list grouped by feature area, tracing directly to the pitch, PRD, design doc, or ticket.

- Criteria must be observable and testable.
- Do not invent criteria the upstream docs do not support.
- If a needed criterion is missing upstream, add it under Open Questions.

### 16. Explicit non-goals

Mark each as permanent or deferred.

- ❌ Program or mesocycle generation. **Permanent.** Cloning a mesocycle forward is approved and is not generation.
- ❌ Social or sharing surfaces of any kind. **Permanent.**
- ❌ Progression analysis of cardio. **Permanent.**
- ❌ Dated goals. **Deferred** to Post-MVP.
- ❌ RPE/RIR logging. **Deferred** to Post-MVP.
- ❌ HealthKit and heart rate. **Deferred** to the mobile phase.

### 17. Open questions

Numbered list of unresolved decisions.

- Ask only material questions.
- Do not use Open Questions as a junk drawer for things the spec already decides.
- If a question blocks implementation, mark it blocking. If not, state the default assumption.
- Always check `docs/planning/architecture.md` → Open Questions first. Any item there that this feature touches must be resolved here, as a named constant or documented decision, or carried forward as blocking.

### 18. Future considerations

How this feature enables later work. Keep it clearly separate from current scope — future work is not a back door into the current ticket. Example: `GymExerciseBaseline` is shaped so location-pinned gyms and arrival notifications can attach to `Gym` later without touching logged history.

## Style guidelines

**Tables over ASCII diagrams** for relationships, field definitions, validation rules, data contracts, operation summaries, state transitions, and acceptance criteria groupings. ASCII only when it clarifies flow better than a table.

**Code blocks:** `prisma` for models, `sql` for the RLS statements, `ts` for types and server actions, `tsx` for UI, `text` for test cases and diagrams.

**Detail level** — be explicit about: field types, nullability, defaults, indexes, constraints, soft-delete behavior, access, derived vs. stored state, server/client boundaries, side effects, error cases, validation behavior, tests, acceptance criteria.

**Tone** — direct and technical. Use **must**, **should**, and **may** deliberately. Avoid hedging in requirements. Be clear when something is a product requirement versus an implementation recommendation. Keep scope boundaries firm.

## Reference files

- `references/api-conventions.md` — Overload server action and API conventions
- `references/testing-patterns.md` — test case templates and categories
- `assets/spec-template.md` — blank spec scaffold
- `CLAUDE.md` — technical ground truth and invariants
- `docs/planning/product-brief.md`, `prd.md`, `architecture.md`, `pitch-roadmap.md`
- The relevant expanded pitch and design doc

## Workflow

1. **Receive pitch and design input** — read both to understand scope and UI behavior.
2. **Read `CLAUDE.md`** — ground truth and invariants, before anything else technical.
3. **Read upstream docs** — PRD, Brief, Architecture (including Open Questions), Roadmap.
4. **Check existing schema and code** — identify what to extend rather than duplicate.
5. **Identify scope and non-scope** — protect the pitch boundary before designing details.
6. **Clarify critical ambiguities** — blockers only.
7. **Draft core concepts** — abstractions, relationships, invariants.
8. **Design the data model** — models, fields, indexes, constraints, RLS statements.
9. **Checkpoint if risky** — validate the data model with the user before continuing when the feature touches `LoggedSet` writes, deletion or archival behavior, gym baseline correction, or any new table's RLS.
10. **Define the operation surface** — server actions, result shapes, error behavior.
11. **Define UI data contracts.**
12. **Write the testing strategy** — acceptance criteria, edge cases, invariants, workflows.
13. **Review for scope creep** — remove Post-MVP or adjacent-pitch work.
14. **Finalize** — update status.

## Interview guidelines

- Start with the most critical unknowns.
- Ask only questions that materially affect implementation.
- Provide options: "Should a retried `logSet` be rejected by a unique constraint on `(loggedExerciseId, setNumber)`, or treated as an edit of that set?"
- Reference specific upstream sections when asking.
- Surface tradeoffs explicitly: "Computing `progressionTag` on read keeps edits to history correct automatically, at the cost of recalculating it on every dashboard load. With one user and a few hundred sets, is that acceptable?"
- Capture deferred decisions in Open Questions.
- Do not ask questions already answered by the PRD, pitch, design doc, or Architecture Doc.
