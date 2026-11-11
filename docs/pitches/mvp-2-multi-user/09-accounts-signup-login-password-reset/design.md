# Accounts: Signup, Login & Password Reset — Design Document

**Version:** 1.2
**Pitch Source:** Overload — Pitch 9: Accounts — Signup, Login & Password Reset
**Focus:** How an invited friend creates an account, how any lifter signs in, signs out, and gets back in after forgetting a password, and how a lifter edits their name and timezone or permanently deletes their own account — with every screen plain, private, and impossible to use as a way to learn who else has an account.

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

> **v1.2 (owner direction, spec R28): password reset is removed from this release**, because it needs an email provider Overload doesn't have. Login has no "Forgot password?" link; the forgot-password, check-your-email, set-new-password, and expired-link screens are not built, and the preview's frames for them are superseded. Signup's "an account with this email already exists" message offers Sign in only. The screens and v1.1 notes about reset below are kept for the record.

> **v1.1 (code review, spec R25/R26):** after a successful reset every session ends and the lifter lands on **Login** with the notice "Password updated. Sign in with your new password." (not Today with a toast); while a reset link's session is open, every app screen sends back to "Set a new password"; and `/forgot-password` stays reachable when signed in. The expired-link state's "Back to sign in" signs out first.

> **Authority note.** The `overload-ui-design` skill still describes Overload as single-user, and its Login guidance says "no sign-up link, no forgot flourish". The approved multi-user planning set, `.claude/CLAUDE.md`, and this pitch supersede that line: the login screen now links to signup (for people holding an invite) and to password recovery. Everything else in that skill (direction, palette, type, states) governs unchanged. Recorded as an upstream amendment.

---

## 2. Vision

These screens answer one question each and then get out of the way: **"How do I get in?"** A friend with an invite code fills five fields once and lands on an empty Today that is unmistakably theirs. A returning lifter types two fields. A lifter who forgot a password gets a link that actually arrives and sets a new one in one step. Settings answers **"Is this me?"** — name and timezone — and keeps the one irreversible action in the product visibly apart from everything routine.

**North star:** *the door is plain, the lock is on the server, and the only exit that destroys history asks for your password.*

---

## 3. Design principles

### 1. Doors, not a lobby
Signup, login, forgot, and reset are single-card screens with the wordmark, the fields, one primary action, and at most two quiet links. No product tour, no marketing copy, no feature list, no welcome message. Onboarding is a later pitch; this one only opens the door.

### 2. Say the same thing to everyone
The forgot-password confirmation is word-for-word identical whether or not the email has an account. Login failure is one message for "no such account" and "wrong password". The only place an existing email is acknowledged is signup, and only after a valid invite code has been accepted — so a stranger without a code learns nothing.

### 3. The invite code is a key, not a hint
The invite field is a plain text field. The page never says what a code looks like, never suggests one, and never validates it in the browser. A wrong code gets one calm line: "That invite code isn't valid."

### 4. Routine above, irreversible apart
Settings is ordinary profile editing with a Save button. Account deletion lives in its own section at the bottom, behind its own page, with the full consequence spelled out in numbers the lifter recognizes (workouts, sets, plans, goals, gyms) and the account password as the confirmation. Nothing about deletion is one tap, and nothing about saving a name is scary.

### 5. Your days follow your clock
Timezone is shown as the plain IANA name the app uses ("America/Chicago"), captured silently at signup from the device, and editable in Settings with one line explaining what it controls: which day Today shows. When the device's zone differs from the saved one, Settings says so and offers a one-tap fix — it never changes the saved zone on its own.

---

## 4. Visual language

#### Color palette

| Token | Usage | Notes |
| ----- | ----- | ----- |
| `background` / `foreground` | canvas, field values, headings | |
| `card` / `card-foreground` | the single auth card; Settings section cards | auth card uses `border border-border bg-card` exactly like today's login |
| `border` / `input` | card hairlines, field borders, the divider above the deletion section | |
| `muted-foreground` | helper text (password rule, timezone explanation), secondary links, read-only email, deletion inventory labels | |
| `primary` / `primary-foreground` | the one primary action per screen: **Sign in**, **Create account**, **Send reset link**, **Set new password**, **Save** | text links (Forgot password?, Create an account, Sign in) use `text-primary` |
| `destructive` | inline validation text; the **Delete account permanently** button; the outline **Delete account…** entry button's text and border | the only red in the feature; never a red page, banner, or background |
| `ring` | focus rings | |

No new tokens. **Progress and deload tokens are not used anywhere in this feature.**

#### State colors (display only)

| State | Visual treatment | Usage |
| ----- | ---------------- | ----- |
| Field error | `aria-invalid` red border + `text-destructive` line under the field | invite code, names, email, password, timezone |
| Form error | `Alert variant="destructive"` inside the card, above the primary button | wrong credentials, email already registered, unexpected failure |
| Neutral notice | `Alert` (default variant) at the top of the card | "Check your email" confirmation, "Your account was deleted", "That reset link has expired" |
| Read-only value | `muted-foreground` text, no input chrome | account email in Settings |
| Danger section | hairline `border-t`, heading in `foreground`, description in `muted-foreground`, outline button with `destructive` text | the entry to deletion in Settings |

#### Typography, spacing, radius, elevation

Reference `overload-ui-design`. Auth screens reuse the current login composition exactly: `max-w-sm` column, wordmark `OverloadLockup size="lg"` centered above, one card `rounded-lg p-6`, fields `space-y-4`, inputs `h-11`, the primary button `h-11 w-full`. Headings inside cards are `text-lg font-semibold`; there is never more than one heading per card. Counts in the deletion inventory use `tabular-nums`. No shadows except on the account dropdown menu (existing).

#### Appearance

Light, dark, system (default). This pitch adds **no** appearance control — Settings gets Profile, Timezone, and Delete account only (appearance arrives with Personalization & Navigation Polish). Every element uses tokens and reads identically in dark mode; the destructive button uses the dark `destructive` token (`#e5484d` with `destructive-foreground`).

---

## 5. Information architecture

```text
 Unauthenticated (no shell)                Authenticated (app shell)
┌───────────────────────────────┐       ┌──────────────────────────────────────┐
│ /login                        │       │ Header: Overload ········ [⋮] menu ──┼─┐
│   [Sign in] ──────────────────┼──────→│ Today (/), Plan, History, Goals, …   │ │
│   Forgot password? ─→ /forgot-password  └──────────────────────────────────────┘ │
│   Create an account ─→ /signup│        Account menu (dropdown)  ←──────────────┘
│                               │          · Settings ─→ /settings
│ /signup                       │          · Sign out ─→ /login
│   [Create account] ───────────┼──────→ Today (empty account)
│   Sign in ─→ /login           │        /settings
│                               │          Profile: first, last, email (read-only)
│ /forgot-password              │          Timezone
│   [Send reset link] → "Check  │          [Save]
│    your email" (same for all) │          Delete account ─→ /settings/delete-account
│        │ email                │                              [Delete account permanently]
│        ▼                      │                                   │
│ Reset email → link            │                                   ▼
│        ▼                      │                              /login ("Your account was deleted.")
│ /reset-password               │
│   [Set new password] ─────────┼──────→ /login ("Password updated. Sign in…")
│   (expired link → request new)│
└───────────────────────────────┘
 Bottom bar (mobile) / left rail (md+) unchanged: Today · Plan · History · Goals · Exercises · Gyms
```

- **No new primary navigation item.** Settings is reached from the existing account menu in the header (the pitch rules out a navigation redesign). The menu gains one item above Sign out.
- Signed-in lifters who open `/login` or `/signup` go straight to Today. `/forgot-password` stays reachable (v1.1).
- `/reset-password` is reachable only from the email link (it needs the recovery sign-in the link creates); opened any other way it shows the expired-link state.

---

## 6. Screen specifications

## Screen 1: Login

### Purpose
Let any lifter with an account sign in with email and password, and point to recovery and to signup without crowding the form.

### URL pattern
`/login` (existing page, extended). Optional notice query: `/login?notice=deleted`.

### Trigger
Opening any protected route while signed out; signing out; finishing account deletion; the "Sign in" link on signup and forgot-password.

### Layout — phone

```text
┌────────────────────────────────────┐
│                                    │
│             Overload               │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ Sign in                        │ │
│ │                                │ │
│ │ Email                          │ │
│ │ [ will@example.com           ] │ │
│ │                                │ │
│ │ Password      Forgot password? │ │
│ │ [ ••••••••••            [eye] ]│ │
│ │                                │ │
│ │ ┌ Wrong email or password. ──┐ │ │  ← only on failure
│ │                                │ │
│ │ [          Sign in           ] │ │
│ └────────────────────────────────┘ │
│                                    │
│   Have an invite? Create an account│
└────────────────────────────────────┘
```

Desktop: identical, centered in the viewport (`min-h-dvh items-center`). There is no shell, so nothing else changes at `md+`.

### Elements

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Wordmark** | `OverloadLockup size="lg"` inside `<h1>` | static |
| **Card heading** | `h2 text-lg font-semibold` "Sign in" | new — gives the card a name for screen readers |
| **Email** | `Label` + `Input type="email" inputMode="email" autoComplete="email" h-11` | keeps the typed value after a failed attempt; autofocus |
| **Password** | `Label` + `PasswordInput` (Input + ghost icon `Button` toggle, `autoComplete="current-password"`) | toggle shows/hides; value cleared after a failed attempt |
| **Forgot password?** | `Link` `text-sm text-primary`, right-aligned on the Password label row | → `/forgot-password`, carrying the typed email as `?email=` |
| **Error** | `Alert variant="destructive"` | see Error state |
| **Notice** | `Alert` (default) at the top of the card | `?notice=deleted` → "Your account was deleted." |
| **Sign in** | `Button h-11 w-full` | pending label "Signing in…", disabled while pending |
| **Signup link** | `p text-sm text-muted-foreground text-center` + `Link text-primary` | "Have an invite? **Create an account**" → `/signup` |

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Email | email | yes | last typed value | non-empty; server is authoritative |
| Password | password | yes | empty | non-empty |

### Validation
- Empty email or password: "Enter your email and password." (existing message), shown in the form Alert, focus to the first empty field.
- The browser's native validation bubbles are suppressed (`noValidate`); messages are ours.

### Empty state
Not applicable (a form).

### Loading state
The button shows "Signing in…" and is disabled; fields stay editable-looking but the form cannot be resubmitted.

### Error state
| Condition | Message |
| --------- | ------- |
| Wrong email, unknown email, or wrong password | "Wrong email or password." (one message for all three — principle 2) |
| Network/unexpected failure | "Couldn't sign in. Check your connection and try again." |
| Too many attempts (rate limited by auth) | "Too many attempts. Wait a minute and try again." |

### Behavior
- Success → Today (`/`). The account's own data, nothing else.
- The original account signs in exactly as before; nothing about login asks for an invite code.
- Escape has no effect; Enter submits.

---

## Screen 2: Signup

### Purpose
Let a person holding the invite code create their own account in one step and land in it.

### URL pattern
`/signup`

### Trigger
"Create an account" on the login screen, or a link the owner sends a friend.

### Layout — phone

```text
┌────────────────────────────────────┐
│             Overload               │
│ ┌────────────────────────────────┐ │
│ │ Create your account            │ │
│ │                                │ │
│ │ Invite code                    │ │
│ │ [                            ] │ │
│ │                                │ │
│ │ First name       Last name     │ │  ← side by side ≥ 360px content width;
│ │ [ Sam        ]  [ Ortiz      ] │ │    stacked below that
│ │                                │ │
│ │ Email                          │ │
│ │ [ sam@example.com            ] │ │
│ │                                │ │
│ │ Password                       │ │
│ │ [ ••••••••••            [eye] ]│ │
│ │ At least 6 characters.         │ │
│ │                                │ │
│ │ [        Create account      ] │ │
│ └────────────────────────────────┘ │
│   Already have an account? Sign in │
└────────────────────────────────────┘
```

First and last name sit in a two-column grid (`grid grid-cols-2 gap-3`) because each is short; on a 320px device they stack (`grid-cols-1 min-[360px]:grid-cols-2`).

### Elements

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Card heading** | `h2 text-lg font-semibold` "Create your account" | |
| **Invite code** | `Input autoComplete="off" autoCapitalize="none" spellCheck={false} h-11` | first field, autofocus; no format hint, no placeholder |
| **First name / Last name** | `Input autoComplete="given-name"` / `"family-name"`, `h-11`, `maxLength=50` | |
| **Email** | `Input type="email" inputMode="email" autoComplete="email" h-11` | |
| **Password** | `PasswordInput autoComplete="new-password"` | helper `text-sm text-muted-foreground` "At least 6 characters." (the auth service's rule — no custom strength meter) |
| **Timezone** | hidden, filled from the device (`Intl.DateTimeFormat().resolvedOptions().timeZone`) | not shown here; editable later in Settings. If the device gives nothing usable, the account starts on UTC |
| **Create account** | `Button h-11 w-full` | pending "Creating account…" |
| **Sign-in link** | "Already have an account? **Sign in**" → `/login` | |

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Invite code | text | yes | empty | checked on the server only; leading/trailing spaces ignored |
| First name | text | yes | empty | 1–50 characters after trimming |
| Last name | text | yes | empty | 1–50 characters after trimming |
| Email | email | yes | empty | a plausible address; the auth service is authoritative |
| Password | password | yes | empty | the auth service's minimum length (6 by default); no other rules |
| Timezone | hidden | — | device zone | must be a real IANA zone, else UTC |

### Validation
- Presence checks run in the browser on submit and again on the server; each empty field gets its own line: "Enter the invite code.", "Enter your first name.", "Enter your last name.", "Enter your email.", "Enter a password."
- Order of server checks is visible in behavior: **the invite code is checked first.** If it's wrong, that is the only error shown — no email, name, or password feedback — so a person without a code learns nothing about any address.
- Password too short: "Use at least 6 characters." under the field.
- Email malformed: "Enter a valid email address." under the field.
- All typed values except the password survive a failed submit.

### Empty state
Not applicable.

### Loading state
Button "Creating account…", disabled.

### Error state
| Condition | Where | Message |
| --------- | ----- | ------- |
| Missing invite code | under Invite code | "Enter the invite code." |
| Wrong invite code | under Invite code | "That invite code isn't valid." |
| Email already has an account (only reachable with a valid code) | form Alert | "An account with this email already exists. Sign in or reset your password." with both phrases as links |
| Unexpected failure | form Alert | "Couldn't create your account. Nothing was saved. Try again." |
| Signup closed (no invite code configured on the server) | replaces the form — see below | |

**Signup closed state** (the production default until the owner opens it):

```text
┌────────────────────────────────┐
│ Signup isn't open              │
│                                │
│ Overload is invite-only, and   │
│ signup is closed right now.    │
│                                │
│ [          Sign in           ] │  ← outline button → /login
└────────────────────────────────┘
```

### Behavior
- Success → Today, signed in as the new account. Today shows its existing empty state ("No active plan…" → plan builder). No welcome screen, no tour (Onboarding Tour is a later pitch).
- The new account has its own profile (first name, last name, device timezone) and nothing else; the shared exercise library is visible as it is to everyone.
- No confirmation email is sent and none is required.

---

## Screen 3: Forgot password

### Purpose
Start recovery with an email address, and confirm in words that are the same for every address.

### URL pattern
`/forgot-password` (optional `?email=` prefill from login; `?link=expired` from an expired reset link).

### Trigger
"Forgot password?" on the login screen; an expired or reused reset link.

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
│ │ [       Send reset link      ] │ │
│ └────────────────────────────────┘ │
│              Back to sign in       │
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
│ [         Back to sign in     ]│  ← outline button
└────────────────────────────────┘
```

"send it again" returns to the request state with the email filled.

### Layout — arrived from an expired link

The request state with a neutral `Alert` at the top: "That reset link has expired or was already used. Send a new one below."

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Email | email | yes | `?email=` or empty | "Enter your email." if empty; "Enter a valid email address." if malformed |

### Validation
- Only presence and shape are ever reported. Whether the address belongs to an account is never reported.

### Loading state
Button "Sending…", disabled.

### Error state
- Every outcome after a well-formed email is submitted — account exists, doesn't exist, the email service is slow, the auth service rate-limits the request — shows the **sent** state. Delivery problems are logged on the server (without the address) and diagnosed through the runbook, never shown, because any visible difference would reveal membership.
- The single exception is a network failure before the request reaches the server, which the browser shows as "Couldn't send. Check your connection and try again." (it happens before any account lookup, so it reveals nothing).

### Behavior
- Focus moves to the "Check your email" heading when the sent state appears (announced to screen readers).

---

## Screen 4: Reset email

### Purpose
Deliver a link that sets a new password, from a sender the lifter recognizes.

### Trigger
A reset request for an address that has an account.

### Layout (plain HTML email, configured in the auth service's recovery template)

```text
From:    Overload <no-reply@[sending domain]>
Subject: Reset your Overload password

Someone asked to reset the password for your Overload account.

[ Set a new password ]        ← link button

This link works once and expires in 1 hour. If you didn't ask
for this, ignore this email — your password won't change.
```

- No logo image, no tracking pixel, no marketing footer, no other links. Plain text fallback carries the same sentences and the raw link.
- The link opens Overload, which verifies it and continues to Screen 5; an invalid, expired, or used link lands on Screen 3's expired state.

---

## Screen 5: Set a new password

### Purpose
Let the lifter who followed a valid reset link choose a new password and continue into their own account.

### URL pattern
`/reset-password`

### Trigger
Following the reset email's link (after Overload verifies it).

### Layout — phone

```text
┌────────────────────────────────────┐
│             Overload               │
│ ┌────────────────────────────────┐ │
│ │ Set a new password             │ │
│ │ For will@example.com           │ │  ← muted, the account's own email
│ │                                │ │
│ │ New password                   │ │
│ │ [ ••••••••••            [eye] ]│ │
│ │ At least 6 characters.         │ │
│ │                                │ │
│ │ [      Set new password      ] │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

### Layout — link not usable (opened directly, expired, or too old)

```text
┌────────────────────────────────┐
│ This link has expired          │
│                                │
│ Reset links work once and      │
│ expire after an hour.          │
│                                │
│ [      Send a new link       ] │  → /forgot-password
│          Back to sign in       │
└────────────────────────────────┘
```

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| New password | password (`autoComplete="new-password"`) | yes | empty | auth service minimum (6 by default) |

### Validation
- Empty: "Enter a new password." Too short: "Use at least 6 characters." Same as the current password (auth service rejects): "Choose a password you haven't used here." — under the field.

### Loading state
Button "Saving…", disabled.

### Error state
- Unexpected failure: form Alert "Couldn't set your password. Try again, or send a new link." (link → `/forgot-password`).
- The recovery sign-in timed out between opening the page and submitting: the link-not-usable state.

### Behavior
- Success → every session of the account ends (this one included) → Login with the notice "Password updated. Sign in with your new password." The lifter signs in with the new password and finds the same plan and history. *(v1.1: a reset link's session never reaches the app itself, so a link opened by someone else can't sign them into its owner's account.)*
- The email shown is the signed-in recovery account's own address — never anyone else's, and never one taken from the URL.

---

## Screen 6: Settings

### Purpose
Let the lifter see and edit who they are in Overload (name, timezone), and find — clearly set apart — the way to delete the account.

### URL pattern
`/settings`

### Trigger
Account menu → **Settings**.

### Layout — phone

```text
┌────────────────────────────────────┐
│ Overload                       [⋮] │
├────────────────────────────────────┤
│ Settings                           │
│                                    │
│ Profile                            │
│ ┌────────────────────────────────┐ │
│ │ First name       Last name     │ │
│ │ [ William    ]  [ Rhodes     ] │ │
│ │                                │ │
│ │ Email                          │ │
│ │ will@example.com               │ │  ← read-only, muted
│ └────────────────────────────────┘ │
│                                    │
│ Timezone                           │
│ ┌────────────────────────────────┐ │
│ │ [ America/Chicago          ▾ ] │ │
│ │ Today follows this timezone.   │ │
│ │                                │ │
│ │ ┌ Your device is set to      ┐ │ │  ← only when they differ
│ │ │ America/New_York. [Use it] │ │ │
│ └────────────────────────────────┘ │
│                                    │
│ ────────────────────────────────── │
│ Delete account                     │
│ Permanently delete your account    │
│ and all of its training history.   │
│ [ Delete account… ]                │  ← outline, destructive text
│                                    │
├────────────────────────────────────┤
│ [             Save             ]   │  ← sticky action bar, thumb reach
├────────────────────────────────────┤
│ Today  Plan  History  Goals  …     │
└────────────────────────────────────┘
```

Desktop (`md+`): same single column inside the shell's centered `max-w-screen-sm` content, left rail on the left (no item active — Settings isn't a nav destination). The Save button sits at the end of the form (not sticky) at `md+`.

### Elements

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Page heading** | `h1 text-xl font-semibold` "Settings" | |
| **Section headings** | `h2 text-sm font-medium text-muted-foreground` "Profile", "Timezone" | |
| **Section cards** | `rounded-lg border border-border bg-card p-4 space-y-4` | |
| **First / Last name** | `Input h-11 autoComplete="given-name"/"family-name"` | prefilled; empty for an account created before Accounts (the original account) |
| **Email** | `p text-sm text-muted-foreground` + `Label`-styled caption "Email" | read-only; changing email is out of scope |
| **Timezone** | `NativeSelect h-11` (native `<select>` styled like `Input`, the shadcn native-select recipe) listing every IANA zone the browser knows, alphabetical | native picker on phones (400+ zones are unusable in a custom popover) |
| **Timezone helper** | `text-sm text-muted-foreground` "Today follows this timezone." | |
| **Device mismatch hint** | `Alert` (default) with `Button variant="link"` "Use it" | shown only when the device zone ≠ the selected zone; "Use it" sets the select (still needs Save) |
| **Delete section** | `border-t border-border pt-6`, `h2 text-base font-semibold`, `p text-sm text-muted-foreground`, `Button variant="outline" className="text-destructive border-destructive/40"` "Delete account…" | → `/settings/delete-account` |
| **Save** | `Button h-11 w-full` in `.ov-actions`-style sticky bar on phone | disabled until something changed; pending "Saving…" |

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| First name | text | yes | stored value | 1–50 characters after trimming: "Enter your first name." |
| Last name | text | yes | stored value | 1–50 characters after trimming: "Enter your last name." |
| Timezone | select | yes | stored zone | must be a valid IANA zone: "Choose a timezone." |

### Validation
- Inline under each field, on Save. Values stay as typed after a failed save.
- A saved zone the browser doesn't list (rare) still shows as the selected option.

### Empty state
For an account whose profile has no names yet (the original account), the name fields are empty with no placeholder text; nothing else changes.

### Loading state
`loading.tsx` skeleton: the heading, two card-shaped `Skeleton` blocks (`h-40`, `h-28`) and a button-shaped bar. No spinner.

### Error state
- Save failed unexpectedly: `Alert variant="destructive"` above the Save button: "Couldn't save. Your changes are still here." plus the error toast `Couldn't save. Your changes are still here.` (until dismissed).

### Behavior
- Success: toast "Settings saved" (4s); fields keep the saved values; Save disables again.
- A timezone change takes effect immediately: Today, the week, and missed-day detection use the new zone on the next view.
- Changes affect only the signed-in account.

---

## Screen 7: Delete account

### Purpose
Make the one irreversible action in Overload deliberate: state exactly what will be destroyed, require the account password, then do it.

### URL pattern
`/settings/delete-account`

### Trigger
Settings → **Delete account…**

### Layout — phone

```text
┌────────────────────────────────────┐
│ Overload                       [⋮] │
├────────────────────────────────────┤
│ ‹ Settings                         │
│ Delete your account                │
│                                    │
│ This permanently deletes your      │
│ account and everything in it.      │
│ It can't be undone.                │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ Plans (mesocycles)           3 │ │
│ │ Logged workouts             36 │ │
│ │ Logged sets                463 │ │
│ │ Goals                        5 │ │
│ │ Gyms                         2 │ │
│ │ Custom exercises             1 │ │
│ │ Cardio logs                  4 │ │
│ └────────────────────────────────┘ │
│ The shared exercise library isn't  │
│ affected.                          │
│                                    │
│ Password                           │
│ [ ••••••••••            [eye] ]    │
│ Enter your password to confirm.    │
│                                    │
├────────────────────────────────────┤
│ [ Delete account permanently ]     │  ← destructive, thumb reach
│            Cancel                  │
├────────────────────────────────────┤
│ Today  Plan  History  Goals  …     │
└────────────────────────────────────┘
```

### Elements

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Back link** | `Link text-sm text-muted-foreground` with `ChevronLeft` "Settings" | → `/settings` |
| **Heading** | `h1 text-xl font-semibold` "Delete your account" | |
| **Consequence copy** | `p text-sm` (foreground, not muted — this is the point of the page) | |
| **Inventory** | `rounded-lg border bg-card` list, rows `flex justify-between py-2`, counts `tabular-nums font-medium` | rows with a count of 0 are omitted; if every count is 0 the card is replaced by "Your account has no training data yet." |
| **Library note** | `text-sm text-muted-foreground` | |
| **Password** | `PasswordInput autoComplete="current-password" h-11` + helper | |
| **Delete account permanently** | `Button variant="destructive" h-11 w-full` | disabled until the password field is non-empty; pending "Deleting…" |
| **Cancel** | `Button variant="ghost" h-11 w-full` → `/settings` | |

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Password | password | yes | empty | must be the signed-in account's current password |

### Validation
- Wrong password: "That password isn't right." under the field; nothing is deleted.
- Empty: the button stays disabled.

### Empty state
An account with no data shows "Your account has no training data yet." in place of the inventory; the rest of the page is unchanged (the account itself is still deleted).

### Loading state
Page skeleton: heading bar, a card-shaped `Skeleton h-56`, a field bar, the two buttons. While deleting: button "Deleting…", Cancel disabled, password disabled.

### Error state
| Condition | Message (form Alert above the buttons) |
| --------- | ------------------------------------- |
| Nothing was deleted (failure before or during the data removal) | "Couldn't delete your account. Nothing was deleted. Try again." |
| Data deleted, but closing the sign-in failed | "Your training data was deleted, but closing your account didn't finish. Try again to finish." (the inventory now reads "no training data"; retrying completes the account removal) |
| Too many wrong passwords (rate limited) | "Too many attempts. Wait a minute and try again." |

### Behavior
- Success → signed out → `/login?notice=deleted`, showing "Your account was deleted." The email can sign up again later only with a fresh invite, into a new empty account.
- Only the signed-in account can reach or submit this page; there is no link, id, or email in the URL.
- No toast (the lifter has left the app). No undo exists, and the page says so.

---

## Screen 8: Account menu

### Purpose
The existing header menu, now the way to Settings as well as Sign out.

### URL pattern
`menu` (the header's `⋮` button on every authenticated screen).

### Layout

```text
                         ┌───────────────┐
                         │ ⚙ Settings    │
                         │ ↪ Sign out    │
                         └───────────────┘
```

| Element | shadcn/ui component | Behavior |
| ------- | ------------------- | -------- |
| **Settings** | `DropdownMenuItem asChild` + `Link` with `Settings` icon | → `/settings` |
| **Sign out** | existing form item with `LogOut` icon | signs out → `/login`; Back after signing out returns to login, not to private pages |

---

## 7. Navigation flows

```text
Journey A — a friend joins
  /signup ─[Create account]→ (server: invite ✓ → account + profile) → /  (empty Today)
                         └─ invite ✗ → stays, "That invite code isn't valid."

Journey B — returning lifter
  any protected URL (signed out) → /login ─[Sign in]→ /
  /login while signed in → /

Journey C — forgotten password
  /login ─Forgot password?→ /forgot-password?email=… ─[Send reset link]→ "Check your email"
  email link → Overload verifies → /reset-password ─[Set new password]→ /login?notice=password-updated
  email link expired/used → /forgot-password?link=expired
  /reset-password opened directly → "This link has expired" → /forgot-password

Journey D — profile
  ⋮ → Settings → edit → [Save] → toast "Settings saved" (stay on /settings)

Journey E — delete
  ⋮ → Settings → Delete account… → /settings/delete-account
     ─[Delete account permanently] + password → (all of this account's data, then its sign-in) → /login?notice=deleted
     ─Cancel / ‹ Settings → /settings

Sign out
  ⋮ → Sign out → /login
```

- All transitions are full-page navigations; no dialogs in this feature except the existing dropdown.
- No state carries in URLs except `?email=` (prefill typed by the lifter themself), `?link=expired`, and `?notice=deleted`. No account id, token, or other email ever appears in an Overload URL after the email link is consumed.

---

## 8. Interaction specifications

#### Keyboard navigation

| Context | Key | Action |
| ------- | --- | ------ |
| Any auth form | Enter | Submit |
| Any auth form | Tab / Shift+Tab | Fields in visual order, then the primary button, then links |
| Password field | Tab from field | Moves to the show/hide toggle (`aria-pressed`, label "Show password"/"Hide password"), then onward |
| Account menu | Enter/Space on ⋮, arrows, Escape | Radix dropdown defaults; Escape returns focus to ⋮ |
| Delete page | Enter in password | Submits only when non-empty |

- After a failed submit, focus moves to the first field with an error (or to the form Alert when the error isn't field-specific).

#### Loading states
Buttons carry the pending label and disable; forms never show a spinner over the card. `/settings` and `/settings/delete-account` have skeleton `loading.tsx` files shaped like their content.

#### Error states
Plain-English, inline, with the next action. No error ever repeats or reveals another address, and none mentions Supabase, SMTP, tokens, or codes.

#### Notifications

| Action | Message | Severity | Duration |
| ------ | ------- | -------- | -------- |
| Settings saved | `Settings saved` | success | 4s |
| Settings save failed | `Couldn't save. Your changes are still here.` | error | until dismissed |

Signup success, sign out, and deletion produce no toast (navigation itself is the confirmation; deletion uses the login-page notice).

#### Destructive actions

| Action | Confirmation |
| ------ | ------------ |
| Delete account | A dedicated page (not a dialog) listing what will be destroyed with counts, the sentence "It can't be undone.", and the current password. Button: **Delete account permanently**. This is the one place Overload says "Delete" — because, unlike archiving, it truly is. |
| Sign out | none (reversible) |
| Leaving Settings with unsaved edits | none; edits are simply discarded (two fields — not worth a prompt) |

---

## 9. Responsive behavior

| Breakpoint | Behavior |
| ---------- | -------- |
| base (< 640px) | Auth screens: one `max-w-sm` column with 24px page padding; first/last name stack below 360px. Settings/Delete: inside the shell, single column, primary action in the sticky bottom action bar above the nav. |
| `sm` | No change beyond width. |
| `md+` | Auth screens unchanged (centered card). Settings/Delete: left rail replaces the bottom bar; actions sit at the end of the content instead of a sticky bar. |
| `lg` | No change (content stays `max-w-screen-sm`). |

Every action is available at every width. Nothing scrolls horizontally at 320px.

---

## 10. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `LoginForm` | `/login` | reused, extended | heading, forgot link, notice, signup link, password toggle |
| `PasswordInput` | login, signup, reset, delete | new | `Input` + show/hide ghost icon button (`Eye`/`EyeOff`), `aria-pressed` |
| `AuthCard` | all unauthenticated screens | new (layout only) | wordmark + bordered card + optional footer link; extracted from today's login page |
| `SignupForm` | `/signup` | new | invite code first; hidden device timezone |
| `SignupClosed` | `/signup` | new | closed state |
| `ForgotPasswordForm` | `/forgot-password` | new | request / sent states |
| `ResetPasswordForm` | `/reset-password` | new | form / expired states |
| `ProfileForm` | `/settings` | new | names, read-only email, timezone, device hint, Save |
| `NativeSelect` | `/settings` | new UI primitive | native `<select>` with `Input` styling (shadcn native-select recipe) |
| `DeleteAccountForm` | `/settings/delete-account` | new | inventory, password, destructive action, partial-failure message |
| `AccountMenu` | header | reused, extended | + Settings item |

---

## 11. Accessibility, privacy, and data sensitivity

Accessibility:
- Every field has a visible `Label`; helpers and errors are linked with `aria-describedby`; errors use `role="alert"`.
- The password toggle is a real button with an accessible name and `aria-pressed`.
- State changes that replace a card (sent, expired, closed) move focus to the new heading.
- Inputs are `h-11` (44px), buttons `h-11`; the delete button and Save are within thumb reach on phones.
- Autocomplete tokens are set correctly so password managers work (`current-password` on login and delete, `new-password` on signup and reset).

Privacy:
- **Membership is never revealed** except at signup after a valid invite code (PRD: "fails without revealing more than that").
- Overload never shows another account's name or email. The only email ever displayed is the signed-in account's own (Settings, reset page) or the one the lifter just typed (forgot confirmation).
- The invite code is never displayed back, never prefilled, never put in a URL.
- No analytics, no third-party scripts, no external links on any of these screens; the reset email has one link only (back to Overload).
- Names and emails never appear in error messages, toasts beyond the lifter's own screen, or page titles.

---

## 12. Out of scope

From the pitch (not designed here):
- Onboarding tour, welcome screens, product explanations after signup.
- Dashboard greeting with the first name, appearance setting, mobile navigation redesign (Personalization & Navigation Polish).
- What's New.
- Plan seeding (operator task, no UI).
- Email verification, social login, MFA, changing email, changing password from Settings (only via reset), per-friend invite links, an invite-management UI, admin screens, roles, billing.

Deferred (later pitches, not precluded): exercise history and PR views; RIR; the Apple platform work.

Permanent non-goals: program generation, social features of any kind (no profiles visible to others), cardio progression, nutrition/body composition in this build, dated goals, a rest timer, a public product.
