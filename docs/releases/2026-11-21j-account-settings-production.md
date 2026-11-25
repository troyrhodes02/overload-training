# Release record: Pitch 21j — Account & Settings, with the OVE-254 screenshot correction (to Production)

**Release branch:** `release/21j-account-settings`, cut from `main` at `707f981` (the 21i and OVE-241 release).

**Content:** fourteen cherry-picks from `staging`, in order, plus this record.

| Staging commit | PR | What |
| --- | --- | --- |
| `8500786` | #318 | Docs only: the 21i closeout (CLAUDE.md status, the 21i runbook closeout, the 21i release record). It was merged into `staging` after the 21i release and never into `main`, as the 21h closeout was carried by the 21i release. |
| `f18fbbe` | #319 | Docs: the 21j pitch, design, and spec |
| `8774ddf` | #320 | OVE-247: account API — profile, plan, release notes, export, support address |
| `179698e` | #321 | OVE-248: deletion API — inventory and password-confirmed delete |
| `eeef542` | #322 | OVE-249: feedback API — shared submission, byte-checked screenshots, retry key |
| `4479821` | #323 | OVE-250: iPhone settings — More, Profile, Time zone, Plan & access, What's New, Help, Feedback |
| `bd61548` | #324 | OVE-251: iPhone export through the share sheet, and delete account |
| `370ca69` | #326 | Independent-review fixes: a half-closed deletion never reads as deleted; feedback cleanup; timeouts |
| `9727c2c` | #327 | OVE-253: the 21j runbook |
| `d0ab189` | #328 | Docs: Stage A delivery record (staging update `60bc96a8`) |
| `6d6e5fc` | #325 | OVE-252: the feedback screenshot (native picker, resize and re-encode) |
| `6e10f8a` | #329 | Docs: Stage B delivery record (staging update `93b8f51c`) |
| `f4a0888` | #330 | OVE-254: the screenshot part is encoded for `expo/fetch` |
| `9b4f095` | #331 | Docs: OVE-254 delivery record (staging update `5b3a5a39`) |

**Why this is exactly 21j:**
- `staging` at the last sync (`8abe95f`, #317) held `main`'s tree exactly.
- These commits are everything `staging` gained after that sync.
- Apart from this record, the release tree is **byte-identical to `staging` at `9b4f095`**. Its code is identical to `f4a0888`, which was published as staging update `5b3a5a39` and accepted on the iPhone.

**Owner acceptance and authorization (2026-11-25):**
- The owner tested 21j on a physical iPhone against staging and accepted all five scenarios (21j runbook §4):
  1. Profile, appearance, and What's New
  2. Feedback and help
  3. Plan & access, and export through the share sheet
  4. Delete account, with a disposable account
  5. Final regression
- **Feedback with a screenshot** first failed with "Couldn't send". OVE-254 found and fixed the cause:
  - Expo SDK 58's global `fetch` is `expo/fetch`. Its multipart encoder refuses a React Native `{ uri, name, type }` file part before anything is sent.
  - The app now appends `{ name, type, bytes() }`, which the encoder reads.
  - The owner retested the corrected update (group `5b3a5a39`, commit `f4a0888`, runtime `2e4a65d9…`, development build `c22ac9a0`). The staging database holds the send (metadata only): one feedback with text and one `image/jpeg` attachment of 157,301 bytes, stored 2026-11-25 19:05:20 UTC.
- The owner explicitly authorized:
  - this release, and its merge into `main`
  - the Production web deployment it triggers, and non-destructive verification
  - synchronizing `main` back into `staging`
- That authorization does not cover a Production Expo update, a TestFlight build, a Production-connected native build, or an App Store submission.

## 1. What Production gains

### Web (everyone)

There is no visible web change. Three refactors keep the web and the app on one code path:

- **Web feedback** (`src/app/(app)/feedback/actions.ts`) now calls the shared submission module, `src/lib/feedback/submission.ts`, which the mobile endpoint also uses. Its checks are the same: daily limit before upload, byte-sniffed type equal to the declared type, the size limits, and a private bucket.
- **The export route** names its file through `@overload/shared/accounts/export-file`. The export content is unchanged.
- **Account deletion** (`src/lib/accounts/deletion.ts`):
  - Closing the auth identity is now tried three times (250 ms, then 500 ms apart) before the account is reported half-closed.
  - The order is unchanged: Stripe cancellation first, then one scoped transaction, then Storage, then the identity.

### Mobile API (additive; older app versions unaffected)

Nine new endpoint methods. All go through `mobileRoute` (token verified with `getUser`, 401, 403 suspended, version gate) and are Free.

| Endpoint | What it does |
| --- | --- |
| `GET /me/profile`, `PUT /me/profile` | Read and edit the name, username, and time zone with the web's validation |
| `GET /me/plan` | Read-only plan and access, from the web's own Plan & Billing reader (`getBillingScreen`). No price, purchase, manage, or promo action, and no Stripe refetch |
| `GET /release-notes` | Every What's New entry, newest first |
| `POST /me/release-notes/seen` | Moves the seen point forward only; the same field the web uses |
| `GET /me/export` | The web's own exporter, for the token's account |
| `GET /me/deletion-inventory` | What deletion would remove (counts) |
| `POST /me/delete` | Password re-check, then the one deletion module |
| `POST /feedback` | The shared submission. Needs an `Idempotency-Key`; up to one screenshot |

`GET /app-config` gains `supportEmail` (string or null), from the existing `NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL`. An older app ignores the field.

**Unchanged:** no removed or renamed field, no new API version, no new error code. The minimum app version is unchanged.

### `apps/mobile`

- The 21j screens are in the repository, but **nothing builds or publishes them to Production**.
- The app's config refuses every environment except staging, and the EAS project has one channel, `staging`.
- Stage B added three Expo modules (`expo-file-system`, `expo-image-manipulator`, `expo-image-picker`), the photo-picker config plugin, and their lockfile entries. They change the native runtime to `2e4a65d9cda7675d9e8a7f1725dcc6b64468ac6c`. Only the staging development build `c22ac9a0` carries it.

### Not changed

- **No schema change and no migration.** The diff touches nothing under `apps/web/prisma`. `Feedback`, `FeedbackAttachment`, `ApiIdempotencyKey`, `ReleaseSeen`, and the `feedback-screenshots` bucket already exist in Production.
- **No new environment variable.** No `.env*`, `next.config`, `vercel.json`, or `eas.json` change. The one new `process.env` read is the existing public `NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL`.
- **No change to the engine, entitlements, billing, Stripe, or the webhooks.** OVE-122 (cancel Stripe before deleting) was already on `main` and is unchanged.
- **What's New:** no new release note (RD-6). Pitch 21l adds the first "Overload on iPhone" entry with TestFlight.

## 2. Verification on the release tree (2026-11-25, this branch)

| Check | Result |
| --- | --- |
| `npm run format:check`, `npm run lint`, `npm run typecheck` | pass. Lint: 0 errors, 1 warning that was already there (`history-week.ts`). Typecheck: 0 errors |
| `npm test` | web unit 2,780, mobile 614: all passed. Workspace boundaries pass |
| `npm run test:integration` | **1,670 passed, 115 suites.** Covers isolation (every new endpoint through the auth, suspension, and version matrix, plus cross-account cases), profile validation and username uniqueness, time zones, plan and access per state, the release-note seen point, export parity and isolation, deletion (password, Stripe cancellation first and its failure, identity retry and `identity_pending`, retry after deletion), and feedback (idempotency, key reuse 409, byte and size checks, daily limit before upload, ownership, cleanup) |
| Production build (clean `.next`) and `verify:client-bundle` | pass; no server secret in `.next/static` |
| iOS bundle export | 1,551 modules; no secret pattern in the bundle |
| Runtime fingerprint | `2e4a65d9cda7675d9e8a7f1725dcc6b64468ac6c`, equal to development build `c22ac9a0` |
| Release diff against `main` | 89 files, all under `apps/`, `packages/shared`, `docs/`, `CLAUDE.md`, and the lockfile. No migration or Prisma file, no `.env`, no Vercel, Next, or EAS config change, no secret pattern. Routes and contracts are additions only |
| Screenshot location data | The accepted staging attachment was inspected for its JPEG structure only (no pixels, no message text). Its Exif holds orientation, resolution, and pixel size only. **No GPS block, no XMP, no camera make or model** |
| Independent read-only release review | **Release-ready; no blocking finding.** Scope clean (tree equal to `staging`), no data or environment change, every new route on `mobileRoute` and in the isolation registry, contracts additive, deletion cancels Stripe first and never reports a half-closed account as deleted, export is the web's exporter, feedback byte-checks and cleans up, the app part is `{ name, type, bytes() }` and its test runs Expo's real encoder, no purchase path, no personal data in logs. Three non-blocking notes, below |
| Staging, same code | Staging API 19/19 (twice, Stage A). The deployed staging API took an Expo-encoded JPEG (201). Owner iPhone acceptance 5/5 and the screenshot retest |

### Non-blocking review notes (follow-ups, not in this release)

1. **iPhone, Delete account, Check again** (`apps/mobile/src/account/deletion-model.ts`): when the account is still present and has no training data, the app says its data was deleted but closing didn't finish. A half-closed account can't reach that branch (its token gets 401), so it only appears for an account with no data whose delete never reached the server. The account is intact and the lifter can delete again. App-only; no Production app exists. Tracked as OVE-255 (Backlog, low).
2. **iPhone, signed-in elsewhere during a web deletion** (`apps/mobile/src/app/_layout.tsx`): a `/me` 401 in the moment between the web's data transaction and its identity removal shows the "finish on the web" notice although the web finishes a moment later. Same follow-up.
3. **Doc comment** (`apps/web/src/lib/api/mobile/version.ts`): the comment listing the variables `mobileAppConfig` reads doesn't yet name the support address. Cosmetic.

## 3. Production smoke plan (non-destructive, no accounts created)

1. The Production deployment for the release commit is Ready on `www.overloadtraining.app`.
2. Public pages answer 200: `/`, `/login`, `/pricing`, `/changelog`, `/support`.
3. `GET /api/mobile/v1/app-config` answers 200, with the same minimum version as before, and `supportEmail` set (its value is not recorded).
4. Without a token, the 9 new endpoint methods and the existing `GET /today` answer 401 `unauthorized` with the API's JSON envelope.
5. The version gate is intact: without the version header the API answers 400 `validation_error`, and below the minimum version it answers 426 (if the minimum allows testing that).
6. Runtime logs show no new 5xx errors.

No Production feedback, screenshot, export, or deletion is made: those paths were verified on staging and accepted on the iPhone.

## 4. Rollback

Revert the release's squash commit on `main` with a PR (`git revert <merge>`), then merge it.

- **Database:** nothing to undo. There is no migration.
- **Data:** feedback sent through the new endpoint lands in the existing inbox, which the web already reads. Profile edits are ordinary profile writes. A deletion is permanent, as it is on the web.
- **Apps:** no released app calls the new endpoints, because no Production native build exists.

## 5. Owner checks after release

None required. The functional behavior was accepted on the iPhone against staging, and there is no Production device check, because no Production build exists.

## 6. Results

RESULTS_TABLE
