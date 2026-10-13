# Pitch 6 — Goals — Run Progress

Resumable state for the autonomous pipeline run. Updated at every pipeline
transition and ticket boundary.

- **Slug:** `06-goals`
- **Linear project:** Overload V1 (`P-OVE-1`)
- **Pitch document:** Linear doc `8035be66-3360-44aa-9b14-5fb6f9aa263a` → `pitches/06-goals.md`
- **Classification:** UI-bearing; merge-on-green (creates/archives Goal records;
  never writes/deletes/edits LoggedSet history or Gym baselines; no RLS/auth change).
- **Target branch:** `main` · **Feature branch:** `feat/06-goals`

## Key upstream contracts confirmed (Pitch 5, merged at `3b2e0ea`)

- `estimateOneRepMax(weightLbs, reps)` + `sessionE1rm(workingSets)` in
  `src/lib/progression/e1rm.ts` (pure; static guard: exactly one definition).
- Qualifying performance = LoggedSession `complete` AND all planned working sets
  present AND not a scheduled-deload week (`qualifyingSequence`, engine.ts).
- Performed exercise identity (`LoggedExercise.exerciseId`) — swaps count to the performed exercise.
- Gym-variable (`isGymVariable` → machine|cable) scoped to `(exerciseId, gymId)`.
- `Goal` table already exists from Foundation (`exerciseId`, `targetWeightLbs`,
  `targetReps`, `status active|archived`, RLS deny-all, Restrict FK) — empty, unused.

## Pipeline status

- [x] 1. Pitch pulled + authority read
- [x] 2. Design doc — `docs/design/06-goals-design-doc.md`
- [x] 3. UI preview — `docs/previews/06-goals-preview.tsx`
- [x] 4. Spec — `docs/specs/06-goals-spec.md`
- [ ] 5. Linear milestone + issues
- [ ] 6. Feature PR into `main`
- [ ] 7. Implement tickets
- [ ] 8. Runbook
- [ ] 9. Merge ticket PRs into feature branch
- [ ] 10. Full verification
- [ ] 11. Review + audit
- [ ] 12. Merge on green + run report

## Notes / decisions log

- Preview path: the run prompt names `docs/previews/06-goals-preview.tsx` as a hard
  gate; written as `.tsx` following the Pitch 4/5 precedent (the ui-design skill's
  default and the stored preference is `.html`; the explicit run gate governs).
