<!-- Verbatim copy of the Linear document "Overload — Pitch 16: Exercise History & PR Intelligence" (caa8ea68-1d70-4f2d-b29b-443eda0005c7), pulled 2026-10-22 for the autonomous pipeline run. Linear is the source; this copy is what the run read. -->

# Overload — Pitch 16: Exercise History & PR Intelligence

**Type:** Feature
**Status:** Planned
**Phase:** MVP 3 — Training Intelligence
**Appetite:** L — Large (proposed)
**Depends on:** Pitch 5 — Progressive Overload Engine; Pitch 6 — Goals
**Uses:** Pitch 14 — RIR Logging & Autoregulation and Pitch 15 — Smarter & Explainable Progression, where available
**UI-bearing:** Yes
**Default merge behavior:** Merge on green unless protected boundaries are crossed

---

## 1. Problem

Overload helps lifters follow their own training plans and determine when to progress, hold, or deload.

The application already records performed weights and repetitions, maintains training history, calculates estimated one-rep-max (e1RM) trends, tracks strength goals, and provides progression recommendations.

However, this information is distributed across different parts of the training experience.

A lifter can review completed sessions, inspect their current plan, and check goal progress, but there is not yet one comprehensive view dedicated to answering:

**How has this particular exercise actually been going?**

That question is more important than it first appears.

A lifter may want to know whether their bench press has improved over the last several weeks, whether their working weights are rising despite fluctuations in repetitions, or whether recent performance supports the app's recommendation to progress or hold.

They may also want to know:

* What was my best actual set?
* What is my highest estimated one-rep max?
* Have I lifted this weight before?
* What is my best repetition performance?
* What has the progression engine recommended recently?
* How close am I to my strength goal?
* Have I already completed a previous goal for this exercise?
* At this gym, how have I performed on this particular machine?

Today, answering those questions can require mentally combining information from multiple parts of the application.

That makes the underlying training intelligence less visible and less useful.

It also creates a trust problem.

If Overload recommends holding or deloading, a serious lifter should be able to inspect the relevant history and understand how recent performance compares with earlier sessions.

The product needs a dedicated exercise-level history experience that brings together actual recorded performance, progression trends, personal records, current recommendations, and goals.

The information must remain accurate to the underlying history.

For machine and cable exercises, Overload must also preserve its defining distinction between different gyms.

A weight recorded on one machine cannot automatically be treated as an equivalent performance on another gym's machine.

Finally, the experience must match Overload's philosophy.

This is not an achievement or engagement feature.

It is a useful training record designed for people who care about understanding their performance.

---

## 2. Appetite

**L — Large (proposed)**

The roadmap does not assign a formal appetite to this pitch. Large is proposed because the feature combines several existing training domains within a substantial new user-facing experience.

The work includes:

* A dedicated per-exercise history view.
* Recent session records.
* Working-weight and repetition trends.
* Existing e1RM trend data.
* Multiple kinds of personal records.
* Current progression recommendation and evidence.
* Recent historical progression decisions.
* Strength-goal history.
* Correct gym-specific versus globally comparable exercise behavior.
* Empty, sparse, and extensive history states.
* Responsive presentation.
* Integration with user-guidance maintenance.

The breadth is significant, but the feature remains bounded.

It must primarily **read, organize, and present existing authoritative training information**.

It does not introduce new training inputs, another progression algorithm, or a replacement logging system.

The design and specification stages should determine how best to present the information without expanding into a general-purpose analytics platform.

---

## 3. Value delivered

When this pitch is complete, every relevant exercise has a dedicated place where the lifter can understand its performance history.

The lifter can review recent sessions, see how working weights and repetitions have changed, inspect the e1RM trend, identify genuine personal records, and understand the current progression recommendation.

They can also review applicable strength-goal history.

The information remains consistent with what Overload already knows about the exercise and its training context.

For gym-variable machine and cable movements, records and personal bests are specific to the applicable gym.

For globally comparable movements, performance remains comparable across gyms according to the existing exercise classification rules.

The experience is calm, data-focused, and useful.

It should help the lifter answer two questions:

**Am I getting stronger on this exercise?**

**What does my actual performance history tell me to do next?**

---

## 4. Solution shape

### 4.1 Dedicated per-exercise history view

Overload introduces a dedicated history view for an individual exercise.

The view consolidates the information necessary to understand that exercise's training performance.

Its content includes:

1. Recent completed sessions involving the exercise.
2. Working weights and repetition performance.
3. The e1RM trend.
4. The current progression recommendation and explanation.
5. Best estimated one-rep max.
6. Best actual performed set.
7. Weight and repetition personal records.
8. Recent progression decisions.
9. Applicable strength-goal history.

These elements should form one coherent training experience, not separate analytics pages.

The exact layout, content hierarchy, navigation entry points, and responsive presentation belong to `/overload-design-doc` and `/overload-ui-design`.

The most useful information should be easy to find without requiring the lifter to interpret a large amount of statistical detail.

### 4.2 Recent session history

The view displays recent training sessions in which the exercise was actually performed.

Each relevant session should allow the lifter to understand what they recorded.

The presentation should include meaningful information about:

* The session's date.
* Performed weight, where applicable.
* Performed repetitions.
* Relevant set performance.
* The associated gym where gym context matters.
* Optional RIR where it was recorded and is useful to the experience.

This is actual logged history, not a reconstruction of what the lifter was supposed to perform.

The distinction between planned and performed training remains intact.

The design stage determines how individual sets are arranged and how much detail is visible without further interaction.

A lifter should be able to compare recent sessions without losing the context of when the performances occurred.

### 4.3 Working-weight history

The view should make it easy to understand how the exercise's working weights have changed.

This is not necessarily the same as showing the single heaviest weight ever lifted.

An isolated heavy set, a temporary reduction, or a scheduled deload may all appear in the record.

The presentation should communicate actual performed loads over time without implying that every decrease represents lost strength.

For loaded movements, weight history must remain grounded in confirmed logged sets.

For pure bodyweight exercises, the presentation should respect the existing reps-only rules rather than inventing an external load.

Machine and cable weight history must retain the applicable gym context.

### 4.4 Repetition-performance history

The view should make repetition performance understandable alongside load.

A lifter can increase performance without immediately increasing working weight.

For example, moving from eight repetitions to eleven repetitions at the same load may represent meaningful progress within a planned rep range.

The exercise view should allow the lifter to recognize such improvements.

The design/spec stages should determine how repetitions and load are shown together so the lifter does not confuse a higher rep count at a lighter weight with an automatically superior performance.

The displayed data must accurately reflect recorded sets.

This pitch does not create new volume or intensity scoring systems.

### 4.5 e1RM trend

Overload already calculates estimated one-rep max using its established formula.

The per-exercise view should expose that trend as a meaningful historical signal.

The trend is not a new calculation invented for the analytics page.

It must use the approved e1RM rules that already support the progression engine and strength-goal evaluation.

The presentation should make it possible to see improvement, stability, and decline over time.

However, e1RM remains an estimate derived from actual logged performance.

It must not be represented as a directly measured one-rep-max achievement.

For exercises where e1RM is not applicable or cannot be calculated under the established rules, the view must handle that limitation honestly.

Do not fabricate values to complete a chart.

### 4.6 Best estimated one-rep max

The view identifies the exercise's best valid historical e1RM.

This is a distinct metric from the heaviest actual performed set.

For example, an estimated one-rep max calculated from a multi-repetition set is not a claim that the lifter physically completed a single repetition at that estimated weight.

The interface must maintain this distinction.

Use the existing approved formula and validity conditions.

Historical edits should be reflected in the computed best result.

The metric must also respect exercise classification and gym-specific comparison rules.

### 4.7 Best actual set

The view identifies a meaningful best actual performed set.

This record must come from confirmed training history.

It is separate from the best calculated e1RM.

The presentation should preserve the actual weight and repetitions performed rather than reducing the result to an estimated number.

Because the roadmap does not define a universal ranking for best actual set across all weight-and-repetition combinations, the design/spec stages must establish a consistent, documented interpretation based on the existing performance model.

The result must not be chosen using arbitrary or unsupported assumptions.

For pure bodyweight exercises, the interpretation should reflect reps-only performance.

For gym-variable exercises, comparisons must remain within the applicable gym.

### 4.8 Weight personal records

The exercise view identifies the highest applicable actual load recorded for the exercise.

The record must reflect a real completed set, not a planned weight, suggested progression target, or estimated one-rep max.

Where the exercise's weight history is globally comparable, the record follows the established global history context.

Where the exercise is gym-variable, the record is specific to the relevant gym.

A weight recorded on another gym's machine must not replace the current gym's PR.

The record should remain correct after historical corrections and when previously logged exercises or gyms have been archived from future selection.

### 4.9 Repetition personal records

The exercise view also identifies repetition-related personal records.

These must be based on actually performed sets.

The design/spec must establish how repetitions are compared when weights differ.

A high repetition count at a low load should not be presented as directly equivalent to a heavier performance merely because it has more repetitions.

Similarly, the experience must handle pure bodyweight exercises according to their existing reps-only behavior.

The precise PR categories, comparison rules, and presentation belong to the downstream design and spec, subject to the roadmap requirement that repetition records are included.

Do not introduce invented performance measurements or claim equivalent strength where the underlying records do not establish it.

### 4.10 Gym-specific personal records

This is a critical requirement.

Overload's equipment model distinguishes movements whose loads are meaningfully comparable across gyms from machine and cable exercises that may use different resistance systems.

For machine and cable exercises, **personal records must not be compared across gyms**.

Consider a chest press logged at two gyms.

At Gym A, the lifter may have reached a heavier nominal working weight.

At Gym B, the same lifter may use a machine with a different resistance profile.

The exercise view must not treat Gym A's highest weight as the automatic benchmark for Gym B.

Gym-specific history and PR presentation must honor the application's existing equipment and baseline rules.

The experience may allow the lifter to examine different gym contexts, but it must not merge them into misleading universal machine records.

For globally comparable movements, the established global comparison behavior remains intact.

This distinction applies to:

* Weight PRs.
* Rep PRs when load context matters.
* Best actual sets.
* e1RM records where applicable.
* Historical performance comparisons.
* Trend presentation.

The design/spec stages should determine the exact way a lifter sees or selects the applicable gym context.

The invariant itself is not optional.

### 4.11 Current progression recommendation

The exercise view presents the current progression recommendation from the authoritative engine.

The recommendation can indicate progress, hold, or reactive deload according to the existing rules.

After Pitch 15, the associated guidance should describe an appropriate next action and provide concise evidence where required.

Pitch 16 consumes that established recommendation and explanation behavior.

It must not create an independent progression calculation for the history page.

The displayed recommendation must be consistent with what the lifter sees on the existing Plan or logging surfaces for the same exercise and relevant context.

The current recommendation should reflect corrected history rather than a stale previously displayed result.

### 4.12 Recent progression decisions

In addition to the current recommendation, the view includes recent progression decisions.

This allows the lifter to understand how Overload's interpretation of the exercise has evolved.

For example, the history may show periods when progression was supported, when the lifter was holding, or when a reactive deload was warranted.

These historical decisions must be consistent with the approved progression rules and the state of the underlying training data.

The roadmap requires recent progression decisions but does not establish whether previous decisions are persisted.

The existing architecture specifies that progression tags are computed from history rather than stored as authoritative records.

The design/spec must therefore determine how historical decisions can be represented faithfully without introducing conflicting stored recommendation state.

If reliable historical reconstruction requires additional context, the spec must identify and resolve that requirement through the project's established authority process.

**Do not invent historical decisions simply to make a timeline appear complete.**

### 4.13 Strength-goal history

The view includes relevant strength-goal history for the exercise.

Overload already supports undated, exercise-specific strength goals.

A goal is defined as a target weight and repetition count, and progress is evaluated using the approved e1RM conversion.

Completed goals are archived rather than removed from history.

The exercise view should bring together the relevant goal information so the lifter can understand how their training relates to their targets.

Where available, the view should communicate:

* The current applicable goal.
* Progress toward that goal.
* Previously completed goals.
* Relevant archived goal records.

The exact presentation belongs to the design stage.

This pitch must not introduce:

* Goal deadlines.
* Suggested goals generated by the application.
* New target-setting algorithms.
* Automatic changes to goals based on progression recommendations.

The existing Goals feature remains authoritative.

### 4.14 Sparse history

An exercise may have only one recorded session.

In that situation, the lifter should still be able to inspect the available history.

However, one session may not support a meaningful trend, stall determination, or progression recommendation.

The view must distinguish between actual available records and metrics requiring more data.

It should not draw misleading conclusions from insufficient history.

For example, a single recorded e1RM estimate can be displayed where valid, but should not be presented as evidence of a sustained trend.

The interface should remain useful without requiring an established training history.

### 4.15 Empty history

A lifter may open an exercise they have never performed.

The view should provide an appropriate empty state.

It must not display fabricated PRs, artificial chart values, or invented progression decisions.

The design should make clear that meaningful historical information will become available after the lifter logs the exercise.

The empty state should fit Overload's restrained interface.

It should not generate sample workouts or automatically modify the training plan.

### 4.16 Historical corrections

Overload allows users to correct previous logged sets.

Because PRs, trends, and progression recommendations are derived from that history, corrections must be reflected throughout the exercise view.

If a lifter corrects a previously overstated working weight, the old value must not remain their personal record merely because it was previously displayed as one.

Likewise, corrected repetitions may affect an e1RM trend, best set, or progression evidence.

The exercise view must remain consistent with the canonical corrected history.

This pitch does not change the historical correction mechanism.

It consumes the corrected results.

### 4.17 Archived exercises and gyms

Overload preserves history when custom exercises or gyms are archived.

This pitch must respect that existing behavior.

A lifter should not lose access to historical training records merely because an exercise or gym is no longer available for new selection.

The spec must account for preserved historical references and the established archive semantics.

Do not turn archival into deletion or remove historical PRs solely because the underlying item is no longer active.

### 4.18 Visual treatment of personal records

Personal records should be easy to identify, but the interface must remain data-focused.

The roadmap explicitly excludes celebratory presentation.

This means:

* No confetti.
* No streak celebrations.
* No achievement badges for individual PRs.
* No game-style unlocks.
* No reward animations.

A PR is a meaningful historical training result.

It should be presented with clear labels, appropriate context, and accurate recorded values.

The goal is to give a serious lifter useful information, not to increase engagement through rewards.

### 4.19 Preserve read-only analytics behavior

The exercise view primarily reads and organizes existing training information.

Viewing history, charts, PRs, and recommendations must not change:

* Logged sets.
* Recorded working weights.
* Planned sessions.
* Mesocycle structure.
* Gym baselines.
* Strength goals.
* Progression thresholds.

Existing authorized editing functionality remains separate.

The analytics page is not another logging or correction mechanism.

---

## 5. Primary user journeys

### Journey A — Reviewing exercise progress

1. A lifter navigates to an exercise's history view.
2. They see recent sessions and actual performed sets.
3. They review changes in working weights and repetitions.
4. They inspect the e1RM trend where applicable.
5. They see current PRs and the progression recommendation.
6. They leave with a clearer understanding of how that exercise has been progressing.

### Journey B — Checking a personal record

1. The lifter opens the exercise view.
2. They find the best estimated one-rep max.
3. They examine the best actual performed set.
4. They review weight and repetition PRs.
5. They can distinguish calculated estimates from recorded performances.

The interface does not confuse an estimated one-rep max with a performed lift.

### Journey C — Comparing performance at two gyms

1. A lifter has logged the same machine exercise at two gyms.
2. They open the exercise history.
3. The relevant gym-specific context is displayed.
4. They inspect PRs and history for one gym.
5. They inspect the other gym's context where supported by the UI.
6. No PR treats the two machines as automatically equivalent.

### Journey D — Understanding a progression recommendation

1. The lifter opens an exercise with sufficient history.
2. The current recommendation appears.
3. They read the concise explanation established in Pitch 15.
4. They compare the recommendation with recent performance.
5. They can understand the relationship between the available evidence and the recommendation.

### Journey E — Reviewing recent progression decisions

1. The lifter opens an exercise they have trained regularly.
2. The view presents recent progression decisions supported by the historical evaluation.
3. The lifter can understand how those decisions relate to recorded performance.
4. Unsupported or unreconstructable historical outcomes are not fabricated.

### Journey F — Reviewing goal history

1. The lifter opens an exercise for which they have established goals.
2. They see the current applicable strength goal, if one exists.
3. They review relevant goal progress.
4. They can inspect historical completed or archived goals associated with that exercise.
5. The goals remain unchanged by viewing the page.

### Journey G — First recorded workout

1. A lifter performs an exercise for the first time.
2. They open its history view.
3. Their confirmed performance is visible.
4. Valid metrics are shown.
5. Trend-dependent conclusions remain unavailable until sufficient history exists.

### Journey H — No logged history

1. A lifter opens an exercise they have never logged.
2. The page shows an appropriate empty state.
3. No fabricated chart or personal record appears.
4. The lifter can continue using the existing workout-planning and logging workflow.

### Journey I — Correcting an inaccurate prior record

1. The lifter corrects an old logged set through the existing historical correction flow.
2. They return to the exercise history view.
3. The corrected performance is reflected.
4. PRs, trends, and current recommendations match the updated history.

---

## 6. In scope

This pitch delivers **Exercise History & PR Intelligence** as a single coherent feature.

Included:

 1. A dedicated per-exercise history view.
 2. Recent actual training sessions.
 3. Working-weight history.
 4. Repetition-performance history.
 5. Existing e1RM trend presentation.
 6. Best valid historical e1RM.
 7. Best actual performed set.
 8. Weight personal records.
 9. Repetition personal records.
10. Current authoritative progression recommendation and explanation.
11. Recent progression decisions supported by available history.
12. Relevant strength-goal history.
13. Gym-specific history and PRs for machine and cable movements.
14. Global history behavior for globally comparable movements.
15. Correct sparse-history and empty-history states.
16. Compatibility with historical corrections and archived records.
17. Responsive, restrained analytics presentation.
18. Final User Guidance maintenance through `/overload-onboarding`.

The feature should be complete enough that a lifter can use this one view to understand an exercise's performance history without navigating between several unrelated screens.

---

## 7. Out of scope

### New progression rules

Do not change thresholds for progress, hold, reactive deload, or stall detection.

### New RIR autoregulation

Pitch 14 owns RIR qualification rules.

This pitch may display available RIR but does not redefine how effort influences recommendations.

### Recommendation redesign

Pitch 15 owns actionable recommendation wording and concise evidence.

Do not introduce a second recommendation presentation contract.

### New strength metrics

Do not invent training-readiness scores, fatigue scores, lifting velocity estimates, or new physiological measures.

### New logging interactions

Do not redesign the exercise logging card or the canonical set-entry workflow.

### Changes to historical correction behavior

Existing correction semantics remain authoritative.

### New goal functionality

No goal deadlines, automatic goal generation, new achievement targets, or goal-setting redesign.

### Gamification

No confetti, streaks, reward animations, unlockable achievements, or celebratory PR badges.

### Social records

No public leaderboards, friend comparisons, sharing, social profiles, or community rankings.

### Cross-gym machine comparisons

No universal machine/cable PRs derived by combining nominal loads from different gyms.

### Workout generation

No automated programming or generated mesocycles.

### General analytics platform

Do not turn this into an unrestricted data-exploration dashboard or reporting builder.

### New external services

No third-party analytics platform, coaching integration, email provider, or external training-data service.

---

## 8. Definition of done

The Pitch Roadmap defines three formal completion criteria.

### AC-1 — Complete exercise-level history experience

The view displays the required information for an exercise with sufficient recorded history:

* Recent sessions.
* Working loads.
* Repetition performance.
* e1RM trend.
* Current recommendation and explanation.
* Best e1RM.
* Best actual set.
* Weight PRs.
* Rep PRs.
* Recent progression decisions.
* Goal history.

The view also handles exercises with little or no history appropriately.

**Source:** Pitch Roadmap — Exercise History & PR Intelligence, Definition of Done 1 and Included scope.

### AC-2 — No cross-gym machine or cable PR comparison

Machine and cable personal records must not compare performances across different gyms.

Globally comparable movements continue to use their established global history context.

**Source:** Pitch Roadmap — Exercise History & PR Intelligence, Definition of Done 2.

### AC-3 — Records rather than rewards

Personal records are presented as training information, not as a reward or gamification experience.

**Source:** Pitch Roadmap — Exercise History & PR Intelligence, Definition of Done 3.

### Supporting acceptance expectations

The roadmap's Included scope additionally requires the current recommendation, recent progression decisions, goal history, and relevant historical metrics to coexist in the per-exercise view.

The design and spec should verify their consistency with existing canonical data sources.

### PRD traceability note

The supplied PRD lists Exercise History & PR Intelligence as planned follow-on work but does not supply a dedicated formal acceptance-criteria section.

The three acceptance criteria above are traced to the Pitch Roadmap rather than attributed to an absent PRD section.

**Required upstream amendment:** Add the roadmap-defined criteria to the PRD if full acceptance-criteria traceability is required by the project process.

---

## 9. Rabbit holes

### 9.1 Treating estimated performance as an actual PR

An e1RM estimate is not a performed single-repetition lift.

Best actual set and best e1RM must remain distinguishable.

### 9.2 Comparing incompatible machines

This is the most important product-specific risk.

A machine or cable PR at one gym cannot be compared directly with the same nominal load recorded on another gym's equipment.

The existing gym-specific rules must remain authoritative.

### 9.3 Inventing historical progression decisions

The roadmap calls for recent progression decisions.

However, the existing engine computes recommendations from logged history rather than storing authoritative decision tags.

The spec must establish a defensible way to present recent historical decisions without manufacturing events that were never evaluated.

### 9.4 Building another progression engine

The exercise view must not independently decide whether the lifter should progress, hold, or deload.

It consumes the existing engine's evaluation.

### 9.5 Creating too many PR categories

The feature needs meaningful weight, repetition, actual-set, and estimated-performance records.

Do not expand this into dozens of obscure records or achievement categories.

The design should keep the information understandable.

### 9.6 Confusing heavy loads with superior overall performance

A heavier single set and a lighter high-repetition set can represent different kinds of performance.

The spec must distinguish the relevant measurements and avoid unsupported universal rankings.

### 9.7 Fabricating trends from sparse history

One workout is not a sustained trend.

The interface must handle insufficient data without producing misleading charts or progression conclusions.

### 9.8 Losing archived history

Archived exercises and gyms retain historical references.

The new view must not remove that history or hide legitimate historical performance simply because the item is no longer selectable for future training.

### 9.9 Creating stored analytics that become stale

Historical corrections can affect PRs, trends, and recommendations.

Do not introduce a separate authoritative analytics record that contradicts the corrected logged history.

### 9.10 Turning PRs into gamification

It may be tempting to add colorful achievements, confetti, or streak counters.

The roadmap explicitly excludes that direction.

PRs should be presented as useful records.

### 9.11 Overloading the screen

The exercise view contains several kinds of information.

Showing everything at the same visual priority could make the page harder to use than the existing separate screens.

The design should organize information around the lifter's real questions rather than presenting an indiscriminate grid of statistics.

### 9.12 Unnecessary schema changes

The intended feature primarily derives information from existing logged history, progression evaluation, and goals.

A new storage model must not be added simply because it is convenient for the presentation layer.

If the spec identifies a genuine missing capability, document its rationale and apply the project's protected-boundary rules.

---

## 10. No-gos

* No machine or cable PR comparison across gyms.
* No conflation of e1RM with an actual performed one-rep max.
* No fabricated historical progression decisions.
* No invented training history or PRs.
* No independent recommendation engine.
* No changes to progression thresholds for novelty.
* No changes to RIR qualification rules.
* No automatic changes to plans or working weights.
* No new logging path.
* No new historical correction mechanism.
* No changes to goal deadlines or targets.
* No gamification, confetti, streaks, or achievement badges.
* No social comparisons or leaderboards.
* No new AI coaching system.
* No unrelated account or authentication functionality.
* No third-party email-service integration.

---

## 11. Dependencies

### Pitch 5 — Progressive Overload Engine

This is a formal roadmap dependency.

The feature consumes the engine's computed recommendations, e1RM behavior, and relevant history interpretation.

It must not replace or independently reimplement those rules.

### Pitch 6 — Goals

This is the second formal roadmap dependency.

The exercise view includes the lifter's relevant active and archived strength-goal history.

Goal evaluation remains governed by the existing Goals feature.

### Pitch 14 — RIR Logging & Autoregulation

The roadmap identifies Pitch 14 as an enhancement used where available.

If RIR is already implemented, relevant per-set effort information and RIR-aware recommendations should be reflected accurately.

No RIR is invented for older records.

### Pitch 15 — Smarter & Explainable Progression

The view should reuse the current recommendation and evidence presentation established by Pitch 15.

The recommendation shown in exercise history must remain consistent with other application surfaces.

### Pitch 4 — Guided Workout Logging

Logged sets and historical corrections provide the authoritative performed training data.

### Gym Management & Gym-Specific Weight Tracking

The exercise classification and gym-baseline rules govern how history and PRs are compared.

### Account Ownership & Isolation

Every private historical record, personal record, goal, and derived recommendation must be scoped to the authenticated lifter.

Shared library exercise definitions do not make user-specific performance history public.

### Onboarding Tour and What's New

Both guidance mechanisms are expected to be present in the current build sequence.

This feature requires a final guidance-maintenance ticket invoking `/overload-onboarding`.

---

## 12. User guidance and release notes

This pitch introduces a new discoverable exercise-history experience.

It should include a final User Guidance ticket invoking `/overload-onboarding`, assuming both prerequisite mechanisms are shipped.

### Tour-step assessment

Unlike pitches that simply refine an existing control, this pitch introduces a dedicated exercise-level view.

Under the supplied `/overload-onboarding` skill's rubric, a new step is likely warranted because the lifter must discover how to access the view to benefit from it.

The skill should inspect the actual interface and determine the best real control to anchor the step.

The anchor must work correctly on phone and desktop.

The guidance should explain what the exercise history view does and why the lifter would use it.

Illustrative wording:

**Exercise history**

"See how a lift has changed over time, including recent sessions, personal records, and why Overload recommends what it does."

The skill makes the final decision and applies the step through the existing tour registry.

It must not introduce another onboarding mechanism.

### Release-note entry

Exercise History & PR Intelligence is a significant user-visible capability.

It should receive a significant What's New entry.

Illustrative content:

**Exercise history and personal records**

"Every lift now has a place to review recent sessions, strength trends, and personal records. See your current progression recommendation alongside the training behind it."

The final entry must describe actual shipped functionality.

Do not invent or backdate its shipping date.

### Guidance maintenance

The final ticket must:

* Use the existing tour registry.
* Use the existing repository-managed release-note content.
* Maintain stable tour-step identifiers.
* Verify relevant anchors on phone and desktop.
* Verify light and dark presentation.
* Avoid editing core tour and modal mechanisms merely to add content.
* Follow the established release-note publishing process.

---

## 13. Risks and verification focus

### Personal-record correctness

PRs must reflect actual confirmed logged sets and established calculations.

Best e1RM, best actual set, weight PR, and rep PR must remain distinguishable.

### Gym-specific isolation

Machine and cable histories must not produce cross-gym PR comparisons.

This deserves explicit test coverage.

### Historical corrections

Changes to logged sets must be reflected in all relevant derived metrics.

### Progression consistency

The current recommendation must match the authoritative engine.

Recent historical decisions must be supported by the approved reconstruction or presentation contract.

### Goal consistency

Active and archived goals shown in exercise history must agree with the established Goals feature.

### Empty and sparse history

The view must function without requiring artificially populated analytics data.

### Archived records

The lifter must retain access to legitimate history associated with archived exercises and gyms.

### Account isolation

No account may view or infer another account's sets, trends, PRs, goals, or recommendations.

### Responsive usability

A substantial amount of training information must remain usable on phone-width screens.

The design should not rely on desktop-sized tables or inaccessible chart interactions.

### Read-only behavior

Opening or navigating the exercise view must not modify training history, plans, baselines, goals, or stored weights.

### Guidance verification

The final guidance ticket must evaluate and implement the appropriate tour and release-note changes.

---

## 14. Open questions and source gaps

### Decisions delegated to design and spec

**Entry points**

Determine how a lifter reaches an exercise's history view from the existing product without introducing unrelated navigation changes.

**Information hierarchy**

Determine how recent sessions, charts, PRs, recommendations, and goals are organized in a coherent screen.

**Best actual set**

Establish a precise and consistent interpretation when sets differ in weight and repetitions.

**Repetition PRs**

Define useful repetition-record comparisons that do not misleadingly equate performances at different loads.

**Recent progression decisions**

Determine how historical engine decisions can be represented faithfully when recommendations are computed on read.

**Gym-context presentation**

Determine how users access the correct gym-specific history without creating misleading universal machine records.

**Sparse-data behavior**

Determine when trends, records, or recommendations have sufficient data to be displayed.

**Archived context**

Determine how historical records associated with archived items remain accessible.

**Responsive interaction**

Determine chart, history-list, and detail behavior for phone and desktop.

These decisions belong to `/overload-design-doc`, `/overload-ui-design`, and `/overload-spec`, using existing architectural conventions.

### Existing decisions that must not be reopened

* Equipment classification.
* Gym-specific versus globally comparable weights.
* Gym baseline establishment and correction.
* e1RM formula and validity.
* Progression thresholds and scheduled-deload suppression.
* RIR qualification rules.
* Recommendation evidence behavior.
* Historical correction semantics.
* Goal archival and progress calculation.
* Account isolation.
* Canonical logged-set writes.

Use the controlling specifications, current implementation, and `method-note.md`.

### Historical-decision source gap

The roadmap requires recent progression decisions while the existing architecture computes progression state on read.

This is a genuine contract question for the design/spec process.

Do not assume historical recommendation snapshots already exist.

The chosen approach must be documented, defensible, and consistent with the no-conflicting-stored-tags architecture.

### PRD traceability gap

The supplied PRD does not provide a dedicated numbered acceptance-criteria section for Pitch 16.

Use the three roadmap criteria as the formal completion requirements and record any upstream documentation amendment separately.

---

## 15. Rollout and delivery boundary

This is a UI-bearing training-intelligence feature.

The standard artifact sequence is:

**Pitch → Design Doc → UI Preview → Spec → Linear Tickets → Implementation → Review → Audit → Final Verification**

### Design doc — `/overload-design-doc`

Define the exercise-history experience, navigation, information hierarchy, PR presentation, gym context, empty states, and User guidance.

### UI preview — `/overload-ui-design`

Create the binding visual preview.

Include representative states for:

* An exercise with extensive training history.
* An exercise with sparse history.
* An exercise with no history.
* Current progression recommendations and supporting evidence.
* Best e1RM and actual-set PRs.
* Gym-specific machine or cable history.
* Globally comparable exercise history.
* Applicable goal history.
* Phone and desktop layouts.

### Spec — `/overload-spec`

Define authoritative data selection, PR comparisons, historical-decision representation, recommendation integration, account isolation, and verification.

Preserve existing calculations and canonical history semantics.

### Implementation — `/overload-ticket-worker`

Build the approved exercise-history experience through coherent PR-sized tickets.

Include a final guidance ticket invoking `/overload-onboarding`.

### Review — `/review`

Review the feature branch against `main`, emphasizing correctness of records, historical evaluation, gym context, and account isolation.

### Review audit — `/overload-review-audit`

Resolve review findings under the established audit policy.

### Merge behavior

The authoritative pipeline guide classifies Exercise History & PR Intelligence as **merge on green** by default.

This is consistent with the intended read-oriented feature scope.

However, the guide also requires stopping before merge when work changes logged-history writes, gym-baseline correction, ownership or account scoping, authentication, RLS, or the schema of tables holding user data.

If implementation crosses such a protected boundary, the feature PR must remain open for human approval.

Do not treat the default merge classification as authorization to bypass those rules.

### Production safety

No autonomous run may apply production migrations, modify production data or credentials, or enable production signup.

Any required human operation belongs in the runbook.

---

## 16. Handoff to design and spec

The following outcomes are fixed:

 1. Each exercise has a dedicated history view.
 2. The view shows recent actual sessions, weights, and repetition performance.
 3. It includes the established e1RM trend where applicable.
 4. Best e1RM and best actual performed set are distinguishable.
 5. Weight and repetition PRs are available.
 6. The current progression recommendation and explanation are presented.
 7. Recent progression decisions are included only where they can be represented faithfully.
 8. Relevant active and archived goal history is available.
 9. Machine and cable PRs never compare across gyms.
10. Globally comparable exercise history follows existing global rules.
11. Sparse and empty histories are handled accurately.
12. Historical corrections are reflected in derived performance information.
13. Archived exercises and gyms retain their legitimate historical records.
14. PRs are presented as training records, not game-style achievements.
15. The view does not introduce another progression engine.
16. Opening or using the analytics view does not modify training records or plans.
17. Existing account-isolation rules remain intact.
18. `/overload-onboarding` maintains appropriate tour guidance and release notes through a final ticket.
19. The pipeline uses merge on green only where the authoritative protected-boundary policy permits it.

The design stage determines how the information is organized and presented.

The spec stage determines how to derive, compare, and expose the information using approved calculations and existing account-owned data.

Neither stage should fabricate historical performance, introduce misleading cross-gym comparisons, or independently change progression decisions.

**Completion outcome:** Overload gives every lifter a clear, trustworthy view of each exercise's recent performance, trends, personal records, goals, and progression recommendations, with the correct equipment and gym context.

**End of pitch.**
