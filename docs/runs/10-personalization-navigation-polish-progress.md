# Pitch 10 — Personalization & Navigation Polish — Run Progress

Resumable state for the autonomous pipeline run. Updated at every pipeline
transition and ticket boundary. A fresh session resumes from **Current step**.

- **Slug:** `10-personalization-navigation-polish`
- **Linear project:** Overload V1, team `OVE`
- **Pitch document:** Linear doc `cf247f11-4bb1-426f-989a-4d3038c5dc29` → `pitches/10-personalization-navigation-polish.md` (verbatim copy)
- **Classification:** Feature, UI-bearing (full pipeline incl. UI preview).
- **Merge behavior:** run prompt says merge on green "following the pipeline guide's merge-behavior rules". Guide D1: stop before merge when a pitch "changes schema on tables that hold user data". Per-account appearance needs a new `profiles` column → **expected: stop before merge** (decided in the spec, R-number recorded there). Never apply migrations to production; never enable production signup.
- **Target branch:** `main` · **Feature branch:** `feat/10-personalization-navigation-polish` (cut from `origin/main` @ `908fdea`)

## Current step

**Step 6 — Linear milestone + tickets** (in progress).

## Authority used (read before resuming)

- Controlling planning docs: the owner's approved multi-user set (standing Pitch 8 R1) in `C:\Users\wtrho\Downloads\`: `architecture (1).md`, `prd (1).md`, `pitch-roadmap (1).md`, `product-brief (1).md` (2026-10-13). Pipeline guide: `Downloads/overload-pipeline-prompt-guide.md` (Appendix D1 merge rule, D2 standing resolutions, D3 temptations, D4 invariant tests). `docs/planning/` in the repo is still single-user and is not edited (except `method-note.md`, if needed).
- Governing rules: `.claude/CLAUDE.md` (multi-user; **uncommitted owner change in the working tree — never stage it**). Root `CLAUDE.md` is stale single-user.
- Never stage `backup-pre-ownership-20261019-1119.dump` (repo root).
- Standing resolutions adopted (guide D2, bucket C): greeting = deterministic pick seeded by account + local date; late-night variant 21:00–04:00 local when a planned workout is unlogged; appearance stored on the account, System default.
- Owner feedback memory: UI previews are `.html` galleries from the skill template (not `.tsx`) — the run prompt's `-preview.tsx` path is replaced by `docs/previews/10-personalization-navigation-polish-preview.html` (as Pitch 9 R18).

## Environment hazards (read before running anything)

- **`.env` contains PRODUCTION (`overload-prod`) values.** For every DB/Supabase-touching command, override `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the local Supabase CLI stack (`127.0.0.1:54322` / `:54321`). Integration tests use embedded throwaway Postgres.
- Embedded test Postgres is WIN1252: migration SQL must be ASCII-only.
- Integration runs: kill orphaned embedded postgres, random `TEST_PG_PORT`, wrap in `timeout`.
- Migrations sort lexicographically: a new migration must sort after `9_account_ownership_2_enforce` (e.g. `9b_…`).
- Port 3200 is held by an unrelated process; ad-hoc servers use 3317.

## Pipeline status

- [x] 1. Pitch pulled + authority read
- [x] 2. Design doc — `docs/design/10-personalization-navigation-polish-design-doc.md` (v1.0)
- [x] 3. UI preview — `docs/previews/10-personalization-navigation-polish-preview.html` (.html not the run prompt .tsx; 34 frames; headless Chrome: 0 console errors, 0 non-file requests, Inter loaded, 0 phone overflow, 0 weights >600; light+dark screenshots reviewed). Generator: scratchpad `preview/build.mjs`.
- [x] 4. Spec — `docs/specs/10-personalization-navigation-polish-spec.md` (v1.0.0; migration `9b_profile_appearance`)
- [x] 5. Resolved Decisions recorded in spec (R1–R26). Key: R3 stop before merge (profiles schema change, guide D1)
- [ ] 6. Linear milestone + issues
- [ ] 7. Feature PR
- [ ] 8. Tickets implemented
- [ ] 9. Runbook
- [ ] 10. Ticket PRs integrated
- [ ] 11. Full verification
- [ ] 12. Code review
- [ ] 13. Review audit
- [ ] 14. Final verification + merge gate
- [ ] 15. Run report

## Linear

(not created yet)

## Resolved Decisions so far

(recorded in the spec once written)

## Deferred / notes

- none yet
