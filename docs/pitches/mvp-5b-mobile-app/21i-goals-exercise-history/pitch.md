# Pitch 21i — Goals & Exercise History

> Source: the approved expansion in Linear, "Pitch 21i — Goals & Exercise History" (Overload V1 project document, updated 2026-11-24 UTC). It is copied here unchanged in substance for the pipeline run of 2026-11-24, and it expands `docs/planning/mobile-roadmap.md` → "21i — Goals & Exercise History (M)". No local pitch existed before this run. The separately tracked chore "Native Weekly Scheduling Parity" (OVE-241) ships in the same staging update but is not part of this pitch (§10.10, §11).

**Project:** Overload V1
**Parent initiative:** Pitch 21 — Mobile App (React Native + Expo)
**Milestone:** MVP 5B — Mobile App (Linear milestone "Pitch 21i — Goals & Exercise History")
**Type:** Feature — Native mobile vertical slice
**Appetite:** M (Medium)
**Status:** Ready for design and specification
**Client scope:** Native iOS, with targeted web parity corrections where needed
**UI-bearing:** Yes
**Dependencies:** Pitches 21a–21h completed

---

## 1. Overview

Pitch 21i brings Overload's existing strength goals, exercise-specific history, personal-record intelligence, and progression visualization into the native iPhone application.

The preceding mobile slices established the core training experience: 21e — Workout Loop; 21f — Logging Completeness; 21g — Insights in the Workout; 21h — Plans, Library & Gyms.

The native application now supports the daily workout, logging, progression guidance, plan browsing, exercise discovery, and gym management. However, a lifter still needs a native way to answer two important questions:

1. **What am I working toward?**
2. **How has this particular lift progressed over time?**

Those answers already exist in Overload's established web capabilities. Pitch 21i brings them to the iPhone without creating a second goal system or progression engine.

The lifter should be able to open an exercise, review its training history, understand its personal records and progression trend, and see any relevant strength goal. They should also be able to create and manage strength goals from the phone.

This pitch introduces the first native exercise-history line chart, using the same authoritative e1RM information as the web application.

The result is a more complete native training experience in which the lifter can move naturally between logging, reviewing performance, and working toward a target.

## 2. Problem

Overload's core value is not simply recording weight and repetitions. It helps lifters understand their performance and make better progression decisions.

The current native workout experience provides recommendations while training, but the deeper exercise-specific context remains incomplete. A lifter may want to know:

- What did I lift the last few times I performed this exercise?
- Am I stronger than I was several weeks ago?
- Have I reached a new personal record?
- Is my estimated strength trending upward or flattening?
- How close am I to my current goal?
- What goal should I set next?

Requiring the user to leave the iPhone application for the web exercise-history and goal screens interrupts the native experience. It also creates a gap between the immediate recommendation shown during a workout and the longer-term evidence that supports it.

The goal is not to invent new analytics. The goal is to make Overload's already-established history, records, goals, and progression intelligence accessible and understandable on the iPhone.

## 3. Desired Outcome

After completing 21i, a lifter can:

- Open their strength goals on the phone.
- See active goals and progress.
- Create a goal for an exercise.
- Review completed and archived goals.
- Understand when a goal has been achieved.
- Set a new goal after completing an earlier one.
- Open an exercise's complete relevant logged history.
- Review recorded weight, repetitions, and applicable RIR.
- Understand personal-record information.
- View a native e1RM progression line chart.
- Inspect how the lift has developed over time.
- Move between exercise details, workout History, and the relevant goal.
- Use the experience consistently with the web application.

The phone should communicate authoritative information without requiring the user to interpret a collection of disconnected workout records.

**Success means a lifter can see and set goals and understand their lift history from the native application.**

## 4. Appetite and Scope

**Medium (M).** Pitch 21i contains several closely related capabilities, but they already exist in Overload's web application and training domain. The implementation should primarily involve bringing those capabilities into the native experience. The main areas are:

1. Native strength-goal screens.
2. Exercise-specific logged history.
3. Personal-record and progression intelligence.
4. One native exercise-history line chart.
5. Navigation between these related surfaces.

The pitch should reuse existing data, calculations, validation, and entitlement rules. Do not rebuild the progression engine, create a new PR calculation system, or design a general-purpose analytics dashboard. If the actual implementation reveals a scope substantially beyond Medium, identify the reason and preserve the minimum coherent user-facing capability.

## 5. Solution Shape

### 5.1 Native Goals Overview

Introduce a dedicated native view of strength goals. The lifter should be able to see their current active goals without needing to visit the website. Each goal should communicate the existing authoritative information relevant to its progress, including: exercise name; target weight; target repetitions; current progress where permitted; completion state; appropriate access to the underlying exercise.

The lifter should be able to distinguish active goals from completed goals. Multiple goals may be active across different exercises, while the established rule of one active goal per exercise remains intact.

The experience should be clear for accounts with: several active goals; one active goal; only completed goals; no goals; goals whose exercise has since been archived. Goals must remain tied to the correct authoritative exercise identity.

### 5.2 Create a Strength Goal

A lifter can establish a numeric strength target on the iPhone. The goal uses Overload's existing model: **Exercise + target weight + target repetitions.** The native creation experience must follow the same validation and ownership rules as the web application. A valid goal should become visible on both clients.

The existing one-active-goal-per-exercise rule must be preserved. If the lifter selects an exercise that already has an active goal, use the established web/domain behavior rather than creating a second ambiguous active goal. A failed or retried creation must not generate duplicate goals. The creation experience should use the existing exercise library rather than maintaining another copy of the exercise catalog.

### 5.3 Goal Progress

A lifter should be able to understand how close their current performance is to a goal. Overload's existing goal model uses estimated one-repetition maximum to compare the target against recorded performance. The mobile app must present the same authoritative progress information as the web. The progress display should make clear: the target; the current evaluated performance; progress toward that target; whether the goal has been achieved.

Do not calculate a different progression percentage in native code. Do not treat an insufficient-history state as proof that the lifter is making no progress. Do not invent performance values or use missing information as zero. The presentation may be native-specific, but the calculation and outcome must agree with the existing web application.

### 5.4 Goal Completion and Archiving

The PRD establishes that reaching a goal triggers a completion moment and archives the achieved goal. The native experience should reflect this existing lifecycle. Expected behavior: an achieved goal is recognized through the authoritative goal logic; the user can identify that it was completed; the completed goal remains part of their goal history; the completed goal no longer conflicts with setting a new active goal for the same exercise; the user has an appropriate path to create a new goal.

The celebration should feel satisfying without obstructing workout logging. Completion must not be generated solely by a native animation or client-side threshold estimate. Do not create duplicate celebrations when an already-completed goal is reopened.

### 5.5 Goal History

The user can review goals they have previously completed or archived. The experience should preserve: exercise identity; target weight and repetitions; relevant completion information; existing historical status. A completed goal should not disappear simply because a new goal is set for the same exercise. Goal history must remain accurate even if the associated exercise is archived. The design stage should inspect how manually archived, replaced, and achieved goals are distinguished in the existing implementation. Do not invent a new goal lifecycle in this pitch.

### 5.6 Exercise-Specific History

The lifter can open an exercise and review its recorded performance over time. This should include relevant logged data from across the account's training history rather than only the current week or active mesocycle. The history experience should use authoritative workout records. Relevant information includes: exercise identity; logged session date; performed weight and repetitions; set information; RIR where recorded; gym context where applicable; existing workout associations.

The user should be able to distinguish separate performances of the same exercise. Historical records must remain correct after: an exercise swap; an exercise being archived; a workout from an earlier mesocycle; a historical set correction; a gym being archived; a workout performed on a temporarily rescheduled day. The history view must represent what was actually performed. It must not replace recorded performance with the current template prescription.

### 5.7 Connection to Existing Workout History

Pitch 21e already provides all-time workout History. Pitch 21i must extend that experience rather than duplicate it. A lifter should be able to move between: an exercise's history; a recorded workout containing that exercise; exercise details; applicable goal information. Use native navigation patterns that preserve context. If the user returns from a historical workout, they should not have to reconstruct the exercise they were reviewing. Viewing historical performance must not accidentally start a workout or edit a record. Existing historical editing capabilities remain under the logging rules already delivered.

### 5.8 Personal Records and Exercise Intelligence

The mobile roadmap includes PR intelligence. The native experience should display the established personal-record information already provided by the web application. This is not permission to define new types of records or new scoring formulas. The design stage must inspect the current web feature and approved Pitch 16 specification to determine: which record categories are authoritative; which logged sets qualify; how records are dated; how records change after historical corrections; how gym-specific exercise performance is handled; how unavailable or insufficient evidence is presented. Personal-record information should remain grounded in actual stored training data and established derived calculations. A historical correction must change the displayed records if the authoritative evaluation changes.

### 5.9 Native Exercise-History Line Chart

This pitch introduces **one native line-chart experience** for exercise history. The chart should make progression across time understandable without requiring the lifter to inspect individual workouts. Use the existing authoritative e1RM trend semantics. The chart should communicate: recorded progression over time; the associated dates; the magnitude and direction of the trend; useful context for interpreting the displayed values.

The native chart should be readable on an iPhone. It should not become a dense desktop analytics panel. The design should account for: a single valid data point; sparse data; many recorded sessions; long training histories; exercise records across mesocycles; historical corrections; periods without recorded sessions; large and small value ranges.

If the existing web experience supports selected chart periods or relevant historical filters, inspect which belong in this native slice. Use the same data authority and approved transformations. Do not introduce a second e1RM formula or independently calculate new derived values in React Native.

### 5.10 Exercise History and Gym Context

Overload's gym-aware model is an important product distinction. For movements whose nominal resistance varies by gym, the exercise-history and progression experience must preserve the existing gym-specific semantics. The native view must not misleadingly combine incomparable machine weights. Conversely, movements already treated as gym-consistent should continue following their established global-history behavior. The design stage should inspect the existing web exercise-history feature to determine the appropriate presentation of gym context and filtering. Do not create new gym-normalization calculations.

### 5.11 Exercise Detail Integration

Pitch 21h introduced native exercise detail pages. Those pages currently provide access to web-based exercise history. Pitch 21i should replace that temporary dependency with native navigation where the relevant capability is now available. A lifter should be able to: open an exercise from the library; navigate to its native exercise history; review records and the chart where entitled; return to the exercise detail page. The same should work when an exercise is reached from an existing supported workout context. Preserve the exercise identity and navigation history. Do not redesign the 21h library or exercise-detail screens unnecessarily.

### 5.12 Loading, Empty, and Recovery States

The native experience must explain missing or unavailable information accurately. Examples include: no active goals; no completed goals; no logged history for an exercise; too little history for a meaningful chart; exercise with historical records but no recent training; archived exercise with valid history; failed data load; lost connection; expired session; entitlement change.

A user should not see an empty chart that implies zero progress when the actual issue is insufficient data or a failed request. Preserve useful context while retrying. Do not erase or falsely replace historical information because a request temporarily fails.

## 6. Free and Pro Boundaries

Pitch 21i must respect the existing commercial product decisions.

**Free capabilities.** Basic training capture and ordinary logged History remain Free. The user must continue to have access to their own recorded training data without needing Pro. Do not lock basic workout-history access behind this pitch.

**Pro capabilities.** The current planning documents identify the following as Pro intelligence: Exercise History & PR Intelligence; e1RM trends; stall detection; progression recommendations and evidence. Those capabilities must remain subject to existing server-side entitlement enforcement. For a Free account, the native app should communicate the locked or unavailable premium intelligence state according to established product patterns. Do not leak Pro-derived values through a Free history response, chart, or local calculation.

**Goal capabilities.** The underlying PRD defines numeric goal creation and progress, but the exact capability boundaries for goal management versus derived goal intelligence should be confirmed against the current web implementation and entitlement configuration. **The existing deployed web entitlement rules are authoritative.** The design and specification stages must identify which goal actions and values are Free or Pro. Do not invent a new subscription restriction. No in-app purchase, checkout, or billing-management functionality belongs to 21i.

## 7. Cross-Platform Parity

Overload must remain one coherent product across web and native. Pitch 21i brings existing web capabilities to iPhone rather than creating competing analytics. Equivalent capability means: the same goal belongs to the same exercise; the same logged sets produce the same recorded history; the same authoritative calculations produce the same progress and records; the same entitlement produces the same capability access; historical edits have the same downstream effect; the same archived objects remain historically visible; equivalent errors and unavailable states communicate the same underlying condition.

The interface may differ by platform. A native chart need not look identical to the web chart. The information, interpretation, and user outcomes must agree. Prepare a focused parity matrix covering goals, exercise history, PR intelligence, chart data, and access states. Correct unintended discrepancies within the implemented overlapping scope. Do not expand this into a general redesign of either application.

## 8. Data Integrity and Security

- **Account isolation.** All goals, historical performance, records, and derived information must be scoped to the authenticated account. One account must not be able to inspect another account's goals or training history.
- **Historical authority.** Exercise history must derive from actual saved workout records. Do not introduce duplicate native training-history storage.
- **Corrections.** A historical set edit must be reflected in goal progress, PR intelligence, and derived trends according to the authoritative backend rules. Do not persist stale derived values.
- **Goal identity.** Preserve the one-active-goal-per-exercise constraint. Create requests must be retry-safe.
- **Archived references.** Archiving an exercise or gym must not erase legitimate historical performance.
- **Mobile API.** Use the existing authenticated, versioned mobile API. Maintain backward compatibility with previously installed clients. The mobile app must not access application tables directly.
- **Entitlement enforcement.** Pro capability checks must be server-authoritative. A native client must not be able to reconstruct restricted Pro insights from an endpoint intended only for basic Free history.

## 9. Definition of Done

**A. Goals.** The lifter can open a native goals screen. Active goals are accurately displayed. Goals show the correct exercise and numeric target. A valid new strength goal can be created on the iPhone. Existing validation rules apply. A second active goal for the same exercise is handled according to the approved domain behavior. Goal progress agrees with the web. Completed goals remain accessible. Achieved goals follow the existing completion and archive lifecycle. A new goal can be set after an earlier one is completed. The user can navigate from a goal to the corresponding exercise.

**B. Exercise History.** The lifter can open exercise-specific history natively. Actual saved performance is displayed accurately. History is not limited to the active mesocycle. Weight, repetitions, and applicable RIR are correctly represented. Gym context is preserved where relevant. Swapped exercises are associated with the actual performed exercise. Archived exercises retain historical records. Historical changes refresh the displayed information. The user can open the relevant logged workout where supported.

**C. Personal Records.** The established PR information is available to an entitled account. PR values match authoritative web calculations. The record display does not invent results from insufficient evidence. Historical corrections are reflected accurately. Gym-specific semantics remain intact.

**D. Native Line Chart.** A native exercise-history line chart is available to an entitled account. It uses the authoritative e1RM trend. Dates and values are presented accurately. Sparse histories are handled. Long histories remain usable. Missing or insufficient data is explained. Historical corrections produce updated chart information. The chart works in light and dark mode. The chart is readable with supported accessibility settings.

**E. Free and Pro.** Ordinary logged workout History remains available to Free accounts. Premium exercise-history intelligence is correctly gated. Restricted derived information does not leak. Access changes are reflected appropriately. No native purchase flow is introduced.

**F. Navigation.** Exercise detail pages link to native exercise history where supported. Goals link to the correct exercise. Historical workouts can be reached without losing context. Navigating away and back does not start or change a workout. An active workout remains intact when viewing exercise information.

**G. Security and Reliability.** All new owned reads and writes pass account-isolation tests. Goal creation is retry-safe. Existing historical records remain unchanged by read-only browsing. API contracts remain backward-compatible. Loading, empty, error, and offline/unreachable states are usable. Physical-device layout and navigation are verified by the owner.

**H. Staging and Acceptance.** Design, native UI, specification, and implementation reviews pass. Required automated verification passes. New or changed mobile endpoints pass isolation and compatibility tests. Staging web/API behavior is verified. A compatible Expo staging OTA is published. Realistic overload-dev test fixtures are available. The owner completes focused physical-iPhone testing. Findings are corrected and retested. Production promotion waits for explicit owner authorization.

## 10. Rabbit Holes and Risks

1. **Reimplementing the progression engine.** The e1RM formula, progression logic, and historical reconciliation already exist. Creating native equivalents could produce conflicting results. Reuse the authoritative server calculations.
2. **Confusing Free history with Pro intelligence.** Basic logged history must remain accessible. Premium analysis must remain gated. The native API must enforce this distinction rather than relying on hidden UI elements alone.
3. **Incorrect gym comparisons.** Machine-based movements may require gym-specific interpretation. Do not generate a misleading trend by combining data in a way that contradicts existing authoritative rules.
4. **Goal completion races.** Newly saved sets, historical corrections, and goal creation may interact. Preserve existing transaction, reconciliation, and idempotency behavior. Do not create duplicate goals or duplicate completion events.
5. **Historical edits and stale derived information.** History, records, goals, and charts must all reflect the same saved workout data. Avoid storing separately maintained derived values that can become stale.
6. **Large exercise histories.** A lifter may have hundreds of recorded sets across multiple blocks. The native experience should remain responsive without inventing new persistence or discarding older history.
7. **Chart accessibility.** A chart should not be the only way to understand progression. The native design must provide accessible textual context for the trend.
8. **Archived exercises.** An exercise may disappear from ordinary selection while remaining relevant to History and goals. Preserve access to historical records.
9. **Unnecessary analytics expansion.** This pitch authorizes one exercise-history line chart. Do not introduce a complete dashboard of statistics, unrelated visualizations, forecasting, or AI coaching.
10. **Scope expansion from the scheduling chore.** The separate native scheduling-parity task is not part of Pitch 21i's feature definition. Its inclusion in the later execution run must not distort the goals/history acceptance criteria or turn this pitch into a broader scheduling redesign.

## 11. Explicit Non-Goals

New progression formulas; new personal-record categories; automatic goal suggestions; dated strength goals; goal deadlines; AI-generated training recommendations; new workout plans; mesocycle editing; advanced analytics dashboards; multiple new chart types; social comparisons or leaderboards; public profiles; HealthKit or wearable integrations; nutrition or body metrics; new cardio analytics; exporting charts as shareable progress cards; workout sharing; account settings (21j); native onboarding tour (21k); TestFlight distribution (21l); billing or native checkout; Android; offline-first analytics; a separate native progression engine.

The recently shipped weekly scheduling functionality is also not included as an additional feature inside this pitch. Native scheduling parity is tracked separately.

## 12. Dependencies

- **Completed mobile pitches.** 21a–21d: workspace, shared contracts, mobile API, authentication, native shell, navigation, and design system. 21e: native workout logging and all-time History. 21f: complete logging controls, including RIR, gym selection, and historical corrections. 21g: native progression guidance and supporting evidence. 21h: native plan, exercise library, custom exercise, and gym reference surfaces.
- **Existing web capabilities.** Pitch 5 — Progressive Overload Engine (derived progression rules and e1RM logic). Pitch 6 — Goals (numeric goal model, progress, completion, and archive lifecycle). Pitch 16 — Exercise History & PR Intelligence (web exercise-history and records). Pitch 19 — Plans, Billing & Promo Codes (Free/Pro entitlement system and server-gated premium intelligence).
- **Downstream.** 21j — Account & Settings; 21k — Native Tour; 21l — TestFlight Beta.

## 13. Open Questions for Design and Specification

Resolve these against the current web implementation, canonical specifications, and approved architecture. Record each resolution as a formal Resolved Decision.

- **Q1. Goals navigation.** Where should Goals live within the existing native navigation? Preserve quick access to Today, Plan, History, and the active workout.
- **Q2. Goal editing and archiving.** Which goal-management actions are currently supported by the web? Do not invent new lifecycle actions.
- **Q3. Goal entitlement boundaries.** Which goal creation and display capabilities are Free, and which derived progress fields are Pro? Match the deployed server-side capability definitions.
- **Q4. Goal completion presentation.** How should an achieved goal be acknowledged on the phone without interrupting set logging or repeatedly celebrating the same historical achievement?
- **Q5. Goal and exercise navigation.** How should a goal link to exercise details and exercise history, and how does the user return without losing context?
- **Q6. Exercise History scope.** Which historical workout and set details should the native view show? Use the approved Pitch 16 behavior as the source of truth.
- **Q7. Personal-record categories.** Which PR categories exist, what qualifies, and how are corrections handled?
- **Q8. Gym-specific history and PR semantics.** How does the existing feature represent machine and cable movements across gyms, and what filters exist?
- **Q9. Native chart interaction.** What minimal chart interactions are needed on an iPhone?
- **Q10. Chart period and history density.** Which time ranges or filters exist on web, and how are long histories navigated without dropping records?
- **Q11. Chart dependency and runtime.** Can the chart be built with existing native dependencies and the current development-build runtime?
- **Q12. Insufficient data.** What minimum history is required, and how is it explained?
- **Q13. Historical corrections.** Which native read paths must refresh after an earlier set is edited?
- **Q14. Archived exercises and goals.** How should the app expose goal and history information for archived exercises?
- **Q15. Mobile API coverage.** Which capabilities already exist in the versioned mobile API, and which need backward-compatible additions?
- **Q16. Pro entitlement changes.** How should screens behave when a user loses or gains premium access while the app is open?
- **Q17. Web/native parity.** Which small discrepancies exist, and which are corrected within scope?
- **Q18. Medium appetite.** Does the scope fit Medium when built on existing services?

## 14. Physical-iPhone Acceptance Strategy

The build pipeline must prepare realistic development accounts using the existing safe `dev:test-account` tooling. The owner should not need to manually construct months of training history to test the feature. Use a small number of reusable accounts capable of covering multiple checks.

- **Scenario A — Goals and Progress:** an active strength goal, valid logged history, measurable progress, an exercise without an active goal, a completed historical goal.
- **Scenario B — Exercise History and PRs:** multiple completed workouts across several weeks with weight, reps, and RIR; valid PR information; a meaningful e1RM trend; a machine movement trained at more than one gym.
- **Scenario C — Sparse History and Free Access:** insufficient history for a trend, basic logged workouts, Free entitlement.
- **Scenario D — Historical Correction:** a past set suitable for editing, with derived records and goal progress affected by it.
- **Scenario E — Account Isolation:** two accounts with distinct goals and histories.

The owner should preferably test the primary experience using one account, while the automated suite covers most secondary cases. Do not require repeated account creation for every small UI state.

## 15. Delivery and Release Gates

**Pitch → Design Document → Native UI Design → Specification → Linear Tickets → Implementation → Review → Staging → Expo OTA → Physical-iPhone Acceptance.** Production release requires a separately authorized promotion workflow. Do not merge into main or publish a Production Expo update as part of ordinary 21i development.

## 16. Final Success Statement

Pitch 21i succeeds when a lifter can open Overload on their iPhone, create and review strength goals, inspect exercise-specific logged performance, understand personal records, and view an authoritative progression trend. The native experience must reflect the same training data, progression rules, and access permissions as the web. Historical edits must update the information correctly. Free users must retain ordinary logged History, and Pro intelligence must remain properly gated. The implementation must not introduce a new progression engine, new PR calculations, or unrelated analytics.

**21i completes the native connection between daily workout logging, long-term strength goals, and the training history that explains progress.**
