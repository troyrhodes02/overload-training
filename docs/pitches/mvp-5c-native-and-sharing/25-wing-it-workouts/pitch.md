# Pitch 25 — Wing-It Workouts

> Source: the roadmap entry "Pitch 25: Wing-It Workouts" (`docs/planning/pitch-roadmap.md`, MVP 5C), the PRD feature "Wing-It Workouts", and the owner's one-shot run prompt of 2026-11-27, which expands both and pre-resolves RD-1 to RD-15 (carried into `spec.md` → Resolved Decisions). No earlier local pitch existed.

**Project:** Overload V1
**Milestone:** MVP 5C — Features on Both Clients
**Type:** Feature
**Appetite:** M (Medium)
**Client scope:** Both — web and native iPhone, in one run
**Plan placement:** Free (no capability; never gated, including after paid subscriptions resume)
**UI-bearing:** Yes
**Depends on:** Pitch 4 (Guided Workout Logging), Pitch 5 (Progressive Overload Engine), Pitch 21a to 21k (the iPhone app and the mobile API)

---

## 1. Problem

Every workout in Overload today is an occurrence of a planned session in the active block. A lifter who trains without a plan, or who deliberately deviates from the plan on a given day ("the squat rack is taken, I'll do a machine day"), has nowhere honest to log it. The only options are to bend a planned workout into something it wasn't (swapping every exercise, which records the day as the planned session and feeds its progression run with unrelated work) or not to log it at all, which loses real training evidence.

## 2. Desired outcome

From Today, on the web or the iPhone, a lifter can start a **Wing-It workout**: choose a gym, add exercises as they go, log sets with the normal logging card, add more exercises at any point, and finish. The workout appears in History as a Wing-It workout, its sets count toward exercise history, records, the e1RM trend, goals, and the chosen gym's machine baselines, and nothing about the plan, the scheduled day, or missed-day handling changes.

**The owner's core requirement:** Wing-It is available on Today even when an active plan and a scheduled workout exist. The scheduled workout and the Wing-It workout stay distinct: starting or finishing a Wing-It workout never completes, skips, replaces, reschedules, or fulfills the planned day, and never writes a plan, mesocycle, session, or missed-day record.

## 3. User flows

1. **No plan.** Today → Start Wing-It workout → choose a gym → empty workout → Add exercise → log sets → Add exercise → log sets → Finish → the workout is in History.
2. **Alongside a plan.** Today shows the scheduled workout and, separately, Start Wing-It workout. The lifter starts Wing-It instead, logs, finishes. Today still shows the scheduled workout as it was (pending, or later missed by the existing rules), and the completed Wing-It workout beside it.
3. **Rest day, missed day, completed day.** Wing-It is offered in every one of these states.
4. **Resume.** An open Wing-It workout is resumed from Today on either client; starting again resumes the same workout rather than creating another.
5. **Another workout is in progress.** Starting Wing-It while another workout holds saved sets is refused, with Resume offered. Nothing is discarded.

## 4. Scope

In scope:

- A first-class unplanned workout: a `LoggedSession` with an explicit Wing-It kind, no mesocycle, no session, a workout gym, and no planned targets.
- Start (one open Wing-It workout per account, retry-safe), add exercise (any active exercise the account can see, including custom ones), remove an exercise that has no sets, log and correct sets through the existing set module, change gym before the first set, finish through the existing completion rule.
- Today entry points on both clients in every dashboard state, Resume, and the completed Wing-It workouts of the day.
- History on both clients: Wing-It workouts listed and identifiable, opening the normal logged-workout detail.
- Exercise history, records, e1RM trend, and goal progress include Wing-It sets. Gym-variable exercises establish and correct the chosen gym's baseline in the set's own transaction.
- No progress, hold, or deload call, no planned-versus-actual comparison, and no suggested weight for an exercise with no planned rep range.
- Additive mobile API endpoints and additive fields, compatible with the installed TestFlight build 1.0.0 (2).
- A What's New entry.

## 5. Non-goals

- Suggesting exercises, generating routines, or turning a Wing-It workout into a planned session (roadmap defers).
- A rest timer, dated goals, or any progression analysis that invents a target.
- Changing the planned start flow, the plan, scheduling, or missed-day rules.
- Offline logging, GPS gym detection, or a separate mobile workout store.
- Billing, entitlement, or Stripe changes of any kind.
- Production release, a Production Expo update, or a TestFlight build (separate, owner-authorized).

## 6. Risks

- **History integrity.** The plan snapshot on `LoggedExercise` (`plannedSets`, target reps) is read across logging, progression, history, and the card. Wing-It rows carry none, so every reader must handle that without fabricating values. Mitigation: nullable columns guarded by CHECK constraints and a parent-kind trigger, and the compiler surfacing every reader.
- **Engine contamination.** A Wing-It row inside a progression segment would change a planned workout's call. Mitigation: Wing-It rows never enter the engine's rows; they reach only strength reads.
- **Old clients.** TestFlight 1.0.0 (2) parses responses by TypeScript type only and will meet Wing-It workouts after a future Production release. Mitigation: additive fields only, numeric legacy values on the old fields, and a compatibility test that runs the old card model against a Wing-It workout.
- **Two workouts at once.** Mitigation: one open Wing-It workout per account (database index) and a refusal while another workout holds saved sets.

## 7. Definition of done

- A workout can be started and finished with no plan on the web and on the iPhone, and it appears in History on both.
- With an active plan, Today shows the scheduled workout and the Wing-It option; after a Wing-It workout the scheduled workout, plan, mesocycle, schedule, and missed-day state are unchanged (automated regression).
- Machine and cable exercises use the chosen gym's baselines; free weights keep global history.
- No Wing-It exercise receives a progress, hold, or deload tag.
- The cross-account isolation suite covers every new endpoint and passes; the full suite passes.
- Staging web deployed and a staging Expo update published; the two owner device checks are written.
