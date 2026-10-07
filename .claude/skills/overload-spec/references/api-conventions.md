# API Conventions

Standard patterns for Overload server actions, route handlers, and documented mutation surfaces.

Overload is a single-user strength training tracker, not a public API product. Every request runs as the one authenticated lifter; nothing here should imply otherwise. Most reads happen in server components through Prisma, and most writes happen through server actions that call the write modules under `lib/`. These conventions apply when specifying server action contracts, the rare route handler, or any documented mutation surface.

For the access model, what infrastructure the project deliberately lacks, and what is deferred, read `CLAUDE.md`. This file covers shape and naming only.

## Scope

Use these conventions for:

- Server actions, which are the default mutation surface
- Route handlers, only where a server action cannot do the job (an auth callback, for example)
- Read functions that feed server components, when a spec needs to document their output
- Any operation needing consistent naming, errors, validation, and result shapes

Do not create public API endpoints, and do not create REST endpoints for the app's own UI to call with `fetch()`. A pitch or spec must explicitly require either.

## Base configuration

For server actions:

```text
Invocation: server action, called from a client island or a form
Authentication: authenticated session, re-checked inside every action
Result: ActionResult<T> (see Response patterns)
```

For the rare route handler:

```text
Base URL: /api
Authentication: authenticated session, same as everything else
Content-Type: application/json
```

## Resource naming

Resources are named after the PRD data objects, in the Architecture Doc's model names. Operation names are `verbNoun`, camelCase, and domain-specific.

```text
Mesocycle      createMesocycle, cloneMesocycle, archiveMesocycle
Session        createSession, duplicateSession, assignSessionToDay
Exercise       createCustomExercise, archiveExercise
Gym            createGym, archiveGym
LoggedSession  startLoggedSession, completeLoggedSession, resolveMissedDay
LoggedSet      logSet, editLoggedSet
Goal           createGoal, archiveGoal
CardioLog      logCardio
```

Where a route handler is justified, use plural nouns for collections and nest only where ownership is part of the domain:

```text
/api/mesocycles
/api/mesocycles/:id/sessions
/api/logged-sessions/:id/sets
```

- Prefer names that match the PRD data objects exactly.
- Keep action names domain-specific: `resolveMissedDay`, not `updateStatus`.
- Do not create a generic workflow verb when a normal update is enough.
- Do not model deferred work (dated goals, RPE, HealthKit) in current operation names.

## Resource inventory

| Resource | Purpose |
| -------- | ------- |
| `Mesocycle` | A training block with a length and a scheduled deload week |
| `Session` | A planned workout template assigned to a day (with `SessionExercise` as its ordered exercises) |
| `Exercise` | A library or custom movement, soft-deletable |
| `Gym` | A named place the lifter trains, soft-deletable (with `GymExerciseBaseline` holding per-gym machine weights) |
| `LoggedSession` | A day actually trained (with `LoggedExercise` as the exercises performed) |
| `LoggedSet` | One weight-and-reps entry; the source of truth for performance |
| `Goal` | A per-lift weight × reps target, undated |
| `CardioLog` | A cardio record: type and duration |

`SessionExercise`, `GymExerciseBaseline`, and `LoggedExercise` are Architecture Doc entities that are managed through their parents, not exposed as standalone resources.

## Request patterns

### List

Lists are read in server components. When a spec documents one, use this shape:

```text
listExercises({ search?, muscleGroup?, includeArchived = false, limit = 50, offset = 0 })
```

| Param | Type | Default | Description |
| ----- | ---- | ------- | ----------- |
| `limit` | int | `50` | Max results |
| `offset` | int | `0` | Pagination offset |
| `search` | string | none | Case-insensitive partial match on exercise name |
| `muscleGroup` | string | none | Exact match on the exercise's muscle group |
| `includeArchived` | boolean | `false` | Pickers leave it false; history views must pass true |

Result shape:

```ts
{ items: ExerciseListItemDto[]; total: number; limit: number; offset: number }
```

Offset pagination is fine here. This is one user with at most a few thousand exercises and logged sets.

### Get

A get returns the full resource. A missing id returns `not_found`. An archived `Exercise` or `Gym` still resolves by id, because logged history references it.

### Create

Create operations take the minimum required fields and return the created resource with id and timestamps.

```ts
createGym({ name: "Downtown Gym", address: "Downtown, near the river" })
```

### Update

Partial update: include only changed fields. Edits to an `Exercise` or `Gym` never alter logged history. Editing a `LoggedSet` goes through `editLoggedSet` only, and every derived value follows because it is computed on read.

### Delete

Overload has no hard delete for anything the lifter can see. `Exercise` and `Gym` are archived by setting `deletedAt`; `Mesocycle` and `Goal` are archived by setting `status` to `archived`. Archiving needs no confirmation dialog and should return enough for the UI to offer undo. Deleting a `LoggedSet` is not specified in the planning docs; do not build it without a pitch.

## Domain actions

Each action traces to a PRD feature.

```ts
cloneMesocycle({ sourceMesocycleId: string, name: string }): ActionResult<{ mesocycleId: string }>
```

```ts
resolveMissedDay({ missedDate: string, choice: "log_late" | "shift" | "skip" }): ActionResult<{ resolved: true }>
```

`shift` moves the remaining days of the current week forward by one and must not carry into the following week. Where the result is persisted is an open question in the Architecture Doc; the spec that implements it must settle it.

```ts
swapExercise({ loggedExerciseId: string, replacementExerciseId: string, saveToTemplate?: boolean }): ActionResult<{ loggedExerciseId: string }>
```

`replacementExerciseId` must share a muscle group with the planned exercise, or the action returns `validation_error`. `saveToTemplate` defaults to false so the planned `Session` is untouched.

## Response patterns

**Success** — `{ ok: true, data }`, with timestamps in ISO 8601 with timezone. Mutations return the updated resource so the UI does not need a second fetch.

**Error** — the consistent shape:

```ts
{ ok: false, error: { code: ErrorCode; message: string; details?: Record<string, string> } }
```

- Error messages are plain English and action-oriented.
- Field-level validation goes in `details`.
- Never leak raw database errors, Prisma error text, or connection strings.
- A failed save must leave the user's entered numbers recoverable by the UI.

## Standard error codes

| Code | HTTP status | When to use |
| ---- | ----------- | ----------- |
| `not_found` | 404 | Resource does not exist |
| `validation_error` | 400 | Invalid input, including a cross-muscle-group swap |
| `invalid_state_transition` | 400 | Action not allowed for the current state |
| `duplicate_resource` | 409 | A true uniqueness constraint blocked the write |
| `conflict` | 409 | Incompatible change, such as a retried set colliding with an existing one |
| `unauthorized` | 401 | Missing or invalid session |
| `internal_error` | 500 | Unexpected failure |

`forbidden`, `rate_limited`, `unsupported_media_type`, and `payload_too_large` are intentionally absent: there is one user, no throttled surface, and no uploads.

## Duplicate and conflict handling

Overload blocks structurally invalid input and allows unusual-but-valid input. A weight far from a gym's baseline is a valid entry that triggers baseline correction, not a warning or an error.

One open case: the PRD requires at most one active `Goal` per exercise but leaves "blocked or replaces" undecided. The Goals spec must choose and record it. Until then, return `duplicate_resource` and do not silently replace the existing goal.

Use `409 duplicate_resource` only when a true uniqueness constraint prevents the write.

## Filtering and sorting

```text
Exact match:     ?muscleGroup=chest
Partial search:  ?search=bench
Date ranges:     ?performedAfter={iso}&performedBefore={iso}
```

| Sort field | Usage |
| ---------- | ----- |
| `name` | Exercise library default |
| `performedOn` | Logged sessions, newest first |
| `createdAt` | Gyms and goals |

- Only expose sort fields the backing query supports, and index them.
- No-match results return an empty collection, not an error.
- Search covers exercise names only.

## Idempotency

A flaky gym connection can double-submit a server action. Overload does not use idempotency keys. Instead, a retried `logSet` should collide on a unique constraint over `(loggedExerciseId, setNumber)` and return `conflict`, while a deliberate change goes through `editLoggedSet`. This is a default assumption: the Guided Workout Logging spec must confirm it and list it in Open Questions.

## Aggregates

Aggregate reads feed the dashboard, history, and charts. They are read functions, not stored resources.

```ts
getTodayPlan(): { greeting: string; session: SessionDto | null; state: "pending" | "complete" | "rest" }
getExerciseProgression(exerciseId: string): { points: { performedOn: string; estimatedOneRepMax: number }[]; progressionTag: "progress" | "deload" | null }
getGoalProgress(goalId: string): { goalProgressPercent: number }
```

- `progressionTag`, `estimatedOneRepMax`, and `goalProgressPercent` are computed on read and must not be persisted.
- Ordering: the week at a glance is chronological; the dashboard leads with today's pending session.

## Security and privacy

All operations must preserve Overload's security model. `CLAUDE.md` states the invariants; this section states the shape-level consequences.

- Require authentication for every read and write except the login screen.
- Never expose the service-role key or database credentials to clients.
- Never return stack traces, SQL, or Prisma internals in a response.
- Never accept a client-supplied `deletedAt`, derived tag, or e1RM; those are set or computed on the server.
- Validate every payload on the server.
- Gym addresses are personal location data: return them only from gym operations and the gym picker.

## Versioning

Use `/api` for any route handler, unversioned. Internal operations may evolve with the app, since no external contract depends on them.

## Naming summary

Good Overload operations:

```text
createMesocycle  cloneMesocycle  archiveMesocycle
createSession  duplicateSession  assignSessionToDay
createCustomExercise  archiveExercise
createGym  archiveGym
startLoggedSession  logSet  editLoggedSet  swapExercise  resolveMissedDay  completeLoggedSession
createGoal  archiveGoal
logCardio
getTodayPlan  getExerciseProgression  getGoalProgress
```

Avoid unless a pitch explicitly scopes them:

```text
/users  /teams  /share  /feed  /leaderboard  /follow
generateProgram  generateMesocycle  recommendProgram
cardioProgress  cardioTrends
/nutrition  /meals  /body-composition
```

Two approved operations resemble the avoid list. `cloneMesocycle` copies a mesocycle the lifter already built; it does not generate one. `getExerciseProgression` is a computed read, not a stored "progression" resource.
