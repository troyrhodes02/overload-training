# Overload — Pitch 3: Split & Mesocycle Builder

> Pulled from Linear (project Overload V1): https://linear.app/overload-training/document/overload-pitch-3-split-and-mesocycle-builder-7972e1ce76ef — last updated 2026-10-09. The run prompt's "Pre-resolved decisions" (recorded in `docs/specs/03-split-mesocycle-builder-spec.md` → Resolved Decisions D1–D37) settle the "Source Gaps" listed at the end of this document.

## Summary

**Type:** Feature
**Appetite:** L — Large
**Depends on:** Library & Gyms Setup, Foundation
**Unlocks:** Guided Workout Logging; Cardio Logging
**Primary feature:** Split & Mesocycle Setup
**Explicitly deferred:** All workout execution and logging

Pitch 3 gives the lifter the ability to author the training plan that every later Overload feature will operate against.

At completion, the lifter can:

* create a mesocycle;
* give it a name;
* set its start date;
* choose its length;
* choose its scheduled deload week;
* start from a preset split structure or a fully custom structure;
* create named workout sessions;
* populate sessions with exercises from the Exercise Library;
* define planned working-set counts;
* define target rep ranges;
* order exercises inside a session;
* assign sessions to days of the week;
* duplicate a session onto another day;
* edit the duplicate independently afterward;
* clone a prior mesocycle forward;
* repair cloned plans when referenced exercises have been archived;
* distinguish an incomplete draft plan from a plan ready for use.

This pitch creates the **plan**.

It does not execute that plan.

There are no logged workouts, working weights, completion states, missed-day resolutions, exercise swaps, progression recommendations, or training history yet.

---

# Problem

Overload's core job is:

> Tell the lifter, per lift and per session, whether to progress, hold, or deload based on logged performance against their own plan.

The phrase **against their own plan** is fundamental.

The progression system cannot determine whether performance is good, bad, improving, or falling short unless it knows what the lifter intended to perform:

* which exercises;
* on which days;
* for how many sets;
* within what rep range;
* inside what training block;
* and when the planned deload occurs.

Pitch 2 established the reusable Exercise Library.

Pitch 3 turns those exercises into a structured training plan.

This replaces the planning half of the lifter's current notes-based workflow. Instead of maintaining an informal list such as:

> Monday — Push
> Bench 3×6–8
> Incline DB 3×8–10
> Lateral Raise 4×12–15

the lifter can author that same intent as structured, persistent plan data that future workout logging and progression logic can operate against.

The plan remains entirely lifter-authored.

Overload organizes it; Overload does not decide what the plan should be.

---

# Why This Pitch Exists Now

The roadmap deliberately sequences plan creation after Exercise Library because Sessions reference Exercises.

The PRD likewise states that the Exercise Library must exist before Sessions can be built.

Once Pitch 3 ships, two important downstream capabilities become possible:

1. **Guided Workout Logging** can finally answer "what am I supposed to train today?"
2. **Cardio Logging** can later attach cardio to a planned split day.

The roadmap identifies Pitch 3 as the transition from setup into something the lifter could actually live inside day to day.

---

# Appetite

**L — Large**

This pitch contains multiple interacting plan-authoring capabilities:

* mesocycle lifecycle;
* date and week configuration;
* scheduled-deload placement;
* preset split structures;
* fully custom split structures;
* session creation;
* exercise selection;
* set planning;
* rep-range planning;
* exercise ordering;
* day assignment;
* session duplication;
* independent editing after duplication;
* clone-forward;
* archived-exercise reconciliation;
* draft/ready validation;
* mobile-first editing.

That is substantial surface area.

However, this pitch should remain one coherent vertical slice.

A "mesocycle without sessions" is not useful.

A "session builder without day assignment" is incomplete.

A "preset selector without editable sessions" conflicts with the product's requirement that the lifter authors their own program.

Splitting these into separate pitches would create intermediate states with little independent value.

The way to keep this Large pitch controlled is through **strict boundaries**, not horizontal splitting.

---

# Core Product Model

## Mesocycle

A Mesocycle is one bounded training block.

It defines the container in which the lifter's planned weekly sessions live.

At the product level, the Architecture Doc describes it with:

* name;
* length in weeks;
* scheduled deload week;
* split type;
* status;
* start date;
* Sessions.

Pitch 3 makes that concept user-manageable.

---

## Session

A Session is a **planned workout template** inside a Mesocycle.

Examples:

* Push Day 1
* Pull Day 1
* Leg Day
* Upper Body
* Lower Body

A Session is not a performed workout.

That terminology must remain stable because later Overload also has `LoggedSession`. The project's standing rules explicitly distinguish planned `Session` from an actual trained `LoggedSession`.

A Session contains an ordered list of planned Exercises.

For each exercise, the plan records:

* which Exercise;
* planned working-set count;
* target rep range;
* order in the Session.

The Architecture Doc establishes that shape.

No logged performance exists here.

---

# Solution Shape

## 1. Mesocycle Creation

The lifter can create a new Mesocycle.

Creation establishes the high-level parameters of the training block before or alongside building its weekly structure.

The Mesocycle includes:

* name;
* start date;
* length in weeks;
* scheduled deload week;
* split structure/type.

The default configuration is:

* **5 weeks total**
* **week 5 as scheduled deload**

Both values are pre-filled conveniences, not hard rules.

The PRD explicitly requires length and deload week to be editable at creation.

---

# 2. Mesocycle Length

The lifter chooses how many weeks the Mesocycle lasts.

The default is 5.

The default must never become an implicit fixed program rule.

The user is authoring the block; Overload is merely providing the project's agreed starting value.

The design should make the default easy to accept but equally easy to change.

---

# 3. Scheduled Deload Week Placement

The lifter chooses which week is the Mesocycle's scheduled deload.

The default is:

> Week 5 of a 5-week Mesocycle.

This pitch records **where** the scheduled deload occurs.

It does **not** decide or implement:

* how much working weight is reduced;
* how many sets are reduced;
* how the workout screen renders deload weights;
* reactive per-exercise deload recommendations.

Those belong to the later progression behavior.

Pitch 3 merely establishes the plan-level configuration that later scheduled-deload logic consumes.

---

# 4. Mesocycle Start Date

A Mesocycle has a start date, consistent with the approved Architecture model.

The start date anchors:

* week numbering;
* day-of-week schedule;
* later determination of which Mesocycle week is active;
* later determination of whether the scheduled deload week is active.

Pitch 3 records that planning intent.

It does not yet create daily workout instances or missed-day records.

---

# 5. Split Structure

The lifter can begin from one of the approved split structures:

* Push / Pull / Legs
* Arnold Split
* Bro Split
* Custom

The purpose of a preset is to reduce structural setup work.

It is **not** to author a program on the lifter's behalf.

This distinction is non-negotiable because the Product Brief explicitly says Overload must not generate training programs or mesocycles for the lifter.

Therefore:

> A preset defines organizational structure, not exercise prescription.

---

# 6. Preset Split Behavior

Selecting a preset may establish the recognizable **session/day structure** associated with that split type.

It must not automatically prescribe:

* exercises;
* planned set counts;
* rep ranges;
* weights;
* progression rules.

For example, a Push / Pull / Legs preset can help establish session categories/names such as:

* Push
* Pull
* Legs

and give the lifter an editable starting structure.

It must not decide:

> Bench Press 3×8
> Incline Dumbbell Press 3×10
> Lateral Raise 4×15

That would be program generation, which is a permanent product non-goal.

Every actual exercise prescription remains the lifter's decision.

---

# 7. Custom Split Building

The lifter can choose **Custom** and author the weekly structure from scratch.

Custom means the lifter controls:

* session names;
* which days contain sessions;
* which exercises belong to each session;
* exercise order;
* planned working-set count;
* target rep ranges.

There is no assumption that a custom split resembles PPL, Arnold, upper/lower, or any conventional template.

Overload should support the structure the lifter already wants rather than forcing the lifter into an app-defined programming methodology.

---

# 8. Session Creation

Within a Mesocycle, the lifter can create named planned Sessions.

Examples:

* Push Day 1
* Pull Day 1
* Leg Day
* Upper A
* Lower B

The Session is the planned workout unit later shown by Guided Workout Logging.

A Session must be editable while authoring the Mesocycle.

The exact creation/editing interaction belongs to the design-doc stage.

---

# 9. Adding Exercises to a Session

Exercises are selected from the existing Exercise Library established by Pitch 2.

The Session builder should consume the Exercise Library rather than create a second exercise-management system.

That means exercise selection may take advantage of existing library capabilities such as:

* search;
* Favorites;
* primary-muscle filtering;
* imported/custom exercises;
* archived-exercise exclusion.

Creating a Session does not duplicate an Exercise record.

It references the reusable Exercise identity.

---

# 10. Planned Sets

For each Exercise in a Session, the lifter defines the planned number of working sets.

Example:

> Barbell Bench Press
> 3 planned sets

Pitch 3 stores the intended set count.

It does not create three Logged Sets.

Those only exist once a workout is actually performed in Guided Workout Logging.

---

# 11. Target Rep Range

For each planned Exercise, the lifter defines a lower and upper rep target.

Examples:

* 4–6
* 6–8
* 8–10
* 10–12
* 12–15

This range becomes extremely important later.

The progression engine evaluates logged performance **against the planned rep range**. The project's business rules explicitly define progression around that planned range.

Pitch 3 therefore owns the source planning data the progression engine will eventually read.

It does not implement any interpretation of that range yet.

---

# 12. Exercise Ordering

Exercises inside a Session have an explicit order.

The lifter can determine that order while building the Session.

Order matters because Guided Workout Logging should later present the planned workout in the same sequence.

The product should not infer exercise priority from:

* Favorites;
* muscle group;
* equipment type;
* exercise name.

The lifter authors the sequence.

---

# 13. Assigning Sessions to Days

A Session is assigned to a day of the week.

This creates the recurring weekly schedule inside the Mesocycle.

Conceptually:

| Day | Planned Session |
| -- | -- |
| Monday | Push Day 1 |
| Tuesday | Pull Day 1 |
| Wednesday | Legs |
| Thursday | Push Day 2 |
| Friday | Pull Day 2 |
| Saturday | — |
| Sunday | — |

Rest days simply have no lifting Session assigned.

The later workout logger uses this schedule to determine what is planned for a given date.

Pitch 3 does not instantiate or complete those workouts.

---

# 14. Session Duplication Across Days

The lifter can duplicate a Session onto another day.

This exists for common structures where two days begin from similar programming.

Example:

* build Push Day 1 on Monday;
* duplicate it onto Thursday;
* edit Thursday into Push Day 2.

The PRD specifically requires that a duplicated Session be independently editable afterward.

Therefore duplication means:

> create a new independently editable Session from the existing Session's plan.

It does **not** mean two days permanently share the same mutable template.

Editing Thursday must not silently edit Monday.

---

# 15. What Session Duplication Copies

At the product level, duplication should carry forward the authoring content necessary to make duplication useful:

* session identity as a new copy;
* exercise selections;
* exercise order;
* planned set counts;
* target rep ranges.

The new copy may then be edited independently.

Duplication does not copy:

* logged workout data;
* performance;
* progress tags;
* working weights;
* gym baselines.

None of those exist in Pitch 3 anyway.

---

# 16. Mesocycle Readiness

A Mesocycle with no exercises assigned anywhere is not meaningfully usable as an active training block.

The PRD explicitly identifies this edge case and requires that such a block either be blocked from going live or clearly marked incomplete.

This pitch should adopt a clear product distinction between:

* **draft/incomplete plan**
* **ready/active plan**

The lifter should be able to work on an incomplete plan without losing progress.

But Overload must not treat an empty structure as a valid live training block that Guided Workout Logging could later act against.

The exact state model belongs to the spec, but the product behavior is:

> incomplete authoring is allowed; incomplete activation is not.

---

# 17. Editing a Plan Before Training

The lifter can revise the Mesocycle they are authoring:

* length;
* deload week;
* sessions;
* day assignment;
* exercises;
* exercise order;
* set counts;
* rep ranges.

Pitch 3 is entirely plan authoring, so editing the plan before workout history exists is straightforward product behavior.

The later question of editing plan templates after workouts have been logged is **not owned by this pitch** unless already settled by a later feature.

Do not pre-solve historical versioning here.

---

# 18. Clone Prior Mesocycle Forward

The lifter can start a new Mesocycle by cloning a prior one rather than rebuilding the training plan from scratch.

This supports the way self-programming lifters usually work:

> keep most of the structure, then make deliberate changes for the next block.

Clone-forward creates a **new Mesocycle**.

It is not reopening or mutating the old one.

The prior Mesocycle remains a distinct historical plan.

---

# 19. What Clone-Forward Carries

The new Mesocycle begins with the prior Mesocycle's reusable **plan structure**, including:

* split structure/type;
* Sessions;
* day assignments;
* session names;
* exercise selections;
* exercise order;
* planned set counts;
* target rep ranges;
* mesocycle configuration where appropriate as an editable starting point.

The clone then becomes independently editable.

The lifter may change:

* Mesocycle name;
* start date;
* length;
* scheduled deload week;
* sessions;
* days;
* exercises;
* volume;
* rep ranges.

The old Mesocycle must not change when its clone is edited.

---

# 20. Clone-Forward Never Copies Training History

Clone-forward copies the **plan**, not the performed history.

It must never clone:

* Logged Sessions;
* Logged Exercises;
* Logged Sets;
* progression tags;
* e1RM values;
* completed-day states;
* missed-day decisions;
* gym baselines;
* goals.

The Product Brief's mental model is one training block carried forward as planning intent, not performance records duplicated into a new block.

---

# 21. Archived Exercises During Clone-Forward

An important edge case occurs when an older Mesocycle references an Exercise that has since been archived.

The PRD explicitly requires those cloned slots to be surfaced as needing attention rather than silently failing.

The clone should preserve enough context for the lifter to understand:

> this slot referenced an exercise that is no longer available for normal future selection.

The lifter must repair the affected slot before the cloned Mesocycle is considered ready.

Do not:

* silently drop the exercise;
* silently replace it;
* silently reactivate it;
* choose an alternative automatically.

That would alter the lifter's program.

---

# 22. Archived Exercises in New Session Building

Normal exercise selection should exclude archived Exercises, consistent with Pitch 2.

A newly built Session should not offer archived Exercises as if they were active choices.

However, a prior plan that already referenced one must remain intelligible for clone/reconciliation behavior.

This preserves the distinction established in Pitch 2:

> archived means unavailable for future selection, not erased from history.

---

# In Scope

## Mesocycle Setup

* new Mesocycle creation;
* Mesocycle name;
* start date;
* length in weeks;
* default 5-week length;
* scheduled deload week;
* default deload in week 5;
* editable length/deload values;
* preset split selection;
* custom split selection;
* draft/incomplete state;
* readiness/activation validation.

## Preset Structures

* PPL;
* Arnold;
* bro split;
* editable structural starting point;
* no prescribed exercises/sets/reps.

## Session Builder

* Session creation;
* Session naming;
* Exercise Library selection;
* Favorites/search/filter reuse where available;
* exercise ordering;
* planned set count;
* target rep minimum;
* target rep maximum;
* editing while authoring;
* day assignment.

## Duplication

* duplicate a Session to another day;
* copy its planned exercise structure;
* independently edit the duplicated Session afterward.

## Mesocycle Clone-Forward

* choose a prior Mesocycle;
* create a new Mesocycle based on its plan;
* independently edit the clone;
* preserve the old Mesocycle;
* surface archived Exercise references requiring attention;
* prohibit clone activation until unresolved slots are repaired.

## Supporting UI States

The design-doc/UI-design stages should account for:

* no Mesocycle yet;
* create-first-Mesocycle entry point;
* preset selection;
* custom setup;
* partially built Mesocycle;
* empty Session;
* populated Session;
* exercise picker;
* no exercise matches;
* day-assignment state;
* duplicate action;
* independent duplicate editing;
* invalid rep range;
* missing planned-set count;
* incomplete Mesocycle;
* ready Mesocycle;
* clone-source selection;
* successful clone;
* archived Exercise conflict inside clone;
* phone layout;
* loading/error states.

---

# Out of Scope

## No Workout Logging

Pitch 3 does not create:

* Logged Sessions;
* Logged Exercises;
* Logged Sets;
* set-entry fields;
* workout completion;
* history;
* dashboard "today's workout" behavior;
* past-log editing.

The roadmap explicitly defines this pitch as pure plan authoring.

---

# No Working Weights

A Session Exercise contains:

* planned sets;
* target rep range.

It does **not** establish its workout weight.

The Architecture's existing plan model likewise defines SessionExercise around set count and rep range rather than current weight.

Current working weight is a later concern derived from training data/gym context.

Do not add:

* target weight;
* starting weight;
* prescribed load;
* percentage of max.

---

# No Progress / Hold / Deload Recommendation

Do not calculate:

* progress;
* hold;
* reactive deload;
* e1RM;
* stall detection.

Pitch 3 records the rep-range inputs those systems later consume.

---

# No Scheduled-Deload Execution

Pitch 3 records:

> which Mesocycle week is the scheduled deload.

It does not yet reduce load.

The actual scheduled-deload behavior belongs with the progression system.

---

# No Gym Selection

Gyms exist from Pitch 2, but a planned Session is not tied to a specific Gym in the approved product shape.

The lifter may train the same planned Session at different locations.

Gym attribution belongs to actual workout logging.

Do not assign Sessions or Mesocycles permanently to a Gym.

---

# No Exercise Swap

Editing the plan is not the same as swapping an exercise during an active workout.

Exercise Swap belongs to Guided Workout Logging.

---

# No Missed-Day Handling

Pitch 3 defines the normal recurring weekly schedule.

It does not handle deviations from that schedule.

Do not implement:

* Log it late
* Shift the week
* Skip it

Those require actual calendar dates and workout state and belong to Guided Workout Logging.

---

# No Cardio Authoring Yet

Although Cardio Logging later depends on the split schedule, the roadmap places Cardio in its own later pitch.

Pitch 3 should not expand into cardio-session authoring unless the roadmap is intentionally amended.

The PRD says cardio attaches to split days, but the current roadmap deliberately leaves that capability for Cardio Logging.

---

# No Program Generation

This is the most important product boundary in Pitch 3.

Do not let presets turn into generated programming.

The app must not choose:

* exercises;
* number of sets;
* rep ranges;
* weights;
* progression method;
* deload intensity.

The lifter authors the program.

Overload provides structure and editing tools.

The Brief makes program generation a permanent non-goal.

---

# Behavioral Rules

## A Mesocycle is a bounded training block

It has:

* a start;
* a number of weeks;
* one scheduled-deload week;
* a recurring weekly Session structure.

---

## Defaults are conveniences, not requirements

Default:

* 5 weeks;
* deload week 5.

Both are editable.

---

## Presets create structure, not prescriptions

Preset:

> "Start me with the structural shape of PPL."

Not:

> "Write me a PPL program."

---

## Session and LoggedSession remain distinct concepts

`Session` = planned template.

`LoggedSession` = a performed day, introduced later.

Never use these terms interchangeably.

---

## Sessions own planned intent

A Session specifies:

* exercises;
* order;
* planned sets;
* target rep range.

It contains no performed data.

---

## A rep range must be coherent

For every Exercise:

> minimum target reps ≤ maximum target reps.

Exact numeric allowed ranges belong to the spec if not already governed elsewhere.

---

## Duplication creates independence

After duplication:

> editing copy B must not change copy A.

---

## Clone-forward creates independence

After cloning:

> editing Mesocycle B must not change Mesocycle A.

---

## Clone-forward copies plan, never history

No performed data is ever cloned into a new Mesocycle.

---

## Archived Exercise conflicts are explicit

A clone containing an archived Exercise remains understandable but requires repair before readiness.

---

# Definition of Done

## 1. A Mesocycle can be created from a preset or custom structure

The lifter can choose:

* PPL;
* Arnold;
* bro split;
* Custom.

**PRD trace:**
"A lifter can select a preset split type or build a fully custom one from scratch."

Preset structure must remain compatible with the permanent no-program-generation boundary.

---

## 2. Mesocycle duration is configurable

Creation pre-fills:

* 5 weeks.

The value can be changed.

**PRD trace:**
"Mesocycle length and deload week are set at creation with pre-filled defaults, and both are editable."

---

## 3. Scheduled deload placement is configurable

Creation pre-fills:

* week 5.

The user can change it to another valid week inside the chosen Mesocycle length.

**PRD trace:** same criterion above.

This criterion covers configuration only, not load reduction behavior.

---

## 4. Sessions can be built

The lifter can create a named Session containing an ordered list of Exercises.

Each Exercise includes:

* planned working-set count;
* target rep range.

**Roadmap trace:**
"A session can be built with exercises, planned sets, and target rep ranges."

---

## 5. Sessions can be assigned to days

A built Session can be assigned to a day of the week inside the Mesocycle schedule.

**PRD trace:**
"A session can be assigned to a day."

---

## 6. Sessions can be duplicated

A Session can be duplicated onto another day.

The duplicate begins from the source Session's planned structure.

**PRD trace:**
"A session can be ... duplicated onto another day."

---

## 7. Duplicated Sessions are independently editable

Changes to the duplicate do not mutate the source Session.

**PRD trace:**
A duplicated Session can be "edited independently after duplication."

---

## 8. Incomplete Mesocycles cannot become valid live plans

A Mesocycle with no Exercises assigned anywhere must be blocked from readiness/activation or clearly remain incomplete.

This pitch adopts:

> **allow drafting; block activation until the plan contains usable exercise programming.**

**PRD trace:**
Starting a Mesocycle with no Exercises is either blocked or clearly flagged incomplete before it can go live.

---

## 9. A prior Mesocycle can be cloned forward

The lifter can select an existing prior Mesocycle and create a new independent Mesocycle from its plan.

**PRD trace:**
"A new mesocycle can be created by cloning and editing a prior one."

---

## 10. Clone-forward copies plan structure, not performed history

The cloned Mesocycle receives the reusable authored plan only.

No logged/performance data is copied.

This follows the approved distinction between Mesocycle/Session plan objects and later LoggedSession/LoggedSet data.

---

## 11. Archived Exercise references are surfaced during clone-forward

If a source Mesocycle references an Exercise that has since been archived:

* cloning must not silently fail;
* the slot must remain visible as needing attention;
* it must be repaired before the cloned Mesocycle becomes ready.

**PRD trace:**
Archived references in a clone must surface as needing attention.

---

# Rabbit Holes

## 1. Turning presets into programs

This is the largest conceptual risk.

A preset is supposed to save structural setup time.

It is tempting to make PPL immediately useful by filling in common movements such as:

* Bench Press;
* Lat Pulldown;
* Squat.

Do not.

The moment Overload chooses exercises, sets, or rep ranges, it is authoring the lifter's program and violating a permanent Brief non-goal.

---

## 2. Hardcoding the 5-week default

Five weeks / deload on week 5 is a pre-fill.

It is not "how Overload mesocycles work."

Do not let implementation assumptions make other lengths awkward or invalid without product authority.

---

## 3. Treating duplicated Sessions as aliases

The easiest data model could make Monday and Thursday point at one Session.

That violates the accepted behavior because the duplicate must be editable independently.

Duplication is a copy operation, not a second schedule reference to the exact same mutable plan.

---

## 4. Accidentally cloning history

Later, Mesocycles will accumulate real logged history.

Clone-forward must remain carefully defined as:

> plan-forward.

Do not design clone behavior around copying everything associated with a Mesocycle.

---

## 5. Auto-replacing archived Exercises

An archived Exercise creates a repair state.

It does not authorize Overload to choose a replacement.

Even if another Exercise has the same primary muscle group, automatic substitution would become program generation.

---

## 6. Solving workout deviation too early

Once dates and day assignments exist, it may feel natural to start handling missed days.

Do not.

Pitch 3 defines intended schedule only.

Pitch 4 owns reality diverging from that schedule.

---

## 7. Adding planned weights

A planned Exercise already has sets and rep targets, which makes "starting weight" seem like the next obvious field.

The architecture intentionally does not place current working weight in SessionExercise.

Do not invent it here.

---

## 8. Making the builder desktop-first

Plan construction has a relatively dense interaction surface, but Overload's primary usage context remains a phone browser.

The UI design must not assume dragging tiny rows on a desktop is the only usable editing method.

The design stage should solve mobile authoring intentionally.

---

# No-Gos

Do not:

* generate exercises for a preset;
* generate planned set counts for a preset;
* generate rep ranges for a preset;
* generate training programs;
* assign planned working weights;
* add e1RM values;
* implement progression calls;
* implement reactive deload;
* execute scheduled-deload load reduction;
* create LoggedSessions;
* create LoggedSets;
* create workout history;
* implement day completion;
* implement missed-day handling;
* implement in-workout Exercise Swap;
* assign a planned Session permanently to a Gym;
* copy history during Session duplication;
* copy history during Mesocycle clone-forward;
* silently reactivate archived Exercises;
* silently replace archived Exercises;
* create cardio plan functionality unless the roadmap is amended;
* add social/shared templates;
* add public/community program templates.

The existing pipeline guidance identifies three especially likely Pitch 3 scope violations: letting presets populate exercises/sets/rep ranges, letting clone-forward copy logged history, and hardcoding the 5-week default instead of treating it as editable.

---

# Edge Cases the Design and Spec Must Handle

These are product situations downstream stages must deliberately address. They do not create new feature scope.

## Mesocycle configuration

### Deload week greater than Mesocycle length

Must not produce a valid configuration.

If Mesocycle length changes so that the existing deload week is no longer valid, the user must be prompted or required to resolve it rather than the system silently guessing a new week.

The exact validation interaction belongs downstream.

---

### Deload week equals final week

Valid and is the default.

---

### Non-final deload week

Must also be representable because deload placement is explicitly editable.

---

### Start date and day schedule

The start date must consistently anchor the Mesocycle schedule.

The spec should define calendar semantics precisely.

Do not let week numbering vary between features.

---

## Session creation

### Session has no Exercises

A draft empty Session may be useful while authoring.

But a Mesocycle composed only of empty Sessions must not become a ready/live plan.

---

### Exercise has zero planned sets

The sources establish planned set count but do not define whether zero is meaningful.

The spec must explicitly define validation rather than treating zero ambiguously.

A zero-set Exercise would not provide useful workout intent and should not accidentally be considered valid.

---

### Rep minimum exceeds rep maximum

Invalid.

Do not silently swap user-entered values.

---

### Equal rep bounds

A fixed-rep target such as:

> 5–5

should be treated consistently if allowed by the spec.

The upstream sources do not explicitly prohibit fixed-rep targets.

---

### Exercise appears twice in one Session

The approved docs do not state whether this is allowed.

The spec must make the choice explicit rather than inheriting a database uniqueness constraint accidentally.

---

### Same Session name used twice

Display names should not automatically be treated as identity.

The sources do not establish uniqueness.

---

### Multiple Sessions on one day

The current architecture describes a Session as assigned to a day of the week but does not explicitly state whether more than one lifting Session may occupy one day.

The downstream spec must resolve this based on the intended schedule model rather than database convenience.

This is a genuine source gap.

---

## Duplication

### Duplicate to an occupied day

The sources do not state whether the operation:

* replaces;
* blocks;
* adds another Session;
* asks for another destination.

This depends directly on the unresolved one-vs-many Sessions-per-day rule and must be made explicit by the controlling spec.

---

### Duplicate a Session containing an archived Exercise

Normal future selection excludes archived Exercises, but an already-authored Session may reference one.

If duplication encounters that state, it must not silently rewrite program intent.

The same preservation-and-repair principle as clone-forward should apply unless the spec identifies another upstream-approved rule.

---

## Clone-forward

### No prior Mesocycles exist

Clone-forward is simply unavailable or has an understandable empty state.

The normal create-new flow remains available.

---

### Multiple prior Mesocycles exist

The lifter needs to identify which plan is being cloned.

The design stage determines the presentation.

---

### Cloned source has archived Exercise

Explicit repair state.

---

### Clone uses old dates

A clone must become a new block, so its start date cannot simply remain the historical source start date without deliberate user intent.

The exact prefill behavior should be resolved in the spec/design.

---

### Clone source was itself cloned

No special lineage behavior is required unless later approved.

Clone the selected plan's current authored structure.

Do not recursively copy ancestry.

---

# Dependencies

## Foundation

Pitch 3 assumes the application already has:

* authentication;
* persistent database;
* secure server-side data access;
* application shell;
* deployment foundation.

---

## Library & Gyms Setup

The direct product dependency is specifically the **Exercise Library**.

Pitch 3 assumes:

* Exercises exist;
* exercise identity is stable;
* search works;
* Favorites work;
* primary-muscle filtering works;
* custom Exercises can participate normally;
* archived Exercises are excluded from normal future selection.

The PRD makes Exercise Library → Split & Mesocycle Setup an explicit dependency.

Gym Management happens to ship in the same preceding pitch but is not materially required to author a lifting Session.

---

# Downstream Contract

## Guided Workout Logging may assume

After Pitch 3, Guided Workout Logging can rely on:

* an active/ready Mesocycle exists;
* its start date is known;
* current Mesocycle week can be determined;
* scheduled deload week is known;
* Sessions exist;
* Sessions have stable identity;
* Sessions are assigned to days;
* Exercises are ordered;
* each planned Exercise has a set count;
* each planned Exercise has a target rep range;
* the plan contains no unresolved archived-Exercise references;
* duplicated Sessions are independent.

Guided Workout Logging should not have to invent plan structure.

---

## Progressive Overload Engine may later assume

* target rep ranges originate from the authored Session plan;
* scheduled deload week originates from Mesocycle configuration;
* no progression recommendation has mutated the authored plan automatically.

The progression engine interprets plan + history.

It does not become the plan author.

---

## Cardio Logging may later assume

A weekly Mesocycle/day structure exists to which cardio can eventually attach.

Pitch 3 itself does not need to implement cardio planning.

---

# UI-Bearing Classification

This pitch is **strongly UI-bearing**.

It creates multiple complex user-facing authoring surfaces:

* Mesocycle creation;
* preset/custom selection;
* weekly schedule;
* Session builder;
* Exercise picker;
* set/rep-range controls;
* day assignment;
* duplication;
* clone-forward;
* incomplete-plan validation;
* archived-Exercise repair.

Under the updated Overload pipeline, this pitch therefore requires:

> **Pitch → Design Doc → UI Design Preview → Spec → Tickets → Implementation**

The UI-design stage must not be skipped.

The design preview should be treated as the visual contract for these authoring surfaces before the technical spec is produced.

---

# Source Gaps & Decisions the Run Prompt Must Resolve

Pitch 3 is well defined at the feature level, but several implementation-relevant product rules are not settled upstream.

These should be pre-resolved in the one-shot prompt rather than left for ticket implementation.

## 1. What exactly do presets create?

The PRD names PPL, Arnold, and bro split as preset structures but does not define their precise day/session skeletons.

The permanent no-program-generation rule establishes what they **cannot** create:

* exercises;
* set counts;
* rep ranges;
* weights.

But the exact schedule skeleton for each preset still needs an explicit product decision.

That should be resolved before implementation.

---

## 2. How many lifting Sessions may be assigned to one day?

The Architecture Doc says a Session is assigned to a day, but does not specify cardinality.

Pitch 3 must decide whether the lifting schedule supports:

* exactly zero or one Session per day; or
* multiple lifting Sessions on one day.

The rest of the app's "today's planned session" language generally reads singular, but this should be made explicit rather than inferred silently.

---

## 3. Activation lifecycle

The Architecture model names Mesocycle status as active/archived.

The PRD discusses incomplete plans before they "go live."

That creates a likely need for draft/readiness semantics, but the exact lifecycle is not completely specified.

The run prompt/spec should resolve:

* whether draft is a persisted status;
* when a Mesocycle becomes active;
* whether more than one may be active;
* what happens to the prior active Mesocycle when a new one activates.

Do not allow database constraints to answer these accidentally.

---

## 4. Exercise duplication inside a Session

The upstream documents do not say whether the same Exercise can occur twice inside one Session.

Resolve explicitly.

---

## 5. Session-name uniqueness

No upstream rule requires unique Session names.

Resolve deliberately.

---

## 6. Clone-forward configuration defaults

The PRD says clone and edit forward but does not specify exactly what happens initially to:

* name;
* start date;
* length;
* deload week.

The plan structure clearly copies; these high-level fields need explicit prefill behavior.

---

## 7. Session deletion/removal

The source docs define create/edit/duplicate/reassign behavior at product level but do not explicitly describe removing a Session from an in-progress Mesocycle.

A usable builder will likely need some form of removal.

Because acceptance criteria do not explicitly name it, the run should classify whether this is necessary supporting CRUD or a missing upstream requirement rather than casually adding behavior.

---

## 8. Exercise removal from a Session

Similarly, building/editing a Session logically implies the ability to correct exercise selection, but the PRD does not enumerate removal as a separate acceptance criterion.

The design/spec should treat normal authoring correction carefully without expanding into historical deletion semantics.

---

# Explicit Interpretation of Presets

Until the one-shot prompt resolves their exact skeleton, this pitch establishes the governing rule:

> **Presets save structural setup; they never supply programming content.**

Any preset design must satisfy all of these:

* session/day structure only;
* completely editable;
* no Exercises automatically selected;
* no set counts automatically prescribed;
* no rep ranges automatically prescribed;
* no weights;
* no coaching recommendations.

This protects the Brief's permanent boundary while preserving the PRD's preset requirement.

---

# Scope Check

Pitch 3 is large, but it remains a coherent vertical capability.

At completion the lifter can go from:

> "I need to set up my next training block"

to:

> "My complete weekly plan exists in Overload and is ready to train against."

That is real end-user value.

The pitch is not merely:

* Mesocycle database objects;
* Session CRUD;
* a calendar screen.

Those pieces ship together because none is useful enough alone.

The pitch should **not** be split into backend versus UI or Mesocycle versus Session infrastructure.

The correct boundary is:

> author the complete plan now; execute and interpret it later.

---

# Pitch Completion Test

Pitch 3 is ready for design-doc/UI-design/spec when the following are unambiguous:

**What does a Mesocycle represent?**
A bounded, dated training block containing the lifter's weekly planned Sessions.

**What are the defaults?**
5 weeks, with week 5 as scheduled deload.

**Can those defaults change?**
Yes.

**What do presets do?**
Provide editable split structure only.

**Do presets choose exercises, sets, or reps?**
No.

**Can the lifter build a fully custom structure?**
Yes.

**What is a Session?**
A planned workout template, not a performed workout.

**What does each planned Exercise contain?**
Exercise identity, order, planned set count, and target rep range.

**Can Sessions be assigned to days?**
Yes.

**Can a Session be duplicated?**
Yes.

**Does editing the duplicate alter the source?**
No.

**Can a prior Mesocycle be cloned?**
Yes.

**Does cloning mutate the prior Mesocycle?**
No.

**Does cloning copy workout history?**
Never.

**What happens when a clone contains an archived Exercise?**
The affected slot is surfaced for repair before the new plan is ready.

**Can an empty plan go live?**
No.

**Are workouts logged in this pitch?**
No.

**Are working weights stored in the plan?**
No.

**Does Pitch 3 execute the scheduled deload?**
No; it only records its week.

**Does Overload author the user's training program?**
No.

**Does this pitch require UI Design in the pipeline?**
Yes—mandatory.

With those boundaries fixed, Pitch 3 gives the downstream design stages a clear job: build a fast, mobile-first plan authoring experience without drifting into training execution or program generation.
