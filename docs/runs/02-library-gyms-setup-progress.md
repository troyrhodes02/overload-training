# Library & Gyms Setup — Autonomous Run Progress

> Resumable state log. A fresh Claude Code session should be able to continue from this file alone. Updated at every ticket boundary and pipeline-step transition.

**Run:** Overload — Pitch: Library & Gyms Setup (slug `02-library-gyms-setup`)
**Policy:** Autonomous Pipeline Policy / stop conditions as restated in the run instruction (invariant weakening, contradicting an approved doc, irreplaceable-data/credential scope, unnamed destructive ops).
**Merge rule for this run:** squash-merge the feature branch into `main` **only if every required check is green** after review/audit. Never merge past a failing check.

**Feature branch:** `feat/02-library-gyms-setup` (from `main` @ `8b8def6`)
**Feature PR:** https://github.com/troyrhodes02/overload-training/pull/7 (base `main`)

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
| 1 | OVE-10 | Library & Gyms data model: canonical vocabularies, Exercise classification migration, repo hygiene | — | feat/ove-10-library-data-model | [#8](https://github.com/troyrhodes02/overload-training/pull/8) | squash-merged → 7ccd9e4; Done |
| 2 | OVE-11 | free-exercise-db catalog import: pinned snapshot, normalization, idempotent exercise + image import | OVE-10 | feat/ove-11-catalog-import | [#9](https://github.com/troyrhodes02/overload-training/pull/9) | squash-merged → 82057a9; Done |
| 3 | OVE-12 | Exercise Library data layer & server actions | OVE-11 | feat/ove-12-library-data-layer | [#10](https://github.com/troyrhodes02/overload-training/pull/10) | squash-merged → 3f22c2d; Done |
| 4 | OVE-13 | Exercise Library UI | OVE-12 | feat/ove-13-library-ui | [#11](https://github.com/troyrhodes02/overload-training/pull/11) | squash-merged → 5a19139; Done |
| 5 | OVE-14 | Gym Management + deliberate-absence guards | OVE-13 | feat/ove-14-gyms | [#12](https://github.com/troyrhodes02/overload-training/pull/12) | squash-merged → 9efba00; Done |

Branch stacking: OVE-10 branches from `feat/02-library-gyms-setup`; each next ticket branches from the previous ticket branch. Ticket PRs target the previous branch (OVE-10 targets the feature branch).

## Status summary (after first ticket PR)

- **OVE-10 → PR #8 (green):** canonical `MuscleGroup`(16)/`Equipment`(13) vocabulary in `src/lib/exercises/taxonomy.ts` + Prisma enums; hand-written in-place migration `1_library_gyms_setup` (no DROP/RENAME/INSERT; CHECKs for primary∉secondary, distinct secondaries, provenance, custom-no-image, non-blank names; helper fn not executable by anon); schema-drift guard; repo hygiene (.gitattributes, .env.example, lockfile). Verified: lint, build+typecheck, format, unit 32, integration 21, client-bundle guard.
- **OVE-11 (catalog import):** vendored pinned snapshot (SHA verified by test), total mapping with fail-fast, idempotent `importCatalog` (createMany skipDuplicates by source_id; never updates rows; images skip-if-exists; link only on success; failures non-fatal), `prisma/seed.ts` via `tsx` (new devDependency) with remote-target guard. Verified: unit 62, integration 32, build+typecheck, lint, format, bundle guard. Seed entry smoke-tested under tsx with no DB/Supabase I/O (guards fire).
- One transient hang of the full integration run was observed once (killed after 10 min); re-runs complete in normal time. If it recurs, run `npx jest --config jest.integration.config.js --verbose` under `timeout` and kill stray `embedded-postgres` processes.

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
- [x] 6. Feature PR into main — PR #7
- [x] 7. Ticket-worker per ticket (stacked PRs #8–#12, each green)
- [x] 8. Runbook → `docs/runs/02-library-gyms-setup-runbook.md`
- [x] 9. Squash-merged #8→#12 into the feature branch via GitHub (each next PR retargeted to the feature branch; #12 needed a merge of the feature branch into its branch — add/add conflicts resolved to the OVE-14 side after verifying the feature tree was identical to OVE-13; no force-push)
- [ ] 10. Full verification
- [ ] 11. /review → inline comments on feature PR
- [ ] 12. /overload-review-audit + dispositions
- [ ] 13. Push, re-verify, squash-merge feature → main (only if green)
- [ ] 14. Report

## Notes / decisions log

- Vercel's GitHub integration builds a Preview deployment per PR (observed on #12). Runbook B3 asks the human to confirm DB env vars are Production-scoped only.
- **Merging to `main` deploys production.** The new code needs migration `1_library_gyms_setup`; until a human applies it (runbook B1), `/exercises` errors (no data risk). The report flags this as the first external step.

- The overload-* skills are executed directly from their `SKILL.md` definitions (project files read in full).
- Baseline before any change (main @ 8b8def6, after `npm install`): lint ✅; format ❌ (CRLF, env issue); unit 22/23 (`.env.example` missing).
