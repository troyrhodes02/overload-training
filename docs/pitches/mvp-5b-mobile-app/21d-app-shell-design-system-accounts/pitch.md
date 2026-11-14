# Pitch 21d — App Shell, Design System & Accounts

> Source: the approved expansion in Linear, "Pitch 21d: App Shell, Design System & Accounts" (Overload V1 project document, updated 2026-11-14). It is copied here unchanged in substance for the pipeline run of 2026-11-14, and it expands `docs/planning/mobile-roadmap.md` → "21d — App Shell, Design System & Accounts (M)". Where the audit (`docs/planning/mobile-audit.md`) disagrees with the current code, the code wins. Several audit findings were fixed in MVP 5A and in 21c.

**Product:** Overload
**Milestone:** MVP 5B — Mobile App (`mvp-5b-mobile-app`)
**Parent:** Pitch 21 — React Native + Expo Mobile App
**Type:** Foundational, UI-bearing
**Appetite:** M — Medium
**Status:** Ready for pipeline
**Client scope:** Native iOS application
**Plan placement:** Free account functionality; existing Pro entitlement recognized, no purchase flow
**Pitch folder:** `docs/pitches/mvp-5b-mobile-app/21d-app-shell-design-system-accounts/`

---

## 1. Problem

Overload's web application already provides a complete training experience, but lifters mostly reach their workout data on a phone, often in the gym. A native iPhone application is the next step toward making that experience faster, more natural, and better suited to mobile interaction.

The previous mobile slices built the technical foundations. Pitch 21a created the monorepo structure. Pitch 21b extracted the shared training rules, validation, API contracts, content, and design tokens. Pitch 21c built the secure, versioned mobile API: verified token authentication, account isolation, rate limiting, version handling, and the first endpoints.

Those foundations are necessary, but they do not yet give a lifter anything to install, open, or use on an iPhone. Overload now needs its first native application: a reliable shell that can sign in existing accounts, talk securely to the existing backend, set up the native visual and navigation systems, and provide the shared states that every later mobile feature needs. This foundation must be right before workout logging, progression insights, plans, history, and goals are rebuilt natively.

**The problem this pitch solves is turning the completed backend foundation into a usable, secure, and testable native iPhone application without prematurely rebuilding the entire product.**

## 2. Appetite

**Medium (M).** The scope is a native application foundation with several related capabilities: Expo project setup and development builds; native navigation; design-system foundations; light and dark appearance; authentication and persistent sessions; secure token storage; versioned API communication; signup and password-reset requests; app compatibility handling; common loading, error, empty, and unreachable states; and staging distribution and device testing.

The main uncertainty is integrating native authentication, Expo development tooling, and the protected staging backend. The appetite stays Medium because the pitch deliberately excludes the full training experience: no workout logging, exercise swapping, complex charts, or plan-building interfaces. If a technical decision threatens to expand the work into a separate backend, substantial new security infrastructure, or native feature parity, it must be brought back within scope. This is the first complete native capability, not an attempt to ship the finished mobile app.

## 3. Solution Shape

### A. Create the actual Expo application

Turn the reserved `apps/mobile` location into a working React Native application built with Expo. The app must fit the existing monorepo and npm workspace structure without disrupting the Next.js application, use the established shared package where appropriate, and follow the architecture already approved for mobile development.

It must run in both the iOS Simulator and an Expo development build installed on a physical iPhone. The development configuration connects to Overload's staging backend and `overload-dev` data. Production services must not be used in this slice. The application must have a coherent identity, development configuration, and build process suitable for continued native feature development.

### B. Establish native navigation

Create the foundational navigation structure for the future mobile application, using native iOS interaction conventions rather than translating the web sidebar into a mobile layout. The shell must account for the future training destinations in the Mobile Roadmap (Today, History, Plans, Exercises, Goals, and account management), but only the navigation and surfaces this pitch needs should work. Destinations whose features belong to later slices must not pretend to be complete.

The shell must distinguish between signed-out account flows, signed-in application navigation, loading or restoring an existing session, required app updates, and connectivity and other blocking errors. The navigation architecture must let future slices add screens without rebuilding the overall structure, and the result must feel native on an iPhone.

### C. Establish the native design system

Use the shared design tokens from 21b as the foundation for the iPhone visual identity. The app should feel recognizably like Overload while respecting iOS conventions. The design foundation covers typography and hierarchy, brand and semantic colors, spacing and layout, interactive controls, form inputs, navigation elements, loading indicators, empty and error states, and light and dark themes.

Follow the existing mobile design workflow and use `overload-mobile-ui` during the design stage. The mobile design does not need to be pixel-identical to the web. Native navigation, keyboards, sheets, controls, and interaction behaviors are designed for iOS. Do not create a broad universal component library or duplicate all web components in React Native. The design system must be enough for the app shell and account flows, and later slices extend it.

### D. Support light and dark appearance

Support Overload's established appearance choices: light, dark, and follow system, with system as the default where no preference exists. The interface must respond correctly to device appearance changes and preserve the user's existing appearance preference where the account model supports it. Both themes need readable contrast and consistent branding. Native system surfaces, status bars, keyboard-related UI, and navigation elements must behave correctly in both modes. Do not introduce a competing set of brand tokens that will diverge from the shared definitions.

### E. Implement native sign-in

An existing Overload account must be able to sign in to the native application with its existing credentials. Supabase Auth establishes the session, and all application data comes from the authenticated mobile API. The app must not query Supabase database tables directly.

A successful sign-in establishes a valid session, stores the tokens securely, retrieves the user's authorized account state, moves into the signed-in shell, and survives ordinary app restarts, so the user does not authenticate every time they open the app. Invalid credentials, unavailable authentication services, suspended accounts, and other expected errors must produce understandable outcomes. The backend's account lifecycle protections are preserved.

### F. Implement secure session storage and refresh

Keep the authenticated session in secure device storage. Authentication secrets are never hardcoded in application source or bundled as configuration. Support the normal access-token refresh lifecycle and recover when a previously valid token expires. Session handling must work when the app starts from a terminated state, returns from the background, resumes after a long time, loses and regains connectivity, receives an authentication failure, or meets an authentication-provider outage.

The app must distinguish an invalid session from a temporary service outage. A temporary failure must not sign out a valid account. Signing out clears the local authenticated session and returns the user to the signed-out experience. No social login.

### G. Implement native signup

A new user must be able to create an Overload account with the existing signup model, keeping its account fields, validation rules, password requirements, and lifecycle protections. The Mobile Roadmap requires **open signup without an invite code**. Mobile signup works within the current public-signup policy, not a separate mobile-only account system. It respects the existing trial and entitlement behavior, and it must not create a second path for issuing trials or bypass existing anti-abuse protections.

#### Bot protection

Open native signup adds abuse risk. The Mobile Roadmap recommends a small embedded web-based bot challenge for the beta, with Apple's App Attest evaluated before the public App Store release. The pitch must resolve how the existing Cloudflare Turnstile protections are honored by native signup. Do not silently remove or bypass signup verification to make a native form work. The app must not expose a reusable private verification secret.

Carrier networks can put many users behind one public IP address, so the signup-abuse strategy must not depend entirely on a shared-IP threshold. The audit names per-email and per-device limits as considerations. Any new privacy-sensitive device identification, or any external operational dependency that needs owner approval, is an owner decision.

### H. Implement password-reset requests

A user who cannot remember their password must be able to request a reset from the native app. The native experience collects what it needs, invokes the established authentication flow, and shows an understandable confirmation or error. The reset itself completes on the web through the email link: the request is native, the email is sent by the established authentication system, and the link completes the reset in the existing web experience. Do not rebuild reset completion natively. The request must not disclose whether an email belongs to an account where the approved security behavior forbids it.

### I. Establish the native mobile API client

Create the app's reusable connection to the versioned API from 21c. It consistently handles authenticated requests, access-token refresh, app-version headers, shared request and response contracts, standard API errors, rate limits, temporary server failures, unreachable networks, and unsupported app versions. It uses the shared TypeScript contracts from 21b and the backend semantics from 21c. The app must not implement its own account authorization, progression calculations, database access, or entitlement system. For this pitch, the initial API capabilities are enough to establish signed-in identity, startup state, and basic connectivity. Later slices consume feature endpoints.

### J. Handle Vercel-protected staging securely

Development builds need to reach the staging backend, which sits behind Vercel Deployment Protection. Authenticated browser and Vercel CLI requests reach the staging mobile API, while an ordinary unauthenticated request gets a Vercel authentication redirect. An Expo development build cannot rely on the owner's browser or CLI session.

The design stage must establish a secure, practical way for development builds to reach staging while keeping appropriate protection. The preferred outcome keeps staging protected and allows explicitly authorized development traffic. The solution must not embed a long-lived, privileged Vercel bypass credential in any build that could be publicly distributed. It must fit the local development, simulator, and EAS development-build workflow. Production must not be opened or modified as a shortcut. This is a required integration decision, not a reason to bypass the API's own bearer-token authentication.

### K. Establish version-gate behavior

Consume the app-config and minimum-version enforcement from 21c. Below the minimum supported version, show a clear, blocking update state instead of continuing with possibly incompatible functionality. Handle the server's maintenance and other approved configuration flags. Distinguish a required upgrade from a temporary connection error. No general-purpose feature-flag platform; use the existing public configuration contract rather than inventing version policy.

### L. Establish shared loading, empty, error, and unreachable states

Create the foundational patterns for **loading** (while authentication is restored or app information is fetched), **empty** (a legitimate account with nothing applicable), **error** (a request or action fails), and **unreachable** (the service cannot be contacted). Later native screens reuse them. They must not fabricate workout data or show another account's cached information when an operation fails. The app is online-only, so the unreachable state says the current operation needs a connection. No offline logging, sync queues, or general offline data store.

### M. Verify native date and time-zone behavior

Run the Mobile Roadmap's spike: whether the date and time-zone behavior Today uses works under Hermes. The app and backend must agree about the account's training day. An account in Chicago must not see a workout shift to another day because the native runtime handles dates or `Intl` differently. Verify the portable shared utilities and the API's date representations where relevant, and keep the approved calendar-date and time-zone semantics. Do not rewrite the scheduling model or add progression rules. If Hermes shows a genuine incompatibility, fix the minimum necessary without changing web behavior.

### N. Establish EAS development builds and staging updates

Set up Expo and EAS so the app supports local iOS Simulator development, development builds on the owner's physical iPhone, a staging-only update channel, later feature development on the same app, and delivery of an over-the-air staging update. Development builds use the staging backend. No mobile artifact from this pitch connects to Production. The pipeline documents which build and update steps Claude can run and which need the owner. The first development build and device verification are part of completion. Do not create or publish a Production mobile build or submit to TestFlight.

## 4. UI-Bearing Status and Plan Placement

**UI-bearing: Yes.** This is the first UI-bearing mobile pitch. Its design stage sets a mobile visual contract for the native shell and account flows. The web UI preview is not the right approval artifact. Follow the Mobile Roadmap's mobile design process and `overload-mobile-ui`. The owner reviews the result in the iOS Simulator and on a physical iPhone. The app uses native iOS interaction patterns.

**Plan placement: Free account foundation.** Sign-in, signup, password-reset requests, session handling, navigation, and account access are not Pro-gated. The app recognizes the plan and entitlement state the backend returns. It must not offer a native checkout, introduce in-app purchases, recalculate entitlements, hide Free functionality behind Pro, or reveal gated insights through local calculations.

## 5. Scope Boundaries

### In scope

First functioning Expo app in the monorepo; local iOS Simulator support; EAS development-build setup; physical iPhone development installation; native tab navigation and app shell; foundational native design system; shared design-token consumption; light, dark, and system appearance; native sign-in and sign-out; native open signup; secure session storage and refresh; native password-reset request; existing web reset completion; mobile API client on the 21b contracts and 21c endpoints; version-gate and maintenance presentation; shared loading, empty, error, and unreachable states; secure staging connectivity behind Vercel protection; the Hermes date and time-zone spike; the native signup bot-protection decision and implementation; staging-only development updates; owner device review.

### Out of scope

Full Today workout UI; starting, logging, or completing a native workout; workout history screens; exercise swaps, RIR, gym baselines, and cardio logging; native progression recommendations; native charts and PR intelligence; plan creation, editing, or import; native exercise library and gyms management; native goals screens; full account settings and profile editing; the native coach-mark tour; billing, checkout, or in-app purchases; admin interfaces; social login; offline logging or sync; Android; App Store submission; friends' TestFlight distribution; Production backend connectivity; reimplementing server-side training or entitlement logic.

Future destinations may appear as clearly unfinished navigation placeholders where useful, but their features stay in later slices.

## 6. Rabbit Holes and No-Gos

- **A. Expo and web dependency compatibility.** Avoid dependency conflicts, broken module resolution, duplicate React runtimes, or Metro bundling problems. **No-go:** restructuring the monorepo or destabilizing the web app to make Expo work. Preserve the 21a and 21b foundation.
- **B. Unsecured or leaking session tokens.** **No-go:** storing tokens in ordinary persistent app storage, or exposing them in logs, crash reports, URLs, or distributable configuration.
- **C. Mistaking an authentication outage for a revoked session.** **No-go:** signing a user out whenever the server is unreachable or returns a temporary failure. The native UI preserves the API's distinction.
- **D. Bot-protection bypass.** **No-go:** disabling challenge verification or letting native signup skip established protections.
- **E. Carrier-network throttling.** **No-go:** simplistic IP-only restrictions that often block legitimate mobile users.
- **F. Staging deployment-protection credentials.** **No-go:** embedding privileged, long-lived Vercel bypass credentials in a Production or public beta bundle. Any development-only mechanism is clearly separated from future distribution builds.
- **G. Time-zone differences under Hermes.** **No-go:** silently accepting a difference that shifts Today's workout or the account's calendar date.
- **H. Prematurely building feature screens.** **No-go:** simplified workout logging or duplicate feature endpoints to make the app look complete. 21e owns the Workout Loop.
- **I. Overengineering navigation and design.** **No-go:** a large generic UI framework or speculative navigation architecture.
- **J. Confusing an Expo update with a native build.** **No-go:** assuming every change can be tested by publishing an update without rebuilding. The runbook distinguishes the two.
- **K. Claiming device verification without device testing.** **No-go:** marking physical-device installation or background/resume as passed without actual device verification.
- **L. Production environment contamination.** **No-go:** bundling Production credentials, calling the Production Supabase project, or publishing to a Production Expo channel.

## 7. Dependencies

- **21a — Monorepo Move: complete.** **21b — Shared Package & Contracts: complete.** The native app reuses the shared definitions rather than duplicating them. **21c — Mobile API & Auth Foundation: complete** (on staging, and released to Production through #212). Public app config and authenticated `me`, Today, and gyms exist, with token verification, scoped access, standard errors, version handling, and rate limiting.
- **Tooling the owner prepared:** Xcode and the iOS Simulator, an iPhone configured for development, Node and npm, an authenticated Expo/EAS account, an Apple Developer Program membership, a staging test account with the QA fixture, and Vercel CLI access. The pipeline verifies which provisioning, build, credential, or organization settings still need setup instead of assuming each tool is ready because it is installed.
- **API and data:** the app connects to the existing staging backend and `overload-dev`, through the mobile API and the established Supabase Auth. No separate native data source, extra workout database, or mobile-specific account identity.
- **Next:** 21e — Workout Loop (Today, starting a workout, logging sets, completing it, a basic summary, history). It depends on the shell, secure session, API client, shared components, and the development-build workflow delivered here.

## 8. Definition of Done

**Native app foundation.** (1) The Expo app builds from the monorepo. (2) The Next.js app keeps building and behaving normally. (3) The app runs in the iOS Simulator. (4) It installs and launches on the owner's iPhone. (5) It is configured for the staging backend only. (6) Development-build and EAS configuration are documented and working.

**Visual and navigation foundation.** (7) Coherent iOS navigation. (8) Signed-out and signed-in navigation are separated. (9) Future screens can be added without replacing the shell. (10) The app uses the shared design tokens. (11) Light, dark, and system appearance work. (12) Safe areas, keyboards, navigation bars, and controls behave correctly. (13) Shared loading, empty, error, and unreachable states exist.

**Accounts and authentication.** (14) An existing account can sign in against staging. (15) A new account can sign up through open signup. (16) Signup respects the bot and abuse protections. (17) The app can request a password reset. (18) Reset completion continues through the web link. (19) Signing out clears the native session. (20) The session persists securely across restarts. (21) Expired access tokens refresh. (22) Invalid or revoked sessions fail safely. (23) Temporary auth-provider outages do not sign the user out. (24) Suspended and deleted accounts cannot bypass their restrictions. (25) The app never accesses Supabase application tables.

**API and compatibility.** (26) The client uses the versioned mobile API. (27) Requests carry the app version. (28) Standard API errors produce understandable states. (29) Unsupported versions show the update screen. (30) Staging maintenance produces the intended state. (31) Authenticated account data comes back correctly from staging. (32) Free and Pro state is shown consistently with the backend, with no purchase flow. (33) Cross-account isolation stays intact.

**Native runtime and update delivery.** (34) The Hermes date and time-zone spike is done. (35) The development build reaches staging without an unsafe distributable secret. (36) A staging update is published and received by the development build. (37) The development build stays connected only to staging. (38) Background and resume behave correctly. (39) Lost network access shows an understandable unreachable state. (40) No crash or blocking navigation issue prevents further development.

**Verification and delivery.** (41) All applicable repository, shared, web, mobile, and security tests pass. (42) Expo configuration and the native build are verified with the development workflow. (43) The native design is reviewed through the Mobile Roadmap's device-review process. (44) The owner reviewed the app in the simulator and on the iPhone. (45) Any unperformed device test is marked unverified. (46) No Production mobile update, TestFlight build, or public release. (47) The slice merges into `staging` through the standard pipeline. (48) The runbook explains how to launch, review, rebuild, and update the development app.

The PRD's full-workout acceptance criterion is met incrementally in 21e, not claimed here.

**The defining completion gate: an actual iPhone can install Overload, sign in or sign up against staging, navigate the native shell, and receive a staging update.**

## 9. Open Questions

Resolved in the spec under Resolved Decisions.

- **OQ1.** The Expo navigation structure (signed-in and signed-out flows, future screens, normal iOS behavior).
- **OQ2.** How the native design system consumes the shared tokens (typography, spacing, appearance, semantic colors) without a conflicting visual authority.
- **OQ3.** How the development build reaches Vercel-protected staging (simulator, device, EAS development builds, staging updates). This is an owner checkpoint if a security setting or credential policy changes.
- **OQ4.** How Supabase Auth sessions are stored and restored.
- **OQ5.** How native signup satisfies bot verification. The beta direction is an embedded web challenge, with App Attest evaluated before the public release.
- **OQ6.** How per-email and per-device abuse defenses are evaluated. No intrusive fingerprinting or new paid vendor without approval.
- **OQ7.** Whether Hermes preserves the date and time-zone behavior.
- **OQ8.** How appearance preferences synchronize, without changing web semantics.
- **OQ9.** How unsupported versions and maintenance are presented.
- **OQ10.** Which routes are functional now and which are placeholders.
- **OQ11.** The EAS development-build and update-channel setup, with owner-operated signing and Apple steps listed separately.
- **OQ12.** How device verification is recorded. A successful build is not evidence of installation, authentication, or review on a device.

## 10. Completion Handoff

When 21d is complete, the owner can open Overload in the iOS Simulator, launch a development build on the iPhone, sign in with a staging account, create an account natively, request password recovery, sign out and back in, navigate the shell, switch between light, dark, and system appearance, restart or resume without losing a valid session, see clear errors when the network or backend is unavailable, and receive a staging update without publishing to Production. The web app is unchanged, and the staging QA fixture stays available.

**Next: Pitch 21e — Workout Loop.** Pitch 21d is complete when the native shell, authentication, staging connectivity, and the development-update loop are proven on a real iPhone, not when Expo compiles.
