# Pitch 5 — Progressive Overload Engine — Run Progress

Resumable state for the autonomous pipeline run. Updated at every pipeline
transition and ticket boundary.

- **Slug:** `05-progressive-overload-engine`
- **Linear project:** Overload V1 (`P-OVE-1`)
- **Pitch document:** Linear doc `5ec32a66-49ce-4824-8678-37ccec97c99b`
- **Classification:** UI-bearing; merge-on-green (derives from history, never
  writes/deletes/rewrites LoggedSet history or Gym baselines).
- **Target branch:** `main`

## Key upstream contracts confirmed (Pitch 4, shipped)

- `LoggedExercise` carries the immutable plan-context snapshot used for
  historical rep-range evaluation: `plannedExerciseId` (planned, immutable),
  `exerciseId` (performed, changes on swap), `plannedSets`, `targetRepMin`,
  `targetRepMax`. (prisma/schema.prisma)
- `src/lib/exercises/gym-variable.ts` `isGymVariable` → `machine | cable`.
- `src/lib/gyms/baselines.ts` `GymExerciseBaseline(gymId, exerciseId, weightLbs)`;
  `BASELINE_CORRECTION_THRESHOLD_PERCENT = 15`.
- `src/lib/logging/schedule.ts` effective-schedule derivation; `mesocycleWeek()`;
  shifts are **within-week only** (never cross a mesocycle-week boundary).
- `src/lib/logging/queries.ts` `suggestedWeight(exerciseId, gymId, gymVariable)`
  is the existing current-working-weight contract (gym baseline for gym-variable,
  else latest LoggedSet weight). Pitch 5 adds +5 / ×0.90 on top of this source.
- No e1RM / progression code anywhere yet (clean slate).

## Pipeline status

- [x] 1. Design doc — `docs/design/05-progressive-overload-engine-design-doc.md` ✅
- [x] 2. UI preview — `docs/previews/05-progressive-overload-engine-preview.tsx` ✅ (.tsx per run prompt + Pitch 4 precedent; skill's default .html overridden by governing run prompt)
- [x] 3. Spec — `docs/specs/05-progressive-overload-engine-spec.md` ✅ (55 Resolved Decisions R1–R55)
- [x] 4. Linear milestone + issues ✅
- [ ] 5. Feature PR into `main` (in progress)
- [ ] 6. Implement tickets
- [ ] 7. Runbook + merge tickets to feature
- [ ] 8. Full verification
- [ ] 9. Review + audit
- [ ] 10. Merge on green + run report

## Linear

- Milestone: **Progressive Overload Engine** (`c87942be-65ce-4652-b1cc-ba692d2fafc8`)
- Tickets (dependency order, chained via blockedBy):
  - **OVE-26** — Progression domain engine & canonical e1RM (pure)
  - **OVE-27** — Progression read layer & gym-scoped derivation (blockedBy OVE-26)
  - **OVE-28** — Progression tags & suggestions on dashboard/card/summary (blockedBy OVE-27)
  - **OVE-29** — e1RM chart & exercise progression detail (blockedBy OVE-28)
- Feature branch: `feat/05-progressive-overload-engine` → feature PR **#31**

### Ticket PRs
- OVE-26 → `feat/ove-26-progression-engine` → **PR #32** (base = feature branch) · In Review · 56 unit tests green
- OVE-27 → `feat/ove-27-progression-reads` → **PR #33** (base = OVE-26 branch) · In Review · 10 integration tests green
- OVE-28 → `feat/ove-28-progression-ui` → **PR #34** (base = OVE-27 branch) · In Review · 213 unit + build green

## Notes / decisions log

- Pitch pulled from Linear into `pitches/05-progressive-overload-engine.md`.
- Preview written as `.tsx` (run prompt gate + Pitch 4 precedent) despite the
  ui-design skill's `.html` default; recorded as a deliberate override.
- No schema migration required (engine is derive-on-read; no new tables/columns).
- Recharts to be added in OVE-29 (stack-decided charting lib; not a new decision).
