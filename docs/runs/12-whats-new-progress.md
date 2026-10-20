# Pitch 12 — What's New — Run Progress

Resumable state for the autonomous pipeline run. Updated at every pipeline
transition and ticket boundary. A fresh session resumes from **Current step**.

- **Slug:** `12-whats-new`
- **Linear project:** Overload V1, team `OVE`
- **Pitch document:** Linear doc `d52121df-bb1b-44b2-add0-debdf1906b12` → `pitches/12-whats-new.md` (verbatim copy)
- **Classification:** Feature, UI-bearing (full pipeline incl. UI preview).
- **Merge behavior:** run prompt says "merge on green, subject to the pipeline guide's protected-boundary rules". Guide D1 lists What's New as merge-on-green "unless the pitch text trips the rule", and says stop before merge when a pitch "changes schema on tables that hold user data" or changes signup / account deletion. Per-account seen state is the architecture's `ReleaseSeen`, a new owned table → expected **stop before merge** (decided in the spec; same reasoning as Pitch 10 R3 / Pitch 11 R3: code that reads a table production does not have yet cannot deploy before the human-applied migration). Never apply migrations to production; never enable production signup.
- **Target branch:** `main` · **Feature branch:** `feat/12-whats-new` (cut from `origin/main` @ `2813caf`, Pitch 11 merged)

## Current step

**Step 8 — implementing OVE-56** (OVE-54 #73 and OVE-55 #74 In Review).

## Authority used (read before resuming)

- Controlling planning docs: the owner's approved multi-user set (standing Pitch 8 R1) in `C:\Users\wtrho\Downloads\`: `architecture (1).md` (data model: `ReleaseSeen` — "per account: the latest release-notes entry shown. The release notes themselves are repository content, not rows"; open question: "where release-notes content lives and its entry format"), `prd (1).md` (What's New feature + journey), `pitch-roadmap (1).md` (Pitch 12), `product-brief (1).md` (2026-10-13). Pipeline guide: `Downloads/overload-pipeline-prompt-guide.md` (D1 merge rule; D2 standing: "Release backlog for a new account — starts with the latest entry already marked seen" (B); D3 temptations: unread backlog for a new account, showing the modal more than once, email/push, in-app editor; D4: "A new account has no unread release backlog, and the modal shows once per entry"). `docs/planning/` is still single-user and is not edited (except `method-note.md`, if needed).
- Governing rules: `.claude/CLAUDE.md` (multi-user; **uncommitted owner change in the working tree — never stage it**). Root `CLAUDE.md` is stale single-user. Untracked `.claude/skills/overload-onboarding/` is the owner's — never stage it.
- Never stage `backup-pre-ownership-20261019-1119.dump` (repo root).
- OVE-50 (memory): signup is open behind `OVERLOAD_SIGNUP_OPEN`, no invite code; CLAUDE.md invite wording is stale. Password reset removed (no email). Do not touch either. No Resend/SMTP.
- Owner feedback memory: UI previews are `.html` galleries from the skill template (not `.tsx`) — the run prompt's `-preview.tsx` path is replaced by `docs/previews/12-whats-new-preview.html`.
- `/overload-onboarding`: read for the User guidance contract only. Do **not** invoke its maintenance workflow, create a guidance ticket, or add a premature entry (run prompt + pitch §14). Pitch 13 is the first guidance-ticket pitch.
- Additional approved requirement (run prompt): release-note content is a single reusable source a future public changelog can consume (shared entries + visual language, no copying); seen state stays private; no landing page/public changelog in this pitch.

## Environment hazards (read before running anything)

- **`.env` contains PRODUCTION (`overload-prod`) values.** For every DB/Supabase-touching command, override `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the local Supabase CLI stack (`127.0.0.1:54322` / `:54321`). Integration tests use embedded throwaway Postgres.
- Embedded test Postgres is WIN1252: migration SQL must be ASCII-only.
- Integration runs: kill orphaned embedded postgres, random `TEST_PG_PORT`, wrap in `timeout`.
- Migrations sort lexicographically: the new migration must sort after `9d_tour_progress` (→ `9e_…`).
- Port 3200 is held by an unrelated process; ad-hoc servers use 3317.
- Never pipe a browser-check script to `head`.

## Pipeline status

- [x] 1. Pitch pulled + authority read
- [x] 2. Design doc — `docs/design/12-whats-new-design-doc.md` (v1.0)
- [x] 3. UI preview — `docs/previews/12-whats-new-preview.html` (.html not the run prompt .tsx; 17 frames; headless Chrome: 0 console errors, 0 non-file requests, Inter loaded, 0 phone overflow, 0 weights >600, Got it inside its frame in every dialog; light+dark screenshots reviewed). Generator: scratchpad `preview/build.mjs` (+ `check.mjs`).
- [x] 4. Spec — `docs/specs/12-whats-new-spec.md` (v1.0.0; migration `9e_release_seen`); `docs/planning/method-note.md` gains the release-note content contract
- [x] 5. Resolved Decisions recorded in spec (R1–R30). Key: R3 stop before merge; R8 no entry ships; R9 existing accounts = no row = shown nothing; R10 signup row; R12 account floor; R13 seen on open
- [x] 6. Linear milestone + issues (blockedBy chain)
- [ ] 7. Feature PR into `main`
- [ ] 8. Tickets implemented
- [ ] 9. Runbook — `docs/runs/12-whats-new-runbook.md`
- [ ] 10. Ticket PRs squash-merged into the feature branch in order
- [ ] 11. Full verification
- [ ] 12. Code review (inline comments on the feature PR)
- [ ] 13. Review audit
- [ ] 14. Final verification + merge gate
- [ ] 15. Run report — `docs/runs/12-whats-new-report.md`

## Linear

- Milestone: **What's New** (`c6f5d6f2-e57a-414b-9172-5c555685830f`)
- Tickets (dependency order, chained via blockedBy):
  - **OVE-54** — 1: Release-note content + seen state (catalog, ReleaseSeen, migration 9e, action, signup/deletion/isolation)
  - **OVE-55** — 2: What's New UI (ReleaseNote, dialog, layout + shell, Settings section, history page) (blockedBy OVE-54)
  - **OVE-56** — 3: Local-stack e2e + dialog browser walkthrough + visual verification (blockedBy OVE-55)

### Ticket branches / PRs

- **OVE-54** — `feat/ove-54-release-notes-seen` (off the feature branch) → PR **#73** (base: feature branch). In Review. Verified: prettier, lint, tsc, prisma validate, unit 51/873, integration 40/481 (release-notes, isolation/release-notes, release-seen-migration, deletion, ownership-enforce, RLS, schema), build (local env) + client-bundle OK; migration 9e applied to the LOCAL stack only (release_seen 0 rows, RLS on, 0 policies, migrate diff local→schema empty, anon Data API refused, 463 sets unchanged). **Spec v1.1.0 (R10):** the signup write moved into `establishProfile` (`initialReleaseSeen()` supplies the start) because the isolation guard forbids a bare `userId` outside src/lib/data; guard not weakened. Two standing guards caught this and a comment naming establishProfile — both fixed in code.
- **OVE-55** — `feat/ove-55-whats-new-ui` (off OVE-54) → PR **#74** (base: OVE-54 branch). In Review. Verified: prettier, lint, tsc, unit 53/879, integration 40/481, build (local env) + client-bundle OK. **Browser walkthrough** (scratchpad `walk.mjs`; dev server on 3317 against the local stack; temporary uncommitted entries; `git diff --exit-code src/lib/release-notes/entries.ts` clean afterwards): 3 accounts signed up with an empty catalog had no row and no dialog; after 1 significant entry: one-entry dialog, focus on Got it, row moved on open, reload without closing → none; after 3 significant + 1 ordinary: a fresh account got exactly [Exercise history, Clearer recommendations, Logging is faster] ("3 updates since you were last here"), Got it + reload → none; desktop light/dark and phone dark renders; See all updates → page with dialog closed; 375×568 with 5 entries: Got it fully in viewport at 44px, list scrolls, Escape + reload → none; a new account signed up with entries present: tour on first load, no dialog, row = newest id, no dialog after skipping the tour; Settings section + page at 375/1280 light/dark, no horizontal scroll; empty state + back link. All 4 temporary accounts deleted through the app's deletion flow. Screenshots in scratchpad `walk/` compared with preview §01–§05 — hierarchy, copy, controls, tokens match.

## Resolved Decisions so far

See spec `## Resolved Decisions` R1–R30.

## Deferred / notes

- Scratchpad helpers from Pitch 11 (`localenv.sh`, preview build scripts) lived in that session's scratchpad and are gone; recreate as needed.
