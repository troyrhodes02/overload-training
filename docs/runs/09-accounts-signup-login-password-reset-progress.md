# Pitch 9 — Accounts: Signup, Login & Password Reset — Run Progress

Resumable state for the autonomous pipeline run. Updated at every pipeline
transition and ticket boundary. A fresh session resumes from **Current step**.

- **Slug:** `09-accounts-signup-login-password-reset`
- **Linear project:** Overload V1 (`P-OVE-1`), team `OVE`
- **Pitch document:** Linear doc `807836d3-bc59-4845-85b5-194c3359b14f` → `pitches/09-accounts-signup-login-password-reset.md` (verbatim copy)
- **Classification:** Feature, UI-bearing (full pipeline incl. UI preview). Touches authentication, signup, password recovery, account deletion → **stop before merge to `main`** (run prompt). Never apply migrations to production; never enable production signup.
- **Target branch:** `main` · **Feature branch:** `feat/09-accounts-signup-login-password-reset` (cut from `main` @ `8fc4755`)

## Current step

**COMPLETE — stopped before merge to `main` (run prompt).** Feature PR #56 open with all ticket PRs integrated and review findings addressed. Remaining steps are human: run report §8 + runbook.

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
- [x] 8. Implement tickets (ticket worker, stacked branches) — OVE-41…45 → PRs #57–#61, all In Review
- [x] 9. Production runbook — `docs/runs/09-accounts-signup-login-password-reset-runbook.md` + `docs/runs/09-sql/` (committed `b98c9ea`)
- [x] 10. Squash-merge ticket PRs into feature branch, in order — #57 `d93cc99`, #58 `c0c2c92`, #59 `49b37e0`, #60 `91a3b07`, #61 `8fc1816`. Method: retarget child to the feature branch, merge the feature branch into the child resolving conflicts with the child's superset, require the only delta vs the child tip to be files identical to the feature branch (always just the runbook + 09-sql), push, wait for the Vercel check, squash. Final feature tree == OVE-45 tip.
- [x] 11. Full verification on `8fc1816`: format, lint, typecheck, prisma validate, unit 40/627, integration 33/406, build (local env, invite + service key set) + client-bundle OK, e2e 28, accounts lifecycle e2e 7/7 (local DB unchanged after: 1 profile, 1 auth user, 463 sets)
- [x] 12. Code review → `code-review` skill (high) posted 10 inline comments on #56
- [x] 13. Review audit + fixes — audit posted (https://github.com/troyrhodes02/overload-training/pull/56#issuecomment-6278021014): 10 implement, 0 defer/skip/discuss; new decisions R25–R27, R23 amended, R24 retired; design doc v1.1; preview v1.1; runbook updated; local stack restarted to load `secure_password_change`
- [x] 14. Final verification — STOP (no merge to `main`): format, lint, typecheck, prisma validate, unit 40/631, integration 33/407, build + client-bundle, e2e 28, accounts lifecycle e2e 7/7 (local DB unchanged)
- [x] 15. Run report — `docs/runs/09-accounts-signup-login-password-reset-report.md`

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
- OVE-42 → branch `feat/ove-42-invite-signup` → **PR #58** (base `feat/ove-41-…`) · In Review · verified: lint, typecheck, format, unit 38/607, integration 32/398, build + client-bundle (invite + service key set), e2e 26; local-stack signup check (wrong code → 0 users; profile names + browser zone)
- OVE-43 → branch `feat/ove-43-password-recovery` → **PR #59** (base `feat/ove-42-…`) · In Review · verified: lint, typecheck, format, unit 39/617, integration 32/398, build, e2e 28; local-stack recovery flow via Mailpit (identical copy known/unknown, ≥1.5 s both, subject + /auth/confirm link, same-password rejected, other device signed out, reused link → expired, old pw fails/new works). Local stack restarted once to load the recovery template (data intact: 463 sets, 1 user).
- OVE-44 → branch `feat/ove-44-account-deletion` → **PR #60** (base `feat/ove-43-…`) · In Review · verified: lint, typecheck, format, unit 40/627, integration 33/406 (new `isolation/account-deletion.int.test.ts` 8/8: two full accounts, A deleted → B + library byte-identical; injected mid-tx failure → nothing deleted; auth failure → retry finishes; lazy-profile sweep), build, client-bundle, e2e 28; live local deletion (wrong pw → nothing; right pw → profile/gym/auth user gone; original account 463 sets + 876 library rows untouched).
- OVE-45 → branch `feat/ove-45-accounts-e2e` → **PR #61** (base `feat/ove-44-…`) · In Review · verified: lint, typecheck, format, unit 40/627, integration 33/406, default e2e 28 (server now forced to an unroutable DB URL), **accounts lifecycle e2e 7/7 on the local stack** (`npm run test:e2e:accounts`), client-bundle. Local DB left as before (1 profile, 1 auth user, 463 sets). Orphaned test profiles from earlier ad-hoc checks found and removed (3 + 1, all test-created, owning nothing else but 1 gym).


## Resolved Decisions so far

R1–R22 in `docs/specs/09-accounts-signup-login-password-reset-spec.md` → Resolved Decisions. Highlights: R2 shared invite code env var, closed when unset/<12 chars (= production gate); R3 admin-API account creation, Supabase project signup stays disabled; **R4 the app now uses `SUPABASE_SERVICE_ROLE_KEY` server-side (only `src/lib/supabase/admin.ts`) — supersedes Pitch 2's "never in src/" (flag for human review)**; R7 token_hash recovery template + `/auth/confirm`; R8 recovery session = amr otp ≤ 30 min; R12 deletion through the scoped client, one tx, data first then identity; R14 forgot always "sent".

Empirical (local stack, 2026-10-19): admin dup → `email_exists`; anon signUp → `signup_disabled`; wrong/unknown login → `invalid_credentials` (same); reset unknown → ok, known repeated → 429 `over_email_send_rate_limit` (membership leak → swallow); verifyOtp recovery → amr `otp`; reuse → `otp_expired`; same password → `same_password`; signOut others revokes old sessions; deleted user getUser → `user_not_found`; deleteUser again → 404.

## Run notes

- Local-stack helper: scratchpad `localenv.sh` (sources local URLs/keys from `npx supabase status -o env`, refuses non-127.0.0.1). Integration: scratchpad `itest.sh`.
- Port 3200 is held by an unrelated process on this machine; use 3317 for ad-hoc `next start`.
- Visual checks create TEMPORARY local auth users (`visual-*@example.test`) and remove them + their profile afterwards.
- Cache Components: pages reading `searchParams` outside the (app) layout need `export const instant = false` (login).

## Deferred / flagged

- ~~Known limitation (OVE-43, R24)~~ — retired by review fix R26 (every session ends after a reset).
