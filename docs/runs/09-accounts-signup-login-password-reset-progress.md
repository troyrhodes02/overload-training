# Pitch 9 — Accounts: Signup, Login & Password Reset — Run Progress

Resumable state for the autonomous pipeline run. Updated at every pipeline
transition and ticket boundary. A fresh session resumes from **Current step**.

- **Slug:** `09-accounts-signup-login-password-reset`
- **Linear project:** Overload V1 (`P-OVE-1`), team `OVE`
- **Pitch document:** Linear doc `807836d3-bc59-4845-85b5-194c3359b14f` → `pitches/09-accounts-signup-login-password-reset.md` (verbatim copy)
- **Classification:** Feature, UI-bearing (full pipeline incl. UI preview). Touches authentication, signup, password recovery, account deletion → **stop before merge to `main`** (run prompt). Never apply migrations to production; never enable production signup.
- **Target branch:** `main` · **Feature branch:** `feat/09-accounts-signup-login-password-reset` (cut from `main` @ `8fc4755`)

## Current step

**Step 8 — implementing OVE-42** (OVE-41 done → PR #57).

## Authority used (read before resuming)

- Controlling planning docs: the owner's approved multi-user set (standing resolution R1 of Pitch 8), which exists only in `C:\Users\wtrho\Downloads\` dated 2026-10-13: `architecture (1).md`, `prd (1).md`, `pitch-roadmap (1).md`, `product-brief (1).md`. `docs/planning/` in the repo is still the single-user set (pending upstream amendment) and is not edited.
- Governing rules: `.claude/CLAUDE.md` (multi-user; **uncommitted owner change in the working tree — never stage it**; byte-identical to `Downloads/CLAUDE (1).md`). The root `CLAUDE.md` is the stale single-user version.
- Never stage `backup-pre-ownership-20261019-1119.dump` (owner's production backup in the repo root).
- Multi-User Foundation: merged to `main` (`1efe0a3`). Its production verification gate (runbook 08 §7.4) is **not recorded** in the repo → treat as not verified: signup must stay disabled in production; the runbook makes the gate a prerequisite.

## Environment hazards (read before running anything)

- **`.env` contains PRODUCTION (`overload-prod`) values.** For every DB/Supabase-touching command, override `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and any service-role key) to the local Supabase CLI stack (`127.0.0.1:54322` / `:54321`). Integration tests use embedded throwaway Postgres.
- Embedded test Postgres is WIN1252: migration SQL must be ASCII-only.
- Integration runs: kill orphaned embedded postgres, random `TEST_PG_PORT`, wrap in `timeout`.
- Migrations sort lexicographically: any new migration must sort after `9_account_ownership_2_enforce` (e.g. `9a_…`).

## Pipeline status

- [x] 1. Pitch pulled + authority read
- [x] 2. Design doc — `docs/design/09-accounts-signup-login-password-reset-design-doc.md` (v1.0)
- [x] 3. UI preview — `docs/previews/09-accounts-signup-login-password-reset-preview.html` (**.html, not the run prompt's .tsx**: overload-ui-design skill + owner feedback memory; 51 frames; headless Chrome: 0 console errors, 0 non-file requests, Inter loaded, 0 phone overflow; light+dark screenshots reviewed). Generator: scratchpad `preview/build.mjs`.
- [x] 4. Spec — `docs/specs/09-accounts-signup-login-password-reset-spec.md` (v1.0.0; no schema change, no migration)
- [x] 5. Resolved Decisions recorded in spec (R1–R22)
- [x] 6. Linear milestone + issues (blockedBy chain)
- [x] 7. Feature PR into `main` (do not merge) — **#56** (draft)
- [ ] 8. Implement tickets (ticket worker, stacked branches)
- [ ] 9. Production runbook
- [ ] 10. Squash-merge ticket PRs into feature branch, in order
- [ ] 11. Full verification
- [ ] 12. Code review → inline comments on feature PR
- [ ] 13. Review audit + fixes
- [ ] 14. Final verification — STOP (no merge to `main`)
- [ ] 15. Run report

## Linear

- Milestone: **Accounts: Signup, Login & Password Reset** (`d9b2bde6-af88-4d09-bf95-025f1f71609b`)
- Tickets (dependency order, chained via blockedBy):
  - **OVE-41** — 1: Auth surfaces, login/logout, Settings (name + timezone)
  - **OVE-42** — 2: Invite-gated signup + server-only auth-admin facade (blockedBy OVE-41)
  - **OVE-43** — 3: Password recovery: forgot, confirm link, reset (blockedBy OVE-42)
  - **OVE-44** — 4: Account deletion: dedicated module, password confirmation, isolation proof (blockedBy OVE-43)
  - **OVE-45** — 5: Local-stack account lifecycle e2e + hardening (blockedBy OVE-44)

### Ticket branches / PRs
(stacked: OVE-41 branches from the feature branch; each next from the previous)
- OVE-41 → branch `feat/ove-41-auth-surfaces-settings` → **PR #57** (base feature branch) · In Review · verified: lint, typecheck, format, unit 36/588, integration 32/395, build, e2e 25


## Resolved Decisions so far

R1–R22 in `docs/specs/09-accounts-signup-login-password-reset-spec.md` → Resolved Decisions. Highlights: R2 shared invite code env var, closed when unset/<12 chars (= production gate); R3 admin-API account creation, Supabase project signup stays disabled; **R4 the app now uses `SUPABASE_SERVICE_ROLE_KEY` server-side (only `src/lib/supabase/admin.ts`) — supersedes Pitch 2's "never in src/" (flag for human review)**; R7 token_hash recovery template + `/auth/confirm`; R8 recovery session = amr otp ≤ 30 min; R12 deletion through the scoped client, one tx, data first then identity; R14 forgot always "sent".

Empirical (local stack, 2026-10-19): admin dup → `email_exists`; anon signUp → `signup_disabled`; wrong/unknown login → `invalid_credentials` (same); reset unknown → ok, known repeated → 429 `over_email_send_rate_limit` (membership leak → swallow); verifyOtp recovery → amr `otp`; reuse → `otp_expired`; same password → `same_password`; signOut others revokes old sessions; deleted user getUser → `user_not_found`; deleteUser again → 404.

## Run notes

- Local-stack helper: scratchpad `localenv.sh` (sources local URLs/keys from `npx supabase status -o env`, refuses non-127.0.0.1). Integration: scratchpad `itest.sh`.
- Port 3200 is held by an unrelated process on this machine; use 3317 for ad-hoc `next start`.
- Visual checks create TEMPORARY local auth users (`visual-*@example.test`) and remove them + their profile afterwards.
- Cache Components: pages reading `searchParams` outside the (app) layout need `export const instant = false` (login).

## Deferred / flagged

(none yet)
