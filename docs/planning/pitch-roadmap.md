# Overload — Pitch Roadmap

## Sequencing Logic

Pitches 1 to 16 are complete (MVP 1 to 3). MVP 4, the web commercial foundation, is largely built: Admin Center & Feedback, Public Accounts, Plans & Billing, the Public Landing Page, and Workout Plan Import are shipped, and the Launch Readiness gate is deferred to MVP 6. Real friends already have accounts on the web app, and the Discord is ready.

**The priority has changed again: iPhone first.** Overload has not been on an iPhone yet, because the Mac needed for Xcode was too old. With a working web product, existing users, a tested billing flow, and a stable staging-to-production workflow, the next engineering project is the iOS app and a TestFlight beta for the friends who already have accounts. Adding features before the iOS foundation exists would only add things to carry across later, so new features wait, except a confirmed critical bug.

**How the roadmap is organized.** Pitch numbers are permanent IDs, kept so links in tickets, specs, and runbooks do not break. They are not the order of work. The order is the milestone order below. Pitches that have not started were renumbered once so their numbers follow that order.

| Milestone | Focus | Pitches | Docs folder |
| --- | --- | --- | --- |
| MVP 1 | Core training product | 1 to 7, complete | `mvp-1-core-training` |
| MVP 2 | Multi-user and first impressions | 8 to 13, complete | `mvp-2-multi-user` |
| MVP 3 | Training intelligence | 14 to 16, complete | `mvp-3-training-intelligence` |
| MVP 4 | Web commercial foundation | 17 to 20 and 22 complete | `mvp-4-web-commercial` |
| MVP 5A | iOS Foundation & TestFlight | 21 | `mvp-5a-ios-testflight` |
| MVP 5B | Friends beta & workout refinements | 24, 25, and two chores | `mvp-5b-friends-beta` |
| MVP 5C | Native experience & lightweight sharing | 26 to 30 | `mvp-5c-native-and-sharing` |
| MVP 6 | Public mobile distribution & commercial safeguards | 23, 31 | `mvp-6-public-mobile` |
| MVP 7+ | Expansion | 32 to 39+ | `mvp-7-expansion` |

Each pitch's documents live in `docs/pitches/<docs folder>/<NN-pitch-name>/`.

**What the friends beta teaches.** After the first TestFlight build, a few weeks of real use should answer whether people log full workouts on their phones, where they stall, whether they understand the recommendations, whether they use plans or want spontaneous workouts, and whether they ask to share workouts or see their history differently. Those answers decide which of Pitches 25, 26, and 27 comes first. They are not decided now.

**Quick check before the friends' build.** If the below-minimum-reps progression issue (Pitch 24) is confirmed as a real bug, its fix is built on staging and included before the friends' production-connected build, since every tester would meet it on day one.

**Decisions locked in**

- Overload is operated by an individual. No LLC is planned, and legal, tax, and payout handling stay as lean as possible. An individual seller still owes tax on income and is bound by Apple's, Stripe's, and privacy and consumer rules, so those are checked at Launch Readiness. None of them requires a company.
- Apple enrollment is an individual Apple Developer account, so the owner's legal name is the App Store seller.
- The existing Stripe web billing stays as built. It is not rebuilt, and no purchase flow is added inside the iOS app until the store billing path is decided in Pitch 31.
- Beta users are the existing friends, using their existing accounts, invite-only through external TestFlight.
- The first iOS build connects to the development environment on the owner's own phone. A separate build connected to Production goes to the friends after sign-in and workout logging are verified.
- The iOS shell starts with a Capacitor feasibility check, and there is no native rewrite by default.
- Android comes after iOS has proven the cross-platform approach.
- Complex monitoring is deferred. Essential failure visibility is enough for the beta.
- Workout Plan Import (Pitch 22) is built, and the model provider stays disabled in Production until its remaining Production approvals pass.
- A built-in social network is future exploration, not a pitch. Limited, user-initiated sharing (Pitches 27 and 28) is planned and changes the earlier "no social features" boundary, which is amended deliberately in the Brief, PRD, and `CLAUDE.md`.

**Chores.** Small items that need no pitch run as a single Linear ticket through the chore prompt in the pipeline guide, with no design doc, preview, or spec unless the chore touches data, plans, privacy, or account isolation.

**Deliberately not planned**, so no run adds them: dated lifting goals; a rest timer; ads; a React Native or SwiftUI rewrite of the phone app; a Wear OS watch app; AI that generates programs or coaches (plan import only parses a plan the lifter wrote); social login; any admin view of an account's training content; and a feed, following, comments, messaging, or leaderboards.

## Pitches

### Pitch 1: Foundation
- **Type:** Foundational
- **Status:** Complete, in production
- **Value delivered:** The production application, authentication, database architecture, deployment, security model, and core project conventions.
- **Delivered:** Next.js App Router with React and TypeScript, Supabase Postgres, Auth, and Storage, Prisma as the only application-data path, Vercel deployment, row-level security enabled deny-all against the public Data API, and separate production and development databases. Built as a single-account product with public signup disabled and no roles, which Pitches 8 and 9 now change.

### Pitch 2: Library & Gyms Setup
- **Type:** Feature
- **Status:** Complete, in production
- **Value delivered:** A searchable exercise library and gym management, with gym-aware baselines.
- **Delivered:** Searchable library, custom exercises, soft deletion, gym creation and management, gym-specific working context for machine and cable movements, and global history for free-weight movements.

### Pitch 3: Split & Mesocycle Builder
- **Type:** Feature
- **Status:** Complete, in production
- **Value delivered:** Training-plan construction.
- **Delivered:** Mesocycles with a length and a scheduled deload week, sessions assigned to weekdays with ordered exercises, planned set counts and target rep ranges, session duplication, mesocycle clone-forward, and planned cardio attached to a training day. A session is the planned template, and logging never rewrites it.

### Pitch 4: Guided Workout Logging
- **Type:** Feature
- **Status:** Complete, in production
- **Value delivered:** The actual gym workflow, with preserved history.
- **Delivered:** Today's workout, gym selection, sets/reps/weight logging through one canonical write path, exercise swapping, historical corrections, missed-day handling (log late, shift, skip), and gym-baseline establishment and correction. A later correction made pure bodyweight exercises reps-only: externally loaded movements need weight and reps, bodyweight movements need reps only, no e1RM is derived from a missing load, no machine baseline applies, and no automatic increase is suggested for a bodyweight rep target.

### Pitch 5: Progressive Overload Engine
- **Type:** Feature
- **Status:** Complete, in production
- **Value delivered:** The core reasoning system.
- **Delivered:** Progress, hold, reactive deload, e1RM, and stall detection, all computed on read and never stored. The plan's rep range drives the call, insufficient history never produces a false call, suggested increases never alter the plan, and scheduled and reactive deloads stay separate with the scheduled week suppressing the reactive check.

### Pitch 6: Goals
- **Type:** Feature
- **Status:** Complete, in production
- **Value delivered:** Undated strength targets.
- **Delivered:** One active goal per exercise as a weight × reps target, progress through the same e1RM function the engine uses, completed goals archive, no generated targets, no deadlines. Dated goals were considered and rejected, because a strength deadline can pressure someone to lift past what their readiness supports.

### Pitch 7: Cardio Logging
- **Type:** Feature
- **Status:** Complete, in production
- **Value delivered:** A deliberately simple cardio record.
- **Delivered:** Planned cardio by training day, type and duration, cardio logging, cardio-only days, and independent lifting and cardio completion. No pace, distance, heart rate, calories, or progression.

### Pitch 8: Multi-User Foundation
- **Type:** Foundational
- **Status:** Complete, in production
- **Value delivered:** Overload can hold more than one person's data safely, and the existing production data is intact and still William's.
- **Detail:** see the pitch's spec and run report for what shipped.

### Pitch 9: Accounts — Signup, Login & Password Reset
- **Type:** Feature
- **Status:** Complete, in production
- **Value delivered:** A friend can create an account and sign in.
- **Detail:** see the pitch's spec and run report for what shipped. Password recovery was deliberately not shipped, to avoid a third-party email dependency. It is built in Pitch 19.

### Pitch 10: Personalization & Navigation Polish
- **Type:** Feature
- **Status:** Complete, in production
- **Value delivered:** The app greets the lifter by name, works comfortably on a phone, and respects their light or dark preference.
- **Detail:** see the pitch's spec and run report for what shipped.

### Pitch 11: Onboarding Tour
- **Type:** Feature
- **Status:** Complete, in production
- **Value delivered:** A new lifter learns what each part of Overload does the first time they sign in, and can revisit it later.
- **Detail:** see the pitch's spec and run report for what shipped.

### Pitch 12: What's New
- **Type:** Feature
- **Status:** Complete, in production
- **Value delivered:** Lifters see what changed in the latest update, and can look back at the history.
- **Detail:** see the pitch's spec and run report for what shipped.

### Pitch 13: Faster Logging UX
- **Type:** Feature
- **Status:** Complete, in production
- **Value delivered:** Fewer actions to log a normal set, with a card that stays visually restrained.
- **Detail:** see the pitch's spec and run report for what shipped.

### Pitch 14: RIR Logging & Autoregulation
- **Type:** Feature
- **Status:** Complete, in production
- **Value delivered:** The engine learns how hard a set was, not just whether the rep number was hit.
- **Detail:** see the pitch's spec and run report for what shipped.

### Pitch 15: Smarter & Explainable Progression
- **Type:** Feature
- **Status:** Complete, in production
- **Value delivered:** Recommendations become specific, and the lifter can see why each was made.
- **Detail:** see the pitch's spec and run report for what shipped.

### Pitch 16: Exercise History & PR Intelligence
- **Type:** Feature
- **Status:** Complete, in production
- **Value delivered:** One place to see how a lift has really been going.
- **Detail:** see the pitch's spec and run report for what shipped.

---

## MVP 4 — Web Commercial Foundation (largely shipped)

### Pitch 17: Admin Center & Feedback
- **Type:** Feature
- **Status:** Complete, in production
- **Value delivered:** The owner can operate Overload: see who is using it, manage accounts, and read feedback, without seeing anyone's training content.
- **Detail:** see the pitch's spec.

### Pitch 18: Public Accounts, Recovery & Support
- **Type:** Feature
- **Status:** Complete
- **Value delivered:** Strangers can sign up safely, recover access without the owner, take their data with them, and leave.
- **Detail:** see the pitch's spec. Public signup stays gated by the signup-mode setting until the owner opens it.

### Pitch 19: Plans, Billing & Promo Codes
- **Type:** Feature
- **Status:** Complete
- **Value delivered:** A Free plan (no ads, ever) and a paid Pro plan with a 14-day trial, hosted checkout, promo codes, and owner-granted comped access. Capture, history, and export stay free.
- **Detail:** see the pitch's spec. Stripe web billing stays as built.

### Pitch 20: Public Landing Page & Changelog
- **Type:** Feature
- **Status:** Complete
- **Value delivered:** A credible place for a visitor to land, understand Overload, and sign up.
- **Detail:** see the pitch's spec.

### Pitch 22: Workout Plan Import & Review
- **Type:** Feature
- **Status:** Complete, with the model provider disabled in Production
- **Value delivered:** A lifter can paste the plan they already keep in Notes and get a structured Overload plan after reviewing it.
- **Detail:** see the pitch's spec. The provider stays off in Production until the owner approves activation.

---

## MVP 5A — iOS Foundation & TestFlight (next)

### Pitch 21: iOS Foundation & TestFlight
- **Type:** Foundational
- **Status:** Planned (next)
- **Value delivered:** Overload runs as an iPhone app around the existing web product, the existing friends can install it and sign in with their current accounts, and every later pitch knows how to treat iOS.
- **Includes:**
  - A feasibility check first. How a Capacitor shell runs a server-rendered Next.js application (for example, loading the hosted site in the shell versus a different approach) is recorded as a decision with its tradeoffs and proven on a real iPhone.
  - The Capacitor and Xcode project on the owner's new Mac, signing, icon, launch behavior, safe areas, keyboard behavior, backgrounding, navigation, and session persistence per account.
  - Two build configurations: a development build connected to the development environment for the owner's own phone, and a build connected to Production for the friends.
  - Deep links.
  - A platform adapter structure named by capability (haptics, notifications, location, health), with the iOS implementations behind it and graceful browser fallbacks. This pitch builds the haptics adapter and capability foundations only.
  - Existing account holders sign in and keep the plan, Pro, or comped access they already have. The app shows their access read-only. There is no purchase flow and no in-app purchase.
  - Build and install steps, and an external TestFlight beta, which Apple reviews once for the first external build.
  - The `overload-cross-platform` skill, filled in with the architecture this pitch establishes.
- **Human steps (in the runbook):** enroll in the Apple Developer Program as an individual, set up the new Mac and Xcode, register the iPhone, create the App Store Connect record, and invite the friends.
- **Defers:** In-app purchase and any store billing path, App Store submission, location, notifications, Live Activity, Watch, and Android.
- **Depends on:** MVP 1 to 4.
- **Definition of done:**
  - The Xcode project builds on the new Mac and installs on the owner's iPhone.
  - The existing account signs in and stays signed in.
  - Plans, starting a workout, logging sets, finishing a workout, and history all work on the phone.
  - Safe areas, keyboard, navigation, backgrounding, and authentication behave naturally on iPhone.
  - The development build uses the development environment, and the friends' build uses Production deliberately.
  - A TestFlight build is uploaded and approved for external testers, and an existing friend installs it and signs in with their existing account.
  - The website behaves exactly as before, and no native-only control renders in the browser.

---

## MVP 5B — Friends Beta & Workout Refinements

**Friends beta (an activity, not a pitch).** Invite the existing friends to the TestFlight build, confirm their accounts and workout histories look right, and collect feedback in Discord. What they report decides the order of Pitches 25, 26, and 27.

### Pitch 24: Workout Logging Refinements
- **Type:** Feature
- **Status:** Planned
- **Value delivered:** Four small correctness and usability gaps in logging and planning are closed.
- **Includes:**
  - **Below-minimum reps.** If a logged set falls below the planned minimum (for example 90 lb planned at 6 to 10 reps, logged 3), the app must not recommend staying at that weight. A clearly failed set triggers a reassessment or reduction recommendation under the existing progression rules and history. It does not overwrite a reliable baseline by itself, and not every missed set reduces weight. The spec defines the rule using the existing constants. Verify first whether the current behavior really is a bug.
  - **Fixed rep targets.** A planned exercise can have a single target (3 × 10) without a range. Internally it can be a range with equal minimum and maximum. The spec confirms how a pass and the progression threshold behave when there is no upper end.
  - **Swap exercise.** The swap picker can change its muscle filter to any group, not only the planned exercise's group.
  - **Abs and bodyweight logging audit.** Verify that abs exercises log like pull-ups and other bodyweight movements (reps only, no fake load, no e1RM from a missing load, no machine baseline). Fix only if it is broken.
- **Plan placement:** Capture and plan building are Free. Recommendations stay Pro.
- **Defers:** Any change to progression rules beyond the below-minimum case.
- **Depends on:** Pitches 4, 5, 14, 15, and 16.
- **Definition of done:**
  - A failed set below the planned minimum never produces a "stay at this weight" recommendation.
  - A 3 × 10 exercise plans, logs, and progresses correctly.
  - Swap can reach exercises in any muscle group.
  - Abs logging is confirmed or fixed to match the other bodyweight movements.

### Pitch 25: Wing-It Workouts
- **Type:** Feature
- **Status:** Planned (order decided by beta feedback)
- **Value delivered:** A lifter can start a workout without a plan, choose exercises as they go, and have it saved to history.
- **Includes:** A Start workout action that needs no mesocycle, choosing exercises while training, logging sets with the existing logging card, saving to history, using the existing gym-aware baselines where applicable, and never altering the scheduled plan or the missed-day logic. How progression treats an exercise with no planned rep range is decided in the spec. The default is that it adds to history and the e1RM trend but receives no progress or deload tag.
- **Plan placement:** Free.
- **Defers:** Suggesting exercises, and turning a wing-it workout into a planned session.
- **Depends on:** Pitches 4 and 5. Sequenced after Pitch 21.
- **Definition of done:**
  - A workout can be started and finished with no plan, and it appears in history.
  - The scheduled plan and the dashboard's planned day are unchanged.
  - Machine and cable exercises still use the chosen gym's baselines.

**Chore: landing page trial wording.** Tiara's feedback is that the "no card" wording confused her and read as if it were talking to friends. State the trial plainly and briefly, for example: "Try Pro free for 14 days. No credit card needed. After that, keep using Overload on the free plan or upgrade for $4.99 a month." Copy only, one ticket.

**Chore: admin membership visibility.** The admin account list shows each account's plan (Pro, Free, or comped). It shows account metadata only and never any training content. One ticket.

---

## MVP 5C — Native Experience & Lightweight Sharing

### Pitch 26: History Calendar
- **Type:** Feature
- **Status:** Planned (order decided by beta feedback)
- **Value delivered:** A visual calendar view of training history, in addition to the week-at-a-glance list.
- **Includes:** A calendar of logged, planned, skipped, and wing-it days that opens the logged workout for a day, usable one-handed on a phone.
- **Plan placement:** Free.
- **Defers:** Anything that changes the underlying history.
- **Depends on:** Pitch 4.
- **Definition of done:**
  - Every logged day appears on the calendar and opens its workout.
  - The calendar and the list agree.

### Pitch 27: Friends & Workout Sharing
- **Type:** Feature
- **Status:** Planned (order decided by beta feedback)
- **Value delivered:** A lifter can send a workout to a friend, who reviews it and adds their own copy.
- **Includes:** A short planning step that settles what a friend is and what is shareable. The first scope is sharing a workout template (a session with its exercises and planned sets and rep ranges) by link or code. The recipient reviews and imports a copy into their own plan, so no account ever reads another account's data live. Sharing is user-initiated and revocable, and logged history is never shared this way. This deliberately amends the earlier no-social boundary, and the amendment is recorded in the Brief, PRD, and `CLAUDE.md` before the pitch runs.
- **Defers:** A feed, following, comments, direct messages, leaderboards, and content creators.
- **Depends on:** Pitches 3 and 21.
- **Definition of done:**
  - A shared template arrives as a copy the recipient confirms, and the sender's account is never readable by the recipient.
  - Revoking a share stops further imports.
  - The cross-account isolation suite still passes.

### Pitch 28: Shareable Progress Cards
- **Type:** Feature
- **Status:** Planned
- **Value delivered:** A lifter can share a goal hit or a set from the app, for example to an Instagram Story.
- **Includes:** A generated card for a goal reached or a logged set, an optional photo background, and the phone's native share sheet, so the lifter can resize and position it in the destination app. The lifter chooses what the card shows. Nothing posts automatically. The web gets a download fallback.
- **Plan placement:** Free.
- **Defers:** Video, and posting directly through a social app's API.
- **Depends on:** Pitches 6 and 21.
- **Definition of done:**
  - A card is generated from a goal or set and shared through the iOS share sheet.
  - The card contains only what the lifter selected.

### Pitch 29: Gym Location Awareness
- **Type:** Feature
- **Status:** Planned
- **Value delivered:** Overload suggests the right gym on arrival so machine baselines are not polluted.
- **Includes:** Pinned gym coordinates stored on the lifter's own gyms, region-based (geofence) arrival detection with no continuous tracking, a suggestion that can be overridden, and no silent assignment when detection is uncertain. Coordinates are personal location data, private to the account.
- **Defers:** Always-on location tracking.
- **Depends on:** Pitch 21.
- **Definition of done:**
  - Arriving at a pinned gym produces a suggestion, not a silent assignment.
  - An uncertain detection never changes the gym without confirmation.
  - No background GPS tracking runs.

### Pitch 30: Native Notifications
- **Type:** Feature
- **Status:** Planned
- **Value delivered:** A few restrained notifications that offer a useful action.
- **Includes:** Today's scheduled workout, a planned mesocycle transition, a useful missed-day reminder, and deep links into today's workout. Each asks whether the lifter can act on it right now. Preferences are per account.
- **Defers:** Engagement nudges, streaks, and motivational or guilt-based reminders.
- **Depends on:** Pitch 21. Uses Pitch 29 for location-aware messages.
- **Definition of done:**
  - Each notification type can be turned off individually.
  - A tap opens the right place in the app.
  - Nothing fires when there is nothing actionable.

---

## MVP 6 — Public Mobile Distribution & Commercial Safeguards

### Pitch 23: Launch Readiness
- **Type:** Foundational
- **Status:** Planned (deferred until the beta proves the experience)
- **Value delivered:** Evidence that Overload is ready to accept paying strangers, kept lean for a solo individual operator.
- **Includes:**
  - A tested backup and restore drill, and essential failure visibility instead of heavy monitoring.
  - Basic rate limiting, and a check that cross-account isolation, admin authorization, and webhook authentication still hold.
  - Documented procedures for payment failure, cancellation, refund, deletion, and support.
  - The full journey from landing page through checkout to a first workout, on web and iPhone.
  - Owner checks, listed so they are not forgotten and kept minimal: confirm the tax and payout obligations that apply to an individual seller, confirm the hosting and database plans allow commercial use and include backups, and make sure the creator videos disclose any commercial relationship. This roadmap is not legal or tax advice.
- **Defers:** Anything that needs a company, a lawyer, or heavy tooling.
- **Depends on:** Pitches 17 to 22 and 21.
- **Definition of done:**
  - Each checklist item has recorded evidence.
  - A small group of real testers completes real workouts without the owner's help.
  - The owner signs off before any stranger is charged.

### Pitch 31: App Store Release
- **Type:** Foundational
- **Status:** Planned
- **Value delivered:** Overload is available in the App Store.
- **Includes:** The store listing, privacy details, and review notes. A decision on how paid access works in the app, checked against Apple's guidelines at that time (a link out to the web checkout opened in the external browser on the US storefront, in-app purchase, or sign-in for existing subscribers only). Confirmation that the app offers native value beyond a website wrapper, which the native features in MVP 5C support. In-app account deletion, and TestFlight feedback addressed.
- **Defers:** Other storefronts.
- **Depends on:** Pitches 19 and 21, and at least some of Pitches 26 to 30.
- **Definition of done:**
  - The app is approved and released.
  - A paying customer's access works in the app without a purchase path Apple's rules do not allow.

---

## MVP 7+ — Expansion

### Pitch 32: Android Foundation
- **Type:** Foundational
- **Status:** Planned
- **Value delivered:** Overload runs as an Android app around the same web product, using the platform-neutral structure Pitch 21 established.
- **Includes:** A Capacitor Android project and Android Studio build, signing, adaptive icon and splash, back-button and status-bar behavior, session persistence, deep links, the Android implementations of the platform adapters, build and install steps, and an internal testing track on Google Play.
- **Defers:** Play Store release and any native capability beyond the foundation.
- **Depends on:** Pitch 21.
- **Definition of done:**
  - The app installs on a real Android phone and through Play internal testing, signs in, and completes a full workout.
  - The website and the iOS app behave exactly as before.

### Pitch 33: Google Play Release
- **Type:** Foundational
- **Status:** Planned
- **Value delivered:** Overload is available on Google Play.
- **Includes:** The store listing, data-safety disclosure, and review notes; Google's closed-testing requirement for new personal developer accounts (check the current tester count and days); a decision on how paid access works in the app under Google's current billing policy; and native value beyond a website wrapper.
- **Depends on:** Pitches 19 and 32.
- **Definition of done:**
  - The app is approved and released, with no purchase path Google's policy does not allow.

### Pitch 34: Active Workout Live Activity
- **Type:** Feature
- **Status:** Planned
- **Value delivered:** An active workout is visible on the lock screen, and on the Dynamic Island on iPhones that have one.
- **Includes:** Workout name, elapsed time, current exercise, current and total sets, and target reps, with a tap that returns to the active workout. It exists only while a workout is active. The Android equivalent is decided in the pitch, most likely an ongoing notification.
- **Depends on:** Pitch 21.
- **Definition of done:**
  - The surface starts with a workout and ends with it, and its content matches the active workout state.

### Pitch 35: Apple Watch Companion
- **Type:** Feature
- **Status:** Planned
- **Value delivered:** The Watch is useful during a workout without copying the phone app.
- **Includes:** Starting today's workout from the Watch (the same underlying workout as on the phone), showing elapsed time, current exercise, set number, planned set count, rep range, and next exercise, and controls to advance a set, move between exercises, and end the workout. Phone and Watch share one workout state. iOS only.
- **Defers:** Full weight and reps entry on the Watch, to be decided after using the simpler version.
- **Depends on:** Pitches 21 and 34.
- **Definition of done:**
  - Starting on either device never creates a second workout.

### Pitch 36: Advanced Cardio Logging
- **Type:** Feature, discovery first
- **Status:** Planned
- **Value delivered:** Richer cardio records, with a decision made on how to get them.
- **Includes:** A discovery step comparing the options: pulling data from an existing source (the phone's health platform, which can already hold runs recorded by other apps, or the Strava API; Nike Run Club has no public API as far as is known, so verify), or a fully custom system with its own goals and progression, which would be a very different product area from lifting. The discovery recommends one and the first build follows. Any progression for cardio would reverse the current "cardio is a record only" boundary, so that is an explicit decision.
- **Depends on:** Pitch 21.
- **Definition of done:** A recommendation is recorded and approved before any build starts.

### Pitch 37: Attach Videos to Sets
- **Type:** Feature, discovery first
- **Status:** Planned
- **Value delivered:** A lifter can keep a video with a logged set.
- **Includes:** A discovery step on storage, privacy, and cost before any build, because video changes what Overload stores and who could see it.
- **Depends on:** Pitch 21.
- **Definition of done:** A recommendation covering storage, cost, retention, and privacy is approved before any build starts.

### Pitch 38: Body Metrics (HealthKit and Health Connect)
- **Type:** Feature
- **Status:** Planned
- **Value delivered:** Body data syncs from the phone's health platform and can be viewed on web and mobile.
- **Includes:** Body weight, body-fat percentage where available, resting heart rate, and selected workout information, each with a stated product reason, in a Body domain separate from training. Synced data lives in the backend per account.
- **Defers:** Every other health metric, and any automatic effect on lifting recommendations.
- **Depends on:** Pitches 21 and 32.
- **Definition of done:**
  - Synced metrics appear on web and mobile, scoped to the account that synced them, and never touch a training recommendation.

### Pitch 39+: Nutrition
- **Type:** Feature (several pitches)
- **Status:** Planned, to be split when reached
- **Value delivered:** Calorie and macro tracking as its own domain.
- **Includes:** Likely a foundation (targets, entries, daily totals), then food logging, then trends.
- **Depends on:** Pitch 38.

**Future exploration (not a pitch).** A built-in social platform with posts, following, messaging, and content creators. It is a large product and moderation commitment. Some of its basics may arrive through the friends and sharing pitches, and anything beyond that needs its own decision and its own initiative.

## Dependency Map

Pitches 1 to 20 and 22 are complete. Pitch 21 depends on them and blocks everything native: 26 to 31 and 32 to 38. Pitch 24 depends on 4, 5, 14, 15, and 16 and is not blocked by 21, but its fix lands before the friends' build if the issue is confirmed. Pitch 25 depends on 4 and 5. Pitch 26 depends on 4. Pitch 27 depends on 3 and 21. Pitch 28 depends on 6 and 21. Pitches 29 and 30 depend on 21, and 30 uses 29. Pitch 23 depends on 17 to 22 and 21. Pitch 31 depends on 19 and 21 and at least some of 26 to 30.

Pitch 32 depends on 21. Pitch 33 depends on 19 and 32. Pitch 34 depends on 21. Pitch 35 depends on 21 and 34. Pitches 36 and 37 depend on 21 and begin with discovery. Pitch 38 depends on 21 and 32, and the nutrition pitches depend on 38.

**Rollout gates (not pitches):** the friends' TestFlight build connects to Production only after sign-in and workout logging are verified on the development build. No payment flow is added inside the iOS app until Pitch 31 decides the store billing path. Pitch 22's model provider stays disabled in Production until its approvals pass. A public App Store release waits for Pitches 23 and 31.
