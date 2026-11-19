# Release record: Pitch 21f — Logging Completeness (to Production)

**Release branch:** `release/21f-logging-completeness`, cut from `main` at `630d795` (the Pitch 21e release).

**Content:** seven cherry-picks from `staging`, in order, plus this record:

| Staging commit | PR | What |
| --- | --- | --- |
| `8018fac` | #263 | Docs: the Pitch 21e closeout (release record and runbook). Docs only; it was merged into `staging` after the 21e release |
| `ad91193` | #264 | The feature (OVE-215..219), with the review fixes from #270 |
| `9625da4` | #272 | OVE-221: plan builder on a phone — Replace and Remove reachable |
| `11315d5` | #273 | OVE-222: iPhone text fields — no clipped letters while focused |
| `a05dea7` | #274 | OVE-223: planned cardio counts from its creation day in the account's timezone |
| `9ca6dc3` | #271 | OVE-220: one row lock serializes a workout's writes |
| `8e61073` | #275 | Docs: the runbook's verification record and owner checks, the RD-28 correction |

**Why this is exactly 21f:**

- `staging` at the last sync (`85771cd`, #262) had the same tree as `main` at `630d795`.
- These seven commits are everything on `staging` after that sync.
- Apart from this record, the release tree is byte-identical to `staging` at `8e61073`.
- The 21f features are the code the owner tested on the iPhone. The four fixes were verified by the run on `overload-dev` (§6).

**Owner authorization (2026-11-18):** the owner explicitly authorized the 21f Production release. That covers the fixes, merging this release into `main`, the Production web deployment it triggers, read-only verification, and synchronizing `main` back into `staging`. It does not cover a migration, a Production configuration change, a Production Expo update, or a TestFlight or App Store build.

## 1. What Production gains

### Web API: eight new endpoints

They sit under `/api/mobile/v1`, on the 21c pipeline: bearer token verified on the server, account-scoped, and behind the version gate.

| Endpoint | Calls the web's own |
| --- | --- |
| `PUT /workouts/{id}/gym` | `changeGym` |
| `GET /logged-exercises/{id}/swap-candidates` | `getSwapContext` |
| `PUT /logged-exercises/{id}/exercise` | `swapExercise` |
| `PUT /logged-exercises/{id}/skipped` | `setExerciseSkipped` |
| `PATCH /sets/{id}` | `editLoggedSet`, through `logged-sets.ts` |
| `PATCH /logged-exercises/{id}/planned-sets` | `editPlannedSets` |
| `PUT /mesocycles/{id}/cardio-logs/{date}` | `logCardio` |
| `PATCH /cardio-logs/{id}` | `editCardioLog` |

- No second engine, no separate mobile records, and nothing derived is stored.
- Every endpoint is in the cross-account isolation suite.

### Changes to existing behavior (web and phone)

- **Workout writes are serialized (OVE-220).** Seven writes take one row lock on the workout (`FOR NO KEY UPDATE`) before their checks: `logSet`, `swapExercise`, `setExerciseSkipped`, `changeGym`, resume in `startOrResumeWorkout`, `editPlannedSets`, and `completeWorkout`.
  - Two requests for the same workout now run one after the other. A set is always stored against the exercise, gym, and open workout it was performed in.
  - In the ordinary case nothing changes, apart from one extra statement per workout per transaction.
  - A static guard keeps every workout write on the lock.
- **Marking an exercise not done twice keeps the first time** (21f RD-3).
- **Planned cardio counts from its creation day in the account's timezone (OVE-223).** It used the UTC date. Cardio added on a US evening now shows that day. No stored value changes, and a cardio log always shows.
- **Plan builder on a phone (OVE-221).** On a touch screen, the exercise dialog opens without focusing a field, so the keyboard doesn't cover Replace exercise and Remove from session. The dialog also scrolls within the screen. Desktop is unchanged.
- **Shared package:** additive response types only.

### `apps/mobile`

- The iPhone app's 21f screens and the text-field fix (OVE-222) are in the repository, but **nothing builds or publishes them to Production**.
- The app's config refuses every environment except staging, and the EAS project has one channel, `staging`.

## 2. Production migrations

**None.** The release diff has no change under `apps/web/prisma`. The lock uses an existing row.

## 3. Production environment (Vercel)

**No variable is added or changed.**

- The release diff adds no `process.env`, `NEXT_PUBLIC_`, or `EXPO_PUBLIC_` reference read by the web app.
- It changes no lockfile, `next.config`, `vercel` config, `eas.json`, or `app.config`.
- The version gate keeps its values: `MOBILE_MIN_APP_VERSION`, `MOBILE_LATEST_APP_VERSION`, and `MOBILE_MAINTENANCE` stay unset.
- The `dev:test-account` script added to `package.json` is development-only. It refuses Production with no override.

## 4. Compatibility

- **Mobile clients in the wild:** none on Production. The only installed build is the staging development build, on runtime `f98506f78a`.
  - Every API change is additive.
  - Existing endpoints answer exactly as before.
  - The version gate is unchanged.
- **Web:** pages call the same modules. The lock and the cardio floor apply to web and phone alike.
- **Existing data:** no record is rewritten. Sets, workouts, and cardio logs read the same.
- **Rollback:** promote the previous Production deployment (`630d795`) in Vercel, or revert the merge commit on `main` through a PR. There is no schema or configuration change to undo.

## 5. Release gates (run on `release/21f-logging-completeness`)

All were run on 2026-11-18 on the release branch at `3cc47be` (tree `d1533ec`, byte-identical to `staging` at `8e61073`).

| Gate | Result |
| --- | --- |
| Lint (every workspace, plus `scripts`) | Pass. 0 errors, 1 warning: the existing unused `_last` |
| Typecheck (every workspace) | Pass |
| Format (`prettier --check .`) | Pass |
| Web unit, including the account-isolation guards, the new workout-lock guard, the mobile API pipeline, the version gate, and the contract tests | 165 suites, 2,707 tests: pass |
| Mobile Jest | 32 suites, 375 tests: pass |
| Workspace boundaries | 23 checks: pass |
| Web integration, on a throwaway local Postgres | 105 suites, 1,286 tests: pass. Includes the cross-account isolation suite with every 21f endpoint, `mobile-logging-completeness`, `workout-write-serialization`, `cardio-floor-timezone`, `logging`, `logging-correctness`, `history-integrity`, and `demo-seed` (within its OVE-212 budget) |
| Production build (`next build`) | Pass |
| Client-bundle secret scan | Pass. No server database secret in `.next/static` |
| iOS bundle (`expo export --platform ios`) | Pass |
| iOS runtime fingerprint | `f98506f78a`, unchanged |
| Release diff | No `prisma` change. No new environment reference in app code. No dependency, lockfile, or config change; `package.json` gains only the development-only `dev:test-account` script. No secret pattern |

## 6. Staging acceptance

- **Owner, physical iPhone (2026-11-17 to 2026-11-18):** the owner confirmed these on the staging update:
  - Gym selection, gym-specific machine history, and the gym locking once sets are saved.
  - Swapping and skipping an exercise.
  - Optional RIR: entering, editing, and clearing it.
  - Editing sets of a finished workout.
  - Extra sets, and reducing planned sets.
  - Bodyweight lifts and fixed rep targets.
  - Cardio logging, matching on the staging web.
  - Missed-day handling.
  - Network failure and retry.
  - Force-close and resume.
- **Not confirmed by the owner:** the accessibility checks (runbook §4, check 23), the isolation check on the phone (22), and the OVE-222 text-field fix. The fix is published to staging and is for the owner to check (runbook §8).
- **Fixes, verified by the run on `overload-dev` (2026-11-18)** with a local production build of `staging` at `9ca6dc3`, real-shaped disposable accounts, and real requests:
  - **OVE-220** (`21f-rel-ove220@example.com`), real concurrent requests through the mobile API:
    - Skip and first set sent together: 6 races, never both accepted.
    - No exercise both not done and holding a set.
    - Two sets sent together both saved.
    - A retried set answered 200 and added nothing.
    - Finish and a set sent together: the late set was refused. 6 of 6 passed.
  - **OVE-221** (`21f-rel-plan@example.com`), Chrome at 390 × 844 with touch:
    - The dialog opened with no field focused, and Replace and Remove were in view.
    - At 390 × 420 the dialog scrolled to Remove.
    - Cancel changed nothing. Replace swapped the exercise in place. Remove took out only that exercise.
    - Desktop still focused Sets. 12 of 12 passed. A physical phone was **not** used.
  - **OVE-223** (`21f-rel-cardio@example.com`), Wednesday evening in Chicago, Thursday in UTC:
    - Cardio added for Wednesday through the plan UI showed on Today, pending.
    - It was logged for Wednesday (200) and showed as done. 5 of 5 passed.
- **Staging update:** group `edc93cdd-cf33-4e43-a3b6-116c84422137` (iOS `01a1f13e-7998-75ab-bec6-e095110ba2c7`) from `9ca6dc3`, runtime `f98506f78a`, channel `staging`. The publisher found 1 development build that can receive it.

## 7. Production verification (after the deploy)

Non-destructive: no request writes data and no account is created. Run against `https://www.overloadtraining.app`.

| # | Check | Expected |
| --- | --- | --- |
| P1 | The Vercel Production deployment for the merge commit | Ready, aliased to `www.overloadtraining.app` |
| P2 | `GET /api/mobile/v1/app-config` | 200, same body as before (min and latest `0.0.0`, maintenance off) |
| P3 | Each new endpoint, without a token | 401 `unauthorized` (the route exists and requires auth) |
| P4 | 21e endpoints (`/today`, `/history`, `POST /workouts`), without a token | 401, as before |
| P5 | The public pages and `/login` | 200 |
| P6 | Vercel runtime logs after the deploy | No new errors |

The run holds no Production credentials, so the signed-in checks are the owner's (runbook §8).

Before the release (2026-11-18): `app-config` answered 200; `GET /today` and `GET /history` answered 401 without a token; the new endpoints answered 404, because they didn't exist yet.

### Result

Recorded on 2026-11-18, after the deploy.

- **Merged:** #276 was squash-merged into `main` as `c15020e`.
- **P1:** Vercel Production deployment `dpl_2sRCqLZ7dSuFy9J7s79oEysrGeb2` (`overload-training-7u3tx1p4d…vercel.app`) is **Ready**, aliased to `www.overloadtraining.app`.
- **P2:** `app-config` answered 200 with the same body as before.
- **P3:** all eight new endpoints answered 401 `unauthorized` without a token (404 before the release). `PATCH /sets/{id}` with an invalid bearer token also answered 401.
- **P4:** `/today`, `/today?fields=core`, `/history`, and `POST /workouts` answered 401, as before.
- **P5:** `/`, `/login`, `/signup`, `/pricing`, and `/forgot-password` answered 200. Signed out, `/plan` redirects to `/login`.
- **P6: unverified.** `vercel logs` for the new deployment returned 0 records, although the smoke requests above had just reached it. This is the same limitation as the 21e release, so it can't confirm the logs either way. None of the smoke responses was a 5xx. Check Vercel → Logs in the dashboard.
- **Owner's checks, not yet done:** signed-in Production checks, runbook §8: the plan builder on a phone, Today, History, existing workouts, logging, and the logs.
- **Not performed:** no migration, no environment or credential change, no Production Expo update, no native build, and no TestFlight.

## 8. After the release

`main` was synchronized back into `staging` with a normal merge commit, the same procedure as #262. The sync PR and the `staging` result are recorded in the pitch runbook §7.
