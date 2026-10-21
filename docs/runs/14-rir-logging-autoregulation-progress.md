# Pitch 14 — RIR Logging & Autoregulation — Run Progress

Resumable state for the autonomous pipeline run. Updated at every pipeline
transition and ticket boundary. A fresh session resumes from **Current step**.

- **Slug:** `14-rir-logging-autoregulation`
- **Linear project:** Overload V1, team `OVE`
- **Pitch document:** Linear doc `24ce6a7a-4b5a-4dd7-92e8-cdd99cd771f2` → `pitches/14-rir-logging-autoregulation.md` (verbatim copy)
- **Classification:** Feature, UI-bearing (full pipeline incl. UI preview).
- **Merge behavior:** **STOP BEFORE MERGE** (run prompt mandatory gate; pitch §15; guide D1 names RIR Logging: "it adds to the set write"). Never apply migrations to production; never modify production data; never enable production signup.
- **Target branch:** `main` · **Feature branch:** `feat/14-rir-logging-autoregulation` (cut from `origin/main` @ `003d72c`, Pitch 13 merged)

## Current step

**Step 12 — code review on #81.**

## Authority used (read before resuming)

- Controlling planning docs: the owner's approved multi-user set in `C:\Users\wtrho\Downloads\` (`pitch-roadmap (1).md` → Pitch 14 with three DoD criteria; `prd (1).md` (RIR is only named as planned work, §line 246); `architecture (1).md`; `product-brief (1).md`). `docs/planning/` in the repo is still single-user and is not edited (except `method-note.md`). Pipeline guide: `Downloads/overload-pipeline-prompt-guide.md` (D1 stop before merge; D3 temptations: an opaque or learned autoregulation model, backfilling RIR on past sets, making RIR required).
- Governing rules: `.claude/CLAUDE.md` (multi-user; **uncommitted owner change in the working tree — never stage it**). Root `CLAUDE.md` is stale single-user. Untracked `.claude/skills/overload-onboarding/` is the owner's — never stage it. Never stage `backup-pre-ownership-20261019-1119.dump`.
- OVE-50 (memory): signup open behind `OVERLOAD_SIGNUP_OPEN`; password reset removed; no Resend/SMTP. Untouched.
- Owner feedback memory: UI previews are `.html` galleries from the skill template (not `.tsx`) — the run prompt's `-preview.tsx` path is replaced by `docs/previews/14-rir-logging-autoregulation-preview.html`.
- Prior specs consumed: Progressive Overload Engine (`docs/specs/05-…`; constants in `src/lib/progression/config.ts`), Guided Workout Logging (`04-…`: single write path, edit = weight/reps only, no baseline replay), Faster Logging UX (`13-…`; method note "Set entry and tap-count method": a new card control belongs on the active row only; tap-count method), What's New §8 content contract.

## Environment hazards (read before running anything)

- **`.env` contains PRODUCTION (`overload-prod`) values.** For every DB/Supabase-touching command, override `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the local Supabase CLI stack (`127.0.0.1:54322` / `:54321`). Integration tests use embedded throwaway Postgres.
- Embedded test Postgres is WIN1252: migration SQL must be ASCII-only.
- Integration runs: kill orphaned embedded postgres, random `TEST_PG_PORT`, wrap in `timeout`.
- Port 3200 is held by an unrelated process; ad-hoc servers use 3317.

## Pipeline status

- [x] 1. Pitch pulled + authority read
- [x] 2. Design doc — `docs/design/14-rir-logging-autoregulation-design-doc.md` (v1.0). Rules: values 0–4+ (unset default, never carried); RIR read from the latest qualifying performance's planned working sets only; case A = would-be Progress + any working set at 0 RIR → Hold with reason; case B = `Hold — trend flat` + every working set ≥ 2 RIR → Progress with reason; deload/insufficient/ordinary hold/scheduled deload/baselines/e1RM untouched; AC-1 = zero added taps/keystrokes with RIR unset (18/18).
- [x] 3. UI preview — `docs/previews/14-rir-logging-autoregulation-preview.html` (.html not the run prompt's .tsx; 33 frames, 8 sections; headless Chrome: 0 console errors, 0 non-file requests, Inter loaded, 0 phone overflow, 0 weights >600, 0 broken images; light+dark screenshots reviewed). Generator: scratchpad `preview/build.mjs` (+ `check.mjs`, run from the repo root).
- [x] 4. Spec — `docs/specs/14-rir-logging-autoregulation-spec.md` (v1.0.0). Migration `9f_logged_set_rir` (nullable `rir` INT + CHECK 0..4); engine `evaluateReactiveDecision` (base ladder unchanged + cases A/B, `rirEffect`); constants `RIR_AT_LIMIT=0`, `RIR_TO_SPARE_MIN=2`, `RIR_MAX=4`.
- [x] 5. Resolved Decisions — spec R1–R29
- [x] 6. Linear milestone + issues (OVE-62 → OVE-63 → OVE-64 → OVE-65, blockedBy chain)
- [x] 7. Feature PR into `main` (draft, stop before merge per R1) — **#81** https://github.com/troyrhodes02/overload-training/pull/81
- [x] 8. Tickets implemented — OVE-62…65 → PRs #82–#85 (stacked), all In Review
- [x] 9. Runbook — `docs/runs/14-rir-logging-autoregulation-runbook.md` + `docs/runs/14-sql/verify-rir.sql` (rehearsed on the local stack: `rir|YES|int4|(none)`, CHECK, RLS t, 0 policies, `463|0`). Migrate production BEFORE merging; never drop the column on rollback; pre-merge release-note date step.
- [x] 10. Ticket PRs squash-merged into the feature branch in order — #82 `54d5801`, #83 `af3a9d7`, #84 `a109afb`, #85 `4d04bcb`. Each: retarget to the feature branch → merge the feature branch into the ticket branch (conflicts only where the stacked branch and the squash both added/changed the same files; the ticket side kept) → tree identical to the reviewed ticket tip, delta vs feature = that ticket only → Vercel pass → squash. Final feature tree == OVE-65 tip. No force-push.
- [x] 11. Full verification on `50a3579`: prettier, lint, tsc, prisma validate; prisma/ diff vs main = migration 9f + schema only; local `migrate status` up to date; unit 60/977; integration 44/527 (standing invariants green: history-integrity, logging, bodyweight-logging, gyms, progression, goals, rls, schema, every isolation/*, guards incl. RIR guards); accounts e2e 33 passed + 1 skipped (AC-1 RIR unset 18 taps/18 keys exact; RIR-last 22/18; RIR-every 29/18; AC-3 end to end; History correct/clear; whats-new once; tour 8); default e2e 26/26; client-bundle OK; baselines.ts, e1rm.ts, goals, tour, release-note components/catalog, set-entry.ts unchanged vs main; local DB 3/2/463/0 rir/0 release_seen after. Preview fidelity: card 375 light/dark, 320 (R30 fix), dialog, History, summary, exercise page 375 and 1280 dark, What's New dialog 375 light / 1280 dark — reviewed.
- [ ] 12. Code review
- [ ] 13. Review audit
- [ ] 14. Final verification (stop before merge)
- [ ] 15. Run report

## Linear

- Milestone: **RIR Logging & Autoregulation** (`b1e44534-261a-4fb1-a444-ff0880d639d5`)
- Tickets (dependency order, chained via blockedBy):
  - **OVE-62** — 1: logged-set RIR — migration 9f, canonical write + edit, read DTOs
  - **OVE-63** — 2: RIR-aware progression — evaluateReactiveDecision (A/B), rirEffect DTOs, reason lines (blockedBy OVE-62)
  - **OVE-64** — 3: RIR picker on card, dialog, History; e2e + tap count; method note (blockedBy OVE-62, OVE-63)
  - **OVE-65** — 4: user guidance via /overload-onboarding (blockedBy OVE-62, OVE-63, OVE-64)

### Ticket branches / PRs

- **OVE-62** — `feat/ove-62-logged-set-rir` (off the feature branch) → PR **#82** (base: feature branch). In Review. Commit `28f7269`. Verified: prettier, lint, tsc, unit 58/939, integration 43/517 (new `rir-logging.int.test.ts`, `rir-migration.int.test.ts`; `isolation/logging` extended), build (local env) + client-bundle OK, prisma validate. Local stack migrated with `prisma migrate deploy` (local only): 463 sets, 0 with rir. Summary: nullable `LoggedSet.rir` + CHECK 0..4 (migration 9f, no backfill); `logSet` stores it in the same write, idempotency includes it; `editLoggedSet` undefined=unchanged / null=clear; DTOs carry `rir`; engine untouched.
- **OVE-63** — `feat/ove-63-rir-progression` (off OVE-62) → PR **#83** (base: OVE-62 branch). In Review. Commit `9eeb55c`. Verified: prettier, lint, tsc, unit 59/967 (new `progression-rir.test.ts` incl. 500-history no-RIR regression sweep; card reason-line tests), integration 44/527 (new `progression-rir.int.test.ts`; isolation/logging +1), build (local env) + client-bundle OK. Summary: `evaluateReactiveDecision` = unchanged ladder + case A/B, `rirEffect` on every progression DTO, `rir-copy.ts`, reason line on card / summary / exercise page. Summary and exercise-page reason lines are async server components, so their render is verified by OVE-64's e2e (not unit).
- **OVE-64** — `feat/ove-64-rir-logging-ui` (off OVE-63) → PR **#84** (base: OVE-63 branch). In Review. Commit `07c0191`. Verified: prettier, lint, tsc, unit 60/977 (new `rir-picker.test.tsx`; card RIR tests; control-count accounting), integration 44/527, accounts e2e 33 passed + 1 skipped (new `rir-logging.spec.ts` 4 tests: last-set 22/18, every-set 29/18, History correct/clear, AC-3 end to end; faster-logging asserts exactly 18/18 and chip sizes at 375/320), default e2e 26/26, production build (accounts webServer) + client-bundle OK; local DB 3/2/463/0 after. Browser screenshots reviewed: card 375 light/dark, 320 (overflow found → R30), dialog, History, summary, exercise page. Method note entry "RIR scale and progression qualifiers".

- **OVE-65** — `feat/ove-65-guidance` (off OVE-64) → PR **#85** (base: OVE-64 branch). In Review. Commit `143750c`. `/overload-onboarding`: mechanisms exist (Pitches 11, 12). **Tour: no step, no copy change** (R28). **Release note:** significant `2026-10-21-reps-in-reserve` / "Reps in reserve", **provisional date**. Verified: prettier, lint, tsc, unit 60/977 (release-notes + tour 117), integration 44/527, accounts e2e 33 + 1 skipped (whats-new: dialog shows once at 375 light / 1280 dark, now listing 2 updates; tour 8 green), screenshots reviewed.

## Resolved Decisions so far

Spec `## Resolved Decisions` R1–R32 (v1.1.0 added R30 narrow layout, R31 radiogroup semantics + label, R32 control-count accounting / exact AC-1). Headline: R1 stop before merge; R3 values 0–4 (4 = 4+); R4–R6 nullable column, CHECK, no backfill; R7 folder `9f_`; R9 edit undefined=unchanged/null=clear; R10 idempotency incl. rir; R11 latest qualifying performance's planned working sets only; R12 case A; R13 case B; R14 partial coverage; R15 never touches insufficient/deload/ordinary hold; R16 never in e1RM/goals/baselines/offer/Last time line; R20–R21 reason lines (card, summary, exercise page), no new tag; R22 Radix ToggleGroup; R23 never carried; R25 AC-1 = exact 18/18.

## Deferred / notes

- Pre-existing (not this pitch): `tests/unit/invariant-guards.test.ts` ~line 293 guard "only signup asks whether a username is free" contains literal backspace bytes (0x08) where `` was intended, so it only matches the `@/lib/data/usernames` import; fixing it would flag a comment in `src/lib/data/account.ts`. Left untouched; list in the report.
- Python on Windows writes CRLF unless `newline=''` — always pass it (prettier check).
