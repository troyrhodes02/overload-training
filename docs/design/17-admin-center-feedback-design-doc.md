# Admin Center & Feedback — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 17: Admin Center & Feedback (`pitches/17-admin-center-feedback.md`)
**Focus:** The owner operates Overload (accounts, counts, feedback, audit history) without seeing anyone's training, and every lifter can send feedback.

This is an **interface-heavy** pitch (pipeline guide §9). The hard part is not the number of screens. Every admin surface has to be useful while showing nothing a lifter trains with.

---

## 1. What exists today (the baseline this changes)

- **Shell.** The `(app)` shell has a left rail at md+ (Today, Plan, History, Goals, Exercises, Gyms) and a phone navigation sheet below md with the same destinations plus Settings. The ⋮ account menu at the top right holds Settings and Sign out at every width. The content column is capped at 640px (`max-w-screen-sm`).
- **No admin surface.** The owner reads account state from the database by hand.
- **No feedback channel.** Lifters tell the owner things in person.
- **Accounts.** Settings edits name, username, timezone, and appearance, replays the tour, and opens What's New. A separate page deletes the signed-in account after a password re-check. Signup is open only while the server switch is on (OVE-50). This pitch does not touch signup.
- **Not-found.** The root not-found page reads "We couldn't find that page." with a link back to Today. A non-admin reaching any admin URL sees exactly this page, unchanged.

---

## 2. Vision

The owner opens one quiet area and answers "is anyone using this, who needs my attention, and what are people telling me?" in a few numbers, a searchable account list, and an inbox. Nothing on it shows a single set, plan, gym, goal, or cardio record. A lifter who finds something wrong can say so from the menu in under a minute.

**North star:** *operate the accounts, never open the training.*

---

## 3. Design principles

### 1. Metadata, never training

Every admin screen is built only from account metadata (name, username, email, status, signup date, last-active date, tour outcome), aggregate counts, feedback the lifter chose to send, and the audit log. No admin screen has a link, tab, count, or preview that opens or summarizes one account's plan, history, gyms, goals, or cardio. "Has this account logged a workout?" is a training fact about one person, so it appears only inside an aggregate count.

### 2. Absence is the boundary

A non-admin never learns that an admin area exists. There is no greyed-out link and no "you don't have access" message. The admin entry appears only for the owner, and any admin URL looks to everyone else exactly like a page that does not exist. Hiding the link is courtesy. The server's not-found is the boundary.

### 3. Consequential actions say who and what

Suspending or reactivating an account always goes through a dialog that names the account by name and email and says what will happen to them, in plain words. No action is a one-click toggle on a list row.

### 4. Every action leaves a line

Each admin change produces a line in the audit log, and the screen that made the change shows that line right away (the account's recent admin actions, the feedback item's history). The log is read-only. Nothing on any screen edits or removes a line.

### 5. Counts mean what they say

Each number states its definition in a short caption. Where the stored data cannot support precision (last-active is a date, not a timestamp, and is recorded only since this feature shipped), the caption says so instead of implying more.

---

## 4. Visual language

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

The admin area uses the same quiet system, utilitarian (`overload-ui-design` → Admin center): a few large numbers, a plain list, plain pages. No charts. The cohort view is a small table.

#### Color palette

| Token / theme path | Usage | Notes |
| ------------------ | ----- | ----- |
| `background`, `card`, `border` | page, list rows, metric tiles, dialog surfaces | tiles are bordered cards, no shadows |
| `foreground` | names, the large metric numerals, message text | high contrast for numbers |
| `muted-foreground` | captions, definitions, dates, emails, "Active" status text | lower contrast, never on `popover` at low contrast |
| `primary` | links (account names, "View account"), the active admin sub-nav item, primary buttons ("Send", "Reactivate…", "Mark handled") | the only accent |
| `destructive` | the Suspended status badge, the Suspend button and its confirm action, the delete-account section (not built in this run, see Screen 12) | consequence, not decoration |
| `progress`, `deload` | **not used anywhere in this pitch** | they mean training calls only |

#### State colors

| State | Visual treatment | Usage |
| ----- | ---------------- | ----- |
| Account active | plain muted text "Active", no badge | the ordinary case is a non-event |
| Account suspended | `Badge variant="outline"`, `border-destructive/40 text-destructive`, label "Suspended" | list rows, account header |
| Admin account | `Badge variant="outline"`, neutral, label "Admin" | list rows and header for allowlisted accounts |
| Feedback open | category badge plus foreground text | the inbox's default view |
| Feedback handled | muted text, a `Check` icon, the label "Handled · Oct 21" | still readable |
| Feedback category | `Badge variant="secondary"`, text "Bug" / "Idea" / "Question" / "Other" | neutral, no category is colored |

Color always comes with text: "Suspended", "Handled", "Admin" are words.

#### Typography, spacing, radius, elevation

- Metric numerals: `text-3xl font-semibold tracking-tight tabular-nums`. Captions: `text-sm text-muted-foreground`.
- Every count, percentage, and date uses `tabular-nums`.
- Dates: "Oct 21, 2026" in full on detail pages. "Oct 21" in lists within the current year. "Today" for the current day. Times appear only in the audit log ("Oct 21, 2026 · 2:14 PM"), in the admin's own timezone.
- Elevation as elsewhere: dividers and surface steps. Shadows only on dialogs, menus, and toasts.

#### Appearance

Light, dark, and system, from the account's stored preference (the admin area uses the same `AppearanceSync`). No toggle in the admin area. Both modes work through tokens. In dark mode the Suspended badge uses the dark `destructive` token, and nothing else changes.

---

## 5. Information architecture

```text
┌────────────────────────────────────────────────────────────────┐
│  Overload (lifter shell, unchanged destinations)               │
│  ⋮ account menu: Settings · Send feedback · [Admin]* · Sign out│
│  phone sheet secondary: Settings · Send feedback               │
├────────────────────────────────────────────────────────────────┤
│  /feedback ── Send feedback (every lifter, Free)               │
│  /suspended ─ "Your account is suspended" (outside the shell)  │
└────────────────────────────────────────────────────────────────┘
   * rendered only when the server says this account is an admin

┌────────────────────────────────────────────────────────────────┐
│  Overload · Admin   (its own wider shell; web-only)            │
│  sub-nav: Overview · Accounts · Feedback · Audit log           │
│           [‹ Back to Overload]                       ⋮ menu    │
├────────────────────────────────────────────────────────────────┤
│  /admin ─────────── Overview: six counts + signup cohorts      │
│  /admin/accounts ── directory: search, status filter, list     │
│     └ /admin/accounts/[id] ── metadata, status, Suspend /      │
│                                Reactivate, recent admin actions│
│  /admin/feedback ── inbox: Open · Handled · All, category      │
│     └ /admin/feedback/[id] ── message, sender, category,       │
│                                Mark handled / Reopen           │
│  /admin/audit ───── the audit log, newest first                │
└────────────────────────────────────────────────────────────────┘
   Any /admin URL for a non-admin → the root not-found page.
```

The admin area is **not** a rail destination and adds nothing to `NAV_ITEMS`. A lifter's navigation is unchanged except for one new entry, "Send feedback".

---

## 6. Screens

## Screen 1: Entry points (account menu and phone sheet)

### Purpose
Let every lifter find "Send feedback" and let the owner, and only the owner, find "Admin".

### URL pattern
n/a (shell chrome on every `(app)` page)

### Trigger
Tapping ⋮ (all widths) or the phone menu button (below md).

### Layout

```text
Account menu (lifter)            Account menu (owner)
┌───────────────────────┐        ┌───────────────────────┐
│ ⚙  Settings           │        │ ⚙  Settings           │
│ 💬 Send feedback      │        │ 💬 Send feedback      │
│ ↪  Sign out           │        │ 🛡  Admin              │
└───────────────────────┘        │ ↪  Sign out           │
                                 └───────────────────────┘
Phone sheet, secondary group (everyone)
──────────────
 ⚙  Settings
 💬 Send feedback
```

(Icons are lucide `Settings`, `MessageSquare`, `Shield`, `LogOut`. The glyphs above are wireframe shorthand.)

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Send feedback** | `DropdownMenuItem asChild` → `Link href="/feedback"`, `MessageSquare` | everyone; also in `SECONDARY_NAV_ITEMS` below Settings in the phone sheet |
| **Admin** | `DropdownMenuItem asChild` → `Link href="/admin"`, `Shield` | rendered only when the server-resolved account is on the admin allowlist; the client never decides |

### Behavior
- The admin item is absent from the markup for non-admins, not hidden with CSS.
- The admin item is not added to the phone sheet: the ⋮ menu is present at every width, so it is reachable on a phone, and the sheet stays the lifter's navigation.

---

## Screen 2: Admin shell

### Purpose
A wider frame for operating screens, visibly separate from training.

### URL pattern
`/admin/**`

### Layout — phone (375)

```text
┌──────────────────────────────────────┐
│ Overload  Admin                   ⋮  │
├──────────────────────────────────────┤
│ ‹ Back to Overload                   │
│ [Overview][Accounts][Feedback][Audit]│  ← Tabs-style links, scroll if needed
├──────────────────────────────────────┤
│  page content (single column)        │
└──────────────────────────────────────┘
```

### Layout — desktop (md+)

```text
┌──────────────────────────────────────────────────────────────┐
│ Overload  Admin        Overview  Accounts  Feedback  Audit log│  ⋮
│ ‹ Back to Overload                                           │
├──────────────────────────────────────────────────────────────┤
│        content, max-w-4xl, centered                          │
└──────────────────────────────────────────────────────────────┘
```

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Wordmark + "Admin"** | `OverloadLockup size="sm"` + `span.text-sm.font-medium.text-muted-foreground` "Admin" | links to `/admin` |
| **Sub-nav** | a `nav aria-label="Admin"` of `Link`s styled as the rail's active state (`text-primary bg-primary/10 font-semibold` + `aria-current="page"`) | Overview active only on `/admin`; others on their path and sub-paths. Phone label "Audit", desktop "Audit log" |
| **Back to Overload** | `Link` muted with `ChevronLeft` | goes to `/` |
| **⋮ menu** | the same `AccountMenu` (Settings · Send feedback · Admin · Sign out) | |

### Behavior
- No lifter rail and no phone sheet inside the admin shell. The way back is the Back link.
- Toasts use the same Sonner toaster, following the account's appearance.
- The What's New dialog and the tour never open inside the admin shell.

---

## Screen 3: Overview

### Purpose
Answer "how many people use Overload, and are new people coming back?" in counts.

### URL pattern
`/admin`

### Trigger
Admin menu item, or the Overview sub-nav link.

### Layout — phone

```text
┌──────────────────────────────────────┐
│ Overview                             │
│ Counts across every account. Nothing │
│ here shows anyone's training.        │
├──────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐    │
│ │ 24           │ │ 11           │    │
│ │ Registered   │ │ Active, 7 d  │    │
│ │ 1 suspended  │ │ 46% of reg.  │    │
│ └──────────────┘ └──────────────┘    │
│ ┌──────────────┐ ┌──────────────┐    │
│ │ 17           │ │ 3            │    │
│ │ Active, 30 d │ │ New this mo. │    │
│ │ 71%          │ │ since Oct 1  │    │
│ └──────────────┘ └──────────────┘    │
│ ┌──────────────┐ ┌──────────────┐    │
│ │ 19           │ │ 16           │    │
│ │ Created plan │ │ Logged a     │    │
│ │ 79%          │ │ workout 67%  │    │
│ └──────────────┘ └──────────────┘    │
├──────────────────────────────────────┤
│ Signup cohorts                       │
│ Month    Signed up  Came back  30 d  │
│ Oct 2026     3      1  33%   3 100%  │
│ Sep 2026     8      6  75%   6  75%  │
│ Aug 2026     5      4  80%   3  60%  │
│ Jul 2026     —                       │
│ Jun 2026     2      2 100%   1  50%  │
│ May 2026     6      5  83%   4  67%  │
│                                      │
│ Came back: active on a later day     │
│ than the signup day. 30 d: active in │
│ the last 30 days. Last-active dates  │
│ are kept as a date only and only     │
│ since this view shipped.             │
│ Dates are in your time zone          │
│ (America/Chicago).                   │
└──────────────────────────────────────┘
```

Desktop: the six tiles sit in a 3 × 2 grid (`md:grid-cols-3`). The cohort table is full width.

### Metric tiles

| Tile | Number | Caption line | Definition (shown as the tile's `title`/sr-only description and in the footnote) |
| ---- | ------ | ------------ | --------------------------------------------------------------------------------- |
| **Registered accounts** | all accounts | "n suspended" when n > 0, otherwise "All active" | every account with a profile, any status |
| **Active, last 7 days** | count | "% of registered" | last-active date within today and the 6 days before |
| **Active, last 30 days** | count | "% of registered" | last-active date within today and the 29 days before |
| **New this month** | count | "since Oct 1" | signed up on or after the 1st of the current month |
| **Created a plan** | count | "% of registered" | has at least one mesocycle, in any state (draft, active, archived) |
| **Logged a workout** | count | "% of registered" | has at least one logged set |

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Tile** | `div.rounded-lg.border.bg-card.p-4` with `dl` semantics (`dt` label, `dd` number) | static; not a link (a click-through to "which accounts" would turn a count into a list of training facts) |
| **Cohort table** | a plain `table` with `caption`, `th scope` headers, `tabular-nums`, right-aligned numbers | rows are the last 6 signup months, newest first; a month with no signups shows "—" in the remaining cells |
| **Footnote** | `p.text-xs.text-muted-foreground` | definitions + the timezone the dates use |

### Code reference

```tsx
<section className="space-y-6">
  <header className="space-y-1">
    <h1 className="text-xl font-semibold">Overview</h1>
    <p className="text-sm text-muted-foreground">
      Counts across every account. Nothing here shows anyone&apos;s training.
    </p>
  </header>
  <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
    <MetricTile label="Registered accounts" value={24} caption="1 suspended" />
    {/* … */}
  </dl>
  <CohortTable rows={cohorts} timeZone="America/Chicago" />
</section>
```

### Empty state
Only the owner's account exists: tiles read 1 / 1 / 1 / 0 / … normally. That is not an empty state. The cohort table always shows six month rows. Months with no signups show "—". No illustration and no "invite people" call to action (signup is not this pitch's concern).

### Loading state
`Skeleton` tiles of the final size (six) and a skeleton table of six rows. The layout does not shift when numbers arrive.

### Error state
If the counts cannot be read: an inline `Alert` "Couldn't load the counts. Try again." with a "Try again" button (router refresh). The shell and sub-nav stay usable.

### Behavior
- The numbers are as of the page load. No auto-refresh, no live indicator.
- The percentage is rounded to a whole percent. With 0 registered accounts it shows "—", never "NaN%" or "0%".

---

## Screen 4: Accounts (directory)

### Purpose
Find an account and see its status at a glance.

### URL pattern
`/admin/accounts?q=<search>&status=all|active|suspended&page=<n>`

### Trigger
The Accounts sub-nav link, or "View account" from a feedback item.

### Layout — phone

```text
┌──────────────────────────────────────┐
│ Accounts                       24    │
│ [🔍 Search name, username, email   ] │
│ [All] [Active] [Suspended]           │
├──────────────────────────────────────┤
│ William Rhodes  [Admin]          ›   │
│ @wrhodes · william@example.com       │
│ Active · Joined Oct 19 · Seen today  │
├──────────────────────────────────────┤
│ Maya Chen                        ›   │
│ @mayac · maya@example.com            │
│ [Suspended] · Joined Sep 3 · Seen    │
│ Oct 14                               │
├──────────────────────────────────────┤
│ No name                          ›   │
│ no username · jordan@example.com     │
│ Active · Joined Oct 20 · Not seen    │
├──────────────────────────────────────┤
│               [ Next › ]             │
└──────────────────────────────────────┘
```

### Layout — desktop

```text
Accounts                                          24 accounts
[🔍 Search name, username, email          ]  [All][Active][Suspended]
┌───────────────────────────┬───────────┬──────────┬───────────┬──────────┐
│ Account                   │ Status    │ Joined   │ Last seen │ Tour     │
├───────────────────────────┼───────────┼──────────┼───────────┼──────────┤
│ William Rhodes  [Admin]   │ Active    │ Oct 19   │ Today     │ Finished │
│ @wrhodes · william@ex…    │           │          │           │          │
│ Maya Chen                 │[Suspended]│ Sep 3    │ Oct 14    │ Skipped  │
│ …                         │           │          │           │          │
└───────────────────────────┴───────────┴──────────┴───────────┴──────────┘
                                                    ‹ Previous   Next ›
```

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Search** | `Input type="search"` with `Search` icon, `aria-label="Search accounts"`, inside a GET `form` | submits on Enter and on a "Search" button (sr-visible on phone as an icon button). Matches name, username, or email, case-insensitive, contains |
| **Status filter** | three `Link`s styled as a segmented `Tabs` list (All · Active · Suspended) | keep `q`; reset `page` |
| **Row** | phone: a full-width `Link` row (`min-h-16`) with `ChevronRight`; desktop: a `table` row whose name cell is the link | opens `/admin/accounts/[id]` |
| **Name** | first + last; "No name" muted when both empty | |
| **Username** | `@name`; "no username" muted for pre-username accounts | |
| **Email** | from the sign-in system; "—" when it can't be read | |
| **Status** | "Active" muted text or the Suspended badge | |
| **Joined** | signup date | |
| **Last seen** | "Today", a date, or "Not seen" (no last-active date recorded since tracking began) | |
| **Tour** | "Finished", "Skipped", or "Not yet" (desktop column; omitted on phone) | |
| **Admin badge** | outline "Admin" | allowlisted accounts only |
| **Pagination** | 50 rows per page, newest signups first; `‹ Previous` / `Next ›` links | hidden when one page |

There is **no plan or entitlement column**. Plans, Billing & Promo Codes adds one when entitlements exist. No placeholder column or "Free" label is drawn now.

### Empty state

```text
No accounts match "zz".   [Clear search]
```
With the Suspended filter and no suspended accounts: "No suspended accounts."

### Loading state
Skeleton rows (eight) the height of a row. The search field and filter render immediately with the current values.

### Error state
- Directory unreadable: `Alert` "Couldn't load accounts. Try again." with "Try again".
- Emails unavailable (the sign-in system didn't answer) but profiles readable: the list renders with "—" for emails and one quiet `Alert` above it: "Emails couldn't be loaded right now. Search by name or username still works."

### Behavior
- Search and filter are URL state, so the back button and a shared admin bookmark work.
- No bulk selection, no export, no row actions on the list. Actions live on the account page (principle 3).

---

## Screen 5: Account page

### Purpose
See one account's metadata and change its access, deliberately.

### URL pattern
`/admin/accounts/[id]`

### Trigger
A directory row, or "View account" from a feedback item or audit line.

### Layout — phone

```text
┌──────────────────────────────────────┐
│ ‹ Accounts                           │
│ Maya Chen            [Suspended]     │
│ @mayac · maya@example.com            │
├──────────────────────────────────────┤
│ Status         Suspended since Oct 21│
│ Joined         Sep 3, 2026           │
│ Last seen      Oct 14, 2026          │
│ Tour           Skipped               │
│ Time zone      America/New_York      │
│ Feedback sent  2 → View in inbox     │
├──────────────────────────────────────┤
│ Access                               │
│ Suspended accounts can't use         │
│ Overload. Their training history is  │
│ kept.                                │
│ [ Reactivate account… ]              │
├──────────────────────────────────────┤
│ Admin actions                        │
│ Oct 21 · 2:14 PM  Suspended by       │
│                   William Rhodes     │
│ Sep 30 · 9:02 AM  Reactivated by …   │
│ [View full audit log ›]              │
└──────────────────────────────────────┘
```

Active account: the Access block reads "This account can use Overload." with a destructive-outline `[ Suspend account… ]`.

Desktop: the same single column, `max-w-2xl`. No second column is needed.

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Back** | `Link` "‹ Accounts" | returns to the directory, keeping the previous query when the referrer carried one |
| **Header** | `h1` name ("No name" muted), status badge, Admin badge; muted line with @username and email | |
| **Facts** | `dl` two-column rows, `tabular-nums` | Status line adds "since <date>" from the latest status change in the audit log, or nothing when the account was never suspended |
| **Feedback sent** | count + `Link` to `/admin/feedback?account=<id>` | 0 → "None", no link |
| **Access** | a bordered section; `Button variant="outline"` destructive-styled "Suspend account…" or `Button` "Reactivate account…" | opens Screen 6's dialog |
| **Admin-protected** | for an allowlisted account (including your own): the Access block reads "Admin accounts can't be suspended here." and shows no button | prevents locking the owner out |
| **Admin actions** | the 10 most recent audit lines for this account; "View full audit log ›" → `/admin/audit?account=<id>` | empty: "No admin actions yet." |

**Not on this page, by rule:** plan or mesocycle names, workout counts, last workout date, gyms, goals, exercises, cardio, records, "has logged a workout", or any link into the lifter's screens. There is no "View as" or "Sign in as".

### Empty state
n/a (a record either exists or the route is not-found).

### Loading state
Header skeleton (name line + badge), six fact-row skeletons, an Access block skeleton.

### Error state
- Unknown or malformed id: the root not-found page (indistinguishable from any missing page).
- Facts unreadable: `Alert` with "Try again". The action button is not rendered while state is unknown.

### Behavior
- After a status change the page re-renders in place: the badge, the Status fact, the Access block, and a new top line in Admin actions all update together, and a toast confirms (Screen 6).

---

## Screen 6: Suspend and reactivate dialogs

### Purpose
Make an access change deliberate and name exactly whom it affects.

### URL pattern
`alertdialog` over Screen 5.

### Layout

```text
┌──────────────────────────────────────┐
│ Suspend Maya Chen?                   │
│                                      │
│ maya@example.com won't be able to    │
│ use Overload, starting with their    │
│ next request, even if they're signed │
│ in now. Nothing in the account is    │
│ deleted, and you can reactivate it   │
│ any time.                            │
│                                      │
│ This is recorded in the audit log.   │
│                                      │
│          [ Cancel ] [ Suspend ]      │  ← Suspend: variant="destructive"
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ Reactivate Maya Chen?                │
│                                      │
│ maya@example.com will be able to sign│
│ in and use Overload again, with      │
│ everything as they left it.          │
│                                      │
│ This is recorded in the audit log.   │
│                                      │
│        [ Cancel ] [ Reactivate ]     │  ← primary
└──────────────────────────────────────┘
```

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Dialog** | `AlertDialog` | focus moves to Cancel on open; Escape cancels; focus returns to the trigger |
| **Confirm** | `AlertDialogAction` (destructive for Suspend), pending state "Suspending…" / "Reactivating…" with the buttons disabled | one request; double-taps do nothing extra |
| **Name in title** | the account's name, or its email when it has no name | never "this user" |

### Behavior

| Outcome | Feedback |
| ------- | -------- |
| Suspended | dialog closes; toast `Maya Chen is suspended.` (success, 4s); page updates (Screen 5) |
| Reactivated | toast `Maya Chen can use Overload again.` |
| Already in that state (another tab did it) | dialog closes; the page shows the current state; toast `Already suspended.` / `Already active.` (info). Nothing is recorded twice |
| Failed | the dialog stays open with an inline `Alert` "Couldn't change the account. Nothing changed. Try again." The state shown is unchanged |

A change and its audit line succeed together or not at all. The UI never shows "suspended, but the log failed".

---

## Screen 7: Feedback inbox

### Purpose
Read what lifters sent and keep track of what is dealt with.

### URL pattern
`/admin/feedback?view=open|handled|all&category=bug|idea|question|other&account=<id>&page=<n>`

### Layout — phone

```text
┌──────────────────────────────────────┐
│ Feedback                    3 open   │
│ [Open] [Handled] [All]               │
│ Category: [All categories ▾]         │
├──────────────────────────────────────┤
│ [Bug]  Oct 21                     ›  │
│ The set entry jumps when I tap reps  │
│ on the second set. Happens on my…    │
│ Maya Chen                            │
├──────────────────────────────────────┤
│ [Idea]  Oct 20                    ›  │
│ Would love to see last week's        │
│ weights on the session summary.      │
│ Jordan Lee                           │
├──────────────────────────────────────┤
│ [Question]  Oct 18                ›  │
│ How does Overload decide when a lift │
│ is ready to go up?                   │
│ No name · sam@example.com            │
└──────────────────────────────────────┘
```

Desktop: the same list in a wider column (`max-w-3xl`). The message preview gets two lines and the sender sits on the right of the date line.

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **View** | segmented links (Open · Handled · All), Open default | keeps `category` and `account` |
| **Category filter** | `NativeSelect` "All categories / Bug / Idea / Question / Other", submits on change (GET form, with a "Filter" button for no-JS) | |
| **Account filter chip** | when `account` is set: "From Maya Chen ×" | × clears it |
| **Row** | full-width `Link` (`min-h-16`): category `Badge variant="secondary"`, date, `line-clamp-2` message preview, sender name (or "No name · email") | opens Screen 8 |
| **Handled row** (Handled/All views) | muted text + `Check` "Handled · Oct 21" | |
| **Count** | "n open" in the header | |
| **Pagination** | 50 per page, newest first | |

### Empty state
- Open view, nothing open: "Nothing open. Everything sent so far is handled." When there is no feedback at all: "No feedback yet."
- A filter with no matches: "No feedback matches this filter." plus [Clear filters].

### Loading state
Six row skeletons (badge, two text lines, a short line).

### Error state
`Alert` "Couldn't load feedback. Try again."

### Behavior
- Opening an item does not mark it handled (reading is not handling).
- No reply box, no assignee, no notes, no threads.

---

## Screen 8: Feedback item

### Purpose
Read one message in full, check its category, and mark it handled.

### URL pattern
`/admin/feedback/[id]`

### Layout

```text
┌──────────────────────────────────────┐
│ ‹ Feedback                           │
│ [Bug]  Sent Oct 21, 2026 · 8:40 AM   │
├──────────────────────────────────────┤
│ The set entry jumps when I tap reps  │
│ on the second set. Happens on my     │
│ phone, not on the laptop.            │
├──────────────────────────────────────┤
│ From      Maya Chen                  │
│           @mayac · maya@example.com  │
│           [View account ›]           │
│ Category  [ Bug ▾ ]  [Save]          │
├──────────────────────────────────────┤
│ Open                                 │
│ [ Mark handled ]                     │
├──────────────────────────────────────┤
│ History                              │
│ Oct 21 · 8:40 AM  Sent               │
│ Oct 21 · 3:02 PM  Category Idea→Bug  │
│                   by William Rhodes  │
└──────────────────────────────────────┘
```

Handled: the state block reads "Handled Oct 22 by William Rhodes" with an outline `[ Reopen ]`.

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Message** | `p.whitespace-pre-wrap.break-words`, plain text (never rendered as HTML or links) | the lifter's words exactly as sent |
| **From** | sender name, @username, email; `Link` "View account" | sender account deleted (future) → "Deleted account", no link |
| **Category** | `NativeSelect` (Bug, Idea, Question, Other) + "Save" (enabled only when changed) | the owner re-files a message the lifter mis-categorized; audited |
| **Mark handled / Reopen** | `Button` primary / `Button variant="outline"` | no dialog: it is reversible and each change is audited; toast `Marked handled.` / `Reopened.` |
| **History** | the item's "Sent" line plus its audit lines | |

The message is the only content the lifter chose to send. Nothing about their training is attached or fetched: no plan, recent workouts, gym, or app state.

### Loading / error states
Skeleton message block and fact rows. Unknown id → root not-found. A failed change: inline `Alert` beside the control, "Couldn't save. Nothing changed." The control keeps its previous value.

---

## Screen 9: Audit log

### Purpose
See every admin action: who, what, which account, when.

### URL pattern
`/admin/audit?account=<id>&page=<n>`

### Layout

```text
┌──────────────────────────────────────┐
│ Audit log                            │
│ Every admin action, newest first.    │
│ Nothing here can be edited.          │
├──────────────────────────────────────┤
│ Oct 22, 2026 · 9:15 AM               │
│ William Rhodes marked feedback       │
│ handled · Maya Chen ›                │
├──────────────────────────────────────┤
│ Oct 21, 2026 · 2:14 PM               │
│ William Rhodes suspended the account │
│ · Maya Chen ›                        │
├──────────────────────────────────────┤
│ Oct 21, 2026 · 3:02 PM               │
│ William Rhodes changed a feedback    │
│ category from Idea to Bug ·          │
│ Maya Chen ›                          │
└──────────────────────────────────────┘
                          [ Older › ]
```

Desktop: a table with When · Admin · Action · Account.

| Action | Line wording |
| ------ | ------------ |
| suspend | "suspended the account" |
| reactivate | "reactivated the account" |
| feedback handled | "marked feedback handled" |
| feedback reopened | "reopened feedback" |
| feedback category | "changed a feedback category from {old} to {new}" |

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Account link** | account name (or email) → Screen 5; a removed account reads "Deleted account" without a link | |
| **Feedback link** | for feedback actions, "View feedback ›" → Screen 8 | |
| **Account filter chip** | "For Maya Chen ×" when `account` is set | |
| **Pagination** | 50 per page; "Older ›" / "‹ Newer" | |

There are no edit, delete, or export controls. Reading the log is not itself logged (reads are not actions).

### Empty state
"No admin actions yet."

### Loading / error
Eight skeleton lines. `Alert` "Couldn't load the audit log. Try again."

---

## Screen 10: Send feedback (every lifter)

### Purpose
Tell the owner about a bug, an idea, or a question without leaving Overload.

### URL pattern
`/feedback` (inside the lifter shell, 640px column)

### Trigger
⋮ → Send feedback, or phone sheet → Send feedback.

### Layout

```text
┌──────────────────────────────────────┐
│ Send feedback                        │
│ Goes straight to the person who runs │
│ Overload. Replies aren't sent in the │
│ app.                                 │
├──────────────────────────────────────┤
│ What is it?                          │
│ ( ) Bug       ( ) Idea               │
│ ( ) Question  ( ) Other              │
│                                      │
│ Message                              │
│ ┌──────────────────────────────────┐ │
│ │                                  │ │
│ │                                  │ │
│ └──────────────────────────────────┘ │
│                          0 / 2000    │
├──────────────────────────────────────┤
│               [ Send ]               │  ← sticky thumb bar on phone
└──────────────────────────────────────┘
```

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Category | `RadioGroup` of four, 2 × 2 grid, each `min-h-11` | yes | none selected | "Choose what it's about." |
| Message | `Textarea` (shadcn), `rows={6}`, `maxLength` 2000 | yes | empty | trimmed; empty → "Write a message."; over 2000 → "Keep it under 2,000 characters." The counter turns `text-destructive` past the limit (paste can exceed `maxLength` in some browsers; the server is authoritative) |

### Validation
- Validation is inline, under the field, after the first Send attempt. Send stays enabled, so the lifter always gets a reason instead of a dead button.
- The draft (category + message) survives a failed send.

### Success state

```text
┌──────────────────────────────────────┐
│ ✓ Sent. Thanks for telling us.       │
│ [ Send something else ]  [ Back to   │
│                            Today ]   │
└──────────────────────────────────────┘
```
The form is replaced in place. Focus moves to the confirmation heading. "Send something else" restores an empty form.

### Error state
- Server or network failure: `Alert` above Send: "Couldn't send. Your message is still here. Try again."
- Daily limit reached (abuse guard): `Alert` "You've sent a lot of feedback today. Try again tomorrow." The message is kept.

### Behavior
- Free on every plan. No upgrade note ever appears here.
- Nothing is attached automatically: no screen, workout, plan, or device data.

---

## Screen 11: Suspended account

### Purpose
Tell a suspended lifter, plainly, why Overload won't open, and let them sign out.

### URL pattern
`/suspended` (outside the lifter shell, the auth-card layout)

### Trigger
Any authenticated page or action while the account is suspended, including a session that was signed in before the suspension. The next request lands here.

### Layout

```text
┌──────────────────────────────────────┐
│              Overload                │
│                                      │
│ Your account is suspended            │
│ You can't use Overload while it's    │
│ suspended. Nothing in your account   │
│ has been deleted.                    │
│                                      │
│ If you think this is a mistake,      │
│ contact the person who runs Overload.│
│                                      │
│            [ Sign out ]              │
└──────────────────────────────────────┘
```

### Behavior
- An active account visiting `/suspended` goes to Today. A signed-out visitor goes to the login screen.
- A suspended account that signs in again arrives here after sign-in.
- After reactivation, the next request works normally. Nothing to dismiss.
- No admin name, no reason text, no date. The owner's identity and notes are not shown to the lifter.

---

## Screen 12: Delete an account from the admin area — NOT BUILT IN THIS RUN

The roadmap and PRD list owner-initiated deletion. CLAUDE.md and the PRD's Accounts edge cases say deletion is user-initiated only ("cannot be started by anyone but the signed-in owner"). Under the run's pre-resolved decision 7, that contradiction halts this one capability (stop condition 2). The Account page therefore has **no delete control** in this run: no disabled button and no "coming soon".

For the resumed work, once the upstream amendment authorizes owner-initiated deletion through the dedicated module, the intended interaction is:

```text
Account page, below Access:
 Delete account
 Permanently deletes this account and all of its training history.
 [ Delete account… ]   ← destructive outline

 alertdialog:
 Delete Maya Chen's account?
 This permanently deletes maya@example.com's account and all of its
 training history. It can't be undone.
 Type the email to confirm: [                       ]
 [ Cancel ] [ Delete account ]   ← enabled only on an exact match
 → toast "Maya Chen's account was deleted." → directory; audit line
   "deleted the account" (account shown as "Deleted account" afterwards)
```

No per-account inventory counts are shown (they would be one account's training facts). Admin accounts cannot be deleted from here. The preview draws this as a labelled *deferred* frame only.

---

## 7. Navigation flows

```text
Owner:
  any page ─⋮─> Admin ──> /admin (Overview)
  /admin/accounts ─search/filter (URL)─> list ─row─> /admin/accounts/[id]
      ─[Suspend account…]─> alertdialog ─Suspend─> same page, updated + toast
      ─[View full audit log]─> /admin/audit?account=[id]
      ─[View in inbox]─> /admin/feedback?account=[id]
  /admin/feedback ─row─> /admin/feedback/[id] ─[Mark handled]─> same page + toast
      ─[View account]─> /admin/accounts/[id]
  any admin page ─‹ Back to Overload─> /

Lifter:
  any page ─⋮ or sheet─> Send feedback ─> /feedback ─[Send]─> in-place confirmation
      ─[Back to Today]─> /

Non-admin typing /admin/... ─> root not-found ("We couldn't find that page.")
Signed-out visitor typing /admin/... ─> /login (same as any protected path)

Suspended lifter (signed in before or after):
  any page or action ─> /suspended ─[Sign out]─> /login
Reactivated lifter: next request ─> works as before
```

All screens are full pages except Screen 6 (alertdialog) and toasts. Filters and pagination live in the query string.

---

## 8. Interaction specifications

#### Keyboard navigation

| Context | Key | Action |
| ------- | --- | ------ |
| Directory search | Enter | Submit the search |
| Feedback category radios | Arrow keys | Move the selection (Radix RadioGroup) |
| Feedback message | Ctrl/⌘ + Enter | Not bound; Tab to Send |
| Alert dialog | Escape | Cancel; focus returns to the trigger |
| Lists | Tab | Each row is one focusable link |

No new shortcuts.

#### Loading states
`Skeleton` shaped like each final layout (tiles, rows, fact rows). Buttons that submit show a pending label and are disabled while pending.

#### Error states
Inline `Alert` with a "Try again" action. Input (feedback draft, a changed category) is preserved. A failed admin change always says "Nothing changed".

#### Notifications

| Action | Message | Severity | Duration |
| ------ | ------- | -------- | -------- |
| Account suspended | `Maya Chen is suspended.` | success | 4s |
| Account reactivated | `Maya Chen can use Overload again.` | success | 4s |
| Already in that state | `Already suspended.` / `Already active.` | info | 4s |
| Feedback marked handled | `Marked handled.` | success | 4s |
| Feedback reopened | `Reopened.` | success | 4s |
| Feedback category saved | `Category saved.` | success | 4s |
| Admin change failed | inline `Alert`, no toast | error | until dismissed |
| Feedback sent | in-place confirmation, no toast | — | — |

#### Destructive actions
- **Suspend**: `AlertDialog` naming the account (Screen 6). It is reversible, but it locks a person out, so it is confirmed.
- **Reactivate**: confirmed too, so an access change is never a misclick.
- **Mark handled / reopen / recategorize**: no dialog (reversible, low consequence, audited).
- **Admin delete**: not built (Screen 12).

---

## 9. Responsive behavior

| Breakpoint | Behavior |
| ---------- | -------- |
| base (<640) | Admin: single column; sub-nav as a horizontally scrollable link row; tiles 2-up; directory as stacked rows; cohort table fits 375 with compact headers ("Came back", "30 d"). Feedback: sticky Send bar at the bottom |
| `sm` (≥640) | Admin tiles stay 2-up with more padding |
| `md` (≥768) | Admin sub-nav moves into the header row; tiles 3-up; directory and audit log become tables; content `max-w-4xl` |
| `lg` (≥1024) | Same, centered; no extra columns |

Every admin action is available at 375px. The admin area is designed for the web at any width (web-only means "not in a future native shell", not "desktop-only").

---

## 10. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `AccountMenu` | shell | reused, extended | + Send feedback; + Admin when the server says so |
| `SECONDARY_NAV_ITEMS` | phone sheet | reused, extended | + Send feedback |
| `AdminShell` / `AdminNav` | `/admin/**` | new | wordmark + "Admin", sub-nav, Back link |
| `MetricTile` | Overview | new | label, number, caption |
| `CohortTable` | Overview | new | six month rows |
| `AccountRow` / `AccountTable` | Accounts | new | phone rows, desktop table |
| `AccountStatusBadge` | Accounts, Account page | new | Suspended (destructive outline); Active renders text only |
| `AccessSection` + `ChangeAccessDialog` | Account page | new | suspend / reactivate / admin-protected variants |
| `AuditLine` / `AuditTable` | Account page, Feedback item, Audit log | new | one wording table (§Screen 9) |
| `FeedbackRow`, `FeedbackItem` | Inbox, Item | new | category badge, handled state |
| `FeedbackForm` | `/feedback` | new | RadioGroup + Textarea + Send; success state |
| `Textarea` | ui | new (stock shadcn/ui) | the only new primitive |
| `SuspendedNotice` | `/suspended` | new | in `AuthCard` |
| `Badge`, `Button`, `AlertDialog`, `Alert`, `Input`, `NativeSelect`, `RadioGroup`, `Skeleton`, Sonner | | reused | |

---

## 11. Accessibility, privacy, and data sensitivity

Accessibility:
- Every control has an accessible name. The admin sub-nav is `nav aria-label="Admin"` with `aria-current="page"`.
- Status and handled states are words, never color alone.
- Metric tiles use `dl/dt/dd`. The cohort table has a `caption` and scoped headers.
- Dialogs trap focus and return it to the trigger. The feedback form's errors are linked with `aria-describedby` and announced (`role="alert"` on the form-level Alert).
- Tap targets are at least 44px (rows `min-h-16`, radios `min-h-11`, buttons `h-11` on phone).

Privacy (the heart of this pitch):
- **No training content on any admin surface or in any admin response**: no plan, session, exercise, set, weight, rep, gym, goal, cardio, record, or call, and no per-account count of any of them. "Created a plan" and "Logged a workout" exist only as totals.
- **No impersonation**, no "view as", no deep link from an admin page into a lifter's screens.
- Emails and names are shown only inside the admin area, only to admins. They never appear in toasts on lifter screens, in the What's New entry, or in the tour.
- Feedback shows only what the lifter typed plus the sender's account metadata. Nothing is attached.
- The suspended page shows no admin identity.
- Gym addresses never appear (gyms are not shown at all).
- No external links, no analytics, no tracking pixels, no third-party scripts.

---

## 12. Out of scope

From the pitch:
- **Admin deletion**: halted pending the upstream deletion-contract amendment (Screen 12).
- Billing and plan state, promo codes, and comped access: Plans, Billing & Promo Codes adds the plan column, plan fact, and comp controls.
- Replies to feedback, threads, notes, assignment, email, ticketing.
- Impersonation or any training-content view.
- Pageview, clickstream, or live-presence tracking; charts beyond counts; third-party analytics.
- Public signup changes, password recovery, email.
- A native admin app.

Deferred (roadmap): iOS/Android shells, notifications, gym location, body metrics, nutrition.

Permanent non-goals: program generation or any AI coach, social features, ads, dated goals, rest timer, cardio progression analysis, any admin view of an account's training content.

---

## 13. User guidance

Both the Onboarding Tour and What's New have shipped, so the last ticket runs `overload-onboarding`, which decides the following.

- **Tour step — none recommended.** "Send feedback" is one item in the ⋮ menu and the phone sheet, menus the tour already points at ("Settings … live here, under the ⋮ menu"). It is useful without discovery training. A tour step for a menu item would be noise (skill rubric: "a new variant of something the lifter already understands"). The admin area is never toured: it is owner-only and must not be revealed to lifters. Existing steps keep their ids and copy.
- **Release note — significant (proposed).** Illustrative. **Send feedback from Overload:** "Found something that needs fixing, or have an idea or a question? Choose Send feedback from the ⋮ menu to send it straight to the person who runs Overload." Dated the day it reaches production. It does not mention the admin area.

---

## 14. Plan placement and platform impact

- **Plan placement:** **Free.** Sending feedback is available to every account on every plan, and no upgrade note ever appears on it. The admin area is not a plan capability: it is gated by the server-side admin allowlist, never by a plan.
- **Platform impact:** pending (the iOS foundation has not shipped; `overload-cross-platform` is dormant). The admin area is **web-only** by rule. The feedback page and the suspended page are ordinary shared web UI and would be shared surfaces in a future shell.

---

## 15. Open questions

None for design. Pitch §14's design questions are decided above: navigation and hierarchy (§5, Screen 2), lookup and list (Screen 4), metric presentation and empty states (Screen 3), feedback form and inbox (Screens 7, 8, 10), audit display (Screen 9), and confirmations (Screen 6). The metrics-layer structure, the last-active rule, cohort arithmetic, and audit persistence belong to the spec. Admin deletion is halted, not open (Screen 12).
