# Pitch 5 — Progressive Overload Engine — Runbook

Operational notes for shipping and verifying the Progressive Overload Engine.

## Schema / migrations

**No schema migration is required.** The engine is entirely derive-on-read: it
adds no tables, columns, or enums. Confirm with:

```bash
git diff main -- prisma/schema.prisma prisma/migrations   # expect: no output
```

The derived-never-stored invariant is enforced by a static test
(`tests/unit/invariant-guards.test.ts` → "progression is derived, never stored"):
no progression-tag / e1RM / recommendation column, exactly one `estimateOneRepMax`,
read-only progression modules, and no cron/scheduler dependency.

## Dependencies

- **Recharts** (`recharts@^3`) is added for the e1RM chart — the stack-decided
  charting library (Architecture Doc / CLAUDE.md), not a new decision. After
  pulling this branch run `npm install`.

## Environment / deploy

- No new environment variables. No new secrets. No Supabase Storage changes.
- Standard Vercel production deploy. Because this pitch **only reads** logged
  history and never writes, deletes, archives, or rewrites a `LoggedSet` or a
  `GymExerciseBaseline`, it carries none of the logged-history deploy risk that
  gated Pitch 4. Still verify on the Vercel preview before production.

## Verification commands

```bash
npm run lint
npm run typecheck
npm run format:check
npm test                       # unit (includes engine, e1RM, deload, guards)
npm run test:integration       # includes progression.int (gym isolation, etc.)
npm run build
npm run test:e2e               # if the e2e stack is available
```

## Representative verification scenarios (dev/preview data only)

Do **not** edit production `LoggedSet`s to manufacture test data. Use the
embedded-Postgres integration suite (`tests/integration/progression.int.test.ts`)
or dev/preview data. Scenarios proven there:

1. **Free-weight Progress** — two consecutive all-top sessions of a barbell lift
   → `Progress`, suggested `latest + 5 lb`.
2. **Reactive Deload** — a below-min set in each of two consecutive qualifying
   sessions → `Deload`.
3. **Insufficient history** — 0 or 1 qualifying session → no tag.
4. **Stall veto** — three all-top sessions whose e1RM is flat/declining →
   `Hold — trend flat` (stalled), never `Deload`.
5. **Scheduled Deload** — a week-5 occurrence (deload every 5) → no reactive tag,
   90% suggested load rounded down to 5 lb; reactive evaluation resumes week 6.
6. **Gym A / Gym B machine isolation** — a machine lift logged at two gyms: each
   gym's progression, trend, and suggestion use only that gym's history; Gym B
   with <2 sessions stays insufficient even when Gym A has plenty.
7. **Past-log correction** — editing a historical set via the Pitch 4 editor
   changes the derived tag/trend on the next read, with no recompute row written
   and gym baselines untouched.
8. **Chart** — one exercise, one series; scheduled-deload points marked; gym
   selector appears only when ≥2 gyms have history; chart is read-only.

### Manual UI check (preview deployment)

- Dashboard: free-weight tag shows; machine shows "once gym is set"; a deload
  week shows the banner + 90% loads and no reactive tags.
- Logging card: tag + "Try N lb (+5)" beside the bar; "View trend" link.
- Exercise detail: Progression region with chart, current e1RM, gym selector
  (machine with 2+ gyms); "Not enough history yet" for a new lift.
- Flip light/dark in Settings — chart line/grid/axis invert via theme tokens.

## Rollback

Pure additive, read-only feature with no migration. To roll back, revert the
feature merge commit on `main` and redeploy; no data migration or cleanup is
needed because nothing was written. `npm install` after the revert to drop
Recharts if desired (not required — an unused dependency is harmless).
