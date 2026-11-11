# Overload — Pitch 10: Personalization & Navigation Polish

> Verbatim copy of the Linear document "Overload — Pitch 10: Personalization & Navigation Polish" (project Overload V1, doc `cf247f11-4bb1-426f-989a-4d3038c5dc29`, last updated 2026-10-20). Pulled by the autonomous pipeline run on 2026-10-19 (local date). Linear is the source; this file is the repository copy the design doc, preview, and spec trace to.

**Type:** Feature
**Status:** Planned
**Appetite:** M — Medium
**Depends on:** Accounts: Signup, Login & Password Reset
**PRD feature:** Personalization & Navigation Polish
**UI-bearing:** Yes

---

## 1. Problem

Overload already performs its core job: helping lifters understand when to progress, hold, or deload based on their own logged training performance.

With the multi-user foundation and account experience established, the next challenge is making the application feel natural and comfortable for different people using it every day.

At present, the interface still reflects some assumptions from the original single-user product.

The dashboard can communicate what workout is scheduled, but it does not yet acknowledge the individual lifter or adapt its greeting to their current training situation.

The appearance of the application does not yet give each lifter a choice between light mode, dark mode, and their device's preferred appearance.

Most importantly, the desktop-style navigation consumes valuable horizontal space on smaller screens. Since Overload is primarily used on a phone during workouts, this reduces the room available for exercise cards, logging fields, and other training information.

These shortcomings do not prevent the progression engine from functioning, but they create friction around the experience of using it.

The product does not need a conversational assistant, elaborate customization system, or complete interface redesign to address them.

It needs three focused improvements:

1. A personalized, context-aware dashboard greeting.
2. A persistent, account-specific appearance preference.
3. Mobile navigation that gives training screens more space while preserving the existing desktop experience.

Together, these improvements prepare the application for the guided onboarding experience in the following pitch.

## 2. Appetite

**M — Medium**

This pitch contains three related interface improvements, each with a bounded behavioral scope.

The dashboard greeting introduces contextual presentation based on information Overload already knows.

The appearance setting introduces three presentation choices that must persist for each account.

Mobile navigation changes how the existing application navigation behaves at smaller screen widths without changing the underlying information architecture.

These features interact with existing account identity, timezone, training state, and application layout, but do not introduce a new training domain or fundamentally alter existing business logic.

They belong together because all three improve the everyday application shell and initial experience of a newly invited lifter.

The scope should remain medium by avoiding a broader dashboard redesign, new training intelligence, additional appearance customization, or changes to the desktop navigation.

The UI design and implementation skills should determine the detailed visual behavior within those boundaries.

---

## 3. Value delivered

When this pitch is complete, Overload feels like an application belonging to the signed-in lifter rather than a generic or single-user training tool.

The dashboard greets the lifter by first name and acknowledges their current situation without becoming conversational or overly motivational.

The application respects the lifter's preferred appearance, including their device's system setting.

On a phone, navigation no longer permanently occupies the horizontal space needed for workout logging and other training interactions.

The existing desktop navigation remains familiar.

The result is a more comfortable daily experience, especially for friends joining Overload for the first time.

---

## 4. Solution shape

### 4.1 Personalized dashboard greeting

The dashboard displays a short greeting that includes the signed-in lifter's first name.

The greeting is selected using two pieces of context:

* The lifter's local time of day.
* Their current training situation.

The greeting is one restrained line near the beginning of the dashboard experience.

It should feel like part of the interface, not like a conversation with an assistant.

The purpose is to acknowledge the lifter and orient them to the day, not to motivate, coach, or create new recommendations.

#### Training situations

The greeting must account for the following existing product states.

**A workout is planned but not yet logged**

When the lifter has a scheduled workout that remains pending, the greeting acknowledges the training day.

The wording may vary with the time of day.

A late-evening or overnight visit can use a late-night workout variation rather than the same wording shown in the morning.

The greeting must not imply that the workout has been completed.

**The lifter is done for the day**

When the day's training has been completed, the greeting reflects that state.

It should not continue prompting the lifter as though the workout were still waiting.

It should also avoid immediately treating tomorrow's workout as today's primary task.

**Rest day**

When no training is scheduled for the current day, the greeting should acknowledge that it is a rest day.

It must not suggest that the lifter missed a workout when the plan simply calls for rest.

**No plan yet**

When an account has no active training plan, the greeting should be appropriate for someone who has not yet set up their training.

It must not imply that a workout is waiting or that the lifter has already established a schedule.

This state is particularly important for newly invited friends entering empty accounts.

**First visit**

A new lifter's initial visit should receive a suitable greeting.

If they have no plan, the greeting must also remain consistent with that empty-account state.

First-visit behavior is limited to the greeting. A guided introduction to the product belongs to the later Onboarding Tour pitch.

#### Time-of-day behavior

The greeting uses the account's stored timezone when deciding the time of day.

The existing approved standing decision specifies the late-night workout variation when a planned workout remains unlogged between **9:00 PM and 4:00 AM in the lifter's local time**.

This is contextual wording, not a new notification or workout reminder.

Other wording and time-of-day presentation details can be finalized by the design/spec stages within the approved behavior.

#### Greeting variation

Each situation should have several appropriate greeting wordings so the dashboard does not always display the same sentence.

However, the greeting must not randomly change while the lifter is viewing the page.

The project's standing resolution is to use a deterministic choice based on the account and local calendar date.

This allows variation without unstable presentation.

The exact wording library belongs to the design stage.

#### Tone and presentation

The greeting should be:

* Brief and natural.
* Personal without being overly familiar.
* Contextually accurate.
* Consistent with Overload's restrained interface.
* Focused on acknowledgment rather than encouragement or judgment.

It must not introduce:

* Emoji.
* A chat field.
* An assistant personality.
* Conversational back-and-forth.
* AI-generated advice.
* Motivational pressure.
* New progression or coaching decisions.

Overload already provides training recommendations through its rule-based progression engine. The greeting should not compete with or reinterpret those recommendations.

### 4.2 Appearance preference

Each lifter can choose how Overload is displayed.

The Settings experience provides three options:

**Light**

The application uses its light appearance regardless of the device's current dark-mode preference.

**Dark**

The application uses its dark appearance regardless of the device's current light-mode preference.

**System**

The application follows the device or browser's current appearance preference.

**System is the default.**

The selected preference persists for the signed-in account.

A lifter should not need to choose their preferred appearance again on every visit.

The setting should apply coherently across the application rather than only changing the Settings page or dashboard.

Where Overload already has established visual styles and components, this pitch should build on them rather than introducing a competing visual system.

#### Settings placement

The preference belongs in Settings, alongside other account-specific preferences.

Do not add a separate theme toggle to the dashboard header or create a new appearance-customization page without a compelling reason established by the design stage.

The interaction should be straightforward, with the three supported choices clearly distinguishable.

#### System behavior

When System is selected, the application should follow the current device/browser preference rather than permanently recording whichever appearance was active when the setting was chosen.

When Light or Dark is selected, that explicit choice takes precedence.

The design/spec stages should determine the exact behavior for loading, applying, and transitioning between appearance states while preventing unnecessary visual inconsistency.

#### Account isolation

An appearance choice belongs to the signed-in account.

One lifter's setting must not modify another lifter's stored preference.

The feature must operate through the existing account ownership model.

### 4.3 Mobile navigation cleanup

Overload currently uses a sidebar-style navigation structure appropriate for desktop screens.

On phone-width screens, that persistent navigation consumes space that should be available to the main training experience.

This pitch replaces the persistent mobile sidebar with a compact navigation trigger.

#### Small-screen navigation

At the application's mobile breakpoint:

* The persistent sidebar is no longer displayed.
* A hamburger control provides access to navigation.
* Activating the control opens a navigation sheet.
* The sheet exposes the existing application destinations.
* Selecting a destination closes the sheet and navigates to the chosen destination.
* The content area regains the width previously occupied by the sidebar.

The sheet should use the same underlying navigation structure as the existing application.

This is a presentation change, not a restructuring of Overload's destinations.

#### Closing navigation

Mobile navigation must open and close cleanly.

The design stage should cover ordinary dismissal interactions and accessibility behavior using the existing component system.

Navigation should not remain unnecessarily open after the lifter selects a destination.

The sheet must not trap the user in a state where the current training screen becomes difficult to reach.

#### Desktop navigation

The desktop sidebar remains unchanged.

The purpose of this pitch is to improve the mobile experience without disrupting the navigation that already works on larger screens.

Do not reinterpret this requirement as authorization for a desktop navigation redesign.

#### Training-screen usability

The reclaimed horizontal space should benefit existing training screens, especially:

* Today's workout.
* Exercise logging cards.
* Training-plan pages.
* History.
* Goals.
* Gyms.

The navigation improvement should help the lifter access and use those screens on a phone.

However, this pitch is not a redesign of the exercise logging card or the broader training experience.

Those features retain their current responsibilities and behavior.

### 4.4 Compatibility with the upcoming onboarding tour

The next planned pitch introduces a guided onboarding tour over the real interface.

That tour depends on navigation being stable.

This pitch should leave clear, usable navigation controls at both mobile and desktop sizes so the later tour can reference the actual application interface.

Do not implement the tour here.

The responsibility of this pitch is to finish the relevant navigation behavior before onboarding is designed around it.

---

## 5. Primary user journeys

### Journey A — A lifter opens Overload before training

1. The lifter signs in or returns to an authenticated session.
2. The dashboard identifies the account's first name.
3. The application determines the lifter's current local time and training situation.
4. A suitable greeting appears.
5. The existing dashboard presents the pending workout.

The greeting remains stable while the lifter is viewing the page.

If the lifter visits again under a different relevant time or training situation, the wording can appropriately reflect that context.

### Journey B — A lifter completes their workout

1. The lifter logs the day's planned exercises.
2. The existing workout-completion behavior marks the day complete.
3. When the dashboard evaluates the updated situation, the greeting reflects that training is done.
4. The dashboard no longer presents the day as an unfinished workout.

This pitch does not change how workout completion is calculated or stored.

### Journey C — A new account has no plan

1. A new lifter signs in.
2. No active mesocycle or training plan exists.
3. The dashboard displays a first-visit or no-plan greeting using the lifter's name.
4. The greeting does not suggest a scheduled workout exists.
5. The lifter can use the existing plan-building experience.

No sample workout, generated plan, or onboarding tour is introduced.

### Journey D — A lifter changes appearance

1. The lifter opens Settings.
2. They find the appearance preference.
3. They select Light, Dark, or System.
4. The application applies the choice.
5. The preference remains associated with that account on future visits.

Choosing System causes the application to respect the current device/browser preference.

### Journey E — A lifter navigates on a phone

1. The lifter opens Overload on a narrow screen.
2. The desktop-style sidebar is not persistently occupying the content area.
3. The lifter activates the hamburger control.
4. A navigation sheet opens.
5. They choose Plan, History, Goals, Gyms, Settings, or another existing destination.
6. The sheet closes and the selected screen appears.

The lifter can comfortably return to training content without navigation permanently reducing its usable width.

### Journey F — A lifter uses Overload on desktop

1. The lifter opens Overload on a desktop-width screen.
2. The existing desktop sidebar is present.
3. They navigate as before.
4. The new mobile navigation behavior does not alter the desktop experience.

---

## 6. In scope

This pitch includes exactly three feature areas under **Personalization & Navigation Polish**:

1. A first-name dashboard greeting that varies with local time and training situation.
2. A persistent, per-account appearance preference with Light, Dark, and System options.
3. Small-screen navigation that replaces the persistent sidebar with a hamburger-triggered sheet while retaining the desktop sidebar.

Each is delivered as a complete user-facing capability.

The necessary state, integration, and persistence work belongs with the feature that uses it. Do not split backend support and visible behavior into separate pitches.

---

## 7. Out of scope

### Conversational assistant behavior

No assistant, chatbot, AI-generated greeting, natural-language command input, or conversational personality.

### New training intelligence

The greeting must not compute independent recommendations, alter progression rules, or introduce coaching guidance.

### Customizable greetings

Lifters cannot write custom greeting text, select a greeting personality, or configure an individual message library.

### Notifications

No workout reminders, greetings delivered as notifications, push messages, email nudges, or late-night reminders.

### Appearance customization beyond three modes

No custom color themes, accent-color picker, font settings, theme editor, or additional appearance presets.

### Broad dashboard redesign

Do not rebuild the dashboard layout, introduce new analytics sections, or alter its existing workout-priority behavior.

### Logging UX overhaul

Do not redesign exercise cards, add faster set-entry actions, change input prefill, or modify logging behavior.

Those improvements are owned by Faster Logging UX.

### Desktop navigation redesign

The desktop sidebar remains unchanged.

### Onboarding Tour

No guided walkthrough, tour registry, step highlighting, first-login tour state, or replayable help guide.

### What's New

No release-notes page, update modal, unread-release state, or release announcement.

### Authentication or email delivery

No signup redesign, password recovery, OTP flow, email verification, Resend integration, SMTP configuration, or third-party email provider.

This pitch consumes existing account identity and profile information; it does not change how those accounts are created or authenticated.

### Social features

No friend visibility, sharing, leaderboard, or collaboration.

---

## 8. Definition of done

The formal acceptance criteria below trace directly to the PRD feature **Personalization & Navigation Polish**.

### AC-1 — Context-aware greeting

The dashboard greeting uses the lifter's first name and varies appropriately by time of day and training situation without changing unpredictably while on screen.

The design must cover the defined situations: pending workout, completed day, rest day, no active plan, and first visit.

**PRD trace:** Personalization & Navigation Polish — Acceptance criterion 1.

### AC-2 — Appearance preference

Light, Dark, and System appearance options work and persist for the account.

System is the default as specified in the PRD's feature description and roadmap.

**PRD trace:** Personalization & Navigation Polish — Acceptance criterion 2, together with the feature description.

### AC-3 — Mobile navigation

At phone width, selecting a navigation item closes the navigation sheet, and the desktop sidebar remains unchanged.

The mobile experience replaces the persistent sidebar so the main training content regains horizontal space.

**PRD trace:** Personalization & Navigation Polish — Acceptance criterion 3, together with the feature description.

### Required PRD edge cases

**Missing timezone**

A lifter whose timezone is not yet available receives a sensible greeting instead of an error.

**First visit without a plan**

A lifter opening the application for the first time with no plan must not receive a greeting implying that a workout is scheduled.

**PRD trace:** Personalization & Navigation Polish — Edge cases / failure states.

### Roadmap completion conditions

The roadmap additionally makes the following explicit:

* The greeting should not flicker between variations during re-rendering.
* Appearance selection should persist, with System as default.
* Mobile navigation should reclaim space and open/close cleanly.
* Time-of-day behavior must use the lifter's local time.

These agree with the PRD and are included in the pitch's completion scope.

No new training or account functionality is required to satisfy them.

---

## 9. Rabbit holes

### 9.1 Turning a greeting into an assistant

A context-aware greeting may invite additional capabilities such as coaching suggestions, motivational language, notifications, or free-form conversational responses.

Those would expand this feature beyond its purpose.

The greeting is a small presentation element using existing account and training context.

It must not become a second source of training advice.

### 9.2 Using the wrong clock

Time-based greetings can appear correct during ordinary development while behaving incorrectly for accounts in another timezone.

Overload already defines each account's stored timezone as the authority for date calculations.

The greeting must use that same source rather than introducing another local-time interpretation.

### 9.3 Unstable greeting text

Choosing a random greeting every time the component renders can cause visible wording changes without any meaningful change in the lifter's situation.

This would make the interface feel erratic.

The standing resolution calls for deterministic wording variation based on account and local date.

The spec should retain that direction rather than introducing independent randomization.

### 9.4 First-visit assumptions

A newly created account may have no plan, history, goals, or scheduled session.

The greeting must handle the absence of that information honestly.

Do not create placeholder workouts or invented training states merely to make a greeting appear populated.

### 9.5 Theme flashes and inconsistent surfaces

Appearance preference affects the application as a whole.

It is possible to build a working Settings control while producing inconsistent visual states across pages or during initial loading.

The UI design and spec should account for those transitions using the existing component and styling system.

Avoid introducing a second theme system or additional infrastructure when the current application conventions suffice.

### 9.6 Overcomplicating appearance preferences

Adding more theme choices may seem inexpensive once the setting exists.

However, the approved scope is exactly Light, Dark, and System.

Custom themes, separate per-screen settings, and additional appearance options belong outside this pitch.

### 9.7 Mobile navigation becomes a full redesign

The primary navigation improvement is replacing the persistent sidebar on small screens.

It does not require reorganizing destinations, changing the desktop layout, introducing a new information architecture, or rebuilding every training page.

The goal is to free horizontal space and make navigation reliable.

### 9.8 Breaking existing workout interaction

The navigation sheet must not interfere with the existing exercise logging experience.

This is particularly important on a phone, where the lifter may be using the application one-handed during a workout.

The design should respect the existing interaction model rather than creating competing navigation or logging controls.

### 9.9 Premature onboarding integration

The upcoming Onboarding Tour will need stable navigation controls on both mobile and desktop.

This does not justify introducing the tour registry, tutorial overlays, or first-login guidance during this pitch.

Provide stable navigation behavior and leave the tour to its controlling pitch.

---

## 10. No-gos

* No assistant personality, chat input, or emoji-based greeting.
* No AI-generated recommendations or changes to progression logic.
* No motivational or guilt-based workout messaging.
* No user-defined greeting text.
* No time-of-day logic based solely on the server clock.
* No random greeting changes during ordinary re-rendering.
* No notifications or reminders.
* No additional appearance modes.
* No theme toggle in the dashboard header.
* No competing UI component or theme system.
* No desktop sidebar redesign.
* No changes to existing navigation destinations.
* No Faster Logging UX features.
* No Onboarding Tour implementation.
* No What's New implementation.
* No authentication, signup, password-recovery, or email-service work.
* No modification of another account's preferences or training data.

---

## 11. Dependencies

### Accounts: Signup, Login & Password Reset

This is the direct feature dependency identified in the Pitch Roadmap.

The greeting needs the first name associated with the signed-in account.

Appearance preferences must also be stored and retrieved in the correct account context.

This pitch assumes the existing authentication and profile mechanisms provide that identity.

It does not require a new password-recovery provider.

### Account Ownership & Isolation

This is the underlying dependency inherited through Accounts.

Profile information and appearance preferences must remain private to their respective accounts.

Cross-account isolation remains a permanent invariant.

### Existing training behavior

The dashboard already knows whether a workout is planned, completed, or absent.

This pitch uses those existing states to select suitable greeting wording.

It must not modify their underlying training logic.

### Timezone foundation

Multi-User Foundation establishes the stored account timezone, while Accounts supplies its initial capture and editing.

The greeting consumes that same timezone authority.

### Downstream dependency: Onboarding Tour

Onboarding Tour depends on Personalization & Navigation Polish because the navigation must be stable before guided walkthrough steps are designed around it.

This pitch should finish its navigation behavior without building the tour.

### Downstream dependency: iOS Shell & Native Foundation

The planned iOS shell also depends on this pitch's mobile navigation cleanup because the wrapped application inherits the responsive web interface.

---

## 12. Risks and verification focus

### Incorrect greeting context

The greeting may be personally addressed but factually wrong about the training day.

Verification should include the defined training situations and distinguish a planned workout, completed day, rest day, and absent plan.

### Date and timezone boundaries

Local time and account-local dates must remain consistent.

A lifter should not receive a misleading greeting simply because the hosting server is in another timezone.

The missing-timezone failure case must also be handled.

### Appearance persistence

The selected appearance must persist for the correct account.

System preference must continue behaving as a preference rather than an accidentally fixed appearance value.

### Responsive navigation

The mobile sheet must behave correctly across representative phone-width screens, while desktop navigation remains unchanged.

The implementation should preserve access to all existing destinations.

### Account isolation

No greeting, profile, or appearance behavior may reveal or alter another account's private information.

Existing cross-account tests remain mandatory.

---

## 13. Open questions and source gaps

### Resolved by standing decisions

The pipeline guide already contains accepted resolutions for three details:

**Greeting variation**

Use a deterministic choice based on account and local date.

**Late-night wording**

Use the late-night workout variant when a scheduled workout remains unlogged between 9:00 PM and 4:00 AM in the account's local time.

**Appearance persistence**

Store the appearance preference per account, with System as default.

The design/spec stages should adopt these rather than independently inventing conflicting rules.

### Design-stage decisions

The exact greeting copy, placement, appearance-setting presentation, mobile navigation hierarchy, and responsive interaction details belong to `/overload-design-doc` and `/overload-ui-design`.

The pitch fixes the required behavior and scope without prescribing component structures.

### Repository-specific decisions

The actual implementation of account preference persistence, theme application, and responsive navigation should follow the repository's existing architecture.

The spec stage should determine the details after inspecting the current implementation.

### Upstream documentation discrepancy: Pitch 9 email removal

The product owner has confirmed that the previous Accounts implementation was changed to remove features or implementation requiring Resend or other third-party email services.

This is a deliberate change to the implementation history as reported by the owner, not a feature request for this pitch.

However, the supplied PRD, Architecture Doc, Pitch Roadmap, and pipeline guide still describe external transactional email as part of password recovery.

**Required upstream amendment:** Reconcile the approved Accounts scope and actual repository implementation with those documents. Determine separately whether password recovery remains available, was deferred, or was removed.

Do not restore an email dependency during Personalization & Navigation Polish.

This discrepancy does not alter the required first-name, account-ownership, or timezone behavior of this pitch.

---

## 14. Rollout and delivery boundary

This is a UI-bearing feature pitch.

Its downstream artifact sequence is:

**Pitch → Design Doc → UI Preview → Spec → Linear Tickets → Implementation**

The design document should cover the dashboard greeting, appearance Settings, mobile navigation, their states, and their responsive interactions.

The UI preview should concretely establish the relevant visual states using Overload's existing design system.

The spec should translate that approved design into implementation requirements while preserving the established account and training architecture.

Ticket implementation should follow the UI preview rather than independently redesigning the interface.

### Merge behavior

The pipeline guide identifies Personalization & Navigation Polish as ordinarily eligible for **merge on green**.

This pitch changes presentation and account preference behavior but is not intended to change authentication, logged-set writes, gym-baseline correction, or account-ownership architecture.

If implementation unexpectedly requires changing one of those protected areas, the autonomous pipeline must follow its documented stop conditions and merge-behavior rules rather than expanding scope silently.

### Production boundaries

No autonomous run may apply production migrations or enable production signup.

If account preference persistence requires a schema migration, its production application remains a human operation under the established project policy.

This pitch does not authorize unrelated production authentication or email configuration work.

---

## 15. Handoff to design and spec

This pitch is ready for downstream design when the following boundaries remain clear.

The greeting is a restrained, first-name acknowledgment based on existing training state and account-local time.

Appearance is exactly Light, Dark, or System, persisted per account with System as default.

Mobile navigation replaces the persistent sidebar with a sheet at phone width, while desktop navigation remains unchanged.

The design and implementation stages have freedom to determine presentation and technical details within the existing architecture.

They do not have permission to introduce assistant behavior, redesign the training workflows, reopen authentication, add email services, or build the upcoming onboarding tour.

**Completion outcome:** Overload greets each lifter appropriately, respects their appearance preference, and gives mobile training screens more usable space without changing the product's existing training behavior.

**End of pitch.**
