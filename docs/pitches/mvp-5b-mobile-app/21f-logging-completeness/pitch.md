# Pitch 21f — Logging Completeness

> Source: the approved expansion in Linear, "Pitch 21f — Logging Completeness" (Overload V1 project document, updated 2026-11-18 UTC). It is copied here unchanged in substance for the pipeline run of 2026-11-17, and it expands `docs/planning/mobile-roadmap.md` → "21f — Logging Completeness (L)". No local pitch existed before this run, so there was nothing to reconcile. Where the audit (`docs/planning/mobile-audit.md`) disagrees with the current code, the code wins: the audit's "21e — complete workout" endpoint table is this slice under the roadmap's later numbering.

**Project:** Overload V1
**Parent initiative:** Pitch 21 — Mobile App (React Native + Expo)
**Milestone:** Pitch 21f — Logging Completeness
**Type:** Feature — Native mobile vertical slice
**Appetite:** L (Large)
**Priority:** High
**Status:** Ready for design and specification
**Client scope:** iOS mobile, using the existing web backend and shared business logic
**Plan placement:** Free for workout capture, editing, and history; existing Pro entitlements continue to govern progression intelligence
**UI-bearing:** Yes — native workout logging interactions
**Dependency:** Pitch 21e — Workout Loop (Complete)
**Pitch folder:** `docs/pitches/mvp-5b-mobile-app/21f-logging-completeness/`

---

## 1. Overview

Pitch 21f completes the native iPhone workout-logging experience established by Pitch 21e.

Pitch 21e delivered the first working end-to-end native workout loop: viewing today's workout, starting and resuming a session, entering weights and reps, completing the session, viewing the summary, and reviewing all-time History. It also established the keyboard behavior, persistence, server-confirmed saving, and web/mobile consistency required for reliable workout capture.

However, completing a straightforward workout is only part of how serious lifters train.

Real workouts involve unavailable equipment, different gyms, adjustments to planned sets, changes to exercise selection, skipped exercises, bodyweight movements, cardio, and corrections to previously entered data.

The native app must accommodate these situations without forcing the lifter to switch to the web application.

**Pitch 21f closes that gap.**

The outcome is a native workout logger that supports the full range of existing web logging behaviors while preserving the correctness, privacy, and progression rules already established in Overload.

This pitch is about completing the act of recording training. It is not about expanding progression intelligence, redesigning the workout planner, or adding new training modalities.

---

## 2. Problem

A serious lifter does not always perform exactly the workout that was planned.

Examples:

- The lifter trains at a different gym, where machine resistance differs.
- A planned machine is occupied or unavailable.
- A movement needs to be replaced mid-session.
- An exercise is intentionally skipped.
- The lifter performs fewer or more sets than originally planned.
- A weight or repetition entry needs correcting.
- A bodyweight exercise does not follow the same loading conventions as a machine or barbell exercise.
- An exercise has a fixed repetition target rather than a range.
- The lifter wants to record how close a set was to failure.
- The day's training includes cardio in addition to lifting.
- The lifter misses a scheduled day and needs to reconcile the training calendar.

Overload's web application already supports these behaviors, but the native mobile experience is not yet fully equivalent.

Without this slice, the lifter can perform a standard workout on the phone but may still need to open the web application when training deviates from the plan.

That undermines the goal of replacing the notes app with a single trustworthy training system.

The underlying problem is not just missing controls. It is preserving the relationship between **what was planned, what was actually performed, and what Overload should remember afterward.**

---

## 3. Desired Outcome

After Pitch 21f, a lifter can complete an entire planned training day on an iPhone even when the actual workout differs from the template.

They can choose the gym, substitute exercises, skip movements, adjust the number of sets performed, record RIR, correct entries, log cardio, and resume or finish without losing data.

The native app must respect the same logging rules and data interpretation as the web application.

Historical entries remain trustworthy, machine baselines remain gym-specific, and corrections to past sets are reflected in the derived training data.

The experience should continue to feel like a focused, one-handed gym tool rather than a condensed desktop form.

**Success means the lifter no longer needs the web application to complete or correct ordinary workout logging.**

---

## 4. Appetite and Scope Discipline

**Appetite: Large (L)**

This pitch contains several interacting logging capabilities that affect recorded training history and existing progression inputs.

It is justified as one larger vertical slice because these behaviors belong to the same daily workflow and share the same logging context.

The implementation should reuse existing backend behavior and shared rules wherever possible instead of creating separate native-specific interpretations.

The appetite does not authorize expanding this pitch into workout planning, new recommendation algorithms, richer cardio analytics, or unrelated mobile screens.

If implementation complexity exceeds the planned slice, the design and specification stages should simplify the presentation and reuse existing functionality before proposing additional features.

Any genuinely new business rule or irreversible data change must be identified explicitly rather than introduced as an implementation detail.

---

## 5. Solution Shape

### 5.1 Gym Selection and Gym-Specific Baselines

The lifter can select the gym where the current workout is being performed.

The selected gym becomes part of the workout's logging context.

For machine-based and cable exercises, previous working weights and baselines must respect the selected gym rather than assuming equipment is interchangeable across locations.

For gym-consistent movements, the existing shared weight-history behavior remains intact.

Expected behavior:

- A lifter can choose from their existing gyms when starting or logging a workout.
- The workout clearly identifies the selected gym.
- Machine and cable baselines are associated with the correct gym.
- Selecting a different gym changes the relevant historical weight context.
- A movement with no history at that gym does not receive a falsely authoritative baseline.
- Free-weight and plate-loaded exercises retain the existing gym-consistent interpretation.
- Machine baseline establishment and correction follow the existing shared rules.
- A baseline correction never modifies historical logged sets.
- Resume preserves the appropriate gym context.

This pitch must consume the established gym-variable classification and baseline rules, not create a second interpretation.

**Boundary:** Full gym management, location pinning, and related library screens belong to Pitch 21h. This slice only needs the gym selection necessary for logging.

### 5.2 Exercise Swap

The lifter can replace an exercise during a workout when the planned movement cannot or should not be performed.

The replacement applies to the actual workout occurrence rather than silently rewriting the underlying training template.

Expected behavior:

- A Swap action is available from the active exercise.
- The lifter can search available replacement exercises.
- Candidates can be filtered by muscle group.
- The filter can be changed to any available muscle group, consistent with the Workout Logging Refinements feature.
- The original exercise's muscle group is the sensible initial context.
- The lifter can choose a suitable replacement and return to logging without abandoning the session.
- The workout clearly reflects the performed exercise.
- Historical records preserve the distinction between the planned movement and its performed replacement.
- Existing unaffected exercises and saved sets remain intact.
- Empty searches and filters show a useful explanation.
- Canceling a swap leaves the workout unchanged.

The mobile roadmap explicitly includes the ability to change the swap filter to any muscle group. The original PRD's narrower same-muscle-group rule must therefore be reconciled against the later Workout Logging Refinements requirement during design, using the current web behavior as the parity reference.

**Boundary:** This pitch does not build a new exercise library management experience or silently change the mesocycle's planned exercise.

### 5.3 Skip an Exercise

The lifter can intentionally skip an exercise without inventing a set or recording false performance.

Expected behavior:

- A clear Skip action is available for an exercise within an active session.
- Skipping requires an explicit choice rather than occurring accidentally.
- The exercise is visibly distinguished from completed exercises.
- No fabricated weight, repetition, RIR, or completion data is created.
- The rest of the workout remains accessible.
- The session can reach a valid final state according to the existing logging rules.
- The action does not alter unrelated exercises or the underlying template.

A skipped exercise is not the same thing as a skipped training day.

The native experience must preserve that distinction.

The design stage must confirm the existing web rules for reversing a skip, handling partially logged exercises, and determining workout completion.

### 5.4 Reps in Reserve (RIR) Entry

The native logging card supports optional Reps in Reserve entry as part of recording lifting performance.

RIR describes how many additional repetitions the lifter believes they could have completed before reaching failure.

Expected behavior:

- RIR can be entered alongside the set's weight and repetitions.
- The input is optional unless an existing shared rule explicitly requires it.
- A lifter can log a set without entering RIR.
- The input uses a suitable compact numeric interaction.
- Entered RIR survives normal editing, navigation, saving, and resume behavior.
- The value appears consistently when the corresponding logged set is reviewed or edited.
- Invalid entries are handled according to the existing validation rules.
- RIR never causes weight or reps to be lost.
- Existing history remains readable when no RIR value was recorded.

**Plan boundary:** Recording one's own training data is Free. Pro-only progression recommendations and any interpretation of RIR within those recommendations remain governed by existing capability enforcement.

This pitch is not permission to introduce a new RIR-driven progression algorithm.

RIR-based recommendation presentation belongs with Pitch 21g where applicable.

### 5.5 Editing Previously Logged Sets

Lifters must be able to correct mistakes without creating duplicate training records.

Expected behavior:

- A previously saved set can be opened for editing from the appropriate logging or history context.
- The lifter can correct weight and repetitions.
- RIR can be edited where supported by the existing data model.
- The interface distinguishes editable values from saved values.
- Edits become authoritative only after server confirmation.
- A failed edit preserves the user's entered correction and offers a retry.
- Repeated requests do not create duplicate records.
- The corrected values appear consistently on the phone and web.
- Historical exercise, gym, and training context remain attached to the same record.
- Derived progression information reflects the corrected history according to existing shared behavior.
- Editing historical sets does not replay or retroactively rewrite stored gym baselines.

Logged history is one of the most sensitive parts of Overload. The implementation must follow the established centralized logged-set write path and account-isolation invariants.

**Boundary:** This is correction of recorded training data, not a bulk history editor or a replacement for the workout planning system.

### 5.6 Editing Planned-Set Counts During Logging

The lifter can adapt the number of sets being performed during the active workout.

Expected behavior:

- The active logging experience reflects the current planned-set count.
- The lifter can adjust that count where the existing web workflow allows it.
- The card updates to show the appropriate editable set rows.
- Already saved performance is never silently deleted or detached.
- Adjustments do not duplicate a logged session or exercise.
- Resume and completion reflect the resulting set state.
- Any difference between the original plan and actual performance remains understandable in history.

A critical boundary is the distinction between the **planned workout template** and the **logged occurrence**.

The native workout logger should not silently change all future workouts merely because the lifter adjusted today's session.

The design stage must confirm whether the existing behavior adjusts only the current occurrence or supports an explicitly separate template change.

**Boundary:** Full editing of session templates, splits, and mesocycles belongs to the plan builder and subsequent mobile planning scope, not this pitch.

### 5.7 Bodyweight and Fixed-Target Handling

The logging card must correctly represent movements that do not fit a conventional loaded exercise with a repetition range.

This includes bodyweight exercises, including abs movements, and exercises configured with a single repetition target.

Expected behavior:

- Bodyweight exercises can be logged using their appropriate existing weight and repetition conventions.
- The app does not force an inappropriate external weight entry for a bodyweight movement.
- Abs exercises behave consistently with other bodyweight movements.
- A fixed target such as 3 × 10 is represented and logged correctly.
- Fixed-target exercises are not forced into an artificial rep-range interaction.
- Saved values remain valid inputs to the existing shared progression logic.
- Navigation, keyboard focus, set saving, and completion work for these exercise types.
- Historical data remains interpretable across the web and native app.

The established rules for zero or empty weight, target ranges, and numerical validation must be reused.

**Boundary:** No new exercise classification system or new progression formula is part of this slice.

### 5.8 Missed-Day Prompt and Resolution

The mobile roadmap lists the missed-day prompt as part of 21f.

However, Pitch 21e already implemented and physically verified the three native missed-day outcomes:

- Log it late.
- Shift week.
- Skip it.

Therefore, 21f should treat this area primarily as a **parity and regression requirement**, not a fresh implementation.

Expected behavior:

- A missed scheduled day is detected according to the account's timezone.
- The prompt offers the same three outcomes as the web experience.
- A late log is associated with the correct scheduled occurrence.
- Shift affects only the applicable current week.
- The following week returns to its authored schedule.
- Multiple missed days do not cause uncontrolled compounding.
- A resolved missed day does not repeatedly prompt the lifter.
- Workout logging, history, and cardio behavior remain correct after a missed-day resolution.

Only work needed to integrate this established flow with 21f's added logging capabilities should be undertaken.

Do not duplicate or replace 21e's already accepted missed-day implementation without a demonstrated parity gap or defect.

### 5.9 Cardio Logging

The lifter can record the cardio prescribed for a training day.

The scope is deliberately minimal.

Expected behavior:

- Cardio associated with a split day is visible in the native workout context.
- The lifter can record the cardio type and duration.
- Required values are validated.
- A saved cardio log appears in the appropriate training record.
- Cardio history is consistent between the native app and web.
- An incomplete or failed save does not create a false completed record.
- Normal retry behavior does not create duplicate cardio entries.
- Strength logging and cardio can coexist within the same training day without interfering with each other.

Cardio remains a record of activity, not an input to the strength progression engine.

**Explicitly excluded:** distance, pace, speed, heart rate, calories, zones, cardio progression recommendations, wearable imports, and advanced cardio analysis.

### 5.10 Preserve the 21e Native Logging Experience

Every added capability must integrate into the existing workout flow.

The current interaction principles remain mandatory:

- One-handed set entry.
- Correct weight and repetition keyboards.
- The active set and essential actions remain accessible above the keyboard.
- Keyboard accessory actions behave consistently.
- Done dismisses the keyboard without saving or discarding entered values.
- Exercise navigation never leaves inputs unresponsive.
- Long exercise names do not break navigation layouts.
- Saving occurs only when confirmed by the server.
- Temporary failures preserve entered values.
- An incomplete workout remains resumable.
- Completion, Today, and History agree.
- The existing all-time History remains accessible.

21f should extend the proven interaction model instead of redesigning it without necessity.

---

## 6. User Experience Principles

The native experience should be designed for someone actively training, potentially standing between sets, holding a phone with one hand, and trying to record information quickly.

### Speed

Common actions should require minimal effort.

Saving a set, selecting a gym, correcting a value, swapping a movement, or recording cardio should not require navigating through multiple unrelated screens.

### Clarity

The lifter should always understand:

- Which workout and exercise are active.
- Which gym is selected.
- Which sets are saved.
- Which entries are still drafts.
- Whether an exercise was swapped or skipped.
- Whether a save succeeded.
- What happens when an adjustment changes the current workout.

### Predictability

Changing one part of a workout must not unexpectedly alter unrelated training data.

An exercise swap should not rewrite the plan. Changing a set count should not erase logged sets. Selecting another gym should not corrupt machine baselines.

### Native usability

Use the existing mobile design system and established accessibility behavior.

Keyboard handling, focus transitions, VoiceOver labels, touch targets, safe areas, Dynamic Type, light and dark appearances, and app background/resume behavior must remain reliable.

### Error recovery

Network failures and validation errors should preserve user-entered information whenever safe and provide a clear recovery action.

The app remains online-only. This does not authorize an offline logging queue or background synchronization system.

---

## 7. Plan Placement and Entitlements

**All ordinary training capture remains Free.**

Free users must be able to:

- Select a gym for logging.
- Swap or skip exercises.
- Record weight, reps, and available RIR fields.
- Correct logged sets.
- Adjust supported set counts during logging.
- Log bodyweight and fixed-target exercises.
- Resolve missed days.
- Log cardio.
- Access their own training history.

Existing Pro capabilities continue to apply to progression intelligence, evidence, e1RM trends, and RIR-informed recommendations where supported.

The native API must enforce any Pro capability on the server, not merely hide a UI control.

This slice must not introduce a checkout, upgrade flow, subscription purchase, or new entitlement model.

---

## 8. Data Integrity and Security Requirements

The implementation must preserve the existing Architecture Doc's requirements.

### Account isolation

Every user-owned read and write must be scoped to the authenticated account.

A second account must not be able to view, change, or detect another lifter's gyms, sessions, exercises, sets, cardio, or history.

### Logged-set integrity

All logged-set writes must continue through the established authorized logging path.

Editing a logged set must preserve ownership, associations, and historical meaning.

Deleting or archiving gyms or exercises must not destroy referenced training history.

### Correct baseline behavior

Machine and cable baseline behavior uses the established gym-variable classification.

Baseline establishment and correction remain scoped to the correct gym and exercise.

Historical edits do not retroactively replay stored baselines.

### Planned versus performed

Changes made while logging must preserve the distinction between the session template and the actual logged occurrence.

### Derived intelligence

Progression tags and trends remain derived from the applicable logged data and shared rules. They are not persisted as independent authoritative results.

### Retry safety

Natural-key writes and edits must remain safe to retry.

No duplicate records, repeated completion effects, or cross-account side effects should result from network retries.

### Backward compatibility

The existing versioned mobile API must remain compatible with supported installed app versions.

Do not introduce a breaking contract change without following the project's versioning and release requirements.

---

## 9. Definition of Done

Pitch 21f is complete when all the following acceptance conditions are satisfied.

### A. Gym and baseline parity

- The lifter can select a gym for the active workout.
- Gym-dependent exercise history and baselines use the correct gym.
- Gym-consistent exercises do not acquire inappropriate gym-specific baselines.
- First-time machine logging at a new gym behaves correctly.
- Existing baseline correction rules remain unchanged.

### B. Exercise changes

- The lifter can swap an exercise during a workout.
- The swap picker supports the planned muscle-group filtering behavior.
- The swap affects the logged occurrence without silently rewriting the template.
- The lifter can intentionally skip an exercise.
- Skipped exercises do not create false sets or performance data.
- Swapped, skipped, and completed exercises remain distinguishable.

### C. Set capture and corrections

- RIR can be entered and saved where supported, without becoming mandatory.
- Saved sets can be edited without duplication or history corruption.
- Corrections are visible consistently in mobile and web.
- Failed saves and edits preserve entered values.
- Planned-set adjustments work within the existing supported logging scope.
- Saved historical sets remain intact when set counts change.

### D. Exercise-type correctness

- Bodyweight and abs exercises use appropriate logging behavior.
- Fixed-target exercises such as 3 × 10 work correctly.
- Existing weight and repetition validation remains intact.
- No new progression calculation is introduced.

### E. Scheduling and cardio

- Previously implemented missed-day resolution continues to pass parity and regression tests.
- Cardio type and duration can be recorded for the relevant scheduled day.
- Cardio records appear consistently in History and the web application.
- Cardio does not create strength progression tags or e1RM trends.

### F. Existing workout-loop stability

- Workout start and resume remain reliable.
- Keyboard and focus interactions remain responsive through all exercise transitions.
- Server-confirmed saving and retry safety remain intact.
- Completing a workout updates Today, summary, and History consistently.
- No regressions occur in the native behaviors accepted in 21e.

### G. Privacy and cross-platform consistency

- Every new mobile read and write is covered by appropriate account-isolation tests.
- The same account sees consistent records on the web and iPhone.
- A different account cannot access those records.
- Free capture remains available without Pro access.
- Existing Pro-only intelligence remains correctly gated.

### H. Validation and owner acceptance

- Relevant automated tests pass.
- Mobile lint, typecheck, bundle export, and required workspace checks pass.
- Applicable integration, history-integrity, and API compatibility suites pass.
- All changes to logged-set writes or baseline behavior are verified against real-shaped staging data.
- Staging web functionality remains correct.
- A compatible Expo staging OTA is delivered through the approved publishing workflow.
- The owner performs real-device acceptance on a physical iPhone.
- Any discovered defects are corrected within the slice and retested.
- The owner explicitly accepts the slice before the next mobile pitch begins.

**Final outcome:** Every existing web workout-logging behavior included in the 21f roadmap is available and usable on the iPhone, without compromising data integrity or the core workout loop.

---

## 10. Rabbit Holes and Risks

### 10.1 Logged-set editing and historical correctness

Historical corrections can affect derived training conclusions. The work must respect the existing source-of-truth rules rather than introduce parallel recalculation or destructive editing behavior.

### 10.2 Gym baseline contamination

A wrong gym or exercise classification could establish or correct a baseline incorrectly.

This is especially sensitive because machine resistance is not necessarily comparable between gyms.

### 10.3 Exercise swap and plan provenance

The performed exercise must not erase the original planned exercise from historical context.

A casual implementation that edits the shared template would create a broader behavior change than the user requested.

### 10.4 Changing set counts

Removing or reducing planned sets creates a risk of dropping previously saved performance.

The design must make the distinction between current-session adjustments and template changes explicit.

### 10.5 Keyboard and focus regressions

21e exposed multiple real iOS issues that automated tests alone did not catch.

Additional controls and editable rows must not reintroduce covered actions, unresponsive fields, or lost focus across navigation.

### 10.6 Cardio and strength session completion

Cardio must integrate naturally with the training day while remaining separate from strength progression.

The design must reconcile cardio completion with the existing session-completion rules.

### 10.7 Scope overlap with 21e

Missed-day resolution and substantial gym/logging context already exist from 21e.

21f should confirm parity and add missing behavior, not rebuild accepted functionality.

### 10.8 Scope overlap with 21g and 21h

The logging card is also used by future insight and management features.

Avoid adding Pro recommendation presentation from 21g or full gym/library management from 21h merely because those capabilities are nearby.

---

## 11. Explicit Non-Goals

The following are not included in Pitch 21f:

- New progression, hold, or deload algorithms.
- New e1RM formulas or trend visualizations.
- Pro recommendation cards or detailed evidence displays (21g).
- The scheduled-deload banner and expanded workout summary (21g).
- Full plan editing, mesocycle building, or plan import.
- New gym management screens, pinned-location management, or complete exercise library management (21h).
- Goal management and exercise-history intelligence screens (21i).
- Account, billing, checkout, subscription, or purchase flows.
- Wing-it workouts without a planned session (Pitch 25).
- Cardio progression or advanced cardio metrics.
- Wearable integrations, Apple Watch, HealthKit, or Live Activities.
- Offline-first logging and queued synchronization.
- Android development.
- TestFlight, App Store distribution, or a Production-connected native build.
- A new native dependency or runtime change without an explicit justification and the required approval.
- Unrelated web product redesign.

The existing web product should remain behaviorally stable except for narrowly justified shared fixes needed to achieve parity.

---

## 12. Dependencies

### Completed prerequisites

**Pitch 21a — Monorepo Move**
Provides the shared web/mobile workspace.

**Pitch 21b — Shared Package & Contracts**
Provides common types, validation, and reusable training logic.

**Pitch 21c — Mobile API & Auth Foundation**
Provides authenticated, versioned, account-scoped mobile API access.

**Pitch 21d — App Shell, Design System & Accounts**
Provides native navigation, authentication, secure storage, theming, and common states.

**Pitch 21e — Workout Loop**
Provides the functioning native workout lifecycle, set logging, History, exercise navigation, and device-tested keyboard behavior.

### Existing business rules

21f depends on the already established web logic for:

- Gym-variable exercise classification and baselines.
- Logged-set creation and correction.
- Workout and exercise completion.
- Exercise substitution and plan provenance.
- Planned repetition targets.
- Missed-day schedule reconciliation.
- Cardio records.
- Capability enforcement.
- Account isolation.

These should be reused rather than independently reimplemented.

### Downstream

**Pitch 21g — Insights in the Workout** relies on the completed native logging experience to present Pro progression recommendations and the full session summary.

**Pitch 21h — Plans, Library & Gyms** later expands the native management and browsing surfaces.

**Pitch 21l — TestFlight Beta** remains responsible for Production-connected mobile distribution.

---

## 13. Open Questions for the Design and Specification Stages

These questions should be resolved against the current web behavior, canonical architecture, shared business rules, and existing specifications before implementation.

Each resolution should be recorded in the specification's **Resolved Decisions** section.

### Q1. RIR input conventions

What range, precision, and empty-value behavior does the existing web implementation use?

The native input should follow the established rules rather than invent a second RIR convention.

### Q2. RIR edit and display scope

Where should an existing logged set's RIR appear, and can it be corrected after completion?

Match existing stored-data capabilities and web behavior.

### Q3. Gym selection timing

When and where can the lifter change the gym associated with the workout?

How does the current system protect previously logged sets and baseline associations if the selection changes?

### Q4. Swap filter behavior

The original Exercise Swap criterion restricts replacements to the same muscle group, while the later Workout Logging Refinements feature explicitly permits changing the filter to any group.

Confirm the currently authoritative web behavior and implement the mobile parity target without silently changing shared domain rules.

### Q5. Reversing skips and swaps

What does the web application allow after a movement is skipped, swapped, or partially logged?

How should those states appear on a small native screen?

### Q6. Planned-set count edits

Does the current web operation adjust only the logged occurrence, or is there also an explicit action to change the plan for future workouts?

Ensure the native experience does not mutate shared templates unintentionally.

### Q7. Set editing after completion

Which historical entries can be corrected, and how are corrections represented when a workout is already complete?

Preserve the existing logged-history integrity rules.

### Q8. Bodyweight and fixed-target presentation

How should native fields and labels differ for bodyweight movements, abs exercises, and a single rep target?

Follow existing validation and progression semantics.

### Q9. Cardio within the workout flow

How does cardio affect the completed-day state, and where should its saved type and duration appear in History?

Match the existing web behavior.

### Q10. Native UI density

How should Swap, Skip, set-count adjustment, RIR, and correction actions fit on the workout card without making one-handed logging slower?

The mobile UI preview should resolve the interaction hierarchy before implementation.

### Q11. Mobile API coverage

Which required actions already have suitable mobile endpoints, and which need additive, backward-compatible API support?

The design stage should confirm this from the current API inventory rather than assuming a new endpoint for every behavior.

### Q12. Existing 21e implementation overlap

Which 21f requirements are already fully satisfied by 21e and require regression coverage only?

Record the findings so implementation effort targets actual parity gaps.

**Owner-decision boundary:** If resolving any question would require destructive data behavior, a new Production migration, an entitlement change, a new native dependency/build requirement, or a change to an approved product boundary, surface that decision explicitly rather than silently choosing it.

---

## 14. Delivery and Release Gates

Pitch 21f follows the established Overload pitch pipeline:

**Pitch → Design Document → Native UI Preview → Specification → Linear Tickets → Implementation → Review and Audit → Staging Integration → Physical-iPhone Acceptance**

### Design

Produce a design document that identifies the necessary mobile and shared/backend behavior.

The design must consume the existing architecture and confirm actual web parity.

### Native preview

Because 21f materially changes workout interactions, create a mobile UI preview using the established mobile design process.

The preview should cover the new controls and the important active, saved, error, and empty states.

### Specification and Linear execution

Break implementation into coherent, reviewable tickets using the normal Linear milestone workflow.

Each implementation ticket must provide a complete, testable slice of behavior.

Avoid splitting a capability into unrelated backend-only and UI-only mini-pitches.

### Implementation

Develop from the latest staging baseline on a feature branch.

Create reviewable PRs, keep Linear status current, and preserve the canonical branch workflow.

### Verification

Run all required automated suites.

Any change to logged history writes, exercise ownership, or baseline corrections requires the project's stricter integrity, isolation, and staging verification.

### Staging delivery

Merge accepted feature work into staging through the approved process.

Publish an Expo staging OTA only when the compatibility and publisher safety checks pass.

Never bypass an OTA publisher safeguard.

### Owner acceptance

The owner tests on a physical iPhone using a disposable seeded account against staging.

Acceptance should cover at least:

- An entire workout involving multiple exercise types.
- Gym selection and gym-variable baseline behavior.
- Exercise swaps and skips.
- RIR capture and editing.
- Historical corrections.
- Set-count adjustments.
- Bodyweight and fixed-target exercises.
- Cardio logging.
- Missed-day regression.
- Keyboard behavior across every altered interaction.
- Failed saves, recovery, resume, and completion.
- Agreement between the staging web app and iPhone.
- Accessibility, light/dark mode, and larger text.

All significant findings are addressed before the owner accepts the slice.

### Production promotion

Production promotion is a separate, explicit release stage following staging and owner acceptance.

Use the canonical release branch, verification, PR, deployment, and synchronization process.

No Production database change, credential change, Expo Production update, or store distribution is implied by approval of the pitch itself.

---

## 15. Final Success Statement

Pitch 21f succeeds when Overload's iPhone app supports the real-life variations of an ordinary training session as reliably as the web application.

A lifter can select their gym, adjust their exercises, record all relevant lifting and cardio performance, fix mistakes, and finish their workout without abandoning the native app.

The phone records what actually happened while preserving what was planned.

Saved history stays correct, gym-dependent baselines stay trustworthy, and future progression intelligence has reliable training data to work from.

**21e made it possible to complete a workout on an iPhone. 21f makes it possible to complete a real workout, including the adjustments and corrections that happen along the way.**
