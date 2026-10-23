# Pitch 17 — Admin Center & Feedback — Run Progress

Resumable state for the autonomous pipeline run. Updated at every pipeline
transition and ticket boundary. A fresh session resumes from **Current step**.

- **Slug:** `17-admin-center-feedback`
- **Linear project:** Overload V1, team `OVE`
- **Pitch document:** Linear doc `21bebdeb-a57e-4f5e-9408-ccd2c81801fb` → `pitches/17-admin-center-feedback.md` (verbatim copy)
- **Classification:** Feature, UI-bearing, interface-heavy (guide §9). Web-only. Feedback is Free.
- **Merge behavior:** **STOP BEFORE MERGE** (run prompt mandatory gate; guide D1 privileged surface). Never apply migrations to production; never modify production accounts/data; never enable public signup; no Stripe; no credential changes.
- **Target branch:** `main` · **Feature branch:** `feat/17-admin-center-feedback` (cut from `origin/main` @ `20bd9be`)

## Current step

Step 2 — design doc.

## Authority used (read before resuming)

- Planning docs: `docs/planning/` in the repo (owner commit `6b63316`, 2026-10-22) is the current multi-user/commercial set (identical to `Downloads/* (2).md`). Not edited by the run (except `method-note.md`).
- Governing rules: `.claude/CLAUDE.md` (current). Root `CLAUDE.md` is the stale single-user copy — ignore.
- Pipeline guide: `C:\Users\wtrho\Downloads\overload-pipeline-prompt-guide (1).md` (2026-10-22, newest; D1 stop-before-merge, D2 standing resolutions, D3 temptations, D4 standing tests).
- Preview format: `.tsx` at `docs/previews/17-admin-center-feedback-preview.tsx`. The owner's Oct 22 rewrite of `overload-ui-design` removed the `.html` gallery convention and names `.tsx`; CLAUDE.md, the guide and the run prompt agree. The older memory note (".html, not .tsx") is superseded; memory updated.
- OVE-50 (memory): signup is open behind `OVERLOAD_SIGNUP_OPEN` (server-only, default closed); CLAUDE.md's invite-only wording is stale. This run changes nothing about signup.

## Environment hazards (read before running anything)

- **`.env` contains PRODUCTION (`overload-prod`) values.** For every DB/Supabase-touching command, override `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and `SUPABASE_SERVICE_ROLE_KEY`) to the local Supabase CLI stack (`127.0.0.1:54322` / `:54321`). Integration tests use embedded throwaway Postgres.
- Embedded test Postgres is WIN1252: migration SQL must be ASCII-only.
- Integration runs: kill orphaned embedded postgres, random `TEST_PG_PORT`, wrap in `timeout`.
- Port 3200 is held by an unrelated process; ad-hoc servers use 3317.

## Gate: administrative deletion (pre-resolved decision 7)

Inspected 2026-10-22. The approved documents remain contradictory:
- `.claude/CLAUDE.md` first invariant: deletion "is user-initiated, confirmed, handled by one dedicated module".
- `docs/planning/prd.md` Accounts edge case: "Account deletion cannot be started by anyone but the signed-in owner."
- versus `prd.md` Admin Center & Feedback ("suspend, reactivate, delete"), the owner journey, `architecture.md` API Surface (Admin … delete), `pitch-roadmap.md` Pitch 17, and CLAUDE.md admin boundary ("Every admin mutation (suspend, reactivate, delete, …)").
- `src/lib/accounts/deletion.ts` takes the acting `Account` from `requireAccount()` only; making it accept an admin-named target would expand its authority.

**Decision:** stop condition 2 applies to the admin-deletion capability. It is not implemented in this run (no raw deletion, no second path, no expansion of the module). The pitch scopes it "subject to reconciliation" (§6 item 7, Journey F, §13, §14). All other capabilities proceed. Upstream amendment + resumption path recorded in the spec and report.

## Pipeline status

- [x] 1. Pitch pulled + authority read
- [ ] 2. Design doc
- [ ] 3. UI preview
- [ ] 4. Spec
- [ ] 5. Resolved Decisions
- [ ] 6. Linear milestone + tickets
- [ ] 7. Feature PR
- [ ] 8. Tickets
- [ ] 9. Runbook
- [ ] 10. Integrate ticket PRs
- [ ] 11. Verification
- [ ] 12. Code review
- [ ] 13. Review audit
- [ ] 14. Final verification — STOP BEFORE MERGE
- [ ] 15. Run report

## Tickets

(none created yet)

## Resolved Decisions so far

Pre-resolved 1–9 from the run prompt (to be recorded in the spec).

## Deferred / upstream amendments (running list)

- Reconcile admin-initiated account deletion (CLAUDE.md first invariant + PRD Accounts edge case vs. roadmap/PRD/architecture admin delete).
- Pipeline guide ships in Downloads, not the repo.
