# Pitch 6 — Goals — Runbook

Operational notes for shipping and verifying Goals. No secrets appear here;
connection strings come from your local `.env` (local stack) or Vercel
(production).

## Schema / migrations

One additive migration: `prisma/migrations/5_goals/migration.sql`.

- New enum `GoalArchiveReason (completed, manual)`.
- New nullable columns on the existing `goals` table: `gym_id` (FK → `gyms`,
  `ON DELETE RESTRICT`), `archive_reason`, `archived_at`,
  `completion_acknowledged_at`.
- Indexes `goals_gym_id_idx`, `goals_status_idx`, and the partial unique index
  `goals_one_active_per_exercise` (`exercise_id WHERE status = 'active'`).
- CHECKs `goals_target_positive`, `goals_lifecycle_consistent`,
  `goals_ack_completed_only`.
- **No table is created** (RLS deny-all on `goals` has existed since `0_init`),
  nothing is dropped/renamed, no row is inserted/updated/deleted, nothing
  cascades. The CHECKs hold for any pre-existing row (no application wrote
  `goals` before this pitch; default `active` + nulls satisfy them).

### Local (Supabase CLI stack)

```bash
npx supabase start            # if not running
npx prisma migrate deploy     # reads DIRECT_URL from .env (127.0.0.1:54322)
npx prisma migrate status     # expect: Database schema is up to date
```

### Production (human step — `overload-prod`)

Run from a trusted machine with the production **direct** connection string in
`DIRECT_URL` for this one command only (never commit it, never put it in a
`NEXT_PUBLIC_` variable):

```bash
npx prisma migrate status     # expect: 5_goals pending
npx prisma migrate deploy     # applies 5_goals only
npx prisma migrate status     # expect: up to date
```

Then confirm in the Supabase SQL editor (read-only checks):

```sql
select relrowsecurity from pg_class where relname = 'goals';            -- true
select indexname from pg_indexes where tablename = 'goals';             -- includes goals_one_active_per_exercise
select conname from pg_constraint where conrelid = 'goals'::regclass;   -- includes the 3 CHECKs + goals_gym_id_fkey
```

Deploy order: apply the migration **before** (or together with) the Vercel
production deploy of this commit; the new code selects the new columns.

Never run `prisma migrate reset`, `db push --force-reset`, or any destructive
command against production.

## Environment / dependencies

No new environment variables, secrets, packages, Storage changes, cron jobs,
queues, or notification services.

## Verification commands

```bash
npm run lint
npm run typecheck
npm run format:check
npm test                    # unit: goal progress/validation/actions/dashboard + invariant guards
npm run test:integration    # embedded Postgres: tests/integration/goals.int.test.ts + all prior suites
npm run build
npm run test:e2e            # includes e2e/goals.spec.ts (auth boundary)
npm run verify:client-bundle
```

## Smoke tests (local stack or production UI — never by editing production LoggedSets)

Use dev data, or real training you actually logged. **Do not insert, edit, or
delete production `LoggedSet` rows to manufacture goal states.** Every scenario
below is also proven automatically in `tests/integration/goals.int.test.ts`.

1. **Create a free-weight goal** — Goals → New goal → Barbell Bench Press →
   `315` × `1` → Set goal. Lands on the detail with a "Goal set" toast. No gym
   field was shown.
2. **Existing history counts** — the new goal immediately shows a percentage
   (e.g. best 235 × 5 → **87%**) and "Best 274 lb e1RM · from 235 × 5 · date".
3. **No-history state** — a goal for a lift you've never completed shows
   **"No performance recorded yet"**, no bar, never `0%`.
4. **Gym-variable goal** — pick a machine/cable exercise → the form requires a
   Gym (active gyms only) → the detail reads "Only sessions at {Gym} count".
   History at another gym does not move it.
5. **Duplicate rejection** — open New goal for an exercise that already has an
   active goal (any gym): the form is replaced by "…already has an active
   goal… Archive it to set a different one." with **View goal**. The picker
   marks that row "Active goal".
6. **Validation** — `0`, negative, or blank weight → "Enter a weight above 0.";
   `0`, blank, or `2.5` reps → "Enter whole reps, 1 or more." Values stay typed.
7. **Already achieved** — set a target your history already meets: the detail
   leads with **Goal reached · Already reached — your best session meets this
   target.** The goal is in Goal history, not in the active list.
8. **Automatic completion** — finish a workout whose session reaches an active
   goal's target: the day-complete summary shows that goal as **Goal reached**,
   the dashboard and Goals show the one-time card, the goal moves to history.
9. **Acknowledge once** — tap **Done** (or **Set a new goal**): the card never
   returns. **Set a new goal** opens the same lift with blank numbers.
10. **Manual archive** — goal detail → **Archive goal** → confirm: toast "Goal
    archived", goal in history as "Archived {date}", exercise free for a new goal.
11. **Goal history** — Goals → Goal history: reached and archived rows, newest
    first, archived exercises/gyms marked "(archived)".
12. **Archived exercise / gym** — archive an exercise (or gym) that has an active
    goal: the goal stays listed with an "Exercise archived" / "Gym archived"
    marker and can be archived by hand; New goal no longer offers it.
13. **Historical correction (active)** — History → a past day → edit the set
    behind a goal's best: the goal's percentage changes on the next view.
14. **Historical correction (completed)** — editing a set below a reached
    goal's target leaves that goal "Reached" in history (never reopens).
15. **Dashboard priority** — while a workout is pending/in progress or a missed
    day is unresolved, the dashboard shows no goal content; on a completed day,
    rest day, or with no plan, it shows up to 3 active goals + "All goals".

## Rollback / recovery

- **Code rollback:** promote the previous Vercel deployment. Old code ignores
  the new nullable columns; the migration can stay applied.
- **Schema rollback is not required and not recommended.** If ever needed it is
  a reviewed, hand-written migration (drop index/constraints/columns/enum) —
  never `migrate reset` — and only after confirming no goal data must be kept.
- **Missed completion:** completion is reconciled after logging/edit actions and
  again whenever a goal page or the non-pending dashboard renders. If a
  post-commit reconciliation ever fails (logged as "Goal completion
  reconciliation failed"), the next goal-page view completes it. No manual
  repair or job is needed.
- **Goals never touch logged history or gym baselines**, so no Goals failure
  can require a `LoggedSet` or baseline repair.
