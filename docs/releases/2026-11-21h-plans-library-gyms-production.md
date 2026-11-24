# Release record: Pitch 21h — Plans, Library & Gyms (to Production)

**Release branch:** `release/21h-plans-library-gyms`, cut from `main` at `e3f4950` (the Pitch 21g release).

**Content:** four cherry-picks from `staging`, in order, plus this record.

| Staging commit | PR | What |
| --- | --- | --- |
| `25465e0` | #293 | Docs: the 21g closeout. Docs only; merged into `staging` after the 21g release |
| `d86c3f0` | #300 | Pitch 21h: OVE-232..236 (ticket PRs #294–#298) and the review fixes (#299) |
| `8fab636` | #301 | Docs: the 21h staging delivery record |
| `f3fec3a` | #302 | OVE-237: the exercise-detail layout corrections from the owner's iPhone acceptance |

**Why this is exactly 21h:**

- `staging` at the last sync (`9f4e9d6`, #292) had `main`'s tree.
- These four commits are everything `staging` gained after that sync.
- Apart from this record, the release tree is byte-identical to `staging` at `f3fec3a`. That tree was verified on staging and published as staging update `058aac54`.

**Owner acceptance and authorization (2026-11-23):**
- The owner tested 21h on a physical iPhone and accepted the core functionality:
  - the plan, week navigation and sessions;
  - the library, search and details;
  - favorites;
  - creating, archiving and restoring custom exercises and gyms;
  - the workout's "About this exercise", which keeps the workout's state;
  - the existing workout.
- Two exercise-detail layout defects were reported and fixed (OVE-237).
- The owner explicitly authorized:
  - this release, and its merge into `main`;
  - the Production web deployment it triggers, and non-destructive verification;
  - synchronizing `main` back into `staging`.
- That authorization does not cover a migration, a Production configuration change, live Stripe, a Production Expo update, or a TestFlight or App Store build.

## 1. What Production gains

### Web (everyone)

- **Plan prescriptions.** The plan row's "3 sets · 6–8 reps" wording now comes from the shared `formatPrescription`. The output is identical.
- **Week schedule.** `getWeekSchedule` delegates to `getWeekScheduleWithSessions`, and its output is unchanged.
- **No visible web change** beyond that.

### Mobile API (additive; older app versions unaffected)

- **Nine new endpoints, all Free:**
  - `GET /plan?week=`
  - `GET /mesocycles/{id}/sessions/{id}`
  - `GET /exercises`
  - `POST /exercises`
  - `GET /exercises/{id}`
  - `PUT /exercises/{id}/favorite`
  - `PUT /exercises/{id}/archived`
  - `POST /gyms`
  - `PUT /gyms/{id}/archived`
- **Retry safety.** The two creates require an `Idempotency-Key`: a replay returns the same row, and a reused key with a different body answers 409. This is the existing `withIdempotency` table and mechanism from 21c.
- **One additive field:** `PlannedExerciseDto.requiresExternalWeight`.
- **No removed or renamed field, no new version, no new error code.** The minimum app version is unchanged.

### `apps/mobile`

- The 21h screens and the OVE-237 corrections are in the repository, but **nothing builds or publishes them to Production**.
- The app's config refuses every environment except staging, and the EAS project has one channel, `staging`.

### Not changed

- **No schema change and no migration.** Favorites already existed (`ExerciseFavorite`).
- **No new environment variable.**
- **No new dependency or native module.** The runtime is still `f98506f78a`.
- **No engine, threshold, e1RM, or entitlement change.**
- **History and baselines.** Archiving sets `deletedAt` only. History and gym baselines are untouched, and creating or archiving a gym copies or changes no baseline.
- **Not added:** an edit for custom exercises or gyms. It's a deferred product decision, OVE-238.

## 2. Verification on the release tree (2026-11-23, this branch)

| Check | Result |
| --- | --- |
| `npm run format:check`, `npm run lint`, `npm run typecheck` | pass. Lint: 0 errors, 1 warning that was already there (`history-week.ts`) |
| `npm test`: web unit, mobile, workspace boundaries | 2,749 + 506 passed; boundaries OK |
| `npm run test:integration` | 1,452 passed, 109 suites. Covers isolation (all 9 new endpoints plus cross-account cases), create idempotency (replay and 409), archive history integrity, gym baselines, entitlements, engine, workout lock, and the mobile API |
| Production build (placeholder env, clean `.next`) and `verify:client-bundle` | pass; no server secret in `.next/static` |
| iOS bundle export | exported (1,454 modules); no secret pattern in the bundle |
| Runtime fingerprint | `f98506f78a`, unchanged |
| Release diff against `main` | 99 files, all under `apps/`, `packages/shared`, `docs/`, and `CLAUDE.md`. No migration, no `.env`, no package or lock change, no native config, no secret pattern. Contracts and routes: additions only |
| Staging, same tree | Deployment for `f3fec3a` succeeded. 21h staging API checks passed (21h runbook §7). Staging update `058aac54` published for runtime `f98506f78a` and build `86e673d0` |
| Simulator or physical iPhone | **Not run by the pipeline.** The corrected layout is the owner's check (21h runbook §10) |

## 3. Production smoke plan (non-destructive, no accounts created)

1. The Production deployment for the release commit is Ready on `www.overloadtraining.app`.
2. Public pages answer 200: `/`, `/login`, `/pricing`, `/changelog`.
3. `GET /api/mobile/v1/app-config` answers 200, with the same minimum version as before.
4. Without a token, the nine new endpoints and the existing `GET /today` answer 401 `unauthorized` with the API's JSON envelope.
5. The version gate is intact: without the version header the API answers 400 `validation_error`, and below the minimum version it answers 426.
6. Runtime logs: check for no new 5xx errors.

## 4. Rollback

Revert the release's squash commit on `main` with a PR (`git revert <merge>`), then merge it.

- Nothing needs to be undone in the database: there's no migration.
- Rows created through the new endpoints are ordinary custom exercises, favorites and gyms, which the web already reads.
- The API change is additive, so no released app calls the new endpoints.

## 5. Owner checks after release

21h runbook §10: three corrected-layout checks on the staging update. There's no Production device check, because no Production build exists.

## 6. Results (2026-11-23)

| Step | Result |
| --- | --- |
| Release PR | #303, squash-merged as **`db79768`**. `main`'s tree equals the release branch |
| Production deployment | `dpl_2GYiRP4Ee5Ps1PWYzhZvAPKMJvhM`: **Ready**, target production, `www.overloadtraining.app` and `overloadtraining.app` |
| Smoke 2 | `/`, `/login`, `/pricing`, `/changelog`: 200 |
| Smoke 3 | `app-config` 200. Minimum and latest version `0.0.0`, unchanged. Kill switches off |
| Smoke 4 | All 9 new endpoints and `GET /today`, without a token: 401 `unauthorized`, JSON envelope |
| Smoke 5 | The minimum is `0.0.0`, so 426 can't be exercised. Without the version header: 400 `validation_error` (gate intact) |
| Smoke 6 | `vercel logs`, error level, last 30 min: one `pg` deprecation warning from the previous deployment, logged before the release. Nothing from `dpl_2GYiRP4E…` |
| Authenticated Production behavior | Not exercised. No Production accounts were created and no lifter data was touched; that behavior was verified on staging |
| Sync | The sync PR merges `main` into `staging` with a merge commit, so `main` is an ancestor of `staging` |
| Not done (not authorized) | Migrations, Production environment, Stripe, Production Expo update, TestFlight |
