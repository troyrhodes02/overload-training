# Pitch 8 — Multi-User Foundation — Run Report

**Run:** autonomous pitch pipeline, 2026-10-18 → 2026-10-19 · **Slug:** `08-multi-user-foundation`
**Outcome:** implemented, integrated, reviewed, and verified on `feat/08-multi-user-foundation` (head `11a6824`). The feature PR **#49 is open, not merged** (run prompt: stop before `main`).
**Production:** untouched. No migration was applied to `overload-prod`, no production data or credentials were read, and signup is unchanged (still disabled). No halt condition was hit.

---

## 1. What shipped (on the feature branch)

| Area | Result |
| ---- | ------ |
| Ownership | `userId` (FK → new `Profile`, `ON DELETE/UPDATE RESTRICT`) on every owned model, children included; `Exercise.userId` nullable (null = shared library) |
| New models | `Profile` (per auth user; IANA `timeZone`; nullable names), `ExerciseFavorite` (per-account favorites). Both RLS deny-all |
| Scoped access | `src/lib/data/`: DMMF-driven `scopeArgs` + Prisma query extension (`createAccountClient`), `requireAccount()` from the auth session (lazy UTC profile), `inAccountTx`, `accountToday`, scoped row lock, operator/test `accountFor` |
| Conversion | Every feature module, server action, page, and the real-plan import now go through `account.db`; creates carry `userId: account.userId`; foreign id ≡ missing id everywhere |
| Static guard | ESLint (alias/relative/dynamic raw-client imports, `new PrismaClient`, operator constructors) + unit guards (raw SQL, `userId` only as `account.userId`, no Supabase-client table queries, no account id in actions) |
| Library | Read-only to every account (archive/restore of a library row → not found; Archive control rendered only for custom exercises); favorites per account; legacy library archives left as they are |
| Per-account rules | `mesocycles_single_active_per_user`, `goals_one_active_per_exercise_per_user` replace the global indexes |
| Timezone | `Profile.timeZone` is the only "today" authority; cookie reader, its constants, and `TimeZoneSync` removed |
| Staged migration | `9_account_ownership_1_expand` (additive) → operator backfill (`scripts/operator/account-ownership`, named by email, dry run default, one transaction, count + value-checksum verification, idempotent) → `9_account_ownership_2_enforce` (completeness + cross-account guard first; NOT NULL; custom⇔owned CHECK; per-account indexes; 20 same-owner + 15 immutability triggers; functions revoked from Data API roles) |
| Isolation suite (permanent) | `tests/integration/isolation/` — plan, library, gyms, logging (workouts, sets, swaps, missed days, cardio, baselines, progression), goals, profile/timezone — plus a coverage meta-test that fails when an owned model lacks isolation tests |
| Runbook | `docs/runs/08-multi-user-foundation-runbook.md` + `docs/runs/08-sql/{counts,fingerprint,verify}.sql` |

## 2. Linear and PRs

- Milestone **Multi-User Foundation** (Overload V1). Tickets chained by `blockedBy`, all **In Review**. Their PRs are merged into the feature branch, which is not yet in `main`.

| Ticket | PR | Squash into feature branch |
| ------ | -- | -------------------------- |
| [OVE-36](https://linear.app/overload-training/issue/OVE-36) Ownership expand + scoped layer core | [#50](https://github.com/troyrhodes02/overload-training/pull/50) | `945982d` |
| [OVE-37](https://linear.app/overload-training/issue/OVE-37) Backfill operator + rehearsal harness | [#51](https://github.com/troyrhodes02/overload-training/pull/51) | `b5509a0` |
| [OVE-38](https://linear.app/overload-training/issue/OVE-38) Scope plan, library, gyms (+ import) | [#52](https://github.com/troyrhodes02/overload-training/pull/52) | `02bfccd` |
| [OVE-39](https://linear.app/overload-training/issue/OVE-39) Scope logging, cardio, goals, progression + timezone | [#53](https://github.com/troyrhodes02/overload-training/pull/53) | `9d4f3fb` |
| [OVE-40](https://linear.app/overload-training/issue/OVE-40) Enforce ownership + DB second layer + rehearsal | [#54](https://github.com/troyrhodes02/overload-training/pull/54) | `873af2c` |

- Feature PR: [#49](https://github.com/troyrhodes02/overload-training/pull/49) — open, all ticket PRs integrated, review findings addressed (`11a6824`).
- Integration method: merge the updated feature branch into each child, resolve with the child's superset, **require zero content delta vs the child tip**, push, retarget, squash. No force-push. That check caught the pre-rename `9_account_ownership_expand` directory resurrected on #54 (it would have applied migration 9 twice); it was removed before merging.

## 3. Verification (final, `11a6824`, all run and passing)

| Check | Result |
| ----- | ------ |
| `npm run lint` | pass |
| `npm run format:check` | pass |
| `npx tsc --noEmit` | pass |
| `npx prisma validate` | pass |
| Fresh DB `prisma migrate deploy` (Prisma's own ordering) | 11 migrations applied |
| `prisma migrate diff` migrations → schema | no drift |
| Unit (`jest.config.js`) | 35 suites / 571 tests |
| Integration (embedded Postgres; incl. isolation suite, history-integrity, RLS, schema, invariant guards, staged rehearsal) | 32 suites / 391 tests |
| `next build` (DB/Supabase env overridden to local) | pass |
| `scripts/check-client-bundle.mjs` | no server secret in `.next/static` |
| Playwright E2E | 22 passed |

Every ticket was verified per commit (lint, typecheck, format, unit, integration, build) before its PR; per-ticket numbers are in the progress file. An earlier final run reported `format:check` warnings on two files. The cause was CRLF line endings in the working copy only (the committed content was already formatted). The whole suite was rerun on the clean tree, as shown above.

## 4. Migration rehearsal evidence

**Local development stack** (the permitted environment; real-shaped data mirroring production: 1 account, 3 mesocycles, 9 sessions, 39 planned exercises, 877 exercises incl. 1 custom, 2 gyms incl. 1 archived, 10 baselines, 36 logged sessions, 157 logged exercises, 463 logged sets, 2 missed days, 5 goals, 2 planned cardio, 4 cardio logs), run with the runbook's exact commands:

1. `pg_dump -Fc` backup (616 KB, 66 table-data entries) + counts + per-table value fingerprints.
2. Stage 1 `prisma db execute` + `migrate resolve --applied` → only enforce pending.
3. Stage 2 dry run → 1 account resolved case-insensitively, every row "N of N"; execute → all 13 tables `identical`; rerun → zero changes.
4. Stage 3 `prisma migrate deploy` → applied.
5. Counts before = after; **fingerprints before = after** (md5 over every row excluding `user_id`).
6. `verify.sql`: 0 nullable owned `user_id`, 0 foreign-owned rows, library ownerless, 1 profile, 20 + 15 triggers, 0 tables without RLS, 0 policies, per-user indexes only, `anon` cannot execute the trigger functions.
7. Production build against the stack; browser smoke test with the migrated account + two temporary accounts: **23/23 pass**. The original account's data renders everywhere, including progression on a shared exercise; library detail has no Archive control (375 px); the second account sees an empty app, and the first account's mesocycle/workout/custom-exercise URLs give "We couldn't find that page.", identical to a random id; the third account can't see the second's gym; zero page errors. Temporary accounts and their rows were removed and the original account's password hash restored byte-for-byte. The local dev DB stays at the enforced schema (intended); the pre-ownership dump was kept in the run's scratchpad.

**Throwaway databases (integration suite):** legacy → expand → assign → enforce is value-identical; enforce refuses, atomically, an incomplete backfill and pre-existing cross-account references; the chain applies cleanly to an empty database. **Prisma's runner is atomic per migration** (empirical check: a failure injected at the very end of enforce left no NOT NULL, CHECK, trigger, or index change and recorded the migration as failed).

**Production-copy rehearsal:** not performed by the run. It needs the production connection string, which the run may not use (stop condition 3). It is runbook §2, a required human step before §3.

## 5. Resolved Decisions (made on the owner's behalf)

All are recorded with rationale and authority in the spec's `## Resolved Decisions` (R1–R25). Summary:

- **R1** Controlling planning docs = the owner's approved multi-user set in `Downloads/` (dated 2026-10-13, issued with the byte-identical governing `.claude/CLAUDE.md`), not the stale single-user `docs/planning/`.
- **R2** `userId` on every owned model → `profiles.user_id` (Restrict); no FK to `auth.users`.
- **R3** Scoped layer = DMMF-driven Prisma query extension in `src/lib/data`, surfaced as `Account { userId, timeZone, db }`; writes `(account, input, tx?)`.
- **R4–R7** Intersect-not-replace scoping; owner immutable; library ∪ own reads, own-only writes; nested writes and Exercise back-relation traversal refused; raw SQL only in `src/lib/data`.
- **R8** "Static check in CI" = ESLint + unit guards (the repo has no CI service).
- **R9** (amended in OVE-36) Identity only from `requireAccount()`; outside the data layer `userId` appears only as `account.userId` (Prisma's create input requires it).
- **R10** Foreign ≡ nonexistent on every path.
- **R11** Re-scoped the two global uniqueness rules; reviewed all others.
- **R12** Favorites → `ExerciseFavorite`; `exercises.is_favorite` kept unused (no destructive drop).
- **R13** Library read-only; legacy library archives untouched.
- **R14** DB second layer (triggers, CHECK, NOT NULL, FKs); composite FKs rejected (two `SET NULL` relations).
- **R15–R16** Staged apply (db execute + resolve → backfill → migrate deploy); backfill as an operator script.
- **R17–R18** Profile zone required, names nullable, lazy UTC profile; zone is the sole "today" authority, cookie retired.
- **R19** Real-plan import targets `--account-email`.
- **R20** Five tickets; **R21** local-stack rehearsal, prod-copy rehearsal is human; **R22** stand-in `auth.users` in tests; **R23** migration atomicity (verified, no explicit transaction control needed); **R24** stop before `main`.
- **R25** (amended in OVE-40) Stage names `9_account_ownership_1_expand` / `9_account_ownership_2_enforce`: Prisma orders migrations lexicographically, so `10_…` would run before `1_…`.

## 6. Code review and audit dispositions

Review: `code-review` skill (high effort) on #49. Nine inline comments plus one body finding were posted as [review 5573493056](https://github.com/troyrhodes02/overload-training/pull/49#pullrequestreview-5573493056); the [audit](https://github.com/troyrhodes02/overload-training/pull/49#issuecomment-6270327159) was posted to the PR. (The skill printed its findings instead of posting them, so the run posted them itself.)

| # | Finding | Disposition | Resolution |
| - | ------- | ----------- | ---------- |
| 1 | `_count: true` on the shared Exercise bypasses the traversal guard (cross-account counts) | **Implement** | Confirmed empirically (3 forms allowed); now refused; unit cases |
| 2 | Static check only matches the exact `@/lib/db` alias | **Implement** | Confirmed (relative + dynamic import passed lint); ESLint + unit guard now catch every spelling and `new PrismaClient` |
| 3 | Scoped favorite upsert isn't native → concurrent stars race (P2002) | **Implement** | `createMany({ skipDuplicates })`; 5-way concurrency test |
| 4 | Operator error messages repeat the email (Personal data) | **Implement** | Neutral wording; test asserts the email never appears |
| 5 | Duplicate account-by-email lookup in two operator tools | **Implement** | `scripts/operator/resolve-account.ts` shared |
| 6 | Duplicate `isUniqueViolation` | **Implement** | One structural helper in `src/lib/actions/result.ts`; unit test with real Prisma errors |
| 7 | Schema comments cite a nonexistent "migration 10" | **Implement** | Now name `9_account_ownership_2_enforce` |
| 8 | `ExerciseFavorite` missing from the Architecture data model | **Defer** | Upstream amendment (§8) |
| 9 | Root `CLAUDE.md` still single-user; contradicts code + `.claude/CLAUDE.md` | **Defer** | **Pre-merge human step** (§9) |
| 10 | Extra sequential favorites lookup per library render | **Skip** | Negligible for a small group (Architecture NFR: no optimization beyond competent practice) |

All affected checks were rerun; final results are in §3.

## 7. Near-misses (caught before any non-throwaway apply)

1. **Same-owner triggers silently allowed everything.** The first draft tested `FOUND` after `EXECUTE … INTO`, which PL/pgSQL never sets, so every insert or update passed. The data-driven test (one cross-account update per installed trigger) caught it; fixed with `GET DIAGNOSTICS … ROW_COUNT`.
2. **Migration ordering.** `10_account_ownership_enforce` sorts before `1_library_gyms_setup` in Prisma's lexicographic order, so it would have run second on any fresh database. In production (only 9 and 10 pending) it would have happened to work. My own rehearsal harness sorted numerically and hid it; it now sorts like Prisma. Fixed by renaming (R25).
3. **Duplicate migration resurrected during integration** (the old-named stage-1 directory). Caught by the zero-delta check; removed before merging #54.
4. **Transitional cross-account detection (fixed by the end state).** Between OVE-39 and OVE-40 the global goal index would let a second account's `createGoal` collide with another account's active goal. The per-account index in the enforce migration removes it; the test lives in `ownership-enforce.int.test.ts`. It never existed outside the unmerged stack.
5. **Ordering hazard for the human rollout.** If the new code runs before Stage 2, the lazy profile (UTC) makes Stage 2 refuse. The runbook deploys only after Stage 3, with recovery R3.
6. **`.env` holds production credentials** (`overload-prod`). Every database-touching command in the run overrode `DATABASE_URL`/`DIRECT_URL`/`NEXT_PUBLIC_SUPABASE_*` to the local stack; integration tests use embedded Postgres. Saved as a memory for future runs.

## 8. Required upstream amendments (not made — `docs/planning/` is read-only during a run)

1. **Commit the multi-user planning set into `docs/planning/`** (`architecture (1).md`, `prd (1).md`, `pitch-roadmap (1).md`, `product-brief (1).md` from Downloads). The repo copies are single-user.
2. **Architecture → Data Model:** add `ExerciseFavorite` (per-account favorites), and `MissedDayResolution` / `PlannedCardio` (earlier pitches' tables, also absent); note `exercises.is_favorite` is deprecated. Mirror in `.claude/CLAUDE.md`'s data-object list.
3. **PRD → Account Ownership & Isolation acceptance criteria** (requested by the pitch itself): "Every computation of today or weekday uses the acting account's stored timezone, and migration preserves the existing account's current calendar-day behavior" and "RLS remains deny-all on every application table after the ownership migration."
4. **Architecture → Open Questions:** mark "shape and location of the account-scoped data-access layer and its static check" and "the production migration runbook" as settled (spec R3, R8, R15; runbook).
5. **Skills still describe a single-user product with "no ownership column"** (`overload-spec`, `overload-design-doc`, `overload-ui-design`, `overload-ticket-worker`, `overload-review-audit`, spec references `api-conventions.md` / `testing-patterns.md`). Where they conflicted, CLAUDE.md governed, but they should be updated.
6. **Migration naming convention:** later migrations must sort after `9_account_ownership_2_enforce` in byte order (e.g. `9a_…`), or the repo should adopt a timestamp scheme.
7. **CI:** the repository has no CI service; the static checks run in lint + unit tests. Add a workflow if desired.

## 9. Outstanding human steps

1. **Before merging #49:** commit `.claude/CLAUDE.md` (the owner's uncommitted multi-user rules, never staged by the run) and retire or replace the root `CLAUDE.md`, which still says single-user and points feature code at `lib/db.ts`.
2. Review and approve #49.
3. **Production-copy rehearsal** (runbook §2) with your production data.
4. **Production rollout** (runbook §3–§6): backup → Stage 1 → Stage 2 (your email + your current `overload-tz` zone) → Stage 3 → **then** merge #49 (deploy).
5. **Production verification gate** (runbook §7): counts + fingerprints equal, `verify.sql` green, your Today/plan/history/goals unchanged, isolation check with a temporary admin-created account, then delete it. Record the date here.
6. Only after the gate: the Accounts pitch may proceed toward signup. **Signup stays disabled** until that pitch says otherwise.
7. Move OVE-36…40 to Done when #49 merges.

## 10. Open questions (undecidable by the run)

1. **Legacy library archives.** Library exercises archived in the single-user era stay globally archived (no library row is modified; no account can archive or restore library rows). Should any be un-archived? The Stage 2 dry run prints the count. (The local stack had 0.)
2. **CI service** — see amendment 7.

## 11. Deferrals

- Dropping `exercises.is_favorite` → a later deliberate migration (destructive; not named in the pitch).
- Profile editing (names, timezone), signup, password reset, SMTP, account deletion → Accounts pitch (Pitch 9).
- Review finding 10 (favorites query) → skipped, not deferred.
