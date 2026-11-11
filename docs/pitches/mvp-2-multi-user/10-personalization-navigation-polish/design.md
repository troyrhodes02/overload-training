# Personalization & Navigation Polish — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 10: Personalization & Navigation Polish
**Focus:** One plain greeting line on Today that names the lifter and tells the truth about their day, an Appearance choice in Settings (Light, Dark, System) that follows them to every screen, and a phone layout where navigation lives behind a menu button instead of permanently occupying the screen — with the desktop rail exactly as it is.

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

> **Authority notes.**
> 1. The `overload-ui-design` skill says "navigation is a simple bottom bar on mobile. Never hide core navigation behind a hamburger menu." The approved multi-user PRD ("on small screens a hamburger that opens the navigation in a sheet instead of a persistent sidebar"), the Pitch Roadmap (Pitch 10), and this pitch supersede that line for the phone layout. Everything else in the skill (direction, palette, type, states, thumb reach for primary actions) governs unchanged. Recorded as an upstream amendment.
> 2. The pitch describes today's phone navigation as a "persistent sidebar". In the code, phone-width navigation is a **fixed bottom bar** with six items (Today, Plan, History, Goals, Exercises, Gyms); the left rail appears only at `md` (768px) and up. This design treats that bottom bar as the persistent phone navigation the pitch replaces. The space reclaimed is the bar itself and the padding every screen reserves for it.
> 3. The pitch's standing resolutions are adopted as given: the wording is a deterministic pick seeded by the account and the local date; the late-night variant applies when a planned workout is unlogged between 9:00 pm and 4:00 am local time; appearance is stored on the account with System as the default.

---

## 2. Vision

Opening Overload should answer **"what's today?"** in the lifter's own terms before anything else: their name, their time of day, and one honest clause about their training — up, underway, done, rest, or not set up yet. Settings answers **"how should this look?"** with three choices that stick. On a phone, the screen belongs to the training; the destinations are one tap away, not in the way.

**North star:** *one true line, then the work — and the chrome steps aside.*

---

## 3. Design principles

### 1. A line, not a voice
The greeting is a heading made of two plain sentences at most: a salutation with the first name, and a factual clause about today. No question marks, no exclamation marks, no emoji, no advice, no encouragement, nothing that could be read as a coach or an assistant. If a sentence would still make sense on a motivational poster, it doesn't belong.

### 2. Tell the truth about today, and only today
The clause is chosen from the dashboard's own state. It never says a workout is waiting when the plan says rest, never says done when sets remain, never mentions yesterday's missed day (the missed-day prompt already owns that, without guilt), and never points at tomorrow. With no plan, it says so plainly and invents nothing.

### 3. Stable while you look
The same account, situation, and local date always produce the same sentence. The line can change when the day changes, the situation changes (the workout gets finished), or the time-of-day band changes — never because the page re-rendered.

### 4. One choice, everywhere
Appearance is chosen once, in Settings, and every screen, dialog, menu, toast, and chart follows it. System means "follow this device", live — not "whatever it was when I chose it". There is no other toggle anywhere.

### 5. The phone screen is for training
Below `md`, nothing is pinned to the screen except the header and the screen's own thumb-reach action. Navigation opens on demand from one button that is always in the same place, and gets out of the way the moment a destination is chosen. At `md` and up, nothing changes.

---

## 4. Visual language

#### Color palette

| Token / theme path | Usage | Notes |
| ------------------ | ----- | ----- |
| `foreground` | the greeting line; nav sheet labels; appearance option labels | greeting is the page heading |
| `muted-foreground` | the "Today · Mon, Oct 19" line under the greeting; inactive nav items; appearance helper text; the "Follows your device" note under System | |
| `background` | page canvas; the phone header surface (`bg-background/95` with backdrop blur, as the existing thumb-reach bars) | |
| `card` / `popover` | the navigation sheet surface (`bg-background` per shadcn `Sheet`) and the appearance option tiles (`bg-card`) | |
| `border` | the header hairline (`border-b`), the sheet edge, the divider between primary destinations and Settings in the sheet, option tile borders | |
| `primary` | active nav item text + `bg-primary/10` tint (same as the desktop rail's active item); the selected appearance tile's border, ring, and check | the only accent use in this feature |
| `ring` | focus rings on the menu button, sheet items, appearance tiles | |
| `destructive` | the inline "Couldn't save your appearance" message | |

No new tokens. **Progress and deload tokens are not used anywhere in this feature.** The appearance tiles do not preview the palette with colored swatches; the icon and the label carry the meaning.

#### State colors (display only)

| State | Visual treatment | Usage |
| ----- | ---------------- | ----- |
| Active destination | `text-primary font-semibold bg-primary/10`, `aria-current="page"` | current screen in the sheet (and, unchanged, in the desktop rail) |
| Inactive destination | `text-muted-foreground`, hover/focus `text-foreground` + `bg-accent` | other sheet items |
| Selected appearance | tile `border-primary ring-1 ring-primary`, `Check` icon in `text-primary`, label `font-medium` | the saved (or being-saved) choice |
| Unselected appearance | tile `border-border`, label `text-foreground`, icon `text-muted-foreground` | the other two |
| Saving error | `text-sm text-destructive` line under the tiles, `role="alert"` | appearance save failed and was reverted |

#### Typography, spacing, radius, elevation

Reference `overload-ui-design`. Feature-specific usage:

- **Greeting:** `h1`, `text-xl font-semibold tracking-tight text-balance`, wraps freely (never truncated, never an ellipsis). The existing date line beneath it stays `text-sm text-muted-foreground`, now with `mt-1` under the heading instead of being the first line.
- **Sheet items:** `text-sm font-medium`, rows `min-h-12` (48px), `rounded-md px-3`, icon `size-5` at the rail's stroke. Sheet header carries the plain wordmark, not a new mark.
- **Appearance tiles:** `rounded-lg border p-3 min-h-16`, icon `size-5` above the label, label `text-sm`.
- **Elevation:** the sheet uses shadcn `Sheet`'s overlay (scrim) and edge shadow — it is an overlay, so the shadow is allowed. Nothing else in this feature adds a shadow.

#### Appearance

Light, Dark, System (default). This pitch adds the control (Settings → Appearance only). Every element in this design uses tokens; the sheet, header, and tiles invert with the theme. Switching appearance is **instant** — no cross-fade, no animated color transitions mid-switch.

---

## 5. Information architecture

The shell from Foundation stays; only its phone presentation changes.

```text
Phone (below md, 768px)                      Desktop (md and up) — UNCHANGED
┌──────────────────────────────┐             ┌──────────┬──────────────────────────┐
│ [≡] Overload            [⋮]  │ sticky      │ Today    │ Overload            [⋮]  │
├──────────────────────────────┤             │ Plan     ├──────────────────────────┤
│ Good morning, Sam.           │             │ History  │ Good morning, Sam.       │
│ Push Day 1 is up.            │             │ Goals    │ Push Day 1 is up.        │
│ Today · Mon, Oct 19          │             │ Exercises│ Today · Mon, Oct 19      │
│ ┌──────────────────────────┐ │             │ Gyms     │ ┌──────────────────────┐ │
│ │ today's session          │ │             │          │ │ today's session      │ │
│ └──────────────────────────┘ │             │          │ └──────────────────────┘ │
│                              │             │          │ [ Start workout ]        │
├──────────────────────────────┤             └──────────┴──────────────────────────┘
│ [ Start workout ]            │ thumb bar (where the screen has one)
└──────────────────────────────┘
  no bottom navigation bar

[≡] opens the navigation sheet:
  Today · Plan · History · Goals · Exercises · Gyms   (same list, same order as the rail)
  ─────────
  Settings                                           (also in [⋮], as today)

[⋮] account menu (unchanged, both sizes): Settings · Sign out

Settings  ── Profile (name, email, timezone) → Appearance (Light · Dark · System) → Delete account
```

- The greeting lives only on **Today** (`/`).
- The destination list is the existing `NAV_ITEMS`, unchanged in content and order. Settings is added to the phone sheet as a secondary item because Journey E lists it among the destinations reachable from the sheet; it is not a new destination (it is already in the account menu) and it is **not** added to the desktop rail.
- Appearance is a section of the existing Settings screen — no new page.

---

## Screen 1: Today — greeting line

### Purpose
Name the lifter and say, in one factual clause, what today holds, before the existing dashboard content.

### URL pattern
`/`

### Trigger
Every render of Today: after sign-in, on return to an open auth session, after completing a workout (Today re-reads its state), on navigation back to Today.

### Layout

```text
┌────────────────────────────────────┐
│ [≡] Overload                  [⋮]  │
├────────────────────────────────────┤
│ Good morning, Sam. Push Day 1      │  h1 — wraps, never truncates
│ is up.                             │
│ Today · Mon, Oct 19                │  muted, existing line
│                                    │
│ ┌────────────────────────────────┐ │
│ │ (existing dashboard block —    │ │
│ │  unchanged)                    │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│ [        Start workout          ]  │  existing button (in-flow today)
└────────────────────────────────────┘
```

The greeting sits above **every** dashboard state, including the missed-day prompt. Nothing else on Today moves except that the date line drops below the heading.

### Greeting structure

`{salutation}{, FirstName}. {clause}` — or, for the late-night and first-visit families, the family's own sentence. Always one or two short sentences, period-terminated. The clause is omitted when the situation has nothing true to add (first visit with no plan).

**Salutation by local time** (account's stored timezone):

| Local time | Salutation |
| ---------- | ---------- |
| 4:00 am – 11:59 am | Good morning |
| 12:00 pm – 4:59 pm | Good afternoon |
| 5:00 pm – 11:59 pm | Good evening |
| 12:00 am – 3:59 am | Hello |
| timezone unavailable | Hello |

**Situations** (from the dashboard's existing state — this design reads them, it never changes them):

| Situation | When | Notes |
| --------- | ---- | ----- |
| **Planned** | a lifting session is scheduled today and nothing is logged yet | uses the session name |
| **Underway** | today's session has logged sets but isn't complete | never says "done", never says "up" as if untouched |
| **Late night** | Planned or Underway, and local time is 9:00 pm – 3:59 am | replaces the salutation + clause with a late-night sentence |
| **Cardio planned** | no lifting today, cardio scheduled and not all logged | uses the cardio type (first unlogged entry) |
| **Done** | today's lifting session is complete; or, on a cardio-only day, every cardio entry is logged | never hands off to tomorrow |
| **Rest** | the active plan has nothing (lifting or cardio) today | never implies a missed workout |
| **No plan** | no active mesocycle | never implies a schedule |
| **First visit** | the account's first local calendar day, with no logged workouts yet | a welcome; combined with the day's clause when a plan already exists (e.g. a plan seeded before the friend's first sign-in) |

A missed earlier day does **not** change the greeting: the greeting describes today (using today's state beneath the prompt), and the missed-day prompt below it handles the past without guilt.

### Wording library

`{N}` is the first name; `{S}` the session name; `{C}` the cardio type. Each row lists the variants the deterministic pick chooses between (same choice all day for the same situation).

| Situation | Variants |
| --------- | -------- |
| Planned | `{Sal}, {N}. {S} is up.` · `{Sal}, {N}. {S} today.` · `{Sal}, {N}. Today is {S}.` |
| Underway | `{Sal}, {N}. {S} is underway.` · `{Sal}, {N}. {S} is in progress.` · `{Sal}, {N}. {S} is still open.` |
| Late night | `Late session, {N}. {S} is still up.` · `Working late, {N}. {S} is still open.` · `Late one tonight, {N}. {S} is still up.` |
| Cardio planned | `{Sal}, {N}. {C} is up.` · `{Sal}, {N}. {C} today.` · `{Sal}, {N}. {C} is on today's plan.` |
| Done (lifting) | `{Sal}, {N}. {S} is done.` · `{Sal}, {N}. {S} is logged.` · `{Sal}, {N}. Today's training is logged.` |
| Done (cardio-only) | `{Sal}, {N}. {C} is logged.` · `{Sal}, {N}. Today's training is logged.` · `{Sal}, {N}. {C} is done.` |
| Rest | `{Sal}, {N}. Rest day today.` · `{Sal}, {N}. Nothing planned today.` · `{Sal}, {N}. Today is a rest day.` |
| No plan | `{Sal}, {N}. No active plan yet.` · `{Sal}, {N}. Nothing scheduled yet.` · `{Sal}, {N}. No plan is running right now.` |
| First visit | `Welcome to Overload, {N}.` · `Welcome, {N}.` — followed by the day's clause from the row that applies (Planned / Underway / Late-night clause / Cardio / Done / Rest); no clause with no plan |

Late-night clauses after "Welcome…": `{S} is still up.` (Planned), `{S} is still open.` (Underway).

**Rules every variant obeys:** no `!`, no `?`, no emoji, no "let's", "crush", "you got this", "don't forget", "time to", "you should"; nothing about weights, tags, progress, or deloads (the engine owns those); no reference to other days.

**Missing pieces:**

| Missing | Result |
| ------- | ------ |
| First name (the original account has none until set in Settings) | the name and its comma are dropped: `Good morning. Push Day 1 is up.` · `Late session. Push Day 1 is still up.` · `Welcome to Overload.` |
| Timezone unavailable or invalid | salutation is `Hello`; the late-night family never applies (no trustworthy clock); the clause still follows the dashboard state |
| Session name unusually long | wraps (`text-balance`); never truncated |

### Element table

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Greeting** | `h1.text-xl.font-semibold.tracking-tight.text-balance` | plain text, server-rendered; the page's only heading; no link, no icon, no tooltip |
| **Date line** | existing `p.text-sm.text-muted-foreground` → now `mt-1` under the heading | unchanged copy `Today · Mon, Oct 19` |

### Code reference

```tsx
<section className="space-y-6">
  <header>
    <h1 className="text-xl font-semibold tracking-tight text-balance">
      {greeting}
    </h1>
    <p className="mt-1 text-sm text-muted-foreground">Today · {today}</p>
  </header>
  {/* existing dashboard state, unchanged */}
</section>
```

### Fields
None. The greeting is read-only.

### Validation
Not applicable.

### Empty state
There is no empty greeting. Every account state maps to a line: No plan and First visit are the "empty account" lines and are legitimate answers, not fallbacks.

```text
First visit, no plan                 Returning, no plan
┌────────────────────────────────┐   ┌────────────────────────────────┐
│ Welcome to Overload, Sam.      │   │ Good evening, Sam. Nothing     │
│ Today · Mon, Oct 19            │   │ scheduled yet.                 │
│ ┌────────────────────────────┐ │   │ Today · Mon, Oct 19            │
│ │ No active plan.            │ │   │ ┌────────────────────────────┐ │
│ │ Build and activate a       │ │   │ │ No active plan. …          │ │
│ │ mesocycle… Plan →          │ │   │ └────────────────────────────┘ │
│ └────────────────────────────┘ │   └────────────────────────────────┘
└────────────────────────────────┘
```

### Loading state
Today's loading skeleton gains a heading-shaped bar first: `Skeleton h-7 w-3/4` (the greeting), then `h-4 w-36` (date line), then the existing block skeletons. The greeting never shows a placeholder sentence.

### Error state
The greeting has no error state of its own: it is derived from data Today already loads. If Today fails to load, the existing `(app)` error screen appears (unchanged). Missing name or timezone degrade to the "Missing pieces" lines, never to an error.

### Behavior
- Server-rendered with the page; there is no client-side greeting logic, so it cannot change between server and browser, and re-renders of the same request state produce the same sentence.
- The sentence changes only when its inputs change: the local date (next day → possibly a different variant), the situation (e.g. the workout is completed → Done), or the time band (e.g. 8:59 pm → 9:00 pm on a pending day → Late night) on the next render of Today.
- Not announced as a live region; it is the page heading and is read as such.

---

## Screen 2: Settings — Appearance section

### Purpose
Let the lifter choose Light, Dark, or System for their account, and see it take effect immediately everywhere.

### URL pattern
`/settings` (section between Profile and Delete account)

### Trigger
Settings via the account menu (both sizes) or the phone navigation sheet.

### Layout

```text
┌────────────────────────────────────┐
│ [≡] Overload                  [⋮]  │
├────────────────────────────────────┤
│ Settings                           │
│ ┌ Profile ───────────────────────┐ │
│ │ First name / Last name / Email │ │
│ │ Timezone                       │ │
│ └────────────────────────────────┘ │
│                                    │
│ Appearance                         │  h2 text-base font-semibold
│ ┌─────────┐┌─────────┐┌─────────┐  │
│ │  ☀      ││  ☾      ││  ▭    ✓ │  │  3 tiles, one row at 375px
│ │  Light  ││  Dark   ││  System │  │
│ └─────────┘└─────────┘└─────────┘  │
│ System follows your device's light │  muted helper
│ or dark setting.                   │
│                                    │
│ ───────────────────────────────────│
│ Delete account                     │
│ Permanently delete your account…   │
│ [ Delete account… ]                │
├────────────────────────────────────┤
│ [            Save              ]   │  existing Profile thumb bar
└────────────────────────────────────┘
```

Appearance sits **outside** the Profile form: it saves on its own, the moment a tile is chosen, and the Profile form's Save button keeps meaning "save name and timezone" only.

### Elements

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Section heading** | `h2.text-base.font-semibold` "Appearance" | labels the radio group (`aria-labelledby`) |
| **Option tiles** | `RadioGroup` (existing `ui/radio-group`, Radix) rendered as three label tiles, `grid grid-cols-3 gap-2`; each tile `rounded-lg border bg-card p-3 min-h-16`, Lucide `Sun` / `Moon` / `Monitor` `size-5`, label `text-sm` | one tap selects; arrow keys move and select (Radix radio semantics); selected tile shows `border-primary ring-1 ring-primary` and a `Check` `size-4 text-primary` top-right |
| **System note** | `text-xs text-muted-foreground` "Follows your device" inside the System tile, under its label — omitted if it would wrap to a third line at 320px (spec checks) | |
| **Helper** | `p.text-sm.text-muted-foreground` "System follows your device's light or dark setting." | always shown |
| **Save error** | `p.text-sm.text-destructive role="alert"` "Couldn't save your appearance. Try again." | only after a failed save |
| **Status for assistive tech** | visually hidden `aria-live="polite"` | announces "Appearance: Dark." after a successful save |

### Code reference

```tsx
<section aria-labelledby="appearance-heading" className="space-y-3">
  <h2 id="appearance-heading" className="text-base font-semibold">Appearance</h2>
  <RadioGroup
    value={value}
    onValueChange={choose}
    aria-labelledby="appearance-heading"
    className="grid grid-cols-3 gap-2"
  >
    {OPTIONS.map(({ value, label, icon: Icon }) => (
      <Label
        key={value}
        className="relative flex min-h-16 cursor-pointer flex-col items-start gap-2 rounded-lg border border-border bg-card p-3
                   has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:ring-1 has-[[data-state=checked]]:ring-primary
                   has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
      >
        <RadioGroupItem value={value} className="sr-only" />
        <Icon aria-hidden className="size-5 text-muted-foreground" />
        <span className="text-sm">{label}</span>
      </Label>
    ))}
  </RadioGroup>
  <p className="text-sm text-muted-foreground">
    System follows your device's light or dark setting.
  </p>
</section>
```

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Appearance | single choice: Light, Dark, System | yes (always one selected) | **System** | exactly these three values; anything else is rejected by the server and the tile reverts |

### Validation
- One option is always selected; there is no "none".
- No Save button: choosing a tile is the commit.

### Empty state
Not applicable — a never-chosen account shows **System** selected (the default), which is also what it looks like.

### Loading state
The Settings skeleton gains one block for the section: `Skeleton h-5 w-28` (heading) + `Skeleton h-16 w-full rounded-lg` (tile row), placed between the Profile and Delete blocks.

### Error state
If the save fails (network, server), the app returns to the previous appearance, the previous tile is selected again, and the inline error line appears under the tiles. Choosing a tile again retries. A failed save never leaves the screen looking one way while the account stores another.

### Behavior
- **Instant apply:** the whole app (this page, the header, menus, toasts, charts) switches the moment a tile is chosen, before the save completes. No fade.
- **Persist:** the choice is saved to the account in the background. On success: nothing visual beyond the switch (the switch is the confirmation); the polite live region announces it. No toast.
- **System is live:** with System selected, changing the device's light/dark setting changes Overload while it is open — no reload.
- **Rapid changes:** the last tile chosen is what the account ends up with.
- **Other devices:** the choice follows the account; another device picks it up the next time Overload loads there.
- **Focus:** stays on the chosen tile; nothing navigates.

---

## Screen 3: App shell at phone width — header with menu button

### Purpose
Give every authenticated screen the full width and height of the phone, with navigation one tap away from a fixed spot.

### URL pattern
All authenticated routes, below `md` (768px).

### Trigger
Any authenticated page on a viewport narrower than 768px.

### Layout

```text
Before (today)                         After
┌────────────────────────────────┐     ┌────────────────────────────────┐
│ Overload                  [⋮]  │     │ [≡] Overload              [⋮]  │ sticky
├────────────────────────────────┤     ├────────────────────────────────┤
│                                │     │                                │
│  content (pb-24 reserved)      │     │  content                       │
│                                │     │                                │
├────────────────────────────────┤     │                                │
│ [ Save ]   thumb bar           │     │                                │
├────────────────────────────────┤     ├────────────────────────────────┤
│ ⌂    ▦    ↺    ◎    ⚲    ▣     │     │ [ Save ]   thumb bar           │ at the bottom edge
│Today Plan Hist Goals Ex. Gyms  │     └────────────────────────────────┘
└────────────────────────────────┘
```

### Elements

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Header** | existing `header`, now `sticky top-0 z-20 h-14 bg-background/95 backdrop-blur border-b border-border` below `md`; at `md`+ exactly as today (static, `px-4 py-3`) | stays at the top while content scrolls, so navigation is reachable mid-workout without scrolling up |
| **Menu button** | `Button variant="ghost" size="icon" className="size-11 md:hidden"`, Lucide `Menu` `size-5`, `aria-label="Open navigation"`, `aria-haspopup="dialog"`, `aria-expanded` | leftmost in the header; opens the navigation sheet |
| **Wordmark** | existing `OverloadLockup size="sm"` | unchanged, to the right of the menu button |
| **Account menu** | existing `AccountMenu` | unchanged at both sizes |
| **Bottom bar** | removed below `md` | — |
| **Thumb-reach action bars** | existing fixed bars (Save, New goal, Add gym, …) | move from above the bottom bar to the bottom edge of the screen; still `h-11` buttons, still full-width, still within thumb reach |
| **Content padding** | the bottom padding reserved for the bottom bar is removed; screens with a fixed action bar keep only the padding that clears that bar | content regains the bar's height |

### Code reference

```tsx
<header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-border bg-background/95 px-2 backdrop-blur
                   md:static md:h-auto md:justify-between md:bg-transparent md:px-4 md:py-3 md:backdrop-blur-none">
  <MobileNav /> {/* md:hidden menu button + Sheet */}
  <OverloadLockup size="sm" />
  <div className="ml-auto md:ml-0"><AccountMenu /></div>
</header>
```

### Empty / loading / error states
The shell itself has none. During route loading the header and menu button are already present (they belong to the layout), so navigation is available while a page skeleton shows.

### Behavior
- The workout logging screens keep the header (and so the menu button). The logging card, its fields, and its own controls are unchanged; the menu button is the only navigation control on the page, so it never competes with set entry.
- The toast position keeps clearing the thumb-reach bar.

---

## Screen 4: Navigation sheet (phone)

### Purpose
Show every existing destination in one list, take the lifter to the chosen one, and disappear.

### URL pattern
`dialog` over the current route (no URL change on open).

### Trigger
Tapping the menu button.

### Layout

```text
┌─────────────────────────┬──────────┐
│ Overload            [×] │░░░░░░░░░░│  scrim over the page
├─────────────────────────┤░░░░░░░░░░│
│ ⌂  Today                │░░░░░░░░░░│  ← active: primary text + tint
│ ▦  Plan                 │░░░░░░░░░░│
│ ↺  History              │░░░░░░░░░░│
│ ◎  Goals                │░░░░░░░░░░│
│ ⚲  Exercises            │░░░░░░░░░░│
│ ▣  Gyms                 │░░░░░░░░░░│
│ ─────────────────────── │░░░░░░░░░░│
│ ⚙  Settings             │░░░░░░░░░░│
│                         │░░░░░░░░░░│
└─────────────────────────┴──────────┘
  w-72 (288px), max 85vw, from the left
```

### Elements

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Sheet** | shadcn `Sheet` (Radix Dialog), `side="left"`, `w-72 max-w-[85vw] p-0` | modal: scrim, focus trapped, page behind inert while open |
| **Title** | `SheetTitle` with the plain wordmark "Overload" (`text-base font-semibold`), `SheetDescription` visually hidden: "Go to a screen" | names the dialog for screen readers |
| **Close** | shadcn `Sheet`'s close button, `size-11` hit area, `aria-label="Close navigation"` | closes, focus returns to the menu button |
| **Primary list** | `nav aria-label="Primary"` → `ul` of the six existing destinations, same icons, labels, and order as the rail | each row `min-h-12 rounded-md px-3 gap-3`; active row `text-primary font-semibold bg-primary/10` + `aria-current="page"` (same active rule as the rail: Today only on `/`, others on their path and sub-paths) |
| **Divider** | `border-t border-border my-2 mx-3` | separates destinations from Settings |
| **Settings** | same row style, Lucide `Settings` | active on `/settings` and sub-paths |

### Code reference

```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetTrigger asChild>
    <Button variant="ghost" size="icon" className="size-11 md:hidden" aria-label="Open navigation">
      <Menu className="size-5" />
    </Button>
  </SheetTrigger>
  <SheetContent side="left" className="w-72 max-w-[85vw] p-0">
    <SheetHeader className="border-b border-border px-4 py-3">
      <SheetTitle className="text-base font-semibold">Overload</SheetTitle>
      <SheetDescription className="sr-only">Go to a screen</SheetDescription>
    </SheetHeader>
    <nav aria-label="Primary" className="p-2">
      <ul className="space-y-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <Link href={item.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
                  className="flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-medium …">
              <item.icon aria-hidden className="size-5" />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  </SheetContent>
</Sheet>
```

### Empty / loading / error states
None: the list is static. If a destination's page is slow, the sheet has already closed and that page's own skeleton shows.

### Behavior
- **Selecting a destination** closes the sheet immediately and navigates. Selecting the current screen just closes the sheet.
- **Other ways to close:** the × button, tapping the scrim, Escape, and any route change (e.g. browser back while open). The sheet never stays open after a navigation.
- **Focus:** on open, focus moves into the sheet (the current screen's item); on close without navigating, focus returns to the menu button.
- **Scroll:** the page behind does not scroll while the sheet is open; scroll position is unchanged on close.
- **Resize:** if the viewport grows to `md`+ while the sheet is open, the sheet closes and the rail is shown.
- **Never traps:** at most one tap (× or scrim) gets back to the screen underneath, including mid-workout; entered set values on a logging card are untouched by opening or closing the sheet.

---

## Screen 5: App shell at desktop width (unchanged, for reference)

### Purpose
Confirm the md+ experience is exactly today's.

### URL pattern
All authenticated routes, `md` (768px) and up.

### Layout

```text
┌──────────────┬───────────────────────────────────────────┐
│ ⌂ Today      │ Overload                             [⋮]  │
│ ▦ Plan       ├───────────────────────────────────────────┤
│ ↺ History    │      Good afternoon, Sam. Push Day 1 is up.│
│ ◎ Goals      │      Today · Mon, Oct 19                  │
│ ⚲ Exercises  │      ┌───────────────────────────────┐    │
│ ▣ Gyms       │      │ today's session               │    │
│              │      └───────────────────────────────┘    │
└──────────────┴───────────────────────────────────────────┘
```

### Behavior
- Left rail `w-56`, same six items, same active style, sticky full height — unchanged.
- No menu button, no sheet, header unchanged (not sticky, same padding).
- The only visible differences at desktop come from the other two features: the greeting heading on Today and the Appearance section in Settings.

---

## 7. Navigation flows

```text
Open app (signed in)
  └─► Today ── greeting: situation from today's state, salutation from local time
        ├─ missed earlier day → greeting unchanged (today's situation) + missed-day prompt below
        ├─ Start / Resume workout → logging (header + [≡] stay) → complete → Today → greeting: Done
        └─ No plan → greeting: No plan / First visit → "Plan →" (existing link)

Phone navigation
  [≡] ─► Sheet (dialog)
        ├─ tap destination → sheet closes → route changes
        ├─ tap current destination → sheet closes
        └─ × / scrim / Esc / route change → sheet closes → focus to [≡]

Appearance
  [⋮] or [≡] ─► Settings ─► Appearance tile
        └─ app switches now → saved to account → (failure) revert + inline error
  Next load on any device → the account's appearance from the first paint
  (a device that has never shown Overload before may show System for its very first paint)
```

- No query params, no new routes, no deep links. The sheet's open state is not in the URL.

---

## 8. Interaction specifications

#### Keyboard navigation

| Context | Key | Action |
| ------- | --- | ------ |
| Menu button | Enter / Space | Open the sheet; focus moves to the current screen's item |
| Sheet | Tab / Shift+Tab | Move through items and the close button; focus stays inside |
| Sheet | Escape | Close; focus returns to the menu button |
| Sheet item | Enter | Navigate and close |
| Appearance group | Tab | Focus the selected tile |
| Appearance group | Arrow keys | Move to and select the next/previous option (applies and saves) |

No new shortcuts.

#### Loading states

| Surface | Loading |
| ------- | ------- |
| Today | greeting bar `h-7 w-3/4`, date bar `h-4 w-36`, then the existing skeletons |
| Settings | adds the Appearance heading + tile-row skeleton |
| Shell | header and menu button render with the layout; never a skeleton |

#### Error states

| Situation | Treatment |
| --------- | --------- |
| Appearance save fails | revert screen + tile, inline `text-destructive` line, retry by choosing again |
| Missing first name | name dropped from the greeting, no error |
| Missing / invalid timezone | `Hello` salutation, no late-night family, no error |

#### Notifications

| Action | Message | Severity | Duration |
| ------ | ------- | -------- | -------- |
| Appearance saved | none (the switch is the confirmation; polite live region "Appearance: Dark.") | — | — |
| Appearance save failed | inline only (not a toast — the error belongs next to the control) | error | until next choice |

#### Destructive actions
None in this feature. Changing appearance is instantly reversible.

---

## 9. Responsive behavior

| Breakpoint | Width | Behavior |
| ---------- | ----- | -------- |
| base | below 640px | Sticky header with `[≡]`, wordmark, `[⋮]`. No bottom navigation bar. Fixed thumb-reach action bars sit at the bottom edge. Greeting wraps to as many lines as it needs. Appearance tiles: one row of three. |
| `sm` | 640–767px | Same as base (the sheet and sticky header apply until `md`). |
| `md` | 768px and up | **Unchanged from today:** left rail, static header without `[≡]`, action bars inline. Greeting usually on one line. |
| `lg` | 1024px and up | Unchanged: centered `max-w-screen-sm` column. |

Every destination remains reachable at every width: through the sheet below `md`, through the rail at `md`+. Settings and Sign out remain in the account menu at every width.

Representative phone widths the design is checked at: 320, 375, 390, 430px. At 320px the appearance tiles stay one row (each ≥ 90px) and the System tile's note may be dropped (see Screen 2).

---

## 10. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `TodayGreeting` (heading) | Today | new | server-rendered text only; variants by situation family |
| `AppearanceSetting` | Settings | new | `RadioGroup` tiles; instant apply + background save + revert on failure |
| `MobileNav` | shell header | new | menu button + `Sheet`; reuses the rail's destination list and active rule |
| `Sheet` | `components/ui` | new to the repo (shadcn/ui primitive over the Radix Dialog already installed) | standard shadcn sheet |
| `AppNav` | shell | reused | desktop rail only now (`hidden md:flex`); same items, same styles |
| `AccountMenu` | shell header | reused, unchanged | |
| Thumb-reach action bars (`StickyActions` and page-level fixed bars) | many screens | reused | bottom offset changes from "above the nav bar" to "bottom edge" below `md` |
| `Toaster` | shell | reused | follows the chosen appearance (not just the device) |

---

## 11. Accessibility, privacy, and data sensitivity

Accessibility:

- The greeting is the page's `h1`; Today previously had no heading.
- Menu button: `aria-label="Open navigation"`, `aria-expanded`, 44px target. Sheet: titled dialog, focus trapped, Escape closes, focus returns to the trigger. Active destination carries `aria-current="page"` and is not indicated by color alone (weight + tint).
- Appearance: a labelled radio group; tiles have visible text labels (icons are decorative); selection is shown by border, ring, and a check, not color alone; arrow-key operable; the result is announced politely.
- Both appearances keep the existing token contrast; no new color pairs are introduced.
- Reduced motion: the sheet's slide uses shadcn's default transition, which respects `prefers-reduced-motion` via `tw-animate-css`; the appearance switch has no animation at all.

Privacy:

- The greeting shows only the signed-in account's own first name, from its own profile. It never shows another account's name or anything about another account.
- The appearance choice belongs to the account and is shown only to that account. Signed-out screens (Login, Signup) have no account; they follow the appearance last used on this device, or System on a device that has never been signed in. They never display a name.
- No gym address, no email, and no training detail beyond today's session or cardio name appears in the greeting.

---

## 12. Out of scope

From this pitch:

- Any assistant behavior: chat input, persona, AI-generated text, conversational replies, coaching or motivational copy, emoji.
- Greeting customization (user-written text, personalities, message libraries) and notifications of any kind (reminders, late-night nudges, push, email).
- Appearance beyond Light / Dark / System: accent pickers, custom themes, font settings, per-screen settings — and any theme toggle outside Settings (header, dashboard, logging card).
- Desktop navigation changes of any kind; new, renamed, removed, or reordered destinations.
- Dashboard redesign, new dashboard sections, or changes to which block leads on Today.
- Logging UX (Faster Logging UX owns it): no changes to exercise cards, set entry, prefill.
- Onboarding Tour (no tour, step registry, highlights, or first-login tour state) and What's New (no release notes or modal). The menu button and sheet are left as stable, named controls for the tour to point at later.
- Authentication, signup, password recovery, and email delivery.

Deferred elsewhere in the roadmap (design nothing, preclude nothing): reps-in-reserve, exercise history and PR views, the Apple platform work (the iOS shell will inherit this phone layout), HealthKit, nutrition.

Permanent non-goals: program generation, social features, progression analysis of cardio, nutrition and body composition in this build.

---

## Open questions

None blocking. Mechanics left to the spec by design (not product questions): how the account's appearance reaches the first paint without a flash on a returning device; how "first visit" is recognized from existing data without new tracking state; and exactly which pages' bottom padding changes when the bar is removed.
