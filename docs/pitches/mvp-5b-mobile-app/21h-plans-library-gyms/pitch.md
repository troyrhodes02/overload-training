# Pitch 21h — Plans, Library & Gyms

> Source: the approved expansion in Linear, "Pitch 21h — Plans, Library & Gyms" (Overload V1 project document, updated 2026-11-22 UTC). It is copied here unchanged in substance for the pipeline run of 2026-11-22, and it expands `docs/planning/mobile-roadmap.md` → "21h — Plans, Library & Gyms (M)". No local pitch existed before this run, so there was nothing to reconcile.

**Project:** Overload V1
**Parent initiative:** Pitch 21 — Mobile App (React Native + Expo)
**Milestone:** Pitch 21h — Plans, Library & Gyms
**Type:** Feature — Native mobile vertical slice
**Appetite:** M (Medium)
**Priority:** High
**Status:** Ready for design and specification
**Client scope:** Native iOS, using the existing web backend and shared business rules; targeted web parity corrections only
**Plan placement:** Free — plan viewing, exercise library, custom exercises, and gym management
**UI-bearing:** Yes — native plan browsing, library, custom-exercise, and gym surfaces
**Dependency:** Pitches 21a–21g complete

---

## 1. Overview

Pitch 21h brings Overload's existing training-plan structure, exercise library, custom exercises, and gym information into the native iPhone application.

Pitches 21e–21g established the daily training experience. A lifter can start and complete workouts, log and correct sets, adjust exercises, track gym-specific working weights, and receive progression recommendations.

However, the native application still needs a way to explore the training structure surrounding those daily workouts.

A lifter should be able to open Overload on their iPhone and understand:

* Which training block is active.
* Where they are within that block.
* What workouts are planned throughout the week.
* Which exercises belong to each session.
* What set counts and repetition targets are prescribed.
* Which exercises are available in the library.
* Which exercises they have created themselves.
* Which exercises they have marked as favorites.
* Which gyms are associated with their training.

The objective is to make this information discoverable and useful without requiring the lifter to start a workout or navigate to the web application.

**Pitch 21h provides native visibility into the training plan and native access to the exercise and gym resources that support it.**

It deliberately does not recreate the full web plan builder.

---

## 2. Problem

Overload's native app has become capable of handling the actual workout, but training does not begin and end with the current logging screen.

Before arriving at the gym, a lifter may want to see their upcoming sessions, review their split, check the exercises planned for tomorrow, or inspect an unfamiliar exercise.

While training, they may want to find an alternative movement, recognize a favorite exercise, or identify which gym they're using.

When a movement is absent from the standard library, they may need to create a personal exercise.

When training at a new location, they may need to add that gym before logging machine-based movements there.

Without dedicated native surfaces, these activities remain fragmented.

A lifter can access some information through Today, the active logging card, or workout History, but those surfaces are organized around performing workouts rather than browsing the underlying plan and resources.

The web application already contains the broader training structure. Requiring users to open the web for ordinary reference and exercise or gym management weakens the value of the native experience.

At the same time, attempting to reproduce the complete desktop plan builder would introduce substantially more complexity than this slice warrants.

The problem is therefore to provide the useful native reference and management capabilities without importing the entire plan-authoring workflow.

---

## 3. Desired Outcome

After Pitch 21h, a lifter can use their iPhone to explore the structure of their training and manage the personal resources they need for logging.

They can:

* View their active training block.
* Understand the current week and scheduled deload placement.
* Browse the week's planned sessions.
* Inspect an individual session without starting it.
* See ordered exercises, planned sets, and repetition targets.
* Search and browse the shared exercise library.
* Filter exercises using the existing library classifications.
* View exercise details and available images.
* Access and maintain personal exercise favorites.
* View and manage custom exercises.
* View their gyms and add or maintain supported gym information.
* Return to the active workout without losing its state.

All information must agree with the existing web application.

**Success means the iPhone becomes a useful place to understand a training plan and access its supporting resources, while complete plan construction remains on the web.**

---

## 4. Appetite and Scope Discipline

**Appetite: Medium (M)**

The roadmap defines 21h as a Medium slice.

The scope includes three related surfaces:

1. Read-only training-plan navigation.
2. Exercise library and personal exercise resources.
3. Gyms.

These belong together because they support the training context already used by the workout logger.

The backend already contains the relevant domain concepts and much of the necessary business behavior.

The work should concentrate on providing a coherent native experience and the minimum additional secure mobile API capabilities required.

### Scope constraint

This pitch must remain Medium.

The native plan experience is deliberately read-only. Implementing a full plan builder would substantially increase the interaction and correctness burden and must not be quietly absorbed into this pitch.

The exercise and gym management scope should follow existing supported web behavior.

Where there is uncertainty about favorites, custom-exercise editing, gym fields, or archive behavior, the design stage must inspect current functionality rather than invent a new management model.

If the actual scope proves materially larger than Medium, identify the conflict before implementation rather than expanding it silently.

---

## 5. Solution Shape

### 5.1 Active Training Plan Overview

The native application should provide a clear overview of the current active mesocycle.

The lifter should be able to identify the plan they are following without opening Today or beginning a workout.

The overview should communicate the existing plan attributes relevant to understanding the training block.

These include, where available in the authoritative plan:

* Mesocycle name.
* Split type or custom split identity.
* Total planned length.
* Current week.
* Scheduled deload week.
* Current plan status.
* Weekly training structure.

The experience should reflect the existing authoritative schedule and account timezone.

A scheduled-deload week must be identified consistently with the workout's scheduled-deload behavior.

The overview is for orientation, not editing.

Expected behavior:

* The active plan is easy to find.
* The user can tell where they are in the current block.
* Deload placement is understandable.
* A user with no active plan sees an appropriate empty state.
* A user whose active plan has incomplete schedule information sees an accurate explanation rather than fabricated workouts.
* Plan information remains consistent with Today and the web application.

**Boundary:** Creating, cloning, activating, archiving, or structurally editing mesocycles remains part of the web plan builder unless an already-approved native capability explicitly provides otherwise.

### 5.2 Read-Only Week View

The lifter can browse the planned training week on the iPhone.

This view should show the relationship between scheduled days and the sessions assigned to those days.

Expected behavior:

* Training days are shown in the correct order.
* Rest days are distinguishable from training days.
* The current day is identifiable.
* The user can inspect the sessions assigned to a day.
* The view reflects the account's schedule and timezone.
* Scheduled deload information is represented where relevant.
* Existing missed-day and shifted-week behavior remains authoritative.
* Browsing a week does not start, complete, skip, or modify a workout.

Where the web uses a broader calendar or plan layout, the native app can use a compact week presentation.

The important requirement is equivalence of training information, not a pixel-identical layout.

### 5.3 Read-Only Session View

The lifter can open an individual planned session to understand its contents.

This should be possible before the workout is started.

The view should show the existing session details, including:

* Session name.
* Associated day.
* Ordered exercises.
* Planned set counts.
* Target repetitions or ranges.
* Fixed-target prescriptions.
* Bodyweight exercise context.
* Planned cardio, where associated with the day.

The lifter should be able to inspect an exercise from the session and return without losing their place.

Expected behavior:

* The session reflects the authored template.
* Exercise ordering matches the web.
* Fixed repetition targets are represented correctly.
* Planned sets and actual logged sets are not confused.
* Session browsing never creates a workout occurrence.
* Session browsing does not alter the underlying template.
* The view remains usable for longer sessions and exercise names.

The distinction between planned and performed exercises must remain intact.

For example, an exercise swapped during yesterday's workout does not automatically become the planned exercise in the authored session.

### 5.4 Exercise Library Browsing

The native application should expose the existing shared exercise library.

A lifter can browse available exercises independently of starting a workout or opening a swap picker.

Expected behavior:

* The library is searchable.
* Search results identify the correct exercises.
* Existing muscle-group classifications can be used to narrow results.
* Other established filters may be reused where they already exist.
* Shared and custom exercises are distinguishable.
* Exercise names remain readable on small screens.
* Results can be inspected without modifying a plan.
* Empty searches communicate that no matching exercises were found.
* Network or loading failures have appropriate recovery states.

The library must use the same exercise identities and classification data already used by web logging and progression.

Do not introduce a competing native exercise catalog.

### 5.5 Exercise Details and Images

A lifter should be able to inspect an exercise from the library or planned-session context.

Where existing data provides them, exercise details may include:

* Exercise name.
* Muscle group.
* Equipment classification.
* Exercise image.
* Whether the exercise is shared or custom.
* Relevant existing classification information.

Images should use the existing approved library assets.

A missing image must not prevent the user from viewing or using an exercise.

Custom exercises may not have images, consistent with the established data model.

The detail view is for identifying and understanding the exercise.

It is not a new instructional-video library, coaching system, or detailed exercise analytics screen.

### 5.6 Favorite Exercises

The mobile roadmap explicitly includes favorites in 21h.

The lifter should be able to recognize and access their preferred exercises more easily.

Expected capability:

* Recognize exercises marked as favorites.
* Find favorite exercises without repeating a full library search.
* Add or remove favorites where supported by the existing authoritative product behavior.
* Keep favorite status consistent across web and native.
* Avoid affecting other accounts' exercise preferences.
* Preserve the distinction between a favorite exercise and an exercise included in a workout plan.

**Important scope-resolution requirement:** The roadmap explicitly names favorites, but the available upstream PRD detail does not fully define the favorite lifecycle. The design stage must inspect the actual web implementation and approved specifications to determine whether favorites already exist as persistent account data or whether an upstream product decision is missing.

Do not invent a new favorite data model or silently add persistent storage without confirming the approved behavior and repository migration rules.

If favorites require a genuinely new product/data-model decision, surface that gap explicitly.

### 5.7 Custom Exercise Browsing and Creation

The native library should include exercises created by the current account.

A lifter should be able to create a personal exercise when an appropriate movement is not present in the shared library.

The mobile experience should follow the existing web rules for creating custom exercises.

Expected behavior:

* Custom exercises appear alongside the applicable library results.
* Custom exercises are distinguishable from shared exercises.
* Creating a custom exercise uses the existing supported required fields and classifications.
* The user can recognize and reuse the new exercise in appropriate supported workout flows.
* Invalid or duplicate-looking entries are handled according to existing rules.
* Creation does not change shared library records.
* Failed creation does not leave an ambiguous duplicate.
* A custom exercise is visible only to its owner.

Custom exercise creation is an account-owned write and must preserve existing retry, validation, and isolation requirements.

The mobile API must remain compatible with older installed clients.

### 5.8 Custom Exercise Editing and Archiving

The user should be able to maintain their custom exercises according to the existing web lifecycle.

Where currently supported, this may include editing permitted metadata and archiving a custom exercise.

Expected behavior:

* Only account-owned exercises are editable.
* Shared library exercises remain read-only.
* Archived custom exercises are not treated as newly selectable active exercises.
* Historical workouts referencing archived custom exercises remain readable.
* Existing logged performance remains attached to the correct exercise identity.
* Plan references are not silently deleted or rewritten.
* Existing authoritative archive or soft-deletion semantics are preserved.

Do not implement permanent deletion where the shared domain rules require historical preservation.

Do not build a new exercise classification or user-uploaded image system.

### 5.9 Gym List and Details

The native application should provide a place to view the user's existing gyms.

The gym list should support understanding which training locations are available for workout logging.

Expected behavior:

* Existing gyms appear with their saved names.
* Supported gym details are available.
* Archived or unavailable gyms are treated according to existing domain rules.
* Gym selection in the workout logger continues to use the same authoritative gym records.
* A user with no gyms sees a useful empty state.
* The list reflects additions or supported changes made through the web application.

This is a management and reference surface, distinct from the already implemented gym selector in Pitch 21f.

### 5.10 Adding and Maintaining Gyms

The lifter should be able to add and maintain supported gym information from the iPhone, following existing web functionality.

Expected behavior:

* Add a gym with the required name.
* Support existing optional gym fields where available.
* Validate entries using established rules.
* Avoid duplicate creation from an accidental repeated submission.
* Permit supported editing of gym details.
* Preserve historical training records if a gym is archived or removed from future selection.
* Ensure newly added gyms are available in subsequent workout logging.
* Maintain correct separation of machine-specific baselines.
* Prevent one account from changing another account's gyms.

The PRD mentions optional pinned locations, while the Architecture Doc describes the current gym location as free-text and defers location pinning to a later location-aware mobile phase.

**The existing architecture and current released behavior must control this slice.**

Do not introduce maps, geocoding, GPS permissions, or automatic location tracking.

### 5.11 Gym-Specific Baselines and Existing History

Pitch 21f already implemented gym-aware workout logging.

21h must preserve those established rules while giving the user a way to browse and maintain gyms.

Expected behavior:

* Gym records remain the same authoritative records used during logging.
* Adding a gym does not copy machine baselines from another gym.
* A first-time machine log at a new gym follows the existing baseline-establishment rules.
* Free-weight history remains gym-consistent where established.
* Archiving a gym preserves historical exercise and logged-set associations.
* Changing gym metadata does not silently change historical recorded performance.
* The same gym produces consistent context across native and web.

Any existing baseline-management actions exposed on the web must be inventoried.

Do not introduce a new baseline-editing model as a side effect of designing the gym detail screen.

### 5.12 Navigation Between Reference and Logging

The new plan, exercise library, and gym surfaces should integrate with the established native navigation.

The lifter should be able to browse reference information without disrupting an in-progress workout.

Expected behavior:

* Returning from a detail screen preserves the previous browsing context.
* Leaving the workout to inspect an exercise does not lose unsaved input unnecessarily.
* Returning to the workout restores the correct active exercise and session.
* Normal navigation does not start or complete workouts.
* Library browsing does not silently swap a planned exercise.
* Editing a gym or creating a custom exercise does not mutate an unrelated active session.

The design stage should establish intuitive navigation without redesigning the entire app shell.

---

## 6. Cross-Platform Parity Requirement

Overload is one product with web and native interfaces.

Pitch 21h must extend the parity expectations established during 21g.

For every overlapping implemented capability:

* Use the same authoritative data.
* Present equivalent meaningful information.
* Offer equivalent supported actions.
* Preserve existing ownership and validation rules.
* Keep domain terminology consistent.
* Handle comparable empty, error, and success states.
* Reflect changes made from either client.

Platform-specific layout is appropriate.

A web form and a native sheet do not need to look identical.

However, a lifter should not encounter contradictory plan information, exercise classifications, custom-exercise availability, or gym state.

**Intentional exception:** Complete plan creation and editing remain web-only in this pitch.

The native app should not pretend to support full plan editing by exposing partially functional controls.

---

## 7. Plan Placement and Entitlements

Pitch 21h is part of the ordinary training setup and reference experience.

The capabilities in this slice should remain available under the existing Free plan:

* View active plan and schedule.
* View planned sessions.
* Browse and search the exercise library.
* Access supported favorites.
* View and manage personal custom exercises.
* View and manage gyms.

Existing Pro progression and evidence capabilities remain restricted to their established entitlement rules.

A plan or exercise reference screen must not accidentally expose Pro-only progression evidence through a broader response.

Do not introduce:

* New subscriptions.
* New Pro entitlements.
* Upgrade requirements for basic library access.
* Native checkout.
* Pricing links.
* Billing management.

---

## 8. Privacy, Security, and Data Integrity

### Account isolation

Training plans, gyms, custom exercises, favorites, and their associations must belong to the authenticated account.

The shared exercise library remains globally readable through the approved application access path, but it is not editable by ordinary users.

One account must never be able to retrieve or modify another account's private records.

### Exercise identity

The shared library and custom exercises must preserve their existing identities.

Renaming or archiving an account-owned exercise must not corrupt recorded workout history.

### Gym history preservation

Archiving or removing a gym from future selection must not erase its historical logged sessions or stored baseline context.

### Plan integrity

Read-only plan browsing must not create, edit, activate, clone, or archive plans.

The authored session template remains distinct from performed workout occurrences.

### Retry safety

Create operations such as custom-exercise and gym creation must follow the existing idempotency requirements.

Repeated requests must not create accidental duplicate records.

### Version compatibility

New mobile API capabilities must remain backward-compatible with installed versions according to the Architecture Doc and mobile roadmap.

### Existing domain rules

Do not duplicate gym-variable classification, baseline rules, exercise ownership, or plan scheduling logic inside React Native.

Use the authoritative shared/server behavior.

---

## 9. Definition of Done

Pitch 21h is complete when the following outcomes are verified.

### A. Plan overview

* The lifter can open the active plan from the iPhone.
* The plan identity and training-block position are correct.
* Mesocycle duration and scheduled deload placement are represented where applicable.
* The native overview agrees with the web.
* No active plan is handled correctly.

### B. Week and session browsing

* The lifter can browse the week's scheduled training days.
* Rest days are distinguishable from training days.
* A session can be opened without starting a workout.
* Exercises appear in the correct planned order.
* Planned sets and repetition targets match the web.
* Fixed-target and bodyweight prescriptions are represented correctly.
* Planned cardio appears where applicable.
* Browsing does not modify the plan or create logs.

### C. Exercise library

* Library search returns correct available exercises.
* Established filtering works.
* Exercise details show the available authoritative information.
* Exercise images appear when present.
* Missing images are handled gracefully.
* Shared and custom exercises are distinguishable.
* Empty and failed searches are handled appropriately.

### D. Favorites

* The user can access favorite exercises.
* Supported favorite actions work consistently with the authoritative web implementation.
* Favorite state remains account-specific.
* Favorites do not unintentionally modify plans or logged history.
* Any upstream gap in the favorites lifecycle is resolved or explicitly approved before implementation.

### E. Custom exercises

* The user can view their own custom exercises.
* A supported new custom exercise can be created on the phone.
* Existing validation rules are preserved.
* Supported edits work where in scope.
* Archived exercises follow the established historical-preservation rules.
* The user cannot modify shared library exercises.
* The user cannot see another account's private exercises.
* Created exercises appear consistently on the web.

### F. Gyms

* The lifter can view existing gyms.
* Supported gym details are visible.
* A new gym can be added.
* Existing editable gym fields can be maintained.
* Archived gyms follow the established selection and history behavior.
* Newly created gyms become available in logging.
* Gym-specific historical baselines remain correctly isolated.
* Web and native display consistent gym state.

### G. Existing workout functionality

* Today remains correct.
* Workout start and resume remain reliable.
* Exercise swaps and the library picker remain functional.
* Weight, reps, and RIR logging remain intact.
* Gym selection and gym lock remain correct.
* Completion, summary, and History remain consistent.
* Progression recommendations remain server-authoritative.
* No regression occurs in the cross-day unfinished-workout behavior introduced during 21g corrections.

### H. Reliability and accessibility

* Native screens respect safe areas.
* Long names do not make controls inaccessible.
* Keyboard focus behaves correctly.
* Light and dark themes remain usable.
* Large text does not obscure important actions.
* VoiceOver identifies controls and field purposes.
* Loading, empty, error, and unreachable states are usable.
* Backgrounding and reopening the application preserve appropriate navigation and state.

### I. Security and compatibility

* Every new account-owned mobile read and write passes isolation tests.
* Shared library records cannot be modified by an ordinary account.
* Create operations remain safe to retry.
* Historical references survive archive operations.
* Existing mobile API clients remain compatible.
* Free access remains available for the capabilities in this slice.
* Existing Pro data gates remain intact.

### J. Staging and owner acceptance

* Required automated verification passes.
* Relevant web/mobile parity tests pass.
* Mobile API compatibility checks pass.
* Staging deployment succeeds.
* A compatible Expo staging OTA is published through the approved safety-checked process.
* Reproducible `overload-dev` accounts are available for every relevant test scenario.
* The owner completes physical-iPhone acceptance.
* Any discovered defects are fixed and retested.
* The owner explicitly approves Pitch 21h before Production promotion.

**Final acceptance outcome:** The lifter can browse their training structure, find and manage their exercise resources, and manage supported gym information from the iPhone without losing the reliability of the existing workout experience.

---

## 10. Rabbit Holes and Risks

### 10.1 Accidentally building the full plan editor

The PRD includes extensive mesocycle and session editing capabilities. The mobile roadmap deliberately scopes 21h to read-only plan, week, and session views. Implementing plan creation, editing, cloning, or reordering here would turn a Medium slice into a substantially larger project.

**Do not build the complete native plan builder.**

### 10.2 Favorites may have an upstream specification gap

Favorites are explicitly included in the 21h roadmap, but the available PRD material does not establish every favorite behavior. Determine the actual supported web lifecycle before implementation. A new persistent favorite capability may require an approved product/data-model decision.

### 10.3 Custom exercise archival

A custom exercise may be referenced by completed workouts, active plans, gym baselines, and goals. Archiving must not break those historical relationships. Do not treat a custom exercise as an isolated list item that can be permanently deleted without consequences.

### 10.4 Gym baseline integrity

Adding, editing, or archiving gyms must not accidentally merge machine histories across locations. A new gym must not inherit another gym's machine baseline.

### 10.5 Planned versus performed confusion

A read-only session shows the authored template. The logged workout may contain swaps, skipped exercises, extra sets, or changed set counts. The UI must not imply those occurrence-level changes permanently modified the plan.

### 10.6 Navigation and active workout state

The user may inspect the library or gym information during an active workout. Navigation must not discard the active session or cause unsaved entries to appear saved.

### 10.7 Dense plan information

The weekly plan and individual sessions may contain many exercises. The native experience should make the information navigable without reproducing desktop-style dense tables.

### 10.8 Existing web and native discrepancies

Earlier mobile pitches introduced multiple small presentation and interaction improvements. Do not create another wave of feature drift. Inspect the existing parity requirements and reuse authoritative content and actions wherever the surfaces overlap.

### 10.9 Location-scope expansion

The PRD mentions optional pinned gym locations, but the Architecture Doc defers location-aware gym behavior. Do not introduce maps, GPS, geocoding, or location permissions in 21h.

### 10.10 API and account isolation

Every new native management surface introduces additional account-scoped reads and writes. The mobile API must preserve the existing isolation, authorization, versioning, and retry-safety requirements.

---

## 11. Explicit Non-Goals

Pitch 21h does not include:

* Full native mesocycle creation.
* Full native plan editing.
* Preset split selection or custom split construction.
* Session template creation, duplication, or reordering.
* Mesocycle clone-forward.
* Plan import.
* AI-generated workout plans.
* Editing scheduled cardio prescriptions.
* Automatic exercise substitution recommendations.
* New progression formulas.
* Goal creation or management (21i).
* Dedicated exercise History and PR intelligence screens (21i).
* The native exercise-history line chart (21i).
* Account profile and billing settings (21j).
* Account data export (21j).
* Native onboarding tour (21k).
* TestFlight distribution (21l).
* Maps, GPS, automatic gym detection, or geocoding.
* Gym proximity alerts or location notifications.
* User-uploaded exercise images.
* Instructional exercise videos.
* Wearable integration or HealthKit.
* Offline-first library caching or offline logging.
* Android implementation.
* New checkout or subscription surfaces.
* Unrelated web product redesigns.

The existing web plan builder remains the supported place for complete plan creation and editing.

---

## 12. Dependencies

### Completed mobile prerequisites

* **21a — Monorepo Move.** Provides the shared workspace structure.
* **21b — Shared Package & Contracts.** Provides shared types and reusable training rules.
* **21c — Mobile API & Auth Foundation.** Provides authenticated, account-scoped, versioned mobile access.
* **21d — App Shell, Design System & Accounts.** Provides native navigation, authentication, and shared UI states.
* **21e — Workout Loop.** Provides Today, active logging, workout completion, and History.
* **21f — Logging Completeness.** Provides gym selection, exercise swapping, custom workout adjustments, and complete set capture.
* **21g — Insights in the Workout.** Provides native progression guidance, scheduled-deload context, and expanded summary behavior.

### Existing web capabilities

Pitch 21h depends on the established web implementation for Split & Mesocycle Setup, Exercise Library & Custom Exercises, Gym Management & Gym-Specific Weight Tracking, Workout Logging, and Account Ownership & Isolation. These supply the authoritative data and domain rules for the new native surfaces.

### Downstream

* **21i — Goals & Exercise History.** Introduces dedicated native lift-history and goal intelligence.
* **21j — Account & Settings.** Introduces broader account and settings management.
* **21k — Native Tour.** Adds native coach marks.
* **21l — TestFlight Beta.** Handles Production-connected native distribution and external beta review.

---

## 13. Open Questions for Design and Specification

The following questions must be resolved against the current released web behavior, mobile API inventory, Architecture Doc, and approved planning requirements. Record every resolution in the specification's `Resolved Decisions` section.

* **Q1. Native plan navigation.** Where should the new read-only plan, week, and session views live within the established mobile navigation? The decision should preserve quick access to Today, workout logging, and History.
* **Q2. Current-week interpretation.** Should the week view show the authored schedule, the effective schedule after missed-day shifts, or both when they differ? Use the established authoritative scheduling rules.
* **Q3. Archived training blocks.** Should the native read-only plan experience allow browsing archived mesocycles, or only the active block? History already supports earlier workout records; determine the minimum plan-reference scope required by the roadmap.
* **Q4. Planned cardio.** What information from an existing planned-cardio prescription belongs in the read-only session view? Maintain the distinction between a prescription and a logged cardio record.
* **Q5. Exercise library fields and filters.** Which library fields, filter categories, and classifications are actually supported by the existing web implementation? Reuse those rather than creating a new classification system.
* **Q6. Favorites lifecycle.** Does the current web application already support persisted favorites? If so, what are the exact available actions and semantics? If not, does implementing favorites require an amendment to the PRD or data model? Flag any genuinely new persistence requirement for the appropriate approval.
* **Q7. Custom exercise lifecycle.** Which custom exercise fields can currently be created, edited, or archived? How are name collisions, ownership, references, and archived exercise selection handled?
* **Q8. Custom exercise images.** The Architecture Doc states that custom exercises do not have images. Confirm the appropriate native empty-image treatment without creating an upload feature.
* **Q9. Gym management scope.** Which gym attributes and management actions are currently available on the web? Identify the supported scope for native create, edit, and archive without introducing location-aware features.
* **Q10. Gym archive and historical context.** How should archived gyms appear when referenced by History, older plans, or past workouts? Preserve authoritative historical associations.
* **Q11. Baseline management.** Does the existing web gym-management experience include direct baseline review or correction controls, or are baselines maintained exclusively through logging behavior? Do not introduce new baseline-editing capabilities without evidence of the existing rule.
* **Q12. Library usage during a workout.** How should a user move from an active workout into the library and back without losing context or accidentally invoking a swap? Keep intentional workout actions separate from passive browsing.
* **Q13. Mobile API coverage.** Which plan, exercise, favorite, custom-exercise, and gym reads/writes already exist in the versioned mobile API? Which capabilities require minimal additive, backward-compatible access? Follow the Architecture Doc rather than defining a separate native data layer.
* **Q14. Free and Pro access.** Confirm that the ordinary reference and management actions in this pitch remain Free. Identify any Pro-derived fields that must be excluded from library or plan responses.
* **Q15. Existing implementation overlap.** Which 21h requirements were already partially implemented through 21e–21g, particularly gym selection, exercise search for swaps, and scheduled plan information? Reuse those capabilities rather than building competing versions.
* **Q16. Scope versus Medium appetite.** After examining the current web implementation, do custom-exercise and gym-management operations fit the Medium appetite alongside the three read-only plan views? If not, identify the precise boundary problem rather than silently expanding into a Large plan editor.
* **Q17. Owner approval boundaries.** Would any proposed implementation require a destructive historical operation, new persistent favorite model, unapproved Production migration, location-permission expansion, or material product-boundary change? If so, request the appropriate owner approval rather than making the decision silently.

---

## 14. Acceptance Testing Strategy

The design and specification stages must produce reproducible `overload-dev` test scenarios for physical-iPhone acceptance. Use the established development-only test-account tooling introduced during 21f and extended during 21g. Do not create identical generic accounts and label them as different scenarios.

The owner should be able to verify the following.

* **Scenario A — Active plan.** An account with an active mesocycle and a complete weekly schedule. Verify plan identity, week number, deload placement, assigned days, and session ordering.
* **Scenario B — No active plan.** An account with no active mesocycle. Verify the empty state explains the condition without inventing a plan.
* **Scenario C — Rest days and deload.** An account with scheduled rest days and a valid deload-week state. Verify the displayed schedule agrees with Today.
* **Scenario D — Detailed session.** An account with multiple planned exercises, fixed targets, bodyweight movements, and planned cardio. Verify all plan values match the web.
* **Scenario E — Shared exercise library.** Search for several known exercises. Verify names, muscle groups, equipment classifications, and available images.
* **Scenario F — Favorites.** Use exercises with known favorite state. Verify favorite browsing and supported state changes across web and native.
* **Scenario G — Custom exercise creation.** Create a disposable personal exercise on the iPhone. Verify it appears on the web, remains account-owned, and becomes available through supported selection flows.
* **Scenario H — Custom exercise edit and archive.** Use an account with a custom exercise referenced by an existing workout. Verify supported metadata changes and archive behavior preserve historical records.
* **Scenario I — Gym management.** Use an account with multiple gyms. Create an additional gym, verify it appears on the web and in subsequent logging selection, and test supported editing.
* **Scenario J — Gym archive with history.** Use a gym referenced by existing historical logged sets. Verify archive behavior does not destroy History or misattribute baseline context.
* **Scenario K — Cross-account isolation.** Use two different accounts with distinct custom exercises, favorites, and gyms. Verify no private resources are accessible across accounts.
* **Scenario L — Existing workout regression.** Start or resume an existing workout, inspect the exercise library, navigate back, and verify all saved and unsaved states remain correct.
* **Scenario M — Accessibility and reliability.** Verify light/dark appearance, larger text, VoiceOver, slow-network behavior, failed requests, retry safety, and foreground/background transitions.

The owner must be able to repeat cases without manually reconstructing database records. Any fixture creation must remain explicitly guarded to overload-dev.

---

## 15. Delivery and Release Gates

Pitch 21h follows the established Overload pipeline:

**Pitch → Design Document → Native UI Design → Specification → Linear Tickets → Implementation → Review → Staging → Physical-iPhone Acceptance → Separate Production Promotion**

* **Design.** Produce a native information architecture for plan browsing, library browsing, favorites, custom exercises, and gyms. Use `/overload-design-doc`, `/overload-mobile-ui`, and the existing mobile design system. This is a mobile-only slice, so the separate web-style UI preview gate follows the mobile pipeline's documented exception.
* **Specification.** Define all necessary user flows, validated operations, API contracts, ownership checks, error states, and compatibility requirements. Resolve the open questions against authoritative upstream sources.
* **Implementation.** Build the complete vertical capabilities from the latest staging baseline. Reuse existing shared business rules and account-scoped services. Keep the work within the approved Medium scope.
* **Verification.** Run the required web and mobile suites. Every new account-owned endpoint must pass the account-isolation and authorization checks. Every create operation must meet the existing idempotency requirements. Historical archive behavior requires integrity regression coverage.
* **Staging.** Merge reviewed work into staging through the canonical process. Publish a compatible Expo staging OTA using the approved safety-checked publisher. Do not bypass runtime or environment guards.
* **Physical-iPhone acceptance.** The owner verifies the read-only plan experience, shared exercise library, favorites, custom exercises, and gym management against realistic development accounts. Relevant web/mobile parity checks are required. Any device-specific defects are corrected and retested before acceptance.
* **Production promotion.** Production promotion requires separate owner authorization after staging acceptance. The production release must follow the isolated release-branch workflow, required checks, PR, deployment verification, and main-to-staging synchronization. No Production Expo OTA or TestFlight release is implied by completion of 21h.

---

## 16. Final Success Statement

Pitch 21h succeeds when the lifter can use Overload's native iPhone application to understand their training structure and access the exercise and gym resources needed to support it.

The lifter can see their active training block, browse the planned week, inspect individual sessions, search exercises, work with favorites, create and maintain supported custom exercises, and manage their gyms.

The same account sees equivalent authoritative information on the web and iPhone.

Existing workout logging, History, progression intelligence, and gym-specific baselines remain correct.

The experience stays native, understandable, and consistent with the established design system.

**21e delivered the workout. 21f completed logging. 21g delivered progression intelligence. 21h gives the lifter the training structure and personal resources surrounding those workouts—without turning the iPhone into a full plan-building application.**
