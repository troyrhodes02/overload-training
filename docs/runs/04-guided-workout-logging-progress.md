# Run progress — 04 Guided Workout Logging

Autonomous pipeline run. This file is updated at every pipeline-step transition
and every ticket boundary so a fresh session can resume from repository state.

**Run constraint: DO NOT merge the feature branch into `main`.** Feature PR is
left open for human review. No production migrations, no production data, no
service-role key.

## Pipeline status

| Step | Artifact | Status |
| ---- | -------- | ------ |
| 1. Load pitch + context | `pitches/04-guided-workout-logging.md` | ✅ done |
| 2. Design doc | `docs/design/04-guided-workout-logging-design-doc.md` | ✅ done |
| 3. UI preview | `docs/previews/04-guided-workout-logging-preview.tsx` | ✅ done |
| 4. Spec + Resolved Decisions | `docs/specs/04-guided-workout-logging-spec.md` | ✅ done |
| 6. Linear milestone + issues | (OVE- IDs below) | ✅ done |
| 7. Feature PR (no merge) | | ⏳ in progress |
| 8. Ticket implementation | | ⬜ |
| 9. Runbook | `docs/runs/04-guided-workout-logging-runbook.md` | ⬜ |
| 10–11. Merge tickets→feature + verify | | ⬜ |
| 12–13. /review + audit | | ⬜ |
| 14–15. Final verify + report (STOP) | `docs/runs/04-guided-workout-logging-report.md` | ⬜ |

## Key established facts (from repo reconnaissance)

- Foundation schema already defines `LoggedSession`, `LoggedExercise`,
  `LoggedSet`, `GymExerciseBaseline` with `onDelete: Restrict` on every logged
  FK, `@@unique([loggedExerciseId, setNumber])`, `@@unique([gymId, exerciseId])`,
  and NO stored progression/e1RM columns. Pitch 4 adds the write path + a
  missed-day resolution model, not these core tables.
- `LoggedSession` has `mesocycleId?`, `sessionId?`, `performedOn` (Timestamptz),
  `completedAt?`. Needs stable scheduled-day identity for idempotency (spec).
- Gym-variable = `machine`, `cable` (method-note confirmed). `plate_loaded` is
  NOT gym-variable (gym-consistent). `isGymVariable(exercise)` decides from
  `equipmentType` alone.
- Calendar math lives ONLY in `src/lib/plan/calendar.ts`
  (`mesocycleWeekForDate`, `parseIsoDate`, `toIsoDate`, `addDays`,
  `plannedEndDate`, `DAYS_OF_WEEK`). Week n = startDate+7(n-1)…+7n-1. Session
  `dayOfWeek` ISO 1=Mon…7=Sun, repeats weekly.
- Conventions: write modules `"server-only"`, optional `tx?: Prisma.TransactionClient`,
  `db(tx)` helper, `DomainError(code,msg,details)`; actions `"use server"` call
  `requireUser()` first then `toActionResult(...)`, then `refresh()`/`redirect()`.
  Result shape in `src/lib/actions/result.ts`. Pure client-safe modules avoid Prisma.
- Linear: project `P-OVE-1` "Overload V1". Pitch 4 doc id
  `8fd26a36-10a2-4ec7-955b-1eda3d19ba7d`. Prior milestones: Foundation,
  Library & Gyms Setup, Split & Mesocycle Builder.

## Linear issues (step 6)

Milestone **Guided Workout Logging** (`af7089f9-b9e7-4359-8080-9a783d582d4c`) in Overload V1.
Linear-suggested branch names shown; actual branches use `feat/ove-NN-...` chained linearly.

| # | ID | Title | blockedBy | Branch |
| - | -- | ----- | --------- | ------ |
| A | OVE-21 | Logged-history & gym-baseline write-path foundation | — (feature branch) | feat/ove-21-foundation |
| B | OVE-22 | Guided daily logging & dashboard | OVE-21 | feat/ove-22-dashboard |
| C | OVE-23 | Exercise Swap | OVE-22 | feat/ove-23-swap |
| D | OVE-24 | Missed-day handling | OVE-23 | feat/ove-24-missed-day |
| E | OVE-25 | History & past-log editing | OVE-24 | feat/ove-25-history |

Branch chaining: OVE-21 from `feat/04-guided-workout-logging`; each later ticket from the previous ticket branch. Ticket PRs squash-merge back into the feature branch in order; the feature branch is **not** merged to main.

## Branches / PRs (filled from step 7)

_pending_
