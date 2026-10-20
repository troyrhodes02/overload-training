# Pitch 11 — Onboarding Tour — Run Progress

Resumable state for the autonomous pipeline run. Updated at every pipeline
transition and ticket boundary. A fresh session resumes from **Current step**.

- **Slug:** `11-onboarding-tour`
- **Linear project:** Overload V1, team `OVE`
- **Pitch document:** Linear doc `a4dd8ae6-8faf-4407-8f56-5ab2331e4e3b` → `pitches/11-onboarding-tour.md` (verbatim copy)
- **Classification:** Feature, UI-bearing (full pipeline incl. UI preview).
- **Merge behavior:** run prompt says merge on green "following the pipeline guide's merge-behavior rules". Guide D1 lists Onboarding Tour as merge-on-green "unless the pitch text trips the rule", and says stop when a pitch "changes schema on tables that hold user data". Per-account tour progress needs a new owned table (`TourProgress`, in the architecture data model) → expected: **stop before merge** (decided in the spec; same reasoning as Pitch 10 R3 — code that reads a table production does not have yet cannot deploy before the human-applied migration). Never apply migrations to production; never enable production signup.
- **Target branch:** `main` · **Feature branch:** `feat/11-onboarding-tour` (cut from `origin/main` @ `b3703f5`)

## Current step

**Step 8 — implementing OVE-52** (OVE-51 done → PR #69).

## Authority used (read before resuming)

- Controlling planning docs: the owner's approved multi-user set (standing Pitch 8 R1) in `C:\Users\wtrho\Downloads\`: `architecture (1).md`, `prd (1).md`, `pitch-roadmap (1).md`, `product-brief (1).md` (2026-10-13). Pipeline guide: `Downloads/overload-pipeline-prompt-guide.md` (D1 merge rule, D2 standing resolutions — tour: existing accounts treated as already offered, shadcn primitives only; D3 temptations; D4 invariant tests — every tour step's anchor exists at phone and desktop widths). `docs/planning/` is still single-user and is not edited (except `method-note.md`, if needed).
- Governing rules: `.claude/CLAUDE.md` (multi-user; **uncommitted owner change in the working tree — never stage it**). Root `CLAUDE.md` is stale single-user. Untracked `.claude/skills/overload-onboarding/` is the owner's — never stage it.
- Never stage `backup-pre-ownership-20261019-1119.dump` (repo root, if present).
- OVE-50 (memory): signup is open behind `OVERLOAD_SIGNUP_OPEN`, no invite code; CLAUDE.md invite wording is stale. Password reset removed (no email). Do not touch either.
- Owner feedback memory: UI previews are `.html` galleries from the skill template (not `.tsx`) — the run prompt's `-preview.tsx` path is replaced by `docs/previews/11-onboarding-tour-preview.html`.
- `/overload-onboarding`: What's New has not shipped → availability rule: do nothing; no guidance ticket.

## Environment hazards (read before running anything)

- **`.env` contains PRODUCTION (`overload-prod`) values.** For every DB/Supabase-touching command, override `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the local Supabase CLI stack (`127.0.0.1:54322` / `:54321`). Integration tests use embedded throwaway Postgres.
- Embedded test Postgres is WIN1252: migration SQL must be ASCII-only.
- Integration runs: kill orphaned embedded postgres, random `TEST_PG_PORT`, wrap in `timeout`.
- Migrations sort lexicographically: the new migration must sort after `9c_profile_username` (e.g. `9d_…`).
- Port 3200 is held by an unrelated process; ad-hoc servers use 3317.
- Never pipe a browser-check script to `head` (kills cleanup; Pitch 10 near-miss).

## Pipeline status

- [x] 1. Pitch pulled + authority read
- [x] 2. Design doc — `docs/design/11-onboarding-tour-design-doc.md` (v1.0)
- [x] 3. UI preview — `docs/previews/11-onboarding-tour-preview.html` (.html not the run prompt .tsx; 23 frames; headless Chrome: 0 console errors, 0 non-file requests, Inter loaded, 0 phone overflow, 0 weights >600, 0 cards over their target; light+dark screenshots reviewed). Generator: scratchpad `preview/build.mjs` (+ `check.mjs`, `measure.mjs`).
- [x] 4. Spec — `docs/specs/11-onboarding-tour-spec.md` (v1.0.0; migration `9d_tour_progress`)
- [x] 5. Resolved Decisions recorded in spec (R1–R32). Key: R3 stop before merge (new owned table + backfill + deletion module; production migration must precede deploy, guide D1)
- [x] 6. Linear milestone + issues (blockedBy chain)
- [x] 7. Feature PR into `main` (draft, stop before merge per R3) — **#68** https://github.com/troyrhodes02/overload-training/pull/68
- [ ] 8. Tickets implemented
- [ ] 9. Runbook
- [ ] 10. Ticket PRs integrated
- [ ] 11. Verification
- [ ] 12. Code review
- [ ] 13. Review audit
- [ ] 14. Final verification + merge gate
- [ ] 15. Run report

## Linear

- Milestone: **Onboarding Tour** (`5b7e781d-380b-44d9-a557-29373630d873`)
- Tickets (dependency order, chained via blockedBy):
  - **OVE-51** — 1: Tour progress persistence (model, migration 9d, progress module + actions, deletion + isolation)
  - **OVE-52** — 2: Guided tour UI (registry, engine, provider/overlay, anchors, Settings replay) (blockedBy OVE-51)
  - **OVE-53** — 3: Local-stack tour e2e + D4 anchors + visual verification (blockedBy OVE-52)

### Ticket branches / PRs

- **OVE-51** — `feat/ove-51-tour-progress` (off the feature branch) → PR **#69** (base: feature branch), commit `f495858`. In Review. Verified: prettier, lint, tsc, prisma validate, unit 44/768, integration 37/453, build (local env) + client-bundle, migration 9d applied to the LOCAL stack only (tour_progress 0 rows, RLS on, 0 policies, 463 sets unchanged, anon Data API refused). **Spec amended to v1.1.0 (R6):** backfill INSERT dropped (invariant-guards forbids INSERT in migrations) → new accounts made due by `establishProfile`; older accounts have no row.

## Resolved Decisions so far

See spec `## Resolved Decisions` R1–R32. Headline: R3 stop before merge; R4 TourProgress PK userId; R5 auto-start = no row; R6 9d backfills NULL-outcome rows; R8 offer spent on first show; R9 registry `src/lib/tour/steps.ts`; R10 availability rule; R14 Dialog, no dependency; R16 sheet never opened.

## Deferred / notes

- Layout wiring of `getTourAutoStart` moved from OVE-51 to OVE-52 (an unused prop would fail lint).
- Scratchpad helpers: `localenv.sh` (local-stack env; refuses non-127.0.0.1), `preview/*`.
