# What's New — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 12: What's New (`pitches/12-whats-new.md`)
**Focus:** A once-only announcement of significant updates the lifter hasn't seen, consolidated into one modal, and a permanent What's New history reached from Settings, on phone and desktop.

> Written by the autonomous pipeline run (2026-10-20). The skill's clarification interview does not apply in an unattended run (CLAUDE.md, Autonomous Pipeline Policy). Questions it would have asked are decided below and marked **Decision**. The spec records each one as a Resolved Decision.
>
> Like the Onboarding Tour, this pitch is an exception to the design-doc skill's "rule out explainer chrome". Overload now has lifters who didn't build it (pitch §1). What's New is not teaching, though. It's a short, factual changelog that interrupts at most once per significant update.

---

## 2. Vision

A friend opening Overload after a week away asks: "did anything change that I should know about?" If something important shipped, one calm dialog answers it, once. Afterwards, Settings → What's New keeps every update in one readable list, newest first, for whenever they want to look back.

**Design north star:** *say what changed, once, then keep it on the shelf.*

---

## 3. Design principles

### 1. Once, then never again

A significant update is shown automatically the first time the account loads Overload after it ships, and never again on that account: not on refresh, navigation, a new sign-in, or another device. Once the dialog has been shown, the update is seen. Closing it is only closing it (pitch §4.4, §9.1, AC-1).

### 2. One interruption, however long they were away

Two, three, or ten unseen significant updates arrive together in one dialog, newest first, in one scroll. There is never a second dialog after the first one closes (pitch §4.5, §9.2, AC-4).

### 3. Significant is rare

Only entries flagged significant can open the dialog. Everything else is on the What's New page and nowhere else. The dialog is never used to fill silence, and a quiet release interrupts no one (pitch §4.3, §9.3, Journey E).

### 4. Start where the product is today

A new account begins with every existing update already seen, so the first visit belongs to the onboarding tour, not to a backlog. The history is still on the page (pitch §4.7, §9.4, AC-3).

### 5. An entry reads the same everywhere

An entry is a date, a title, and one to three plain sentences. It carries nothing about the reader: no "unread" dot, no "new" badge, no account name. The same block renders in the dialog, on the page, and later on a public changelog without changes (run prompt: reusable source; pitch §9.9).

---

## 4. Visual language

All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

#### Color palette

| Token / theme path | Usage | Notes |
| ------------------ | ----- | ----- |
| `background` / `foreground` | Dialog surface and entry titles | The app's dialogs use `bg-background` (stock `DialogContent`) |
| `border` | Dialog hairline, separators between entries, the page's entry dividers | Same as every list in the app |
| `muted-foreground` | Entry date, entry body, the dialog's subtitle, the page's intro line | Secondary text, never low contrast |
| `primary` / `primary-foreground` | The dialog's **Got it** button | The one filled button on screen |
| `ring` | Focus rings | Stock |
| scrim `black/50` | Dialog overlay | Stock `DialogOverlay`, the same as every dialog in the app |

No progress or deload color, no accent dot, and no badge appear anywhere in this feature.

#### State colors (display only)

What's New shows no status. Significant and ordinary entries look the same on the page (**Decision:** significance is about whether an entry interrupts, not about how it reads afterwards, and a "Major" badge would add the promotional voice pitch §9.10 rules out). Seen and unseen look the same too: the page never shows read state (principle 5).

#### Typography, spacing, radius, elevation

| Element | Style |
| ------- | ----- |
| Dialog title | `DialogTitle` — `text-lg font-semibold`, "What's new" |
| Dialog subtitle | `DialogDescription` — `text-sm text-muted-foreground`: "Since you were last here" for one update, "{n} updates since you were last here" for more than one |
| Entry date | `text-xs font-medium text-muted-foreground tabular-nums`, e.g. "Nov 3, 2026" |
| Entry title | `text-base font-semibold` (page: an `h2`; dialog: an `h3`) |
| Entry body | `text-sm leading-relaxed text-muted-foreground`, one to three sentences |
| Between entries | `border-t border-border`, `pt-4` / `gap-4` (dialog), `py-5` (page) |
| Dialog | stock `DialogContent` (`rounded-lg border p-6 shadow-lg`, `max-w-[calc(100%-2rem)]`, `sm:max-w-lg`), capped at `max-h-[85dvh]` with a scrolling body |
| Page | inside the shell's `max-w-screen-sm` column, like Settings |

#### Appearance

Everything comes from tokens, so light and dark (and System) follow the account's appearance preference with no extra work. In dark mode the dialog surface is the page background with a hairline border over the scrim, the same as the app's other dialogs. Motion is the stock dialog fade and zoom (200 ms). Under `prefers-reduced-motion` it's instant.

---

## 5. Information architecture

```text
┌──────────────────────────────────────────────────────────────┐
│  Overload                                     [⋮ account]    │
├──────────────────────────────────────────────────────────────┤
│  Any signed-in page, on load:                                │
│    significant updates not yet seen?  ──► What's new dialog  │
│                                            (once)            │
│  Today · Plan · History · Goals · Exercises · Gyms           │
│  Settings                                                    │
│    ├ Profile · Appearance · Tour                             │
│    ├ What's New  [See what's new] ──► /settings/whats-new    │  ← new section
│    └ Delete account                                          │
│                                                              │
│  /settings/whats-new ── every entry, newest first            │  ← new page
└──────────────────────────────────────────────────────────────┘
  md+: left rail (unchanged) · phone: header menu → sheet (unchanged)
```

- The dialog is an overlay over the authenticated shell. It has no route of its own.
- The page lives under Settings (**Decision:** `/settings/whats-new`, like `/settings/delete-account`). Settings stays the active area in the rail and the sheet, and no navigation item is added, because pitch §4.10 places the entry point in Settings and says not to redesign it.
- The name is **What's New** on the page and in Settings, matching the PRD feature. The dialog title is the sentence-case "What's new", since it reads as a heading over content rather than a product name.

---

## Screen 1: The What's New dialog — one significant update

### Purpose
Tell a returning lifter, once, about the one important thing that changed since they were last here.

### URL pattern
None. It opens over whatever signed-in page loaded (`/`, `/plan`, `/log/…`, …).

### Trigger
A full load of any signed-in page, when the account has at least one significant entry it hasn't seen. Client navigation between pages doesn't re-check it. The next full load does, and finds nothing, because the dialog already counted as seen.

### Layout — phone (below md)

```text
┌──────────────────────────────────┐
│░░░░░░░░░░ page, dimmed ░░░░░░░░░░│
│ ┌──────────────────────────────┐ │
│ │ What's new               [✕] │ │
│ │ Since you were last here     │ │
│ │                              │ │
│ │ Nov 3, 2026                  │ │
│ │ Logging is faster            │ │
│ │ Your last weight is filled   │ │
│ │ in, and you can repeat it    │ │
│ │ across sets with one tap.    │ │
│ │                              │ │
│ │ [         Got it           ] │ │  ← primary, full width, 44px
│ │       See all updates        │ │  ← link, 44px tall hit area
│ └──────────────────────────────┘ │
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
└──────────────────────────────────┘
```

### Layout — desktop (md+)

```text
┌──────────────────────────────────────────────────────────┐
│ rail │░░░░░░░░░░░░░░░░ page, dimmed ░░░░░░░░░░░░░░░░░░░░░│
│      │░░░░ ┌────────────────────────────────────────┐ ░░░│
│      │░░░░ │ What's new                         [✕] │ ░░░│
│      │░░░░ │ Since you were last here               │ ░░░│
│      │░░░░ │                                        │ ░░░│
│      │░░░░ │ Nov 3, 2026                            │ ░░░│
│      │░░░░ │ Logging is faster                      │ ░░░│
│      │░░░░ │ Your last weight is filled in, and you │ ░░░│
│      │░░░░ │ can repeat it across sets with one tap.│ ░░░│
│      │░░░░ │                                        │ ░░░│
│      │░░░░ │            See all updates   [Got it]  │ ░░░│
│      │░░░░ └────────────────────────────────────────┘ ░░░│
└──────────────────────────────────────────────────────────┘
```

(The entry shown is illustrative. No entry ships with this pitch; see §13.)

### Elements

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Dialog** | `Dialog` + stock `DialogContent` (centered, `sm:max-w-lg`), `max-h-[85dvh] grid-rows-[auto_1fr_auto]` | Modal: focus is trapped in it and the page behind can't be used. Opens by itself |
| **Title** | `DialogTitle` "What's new", left-aligned (`DialogHeader className="text-left"`, as in the app's other dialogs) | Names the dialog for screen readers |
| **Subtitle** | `DialogDescription`, "Since you were last here" | One line. No date range and no account name |
| **Entry** | `ReleaseNote` block: date (`<time>`), title (`h3`), body (`p`) | Read-only. No links, buttons, or images inside an entry |
| **Got it** | `Button` (default variant), `w-full sm:w-auto`, `h-11 sm:h-9` | Closes the dialog. Gets initial focus |
| **See all updates** | `Button variant="link"` wrapping a `Link` to `/settings/whats-new`, `h-11 sm:h-9` | Closes the dialog and opens the page |
| **Close** | stock `DialogContent` close button (✕, "Close") | Same as Got it |

**Decision:** the dialog is the app's standard centered `Dialog` at every width, not a bottom sheet. Every other dialog in Overload is centered, and a centered card with a full-width button is already one-thumb reachable at phone height. A different shape for one announcement would make it read as an ad.

**Decision:** two exits plus the ✕. **Got it** is the obvious dismissal (pitch §4.4). **See all updates** is the only other action. It's navigation to the history the lifter already owns, not a promotion. There's no "Don't show again" (the dialog already never repeats), no "Remind me later" (that would be a reminder cadence, pitch §7), and no call to action inside an entry (pitch §9.10).

### Code reference

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="max-h-[85dvh] grid-rows-[auto_1fr_auto]">
    <DialogHeader className="text-left">
      <DialogTitle>What&apos;s new</DialogTitle>
      <DialogDescription>
        {entries.length === 1
          ? "Since you were last here"
          : `${entries.length} updates since you were last here`}
      </DialogDescription>
    </DialogHeader>
    <div className="-mx-6 overflow-y-auto px-6">
      <ol className="divide-y divide-border">
        {entries.map((entry) => (
          <li key={entry.id} className="py-4 first:pt-0 last:pb-0">
            <ReleaseNote entry={entry} headingLevel={3} />
          </li>
        ))}
      </ol>
    </div>
    <DialogFooter className="items-center">
      <Button asChild variant="link" className="h-11 sm:h-9">
        <Link href="/settings/whats-new">See all updates</Link>
      </Button>
      <Button className="h-11 w-full sm:h-9 sm:w-auto" autoFocus>
        Got it
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Fields / validation
None. The dialog only displays.

### Empty state
None. The dialog only exists when there's at least one significant unseen entry. With none, nothing renders, and there's no "You're all caught up" message.

### Loading state
None to show. The entries come with the page from the server, so the dialog opens complete, never with a skeleton or a spinner. It appears just after the page itself is interactive, and the page underneath keeps its own loading behavior.

### Error state
- **Recording "seen" fails** (offline, a server error): nothing is shown. The lifter has read it, and a toast about bookkeeping would be noise. The worst case is that the dialog appears once more on the next load (**Decision**; see Behavior).
- No entry can fail to render: entries are plain text written in the repository and checked before they ship.

### Behavior
- **Counts as seen when it opens.** The moment the dialog is shown, the account is recorded as having seen everything up to the newest entry that existed when the page loaded (**Decision**, following the architecture's "the latest release-notes entry shown"). Closing it in any way, including Got it, ✕, Escape, clicking the scrim, See all updates, a reload, closing the tab, or signing out, changes nothing more. That's what makes "once" hold even if the lifter never taps a button.
- If recording on open fails, closing it tries once more. If that fails too, the dialog may appear once more on the next full load. It never appears more than that because of a failure the lifter can't see.
- **One check per page load.** Moving around the app with the navigation doesn't reopen it. A newer significant entry that ships while the tab is open waits for the next full load.
- **The tour goes first.** If the onboarding tour opens by itself on this load, the dialog doesn't open. It waits for the next load, so the two never stack. A new account normally has nothing unseen anyway (principle 4).
- **Close returns focus** to where it was on the page (Radix default). After **See all updates**, focus goes to the top of the What's New page.
- The dialog never changes anything about training: plans, logged sets, goals, and gyms are untouched (pitch §7).

---

## Screen 2: The What's New dialog — several significant updates

### Purpose
Bring a lifter who missed several updates up to date in one sitting, not one dialog per update (AC-4).

### URL pattern / trigger
As Screen 1, when two or more significant entries are unseen.

### Layout — phone (below md), three unseen updates

```text
┌──────────────────────────────────┐
│ ┌──────────────────────────────┐ │
│ │ What's new               [✕] │ │  ← header stays put
│ │ 3 updates since you were     │ │
│ │ last here                    │ │
│ ├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤ │
│ │ Dec 1, 2026                  │ │  ← newest first
│ │ Exercise history             │ │
│ │ Every lift now has its own…  │ │
│ │ ──────────────────────────── │ │
│ │ Nov 17, 2026                 │ │
│ │ Clearer recommendations      │ │  ↕ only this list scrolls
│ │ Each lift now says why…      │ │
│ │ ──────────────────────────── │ │
│ │ Nov 3, 2026                  │ │
│ │ Logging is faster            │ │
│ │ Your last weight is filled…  │ │
│ ├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤ │
│ │ [         Got it           ] │ │  ← footer stays put
│ │       See all updates        │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

### Layout — desktop (md+)
The same dialog at `sm:max-w-lg`. The footer is one row with **See all updates** to the left of **Got it**, as in Screen 1. With three short entries it usually doesn't need to scroll.

### Elements
As Screen 1, with:

| Element | Styling | Behavior |
| ------- | ------- | -------- |
| **Subtitle** | "{n} updates since you were last here", `tabular-nums` | The count is all significant entries shown |
| **Entry list** | `ol` with `divide-y divide-border`, in a body that scrolls (`overflow-y-auto`) | Newest first. The header and footer never scroll away, so **Got it** is always on screen (pitch §4.11) |

**Decision:** every unseen significant entry is listed, with no cap and no "and 4 more". A cap would hide updates behind a second step. The list scrolls inside a dialog capped at 85% of the screen height, so even ten entries stay readable and dismissible on a phone.

**Decision:** ordinary (non-significant) entries are never in the dialog, even when they're unseen and shipped between two significant ones. They're on the page.

### Behavior
As Screen 1. Every listed entry, and every older one, counts as seen when the dialog opens. One **Got it** closes the whole thing, and no second dialog follows.

---

## Screen 3: Settings — What's New section (entry point)

### Purpose
The permanent, findable way into the release history (pitch §4.10, Journey C).

### URL pattern
`/settings`

### Trigger
Opening Settings from the account menu (all widths) or the phone navigation sheet.

### Layout

```text
┌────────────────────────────────────┐
│ Settings                           │
│ ┌ Profile ───────────────────────┐ │
│ │ …                              │ │
│ └────────────────────────────────┘ │
│ Appearance                         │
│ [ Light ] [ Dark ] [ System ]      │
│                                    │
│ Tour                               │
│ A short walk through Today, …      │
│ [ ↺ Replay tour ]                  │
│                                    │
│ What's New                         │  ← new section, h2
│ Every update to Overload, newest   │
│ first.                             │
│ [ ▤ See what's new ]               │  ← Button variant="outline" asChild → Link
│                                    │
│ ────────────────────────────────── │
│ Delete account                     │
│ …                                  │
└────────────────────────────────────┘
```

### Elements

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Section heading** | `h2` `text-base font-semibold` "What's New" | Same heading style as Tour and Appearance |
| **Line** | `p` `text-sm text-muted-foreground` | "Every update to Overload, newest first." |
| **See what's new** | `Button variant="outline" asChild` → `Link href="/settings/whats-new"`, Lucide `ScrollText` (`size-4`), `h-11 md:h-9` | Opens the page |

**Decision:** the section sits directly after Tour and before the divider. Both are guidance, both are preference-level, and the destructive action stays set apart below. The button is a link styled like the Tour button, so the two guidance sections read as a pair. The label names the destination ("See what's new") rather than a vague "Open". The icon is `ScrollText` rather than `Sparkles` or `Megaphone`, which would read as promotion. It never shows a count or an unread dot (principle 5).

### Code reference

```tsx
<div className="space-y-2">
  <h2 className="text-base font-semibold">What&apos;s New</h2>
  <p className="text-sm text-muted-foreground">
    Every update to Overload, newest first.
  </p>
  <Button asChild variant="outline" className="h-11 md:h-9">
    <Link href="/settings/whats-new">
      <ScrollText className="size-4" aria-hidden />
      See what&apos;s new
    </Link>
  </Button>
</div>
```

### Fields / validation / empty / loading / error
None. The section is static. It renders with Settings and uses Settings' existing loading skeleton. It's shown even when there are no entries, because the page explains that itself.

### Behavior
- **See what's new** → `/settings/whats-new`. The browser Back button returns to Settings.

---

## Screen 4: The What's New page (release history)

### Purpose
Show every update to Overload, newest first, for anyone who wants to look back (AC-2, Journey C).

### URL pattern
`/settings/whats-new`

### Trigger
**See what's new** in Settings, or **See all updates** in the dialog. Direct URL works too (signed in only).

### Layout — phone (below md)

```text
┌────────────────────────────────────┐
│ ☰  OVERLOAD                    ⋮   │
├────────────────────────────────────┤
│ ‹ Settings                         │
│ What's New                         │  ← h1
│ Every update to Overload, newest   │
│ first.                             │
│ ────────────────────────────────── │
│ Dec 1, 2026                        │
│ Exercise history                   │  ← h2
│ Every lift now has its own page    │
│ with recent sessions, trends, and  │
│ personal bests.                    │
│ ────────────────────────────────── │
│ Nov 21, 2026                       │
│ Smoother charts                    │  ← an ordinary entry looks the same
│ Charts on Goals load faster and    │
│ keep their shape while updating.   │
│ ────────────────────────────────── │
│ Nov 3, 2026                        │
│ Logging is faster                  │
│ …                                  │
└────────────────────────────────────┘
```

### Layout — desktop (md+)
The same single column in the shell's content area (`max-w-screen-sm`), with the rail on the left showing nothing active, as on every Settings page. Entries don't become cards or a grid. A changelog reads top to bottom.

### Elements

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Back link** | `Link` "‹ Settings", `text-sm text-muted-foreground hover:text-foreground`, Lucide `ChevronLeft` | Same as the Delete account page |
| **Heading** | `h1` `text-xl font-semibold` "What's New" | Page title "What's New · Overload" |
| **Intro** | `p` `text-sm text-muted-foreground` | "Every update to Overload, newest first." |
| **Entry list** | `ol` `divide-y divide-border border-t border-border`, each `li` `py-5` | Every entry, significant and ordinary, newest first |
| **Entry** | the same `ReleaseNote` block as the dialog, title as `h2` | Read-only |

### Code reference

```tsx
<section className="space-y-6 pb-20 md:pb-0">
  <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
    <ChevronLeft aria-hidden className="size-4" />
    Settings
  </Link>
  <div className="space-y-2">
    <h1 className="text-xl font-semibold">What&apos;s New</h1>
    <p className="text-sm text-muted-foreground">Every update to Overload, newest first.</p>
  </div>
  <ol className="divide-y divide-border border-t border-border">
    {entries.map((entry) => (
      <li key={entry.id} className="py-5">
        <ReleaseNote entry={entry} headingLevel={2} />
      </li>
    ))}
  </ol>
</section>
```

### Order
Newest first, by the entry's date. Two entries with the same date keep the order they were written in (the more recently added one first). **Decision:** pitch §4.9 asks for "the most recent changes easiest to find", which is newest first. Dates print as "Nov 3, 2026": unambiguous, and the same in every timezone, because an entry's date is a calendar date, not a moment.

### Empty state

```text
│ What's New                         │
│ Every update to Overload, newest   │
│ first.                             │
│ ────────────────────────────────── │
│ No updates yet. When something     │
│ changes in Overload, it's listed   │
│ here.                              │
```

`p` `text-sm text-muted-foreground`, no illustration. This is the page's state when What's New first ships, because no historical entries are written for it (§13).

### Loading state
A route `loading.tsx` like Settings': the back-link line, the heading line, and three entry skeletons (`Skeleton` rows `h-3 w-24` / `h-4 w-48` / `h-4 w-full`). The content is in the app itself, so it's normally instant.

### Error state
None of its own. The page reads nothing from the account, and a server failure falls to the app's existing error boundary.

### Behavior
- Visiting the page records nothing and doesn't change what the dialog will show (pitch §4.9: the page is independent of the dialog).
- It's read-only. There are no edit, delete, filter, search, "mark all read", or share controls.
- Entries never link out of the product.

---

## Screen 5: First visit and rollout (no dialog)

### Purpose
Make sure the people who should not get the dialog don't get it.

### Behavior
- **A new account** starts with everything that already exists marked seen. Its first visit shows the onboarding tour and no What's New dialog (AC-3, standing resolution). An update that ships after it signed up is shown normally on a later load.
- **Accounts that exist when What's New ships** (the owner and any friends already signed up) see no dialog at rollout, because no entry ships with the mechanism (§13). The first significant entry a later pitch adds is shown to them once, like anyone else who hasn't seen it.
- **Nothing is fabricated.** No historical entries are written to fill the page, and nothing is backdated (pitch §4.8, §9.8).

---

## 7. Navigation flows

```text
Full load of any signed-in page
  ├─ tour opening by itself? ───────────► tour (dialog waits for a later load)
  ├─ significant unseen entries? ── no ─► nothing
  └─ yes ─► What's new dialog (1 or n entries, newest first) — counted as seen on open
               ├─ [Got it] / ✕ / Esc / scrim ─► stay on the page
               └─ [See all updates] ──────────► /settings/whats-new

Settings ─► What's New section ─► [See what's new] ─► /settings/whats-new ─► ‹ Settings
```

- The page is an ordinary route, so the URL, Back, and a refresh behave normally.
- No query parameters, no deep link to an entry, no anchor per entry (**Decision:** entries are short and the page is one column, so per-entry links would only matter to a public changelog, which isn't built here. Stable entry ids make them possible later).

---

## 8. Interaction specifications

#### Keyboard navigation

| Context | Key | Action |
| ------- | --- | ------ |
| Dialog | (on open) | Focus goes to **Got it** |
| Dialog | Tab / Shift+Tab | Cycles **See all updates** → **Got it** → ✕, trapped in the dialog. The list scrolls with the arrow keys or Page Up/Down when it has focus |
| Dialog | Enter / Space | Activates the focused control |
| Dialog | Escape | Closes it (same as Got it) |
| Settings | Enter on **See what's new** | Opens the page |
| Page | Tab | Back link only. The entries are plain text |

No custom shortcuts are added.

#### Loading states
The dialog has none (its content arrives with the page). The page uses a route skeleton (Screen 4).

#### Error states
A failed "seen" save is silent, retried once on close, and at worst means one more appearance (Screen 1). There's nothing else to fail.

#### Notifications
None. There's no toast for opening, closing, or failing to save, and nothing is announced outside the app (no email, no push, pitch §7).

#### Destructive actions
None. Nothing in What's New deletes, changes, or hides anything.

---

## 9. Responsive behavior

| Breakpoint | Width | Behavior |
| ---------- | ----- | -------- |
| base | below 640px | Dialog `calc(100% − 2rem)` wide, up to 85% of the screen tall, list scrolls between a fixed header and footer. **Got it** full width, 44px, above **See all updates** (44px hit area). Page is one column. Settings button 44px |
| `sm` | 640–767px | Dialog at `max-w-lg`. Footer becomes one row: **See all updates** · **Got it** (right). Buttons 36px |
| `md` | 768px and up | Rail appears (unchanged). Dialog centered over the content. Page in the content column. Settings button 36px |
| `lg` | 1024px and up | As md |

- Every action (Got it, ✕, See all updates, See what's new, ‹ Settings) is available at every width.
- On a short phone (e.g. 568px tall) with several entries, the dialog body scrolls and **Got it** stays visible (pitch §4.11: "dismissible without obscuring access to its controls").
- The phone navigation sheet is never opened by What's New.

---

## 10. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `ReleaseNote` | dialog and page (and a future public changelog) | new | Presentational only: date, title, body. Heading level is a prop. Knows nothing about accounts, seen state, or significance styling |
| `WhatsNewDialog` | app shell (client island) | new | Opens by itself when given entries. Records seen on open, retries on close. Variants: one entry, several entries (count subtitle, scrolling list) |
| What's New page | `/settings/whats-new` | new | Server-rendered list of `ReleaseNote`s plus empty state. No account read |
| Settings → What's New section | `/settings` | new | Heading, line, outline link button |
| Release-notes content | repository content | new | The single source of entries (spec decides location and format). Both surfaces read only from it |
| `Dialog`, `Button`, `Skeleton` | shadcn/ui | reused | No new dependency and no announcement library (pitch §4.11) |
| `TourProvider` | app shell | reused, unchanged | Its "opening by itself" state only suppresses the dialog on that load. The tour mechanism isn't modified |

---

## 11. Accessibility, privacy, and data sensitivity

Accessibility:

- The dialog is a modal `Dialog` with a title ("What's new") and a description (the subtitle). Screen readers announce "What's new, dialog, 3 updates since you were last here".
- Focus starts on **Got it**, is trapped while open, and returns to the page when it closes. Escape closes it.
- Entries are a real ordered list. Each has a `<time dateTime="2026-11-03">` and a heading, so heading navigation moves entry by entry on the page.
- Buttons are 44px tall on phones. The scrolling list is keyboard-scrollable.
- Nothing relies on color. There are no colored states to begin with.
- Reduced motion: no fade or zoom.

Privacy:

- Release notes are shared product information. Whether an account has seen them is private to that account. It's never displayed (no read/unread state anywhere), and one account's dialog, dismissal, or page visit can't affect or reveal another's (pitch §9.9).
- Entries never include an account's name, numbers, exercises, gyms, or anything personal.
- No analytics, impressions, read tracking, or external requests (pitch §7).
- Entries contain no external links.

---

## 12. Out of scope

From the pitch:

- Push notifications, email or any external announcement, and any email provider (no Resend, no SMTP).
- An in-app editor or admin screen for notes; per-user targeting or segmentation; scheduling, campaigns, or reminders ("remind me later").
- Analytics or read tracking beyond what's needed to not repeat a seen update.
- A notification center or inbox.
- A public changelog or landing page. The entry block and the content are designed to be reused there later, but nothing public is built.
- Rebuilding or changing the onboarding tour, its registry, or its steps.
- Any change to training behavior, plans, logged history, goals, or gym baselines.
- Historical or backdated entries written to populate the page.

Deferred (roadmap): reps-in-reserve logging; exercise history and PR views; the Apple platform work; HealthKit and body metrics; nutrition.

Permanent non-goals: program or mesocycle generation; social features or any visibility between accounts; cardio progression analysis; billing, admin, social login, email verification; dated goals and a rest timer.

---

## 13. User guidance

This pitch *builds* the release-notes mechanism, so its guidance is the mechanism itself. The `overload-onboarding` skill's contract was read for this section. Its maintenance workflow is not run, because What's New hasn't shipped yet (the skill's availability rule and pitch §14).

- **Tour step:** none. The rubric adds a step for a new screen or control the lifter has to discover. What's New announces itself when it matters (the dialog), and its page is reached from a labelled Settings section that the tour's Settings step already lands on. A step would be noise. The tour registry and mechanism are untouched.
- **Release-note entry:** none in this pitch (**Decision**). The run prompt says not to create a premature entry, pitch §4.8 and §9.8 rule out synthetic or backdated history, and the shipping date of this pitch is set by a human after the run. So What's New launches with an empty history and the page's empty state. The first entry is written by the first guidance ticket, in Pitch 13 (Faster Logging UX), through the content mechanism the spec defines. If the owner wants an introductory entry at launch, adding one is a data-only change on the deploy date (the runbook says how).
- **What the skill needs from this pitch** (recorded in full in the spec): where entries live, the fields of an entry (stable id, shipping date, title, one to three plain sentences, significant flag), how they're ordered, how significance decides the dialog, and the rule that adding an entry never touches the dialog or the page.
- **Tour links from an entry:** not supported in this version (**Decision**). The skill says to link an entry to a tour step "where the mechanism supports that". Here it doesn't: a "Show me" control would be a call to action inside an entry (pitch §9.10), and it would mean nothing on a future public changelog. The tour's `start({ from })` entry point stays available if a later pitch adds it.

---

## 14. Open questions

None. Every design-stage question the pitch left open is decided above (marked **Decision**) and carried into the spec's Resolved Decisions.
