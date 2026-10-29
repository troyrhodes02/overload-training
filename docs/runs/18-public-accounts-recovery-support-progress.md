# Run Progress — Public Accounts, Recovery & Support

**Working slug:** `18-public-accounts-recovery-support`
**Roadmap pitch:** Pitch 19 (Public Accounts, Recovery & Support). Working number 18 after the owner-authorized iOS postponement (see below).
**Linear project:** Overload V1 (`P-OVE-1`), team `OVE`.
**Run started:** 2026-10-29.
**Merge behavior:** DO NOT MERGE into `main`. Leave the final feature PR open for human approval.

## Owner-authorized sequencing override (iOS postponed)
- iOS Foundation & Cross-Platform Workflow (roadmap Pitch 18) is postponed to a future phase (hardware constraint). For THIS run only, Public Accounts is treated as the next development pitch after Admin Center & Feedback.
- Implement completely for desktop + mobile web browsers. No Capacitor, Xcode, Universal Links, native session handling, or platform adapters. Do not invoke `/overload-cross-platform`.
- Native deep links / TestFlight remain deferred. All required permanent roadmap/PRD/Architecture/CLAUDE.md/pipeline-guide amendments go in the run report only (no silent planning-doc edits).

## Stage tracker
- [x] Stage 0 — Context gathering (roadmap, method-note, Linear project, prior pitches)
- [x] Stage 1 — Pitch authored: `pitches/18-public-accounts-recovery-support.md`
- [x] Stage 2 — Design doc: `docs/design/18-...-design-doc.md` (830 lines, 10 screens, decisions D1–D8, web-only, Free)
- [x] Stage 3 — UI preview: `docs/previews/18-...-preview.tsx` (1105 lines, all 10 screens + states, self-contained)
- [x] Stage 4 — Spec: `docs/specs/18-...-spec.md` (714 lines, R1–R12)
- [x] Stage 5 — Resolved Decisions (R1–R12 in spec)
- [x] Stage 6 — Milestone + 8 tickets OVE-81..OVE-88 (blockedBy wired)
- [x] Stage 7 — Feature branch `18-public-accounts-recovery-support` + feature PR #103 → main (OPEN; planning docs committed 29c1465)
- [~] Stage 8 — Implementation (`/overload-ticket-worker` per ticket): PA1✅ PA2✅ merged; PA3 next
- [ ] Stage 9 — Runbook
- [ ] Stage 10 — Integrate ticket PRs into feature branch
- [ ] Stage 11 — Verification (incl. adversarial)
- [ ] Stage 12 — Code review (`/review`)
- [ ] Stage 13 — Review audit (`/overload-review-audit`)
- [ ] Stage 14 — Final verification + STOP before merge
- [ ] Stage 15 — Run report

## Pre-resolved decisions (from run prompt + Appendix D2) — to record in spec Resolved Decisions
1. Signup remains invite-only by default; support public mode via server-side config; implement+test public, do not enable in prod.
2. Password recovery uses Supabase Auth email/password recovery + custom SMTP; enumeration-safe (same response known/unknown); browser links desktop+mobile.
3. Email delivery: **Resend** over custom SMTP (pipeline guide default). Separate auth vs support sender identities. No real domains/creds (runbook/owner).
4. Abuse protection: server rate limiting + bot challenge (**Cloudflare Turnstile** default). Preserve account-existence privacy.
5. Email verification required before first paid checkout only; NOT required to create account or use Free. (No billing in this pitch.)
6. Export: downloadable JSON, all user-owned data incl. archived/historical; never another account's data/secrets/creds; identity from session.
7. Deletion: reuse existing canonical account-deletion module (OVE-44). Admin-initiated deletion remains deferred (OVE-79 blocked). No second destructive path.
8. Suspension stays authoritative: password change / email verify never restores access for a suspended account.
9. Support reuses shipped feedback form + owner inbox; discoverable for signed-in and signed-out users; admin reset-assist uses admin auth + audit. No ticketing/chat.
10. All of signup/recovery/verification/support/export/deletion are Free capabilities. No Stripe/Pro/entitlements in this pitch.

## Key context findings (Stage 0)
- OVE-43 (password recovery) was Canceled in Pitch 9 — this pitch revives it.
- OVE-79 admin-deletion is BLOCKED pending upstream amendment — stays deferred.
- Dedicated account-deletion module exists (OVE-44, Accounts 4). Server-only auth-admin facade exists (OVE-42).
- Prior-pitch issues sit in "In Review" (PRs left open) — established pattern.

## Decisions log (resolved during run)

### RD-A — Reconciling signup model with OVE-50 (CRITICAL)
**Finding:** OVE-50 (approved, owner request 2026-10-20) already REMOVED the invite-code gate (`OVERLOAD_INVITE_CODE`, `src/lib/accounts/invite.ts` deleted) and replaced it with a single boolean `OVERLOAD_SIGNUP_OPEN` (closed by default in prod). It also added `Profile.username` (required at signup, unique, migration `9c_profile_username`) and a Confirm-password field. Password reset was removed by Accounts R28 (no `/forgot-password`, `/reset-password`, `/auth/confirm`; no email provider). OVE-50 §10 flagged the CLAUDE.md invite-only wording as a PENDING upstream amendment (not yet applied).

**Tension:** Run-prompt decision #1 and CLAUDE.md both reference an "invite-code gate" that no longer exists in code.

**Resolution (authority: roadmap Pitch 19 text [auth 1] + owner run-prompt decision #1 [auth 1, newer owner instruction dated 2026-10-29] + OVE-50 spec [auth 3]):** This pitch builds the proper **signup-mode** server-side config the roadmap always assigned to Pitch 19 ("A signup mode switch between invite-only and public, set by server configuration and off by default"). It GENERALIZES OVE-50's interim open/closed boolean into three modes: `closed` (prod default), `invite` (requires a shared invite code — re-introduces a server-checked code as ONE mode, not the only one), `public` (no code). Invite-only is the default per decision #1; public is implemented+tested but NOT enabled in production. This preserves OVE-50's safety property (prod closed by default) and the owner's "don't make me invite each user" intent (a single shared code / eventual public), while restoring the invite⟷public duality the roadmap mandates. Not a halt: no invariant weakened (prod stays closed by default; the invite gate is restored as a mode), no approved doc contradicted (roadmap explicitly calls for this switch).

**Consequences for scope:**
- Usernames are now part of signup (Pitch 9 design doc predates them) — the revived signup/recovery UI must include the username field and reflect OVE-50 copy.
- Password recovery (OVE-43, Canceled) is REVIVED over Resend: `/forgot-password`, `/reset-password`, reset email template, enumeration-safe. Pitch 9 design doc Screens 3–5 are the design basis.
- Email verification: build the mechanism (send + confirm + stored verified state) ready for billing to consume "before first checkout"; it gates NOTHING in this pitch (no checkout exists; must not gate Free). Supabase global `enable_confirmations` stays OFF (would gate login); verification tracked as our own state / Supabase verification flow that does not block sign-in.
- Signed-out support pathway: offer a discoverable support/contact route (support sender address) on login/signup; keep the DB-writing feedback form signed-in only (avoid unauthenticated writes). Signed-in support reuses the shipped feedback form.
- Admin "send reset email" action: new `AdminAuditAction` value (e.g. `account_reset_email_sent`), via `requireAdmin()` + `recordAudit` in `inAdminTx()`; must respect suspension.
- Admin-initiated deletion stays deferred (OVE-79 blocked); reuse canonical `deleteAccount` (`src/lib/accounts/deletion.ts`) for self-service only.

### Key reusable primitives (from exploration)
- Auth chokepoint: `requireAccount()` / `requireUser()` (`src/lib/auth.ts`, `src/lib/data/account.ts`); suspension enforced in `requireAccount` → `/suspended`.
- Signup core: `signUp()` (`src/lib/accounts/signup.ts`), gate `isSignupOpen()` (`src/lib/accounts/signup-gate.ts`). Admin API user creation: `createConfirmedUser`/`deleteAuthUser` (`src/lib/supabase/admin.ts`).
- Export source of truth: 19 owned models in `ACCOUNT_DELETION_ORDER` (`src/lib/accounts/deletion.ts`). Export must cover all; never cross accounts; identity from `requireAccount()`.
- Admin: `requireAdmin()` (`src/lib/data/admin/identity.ts`), `recordAudit()` (`src/lib/data/admin/audit.ts`), `AdminAuditAction` enum, `inAdminTx()`. Allowlist `OVERLOAD_ADMIN_USER_IDS`.
- Isolation suite: `tests/integration/isolation/*` with `coverage.ts` registry (meta-test enforces every owned model is covered).
- Migration/RLS pattern: `prisma/migrations/<N>_name/migration.sql`, every new table `ENABLE ROW LEVEL SECURITY` with no policy. Guard tests in `tests/unit/invariant-guards.test.ts`.
- Proxy/middleware: `src/proxy.ts` (public paths, redirects, admin 404 rewrite).

## Implementation log (Stage 8/10)
- **OVE-81 PA1** ✅ PR #104 squash-merged into feature branch (commit `1fed3a9`). 1186 unit + 629 integration pass; typecheck/lint/format/build clean; migrate diff empty; client-bundle clean. **e2e (Playwright accounts) UNVERIFIED** — needs `npx supabase start` (Docker) unavailable in this env; applies to ALL tickets. Decisions: DB enum kept PascalCase `"AdminAuditAction"` (matches 9g); `action AuthThrottleAction` column exempted from the no-`action*` progression guard (pre-auth discriminator); `AuthThrottle` classified via new `UNOWNED_SYSTEM_MODELS` in scope.ts. Next.js security-upgrade suggestion surfaced by build — OUT OF SCOPE, noted for report.
- **OVE-82 PA2** ✅ PR #105 squash-merged (commit `2702ac8`). 1208 unit + 635 integration pass (incl. 25-way concurrent throttle-atomicity proof: exactly 10 of 25 allowed); build + client-bundle clean; e2e UNVERIFIED (Docker). Decisions: throttle key = coarse request fingerprint (x-forwarded-for/x-real-ip → UA+accept-language fallback), hashed, never email; no new npm dep (Turnstile loads Cloudflare's own script); test-env bypass gated on NODE_ENV!=="production" AND unset secret, fails closed.
- **OVE-83 PA3** ✅ PR #106 squash-merged (commit `394af40`). 1233 unit pass; build + client-bundle clean; e2e/external-inbox UNVERIFIED. Decisions: `/auth/confirm` uses `verifyOtp({type,token_hash})` (matches pre-R28 handler); SMTP block committed COMMENTED-OUT (a live placeholder host would break `supabase start`; CLI mail catcher is the local path); no placeholder pages (PA4/5/6 add them); `NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL` public by design.
- **OVE-84 PA4** ✅ PR #107 squash-merged (commit `6ca27cc`). 1254 unit + 638 integration pass (enumeration-safe + suspension-safe over real DB throttle); build + bundle clean; e2e specs authored, UNVERIFIED (Docker). Decisions: recovery throttle key = request fingerprint, never email; suspension-safety proven in integration (e2e case deferred there rather than a weak browser check); moved `PASSWORD_ERRORS` to client-safe validation module to keep Prisma out of the client bundle. Fixed latent PA2 gap: added Cloudflare Turnstile test keys to `playwright.accounts.config.ts` (signup submit was disabled on local stack without a site key).
- **OVE-85 PA5** ✅ PR #108 squash-merged (commit `aac4115`). 1279 unit pass; build + bundle clean. PA5 subagent could NOT provision the DB (reported integration unverified) — I ran `npm run test:integration` on the feature branch post-merge: **57 suites / 642 pass** (incl. PA5's emailVerifiedAt per-account isolation cases) ✅. Decisions: verification gates nothing (static guard forbids any capability/entitlement branch on `emailVerifiedAt`; `enable_confirmations` stays false); send via the request Supabase client's own template (no `resend` SDK); `confirmEmailVerification` reads the session (no token param) since `/auth/confirm` already exchanges it. e2e UNVERIFIED (Docker).
- **OVE-86 PA6** ✅ PR #109 squash-merged (commit `9469770`). 1294 unit + 647 integration pass (incl. `export.int.test.ts`: A's export = exactly A's rows for every owned model, none of B's; archived/soft-deleted included; custom-only; no credentials; read-only). Build + bundle clean; e2e UNVERIFIED (Docker). Decisions: `/settings/export` route can't use `force-dynamic` (repo `cacheComponents` rejects it) — relies on `requireAccount()` cookie read + `Cache-Control: no-store`; deletion reused verbatim (no second path); signed-out support = mailto (no DB write); `export.ts` registered as sanctioned surfacer of `emailVerifiedAt`/`releaseSeen` (never branches on them).
- **OVE-87 PA7** ✅ PR #110 squash-merged (commit `76f7f04`). 1299 unit + admin integration pass (non-admin→nothing/not-found; admin→one `account_reset_email_sent` audit entry in-tx + send; suspended still sent but NOT reactivated; failed send rolls back the audit; no training content exposed). Build + bundle clean; e2e UNVERIFIED. Decisions: send runs INSIDE the audit `inAdminTx()` so a failed send records nothing; unresolvable target email → not_found (no enumeration). Enum value shipped in PA1 (no migration here).
- OVE-88 PA8 — in progress (final guidance ticket).
  - Scope: `src/lib/accounts/throttle.ts` (raw-allowed, atomic upsert), `src/lib/accounts/turnstile.ts` (siteverify + test-env bypass), `src/components/auth/bot-challenge.tsx` (Turnstile widget wrapper), wire throttle+challenge into `signUp` BEFORE `createConfirmedUser`, `SignupViewDto.turnstileSiteKey`, form messages (`rate_limited`/`challenge_failed`).
  - Decisions: (a) Turnstile loaded via Cloudflare's own `turnstile/v0/api.js` script (no new npm dep — CLAUDE.md forbids adding libs); (b) throttle key for signup = SHA-256 of a coarse request fingerprint (first client IP from `x-forwarded-for`/`x-real-ip`, else UA+lang header fallback) — never the email, so it leaks no membership; (c) raw-access guard: add `src/lib/accounts/throttle.ts` to eslint ignore-list for `no-restricted-imports` and extend `account-isolation-guards.test.ts` to allow exactly that one extra raw toucher while asserting it is the ONLY non-data-layer raw-prisma file and it only touches `authThrottle`.
  - Window/limit constants: `THROTTLE_WINDOW_SECONDS = 60`, `THROTTLE_LIMIT = 10` per key per window (R4 default).
  - **DONE.** Files: `src/lib/accounts/{throttle,turnstile}.ts`, `src/components/auth/bot-challenge.tsx`, `src/lib/accounts/signup.ts` (rate_limited/challenge_failed outcomes, throttle→challenge before createConfirmedUser), `src/app/signup/{actions,page,signup-form}.tsx`, `eslint.config.mjs`, `scripts/check-client-bundle.mjs`, `.env.example`; tests `tests/unit/{throttle,turnstile,bot-challenge,accounts-signup,signup-action,account-isolation-guards}` + `tests/integration/throttle.int.test.ts`.
  - Verification: typecheck/lint/format clean; unit 1208 pass (80 suites); integration 635 pass (throttle 6/6, incl. 25-way concurrent atomic increment); build OK; client-bundle scan OK. e2e accounts UNVERIFIED (needs Docker/Supabase local stack). Next.js security-upgrade nudge halted the first build (pre-existing, OUT OF SCOPE — retry built fine).

## Baseline (main, pre-run)
- typecheck clean; `npm test` = 77 suites, **1176 unit tests pass**. (Integration/e2e not run at baseline — need DB/local stack.)
- On `main`, deps installed, all test configs present.

## Branch plan
- Feature branch `18-public-accounts-recovery-support` off `main`; ticket branches stacked (each off predecessor). Squash-merge ticket PRs into feature branch in order (Stage 10). Final feature PR → `main` stays OPEN.

## Tickets (actual IDs) — milestone "Public Accounts, Recovery & Support" (9f55d768)
Linear stack (each blockedBy the previous deps), implement in this order:
1. **OVE-81** PA1 — Foundation: migration 9i, tri-state signup mode & invite gate. (no deps)
2. **OVE-82** PA2 — Abuse protection: DB throttle + Turnstile. (⟵ OVE-81)
3. **OVE-83** PA3 — Email provider wiring + `/auth/confirm`. (⟵ OVE-81)
4. **OVE-84** PA4 — Password recovery (forgot/reset). (⟵ OVE-82, OVE-83)
5. **OVE-85** PA5 — Email verification (non-blocking). (⟵ OVE-83)
6. **OVE-86** PA6 — Export, deletion wiring & support. (⟵ OVE-81, OVE-83)
7. **OVE-87** PA7 — Admin send-reset-email. (⟵ OVE-84, OVE-81)
8. **OVE-88** PA8 — User guidance (release notes). (⟵ OVE-84, OVE-86, OVE-87)

## Sequencing decision (git/PR flow)
Feature branch `18-public-accounts-recovery-support` off `main`, planning docs committed there; feature PR → `main` (OPEN, never merged by the run). Each ticket: branch off the current feature-branch tip → implement via `/overload-ticket-worker` → ticket PR targeting the feature branch → squash-merge into feature branch → next ticket branches off the updated tip. This satisfies "each subsequent ticket from its predecessor" (predecessor merged before next branches) and Stage 10 ("squash-merge every ticket PR into the feature branch in order"). Only the final feature→main PR stays open.

## Deferred / Open
- (none yet)
