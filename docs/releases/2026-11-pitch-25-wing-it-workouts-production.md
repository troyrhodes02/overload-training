# Release — Pitch 25: Wing-It Workouts (web + API + migration 9t)

**Scope:** the website and the versioned mobile API gain Wing-It workouts; Production gets migration `9t_wing_it_workouts`. **No native distribution:** no Production Expo update, no iOS build, no TestFlight submission. TestFlight 1.0.0 (2) testers keep their approved app unchanged.

Release branch `release/25-wing-it-workouts` (from `main` `89c92a5`), cherry-picked from staging: #361 (feature), #369, #370 (OVE-273), #371, #372 (OVE-274), #373, #374 (OVE-275), #375, #376 (Architecture Doc + acceptance). Not included: the reserved "Overload on iPhone" release note (21l release B) and the staging-only 21l runbook docs. The tree equals staging except those two.

Owner acceptance: every iPhone check passed (no plan; beside a scheduled workout; multiple sets; keypad Done; no auto-focus; footer order) and the release was approved on 2026-11-28 for web, API, and migration 9t.

Nothing in §2–§3 has been done to Production by the run. A human applies a Production migration from a runbook, with a backup taken immediately before (CLAUDE.md).

## 1. Release note

`2026-11-28-wing-it-workouts`, **"Wing-It workouts on the web"**, `significant: false`. The installed iPhone app reads What's New too; a significant note would open a dialog there about a feature that build doesn't show, so this release names the website and opens no dialog anywhere. The iPhone gets its own note with its native release. If the merge happens after 2026-11-28, re-date the id and date to the merge day first.

## 2. Production migration

| Migration | Applied to Production? | What it does |
| --- | --- | --- |
| `9t_wing_it_workouts` | **no (owner step)** | New enum `LoggedSessionKind`; `logged_sessions.kind` (default `planned`, immutable by trigger) and `gym_id` (RESTRICT, same-owner trigger); shape CHECK (`wing_it` ⇒ no session/mesocycle, a gym; `planned` ⇒ no session gym); partial unique index (one open Wing-It workout per account); `logged_exercises` plan snapshot becomes nullable with an all-or-none CHECK and a parent-kind trigger. No table or column dropped or renamed; no existing row rewritten (every row becomes `planned` via the default). |

**Read-only pre-check by the run (2026-11-27, aggregates only, `BEGIN TRANSACTION READ ONLY`, through `vercel env run --environment production`):** Postgres 17.11; latest applied `9s_schedule_moves`; `9t` not applied and no `kind`/`gym_id` column or `LoggedSessionKind` type present; the only rolled-back `_prisma_migrations` rows are two October attempts of `9_account_ownership_2_enforce`, each followed by a successful apply (not blocking); 49 logged sessions (0 without session/mesocycle; 3 in progress), 308 logged exercises (0 without a plan snapshot), 578 logged sets; 0 ownership mismatches (exercise vs. session, set vs. exercise); RLS on for all three logged tables; free-Pro period `true`, Stripe billing not `true`, 4 open comps, 0 billing accounts.

**Order: migration first, then the code.** Proven by the run: `main`'s code (the deployed Production code) passes 189/189 integration tests (logging, history integrity, progression, goals, account deletion, export, isolation) on a database with `9t` applied. The new code requires `9t` (it reads `kind`).

## 3. Production migration runbook (owner-operated)

Run from a checkout of `release/25-wing-it-workouts` with no `.env` file pointing anywhere (local Production files stay quarantined). The guarded `db:migrate:dev` wrapper refuses Production by design.

1. **Backup.** Supabase dashboard → `overload-prod` (ref `ycxvdiklpefyhdclxyau`) → Database → Backups. Confirm a backup from the last few minutes, or take one on demand; note its time.
2. **Shell.**
   ```bash
   cd <release checkout>/apps/web
   export DIRECT_URL='<overload-prod direct or session-pooler URL>'
   export DATABASE_URL="$DIRECT_URL"
   node -e 'const u=new URL(process.env.DIRECT_URL);console.log(u.hostname, decodeURIComponent(u.username))'
   # expect ycxvdiklpefyhdclxyau, NEVER vdxrmfadikwzodjljbdi
   ```
3. **Status (read-only).** `npx prisma migrate status` — continue only if the pending list is exactly `9t_wing_it_workouts`.
4. **Preflight (read-only).** Note the output:
   ```bash
   psql "$DIRECT_URL" -c "SELECT count(*) AS logged_sets, md5(string_agg(id::text||':'||coalesce(weight_lbs::text,'')||':'||reps::text||':'||coalesce(rir::text,''), ',' ORDER BY id)) AS sets_hash FROM logged_sets;"
   psql "$DIRECT_URL" -c "SELECT count(*) AS sessions, count(*) FILTER (WHERE session_id IS NULL OR mesocycle_id IS NULL) AS without_plan_refs FROM logged_sessions;"
   psql "$DIRECT_URL" -c "SELECT count(*) AS exercises, count(*) FILTER (WHERE planned_sets IS NULL OR target_rep_min IS NULL OR target_rep_max IS NULL) AS without_snapshot FROM logged_exercises;"
   ```
   `without_snapshot` must be 0.
5. **Apply.** `npx prisma migrate deploy` — never `migrate dev`, `db push`, or `migrate reset`.
6. **Verify (read-only).**
   ```bash
   npx prisma migrate status      # expect: Database schema is up to date!
   psql "$DIRECT_URL" <<'SQL'
   SELECT kind, count(*) FROM logged_sessions GROUP BY kind;                                   -- only 'planned', same total as step 4
   SELECT conname FROM pg_constraint WHERE conname IN ('logged_sessions_kind_shape_check','logged_exercises_plan_snapshot_check') ORDER BY 1;  -- 2 rows
   SELECT indexname FROM pg_indexes WHERE indexname='logged_sessions_one_open_wing_it_per_user'; -- 1 row
   SELECT tgname FROM pg_trigger WHERE tgname IN ('logged_sessions_kind_immutable','logged_exercises_snapshot_matches_kind','logged_sessions_same_owner_gym_id') ORDER BY 1;  -- 3 rows
   SELECT relrowsecurity FROM pg_class WHERE relname IN ('logged_sessions','logged_exercises','logged_sets');  -- t, t, t
   SELECT count(*) AS logged_sets, md5(string_agg(id::text||':'||coalesce(weight_lbs::text,'')||':'||reps::text||':'||coalesce(rir::text,''), ',' ORDER BY id)) AS sets_hash FROM logged_sets;  -- identical to step 4
   SQL
   ```
7. `unset DIRECT_URL DATABASE_URL` (or close the shell).
8. **Tell the run "9t applied"** (or merge the release PR yourself). The run then re-dates the note if needed, merges, and verifies.

## 4. Production environment

No environment variable change. `OVERLOAD_FREE_PRO_PERIOD=true` and Stripe billing off stay exactly as they are. No provider, billing, entitlement, tour, or Expo channel change.

## 5. TestFlight 1.0.0 (2) compatibility

- `main`'s own mobile API integration tests (the contract the build was made against) run against the release code: **161/162 pass**; the single difference is the additive `wingIt` object on `GET /today`, which that build ignores (no runtime validation). Sign-in, Today, Plan, History, planned workout start/log/finish, Pro access (`/me/plan`), and history detail are unchanged.
- Known limitations if that build meets a Wing-It workout started on the web: it can open it from History or the unfinished list, log, and finish; its card shows "n × 1–1000" as the scheme line (cosmetic); after a set the next set appears only when the workout is reopened (its old set merge); Swap and "fewer sets" are refused with a message. It cannot start one. No new-feature parity is claimed for that build.

## 6. Post-release verification (run, non-destructive, test accounts only)

App config and mobile routes respond as before; public pages render; signed-out redirects; free-Pro and checkout state unchanged; web Wing-It and planned logging verified only on an authorized test account (never a real lifter's data).

## 7. Rollback

- **Code:** promote the previous Production deployment (`89c92a5`) in Vercel, or revert through a PR. The old code runs on the migrated schema (189/189 above); Wing-It rows written meanwhile stay intact and read oddly in the old UI ("Workout", odd scheme text) but are never altered.
- **Schema:** no rollback needed; the migration only adds.
- **Last resort:** restore the step 1 backup (loses anything written after it).

## 8. After the release

Synchronize `main` into `staging` through a PR with a normal merge commit, keeping staging's reserved "Overload on iPhone" note and 21l docs. `staging` already has `9t` on `overload-dev`.
