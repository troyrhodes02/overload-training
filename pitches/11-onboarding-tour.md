# Overload — Pitch 11: Onboarding Tour

> Verbatim copy of the Linear document "Overload — Pitch 11: Onboarding Tour" (project Overload V1, doc `a4dd8ae6-8faf-4407-8f56-5ab2331e4e3b`, last updated 2026-10-20). Pulled by the autonomous pipeline run on 2026-10-20. Linear is the source; this file is the repository copy the design doc, preview, and spec trace to.

**Type:** Feature
**Status:** Planned
**Appetite:** M — Medium
**Depends on:** Accounts: Signup, Login & Password Reset; Personalization & Navigation Polish
**PRD feature:** Onboarding Tour
**UI-bearing:** Yes

---

## 1. Problem

Overload is transitioning from a single-user strength-training application into an invite-only product used by a small group of friends.

The application already provides its core capabilities: building a training plan, logging workouts, tracking exercise history, managing gyms, setting strength goals, and receiving progressive-overload recommendations.

However, having those capabilities available does not mean a new lifter immediately understands where to find them or how they fit together.

The original user built the application and already understands its structure. Newly invited friends do not have that knowledge.

A new lifter may reasonably wonder:

- Where do I see today's workout?
- How do I create or manage my training plan?
- Where do I enter weights and reps?
- How do I review previous workouts?
- Where are my strength goals?
- Why does the application ask which gym I'm training at?
- Where do I change my account settings?

Without guidance, the product owner may need to explain these features individually to every new friend.

That creates unnecessary friction during the first experience and makes new users dependent on someone else to learn the application.

Overload does not need a large tutorial system, an AI assistant, or persistent instructional clutter to solve this problem.

It needs a brief, structured introduction that explains the existing interface, can be skipped, and remains available when someone needs a refresher.

This pitch delivers that introduction.

## 2. Appetite

**M — Medium**

The feature has one primary user-facing capability: an interactive tour of the existing Overload interface.

Its complexity comes from several interacting requirements:

- Recognizing when an eligible account should receive the tour.
- Presenting guidance against real interface elements.
- Moving between multiple application destinations.
- Supporting different mobile and desktop layouts.
- Handling elements that may not exist for an account with no training data.
- Remembering completion or dismissal separately for each account.
- Allowing the same tour to be replayed.
- Making future tour steps extensible without rebuilding the mechanism.

These are meaningful integration concerns, but they do not require a new training domain or a broad application redesign.

The appetite remains medium by limiting the feature to one guided tour and its associated progress state.

Do not expand the pitch into a general-purpose documentation platform, a contextual-help framework across every screen, or a series of separate onboarding experiences.

This should ship as one coherent vertical capability, including the necessary interface, state, persistence, and verification.

---

## 3. Value delivered

A newly invited lifter can enter Overload and quickly understand what its primary areas are for.

The tour highlights the real application interface instead of presenting an abstract slideshow disconnected from the product.

The lifter can proceed through the introduction, skip it, or revisit it later from Settings.

Once the tour has been completed or skipped, it does not interrupt future visits.

The product owner no longer needs to give every new friend the same explanation of the application's basic navigation and training workflow.

The tour also establishes a reusable foundation for introducing important features added in later pitches.

---

## 4. Solution shape

### 4.1 First-login guided tour

When an eligible new account first signs in, Overload automatically offers the guided tour.

The tour introduces the application's major areas in a clear sequence, using the actual interface the lifter will use afterward.

Each step identifies a meaningful existing interface element and explains its purpose in concise language.

The tour should feel like a short orientation to the application, not a required lesson.

The user should be able to understand what is being highlighted and how to continue or dismiss the tour.

The tour must not require the lifter to create a workout plan, log a set, establish a goal, or perform another permanent action merely to progress.

Its purpose is explanation.

### 4.2 Tour coverage

The initial tour covers seven areas identified by the PRD and Pitch Roadmap.

#### Today

Introduce the dashboard as the main place to see the current day's training.

Explain that a scheduled workout appears here when one is pending.

The guidance should remain meaningful for a new account with no active training plan.

Do not imply that a workout exists when the account is empty.

#### Plan

Introduce the area where lifters create and manage their training structure.

Explain that Overload works from a plan the lifter creates or already has.

The tour should communicate the purpose of the Plan area without walking through every mesocycle field, exercise picker, scheduling control, or deload configuration.

It should not generate a training plan for the lifter.

#### Workout logging card

Introduce the exercise logging interface used to record performed sets.

Explain its basic role in recording weights and reps so Overload can evaluate progression.

The tour must not require a real logged set or invent training history merely to display an exercise card.

Because an account may have no plan or active workout, the design stage must handle situations where the normal logging card is not available.

#### History

Introduce the area for reviewing previously logged workouts and training activity.

Explain that past sessions remain accessible.

For an empty account, the tour should remain understandable without pretending that history already exists.

#### Goals

Introduce the strength-goal area.

Explain that lifters can set exercise-specific strength targets and follow their progress over time.

The tour should not create a sample goal or introduce new goal behavior.

#### Gyms

Introduce the gym-management area.

Explain that Overload can track relevant machine and cable working weights separately across gyms.

The explanation should be concise and appropriate for onboarding.

It should not attempt to teach the full baseline-correction algorithm.

#### Settings

Introduce the area for managing account information and preferences.

Also establish that the guided tour can be launched again from Settings later.

This is the persistent entry point for replaying the tour.

### 4.3 Guided interaction

The tour uses real interface elements as its points of reference.

Each step should make it clear which part of the application is being described.

The tour progresses in an intentional order that helps a new lifter form a basic mental model of Overload.

The interface should provide an obvious way to continue and a clearly available way to skip.

Because the tour covers several application destinations, its navigation behavior must be coordinated with the existing application navigation.

The design stage should determine the exact sequence, presentation, controls, and transitions using Overload's established visual system.

The tour is not a separate copy of the application.

### 4.4 Completion and dismissal

A lifter can finish the tour by reaching its final step.

They can also skip it before reaching the end.

Both outcomes are remembered for that account.

Once the tour has been completed or skipped, it must not automatically launch again on subsequent sign-ins.

A skipped tour is not treated as unfinished work that must be forced on the lifter later.

The persistent state belongs to the account rather than only to the current browser session.

Tour progress must remain isolated between accounts.

### 4.5 Replay from Settings

An authenticated lifter can manually replay the onboarding tour from Settings.

This is available whether they previously completed or skipped the introduction.

Replay uses the same maintained tour rather than a second, separately implemented help experience.

Manually replaying the tour must not cause it to begin appearing automatically on future sign-ins.

The Settings entry point should be clearly recognizable as a way to revisit the application's guidance.

The design stage determines its exact placement and wording.

### 4.6 Existing accounts at rollout

Accounts that already existed before Onboarding Tour ships should not suddenly receive the automatic first-login tour.

The project's established standing decision is to treat those accounts as already offered onboarding.

They can still launch the tour manually from Settings.

This prevents the original lifter and any other existing users from unexpectedly encountering a first-time experience after an application update.

New accounts created after the feature becomes available are eligible for automatic onboarding.

### 4.7 Mobile and desktop behavior

The tour must operate across the application's existing responsive layouts.

On desktop, the application uses its established sidebar navigation.

On phone-width screens, Personalization & Navigation Polish replaces the persistent sidebar with a hamburger-triggered navigation sheet.

The tour must account for that difference.

A tour step must not point at a desktop-only navigation element when the lifter is on a phone.

Likewise, it must not assume the mobile navigation control exists in the desktop layout.

Guidance must reference controls that are actually available and visible at the current screen size.

Where a step's target is unavailable, the tour should skip that step gracefully rather than breaking the experience.

The design stage should determine how navigation sheets, page transitions, highlighting, and dismissal work together.

This pitch does not redesign the application's navigation.

### 4.8 Extensible tour steps

The initial tour is not intended to be rewritten every time Overload adds a feature.

Tour steps must be maintained through a registry so future pitches can extend the tour by adding step definitions rather than modifying the tour mechanism.

The registry should make it possible to introduce future guidance while preserving the same behavior for launching, navigating, completing, skipping, and replaying the tour.

The project's `overload-onboarding` skill will guide future changes to the registry.

The exact data representation and location belong to the downstream spec.

No new standalone content-management system is required.

### 4.9 Existing design system

The tour should use Overload's established Tailwind and shadcn/ui system.

The project's standing resolution is to build on existing shadcn/ui primitives rather than introducing an additional third-party guided-tour library.

This does not prescribe the exact UI components or their composition.

Those choices belong to `/overload-design-doc`, `/overload-ui-design`, and `/overload-spec`.

The result should feel native to Overload rather than like a separately styled tutorial product.

---

## 5. Primary user journeys

### Journey A — A newly invited lifter signs in

1. The lifter enters their account for the first time.
2. Overload recognizes that the account is eligible for onboarding.
3. The guided tour begins.
4. The lifter is introduced to the primary application areas.
5. They advance through the guidance.
6. They reach the end of the tour.
7. Completion is remembered for their account.
8. They continue using Overload normally.

On their next sign-in, the tour does not automatically restart.

### Journey B — A lifter skips the tour

1. The lifter signs in and sees the tour.
2. They decide not to continue.
3. They activate the skip action.
4. The tour closes.
5. Their decision is remembered.
6. The application returns to normal use.

The tour does not restart automatically on their next visit.

They retain the option to launch it later from Settings.

### Journey C — A lifter replays the tour

1. The lifter opens Settings.
2. They find the tour or help-guide action.
3. They select it.
4. The guided tour launches.
5. They review the application's areas.
6. They finish or dismiss the replay.
7. Overload returns to normal use.

The existing completion or skip state remains consistent with the rule that automatic onboarding should not be repeated.

### Journey D — A new lifter has no training plan

1. The lifter creates an account.
2. The account contains no active plan or logged workout history.
3. The tour introduces Today and Plan normally.
4. Areas with no available contextual interface element are handled gracefully.
5. The tour continues without creating artificial training data.
6. The lifter finishes or skips onboarding.

The tour must not fail merely because the new account is empty.

### Journey E — A lifter takes the tour on a phone

1. The lifter opens Overload on a phone-width screen.
2. The tour begins.
3. Guidance uses navigation elements available in the mobile layout.
4. The relevant interface elements remain visible and understandable.
5. The lifter advances or dismisses the tour.
6. Normal navigation remains usable afterward.

The tour must not depend on the desktop sidebar being visible.

### Journey F — An existing account visits after rollout

1. An account that predates the onboarding feature signs in.
2. Overload does not automatically launch the tour.
3. The lifter continues using the application normally.
4. They may visit Settings and choose to replay the introduction.

The release of onboarding does not unexpectedly interrupt existing users.

---

## 6. In scope

This pitch includes the PRD feature **Onboarding Tour**, covering:

- Automatic first-login onboarding for eligible new accounts.
- A guided introduction to Today, Plan, workout logging, History, Goals, Gyms, and Settings.
- Interaction with the real application interface.
- Forward progression through tour steps.
- An explicit skip option.
- Per-account completion and skip persistence.
- Replay from Settings.
- Responsive behavior across mobile and desktop.
- Graceful handling of unavailable tour targets.
- An extensible, data-driven step registry.
- The initial set of tour steps necessary to introduce the existing application.

The feature is delivered end to end, including the interface, necessary persistence, and integration with the existing account experience.

---

## 7. Out of scope

### Video onboarding

No instructional videos, recorded demonstrations, narrated walkthroughs, or video-hosting integration.

### Tooltips on every control

The tour highlights selected important areas.

It does not add explanatory tooltips to every button, field, card, or action in the application.

### Contextual guidance outside the tour

No persistent help bubbles, proactive instructional prompts, or automatic guidance triggered throughout normal application usage.

### Separate tutorials for each feature

Do not create independent onboarding flows for Plan, Goals, Gyms, logging, or other application areas.

They belong to one maintained tour.

### Interactive training exercises

The lifter is not required to create a mesocycle, log a set, establish a gym baseline, or set a goal to complete onboarding.

### Sample or fabricated data

Do not seed fake workouts, plans, goals, or training history simply to make tour elements available.

### AI or conversational onboarding

No chatbot, conversational assistant, generated tutorials, or personalized coaching dialogue.

### Navigation redesign

Do not modify the desktop sidebar or mobile navigation architecture already established by Personalization & Navigation Polish.

### General Settings redesign

Only the Settings changes required to make tour replay accessible are included.

### What's New

Do not build the release-notes modal, update history page, or release-seen tracking.

Those belong to the next pitch, What's New.

### External services

No third-party tour service, analytics platform, email provider, scheduling infrastructure, or content-management system.

---

## 8. Definition of done

The formal acceptance criteria below trace to the PRD feature **Onboarding Tour**.

### AC-1 — First-login behavior

The tour starts on first login for an eligible new account.

After the lifter finishes or skips it, the tour does not automatically restart.

Completion or dismissal is remembered for the account.

**PRD trace:** Onboarding Tour — Acceptance criterion 1.

### AC-2 — Replay from Settings

The lifter can launch the tour again from Settings at any time.

A prior completion or skip does not prevent manual replay.

**PRD trace:** Onboarding Tour — Acceptance criterion 2.

### AC-3 — Responsive target availability

Every tour step points at a control that exists on the current screen size.

When a step's intended target is not available, that step is skipped rather than breaking the tour.

The behavior must work across phone and desktop layouts.

**PRD trace:** Onboarding Tour — Acceptance criterion 3 and the related missing-target edge case.

### AC-4 — Extensible step registry

The tour's mechanism can accommodate new steps by adding data definitions instead of modifying the core tour behavior.

**Traceability note:** This criterion is explicit in the Pitch Roadmap's definition of done and in the PRD's edge-case requirements, but is not separately enumerated under the PRD's acceptance-criteria list.

It remains a binding roadmap requirement and should be added to the PRD acceptance criteria for complete traceability.

### PRD-defined edge cases

The design/spec must also address:

**Unavailable target**

A step whose target is not present on the current screen is skipped gracefully.

**Future extension**

Adding a new step does not require changing the core tour mechanism.

**PRD trace:** Onboarding Tour — Edge cases / failure states.

### Additional rollout behavior

Accounts existing before the tour ships are treated as already offered onboarding and are not automatically interrupted.

This is a project standing resolution rather than a separately enumerated PRD acceptance criterion.

It should be preserved and recorded as the governing rollout behavior.

---

## 9. Rabbit holes

### 9.1 Building a general-purpose tutorial platform

It may seem useful to support multiple independent tours, contextual help rules, user segmentation, and arbitrary page tutorials.

That would turn a bounded onboarding feature into a larger guidance system.

Overload needs one maintained guided tour, not a tutorial product.

### 9.2 Introducing a third-party tour library

A dedicated tour library may appear to simplify highlighting and positioning.

However, the project has an explicit standing direction to use its existing shadcn/ui primitives.

The design/spec should work within the approved component system rather than adding a new dependency merely for convenience.

### 9.3 Hardcoding steps into the tour mechanism

It may be simpler initially to embed the seven steps directly into the component that runs the tour.

That would undermine the stated requirement that future pitches add steps without modifying the tour mechanism itself.

The initial implementation must establish the registry rather than defer extensibility.

### 9.4 Assuming every account has training data

A new lifter may have no mesocycle, logged workout, gym, goal, or history.

The tour must not require those objects to exist.

Graceful omission of unavailable targets is preferable to manufacturing sample data or forcing setup during the tour.

### 9.5 Anchoring guidance to the wrong responsive layout

The existing sidebar is not available in the same form on mobile.

A tour implemented only against the desktop interface could point to hidden controls or become unusable on a phone.

Both layouts must be considered from the beginning.

### 9.6 Forcing a skipped tour to reappear

A skip is an intentional user decision.

Automatically restarting the tour because the user did not complete every step would violate the PRD and make onboarding intrusive.

Skipped and completed states both suppress future automatic launches.

### 9.7 Automatically onboarding existing accounts

The original account and any other accounts created before this feature are not new to Overload merely because the tour is new.

Automatically displaying onboarding after deployment would interrupt established users.

Preserve the standing rule that those accounts can replay the tour manually but do not receive it automatically.

### 9.8 Duplicating the application interface

The tour must point at real interface elements.

Creating separate screenshots or reconstructed versions of the application would make onboarding less reliable as the product evolves.

Keep the tour connected to the actual navigation and available screens.

### 9.9 Expanding explanations into full training education

It may be tempting to use the tour to explain periodization, e1RM formulas, deload decisions, gym baseline thresholds, and every planning option.

Those topics are broader than the initial orientation.

Tour content should explain where things are and why major areas exist without overwhelming the lifter.

### 9.10 Starting the release-notes system early

The upcoming What's New pitch will establish how visible feature changes are communicated.

This tour should be ready for future additions but should not independently implement the release-note system or a second guidance registry.

---

## 10. No-gos

- No third-party tour library.
- No hardcoded tour sequence that requires changing the tour mechanism to add steps.
- No tour targets that are unavailable at the active screen width without graceful handling.
- No fabricated plans, workouts, goals, or history to support the tour.
- No forced training actions during onboarding.
- No automatic tour restart after completion.
- No automatic tour restart after skipping.
- No automatic first-run tour for accounts that existed before rollout.
- No videos, narration, or separate tutorial pages.
- No contextual tooltips throughout the application.
- No AI assistant or conversational onboarding.
- No navigation redesign.
- No training-engine changes.
- No authentication redesign.
- No third-party email-service integration.
- No What's New implementation.
- No cross-account visibility or shared onboarding state.

---

## 11. Dependencies

### Accounts: Signup, Login & Password Reset

The tour must identify the authenticated account and store the tour's state against that account.

It depends on the account lifecycle established by Accounts.

The tour does not depend on password-reset email delivery or any removed third-party email integration.

### Personalization & Navigation Polish

The tour depends on the established responsive navigation.

On phone-width screens, the application uses a hamburger-triggered navigation sheet rather than the persistent desktop sidebar.

That behavior must be stable before the tour anchors its guidance to those controls.

### Account Ownership & Isolation

The tour inherits the account-isolation foundation.

Each account's completion or skip state is private.

One account cannot read, modify, or infer another account's tour state.

### Existing application areas

The tour introduces the currently implemented Today, Plan, logging, History, Goals, Gyms, and Settings experiences.

It depends on those areas existing but must handle the absence of account-specific content inside them.

### Future dependency: What's New

What's New follows this pitch in the roadmap.

Once both features exist, future visible-feature pitches use the `overload-onboarding` skill to maintain appropriate tour steps and release-note entries.

This pitch establishes the tour's extensible foundation.

---

## 12. Risks and verification focus

### First-login eligibility

The application must correctly distinguish accounts eligible for automatic onboarding from accounts that should not be interrupted.

This includes new accounts, previously completed accounts, previously skipped accounts, and accounts that existed before rollout.

### Per-account persistence

Tour progress must remain associated with the correct account across sign-ins and ordinary browser sessions.

A completion recorded for one lifter must not influence another.

### Responsive target correctness

The tour must never depend on controls that are absent at the active screen size.

Phone and desktop behavior both require verification.

### Empty-account behavior

New users may not have any workouts or history.

The tour must remain functional without inventing data or requiring setup.

### Navigation coordination

Guidance that spans several application destinations must not leave the navigation sheet stuck open, leave an unusable overlay, or prevent the lifter from returning to the application.

### Extensibility

Adding a future tour step should be a registry change rather than a change to the tour's underlying mechanism.

The downstream spec should define how this requirement is demonstrated.

### Existing product behavior

The onboarding experience must not change workout logging, progression decisions, mesocycle state, historical records, or goal behavior.

The tour introduces those areas but does not operate on their training data.

---

## 13. Open questions and source gaps

### Settled by project standing decisions

The pipeline guide already establishes two decisions for this feature.

**Existing accounts**

Accounts that exist before Onboarding Tour ships are treated as already offered onboarding. They are not automatically toured, but can replay the guide from Settings.

**Tour mechanism**

Use the existing shadcn/ui primitives instead of adding a third-party tour library.

These are settled directions, not open implementation options.

### Design-stage questions

The exact order and wording of individual steps, highlighting behavior, positioning, progression controls, transitions between pages, and phone/desktop presentation belong to `/overload-design-doc` and `/overload-ui-design`.

The pitch fixes which areas must be covered and what the tour must accomplish without prescribing the component hierarchy.

### Spec-stage questions

The exact registry structure, tour-state persistence mechanism, handling of unavailable targets, and navigation coordination belong to `/overload-spec`.

The spec should use the architecture and existing repository conventions.

### PRD traceability gap

The roadmap explicitly requires adding future steps through data definitions alone.

The PRD describes the same behavior as an edge case but does not separately enumerate it as a formal acceptance criterion.

**Required upstream amendment:** Add the data-only extensibility requirement to the Onboarding Tour acceptance criteria.

### Source consistency

The supplied roadmap, PRD, Architecture Doc, and pipeline guide agree on the core tour behavior.

No material contradiction requires a product-level scope change.

The earlier removal of third-party email services from Accounts does not change this pitch's requirements.

---

## 14. Rollout and delivery boundary

This is a UI-bearing pitch.

The required artifact sequence is:

**Pitch → Design Doc → UI Preview → Spec → Linear Tickets → Implementation**

### Design doc

`/overload-design-doc` should define the tour's user flows, interaction model, states, responsive behavior, missing-target handling, and Settings replay experience.

### UI preview

`/overload-ui-design` should create an implementation-grade preview of the guided tour using Overload's existing design system.

It should cover representative desktop and mobile tour states, including empty-account scenarios and the replay entry point.

The preview becomes the binding visual contract for the spec and implementation.

### Spec

`/overload-spec` should define the exact data persistence, registry, account-scoped behavior, integration with navigation, error handling, and verification.

### Ticket implementation

`/overload-ticket-worker` should deliver the full guided-tour capability through the approved design and spec.

It should not independently redesign the interface or introduce another tour mechanism.

### Merge behavior

The project's pipeline guide identifies Onboarding Tour as **merge on green** by default.

This feature adds account-specific tour progress and UI behavior but should not alter existing logged training data, authentication, account-isolation architecture, or other protected systems.

If implementation unexpectedly crosses a protected boundary, the autonomous pipeline must follow the established stop conditions and merge rules.

Production migrations remain human-operated.

### Guidance-ticket convention

The ongoing guidance-ticket requirement begins once both Onboarding Tour and What's New have shipped.

This pitch creates the tour infrastructure. It does not need to create a separate guidance ticket to update a mechanism that is being built for the first time.

---

## 15. Handoff to design and spec

The next stages should treat these outcomes as fixed:

1. Eligible new accounts receive a guided tour on first login.
2. The tour introduces Today, Plan, logging, History, Goals, Gyms, and Settings.
3. Guidance references the real application interface.
4. The tour works on both mobile and desktop.
5. Missing interface targets do not break the tour.
6. The lifter can skip the tour.
7. A completed or skipped tour never restarts automatically.
8. The tour can be replayed from Settings.
9. Accounts existing before rollout are not automatically toured.
10. Future steps can be added through the registry without changing the tour mechanism.
11. The tour uses the established Overload design system and does not require a new third-party tour library.
12. No training data is created, modified, or deleted as part of onboarding.
13. No What's New, email-service, or unrelated account functionality is introduced.

The design stage determines the visual and interaction experience.

The spec stage determines the technical implementation.

The pitch's responsibility is to preserve these product behaviors and boundaries.

**Completion outcome:** New lifters can learn the core Overload interface independently through a brief, skippable, replayable guided tour that works with real application screens and remains easy to extend as the product evolves.

**End of pitch.**
