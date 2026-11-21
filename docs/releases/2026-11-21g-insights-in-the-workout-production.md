# Release record: Pitch 21g — Insights in the Workout (to Production)

**Release branch:** `release/21g-insights-in-the-workout`, cut from `main` at `c15020e` (the Pitch 21f release).

**Content:** nine cherry-picks from `staging`, in order, plus this record:

| Staging commit | PR | What |
| --- | --- | --- |
| `ccba58a` | #278 | Docs: the 21f closeout. Docs only; merged into `staging` after the 21f release |
| `4e33392` | #279 | Pitch 21g: OVE-224..227 plus review fixes #284 |
| `bb4b59c` | #285 | Docs: the 21g staging delivery record |
| `c427990` | #286 | OVE-228: earlier days' unfinished workouts stay on Today (web and iPhone) |
| `9c155c0` | #287 | OVE-229: the weight box says when it holds last time's weight; "Use 185 lb" |
| `9a93b5a` | #288 | OVE-230: parity corrections (iPhone Today calls, web not-enough-history line, web deload banner) and the parity matrix |
| `10cceff` | #289 | OVE-231: test-account profiles for the corrections; `CLAUDE.md` status |
| `f7c2c74` | #290 | Review fixes for the corrections |
| `a09995a` | (sync branch) | Docs: the 21f Production record's deployment section, written on the 21f sync branch, which `main` never received |

**Why this is exactly 21g:**

- `staging` at the last sync (`6f42ec8`) had `main`'s tree, apart from the 21f record's deployment section.
- These commits are everything on `staging` after that sync, plus that section.
- Apart from this record, the release tree is byte-identical to `staging` at `f7c2c74`. That is the tree verified on staging and published as staging update `08c1124c`.

**Owner authorization (2026-11-21):** the owner explicitly authorized:
- the final corrections and the parity audit;
- this release, and its merge into `main`;
- the Production web deployment it triggers, and non-destructive verification;
- synchronizing `main` back into `staging`.

It does not cover a migration, a Production configuration change, live Stripe, a Production Expo update, or a TestFlight or App Store build.

## 1. What Production gains

### Web (everyone)

- **Unfinished workouts from earlier days (OVE-228).**
  - Today lists them in every state, five at most, then "N more are in History". Each has **Resume**, which opens the original workout with its original date, gym, and sets.
  - Starting another workout first asks: Resume it, or start anyway.
  - Nothing is forbidden, nothing is stored, and the missed-day rules are unchanged.
- **Weight box vs the call (OVE-229).**
  - Under a call that asks for a change, a box still holding last time's weight reads "last time's weight, not adjusted".
  - **Use 185 lb** fills only the unsaved box, and only with the server's number (Pro). It never saves.
- **Parity (OVE-230).**
  - The workout card shows the server's "Not enough history yet: N of M complete sessions." line.
  - The workout runner shows the scheduled-deload banner.

### Mobile API (additive; older app versions unaffected)

- **`OccurrenceProgressionDto.insufficientNote`.** Kept on Free accounts: it's the lifter's own data count, never a call.
- **`TodayDto.unfinishedWorkouts`.** Included in the core fields too.
- **No new endpoint, version, or error code.** The minimum app version is unchanged.

### `apps/mobile`

- The 21g screens are in the repository, but **nothing builds or publishes them to Production**.
- The app's config refuses every environment except staging, and the EAS project has one channel, `staging`.

### Not changed

- **No schema change and no migration.**
- **No new environment variable.**
- **No new dependency or native module.** The runtime is still `f98506f78a`.
- **No engine, threshold, e1RM, or entitlement change.** Logged sets are still written only through `logged-sets.ts`, and the OVE-220 workout lock is intact.

## 2. Verification on the release tree

Recorded in §6 after the run's checks on this branch.

## 3. Production smoke plan (non-destructive, no accounts created)

1. The Production deployment for the release commit is Ready on `www.overloadtraining.app`.
2. Public pages answer 200: `/`, `/login`, `/pricing`.
3. `GET /api/mobile/v1/app-config` answers 200, with the same minimum version as before.
4. Without a token, `GET /api/mobile/v1/today` and `/workouts/x` answer 401 `unauthorized`.
5. Below the minimum version, the mobile API answers 426 `upgrade_required`.
6. Runtime logs: check for no new 5xx errors.

## 4. Rollback

Revert the release's squash commit on `main` with a PR, `git revert <merge>`, then merge it.

- Nothing needs to be undone in the database: there's no migration and no stored state.
- The mobile API change is additive, so apps keep working on the reverted server. Today simply stops listing unfinished workouts.

## 5. Owner checks after release

See the 21g runbook §11.

## 6. Results

Filled in as the run completes.
