# Runbook — Public Accounts, Recovery & Support

**Feature:** Public Accounts, Recovery & Support (roadmap Pitch 19; working slug 18)
**Feature branch / PR:** `18-public-accounts-recovery-support` → PR #103 (OPEN; human-approved merge only)
**Tickets:** OVE-81…OVE-88 (PRs #104–#111, squash-merged into the feature branch)
**Audience:** the product owner (William). Everything here is a **human/owner step** — the autonomous run never touches production, production credentials, real domains, live email, or production migrations.

This feature changes authentication, signup, recovery, and account deletion. Treat every production step as high-risk: there is no staging tier, and a bad deploy corrupts the only copy of every lifter's history. Take a database backup immediately before the migration.

---

## 0. What ships vs. what stays off

- **Ships in code:** a tri-state signup mode (`closed`/`invite`/`public`), DB-backed rate limiting + Cloudflare Turnstile on signup and recovery, enumeration-safe password recovery over email, a non-blocking email-verification mechanism, complete Free JSON export, deletion wiring (reused module), a signed-in/out support path, and an owner-only audited admin "send reset email" action.
- **Stays OFF in production until you decide:** **public signup**. Production defaults to `closed`, then you set `invite` for the launch circle; `public` is flipped only after the launch-readiness gate. Email verification **gates nothing** yet (it is consumed by the later billing pitch).
- **Deferred, not in this release:** native iOS/Android, Capacitor, **Universal Links / password-reset deep links into a native app, and TestFlight** (owner-authorized iOS postponement). Recovery works through ordinary browser links on desktop and mobile; there is no native deep-link path to configure here.

---

## 1. Environment variables (set in Vercel production + the Supabase dev project for previews)

| Variable | Scope | Purpose | Notes |
| --- | --- | --- | --- |
| `OVERLOAD_SIGNUP_MODE` | server-only | `closed` \| `invite` \| `public` | **Production: `closed`** at deploy, then `invite` for the launch circle. Only reader is `src/lib/accounts/signup-gate.ts`. |
| `OVERLOAD_INVITE_CODE` | server-only | the shared code required in `invite` mode | Pick a non-guessable value. Never commit it; never put it in a `NEXT_PUBLIC_` var. |
| `OVERLOAD_SIGNUP_OPEN` | server-only | **deprecated alias** | If `OVERLOAD_SIGNUP_MODE` is unset, `OVERLOAD_SIGNUP_OPEN=="true"` → public, else closed. Prefer setting `OVERLOAD_SIGNUP_MODE` and removing this. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public | Cloudflare Turnstile widget site key | Safe in the client bundle. If unset in production, the signup/forgot submit button stays disabled (fail-safe). |
| `TURNSTILE_SECRET_KEY` | server-only | Turnstile siteverify secret | In the client-bundle forbidden-scan list. Production **requires** a real key (no bypass in production). |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_SENDER` | server-only (Supabase Auth) | custom SMTP (Resend) for auth email | Configured in the **Supabase dashboard → Auth → SMTP**, not in app code. See §2. |
| `NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL` | public | the support address shown on `/support` | Public by design (it is meant to be seen). This is the **support** identity, distinct from the auth sender. |

The invite code, Turnstile secret, and SMTP credentials are secrets — they never appear in client bundles or `NEXT_PUBLIC_` vars (a CI client-bundle scan enforces this).

---

## 2. Email delivery (Resend over custom SMTP) — owner steps

The app does not send email itself; it routes through **Supabase Auth's own templates over a custom SMTP provider**. `supabase/config.toml` ships the SMTP block **commented out** so the local CLI mail catcher keeps working; production SMTP is configured in the Supabase dashboard.

1. **Create a Resend account** and verify a sending **domain** you control (do not reuse a personal address). The run invented no domains.
2. **Add DNS records** at your domain registrar for that domain:
   - **SPF** (TXT) authorizing Resend.
   - **DKIM** (CNAME/TXT) records Resend provides.
   - **DMARC** (TXT), e.g. `v=DMARC1; p=quarantine; rua=mailto:...`.
   Wait for Resend to show the domain **Verified**.
3. **Two sender identities** on the verified domain:
   - **Authentication** sender, e.g. `no-reply@<auth-domain>` — used for recovery and verification emails.
   - **Support** sender, e.g. `support@<support-domain>` — set as `NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL` and shown on `/support`. Make sure this inbox is monitored.
4. **Supabase dashboard → Authentication → Emails/SMTP:** enter the Resend SMTP host/port/user/pass and the authentication sender address. Keep **"Confirm email" (enable_confirmations) OFF** — email verification here is a separate, non-blocking app flow; turning Supabase confirmation on would gate sign-in.
5. **Set the Site URL and Redirect URLs** (Supabase → Auth → URL Configuration) to the production domain and ensure `…/auth/confirm` is an allowed redirect so recovery/verify links land correctly.
6. **Recovery/verify link expiry** defaults to Supabase's value (recovery link ~1 hour, matching the email copy). Change only in the Supabase dashboard if needed.

### Deliverability check (do before enabling invite/public signup)
- From a **real external inbox** (Gmail/Outlook you own, not the Supabase team address), trigger "Forgot password" and confirm the email **arrives, is not in spam, and the link works** on both desktop and a mobile browser. This is the one acceptance criterion the autonomous run could **not** verify (no external inbox); it is **UNVERIFIED** until you do this.

---

## 3. Abuse protection — owner steps

- **Cloudflare Turnstile:** create a Turnstile widget (Managed mode) for the production domain; set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in Vercel. The challenge runs on **signup** and **forgot-password** only (not login). Server-side siteverify happens before any account creation or recovery lookup; a missing/invalid token is rejected server-side.
- **Rate limiting:** server-enforced via the `auth_throttle` table (no cache/queue). Defaults: **10 attempts / 60 s per key** (`src/lib/accounts/throttle.ts` constants). The key is a coarse request fingerprint (forwarded IP, else UA + accept-language), hashed; never the email. Tune the constants if abuse appears.
- A rate-limit or challenge failure is **privacy-identical** regardless of whether an email has an account; a recovery rate-limit folds into the same "Check your email" response.

---

## 4. Database migration — owner step (human, from this runbook)

Migration `prisma/migrations/9i_public_accounts/migration.sql` is **additive** (safe): adds `profiles.email_verified_at` (nullable), the un-owned `auth_throttle` table (RLS deny-all, no FK, no personal data), the `auth_throttle_action` enum, and the `account_reset_email_sent` value on `AdminAuditAction`. It rewrites no rows and touches no logged history.

1. **Take a fresh backup** of `overload-prod` immediately before applying (point-in-time or a manual dump). Confirm the backup is restorable.
2. Apply the migration to production **before** the code deploys (the new code reads `profiles.email_verified_at`): run the repo's migration-deploy command against `overload-prod` using `DIRECT_URL` (e.g. `prisma migrate deploy`). Do **not** run `prisma migrate reset` or a forced push.
3. Verify: `prisma migrate diff` (applied → schema) reports **no difference**; `auth_throttle` exists with **RLS enabled and no policy** (the anon Data API returns nothing for it); the new enum value is present.
4. Then deploy the code.

(Previews run against the **Supabase dev** project; this run applied `9i` only to dev. Production application is this human step.)

---

## 5. Deploy & rollout sequence

1. Human-review and approve feature PR #103; squash-merge to `main` (the autonomous run leaves it OPEN).
2. Apply migration `9i` to production (§4) **before** the deploy.
3. Configure production env vars (§1), SMTP (§2), Turnstile (§3). Leave `OVERLOAD_SIGNUP_MODE=closed`.
4. Deploy. Smoke-test on production: existing accounts sign in; existing training flows work unchanged; `/forgot-password`, `/reset-password`, `/support`, `/verify-email` render; `/auth/confirm` handles a real recovery link (§2 deliverability check).
5. **Open the door:** set `OVERLOAD_SIGNUP_MODE=invite` and `OVERLOAD_INVITE_CODE=<code>`; verify a correct code creates an account and a wrong/missing code is refused.
6. **Public signup** (`OVERLOAD_SIGNUP_MODE=public`) is flipped **only after the Launch Readiness checklist passes** (a later pitch/gate). Do not enable it to "demonstrate" public mode in production.

### Rollback
- The migration is additive, so a **code rollback alone** (redeploy the previous build) restores prior behavior without touching the schema; `email_verified_at`/`auth_throttle` simply go unused.
- To fully close the door instantly: set `OVERLOAD_SIGNUP_MODE=closed` (no deploy needed if env changes take effect on redeploy/restart).
- Only if the migration itself is implicated: restore from the pre-migration backup (§4.1). The additive columns/table are not expected to require this.

---

## 6. Functional checks after rollout

- **Recovery (external inbox):** forgot → email arrives on a real provider → link sets a new password → old password fails, new works. Desktop and mobile browser. **(Owner-verified; UNVERIFIED by the run.)**
- **Enumeration safety:** a forgot request for a known and an unknown email produce identical screens and no timing/wording difference.
- **Suspension:** suspend an account (admin), then have it attempt recovery/reset — it can reset the password but is still refused (`/suspended`) on the next authenticated request.
- **Abuse:** repeated signup/forgot attempts past the window are throttled; submitting without a Turnstile token is rejected.
- **Export:** a lifter downloads `overload-export-YYYY-MM-DD.json`; it contains their own plans/workouts/sets/goals/gyms/cardio/profile (incl. archived rows) and nothing from any other account, no credentials.
- **Deletion:** a lifter deletes their account (password-gated); their rows are gone and the account can no longer sign in; the shared library is untouched.
- **Admin send-reset:** from `/admin/accounts/[id]`, "Send reset email" sends the standard recovery email, writes an audit entry, and never reveals/changes the password; a non-admin cannot reach it (not-found).

---

## 7. Native / mobile — DEFERRED

Native iOS/Android, Capacitor, **Universal Links / password-reset deep links into a native app, and TestFlight remain deferred** by the owner-authorized iOS postponement. There is **no native deep-link configuration** to perform for this release. Recovery and verification use ordinary browser links. When the iOS Foundation pitch later ships, revisit: deep-link redirect targets for `/auth/confirm`, in-app session handling, and the `overload-cross-platform` platform-impact review. Do not report any native-device or TestFlight check as passed for this release.

---

## 8. Known-unverified by the autonomous run (require a human/environment)

- **External-inbox email delivery** (recovery + verification) — needs a real SMTP provider + external inbox (§2, §6).
- **Playwright e2e** (`npm run test:e2e:accounts`) — needs Docker + the Supabase local stack; the e2e specs are authored and ready to run on a preview/local stack. Unit + integration suites (which cover the same server logic, isolation, throttle atomicity, enumeration-safety, suspension-safety, export isolation, and admin authz) pass.
- **Real mobile-device browser** recovery round trip — exercise on an actual phone browser against the preview.

---

## 9. Separate, out-of-scope observation

`next build` surfaces a **Next.js security-upgrade recommendation** (a known advisory affecting the installed version). The build completes on re-run. This predates and is unrelated to this feature; address it as its own small ticket (`next upgrade --agent=security`), not as part of this release.
