# Pitch 13 — Faster Logging UX — Run Report

**Run:** autonomous pitch pipeline, 2026-10-20 · **Slug:** `13-faster-logging-ux`

**Outcome:** implemented, integrated, reviewed, audited, and verified on `feat/13-faster-logging-ux` (head `20f1b3b` plus this report). Feature PR **[#76](https://github.com/troyrhodes02/overload-training/pull/76)** is **open and ready for review. It is not merged.**

**Why not merged:** stop-before-merge was the run prompt's mandatory gate. Pitch §15 and guide D1 agree ("prefill changes what gets written"), recorded as spec R3. There is **no migration**, so nothing must precede the deploy, but a human approves it and sets the release note's date (§7).

**Production:** untouched. Nothing was read from or applied to `overload-prod`. No secret, environment variable, or setting was changed, and signup is unchanged. **No halt condition was hit.**

---

## 1. What shipped (on the feature branch)

| Area | Result |
| ---- | ------ |
| Previous performance | Each card shows `Last time · Oct 13 · 185 × 8, 8, 7`. It is the most recent earlier workout of the **performed** exercise with at least one set, on or before this workout's date, from any mesocycle. Machines and cables count this gym only: `Last time here …`, or `First time on this at {gym}.` Otherwise, with no history, `First time logging this.` Read through the account-scoped client, display-only. |
| Set states | One **active** row (the next planned set) has inputs. **Logged** sets are text plus a check, rendered only from the server's record. **Upcoming** sets are `Set N —`. While saving, the row's inputs are read-only and dimmed. Errors keep the numbers. |
| Prefill and reuse | Set 1 offers the working weight (`last time`, or `working weight` when it is a machine's gym baseline). Later sets offer the weight just logged (`same as set N`). An untouched offer is selected on focus, so typing replaces it. **Reps are never prefilled.** The +5 Progress and 90% deload suggestions never prefill. Bodyweight has no weight field. **Nothing is written until Log set or Enter.** |
| Focus and keyboard | Nothing is focused on page load. Enter in weight moves to reps; Enter in reps logs the set. After a confirmed set, focus goes to the next reps field; after the last planned set, to Next/Finish; after Next/Previous, to the new card's set. Log set doesn't take focus, so the phone keyboard can stay up. Weight uses the decimal pad, reps the number pad, with `enterKeyHint` next/done. |
| Targets and layout | Set fields are 48px; Log set, logged rows, runner buttons, Change gym, and View trend are ≥ 44px. Each row fits on one line at 375px and 320px (icon-only Log below 360px, R26). There is no horizontal scroll. |
| Correction | A logged row opens History's own `EditSetDialog` (new optional `trigger`, which resets to the stored values on open). There is no inline editing, and History's edit is unchanged. |
| Runner | `Next: {exercise}` with no auto-advance. Finish keeps its unfinished-exercises confirmation. |
| Gym-scoped working weight | For a machine or cable the order is this gym's baseline, then the latest weight logged at this gym, then nothing. **This removes the old fallback to a weight logged at another gym** (R9). The Pitch 5 display-only suggestion is therefore omitted in that one case (R10). |
| Guidance | Tour unchanged (R24). One significant What's New entry, "Faster workout logging", with a **provisional date** (§7). |
| Docs | Pitch copy, design doc v1.1, UI preview (HTML, 28 frames), spec v1.2.0 (R1–R30), runbook, method note "Set entry and tap-count method". |

What did not change: there is no schema, migration, table, or RLS change and no new server action, route, or write module. `logged-sets.ts`, the log/history actions, `baselines.ts`, `src/lib/progression/*`, the tour mechanism, the What's New components, and `catalog.ts` are byte-identical to `main` (checked with `git diff`).

## 2. Linear and PRs

The milestone **Faster Logging UX** is in Overload V1. Tickets are chained with `blockedBy` and all are **In Review**. Their PRs are squash-merged into the feature branch, which is not in `main`.

| Ticket | PR | Squash into feature branch |
| ------ | -- | -------------------------- |
| [OVE-57](https://linear.app/overload-training/issue/OVE-57) Previous performance, gym-scoped working weight, set-entry helpers | [#77](https://github.com/troyrhodes02/overload-training/pull/77) | `d518e48` |
| [OVE-58](https://linear.app/overload-training/issue/OVE-58) Active-row exercise card, focus flow, in-card correction, runner | [#78](https://github.com/troyrhodes02/overload-training/pull/78) | `ddd9cbb` |
| [OVE-59](https://linear.app/overload-training/issue/OVE-59) Local-stack e2e, before/after tap count, method note | [#79](https://github.com/troyrhodes02/overload-training/pull/79) | `c0eea87` |
| [OVE-60](https://linear.app/overload-training/issue/OVE-60) User guidance — What's New entry, tour unchanged (`/overload-onboarding`) | [#80](https://github.com/troyrhodes02/overload-training/pull/80) | `d3f1347` |

- Feature PR: [#76](https://github.com/troyrhodes02/overload-training/pull/76). Review-audit fixes: `20f1b3b`.
- Deferred follow-up: [OVE-61](https://linear.app/overload-training/issue/OVE-61) "Working-weight source: ignore extra sets and order by workout date" (Backlog, related to OVE-57).
- Integration followed the Pitch 9–12 method. Each stacked PR was retargeted to the feature branch, and the feature branch was merged into it; the only conflict was the progress file, where the ticket's superset was kept. Each ticket tree was confirmed identical to its reviewed tip, with the delta being that ticket only. The Vercel check passed before each squash. The final feature tree equalled the OVE-60 tip. There was no force-push.

## 3. Tap-count comparison (AC-1, AC-2)

**Method** (spec §14.4; method note): the same representative workout was seeded for a temporary account on the local stack. It is Push Day 1 at Downtown Gym:

- Barbell Bench Press - Medium Grip 3 × 6–8 (185 × 8, 8, 7)
- Incline Dumbbell Press 3 × 8–10, going up from 60 to 65
- Triceps Pushdown (cable, Downtown baseline 50)
- Pushups (bodyweight)

Both runs used a 375×812 touch context in Chrome and counted from the open workout to the dashboard. A **tap** is one pointer activation on a page element; a field the app already focused is not tapped. A **keystroke** is one key. The drivers act only through the counter: no `fill`, `focus`, or script.

| | Before — Pitch 4 card, `main` @ `fe34d00` | After — this branch | Change |
| - | - | - | - |
| Screen taps | **29** | **18** | −11 (−38%) |
| Keystrokes | 28 | 18 | −10 |
| Visible controls (3-set card with set 1 logged, + Previous/Next) | 12 | 8 | −4 |

- **Before:** `OVERLOAD_TAP_BASELINE=1 npx playwright test --config playwright.accounts.config.ts e2e/accounts/tap-count-baseline.spec.ts`. This ran from a worktree of `fe34d00` with its own `npm ci` (Turbopack rejects a junctioned `node_modules`), with the seed module copied in. The resulting sets were asserted equal to the expected rows. The worktree was removed afterwards.
- **After:** `e2e/accounts/faster-logging.spec.ts`. It asserts ≤ 18 and < 29, and it produced 18 / 18 / 8 on the integrated branch both before and after the review fixes.
- **Breakdown (after):** bench 5 (one reps tap + 3 × Log set + Next), incline 6 (weight tap, reps tap, 3 × Log set, Next), pushdown 4, pushups 3 (2 × Log set + Finish).
- **Caveat:** touch emulation does not reproduce iOS Safari's keyboard. The design keeps the keyboard up, because Log set doesn't take focus and focus then moves between inputs. If iOS still drops it, each set the app focuses costs one extra tap: at most 27 of 29. This is a real-device check in runbook §4.

## 4. Verification (all run, all passing)

Final state is `20f1b3b`.

| Check | Result |
| ----- | ------ |
| `npx prettier --check .` | pass |
| `npm run lint` | pass (exit 0) |
| `npx tsc --noEmit` | pass |
| `npx prisma validate`; `git diff origin/main -- prisma/ supabase/`; local `prisma migrate status` | valid; **no diff**; up to date |
| Unit (`npm test`) | **57 suites / 915 tests** |
| Integration (embedded Postgres) | **41 suites / 494 tests**. New: `previous-performance.int.test.ts` (11, incl. no-writes-on-read and gym scoping). Extended: `isolation/logging`. Standing invariants green: history-integrity, logging, bodyweight-logging, gyms (baselines), progression, goals, rls, schema, every `isolation/*`, and the guards (no `LoggedSet` write outside `logged-sets.ts`, no raw Prisma outside the data layer, deliberate absences). |
| Accounts e2e (`npm run test:e2e:accounts`, production build, local stack) | **29 passed, 1 skipped**: lifecycle, personalization, tour 8, whats-new 5, faster-logging 2. The skipped test is the baseline driver, by design. |
| Default e2e (`npx playwright test`) | **26 passed** |
| `npm run build` (local env) + `npm run verify:client-bundle` | pass; OK |
| Vercel check on #76–#80 | pass |
| Local DB after all runs | 3 pre-existing users, 2 profiles, **463** logged sets, 0 `release_seen` rows. Every temporary account was removed through the app's deletion flow. |

### Pitch-specific evidence

| Requirement | How it was verified |
| ----------- | ------------------- |
| **AC-3: no unconfirmed writes** | e2e: with an offered weight and typed reps, Next/Previous/reload/Change gym leave the account's set count unchanged; one Log set adds exactly one row with the entered values; set 2's offer survives navigation unwritten. Integration: `getWorkout` writes nothing (counts and baseline `updatedAt` unchanged). |
| Correct gym context | Integration: a cable exercise with history only at gym A, trained at gym B, gets `previousPerformance` null and working weight null; at A it gets the baseline plus "here"; a partial at B falls back to B's latest; a free weight from A shows at B; a deload-week suggestion at a no-context gym is null. Unit: `First time on this at {gym}.` |
| Reps-only bodyweight | e2e: the Pushups card has no weight input, and the stored weights are NULL. Unit: the logged row reads `15 reps`, with exactly one input. |
| Historical correction | e2e: tapping a logged row opens `Edit set 1 — …` with the stored values; Save shows `Set updated`, the same row and id are kept, and the count is unchanged. Unit: History keeps its `edit` trigger. History's dialog path is unchanged. |
| Account isolation | Isolation suite: a second account with the same library exercises, a same-named gym, and the same day, started after A logged, sees no previous performance, no working weight, and no set ids. |
| No extra always-visible controls | Unit (2 inputs + Log + row button) and e2e (8 ≤ 8), against 12 before. |
| Preview fidelity | Browser walkthroughs at 375 (touch), 320, and 1280 dark, compared frame by frame with preview §01–§06. Two sizing refinements were recorded (R26); the context line moved full-width; everything else matches. |
| Tour and release note (`/overload-onboarding` checks) | Tour e2e (anchors at 375/1280, no restart) green and unchanged. Catalog validation passes on the shipped file. A new account starts at the newest entry (no backlog). An account predating the entry sees the dialog **once** at 375 light and 1280 dark and never again after Got it, a reload, or a fresh sign-in. Settings → What's New lists it. Screenshots were reviewed. |

## 5. Review and audit

`code-review` (high) posted **10 inline comments** on #76. `/overload-review-audit` replied on each and posted a [summary](https://github.com/troyrhodes02/overload-training/pull/76#issuecomment-6307936380): **Implement 7 · Defer 2 · Skip 0 · Discuss 1**.

| # | Finding | Disposition |
| - | ------- | ----------- |
| 1 | `disabled` while saving blurred the focused field, dropping the phone keyboard | **Implemented:** read-only + `aria-disabled` (R28) |
| 2 | Error focus landed on a disabled input | **Implemented** (same fix) |
| 3 | Gym-baseline offer captioned "last time" could contradict "Last time here" | **Implemented:** caption `working weight` (R27) |
| 4 | Working weight = latest set by creation time, extras included | **Deferred → OVE-61**, plus a code pointer (R29) |
| 5 | In-card correction doesn't replay the baseline | **Deferred:** out of scope. Same as History (Pitch 4 D53/54); a pitch no-go (R29) |
| 6 | Conflict copy pointed to History | **Implemented:** "Tap it above to correct it." |
| 7 | Sequential per-exercise reads | **Implemented:** parallel |
| 8 | Extra-set limit shown as a reps error | **Implemented:** card notice |
| 9 | Redundant effect dependency | **Implemented** |
| 10 | Provisional release-note date could ship backdated | **Discussed → kept**, plus a merge-blocking checklist item on #76 (R30) |

Findings 1 and 2 were real and not caught by my tests: desktop Chrome restores programmatic focus, so the e2e focus assertions passed anyway. The fix keeps the e2e green and removes the cause.

## 6. Decisions made on your behalf

All decisions are in spec `## Resolved Decisions` R1–R30. The ones most worth your review:

- **R7, reps are never prefilled.** Only the weight carries. It is the safe direction (pitch §9.1), and it is why each set still costs one confirm tap.
- **R9/R10, gym-scoped working weight.** This removes a cross-gym fallback that pre-existed in Pitch 4's code, so that one case of Pitch 5's display-only suggestion now shows no number. It follows the Pitch 4 and 5 specs' own tables, but it is a behavior change you'll notice on a machine at a new gym.
- **R13, focus.** Nothing is focused on page load, focus moves only after your action, and the keyboard is kept up across sets.
- **R17, in-card correction through History's dialog.** This is not inline editing; it keeps the confirmed-correction safeguard.
- **R4, one active row in set order.** Upcoming sets aren't tappable; the server still accepts any order.
- **R24/R25/R30, guidance.** No tour step, and a significant entry with a provisional date that a human sets at merge.
- **R26, phone sizing.** The reps box is 88px, and Log set is icon-only below 360px.
- **R2, preview format.** The preview is the `.html` gallery, not the run prompt's `.tsx` (owner standard).

## 7. Release-note publishing status

**Not published.** `src/lib/release-notes/entries.ts` holds one significant entry, `2026-10-20-faster-workout-logging` / **"Faster workout logging"**:

> "Logging a set now takes fewer taps. Each exercise shows what you did last time, your weight carries over from set to set, and the next set is ready for its reps as soon as you log one. Tap a logged set to fix a typo."

The date `2026-10-20` is **provisional**: it is the day the entry was written, not a shipping date. Before merging #76, set `date` and the id's prefix to the merge day and delete the PROVISIONAL comment (runbook §2; checklist on #76). It is published when that deploy reaches production, and it is never re-dated after.

## 8. Required upstream amendments

`docs/planning/` was not edited except `method-note.md`.

1. **PRD:** add Faster Logging UX's three completion criteria (fewer taps on the same representative workout; no additional always-visible controls; prefill never writes unconfirmed values) and their failure states. The approved PRD only lists faster logging as planned work (pitch §8, §14).
2. **`docs/planning/` in the repo is still the single-user set.** The approved multi-user PRD, architecture, roadmap, and brief live in `Downloads/`. The repo roadmap has no Pitch 13. This is a standing amendment since Pitch 8.
3. **Pipeline guide:** Appendix C and §5 still name `docs/previews/<slug>-preview.tsx`; the owner standard is `.html` (memory, `overload-ui-design`). Update the guide so run prompts stop asking for `.tsx`.
4. **Guide D4, standing invariant tests:** add "Prefill never writes an unconfirmed value (`e2e/accounts/faster-logging.spec.ts`), and a machine/cable working weight never crosses gyms (`previous-performance.int.test.ts`)" from Faster Logging UX onward.
5. **Guided Workout Logging / Progressive Overload Engine specs:** note that the Pitch 4 implementation fell back to a weight logged at another gym for a machine/cable with no baseline, contrary to both specs' tables, and that Pitch 13 (R9) realigned the code. OVE-61 holds the remaining working-weight question.
6. **`overload-ui-design` skill:** its shell guidance (bottom nav, "no logo exists") predates Pitch 10's header menu and the shipped lockup. Previews have followed the shipped shell since Pitch 10.
7. **`.claude/CLAUDE.md`** (uncommitted owner change in the working tree, not staged by this run) still describes the invite gate, SMTP password reset, and preview deployments against a dev project. These are superseded per OVE-50 and the runbooks; the owner should reconcile it.
8. **Baseline replay on correction (review finding 5)** is a standing Pitch 4 decision (D53/54). If you want corrections to re-establish a baseline, it needs its own pitch.

## 9. Near-misses and findings

- **Cross-gym weight (found in orientation).** The shipped card prefilled a machine's weight from another gym when this gym had no baseline: exactly the pitch's §9.2 rabbit hole. It is fixed (R9) and tested.
- **Keyboard drop while saving (found in review).** `disabled` on the focused input would have cost an extra tap per set on phones while the desktop e2e stayed green. It is fixed (R28).
- **Arithmetic slip in the design estimate.** v1.0 said 17 after-taps; the correct count is 18. It was caught while writing the measurement and fixed in design doc v1.1, the preview, and the spec before implementation. The measured number matched 18.
- **Clipped weight box / truncated context line.** These were found in the browser walkthrough and fixed before the PR (R26).
- **What's New tests pinned the empty launch catalog.** The first real entry would have broken one unit test and two e2e assertions. They now pin the empty state explicitly or read the shipped entries, and a dialog-once e2e was added. This is not a weakening: every behavior is still asserted.
- **A failed walkthrough run left a temporary account.** A cleanup hook removed it through the app; the local DB was verified back at 3 / 2 / 463.
- **Midnight.** The run finished close to local midnight. The dialog e2e backdates its own temporary profile so it doesn't depend on the wall clock relative to the entry's date.

## 10. Outstanding human actions

1. Review and approve #76.
2. **Set the release note's date to the merge day** (runbook §2; checklist on #76).
3. Real-shaped-data verification on a dev-project preview or locally (runbook §3), and the **real-device** iOS/Android keyboard check (runbook §4).
4. Merge #76 (squash). **No migration** is needed.
5. Post-deploy checks (runbook §6). Move OVE-57 to OVE-60 to Done. Decide OVE-61.
6. Apply the upstream amendments in §8.

## 11. Final status

- **Feature PR [#76](https://github.com/troyrhodes02/overload-training/pull/76):** open, **ready for review, not merged**, Vercel passing.
- **Suite:** green on `20f1b3b` (§4).
- **Tickets:** OVE-57 to OVE-60 In Review; OVE-61 in Backlog.
- **Halt conditions:** none hit.
