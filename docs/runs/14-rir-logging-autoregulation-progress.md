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

**Step 6 — Linear milestone + issues.**

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
- [ ] 6. Linear milestone + issues
- [ ] 7. Feature PR
- [ ] 8. Tickets implemented
- [ ] 9. Runbook
- [ ] 10. Ticket PRs integrated
- [ ] 11. Full verification
- [ ] 12. Code review
- [ ] 13. Review audit
- [ ] 14. Final verification (stop before merge)
- [ ] 15. Run report

## Linear

(none yet)

## Resolved Decisions so far

Spec `## Resolved Decisions` R1–R29. Headline: R1 stop before merge; R3 values 0–4 (4 = 4+); R4–R6 nullable column, CHECK, no backfill; R7 folder `9f_`; R9 edit undefined=unchanged/null=clear; R10 idempotency incl. rir; R11 latest qualifying performance's planned working sets only; R12 case A; R13 case B; R14 partial coverage; R15 never touches insufficient/deload/ordinary hold; R16 never in e1RM/goals/baselines/offer/Last time line; R20–R21 reason lines (card, summary, exercise page), no new tag; R22 Radix ToggleGroup; R23 never carried; R25 AC-1 = exact 18/18.

## Deferred / notes

(none yet)
