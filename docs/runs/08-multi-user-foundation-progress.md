# Pitch 8 — Multi-User Foundation — Run Progress

Resumable state for the autonomous pipeline run. Updated at every pipeline
transition and ticket boundary. A fresh session resumes from **Current step**.

- **Slug:** `08-multi-user-foundation`
- **Linear project:** Overload V1 (`P-OVE-1`), team `OVE`
- **Pitch document:** Linear doc `064aad1b-a72c-459e-a9d1-2c58ecc5a687` → `pitches/08-multi-user-foundation.md` (verbatim copy)
- **Classification:** Foundational, no UI surface (UI design gate skipped by the run prompt). Touches ownership, scoping, migration of irreplaceable data → **stop before merge to `main`** (run prompt). Never apply migrations to production; never enable signup.
- **Target branch:** `main` · **Feature branch:** `feat/08-multi-user-foundation` (cut from `main` @ `4376dd0`)

## Current step

Step 8 — implementing tickets (OVE-40 next).

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
- [x] 2. Design doc — `docs/design/08-multi-user-foundation-design-doc.md`
- [x] 3. UI design gate — **Skipped — no UI surface in this pitch** (run prompt; no preview created)
- [x] 4. Spec — `docs/specs/08-multi-user-foundation-spec.md`
- [x] 5. Resolved Decisions recorded in spec
- [x] 6. Linear milestone + issues (blockedBy chain)
- [x] 7. Feature PR into `main` (do not merge) — **#49**
- [ ] 8. Implement tickets (ticket worker, stacked branches)
- [ ] 9. Production runbook — `docs/runs/08-multi-user-foundation-runbook.md`
- [ ] 10. Squash-merge ticket PRs into feature branch, in order
- [ ] 11. Full verification
- [ ] 12. Code review → inline comments on feature PR
- [ ] 13. Review audit + fixes
- [ ] 14. Final verification — STOP (no merge to `main`)
- [ ] 15. Run report — `docs/runs/08-multi-user-foundation-report.md`

## Linear

- Milestone: **Multi-User Foundation** (`5360bfec-73cb-4dbc-aabf-7a5829305606`)
- Tickets (dependency order, chained via blockedBy):
  - **OVE-36** — 1: Ownership expand migration + account-scoped data layer core
  - **OVE-37** — 2: Ownership backfill operator (Stage 2) + rehearsal harness (blockedBy OVE-36)
  - **OVE-38** — 3: Scope plan, library, gyms (+ real-plan import) (blockedBy OVE-37)
  - **OVE-39** — 4: Scope logging, cardio, goals, progression + profile timezone (blockedBy OVE-38)
  - **OVE-40** — 5: Enforce ownership: migration 10, DB second layer, coverage, e2e rehearsal (blockedBy OVE-39)

### Ticket branches / PRs
(stacked: OVE-36 branches from the feature branch; each next from the previous)
- OVE-36 → branch `feat/ove-36-ownership-expand-scoped-layer` → **PR #50** (base `feat/08-multi-user-foundation`) · In Review · verified: lint, typecheck, format, unit 549, integration 327, build
- OVE-37 → branch `feat/ove-37-ownership-backfill` → **PR #51** (base `feat/ove-36-…`) · In Review · verified: lint, typecheck, format, unit 554, integration 340, build
- OVE-38 → branch `feat/ove-38-scope-plan-library-gyms` → **PR #52** (base `feat/ove-37-…`) · In Review · verified: lint, typecheck, format, unit 561, integration 358, build
- OVE-39 → branch `feat/ove-39-scope-logging-goals-cardio-progression` → PR (base `feat/ove-38-…`) · verified: lint, typecheck, format, unit 561, integration 375, build

## Resolved Decisions so far

R1–R24 are recorded in `docs/specs/08-multi-user-foundation-spec.md` → Resolved Decisions. Highlights: R1 planning-doc authority; R3 scoped layer = DMMF-driven Prisma query extension in `src/lib/data` behind `requireAccount()`; R12 favorites → `ExerciseFavorite`, `is_favorite` kept unused (no destructive drop); R13 library read-only, legacy library archives untouched; R14 DB triggers/CHECKs as layer 2; R15 staged apply (db execute + resolve for 9 → backfill → migrate deploy for 10); R18 profile zone = sole today authority, cookie retired; R21 local-stack rehearsal, prod-copy rehearsal is human.

## Run notes

- Embedded test Postgres is WIN1252: migration SQL must be ASCII-only.
- If an integration run is killed, an orphaned embedded `postgres.exe --forkchild` can hold port 5433; find it with `Get-CimInstance Win32_Process -Filter "name='postgres.exe'"` and stop it.
- Spec R9 amended in OVE-36: creates pass `userId: account.userId` (Prisma's create input requires the owner once NOT NULL).

- Wrap jest runs in `timeout` — one isolation run stalled once without reproducing.
- OVE-38 left for OVE-39: swap-picker favorite ordering still reads the deprecated `exercises.is_favorite` column (logging queries); the per-account active-mesocycle test moves to OVE-40 (needs the per-user index from migration 10).

- Integration runs: use the scratchpad `itest.sh` pattern — kill orphaned embedded postgres, set a random `TEST_PG_PORT`, wrap in `timeout`.
- OVE-39 → OVE-40 hand-offs: (1) two accounts each with an ACTIVE mesocycle and (2) two accounts each with an active goal on the same library exercise both need migration 10's per-account indexes. Until then the global goal index lets B's createGoal hit P2002 on A's goal and answer "already has an active goal" — a transitional cross-account detection that OVE-40 removes (test lives in ownership-enforce). The logging isolation tests use a DRAFT plan for B for the same reason.

## Deferred / flagged

- Upstream: commit multi-user planning docs to `docs/planning/`; replace root `CLAUDE.md`; update skills that still say "single-user / no ownership column" (`overload-spec`, `overload-design-doc`, `overload-ui-design`, api-conventions, testing-patterns).
