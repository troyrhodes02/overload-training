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
| 1 | OVE-5 | Project tooling, styling system & conventions | — | feat/ove-5-foundation-tooling | TBD | not started |
| 2 | OVE-6 | Prisma schema, shared client, migration & deny-all RLS | OVE-5 | feat/ove-6-foundation-schema-rls | TBD | not started |
| 3 | OVE-7 | Integration test harness & schema/RLS invariant tests | OVE-6 | feat/ove-7-foundation-integration-tests | TBD | not started |
| 4 | OVE-8 | Supabase auth: login, sign-out, proxy & DAL | OVE-7 | feat/ove-8-foundation-auth | TBD | not started |
| 5 | OVE-9 | Protected app shell, nav, states, E2E & deploy config | OVE-8 | feat/ove-9-foundation-shell | TBD | not started |

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

## Pipeline step status

- [x] 1. Context + pull pitch
- [x] 2. Design doc
- [x] 3–4. Spec + Resolved Decisions
- [x] 5. Milestone + issues + blockedBy chain (OVE-5..OVE-9)
- [ ] 6. Feature PR into main
- [ ] 7. Ticket-worker per ticket (stacked PRs)
- [ ] 8. Runbook
- [ ] 9–10. Squash-merge ticket PRs into feature branch + full verification
- [ ] 11–12. /review + /overload-review-audit (apply findings)
- [ ] 13. Push audited branch + re-verify (DO NOT MERGE)
- [ ] 14. Report

## Notes / decisions log

- The overload-* skill workflows are executed directly from their `SKILL.md` definitions (the skills are project files, read in full); artifacts conform to each skill's required sections.
- Resolved Decisions D1–D9 = the pre-resolved platform decisions (binding). D10–D20 resolved autonomously; rationale in the spec.
