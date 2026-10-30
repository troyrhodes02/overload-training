# Run Report — Public Accounts, Recovery & Support

**Feature:** Public Accounts, Recovery & Support (roadmap **Pitch 19**; working slug/number **18** after the owner-authorized iOS-Foundation postponement)
**Phase:** MVP 4 — Commercial Launch & Operations
**Run date:** 2026-10-29
**Linear:** project Overload V1 (`P-OVE-1`), milestone "Public Accounts, Recovery & Support" (`9f55d768`), tickets **OVE-81…OVE-88**
**Feature branch:** `18-public-accounts-recovery-support` → **PR #103** (targets `main`)
**Final status:** ✅ Implemented, reviewed, audited, verified. **PR #103 is OPEN and unmerged, awaiting human approval** (mandatory — this changes authentication, signup, recovery, and account deletion).

---

## 1. What shipped

A complete, web-only public-account lifecycle, delivered as 8 tickets squash-merged into the feature branch in dependency order:

| Ticket | PR | What |
| --- | --- | --- |
| **OVE-81** PA1 | #104 | Migration `9i_public_accounts` (additive): `Profile.emailVerifiedAt`, un-owned `auth_throttle` table (RLS deny-all), `AuthThrottleAction` enum, `AdminAuditAction.account_reset_email_sent`. Tri-state **signup mode** (`closed`/`invite`/`public`) with a constant-time invite code, `signup-gate.ts` the single reader. |
| **OVE-82** PA2 | #105 | **Abuse protection**: DB-backed rate limiter (`throttle.ts`, atomic bump-and-check, no cache/queue) + **Cloudflare Turnstile** (server-verified, `BotChallenge` widget) on signup. |
| **OVE-83** PA3 | #106 | **Email provider wiring**: Resend-over-SMTP config in `supabase/config.toml` (commented, dashboard for prod), reintroduced `/auth/confirm` callback, public-path plumbing, support-email identity. |
| **OVE-84** PA4 | #107 | **Password recovery**: `/forgot-password` + `/reset-password`, enumeration-safe (`recovery.ts`), suspension-safe, login "Forgot password?" + notice. Revives cancelled OVE-43. |
| **OVE-85** PA5 | #108 | **Email verification** (non-blocking): `verification.ts`, Settings nudge, `/verify-email`. Gates nothing; `enable_confirmations` stays off. |
| **OVE-86** PA6 | #109 | **Data export** (`export.ts`, `GET /settings/export`, versioned JSON, all owned models), deletion wiring (reused module), `/support` (signed-in → feedback, signed-out → `mailto:`). |
| **OVE-87** PA7 | #110 | **Admin "send reset email"** — owner-only, audited (`account_reset_email_sent`), reuses Pitch 17 auth + audit. |
| **OVE-88** PA8 | #111 | **User guidance**: 3 release notes (recovery significant; export + signed-out help list-only); no new tour steps. |

Plus a review-audit fixup commit (`48437fe`) applying 4 of the 5 code-review findings.

Pipeline artifacts: `pitches/18-…md`, `docs/design/18-…-design-doc.md`, `docs/previews/18-…-preview.tsx`, `docs/specs/18-…-spec.md`, `docs/runs/18-…-runbook.md`, `docs/runs/18-…-progress.md`.

---

## 2. Decisions made on the owner's behalf

### RD-A — Signup model reconciled with OVE-50 (most consequential)
The run prompt's decision #1 and CLAUDE.md both assume an invite-code gate, but **OVE-50 (owner-approved 2026-10-20) had already removed it**, replacing it with a binary `OVERLOAD_SIGNUP_OPEN` switch and adding usernames + confirm-password; Accounts R28 had removed password reset. Resolution: this pitch builds the **tri-state signup mode** the roadmap always assigned to Pitch 19 (`closed`/`invite`/`public`, invite-only default, public built+tested but **not enabled in production**), generalizing OVE-50's switch and restoring an invite code as *one* mode. `OVERLOAD_SIGNUP_OPEN` kept as a deprecated alias so no environment silently opens. Authority: roadmap Pitch 19 text + owner run-prompt decision #1 (newer) + OVE-50. No invariant weakened (prod stays closed by default), no approved doc contradicted. **Not a halt.**

### Spec Resolved Decisions R1–R12 (full detail in the spec)
R1 tri-state signup mode; R2 app-level `Profile.emailVerifiedAt` (Supabase's auto-confirm makes its own flag useless); R3 recovery/verify via Supabase templates over Resend SMTP (no `resend` SDK) + `/auth/confirm`; R4 DB-backed `AuthThrottle` limiter (no cache/queue) via a dedicated raw-allowed module; R5 `AuthThrottle` un-owned, hash-only, unreachable from `account.db`; R6 Turnstile with an injectable verifier + non-production test bypass only; R7 versioned JSON export of all owned models via `account.db`; R8 admin send-reset reuses `requireAdmin` + `recordAudit` in `inAdminTx`; R9 new public paths; R10 deletion unchanged + signed-out support is `mailto:` (no DB write); R11 link expiry = Supabase default (~1h); R12 carries design decisions D1/D2/D3/D7 into the contract.

### Implementation-time decisions (per ticket)
- Throttle key = coarse request fingerprint (forwarded IP → UA+lang fallback), hashed, never the email (no membership leak).
- Turnstile loads Cloudflare's own script — **no new npm dependency** (honors the architecture's dependency restraint); test-env bypass gated on `NODE_ENV!=="production"` AND unset secret, fails closed on transport error.
- `/auth/confirm` uses `verifyOtp({type,token_hash})`, matching the pre-R28 handler recovered from git history.
- SMTP block committed **commented-out** (a live placeholder host would break `supabase start`; local uses the CLI mail catcher).
- `AuthThrottle` classified via a new `UNOWNED_SYSTEM_MODELS` list in `scope.ts` so `scopeArgs` refuses it (sibling of `ADMIN_ONLY_MODELS`); `unclassifiedModels()` stays empty.
- Email verification: `confirmEmailVerification` reads the session (no token param) because `/auth/confirm` exchanges the code first; a static guard forbids any capability/entitlement branch on `emailVerifiedAt`.

---

## 3. Code review (Stage 12) and audit dispositions (Stage 13)

Review of the full feature branch vs `main` posted **5 inline findings** on PR #103 and confirmed every security dimension solid (enumeration, suspension, abuse, admin boundary, secrets, isolation, invariants, UI conformance).

| # | Finding (sev) | Disposition | Resolution |
| - | --- | --- | --- |
| 1 | Export omits `FeedbackAttachment`, an owned model (medium) | **Implemented** | Added `feedbackAttachments` (metadata rows via `account.db`); both guards now derive coverage from `ACCOUNT_DELETION_ORDER` so future omissions fail loudly. |
| 2 | Admin reset: send-before-audit inside tx → possible un-audited send (medium) | **Implemented** | Audit committed first in `inAdminTx()`, email sent after commit; failed send keeps the audit entry + reports failure; test updated to the corrected behavior. |
| 3 | External send inside an open DB tx (low) | **Implemented** | Folded into #2 — send moved outside the transaction. |
| 4 | Throttle `$queryRaw` unwrapped (low) | **Implemented** | Fails closed (`allowed:false`) on DB error; recovery folds it into the identical `{sent:true}`; fail-closed unit test added. |
| 5 | Recovery timing reveals throttle state, not membership (low) | **Deferred** | Documented in code + here; a future hardening could add a constant-time response floor. PR thread left open to track. |
| minor | `/support` placeholder `mailto:` when env unset | **Skipped** | Intentional; runbook §2 sets the real address. |
| minor | `login/page.tsx` missing `await connection()` | **Skipped** | Cosmetic; `searchParams` already forces request-time. |

---

## 4. Verification evidence

**Final suite on HEAD `005e5f9` (feature branch):**
- `typecheck` ✅ · `lint` ✅ · `format:check` ✅ · `verify:client-bundle` ✅ (no server secret in `.next/static`)
- **unit `npm test`: 89 suites / 1301 tests pass** ✅ (baseline was 1176)
- **integration `npm run test:integration`: 58 suites / 654 tests pass** ✅ (embedded Postgres)
- `next build`: **compiles successfully, generates all 49/49 static pages.** The process then exits non-zero **only** because of a pre-existing Next.js **security-advisory nudge** (see §7); the compilation itself is green. This is not a feature defect.

**Adversarial verification (all via passing unit/integration tests):**
- Invite-only rejects missing/invalid code; public accepts without a code (local stack) — PA1 + e2e specs.
- Signup + recovery cannot bypass the server rate limiter or bot challenge — PA2 integration (25-way atomicity, exactly 10/25 allowed; Turnstile server-verified before any account work); PA4 recovery throttle.
- Recovery response byte-identical for known/unknown/slow/throttled email — PA4 integration (enumeration-safe); invalid/expired/repeated handled — PA3 `/auth/confirm` unit.
- Password reset never un-suspends an account — PA4 integration (status never flipped; bounced to `/suspended`).
- Email verification gates no Free functionality — PA5 static guard.
- Admin reset is owner-only + audited, no training content, no password revealed — PA7 integration (+ audit-before-send after the audit fix).
- Export includes all owned records (incl. archived/soft-deleted), nothing cross-account, no secrets — PA6 `export.int.test.ts` (now coverage-derived from the owned set).
- Account isolation, logged-history integrity, deny-all RLS, existing training invariants intact — full integration isolation suite green; `auth_throttle` RLS deny-all + unreachable from `account.db`; no `LoggedSet` write outside its module; migration additive.
- UI implemented against the binding preview `docs/previews/18-…-preview.tsx`.

**Honestly UNVERIFIED (require a human/environment the unattended run lacks):**
- **Playwright e2e** (`npm run test:e2e:accounts`) — needs Docker + the Supabase local stack. The e2e specs (signup modes, recovery round trip) are authored and ready to run on a preview/local stack.
- **External-inbox email delivery** (recovery + verification on a real provider) — needs a real SMTP provider + external inbox (runbook §2/§6).
- **Real mobile-device browser** recovery round trip — exercise on a phone against the preview.

These are reported as **unverified**, not passed, per the verification-honesty rule and the roadmap's own "the reset email reaches an external inbox on a real provider" DoD (an owner/runbook step). No native/iOS/TestFlight check was applicable or claimed.

---

## 5. Near-misses / notes
- The review caught an **incomplete export** (missing `FeedbackAttachment`) that the hardcoded guard tests would not have flagged — fixed, and the guards now derive from the authoritative owned-model list so this class of omission can't recur silently.
- The admin reset-email originally sent before auditing inside a DB transaction — a subtle "un-audited admin action" risk — now corrected (audit-then-send, send outside the tx).
- PA4 fixed a latent PA2 gap: the Playwright accounts config lacked Turnstile test keys, which would have left the signup button disabled on the local stack.

---

## 6. Remaining human / owner actions (all in the runbook)
1. **Human review + approve PR #103**, then merge to `main` (the run never merges).
2. **Before deploy:** back up `overload-prod`, apply migration `9i_public_accounts` to production (additive), then deploy.
3. **Configure production:** Resend domain + SPF/DKIM/DMARC, SMTP in the Supabase dashboard, two sender identities (auth vs support), Turnstile keys, `NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL`, and `OVERLOAD_SIGNUP_MODE` (start `closed`, then `invite` + `OVERLOAD_INVITE_CODE`).
4. **Verify recovery reaches a real external inbox** (desktop + mobile browser) — the one DoD the run could not exercise.
5. **Public signup** (`OVERLOAD_SIGNUP_MODE=public`) only after the Launch Readiness gate — never enabled by this run.
6. **Correct the release-note dates** at merge if the production ship day differs from 2026-10-29 (provisional).
7. **Next.js security upgrade** (see §7) as a separate ticket before/with production.

---

## 7. Pre-existing issue surfaced (out of scope): Next.js security advisory
`next build` surfaces a Next.js **security-upgrade nudge** — the installed Next.js version is flagged by a known advisory, and the build process exits non-zero after a successful compile, recommending `next upgrade --agent=security`. This predates and is unrelated to this feature (it reproduces independent of the diff). The run deliberately did **not** run the upgrade (a framework-wide security bump is its own change with cross-cutting risk, not named in this pitch). **Recommended as a separate, near-term ticket**, ideally before the public launch.

---

## 8. Required Upstream Amendments — iOS Postponement

These are **recorded here only**; the owner applies the permanent edits. The run did not alter planning documents (except the allowed `docs/runs/*` and `docs/planning/method-note.md`, which it did not need to extend this run).

1. **Pitch Roadmap (`docs/planning/pitch-roadmap.md`):**
   - **Ordering/numbering:** iOS Foundation (current Pitch 18) is postponed to a future phase; Public Accounts, Recovery & Support (current Pitch 19) was implemented **next after Admin Center & Feedback (17)**. Either renumber (Public Accounts → 18, iOS Foundation → later) or add a note that the two are resequenced. This run used working number **18** for Public Accounts; the roadmap still says 19.
   - **Pitch 19 "Depends on"** currently lists **Pitch 18 (deep links for reset)**. Amend: this dependency is **removed for the web release** — recovery uses ordinary browser links; native deep-linking of reset/checkout returns is deferred to the iOS Foundation pitch when it ships.
   - **Pitch 18 (iOS Foundation) "Depends on" / sequencing:** note it is postponed pending suitable Mac hardware and no longer blocks Public Accounts; it still blocks the later mobile pitches (24–31) and the native parts of billing/landing.
   - **Dependency Map:** update the lines "Pitch 18 … blocks 19 (deep links) …" and "Pitch 19 depends on 17 and 18" to reflect that 19 shipped web-only without 18.

2. **PRD (`docs/planning/prd.md`):**
   - "Public Accounts, Recovery & Support" and the "Mobile Apps (iOS and Android)" entries, and the **Feature Dependencies** paragraph ("the iPhone shell follows so the web and mobile architecture is proven before billing and public signup") — amend to reflect that Public Accounts shipped **web-first, before** the iPhone shell. The DoD "the reset email reaches an external inbox" stands (owner/runbook check).

3. **Architecture Doc (`docs/planning/architecture.md`):**
   - The access/email sections already describe the custom-SMTP recovery and the invite→public server switch, which match what shipped. Add a note that **Capacitor/iOS deep links are deferred** and that recovery/verification are browser-link based for now. No data-model change beyond what migration `9i` adds (`Profile.emailVerifiedAt`, `AuthThrottle`, the new audit action) — fold these into the data-model list if the doc enumerates columns.

4. **CLAUDE.md (both root and `.claude/`):**
   - **Signup/access model:** the invite-only wording (and OVE-50's still-pending §10 amendments) should now describe the **tri-state signup mode** (`closed`/`invite`/`public`, prod default closed, public gated behind Launch Readiness), with the invite code as one mode. Update the stop condition "signup opened to the public before Public Accounts is verified / any signup path that skips the invite gate" to reference the signup-mode setting.
   - **Email/SMTP:** "none today / do not add email before Public Accounts" can note that custom SMTP (Resend) for recovery + verification now exists behind Supabase Auth.
   - **New data objects:** add `AuthThrottle` (un-owned system table, RLS deny-all, hash-only) and `Profile.emailVerifiedAt` to the consistency list; note `account_reset_email_sent` on `AdminAuditAction`.
   - **Cross-platform:** the "once the iOS foundation exists, every UI-bearing pitch records platform impact with `overload-cross-platform`" rule did **not** apply this run (iOS not shipped) — fine, but note the postponement so a future reader doesn't treat Public Accounts as having skipped it.

5. **Pipeline guide (`overload-pipeline-prompt-guide.md`, external):**
   - Appendix D2's Public Accounts dependency on iOS deep links is superseded for the web release; record the iOS postponement and that Public Accounts shipped web-only.

6. **Method note (`docs/planning/method-note.md`):** optionally add an entry for the signup-mode resolver, the `AuthThrottle` limiter constants (10/60s), and the email-verification `emailVerifiedAt` contract, since later pitches (billing) consume the verification gate.

None of these is a contradiction requiring a halt — they are the expected bookkeeping of the owner-authorized resequencing, to be applied by the owner.

---

## 9. Stop conditions
**None triggered.** No invariant weakened (account isolation, logged-history, deny-all RLS, admin boundary, no Pro-to-Free, no secret in client bundle all preserved); no approved doc contradicted (the signup-mode build is what the roadmap specified; the iOS resequencing is owner-authorized); no production data/credentials touched; no destructive/irreversible op. The one deferred item (admin-initiated deletion, OVE-79) was already blocked upstream and remains untouched.

**Final: PR #103 is OPEN and unmerged, awaiting human review and approval.**
