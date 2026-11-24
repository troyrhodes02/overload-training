# Release record: OVE-240 — This Week's Schedule on Today (to Production)

**Release branch:** `release/ove-240-week-schedule`, cut from `main` at `db79768` (the 21h release).
**Content:** one cherry-pick from `staging`, `db6aa57` (feature PR #305, OVE-240), plus this record. Apart from this record, the release's code is byte-identical to `staging` at `db6aa57`. Before the feature, `staging` differed from `main` only in three documentation files (the 21h closeout, `de7937c`), so nothing else from `staging` is involved.

Nothing below has been done to Production. Every Production step is the owner's (CLAUDE.md: a human applies a Production migration from a runbook, with a backup taken immediately before).

## 1. What Production gains

- **Web Today shows the current block week as a seven-day strip.** Tapping a day previews it. From the strip a lifter can:
  - **Skip** a not-yet-started workout today or later. This is stored as the existing skipped resolution.
  - **Train today**: move a later workout to a free today and start it.
  - **Swap** two days this week, including with a rest day.
- The authored plan is never changed, and next week keeps its normal schedule.
- A moved workout keeps its identity (`scheduledFor` = its planned date) and records the day it was trained (`performedOn`). It is counted once and is never reported as missed on its old day.
- History, workout detail, and unfinished workouts date a moved workout on the day it was trained.
- **Mobile API:** no new endpoint and no shape change. A week changed on the web shows correctly on the iPhone's Today and History. One behavior change: starting a workout the lifter skipped this week now answers `invalid_state_transition` ("You skipped this workout this week.").
- **Release note** (not significant): "Change this week's schedule from Today", dated **2026-11-24**. If Production ships on a later day, change its `id` and `date` in `packages/shared/src/release-notes/entries.ts` on this branch before merging.
- **Capability:** Free.

## 2. Production migration

| Migration | In `main` since | Applied to Production? | What it does |
| --- | --- | --- | --- |
| `9s_schedule_moves` | this release | **no** | Creates the owned table `schedule_moves`. It has deny-all RLS (no policy), the `user_id`-immutable trigger, same-owner triggers on `mesocycle_id` and `session_id`, RESTRICT foreign keys, a same-week CHECK, a unique key on `(session_id, authored_on)`, and two indexes. No existing table or row is touched. |

`main`'s latest migration before this one is `9r_session_lineage_default`. `9s` was applied to `overload-dev` on 2026-11-24 with the guarded wrapper and verified there: RLS on, 0 policies, all 3 triggers present, RESTRICT foreign keys.

**Order: migration first, then the code.** The new code reads `schedule_moves` on Today, History, and every workout start. Deploying it first would break those pages. The code running in Production now ignores the table, so applying the migration first is safe and leaves no time pressure.

## 3. Production migration runbook (owner-operated)

Run this from a checkout of `release/ove-240-week-schedule` with no `.env` file pointing anywhere. The guarded `db:migrate:dev` wrapper refuses Production by design.

1. **Backup.** In the Supabase dashboard, open `overload-prod` (ref `ycxvdiklpefyhdclxyau`), then Database → Backups. Confirm there is a backup from the last few minutes, or take one on demand, and note its time.

2. **Shell.** Export the Production connection for this shell only:
   ```bash
   cd <release checkout>/apps/web
   export DIRECT_URL='<overload-prod direct or session-pooler URL>'
   export DATABASE_URL="$DIRECT_URL"
   node -e 'const u=new URL(process.env.DIRECT_URL);console.log(u.hostname, decodeURIComponent(u.username))'
   # expect ycxvdiklpefyhdclxyau, NEVER vdxrmfadikwzodjljbdi
   ```

3. **Status (read-only).**
   ```bash
   npx prisma migrate status
   ```
   Continue only if the pending list is exactly `9s_schedule_moves`.

4. **Preflight (read-only).**
   ```bash
   psql "$DIRECT_URL" -c "SELECT count(*) AS logged_sets, md5(string_agg(id::text||':'||coalesce(weight_lbs::text,'')||':'||reps::text||':'||coalesce(rir::text,''), ',' ORDER BY id)) AS sets_hash FROM logged_sets;"
   ```
   Note the count and the hash.

5. **Apply.**
   ```bash
   npx prisma migrate deploy      # never migrate dev, db push, or migrate reset
   ```

6. **Verify (read-only).**
   ```bash
   npx prisma migrate status      # expect: Database schema is up to date!
   psql "$DIRECT_URL" <<'SQL'
   SELECT relrowsecurity FROM pg_class WHERE relname='schedule_moves';                         -- t
   SELECT count(*) FROM pg_policies WHERE tablename='schedule_moves';                         -- 0
   SELECT tgname FROM pg_trigger WHERE tgrelid='schedule_moves'::regclass AND NOT tgisinternal ORDER BY 1;  -- 3 rows
   SELECT conname, confdeltype FROM pg_constraint WHERE conrelid='schedule_moves'::regclass AND contype='f';  -- all 'r'
   SELECT count(*) AS logged_sets, md5(string_agg(id::text||':'||coalesce(weight_lbs::text,'')||':'||reps::text||':'||coalesce(rir::text,''), ',' ORDER BY id)) AS sets_hash FROM logged_sets;  -- identical to step 4
   SQL
   ```

7. **Close the shell**, or run `unset DIRECT_URL DATABASE_URL`.

8. **Re-date the release note** if today is after 2026-11-24 (push that commit to this branch).

9. **Then merge the release PR into `main`.** Vercel deploys Production.

## 4. Production environment

No environment variable, provider, billing, or scheduled-job change.

## 5. Production smoke test (after the deploy, non-destructive)

- `curl -s https://www.overloadtraining.app/api/mobile/v1/app-config`: a 200 JSON response with the same shape as before.
- Signed in as yourself:
  - Today shows "This week · Week N of M" with seven days, and today circled.
  - Tapping another day shows its preview and changes nothing.
  - History and an open workout render.
- **Don't** skip, move, or swap a real workout just to test. If you want to try it, use a day you would genuinely change.
- Signed out, `/` and `/history` redirect to `/login`.
- In Vercel, the Production deployment's runtime logs show no `schedule_moves` or Prisma errors.

## 6. Rollback

- **Code:** promote the previous Production deployment (`db79768`) in Vercel, or revert the merge through a PR. The old code ignores `schedule_moves`. Weeks with moves then show their authored days again. Skips (resolutions) and logged workouts are unchanged.
- **Schema** (only after a code rollback, and only if wanted): `DROP TABLE "schedule_moves";` and delete the `9s_schedule_moves` row from `_prisma_migrations`. This loses only one-week moves.
- **Last resort:** restore the step 1 backup. This loses anything written after it.

## 7. After the release

Synchronize `main` back into `staging` with a normal merge commit through a PR, as after every release (#304). `staging` already has `9s` on `overload-dev`; the sync must not re-apply anything.
