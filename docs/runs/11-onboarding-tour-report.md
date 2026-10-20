# Pitch 11 — Onboarding Tour — Run Report

**Run:** autonomous pitch pipeline, 2026-10-20 · **Slug:** `11-onboarding-tour`
**Outcome:** implemented, integrated, reviewed, audited, and verified on `feat/11-onboarding-tour` (head `a1d066d` + this report). Feature PR **[#68](https://github.com/troyrhodes02/overload-training/pull/68)** is **open and ready for review. It is not merged.**
**Why not merged (spec R3):** the run prompt said to merge on green "following the pipeline guide's merge-behavior rules". Guide D1 says to stop before merge when a pitch "changes schema on tables that hold user data", changes signup, or changes account deletion. This pitch adds an owned table (`tour_progress`, migration `9d_tour_progress`), has signup create its row, and extends the account-deletion module. Merging would also deploy code that reads `tour_progress` on every signed-in page before production has the table, and every signed-in page would fail. Applying the migration is a human runbook step. This is the same reasoning as Pitch 10 R3.
**Production:** untouched. Nothing was read from or applied to `overload-prod`. No secret, environment variable, or setting was changed, and signup is unchanged. **No halt condition was hit.**

---

## 1. What shipped (on the feature branch)

| Area | Result |
| ---- | ------ |
| The tour | One guided tour over the real interface: **Today** (heading), **Logging a workout** (the Start/Resume button, or the day's own card when nothing is planned, with copy that never implies a workout exists), **Getting around** (the ☰ menu button; phone only), then **Plan**, **History**, **Goals**, **Gyms** (rail item on desktop, page heading on a phone), and **Settings** (the Replay tour button), ending with **Done**. A spotlight (an SVG scrim with a rounded cut and an accent ring) marks a real control. The card has a counter, a title, one or two sentences, and Skip tour / Back / Next. On a phone it docks at the bottom with 44px buttons; at md+ it sits beside its target. Between screens it shows a skeleton line and Skip stays live. |
| Responsive targets | Each step lists candidate anchors, and the **first one actually visible** wins: connected, has a box, not `visibility:hidden`, and not inside an `inert`/`hidden` subtree. The rail is never a target below md and the menu button never at md+. A step whose target never appears is skipped silently in the direction of travel. The phone navigation sheet is never opened by the tour. Crossing md mid-run re-picks the target. |
| First login / persistence | `TourProgress` (one row per account, PK `userId`): `offeredAt`, `outcome` (`completed`/`skipped`), and `outcomeAt`. A new account is made **due** when its profile is established at signup. The tour opens by itself once, while due, and the offer is spent the moment its card opens. Finish, skip, Escape, browser Back, a reload, or closing the tab all mean it never opens by itself again. |
| Existing accounts | Migration 9d writes **no row**, so every account that exists at rollout (including yours) is never auto-toured. They replay from Settings. |
| Replay | Settings → **Tour** (between Appearance and Delete account) → **Replay tour**. It runs the same tour from step 1, Done returns to Settings with focus on the button, and it never re-arms the automatic offer. `useTour().start({ from })` can start at a step, for a later What's New entry. |
| Registry | `src/lib/tour/steps.ts` is the only place steps live: `TOUR_STEPS` (design doc copy, verbatim), `TOUR_ANCHORS`, and `tourAnchor()`. Adding a step means adding an entry plus `{...tourAnchor("name")}` on the target element. The mechanism (`engine.ts` is pure, `dom.ts`, `components/tour/*`) holds no step data, which a guard test enforces. |
| Schema | `enum TourOutcome`, `model TourProgress` (Restrict FK to `profiles`, CHECK outcome⇔outcome_at, RLS deny-all, immutable-owner trigger). Account deletion removes it before the profile. It's registered in the isolation coverage registry. |
| Docs | Pitch copy, design doc v1.0, UI preview (HTML, 23 frames), spec v1.3.0 (R1–R35), runbook + `docs/runs/11-sql/verify-tour-progress.sql`. |

No training data is created, changed, or deleted by any tour operation (integration-tested), and no new npm dependency was added.

## 2. Linear and PRs

Milestone **Onboarding Tour** (Overload V1). Tickets are chained with `blockedBy`. All are **In Review**: their PRs are squash-merged into the feature branch, which is not in `main`.

| Ticket | PR | Squash into feature branch |
| ------ | -- | -------------------------- |
| [OVE-51](https://linear.app/overload-training/issue/OVE-51) Tour progress persistence: TourProgress model, migration 9d, progress module + actions, deletion + isolation | [#69](https://github.com/troyrhodes02/overload-training/pull/69) | `aa808c4` |
| [OVE-52](https://linear.app/overload-training/issue/OVE-52) Guided tour UI: registry, engine, provider/overlay, anchors, Settings replay | [#70](https://github.com/troyrhodes02/overload-training/pull/70) | `722c3ed` |
| [OVE-53](https://linear.app/overload-training/issue/OVE-53) Local-stack tour e2e: first login, skip, abandon, replay, D4 anchors at 375/1280 | [#71](https://github.com/troyrhodes02/overload-training/pull/71) | `bfa7798` |

- Feature PR: [#68](https://github.com/troyrhodes02/overload-training/pull/68). The review fixes are in `a1d066d`.
- Integration used the Pitch 9/10 method:
  1. Retarget each PR to the feature branch.
  2. Merge the feature branch into it. The conflicts were docs only (spec and progress) plus `tour-overlay.tsx` on #71, each resolved by keeping the ticket's superset.
  3. Require the only delta from the ticket tip to be runbook/progress/SQL.
  4. Wait for Vercel with `gh pr checks --watch`, then squash.
- The final feature tree equalled the OVE-53 tip before the review fixes. No force-push.
- `/overload-onboarding` was **not** invoked and no guidance ticket was created (R26): What's New hasn't shipped, so the skill's availability rule applies. This pitch built the tour and its initial steps through the normal skills, as the run prompt directed.

## 3. Verification (all run, all passing)

Final state is `a1d066d`.

| Check | Result |
| ----- | ------ |
| `npx prettier --check .` | pass |
| `npm run lint` | pass |
| `npx tsc --noEmit` | pass |
| `npx prisma validate`; local `prisma migrate status` | valid; local stack up to date (9d applied **locally only**) |
| Unit (`npm test`) | **47 suites / 813 tests** |
| Integration (embedded Postgres) | **37 suites / 453 tests** |
| `npm run build` (local-stack env, via the accounts e2e webServer) | pass |
| `npm run verify:client-bundle` | OK, no server secret in `.next/static` |
| Accounts e2e (`npm run test:e2e:accounts`, local Supabase) | **22 passed** (lifecycle 6, personalization 8, tour 8); local DB unchanged afterwards (1 auth user, 1 profile, 0 tour rows, 463 logged sets) |
| Default e2e (`npx playwright test`) | **26 passed** |
| Vercel check on #68–#71 | pass |

Per-ticket verification is in the progress file. The run used the scratchpad `localenv.sh`, which refuses anything that isn't 127.0.0.1. Integration used embedded Postgres, and the e2e configs take local keys from `supabase status`.

### Pitch-specific evidence

| Requirement | How it was verified |
| ----------- | ------------------- |
| First-login eligibility (AC-1, rollout) | Integration: a new account via `establishProfile` is due; an account with a profile but no row (older than the tour) is never due; spending the offer, any outcome, or a replay ends it; a lazy-profile race leaves exactly one due row. Migration rehearsal: 9d leaves existing profiles with no row and changes no other table's counts. e2e: a new account opens at 1 of 8; a later new account still gets its own tour after another finished; a due account whose first page is `/plan` gets the tour on Today (review regression test). |
| Skip / completion persistence | e2e: Done, Skip, Escape, a reload mid-tour, and browser Back each end the run, and nothing reopens after a reload or a sign-out and sign-in. Integration: outcome + time recorded; latest outcome wins; CHECK and immutable-owner trigger enforced. |
| Replay from Settings (AC-2) | e2e: replay after completion and after skip opens at 1, Done → `/settings` focused on Replay tour, and a reload doesn't reopen it. |
| Cross-account isolation | `isolation/tour.int.test.ts`: B can't read, count, update, delete, create, or upsert into A's row, and A's finished tour doesn't affect B's. Account deletion removes only the acting account's row. Coverage registry extended; ownership-enforce, account-scope, and guard lists extended without loosening. |
| Responsive anchors, D4 (AC-3) | e2e at 375 and 1280: every step's spotlight equals an available `[data-tour]` element's box (+ padding), the anchor matches the expected per-width list, the step's own route is checked, and the phone sheet stays closed. Unit: each registry anchor is rendered in `src/`; rail anchors are on the rail only. |
| Missing-target handling | Unit: resolution falls back (Start → day card; rail → heading); the counter drops skipped steps; walking skips in both directions. The `inert` rule (the dimmed Start under a missed-day prompt is unavailable) is part of `isAvailable`. **Not exercised in a browser:** a missing-target skip (every initial step's target exists on an empty account) and the missed-day state (it needs an active plan with a missed day on a temporary account). Both are covered by the engine unit tests only. The desktop "7 of 7" is the layout filter (R11), not a missing-target skip. |
| Registry extensibility (AC-4) | Unit: a data-only extra step is walked in order by the unchanged engine; guard tests: mechanism files hold no step ids, routes, anchors, or titles, and only the provider reads `TOUR_STEPS`; no tour library in `package.json`. |
| UI vs preview | Chrome screenshots on the local stack at 375 and 1280, light and dark: steps 1–8, step 2's empty-day card, desktop rail steps, Settings last step, loading. Hierarchy, copy, controls, placement, and tokens match the preview. The preview itself has 23 frames, 0 console errors, 0 network requests, Inter loaded, 0 phone overflow, and 0 cards over their target. |
| Standing invariants (guide D4) | RLS on every table with 0 policies (incl. `tour_progress`); anon Data API refused for `tour_progress` on the local stack; unauthenticated redirects; single `LoggedSet` write path; archive keeps history; Restrict on hard delete; no stored tag or e1RM; baseline isolation and atomicity; deload separation; cross-account isolation; `userId` on every owned model; scoped-access static check; deletion only removes the requester's rows; the new D4 tour-anchor check. All green in unit, integration, and e2e. |

## 4. Resolved Decisions (made on the owner's behalf)

All are in the spec's `## Resolved Decisions`, with rationale and authority:

- **R1** The controlling planning docs are the owner's multi-user set in `Downloads/` (standing).
- **R2** The preview is `.html`, not the run prompt's `.tsx` (standing; skill + owner feedback).
- **R3** Stop before merge (guide D1; new owned table, signup, deletion; production migration first).
- **R4** `TourProgress` is its own owned model (architecture data object). **R5** Auto-start = the row is due.
- **R6, please review:** *amended in OVE-51.* The first spec draft backfilled a row per existing account with an `INSERT` in 9d. The standing migration-safety guard (`invariant-guards`: no `INSERT INTO` in any migration) forbids that, and this codebase never writes data from a migration. **The guard was not weakened.** Instead, a new account is made due by `establishProfile` at signup (best effort, never thrown). Older accounts have no row and are never auto-toured. Consequence: accounts created between applying 9d and the deploy, or hand-provisioned ones, are never auto-toured either.
- **R7** Latest outcome wins, replays included.
- **R8** *(amended in review)* The offer is spent the moment an automatic run opens its card.
- **R9** Registry location and shape (settles the architecture open question).
- **R10** *(amended in OVE-52)* Availability rule without `aria-hidden`: the Radix modal marks everything outside it `aria-hidden`.
- **R11** Phone-only step filter. **R12** 5 s per-step wait. **R13** Missing-target rules.
- **R14** Radix Dialog primitive + SVG scrim; no new dependency; the modal locks page scroll and the tour scrolls targets into view.
- **R15** Card placement (pure `placeCard`). **R16** Never open the phone sheet.
- **R17** *(amended in review)* A real foreign navigation ends the run.
- **R18** *(amended)* Done returns to the origin, query string included.
- **R19** Exercises isn't a stop. **R20** `start({ from })`, no URL entry point.
- **R21** Module and actions location (`src/app/(app)/tour-actions.ts` is a file, not a route folder).
- **R22** Failed outcome save → toast; failed offer save ignored by design.
- **R23** Settings section placement. **R24** Mounted in `AppShell` only. **R25** No route exclusions.
- **R26** No guidance ticket. **R27** Three tickets. **R28** Local stack stands in for preview-deployment verification. **R29** Owner's files untouched. **R30** No email work. **R31** Migration name `9d`. **R32** Copy pinned to the design doc.
- **R33** Keep the rAF tracking loop. **R34** Defer folding the tour read into the Account resolution. **R35** The owner's backup dump.

**Bucket-C defaults for the owner to confirm (guide D2):**

- the existing-account treatment (standing; implemented as "due at signup", R6)
- offer-spent-when-the-card-opens (R8)
- the step copy (design doc Screen 2, R32)
- Exercises not being a stop (R19)
- Escape = Skip, and Done returning to where the tour started (design doc)

## 5. Code review and audit dispositions

Review: the `code-review` skill (high) left 9 inline comments on #68 plus one note outside the PR. The audit is [posted on #68](https://github.com/troyrhodes02/overload-training/pull/68#issuecomment-6293831981). Fixes are in `a1d066d`, and the full suite was rerun (§3).

| # | Finding | Disposition | Resolution |
| - | ------- | ----------- | ---------- |
| 1 | An automatic run that starts on any page but `/` is recorded `skipped` before it shows (the mount-time route check) | **Implement** | The route check acts only on a real pathname change; e2e regression test added (a due account whose first page is `/plan`) |
| 2 | A run where no target appears doesn't spend the offer and holds the scrim 5 s per step, on every load | **Implement** | The offer is spent when an automatic run opens its card (R8 amended); Skip stays live while loading |
| 3 | A failed offer save is silently ignored | **Skip** (by design, R22) | The result is handled explicitly and documented; the harmful chain ran through #1, now fixed |
| 4 | Browser Back while a step loads could be overridden | **Implement** (defensive) | A wait that ends off both the step's route and the departure screen ends the run (R17) |
| 5 | The spotlight and card show on the previous target for a frame | **Implement** | Tracking moved to a layout effect |
| 6 | Done drops the origin's query string | **Implement** | Origin = pathname + search (R18) |
| 7 | rAF loop reads layout every frame | **Skip** (R33) | Short-lived, once-per-account overlay; also catches movement observers miss |
| 8 | Extra DB read per (app) layout render | **Defer** (R34) | Joins the Pitch 10 R27 chokepoint refactor |
| 9 | Each poll scans for the winning anchor twice | **Implement** | One scan per candidate |
| 10 | Untracked backup dump in the repo root | **Discuss** (R35) | Owner's file, never staged; owner decides: move it out or ignore `*.dump` |

## 6. Near-misses and things worth knowing

1. **The planned backfill would have broken a standing guard.** The spec's first draft inserted rows in 9d. `invariant-guards` refuses any `INSERT` in a migration, so the design changed (R6) instead of the guard.
2. **The review caught a real AC-1 bug** (finding 1). It would have silently cost any friend their first tour if their first page wasn't Today. The e2e suite missed it because signup always redirects to `/`; the new regression test closes that gap. I didn't separately run the new test against the pre-fix code to watch it fail.
3. **Three presentation bugs were found in the browser, not by unit tests:**
   - Dev StrictMode's effect replay left the first step loading forever (an abort-on-unmount cleanup; removed).
   - A `box-shadow: 0 0 0 9999px` scrim wasn't painted across the viewport, and swapping scrim nodes reordered them after the card (one stable SVG layer now).
   - Focus could rest on `<body>` after a replay navigated away from Settings (the overlay now keeps focus in the card).
4. **`.env` holds production values.** Every DB or Supabase command used local-stack values.
5. **One ad-hoc `next start` signup failed with `unexpected_failure`** right after the e2e suite's burst of sign-ins. It looks like local auth rate limiting; no account was created. Dev-server and e2e (build + start) signups were clean. It's not a product issue, but if a friend ever sees "couldn't create the account" right after several attempts, this is the likely cause.
6. **The modal locks page scrolling while the tour is open** (Radix). The design doc said the page "still scrolls". The tour scrolls each target into view itself, so nothing is unreachable (R14).
7. The local Supabase stack now has `9d_tour_progress` applied (local only). Its `verify-tour-progress.sql` rehearsal shows RLS on with 0 policies, 0 rows, and history counts unchanged.

## 7. Required upstream amendments (not made: `docs/planning/` is read-only during a run)

1. **PRD → Onboarding Tour acceptance criteria:** add "a new step can be added by adding data only" (pitch §13 traceability gap).
2. **Architecture → Data model → TourProgress:** record the shape (one row per account; `offeredAt`, `outcome`, `outcomeAt`; created due at signup; accounts older than the tour have none). **Open Questions:** "the shape and location of the tour step registry" is settled by spec R9 (`src/lib/tour/steps.ts`).
3. **Pipeline guide D2, "Tour for accounts that exist before it ships":** note the implementation, "no row = not due; rows are created at signup; no migration backfill (migrations never write data)".
4. **`overload-onboarding` skill:**
   - It says to read `overload-ui-design` "for the tour popover"; that skill has no tour pattern. Point it at `docs/specs/11-onboarding-tour-spec.md` §7/§13 and the preview.
   - It refers to `docs/specs/NN-onboarding-tour-spec.md`; the real path is `docs/specs/11-onboarding-tour-spec.md`.
   - Record that a step anchored inside the phone sheet would need a mechanism change (spec §18).
5. **`overload-ui-design` skill:** add the tour card + spotlight pattern (docked on phones, beside the target at md+, accent ring, dialog scrim). The earlier Pitch 10 amendments (hamburger rule, stale tokens, "no logo") still stand.
6. **`overload-design-doc` skill:** its "rule out tutorials, hand-holding copy" line needs an exception for the onboarding tour.
7. **Carried from Pitch 10 and still open:**
   - commit the multi-user planning set into `docs/planning/`
   - update the email/password-reset wording in the PRD, Architecture, Roadmap, guide D2, and `.claude/CLAUDE.md`
   - update CLAUDE.md's invite-only wording after OVE-50
   - the preview path in the guide is `.html`
   - D1 should state that a pitch whose code reads a new table or column can't merge before its production migration
   - the root `CLAUDE.md` is stale

## 8. Outstanding human steps

Follow `docs/runs/11-onboarding-tour-runbook.md`:

1. **§1** Confirm production is on the OVE-50 release with only `9d_tour_progress` pending (`prisma migrate status` against production, from a trusted machine).
2. **§2** Back up production (`pg_dump`) and note the history counts.
3. **§3** Apply `9d_tour_progress` (`prisma migrate deploy`) **before** merging.
4. **§4** Run `docs/runs/11-sql/verify-tour-progress.sql` and compare.
5. **§5** Review and squash-merge #68, which deploys. Move OVE-51…OVE-53 to Done.
6. **§6** Manual check in production: no tour for your account; Replay works on phone and desktop; optionally a throwaway new account gets it once.
7. Review **R6** (due-at-signup rollout), **R8**, **R14** (scroll lock), and the bucket-C defaults in §4.
8. Decide on the repository-root backup dump (R35): move it out of the repo or add `*.dump` to `.gitignore`.

## 9. Open questions (undecidable by the run)

None blocking. For owner taste: the step copy (bucket C, pinned by test to the design doc), and whether the tour should ever include Exercises.

## 10. Halt conditions

None triggered. The stop before merge is a merge-behavior outcome (guide D1), not a halt.

- Production data, credentials, and the service-role key were not touched.
- No `LoggedSet`, baseline, or archive path changed.
- The new table has RLS deny-all.
- No account id is taken from client input.
- Signup's gate is unchanged. Signup only gains a best-effort tour row, scoped to the new account.
- No destructive operation: the migration is additive and was applied only to the local stack and test databases.

## 11. Deferrals

- R34: fold the per-request tour read (and Pitch 10 R27's profile fields) into the Account resolution.
- Carried from Pitch 10: harden `tests/unit/import-target-and-images.test.ts` against an exported `NEXT_PUBLIC_SUPABASE_URL`; the Radix scrim timing quirk (R29 there).
- Out of scope by the pitch: What's New, guidance tickets, contextual help, Exercises as a stop, any navigation or Settings redesign.
