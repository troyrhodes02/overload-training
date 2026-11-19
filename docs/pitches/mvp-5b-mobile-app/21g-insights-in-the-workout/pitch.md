# Pitch 21g — Insights in the Workout

> Source: the approved expansion in Linear, "Pitch 21g — Insights in the Workout" (Overload V1 project document, updated 2026-11-19 UTC). It is copied here unchanged in substance for the pipeline run of 2026-11-18, and it expands `docs/planning/mobile-roadmap.md` → "21g — Insights in the Workout (M to L)". No local pitch existed before this run, so there was nothing to reconcile.

**Project:** Overload V1
**Parent initiative:** Pitch 21 — Mobile App (React Native + Expo)
**Milestone:** Pitch 21g — Insights in the Workout
**Type:** Feature — Native mobile vertical slice
**Appetite:** M–L (Medium to Large)
**Priority:** High
**Status:** Ready for design and specification
**Client scope:** iOS native app using the existing backend, shared progression rules, and mobile API
**Plan placement:** Pro for progression recommendations and evidence; Free for logging, history, and the locked-state presentation
**UI-bearing:** Yes — native workout cards, scheduled-deload state, and completed-session summary
**Dependencies:** Pitch 21e — Workout Loop and Pitch 21f — Logging Completeness (both completed and Production-released)
**Pitch folder:** `docs/pitches/mvp-5b-mobile-app/21g-insights-in-the-workout/`

---

## 1. Overview

Pitch 21g brings Overload's established progression intelligence into the native workout experience.

The preceding mobile slices established the ability to start, perform, modify, complete, and review workouts from an iPhone. However, recording workouts is only one half of Overload's purpose. The product's central value is helping lifters answer a specific question:

**Based on my training history and the plan I'm following, what should I do with this exercise's working weight?**

Overload already answers that question in the web application through its rules-based progression engine, explainable recommendations, RIR-aware logic, gym-specific baselines, and scheduled-deload behavior. Pitch 21g makes those existing conclusions accessible at the moment they are most useful: while a lifter is training.

A Pro lifter should be able to open a planned exercise on their iPhone, understand the appropriate working-weight recommendation, see the evidence supporting it, perform the sets, and finish with a meaningful session summary.

A Free lifter should continue to enjoy complete workout logging without receiving restricted progression intelligence. The app should indicate that progression insights are a Pro capability without introducing a purchase flow into the native application.

**The objective is native presentation and parity with existing progression intelligence—not a new progression engine.**

---

## 2. Problem

Workout logging by itself still requires the lifter to interpret the numbers. A lifter can see that they performed 10 repetitions at 135 pounds last week and 11 repetitions at the same weight this week. But that information alone does not answer whether the next workout calls for more weight, a hold, or a reduction.

The question becomes more difficult when:

* The exercise has a prescribed repetition range.
* Multiple sets contribute to the progression decision.
* Recent performance is inconsistent.
* RIR suggests that the lifter's effort is changing.
* Estimated strength is improving despite unchanged working weight.
* Performance has repeatedly fallen short of the planned minimum.
* A gym-specific machine baseline differs from the lifter's other gym.
* There is not enough history to justify a recommendation.
* The lifter is in a scheduled recovery week.
* A previously entered set has been corrected.
* An exercise was swapped or performed outside its original planned context.

The existing web application handles these conditions using established progression rules. But without the equivalent native presentation, an iPhone user must leave the logging experience to obtain or interpret recommendations. That creates a disconnect between recording training and making decisions about training.

**Overload should not require the lifter to use two interfaces to understand one workout.**

---

## 3. Desired Outcome

After Pitch 21g, an eligible Pro lifter can complete a workout on the native iPhone app with the same progression guidance available in the web application. They can:

* See whether an exercise warrants progression, holding, or deloading.
* See the specific recommended working weight when the existing engine provides one.
* Understand the evidence behind the recommendation.
* Distinguish an actual hold recommendation from insufficient history.
* Understand when RIR contributes to a recommendation.
* See when the workout falls in a scheduled deload week.
* Understand why normal reactive progression signals are suppressed during scheduled recovery.
* Finish the workout and see a complete native session summary.
* Return to their training history without losing context.

A Free lifter can perform the same workout, record every set, and retain complete history while seeing an appropriate locked state for Pro insights.

The experience must remain fast, understandable, and usable with one hand.

**Success means Pro lifters receive the same progression decisions on the phone as on the web, while Free users retain unrestricted training capture and no access to Pro-only intelligence.**

---

## 4. Appetite and Scope

**Appetite: Medium to Large (M–L)**

The principal business logic already exists. This pitch should primarily reuse it through the established mobile architecture. The complexity lies in presenting several kinds of intelligence coherently within the existing native logging workflow:

1. Progression recommendation and evidence.
2. Scheduled-deload context.
3. Completed-session summary.
4. Free versus Pro capability states.

These capabilities share the same workout context and should be delivered as one coherent vertical slice. The appetite does not authorize rebuilding or substantially changing the underlying progression engine. If implementation becomes unexpectedly complex, prioritize faithful presentation of established web behavior over adding more analytical detail. The pitch should remain focused on actionable in-workout insights, not expand into a full native analytics dashboard.

---

## 5. Solution Shape

### 5.1 Progression Recommendations on the Logging Card

The existing native exercise card should surface the appropriate progression information for eligible Pro users. The recommendation should be discoverable without displacing the essential weight, repetitions, RIR, and Log Set controls. The experience should support the progression outcomes already established by the web application.

**Progress.** When the engine determines that the exercise warrants increasing working weight, the card should communicate that conclusion clearly. Where the existing engine provides a specific recommended weight, show it using the established unit and formatting rules. The lifter should understand that the recommendation is guidance, not a mandatory change to the prescribed workout.

**Hold.** When the engine explicitly recommends maintaining the current working weight, the card should explain that the recent performance does not yet justify increasing or reducing it. Preserve the distinction between an explicit hold conclusion and an ordinary unflagged exercise. The PRD's original progression-tag model allows a steady exercise to appear without a tag. The later explainable-progression feature may provide a more specific hold recommendation. The native presentation must follow the current authoritative web behavior rather than inventing a new classification.

**Reactive deload.** When existing rules determine that performance warrants reducing working weight, the card should clearly communicate the reduction recommendation. The recommendation must not be framed as punishment or failure. It should make the training rationale understandable and preserve the existing rules governing when reduced performance actually justifies deloading. A single low-repetition set must not automatically become an unsupported deload recommendation.

**Insufficient history.** If the lifter has insufficient reliable performance history to make a recommendation, show an appropriate neutral state. Do not invent a starting working weight, progression percentage, or confidence level. No recommendation is preferable to a misleading recommendation.

### 5.2 Specific Recommended Working Weights

When the existing engine provides a numerical recommendation, the iPhone should present it accurately and clearly. Requirements:

* Use the same recommendation value as the web.
* Respect weight units and existing rounding conventions.
* Respect the selected gym for gym-variable exercises.
* Use the appropriate shared history for gym-consistent exercises.
* Do not present weight from another gym as an authoritative machine recommendation.
* Do not create a recommendation from reference-only history.
* Preserve the existing distinction between recommended weight and logged weight.
* Do not automatically overwrite the prescribed plan or the lifter's entered weight.
* Never manufacture a numerical recommendation when the engine does not provide one.

If the current web experience supplies a recommended range, contextual condition, or more qualified recommendation, preserve that meaning. The native app should not compress important caveats into an inaccurate single number.

### 5.3 Explainable Recommendation Evidence

Overload's recommendation should not be an unexplained instruction. A Pro user should be able to understand why the app is suggesting progression, holding, or deloading. The logging card should provide access to the existing explanation and relevant supporting evidence. Depending on what the current shared progression system actually returns, that may include:

* Recent logged performance.
* Planned repetition targets.
* Achievement or failure of the applicable progression threshold.
* Recent working-weight context.
* RIR-related evidence.
* Estimated strength or trend evidence where already part of the recommendation.
* Stall or plateau information where already supported.
* Relevant gym and exercise context.
* Why a recommendation is unavailable or being suppressed.

These are categories of existing evidence, not authorization to introduce new metrics or scoring methods. **The native app must preserve the same underlying reasoning shown on the web.**

The explanation should be understandable without requiring the lifter to interpret a complex statistical dashboard. Detailed evidence may be progressively disclosed so that the main logging card stays visually restrained.

Expected behavior:

* The primary recommendation is visible or clearly accessible.
* Supporting evidence is available through a deliberate, understandable interaction.
* The evidence is associated with the correct exercise and gym.
* The displayed evidence and recommendation agree.
* The content remains readable at larger text sizes.
* Loading or unavailable evidence does not block set logging.
* A failed evidence request does not display a stale conclusion as current.

The design stage should determine the best native presentation using the established mobile design system.

### 5.4 RIR-Aware Recommendations

Pitch 21f delivered native RIR capture and editing. Pitch 21g completes the other side of that feature by showing existing RIR-aware progression reasoning in the native experience. Requirements:

* The recommendation respects the RIR-aware rules already implemented on the web.
* RIR evidence is presented only when relevant and actually supported.
* An omitted RIR remains missing data, not zero RIR.
* Zero RIR remains a meaningful recorded value.
* Editing a saved RIR value can change the resulting recommendation according to existing rules.
* The iPhone and web must agree after the correction.
* The app must not generate a new RIR-derived recommendation independently of the shared engine.

RIR entry itself remains part of Free training capture. **RIR-based progression interpretation remains a Pro capability.** This pitch must not introduce a new RIR formula, effort score, readiness model, or training-coaching system.

### 5.5 Scheduled-Deload Banner

The native workout experience should clearly communicate when the active mesocycle is in its scheduled deload week. This is distinct from an exercise receiving a reactive deload recommendation. A scheduled deload is planned recovery across the training block. A reactive deload is a recommendation driven by the exercise's performance. The distinction matters because the two features follow different rules.

Expected behavior:

* During a scheduled deload week, the native workout view displays a clear scheduled-deload banner or equivalent prominent state.
* The message explains that this is planned recovery.
* The current workout reflects the existing reduced-load/intensity behavior.
* Reactive per-exercise progression and deload checks remain suppressed as required by the shared rules.
* The app does not present contradictory progress and reactive-deload guidance during the scheduled week.
* The banner disappears when the scheduled deload period ends.
* Normal reactive recommendations resume afterward.
* The same state appears on the web and iPhone for the same account and training date.

Special attention is required when missed-day handling changes the effective position of a scheduled workout. A workout shifted into or out of the deload week must follow the established calendar and schedule rules. The native UI must not determine scheduled-deload status using an independent interpretation of the calendar.

### 5.6 Full Native Session Summary

Pitch 21e introduced a basic post-workout summary. Pitch 21g expands that existing surface to the full agreed native summary. The summary should help the lifter understand what they accomplished and what the recorded performance means. It should remain concise enough for a phone.

Expected content, consistent with existing web behavior and the agreed mobile scope:

* Completed workout identity and date.
* The relevant exercises and saved performance.
* Completion state.
* Any supported progression outcomes for eligible Pro accounts.
* Relevant evidence or insight summaries when available.
* A meaningful progression visualization or percentage-toward-goal view when applicable to the current feature scope and available data.

The PRD calls for a post-session summary featuring a progression chart or percentage-toward-goal view, **not a full statistical breakdown**. The design stage must identify which already-supported summary content can be shown in 21g without pulling forward the full Goals and Exercise History experience from 21i. The summary must distinguish ordinary workout facts, which are Free, from progression interpretation, which is Pro.

Requirements:

* The summary appears only after the appropriate confirmed workout completion.
* Saved data remains authoritative.
* The summary reflects performed exercises, including substitutions and skips.
* Additional or reduced sets are represented correctly.
* RIR information remains consistent with the saved record.
* Cardio and strength completion retain their established independent semantics.
* The summary never implies that unsaved entries were completed.
* The lifter can leave the summary and return to Today or History.
* Reopening a completed workout does not create duplicate completion effects.
* A user can review their recorded workout even if Pro access has expired.

The summary must not become a second source of truth for logged performance or recommendation outcomes.

### 5.7 Free Account Locked State

The mobile roadmap explicitly requires a Free account to see the locked state. This must be implemented without a native purchase flow. Free users continue to have full access to ordinary training capture and history. The native app may indicate that progression recommendations and supporting evidence are part of Pro, but must not expose protected conclusions through the API or UI.

Requirements:

* The Free user can start, log, edit, complete, and review workouts.
* Weight, reps, RIR capture, exercise swaps, skips, and cardio remain available under their established rules.
* Pro recommendations and evidence are locked.
* Restricted values are not fetched and then merely hidden on the device.
* The server applies the existing capability gate.
* A Free user cannot retrieve Pro insights by calling the mobile endpoint directly.
* The locked state is visually understandable.
* The locked state does not obscure essential workout logging controls.
* A subscription lapse does not remove saved training history.
* Pro access changes are reflected correctly after the authoritative account state is refreshed.

The app must preserve the established distinction between capturing training data and interpreting it.

### 5.8 Quiet Pro Note — No Purchase Link

The roadmap calls for a **quiet Pro note with no purchase link**. The native presentation should be informational rather than promotional. A brief label such as "Progression insights are available with Pro" is an illustrative content direction, not final approved copy. The design stage should choose the exact wording consistent with the established product language.

Boundaries:

* No checkout.
* No pricing link.
* No external purchase link.
* No Stripe portal button.
* No App Store payment sheet.
* No subscription upsell modal.
* No persistent promotional obstruction.
* No interruption of workout capture.

The user should understand why the insight is locked without feeling forced into a purchase decision in the middle of training.

### 5.9 Correctness After Data Changes

Recommendations are derived from saved training history. Pitch 21f allows the lifter to edit past sets, RIR, gym context under supported rules, exercise substitutions, and workout occurrences. The native progression experience must remain correct when those actions change the underlying evidence.

Expected behavior:

* Editing a past set causes subsequent recommendation reads to reflect the corrected history.
* Editing RIR is interpreted through existing shared rules.
* Gym-specific context is preserved.
* A skipped exercise does not contribute fabricated performance.
* An exercise swap does not attach performance to the wrong exercise.
* Insufficient data remains insufficient rather than producing fabricated conclusions.
* Previously viewed insights are not falsely presented as current after a relevant change.
* The resulting recommendation remains consistent with the web.

The established principle remains binding: **Logged sets are authoritative. Progression conclusions are derived, not independent stored records.** Do not introduce cached recommendation values that can diverge from corrected history.

### 5.10 Preserve One-Handed Workout Logging

The additional intelligence must not degrade the primary workout interaction. Pitch 21e and 21f established a functioning native workout experience with reliable keyboard behavior, focus management, set persistence, RIR capture, and exercise navigation. These behaviors must continue working.

Requirements:

* Weight and reps remain easy to enter.
* RIR remains accessible.
* The active row and important actions remain visible above the keyboard.
* The Done action dismisses the keyboard without losing values.
* The Log Set action remains accessible.
* The app does not unexpectedly change keyboard focus when insights load.
* Recommendation panels do not cover input fields or intercept taps.
* Moving between exercises keeps fields responsive.
* Long exercise names remain readable without breaking navigation.
* Large text and accessibility settings do not make the primary logging actions unreachable.

**Insights should support the lifter's next decision, not compete with the act of logging a set.**

---

## 6. Native User Experience Principles

**The answer comes first.** The primary workout insight should be immediately understandable. The lifter should not need to inspect a chart, scroll through multiple sections, or open a separate analytics page just to learn whether the current recommendation is to progress, hold, or deload.

**Evidence is available, not overwhelming.** Explainability is essential, but the complete explanation need not occupy the primary logging card at all times. Use the existing mobile design patterns to distinguish an immediate recommendation from its supporting details.

**Recommended does not mean mandatory.** The lifter retains control over the weight and reps they actually perform. A recommendation must not silently rewrite the plan, replace an entered value, or prevent the user from logging a different legitimate performance.

**Distinguish different kinds of recovery.** Scheduled deload and reactive deload are different concepts. Their presentation must be consistent with that distinction.

**Missing evidence must remain missing.** A lack of history, unavailable trend, missing RIR, or unestablished baseline must never be represented as a valid recommendation.

**No interruption of training.** Insights loading, entitlement checks, and evidence failures must not block ordinary workout capture.

**Accessible by default.** Labels should communicate recommendation meaning without relying on color alone. VoiceOver, Dynamic Type, reduced screen space, and light/dark themes must remain supported.

---

## 7. Free and Pro Capability Boundaries

| Capability | Free | Pro |
| -- | -- | -- |
| Start, resume, and finish workouts | Available | Available |
| Weight, reps, and RIR logging | Available | Available |
| Gym selection, swaps, skips, and cardio | Available | Available |
| Edit saved training data | Available | Available |
| Workout History and saved performance | Available | Available |
| Basic completion information | Available | Available |
| Progression recommendations | Locked | Available |
| Recommendation evidence | Locked | Available |
| RIR-informed progression interpretation | Locked | Available |
| Pro-only trend/stall conclusions | Locked | Available |
| Scheduled-deload workout context | Available as necessary for correct logging | Available |
| Pro interpretation in session summary | Locked | Available |
| Native purchase or checkout | Not included | Not included |

The existing capability model remains authoritative. Do not add a new Pro entitlement or change subscription rules. The server must enforce the boundary. The Free experience must never lose access to the user's own recorded performance. A scheduled deload must still be applied correctly to Free users' training context, even when premium interpretation is unavailable.

---

## 8. Data Integrity and Security

**8.1 Account isolation.** Every progression read must operate within the authenticated account's data. A user must not be able to request another account's recommendations, evidence, training records, mesocycle, gyms, or workout summary. The same rules apply to custom exercises and historical records.

**8.2 Server-side entitlement enforcement.** The mobile API must use the established capability-gated progression path. A Free user must not receive Pro-only recommendations or evidence in a response that the native client simply conceals. Existing server-side gating rules must be reused.

**8.3 Logged history remains authoritative.** Progression information must derive from the applicable logged sets and established plan context. Do not persist independent authoritative copies of progress tags, deload calls, e1RM calculations, or explanation results.

**8.4 Gym-specific correctness.** The same lift performed on two non-equivalent machines must not receive a recommendation based on the wrong gym's baseline. The existing gym-variable classification remains authoritative.

**8.5 Historical corrections.** Edits to previously recorded sets must be reflected in later recommendation reads. The original historical record associations must remain intact.

**8.6 Scheduled-deload suppression.** During a scheduled deload period, normal reactive progression/deload checks must remain suppressed in accordance with existing business rules. The native app must not independently override those rules.

**8.7 Backward compatibility.** Any necessary new mobile API behavior must be additive and compatible with existing supported app versions. The existing minimum-version gate and API error conventions remain in force.

---

## 9. Definition of Done

**A. Progression recommendation parity.** A Pro account sees the appropriate progression recommendation on the native logging card. Progress recommendations match the web. Hold recommendations or unflagged hold states match the current web behavior. Reactive deload recommendations match the web. Numerical suggested weights match when the existing engine provides them. Gym-specific recommendation context remains correct. Insufficient history produces no fabricated recommendation. The app does not independently compute a conflicting progression result.

**B. Explainability.** Pro users can access the evidence supporting a recommendation. Evidence matches the correct exercise and workout context. RIR-aware evidence follows existing rules. Recommendation and evidence remain mutually consistent. An unavailable evidence request is handled without blocking logging. Updating past performance changes subsequent insight results appropriately.

**C. Scheduled deload.** The scheduled-deload banner appears during the designated period. The banner communicates planned recovery clearly. The existing reduced-load/intensity behavior is respected. Reactive recommendations are suppressed during scheduled deload. Normal progression recommendations resume afterward. Shifted or late workouts follow the authoritative schedule semantics. Free and Pro users receive appropriate scheduled-deload context.

**D. Full session summary.** Completion displays the expanded native summary. Saved workout information is correct. Swapped and skipped exercises are represented accurately. Extra or reduced sets remain consistent with history. Cardio and strength status remain correct. Pro insights are shown only when authorized. Free users can still review ordinary workout details. A relevant chart or goal-progress summary is present when supported by the agreed scope and available data. Leaving and reopening the summary does not modify or duplicate logged records.

**E. Free and Pro separation.** Pro users receive their authorized recommendation and evidence data. Free users see a clear locked state. The quiet Pro note contains no purchase link. Free users never receive Pro-only API payloads. Free logging and History remain fully usable. Subscription or trial-state changes do not expose stale restricted values. Server-side entitlement tests pass.

**F. Reliability and usability.** One-handed set logging remains functional. Focus and keyboard behavior are not degraded. Navigating between exercises never makes inputs unresponsive. Insight loading does not interfere with saving. Network failure states are recoverable. Workout resume and completion remain correct. Light and dark appearance work. Larger text remains readable and usable. VoiceOver announces recommendation meaning clearly. Relevant touch targets remain accessible.

**G. Security and cross-platform consistency.** A second account cannot access another account's insights. Free users cannot bypass the Pro gate. Gym-specific data does not leak across contexts. The same account receives equivalent recommendations on web and iPhone. Existing versioned mobile API compatibility is preserved.

**H. Testing and owner acceptance.** Automated web, mobile, integration, and account-isolation tests pass. Applicable API entitlement and backward-compatibility tests pass. Lint, typecheck, formatting, workspace boundaries, and iOS bundle verification pass. Staging deployment succeeds. A compatible Expo staging update is published through the approved safety-checked workflow. Realistic development fixtures cover progression, hold, reactive deload, scheduled deload, insufficient history, Free and Pro. The owner verifies the experience on a physical iPhone. Identified regressions are corrected and retested. The owner explicitly accepts 21g before Production promotion.

**Primary success criterion:** A Pro account sees the same progression calls and evidence on the phone as on the web, while a Free account sees the correct locked state and retains full logging capability.

---

## 10. Test Scenarios Required for Acceptance

The design and specification stages must provide a realistic staging test strategy. Separate disposable accounts or reproducible fixture states should be available for cases where logging would consume or alter the original condition.

1. **Progress recommendation.** A Pro account has sufficient valid history to receive an existing progress recommendation. Verify the recommendation, suggested weight, and evidence against the web.
2. **Hold.** A Pro account has history producing a legitimate hold or unflagged steady state. Verify that the iPhone faithfully represents the current shared-engine result.
3. **Reactive deload.** A Pro account has sufficiently poor historical performance under the existing rules to trigger a reactive deload. Verify both the result and its rationale.
4. **RIR-aware recommendation.** A Pro account has logged RIR values relevant to the current progression decision. Verify that the explanation uses those values correctly and that missing RIR is not interpreted as zero.
5. **Scheduled-deload week.** A Pro account is in a scheduled deload week. Verify the banner, appropriate training context, and suppression of reactive checks.
6. **After scheduled deload.** A Pro account is back in a normal training week. Verify that scheduled-deload presentation has ended and reactive progression behavior resumes.
7. **Insufficient history.** A new exercise or new gym-dependent machine has insufficient history. Verify there is no invented progression recommendation or authoritative suggested weight.
8. **Gym-specific parity.** An exercise has different machine histories across two gyms. Verify that the recommended weight and evidence follow the selected gym.
9. **Historical correction.** Correct a previously saved set or RIR value. Verify that the next recommendation read reflects the corrected data without duplicating records.
10. **Free account.** Use an account with a verified Free entitlement. Verify that recommendations and evidence are locked, that direct mobile API access remains gated, and that workout logging still works.
11. **Pro access changes.** Use an appropriately controlled development fixture to verify transition from Pro access to Free access. Ensure stale or cached premium content does not remain accessible after the entitlement changes.
12. **Completed workout summary.** Complete a real-shaped workout containing logged performance, an exercise substitution or skip, and applicable insight data. Verify the final summary and compare it with saved History.
13. **Failure and recovery.** Test unavailable network access, failed insight requests, foreground/background transitions, and restarting an in-progress workout. Ensure training capture remains available whenever the existing online requirements permit it and no previously entered data is incorrectly marked saved.
14. **Accessibility.** Verify recommendations and explanations in light and dark modes, at larger text sizes, and with VoiceOver. Color must not be the only indicator of progress, hold, or deload.

The account-seeding workflow must verify that each fixture truly produces its intended recommendation through the existing progression engine. Do not create fabricated UI-only recommendation values just to make test scenarios appear.

---

## 11. Rabbit Holes and Risks

1. **Accidentally rebuilding progression logic.** The native app must consume the existing engine. Independent mobile calculations would create conflicting recommendations and duplicated business rules.
2. **Misrepresenting hold.** The original PRD uses an unflagged steady state, while later explainable progression may offer explicit hold guidance. The design must follow the current authoritative result and preserve its meaning.
3. **Scheduled versus reactive deload confusion.** A scheduled deload is planned recovery. Reactive deload is a performance-based recommendation. Combining them into one generic deload state would be misleading.
4. **Premium information leakage.** Hiding a Pro result after downloading it is not sufficient. Server-side capability gating and isolation remain mandatory.
5. **Stale conclusions after editing data.** A previously viewed recommendation must not remain presented as current when its evidence has changed. The correct derived state must be obtained through the established read path.
6. **Recommendation and prefill confusion.** A recommended future weight is not automatically the weight the lifter is about to log. The existing trusted-prefill and reference-only rules must remain distinct from progression guidance.
7. **Gym-specific machines.** Gym-dependent machine baselines must not be treated as interchangeable across locations.
8. **Insufficient or inconsistent evidence.** Incomplete history, missing RIR, or an unestablished gym baseline must not produce unjustified recommendations.
9. **Overcrowding the logging card.** The native logging card is already a dense interaction surface. Evidence presentation must not make logging slower or reintroduce the keyboard and focus problems found during 21e.
10. **Expanding the summary into 21i.** The full session summary should be useful and faithful to the PRD without building a separate exercise-history dashboard or new goal-management screens.
11. **Complicating Free capture.** A Free user's workout must remain usable even though progression insights are locked. The Pro note should not become a disruptive upsell.

---

## 12. Explicit Non-Goals

Pitch 21g does not include: new progressive-overload formulas; new reactive deload thresholds; new RIR-driven recommendation algorithms; changes to the established e1RM calculation; a new readiness or fatigue score; AI-generated training recommendations or coaching; automatic changes to working weights or workout templates; automatic execution of a suggested weight change; new workout logging capabilities beyond 21f; new gym or exercise management screens; a complete native plan builder; full exercise history and PR intelligence screens (21i); a full native goals interface (21i); a new analytics dashboard; new persistent progression-result storage; new billing or entitlement models; in-app checkout, external purchase links, or subscription management; paywall interruption during a workout; cardio progression recommendations; wearable, HealthKit, Apple Watch, or Live Activity features; offline-first logging or background synchronization; Android implementation; TestFlight or App Store distribution; Production-connected native builds before the authorized mobile release stage; unrelated web UI redesigns.

Existing web business rules should remain stable except for narrowly justified correctness fixes required for parity.

---

## 13. Dependencies

* **Pitch 21b — Shared Package & Contracts:** the shared progression functions, validation, types, and calculation rules.
* **Pitch 21c — Mobile API & Auth Foundation:** authenticated, versioned, account-scoped mobile API access and the server-side entitlement boundary.
* **Pitch 21d — App Shell, Design System & Accounts:** native navigation, theming, loading/error components, authentication, and lifecycle behavior.
* **Pitch 21e — Workout Loop:** Today, the active workout, logging card, completion, basic summary, and History.
* **Pitch 21f — Logging Completeness:** RIR entry, gym selection, swap/skip, historical edits, set-count adjustment, and the remaining native logging behaviors.
* **Existing web intelligence (authoritative behavior):** Progressive Overload Engine; Scheduled Deload; RIR Logging & Autoregulation; Smarter & Explainable Progression; Exercise History & PR Intelligence where evidence is already part of the recommendation; Plans, Billing & Promo Codes capability enforcement.
* **Downstream:** 21h — Plans, Library & Gyms; 21i — Goals & Exercise History (dedicated intelligence and history screens, including the agreed native chart); 21j — Account & Settings; 21l — TestFlight Beta.

---

## 14. Open Questions for Design and Specification

Resolve by inspecting the current web implementation, shared progression engine, mobile API contracts, and canonical specifications, and record the answers under the spec's **Resolved Decisions**.

* **Q1. Existing recommendation presentation.** What exact progression outcomes, labels, suggested weights, and evidence fields does the current web implementation expose?
* **Q2. Hold and unflagged states.** When does the current engine explicitly return hold guidance, and when should an exercise remain unflagged?
* **Q3. Recommendation timing.** At which points during workout logging should the native experience request or refresh insights?
* **Q4. Suggested weight versus prefilled weight.** How should the native UI distinguish an authorized progression recommendation from the established trusted-history prefill?
* **Q5. Evidence interaction.** What evidence is immediately visible on the logging card, and what appears through an additional detail interaction?
* **Q6. Scheduled-deload wording.** What is the current authoritative scheduled-deload message?
* **Q7. Completed-session summary.** Which summary elements already exist in the web experience, and which are genuinely part of 21g rather than 21i?
* **Q8. Summary visualization boundary.** Does 21g require a small existing-style progression or goal visualization, or should the summary link to information later provided in 21i?
* **Q9. Capability-gated API coverage.** Can the current mobile API already return all necessary authorized recommendation and evidence states? If not, identify the minimum additive, backward-compatible changes.
* **Q10. Free locked-state content.** What information can a Free user see without revealing Pro reasoning or values? How should the quiet Pro note be worded?
* **Q11. Entitlement transitions.** How should the app refresh the authorized insight state after trial expiration, subscription lapse, or a change in access?
* **Q12. Insufficient-history behavior.** How does the current web implementation represent insufficient, reference-only, or unreliable history?
* **Q13. Scheduled-week calendar behavior.** How does the existing shared schedule resolve missed days, shifted weeks, and the effective scheduled-deload period?
* **Q14. Existing mobile API and implementation overlap.** Which insight-related fields, summary details, or scheduled-deload signals were already delivered in 21e or 21f?
* **Q15. Test fixture design.** How can real-shaped development accounts reliably produce progress, hold, reactive deload, RIR-aware, scheduled-deload, and insufficient-history scenarios using the authoritative engine?

**Owner-decision boundary:** Surface any proposed new progression formula, entitlement change, destructive historical data change, migration, native dependency, or expanded billing surface for explicit approval before implementation.

---

## 15. Delivery and Release Gates

**Pitch → Design Document → Native UI Design → Specification → Linear Tickets → Implementation → Review → Staging → Physical-iPhone Acceptance → Separate Production Promotion**

* **Design stage:** inspect the current web progression experience and the existing native logging card; document the native recommendation hierarchy, evidence interaction, scheduled-deload treatment, and session summary with `/overload-mobile-ui`. Because this is a mobile-only pitch, the separate web-style UI preview stage is skipped according to the canonical mobile pipeline.
* **Specification:** authoritative progression-result mapping; existing and necessary additive API contracts; server-side capability checks; native loading and error behavior; recommendation freshness; scheduled-deload context; summary behavior; Free and Pro states; accessibility; backward compatibility; account isolation; acceptance tests.
* **Linear tickets:** coherent, reviewable tickets. Keep the progression recommendation and its native presentation together as a complete vertical capability.
* **Implementation and verification:** from the latest staging baseline; all web, mobile, integration, entitlement, security, compatibility, and history-integrity checks; iPhone recommendations match authorized web results from the same staging account and training context.
* **Staging delivery:** merge into staging; use the safety-checked Expo staging publisher when the existing development build is compatible; do not bypass native runtime or environment checks.
* **Owner acceptance:** on a physical iPhone with reproducible, scenario-specific development accounts: progress, hold, and reactive deload; specific recommended weights; evidence; RIR-aware explanation; scheduled-deload suppression; insufficient history; gym-specific recommendations; Free locked state; Pro access changes; session summary; History consistency; keyboard and focus regression; network failure and retry; light/dark, larger text, and VoiceOver.
* **Production promotion:** a separately authorized stage after staging acceptance. Publishing to Expo staging does not authorize a Production Expo update or App Store distribution.

---

## 16. Final Success Statement

Pitch 21g is successful when the native workout experience does more than record sets. A Pro lifter opens an exercise and understands what Overload recommends, what performance supports that conclusion, and whether a planned deload changes the normal progression logic. The lifter can still choose what weight to perform, record their actual training, and finish with a clear summary. A Free lifter continues to log and review their workouts without restriction, while seeing an appropriately locked Pro intelligence state.

The iPhone and web agree because they consume the same authoritative training history, progression rules, and capability boundaries.

**21e made workouts possible on the phone. 21f made logging complete. 21g makes the native workout intelligent.**
