# Pitch 15 — Smarter & Explainable Progression — Run Progress

Resumable state for the autonomous pipeline run. Updated at every pipeline
transition and ticket boundary. A fresh session resumes from **Current step**.

- **Slug:** `15-smarter-explainable-progression`
- **Linear project:** Overload V1, team `OVE`
- **Pitch document:** Linear doc `155772a8-5c74-439d-84e5-64aa67927ba0` → `pitches/15-smarter-explainable-progression.md` (verbatim copy)
- **Classification:** Feature, UI-bearing (full pipeline incl. UI preview).
- **Merge behavior:** **STOP BEFORE MERGE.** CLAUDE.md "Merge behavior: The run prompt states it. If it is silent, stop before merge" — the run prompt grants no explicit merge authority ("If merge-on-green is explicitly authorized…"); the pitch (bucket A per guide §4.2/D2 last line) proposes stop-before-merge; guide D1 "When unsure, stop". Guide D1's roadmap default for this feature is merge-on-green, so the difference is flagged in the report. Never apply migrations to production; never modify production data; never enable production signup.
- **Target branch:** `main` · **Feature branch:** `feat/15-smarter-explainable-progression` (cut from `main` @ `2ffad7d`, Pitch 14 merged)

## Current step

Step 4 — spec.

## Authority used (read before resuming)

- Controlling planning docs: the owner's approved multi-user set in `C:\Users\wtrho\Downloads\` (`pitch-roadmap (1).md` → Pitch 15, three DoD criteria; `prd (1).md`; `architecture (1).md`; `product-brief (1).md`). `docs/planning/` in the repo is single-user and is not edited (except `method-note.md`). Pipeline guide: `Downloads/overload-pipeline-prompt-guide.md` (D1; D3 temptations for this pitch: "Changing the progression rules for novelty. A recommendation that edits the plan or a stored weight").
- Governing rules: `.claude/CLAUDE.md` (multi-user; **uncommitted owner change in the working tree — never stage it**). Root `CLAUDE.md` is stale single-user. Untracked `.claude/skills/overload-onboarding/` is the owner's — never stage it. Never stage `backup-pre-ownership-20261019-1119.dump`.
- OVE-50 (memory): signup open behind `OVERLOAD_SIGNUP_OPEN`; password reset removed; no Resend/SMTP. Untouched.
- Owner feedback memory: UI previews are `.html` galleries from the skill template (not `.tsx`) — the run prompt's `-preview.tsx` path is replaced by `docs/previews/15-smarter-explainable-progression-preview.html`.
- Prior specs consumed: Progressive Overload Engine (`docs/specs/05-…`; R4–R7 thresholds, R22–R25 stall, R27–R31 suggestion sources, R32–R40 scheduled deload), RIR Logging & Autoregulation (`14-…`; cases A/B, `rirEffect`, `rir-copy.ts`), Faster Logging UX (`13-…`; card hierarchy, tap count 18/18), Guided Workout Logging (`04-…`).
- Engine facts that bound specificity: a numeric action exists ONLY for Progress on a loaded exercise with working-weight context (+`PROGRESS_INCREMENT_LBS`) and for the scheduled deload (`SCHEDULED_DELOAD_FACTOR`, floored to `LOAD_STEP_LBS`). The engine defines no reactive-deload load reduction and no bodyweight rep target.

## Environment hazards (read before running anything)

- **`.env` contains PRODUCTION (`overload-prod`) values.** For every DB/Supabase-touching command, override `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the local Supabase CLI stack (`127.0.0.1:54322` / `:54321`). Integration tests use embedded throwaway Postgres.
- Embedded test Postgres is WIN1252: migration SQL must be ASCII-only.
- Integration runs: kill orphaned embedded postgres, random `TEST_PG_PORT`, wrap in `timeout`.
- Port 3200 is held by an unrelated process; ad-hoc servers use 3317.

## Pipeline status

- [x] 1. Pitch pulled + authority read
- [x] 2. Design doc — `docs/design/15-smarter-explainable-progression-design-doc.md` (v1.0): two-line model (action + evidence), copy catalog P1–P3, H1–H4, D1, S1, N1; loads only for Progress (+5 on a known weight) and the deload week (90%); RIR named only when `rirEffect` set; "last time" vs date rule; surfaces = card, planned list (evidence on tagged rows only), day complete, exercise page.
- [x] 3. UI preview — `docs/previews/15-smarter-explainable-progression-preview.html` (.html, not the run prompt's .tsx; 27 frames, 9 sections; headless Chrome: 0 console errors, 0 non-file requests, Inter loaded, 0 phone overflow, 0 weights >600, 0 broken images; light+dark screenshots reviewed; fixes: 320px RIR wrap, full-width desktop frames, planned-list evidence on its own line). Generator: scratchpad `preview/build.mjs` + `check.mjs` (run from repo root).
- [ ] 4. Spec
- [ ] 5. Resolved Decisions
- [ ] 6. Linear milestone + issues
- [ ] 7. Feature PR
- [ ] 8. Tickets
- [ ] 9. Runbook
- [ ] 10. Integrate ticket PRs
- [ ] 11. Verification
- [ ] 12. Code review
- [ ] 13. Review audit
- [ ] 14. Final verification + merge gate (stop before merge)
- [ ] 15. Run report

## Tickets

(none yet)

## Resolved Decisions so far

- Merge: stop before merge (see header).
- Preview format: `.html` gallery (owner standard), not `.tsx`.

## Deferred / upstream amendments (running list)

- PRD: add Smarter & Explainable Progression's three completion criteria (pitch §8 traceability gap).
- Pipeline guide D1 lists this feature as merge-on-green while the pitch proposes stop-before-merge; reconcile.
- Pipeline guide Appendix C/§5 still names `-preview.tsx`.
