# Overload — Pitch 6: Goals

> Source: Linear document "Overload — Pitch 6: Goals"
> (project Overload V1 / P-OVE-1, doc `8035be66-3360-44aa-9b14-5fb6f9aa263a`),
> pulled into the repository as the controlling pitch for slug `06-goals`.
> Headings and rules are preserved; prose is lightly condensed.

## Summary

**Type:** Feature
**Appetite:** M — Medium
**Depends on:** Progressive Overload Engine
**Unlocks:** No core downstream dependency
**Primary feature:** Per-Exercise Strength Goals
**Explicitly deferred:** Goal dates, deadlines, pacing, feasibility coaching, automatic Goal recommendations

Pitch 6 gives the lifter a concrete long-term strength target for an Exercise and continuously shows how close their demonstrated performance is to that target.

At completion, the lifter can:

- create a Goal for an Exercise, defined as **target weight × target reps**;
- have active Goals for multiple different Exercises at once, at most one active Goal per Exercise;
- select a Gym when creating a Goal for a Gym-variable Exercise;
- see current Goal progress as an e1RM-based percentage;
- have existing historical performance count immediately;
- have Goal progress automatically reflect corrections to LoggedSet history;
- reach 100%, receive a restrained completion moment, and have the completed Goal archived automatically;
- manually archive a Goal that is no longer relevant;
- immediately create another Goal after the previous one is completed or archived;
- review historical completed/archived Goals.

Goals remain undated. Overload does not tell the lifter when they should reach the Goal, whether it is realistic, what rate of progress they need, what program changes will achieve it, or what their next Goal should be. **The lifter chooses the destination. Overload measures demonstrated strength against it.**

---

## Problem

Pitch 5 solves the short-term question: *Should I Progress, Hold, or Deload this lift?* The product still lacks a persistent longer-term target (Bench 315 × 1; Squat 315 × 8; Bench 225 × 12). Without Goals, Overload cannot answer: **How close am I to the strength target I actually care about?**

The PRD defines Goals as lift-specific weight × reps targets, with progress expressed by converting both the target and current performance to estimated 1RM through the same formula used by the progression system. Pitch 6 adds that long-term layer without changing the plan or progression rules.

## Why This Pitch Exists Now

Pitch 5 already established the canonical `estimateOneRepMax`, session-level e1RM semantics, historical strength trends, Gym-specific treatment for Gym-variable Exercises, and historical correction behavior. Pitch 6 consumes those contracts rather than creating another strength model: **one logged performance produces one consistent interpretation of strength everywhere in Overload.**

## Appetite

**M — Medium.** Introduces Goal creation, lifecycle, target validation, one-active-Goal constraint, Gym context for Gym-variable Goals, target e1RM, current-best lookup, progress percentage, automatic completion/archive, manual archive, restrained completion acknowledgement, immediate next-Goal entry, Goal history, dashboard integration, and post-workout integration. It introduces no new training-performance algorithm; its primary technical responsibility is to reuse the existing e1RM domain correctly and keep Goal lifecycle state separate from derived performance state.

---

## Core Product Model

A Goal is **one user-authored strength target for one Exercise**: Exercise, target weight, target reps — plus Gym context for a Gym-variable Exercise (e.g. *Chest Press Machine · EOS Fitness · 200 lb × 10*). A Goal is not a Mesocycle, a Session target, a Progress recommendation, a training phase, a deadline, or a prediction.

## Goal Definition

1. **Goals are undated.** No deadline, target week, target Mesocycle, or expected achievement date. A Goal stays active until achieved or manually archived.
2. **Goal target is weight × reps.** The lifter never enters a target e1RM; e1RM is the internal comparison unit.
3. **Goal uses stable Exercise identity** — never name, primary muscle, SessionExercise, or plan slot. Renaming does not disconnect.
4. **Imported and custom Exercises are both eligible.** Custom Exercises are not excluded for lacking an image.
5. **Archived Exercises cannot receive new Goals.** Existing Goal history remains readable after archival.

## One Active Goal Rule

6. **At most one active Goal per Exercise.** Multiple active Goals only across different Exercises.
7. **Gym context does not change the rule.** A Gym-variable Exercise still has only one active Goal total; its Gym is the measurement context, not a second slot.
8. **A second active Goal is blocked** — not created, not silently replaced, the first not auto-archived. Surface the existing Goal and require intentional resolution. Overload chooses **block rather than silently replace**.

## Canonical Strength Model

9. **Goals reuse Pitch 5's exact `estimateOneRepMax`.** No second Epley, no Goal-specific formula, no copied formula, no new interpretation of "current strength."
10. **Target e1RM is derived** from target weight × reps through the canonical estimator. The lifter still sees the familiar `225 × 12`.

## Current Best

11. **Current best = best qualifying historical strength:** the highest qualifying session-level e1RM currently derivable from the applicable LoggedSet history, reusing Pitch 5's session-level representation.
12. **Best historical, not latest.** A weaker later workout (fatigue) does not erase demonstrated strength.
13. **Existing history counts immediately.** No Goal-specific history window; a Goal may begin near 92%, not 0%.

## Goal Progress

14. **Percentage** = `currentBestE1RM / targetE1RM`, displayed as `min(progress × 100, 100%)`; precise internally, whole number in primary UI.
15. **Capped at 100%.** Never 104%. Beyond-target strength remains visible through Exercise history/e1RM surfaces.
16. **No history is not 0%.** Show a distinct state such as **"No performance recorded yet"**. Unknown and zero are different.
17. **Progress is derived, not stored.** No authoritative progress percentage, current e1RM, or best e1RM on the Goal. Store target, context, lifecycle.

## Gym Context

18. **Gym-consistent Exercise Goals are global** — no Gym required; history may span Gyms.
19. **Gym-variable Exercise Goals require a Gym** (`isGymVariable(exercise) === true` → an active Gym is required at creation).
20. **Gym-variable progress is Gym-scoped.** Never merge Gym histories, never invent conversion ratios.
21. **Gym baseline is not Goal progress.** `GymExerciseBaseline` cannot advance, complete, or create an e1RM point for a Goal.

## Goal Lifecycle

22. **States are active and archived**, with metadata distinguishing completed vs manually archived.
23. **Manual archive is allowed** — preserves history, frees the Exercise for another Goal.
24. **Goal hard delete is out of scope.**

## Automatic Completion

25. **Goal completes at 100%** (`currentBestE1RM >= targetE1RM`): displays 100%, completes, archives as completed.
26. **Existing history can complete a Goal immediately** at creation — never held artificially active.
27. **Completion is idempotent** — no repeated completion times, re-archiving, duplicate state, or endlessly replayed modal.
28. **Completed Goal does not reopen** after a later downward correction. Create a new Goal to pursue it again.
29. **Active Goal progress can move before completion** (corrections may raise or lower it).

## Historical Corrections

30. **Past-log edits automatically update active Goal progress** — current best, percentage, and whether it now qualifies for completion. No recompute job, no "refresh Goal" action.
31. **Past-log corrections do not rewrite completed Goal lifecycle.** Performance truth and Goal lifecycle event are separate concepts.

## Exercise and Gym Archival

32. **Exercise archival preserves Goal history**; new Goals cannot be created for it; no cascade delete.
33. **Active Goal on an archived Exercise is not silently destroyed** — show it as archived, preserve the record, allow explicit manual archive.
34. **Gym archival preserves Gym-scoped Goal history** — readable, Gym identifiable, no new Goals against that Gym; no remap, delete, or merge.
35. **Active Goal at an archived Gym may be manually archived.**

## Celebration

36. **Restrained celebration moment** — e.g. **Goal reached** · Barbell Bench Press · 315 lb × 1. No confetti, XP, streaks, level-ups, badges, or sound effects.
37. **Gym-variable completion shows Gym context.**
38. **Celebration occurs once** — no replay every time history is opened; one-time acknowledgement without a notification framework.

## New Goal Flow

39. **Completion offers "Set a new goal"** as an obvious action.
40. **The next Goal is never generated automatically** — no 315 → 325. Progression may suggest short-term load; it does not choose long-term aspirations.

## Dashboard Integration

41. **Pending workout remains primary.** A Goal card never displaces the daily training loop.
42. **Goal progress can populate the alternate dashboard state** once today's workout is completed or no training action is pending. Keep it concise.

## Post-Workout Integration

43. **Post-session summary may show relevant Goal progress** (e.g. *Bench Goal 87%* or *87% → 90%*), and the completion state if reached.
44. **Unrelated Goals do not appear** in a summary for a workout that did not touch them.

## Goals and Progression Remain Separate

45. Goals do not change Progress threshold, reactive Deload, the e1RM stall gate, scheduled Deload, or the +5 lb recommendation.
46. A Progress call does not advance the Goal target.
47. Goal percentage and progression state may differ (92% while Hold) — they answer different questions.

## Goal History

48. **Historical Goals remain viewable**: Exercise, Gym when applicable, target weight, target reps, completed vs manually archived outcome, lifecycle timestamps.
49. **Active and historical Goals are visually separated**; history is available but secondary.

---

## In Scope

- **Goal Creation:** active Exercise selection; target weight; target reps; Gym selection for Gym-variable Exercise; validation; duplicate-active-Goal handling.
- **Goal Tracking:** target e1RM; current best; derived percentage; no-history state; existing-history state; dashboard and post-session presentation.
- **Goal Lifecycle:** one active per Exercise; manual archive; automatic completion; completed archive; one-time acknowledgement; new-Goal entry; Goal history.
- **Gym Awareness:** global scope for Gym-consistent Exercises; one selected Gym for Gym-variable; Gym-scoped machine progress; archived-Gym history.

## Explicitly Out of Scope

Target dates; deadlines; deadline reminders; expected completion date; "on track"/"behind"; pacing guidance; feasibility scoring; Goal difficulty rating; rate-of-progress prediction; AI Goal coaching; suggested next Goal; automatically generated Goal; automatically increased Goal; Goal-driven program generation; Goal-driven rep-range changes; social/shared Goals; leaderboards; streaks; XP; achievement systems; confetti; Cardio Goals; nutrition Goals; body-composition Goals.

---

## Definition of Done

1. Goal creation works (Exercise, target weight, target reps; Gym for Gym-variable).
2. Multiple Exercises may have active Goals concurrently.
3. Only one active Goal exists per Exercise — blocked even when another Gym is selected.
4. Goal target uses canonical Pitch 5 e1RM; no duplicate formula exists.
5. Goal progress uses best qualifying historical performance, not merely the latest workout.
6. Progress is displayed as a percentage of target e1RM.
7. Percentage is capped at 100%; above-target strength completes.
8. No history shows an explicit empty measurement state, not fake 0%.
9. Existing history counts immediately.
10. Machine/cable Goal progress uses only its selected Gym.
11. Free-weight/consistent Goal progress uses global Exercise history.
12. Past-log corrections update active Goal progress; no stored percentage becomes stale.
13. Goal completes at 100% — complete and archive.
14. Completed Goal remains historical — no deletion.
15. Completed Goal does not reopen automatically.
16. Already-achieved Goal completes immediately.
17. Manual archive works.
18. Completion offers a new Goal; no automatic target generation.
19. Dashboard can surface real Goal progress without displacing a pending workout.
20. Completion experience is restrained; no gamification framework.

## Behavioral Rules

- **User chooses the target.** Overload never chooses long-term Goals.
- **LoggedSets measure progress.**
- **Goal percentage is derived.** Do not cache it as truth.
- **Goal lifecycle is persistent.** A completed/archived Goal stays historical even if source history is later corrected.
- **Goals do not influence the program.** They observe performance; they do not rewrite training.

## Rabbit Holes

1. Goal dates (not even "just as an optional field"). 2. Feasibility coaching. 3. Second e1RM formula. 4. Latest-workout percentage. 5. Stored progress percentage. 6. Multiple active Goals for the same machine at different Gyms. 7. Cross-Gym machine comparisons. 8. Automatically reopening completed Goals. 9. Gamification.

## No-Gos

Do not: add a Goal date; add pacing; predict completion; recommend whether a Goal is realistic; generate Goals; auto-increment Goals; silently replace an active Goal; allow two active Goals on one Exercise; use a second e1RM formula; store Goal progress percentage as truth; let Gym baseline count as achievement; merge Gym-variable history across Gyms; invent machine conversions; change progression thresholds; change training plan; delete completed Goals; reopen completed Goals automatically; create Goal gamification.

## Edge Cases

- **Already achieved at creation** — recognize completion immediately.
- **No historical performance** — Goal exists; progress unmeasured until qualifying history appears.
- **Target reps differ from training reps** (train 3 × 8, Goal 315 × 1) — valid; shared e1RM makes comparison possible.
- **Historical best older than current Mesocycle** — still counts; Goals span Mesocycles.
- **Latest performance weaker than best** — progress remains based on best.
- **Swapped Exercise** — performance counts toward the Exercise actually performed.
- **Active Goal Exercise becomes archived** — readable; offer manual archive rather than silently deleting.
- **Active machine Goal Gym becomes archived** — readable; do not re-scope; offer manual archive.
- **Past-log correction lowers active Goal** — percentage may fall.
- **Past-log correction lowers a completed Goal's historical best** — Goal remains completed.

## Dependencies

Progressive Overload Engine supplies the authoritative `estimateOneRepMax`, session-level e1RM semantics, qualifying-history semantics, Gym-variable scope, global Gym-consistent scope, and historical correction behavior. Pitch 6 consumes these directly.

## Downstream Contract

Goals has no core downstream dependency. Pitch 7 Cardio Logging remains explicitly independent of strength progression, e1RM, and Goals. Do not create shared abstractions that invite Goal logic onto Cardio.

## UI-Bearing Classification

Strongly UI-bearing (Goals overview, active Goal cards, creation, Exercise picker, Gym selection, target form, percentage progress, no-history state, Goal detail, manual archive, Goal history, completion acknowledgement, new-Goal action, dashboard Goal state, post-session Goal progress). Pipeline: **Pitch → Design Doc → UI Design Preview → Spec → Tickets → Implementation.** `/overload-ui-design` is mandatory.

## Source Gaps & Decisions for the One-Shot Prompt

1. Gym-variable Goal measurement — Gym required; only that Gym's Pitch 5 history.
2. Active Goal uniqueness — one per Exercise globally; Gym is not a second slot.
3. Current best — maximum qualifying historical session-level e1RM.
4. No-history state — unmeasured/unknown, not 0%.
5. Percentage rounding — whole number for primary display; precise internally.
6. Manual archive — supported; no Goal deletion.
7. Completion stability — completed Goals do not reopen automatically.
8. Existing-history completion — already-achieved Goals complete immediately.
9. Completion acknowledgement — one-time, restrained, no gamification infrastructure.
10. Archived Exercise/Gym behavior — preserve record and context; never silently delete or remap.

## Required Upstream Amendments

1. Gym-variable Goals require Gym context.
2. One active Goal remains per Exercise globally, including Gym-variable Exercises.
3. "Current best" means maximum qualifying historical e1RM.
4. Goal progress uses best demonstrated performance, not latest.
5. No-history is unmeasured, not 0%.
6. Manual archive is supported; Goal hard-delete is not.
7. Completed Goals do not reopen automatically after historical correction.
8. Already-achieved Goals complete immediately.
9. Existing Goal history survives Exercise/Gym archival.
10. Celebration is restrained and non-gamified.
11. Architecture Goal model may need optional Gym context and completion/manual-archive metadata while preserving one-active-per-Exercise uniqueness.

## Scope Check

The lifter sets **Barbell Bench Press — 315 × 1**. Their best demonstrated performance produces **274 lb e1RM**; Overload says **87%**. As stronger performances are logged the percentage rises; when demonstrated strength meets the target: **Goal reached — 315 × 1**. The Goal becomes historical and the lifter may define the next target. For Gym-variable Exercises the same idea applies inside the chosen Gym's machine context.

> **Progression tells the lifter what recent training implies for the next workout. Goals show how close demonstrated strength is to the long-term target the lifter chose.**

## Pitch Completion Test

What is a Goal? An undated Exercise-specific strength target, weight × reps. Who chooses it? The lifter. What calculates progress? Pitch 5's canonical e1RM function. Current strength? Best qualifying historical session-level e1RM. Latest or best? Best. Stored? No. No history? Unmeasured, not 0%. Active Goals per Exercise? One. Different Exercises simultaneously? Yes. Machine Goal needs a Gym? Yes. Same machine at two Gyms simultaneously? No. Uses another Gym's history? No. Baseline counts? No. Old Mesocycles count? Yes. Prior history can satisfy a new Goal? Yes. At 100%? Completes and archives. Deleted? No. Reopens after correction? No. Manually retired? Yes, archive. After completion? Offer "Set a new goal". Overload chooses it? No. Dated? No. Predicts? No. Affects Progress/Hold/Deload? No. Requires UI Design? Yes.
