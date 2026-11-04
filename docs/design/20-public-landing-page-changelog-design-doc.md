# Public Landing Page & Changelog — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 21: Public Landing Page & Changelog (`pitches/20-public-landing-page-changelog.md`)
**Focus:** The public pages a creator-video viewer lands on (landing, pricing, the BLIZZY page, the changelog, privacy, terms, and support), what they say, which single action each offers in each signup and billing mode, and the synthetic demo data the screenshots come from.

> Written in pipeline artifact mode under the Autonomous Pipeline Policy. No interview was held. Each question the skill would have asked is answered below from the pitch, the run prompt's pre-resolved decisions 1–12, the planning docs, and the current code, and is listed in §15 for the spec to carry as Resolved Decisions.

---

## 2. Vision

Someone watched a video, typed `overloadtraining.app`, and has about thirty seconds. They need to learn what Overload does with the sets they log, what it costs, and whether they can get in today. They should leave knowing the truth on all three, even when the honest answer is "not yet."

**North star:** *Show the call, not the pitch.* Every claim on the page sits next to a real screen from synthetic demo data that proves it, and every button does exactly what its label says in the current mode.

## 3. Design principles

### 1. A claim needs its screen

Each section makes one concrete claim and shows the real interface that makes it true: a real capture from the seeded demo account, captioned with what it shows. A claim with no screen behind it gets cut, not reworded. There are no illustrations, stock photos, rendered mockups, or generated images posing as screenshots.

### 2. The button tells the truth about today

The call to action comes from the server's current signup mode (closed, invite, or public), the billing switch, and whether the visitor is signed in. It never comes from a hard-coded launch date or the browser. Closed means no signup button and no waitlist. Invite means the button says an invite code is needed. Billing off means no Subscribe or Pay button anywhere, and every price is labeled as not on sale yet.

### 3. Free is said first and said plainly

Capture, history, goals, and export are free, with no ads. Pro is the interpretation: the progress, hold, or deload call, why it was made, the e1RM trend, and exercise history intelligence. Pages that mention a Pro feature label it Pro. Plan import has not shipped and is not mentioned as a feature.

### 4. Quiet instrument, public edition

The same calm system as the app: Inter, the restrained Overload blue, dividers rather than shadows, generous whitespace, and tabular numerals. A public page gets more room and larger type than an app screen, but no gradients, glows, animated backgrounds, countdowns, badges, star ratings, member counts, or testimonials.

### 5. The app is never a click away from a loop

A signed-in lifter who opens `/` sees Today, exactly as before. Every public page offers "Open Overload" to a signed-in visitor, and no path bounces between the marketing pages, login, and the app.

## 4. Visual language

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

### Color palette

| Token / theme path | Usage | Notes |
| --- | --- | --- |
| `background` | page background | both appearances |
| `card` | screenshot frames, plan cards, offer panel | one step up from background |
| `border` | section dividers, frame hairline, plan card outline | hairlines only, no shadows on cards |
| `foreground` | headlines, body copy, prices | high contrast |
| `muted-foreground` | captions, availability notes, footer | never on `card` at low contrast for body text |
| `primary` | the single primary CTA per view, links, the Pro label | the only accent; never a gradient |
| `primary/10` (soft) | Pro chip background, current-mode note background | soft accent |
| progress / deload tokens | **only** inside real screenshots (they come from the app) | never used decoratively in marketing chrome |

### State colors

The marketing pages have no progression state of their own. The only states are availability states, shown in text with a neutral treatment:

| State | Visual treatment | Usage |
| --- | --- | --- |
| Available now | the primary button | the one action that works today |
| Not on sale yet (billing off) | `muted-foreground` sentence under the price, with a `Badge variant="outline"` reading "Not on sale yet" | pricing, `/blizzy` |
| Invite needed | a plain sentence above or under the button, in `muted-foreground` | landing, pricing, `/blizzy` |
| Not taking new accounts (closed) | a plain sentence where the signup button would be, plus a Sign in action | landing, pricing, `/blizzy` |
| Draft (legal page, non-production) | `Alert` with "Draft for owner review — not in effect" | `/privacy`, `/terms` outside production |
| Being finalized (legal page, production, not yet approved) | a short plain paragraph and a support contact | `/privacy`, `/terms` in production until approved |

Color is never the only signal. Every state has words.

### Typography, spacing, radius, elevation

- **Hero headline:** `text-4xl md:text-5xl font-semibold tracking-tight`, at most two lines at phone width. This is the only display size. No bold or heavier weight.
- **Section headline:** `text-2xl md:text-3xl font-semibold tracking-tight`.
- **Body:** `text-base md:text-lg leading-relaxed text-muted-foreground`, max width about 34rem (`max-w-xl`).
- **Prices:** `text-3xl font-semibold tabular-nums`. The interval reads "/ month" or "/ year" in `muted-foreground`.
- **Sections:** `py-16 md:py-24`, separated by `border-t border-border`. Content column `max-w-5xl mx-auto px-4 md:px-6`.
- **Screenshot frame:** `rounded-xl border border-border bg-card overflow-hidden`. No drop shadow, no device bezel, and no tilt or perspective.
- **Radius:** `rounded-lg` for cards and buttons, matching the app.

### Appearance

Public pages follow the visitor's system appearance, with no toggle on the page. Signed-in visitors keep their stored preference through the existing boot script. Screenshots are captured in **both** appearances, and the page shows the one matching the active appearance (`dark:hidden` / `hidden dark:block`), so a dark page never shows a glaring light screenshot. If only one appearance has been captured, it is shown in both modes inside its bordered frame.

## 5. Information architecture

```text
Public (no account needed)                       Signed-in app (unchanged)
┌─────────────────────────────────────────┐     ┌──────────────────────────┐
│ Header: Overload · Pricing · Changelog   │     │ Today · Plan · History … │
│         [Sign in] [mode CTA]             │     └──────────────────────────┘
├─────────────────────────────────────────┤               ▲
│ /            Landing (signed out only)   │── signed in ──┘ (/ is Today)
│ /pricing     Free vs Pro                 │
│ /blizzy      The BLIZZY offer            │── sets campaign note (first-party, 2 h)
│ /changelog   Every update, newest first  │◀── same notes as Settings › What's New
│ /privacy     Privacy policy (gated)      │
│ /terms       Terms of service (gated)    │
│ /support     Existing help page          │
├─────────────────────────────────────────┤
│ Footer: Pricing · Changelog · Support ·  │
│         Privacy · Terms · © Overload     │
└─────────────────────────────────────────┘
        │ mode CTA
        ▼
  /signup (invite or public)  ·  /login  ·  /settings/billing (signed in, billing on)
```

- `/` shows the landing page to signed-out visitors and Today to signed-in lifters. The URL stays `/` in both cases.
- Public pages share one marketing frame (header and footer). It is not the app shell: no app navigation, no account menu, and no What's New dialog.
- The login, signup, and recovery screens keep their existing bare auth card. A quiet "Back to overloadtraining.app" link is not added there; the wordmark on the auth card stays as it is.
- Settings gains one quiet line of links at the bottom: Changelog · Privacy · Terms. The What's New page stays where it is.

## 6. Screen specifications

### Shared: marketing header

| Element | Component | Behavior |
| --- | --- | --- |
| Wordmark | `OverloadLockup size="sm"` inside `Link href="/"` | to `/` (landing for signed out, Today for signed in) |
| Pricing, Changelog | text links, `text-sm text-muted-foreground hover:text-foreground` | hidden below `sm`; shown in the footer instead |
| Secondary action | `Button variant="ghost" size="sm"` | "Sign in" for signed-out visitors; absent when signed in |
| Primary action | `Button size="sm"` | the mode CTA (§6.9). Signed in: "Open Overload" → `/` |

The header is not sticky on phones, so it doesn't take vertical space from screenshots. From `md` up it is `sticky top-0` with `bg-background/90 backdrop-blur border-b`.

### Shared: marketing footer

`border-t`, `py-10`, small `muted-foreground` links: Pricing · Changelog · Support · Privacy · Terms, then "© 2026 Overload". The year is rendered from the server's current year. There are no social icons and no newsletter field.

---

## Screen 1: Landing

### Purpose
Explain in under a minute what Overload decides for a lifter, prove it with real screens, and offer the one action available today.

### URL pattern
`/` for signed-out visitors (signed-in visitors get Today at the same URL).

### Trigger
A visitor opens `overloadtraining.app` from a video description, a link, or a search result.

### Hero concepts (the creative requirement)

Three honest concepts are previewed side by side in the UI preview. Each is grounded in a real screen.

| | Concept | Headline (draft) | Screen it rests on | Strength | Weakness |
| --- | --- | --- | --- | --- | --- |
| **A** | The call at the next set | "You logged the reps. Know what to do next." | Today with the calls beside each lift, for example Barbell Bench Press "Ready to go up · Try 190 lbs" | The core job in one line, and the screen *is* the product's answer | Leans on a Pro feature, so the Free/Pro line must come early |
| **B** | Your notes app's limit | "Your notes say 185 × 8. They can't say whether to go up." | A plain notes-style text block beside the logging card with its "Last time" line | Speaks to exactly who the brief targets: lifters who keep a plan in Notes | Opens on the problem rather than the product, and needs a non-product visual (the notes block), which we render as plain text, not a fake app |
| **C** | Two gyms | "One exercise. Two gyms. Two working weights." | The exercise page's gym selector showing Chest Press Machine at Northside Strength and Riverside Fitness | Memorable and unique to Overload | Matters only to lifters who train in more than one place, so it's too narrow as the front door |

**Chosen: A.** It states the brief's core job ("tell the lifter whether to progress, hold, or deload") in the lifter's own words and shows it at once. It is true for every visitor. B becomes the second section, which is the natural "why not notes" beat. C becomes the fourth section, the differentiator for multi-gym lifters. The headline remains a draft for owner approval.

### Layout (phone, base)

```text
┌──────────────────────────────────┐
│ ◆ Overload            [Sign in]  │
├──────────────────────────────────┤
│ You logged the reps.             │
│ Know what to do next.            │
│                                  │
│ Overload reads each set you log  │
│ against the plan you wrote, then │
│ makes the call for every lift:   │
│ go up, hold, or back off.        │
│                                  │
│ [  Mode CTA (full width)      ]  │
│ mode note (one line)             │
│ ┌──────────────────────────────┐ │
│ │ real screenshot: Today with  │ │
│ │ calls beside each lift       │ │
│ └──────────────────────────────┘ │
│ caption: "Demo data. Today, week │
│ 7: bench is ready to go up."     │
├──────────────────────────────────┤
│ 2  A log tells you what you did  │
│    copy + logging card capture   │
├──────────────────────────────────┤
│ 3  The call, and the reason  Pro │
│    copy + exercise page capture  │
├──────────────────────────────────┤
│ 4  Machines aren't universal     │
│    copy + two gym captures       │
├──────────────────────────────────┤
│ 5  A trend, not a list       Pro │
│    copy + e1RM chart capture     │
├──────────────────────────────────┤
│ 6  Logging is free. The call is  │
│    Pro.  two-column summary,     │
│    [See pricing]                 │
├──────────────────────────────────┤
│ 7  What Overload won't do        │
├──────────────────────────────────┤
│ 8  Recently shipped (3 notes)    │
│    [All updates →]               │
├──────────────────────────────────┤
│ Footer                           │
└──────────────────────────────────┘
```

From `md` up, the hero is two columns: the copy and CTA on the left (5/12) and the screenshot on the right (7/12). Feature sections alternate copy left/screen right and screen left/copy right. Section 4 shows the two gym captures side by side.

### Sections: claim → evidence → CTA

| # | Claim (draft copy) | Evidence (real screen, synthetic data) | CTA |
| --- | --- | --- | --- |
| 1 | "You logged the reps. Know what to do next." Overload reads each logged set against the plan you wrote and calls each lift: go up, hold, or back off. | `today` — Today in week 7 of the demo mesocycle, with Progress on Barbell Bench Press and no tag on held lifts | mode CTA |
| 2 | **A log tells you what you did.** Every set is kept, editable, and shown next time: the weight you used and the reps you got, at the gym you're in. Nothing is overwritten. | `logging` — the exercise logging card mid-workout with its "Last time" line | none |
| 3 | **The call, and the reason. (Pro)** "Ready to go up" comes with the weight to try and the sets that earned it. A hold says what's left to earn. A deload says where the sets fell short. Overload never changes your plan for you. | `exercise` — the exercise page's Next time block, for example "Ready to go up · Try 190 lbs" with its evidence line | none |
| 4 | **Machines aren't universal.** 100 lbs on one chest press isn't 100 lbs on another. Machine and cable weights are tracked per gym, while barbells and dumbbells stay the same everywhere. | `gym-a`, `gym-b` — the same Chest Press Machine page at Northside Strength and at Riverside Fitness, showing different working weights | none |
| 5 | **A trend, not a list. (Pro)** Estimated 1-rep max over the weeks, so a stall shows up as a flat line instead of a feeling. Deload weeks are marked, not hidden. | `trend` — the e1RM trend chart on the exercise page | none |
| 6 | **Logging is free. The call is Pro.** Free: plans, logging, history, goals, export, no ads. Pro: the calls and their reasons, e1RM trends and stall detection, exercise history and records. | text only (the two lists) | `See pricing` → `/pricing` (outline) |
| 7 | **What Overload won't do.** It won't write your program, coach you, show your training to anyone, or run ads. You build the plan. Overload keeps the record and makes the load call inside it. | text only | none |
| 8 | **Recently shipped.** The three newest release notes, with date and title. | the shared release-note source | `All updates` → `/changelog` (link) |

Section 6's Pro list names only capabilities in the deployed code (`progression_insights`, `e1rm_trends`, `exercise_history_intelligence`). "Plan import" does not appear.

### Banned phrasing (review check)

Copy is checked against a short banned list before it ships: "unlock your potential", "revolutionize", "train smarter, not harder", "game-changing", "supercharge", "unleash", "the ultimate", "crush your goals", "powerful analytics", "at your fingertips", "AI-powered", "AI-driven", "AI coach", "seamless", "next-level", "transform your", and any exclamation mark. Also banned are invented numbers: no member counts, ratings, "lifters trust", percentages of improvement, or "join thousands".

### Code reference

```tsx
<section className="mx-auto grid max-w-5xl gap-10 px-4 py-16 md:grid-cols-12 md:px-6 md:py-24">
  <div className="space-y-6 md:col-span-5 md:self-center">
    <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
      You logged the reps. Know what to do next.
    </h1>
    <p className="max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
      Overload reads each set you log against the plan you wrote, then makes the call for every lift: go up, hold, or back off.
    </p>
    <ModeCta placement="hero" />        {/* server-resolved; one primary button + one note */}
  </div>
  <figure className="md:col-span-7">
    <ScreenshotFrame shot="today" priority />   {/* light + dark captures */}
    <figcaption className="mt-3 text-sm text-muted-foreground">
      Demo data. Week 7: bench is ready to go up; the held lifts show nothing.
    </figcaption>
  </figure>
</section>
```

### Empty state
Recently shipped with no release notes hides the whole section; no "nothing here" text appears on the landing. A missing screenshot shows the **pending frame**: the same bordered frame at the same aspect ratio, with the centered `muted-foreground` text "Screenshot coming — captured from demo data before launch." It is never a mockup.

### Loading state
The page is static apart from the CTA area. The CTA area streams. While the server resolves the mode, a `Skeleton` the size of one button plus one text line holds the space (`h-11 w-full sm:w-48`, then `h-4 w-56`), so nothing shifts.

### Error state
If the mode cannot be resolved, which shouldn't happen because it is a pure read of server configuration, the CTA falls back to the closed state: "Sign in" plus a Support link. Failing closed never offers an action that might not work.

### Behavior
- The hero screenshot loads eagerly (`priority`). All others lazy-load at fixed dimensions (no layout shift).
- Screenshot images carry real `alt` text describing what the screen shows, for example "Overload Today screen: Barbell Bench Press marked ready to go up, try 190 lbs."
- No carousel, no autoplay, and no scroll-triggered animation.

---

## Screen 2: Pricing

### Purpose
Show exactly what is free, what Pro adds, what Pro costs, and whether it can be bought today.

### URL pattern
`/pricing`

### Trigger
The header or footer link, the landing's "See pricing", or the `/blizzy` page.

### Layout

```text
┌──────────────────────────────────────────────────┐
│ Free to log. Pro to decide.                      │
│ Everything you enter stays yours on either plan. │
├────────────────────────┬─────────────────────────┤
│ Free            $0     │ Pro                     │
│                        │ $4.99 / month           │
│ ✓ Plans & mesocycles   │ or $39.99 / year        │
│ ✓ Guided logging, RIR  │ [Not on sale yet]       │ ← billing off
│ ✓ Full history, edits  │ ✓ Everything in Free    │
│ ✓ Goals                │ ✓ Progress/hold/deload  │
│ ✓ Gyms & per-gym       │   calls and the reason  │
│   machine weights      │ ✓ e1RM trend & stall    │
│ ✓ Cardio log           │   detection             │
│ ✓ Export, delete       │ ✓ Exercise history,     │
│ ✓ No ads, ever         │   records, past calls   │
│                        │ 14 days of Pro free for │
│                        │ new accounts. No card.  │
│ [mode CTA]             │ [Pro CTA per mode]      │
├────────────────────────┴─────────────────────────┤
│ Questions                                        │
│ What happens when the trial ends?                │
│ What if I stop paying?                           │
│ Is there a discount code?                        │
│ Can I take my data with me?                      │
└──────────────────────────────────────────────────┘
```

On phones the two plan cards stack, Free first. From `md` up they sit side by side at equal height.

### Plan cards

| Element | Component | Behavior |
| --- | --- | --- |
| Plan card | `div.rounded-lg border bg-card p-6` | Pro's border is `border-primary/40`. No "Most popular" ribbon |
| Price | `text-3xl font-semibold tabular-nums` | Pro shows `$4.99 / month` and below it `or $39.99 / year` (about $3.33 a month). Values come from the existing display constants |
| Availability | `Badge variant="outline"` "Not on sale yet" plus one sentence | only when billing is off |
| Feature list | `ul` with `Check` icons (`size-4 text-muted-foreground`) | plain nouns, no adjectives |
| Trial line | `text-sm text-muted-foreground` | "New accounts get 14 days of Pro, no card. After that you're on Free unless you subscribe, and nothing is deleted." Shown in every mode, because it describes the plan, not an action |
| CTA | see §6.9 | Free card gets the mode CTA. Pro card gets the Pro CTA |

### Questions (static, short)

A plain `dl`, not an accordion, since it is short enough to show fully:
- **What happens when the trial ends?** You move to Free. Your plans, history, goals, and export stay. The calls and trends are Pro.
- **What if I stop paying?** Same as above. Nothing you logged is deleted, and logging never stops.
- **Is there a discount code?** BLIZZY gives 50% off the first three monthly bills for first-time subscribers, while redemptions last. Details on the BLIZZY page (link to `/blizzy`). When billing is off, this adds: "Subscriptions aren't on sale yet, so it can't be used today."
- **Can I take my data with me?** Yes. Export everything from Settings, any time, on either plan.

### Empty / Loading / Error
Pricing has no list that can be empty. CTA loading and error behave as on the landing (button skeleton, fail closed).

### Behavior
- With billing off, there is no Subscribe, Buy, or Pay control anywhere on the page.
- With billing on, the Pro CTA never opens Checkout from the public page. It sends a signed-in lifter to the existing Plan & Billing screen, where the existing email-verification and Checkout flow takes over.

---

## Screen 3: The BLIZZY offer

### Purpose
State the BLIZZY offer and its conditions exactly, show whether it can be used today, and carry the code to checkout without authorizing anything.

### URL pattern
`/blizzy`

### Trigger
The link in BLIZZY's video description, or the pricing page's question link.

### Layout

```text
┌──────────────────────────────────────┐
│ The BLIZZY offer                     │
│ 50% off your first three months      │
│ of Pro.                              │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ Code   BLIZZY            [Copy]  │ │
│ │──────────────────────────────────│ │
│ │ · Monthly plan only ($4.99/mo).  │ │
│ │ · 50% off the first three monthly│ │
│ │   bills, then the regular price. │ │
│ │ · First-time subscribers only.   │ │
│ │ · Up to 200 redemptions in total,│ │
│ │   so it can run out.             │ │
│ │ · Entered at checkout. The total │ │
│ │   shown there is final.          │ │
│ └──────────────────────────────────┘ │
│ Availability note (billing on/off)   │
│ [mode CTA]                           │
│                                      │
│ How it fits the trial: new accounts  │
│ start with 14 days of Pro, no card.  │
│ The code is for when you subscribe.  │
│                                      │
│ Disclosure line (owner-confirmed)    │
│ ──────────────────────────────────── │
│ What Overload is (3 lines + link to  │
│ the landing)                         │
└──────────────────────────────────────┘
```

### Offer panel

| Element | Component | Behavior |
| --- | --- | --- |
| Code row | `div.flex.items-center.justify-between` with the code in `font-mono text-lg tracking-wide` | the code is the literal "BLIZZY" from the existing billing constants |
| Copy | `Button variant="outline" size="sm"` with the `Copy` icon, then `Check` for 2 s | copies "BLIZZY" to the clipboard. On failure, the code stays selectable text and a `role="status"` line says "Couldn't copy. Select the code instead." |
| Conditions | `ul.space-y-2 text-sm` | exactly the five conditions above, with no countdown and no "spots left" |
| Availability (billing off) | `Badge variant="outline"` "Not on sale yet" plus "Pro subscriptions aren't on sale yet, so the code can't be used today. When they are, you'll enter it at checkout on the monthly plan." | |
| Availability (billing on) | "Enter BLIZZY at checkout on the monthly plan. Checkout shows whether it applies to you." | no promise of eligibility |
| Disclosure | `p.text-xs text-muted-foreground` directly under the panel, never in a footer | draft text: "This is a promotion for Overload offered through the creator BLIZZY." The owner must confirm or replace it with an accurate material-connection disclosure (runbook) |

### Behavior
- Visiting `/blizzy` remembers the campaign in a first-party note in this browser for two hours (§11). Nothing about the visitor is stored on the server by the visit itself.
- If the visitor creates an account within that window, the account records that it came from BLIZZY. That is the only provenance kept.
- The page never applies, validates, or reserves a discount. Stripe Checkout and the existing server-side billing checks decide.
- No remaining-redemptions counter. Overload doesn't know the live count and doesn't pretend to.

### Empty / Loading / Error
Static except the CTA and availability line, which stream with a skeleton and fail closed to "Not on sale yet" plus Sign in.

---

## Screen 4: Changelog

### Purpose
Show every update to Overload, newest first: the same notes signed-in lifters get in What's New.

### URL pattern
`/changelog`

### Layout

```text
┌──────────────────────────────────────┐
│ Changelog                            │
│ Every update to Overload, newest     │
│ first. Lifters see the same notes in │
│ the app under What's New.            │
├──────────────────────────────────────┤
│ Nov 1, 2026                          │
│ Introducing Free and Pro             │
│ Keep planning and logging …          │
├──────────────────────────────────────┤
│ Oct 29, 2026                         │
│ Reset your password by email         │
│ …                                    │
└──────────────────────────────────────┘
```

It reuses the existing `ReleaseNote` component (`headingLevel={2}`) inside an `ol.divide-y`, exactly like the What's New page, in a `max-w-2xl` column. Each entry has an `id` anchor (`/changelog#2026-11-01-introducing-free-and-pro`) so a specific note can be linked.

### Empty state
"No updates yet. When something changes in Overload, it's listed here." This is the same sentence the What's New page uses.

### Loading / Error
The page is static, built from repository content. An invalid catalog is a build-time failure, and CI blocks it before deploy.

### Behavior
- The page reads nothing about the visitor. Visiting it while signed in does not mark anything seen. The What's New dialog and its seen state are unchanged.
- Significance is invisible here, as it is on the What's New page. Every entry, significant or not, is listed.

---

## Screen 5 & 6: Privacy policy and Terms of service

### Purpose
Give the legal documents stable public addresses, built from the owner's drafts, without presenting a draft as the policy in force.

### URL patterns
`/privacy`, `/terms`

### Three states

1. **Published** (only after the owner fills every required fact and approves). The document is rendered as clean long-form text: an `h1`, an "Effective <date>" line, `h2` sections, and plain paragraphs and lists. No reviewer notes or brackets appear.
2. **Draft preview** (local development and preview deployments, until published). An `Alert` at the top reads "Draft for owner review — not in effect. Highlighted items are facts the owner must supply." The draft text follows, with each owner fact rendered as a highlighted inline marker such as `‹Legal name of owner or business›` in `bg-primary/10 rounded px-1`. This is how the owner reviews the text in place.
3. **Being finalized** (production, until published). This is a short page:

```text
┌──────────────────────────────────────┐
│ Privacy policy                       │
│                                      │
│ Our privacy policy is being          │
│ finalized and will be published at   │
│ this address.                        │
│                                      │
│ Until then, questions about your     │
│ data go to support@… . You can       │
│ export or delete your account from   │
│ Settings at any time.                │
└──────────────────────────────────────┘
```

The terms page reads the same, with "terms of service" and no export sentence. Every sentence in the "being finalized" state is verified true today. No other claim is made.

### Behavior
- Footer links point to these pages in every state.
- The pages render `noindex` until published, so a placeholder page is never indexed as the policy.

---

## Screen 7: Support (existing, unchanged)

`/support` keeps its existing card: mailto for signed-out visitors, Send feedback for signed-in ones. It gains no marketing frame and is linked from the footer. No new contact form.

---

## Screen 8: Settings — legal and changelog links (signed in)

One quiet line at the very bottom of Settings, below Delete account's section divider: `Changelog · Privacy · Terms` in `text-xs text-muted-foreground`. These are ordinary links to the public pages. This adds no tour step.

## Screen 9: Plan & Billing — code reminder (signed in, existing screen)

When billing is on, the account can subscribe, and BLIZZY intent is known (the account was created from `/blizzy`, or this browser visited `/blizzy` within two hours), the existing Plan & Billing screen shows one line above the monthly Subscribe button:

```text
Have the BLIZZY code? Enter BLIZZY at checkout on the monthly plan.   [Copy]
```

It shows nothing when billing is off or the account can't subscribe, and it never appears beside the annual button. It is display only: the discount is applied, refused, or capped by Stripe.

### 6.9 The mode CTA matrix

The server resolves one primary action and one note from **signed-in?**, **signup mode**, and **billing on?**. Billing never changes the landing's primary action; it changes only the Pro CTA and availability text.

| Visitor | Signup mode | Billing | Primary (landing, header, Free card) | Note | Pro card CTA (pricing) | `/blizzy` availability |
| --- | --- | --- | --- | --- | --- | --- |
| Signed in | any | off | **Open Overload** → `/` | none | "Not on sale yet" note, no button | not on sale yet |
| Signed in | any | on | **Open Overload** → `/` | none | **Go to Plan & Billing** → `/settings/billing` | enter code at checkout, with **Go to Plan & Billing** |
| Signed out | public | off | **Create an account** → `/signup` | "Free to use. New accounts get 14 days of Pro, no card." | "Not on sale yet" note, no button | not on sale yet. CTA: Create an account |
| Signed out | public | on | **Create an account** → `/signup` | same | **Create an account to subscribe** → `/signup` | enter code at checkout after signing up |
| Signed out | invite | off | **Join with an invite code** → `/signup` | "Overload is invite-only right now. You'll need an invite code to create an account." | "Not on sale yet" note, no button | not on sale yet. CTA: Join with an invite code |
| Signed out | invite | on | **Join with an invite code** → `/signup` | same | **Join with an invite code** → `/signup` | enter code at checkout after joining |
| Signed out | closed | off | **Sign in** → `/login` | "Overload isn't taking new accounts right now." plus a Support link | "Not on sale yet" note, no button | not on sale yet. CTA: Sign in |
| Signed out | closed | on | **Sign in** → `/login` | same | **Sign in to subscribe** → `/login` | for existing accounts: sign in and enter the code at checkout |

The secondary "Sign in" header action appears for signed-out visitors in public and invite modes. In closed mode, Sign in is already the primary action. There is no "Join the waitlist", "Notify me", or email field in any state.

## 7. Navigation flows

```text
Video link → /blizzy ──(campaign note set, 2 h)──┐
                │ mode CTA                        │
                ├─ public  → /signup → account created (provenance: blizzy) → Today
                ├─ invite  → /signup (needs code) → … → Today
                └─ closed  → /login (existing accounts only)

Signed-in lifter, billing on:
  /blizzy or /pricing → [Go to Plan & Billing] → /settings/billing
     → (code reminder line) → [Subscribe monthly] → verify email if needed
     → Stripe Checkout (promo field: BLIZZY) → back to Plan & Billing

/ (signed out) → landing → [See pricing] → /pricing → [mode CTA] → …
/ (signed in)  → Today (unchanged; no marketing page in between)

Settings › What's New  ─┐
                         ├─ same entries, same order, same dates
/changelog             ─┘
```

- No query parameters carry campaign state between pages. The campaign is held only in the first-party note.
- `/login` and `/signup` keep sending a signed-in visitor to Today, as they do now.

## 8. Interaction specifications

### Keyboard navigation

| Context | Key | Action |
| --- | --- | --- |
| Any public page | Tab (first) | A "Skip to content" link appears and jumps to `main` |
| Header | Tab / Shift+Tab | wordmark → Pricing → Changelog → Sign in → primary action |
| Offer panel | Enter / Space on Copy | copies the code. The status line announces "Copied" |
| Changelog | Tab | no interactive elements per entry; anchors are reachable by URL |

All links and buttons have visible focus rings (`focus-visible:ring-2 ring-ring ring-offset-2`).

### Loading states
Only the server-resolved CTA, availability note, and code reminder stream. They use button- and line-sized skeletons. Everything else is static HTML.

### Error states
Mode resolution failure fails closed (Sign in plus Support). A Copy failure keeps the code selectable and says so. A missing screenshot shows the pending frame. No page shows a full-screen error. The existing not-found page handles unknown URLs.

### Notifications
No toasts on public pages. Copy feedback is the inline icon swap plus a polite live-region status.

### Destructive actions
None. The public pages perform no writes.

## 9. Responsive behavior

| Breakpoint | Behavior |
| --- | --- |
| base (<640) | Single column. Header shows wordmark plus primary action, and "Sign in" stays visible in the header. Pricing and Changelog links move to the footer. Hero CTA is full width. Screenshots go full column width, after the copy. Plan cards stack with Free first. |
| `sm` | Header links appear. CTA goes back to its natural width. |
| `md` | Hero becomes two columns (copy 5 / screen 7). Feature sections alternate sides. The two gym captures sit side by side. Plan cards sit side by side. Sticky header. |
| `lg` | Content capped at `max-w-5xl`. Screenshots gain width, not elements. |

Phone screenshots (390 px captures) are used in narrow layouts where they read better, via `<picture>` with a `(max-width: 639px)` source. Desktop captures are used from `sm` up. Every action is available at every width. Nothing is hover-only.

## 10. Component inventory

| Component | Location | New / reused | Notes |
| --- | --- | --- | --- |
| `MarketingHeader`, `MarketingFooter` | marketing frame | new | server components |
| `ModeCta` | landing, pricing, `/blizzy`, header | new | server-resolved. Variants: hero, header, free-card, pro-card, offer |
| `ScreenshotFrame` | landing | new | light/dark × phone/desktop sources, pending frame, real alt text |
| `PlanCard` | pricing | new | Free and Pro variants. Availability badge |
| `OfferPanel` with `CopyCode` | `/blizzy`, Plan & Billing reminder | new | `CopyCode` is the only client island on public pages |
| `LegalDocument` | `/privacy`, `/terms` | new | published / draft-preview / being-finalized states |
| `ReleaseNote` | `/changelog`, landing section 8 | **reused** unchanged | same component as the What's New dialog and page |
| `Button`, `Badge`, `Alert`, `Skeleton` | throughout | reused | shadcn/ui |
| `OverloadLockup` | header | reused | |
| `SupportCard` | `/support` | reused, unchanged | |

## 11. Accessibility, privacy, and data sensitivity

**Accessibility**
- One `h1` per page and ordered headings. Landmarks: `header`, `main`, `footer`, `nav aria-label="Site"`.
- Screenshots have descriptive `alt` text naming what the screen shows. The pending frame has `role="img"` with an `aria-label` of "Screenshot not yet captured."
- Availability is always words (badge plus sentence), never color.
- Text contrast meets WCAG AA in both appearances. Captions use `muted-foreground` on `background`, not on `card`.
- Tap targets are at least 44 px (`h-11` for primary buttons on phones).
- Reduced motion: there is no motion to reduce. The only transition is the Copy icon swap.

**Privacy**
- **No third-party scripts** on public pages: no analytics, pixels, embeds, fonts from third parties, or demo-tool scripts. Inter is self-hosted through `next/font`, as it is today.
- **The campaign note** is a first-party, `HttpOnly`, `SameSite=Lax` cookie holding only the allowlisted campaign name and when it was set. It expires after two hours, sends nothing to anyone else, and is cleared once an account is created. It never holds an email, IP address, referrer, or query string.
- **Account provenance** is one value on the account ("came from BLIZZY", or nothing), written once at signup by the server. It is part of the account's export and is removed with the account.
- **Screenshots are synthetic.** They come only from the seeded demo account (fictional "Demo Lifter", Northside Strength, Riverside Fitness) on an isolated local stack. No real lifter's plan, gym, set, or name ever appears. A provenance record lists every image.
- Public pages read no account data. A signed-in visitor's public page knows only "signed in: yes", which it uses to show "Open Overload".

## 12. Out of scope

**Deferred (later pitches; design nothing now, preclude nothing):** plan import marketing (Pitch 22 ships it first), native iOS/Android pages, app store badges, deep links, the Pitch 23 launch checklist, a hosted interactive demo or embed (owner decision, separate review), testimonials once real ones exist (still needs a pitch), dated release-note categories or RSS.

**Not in this pitch, per its boundaries:** a blog, A/B tests, a waitlist or email capture, newsletters, referral programs, ad pixels or analytics SaaS, a CMS, public signup enablement, live billing, a pre-applied checkout discount, a remaining-redemptions counter, a live public demo login.

**Permanent non-goals:** program generation or any AI coach, social features, ads, dated goals, a rest timer, progression analysis of cardio, and any admin view of training content.

## 13. User guidance

- **Tour steps: none warranted.** The visible change for signed-in lifters is a line of links at the bottom of Settings and, when billing is on, a code reminder on Plan & Billing. Neither is a new workflow, and the tour covers workflows. Public pages are outside the app shell, where the tour doesn't run.
- **Release note (proposed, not significant):**
  - **Title:** "Overload's changelog is now public"
  - **Body:** "The same updates you see here are now listed on Overload's public changelog, next to the pricing, privacy, and terms pages. Find the links at the bottom of Settings."
  - **Significant:** no. It is list-only, because it changes nothing in how a lifter trains.

## 14. Plan placement and platform impact

- **Plan placement:** every public page is available with no account, and no public page returns a gated training result. The Free/Pro distinction on these pages is descriptive only. Server-side capability enforcement is unchanged. The Plan & Billing code reminder appears only where Subscribe already appears.
- **Platform impact:** **public web only; native postponed.** The pages are responsive web pages verified in mobile-browser widths. No Capacitor, deep link, store badge, or native control. Native device checks were **not run and are not claimed**. The iOS Foundation postponement versus the roadmap dependency map is a required upstream amendment (run report).

## 15. Decisions made in place of the interview (for the spec's Resolved Decisions)

1. Hero concept A chosen. B and C become sections 2 and 4 (creative requirement, §6 Screen 1).
2. `/` is the landing for signed-out visitors and Today for signed-in ones, at the same URL (principle 5, pitch rabbit hole 1).
3. Public pages use their own marketing frame, not the app shell. The auth cards are unchanged.
4. The CTA matrix in §6.9. Fails closed. No waitlist in any mode (pre-resolved decision 3, 10).
5. Billing on never opens Checkout from a public page. It routes to the existing Plan & Billing flow (pre-resolved decision 3, 10).
6. BLIZZY handoff is a copyable code plus Stripe's own promo field. Nothing is pre-applied (pre-resolved decision 5 fallback, since checkout cannot take a preselected code without changing billing semantics).
7. Campaign note: first-party cookie, two hours, cleared on signup. One provenance value is kept on the account (pre-resolved decision 9). Retention beyond the browser note is an owner privacy item.
8. Legal pages have three states (published, draft preview off-production, being finalized in production), and are `noindex` until published (pre-resolved decision 8).
9. Changelog lists every entry from the one source. Existing entries were reviewed and found public-safe, and a CI check keeps them that way (pre-resolved decision 6).
10. The creator disclosure sits directly under the offer, in draft wording, for the owner to confirm (pre-resolved decision 8).
11. Screenshots come only from the seeded synthetic account on the isolated local stack. Pending frames stand in where a capture is missing, never mockups (pre-resolved decision 7, pitch AC3).
12. No tour step. One non-significant release note (§13).
