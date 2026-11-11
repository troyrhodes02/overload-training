# Overload — Pitch 7: Cardio Logging

> Source: Linear document "Overload — Pitch 7: Cardio Logging"
> (project Overload V1 / P-OVE-1, doc `9c2c46d3-8408-4211-9c00-7c1e74fe59d9`),
> pulled into the repository as the controlling pitch for slug `07-cardio-logging`.
> Headings and numbered rules are preserved; prose is lightly condensed.

## Summary

**Type:** Feature
**Appetite:** M — Medium
**Depends on:** Split & Mesocycle Builder
**Primary feature:** Planned Cardio + Cardio Logging
**Downstream dependency:** None
**Explicitly deferred:** Distance, pace, calories, heart rate, progression analysis, Health integrations

Pitch 7 closes the final gap in the MVP training record by allowing cardio to exist alongside lifting.

At completion, the lifter can:

- add planned cardio to a specific day in the Mesocycle;
- have cardio coexist with a lifting Session on the same day;
- define the cardio activity type;
- define its planned duration;
- see that cardio as part of the day's training plan;
- log the cardio that was actually performed;
- record only activity type and duration;
- see completed cardio in training history;
- distinguish planned versus completed cardio;
- edit the factual cardio log if it was entered incorrectly.

Cardio remains intentionally simple. It does **not** produce Progress, Hold, Deload, e1RM, trend charts, cardio Goals, recommended duration, or conditioning prescriptions.

> **Cardio is a training record, not a progression system.**

The project explicitly says a `CardioLog` stores type and duration and that no tag, trend, or progression logic ever attaches to it.

---

## Problem

Overload now handles the full strength-training loop: planning, logging, progression, Goals. But cardio the lifter performs lives outside the same training record. The PRD's example — **Tuesday = Pull + 20 min incline walk** — says cardio is assigned to specific split days just like the lifting schedule, while its log remains only type + duration. Without Pitch 7, the week-at-a-glance records only Pull. Pitch 7 fixes that without turning cardio into another analytics domain.

## Why This Pitch Exists Last

Cardio does not depend on Guided Workout Logging, the Progressive Overload Engine, or Goals. It requires only the split/day structure from Pitch 3. The roadmap notes it could have shipped anytime after Pitch 3 and is last only because it is independent of the strength chain. Pitch 7 must not become an excuse to modify the strength progression system.

## Appetite

**M — Medium.** The data is minimal (type, duration, day/context), but the feature touches the Mesocycle builder, weekly schedule, today's dashboard, daily logging, completion state, history/week view, and historical detail/editing. The challenge is integration, not algorithms. Keep the implementation narrow.

---

## Product Model

**Planned Cardio** — the cardio intent attached to the Mesocycle schedule (e.g. *Tuesday — Pull Day — Incline Walk — 20 min*). This is the plan; editable programming.

**Cardio Log** — the historical record of what actually happened (e.g. *Tue, Oct 13 — Incline Walk — 22 min*). Factual history. The Architecture defines `CardioLog` as type + duration referencing the day it was assigned/logged against, with no relationship to progression.

These concepts must not be conflated.

---

## Solution Shape

### 1. Cardio Can Be Assigned to a Split Day

Inside Mesocycle authoring, the lifter can add cardio to a day.

| Day | Lifting | Cardio |
| --- | --- | --- |
| Monday | Push | — |
| Tuesday | Pull | Incline Walk — 20 min |
| Wednesday | Legs | — |
| Thursday | Push | Bike — 15 min |

### 2. Cardio May Coexist With a Lifting Session

A day may contain lifting only, cardio only, both, or neither. Pitch 3's one-lifting-Session-per-day rule does not prevent cardio on the same day: cardio is a separate training object.

### 3. One Planned Cardio Item Per Day in MVP

Each Mesocycle day may contain zero or one planned cardio item. Do not support multiple separate cardio blocks (e.g. 20 min bike + 15 min incline walk) on one day in this pitch. Record this as a product default introduced by Pitch 7.

### 4. Planned Cardio Has Only Type and Duration

Do not add distance, pace, incline, resistance, calories, heart rate, zones, target HR, RPE, notes, equipment, or Gym. The PRD says cardio logs type and duration only.

### 5. Cardio Type Is Human-Readable Activity Text

Examples: Incline Walk, Treadmill, Stair Climber, Bike, Elliptical, Rowing, Outdoor Walk. Cardio type is **a required short text value entered/selected by the lifter**. No large canonical taxonomy. The UI may provide convenience suggestions, but they must not become a domain hierarchy.

### 6. Cardio Type Is Not an Exercise Library Exercise

Do not create cardio as an `Exercise`; do not import treadmill into the Library, assign muscle groups, give Favorites, include it in Exercise Swap, or create SessionExercise rows for it.

### 7. Planned Duration Is Measured in Minutes

Positive whole minutes. No seconds precision, hours/minutes fields, or start/stop timer.

### 8. Planned Duration Must Be Positive

Reject empty, zero, negative. No empty cardio placeholder treated as valid scheduled work.

### 9. Planned Cardio Can Be Edited During Mesocycle Authoring

Type, planned duration, assigned day. This is plan editing; it does not rewrite historical CardioLogs.

### 10. Planned Cardio Can Be Removed

Removes it from the future planned schedule; does not delete historical CardioLogs.

### 11. Clone-Forward Copies Planned Cardio

Copy type, planned duration, day assignment. Do not copy CardioLogs or completion history (plan-forward, not history-forward).

### 12. Session Duplication Does Not Implicitly Duplicate Cardio

Cardio belongs to the day schedule, not the lifting Session template. Duplicating *Push Day 1* to another day does not bring the source day's cardio.

### 13. Today's Cardio Appears With Today's Training Plan

Lifting + cardio: *Pull Day · 6 Exercises · Incline Walk — 20 min*. Cardio only: *Cardio · Bike — 30 min*. Lifting only: no cardio section. Presentation belongs to design/UI.

### 14. Cardio Does Not Hide the Pending Lifting Session

The strength workout remains the primary workflow; cardio appears as an additional planned item.

### 15. Cardio Log Records What Actually Happened

Type and actual duration only. No derived metrics.

### 16. Logging Starts From the Planned Cardio Where One Exists

Prefill type and show planned duration; the lifter enters/confirms actual duration. Planned 20, performed 27 → history records 27; the plan is not rewritten.

### 17. Actual Cardio Type May Differ From the Plan

Planned Incline Walk, performed Bike → log Bike. Do not mutate the plan. No "Cardio Swap" engine.

### 18. Cardio Logging Does Not Require a Gym

No Gym, equipment baseline, or location.

### 19. Cardio Log Duration Is Positive Whole Minutes

Reject empty, zero, negative. Actual need not equal planned.

### 20. Planned Cardio Has Its Own Completion State

Pending until a CardioLog is created for that occurrence (or the occurrence is resolved under the final scheduling behavior). Not complete merely because lifting is complete.

### 21. Lifting and Cardio Completion Are Independent

Either can be complete while the other is pending. Do not merge into one completion transaction.

### 22. Overall Day Presentation May Show Both States

*Pull Day — Complete / Incline Walk — Pending*, or the reverse. Legible without unnecessary complexity.

### 23. Cardio-Only Split Days Are Valid

No lifting Session is required to attach cardio.

### 24. Cardio Appears in the Existing Training History

Week-at-a-glance/history shows cardio alongside lifting (*Tue — Pull — Complete — Incline Walk — 22 min*; *Sat — Bike — 30 min*). No isolated second history system.

### 25. Cardio History Shows Only Relevant Facts

Date, type, duration; planned-versus-actual where useful. No analytical summaries.

### 26. Cardio Log Type and Duration Can Be Corrected

Editable factual fields: type, duration. No analytics recalculation path.

### 27. Cardio Log Deletion Is Out of Scope

The Architecture API surface specifies create/read for Cardio logs. Pitch 7 supports factual correction only.

### 28. Pitch 7 Is Plan-First Cardio

No general "log random cardio right now" flow. A CardioLog corresponds to a planned cardio occurrence. Record as a product decision introduced by Pitch 7.

---

## Missed-Day Interaction

### 29. Cardio Does Not Trigger the Lifting Missed-Day Three-Way Flow

Do not reuse Log it late / Shift / Skip for cardio.

### 30. An Unlogged Past Cardio Occurrence Becomes Missed, Not a Schedule-Shift Trigger

Display as missed/unlogged in history; do not trigger lifting shifting; do not move future cardio; do not re-prompt indefinitely. No cardio missed-day engine.

### 31. A Lifting Week Shift Moves Cardio Only If It Is Bound to That Day's Effective Schedule

Planned cardio is attached to a Mesocycle day occurrence, so if Pitch 4's effective schedule shifts that day within the current week, the cardio attached to that same day moves with it (authored Tuesday Pull + Incline Walk → effective Wednesday, both move). No second competing calendar.

### 32. Cardio Does Not Change How Shift Is Triggered

A missed cardio-only occurrence causes no lifting shift or week rearrangement. Cardio follows an already-resolved effective day; it does not create shift decisions.

### 33. Scheduled Deload Does Not Modify Cardio

No 10% reduction, no suppression, no cardio deload flag. Scheduled cardio remains as authored.

---

## Isolation

### 34. Cardio Never Enters the Progressive Overload Engine

No contribution to Progress, Hold, Deload, stall, e1RM, next-weight recommendation. Permanent.

### 35. No e1RM for Cardio

Do not reuse `estimateOneRepMax`.

### 36. No Cardio Trend

No duration trend, frequency trend, weekly-minute chart, cardio PRs, streaks.

### 37. No Cardio Goals

Goals apply to strength Exercises only.

### 38. CardioLog Is Separate From LoggedSet

No fake LoggedSets (weight = 0, reps = minutes) or fake Exercises.

### 39. Cardio Does Not Use Gym Baselines

Never invoke `isGymVariable`, GymExerciseBaseline, or baseline correction.

### 40. Cardio Does Not Require Exercise Identity

---

## Explicitly Out of Scope

Distance; pace; speed; incline; resistance level; watts; calories; heart rate; heart-rate zone; cadence; steps; elevation; GPS; route maps; cardio RPE; Cardio progression / Deload / Progress; e1RM; cardio trends; weekly cardio-minute analytics; cardio streaks; cardio Goals; automatic cardio recommendations; generated conditioning programs; HealthKit; Apple Health; wearable sync; Strava; Garmin; Fitbit; timer/stopwatch tracking; live sensor data.

---

## Definition of Done

1. **Cardio can be assigned to a Mesocycle day** — one planned item with type + planned duration.
2. **Cardio can coexist with lifting** — Tuesday = Pull + 20 min Incline Walk.
3. **Cardio-only days work** — no lifting Session required.
4. **Planned cardio can be edited** — type, duration, day assignment.
5. **Clone-forward copies the cardio plan** — not CardioLogs.
6. **Today's dashboard shows planned cardio** — with pending/completed state.
7. **Cardio can be logged** — CardioLog persists actual type + actual duration.
8. **Logged type may differ from planned type** — plan unchanged.
9. **Logged duration may differ from planned duration** — history records actual.
10. **Invalid duration is rejected** — empty/zero/negative creates no log.
11. **Cardio completion is independent from lifting completion.**
12. **Completed cardio appears in history** — date, type, duration.
13. **Historical cardio can be corrected** — type/duration edits persist.
14. **Cardio does not produce progression state.**
15. **Cardio does not produce a trend.**
16. **Cardio does not affect Goals.**
17. **Cardio does not affect Gym baselines.**

## Behavioral Rules

- Planned cardio is schedule intent ("What cardio did I intend to do on this split day?").
- CardioLog is factual history ("What cardio did I actually do?").
- Plan and log may differ; history records reality; the future plan remains unchanged.
- Cardio is not strength training — do not force it through Exercise/LoggedExercise/LoggedSet.
- Cardio does not become a second progression domain.

## Rabbit Holes

1. "Just add distance too" — no.
2. Building a timer — no (background execution, pause/resume, mobile lifecycle).
3. Apple Health / HealthKit — deferred; unreachable from the web architecture.
4. Cardio progression ("walked 20 last week, suggest 25") — permanent boundary.
5. Turning cardio types into Exercise records — avoid fake reuse.
6. Building charts because Recharts exists — no cardio trend.
7. Making cardio part of scheduled deload — no approved rule; don't guess.
8. Duplicating cardio with duplicated lifting Sessions — keep it intentional.

## No-Gos

Distance, pace, calories, heart rate, HR zones, GPS, live timer, HealthKit, wearable integrations, cardio Exercises, fake LoggedSets, Cardio progression, Cardio tags, Cardio trends, Cardio Goals, e1RM, Gym baselines, Exercise Swap, auto-generated cardio, auto-increasing duration, scheduled deload as a cardio adjustment, a separate missed-day shifting system for cardio.

## Edge Cases the Design and Spec Must Handle

- **Planning:** day already has lifting → valid; day has no lifting → valid; day already has cardio → edit/remove the existing one rather than creating a second.
- **Logging:** planned 20, performed 15 → log 15, no judgment; planned Incline Walk, performed Bike → log Bike, plan stays; no duration → invalid; 0 → invalid.
- **Completion:** lifting complete, cardio not logged → cardio pending/missed by date; cardio complete, lifting incomplete → lifting pending; cardio-only day completed → history shows it without a fabricated LoggedSession.
- **Past planned cardio not logged:** missed/unlogged; no repeated interruption; no lifting-calendar shift.
- **Week shift:** lifting + attached cardio move together; a cardio-only missed day does not shift the week.
- **Scheduled deload:** cardio unchanged; no special tag.
- **Mesocycle clone:** planned cardio copies; logs do not.

## Dependencies

Split & Mesocycle Builder (Mesocycle, weekly days, day assignments, clone-forward). Integration with later-shipped pitches is an isolation requirement: Guided Workout Logging (lifting stays primary, cardio alongside, no LoggedSet path), Progressive Overload Engine (ignores cardio), Goals (ignores cardio).

## Downstream Contract

No later roadmap pitch depends on Cardio. Pitch 7 completes the planned MVP roadmap. The model should stay simple enough that a future mobile/health-data build could extend it without the web MVP pretending to have data it does not.

## UI-Bearing Classification

UI-bearing: Mesocycle/day builder, weekly schedule, dashboard, daily logging, combined state, history, historical edit. Pipeline: **Pitch → Design Doc → UI Design Preview → Spec → Tickets → Implementation**; `/overload-ui-design` is mandatory.

## Source Gaps & Decisions (recommended resolutions)

1. One planned Cardio item per Mesocycle day in MVP.
2. Cardio type is required short human-readable text, optional UI suggestions, no taxonomy.
3. Actual type may differ; log reality without changing plan.
4. Plan-first: Pitch 7 logs planned cardio occurrences only.
5. CardioLog type and duration can be corrected; no deletion.
6. Lifting and cardio maintain independent completion states.
7. Unlogged past planned cardio becomes missed/unlogged without the lifting three-way prompt.
8. Cardio attached to a split day follows the already-derived effective shifted day; it creates no shift.
9. No automatic cardio modification during scheduled deload.
10. Clone-forward copies planned cardio, never CardioLog history.

## Required Upstream Amendments / Clarifications

1. Explicit planned-cardio representation separate from `CardioLog`.
2. One planned Cardio item per Mesocycle day for MVP.
3. Cardio type as simple required human-readable text.
4. Actual cardio type/duration independently loggable from planned values.
5. Lifting and cardio completion independent on a combined day.
6. Missed cardio non-shifting/non-interruptive relative to the lifting missed-day engine.
7. Cardio attached to a shifted split-day occurrence follows that effective date.
8. Clone-forward copies planned cardio, not CardioLog history.
9. Historical CardioLog correction of type/duration; no delete.
10. Scheduled deload does not alter cardio.
11. Permanent isolation from progression, Goals, e1RM, and Gym baseline logic.

## Scope Check

Pitch 7 should feel almost boring. A day can now say **Pull Day** (Barbell Rows, Pulldowns, Curls) + **Cardio** (Incline Walk — 20 min). After training: *Pull — Complete · Incline Walk — 23 min*. No conditioning score, cardio Progress/Deload, trend line, heart-rate analysis, or "do 25 minutes next time."

> **Strength training is interpreted. Cardio is recorded.**
