---
version: 1.0.0
status: approved
author: Claude Code (unattended pipeline run, 2026-11-24)
last_updated: 2026-11-24
pitch_reference: docs/pitches/mvp-5b-mobile-app/21j-account-settings/pitch.md
design_reference: docs/pitches/mvp-5b-mobile-app/21j-account-settings/design.md
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
linear_issue: Linear milestone "Pitch 21j — Account & Settings"
---

# Account & Settings — Technical Specification

**Design:** `design.md` in this folder. Its §15 (Mobile design) is the binding native visual contract. There is no `preview.tsx`. Step 3 is recorded as *Skipped — mobile-only pitch; the native visual contract is the Mobile design section, built with `/overload-mobile-ui`.* The visual review artifact is the design canvas (RD-18).

## 1. Summary

Account & Settings lets a lifter manage their account from the iPhone. It adds **ten account-scoped mobile API endpoint methods** and one additive app-config field. Each endpoint is a thin shell over a module the web already uses:

- the profile: `src/lib/accounts/profile.ts`;
- the read-only plan view: `src/lib/billing/screen.ts`, called with `inAppShell: true`;
- the release-note catalog and seen point: `@overload/shared/release-notes/catalog`, `src/lib/release-notes/seen.ts`;
- the exporter: `src/lib/accounts/export.ts`;
- the deletion module: `src/lib/accounts/deletion.ts`, behind the same password re-check the web uses (`src/lib/accounts/password.ts`);
- the feedback writer: `src/lib/feedback/feedback.ts` and `src/lib/feedback/screenshots.ts`.

On the phone, More becomes a grouped settings list with nine new screens (design A1–A9).

The mental model is **one account, two windows**. Nothing about the account is decided on the phone:

- The profile is validated by `parseProfileInput`.
- The plan is the Stripe mirror, worded by `billingCopy`.
- Seen release notes are one forward-only row shared with the web.
- The export file is byte-for-byte the web's document.
- Deletion runs the one sanctioned module, which cancels Stripe before it deletes anything.

The phone formats, collects input, and hands files to iOS. The pieces that are new are about delivery, not domain:

- multipart feedback with a retry key;
- a local file for the share sheet, deleted when the sheet closes;
- the post-deletion cleanup that leaves nothing private on the device.

"Working" means each of these holds, against staging:

- A name saved on the phone shows on the web.
- The phone's What's New sheet doesn't reappear on the web.
- An export saved to Files equals the web download for the same day.
- Feedback sent twice by a flaky network arrives once in the admin inbox.
- Deleting a disposable account on the phone removes exactly that account's rows, cancels any live Stripe subscription first, and leaves the app signed out with no cached data.

## 2. Problem

- The app cannot yet show or change the account's name, username, or time zone. More sends the lifter to the website.
- The app cannot yet say what the plan includes or when it changes. It shows only a short label.
- The app cannot yet show product updates or acknowledge them, so the iPhone and the web could disagree about what is new.
- The app cannot yet send feedback, so a lifter who hits a bug in the gym has to remember it for later.
- The app cannot yet export the account. "Your data stays yours" holds only on the web.
- The app cannot yet delete the account. Apple expects in-app deletion (guideline 5.1.1(v)) before 21l's TestFlight.

## 3. Scope and non-scope

### In scope

1. Mobile API: profile read and update, plan view, release-note list and seen mark, feedback create (multipart, retry key), export, deletion inventory, and deletion. App config gains the support address.
2. Server corrections shared with the web, with no visible web change:
   - (a) the feedback submission moves into one lib function used by both clients, with a magic-byte check on screenshots (audit F-A15) and a retry key on the mobile path (F-A8);
   - (b) the export filename moves to the shared package and the serializer is shared;
   - (c) `withIdempotency` accepts a transaction isolation level, and a replay lookup is exported.
3. Native screens M1 (regrouped) and A1–A9, the launch What's New sheet, and post-deletion cleanup.
4. Screenshot attachment on A6, delivered as a separate runtime ticket held at the development-build approval boundary (RD-9).
5. Disposable test-account guidance, the runbook, and the staging update.

### Out of scope

- Appearance changes. 21d already shipped A-level parity (RD-4).
- Any purchase, subscribe, upgrade, promo, portal, or checkout surface in the app. A web link from A3 is also out.
- Sending a verification email from the phone, changing the email, a native password change, the native tour (21k), the trial-ending notice on native, and the tour replay.
- Accepting a suspended account on mobile endpoints (RD-14).
- A per-entry release-note platform field (RD-6), and new release-note entries for 21j (design §13).
- Admin screens, and any change to the web UI.

## 4. Core concepts

| Concept | Description |
| --- | --- |
| Profile | `Profile.firstName`, `lastName`, `username` (nullable for pre-username accounts), and `timeZone`. The only authority for "today". Written only by `updateProfile`. |
| Plan view | `getBillingScreen(account, { inAppShell: true })` projected to `MePlanDto`. A mirror read with no Stripe call. Display only: it never unlocks anything. |
| Seen point | One `ReleaseSeen` row per account, forward-only, shared by the web dialog and the native sheet. A new account starts at "all seen". |
| Export document | `AccountExport` (`EXPORT_FORMAT_VERSION = 1`), built by `buildAccountExport` through `account.db` only. Serialized as `JSON.stringify(doc, null, 2)` into `overload-export-YYYY-MM-DD.json`. |
| Deletion | `deleteAccount(account)`. Step 0 cancels Stripe and throws before anything is deleted. Step 1 is one transaction over `ACCOUNT_DELETION_ORDER`. Step 2 removes the auth identity, step 3 sweeps the profile. A throw always means nothing was deleted. |
| Retry key | `Idempotency-Key` on the feedback create, stored in `ApiIdempotencyKey` (21c), per account. |
| Runtime | The installed development build's native fingerprint `f98506f78acfef2f8bfc764d2e31f16475e2f501`. A staging update reaches only builds with the same runtime. |

## 5. States and lifecycle

**Deletion, as the phone sees it:**

| Server outcome | HTTP | Phone state | Local effect |
| --- | --- | --- | --- |
| deleted (data and identity) | 200 `{ outcome: "deleted" }` | Deleted → signed-out welcome | forget the auth session, clear caches, drafts, and files |
| data deleted, identity remains (after 3 tries) | 200 `{ outcome: "identity_pending" }` | Finish on web: signs out with the finish-on-web notice (RD-26) | forget the auth session, clear caches, drafts, and files |
| wrong or missing password | 400 `validation_error`, details `{ password }` | Form error | password cleared |
| too many attempts | 429 `rate_limited` | Form error | none |
| Stripe cancel failed or not configured | 409 `conflict`, details `{ reason: "billing_not_canceled" }` | Form error | none (nothing deleted) |
| other failure | 500 `internal_error` | Form error | none (nothing deleted) |
| no response | — | Unconfirmed: "Check again" | none until confirmed |
| suspended account | 403 `account_suspended` | the existing suspended gate (web for data rights) | none |

"Check again" calls `GET /me`:

- 200 → "Your account is still here. If you just tried, wait a moment and check again." (A slow delete may still be committing.)
- `signed_out` (the refresh is refused, because the identity is gone) → Deleted.
- `unauthorized` after a successful refresh (the identity lives, but no profile answers) → Finish on web (RD-26).

**Feedback on the phone:** idle → sending → sent | error (draft kept). One retry key per intent. It is regenerated only after a confirmed send or a discard.

**Export on the phone:** idle → preparing → sharing → idle. Any failure → error → idle. The local file exists only during *sharing*.

## 6. Mobile API contract

Base `/api/mobile/v1`. Every endpoint is built with `mobileRoute`, so it gets the version gate, `getUser(token)`, the suspension check, the per-account rate limit, and the error envelope. Each endpoint is listed in `tests/support/mobile-endpoints.ts` with isolation cases. Every one is **Free**: no capability check, and no Pro result is returned. All changes are additive within v1. Old apps don't call the new paths, and the new app-config field is ignored by them.

| # | Method + path | Wraps | Request | Response 2xx | Retry safety |
| --- | --- | --- | --- | --- | --- |
| E1 | `GET /me/profile` | `getSettingsProfile`, `timeZoneOptions` | — | `ProfileViewDto` | read |
| E2 | `PUT /me/profile` | `updateProfile` | `UpdateProfileRequest` | `{ profile: ProfileDto }` | absolute write |
| E3 | `GET /me/plan` | `getBillingScreen(account,{inAppShell:true})` + `proHighlights()` | — | `MePlanDto` | read, mirror only |
| E4 | `GET /release-notes` | `orderedReleaseNotes().map(toReleaseNoteView)` | — | `ReleaseNotesDto` | read |
| E5 | `POST /me/release-notes/seen` | `markReleaseNotesSeen` | `{ throughId: string }` | `{ moved: boolean }` | forward-only, idempotent |
| E6 | `POST /feedback` | `submitFeedbackFromRequest` (new lib) | multipart, `Idempotency-Key` | 201 `{ sent: true }` | Idempotency-Key, replay before upload |
| E7 | `GET /me/export` | `buildAccountExport` | — | `AccountExport` (compact JSON) | read |
| E8 | `GET /me/deletion-inventory` | `accountInventory` | — | `AccountInventoryDto` | read |
| E9 | `POST /me/delete` | `deleteAccountFromApp` (new lib) → `verifyCurrentPassword(token email)` → `deleteAccount` | `{ password: string }` | `DeleteAccountResponseDto` | effectively idempotent (§5) |
| E10 | `GET /app-config` (existing, public) | + `supportEmail` | — | `AppConfigDto` (+1 field) | read |

E10 is counted for completeness. The **nine** authenticated methods are E1–E9. With E10's new field that makes ten contract changes.

### Shared contracts (`packages/shared/src/contracts`)

```ts
// account.ts (additions; ProfileDto, MePlanDto, AccountInventoryDto exist)
export type ProfileViewDto = {
  profile: ProfileDto;
  /** Every zone the server accepts, sorted, always including the stored one. */
  timeZones: string[];
};
export type UpdateProfileRequest = {
  firstName: string; lastName: string; username: string; timeZone: string;
};
export type UpdateProfileResponseDto = { profile: ProfileDto };
// MePlanDto gains (additive, nothing implemented it before):
//   proIncludes: string[]  // proHighlights(); the plan_import line ends "(on the web)"
export type DeleteAccountRequest = { password: string };
export type DeleteAccountResponseDto = { outcome: "deleted" | "identity_pending" };
export type MarkReleaseNotesSeenRequest = { throughId: string };
export type MarkReleaseNotesSeenResponseDto = { moved: boolean };

// feedback.ts (new)
export type FeedbackResponseDto = { sent: true };
/** Multipart field names: category, message, screenshots (0..MAX_COUNT files). */
export const FEEDBACK_FORM_FIELDS = { category: "category", message: "message", screenshots: "screenshots" } as const;

// app-config.ts (addition)
//   supportEmail: string | null  // NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL when set; null otherwise (never the placeholder)

// export (new, packages/shared/src/accounts/export-file.ts)
export const EXPORT_FILE_PREFIX = "overload-export-";
export function exportFilename(exportedOn: string): string; // moved from apps/web export.ts, unchanged output
export function serializeAccountExport(doc: unknown): string; // JSON.stringify(doc, null, 2)
export type AccountExportDto = { formatVersion: 1; exportedOn: string } & Record<string, unknown>;
```

`AccountExport` stays in `apps/web` (it is the Prisma-row document). The shared `AccountExportDto` types only the two fields the phone checks. The web route serializes with `serializeAccountExport`, and the phone writes with it, so both files are identical for the same document.

### Server modules

| Module | Change |
| --- | --- |
| `src/lib/api/mobile/account-settings.ts` (new) | Handlers' bodies for E1–E5, E7, E8. Parses JSON bodies with the 21c body helpers. No Stripe, no import retention (the 21c side-effect guard). |
| `src/lib/api/mobile/account-deletion.ts` (new) | `deleteAccountFromApp(account, email, body, deps)`. It validates `{ password }` (a non-empty string of at most 1,024 characters) and runs `verifyCurrentPassword(email, password)`, where the email comes from the verified token. `"wrong"` → `validation_error {password: "That password isn't right."}`, `"rate_limited"` → `rate_limited`, `"unavailable"` → `internal_error`. Then `deleteAccount(account)`. `SubscriptionCancellationError` → `conflict {reason: "billing_not_canceled"}`. Any other throw → `internal_error` ("Couldn't delete your account. Nothing was deleted."). Logs are error names only, never the password or the email. `deps` lets tests inject the verifier and the deletion dependencies. |
| `src/lib/feedback/submission.ts` (new) | `submitFeedbackWithScreenshots(account, { category, message, files }, deps)`. It validates fields and screenshots with type **sniffed from bytes**, checks the limit before upload, uploads under `<userId>/<uuid>`, writes rows, and removes uploads on any failure. The web action becomes a thin caller (unchanged result states). `submitFeedbackFromRequest(account, request)` parses multipart (the route can't call `formData()`; static guard) and adds the retry key (below). |
| `src/lib/feedback/feedback.ts` | `submitFeedback(account, raw, now, tx?)`. With `tx` it counts and inserts in the caller's transaction. Without one it is unchanged (its own serializable transaction). |
| `src/lib/api/mobile/idempotency.ts` | `withIdempotency(..., opts?: { isolationLevel })` and `findReplay(account, key, scope, requestHash)`, which returns the stored answer, a conflict, or null. Both additive; existing callers unchanged. |
| `src/lib/accounts/export.ts` | Re-exports `exportFilename` from shared. The web route uses `serializeAccountExport`. |
| `src/app/api/mobile/v1/app-config/route.ts` | Adds `supportEmail`, read from `NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL` (trimmed; empty → null). |

**E6 sequence:**

1. Parse multipart. At most 1 + 1 + `FEEDBACK_SCREENSHOT_MAX_COUNT` parts, and a body of at most 4.5 MB (the hosting limit).
2. `parseIdempotencyKey`.
3. Compute `requestHash = requestFingerprint("POST feedback", { category, message, screenshots: sha256[] })`.
4. Call `findReplay`. A stored answer is returned now, with no upload. A conflict returns 409.
5. Validate the fields and sniff the screenshots.
6. `assertFeedbackAllowed` (limit).
7. Upload.
8. `withIdempotency(account, { key, scope, body }, run, { isolationLevel: "Serializable" })`, where `run` calls `submitFeedback(..., tx)` and returns `{ status: 201, body: { sent: true } }`.
9. If the answer is not a fresh 201 (a replay, a conflict, or a throw), remove the uploaded objects.

The daily limit maps to `conflict` with `details: { reason: "daily_limit" }` and the message "You've sent a lot of feedback today. Try again tomorrow." A serialization failure surfaces as `internal_error`. The app retries with the same key, and the replay answers.

## 7. UI integration

### Screen → endpoint map

| Screen | Endpoints | Cache keys (TanStack) |
| --- | --- | --- |
| M1 More | `GET /me` (existing) | `me` |
| A1 Profile, A2 Time zone | E1, E2 | `profile`; on success set `me.profile`, invalidate `today`. On a zone change, invalidate every account query except `me` |
| A3 Plan & access | E3 | `plan` |
| A4 What's New | E4 | `release-notes` |
| A5 launch sheet | `me.whatsNew`, E5 | on close, set `me.whatsNew = null` before E5 resolves |
| A6 Send feedback | E6 | none (a write) |
| A7 Get help | `app-config` (already fetched at launch by the gate) | `app-config` |
| A8 Export | E7 | none (never cached: `gcTime: 0`, not a query) |
| A9 Delete account | E8, E9, `GET /me` for Check again | `deletion-inventory` |

### Routes (`apps/mobile/src/app`)

- `(tabs)/more/profile.tsx`, `(tabs)/more/time-zone.tsx`, `(tabs)/more/plan.tsx`, `(tabs)/more/whats-new.tsx`, `(tabs)/more/help.tsx`, `(tabs)/more/export.tsx`, `(tabs)/more/delete-account.tsx`: pushed on the More stack with the system back header.
- `feedback.tsx`: a root modal, like `goal-new.tsx` (21i), so A7 and M1 open one form. It takes `?category=question` from A7.
- The A5 sheet mounts in the signed-in shell (`RootNavigator`). It opens at most once per JS launch, only when the gate is `app` and no workout route or modal is focused.

### Data layer

- **`apps/mobile/src/api/account.ts` (new):** hooks for E1–E5, E7–E9, plus `useSubmitFeedback` for E6 (multipart through the client, below).
- **`apps/mobile/src/api/client.ts`:**
  - `RequestOptions` gains `timeoutMs` (default 15,000; export uses 60,000).
  - It gains `formData` (sent as the body without a JSON content type, so the boundary is set by fetch). The version, auth, and staging headers are unchanged.
  - A `formData` body is resent unchanged on the one refresh-and-retry.

### Pure models (no I/O, unit-tested)

- `profile-model.ts`: dirty check, field errors from `details`, and the device-zone suggestion (`expo-localization` `getCalendars()[0].timeZone`, shown only when it is in `timeZones` and differs).
- `plan-model.ts`: maps `MePlanDto` to rows. The "Included in your plan" heading for every state but free, and "Pro adds" for free.
- `deletion-model.ts`: a reducer over §5. The outcome → message map uses the web's exact strings (`DeleteAccountForm` `FORM_ERRORS`).
- `feedback-model.ts`: draft, can-send, error mapping, and the key lifecycle.
- `export-file.ts`: name and validity check (`formatVersion === 1`, `exportedOn` matching `YYYY-MM-DD`). The writer and cleaner wrap `expo-file-system` (`Paths.cache/exports/`).

### Native mechanics

- **Share sheet:** React Native's `Share.share({ url: file.uri })` (iOS hands the file URL to `UIActivityViewController`). It resolves on save or dismiss. The file is deleted in `finally`. `exports/` is emptied on launch (in the signed-in shell's first effect) and before every export. A failed write (disk full) → the "not enough space" message.
- **`expo-file-system`:** already linked into the installed build as a dependency of `expo`. It is declared as a direct dependency at the same version (`~58.0.13`), so the fingerprint stays `f98506f78a`. Verified 2026-11-24, and re-verified per commit in the ticket (RD-8).
- **Mail:** `Linking.openURL("mailto:" + supportEmail)` in a try/catch. A failure shows the banner, and the address is always rendered selectable.
- **Post-deletion cleanup (`apps/mobile/src/accounts/after-deletion.ts`):** `forgetSession()` (no network: the identity is gone), `clearAccountQueries`, `resetNotices`, the Pro-note store reset, the feedback draft reset, the export directory emptied, and a signed-out notice "Your account was deleted." The appearance mirror is kept: it is a device preference, not account data, and the next sign-in overwrites it from the server.
- **Screenshot (runtime ticket):**
  - `expo-image-picker` `launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: false, quality: 1, exif: false })`.
  - Then `expo-image-manipulator`: resize so the longest side is at most 2,048 px, and save as JPEG at compress 0.8. This drops EXIF, including location.
  - The result is refused client-side if it is still over 3 MB.
  - Config plugin: `expo-image-picker` with `photosPermission` set and `cameraPermission: false`, `microphonePermission: false` (no camera).

### Components

Reused: `ScreenHeader`, `GroupedList`/`ListRow`, `Surface`, `Banner`, `Button`, `TextField`, `ChipGroup`, `Skeleton`, `LoadErrorState`, `FormScreen`, `use-modal-close`. New: `ReleaseNoteItem`, `WhatsNewSheet`, `ScreenshotAttachment` (runtime ticket), `InventoryRows`.

### Client scope and platform impact

Mobile UI, plus API and shared contracts. The web gains no UI. It shares three server functions: the feedback submission, the export serializer, and the export filename. Its behavior is unchanged apart from rejecting an image whose bytes aren't PNG, JPEG, or WebP. The admin inbox is unchanged and web-only.

### User guidance

No tour step (21k builds the native tour), and no release-note entry (design §13; RD-6).

## 8. Data model

**No schema change and no migration.** Every table used already exists with RLS:

- `Profile`, `ReleaseSeen`, `Feedback`, `FeedbackAttachment`, `ApiIdempotencyKey`, `BillingAccount`, `Entitlement`;
- every model in `ACCOUNT_DELETION_ORDER`.

The `FeedbackAttachment` CHECKs (type, size, position 0..3) are unchanged. No derived value is stored.

## 9. Authorization and access control

- Every endpoint is scoped by the token's account through `account.db`. No request carries an account id, and the route guard forbids `userId|accountId|ownerId` in route files.
- E9's password check uses the email Supabase returned for the token, never a body field. The body holds only `password`.
- E9 runs the one deletion module. No new delete path exists, and the guard pinning `ACCOUNT_DELETION_STEPS` importers is unchanged: `account-deletion.ts` imports `deleteAccount`, not the steps.
- A suspended account gets 403 on E1–E9, as on every mobile endpoint (RD-14). `requireAccountForDataRights` keeps its two pinned callers.
- E3 reads the mirror only. The existing side-effect fence (`mobile-api-guards.test.ts`, "the mobile API never calls Stripe") must stay green. E3's `proIncludes` is the description of a plan, not a Pro result.
- E6 uploads to the private `feedback-screenshots` bucket under `<userId>/<uuid>/<n>.<ext>` with the service role on the server only. The app never holds a Storage credential. Reads stay admin-only through 300-second signed URLs.
- Admin: none touched.

## 10. Storage model

There is no new bucket and no new kind of upload: native screenshots are the existing feedback screenshots.

- **Server limits are unchanged:** PNG, JPEG, or WebP; at most 3 MB each, 4 MB total, 4 files.
- **New:** the declared type must match the sniffed type, by magic bytes:
  - PNG: `89 50 4E 47 0D 0A 1A 0A`;
  - JPEG: `FF D8 FF`;
  - WebP: `RIFF????WEBP`.
- Deletion already captures and removes the account's screenshot objects.
- Uploads from a request that doesn't commit are removed best-effort (unchanged rule, extended to replays).

## 11. Development-only test accounts

No new seeding profile is needed. The runbook uses `npm run dev:test-account` with the existing `standard` profile for two accounts:

- `21j-primary-<date>@example.com` (comp Pro): scenarios A, B, C, and E;
- `21j-delete-<date>@example.com` (`--access free`): scenario D.

A paid-subscription deletion on staging (Stripe **test mode**) is optional for the owner (runbook D6). The run never creates one.

## 12. Validation rules

| Input | Rule | Error |
| --- | --- | --- |
| E2 names | `checkName`: trimmed, 1–50 | `validation_error` `{firstName|lastName}` |
| E2 username | `checkUsername`; required if the stored one is non-null; reserved → "isn't available"; another account's → "That username is taken." (no other detail) | `validation_error` / `conflict` (existing `asUsernameConflict`) |
| E2 timeZone | `isValidTimeZone` | `validation_error {timeZone}` |
| E2 body | JSON object with the four string fields | `validation_error` |
| E5 throughId | a catalog id | `validation_error` ("Unknown update.") |
| E6 category, message | `parseFeedbackInput` | `validation_error {category|message}` |
| E6 screenshots | `validateScreenshots` + sniff | `validation_error {screenshots}` |
| E6 key | `parseIdempotencyKey` | `validation_error {Idempotency-Key}` |
| E9 password | non-empty string, at most 1,024 | `validation_error {password: "Enter your password to confirm."}` |

## 13. Testing strategy

### API — `apps/web/tests/integration/mobile-account-settings.int.test.ts` (new; route handlers, real DB)

```text
GIVEN account A WHEN GET /me/profile THEN its names, username, zone, and a sorted zone list containing its zone
GIVEN A WHEN PUT /me/profile with a new first name THEN 200 and GET /me shows it; GET on the web's getSettingsProfile agrees
GIVEN B holds "lifter_b" WHEN A PUTs username "lifter_b" THEN the taken message only, and A's profile unchanged
GIVEN invalid names/zone THEN 400 with per-field details and nothing written
GIVEN A with a pre-username profile WHEN PUT with an empty username THEN 200 and username stays NULL
GIVEN a trial/comp/paid/canceling/grace/free mirror WHEN GET /me/plan THEN label/explanation equal billingCopy, endsOn only with a period end, no price/subscribe/manage/promo keys
GIVEN GET /release-notes THEN the catalog's views in catalog order
GIVEN A's seen point at entry 2 WHEN POST seen {throughId: entry 1} THEN moved; WHEN POST {throughId: entry 3 (older)} THEN not moved; unknown id → 400
GIVEN a new account WHEN GET /me THEN whatsNew null (no backlog)
GIVEN A with data and B with data WHEN A GET /me/export THEN equals buildAccountExport(A) after a JSON round-trip and contains none of B's ids
GIVEN A WHEN GET /me/deletion-inventory THEN accountInventory(A)
```

### Deletion — `apps/web/tests/integration/mobile-account-deletion.int.test.ts` (new)

This file uses injected `verifyPassword`, `billing`, and `deleteAuthUser` fakes, plus real data for two accounts.

```text
wrong password → 400, every A row intact
rate-limited verify → 429, intact;  unavailable verify → 500, intact
Free, no BillingAccount → 200 deleted; every A model count 0; B's counts unchanged; library exercises unchanged
active subscription, cancel succeeds → cancel called with A's customer id BEFORE any delete; 200 deleted
cancel throws → 409 billing_not_canceled; A fully intact
Stripe not configured + mirror subscribed → 409; intact
Stripe not configured + mirror canceled → 200 deleted
comp entitlement, trial entitlement → 200 deleted; Entitlement rows gone
identity removal throws → 200 identity_pending, data gone; a retry → 200 deleted (no-op on data)
after deletion, a request with A's (fake-verified-as-gone) token → 401
body carries userId/accountId → ignored; email in body → ignored (verifier receives the token email)
```

Stripe webhooks that arrive after deletion resolve to no account and change nothing. That case is already pinned by the billing webhook tests and is re-run here, not re-implemented.

### Feedback — `apps/web/tests/integration/mobile-feedback.int.test.ts` (new) and unit

```text
POST multipart (text only) with a key → 201; the admin inbox query lists it for A
same key, same body (retry) → 201 replay header; one Feedback row; no second upload (fake storage call count)
same key, different message → 409 conflict
with a PNG screenshot → 201; one FeedbackAttachment with A's userId and an "<A>/" path
declared image/png but JPEG bytes / text bytes → 400 screenshots; nothing uploaded
over 3 MB → 400; daily limit reached → 409 daily_limit, nothing uploaded
the web action's existing tests pass unchanged through the new lib
unit: sniffImageType for PNG, JPEG, WebP, GIF (refused), empty, truncated headers
```

### Isolation — `tests/integration/isolation/mobile-api.int.test.ts`

These are registry cases for E1–E9. Each proves B's token returns or changes only B's data.

- E5 can't move A's seen point.
- E7 and E8 never include A's rows.
- E9 with B's token and password deletes B only, and A's every model count is unchanged.
- E6 rows and objects are stamped with B.

### Static guards and contracts

- `tests/support/mobile-endpoints.ts` lists the nine new methods.
- `mobile-api-guards.test.ts` stays green: no `formData(` in routes, and no Stripe call (E3 uses `getBillingScreen`, which doesn't call Stripe).
- `mobile-contracts.test.ts`: the new DTOs compile against the handlers' return types.
- `data-rights-guard.test.ts` is unchanged.
- The `qa-fixture` deletion-steps importer guard is unchanged.
- `export-file` unit test: the web route's output bytes equal `serializeAccountExport(doc)`, and `exportFilename` is unchanged.

### Mobile (`apps/mobile/tests`)

Run alone, not alongside the web suite.

- Models: profile dirty and errors, the plan rows per display state, the deletion reducer for every row of §5 including Check again, feedback key reuse, and export name and validity.
- Screens (`renderRouter`):
  - More rows navigate.
  - A1 Save is disabled until dirty, a failure keeps the input, and success updates `me`.
  - A5 opens once, closes, and calls E5 once.
  - A6 sends, double-tap sends once, a failure keeps the draft.
  - A8 calls `Share.share` with a `file://…/overload-export-YYYY-MM-DD.json` URL and deletes the file after resolve and after reject.
  - A9 shows the alert. Cancel sends nothing. Deleted runs the cleanup and lands on the welcome notice. The 409 message is shown.
- `fingerprint-inputs.test.ts` is unchanged. A new assertion pins `expo-file-system`'s declared range to the version resolved by `expo`.

### Unverified by a run (owner checks, runbook §3)

- The share sheet and Save to Files.
- Mail opening.
- The photo picker and the resized image (runtime ticket).
- The A5 sheet and the appearance of every screen on the device.
- The deletion flow on the iPhone, end to end against staging.
- VoiceOver and Dynamic Type.

## 14. Acceptance criteria

**Settings and profile**
- [ ] More shows the design's groups. "Manage account on the web" is gone. Delete account is last and apart.
- [ ] A1 loads and saves names, username, and zone with the web's validation and messages. The web shows the saved values. Today's greeting uses the new first name.
- [ ] Email and password are read-only, with the design's wording.

**Appearance** (21d, regression only)
- [ ] Light, Dark, and System still apply and persist. Every 21j screen is readable in both appearances.

**What's New**
- [ ] A4 lists the catalog newest first with exact dates, titles, and bodies.
- [ ] A5 shows unseen significant entries combined, once. Closing it marks seen for the web too. A new account gets no sheet.

**Feedback**
- [ ] Category, message, and send work. The entry reaches `/admin/feedback`. A retried send creates one entry. A failure keeps the draft.
- [ ] (Runtime ticket) A screenshot can be added, reviewed, replaced, and removed. The uploaded image is JPEG at most 2,048 px with no EXIF. Mismatched bytes are refused on the server for both clients.

**Export**
- [ ] A8 produces `overload-export-YYYY-MM-DD.json`, identical to the web download for the same day, through the share sheet. A cancel is silent. No file remains afterwards. Free and Pro behave the same.

**Access**
- [ ] A3 shows the web's label and explanation, a real date only, and the Pro lines. There is no price, purchase, promo, or link.

**Help**
- [ ] A7 opens A6 (Question) and Mail to the configured address. With no address configured, the Email row is absent.

**Deletion**
- [ ] A9 shows the inventory, the billing note, and the password. Then the alert. Cancel at either step changes nothing.
- [ ] The deletion runs `deleteAccount` only. A live subscription is canceled first. Any failure before data deletion reports "nothing was deleted".
- [ ] After success the app is signed out with no cached data, drafts, or files. The token is refused. Another device signs out on its next request.

**Verification**
- [ ] The full web and mobile suites are green, and the new integration and isolation suites pass.
- [ ] The staging update is published on runtime `f98506f78a` for everything except the screenshot attachment. The runtime ticket waits for the owner's development-build approval.

## 15. Explicit non-goals

- ❌ Any purchase path in the app: Checkout, IAP, StoreKit, promo, portal, upgrade. **Deferred** to the store-billing pitch.
- ❌ An email change, or a native password change or recovery redesign. **Deferred**, and needs a pitch.
- ❌ The native tour, its replay, and the native trial notice. **Deferred** (21k, and a later decision).
- ❌ Data rights for suspended accounts on mobile. **Deferred**: the web serves them (RD-14).
- ❌ Admin on mobile, and any view of another account. **Permanent.**
- ❌ A second export format or a second deletion path. **Permanent.**

## Resolved Decisions

| # | Decision | Rationale | Authority |
| --- | --- | --- | --- |
| RD-1 | More stays the settings home, regrouped: account card → Profile; Plan; App; Updates & help (What's New, Send feedback, Get help); Your data (Export); Sign out; Delete account apart and last. The "Manage account on the web" row is removed. | The iOS Settings idiom. The pitch asks for grouped, scannable sections with Delete visually distinct. Each row the web link stood for now has a native destination. | Q1; pitch §5.1; overload-mobile-ui |
| RD-2 | Profile edits first name, last name, username, and time zone, the web's exact field set, through `updateProfile`. Email is read-only. Password changes go through Forgot password. Email verification is shown, not sent from the phone. | The web edits these four (`settings/actions.ts`). The time zone already has one meaning ("today" for the account), so editing it natively adds no new semantics. Verification gates only web checkout. | Q2; Accounts spec §11; CLAUDE.md "Today is per account" |
| RD-3 | The time-zone list comes from the server (`timeZoneOptions`), not the device's `Intl`. The device zone is offered as a one-tap suggestion via `expo-localization`. | Hermes's `Intl.supportedValuesOf` support is not guaranteed. The server list is exactly what `isValidTimeZone` accepts. | Q2; 21d Hermes spike |
| RD-4 | Appearance is unchanged. 21d made it account-synced (`PUT /me/appearance`) with a per-device first-paint mirror, which is the same ownership model as the web's localStorage mirror. | It's already built and accepted (21d D4). Reconciliation is "the server wins on load". | Q3; 21d RD-10 |
| RD-5 | What's New: A4 lists the canonical catalog via E4. A5 shows `me.whatsNew` (already computed with the web's precedence and the account floor) once per launch. Closing it calls E5 with `throughId`, moving the one shared seen point, so the web doesn't repeat it. | One catalog and one seen point (What's New spec R9–R14). The combined presentation and the no-backlog rule come for free from `getWhatsNewDialog`. | Q4; What's New spec |
| RD-6 | No per-entry platform field now, and no 21j release note. Entries are dated the day a change reaches users. The iPhone app reaches none until 21l, which writes one consolidated "Overload on iPhone" entry. From then on, an entry for a capability only one client has says so in its body ("on the web", "on iPhone"). A `platforms` field is reconsidered at 21l if wording isn't enough. | It avoids announcing a native capability before distribution, and avoids a content-contract change no one consumes yet. | Q4; pitch §11.7; release-notes content rules |
| RD-7 | When `tour.autoStart` or `trialNotice` takes precedence in `me`, native shows no What's New sheet (it shows neither of those either). The entries wait until a launch where they are first in line. | It keeps the web's one-dialog precedence without building the native tour (21k) or trial notice here. | Q4; `getMeView` |
| RD-8 | Export and share need no new native code. `expo-file-system` is already linked (a dependency of `expo`), and declaring it directly leaves the fingerprint `f98506f78a` (verified). The share sheet is React Native's `Share` with a file URL. | One OTA can deliver export, so no new build is needed for it. | Q5, Q7; fingerprint check 2026-11-24 |
| RD-9 | Screenshot selection needs `expo-image-picker` plus `expo-image-manipulator`, which are new native modules and a new runtime. They ship in their own ticket, whose PR stays **open, not merged into staging**, until the owner approves and installs a new development build. Merging it moves staging's runtime and would strand the installed build for every later fix. Until then, A6 is text-only, and the Screenshot row is absent, not disabled. | Pitch §11.5 and Stage 10 name this approval boundary. A WebView file input was rejected: its "Take Photo" option would crash without a camera usage string, and it's a hack. | Q5, Q20; pitch §11.5 |
| RD-10 | Native allows one screenshot per message. The server keeps the web's limits (4 files, 3 MB each, 4 MB total). Native re-encodes to JPEG (longest side at most 2,048 px, compress 0.8), which also strips EXIF and location. | The pitch says "a screenshot". iPhone screenshots are 2–4 MB PNGs that would hit the 3 MB cap. Stripping location is a privacy win. | Q6; pitch §5.5 |
| RD-11 | The feedback submission moves into `submitFeedbackWithScreenshots`, shared by the web action and E6, with magic-byte sniffing (closing audit F-A15 for both clients) and the Idempotency-Key with replay-before-upload (F-A8). The limit race stays serializable via `withIdempotency`'s new isolation option. | It avoids a second feedback path and fixes the declared-type trust for both clients. A retry costs no duplicate upload. | Q6; audit F-A8, F-A15; CLAUDE.md idempotency rule |
| RD-12 | E7 returns the same `buildAccountExport` document (compact on the wire). The phone writes it with the shared `serializeAccountExport` (2-space JSON), named by the shared `exportFilename`, so the file equals the web download. The phone checks `formatVersion === 1` and that the JSON parsed before writing, so a truncated response is never saved. | Same format, no mobile variant. Compact transfer roughly halves the bytes against the 4.5 MB response limit. | Q7, Q8; Public Accounts R7 |
| RD-13 | The local export lives in `Paths.cache/exports/` only while the share sheet is open, and is deleted in `finally`. The directory is emptied at launch and before each export, so an interrupted export doesn't linger. | It minimizes the time personal data sits on the device. The cache is excluded from backups. | Q9; pitch §8 |
| RD-14 | Mobile endpoints keep refusing suspended accounts (403). The existing suspended screen already says to download or delete on the web, where `requireAccountForDataRights` allows it. | Widening the data-rights guard to the mobile API is new security surface the pitch doesn't need. The web path satisfies "your data stays yours" for this rare state. | Q13, Q17; CLAUDE.md suspension rule |
| RD-15 | A3 shows `MePlanDto` from `getBillingScreen(inAppShell: true)`: label, explanation (with the real UTC period-end date only when the mirror has one, as the web does), trial days, `proIncludes`, and the fixed Free lines. The only billing guidance is the unlinked sentence "Plans and billing are managed on the Overload website." No price, no action, no link. There is no Stripe refetch on this GET. | The web's own read-only app-shell projection. No purchase flow and no steering link until the store-billing pitch. GETs have no side effects (21c RD-5). | Q10, Q11; CLAUDE.md billing rules; 21c RD-5 |
| RD-16 | The Stripe prerequisite is satisfied. `cancelSubscriptionsBeforeDeletion` (OVE-122, on `main`) cancels every not-ended subscription on the customer, read from Stripe, **before** any delete. A failure, or "not configured while the mirror says subscribed", throws and deletes nothing. It is pinned by `tests/unit/cancel-on-deletion.test.ts`, `tests/unit/accounts-deletion.test.ts`, and `tests/integration/account-deletion-billing.int.test.ts`. 21j adds API-level coverage, not new billing code. | Q12 verified in code and git (`40e4853` reached `main` in the OVE-121/122 release). | Q12; Plans & Billing RD-16 |
| RD-17 | Deletion confirmation on the phone = the inventory screen, the current password re-checked on the server with the token's email (the web's R13), and a system alert. Ordering and partial failures are the module's own (§5): cancel → one data transaction → identity → profile sweep. "Stripe canceled, data failed" leaves an intact account whose subscription is canceled, so the lifter is told nothing was deleted and can retry or contact support. This is the web's existing, accepted semantics. | Equivalent protection to the web plus the iOS idiom for irreversible actions. No new ordering is invented. | Q13, Q14; Accounts R12–R13; OVE-122 |
| RD-18 | The visual review artifact is the design canvas https://claude.ai/artifact/1BtwAnKCZfHsd16Rz1RwKn (M1, A1, A3, A5, A6, A8, A9 in light and dark, illustrative data). Design §15 wins where they differ. | The required step-3 artifact for a mobile-only slice. | Pipeline guide §5 step 3; D5 |
| RD-19 | Session invalidation: removing the auth identity deletes its refresh tokens. Every mobile request verifies with `getUser(token)`, so a still-unexpired access token is refused at once. The phone forgets its session locally (`forgetSession`, no network). A second device gets 401, its refresh fails, and it falls to the signed-out state on its next request. | The 21c token rule makes deletion effective immediately without new machinery. | Q15; 21c spec |
| RD-20 | The support destination: A7 offers Send feedback (the in-app path the web's `/support` prefers when signed in) and Email support to `NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL`, sent as the additive `app-config.supportEmail`. When it is unset, it is `null`, and the Email row is hidden. The web's visible placeholder is never sent to the phone. | It reuses the canonical channel and never invents a contact detail. | Q16; Public Accounts spec §11 |
| RD-21 | All nine endpoints are Free with no capability check. None returns a gated training result: E3's `proIncludes` is plan copy. | The pitch §6 and the capture-is-free rule. | Q17; CLAUDE.md plans |
| RD-22 | Compatibility: only additive paths and one additive app-config field. The minimum app version is unchanged. Old builds ignore `supportEmail`. | v1 stays backward compatible. | Q18; CLAUDE.md mobile API rules |
| RD-23 | Device-only checks are the runbook's five scenarios, plus VoiceOver and largest-text spot checks on A1, A6, and A9. Everything else is automated. | Q19. | Q19; pitch §15 |
| RD-24 | Appetite holds at M with staged delivery. Stage A (everything except picking a screenshot) is one OTA on the installed build. Stage B (the screenshot) waits for a new development build. | No deletion or billing safety work is deferred. Only the native module is. | Q20 |
| RD-25 | Tickets: OVE-247, the account API and shared contracts (E1–E5, E7, E10); OVE-248, the deletion API (E8, E9), reviewable alone; OVE-249, the feedback submission lib, sniffing, and E6; OVE-250, native settings: More, Profile, Time zone, Plan, What's New list and sheet, Help, text-only Feedback; OVE-251, native Export and Delete account, with cleanup; OVE-252, the runtime ticket for screenshot attachment (PR held); OVE-253, test accounts, runbook, staging checks, and the staging update. Each merges into `staging` through its own PR, as 21i did, except (6). | The pitch §16 stage 5 asks for deletion and billing safety to be independently reviewable. | Pitch §16; 21i RD-18 precedent |
| RD-26 | Review fixes (independent review of #320–#324). (1) A half-closed account (data deleted, auth identity not) can't be finished from the app, because the mobile pipeline never recreates a profile, so every request is 401. `deleteAccount` now tries closing the identity 3 times (250/500 ms apart) before answering `identity_pending`. The app never reads `identity_pending`, or a 401 after a successful refresh, as "deleted": it signs out with "…To finish, sign in on the Overload website and delete your account there." The web's own delete page finishes it, because the web recreates the profile. The shell shows the same notice when `/me` is 401 on launch. (2) The delete call's timeout is 60 s, longer than the 30 s transaction, and "still here" no longer says "Nothing was deleted". (3) Feedback uploads are removed only when no attachment row references them, which covers a lost commit acknowledgement. (6) A byte mismatch says the file isn't the image it claims. (4, 5) For OVE-252: temporary image files are deleted, and the Screenshot row is shown only when the native module is present. | The review's confirmed finding #1 is a false "deleted"; the rest harden edges. No new auth surface: a narrow "finish without a profile" mobile route was rejected as new surface the web already covers. | Review of 2026-11-24; CLAUDE.md first invariant, deletion rules |

## Open Questions

None block implementation. For the owner:

1. **Large exports (owner awareness, not blocking).** Vercel caps a function response at 4.5 MB. This applies to the existing web download too. RD-12's compact transfer helps, and the run measures a realistic account's size and reports it in the owner notes. If real accounts approach the cap, a later chore should stream the export or compress it. It never truncates silently: an oversized response fails, and both clients show an error.
2. **Support address.** Confirm `NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL` is set for Preview (staging) and Production. If it is unset, A7 shows only Send feedback (runbook §1).

## 16. Future considerations

- 21k can anchor native coach marks to M1's stable rows.
- 21l writes the "Overload on iPhone" release note and decides whether a `platforms` field is needed (RD-6).
- The store-billing pitch can add a compliant management path to A3 without touching its read model.
- A streamed or compressed export, if Open Question 1 shows a need.
