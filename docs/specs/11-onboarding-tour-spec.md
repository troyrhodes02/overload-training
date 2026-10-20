---
version: 1.1.0
status: approved
author: Autonomous pipeline run (Claude Code), 2026-10-20
last_updated: 2026-10-20
pitch_reference: pitches/11-onboarding-tour.md (Linear doc a4dd8ae6-8faf-4407-8f56-5ab2331e4e3b)
design_reference: docs/design/11-onboarding-tour-design-doc.md (v1.0)
preview_reference: docs/previews/11-onboarding-tour-preview.html (v1.0 — binding visual contract)
prd_reference: owner's multi-user PRD (Downloads/prd (1).md) → Onboarding Tour; repo docs/planning/prd.md is the stale single-user copy (R1)
architecture_reference: owner's multi-user Architecture (Downloads/architecture (1).md) → Data model: TourProgress; Open Questions: "the shape and location of the tour step registry"
linear_issue: milestone "Onboarding Tour" (Overload V1) — tickets listed in docs/runs/11-onboarding-tour-progress.md
---

# Onboarding Tour — Technical Specification

## 2. Summary

Onboarding Tour adds one guided tour over the real authenticated interface. The tour is a **client-side overlay driven by data**: an ordered registry of steps (`src/lib/tour/steps.ts`) names, for each step, the route it lives on, the on-screen controls it can point at (by a stable `data-tour` anchor name, in priority order), and its copy. A single mechanism (`TourProvider` + `TourOverlay`, plus a pure engine) walks that list: it navigates to each step's route with the app's own router, finds the first anchor that is actually visible at the current width, draws a spotlight over it, and shows a card with Next / Back / Skip tour / Done. A step with no visible anchor is skipped. Nothing in the mechanism knows what any step says or where it points.

Per-account state is a new owned model, `TourProgress` (one row per account, the architecture's data object). A brand-new account's row is created **due** (never offered, no outcome) when its profile is established at signup. `offeredAt` is set when the automatically started tour first appears, and `outcome` + `outcomeAt` record whether the latest run was finished or skipped, and when. The (app) layout reads one boolean, *auto-start?* = the row is due, and hands it to the provider, so the tour opens by itself once, ever. Migration 9d only creates the (empty) table: accounts that exist when it runs have no row, so they are never due. That is how pre-existing accounts are "treated as already offered", with no backfill and no invented outcome (R6, amended in OVE-51). Settings gains a Tour section whose **Replay tour** button starts the same tour; replays record their outcome (creating the row for an older account) but never re-arm the automatic offer.

"Working" means: a brand-new account's first page opens the tour; finishing, skipping, or abandoning it means it never opens by itself again; an account that existed before the migration is never auto-toured; Replay tour works for everyone at any time; at 375px and 1280px every step points at a control that is really on screen (rail item on desktop, heading or menu button on a phone) or is skipped; one account's tour state is invisible to and unchangeable by another; and a new step can be added by editing the registry (plus putting its `data-tour` attribute on the target element) with no change to the mechanism.

## 3. Problem

- The app cannot yet tell a new friend what Today, Plan, History, Goals, Gyms, and Settings are for. The owner has to explain it in person (pitch §1).
- The app cannot yet remember anything about an account's first experience. There is no per-account state for "has this lifter been shown around?" (PRD data object *Tour Progress*).
- The app cannot yet point at a control in a way that survives the two navigation layouts: the md+ rail and the phone menu button + sheet (Pitch 10).
- There is no mechanism later pitches can extend, so the `overload-onboarding` skill has nothing to add steps to (roadmap: "Steps are data in a registry").

## 4. Scope and non-scope

### In scope

- `TourProgress` model + migration `9d_tour_progress` (empty table, RLS deny-all, ownership trigger); a new account made due at signup (`establishProfile`).
- Server module `src/lib/tour/progress.ts` (read auto-start, record offer, record outcome) and server actions `markTourOfferedAction`, `recordTourOutcomeAction`.
- Account deletion and the isolation coverage registry extended to the new owned model.
- The registry (`src/lib/tour/steps.ts`) with the eight initial steps of design doc Screen 2, the pure engine (`src/lib/tour/engine.ts`), the DOM anchor helpers (`src/lib/tour/dom.ts`).
- `TourProvider`, `TourOverlay` (spotlight + card), `ReplayTourButton`; mounting in `AppShell`; `data-tour` anchors on the existing targets; the Settings Tour section.
- Unit, integration, and local-stack e2e tests (§14), including the standing D4 test "every tour step's anchor exists on its screen at phone and desktop widths".

### Out of scope

- **What's New** (release notes, modal, page, `ReleaseSeen`): Pitch 12. The registry is not a release-notes store.
- Any guidance ticket or release-note entry (R26).
- A tour stop for Exercises (design doc §5 decision; addable later as data).
- Tooltips, contextual hints, help bubbles, video, per-feature tutorials, AI onboarding (pitch §7).
- Any change to the rail, the phone sheet, or Settings beyond the Tour section (pitch §7).
- Any sample, seeded, or fabricated training data (pitch §7, §9.4).
- A URL/deep-link way to open the tour (R20).
- Email, analytics, third-party services, a third-party tour library (pitch §7, guide D2).

**Temptations named (guide D3):** adding a third-party tour library; hardcoding steps into the tour component; restarting the tour for accounts that finished it; anchoring a step to a control that is hidden at phone width. Each is prevented structurally: no new dependency (R14), the mechanism reads steps only from the registry and a guard test forbids step ids in mechanism files (§14.1), auto-start is a server-side "row is due" check that nothing re-arms (R5), and anchor resolution requires visibility (R10).

## 5. Core concepts

| Concept | Description |
| ------- | ----------- |
| `TourProgress` | **Persisted, owned.** One row per account (PK = `userId`), created *due* by `establishProfile` at signup (or by an older account's first replay). `offeredAt` = when the auto-started tour first appeared; `outcome` (`completed` / `skipped` / `NULL`) and `outcomeAt` = the latest finished-or-skipped run (first-run or replay). Never deleted except by account deletion. |
| Due / auto-start | **Derived on read**: `true` iff the acting account's row exists with `offeredAt` and `outcome` both `NULL`. No row (an account older than the tour) → `false`. Read by the (app) layout once per request. |
| Offer | Spending the offer = setting `offeredAt` on a due row. Done by the client the first time the auto-started tour shows a step. |
| Outcome | `completed` when the lifter presses Done on the last shown step (or the last step is skipped for a missing target); `skipped` on Skip tour, Escape, or a browser navigation the tour did not make. Latest run wins. |
| Tour step | Registry entry: `id` (stable), `route`, optional `layout` (`phone` / `desktop`), `targets` (ordered anchor candidates, each with an optional body override), `title`, `body`. Pure data. |
| Anchor | A `data-tour="<name>"` attribute on an existing element. Names are the `TourAnchor` union in the registry file. |
| Available anchor | An element with that attribute that is connected, has a non-empty client rect, is not `visibility:hidden`, and is not inside an `[inert]` or `[aria-hidden="true"]` subtree. First available candidate wins. |
| Layout | `phone` below 768px (Tailwind `md`), else `desktop`. Steps with a `layout` are offered only at that layout. |
| Origin | The pathname when the tour started. Done navigates back to it. |

Invariants:

- The tour never writes training data. Its only writes are the two actions on `TourProgress`, and both are scoped to the acting account.
- The mechanism (`engine.ts`, `dom.ts`, `src/components/tour/*`) contains no step ids, routes, anchor names, or copy. They come only from the registry.
- `userId` on `TourProgress` is required, immutable (trigger), and references `profiles(user_id)` with `Restrict`.

## 6. States and lifecycle

```text
TourProgress (per account)
  (no row)  ──signup (establishProfile)──► due {offeredAt: NULL, outcome: NULL}
  (no row)  accounts older than the tour stay here: never due, never auto-toured
  due       ──auto-start shows a step────► offered {offeredAt: now}               [markTourOffered]
  any/none  ──Done / last-step-skip──────► {outcome: completed, outcomeAt: now}   [recordTourOutcome; upsert]
  any/none  ──Skip / Escape / nav────────► {outcome: skipped,   outcomeAt: now}   [recordTourOutcome; upsert]
  row       ──(nothing)──────────────────► (no row)  never, except account deletion
```

| From | To | Allowed? | Side effects |
| ---- | -- | -------- | ------------ |
| no row | due | yes: a new account's profile is established at signup | auto-start `true` |
| due | offered | yes: first auto-started step shown | auto-start `false` from the next request on |
| any / no row | outcome set | yes: every finished or skipped run, replays included (creates the row for an older account) | `outcomeAt` = now; auto-start stays or becomes `false` |
| row | no row | only via account deletion | — |

Client tour state (not persisted):

```text
closed ──start(auto | replay, from?)──► navigating ──target found──► showing
showing ──Next/Back (same route)──► showing
showing ──Next/Back (other route)──► navigating
navigating ──timeout / no available target──► (skip in direction) navigating | finished
showing ──Done──► closed (+ completed, navigate to origin)
any ──Skip / Escape / foreign navigation──► closed (+ skipped, stay)
```

There is no destructive transition, so there is no confirmation dialog (design doc §8).

## 7. UI integration

The design doc and the **preview are binding** for hierarchy, copy, controls, states, and responsive behavior. This section maps them to code.

### Screens and surfaces

| Surface | Data needed | Actions |
| ------- | ----------- | ------- |
| `TourOverlay` on any (app) route | current step (from registry), resolved target element and rect, position/total, layout | Next, Back, Skip tour, Done |
| Settings → Tour section (`/settings`) | none | Replay tour → `tour.start({ source: "replay" })` |
| (app) layout | `autoStart: boolean` from `getTourAutoStart(account)` | — |

### Components

| Component | File | Contract / notes |
| --------- | ---- | ---------------- |
| `TourProvider` | `src/components/tour/tour-provider.tsx` (client) | Props `{ autoStart: boolean; steps?: readonly TourStep[]; children }` (`steps` defaults to `TOUR_STEPS`; injectable for tests). Context `useTour(): { start(opts?: { from?: string }): void; active: boolean }`. Auto-starts once per mount when `autoStart` is true (a ref guards repeat renders). Owns the client state machine (§6). Calls the two server actions. |
| `TourOverlay` | `src/components/tour/tour-overlay.tsx` (client) | Renders nothing when closed. Open: shadcn `Dialog` (`modal`), `DialogContent` with `showCloseButton={false}`, a transparent overlay, and the `Spotlight`. `onInteractOutside` / `onPointerDownOutside` → `preventDefault()` (a scrim click does nothing). `onEscapeKeyDown` → skip. |
| `TourCard` | inside the overlay | Counter (`{position} of {total}`, `sr-only` "Step "), `DialogTitle`, `DialogDescription` (or a one-line `Skeleton` while navigating), Skip tour (`variant="ghost"`, `mr-auto`), Back (`variant="outline"`, hidden at position 1), Next/Done (default). Buttons `h-11 md:h-9`. Phone: `fixed inset-x-4 bottom-4`; desktop: `w-80`, `style={{ top, left }}` from `placeCard`. Below 360px: Skip tour on its own row (`basis-full`), Back/Next right-aligned (preview §05 "Narrow phone"). |
| `Spotlight` | inside the overlay | `fixed`, `aria-hidden`, `pointer-events-none`, the target rect inflated by `TOUR_SPOTLIGHT_PADDING_PX` (6), `rounded-lg ring-2 ring-primary`, `box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.5)` for the scrim. Hidden while navigating (a plain `bg-black/50` layer instead). `transition-[top,left,width,height] duration-200 motion-reduce:transition-none`. |
| `ReplayTourButton` | `src/components/tour/replay-tour-button.tsx` (client) | `Button variant="outline" className="h-11 md:h-9"`, Lucide `RotateCcw` `size-4`, label "Replay tour", `data-tour="settings-replay"`. Calls `useTour().start()`. Focus returns to it when a replay it started closes. |

### Anchors placed on existing elements (no visual change)

| Anchor | Element | Notes |
| ------ | ------- | ----- |
| `today-heading` | `TodayHeader`'s `<header>` (`src/app/(app)/page.tsx`) | every dashboard state |
| `today-start` | the Start/Resume workout `Button` in `TodayBlock` | only rendered for pending / in-progress; inside the `inert` missed-day wrapper it is unavailable by rule (R10) |
| `today-day` | the focal card of each non-pending state: no-plan card, rest card, cardio-only focal block, complete block, missed-day prompt wrapper | one per render |
| `nav-menu` | `MobileNav`'s trigger `Button` | `md:hidden` → unavailable at md+ |
| `nav-plan`, `nav-history`, `nav-goals`, `nav-gyms` | the matching `Link` in `AppNav` (the md+ rail) only | rail is `hidden md:block` → unavailable below md. Added from a `tourAnchor` field on `NavItem` so `nav-items.ts` stays the one list |
| `page-plan`, `page-goals`, `page-gyms` | the page `h1` (all states) | |
| `page-history` | the History page's top element in each state (no-plan block / week header row) | History has no `h1`; none is added (no redesign) |
| `settings-replay` | `ReplayTourButton` | |

The attribute is written through `tourAnchor(name)` → `{ "data-tour": name }` (typed by `TourAnchor`), so a misspelt anchor is a type error.

### shadcn/ui integration

- **No new dependency.** `Dialog`, `Button`, `Skeleton`, and Sonner exist. `radix-ui` is already installed. No `popover` component is needed, because placement is a pure function (R15).
- Focus: `DialogContent` `onOpenAutoFocus` → focus the primary button (Next/Done). Each step change re-focuses it. On close, focus goes to the replay button if the replay started there, otherwise `document.body` (top of page).
- Tokens: `bg-popover text-popover-foreground border-border`, `text-muted-foreground`, `ring-primary`; scrim `black/50` (as `DialogOverlay`). No progress/deload colors.
- `prefers-reduced-motion`: no fade (`motion-reduce:animate-none`) and no spotlight transition.

### Forms and validation
None in the UI. The only input crossing to the server is the outcome literal (§12).

## 8. Data model

### Relationship to existing schema

| From | Relation | To | Description |
| ---- | -------- | -- | ----------- |
| `TourProgress.userId` | 1–0..1 | `Profile.userId` | One row per account; `onDelete: Restrict` (account deletion removes it first) |

### New model and enum

```prisma
/// Latest finished-or-skipped outcome of the onboarding tour (Onboarding Tour).
enum TourOutcome {
  completed
  skipped

  @@map("tour_outcome")
}

/// Per-account onboarding tour progress (Onboarding Tour; architecture data
/// object TourProgress). Created DUE when a new account's profile is
/// established at signup; the tour opens by itself only while due (offeredAt
/// and outcome both NULL). Accounts older than the tour have no row (a replay
/// creates one). Never deleted except by account deletion.
model TourProgress {
  /// Owning account (also the key: one row per account). Immutable (trigger).
  userId    String       @id @map("user_id") @db.Uuid
  /// When the automatically started tour first appeared (the offer is spent).
  offeredAt DateTime?    @map("offered_at") @db.Timestamptz
  /// NULL until a run is finished or skipped.
  outcome   TourOutcome?
  outcomeAt DateTime?    @map("outcome_at") @db.Timestamptz
  /// When the row was created (signup, or an older account's first replay).
  createdAt DateTime     @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime     @updatedAt @map("updated_at") @db.Timestamptz

  profile Profile @relation(fields: [userId], references: [userId], onDelete: Restrict, onUpdate: Restrict)

  @@map("tour_progress")
}
```

`Profile` gains the back-relation `tourProgress TourProgress?`. The primary key is the `userId` index (no separate `@@index` needed).

### Migration `9d_tour_progress` (ASCII only)

```sql
CREATE TYPE "tour_outcome" AS ENUM ('completed', 'skipped');

CREATE TABLE "tour_progress" (
    "user_id" UUID NOT NULL,
    "offered_at" TIMESTAMPTZ,
    "outcome" "tour_outcome",
    "outcome_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "tour_progress_pkey" PRIMARY KEY ("user_id"),
    -- an outcome always carries its time, and a time never stands alone
    CONSTRAINT "tour_progress_outcome_at_check" CHECK (("outcome" IS NULL) = ("outcome_at" IS NULL))
);

ALTER TABLE "tour_progress" ADD CONSTRAINT "tour_progress_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Deny-all: no policies. Prisma bypasses RLS; the Data API sees nothing.
ALTER TABLE "tour_progress" ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER "tour_progress_user_id_immutable" BEFORE UPDATE OF "user_id" ON "tour_progress"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
```

- It is additive: a new enum and a new, **empty** table. No existing table or column changes, and no row is written. The standing migration-safety guard forbids `INSERT` in any migration, and this codebase never writes data from a migration (R6). Every account that exists when 9d runs therefore has no row and is never due.
- `overload_same_owner` triggers don't apply, because the table has no foreign key to another owned parent besides `profiles`, and that one is the owner itself.
- The column checks in `schema.int.test.ts` (no stored tag/e1RM, `userId` on every owned model) cover it automatically through DMMF.

### Row-level security

```sql
ALTER TABLE "tour_progress" ENABLE ROW LEVEL SECURITY;
-- Deny-all. Do not add policies for anon or authenticated.
```

### Derived fields

| Field / Concept | Stored? | Computed From | Notes |
| --------------- | ------- | ------------- | ----- |
| auto-start | no | the acting account's `TourProgress` row is due (`offeredAt`, `outcome` NULL) | read per request in the (app) layout |
| step position / total | no | registry filtered by layout, minus steps skipped this run | client only |
| resolved target | no | DOM at the moment the step shows | client only |

## 9. Authorization and access control

- Every surface is inside the authenticated (app) layout (`requireAccount()`). Login and signup don't mount the provider.
- Both actions call `requireAccount()` first. The acting account comes from the auth session only, and **neither action accepts an account id**. `recordTourOutcomeAction` takes only the outcome literal.
- All reads and writes go through `account.db` (the account-scoped client). `TourProgress` has a `userId` scalar, so `scopeArgs` scopes it automatically: reads intersect `userId = acting`, creates are stamped, and upserts are scoped. In `src/lib/tour/progress.ts`, the only `userId` token is `account.userId`, which the isolation guard requires.
- Another account's row is unreachable: a scoped `findUnique({ where: { userId: other } })` returns null (not-found semantics). The UI never displays tour state, so nothing can be inferred from it.
- RLS is deny-all on `tour_progress`, and `rls.int.test.ts` covers every table.
- Access per resource: `TourProgress` is read (own), created/updated (own), and deleted only by the account-deletion module (own).

## 10. Storage model
Not touched.

## 11. Server actions and module surface

### `src/lib/tour/progress.ts` (server-only)

```ts
import "server-only";
import { cache } from "react";
import type { Account } from "@/lib/data/account";
import type { AccountTx } from "@/lib/data/account-db";

export type TourOutcomeValue = "completed" | "skipped";
export function isTourOutcome(v: unknown): v is TourOutcomeValue;

/** True iff the acting account's row is due (offeredAt and outcome NULL). React-cached per request. */
export const getTourAutoStart: (account: Account) => Promise<boolean>;

/** Spends the acting account's due offer. Idempotent; a no-op with no row or an already spent offer. */
export async function markTourOffered(account: Account, tx?: AccountTx): Promise<{ spent: boolean }>;
// implementation: account.db.tourProgress.updateMany({
//   where: { userId: account.userId, offeredAt: null }, data: { offeredAt: now } }) → count === 1

/** Upserts the latest outcome for the acting account. Throws DomainError("validation_error") on a bad literal. */
export async function recordTourOutcome(account: Account, raw: unknown, tx?: AccountTx): Promise<TourOutcomeValue>;
// implementation: account.db.tourProgress.upsert({
//   where: { userId: account.userId },
//   create: { userId: account.userId, offeredAt: now, outcome, outcomeAt: now },
//   update: { outcome, outcomeAt: now } })

// src/lib/data/account.ts: establishProfile (signup only) gains, as its LAST step and best effort
// (logged, never thrown, so signup never compensates a complete account over it):
//   db.tourProgress.createMany({ data: [{ userId: user.id }], skipDuplicates: true })   // due
```

### `src/app/(app)/tour-actions.ts` (`"use server"`)

It's a file, not a folder: a folder under `(app)` would be a route, and the routes guard lists only real screens.

```ts
export async function markTourOfferedAction(): Promise<ActionResult<{ spent: boolean }>>;
// requireAccount(); toActionResult(() => markTourOffered(account), "Couldn't save your tour progress.")
// Side effects: sets offeredAt on the acting account's due row (if any). No refresh().

export async function recordTourOutcomeAction(outcome: unknown): Promise<ActionResult<{ outcome: TourOutcomeValue }>>;
// requireAccount(); toActionResult(() => recordTourOutcome(account, outcome), "Couldn't save your tour progress.")
// Side effects: upserts outcome + outcomeAt for the acting account only. No refresh().
```

There's no `refresh()`, because the client already knows the tour has closed. The next server render reads `autoStart = false`, and the provider's per-mount guard stops a stale `true` from re-opening it.

### Error format
`ActionResult` from `src/lib/actions/result.ts`. `validation_error` covers a bad outcome. Any other failure becomes `toActionResult`'s generic error, and internals are never exposed. The client shows the toast `Couldn't save your tour progress. It may open again next time.` only for a failed outcome save (R22).

### Layout integration

```ts
// src/app/(app)/layout.tsx
const account = await requireAccount();
const [appearance, tourAutoStart] = await Promise.all([
  getAccountAppearance(account),
  getTourAutoStart(account),
]);
return <AppShell appearance={appearance} tourAutoStart={tourAutoStart}>{children}</AppShell>;
// AppShell wraps its content in <TourProvider autoStart={tourAutoStart}> and renders <TourOverlay/>.
```

### Account deletion
`ACCOUNT_DELETION_ORDER` gains `"TourProgress"` immediately before `"Profile"`, with `TourProgress: (tx) => tx.tourProgress.deleteMany({})`, scoped as every entry is. The deletion result counts it.

## 12. Validation rules

| Field | Validation | Error |
| ----- | ---------- | ----- |
| `outcome` (recordTourOutcomeAction) | exactly `"completed"` or `"skipped"` | `validation_error` "Unknown tour outcome." |
| any account id in input | not accepted. The actions take no id | — |
| registry (unit-tested, not runtime) | unique `id`s; every `targets` non-empty; every `route` starts with `/`; every anchor in `TOUR_ANCHORS`; `layout` ∈ {phone, desktop, undefined}; title and body non-empty and free of emoji | test failure |

## 13. UI data contracts

```ts
// src/lib/tour/steps.ts — THE REGISTRY (data only)
export const TOUR_ANCHORS = [
  "today-heading", "today-start", "today-day", "nav-menu",
  "nav-plan", "nav-history", "nav-goals", "nav-gyms",
  "page-plan", "page-history", "page-goals", "page-gyms",
  "settings-replay",
] as const;
export type TourAnchor = (typeof TOUR_ANCHORS)[number];

export type TourTarget = { anchor: TourAnchor; body?: string };
export type TourStep = {
  id: string;                         // stable; never changes with the copy
  route: string;                      // pathname the step lives on
  layout?: "phone" | "desktop";      // offered only at this layout
  targets: readonly [TourTarget, ...TourTarget[]]; // priority order; first available wins
  title: string;
  body: string;                       // default body; a target's body overrides it
};
export const TOUR_STEPS: readonly TourStep[] = [ /* design doc Screen 2, verbatim */ ];
export function tourAnchor(name: TourAnchor): { "data-tour": TourAnchor };
```

```ts
// src/lib/tour/engine.ts — PURE (no DOM, no React)
export type TourLayout = "phone" | "desktop";
export function stepsForLayout(steps: readonly TourStep[], layout: TourLayout): TourStep[];
export function resolveTarget(step: TourStep, isAvailable: (a: TourAnchor) => boolean):
  { anchor: TourAnchor; body: string } | null;
export function startIndex(steps: readonly TourStep[], from?: string): number; // unknown id → 0
export function counter(offered: number, skipped: number, index: number, skippedBefore: number):
  { position: number; total: number };
export type Rect = { top: number; left: number; width: number; height: number };
export function placeCard(target: Rect, card: { width: number; height: number },
  viewport: { width: number; height: number }, prefer: "right" | "below"): { top: number; left: number };
// constants
export const TOUR_TARGET_TIMEOUT_MS = 5000;
export const TOUR_SPOTLIGHT_PADDING_PX = 6;
export const TOUR_CARD_GAP_PX = 12;
export const TOUR_VIEWPORT_MARGIN_PX = 16;
export const TOUR_DESKTOP_QUERY = "(min-width: 768px)";
```

```ts
// src/lib/tour/dom.ts — browser helpers (no React)
export function findAvailableAnchor(name: TourAnchor, doc?: Document): HTMLElement | null;
export function isAvailable(el: Element): boolean; // connected, rect > 0, not visibility:hidden, not in [inert]/[aria-hidden=true]
export function waitForTarget(step: TourStep, opts: { timeoutMs: number; signal: AbortSignal }):
  Promise<{ el: HTMLElement; anchor: TourAnchor; body: string } | null>; // polls every 50ms (requestAnimationFrame-throttled)
```

`placeCard` rules (R15): `prefer: "right"` (rail anchors, `nav-*`) puts the card at `left = target.right + padding + gap` with `top = target.top`. Otherwise the card goes below (`top = target.bottom + padding + gap`) if it fits, else above. `left` aligns with `target.left`. The result is clamped so the card stays at least `TOUR_VIEWPORT_MARGIN_PX` inside the viewport.

## 14. Testing strategy

Risk order (CLAUDE.md): cross-account isolation first, then logged-history integrity (unchanged here, kept green), then this pitch's risks.

### 14.1 Unit (`tests/unit/tour-*.test.ts`, no DB)

```text
Registry (tour-registry.test.ts)
GIVEN TOUR_STEPS WHEN validated THEN ids unique, targets non-empty, routes absolute, anchors ∈ TOUR_ANCHORS,
  copy non-empty, no emoji, layout valid
GIVEN TOUR_STEPS THEN the order and ids are today, logging, navigation, plan, history, goals, gyms, settings and
  the titles/bodies equal design doc Screen 2 verbatim (pinned table)
GIVEN the seven pitch areas THEN each of Today, Plan, logging, History, Goals, Gyms, Settings has a step
GIVEN every anchor in TOUR_ANCHORS THEN some file under src/ (outside src/lib/tour) renders it via tourAnchor("<name>")
  (static scan) — catches an anchor with no target element

Engine (tour-engine.test.ts)
GIVEN layout desktop THEN "navigation" is not offered (7 steps); phone → 8
GIVEN step logging and availability {today-start} THEN target today-start with body (a);
  {today-day} only THEN today-day with body (b); none THEN null
GIVEN step plan and availability {nav-plan, page-plan} THEN nav-plan (first wins); {page-plan} THEN page-plan
GIVEN from="goals" THEN startIndex → index of goals; unknown id THEN 0
GIVEN counter after one skipped step THEN total drops by one and positions stay contiguous
placeCard: right-of-rail; below when room; above when not; clamped inside viewport at 375×667 and 1280×800;
  never overlaps the inflated target rect (property over a grid of target positions)

Extensibility (tour-extensibility.test.ts) — AC-4
GIVEN TOUR_STEPS plus one extra data-only step (new id, route, anchor) inserted after "goals"
WHEN the engine walks it with an availability stub THEN the extra step is visited in order, Back returns to goals,
  and nothing in engine/dom/components was changed (the test imports the same modules)
GUARD: src/lib/tour/engine.ts, src/lib/tour/dom.ts, src/components/tour/** contain no step id, route literal
  of a step, anchor name, or step title from the registry (code only, comments stripped), and only
  tour-provider.tsx imports TOUR_STEPS

Progress module contract (tour-actions.test.ts, mocked account)
GIVEN recordTourOutcomeAction("finished") THEN validation_error; "completed"/"skipped" accepted
GIVEN the actions' source THEN neither takes an id parameter and both call requireAccount first

Standing guards (existing, must stay green): account-isolation-guards (no raw prisma, userId only as account.userId),
  invariant-guards (single LoggedSet write path), deliberate-absences (no new library: package.json gains no dependency)
```

### 14.2 Integration (embedded Postgres)

```text
tests/integration/tour.int.test.ts
GIVEN a new account via establishProfile THEN a due row; getTourAutoStart → true
GIVEN an account with a profile and no row (older than the tour) THEN not due; markTourOffered → spent:false, no row
WHEN markTourOffered on a due row THEN offeredAt set, outcome NULL; auto-start false; second call → spent:false
WHEN recordTourOutcome("skipped") THEN outcome skipped, outcomeAt set; auto-start stays false
WHEN recordTourOutcome("completed") after skipped (a replay) THEN outcome completed, outcomeAt advanced; still false
GIVEN a due row WHEN recordTourOutcome without a saved offer THEN auto-start false
GIVEN an older account (no row) WHEN recordTourOutcome (a replay) THEN row created with offeredAt + outcome; never due
GIVEN a lazy profile raced in WHEN establishProfile THEN exactly one due row
GIVEN outcome set and outcome_at NULL via raw SQL THEN the CHECK refuses it
GIVEN a row WHEN user_id is updated via raw SQL THEN the immutable trigger refuses it
GIVEN a hard delete of the profile while the row exists THEN Restrict refuses it
NO training data: row counts of every other table are unchanged across all tour operations

tests/integration/isolation/tour.int.test.ts (registered in ISOLATION_COVERAGE.TourProgress)
GIVEN A offered+completed and B new WHEN B reads auto-start THEN true (A's row invisible)
WHEN B marks offered / records skipped THEN A's row is byte-identical; B's own row only
GIVEN B's scoped client WHEN findUnique/findMany/count/updateMany/deleteMany on A's userId THEN null / [] / 0 / 0 / 0
GIVEN a create with userId = A through B's client THEN AccountScopeError

tests/integration/isolation/account-deletion.int.test.ts (extended)
GIVEN A and B both with TourProgress WHEN A is deleted THEN A's row gone, B's row intact; counts include TourProgress

Migration rehearsal (tests/integration/tour-migration.int.test.ts, rehearsal support)
GIVEN migrations replayed through 9c with three profiles WHEN 9d applies THEN tour_progress is empty (those
  accounts are never due), RLS enabled with zero policies, the immutable trigger and the outcome CHECK present;
  every other table's row count unchanged

Standing (existing, auto-extended through DMMF): rls.int.test.ts (every table RLS on, 0 policies),
  schema.int.test.ts (userId non-null + indexed on every owned model; no tag/e1RM columns), history-integrity,
  logging (baseline isolation/atomicity), progression (deload separation)
```

### 14.3 E2E — local Supabase stack (`e2e/accounts/tour.spec.ts`, `npm run test:e2e:accounts`)

Temporary accounts only, removed through the app's deletion flow, with the same discipline as `personalization.spec.ts`.

```text
First login (AC-1)          new account → tour opens at "1 of 8" (375) / "1 of 7" (1280) on Today
Play through (AC-1, AC-3)   Next × N visits /, /plan, /history, /goals, /gyms, /settings in order; Done → back on /;
                            reload → no tour; sign out + in → no tour
Skip (AC-1)                 second new account: Skip tour at step 2 → closed, stays on /; reload, re-login → no tour
Abandon                     third new account: tour shown, reload mid-tour → no tour
Escape                      Escape on a step = skip (closed; no re-open on reload)
Replay (AC-2)               Settings → Replay tour (after completion, and after skip) → opens at 1 on /;
                            Done returns to /settings; reload → no tour (replay never re-arms)
D4 anchors (AC-3)           for every step at 375 and at 1280 on an empty account: the shown card's step has an
                            available target; the spotlight rect equals the target's rect (± padding); at 375 no
                            nav-* rail anchor is ever the target, at 1280 nav-menu is never the target
Phone sheet                 at 375 the navigation sheet is closed on every step and after the tour; the menu button
                            works after Done
Overlay leaves nothing      after Done/Skip: no element with role=dialog, page is clickable (Plan link navigates)
Focus/keyboard              Next focused on each step; Tab cycles inside the card; Escape skips
Isolation (e2e)             account A completes; account B (new) still gets the tour; A still doesn't
Pre-existing account        not driven in the browser: the e2e never writes rows by SQL and never signs in as the
                            local stack's existing account. That 9d leaves them with no row is proven by the migration rehearsal (14.2);
                            the e2e proves the consequence — an account that has a row is never auto-toured.
```

### 14.4 Visual vs preview
Screenshots at 375 and 1280, light and dark: step 1 (new account), step 2 (b), step 3 (phone), step 4 (both widths), step 8, the Settings Tour section, and loading between screens. Compare hierarchy, copy, controls, and tokens with `docs/previews/11-onboarding-tour-preview.html`.

### 14.5 Regression
The existing default e2e (`npx playwright test`) and accounts e2e stay green. Personalization's phone-sheet tests now run with the tour closed: their temporary accounts are new, so the tour auto-starts, and the specs skip it first through the UI. That's the realistic path. Tests aren't weakened.

## 15. Acceptance criteria

**AC-1 First login**
- [ ] A new account's first authenticated page opens the tour at step 1 on Today.
- [ ] After Done, Skip tour, Escape, a browser navigation, or a reload mid-tour, the tour never opens by itself again for that account (any device, any later sign-in).
- [ ] Completion or skip is stored per account as `TourProgress.outcome` + `outcomeAt`.

**AC-2 Replay**
- [ ] Settings shows a Tour section between Appearance and Delete account with **Replay tour**, for every account.
- [ ] Replay opens the same tour at step 1. Done returns to Settings. Replays never re-arm the automatic offer.

**AC-3 Responsive targets / missing target**
- [ ] At 375px and 1280px every step that's shown highlights an available control on its route. Rail anchors are never used below md, and the menu button is never used at md+.
- [ ] A step with no available target is skipped silently in the direction of travel. The last step missing ends the tour as completed.
- [ ] The phone navigation sheet stays closed throughout. No overlay remains after the tour.

**AC-4 Registry**
- [ ] The steps live only in `src/lib/tour/steps.ts`. A data-only extra step is exercised by a test without mechanism changes. Guard tests forbid step data in mechanism files.

**Rollout**
- [ ] Accounts that exist when migration `9d_tour_progress` runs have no row and are never auto-toured; Replay works for them. Only accounts created through signup afterwards are due.

**Isolation and invariants**
- [ ] `TourProgress` is an owned model: scoped, RLS deny-all, immutable owner, in the isolation registry, and removed by account deletion (only the acting account's row).
- [ ] No training data is created, changed, or deleted by any tour operation.
- [ ] No new npm dependency.

**Visual contract**
- [ ] The implemented card, spotlight, Settings section, and states match the preview at 375 and 1280, light and dark.

## 16. Explicit non-goals

- ❌ Third-party tour library. **Permanent for this pitch** (guide D2 bucket B).
- ❌ What's New / release notes / `ReleaseSeen`. **Deferred** to Pitch 12.
- ❌ Contextual tooltips, help bubbles, per-feature tutorials, video, AI onboarding. **Permanent** (pitch §7).
- ❌ Sample or fabricated data. **Permanent.**
- ❌ Navigation or general Settings redesign. **Permanent** for this pitch.
- ❌ Program generation; social features; cardio progression; dated goals; rest timer; public-product features. **Permanent** (CLAUDE.md).

## Resolved Decisions

Recorded under the Autonomous Pipeline Policy. Authority order: approved planning docs → CLAUDE.md and skills → codebase patterns → judgment.

| # | Decision | Rationale | Authority |
| - | -------- | --------- | --------- |
| R1 | The controlling planning docs are the owner's multi-user set in `Downloads/` (`prd (1).md`, `architecture (1).md`, `pitch-roadmap (1).md`, `product-brief (1).md`). `docs/planning/` stays the stale single-user copy and isn't edited. | Standing since Pitch 8 R1 | Standing resolution; planning docs |
| R2 | The preview is `docs/previews/11-onboarding-tour-preview.html`, not the run prompt's `.tsx`. | Skill rule ("names a `.tsx` file … write the `.html`") and owner feedback | `overload-ui-design`; owner memory; Pitch 9 R18 / Pitch 10 R2 |
| R3 | **Stop before merge to `main`.** | Guide D1 says stop when a pitch "changes schema on tables that hold user data", "changes … signup", or "changes … account deletion". This pitch adds an owned table holding per-account data, makes signup create its row, and extends the deletion module. Merging deploys code that queries `tour_progress`, which production doesn't have until a human applies 9d, and every signed-in page would fail. Same reasoning as Pitch 10 R3. | Guide D1; Pitch 10 R3 precedent; CLAUDE.md (production migrations are human steps) |
| R4 | Persistence is a new owned model `TourProgress` (PK `userId`), not a `Profile` column. | The architecture's data model names TourProgress as its own object ("whether finished or skipped, and when") | Architecture data model; CLAUDE.md data objects list |
| R5 | Auto-start = the acting account's `TourProgress` row is due (`offeredAt` and `outcome` NULL), read server-side in the (app) layout. | One boolean per request. The server decides, so the client can't be talked into or out of it. Nothing re-arms it. | Pitch §4.4/§4.5; judgment |
| R6 | *(Amended in OVE-51.)* A new account is made due by `establishProfile` at signup, as its last step, best effort (logged, never thrown). Migration 9d writes no row, so every account that exists before rollout has none and is never auto-toured. The first draft backfilled rows with an `INSERT` in 9d. That was dropped: the standing migration-safety guard (`invariant-guards`: no `INSERT INTO` in any migration) forbids it, and this codebase never writes data from a migration (Pitch 8 used an operator script). The guard was not weakened. Consequence: accounts created after the migration but before the deploy (by the old signup code) are never due either, which is the strict reading of "existed before rollout". Hand-provisioned accounts (a lazy profile, no signup) are never due. | Standing resolution "treated as already offered", with no backfill, no date constant, and no fabricated outcome | Guide D2 (bucket C, flagged for owner review); pitch §4.6; codebase guard |
| R7 | The outcome is the latest run's (`completed` on Done or a missing last step; `skipped` on Skip/Escape/foreign navigation), and replays update it. | The PRD asks for "whether finished or skipped, and when". The latest is the only answer anyone will want. It never affects eligibility. | PRD data object; pitch Journey C |
| R8 | The offer is spent when the tour first appears (`markTourOfferedAction` sets `offeredAt`), so abandoning (reload, close tab) never re-opens it. | Pitch §9.6: a tour that reappears because the lifter didn't finish is intrusive. Design doc Screen 3 decision. | Pitch §9.6; design doc |
| R9 | The registry is `src/lib/tour/steps.ts` (`TOUR_STEPS`, `TOUR_ANCHORS`, `tourAnchor`). Adding a step = editing that file + putting `tourAnchor(name)` on the target element. | Architecture open question "shape and location of the tour step registry", settled here for the `overload-onboarding` skill | Architecture open question; roadmap; pitch §4.8 |
| R10 | Target availability: connected, non-empty rect, not `visibility:hidden`, not inside `[inert]`/`[aria-hidden=true]`. First available candidate wins. | Makes "a control that exists on the current screen size" structural. `inert` covers the dimmed workout under a missed-day prompt. | PRD AC-3; guide D4 |
| R11 | An optional `layout` on a step (`phone`/`desktop`) filters it before the tour starts. Below 768px is phone. | Stable counter ("1 of 8" / "1 of 7"). The visibility rule still applies as a safety net. | Design doc Screen 1/2; codebase `md` breakpoint (`MobileNav` DESKTOP_QUERY) |
| R12 | The tour navigates with `router.push(step.route)` and waits up to `TOUR_TARGET_TIMEOUT_MS` = 5000 for an available target (polling at 50 ms). After that the step is skipped. | Server-rendered pages can take a moment on a phone network. 5 s is long enough not to skip a slow page and short enough not to hang. | Judgment |
| R13 | A missing target skips silently in the direction of travel. A missing last step finishes as `completed`. Nothing showable closes the tour without recording an outcome. | Design doc Screen 1 error state | PRD edge case; design doc |
| R14 | Presentation is shadcn `Dialog` (Radix, modal) + a spotlight `div` + `Button`/`Skeleton`. No new dependency, no Popover component. | Focus trap, Escape, and aria-modal for free. Standing "shadcn primitives, not a tour library". | Guide D2 (bucket B); pitch §4.9 |
| R15 | Card placement: docked at the bottom on phones. On desktop the pure `placeCard()` places it right of rail targets, otherwise below or above, clamped 16 px inside the viewport. | Thumb-first on phones (design doc). A pure function is unit-testable and needs no floating-UI dependency. | Design doc Screen 1; preview |
| R16 | The tour never opens the phone navigation sheet. Area steps use page headings below md, and step 3 points at the menu button. | Two stacked modals would fight for focus and dismissal. Pitch §12 says nothing may leave the sheet stuck open. | Design doc Screen 2; pitch §4.7/§12 |
| R17 | A pathname change the tour didn't make (browser Back/Forward) ends the tour as `skipped`. | The tour never fights the browser. Treated as a deliberate exit. | Design doc Screen 1 |
| R18 | Done navigates to the origin pathname. Skip stays on the current screen. | Design doc decision | Design doc Screen 3/4 |
| R19 | Exercises is not a tour stop. | Not one of the seven areas, and the phone step names it | Pitch §4.2; PRD |
| R20 | `useTour().start({ from })` can start at a step (for a later What's New entry). There's no URL parameter or deep link. | The `overload-onboarding` skill links entries to steps "where the mechanism supports that". A URL entry point would be a public surface nobody asked for. | `overload-onboarding`; design doc §7 |
| R21 | Module `src/lib/tour/progress.ts` + actions in `src/app/(app)/tour-actions.ts` (a file; a folder would be a route). `markTourOffered` is a scoped `updateMany` on the due row; `recordTourOutcome` is a scoped `upsert`. Both go through `account.db`, and there's no `refresh()`. | Codebase pattern (`lib/accounts/appearance.ts`, settings actions). Both operations are classified by `scopeArgs`. | Codebase |
| R22 | A failed outcome save → error toast `Couldn't save your tour progress. It may open again next time.` A failed offer save is ignored (the outcome save still ends auto-start). | Honest about the consequence. A failed offer shouldn't interrupt the tour. | Design doc §8 |
| R23 | The Settings Tour section sits between Appearance and Delete account and holds: h2 "Tour", one line, and an outline **Replay tour** with `RotateCcw`. | Design doc Screen 4 / preview §04 | Design doc; preview |
| R24 | The provider and overlay are mounted in `AppShell`, which is only in the authenticated (app) layout. Login and signup never mount them. | Auth gate already lives there | Codebase |
| R25 | There are no route exclusions for auto-start. | A brand-new account's first page is `/` (signup redirects there). Any deep link is handled by step 1 navigating to Today. | Codebase (`signup/actions.ts`) |
| R26 | No guidance ticket and no release-note entry. `/overload-onboarding` is not invoked. | Its availability rule: What's New hasn't shipped. This pitch builds the tour itself. | `overload-onboarding`; run prompt; pitch §14 |
| R27 | Three tickets: (1) persistence + server surface + deletion/isolation; (2) registry, engine, overlay, anchors, Settings replay (UI); (3) local-stack e2e + visual verification + D4 anchors test. | Medium-large PR-sized chunks in build order | Run prompt; pipeline guide |
| R28 | The local Supabase stack stands in for "verify on a preview deployment with ≥2 accounts". | There are no DB-backed preview deployments (`.env` is production; root CLAUDE.md) | Standing (Pitch 10 R26) |
| R29 | The owner's uncommitted `.claude/CLAUDE.md`, the untracked `overload-onboarding` skill, and the repo-root backup dump are never staged. | Not this run's files | Standing |
| R30 | No email, SMTP, or Resend work, and nothing about password reset. | Run prompt "Email scope" | Run prompt |
| R31 | The migration is named `9d_tour_progress`. | Prisma sorts lexicographically. It must sort after `9c_profile_username`. | Codebase (Pitch 8 note) |
| R32 | Copy is design doc Screen 2 verbatim, pinned by a unit test. | One source for wording, like Pitch 10 R21 | Design doc; precedent |

**Bucket-C defaults for the owner to confirm (guide D2):** the existing-account treatment (R6, standing; implemented as "due at signup", no backfill), offer-spent-on-first-show (R8), the step copy (R32), and Exercises not being a stop (R19).

## 17. Open questions

None blocking. Everything the pitch left to design and spec is decided above.

## 18. Future considerations

- **What's New (Pitch 12)** can announce a new step and call `useTour().start({ from: "<step-id>" })` from a "Show me" button. A new step never re-opens the tour by itself for existing lifters (R5). This is how existing lifters learn about new steps, as recorded for the `overload-onboarding` skill.
- A later step that needs a control inside the phone sheet would need a mechanism change (opening the sheet). Under the skill's rules that's a finding, not a registry edit. None of the initial steps needs it (R16).
- `TourProgress` could later carry a "last step version seen" if the owner ever wants "new steps since you last looked". Not designed now.
