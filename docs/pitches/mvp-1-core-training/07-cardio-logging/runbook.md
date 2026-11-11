# Pitch 7 — Cardio Logging — Runbook

Operational notes for shipping and verifying Cardio Logging. No secrets appear
here; connection strings come from your local `.env` (local stack) or Vercel
(production).

## Schema / migrations

One additive migration: `prisma/migrations/6_cardio_logging/migration.sql`.

- **New table `planned_cardio`** (`id`, `mesocycle_id` FK → `mesocycles`
  `ON DELETE RESTRICT`, `day_of_week`, `type`, `duration_min`, timestamps),
  unique `(mesocycle_id, day_of_week)` (zero or one planned cardio per day),
  CHECKs `planned_cardio_day_valid` (1–7), `planned_cardio_duration_valid`
  (1–600), `planned_cardio_type_valid` (trimmed, 1–40 chars), and
  **`ENABLE ROW LEVEL SECURITY` with no policy** (deny-all).
- **`cardio_logs` gains** `mesocycle_id` (FK → `mesocycles`, Restrict),
  `scheduled_for` DATE, `planned_type`, `planned_duration_min` — all NOT NULL —
  plus unique `(mesocycle_id, scheduled_for)` (one record per planned
  occurrence) and CHECKs `cardio_logs_duration_valid`, `cardio_logs_type_valid`.
  `cardio_logs` already had deny-all RLS since `0_init`.
- Nothing is dropped/renamed, no row is inserted/updated/deleted, nothing
  cascades, no policy is added. `cardio_logs` has never been written by any
  application code (static guard since Foundation), so the NOT NULL columns need
  no backfill. **If `cardio_logs` somehow has rows, the migration fails loudly
  and changes nothing** — stop and investigate; do not hand-edit data to force it.

### Dev / local (Supabase CLI stack)

```bash
npx supabase start            # if not running
npx prisma migrate deploy     # reads DIRECT_URL from .env (127.0.0.1:54322)
npx prisma migrate status     # expect: Database schema is up to date
```

### Production (human step — `overload-prod`)

Run from a trusted machine with the production **direct** connection string in
`DIRECT_URL` for these commands only (never commit it, never put it in a
`NEXT_PUBLIC_` variable):

```bash
npx prisma migrate status     # expect: 6_cardio_logging pending
npx prisma migrate deploy     # applies 6_cardio_logging only
npx prisma migrate status     # expect: up to date
```

Then confirm in the Supabase SQL editor (read-only checks):

```sql
select relrowsecurity from pg_class where relname in ('planned_cardio','cardio_logs');  -- true, true
select count(*) from pg_policies where tablename in ('planned_cardio','cardio_logs');   -- 0
select indexname from pg_indexes where tablename in ('planned_cardio','cardio_logs');
  -- includes planned_cardio_mesocycle_id_day_of_week_key, cardio_logs_mesocycle_id_scheduled_for_key
```

Deploy order: apply the migration **before** (or together with) the Vercel
production deploy of this commit; the new code reads the new table and columns.

Never run `prisma migrate reset`, `db push --force-reset`, or any destructive
command against production.

## Environment / dependencies

No new environment variables, secrets, packages, routes, Storage changes, cron
jobs, queues, timers, or health/wearable integrations.

## Verification commands

```bash
npm run lint
npm run typecheck
npm run format:check
npm test                    # unit: cardio validation/schedule/actions + invariant & isolation guards
npm run test:integration    # embedded Postgres: plan-cardio, cardio-logging, cardio-history + all prior suites
npm run build
npm run test:e2e            # auth boundary (no new route)
npm run verify:client-bundle
```

## Manual checks (dev / local stack or a preview — never manufacture production history)

Use dev data. **Do not insert, edit, or delete production `LoggedSet` or
`CardioLog` rows to manufacture states.** Every scenario below is also proven
automatically in the integration suites named above.

1. **Lifting-only day.** A day with a Session and no cardio: the dashboard and
   History look exactly as before (no cardio card, no cardio line).
2. **Cardio-only day.** Plan → Mesocycle → *Add cardio* → Saturday · Bike · 30.
   On a Saturday: Today shows the **Cardio** focal block with a primary
   **Log cardio**; no workout is created. Log it → "✓ Cardio complete".
3. **Combined day.** Add *Incline Walk · 20* to Tuesday (Pull Day). On Tuesday:
   Pull is the focal block with **Start workout** as the only primary button;
   the cardio card sits below with a secondary **Log**. Log cardio before the
   workout → lifting stays pending; finish the workout → cardio stays as logged
   (and vice versa: finish lifting first → cardio still pending).
4. **Actual minutes differ.** Log *Incline Walk · 27* → the card reads
   "✓ Incline Walk — 27 min / Planned 20 min"; Plan still shows 20.
5. **Actual type differs.** Log *Bike · 25* → "Planned Incline Walk · 20 min";
   Plan still shows Incline Walk.
6. **Retry.** Double-tap Save, or submit from a stale tab → one record only;
   the second shows "Already logged".
7. **One per day.** *Add cardio* → the day picker shows days that already have
   cardio as disabled ("has cardio").
8. **Shifted day.** With a missed lifting day that has cardio, choose
   **Shift the week** on the missed-day prompt → History shows the Session and
   its cardio together on the new date; a cardio-only day that week has not
   moved; next week is back to normal.
9. **Missed cardio.** Let a planned cardio day pass unlogged → History shows it
   as **Missed** (muted) with an optional **Log**; no prompt appears on Today,
   and nothing shifts.
10. **Clone-forward.** Clone a block with cardio → the clone summary lists
    "Cardio on N days"; the new draft's week shows the same cardio lines; its
    History has no cardio records.
11. **Historical correction.** History → tap a ✓ cardio line → change the
    minutes → the line updates; there is no delete control anywhere.
12. **No strength side effects.** After logging/correcting cardio, the exercise
    trend charts, progress/deload tags, goal percentages, and gym baselines are
    unchanged (cardio is never read by them — static guards + integration tests).

## Rollback / recovery

- **Code:** revert the squash-merge commit on `main` and redeploy. The previous
  code ignores `planned_cardio` and the new `cardio_logs` columns, so the schema
  can stay in place.
- **Schema:** do **not** drop `planned_cardio` or the new `cardio_logs` columns
  in production once real cardio has been logged — that would destroy training
  history. If a schema rollback is ever genuinely required before any real use,
  it must be a reviewed, hand-written forward migration, never `migrate reset`.
- **Data:** cardio records are never deleted by the app. A mistaken entry is
  fixed with the History correction dialog, not by deleting rows.
