# Release record: Prescription-Aware Intelligence (to Production)

**Release branch:** `release/prescription-aware-intelligence`, cut from `main` at `1551e46` (the 21d release).
**Content:** two cherry-picks from `staging`: `cd393e3` (feature PR #227: tickets OVE-192..196, the review fixes #233, and the owner-ratified method-note amendments) and `9055015` (OVE-197, #235: the database default for `lineage_id`, the owner's Option B). Plus this record. Apart from this record, the release tree is byte-identical to `staging` at `9055015`, and `staging` immediately before the feature (`de2a178`) was byte-identical to `main`, so nothing else from `staging` is involved.

Nothing below has been done to Production. Every Production step is the owner's (CLAUDE.md: a Production migration is applied by a human from a runbook, with a backup taken immediately before; merging into `main` is a human step).

## 1. What Production gains

- Each recurring workout (session lineage + performed exercise, + gym for machines and cables) keeps its own weight memory and progression call. Wednesday's 6–8 bench is offered Wednesday's own last weight, never Saturday's 255 lb. With no comparable history, the box is empty and another workout's numbers appear only as "For reference: …".
- Progression evidence is a contiguous comparable segment: a changed rep range starts a new streak, and returning to an old range never revives an old one.
- Machine and cable offers follow the latest comparable weight logged at that gym, not the sticky baseline. Baseline writes are unchanged; no surface reads the baseline except the data export.
- Card, Today, finish summary, and exercise page agree; the exercise page shows one "Next time" line per workout, and session rows name their workout.
- Records, PRs, goals, the e1RM formula, and the progression engine are unchanged. Free keeps the prefill and reference lines; Pro calls are unchanged.
- A significant release note, "Each workout remembers its own weights", dated 2026-11-15. If Production ships on a later day, re-date its `id` and `date` in `packages/shared/src/release-notes/entries.ts` before merging.
- Mobile API: no new endpoint; `/today`'s shape is unchanged (its values are now per recurring workout). The card and history contracts gain additive fields only. No released app consumes them (no store build exists).

## 2. Production migrations

### Which ones

| Migration | In `main` since | Applied to Production? | What it does |
| --- | --- | --- | --- |
| `9q_session_lineage` | this release | **no** | Adds `sessions.lineage_id uuid`, backfills every row to its own `id`, sets NOT NULL, adds the unique index `(mesocycle_id, lineage_id)`, an index on `lineage_id`, and the immutability trigger `sessions_lineage_id_immutable`. No other table is touched. |
| `9r_session_lineage_default` | this release (OVE-197) | **no** | `ALTER COLUMN lineage_id SET DEFAULT gen_random_uuid()`. Metadata only: no row is touched. |

`main`'s previous latest migration is `9p_mobile_api` (21c release). The run holds no Production credentials, so the read-only status check in step 4 decides: continue only if the pending list is exactly `9q_session_lineage` then `9r_session_lineage_default`. `prisma migrate deploy` applies both, in order, in one run.

### Compatibility with existing Production data

Every existing session gets `lineage_id = id`, which is unique, so the per-mesocycle unique index and NOT NULL always succeed, whatever the data. Rehearsed on the legacy dataset (`tests/integration/session-lineage-migration.int.test.ts`, both migrations) and applied to `overload-dev` on 2026-11-15 (18 sessions backfilled; logged-set counts and a checksum of every logged set unchanged by both migrations).

### Compatibility with the code running in Production today

With `9r`, `lineage_id` has a database default. The code deployed now (`1551e46`) does not know the column and omits it when it creates a session; the database fills it with a fresh, independent lineage. Verified on `overload-dev` with an insert of exactly the old application's columns: it failed with `null value in column "lineage_id"` after `9q` alone, and succeeds after `9r` (both probes rolled back). So:

- Between applying the migrations and the new deployment going live, the old application keeps working normally, including creating, duplicating, and cloning sessions and confirming plan imports.
- A code rollback to `1551e46` needs **no** database change.
- Old-code reads are unaffected (Prisma selects only the columns it knows).

The new code also omits the field on create (its Prisma schema declares the same database default) and passes it explicitly only when cloning, so a clone keeps the recurring workout's lineage.

### Order: migrations first, then the code

The new code selects `sessions.lineage_id`; deploying it before the migrations would break every plan and logging read. So: **back up, apply `9q` and `9r`, verify, then merge the release PR.** Because the old code keeps working on the migrated schema, there is no time pressure between the two steps.

## 3. Production migration runbook (owner-operated)

Run from a checkout of `release/prescription-aware-intelligence` with no `.env` file in `apps/web`. The guarded `db:migrate:dev` wrapper refuses Production by design.

1. **Backup.** Supabase dashboard → `overload-prod` (ref `ycxvdiklpefyhdclxyau`) → Database → Backups: confirm a backup from the last few minutes (or take an on-demand one) and note its time. Optionally also `pg_dump "$DIRECT_URL" -Fc -f overload-prod-pre-pai-$(date -u +%Y%m%dT%H%MZ).dump` with a matching `pg_dump`.
2. **Shell.** In a new terminal, export the Production connection for this shell only (never into a file):
   ```bash
   cd <release checkout>/apps/web
   git log --oneline -1          # the release branch head
   export DIRECT_URL='<overload-prod direct or session-pooler URL>'
   export DATABASE_URL="$DIRECT_URL"
   ```
3. **Identity (read-only).**
   ```bash
   node -e 'const u=new URL(process.env.DIRECT_URL);console.log(u.hostname, decodeURIComponent(u.username))'
   # expect ycxvdiklpefyhdclxyau in the host or user name, NEVER vdxrmfadikwzodjljbdi
   psql "$DIRECT_URL" -At -c "SELECT pg_catalog.obj_description(n.oid,'pg_namespace') FROM pg_catalog.pg_namespace n WHERE n.nspname='overload_target'"
   # expect NO output: Production never carries the dev identity marker
   ```
4. **Status and preflight (read-only).**
   ```bash
   npx prisma migrate status
   psql "$DIRECT_URL" <<'SQL'
   SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 3;
   SELECT count(*) FROM information_schema.columns WHERE table_name='sessions' AND column_name='lineage_id';   -- 0
   SELECT count(*) AS sessions FROM sessions;
   SELECT count(*) AS logged_sets, md5(string_agg(id::text||':'||coalesce(weight_lbs::text,'')||':'||reps::text||':'||coalesce(rir::text,''), ',' ORDER BY id)) AS sets_hash FROM logged_sets;
   SQL
   ```
   Continue only if the pending list is exactly `9q_session_lineage` then `9r_session_lineage_default`, the newest finished row is `9p_mobile_api`, nothing is failed or rolled back, and `lineage_id` does not exist yet. Note the session count and the `sets_hash`.
5. **Apply.**
   ```bash
   npx prisma migrate deploy      # never migrate dev, db push, or migrate reset
   ```
6. **Verify (read-only).**
   ```bash
   npx prisma migrate status      # expect: Database schema is up to date!
   psql "$DIRECT_URL" <<'SQL'
   SELECT is_nullable, data_type, column_default FROM information_schema.columns WHERE table_name='sessions' AND column_name='lineage_id';  -- NO | uuid | gen_random_uuid()
   SELECT indexname FROM pg_indexes WHERE tablename='sessions' AND indexname LIKE '%lineage%';   -- the unique key and the index
   SELECT tgname FROM pg_trigger WHERE tgname='sessions_lineage_id_immutable';                    -- 1 row
   SELECT count(*) FILTER (WHERE lineage_id <> id) AS differs, count(*) AS sessions FROM sessions;  -- differs 0, sessions = step 4
   SELECT relrowsecurity FROM pg_class WHERE relname='sessions';                                  -- t
   SELECT count(*) AS logged_sets, md5(string_agg(id::text||':'||coalesce(weight_lbs::text,'')||':'||reps::text||':'||coalesce(rir::text,''), ',' ORDER BY id)) AS sets_hash FROM logged_sets;  -- identical to step 4
   SQL
   ```
7. **Close the shell** (or `unset DIRECT_URL DATABASE_URL`).
   Optional, the old application's insert (rolled back, writes nothing):
   ```bash
   psql "$DIRECT_URL" <<'SQL'
   BEGIN;
   INSERT INTO sessions (id, user_id, mesocycle_id, name, day_of_week, position, created_at, updated_at)
     SELECT gen_random_uuid(), m.user_id, m.id, 'compat probe', NULL, 999, now(), now() FROM mesocycles m LIMIT 1
     RETURNING lineage_id IS NOT NULL AS has_lineage;   -- t
   ROLLBACK;
   SQL
   ```
8. **Then** merge the release PR into `main`. Vercel deploys Production. (The old deployment keeps working in between.)

## 4. Production environment

No environment variable is added or changed. No provider, billing, or scheduled-job change.

## 5. Production smoke test (after the deploy, non-destructive)

- `curl -s https://<production host>/api/mobile/v1/app-config` → 200 JSON, unchanged shape.
- Signed in as yourself: Today, an open or past workout card, History, an exercise page, and Goals render without error. A workout card for an exercise you do in two workouts says "Last time in {workout}"; the exercise page's "Next time" shows one line per workout.
- What's New shows "Each workout remembers its own weights" once.
- In the plan builder, add and then remove a test session in a **draft** block (or skip this if you prefer to create nothing): it saves, proving session creation works with the new column.
- Signed out, `/history` redirects to `/login`.
- Vercel → the Production deployment's runtime logs show no `lineage_id` or Prisma errors.

## 6. Rollback

- **Code:** in Vercel, promote the previous Production deployment (`1551e46`), or revert the merge on `main` through a PR. The old code runs correctly on the migrated schema, including creating sessions (§2); no database change is needed.
- **Schema** (only after a code rollback, and only if you want the column gone — not needed for the old code to work): drop the trigger, its function, the two indexes, and the column, then delete the `9q_session_lineage` and `9r_session_lineage_default` rows from `_prisma_migrations` (statements in the feature runbook §5). This loses the cross-block links of blocks cloned after the release; logged sets are untouched.
- **Last resort:** restore the step 1 backup. This loses anything written after it.

## 7. After the release

Synchronize `main` back into `staging` with a normal merge commit through a PR, as after every release (for example #225). `staging` already has `9q` and `9r` applied on `overload-dev`; the sync must not re-apply anything.
