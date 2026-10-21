# Pitch 14 — RIR Logging & Autoregulation — Run Report

**Run:** autonomous pitch pipeline, 2026-10-21 · **Slug:** `14-rir-logging-autoregulation`

**Outcome:** the feature is implemented, integrated, reviewed, audited, and verified on `feat/14-rir-logging-autoregulation` (head `b3ce91a`, plus this report).

**Feature PR:** [#81](https://github.com/troyrhodes02/overload-training/pull/81) is **open and ready for review. It is not merged.**

**Why not merged:** stop-before-merge was the run prompt's mandatory gate. Pitch §15 and guide D1 agree, because the pitch adds to the set write. This is recorded as spec R1.

**Migration:** `9f_logged_set_rir` adds one nullable column. **It must be applied to production before #81 is merged** (runbook §0, §5–§8).

**Production:** untouched. Nothing was read from or applied to `overload-prod`. No secret, environment variable, Vercel setting, or Supabase setting changed, and signup is unchanged. **No halt condition was hit.**

---

## 1. What shipped (on the feature branch)

| Area | Result |
| ---- | ------ |
| Stored fact | `logged_sets.rir` is a nullable INTEGER with `CHECK rir IS NULL OR rir BETWEEN 0 AND 4` and no default (migration `9f_logged_set_rir`, additive, no backfill). `NULL` means "not recorded" and is never 0. `4` means "4 or more" (`4+`). |
| Canonical write | `logSet` stores RIR in the same write as weight and reps, and idempotency compares it too. `editLoggedSet`: `rir` undefined leaves it unchanged, `null` clears it, and 0..4 sets it. An invalid value is a `validation_error` with `details.rir`. `logged-sets.ts` is still the only writer, and baselines are untouched. |
| Logging card | The active row gains `RIR  0 1 2 3 4+`: 44px outline chips with a neutral selected state, nothing selected by default, and tap again to clear. A chip never takes focus, so the keyboard stays in reps. The choice is never carried to the next set. Logged rows read `185 lbs × 8 · 2 RIR` only when RIR was recorded. Bodyweight sets are reps plus optional RIR, with no weight field. Below 360px the label sits above the chips (R30). |
| Correction | The edit dialog, opened from the card or from History, shows the stored RIR, which can be changed or cleared (`Not recorded.`). It sends RIR only when you changed it (R34). |
| History | RIR appears beside each set where it was recorded. Days from before this pitch read exactly as before. |
| Progression | The unchanged Pitch 5 rules run first, then RIR from the planned working sets of the latest qualifying performance (§3). The result: `rirEffect` on every progression DTO, plus one reason sentence on the card, the day-complete summary, and the exercise page. There's no new tag or colour, and the dashboard's planned list is unchanged. |
| Guidance | Tour unchanged (R28). One significant What's New entry, "Reps in reserve", with a **provisional date** (§8). |
| Docs | Pitch copy, design doc v1.0, UI preview (HTML, 33 frames), spec v1.2.0 (R1–R36), runbook plus read-only SQL, and a method-note entry "RIR scale and progression qualifiers". |

What did not change, confirmed with `git diff origin/main`: `baselines.ts`, `e1rm.ts`, goals, the tour, the release-note components and catalog, the weight offer in `set-entry.ts` (only `loggedRowLabel` gained an optional spoken detail), the progression thresholds, and scheduled-deload handling. No table, trigger, or RLS change, and no new route or server action.

## 2. Linear and PRs

The milestone **RIR Logging & Autoregulation** is in Overload V1. The tickets are chained with `blockedBy` and are all **In Review**. Their PRs were squash-merged into the feature branch, which is not in `main`.

| Ticket | PR | Squash into feature branch |
| ------ | -- | -------------------------- |
| [OVE-62](https://linear.app/overload-training/issue/OVE-62) Logged-set RIR: migration 9f, canonical write and edit, read DTOs | [#82](https://github.com/troyrhodes02/overload-training/pull/82) | `54d5801` |
| [OVE-63](https://linear.app/overload-training/issue/OVE-63) RIR-aware progression: cases A/B, `rirEffect`, reason lines | [#83](https://github.com/troyrhodes02/overload-training/pull/83) | `af3a9d7` |
| [OVE-64](https://linear.app/overload-training/issue/OVE-64) RIR picker on the card, dialog, History; e2e and tap count; method note | [#84](https://github.com/troyrhodes02/overload-training/pull/84) | `a109afb` |
| [OVE-65](https://linear.app/overload-training/issue/OVE-65) User guidance: What's New entry, tour unchanged (`/overload-onboarding`) | [#85](https://github.com/troyrhodes02/overload-training/pull/85) | `4d04bcb` |

- Feature PR: [#81](https://github.com/troyrhodes02/overload-training/pull/81). Runbook commit `50a3579`; review-audit fixes `b3ce91a`.
- Integration used the Pitch 9–13 method:
  1. Retarget each stacked PR to the feature branch.
  2. Merge the feature branch into it. Conflicts came only where the stacked branch and the earlier squash had added the same files; the ticket side was kept each time.
  3. Confirm the tree is identical to the reviewed ticket tip and the delta is that ticket only.
  4. Wait for Vercel to pass, then squash.

  The final feature tree equalled the OVE-65 tip. There was no force-push.

## 3. The RIR progression rules (as implemented)

These rules are read from the **planned working sets of the most recent qualifying performance**: completed, every planned set present, not a scheduled-deload week, and for machines and cables at the evaluated gym only. Extras, incomplete sessions, deload-week sets, other gyms, and older sessions never contribute RIR.

| Weights-and-reps result | Condition | Final result | `rirEffect` | Reason line |
| ----------------------- | --------- | ------------ | ----------- | ----------- |
| `progress` | any working set at RIR ≤ `RIR_AT_LIMIT` (**0**) | `hold`, no tag | `held_at_limit` | "Top of the range, but at your limit last time (0 RIR) — holding." |
| `stalled` with an **exactly flat** e1RM window | **every** working set at RIR ≥ `RIR_TO_SPARE_MIN` (**2**) | `progress` (+5 suggestion) | `released_stall` | "e1RM is flat, but every set last time had 2+ in reserve — ready to go up." |
| anything else, including a falling stall window | — | unchanged | `null` | — |

- **Unrecorded is never 0 and never 2+.** Case A needs one reported 0; case B needs full coverage. A history with no RIR gives exactly the result it gave before (a 500-history regression sweep checks this).
- RIR never creates or cancels a reactive Deload, never changes insufficient history or an ordinary hold, and is never used in a scheduled-deload week. It's never added to reps and never read by e1RM, goals, baselines, the working weight, or the weight offer; static guards enforce this.
- Cases A and B can't both apply: B needs every set at 2+, so it can never contain a 0.
- Everything is computed on read; nothing is stored. Editing a past RIR changes the next result (integration and e2e tests).

## 4. Verification (all run, all passing)

Final state is `b3ce91a`. The suite was re-run after the review-audit fixes.

| Check | Result |
| ----- | ------ |
| `npx prettier --check .` / `npm run lint` / `npx tsc --noEmit` | pass |
| `npx prisma validate`; `prisma/` diff vs `main` | valid; migration `9f` + `schema.prisma` (+6 lines) only |
| Local `prisma migrate status` | up to date. 9f was applied to the **local stack only** with `migrate deploy`: 463 sets, 0 with RIR. |
| Unit (`npm test`) | **60 suites / 980 tests** |
| Integration (embedded Postgres) | **44 suites / 527 tests**. New: `rir-logging.int.test.ts`, `rir-migration.int.test.ts` (legacy-data rehearsal), `progression-rir.int.test.ts`; `isolation/logging` extended. The standing invariants all pass: history-integrity, logging, bodyweight-logging, gyms/baselines, progression, goals, rls, schema, every `isolation/*`, and the guards. |
| Accounts e2e (`npm run test:e2e:accounts`, production build, local stack) | **33 passed, 1 skipped** (the baseline driver, by design). Includes the new `rir-logging.spec.ts` (4 tests), faster-logging, tour 8, and whats-new 5. |
| Default e2e (`npx playwright test`) | **26 passed** |
| `npm run verify:client-bundle` | OK |
| Vercel check on #81–#85 | pass |
| Local DB after all runs | 3 users, 2 profiles, **463** logged sets, 0 with RIR, 0 `release_seen`. Every temporary account was removed through the app. |

### Pitch-specific evidence

| Requirement | How it was verified |
| ----------- | ------------------- |
| **AC-1: no meaningful slowdown** | Measured with the Faster Logging UX method on the same workout, 375×812 touch. **RIR unset: 18 taps / 18 keystrokes** (exact, asserted), the same as Pitch 13. RIR on the last set of each exercise: **22 / 18**. RIR on every set: **29 / 18**. Recording RIR costs one tap per set and no keystroke, and the focus sequence is unchanged. |
| **AC-2: mixed history** | Unit: 500 generated no-RIR histories give the same result with no effect. Integration: a no-RIR history is unchanged; older NULL sessions plus a latest session with RIR evaluate by the rule. Migration rehearsal on the legacy dataset: every row NULL, every other value unchanged. |
| **AC-3: same reps, different outcome** | Unit, integration, and e2e. With the same 185 × 8, 8, 8, a latest 0 gives Hold plus the case A line, while 2, 2, 3 gives Progress with a 190 lb suggestion. A flat trend gives `Hold — trend flat` without RIR, and Progress plus the case B line when every set had 2+. e2e end to end: the summary shows "at your limit — holding" and the exercise page shows Holding plus the sentence. Correcting set 3 to 2 RIR in History turns it to Progress. |
| Missing ≠ 0 | DB: an omitted value is NULL and 0 is stored as 0. UI: no suffix and no placeholder for NULL, `· 0 RIR` for 0. Clearing stores NULL. |
| Canonical writes / unconfirmed values | Only Log set and the dialog's Save write. A chip choice is a draft. The guard (no `LoggedSet` write outside `logged-sets.ts`) passes. |
| Historical edits | An RIR-only edit changes only RIR (weight, reps, set number, exercise, and creation time kept) and never touches the baseline. A reps-only edit keeps RIR (e2e, R34). |
| Scheduled deload | RIR logged in a deload week has no result and no effect. The next week uses the last non-deload qualifying session (integration). |
| Gym-specific behaviour | A 0 RIR on a cable at Gym B holds only Gym B; Gym A's result and baseline are unchanged. A machine baseline is identical with and without RIR. |
| Bodyweight | Reps plus RIR with weight NULL. A supplied weight is still rejected. Case A applies and the stall gate stays off. |
| Account isolation | B's card never shows A's RIR. B's RIR-only edit of A's set behaves like a missing set and A's rows are unchanged. A's RIR never affects B's result. |
| Preview fidelity | Screenshots reviewed against preview §01–§06: card at 375 light and dark, 320 (an overflow found here was fixed as R30), the dialog, History, the summary, the exercise page at 375 and 1280 dark. Accessibility semantics follow Radix (R31). |
| `/overload-onboarding` checks | Catalog validation and the release-note and tour unit tests pass (117). The tour e2e (anchors at 375/1280, no restart) passes unchanged. An account that predates the entry sees the dialog **once** at 375 light and 1280 dark ("2 updates since you were last here"), then never again. A new account gets the tour, never a backlog. Settings → What's New lists the entry. |

## 5. Review and audit

`code-review` (high) posted **10 inline comments** on #81. `/overload-review-audit` replied to each and posted a [summary](https://github.com/troyrhodes02/overload-training/pull/81#issuecomment-6321990871): **Implement 7 · Defer 1 · Skip 1 · Discuss 1**.

| # | Finding | Disposition |
| - | ------- | ----------- |
| 1 | Case B released a *falling* e1RM trend and called it "flat" | **Implemented:** flat-only release (R33) |
| 2 | The dialog always sent `rir`, so a stale render could erase a stored RIR | **Implemented:** sent only when changed (R34) |
| 3 | A retry with a different RIR conflicts | **Skipped:** not silent. A notice plus one-tap correction. Amending through `logSet` would add an edit side door (R10, R36; Pitch 4 D14). |
| 4 | An RIR error was marked on the reps field | **Implemented:** shown as a card notice instead (R35) |
| 5 | The provisional release-note date needs a manual step | **Discussed → kept**, with the merge-blocking checklist on #81 and runbook §2 |
| 6 | Label composition by string splicing | **Implemented:** `loggedRowLabel` takes a spoken detail |
| 7 | The qualifying sequence was computed twice | **Implemented** (with #1) |
| 8 | The reason line was computed twice per render | **Implemented** |
| 9 | The dialog's visible label wasn't associated with the group | **Implemented:** `aria-labelledby` |
| 10 | `docs(14)` commits lack Linear IDs | **Deferred:** rewriting history would need a force-push, which is forbidden. The audit commit and #81's title now carry OVE-62–65. |

Findings 1 and 2 were real correctness issues my own tests didn't catch. Finding 1 had a test for a flat window but none for a falling one; that test now exists.

## 6. Decisions made on your behalf

All decisions are in the spec's `## Resolved Decisions` (R1–R36). The ones most worth your review, marked Bucket C where they're defaults:

- **R12, case A (`RIR_AT_LIMIT = 0`, Bucket C).** A single reported 0 on a working set in the latest top-of-range session holds the weight. It's the conservative direction, it corrects itself the next session you finish with reps to spare, and it only ever qualifies an existing Progress.
- **R13/R33, case B (`RIR_TO_SPARE_MIN = 2`, Bucket C).** This only releases an *exactly flat* stall window, and only with RIR recorded on every working set. A 1-RIR margin is within typical estimation error. This is a general claim, not a cited source.
- **R15, deload untouched.** RIR neither triggers nor cancels a reactive deload. That's a deliberate "no effect" for this pitch: the pitch forbids single-set triggers, and a deload's defensive precedence shouldn't be overridden by a subjective number.
- **R11, latest qualifying performance only.** RIR from older sessions is shown but never used.
- **R3, scale `0 1 2 3 4+`** (4 means 4 or more).
- **R25, AC-1 metric:** exactly 18 taps / 18 keystrokes with RIR unset.
- **R20/R21, explanation:** one sentence on the card, the summary, and the exercise page. No new tag and nothing on the dashboard list.
- **R28, guidance:** no tour change. The release note is significant and provisionally dated.
- **R2, preview format:** the preview is the `.html` gallery, not the run prompt's `.tsx`, following your standing preference.
- **R30–R32, implementation refinements:**
  - R30: the narrow-phone layout
  - R31: Radix radiogroup semantics, and the group named `Set N RIR (reps in reserve, optional)` so it doesn't collide with the `Set N reps` label
  - R32: Pitch 13's control-count tests count the RIR group as exactly one control (8 → 9), and its AC-1 tap test is now exact (18 / 18)

## 7. User guidance and release-note publishing status

- **Tour:** no new step and no copy change. The `logging` step anchors to Today and still reads true. The chips are labelled on the card, which the tour never opens. When the rubric doesn't clearly call for a step, its default is none.
- **Release note: not published.** `src/lib/release-notes/entries.ts` has one new significant entry, `2026-10-21-reps-in-reserve` / **"Reps in reserve"**:
  > "You can now record how many reps you had left on a set, from 0 to 4+, right under the reps. It's optional and adds no taps when you skip it. If you reach the top of your range at 0, Overload holds the weight; if every set had 2 or more to spare, a flat trend no longer holds you back."
- The date `2026-10-21` is **provisional**: it's the day the entry was written. Before merging #81, set `date` and the id's prefix to the merge day and delete the PROVISIONAL comment (runbook §2). It's published when that deploy reaches production, and never re-dated after.

## 8. Migration requirements (human)

1. Production must be on the Pitch 13 release, with only `9f_logged_set_rir` pending (`prisma migrate status`).
2. Take a fresh `pg_dump` backup.
3. Run `npx prisma migrate deploy`.
4. Run the read-only checks in `docs/runs/14-sql/verify-rir.sql`. Expected results: `rir|YES|int4|(none)`, the CHECK, RLS `t`, 0 policies, `<sets>|0`, and unchanged counts.
5. **Then** merge #81.

The order matters: the new build's set queries include the column, while the old build works with or without it. Rollback is Vercel instant rollback. Never drop the column, because it would destroy recorded RIR (runbook §11).

## 9. Required upstream amendments

`docs/planning/` was not edited, except `method-note.md`.

1. **PRD:** add RIR Logging & Autoregulation's three completion criteria and their failure states. The approved PRD only names it as planned work (pitch §8, §14).
2. **`docs/planning/` in the repo is still the single-user set.** The approved multi-user PRD, architecture, roadmap, and brief are in `Downloads/`, and the repo roadmap has no Pitch 14. This amendment has been standing since Pitch 8.
3. **Architecture data model:** record `LoggedSet.rir` (nullable 0..4; NULL = not recorded) and the derived, unstored `rirEffect`.
4. **Pipeline guide:** Appendix C and §5 still name `docs/previews/<slug>-preview.tsx`, but the owner standard is `.html`. D4 should add these standing invariant tests from RIR Logging onward:
   - a history without RIR evaluates identically
   - RIR is never read by e1RM, baselines, goals, or the offer, and never added to reps
   - with RIR unset the workout is exactly 18 taps / 18 keystrokes
5. **Design doc v1.0** still says `aria-pressed`. The implementation uses radiogroup semantics (R31), and case B is flat-only (R33). The spec is authoritative; the design doc could note both.
6. **Release-note process:** Pitch 13's entry reached `main` with its provisional date and comment unchanged, so the manual step slipped once already. Consider a CI or merge-time check, for example failing a `main` build that contains a "PROVISIONAL date" marker, once that stale comment is removed. Under the content contract Pitch 13's date can't now be changed, but its stale comment can be deleted.
7. **`.claude/CLAUDE.md`** (an uncommitted owner change, not staged by this run) still describes the invite gate, SMTP password reset, and preview deployments against a dev project. These are superseded per OVE-50 and the runbooks.
8. **Pre-existing test defect (not this pitch):** in `tests/unit/invariant-guards.test.ts`, the guard "only signup asks whether a username is free" contains literal backspace bytes (0x08) where `\b` was intended, so it only matches the import path. Fixing it flags a comment-only mention in `src/lib/data/account.ts`. It was left as found, for a small follow-up.

## 10. Near-misses and findings

- **Falling-trend release (review).** Case B as first written would have bumped weight on a falling e1RM and called it "flat". Fixed (R33), with a test added.
- **Stale dialog could erase RIR (review).** Fixed (R34).
- **320px overflow (walkthrough).** The preview's one-line chip row overflowed the card by about 30px at 320; the preview had mis-measured the row's inner width. Fixed (R30), with chips ≥ 44px asserted at 375 and 320.
- **Label collision (e2e).** "Set N reps in reserve" matched the reps field's `Set N reps` label. Renamed (R31). Existing dialog selectors were made exact (`{ exact: true }`); only the selectors changed, and no assertion was loosened.
- **Pitch 13 control counts.** The deliberately added RIR group would have failed Pitch 13's "≤ 8 controls" checks. Those tests now count it explicitly as one control and keep every other control at its Pitch 13 count (R32).
- **Lexicographic migration order.** The migration is named `9f_`; a `10_` prefix would have sorted before `1_` (R7).
- **CRLF from scripted edits** on Windows was caught by `prettier --check` and normalised before any commit.

## 11. Outstanding human actions

1. Review and approve #81. Check the Bucket C constants (§6).
2. **Set the release note's date to the merge day** (runbook §2).
3. Real-shaped-data check (runbook §3) and the real-device keyboard check (runbook §4).
4. Back up production → apply `9f` → run the read-only checks (runbook §5–§8).
5. Merge #81 (squash). Run the post-deploy checks (runbook §10). Move OVE-62 through OVE-65 to Done.
6. Apply the upstream amendments in §9.

## 12. Final status

- **Feature PR [#81](https://github.com/troyrhodes02/overload-training/pull/81):** open, **ready for review, not merged**. Vercel passes and it's mergeable.
- **Suite:** green on `b3ce91a` (§4).
- **Tickets:** OVE-62 through OVE-65 are In Review.
- **Halt conditions:** none hit.
