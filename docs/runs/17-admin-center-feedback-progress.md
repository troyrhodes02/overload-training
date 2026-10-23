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

Step 14 — final verification (stop before merge).

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
- [x] 2. Design doc — `docs/design/17-admin-center-feedback-design-doc.md` v1.0 (12 screens; Screen 12 admin delete = deferred contract only)
- [x] 3. UI preview — `docs/previews/17-admin-center-feedback-preview.tsx` (screen/state/width/appearance switcher; parses clean with TS transpile; excluded from tsc/eslint/prettier)
- [x] 4. Spec — `docs/specs/17-admin-center-feedback-spec.md` v1.0.0
- [x] 5. Resolved Decisions — spec R1–R25 (R7 = admin deletion halted)
- [x] 6. Linear milestone "Admin Center & Feedback" (7cb8b570) + OVE-74 → OVE-75 → OVE-76 → OVE-77 → OVE-78 (blockedBy chain); OVE-79 = BLOCKED admin deletion (not in chain)
- [x] 7. Feature PR into `main` (draft) — **#94** https://github.com/troyrhodes02/overload-training/pull/94
- [x] 8. Tickets — OVE-74 #95, OVE-75 #96, OVE-76 #97, OVE-77 #98, OVE-78 #99 (all In Review)
- [x] 9. Runbook — `docs/runs/17-admin-center-feedback-runbook.md` + `docs/runs/17-sql/verify-admin-center.sql` (rehearsed on the local stack)
- [x] 10. Integrate ticket PRs — squashed in order: #95 `f8ebb22`, #96 `f7a512c`, #97 `cb3e050`, #98 `f8c2bd2`, #99 `804ce8a` (each: retarget to feature, merge feature into ticket, add/add conflicts resolved to the ticket side, Vercel pass, squash). Final feature tree == OVE-78 tip. No force-push.
- [x] 11. Verification on the integrated feature branch: prettier, eslint 0, tsc, prisma validate, unit 75/1151, integration 53/605 (RLS, isolation incl. Feedback, history integrity, baselines, deload, admin gate/privacy/metrics/suspension/feedback), accounts e2e 38 passed + 1 skipped (by design) + 1 failed (personalization phone sheet pinned the old list; updated per design doc Screen 1 → personalization 8/8), default e2e 26/26, build (via e2e web server; Next security nudge on alternate builds) + client-bundle OK. Preview comparison: screenshots 375 light / 1280 dark for every admin screen, /feedback, /suspended, What's New dialog reviewed.
- [x] 12. Code review — `code-review` (high, --comment): 10 findings (9 inline + 1 general comment, outside the diff)
- [x] 13. Review audit — Implement 8 (1,2,3,5,6,8,9,10; commit `0993ce5`; spec v1.1.0 R28–R29) · Skip 1 (7: R14, indexed) · Discuss 1 (4: keep R22 per CLAUDE.md) · Defer 0. Replies on every thread; implemented threads resolved; summary https://github.com/troyrhodes02/overload-training/pull/94#issuecomment-6356517498. Re-verified prettier, eslint 0, tsc, unit 75/1151, integration 53/607, e2e admin-center 5/5 + send-feedback 2/2.
- [ ] 14. Final verification — STOP BEFORE MERGE
- [ ] 15. Run report

## Tickets

| Ticket | Branch (base) | PR | Status |
| ------ | ------------- | -- | ------ |
| OVE-74 Admin 1: foundation | `feat/ove-74-admin-foundation` (feature) | #95 | In Review |
| OVE-75 Admin 2: Send feedback | `feat/ove-75-send-feedback` (OVE-74) | #96 | In Review |
| OVE-76 Admin 3: admin center | `feat/ove-76-admin-center` (OVE-75) | #97 | In Review |
| OVE-77 Admin 4: inbox + e2e | `feat/ove-77-feedback-inbox` (OVE-76) | #98 | In Review |
| OVE-78 Admin 5: guidance | `feat/ove-78-guidance` (OVE-77) | #99 | In Review |
| OVE-79 BLOCKED admin deletion | — | — | Backlog (not worked) |

### Ticket summaries

- **OVE-74** (#95): migration 9g (profiles.status + last_active_on; feedback owned; admin_audit_entries admin-only + append-only trigger; RLS on both); requireAccount suspension redirect + touchLastActive; /suspended; src/lib/data/admin/{identity,gate,db,audit}.ts; `inAdminTx` registry (Prisma's extended tx client also has `$transaction`, so recordAudit checks a WeakSet of open inAdminTx transactions); audit column named `kind` (invariant-guards reserves `action`). Verified: prettier, eslint 0, tsc, prisma validate, unit 71/1125, integration 49/585, build (security nudge once, retry OK) + client-bundle OK. 9g applied to the LOCAL Supabase stack only.

- **OVE-75** (#96): submitFeedback + action + /feedback + SendFeedback form (src/components/send-feedback/, not components/feedback/ which holds generic UI feedback); Textarea; ⋮ menu + phone sheet entries. Verified: prettier, eslint 0, tsc, unit 73/1134, integration 50/589, e2e send-feedback 2/2 (screens 375 light / 1280 dark reviewed vs preview). E2E web-server build hits the Next.js security nudge once per new build; retry passes.
- **OVE-76** (#97): admin shell/nav/layout, metrics layer (pure src/lib/admin/overview.ts + gated reads), directory + account page (emails via src/lib/data/admin/emails.ts, the one new auth-facade read), suspend/reactivate (inAdminTx + recordAudit), audit log page, proxy early 404 for signed-in non-admins on /admin/** (streamed notFound keeps 200 — R23 amended), allowlist parser moved to src/lib/admin/allowlist.ts. E2E admin = fixed auth id e2e0ad00-0000-4000-8000-000000000017 allowlisted in playwright.accounts.config.ts. Verified: prettier, eslint 0, tsc, unit 74/1142, integration 52/599, e2e admin-center 3/3 (screens reviewed), bundle OK. Next 16 keeps prior routes hidden in DOM → e2e getByText must filter visible.
- **OVE-77** (#98): src/lib/data/admin/feedback.ts + inbox/item pages + actions; unit admin-actions (each admin action invoked directly as a non-admin → notFound, data layer untouched); e2e admin-center 5/5 incl. replay of the captured suspend action by the lifter → 409 "Server Action unavailable" on lifter paths AND the admin path (proxy rewrite target doesn't carry the action), DB unchanged. Verified: prettier, eslint 0, tsc, unit 75/1151, integration 53/605, bundle OK.
- **OVE-78** (#99): overload-onboarding — no tour step (R26); significant entry `2026-10-22-send-feedback`, provisional date (R27; runbook §6 re-dates). Verified: catalog/registry unit, tour e2e 8/8, What's New e2e 5/5 (dialog 375 light / 1280 dark reviewed).

## Resolved Decisions so far

Spec R1–R27 (binding). Key: R7 admin deletion halted; R11 AdminAuditEntry admin-only (no owner, no FKs, append-only trigger); R12–R14 metric definitions; R15 admin layer in src/lib/data/admin behind a gated client; R16 emails via one new auth-facade read; R19 feedback cap 10/24h.

## Deferred / upstream amendments (running list)

- Reconcile admin-initiated account deletion (CLAUDE.md first invariant + PRD Accounts edge case vs. roadmap/PRD/architecture admin delete).
- Pipeline guide ships in Downloads, not the repo.
