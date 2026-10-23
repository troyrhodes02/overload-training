# Overload — PRD / Feature Breakdown

## Overview

Overload is a strength training tracker for individual lifters, each with a private account, offered as a free plan and a paid Pro plan. It began invite-only for a small group of friends and is being opened to the public. Its core job is to tell the lifter, per lift and per session, whether to progress, hold, or deload — based on logged performance against their own self-built plan — so they never have to eyeball their own numbers to make that call. It layers a rule-based progression engine and gym-specific weight tracking on top of a conventional split/session logging structure, and defers everything outside training (nutrition, body composition, social features, auto-generated programming) to later or never.

## Core User Journeys

### Journey: Setting up a mesocycle and split

The lifter starts a new mesocycle by either picking a preset structure (push/pull/legs, Arnold, bro split) or building a custom one. Building custom means creating individual exercise sessions (e.g., "Push Day 1"), populating each with exercises, planned sets, and target rep ranges, then assigning each session to a day of the week. A session can be duplicated and assigned to a second day (e.g., copying "Push Day 1" from Monday onto Thursday) or edited independently after copying. When starting a new mesocycle, the lifter can clone a prior one and edit it forward rather than building from scratch. At creation, the lifter sets the mesocycle's length in weeks and which week is the scheduled deload, pre-filled with a default of a 5-week block with week 5 as the deload, editable per mesocycle.

### Journey: Logging a workout

On opening the app, the dashboard shows the current day's planned session if it hasn't been completed yet — this is the primary focus of the dashboard while a day is pending. Tapping into an exercise opens a full-card view showing all of that exercise's planned sets together, with quick-entry fields for weight and reps per set. Once every exercise in the day is logged, the day is marked complete; the dashboard no longer shows a completed day as "next up" — it moves to an alternate front-facing state (surfacing something like active goal progress) rather than immediately pushing the following day's plan forward. A separate history/week-at-a-glance view remains accessible at any time to review completed and upcoming days. At the end of a logged session, a short summary appears showing a progression chart or percentage-toward-goal view — not a full statistical breakdown.

### Journey: Receiving a progress/hold/deload call

As the lifter logs sets against an exercise's planned rep range, the rule-based engine checks whether they've hit the top of that range for the required number of sets/sessions in a row. If so, the exercise is tagged **progress** on the plan; if performance is falling short of the range consistently, it's tagged **deload**; holding steady produces no tag at all — it appears as a normal, unflagged exercise. Underneath this, every logged set is converted to an estimated 1-rep max (e1RM) and tracked as a rolling trend line per exercise, which powers the progression charts and acts as a secondary stall-detector that can flag a plateau the threshold rule alone might miss.

### Journey: Scheduled deload week

Independently of the reactive engine above, the mesocycle's designated deload week automatically reduces load/intensity across the entire split for that week — this is planned recovery, not a reaction to any single lift stalling. While a scheduled deload week is active, the reactive per-exercise progress/deload check is suppressed entirely, since every lift is already intentionally reduced and a stall flag on top of an intentional deload would be meaningless. The reactive engine resumes normal operation the moment the deload week ends.

### Journey: Handling a missed training day

If a scheduled day passes without being logged, the app notices on next open and prompts the lifter with three options: log it late (they trained but forgot to record it), shift the remaining days of that week forward by one, or skip it outright. A "shift" only affects the current week — the following week snaps back to the split's normal day alignment regardless of how the current week was adjusted.

### Journey: Editing a past log

The lifter can go back and correct a previously logged set's weight or reps. Doing so retroactively re-runs the progress/deload check for that lift using the corrected number, since the original call may have been based on incorrect data. This re-run does not apply retroactively during a period that was a scheduled deload week, since the reactive check is suppressed there regardless of the underlying data.

### Journey: Managing the exercise library and gyms

The lifter can search the exercise library by name or filter by muscle group when assigning exercises to a session. An exercise not in the library can be added manually by name only — it has no image. Editing a custom exercise's name or notes doesn't affect any history already logged against it, since logs reference the exercise rather than a copy of its definition at log time. Deleting an exercise or a gym is soft: it's archived out of future selection lists (won't appear when building new sessions or logging), but all historical logs referencing it remain fully intact and viewable. Gyms are added explicitly through a dedicated flow — name and an optional pinned location — rather than created implicitly by logging at a new place.

### Journey: Gym-specific weight tracking

For machine-based exercises, the working weight is tracked as its own value per gym rather than one global number per exercise, since the same nominal weight on a machine can represent different actual resistance at different gyms. Free-weight and plate-loaded exercises are assumed consistent across gyms and don't need per-gym tracking. If a manual log at a given gym misses that gym's expected weight for an exercise by a noticeable margin, the gym-specific baseline updates rather than a shared global value.

### Journey: Swapping a planned exercise

If an exercise on a given day needs to be swapped (equipment unavailable, machine broken), the lifter can substitute it mid-session. Only other exercises tagged to the same muscle group are offered as swap options — no cross-muscle-group substitution.

### Journey: Logging cardio

Cardio is assigned to specific days as part of the split, the same as a lifting session (e.g., "Tuesday = Pull + 20 min incline walk"). A cardio log records only type and duration — nothing more. No progression analysis, threshold, or trend logic applies to cardio — it's a record only.

### Journey: Setting and tracking a goal

The lifter can set one or more concurrent goals, each tied to a specific lift as a numeric target at a specific rep count (e.g., "bench 315×1" or "squat 225×12"), undated. Progress toward a goal is expressed as a percentage, calculated by converting both the goal and the lifter's current best performance to an estimated 1RM using the same formula that powers the stall-detection trend line, giving a consistent basis regardless of what rep range was actually trained. Multiple goals can be active at once, one per lift. When a goal's progress reaches 100%, the lifter receives a celebration moment; the goal is then archived, with the option to immediately set a new one.

### Journey: Signing up and getting started

A friend receives an invite code and opens the signup page. They enter first name, last name, email, password, and the invite code. There is no email confirmation and no social login. They land in their own empty account and are offered the onboarding tour. If they sent a written workout plan beforehand, it has already been created for them; otherwise they start with the plan builder. They never see any other account's data.

### Journey: Recovering a forgotten password (planned)

Not available today: it was deliberately left out to avoid a third-party email dependency, and is built with Public Accounts. From the login page the lifter asks for a reset, receives an email at their address, follows the link, and sets a new password. The page responds the same way whether or not the email belongs to an account, so it cannot be used to discover who has one.

### Journey: Managing and deleting an account

In Settings the lifter can change their name and delete their account after confirming. Deleting removes that account's data and nothing else's. It is the only action that permanently removes logged history.

### Journey: The dashboard greeting

The dashboard opens with one line using the lifter's first name, chosen from the time of day and their situation: a workout planned and not yet logged, done for the day, a rest day, no plan yet, or a first visit. Each situation has several wordings, such as a late-night variant when a planned workout is still unlogged late in the evening. The line is plain text with no emoji, no chat input, and no persona, and it does not change between wordings while the lifter is looking at it.

### Journey: Taking the onboarding tour

On first sign-in a guided tour walks the real interface: Today, Plan, the logging card, History, Goals, Gyms, and Settings. It can be skipped, it is remembered per account so it does not repeat, and it can be replayed from Settings as a help guide. As features are added, their steps are added to the same tour.

### Journey: Seeing what's new

When an update with a significant visible change ships, a modal on the next load describes it once. A What's New page, reachable from Settings, lists every update by date. A newly created account does not see old updates as unread.

### Journey: Running the product as the owner

The owner opens an admin area that only their account can reach. It lists accounts with name, email, signup date, status, and last-active date, and shows counts: registered accounts, active in the last 7 and 30 days, new this month, accounts that have created a plan or logged a workout, and signup-cohort return rates. The owner can suspend or reactivate an account, delete one, grant or revoke free full access with a reason, and read the feedback inbox. Every action is recorded in an audit log. The owner never sees anyone's plan, gyms, sets, goals, or cardio.

### Journey: Sending feedback

Any lifter can send feedback from within the app, choosing a category. The owner reads it in the inbox and marks it handled.

### Journey: Starting a trial, using Free, and upgrading

A new account starts a 14-day Pro trial with no card. When it ends, the account moves to the Free plan with all of its data intact, and logging continues. Where a Pro feature would appear, a single quiet note says it is part of Pro. The lifter can subscribe at any time through a hosted checkout, enter a promo code, and later manage or cancel the subscription themselves. A lapsed subscription also returns the account to Free.

### Journey: Importing an existing plan

A lifter pastes the plan they already keep in a notes app. Overload proposes a structured plan, matching each exercise to the library, flagging ambiguous matches, and offering custom exercises for the ones it does not know. The lifter reviews and edits everything, and nothing is saved until they confirm.

### Journey: Exporting your data

A lifter can download everything their account holds, on either plan, at any time.

## Feature Inventory

### MVP 1 Features (shipped)

#### Split & Mesocycle Setup
- **What it does:** Preset (PPL, Arnold, bro split) or custom split creation; exercise sessions built and assigned to days, duplicable across days; mesocycle length and deload-week placement configurable with a default of 5 weeks / deload on week 5; cloning a prior mesocycle forward into a new one.
- **Why:** Establishes the plan the entire tracking and progression system operates against — the core job has nothing to measure without it.
- **Acceptance criteria:**
  - A lifter can select a preset split type or build a fully custom one from scratch.
  - A session can be assigned to a day, duplicated onto another day, and edited independently after duplication.
  - Mesocycle length and deload week are set at creation with pre-filled defaults, and both are editable.
  - A new mesocycle can be created by cloning and editing a prior one.
- **Edge cases / failure states:**
  - Starting a mesocycle with no exercises assigned to any day is either blocked or clearly flagged as incomplete before it can go live.
  - Cloning a mesocycle whose referenced exercises have since been archived surfaces those slots as needing attention rather than silently failing.

#### Workout Logging
- **What it does:** Dashboard-first display of the current day's plan when pending; guided per-exercise card logging with all planned sets on one card; progress/deload tags on the plan; a post-session summary with a progression chart or percentage-toward-goal view.
- **Why:** This is the primary daily interaction and the data source every other feature depends on.
- **Acceptance criteria:**
  - The dashboard shows the current day's plan when it has not yet been completed.
  - Tapping an exercise opens a card showing all of its planned sets with editable weight/reps fields.
  - Completing every exercise in a day marks the day complete and changes the dashboard's front-facing state.
  - A summary view appears at the end of a completed session.
- **Edge cases / failure states:**
  - Partially logging a day (some exercises done, others not) and closing the app leaves the day in an incomplete state, resumable later the same day.
  - Logging a set with an empty or zero weight/reps value is handled explicitly (blocked, warned, or accepted as a genuine zero) rather than silently breaking the progression calculation.

#### Progressive Overload Engine
- **What it does:** Rule-based threshold detection against each exercise's planned rep range (hit the top of the range for the required consecutive sets/sessions → progress; consistently fall short → deload), backed by an e1RM rolling trend per exercise used for progression charts and as a secondary stall-detector.
- **Why:** This is the product's core differentiator and the mechanism behind the core job.
- **Acceptance criteria:**
  - An exercise is tagged progress, deload, or left untagged (hold) based on logged performance against its planned rep range.
  - An e1RM trend is calculated and viewable per exercise from logged set history.
  - The reactive check does not fire during a scheduled deload week.
- **Edge cases / failure states:**
  - An exercise with insufficient logged history to evaluate a threshold (e.g., first time performed) does not falsely trigger a progress or deload tag.
  - Editing a past log retroactively re-runs the check for that lift and can change a previously assigned tag.

#### Scheduled Deload
- **What it does:** Automatically reduces load/intensity across the entire split during the mesocycle's designated deload week.
- **Why:** Matches established periodization practice and gives systemic recovery independent of any single lift's performance.
- **Acceptance criteria:**
  - The designated deload week applies reduced load/intensity across all exercises in the split without per-exercise configuration required.
  - The reactive progress/deload engine is suppressed for the duration of the scheduled deload week.
- **Edge cases / failure states:**
  - A missed day that gets shifted into or out of the deload week correctly picks up or drops the deload behavior based on where it actually lands.

#### Exercise Library
- **What it does:** Searchable by name and filterable by muscle group; supports manually-added custom exercises (name only, no image); edits and soft-deletes preserve logged history.
- **Why:** Removes manual entry friction for standard movements while still supporting the lifter's specific exercise selection.
- **Acceptance criteria:**
  - Exercises can be found by name search or muscle group filter when assigning to a session.
  - A manually-added exercise saves and functions identically to a library exercise, minus the image.
  - Deleting an exercise removes it from future selection without altering any historical log referencing it.
- **Edge cases / failure states:**
  - Deleting an exercise still assigned to an active (not-yet-completed) mesocycle day surfaces that day as needing a substitution.

#### Gym Management & Gym-Specific Weight Tracking
- **What it does:** Explicit "add a gym" flow with name and optional pinned location; per-gym, per-exercise weight baselines for machine-based movements; automatic baseline correction when a logged weight at a gym misses the expected value by a noticeable margin; free-weight/plate exercises treated as consistent across gyms.
- **Why:** Addresses the core insight that a machine's nominal weight isn't a fixed, comparable value across locations.
- **Acceptance criteria:**
  - A gym can be added with a name and, optionally, a pinned location.
  - A machine-based exercise maintains an independent weight baseline per gym.
  - A logged weight that deviates meaningfully from a gym's current baseline updates that gym's baseline going forward.
  - Deleting a gym preserves its historical logs while removing it from future selection.
- **Edge cases / failure states:**
  - The first log of an exercise at a new gym has no prior baseline to compare against and establishes the initial baseline rather than triggering a false correction.

#### Missed-Day Handling
- **What it does:** Detects an uncompleted prior day and prompts the lifter to log it late, shift the rest of the week forward, or skip it — a single-tap choice.
- **Why:** Keeps the schedule honest without forcing a rigid, unforgiving structure onto a real training week.
- **Acceptance criteria:**
  - On opening the app after a missed day, the lifter is prompted with the three options.
  - Choosing shift moves the remainder of that week's days forward by one, with the following week returning to the split's normal day alignment.
  - Choosing skip leaves the missed day unlogged and proceeds with the schedule as normal.
- **Edge cases / failure states:**
  - Multiple consecutive missed days are handled without compounding the shift indefinitely beyond the current week.

#### Exercise Swap
- **What it does:** Mid-session substitution of a planned exercise, restricted to other exercises tagged to the same muscle group.
- **Why:** Handles real-world gym constraints (equipment unavailable or broken) without breaking the muscle-group intent of the day.
- **Acceptance criteria:**
  - Swapping an exercise only surfaces same-muscle-group alternatives.
  - A swap applies to that single occurrence without altering the underlying session template unless the lifter explicitly saves it back.
- **Edge cases / failure states:**
  - No other exercises exist in the library for that muscle group, and the swap flow communicates that clearly rather than showing an empty, unexplained list.

#### Cardio Logging
- **What it does:** Cardio sessions assigned to specific split days; logs type and duration only.
- **Why:** Keeps cardio on the record for completeness without pulling it into the strength-progression system it wasn't designed for, and without requiring data (distance, pace, heart rate) this build has no reliable way to capture.
- **Acceptance criteria:**
  - A cardio session can be assigned to a day and logged with a type and duration.
  - No progress/hold/deload tag or e1RM trend is generated for cardio.
- **Edge cases / failure states:**
  - None beyond standard empty-field handling — the feature is intentionally minimal.

#### Goals
- **What it does:** Per-lift numeric goals (weight × reps), undated, with e1RM-based percentage progress; multiple concurrent goals; celebration and archive on completion, with an option to set a new goal immediately.
- **Why:** Gives the lifter a visible long-term target without requiring the app to reason about realistic timelines, which are out of scope for this build.
- **Acceptance criteria:**
  - A goal can be created specifying a lift, target weight, and target rep count.
  - Progress displays as a percentage derived from e1RM comparison between the goal and current performance.
  - Multiple goals can be active at once, one per lift.
  - Reaching 100% triggers a celebration moment and archives the goal.
- **Edge cases / failure states:**
  - Setting a second active goal on a lift that already has one active is either blocked or replaces the existing goal, rather than allowing two ambiguous concurrent goals on the same lift.

### Multi-User Phase Features

#### Account Ownership & Isolation
- **What it does:** Every user-owned object belongs to exactly one account, and every read and write is scoped to the acting account. Library exercises are shared and read-only. Each account has its own timezone, used wherever "today" or a weekday is computed. The existing production data is migrated intact to the original account.
- **Why:** A second person cannot safely exist in the system without it, and a leak between accounts would be invisible.
- **Acceptance criteria:**
  - A second account cannot read, change, or detect the existence of any of the first account's data.
  - After the production migration, the original account's history, plan, gyms, and goals are unchanged and row counts match before and after.
  - Uniqueness rules apply per account, such as one active goal per exercise.
- **Edge cases / failure states:**
  - Requesting another account's record by its id behaves exactly like requesting one that does not exist.
  - Library exercises cannot be edited or archived by any account.
  - The migration can be rehearsed on a copy and rolled back from a backup.

#### Accounts: Signup, Login & Account Settings
- **What it does:** Signup with first name, last name, email, and password, gated by an invite code. Login and logout. Account settings to change the name and to delete the account.
- **Why:** Lets friends join and manage their own account. Password recovery is not part of this feature: it was deliberately left out to avoid a third-party email dependency and is built with Public Accounts.
- **Acceptance criteria:**
  - A new person can sign up with a valid invite code and land in an empty account.
  - Signup without a valid invite code is rejected.
  - Deleting an account removes that account's data and nothing else's.
- **Edge cases / failure states:**
  - Signing up with an email that already has an account fails without revealing more than that.
  - Account deletion cannot be started by anyone but the signed-in owner.

#### Personalization & Navigation Polish
- **What it does:** The dashboard greeting, an appearance setting (light, dark, or follow the system, with system as the default), and on small screens a hamburger that opens the navigation in a sheet instead of a persistent sidebar.
- **Why:** First impressions for new lifters, and more usable screen width on a phone.
- **Acceptance criteria:**
  - The greeting uses the first name and varies by time and situation without changing while on screen.
  - The three appearance options work and persist.
  - On a phone-width screen, selecting a navigation item closes the sheet, and the desktop sidebar is unchanged.
- **Edge cases / failure states:**
  - A lifter with no timezone set yet gets a sensible greeting rather than an error.
  - A greeting for a first visit with no plan does not imply a workout is waiting.

#### Onboarding Tour
- **What it does:** A skippable, replayable guided tour over the real interface, remembered per account, built so that new steps can be added as features ship.
- **Why:** New lifters learn the product without asking anyone.
- **Acceptance criteria:**
  - The tour starts on first login and does not restart once finished or skipped.
  - It can be replayed from Settings.
  - Every step points at a control that exists on the current screen size.
- **Edge cases / failure states:**
  - A step whose target is not on screen is skipped rather than breaking the tour.
  - Adding a step requires no change to the tour mechanism itself.

#### What's New
- **What it does:** Dated release notes kept in the repository, a modal for significant unseen entries, and a What's New page with the full history.
- **Why:** Lifters stay informed about changes without being told individually.
- **Acceptance criteria:**
  - A significant unseen entry appears once and is not shown again after it is dismissed.
  - The page lists every entry in date order.
  - A new account has no unread backlog.
- **Edge cases / failure states:**
  - Two significant entries unseen at once are shown together, not one after another.

### Training Intelligence Features (shipped)

Faster logging (previous-performance context, safe prefill, fewer taps per set), reps-in-reserve logging used by the progression engine, smarter and explainable progression (specific recommendations with the evidence behind them), and exercise history with PR intelligence. Each pitch's spec records what shipped.

### Commercial Launch Features (planned)

#### Admin Center & Feedback
- **What it does:** An owner-only admin area for account lookup and management (suspend, reactivate, delete), aggregate operating metrics, an audit log, and an inbox for in-app feedback.
- **Why:** The owner has to operate the product before opening it.
- **Acceptance criteria:**
  - A non-admin cannot reach any admin page or operation, by URL or by calling a server action directly.
  - Suspending an account blocks it on its next request.
  - Metrics and lists expose no training content.
  - Every admin action appears in the audit log, and a lifter can send feedback the owner can read.
- **Edge cases / failure states:**
  - A non-admin who finds an admin route gets not-found.
  - The admin area never displays a plan, gym, set, goal, or cardio record, and has no impersonation.

#### Public Accounts, Recovery & Support
- **What it does:** A switch from invite-only to public signup, abuse protection, password recovery over email, email verification before a first checkout, data export, account deletion, and a support channel.
- **Why:** Strangers must be able to join safely, recover access without the owner, take their data, and leave.
- **Acceptance criteria:**
  - A forgotten password can be recovered end to end, and the email reaches an external inbox.
  - Public mode lets a stranger sign up, and with it off signup still needs the invite code.
  - An export contains everything the account owns and nothing from any other account.
- **Edge cases / failure states:**
  - A recovery request looks identical for a known and an unknown email.
  - A suspended account cannot sign in.

#### Plans, Billing & Promo Codes
- **What it does:** A Free plan (no ads, ever) and a Pro plan with a 14-day trial and no card, hosted checkout and a customer portal, promo codes such as BLIZZY, and owner-granted free access. Capture, history, and export stay free. Pro adds progression recommendations and their evidence, e1RM trends and stall detection, reps-in-reserve in recommendations, exercise history and PR intelligence, and plan import.
- **Why:** It makes Overload a business without ever holding a lifter's data hostage.
- **Acceptance criteria:**
  - A new account has Pro for 14 days and then Free, with nothing lost.
  - A Free account never receives a Pro result, even by calling a server action directly.
  - Webhooks are authenticated and idempotent, a promo applies for exactly its duration, and no card data is stored.
  - Granting and revoking free access is audited and never shows the account as a paying subscriber.
- **Edge cases / failure states:**
  - A failed payment gets a grace period before the account moves to Free.
  - A replayed webhook changes nothing.

#### Public Landing Page & Changelog
- **What it does:** Public pages for landing, pricing, a creator page that carries a promo code to checkout, support, privacy and terms, and a public changelog built from the same source as What's New.
- **Why:** A viewer of a creator video needs a credible place to land.
- **Acceptance criteria:**
  - The call to action matches the current signup and billing mode.
  - The changelog and What's New show the same entries from one source.
- **Edge cases / failure states:**
  - Screenshots come from a demo account, never from a real lifter.

#### Workout Plan Import & Review
- **What it does:** Paste a plan from a notes app and review a proposed structured plan before anything is saved.
- **Why:** Retyping an existing plan is a major reason to refuse to switch.
- **Acceptance criteria:**
  - A typical plan becomes a correct proposed plan the lifter can edit.
  - Nothing is saved until confirmation, and an abandoned import leaves nothing behind.
  - Pasted text containing instructions is treated as data.
- **Edge cases / failure states:**
  - Usage limits stop a runaway account, and a kill switch stops all imports.
  - It never invents an exercise, set, or load.

#### Mobile Apps (iOS and Android)
- **What it does:** iPhone and Android apps built around the same web product, with native capabilities (haptics, then location, notifications, and more) behind platform-neutral adapters.
- **Why:** Lifters use a phone in the gym, and the apps open the store listings and later native features.
- **Acceptance criteria:**
  - The app installs on a real device, signs in, and completes a full workout.
  - The website behaves exactly as before, and no native-only control renders in the browser.
- **Edge cases / failure states:**
  - A check that needs a device build is reported as unverified when it cannot be run.

### Planned Next, and Not Planned

Planned after the commercial launch: Android and the rest of the mobile experience (gym location, notifications, Live Activity, the Apple Watch app, and the App Store and Google Play releases), then body metrics from the phone's health platform, then nutrition. See the Pitch Roadmap.

Deliberately not planned, so no one adds them: dated goals (a strength deadline can pressure someone to lift past what their readiness supports), a rest timer, ads, AI that generates programs or coaches, cardio progression analysis, a React Native or SwiftUI rewrite of the phone apps, a Wear OS watch app, social login, and any view of another account's training content, including by the owner.

## Data Objects (Product Level)

Every object below belongs to exactly one account, except library exercises, which are shared and read-only.

**Profile** — one per account: first name, last name, timezone, account status (active or suspended), and the date it was last active. Email and password are held by the sign-in system, not here.

**Split / Mesocycle** — the lifter can create, clone, and edit a mesocycle, including its length and deload week placement. A mesocycle contains a set of Sessions assigned to days.

**Session** — a named workout template (e.g., "Push Day 1") the lifter can create, edit, duplicate across days, and reassign. Contains an ordered list of exercises with planned sets and target rep ranges.

**Exercise** — a library or custom-created movement the lifter can search, filter, create, edit, or soft-delete. Tagged with a muscle group; library exercises carry an image, custom ones don't.

**Gym** — a location the lifter can add, name, pin, and soft-delete. Holds per-exercise weight baselines for machine-based movements.

**Logged Session** — a record of a completed (or partially completed) day, created automatically as the lifter logs sets. Contains Logged Sets. Progress/deload tags are computed on read from the sets, never stored.

**Logged Set** — an individual weight/reps entry against a planned set. The lifter can create it during logging and edit it after the fact, which can retroactively affect that exercise's progress/deload tag.

**Goal** — a per-lift numeric target the lifter can create, view progress on, and archive (automatically on completion). Multiple can exist concurrently, one per lift.

**Cardio Log** — a record of a cardio session's type and duration, created by the lifter when logging cardio.

**Tour Progress** — per account: whether the onboarding tour was finished or skipped, and when.

**Release Seen** — per account: the latest release-notes entry the lifter has been shown. The release notes themselves are repository content, not account data.

**Entitlement** — per account: which plan's capabilities it has and why (trial, subscription, or comp), when each began and ends, and for a comp the reason and who granted it.

**Billing Account** — per account: the payment provider's customer reference and a read-only mirror of its subscription state, written only from verified provider events.

**Feedback** — a message a lifter sends the owner: category, text, date, and whether it has been handled.

**Admin Audit Entry** — an append-only record of an admin action: who, what, which account, when.

## Permissions & Ownership

An account can read and change only what it owns, and the shared exercise library is read-only to everyone. There are no roles for lifters. One owner-only admin area exists, and admin identity comes from a server-side allowlist, not from anything an account can be given. The admin area works on account metadata and counts and never shows an account's training content. A plan (Free or Pro) grants capabilities, not permissions: it decides which features an account can use, never what it can see of anyone else. Anything an operator does on someone's behalf, such as creating a friend's plan from a written document, is done by the product's owner directly against the data, naming the target account explicitly, and is not a feature of the application.

## Feature Dependencies

Split & Mesocycle Setup is foundational — Workout Logging, the Progressive Overload Engine, and Scheduled Deload all require a mesocycle and split to exist before they have anything to act on. The Exercise Library must exist before sessions can be built, since sessions reference exercises. Gym Management must exist before Gym-Specific Weight Tracking can attribute a logged weight to a baseline, though the two are natural to build together. The Progressive Overload Engine depends on Workout Logging producing history to evaluate, and Scheduled Deload depends on Split & Mesocycle Setup for its week-placement configuration; the two interact only through the suppression rule and are otherwise independent. Missed-Day Handling depends on Split & Mesocycle Setup's day schedule to know what was missed. Exercise Swap depends on the Exercise Library's muscle-group tagging. Goals depend on the same e1RM calculation used by the Progressive Overload Engine, so that engine should exist first, or at minimum the shared e1RM logic should be built as a common component both features draw from. Cardio Logging has no dependency on the progression system and can be built independently once Split & Mesocycle Setup exists to assign it to a day.

The multi-user features build on each other. Account Ownership & Isolation must exist before Accounts, because signup must never open while data is unscoped, and public signup stays disabled in production until isolation is verified there. Personalization needs the name from Accounts. The Onboarding Tour needs the final navigation from Personalization & Navigation Polish. What's New needs per-account state from Account Ownership & Isolation and Accounts.

The commercial features build on each other. The admin center comes first so the owner can operate the product before opening it, and the iPhone shell follows so the web and mobile architecture is proven before billing and public signup, where they differ most. Public Accounts must exist before Plans, Billing & Promo Codes, which must exist before the Landing Page can offer a subscribe action and before Plan Import can be tied to an entitlement. Public signup stays invite-only until Public Accounts is verified, and no payment is collected until launch readiness passes.
