# Pitch 16 — Exercise History & PR Intelligence — Run Progress

Resumable state for the autonomous pipeline run. Updated at every pipeline
transition and ticket boundary. A fresh session resumes from **Current step**.

- **Slug:** `16-exercise-history-pr-intelligence`
- **Linear project:** Overload V1, team `OVE`
- **Pitch document:** Linear doc `caa8ea68-1d70-4f2d-b29b-443eda0005c7` → `pitches/16-exercise-history-pr-intelligence.md` (verbatim copy)
- **Classification:** Feature, UI-bearing (full pipeline incl. UI preview).
- **Merge behavior:** **Merge on green**, conditional. Run prompt: "Merge on green, subject to the pipeline guide's protected-boundary rules". Guide D1 lists Exercise History & PR Intelligence as merge-on-green unless the pitch trips the rule (logged-history writes, baselines, ownership/scoping, auth, RLS, schema on user-data tables). If implementation crosses any of these → STOP BEFORE MERGE. Never apply migrations to production; never modify production data; never enable production signup.
- **Target branch:** `main` · **Feature branch:** `feat/16-exercise-history-pr-intelligence` (cut from `origin/main` @ `8752e94`, Pitch 15 merged)

## Current step

**Step 4 — spec** (in progress).

## Authority used (read before resuming)

- Controlling planning docs: the owner's approved multi-user set in `C:\Users\wtrho\Downloads\` (`pitch-roadmap (1).md` → Pitch 16, three DoD criteria; `prd (1).md`; `architecture (1).md`; `product-brief (1).md`). `docs/planning/` in the repo is single-user and is not edited (except `method-note.md`). Pipeline guide: `Downloads/overload-pipeline-prompt-guide.md` (D1 merge-on-green for this feature; D3 temptations: "Confetti, streaks, or other reward styling. Comparing machine or cable PRs across gyms").
- Governing rules: `.claude/CLAUDE.md` (multi-user; **uncommitted owner change in the working tree — never stage it**). Root `CLAUDE.md` is stale single-user. Untracked `.claude/skills/overload-onboarding/` is the owner's — never stage it. Never stage `backup-pre-ownership-20261019-1119.dump`.
- OVE-50 (memory): signup open behind `OVERLOAD_SIGNUP_OPEN`; password reset removed; no Resend/SMTP. Untouched.
- Owner feedback memory: UI previews are `.html` galleries from the skill template (not `.tsx`) — the run prompt's `-preview.tsx` path is replaced by `docs/previews/16-exercise-history-pr-intelligence-preview.html`.
- Prior specs consumed: Progressive Overload Engine (`docs/specs/05-…`), Goals (`06-…`), Guided Workout Logging (`04-…`), RIR (`14-…`), Smarter & Explainable Progression (`15-…`); method note sections "Gym-variable classification", "RIR scale", "Recommendation and evidence".

## Environment hazards (read before running anything)

- **`.env` contains PRODUCTION (`overload-prod`) values.** For every DB/Supabase-touching command, override `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the local Supabase CLI stack (`127.0.0.1:54322` / `:54321`). Integration tests use embedded throwaway Postgres.
- Embedded test Postgres is WIN1252: migration SQL must be ASCII-only.
- Integration runs: kill orphaned embedded postgres, random `TEST_PG_PORT`, wrap in `timeout`.
- Port 3200 is held by an unrelated process; ad-hoc servers use 3317.

## Pipeline status

- [x] 1. Pitch pulled + authority read
- [x] 2. Design doc — `docs/design/16-exercise-history-pr-intelligence-design-doc.md` (v1.0): existing `/exercises/[id]` becomes the history; scopes (gym-consistent: one; machine/cable: per gym + "No gym recorded"); records = best set (bestWorkingSet), best e1RM (estimate, same set), heaviest, rep-record frontier (≤6), bodyweight most reps; calls = engine on history up to each session, computed on read; Weight view = heaviest working-set load; entry links renamed "history", workout-detail names link; tour step recommended on /exercises.
- [x] 3. UI preview — `docs/previews/16-exercise-history-pr-intelligence-preview.html` (.html per owner memory; 24 frames, 9 sections; headless Chrome: 0 console errors, 0 non-file requests, Inter loaded, 0 phone overflow, 0 weights >600, 0 broken images; light+dark screenshots reviewed; fixes: HTML axis labels (stretched SVG text), no-gym trend caption). Generator: scratchpad `preview/build16.mjs` (records computed from mock sets with the design rules) + `check16.mjs`.
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
- [ ] 14. Final verification + merge gate
- [ ] 15. Run report

## Tickets

(none yet)

## Resolved Decisions so far

(see spec once written)

## Deferred / upstream amendments (running list)

- PRD: add Exercise History & PR Intelligence's three roadmap completion criteria (pitch §8 traceability gap).
- Pipeline guide Appendix C/§5 still names `-preview.tsx` (owner uses `.html`).
- Pitch 15's release note `2026-10-21-clearer-progression-calls` reached production via the 2026-10-22 merge of #86 with its provisional 2026-10-21 date still in place (observed, not changed by this run).
