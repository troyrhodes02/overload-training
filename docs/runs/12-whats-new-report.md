# Pitch 12 — What's New — Run Report

**Run:** autonomous pitch pipeline, 2026-10-20 · **Slug:** `12-whats-new`

**Outcome:** implemented, integrated, reviewed, audited, and verified on `feat/12-whats-new` (head `c4634fe` plus this report). Feature PR **[#72](https://github.com/troyrhodes02/overload-training/pull/72)** is **open and ready for review. It is not merged.**

**Why not merged (spec R3):** the run prompt authorized merge on green "subject to the pipeline guide's protected-boundary rules". Guide D1 says stop before merge when a pitch changes schema on tables that hold user data, or changes signup or account deletion. The pitch's own §14 says the same. This pitch does all three:
- it adds an owned table (`release_seen`, migration `9e_release_seen`)
- signup writes that table's starting row
- the account-deletion module removes it

Merging deploys code that reads `release_seen` on every signed-in page before production has the table, so applying the migration first is a human runbook step. This matches Pitch 10 R3 and Pitch 11 R3.

**Production:** untouched. Nothing was read from or applied to `overload-prod`. No secret, environment variable, or setting was changed, and signup is unchanged. **No halt condition was hit.**

---

## 1. What shipped (on the feature branch)

| Area | Result |
| ---- | ------ |
| Release-note content | `src/lib/release-notes/entries.ts` is the only place entries live: `RELEASE_NOTES`, newest first, **empty at launch** (R8). `types.ts` holds `ReleaseNoteEntry` (`id`, `date`, `title`, `body`, `significant`). `catalog.ts` holds `validateReleaseNotes` (every rule, every problem at once), the memoized ordered catalog, `formatReleaseDate` (pure string math), `toReleaseNoteView`, `isNewer`, and `unseenSignificant`. CI validates the shipped file on every build. |
| Public-safe reuse | `types.ts`, `entries.ts`, `catalog.ts`, and the `ReleaseNote` component import nothing private: no server-only code, DB, auth, Supabase, or seen state (guard test). A future public changelog can render `orderedReleaseNotes()` with `<ReleaseNote>` and copy nothing. Seen state lives only in `seen.ts` (server-only) and `release_seen`. |
| Seen state | `ReleaseSeen` is one row per account (PK `userId`): `lastSeenReleaseId`, `lastSeenAt`. Migration 9e creates an empty table with an id-format CHECK, RLS deny-all, and an immutable-owner trigger. It's ASCII-only and has no INSERT. `markReleaseNotesSeen` only moves forward (create, or compare-and-set; an older or equal id is a no-op). The action takes only an entry id, validated against the catalog. |
| Rollout | **Existing accounts:** no row means "shown nothing", and with no entries at launch nothing is unseen. **New accounts:** start at the newest entry (no row while the catalog is empty). **Account floor:** entries dated before the account existed, in its own timezone, are never unseen. **Tour:** owns its auto-start load. |
| Dialog | Stock shadcn `Dialog`, capped at `max-h-[85dvh]` with the list scrolling between a fixed header and footer. It shows "What's new" with "Since you were last here" or "{n} updates since you were last here", then **Got it** (initial focus, full width and 44px on phones) and **See all updates**. Seen is recorded **when it opens**, and closing retries once if that save failed (silent on failure). It opens only from the visit's first render, so a mid-visit `refresh()` can never open it (review fix). |
| Settings and page | A Settings → **What's New** section after Tour, with **See what's new**. `/settings/whats-new` shows a back link, "What's New", "Every update to Overload, newest first.", and every entry newest first, significant and ordinary styled the same. The empty state is "No updates yet. When something changes in Overload, it's listed here." A `loading.tsx` skeleton covers the load. |
| Docs | Pitch copy, design doc v1.0, the UI preview (HTML, 17 frames), spec v1.2.0 (R1–R33), the runbook with `docs/runs/12-sql/verify-release-seen.sql`, and the release-note content contract in `docs/planning/method-note.md`. |

No training data is created, changed, or deleted by any What's New operation (integration and e2e tested). No npm dependency was added, and nothing sends email or push (guard).

## 2. Linear and PRs

The **What's New** milestone is in Overload V1. Tickets are chained with `blockedBy` and all are **In Review**: their PRs are squash-merged into the feature branch, which is not in `main`.

| Ticket | PR | Squash into feature branch |
| ------ | -- | -------------------------- |
| [OVE-54](https://linear.app/overload-training/issue/OVE-54) Release-note content + seen state: catalog, ReleaseSeen, migration 9e, action, signup/deletion/isolation | [#73](https://github.com/troyrhodes02/overload-training/pull/73) | `0f44907` |
| [OVE-55](https://linear.app/overload-training/issue/OVE-55) What's New UI: ReleaseNote, dialog, layout + shell wiring, Settings section, history page | [#74](https://github.com/troyrhodes02/overload-training/pull/74) | `8589e45` |
| [OVE-56](https://linear.app/overload-training/issue/OVE-56) Local-stack e2e + dialog browser walkthrough + visual verification | [#75](https://github.com/troyrhodes02/overload-training/pull/75) | `7bb4a83` |

- The feature PR is [#72](https://github.com/troyrhodes02/overload-training/pull/72). The review fixes are in `c4634fe`.
- Integration used the Pitch 9–11 method:
  1. Retarget each stacked PR to the feature branch.
  2. Merge the feature branch into it. Conflicts were only in the progress file and the guard test, and each kept the ticket's superset.
  3. Require the only delta from the ticket tip to be the runbook and its SQL.
  4. Wait for the Vercel check, then squash.
- The final feature tree equalled the OVE-56 tip before the review fixes. No force-push.
- No guidance ticket was created and `/overload-onboarding` was not invoked (R26). The skill's contract was read for the design doc's User guidance section, and the content contract it needs is recorded (spec §8, method note).

## 3. Verification (all run, all passing)

Final state is `c4634fe`.

| Check | Result |
| ----- | ------ |
| `npx prettier --check .` | pass |
| `npm run lint` | pass |
| `npx tsc --noEmit` | pass |
| `npx prisma validate`; local `prisma migrate status` | valid; local stack up to date (9e applied **locally only**) |
| Unit (`npm test`) | **54 suites / 885 tests** |
| Integration (embedded Postgres) | **40 suites / 482 tests** |
| `npm run build` (local-stack env, via the accounts e2e webServer and standalone) | pass |
| `npm run verify:client-bundle` | OK, no server secret in `.next/static` |
| Accounts e2e (`npm run test:e2e:accounts`, local Supabase) | **26 passed** (lifecycle 6, personalization 8, tour 8, whats-new 4) |
| Default e2e (`npx playwright test`) | **26 passed** |
| Vercel check on #72–#75 | pass |
| Local DB after all runs | 3 pre-existing auth users, 2 profiles, 1 tour row, **0** `release_seen` rows, **463** logged sets. No temporary account left. |

The run used:
- the scratchpad `localenv.sh` (it refuses any connection that isn't 127.0.0.1)
- embedded Postgres for integration
- local keys from `supabase status` for the e2e config

### Pitch-specific evidence

| Requirement | How it was verified |
| ----------- | ------------------- |
| **AC-1:** a significant unseen entry shows once | **Integration:** after the mark, nothing is unseen; a repeat or older mark writes nothing; concurrent marks end at the newest. **Browser** (local dev server, temporary reverted entries): seen recorded on open before any button; a reload without closing doesn't reopen; Got it / Escape + reload → none; a mid-visit `refresh()` and a client navigation → none; the next full load → once. |
| **AC-2:** history in date order | Unit render: every entry, significant and ordinary, newest first, styled the same; the empty state at launch. Browser: 6 entries in order at 375 and 1280, light and dark. e2e: the empty state at 375/1280. |
| **AC-3:** no backlog for new accounts | **Integration:** the signup row is at the newest entry, so no dialog; no row with an empty catalog; a repeated profile write keeps one row; the floor hides older entries even with no row, in the account's timezone (Chicago vs UTC). **Browser:** a new account signed up with entries present gets the tour, no dialog, its row at the newest id, and no dialog after the tour. **e2e:** a new account at launch gets the tour and no dialog, including after a reload. |
| **AC-4:** several together | Unit and integration: newest first, ordinary entries excluded. Browser: one dialog with 3, then 5 entries; on 375×568, Got it stays inside the viewport at 44px while the list scrolls. |
| Data-only extensibility | Guards: the mechanism names no entry; `RELEASE_NOTES` is read only by `catalog.ts`. Page and integration tests change entries only, never code. |
| Public reuse without private data | Guard: the public-safe modules' imports. Unit: `ReleaseNoteView` carries exactly id/date/title/body; `ReleaseNote` has no hooks and no reader props. |
| Cross-account isolation | `isolation/release-notes.int.test.ts`: B can't read, count, update, delete, create, or upsert into A's row; one account's mark never moves another's; an account id is never accepted as input. The coverage registry and owned-model lists are extended (guards unchanged in strength). |
| Migration and RLS | Rehearsal (9d → 9e on a DB with accounts): an empty table, RLS on with 0 policies, the trigger and CHECK enforced, other tables' counts unchanged. Local stack: `migrate diff` against the schema is empty; the runbook SQL returned the expected lines; the anon Data API is refused for `release_seen`. |
| UI vs preview | Chrome screenshots on the local stack at 375 and 1280, light and dark: the dialog with one and with several entries, the short phone, the Settings section, and the page populated and empty. Hierarchy, copy, controls, and tokens match `docs/previews/12-whats-new-preview.html`. The preview itself has 17 frames, 0 console errors, 0 network requests, Inter loaded, and 0 phone overflow. |
| Standing invariants (guide D4) | All green in unit, integration, and e2e: <ul><li>RLS on every table with 0 policies</li><li>the anon Data API refused</li><li>unauthenticated redirects, including `/settings/whats-new`</li><li>the single `LoggedSet` write path</li><li>archive keeps history; Restrict on hard delete</li><li>no stored tag or e1RM</li><li>baseline isolation; deload separation</li><li>cross-account isolation; `userId` on every owned model; the scoped-access static check</li><li>deletion removes only the requester's rows</li><li>the tour-anchor check</li><li>the new D4 check: a new account has no backlog, and the dialog shows once per entry</li></ul> |

## 4. Resolved Decisions (made on the owner's behalf)

All are in the spec's `## Resolved Decisions` with rationale and authority:

- **R1** The controlling planning docs are the owner's multi-user set in `Downloads/` (standing).
- **R2** The preview is `.html`, not the run prompt's `.tsx` (standing).
- **R3** Stop before merge (guide D1, pitch §14).
- **R4** `ReleaseSeen` is its own owned model.
- **R5** Content is a TS module in `src/lib/release-notes/`, which settles the architecture open question.
- **R6** File order is canonical: newest first, validated by date.
- **R7** Permanent slug ids. *(Amended in review: the id must start with its own date.)*
- **R8, please review:** **no entry ships with the mechanism.** The run prompt forbids a premature entry, the pitch forbids synthetic or backdated history, and the ship date is yours. The page launches empty. Runbook §8 says how to add an introductory entry on the deploy day if you want one.
- **R9, please review:** existing accounts have no row, meaning "shown nothing". Every entry that ships after rollout reaches them once. This differs from the tour's "treated as already offered" so that future entries still reach existing lifters.
- **R10** *(Amended in OVE-54.)* Signup writes the starting row inside `establishProfile`, because the isolation guard forbids a bare `userId` outside `src/lib/data`.
- **R11** Unknown-id fallback (rule 6 broken).
- **R12** *(Amended in review.)* Account floor, as a calendar date in the account's timezone.
- **R13** Seen on open, through the render-time newest id.
- **R14** Monotonic, no lock.
- **R15** The only input is an entry id.
- **R16** A failed mark is silent; the dialog retries once on close.
- **R17** The tour owns its load. *(Strengthened in review: the dialog opens only from the visit's first render.)*
- **R18** Stock Dialog, no dependency.
- **R19** `/settings/whats-new`; the section sits after Tour.
- **R20** No tour-step link field.
- **R21** Public-reuse boundary.
- **R22** No test-only content switch; the dialog is browser-verified with temporary entries.
- **R23** *(Amended in review.)* An invalid catalog or a failed read means no dialog; deletion stays all-or-nothing.
- **R24** Migration name `9e`.
- **R25** Pure date formatting.
- **R26** No guidance ticket.
- **R27** Three tickets.
- **R28** The local stack stands in for preview-deployment verification.
- **R29** Owner files untouched.
- **R30** No email.
- **R31** Strict fallback (review).
- **R32** Parallel read now; fold `createdAt` into `Account` later (review).
- **R33** Reuse `calendar.ts`; a non-object entry is reported, not a crash (review).

**Bucket-C defaults for the owner to confirm:**
- launching with no entry (R8)
- the existing-account rollout reading (R9)
- the copy: "What's new", "Since you were last here", "{n} updates since you were last here", "Got it", "See all updates", "Every update to Overload, newest first.", "See what's new", and the empty-state sentence
- significant and ordinary entries looking the same on the page
- no cap on the number of entries in the dialog

## 5. Code review and audit dispositions

The `code-review` skill (high) left 8 inline comments on #72. The audit is [posted on #72](https://github.com/troyrhodes02/overload-training/pull/72#issuecomment-6304206992), and each comment has a disposition reply. The fixes are in `c4634fe`, and the full suite was rerun (§3).

| # | Finding | Disposition | Resolution |
| - | ------- | ----------- | ---------- |
| 1 | A mid-visit `refresh()` re-renders the layout, so the dialog could open over the tour or the logging card | **Implement** | The dialog keeps only its first render's data. Browser-verified: with the capture removed, the dialog opened mid-visit and blocked the Settings Save button; with it, no mid-visit dialog, and the next full load shows it once. |
| 2 | The account floor uses UTC, not the account's timezone | **Implement** | `isoDateInZone(…, account.timeZone)` for the floor and the fallback date. Chicago-vs-UTC integration test added (R12). |
| 3 | A failed seen-state read breaks every signed-in page | **Implement** (the read) | Caught, logged by name, no dialog; unit tests added. Deletion is deliberately unchanged (R23). |
| 4 | The unknown-id fallback is strict `>` | **Skip** (R31) | A broken-contract path: never repeating an entry wins. Code comment added. |
| 5 | Extra profile read and a serial round trip | **Implement** (parallel) / **Defer** (the fold) | The fold joins the Pitch 11 R34 refactor (R32). |
| 6 | Date helpers duplicate `calendar.ts` | **Implement** | `parseIsoDate`; `utcDate` removed (R33). |
| 7 | A null entry throws a TypeError | **Implement** | Reported as a problem; test added (R33). |
| 8 | The id's date prefix isn't enforced | **Implement** | CI requires `${date}-`. Contract rule 1 amended (R7). |

## 6. Near-misses and things worth knowing

1. **Two standing guards caught a design slip in OVE-54.**
   - The first draft had `seen.ts` write the signup row through a `userId` parameter. The isolation guard (`userId` only as `account.userId` outside `src/lib/data`) and the "only signup establishes a profile" guard both failed.
   - The write moved into `establishProfile`, like the tour row (R10 amended). **No guard was weakened.**
2. **The review caught a real behavior bug** (finding 1). The design said "one check per page load", but every server action's `refresh()` re-runs the layout. The original walkthrough didn't catch it because it always reloaded the page.
   - The new check was run against the code without the fix, where it **failed** (the dialog opened mid-visit), and with the fix, where it passed.
   - It's a scratch browser script, not an automated test, because the dialog can't be reached in CI while the shipped catalog is empty (R22). A DOM component test would need a new dev dependency, which wasn't added.
3. **This version of Next keeps the previous route mounted but hidden.** Text that appears on both Settings and the What's New page shows up twice in the DOM, so e2e assertions are scoped to visible elements. It's a test concern, not a product bug.
4. **`.env` holds production values.** Every DB or Supabase command used local-stack values.
5. **A dev server survived `TaskStop`** (Windows child process) and kept port 3317. It was identified by its command line and stopped before the build.
6. The local Supabase stack now has `9e_release_seen` applied (local only). Its `verify-release-seen.sql` rehearsal returned the runbook's expected lines.
7. The dialog has never been exercised against **production** content (there is none yet). The first real exercise is Pitch 13's first significant entry; runbook §6 says what to check then.

## 7. Required upstream amendments (not made: `docs/planning/` is read-only during a run, except `method-note.md`, which this run extended)

1. **Architecture → Data model → ReleaseSeen:** record the shape (one row per account; `lastSeenReleaseId`, `lastSeenAt`; started at the newest entry at signup; no row = shown nothing). **Open Questions:** "where release-notes content lives and its entry format" is settled by spec R5 and §8 (`src/lib/release-notes/entries.ts`).
2. **PRD → What's New:** add "adding an entry requires no change to the dialog or page" as an acceptance criterion (it's currently only a roadmap/description condition, pitch §8).
3. **Pipeline guide D2, "Release backlog for a new account":** note the implementation (signup row at the newest entry, plus the account floor in the account's timezone) and the existing-account reading (R9).
4. **Pipeline guide D3/D4:** add "the dialog opening mid-visit after a `refresh()`" as a What's New temptation/regression check.
5. **`overload-onboarding` skill:**
   - point it at `docs/specs/12-whats-new-spec.md` §8 and `docs/planning/method-note.md` for the entry contract
   - note that the id must start with its date
   - note that entries can't link to a tour step (R20)
   - its `NN-whats-new-spec.md` path is `12-whats-new-spec.md`
   - the Pitch 11 amendments (tour spec path, no tour pattern in `overload-ui-design`) still stand
6. **`overload-ui-design` skill:** add the What's New dialog and entry-block pattern (centered stock dialog, scrolling list, fixed footer; date/title/body; no read state).
7. **Carried from Pitches 10–11, still open:**
   - commit the multi-user planning set into `docs/planning/`
   - email and password-reset wording across the PRD, Architecture, Roadmap, guide D2, and `.claude/CLAUDE.md`
   - CLAUDE.md's invite-only wording after OVE-50
   - the guide's preview path is `.html`
   - D1 should state that a pitch whose code reads a new table can't merge before its production migration
   - the root `CLAUDE.md` is stale
   - the Pitch 11 report's amendment list

## 8. Outstanding human steps

Follow `docs/runs/12-whats-new-runbook.md`:

1. **§1** Confirm production is on the Pitch 11 release with only `9e_release_seen` pending.
2. **§2** Back up production and note the counts.
3. **§3** Apply `9e_release_seen` (`prisma migrate deploy`) **before** merging.
4. **§4** Run `docs/runs/12-sql/verify-release-seen.sql` and compare.
5. **§5** Optionally add an introductory entry dated the deploy day (§8). Then review and squash-merge #72, which deploys, and move OVE-54…OVE-56 to Done.
6. **§6** Manual production check: no dialog; Settings → What's New → the page (empty state) on phone and desktop, light and dark.
7. Review R8 (no launch entry), R9 (existing-account rollout), and the bucket-C copy in §4.
8. Still open from Pitch 11: the repository-root backup dump (`backup-pre-ownership-20261019-1119.dump`). Move it out of the repo or ignore `*.dump`. It was never staged.

## 9. Open questions (undecidable by the run)

None are blocking. For owner taste: whether to launch with an introductory entry (R8), and the copy.

## 10. Halt conditions

None triggered. The stop before merge is a merge-behavior outcome (guide D1), not a halt.

- Production data, credentials, and the service-role key were not touched.
- No `LoggedSet`, baseline, or archive path changed.
- The new table has RLS deny-all.
- No account id is taken from client input, and seen state is scoped through `account.db`.
- The signup gate is unchanged. Signup only gains a best-effort starting row, scoped to the new account.
- No destructive operation. The migration is additive and was applied only to the local stack and test databases.
- No email, push, editor, targeting, or analytics was added.

## 11. Deferrals

- **R32:** fold `Profile.createdAt` (and the tour read, Pitch 11 R34; Pitch 10 R27's profile fields) into the `Account` resolution.
- **Out of scope by the pitch and run prompt:**
  - the public changelog and landing page (the content and component are ready, spec §18)
  - tour-step links from entries
  - guidance tickets, which start with Pitch 13
- **Carried from Pitch 10:** harden `tests/unit/import-target-and-images.test.ts` against an exported `NEXT_PUBLIC_SUPABASE_URL`.
