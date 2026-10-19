---
version: 1.0.0
status: approved
author: Claude (autonomous pipeline run, on behalf of William Rhodes)
last_updated: 2026-10-18
pitch_reference: pitches/08-multi-user-foundation.md (Linear doc 064aad1b-a72c-459e-a9d1-2c58ecc5a687)
design_reference: docs/design/08-multi-user-foundation-design-doc.md
ui_preview: skipped — no UI surface (run prompt; recorded in docs/runs/08-multi-user-foundation-progress.md)
prd_reference: owner-approved multi-user PRD (see R1) — "Account Ownership & Isolation"
architecture_reference: owner-approved multi-user Architecture Doc (see R1) — Data Model/Ownership, Profile, Auth & Identity, Authorization, Environments & Deployment, Open Questions
linear_issue: see docs/runs/08-multi-user-foundation-progress.md (milestone "Multi-User Foundation")
---

# Multi-User Foundation — Technical Specification

## 2. Summary

Multi-User Foundation gives every private row in Overload an owning account and makes it structurally impossible for application code to touch owned data outside the acting account. Every owned model — including children such as `SessionExercise`, `LoggedExercise`, and `LoggedSet` — gains a `userId` referencing a new `Profile` (one per Supabase auth user, holding the account's IANA timezone). The shared exercise library is the single exception: library `Exercise` rows have `userId = null`, are readable by every account, and are never written by application code. Custom exercises are owned.

The core abstraction is the **`Account`**: an object resolved on the server from the authenticated session (`requireAccount()`), carrying the acting `userId`, the account's `timeZone`, and an **account-scoped Prisma client** (`account.db`). That client is the shared Prisma client wrapped in a query extension that, for every operation on every owned model, intersects the `where` with `userId = acting` and stamps `userId = acting` onto created rows; for `Exercise` it reads `library ∪ own` and writes `own` only. Feature code never imports the raw client — a lint rule and a guard test enforce that only `src/lib/data/` (the scoped layer) may. Write modules change from `fn(input, tx?)` to `fn(account, input, tx?)`; reads from `fn(args)` to `fn(account, args)`. Because a foreign row is simply absent from the scoped client's view, "another account's object behaves exactly like a nonexistent one" falls out of the construction rather than out of per-call care. A database-level second layer (same-owner triggers, immutable ownership, custom ⇔ owned CHECK, per-account partial unique indexes) backs it up, in the same spirit as the `onDelete: Restrict` layer behind the logged-history invariant.

"Working" means: the original production account, after a staged, rehearsed migration that a human applies (expand → assign every existing row to the named account → enforce), sees byte-for-byte the same plan, history, gyms, baselines, goals, favorites, and calendar day it saw before; a second account sees only the shared library and its own data; for every owned model and every read and write path, the cross-account isolation suite proves the second account cannot read, change, enumerate, or detect the first account's data, or cause a write to be attributed to it; and RLS remains deny-all on every table, including the two new ones.

## 3. Problem

- The app cannot yet say which account owns a row: no owned table has an owner column, so a second account would share every plan, gym, workout, goal, and cardio log with the first.
- The app cannot yet prevent a forgotten filter from leaking data: Prisma bypasses RLS, ~100 query sites call the raw client directly, and nothing forces any of them to scope.
- The app cannot yet let two lifters each have an active mesocycle or each have an active goal on Barbell Bench Press: `mesocycles_single_active` and `goals_one_active_per_exercise` are global unique indexes.
- The app cannot yet keep one lifter's favorites or archive decisions from changing another's library: `isFavorite` and `deletedAt` live on the shared library `Exercise` row.
- The app cannot yet decide "today" per account: it reads the browser's zone from a cookie (`overload-tz`, falling back to UTC), not a stored per-account value.
- The app cannot yet convert production: the only real copy of the lifter's history has no owner and must be assigned without loss.

This blocks Accounts (Pitch 9): signup must never open while data is unscoped.

## 4. Scope and non-scope

### In scope

1. `Profile` model (per auth user: timezone, nullable names) and `ExerciseFavorite` model (per-account favorites).
2. `userId` ownership on every owned model; nullable `userId` on `Exercise` (null = library).
3. The account-scoped data-access layer (`src/lib/data/`), `requireAccount()`, operator/test account constructors, and the static checks that keep raw Prisma inside it.
4. Conversion of every feature module, server action, page, and the real-plan import operator script to the scoped layer.
5. Per-account uniqueness (active mesocycle, active goal per exercise); review of all other constraints.
6. Library read-only enforcement (no archive/restore/edit of library rows; Archive control rendered only for custom exercises); favorites moved to the per-account table.
7. Per-account timezone: profile-stored IANA zone is the only authority for today/weekday/past-date; cookie authority and `TimeZoneSync` retired.
8. Staged migration: `9_account_ownership_1_expand`, the ownership backfill operator (Stage 2), `9_account_ownership_2_enforce` with a completeness guard; database second layer (triggers, CHECKs, FKs).
9. The permanent cross-account isolation suite, DB-layer isolation tests, migration rehearsal tests, RLS coverage for new tables.
10. Rehearsal on the local development stack; the production runbook (human-applied).

### Out of scope

- Signup, invite codes, login changes, logout, password reset, SMTP, email verification, social login (Accounts, Pitch 9).
- Profile editing UI, timezone capture at signup, Settings (Accounts / later).
- Account deletion and its module (Accounts). This spec only keeps it possible (dependency-ordered deletion of `userId`-carrying rows, profile last).
- Enabling production signup; applying any migration to production; reading production data (human runbook).
- Roles, admin, impersonation, sharing, cross-account visibility (permanent).
- Any change to logging, progression, baselines, goals, cardio, missed days, swap, or plan behavior beyond scoping. In particular the gym-baseline threshold, progression constants, and e1RM formula are untouched.
- Un-archiving library exercises archived in the single-user era (product decision; flagged in the run report).
- Dropping `exercises.is_favorite` (destructive; a later human-approved migration — R12).

## 5. Core concepts

| Concept | Description |
| ------- | ----------- |
| **Account** | The acting lifter. One Supabase auth user ⇔ one `Profile` row ⇔ one `userId` (the auth user id, a UUID). Resolved only from the authenticated session on the server. |
| `Profile` | One row per account, primary key `userId`. Holds `timeZone` (IANA, required), `firstName`/`lastName` (nullable until Accounts collects them). No email or password (Supabase Auth owns those). Root of ownership: every owned row's `userId` references it (`onDelete: Restrict`). |
| **Owned model** | Any model with a `userId` column: `Profile`, `Mesocycle`, `Session`, `SessionExercise`, `Gym`, `GymExerciseBaseline`, `LoggedSession`, `LoggedExercise`, `LoggedSet`, `MissedDayResolution`, `Goal`, `PlannedCardio`, `CardioLog`, `ExerciseFavorite`. `userId` is required (`NOT NULL` after enforce) and immutable. Children carry it directly so any query scopes without a join (Architecture). |
| `Exercise` (shared ∪ owned) | `userId = null` ⇔ library row (`isCustom = false`): shared, read-only to application code. `userId = X` ⇔ custom exercise of account X (`isCustom = true`). Readable set for account X = library ∪ X's custom. Writable set for X = X's custom only. |
| `ExerciseFavorite` | `(userId, exerciseId)` — account X starred exercise E (library or X's own custom). Replaces the shared `Exercise.isFavorite` flag. |
| **Account-scoped client** (`AccountClient`) | `prisma.$extends(...)` bound to one `userId`. The only path from feature code to the database. Its transaction client is `AccountTx`. |
| **Foreign object** | A row owned by another account. Through the scoped client it is indistinguishable from a nonexistent row: reads return `null`/omit it; targeted writes find nothing (`count: 0` / P2025). |
| **Same-owner rule** | Every owned row's owned parents have the same `userId`; every `Exercise` it references is library or has the same `userId`. Enforced by the scoped layer (parents are read through it) and by DB triggers. |
| **Stored timezone** | `Profile.timeZone`. The single authority for "today", weekday, and past-date checks for that account. |
| **Stages** | Expand (ownership can exist, nullable) → Assign (operator backfill to the named account) → Enforce (ownership mandatory, per-account rules authoritative, second layer installed). |

Preserved distinctions: `Session` is a planned template, `LoggedSession` a trained day, and the auth session is "auth session". Hold has no tag. Archive never deletes. Derived values (tag, e1RM, goal percent) are still computed on read and never stored; this pitch adds no derived column.

## 6. States and lifecycle

### Ownership lifecycle of a row

| From | To | Allowed? | Side effects |
| ---- | -- | -------- | ------------ |
| (legacy, `userId` null) | owned by named account | **only** via the Stage 2 backfill operator | none other; values untouched |
| owned by X | owned by Y | **never** | DB trigger raises; scoped client throws on any `userId` in update data |
| library (`userId` null, `isCustom` false) | owned | **never** | CHECK + immutability trigger |
| owned by X | deleted | only through the Accounts pitch's account-deletion module (not built here) | — |

### Migration stage state

| Stage | Schema state | Old (pre-pitch) code | New code |
| ----- | ------------ | -------------------- | -------- |
| 0 (today) | no ownership | works | — |
| 1 Expand (`9_…`) | `profiles`, `exercise_favorites`, nullable `user_id` + FKs + indexes | works unchanged (writes null `user_id`) | would show an empty app (rows unowned) — not deployed yet |
| 2 Assign (operator) | every legacy row → owner; profile + favorites created | works (any row it adds later is null → re-run assign) | — |
| 3 Enforce (`10_…`) | `NOT NULL`, per-account indexes, triggers, CHECK | **writes fail** (no `user_id`) → deploy new code immediately; do not log during the window | works |

### Existing lifecycles — semantics now per account

| Rule | Before | After |
| ---- | ------ | ----- |
| At most one active `Mesocycle` | global | per `userId` |
| At most one active `Goal` per `Exercise` | global | per (`userId`, `exerciseId`) |
| Library `Exercise` archive/restore | allowed | **refused** (not found); legacy archive state preserved |
| `Exercise` favorite | shared flag | per-account `ExerciseFavorite` row |

## 7. UI integration

No screen, route, form, or component is added (design doc §5). Changes:

| Surface | Change |
| ------- | ------ |
| All pages under `src/app/(app)` | `requireUser()` → `requireAccount()`; every read call passes `account`. |
| `src/app/(app)/layout.tsx` | Calls `requireAccount()` (ensures the profile exists early) instead of `requireUser()`; stops rendering `TimeZoneSync`. |
| All server actions | `await requireAccount()` first (same redirect-to-login semantics), then write modules with `account`. No action accepts a `userId`/account id parameter. |
| Exercise detail (`/exercises/[id]`) | `ExerciseDetailDto` gains `canArchive` (= custom and owned by the acting account; always true for any custom exercise the account can see). `ArchiveExerciseButton` renders only when `canArchive`. |
| Library list, detail, swap picker | `isFavorite` comes from the acting account's `ExerciseFavorite` rows. |
| `TimeZoneSync` (`src/components/shell/time-zone-sync.tsx`) and the cookie reader | Deleted. |
| Not-found | Pages already call `notFound()` when a read returns null; foreign ids now return null. No new code path. |

## 8. Data model

### Relationship to existing schema

| From | Relation | To | Description |
| ---- | -------- | -- | ----------- |
| every owned model | `userId` → `userId` (Restrict) | `Profile` | ownership root |
| `Exercise` | `userId?` → `userId` (Restrict) | `Profile` | null = library |
| `ExerciseFavorite` | `exerciseId` → `id` (Restrict) | `Exercise` | per-account star |
| `ExerciseFavorite` | `userId` → `userId` (Restrict) | `Profile` | owner |

### New models

```prisma
/// One per account, keyed by the Supabase auth user id (the account's userId).
/// Multi-User Foundation: the ownership root and the home of the account's
/// IANA timezone — the ONLY authority for "today" (src/lib/data/account.ts).
/// Email and password live in Supabase Auth, never here. Names are nullable
/// until Accounts (Pitch 9) collects them at signup.
model Profile {
  userId    String   @id @map("user_id") @db.Uuid
  firstName String?  @map("first_name")
  lastName  String?  @map("last_name")
  /// IANA zone name (e.g. "America/Chicago"), validated by isValidTimeZone on write.
  timeZone  String   @map("time_zone")
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz

  mesocycles           Mesocycle[]
  sessions             Session[]
  sessionExercises     SessionExercise[]
  exercises            Exercise[]
  exerciseFavorites    ExerciseFavorite[]
  gyms                 Gym[]
  gymExerciseBaselines GymExerciseBaseline[]
  loggedSessions       LoggedSession[]
  loggedExercises      LoggedExercise[]
  loggedSets           LoggedSet[]
  missedDayResolutions MissedDayResolution[]
  goals                Goal[]
  plannedCardio        PlannedCardio[]
  cardioLogs           CardioLog[]

  @@map("profiles")
}

/// Per-account favorite (replaces the shared Exercise.isFavorite flag, which is
/// retained in the table but no longer read or written — R12).
model ExerciseFavorite {
  userId     String   @map("user_id") @db.Uuid
  exerciseId String   @map("exercise_id") @db.Uuid
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  profile  Profile  @relation(fields: [userId], references: [userId], onDelete: Restrict)
  exercise Exercise @relation(fields: [exerciseId], references: [id], onDelete: Restrict)

  @@id([userId, exerciseId])
  @@index([exerciseId])
  @@map("exercise_favorites")
}
```

### Updated models (pattern applied to every owned model)

```prisma
model Mesocycle {
  // …existing fields…
  userId  String  @map("user_id") @db.Uuid   // nullable (String?) in migration 9, NOT NULL in 10
  profile Profile @relation(fields: [userId], references: [userId], onDelete: Restrict)
  @@index([userId])
}
```

Applied identically (field `userId`, relation `profile`, `@@index([userId])`, Restrict) to: `Session`, `SessionExercise`, `Gym`, `GymExerciseBaseline`, `LoggedSession`, `LoggedExercise`, `LoggedSet`, `MissedDayResolution`, `Goal`, `PlannedCardio`, `CardioLog`.

```prisma
model Exercise {
  // …existing fields…
  /// null = shared library row (read-only to the app); set = custom exercise of that account.
  userId    String?            @map("user_id") @db.Uuid
  /// DEPRECATED (Multi-User Foundation, R12): superseded by ExerciseFavorite.
  /// Not read or written by any code; kept so no column holding data is dropped.
  isFavorite Boolean           @default(false) @map("is_favorite")
  profile   Profile?           @relation(fields: [userId], references: [userId], onDelete: Restrict)
  favorites ExerciseFavorite[]
  @@index([userId])
}
```

### Constraints review (R11)

| Constraint | Before | After | Why |
| ---------- | ------ | ----- | --- |
| `mesocycles_single_active` | `UNIQUE (status) WHERE status='active'` | `mesocycles_single_active_per_user`: `UNIQUE (user_id) WHERE status='active'` | one active block per account |
| `goals_one_active_per_exercise` | `UNIQUE (exercise_id) WHERE status='active'` | `goals_one_active_per_exercise_per_user`: `UNIQUE (user_id, exercise_id) WHERE status='active'` | PRD AC |
| `sessions (mesocycle_id, day_of_week)`, `session_exercises (session_id, exercise_id)`, `gym_exercise_baselines (gym_id, exercise_id)`, `logged_sessions (session_id, scheduled_for)`, `missed_day_resolutions (mesocycle_id, missed_on)`, `logged_sets (logged_exercise_id, set_number)`, `planned_cardio (mesocycle_id, day_of_week)`, `cardio_logs (mesocycle_id, scheduled_for)` | unchanged | unchanged | keyed by an owned parent; same-owner rule makes them per-account already |
| `exercises_source_id_key` | unique | unchanged | library identity (custom rows have null) |
| `exercises` CHECKs (custom has no source/image) | unchanged | + `exercises_custom_is_owned`: `(is_custom AND user_id IS NOT NULL) OR (NOT is_custom AND user_id IS NULL)` | library ownerless, custom owned |

### Database second layer (migration 10 = `9_account_ownership_2_enforce`, R25)

- `overload_assert_same_owner()` — `BEFORE INSERT OR UPDATE` trigger function (generic, `TG_ARGV` = parent table, FK column, `allow_shared`). If the FK is non-null and the parent row exists, raises `check_violation` (`23514`) unless `parent.user_id = NEW.user_id` (or, with `allow_shared`, `parent.user_id IS NULL`). Installed for:

  | Child table | FK column → parent | allow_shared |
  | ----------- | ------------------ | ------------ |
  | sessions | mesocycle_id → mesocycles | no |
  | session_exercises | session_id → sessions; exercise_id → exercises | no; yes |
  | gym_exercise_baselines | gym_id → gyms; exercise_id → exercises | no; yes |
  | logged_sessions | mesocycle_id → mesocycles; session_id → sessions | no; no |
  | logged_exercises | logged_session_id → logged_sessions; exercise_id, planned_exercise_id → exercises; session_exercise_id → session_exercises; gym_id → gyms | no; yes; no; no |
  | logged_sets | logged_exercise_id → logged_exercises | no |
  | missed_day_resolutions | mesocycle_id → mesocycles; session_id → sessions | no; no |
  | goals | exercise_id → exercises; gym_id → gyms | yes; no |
  | planned_cardio, cardio_logs | mesocycle_id → mesocycles | no |
  | exercise_favorites | exercise_id → exercises | yes |

- `overload_user_id_immutable()` — `BEFORE UPDATE OF user_id` on every table with `user_id`: raises if `NEW.user_id IS DISTINCT FROM OLD.user_id`.
- Both functions `REVOKE ALL … FROM PUBLIC` and from `anon`/`authenticated` when those roles exist (Pitch 2 precedent), so the Data API RPC endpoint cannot call them.
- Migration 10 begins with a completeness guard (`DO` block) that raises — before any change — if any owned table has a `NULL user_id`, any custom exercise lacks an owner, or any library exercise has one, naming the table and count.

### Row-level security

```sql
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exercise_favorites" ENABLE ROW LEVEL SECURITY;
-- Deny-all. No policy is added anywhere; RLS is not the isolation mechanism.
```

### Derived fields

| Field / Concept | Stored? | Computed From | Notes |
| --------------- | ------- | ------------- | ----- |
| acting `userId` | no | authenticated auth session (server) | never from client input |
| account "today" | no | `Profile.timeZone` + clock | `todayIso(account.timeZone)` |
| `isFavorite` (DTO) | no | existence of `ExerciseFavorite(acting, exercise)` | |
| `canArchive` (DTO) | no | `exercise.isCustom` (visible custom ⇒ owned) | |
| progression tag, e1RM, goal % | no | unchanged | |
| `GymExerciseBaseline.weightLbs` | yes | unchanged | per account by its gym |

## 9. Authorization and access control

Three layers:

1. **Authentication** — every route except `/login` requires an auth session (proxy redirect + `requireAccount()` in the layout and in every server action). Unchanged semantics.
2. **Account scoping (the isolation mechanism)** — every owned-data operation goes through `account.db`. Feature code cannot reach the raw client (static checks, R8). The acting account comes only from `requireAccount()` (session) or, for operator scripts and tests, from `operatorAccount(userId)`/`accountFor(userId)` constructors that application code may not import (R9).
3. **Database** — RLS deny-all on every table closes the Data API; FKs to `profiles`, same-owner triggers, immutable ownership, and the custom ⇔ owned CHECK make a cross-account row unrepresentable even if layer 2 had a bug.

### Scoping rules (account client), per operation

| Model kind | Read ops (`findUnique[OrThrow]`, `findFirst[OrThrow]`, `findMany`, `count`, `aggregate`, `groupBy`) | Create ops (`create`, `createMany`, `createManyAndReturn`) | Targeted write ops (`update`, `updateMany[AndReturn]`, `delete`, `deleteMany`) | `upsert` |
| --- | --- | --- | --- | --- |
| owned | `where := { ...where, AND: [...where.AND, { userId }] }` | `data.userId := acting`; throws if `data.userId` present and different | `where` as reads; throws if `data.userId` present | where as reads, `create.userId := acting`, throws on `update.userId` |
| `Exercise` | `AND: [{ OR: [{ userId: null }, { userId }] }]` | as owned (custom only; `isCustom` must be true) | `AND: [{ userId }]` (library rows never match) | as targeted writes |

Additional refusals (throw `AccountScopeError`, a programming error → `internal_error` to the client, never a silent pass):

- any **nested relation write** in `data` (`create`, `createMany`, `connect`, `connectOrCreate`, `upsert`, `update`, `updateMany`, `delete`, `deleteMany`, `set`, `disconnect` under a relation field);
- any **traversal from `Exercise` into an owned back-relation** (`sessionExercises`, `loggedExercises`, `plannedLoggedExercises`, `baselines`, `goals`, `favorites`) in `include`, `select` (including `_count`), `where` (relation filters, through `AND`/`OR`/`NOT`), or `orderBy` — at the top level or nested under any `exercise`/`plannedExercise` relation;
- an operation on a model the layer does not classify (a new model must be added to the classification — owned iff its DMMF has a `userId` scalar; `Exercise` is the only shared-or-owned model).

Relation names and owned-ness are derived from `Prisma.dmmf` at runtime, so a new owned model is scoped automatically and a new `Exercise` back-relation is refused automatically.

### Access per resource

| Resource | Read | Create | Update | Delete |
| -------- | ---- | ------ | ------ | ------ |
| Owned models | own rows | own (stamped) | own | own (plan-authoring deletes only, as today) |
| Library `Exercise` | all accounts | never (operator seed only) | never | never |
| Custom `Exercise` | owner | owner | owner | never (archive) |
| `ExerciseFavorite` | owner | owner | — | owner (un-star) |
| `Profile` | owner | lazily on first `requireAccount()`; operator backfill | (Accounts) | (Accounts) |

### Not-found equivalence (R10)

For every id-taking read and write, the result for a foreign id must deep-equal the result for a random UUID that was never created (same `ActionResult`, same `notFound()`), and nothing is written. This is a test obligation for every path in the isolation suite.

## 10. Storage model

Unchanged. Exercise images remain public-domain library assets; custom exercises have no image; no per-account storage.

## 11. Server actions and API surface

### The scoped layer (`src/lib/data/`)

```ts
// src/lib/data/scope.ts — pure (no server-only), unit-tested.
export class AccountScopeError extends Error {}
export function scopeArgs(model: string, operation: string, args: unknown, userId: string): unknown;
export function ownedModels(): readonly string[];                 // from Prisma.dmmf
export const SHARED_OR_OWNED_MODEL = "Exercise";

// src/lib/data/account-db.ts — server-only.
export type AccountClient = ReturnType<typeof createAccountClient>;
export type AccountTx = Parameters<Parameters<AccountClient["$transaction"]>[0]>[0];
export type AccountDb = AccountClient | AccountTx;
export function createAccountClient(userId: string): /* prisma.$extends(...) */;

// src/lib/data/account.ts — server-only.
export type Account = { readonly userId: string; readonly timeZone: string; readonly db: AccountClient };
export const requireAccount: () => Promise<Account>;   // React cache(); requireUser() → ensure profile → Account
export function inAccountTx<T>(account: Account, tx: AccountTx | undefined, run: (t: AccountTx) => Promise<T>): Promise<T>;
export function accountToday(account: Account): string;  // todayIso(account.timeZone)

// src/lib/data/operator.ts — server-only; importable only from scripts/ and tests/.
export async function accountFor(userId: string, db?: PrismaClient): Promise<Account>; // requires an existing Profile

// src/lib/data/locks.ts — the ONLY raw SQL in src/: SELECT … FROM mesocycles
// WHERE id = $1 AND user_id = $acting FOR UPDATE.
export function lockMesocycleForUpdate(account: Account, tx: AccountTx, mesocycleId: string): Promise<LockedMesocycle | null>;
```

`requireAccount()`: `requireUser()` (redirects to `/login` if absent) → `createAccountClient(user.id)` → `profile.upsert({ where: { userId }, create: { userId, timeZone: "UTC" }, update: {} })` → `{ userId, timeZone, db }`. A missing profile can only belong to an account provisioned by hand for verification; production's account gets its profile in Stage 2.

### Signature convention

- Write modules: `export async function fn(account: Account, input: In, tx?: AccountTx): Promise<Out>` — `inAccountTx(account, tx, run)` replaces `inTx(tx, run)`/`prisma.$transaction`. CLAUDE.md's "every write function accepts an optional transaction client" is preserved.
- Reads: `fn(account, args)`. Helpers that previously took `db: Prisma.TransactionClient` take `db: AccountDb`.
- Creates of owned rows pass `userId: account.userId` explicitly (Prisma's create input requires the non-null owner); the scoped client verifies it and would stamp it anyway.
- Server actions keep their existing names, inputs, and `ActionResult` outputs. Each begins `const account = await requireAccount();`. No action gains an account parameter.

### Changed operations

| Operation | Change |
| --------- | ------ |
| `setExerciseFavorite(account, { exerciseId, isFavorite })` | Upserts/deletes `ExerciseFavorite`; exercise must be visible and active (else existing errors). Never writes `Exercise`. |
| `archiveExercise`, `restoreExercise` | Only the acting account's custom exercises; a library or foreign id → `not_found` ("That exercise doesn't exist."). |
| `listExercises`, `getExercise`, swap candidates | `isFavorite` from `ExerciseFavorite`; `getExercise` adds `canArchive`. Favorites view filters `id in (account's favorite ids)`. |
| `activateMesocycle` | Uniqueness conflict mapping unchanged; index is per user. |
| `createGoal` | Duplicate-active check and index per user. |
| Real-plan import CLI | Requires `--account-email <email>`; resolves exactly one auth user; uses `accountFor(userId)`; create-only as before. |

### Operator: ownership backfill (Stage 2)

```text
npx tsx scripts/operator/account-ownership/cli.ts \
  --email <account email> --time-zone <IANA zone> [--execute [--confirm-host <db host>]]
```

- Connects with `DIRECT_URL`; refuses a non-local host on `--execute` unless `--confirm-host` equals it exactly (prints host only, never secrets).
- Requires migration `9_account_ownership_1_expand` applied and `9_account_ownership_2_enforce` not applied.
- Resolves `auth.users` by case-insensitive email: exactly one match **and** exactly one auth user in total, else refuses.
- Validates the zone with `isValidTimeZone`.
- Dry run (default): read-only; prints resolved account, zone, per-table unowned counts, custom exercises, favorites to copy, library count (and archived library count), and every refusal reason.
- Execute, one transaction: insert `profiles` row if absent (refuse if present with a different zone); `UPDATE <owned table> SET user_id = $owner WHERE user_id IS NULL` for each owned table; `UPDATE exercises SET user_id = $owner WHERE is_custom AND user_id IS NULL`; `INSERT INTO exercise_favorites … SELECT $owner, id FROM exercises WHERE is_favorite ON CONFLICT DO NOTHING`; verify per-table counts before = after, zero unowned rows, zero rows owned by any other account; any mismatch throws → rollback. Prints before/after counts.
- Idempotent: a second run reports zero changes.
- Logic in `scripts/operator/account-ownership/backfill.ts` (`planOwnershipBackfill`, `executeOwnershipBackfill`) so tests exercise it directly.

## 12. Validation rules

| Field | Validation | Error |
| ----- | ---------- | ----- |
| `Profile.timeZone` (backfill, lazy create) | `isValidTimeZone` (IANA); lazy create uses `"UTC"` | operator refuses |
| `--email` | exactly one auth user, case-insensitive; exactly one auth user total | operator refuses |
| any `userId` in feature input | not accepted anywhere; outside `src/lib/data` the identifier appears only as `account.userId` (static guard) | — |
| `userId` in scoped `create` data ≠ acting | refused | `AccountScopeError` → `internal_error` |
| any `userId` in scoped update data | refused | `AccountScopeError` → `internal_error` |
| foreign or nonexistent id | identical | `not_found` (or the path's existing "isn't available" validation message) |

## 13. UI data contracts

```ts
type ExerciseListItemDto = { /* unchanged fields */ isFavorite: boolean /* acting account's star */ };
type ExerciseDetailDto = ExerciseListItemDto & { /* unchanged */ canArchive: boolean };
type SwapCandidate = { id: string; name: string; isFavorite: boolean /* acting account's star */ };
```

All other DTOs are unchanged. No DTO exposes `userId`.

## 14. Testing strategy

Priority (CLAUDE.md): 1 cross-account isolation, 2 logged-history integrity, 3 baseline isolation/atomicity, 4 progression, 5 missed days, 6 auth/RLS. Every existing suite must stay green after conversion (they run as a single test account).

### Test support

- `tests/integration/support/accounts.ts`: `createTestAccount(label)` inserts a `Profile` and returns `accountFor(userId)`. Factories (`plan-factories.ts` etc.) take the owning account.
- `APP_TABLES` gains `profiles`, `exercise_favorites`.

### 1. Scope transformer (unit, `tests/unit/account-scope.test.ts`) — pure

```text
TEST: injects_user_scope_on_every_read_op            (each read op × owned model)
TEST: exercise_reads_library_or_own
TEST: exercise_writes_own_only
TEST: create_stamps_acting_user / create_with_foreign_userId_throws / update_with_userId_throws
TEST: createMany_stamps_each_row
TEST: upsert_scoped_both_sides
TEST: nested_relation_write_throws                    (create/connect/… under relation)
TEST: exercise_back_relation_traversal_throws         (include/select/_count/where some|every|none/AND/OR/NOT/orderBy, top-level and nested under exercise/plannedExercise)
TEST: owned_model_classification_matches_schema       (every model but Exercise has userId)
TEST: caller_userId_filter_is_intersected_not_replaced
```

### 2. Cross-account isolation suite (integration, permanent) — `tests/integration/isolation/*.int.test.ts`

For each domain, Account A builds real data through the write modules; Account B then:

```text
TEST: <domain>_lists_exclude_other_account          every list/search/dashboard/history read returns only B's (empty) data
TEST: <domain>_get_by_foreign_id_is_not_found       every by-id read returns null / notFound, deep-equal to a random UUID
TEST: <domain>_write_with_foreign_id_is_not_found   every write module with A's ids → same result as random UUID; A's rows byte-identical after (snapshot)
TEST: <domain>_relations_never_cross                B's reads never include A's rows via include/relations; B's writes referencing A's parents fail as not_found
TEST: <domain>_creates_are_owned_by_actor           rows B creates carry B's userId, never A's
```

Domains: plan (mesocycles, sessions, session exercises, planned cardio, clone, activation), library (custom exercises, favorites, archive/restore incl. library refusal), gyms (+ baselines), logging (start/resume, log set, edit set, swap, didn't-do, complete, missed days, history, dashboard), progression reads, goals (create, archive, acknowledge, reconcile, lists), cardio (log, correct, history), profile/timezone.

```text
TEST: per_account_unique_active_mesocycle            A and B each activate a block
TEST: per_account_unique_active_goal                 A and B each hold an active goal on the same library exercise
TEST: library_exercise_cannot_be_archived_or_restored_by_any_account
TEST: favorites_are_independent_per_account
TEST: isolation_coverage_is_complete                 every DMMF owned model appears in the suite's coverage registry
```

### 3. Database layer (integration)

```text
TEST: same_owner_trigger_rejects_cross_account_child (raw insert per installed trigger)
TEST: same_owner_trigger_allows_library_exercise_reference
TEST: user_id_is_immutable
TEST: custom_is_owned_check
TEST: owned_tables_require_user_id                   NOT NULL after enforce
TEST: hard_delete_of_profile_with_rows_is_restricted
TEST: trigger_functions_not_executable_by_anon_or_authenticated
TEST: rls_enabled_no_policies_on_every_table          (existing test, now incl. profiles, exercise_favorites)
TEST: anon_data_api_returns_nothing                   (existing, extended)
```

### 4. Migration rehearsal (integration, own throwaway database)

```text
TEST: staged_migration_preserves_every_row_and_value
GIVEN: a database at migration 8 with real-shaped legacy data (library + archived library exercise,
       custom exercises, favorites on both, two gyms + baselines, an active and an archived mesocycle with
       sessions/slots/planned cardio, logged sessions with sets incl. extras/bodyweight/skipped,
       missed-day resolutions, active + completed goals, cardio logs) and a stand-in auth.users with one user
WHEN: migration 9 → backfill dry run → backfill execute → migration 10
THEN: dry run wrote nothing; every pre-existing row's non-ownership values are identical (full-table
      snapshot compare); per-table counts equal; every owned row's user_id = the account; library rows
      unowned and unchanged (incl. deletedAt); favorites = previous is_favorite set; profile.time_zone = supplied

TEST: enforce_refuses_when_backfill_incomplete      migration 10 fails, schema unchanged (atomic)
TEST: backfill_refuses_ambiguous_or_unknown_account / invalid_zone / existing_profile_with_other_zone / non_local_without_confirm
TEST: backfill_is_idempotent
TEST: enforce_on_empty_database_succeeds             (fresh environments)
```

### 5. Behavior preservation (integration)

```text
TEST: today_uses_profile_time_zone                   23:30 America/Chicago Sunday = Sunday, not UTC Monday
TEST: missed_day_and_shift_follow_profile_zone
TEST: new_account_gets_profile_with_utc_on_first_requireAccount
```

### 6. Static guards (unit, `tests/unit/invariant-guards.test.ts` + ESLint)

```text
TEST: only_src_lib_data_imports_lib_db
TEST: no_raw_sql_outside_src_lib_data
TEST: account_constructors_not_imported_by_app_code   (accountFor/createAccountClient only from src/lib/data, scripts, tests)
TEST: userId_only_as_account_userId_outside_data     (src/app, src/components, other src/lib)
TEST: no_supabase_client_query_of_app_tables         (existing posture)
TEST: TimeZoneSync_and_cookie_authority_removed
TEST: migration_safety                               (existing: no DROP TABLE/COLUMN, RENAME, INSERT, DELETE, CASCADE, policy) for 9 and 10
```

### 7. Existing suites (regression)

All 23 integration and 30 unit suites continue to pass with every call passing a test account. The logged-history guard ("LoggedSet written only in `logged-sets.ts`") is updated to recognize `account.db`/`tx` receivers.

### 8. E2E

Existing Playwright auth-boundary tests stay green (no route change).

## 15. Acceptance criteria

### Account isolation (PRD AC 1)
- [ ] Every owned model carries a required, immutable `userId`; `Exercise` carries a nullable one (null = library).
- [ ] No feature code can query owned data without the acting account (static checks pass; raw client imported only in `src/lib/data`).
- [ ] For every owned model and every read/write path, a second account cannot read, change, enumerate, or detect the first account's data, or cause a write attributed to it (isolation suite green, coverage meta-test green).
- [ ] The acting account is taken only from the authenticated session.

### Foreign lookup (PRD edge case)
- [ ] A foreign id produces exactly the result of a nonexistent id on every path.

### Uniqueness per account (PRD AC 3)
- [ ] Two accounts can each have an active mesocycle and each an active goal on the same exercise; within one account the existing rules still hold.

### Shared library (PRD description + edge case)
- [ ] Library exercises are readable by every account and cannot be edited, archived, or restored by any account; custom exercises are private to their owner; favorites are per account.

### Production data preservation (PRD AC 2) and recoverability (PRD edge case)
- [ ] The staged migration (expand → assign → enforce) preserves every row and value in rehearsal, with matching before/after counts, and refuses to enforce while anything is unassigned.
- [ ] The migration is rehearsed on the local development stack with real-shaped data; the runbook covers backup, production-copy rehearsal, verification queries, the human production steps, and restore.

### Roadmap conditions (pending PRD amendment)
- [ ] RLS remains enabled with no policies on every table, including `profiles` and `exercise_favorites`.
- [ ] "Today" resolves from the account's stored timezone; the existing account's stored zone is the one its days already follow.

## 16. Explicit non-goals

- ❌ Signup, invite codes, password reset, SMTP, profile editing, account deletion. **Deferred** to Accounts (Pitch 9).
- ❌ Enabling production signup or applying the production migration in the run. **Human rollout step.**
- ❌ Roles, admin, impersonation, sharing, any cross-account visibility. **Permanent.**
- ❌ RLS policies as the isolation mechanism. **Permanent** (Architecture).
- ❌ Per-account copies of the library. **Permanent.**
- ❌ Program generation; social features; cardio progression. **Permanent.**

## Resolved Decisions

| # | Decision | Rationale | Authority |
| - | -------- | --------- | --------- |
| R1 | The controlling planning docs are the owner's approved multi-user set (`Downloads/architecture (1).md`, `prd (1).md`, `pitch-roadmap (1).md`, `product-brief (1).md`, 2026-10-13), not the stale single-user copies in `docs/planning/`, which the run does not edit. | The approved pitch traces to sections that exist only there; they were issued with the byte-identical governing `.claude/CLAUDE.md`. Upstream amendment: commit them. | Pitch; `.claude/CLAUDE.md` |
| R2 | Ownership is a `userId` UUID column on every owned model (children included), FK → `profiles.user_id` `ON DELETE RESTRICT`. `Exercise.userId` nullable (null = library). No FK to `auth.users` (Prisma cannot model the auth schema; test databases have none). | Architecture: "every owned model, including child models, carries a userId… any query can be scoped without a join". Restrict keeps deletion an explicit, ordered act (Accounts). | Architecture Data Model; CLAUDE.md first invariant |
| R3 | The account-scoped data-access layer lives in `src/lib/data/` and is a Prisma query extension (`createAccountClient(userId)`), surfaced as an `Account { userId, timeZone, db }`. Write modules take `(account, input, tx?)`. | One choke point covers all ~100 call sites; scoping is applied by construction, not remembered per query; preserves the optional-tx convention. Verified on Prisma 7 (interactive transactions keep the extension). | Architecture Open Question "shape and location"; CLAUDE.md "layer set in the Multi-User Foundation spec" |
| R4 | Scoping semantics per operation as in §9: reads/targeted writes intersect `userId`; creates stamp it; a mismatched or update-time `userId` throws; ownership immutable. | Intersect (not replace) means even a buggy caller filter cannot widen the set; throwing makes misuse loud. | CLAUDE.md "an id is not authorization" |
| R5 | `Exercise` reads = library ∪ own; writes = own only; any traversal from `Exercise` into an owned back-relation is refused. Favorites are read from `ExerciseFavorite` directly. | The library is the one shared parent; its back-relations are the only way an owned child of another account could be reached by relation. No current code traverses them. | Pitch §1 "child record cannot become an accidental cross-account path"; Architecture |
| R6 | Nested relation writes are refused by the scoped client; the one existing nested create (`startOrResumeWorkout`) becomes an explicit `createMany`. | Nested creates bypass per-operation stamping; refusing keeps every write visible to the scope. | R3; CLAUDE.md |
| R7 | Raw SQL is allowed only inside `src/lib/data/`; the mesocycle row lock moves there and filters `user_id`. | Raw SQL bypasses the extension. | CLAUDE.md first invariant |
| R8 | The "static check in CI" is an ESLint `no-restricted-imports` rule plus guard tests in the unit suite. There is no CI service in the repository; lint and unit tests are mandatory per-commit checks under the pipeline policy. | Enforces at the same gate every commit already passes. Upstream note: add a CI workflow if desired. | CLAUDE.md; pipeline Verification honesty |
| R9 | Identity comes only from `requireAccount()` (session). `accountFor(userId)`/`createAccountClient`/`resolveAccount` are importable only by `src/lib/data`, `scripts/`, and `tests/`. Outside `src/lib/data`, the `userId` identifier may appear only as the session-derived `account.userId` (creates pass `userId: account.userId`, because Prisma's create types require the non-null owner; the scoped client still verifies it equals the acting account). *Amended during OVE-36: originally "no `userId` outside `src/lib/data`", which Prisma's required create input makes impossible without a schema/DB mismatch.* | Makes "never from client input" checkable and keeps ownership visible at every create. Operator tasks name the account explicitly (R16, R19). | CLAUDE.md; Architecture Auth & Identity |
| R10 | Foreign ⇒ exactly the nonexistent-id result on every path (deep-equal), including paths whose nonexistent result is a validation message. | Not-found, never forbidden. | PRD edge case; CLAUDE.md |
| R11 | Re-scope `mesocycles_single_active` → per `user_id` and `goals_one_active_per_exercise` → per (`user_id`, `exercise_id`); all other uniques are keyed by an owned parent and need no change; `source_id` stays global (library only). | Constraint review required by the pitch. | Pitch §3; PRD AC 3 |
| R12 | Favorites move to `ExerciseFavorite`. `exercises.is_favorite` is kept, unread and unwritten, marked deprecated; dropping it is a later human-approved migration. | A shared flag lets one account change another's library; dropping a data-holding column is a destructive operation the pitch does not name (stop condition 4). | Pitch §3, CLAUDE.md "application code never writes library rows"; Pipeline policy |
| R13 | Library exercises are read-only: archive/restore of a library row returns `not_found`; the Archive control renders only for custom exercises. Library rows archived in the single-user era are left as they are (no library row is modified by the migration). | PRD: "Library exercises cannot be edited or archived by any account." Preservation forbids side-effect data changes; un-archiving is a product decision (flagged). | PRD edge case; pitch no-gos |
| R14 | Second layer in the database: generic same-owner trigger, ownership-immutability trigger, custom ⇔ owned CHECK, `NOT NULL`, FKs to `profiles`; trigger functions revoked from PUBLIC/anon/authenticated. Composite FKs were rejected because two relations use `ON DELETE SET NULL`, which would null the shared `user_id`. | Mirrors the logged-history Layer 2: a bug in layer 1 fails loudly instead of silently mixing accounts. | CLAUDE.md layered enforcement; Pitch §1 |
| R15 | Staging: `9_account_ownership_1_expand` (additive, nullable) → Stage 2 operator backfill → `9_account_ownership_2_enforce` (completeness guard first; atomic). In production, 9 is applied with `prisma db execute` + `prisma migrate resolve --applied`, then the backfill, then `prisma migrate deploy` applies 10. An accidental single `migrate deploy` of both fails safe at 10's guard (9 applied, nothing else changed). | Prisma deploy has no "apply up to"; a data step between schema steps needs an explicit split; the guard makes the wrong order harmless. | Pitch §4 staged shape; Architecture Environments |
| R16 | The backfill is an operator script (not migration SQL): explicit `--email`, single-auth-user requirement, required `--time-zone`, dry run by default, `--execute` with `--confirm-host` for remote, one transaction, create/assign only, verified counts, idempotent. | Migrations contain no `INSERT` (standing guard) and cannot know the account or zone; operator-task rules in CLAUDE.md. | CLAUDE.md Operator tasks |
| R17 | `Profile.timeZone` required; `firstName`/`lastName` nullable until Accounts. An authenticated account without a profile gets one on first `requireAccount()` with `"UTC"`. | Accounts owns name and zone capture; hand-provisioned verification accounts must work; production's profile comes from Stage 2. | Architecture Profile; Pitch §5 |
| R18 | `Profile.timeZone` is the sole authority for today/weekday/past-date; the `overload-tz` cookie reader and `TimeZoneSync` are removed. The existing account's zone is the value of its current `overload-tz` cookie (the zone its days already follow), supplied by the operator. Consequence: travel no longer shifts "today" until Settings can edit the zone. | "Today is per account… not the browser's alone"; preserves the existing account's days at home. | CLAUDE.md "Today is per account"; Pitch §5 |
| R19 | The real-plan import becomes account-targeted (`--account-email`), using `accountFor`; otherwise unchanged (dry run default, create only). It is the repository's seeding example. | Operator tasks name the account explicitly. | CLAUDE.md Operator tasks; Roadmap "plan seeding is not a pitch" |
| R20 | Five tickets: (1) expand migration + scoped layer core; (2) ownership backfill operator + rehearsal harness; (3) scope plan, library, gyms (+ real-plan import); (4) scope logging, cardio, goals, progression + profile timezone; (5) enforce migration + DB second layer + isolation coverage completion + end-to-end rehearsal. Each domain ticket adds its isolation tests. | Medium-large PRs, each green on its own; enforcement lands last so intermediate states never require `NOT NULL`. | Run prompt step 6 |
| R21 | Rehearsal in the run uses the local Supabase development stack (backup with `pg_dump` first) and real-shaped data; the production-copy rehearsal is a runbook step for a human, because obtaining a production backup requires production credentials. | Stop condition 3 forbids the run touching production data or credentials. | Pipeline policy; Architecture Environments |
| R22 | Integration tests that need `auth.users` create a minimal stand-in table in their own throwaway database. | Embedded Postgres has no Supabase auth schema. | Existing test harness |
| R23 | Migration 10 runs in one transaction (verified against Prisma's runner in rehearsal tests; explicit transaction control added only if the runner does not already provide it). | A half-enforced schema is worse than either end state. | CLAUDE.md atomic multi-step writes (by analogy) |
| R24 | The run stops before merging the feature PR into `main`. | Run prompt. | Run prompt |
| R25 | The two schema stages are named `9_account_ownership_1_expand` ("migration 9" in this spec) and `9_account_ownership_2_enforce` ("migration 10"). *Amended during OVE-40: originally `9_account_ownership_expand` / `10_account_ownership_enforce`.* | Prisma applies migration directories in lexicographic order, so `10_…` sorts before `1_…` and would run second on every fresh database (found in OVE-40's runner check). The new names sort after `8_bodyweight_logging` and in stage order. Upstream note: later pitches must keep names sorting after these (e.g. `9a_…`) or adopt a timestamp scheme. | Prisma Migrate behavior; R15 |

## 17. Open questions

1. **Legacy library archives (non-blocking).** Library exercises archived during the single-user era stay globally archived (R13). Should a human un-archive them after migration? Default: leave as is; the dry run reports the count.
2. **CI service (non-blocking).** No CI workflow exists; the static checks run in lint and the unit suite (R8). Default: unchanged.

## 18. Future considerations

- **Accounts (Pitch 9):** signup creates the `Profile` (names, browser zone) before first use; account deletion deletes `userId`-carrying rows in dependency order (sets → exercises → sessions → … → favorites → custom exercises → profile) in one transaction — the only sanctioned bypass of the history rules, and the only module besides `src/lib/data` allowed the raw client. The `Restrict` FKs to `profiles` force that order.
- **Settings:** editing `Profile.timeZone` immediately re-bases "today"; nothing is stored per day, so no data migration is needed.
- **Tour / What's New:** `TourProgress` and `ReleaseSeen` will be owned models (a `userId` column ⇒ scoped automatically by the DMMF classification; the isolation coverage meta-test forces their tests).
- **Dropping `exercises.is_favorite`:** a later, human-approved migration.
