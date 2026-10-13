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
- [x] 5. Linear milestone + issues (OVE-30…32)
- [x] 6. Feature PR into `main` (#36)
- [x] 7. Implement tickets (PRs #37–#39)
- [x] 8. Runbook — `docs/runs/06-goals-runbook.md`
- [x] 9. Merge ticket PRs into feature branch (squash, dependency order)
- [ ] 10. Full verification
- [ ] 11. Review + audit
- [ ] 12. Merge on green + run report

## Linear

- Milestone: **Goals** (`839d13f4-6bd3-4734-8b18-431a4b9b5f46`)
- Tickets (dependency order, chained via blockedBy):
  - **OVE-30** — Goal model, derived progress & creation flow
  - **OVE-31** — Goal completion, acknowledgement, manual archive & history (blockedBy OVE-30)
  - **OVE-32** — Goals on the dashboard & post-session summary (blockedBy OVE-31)
- Feature branch: `feat/06-goals`

### Ticket PRs (all squash-merged into `feat/06-goals`)
- OVE-30 → **PR #37** · merged (`86434e0`)
- OVE-31 → **PR #38** · merged (`ce08762`)
- OVE-32 → **PR #39** · merged (`88b6dba`)

## Notes / decisions log

- Preview path: the run prompt names `docs/previews/06-goals-preview.tsx` as a hard
  gate; written as `.tsx` following the Pitch 4/5 precedent (the ui-design skill's
  default and the stored preference is `.html`; the explicit run gate governs).
- Build caught `/goals/history` being prerendered at build time (it would have
  run reconciliation during `next build`); goal pages now `await connection()`.
- Stacked ticket PRs: after squash-merging a parent, the child branch was
  brought up to date with a merge commit (no force-push / history rewrite); #38
  was auto-closed by GitHub when its base branch was deleted and was reopened
  after temporarily restoring that base ref.
- Local visual verification ran against the Supabase CLI stack with a
  temporary local-only user and fixtures, removed afterward.
