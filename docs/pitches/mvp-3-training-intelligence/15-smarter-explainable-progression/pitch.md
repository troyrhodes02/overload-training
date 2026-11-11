# Overload — Pitch 15: Smarter & Explainable Progression

> Verbatim copy of the Linear document "Overload — Pitch 15: Smarter & Explainable Progression" (Overload V1, doc `155772a8-5c74-439d-84e5-64aa67927ba0`, updated 2026-10-22). Linear is the source of truth.

**Type:** Feature
**Status:** Planned
**Phase:** MVP 3 — Training Intelligence
**Appetite:** M — Medium
**Depends on:** Pitch 5 — Progressive Overload Engine
**Uses:** Pitch 14 — RIR Logging & Autoregulation, where available
**UI-bearing:** Yes
**Merge behavior:** Stop before merge under the proposed progression-critical safeguard; confirm against the pipeline guide

---

## 1. Problem

Overload's central purpose is not simply to store workout results.

It helps a lifter who follows their own training plan understand whether to progress, hold, or deload based on recorded performance.

The existing progression engine already evaluates training history using established rules. It considers performed weights and repetitions, planned rep ranges, relevant performance trends, gym-specific working-weight context, and, after Pitch 14, optional RIR.

However, the value of that evaluation depends on what the lifter can understand and do with it.

A recommendation such as "Progress" identifies a direction, but does not necessarily explain what to attempt next.

A "Hold" result can be especially unclear. The lifter may wonder whether they should repeat their previous weight, attempt additional repetitions, or interpret the lack of progression as a problem.

A reactive deload recommendation carries greater significance but may leave the lifter wondering what evidence produced it.

The same issue applies to bodyweight movements, where progression may involve repetitions rather than an external weight increase.

Even when the engine's decision is correct, an unexplained recommendation can feel arbitrary.

That creates a trust problem.

Lifters need to understand not only the conclusion but also the relevant evidence behind it.

Overload already has a deterministic progression system. That is an advantage only if its output is presented clearly and accurately.

The problem this pitch solves is therefore:

**Turn existing progression decisions into specific, understandable recommendations without changing what the progression engine actually decides.**

---

## 2. Appetite

**M — Medium**

This pitch improves one existing product capability: the presentation and interpretation of progression recommendations.

The work spans several connected behaviors:

* Actionable progress recommendations.
* Understandable hold guidance.
* Clear reactive deload recommendations.
* Appropriate bodyweight progression wording.
* Concise evidence explaining non-trivial recommendations.
* RIR-aware explanations when effort information influenced the result.
* Consistent presentation wherever existing recommendations appear.

These behaviors require coordination with the current progression engine and workout interface.

However, the pitch does not introduce another training-data domain or authorize new progression calculations for novelty.

The appetite remains medium because the primary task is to translate authoritative engine results into user-facing guidance accurately.

If implementation reveals that the current engine lacks information required to produce a requested explanation, the design/spec process must identify that limitation explicitly.

It must not invent performance evidence or silently change the engine's rules simply to produce more impressive copy.

---

## 3. Value delivered

When this pitch is complete, a lifter can look at Overload's progression recommendation and understand:

1. **What action is being recommended.**
2. **Why that action is appropriate according to recorded performance.**

A progression recommendation should communicate the next meaningful training action.

A hold recommendation should make clear that maintaining the current load or approach is the intended outcome.

A reactive deload recommendation should convey the need to back off and summarize the evidence responsible.

For bodyweight exercises, guidance should reflect how progression applies to the actual movement instead of assuming every exercise uses an external weight.

When RIR was relevant to the decision, that effort evidence should be reflected accurately.

The result is an application that feels less like a collection of status tags and more like a useful decision-making tool for self-directed lifters.

The lifter remains responsible for choosing and performing their training.

A recommendation never rewrites their plan or silently changes a stored working weight.

---

## 4. Solution shape

### 4.1 Actionable progression recommendations

When the existing engine determines that an exercise is ready to progress, Overload should express the recommendation in terms a lifter can act on during their next relevant session.

The guidance should be more informative than a generic "Progress" label.

Where the engine supports a specific next load or repetition target, the recommendation should communicate that action.

For example, a recommendation might tell the lifter to attempt a higher working weight at the next session.

However, the displayed action must be grounded in the engine's actual decision and supported data.

This pitch must not invent a weight increment, choose an unsupported load, or calculate a different progression result merely because a specific number would look useful in the interface.

If the existing engine only establishes that progression is warranted, the downstream design/spec must determine what actionable wording is supportable without introducing an unrelated progression rule.

The core requirement is that **the recommendation says what the engine can legitimately support, not what the interface wishes it could say.**

### 4.2 Hold recommendations

A hold is a valid training outcome.

It should not be presented as a failure or as missing guidance.

When the engine determines that a lifter should hold, Overload should explain what maintaining the current approach means.

The presentation should avoid unnecessary warnings, negative language, or motivational pressure.

A normal hold should remain visually restrained in keeping with the existing product conventions.

Where sufficient evidence exists, the recommendation can explain why progression is not yet warranted.

This must reflect the engine's actual reasons rather than a generic assumption about fatigue, poor recovery, or insufficient effort.

The existing decision to leave ordinary holds untagged should be respected unless the approved design determines that concise guidance can be provided without turning every hold into a prominent status.

### 4.3 Reactive deload recommendations

When the existing engine recommends a reactive deload, Overload should communicate that recommendation clearly.

The lifter should understand that the recommendation reflects relevant recorded performance rather than an arbitrary interruption.

The guidance should distinguish a reactive deload recommendation from a scheduled deload already built into the training plan.

The engine's existing reactive deload criteria remain authoritative.

This pitch does not introduce new trigger thresholds, shorten or extend deload periods, or change the rules governing scheduled-deload suppression.

The copy must not imply that Overload has independently diagnosed fatigue, overtraining, injury, or inadequate recovery.

It can describe the evidence available in the application, such as performance against the planned rep range or qualifying historical trends.

It must not attribute the result to medical or physiological factors that were never measured.

### 4.4 Bodyweight progression

Bodyweight exercises require recommendations that reflect their logging and progression rules.

For a pure bodyweight movement, there may be no external working weight to increase.

The wording should therefore focus on an appropriate action supported by the existing engine, such as improving repetitions where applicable.

The interface must not display a weight-increase instruction for a movement that is logged as repetitions only.

Weighted bodyweight movements and other load-bearing exercise types should continue following their established classifications.

This pitch changes how the recommendation is explained, not which exercise type the movement belongs to.

### 4.5 Evidence for non-trivial recommendations

Every non-trivial recommendation must include a concise evidence line.

The evidence should identify the relevant recorded facts or evaluation conditions that support the result.

Examples of evidence categories include:

* Performance against the planned rep range.
* Relevant recent weight-and-repetition performance.
* The existing stall or e1RM trend evidence, where it actually contributed.
* Repeated performance difficulty when it satisfies the established reactive deload rules.
* Reported RIR when it materially influenced the engine's decision.

The exact wording and amount of evidence belong to the design stage.

The evidence should remain short enough to understand during a workout.

It is not a full training analysis report.

Most importantly, the application must distinguish evidence that actually contributed to the decision from related information that merely happened to be available.

Do not describe a data point as the reason for a recommendation if the engine did not use it.

### 4.6 RIR-aware explanations

Pitch 14 adds optional reps-in-reserve information to the progression engine.

Where RIR is available and materially influences the result, the explanation should acknowledge that influence.

For example, if the approved RIR rules qualify a progression decision because of reported effort, the recommendation should identify the relevant effort evidence in ordinary language.

Where RIR is missing, the explanation should rely on the other available evidence.

Missing RIR must not be treated as zero RIR.

The interface must not claim that a lifter trained to failure, had substantial repetitions remaining, or experienced unusually high effort unless supported by the actual recorded values and applied rules.

This pitch consumes the RIR-aware engine's established behavior.

It does not change RIR thresholds or decide new autoregulation rules.

### 4.7 Accurate recommendation-to-engine correspondence

The recommendation text and evidence must remain consistent with the engine's actual computed outcome.

This is the central integrity requirement of the pitch.

A progress result must not be displayed as a hold.

A hold result must not be dressed up as a recommendation to increase load.

A reactive deload result must not be presented as an ordinary scheduled deload.

If the underlying computed outcome changes because relevant history is corrected, the displayed recommendation and evidence must reflect the newly evaluated result.

There must be no independent, competing interpretation of training history that produces different advice from the authoritative engine.

The design/spec should define how the user-facing recommendation remains connected to the actual evaluation.

It should not create stored recommendation text that can become stale or contradict current training history.

### 4.8 Correct exercise and gym context

Overload distinguishes between gym-variable exercises and movements whose weights are globally comparable.

A machine or cable movement may have different working-weight baselines at different gyms.

Recommendation text must preserve those distinctions.

An explanation for a machine exercise at one gym must not incorrectly rely on a working weight from another gym as though the two represented identical resistance.

Free-weight and other globally comparable movements should continue using their established history rules.

The introduction of more detailed wording must not weaken gym-specific data isolation or baseline correctness.

### 4.9 Respect scheduled deloads

During a scheduled deload week, the existing engine suppresses reactive per-exercise progression and deload evaluation according to approved rules.

This pitch must preserve that behavior.

The interface must not generate a reactive progression instruction where the engine intentionally suppressed it.

If the product already communicates a scheduled deload state, the presentation should remain consistent with that state.

The distinction between a scheduled deload and a reactive recommendation must remain clear.

No additional deload scheduling behavior is introduced.

### 4.10 No automatic plan modifications

Progression recommendations remain advisory.

The lifter may choose whether and how to follow them.

A recommendation must not automatically change:

* Planned working weights.
* Target repetitions.
* Exercise order.
* Mesocycle structure.
* Gym-specific stored baselines.
* Historical workout records.

For example, seeing a recommendation to attempt a higher weight must not itself modify the next session's stored plan.

The existing plan-versus-history separation remains intact.

This is an explicit Pitch Roadmap acceptance criterion and a permanent product boundary.

### 4.11 Consistency across existing recommendation surfaces

The improved wording should be consistent wherever the existing application presents the progression engine's recommendations.

The same underlying evaluation should not receive contradictory explanations simply because it appears on a different screen.

The downstream design/spec should inspect the current product's recommendation surfaces and determine how the improvement is applied coherently.

However, this is not permission to build new major screens.

In particular, Pitch 16 owns the detailed per-exercise history and PR intelligence experience.

Pitch 15 establishes the recommendation language and evidence that Pitch 16 can reuse.

### 4.12 Presentation principles

The recommendation experience should be:

* Specific where the engine supports specificity.
* Brief enough to use during a workout.
* Grounded in actual logged evidence.
* Neutral and respectful.
* Consistent with the existing visual system.
* Clear about the difference between progress, hold, and deload.
* Understandable without requiring the lifter to inspect calculation details.

Avoid exaggerated claims such as "optimal weight," "perfect progression," or "guaranteed improvement."

Overload should help users make informed decisions without implying that its rules can perfectly predict training outcomes.

---

## 5. Primary user journeys

### Journey A — A lifter is ready to progress

1. The lifter completes their scheduled exercise.
2. The progression engine evaluates the relevant performance history.
3. The engine determines that progression is warranted.
4. Overload displays a recommendation describing the supported next action.
5. A concise evidence line explains what qualified the lift for progression.
6. The lifter can use that recommendation when planning or performing the next session.

The plan is not modified automatically.

### Journey B — A lifter should hold

1. The lifter logs their performed sets.
2. The engine determines that holding is appropriate.
3. Overload communicates that holding is the intended outcome.
4. Where applicable, brief evidence explains why progression is not yet warranted.
5. The lifter can continue training without receiving unnecessary warnings.

### Journey C — A reactive deload is recommended

1. The lifter completes a relevant session.
2. Existing progression rules identify qualifying performance difficulty.
3. The engine returns a reactive deload recommendation.
4. Overload explains the recommendation using the evidence that actually triggered it.
5. The lifter understands why backing off is being suggested.

The application does not diagnose the cause of reduced performance or change the training plan.

### Journey D — A bodyweight movement progresses

1. The lifter performs a pure bodyweight exercise.
2. The engine evaluates the relevant repetition history.
3. A progression outcome is computed.
4. The application presents guidance appropriate to a repetitions-only movement.
5. No unsupported external-weight instruction is displayed.

### Journey E — RIR materially influences a recommendation

1. The lifter logs performed sets with optional RIR.
2. The engine evaluates that information using Pitch 14's approved rules.
3. Reported effort materially influences the resulting recommendation.
4. The recommendation accurately reflects that outcome.
5. The evidence line identifies the relevant RIR information.

The wording does not re-evaluate the training history using separate RIR rules.

### Journey F — A lifter does not report RIR

1. The lifter logs weights and repetitions without RIR.
2. The engine evaluates the available history.
3. Overload displays an actionable recommendation based on that evaluation.
4. The evidence line includes only supported information.
5. No RIR value or effort-based conclusion is fabricated.

### Journey G — Historical performance is corrected

1. The lifter edits a previously logged set.
2. The canonical historical correction behavior updates the record.
3. The engine evaluates the corrected history.
4. The displayed recommendation reflects the current computed outcome.
5. The evidence remains consistent with that evaluation.

### Journey H — Scheduled deload week

1. The lifter is in an existing scheduled deload week.
2. The engine applies its established suppression behavior.
3. The application does not display a contradictory reactive progression recommendation.
4. Any visible scheduled-deload context remains distinguishable from reactive advice.

---

## 6. In scope

This pitch delivers **Smarter & Explainable Progression** as one complete user-facing capability.

It includes:

* Actionable recommendation wording for progress.
* Clear guidance for hold outcomes.
* Actionable wording for reactive deloads.
* Bodyweight-appropriate progression instructions.
* A concise evidence line for every non-trivial recommendation.
* Accurate presentation of RIR evidence where it affected the decision.
* Consistent use of the existing authoritative progression engine.
* Correct interpretation of gym-specific training context.
* Compatibility with missing RIR.
* Consistent recommendation behavior after historical corrections.
* Preservation of scheduled-deload suppression.
* Preservation of the advisory nature of recommendations.
* Appropriate updates to existing recommendation surfaces.
* A final User Guidance ticket through `/overload-onboarding`.

The work includes any necessary integration to surface existing computed evidence correctly, but does not authorize changing the underlying progression rules merely to enrich the wording.

---

## 7. Out of scope

### New progression algorithms

No additional progress, hold, deload, or stall thresholds for novelty.

### Reworking RIR autoregulation

Pitch 14 owns the deterministic rules describing how RIR influences evaluation.

### AI coaching

No chatbot, generative coaching engine, black-box recommendation model, or ungrounded natural-language training advice.

### Automatic plan changes

No automatic progression of stored working weights, exercise prescriptions, or mesocycle fields.

### Full exercise-history intelligence

No new per-exercise analytics destination, PR dashboard, historical progression timeline, or detailed chart suite.

Those belong to Pitch 16.

### New readiness indicators

No sleep, soreness, fatigue, recovery questionnaire, or overall training-readiness score.

### Expanded training metrics

No new lifting velocity tracking, volume-load analytics, or physiological monitoring.

### Gym baseline recalculation

Do not modify gym-specific baseline establishment or correction rules.

### Bodyweight logging changes

The existing reps-only behavior remains intact.

This pitch improves the recommendations associated with it.

### Workout generation

Overload continues to support lifter-created plans.

It does not generate or rewrite programs.

### Additional notifications

No reminders, push messages, email recommendations, or scheduled training alerts.

### Commercial or account features

No billing, marketing, signup changes, third-party email services, or general account redesign.

---

## 8. Definition of done

The Pitch Roadmap identifies three formal completion criteria.

### AC-1 — Evidence for every non-trivial recommendation

Every non-trivial progression recommendation shows concise evidence explaining the relevant reason for the result.

The displayed evidence must be based on the actual evaluated training information.

**Source:** Pitch Roadmap — Smarter & Explainable Progression, Definition of Done 1.

### AC-2 — Recommendation text matches the engine

The action and explanation communicated to the lifter match what the authoritative progression engine actually computed.

The UI must not invent a contradictory or independently calculated recommendation.

**Source:** Pitch Roadmap — Smarter & Explainable Progression, Definition of Done 2.

### AC-3 — Recommendations do not modify stored training data

Displaying or evaluating a recommendation never changes the lifter's plan or any stored working weight.

**Source:** Pitch Roadmap — Smarter & Explainable Progression, Definition of Done 3.

### Supporting scope requirements

The roadmap also requires actionable recommendation text for:

* Progress.
* Hold.
* Reactive deload.
* Bodyweight progression.

RIR should appear in the evidence when it matters.

These requirements come from the roadmap's Included scope rather than a separate acceptance-criteria section.

### PRD traceability gap

The supplied PRD identifies smarter recommendation wording as planned follow-on work, but does not contain a dedicated formal acceptance-criteria section for Pitch 15.

The formal criteria above therefore trace to the roadmap.

**Required upstream amendment:** Add the Pitch 15 criteria to the PRD if the project's documentation process requires PRD-level traceability for all later phases.

Do not invent additional formal PRD acceptance criteria.

---

## 9. Rabbit holes

### 9.1 Inventing recommendations the engine never computed

A more specific message may appear useful even when the current engine does not supply enough information to justify it.

For example, telling the lifter to add a precise number of pounds without an approved rule supporting that increment would introduce a new decision through the presentation layer.

The design/spec must distinguish specificity supported by the engine from unsupported advice.

### 9.2 Reimplementing progression logic in the UI

The application must not have one engine determining the official recommendation and another set of interface rules independently deciding what to display.

That creates contradictory behavior and undermines trust.

The displayed action and evidence must reflect one authoritative evaluation.

### 9.3 Changing thresholds to obtain better-looking explanations

This pitch should not alter approved progression rules just to make recommendation text more interesting or varied.

The roadmap explicitly defers such changes.

If a genuine correctness issue is discovered, handle it under the project's existing authority and stop policies rather than silently expanding the pitch.

### 9.4 Giving the appearance of certainty

Training recommendations are based on recorded performance and established rules.

They are not guarantees.

Avoid claims that a specific adjustment will inevitably produce muscle growth, prevent injury, or optimize recovery.

### 9.5 Citing evidence that did not affect the decision

A relevant RIR value or e1RM trend may be present without having qualified the actual result.

Mentioning that evidence as the reason for a decision would be misleading.

The recommendation must accurately describe the rule applied.

### 9.6 Making every hold visually prominent

A routine hold is often unremarkable.

Turning every ordinary hold into a large notification could overwhelm the workout interface.

Preserve the restrained presentation established by earlier work.

### 9.7 Confusing scheduled and reactive deloads

The two states have different meanings.

The interface must not present a scheduled deload as evidence of a reactive performance problem, or display reactive recommendations while the engine has suppressed them.

### 9.8 Ignoring equipment context

A machine load at one gym should not be interpreted as directly comparable to another gym's machine without the existing appropriate context.

Improved explanation text must not obscure those distinctions.

### 9.9 Mishandling missing RIR

Missing RIR means that the lifter did not provide an effort estimate.

It does not mean zero RIR.

Any explanation that relies on missing RIR would be invented evidence.

### 9.10 Duplicating Pitch 16

Displaying one concise evidence line is different from building an entire exercise-analysis experience.

Do not introduce historical charts, PR timelines, or a new analytics page here.

### 9.11 Stale recommendation text

Historical edits or new completed sets may change the authoritative evaluation.

The user-facing recommendation must not remain attached to an outdated result.

### 9.12 Overloading the logging interface

The primary purpose of the workout card is recording training.

Additional recommendation detail should be helpful without overwhelming the fast logging workflow delivered by Pitch 13.

The design stage should determine the appropriate hierarchy and disclosure of evidence.

---

## 10. No-gos

* No independent or competing progression engine.
* No invented progression increments or thresholds.
* No algorithm modifications merely for novelty.
* No AI-generated coaching advice.
* No invented RIR or effort evidence.
* No fabricated explanations.
* No recommendation text that contradicts the engine.
* No stored recommendation state that becomes disconnected from current history.
* No automatic changes to plans or working weights.
* No new reactive-deload rules.
* No changes to scheduled-deload suppression.
* No gym-baseline changes.
* No exercise-history analytics redesign.
* No new PR intelligence.
* No rest timer.
* No changes to canonical logged-set writes.
* No weakening of account isolation.
* No third-party email-service integration.

---

## 11. Dependencies

### Pitch 5 — Progressive Overload Engine

This is the formal roadmap dependency.

Pitch 15 depends on the engine's established outcomes, thresholds, evidence, and behavior.

The approved progression specification and current implementation remain authoritative.

### Pitch 14 — RIR Logging & Autoregulation

The roadmap identifies Pitch 14 as an enhancement used where available.

In the current build sequence, it precedes Pitch 15.

The recommendation experience should reflect approved RIR-aware results without redefining their rules.

If Pitch 14 has not shipped, do not invent effort-related data or assume its functionality exists.

### Pitch 4 — Guided Workout Logging

Existing logging surfaces display relevant workout state and progression guidance.

The recommendation changes must not interfere with recording performed sets.

### Pitch 13 — Faster Logging UX

The logging interface has already been optimized for fast set entry.

New evidence presentation must preserve that experience.

### Gym-Specific Weight Tracking

Existing gym-variable and globally comparable exercise distinctions govern which history may support a recommendation.

### Account Ownership & Isolation

All evidence derived from private workout records must remain scoped to the signed-in account.

### Onboarding Tour and What's New

Both guidance mechanisms should already be shipped in the current build sequence.

This pitch requires a final User Guidance ticket invoking `/overload-onboarding`.

### Downstream: Pitch 16 — Exercise History & PR Intelligence

Pitch 16 will introduce a dedicated place to inspect per-exercise training history, PRs, trends, current recommendations, and explanations.

It should reuse the recommendation and evidence behavior established here rather than inventing competing interpretations.

---

## 12. User guidance and release notes

This pitch changes how lifters understand progression recommendations.

It therefore includes a final guidance-maintenance ticket using `/overload-onboarding`, assuming both Onboarding Tour and What's New are shipped.

### Tour-step assessment

The skill should inspect the existing tour and determine whether the changes warrant:

* Updating an existing step that describes progression recommendations.
* Adding a new step if a genuinely new discoverable control is introduced.
* Making no tour change if the existing guidance remains accurate.

A richer evidence line does not automatically justify another tour step.

The skill makes the decision under its documented rubric.

### Release-note entry

This is a significant user-visible improvement to Overload's core training value.

A significant What's New entry is appropriate.

Illustrative copy:

**Clearer progression recommendations**

"Overload now explains what to do next and why. See clearer guidance for progressing, holding, or deloading, with supporting evidence from your training."

The actual published entry must describe only the functionality that shipped.

The shipping date must not be invented or backdated.

### Guidance maintenance boundaries

The final ticket must:

* Use the shipped tour registry and release-note content mechanism.
* Avoid changing the core tour or modal implementation merely to add guidance.
* Preserve stable tour-step identifiers.
* Verify relevant phone and desktop behavior.
* Verify light and dark presentation.
* Follow the project's established release-note publishing process.

---

## 13. Risks and verification focus

### Correctness of recommendation explanations

The highest-risk failure is a message that appears plausible but does not reflect what the engine actually computed.

Tests must compare the displayed action and evidence against authoritative evaluation results.

### No accidental training-data mutation

Reading or displaying recommendations must not alter the plan, recorded working weights, or historical sets.

This remains a formal roadmap requirement.

### Incomplete evidence

Where the engine cannot support a specific explanation, the application must not invent one.

The spec should define a truthful and usable presentation for those situations.

### Gym-context correctness

Explanations must respect gym-specific machine/cable history and existing globally comparable movement rules.

### Historical corrections

Recommendation wording must reflect recomputation from corrected history.

### Scheduled-deload suppression

No reactive explanation should appear in a situation where the engine intentionally suppresses that evaluation.

### RIR accuracy

RIR-based explanations must distinguish reported zero, positive values, and missing data.

### Bodyweight behavior

Reps-only movements must not receive unsupported weight-increase instructions.

### Account isolation

Private training history and derived evidence must remain isolated by account.

### UI clarity

The experience must remain usable during training and consistent with the existing visual design.

### Guidance maintenance

The final guidance ticket must evaluate tour relevance and prepare the appropriate release note.

---

## 14. Open questions and source gaps

### Decisions delegated to design and spec

**Actionable recommendation wording**

Determine how to present the engine's supported next action for each outcome.

**Evidence selection**

Determine which actual evaluated facts are most useful to display, how concise the explanation should be, and how to handle multiple contributing signals.

**Supported specificity**

Determine how to express progression when the engine supports a direction but not a precise numeric target.

**Hold presentation**

Determine how to preserve the restrained treatment of ordinary holds while making the intended action understandable.

**Reactive versus scheduled deload communication**

Determine how existing deload contexts are presented distinctly.

**Existing screen integration**

Determine where recommendation and evidence presentation belongs in the current interface without creating Pitch 16's new history views.

**Mixed RIR availability**

Determine how to present legitimate evidence when RIR is present, missing, or did not influence the outcome.

These choices belong to `/overload-design-doc`, `/overload-ui-design`, and `/overload-spec`.

### Existing decisions that must remain authoritative

* Progress, hold, and reactive deload rules.
* Scheduled-deload suppression.
* RIR qualification rules from Pitch 14.
* e1RM calculation and trend behavior.
* Bodyweight classification.
* Gym-variable equipment rules.
* Baseline establishment and correction.
* Historical correction semantics.
* Account ownership and isolation.

The design/spec stages must read their controlling specifications and current implementation rather than re-deriving thresholds.

### Source gap: exact merge policy

The Pitch Roadmap establishes the feature and its three completion criteria, but does not specify a merge gate for Pitch 15.

Given the importance of recommendation correctness, this pitch proposes stopping before the final feature merge for human approval.

**Required confirmation:** Check the authoritative pipeline guide and `CLAUDE.md` before treating that proposal as a project-wide standing rule.

### Source gap: action specificity

The roadmap requires actionable recommendation text but does not itself supply a universal load-increment rule.

The design/spec should use the existing approved engine contract to determine what degree of specificity is supported.

Do not silently add an invented progression threshold.

### PRD traceability gap

The supplied PRD identifies smarter recommendations as planned future work but does not provide a dedicated numbered acceptance-criteria section for Pitch 15.

The three formal acceptance criteria above are therefore traced to the roadmap, not misrepresented as PRD criteria.

---

## 15. Rollout and delivery boundary

This is a UI-bearing feature affecting how Overload presents progression-critical decisions.

The standard pipeline remains:

**Pitch → Design Doc → UI Preview → Spec → Linear Tickets → Implementation → Review → Audit → Final Verification**

### Design doc — `/overload-design-doc`

Define the user-facing action and evidence model, representative progress/hold/deload/bodyweight states, existing recommendation surfaces, and User guidance expectations.

### UI preview — `/overload-ui-design`

Create the binding preview of the revised recommendation presentation.

Include representative states for:

* Progress.
* Hold.
* Reactive deload.
* Pure bodyweight progression.
* RIR-influenced decisions.
* Decisions without RIR.
* Scheduled deload suppression where relevant.
* Phone and desktop layouts.

The preview should demonstrate clarity without unnecessarily expanding the logging interface.

### Spec — `/overload-spec`

Define how the authoritative engine's outcomes and supporting evidence are translated into recommendation text, and how consistency and non-mutation are verified.

The spec owns the precise integration decisions.

### Implementation — `/overload-ticket-worker`

Implement the recommendation experience using the approved design and spec.

The final ticket invokes `/overload-onboarding` to maintain tour and release-note content.

### Review — `/review`

Review the feature branch against `main`, with particular attention to evidence correctness, non-mutating behavior, and existing progression invariants.

### Review audit — `/overload-review-audit`

Resolve findings according to the established audit policy and rerun affected checks.

### Merge behavior

**Proposed stop before merge**, subject to the authoritative pipeline guide.

The completed feature should receive full verification and review before human approval if the guide classifies these changes as progression-critical.

Do not invent permission to bypass an applicable merge gate.

### Production safety

No autonomous run may apply production migrations, modify production training records, or enable production signup.

Any necessary deployment or manual verification steps belong in the runbook.

---

## 16. Handoff to design and spec

The following product outcomes are fixed:

 1. Progress recommendations describe a supported next action.
 2. Hold recommendations communicate the intended outcome without unnecessary alarm.
 3. Reactive deload recommendations explain the relevant performance evidence.
 4. Bodyweight progression wording respects the exercise's logging rules.
 5. Every non-trivial recommendation includes a concise evidence line.
 6. RIR evidence appears when it materially affects the result.
 7. Missing RIR is never invented or treated as zero.
 8. Recommendation text matches the authoritative progression engine.
 9. No second, independent progression engine is introduced.
10. Existing progression rules are not changed for novelty.
11. Scheduled-deload suppression remains intact.
12. Gym-specific history and baseline distinctions remain intact.
13. Historical corrections update the evidence used by recommendations.
14. Displaying a recommendation never modifies the plan or any stored weight.
15. New explanations remain consistent across relevant existing screens.
16. The fast logging experience is preserved.
17. No Pitch 16 exercise-history or PR analytics surface is built prematurely.
18. A final User Guidance ticket invokes `/overload-onboarding`.
19. The final merge follows the authoritative pipeline's protected-boundary rules.

The design stage determines the user-facing presentation.

The spec stage determines how to expose and translate the existing engine's actual computed results.

Neither stage should introduce unsupported coaching conclusions or silently change progression calculations merely to make the recommendations more specific.

**Completion outcome:** Overload gives lifters clear, actionable progression recommendations with concise explanations grounded in their own training evidence, making the existing progression engine more useful and trustworthy without automatically changing their plans.

**End of pitch.**
