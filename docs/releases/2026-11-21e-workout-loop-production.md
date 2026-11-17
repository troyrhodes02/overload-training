# Release record: Pitch 21e — Workout Loop (to Production)

**Release branch:** `release/21e-workout-loop`, cut from `main` at `8e71d35` (the Prescription-Aware Intelligence release).

**Content:** eight cherry-picks from `staging`, in order, plus this record:

| Staging commit | PR | What |
| --- | --- | --- |
| `98c40be` | #237 | The feature (OVE-198..212) |
| `04e5cc5` | #254 | The staging update publisher runs EAS through `npx` |
| `41c9c4f` | #255 | Docs: Checkpoint C, staging update published |
| `6c1020b` | #256 | OVE-213: keypad bar on every set input, active set above the keyboard, one-line Next |
| `ef89a69` | #257 | Docs: the OVE-213 staging update |
| `51d67f9` | #258 | OVE-214: set inputs take taps after moving between exercises; Done on the keypad bar |
| `ff40577` | #259 | Docs: the OVE-214 staging update |
| `6199580` | #260 | Docs: owner acceptance of Checkpoint B |

**Why this is exactly 21e:**

- `staging` at the last sync (`7d58c3a`, #236) was byte-identical to `main` at `8e71d35`.
- These eight commits are everything on `staging` after that sync.
- Apart from this record, the release tree is byte-identical to `staging` at `6199580`.
- That is the code the owner accepted on the iPhone: staging update `9c735545` came from `51d67f9`, and the commits after it are docs only.

**Owner authorization (2026-11-16):** the owner explicitly authorized the complete Production promotion of Pitch 21e. That covers merging this release into `main`, the Production web deployment it triggers, verifying it, and synchronizing `main` back into `staging`. It does not cover a migration, a Production configuration change, a Production Expo update, or a TestFlight or App Store build.

## 1. What Production gains

### Web API: seven new endpoints

The new endpoints sit under `/api/mobile/v1`, on the 21c pipeline: bearer token verified on the server, account-scoped, version gate.

| Endpoint | Calls the web's own |
| --- | --- |
| `POST /workouts` | `startOrResumeWorkout` |
| `GET /workouts/{id}` | Workout view |
| `PUT /logged-exercises/{id}/sets/{n}` | `logSet`, through `logged-sets.ts` |
| `POST /workouts/{id}/complete` | Completion |
| `GET /history`, `GET /history/{id}` | All-time history |
| `PUT /mesocycles/{id}/missed-days/{date}` | `resolveMissedDay` |

- No second engine, no separate mobile records, and nothing derived is stored.
- Every endpoint is in the cross-account isolation suite.

### Changes to existing behavior

- **`?fields=core`:** `GET /today`, `GET /workouts/{id}`, and `GET /history/{id}` accept an optional `?fields=core` (RD-28). With it, the server skips progression calls, summaries, and goals. Without it, or with any other value, the answer is unchanged. It only leaves data out, never adds Pro data.
- **Set saving, `logged-sets.ts` (OVE-212):** two reads are skipped, with no change in behavior:
  - The replay row is fetched only when that set number already exists. A concurrent first insert still hits the unique key, and `logSet`'s retry answers it like a replay.
  - The baseline step runs only for gym-variable exercises, still inside the set's transaction. For any other exercise, `applyBaselineOnCompletion` had already returned without writing.
  - The set is still stored exactly as entered and confirmed by the server. These paths are pinned by the logging and history-integrity integration suites.
- **Web CSS:** a `--attention` color variable that no web screen uses yet.
- **Shared package:** additive response types, plus the new `status-colors.ts`.
- **Web UI:** no visible change, so there is no release note.

### `apps/mobile`

- The iPhone app's 21e screens ship in the repository, but **nothing builds or publishes them to Production**.
- The app's config refuses every environment except staging, and the EAS project has a single channel, `staging`.
- No Production Expo update, TestFlight upload, or App Store submission comes from this release. App Store distribution stays deferred to Pitch 21l, and those steps are the owner's.

## 2. Production migrations

**None.** The release diff has no change under `apps/web/prisma`. The new endpoints use existing tables through existing modules.

## 3. Production environment (Vercel)

**No variable is added or changed.** The release diff adds no `process.env`, `NEXT_PUBLIC_`, or `EXPO_PUBLIC_` reference. It changes no `package.json`, lockfile, `next.config`, `vercel` config, `eas.json`, or `app.config`. The version gate keeps its current values: `MOBILE_MIN_APP_VERSION`, `MOBILE_LATEST_APP_VERSION`, and `MOBILE_MAINTENANCE` stay unset.

## 4. Compatibility

- **Mobile clients in the wild:** none on Production; the only installed build is the staging development build.
  - Every API change is additive.
  - Existing endpoints answer exactly as before unless `?fields=core` is sent.
  - The version gate is unchanged.
  - No new native build is needed: the iOS runtime fingerprint is still `f98506f78a`, the same as the installed build.
- **Web:** the web pages call none of the new code paths. `getTodayView` and the workout view take new options that default to the old behavior.
- **Rollback:** promote the previous Production deployment (`8e71d35`) in Vercel, or revert the merge commit on `main` through a PR. There is no schema or configuration change to undo, and sets logged through the new endpoints are ordinary `LoggedSet` rows.

## 5. Release gates (run on `release/21e-workout-loop`)

All were run on 2026-11-16.

| Gate | Result |
| --- | --- |
| Lint (every workspace, plus `scripts`) | Pass. 0 errors, 1 warning: the existing unused `_last` |
| Typecheck (every workspace) | Pass |
| Format (`prettier --check .`) | Pass |
| Web unit (including the account-isolation guards, the mobile API pipeline, the version gate, the error shape, and the contract tests) | 162 suites, 2,677 tests: pass |
| Mobile Jest (including the keypad, navigation, and Done regressions) | 26 suites, 247 tests: pass |
| Workspace boundaries (`verify:workspaces`) | Pass |
| Web integration, on a throwaway local Postgres | 102 suites, 1,174 tests: pass. Includes: the cross-account isolation suite with `mobile-api` and `mobile-idempotency`, `mobile-workout-loop`, `mobile-missed-day`, `logging`, `logging-correctness`, `history-integrity`, and `demo-seed` |
| Production build (`next build`) | Pass. Every new `/api/mobile/v1` route is dynamic (ƒ) |
| Client-bundle secret scan (`verify:client-bundle`) | Pass. No server database secret in `.next/static` |
| iOS bundle (`expo export --platform ios`) | Pass |
| iOS runtime fingerprint (`expo-updates fingerprint:generate`) | `f98506f78a`, unchanged |
| Release diff | No `prisma` change; no new environment reference; no dependency or config file; no secret pattern |

## 6. Staging acceptance (owner, 2026-11-15 to 2026-11-16)

Pitch 21e runbook §5 has the full record.

- **Checkpoint A, Simulator against a local API on overload-dev:** passed in round 3.
  - The full loop, the summary, Today and History in step after Finish (the earlier Resume bug was fixed), faster screens, and all three missed-day actions.
  - The merge into staging was approved.
- **Checkpoint C, staging update:** published three times through the publisher, which checks the build, runtime, and channel. The last was `9c735545` from `51d67f9`, on runtime `f98506f78a`.
- **Checkpoint B, physical iPhone:** functional acceptance passed on the first run. The two usability fixes (OVE-213) and the navigation regression fix (OVE-214) were then retested: B10–B14 and B16–B23 passed. **Accepted.**

## 7. Production verification (after the deploy)

These checks are non-destructive: no request writes data, and no account is created. Run them against `https://www.overloadtraining.app` (the apex domain redirects there).

Before the release:
- `GET /api/mobile/v1/app-config` answered 200.
- `GET /today` without a token answered 401.
- `POST /workouts` and `GET /history` answered 404, because the routes didn't exist yet.

| # | Check | Expected |
| --- | --- | --- |
| P1 | The Vercel Production deployment for the merge commit | Ready |
| P2 | `GET /api/mobile/v1/app-config` | 200, same body as before (min and latest `0.0.0`, maintenance off) |
| P3 | Each new endpoint, without a token | 401 `unauthorized`, which shows the route exists and requires auth |
| P4 | `GET /today` and `GET /today?fields=core`, without a token | 401, as before |
| P5 | The public pages and `/login` | 200 |
| P6 | Vercel runtime logs after the deploy | No new errors |

The run holds no Production credentials, so the signed-in checks are the owner's. On the web, as yourself: Today and History read as before, and the next time you train, logging works as usual.

## 8. After the release

`main` is synchronized back into `staging` with a normal merge commit through a PR, the same procedure as #236.
