# Overload — Pitch 4: Guided Workout Logging

> Source: Linear document "Overload — Pitch 4: Guided Workout Logging"
> (project Overload V1). Imported verbatim as the controlling pitch for this
> build. Where the one-shot run prompt deliberately resolves an open
> product-mechanics gap listed below, that resolution controls for the run and
> is recorded in `docs/specs/04-guided-workout-logging-spec.md` under
> `## Resolved Decisions`.

## Summary

**Type:** Feature
**Appetite:** L — Large
**Depends on:** Split & Mesocycle Builder; Library & Gyms Setup; Foundation
**Unlocks:** Progressive Overload Engine; Goals
**Primary features:** Guided Workout Logging; Missed-Day Handling; Exercise Swap; Gym-Specific Weight Tracking; Past-Log Editing
**Explicitly deferred:** Progress/hold/deload decisions, e1RM trends, progression charts, scheduled-deload load reduction

Pitch 4 is the first pitch where Overload records what the lifter actually did.

At completion, the lifter can open Overload on a training day, see the planned workout, select the gym being used, log every planned set with weight and reps, swap an unavailable exercise for an appropriate alternative, leave and resume a partially logged workout, complete the day, resolve missed training days, and later correct a mistaken logged set.

For gym-variable exercises, Overload also begins maintaining independent working-weight baselines by gym so that a machine at Gym A does not silently overwrite the expected weight at Gym B.

This pitch creates the trustworthy raw training history that the progression system will interpret in the next pitch.

It does **not** yet tell the lifter whether to progress, hold, or deload.

---

# Problem

Overload's core job is eventually to tell the lifter whether to progress, hold, or deload based on logged performance against the plan.

That means the quality of every future recommendation depends on the integrity of the data Pitch 4 creates.

A progression engine cannot distinguish a strong session, a plateau, a regression, a gym-equipment difference, or a simple logging mistake unless the underlying training history accurately records what happened.

The Product Brief identifies two related problems: the lifter currently overwrites notes and loses historical context; and a machine's nominal weight may not mean the same thing across gyms. Pitch 4 addresses both at the data-capture level.

The lifter must be able to train against the plan without turning logging into a spreadsheet exercise, while Overload must preserve enough precise context for later reasoning.

---

# The Governing Invariant

Logged training history is the most valuable persistent data in Overload. Once a session has happened, it cannot be reconstructed reliably from memory. The project treats `LoggedSet` history as the system's ultimate source of truth for future training conclusions.

> Record what happened accurately; never rewrite history to make the plan look cleaner.

---

# Core Product Distinction — Planned versus Logged

A `Session` is the planned workout template. A `LoggedSession` is the record of what happened on an actual training date. These are different concepts and must remain different.

- planned Exercise ≠ performed Logged Exercise;
- planned set ≠ Logged Set;
- plan edit ≠ historical correction;
- workout swap ≠ Session-template edit.

An in-workout swap must not rewrite the planned Session.

---

# Solution Shape

1. **Dashboard — Today's Pending Session.** Today's unresolved planned Session is the primary focus: date/context, Session name, planned Exercises in order, not-started vs partially-logged, one clear start/resume action.
2. **Starting the Workout.** Creates or resumes the LoggedSession for that planned day. Opening twice never duplicates. Starting does not alter the template, mark complete, calculate progression, or auto-log sets.
3. **Gym Selection.** From the active Gym list (Pitch 2). Supplies context for gym-variable baselines. No implicit Gym creation during logging.
4. **Guided Exercise Logging.** Focused per-Exercise view; all planned working sets together; quick weight/reps entry; planned rep range visible; one-handed gym use.
5. **Logged Set Data.** Weight and reps only. Not suggestions, targets, progression state, e1RM, RPE/RIR, or derived tags.
6. **Set Validation.** Zero/empty weight or reps returns a validation error rather than persisting. A completed Logged Set is a real positive weight and positive rep count.
7. **Partial Workout Persistence.** Enter some sets, leave, return; workout stays incomplete and resumes; logged data is not discarded.
8. **Exercise Completion.** Complete when the required planned set entries for that performed Exercise are validly logged.
9. **Day Completion.** When every required Exercise is logged. A meaningful explicit transition, never inferred from navigation.
10. **Dashboard After Completion.** Neutral quiet completed-today state. No fake goal/progression feedback.
11. **Workout History / Week at a Glance.** Navigation sufficient to see completed vs upcoming days, open a logged workout, inspect sets, and enter past-log correction. Not a statistics surface.
12–16. **Exercise Swap.** Substitute during the workout; same primary muscle only; active Exercises only; records the substitute on the Logged Exercise; never mutates the Session template or other workouts; archived planned Exercise surfaces as needing substitution (never auto-replaced/reactivated).
17–22. **Missed-Day Handling.** Detect unresolved missed planned day; prompt on next open; exactly three outcomes (Log it late / Shift the week / Skip it); persist dated resolution; derive effective schedule from Mesocycle + resolutions; never mutate the template; shift scoped to the current week; consecutive misses do not compound beyond the week.
23–30. **Gym-Specific Weight Tracking.** Only gym-variable Exercises get per-Gym baselines; first log establishes (not corrects); baselines isolated by Gym + Exercise; meaningful deviation (median working weight ≥ 15% from baseline) updates baseline going forward; correction never rewrites history; current working weight is never stored on the plan; baseline updates belong to logging.
31–34. **Past-Log Editing.** Correct weight/reps only; editing is not deletion; corrected data is the future progression source; editing never rewrites the plan.

---

# Atomicity and History Integrity

A logging action must not create contradictory history. `LoggedSet` writes and gym-baseline updates are coupled correctness-sensitive changes in one transaction. The recorded workout and its resulting Gym baseline state must agree.

---

# Explicitly Out of Scope

No progress/hold/deload tags; no e1RM calculation/trend/charts; no scheduled-deload load reduction; no goal progress; no progression-based post-session summary; no LoggedSet deletion; no plan mutation during logging; no automatic missed-day decision; no maps/location detection; no RPE/RIR; no cardio.

---

# No-Gos

Do not: store progress/hold/deload tags; store e1RM; calculate e1RM trends; render progression charts; make progression recommendations; apply scheduled-deload load reduction; write current working weight into SessionExercise; write LoggedSet outside the controlled logging path; update Gym baseline outside the associated logging transaction; change another Gym's baseline; rewrite Logged Sets when correcting a baseline; hard-delete Exercise/Gym referenced by history; add LoggedSet deletion; let Exercise Swap mutate Session/SessionExercise; auto-resolve missed days; mutate the planned weekly schedule to implement a shift; let current-week shifts spill into the next week; create a Gym implicitly while logging; use GPS/geolocation to choose Gym; add RPE/RIR; add Cardio; add Goals; create fake progression/goal completion summaries.

---

# Definition of Done

1. Today's pending Session is the dashboard focus.
2. Planned Exercises open a guided logging card (all planned sets together with weight/reps).
3. Valid Logged Sets persist accurately and survive navigation/reload.
4. Invalid zero/empty set values do not silently enter history (validation error).
5. Partial workouts survive interruption and resume the in-progress LoggedSession.
6. Completing every required Exercise completes the day.
7. Completed day changes the dashboard to a quiet alternate state (not tomorrow's plan).
8. A missed day produces exactly three resolutions.
9. Shift affects only the current week; next week returns to authored alignment.
10. Skip persists and stops re-prompting.
11. Consecutive missed days do not compound beyond the current week.
12. Exercise Swap only offers eligible same-primary-muscle alternatives; the substitute becomes the recorded Exercise.
13. Swap does not mutate the Session template.
14. First gym-variable log establishes a baseline (not a correction).
15. Gym baselines remain independent.
16. Meaningful deviation updates the baseline going forward.
17. Past set weight/reps can be corrected.
18. Archived Exercises and Gyms do not destroy historical logs.

---

# Source Gaps the One-Shot Prompt Resolves

1. Gym baseline correction threshold — **15%** of median working weight (Bucket C default; surface in run report).
2. Gym-variable equipment categories — `machine`, `cable` (verify against Pitch 2 taxonomy; map in method-note).
3. Current working-weight source — never on the plan; gym-variable → Gym baseline; otherwise recent Logged Sets.
4. Zero values — rejected.
5. Retried set submissions — `(loggedExerciseId, setNumber)` unique; retry conflicts, never duplicates.
6. Missed-day persistence — dated resolution record; plan unchanged; effective schedule derived.
7. Shift at end of week — a shifted occurrence beyond the current week is dropped from that week; next week starts from the authored schedule.
8. Missed-day resolution editing — immutable in Pitch 4.
9. Extra/unplanned sets — planned working sets only; no Add Set in Pitch 4.
10. Swapping after sets logged — swap locked once the first LoggedSet exists for that occurrence.
11. Gym baseline behavior after editing an old Logged Set — no replay/reconstruction; current baseline is the latest established/corrected value.
12. Post-session summary conflict — neutral factual completion only; sequencing conflict recorded upstream.

---

# UI-Bearing Classification

Pitch 4 is **strongly UI-bearing**. Pipeline order: **Pitch → Design Doc → UI Design Preview → Spec → Tickets → Implementation**. The UI-design stage is mandatory and must precede the spec. Careful one-handed mobile treatment is required.

---

# Downstream Contract — Progressive Overload Engine may assume

Logged Sessions/Exercises/Sets exist and are trustworthy; set weight/reps are historical truth; plan context remains distinguishable from performed context; swaps are recorded as performed Exercises; past corrections change source history; scheduled Mesocycle week can be determined per workout; missed-day resolutions give effective date/schedule context; no progression tags/e1RM are stored; Gym baselines exist for relevant Gym+Exercise pairs.
