---
version: 1.0.0
status: approved
author: Autonomous pipeline (Claude Code)
last_updated: 2026-10-06
pitch_reference: pitches/01-foundation.md
design_reference: docs/design/01-foundation-design-doc.md
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
linear_issue: Overload V1 — Foundation milestone
---

# Foundation — Technical Specification

## 2. Summary

Foundation ships the smallest production-ready substrate every later Overload pitch builds on: a single-account Supabase Auth login, server-enforced protected routing, the full approved Prisma schema with deny-all row-level security on every table, a single shared Prisma client, a separated dev/prod environment contract, a Jest + embedded-Postgres test harness that can never touch a real Supabase database, and a Vercel-deployable Next.js (App Router) app with a deliberately minimal authenticated shell.

The core technical abstraction is a closed door with exactly one key. Prisma is the only door into application data; the Supabase Data API is closed by RLS; and the one identity is created by hand, never through a signup surface. Foundation creates the *shape* of all eleven core entities but **no training behavior** — having a table does not authorize building the feature it represents.

"Working" means: an unauthenticated request to any application route or server action is redirected or rejected; the single account can sign in and reach an empty, honest shell; every application table has RLS enabled with zero policies; the integration suite runs only against a throwaway local Postgres; and a code change can deploy to production through the established Vercel pipeline (with production database migration performed by a human per the runbook).

## 3. Problem

The app cannot yet do anything, and that is the point of this slice. Specifically:

- The app cannot yet authenticate anyone, so there is no boundary between "the lifter" and "the public internet."
- The app cannot yet represent a `Mesocycle`, `Exercise`, `Gym`, or `LoggedSet`, because no schema exists.
- The app cannot yet guarantee the Supabase Data API is closed, so without deny-all RLS every future table would be world-readable through the anon key.
- The app cannot yet be tested safely, because no test runner or isolated test database is chosen, and a careless default could point tests at the real Supabase database.
- The app cannot yet be deployed through a repeatable path with separated dev/prod environments.

Foundation closes these gaps and unlocks Pitch 2 (Library & Gyms Setup), which needs authentication, deployment, and the entity substrate already working.

## 4. Scope and non-scope

### In scope
- Supabase Auth **email/password** login; no public signup, no registration route, no invite/onboarding.
- Server-enforced authentication: optimistic redirect in `proxy.ts` (Next.js 16's renamed middleware) **and** an independent re-check in the protected layout DAL and in every server action.
- Sign-out.
- The full approved Prisma schema for all eleven entities, with referential invariants (`onDelete: Restrict` on the logged chain; soft-delete fields on `Exercise`/`Gym`) and **no** stored progression tag or e1RM columns.
- One initial Prisma migration that creates every table **and** enables RLS (no policies) on every table, including `_prisma_migrations`.
- A single shared server-side Prisma client (`src/lib/db.ts`) using the pooled `DATABASE_URL`, with `DIRECT_URL` for migrations only.
- Environment separation (dev/prod Supabase projects; no staging) expressed in code and `.env.example`; secrets server-only.
- Tailwind CSS + shadcn/ui theme plumbing (tokens, Inter), `lucide-react`; a minimal authenticated shell (app bar, extensible nav with one real destination, account menu) that is phone-first and responsive.
- Jest unit + integration testing, integration against a throwaway local Postgres via `TEST_DATABASE_URL` (never Supabase, never a fallback to `DATABASE_URL`); Playwright only for the auth-redirect browser behavior.
- Vercel deployment configuration in code (build/`prisma generate` wiring).

### Out of scope (deferred to the pitches that own them)
- Exercise library/import/images, gym screens, mesocycle/session building, workout logging, swap, missed-day, progression/e1RM, goals, cardio behavior — **none** of it, even though the tables exist.
- Settings screen and appearance toggle UI; named-greeting personalization; any nav item beyond Today.
- Supabase Storage buckets and the exercise image posture (Library & Gyms Setup owns it).
- Production Supabase/Vercel provisioning and the production migration apply — human steps in the runbook, not code this run performs.

### Permanent non-goals (not relitigated)
Signup/registration, invites, multi-user/tenancy/roles, sharing/social, program generation, nutrition/body-composition. The product is single-user.

## 5. Core concepts

| Concept | Description |
| ------- | ----------- |
| Single account | Exactly one Supabase Auth user, created by hand in the Supabase dashboard. No model carries a user/tenant/owner column. |
| Auth session | The Supabase session, persisted via `@supabase/ssr` cookie integration. Never called a `Session` (that word is a planned workout template). |
| DAL (`requireUser`) | The one server-side function that resolves and validates the auth session and redirects to `/login` when absent. Re-checked in every server action. |
| Prisma = only door | All application data access is Prisma in server code. The Supabase client is used for Auth only in Foundation. |
| Deny-all RLS | Every table has RLS enabled and zero policies, so the anon-key Data API returns nothing. Prisma connects directly and bypasses RLS. |
| Planned vs logged (shape only) | The schema preserves the distinction (`Session`/`SessionExercise` are planned templates; `LoggedSession`/`LoggedExercise`/`LoggedSet` are history) without implementing either behavior. |
| Derived-never-stored | `LoggedExercise`/`LoggedSet` carry **no** progression tag and **no** e1RM column. Those are computed on read in later pitches. |

Single-user note: there is **no** ownership column on any model, by design. Do not add one.

## 6. States and lifecycle

Foundation introduces only auth states; it ships none of the training-state machinery.

```text
Auth: unauthenticated | authenticated
```

| From | To | Allowed? | Side effects |
| ---- | -- | -------- | ------------ |
| unauthenticated | authenticated | yes, via `signInAction` with valid credentials | Supabase session cookie set; redirect to `/` |
| authenticated | unauthenticated | yes, via `signOutAction` | session cleared; redirect to `/login` |
| unauthenticated | (protected route) | no | redirect to `/login` (proxy optimistic + DAL authoritative) |

Entity status enums named by the Architecture Doc (`Mesocycle.status`, `Goal.status` = `active`/`archived`) are **defined in the schema** (as validated values) but no transition behavior is implemented in Foundation.

## 7. UI integration

Reference `docs/design/01-foundation-design-doc.md` for screens and states.

**Screens**
- `/login` (public): email + password + submit; data needed: none; action: `signInAction`.
- `/` (protected, "Today"): data needed: an auth check only; actions: `signOutAction` from the account menu.

**Components**
- `LoginForm` (client island): calls `signInAction`; preserves email on error; renders inline destructive `Alert` on failure.
- `AppShell` / `AppBar` / `AppNav` / `AccountMenu`: chrome only; hold no data access; nav is an extensible list with exactly one real item (Today).

**Forms and validation**
| Field | Type | Required | Validation | Notes |
| ----- | ---- | -------- | ---------- | ----- |
| email | string | yes | non-empty, trimmed | server (Supabase) is authoritative |
| password | string | yes | non-empty | never logged; cleared on error |

**shadcn/ui integration** — `Button`, `Input`, `Label`, `Alert`, `DropdownMenu`, `Skeleton`. Submit shows a pending label and disables while submitting. The protected layout opts out of instant-navigation validation (`export const instant = false`) so it may block on the server for the auth check. Client components are islands that call server actions; they never access Prisma or hold credentials.

## 8. Data model

Prisma schema. Raw SQL appears only to enable RLS. Conventions: PascalCase models mapping to `snake_case` tables via `@@map`; camelCase fields via `@map`; UUID ids (`@default(uuid()) @db.Uuid`); `@db.Timestamptz` timestamps with `createdAt`/`updatedAt`; weights stored in lbs as `Decimal`; `Exercise`/`Gym` carry nullable `deletedAt`; logged-chain relations use `onDelete: Restrict`; every FK used in a join is indexed.

### Relationship to existing schema
There is no existing schema. This migration creates all tables.

### Models

```prisma
// datasource + generator
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // pooled, runtime
  directUrl = env("DIRECT_URL")     // direct, migrations only
}

generator client {
  provider = "prisma-client-js"
}

enum MesocycleStatus {
  active
  archived
}

enum GoalStatus {
  active
  archived
}

model Mesocycle {
  id             String          @id @default(uuid()) @db.Uuid
  name           String
  lengthWeeks    Int             @map("length_weeks")
  deloadWeek     Int             @map("deload_week")
  splitType      String          @map("split_type")
  status         MesocycleStatus @default(active)
  startDate      DateTime?       @map("start_date") @db.Timestamptz
  createdAt      DateTime        @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime        @updatedAt @map("updated_at") @db.Timestamptz

  sessions       Session[]
  loggedSessions LoggedSession[]

  @@map("mesocycles")
}

model Session {
  id          String    @id @default(uuid()) @db.Uuid
  mesocycleId String    @map("mesocycle_id") @db.Uuid
  name        String
  dayOfWeek   Int?      @map("day_of_week")
  position    Int       @default(0)
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  mesocycle        Mesocycle         @relation(fields: [mesocycleId], references: [id], onDelete: Cascade)
  sessionExercises SessionExercise[]
  loggedSessions   LoggedSession[]

  @@index([mesocycleId])
  @@map("sessions")
}

model SessionExercise {
  id            String   @id @default(uuid()) @db.Uuid
  sessionId     String   @map("session_id") @db.Uuid
  exerciseId    String   @map("exercise_id") @db.Uuid
  position      Int      @default(0)
  plannedSets   Int      @map("planned_sets")
  targetRepMin  Int      @map("target_rep_min")
  targetRepMax  Int      @map("target_rep_max")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz

  // Planned template references an Exercise; Restrict so an in-use exercise can't be hard-deleted.
  session  Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  exercise Exercise @relation(fields: [exerciseId], references: [id], onDelete: Restrict)

  @@index([sessionId, position])
  @@index([exerciseId])
  @@map("session_exercises")
}

model Exercise {
  id            String    @id @default(uuid()) @db.Uuid
  name          String
  muscleGroup   String    @map("muscle_group")
  equipmentType String    @map("equipment_type")
  imageRef      String?   @map("image_ref")
  isCustom      Boolean   @default(false) @map("is_custom")
  deletedAt     DateTime? @map("deleted_at") @db.Timestamptz
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  sessionExercises SessionExercise[]
  loggedExercises  LoggedExercise[]
  baselines        GymExerciseBaseline[]
  goals            Goal[]

  @@index([muscleGroup])
  @@index([deletedAt])
  @@map("exercises")
}

model Gym {
  id        String    @id @default(uuid()) @db.Uuid
  name      String
  address   String?
  deletedAt DateTime? @map("deleted_at") @db.Timestamptz
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  baselines       GymExerciseBaseline[]
  loggedExercises LoggedExercise[]

  @@index([deletedAt])
  @@map("gyms")
}

model GymExerciseBaseline {
  id         String   @id @default(uuid()) @db.Uuid
  gymId      String   @map("gym_id") @db.Uuid
  exerciseId String   @map("exercise_id") @db.Uuid
  weightLbs  Decimal  @map("weight_lbs") @db.Decimal(6, 2)
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt  DateTime @updatedAt @map("updated_at") @db.Timestamptz

  gym      Gym      @relation(fields: [gymId], references: [id], onDelete: Restrict)
  exercise Exercise @relation(fields: [exerciseId], references: [id], onDelete: Restrict)

  // One baseline per (gym, exercise).
  @@unique([gymId, exerciseId])
  @@index([exerciseId])
  @@map("gym_exercise_baselines")
}

model LoggedSession {
  id          String    @id @default(uuid()) @db.Uuid
  mesocycleId String?   @map("mesocycle_id") @db.Uuid
  sessionId   String?   @map("session_id") @db.Uuid
  performedOn DateTime  @map("performed_on") @db.Timestamptz
  completedAt DateTime? @map("completed_at") @db.Timestamptz
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  // History is never cascaded away by a plan edit. Restrict on the plan references.
  mesocycle Mesocycle? @relation(fields: [mesocycleId], references: [id], onDelete: Restrict)
  session   Session?   @relation(fields: [sessionId], references: [id], onDelete: Restrict)
  loggedExercises LoggedExercise[]

  @@index([performedOn])
  @@index([mesocycleId])
  @@map("logged_sessions")
}

model LoggedExercise {
  id              String   @id @default(uuid()) @db.Uuid
  loggedSessionId String   @map("logged_session_id") @db.Uuid
  exerciseId      String   @map("exercise_id") @db.Uuid
  gymId           String?  @map("gym_id") @db.Uuid
  position        Int      @default(0)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz

  // The logged chain is Restrict all the way down; history is never cascaded away.
  loggedSession LoggedSession @relation(fields: [loggedSessionId], references: [id], onDelete: Restrict)
  exercise      Exercise      @relation(fields: [exerciseId], references: [id], onDelete: Restrict)
  gym           Gym?          @relation(fields: [gymId], references: [id], onDelete: Restrict)
  sets          LoggedSet[]

  // No progressionTag column and no e1RM column. Both are computed on read in later pitches.
  @@index([loggedSessionId, position])
  @@index([exerciseId])
  @@index([gymId])
  @@map("logged_exercises")
}

model LoggedSet {
  id               String   @id @default(uuid()) @db.Uuid
  loggedExerciseId String   @map("logged_exercise_id") @db.Uuid
  setNumber        Int      @map("set_number")
  weightLbs        Decimal  @map("weight_lbs") @db.Decimal(6, 2)
  reps             Int
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt        DateTime @updatedAt @map("updated_at") @db.Timestamptz

  loggedExercise LoggedExercise @relation(fields: [loggedExerciseId], references: [id], onDelete: Restrict)

  // A retried set collides here; a deliberate change goes through editLoggedSet (later pitch).
  @@unique([loggedExerciseId, setNumber])
  @@map("logged_sets")
}

model Goal {
  id             String     @id @default(uuid()) @db.Uuid
  exerciseId     String     @map("exercise_id") @db.Uuid
  targetWeightLbs Decimal   @map("target_weight_lbs") @db.Decimal(6, 2)
  targetReps     Int        @map("target_reps")
  status         GoalStatus @default(active)
  createdAt      DateTime   @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime   @updatedAt @map("updated_at") @db.Timestamptz

  exercise Exercise @relation(fields: [exerciseId], references: [id], onDelete: Restrict)

  @@index([exerciseId])
  @@map("goals")
}

model CardioLog {
  id             String   @id @default(uuid()) @db.Uuid
  type           String
  durationMin    Int      @map("duration_min")
  performedOn    DateTime @map("performed_on") @db.Timestamptz
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz

  @@index([performedOn])
  @@map("cardio_logs")
}
```

**Invariant rationale captured in the schema (not behavior):**
- The entire logged chain (`LoggedSession` → `LoggedExercise` → `LoggedSet`) and its references to `Exercise`/`Gym`/`Mesocycle`/`Session` use `onDelete: Restrict`, so a hard delete of a referenced row fails loudly instead of cascading history away.
- `Session`/`SessionExercise` cascade from their owning `Mesocycle`/`Session` because they are plan structure, not history — but their reference *to* `Exercise` is `Restrict`.
- No `tag`/`e1rm`/`one_rep_max` column exists anywhere.
- No ownership/user column exists anywhere.

### Row-level security

Prisma does not manage RLS, so the initial migration's `migration.sql` appends, after the generated `CREATE TABLE`s:

```sql
ALTER TABLE "mesocycles"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session_exercises"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exercises"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gyms"                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gym_exercise_baselines"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "logged_sessions"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "logged_exercises"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "logged_sets"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goals"                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cardio_logs"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations"      ENABLE ROW LEVEL SECURITY;
-- Deny-all: NO policies are created for anon or authenticated. Prisma bypasses RLS as the table owner.
```

`_prisma_migrations` is included because it is also reachable through the Data API with the anon key. No `CREATE POLICY` statement exists anywhere in the migration history; adding one for `anon`/`authenticated` to make a query work is a blocking issue.

### Derived fields

| Field / Concept | Stored? | Computed From | Notes |
| --------------- | ------- | ------------- | ----- |
| `progressionTag` | no | (later) logged sets, planned rep range, week | no column exists |
| `estimatedOneRepMax` | no | (later) a set's weight and reps | no column exists |
| `GymExerciseBaseline.weightLbs` | yes | (later) corrected at log time | the one stored derived-ish value; table exists, no write path in Foundation |

## 9. Authorization and access control

Single-user: no per-row ownership, no roles. Two independent layers, both required:

1. **Authentication in application code.** `proxy.ts` performs an optimistic redirect for unauthenticated requests and refreshes the Supabase session cookie. The protected `(app)` layout calls `requireUser()` (authoritative), and **every server action re-checks** the session before doing anything.

```ts
// src/lib/auth.ts
import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";

export async function getAuthUser() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser(); // validates with the Auth server, not just the cookie
  return data.user ?? null;
}

export async function requireUser() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  return user;
}
```

```ts
// every server action starts with the check
export async function signOutAction() {
  await requireUser();
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
```

2. **Deny-all RLS in the database** closes the public Data API. Prisma bypasses RLS, so RLS is not what protects server code, and server code is not what protects the Data API. Neither layer is sufficient alone.

Access per resource in Foundation: there are no application-data reads or writes yet. The only operations are `signInAction`, `signOutAction`, both requiring (or establishing) the single session.

## 10. Storage model

Not applicable. Foundation creates no Supabase Storage buckets and uploads nothing. The exercise-image bucket and its public/private posture belong to Library & Gyms Setup.

## 11. Server actions and API surface

No public API, no route handlers for app data. Foundation's only mutations are two server actions.

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; details?: Record<string, string> } };

// signInAction(formData): Promise<ActionResult<never>>  — on success redirects to "/"
//   input: { email: string; password: string }
//   side effects: Supabase signInWithPassword; sets session cookie; redirect
//   errors: unauthorized (wrong credentials), validation_error (empty field), internal_error (network/unexpected)

// signOutAction(): Promise<void>  — requireUser(); supabase.auth.signOut(); redirect("/login")
```

`signInAction` returns a message for the inline `Alert` on failure and never leaks Supabase internals. On success it does not return (it redirects).

**Auth callback:** email/password with `@supabase/ssr` needs no OAuth callback route. No `/auth/callback` route handler is created (it would only be needed for magic-link/OAuth, which are out of scope).

## 12. Validation rules

| Field | Validation | Error |
| ----- | ---------- | ----- |
| email | present, trimmed, non-empty | `validation_error` |
| password | present, non-empty | `validation_error` |

- The server validates even though the client disables submit until both are filled.
- Credential correctness is the Auth server's decision, surfaced as `unauthorized` ("Wrong email or password.").
- Never leak raw Supabase/Postgres errors to the client.

## 13. UI data contracts

Foundation exposes no application DTOs. The only client-facing shape is the login error message string. No credential, connection string, or service-role key is ever sent to the client. The browser may receive `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` only — both are designed to be public and are rendered harmless by deny-all RLS.

## 14. Testing strategy

Runner: **Jest** (unit + integration). Browser: **Playwright**, only for auth-redirect behavior. Integration DB: a **throwaway local Postgres** reached through `TEST_DATABASE_URL`, reset between tests, **never** Supabase and **never** a fallback to `DATABASE_URL`.

Risk-ranked (matches `CLAUDE.md` → Testing). Foundation's live-risk surface is #5 (Auth and RLS) and the schema-level pieces of #1 (logged-history integrity via `onDelete: Restrict` and derived-column absence); #2–#4 have no behavior yet, so their *schema substrate* is asserted but their logic is not.

### 1. Security / privacy (highest live value here)

```text
TEST: rls_enabled_on_every_table
GIVEN: The migrated test database
THEN: Every table in the public schema (including _prisma_migrations) has relrowsecurity = true
QUERY: SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity
EXPECT: zero rows

TEST: no_policies_grant_data_api_access
GIVEN: The migrated test database
THEN: pg_policies has zero rows for the public schema
EXPECT: zero rows

TEST: anon_role_reads_nothing
GIVEN: A role `anon` granted SELECT on all public tables (as Supabase grants), with a row inserted as owner into each table
WHEN: SET ROLE anon; SELECT * FROM <table>
THEN: every table returns zero rows (RLS deny-all), proving the anon-key Data API posture

TEST: hard_delete_of_referenced_exercise_rejected
GIVEN: An Exercise referenced by a LoggedExercise
WHEN: prisma.exercise.delete (or raw DELETE) is attempted
THEN: the database rejects it (onDelete: Restrict); no history row changes

TEST: hard_delete_of_referenced_gym_rejected
GIVEN: A Gym referenced by a LoggedExercise
WHEN: a hard delete is attempted
THEN: rejected by Restrict
```

### 2. Schema invariants

```text
TEST: schema_contains_all_core_entities
THEN: tables mesocycles, sessions, session_exercises, exercises, gyms, gym_exercise_baselines,
      logged_sessions, logged_exercises, logged_sets, goals, cardio_logs all exist

TEST: derived_values_never_stored
QUERY: SELECT column_name FROM information_schema.columns
       WHERE table_name IN ('logged_exercises','logged_sets')
       AND (column_name ILIKE '%tag%' OR column_name ILIKE '%e1rm%' OR column_name ILIKE '%one_rep%')
EXPECT: zero rows

TEST: no_ownership_column
QUERY: columns named user_id / owner_id / tenant_id across public tables
EXPECT: zero rows

TEST: logged_sets_written_only_by_the_module
THEN: no file outside lib/logging/logged-sets.ts calls prisma.loggedSet.(create|update|delete)
VERIFY: static source scan (vacuously true in Foundation; establishes the guard)

TEST: foundation_seeds_no_training_data
THEN: after a clean migrate on the test DB, every application table has zero rows
VERIFY: count(*) == 0 for all eleven application tables
```

### 3. Auth (unit + E2E)

```text
TEST (unit): requireUser_redirects_when_no_session
GIVEN: getAuthUser returns null (mocked Supabase)
WHEN: requireUser() is called
THEN: redirect("/login") is invoked

TEST (unit): signInAction_rejects_empty_fields
WHEN: signInAction called with empty email/password
THEN: ActionResult error.code = validation_error; no Supabase sign-in attempted

TEST (unit): signOutAction_requires_auth
GIVEN: no session
WHEN: signOutAction()
THEN: redirect("/login"); no data touched

TEST (e2e, Playwright): unauthenticated_protected_route_redirects
GIVEN: no auth cookies
WHEN: GET / (and any (app) route)
THEN: redirected to /login

TEST (e2e, Playwright): login_page_renders_and_has_no_registration
THEN: /login shows email, password, Sign in; there is no sign-up/register link

TEST (e2e, Playwright): no_registration_route
WHEN: GET /register and /signup
THEN: 404 (route does not exist)
```

### 4. Build / secret-leak guards

```text
TEST: no_public_db_secret_env
THEN: no env var named NEXT_PUBLIC_DATABASE_URL / NEXT_PUBLIC_DIRECT_URL / NEXT_PUBLIC_*SERVICE_ROLE* is referenced
VERIFY: static scan of source + .env.example

TEST: client_bundle_has_no_db_credentials
GIVEN: a production `next build`
THEN: no file under .next/static contains the DATABASE_URL / DIRECT_URL values or the strings "DATABASE_URL"/"DIRECT_URL"/"service_role"
VERIFY: grep the built client chunks
```

### Test isolation contract
- A shared `assertTestDatabase()` throws if `TEST_DATABASE_URL` is unset or if it points at a `supabase.co`/`supabase.com` host, before any connection is opened. There is **no** path that reads `DATABASE_URL` in tests.
- The integration global setup provisions a throwaway Postgres (embedded-postgres in this environment; an external `TEST_DATABASE_URL` such as a CI service container is honored if provided), runs `prisma migrate deploy` against it, and truncates all tables between tests.

## 15. Acceptance criteria

Traceable to the pitch Definition of Done and the Architecture/Roadmap (Foundation has no PRD feature section — recorded as an intentional exception).

- [ ] The single account can sign in with email/password and land on the authenticated shell.
- [ ] There is no registration/signup/invite route or UI anywhere.
- [ ] Unauthenticated requests to any `(app)` route redirect to `/login` (proxy + DAL).
- [ ] Every server action re-checks the session independently.
- [ ] Sign-out clears the session and returns to `/login`.
- [ ] The Prisma schema contains all eleven core entities with the Architecture Doc's relationships; the logged chain uses `onDelete: Restrict`; `Exercise`/`Gym` have soft-delete fields; no stored tag/e1RM column; no ownership column.
- [ ] One migration creates every table **and** enables RLS (no policies) on every table including `_prisma_migrations`.
- [ ] The anon role / Data API posture returns no application rows.
- [ ] A single shared Prisma client uses pooled `DATABASE_URL`; `DIRECT_URL` is used only for migrations.
- [ ] Tailwind + shadcn/ui theme is in place (Inter, light/dark/system tokens); the shell is phone-first and responsive; no second styling system exists.
- [ ] Jest unit + integration run; integration uses a throwaway Postgres via `TEST_DATABASE_URL` and cannot fall back to `DATABASE_URL`.
- [ ] Playwright proves the auth redirect and the absence of a registration route.
- [ ] `next build` succeeds and no DB secret appears in the client bundle.
- [ ] No demo/training data is seeded.
- [ ] Production migration + provisioning are documented for a human (runbook), not performed by this run.

## 16. Explicit non-goals

- ❌ Sign-up/registration/invite. **Permanent.**
- ❌ Multi-user, roles, tenancy, ownership columns. **Permanent.**
- ❌ Any training feature behavior (library, gyms, plans, logging, progression, goals, cardio). **Deferred** to the owning pitches (tables exist; behavior does not).
- ❌ Supabase Storage / exercise images. **Deferred** to Library & Gyms Setup.
- ❌ Settings/appearance toggle UI, extra nav items, named greeting. **Deferred.**
- ❌ Staging environment, queues, cron, realtime, caching layer, offline. **Permanent** (architecture decisions).
- ❌ Magic-link / OAuth auth flows. **Deferred/avoided** (email/password chosen; see Resolved Decisions).

## 17. Open questions

Carried forward (Foundation does **not** settle these; later pitches own them):

1. Progression thresholds, deload reduction, gym-baseline margin, gym-variable equipment set, working-weight home — Guided Workout Logging / Progressive Overload Engine.
2. Persistence of skipped/shifted days — Guided Workout Logging.
3. e1RM formula (Epley vs Brzycki) — Progressive Overload Engine.
4. Exercise image bucket public/private — Library & Gyms Setup.
5. Goal block-vs-replace on a second active goal — Goals.
6. Zero weight/reps handling — Guided Workout Logging.

Foundation-relevant questions are all resolved (see `## Resolved Decisions`). None remain blocking.

## 18. Future considerations

- The schema is shaped so later pitches add only behavior, not tables: baselines, logging modules, progression reads, goals, and cardio all attach to entities that already exist with correct referential guarantees.
- The `AppNav` is an extensible list, so Today → Plan → History → Goals arrive without restructuring the shell.
- `requireUser()` is the single chokepoint later server actions compose with, keeping the auth re-check uniform.
- Environment separation and the Prisma pooled/direct split are already correct for serverless, so Guided Workout Logging's transactional writes inherit a sound connection model.

## Resolved Decisions

Each decision is binding for this run. Decisions **D1–D9** are the pre-resolved platform decisions supplied in the Foundation pipeline instruction and are recorded here per that instruction's directive to treat them as approved doc authority. Decisions **D10+** were resolved autonomously under the authority order in `CLAUDE.md` (CLAUDE.md > approved planning docs > design doc > this spec), with rationale.

### D1. Authentication is Supabase email/password, no public signup
**Source:** Foundation pipeline instruction §1 (pre-resolved). **Also settles** `architecture.md` Open Question "Login method: email/password or magic link."
**Decision:** Supabase Auth email/password. Exactly one account, created by hand in Supabase; no registration route, invite, onboarding, or second-user concept. Every route except `/login` requires an authenticated session; server actions enforce auth independently.
**Rationale:** Avoids an email-delivery dependency for magic links and preserves the single-user security model.

### D2. Prisma is the only application-data access path
**Source:** Foundation pipeline instruction §2 (pre-resolved); matches `CLAUDE.md` "Data access."
**Decision:** Application tables are read/written only through Prisma in server code. No Supabase client queries, no browser DB calls, no Data API, no REST layer for the app's own UI. Server-first Next.js.
**Rationale:** One auditable door into data; the Supabase client is for Auth only.

### D3. Row-level security is deny-all on every application table
**Source:** Foundation pipeline instruction §3 (pre-resolved); matches `CLAUDE.md` security invariants.
**Decision:** Every table created by Foundation (incl. `_prisma_migrations`) has RLS enabled with **no** policies granting anon/authenticated. A migration that creates a table without enabling RLS fails verification. No permissive policy may be added to make a query work.
**Rationale:** Prisma connects directly and bypasses RLS; the Data API is reachable with the anon key, so deny-all closes it.

### D4. The full approved core schema is created now; no feature behavior is
**Source:** Foundation pipeline instruction §4 (pre-resolved); matches `architecture.md` Data Model and `CLAUDE.md`.
**Decision:** Create all eleven entities with their referential invariants (logged chain `onDelete: Restrict`; planned vs logged distinction; soft-delete on `Exercise`/`Gym`; no stored tag/e1RM; no ownership column). Build no Exercise Library, Gym, mesocycle, logging, progression, goal, or cardio behavior. Seed no demo data.
**Rationale:** Establishes the substrate so later pitches add behavior without schema churn; a table is not a license to build its feature.

### D5. Jest + throwaway local Postgres via `TEST_DATABASE_URL`
**Source:** Foundation pipeline instruction §5 (pre-resolved). **Also settles** `architecture.md` Open Question "Test runner and test database."
**Decision:** Jest for unit + integration; Playwright only for browser-level behavior (auth redirects). Integration tests use a throwaway local Postgres configured through `TEST_DATABASE_URL`, reset between tests. Tests never connect to the Supabase dev/prod database, and no command falls back from a missing `TEST_DATABASE_URL` to `DATABASE_URL`.
**Rationale:** Keeps correctness tests isolated and incapable of corrupting any real database.

### D6. Separated connection roles; one shared Prisma client; secrets server-only
**Source:** Foundation pipeline instruction §6 (pre-resolved); matches `CLAUDE.md`.
**Decision:** Runtime uses pooled `DATABASE_URL`; migrations use direct `DIRECT_URL`. One `PrismaClient` in `src/lib/db.ts`, imported everywhere; no ad hoc clients. `DATABASE_URL`, `DIRECT_URL`, and any privileged Supabase credential are server-only and never `NEXT_PUBLIC_`.
**Rationale:** Correct serverless connection model; prevents credential leakage to the client.

### D7. Separate dev and production environments; no staging
**Source:** Foundation pipeline instruction §7 (pre-resolved); matches `architecture.md`.
**Decision:** Local dev and Vercel previews use the Supabase dev project; production uses a separate Supabase prod project; no staging. This run applies migrations only to dev/test; production migration and env setup are human steps in the runbook. No production credentials are used and no production Supabase change is made this run.
**Rationale:** Matches the approved single-tier model and keeps production untouched by an autonomous run.

### D8. The authenticated shell stays intentionally minimal
**Source:** Foundation pipeline instruction §8 (pre-resolved); matches the pitch.
**Decision:** Build only enough shell/nav to prove: unauthenticated users reach login, the authenticated user enters the app, a stable extensible nav exists, and it works at phone width. No dashboard, library, builder, or design-system project; no fake data or future-feature placeholders.
**Rationale:** Foundation proves platform facts, not product value.

### D9. The styling-doc discrepancy is an upstream documentation issue
**Source:** Foundation pipeline instruction §9 (pre-resolved).
**Decision:** Use Tailwind + shadcn/ui (the `CLAUDE.md` system). Do not introduce a different system. Keep visual work minimal. Record the stale `architecture.md` styling statement in the run report under Required upstream amendments; do not edit `architecture.md` this run.
**Rationale:** `CLAUDE.md` is authoritative for stack; the architecture doc is simply stale and must be amended by a human.

### D10. Next.js 16 "Proxy" is the middleware surface
**Decision:** Use `src/proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`) for the Supabase session refresh and the optimistic unauthenticated redirect.
**Rationale:** The installed framework is Next.js 16.4.0 (per `package.json` and `node_modules/next/dist/docs`); `middleware.ts` is the old name. Using the current convention keeps the build correct. Authority: repo ground truth (installed framework) under `CLAUDE.md`'s "server-first Next.js App Router."

### D11. Cache Components stays enabled; the protected segment opts out of instant-navigation validation
**Decision:** Keep `cacheComponents: true` and `partialPrefetching: true` (already in `next.config.ts`). The protected `(app)` layout reads the auth session at request time and therefore sets `export const instant = false`, letting the segment block on the server for the auth check. Login is a public server-action-driven route.
**Rationale:** The committed scaffold enables Cache Components; disabling it would silently change an approved project convention. Reading `cookies()` for the session is request-time work; per the Next.js 16 docs a session-reading segment must either stream behind `<Suspense>` or opt out of instant-navigation validation and block on the server. For a single-user, low-traffic tool, instant-navigation optimization is explicitly a Foundation rabbit hole ("premature performance work"), so blocking the protected shell on the server is the minimal correct choice. Authority: Next.js 16 docs + pitch rabbit-holes.

### D12. Login/sign-out run as server actions using the `@supabase/ssr` server client
**Decision:** `signInAction` and `signOutAction` are server actions that use a per-request Supabase server client (`@supabase/ssr` `createServerClient` with Next's cookie store). No browser-side Supabase client is required in Foundation. `supabase.auth.getUser()` (which validates against the Auth server) backs `requireUser()`, not a bare cookie read.
**Rationale:** Keeps credentials and the session entirely server-side, re-checks auth inside actions (required by D1), and avoids shipping auth logic to the client. Authority: `CLAUDE.md` data-access + D1.

### D13. Styling toolchain: Tailwind v4 + shadcn/ui + lucide-react
**Decision:** Tailwind CSS v4 via `@tailwindcss/postcss`, shadcn/ui components (new-york style, neutral base) wired to the Overload theme tokens from `overload-ui-design`, `lucide-react` icons, Inter via `next/font`. Light/dark/system handled by CSS variables + a `dark` class strategy; no toggle UI in Foundation (system follows OS).
**Rationale:** Implements D9 with the current Tailwind major that ships in the Next 16 era, matching the `overload-ui-design` palette so later pitches reference tokens, not hex.

### D14. Package manager is npm
**Decision:** npm (a `package-lock.json` is present). All scripts and CI assume npm.
**Rationale:** Lockfile detection per the ticket-worker skill.

### D15. Formatter is Prettier; verification scripts are explicit
**Decision:** Prettier is the formatter with `format` (write) and `format:check` (CI) scripts. Package scripts: `lint`, `typecheck` (`tsc --noEmit`), `format`/`format:check`, `test` (unit), `test:integration`, `test:e2e`, `build`. "Format" in the standing checks means `format:check`.
**Rationale:** The standing-checks list requires a format check and a typecheck; `next lint`/`eslint` already exists. Authority: pipeline standing checks.

### D16. Integration DB provisioning uses embedded-postgres in this environment; external `TEST_DATABASE_URL` is honored
**Decision:** The Jest integration global setup provisions a throwaway Postgres with the `embedded-postgres` dev dependency and points `TEST_DATABASE_URL` at it, then runs `prisma migrate deploy` and truncates between tests. If `TEST_DATABASE_URL` is already set (e.g. a CI Postgres service container), that is used instead. An `assertTestDatabase()` guard throws if `TEST_DATABASE_URL` is unset at the point of DB access or if it targets a Supabase host, and no code path reads `DATABASE_URL` in tests.
**Rationale:** This machine has libpq client tools but no Postgres server and no running Docker; `embedded-postgres` downloads a real Postgres server and runs full DDL + RLS, verified by a spike, so the integration suite (incl. the RLS/anon-denial proofs) genuinely runs here and in CI. Honors D5 exactly. Authority: D5 + environment capability check.

### D17. Vercel build wiring; production migrations are not run in the build
**Decision:** `prisma generate` runs on `postinstall` (and implicitly before build) so the client is available in the Vercel build. The Vercel build runs `next build` only; it does **not** run `prisma migrate deploy`. Production migrations are applied by a human per the runbook after review. No `vercel.json` is required (Next.js is auto-detected); any needed settings are documented in the runbook.
**Rationale:** Running migrations in the build would apply schema changes to production automatically, violating D7 and the stop conditions. Keeping migration a human step preserves the production boundary.

### D18. Public Supabase values use `NEXT_PUBLIC_`; everything else is server-only
**Decision:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are the only `NEXT_PUBLIC_` values and are safe to ship (the anon key is powerless against deny-all RLS). `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL`, and the service-role key (unused in Foundation) are server-only and never prefixed `NEXT_PUBLIC_`.
**Rationale:** Standard Supabase SSR contract; D3 makes the anon key harmless; D6 keeps real secrets off the client. A guard test asserts no DB secret is `NEXT_PUBLIC_` and none appears in the client bundle.

### D19. Honest, extensible navigation with one real destination
**Decision:** The shell renders a nav structure (bottom bar on mobile, rail at `md+`) built as an extensible list, but Foundation ships exactly one real destination — Today (`/`). It does not create empty `Plan`/`History`/`Goals` routes with placeholder empty states, which would imply functionality that does not exist. The home itself is an honest empty state ("Nothing here yet.").
**Rationale:** Satisfies "a stable shell/navigation structure later pitches can extend" (D8) without violating "do not invent future-feature placeholders that imply functionality exists."

### D20. The static-write guard and RLS verification run in CI as part of the suite
**Decision:** The "no `LoggedSet` write outside `lib/logging/logged-sets.ts`" static scan, the "RLS enabled on every table / zero policies / anon reads nothing" checks, the derived-column-absent and no-ownership-column checks, and the "no training data seeded" check are all part of the Jest suite (unit static scan + integration SQL assertions) so they gate every future change, not just this run.
**Rationale:** The roadmap and testing docs want these invariants enforced continuously from day one.
