# Prescription-Aware Intelligence — Pitch

Supplied by the owner on 2026-11-15 as the first implementation feature of the **Smarter Workout Intelligence & Planning** initiative. This file records the owner's pitch as the authority for the run. The decisions below are approved owner direction and are carried into the spec's Resolved Decisions.

**Placement.** This pitch is not yet listed in `docs/planning/pitch-roadmap.md` or `docs/planning/prd.md` and has no pitch number. It sits in the MVP 5C folder (features on both clients: it changes web behavior and the shared mobile contracts). Adding it to the roadmap and PRD, and assigning its number, is an owner amendment recorded in the owner notes. A run does not edit `docs/planning/`.

**Client scope:** both. The web app changes behavior and UI; the shared mobile contracts change additively. No native screen is built in this pitch (the native workout loop is slice 21e).

**Capability:** working-weight prefills and the reference line are **Free** (capture). Progression calls, their suggested loads, and their evidence stay **Pro** (`progression_insights`), unchanged.

## Problem

Overload reads "the most recent performance of this exercise" for every piece of workout context: the set-1 weight offer, the "Last time" line, the progress/hold/deload call, the +5 lb suggestion, and the scheduled-deload 90% load. When one exercise appears in two recurring workouts with different prescriptions, each workout is anchored to the other one. Wednesday's 6–8-rep bench is offered Saturday's 255 lb top set, and Saturday's 3–5 is offered Wednesday's lighter load. A Pro call can say "Add 5 lb" on Wednesday because Saturday hit the top of its range.

Machines and cables have a second defect: the weight offer is the gym baseline first, which only moves on a 15% deviation. A lifter who progresses a 50 lb cable to 55 lb is offered 50 lb again, and a Progress call says "Add 5 lb → 55", the weight they already lift.

## Example

Saturday — Push: Barbell Bench Press, 3–5 reps, planned RIR 1–2, last logged 255 lb.
Wednesday — Upper: Barbell Bench Press, 6–8 reps, planned RIR 2–3, last logged 230 lb.

Desired: next Saturday offers 255 lb from Push; next Wednesday offers 230 lb from Upper; each has its own progression call; both still feed one Barbell Bench Press history, its records, goals, and canonical e1RM.

## Semantic model

1. **Exercise** — the movement (Barbell Bench Press).
2. **Recurring exercise** — the exercise inside a durable recurring workout (bench in Push).
3. **Prescription** — the planned rep range and, once Planned Workout Guidance ships, the planned target RIR.
4. **Logged performance** — what was actually done.
5. **Progression segment** — a contiguous run of comparable performances of one recurring exercise.

No heavy, light, volume, strength, or hypertrophy labels. The interface speaks in facts: "Last time in Push", "Push · 3–5 reps".

## Approved decisions

1. Durable identity: `Session.lineageId` + performed exercise id. The lineage is immutable, account-scoped, unique per mesocycle, inherited by clone, fresh for new and duplicated sessions, never client-supplied, and never a cross-account relation. Renaming a workout or moving it to another day keeps its history.
2. One exercise history: records, bests, PRs, canonical e1RM, and goals stay exercise-wide.
3. Only observed weights prefill. No rep/RIR/e1RM conversion. No trusted match → empty input.
4. Reference-only fallback: another recurring workout's performance may be shown, clearly labeled, and never prefilled.
5. Progression evidence is contiguous. Returning to an old prescription starts a new segment; older data stays visible as reference.
6. Compatibility: same recurring exercise, same rep-range boundaries, same target RIR when both are recorded, same gym where gym-specific tracking applies, the appropriate scheduled-deload status. Session name, weekday, order, notes, and planned set count do not break compatibility. One deterministic shared mechanism; no similarity thresholds.
7. Missing planned RIR: introducing target RIR preserves existing history; a change between two different recorded targets breaks compatibility; missing values never bridge two different recorded targets. No fabricated historical targets.
8. Independent progression per recurring exercise; the pure engine and its rules are unchanged; only its evidence changes.
9. Weight and call agree: the same segment feeds the prefill and the call; the trusted-weight protection stays. Today, the logging card, the finish summary, and the exercise page never contradict each other.
10. Machine prefills follow compatible actual history at the gym, not the baseline, for every exercise including once-a-week ones.
11. No off-day interpretation. The latest comparable performance is the prefill.
12. Baseline writes are preserved unchanged (gym isolation, atomicity, first-log establishment, 15% threshold, no replay). Only the read side stops using the baseline for prefills and anchors. The table and its rows stay.
13. A started workout is evaluated with the plan values copied at its start.
14. No new training calculations: canonical e1RM, goals, PRs, and the engine's RIR thresholds are unchanged. The planned-RIR-0–1 / actual-RIR-0 hold interaction stays a documented follow-up.
15. The scheduled-deload suggestion uses the correct recurring exercise's compatible normal-week performance, with the existing 90%, round-down-to-5-lb rule and the existing Pro gate.
16. Free/Pro boundaries unchanged.
17. Mobile contracts distinguish a trusted prefill, a reference-only performance, and no weight, additively. Older clients never receive a misleading weight or a contradictory exercise-wide call.
18. No Production access.

## Out of scope (separate pitches)

- **Planned Workout Guidance**: target RIR editing and display, rest guidance, notes, their history copies, plan-import preservation. This pitch only makes its compatibility rule ready to read target RIR.
- **Deload Customization**: a per-mesocycle reduction percentage, Free deload numbers, a Use Weight action.
- **Exercise History Contexts**: chart series per recurring workout, an All / Push / Upper selector.
- **Jump to Exercise**: non-linear workout navigation.

Also out: new strength formulas, e1RM changes, new RIR thresholds, fatigue analysis, retiring baseline writes, native screens.
