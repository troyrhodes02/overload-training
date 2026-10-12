# Overload — Pitch 5: Progressive Overload Engine

> Source: Linear document "Overload — Pitch 5: Progressive Overload Engine"
> (project Overload V1 / P-OVE-1), pulled verbatim into the repository as the
> controlling pitch for slug `05-progressive-overload-engine`.

## Summary

**Type:** Feature
**Appetite:** L — Large
**Depends on:** Guided Workout Logging
**Unlocks:** Goals
**Primary features:** Progress / Hold / Deload Engine; e1RM Trend; Scheduled Deload Execution; Retroactive Re-evaluation
**Explicitly deferred:** Goals and goal-percentage UX

Pitch 5 turns Overload from a logging system into a decision-support system.

At completion, the lifter can:

* see whether each lift should **Progress**, **Hold**, or **Deload**;
* understand those calls as deterministic outcomes of logged performance against the authored rep range;
* see an e1RM trend for an Exercise;
* have scheduled deload weeks automatically reduce working load across the active split;
* avoid misleading reactive progression calls during scheduled deload weeks;
* correct a past log and have every affected derived conclusion change automatically;
* receive a suggested next-load increase when a valid progress call occurs without the app silently modifying history or the authored plan.

The defining principle of this pitch is:

> **The system interprets logged history; it does not rewrite it.**

`LoggedSet` remains the source of truth.

Progress/hold/deload and e1RM remain derived on read, never stored. The project explicitly makes this a core invariant.

---

# Problem

Pitch 4 solves:

> "What did I actually do?"

Pitch 5 solves:

> "What should I do with that information?"

The Product Brief's core job is not merely recording training. It is telling the lifter whether a lift should progress, hold, or deload so they no longer need to eyeball their own logs and make that decision manually.

The PRD describes the Progressive Overload Engine as the product's core differentiator: rule-based threshold detection against the planned rep range, backed by an e1RM trend used both for charting and as a secondary stall detector.

Without this pitch, Overload is still primarily a structured workout tracker.

With this pitch, Overload begins doing the thing mainstream trackers generally leave to the lifter:

> interpret performance and give a concrete action.

---

# Why This Pitch Exists Now

Pitch 5 depends directly on Guided Workout Logging because the engine has nothing trustworthy to evaluate until Logged Sets exist.

The roadmap explicitly sequences the product this way:

* Pitch 4 produces raw logged training history.
* Pitch 5 interprets it.
* Pitch 6 reuses the shared e1RM logic for Goals.

This ordering matters.

Progression logic should not operate against:

* inferred workouts;
* planned values;
* user-maintained "current weight" fields;
* manually stored tags.

It should operate against actual logged history.

---

# Appetite

**L — Large**

This pitch contains several tightly coupled decision systems:

* progress threshold;
* deload threshold;
* hold state;
* insufficient-history state;
* progression suggestion;
* e1RM calculation;
* e1RM per-session representation;
* rolling trend;
* stall override;
* scheduled deload load reduction;
* scheduled/reactive deload separation;
* historical recomputation;
* charting;
* dashboard/workout presentation of recommendations;
* deterministic treatment of swapped Exercises and shifted training dates.

The mathematical pieces are individually manageable.

The difficulty is ensuring they all share exactly the same interpretation of:

* Exercise identity;
* session history;
* rep-range context;
* Mesocycle week;
* scheduled-deload state;
* historical corrections.

This remains one pitch because all of those behaviors answer one product question:

> **What does the lifter's recent performance imply for this Exercise now?**

---

# Core Invariant: Derived, Never Stored

Progression outputs are views over history.

Do **not** add persistent fields such as:

* `progressionTag`;
* `needsDeload`;
* `e1rm`;
* `nextWeight`;
* `isStalled`.

The project explicitly requires progress/hold/deload and e1RM to remain pure functions of Logged Sets, planned rep range, and Mesocycle context.

Why:

If a past set changes, the truth changes.

A stored tag could become stale.

A computed tag cannot.

The one source of truth remains logged history.

---

# Product Vocabulary

## Progress

A **Progress** call means:

> recent logged performance has satisfied the progression threshold and the lift is eligible for a higher working weight next time.

Progress is represented visibly.

It is a recommendation, not an automatic mutation.

## Hold

A **Hold** means:

> neither the progress threshold nor the deload threshold has been satisfied.

Hold is the neutral state.

The approved product behavior is:

> Hold renders with **no tag**.

The absence of a Progress or Deload tag is the hold state.

Do not add a colored "Hold" badge merely for symmetry.

## Reactive Deload

A **Deload** call means:

> recent performance has consistently fallen below the planned rep-range requirement strongly enough to justify reducing load.

This is per Exercise. It is reactive to performance. It is different from the Mesocycle's scheduled deload week.

## Scheduled Deload

A **scheduled deload** is planned recovery across the entire split during the Mesocycle's designated week.

It is not caused by poor Exercise performance.

The project explicitly treats scheduled and reactive deload as two separate systems.

---

# Controlling Progression Defaults

The architecture intentionally left several progression constants open for the controlling pitch. This pitch adopts the standing pipeline defaults as controlling product defaults. They should be named configuration constants, not magic numbers.

- minimum history = 2 sessions;
- Progress consecutive sessions = 2;
- Deload consecutive sessions = 2;
- stall window = 3 sessions;
- suggested increment = 5 lbs;
- scheduled deload = 90%.

(Full per-rule detail — minimum history, progress/deload thresholds, hold, +5 lb suggestion, gym context, Epley e1RM, session-level max aggregation, trend, stall window/comparison/state, scheduled-deload 90% + rounding + suppression + sequence exclusion, shifted/log-late effective-week semantics, swapped exercises, per-exercise scope, gym-variable vs gym-consistent progression, charting, past-log re-evaluation, and the full Definition of Done, In/Out of Scope, Rabbit Holes, No-Gos, Edge Cases, Dependencies, Downstream Contract, and Source Gaps — are reproduced in the Linear document and are the binding text. The one-shot run prompt's Pre-resolved decisions resolve every Source Gap listed below.)

---

# Source Gaps & Decisions the One-Shot Prompt Must Resolve

1. Session-level e1RM aggregation → max e1RM among completed planned working sets (binding).
2. Progress before the 3-session stall window exists → Progress proceeds with 2 qualifying sessions; stall veto begins only at 3 qualifying sessions.
3. Stall presentation → distinct restrained attention state, never Deload styling (copy owned by UI design).
4. Scheduled-deload weight rounding → round down to nearest 5 lb (named load-step constant); never round above the raw 90% target.
5. Scheduled-deload sessions and the e1RM chart → retain as truthful chart points, visually marked; excluded from reactive threshold/stall sequences.
6. Machine/cable e1RM comparability across Gyms → gym-variable progression and e1RM trend are scoped to `(exerciseId, gymId)`; no cross-gym nominal-weight comparison; no invented conversion ratio.
7. Progress recommendation across Gym-variable equipment → +5 lb relative to the selected/current Gym baseline; gym-consistent uses the latest working-weight context + 5 lb.
8. Reactive precedence →
   1. scheduled-deload suppression first;
   2. insufficient history;
   3. reactive Deload if threshold met;
   4. Progress candidate if threshold met;
   5. stall veto if applicable;
   6. otherwise Hold.
   Deload takes safety precedence over Progress in any defensive conflict.

All of these are treated as approved authority for the autonomous run; see
`docs/specs/05-progressive-overload-engine-spec.md` → Resolved Decisions.

---

# UI-Bearing Classification

Pitch 5 is **UI-bearing**. The required pipeline is:

> **Pitch → Design Doc → UI Design Preview → Spec → Tickets → Implementation**

The `/overload-ui-design` stage is mandatory before the spec. The preview must
establish how the product visually differentiates Progress, ordinary Hold,
reactive Deload, scheduled Deload, and a stalled Progress candidate without
turning the interface into a noisy fitness dashboard.
