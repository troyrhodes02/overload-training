# Pitch 5 — Progressive Overload Engine — Run Report

Autonomous pipeline run for **Progressive Overload Engine** (slug
`05-progressive-overload-engine`), Linear project **Overload V1** (`P-OVE-1`).
Classification: UI-bearing, merge-on-green. **Merged to `main` on green.**

## Delivery

- **Feature PR:** [#31](https://github.com/troyrhodes02/overload-training/pull/31) — `feat/05-progressive-overload-engine` → `main`
- **Merge status:** ✅ Squash-merged into `main` (final commit `3b2e0ea`).
- **Linear issues** (milestone *Progressive Overload Engine*, all In Review, PRs merged into the feature branch):
  - **OVE-26** — Progression domain engine & canonical e1RM (pure) — PR #32
  - **OVE-27** — Progression read layer & gym-scoped derivation — PR #33
  - **OVE-28** — Progression tags & suggestions (dashboard/card/summary) — PR #34
  - **OVE-29** — e1RM chart & exercise progression detail (Recharts, gym selector) — PR #35
- **Artifacts:** pitch `pitches/05-progressive-overload-engine.md`; design `docs/design/05-progressive-overload-engine-design-doc.md`; preview `docs/previews/05-progressive-overload-engine-preview.tsx`; spec `docs/specs/05-progressive-overload-engine-spec.md`; runbook `docs/runs/05-progressive-overload-engine-runbook.md`.

## Configuration constants

All in `src/lib/progression/config.ts` (Bucket C tunable defaults — tunable from lived usage):

| Constant | Value |
| -------- | ----- |
| e1RM formula | Epley: `weight × (1 + reps / 30)`, `reps === 1 → weight` (`src/lib/progression/e1rm.ts`) |
| `MIN_QUALIFYING_SESSIONS` | 2 |
| `PROGRESS_CONSECUTIVE_SESSIONS` | 2 |
| `DELOAD_CONSECUTIVE_SESSIONS` | 2 |
| `STALL_WINDOW_SESSIONS` | 3 |
| `PROGRESS_INCREMENT_LBS` | +5 |
| `SCHEDULED_DELOAD_FACTOR` | 0.90 |
| `LOAD_STEP_LBS` (scheduled-deload round-down step) | 5 (floor; never above raw 90%) |

## Progression semantics

- **Precedence** (`evaluateReactive`, spec §6): scheduled-deload suppression → insufficient history → reactive Deload → raw Progress → stall gate → Hold. Deload is evaluated before Progress, so in any defensive conflict Deload wins.
- **Hold / no-tag** — Hold, insufficient history, and scheduled-deload suppression all render no tag (`ProgressTag` returns `null`).
- **Insufficient history** — < 2 qualifying completed performances → no tag.
- **Historical rep ranges** — each performance is judged against its own preserved `LoggedExercise` snapshot range, never today's plan.
- **Scheduled-deload exclusion** — scheduled-deload performances are excluded from the qualifying sequence (and thus from the 2-session Progress/Deload windows and the 3-session stall window) while remaining visible, marked, on the chart.

## Gym semantics

- **Gym-consistent** (`!isGymVariable`): one global progression history and one global e1RM trend across gyms.
- **Gym-variable** (`machine`/`cable`): progression and trend scoped to `(exerciseId, gymId)`. The detail page shows one gym's series with a compact `GymSelector` when ≥2 gyms have qualifying history; no cross-gym nominal line; **no invented conversion ratio**.
- **Gym-specific suggestion** — machine Progress/scheduled-deload loads come from that gym's `GymExerciseBaseline`; a new gym with < 2 qualifying sessions is insufficient even when another gym has history.

## e1RM

- **Canonical function** — `estimateOneRepMax` in `src/lib/progression/e1rm.ts`, free of Prisma/React/chart imports. A static guard asserts exactly one definition and no second `reps / 30` formula.
- **Session-level point** — `sessionE1rm` = max Epley estimate among a performance's working sets (R18).
- **Chart point** — one per completed performance (date, e1RM, scheduled-deload marker, gym for gym-variable); historical points use the actual logged weight and are never rewritten by a later baseline change (R21).
- **Scheduled-deload chart semantics** — deload points shown as a hollow muted square, excluded from reactive/stall sequences.

## Stall

- Window = most recent 3 qualifying session-level e1RM points (same gym scope for gym-variable).
- Comparison: `end > start` → Progress survives; `end <= start` → withheld, `stalled`.
- With exactly 2 qualifying sessions the gate is inactive and Progress may occur (the 2-session threshold is not secretly 3).
- User-facing copy: **"Hold — trend flat"** with a `TriangleAlert` icon in the deload amber — never the word "Deload" and never Deload semantics.

## Historical correction

- Editing a past set goes through Pitch 4's `editLoggedSet`; Pitch 5 writes nothing. The next read re-derives e1RM, session point, chart, tag, and stall state. Proven by integration test "re-derives tag and trend after a past set is edited, writing no recompute row" — the tag flips `progress → null` and no recompute/trend row is created, baselines untouched.
- Editing a scheduled-deload set never makes that occurrence qualify for reactive progression (still excluded).

## UI

- **Preview:** `docs/previews/05-progressive-overload-engine-preview.tsx`.
- **Conformance:** implementation matches the preview — `ProgressTag` (progress/deload/stalled, nothing for hold), `SuggestedLoad` (+5 / 90%), `ScheduledDeloadBanner`, `E1rmChart` (single accent series, marked deload points, read-only), `GymSelector`, and the `/exercises/[id]` Progression region. Theme tokens `--progress`/`--deload`/`--primary` drive colour; both appearance modes supported.
- **Justified deviations:** (1) Preview authored as `.tsx` rather than the ui-design skill's default `.html`, per the run prompt's explicit gate and the Pitch 4 precedent. (2) The post-session progression summary lands on the day-complete dashboard state (where Pitch 4's completion flow redirects) rather than a new `/log/[id]/complete` route — same information, no new route.

## Verification

All run on the integrated feature branch (and re-confirmed on `main` post-merge):

| Check | Result |
| ----- | ------ |
| `npm run lint` (eslint) | ✅ clean |
| `npm run typecheck` (tsc) | ✅ clean |
| `npm run format:check` (prettier) | ✅ clean |
| `npm test` (unit) | ✅ 213 passed / 20 suites |
| `npm run test:integration` | ✅ 173 passed / 16 suites |
| `npm run build` | ✅ compiled |
| `npm run test:e2e` (playwright) | ✅ 17 passed |

Pitch 5-specific proofs (selected): derived-never-stored guards (no progression/e1RM column, single e1RM formula, read-only progression modules, no cron/scheduler); Epley incl. 1-rep; session max; min-history 0/1/2; Progress & reactive-Deload boundaries; precedence (deload beats progress; scheduled-deload exclusion); stall window 2-vs-3 with end>start/==/<; scheduled-deload rounding 200→180, 185→165, 100→90; gym A/B machine isolation incl. baselines untouched; free-weight cross-gym single series; swap identity; partial/in-progress exclusion; historical rep ranges; past-log re-derivation with no recompute row. Standing invariants (history integrity, RLS, baseline isolation/atomicity) remained green.

## Review

- `/review` on PR #31: full feature diff reviewed across correctness, removed-behavior, cross-file, reuse/simplification/efficiency, altitude, and CLAUDE.md conventions.
- **No blocking findings.** Dispositions (`/overload-review-audit`): **Implement 0 · Defer 0 · Skip 4 · Discuss 0.**
  - Null-gym gym-variable tag — SKIP (refuted; `startOrResumeWorkout` always sets `gymId`).
  - Free-weight scheduled-deload suggestion compounding — SKIP (spec-defined source R34; advisory/pre-entry; a second weight authority is forbidden).
  - Dashboard in-progress gym-variable deferral — SKIP (cosmetic; dashboard is a preview per R51).
  - Chart same-date sort tiebreak — SKIP (unreachable: one session per weekday).

## Required upstream amendments

Recorded per the run prompt; none required silent edits to approved docs (constants/method rules live in `method-note.md` only, unchanged here — no new method constants needed beyond `config.ts`):

1. Gym-variable progression & e1RM trends scoped to `(Exercise, Gym)` — nominal machine weights not comparable across gyms.
2. Gym-consistent exercises retain global cross-gym progression history.
3. Session-level e1RM = maximum Epley estimate among planned working sets.
4. Two-session Progress vs three-session stall window (Progress may occur at 2; stall gate begins at 3).
5. Stalled Progress candidate is distinct from reactive Deload.
6. Scheduled-deload points remain visible (marked) but excluded from reactive/stall sequences.
7. Scheduled-deload 90% suggestion rounds down to the nearest 5 lb; no stronger canonical weight-step abstraction existed, so `LOAD_STEP_LBS` is introduced.
8. Gym-variable suggested loads/states require the relevant gym context.
9. Post-session summary now activates progression interpretation (Goals still absent).
10. Any planning text implying one global raw machine e1RM series should read as gym-scoped machine trends.

These extend the Architecture Data Model narrative; the data model itself is unchanged (no schema migration). Recommend a future consolidation pass into `architecture.md`'s progression section when convenient — non-blocking.

## Downstream contract for Goals (Pitch 6)

Pitch 6 **can and must** reuse `estimateOneRepMax` from `src/lib/progression/e1rm.ts` — a pure function with no Prisma/React/chart imports, enforced by a static guard. Goal percentage = `estimateOneRepMax(currentBest) / estimateOneRepMax(target)`. Goals must not implement a second formula. `sessionE1rm` and the chart-point derivation in `src/lib/progression/queries.ts` are also available for current-best computation.

## Outcome

Pipeline completed end to end with no stop condition encountered. The engine
observes logged history, interprets it, and tells the lifter what the data
implies — storing nothing, mutating nothing, and leaving `LoggedSet` as the sole
source of truth.
