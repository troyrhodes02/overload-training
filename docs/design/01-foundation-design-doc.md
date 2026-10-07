# Foundation — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch: Foundation
**Focus:** The two surfaces Foundation actually ships: the login screen and the authenticated, otherwise-empty application shell — plus the auth, loading, and error states that connect them.

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

## 1. Vision

Foundation is the lifter's front door and the empty room behind it. The login screen answers one question — "is this me?" — and the shell answers "am I in, and where will my training live?" Nothing here trains anybody; it proves that an authenticated person can get in, an unauthenticated one cannot, and there is a stable, phone-first structure for later pitches to hang screens on.

**Design north star:** *the door and the empty room — correct, quiet, and out of the way.*

## 2. Design principles

### 1. Prove, don't decorate
Every pixel exists to demonstrate an auth or navigation fact (you're out, you're in, here's the way back). No dashboard widgets, no sample data, no future-feature teasers.

### 2. One honest destination
The shell shows exactly what exists today — an authenticated home with a greeting and nothing to do yet — and says so plainly. It never implies a Plan, History, or Goals feature is one tap away before those pitches exist.

### 3. Thumb-first, phone-first
The primary context is a phone. The login action and the account/sign-out control sit within thumb reach, and the layout is designed narrow first.

### 4. Quiet failure
Auth failures (wrong credentials, expired session, network error) each get their own plain, non-alarming message that keeps the lifter's typed email on screen.

## 3. Visual language

Overload uses **Tailwind CSS with shadcn/ui** as the single component and styling system, with `lucide-react` icons and **Inter** as the type family. Foundation introduces the theme tokens the whole app will inherit; it does not design feature surfaces.

#### Color palette

Foundation uses only the base/neutral tokens. The progress/deload status tokens are defined in the theme by this pitch (so later pitches reference tokens, not hex) but are **not used on any Foundation surface**.

| Token / theme path | Usage | Notes |
| ------------------ | ----- | ----- |
| `background` | app background | near-black in dark, near-white in light |
| `card` / surface | login card, shell regions | small surface step, hairline divider in light |
| `border` | dividers, input borders | low-contrast |
| `foreground` | primary text, numbers | high contrast |
| `muted-foreground` | secondary text, empty-state copy | deliberately lower contrast |
| `primary` | the single accent: sign-in button, active nav item | `#3F5BD9` light / `#7B93FF` dark |
| `destructive` | inline auth error text/alert | factual, not full-screen red |

#### State colors

Foundation displays **no** progress/deload/hold state — those are computed training outputs that do not exist yet. The tokens are defined for later pitches only.

| State | Visual treatment | Usage |
| ----- | ---------------- | ----- |
| Progress (computed tag) | progress token (defined, unused) | later pitches |
| Deload (computed tag) | deload token (defined, unused) | later pitches |
| Hold (computed) | no tag, no color | later pitches |

#### Typography, spacing, radius, elevation

Inter via `next/font`, weights regular/medium/semibold only. `tabular-nums` utility is available for later numeric surfaces; Foundation has no numbers to align. Elevation is a soft shadow on the dialog/menu overlay only.

#### Appearance

Light, dark, and **system** (default). Appearance selection lives in Settings, which Foundation does **not** build — so Foundation ships only the token plumbing and `system`-follows-OS behavior. There is no theme toggle anywhere in Foundation.

## 4. Information architecture

Foundation **is** the authority for the app shell that later docs inherit. It intentionally ships one real destination.

```text
┌──────────────────────────────────────────────┐
│  (public)                                      │
│   /login   ── wordmark, email, password,       │
│               [Sign in], inline error          │
├──────────────────────────────────────────────┤
│  (app)  — requires an authenticated session    │
│   /        ── Today (home): greeting,          │
│               "nothing here yet" empty state   │
│               account menu → [Sign out]        │
└──────────────────────────────────────────────┘
 Bottom bar (mobile) / side rail (md+):
   Today    ← the only destination that exists today.
   The nav is a structural slot later pitches extend
   (Plan · History · Goals arrive with their pitches).
```

- Unauthenticated access to anything under `(app)` redirects to `/login`.
- After sign-in the lifter lands on `/` (Today).
- After sign-out the lifter returns to `/login`.

## Screen 1: Login

### Purpose
Let the single account holder authenticate and enter the app.

### URL pattern
`/login`

### Trigger
Direct visit, or redirect from any protected route when there is no auth session, or after sign-out.

### Layout
```text
┌────────────────────────────────┐
│                                │
│            Overload            │   ← wordmark, Inter semibold
│                                │
│  ┌──────────────────────────┐  │
│  │ Email                    │  │
│  │ [ you@example.com      ] │  │
│  │ Password                 │  │
│  │ [ ••••••••••           ] │  │
│  │                          │  │
│  │  Wrong email or password │  │ ← inline error (only on failure)
│  │                          │  │
│  │     [    Sign in    ]    │  │ ← primary, full-width
│  └──────────────────────────┘  │
│                                │
└────────────────────────────────┘
```

### Login form
| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| Wordmark | plain text, `text-xl font-semibold` | "Overload". No logo mark exists; do not design one. |
| Email | `Input` type=email, `inputMode="email"`, label | required; autofocus |
| Password | `Input` type=password, label | required |
| Submit | `Button` variant=default, full width | disabled while submitting; shows a spinner/label swap |
| Error | `Alert` variant=destructive, inline above button | appears only on a failed attempt; typed email is preserved |

### Code reference
```tsx
<form action={signInAction} className="space-y-4">
  <div className="space-y-2">
    <Label htmlFor="email">Email</Label>
    <Input id="email" name="email" type="email" inputMode="email" required autoFocus />
  </div>
  <div className="space-y-2">
    <Label htmlFor="password">Password</Label>
    <Input id="password" name="password" type="password" required />
  </div>
  {error ? <Alert variant="destructive">{error}</Alert> : null}
  <Button type="submit" className="w-full" disabled={pending}>
    {pending ? "Signing in…" : "Sign in"}
  </Button>
</form>
```

### Fields
| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| email | string | yes | empty | non-empty, email-shaped; server is the source of truth |
| password | string | yes | empty | non-empty |

### Validation
- Both fields required; the submit stays disabled until both are non-empty.
- All real validation is the auth server's answer; the client does not decide credentials are wrong.
- On failure, the email value stays; the password clears.

### Empty state
Not applicable — the login form is always present.

### Loading state
Submit button swaps label to "Signing in…" and disables; inputs disable. No full-screen spinner.

### Error state
Each failure has its own message, rendered inline in a destructive `Alert`:
- wrong credentials → "Wrong email or password."
- expired/invalid session bounce → "Your session expired. Sign in again."
- network/unexpected → "Couldn't reach the server. Try again."

### Behavior
- **Success:** auth session cookie is set server-side; redirect to `/`.
- **Error:** stay on `/login`, show the matching message, keep the email.
- **No sign-up, no invite, no password-reset link.** There is exactly one account, created by hand. The screen has no registration affordance of any kind.
- Focus starts in the email field; Enter submits.

## Screen 2: Authenticated shell — Today (home)

### Purpose
Prove the lifter is inside the protected application and give later pitches a stable place to attach surfaces.

### URL pattern
`/` (inside the `(app)` route group)

### Trigger
A successful sign-in, or any authenticated visit to the app root.

### Layout (mobile, base)
```text
┌────────────────────────────────┐
│ Overload                    [ ⋮ ] │  ← app bar: wordmark + account menu
├────────────────────────────────┤
│                                │
│  Good evening.                 │  ← single quiet greeting line
│                                │
│  Nothing here yet.             │  ← honest empty state
│  Your training will show up    │
│  here once it's set up.        │
│                                │
│                                │
├────────────────────────────────┤
│   ◉ Today                       │  ← bottom nav: one real item today
└────────────────────────────────┘
```

### Layout (md+)
App bar spans the top; navigation moves to a left rail; content is centered with a max width. No new elements — width, not features.

### Shell / navigation
| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| App bar | `header`, surface token, bottom divider | shows "Overload" wordmark and the account menu |
| Account menu | `DropdownMenu` triggered by an icon `Button` | single item: **Sign out** |
| Bottom nav (base) / rail (md+) | nav element, `lucide-react` icons | **Today** is the only destination that exists; it is the active item. The nav is built as an extensible list so later pitches add items without restructuring. |
| Greeting | plain text, `text-lg` | one line, no persona, no emoji |
| Empty state | `muted-foreground` copy | names what's missing; promises nothing that doesn't exist |

### Code reference
```tsx
// app/(app)/layout.tsx — protected shell
export const instant = false; // blocks on the server; instant-nav optimization is out of Foundation scope
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireUser(); // redirects to /login when unauthenticated
  return <AppShell>{children}</AppShell>;
}
```
```tsx
// AppShell — chrome only, no data
<div className="flex min-h-dvh flex-col">
  <AppBar />
  <main className="mx-auto w-full max-w-screen-sm flex-1 px-4 py-6">{children}</main>
  <AppNav /> {/* bottom bar on base, hidden md+; rail shown md+ */}
</div>
```

### Empty state
This screen **is** an empty state in Foundation. Copy: a one-line greeting, then "Nothing here yet. Your training will show up here once it's set up." No illustration, no call-to-action button to a feature that doesn't exist.

### Loading state
Because the protected layout blocks on the server for the auth check, the authenticated chrome arrives already resolved. A route-level `loading.tsx` renders a minimal skeleton of the app bar and content region shaped like the final layout, so nothing jumps.

### Error state
- **Unauthenticated:** redirect to `/login` (handled in the layout DAL and, optimistically, in `proxy.ts`).
- **Unexpected server error:** a route `error.tsx` with a short factual sentence and a single "Back to Today" / retry action. No full-screen alarm.
- **Not found:** a `not-found.tsx` with one sentence and a link back to `/`.

### Behavior
- The shell renders only for an authenticated session; every server action under `(app)` re-checks the session independently.
- **Sign out:** account menu → Sign out → server action clears the auth session → redirect to `/login`.
- The greeting is static plain text in Foundation (no name lookup is required to prove the shell; a name may be wired in later without changing the structure).

## 5. Navigation flows

```text
Direct visit to any /(app) route, no session
  → proxy.ts optimistic redirect → /login
  → (defense in depth) layout requireUser() → redirect /login

/login  ── submit valid credentials ──▶  /  (Today)
   ▲                                      │
   │        Sign out (account menu)       │
   └──────────────────────────────────────┘

/login  ── submit invalid credentials ──▶ stays on /login, inline error, email kept
```

- All transitions are full-page navigations. Foundation introduces no dialogs or drawers except the account `DropdownMenu`.
- No state needs to carry between screens beyond the auth session cookie.

## 6. Interaction specifications

#### Keyboard navigation
| Context | Key | Action |
| ------- | --- | ------ |
| Login email/password | Enter | Submit the form |
| Login fields | Tab / Shift+Tab | Move between email, password, submit |
| Account menu | Enter / Space | Open menu; Escape closes and returns focus to the trigger |

#### Loading states
Use shadcn/ui `Skeleton` in `loading.tsx` for the shell; the login submit uses an in-button pending label. No spinners over empty screens.

#### Error states
Use shadcn/ui `Alert` (inline, destructive) for login failures and the route `error.tsx` boundary for unexpected shell errors, each with a retry or a way back. Never a full-screen red takeover.

#### Notifications
Foundation needs no toasts. (Sonner is part of the system and will be introduced by the first pitch that performs a mutation worth confirming.)

#### Destructive actions
Foundation has no destructive action. Sign out is reversible (sign back in) and needs no confirmation dialog.

## 7. Responsive behavior

| Breakpoint | Width | Behavior |
| ---------- | ----- | -------- |
| base | below 640px | Single column. Login card centered with comfortable padding. Shell uses a bottom nav; account menu reachable top-right. |
| `sm` | 640px and up | Wider single column, larger login card. |
| `md` | 768px and up | Shell navigation becomes a left rail; content centered with a max width. |
| `lg` | 1024px and up | Centered content, capped max width; added width, not added elements. |

Every action (sign in, open account menu, sign out) is available and thumb-reachable at the base breakpoint. Core navigation is never hidden behind a hamburger.

## 8. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `LoginForm` | `/login` | new | client island; calls `signInAction`; preserves email on error |
| `AppShell` | `(app)` layout | new | chrome: app bar + content slot + nav; holds no data |
| `AppBar` | shell | new | wordmark + account menu |
| `AppNav` | shell | new | extensible nav list; bottom bar (base) / rail (md+); one real item (Today) |
| `AccountMenu` | app bar | new | `DropdownMenu` with a single Sign out item |
| shadcn/ui primitives | global | new (installed) | `Button`, `Input`, `Label`, `Alert`, `DropdownMenu`, `Skeleton` |

Do not over-componentize. Later pitches add nav items and surfaces; Foundation only guarantees the slots exist.

## 9. Accessibility, privacy, and data sensitivity

Accessibility:
- Email and password inputs have associated `<Label>`s and visible focus rings.
- The account menu is keyboard-operable and traps focus while open; Escape returns focus to the trigger.
- Auth error messages are rendered in-DOM (not color-only) and are screen-reader reachable.
- Inputs use appropriate `inputMode`; tap targets are at least 44px.
- The wordmark is text, not an image, so it needs no alt text.

Privacy:
- Foundation stores no training data and surfaces none. There is no share, export, invite, or visibility affordance, and none is implied.
- No external links leave the product.
- No secret (`DATABASE_URL`, `DIRECT_URL`, service-role key) ever reaches the client. The only client-visible Supabase values are the public URL and anon key, which are safe to ship because the database is closed by deny-all RLS (see the spec).

## 10. Out of scope

Everything that is a training feature. Foundation designs **no** dashboard content, exercise library, gym screens, plan/mesocycle builder, logging card, history, goals, cardio, settings screen, or theme toggle UI — those belong to their own pitches.

Deferred (design nothing now, preclude nothing): Settings/appearance toggle UI, named greeting personalization, any nav item beyond Today, password-reset UX (there is one hand-made account).

Permanent non-goals (never): sign-up/registration, invites, multi-user or sharing affordances, social surfaces.
