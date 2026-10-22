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

**Step 10 — integrate ticket PRs** (#91 → #92 → #93 into the feature branch, in order).

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
- [x] 4. Spec — `docs/specs/16-exercise-history-pr-intelligence-spec.md` (v1.0.0): no schema change; `gatherRows` extended + `describeScope` extracted in progression/queries.ts; new pure `progression/history.ts` (records, frontier, callsBySession, points), `history-format.ts`, server `history-queries.ts` (`getExerciseHistory`), `goals/queries.ts` `getExerciseGoals`; entry points `historyHref`.
- [x] 5. Resolved Decisions — spec R1–R29
- [x] 6. Linear milestone "Exercise History & PR Intelligence" (5634ecdb) + issues OVE-70 → OVE-71 → OVE-72 (blockedBy chain)
- [x] 7. Feature PR into `main` (draft) — **#90** https://github.com/troyrhodes02/overload-training/pull/90
- [x] 8. Tickets — OVE-70 #91, OVE-71 #92, OVE-72 #93 (all In Review)
- [x] 9. Runbook — `docs/runs/16-exercise-history-pr-intelligence-runbook.md`
- [ ] 10. Integrate ticket PRs
- [ ] 11. Verification
- [ ] 12. Code review
- [ ] 13. Review audit
- [ ] 14. Final verification + merge gate
- [ ] 15. Run report

## Tickets

| Ticket | Branch (base) | PR | Status |
| ------ | ------------- | -- | ------ |
| OVE-70 History 1: read layer | `feat/ove-70-history-read-layer` (feature branch) | #91 | In Review |
| OVE-71 History 2: page + entry points + e2e | `feat/ove-71-history-page` (OVE-70) | #92 | In Review |
| OVE-72 History 3: user guidance | `feat/ove-72-guidance` (OVE-71) | #93 | In Review |

### Ticket summaries

- **OVE-70** (#91, commit on `feat/ove-70-history-read-layer`) — verified: prettier, eslint 0, tsc, unit 66/1062 (new `exercise-history`, `-format`, `-guards`; preview fixture calls match row for row; 2,000-history sweep vs engine and Goals), integration 47/564 full + 15/144 re-run on the final staged tree (new `exercise-history.int.test.ts`, `isolation/exercise-history.int.test.ts`), build + client-bundle OK; prisma diff empty. Deliberate test change: bodyweight card now has a history href (R4). DTO types live in client-safe `history-types.ts`. Note: Python edits on Windows write CRLF — always run prettier after.
- **OVE-71** (#92) — verified: prettier, eslint 0, tsc, unit 67/1077 (new `exercise-history-ui.test.tsx`), integration 47/564, accounts e2e 34 passed + 1 skipped in the full run, then `rir-logging` (one assertion scoped to the "Next time" region — the page now also shows the newest session's Progress) 4 passed, new `exercise-history.spec.ts` passed (screenshots in `test-results/exercise-history/` reviewed: 375 light, 1280 dark), default e2e 26/26, build + client-bundle OK. New **R30** (spec v1.1.0): one column at every width (shell caps pages at 640px); design doc v1.1; preview desktop frames regenerated. Fixed: the chart's sr-only `<table>` scrolled phones sideways (now wrapped in an sr-only div). `E1rmChart` replaced by generic `TrendChart`.
- **OVE-72** (#93) — `/overload-onboarding`: mechanisms shipped; tour step `exercises` added (R31; anchors `nav-exercises` / `page-exercises`; copy in design doc "Tour steps added" table, registry test reads it); significant entry `2026-10-22-exercise-history` dated the merge day (re-date per runbook §2 if the merge slips). Verified: prettier, eslint, tsc, unit 67/1080, integration 47/564, tour e2e 8/8 (screens `test-results/tour/exercises-375.png` light, `-1280.png` dark reviewed), What's New e2e 5/5 (dialog 375 light, 1280 dark reviewed), build + client-bundle.

## Resolved Decisions so far

Spec R1–R31 (binding). Key: R1 merge on green unless a boundary is crossed; R2 .html preview; R5/R6 scopes incl. "No gym recorded" with no calls; R7–R11 records; R12 per-session call = engine on prefix, computed on read; R14 Weight view = heaviest working set; R18 no reconcile; R30 one column (shell is 640px); R31 tour step + release note.

## Deferred / upstream amendments (running list)

- PRD: add Exercise History & PR Intelligence's three roadmap completion criteria (pitch §8 traceability gap).
- Pipeline guide Appendix C/§5 still names `-preview.tsx` (owner uses `.html`).
- Pitch 15's release note `2026-10-21-clearer-progression-calls` reached production via the 2026-10-22 merge of #86 with its provisional 2026-10-21 date still in place (observed, not changed by this run).
