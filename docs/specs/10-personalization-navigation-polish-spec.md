---
version: 1.0.0
status: approved
author: Claude Code (autonomous pipeline run, 2026-10-19)
last_updated: 2026-10-19
pitch_reference: pitches/10-personalization-navigation-polish.md (Linear doc cf247f11-4bb1-426f-989a-4d3038c5dc29)
design_reference: docs/design/10-personalization-navigation-polish-design-doc.md (v1.0)
preview_reference: docs/previews/10-personalization-navigation-polish-preview.html (v1.0 — the binding visual contract)
prd_reference: Downloads/prd (1).md → "Personalization & Navigation Polish" (approved multi-user set; see R1)
architecture_reference: Downloads/architecture (1).md (approved multi-user set; see R1)
linear_issue: milestone "Personalization & Navigation Polish" (Overload V1) — ticket ids in docs/runs/10-personalization-navigation-polish-progress.md
---

# Personalization & Navigation Polish — Technical Specification

## 2. Summary

Personalization & Navigation Polish adds three presentation capabilities to the existing application shell, without changing any training behavior: a **greeting** heading on Today that names the lifter and says one true thing about today; a per-account **appearance** preference (Light, Dark, System — System by default) that every surface follows; and a **phone navigation** pattern where, below `md`, the fixed bottom bar is replaced by a menu button in a sticky header that opens a left-side sheet — while the `md`+ left rail stays exactly as it is.

The core abstraction for the greeting is a **pure function** `composeGreeting(input) → string` over facts the server already has: the dashboard state (`DashboardDto`, unchanged), the account's first name, its stored timezone, whether today is its first visit, and the current instant. Nothing about the greeting is stored. Variation is a deterministic pick seeded by `(userId, local date, situation family)`. The core abstraction for appearance is a **single stored value**, `Profile.appearance` (the account's record), applied to `<html>` as a class (`light` / `dark` / none for System) that the existing token CSS already understands, with a per-device first-paint mirror so a returning device never flashes. The core abstraction for navigation is **one destination list** (`NAV_ITEMS`) rendered two ways: the unchanged rail at `md`+, a shadcn `Sheet` below.

"Working" means: Today's heading is correct for every situation and timezone and identical across re-renders; a lifter's appearance choice applies immediately, survives reload and a new device, never changes another account's preference, and System tracks the device live; at 375px there is no bottom bar, the sheet opens from the header, choosing a destination closes it and navigates, and at 1280px the shell is pixel-for-pixel today's.

## 3. Problem

- The app cannot yet greet the lifter: Today has no heading at all, and nothing on it uses the first name captured at signup (Accounts).
- The app cannot yet honor an appearance choice: it follows the OS only, Settings has no control, and there is nowhere to store a preference. Worse, shadcn components' `dark:` utilities only fire on an explicit `.dark` class, so under "follow the OS" some surfaces are already inconsistent in dark mode (pitch §9.5).
- On a phone the six-item fixed bottom bar permanently occupies the bottom of every screen, every page reserves padding for it, and every thumb-reach action bar floats above it. (The pitch calls this the "persistent sidebar"; R9.)
- The Onboarding Tour (Pitch 11) and the iOS shell need final, stable navigation controls at both sizes before they are designed around them.

PRD journey: "The dashboard greeting". PRD feature: "Personalization & Navigation Polish" (AC 1–3 and both edge cases). Depends on Accounts (first name, timezone editing) and Multi-User Foundation (Profile, scoped data access).

## 4. Scope and non-scope

**In scope**

1. Greeting heading on Today for the situations Planned, Underway, Late night, Cardio planned, Done, Rest, No plan, First visit; account-local time bands; deterministic variation; missing first name; missing/invalid timezone; Today loading skeleton update.
2. `Profile.appearance` (enum, default `system`) + additive migration; read/update functions in the Accounts profile area; `updateAppearanceAction`; the Settings → Appearance section (instant apply, background save, revert on failure); application of the choice to every surface (html class, `dark:` variant fix, `color-scheme`, browser `theme-color`, Sonner theme); no-flash first paint on a returning device.
3. Phone navigation below `md`: sticky header with menu button; shadcn `Sheet` with the six destinations + Settings; bottom bar removed; thumb-reach action bars moved to the bottom edge; main-content bottom padding reduced. `md`+ unchanged.
4. Tests (unit, integration incl. isolation, guard updates) and a local-stack Personalization e2e.

**Out of scope** (pitch §7, §10)

- Assistant behavior of any kind; greeting customization; notifications/reminders.
- Appearance options beyond the three; any theme toggle outside Settings.
- Desktop navigation changes; new/renamed/reordered destinations; dashboard redesign; logging UX (Faster Logging UX); Onboarding Tour; What's New; authentication, signup, password recovery, email (no Resend/SMTP — R25).
- Changes to how dashboard state, workout completion, missed days, or "today" are computed. The greeting **reads** `getTodayDashboard`'s result; it never alters it.

Adjacent temptations named explicitly (guide D3): emoji/motivational/assistant wording; computing time of day from the server's own zone; a header theme toggle; touching the desktop rail.

## 5. Core concepts

| Concept | Description |
| ------- | ----------- |
| `Profile.appearance` | The account's appearance preference: `system` (default), `light`, or `dark`. Stored, one per account, on the existing `Profile` row (owned by `userId`). The only authority. |
| Appearance mirror | A per-device copy of the last applied appearance in `localStorage` key `overload.appearance`, written only by the client from the account's stored value or a just-made choice, read only by the static boot script for the first paint. Never read by the server, never authoritative, holds no training data (R6). |
| Applied appearance | What `<html>` carries: class `dark`, class `light`, or neither (System → the CSS `prefers-color-scheme` rules decide, live). |
| `GreetingSituation` | Derived per render from `DashboardDto` (+ first-visit fact): `planned`, `underway`, `cardio_planned`, `done`, `done_cardio`, `rest`, `no_plan`. Never stored. |
| Time band | Derived from the current instant in the account's stored zone: `morning` 04:00–11:59, `afternoon` 12:00–16:59, `evening` 17:00–23:59, `night` 00:00–03:59; `unknown` when the zone is invalid. The late-night window is 21:00–03:59 (standing resolution). |
| First visit | Derived: the account's `Profile.createdAt` falls on today's local date **and** the account has no `LoggedSession` rows (R17). Never stored. |
| Greeting variant | `variants[fnv1a32(userId + "|" + localDate + "|" + family) % variants.length]` — deterministic for an account, day, and situation family (R16). |
| `NAV_ITEMS` | The one ordered destination list (Today, Plan, History, Goals, Exercises, Gyms) with the one active-path rule, shared by the rail and the sheet. |

## 6. States and lifecycle

**Appearance**

| From | To | Trigger | Side effects |
| ---- | -- | ------- | ------------ |
| (new profile) | `system` | profile creation (column default) | none |
| any | any of the three | lifter chooses a tile | client applies immediately → `updateAppearanceAction` → `profiles.appearance` updated for the acting account only → `refresh()`; on failure the client re-applies the last confirmed value |

No other transitions. Nothing resets it. Account deletion removes the profile with everything else (existing module, unchanged).

**Phone navigation sheet** (client state only): `closed` → `open` (menu button) → `closed` (destination tap, ×, scrim, Escape, route change, viewport reaches `md`).

**Greeting:** stateless.

## 7. UI integration

The preview is binding for hierarchy, controls, copy, states, responsive behavior, and tokens. Departures need a Resolved Decision.

### 7.1 Today (`src/app/(app)/page.tsx`)

- Data: the existing `getTodayDashboard(account)` result (unchanged), plus `getGreetingFacts(account)` → `{ firstName: string | null; timeZoneValid: boolean; firstVisit: boolean }`.
- Every branch of `TodayPage` (no_plan, cardio-only rest, rest, missed_day, pending/in_progress/complete) renders the same header first:

```tsx
<header>
  <h1 className="text-xl font-semibold tracking-tight text-balance">{greeting}</h1>
  <p className="mt-1 text-sm text-muted-foreground">Today · {today}</p>
</header>
```

  replacing the existing first line `<p className="text-sm text-muted-foreground">Today · {today}</p>`. Nothing else in the page changes (blocks, order, goals rule, missed-day prompt, inert dimming).
- `greeting = composeGreeting({ dashboard, firstName, timeZone: timeZoneValid ? account.timeZone : null, firstVisit, userId: account.userId, now: new Date() })`. `new Date()` is read after `requireAccount()` (which awaits `connection()`), so Cache Components allows it.
- The greeting is plain text in a server component. No client component, no `useEffect`, no randomness.
- `src/app/(app)/loading.tsx`: first element becomes a heading skeleton — `<Skeleton className="h-7 w-3/4" />` then `<Skeleton className="mt-1 h-4 w-36" />` (wrapped as one block), then the existing two block skeletons. This file is the `(app)` segment fallback; pages with their own `loading.tsx` are unaffected.

### 7.2 Settings → Appearance (`src/app/(app)/settings/page.tsx`)

- Page data adds `appearance` from `getAccountAppearance(account)`.
- Order: `<h1>Settings</h1>`, `<ProfileForm …/>` (unchanged), **`<AppearanceSetting initial={appearance} />`**, Delete account section (unchanged).
- `AppearanceSetting` (`src/components/settings/appearance-setting.tsx`, client island):
  - `RadioGroup` (existing `components/ui/radio-group`) with `aria-labelledby="appearance-heading"`, `className="grid grid-cols-3 gap-2"`; three `Label` tiles containing a visually hidden `RadioGroupItem`, a Lucide icon (`Sun`, `Moon`, `Monitor`, `size-5`, `aria-hidden`), the label, and on the selected tile a `Check` (`size-4 text-primary`, top-right). Tile classes per design doc Screen 2 (selected: `border-primary ring-1 ring-primary`; focus-visible ring via `has-[:focus-visible]`).
  - System tile note "Follows your device" (`text-xs text-muted-foreground`) rendered `hidden min-[360px]:block` (preview "Narrowest phone" frame).
  - Helper `<p className="text-sm text-muted-foreground">System follows your device's light or dark setting.</p>`.
  - Error `<p role="alert" className="text-sm text-destructive">Couldn't save your appearance. Try again.</p>` only after a failed save; cleared on the next choice.
  - Visually hidden `<p aria-live="polite">` announcing `Appearance: Light.` / `Dark.` / `System.` after a successful save.
  - Behavior: `onValueChange(next)` → `setSelected(next)`; `applyAppearance(next)`; `seq = ++latest`; `startTransition(async () => { const r = await updateAppearanceAction(next); if (seq !== latest.current) return; if (r.ok) confirmed = next, announce; else { setSelected(confirmed); applyAppearance(confirmed); setError(true) } })`. The last choice wins; a stale response never overrides a newer choice. The group stays enabled during saves.
  - No Save button, no toast. The Profile form's Save bar is untouched and still saves only name and timezone.
- `src/app/(app)/settings/loading.tsx`: insert `<Skeleton className="h-5 w-28" />` + `<Skeleton className="h-16 w-full rounded-lg" />` (as one `space-y-3` block) between the profile block and the delete block.

### 7.3 Applying appearance everywhere

| Piece | File | Contract |
| ----- | ---- | -------- |
| Pure model | `src/lib/appearance/appearance.ts` (no React, no Prisma, no `server-only`; importable by client and server) | `export const APPEARANCES = ["system","light","dark"] as const; export type Appearance = …; export function isAppearance(v: unknown): v is Appearance; export const APPEARANCE_STORAGE_KEY = "overload.appearance"; export const THEME_COLORS = { light: "#f7f7f8", dark: "#0b0b0c" }` (the same values as `viewport.themeColor` in `src/app/layout.tsx`, which must import them rather than repeat them). |
| DOM applier | `src/lib/appearance/apply.ts` (client-only functions; guarded for `typeof document`) | `applyAppearance(a: Appearance): void` — (1) adds a temporary `<style>*{transition:none!important}</style>`, (2) `documentElement.classList.toggle("dark", a==="dark")` and `toggle("light", a==="light")`, (3) sets every `meta[name="theme-color"]`'s `content` to `THEME_COLORS[a]` for explicit modes, or back to its media-matched default (light meta → light, dark meta → dark) for System, (4) writes the mirror in `try/catch`, (5) removes the style on the next frame. Idempotent. |
| Boot script | `src/lib/appearance/boot-script.ts` exports `APPEARANCE_BOOT_SCRIPT` (a string) | Inline, rendered by the **root** layout in `<head>` via `<script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT_SCRIPT }} />`. Reads the mirror in `try/catch`; if it is `light` or `dark`, adds that class to `<html>` and sets both theme-color metas (metas are emitted before it — the script also handles absence); anything else → does nothing (System). No network, no cookies, no account data. The root layout stays static (Cache Components). |
| Sync island | `src/components/shell/appearance-sync.tsx` (client) | `AppearanceSync({ appearance })` — `useLayoutEffect(() => applyAppearance(appearance), [appearance])`. Rendered by `AppShell` with the value the `(app)` layout read from the account. Corrects a new device or a device last used by another account on the first hydrated render, and keeps the html class right after client-side navigations from Login/Signup into the app. Renders nothing. |
| Layout read | `src/app/(app)/layout.tsx` | `const account = await requireAccount(); const appearance = await getAccountAppearance(account); return <AppShell appearance={appearance}>…` |
| CSS | `src/app/globals.css` | (a) Replace `@custom-variant dark (&:is(.dark *));` with a variant that also matches System-dark: `@custom-variant dark { &:where(.dark, .dark *) { @slot; } @media (prefers-color-scheme: dark) { &:where(:root:not(.light), :root:not(.light) *) { @slot; } } }`. (b) Add `color-scheme`: `:root { color-scheme: light; } .dark { color-scheme: dark; }` and inside the existing `@media (prefers-color-scheme: dark) { :root:not(.light) { … color-scheme: dark; } }`. Token values are not changed. |
| Toasts | `src/components/ui/sonner.tsx` | `Toaster` keeps `theme="system"` as its default but `AppShell` passes `theme={appearance}`; the doc comment is updated (it no longer says there is no toggle). Offsets unchanged (they clear the thumb-reach bars, R12). |
| Charts | — | Recharts already reads CSS variables (`e1rm-chart.tsx`); nothing to change. |
| Signed-out pages | — | Login and Signup render no `AppearanceSync`; they show whatever the boot script applied from the mirror, or System (design doc §11). |

### 7.4 Phone navigation

| Piece | File | Contract |
| ----- | ---- | -------- |
| Destination list | `src/components/shell/nav-items.ts` | Move `NavItem`, `NAV_ITEMS` (unchanged content and order) and `isActive(pathname, href)` out of `app-nav.tsx`; export them. Add `SECONDARY_NAV_ITEMS = [{ href: "/settings", label: "Settings", icon: Settings }]` used only by the sheet. |
| Desktop rail | `src/components/shell/app-nav.tsx` | Same component, same markup and classes **at md+**. Below md it renders nothing: replace the mobile bottom-bar classes with `hidden` and prefix the existing md classes so the computed md+ result is identical: `className="hidden md:sticky md:top-0 md:block md:h-dvh md:w-56 md:shrink-0 md:border-r md:bg-transparent"` (the `border-t`/`fixed`/`bg-card` mobile classes go away; at md+ they were already overridden). Item `Link` classes: drop the mobile-only `flex-col items-center gap-1 py-3 text-xs` in favor of the current md values as the base (`flex-row gap-3 rounded-md px-3 py-2 text-sm`), keeping `active ? "font-semibold text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"`; `ul` becomes `flex h-full flex-col gap-1 p-3`, `li` loses `flex-1`. Net md+ DOM classes/styles must be equivalent — verified by a computed-style e2e assertion (§14.8) and screenshots. |
| Sheet primitive | `src/components/ui/sheet.tsx` | The stock shadcn/ui `sheet` (new-york) over `Dialog` from the already-installed `radix-ui` package: `Sheet`, `SheetTrigger`, `SheetClose`, `SheetContent` (`side` prop), `SheetHeader`, `SheetTitle`, `SheetDescription`. No new dependency (R13). Close button `size-11` hit area, `aria-label` overridable. |
| Mobile nav | `src/components/shell/mobile-nav.tsx` (client) | Controlled `open` state. Trigger: `Button variant="ghost" size="icon" className="size-11 md:hidden" aria-label="Open navigation"` with `Menu` `size-5`. `SheetContent side="left" className="w-72 max-w-[85vw] p-0"`; header with `SheetTitle` "Overload" (`text-base font-semibold`) + `sr-only` `SheetDescription` "Go to a screen"; `nav aria-label="Primary"` list of `NAV_ITEMS`, divider, `SECONDARY_NAV_ITEMS`. Rows `flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-medium`, active `font-semibold text-primary bg-primary/10` + `aria-current="page"`, else `text-muted-foreground hover:bg-accent hover:text-foreground`. Every link `onClick={() => setOpen(false)}`. `useEffect` closes on `pathname` change. `matchMedia("(min-width: 768px)")` change listener closes when it matches. `onOpenAutoFocus`: focus the active link (fallback: first link). |
| Header | `src/components/shell/app-shell.tsx` | `<header className="sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-border bg-background/95 px-2 backdrop-blur md:static md:z-auto md:h-auto md:justify-between md:gap-0 md:bg-transparent md:px-4 md:py-3 md:backdrop-blur-none"><MobileNav /><OverloadLockup size="sm" /><div className="ml-auto md:ml-0"><AccountMenu /></div></header>` — at md+ this computes to today's `flex items-center justify-between border-b px-4 py-3` (MobileNav renders nothing visible at md+). The comment "Bottom bar on mobile, left rail at md+" is updated. |
| Main padding | `app-shell.tsx` | `<main className="mx-auto w-full max-w-screen-sm flex-1 px-4 py-6">` (drops `pb-24 md:pb-6`; md+ value `pb-6` = `py-6`, unchanged). |
| Thumb-reach bars | `src/components/plan/plan-bits.tsx` (`StickyActions`), `src/components/goals/goal-target-form.tsx`, `src/app/(app)/exercises/page.tsx`, `src/app/(app)/goals/page.tsx`, `src/app/(app)/goals/[goalId]/page.tsx`, `src/app/(app)/gyms/page.tsx` | `fixed inset-x-0 bottom-16` → `fixed inset-x-0 bottom-0`. Everything else (md+ static/hidden behavior, page `pb-24 md:pb-0` that clears the bar) unchanged. The `StickyActions` doc comment is updated. A guard test forbids `bottom-16` in `src/` (§14.9). |

## 8. Data model

**Relationship to existing schema**

| From | Relation | To | Description |
| ---- | -------- | -- | ----------- |
| `Profile.appearance` | column on | `profiles` | the account's appearance preference; no relation |

**Updated model**

```prisma
/// Appearance preference (Personalization & Navigation Polish). System follows the device.
enum Appearance {
  system
  light
  dark

  @@map("appearance")
}

model Profile {
  // … existing fields unchanged …
  /// The account's appearance preference; the only authority (the browser mirror is a first-paint copy).
  appearance Appearance @default(system)
}
```

**Migration** `prisma/migrations/9b_profile_appearance/migration.sql` (sorts after `9_account_ownership_2_enforce`; ASCII only):

```sql
-- Personalization & Navigation Polish: the account's appearance preference.
-- Additive: one enum type and one NOT NULL column with a default, so every
-- existing profile reads 'system' (the default) and nothing else changes.
-- No new table, so no RLS change: profiles already has RLS enabled, no policies.
CREATE TYPE "appearance" AS ENUM ('system', 'light', 'dark');
ALTER TABLE "profiles" ADD COLUMN "appearance" "appearance" NOT NULL DEFAULT 'system';
```

- The ownership triggers from `9_account_ownership_2_enforce` are unaffected (they guard `user_id`, not other columns).
- **RLS:** unchanged and still deny-all; the RLS integration suite must stay green. No policy is added.
- Applied in this run to the embedded test Postgres (integration) and the local Supabase stack only. Production: a human step in the runbook (R5).

**Derived fields**

| Field / Concept | Stored? | Computed From | Notes |
| --------------- | ------- | ------------- | ----- |
| greeting text | no | `DashboardDto`, first name, zone validity, first visit, now, userId | pure `composeGreeting` |
| greeting situation | no | `DashboardDto.kind` + cardio states | §11 mapping |
| first visit | no | `Profile.createdAt`, `LoggedSession` count | R17 |
| `Profile.appearance` | **yes** | lifter's choice | the one stored value this pitch adds |

## 9. Authorization and access control

- **Identity from the session only.** `updateAppearanceAction` takes the appearance value only; the account comes from `requireAccount()`. Any extra argument (e.g. a `userId`) is ignored by construction — the function signature has one parameter and the write uses the acting account.
- **Scoped access.** All reads/writes go through `account.db` (the account-scoped client): `profile.findUnique({ where: { userId: account.userId }, select: { appearance: true } })` and `profile.updateMany({ where: { userId: account.userId }, data: { appearance } })`; `count !== 1` → `DomainError("not_found")`. The scoping layer intersects `userId` regardless (Profile is an owned model), so another account's profile is unreachable.
- **Greeting facts** (`firstName`, `timeZone`, `createdAt`, `loggedSession.count()`) are read through `account.db` — only the acting account's rows.
- **No new route.** The `(app)` layout's `requireAccount()` gate and the proxy's optimistic redirect already cover Today and Settings; the action re-checks via `requireAccount()`.
- **RLS:** unchanged deny-all.
- **Client never holds account data** beyond its own appearance value (and the mirror on its own device).

| Resource | Read | Update |
| -------- | ---- | ------ |
| own `Profile.appearance` | Settings page, `(app)` layout | `updateAppearanceAction` |
| another account's profile | never (not-found by scoping) | never |

## 11. Server actions and server-side functions

```ts
// src/lib/accounts/appearance.ts  (import "server-only")
export async function getAccountAppearance(account: Account, db: AccountDb = account.db): Promise<Appearance>;
//   profile missing → "system" (resolveAccount always creates one; defensive).
export async function updateAppearance(account: Account, raw: unknown, tx?: AccountTx): Promise<Appearance>;
//   !isAppearance(raw) → DomainError("validation_error", "Choose Light, Dark, or System.")
//   scoped updateMany on the acting profile; count !== 1 → DomainError("not_found", "Profile not found.")

// src/app/(app)/settings/actions.ts
export async function updateAppearanceAction(appearance: unknown): Promise<ActionResult<{ appearance: Appearance }>>;
//   requireAccount() → toActionResult(() => updateAppearance(account, appearance), "Couldn't save your appearance. Try again.")
//   on ok: refresh()  (re-renders the (app) layout so AppShell/AppearanceSync/Toaster receive the stored value)
//   Side effects: profiles.appearance for the acting account only. Idempotent (same value → same row).

// src/lib/personalization/greeting-facts.ts  (import "server-only")
export async function getGreetingFacts(account: Account, now?: Date): Promise<{
  firstName: string | null;   // trimmed; empty → null
  timeZoneValid: boolean;     // isValidTimeZone(profile.timeZone) on the RAW stored value
  firstVisit: boolean;        // isoDateInZone(profile.createdAt, zoneOrUTC) === todayIso(zoneOrUTC, now) && loggedSession.count() === 0
}>;

// src/lib/personalization/greeting.ts  (PURE: no Prisma, no React, no server-only, no Date.now())
export type GreetingInput = {
  dashboard: DashboardDto;
  firstName: string | null;
  timeZone: string | null;     // null = unavailable/invalid
  firstVisit: boolean;
  userId: string;
  now: Date;
};
export function greetingSituation(d: DashboardDto): GreetingSituation;
export function timeBand(now: Date, timeZone: string | null): "morning" | "afternoon" | "evening" | "night" | "unknown";
export function isLateNight(now: Date, timeZone: string | null): boolean; // 21:00–03:59 local; false when zone null
export function pickVariant<T>(variants: readonly T[], seed: string): T;  // FNV-1a 32-bit, unsigned modulo
export function composeGreeting(input: GreetingInput): string;
```

**Situation mapping** (`greetingSituation`), from the existing `DashboardDto` (unchanged):

| `DashboardDto` | Situation | Name used |
| -------------- | --------- | --------- |
| `no_plan` | `no_plan` | — |
| `rest`, `cardio` empty | `rest` | — |
| `rest`, cardio present, any entry not logged (`log === null`) | `cardio_planned` | first unlogged entry's `planned.type` |
| `rest`, cardio present, every entry logged | `done_cardio` | first entry's `log.type` |
| `pending` | `planned` | `sessionName` |
| `in_progress` | `underway` | `sessionName` |
| `complete` | `done` | `sessionName` |
| `missed_day` with `below` | map `below` as above | — |
| `missed_day` without `below` | map as `rest` with `missed_day.cardio` (cardio rules above) | — |

The missed day itself never influences the greeting (design principle 2).

**Composition** (`composeGreeting`):

1. `sal = { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening", night: "Hello", unknown: "Hello" }[timeBand]`.
2. `late = isLateNight(now, timeZone) && (situation === "planned" || situation === "underway")`.
3. `family = late ? "late" : situation`; `seed = userId + "|" + localDate + "|" + (firstVisit ? "first:" : "") + family`, with `localDate = isoDateInZone(now, timeZone ?? "UTC")`.
4. Not first visit: pick from the family's full-sentence variants (design doc "Wording library", verbatim). First visit: `pickVariant(["Welcome to Overload, {N}.", "Welcome, {N}."], seed)` + (`no_plan` → nothing; otherwise `" " + clause`), where clause comes from `CLAUSES[late ? "late_" + situation : situation]` — design doc library with the salutation removed (e.g. Planned clauses `{S} is up.` · `{S} today.` · `Today is {S}.`; late Planned `{S} is still up.`; late Underway `{S} is still open.`).
5. Name handling: with a name, `"{Sal}, {N}."` / `"Late session, {N}."`; without one, the `", {N}"` segment is removed (`"Good morning."`, `"Late session."`, `"Welcome to Overload."`, `"Welcome."`).
6. The result contains no `!`, `?`, emoji, or newline; leading/trailing whitespace trimmed; session/cardio names inserted verbatim (they are the lifter's own, already-validated plan text; React escapes them).

All wording lives in one constant table in `greeting.ts`; the design doc's library is the source and the unit test asserts the table equals it.

## 12. Validation rules

| Field | Validation | Error |
| ----- | ---------- | ----- |
| `appearance` (action input) | exactly `"system"`, `"light"`, or `"dark"` (`isAppearance`) | `validation_error`, message "Choose Light, Dark, or System." |
| mirror value (boot script / applier read) | same set; anything else ignored (System) | none (silent) |
| stored timezone (greeting) | `isValidTimeZone`; invalid → time-neutral greeting | none |

No raw Prisma error leaks: `toActionResult` maps unknown errors to the friendly message.

## 13. UI data contracts

```ts
type Appearance = "system" | "light" | "dark";

// (app) layout → AppShell
type AppShellProps = { appearance: Appearance; children: ReactNode };

// Settings page → AppearanceSetting
type AppearanceSettingProps = { initial: Appearance };

// Today: greeting is a string rendered by the server component; no DTO crosses to the client.
type GreetingSituation = "planned" | "underway" | "cardio_planned" | "done" | "done_cardio" | "rest" | "no_plan";
```

## 14. Testing strategy

Priorities for this pitch: account isolation of the new stored value first (standing invariant #1), then greeting correctness at time/zone boundaries, then appearance application and persistence, then navigation behavior and desktop invariance. Every standing invariant suite (guide D4) must stay green; no assertion is weakened.

### 14.1 Security / isolation (integration, embedded Postgres — first)

```text
GIVEN accounts A (appearance dark) and B
WHEN B calls updateAppearance(B, "light")
THEN only B's profile changes; A stays dark (read with the raw test client)

GIVEN A and B
WHEN B's scoped client runs profile.updateMany({ where: { userId: A }, data: { appearance: "light" } })
THEN count = 0 and A is unchanged

GIVEN A (light) and B (never chosen)
THEN getAccountAppearance(B) = "system" and getAccountAppearance(A) = "light"

GIVEN A with sessions/history and a profile name, B fresh
THEN getGreetingFacts(B) reports B's own first name/firstVisit and never A's (A's history does not make B "not first visit")
```

- `tests/integration/isolation/profile.int.test.ts` gains these cases (Profile is already registered in `coverage.ts`; the new column needs no new registration, but the file's header lists it).
- Account deletion suite: unchanged and green (the column goes with the row).

### 14.2 Schema / migration (integration)

- `schema.int.test.ts`: `profiles.appearance` exists, `NOT NULL`, default `'system'`, type `appearance` with exactly `{system, light, dark}`; RLS still enabled on every table with zero policies (existing suite).
- A profile created without `appearance` reads `system`.
- Migration is ASCII-only (existing guard if present; otherwise added).

### 14.3 Greeting (unit, pure — `tests/unit/greeting.test.ts`)

```text
Situation mapping: every DashboardDto kind (incl. missed_day with/without below, cardio-only pending/logged, multiple cardio entries) → expected situation
Time bands at boundaries in America/Chicago: 03:59 night, 04:00 morning, 11:59, 12:00, 16:59, 17:00, 20:59, 21:00, 23:59, 00:00
Late night: pending/underway at 21:00 and 03:59 → late family; 20:59 and 04:00 → not; done/rest/no_plan/cardio at 22:00 → never late
Server-zone independence: the same instant gives different bands for Pacific/Kiritimati (UTC+14) vs Pacific/Pago_Pago (UTC−11); result independent of process.env.TZ (test sets TZ to two values)
DST: America/New_York 2026-03-08 and 2026-11-01 local-hour boundaries
Missing timezone: timeZone null → "Hello" salutation, never late, clause from situation
Missing first name: no ", " fragment, no double spaces, all families
First visit: no_plan → "Welcome to Overload, Jordan." or "Welcome, Jordan." with NO clause; planned → welcome + planned clause; late + planned → welcome + "{S} is still up."
Determinism: same input twice → identical; same account+date+family across many `now` values within one band → identical; different date or account → variant may differ (distribution check: all variants reachable over 60 dates)
Stability across a re-render: composeGreeting called twice with now 1 s apart (same band) → identical
Wording rules: every variant in every family, with and without name, contains no "!", "?", emoji (\p{Extended_Pictographic}), or banned words (/let's|crush|you got this|don't forget|time to|you should|suggest|recommend/i)
Never claims done when not done: planned/underway outputs never contain "done" or "logged"; rest/no_plan outputs never contain a session name
Library equality: the wording table equals the design doc library (asserted against a copy in the test)
```

### 14.4 Greeting facts (integration)

- `firstVisit` true for a profile created "today" in its zone with no logged sessions; false the next local day; false once any `LoggedSession` exists (even in progress); zone boundary: profile created at 23:30 local, `now` 00:10 next day → false.
- `timeZoneValid` false for a stored invalid zone (written with the raw test client), true for UTC.
- `firstName` trimmed; empty/null → null.

### 14.5 Appearance (unit)

- `isAppearance` accepts exactly the three values; rejects `"System"`, `""`, `null`, `1`, objects.
- `updateAppearanceAction` (mocked `requireAccount`, real validation): invalid → `validation_error` and no write; valid → write called with the acting account; ignores any extra argument; calls `refresh()` only on success.
- `applyAppearance` (jsdom-free: a minimal fake `document`/`localStorage` or `@jest-environment jsdom` if already used): dark → `html.dark`, no `light`, metas `#0b0b0c`; light → `html.light`; system → neither class, metas restored per media; mirror written; `localStorage` throwing does not throw.
- Boot script: evaluated against a fake document with mirror `dark` / `light` / `system` / `garbage` / throwing storage → expected classes; never throws.
- `layout.tsx` theme colors come from `THEME_COLORS` (source assertion).

### 14.6 Navigation (unit)

- `isActive` table: `/` only on `/`; `/plan` on `/plan` and `/plan/x/y`; `/planx` not active; `/settings` on `/settings/delete-account`.
- `NAV_ITEMS` order and labels unchanged from `main` (Today, Plan, History, Goals, Exercises, Gyms) — guards "no changes to destinations".

### 14.7 Regression / guards (unit, source scans)

- No `bottom-16` in `src/**` (thumb bars moved; no stale offset).
- No theme toggle outside Settings: `applyAppearance`/`updateAppearanceAction`/`AppearanceSetting` imported only from `src/components/settings/`, `src/components/shell/appearance-sync.tsx`, and `src/lib/appearance/*`.
- No assistant/AI dependency added (`ai`, `@ai-sdk/*`, `openai`, `@anthropic-ai/*` absent from package.json).
- `greeting.ts` imports nothing from Prisma, React, `server-only`, or `next/*`, and calls no `Date.now`/`new Date()`/`Math.random` (pure).
- Existing guards unchanged and green (routes list unchanged — no new route; LoggedSet single write path; scoped access; deletion module; secrets/client bundle).

### 14.8 Local-stack e2e — `e2e/accounts/personalization.spec.ts` (run by `npm run test:e2e:accounts`)

Uses the existing accounts config (local stack only, refuses non-127.0.0.1), creates a temporary account through invite-gated signup in a context with `timezoneId: "America/Denver"`, and deletes it through the app's deletion flow in `afterAll` (same pattern as `lifecycle.spec.ts`). The local stack must have migration `9b` applied (runbook §Local).

1. **Greeting, first visit without a plan** (375×812): heading `h1` reads `Welcome to Overload, Test.` or `Welcome, Test.`; it contains no session name, no "up", "today's", "done"; reload → identical text.
2. **Appearance default + persistence**: html has neither `dark` nor `light`; Settings shows System checked. Choose Dark → html gets `dark` immediately (before navigation); reload → still `dark` with no class change between DOMContentLoaded and load (boot script); a fresh browser context (no mirror) signed in as the same account → `dark` after hydration; choose System with `colorScheme: "dark"` emulated → computed `--background` is the dark token, then `page.emulateMedia({ colorScheme: "light" })` → light token without reload. Choose Light under emulated dark → light token.
3. **Isolation in the browser**: a second temporary account signed in on a separate context sees System (not the first account's Dark).
4. **Phone navigation** (375×812): no `nav[aria-label="Primary"]` visible before opening; no element fixed to the bottom with the six labels; menu button visible; open → dialog with the six links in order + Settings, Today has `aria-current="page"`; click Goals → URL `/goals`, dialog gone; reopen → Escape closes and focus returns to the menu button; reopen → click the scrim closes; at `/settings` reopen → Settings is current. Every thumb bar checked on `/gyms` has `bottom: 0`.
5. **Desktop unchanged** (1280×800): menu button hidden; rail visible with the same six links; rail computed styles (width 224px, sticky, border-right) and header computed padding (`12px 16px`) equal the values asserted from `main`'s classes.
6. **Missing timezone**: set the temporary account's `time_zone` to an invalid value directly in the local DB (test-only, the e2e's own account) → Today loads, heading starts with `Welcome` or `Hello` (no error page).

### 14.9 Visual verification (manual, recorded in the progress file)

Phone 375 and desktop 1280, light and dark, against the preview: Today (no plan/first visit, pending with a plan where available), Settings (three tiles each selected, error state via offline), sheet open on Today and Settings, Gyms thumb bar at the edge, desktop Today/Settings with the rail. 320px Settings tiles fit one row.

## 15. Acceptance criteria

**Greeting (AC-1, PRD edge cases)**
- [ ] Today's first element is an `h1` greeting using the account's first name, for every dashboard state.
- [ ] The situation clause matches today's state: Planned, Underway, Late night (21:00–03:59 local, planned/underway only), Cardio planned, Done (lifting or cardio-only), Rest, No plan, First visit.
- [ ] Time of day uses the account's stored timezone, not the server's.
- [ ] Same account, situation, and local date → same sentence across reloads and re-renders.
- [ ] Missing first name → nameless forms; missing/invalid timezone → `Hello` + situation, no error.
- [ ] First visit without a plan never implies a scheduled workout.
- [ ] No emoji, `!`, `?`, advice, or motivational words in any variant.

**Appearance (AC-2)**
- [ ] Settings shows Appearance with Light, Dark, System; a never-chosen account shows System.
- [ ] Choosing applies to the whole app immediately and persists to the account; reload and another device show it.
- [ ] System follows the device live; Light/Dark override it.
- [ ] A failed save reverts the screen and the tile, with an inline error.
- [ ] One account's choice never changes another's.
- [ ] No appearance control exists anywhere but Settings.

**Navigation (AC-3)**
- [ ] Below 768px: no bottom bar; sticky header with a menu button; the sheet lists the six destinations in order plus Settings; choosing one closes the sheet and navigates; ×, scrim, Escape, and route change close it.
- [ ] Thumb-reach bars sit at the bottom edge.
- [ ] At 768px and up the rail and header are unchanged.

**Standing**
- [ ] Isolation suite, history integrity, RLS, guards, client-bundle scan all green; no new route; no new dependency except none (the `Sheet` uses the installed `radix-ui`).

## 16. Explicit non-goals

- ❌ Assistant, chat, persona, AI text, coaching/motivational copy, emoji. **Permanent** (pitch no-gos).
- ❌ Greeting customization, notifications/reminders. **Permanent for this feature.**
- ❌ More appearance modes, accent/font settings, theme editor, toggle outside Settings. **Permanent for this feature.**
- ❌ Desktop navigation changes; destination changes. **Out of scope.**
- ❌ Onboarding Tour, What's New. **Deferred** to Pitches 11–12 (no guidance ticket in this run — R22).
- ❌ Faster Logging UX. **Deferred** to Pitch 13.
- ❌ Email, password recovery, Resend/SMTP. **Deferred** (R25).
- ❌ Program generation, social features, cardio progression, nutrition. **Permanent.**

## Resolved Decisions

| # | Decision | Rationale | Authority |
| - | -------- | --------- | --------- |
| R1 | Controlling planning docs are the owner's approved multi-user set in `Downloads/` (2026-10-13), as in Pitch 8/9 R1; `docs/planning/` is not edited. | The PRD feature and journey this pitch traces to exist only there. | Pitch 8 R1, Pitch 9 R1 (standing); `.claude/CLAUDE.md` |
| R2 | The UI preview is `docs/previews/10-personalization-navigation-polish-preview.html`, not the run prompt's `-preview.tsx`. | The `overload-ui-design` skill mandates an offline HTML gallery and the owner's recorded feedback says previews are never TSX. | Pitch 9 R18 (standing); skill; owner feedback |
| R3 | **Merge behavior: stop before merge.** The feature PR is left open, green and audited. | Guide D1: stop before merge when a pitch "changes schema on tables that hold user data" — `profiles` gains a column. Merging deploys to production, where the column does not exist until a human applies the migration, and Prisma selects every Profile column, so every authenticated page would fail. The pitch's own §14 defers to the merge rules; the run prompt says not to merge when a protected boundary requires stopping. | Guide D1; pitch §14; run prompt |
| R4 | Appearance is stored as `Profile.appearance`, a Prisma enum `system \| light \| dark`, `NOT NULL DEFAULT 'system'`. No new table. | Standing resolution "stored on the account, system default"; the architecture's Profile is the per-account record; an enum makes invalid values unrepresentable; no table → no RLS surface. | Guide D2 (bucket C, adopted); architecture Profile; spec skill (enums for closed sets) |
| R5 | Migration `9b_profile_appearance` is additive (enum + defaulted column). Applied here only to the embedded test DB and the local stack; production is a human runbook step with a backup first. | Additive and instant; existing rows read System. Runs never apply production migrations. | `.claude/CLAUDE.md` (Autonomous Pipeline Policy, Operator tasks); guide D1 |
| R6 | First paint uses a per-device `localStorage` mirror read by a static inline boot script in the root `<head>`; the profile stays the only authority; an `AppearanceSync` island re-applies the stored value after hydration and on navigation; signed-out pages follow the mirror or System. | Cache Components keeps the root layout static, so the server can't read the account there without making every route dynamic; a cookie would have the same problem. The mirror stores a display preference only, is written only from the stored value or a just-made choice, and is never read by the server, so it is not a cache of application data. Without it a returning device would flash on every load (pitch §9.5). | Pitch §9.5; architecture (Next.js App Router, Cache Components in `next.config.ts`); CLAUDE.md data-access rules |
| R7 | Choosing a tile applies instantly and saves in the background; the last choice wins (sequence guard); on failure the previous confirmed value is re-applied with an inline error; no toast, no Save button. | Design doc Screen 2; keeps screen and stored value from diverging. | Design doc; preview |
| R8 | Make the whole app coherent: the `dark:` variant also matches System-dark; `color-scheme` follows the mode; browser `theme-color` follows explicit choices; Sonner gets `theme={appearance}`. No token values change. | Today `dark:` only fires on `.dark`, so System-dark surfaces are inconsistent (pitch §9.5: "inconsistent visual states across pages"). | Pitch §4.2, §9.5; existing `globals.css` |
| R9 | The pitch's "persistent sidebar" on phones is the code's fixed six-item bottom bar; it is replaced below `md` by a header menu button and a left `Sheet`. The space reclaimed is the bar and its padding. The `md`+ rail is untouched. | That bar is the only persistent phone navigation; PRD/roadmap say "a hamburger that opens the navigation in a sheet instead of a persistent sidebar". Supersedes the skill's "never hide core navigation behind a hamburger" (approved docs outrank skills). | PRD; pitch §4.3; CLAUDE.md authority order (docs > skills) |
| R10 | The sheet lists the six destinations, then Settings in a secondary group; Settings is not added to the desktop rail; the account menu is unchanged at both sizes. | Journey E names Settings among the sheet's destinations; it already exists (account menu), so it is not a new destination; the desktop must not change. | Pitch Journey E, §4.3, §10 |
| R11 | The phone header is sticky (`top-0`, `h-14`, `bg-background/95`, blur); at `md`+ it is today's static header. | Keeps navigation one tap away mid-workout without scrolling back up (pitch §9.8, "must not trap the user"). | Pitch §4.3, §9.8; design doc Screen 3 |
| R12 | Fixed thumb-reach bars move from `bottom-16` to `bottom-0`; Sonner offsets stay (they now clear the bars, not a nav). Safe-area insets / `viewport-fit` are not changed. | The bars were offset only for the removed nav; primary actions stay in thumb reach. Safe-area work is iOS-shell scope. | Design doc Screen 3; skill (thumb reach) |
| R13 | `components/ui/sheet.tsx` is the stock shadcn/ui Sheet over the installed `radix-ui` Dialog — no new npm dependency. | shadcn/ui is the only component system; no library additions without a flag. | CLAUDE.md stack; guide D3 |
| R14 | Greeting situations map from the existing `DashboardDto` per §11 (in-progress → Underway; cardio-only days get Cardio planned / Done; a missed earlier day is ignored, using today's state beneath the prompt). | The pitch requires the existing states and forbids new training logic; the missed-day prompt already owns the past. | Pitch §4.1, §11; design doc |
| R15 | Time bands: morning 04:00–11:59, afternoon 12:00–16:59, evening 17:00–23:59, night 00:00–03:59 ("Hello"). Late-night family 21:00–03:59 applies to Planned/Underway lifting only. | Standing late-night window; cardio isn't a "planned workout" in the resolution's sense and stays plain. | Guide D2; design doc |
| R16 | Variant pick = FNV-1a 32-bit over `userId|localDate|family` (prefixed `first:` on a first visit), unsigned modulo. | The standing deterministic resolution; a stable non-cryptographic hash is enough and needs no dependency. | Guide D2; pitch §9.3 |
| R17 | First visit = `Profile.createdAt` falls on today's local date and the account has no `LoggedSession` rows; no tracking column. | Uses existing data only, avoids a stored flag the Onboarding Tour will define its own state for; an operator-seeded plan doesn't hide the welcome. | Pitch §4.1, §9.4, §9.9 |
| R18 | "Timezone not available" = the stored zone fails `isValidTimeZone` → `Hello` salutation, no late-night family; the clause still follows the dashboard (which already falls back to UTC). A stored `UTC` counts as known. | `time_zone` is NOT NULL, so "missing" can only be unusable; UTC can't be told apart from a choice. | PRD edge case; Multi-User Foundation (UTC fallback) |
| R19 | A missing first name drops the name and its comma. | The original account has no name until set in Settings (Accounts R10). | Accounts R10; design doc |
| R20 | The greeting is computed in the Today server component with one `now`; no client code. | Guarantees no hydration difference and no flicker. | Pitch §8 roadmap conditions |
| R21 | The wording library is a constant table in `src/lib/personalization/greeting.ts`, asserted equal to the design doc's library in a unit test. | One source; copy changes go through the design doc. | Design doc |
| R22 | No onboarding/release-notes guidance ticket. | The Onboarding Tour and What's New don't exist yet; the run prompt says so. | Run prompt; `.claude/CLAUDE.md` (User guidance) |
| R23 | Four tickets in build order: phone navigation → appearance → greeting → local-stack e2e + verification. | Coherent end-to-end slices; navigation first because it needs no schema and touches the most files; e2e last because it exercises all three. | Run prompt step 6 |
| R24 | The root `CLAUDE.md` (stale, single-user) and the owner's uncommitted `.claude/CLAUDE.md` are not edited or staged; the repo-root backup dump is never staged. | Owner files; Pitch 9 R22. | Pitch 9 R22 (standing) |
| R25 | Nothing email-related is restored; the planning docs' recovery/SMTP text is an upstream amendment. | Pitch §13; run prompt "Email scope". | Pitch §13; run prompt |
| R26 | Local-stack verification substitutes for "verify on a preview deployment": there are no DB-backed previews, and this pitch writes no logged history. | Previews don't reach a database; the guide's preview rule targets history writes. | Pitch 9 report §7 item 9 (standing) |

## 17. Open questions

None blocking. Non-blocking, carried to the run report:

1. **Greeting copy review** — the wording library (design doc) is a bucket-C default for the owner to adjust; changing it is a constant-table edit plus the test copy.
2. **Production order of operations** — the migration must be applied to production before the feature branch is merged (runbook). Whether Multi-User Foundation's production verification has been recorded is unknown to the run (Pitch 9 open question 3).

## 18. Future considerations

- Onboarding Tour (Pitch 11) can anchor steps to the stable `aria-label="Open navigation"` button and the sheet's `nav[aria-label="Primary"]` on phones, and to the rail at `md`+; its own state lives in `TourProgress`, not in the greeting's first-visit rule.
- The iOS shell inherits the phone header and sheet; safe-area insets belong there.
- A later "Change password" form would sit in Settings beside Appearance.
