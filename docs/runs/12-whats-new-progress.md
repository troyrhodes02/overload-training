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

**Step 2 — design doc.**

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
- [ ] 2. Design doc — `docs/design/12-whats-new-design-doc.md`
- [ ] 3. UI preview — `docs/previews/12-whats-new-preview.html`
- [ ] 4. Spec — `docs/specs/12-whats-new-spec.md`
- [ ] 5. Resolved Decisions recorded in spec
- [ ] 6. Linear milestone + issues (blockedBy chain)
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

(not yet created)

## Resolved Decisions so far

(recorded in the spec once written)

## Deferred / notes

- Scratchpad helpers from Pitch 11 (`localenv.sh`, preview build scripts) lived in that session's scratchpad and are gone; recreate as needed.
