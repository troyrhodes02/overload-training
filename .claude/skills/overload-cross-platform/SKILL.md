---
name: overload-cross-platform
description: >
  Decide and record how an Overload feature spans the web app and the native
  iPhone app (React Native with Expo). Use when writing the client scope and
  platform impact section of a design doc or spec, and when planning or building
  anything that touches sign-in, the mobile API, shared logic, navigation,
  deep links, payments, permissions, notifications, location, or app lifecycle.
  Also use when the user says "cross-platform", "mobile", "iOS", "Expo", "client
  scope", "parity", or "web and mobile". Splits each feature into shared logic,
  API, web UI, and mobile UI, applies the checklist, and reports honestly what a
  run could not verify on a device.
---

# Overload Cross-Platform

Overload has one backend and one training model, and two clients: the Next.js web app and the React Native (Expo) iPhone app, in one repository with a shared package. Android comes later. This skill keeps every feature honest about what it means on both clients, so neither is left as cleanup.

## Before you start

1. **Check what exists.** Read `docs/planning/mobile-roadmap.md` and the `spec.md` files of the Mobile App slices that have shipped under `docs/pitches/mvp-5b-mobile-app/` (the workspace layout, the mobile API, the app shell). They record the exact conventions. Do not guess them.
2. **If the mobile app does not exist yet,** classify the feature as web today, note what the mobile app will need (an endpoint, shared logic, a native layout), and build nothing in anticipation.
3. **Read `CLAUDE.md`**, especially the mobile app rules, the plan rules, and the admin boundary.

## The decision for every feature

State the **client scope**: web only, mobile only, or both. Then, for each layer, say what is built where:

| Layer | Question |
| --- | --- |
| Shared logic | Which pure rules belong in the shared package (types, validation, e1RM and progression rules, constants, tour and release data) so neither client reimplements them? |
| Business logic and data | Which server modules does it use? Never duplicate a rule in a client |
| Mobile API | Which endpoints does the phone need, and are they retry-safe, versioned, scoped, and capability-checked? |
| Web UI | Which web screens change? |
| Mobile UI | Which native screens, designed with `overload-mobile-ui`? |

Plan placement (Free, or a named Pro capability) is a separate decision recorded beside this one. Parity means equivalent user capability, not identical screens.

## Checklist

- **Account scoping and isolation.** Every endpoint takes the account from the token and goes through the scoped layer, and the cross-account isolation suite covers it.
- **Capabilities.** The server enforces plan capabilities for mobile as it does for web.
- **Versioning.** Changes within an API version are backward compatible. Old app versions stay installed, so a breaking change needs a new version, and the version gate must still work.
- **Retry safety.** Writes tolerate a repeated request on a flaky gym connection.
- **Sign-in and session.** Tokens in secure storage, expiry and refresh, and a suspended account refused.
- **Mobile behavior.** Navigation and back gesture, keyboards, safe areas, backgrounding and resuming mid-workout, permissions asked in context and refused gracefully.
- **Online-only.** No offline logging. The app says plainly when it cannot reach the server.
- **Payments.** No purchase flow in the app until the store billing path is decided. The app shows access read-only.
- **Store requirements.** In-app account deletion, accurate privacy details, and real native value.
- **Shared data.** Tour steps and release notes live in the shared package and render natively on mobile.

## Examples

| Feature | Client scope | Notes |
| --- | --- | --- |
| Admin center | Web only | The owner operates from a browser. No mobile admin UI. |
| Billing and checkout | Web only | The app shows plan and access read-only. |
| Logging a workout | Both | Shared rules, one API, a web card and a native card. |
| Workout plan import | Web only for the beta | A long synchronous model call that does not survive the app going to the background. Decided in the mobile roadmap. |
| Plan builder | Web only for the beta | Dense forms used rarely. Mobile shows the plan read-only. |
| Sign-in, sign-up, password-reset request | Both | Signup is open with no invite code. The bot-challenge choice for mobile is made in slice 21d. The reset itself completes on the web through the email link. |
| Goals | Both | Shared e1RM function, native charts. |
| Live Activity | Mobile only | Built with Expo's widgets support, iOS only. |
| Apple Watch | Mobile only | iOS only. |

## Recording it

In the design doc, add the client scope and platform impact table (surface, shared logic, API, web UI, mobile UI, reason), and a Mobile design section when mobile is in scope. In the spec, state the endpoints and their contracts, the shared-package changes, and the screens mapped to endpoints. Split tickets by area (shared and API, web, mobile) so each can be reviewed.

## Verifying honestly

A run can run web tests, API contract and isolation tests, and mobile type-checks, lint, and unit tests, and it can publish an over-the-air update to the Expo `staging` channel if a staging-only token is configured. It cannot run a simulator or a device, publish to the `production` channel, or build for TestFlight. Report those as unverified, never as passed, and list the manual steps you should run: which build, which screens, which states, in which appearance.

## Rules

- One backend and one training model. Never build a second progression engine, a second set of business rules, or separate mobile training records.
- The mobile app talks only to the mobile API, never to database tables.
- Share logic through the shared package. Do not copy a rule into a client.
- Do not let a new feature silently break sign-in, navigation, or logged-set behavior on either client.
- If a decision needs an architectural choice the Mobile App slice specs have not made, record it as an open question for the controlling pitch, not as a guess.

## In an unattended run

Decide, do not ask. Record the client scope and any judgment calls as Resolved Decisions in the spec. If the mobile app does not exist yet, record that the mobile impact is pending and continue as web.
