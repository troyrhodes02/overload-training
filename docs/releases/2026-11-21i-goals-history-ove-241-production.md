# Release record: Pitch 21i — Goals & Exercise History, and OVE-241 — Native Weekly Scheduling Parity (to Production)

**Release branch:** `release/21i-goals-history-ove-241`, cut from `main` at `c31638b` (the OVE-240 release).

**Content:** nine cherry-picks from `staging`, in order, plus this record.

| Staging commit | PR | What |
| --- | --- | --- |
| `de7937c` | #304 | Docs only: the 21h closeout (CLAUDE.md status, the 21h runbook closeout, the 21h release record). It was merged into `staging` after the 21h release and never into `main`, as was the 21g closeout carried by the 21h release. |
| `bdf815f` | #308 | Docs: the 21i pitch, design, and spec, and the OVE-241 chore spec |
| `0ad054e` | #309 | OVE-242: goals on the iPhone (list, detail, history, archive, the Goal-reached card) |
| `e137e37` | #310 | OVE-243: set a goal (pick the lift, retry-safe create) |
| `c05b371` | #311 | OVE-244: exercise history (sessions, records, gym scope, goals, Free/Pro) |
| `323dada` | #312 | OVE-245: the native e1RM line chart |
| `b49fae8` | #313 | OVE-241: native weekly scheduling parity |
| `112737c` | #314 | OVE-246: test accounts, parity matrix, and runbook, plus the independent review's fixes |
| `6d4d04b` | #315 | Docs: the 21i staging verification and delivery record |

**Why this is exactly 21i and OVE-241:**
- `staging` at the last sync (`b1fa87e`, #307) held `main`'s tree. The only exception was the 21h closeout docs above.
- These commits are everything `staging` gained after that sync, plus that closeout.
- Apart from this record, the release tree is **byte-identical to `staging` at `6d4d04b`**. Its code is identical to `112737c`, which was verified on staging and published as staging update `4e76746e`.
- `#315` changed only the 21i runbook.

**Owner acceptance and authorization (2026-11-24):**
- The owner tested the combined staging update (group `4e76746e`, commit `112737c`, runtime `f98506f78a`, development build `86e673d0`) on a physical iPhone. All five acceptance groups passed (21i runbook §4):
  1. Goals
  2. Exercise history and the chart
  3. Weekly scheduling
  4. Train today and Skip
  5. Workout regression and the Free state
- The owner explicitly authorized:
  - this release, and its merge into `main`
  - the Production web deployment it triggers, and non-destructive verification
  - synchronizing `main` back into `staging`
  - closing OVE-241
- That authorization does not cover a migration, a Production configuration change, live Stripe, a Production Expo update, or a TestFlight, App Store, or Production-connected build.

## 1. What Production gains

### Web (everyone)

There is no visible web change. `src/lib/logging/this-week.ts` now takes its `ThisWeek*` types from the shared contract (`@overload/shared/contracts/schedule`) and re-exports them. The web Today strip's output is unchanged.

### Mobile API (additive; older app versions unaffected)

Eleven new endpoint methods. All are Free and account-scoped through `mobileRoute`.

**Pitch 21i: goals and exercise history**

| Endpoint | What it does |
| --- | --- |
| `GET /goals` | Active goals and goal reached cards |
| `GET /goals/history` | Archived goals |
| `GET /goals/{id}` | One goal |
| `POST /goals` | Create a goal. Needs an `Idempotency-Key`: a replay returns the same goal, a reused key with a different body answers 409, and a second active goal on the exercise answers 409 with `existingGoalId` |
| `PUT /goals/{id}/archived` | Archive a goal. Absolute and retry-safe; there is no unarchive |
| `PUT /goals/{id}/acknowledged` | Acknowledge a reached goal. Idempotent |
| `GET /exercises/{id}/goal-form` | Context for the goal form |
| `GET /exercises/{id}/history` | Exercise history, through the gated `getExerciseHistory` reader. On Free it withholds the e1RM trend, best e1RM, rep records, per-session calls, and Next time, and sets `locked`. |

The goal reads run the web's completion check first (`src/lib/views/goals.ts`), as the web's goal pages do.

**OVE-241: weekly scheduling**

| Endpoint | Wraps (released OVE-240 module, unchanged) |
| --- | --- |
| `GET /this-week` | `getThisWeek` |
| `POST /mesocycles/{id}/schedule/skip` | `skipUpcomingWorkout` |
| `POST /mesocycles/{id}/schedule/move` | `rescheduleWorkout` |

A replay answers success or `unchanged`. A stale week answers 409.

**Unchanged:** no existing route file changed. There is no removed or renamed field, no new version, and no new error code. The minimum app version is unchanged. Shared contracts are additions only: new types in `contracts/goals.ts`, `contracts/exercise-history.ts`, and `contracts/schedule.ts`.

### `apps/mobile`

- The 21i screens and the OVE-241 week strip are in the repository, but **nothing builds or publishes them to Production**.
- The app's config refuses every environment except staging, and the EAS project has one channel, `staging`.

### Not changed

- **No schema change and no migration.** The diff touches nothing under `apps/web/prisma`. Goals, `ApiIdempotencyKey`, and `schedule_moves` already exist in Production; `schedule_moves` came with OVE-240's `9s`.
- **No new environment variable.** No `.env*`, `next.config`, or `vercel.json` change, and no new `process.env` read.
- **No new dependency or native module.** No `package.json` or lockfile change. The runtime is still `f98506f78a`.
- **No change to the engine, thresholds, e1RM, goal progress, or entitlements.**
- **Goal writes** go only through `createGoal`, `archiveGoal`, and `acknowledgeGoalCompletion`. Completion runs only through the reconcile engine. The guard tests now name the mobile goal adapter and the goal view.
- **History** is read-only. No `LoggedSet` writes and no baseline writes.
- **Scheduling** writes only through the OVE-240 modules. The authored plan is never written.
- **Deferred by decision** (spec RD-6, RD-8), not in this release:
  - on the phone, the web's Weight trend view and RIR-projection overlay
  - the web Today goals block

## 2. Verification on the release tree (2026-11-24, this branch)

| Check | Result |
| --- | --- |
| `npm run format:check`, `npm run lint`, `npm run typecheck` | pass. Lint: 0 errors, 1 warning that was already there (`history-week.ts`). Typecheck: 0 errors |
| `npm test` | web unit 2,772, mobile 556: all passed |
| `npm run verify:workspaces` | 23 passed |
| `npm run test:integration` | **1,569 passed, 112 suites.** Covers isolation (every new endpoint through the auth, suspension, and version matrix, plus cross-account cases), goal create idempotency (replay, key reuse 409, the duplicate race), reconciliation, Free/Pro gating of exercise history, corrections, scheduling (skip, Train today, swap, rest-day swap, stale 409, missed-day block), the engine, the workout lock, and the dev test-account profiles |
| Production build (placeholder env, clean `.next`) and `verify:client-bundle` | pass; no server secret in `.next/static` |
| iOS bundle export | 1,484 modules; no secret pattern in the bundle |
| Runtime fingerprint | `f98506f78a`, unchanged |
| Release diff against `main` | 82 files, all under `apps/`, `packages/shared`, `docs/`, and `CLAUDE.md`. No migration or Prisma file, no `.env`, no package or lockfile change, no native or EAS config, no new `process.env` read, no secret pattern. Routes and contracts are additions only |
| Independent read-only release review | no blocking finding: scope clean, data and environment untouched, backward compatible, security invariants hold, tree equal to `staging` |
| Staging, same tree | Deployment for `112737c` succeeded. Staging API 30/30 (21i runbook §7). Staging update `4e76746e`: owner iPhone acceptance 5/5 |

## 3. Production smoke plan (non-destructive, no accounts created)

1. The Production deployment for the release commit is Ready on `www.overloadtraining.app`.
2. Public pages answer 200: `/`, `/login`, `/pricing`, `/changelog`.
3. `GET /api/mobile/v1/app-config` answers 200, with the same minimum version as before.
4. Without a token, the 11 new endpoint methods and the existing `GET /today` answer 401 `unauthorized` with the API's JSON envelope.
5. The version gate is intact: without the version header the API answers 400 `validation_error`, and below the minimum version it answers 426 (if the minimum allows testing that).
6. Runtime logs show no new 5xx errors.

## 4. Rollback

Revert the release's squash commit on `main` with a PR (`git revert <merge>`), then merge it.

- **Database:** nothing to undo. There is no migration.
- **Data:** goals created through the new endpoints are ordinary goals, which the web already reads and archives. Schedule changes are ordinary OVE-240 rows that the web already reads.
- **Apps:** no released app calls the new endpoints, because no Production native build exists.

## 5. Owner checks after release

None required. The functional behavior was accepted on the iPhone against staging (5/5), and there is no Production device check, because no Production build exists.

## 6. Results (2026-11-24)

Filled in at release.
