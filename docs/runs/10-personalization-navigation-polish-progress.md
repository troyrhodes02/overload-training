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

**Step 14 — final verification + merge gate** (in progress). Expected outcome: STOP before merge (R3).

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
- [x] 6. Linear milestone + issues (blockedBy chain)
- [x] 7. Feature PR into `main` (draft, stop before merge per R3) — **#62** https://github.com/troyrhodes02/overload-training/pull/62
- [x] 8. Tickets implemented — OVE-46…49 → PRs #63–#66 (stacked), all In Review
- [x] 9. Runbook — `docs/runs/10-personalization-navigation-polish-runbook.md` + `docs/runs/10-sql/verify-appearance.sql` (rehearsed on the local stack)
- [x] 10. Ticket PRs squash-merged into the feature branch in order — #63 `d4e3a79`, #64 `953485d`, #65 `ac55966`, #66 `63a4cfb`. Each: retarget → merge feature branch into ticket branch (one conflict, app-shell.tsx on #64, resolved with the ticket superset) → delta vs ticket tip = runbook/progress/10-sql only → Vercel pass → squash. Final feature tree == OVE-49 tip. (#63 was squashed before its Vercel check finished — a wait-loop bug; the check then passed.)
- [x] 11. Full verification on `63a4cfb`: prettier, lint, tsc, prisma validate + local migrate status up to date; unit 42/727 (clean env; 12 consecutive green runs); integration 34/422 (isolation, history integrity, RLS, schema, guards); build (local env + invite code + service key) + verify:client-bundle OK; accounts e2e 13/13 (local DB unchanged 1/1/463); default e2e 26/26. Visual vs preview done on code identical to the final tree (only tests changed after OVE-48). Pre-existing env-sensitive test: tests/unit/import-target-and-images.test.ts:108 fails only when NEXT_PUBLIC_SUPABASE_URL is exported in the shell (not a regression; deferred note).
- [x] 12. Code review — `code-review` skill (high) posted 9 inline comments on #62
- [x] 13. Review audit — posted https://github.com/troyrhodes02/overload-training/pull/62#issuecomment-6282779205 : 7 implement (save ordering ×2 via src/lib/appearance/choices.ts, thrown action = failure, schema doc placement, getAccountAppearance React cache, isoDateInZone reuse, first visit = no LoggedSession AND no CardioLog via existence checks), 1 defer (fold profile fields into Account — protected chokepoint, R27), 1 skip (rail classes not dead at md+, R28). Spec v1.1.0: R7 + R17 amended, R27–R29 added. Rerun after fixes: unit 43/735, integration 34/423, build + client-bundle, accounts e2e 13/13, default e2e 26/26, local DB 1/1/463.
- [ ] 14. Final verification + merge gate
- [ ] 15. Run report

## Linear

- Milestone: **Personalization & Navigation Polish** (`c5f6a455-b36b-4701-8ff8-feef07490425`)
- Tickets (dependency order, chained via blockedBy):
  - **OVE-46** — 1: Phone navigation: header menu button + sheet, bottom bar removed, desktop rail unchanged
- **OVE-47** — `feat/ove-47-appearance` (off OVE-46) → PR **#64** (base: OVE-46 branch), commit `37c124d`. In Review. Verified: lint, typecheck, format, unit 41/669, integration 33/414, prisma validate, migration 9b applied to the LOCAL stack only (2→1 profiles see near-miss; 463 sets unchanged), build, browser appearance sequence (default System, Dark instant + reload + fresh device, System live, Light over dark device, focus back to menu button after Escape), 0 console errors.
- **OVE-48** — `feat/ove-48-greeting` (off OVE-47) → PR **#65** (base: OVE-47 branch), commit `f21349c`. In Review. Verified: lint, typecheck, format, unit 42/727, integration 34/422, build, browser first-visit greeting 375/1280 light+dark (temp account deleted; local DB 1 user / 1 profile). Note: isolation guard forbids `userId` outside the data layer except `account.userId` → greeting seed field named `accountKey` (guard not weakened).
- **OVE-49** — `feat/ove-49-personalization-e2e` (off OVE-48) → PR **#66** (base: OVE-48 branch), commit `d9d4a71`. In Review. Verified: accounts e2e 13/13 (lifecycle 7 + personalization 6; local DB unchanged 1/1/463), default e2e 26/26, lint/typecheck/format. Found a Radix timing quirk: scrim tap within ~300 ms of re-opening right after a quick close can be ignored (× and links fine; 12/12 with 300 ms wait) — test waits for the slide-in; recorded for the audit/report.
  - **OVE-47** — 2: Appearance preference: Profile.appearance + migration, Settings section, no-flash application (blockedBy OVE-46)
  - **OVE-48** — 3: Dashboard greeting (blockedBy OVE-47)
  - **OVE-49** — 4: Local-stack Personalization e2e + visual verification (blockedBy OVE-48)

### Ticket branches / PRs

- **OVE-46** — `feat/ove-46-phone-navigation` (off the feature branch) → PR **#63** (base: feature branch), commit `50dbc36`. In Review. Verified: lint, typecheck, format, unit 40/631, integration 33/407, build (local env), local-stack browser check 375/1280 light+dark with a temporary account (deleted), 0 console errors. Summary: shared nav-items.ts, shadcn Sheet, MobileNav, sticky phone header, rail classes verbatim behind `hidden md:block`, thumb bars bottom-0.

## Resolved Decisions so far

See spec `## Resolved Decisions` R1–R26. Headline: R3 stop before merge; R4 Profile.appearance enum; R6 localStorage first-paint mirror + boot script; R9 bottom bar = the pitch's "persistent sidebar"; R17 first visit derived; R23 four tickets.

## Deferred / notes

- Visual comparison vs preview (OVE-46..49): first-visit Today 375/1280 light+dark; Settings System/Dark/Light; sheet open (Today active, focus on Today); Gyms thumb bar at edge; desktop rail. All match hierarchy/copy/controls/tokens. Populated pending-workout greeting not rendered in a browser (needs an active plan on a temp account) — covered by unit tests over real DashboardDto shapes.
- **Near-miss (fixed):** a visual-check run piped to `head` was killed before its cleanup, leaving one temporary local account (`visual-1792464713703@example.test`, no data). Removed through the app's own deletion flow; local DB back to 1 auth user / 1 profile / 463 sets. Never pipe the visual scripts; capture to a log file.
- Local stack now has migration `9b_profile_appearance` applied (local only).
- Visual-check harness: scratchpad `visual.mjs` (signs up a temporary local account via invite `local-visual-check-invite-2026`, screenshots, deletes it through the app). Server: `next start -p 3317` with scratchpad `localenv.sh` sourced. Note: emulateMedia flips mid-transition (sheet uses shadcn `transition`) — set the scheme before opening the sheet for honest screenshots.
