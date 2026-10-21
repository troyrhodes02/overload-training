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

**Step 8 — Implementation: OVE-60 (guidance) next** (branch `feat/ove-60-guidance` off `feat/ove-59-e2e-tap-count`).

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
- [x] 4. Spec — `docs/specs/13-faster-logging-ux-spec.md` (v1.0.0; no schema change). Design doc → v1.1 (tap total corrected 17 → 18; gym-variable "First time on this at …" wording generalised; preview footer → v1.1)
- [x] 5. Resolved Decisions in spec (R1–R25)
- [x] 6. Linear milestone + issues (OVE-57 → OVE-58 → OVE-59 → OVE-60, blockedBy chain)
- [x] 7. Feature PR into `main` (draft, stop before merge per R3) — **#76** https://github.com/troyrhodes02/overload-training/pull/76
- [ ] 8. Tickets implemented
- [ ] 9. Runbook
- [ ] 10. Ticket PRs squash-merged into feature branch
- [ ] 11. Full verification + tap-count measurement
- [ ] 12. Code review (inline comments on feature PR)
- [ ] 13. Review audit
- [ ] 14. Final verification — STOP before merge
- [ ] 15. Run report

## Linear

- Milestone: **Faster Logging UX** (`c2e76baf-f532-4225-8cc9-76382688197b`)
- Tickets (dependency order, chained via blockedBy):
  - **OVE-57** — 1: previous performance + gym-scoped working weight + set-entry helpers
  - **OVE-58** — 2: active-row exercise card, focus flow, in-card correction, runner (blockedBy OVE-57)
  - **OVE-59** — 3: local-stack e2e, tap-count measurement (before/after), method note (blockedBy OVE-58)
  - **OVE-60** — 4: user guidance — tour check + What's New entry via /overload-onboarding (blockedBy OVE-57, OVE-58, OVE-59)

### Ticket branches / PRs

- **OVE-57** — `feat/ove-57-previous-performance` (off the feature branch) → PR **#77** (base: feature branch). In Review. Verified: prettier, lint, tsc, unit 55/899, integration 41/494 (new `previous-performance.int.test.ts` 11 tests; `isolation/logging` +1), build (local env) + client-bundle OK. Summary: `getWorkout` gains `previousPerformance` + `loggedSetId`; the machine/cable working weight no longer falls back to another gym; pure `set-entry.ts` helpers + `formatMonthDay`. Integration tests went in a new file rather than `logging-reads` (same coverage; clearer). Nothing renders the new fields until OVE-58.
- **OVE-58** — `feat/ove-58-active-row-card` (off OVE-57) → PR **#78** (base: OVE-57 branch). In Review. Verified: prettier, lint, tsc, unit 57/913, integration 41/494, production build (accounts webServer, local env) + client-bundle OK. Browser walkthrough (temporary uncommitted spec, kept in scratchpad `zz-walkthrough.spec.ts`; 375×812 touch, 320px, 1280 dark): nothing focused on load; after Log set 1 → `Set 2 reps`; after set 3 → Next; after Next → new card's reps; typing over the offered 60 → 65; logged row opens the correction dialog; 0 page errors. Two layout bugs found and fixed in-browser (weight box clipped `185` at 375px; context line truncated beside the gym label) → spec v1.1.0 **R26** (reps box 88px; below 360px Log set is icon-only with `Log set N` name; context line full width). One failed walkthrough run left a temp account; a cleanup afterAll removed it through the app. Local DB after: 3 users / 2 profiles / 463 sets.
- **OVE-59** — `feat/ove-59-e2e-tap-count` (off OVE-58) → PR **#79** (base: OVE-58 branch). In Review. **Measured: before (Pitch 4 card, `fe34d00`) 29 taps / 28 keystrokes / 12 controls; after 18 taps / 18 keystrokes / 8 controls.** Baseline run: worktree `C:\Users\wtrho\overload-baseline-fe34d00` (detached at fe34d00, own `npm ci` — Turbopack rejects a junctioned node_modules), seed module + baseline spec copied in, `OVERLOAD_TAP_BASELINE=1 npx playwright test --config playwright.accounts.config.ts e2e/accounts/tap-count-baseline.spec.ts`. Verified: prettier, lint, tsc, unit 57/913, accounts e2e 28 passed + 1 skipped (baseline driver), default e2e 26/26; local DB 3/2/463 after. Baseline spec lives at `e2e/accounts/tap-count-baseline.spec.ts` (ticket text said `support/`; top level keeps it beside the suite it documents). Method note gains "Set entry and tap-count method".

## Resolved Decisions so far

Spec `## Resolved Decisions` R1–R25. Headline: R3 stop before merge; R4 one active row; R6 offer = working weight then highest logged set; R7 reps never prefilled; R9–R10 gym-variable working weight scoped to the workout's gym (removes the cross-gym fallback; Pitch 5 suggestion omits the number in that case); R13 focus only after the lifter's action; R15 no optimistic logged state; R17 logged row opens the existing EditSetDialog; R21–R22 tap-count method (before on fe34d00, committed baseline driver); R24 no tour step; R25 provisional release-note date set to the merge day by the human.

## Deferred / notes

- Found in orientation: `suggestedWeight` (src/lib/logging/queries.ts) falls back to the latest weight logged at ANY gym for a machine/cable exercise with no baseline at the selected gym — a cross-gym machine-weight assumption the pitch forbids (§9.2) and that the Guided Workout Logging / Progressive Overload Engine specs never authorised (their tables say gym-variable = the selected gym's baseline). The spec scopes it to the selected gym.
- The current card prefills EVERY unsaved row from the working weight at page load, indistinguishable from typed values; reuse after a weight change is not supported. Baseline for the tap-count "before" measurement: `main` @ `fe34d00`.
