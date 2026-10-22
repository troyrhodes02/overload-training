# Pitch 16 — Exercise History & PR Intelligence — Run Report

**Outcome:** complete. Merge on green: feature PR **#90** (https://github.com/troyrhodes02/overload-training/pull/90) is squash-merged into `main` by this run after the final suite passed on `5b41fbf` and no protected boundary was crossed (§7). No production migration, data change, credential, or signup setting was touched; none was needed.

## 1. What shipped

`/exercises/[id]` is now the exercise's history, in the lifter's order:

- **Next time** — the engine's current call and its two lines (Smarter & Explainable Progression), unchanged.
- **Records** — Best set (as lifted), Best e1RM (labelled "estimate", from that set), Heaviest weight, Rep records (the rep-max frontier: a load is listed only when its reps beat every heavier load's; ≤ 6 rows). Bodyweight: Most reps in a set.
- **Trend** — e1RM or Weight (heaviest working set per session) tabs; Reps for bodyweight; one point is a sentence, never a chart; deload weeks hollow.
- **Sessions** — each session's sets as logged, RIR, swap note, and the call that session led to; 10 recent, "View all".
- **Goals** — active and past goals on the lift (Goals' own numbers), "Set a goal" when eligible.
- **Machines/cables** — one gym's book at a time ("History at" selector; archived gyms; legacy "No gym recorded" rows with no calls). No figure combines two gyms.
- **Entry points** — library rows, card `View history ›`, day-complete `history ›`, goal page `Exercise history ›`, workout-detail exercise names (machines carry their scope).
- **Guidance** — new tour step "Exercises"; significant What's New entry `2026-10-22-exercise-history`.

No schema change, no migration, no stored value, no new write.

## 2. Linear and PRs

| Ticket | PR | Squash commit on the feature branch |
| ------ | -- | ----------------------------------- |
| OVE-70 — History 1: read layer (records, per-session calls, trend points, goals) | #91 | `6fd4337` |
| OVE-71 — History 2: page per the preview, entry points, e2e | #92 | `e2b27b9` |
| OVE-72 — History 3: user guidance (tour step, What's New) | #93 | `b99e188` |
| Review audit fixes (OVE-70/71) | on #90 | `231bf9d` |
| OVE-73 — deferred: share reads across the page's sections (Backlog, low) | — | — |

Milestone: "Exercise History & PR Intelligence" (Overload V1). OVE-70…72 are In Review; move them to Done once production is checked (runbook §4).

## 3. Method

**Historical decisions (the pitch's central source gap).** Nothing about calls is stored and nothing is added. The call shown beside a session is `evaluateReactiveDecision` — the same engine, rules, ordering (`byDate`), and scope as the current call — run on the scope's rows up to and including that session, on every read. Consequences, all tested: the newest counted session's call equals the current call (2,000-history sweep + integration); a correction changes every later call; scheduled-deload-week sessions are never evaluated ("Deload week"); unfinished, short, and no-gym rows show a status, never a guessed call. The caption says these are worked out "from your sets as they are now" — they reflect today's rules on today's data, not what the screen said that day (spec R12).

**Records.** One population — working sets of finished workouts outside scheduled-deload weeks — the same as Goals' "demonstrated strength", so the page's best set always equals a goal's best (tested). Best set reuses `bestWorkingSet` (no second ranking); best e1RM is `estimateOneRepMax` of that set (no second formula; a static guard enforces it). Rep records are the rep-max frontier, so a lighter, longer set is never presented as "better" than a heavier one.

**Gym context.** `isGymVariable` decides; machine/cable rows are projected one scope at a time and the integration test asserts a scope's DTO contains none of the other gym's values.

## 4. Resolved Decisions (spec R1–R32)

Highlights; the spec holds all 32 with rationale and authority.

- R1 merge on green unless a protected boundary is crossed · R2 `.html` preview (owner preference) · R3 the history is `/exercises/[id]`, no new nav · R4 entry links renamed "history", machines carry `?gym=` · R5/R6 scopes incl. "No gym recorded" (no calls) · R7–R11 records definitions · R12 calls = engine on prefix, computed on read · R13 Hold is a muted word · R14 Weight view = heaviest working set · R15 charts need 2 points · R16 10 recent sessions · R17–R19 goals listed regardless of gym, no reconcile, Set a goal rule · R25 unknown `?gym=` ignored · R29 "Current"/"Last" skip a trailing deload week.
- **R30 (found in implementation):** one column at every width. The app shell caps pages at 640px, so the preview's two-column desktop would have left a ~288px main column; design doc v1.1 and the preview were updated to match.
- **R31:** tour step `exercises` + significant release note (overload-onboarding).
- **R32 (review audit):** no-gym machine links carry `?gym=none`; one href helper; no-gym prose; axis floor; one goal-form rule.

**Bucket C constants for owner review:** `REP_RECORDS_MAX = 6`, `RECENT_SESSIONS = 10` (both in `src/lib/progression/history.ts`; recorded in `docs/planning/method-note.md`).

## 5. Review and audit

`code-review` (high) posted 9 inline comments on #90. Audit (`overload-review-audit`):

- **Implemented (6):** no-gym link scope (1), no-gym footnote copy (2), reps axis floor (3), dead `inProgress` field (7), goal page reuses `exerciseHistoryHref` (8), one goal-form rule `newGoalFormHref` (9). Replies posted; threads resolved; summary https://github.com/troyrhodes02/overload-training/pull/90#issuecomment-6347120464.
- **Deferred (3) → OVE-73:** repeated exercise/history reads (4), `describeScope` work the page discards (5), per-prefix sort in `callsBySession` (6). Valid, not needed at today's data sizes.
- **Skipped (1):** unposted note that `PlannedProgressionDto.hasTrend` is unused — pre-existing and outside the diff.

## 6. Verification (final, on `5b41fbf`)

| Check | Result |
| ----- | ------ |
| `npx prettier --check .` | pass |
| `npx eslint` | 0 problems |
| `npx tsc --noEmit` | pass |
| `prisma validate`; `git diff main -- prisma/` | valid; empty |
| `npm test` (unit) | 67 suites / 1081 tests |
| `npm run test:integration` | 47 suites / 564 tests (incl. RLS deny-all, cross-account isolation, history integrity, baseline isolation/atomicity, deload suppression, the new `exercise-history` and `isolation/exercise-history` suites) |
| `npm run build` + `verify:client-bundle` | pass (see §8 on the Next.js advisory nudge) |
| `npm run test:e2e:accounts` | 35 passed, 1 skipped (the Pitch 4 tap-count baseline driver, skipped by design) |
| `npx playwright test` (default) | 26 passed |
| Vercel (head commit) | success |

Standing invariant tests (guide D4) are all inside the unit/integration suites above and green. Pitch-specific proofs: weight/rep/best-set/best-e1RM correctness and ties; no cross-gym machine values in a scope; global behaviour for free weights at two gyms; current call == card/summary/page call; per-session calls == engine on prefix; goals agree; archived exercise and gym keep history; empty and sparse states; correction recomputation (integration via `editLoggedSet`, and e2e through the History edit dialog); read-only (owned-table snapshot unchanged, incl. an already-reached goal not being archived); cross-account isolation (library exercise shows another account nothing; a custom id reads as missing; a foreign `?gym=` is ignored).

**UI vs preview:** e2e screenshots (`test-results/exercise-history/`: bench 375 light, bench 1280 dark, pushdown at Campus 375 light, pushdown 1280 dark) reviewed against preview §01–§07 — same order, labels, records card, trend tabs, session rows, goals; one column per R30. Loading skeleton seen in dark. **Guidance:** tour step on `page-exercises` (375 light) and `nav-exercises` (1280 dark), card doesn't cover the control; What's New dialog 375 light and 1280 dark shows the entry once; new account has no backlog.

**Not clean, reported honestly:** in the first full accounts-e2e run on the integrated branch, `faster-logging.spec.ts` failed once at its cleanup (`deleteThroughApp` URL wait) while the server logged "account deletion failed; nothing was deleted PrismaClientKnownRequestError" during an unusually slow (4.9 min) run. It passed alone and in two later full runs. This pitch does not touch account deletion; the likely cause is a transaction timeout under load, but that is unverified (§9).

## 7. Merge classification

Merge on green (pipeline guide D1 lists this feature as merge-on-green; spec R1). Protected-boundary check against `main`: no change under `prisma/`, `supabase/`, `src/lib/data/` (scoping), `src/proxy.ts` / auth, `src/lib/logging/logged-sets.ts`, `src/lib/gyms/` (baselines), or `src/lib/accounts/` (deletion), and no added write (`create/update/upsert/delete/$transaction/"use server"`) anywhere in the `src/` diff. Merged by the run.

## 8. Near-misses and observations

- **Two-column desktop** was designed and previewed before checking the shell's 640px cap; caught while implementing (R30). A later design doc should read the shell width first.
- **sr-only table overflow:** the chart's visually hidden `<table>` (inherited from the Pitch 5 chart) laid out at content width and scrolled phones sideways; now wrapped in an sr-only div.
- **Next.js advisory:** `next build` (Next.js **16.4.0**) twice stopped after a successful compile with `SecurityFatalError: Your version of Next.js is affected by a known security vulnerability… We strongly recommend you upgrade Next.js`, and passed on retry. The CLI suggests `next upgrade --agent=security`. Not done in this run (a dependency change outside the pitch); recommended as a separate change.
- Pitch 15's release note `2026-10-21-clearer-progression-calls` reached production on 2026-10-22 with its provisional date; it is published, so it was left alone.

## 9. Required upstream amendments and human follow-ups

1. **PRD:** add Exercise History & PR Intelligence's three roadmap completion criteria (pitch §8 traceability gap).
2. **Pipeline guide** Appendix C/§5 still names `-preview.tsx`; the owner uses `.html` previews.
3. **Design-doc skill / Foundation design doc:** state the shell's single 640px content column so later pitches don't design two-column desktops (R30).
4. **Review** the Bucket C constants `REP_RECORDS_MAX = 6`, `RECENT_SESSIONS = 10`.
5. **Upgrade Next.js** past 16.4.0 per the advisory (§8), as its own change.
6. **Investigate** the one-off "account deletion failed" under load (§6) — possibly the deletion transaction's timeout.
7. **OVE-73** (deferred performance cleanup).
8. **Runbook §4** post-deploy checks on your own account; then move OVE-70…72 to Done.

## 10. Stop conditions

None triggered. No invariant weakened, no approved doc contradicted (R30 supersedes this run's own design artifacts, recorded), no production data or credential scope, no destructive operation.
