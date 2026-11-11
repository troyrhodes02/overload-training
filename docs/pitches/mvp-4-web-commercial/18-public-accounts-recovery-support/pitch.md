<!--
Authored 2026-10-29 for the autonomous pipeline run. There is no separate Linear pitch document for this feature; the authoritative upstream source is the Pitch Roadmap entry "Pitch 19: Public Accounts, Recovery & Support" (docs/planning/pitch-roadmap.md), the PRD's "Public Accounts, Recovery & Support" feature, the Architecture Doc's access/email/export sections, and the owner's run-prompt (sequencing override + ten pre-resolved decisions). This expanded pitch preserves the exact feature name for traceability. Working slug 18 reflects the owner-authorized postponement of iOS Foundation; the roadmap number remains 19 until the roadmap is amended (see §Owner-authorized sequencing override).
-->

# Overload — Pitch 18 (roadmap 19): Public Accounts, Recovery & Support

**Type:** Feature
**Status:** Planned — Next (after Admin Center & Feedback)
**Phase:** MVP 4 — Commercial Launch & Operations
**Appetite:** L — Large (several closely related account-lifecycle capabilities)
**Depends on:** Pitch 17 (Admin Center & Feedback — admin account states, audit log, feedback inbox, suspension). The roadmap's Pitch 18 (iOS Foundation) dependency for native reset deep links is **postponed by owner decision** (see override below); this pitch ships web-only.
**UI-bearing:** Yes
**Platform:** Web-only for this run (desktop and mobile browsers). No native iOS/Android work.
**Plan placement:** Free. Signup, recovery, email verification, support, export, and deletion are all Free capabilities; no Pro gating, Stripe, or entitlements are introduced here.
**Merge behavior:** STOP BEFORE MERGE. This pitch changes authentication, signup, recovery, and account deletion. The feature PR is left open for human approval.

---

## Owner-authorized sequencing override — iOS postponed

The owner has decided to postpone **iOS Foundation & Cross-Platform Workflow** (roadmap Pitch 18) to a future phase, because the available 2019 Intel MacBook Pro cannot reliably run the current Xcode workflow and the owner wants to complete the entire iOS foundation together later.

For this run only:

1. **Public Accounts, Recovery & Support** is the next development pitch after Admin Center & Feedback.
2. It is implemented completely for desktop and mobile web browsers.
3. Browser-based password recovery, email verification, signup, support, export, and deletion are built without native dependencies.
4. No Capacitor init, Xcode project, Universal Links, native session handling, or iOS/Android platform adapters are created. The `overload-cross-platform` skill is not invoked (it becomes applicable when iOS Foundation ships).
5. Native device / TestFlight checks are never reported as passed; recovery deep links into a native app remain deferred.
6. One authoritative authentication system, backend, and account data model are preserved so the future mobile foundation reuses them unchanged.
7. The old iOS prerequisite, original pitch numbering, and related mobile-launch dependencies are **explicitly superseded for this run only**. Required permanent roadmap/PRD/Architecture/CLAUDE.md/pipeline-guide amendments are recorded in the run report; planning documents are not silently edited.

This override does **not** waive account isolation, authentication security, invite-only production signup, data-integrity requirements, or any other approved invariant.

---

## 1. Problem

Overload is moving from an invite-only tracker used by the owner and a few friends to a commercial product that strangers can find, use, and (later) pay for. Admin Center & Feedback gave the owner the tools to operate the product. Before strangers can be let in, the account lifecycle has gaps that make opening the door unsafe or unkind:

- **Getting in.** Today signup is controlled by a single server switch (`OVERLOAD_SIGNUP_OPEN`, shipped by OVE-50) that is either fully closed or fully open to anyone. There is no middle ground — no way to let a known circle in with a shared code while the product is still being hardened, and no deliberate, owner-controlled path from invite-only to public. The roadmap always intended a **signup-mode switch between invite-only and public**; it has not been built.
- **Getting back in.** Password recovery does not exist. It was deliberately left out of Accounts (Pitch 9, issue OVE-43 cancelled) and removed again by OVE-50 (R28), because Overload had no email provider and Supabase's built-in sender only reaches the project's own team (two messages an hour). A stranger who forgets their password today cannot recover it without contacting the owner — which does not scale and defeats the point of opening up.
- **Keeping strangers from abusing the door.** Open signup and (new) recovery are endpoints that bots and scripts will hit. There is no application-level rate limiting and no bot challenge today; the only protection is an operational Vercel Firewall rule and the off switch.
- **Taking your data with you, and leaving.** Any lifter must be able to export everything their account holds, on any plan, at any time, and to delete their account completely. Self-service deletion ships (OVE-44); export does not exist.
- **Getting help.** Signed-in lifters can send feedback (Pitch 17). Signed-out people (who cannot sign in, or are deciding whether to join) have no discoverable way to reach the owner for support.

The problem this pitch solves:

**Let strangers sign up safely behind an owner-controlled mode switch, recover their own access over real email without revealing who has an account, protect signup and recovery from abuse, get help whether signed in or out, take all of their data with them, and delete their account end to end — all on the web, with one authentication system the future mobile foundation can reuse.**

---

## 2. Appetite

**L — Large.** The feature bundles several closely related, individually non-trivial capabilities, each touching the most sensitive parts of the system (authentication, account isolation, logged history):

- A server-configured signup mode (closed / invite-only / public), invite-only by default.
- Abuse protection (server rate limiting + a bot challenge) on signup and recovery.
- Password recovery over a real email provider, enumeration-safe end to end.
- Production email on a verified domain with separate authentication and support sender identities (configuration is an owner/runbook task).
- Email verification mechanism, ready to gate a first checkout later, gating nothing now.
- Complete, private, Free data export.
- Confirmed account deletion wired end to end (reusing the canonical module) and a support channel for signed-in and signed-out people.

The appetite is justified because this is the gate the whole commercial launch waits behind: no payment is collected and public signup stays off until this pitch is verified.

---

## 3. Solution

### 3.1 Signup mode (closed / invite-only / public)

Replace OVE-50's binary `OVERLOAD_SIGNUP_OPEN` with a single server-only **signup-mode** setting with three states, read in exactly one place:

- **closed** — no new accounts (the production default until launch readiness). The signup screen shows the existing "Signup isn't open" state.
- **invite-only** — signup requires a valid shared invite code, checked on the server. This re-introduces a server-checked invite code as *one mode*, not the only gate. **This is the default** per the owner's decision and the roadmap.
- **public** — anyone can sign up without a code.

The mode is set by server configuration and is never inferred from client input. Public mode is fully implemented and tested but **is not enabled in production**; the owner flips it after verification and the applicable rollout gate. The invite code lives in a server-only environment variable and is never shown, prefilled, or validated in the browser (a wrong code gets one calm line). Accounts are still created through the server with the Supabase admin API; Supabase's own public signup stays OFF.

Signup continues to collect first name, last name, username (OVE-50), email, and password (typed twice), plus the device timezone. The username rules, uniqueness, and confirm-password behavior from OVE-50 are preserved.

### 3.2 Abuse protection

Add, on both signup and password-recovery request endpoints:

- **Server-enforced rate limiting**, keyed so a single client cannot hammer the endpoint, implemented without introducing a cache/queue layer the architecture rules out (a lightweight database-backed or provider-backed limiter chosen in the spec).
- **A bot challenge** — Cloudflare Turnstile as the documented default — verified on the server before the account is created or the recovery email is requested.

Both preserve account-existence privacy: a failed challenge or a rate-limit hit looks the same regardless of whether an email has an account. Login keeps one message for an unknown email and a wrong password.

### 3.3 Password recovery (enumeration-safe)

Build the forgot/reset flow that Pitch 9's design doc specified (Screens 3–5), now that a real email provider exists:

- `/forgot-password` asks for an email and always returns the identical "check your email" confirmation whether or not the address has an account.
- A recovery email (from the authentication sender identity) carries a single link that works once and expires, using Supabase Auth's supported email-and-password recovery mechanism over the custom email provider. No second identity provider or password store is introduced.
- `/reset-password` lets the lifter set a new password after following a valid link; an invalid, expired, or reused link lands on the expired-link state. Recovery works through ordinary browser links on desktop and mobile. On success every session ends and the lifter signs in with the new password.
- A **suspended account cannot regain access** by recovering or changing its password: account status is still enforced on every authenticated request.
- An **admin action to send a reset email** to an account, available only to the owner, re-checking admin authorization on the server and writing an append-only audit entry (reusing the Pitch 17 admin authorization and audit mechanisms).

### 3.4 Email delivery

Adopt **Resend over custom SMTP** (the Architecture Doc's recommended default) configured in Supabase Auth, sending from a verified domain, with **separate sender identities for authentication mail and support mail**. Actual domains, DNS records, credentials, and production configuration are owner/runbook tasks; no real domains or credentials are invented here. Deliverability checks to an external inbox are runbook steps (and are reported unverified if an external inbox cannot be exercised by the run).

### 3.5 Email verification before first checkout

Build the mechanism to verify a lifter's email ownership: send a verification email and confirm the link, recording verified state. Verification is **required before a first paid checkout only** (a gate the billing pitch will consume) and is **not required** to create an account or use any Free functionality. Because billing/checkout does not exist in this pitch, verification gates nothing here; Supabase's global confirmation stays OFF (it would otherwise gate sign-in). A gentle, non-blocking "verify your email" affordance may surface, but never blocks Free use.

### 3.6 Data export

A lifter can download **everything their account owns** as a single JSON file, on any plan, at any time. The export covers every owned record — plans, sessions, exercises (custom), gyms and baselines, the full logged history including archived/soft-deleted and legacy rows, goals, cardio, favorites, profile, tour and release-seen state, and the lifter's own feedback. It never includes another account's data, the shared library's bytes beyond references, secrets, or authentication credentials. The acting account is taken from the authenticated server session only.

### 3.7 Account deletion and support

- **Deletion** reuses the canonical account-deletion module (`src/lib/accounts/deletion.ts`, OVE-44) end to end: the confirmed, password-gated self-service flow removes only that account's rows, in dependency order, in one transaction, and blocks further sign-in. No second destructive path is created. Admin-initiated deletion remains deferred (OVE-79 is blocked pending an upstream amendment); this pitch does not implement it.
- **Support** reuses the shipped feedback form and owner inbox for signed-in lifters, and adds a **discoverable support/contact pathway for signed-out people** (a support/contact route reachable from login, signup, and recovery that surfaces the support sender address). No threaded ticketing, live chat, or second support platform is built. Administrative password-reset assistance uses the approved admin authorization and audit mechanisms.

---

## 4. Rabbit holes / Risks

- **Enumeration leaks.** Any observable difference between a known and unknown email — timing, wording, error, redirect — breaks the privacy guarantee. The recovery request path must look identical in every outcome after a well-formed email.
- **Verification gating Free.** Turning on Supabase's global confirmation, or gating any Free screen on verification, violates the decision that capture is free. Verification must be built as an optional, billing-time gate.
- **Abuse layer vs. architecture.** The limiter must not smuggle in a cache/queue layer the architecture rules out. Pick a limiter that fits (database-backed or the edge/provider firewall) and document it.
- **Recovery vs. suspension.** A suspended account must never walk back in through recovery or a password change.
- **Export completeness vs. isolation.** The export must include every owned model (a new owned model later must extend it) yet never cross an account boundary; it reads only through the account-scoped layer.
- **Email as a new external dependency.** First real outbound email. Deliverability (SPF/DKIM/DMARC) and sender reputation are runbook/owner concerns; the run cannot verify an external inbox.

---

## 5. Scope

### In scope
- Signup-mode server configuration (closed / invite-only / public), invite-only default; invite-code gate as the invite-only mode; public implemented + tested, not enabled in production.
- Abuse protection (server rate limiting + bot challenge, Turnstile default) on signup and recovery, privacy-preserving.
- Password recovery (forgot/reset) over Resend, enumeration-safe, browser links desktop + mobile; recovery respects suspension; admin "send reset email" action, audited.
- Email provider adoption (Resend) with separate auth/support sender identities; config is runbook/owner.
- Email verification mechanism (send + confirm + stored state), not gating Free, ready for billing.
- Complete, private, Free JSON export of all owned data.
- End-to-end confirmed self-service deletion via the canonical module; signed-in + signed-out support/contact pathway.
- User guidance (tour review + release note) for the visible account changes.

### Out of scope / deferred
- Any native iOS/Android work, Capacitor, deep links, TestFlight (owner postponement).
- Stripe, billing, checkout, subscriptions, Pro gating, entitlements, promo codes (Pitch 20).
- Social login, multi-factor authentication (deferred, standing non-goals).
- Admin-initiated account deletion (OVE-79, blocked pending upstream amendment).
- Public profiles, friends, discovery, usernames shown to anyone but their owner (standing non-goal).
- A public landing page / changelog (Pitch 21); threaded ticketing or live chat.
- Enabling public signup in production, switching email to a real production domain, or any production migration (human/owner steps).

### Permanent non-goals (unchanged)
No program generation, no social features, no ads, no AI coach, no dated goals or rest timer, no nutrition/body composition.

---

## 6. Open questions (for design/spec to resolve by decision)
- The exact signup-mode config shape (one tri-state variable vs. mode + invite-code variables) and the env var names.
- The rate-limiter implementation that fits the no-cache/no-queue constraint.
- Whether and how a non-blocking "verify your email" affordance appears in Settings.
- The signed-out support pathway's exact surface (a `/support` route vs. a mailto on the auth screens).
- Reset-link expiry (default to Supabase's established behavior unless the spec requires otherwise).

---

## 7. Definition of done (from the roadmap)
- A forgotten password can be recovered end to end, and the reset email reaches an external inbox on a real provider (external-inbox check is a runbook/owner step; reported unverified if the run cannot exercise it).
- With public mode on (in a safe test environment), a stranger can sign up; with it off (invite-only), signup still needs the invite code; closed refuses all.
- The abuse protections are tested (rate limit + bot challenge cannot be bypassed server-side).
- A recovery request looks identical for a known and an unknown email.
- An export contains everything the account owns and nothing from any other account, and no credentials or secrets.
- Deleting an account removes all of its data and blocks further sign-in.
- A suspended account cannot sign in, recover, or change its password back into access.
- Email verification does not gate any Free functionality.
- Complete recovery works through desktop and mobile browsers without native iOS dependencies.
