---
version: 1.0.0
status: approved
author: Claude Code (unattended pipeline run, 2026-11-13)
last_updated: 2026-11-13
pitch_reference: docs/pitches/mvp-5b-mobile-app/21c-mobile-api-auth-foundation/pitch.md
design_reference: docs/pitches/mvp-5b-mobile-app/21c-mobile-api-auth-foundation/design.md
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
audit_reference: docs/planning/mobile-audit.md (§2 endpoint inventory "21b — foundation", §3 auth, §7 isolation plan)
contracts_reference: packages/shared/src/contracts/
linear_issue: OVE-176, OVE-177, OVE-178, OVE-179, OVE-180 (milestone "Pitch 21c — Mobile API & Auth Foundation")
---

# Mobile API & Auth Foundation — Technical Specification

UI design step: **Skipped — no UI surface in this pitch.** No `preview.tsx`.

## 1. Summary

Pitch 21c adds a versioned JSON API under `/api/mobile/v1` inside the existing Next.js app, for the future iPhone app only. Every request runs through one **request pipeline** (`mobileRoute`): a version gate on `X-Overload-App-Version`, bearer-token verification with Supabase Auth's `getUser(token)` on a cookie-less anon client, account-state resolution that **never creates a profile**, a suspension check, a per-account rate limit, and then a handler that calls the same account-scoped lib functions the web uses. Failures always come back as `{ error: { code, message, details? } }` with a fixed status per code.

The slice ships four endpoints from the audit's foundation inventory: public `GET /app-config`, and authenticated `GET /me`, `GET /today`, `GET /gyms`. Underneath, it extracts the Today and workout compositions out of their pages into account-scoped view functions the web pages now read (so web and phone get one truth), routes the post-write goal reconciliation through one workflow module, resolves the entitlement once per request, and fences the two side-effecting page loads (Stripe refresh, plan-import retention) away from the API. It adds one owned table, `ApiIdempotencyKey`, and the shared `withIdempotency` mechanism later create endpoints will use, plus one new rate-limit action on the existing un-owned `AuthThrottle` table.

"Working" means: a real Supabase access token for an overload-dev account returns that account's `me`, Today, and gyms with no cookie; a missing, malformed, expired, revoked, or deleted-account token returns 401 JSON (never a redirect); a suspended account gets 403; an old app version gets 426; a second account sees none of the first's data on any endpoint; a Free account gets `locked` and null Pro fields on Today; and every web page renders exactly as before.

## 2. Problem

- The app cannot yet reach any data: the only route handlers are the Stripe webhook, `/auth/confirm`, and the export, and all authentication is cookie-based (`requireAccount`, `currentUser`, `createServerSupabase`).
- A cookie-less request to any non-public path is redirected to `/login` by `src/proxy.ts` (audit F-A5).
- `resolveAccountState` lazily creates a missing profile (F-A6), so any token path that skips Auth-server verification could recreate a deleted account's profile.
- Today is composed inside `(app)/page.tsx` and three async components; the workout runner's progression loop lives in its page. A route handler cannot reuse either.
- Post-write goal reconciliation lives in four server actions, so a later mobile write handler would have to remember it (S-4 / F-T12).
- Gated reads resolve the entitlement per call; React `cache` does not memoize in route handlers, so Today would resolve it once per exercise.
- There is no version gate, no app config, no idempotency storage, and no rate limit for an authenticated surface.

## 3. Scope and non-scope

### In scope

1. The request pipeline (`src/lib/api/mobile/`), the error-to-status map, the JSON 404 for unknown API paths.
2. Bearer-token authentication (`src/lib/data/mobile-auth.ts`, `src/lib/supabase/token.ts`) and a no-create account resolver.
3. The proxy exemption for `/api/mobile`.
4. App config and the version gate (server-only env vars, safe defaults).
5. `GET /app-config`, `GET /me`, `GET /today`, `GET /gyms`.
6. Extractions: `getTodayView`, `getWorkoutView`, `getMeView`; logging workflows with post-commit goal reconciliation; one entitlement resolve per request; side-effect fencing.
7. Migration `9p_mobile_api`: the `ApiIdempotencyKey` owned table (RLS, immutable `user_id` trigger, FK to profiles) and the `mobile_api_request` throttle action.
8. `withIdempotency` and the per-account rate limiter.
9. Tests: unit (pipeline, version, errors, auth classification, proxy), static guards (route conventions, endpoint registry, side-effect fence), integration (endpoint isolation suite, idempotency, rate limit, view parity, deletion and export of the new model).
10. The owner runbook and live verification against overload-dev.

### Out of scope

- Any other endpoint, including `POST /gyms` and every write endpoint (21e onward). The idempotency mechanism ships with no route using it; it is proven in integration tests.
- The Expo app, native screens, token storage and refresh, the version-gate screen (21d).
- A suspended-account data-rights exception on the API (export and deletion are 21j).
- Mobile signup, the mobile bot challenge, per-device signup limits (21d).
- Changing goal behavior on `/exercises/[id]` (F-T12's missing reconcile stays as it is; see RD-14).
- Pruning idempotency records, a CI service, Production rollout.

## 4. Core concepts

| Concept | Description |
| --- | --- |
| Request pipeline | `mobileRoute(handler)` / `publicMobileRoute(handler)`: the only way an API route is built. Runs `connection()`, the version gate, (authenticated) token verification, account resolution, suspension check, rate limit, the handler, and error mapping, in that order. Sets `Cache-Control: no-store` on every response. |
| Verified identity | The Supabase user returned by `getUser(token)` on a cookie-less anon client. The only source of the acting `userId`. Its email feeds `/me`. |
| No-create resolution | `resolveExistingAccountState(userId)`: like `resolveAccountState` but returns `null` when no `Profile` exists. The API answers 401 then. Profiles are created only by signup (`establishProfile`) and by the web's lazy path. |
| App version | `X-Overload-App-Version: MAJOR.MINOR.PATCH` (non-negative integers, no pre-release). Required on every endpoint except `app-config`. |
| App config | `AppConfigDto` built from `MOBILE_MIN_APP_VERSION`, `MOBILE_LATEST_APP_VERSION`, `MOBILE_MAINTENANCE`, `PLAN_IMPORT_ENABLED` (via `isPlanImportEnabled`), and the signup mode (`public` only when `signupMode()` is `public`; `invite` and `closed` both read `closed`). |
| Idempotency record | One `ApiIdempotencyKey` row per `(account, key)`: the request's scope and hash, and the successful response. Written in the same transaction as the create it guards. |
| Rate-limit window | A fixed 60-second window per account, counted in `AuthThrottle` under action `mobile_api_request` with a SHA-256 key of the account id. |
| View function | An account-scoped read that composes existing queries into one contract DTO (`TodayDto`, `WorkoutViewDto`, `MeDto`). Lives in `apps/web/src/lib/views/`, never in `packages/shared`. |

## 5. States and lifecycle

No product state changes. The request pipeline's decision order is the only new lifecycle:

```text
request ─→ connection() ─→ version gate ──(missing/invalid: 400; below min: 426)
        ─→ public route? ── yes ─→ handler
        ─→ bearer parse ──(absent/malformed: 401)
        ─→ getUser(token) ──(rejected: 401; Auth unreachable: 503)
        ─→ profile exists? ──(no: 401)
        ─→ suspended? ──(yes: 403)
        ─→ touchLastActive ─→ rate limit ──(over: 429 + Retry-After)
        ─→ handler ──(DomainError: mapped; anything else: 500)
```

## 6. Request pipeline and errors

### 6.1 Status map

`src/lib/api/mobile/errors.ts` holds one exhaustive `Record<ApiErrorCode, number>` (compile-checked against `API_ERROR_CODES`):

| Code | Status | Use |
| --- | --- | --- |
| `validation_error` | 400 | Bad input, including a missing or malformed version header or `Idempotency-Key` |
| `invalid_state_transition` | 400 | (api-conventions) |
| `unauthorized` | 401 | No, malformed, expired, revoked, or rejected token; no profile |
| `plan_required` | 402 | A capability-gated write (none in 21c) |
| `account_suspended` | 403 | Suspended account |
| `not_found` | 404 | Missing or another account's resource; unknown API path |
| `conflict` | 409 | Incompatible change; an `Idempotency-Key` reused for a different request |
| `upgrade_required` | 426 | App version below the minimum |
| `rate_limited` | 429 | Over the per-account window (with `Retry-After`) |
| `internal_error` | 500 | Unexpected failure; 503 when Supabase Auth is unreachable (RD-6) |
| `import_unavailable` | 503 | (not produced in 21c) |

### 6.2 Response helpers

```ts
// src/lib/api/mobile/errors.ts
export const API_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>>;
export class ApiFailure extends Error { constructor(readonly code: ApiErrorCode, message: string, readonly details?: Record<string, string>, readonly status?: number, readonly headers?: Record<string, string>) }
export function apiJson<T>(body: T, init?: { status?: number; headers?: Record<string, string> }): Response; // adds Cache-Control: no-store, JSON content type
export function apiErrorResponse(failure: ApiFailure): Response;         // { error: { code, message, details? } }
export function toApiFailure(error: unknown): ApiFailure;                // DomainError → its code; ApiFailure as is; anything else → internal_error, logged by error name only
```

`internal_error` message: "Something went wrong. Nothing was changed." Messages never contain an email, a name, an id the caller did not send, a database error, or a stack.

### 6.3 Pipeline

```ts
// src/lib/api/mobile/pipeline.ts
export type MobileContext = { account: Account; email: string; request: Request; appVersion: AppVersion };
export function mobileRoute<P>(handler: (ctx: MobileContext, params: P) => Promise<Response>): (request: Request, route: { params: Promise<P> }) => Promise<Response>;
export function publicMobileRoute<P>(handler: (request: Request, params: P) => Promise<Response>): (request: Request, route: { params: Promise<P> }) => Promise<Response>;
```

- `await connection()` first, so no route is prerendered at build time (cacheComponents).
- Every throw is caught and converted by `toApiFailure`; nothing escapes as an HTML error page.
- Handlers never use `redirect()`, `notFound()`, `refresh()`, `cookies()`, or FormData (guarded, §13.3).
- `src/app/api/mobile/[...path]/route.ts` answers every method on an unknown path with 404 `not_found` JSON, through `publicMobileRoute` (no version check, so it never masks a 404 as 400).

## 7. Authentication and account lifecycle

### 7.1 Token verification

```ts
// src/lib/supabase/token.ts  (server-only; AUTH ONLY, never an application table)
export type TokenVerdict =
  | { kind: "user"; userId: string; email: string }
  | { kind: "rejected" }       // Auth answered: the token is not valid now
  | { kind: "unavailable" };   // Auth could not be reached or failed (5xx / network)
export async function verifyAccessToken(token: string): Promise<TokenVerdict>;
```

- Client: `createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })`, created per call (no cross-request state). Never the service role.
- `getUser(token)` asks the Auth server, which refuses expired tokens, tokens for deleted users, and tokens whose session was signed out (revoked). No local JWT verification is used at all.
- An `AuthApiError` with a 4xx status, or no user, is `rejected`. A network/retryable error or a 5xx is `unavailable`.
- A user without an email cannot occur (email+password only); it is treated as `rejected`.

### 7.2 Bearer parsing

`Authorization` must be `Bearer <token>` (scheme case-insensitive, one space). The token must be at most 8,192 characters and match `^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$` (JWT shape). Anything else is 401 without a network call.

### 7.3 Account resolution

```ts
// src/lib/data/account.ts (new, beside resolveAccountState)
export async function resolveExistingAccountState(userId: string): Promise<ResolvedAccount | null>;

// src/lib/data/mobile-auth.ts
export type MobileAuthResult =
  | { ok: true; account: Account; email: string }
  | { ok: false; failure: ApiFailure };
export async function authenticateMobileRequest(request: Request, deps?: { verify?: typeof verifyAccessToken }): Promise<MobileAuthResult>;
```

Steps: parse bearer → `verify` → `resolveExistingAccountState(userId)` → `null` is 401 → `suspended` is 403 `account_suspended` ("This account is suspended.") with nothing recorded → `touchLastActive` → ok. The function lives in `src/lib/data` because the static guard restricts account construction to that folder; a new guard pins its only importer to `src/lib/api/mobile/pipeline.ts`.

**Deleted accounts.** Deletion removes the profile and owned rows in one transaction, then the auth identity. A token presented after the identity is gone is rejected by `getUser`. A token presented in the window between the database transaction and the identity removal passes `getUser` but finds no profile, and gets 401 instead of recreating one. A profile is never created by the API.

## 8. App config and version gate

```ts
// src/lib/api/mobile/version.ts
export type AppVersion = readonly [number, number, number];
export function parseAppVersion(raw: string | null | undefined): AppVersion | null; // strict MAJOR.MINOR.PATCH, each 0..999999, no leading "v", no pre-release
export function compareAppVersions(a: AppVersion, b: AppVersion): -1 | 0 | 1;
export function mobileAppConfig(env?: Record<string, string | undefined>): AppConfigDto;
export function checkAppVersion(header: string | null, config: AppConfigDto): ApiFailure | AppVersion;
```

| Env var (server-only) | Default | Rule |
| --- | --- | --- |
| `MOBILE_MIN_APP_VERSION` | `0.0.0` | Must parse; an unset or invalid value uses the default and logs the variable name (never the value) once per process. |
| `MOBILE_LATEST_APP_VERSION` | the minimum | Must parse; a value below the minimum is raised to the minimum. |
| `MOBILE_MAINTENANCE` | off | On only when exactly `"true"`. Advisory: returned in app config; the API keeps serving (RD-10). |

- Missing or unparseable header: 400 `validation_error`, `details: { "X-Overload-App-Version": "Send the app version as MAJOR.MINOR.PATCH." }`.
- Below the minimum: 426 `upgrade_required`, "This version of Overload is no longer supported. Update the app to continue."
- `GET /app-config` never applies the gate (an old app must be able to read it). It reads only the env vars above, `isPlanImportEnabled()`, and `signupMode()`; it never reads `OVERLOAD_INVITE_CODE`, admin ids, keys, or URLs.

## 9. Endpoints (the 21c inventory)

All under `/api/mobile/v1`, all `GET`, all `Cache-Control: no-store`.

| Endpoint | Auth | Response | Wraps | Capability | Side effects |
| --- | --- | --- | --- | --- | --- |
| `/app-config` | public | `AppConfigDto` | `mobileAppConfig()` | — | none |
| `/me` | token | `MeDto` | `getMeView(account, email)` | — (entitlement displayed, never used to unlock) | `touchLastActive` |
| `/today` | token | `TodayDto` | `getTodayView(account)` | planned calls and summary gated by `progression_insights`; `locked` kept | `touchLastActive`; goal reconciliation when the dashboard shows goals (as the web) |
| `/gyms` | token | `GymsResponseDto` = `{ gyms: GymListItemDto[] }` | `listActiveGyms` | — | `touchLastActive` |

Retry safety: all four are reads; a retry returns the same answer (Today's reconciliation is a conditional, idempotent transition). No pagination: gyms are few (the web lists them unpaginated). Backward compatibility: v1 changes are additive (21b wire rule 6).

### 9.1 `getMeView`

```ts
// src/lib/views/me.ts
export async function getMeView(account: Account, email: string, now?: Date): Promise<MeDto>;
```

Composes, through the scoped client only: `getSettingsProfile`, `getEmailVerification(account, email)`, `getAccountAppearance`, `resolveEntitlement` (→ `EntitlementDto`, capabilities as a sorted array), `getTourAutoStart`, `getWhatsNewDialog`, `getTrialNotice(account, { inAppShell: true })` (so `purchasable` is always false). It applies the web layout's one-dialog precedence: tour first, then the trial notice, then What's New (`trialNotice = autoStart ? null : notice`; `whatsNew = autoStart || trialNotice ? null : unseen`). No Stripe call.

### 9.2 `getTodayView`

```ts
// src/lib/views/today.ts
export async function getTodayView(account: Account, opts?: { now?: Date }): Promise<TodayDto>;
```

Exactly the page's current order and inputs:

1. `getTodayDashboard(account)` and `getGreetingFacts(account, now)` in parallel; `resolveEntitlement(account, now)` once.
2. `greeting = composeGreeting({ dashboard, firstName, timeZone, firstVisit, accountKey: account.userId, now })`.
3. If `dashboardShowsGoals(dashboard.kind)`: `reconcileGoalCompletionsSafely(account)` (before any goal read).
4. Planned progression for the day the page would show: the dashboard itself when its kind is `pending`/`in_progress`, `dashboard.below` when the kind is `missed_day` and `below` is not null; otherwise none. One `getPlannedProgression(account, e.exerciseId, { scheduledDeloadWeek, entitlement })` per exercise, in list order.
5. If kind is `complete` with a `loggedSessionId`: `getSessionProgressionSummary(account, id, { entitlement })` and `getSessionGoalSummary(account, id)`.
6. If goals are shown: `listUnacknowledgedCompletions`, `listActiveGoals(take: DASHBOARD_GOAL_LIMIT)`, `countActiveGoals`.

`TodayDto` is finalized (no client exists yet, so this is not a v1 break; 21b RD said 21c finalizes the composition):

```ts
export type TodayGoalsDto = { reached: GoalReachedDto[]; active: ActiveGoalDto[]; activeTotal: number };
export type TodayDto = {
  today: IsoDate;                 // accountToday(account)
  greeting: string;
  dashboard: DashboardDto;
  /** One entry per exercise of the day shown (the dashboard, or `below` on a missed day), in list order. */
  plannedProgression: { exerciseId: string; progression: PlannedProgressionDto }[];
  sessionSummary: SessionProgressionSummaryDto | null;
  sessionGoals: SessionGoalRowDto[];
  /** Present only when the dashboard shows goals (no training action pending). */
  goals: TodayGoalsDto | null;    // replaces the 21b draft's `activeGoals`
};
```

`DASHBOARD_GOAL_LIMIT` (3) moves from the component into `src/lib/views/today.ts` and is re-exported for the component.

### 9.3 `getWorkoutView` (extraction only; no endpoint until 21e)

```ts
// src/lib/views/workout.ts
export async function getWorkoutView(account: Account, loggedSessionId: string): Promise<WorkoutViewDto | null>;
```

`getWorkout` (null when missing or foreign), one `resolveEntitlement`, then `getOccurrenceProgression(account, e.loggedExerciseId, { entitlement })` per exercise in order; entries whose progression is null are omitted. The workout page maps it to `CardProgression` with the same fallbacks it uses today.

### 9.4 Entitlement once per request

`getPlannedProgression`, `getOccurrenceProgression`, and `getSessionProgressionSummary` gain an optional `entitlement?: ResolvedEntitlement` in their options. When given, they use it; when absent, they resolve as today. The gate functions are unchanged, so the gated output is byte-identical.

## 10. Extractions and side-effect fencing (web behavior unchanged)

| Item | Before | After |
| --- | --- | --- |
| Today page | Page + `CompleteBlock`/`TodayBlock`/`DashboardGoals`/`SessionGoalRows` each fetch | Page calls `getTodayView`; the blocks and the two goal components take props. Same markup, copy, anchors, order. |
| Workout page | Page loops `getOccurrenceProgression` | Page calls `getWorkoutView` |
| Post-write reconcile | `log/actions.ts` (log set, complete), `history/actions.ts` (edit set, edit planned sets) call `reconcileGoalCompletionsSafely` | `src/lib/logging/workflows.ts`: `logSetAndReconcile`, `completeWorkoutAndReconcile`, `editLoggedSetAndReconcile`, `editPlannedSetsAndReconcile` — the write (its own transaction), then the best-effort reconcile after commit. Actions call these. |
| Pre-render reconcile | Today page and five goal pages | Today through `getTodayView`; the five goal pages unchanged (they already call the one engine). A guard keeps `reconcileGoalCompletionsSafely` out of every `actions.ts`. |
| Stripe refresh on `/settings/billing` | page-load write | unchanged, web-only; a guard forbids `@/lib/billing/sync` and `@/lib/import/retention` under `src/app/api/mobile/` and `src/lib/views/` |
| Import retention on `/plan/import` | page-load write | unchanged, web-only; same guard |

Goal semantics, reconciliation timing (never inside a set transaction), and every page's output are unchanged.

## 11. Rate limiting

- Per account, after authentication: `checkAndIncrement("mobile_api_request", account.userId, now, { limit: 120, windowSeconds: 60 })` from `src/lib/accounts/throttle.ts` (the sanctioned raw module; the key is SHA-256-hashed, so the table never holds the id).
- `throttle.ts` gains a per-action policy: `signup` and `password_reset_request` keep 10 per 60 s; `mobile_api_request` is 120 per 60 s (`MOBILE_API_RATE_LIMIT`, `MOBILE_API_RATE_WINDOW_SECONDS`).
- Over the limit: 429 `rate_limited`, "Too many requests. Try again in a moment.", `Retry-After: <seconds to the window end>`.
- Fails closed like the existing throttle (a counter write that throws refuses the request with 429).
- `app-config` and the unknown-path 404 are not counted: they read no database and cost less than a counter write.
- No per-IP limit (RD-8).

## 12. Idempotency

### 12.1 Mechanism

```ts
// src/lib/api/mobile/idempotency.ts
export const IDEMPOTENCY_HEADER = "Idempotency-Key";
export function parseIdempotencyKey(raw: string | null): string | ApiFailure; // 8..255 chars of [A-Za-z0-9._:-]
export function requestFingerprint(scope: string, body: unknown): string;    // sha256 hex of scope + "\n" + canonical JSON (keys sorted, recursively)
export async function withIdempotency<T extends JsonValue>(
  account: Account,
  args: { key: string; scope: string; body: unknown },
  run: (tx: AccountTx) => Promise<{ status: number; body: T }>,
): Promise<Response>;
```

In one `account.db.$transaction` (timeout 15 s):

1. **Claim:** `tx.apiIdempotencyKey.create({ data: { key, scope, requestHash } })` (the scope layer stamps `userId`). A concurrent request with the same key blocks on the `(user_id, key)` unique index until the first transaction ends.
2. **Run** the create with `tx`, so the create and the claim commit or roll back together.
3. **Record:** update the row with `responseStatus` and `responseBody`. Commit. Respond with the result.

On any failure of the transaction, read the key outside it (`account.db.apiIdempotencyKey.findFirst({ where: { key } })`, scoped):

- A committed row with the same `scope` and `requestHash` → **replay**: its stored status and body, plus `Idempotent-Replayed: true`. (This covers the concurrent duplicate, which fails on the unique index, or on the guarded resource's own constraint, once the first commits.)
- A committed row with a different scope or hash → 409 `conflict`, "This Idempotency-Key was already used for a different request."
- No row → the original failure, mapped normally. Nothing was recorded, so the same key can be retried.

Only successes (2xx) are stored. Keys are per account: account B sending account A's key finds no row of A's (the scoped read and the `(user_id, key)` unique index never cross accounts), runs its own request, and records its own row. No client-supplied primary key exists anywhere. Records are kept until the account is deleted (RD-7).

### 12.2 Who uses it

No 21c route. Later create endpoints (gyms, custom exercises, goals, mesocycles, feedback) wrap their lib create (which already accepts a scoped `tx`) in `withIdempotency`; a missing header on such an endpoint is 400 `validation_error`. Natural-key writes keep their own semantics and never use it.

## 13. Data model

### 13.1 New model

```prisma
/// Mobile API idempotency (Pitch 21c). One row per (account, Idempotency-Key):
/// the first successful response to a create, replayed for a retry with the
/// same request. Owned; reached only through account.db; removed with the
/// account; part of its export. No client-supplied primary key anywhere.
model ApiIdempotencyKey {
  id             String   @id @default(uuid()) @db.Uuid
  userId         String   @map("user_id") @db.Uuid
  /// Client-generated, 8..255 chars of [A-Za-z0-9._:-]. Unique per account only.
  key            String
  /// "METHOD /v1/path-template", e.g. "POST /v1/gyms".
  scope          String
  /// SHA-256 hex of the scope and the canonical JSON body.
  requestHash    String   @map("request_hash")
  /// Set in the same transaction that claims the key; never committed null.
  responseStatus Int?     @map("response_status")
  responseBody   Json?    @map("response_body")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz

  profile Profile @relation(fields: [userId], references: [userId], onDelete: Restrict, onUpdate: Restrict)

  @@unique([userId, key])
  @@index([userId])
  @@map("api_idempotency_keys")
}
```

`Profile` gains `apiIdempotencyKeys ApiIdempotencyKey[]`. `AuthThrottleAction` gains `mobile_api_request`.

### 13.2 Migration `9p_mobile_api` (hand-written, additive, ASCII only)

```sql
ALTER TYPE "auth_throttle_action" ADD VALUE IF NOT EXISTS 'mobile_api_request';

CREATE TABLE "api_idempotency_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "api_idempotency_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "api_idempotency_keys_key_check" CHECK (char_length("key") BETWEEN 8 AND 255),
    CONSTRAINT "api_idempotency_keys_status_check" CHECK ("response_status" IS NULL OR "response_status" BETWEEN 200 AND 299)
);
CREATE UNIQUE INDEX "api_idempotency_keys_user_id_key_key" ON "api_idempotency_keys" ("user_id", "key");
CREATE INDEX "api_idempotency_keys_user_id_idx" ON "api_idempotency_keys" ("user_id");
ALTER TABLE "api_idempotency_keys" ADD CONSTRAINT "api_idempotency_keys_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "api_idempotency_keys" ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER "api_idempotency_keys_user_id_immutable" BEFORE UPDATE OF "user_id" ON "api_idempotency_keys"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
```

Nothing is dropped, renamed, or rewritten. Applied to overload-dev during the run with the guarded wrapper (`npm run db:migrate:dev -- --confirm-ref vdxrmfadikwzodjljbdi --execute`); Production is a human runbook step at promotion.

### 13.3 Owned-model obligations

- Scope layer: picked up automatically (DMMF `userId`).
- Deletion: `ApiIdempotencyKey` joins `ACCOUNT_DELETION_ORDER` before `Profile` with a `deleteMany` step (the QA fixture reset reuses it).
- Export: `apiIdempotencyKeys` joins `AccountExport` (format version unchanged, as with earlier additive models).
- Isolation registry: `ApiIdempotencyKey: ["mobile-api.int.test.ts", "account-deletion.int.test.ts"]`.
- RLS: covered by the existing RLS posture test (every table, zero policies).

### 13.4 Derived fields

Nothing derived is stored. Today's tags, suggestions, summaries, greeting, and goal percentages are computed per request exactly as on the web.

## 14. Authorization and access control

| Endpoint | Read | Write | Isolation behavior |
| --- | --- | --- | --- |
| app-config | public, environment only | none | no account data |
| me | acting account's profile, entitlement, notices | last-active date | only the token's account |
| today | acting account's dashboard, progression (gated), goals | last-active date; goal completion (conditional) | another account's plan, sessions, goals never appear |
| gyms | acting account's active gyms | last-active date | another account's gyms never appear |

The account id is never read from the path, query, body, or any header other than the verified token. Hiding is not enforcement: Free accounts get `locked` from the server.

## 15. Proxy exemption

- `src/lib/auth-routes.ts`: `MOBILE_API_PREFIX = "/api/mobile"`, `isMobileApiPath(pathname)` (exact or `startsWith("/api/mobile/")`; `/api/mobilex` does not match), and the prefix joins `PUBLIC_PATHS` so `routeRedirect` never redirects it.
- `src/proxy.ts`: returns `NextResponse.next()` for a mobile API path **before** creating the Supabase cookie client, so a bearer request does no cookie refresh and no `getUser` in the proxy. Every other path behaves exactly as before.

## 16. Validation rules

| Input | Rule | Error |
| --- | --- | --- |
| `X-Overload-App-Version` | strict `MAJOR.MINOR.PATCH` | 400 `validation_error` |
| `Authorization` | `Bearer <JWT-shaped token>`, ≤ 8,192 chars | 401 `unauthorized` |
| `Idempotency-Key` (later create endpoints) | 8–255 chars `[A-Za-z0-9._:-]`; required where the endpoint uses it | 400 `validation_error` |
| Unknown query parameters on the four GETs | ignored | — |

Request bodies (21e onward) are validated by the shared parsers the web already uses; no second rule set (21b RD).

## 17. Testing strategy

### 17.1 Unit (`npm test`)

- **Errors:** every `ApiErrorCode` has a status; `toApiFailure` keeps a `DomainError`'s code/message/details and turns anything else into `internal_error` without its message.
- **Version:** parsing accepts `1.2.3`, `0.0.0`, rejects `v1.2.3`, `1.2`, `1.2.3-beta`, `01.2.3` (only canonical integers), empty, and numbers above 999999; comparison; config defaults, invalid env values, latest raised to minimum, maintenance only for `"true"`, signup mode mapping (`invite` → `closed`), and app config never contains the invite code or any env value beyond the listed ones.
- **Token verdicts:** `verifyAccessToken` classifies a user, a 4xx `AuthApiError`, no user, a retryable/network error, and a 5xx (mocked supabase-js).
- **Bearer parsing:** absent, wrong scheme, empty, non-JWT shape, oversized.
- **Pipeline:** order (version before auth; 426 even with a bad token), 401/403/429/500 bodies and statuses, `Cache-Control: no-store` on success and failure, `Retry-After`, no HTML.
- **Proxy:** `isMobileApiPath`; `routeRedirect` returns null for `/api/mobile/v1/me` signed out; `/api/mobilex` still redirects; other paths unchanged; the proxy returns before the Supabase client for API paths.
- **Static guards** (`mobile-api-guards.test.ts`): every `route.ts` under `src/app/api/mobile` builds its handlers with `mobileRoute`/`publicMobileRoute`; the public set is exactly `v1/app-config` and the catch-all; route files never import the raw client, Prisma, `account-db`, cookie auth (`@/lib/auth`, `@/lib/data/account`'s `requireAccount*`, `@/lib/supabase/server`), `next/navigation`, `next/headers`, billing sync or checkout, import retention, or admin; never mention `userId`, `accountId`, or `ownerId`; the endpoint registry (`tests/support/mobile-endpoints.ts`) equals the exported methods of every route; `authenticateMobileRequest` is imported only by the pipeline; `src/lib/views/**` never imports billing sync or import retention; no `actions.ts` imports `reconcileGoalCompletionsSafely`. The account-construction guard also bans `resolveExistingAccountState` outside `src/lib/data`.

### 17.2 Integration (`npm run test:integration`, embedded Postgres; token verification mocked to map opaque test tokens to test accounts)

- **Endpoint isolation suite** (`isolation/mobile-api.int.test.ts`), for every registry entry: A and B each have data; B's `me`/`today`/`gyms` contain none of A's names, ids, gyms, goals, or sessions; no token, a malformed token, a rejected token → 401; suspended → 403 and last-active unchanged; a verified user with no profile → 401 and **no profile is created**; Free on `today` → every planned progression and the summary `locked: "progression_insights"` with Pro fields null; Pro → unlocked; old version → 426; missing version → 400; the registry has a case for every entry.
- **Contract conformance:** each 200 body round-trips through `JSON.parse(JSON.stringify())` unchanged (no Date, no undefined) and matches the shared DTO's keys; dates are `YYYY-MM-DD` strings in the account's zone (a UTC−10 account late in its evening sees its own date).
- **View parity:** `getTodayView` equals the composition from the individual queries across no-plan, rest, cardio-only, missed day (with `below`), pending, in-progress, complete-with-goals; `getWorkoutView` equals the old loop.
- **Idempotency:** first call records; replay returns the stored body with the replay header and creates nothing; same key with a different body → 409; a failing run (DomainError) records nothing and the same key then succeeds; two concurrent calls with one key create one row and both answer the same body; B with A's key gets B's own result and A's row is untouched; the record is deleted with the account and present in its export.
- **Rate limit:** the 121st request in a window → 429 with `Retry-After`; another account is unaffected; the next window resets; the throttle row holds no raw id.
- **Existing suites:** RLS posture (new table), isolation coverage meta-test, deletion and export completeness, QA fixture baseline, goals and logging (workflow functions keep reconcile after commit).

### 17.3 Live (overload-dev, local production build)

Real tokens from `signInWithPassword` for throwaway reserved-domain accounts: valid token works with no cookie; an expired token (minted ≥ 1 h earlier) → 401; a token after global sign-out → 401; a token after the account is deleted through the deletion module → 401 and no profile row reappears; suspended → 403; unauthenticated → JSON 401, not a redirect; Free vs Pro `today`; 426 for an old version. The Vercel Preview of the feature branch must build; its endpoints sit behind Vercel Deployment Protection, so they are exercised on the local build.

### 17.4 Unverified by design

Anything on a device, simulator, Expo, or Hermes (21d).

## 18. Acceptance criteria

- [ ] `GET /api/mobile/v1/app-config` returns `AppConfigDto` with no token, for any version header, with no secret.
- [ ] `GET /me`, `/today`, `/gyms` return the acting account's DTOs for a valid token and no cookie.
- [ ] No, malformed, expired, revoked, rejected, and deleted-account tokens → 401 JSON; Auth unreachable → 503 JSON; suspended → 403 `account_suspended`.
- [ ] The API never creates a profile.
- [ ] Unauthenticated API requests are not redirected; other routes' redirects are unchanged.
- [ ] Missing/invalid version → 400; below minimum → 426 `upgrade_required`; at or above → served.
- [ ] Every endpoint is in the registry and has isolation, auth-failure, suspension, and version cases.
- [ ] Free accounts get `locked` with null Pro fields on Today; Pro accounts get calls.
- [ ] Responses are JSON-safe and conform to the shared DTOs; dates are account-zone ISO dates.
- [ ] `withIdempotency` replays, refuses conflicting reuse, leaves no record on failure, serializes concurrency, and never crosses accounts.
- [ ] The 121st request a minute from one account gets 429; other accounts are unaffected.
- [ ] Migration `9p_mobile_api` applies to overload-dev; the new table has RLS, the immutable trigger, deletion, export, and isolation coverage.
- [ ] Today, the workout runner, logging, history edits, goals, billing, and plan import behave exactly as before.
- [ ] Lint, typecheck, format, unit, boundaries, integration, build, client-bundle scan, e2e pass.

## 19. Explicit non-goals

- ❌ Any write endpoint or any endpoint beyond the four. **Deferred** (21e–21j).
- ❌ A purchase flow or purchase link in any API response. **Permanent until the store billing path is decided.**
- ❌ Admin, billing, checkout, plan import, plan builder through the API. **Web-only.**
- ❌ Offline sync, realtime, queues, caches. **Permanent decisions.**
- ❌ Running the progression engine on the client. **Permanent.**

## Resolved Decisions

| # | Decision | Rationale | Authority |
| --- | --- | --- | --- |
| RD-1 (OQ1) | The API verifies with `getUser(token)` and resolves the account with a new **no-create** resolver; a verified user without a profile gets 401. | Closes the deleted-account window completely, including the gap between the deletion transaction and the identity removal; every real account has a profile from signup. | Roadmap, audit F-A6, pitch rabbit hole A |
| RD-2 (OQ2) | Exactly four endpoints: `GET app-config`, `GET me`, `GET today`, `GET gyms`. No `POST /gyms`. | The audit's foundation inventory lists only these; creates arrive with their slices. | Audit §2, pitch §6/§7H |
| RD-3 (OQ3) | The proxy returns early for `/api/mobile` (and the prefix joins `PUBLIC_PATHS`); authentication happens only in the pipeline. Unknown API paths get a JSON 404. | Narrowest change; no cookie work on bearer requests; never HTML. | Audit F-A5 |
| RD-4 (OQ4) | View compositions live in `apps/web/src/lib/views/`; post-write reconcile in `src/lib/logging/workflows.ts`. Web pages read the same views. | Account-scoped orchestration stays on the server; one truth for both clients. | CLAUDE.md shared-package rules |
| RD-5 (OQ5) | Stripe refresh and import retention stay page-load writes on their web-only pages and are fenced off from the API by a static guard. The only writes on an API read are last-active and goal completion, both of which the web already makes on every comparable request. | Billing and import are web-only; mobile `me` reads the mirror the webhooks maintain. | Audit §2b, CLAUDE.md web-only list |
| RD-6 | Supabase Auth unreachable → 503 `internal_error` ("Couldn't verify your sign-in right now."), not 401. | A 401 would sign the lifter out during an outage. No new code is added. | Design §6 |
| RD-7 (OQ7) | Idempotency: claim-run-record in one transaction; only successes stored; replay on match, 409 `conflict` on mismatch; per-account keys; records kept until account deletion (no pruning). | No scheduler exists; rows are tiny and creates are rare; deletion and export already cover owned models. | CLAUDE.md (no cron), audit §2 |
| RD-8 (OQ8) | Rate limit per **account** (120 / 60 s) on the existing `AuthThrottle` with a new action; no per-IP limit on the API; `app-config` not counted. Fails closed. | Carrier NAT makes IP limits brittle; unauthenticated requests reach no data and do no database work; no new service or cost. | Pitch §3J, existing throttle |
| RD-9 (OQ9) | Version and maintenance come from server-only env vars with safe defaults (`0.0.0`, latest = minimum, maintenance off); invalid values fall back to the default and log the variable name. | Env vars are the audit's recommendation; defaults keep staging working with nothing set; a typo never bricks every installed app. | Audit §5 item 4 |
| RD-10 | `maintenance` is advisory (returned in app config only); the API keeps serving. | No `maintenance` error code exists, and a parallel taxonomy is forbidden; refusing mid-workout writes would lose data the lifter is entering. | 21b `AppConfigDto` comment, pitch §3G |
| RD-11 | A missing or malformed version header → 400 `validation_error`; `app-config` and the unknown-path 404 never check the version. | Every real build sends the header from 21d on; an old app must still read app config. | Pitch §3H |
| RD-12 (OQ10) | List responses are objects (`{ gyms: [...] }`), and `TodayDto` is finalized now (`goals` replaces the draft `activeGoals`). | Top-level arrays cannot grow additively; no client exists yet, so finalizing is not a v1 break. | 21b spec §11 ("21c may extend"), wire rule 6 |
| RD-13 (OQ11) | Endpoint security is enforced by a pipeline every route must use, static route guards, and an endpoint registry the isolation suite must cover entry by entry. | Maintainable by one developer; a new route cannot skip auth or isolation tests without failing `npm test`. | Audit §7 items 1–5 |
| RD-14 | `/exercises/[id]` keeps not reconciling goals. | Adding it changes goal behavior, which the pitch forbids; the goal endpoints in 21i reconcile through the same engine. Recorded for the owner. | Pitch §3E |
| RD-15 | `me` applies the web layout's one-dialog precedence and requests the trial notice as in-app-shell (never purchasable). | One truth; no purchase flow in the app. | CLAUDE.md mobile rules |
| RD-16 | Gated readers accept a pre-resolved entitlement; views resolve once per request. | React `cache` does not memoize in route handlers; output stays identical because the gate functions are unchanged. | Audit §2 read modules |
| RD-17 (OQ12) | Owner verification is a short runbook: confirm the migration on overload-dev and run three curl checks against a local or protected preview; everything else is automated. | Non-UI foundation; the suites cover the security matrix. | Pitch OQ12 |
| RD-18 (OQ13) | Feature branch → `staging` only; the migration is applied to overload-dev before the merge; nothing reaches Production. | Branching workflow. | CLAUDE.md |
| RD-19 | API conventions name the app-config fields `minSupportedVersion`/`latestVersion`; the shipped contract (`minimumAppVersion`/`latestAppVersion`) wins. | 21b contracts are the API's contract authority. | 21b spec |

## Open questions

None blocking. For the owner: whether the staging deployment's Vercel Deployment Protection should allow the app's requests in 21d (a protection-bypass header in development builds, or protection off for `/api/mobile`), since anonymous requests to the stable staging URL get Vercel's 401 before reaching the API.

## 20. Future considerations

- 21d: the app's API client sends the token and version on every call, retries once after a refresh on 401, and shows the update, suspension, and maintenance screens from these answers.
- 21e onward: each slice adds handlers on `mobileRoute`, registry entries, and isolation cases; creates use `withIdempotency`.
- 21j: a data-rights variant of the pipeline for a suspended account's export and deletion, pinned by a guard like `requireAccountForDataRights`.
- A pruning sweep for idempotency records, if a scheduler is ever approved.
