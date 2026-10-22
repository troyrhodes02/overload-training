# Pitch 15 — Smarter & Explainable Progression — Run Report

**Run:** autonomous pitch pipeline, 2026-10-21 · **Slug:** `15-smarter-explainable-progression`

**Outcome:** the feature is implemented, integrated, reviewed, audited, and verified on `feat/15-smarter-explainable-progression` (code head `c119ea6`, plus docs).

**Feature PR:** [#86](https://github.com/troyrhodes02/overload-training/pull/86) is **open (draft) and ready for your review. It is not merged.**

**Why not merged (merge classification):** stop before merge (spec R1).
- `.claude/CLAUDE.md`: "Merge behavior: The run prompt states it. If it is silent, stop before merge." The run prompt grants merge only "if merge-on-green is explicitly authorized", and nothing authorizes it.
- The pitch (§14, §15) proposes stopping before merge; the pipeline guide treats a pitch's own answer as bucket A, and D1 says "When unsure, stop".
- **Difference to flag:** guide D1's roadmap list classifies Smarter & Explainable Progression as **merge on green** (it writes nothing and changes no schema). The run did not treat that list as authorization because CLAUDE.md and the run prompt both require an explicit grant. Reconcile in the guide (§9, amendment 2).

**Migration:** none. `git diff main -- prisma/` is empty.

**Production:** untouched. Nothing was read from or applied to `overload-prod`. No secret, environment variable, Vercel setting, or Supabase setting changed, and signup is unchanged. No email or password-recovery work. **No halt condition was hit.**

---

## 1. What shipped (on the feature branch)

| Area | Result |
| ---- | ------ |
| Engine | `evaluateReactiveDecision` returns `evidence` (8 kinds) from the branch that decided the call, plus `latestLoadLbs`. No rule, threshold, constant, or order changed; `state`/`base`/`rirEffect` are identical (every prior assertion passes unchanged). |
| Words | One pure, client-safe builder, `src/lib/progression/recommendation.ts` (`buildRecommendation`, `insufficientNote`). It is the only place recommendation sentences exist (guard). `rir-copy.ts` was retired into it. |
| Read layer | `recommendation` on the occurrence, session-summary, exercise, and planned DTOs; `insufficientNote` on the exercise DTO; "today" vs "next time" by session status; "last time" vs a date (`on Nov 9`); ` at <gym>` for machines and cables. |
| Numbers | Only Progress (`{w}+5`) and the deload week (90%) carry a load; a reactive Deload never does; bodyweight never does. Weights are read from completed workouts only, and a free-weight number is printed only when it equals the last working set of the session the engine judged (R33). A baseline rewritten by the in-progress workout isn't used for that workout (R34). |
| UI | `Recommendation` component (action `text-sm`, strong = foreground + medium, quiet = muted; evidence `text-xs` muted; no control, no truncation). Card: replaces the note slot and `Try …` line. Today planned list: evidence on its own line under tagged rows. Day complete: one block per lift. Exercise page: replaces `Holding` / `Suggested next:` / the RIR sentence. |
| Guidance | Tour unchanged. One significant What's New entry, "Clearer progression calls", **provisionally dated** (§7). |
| Docs | Pitch copy, design doc v1.0, UI preview (HTML, 27 frames), spec v1.1.0 (R1–R36), runbook, method-note entry "Recommendation and evidence". |

The wording catalog, in one table: spec §11.2. Examples:

| Call | Action | Evidence |
| ---- | ------ | -------- |
| Progress | `Try 190 lb next time (+5 lb)` | `8 reps on every set, 2 sessions running` |
| Progress, bodyweight | `Next time, go past 12 reps or make it harder` | `12 reps on every set, 2 sessions running` |
| Hold (no tag) | `Stay at 185 lb next time` | `Last time: 8, 7, 6 of 6–8` |
| Hold, top once | `Stay at 115 lb today` | `8 on every set last time; progress needs 2 sessions running` |
| Hold — trend flat | `Stay at 270 lb today` | `Top of the range 2 sessions running, but e1RM hasn't risen over 3 sessions at Downtown Gym` |
| RIR case A (no tag) | `Stay at 185 lb next time` | `Top of the range, but at your limit last time (0 RIR)` |
| RIR case B | `Try 230 lb today (+5 lb)` | `e1RM flat, but every set last time had 2+ in reserve` |
| Reactive Deload | `Lower the weight next time` | `A set below 12 reps, 2 sessions running at Downtown Gym` |
| Deload week | `Deload week: 165 lb (90%)` | `Planned recovery, not a verdict. Calls resume next week.` |
| Not enough history | (nothing; exercise page: `Not enough history yet at Campus Rec Center: 1 of 2 complete sessions.`) | |

What did not change: the progression thresholds and RIR constants, scheduled-deload suppression, gym baselines and their correction, `logged-sets.ts` (still the only writer), the working-weight source and the card's weight offer, e1RM, goals, the tour, the What's New mechanism. No table, migration, trigger, RLS change, route, or server action.

## 2. Linear and PRs

Milestone **Smarter & Explainable Progression** in Overload V1. Tickets chained with `blockedBy`; all **In Review**. Their PRs were squash-merged into the feature branch, which is not in `main`.

| Ticket | PR | Squash into feature branch |
| ------ | -- | -------------------------- |
| [OVE-66](https://linear.app/overload-training/issue/OVE-66) Engine evidence, recommendation builder, read-layer DTOs | [#87](https://github.com/troyrhodes02/overload-training/pull/87) | `abd638f` |
| [OVE-67](https://linear.app/overload-training/issue/OVE-67) Recommendation lines on the card, Today, and the exercise page; e2e | [#88](https://github.com/troyrhodes02/overload-training/pull/88) | `7a4da7d` |
| [OVE-68](https://linear.app/overload-training/issue/OVE-68) User guidance: What's New entry, tour unchanged (`/overload-onboarding`) | [#89](https://github.com/troyrhodes02/overload-training/pull/89) | `2b4d3a2` |

- Feature PR [#86](https://github.com/troyrhodes02/overload-training/pull/86); review-audit fixes `c119ea6`.
- Created during the audit: [OVE-69](https://linear.app/overload-training/issue/OVE-69) (deferred finding 4). Comment added to [OVE-61](https://linear.app/overload-training/issue/OVE-61) (deferred finding 7).
- Integration followed the Pitch 9–14 method: retarget each stacked PR to the feature branch, merge the feature branch into it (conflicts only in the shared progress file and guard file; ticket side kept), confirm the tree equals the reviewed ticket tip, wait for Vercel, squash. The final feature tree equalled the OVE-68 tip. No force-push.

## 3. Verification (all run, all passing)

Final code state `c119ea6` (later commits are docs only).

| Check | Result |
| ----- | ------ |
| `npx prettier --check .` / `npm run lint` / `npx tsc --noEmit` | pass |
| `npx prisma validate`; `prisma/` diff vs `main` | valid; empty |
| Unit (`npm test`) | **63 suites / 1034 tests** |
| Integration (embedded Postgres) | **45 suites / 544 tests**, incl. the new `progression-recommendation.int.test.ts` (17 tests) and the extended `isolation/logging`. Standing invariants all pass: history-integrity, logging, bodyweight-logging, gyms/baselines, progression, progression-rir, goals, rls, schema, every `isolation/*`, guards. |
| Accounts e2e (`npm run test:e2e:accounts`, production build, local stack) | **34 passed, 1 skipped** (the baseline driver, by design), incl. the new `explainable-progression.spec.ts`, `faster-logging` (exactly 18 taps / 18 keystrokes), `rir-logging`, tour 8, whats-new 5 |
| Default e2e (`npx playwright test`) | **26 passed** |
| `npm run build` + `npm run verify:client-bundle` | OK |
| Vercel checks on #86–#89 | pass |
| Local DB after all runs | 3 users, 2 profiles, 463 logged sets, 0 `release_seen` (unchanged from the start; every temporary account was removed through the app) |

### Pitch-specific evidence

| Requirement | How it was verified |
| ----------- | ------------------- |
| **AC-1: evidence for every non-trivial recommendation** | Builder catalog tests (every row × loaded/bodyweight × gym × today/next); integration on all four surfaces; e2e on Today, the card, day complete, and the exercise page. |
| **AC-2: text matches the engine** | 2,000-history correspondence sweep (kind ↔ call, allowed action verbs, RIR named iff `rirEffect`, no weight for bodyweight, no amount on a deload, every evidence number is one the engine read, forbidden phrases; covers all 8 evidence kinds). Guard: no page or component imports the engine. Card, summary, and page return identical recommendations for one evaluation. |
| **AC-3: no plan or weight mutation** | Integration snapshot of every owned table (incl. `updated_at`) before and after reading every surface twice in every scenario: byte-identical. e2e: viewing surfaces adds no set. Guard: the read layer contains no write call. No action or route added. |
| RIR when available, none invented | Unit + integration: cases A/B name RIR; RIR recorded but not decisive, and RIR cleared through `editLoggedSet`, are never mentioned. |
| Scheduled-deload suppression | Integration: week-5 card shows only `Deload week: 165 lb (90%)` for a lift the rule had flagged; planned list returns no recommendation; week 6 resumes `Lower the weight today`. |
| Gym context | Integration: a cable Deload at Gym A names Gym A; Gym B shows its own `Not enough history … 1 of 2`; the planned list makes no machine call before a gym is chosen. |
| Historical-edit recomputation | Integration and e2e: correcting a past set turns `Try …` into `Stay at … / Last time: 8, 8, 7 of 6–8` on the next read. |
| Mid-workout stability | Integration + e2e: logging today's sets never changes the card's number; planned list and exercise page agree with the card; a sibling slot ignores the first slot's sets; a mid-workout baseline correction withholds the number. |
| Cross-account isolation | `isolation/logging`: B reading the shared exercise gets no recommendation and `0 of 2`, and its DTO contains nothing of A's. Foreign occurrence / session ids stay not-found. |
| Preview fidelity | Screenshots reviewed against preview §01, §05, §06: card, Today, day complete, exercise page at 375 light; day complete at 1280 dark. Hierarchy, tone (strong vs muted), placement, and wrap behaviour match. One intended deviation: planned-list rows now wrap, so a long name pushes the right-hand items under it at 375 (the preview's names were short). |
| `/overload-onboarding` checks | Release-note catalog validation + tour/release-note unit tests (117) pass; tour e2e (anchors at 375/1280, no restart) passes unchanged; an account that predates the entry sees the dialog once at 375 light and 1280 dark ("3 updates since you were last here"), then never again; a new account gets the tour, not a backlog; Settings → What's New lists it. |

## 4. Review and audit

`code-review` (high) posted **10 inline comments** on #86. `/overload-review-audit` replied to each, resolved the implemented threads, and posted a [summary](https://github.com/troyrhodes02/overload-training/pull/86#issuecomment-6332033578): **Implement 6 · Defer 2 · Skip 2 · Discuss 0**.

| # | Finding | Disposition |
| - | ------- | ----------- |
| 1 | "Stay at X lb" could take an extra back-off set's weight | **Implemented** (R33) — number printed only when it equals the judged session's last working set |
| 2 | A baseline corrected mid-workout moved the card's "today" number | **Implemented** (R34) |
| 3 | Planned list / exercise page read today's unfinished sets | **Implemented** (R33) — completed workouts only |
| 4 | "Next time" ignores an upcoming / current scheduled-deload week | **Deferred → OVE-69** (owner decision) |
| 5 | A sibling slot of the same exercise fed today's sets | **Implemented** with #3 |
| 6 | Release note overclaimed "shows the sets that fell short" | **Implemented** (R35) |
| 7 | Derive the weight from the evidence instead | **Deferred → OVE-61** (single weight authority) |
| 8 | Extra weight read per hold row on the planned list | **Skipped** (negligible cost; adds a branch to a correctness-critical read) |
| 9 | `latestFinished` copied the engine's date comparator | **Implemented** (`byDate` exported and reused) |
| 10 | `suggestion` / `rirEffect` dead on DTOs | **Skipped** (`suggestion` feeds the planned list and is the action's number; `rirEffect` is data for tests and Pitch 16) |

Findings 1, 2, 3 and 5 were real correctness issues that my own tests did not catch — each concerned *which* weight the new action line prints, not the call. Regression tests now cover all four.

## 5. Recommendation and evidence behavior (summary)

- One evaluation → one `evidence` → one sentence pair, everywhere. Nothing computes a call outside the engine; nothing words a call outside the builder.
- A number appears only where the engine has one, and only when it is trustworthy; otherwise the line says what to do without a number. Silence over a weak claim.
- Holds stay untagged and muted; deload weeks keep their own voice; RIR appears only when it changed the call; "last time" is literal.
- Nothing is stored; any correction changes the words on the next read.

## 6. Decisions made on your behalf

All decisions are in the spec's `## Resolved Decisions` (R1–R36). The ones most worth your review:

- **R7 — no number on a reactive Deload** (`Lower the weight next time`). The engine defines no reactive reduction; borrowing the deload week's 90% would merge the two deload systems. A future rule-bearing pitch can add one.
- **R8 — bodyweight Progress wording**: `go past {top} reps or make it harder` — the plan's own top of range, no weight or variation.
- **R11 — ordinary holds now show two muted lines** (card, summary, page), still no tag or colour. The planned list stays quiet for holds (R12).
- **R33/R34 — numbers are withheld rather than guessed** (back-off sets, unjudged later workouts, mid-workout baseline corrections). The visible effect: a lift whose last workout ended with an extra back-off set shows `Ready to add weight` instead of `Try {back-off + 5}`; this also changes what Today's right-hand `Try …` shows in that case. Bucket C — easy to relax once OVE-61 fixes the source.
- **R10 — OVE-61 not absorbed**: it changes Faster Logging's prefill (what gets written) and was reserved for you.
- **R17 — "last time" vs a date**; **R18 — "today" vs "next time"**; **R13 — the stall line names its rule, not rounded e1RM figures**.
- **R31 — the Library & Gyms Setup "no recommendation code" guard** was narrowed by exactly the progression vocabulary; any other "recommend" still fails.
- **R2 — preview format** `.html` (your standing preference), not the run prompt's `.tsx`.
- **R28 — guidance**: no tour change; one significant, provisionally dated entry.

## 7. User guidance and release-note publishing status

- **Tour:** unchanged. No new screen or control; the `logging` step ("Overload uses them to tell you when to progress, hold, or deload") stays true. Rubric default: no step.
- **Release note: not published.** `src/lib/release-notes/entries.ts` has one new significant entry, `2026-10-21-clearer-progression-calls` / **"Clearer progression calls"**:
  > "Every progression call now says what to do and why. Ready to go up shows the weight to try and the sets that earned it, a hold says what to stay at and what's left to earn the next step, and a deload says where your sets fell short. Overload never changes your plan or your weights."
- The date `2026-10-21` is **provisional** (the day it was written). Before merging #86, set `date` and the id's prefix to the merge day and delete the PROVISIONAL comment (runbook §2). It is published when that deploy reaches production and never re-dated after.

## 8. Required upstream amendments

`docs/planning/` was not edited, except `method-note.md` (new entry "Recommendation and evidence").

1. **PRD:** add Smarter & Explainable Progression's three completion criteria (pitch §8 traceability gap).
2. **Pipeline guide D1:** lists this feature as merge-on-green while the pitch proposes stop-before-merge and CLAUDE.md requires an explicit grant. Reconcile which wins, and state it in run prompts.
3. **Pipeline guide Appendix C / §5** still name `docs/previews/<slug>-preview.tsx`; the owner standard is `.html` (standing since Pitch 9).
4. **Pipeline guide D4** — add standing tests from this pitch: the correspondence sweep (words ↔ call), "no page or component imports the engine", "sentences only in the builder", and the non-mutation snapshot of progression reads.
5. **`docs/planning/` is still the single-user set** in the repo; the approved multi-user PRD, architecture, roadmap, and brief live in `Downloads/` (standing since Pitch 8).
6. **Architecture data model:** record the derived, unstored `DecisionEvidence` and `RecommendationDto`, and that the reactive-deload call carries no load.
7. **Design doc v1.0** describes R9 as "the card's working weight as of before the occurrence"; the shipped rule is R33/R34 (finished workouts only + trust gate). Its §13 draft release copy also says "shows the sets that fell short" (corrected in the entry, R35). The spec is authoritative.
8. **Release-note process:** the Pitch 13 and 14 entries reached `main` with their PROVISIONAL comments still in place (dates happened to match). Consider a CI check that fails a `main` build containing a "PROVISIONAL date" marker.
9. **`.claude/CLAUDE.md`** (an uncommitted owner change in the working tree, not staged by this run) still describes the invite gate, SMTP password reset, and preview deployments against a dev project — superseded per OVE-50 and the runbooks.
10. **Pre-existing test defect (from Pitch 14's report, still open):** `tests/unit/invariant-guards.test.ts` "only signup asks whether a username is free" contains literal backspace bytes instead of `\b`.

## 9. Near-misses and findings

- **Which weight the words print** (review findings 1, 2, 3, 5): the first implementation fixed the obvious mid-workout drift on the card but not the planned list, sibling slots, back-off sets, or baselines. Fixed by R33/R34 with four regression tests.
- **The Library & Gyms Setup guard** banned the word "recommend" anywhere in `src/` — written for exercise-library personalization. Narrowed precisely (R31) rather than renaming the feature's vocabulary to dodge it.
- **Hidden previous routes:** Next keeps the previous page mounted (hidden) after a client navigation, so the Today summary and the exercise page both contain the same sentence — by design. The RIR e2e's selectors now assert the visible copy only; no assertion was loosened.
- **Test construction slips** (creation order in two unit tests, a second active mesocycle in one integration test, an over-broad "in reserve" assertion that matched the RIR chips' label) were caught by the failing runs and corrected; none changed product code.
- **Shell quoting on Windows Git Bash** collapsed `\\` in heredocs; scripted edits were moved to files and every file re-checked with prettier.
- **Known limit, not fixed:** advice around a scheduled-deload week on history-level surfaces (OVE-69).

## 10. Outstanding human actions

1. Review and approve #86 — especially the wording catalog (spec §11.2) and the decisions in §6.
2. **Set the release note's date to the merge day** (runbook §2).
3. Real-shaped-data check (runbook §3).
4. Squash-merge #86, run the post-deploy checks (runbook §4–§5), and move OVE-66 through OVE-68 to Done.
5. Decide OVE-69 (deload-week advice) and OVE-61 (working-weight source).
6. Apply the upstream amendments in §8.

## 11. Final status

- **Feature PR [#86](https://github.com/troyrhodes02/overload-training/pull/86):** open (draft), **not merged**; Vercel passes.
- **Suite:** green on `c119ea6` (§3).
- **Tickets:** OVE-66, OVE-67, OVE-68 In Review; OVE-69 created (Backlog).
- **Halt conditions:** none hit. **Blockers:** none.
