# Foundation — Autonomous Run Progress

> Resumable state log. A fresh Claude Code session should be able to continue from this file alone. Update at every ticket boundary and pipeline-step transition.

**Run:** Overload — Pitch: Foundation (slug `01-foundation`)
**Policy:** Autonomous Pipeline Policy / stop conditions per `CLAUDE.md` + the Foundation pipeline instruction.
**Hard rule for this run:** Do **not** merge the Foundation feature branch into `main`. Leave the reviewed, green feature PR open for human verification and merge.

**Feature branch:** `feat/01-foundation`
**Feature PR:** https://github.com/troyrhodes02/overload-training/pull/1 (base `main`) — DO NOT MERGE this run.

## Linear

- **Project:** Overload V1 — `d85a1e9b-b2fe-4994-b24f-315f138415ad` (team `OVE`)
- **Milestone:** Foundation — `27502de7-190b-4238-a6d1-9bb633179478`
- **Pitch doc (Linear):** https://linear.app/overload-training/document/pitch-1-foundation-56c40bb9020e
- **Pitch doc (repo):** `pitches/01-foundation.md`

### Tickets (build order; stacked branches; blockedBy chain)

| # | ID | Title | blockedBy | Branch | PR | Status |
|---|----|-------|-----------|--------|----|--------|
| 1 | OVE-5 | Project tooling, styling system & conventions | — | feat/ove-5-foundation-tooling | [#2](https://github.com/troyrhodes02/overload-training/pull/2) | PR open, green |
| 2 | OVE-6 | Prisma schema, shared client, migration & deny-all RLS | OVE-5 | feat/ove-6-foundation-schema-rls | [#3](https://github.com/troyrhodes02/overload-training/pull/3) | PR open, green |
| 3 | OVE-7 | Integration test harness & schema/RLS invariant tests | OVE-6 | feat/ove-7-foundation-integration-tests | [#4](https://github.com/troyrhodes02/overload-training/pull/4) | PR open, green |
| 4 | OVE-8 | Supabase auth: login, sign-out, proxy & DAL | OVE-7 | feat/ove-8-foundation-auth | [#5](https://github.com/troyrhodes02/overload-training/pull/5) | PR open, green |
| 5 | OVE-9 | Protected app shell, nav, states, E2E & deploy config | OVE-8 | feat/ove-9-foundation-shell | [#6](https://github.com/troyrhodes02/overload-training/pull/6) | PR open, green |

**Status summary (all tickets implemented):** OVE-5…OVE-9 implemented on stacked branches, each with a green PR (#2→#6) targeting the previous branch. Every ticket's own checks passed (lint/typecheck/format/unit; +integration where relevant; +build/e2e/client-bundle for OVE-9). Branch stacking: `feat/01-foundation` → ove-5 → ove-6 → ove-7 → ove-8 → ove-9.

**Key implementation facts for a resuming session:**
- Prisma **7.10.0** (pinned; `latest` dist-tag is an 8.0 RC — do not use). Connection URLs live in `prisma.config.ts` (not schema). Runtime client uses `@prisma/adapter-pg` with pooled `DATABASE_URL`; CLI/migrations use `DIRECT_URL`.
- Integration tests use `embedded-postgres` (real PG18) when `TEST_DATABASE_URL` is unset; guard in `tests/integration/support/assert-test-db.ts`.
- Playwright uses **system Google Chrome** via `channel` (bundled-browser download is blocked in this env; cache has a mismatched build). `test:e2e` webServer runs `build && start -p 3100` with dummy public Supabase env.
- `export const instant = false` on `src/app/(app)/layout.tsx` (Cache Components is on).
- Deviation from OVE-9 wording: `/register` & `/signup` are proven to expose **no sign-up surface** (proxy bounces them to `/login`) rather than returning a bare 404, because the proxy protects all unknown unauthenticated routes. Equivalent or stronger proof.

Branch stacking: OVE-5 branches from the feature branch `feat/01-foundation`; each subsequent ticket branches from the previous ticket's branch.

## Artifacts produced

- `pitches/01-foundation.md` — pitch (pulled from Linear)
- `docs/design/01-foundation-design-doc.md` — design doc
- `docs/specs/01-foundation-spec.md` — spec incl. `## Resolved Decisions` (D1–D20)
- `docs/runs/01-foundation-progress.md` — this file
- `docs/runs/01-foundation-runbook.md` — (step 8)
- `docs/runs/01-foundation-report.md` — (step 14)

## Environment facts (verified)

- Next.js 16.4.0 (App Router). Middleware is `proxy.ts`. `cacheComponents: true` + `partialPrefetching: true` already in `next.config.ts`.
- No local Postgres server binary and Docker daemon down → integration tests use `embedded-postgres` (spiked OK: boots PG18, enforces RLS). npm registry reachable.
- Package manager: npm. gh authenticated as troyrhodes02. Repo remote: github.com/troyrhodes02/overload-training.

## Pipeline step status — COMPLETE (branch intentionally NOT merged)

- [x] 1. Context + pull pitch
- [x] 2. Design doc
- [x] 3–4. Spec + Resolved Decisions
- [x] 5. Milestone + issues + blockedBy chain (OVE-5..OVE-9)
- [x] 6. Feature PR into main — PR #1
- [x] 7. Ticket-worker per ticket (stacked PRs #2–#6)
- [x] 8. Runbook
- [x] 9–10. Squash-merged ticket PRs into feature branch + full verification (green)
- [x] 11–12. /review (3 inline findings on PR #1) + audit (all 3 IMPLEMENTED)
- [x] 13. Pushed audited branch + re-verified full suite green — **NOT merged to main** (by instruction)
- [x] 14. Report → `docs/runs/01-foundation-report.md`

**Final state:** All OVE-5..OVE-9 are **Done**; ticket PRs #2–#6 closed (squash-merged into `feat/01-foundation`). Feature PR #1 is open, green, reviewed, audited. Full suite green on the audited branch (lint, typecheck, format, unit 23, integration 10, build, e2e 3, client-bundle guard). The feature branch was intentionally **not** merged into `main`; the human completes `docs/runs/01-foundation-runbook.md`, verifies, and merges.

## Notes / decisions log

- The overload-* skill workflows are executed directly from their `SKILL.md` definitions (the skills are project files, read in full); artifacts conform to each skill's required sections.
- Resolved Decisions D1–D9 = the pre-resolved platform decisions (binding). D10–D20 resolved autonomously; rationale in the spec.
