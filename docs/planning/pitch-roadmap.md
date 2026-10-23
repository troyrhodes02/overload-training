# Overload — Pitch Roadmap

## Sequencing Logic

Pitches 1 to 16 are complete and in production. They delivered the working training product (MVP 1), the multi-user conversion with its first-impression features (MVP 2), and the training-intelligence pitches (MVP 3).

**The direction has changed again.** Overload is moving from an invite-only tracker for friends to a commercial product that strangers can find, pay for, and use. A friend's "Road to 315 lb Bench" video series will feature Overload and offer a promo code. That needs a dedicated phase, MVP 4, and it reverses several earlier boundaries: an admin interface, billing, and public signup were all "not planned" and are now planned. They are amended in the Brief, PRD, Architecture Doc, and CLAUDE.md before any pitch in this phase is written.

**Order within MVP 4, and why.**

1. **Admin Center & Feedback (Pitch 17) first.** The owner needs to operate the product before opening it: see who is using it, manage accounts, read feedback. It also fixes the privacy boundary early. The admin area works on accounts and counts, never on anyone's training content.
2. **iOS Foundation (Pitch 18) second.** Billing, public signup, and password-reset links are where web and iPhone behave differently (browser redirects, deep links, sessions). Proving the shared architecture on a real iPhone before building them avoids reworking them later. It is time-boxed and starts with a feasibility decision. It is not on the critical path to a web launch.
3. **Public Accounts (Pitch 19).** Public signup, password recovery and the email delivery it needs (neither exists today), data export, deletion, and support, so strangers can be let in safely.
4. **Plans, Billing & Promo Codes (Pitch 20).** A Free plan and a paid Pro plan. Stripe handles money and authoritative billing state. Overload decides what each account is entitled to, including accounts the owner grants free access.
5. **Landing Page & Changelog (Pitch 21).** Somewhere credible for a video viewer to land. It can serve early-access signup before billing is ready.
6. **Plan Import & Review (Pitch 22).** Removes the biggest adoption barrier: retyping an existing plan from Notes.
7. **Launch Readiness & Closed Beta (Pitch 23).** The gate for accepting paying strangers. It is its own pitch because a finished feature list is not the same as being ready.

**Plans in one line.** Capture is free and interpretation is paid. Everything a lifter enters, their full history, and their ability to export it stay free, with no ads, ever. Pro adds the progression insights and plan import. New accounts get 14 days of Pro, then move to Free with nothing lost.

**Rollout gates (not pitches).** Public signup stays invite-only until Pitch 19 is verified. No payment is collected until Pitch 23's checklist passes. The first video can point to the landing page and early access before billing is live. Two weeks is likely not enough to finish all seven pitches safely, so the video date should not force a paid launch.

**The iPhone app and the App Store are separate things.** The iOS foundation ships to a small group of trusted testers through TestFlight early. A public App Store release comes later (Pitch 29), for two reasons that Apple's review rules make real. An app that is only a wrapper around a website risks rejection for minimal functionality, so it benefits from the native features in MVP 5 first. And selling subscriptions raises a purchase-flow question: on the US storefront an app may link out to a web checkout, but that must open in the external browser and is not allowed in other storefronts, where in-app purchase is required. That is why billing is built as a platform-neutral entitlement system.

**Android.** The plan covers it deliberately. Pitch 18 builds the iOS shell with every native capability behind a platform-neutral adapter, so Android adds implementations rather than changing callers. After launch, Pitch 24 adds the Android shell first, so location, notifications, and the rest are built once for both platforms. The Apple Watch app and the Live Activity are iOS-only, and Android gets an equivalent for the second if one fits. Google Play has its own billing policy and its own testing requirement for new developer accounts, handled in Pitch 30.

**After launch.** MVP 5 is the mobile experience: Android, then location, notifications, Live Activity, and Watch, ending with the App Store and Google Play releases. MVP 6 is health, body, and nutrition.

**Cross-platform from here on.** Once the iOS foundation exists, every pitch decides explicitly what is shared web UI, what needs native work, and what stays web-only (the admin area stays web-only), using the `overload-cross-platform` skill. iOS and Android are not left as a cleanup task.

**Deliberately not planned**, so no run adds them: dated lifting goals; a rest timer; a React Native or SwiftUI rewrite of the phone app; a Wear OS watch app; AI that generates programs or coaches (plan import only parses a plan the lifter wrote); cardio progression analysis; social login; and any admin view of another account's training content.

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

## MVP 4 — Commercial Launch & Operations

### Pitch 17: Admin Center & Feedback
- **Type:** Feature
- **Status:** Planned (next)
- **Value delivered:** The owner can operate Overload: see who is using it, manage accounts, and read feedback, without ever seeing anyone's training content.
- **Includes:**
  - An owner-only admin area. Admin identity is established on the server from an allowlist in a server-only environment variable. It is not a database role, and nothing in the app can grant it. Every admin operation re-checks it on the server, because hiding navigation is not authorization.
  - Account lookup and list: name, email, signup date, status, last active (date only), tour completed, and plan and entitlement state once billing exists. Granting free access is added in Pitch 20, when the entitlement model exists.
  - Account actions: suspend and reactivate (enforced on every authenticated request, so a suspended account cannot act), and delete an account through the existing deletion module with confirmation.
  - Aggregate operating metrics, counts only: registered accounts, active in the last 7 and 30 days, new this month, accounts that have created a plan, accounts that have logged a workout, and simple signup-cohort return rates. A dedicated admin metrics layer computes them and never returns workout contents.
  - An in-app feedback form for every lifter, and an inbox for the owner to read, categorize, and mark handled.
  - An append-only audit log of every admin action: who, what, which account, when.
  - The privacy boundary: the admin area never shows any account's plan, gyms, logged sets, goals, or cardio.
- **Defers:** Billing controls (billing state is mirrored read-only from the payment provider and never edited here), impersonation, ticketing beyond the feedback inbox, and any access to training content. If support ever genuinely needs the latter, it is a separate decision with explicit, narrow, audited access.
- **Depends on:** MVP 3.
- **Definition of done:**
  - A non-admin account cannot reach any admin page or operation, by URL or by calling the server action directly.
  - Suspending an account blocks it on its next request, and reactivating restores it.
  - The metrics match the underlying data and expose no training content.
  - A lifter can send feedback, and the owner can read it and mark it handled.
  - Every admin action appears in the audit log.

### Pitch 18: iOS Foundation & Cross-Platform Workflow
- **Type:** Foundational
- **Status:** Planned
- **Value delivered:** Overload runs as an iPhone app around the existing web product, the shared architecture is proven on a real device, and every later pitch knows how to treat iOS.
- **Includes:**
  - A feasibility decision first. How a Capacitor shell runs a server-rendered Next.js application (for example, loading the hosted site in the shell versus a different approach) is recorded as a decision with its tradeoffs and proven with an authenticated workout flow on a real iPhone.
  - The Capacitor and Xcode project, signing, icon, launch behavior, safe areas, keyboard behavior, session persistence per account, and development versus production environment handling.
  - Deep links, so password-reset and checkout returns can land in the app.
  - A platform adapter structure named by capability, not by platform (haptics, notifications, location, health), with each platform's implementation behind it, so adding Android later means adding implementations, not changing callers. Adapters degrade gracefully in the browser. This pitch builds the iOS implementations, with a haptics adapter and capability foundations for notifications, location, and HealthKit.
  - Build and install steps and a TestFlight-ready process.
  - The `overload-cross-platform` skill, filled in with the architecture this pitch establishes.
- **Defers:** Location, notifications, Live Activity, Watch, HealthKit, in-app purchase, and App Store submission.
- **Depends on:** Pitches 9 and 10. Sequenced after Pitch 17.
- **Definition of done:**
  - The feasibility decision is recorded.
  - The app installs on a real iPhone and through TestFlight, signs in, and completes a full workout against a production-like environment.
  - The website behaves exactly as before, and no native-only control renders in the browser.
  - A test deep link opens the right screen in the app. Password-reset and checkout returns use it when those pitches ship.

### Pitch 19: Public Accounts, Recovery & Support
- **Type:** Feature
- **Status:** Planned
- **Value delivered:** Strangers can sign up safely, recover access without contacting the owner, get help, take their data with them, and leave.
- **Includes:**
  - A signup mode switch between invite-only and public, set by server configuration and off by default.
  - Abuse protection on signup and password reset: rate limits and a bot challenge, chosen in the pitch.
  - Password recovery, which does not exist today: Pitch 9 shipped without it to avoid a third-party email dependency. Build forgot and reset password over a custom SMTP provider configured in Supabase Auth (Supabase's built-in sender only reaches the project's own team and is rate-limited), with the same response whether or not an email has an account, and an admin action to send a reset email.
  - Production email on a verified domain with separate authentication and support sender identities, and deliverability checks as runbook steps.
  - Email verification before first checkout (the default, decided in the pitch).
  - Export of all of an account's own data as a downloadable file.
  - Account deletion confirmed end to end, and a support channel that includes the feedback form.
- **Defers:** Social login and multi-factor authentication.
- **Depends on:** Pitch 17 (admin account states) and Pitch 18 (deep links for reset).
- **Definition of done:**
  - A forgotten password can be recovered end to end, and the reset email reaches an external inbox on a real provider.
  - With public mode on, a stranger can sign up. With it off, signup still needs the invite code.
  - The abuse protections are tested.
  - An export contains everything the account owns and nothing from any other account.
  - Deleting an account removes all of its data and blocks further sign-in.

### Pitch 20: Plans, Billing & Promo Codes
- **Type:** Feature
- **Status:** Planned
- **Value delivered:** Overload has a free plan and a paid Pro plan. New lifters try Pro free for 14 days, can subscribe with a code such as BLIZZY, and always have access that matches their plan. The owner can grant full access to chosen accounts without billing them.
- **Includes:**
  - **Two plans.** Free, with no ads, ever, and Pro. The principle is that capture is free and interpretation is paid. Anything a lifter enters, every record of their own training, and their ability to export it stay free and are never gated, locked, or deleted.
  - **Free includes:** plan building (splits, mesocycles, sessions, the scheduled deload week, planned cardio); guided logging with swaps, bodyweight sets, reps-in-reserve entry, and missed-day handling; cardio logging; the exercise library and custom exercises; gyms with their baselines; full history with past-log editing; goals with their progress; data export; and account deletion.
  - **Pro includes:** the progression recommendations (progress, hold, deload, and suggested increases) and the evidence behind each; e1RM trends and stall detection; reps-in-reserve used in recommendations; Exercise History & PR Intelligence; and workout plan import. Later Pro additions go in Pro by default.
  - A 14-day Pro trial that starts at signup and requires no card. When it ends, or when a subscription lapses, the account moves to Free. Nothing is deleted and logging never stops.
  - Proposed Pro pricing, set by the owner: $4.99 a month or $39.99 a year (about $3.33 a month). For scale, in October 2026 listings, logging-focused apps run about $3 to $5 a month and apps with automatic progression or generated programs run about $13 to $16 a month.
  - Capabilities, not plan names, in code: features check a named capability (for example, progression insights or plan import), and each plan grants a set of them. A future tier then becomes a data change.
  - Enforcement on the server. A Free account never receives a Pro result, and hiding a button is not enforcement.
  - A quiet upgrade note where a Pro feature would be, in one place per screen and dismissible, with no countdowns, banners, or other dark patterns.
  - A platform-neutral entitlement model recording which capabilities an account has and why: trial, subscription, or comp. The trial and comps are Overload's own state, and subscription state comes only from verified, idempotent Stripe webhooks.
  - **Comped access, managed in the admin center.** The owner can grant any account full Pro access without billing it, with a reason (for example friend, creator, or tester), an optional end date, and an audit entry, and can revoke it. This is an entitlement source, not a role: it grants capabilities and not permissions, it has an expiry and a reason, and it never touches Stripe or the admin allowlist. Existing accounts are comped as founding members through the same mechanism.
  - Stripe Billing with hosted Checkout and the Customer Portal. No card data touches Overload.
  - Promo codes through Stripe promotion codes backed by coupons that apply for a fixed number of months, with a redemption limit and a first-time-customer restriction, entered at checkout when the lifter subscribes. BLIZZY is the first campaign: proposed 50% off for 3 months, capped at 200 redemptions to limit support load. The pitch verifies how Stripe counts months against a repeating coupon.
  - Plain disclosure before checkout of the price, how long any discount lasts, that it renews, and how to cancel. A failed payment gets a grace period before the account moves to Free.
  - Read-only admin visibility of subscription state, code redemptions, and the subscriptions they produced, alongside the comp controls.
  - A tax-handling decision recorded, and the full flow tested in Stripe's test mode.
- **Owner decisions, not derivable from the docs:** the Pro price, which capabilities sit in Pro (the split above is a proposal), whether the trial requires a card, the BLIZZY terms, and the grace-period length.
- **Defers:** In-app purchase and any native checkout on iOS or Android, a lifetime or six-month plan, extended trials, referral programs, and a higher tier for chat-style AI coaching, which comes much later.
- **Depends on:** Pitches 17, 18, and 19.
- **Definition of done:**
  - A new account has Pro for 14 days and then Free, with all of its data intact and logging uninterrupted.
  - A Free account cannot obtain any Pro result, including by calling a server action directly.
  - Granting and revoking comped access works, is audited, ends on its end date, and a comped account is never shown as a paying subscriber.
  - Webhooks are authenticated and idempotent, and replaying one changes nothing.
  - A promo applies for exactly its duration, then stops, and stops being accepted at its redemption limit.
  - The failed-payment path behaves as specified, and no card data is stored.

### Pitch 21: Public Landing Page & Changelog
- **Type:** Feature
- **Status:** Planned
- **Value delivered:** A credible place for a video viewer to land, understand Overload, and sign up.
- **Includes:**
  - Public marketing pages in the same application, separate from the signed-in product: landing, pricing (the Free and Pro plans), a creator page at `/blizzy` that explains the offer and carries the code through to checkout, support and contact links, and the privacy policy and terms (content supplied by the owner).
  - A public changelog built from the same repository release-note content that What's New uses, so entries are maintained once.
  - Real screenshots taken from a demo account, never from a real lifter's data.
  - A call to action that follows the current mode: early-access signup before billing is live, subscribe after.
  - First-party campaign attribution (which landing page or code led to a signup), with any third-party analytics decided in the pitch.
- **Defers:** A blog, testimonials, A/B tests.
- **Depends on:** Pitches 19 and 20 (for the subscribe state).
- **Definition of done:**
  - The pages are fast and accessible, and the call to action matches the current signup and billing mode.
  - `/blizzy` carries the code into checkout.
  - The changelog and What's New show the same entries from one source.
  - The privacy policy and terms are published.

### Pitch 22: Workout Plan Import & Review
- **Type:** Feature
- **Status:** Planned
- **Value delivered:** A lifter can paste the plan they already keep in Notes and get a structured Overload plan after reviewing it. Plan import is a Pro capability, so every new account has it during its 14-day trial, which is when most people bring their plan in.
- **Includes:**
  - Pasting plain text of an existing plan. A server-side model call extracts structure, and the result is validated against a strict schema, reusing the existing plan-seed format as the structured intermediate (to be confirmed in the spec).
  - Every extracted item must trace back to the pasted text.
  - Exercises are matched to the library, ambiguous matches are shown as choices, and unmatched ones are offered as new custom exercises.
  - A full review screen where everything can be edited, and nothing is saved until the lifter confirms. The existing plan-creation path then creates it, with no second path.
  - Guardrails: an input size limit, per-account rate and daily usage limits tied to the account's entitlement, a global spend cap with a kill switch, pasted text treated as data and never as instructions, a recorded decision on how long raw text is kept, and a review of the model provider's data terms.
  - It parses what the lifter wrote. It never invents exercises, sets, or loads, and it never generates a program.
- **Defers:** Files, PDFs, photos, and screenshots, and any AI that suggests programs.
- **Depends on:** Pitches 19 and 20 (accounts and usage limits tied to entitlement).
- **Definition of done:**
  - A typical pasted plan becomes a correct proposed plan that the lifter can edit.
  - Nothing is saved until confirmation, and an abandoned import leaves nothing behind.
  - Text containing instructions is parsed as data and does not change behavior.
  - The usage limits stop a runaway account, and the kill switch works.

### Pitch 23: Launch Readiness & Closed Beta
- **Type:** Foundational
- **Status:** Planned
- **Value delivered:** Evidence that Overload is ready to accept paying strangers.
- **Includes:**
  - The paid-launch checklist as verifiable tasks: a tested backup and restore drill; a security review covering cross-account isolation, admin authorization, and webhook authentication; rate limiting; error monitoring and alerting (provider chosen in the pitch); production on plans that allow commercial use and include backups (check the current terms of the hosting and database providers); documented procedures for payment failure, cancellation, refund, deletion, and support response; and the full journey from landing page through checkout to a first workout, on web and iPhone.
  - A closed beta with real people who did not build Overload, completing real workouts.
  - A launch decision signed off by the owner.
  - Human-side tasks listed so they are not forgotten: business entity and payout account, sales-tax decisions, disclosure that the creator videos are promotional where there is a commercial relationship, legal review of the terms and privacy policy, domain and email DNS, and Apple Developer Program enrollment.
- **Defers:** Public App Store release.
- **Depends on:** Pitches 17 to 22.
- **Definition of done:**
  - Each checklist item has recorded evidence.
  - Beta testers complete real workouts without the owner's help.
  - The owner signs off before any stranger is charged.

---

## MVP 5 — Mobile Experience (after launch)

### Pitch 24: Android Foundation
- **Type:** Foundational
- **Status:** Planned
- **Value delivered:** Overload runs as an Android app around the same web product, using the platform-neutral structure Pitch 18 established, so the features after it are built once for both platforms.
- **Includes:** A Capacitor Android project and Android Studio build, signing keystore, adaptive icon and splash, back-button and status-bar behavior, session persistence, deep links (App Links), the Android implementations of the platform adapters, build and install steps, and an internal testing track on Google Play. The `overload-cross-platform` skill is extended to Android.
- **Defers:** Location, notifications, ongoing-workout surface, health data, and Play Store release.
- **Depends on:** Pitch 18.
- **Definition of done:**
  - The app installs on a real Android phone and through the Play internal testing track, signs in, and completes a full workout.
  - The website and the iOS app behave exactly as before.
  - No native-only control renders in the browser.

### Pitch 25: Gym Location Awareness
- **Type:** Feature
- **Status:** Planned
- **Value delivered:** Overload suggests the right gym on arrival so machine baselines are not polluted.
- **Includes:** Pinned gym coordinates stored on the lifter's own gyms, region-based (geofence) arrival detection on iOS and Android with no continuous tracking, a suggestion that can be overridden, and no silent assignment when detection is uncertain. Coordinates are personal location data, private to the account.
- **Defers:** Always-on location tracking.
- **Depends on:** Pitches 18 and 24.
- **Definition of done:**
  - Arriving at a pinned gym produces a suggestion, not a silent assignment, on both platforms.
  - An uncertain detection never changes the gym without confirmation.
  - No background GPS tracking runs.

### Pitch 26: Native Notifications
- **Type:** Feature
- **Status:** Planned
- **Value delivered:** A few restrained notifications that offer a useful action.
- **Includes:** Today's scheduled workout, a planned mesocycle transition, a useful missed-day reminder, and deep links into today's workout, over Apple's and Google's push services. Each asks whether the lifter can act on it right now. Preferences are per account.
- **Defers:** Engagement nudges, streaks, and motivational or guilt-based reminders.
- **Depends on:** Pitches 18 and 24. Uses Pitch 25 for location-aware messages.
- **Definition of done:**
  - Each notification type can be turned off individually.
  - A tap opens the right place in the app on both platforms.
  - Nothing fires when there is nothing actionable.

### Pitch 27: Active Workout Live Activity
- **Type:** Feature
- **Status:** Planned
- **Value delivered:** An active workout is visible on the lock screen, and on the Dynamic Island on iPhones that have one.
- **Includes:** Workout name, elapsed time, current exercise, current and total sets, and target reps, with a tap that returns to the active workout. It exists only while a workout is active. iOS uses a Live Activity. The pitch decides the Android equivalent, most likely an ongoing notification, or states that it is iOS-only.
- **Defers:** A permanent Home Screen widget.
- **Depends on:** Pitch 18, and Pitch 24 for the Android part.
- **Definition of done:**
  - The surface starts with a workout and ends with it.
  - Its content matches the active workout state.

### Pitch 28: Apple Watch Companion
- **Type:** Feature
- **Status:** Planned
- **Value delivered:** The Watch is useful during a workout without copying the phone app.
- **Includes:** Starting today's workout from the Watch (the same underlying workout as on the phone), showing elapsed time, current exercise, set number, planned set count, rep range, and next exercise, and controls to advance a set, move between exercises, and end the workout. Phone and Watch share one workout state. iOS only: a Wear OS app is not planned.
- **Defers:** Full weight and reps entry on the Watch, to be decided after using the simpler version, and complications and Smart Stack items.
- **Depends on:** Pitches 18 and 27.
- **Definition of done:**
  - Starting on either device never creates a second workout.
  - The Watch shows the same current exercise and set as the phone.

### Pitch 29: App Store Release
- **Type:** Foundational
- **Status:** Planned
- **Value delivered:** Overload is available in the App Store.
- **Includes:** The store listing, privacy details, and review notes; a decision on how paid access works in the app, checked against Apple's guidelines at that time (a link out to the web checkout opened in the external browser on the US storefront, in-app purchase, or sign-in for existing subscribers only); confirmation that the app offers native value beyond a website wrapper; in-app account deletion; and TestFlight feedback addressed. A small group of trusted testers uses TestFlight until release.
- **Defers:** Other storefronts.
- **Depends on:** Pitches 18 and 20, and at least some of Pitches 25 to 28.
- **Definition of done:**
  - The app is approved and released.
  - A paying customer's access works in the app without a purchase path Apple's rules do not allow.

### Pitch 30: Google Play Release
- **Type:** Foundational
- **Status:** Planned
- **Value delivered:** Overload is available on Google Play.
- **Includes:** The store listing, data-safety disclosure, and review notes; the closed-testing requirement Google sets for new personal developer accounts (check the current number of testers and days); a decision on how paid access works in the app, checked against Google's current billing policy (Play Billing, or an alternative the policy allows for the region); and native value beyond a website wrapper.
- **Defers:** Other storefronts.
- **Depends on:** Pitches 20 and 24, and at least some of Pitches 25 to 27.
- **Definition of done:**
  - The app is approved and released.
  - A paying customer's access works in the app without a purchase path Google's policy does not allow.

---

## MVP 6 — Health, Body & Nutrition

### Pitch 31: Body Metrics (HealthKit and Health Connect)
- **Type:** Feature
- **Status:** Planned
- **Value delivered:** Body data syncs from the phone's health platform and can be viewed on web and mobile.
- **Includes:** Body weight, body-fat percentage where available, resting heart rate, and selected workout or cardio information, each with a stated product reason, from HealthKit on iOS and Health Connect on Android. Synced data lives in the backend per account, so the web app can show the history. It is a separate Body domain from training.
- **Defers:** Every other health metric, and any automatic effect on lifting recommendations.
- **Depends on:** Pitches 18 and 24.
- **Definition of done:**
  - Synced metrics appear on web and mobile, scoped to the account that synced them.
  - Body data does not touch any training recommendation.

### Pitch 32+: Nutrition
- **Type:** Feature (several pitches)
- **Status:** Planned, to be split when reached
- **Value delivered:** Calorie and macro tracking as its own domain.
- **Includes:** Likely a foundation (targets, entries, daily totals), then food logging (search, reusable foods, saved meals, servings), then trends (average intake, adherence, relation to body weight).
- **Defers:** Anything that complicates the training workflow.
- **Depends on:** Pitch 31.
- **Definition of done:** Set when the nutrition pitches are shaped.

## Dependency Map

Pitches 1 to 16 are complete. Pitch 17 depends on them and blocks 19, 20, and 23. Pitch 18 depends on 9 and 10 and is sequenced after 17. It blocks 19 (deep links), 20, 24, and every pitch from 25 on. Pitch 19 depends on 17 and 18 and blocks 20, 21, 22, and 23. Pitch 20 depends on 17, 18, and 19. Pitches 21 and 22 depend on 19 and 20. Pitch 23 depends on 17 to 22.

Pitch 24 depends on 18. Pitches 25 and 26 depend on 18 and 24, and 26 uses 25 for location-aware messages. Pitch 27 depends on 18, and on 24 for its Android part. Pitch 28 depends on 18 and 27. Pitch 29 depends on 18 and 20 and at least some of 25 to 28. Pitch 30 depends on 20 and 24 and at least some of 25 to 27. Pitch 31 depends on 18 and 24, and the nutrition pitches depend on 31.

**Rollout gates (not pitches):** public signup stays invite-only until Pitch 19 is verified. No payment is collected until Pitch 23's checklist passes. Public App Store and Google Play releases wait for Pitches 29 and 30.
