# Release record: Pitch 21k — Native Tour (to Production)

**Release branch:** `release/21k-native-tour`, cut from `main` at `1826803` (the 21j release).

**Content:** three cherry-picks from `staging`, in order, plus this record.

| Staging commit | PR | What |
| --- | --- | --- |
| `6fb189d` | #334 | Docs only: the 21j closeout (CLAUDE.md status, the 21j runbook closeout, the 21j release record's results). It was merged into `staging` after the 21j release and never into `main`, as 21i's closeout (#318) was carried by the 21j release. |
| `04799cd` | #335 | Pitch 21k — Native Tour: the pitch, design, spec, and runbook. Tickets OVE-256 (#336), OVE-257 (#337), OVE-258 (#338), and OVE-259 (#339), and the independent-review fixes (#340), squashed into the feature branch's one merge. |
| `181dd28` | #341 | Docs: the staging delivery record (update `ad04a02b`) and the 21l handoff note |

**Why this is exactly 21k:**
- `staging` at the last sync (`58e3c5c`, #333) held `main`'s tree exactly.
- These three commits are everything `staging` gained after that sync.
- Apart from this record, the release tree is **byte-identical to `staging` at `181dd28`**. Its code is identical to `04799cd`, which was published as staging update `ad04a02b` and accepted on the iPhone.

**Owner acceptance and authorization (2026-11-26):**
- The owner tested 21k on a physical iPhone against staging and passed both scenarios (21k runbook §3):
  1. **Complete the tour.** More → Updates & help → Take a tour, the intro card, Start tour, Next through all nine steps with the rings on the right controls and readable text, then Done. The app returned to normal navigation with no overlay left.
  2. **Skip and replay.** Take a tour again, Start tour, Next a few steps, Skip tour, normal navigation, then Take a tour once more and Not now. No overlay or blocked control was left.
- Accepted staging update: group `ad04a02b-95e3-4203-90d3-c8df40c2ebc3`, iOS update `01a215e7-4dbe-756c-b28f-45b2299097f3`, commit `04799cd`, runtime `2e4a65d9cda7675d9e8a7f1725dcc6b64468ac6c`, development build `c22ac9a0`.
- The owner explicitly authorized:
  - this release, and its merge into `main`;
  - the Production web deployment it triggers, and non-destructive verification;
  - synchronizing `main` back into `staging`.
- That authorization does not cover a Production Expo update, a TestFlight build, a Production-connected native build, an App Store submission, or setting `MOBILE_TOUR_AUTO_START`.

## 1. What Production gains

### Web (everyone)

There is no visible web change. One sentence of the web tour moved into the shared package:

- `src/lib/tour/steps.ts` now imports the logging step's no-Start body (`TOUR_LOGGING_NO_START_BODY`) from `@overload/shared/tour/content`. The words are unchanged, and `tests/unit/tour-native-copy.test.ts` pins them.
- The web tour, its progress record, and its auto-start rule are unchanged.

### Mobile API (additive; older app versions unaffected)

Two new endpoint methods. Both go through `mobileRoute` (token verified with `getUser`, 401, 403 suspended, version gate), act on the token's own `TourProgress` row through the existing `src/lib/tour/progress.ts`, and are Free.

| Endpoint | What it does |
| --- | --- |
| `PUT /api/mobile/v1/me/tour/outcome` | Body `{ outcome: "completed" \| "skipped" }`. Records the outcome with the web's own `recordTourOutcome` (the latest outcome wins, Pitch 11 R7). A repeat answers the same. Any other outcome is 400 `validation_error` |
| `POST /api/mobile/v1/me/tour/offered` | Spends the account's offer with the web's own `markTourOffered` (R8). `spent` is true only when this call stamped it. Never changes an outcome and never makes the tour due again |

`GET /app-config` gains `tourAutoStart` (boolean). It is `true` only when the server's `MOBILE_TOUR_AUTO_START` is exactly `true`. **That variable is not set on Production or Preview**, so Production answers `false`. An older app ignores the field.

**Unchanged:** no removed or renamed field, no new API version, no new error code. The minimum app version is unchanged.

### `apps/mobile`

- The 21k tour (`src/tour/`), its anchors on Today, Plan, History, Goals, and More, and the More → Take a tour row are in the repository, but **nothing builds or publishes them to Production**.
- The app's config refuses every environment except staging, and the EAS project has one channel, `staging`.
- No new dependency and no native change: the runtime fingerprint stays `2e4a65d9cda7675d9e8a7f1725dcc6b64468ac6c`.

### Not changed

- **No schema change and no migration.** The diff touches nothing under `apps/web/prisma`. `TourProgress` already exists in Production.
- **No environment change.** The one new `process.env` read is `MOBILE_TOUR_AUTO_START`, which is unset, so the gate is off. `.env.example` only documents it (commented out). No `next.config`, `vercel.json`, `eas.json`, or app-config change.
- **No change to training data paths, the engine, entitlements, billing, Stripe, or the webhooks.** The tour writes only its own `TourProgress` outcome and offer time.
- **What's New:** no new release note (21k RD-N). Pitch 21l adds the first "Overload on iPhone" entry with TestFlight.

## 2. Verification on the release tree (2026-11-26, this branch)

| Check | Result |
| --- | --- |
| `npm run format:check`, `npm run lint`, `npm run typecheck` | pass. Lint: 0 errors, 1 warning that was already there (`history-week.ts`). Typecheck: 0 errors |
| `npm test` | web unit 2,784 (174 suites), mobile 719 (58 suites): all passed. Workspace boundaries pass |
| `npm run test:integration` | **1,690 passed, 116 suites.** Covers isolation (both new endpoints through the auth, suspension, and version matrix, plus cross-account cases), the outcome and offer semantics (latest outcome wins, a repeat is safe, a bad outcome is 400, the offer never re-arms the tour, a replay never makes it due again), and `app-config`'s `tourAutoStart` |
| Production build (clean `.next`) and `verify:client-bundle` | pass; no server secret in `.next/static` |
| iOS bundle export | pass; no secret pattern and none of the local server secret values in the bundle |
| Runtime fingerprint | `2e4a65d9cda7675d9e8a7f1725dcc6b64468ac6c`, equal to development build `c22ac9a0` |
| Release diff against `main` | 49 files (plus this record), all under `apps/`, `packages/shared`, `docs/`, and `CLAUDE.md`. No migration or Prisma file, no lockfile or `package.json`, no Vercel, Next, or EAS config change. `.env.example` gains a comment only. No secret pattern. Routes and contracts are additions only |
| Vercel environment (names only) | No `MOBILE_*` variable on Production or Preview |
| Independent read-only release review | **Release-ready; no blocking finding.** The tree equals `staging`. Identity comes only from `mobileRoute`: the outcome handler reads only `body.outcome`, and the offer handler reads no body. Both call the unchanged `recordTourOutcome` and `markTourOffered`, which write only the token's own row. The isolation suite covers both: B sends A's `userId` in the body, A's row is unchanged, and B's answer never contains A's id. The gate is false unless `MOBILE_TOUR_AUTO_START` is exactly `true`, a unit test pins `"TRUE"`, `"1"`, `"yes"`, `""`, `"false"`, and `" true"` as false, and the app's only automatic start requires `tourAutoStart === true`. The API changes are additions only. The web words are moved, not changed. The tour makes no network call except its two record calls, and the overlay blocks every touch. The diff holds no Prisma, lockfile, config, or secret change and no 21l work. Two non-blocking notes, below |
| Staging, same code | Staging API: `tourAutoStart: false`; both endpoints 401 without a token and 405 on GET; signed-in round trip passed. Owner iPhone acceptance 2/2 |

### Non-blocking review notes (not in this release)

1. **CLAUDE.md status.** After the merge, `main`'s status line still says 21k is on staging. The closeout updates it, as with earlier slices.
2. **What's New on the phone, for 21l** (21j behavior, unchanged here; `src/lib/views/me.ts`). `GET /me` holds back What's New while an account is still due its tour (21j RD-7). While the gate is off, an account that is due its tour gets no What's New sheet on the phone, and "Not now" on a manual tour doesn't change that because it records nothing. Finishing or skipping the tour does. It resolves itself once 21l turns the gate on, and is recorded in the 21l handoff.

## 3. Production smoke plan (non-destructive, no accounts created)

1. The Production deployment for the release commit is Ready on `www.overloadtraining.app`.
2. Public pages answer 200: `/`, `/login`, `/pricing`, `/changelog`, `/support`.
3. `GET /api/mobile/v1/app-config` answers 200 with **`tourAutoStart: false`** and the same minimum version as before (`0.0.0`).
4. Without a token, `PUT /me/tour/outcome`, `POST /me/tour/offered`, and the existing `GET /today` answer 401 `unauthorized` with the API's JSON envelope. Before the release, the two tour paths answered 404.
5. A GET on either tour path answers 405.
6. The version gate is intact: without the version header the API answers 400 `validation_error`.
7. Runtime logs show no new 5xx errors.

No Production tour outcome or offer is written: those paths were verified on staging and accepted on the iPhone.

**If `tourAutoStart` reads `true`:** that is a configuration incident. Remove `MOBILE_TOUR_AUTO_START` from Production (or set it to anything but `true`) and redeploy. No released app reads the field, since no Production native build exists.

## 4. Rollback

Revert the release's squash commit on `main` with a PR (`git revert <merge>`), then merge it.

- **Database:** nothing to undo. There is no migration.
- **Data:** a tour outcome written through the new endpoint is the same `TourProgress` field the web writes. Nothing else is written.
- **Apps:** no released app calls the new endpoints, because no Production native build exists.

## 5. Owner checks after release

None required. The behavior was accepted on the iPhone against staging, and there is no Production device check, because no Production build exists.

## 6. Results (2026-11-26)

| Step | Result |
| --- | --- |
| Release PR | #342, merged only after every check had passed (the Vercel preview completed). `main` has no branch protection or required review, so the independent review above was the review gate. Squash-merged as **`4aacae7`**. `main`'s tree equals the release branch |
| Production deployment | `dpl_9XfRoEUzkyf6mG5NkEvgef17YFPq`: **Ready**, target production, aliases `www.overloadtraining.app` and `overloadtraining.app`. GitHub status for `4aacae7`: success |
| Smoke 2 | `/`, `/login`, `/pricing`, `/changelog`, `/support`: 200 |
| Smoke 3 | `app-config` 200, **`tourAutoStart: false`**. Minimum and latest version `0.0.0`, unchanged. Maintenance off |
| Smoke 4 | `PUT /me/tour/outcome`, `POST /me/tour/offered`, and `GET /today`, without a token: 401 `unauthorized` with the JSON envelope. A bearer token that is not valid also gets 401. Before the release, the tour paths answered 404 |
| Smoke 5 | GET on either tour path: 405 |
| Smoke 6 | Without the version header: 400 `validation_error`. With a malformed one: 400. The minimum is `0.0.0`, so 426 can't be exercised |
| Smoke 7 | **Inconclusive.** `vercel logs`, production, last 30 minutes, `level:error`: 0 records. The same query for the new deployment with no filter also returned 0 records, although the smoke requests had just reached it. The CLI result shows nothing either way |
| Smoke total | 17 of 17 request checks passed. The log check is inconclusive |
| Migration and environment | None applied, none needed. No `MOBILE_*` variable on Production or Preview |
| Authenticated Production behavior | Not exercised. No Production account was created, and no tour outcome or offer was written. It was verified on staging (signed-in round trip) and accepted on the iPhone (2/2) |
| Sync | #343 merged `main` into `staging` with a merge commit (`2e73f6b`). `main` is an ancestor of `staging`, and the trees are equal. The staging deployment succeeded, and staging answers `tourAutoStart: false` |
| Not done (not authorized) | A Production Expo update, a TestFlight build, a Production-connected build, an App Store submission, setting `MOBILE_TOUR_AUTO_START`, and any Production environment change |
