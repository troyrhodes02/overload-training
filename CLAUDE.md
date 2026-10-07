# Overload — CLAUDE.md

Overload is a single-user strength training tracker whose job is to tell one lifter, per lift and per session, whether to progress, hold, or deload, based on logged performance against a plan he built himself. There is exactly one account, created by hand; there is no signup, no sharing, and no second user.

This file is persistent context for Claude Code. It encodes the non-obvious rules and invariants specific to this project. For product intent see `docs/planning/product-brief.md`; for features and acceptance criteria see `docs/planning/prd.md`; for technical decisions and rationale see `docs/planning/architecture.md`; for build sequencing see `docs/planning/pitch-roadmap.md`. This file is the "how we write code here" layer on top of those.

## Stack (ground truth)

- **Next.js (App Router), React, TypeScript** — the application framework. Server-first: pages are server components that read data directly. It is **not** a client-side SPA and has no REST layer for its own UI to call.
- **Supabase** — managed Postgres, Auth, and Storage. The Supabase client handles the auth session (via its Next.js cookie integration) and Storage for exercise images. It is **not** the query layer for application data; that is Prisma. Supabase's auto-generated Data API is closed (see security invariants).
- **Prisma** — schema authority, migrations, and the only path to application data. If a table exists, its shape is defined in `schema.prisma` and nowhere else.
- **Vercel** — hosting and deployment. Serverless: no process holds state between requests.
- **Recharts** — progression charts (e1RM trend lines, goal progress). Nothing else draws charts.
- **free-exercise-db** — public-domain exercise dataset, imported **once** by a Prisma seed script into the `Exercise` table and Supabase Storage. It is not queried at runtime. If it disappears tomorrow, nothing breaks.

- **Tailwind CSS with shadcn/ui** — the single component and styling system, with `lucide-react` icons. It owns layout, theming, and every UI primitive. It is **not** a license to mix in a second library: no Material UI, styled-components, CSS modules, or other component kit. Design rules for how it looks live in the `overload-ui-design` skill, not here.

Infrastructure Overload deliberately does **not** have, as decisions rather than omissions: no scheduler or cron job, no queue, no cache layer, no realtime subscriptions, no offline mode or sync layer (the lifter logs later if the gym has no signal), no staging environment, no maps or geocoding service (gym location is free text), and no health-data integration (HealthKit is unreachable from a website). An agent that does not know these were rejected will add them.

Do not add libraries or infrastructure not already decided in the Architecture Doc without flagging it first.

## The core invariant: logged sets are the only source of truth

**This is the single most important rule in the codebase.** Everything the product tells the lifter (progress, hold, deload, e1RM trend, goal percentage) is derived from `LoggedSet` rows. If a logged set is lost, silently altered, or detached from the exercise and gym it was performed at, every conclusion built on it is wrong, and unlike a visible error, nobody can tell. A training history cannot be reconstructed after the fact. This outranks the gym-baseline invariant below; the baseline can be re-tuned from history, but history cannot be re-derived from the baseline.

Enforcement is layered, because neither layer is sufficient alone.

**Layer 1 — application (all feature code).** `LoggedSet` rows are written and edited only through `lib/logging/logged-sets.ts`. Nothing outside that module calls `prisma.loggedSet.create`, `.update`, or `.delete`. `Exercise` and `Gym` are never hard-deleted; deletion sets `deletedAt` and removes the row from selection lists only. Queries that feed pickers filter `deletedAt: null`. Queries that render history must not filter it, or archived exercises vanish from the past.

**Layer 2 — database.** Foreign keys from `LoggedExercise` to `Exercise` and `Gym` use `onDelete: Restrict`, so even a buggy hard delete fails loudly rather than cascading history away. Row-level security is enabled on every table (see security invariants), so no path other than Prisma can write.

### Derived values are computed on read, never stored

The progress/hold/deload tag and the e1RM trend are pure functions of the logged sets, the planned rep range, and the mesocycle week. There is no `tag` column, no `e1rm` column, no cached "needs deload" flag, and no job that maintains them. Editing a past set therefore corrects every downstream tag and trend with no recompute path to forget. Do not add a stored copy "for performance"; this is a one-user app and the data is tiny. A stored copy is how history and conclusions drift apart.

`GymExerciseBaseline` is the one stored derived-ish value, because it holds per-gym state that logged sets alone cannot reconstruct. It is written only by the baseline-correction path described next.

### Gym baselines are isolated per gym and written atomically

Serverless functions can be retried, run concurrently, and cold-start on any request, and Postgres through Supabase's pooler cannot be assumed to give a function one long-lived connection. Therefore:

- Use the pooled connection string (`DATABASE_URL`) at runtime and the direct one (`DIRECT_URL`) only for migrations. Instantiate one `PrismaClient` per process in `lib/db.ts` and import it; never construct another.
- A logged set and any baseline correction it triggers happen in **one transaction**. A set that exists without its baseline update, or a baseline updated for a set that failed to save, is a correctness bug.
- A correction touches only the `(gymId, exerciseId)` row for the gym the set was logged at. It must never alter another gym's baseline, and it must never rewrite an existing `LoggedSet`.
- The first log of an exercise at a gym has no baseline to deviate from. It establishes the baseline and never counts as a correction.
- Free-weight and plate-loaded exercises have no `GymExerciseBaseline` row. Whether an exercise is gym-variable is decided in exactly one function, `isGymVariable(exercise)`.

If you are ever unsure whether a code path keeps a set and its baseline update in the same transaction, treat it as a blocking issue, not a detail.

### Multi-step writes must be atomic

Logging a set, applying a baseline correction, and marking a `LoggedSession` complete are dependent writes. They succeed or fail together. Use `prisma.$transaction`, and make every write function accept an optional transaction client so callers can compose.

```ts
// lib/logging/logged-sets.ts
import { Prisma, LoggedSet } from "@prisma/client";
import { prisma } from "@/lib/db";
import { applyBaselineCorrection } from "@/lib/gyms/baselines";
import { isGymVariable } from "@/lib/exercises/gym-variable";

export async function logSet(
  input: { loggedExerciseId: string; setNumber: number; weight: number; reps: number },
  tx?: Prisma.TransactionClient,
): Promise<LoggedSet> {
  if (!tx) return prisma.$transaction((t) => logSet(input, t)); // wrap if none passed
  return logSetInTx(input, tx); // compose if one was
}

async function logSetInTx(
  input: { loggedExerciseId: string; setNumber: number; weight: number; reps: number },
  tx: Prisma.TransactionClient,
): Promise<LoggedSet> {
  const loggedExercise = await tx.loggedExercise.findUniqueOrThrow({
    where: { id: input.loggedExerciseId },
    include: { exercise: true },
  });

  // Invariant: the set is stored exactly as entered. No tag, no e1RM, no derived value is written here.
  const set = await tx.loggedSet.create({
    data: {
      loggedExerciseId: input.loggedExerciseId,
      setNumber: input.setNumber,
      weight: input.weight,
      reps: input.reps,
    },
  });

  // Invariant: baseline correction runs in the same transaction, scoped to this gym and exercise only.
  if (loggedExercise.gymId && isGymVariable(loggedExercise.exercise)) {
    await applyBaselineCorrection(
      { gymId: loggedExercise.gymId, exerciseId: loggedExercise.exerciseId, loggedWeight: input.weight },
      tx,
    );
  }

  return set;
}
```

## Data access

**Application data is read and written through Prisma in server-side code. Never fetch application data with client-side `fetch()` or query the database from the browser.**

- Server components read via the Prisma client in `lib/db.ts`, with the authenticated user resolved from the Supabase session cookie. There is one user, but the auth check still runs on every request.
- Mutations run through server actions that call the write modules (`lib/logging/logged-sets.ts` and its siblings), not raw client fetches and not ad hoc `prisma` calls inside components.
- Client components are interactive islands only: the exercise logging card (set entry), the swap picker, the missed-day prompt, the exercise library search and muscle-group filter, and the Recharts charts. They call server actions. They never touch the data store or hold credentials.
- The Supabase client is used for the auth session and Storage only. It must not be used to query or mutate application tables.

## Security invariants (non-negotiable)

### Access and registration model

Identity is a single Supabase Auth account. Public signups are **disabled** in Supabase; the account is created by hand. There is no registration route, no invite flow, and no second-user concept. Every route except the login screen requires an authenticated session, enforced in middleware and re-checked in server actions. An agent that does not know signup was deliberately excluded will build one; do not. The login method (email/password or magic link) is an open decision in `architecture.md`; do not pick one silently.

### Row-level security: deny-all, Prisma is the only door

Prisma connects directly to Postgres and bypasses row-level security. Supabase also exposes every table through its public Data API, reachable with the anon key that ships to the browser. Therefore **RLS is enabled with no policies on every table**, so the Data API returns nothing. Every migration that creates a table must also enable RLS on it. A new table without RLS is publicly readable through the anon key; treat that as a blocking issue.

### Storage

Exercise images are public-domain assets from free-exercise-db. They are the only content in Storage. Custom exercises have no image. Do not add user-uploaded files without a pitch.

### Secrets

`DATABASE_URL`, `DIRECT_URL`, and the Supabase service-role key are server-only and never appear in client bundles or in `NEXT_PUBLIC_` variables. Local development runs against the Supabase CLI local stack (`npx supabase start`, Docker); the only cloud project is `overload-prod` (production). There is no dev cloud project and no staging tier. Vercel deploys production only — there are no DB-backed preview deployments, so nothing but production ever points at `overload-prod`. (The Architecture Doc's "separate Supabase development project" wording predates this and is a pending upstream amendment.)

## Business logic

### Progress, hold, and deload are computed, and the rep range comes from the plan

The rule is the same regardless of training phase: hit the top of the **planned rep range** for the required number of consecutive sessions and the lift is tagged progress; fall short consistently and it is tagged deload; anything else is hold, which renders with no tag at all. There is no "declared goal" or "training phase" object, and none should be added. A 3×5 bench and a 3×10 bench differ only in their planned rep range.

- The thresholds (consecutive sessions, misses before deload, weight increment) are named constants in `lib/progression/config.ts`, not magic numbers. Their values are open in `architecture.md` and are set in the controlling pitch.
- An exercise with insufficient history (first time performed) is never tagged progress or deload.
- The e1RM trend is the secondary stall-detector: if the rule says progress but e1RM has been flat across the recent window, flag it instead of blindly bumping weight.
- Goal progress and the e1RM trend use the **same** `estimateOneRepMax` function. A goal like 225×12 and a current best of 205×10 are both converted through it. Never write a second formula.

### Two deload systems that must stay separate

The **scheduled deload** is planned recovery: the mesocycle's designated week reduces load across the whole split, regardless of how any lift is doing. The **reactive deload** is a per-exercise call from the progression rule. They are independent. A valid state proving it: a lift can be tagged deload by the rule during week 2, while week 5 is a scheduled deload for everything, including lifts that never stalled.

During a scheduled deload week the reactive check is **suppressed entirely**. It resumes the moment the week ends. Editing a past log never retroactively applies the reactive check to a week that was a scheduled deload.

### Planned versus logged, and the word "Session"

`Session` always means a planned workout template inside a `Mesocycle` (for example "Push Day 1"). `LoggedSession` is a record of a day actually trained. Never call the auth session a `Session`; say "auth session". Never write to a `Session` or `SessionExercise` while logging; swapping an exercise mid-workout affects that `LoggedExercise` only, unless the lifter explicitly saves the swap back to the template. Swap candidates are restricted to the same muscle group as the planned exercise.

### Missed days: three outcomes, shift is scoped to one week

An uncompleted prior day prompts three choices: log it late, shift, or skip. Shift moves the remaining days of the **current week** forward by one; the following week returns to the split's normal alignment. A shift must never compound across weeks. Where skipped and shifted days are persisted is open in `architecture.md`; whatever the controlling pitch chooses, a skipped day must not re-prompt on every app open.

### Goals

One active goal per exercise, as a weight and rep target, undated. Reaching 100% archives the goal and offers a new one. Goals are never deleted by progress.

### Cardio is a record, nothing more

A `CardioLog` stores type and duration, assigned to a split day. No tag, no trend, no progression logic ever attaches to cardio.

## Product boundaries (do not build these)

Permanent non-goals from the Brief. These are "never" for this product:

- **No program generation.** The lifter designs every split and mesocycle. The app tracks and adjusts load inside the plan; it never authors one.
- **No social features of any kind.** No sharing, leaderboards, or visibility to anyone else. This is a single-user instrument.
- **No progression analysis of cardio.**
- **No nutrition or body-composition features in this build.** Those are a deliberately separate, later build. Don't model them here, and don't preclude connecting to them later.

Deferred (don't build unless a pitch calls for it, but don't preclude): dated goals and any feasibility feedback; RPE/RIR logging; native or wrapped mobile app; HealthKit and heart rate, distance, pace, or calories on cardio; location-pinned gyms and arrival notifications.

## Testing

Focus tests where correctness matters most. Highest-value targets, in order:

1. **Logged history integrity (adversarial, and first).** Prove that soft-deleting an `Exercise` or `Gym` leaves every historical `LoggedExercise` readable, that hard deletes of referenced rows are rejected by `onDelete: Restrict`, and that no code path outside `lib/logging/logged-sets.ts` writes a `LoggedSet`. This gates all dependent work, because everything else is derived from it.
2. **Gym baseline isolation and atomicity.** A correction at Gym A never changes Gym B's baseline; the first log at a gym establishes rather than corrects; a failed set write leaves the baseline untouched. This is the Architecture Doc's biggest technical risk, so test it hard and expect the margin constant to be tuned later.
3. **The progression engine.** Threshold boundaries, insufficient-history behavior, scheduled-deload suppression, the e1RM stall override, and that editing a past set changes the computed tag. Pure functions; test them as such.
4. **Missed-day handling.** Each of the three outcomes, shift scoped to one week, and no compounding across weeks or across consecutive misses.
5. **Auth and RLS.** Unauthenticated requests are redirected, and the anon-key Data API returns nothing for every table.

Test the risky logic hard; lean tests or manual verification are fine for low-risk UI and plain CRUD (the exercise library, gym list, cardio log). The exception that is never lean is anything that writes or deletes logged history.

## Workflow

1. Work against the current pitch. Keep changes scoped to that pitch's in-scope list; don't wander into a later pitch. Expanded pitches live at `pitches/NN-pitch-name.md`, numbered and named to match the Pitch Roadmap (for example `pitches/04-guided-workout-logging.md`).
2. Commit with descriptive messages referencing the Linear issue ID.
3. Push and open a PR via `gh pr create`; use the Vercel preview deployment to verify before merging. Previews run against the Supabase dev project.

Anything touching `LoggedSet` writes, deletion behavior, or baseline correction gets verified on a preview deployment with real-shaped data before it reaches production, since there is no staging tier and a bad deploy there corrupts the only copy of the lifter's history.

## Consistency with the planning docs

- Feature names must match `docs/planning/prd.md` and `docs/planning/pitch-roadmap.md` exactly.
- Data objects must match `docs/planning/architecture.md`'s data model: `Mesocycle`, `Session`, `SessionExercise`, `Exercise`, `Gym`, `GymExerciseBaseline`, `LoggedSession`, `LoggedExercise`, `LoggedSet`, `Goal`, `CardioLog`.
- If a task seems to require contradicting an approved doc, or weakening the logged-history invariant, stop and flag it rather than silently diverging.
