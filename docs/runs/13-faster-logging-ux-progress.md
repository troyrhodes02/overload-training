# Pitch 13 — Faster Logging UX — Run Progress

Resumable state for the autonomous pipeline run. Updated at every pipeline
transition and ticket boundary. A fresh session resumes from **Current step**.

- **Slug:** `13-faster-logging-ux`
- **Linear project:** Overload V1, team `OVE`
- **Pitch document:** Linear doc `3a938d8d-d8ec-41da-a348-e6e93473834b` → `pitches/13-faster-logging-ux.md` (verbatim copy)
- **Classification:** Feature, UI-bearing (full pipeline incl. UI preview).
- **Merge behavior:** **STOP BEFORE MERGE** (run prompt mandatory gate; pitch §15; guide D1 names Faster Logging UX: "prefill changes what gets written"). Never apply migrations to production; never enable production signup.
- **Target branch:** `main` · **Feature branch:** `feat/13-faster-logging-ux` (cut from `origin/main` @ `fe34d00`, Pitch 12 merged)

## Current step

**Step 4 — Spec.**

## Authority used (read before resuming)

- Controlling planning docs: the owner's approved multi-user set in `C:\Users\wtrho\Downloads\` (`pitch-roadmap (1).md` → Pitch 13 with the three DoD criteria; `prd (1).md`; `architecture (1).md`; `product-brief (1).md`). `docs/planning/` in the repo is still single-user and is not edited (except `method-note.md`). Pipeline guide: `Downloads/overload-pipeline-prompt-guide.md` (D1 stop before merge; D3 temptations: rest timer, extra always-visible card controls, prefilling a value as if the lifter entered it).
- Governing rules: `.claude/CLAUDE.md` (multi-user; **uncommitted owner change in the working tree — never stage it**). Root `CLAUDE.md` is stale single-user. Untracked `.claude/skills/overload-onboarding/` is the owner's — never stage it. Never stage `backup-pre-ownership-20261019-1119.dump`.
- OVE-50 (memory): signup open behind `OVERLOAD_SIGNUP_OPEN`; password reset removed; no Resend/SMTP. Untouched.
- Owner feedback memory: UI previews are `.html` galleries from the skill template (not `.tsx`) — the run prompt's `-preview.tsx` path is replaced by `docs/previews/13-faster-logging-ux-preview.html`.
- Prior specs consumed: Guided Workout Logging (R50 suggested weight display-only; Decisions 9–14, 51–54), Progressive Overload Engine (R14, R29, R31, R34, R36: one weight source; gym-variable = selected gym's baseline; suggestion never prefills), method note (gym-variable = machine/cable; baseline at completion; edits never replay baselines), What's New §8 content contract.

## Environment hazards (read before running anything)

- **`.env` contains PRODUCTION (`overload-prod`) values.** For every DB/Supabase-touching command, override `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the local Supabase CLI stack (`127.0.0.1:54322` / `:54321`). Integration tests use embedded throwaway Postgres.
- Embedded test Postgres is WIN1252: migration SQL must be ASCII-only (no migration expected in this pitch).
- Integration runs: kill orphaned embedded postgres, random `TEST_PG_PORT`, wrap in `timeout`.
- Port 3200 is held by an unrelated process; ad-hoc servers use 3317.

## Pipeline status

- [x] 1. Pitch pulled + authority read
- [x] 2. Design doc — `docs/design/13-faster-logging-ux-design-doc.md` (v1.0)
- [x] 3. UI preview — `docs/previews/13-faster-logging-ux-preview.html` (.html not the run prompt .tsx; 28 frames; headless Chrome: 0 console errors, 0 non-file requests, Inter loaded, 0 phone overflow, 0 weights >600, 0 broken images; light+dark screenshots reviewed). Generator: scratchpad `preview/build.mjs` (+ `check.mjs`).
- [ ] 4. Spec — `docs/specs/13-faster-logging-ux-spec.md`
- [ ] 5. Resolved Decisions in spec
- [ ] 6. Linear milestone + issues
- [ ] 7. Feature PR
- [ ] 8. Tickets implemented
- [ ] 9. Runbook
- [ ] 10. Ticket PRs squash-merged into feature branch
- [ ] 11. Full verification + tap-count measurement
- [ ] 12. Code review (inline comments on feature PR)
- [ ] 13. Review audit
- [ ] 14. Final verification — STOP before merge
- [ ] 15. Run report

## Linear

(not yet created)

## Resolved Decisions so far

Design doc §15 lists the design-stage decisions (Last time line; "a box is a draft, a plain number is history"; one active row; reps never prefilled; focus rules; no auto-advance; correction dialog from logged rows; no tour step proposed; one significant release-note entry proposed). Carried into the spec's Resolved Decisions.

## Deferred / notes

- Found in orientation: `suggestedWeight` (src/lib/logging/queries.ts) falls back to the latest weight logged at ANY gym for a machine/cable exercise with no baseline at the selected gym — a cross-gym machine-weight assumption the pitch forbids (§9.2) and that the Guided Workout Logging / Progressive Overload Engine specs never authorised (their tables say gym-variable = the selected gym's baseline). The spec scopes it to the selected gym.
- The current card prefills EVERY unsaved row from the working weight at page load, indistinguishable from typed values; reuse after a weight change is not supported. Baseline for the tap-count "before" measurement: `main` @ `fe34d00`.
