# Library & Gyms Setup — Autonomous Run Progress

> Resumable state log. A fresh Claude Code session should be able to continue from this file alone. Updated at every ticket boundary and pipeline-step transition.

**Run:** Overload — Pitch: Library & Gyms Setup (slug `02-library-gyms-setup`)
**Policy:** Autonomous Pipeline Policy / stop conditions as restated in the run instruction (invariant weakening, contradicting an approved doc, irreplaceable-data/credential scope, unnamed destructive ops).
**Merge rule for this run:** squash-merge the feature branch into `main` **only if every required check is green** after review/audit. Never merge past a failing check.

**Feature branch:** `feat/02-library-gyms-setup` (from `main` @ `8b8def6`)
**Feature PR:** _(step 6)_

## SAFETY — read before running anything

- The local `.env` contains **production** (`overload-prod`) connection values. There is no local Supabase stack (Docker daemon is down).
- **Never** run `prisma migrate *`, `prisma db seed`, `npm run db:seed`, `npm run dev`, or `next build` with `.env` values in effect. Always export throwaway overrides first:
  `export DATABASE_URL="postgresql://none:none@127.0.0.1:1/none" DIRECT_URL="$DATABASE_URL"` (bash) before lint/typecheck/test/build/e2e. Integration tests point both at the embedded test DB themselves and refuse Supabase hosts.
- The seed refuses a non-local `DATABASE_URL` unless `OVERLOAD_IMPORT_CONFIRM_HOST` matches (spec D29). Never set that in this run.
- No production credentials, production data, or service-role key may be touched by the autonomous run.

## Linear

- **Project:** Overload V1 — `d85a1e9b-b2fe-4994-b24f-315f138415ad` (team `OVE`)
- **Milestone:** Library & Gyms Setup — `6cbb9134-58a3-4f91-8671-83585956891a`
- **Pitch doc (Linear):** https://linear.app/overload-training/document/overload-pitch-2-library-and-gyms-setup-d6f6008f659c
- Statuses available: Backlog, Todo, In Progress, Done (no "In Review"; use In Progress while a PR is open, Done when squash-merged into the feature branch).

### Tickets (build order; stacked branches; blockedBy chain)

| # | ID | Title | blockedBy | Branch | PR | Status |
|---|----|-------|-----------|--------|----|--------|
| 1 | OVE-10 | Library & Gyms data model: canonical vocabularies, Exercise classification migration, repo hygiene | — | feat/ove-10-library-data-model | — | not started |
| 2 | OVE-11 | free-exercise-db catalog import: pinned snapshot, normalization, idempotent exercise + image import | OVE-10 | feat/ove-11-catalog-import | — | not started |
| 3 | OVE-12 | Exercise Library data layer & server actions | OVE-11 | feat/ove-12-library-data-layer | — | not started |
| 4 | OVE-13 | Exercise Library UI | OVE-12 | feat/ove-13-library-ui | — | not started |
| 5 | OVE-14 | Gym Management + deliberate-absence guards | OVE-13 | feat/ove-14-gyms | — | not started |

Branch stacking: OVE-10 branches from `feat/02-library-gyms-setup`; each next ticket branches from the previous ticket branch. Ticket PRs target the previous branch (OVE-10 targets the feature branch).

## Artifacts

- `pitches/02-library-gyms-setup.md` — pitch (pulled from Linear)
- `docs/design/02-library-gyms-setup-design-doc.md` — design doc
- `docs/specs/02-library-gyms-setup-spec.md` — spec incl. `## Resolved Decisions` (D1–D19 pre-resolved; D20–D39 autonomous)
- `docs/planning/method-note.md` — canonical muscle/equipment vocabulary + source mapping (allowed planning write)
- `docs/runs/02-library-gyms-setup-progress.md` — this file
- `docs/runs/02-library-gyms-setup-runbook.md` — (step 8)
- `docs/runs/02-library-gyms-setup-report.md` — (step 14)

## Environment facts (verified 2026-10-07)

- Node 22.15.1, npm 10.9.2, Next 16.4.0, Prisma 7.10.0 (pinned; do not take `latest`). Windows; bash tool available.
- `git core.autocrlf=true` → CRLF checkouts broke Prettier; fixed by `.gitattributes` (`* text=auto eol=lf`) in OVE-10.
- `package-lock.json` was out of sync (`npm ci` failed); `npm install` re-synced it (committed in OVE-10).
- `.env.example` was git-ignored and absent → Foundation unit test failed on a fresh checkout; restored + un-ignored in OVE-10.
- free-exercise-db pinned commit `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5`, `dist/exercises.json` SHA-256 `5bb747e3fc658f095a60dcbf6d53c96627acdcc6ffb6fffde86f7e26995d40bf`, 876 records. Raw image URLs at that commit reachable (HTTP 200).
- Integration DB: embedded Postgres 18 (Foundation harness). Playwright: system Chrome (`channel: chrome`).

## Pipeline step status

- [x] 1. Context read + pitch pulled → `pitches/02-library-gyms-setup.md`
- [x] 2. Design doc
- [x] 3–4. Spec + Resolved Decisions (+ method note)
- [x] 5. Milestone + issues OVE-10..OVE-14 + blockedBy chain
- [ ] 6. Feature PR into main
- [ ] 7. Ticket-worker per ticket (stacked PRs)
- [ ] 8. Runbook
- [ ] 9. Squash-merge ticket PRs into feature branch
- [ ] 10. Full verification
- [ ] 11. /review → inline comments on feature PR
- [ ] 12. /overload-review-audit + dispositions
- [ ] 13. Push, re-verify, squash-merge feature → main (only if green)
- [ ] 14. Report

## Notes / decisions log

- The overload-* skills are executed directly from their `SKILL.md` definitions (project files read in full).
- Baseline before any change (main @ 8b8def6, after `npm install`): lint ✅; format ❌ (CRLF, env issue); unit 22/23 (`.env.example` missing).
