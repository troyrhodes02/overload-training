# Pitch 17 — Admin Center & Feedback — Run Report

**Status: complete, STOPPED BEFORE MERGE.** Feature PR **#94** (https://github.com/troyrhodes02/overload-training/pull/94) is open and not merged. All five ticket PRs are squashed into it, the review audit is applied, and the full suite is green on the final head (§6). Merging it, applying the migration, and setting the admin allowlist in production are human steps (runbook `docs/runs/17-admin-center-feedback-runbook.md`).

**One capability was halted, not built:** owner-initiated account deletion. It is stop condition 2 (the approved documents contradict each other; §8), tracked as **OVE-79** (blocked).

---

## 1. What shipped (on the feature branch)

- **Owner-only admin area at `/admin`, web-only.** Identity is the server-only allowlist `OVERLOAD_ADMIN_USER_IDS` of Supabase auth user ids (fail closed, read per request). `requireAdmin()` runs in the admin layout, its metadata, every admin page, and every admin action. A signed-in non-admin's request for any `/admin/**` URL is answered by the proxy with the ordinary 404 (R23). The ⋮ menu shows **Admin** only when the server resolves the account as allowlisted.
- **Overview.** Registered accounts (with the suspended count), active in the last 7 and 30 days, new this month, created a plan, and logged a workout, plus six months of signup cohorts with "came back" and "active, 30 days" rates. A footnote states each definition and its limitation. The metrics layer reads metadata plus presence-only `groupBy userId` sets on Mesocycle and LoggedSet.
- **Accounts.** A directory with search over name, username, and email, a status filter, and pagination, with emails from one read-only auth-facade call that degrades to "—". The account page shows name, username, email, status (with "since"), joined, last seen, tour, timezone, and the feedback count, plus recent admin actions. Nothing about training appears, and there is no plan column (Plans & Billing adds it).
- **Suspend and reactivate.** Each change goes through an AlertDialog that names the account. A conditional update and an audit entry commit in one `inAdminTx`, and a repeat changes nothing. Admin accounts can't be suspended. `requireAccount()` refuses a suspended account on every request (→ `/suspended`), including sessions signed in before the suspension.
- **Last-active date.** A date in the account's own timezone, written at most once a day by a conditional update. Best effort, and never written for a suspended account.
- **Send feedback (Free).** Category (Bug, Idea, Question, Other) and a message of up to 2000 characters, from the ⋮ menu or the phone sheet. Nothing is attached. Sending is capped at 10 per rolling 24 hours, enforced by a serializable count-and-insert.
- **Feedback inbox.** Open, Handled, and All views, a category filter, and an account filter. The item page shows the plain-text message and the sender's metadata, with re-file, Mark handled, and Reopen, each audited.
- **Audit log.** The `AdminAuditEntry` model is admin-only: no owner column, no foreign keys, append-only by database trigger. It has a page of its own and a per-account view.
- **User guidance.** One significant What's New entry, "Send feedback from Overload". No tour step (R26–R27).

Schema: migration `9g_admin_center_feedback` (additive; ASCII). RLS is on for both new tables, with zero policies. It was applied to the **local** Supabase stack only.

## 2. Linear and PRs

Milestone **Admin Center & Feedback** (7cb8b570) in Overload V1.

| Ticket | Title | PR | Squash on feature |
| ------ | ----- | -- | ----------------- |
| OVE-74 | Admin 1: foundation | #95 | `f8ebb22` |
| OVE-75 | Admin 2: Send feedback | #96 | `f7a512c` |
| OVE-76 | Admin 3: admin center | #97 | `cb3e050` |
| OVE-77 | Admin 4: feedback inbox + boundary e2e | #98 | `f8c2bd2` |
| OVE-78 | Admin 5: user guidance | #99 | `804ce8a` |
| OVE-79 | BLOCKED: admin deletion (needs upstream amendment) | — | not worked |

OVE-74…78 are In Review. Move them to Done after the human merge.

Integration: each ticket PR was retargeted to the feature branch, then the feature branch was merged into it. The add/add conflicts were resolved to the ticket side, Vercel passed, and the PR was squashed. The final feature tree equals the OVE-78 tip. No force-push.

## 3. Method and authority

- **Pitch:** the Linear document → `pitches/17-admin-center-feedback.md` (verbatim). Design doc v1.0, preview `.tsx`, spec v1.1.0 (R1–R29).
- **Planning docs:** `docs/planning/` (the owner's 2026-10-22 commercial set). Governing rules: `.claude/CLAUDE.md`. Pipeline guide: `Downloads/overload-pipeline-prompt-guide (1).md`.
- **Skills invoked:** `overload-design-doc`, `overload-ui-design` (pipeline artifact mode), `overload-spec`, `overload-ticket-worker` (×5), `overload-onboarding`, `code-review` (/review), and `overload-review-audit`. `overload-cross-platform` was not invoked, because the iOS foundation has not shipped.

## 4. Resolved Decisions (spec R1–R29)

Pre-resolved by the run prompt (R1–R9): allowlist identity, absolute privacy, next-request suspension, date-only last-active, the four feedback categories, audit in the same transaction, the admin-deletion gate (halted), no billing, and guidance through the shipped mechanisms.

Decided by the run:

- **R10:** the preview is `.tsx`, per the owner's Oct 22 rewrite of the UI skill. This supersedes the older `.html` convention, and the memory note was updated.
- **R11:** `AdminAuditEntry` is admin-only, with no owner and no foreign keys.
- **R12–R14:** the metric definitions and their limits, dates per account, plan = ≥1 Mesocycle, workout = ≥1 LoggedSet.
- **R15:** the admin layer lives in `src/lib/data/admin/` behind a pure gate plus a gated client.
- **R16:** emails come through one new read on the auth facade.
- **R17:** dialogs for suspend and reactivate only.
- **R18:** admins can't be suspended.
- **R19:** feedback cap of 10 per 24 hours.
- **R20:** feedback attaches nothing.
- **R21:** no per-account training facts on the account page.
- **R22:** `/suspended` reveals nothing and allows sign-out.
- **R23:** non-admin → a real 404, with a proxy early-reject because a streamed `notFound()` keeps status 200.
- **R24:** signup untouched.
- **R25:** a separate admin shell.
- **R26–R27:** no tour step, one significant release note with a provisional date.
- **R28:** serializable feedback cap (review).
- **R29:** reaffirm R22 and R14 (review).

**Bucket C constants flagged for owner review:** `FEEDBACK_DAILY_LIMIT = 10`; `FEEDBACK_MESSAGE_MAX = 2000`; directory, inbox, and audit page sizes of 50; `COHORT_MONTHS = 6`; cohort = signup calendar month in the account's own timezone; "came back" = last-active on a later day than signup; the 7- and 30-day windows include today; `listAuthUserEmails` reads at most 20 × 1000 users.

## 5. Admin authorization and privacy findings

- **Not-found boundary.** Streaming made a layout `notFound()` return 200, which would have revealed that the admin area exists (found by e2e). The fix is a proxy rewrite to the ordinary 404 for signed-in non-admins, using the same pure allowlist rule. `requireAdmin()` remains authoritative. E2E proves a 404 status, no admin text, and no admin title on every admin URL, including a real account id.
- **Direct action replay.** The admin's real suspend action, captured and replayed by a lifter on `/`, `/feedback`, and the admin path, never reaches the action. Next answers "Server Action unavailable" (409), because the action isn't part of those routes, and nothing changes. The in-action layer is covered by `tests/unit/admin-actions.test.ts`: every admin action invoked directly by a non-admin gets not-found, and nothing reaches the data layer.
- **Privacy sentinel.** Two accounts carry every training model with marker strings and numbers. The JSON of every admin read contains none of them (`tests/integration/admin-privacy.int.test.ts`).
- **Structural guards.** The admin gate refuses every model, field, relation, and aggregate outside §6.2, both as a pure unit and against a real database. Static guards (`tests/unit/admin-guards.test.ts`) check:
  - admin code has no other door
  - every admin page and action calls `requireAdmin()` first
  - actors come only from `identity.ts`
  - only the allowlist module reads the variable
  - no client component imports the admin layer
  - no `role` or `admin*` field exists on any model

  The isolation guard now also catches `resolveAccountState` and `touchLastActive` (review).
- **Audit completeness.** Every mutation is audited exactly once, and a no-op records nothing. A failure after the audit write rolls back both. Audit writes outside an `inAdminTx` are refused. The database rejects UPDATE and DELETE on the log.

## 6. Verification

Commands:
- `npx prettier --check .`, `npx eslint` (0 problems), `npx tsc --noEmit`, `npx prisma validate`
- `npm test`: **75 suites / 1151 tests**
- `npm run test:integration` (embedded Postgres): **53 suites / 607 tests**. Includes RLS (both new tables on, zero policies, anon sees nothing), cross-account isolation (Feedback added to coverage), history integrity, baselines, deload suppression, deletion (feedback removed, audit retained), and the admin gate, privacy, metrics, suspension, and feedback suites.
- `npm run test:e2e:accounts` and `npm run test:e2e` (local stack): see §6.1
- Production build (via the e2e web server) + `npm run verify:client-bundle`: OK, and `OVERLOAD_ADMIN_USER_IDS` is absent from client chunks.
- Preview comparison: screenshots at 375 light and 1280 dark for Overview, Accounts, the account page, the suspend dialog, Audit, Inbox, Item, `/feedback`, `/suspended`, and the What's New dialog, each reviewed against `docs/previews/17-admin-center-feedback-preview.tsx`. They match in hierarchy, controls, states, and mobile behavior.

### 6.1 Final e2e (on the final head)

On head `3c9f2c7`, local Supabase stack:
- `npm run test:e2e:accounts`: **42 passed, 1 skipped, 0 failed**. The skip is `tap-count-baseline.spec.ts`, which by design runs only against the Pitch 4 commit. The run includes:
  - `admin-center.spec.ts` 5/5: 404 boundary, menu, Overview, directory, account page, suspend → next action and navigation refused, reactivate, direct-action replay, feedback end to end
  - `send-feedback.spec.ts` 2/2
  - `tour.spec.ts` 8/8 and `whats-new.spec.ts` 5/5
  - lifecycle, personalization, logging, RIR, explainable progression, and exercise history
- `npm run test:e2e`: **26 passed**.
- `npm run verify:client-bundle`: OK.

Earlier in step 11: accounts e2e 38 passed + 1 skipped (by design) + 1 failed. `personalization.spec.ts` pinned the phone-sheet list, which now includes Send feedback (design doc Screen 1). I updated the expectation, and personalization then passed 8/8. Default e2e: 26/26.

**Environment note.** Next.js 16.4.0's security-advisory nudge stops every other `next build`; a retry passes. Its recommendation: *upgrade Next.js*, by running `next upgrade --agent=security` in a separate worktree. **Not done in this run** (out of scope; flagged for the owner).

**Not exercised:** Vercel preview deployments against a database. The previews built successfully, but `9g` exists only on the local stack.

## 7. Review dispositions (`code-review` high → `overload-review-audit`)

Implement 8, Skip 1, Discuss 1 (resolved by recommendation), Defer 0. Fixes are in `0993ce5`. Each thread has a reply, implemented threads are resolved, and the summary is at https://github.com/troyrhodes02/overload-training/pull/94#issuecomment-6356517498.

1. Isolation guard missed `resolveAccountState`: **implemented**.
2. Feedback-cap race: **implemented** (serializable, R28).
3. "Suspended since" lost after 10 actions: **implemented**.
4. A suspended account can't self-delete: **discuss → kept** (CLAUDE.md, R22/R29). Upstream note below.
5. "View feedback" link after the sender is deleted: **implemented**.
6. Repeated email listing: **implemented** (React `cache`).
7. `loggedSet.groupBy` cost: **skipped** (R14 definition; indexed).
8. Duplicated labels and date helpers: **implemented**.
9. Supabase-table guard lacked the new tables: **implemented**.
10. Date via string split: **implemented**.

## 8. Deletion-contract reconciliation status — HALTED (stop condition 2)

- **Contradiction.** On one side: CLAUDE.md's first invariant ("Deleting an account … is user-initiated, confirmed, handled by one dedicated module") and the PRD's Accounts edge case ("Account deletion cannot be started by anyone but the signed-in owner"). On the other: the PRD's Admin Center & Feedback feature and owner journey, Architecture → API Surface (Admin … delete), the roadmap's Pitch 17, and CLAUDE.md's own admin-boundary list ("suspend, reactivate, delete").
- **Done.** Nothing destructive: `deleteAccount` is unchanged in authority. Its order gained `Feedback`, so a lifter's own deletion remains complete. There is no admin delete control, no raw deletion, and no second path.
- **Resume.** First the amendment below. Then OVE-79: add `deleteAccountAsAdmin(actor, targetId)` inside `src/lib/accounts/deletion.ts`, an `account_delete` audit kind written before the identity is removed, and the UI from design doc Screen 12 and the preview's "Deferred" frame. Stop before merge.

## 9. Required upstream amendments (human)

1. **CLAUDE.md first invariant and PRD → Accounts edge case.** Authorize owner-initiated deletion of a named account through the dedicated module: after `requireAdmin()`, with typed-email confirmation, never for an allowlisted account, and with a surviving `account_delete` audit entry. Or remove admin deletion from the PRD, roadmap, and architecture. (Unblocks OVE-79.)
2. **Architecture → Data Model "Ownership".** Name `AdminAuditEntry` as an admin-only model with no owner (the second exception beside library exercises), with a target id kept as a bare UUID after the target's deletion (R11).
3. **Data removal for a suspended account (R29).** Decide whether a suspended lifter may request deletion or export. Today they can't, because suspension refuses every request. This belongs to the admin-deletion amendment or to Public Accounts.
4. **CLAUDE.md "invite-only" wording.** It is stale since OVE-50 (open signup behind `OVERLOAD_SIGNUP_OPEN`). This run didn't change signup (R24).
5. **Pipeline guide.** It ships in `Downloads/`, not the repo. Appendix C still names `.tsx`, which is correct again after the UI skill rewrite.
6. **PRD → Admin Center & Feedback.** Note the cohort and last-active limitations (date only; tracked from deploy) so the Overview's footnote is the documented contract.
7. **Tour copy (optional).** The phone navigation step says "Everything else is in this menu: Plan, History, Goals, Exercises, Gyms, and Settings". Send feedback is now also there. Judged not stale enough for a change (R26). Revisit if the menu grows again.

## 10. Outstanding human actions

- Runbook §1–§8, in order: back up, apply `9g`, verify the SQL, set `OVERLOAD_ADMIN_USER_IDS` (Production only, your own UUID), re-date the release note to the merge day, review and merge **#94**, then do the production checks.
- Move OVE-74…OVE-78 to Done after the merge. Keep OVE-79 blocked until the amendment.
- Consider the Next.js security upgrade (§6).

## 11. Near-misses and observations

- A streamed `notFound()` returns 200 under Cache Components. A pure page-level not-found would have revealed the admin area through the status code (fixed by R23).
- Prisma's extended interactive-transaction client also exposes `$transaction`, so "is this a transaction?" couldn't be tested structurally. The audit writer instead accepts only transactions opened by `inAdminTx` (a WeakSet registry).
- An `action` column name collided with the no-stored-recommendation guard, so the audit column is named `kind` and the guard was left untouched.
- Next 16 keeps previous routes in the DOM, hidden, so e2e text queries must filter to visible elements.
- The e2e admin is created in the local stack with a fixed auth UUID (`e2e0ad00-…0017`), and the accounts web server allowlists exactly it. Audit rows it writes stay in the local stack by design.

## 12. Stop conditions

- **Triggered for one capability:** condition 2 (approved documents contradict), for admin deletion only (§8). It is halted with the amendment and resumption path recorded. The rest of the pitch didn't depend on it, and the pitch itself scoped deletion "subject to reconciliation".
- **Not triggered:**
  - no invariant weakened: isolation and RLS are extended, logged history is untouched, no stored tags, the signup gate is unchanged
  - no production data or credentials touched
  - no destructive operation outside the pitch
- **Final PR status:** **#94 open, not merged, awaiting human approval.**
