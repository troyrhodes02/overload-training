# Run Report — Guided Workout Logging (Pitch 4)

Autonomous pipeline run: pitch → design doc → UI preview → spec → tickets →
implementation → review → audit. **The feature branch was NOT merged into
`main`.** The feature PR is open for human review.

## Delivery

- **Feature PR:** [#24 — Guided Workout Logging (Pitch 4)](https://github.com/troyrhodes02/overload-training/pull/24) into `main` — **OPEN, not merged** (per run constraint).
- **Feature branch:** `feat/04-guided-workout-logging`
- **Final feature commit:** `127752a` (`Review audit: fix ExerciseCard draft-state leak; document UTC 'today' convention`)
- **Milestone:** Guided Workout Logging (Overload V1).
- **Linear tickets & ticket PRs** (all merged into the feature branch, in dependency order):

  | Ticket | Title | PR | State |
  | ------ | ----- | -- | ----- |
  | OVE-21 | Logged-history & gym-baseline write-path foundation | #25 | merged |
  | OVE-22 | Guided daily logging & dashboard | #26 | merged |
  | OVE-23 | Exercise Swap | #27 | merged |
  | OVE-24 | Missed-day handling | #28 | merged |
  | OVE-25 | History & past-log editing | #29 | merged |

  Ticket branches were single atomic commits stacked linearly and integrated into the feature branch by fast-forward (squash-equivalent: one commit per ticket). GitHub marked each ticket PR merged once its commit was present on the base.

## Verification (every check actually run)

Run on the integrated feature branch at `127752a`:

| Check | Command | Result |
| ----- | ------- | ------ |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | ✅ pass |
| Lint | `npm run lint` (`eslint`) | ✅ pass (0 problems) |
| Format | `npm run format:check` (`prettier --check .`) | ✅ pass |
| Unit tests | `jest --config jest.config.js` | ✅ **178 passed / 17 suites** |
| Integration tests | `npm run test:integration` | ✅ **163 passed / 15 suites** |
| Build | `npm run build` | ✅ compiled; `/log`, `/log/start`, `/log/[id]`, `/log/[id]/[leId]/swap`, `/history`, `/history/[id]` routes emitted |
| Client bundle | `npm run verify:client-bundle` | ✅ no server DB secret in `.next/static` |
| E2E | `npm run test:e2e -- --workers=1` | ✅ **17 passed** |

**E2E note:** the first parallel run showed 3 `page.goto` timeouts on `auth`/`gyms` routes; re-running the affected specs serially passed all of them, and the full suite passes at `--workers=1`. The failures were sandbox parallel-execution contention, not code regressions.

### Guided Workout Logging invariants proven (by test)

- **LoggedSet write-path integrity:** `tests/unit/invariant-guards.test.ts` static scan — no `prisma.loggedSet.create/update/delete` outside `src/lib/logging/logged-sets.ts`; no LoggedSet deletion exists anywhere.
- **Referential integrity:** `tests/integration/history-integrity.int.test.ts` — hard delete of a referenced `Exercise`/`Gym`/parent `LoggedSession` is rejected by `onDelete: Restrict`.
- **Archival readable:** `exercise-library`/`gyms`/`logging-reads` int tests — archived exercise/gym still render by name in history.
- **Set validation:** `logging.int.test.ts` — zero/negative/fractional weight or reps rejected; out-of-range set number rejected (no extra sets); nothing persisted on failure.
- **Idempotency/conflict:** identical retry returns the existing set (no duplicate); a changed value is a `conflict` (not an overwrite).
- **Start/resume idempotency:** same `(sessionId, scheduledFor)` returns the same `LoggedSession`; no duplicate.
- **Completion:** incomplete exercise blocks; archived performed exercise blocks; all-sets-present completes (`status=complete`, `completedAt` set); completed sets remain editable.
- **Gym lock / swap lock:** gym correctable before first set, locked after; swap allowed before first set, blocked after; swap keeps the template unchanged.
- **Gym baselines:** first log establishes (not corrects); median (odd/even); 15% boundary (14% no-op, 15%/20% correct); Gym A↔B isolation; free-weight no baseline; historical edit does not replay the baseline; `baselines.ts` pure-helper unit assertions.
- **Missed days:** `tests/unit/logging-schedule.test.ts` — authored-date mapping, skip, shift (current week + drop beyond week), consecutive shifts bounded within week, next-week snap-back, oldest-unresolved detection, in-progress-is-resumable; `logging.int.test.ts` — resolution immutability (conflict on re-resolve) and session linking.
- **RLS / schema:** `rls.int.test.ts` (deny-all on every table incl. `missed_day_resolutions`; anon sees nothing), `schema.int.test.ts` (no tag/e1RM column; no ownership column), `exercise-classification.int.test.ts` (no migration drift), migration-safety guard (additive only, RLS on created table).

## Logged history

- **LoggedSession identity:** `(sessionId, scheduledFor)` unique, where `scheduledFor` is the authored calendar date of the planned occurrence. Opening/resuming is idempotent. Explicit `status` (`in_progress` | `complete`); `completedAt` is its timestamp.
- **LoggedExercise planned/performed model:** `exerciseId` is the performed exercise (changes on swap); a snapshot of plan context is preserved (`plannedExerciseId` [Restrict], `sessionExerciseId` [SetNull], `plannedSets`, `targetRepMin/Max`) so later plan edits never make old history unintelligible.
- **LoggedSet write path:** `src/lib/logging/logged-sets.ts` only; positive weight+reps; `(loggedExerciseId, setNumber)` unique; retry = idempotent/conflict (checked up front to avoid aborting the surrounding transaction); `editLoggedSet` corrects weight/reps only.
- **Completion rules:** every planned working-set slot filled and no performed exercise archived; explicit and atomic.
- **Historical correction:** weight/reps only; no delete; no baseline replay.

## Gym baseline system

- **Canonical equipment mapping:** gym-variable = `machine` + `cable` (verified against Pitch 2's `Equipment` enum / `EQUIPMENT_TYPES`); `plate_loaded` and free weights are gym-consistent (no baseline row). Recorded in `docs/planning/method-note.md`.
- **Authority:** one function `isGymVariable(exercise)` in `src/lib/exercises/gym-variable.ts`, decided from `equipmentType` alone.
- **Median algorithm:** median of the completed planned-working-set weights (odd → middle, even → mean of two middle; `100,100,110,110 → 105`).
- **Named constant:** `BASELINE_CORRECTION_THRESHOLD_PERCENT = 15` in `src/lib/gyms/baselines.ts`. **This 15% threshold is a tunable Bucket C product default — NOT PRD-derived — and is expected to be re-tuned from lived data (the Architecture Doc's identified top technical risk).**
- **First-baseline behavior:** first completed collection at a gym establishes; never a correction.
- **Isolation & atomicity:** scoped to one `(gymId, exerciseId)`; established/corrected in the same transaction as the completing set write; never rewrites a `LoggedSet`. Proven by the baseline isolation/boundary/atomicity integration tests.

## Missed days

- **Storage model:** dated `MissedDayResolution { mesocycleId, sessionId?, missedOn, outcome }`, unique `(mesocycleId, missedOn)`, deny-all RLS. The effective schedule is derived from the Mesocycle + resolutions; the authored template is never mutated.
- **Log-late:** starts/resumes the `LoggedSession` for the original missed occurrence (`scheduledFor = missedOn`); the runner header shows the historical date. (It is realized as the real training record rather than a redundant `logged_late` resolution, which the effective-schedule detection treats as resolved.)
- **Shift:** current mesocycle week only — the missed day and later same-week occurrences move forward one calendar day; a day pushed beyond the week end is **dropped**; the next week returns to authored alignment. Computed per-week independently (no cross-week compounding).
- **End-of-week:** dropped occurrence does not spill into next week and does not re-prompt.
- **Consecutive misses:** oldest unresolved resolved first, schedule recomputed, then the next evaluated.
- **Skip:** persists, creates no fake history, never re-prompts.
- **Immutability:** a confirmed resolution cannot be changed (re-resolve → `conflict`); no auto-resolution exists.

## Exercise Swap

- **Eligibility:** active exercises sharing the **planned** exercise's `primaryMuscle`, excluding the performed one; favorites sort first but never gate eligibility; secondary muscles never qualify.
- **Template immutability:** updates the performed `exerciseId` on that one `LoggedExercise` occurrence only; never `Session`/`SessionExercise`/other workouts.
- **Pre-first-set lock:** swap is blocked once a set exists on the occurrence.
- **Archived planned exercise:** surfaced as "Unavailable — choose a substitute"; blocks completion until a valid active same-muscle substitute is chosen; never auto-replaced/reactivated; no eligible candidate → cannot false-complete (never crosses muscle groups).
- Gym-variable baseline uses the **performed** (substitute) exercise.

## Past-log editing

- **Editable:** weight and reps only.
- **Prohibited:** exercise identity, gym, date, planned set number, session, mesocycle, and missed-day resolutions.
- **No deletion:** no delete path exists anywhere.
- **Baseline non-replay:** a historical edit corrects the `LoggedSet` and leaves the stored gym baseline unchanged (deterministic, baseline-neutral).

## UI

- **Preview path:** `docs/previews/04-guided-workout-logging-preview.tsx` (mandatory UI-design stage; a self-contained, offline, mock-data-only React gallery, not wired to Prisma/Supabase/APIs, excluded from app typecheck/lint/format).
- **Implementation materially matches the preview:** dashboard hierarchy (pending/resume/quiet-complete/rest), guided exercise card with all set rows + positive-only validation + saved/draft/error states + gym-lock glyph, gym selection, swap picker (same-muscle, no-candidate empty state), missed-day prompt (three one-tap outcomes), week-at-a-glance, logged-workout detail, and past-log correction dialog. Mobile-first, thumb-reach primary actions, tabular numerals, no progression/goal content.
- **Justified deviation:** the preview was authored as `.tsx` (per the run prompt's explicit mandatory artifact path) rather than the skill's default `.html`; it is still a design-handoff rendering and is excluded from the app toolchain.

## Review

- `/review` run on PR #24; findings posted as a PR review.
- **Findings & disposition (via `/overload-review-audit`):**
  1. **IMPLEMENTED** — `ExerciseCard` lacked a per-exercise key, so local draft (typed weight/reps) leaked across exercises during Next/Previous navigation. Fixed with `key={current.loggedExerciseId}` (VALID, IN_SCOPE — a regression this PR introduced).
  2. **DEFERRED** — "today" is the UTC calendar date (off-by-one possible for negative-UTC evenings). VALID but consistent with the app's established all-UTC calendar convention; a per-lifter timezone source is a cross-cutting decision beyond Pitch 4. Documented in code (`queries.ts todayIso`) and here.
- No finding weakened a logged-history invariant; no progression/e1RM expansion was accepted.

## Required upstream amendments (recorded, docs not silently edited except method-note)

1. **Post-session summary sequencing:** the PRD describes progression/goal summary content before those features exist; Pitch 4 ships a factual neutral completion summary. Progression/goals arrive in Pitches 5/6.
2. **Extra-set policy:** Pitch 4 supports planned working sets only; no ad-hoc extra sets (product default introduced here).
3. **Swap locking:** the performed exercise cannot change once its first `LoggedSet` exists (product default introduced here).
4. **Missed-day resolution immutability:** no changing a confirmed log-late/shift/skip in Pitch 4 (product default introduced here).
5. **End-of-week shift behavior:** a shifted occurrence beyond the current week is dropped, not spilled into next week (product default introduced here).
6. **Past-edit baseline behavior:** historical set corrections do not trigger a full gym-baseline replay (product default introduced here).
7. **Gym selection lock:** gym correctable before the first `LoggedSet`, locked after (product default introduced here).
8. **Workout completion summary:** factual only until later pitches provide progression/goals.
9. **New data object:** the dated `MissedDayResolution` is absent from the original Architecture Data Model; recorded in `docs/planning/method-note.md`.
10. **LoggedExercise plan-context:** plan-context snapshot columns added so later plan edits cannot destroy progression inputs; recorded in `docs/planning/method-note.md`.

Additional contradiction discovered during the run: the `overload-ui-design` skill mandates an `.html` preview and refuses `.tsx` paths, while the run prompt mandates a `.tsx` preview as a downstream implementation contract. Resolved in favor of the run prompt (explicit controlling authority), keeping the preview offline/mock-only and excluded from the app toolchain.

## Production / manual steps remaining (human)

1. Review feature PR #24; do not expect auto-merge.
2. Back up `overload-prod` and verify the restore before any production migration (§2 of the runbook).
3. Apply migration `4_guided_workout_logging` to the **dev** Supabase project and verify the runbook §5 scenarios on a preview deployment.
4. A human applies the migration to production (`prisma migrate deploy` with the prod `DIRECT_URL`, never autonomous), then deploys via Vercel production.
5. Run the production smoke-check (runbook §6) with real, kept data — prefer verifying on preview/dev to avoid throwaway prod history.
6. Confirm RLS is enabled on `missed_day_resolutions` in production.

No production migrations were run and no production data was written during this run. No secrets appear in any artifact.

## Readiness for the Progressive Overload Engine (Pitch 5)

Pitch 5 can now safely assume:

- **Trustworthy LoggedSets** — single controlled write path, positive-only, retry-safe, never deleted.
- **Historical plan context** — `LoggedExercise` snapshot (planned exercise, planned sets, target rep range) survives later plan edits.
- **Stable effective training dates** — `scheduledFor` + `MissedDayResolution` + the pure effective-schedule module give a deterministic calendar-date → mesocycle-week mapping.
- **Performed exercise identity** — swaps are recorded as the performed exercise, distinct from the planned one.
- **Corrected past history** — edits change source history; progression reads will see corrected values.
- **No stored progression values** — no tag/e1RM column exists; everything remains computed-on-read.
- **Gym baselines** — exist for relevant `(gym, exercise)` pairs, isolated and atomic.

## Halt / resume

The pipeline completed end to end and **halted intentionally before merge**, per the run constraint. No stop condition (invariant weakening, approved-doc contradiction, irreplaceable-data/credential scope, or destructive operation) was hit. Full verification is green. The feature PR #24 is open for human review and must not be merged by this run.
