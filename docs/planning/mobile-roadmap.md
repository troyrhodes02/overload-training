# Overload — Mobile Roadmap (sub-roadmap for Pitch 21)

**Status: draft.** Finalize it from `docs/planning/mobile-audit.md` once the audit has run. The main roadmap, `docs/planning/pitch-roadmap.md`, owns Pitch 21's place in the overall plan. This document owns how the mobile app is built, slice by slice.

## Purpose

Overload's iPhone app is React Native with Expo, rebuilt feature by feature on top of the existing backend. Each existing web feature is rebuilt natively one slice at a time, and each slice is reviewed on a device before the next begins. Android is deferred.

## Principles

- **Parity means equivalent user capability, not identical screens.** A native screen should feel native: native navigation, keyboards, sheets, pickers, haptics, and gestures.
- **One backend and one training model.** The mobile app never reads the database directly and never reimplements the progression engine, baselines, or entitlements. It calls the mobile API, which wraps the same business logic the web uses.
- **Same repository, shared package.** The mobile app lives beside the web app so one run can change both. Shared code (types, validation schemas, the pure training functions, constants, tour and release-note data) lives in one package.
- **Account isolation first.** Every mobile endpoint takes the account from the token and goes through the scoped data layer, and the cross-account isolation suite covers every endpoint.
- **Online-only.** No offline logging.
- **Nothing mobile reaches Production until the beta slice.** Development builds connect to staging. The friends' build connects to Production deliberately, and the mobile API reaches Production only through the promotion workflow.

## How each slice runs

1. A normal pipeline run builds the slice, merges it into `staging`, and, if the Expo update token is configured for the staging channel only, publishes an over-the-air update to the `staging` channel.
2. You open the development build on your iPhone, load the staging update, and review the slice against its checklist below.
3. Findings go back as fixes in the same slice. When the slice is right, you approve it, and the next slice starts.
4. Slices that are mobile-only skip the web UI preview. Their visual contract is the mobile design section of the slice's design doc, built with `overload-mobile-ui`.

**Review checklist for every slice:** it gives the same capability as the web feature; it feels native; set entry works one-handed with the right keyboard; safe areas and the keyboard do not hide controls; light and dark both work; loading, empty, and error states exist; Free and Pro behave correctly; a second account cannot see the first account's data; and nothing crashes on backgrounding and resuming.

## Web-only for now

Admin center, billing and checkout, public pages. The plan builder and Workout Plan Import may stay web-only during the beta. The audit decides.

## Slices (draft order)

Each slice is a numbered sub-pitch run through the normal pipeline, with its own folder under `docs/pitches/mvp-5b-mobile-app/`.

### 21a — Monorepo & Shared Package
Foundational, no UI. Move the web app into the workspace layout the audit recommends, create the shared package (types, validation schemas, pure training functions, constants, tour and release-note data), and make lint, typecheck, and tests run across workspaces. The web app's behavior is unchanged. Human step: update the web hosting project's root directory. **Done when** the web app builds and deploys on staging exactly as before and every existing test passes.

### 21b — Mobile API & Auth Foundation
Foundational, no UI. The versioned mobile API: token verification, the acting account from the token, the scoped data layer, capability enforcement, a stable error shape, retry-safe writes, an app-config endpoint with a minimum supported version and kill switches, basic rate limiting, and environment isolation. It starts with the read endpoints for sign-in, profile, and today's plan. **Done when** the endpoints work against staging, a second account cannot reach the first account's data on any endpoint, and an unauthenticated or old-version request is handled correctly.

### 21c — App Shell & Design System
The Expo app with EAS configuration and a development build on your iPhone. Tab navigation, theme tokens shared with the web, light and dark, secure token storage, an API client, sign-in, the version-gate screen, and shared loading, empty, and error components. **Done when** the app installs on your iPhone, signs in with a development account against staging, and shows the empty shell, and a staging update reaches it over the air.

### 21d — Workout Loop
The first native vertical slice: Today, the logging card (set entry designed for one hand, the right keyboards, haptics), finishing a workout, a basic session summary, and the history list. **Done when** you can log a full workout on the phone against staging and it matches what the web shows.

### 21e — Complete Workout Experience
Gym selection and baselines, exercise swap with any muscle filter, reps-in-reserve entry, recommendations and their evidence (Pro), cardio logging and planned cardio, the missed-day prompt, editing past logs, bodyweight and fixed-target handling, and the full session summary. **Done when** every logging behavior the web has is available on the phone.

### 21f — Plans, Library & Gyms
Viewing the plan, mesocycle, and sessions, the exercise library with custom exercises, and gyms. Plan editing on mobile is decided by the audit: either light edits on the phone or web-only for the beta. **Done when** the agreed scope works on the phone.

### 21g — Goals, Insights & Progress
Goals, exercise history and PR intelligence, and e1RM charts with native charting. **Done when** a lifter can see and set goals and read their lift history on the phone.

### 21h — Account & Settings
Profile, appearance, the onboarding tour, What's New, feedback, data export, in-app account deletion (App Store review expects it), read-only plan and access display, and sign out. **Done when** an account can be managed entirely from the phone, with no purchase flow in the app.

### 21i — TestFlight Beta
Device polish, the production release of the mobile API through the promotion workflow, a Production-connected build, App Store Connect setup, Apple's beta review for the first external build, and inviting the friends. **Done when** an existing friend installs the TestFlight build, signs in with their existing account, and logs a workout against Production.

## Beta gate (your decision, at the audit)

- **Option A, recommended:** the friends' beta starts after 21a to 21e and 21h, so the beta has the full workout experience and account basics. Plans, library, and goals stay on the web at first and follow in the beta.
- **Option B:** the beta starts only after full parity (21a to 21h), which takes longer and delays real feedback.

The choice is recorded here when the audit is done.

## What the audit must confirm or change

- The real number and size of screens, and which are small, medium, or large to rebuild.
- Which server actions hold business logic that must be extracted into reusable modules before the API can expose it.
- The exact endpoint list per slice and any retry-safety problems in the current write paths.
- Which web components and styles map to native patterns, and which need a different layout.
- Whether the plan builder and plan import stay web-only for the beta.
- The workspace layout for 21a.
- Any slice that should be split, merged, or reordered.

## Risks

- The mobile API is new attack surface. A single unscoped endpoint would expose one lifter's data to another. Mitigated by the scoped layer, a static check, and the isolation suite on every endpoint.
- Two interfaces are now maintained permanently. Every later feature is built twice.
- Old app versions stay installed. The API must stay backward compatible within a version, and the version gate must work before the first public release.
- Device-only behavior cannot be verified by an unattended run. Every slice carries manual review steps for you.
