# Runbook — Guided Workout Logging (Pitch 4)

Operational guide for migrating, verifying, and rolling out Guided Workout
Logging. **This feature introduces the permanent logged-history write path and a
new table; it is the most data-sensitive pitch so far.** Treat every production
step as irreversible with respect to the lifter's training history.

> This runbook contains **no secrets**. It never instructs an agent to run a
> production migration or write production data autonomously — those are human
> actions. `DATABASE_URL`, `DIRECT_URL`, and the Supabase service-role key are
> server-only and never appear here or in any client bundle.

## 0. What changed (migration `4_guided_workout_logging`)

Additive only — no drop, rename, truncate, delete, insert, or cascade:

- New enums `LoggedSessionStatus`, `MissedDayOutcome`.
- `logged_sessions`: `scheduled_for DATE NOT NULL`, `status` (default
  `in_progress`), `UNIQUE (session_id, scheduled_for)`.
- `logged_exercises`: `planned_exercise_id` (FK → `exercises`, RESTRICT),
  `session_exercise_id` (FK → `session_exercises`, SET NULL), `planned_sets`,
  `target_rep_min`, `target_rep_max`.
- New table `missed_day_resolutions` with **deny-all RLS** (no policies).

The logged tables are empty before this pitch (logging begins here), so the new
`NOT NULL` columns need no backfill.

## 1. Local development (Supabase CLI stack)

```bash
# 1. Start the local Supabase stack (Docker).
npx supabase start

# 2. Apply migrations to the LOCAL database (uses DIRECT_URL from .env).
npx prisma migrate deploy

# 3. Regenerate the client (also runs on install).
npx prisma generate

# 4. Run the app.
npm run dev
```

The integration test harness provisions its own throwaway Postgres and applies
migrations automatically; you do not need a database running to run tests.

## 2. Pre-production safety (human, before touching `overload-prod`)

1. **Back up first.** Take a fresh Supabase backup / `pg_dump` of
   `overload-prod` and confirm it restores to a scratch database. Logged history
   cannot be reconstructed; the backup is the only safety net.
2. **Review the migration** (`prisma/migrations/4_guided_workout_logging/migration.sql`):
   confirm it is additive only (the `migration safety` invariant test asserts no
   DROP/RENAME/TRUNCATE/DELETE/INSERT/CASCADE and RLS on the new table).
3. **Confirm RLS** will be enabled on `missed_day_resolutions` (the migration's
   final statement). A new table without RLS is publicly readable via the anon
   key — a blocking issue.

## 3. Preview deployment (Vercel, against the Supabase dev project)

- Push the branch; Vercel builds a preview against the **dev** Supabase project
  (never production).
- Apply the migration to the dev database (`prisma migrate deploy` with the dev
  `DIRECT_URL`), then verify the scenarios in §5 with representative data.

## 4. Production migration (human only, never autonomous)

```bash
# Run by a human, with the production DIRECT_URL exported in the shell
# (never committed, never echoed). Confirm the backup from §2 exists first.
DIRECT_URL="<prod direct url>" npx prisma migrate deploy
```

Then deploy the app via the normal Vercel production pipeline. Do **not** run
`prisma migrate reset`, `db push`, or any destructive command against prod.

## 5. Representative dev-data verification

Create an active mesocycle with a scheduled session and at least one `machine`
exercise and one `barbell` exercise, plus two gyms (Gym A, Gym B).

### First-baseline establishment
1. Start a workout at **Gym A**; log all planned sets of the machine exercise
   (e.g. `100, 100, 100`). → A `gym_exercise_baselines` row for `(Gym A, exercise)`
   is created at `100`. It is an **establishment**, not a correction.
2. Confirm the `barbell` exercise produced **no** baseline row.

### Gym A / Gym B isolation
3. Start a workout at **Gym B** for the same machine exercise; log `150, 150, 150`.
   → `(Gym B, exercise)` = `150`; `(Gym A, exercise)` is unchanged at `100`.

### 15% correction threshold
4. Back at Gym A, a later session with median `114` → baseline stays `100`
   (14% < 15%). A session with median `115` → baseline becomes `115` (at
   threshold). Median `120` → `120` (above threshold).

### Failed-write atomicity
5. Simulate a write failure mid-completion (e.g. kill the request): confirm the
   set and the baseline are **both** absent (no set without its baseline, no
   baseline without its set). A completed workout + baseline must agree.

### Partial workout / resume
6. Log a couple of sets, close the app, reopen → the dashboard shows **Resume**
   and returns the **same** `LoggedSession` (no duplicate). Saved sets persist.

### Missed day
7. Let a scheduled day pass unlogged → the dashboard prompts with exactly three
   choices. **Skip** → never re-prompts. **Shift** → remaining current-week days
   move forward one day; next week is unchanged; a day pushed past the week end
   is dropped. **Log it late** → starts the workout for the original missed date
   (the runner header shows the historical date).

### Historical correction
8. Open a past workout from History → edit a set's weight/reps → the stored value
   changes; the gym baseline is **unchanged** (no replay). No delete control
   exists.

### Archived exercise / gym in history
9. Archive the exercise and gym used above → the past workout still renders them
   by **name** (never "Unknown"); they disappear only from new selection lists.

## 6. Post-deploy production smoke check (human, read-mostly)

1. Log in; the dashboard loads today's state (pending / rest / complete).
2. Start today's workout at a real gym; log one set; confirm it persists on reload.
3. Open History; open the just-logged workout; confirm the set is present.
4. (Optional, reversible) Edit that set's reps and confirm the value updates.
5. Confirm no progression tag, e1RM, chart, or goal content appears anywhere
   (those are later pitches).

Do **not** create throwaway production workouts you don't intend to keep — prod
is the only copy of real history. Prefer verifying on the preview/dev project.

## 7. Rollback / recovery (without destroying logged history)

- **App-level rollback:** redeploy the previous Vercel build. The additive
  migration leaves older code working (new columns are ignored by it), so an app
  rollback alone is usually sufficient and safe.
- **Do NOT** drop the new columns/table to "undo" the migration if any logged
  history has been written — that would destroy data. The migration is additive
  and safe to leave in place.
- **Data recovery:** if logged history is corrupted, restore from the §2 backup
  to a scratch database, verify, and have a human reconcile — never overwrite
  prod blindly.

## 8. Invariants to re-check after any change here

- `LoggedSet` is written only by `src/lib/logging/logged-sets.ts` (static guard
  test).
- Baseline establish/correct happens in the same transaction as the completing
  set write, scoped to one `(gym, exercise)`, and never rewrites a `LoggedSet`.
- Every table (including `missed_day_resolutions`) has deny-all RLS.
- No progression/e1RM column exists on any logged table.
