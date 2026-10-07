# Overload — PRD / Feature Breakdown

## Overview

Overload is a single-user strength training tracker whose core job is to tell the lifter, per lift and per session, whether to progress, hold, or deload — based on logged performance against their own self-built plan — so they never have to eyeball their own numbers to make that call. It layers a rule-based progression engine and gym-specific weight tracking on top of a conventional split/session logging structure, and defers everything outside training (nutrition, body composition, social features, auto-generated programming) to later or never.

## Core User Journeys

### Journey: Setting up a mesocycle and split

The lifter starts a new mesocycle by either picking a preset structure (push/pull/legs, Arnold, bro split) or building a custom one. Building custom means creating individual exercise sessions (e.g., "Push Day 1"), populating each with exercises, planned sets, and target rep ranges, then assigning each session to a day of the week. A session can be duplicated and assigned to a second day (e.g., copying "Push Day 1" from Monday onto Thursday) or edited independently after copying. When starting a new mesocycle, the lifter can clone a prior one and edit it forward rather than building from scratch. At creation, the lifter sets the mesocycle's length in weeks and which week is the scheduled deload, pre-filled with a default of a 5-week block with week 5 as the deload, editable per mesocycle.

### Journey: Logging a workout

On opening the app, the dashboard shows the current day's planned session if it hasn't been completed yet — this is the primary focus of the dashboard while a day is pending. Tapping into an exercise opens a full-card view showing all of that exercise's planned sets together, with quick-entry fields for weight and reps per set. Once every exercise in the day is logged, the day is marked complete; the dashboard no longer shows a completed day as "next up" — it moves to an alternate front-facing state (surfacing something like active goal progress) rather than immediately pushing the following day's plan forward. A separate history/week-at-a-glance view remains accessible at any time to review completed and upcoming days. At the end of a logged session, a short summary appears showing a progression chart or percentage-toward-goal view — not a full statistical breakdown.

### Journey: Receiving a progress/hold/deload call

As the lifter logs sets against an exercise's planned rep range, the rule-based engine checks whether they've hit the top of that range for the required number of sets/sessions in a row. If so, the exercise is tagged **progress** on the plan; if performance is falling short of the range consistently, it's tagged **deload**; holding steady produces no tag at all — it appears as a normal, unflagged exercise. Underneath this, every logged set is converted to an estimated 1-rep max (e1RM) and tracked as a rolling trend line per exercise, which powers the progression charts and acts as a secondary stall-detector that can flag a plateau the threshold rule alone might miss.

### Journey: Scheduled deload week

Independently of the reactive engine above, the mesocycle's designated deload week automatically reduces load/intensity across the entire split for that week — this is planned recovery, not a reaction to any single lift stalling. While a scheduled deload week is active, the reactive per-exercise progress/deload check is suppressed entirely, since every lift is already intentionally reduced and a stall flag on top of an intentional deload would be meaningless. The reactive engine resumes normal operation the moment the deload week ends.

### Journey: Handling a missed training day

If a scheduled day passes without being logged, the app notices on next open and prompts the lifter with three options: log it late (they trained but forgot to record it), shift the remaining days of that week forward by one, or skip it outright. A "shift" only affects the current week — the following week snaps back to the split's normal day alignment regardless of how the current week was adjusted.

### Journey: Editing a past log

The lifter can go back and correct a previously logged set's weight or reps. Doing so retroactively re-runs the progress/deload check for that lift using the corrected number, since the original call may have been based on incorrect data. This re-run does not apply retroactively during a period that was a scheduled deload week, since the reactive check is suppressed there regardless of the underlying data.

### Journey: Managing the exercise library and gyms

The lifter can search the exercise library by name or filter by muscle group when assigning exercises to a session. An exercise not in the library can be added manually by name only — it has no image. Editing a custom exercise's name or notes doesn't affect any history already logged against it, since logs reference the exercise rather than a copy of its definition at log time. Deleting an exercise or a gym is soft: it's archived out of future selection lists (won't appear when building new sessions or logging), but all historical logs referencing it remain fully intact and viewable. Gyms are added explicitly through a dedicated flow — name and an optional pinned location — rather than created implicitly by logging at a new place.

### Journey: Gym-specific weight tracking

For machine-based exercises, the working weight is tracked as its own value per gym rather than one global number per exercise, since the same nominal weight on a machine can represent different actual resistance at different gyms. Free-weight and plate-loaded exercises are assumed consistent across gyms and don't need per-gym tracking. If a manual log at a given gym misses that gym's expected weight for an exercise by a noticeable margin, the gym-specific baseline updates rather than a shared global value.

### Journey: Swapping a planned exercise

If an exercise on a given day needs to be swapped (equipment unavailable, machine broken), the lifter can substitute it mid-session. Only other exercises tagged to the same muscle group are offered as swap options — no cross-muscle-group substitution.

### Journey: Logging cardio

Cardio is assigned to specific days as part of the split, the same as a lifting session (e.g., "Tuesday = Pull + 20 min incline walk"). A cardio log records only type and duration — nothing more. No progression analysis, threshold, or trend logic applies to cardio — it's a record only.

### Journey: Setting and tracking a goal

The lifter can set one or more concurrent goals, each tied to a specific lift as a numeric target at a specific rep count (e.g., "bench 315×1" or "squat 225×12"), undated. Progress toward a goal is expressed as a percentage, calculated by converting both the goal and the lifter's current best performance to an estimated 1RM using the same formula that powers the stall-detection trend line, giving a consistent basis regardless of what rep range was actually trained. Multiple goals can be active at once, one per lift. When a goal's progress reaches 100%, the lifter receives a celebration moment; the goal is then archived, with the option to immediately set a new one.

## Feature Inventory

### MVP Features

#### Split & Mesocycle Setup
- **What it does:** Preset (PPL, Arnold, bro split) or custom split creation; exercise sessions built and assigned to days, duplicable across days; mesocycle length and deload-week placement configurable with a default of 5 weeks / deload on week 5; cloning a prior mesocycle forward into a new one.
- **Why:** Establishes the plan the entire tracking and progression system operates against — the core job has nothing to measure without it.
- **Acceptance criteria:**
  - A lifter can select a preset split type or build a fully custom one from scratch.
  - A session can be assigned to a day, duplicated onto another day, and edited independently after duplication.
  - Mesocycle length and deload week are set at creation with pre-filled defaults, and both are editable.
  - A new mesocycle can be created by cloning and editing a prior one.
- **Edge cases / failure states:**
  - Starting a mesocycle with no exercises assigned to any day is either blocked or clearly flagged as incomplete before it can go live.
  - Cloning a mesocycle whose referenced exercises have since been archived surfaces those slots as needing attention rather than silently failing.

#### Workout Logging
- **What it does:** Dashboard-first display of the current day's plan when pending; guided per-exercise card logging with all planned sets on one card; progress/deload tags on the plan; a post-session summary with a progression chart or percentage-toward-goal view.
- **Why:** This is the primary daily interaction and the data source every other feature depends on.
- **Acceptance criteria:**
  - The dashboard shows the current day's plan when it has not yet been completed.
  - Tapping an exercise opens a card showing all of its planned sets with editable weight/reps fields.
  - Completing every exercise in a day marks the day complete and changes the dashboard's front-facing state.
  - A summary view appears at the end of a completed session.
- **Edge cases / failure states:**
  - Partially logging a day (some exercises done, others not) and closing the app leaves the day in an incomplete state, resumable later the same day.
  - Logging a set with an empty or zero weight/reps value is handled explicitly (blocked, warned, or accepted as a genuine zero) rather than silently breaking the progression calculation.

#### Progressive Overload Engine
- **What it does:** Rule-based threshold detection against each exercise's planned rep range (hit the top of the range for the required consecutive sets/sessions → progress; consistently fall short → deload), backed by an e1RM rolling trend per exercise used for progression charts and as a secondary stall-detector.
- **Why:** This is the product's core differentiator and the mechanism behind the core job.
- **Acceptance criteria:**
  - An exercise is tagged progress, deload, or left untagged (hold) based on logged performance against its planned rep range.
  - An e1RM trend is calculated and viewable per exercise from logged set history.
  - The reactive check does not fire during a scheduled deload week.
- **Edge cases / failure states:**
  - An exercise with insufficient logged history to evaluate a threshold (e.g., first time performed) does not falsely trigger a progress or deload tag.
  - Editing a past log retroactively re-runs the check for that lift and can change a previously assigned tag.

#### Scheduled Deload
- **What it does:** Automatically reduces load/intensity across the entire split during the mesocycle's designated deload week.
- **Why:** Matches established periodization practice and gives systemic recovery independent of any single lift's performance.
- **Acceptance criteria:**
  - The designated deload week applies reduced load/intensity across all exercises in the split without per-exercise configuration required.
  - The reactive progress/deload engine is suppressed for the duration of the scheduled deload week.
- **Edge cases / failure states:**
  - A missed day that gets shifted into or out of the deload week correctly picks up or drops the deload behavior based on where it actually lands.

#### Exercise Library
- **What it does:** Searchable by name and filterable by muscle group; supports manually-added custom exercises (name only, no image); edits and soft-deletes preserve logged history.
- **Why:** Removes manual entry friction for standard movements while still supporting the lifter's specific exercise selection.
- **Acceptance criteria:**
  - Exercises can be found by name search or muscle group filter when assigning to a session.
  - A manually-added exercise saves and functions identically to a library exercise, minus the image.
  - Deleting an exercise removes it from future selection without altering any historical log referencing it.
- **Edge cases / failure states:**
  - Deleting an exercise still assigned to an active (not-yet-completed) mesocycle day surfaces that day as needing a substitution.

#### Gym Management & Gym-Specific Weight Tracking
- **What it does:** Explicit "add a gym" flow with name and optional pinned location; per-gym, per-exercise weight baselines for machine-based movements; automatic baseline correction when a logged weight at a gym misses the expected value by a noticeable margin; free-weight/plate exercises treated as consistent across gyms.
- **Why:** Addresses the core insight that a machine's nominal weight isn't a fixed, comparable value across locations.
- **Acceptance criteria:**
  - A gym can be added with a name and, optionally, a pinned location.
  - A machine-based exercise maintains an independent weight baseline per gym.
  - A logged weight that deviates meaningfully from a gym's current baseline updates that gym's baseline going forward.
  - Deleting a gym preserves its historical logs while removing it from future selection.
- **Edge cases / failure states:**
  - The first log of an exercise at a new gym has no prior baseline to compare against and establishes the initial baseline rather than triggering a false correction.

#### Missed-Day Handling
- **What it does:** Detects an uncompleted prior day and prompts the lifter to log it late, shift the rest of the week forward, or skip it — a single-tap choice.
- **Why:** Keeps the schedule honest without forcing a rigid, unforgiving structure onto a real training week.
- **Acceptance criteria:**
  - On opening the app after a missed day, the lifter is prompted with the three options.
  - Choosing shift moves the remainder of that week's days forward by one, with the following week returning to the split's normal day alignment.
  - Choosing skip leaves the missed day unlogged and proceeds with the schedule as normal.
- **Edge cases / failure states:**
  - Multiple consecutive missed days are handled without compounding the shift indefinitely beyond the current week.

#### Exercise Swap
- **What it does:** Mid-session substitution of a planned exercise, restricted to other exercises tagged to the same muscle group.
- **Why:** Handles real-world gym constraints (equipment unavailable or broken) without breaking the muscle-group intent of the day.
- **Acceptance criteria:**
  - Swapping an exercise only surfaces same-muscle-group alternatives.
  - A swap applies to that single occurrence without altering the underlying session template unless the lifter explicitly saves it back.
- **Edge cases / failure states:**
  - No other exercises exist in the library for that muscle group, and the swap flow communicates that clearly rather than showing an empty, unexplained list.

#### Cardio Logging
- **What it does:** Cardio sessions assigned to specific split days; logs type and duration only.
- **Why:** Keeps cardio on the record for completeness without pulling it into the strength-progression system it wasn't designed for, and without requiring data (distance, pace, heart rate) this build has no reliable way to capture.
- **Acceptance criteria:**
  - A cardio session can be assigned to a day and logged with a type and duration.
  - No progress/hold/deload tag or e1RM trend is generated for cardio.
- **Edge cases / failure states:**
  - None beyond standard empty-field handling — the feature is intentionally minimal.

#### Goals
- **What it does:** Per-lift numeric goals (weight × reps), undated, with e1RM-based percentage progress; multiple concurrent goals; celebration and archive on completion, with an option to set a new goal immediately.
- **Why:** Gives the lifter a visible long-term target without requiring the app to reason about realistic timelines, which are out of scope for this build.
- **Acceptance criteria:**
  - A goal can be created specifying a lift, target weight, and target rep count.
  - Progress displays as a percentage derived from e1RM comparison between the goal and current performance.
  - Multiple goals can be active at once, one per lift.
  - Reaching 100% triggers a celebration moment and archives the goal.
- **Edge cases / failure states:**
  - Setting a second active goal on a lift that already has one active is either blocked or replaces the existing goal, rather than allowing two ambiguous concurrent goals on the same lift.

### Post-MVP / Later

#### Dated Goals
Adding a target date to a goal, plus any pacing/feasibility feedback that implies. Deferred because judging feasibility involves more than logged training data.

#### RPE/RIR Logging
Subjective effort logging per set to feed a more precise, autoregulated version of the progression engine. Deferred because it adds logging friction the MVP is deliberately avoiding.

## Data Objects (Product Level)

**Split / Mesocycle** — the lifter can create, clone, and edit a mesocycle, including its length and deload week placement. A mesocycle contains a set of Sessions assigned to days.

**Session** — a named workout template (e.g., "Push Day 1") the lifter can create, edit, duplicate across days, and reassign. Contains an ordered list of exercises with planned sets and target rep ranges.

**Exercise** — a library or custom-created movement the lifter can search, filter, create, edit, or soft-delete. Tagged with a muscle group; library exercises carry an image, custom ones don't.

**Gym** — a location the lifter can add, name, pin, and soft-delete. Holds per-exercise weight baselines for machine-based movements.

**Logged Session** — a record of a completed (or partially completed) day, created automatically as the lifter logs sets. Contains Logged Sets. Progress/deload tags are computed on read from the sets, never stored.

**Logged Set** — an individual weight/reps entry against a planned set. The lifter can create it during logging and edit it after the fact, which can retroactively affect that exercise's progress/deload tag.

**Goal** — a per-lift numeric target the lifter can create, view progress on, and archive (automatically on completion). Multiple can exist concurrently, one per lift.

**Cardio Log** — a record of a cardio session's type and duration, created by the lifter when logging cardio.

## Feature Dependencies

Split & Mesocycle Setup is foundational — Workout Logging, the Progressive Overload Engine, and Scheduled Deload all require a mesocycle and split to exist before they have anything to act on. The Exercise Library must exist before sessions can be built, since sessions reference exercises. Gym Management must exist before Gym-Specific Weight Tracking can attribute a logged weight to a baseline, though the two are natural to build together. The Progressive Overload Engine depends on Workout Logging producing history to evaluate, and Scheduled Deload depends on Split & Mesocycle Setup for its week-placement configuration; the two interact only through the suppression rule and are otherwise independent. Missed-Day Handling depends on Split & Mesocycle Setup's day schedule to know what was missed. Exercise Swap depends on the Exercise Library's muscle-group tagging. Goals depend on the same e1RM calculation used by the Progressive Overload Engine, so that engine should exist first, or at minimum the shared e1RM logic should be built as a common component both features draw from. Cardio Logging has no dependency on the progression system and can be built independently once Split & Mesocycle Setup exists to assign it to a day.
