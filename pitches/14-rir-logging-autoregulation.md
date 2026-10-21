# Overload — Pitch 14: RIR Logging & Autoregulation

> Verbatim copy of the Linear document "Overload — Pitch 14: RIR Logging & Autoregulation" (Overload V1, doc `24ce6a7a-4b5a-4dd7-92e8-cdd99cd771f2`, updated 2026-10-21). Linear is the source of truth.

**Type:** Feature
**Status:** Planned
**Phase:** MVP 3 — Training Intelligence
**Appetite:** L — Large
**Depends on:** Pitch 5 — Progressive Overload Engine
**UI-bearing:** Yes
**Default merge behavior:** Stop before merge

---

## 1. Problem

Overload's core purpose is to help lifters determine when to progress, hold, or deload based on their training performance.

Today, its rule-based progression engine evaluates logged weights and repetitions against the lifter's planned rep ranges, supported by estimated one-rep-max trends and established progression thresholds.

That provides a useful, deterministic foundation.

However, weight and repetitions do not communicate everything about the difficulty of a set.

Consider two lifters performing the same exercise with the same weight for the same number of repetitions.

One lifter finishes the set knowing they could have performed three additional repetitions.

The other reaches the same repetition count but believes they could not have completed another repetition.

The numerical result is identical, but the effort required was different.

This distinction also occurs within a single lifter's training.

A weight that previously felt manageable may become difficult because of accumulated fatigue, insufficient recovery, or changes in performance.

Conversely, a lifter may complete the planned repetitions comfortably and have substantial capacity remaining.

Without an effort-related signal, Overload cannot directly distinguish those situations from the logged weight and rep count alone.

Its existing progression rules still work, but the engine is missing information that could make its decisions more sensitive to the lifter's actual performance.

The product needs a way to capture that information without creating a slower or more complicated logging experience.

**Reps in reserve (RIR)** provides a practical, self-reported measure of effort.

A lifter estimates how many additional repetitions they could have completed before reaching failure.

For example:

* **0 RIR:** No additional complete repetition was available.
* **1 RIR:** Approximately one additional repetition was available.
* **2 RIR:** Approximately two additional repetitions were available.
* **3 RIR:** Approximately three additional repetitions were available.

This is a subjective estimate, not a directly measured physiological quantity. It can still provide useful context when interpreted conservatively.

Overload should use that context alongside its existing deterministic rules rather than replacing the entire progression system.

This pitch introduces optional per-set RIR logging and extends progression evaluation to account for it.

---

## 2. Appetite

**L — Large**

Although the visible feature is a compact optional input, this pitch changes two critical parts of Overload:

1. The information recorded for each performed set.
2. The evidence considered by the progression engine.

That creates a wider integration surface than an ordinary logging-interface improvement.

The feature must work with the existing workout card, persisted training history, historical edits, bodyweight exercises, gym-specific progression, scheduled deloads, and reactive progression decisions.

It must also work when some sets include RIR and others do not.

Most importantly, the feature must change progression outcomes in a deterministic, explainable way rather than merely collecting an unused value.

The large appetite is justified by the effect on both historical data and training recommendations.

However, the scope is bounded to **optional RIR capture and its incorporation into the existing progression engine**.

This is not permission to build an entirely new autoregulation platform.

Do not split RIR storage and RIR-aware recommendations into separate pitches. They form one end-to-end capability whose value depends on both working together.

---

## 3. Value delivered

When this pitch is complete, Overload understands more than whether a lifter completed the prescribed number of repetitions.

It can also consider how close the lifter believed they were to muscular failure.

That additional signal allows progression decisions to distinguish between situations that previously looked identical based on weight and reps alone.

The lifter remains in control.

They can record RIR when they want to, ignore it when they do not, and continue using their existing training plan.

The application does not require RIR, infer values they never entered, or retroactively assign effort estimates to old workouts.

The engine stays deterministic, and its decisions remain traceable to recorded performance.

The outcome is a more informed progression system without compromising the simplicity of workout logging.

---

## 4. Solution shape

### 4.1 Optional RIR input on each set

The existing exercise logging card gains a compact RIR selector positioned near the repetition input.

RIR is recorded for an individual performed set.

It is not a property of an entire workout, exercise, or mesocycle.

Each set can therefore carry its own effort estimate.

A lifter may report different RIR values across successive sets of the same exercise.

The selector should make entering RIR straightforward without requiring an additional dialog or a separate logging workflow.

**RIR is always optional.**

The lifter must be able to confirm a set without entering it.

The absence of RIR must not appear as a validation error, incomplete set, or unmet requirement.

The exact selector style, range of selectable values, labels, and touch interactions belong to the design and spec stages.

The UI should favor a compact interaction that respects the Faster Logging UX work delivered in Pitch 13.

### 4.2 RIR meaning and data integrity

RIR represents the lifter's estimate of additional repetitions available at the end of a performed set.

It must remain distinguishable from the number of repetitions actually completed.

For example, recording eight reps with two RIR means the lifter completed eight repetitions and estimated that approximately two more were possible.

It does not mean they performed ten repetitions.

RIR must not be silently added to recorded reps, automatically converted into additional completed volume, or treated as an independently logged performance event.

The application should make the input understandable without requiring a detailed explanation every time a set is logged.

An unset RIR value means the lifter did not provide an effort estimate.

**Missing RIR is not equivalent to zero RIR.**

Zero is a meaningful reported value indicating no additional repetitions were estimated to remain.

This distinction must be preserved throughout the logging experience and progression evaluation.

### 4.3 Preserve fast set logging

Pitch 13 establishes a faster workout logging experience with previous-performance context, safe weight prefill, consecutive-set reuse, improved focus, and smoother transitions.

RIR must fit into that workflow rather than undoing it.

A lifter who does not want to log RIR should be able to continue entering weight and reps through essentially the same interaction sequence.

The new selector should not introduce a mandatory extra tap.

Likewise, a lifter who chooses to record RIR should be able to do so without navigating away from the active set.

The initial design should prioritize ease of use on a phone.

The card must remain visually restrained.

The objective is more useful training information with minimal additional interaction cost.

### 4.4 Bodyweight logging with optional RIR

Pure bodyweight exercises already use a reps-only logging workflow.

This pitch preserves that behavior.

A bodyweight set can be recorded as:

* Performed repetitions.
* Optional RIR.

No external weight must be required for a pure bodyweight movement merely because RIR is available.

For example, a lifter may log twelve pull-ups with one RIR, or twelve pull-ups without reporting RIR.

Both are valid.

The existing exercise equipment classification and logging rules remain authoritative.

This pitch must not accidentally convert reps-only exercises into weight-and-reps exercises.

### 4.5 RIR within the existing progression engine

The current progression engine evaluates actual performance against planned rep ranges using established rules.

It can classify a lift as ready to progress, determine that the lifter should hold, or identify circumstances warranting a reactive deload.

It also uses estimated one-rep-max trends as a secondary signal for detecting stalls.

This pitch introduces RIR as **one additional input to that existing evaluation**.

The engine should not discard weight, repetitions, planned rep ranges, or established progression history.

Instead, reported RIR can qualify or modify an outcome when effort information makes a material difference to the interpretation of performance.

The roadmap explicitly delegates the exact qualification rules to the design and spec stages.

Those stages must determine, and document, how RIR interacts with:

* Progress decisions.
* Hold decisions.
* Reactive deload decisions.
* Stall detection.

The behavior must be deterministic.

The same validated inputs and training context must produce the same result.

There must be no opaque learned model, probabilistic recommendation system, or unexplained adjustment.

### 4.6 Progress decisions

RIR can provide additional context when the lifter meets the planned repetition target.

Reaching the top of a rep range at a comfortable effort and reaching that same number at the limit of available effort are not identical situations.

The RIR-aware progression rules should be able to distinguish materially different effort states when appropriate.

However, this pitch does not prescribe that a specific RIR number automatically causes or prevents progression.

For example, it would be premature to establish a universal rule that two RIR always permits an increase or zero RIR always prevents one.

Those decisions must be resolved by the design/spec process against the existing progression engine and documented training methodology.

The governing principle is that RIR should inform progression, not replace the evidence from actual performance.

### 4.7 Hold decisions

RIR may help the engine recognize when maintaining the current load is appropriate.

A lifter could be meeting the planned repetitions while reporting substantial effort, or could be approaching the planned target while reporting that repetitions remain available.

The engine should be capable of considering these differences under its documented rules.

The goal is not to increase the frequency of recommendations for its own sake.

A normal hold should remain a valid outcome.

The existing behavior of leaving an ordinary hold untagged must not be unnecessarily replaced with extra status indicators or noisy warnings.

### 4.8 Reactive deload decisions

The existing reactive deload behavior identifies performance difficulties according to established thresholds.

RIR can contribute additional information about effort and difficulty, but should not become an automatic deload trigger simply because the lifter reports one difficult set.

The design/spec must determine the evidence needed for RIR to modify reactive deload behavior.

That determination should respect the current engine's approach to repeated performance and trends.

The purpose is to improve interpretation, not make the engine unstable or excessively reactive to a subjective value.

### 4.9 Stall detection

Overload currently uses an e1RM trend as a secondary stall-detection signal.

RIR may provide additional context when evaluating a potential stall.

The design/spec should define its relationship to existing trend evidence without inventing a separate, opaque fatigue score or recovery model.

RIR must not silently alter how logged weight and reps are interpreted as actual performed data.

The existing e1RM formula and trend behavior should remain consistent unless an approved rule explicitly requires otherwise.

### 4.10 Scheduled deload protection

Overload distinguishes between reactive deload recommendations and scheduled deload weeks.

During a scheduled deload week, the reactive per-exercise progression and deload evaluation is suppressed.

That protection remains in force.

Introducing RIR must not reopen reactive progression decisions simply because the lifter records an effort estimate during a scheduled deload.

A lifter may still log RIR as part of a performed set, but the existing scheduled-deload suppression rules remain authoritative.

This pitch does not change mesocycle deload scheduling or planned load reductions.

### 4.11 Mixed history with and without RIR

This is one of the most important requirements.

Overload already contains workout history recorded before RIR existed.

Even after this feature ships, some lifters will choose not to record RIR for every set.

The progression engine must handle both forms of history together.

Historical sets without RIR remain valid.

They must not be treated as malformed, incomplete, or ineligible simply because they lack effort information.

The engine should use the RIR signal when valid values are available and continue to evaluate the remaining history under the established rules.

The precise treatment of mixed histories belongs to the spec.

The requirements are:

* Missing RIR must not be invented.
* Existing history must remain usable.
* No mandatory backfill is introduced.
* Adding optional RIR must not break evaluation of older workouts.
* The resulting progression decisions remain deterministic and understandable.

### 4.12 Editing historical RIR

Overload already supports editing historical logged sets.

Because progression decisions are derived from logged performance rather than stored as authoritative tags, correcting historical training information can change the current recommendation.

RIR should participate in that existing behavior.

When a lifter changes or clears an RIR value on a previously logged set, subsequent evaluation should reflect the updated historical evidence.

The change must remain scoped to the authenticated lifter and follow the application's canonical historical correction behavior.

The spec must handle this without introducing a separate stored recommendation state or a background system for maintaining progression tags.

### 4.13 Gym-specific context

Machine and cable exercises may have separate working-weight baselines across gyms.

Adding RIR must not collapse those distinctions.

Progression evaluation should continue respecting the established gym-specific rules when interpreting loads.

An effort estimate associated with a set at one gym must not cause the engine to treat physically different machines as universally interchangeable.

The existing equipment classification and baseline correction behavior remain authoritative.

RIR is an additional performance signal, not a replacement for gym context.

### 4.14 Explainable RIR influence

The roadmap requires RIR-aware outcomes to be deterministic and explainable.

A lifter should be able to understand when reported effort influenced a progression decision.

The resulting explanation must accurately correspond to the rule that was applied.

However, this pitch should not expand into the comprehensive recommendation-copy redesign planned for Pitch 15.

Pitch 14 establishes the correct underlying RIR-aware decisions and sufficient interpretability to verify them.

Pitch 15 builds on this by presenting more specific, actionable recommendation text and concise evidence lines throughout the product.

The two pitches must remain distinct.

### 4.15 Preserve the established training model

RIR does not change the core structure of Overload.

The lifter still:

1. Builds their own training plan.
2. Performs scheduled sessions.
3. Logs actual weights and repetitions.
4. Optionally records RIR.
5. Receives progression evaluation based on their recorded performance.

The app does not begin automatically generating workout programs, rewriting the plan, or changing stored working weights in response to RIR.

The plan remains the lifter's plan.

The progression engine remains advisory and deterministic.

---

## 5. Primary user journeys

### Journey A — Logging a set with RIR

1. A lifter opens today's workout.
2. They open an exercise logging card.
3. They enter or confirm their performed weight and repetitions.
4. They select a value representing their estimated RIR.
5. They confirm the set.
6. The set is saved with the reported effort information.
7. Future progression evaluation can use that RIR alongside the recorded performance.

The RIR input does not replace weight or repetitions.

### Journey B — Logging without RIR

1. A lifter opens an exercise.
2. They enter or confirm weight and reps through the existing fast logging workflow.
3. They leave RIR unset.
4. They confirm the set.
5. The set is saved successfully.
6. The existing training engine continues evaluating the result using available information.

No additional mandatory step is introduced.

### Journey C — Different effort at the same performance

1. A lifter performs an exercise for the same weight and repetition count in two otherwise comparable situations.
2. One set is reported with relatively high RIR.
3. Another is reported with relatively low RIR.
4. The engine evaluates the training evidence using its documented RIR rules.
5. Where the effort difference meets the rule's qualifying conditions, the resulting recommendation can differ.
6. The rule responsible for the difference can be explained.

This journey demonstrates the actual value of RIR-aware progression.

### Journey D — Reviewing historical workouts

1. A lifter has several months of existing training history without RIR.
2. They begin logging optional RIR on new sets.
3. The engine evaluates older and newer records together.
4. No old workout is automatically assigned an effort estimate.
5. Existing training history remains usable.

### Journey E — Correcting a past RIR entry

1. A lifter opens a previously completed workout.
2. They notice an incorrect RIR value.
3. They edit or clear the effort estimate through the existing historical editing experience.
4. The corrected value is persisted.
5. Progression evaluation reflects the corrected evidence.

The edit must not silently overwrite unrelated set information.

### Journey F — Bodyweight exercise

1. A lifter opens a pure bodyweight movement.
2. They enter their performed repetitions.
3. They optionally record RIR.
4. They confirm the set.
5. The set is saved without requiring an external weight.

The existing reps-only workflow is preserved.

### Journey G — Scheduled deload week

1. The lifter reaches their mesocycle's scheduled deload week.
2. They complete and log a lighter session.
3. They optionally record RIR for performed sets.
4. The scheduled-deload rules remain active.
5. Reactive progression and deload recommendations stay suppressed as previously required.

### Journey H — Returning to a gym with different machines

1. A lifter selects the gym where they are training.
2. They complete a machine exercise and record weight, reps, and optional RIR.
3. The engine evaluates performance using the applicable equipment and gym context.
4. RIR may inform the progression decision.
5. Existing gym-specific baseline rules remain intact.

---

## 6. In scope

This pitch contains one end-to-end feature: **RIR Logging & Autoregulation**.

It includes:

* Optional RIR entry for individual logged sets.
* A compact RIR selector near repetitions.
* Weight-and-reps logging with optional RIR.
* Reps-only bodyweight logging with optional RIR.
* Correct distinction between missing RIR and an explicitly entered zero.
* Persistence of confirmed RIR alongside logged performance.
* Historical correction of RIR where logged sets can be edited.
* RIR as an additional signal in the existing progression engine.
* Deterministic rules governing the influence of RIR on progress, hold, reactive deload, and stall behavior.
* Compatibility with mixed histories containing sets with and without RIR.
* Preservation of scheduled-deload suppression.
* Preservation of gym-specific training context.
* Explainable outcomes when RIR materially influences a decision.
* Verification that ordinary logging is not meaningfully slower when RIR is omitted.
* Required user-guidance maintenance through `/overload-onboarding`.

The feature must be complete from the logging interface through persisted history and progression evaluation.

---

## 7. Out of scope

### Mandatory RIR logging

RIR remains optional for every set.

No training plan, exercise, or workout may require it.

### Historical RIR backfill

Do not assign RIR estimates to previous sets that were logged without them.

Do not infer historical RIR from repetitions, weights, or e1RM trends.

### AI-driven autoregulation

No machine learning, adaptive AI agent, hidden training model, or black-box effort analysis.

### Automatic plan modifications

RIR does not authorize editing planned sets, rep ranges, exercise order, or stored working weights.

### Full recommendation-copy redesign

Specific progression instructions and comprehensive evidence lines belong to Pitch 15 — Smarter & Explainable Progression.

### New fatigue and recovery tracking

No readiness questionnaires, sleep tracking, soreness scores, fatigue surveys, or recovery dashboards.

### Changes to scheduled deload configuration

Existing scheduled-deload weeks and suppression behavior remain unchanged.

### Automatic workout generation

Overload remains plan-first and does not begin generating sessions or exercise programs.

### New exercise history or PR pages

Detailed exercise history and personal-record intelligence belong to Pitch 16.

### Rest timer

The previously excluded rest timer remains out of scope.

### RIR analytics dashboard

This pitch adds RIR to logging and progression evaluation.

It does not create a standalone effort-tracking analytics area.

### New external services

No third-party autoregulation service, coaching platform, email provider, or analytics integration.

---

## 8. Definition of done

The Pitch Roadmap provides three explicit completion criteria.

### AC-1 — Optional RIR without meaningful slowdown

A lifter can log a set with or without RIR.

Leaving RIR unset does not meaningfully slow the logging workflow or prevent completion.

**Source:** Pitch Roadmap — RIR Logging & Autoregulation, Definition of Done 1.

The design/spec stages should define a repeatable way to evaluate the interaction cost relative to the completed Faster Logging UX experience.

### AC-2 — Mixed historical evaluation

Training history containing sets without RIR and sets with RIR evaluates correctly together.

Legacy records remain valid and are not assigned invented effort estimates.

**Source:** Pitch Roadmap — RIR Logging & Autoregulation, Definition of Done 2.

### AC-3 — RIR can change an explainable outcome

The same repetition performance at different reported RIR values can produce different, explainable progression outcomes when the documented rules make RIR relevant.

**Source:** Pitch Roadmap — RIR Logging & Autoregulation, Definition of Done 3.

The difference must result from deterministic, documented evaluation rather than opaque scoring.

### Supporting roadmap requirements

The roadmap additionally specifies:

* Per-set optional RIR.
* A compact selector near reps.
* Reps plus optional RIR for bodyweight exercises.
* RIR alongside existing progression rules.
* Deterministic and explainable behavior.
* No historical backfill.
* No mandatory RIR.
* No AI-driven autoregulation.

These are binding scope requirements.

### PRD traceability gap

The supplied PRD identifies RIR logging and autoregulation as planned follow-on work, but does not provide a dedicated, separately numbered acceptance-criteria section for Pitch 14.

The formal criteria above are therefore traced to the Pitch Roadmap rather than misattributed to the PRD.

**Required upstream amendment:** Add Pitch 14's three acceptance criteria and relevant failure states to the PRD if complete PRD-level traceability is required.

---

## 9. Rabbit holes

### 9.1 Turning optional RIR into a required input

RIR may improve progression decisions, but not every lifter wants to estimate effort on every set.

Making it required would introduce friction into the core logging workflow.

The engine must function correctly when RIR is absent.

### 9.2 Treating missing RIR as zero

This would falsely imply that every historical set without RIR had been performed to the limit.

The distinction between unset and zero is fundamental.

### 9.3 Using RIR as an absolute truth

RIR is a subjective estimate.

It can be misjudged and may vary in accuracy depending on the lifter, exercise, and effort level.

The engine should incorporate RIR conservatively rather than treating it as an infallible measurement.

### 9.4 Replacing the progression engine

The existing engine already contains established rules for progression thresholds, reactive deloads, scheduled deloads, and stall detection.

This pitch adds effort-related evidence.

It does not authorize discarding the existing engine and replacing it with an unrelated autoregulation model.

### 9.5 Overreacting to individual sets

One difficult or easy set does not necessarily establish a lasting performance trend.

The design/spec must determine how RIR affects decisions without introducing erratic recommendations.

### 9.6 Ignoring incomplete RIR coverage

Some workouts may have RIR recorded for every set, others for only one set, and others not at all.

The engine must define how partial effort information influences evaluation.

It must not silently assume the missing values resemble the recorded ones.

### 9.7 Breaking historical edits

Because recommendations are derived from history, editing an old RIR value may legitimately change the current recommendation.

The implementation must preserve that dependency without adding conflicting stored recommendation state.

### 9.8 Bypassing the canonical logging path

Adding another recorded field can tempt an implementation to create a parallel write mechanism.

That risks divergence between actual set history and progression evaluation.

RIR must participate in the established logged-set lifecycle.

### 9.9 Damaging gym-specific baselines

Subjective effort should not cause the application to reinterpret different machines as equivalent.

Gym-specific working-weight and baseline correction behavior remain separate concerns.

### 9.10 Slowing the workout card

Adding an input should not undo the tap-count, focus, and one-handed usability improvements from Pitch 13.

The RIR control must remain compact and optional.

### 9.11 Building Pitch 15 early

Once RIR influences progression, it may be tempting to redesign every recommendation message.

This pitch needs understandable outcomes, but the broader actionable-recommendation presentation belongs to the next pitch.

### 9.12 Expanding into recovery science

RIR can relate to training effort and fatigue, but this pitch does not establish a general model of recovery readiness.

Do not add unrelated physiological inputs or recovery recommendations.

---

## 10. No-gos

* No required RIR values.
* No backfilled or inferred historical RIR.
* No treating missing RIR as zero.
* No AI-driven or opaque autoregulation model.
* No independent second progression engine.
* No rewriting established progression thresholds without an approved rationale.
* No automatic alteration of a training plan.
* No stored recommendation tags that diverge from logged history.
* No change to the scheduled-deload suppression rule.
* No cross-gym machine-weight assumptions.
* No corruption of gym-specific baselines.
* No loss of reps-only bodyweight logging.
* No significant slowdown to logging when RIR is omitted.
* No rest timer.
* No recovery questionnaire or readiness score.
* No complete recommendation UI overhaul.
* No new analytics dashboard.
* No unrelated account or authentication changes.
* No third-party email services.

---

## 11. Dependencies

### Pitch 5 — Progressive Overload Engine

This is the formal roadmap dependency.

Pitch 14 extends the existing progression engine rather than introducing a replacement.

The governing progression thresholds and methods must be read from the controlling specification, current implementation, and `method-note.md`.

### Pitch 4 — Guided Workout Logging

RIR is recorded as part of a logged set.

The existing canonical logging and historical correction paths are required.

### Pitch 13 — Faster Logging UX

In the current build order, Pitch 13 establishes the optimized logging experience that Pitch 14 must preserve.

The roadmap's formal dependency map identifies Pitch 5, not Pitch 13, as Pitch 14's direct prerequisite. However, the latest build sequence makes Pitch 13 the relevant UI baseline.

This is a sequencing consideration, not a reason to introduce unrelated functionality.

### Gym Management and Gym-Specific Weight Tracking

Machine and cable exercise history must retain the existing gym-specific interpretation.

### Scheduled Deload

Reactive progression decisions remain suppressed during scheduled deload weeks.

### Account Ownership & Isolation

All RIR values and associated training history remain private to the authenticated lifter.

Any new account-owned state must follow the existing ownership model.

### Onboarding Tour and What's New

Both mechanisms should already exist at this point in the roadmap.

Pitch 14 must include a guidance-maintenance ticket using `/overload-onboarding`.

### Downstream: Pitch 15 — Smarter & Explainable Progression

Pitch 15 will consume RIR-aware decisions where available and present more actionable recommendations and evidence.

The rule behavior established here must be understandable and stable enough for that work to build upon it.

---

## 12. User guidance and release notes

This pitch introduces a new, optional control in the primary logging interface.

It therefore requires a final User Guidance ticket using `/overload-onboarding`, assuming Onboarding Tour and What's New have shipped.

### Tour-step assessment

RIR is a new input that lifters may need to discover.

The skill should inspect the existing workout logging tour step and determine whether:

* The existing step should be updated to mention optional RIR.
* A new step is warranted because the control introduces a meaningfully distinct interaction.
* No tour update is necessary because the existing guidance already explains the workflow adequately.

The skill's rubric governs the decision.

Do not automatically add a separate tour step merely because a new field was added.

### Release-note entry

This feature introduces a meaningful training capability and should ordinarily receive a significant What's New entry.

Illustrative content:

**RIR-aware progression**

"You can now record reps in reserve when logging a set. Overload uses that effort information alongside your weights and reps to help evaluate when to progress, hold, or deload."

The actual entry must reflect the completed functionality.

Use the shipping date, not a guessed development date.

### Guidance verification

The guidance ticket must use the existing tour registry and release-note content mechanism.

It must verify applicable guidance on phone and desktop, respect appearance modes, and avoid modifying the core tour or modal simply to add an entry.

The guidance ticket belongs at the end of the pitch's implementation sequence.

---

## 13. Risks and verification focus

### Historical data integrity

Existing sets without RIR must remain unchanged.

No migration or application behavior may fabricate RIR values for historical workouts.

### Correct RIR representation

Missing, zero, and positive RIR values must retain their distinct meanings.

Invalid inputs must not reach recorded history.

### Canonical set writes

RIR must be saved and corrected through the established logged-set lifecycle.

A proposed or unconfirmed RIR value must not alter persisted records.

### Mixed-history progression

The engine must evaluate combinations of reported and missing RIR correctly.

Historical records without effort data remain usable.

### Deterministic recommendations

The same relevant inputs must produce identical outcomes.

Tests should cover cases in which RIR affects the recommendation and cases where it does not.

### Existing progression invariants

The established rep-range thresholds, e1RM trend, stall behavior, historical corrections, and scheduled-deload suppression must remain internally consistent.

### Gym-specific behavior

Machine and cable movements must continue using the established gym-context rules.

### Bodyweight compatibility

Reps-only bodyweight logging must work with and without optional RIR.

### Logging usability

The new input must not meaningfully worsen the ordinary no-RIR logging experience.

### Account isolation

One lifter's RIR and training history must not become accessible to another account.

### Guidance maintenance

The final guidance ticket must produce an appropriate release-note entry and evaluate whether the existing tour needs updating.

---

## 14. Open questions and source gaps

### Decisions delegated to design and spec

The roadmap explicitly leaves the following behavior to the downstream design/spec process:

**RIR values and input presentation**

The selectable values, display labels, and precise interaction behavior need to be established.

**Progression qualification**

The rules governing when RIR supports, qualifies, or changes a progress decision must be defined.

**Hold behavior**

The circumstances under which reported effort changes or preserves a hold decision must be defined.

**Reactive deload behavior**

The engine must determine how subjective difficulty contributes to an existing reactive deload without becoming overly sensitive.

**Stall behavior**

The relationship between RIR and existing e1RM-based stall detection must be defined.

**Mixed-history treatment**

The rules must specify how partially reported RIR contributes to an evaluation involving missing values.

These are genuine implementation and algorithm-design decisions intentionally left open in the roadmap.

This pitch should not invent numerical thresholds to close them.

The spec must record their resolution, rationale, and authority.

### Existing decisions that must not be reopened

The following are already governed by earlier work:

* Progression thresholds.
* e1RM calculation.
* Scheduled-deload suppression.
* Gym-variable equipment classification.
* Gym baseline correction rules.
* Bodyweight logging.
* Historical correction behavior.
* Account isolation.
* Canonical logged-set persistence.

Consult the existing specifications and implementation for their current values.

### PRD acceptance gap

The PRD does not contain a dedicated formal acceptance-criteria section for RIR Logging & Autoregulation.

Use the Pitch Roadmap's three definition-of-done criteria as the supported source.

Record the PRD traceability gap for upstream maintenance.

### Scope and appetite assessment

The large appetite is justified by the change to the progression engine, not by the size of the visible RIR selector.

If the design process reveals that the required algorithm cannot be implemented consistently with the existing rules, do not silently simplify it into RIR storage alone.

That would fail to deliver the roadmap's intended user value.

Instead, record the constraint and apply the project's established decision and stop policies.

---

## 15. Rollout and delivery boundary

This is a UI-bearing feature that changes both logged-set persistence and progression evaluation.

The required artifact sequence is:

**Pitch → Design Doc → UI Preview → Spec → Linear Tickets → Implementation → Review → Audit → Final Verification**

### Design doc — `/overload-design-doc`

Define the RIR logging experience, relevant training situations, expected behavior, and User guidance requirements.

The design should explain the intended rule behavior and interactions without specifying unnecessary implementation architecture.

### UI preview — `/overload-ui-design`

Create the binding preview of the updated workout logging card.

Include representative situations:

* A set with RIR.
* A set without RIR.
* Pure bodyweight logging.
* Pending and confirmed sets.
* Historical RIR editing.
* Relevant phone and desktop states.

The preview must preserve the fast logging experience established by Pitch 13.

### Spec — `/overload-spec`

Define the RIR data and validation requirements, the deterministic interaction with progression decisions, historical compatibility, integration with logged-set writes, and verification.

All resulting rules must be testable.

### Implementation — `/overload-ticket-worker`

Build the complete feature in coherent end-to-end tickets.

The implementation must include the logging UI, confirmed persistence, history compatibility, progression evaluation, and appropriate tests.

The final ticket invokes `/overload-onboarding` for guidance maintenance.

### Code review — `/review`

Review the feature branch against `main`, recording findings on the feature PR.

### Review audit — `/overload-review-audit`

Evaluate and resolve review findings under the existing audit policy.

### Merge behavior — mandatory stop before merge

The pipeline guide explicitly classifies RIR Logging & Autoregulation as **stop before merge** because it changes what is stored during the logged-set write.

Even if the complete automated verification suite passes, the final feature PR must remain open for human approval.

The pipeline may complete all implementation tickets, integrate them, conduct review, audit findings, and prepare the delivery report.

It must not autonomously merge the final feature PR into `main`.

### Production safety

Do not autonomously apply production schema migrations, modify production training records, or enable production signup.

Any required deployment and migration operations must be documented as human steps.

---

## 16. Handoff to design and spec

The following outcomes are fixed by this pitch:

 1. RIR is optional for each performed set.
 2. The logging card has a compact RIR selector near repetitions.
 3. Pure bodyweight movements continue using reps plus optional RIR.
 4. Missing RIR is different from explicitly reported zero RIR.
 5. No historical RIR is invented or backfilled.
 6. Existing history without RIR remains valid.
 7. Mixed RIR and non-RIR history evaluates correctly.
 8. RIR influences the existing progression engine alongside its established rules.
 9. The resulting behavior is deterministic and explainable.
10. RIR can produce a different progression outcome for otherwise equivalent performance when the documented rules qualify it.
11. The design/spec process determines the precise effect on progress, hold, reactive deload, and stall detection.
12. Scheduled-deload suppression remains intact.
13. Gym-specific load and baseline behavior remains intact.
14. No plan or stored weight is automatically changed by a recommendation.
15. The no-RIR logging experience is not meaningfully slower.
16. `/overload-onboarding` maintains applicable tour guidance and the release-note entry through a final ticket.
17. The final feature PR must stop before merge for human approval.

The design and spec stages own the detailed UI and deterministic algorithm decisions.

They must work within the existing rules rather than inventing a separate autoregulation engine.

**Completion outcome:** Overload can use an optional estimate of set difficulty alongside actual weights and repetitions to make more informed, deterministic progression decisions, while remaining fast to use and fully compatible with existing training history.

**End of pitch.**
