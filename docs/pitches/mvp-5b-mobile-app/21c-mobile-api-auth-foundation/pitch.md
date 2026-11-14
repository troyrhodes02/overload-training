# Pitch 21c — Mobile API & Auth Foundation

> Source: the approved expansion in Linear, "Pitch 21c: Mobile API & Auth Foundation" (Overload V1 project document, 2026-11-14), copied here unchanged in substance for the pipeline run of 2026-11-13. It expands `docs/planning/mobile-roadmap.md` → "21c — Mobile API & Auth Foundation (L)". The exact endpoint inventory comes from `docs/planning/mobile-audit.md` §2 ("21b — foundation" in the audit's older numbering is this slice). Where the audit disagrees with the current code (several findings were fixed in MVP 5A), the code wins.

**Product:** Overload
**Milestone:** MVP 5B — Mobile App (`mvp-5b-mobile-app`)
**Parent:** Pitch 21 — React Native + Expo Mobile App
**Type:** Foundational
**Appetite:** L — Large
**Status:** Ready for pipeline
**UI-bearing:** No
**Client scope:** Backend (the existing Next.js app in `apps/web`), serving the future native iPhone app
**Plan placement:** No new Free or Pro capabilities; existing entitlements enforced
**Pitch folder:** `docs/pitches/mvp-5b-mobile-app/21c-mobile-api-auth-foundation/`

## 1. Problem

Overload's web application is built around authenticated server-rendered pages, server actions, and a secure account-scoped database layer. The upcoming React Native iPhone app cannot rely on Next.js session cookies, server components, or web-specific actions to reach a lifter's training data. It needs a secure, stable interface to the existing backend.

The problem is not simply exposing database records over HTTP. Overload's capabilities depend on established rules:

- Workout history belongs to the authenticated lifter.
- Training plans and recorded workouts stay consistent.
- Gym-specific working weights keep their meaning.
- Progression recommendations come from the existing engine.
- Free and Pro capabilities are enforced on the server.
- Suspended and deleted accounts do not regain access.
- Network failures do not create duplicate records.
- Older installed app versions fail safely when no longer supported.

Prisma's connection bypasses row-level security, so account isolation depends on every operation passing through the scoped data-access layer. New endpoints without that protection could let one lifter reach another's training data.

Pitch 21b established the shared contracts and portable training rules. What does not exist yet is the authenticated, versioned API that connects those contracts to authorized server-side operations. **Pitch 21c creates that foundation without a second backend and without changing the web experience.**

## 2. Appetite

**Large (L).** The work spans authenticated mobile requests, version handling, error responses, retry safety, basic abuse protection, environment isolation, and extracting server-side view composition into reusable account-scoped modules. The main risk is not the number of endpoints but making every exposed operation inherit account isolation, entitlement enforcement, and data integrity.

Bounded: one reusable versioned API foundation; only the initial endpoint set; the common mechanisms later slices need. Native screens and further feature endpoints belong to their own slices. Do not expand this into full mobile backend parity.

## 3. Solution shape

### A. A versioned mobile API

Under `/api/mobile/v1`, inside the existing Next.js backend, on the same business logic and database as the web. Not a separate service or a second data-access path. Initial capabilities: public app configuration, the authenticated account's basic information (`me`), Today, and the account's gyms. Exact routes and DTOs are settled in the design and spec from the audit and the 21b contracts. Every later endpoint reuses this foundation instead of its own auth, authorization, or error policy.

### B. Verified Supabase identity

The app will authenticate through Supabase Auth and send an access token. Every authenticated request verifies it with `getUser(token)` on a cookie-less anon client, never by local JWT decoding alone, because the web account loader can lazily recreate a missing profile and a locally valid token of a deleted account must not recreate it or restore access. The acting identity comes from the verified token, never from a client-supplied id. Fail safely for a missing, malformed, expired, revoked, or invalid token, and for an account that no longer exists or may not access Overload. A suspended account stays suspended.

### C. Exempt the API from web-session redirects

The proxy protects routes with browser-session behavior; native clients send no cookie. `/api/mobile` is exempted from the redirect, narrowly, without disabling API authentication or weakening other routes. An unauthenticated API request gets an API error, never a success or login HTML.

### D. Account isolation on every endpoint

The account comes from the verified token; data goes through the existing scoped layer. Never trust an account id from parameters, bodies, headers, query strings, or client state. No route queries owned Prisma models outside the scoped layer. Cross-account isolation tests cover every endpoint and become the standard for later endpoints.

### E. Reuse existing server-side logic

No reimplementation of workout, schedule, progression, or account logic. Extract, narrowly:

- **Today view composition** from the Today page, so the web and the API get the same state, with the account time zone and schedule behavior preserved.
- **Workout view composition**, as a foundation for later workout slices; UI rendering stays in the web. No workout logging API in this slice.
- **Goal reconciliation**, duplicated across pages and actions; consolidate without changing goal progress or completion.
- **Side effects during reads** (billing sync, plan-import retention): do not copy them into mobile GETs; separate reads from necessary mutations while preserving existing behavior.

Not permission to redesign logging, goals, billing, or plan import.

### F. Server-side Pro gating

Same named capabilities as the web, including trial, subscription, and comp. Never call an ungated progression builder from a mobile route; use the gated queries and keep `locked`. A Free account never receives Pro calculations or evidence by calling the API directly. Shared pure code does not change this: enforcement stays on the server.

### G. Consistent errors

The 21b envelope `{ error: { code, message, details? } }` with predictable statuses for: missing or invalid authentication, suspended or ineligible accounts, invalid input, unavailable resources, unsupported app versions, rate limiting, and unexpected failures. No database details, secrets, credentials, or another account's existence. Reuse the approved codes; no competing taxonomy.

### H. App configuration and version compatibility

A public app-config with the minimum supported version, the latest version, and approved kill switches. The client sends `X-Overload-App-Version`; a version below the minimum gets HTTP 426 `upgrade_required`. No secrets or internal controls in the public config. Within one API version changes stay backward compatible; breaking changes need a new version.

### I. Retry-safe write infrastructure

Natural-key operations (logging a set, starting a workout, logging cardio, absolute edits) keep their semantics. Create operations (goals, gyms, custom exercises, mesocycles, feedback) need an `Idempotency-Key` backed by a new account-owned table with RLS and scoped-layer coverage. This slice builds the shared mechanism, not every create endpoint. A client never submits a primary key whose collision could reveal another account's record.

### J. Basic rate limiting

Prevent trivial abuse and unbounded volume without interfering with normal workout use, on existing infrastructure. Carrier networks put many users behind one IP, so no naive IP-only rule. No new anti-abuse platform. Mobile signup protections belong to 21d.

### K. Development and Production isolation

Exercised against staging and `overload-dev` only. Staging never routes to Production. Nothing is promoted to Production by this pitch; the eventual rollout goes through the promotion process, with the beta slice owning Production compatibility checks. The Production web app is unaffected.

### L. An automated endpoint security standard

A repeatable check of each route's obligations: verified token identity, account scoping, suspended-account handling, entitlement enforcement where applicable, valid input and safe errors, version compatibility, retry protection for writes, rate-limit behavior, no leakage of server-only details. Isolation coverage is mandatory per endpoint, built on the existing integration-test architecture.

## 4. UI-bearing status

**No.** Backend only: no native screen, web screen, navigation, or user-visible setting. The web interface is unchanged. The UI-preview step is skipped: **"Skipped — no UI surface in this pitch."** API documentation and automated endpoint tests are the validation artifacts. No simulator or device test is required yet.

## 5. Plan placement

No new purchasable capability. Capture and history stay Free; Pro recommendations and evidence stay gated by named capabilities; trial, subscription, and comp keep their semantics; gating is on the backend; contracts and shared code never confer access.

## 6. Scope boundaries

**In scope:** the `/api/mobile/v1` foundation; public app configuration; `me`, `today`, and gyms; `getUser(token)` authentication; the narrow proxy exemption; identity only from verified authentication; the scoped data layer; existing entitlement logic; shared error mapping; minimum-version enforcement; kill-switch configuration; retry-safe write infrastructure and its persistence; basic rate limiting; environment isolation; reusable Today and workout view composition; goal-reconciliation consolidation; separating reads from hidden side effects; automated endpoint, security, and isolation coverage; staging deployment and verification.

**Out of scope:** the Expo app; native login, signup, reset, or sign-out screens; secure token storage; app navigation and design system; full workout logging endpoints; swap, cardio, and full history APIs; progression-insight UI and mobile purchase prompts; full plans, library, and goals APIs; native account and settings screens; billing and checkout for mobile; admin through the API; plan import on mobile; offline logging and sync; realtime; reimplementing the engine; new coaching or training features; changing workout calculations or validation; Production API activation or TestFlight.

## 7. Rabbit holes and no-gos

- **A. A valid-looking token for a deleted account.** No local JWT verification as the sole authority; use `getUser(token)` and preserve deleted-account behavior.
- **B. An unauthenticated request redirected to web login.** No fixing it by disabling API auth or weakening web route protection.
- **C. An unscoped query.** No direct owned-model Prisma access from a handler; no request-provided user ids.
- **D. Unauthorized progression data.** No ungated builder in a handler relying on the client to hide Pro data.
- **E. Side effects hidden in GETs.** An existing page loader is not automatically safe to expose unchanged.
- **F. Duplicates after timeouts.** A committed transaction does not make a retried HTTP request safe; no caller-chosen primary keys.
- **G. Incompatible app versions.** No changing the meaning of v1 responses without considering installed clients.
- **H. Overbuilding.** No endpoint just because its DTO exists.
- **I. Exposing server configuration.** No secrets, invite codes, authorization settings, or credentials in app-config.
- **J. Fragile IP-only rate limiting.**
- **K. Altering web behavior during extraction.** No refactoring of training semantics.
- **L. Treating staging as Production authorization.**

## 8. Dependencies

- **21a — Monorepo Move:** complete. **21b — Shared Package & Contracts:** complete on staging and released (103 contract types).
- Existing foundations: Supabase Auth; the account and profile lifecycle; Prisma and the scoped layer; RLS; named-capability entitlements; progression and goal logic; plans, schedules, gyms, and history; environment isolation; the unit, integration, and security suites.
- References: `docs/planning/mobile-audit.md`, `docs/planning/mobile-roadmap.md`, the Architecture Doc and PRD, the code after 21b, the 21b contracts, the scoped layer and auth helpers. The audit controls the exact initial endpoint inventory.
- **Next:** 21d — App Shell, Design System & Accounts (the Expo app, native account screens, secure token storage and refresh, the API client, the version-gate screen, shared states, and development builds).

## 9. Definition of Done

**Versioned API and authentication**
1. `/api/mobile/v1` is implemented in the existing backend.
2. Public app configuration is available without a browser session.
3. Authenticated `me`, Today, and gyms work against staging.
4. Authenticated requests use server-side `getUser(token)` with a cookie-less client.
5. Missing, malformed, expired, revoked, or invalid credentials are rejected correctly.
6. A deleted or suspended account cannot regain ordinary access through the API.
7. The proxy lets mobile API requests through without cookie-login redirects.
8. The acting account comes from verified identity, never from request-provided ids.

**Account security**
9. Every introduced endpoint has explicit cross-account isolation coverage.
10. A second account cannot read or affect the first account's data.
11. Every owned database operation goes through the scoped layer.
12. No direct database access or private server internals are exposed.
13. Existing web security and isolation stay intact.

**Business behavior**
14. Today and workout view composition are reusable by the web and the API.
15. The goal-reconciliation duplication is addressed without changing goal behavior.
16. Reads with hidden side effects are handled per the design.
17. The API uses the existing training model and server logic.
18. Pro gating stays effective, including locked states.
19. Existing web pages and workflows behave as before.

**Compatibility and reliability**
20. Errors use the common contract and appropriate statuses.
21. App config supplies the minimum and latest versions and kill switches.
22. Unsupported old versions get the upgrade-required response.
23. Supported versions keep working.
24. The idempotency infrastructure and its persistence follow the owned-table and isolation model.
25. Duplicate create requests are recognized and handled by the shared mechanism.
26. Basic rate limiting applies without interfering with legitimate use.
27. Staging stays isolated from Production.

**Verification and delivery**
28. Lint, typecheck, format, unit, integration, security, and build checks pass.
29. New security tests cover auth failures, version handling, idempotency, rate limiting, and isolation.
30. The integration suite proves the initial endpoints work on staging-compatible infrastructure.
31. The API deploys to staging through the approved pipeline.
32. No unapproved Production change.
33. Anything needing a device, simulator, or the not-yet-built app is recorded as unverified.
34. An owner runbook lists the minimal staging checks.
35. The API and contract foundation is ready for 21d.

## 10. Open questions (resolved in `spec.md` → Resolved Decisions)

- **OQ1.** How token authentication meets the account lifecycle (profile loading, deletion, suspension).
- **OQ2.** The exact initial API surface.
- **OQ3.** Keeping API authentication separate from the browser-session proxy.
- **OQ4.** Where reusable account-scoped view composition lives.
- **OQ5.** How reads with side effects are separated.
- **OQ6.** How the entitlement system provides gated mobile responses.
- **OQ7.** Idempotency: repeated, conflicting, and interrupted creates; ownership, concurrency, expiry, failure; no cross-account leakage.
- **OQ8.** A basic rate-limiting strategy on the current infrastructure, with no unapproved service or cost.
- **OQ9.** Configuring the minimum version and kill switches.
- **OQ10.** Compatibility with later mobile releases within v1.
- **OQ11.** Enforcing endpoint isolation for future slices.
- **OQ12.** The minimum owner verification for a non-UI foundation.
- **OQ13.** Staging the foundation while the web stays operational.

## 11. Completion handoff

A working, versioned mobile API on staging with verified bearer-token auth, correct lifecycle and suspension enforcement, account-scoped `me`, Today, and gyms, safe app config and version gating, predictable errors, retry-safe create infrastructure, basic abuse protection, reusable server-side view composition, no route around Pro enforcement, isolation coverage for every endpoint, the web unchanged, no Production change, and a small owner runbook. 21d then builds the Expo app on these endpoints.
