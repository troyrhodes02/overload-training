# Plans, Billing & Promo Codes — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch: Plans, Billing & Promo Codes
**Focus:** How a lifter understands Free vs Pro, lives inside a 14-day trial, subscribes through hosted checkout, manages or cancels billing, sees the quiet upgrade note where a Pro feature would be, and how the owner grants and reads complimentary access and billing status in the admin center — all on desktop and mobile browsers.

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

---

## 2. Vision

The lifter's own training — every plan, logged set, goal, and export — stays free forever; what Pro adds is Overload's *reading* of that training (progress/hold/deload calls and their evidence, e1RM trends and stall detection, RIR-aware recommendations, and the exercise history book). This feature has to make that boundary feel honest, not extractive: a new lifter tries everything for 14 days, and when the trial ends nothing is taken away — only the interpretation goes quiet behind one dismissible line.

**Design north star:** *the paywall is a librarian, not a bouncer — it never stands between a lifter and their own numbers, only beside the interpretation of them, and it says so once and steps back.*

---

## 3. Design principles

### 1. Your data is never behind the wall
Capture, history, correction, goals, and export carry no lock, no dimming, no note, on any plan or after any downgrade. The only surfaces that ever show a Pro state are the interpretation surfaces (recommendations, trends, stall, PR intelligence). If a screen lets a lifter *record* or *read back* what they did, it looks identical on Free and Pro.

### 2. One quiet note, then silence
Where a Pro result would appear for a Free lifter, show exactly one short, dismissible line in that one place — never a banner, countdown, modal interruption, or a second note on the same screen. A dismissed note stays dismissed for that surface. Nothing a Free lifter does mid-workout is ever interrupted to sell Pro.

### 3. Access state is read, never asserted by the browser
Trial, Paid, Complimentary, Canceling, Grace, and Free are shown exactly as the server's resolved entitlement reports them. A checkout "success" return never flips the UI to Pro on its own; the screen shows a calm "finishing up" state until the verified state arrives. The displayed state and the enforced state are always the same value.

### 4. Paid and complimentary are different words
A comped lifter sees "Pro — complimentary" and is never shown a renewal price, a card, or a "manage billing" button for a subscription they don't have. A paying lifter sees their interval and next charge. The owner's admin view keeps the same distinction: a comp is never counted or labelled as a paying subscriber.

### 5. Disclose the whole price, including after the discount
When a promotion like BLIZZY applies, the lifter sees the promotional price, exactly how long it lasts, the regular recurring price that follows, that it renews automatically, and how to cancel — before they enter checkout and again on the subscription screen. The discount is never shown as if it were the permanent price.

---

## 4. Visual language

### Color palette

| Token / theme path | Usage | Notes |
| ------------------ | ----- | ----- |
| `background` / `card` | plan cards, billing panel, admin sections | standard surfaces |
| `border` | plan-card outlines, the locked-note hairline, divider between Free/Pro columns | hairline only |
| `muted-foreground` | the upgrade note, trial sub-line in Settings, "regular price after" disclosure, archived/secondary billing facts | the note must read as secondary, never as an alert |
| `primary` (accent) | the single "Upgrade to Pro" / "Subscribe" action, the current-plan ring on the chosen plan card | accent is the only non-status color |
| `primary` at soft opacity | the current-plan highlight fill on the active plan card | the "you are here" marker |

No new status color is introduced. The progress/deload tokens are **not** reused for billing — billing is never green/amber. A payment-problem state uses `muted-foreground` text plus a `lucide-react` `TriangleAlert` at one stroke, not a red takeover (see Error states).

### State colors

Billing/entitlement state is a **resolved, read-only** value with plain display labels. It is never an editable enum in the UI and never uses the progress/deload tag colors.

| State | Visual treatment | Usage |
| ----- | ---------------- | ----- |
| Free | plain text "Free", no accent | no Pro capabilities |
| Pro — trial | plain text "Pro — trial · N days left" | 14-day trial, days computed in the account's timezone |
| Pro — paid | plain text "Pro — Monthly" / "Pro — Annual" + "Renews MMM D" | active renewing subscription |
| Pro — complimentary | plain text "Pro — complimentary" (+ "until MMM D" if dated) | owner-granted comp; never a renewal price |
| Pro — canceling | plain text "Pro — ends MMM D" | subscription set to cancel at period end; still Pro until then |
| Pro — payment issue | `muted-foreground` text "Payment problem — update by MMM D" + alert glyph | in the grace window; still Pro |
| (computed training tags) | unchanged | Progress/Deload tags are untouched by this feature |

- Color is reinforcement only; every state has a readable text label and never relies on color.
- The computed progress/hold/deload tag is entirely out of scope here and renders exactly as it does today for a Pro lifter; for a Free lifter the surface that would show it instead shows the upgrade note (principle 2).

### Typography, spacing, radius, elevation

Inter throughout, weights regular/medium/semibold only. Prices use `tabular-nums` with `tracking-tight` on the large plan-card figure ("$4.99"). Trial day counts and "N days left" use tabular numerals. No bold, no display type, no gradient buttons.

### Appearance

Light, dark, and system; selection stays in Settings. All plan cards, the billing panel, the locked note, and the admin billing section are theme-token driven. The plan-comparison screen in dark mode uses the elevated-surface step for the recommended (Pro) card rather than a shadow.

---

## 5. Information architecture

The app shell and navigation are Pitch 1's authority; this feature adds leaf screens under Settings and under the existing owner-only Admin area, plus two inline treatments on existing surfaces. No new top-level nav item.

```text
┌──────────────────────────────────────────────────────────────┐
│  Overload                                                      │
├──────────────────────────────────────────────────────────────┤
│  Today    ── greeting, today's session                        │
│              └ exercise card ─ recommendation area:           │
│                   Pro → the call + evidence (unchanged)        │
│                   Free → [ quiet upgrade note ]  ← inline      │
│  Plan     ── Mesocycles, Exercise library                     │
│  History  ── Week at a glance → logged day  (always Free)     │
│  Goals    ── active / archived  (always Free)                 │
│  Exercise page ─ History & PR Intelligence:                   │
│                   Pro → records, trend, per-session calls      │
│                   Free → basic session list + [ upgrade note ]│
│  Settings ── Appearance · Name · Gyms · Archive · Export       │
│              └ Plan & Billing            ← NEW leaf            │
│                   ├ current plan state                         │
│                   ├ Compare plans → Pro plan cards             │
│                   ├ Subscribe → Stripe hosted Checkout ↗       │
│                   ├ Manage billing → Stripe Customer Portal ↗  │
│                   └ return: /settings/billing?status=…         │
│                                                                │
│  Admin (owner-only, web-only)                                 │
│   ├ Overview ── + Billing snapshot counts (read-only)         │
│   ├ Accounts ── account page:                                 │
│   │     + Entitlement section (resolved source, read-only)    │
│   │     + Complimentary access: Grant / Revoke (audited)      │
│   │     + Stripe mirror: subscription + promo (read-only)     │
│   └ Billing ── subscriptions & BLIZZY redemptions (read-only) │
└──────────────────────────────────────────────────────────────┘
 Bottom bar (mobile) unchanged: Today · Plan · History · Goals
```

Primary content: the Plan & Billing leaf under Settings is where a lifter understands and changes their plan. Secondary/inline: the quiet upgrade note on Pro-interpretation surfaces. Owner-only: the admin entitlement and billing additions.

---

## 6. Screen specifications

## Screen 1: Plan & Billing (Settings leaf)

### Purpose
Let the lifter see exactly what plan they are on, what it includes, and — if they want Pro — move to hosted checkout or manage an existing subscription.

### URL pattern
`/settings/billing` (also the return target: `/settings/billing?status=success|cancelled`)

### Trigger
Tapping "Plan & Billing" in Settings; also the destination of the upgrade note's link and of the checkout/portal return.

### Layout
```text
┌────────────────────────────────────────────┐
│ ‹ Settings                                   │
│ Plan & Billing                               │
├────────────────────────────────────────────┤
│  Your plan                                   │
│  ┌──────────────────────────────────────┐   │
│  │ Pro — trial · 9 days left            │   │
│  │ Full access through Nov 10.          │   │
│  │ After the trial you move to Free,     │   │
│  │ with nothing lost.                    │   │
│  │            [ Subscribe to keep Pro ] │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  Compare plans                               │
│  ┌───────────────┐  ┌───────────────────┐   │
│  │ Free          │  │ Pro        (your   │   │
│  │ $0            │  │ $4.99/mo    trial) │   │
│  │ • Build plans │  │ • Everything Free │   │
│  │ • Log, RIR    │  │ • Progress calls  │   │
│  │ • Full history│  │ • e1RM trends     │   │
│  │ • Goals       │  │ • Stall detection │   │
│  │ • Export      │  │ • RIR in calls    │   │
│  │               │  │ • Exercise history│   │
│  │ [Current]     │  │ [ Monthly ][Annual]│  │
│  └───────────────┘  └───────────────────┘   │
│  Annual is $39.99/yr (2 months free).        │
│  Billed through Stripe. Cancel anytime.      │
└────────────────────────────────────────────┘
```

### Your-plan panel
| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **State line** | `Card` header, `text-base font-medium` | reads the resolved entitlement state (table in §4) |
| **Explanation** | `text-sm text-muted-foreground` | one or two plain sentences matched to the state |
| **Primary action** | `Button` variant `default` (accent) | Free/trial → "Subscribe to keep Pro" (opens plan choice / checkout); Paid/Comp → see below |
| **Manage billing** | `Button` variant `outline` | paid only → opens Stripe Customer Portal in same tab |

### Compare-plans section
| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Free card** | `Card`, plain border | lists Free capabilities; shows `[Current]` `Badge` variant `secondary` when the account is Free |
| **Pro card** | `Card`, `border-primary/40`, elevated surface in dark | lists Pro capabilities; the account's current state marked with the soft-accent ring |
| **Interval buttons** | two `Button`s: "Monthly — $4.99/mo", "Annual — $39.99/yr" | each starts checkout for that price; disabled with a spinner label while the checkout session is created |
| **Disclosure line** | `text-xs text-muted-foreground` | "Billed through Stripe. Renews automatically. Cancel anytime in Manage billing." |

### Code reference
```tsx
<Card className="bg-card border-border">
  <CardHeader>
    <CardTitle className="text-base font-medium">{planState.label}</CardTitle>
    <CardDescription className="text-sm text-muted-foreground">
      {planState.explanation}
    </CardDescription>
  </CardHeader>
  <CardContent className="flex flex-col gap-3">
    {planState.canSubscribe && (
      <SubscribeButtons monthlyLabel="Monthly — $4.99/mo" annualLabel="Annual — $39.99/yr" />
    )}
    {planState.canManage && (
      <Button variant="outline" onClick={openPortal}>Manage billing</Button>
    )}
  </CardContent>
</Card>
```

### Fields
This screen has no form the lifter fills in — the promotion code is entered on Stripe's hosted page, not here (see Screen 3). The only inputs are the interval choice buttons.

### Validation
- Interval buttons are mutually independent actions; neither requires selection state.
- If the account's email is not verified, both subscribe actions are replaced by a verify-first step (Screen 2) — the buttons are not shown as enabled-but-failing.

### Empty state
Not applicable — every account always has a resolved plan (at minimum Free). A brand-new account always lands here as "Pro — trial".

### Loading state
`Skeleton` for the state line and both plan cards, keeping their heights so the panel does not jump. The interval buttons render disabled with a `Loader2` spinner and "Starting checkout…" while the server creates the Stripe Checkout session, then the browser navigates to Stripe.

### Error state
- Checkout session could not be created → inline `Alert` variant `default` above the plan cards: "Couldn't start checkout. Please try again." with a Retry; the interval buttons re-enable.
- Customer Portal session could not be created → inline alert on the your-plan panel with Retry.
- Returning with `?status=cancelled` → a quiet `muted-foreground` line "Checkout cancelled. Your plan hasn't changed." and nothing else; no error styling.

### Behavior
- `?status=success` return: show a calm "Finishing up — confirming your subscription." line with a `Loader2`, and the plan panel in a pending look, until the server's resolved entitlement reports Pro-paid (principle 3). The page re-reads on load; it never asserts Pro from the query param alone. If after a short, bounded wait the state is still not paid, show "This can take a moment. We'll update your plan as soon as payment is confirmed." and a link to refresh — never an error, because the webhook is authoritative and may simply be in flight.
- Subscribe (trial or Free): if multiple intervals, the two buttons are shown; tapping one creates the checkout session and navigates to Stripe.
- Manage billing (paid): opens the Stripe Customer Portal; on return, re-read state.
- Comp accounts: the your-plan panel reads "Pro — complimentary" with the explanation and **no** subscribe/manage buttons; the compare section still shows what Pro includes, with Pro marked current.
- Toasts: none needed here; state is shown in place. A successful confirmed upgrade may show one `Set updated`-style success toast "You're on Pro." on the first load where paid state is newly observed.

---

## Screen 2: Verify email before first checkout

### Purpose
Ensure the account's email is verified before its first paid checkout, reusing the Public Accounts verification flow — without gating any Free functionality.

### URL pattern
Rendered inline on `/settings/billing` (no separate route); links to the existing `/verify-email` surface from Public Accounts.

### Trigger
A lifter on Free/trial taps a subscribe action while `emailVerifiedAt` is null.

### Layout
```text
┌────────────────────────────────────────────┐
│  Verify your email to subscribe              │
│  We sent a link to will@example.com.         │
│  Verifying protects your subscription and    │
│  receipts. It isn't needed to use Free.      │
│  [ Resend verification email ]               │
│  Already verified? [ Refresh ]               │
└────────────────────────────────────────────┘
```

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Explanation** | `text-sm text-muted-foreground` | states verification is required only for checkout, not for Free |
| **Resend** | `Button` variant `outline` | reuses Public Accounts' resend-verification action; enumeration/throttle behavior unchanged |
| **Refresh** | `Button` variant `ghost` | re-reads the session; once verified, the subscribe buttons return |

### Validation / Empty / Loading / Error
- Loading: the subscribe area shows a `Skeleton` while the verification status is read.
- Error: resend failure → inline alert "Couldn't send the email. Try again." with Retry; never reveals account existence beyond what Public Accounts already does.
- This step blocks **only** the checkout action; every other control on the Plan & Billing screen and the whole app stays usable.

### Behavior
- Once verified, the subscribe buttons appear in place; no page reload required beyond the Refresh re-read.
- Never shown to an already-verified account, and never shown as a precondition for any Free action.

---

## Screen 3: Hosted Checkout and promotion entry (Stripe)

### Purpose
Collect payment and apply a promotion code on Stripe's own hosted page — Overload renders none of it and never sees a card.

### URL pattern
Stripe-hosted (external domain). Overload supplies success/cancel return URLs back to `/settings/billing?status=…`.

### Trigger
An interval subscribe action on Screen 1 (email verified).

### Layout (reference only — Stripe renders this)
```text
┌──────────── Stripe Checkout (hosted) ───────────┐
│ Overload Pro — Monthly         $4.99 / month    │
│ [ card fields handled entirely by Stripe ]      │
│ Promotion code  [ BLIZZY            ] [Apply]   │
│   50% off for 3 months, then $4.99/month        │
│ Total due today: $2.50                          │
│ [ Subscribe ]                                   │
└──────────────────────────────────────────────┘
```

### Behavior / disclosure
- The promotion-code field is Stripe's built-in `allow_promotion_codes` field; BLIZZY is entered here, not in Overload.
- Stripe validates eligibility (first-time customer, redemption cap, applicable product/interval). Overload does not pre-validate or echo the code.
- The hosted page shows the promotional price, its duration, the regular recurring price afterward, and the renewal terms. Our Checkout configuration requests these so the disclosure (principle 5) is present on Stripe's page; the Plan & Billing screen repeats the regular price in its disclosure line.
- On completion, Stripe redirects to the success return URL; the authoritative subscription state arrives by webhook (Screen 1 success behavior), never from the redirect.
- An exhausted/invalid code is rejected on Stripe's page with Stripe's own message; the lifter can remove it and continue at the regular price, or cancel back to `/settings/billing?status=cancelled`.

### Note
Overload designs no card form, promo field, or price math of its own. This screen exists in the doc only to fix the disclosure contract and the return targets; it is not an Overload screen to build.

---

## Screen 4: The quiet upgrade note (inline locked state)

### Purpose
Where a Pro interpretation would render for a Free lifter, explain in one dismissible line that it belongs to Pro, without blocking the surrounding Free content.

### URL pattern
Inline on existing surfaces: the exercise logging card recommendation area, Today's planned list recommendation line, the day-complete summary, the e1RM trend area on the exercise page, and the Exercise History & PR Intelligence page.

### Trigger
A Free (or lapsed) account viewing a surface whose Pro result is withheld.

### Layout
```text
Exercise card (Free lifter), recommendation area:
┌────────────────────────────────────────────┐
│ Barbell Bench Press                          │
│ Downtown Gym · 3 × 6–8                       │
│  Set 1   [ 185 ] lbs  [  8 ] reps            │
│  Set 2   [ 185 ] lbs  [  8 ] reps            │
│  Set 3   [ 185 ] lbs  [    ] reps            │
│  ──────────────────────────────────────     │
│  Progression insights are part of Pro.  ✕    │
│  See the call and why → Plan & Billing       │
└────────────────────────────────────────────┘
```

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Note text** | `text-sm text-muted-foreground`, one line (wraps to two on narrow) | plain sentence naming the Pro feature; no urgency, no price |
| **Link** | inline `Link` to `/settings/billing`, accent text | "Plan & Billing" — the only call to action |
| **Dismiss** | `Button` variant `ghost` size `icon`, `X` glyph, 44px target | dismisses the note for that surface; persisted per account+surface so it does not nag |

### Behavior
- **One note per screen.** If a screen could show the note in several places (e.g. a list of exercises each with a withheld call), it renders once at the surface level, not per row.
- Dismissed state is remembered per surface (per account) so the lifter is not re-sold the same thing each visit. The Plan & Billing screen is always reachable regardless.
- The set-entry controls, weights, reps, RIR entry, swap, and the rest of the Free card are fully interactive; only the computed call/evidence is replaced by the note.
- Never a dialog, toast, banner, countdown, or color alert. Never mid-set interruption.
- A Pro lifter never sees this note; the real recommendation renders unchanged.

### Empty / Loading / Error
- Loading: the recommendation area shows its normal skeleton; the note replaces the result only once the plan is known to be Free.
- Error reading entitlement: fail safe to Free presentation (the note), never leak a Pro result.

---

## Screen 5: Trial status in Settings

### Purpose
Give the trial a calm, non-intrusive presence so the lifter knows it exists and when it ends, without a banner.

### URL pattern
`/settings` (the Settings index), plus the fuller panel on `/settings/billing`.

### Layout
```text
Settings index row:
  Plan & Billing            Pro — trial · 9 days left  ›
```

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Settings row** | existing settings list row | right-aligned `text-xs text-muted-foreground` sub-label showing the resolved state short form |
| **Sub-label variants** | — | "Pro — trial · N days left" / "Free" / "Pro — Monthly" / "Pro — complimentary" / "Pro — ends MMM D" / "Payment problem" |

### Behavior
- The days-left count is computed in the account's timezone and matches the authoritative trial end; it never blocks and never appears outside Settings and the billing screen.
- No countdown animation, no color, no persistent banner anywhere else in the app.

---

## Screen 6: Admin — account entitlement & billing section

### Purpose
Let the owner see an account's resolved entitlement and read-only Stripe mirror, and grant or revoke complimentary Pro, within the existing privacy boundary (no training content).

### URL pattern
`/admin/accounts/[id]` — a new section on the existing account detail page.

### Layout
```text
┌──────────────────────────────────────────────┐
│ William Rhodes  @will   will@example.com       │
│ [Active]                                       │
│ Joined 2026-08-01 · Last seen 2026-10-31       │
├──────────────────────────────────────────────┤
│  Plan & entitlement                            │
│  Effective: Pro                                │
│  Source: Complimentary (founding member)       │
│          granted by owner · until —            │
│  Subscription (Stripe, read-only):             │
│     none                                       │
│  [ Revoke complimentary access ]               │
├──────────────────────────────────────────────┤
│  (paying example)                              │
│  Effective: Pro                                │
│  Source: Subscription                          │
│  Stripe: active · Monthly · renews 2026-12-01  │
│          promo: BLIZZY (2 of 3 months)         │
│  [ Grant complimentary access ]                │
├──────────────────────────────────────────────┤
│  Access  [ Suspend account ]                   │
│  Account help  [ Send password-reset email ]   │
│  Admin actions (recent)  …                     │
└──────────────────────────────────────────────┘
```

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Effective plan** | `text-sm font-medium` | the resolved capability plan (Free/Pro) — the same value enforced for the account |
| **Source** | `text-sm` + `Badge` for comp vs subscription | distinguishes Trial / Subscription / Complimentary; a comp is never labelled "subscriber" |
| **Stripe mirror** | `text-sm text-muted-foreground`, read-only facts | status, interval, renewal/cancel date, promo code + progress (e.g. "2 of 3 months"); "none" when no subscription |
| **Grant comp** | `Button` variant `outline` → `Dialog` | opens the grant dialog (Screen 7a); audited |
| **Revoke comp** | `Button` variant `outline` → `Dialog` | shown only when a comp exists; audited |

### Behavior
- Every billing fact here is a read-only mirror of Stripe; there is no control to edit subscription status, amount, interval, or card. The only writable entitlement is the comp (grant/revoke).
- The section never shows plans, sessions, logged sets, goals, gyms, or cardio — the admin privacy boundary is unchanged.
- The resolved "Effective" line is computed from all sources so the owner sees exactly what the account experiences, while the "Source" line explains why.

### Empty / Loading / Error
- Loading: `Skeleton` rows for effective/source/stripe facts.
- No Stripe customer yet: "Subscription (Stripe): none" — not an error.
- Grant/revoke failure: inline `Alert` in the dialog with Retry; the audit entry and the entitlement change are one transaction, so a failure leaves neither.

---

## Screen 7a: Admin — Grant complimentary access dialog

### Purpose
Capture the required reason and optional end date for a comp grant.

### Trigger
"Grant complimentary access" on Screen 6.

### Layout
```text
┌──────────────── Dialog ────────────────┐
│ Grant complimentary Pro                 │
│ William Rhodes · will@example.com       │
│                                         │
│ Reason *   [ Founding member      ▾ ]   │
│            (Friend · Creator · Tester · │
│             Founding member · Other)    │
│ Note        [ optional free text     ]  │
│ Ends on     [ YYYY-MM-DD ] (optional)   │
│                                         │
│      [ Cancel ]   [ Grant access ]      │
└─────────────────────────────────────────┘
```

### Fields
| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Reason | select (Friend, Creator, Tester, Founding member, Other) | yes | — | must pick one; "Other" reveals the note field as required |
| Note | text | no (yes if reason = Other) | empty | short free text, stored with the grant |
| Ends on | date | no | empty (open-ended) | must be a future date in the owner's timezone if set |

### Validation
- "Grant access" disabled until a reason is chosen (and a note present when Other).
- An end date in the past is rejected inline: "Pick a future date or leave it open."

### Behavior
- Confirming writes the comp entitlement and an append-only audit entry (who, which account, reason, end date) in one transaction (reusing the admin audit pattern).
- On success: dialog closes, the entitlement section re-reads to show "Source: Complimentary", and a success toast "Complimentary Pro granted." The comp never creates or touches a Stripe subscription.
- Confirmation copy is specific; this is not a destructive action but it is an account-affecting one, so it uses a dialog rather than an inline toggle.

## Screen 7b: Admin — Revoke complimentary access dialog

### Purpose
Confirm removal of a comp, naming the account.

### Layout
```text
┌──────────────── Dialog ────────────────┐
│ Revoke complimentary Pro                │
│ This removes complimentary Pro from     │
│ William Rhodes. Their access will be    │
│ recalculated from any other valid       │
│ source (trial or subscription). No      │
│ training data is affected.              │
│      [ Cancel ]   [ Revoke access ]     │
└─────────────────────────────────────────┘
```

### Behavior
- `Button` variant `destructive` for "Revoke access"; confirmation dialog names the account explicitly.
- Writes the revoke + audit entry in one transaction; on success re-reads the entitlement section, which then shows the account's remaining effective access (often Free, or Pro if a paid subscription also exists).
- Never touches Stripe.

---

## Screen 8: Admin — Billing overview

### Purpose
Give the owner an operational read on subscriptions and the BLIZZY campaign without exposing training content or allowing edits.

### URL pattern
`/admin/billing` (new owner-only page) and a small snapshot block on `/admin` Overview.

### Layout
```text
┌──────────────────────────────────────────────┐
│ Billing                                        │
│  Active Pro subscriptions      12              │
│  Trials in progress            37              │
│  Complimentary (non-paying)     9              │
│  Canceling at period end        2              │
│  Payment problems (grace)       1              │
├──────────────────────────────────────────────┤
│  Promotions                                    │
│  BLIZZY — 50% off 3 months (monthly)           │
│  Redemptions   41 / 200                         │
│  Recent redemptions (account · date)           │
│    @will · 2026-10-30                           │
│    @sam  · 2026-10-29                           │
└──────────────────────────────────────────────┘
```

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Count rows** | large `tabular-nums` figures, label beneath, like the Overview metric cards | aggregate counts from the Stripe mirror + entitlement records; complimentary is counted and labelled separately from paying |
| **Promo block** | `Card` | shows the campaign terms, redemption progress `41 / 200`, and recent redemptions by account handle + date |
| **No edit controls** | — | everything is read-only; comps are managed on the account page, not here |

### Behavior
- Counts distinguish paying subscriptions from complimentary and trial — a comp is never added into "Active Pro subscriptions."
- Redemption list links each row to that account's admin page; it shows handle/email and date only, never training content.
- The redemption count reflects verified Stripe redemptions, not codes merely typed.

### Empty / Loading / Error
- Empty (test mode, nothing yet): each count shows `0`; the promo block shows "No redemptions yet."
- Loading: `Skeleton` metric rows.
- Error reading the mirror: inline alert with Retry; counts never guess.

---

## 7. Navigation flows

```text
Settings → Plan & Billing (/settings/billing)
   ├ Free/trial → [Subscribe] → (email verified?) 
   │                 ├ no  → verify-email step → /verify-email → back
   │                 └ yes → create checkout session → Stripe Checkout ↗
   │                            ├ complete → /settings/billing?status=success
   │                            │              → "finishing up" → (webhook) → Pro
   │                            └ cancel   → /settings/billing?status=cancelled
   ├ Paid → [Manage billing] → Stripe Customer Portal ↗ → back → re-read state
   └ Comp → read-only "Pro — complimentary", no checkout

Any Pro-interpretation surface (Free account)
   └ withheld result → [quiet upgrade note] → link → /settings/billing

Admin → Accounts → account page
   ├ Plan & entitlement section (read)
   ├ [Grant complimentary] → dialog → confirm → audited → re-read
   └ [Revoke complimentary] → dialog → confirm → audited → re-read
Admin → Billing (/admin/billing) → read-only counts + BLIZZY redemptions
   └ redemption row → account page
```

- All navigation to Stripe is a full-page browser navigation (hosted Checkout / Portal), returning to an Overload return URL. No deep links, no native return handling (web-only this run).
- State carried to Stripe: the account's Stripe customer reference and the chosen price; carried back: only `?status`, never entitlement truth.

## 8. Interaction specifications

### Keyboard navigation
| Context | Key | Action |
| ------- | --- | ------ |
| Plan & Billing interval buttons | Tab / Enter | focus and activate a subscribe action |
| Upgrade note | Tab to dismiss, Enter/Space | dismiss the note; Tab to the link, Enter follows it |
| Grant/revoke dialog | Escape | close and return focus to the trigger button |
| Grant dialog reason select | Up/Down/Enter | choose a reason |

- Dialogs trap focus while open and return it to the trigger on close.
- No new global shortcuts.

### Loading states
- Plan & Billing: `Skeleton` for the plan panel and cards; interval buttons show `Loader2` + "Starting checkout…" while the session is created.
- Success return: a bounded "finishing up" state with `Loader2`, not a spinner over a blank screen.
- Admin entitlement section and billing overview: `Skeleton` rows.

### Error states
Use shadcn/ui `Alert` inline with Retry. Plain English, action-oriented. Never a full-screen red takeover. A failed checkout-session creation keeps the lifter on the billing screen with their plan unchanged. A payment-problem account sees a muted line, not an alarm.

### Notifications (Sonner)
| Action | Message | Severity | Duration |
| ------ | ------- | -------- | -------- |
| Subscription confirmed (first observed paid load) | `You're on Pro.` | success | 4s |
| Complimentary Pro granted (admin) | `Complimentary Pro granted.` | success | 4s |
| Complimentary Pro revoked (admin) | `Complimentary access revoked.` | info | 4s |
| Checkout could not start | `Couldn't start checkout. Please try again.` | error | until dismissed (inline + optional toast) |

- Trial expiry is **not** a toast or a push; it is simply reflected in the resolved state the next time any surface reads it.
- The upgrade note is never a toast.

### Destructive / account-affecting actions
- Revoke complimentary access: confirmation `Dialog` naming the account; `destructive` button; explains data is untouched and access recalculates.
- Grant complimentary access: `Dialog` with required reason; not destructive but account-affecting, so confirmed, not a one-tap toggle.
- There is no "cancel subscription" control inside Overload — cancellation happens in the Stripe Customer Portal, by design, so Overload builds no destructive billing control of its own.

## 9. Responsive behavior

| Breakpoint | Width | Behavior |
| ---------- | ----- | -------- |
| base | below 640px | Plan & Billing is a single column: plan panel, then Free card, then Pro card stacked; interval buttons full-width and thumb-reachable. The upgrade note wraps to two lines, dismiss stays a 44px target. Admin dialogs are full-width sheets. |
| `sm` | 640px+ | wider single column, roomier cards |
| `md` | 768px+ | Free and Pro cards sit side by side; admin account page keeps its existing two-column facts, entitlement section full width above Access |
| `lg` | 1024px+ | centered max-width; admin billing counts in a single row |

Every action — subscribe, manage billing, dismiss note, grant/revoke comp — is available at the base breakpoint. Admin is web-only but still renders usably on a narrow browser.

## 10. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `PlanBillingPanel` | `/settings/billing` | new | reads resolved state; renders the your-plan panel; variants per state (Free, Trial, Paid, Comp, Canceling, Grace) |
| `PlanComparison` | `/settings/billing` | new | Free vs Pro cards; marks current; interval subscribe buttons |
| `SubscribeButtons` | billing panel | new | Monthly/Annual actions; disabled+spinner while creating session |
| `VerifyBeforeCheckout` | billing panel | new | inline email-verify step; reuses Public Accounts resend action |
| `UpgradeNote` | exercise card, Today list, day-complete, exercise page, PR intelligence | new | one dismissible line; per-surface dismissal; the only Free-lock UI |
| `EntitlementState` (display) | Settings row, billing panel, admin account page | new | pure presentational mapping of resolved state → label; single source of copy |
| `AdminEntitlementSection` | `/admin/accounts/[id]` | new | effective plan, source, read-only Stripe mirror, grant/revoke |
| `GrantCompDialog` / `RevokeCompDialog` | admin account page | new | reason+date; confirmation; audited |
| `AdminBillingOverview` | `/admin/billing`, `/admin` snapshot | new | read-only counts + BLIZZY redemptions |

- `EntitlementState` copy is defined once and reused by lifter and admin surfaces so paid/comp wording never diverges.
- Do not over-decompose; the spec owns finer breakdown.

## 11. Accessibility, privacy, and data sensitivity

Accessibility:
- Every subscribe/manage/grant/revoke/dismiss control has an accessible name; the upgrade-note dismiss is labelled "Dismiss — progression insights are part of Pro."
- Billing state never relies on color (it uses none); the payment-problem glyph has a text label beside it.
- Dialogs trap focus; Escape closes and returns focus to the trigger.
- Prices and counts use tabular numerals; interval buttons are ≥44px.
- The "finishing up" state is announced to screen readers via an `aria-live="polite"` region.

Privacy:
- No share/social/cross-account affordance anywhere in billing.
- The admin billing surfaces show account metadata and aggregate counts only — never a plan, session, logged set, goal, gym, or cardio record. The redemption list shows handle/email + date only.
- Card data never appears in Overload — the card form lives only on Stripe's hosted page.
- No external links beyond the Stripe-hosted Checkout/Portal (the one sanctioned external destination), which open as full-page navigations with explicit return URLs.
- Names/emails are personal data: never logged, never shown to another account; the owner sees them only in the existing admin metadata boundary.

## 12. Out of scope

Pitch boundaries (not designed here):
- Native iOS/Android billing, StoreKit, Play Billing, native purchase sheets, Capacitor, Universal Links, native return handling (iOS Foundation is postponed; web-only this run).
- The public landing page, `/blizzy` creator page, public pricing page, and public changelog (the following marketing pitch; this feature only provides the authenticated entry points they will reuse).
- The Workout Plan Import & Review workflow and any language-model integration (a later pitch; this feature only establishes its Pro capability boundary, with no import UI).
- Additional tiers (lifetime, six-month, family, team, coaching), referral/affiliate programs, creator payouts.
- Any card-entry form, token storage, or price math inside Overload.
- Live payment collection, Stripe live mode, production migrations, enabling public signup — all human-gated.

Permanent non-goals (never): program/mesocycle generation or any AI coach; social features; ads of any kind; dated goals; a rest timer; progression analysis of cardio; any admin view of an account's training content; any change to the progression thresholds, e1RM formula, RIR qualifiers, scheduled deloads, or gym baselines.

## 13. User guidance

### Tour steps
This feature's primary new surface is the Plan & Billing leaf in Settings and the quiet upgrade note. A single, low-key tour step is warranted, anchored once:

- **Anchor:** the "Plan & Billing" row in Settings. **Copy:** "Your plan lives here. New accounts get 14 days of Pro — after that you stay on Free with everything you've logged." **Phone/desktop:** a spotlight popover on the Settings row; one step, skippable, never auto-shown mid-workout.
- No tour step anchors the upgrade note itself — the note explains itself in place, and adding a tour step there would double the messaging the principle forbids.
- Existing lifters are not re-run through onboarding; this step joins the registry for new tours only.

Final decision on whether the step ships is the `/overload-onboarding` skill's to make against the actual shipped surface (guidance ticket), per the pitch.

### Tour steps added

Decided by `overload-onboarding` in OVE-95. Same columns as the Onboarding Tour's initial table; the registry's copy is pinned to this table. One step, placed before the final Settings step (journey order: the plan sits at the end, in Settings).

| # | id | Screen | Targets (first visible wins) | Title | Body |
| - | -- | ------ | ---------------------------- | ----- | ---- |
| 10 | `plan-billing` | Settings `/settings` | Plan & Billing row | **Plan & Billing** | Your plan lives here. New accounts get 14 days of Pro — after that you stay on Free with everything you've logged. |

### Release note (What's New)
- **Title:** "Introducing Free and Pro"
- **Body:** "Keep planning and logging your workouts for free, always. Pro adds progression recommendations, e1RM trends, stall detection, and deeper exercise history. New accounts get 14 days of Pro to try it."
- **Significant:** yes (opens the What's New modal) — a major change to the product's offering.
- The entry must reflect actual shipped behavior and must **not** announce live payments or public availability; it uses the real production ship date, set at merge.

## 14. Plan placement and platform impact

### Plan placement
This pitch *defines* plan placement for the whole product. The gating lives on the **interpretation** surfaces; everything else is Free.

- **Always Free (never a lock, never a note):** plan building (splits, mesocycles, sessions, scheduled-deload configuration), workout logging, RIR *entry*, bodyweight logging, exercise swap, missed-day resolution, exercise library + custom exercises, gyms + working-weight baselines, full logged history + historical correction, goals + their established progress, data export, account management + deletion, feedback/support.
- **Pro (one quiet dismissible note where withheld):** progression recommendations (progress/hold/reactive-deload) + suggested increases + evidence lines; e1RM trends + stall detection; RIR used *in* progression interpretation; Exercise History & PR Intelligence (records, trend views, per-session calls); and the future Plan Import capability when it ships.
- **Free locked state:** the single `UpgradeNote` line on the withheld surface, linking to Plan & Billing, dismissible per surface. Never a banner or countdown.
- **Trial:** full Pro for 14 days from signup, card-free; a small Settings sub-label is the only ambient indicator.
- Exact capability names and their mapping to each surface are the spec's to fix; the design commitment is: Free sees the note, Pro sees the real result, and the boundary falls exactly on interpretation.

### Platform impact
iOS Foundation is postponed (owner-authorized), so platform impact is recorded as **pending** and this feature is **web-only this run**. Noted differences for the future native phase (designed-for, not built): hosted Checkout/Portal return must become a native-return concern (Universal Links / in-app browser), and store billing policies (App Store external-link rules, Play Billing) will govern whether a purchase action may appear in an app shell at all. The entitlement model is deliberately platform-neutral so the same resolved access serves a future native client unchanged. The admin area is web-only permanently.

## Open questions

None blocking. All product decisions are fixed by the pitch and the run's pre-resolved decisions; the remaining choices (exact capability names, entitlement resolution/expiry mechanics, Stripe coupon-duration semantics, grace-window transitions, webhook event set, per-surface dismissal storage) are technical and belong to the spec, not the design.
