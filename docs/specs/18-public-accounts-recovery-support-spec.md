---
version: 1.0.0
status: draft
author: Claude Code (autonomous pipeline run)
last_updated: 2026-10-29
pitch_reference: pitches/18-public-accounts-recovery-support.md
design_reference: docs/design/18-public-accounts-recovery-support-design-doc.md
preview_reference: docs/previews/18-public-accounts-recovery-support-preview.tsx
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
linear_issue: (to be created — OVE)
---

# Public Accounts, Recovery & Support

> Working slug `18`; roadmap number `19` (iOS Foundation postponed by owner decision — pitch §"Owner-authorized sequencing override"). Feature name is used verbatim everywhere for traceability. **Web-only this run.** `overload-cross-platform` is not invoked and no native/Capacitor/deep-link work is done.

---

## 1. Summary

Public Accounts, Recovery & Support closes the account-lifecycle gaps that stand between an invite-only tracker and a product strangers can use: it generalizes signup into an owner-controlled **three-state mode** (closed / invite-only / public), adds **password recovery** over a real email provider, adds **server-enforced abuse protection** (a database-backed rate limiter plus a Cloudflare Turnstile challenge) on signup and recovery, builds an **email-verification mechanism** that gates nothing yet, gives every lifter a complete private **data export**, wires **account deletion** end to end through the existing module, and adds a **signed-out support pathway** plus an owner-only **admin "send reset email"** action.

The core technical abstraction is that **all of this is auth-and-account plumbing that never touches training content or the isolation/history invariants.** Recovery and verification route through Supabase Auth's own email mechanisms over a custom SMTP provider (Resend); the one new owned column is `Profile.emailVerifiedAt` (additive, on a table that already has deny-all RLS); the one new standalone table is `AuthThrottle`, an un-owned, RLS-deny-all system table reached only through a new dedicated raw-allowed module, never through the account-scoped client. Export reads **only** through the account-scoped layer (`account.db`), so it is isolation-safe by construction. Signup-mode becomes a single server-only setting read in exactly one place (`signup-gate.ts`), replacing OVE-50's binary `OVERLOAD_SIGNUP_OPEN`.

"Working" means: the owner can set the mode to invite-only (the launch default) and a correct code creates an account while a wrong/missing code reveals nothing; a lifter who forgets their password requests a reset, gets the **identical** "check your email" confirmation whether or not the address exists, follows a one-time link, sets a new password, signs in, and finds the same history; a suspended account that resets still lands on `/suspended`; signup and recovery cannot be hammered or scripted past the server; a lifter can download every row their account owns and nothing of anyone else's; deletion removes only their rows and blocks sign-in. Public mode is fully built and tested but **is not enabled in production** (owner step).

---

## 2. Problem

- The app cannot yet let a known circle in with a shared code while keeping strangers out: signup is binary (`OVERLOAD_SIGNUP_OPEN` open/closed, OVE-50), with no invite-only middle ground and no deliberate path to public.
- The app cannot yet let a stranger who forgot their password get back in: recovery does not exist (OVE-43 cancelled, removed again by OVE-50 R28), because there was no email provider.
- The app cannot yet resist scripted abuse of signup or recovery at the application layer: the only protection is an operational Vercel Firewall rule and the off switch (OVE-50 U12).
- The app cannot yet let a lifter take all of their data with them: self-service deletion ships (OVE-44), but there is no export surface or module.
- The app cannot yet give a signed-out person (locked out, or deciding whether to join) any discoverable way to reach the owner.
- The app cannot yet record whether a lifter owns their email, which a first paid checkout (Billing pitch) will need to gate.

This is the launch gate: no payment is collected and public signup stays off until this pitch is verified. It unlocks Plans, Billing & Promo Codes (which consumes the verification state and the mode switch) and the Landing Page.

---

## 3. Scope and non-scope

### In scope
1. **Signup mode** — a tri-state server-only setting (`closed` / `invite` / `public`), invite-only default, read in exactly one place (`signup-gate.ts`); invite code checked on the server, constant-time; public built and tested but not enabled in production.
2. **Abuse protection** — a DB-backed, server-enforced rate limiter (new `AuthThrottle` table + dedicated module) and a Cloudflare Turnstile challenge, both verified server-side before any account creation or recovery lookup, both privacy-preserving, on signup and the forgot-password request.
3. **Password recovery** — `/forgot-password` (enumeration-safe) → Supabase recovery email over Resend → `/auth/confirm` code exchange → `/reset-password`; expired/invalid/reused links handled; recovery respects suspension.
4. **Email provider wiring** — Resend over custom SMTP configured in `supabase/config.toml` `[auth.email.smtp]` (+ production dashboard, runbook), with separate auth and support sender identities; new env vars (names only; no real domains/creds).
5. **Email verification** — `Profile.emailVerifiedAt`, a Supabase email-change/OTP-based verify flow, a non-blocking Settings nudge, a `/verify-email` confirmation surface. Gates nothing in this pitch.
6. **Data export** — `src/lib/accounts/export.ts` (`buildAccountExport`), a `/settings/export` route handler streaming a versioned JSON file, reading every owned model through `account.db`.
7. **Deletion end to end** — reuse `src/lib/accounts/deletion.ts` unchanged; no second destructive path.
8. **Support** — `/support` (signed-out `mailto:` contact; signed-in → `/feedback`); reuse the shipped feedback form for signed-in support.
9. **Admin "send reset email"** — a new owner-only, audited action on `/admin/accounts/[id]`; new `AdminAuditAction.account_reset_email_sent`.
10. **User guidance** — tour review (no new steps) + release notes (final guidance ticket via `overload-onboarding`).

### Out of scope / deferred
- **Stripe, billing, checkout, subscriptions, Pro gating, entitlements, promo codes** (Plans, Billing & Promo Codes). Verification is built but gates nothing here.
- **Any native iOS/Android work, Capacitor, deep links, Universal Links, TestFlight, native session handling, platform adapters** (owner-authorized iOS postponement; this run is web-only).
- **Admin-initiated account deletion** (OVE-79, blocked pending upstream amendment; not implemented).
- **Social login, multi-factor authentication** (standing non-goals).
- **Public profiles, friends, discovery, usernames shown to anyone but their owner** (standing non-goal).
- **Enabling public signup in production, switching email to a real production domain/DNS, any production migration, switching Stripe to live** — human/owner runbook steps.
- **A public landing page / changelog** (Landing Page pitch); threaded ticketing, live chat, replies-in-app, assignees, a second support platform; a signed-out DB-writing support form.
- **Changing email from Settings; per-friend invite links; an invite-management UI** — not built.

### Adjacent features that must not creep in
- Billing/entitlement gating of export or verification. Capture, history, and export are never gated (CLAUDE.md). Verification is recorded only for a later checkout gate to read; it gates nothing now.
- A second progression engine, or any training-content change. This pitch touches no `LoggedSet`, no baseline, no progression code.

---

## 4. Core concepts

| Concept | Description |
| ------- | ----------- |
| **Signup mode** | A server-only tri-state (`closed` / `invite` / `public`), read in exactly one place (`signup-gate.ts`). `closed` = no accounts (production default until launch readiness). `invite` = a server-checked shared code (launch default). `public` = anyone, no code. Never inferred from client input; the browser renders whatever state the server hands it. |
| **Invite code** | A server-only shared string (`OVERLOAD_INVITE_CODE`). Compared trimmed and constant-time in `invite` mode only. Never shown, prefilled, placed in a URL, or validated in the browser. In the client-bundle forbidden-token scan. |
| **`AuthThrottle`** | A non-owned system table recording attempt counts per hashed identifier per fixed time window, for signup and forgot-password. RLS deny-all; no `userId` column; reachable only through a new dedicated raw-allowed module (`src/lib/accounts/throttle.ts`), never through the account-scoped client. Holds no email, name, or training content — only a SHA-256 hash of the throttle key and a window bucket. |
| **Bot challenge token** | A Cloudflare Turnstile client token, verified server-side via siteverify **before** any account creation or recovery lookup. A missing/faked/expired token is rejected identically to a human failure. |
| **`Profile.emailVerifiedAt`** | Nullable timestamp; `NULL` = not verified. Set when the lifter completes the verification flow. **Derived of nothing and gates nothing in this pitch.** Supabase's own `email_confirmed_at` is useless as the signal because `createConfirmedUser` sets `email_confirm: true` at signup, so the app records its own state. |
| **Recovery link** | A single-use, expiring Supabase recovery link delivered over Resend from the **authentication** sender identity. It creates a short-lived recovery auth session scoped to a password change; it never reaches the app proper. |
| **Verification link** | A single-use, expiring Supabase email-OTP/`generateLink` link from the **authentication** sender identity, confirming email ownership and setting `emailVerifiedAt`. |
| **Auth sender identity** | `no-reply@<auth domain>` — recovery and verification mail. |
| **Support sender identity** | `support@<support domain>` — the address surfaced on `/support`; distinct from the auth identity. Not a sending integration in this pitch (it is a `mailto:` target). |
| **Account export** | A versioned JSON document holding every row the acting account owns (plans, sessions, exercises custom, gyms, baselines, full logged history incl. archived/soft-deleted/legacy rows, goals, cardio, favorites, profile, tour/release state, the lifter's own feedback). Read-only; never cross-account; never secrets/tokens/credentials; never library image bytes. |

Overload distinctions preserved:
- **The invite code's existence is not training content.** It is a shared secret, not an account's data; checking it leaks nothing about any account.
- **Verification state is owned** (`Profile`, carries `userId` as its id), so it rides the existing isolation guarantees.
- **`AuthThrottle` is deliberately un-owned.** It is a pre-authentication defense that must throttle attempts for which no account (and no session) exists yet, so it cannot be account-scoped; it is admin-style infrastructure like `AdminAuditEntry`, isolated instead by holding no personal data and being unreachable from `account.db`.

---

## 5. States and lifecycle

### Signup mode

```text
SignupMode: closed | invite | public   (server-only; not a DB value)
```

| Mode | Signup form | Server gate |
| ---- | ----------- | ----------- |
| `closed` | the shipped "Signup isn't open" state (no fields) | refuses all; nothing touched |
| `invite` | invite field inserted first, then the OVE-50 fields | invite code checked **first**, constant-time; a wrong code is the only error shown |
| `public` | the OVE-50 fields, no invite field | no code; "email already exists" may surface (OVE-50 U8) |

### Email verification

```text
Profile.emailVerifiedAt: null (unverified) ─▶ <timestamp> (verified)
```

| From | To | Allowed? | Side effects |
| ---- | -- | -------- | ------------ |
| `null` | set | yes, on a valid verification link for the acting account's own email | `emailVerifiedAt = now()`; **no gate opens** (billing not built) |
| set | `null` | no path in this pitch | — (changing email is out of scope) |

### Recovery

```text
request (enumeration-safe) ─▶ email sent (silent for all) ─▶ /auth/confirm exchange ─▶ /reset-password
  ├─ invalid/expired/reused link ─▶ /reset-password expired card ─▶ /forgot-password
  └─ password set ─▶ all sessions ended ─▶ /login?notice=password-updated
```

- **Suspension wins.** A reset changes the password, never `Profile.status`. The next authenticated request after signing in re-checks status in `requireAccount()` and redirects a suspended account to `/suspended`.
- **Atomicity.** None of these writes a `LoggedSet`, a baseline, or a derived value. The only owned write is `emailVerifiedAt` (a single-column `updateMany` through `account.db`). `AuthThrottle` increments and the recovery/verify email sends are Supabase/Resend operations, not multi-step owned writes, so no `$transaction` composition over owned models is required beyond the single column write.

### Account deletion
Unchanged — `src/lib/accounts/deletion.ts` and its order remain the sanctioned destroyer. This pitch does not alter its flow (design doc §1).

---

## 6. UI integration

The UI preview (`docs/previews/18-public-accounts-recovery-support-preview.tsx`) is the binding visual contract. Carry its hierarchy, states, and component treatment verbatim; the theme wins where preview and theme disagree. Every signed-out screen reuses the shipped `AuthCard` frame unchanged.

### Screens

| Screen | Route | Server data needed | Actions |
| ------ | ----- | ------------------ | ------- |
| Signup (3 modes) | `/signup` | the resolved `SignupMode` (closed/invite/public); Turnstile site key (public) | `signUpAction` (invite code + Turnstile token ride with the existing fields) |
| Login (extended) | `/login` | — | existing `signInAction`; new footer link to `/forgot-password?email=`; new notice `password-updated` |
| Forgot password | `/forgot-password` | Turnstile site key; optional `?email=`, `?link=expired` | `requestPasswordResetAction` |
| Reset password | `/reset-password` | the recovery auth session (created by `/auth/confirm`); the account's own email | `setNewPasswordAction` |
| Verify nudge | `/settings` (Profile card) | `emailVerifiedAt` of the acting account | `sendVerificationEmailAction` |
| Verify confirmation | `/verify-email` | the verification session/token result | — (navigates to Today or Sign in) |
| Data export | `/settings` ("Your data" card) | — | `GET /settings/export` route handler (download) |
| Support | `/support` | signed-in vs out; the support address (from env, surfaced server-side) | `mailto:` (out) / link to `/feedback` (in) |
| Admin send reset | `/admin/accounts/[id]` | the target account's email (admin email facade) | `sendAccountResetEmailAction` |

### Components (from the preview inventory)

| Component | New/reused | Data contract / notes |
| --------- | ---------- | --------------------- |
| `AuthCard`, `PasswordInput`, `SignupClosed`, `AccountMenu`, `SendFeedback` | reused | unchanged |
| `SignupForm` | reused, extended | optional invite field (invite mode only, first, autofocus, `autoComplete="off"`); `BotChallenge`; confirm password already present |
| `LoginForm` | reused, extended | + "Forgot password?" link (right-aligned on the Password label row, carries typed email as `?email=`); + `password-updated` notice; + "Need help?" footer → `/support`. **No bot challenge on login.** |
| `BotChallenge` | new | Turnstile wrapper. States: loading / passed / failed / unavailable. Themed to resolved appearance. Holds a hidden token; **when unavailable the primary button stays disabled (D-pre3)**. Client island; it only produces a token that a server action verifies. |
| `ForgotPasswordForm` | new | request / sent / expired-arrival states; `BotChallenge`; the **sent** state is identical for every well-formed email and absorbs rate-limit and lookup differences. |
| `ResetPasswordForm` | new | form / expired states; new-password field (`autoComplete="new-password"`, min 6). |
| `VerifyEmailNudge` | new | unverified / sent / verified; dismissible (session-only; returns on a later visit while unverified). |
| `VerifyEmailConfirmation` | new | verified / expired; signed-in → "Go to Today", signed-out → "Sign in". |
| `DataExportSection` | new | "Your data" card + Export button; idle / preparing / success (toast) / error states. |
| `SupportCard` | new | signed-out (`mailto:` + "Back to sign in") and signed-in (→ Send feedback + muted address) variants. |
| `SendResetEmailAction` UI | new | owner-only button in an "Account help" section on the admin account page; toast + audit line; `Alert` on failure. |

### Forms and validation (field-level; see §12 for the full server rule table)

| Form | Field | Type | Required | Notes |
| ---- | ----- | ---- | -------- | ----- |
| Signup | invite code | text | invite mode only | server-only check, first; trimmed; never browser-validated |
| Signup | Turnstile token | hidden | yes | server-verified before any account work |
| Forgot | email | email | yes | presence + shape reported; membership never reported |
| Forgot | Turnstile token | hidden | yes | server-verified before any lookup |
| Reset | new password | password | yes | min 6; reuse rejected by the auth service |
| Settings nudge | — | — | — | button only; the account's own email is shown |

### User guidance
Final guidance ticket via `overload-onboarding` (design doc §13):
- **Tour steps: none.** Signup/login/recovery live outside the signed-in shell the tour walks; export and the verify nudge are quiet Settings additions the tour already frames.
- **Release notes** (dated the day each reaches production, newest-first in `src/lib/release-notes/entries.ts`; shape: `{ id, date, title, body, significant }`):
  - **Significant:** "Reset your password by email." — restores an expected capability (opens the What's New dialog).
  - **Not significant:** "Export your data."
  - **Not significant:** "Get help when you're signed out."
  - The verification nudge is **not** announced (it gates nothing yet and would pre-announce paid plans).

### Platform impact
**Web-only this run.** iOS Foundation has not shipped, so `overload-cross-platform` is not invoked; the admin action is web-only by rule; recovery works through ordinary browser links (no native deep link). One auth system, backend, and data model are preserved for a future mobile foundation. A native device / TestFlight check is not applicable and is never reported as passed.

### shadcn/ui integration notes
- `BotChallenge`, the recovery forms, the verify nudge, the export section, and the support card are client islands that call server actions (or, for export, hit a route handler); they never hold data access or credentials.
- The Turnstile widget is the one third-party script on these screens (required for the human check); no analytics or tracking is added. Its appearance parameter is defaulted from the resolved theme.
- Export's button shows "Preparing…" / disabled while assembling; success is a Sonner toast "Your data is downloading."; failure is an inline destructive `Alert`.

---

## 7. Data model

### Relationship to existing schema

| From | Relation | To | Description |
| ---- | -------- | -- | ----------- |
| `Profile` | adds column | — | `emailVerifiedAt` (nullable) on the existing `profiles` table (owned; RLS already on). |
| `AuthThrottle` | none | — | New standalone, un-owned, FK-less system table (like `AdminAuditEntry`). |
| `AdminAuditEntry` | adds enum value | `AdminAuditAction` | `account_reset_email_sent`. |

No other schema change. Export adds **no** schema. Signup mode and the invite code are environment configuration, not data.

### Updated model — `Profile` (new field only)

```prisma
model Profile {
  // … existing fields unchanged …
  /// Public Accounts: when this account proved it owns its email (app-level,
  /// because createConfirmedUser sets Supabase email_confirm=true at signup so
  /// Supabase's own email_confirmed_at is always set and useless as our signal).
  /// NULL = unverified. Gates NOTHING in this build; recorded for a future
  /// first-checkout gate (Billing) to read. Set only by the verification flow,
  /// scoped to the acting account; never cleared in this pitch.
  emailVerifiedAt DateTime? @map("email_verified_at") @db.Timestamptz
  // … relations unchanged …
  @@map("profiles")
}
```

### New model — `AuthThrottle`

```prisma
/// Public Accounts: a DB-backed, server-enforced rate limiter for the two
/// PRE-authentication endpoints (signup, forgot-password), built without a
/// cache or queue (CLAUDE.md infra non-goal). One row per (hashed key, action,
/// fixed time window). It is intentionally UN-OWNED: it throttles attempts for
/// which no account or session exists yet, so it cannot be account-scoped.
/// It holds NO personal data — only a SHA-256 hash of the throttle key (the
/// email for forgot-password, a coarse request fingerprint for signup) and the
/// window bucket — and it is reachable ONLY through src/lib/accounts/throttle.ts
/// (a dedicated raw-allowed module), never through the account-scoped client
/// (scopeArgs refuses any model without a userId). RLS deny-all; no FK, so it
/// never blocks account deletion and outlives it.
model AuthThrottle {
  /// SHA-256 hex of `${action}:${normalizedKey}` — never the raw email/IP.
  keyHash     String   @map("key_hash")
  /// Which endpoint this count is for.
  action      AuthThrottleAction
  /// The fixed window start (truncated to WINDOW_SECONDS), as epoch seconds.
  windowStart Int      @map("window_start")
  /// Attempts seen in this (key, action, window).
  count       Int      @default(0)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz

  @@id([keyHash, action, windowStart])
  @@index([createdAt]) // for a best-effort periodic prune, if ever added
  @@map("auth_throttle")
}

/// Which pre-auth endpoint an AuthThrottle row counts (Public Accounts).
enum AuthThrottleAction {
  signup
  password_reset_request

  @@map("auth_throttle_action")
}
```

### Updated enum — `AdminAuditAction`

```prisma
enum AdminAuditAction {
  account_suspend
  account_reactivate
  feedback_handled
  feedback_reopened
  feedback_recategorized
  account_reset_email_sent // Public Accounts: owner sent a password-reset email
}
```

### Row-level security

The new table's migration (`9i_public_accounts`, following `9h_feedback_attachments`) **must** enable RLS with no policy; the `Profile` column change is additive on a table that already has RLS (no new RLS statement needed for it). `AuthThrottle` carries no owner column, so `scopeArgs` already refuses it from the account-scoped client (its guard lists it alongside `AdminAuditEntry`); add it to `ADMIN_ONLY_MODELS`'s sibling classification so the `unclassifiedModels()` meta-check passes — see Resolved Decision R5.

```sql
-- prisma/migrations/9i_public_accounts/migration.sql (illustrative order)
ALTER TABLE "profiles" ADD COLUMN "email_verified_at" TIMESTAMPTZ;

CREATE TYPE "auth_throttle_action" AS ENUM ('signup', 'password_reset_request');
CREATE TABLE "auth_throttle" (
  "key_hash"     TEXT NOT NULL,
  "action"       "auth_throttle_action" NOT NULL,
  "window_start" INTEGER NOT NULL,
  "count"        INTEGER NOT NULL DEFAULT 0,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ NOT NULL,
  CONSTRAINT "auth_throttle_pkey" PRIMARY KEY ("key_hash", "action", "window_start")
);
CREATE INDEX "auth_throttle_created_at_idx" ON "auth_throttle" ("created_at");

ALTER TYPE "admin_audit_action" ADD VALUE 'account_reset_email_sent';

-- Deny-all. The Data API must return nothing for this table.
ALTER TABLE "auth_throttle" ENABLE ROW LEVEL SECURITY;
-- Do not add any policy for anon or authenticated.
```

> `_prisma_migrations` and every pre-existing table remain RLS-on; the `rls_enabled_on_every_table` invariant test (§14) covers the new table automatically.

### Derived fields

| Field / Concept | Stored? | Computed from | Notes |
| --------------- | ------- | ------------- | ----- |
| Signup mode | no (env) | `OVERLOAD_SIGNUP_MODE` (+ `OVERLOAD_SIGNUP_OPEN` back-compat) | resolved in `signup-gate.ts` only |
| Invite valid? | no | request code vs `OVERLOAD_INVITE_CODE` | constant-time compare, invite mode only |
| Rate-limited? | yes (counts) | `AuthThrottle` row `count` vs the window limit | the stored count is infra state, not a derived training value |
| `emailVerifiedAt` | **yes** | the verification flow | the one stored verification fact; not computed |
| Account export JSON | no | every owned model via `account.db` | assembled on demand, never stored |

---

## 8. Authorization and access control

| Operation | Auth layer | Isolation behavior | Capability |
| --------- | ---------- | ------------------ | ---------- |
| `signUpAction` | public (no session) — the signup door | creates exactly one account; invite + Turnstile + throttle all server-side | Free |
| `requestPasswordResetAction` | public — the recovery door | never reveals membership; throttle + Turnstile server-side **before** any lookup | Free |
| `setNewPasswordAction` | the recovery auth session only (created by the link) | acts only on the account the recovery session resolves to; the account's own email is read from the session, never the URL | Free |
| `sendVerificationEmailAction` | authenticated session | `requireAccount()`; acts on the acting account's own email only | Free |
| verify confirmation (`/verify-email`) | the verification session/token | sets `emailVerifiedAt` for the acting/resolved account only | Free |
| `GET /settings/export` | authenticated session | `requireAccount()` → reads only through `account.db`; cross-account rows are unreachable by construction | Free |
| `deleteAccount` | authenticated + password re-verify (`verifyCurrentPassword`) | the deletion module only; removes only the acting account's rows | Free |
| `sendAccountResetEmailAction` | **admin** | `requireAdmin()` first (→ not-found for non-admin); target email via the admin email facade; audited in `inAdminTx()` | n/a (owner-only) |
| `/support` | public or authenticated | surfaces a support address; no owned read/write | Free |

Rules observed:
- **Identity from the session.** The acting `userId` for every authenticated operation comes from `requireAccount()`. The recovery and verification sessions come from the one-time link the server minted; the reset page never takes an account id or email from the URL. The admin action resolves the target email through the existing admin email facade (`listAuthUserEmails` / its directory layer), never from client input.
- **An id is not authorization.** The admin action re-checks admin identity on the server; a non-admin gets `notFound` exactly as the shipped admin area (proxy optimistic + `requireAdmin()` authoritative).
- **No new unauthenticated write path to owned data.** Signup and forgot-password are the two existing-by-design public doors; both now sit behind the throttle and the challenge. `/support` writes nothing (D5). The signed-out person never gets a DB-writing form.
- **Suspension.** Recovery and the password change never touch `Profile.status`; `requireAccount()` refuses a suspended account on its next request.
- **Secrets stay server-only.** `OVERLOAD_SIGNUP_MODE`, `OVERLOAD_INVITE_CODE`, `TURNSTILE_SECRET_KEY`, the SMTP creds (via Supabase config, not the app bundle), the service-role key, and `OVERLOAD_ADMIN_USER_IDS` never ship to the browser. Two scanners enforce this: the compiled-bundle scan `scripts/check-client-bundle.mjs` (its `forbiddenTokens` list must gain `OVERLOAD_SIGNUP_MODE`, `OVERLOAD_INVITE_CODE`, and `TURNSTILE_SECRET_KEY`), and the source `secret hygiene` guard in `tests/unit/invariant-guards.test.ts` (whose regex already matches a `NEXT_PUBLIC_`-prefixed `INVITE`, `SMTP`, or `SECRET`, so a `NEXT_PUBLIC_OVERLOAD_INVITE_CODE` or any `NEXT_PUBLIC_…SECRET…` already fails). Only `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (and the public-by-design `OVERLOAD_SUPPORT_EMAIL`) are allowed in the browser.

---

## 9. Server actions and API surface

Reads happen in server components; mutations are server actions; the one route handler is the export download (streams a file a server action cannot) and the auth callback (`/auth/confirm`, a GET redirect target for the recovery/verify links). Result shape is the standard `ActionResult<T>` (api-conventions.md). No public API.

```ts
// Signup mode (src/lib/accounts/signup-gate.ts) — the ONE reader.
type SignupMode = "closed" | "invite" | "public";
export function signupMode(env = process.env): SignupMode;
// Back-compat: OVERLOAD_SIGNUP_MODE wins; if unset, OVERLOAD_SIGNUP_OPEN=="true" → "public",
// otherwise "closed" (so an environment mid-migration never silently opens).
export function isInviteValid(code: unknown, env = process.env): boolean; // invite mode, constant-time
```

```ts
// Signup (src/lib/accounts/signup.ts) — extended, not replaced.
// RawSignUp gains `inviteCode` and `challengeToken`. SignUpOutcome gains:
//   | { kind: "challenge_failed" } | { kind: "rate_limited" } | { kind: "invite_invalid" }
// Order: mode gate → (invite mode) invite check FIRST → throttle check → challenge verify
//        → field rules → username free → createConfirmedUser → signIn → establishProfile.
// The invite error is shown alone (no email/name/username/password feedback) so a
// codeless visitor learns nothing. The throttle and challenge run before any
// createConfirmedUser call, so a failed attempt never creates-then-deletes a user.
signUp(raw, deps?, env?): Promise<SignUpOutcome>
```

```ts
// Recovery (src/lib/accounts/recovery.ts) — new.
type RequestResetInput = { email: string; challengeToken: string };
// Always resolves to the identical "sent" outcome after a well-formed email that
// passes the challenge — whether the account exists, doesn't, the email service is
// slow, OR the throttle is tripped (D7). A malformed email or a failed challenge is
// reported BEFORE any lookup, so neither reveals membership.
requestPasswordReset(input, deps?): Promise<ActionResult<{ sent: true }>>

type SetNewPasswordInput = { newPassword: string }; // account from the recovery session
setNewPassword(input, deps?): Promise<ActionResult<{ updated: true }>>
// Side effects: Supabase updateUser(password) under the recovery session; all sessions
// end; redirect to /login?notice=password-updated. Never touches Profile.status.
```

```ts
// Email verification (src/lib/accounts/verification.ts) — new.
sendVerificationEmail(account): Promise<ActionResult<{ sent: true }>>  // requireAccount(); own email only
confirmEmailVerification(token): Promise<ActionResult<{ verified: true }>> // sets emailVerifiedAt via account.db
```

```ts
// Abuse (src/lib/accounts/throttle.ts) — new, raw-allowed module.
type ThrottleAction = "signup" | "password_reset_request";
// Atomic bump-and-check in one statement (INSERT … ON CONFLICT … DO UPDATE SET count = count+1
// RETURNING count), scoped to the current fixed window. Returns whether the limit is exceeded.
checkAndIncrement(action: ThrottleAction, rawKey: string): Promise<{ allowed: boolean }>;
// (src/lib/accounts/turnstile.ts — new) server-side siteverify; a test seam allows injecting
// the verifier so tests stub it; when keys are UNSET in a non-production test env, a documented
// bypass returns "verified" (never a client-controllable skip; production requires real keys).
verifyChallenge(token: string, deps?): Promise<boolean>;
```

```ts
// Export (src/lib/accounts/export.ts) — new.
type AccountExport = {
  formatVersion: 1;
  exportedOn: string;            // ISO date, the account's timezone
  profile: { ... };              // no secrets/tokens; emailVerifiedAt included
  mesocycles: ...[]; sessions: ...[]; sessionExercises: ...[]; plannedCardio: ...[];
  customExercises: ...[]; exerciseFavorites: ...[];
  gyms: ...[]; gymExerciseBaselines: ...[];
  loggedSessions: ...[]; loggedExercises: ...[]; loggedSets: ...[]; missedDayResolutions: ...[];
  goals: ...[]; cardioLogs: ...[];
  tourProgress: ... | null; releaseSeen: ... | null;
  feedback: ...[];               // the lifter's OWN feedback only
};
buildAccountExport(account): Promise<AccountExport>; // reads EVERY key through account.db
// Delivered by GET /settings/export (route handler): requireAccount() → buildAccountExport →
// Content-Disposition: attachment; filename="overload-export-YYYY-MM-DD.json".
```

```ts
// Admin (src/lib/data/admin/*) — new action + audit value.
sendAccountResetEmail({ targetUserId }): Promise<ActionResult<{ sent: true }>>
// requireAdmin() first; resolve target email via the admin email facade; trigger the
// standard Supabase recovery email; recordAudit({ action: "account_reset_email_sent",
// targetUserId }) inside the SAME inAdminTx(). Never reveals/changes the password; never
// bypasses suspension.
```

**Error codes** (api-conventions.md): `validation_error` (bad email/password/invite shape), `unauthorized` (no session on authenticated surfaces), `not_found` (admin action by a non-admin, or an unknown target), `internal_error`. There is deliberately **no** `rate_limited` code returned to the recovery request (it folds into the identical "sent" state, D7); signup surfaces rate-limit and challenge failures as form-level messages per the preview.

---

## 10. Storage model

Not applicable. This pitch adds no Storage content. (Deletion's best-effort feedback-screenshot sweep is existing behavior; export references no image bytes.)

---

## 11. Email delivery

- **Provider:** Resend over custom SMTP, configured in `supabase/config.toml` `[auth.email.smtp]` for local and in the Supabase production dashboard for prod (runbook). No `resend` SDK is added: recovery and verification route through **Supabase Auth's own templates** (recovery email, and a verification email via `generateLink`/email-OTP), so the app sends no mail of its own and no new sending dependency beyond SMTP config is introduced. This keeps the minimal path (D-pre3 authority: pitch §3.4; CLAUDE.md "a custom SMTP provider").
- **`enable_confirmations` stays `false`** (turning it on would gate sign-in). Verification is a separate, non-blocking flow that sets `Profile.emailVerifiedAt` and gates nothing.
- **Auth callback:** reintroduce a GET route handler `/auth/confirm` (the callback R28 removed) that exchanges the recovery/verify code for the short-lived session and redirects (recovery → `/reset-password`, verify → `/verify-email`). It is added to the public-path allowlist.
- **Sender identities:** separate authentication (`no-reply@<auth domain>`) and support (`support@<support domain>`) identities. Real domains, DNS (SPF/DKIM/DMARC), and credentials are owner/runbook tasks; **no real domains or credentials are invented here.** External-inbox deliverability is a runbook check, reported **unverified** if the run cannot exercise an external inbox.
- **New env vars (names only):** `OVERLOAD_SIGNUP_MODE`, `OVERLOAD_INVITE_CODE`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and SMTP settings surfaced through Supabase config (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_SENDER` or the Resend equivalents) plus the two sender addresses (`OVERLOAD_SUPPORT_EMAIL`, used only to render `/support`, may be `NEXT_PUBLIC_` since the support address is public by design). `.env.example` and the runbook are updated; `OVERLOAD_SIGNUP_OPEN` is documented as a deprecated alias.

---

## 12. Validation rules

| Field | Validation | Error |
| ----- | ---------- | ----- |
| Invite code (invite mode) | present, trimmed, constant-time equal to `OVERLOAD_INVITE_CODE` | missing → "Enter the invite code."; wrong → "That invite code isn't valid." (shown alone) |
| Turnstile token (signup, forgot) | present and server-verified via siteverify **before** any account work | "Couldn't verify you're human. Try again." (byte-identical on signup and recovery) |
| Signup fields | unchanged (OVE-50: names 1–50, username shape/reserved/available, email shape, password present, confirm equal) | unchanged messages |
| Forgot: email | presence + shape only; membership never reported | "Enter your email." / "Enter a valid email address." |
| Reset: new password | min 6; the auth service rejects a reuse | "Enter a new password." / "Use at least 6 characters." / "Choose a password you haven't used here." |
| Rate limit (signup) | `AuthThrottle` over the window | "Too many attempts. Wait a minute and try again." (form Alert) |
| Rate limit (forgot) | `AuthThrottle` over the window | **no distinct message** — folds into the identical "Check your email" sent state (D7) |

- Validate everything on the server even though the browser pre-checks shape; the invite code and the challenge are **never** validated in the browser.
- Do not leak Supabase/SMTP/Turnstile/token internals in any message (design doc §8).
- A failed signup leaves no auth user and no profile (OVE-50 compensation path, unchanged).

---

## 13. UI data contracts

```ts
// Signup page (server component → SignupForm)
type SignupViewDto = {
  mode: "closed" | "invite" | "public";
  turnstileSiteKey: string | null; // NEXT_PUBLIC_…; null disables the widget → button stays disabled
};

// Settings Profile card (verify nudge)
type EmailVerificationDto = { email: string; verified: boolean }; // the account's OWN email only

// /support (server resolves the address so the page needs no secret)
type SupportDto = { signedIn: boolean; supportAddress: string };

// Admin account page (one new section)
type AdminAccountHelpDto = { targetUserId: string; email: string }; // email via the admin facade

// Export download is a file, not a DTO consumed by a client; see AccountExport (§9).
```

- No DTO carries another account's data, a secret, a token, or the invite code.
- The only email a client ever receives is the acting/recovery account's own, or the public support address.

---

## 14. Testing strategy

Priority order follows CLAUDE.md. Map: **unit** (`tests/unit`, Jest, ignores `*.int.test.ts`), **integration/isolation** (`tests/integration`, Jest, `*.int.test.ts`, embedded throwaway Postgres via `global-setup.ts`), **e2e** (`e2e/accounts`, Playwright, local Supabase stack).

### 1. Cross-account isolation (first)
```text
TEST: export_contains_only_the_acting_account (integration, isolation)
GIVEN: Account A with plans, gyms, baselines, logged sessions/exercises/sets, goals, cardio,
       favorites, profile, tour/release state, and feedback; Account B also populated
WHEN: buildAccountExport(A) runs
THEN:
  - Every A row of every owned model appears
  - No B row, id, name, email, or value appears anywhere in the JSON
  - No secret, token, credential, or library image byte appears
  - The acting account is A, taken from the session, never from input

TEST: verification_state_is_owned_and_isolated (integration, isolation)
GIVEN: A.emailVerifiedAt set; B signed in
WHEN: B reads/writes emailVerifiedAt by A's id through account.db
THEN: not_found/empty; A's value unchanged
VERIFY: Profile coverage in tests/integration/isolation/coverage.ts already lists profile.int.test.ts;
        extend it to assert emailVerifiedAt

TEST: auth_throttle_unreachable_through_account_client (unit + integration)
GIVEN: the account-scoped client
WHEN: any AuthThrottle operation is attempted through account.db
THEN: scopeArgs refuses it (no userId; not in the shared-or-owned set)
VERIFY: unclassifiedModels() (src/lib/data/scope.ts) stays empty with AuthThrottle classified
        alongside AdminAuditEntry (R5); the owned-model isolation meta-test
        (tests/integration/ownership-enforce.int.test.ts, driven by ISOLATION_COVERAGE in
        tests/integration/isolation/coverage.ts) does NOT require a new entry because
        AuthThrottle is un-owned — but the profile.int.test.ts coverage extends to emailVerifiedAt
```

### 2. Logged history integrity
```text
TEST: pitch_writes_no_logged_set (unit, guard)
THEN: no new file writes prisma.loggedSet.* (invariant-guards.test.ts stays green; export reads only)

TEST: export_reads_history_including_archived_and_legacy (integration)
GIVEN: an archived Exercise/Gym with logged history, and a legacy gym-less LoggedExercise
WHEN: buildAccountExport runs
THEN: every logged row renders (export must NOT filter deletedAt)
```

### 3. Gym baseline — N/A (untouched); add a guard that no new file writes a baseline outside its module.

### 6. Auth, signup, and RLS (primary focus here)
```text
TEST: signup_mode_resolution (unit)
- OVERLOAD_SIGNUP_MODE=closed|invite|public resolves exactly
- unset + OVERLOAD_SIGNUP_OPEN=true → public; unset + anything else → closed
- the gate is the ONLY reader of both vars (extend the OVE-50 guard)

TEST: invite_mode_rejects_missing_and_wrong_code (unit + e2e)
GIVEN: invite mode
WHEN: signup with no code / a wrong code
THEN: invite error shown ALONE; no account created; no email/username/password feedback

TEST: invite_check_is_constant_time_and_server_only (unit + bundle scan)
- compare uses a constant-time primitive; OVERLOAD_INVITE_CODE never in .next/static

TEST: public_mode_accepts_without_code (e2e, safe test env only)
GIVEN: public mode in the local stack
WHEN: a stranger signs up with valid fields + a stubbed-pass challenge
THEN: an account is created and signed in

TEST: signup_and_recovery_cannot_bypass_rate_limit (integration)
GIVEN: the throttle window limit N
WHEN: N+1 signup attempts / N+1 reset requests with the same key
THEN: attempt N+1 is blocked server-side (signup → rate_limited; recovery → identical sent state),
      even when the server action is called directly (not via the form)

TEST: signup_and_recovery_cannot_bypass_bot_challenge (unit + integration)
GIVEN: a missing/invalid/expired Turnstile token
WHEN: signUp / requestPasswordReset is called directly
THEN: rejected server-side (challenge verified BEFORE any account work / lookup);
      a faked token fails identically to a human failure

TEST: recovery_identical_for_known_and_unknown_email (integration + e2e)
GIVEN: email X has an account, email Y does not (both well-formed)
WHEN: requestPasswordReset(X) and (Y), both passing the challenge
THEN: byte-identical "sent" outcome; no timing/wording/redirect difference; a rate-limit hit
      ALSO yields the identical sent state (D7)

TEST: invalid_expired_reused_recovery_link (e2e)
THEN: /reset-password shows the expired card; "Send a new link" → /forgot-password

TEST: reset_does_not_bypass_suspension (integration + e2e)
GIVEN: a suspended account resets its password successfully
WHEN: it signs in
THEN: the next authenticated request lands on /suspended; status unchanged

TEST: verification_does_not_gate_free (unit + e2e)
GIVEN: emailVerifiedAt NULL
THEN: every Free screen works; sign-in is not gated; Supabase enable_confirmations stays false

TEST: data_api_denied_on_auth_throttle (integration)
THEN: the anon key returns nothing from auth_throttle; rls_enabled_on_every_table includes it

TEST: unauthenticated_redirect_and_public_paths (unit)
THEN: /forgot-password, /reset-password, /support, /auth/confirm are public; everything else redirects
```

### 7. Admin authorization and its privacy boundary
```text
TEST: admin_reset_email_owner_only_and_audited (unit + integration)
GIVEN: a non-admin and an admin
WHEN: each calls sendAccountResetEmailAction directly
THEN: non-admin → not_found, nothing sent, no audit; admin → email sent + one
      account_reset_email_sent audit entry (who/what/target/when) in the same inAdminTx()

TEST: admin_reset_reveals_no_training_content_and_does_not_bypass_suspension
THEN: the action returns only { sent: true }; it never reads a plan/gym/set/goal/cardio;
      a reset email to a suspended account does not reactivate it
```

### 8. Plans/entitlements — N/A (no entitlement introduced); add a note that export and verification carry no plan branch.

### Deletion (never lean)
```text
TEST: deletion_affects_only_one_account_and_blocks_sign_in (integration + e2e)
- reuse the existing account-deletion isolation + blocks-sign-in coverage unchanged
```

### Edge cases / UI
```text
TEST: challenge_unavailable_keeps_button_disabled (unit/component)  (D-pre3)
TEST: export_download_filename_and_content_type (e2e)
TEST: forgot_sent_state_focuses_heading_and_announces (component a11y)
TEST: support_signed_out_is_mailto_not_a_form (component)  (D5)
TEST: recovery_works_desktop_and_mobile_browser (e2e, both viewports)
       — external-inbox delivery + real-device checks are runbook/UNVERIFIED
```

Lean is **not** acceptable for: signup mode, the invite gate, the throttle, the challenge, recovery/suspension, export isolation, deletion, or the admin boundary.

---

## 15. Acceptance criteria

**Signup mode**
- [ ] Mode is a single server-only tri-state read only in `signup-gate.ts`; default resolves to `invite` for the owner's launch config and `closed` when nothing is set in production.
- [ ] Invite mode: a correct code creates an account; a missing/wrong code shows only the invite error and creates nothing.
- [ ] Public mode: a stranger signs up without a code (verified in the local stack); public is **not** enabled in production.
- [ ] `OVERLOAD_SIGNUP_OPEN` is honored as a deprecated alias; `.env.example`/runbook updated.

**Abuse protection**
- [ ] Signup and forgot-password cannot be bypassed past the server-side rate limiter or the bot challenge, including by calling the action directly.
- [ ] A rate-limit or challenge failure reveals nothing about any email's membership.
- [ ] `AuthThrottle` has RLS deny-all and holds no personal data; the Data API returns nothing for it.

**Recovery**
- [ ] A forgotten password is recovered end to end through a browser (desktop + mobile).
- [ ] A recovery request is byte-identical for a known and an unknown email.
- [ ] Invalid/expired/reused links land on the expired card.
- [ ] A suspended account cannot sign in, recover, or change its password back into access.
- [ ] The admin "Send reset email" action is owner-only, audited, reveals/changes no password, and does not bypass suspension.

**Verification**
- [ ] `Profile.emailVerifiedAt` is set by the verify flow and gates no Free functionality; Supabase `enable_confirmations` stays off.

**Export & deletion**
- [ ] An export contains everything the account owns (including archived/soft-deleted/legacy rows) and nothing from any other account, and no credentials or secrets.
- [ ] Deleting an account removes all of its data and blocks further sign-in (reused module).

**Support**
- [ ] A "Need help?" link on login/signup/recovery reaches `/support`; signed-out support surfaces the support address via `mailto:` (no DB write); signed-in routes to Send feedback.

**Email provider**
- [ ] Resend over custom SMTP is configured with separate auth/support identities (config is runbook; external-inbox delivery reported unverified if not exercisable).

---

## 16. Explicit non-goals

- ❌ Stripe, billing, checkout, subscriptions, Pro gating, entitlements, promo codes. **Deferred** (Plans, Billing & Promo Codes). Verification is built but gates nothing here.
- ❌ Native iOS/Android, Capacitor, deep/Universal links, TestFlight, native session handling, platform adapters. **Deferred** (owner iOS postponement).
- ❌ Admin-initiated account deletion. **Deferred** (OVE-79 blocked).
- ❌ Social login, multi-factor authentication. **Permanent** non-goals.
- ❌ Public profiles, friends, discovery, any username shown to another account. **Permanent.**
- ❌ A signed-out DB-writing support form; threaded ticketing, live chat, a second support platform. **Permanent** (for this product shape) / deferred.
- ❌ Enabling public signup in production, a real production email domain/DNS, any production migration, Stripe live mode. **Human/owner** steps, never an unattended run.
- ❌ Any admin view of an account's training content. **Permanent.**
- ❌ Program generation, social features, ads, AI coach, dated goals, rest timer, cardio progression, nutrition. **Permanent.**

---

## Resolved Decisions

Recorded here because this is an unattended run; the overload-spec risky-data-model checkpoint does not apply and is resolved by decision. Each carries authority.

| # | Decision | Rationale | Authority |
| - | -------- | --------- | --------- |
| R1 | **Signup mode is `OVERLOAD_SIGNUP_MODE ∈ {closed, invite, public}`**, read only in `signup-gate.ts` (renamed resolver `signupMode()`), with `OVERLOAD_INVITE_CODE` (server-only, constant-time, trimmed) checked in invite mode. Default resolution: `OVERLOAD_SIGNUP_MODE` wins; if unset, `OVERLOAD_SIGNUP_OPEN=="true"` → `public` else `closed`. `OVERLOAD_SIGNUP_OPEN` is a **deprecated alias**, not removed, so a mid-migration environment never silently opens. | Roadmap's "signup-mode switch between invite-only and public, off by default" needs three states; a single tri-state var keeps one reader and one guard (OVE-50 U1); back-compat avoids a flag-day. | Roadmap Pitch 19; pitch §3.1; OVE-50 U1; authority order (1)(2) |
| R2 | **Email verification is an app-level `Profile.emailVerifiedAt` column** (additive, RLS already on), set by a Supabase email-OTP/`generateLink` verify flow, **not** by Supabase's `email_confirmed_at`. `enable_confirmations` stays `false`. Verification gates nothing. | `createConfirmedUser` sets `email_confirm:true` at signup, so Supabase's own flag is always set and useless as the signal; enabling global confirmations would gate sign-in (pitch §3.5 rabbit hole). | Pitch §3.5, §4; CLAUDE.md (capture is free); existing `admin.ts` |
| R3 | **Recovery and verification route through Supabase Auth's own templates over custom SMTP (Resend); no `resend` SDK is added.** A reintroduced GET `/auth/confirm` exchanges the code → `/reset-password` or `/verify-email`. Separate auth vs support sender identities. | The minimal path: Supabase already owns the one-time-link machinery; adding an SDK would be a second sending dependency the architecture did not scope. Resend over SMTP is the Architecture Doc's recommended default. | Pitch §3.4; architecture §External Integrations; CLAUDE.md (custom SMTP in this pitch) |
| R4 | **Rate limiting is a DB-backed `AuthThrottle` table** (one row per hashed key + action + fixed window), reached only through a new dedicated raw-allowed module `src/lib/accounts/throttle.ts` added to the eslint `RAW_DATA_ACCESS` exceptions and a guard test, bumped atomically with `INSERT … ON CONFLICT DO UPDATE … RETURNING`. Window/limit are named constants (default: 10/min for signup and reset-request per key). No cache/queue. | CLAUDE.md rules out a cache/queue; `scopeArgs` refuses an un-owned model, so a dedicated module is required; an atomic upsert makes it concurrency-safe and testable server-side. | CLAUDE.md infra non-goals; pitch §3.2; `scope.ts`/`eslint.config.mjs`; **risky-data-model item resolved by decision** |
| R5 | **`AuthThrottle` is intentionally un-owned and carries no personal data** (only a SHA-256 hash of the key and the window bucket). It is classified like `AdminAuditEntry` so `scopeArgs`/`unclassifiedModels()` accept it without weakening isolation; RLS deny-all; no FK (never blocks deletion). | A pre-auth limiter must throttle attempts for which no account/session exists, so it cannot be account-scoped; isolation is preserved by it holding no personal data and being unreachable from `account.db`. | CLAUDE.md first invariant; `scope.ts` `ADMIN_ONLY_MODELS`/`unclassifiedModels()` |
| R6 | **Bot challenge is Cloudflare Turnstile**: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (public) + `TURNSTILE_SECRET_KEY` (server-only, in the bundle scan). Server-side siteverify before any account creation / recovery lookup, behind an injectable verifier (`verifyChallenge` deps) so tests stub it. When keys are **unset in a non-production test env**, a documented bypass returns verified; production requires real keys and never offers a client-controllable skip. | Pitch names Turnstile as the documented default; the server must be the gate (pitch §3.2); tests and the local stack need a deterministic seam without a client bypass. | Pitch §3.2; design doc Screen 7; judgment |
| R7 | **Export is a single versioned JSON** (`formatVersion: 1`) from `src/lib/accounts/export.ts` (`buildAccountExport`), delivered by `GET /settings/export` as `overload-export-YYYY-MM-DD.json`, reading **every** owned model through `account.db` (never raw, never filtering `deletedAt`), excluding secrets/tokens/credentials/library image bytes and all cross-account data. | Pitch §3.6 names JSON and "everything they own"; `account.db` makes isolation structural; history must include archived/legacy rows. | Pitch §3.6; design doc D4; CLAUDE.md first invariant |
| R8 | **Admin "send reset email" adds `AdminAuditAction.account_reset_email_sent`**; the action awaits `requireAdmin()`, resolves the target email via the admin email facade, triggers the standard Supabase recovery email, and `recordAudit` in the same `inAdminTx()`. It never reveals/changes the password or bypasses suspension. | Reuses the Pitch 17 admin authorization and audit mechanisms exactly; an append-only entry is required for every admin mutation. | Pitch §3.3; CLAUDE.md admin boundary; `audit.ts`/`identity.ts` |
| R9 | **New public paths** `/forgot-password`, `/reset-password`, `/support`, `/auth/confirm` are added to `PUBLIC_PATHS` in `src/lib/auth-routes.ts`; `/verify-email` works signed-in or signed-out (added to public paths, and renders either the shell or `AuthCard`). | These are the signed-out doors recovery and support require; the proxy and `routeRedirect` must let them through while keeping everything else gated. | Design doc §5; `auth-routes.ts`/`proxy.ts` |
| R10 | **Deletion and the signed-out support pathway are unchanged/new-non-writing:** deletion reuses `deletion.ts` verbatim; signed-out support is a `mailto:` affordance, not a DB-writing form; signed-in support routes to the existing feedback form. | No second destructive path and no new unauthenticated write path (both forbidden); the feedback inbox already serves signed-in support. | Pitch §3.7; design doc D5; CLAUDE.md |
| R11 | **Reset- and verification-link expiry default to Supabase's established values** (recovery copy states "expires in 1 hour", matching Supabase's default), set in `supabase/config.toml`/dashboard rather than hard-coded in the app. | Pitch §6 says default to Supabase's established behavior unless the spec requires otherwise; the design doc's email copy already states one hour. | Pitch §6; design doc Screen 4 |
| R12 | **The verify nudge is a dismissible neutral Settings `Alert`** (session-dismiss, returns on a later visit while unverified); a verified email shows only a quiet "Verified" caption; the challenge-unavailable state keeps the primary button disabled; a recovery rate-limit hit shows the identical "sent" state. | Carries the design doc's binding decisions D1, D2, D3, D7 into the implementation contract. | Design doc D1, D2, D3, D7 |

## Open Questions

1. *(non-blocking)* **Throttle window/limit constants.** Default assumption: a fixed 60-second window, limit 10 attempts per key per action, recorded as named constants in `throttle.ts` (a Bucket-C tunable, like the baseline margin). Revisit from lived abuse data; the owner may tighten via config. No blocker — the mechanism, not the number, is what the acceptance criteria test.
2. *(non-blocking)* **Signup throttle key composition.** Default assumption: hash of a coarse request fingerprint available server-side (e.g., the forwarded client IP header on Vercel) for signup, and the normalized email for forgot-password. If no reliable IP header is available in the run environment, signup falls back to a per-email key and the Vercel Firewall rule (OVE-50 U12) remains the coarse network-level limiter. Recorded so the ticket worker picks the available signal; does not change the server-side-enforcement guarantee.
3. *(runbook, not code)* **Production email domain, DNS (SPF/DKIM/DMARC), and the two sender addresses.** Owner/runbook; external-inbox deliverability is reported unverified if the run cannot exercise an external inbox.

## 17. Future considerations

- `Profile.emailVerifiedAt` is shaped so the Billing pitch can gate a first checkout on it with one capability check, without a schema change.
- `AuthThrottle` is generic over an `action` enum, so a later throttled surface (e.g., plan-import rate limits) could reuse the table by adding an enum value — though plan import's per-account limits are its own entitlement concern and are not presumed here.
- The signup-mode resolver and the `/auth/confirm` callback are the single auth seams a future mobile foundation reuses unchanged; nothing here is web-coupled beyond the browser link delivery, which the native shell will later wrap.
- The export's `formatVersion` field lets a later owned model extend the JSON additively; the isolation meta-test already forces any new owned model to be covered, which should include its export line.
