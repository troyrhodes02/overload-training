# Overload — Mobile Roadmap (sub-roadmap for Pitch 21)

**Status: revised from `docs/planning/mobile-audit.md`.** The main roadmap, `docs/planning/pitch-roadmap.md`, owns Pitch 21's place in the overall plan. This document owns how the mobile app is built, slice by slice. If the audit and this document disagree about a fact in the code, the audit wins and this document should be corrected.

## Purpose

Overload's iPhone app is React Native with Expo, rebuilt feature by feature on top of the existing backend. Each existing web feature is rebuilt natively one slice at a time, and each slice is reviewed on a device before the next begins. Android is deferred.

## Principles

- **Parity means equivalent user capability, not identical screens.** A native screen should feel native: native navigation, keyboards, sheets, pickers, haptics, and gestures.
- **One backend and one training model.** The mobile app never reads the database directly and never reimplements the progression engine, baselines, or entitlements. It calls the mobile API, which wraps the same business logic the web uses. The app receives Pro calls from the API and does not run the engine itself.
- **Same repository, shared package.** Recommended layout (npm workspaces, matching the repository's package manager):

  ```text
  apps/web        the current Next.js app
  apps/mobile     the Expo app
  packages/shared source-only TypeScript: contracts, training rules, validation, content, tokens
  ```

  The shared package has no dependency on `@prisma/client`, `next`, `react`, `@supabase/*`, or `server-only`, enforced by an ESLint rule. Prisma, the scoped data layer, entitlement resolution, and gating stay in `apps/web`. The hosting root directory moves to `apps/web`, a human step.
- **Account isolation first.** Every mobile endpoint takes the account from a verified token and goes through the scoped data layer, and the cross-account isolation suite covers every endpoint.
- **Online-only.** No offline logging.
- **Nothing mobile reaches Production until the beta slice.** Development builds connect to staging. The friends' build connects to Production deliberately, and the mobile API reaches Production only through the promotion workflow.

## Requirements the audit adds to the API

These apply to slices 21c onward.

- **Token verification uses `getUser(token)`** on a cookie-less anon client, never local JWT checking, because the web profile loader lazily recreates a missing profile and a locally valid token for a deleted account would recreate an orphan.
- **The proxy must exempt `/api/mobile`**, or every cookie-less request is redirected to the login page.
- **Never call an ungated progression builder** from a handler (`gatherRows`, `describeScope`, `getExerciseProgression`). Use the gated queries and serialize the gated result as-is, including `locked`.
- **Errors:** a failed request returns a status code and `{ error: { code, message, details? } }`, reusing the existing error codes. A request below the minimum app version, sent in the `X-Overload-App-Version` header, gets 426 `upgrade_required`.
- **App config:** a public `GET /app-config` returns the minimum and latest app version and kill switches.
- **Retry safety:** natural-key writes (logging a set, starting a workout, logging cardio, absolute edits) are retry-safe already. Create endpoints (goals, gyms, custom exercises, mesocycles, feedback) need an `Idempotency-Key`, stored in a new owned table with RLS, scope-layer coverage, and isolation-suite coverage. Never use client-supplied primary keys, because a collision would reveal that another account's row exists.
- **Extraction before the endpoints:** the Today view and the workout view are composed in pages today, goal reconciliation is duplicated across actions and pages, and a few reads have side effects on GET (billing sync, import retention). Extract these into account-scoped modules in 21c, so every later slice is mostly a route handler plus native UI.
- **The endpoint inventory per slice** is in section 2 of the audit. Use it as the starting list for each slice's spec.

## How each slice runs

1. A normal pipeline run builds the slice, merges it into `staging`, and, if the Expo update token is configured for the staging channel only, publishes an over-the-air update to the `staging` channel.
2. You open the development build on your iPhone, load the staging update, and review the slice against the checklist below.
3. Findings go back as fixes in the same slice. When the slice is right, you approve it, and the next slice starts.
4. Slices that are mobile-only skip the web UI preview. Their visual contract is the Mobile design section of the slice's design doc, built with `overload-mobile-ui`.

**Review checklist for every slice:** it gives the same capability as the web feature; it feels native; set entry works one-handed with the right keyboard; safe areas and the keyboard do not hide controls; light and dark both work; loading, empty, error, and unreachable states exist; Free and Pro behave correctly; a second account cannot see the first account's data; and nothing crashes on backgrounding and resuming.

## Web-only for now

Admin, billing and checkout, public pages, the plan builder, and plan import. Plan import is a long synchronous model call with file uploads and does not survive the app going to the background. The plan builder is dense forms used rarely, and one of its writes (moving an exercise up or down) is relative and unsafe to retry. Sign-in, sign-up, and the password-reset request are built natively. The reset itself completes on the web through the email link. A mobile light edit of planned sets and rep range (an absolute write) may follow the beta.

## Slices

Each slice is a numbered sub-pitch run through the normal pipeline, with its own folder under `docs/pitches/mvp-5b-mobile-app/`. The sizes come from the audit.

### 21a — Monorepo Move (M)
Foundational, no UI, no behavior change. Move the web app into `apps/web` and set up the workspace so lint, typecheck, and tests run across workspaces. Check what the move touches: the hosting root directory, the Prisma schema path and generate step, the path alias, the Jest and Playwright configs, the ESLint config, scripts with relative paths, the client-bundle check, and the lockfile. Spike first: whether Expo's React version can coexist with the web's React 19.3.0, and how Metro handles hoisting. Human step: the hosting root directory. **Done when** the web app builds and deploys on staging exactly as before and every existing test passes.

### 21b — Shared Package & Contracts (M to L)
Foundational, no UI. Create `packages/shared` and move into it the pure modules (e1RM and progression rules, logging card rules, schedule and calendar, rep targets, validation parsers and limits, taxonomy, goal progress, release-note and tour content), the API contract types (about 50 DTOs, with dates as ISO strings) and the error shape, the Prisma enum tuples with a parity test against `Prisma.$Enums`, and the design tokens. Remove the duplicated weight and reps limits and formatters. **Done when** the web consumes the package, nothing a user sees changes, and the package has no forbidden imports.

### 21c — Mobile API & Auth Foundation (L)
Foundational, no UI. The versioned API under `/api/mobile/v1` with the requirements above: `getUser(token)` verification, the proxy exemption, error mapping, the app-config and version gate, the idempotency table, basic rate limiting, environment isolation, and the extractions. It starts with the app-config, `me`, `today`, and gyms endpoints. **Done when** those endpoints work against staging, a second account cannot reach the first account's data on any endpoint, and a missing, expired, or malformed token and an old app version are handled correctly.

### 21d — App Shell, Design System & Accounts (M)
The Expo app with EAS and a development build on your iPhone. Tab navigation, shared tokens, light and dark, secure token storage with refresh, the API client, sign-in, sign-up, the password-reset request, sign-out, the version-gate screen, and shared loading, empty, error, and unreachable components. Spikes first: whether the date and time-zone functions Today depends on behave on Hermes, and the bot-challenge choice for mobile signup. Recommended default: embed the web bot challenge in a small web view for the beta, and evaluate Apple's App Attest before the public App Store release. Signup has no invite code. The per-IP throttle behaves badly behind carrier networks, so per-email and per-device limits are evaluated. **Done when** the app installs on your iPhone, you can sign up and sign in against staging, and a staging update reaches it over the air.

### 21e — Workout Loop (L)
The first native vertical slice: Today, the logging card (set entry designed for one hand, the right keyboards, haptics), finishing a workout, a basic session summary, and all-time history, with any earlier week reachable and workouts from every block. **Done when** you can log a full workout on the phone against staging and it matches what the web shows.

### 21f — Logging Completeness (L)
Gym selection and baselines, exercise swap with any muscle filter, skip, reps-in-reserve entry, editing past sets and planned-set counts, bodyweight and fixed-target handling, the missed-day prompt, and cardio logging. **Done when** every logging behavior the web has is available on the phone.

### 21g — Insights in the Workout (M to L)
Pro recommendations and their evidence on the logging card, the scheduled-deload banner, the full session summary, and the quiet Pro note with no purchase link. **Done when** a Pro account sees the same calls on the phone as on the web and a Free account sees the locked state.

### 21h — Plans, Library & Gyms (M)
Read-only plan, week, and session views, the exercise library with search, favorites, and custom exercises, and gyms. **Done when** the agreed scope works on the phone.

### 21i — Goals & Exercise History (M)
The goal screens, exercise history and PR intelligence, and one native line chart. **Done when** a lifter can see and set goals and read their lift history on the phone.

### 21j — Account & Settings (M)
Profile, appearance, What's New, feedback with screenshots, data export through the share sheet, in-app account deletion (the App Store expects it), a read-only view of the plan and access, and support. The deletion flow depends on the web's Stripe cancellation fix. **Done when** an account can be managed from the phone with no purchase flow in the app.

### 21k — Native Tour (M)
A native coach-mark system, since the web tour is anchored to the page. It reuses the shared tour content and starts after the beta has begun.

### 21l — TestFlight Beta (M, mostly human)
Device polish, the production release of the mobile API through the promotion workflow with a backward-compatibility check, a Production-connected build, App Store Connect setup, Apple's beta review for the first external build, and inviting the friends. **Done when** an existing friend installs the TestFlight build, signs in with their existing account, and logs a workout against Production.

## Beta gate (your decision)

- **Option A, recommended and supported by the audit:** the friends' beta starts after 21a to 21g and 21j, so the beta has the full workout experience and account basics. Plans, library, and goals stay on the web at first and follow in the beta, and the native tour follows.
- **Option B:** the beta starts only after full parity (21a to 21j), which takes longer and delays real feedback.

Record the choice here when it is made.

## Risks

- The mobile API is new attack surface. A single unscoped endpoint would expose one lifter's data to another. Mitigated by the scoped layer, a static check, and the isolation suite on every endpoint.
- Two interfaces are now maintained permanently. Every later feature is built twice.
- Old app versions stay installed. The API must stay backward compatible within a version, and the version gate must work before the first public release.
- Open signup on mobile adds abuse surface (repeat trials, carrier-network throttling). The web signup hardening carries over, and the bot challenge for mobile is decided in 21d.
- Device-only behavior cannot be verified by an unattended run. Every slice carries manual review steps for you.
