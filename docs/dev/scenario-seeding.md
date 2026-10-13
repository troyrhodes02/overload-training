# Dev scenario seeding

Developer tooling, not a product feature. One command replaces your **local**
database's application data with one of four realistic timelines, so you can
log into the normal app as your usual dev account and explore it in a given
state. The data is generated relative to an anchor date and is checked by the
application's own read layer before the command reports success.

```bash
npm run seed:scenario -- --list
npm run seed:scenario -- established
npm run seed:scenario -- plateau --date 2026-10-12
npm run seed:scenario -- fresh --no-verify
```

| Scenario | Purpose |
| -------- | ------- |
| `fresh` | New, configured lifter with insufficient history: one workout so far, so no lift has a call yet |
| `established` | About 12 weeks of normal, realistic use across three blocks. This is the default demo |
| `plateau` | Engineered Progress, Hold, stalled, and Deload states side by side |
| `multi-gym` | Gym-variable machine isolation across two gyms |

## Safety

- **Local only, with no override.** The command refuses to run unless all of
  these hold:
  - `DATABASE_URL` points at a loopback host (`127.0.0.1`, `localhost`,
    `::1`);
  - `DIRECT_URL` and `NEXT_PUBLIC_SUPABASE_URL`, when set, point at a
    loopback host too;
  - `NODE_ENV` isn't `production`;
  - no `VERCEL` or `VERCEL_ENV` is set.

  This means it only targets the Supabase CLI stack (`npx supabase start`) or
  a throwaway local Postgres, never `overload-prod`. There is no flag that
  turns this off. The guard is `scripts/scenarios/guard.ts`, and it runs
  before any database module loads.
- **No production credentials** are read or used. Only `.env` is loaded
  (via `dotenv`). No service-role key is used.
- **No app surface.** This is CLI only. No route, page, server action, or
  browser code can reach it, and no `src/` file imports `scripts/scenarios`
  (a static test enforces this). RLS is untouched.
- **A loopback tunnel is still a remote database.** If you ever port-forward
  a remote database to `localhost`, don't run this command against it.

## One lifter, alternate timelines

Overload is single-user, and application rows have no owner column. A
scenario is an alternate history for the same lifter:

- It never creates, edits, or deletes a Supabase auth user. The report
  confirms the auth-account count is unchanged.
- Log in exactly as before.

## What reset removes and what it keeps

Each run replaces the timeline in one transaction. If building fails, your
previous data stays.

- **Removed (children first, following the Restrict foreign keys):** cardio
  logs, planned cardio, goals, logged sets, logged exercises, logged sessions,
  missed-day resolutions, gym baselines, planned exercises, sessions,
  mesocycles, gyms.
- **Kept:** the entire `exercises` table, meaning the imported library and
  your custom exercises along with their favorite and archived flags. Also
  kept: Supabase auth and Storage.
- **Never used:** schema operations, `prisma migrate reset`, `db push`, or
  `TRUNCATE`. This is fixture replacement, not database recreation.

Scenarios look up library exercises by their stable free-exercise-db id. If
one is missing, the command stops and tells you to run `npm run db:seed`. If
one is archived, it tells you to un-archive it. It never creates a duplicate.

## Dates

- The anchor defaults to today. "Today" is the app's UTC calendar date, the
  same convention every page uses.
- Every date in a scenario is relative to the anchor. The weekly split is
  laid out from the anchor so that "today" is always a meaningful day:
  - `established`: Pull Day, still to do;
  - `plateau` and `multi-gym`: the next lifting day;
  - `fresh`: a cardio-only day.
- `--date YYYY-MM-DD` reproduces a timeline exactly. The same scenario and
  anchor give the same rows, with stable IDs, so `/plan/<id>` links survive a
  reseed. The app still renders against the real today, so pass a past anchor
  only for reproducibility.

## Facts, never conclusions

Scenarios seed only facts:

- plans
- gyms
- dated workouts with the sets actually lifted
- missed-day resolutions
- goals as the lifter set them
- cardio

Nothing seeds a progression tag, e1RM, trend, stall flag, suggested weight,
or goal percentage. No column exists for any of them, and the application
derives each one on read.

While the facts are written, the application's own code produces the
derived state:

- **Gym baselines:** `applyBaselineOnCompletion`, called in chronological
  order exactly as the logging transaction calls it.
- **Cardio placement and snapshot:** the real effective schedule.
- **Goal completion:** `reconcileGoalCompletions`.

Historical rows are inserted directly, not through `logSet`, because history
needs historical timestamps. The "latest working weight" read orders sets by
`createdAt`. This insert path is dev-only and lives outside `src/`. The
application's single LoggedSet write path, and its static guard, are
unchanged.

After seeding, verification calls the same reads the pages use, and the
command exits non-zero naming any intended state that didn't derive:

- `getExerciseProgression`
- `listActiveGoals` and `listGoalHistory`
- the missed-day scan

| Scenario | Verified |
| -------- | -------- |
| `fresh` | Active block. Every logged lift is `insufficient` with no tag and has one e1RM point. One goal is measured below 100%, and one is unmeasured |
| `established` | At least 10 weeks of history. Bench and Barbell Row are `progress`, and the other 11 lifts are `hold`, each with 8 or more trend points. Four active goals sit between 60% and 99%, and the Overhead Press goal was reached |
| `plateau` | Bench is `progress`, Row is `hold`, Overhead Press is `stalled`, and Squat is `deload`. Lat Pulldown is `hold`, and its below-range scheduled-deload session is charted and marked |
| `multi-gym` | Chest press: `progress` at North, `hold` at South. Pulldown: `hold` at North, `progress` at South. Each gym charts only its own sessions, and each baseline sits in its own gym's range. Bench is one global history across both gyms. The South chest-press goal reads from South only |

Every scenario also checks:

- exactly one active block;
- no missed-day prompt pending on the anchor;
- auth accounts unchanged.

## Adding a scenario

1. Create `scripts/scenarios/scenarios/<name>.ts` exporting a `Scenario`:
   - `key`, `description`, `shows`;
   - `build(anchorIso)`, which returns `ScenarioFacts` (see `spec.ts`). Use
     `occurrences()` for plan dates and `doubleProgression()` / `sets()` for
     numbers;
   - `verify(ctx)`, which asserts the intended states through
     `ctx.progression`, `ctx.activeGoals`, `ctx.baseline`, and so on.
2. Add it to `scripts/scenarios/registry.ts`.
3. If it needs another library exercise, add its source id to `LIBRARY` in
   `spec.ts`, and to the catalog fixture in
   `tests/integration/scenario-seeding.int.test.ts`.
4. Run `npm test` and `npm run test:integration`. The suites seed every
   registered scenario into the throwaway test database.

These scenarios are for manual exploration, demos, and debugging. Automated
tests keep their own small, isolated fixtures.
