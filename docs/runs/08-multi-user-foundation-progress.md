# Pitch 8 — Multi-User Foundation — Run Progress

Resumable state for the autonomous pipeline run. Updated at every pipeline
transition and ticket boundary. A fresh session resumes from **Current step**.

- **Slug:** `08-multi-user-foundation`
- **Linear project:** Overload V1 (`P-OVE-1`), team `OVE`
- **Pitch document:** Linear doc `064aad1b-a72c-459e-a9d1-2c58ecc5a687` → `pitches/08-multi-user-foundation.md` (verbatim copy)
- **Classification:** Foundational, no UI surface (UI design gate skipped by the run prompt). Touches ownership, scoping, migration of irreplaceable data → **stop before merge to `main`** (run prompt). Never apply migrations to production; never enable signup.
- **Target branch:** `main` · **Feature branch:** `feat/08-multi-user-foundation` (cut from `main` @ `4376dd0`)

## Current step

Step 2 — design doc.

## Authority used (read before resuming)

- **Controlling planning docs are NOT the repo copies.** `docs/planning/*` in the repo is still the single-user MVP 1 set. The approved multi-user set (which the pitch traces to — PRD "Account Ownership & Isolation", Architecture "Ownership"/"Profile"/"Authorization", Roadmap "Pitch 8") exists only as the owner's downloads, dated 2026-10-13, alongside a byte-identical copy of the governing `.claude/CLAUDE.md`:
  - `C:\Users\wtrho\Downloads\architecture (1).md`
  - `C:\Users\wtrho\Downloads\prd (1).md`
  - `C:\Users\wtrho\Downloads\pitch-roadmap (1).md`
  - `C:\Users\wtrho\Downloads\product-brief (1).md`
  Resolved Decision R1 treats these as controlling; `docs/planning/` is not edited during the run (policy). Upstream amendment: commit them into `docs/planning/`.
- Governing rules: `.claude/CLAUDE.md` (multi-user; **uncommitted owner change on `main`'s working tree — never stage it**). The root `CLAUDE.md` is the stale single-user version (amendment).

## Environment hazards (read before running anything)

- **`.env` contains PRODUCTION (`overload-prod`, ref `ycxvdiklpefyhdclxyau`) connection values.** Never run a command that reads `.env` and connects (Prisma CLI, `next dev`, `db:seed`, `import:plan`, backfill CLI) without explicitly overriding `DATABASE_URL`/`DIRECT_URL`/`NEXT_PUBLIC_SUPABASE_*` to the local stack. Never dump or read production.
- Local dev environment = Supabase CLI stack (`supabase_db_overload` on `127.0.0.1:54322`, API `127.0.0.1:54321`). Integration tests use an embedded throwaway Postgres (never Supabase).
- Production-copy rehearsal needs production credentials → human runbook step. The run rehearses on real-shaped data locally.

## Pipeline status

- [x] 1. Pitch pulled + authority read
- [ ] 2. Design doc — `docs/design/08-multi-user-foundation-design-doc.md`
- [x] 3. UI design gate — **Skipped — no UI surface in this pitch** (run prompt; no preview created)
- [ ] 4. Spec — `docs/specs/08-multi-user-foundation-spec.md`
- [ ] 5. Resolved Decisions recorded in spec
- [ ] 6. Linear milestone + issues (blockedBy chain)
- [ ] 7. Feature PR into `main` (do not merge)
- [ ] 8. Implement tickets (ticket worker, stacked branches)
- [ ] 9. Production runbook — `docs/runs/08-multi-user-foundation-runbook.md`
- [ ] 10. Squash-merge ticket PRs into feature branch, in order
- [ ] 11. Full verification
- [ ] 12. Code review → inline comments on feature PR
- [ ] 13. Review audit + fixes
- [ ] 14. Final verification — STOP (no merge to `main`)
- [ ] 15. Run report — `docs/runs/08-multi-user-foundation-report.md`

## Linear

(not yet created)

## Resolved Decisions so far

- **R1** — Controlling planning docs are the owner's multi-user set in Downloads (see above), not the stale repo copies. Authority: the approved pitch traces to them; `.claude/CLAUDE.md` (byte-identical to the same download batch) names them.

## Deferred / flagged

- Upstream: commit multi-user planning docs to `docs/planning/`; replace root `CLAUDE.md`; update skills that still say "single-user / no ownership column" (`overload-spec`, `overload-design-doc`, `overload-ui-design`, api-conventions, testing-patterns).
