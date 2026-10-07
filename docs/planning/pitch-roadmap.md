# Overload — Pitch Roadmap

## Sequencing Logic

The roadmap follows a straightforward foundation-then-value progression: authentication and the data layer first, since nothing else can exist without them; the two setup domains (exercise library, gyms) next, since a split can't be built without exercises to assign to it; then the split/mesocycle builder, which produces the first pitch a user could actually live inside day to day. From there, workout logging, the progression engine, and goals build on each other in the order the PRD's Feature Dependencies establish — logging has to exist before there's data for the progression engine to reason about, and the progression engine's e1RM calculation has to exist before goals can express progress against it. Cardio logging is deliberately last, not because it's low value, but because it's the one feature with no dependency on anything past the split builder — it could be reordered anywhere after Pitch 3 without disturbing anything else.

Risk is not front-loaded. The architecture doc's biggest technical risk — tuning the gym-baseline auto-correction threshold — sits in the middle of the roadmap (Pitch 4) rather than at the start. This is intentional: the risk is a calibration problem that only becomes answerable once real logged weights across real gyms exist, so isolating and attacking it earlier wouldn't actually de-risk it — it would just mean guessing at a threshold with no data to guess from. It ships with a reasonable default and gets tuned from lived usage afterward.

## Pitches

### Pitch 1: Foundation
- **Type:** Foundational
- **Value delivered:** A deployed, authenticated, empty application — the scaffolding every subsequent pitch builds on.
- **Includes:** Supabase Auth login, base Prisma schema covering all core entities, Vercel deployment pipeline, minimal app shell and navigation.
- **Defers:** All product functionality — no exercises, splits, or logging exist yet.
- **Depends on:** None.
- **Definition of done:**
  - The lifter can log in and reach an authenticated, empty app shell.
  - The schema exists in the production database and matches the Architecture Doc's Data Model.
  - A code change can be deployed to production via the established pipeline.

### Pitch 2: Library & Gyms Setup
- **Type:** Feature
- **Value delivered:** The exercise library and gym list exist and are usable — the prerequisites for building any training plan.
- **Includes:** Exercise Library (import, search, muscle-group filter, custom exercise creation, soft-delete), Gym Management (add, name, soft-delete).
- **Defers:** Gym-specific weight baselines — those don't exist until a lift is actually logged at a gym, which happens in Pitch 4.
- **Depends on:** Pitch 1.
- **Definition of done:**
  - The free-exercise-db dataset is imported and browsable with images.
  - Exercises can be found by name search or muscle-group filter.
  - A custom exercise can be added by name (no image) and behaves identically to a library exercise elsewhere in the app.
  - Deleting an exercise removes it from future selection without affecting any (not-yet-existing) history.
  - A gym can be added with a name and free-text address, and soft-deleted the same way.

### Pitch 3: Split & Mesocycle Builder
- **Type:** Feature
- **Value delivered:** The lifter can design a full training plan — this is the first pitch that produces something they'd actually use.
- **Includes:** Mesocycle creation (length in weeks, deload week placement, default of 5 weeks / week 5), preset split types (PPL, Arnold, bro split) and custom split building, session creation with exercises/planned sets/target rep ranges, assigning sessions to days, duplicating a session across days, cloning a prior mesocycle forward into a new one.
- **Defers:** Nothing is logged against the plan yet — this pitch is pure plan authoring.
- **Depends on:** Pitch 2 (sessions reference exercises).
- **Definition of done:**
  - A mesocycle can be created via a preset or fully custom split, with length and deload week set (defaulted, editable).
  - A session can be built with exercises, planned sets, and target rep ranges, then assigned to a day.
  - A session can be duplicated onto another day and edited independently afterward.
  - A new mesocycle can be created by cloning and editing a prior one forward.

### Pitch 4: Guided Workout Logging
- **Type:** Feature
- **Value delivered:** The lifter can actually train against their plan day to day — the core daily-use loop of the product.
- **Includes:** Dashboard display of the current day's pending plan, per-exercise guided card logging (all planned sets on one card), day completion and dashboard state change on completion, exercise swap restricted to same-muscle-group alternatives, missed-day detection and resolution (log late / shift / skip, shift scoped to the current week only), gym-specific weight baseline attribution and auto-correction at log time, past-log editing.
- **Defers:** Progress/hold/deload tagging and e1RM trend calculation — this pitch produces the raw logged data; Pitch 5 interprets it.
- **Depends on:** Pitch 3 (a plan must exist to log against) and Pitch 2 (gyms and exercises must exist).
- **Definition of done:**
  - The dashboard shows the current day's plan when pending, and a different front-facing state once the day is complete.
  - Logging a set through an exercise's card persists correctly and is editable afterward.
  - A missed day triggers the three-way prompt on next open, and each of the three resolutions behaves as specified.
  - Swapping an exercise mid-session only offers same-muscle-group alternatives.
  - A machine-based exercise's weight baseline is tracked independently per gym, and a logged weight that deviates meaningfully from a gym's baseline updates that gym's baseline going forward.
  - Editing a past log succeeds and is reflected in that log's stored data.

### Pitch 5: Progressive Overload Engine
- **Type:** Feature
- **Value delivered:** The product's core differentiator goes live — the lifter is told whether to progress, hold, or deload, instead of having to judge it themselves.
- **Includes:** Rule-based threshold detection against each exercise's planned rep range (progress/hold/deload tagging), e1RM rolling trend calculation and charting, scheduled deload week behavior (automatic reduced load across the split during the mesocycle's designated deload week), suppression of the reactive check during a scheduled deload week, retroactive re-evaluation of a lift's tag when a past log is edited.
- **Defers:** Nothing further — this completes the core progression loop described in the Brief's core job.
- **Depends on:** Pitch 4 (requires logged set data to evaluate against).
- **Definition of done:**
  - An exercise is correctly tagged progress, deload, or left untagged based on logged performance against its planned rep range.
  - The e1RM trend is calculated and viewable per exercise.
  - The scheduled deload week applies reduced load across the split automatically, and the reactive check does not fire during it.
  - Editing a past log correctly re-runs and, where warranted, changes that lift's tag.

### Pitch 6: Goals
- **Type:** Feature
- **Value delivered:** The lifter has a visible long-term target per lift, with real progress feedback rather than just a number sitting untracked.
- **Includes:** Per-lift numeric goal creation (target weight × target reps, undated), e1RM-based percentage progress, multiple concurrent goals (one per lift), completion celebration, automatic archive, and the option to set a new goal immediately after.
- **Defers:** Dated goals and any feasibility/pacing feedback — explicitly Post-MVP per the PRD.
- **Depends on:** Pitch 5 (goal progress reuses the e1RM calculation).
- **Definition of done:**
  - A goal can be created specifying a lift, target weight, and target rep count.
  - Progress displays as a percentage derived from e1RM comparison.
  - Multiple goals can be active concurrently, one per lift.
  - Reaching 100% triggers a celebration moment, archives the goal, and offers immediate creation of a new one.

### Pitch 7: Cardio Logging
- **Type:** Feature
- **Value delivered:** Cardio sessions are on the record alongside lifting, closing the last gap in the daily log.
- **Includes:** Cardio sessions assigned to specific split days, logged with type and duration only.
- **Defers:** Everything else — this is intentionally minimal, no progression analysis of any kind.
- **Depends on:** Pitch 3 (a split must exist to assign a cardio day to).
- **Definition of done:**
  - A cardio session can be assigned to a day and logged with type and duration.
  - No progress/deload tag or trend is generated for a cardio log.

## Dependency Map

Pitch 1 blocks everything. Pitch 2 blocks Pitch 3 (sessions need exercises) and Pitch 4 (logging needs gyms and exercises to exist). Pitch 3 blocks Pitch 4 (nothing to log against without a plan) and Pitch 7 (cardio needs a split day to attach to). Pitch 4 blocks Pitch 5 (the progression engine needs real logged data to evaluate). Pitch 5 blocks Pitch 6 (goals reuse its e1RM calculation). Pitch 7 has no downstream dependents and, as noted in the Sequencing Logic, could ship any time after Pitch 3 without disrupting this order.
