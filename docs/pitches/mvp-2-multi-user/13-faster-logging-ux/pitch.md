# Overload — Pitch 13: Faster Logging UX

> Verbatim copy of the Linear document "Overload — Pitch 13: Faster Logging UX" (project Overload V1, doc `3a938d8d-d8ec-41da-a348-e6e93473834b`, last updated 2026-10-21T02:02Z). Pulled by the autonomous pipeline run on 2026-10-20. Linear is the source; this file is the repository copy the design doc, preview, and spec trace to. (The Linear body opens with the Type line as a heading; it is reproduced here as a plain line.)

**Type:** Feature

**Status:** Planned
**Appetite:** M — Medium
**Depends on:** MVP 1 — Guided Workout Logging
**UI-bearing:** Yes
**Default merge behavior:** Stop before merge

---

## 1. Problem

Overload already supports structured workout logging.

A lifter can open today's workout, select the relevant gym, view planned exercises, enter performed sets, and preserve the resulting history.

That history powers Overload's progression recommendations, gym-specific working-weight baselines, estimated one-rep-max trends, and strength-goal tracking.

The core logging workflow works, but completing an ordinary workout still requires avoidable interactions.

A lifter may repeatedly enter the same weight across several sets, look elsewhere to remember their previous working weight, navigate between fields that could receive focus automatically, or make unnecessary taps to advance to the next set or exercise.

These small interruptions accumulate.

Someone logging twenty working sets does not experience logging friction just once. They experience it throughout the entire session.

This is especially important on a phone, where the lifter may be standing between sets, holding equipment, or using the application with one hand.

Overload should not force users to spend more attention on its interface than on the training session itself.

However, speed cannot come at the expense of data correctness.

The app's progression engine depends on accurately recorded weights and reps. An incorrectly accepted prefilled value can corrupt workout history, affect future recommendations, and interfere with gym-specific baselines.

The problem is therefore not simply to automate more inputs.

It is to **reduce unnecessary actions while preserving deliberate confirmation of what the lifter actually performed.**

This pitch makes the existing exercise logging experience faster, clearer, and more comfortable without adding visual complexity or changing Overload's training logic.

---

## 2. Appetite

**M — Medium**

The work is focused on one existing interaction surface: exercise logging.

Its scope includes several coordinated improvements:

* Clearer previous-performance context.
* Safe prefill of previously used weight.
* Easier reuse of weight across consecutive sets.
* Intelligent input focus.
* Appropriate numeric keyboard behavior.
* Larger and more comfortable touch targets.
* Clearer visual distinction between completed and pending sets.
* Smoother progression between sets and exercises.
* Fewer unnecessary modal transitions.
* Better one-handed usability.

These improvements should be designed as one coherent logging experience rather than an unrelated collection of interface tweaks.

The appetite remains medium by retaining the existing exercise-card structure, canonical logging path, and training behavior.

This pitch does not rebuild the workout system or introduce new workout intelligence.

---

## 3. Value delivered

A lifter can complete an ordinary set with fewer taps and less repeated input.

They can see useful previous-performance context without leaving the logging card.

When successive sets use the same weight, the app makes that workflow convenient.

Input focus and mobile keyboard behavior support the natural sequence of entering the performed weight and reps.

Completed sets are visually distinguishable from sets still waiting to be logged.

Moving from one set to the next feels continuous rather than requiring repeated navigation or confirmation dialogs.

At the same time, the application never silently records a suggested or prefilled value as though the lifter explicitly confirmed it.

The result is a logging experience that is faster without becoming less trustworthy.

---

## 4. Solution shape

### 4.1 Previous-performance context

The exercise logging card should provide concise information about the lifter's relevant previous performance.

This context helps the lifter recall their working weight and decide what to attempt without navigating away to History.

The context must be drawn from the account's actual training records.

For machine and cable exercises, the existing gym-specific history rules remain authoritative.

For free-weight exercises, existing global history behavior remains authoritative.

The app must not display a working weight from an unrelated gym as though it were the correct baseline for the currently selected machine or cable exercise.

When relevant previous performance does not exist, the interface should communicate that appropriately rather than inventing a suggested weight.

The design stage determines exactly how much context fits within the card without creating clutter.

The context is informational.

It does not replace the progression engine or independently generate a new recommendation.

### 4.2 Safe previous-weight prefill

When an appropriate previous working weight is available, the logging interface may present that weight as the starting value for the next set.

This reduces the repeated typing required during ordinary training.

However, the prefilled value is not automatically considered performed.

**A prefilled weight must never be written to workout history until the lifter explicitly confirms the set.**

The lifter must be able to change the value before confirmation.

When no applicable previous value exists, the interface must not invent one.

The prefill must respect existing exercise-specific logging rules, including gym-specific machine and cable weights and the distinction between loaded and pure bodyweight movements.

The design/spec stages determine how the interface communicates the difference between a proposed value and a confirmed logged value.

### 4.3 Consecutive-set weight reuse

Many exercises involve multiple working sets performed with the same weight.

Overload should make that common pattern efficient.

After a lifter confirms one set, the next set can offer the same weight as a convenient starting value.

The lifter should not have to retype it unnecessarily.

This behavior must remain editable.

It must not automatically complete the next set, copy its reps without confirmation, or create additional logged sets.

A lifter who changes weight between sets must be able to do so without fighting the interface.

This is a shortcut for ordinary data entry, not an assumption that all sets are identical.

### 4.4 Intelligent input focus

The logging form should support the natural order in which a lifter records a set.

Focus should move intelligently between relevant fields and actions, reducing unnecessary taps.

For example, after the lifter completes an input, the next relevant field should be accessible without repeatedly selecting it manually.

Focus behavior must account for:

* Weight-and-reps exercises.
* Reps-only pure bodyweight exercises.
* Prefilled values that may need editing.
* Sets that are already logged.
* Transitions to subsequent sets.
* Mobile virtual keyboards.

Focus should support the lifter's actions rather than unexpectedly interrupting them.

The exact sequence and interaction details belong to the UI design and spec stages.

### 4.5 Numeric keyboard behavior

On a phone, logging fields should invoke the appropriate numeric input experience.

The lifter should not need to repeatedly switch keyboard modes to enter weights and repetitions.

The input experience must preserve the existing rules for valid values and exercise types.

This pitch improves the way the lifter enters data without changing the meaning or validation of recorded weights and reps.

The implementation must remain compatible with supported browsers and the existing mobile-first layout.

### 4.6 Larger touch targets

Common logging interactions should remain comfortable to use on a phone.

Small controls that are difficult to activate accurately during a workout should receive appropriate usability improvements.

The purpose is to reduce missed taps and accidental interactions.

Larger targets should not make the card visually crowded or introduce unnecessary controls.

The design should preserve Overload's restrained visual presentation.

### 4.7 Clear completed-set state

A lifter should be able to distinguish quickly between:

* A set waiting to be performed.
* A set with values being prepared.
* A set that has actually been logged.

The completed state should be unambiguous.

A prefilled value must not make a pending set appear completed.

If an existing logged set is edited, its visible state should reflect the actual persisted record rather than an unconfirmed local value.

The design stage determines the visual language for these states.

### 4.8 Smoother set-to-set transitions

After confirming a set, the interface should make moving to the next relevant set straightforward.

The lifter should not need unnecessary navigation steps, repeated modal dismissals, or manual searching for the next input.

When an exercise's planned sets are complete, moving to the next exercise should feel similarly natural.

This pitch does not change the order of exercises in the training plan.

It improves navigation through that existing sequence.

### 4.9 Fewer modal hops

Logging should avoid opening additional dialogs for routine actions when those actions can be performed clearly within the existing logging experience.

Removing unnecessary modal transitions can reduce the effort required to record a workout.

However, this does not authorize removing safeguards from destructive actions, changing historical correction behavior, or bypassing required validation.

The design/spec stages should distinguish redundant interaction friction from necessary confirmations.

### 4.10 One-handed mobile usability

The exercise card should remain practical when operated with one hand.

The primary logging interactions should not require awkward reaching, repeated precision taps, or unnecessary movement between distant controls.

The previous Mobile Navigation improvements should already provide more horizontal room for training content.

This pitch uses that available space without redesigning the overall navigation architecture.

The design stage should evaluate representative phone-width layouts and common set-entry sequences.

### 4.11 Preserve canonical logging behavior

All confirmed workout writes must continue through the existing canonical logging path.

This pitch does not introduce an alternative way to store logged sets.

It must preserve:

* Account ownership and isolation.
* Existing exercise-type logging rules.
* Historical correction behavior.
* Gym-specific baseline behavior.
* Plan-versus-history separation.
* Progression calculations based on confirmed history.

The application must continue treating the planned session as a template rather than rewriting it whenever a set is logged.

The distinction between UI preparation and confirmed history is a central constraint of this pitch.

---

## 5. Primary user journeys

### Journey A — Repeating the same weight

1. A lifter opens today's workout.
2. They begin an exercise with multiple planned working sets.
3. The card provides relevant previous-performance context.
4. The lifter confirms their first set.
5. The same weight is conveniently available for the following set.
6. The lifter confirms the next set without retyping an unchanged weight.
7. The app advances naturally through the remaining sets.

Only explicitly confirmed sets enter workout history.

### Journey B — Changing weight between sets

1. A lifter confirms their first set.
2. The next set offers the previous weight as a starting value.
3. The lifter decides to increase or reduce the load.
4. They edit the proposed value.
5. They enter the performed reps.
6. They confirm the set.
7. The edited values are recorded.

The app does not force consecutive sets to use the same weight.

### Journey C — First-time exercise with no history

1. A lifter opens an exercise they have never logged.
2. No relevant previous-performance record is available.
3. The interface does not invent a previous weight.
4. The lifter enters the actual performed values.
5. They confirm the set.
6. The values are saved using existing logging rules.

The empty-history state remains clear and usable.

### Journey D — Machine exercise at a different gym

1. A lifter selects the gym where they are training.
2. They open a machine or cable exercise.
3. The card evaluates relevant previous-performance context according to the existing gym-specific rules.
4. A weight from another gym is not misleadingly presented as this gym's established working weight.
5. The lifter enters or confirms an appropriate load.
6. The set is recorded against the selected gym.

Existing baseline establishment and correction rules remain unchanged.

### Journey E — Reps-only bodyweight movement

1. A lifter opens a pure bodyweight exercise.
2. The card presents the existing reps-only logging interaction.
3. The lifter enters performed repetitions.
4. They confirm the set.
5. No external weight is required or fabricated.

The optimization must not reintroduce weight requirements for reps-only movements.

### Journey F — Logging a complete workout on a phone

1. A lifter opens today's session.
2. They use the mobile logging card to enter and confirm each set.
3. Keyboard behavior and input focus reduce repetitive interactions.
4. Completed sets are clearly identified.
5. Consecutive sets require fewer actions.
6. The lifter advances through exercises with minimal unnecessary navigation.
7. The workout history remains accurate.

The overall experience requires measurably fewer taps than the same representative workout in the prior interface.

### Journey G — Editing an existing logged set

1. A lifter opens a previously logged set.
2. The existing values remain distinguishable from suggestions or unconfirmed edits.
3. The lifter changes the relevant fields.
4. The normal historical correction flow persists the edit.
5. Any existing downstream recomputation or baseline behavior remains consistent with the established rules.

The new convenience features must not silently alter historical records.

---

## 6. In scope

This pitch includes the following improvements to the existing exercise logging experience:

 1. Clear previous-performance context.
 2. Safe prior-weight prefill.
 3. Quick reuse of the same weight across consecutive sets.
 4. Intelligent input focus.
 5. Improved numeric keyboard behavior.
 6. Larger touch targets.
 7. A clearer completed-set state.
 8. Smoother advancement between sets and exercises.
 9. Fewer unnecessary modal transitions.
10. Preserved one-handed usability.
11. Verification that these changes reduce ordinary set-entry actions without changing unconfirmed data.

The improvements should operate together as a coherent experience.

The necessary frontend, server-side, validation, and test changes belong within the pitch, subject to its protected write and data-integrity boundaries.

---

## 7. Out of scope

### Rest timer

A rest timer has already been considered and deliberately excluded from the roadmap.

Do not introduce one during logging optimization.

### New always-visible controls

The exercise card must not accumulate additional persistent buttons, shortcuts, or control groups merely to make some actions faster.

The card should remain visually restrained.

### RIR input

Reps-in-reserve logging belongs to Pitch 14 — RIR Logging & Autoregulation.

Do not add RIR fields or RIR-based recommendations here.

### Changes to the progression engine

Do not alter progress, hold, reactive deload, stall detection, e1RM, or scheduled deload rules.

### New recommendation intelligence

Do not introduce the more specific evidence-backed recommendations planned for Pitch 15.

Previous-performance context is not an independent recommendation engine.

### Automatic logging of unconfirmed values

No prefilled or reused value may create or modify a logged set without explicit confirmation.

### Automatic changes to planned sessions

Logging convenience must not rewrite planned weights, reps, exercise order, or training templates.

### Broad workout-card redesign

Do not replace the current logging model with a fundamentally different training workflow.

Refine the existing card rather than rebuilding the application around it.

### New exercise history pages

Detailed exercise-history and PR intelligence belong to a later pitch.

This pitch uses relevant prior performance for immediate logging context only.

### Changes to missed-day handling

Late logging, shifting, skipping, and related scheduling behavior remain governed by the existing implementation.

### Authentication and account management

Do not modify signup, password recovery, account deletion, or account ownership.

### External services

No third-party email services, analytics products, workout integrations, or external automation services.

---

## 8. Definition of done

The Pitch Roadmap provides three explicit completion criteria.

### AC-1 — Measurably fewer taps

A representative normal set-entry workflow requires fewer taps than it did before the changes.

The before-and-after comparison must use the same representative workout.

**Roadmap trace:** Faster Logging UX — Definition of done, criterion 1.

The design/spec stages should define the representative workflow and a repeatable measurement method.

The completed implementation must report the actual comparison.

### AC-2 — No additional always-visible controls

The exercise card does not gain additional always-visible controls.

The revised experience remains visually restrained.

**Roadmap trace:** Faster Logging UX — Definition of done, criterion 2.

The UI preview and final implementation should be evaluated against this requirement.

### AC-3 — Prefill never writes unconfirmed values

A prefilled weight must not create or modify logged history unless the lifter confirms the set.

The same rule applies when a previous set's weight is offered for reuse.

**Roadmap trace:** Faster Logging UX — Definition of done, criterion 3.

This is a data-integrity requirement, not merely a presentation detail.

### Supporting behavior

The roadmap's feature scope additionally requires:

* Previous-performance context.
* Quick same-weight reuse.
* Intelligent focus.
* Numeric keyboard behavior.
* Larger tap targets.
* Clearer completed states.
* Smoother set and exercise transitions.
* Fewer unnecessary modals.
* One-handed usability.

These must be demonstrated through the design/spec and final verification.

### PRD traceability note

The supplied PRD identifies faster logging as planned follow-on work and directs detailed scope to the Pitch Roadmap.

It does not provide a separately numbered Faster Logging UX acceptance-criteria section.

The three acceptance criteria above are therefore traced to the roadmap rather than represented as independently documented PRD criteria.

**Required upstream amendment:** Add the roadmap's three formal completion criteria and relevant failure states to the PRD if the project's documentation process requires a complete PRD-level acceptance mapping.

---

## 9. Rabbit holes

### 9.1 Mistaking prefilling for confirmed performance

A displayed weight can appear to be a real logged value even when the lifter has not performed the set.

If that value is written prematurely, the application may record an event that never occurred.

This would directly undermine the quality of Overload's training history.

The distinction between suggested values and confirmed values must be preserved throughout the logging flow.

### 9.2 Reusing the wrong gym's weight

Previous performance is not interchangeable between every machine or cable setup.

Speed optimizations must not override existing gym-specific working-weight rules.

A convenient but incorrect prefilling decision is not acceptable.

### 9.3 Optimizing one interaction while making the card busier

Adding another shortcut button may reduce one action but increase scanning effort and visual complexity.

The roadmap explicitly requires no additional always-visible controls.

The goal is fewer actions overall, not more UI affordances competing for attention.

### 9.4 Advancing too aggressively

Automatic advancement can save taps, but it must not prevent users from reviewing or correcting inputs.

Transitions should follow successful confirmation and preserve clear feedback about what was actually logged.

### 9.5 Breaking bodyweight logging

Pure bodyweight movements already use a reps-only workflow.

The new interactions must respect that distinction rather than applying weight-prefill behavior universally.

### 9.6 Changing canonical writes

A UI optimization may tempt the implementation to introduce local shortcuts that bypass the existing logging path.

That risks inconsistent history, account scoping, progression evaluation, and gym baselines.

All persisted changes must still follow the canonical data rules.

### 9.7 Over-optimizing for one device

An interaction that works well with a desktop keyboard may behave poorly with a phone's virtual numeric keyboard.

This pitch primarily benefits real-world mobile logging, so mobile interaction quality cannot be inferred solely from desktop testing.

### 9.8 Removing necessary safeguards

Fewer modal hops does not mean removing confirmation requirements for destructive actions or allowing accidental changes to historical records.

The design should remove redundant friction while keeping meaningful protections intact.

### 9.9 Losing track of set state

Pending, edited, prepared, and completed states must remain understandable.

Visual ambiguity around a set's persisted status creates the possibility of duplicate logging or missed sets.

### 9.10 Optimizing without measurement

A faster-looking card is not necessarily faster to use.

The team must compare equivalent workflows before and after implementation rather than relying exclusively on subjective judgments.

---

## 10. No-gos

* No rest timer.
* No extra always-visible card controls.
* No automatic write of unconfirmed prefilled values.
* No automatic confirmation of subsequent sets.
* No cross-gym machine-weight assumptions.
* No fabricated historical performance.
* No changes to the progression algorithm.
* No changes to baseline thresholds or correction rules.
* No rewriting the planned session during logging.
* No RIR input or autoregulation.
* No exercise-history page redesign.
* No new workout scheduling behavior.
* No independent logging persistence path.
* No loss of reps-only bodyweight behavior.
* No removal of necessary historical-edit safeguards.
* No authentication or account-ownership changes.
* No third-party email-service integration.

---

## 11. Dependencies

### Guided Workout Logging — Pitch 4

This is the primary functional dependency.

The pitch refines the existing logging experience and must preserve its canonical persisted-write behavior.

### Library & Gyms Setup — Pitch 2

Previous-performance context and prefill must respect exercise type and gym-specific working-weight behavior.

### Progressive Overload Engine — Pitch 5

The existing engine depends on accurate logged history.

This pitch must preserve that history and avoid changing progression calculations.

### Multi-User Foundation — Pitch 8

In the current build sequence, logging operates within private per-account data.

Any new reads or writes introduced by this pitch must use the established account-scoped mechanisms.

### Personalization & Navigation Polish — Pitch 10

The revised mobile navigation gives workout content more room.

Faster Logging UX should use the established responsive application layout.

### Onboarding Tour — Pitch 11

The tour already includes guidance for the workout logging card.

If logging behavior changes enough that its existing guidance is incorrect, the guidance step should be updated.

The core tour mechanism must remain unchanged.

### What's New — Pitch 12

The new logging experience is a visible change that warrants release communication.

This pitch should include a final guidance ticket using `/overload-onboarding`, provided both mechanisms have shipped.

### Downstream dependency: RIR Logging & Autoregulation

Pitch 14 introduces an optional RIR input alongside the existing set-entry workflow.

The logging experience delivered here should remain clean and maintainable so later RIR support does not undo its usability improvements.

Do not implement RIR as part of this pitch.

---

## 12. User guidance and release notes

This is the first planned pitch after both Onboarding Tour and What's New.

Consequently, it should include a final guidance ticket invoking the project's `/overload-onboarding` skill.

### Tour-step decision

The existing tour should already have a workout logging card step.

The faster logging changes do not inherently introduce a new primary application destination.

The supplied skill's rubric indicates that a performance or interaction improvement does not warrant another tour step if the existing step still accurately explains the control.

**Expected outcome:** No new tour step unless the approved UI design introduces a genuinely new discoverable control or invalidates the existing logging-card guidance.

The skill makes the final decision using the completed design and the actual shipped tour mechanism.

If no change is needed, record why.

### Release-note entry

Faster Logging UX noticeably improves a primary training workflow.

The `/overload-onboarding` skill should create a significant release-note entry describing the faster interaction in language appropriate for lifters.

Illustrative copy:

**Faster workout logging**

"Logging sets takes fewer taps. Reuse your working weight across sets, see your previous performance, and move through your workout more smoothly."

The exact shipped entry should reflect the actual completed behavior rather than promising unimplemented details.

The shipping date must not be invented or backdated.

### Maintenance boundaries

The guidance ticket:

* Uses the existing tour registry and What's New content format.
* Does not rebuild either feature.
* Does not edit core tour or release-note presentation components merely to add content.
* Does not create duplicate registries.
* Verifies updated guidance on phone and desktop.
* Confirms release-note visibility through the existing mechanism.

Guidance maintenance remains a small, final implementation ticket after the principal logging changes.

---

## 13. Risks and verification focus

### Logging integrity

The highest-risk behavior is an unconfirmed prefilled or reused value reaching persisted history.

Tests must distinguish a prepared value from an explicitly confirmed logged set.

### Gym-context correctness

Previous-performance data and weight reuse must respect the existing differences between machine/cable and free-weight exercises.

### Account isolation

Previous-performance lookup and logged-set writes must remain scoped to the authenticated lifter.

### Historical corrections

Editing an existing logged set must continue to use the established correction behavior without silent overwrites.

### Progression and baselines

The same confirmed training history must yield the same progression and baseline behavior as before this pitch.

Any existing standing invariant tests must remain green.

### Tap-count improvement

Verification must include the required before-and-after measurement using the same representative workout.

The run report should include the observed numbers and methodology rather than a qualitative claim alone.

### Mobile usability

Verify touch targets, input focus, and keyboard behavior using representative phone-width interactions.

### UI restraint

Ensure that the completed exercise card has no additional always-visible controls and follows the approved preview.

### User guidance

Ensure the guidance ticket evaluates the existing tour step and creates the appropriate release-note entry using the established mechanisms.

---

## 14. Open questions and source gaps

### Design-stage decisions

The following belong to `/overload-design-doc` and `/overload-ui-design`:

* Exact previous-performance placement and wording.
* How suggested and confirmed values are visually distinguished.
* Set-state styling.
* Focus and keyboard progression.
* Touch-target refinements.
* Navigation transitions.
* Removal or consolidation of redundant modals.
* Responsive behavior across phone and desktop.

The design must preserve the prohibition on additional always-visible controls.

### Spec-stage decisions

The following belong to `/overload-spec`:

* How relevant prior performance is selected using established exercise and gym rules.
* How proposed values remain separate from confirmed persisted values.
* How consecutive-set reuse interacts with validation.
* How the canonical logging path is preserved.
* How tap counts are measured consistently.
* How focus and submission behavior are verified.
* How account isolation and historical editing are tested.

These are technical design decisions, not new product-scope questions.

### Existing standing decisions

Do not reopen already approved decisions about:

* Canonical logged-set writes.
* Machine/cable versus free-weight gym context.
* Reps-only pure bodyweight logging.
* Baseline correction rules.
* Progression thresholds.
* Account ownership and isolation.
* The deliberate exclusion of a rest timer.

The governing repository specifications and `method-note.md` remain authoritative for their established details.

### PRD acceptance gap

The PRD does not currently enumerate Faster Logging UX's three acceptance criteria in its formal feature-acceptance sections.

The roadmap does.

Record the necessary PRD amendment without inventing undocumented acceptance criteria.

---

## 15. Rollout and delivery boundary

This is a UI-bearing pitch with a protected data-write surface.

The standard pipeline remains:

**Pitch → Design Doc → UI Preview → Spec → Linear Tickets → Implementation → Review → Audit → Final Verification**

### Design doc

`/overload-design-doc` establishes the improved set-entry experience, representative workflows, failure states, and User guidance expectations.

### UI preview

`/overload-ui-design` creates the binding visual preview showing previous-performance context, prepared inputs, confirmed sets, consecutive-set reuse, and relevant phone/desktop interactions.

The preview must demonstrate the card without adding always-visible controls.

### Spec

`/overload-spec` translates the approved behavior into implementation requirements and verification.

### Ticket implementation

`/overload-ticket-worker` implements the improvements through coherent end-to-end tickets.

The final ticket invokes `/overload-onboarding` for tour and release-note maintenance, assuming both prerequisite mechanisms have shipped.

### Merge behavior — stop before merge

The pipeline guide explicitly identifies Faster Logging UX as **stop before merge** because prefill changes what may be written to logged history.

Even if all automated checks pass, the feature PR must remain open for human approval.

The autonomous pipeline may integrate ticket PRs into the feature branch, complete review and audit, and run verification.

It must not merge the final feature PR into `main` without the required approval.

### Production safety

No autonomous run may apply production migrations, enable production signup, or directly alter production records or credentials.

Any necessary human-operated action belongs in the runbook.

---

## 16. Handoff to design and spec

The following product outcomes are fixed:

 1. Ordinary set logging requires measurably fewer taps.
 2. Relevant previous performance is easy to see.
 3. Existing weights can be safely offered as prefilled values.
 4. Consecutive sets can conveniently reuse the same weight.
 5. Prefilled values never reach history until explicitly confirmed.
 6. Focus and numeric keyboard behavior support efficient input.
 7. Touch targets work comfortably on a phone.
 8. Pending and completed sets remain clearly distinguishable.
 9. Set-to-set and exercise-to-exercise movement is smoother.
10. Unnecessary modal transitions are reduced.
11. The exercise card gains no additional always-visible controls.
12. Existing bodyweight, gym-context, history, progression, and account-isolation rules remain intact.
13. No rest timer or RIR features are introduced.
14. A final guidance ticket uses `/overload-onboarding` to maintain the shipped tour and release notes.
15. The feature PR stops before merge for human approval.

Detailed interface behavior belongs to the design and UI-preview skills.

Implementation details belong to the spec and ticket-worker skills.

Do not introduce alternative persistence behavior or unrelated training features while optimizing the interaction.

**Completion outcome:** Overload's logging card makes normal workout recording meaningfully faster, more comfortable, and less repetitive while preserving accurate, explicitly confirmed training history.

**End of pitch.**
