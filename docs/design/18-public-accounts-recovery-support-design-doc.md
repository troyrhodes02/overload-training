# Public Accounts, Recovery & Support — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 18 (roadmap 19): Public Accounts, Recovery & Support (`pitches/18-public-accounts-recovery-support.md`)
**Focus:** How a stranger signs up safely behind an owner-controlled mode switch, how any lifter recovers a forgotten password over real email without revealing who has an account, how signup and recovery resist bots, how a lifter verifies their email, exports everything they own, and finds help whether signed in or out — all on the web, and all Free.

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

---

## 1. What exists today (the baseline this changes)

This pitch **extends** the shipped auth surfaces rather than redesigning them. The composition, tokens, and copy below are already in the codebase and are the starting point.

- **Auth frame.** `AuthCard` (`src/components/auth/auth-card.tsx`) is the frame every signed-out screen shares: `min-h-dvh` centered, a `max-w-sm` column, the `OverloadLockup size="lg"` wordmark centered above one `rounded-lg border border-border bg-card p-6` card with `space-y-4`, and an optional quiet footer line in `muted-foreground`. Reuse it unchanged for every new signed-out screen here.
- **Login** (`src/app/login/`). Card heading "Sign in"; Email (`h-11`, autofocus) and Password (`PasswordInput`, `autoComplete="current-password"`); one destructive `Alert` on failure; primary **Sign in** (`h-11 w-full`). Footer: "New to Overload? **Create an account**". There is **no** "Forgot password?" link today (removed by R28). The only notice it shows is `?notice=deleted` → "Your account was deleted."
- **Signup** (`src/app/signup/`). Fields in order: **First name**, **Last name**, **Username** (helper "3–20 characters: lowercase letters, numbers, and underscores."), **Email**, **Password** (helper "At least 6 characters."), **Confirm password** (OVE-50). There is **no** invite-code field today. When the server switch is off the page replaces the form with "Signup isn't open / New accounts can't be created right now. If you already have one, sign in." Footer: "Already have an account? **Sign in**".
- **Settings** (`src/components/settings/profile-form.tsx`). Profile card edits First name, Last name, **Username** (helper + lowercases on type), and a read-only **Email**; a separate Timezone card with a native `<select>` and a device-mismatch hint; sticky **Save**. Appearance and tour controls, a What's New section, and the entry to **Delete account** are already present.
- **Delete account** (`src/components/settings/delete-account-form.tsx`, `/settings/delete-account`). A counts inventory (plans, logged workouts, logged sets, goals, gyms, custom exercises, cardio logs), the account password, and a destructive **Delete account permanently** gated on `src/lib/accounts/deletion.ts`. Fully built; untouched here except that this pitch does not change its flow.
- **Send feedback** (`/feedback`, `src/components/send-feedback/send-feedback-form.tsx`). Signed-in only. Category radios (Bug / Idea / Question / Other), a message `Textarea` with a counter, an optional screenshot picker, and an in-place "Sent. Thanks for telling us." confirmation. Reused as the signed-in support pathway.
- **Account menu** (`src/components/shell/account-menu.tsx`). The ⋮ menu: Settings, Send feedback, [Admin when the server says so], Sign out.
- **Admin** (Pitch 17, `/admin/**`). Owner-only, web-only. The account page (`/admin/accounts/[id]`) has an Access block (Suspend / Reactivate) and an "Admin actions" audit list. This pitch adds one owner-only action there: **Send reset email**.
- **Tour & What's New** have shipped. Tour steps live in a registry; release notes are objects at the top of `src/lib/release-notes/entries.ts` (`significant: true` opens the modal on next load).
- **No routes** exist today at `/forgot-password` or `/reset-password` (removed by R28); this pitch revives them. There is **no** data-export surface or module today.

---

## 2. Vision

These screens answer three questions and then get out of the way. For a newcomer: **"Can I get in, and how?"** — one card that adapts to whether the door is closed, keyed, or open, with a bot check that stays quiet unless it fails. For a returning lifter who is locked out: **"How do I get back in?"** — a reset that works over real email and tells every address the exact same thing. For anyone already inside: **"How do I take my data, verify my email, or reach a person?"** — one download, one gentle nudge, one plainly-stated contact address.

**North star:** *the door is plain, the lock is on the server, every address hears the same thing, and your data is always yours to take.*

---

## 3. Design principles

### 1. Say the same thing to everyone
The forgot-password confirmation is word-for-word identical whether or not the email has an account. A failed bot challenge or a rate-limit hit on recovery looks the same regardless of membership. Login keeps one message for an unknown email and a wrong password. The only place an existing email is acknowledged is signup (OVE-50 accepted this when the invite gate went away), and in invite-only mode even that sits behind a valid code.

### 2. The door has three settings, and the lifter only ever sees one
Signup renders exactly one of three states chosen by the server: closed (no form), invite-only (an invite field appears first), or public (no invite field). The browser never knows which modes exist or infers the mode; it renders what the server hands it. A wrong invite code gets one calm line and no other field feedback.

### 3. The bot check is furniture, not a gate the lifter operates
The challenge widget sits quietly above the primary button. When it passes silently, the lifter never thinks about it. It only speaks when it fails ("Couldn't verify you're human. Try again.") — and that message is identical on signup and recovery and reveals nothing about any address.

### 4. Capture is free, so nothing here is ever locked
Email verification is a gentle, dismissible nudge that gates no Free screen. Export is one button available on any plan at any time. Neither ever shows an upgrade note. Verification exists only to be consumed later by a first checkout, which does not exist yet.

### 5. Recovery is a round trip through a real inbox, and it never walks a suspended account back in
The reset email carries one link, works once, and expires. A suspended account that resets its password still lands on the suspended screen on its next request. Account status is enforced on every authenticated request, recovery included.

---

## 4. Visual language

#### Color palette

| Token | Usage | Notes |
| ----- | ----- | ----- |
| `background` / `foreground` | canvas, field values, headings | |
| `card` / `card-foreground` | the single auth card; Settings section cards | reuses the existing `AuthCard` and Settings card treatment exactly |
| `border` / `input` | card hairlines, field borders, the divider above new Settings sections | |
| `muted-foreground` | helper text, the verification nudge body, the support address line, secondary links, read-only email | |
| `primary` / `primary-foreground` | the one primary action per screen: **Create account**, **Send reset link**, **Set new password**, **Send verification email**, **Export your data**; text links use `text-primary` | |
| `destructive` | inline validation text; the existing Delete-account button and entry | the only red in the feature; no red page or banner |
| `ring` | focus rings | |

No new tokens. **Progress and deload tokens are not used anywhere in this feature.** The verification nudge is a neutral `Alert`, not a colored one.

#### State colors (display only)

| State | Visual treatment | Usage |
| ----- | ---------------- | ----- |
| Field error | `aria-invalid` red border + `text-destructive` line under the field | invite code, names, username, email, password, confirm |
| Form error | `Alert variant="destructive"` inside the card, above the primary button | wrong credentials, email already registered (invite-only/public), challenge failed, unexpected failure |
| Neutral notice | `Alert` (default variant) at the top of the card or section | "Check your email", "Your account was deleted", "That reset link has expired", the email-verification nudge, export success |
| Read-only value | `muted-foreground` text, no input chrome | account email in Settings; the support address |

#### Typography, spacing, radius, elevation

Reuse the shipped auth composition verbatim: `max-w-sm` column, wordmark above, one card `rounded-lg p-6`, fields `space-y-4`, inputs `h-11`, primary button `h-11 w-full`, card headings `text-lg font-semibold`, one heading per card. Settings sections reuse `rounded-lg border border-border bg-card p-4` with `h2 text-sm font-medium text-muted-foreground` section headings. Export counts, if shown, and any numeral use `tabular-nums`. No shadows except the existing dropdown and toasts.

#### Appearance

Light, dark, system (default), all through tokens. This pitch adds **no** appearance control. Every new element reads identically in dark mode; the bot-challenge widget is themed to match (light/dark via the provider's appearance parameter, defaulted from the resolved theme). The signed-out screens have no theme source of their own, so they follow the system `prefers-color-scheme`, exactly as the shipped login and signup do today.

---

## 5. Information architecture

```text
 Unauthenticated (no shell, AuthCard frame)        Authenticated (app shell)
┌───────────────────────────────────┐        ┌────────────────────────────────────────┐
│ /login                            │        │ Header: Overload ········· [⋮] menu ───┼─┐
│   [Sign in]                       │───────→│ Today (/), Plan, History, Goals, …     │ │
│   Forgot password? → /forgot-password        └────────────────────────────────────────┘ │
│   New to Overload? → /signup      │          Account menu (dropdown)  ←────────────────┘
│   Need help? → /support           │            · Settings → /settings
│                                   │            · Send feedback → /feedback
│ /signup  (closed | invite | public)          · [Admin] → /admin  (owner only)
│   [invite code]*  First, Last,    │            · Sign out → /login
│   Username, Email, Password,      │          /settings
│   Confirm · [bot challenge]       │            Profile (name, username, email,
│   [Create account]                │              + Verify email nudge)
│   Already have one? → /login      │            Timezone
│   Need help? → /support           │            Your data → [Export your data]      (new)
│                                   │            Delete account → /settings/delete-account
│ /forgot-password                  │
│   Email · [bot challenge]         │          /admin/accounts/[id]   (owner only, web-only)
│   [Send reset link] → "Check your │            Access: Suspend / Reactivate
│    email" (identical for all)     │            Send reset email  (new, audited)
│   Need help? → /support           │
│        │ email link                            Support (signed in): /feedback
│        ▼                          │
│ Reset email → one link, once      │
│        ▼                          │
│ /reset-password                   │
│   [Set new password] → /login     │
│   (invalid/expired → expired card)│
│                                   │
│ /support                          │
│   "Email <support address>"       │
│   → Back to sign in               │
└───────────────────────────────────┘
 Bottom bar (mobile) / left rail (md+) unchanged.
```

- **No new primary navigation item.** Settings gains one new section ("Your data" with Export) and one new in-card affordance (the verify-email nudge). The admin account page gains one new action.
- `/support` is reachable from login, signup, and both recovery screens via a quiet "Need help?" footer link. It is also reachable signed-in, but the signed-in path is **Send feedback** (richer, writes to the inbox); `/support` for signed-in visitors simply points them at Send feedback.
- `/reset-password` is reachable only from the email link (it needs the recovery sign-in the link creates); opened any other way it shows the expired-link card.

---

## 6. Screen specifications

## Screen 1: Signup — the three modes

### Purpose
Let a newcomer create an account, with the exact fields and gate the server's current signup mode dictates, and nothing that reveals which modes exist.

### URL pattern
`/signup`

### Trigger
"Create an account" / "New to Overload?" on login, or a link the owner shares.

### Layout — public mode (phone)

```text
┌────────────────────────────────────┐
│             Overload               │
│ ┌────────────────────────────────┐ │
│ │ Create your account            │ │
│ │                                │ │
│ │ First name       Last name     │ │  ← side by side ≥ 360px, stacked below
│ │ [ Sam        ]  [ Ortiz      ] │ │
│ │                                │ │
│ │ Username                       │ │
│ │ [ sam_o                      ] │ │
│ │ 3–20 characters: lowercase …   │ │
│ │                                │ │
│ │ Email                          │ │
│ │ [ sam@example.com            ] │ │
│ │                                │ │
│ │ Password                       │ │
│ │ [ ••••••••••            [eye] ]│ │
│ │ At least 6 characters.         │ │
│ │                                │ │
│ │ Confirm password               │ │
│ │ [ ••••••••••            [eye] ]│ │
│ │                                │ │
│ │ ┌ [✓] Verifying… (bot check) ┐ │ │  ← Turnstile widget, quiet
│ │                                │ │
│ │ [        Create account      ] │ │
│ └────────────────────────────────┘ │
│   Already have an account? Sign in │
│              Need help?            │
└────────────────────────────────────┘
```

### Layout — invite-only mode (the production default)

Identical, with one field inserted **first**, above First name:

```text
│ │ Invite code                    │ │
│ │ [                            ] │ │  ← first field, autofocus; no hint,
│ │                                │ │    no placeholder, no browser check
```

### Layout — closed mode

The form is replaced by the shipped closed state, unchanged:

```text
┌────────────────────────────────┐
│ Signup isn't open              │
│ New accounts can't be created  │
│ right now. If you already have │
│ one, sign in.                  │
│ [          Sign in           ] │  ← outline → /login
└────────────────────────────────┘
```

### Elements

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Invite code** (invite-only only) | `Input autoComplete="off" autoCapitalize="none" spellCheck={false} h-11`, first field, autofocus | no format hint, no placeholder, never prefilled, never browser-validated |
| **First / Last name** | `Input` `given-name`/`family-name`, `h-11`, `maxLength=50` | as today |
| **Username** | `Input autoComplete="username" autoCapitalize="none" spellCheck={false} h-11` + helper "3–20 characters: lowercase letters, numbers, and underscores." | as today (OVE-50); lowercases on save |
| **Email** | `Input type="email" inputMode="email" autoComplete="email" h-11` | |
| **Password / Confirm password** | two `PasswordInput autoComplete="new-password"`; password helper "At least 6 characters." | both cleared after a failed submit (as today) |
| **Bot challenge** | the Turnstile widget mounted above the button; see Screen 7 | passes silently; a token rides with the submit; failure blocks submit with one message |
| **Timezone** | hidden, device zone (`Intl…timeZone`), UTC fallback | unchanged |
| **Create account** | `Button h-11 w-full` | pending "Creating account…", disabled while pending and while the challenge is not ready |
| **Sign-in link** | footer "Already have an account? **Sign in**" | |
| **Need help?** | footer `Link text-sm text-muted-foreground` → `/support` | new; same link on login and recovery |

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Invite code | text | yes, **invite-only mode only** | empty | checked on the server only; spaces trimmed; absent in public and closed modes |
| First / Last name | text | yes | empty | 1–50 after trimming |
| Username | text | yes | empty | OVE-50 rules; availability checked server-side |
| Email | email | yes | empty | plausible address; auth service authoritative |
| Password / Confirm | password | yes | empty | min 6; confirm must equal exactly |
| Bot-challenge token | hidden | yes | — | verified on the server before any account work |

### Validation
- Client presence/shape checks run on submit for the fields that have them (names, username, email, password match), exactly as today. The invite code and the challenge are **never** validated in the browser.
- Server check order in invite-only mode: **the invite code is checked first.** If it is wrong, "That invite code isn't valid." is the only error shown — no email, name, username, or password feedback — so someone without a code learns nothing about any address.
- In public mode there is no invite step; "An account with this email already exists. Sign in instead." can appear (OVE-50 U8, accepted).
- All typed values except both passwords survive a failed submit.

### Error state

| Condition | Where | Message |
| --------- | ----- | ------- |
| Missing invite code (invite-only) | under Invite code | "Enter the invite code." |
| Wrong invite code (invite-only) | under Invite code | "That invite code isn't valid." |
| Email already has an account (public, or invite-only after a valid code) | form Alert | "An account with this email already exists. **Sign in** instead." |
| Username taken | under Username | "That username is taken." |
| Bot challenge failed / not completed | form Alert | "Couldn't verify you're human. Try again." |
| Rate limited | form Alert | "Too many attempts. Wait a minute and try again." |
| Unexpected failure | form Alert | "Couldn't create your account. Nothing was saved. Try again." |

### Loading / behavior
- Button "Creating account…", disabled. If the challenge widget has not yet rendered a token, the button is disabled with its normal label (no error until a submit is attempted without one).
- Success → Today, signed in as the new account, its existing empty state. No confirmation email is required to proceed (verification is a later, non-blocking nudge). No welcome screen.

---

## Screen 2: Login (extended)

### Purpose
Sign in; and, now that recovery exists again, point to it.

### URL pattern
`/login` (existing). Notices: `?notice=deleted`, `?notice=password-updated`.

### Change from today
One addition: a **"Forgot password?"** `Link` (`text-sm text-primary`), right-aligned on the Password label row, → `/forgot-password` carrying the typed email as `?email=`. A new login notice `password-updated` → "Password updated. Sign in with your new password." A "Need help?" footer link → `/support`, below the existing "New to Overload? Create an account" line. Everything else is unchanged.

```text
│ Password      Forgot password? │
│ [ ••••••••••            [eye] ]│
│ ┌ Wrong email or password. ──┐ │  ← one message for all three
│ [          Sign in           ] │
│   New to Overload? Create an account
│              Need help?            │
```

Login adds **no** bot challenge (the pitch scopes abuse protection to signup and recovery; the auth service's own attempt-rate limit still applies, surfaced as "Too many attempts. Wait a minute and try again.").

---

## Screen 3: Forgot password

### Purpose
Start recovery from an email address, verify the lifter is human, and confirm in words identical for every address.

### URL pattern
`/forgot-password` (optional `?email=` prefill from login; `?link=expired` from an expired reset link).

### Layout — request (phone)

```text
┌────────────────────────────────────┐
│             Overload               │
│ ┌────────────────────────────────┐ │
│ │ Reset your password            │ │
│ │ We'll email you a link to set  │ │
│ │ a new one.                     │ │
│ │                                │ │
│ │ Email                          │ │
│ │ [ will@example.com           ] │ │
│ │                                │ │
│ │ ┌ [✓] Verifying… (bot check) ┐ │ │  ← Turnstile widget
│ │                                │ │
│ │ [       Send reset link      ] │ │
│ └────────────────────────────────┘ │
│   Back to sign in · Need help?     │
└────────────────────────────────────┘
```

### Layout — sent (identical for known and unknown emails)

```text
┌────────────────────────────────┐
│ Check your email               │
│                                │
│ If an account exists for       │
│ will@example.com, a link to    │
│ reset its password is on the   │
│ way. The link works once and   │
│ expires in 1 hour.             │
│                                │
│ Nothing after a few minutes?   │
│ Check spam, or send it again.  │
│                                │
│ [         Back to sign in     ]│  ← outline
└────────────────────────────────┘
```

"send it again" returns to the request state with the email filled.

### Layout — arrived from an expired link
The request state with a neutral `Alert` at the top: "That reset link has expired or was already used. Send a new one below."

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Email | email | yes | `?email=` or empty | "Enter your email." if empty; "Enter a valid email address." if malformed |
| Bot-challenge token | hidden | yes | — | verified on the server before any account lookup |

### Validation & error state (the privacy core)
- Only presence and shape of the email are ever reported. Whether the address belongs to an account is **never** reported.
- Every outcome after a well-formed email that passes the challenge — account exists, doesn't exist, the email service is slow, the auth service rate-limits — shows the **sent** state. Delivery problems are logged server-side without the address and diagnosed through the runbook.
- A failed bot challenge shows "Couldn't verify you're human. Try again." in a form Alert — identical to signup's, and shown **before** any account lookup, so it reveals nothing.
- A rate-limit hit on the request shows the **sent** state as well (not a distinct "rate limited" message), because a visibly different outcome would leak that this address was worth limiting. The limiter still protects the endpoint server-side.
- The single network-failure exception, before the request reaches the server, shows "Couldn't send. Check your connection and try again." (it happens before any lookup, so it reveals nothing).

### Behavior
- Focus moves to the "Check your email" heading when the sent state appears (announced to screen readers).
- "Need help?" → `/support`.

---

## Screen 4: Reset email

### Purpose
Deliver a one-time link from the authentication sender identity the lifter recognizes.

### Trigger
A reset request for an address that has an account (sent silently; no screen reveals it was sent).

### Content (plain HTML email, configured in Supabase Auth's recovery template, delivered via Resend/custom SMTP)

```text
From:    Overload <no-reply@[authentication sending domain]>
Subject: Reset your Overload password

Someone asked to reset the password for your Overload account.

[ Set a new password ]        ← single link button

This link works once and expires in 1 hour. If you didn't ask
for this, ignore this email — your password won't change.
```

- Sent from the **authentication** sender identity (separate from the **support** identity used for the `/support` address). No logo image, no tracking pixel, no marketing footer, no second link. A plain-text fallback carries the same sentences and the raw link.
- The link opens Overload in the browser (desktop or mobile — no native deep link), which verifies it and continues to Screen 5; an invalid, expired, or used link lands on Screen 5's expired card.

---

## Screen 5: Set a new password

### Purpose
Let the lifter who followed a valid link choose a new password and continue into their own account.

### URL pattern
`/reset-password`

### Layout — form (phone)

```text
┌────────────────────────────────────┐
│             Overload               │
│ ┌────────────────────────────────┐ │
│ │ Set a new password             │ │
│ │ For will@example.com           │ │  ← muted; the account's own email
│ │                                │ │
│ │ New password                   │ │
│ │ [ ••••••••••            [eye] ]│ │
│ │ At least 6 characters.         │ │
│ │                                │ │
│ │ [      Set new password      ] │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

### Layout — link not usable (opened directly, expired, or reused)

```text
┌────────────────────────────────┐
│ This link has expired          │
│ Reset links work once and      │
│ expire after an hour.          │
│ [      Send a new link       ] │  → /forgot-password
│          Back to sign in       │
└────────────────────────────────┘
```

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| New password | password (`autoComplete="new-password"`) | yes | empty | min 6; "Enter a new password." if empty; "Use at least 6 characters." if short; "Choose a password you haven't used here." if the auth service rejects a reuse |

### Error state
- Unexpected failure: form Alert "Couldn't set your password. Try again, or send a new link." (link → `/forgot-password`).
- The recovery sign-in timed out between opening the page and submitting: the expired card.

### Behavior
- Success → every session of the account ends (this one included) → `/login?notice=password-updated` with "Password updated. Sign in with your new password." The lifter signs in with the new password and finds the same plan and history. A reset link's session never reaches the app proper, so a link opened by someone else cannot sign them into its owner's account.
- **Suspension still wins.** If the account is suspended, resetting the password does not restore access: after signing in with the new password, the next authenticated request lands on `/suspended` (Pitch 17, Screen 11). Recovery changes the password, never the status.
- The email shown is the recovery account's own address, never one taken from the URL.

---

## Screen 6: Email verification (non-blocking)

### Purpose
Let a lifter prove they own their email, and record it — without gating anything Free.

### Surfaces
A **nudge in Settings**, inside the Profile card beneath the read-only Email, and a **confirmation page** at the link target.

### Layout — Settings nudge (unverified)

```text
│ Email                              │
│ will@example.com                   │  ← read-only (as today)
│ ┌ Your email isn't verified yet. ─┐ │  ← neutral Alert, dismissible
│ │ Verify it so you're ready when  │ │
│ │ paid plans arrive.              │ │
│ │ [ Send verification email ]  ×  │ │  ← link-style button; × dismisses
│ └─────────────────────────────────┘ │
```

- **Decision (D1):** the nudge lives in Settings (not a global banner) so it never competes with a working screen, and it is dismissible per the pitch's "gentle, non-blocking" language. Dismissing hides it for the session; it reappears on a later visit while still unverified, because verification is genuinely useful before checkout. No countdown, no modal, no blocking. Authority: pitch §3.5, §4 ("Verification gating Free"); CLAUDE.md upgrade-prompt restraint.

### Layout — Settings nudge (after "Send verification email")

The Alert swaps in place to: "Verification email sent to will@example.com. Follow the link in it to verify." with a muted "Didn't arrive? Send it again." The copy is honest and unconditional; the account's own email is shown because it is the signed-in account's own (never anyone else's).

### Layout — Settings nudge (verified)

The nudge is absent. Optionally a muted inline "Email verified" line sits under the address (no color, no badge chrome — consistent with "hold is a non-event" restraint). **Decision (D2):** show nothing celebratory; a verified email is the ordinary case, so its only mark is the absence of the nudge plus a quiet "Verified" caption. Authority: `overload-ui-design` restraint; CLAUDE.md.

### Layout — confirmation page (`/verify-email`)

The email's link opens a small `AuthCard`-style confirmation (signed-in context uses the shell, signed-out uses `AuthCard`):

```text
┌────────────────────────────────┐
│ Email verified                 │
│ will@example.com is verified.  │
│ [ Go to Today ]  /  [ Sign in ]│  ← Today if signed in, Sign in if not
└────────────────────────────────┘
```

Expired/invalid verification link → "This verification link has expired. Open Settings and send a new one." with the appropriate return button.

### Verification email content

```text
From:    Overload <no-reply@[authentication sending domain]>
Subject: Verify your Overload email

Confirm this is your email for Overload.

[ Verify email ]        ← single link

If you didn't create an Overload account, ignore this email.
```

### Behavior
- Verification **gates nothing** in this pitch. Supabase's global email-confirmation setting stays OFF (it would otherwise gate sign-in). Every Free screen works whether or not the email is verified.
- The stored verified state is recorded for a later first-checkout gate (billing pitch) to consume.

---

## Screen 7: Bot challenge (shared widget behavior)

### Purpose
Stop scripted signup and recovery without making a human do visible work, and without leaking membership.

### Placement
A single widget mounted just above the primary button on **Signup** and **Forgot password** only. Cloudflare Turnstile is the documented default.

```text
│ ┌───────────────────────────────┐ │
│ │ [spinner] Verifying…          │ │  ← loading (managed widget)
│ └───────────────────────────────┘ │

│ ┌───────────────────────────────┐ │
│ │ [✓] Verified                  │ │  ← passed, quiet
│ └───────────────────────────────┘ │
```

### States

| State | Appearance | Primary button |
| ----- | ---------- | -------------- |
| Loading | the widget's own "Verifying…" spinner, full-width in the card | disabled |
| Passed | the widget's quiet success check; a hidden token is set | enabled |
| Failed / expired | the widget resets; on submit, a form `Alert` "Couldn't verify you're human. Try again." | enabled (so the lifter can retry; the server rejects without a token) |
| Widget unavailable (script blocked / offline) | the widget area shows "Couldn't load the human check. Check your connection and refresh." in `muted-foreground`; the button stays disabled | disabled |

### Behavior
- The token is verified **server-side** before any account is created or any recovery lookup happens. A client that fakes or omits the token is rejected server-side identically to a human failure.
- The failure message is byte-for-byte identical on signup and recovery, and never mentions the email, so it cannot be used to probe membership.
- Appearance follows the resolved theme (light/dark) so the widget matches the card.
- **Decision (D3):** when the widget cannot load at all, the button stays disabled rather than silently allowing submission. A degraded path that skips the challenge would defeat it. The lifter is told to refresh. Authority: pitch §3.2 "verified on the server before the account is created"; judgment.

---

## Screen 8: Data export (Settings)

### Purpose
Let a lifter download everything their account owns, as one file, on any plan, at any time.

### URL pattern
A control in a new **"Your data"** section on `/settings`, below Timezone and above the Delete-account section.

### Layout

```text
│ Your data                          │  ← h2 section heading
│ ┌────────────────────────────────┐ │
│ │ Export your data               │ │
│ │ Download everything in your    │ │
│ │ account as one file: your      │ │
│ │ plans, workouts, logged sets,  │ │
│ │ goals, gyms, cardio, and        │ │
│ │ profile. It's private to you.  │ │
│ │ [ Export your data ]           │ │  ← primary button
│ └────────────────────────────────┘ │
```

### Elements

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Section heading** | `h2 text-sm font-medium text-muted-foreground` "Your data" | |
| **Card** | `rounded-lg border border-border bg-card p-4 space-y-3` | matches Profile/Timezone cards |
| **Description** | `p text-sm text-muted-foreground` | states it is everything they own and private to them |
| **Export button** | `Button h-11` (not full-width; it is not the page's primary action) | triggers a download of a single JSON file |

### Loading state
The button shows "Preparing…" and is disabled while the file is being assembled. Because the export reads the whole account, it may take a moment; the layout does not shift.

### Success state
A toast `Your data is downloading.` (success, 4s). For browsers that complete the download inline, no further screen change. **Decision (D4):** export produces a **JSON** file (pitch §3.6 names JSON) named `overload-export-YYYY-MM-DD.json`. It contains every owned record — plans, sessions and their exercises, custom exercises, gyms and baselines, the full logged history including archived/soft-deleted rows, goals, cardio, favorites, profile, tour and release-seen state, and the lifter's own feedback — and never another account's data, the shared library's image bytes, secrets, or credentials. The acting account comes from the session only. Authority: pitch §3.6; CLAUDE.md first invariant.

### Error state
`Alert variant="destructive"` above the button (or a toast): "Couldn't prepare your export. Try again." The button returns to its idle label. Nothing partial is downloaded.

### Behavior
- Free on every plan; no upgrade note ever appears here (capture, history, and export are never gated — CLAUDE.md).
- Export is read-only: it never changes or deletes anything.

---

## Screen 9: Support / contact

### Purpose
Give anyone — signed in or out — a discoverable way to reach the person who runs Overload.

### URL pattern
`/support` (outside the shell for signed-out visitors, using `AuthCard`; a signed-in visitor is pointed to Send feedback).

### Trigger
The "Need help?" footer link on login, signup, forgot-password, and reset-password; or typing `/support`.

### Layout — signed out

```text
┌────────────────────────────────┐
│             Overload           │
│ ┌────────────────────────────┐ │
│ │ Get help                   │ │
│ │ Email the person who runs  │ │
│ │ Overload and they'll get   │ │
│ │ back to you.               │ │
│ │                            │ │
│ │ support@[support domain]   │ │  ← the support sender address, plain text
│ │ [ Email support ]          │ │  ← mailto: the support address
│ │                            │ │
│ │ [ Back to sign in ]        │ │  ← outline
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

### Layout — signed in

If reached while signed in, `/support` shows the same card but swaps the body for: "You can send feedback or a question from inside Overload." with a primary **[ Send feedback ]** → `/feedback` and a muted fallback line showing the same support address. **Decision (D5):** signed-out support is a **plain contact affordance that surfaces the support address (a `mailto:` link), not a database-writing form.** Only signed-in lifters write to the inbox, via the existing feedback form. A signed-out form would be an unauthenticated write path and an abuse surface the pitch explicitly rules out ("NOT a DB-writing form for signed-out users"). Authority: pitch §3.7, run prompt; CLAUDE.md (no new unauthenticated write paths).

### Behavior
- The support address is the **support** sender identity (distinct from the authentication identity used by reset/verify emails).
- `mailto:` opens the visitor's own mail client; it is the one external link allowed here because it is the contact mechanism itself, not navigation away to a third-party site. No analytics, no tracking.

---

## Screen 10: Admin — send reset email (owner only)

### Purpose
Let the owner trigger a password-reset email to an account they are helping, from the admin account page, audited.

### URL pattern
An action on `/admin/accounts/[id]` (Pitch 17, Screen 5), inside or just below the Access block.

### Layout

```text
│ Account help                         │
│ Send this account a password-reset   │
│ email, the same one they'd get from  │
│ "Forgot password".                   │
│ [ Send reset email ]                 │  ← outline button
```

Confirmation uses the Pitch 17 pattern: a toast `Reset email sent to maya@example.com.` (success) and a new line in **Admin actions** / the audit log: "sent a password-reset email · Maya Chen". A failure shows the inline `Alert` "Couldn't send the reset email. Nothing was sent. Try again."

### Behavior
- Re-checks admin authorization on the server (reusing `requireAdmin`); a non-admin calling the action gets not-found.
- Writes an append-only audit entry (who, what, which account, when), reusing the Pitch 17 audit mechanism.
- Sends the standard recovery email (Screen 4). It does not reveal or change the account's password and does not bypass suspension.
- Web-only, owner-only. Detailed admin visual treatment is inherited from Pitch 17's design doc; only this one new action is added here.

---

## 7. Navigation flows

```text
Journey A — a newcomer signs up (mode-dependent)
  /signup (closed)  → "Signup isn't open" → /login
  /signup (invite)  → [invite ✓ + fields + challenge ✓] → / (empty Today)
                    → [invite ✗] → stays, "That invite code isn't valid."
  /signup (public)  → [fields + challenge ✓] → / (empty Today)
                    → [challenge ✗] → "Couldn't verify you're human. Try again."

Journey B — forgotten password (enumeration-safe)
  /login ─Forgot password?→ /forgot-password?email=… ─[challenge ✓ + Send]→ "Check your email"
  email link → Overload verifies → /reset-password ─[Set new password]→ /login?notice=password-updated
  suspended account resets → signs in → next request → /suspended
  email link expired/used → /reset-password shows "This link has expired" → /forgot-password

Journey C — verify email (non-blocking)
  /settings (unverified) ─[Send verification email]→ nudge swaps to "sent"
  email link → /verify-email "Email verified" → Today (or Sign in)

Journey D — export
  /settings → Your data → [Export your data] → file downloads → toast

Journey E — support
  any auth screen ─Need help?→ /support ─[Email support]→ mail client (mailto)
  signed in → /support → [Send feedback] → /feedback

Journey F — admin reset (owner)
  /admin/accounts/[id] ─[Send reset email]→ toast + audit line
```

- All transitions are full-page navigations except the Settings nudge swap, the export download, toasts, and the admin dialog/toast (no new modal is introduced on the signed-out screens).
- URL state is limited to `?email=` (typed by the lifter), `?link=expired`, `?notice=deleted|password-updated`. No account id, token, or other email ever appears in an Overload URL after the email link is consumed.

---

## 8. Interaction specifications

#### Keyboard navigation

| Context | Key | Action |
| ------- | --- | ------ |
| Any auth form | Enter | Submit (blocked while the challenge has no token) |
| Any auth form | Tab / Shift+Tab | Fields in visual order (invite code first in invite-only mode), then the challenge, then the primary button, then links |
| Password field | Tab | Moves to the show/hide toggle (`aria-pressed`), then onward |
| Settings nudge | Tab | "Send verification email" then the dismiss × are focusable buttons |
| Support | Tab | "Email support" then "Back to sign in" |

- After a failed submit, focus moves to the first field with an error, or to the form Alert when the error is not field-specific (challenge failure, email taken).

#### Loading states
Buttons carry a pending label and disable; forms never show a spinner over the card. The challenge widget renders its own loading state. Export shows "Preparing…". `/settings` keeps its existing skeleton.

#### Error states
Plain-English, inline, with the next action. No error reveals another address or membership, and none mentions Supabase, SMTP, Turnstile, tokens, or codes. The recovery request's privacy rules (Screen 3) override generic error-surfacing: a rate-limit or lookup difference is folded into the identical "sent" state.

#### Notifications (Sonner)

| Action | Message | Severity | Duration |
| ------ | ------- | -------- | -------- |
| Verification email sent | in-place Settings swap, no toast | — | — |
| Export started | `Your data is downloading.` | success | 4s |
| Export failed | `Couldn't prepare your export. Try again.` | error | until dismissed |
| Admin reset email sent | `Reset email sent to {email}.` | success | 4s |
| Admin reset email failed | inline `Alert`, no toast | error | until dismissed |

Signup success, sign out, password reset (uses the login notice), and the recovery "sent" state produce no toast.

#### Destructive actions
This pitch adds no new destructive action. Account deletion (shipped) is unchanged; it remains the one permanent action, on its own page, password-gated. Admin "Send reset email" is not destructive (it sends an email; it changes nothing on the account) and uses no confirmation dialog, only an audit line and a toast.

---

## 9. Responsive behavior

| Breakpoint | Behavior |
| ---------- | -------- |
| base (< 640px) | Auth screens: one `max-w-sm` column, 24px page padding; first/last name stack below 360px; the challenge widget is full card width. Settings: the new "Your data" card sits in the single column; the verify nudge wraps inside the Profile card. Support: single card. |
| `sm` | No change beyond width. |
| `md+` | Auth screens unchanged (centered card). Settings uses the shell's `max-w-screen-sm` content with the left rail; the Export button sits inline, Save remains at the end of the form (not sticky). The admin action follows Pitch 17's `max-w-2xl` account page. |
| `lg` | No change. |

Every action — sign up in any mode, request a reset, retry a failed challenge, verify, export, and reach support — is available at 320px without horizontal scroll.

---

## 10. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `AuthCard` | all signed-out screens | reused | unchanged frame |
| `PasswordInput` | signup, reset | reused | |
| `SignupForm` | `/signup` | reused, extended | optional invite field (invite-only), challenge widget, confirm password (already present) |
| `SignupClosed` | `/signup` | reused | unchanged closed state |
| `LoginForm` | `/login` | reused, extended | + "Forgot password?" link, + `password-updated` notice |
| `BotChallenge` | signup, forgot-password | new | Turnstile wrapper: loading / passed / failed / unavailable states; themed; hidden token field |
| `ForgotPasswordForm` | `/forgot-password` | new | request / sent / expired states; challenge |
| `ResetPasswordForm` | `/reset-password` | new | form / expired states |
| `VerifyEmailNudge` | `/settings` Profile card | new | unverified / sent / verified; dismissible |
| `VerifyEmailConfirmation` | `/verify-email` | new | verified / expired |
| `DataExportSection` | `/settings` | new | "Your data" card + Export button + states |
| `SupportCard` | `/support` | new | signed-out (mailto) and signed-in (→ feedback) variants |
| `SendResetEmailAction` | `/admin/accounts/[id]` | new | owner-only button + toast + audit line (Pitch 17 patterns) |
| `SendFeedback` | `/feedback` | reused | the signed-in support pathway, unchanged |
| `AccountMenu` | header | reused | unchanged (Send feedback already present) |

---

## 11. Accessibility, privacy, and data sensitivity

Accessibility:
- Every field has a visible `Label`; helpers and errors are linked with `aria-describedby`; field errors use `role="alert"`.
- The password toggle is a real button with an accessible name and `aria-pressed`.
- State changes that replace a card (recovery "sent", expired, verified) move focus to the new heading and announce it.
- The bot-challenge widget exposes its own accessible status; the primary button's disabled state is conveyed to assistive tech, and the "couldn't load" fallback is plain text, not an icon alone.
- Inputs and buttons are `h-11` (≥44px); the Export and verify controls are within thumb reach on phones.
- Autocomplete tokens are correct so password managers work (`new-password` on signup and reset).

Privacy:
- **Membership is never revealed.** Recovery says the same thing for every address; a challenge or rate-limit failure is identical regardless of membership; signup acknowledges an existing email only per OVE-50's accepted model (and, in invite-only mode, only behind a valid code).
- The only email ever displayed is the signed-in account's own (Settings, reset page, verification) or the one the lifter just typed (forgot confirmation). Overload never shows another account's name or email outside the owner-only admin area.
- The invite code is never displayed, prefilled, or placed in a URL.
- The export is scoped to the acting account through the account-scoped data-access layer; it can never include another account's data, and it carries no secrets, tokens, or credentials.
- Emails sent carry one link only and no tracking pixel. `/support` uses `mailto:` (the contact mechanism itself); there are no other external links, analytics, or third-party scripts on these screens, beyond the Turnstile widget required for the human check.
- Names and emails never appear in error messages, in toasts beyond the lifter's own screen, or in page titles.

---

## 12. Out of scope

From the pitch (not designed here):
- **Stripe, billing, checkout, subscriptions, Pro gating, entitlements, promo codes** (Plans, Billing & Promo Codes). Verification is built but gates nothing here.
- **Any native iOS/Android work, Capacitor, deep links, TestFlight** (owner-authorized iOS postponement; this run is web-only).
- **Admin-initiated account deletion** (OVE-79, blocked pending an upstream amendment; Pitch 17 Screen 12).
- **Social login, multi-factor authentication** (standing non-goals).
- **Enabling public signup in production, switching email to a real production domain, any production migration** (human/owner runbook steps). Public mode is built and tested but not enabled in production.
- **A public landing page / changelog** (Pitch 21); threaded ticketing, live chat, replies-in-app, assignees, or a second support platform.
- Changing email from Settings, per-friend invite links, an invite-management UI, usernames shown to anyone but their owner.

Deferred (later pitches, not precluded): the commercial launch features after this one; gym location, notifications, body metrics, nutrition.

Permanent non-goals: program generation or any AI coach, social features of any kind, ads, dated goals, a rest timer, cardio progression, nutrition/body composition in this build, and any admin view of an account's training content.

---

## 13. User guidance

Both the Onboarding Tour and What's New have shipped, so this pitch ends with a guidance ticket run with `overload-onboarding`. The changes here are mostly recovery flows a lifter reaches only when locked out, so they do not all warrant tour steps.

- **Tour steps — none recommended.** Signup, login, forgot-password, and reset live outside the signed-in shell the tour walks, and the tour never runs for a signed-out person. Export and the verify-email nudge are quiet Settings additions; the tour already points at Settings as the home for profile, appearance, and account controls, so a new step for each would be noise (skill rubric: "a new variant of something the lifter already understands"). Existing steps keep their ids and copy. The `overload-onboarding` run confirms this in the guidance ticket.
- **Release notes.** Recovery, export, and the support channel are visible, useful changes worth announcing. Proposed entries (illustrative; dated the day they reach production, newest-first in `src/lib/release-notes/entries.ts`):
  - **Significant (opens the modal): "Reset your password by email."** — "Forgot your password? From the sign-in screen, choose Forgot password and we'll email you a link to set a new one. The link works once and expires after an hour." Significant because it restores a capability lifters expect and will look for.
  - **Not significant (list only): "Export your data."** — "You can download everything in your account — plans, workouts, logged sets, goals, gyms, cardio, and profile — as one file, any time, from Settings. It's private to you and always free."
  - **Not significant (list only): "Get help when you're signed out."** — "Can't sign in? A Need help? link on the sign-in and signup screens now points you to a support address." 
  - The email-verification nudge is **not** announced on its own: it gates nothing yet and would read as pre-announcing paid plans. It is folded into the billing pitch's guidance when verification first matters.

---

## 14. Plan placement and platform impact

- **Plan placement: Free.** Signup, password recovery, email verification, support/contact, data export, and account deletion are all Free capabilities. None introduces Pro gating, Stripe, or an entitlement check, and no upgrade note appears on any of these screens. Export and capture are, by rule, never gated. The email-verification state is recorded for a *future* first-checkout gate (billing pitch) to consume; it gates nothing now.
- **Platform impact: pending / web-only this run.** The iOS foundation has not shipped (owner-authorized postponement), so `overload-cross-platform` is not invoked. Everything here is delivered on desktop and mobile **web browsers**. One authentication system, backend, and account data model are preserved so a future mobile foundation can reuse them unchanged. The admin "Send reset email" action is **web-only** by rule. Recovery deep-linking into a native app is explicitly deferred; recovery works through ordinary browser links. A native device / TestFlight check is not applicable and is never reported as passed.

---

## 15. Resolved decisions (autonomous run)

Recorded here because this design doc was produced in an unattended run; the skill's clarification step does not apply. Each is carried into the spec.

| # | Decision | Rationale | Authority |
| - | -------- | --------- | --------- |
| D1 | The email-verification affordance is a dismissible neutral `Alert` inside the Settings Profile card, not a global banner. Dismiss hides it for the session; it returns on a later visit while unverified. | Pitch calls for "gentle, non-blocking"; a banner competes with working screens and risks reading as a dark pattern. | Pitch §3.5, §4; CLAUDE.md upgrade restraint |
| D2 | A verified email shows only a quiet "Verified" caption (no badge, no color, no toast). | `overload-ui-design` restraint; the verified state is the ordinary case. | `overload-ui-design`; CLAUDE.md |
| D3 | When the bot-challenge widget cannot load, the primary button stays disabled with a "couldn't load / refresh" message, rather than falling through without a challenge. | A skip-on-failure path defeats the protection; the server rejects a missing token anyway. | Pitch §3.2; judgment |
| D4 | Export is a single JSON file named `overload-export-YYYY-MM-DD.json`, covering every owned model including archived/soft-deleted rows, read through the account-scoped layer. | Pitch §3.6 names JSON and "everything they own"; isolation forbids cross-account content. | Pitch §3.6; CLAUDE.md first invariant |
| D5 | Signed-out support is a `mailto:` contact affordance surfacing the support sender address, not a DB-writing form. Signed-in support routes to the existing feedback form. | Pitch and run prompt forbid an unauthenticated write path; the feedback inbox already exists for signed-in lifters. | Pitch §3.7; run prompt |
| D6 | The bot challenge is placed on signup and forgot-password only, not login. | Pitch §3.2 scopes abuse protection to signup and recovery; login keeps its one-message failure and the auth service's own attempt limit. | Pitch §3.2 |
| D7 | A recovery rate-limit hit shows the identical "Check your email" sent state, not a distinct "rate limited" message. | A visibly different outcome would leak that an address was worth limiting; the limiter still protects the endpoint server-side. | Pitch §4 (enumeration leaks); principle 1 |
| D8 | The verify-email link resolves at a new `/verify-email` confirmation surface; the reset link continues to use `/reset-password`. | Keeps verification and recovery as separate, single-purpose surfaces; mirrors the shipped recovery design. | Judgment; pitch §3.5 |

## 16. Open questions

None blocking. The following belong to the spec, not the design: the exact signup-mode config shape and env var names; the rate-limiter implementation that fits the no-cache/no-queue constraint; reset- and verification-link expiry values (default to Supabase's established behavior); the precise JSON shape and ordering of the export file; and the production domains, DNS, and sender identities (owner/runbook).
