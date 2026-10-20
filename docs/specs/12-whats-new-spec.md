---
version: 1.2.0
status: approved
author: Autonomous pipeline run (Claude Code), 2026-10-20
last_updated: 2026-10-20
pitch_reference: pitches/12-whats-new.md (Linear doc d52121df-bb1b-44b2-add0-debdf1906b12)
design_reference: docs/design/12-whats-new-design-doc.md (v1.0)
preview_reference: docs/previews/12-whats-new-preview.html (v1.0 — binding visual contract)
prd_reference: owner's multi-user PRD (Downloads/prd (1).md) → What's New; repo docs/planning/prd.md is the stale single-user copy (R1)
architecture_reference: owner's multi-user Architecture (Downloads/architecture (1).md) → Data model: ReleaseSeen; Open Questions: "where release-notes content lives and its entry format"
linear_issue: milestone "What's New" (Overload V1) — tickets listed in docs/runs/12-whats-new-progress.md
---

# What's New — Technical Specification

## 2. Summary

What's New adds **repository-managed release notes** and a **once-only announcement** of the significant ones. Every entry lives in one data file, `src/lib/release-notes/entries.ts`, as a plain object: a stable `id`, the shipping `date` (a calendar date), a `title`, a one-to-three-sentence `body`, and a `significant` flag. The file is listed **newest first** and that order is canonical: it is validated against the dates, and it is what "newer than" means. The catalog module (`src/lib/release-notes/catalog.ts`) validates and serves that list. It is pure and isomorphic, with no server, database, or account imports, so a future public changelog can import the same entries and the same `ReleaseNote` presentational component without copying either (run prompt requirement; §18).

Per-account state is a new owned model, `ReleaseSeen` (one row per account, the architecture's data object: "the latest release-notes entry shown"). It stores the id of the newest entry the account has been shown, plus when. On every full load of a signed-in page, the (app) layout asks one question: *which significant entries are newer than this account's seen point?* If there are any, and the onboarding tour isn't opening by itself on this load, the shell renders `WhatsNewDialog` with all of them, newest first, in one dialog. The dialog records "seen through the newest entry that existed when the page rendered" **the moment it opens**, so it shows once, whatever the lifter does next. The write is monotonic: the seen point only moves forward.

A new account's row is written at signup, pointing at the newest entry that exists then (standing resolution, guide D2). A second floor guards AC-3 even if that best-effort write fails: an entry dated before the account's profile was created is never unseen. **No entry ships with this pitch** (R8): the page launches with its empty state, accounts that exist at rollout have nothing unseen, and the first entry is written by Pitch 13's guidance ticket. Settings gains a What's New section linking to the read-only history page at `/settings/whats-new`, which lists every entry, newest first. "Working" means: an unseen significant entry appears once and never again for that account; several appear together; a new account never sees a backlog; adding an entry is a data-only change to `entries.ts`; and no account can read, change, or detect another's seen state.

## 3. Problem

- The app can't yet tell a lifter that something changed. The owner explains each update personally, which doesn't scale (pitch §1).
- The app has no place to look back at what changed.
- There's no release-note format, so the guidance convention (every visible pitch adds an entry through `overload-onboarding`) has nothing to write into. Pitch 13 is blocked on it (roadmap; pitch §4.12).
- There's no per-account record of what was shown, so any announcement would repeat or leak across accounts.

## 4. Scope and non-scope

### In scope

- The release-note content source (`entries.ts`), its type, validation, ordering, and date formatting (`catalog.ts`).
- `ReleaseSeen` model, migration `9e_release_seen` (empty table, RLS deny-all, immutable owner), account deletion, and the isolation suite.
- The seen-state module (`src/lib/release-notes/seen.ts`): selection of unseen significant entries, the monotonic "mark seen" write, and new-account initialization from `establishProfile`.
- The server action `markReleaseNotesSeenAction`.
- `WhatsNewDialog` (one or several entries) mounted in `AppShell`, suppressed while the tour opens by itself.
- The `ReleaseNote` presentational component, shared by the dialog and the page.
- The Settings → What's New section and the `/settings/whats-new` page (+ `loading.tsx`).
- Tests: unit (catalog validation, selection, guards, extensibility, public-safety), integration (seen state, initialization, isolation, deletion, migration rehearsal), e2e (page and Settings entry at 375/1280, no dialog for new or existing accounts at launch), and a local browser walkthrough of the dialog with temporary fixture entries (§14.4).

### Out of scope

- Any release-note **entry** (R8). Pitch 13's guidance ticket writes the first.
- The public changelog or landing page. The content and component are shaped for it (§18), and nothing public is built.
- Push, email, or any external announcement. No Resend, no SMTP (pitch §7, §10).
- An editor, admin screen, targeting, scheduling, reminders, analytics, read tracking, or a notification center (pitch §7).
- Links from an entry to a tour step (R20); a "New" or unread marker anywhere (design doc principle 5).
- Any change to the tour mechanism, its registry, or its steps (pitch §7). The only touchpoint is reading the tour's existing auto-start boolean in the layout.
- `/overload-onboarding` maintenance and a guidance ticket (run prompt; pitch §14).

## 5. Core concepts

| Concept | Description |
| ------- | ----------- |
| **Release-note entry** (`ReleaseNoteEntry`) | One shipped, user-visible change. Repository content, not a row. Fields: `id`, `date`, `title`, `body`, `significant`. Immutable once published except to correct a mistake; never deleted, never re-dated (skill rule). |
| **Catalog** | `RELEASE_NOTES` in `entries.ts`, validated and served newest first by `catalog.ts`. Index 0 is the newest entry. The only source of entries for every surface, now and later. |
| **Entry id** | A permanent kebab-case slug (`^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤ 64 chars), unique in the catalog, never reused. By convention `YYYY-MM-DD-short-name` (e.g. `2026-11-03-faster-logging`), but ordering never parses it. |
| **Significant** | An entry that may open the dialog. The rubric belongs to `overload-onboarding` (pitch §4.3): it adds a capability, changes behavior the lifter will notice, or fixes a bug that affected the correctness of their data or recommendations. Ordinary entries appear only on the page. |
| **`ReleaseSeen`** | One row per account: `lastSeenReleaseId` (the newest entry the account has been shown, or was started at) and `lastSeenAt`. Private, owned, PK `userId`. |
| **Seen point** | Where the account's "already seen" ends in the catalog: the index of `lastSeenReleaseId` (entries at lower indexes are newer, so unseen). See R11 for an absent row and an unknown id. |
| **Account floor** | The calendar date of the account's `Profile.createdAt` **in the account's own timezone** (amended in review). An entry dated strictly before it is never unseen, whatever the row says (AC-3 backstop, R12). |
| **Unseen significant entries** | The catalog entries that are significant, newer than the seen point, and not before the floor, newest first. If this list is non-empty, the dialog opens. |
| **`throughId`** | The catalog's newest entry id when the page rendered. The dialog marks the account seen through it, which covers every entry it showed and every ordinary entry before it. |

Business invariants:

- Entries are never stored per account. The database holds only `ReleaseSeen` (pitch §4.1).
- The seen point is monotonic. A mark never moves it to an older entry (R14).
- Reading never writes. Only showing the dialog (the action) and signup write `ReleaseSeen`.
- Nothing in this feature reads or writes training data, plans, goals, gyms, or baselines.

## 6. States and lifecycle

```text
ReleaseSeen row:  (absent) ──signup or first dialog──► present(lastSeenReleaseId = X)
                  present(X) ──dialog shown, throughId Y newer than X──► present(Y)
                  present(X) ──mark with Y not newer than X──► unchanged (no-op)
                  present(*) ──account deletion──► (absent)
```

| From | Event | To | Side effects |
| ---- | ----- | -- | ------------ |
| no row, catalog empty | signup | no row | none (nothing to point at; the floor covers later entries) |
| no row, catalog non-empty | signup (`establishProfile`) | row at newest entry | best effort, logged, never thrown (R10) |
| no row (account predates What's New) | full page load | no row | dialog iff unseen significant entries exist (all entries newer than the floor) |
| any | dialog opens | seen through `throughId` | `markReleaseNotesSeenAction(throughId)` (R13) |
| any | dialog closes and the open-time mark failed | seen through `throughId` | one retry; failure is silent (R16) |
| row at X | mark with an id not newer than X | row at X | no write |
| any | account deleted | gone | deletion module, before `Profile` |

The dialog's own client state: `open` (true on mount when it receives entries), and whether the mark succeeded. Nothing about it persists in the browser.

## 7. UI integration

The design doc and the preview are binding. This section maps them to code.

### Screens and surfaces

| Surface | Route | Data | Actions |
| ------- | ----- | ---- | ------- |
| What's New dialog — one / several updates (design Screens 1–2, preview §01–§02) | overlay on any (app) route | `WhatsNewDialogData` from the layout (§13) | Got it / ✕ / Escape / scrim → close; See all updates → `/settings/whats-new`; on open → `markReleaseNotesSeenAction` |
| Settings → What's New section (Screen 3, preview §03) | `/settings` | none | link to `/settings/whats-new` |
| What's New page (Screen 4, preview §04–§05) | `/settings/whats-new` | `orderedReleaseNotes()` (static content) | back link to `/settings` |
| No dialog (Screen 5, preview §05) | — | — | — |

### Components

| Component | File | Kind | Contract / notes |
| --------- | ---- | ---- | ---------------- |
| `ReleaseNote` | `src/components/release-notes/release-note.tsx` | presentational, **no** `"use client"`, no hooks, no data imports | Props `{ entry: ReleaseNoteView; headingLevel: 2 \| 3 }`. Renders `<article>`: `<time dateTime={entry.date} className="text-xs font-medium text-muted-foreground tabular-nums">{formatReleaseDate(entry.date)}</time>`, the heading (`text-base font-semibold`), `<p className="text-sm leading-relaxed text-muted-foreground">`. The only entry rendering in the app (and for a future public page) |
| `WhatsNewDialog` | `src/components/release-notes/whats-new-dialog.tsx` | client island | Props `WhatsNewDialogData`. Stock shadcn `Dialog`/`DialogContent` (`className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto]"`), `DialogHeader className="text-left"`, title "What's new", description "Since you were last here" (n = 1) or "{n} updates since you were last here" (n > 1, `tabular-nums`), body `div.-mx-6.overflow-y-auto.px-6` → `ol.divide-y.divide-border` → `li.py-4.first:pt-0.last:pb-0` → `<ReleaseNote headingLevel={3}>`, `DialogFooter className="items-center"` with `Button variant="link" asChild` → `Link` "See all updates" (`h-11 sm:h-9`) and `Button` "Got it" (`h-11 w-full sm:h-9 sm:w-auto`, `autoFocus`, closes). Stock close ✕ kept |
| `WhatsNewSection` | `src/components/settings/whats-new-section.tsx` | server component | h2 "What's New", line "Every update to Overload, newest first.", `Button variant="outline" asChild className="h-11 md:h-9"` → `Link href="/settings/whats-new"` with `ScrollText` (`size-4`, `aria-hidden`) "See what's new" |
| What's New page | `src/app/(app)/settings/whats-new/page.tsx` (+ `loading.tsx`) | server component | Back link (as delete-account), h1 "What's New", intro, `ol.divide-y.divide-border.border-t.border-border` → `li.py-5` → `<ReleaseNote headingLevel={2}>`; empty state `p.text-sm.text-muted-foreground` "No updates yet. When something changes in Overload, it's listed here." inside a `border-t pt-5` block. `metadata.title = "What's New · Overload"`. `section.space-y-6.pb-20.md:pb-0` like Settings |

Settings page change: insert `<WhatsNewSection />` directly after the Tour section and before the Delete account divider (design doc Screen 3 decision). Nothing else in Settings changes.

AppShell change: `AppShell` gains a `whatsNew: WhatsNewDialogData | null` prop and renders `{whatsNew && <WhatsNewDialog {...whatsNew} />}` inside `TourProvider`, next to the `Toaster`. The tour provider and overlay are untouched.

### shadcn/ui integration

- Only installed primitives: `Dialog` (`components/ui/dialog.tsx`), `Button`, `Skeleton`. No new dependency (pitch §4.11; R18).
- Modal behavior (focus trap, Escape, scrim close, aria-modal, focus return) comes from Radix via the stock `DialogContent`.
- `onOpenChange(false)` from any source (Got it, ✕, Escape, scrim, the link) closes it. "See all updates" closes the dialog and then navigates (`Link` with `onClick={() => setOpen(false)}`).
- Tokens only (`bg-background`, `border`, `text-muted-foreground`, `primary`). No progress or deload token, no badge.
- Reduced motion: the stock `animate-in/out` classes respect `motion-reduce` via tw-animate. No custom animation.

### Forms and validation

None in the UI. The only input is the action's `throughId` (§12).

## 8. Data model

### Relationship to existing schema

| From | Relation | To | Description |
| ---- | -------- | -- | ----------- |
| `ReleaseSeen.userId` | 1–0..1 | `Profile.userId` | The owning account; also the PK. `onDelete: Restrict` (deletion module removes it first) |

There is no relation to any training model and no foreign key to the content (entries aren't rows).

### New model

```prisma
/// Per-account record of the release notes shown (What's New, spec §8; the
/// architecture's ReleaseSeen). One row per account: the newest release-note
/// entry the account has been shown, or started at when it signed up.
/// Entries themselves are repository content (src/lib/release-notes/entries.ts),
/// never rows. The seen point only moves forward. No row = the account predates
/// What's New and has been shown nothing. Never deleted except by account deletion.
/// RLS deny-all; user_id immutable (trigger, 9e).
model ReleaseSeen {
  /// Owning account, also the key: one row per account.
  userId            String   @id @map("user_id") @db.Uuid
  /// A catalog entry id (kebab-case slug, CHECK in 9e). Not a foreign key:
  /// the catalog lives in the repository.
  lastSeenReleaseId String   @map("last_seen_release_id")
  /// When the seen point last moved (signup, or a dialog shown).
  lastSeenAt        DateTime @map("last_seen_at") @db.Timestamptz
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt         DateTime @updatedAt @map("updated_at") @db.Timestamptz

  profile Profile @relation(fields: [userId], references: [userId], onDelete: Restrict, onUpdate: Restrict)

  @@map("release_seen")
}
```

`Profile` gains the back-relation `releaseSeen ReleaseSeen?`.

### Migration `9e_release_seen` (ASCII only)

```sql
-- What's New: per-account release-notes seen state (spec 12 section 8).
--
-- Additive: one new, empty owned table. No existing table or column changes,
-- and no row is written: a new account's row is created at signup, and an
-- account with no row (every account that exists when this runs) has been
-- shown nothing. No entry ships with What's New, so nothing is unseen at
-- rollout. RLS is enabled with NO policies (deny-all), so the Data API sees
-- nothing; Prisma bypasses RLS. Ownership is immutable (shared trigger
-- function from 9_account_ownership_2_enforce). The only foreign key is to the
-- owner's own profile, so no same-owner trigger applies.
-- ASCII only: the embedded test Postgres runs in WIN1252.

CREATE TABLE "release_seen" (
    "user_id" UUID NOT NULL,
    "last_seen_release_id" TEXT NOT NULL,
    "last_seen_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "release_seen_pkey" PRIMARY KEY ("user_id"),
    -- The id format the catalog enforces (src/lib/release-notes/catalog.ts).
    CONSTRAINT "release_seen_last_seen_release_id_check"
      CHECK ("last_seen_release_id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("last_seen_release_id") <= 64)
);

ALTER TABLE "release_seen" ADD CONSTRAINT "release_seen_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Deny-all. Do not add policies for anon or authenticated.
ALTER TABLE "release_seen" ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER "release_seen_user_id_immutable" BEFORE UPDATE OF "user_id" ON "release_seen"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
```

`prisma migrate diff` from the 9d state to the new schema must produce exactly the table, PK, and FK (the CHECK, RLS, and trigger are hand-added, as in 9d). The migration contains no `INSERT` (standing migration-safety guard).

### Row-level security

`release_seen` is created with RLS enabled and zero policies. The RLS integration suite (every table has RLS and no policy) and the local-stack anon Data API check cover it automatically, and the anon probe list is extended with `release_seen`.

### Derived fields

| Field / concept | Stored? | Computed from | Notes |
| --------------- | ------- | ------------- | ----- |
| Unseen significant entries | no | catalog + `ReleaseSeen` row + profile `createdAt` | computed per full page load |
| `throughId` | no | catalog index 0 | |
| Entry display date | no | `entry.date` | `formatReleaseDate`, timezone-independent |
| Entry order | no (file order) | `entries.ts`, validated non-increasing by date | |

### Release-note content contract (for `overload-onboarding` and later pitches)

This is the record the skill reads ("where release-note entries live and what fields they have").

**Location.** `src/lib/release-notes/entries.ts` is the only place entries live. It exports `RELEASE_NOTES: readonly ReleaseNoteEntry[]` and imports nothing but the type. Nothing else in the app defines, copies, or hard-codes an entry.

**Shape** (`src/lib/release-notes/types.ts`):

```ts
export type ReleaseNoteEntry = {
  /** Permanent kebab-case slug, unique, never reused or changed: YYYY-MM-DD-short-name. */
  readonly id: string;
  /** The shipping date (the day it reached production), YYYY-MM-DD. Never planned, never backdated. */
  readonly date: string;
  /** Short, plain title for the lifter. 1-80 characters, one line. */
  readonly title: string;
  /** One to three plain sentences: what changed and why it matters. 1-400 characters, no markup, no links. */
  readonly body: string;
  /** True only if this entry should open the What's New dialog for accounts that haven't seen it. */
  readonly significant: boolean;
};
```

**Adding an entry** (the whole procedure): put a new object at the **top** of `RELEASE_NOTES`, dated with the day the change reaches production. Nothing else changes: no component, page, action, migration, or test edit. CI (`tests/unit/release-notes-catalog.test.ts`) fails the build if the file breaks a rule.

**Rules** (enforced by `validateReleaseNotes`, run by CI on the real file and at runtime):

1. `id` matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤ 64 chars, unique, and starts with its own `date` (`YYYY-MM-DD-short-name`; amended in review, r4331393375).
2. `date` is a real calendar date `YYYY-MM-DD`.
3. Entries are listed newest first: each `date` is ≤ the one above it. Two entries on the same date keep file order (the upper one is newer).
4. `title` is 1–80 chars after trimming, with no line break. `body` is 1–400 chars after trimming, with no `<`, `>`, or `](` (no HTML, no Markdown links).
5. `significant` is a boolean.
6. Published entries are never deleted, re-ordered, or re-dated, and their `id` never changes (the seen point refers to it). Only wording mistakes are corrected in place. (Rule 6 is a written rule; CI can't see history. Code defends against a violation, per R11.)

**Writing it.** For lifters, in Overload's voice: say what they can now do or what's different. No internals, no emoji, no marketing. One entry per shipped pitch by default (the skill's rubric decides significance).

**Public reuse.** `types.ts`, `entries.ts`, `catalog.ts`, and `components/release-notes/release-note.tsx` are public-safe: they import no server-only module, database, auth, Supabase, or seen-state code (guard test, §14.1). A future public changelog imports `orderedReleaseNotes()` and `ReleaseNote` as they are.

## 9. Authorization and access control

- Every signed-in page already passes the (app) layout's `requireAccount()` (authoritative) and the proxy's optimistic check. `/settings/whats-new` is inside `(app)`, so an unauthenticated request is redirected to `/login` (e2e covers it).
- `markReleaseNotesSeenAction` calls `requireAccount()` first. The acting account comes only from the auth session. The only input is an entry id, which is validated against the catalog. No account id is accepted from the client (R15).
- `ReleaseSeen` is reached only through `account.db`, whose scoping intersects every read and targeted write with the acting `userId` and stamps creates. Another account's row is invisible, so a lookup returns nothing (not-found, never forbidden). `establishProfile`'s write goes through its own scoped client, like the tour row.
- RLS deny-all closes the Data API (§8).
- Content is shared, read-only, and in the bundle. It's not a privacy surface. Seen state is never sent to the client except as "these entries, open the dialog".

| Resource | Read | Create | Update | Delete |
| -------- | ---- | ------ | ------ | ------ |
| Release-note entries | any signed-in page (and, later, public) | repository only | repository only | never (rule 6) |
| `ReleaseSeen` (own) | layout, via `account.db` | signup; first mark | mark (forward only) | account deletion only |
| `ReleaseSeen` (another account's) | never (invisible) | never | never | never |

## 10. Storage model

Not applicable. No files, images, or Storage.

## 11. Server actions and module surface

### `src/lib/release-notes/catalog.ts` (pure, isomorphic)

```ts
export class ReleaseNotesError extends Error {} // lists every broken rule

/** Throws ReleaseNotesError listing every problem; returns the list unchanged if valid. */
export function validateReleaseNotes(entries: readonly ReleaseNoteEntry[]): readonly ReleaseNoteEntry[];

/** The validated catalog, newest first (the file order). Memoized for the real file. */
export function orderedReleaseNotes(entries?: readonly ReleaseNoteEntry[]): readonly ReleaseNoteEntry[];

/** "2026-11-03" -> "Nov 3, 2026". Pure string math: no Date, no locale, no timezone. */
export function formatReleaseDate(date: string): string;

/** The public projection the UI renders (no `significant`). */
export type ReleaseNoteView = Pick<ReleaseNoteEntry, "id" | "date" | "title" | "body">;
export function toReleaseNoteView(entry: ReleaseNoteEntry): ReleaseNoteView;

/**
 * Pure selection. `seen` is the row's id (or null for no row), `seenAt` the
 * row's lastSeenAt, `floor` the account's creation date (YYYY-MM-DD, UTC).
 * Returns the unseen significant entries, newest first.
 */
export function unseenSignificant(
  catalog: readonly ReleaseNoteEntry[],
  // seenOn / floor: calendar dates in the account's own timezone (amended in review)
  state: { seenId: string | null; seenOn: string | null; floor: string },
): readonly ReleaseNoteEntry[];

/** true iff `a` is strictly newer than `b` in the catalog (lower index). Unknown ids -> false. */
export function isNewer(catalog: readonly ReleaseNoteEntry[], a: string, b: string): boolean;
```

Selection (R11, R12), for each catalog entry `e` at index `i`:

- `e.significant`, **and**
- `e.date >= floor` (string comparison of ISO dates), **and**
- the seen point allows it:
  - no row (`seenId === null`): yes;
  - `seenId` found at index `s`: `i < s`;
  - `seenId` not in the catalog (rule 6 broken): `e.date > seenOn` (strictly after, so nothing repeats; review r4331392867 skipped, R31).

### `src/lib/release-notes/seen.ts` (`server-only`)

```ts
export type WhatsNewDialogData = { entries: ReleaseNoteView[]; throughId: string };

/**
 * The acting account's dialog content, or null when nothing significant is
 * unseen. Memoized per request (React cache). Reads the ReleaseSeen row and the
 * profile's createdAt through account.db (one Promise.all). A catalog that
 * fails validation is logged and treated as "no dialog": a bad entry must never
 * take the app down (CI blocks it anyway).
 */
export const getWhatsNewDialog: (account: Account, catalog?: readonly ReleaseNoteEntry[]) => Promise<WhatsNewDialogData | null>;

/**
 * Moves the acting account's seen point forward to `throughId` (a catalog id;
 * otherwise DomainError validation_error "Unknown update."). Never moves it
 * back. No row -> create; row at an older (or unknown) id -> compare-and-set
 * update; row at the same or a newer id -> no write. Returns whether it moved.
 */
export async function markReleaseNotesSeen(
  account: Account,
  throughId: unknown,
  opts?: { catalog?: readonly ReleaseNoteEntry[]; tx?: AccountTx },
): Promise<{ moved: boolean }>;

/**
 * Where a brand-new account's seen point starts (guide D2): the newest entry,
 * already seen, or null when the catalog is empty (no row). Throws
 * ReleaseNotesError on an invalid catalog. (Amended in OVE-54, R10: the write
 * itself lives in establishProfile, in the data layer, because the standing
 * guard allows a bare userId only inside src/lib/data.)
 */
export function initialReleaseSeen(
  catalog?: readonly ReleaseNoteEntry[],
): { lastSeenReleaseId: string; lastSeenAt: Date } | null;
```

`markReleaseNotesSeen` concurrency: in one `account.db.$transaction`, read the row, then either `createMany({ skipDuplicates: true })` (if `count === 0`, a concurrent create won: re-read and apply the update rule once) or `updateMany({ where: { userId, lastSeenReleaseId: current }, data })` (compare-and-set on the value read; `count === 0` means a concurrent mark moved it: re-read and apply the rule once). There's no raw SQL and no lock. The architecture's single-writer model makes a second race practically impossible, and its worst case is one repeat appearance (R14).

### `src/app/(app)/release-notes-actions.ts` (`"use server"`)

```ts
/** The dialog has been shown: the account has seen everything through `throughId` (R13). */
export async function markReleaseNotesSeenAction(
  throughId: unknown,
): Promise<ActionResult<{ moved: boolean }>>;
// requireAccount() first; toActionResult(() => markReleaseNotesSeen(account, throughId),
//   "Couldn't save that you've seen this update.")
// No refresh()/revalidate: the client already closed or will close the dialog;
// the next full load reads the stored state.
```

A file in `(app)`, not a folder, so it isn't a route (Pitch 11 R21 precedent).

### Layout integration

```tsx
// src/app/(app)/layout.tsx
// Read alongside (amended in review, r4331392982); the tour owns a load on
// which it opens by itself, so What's New waits (R17).
const [appearance, tourAutoStart, unseen] = await Promise.all([
  getAccountAppearance(account),
  getTourAutoStart(account),
  getWhatsNewDialog(account),
]);
const whatsNew = tourAutoStart ? null : unseen;
return <AppShell appearance={appearance} tourAutoStart={tourAutoStart} whatsNew={whatsNew}>…</AppShell>;
```

"Once per full load" *(amended in review, r4331392480)*. Every `refresh()` re-renders the (app) layout in the same visit: a logged set, a saved setting, `router.refresh()` on the logging card. So the layout's value alone isn't enough. `AppShell` always renders `<WhatsNewDialog data={whatsNew} />`, and the dialog keeps only the value of its **first render** (`useState(data)`). The shell keeps it mounted across client navigation and refreshes, so a value that appears later in the visit is ignored. The dialog can open only on a full load, never mid-visit over the logging card or the tour. A later full load finds nothing because the open-time mark already moved the seen point.

### Signup integration

`establishProfile` (src/lib/data/account.ts): after the tour row, in the same best-effort style (its own try/catch, `console.error` with the error name only, never thrown, no personal data logged):

```ts
try {
  const start = initialReleaseSeen(); // null: no entries yet, no row
  if (start) {
    await db.releaseSeen.createMany({ data: [{ userId: user.id, ...start }], skipDuplicates: true });
  }
} catch (error) {
  console.error("signup: could not start the new account's release notes", error instanceof Error ? error.name : "unknown");
}
```

### Account deletion

`ACCOUNT_DELETION_ORDER` gains `"ReleaseSeen"` immediately before `"Profile"`, and `DELETE.ReleaseSeen = (tx) => tx.releaseSeen.deleteMany({})` (scoped by the deletion module's account client, as every entry is).

### Error format

`ActionResult` with codes from `src/lib/actions/result.ts`: `validation_error` (unknown `throughId`), `unauthorized` (no auth session, via `requireAccount`), `internal_error` (anything else, generic message, logged server-side).

## 12. Validation rules

| Input | Validation | Error |
| ----- | ---------- | ----- |
| `throughId` (action) | a string that is an `id` in the catalog | `validation_error` "Unknown update." |
| Catalog `id` | `^[a-z0-9]+(?:-[a-z0-9]+)*$`, ≤ 64, unique | `ReleaseNotesError` (CI / runtime) |
| Catalog `date` | `YYYY-MM-DD`, a real date, non-increasing down the file | `ReleaseNotesError` |
| Catalog `title` | trimmed 1–80, no `\n` | `ReleaseNotesError` |
| Catalog `body` | trimmed 1–400, no `<`, `>`, `](` | `ReleaseNotesError` |
| Catalog `significant` | boolean | `ReleaseNotesError` |
| DB `last_seen_release_id` | CHECK format + length | Postgres error (programming error) |

A known but **older** `throughId` is valid and a no-op. That's what an old tab returns, not an error.

## 13. UI data contracts

```ts
/** What every surface renders for an entry. No `significant`, nothing about the reader. */
type ReleaseNoteView = { id: string; date: string /* YYYY-MM-DD */; title: string; body: string };

/** Layout → AppShell → WhatsNewDialog. Null when nothing significant is unseen. */
type WhatsNewDialogData = {
  entries: ReleaseNoteView[]; // ≥ 1, newest first, significant only
  throughId: string;          // catalog's newest id at render time
};
```

- The client never receives `ReleaseSeen` fields, the account's creation date, or ordinary entries in the dialog payload.
- The page renders `orderedReleaseNotes().map(toReleaseNoteView)`: all entries, newest first.

## 14. Testing strategy

Risk order (CLAUDE.md): cross-account isolation first, then the invariant guards, then the selection and once-only behavior.

### 14.1 Unit (`tests/unit/release-notes-*.test.ts`, no DB)

```text
release-notes-catalog.test.ts
GIVEN the real RELEASE_NOTES            WHEN validated            THEN no error (CI gate for every future entry)
GIVEN duplicate ids / bad id / bad date / date newer than the one above / empty or long title / title with \n /
      body with < or ]( / non-boolean significant   WHEN validated   THEN ReleaseNotesError naming each problem
GIVEN two entries on the same date       WHEN ordered          THEN file order kept (upper = newer)
GIVEN "2026-11-03", "2027-01-01", "2026-12-31"  WHEN formatReleaseDate  THEN "Nov 3, 2026", "Jan 1, 2027", "Dec 31, 2026" (TZ-independent: run under TZ=Pacific/Kiritimati too)

release-notes-selection.test.ts (unseenSignificant, isNewer — pure)
no row → every significant entry ≥ floor; ordinary entries never; newest first
seen at index s → only significant entries with index < s
seen = newest → none (the D4 "shows once" core)
unknown seen id → entries dated after seenAt's UTC date
floor: an entry dated before the account's creation date is never unseen, even with no row (AC-3 backstop)
three significant unseen + one ordinary between them → the three, one list (AC-4)
empty catalog → none

release-notes-guards.test.ts
- entries.ts imports only the type; RELEASE_NOTES is imported only by catalog.ts (single source, no copies)
- public-safe modules (types.ts, entries.ts, catalog.ts, components/release-notes/release-note.tsx) import no
  server-only, @/lib/db, @/lib/data, @/lib/auth, supabase, or seen.ts
- mechanism files (catalog.ts, seen.ts, whats-new-dialog.tsx, release-note.tsx, the page, the section, the action)
  contain no entry id pattern, title, or body from the catalog (data-only extensibility)
- ReleaseNote's props carry no account field (type-level: ReleaseNoteView keys === id|date|title|body)
- no email/push dependency or module (no resend, nodemailer, web-push) in package.json or src

release-notes-extensibility.test.ts
- adding entries to a fixture catalog (no code change) changes what unseenSignificant and the page list return
- ReleaseNote renders date/title/body for any entry (renderToStaticMarkup), heading level from the prop

release-notes-actions.test.ts (mocked account, like tour-actions.test.ts)
- requireAccount runs before anything; no account id parameter exists; unknown id → validation_error;
  internal failure → internal_error with the generic message
```

Existing lists extended (never loosened): `account-scope.test.ts` OWNED (+`ReleaseSeen`), `account-isolation-guards.test.ts` Supabase-table regex (+`release_seen`), `ownership-backfill.test.ts` BORN_OWNED (+`release_seen`).

### 14.2 Integration (embedded Postgres, `tests/integration/`)

```text
release-notes.int.test.ts
GIVEN a fixture catalog [s3 sig, o2 ordinary, s1 sig]
- an account with no row (created before the entries' dates) gets [s3, s1] and throughId s3
- markReleaseNotesSeen(s3) → moved; getWhatsNewDialog → null (shown once); a second mark → not moved, no write
- an older mark (s1) after s3 → not moved (monotonic)
- a new significant s4 added on top → only [s4] next time
- unknown throughId → validation_error, row unchanged
- initializeReleaseSeen on a new account → row at the newest id; getWhatsNewDialog → null (AC-3);
  empty catalog → no row; called twice → one row
- establishProfile (signup path) creates the row; a failing initialize (mocked) doesn't fail signup
- floor: an account whose profile was created after s1's date and has no row sees s3 only if s3's date ≥ creation date
- concurrent marks (Promise.all of s1 and s3) end at s3
- getWhatsNewDialog with an invalid catalog → null, logged
- no training table's row count changes across every operation above

isolation/release-notes.int.test.ts (coverage registry: ReleaseSeen)
- B can't read, count, update, delete, create, or upsert into A's row through B's scoped client
- A marking seen doesn't change B's dialog; B's mark doesn't change A's
- a create with A's userId through B's client is refused (AccountScopeError)

account-deletion.int.test.ts   fixture gains a ReleaseSeen row; deletion removes A's only
ownership-enforce.int.test.ts  fullAccount marks seen; OWNED_TABLES + release_seen
release-seen-migration.int.test.ts  9e on a 9d-state DB with accounts: table empty, RLS on with 0 policies,
                                    CHECK + trigger enforced, no other table's counts change
rls.int.test.ts / schema.int.test.ts  pick the table up automatically (every table: RLS on, 0 policies)
```

`tests/integration/support/db.ts` APP_TABLES and `isolation/support.ts` OWNED_TABLES gain `release_seen`.

### 14.3 E2E, local Supabase stack (`e2e/accounts/whats-new.spec.ts`, `npm run test:e2e:accounts`)

- Unauthenticated `/settings/whats-new` → `/login`.
- A new account: first load shows the tour and no What's New dialog. After skipping the tour and reloading, still no dialog (the catalog is empty at launch).
- Settings at 375 and 1280: the What's New section is between Tour and Delete account. **See what's new** → `/settings/whats-new`. The page shows the heading, intro, and empty state. **‹ Settings** returns. The page has no horizontal scroll at 375.
- The local DB's training counts are unchanged afterwards.

The dialog can't be reached in e2e while the shipped catalog is empty, and no test-only content switch is added to production code (R22). Its behavior is proven by §14.2 (state) and §14.4 (browser).

### 14.4 Browser walkthrough of the dialog (local stack, scratch only)

With 1 and then 3 temporary significant entries plus 1 ordinary entry added to a **local, uncommitted** copy of `entries.ts`, on the dev server against the local stack, at 375 and 1280, light and dark:

- an existing account sees one dialog (1 entry, then 3 together, newest first, ordinary excluded), and a reload doesn't bring it back;
- a second account sees its own dialog, independent of the first;
- a new account sees no dialog;
- the short-phone case (375×568, 5 entries) keeps Got it visible while the list scrolls;
- See all updates lands on the page;
- the screens match the preview.

The temporary entries are reverted before any commit (`git diff --exit-code src/lib/release-notes/entries.ts`).

### 14.5 Regression

The tour e2e (first login, replay) stays green with the dialog mounted, and Settings' other sections are unchanged.

## 15. Acceptance criteria

**AC-1 — significant unseen entry appears once** (PRD What's New AC 1)
- [ ] An account that hasn't seen a significant entry gets the dialog on its next full load.
- [ ] After the dialog has opened, no reload, navigation, sign-in, or other device shows that entry automatically again.

**AC-2 — complete history in date order** (PRD AC 2 + feature description)
- [ ] `/settings/whats-new` lists every catalog entry, significant and ordinary, newest first, with date, title, and body.
- [ ] With no entries, it shows the empty state.

**AC-3 — no backlog for new accounts** (PRD AC 3; guide D2)
- [ ] A new account's seen point is the newest entry at signup, and its first loads show no What's New dialog.
- [ ] Even without its row, no entry dated before the account's creation is unseen.

**AC-4 — several unseen entries together** (PRD edge case)
- [ ] Two or more unseen significant entries appear in one dialog, newest first, and closing it shows no second dialog.

**Roadmap/PRD-description conditions** (traced to the roadmap "Includes" and the PRD feature description, not numbered ACs)
- [ ] Entries are repository content in `src/lib/release-notes/entries.ts`, dated, with a significance flag.
- [ ] Settings links to the page.
- [ ] Adding an entry is a data-only change (no edit to the dialog, page, or modules), proven by the extensibility and guard tests.
- [ ] The content contract (§8) is recorded for `overload-onboarding`.

**Standing invariants (guide D4)**
- [ ] A new account has no unread release backlog, and the dialog shows once per entry.
- [ ] `release_seen` has RLS on with zero policies, and the anon Data API returns nothing for it.
- [ ] Cross-account: no account can read, change, or detect another's seen state. Deletion removes only the acting account's row.
- [ ] Every earlier standing invariant test stays green.

**Run-prompt requirement**
- [ ] Content and the `ReleaseNote` component are importable without any private, server-only, or account module (guard), so a future public changelog can reuse both without copying.

## 16. Explicit non-goals

- ❌ Email, push, or any external announcement; any email provider. **Permanent for this feature** (pitch §10).
- ❌ An in-app editor, admin, targeting, scheduling, reminders, analytics, read tracking, notification center. **Permanent for this feature** (pitch §7).
- ❌ A public changelog or landing page. **Deferred** (run prompt): the content and component are ready for it.
- ❌ Linking an entry to a tour step. **Deferred** (R20).
- ❌ Historical or backdated entries. **Permanent** (pitch §4.8, §9.8).
- ❌ Program generation, social features, cardio analysis, dated goals, a rest timer. **Permanent** (CLAUDE.md).

## Resolved Decisions

Recorded under the Autonomous Pipeline Policy. Authority order: approved planning docs → CLAUDE.md and skills → codebase patterns → judgment.

| # | Decision | Rationale | Authority |
| - | -------- | --------- | --------- |
| R1 | The controlling planning docs are the owner's multi-user set in `Downloads/` (`prd (1).md`, `architecture (1).md`, `pitch-roadmap (1).md`, `product-brief (1).md`). `docs/planning/` stays the stale single-user copy and isn't edited (except `method-note.md`, which a run may extend). | Standing since Pitch 8 R1 | Standing resolution; CLAUDE.md run rules |
| R2 | The preview is `docs/previews/12-whats-new-preview.html`, not the run prompt's `.tsx`. | Skill rule ("names a `.tsx` file … write the `.html`") and owner feedback | `overload-ui-design`; owner memory; Pitch 9–11 precedent |
| R3 | **Stop before merge to `main`.** | Guide D1: stop when a pitch "changes schema on tables that hold user data", "changes … signup", or "changes … account deletion". This pitch adds an owned table (`release_seen`), makes signup write its row, and extends the deletion module. Merging deploys code that queries `release_seen` on every signed-in page, before a human applies 9e to production, and every signed-in page would fail. The run prompt authorizes merge on green "subject to the pipeline guide's protected-boundary rules", and the pitch §14 itself says a schema change on user-data tables applies the stop rule. Same as Pitch 10 R3 / 11 R3. | Guide D1; pitch §14; run prompt; precedent |
| R4 | Seen state is a new owned model `ReleaseSeen` (PK `userId`) holding the latest entry id shown, not a `Profile` column and not per-entry rows. | The architecture names ReleaseSeen as "the latest release-notes entry shown", and entries are "repository content, not rows". | Architecture data model; pitch §4.1, §4.6 |
| R5 | Content location: `src/lib/release-notes/entries.ts` (data only) + `types.ts` + `catalog.ts` (pure validation, ordering, formatting, selection). It's a typed TS module, not JSON or Markdown. | Settles the architecture open question. TS gives compile-time shape checks and needs no parser dependency. A public page in this Next.js app imports it directly, and a separate site could import the same module or a generated JSON later (§18). | Architecture open question; CLAUDE.md "no new libraries"; judgment |
| R6 | Order = file order, newest first, validated non-increasing by date. Same-date entries keep file order. "Newer" means lower index, never parsed from the id. | One canonical, deterministic order that is also date order, so same-day entries are unambiguous, and adding means prepending. | Pitch §12 "release ordering"; design doc Screen 4 |
| R7 | Stable ids are permanent kebab-case slugs (`YYYY-MM-DD-short-name` by convention, ≤ 64), unique, never reused. The DB CHECK mirrors the format. | The seen point refers to an id, so ids must outlive copy edits. | Pitch §13 "stable release identifiers"; judgment |
| R8 | **No entry ships with this pitch.** The page launches empty (design doc empty state), and nobody gets a dialog at rollout. Pitch 13's guidance ticket writes the first entry. If the owner wants an introductory entry, it's a one-object addition dated the deploy day (runbook §6). | The run prompt says "do not … create a premature release entry". Pitch §4.8 / §9.8 forbid synthetic or backdated history. The ship date is a human step after this run, so any date written now would be a planned date, which the skill forbids. | Run prompt; pitch §4.8, §9.8; `overload-onboarding` |
| R9 | **Existing accounts at rollout:** no row = shown nothing, so every entry in the catalog is unseen for them (subject to the floor). Because the catalog is empty at rollout and every later entry ships after rollout, that's exactly "genuinely new updates, no fabricated backlog". No backfill and no migration `INSERT`. | Resolves pitch §4.8 / §13 without touching unrelated account state. It differs from the tour's "treated as already offered" because here an absent row must still let *future* entries reach existing lifters. | Pitch §4.8, §13; architecture; migration-safety guard; bucket C (owner review) |
| R10 | *(Amended in OVE-54.)* **New accounts:** `establishProfile` writes the row last, best effort (logged by error name, never thrown), at the starting point `initialReleaseSeen()` returns (the newest entry), or writes no row if the catalog is empty. The first draft had `seen.ts` do the write with a `userId` parameter. The standing isolation guard (outside `src/lib/data`, `userId` appears only as `account.userId`) forbids that, so the write sits in the data layer like the tour row. The guard was not weakened. | Guide D2 standing resolution, implemented like the tour row (Pitch 11 R6). | Guide D2 (bucket B); codebase pattern |
| R11 | Selection rules: no row → all significant entries are candidates. Known id → only entries above it. Unknown id (content rule 6 broken) → entries dated after the row's `lastSeenAt` UTC date. | Defends against a removed or renamed entry without freezing the account forever and without showing a backlog. | Judgment; pitch §12 |
| R12 | *(Amended in review, r4331392600.)* **Account floor:** an entry dated before the account's profile creation date is never unseen, whatever the row says. The date is the calendar date **in the account's stored timezone**, as are all of What's New's calendar dates (including the unknown-id fallback). A UTC floor could hide an entry shipped the evening a Chicago account signed up. | AC-3 must hold even when the best-effort signup write fails (or for a lazily created profile). Same-date entries fall to the seen point. | PRD AC-3; guide D4; judgment |
| R13 | "Seen" is recorded **when the dialog opens**, through the catalog's newest id at render time (`throughId`, returned by the client and validated). Closing records nothing more. | Architecture: "the latest release-notes entry shown". It makes "once" hold through reloads, closed tabs, and sign-outs (pitch §9.1, D4), and a render-time id can't mark an entry that shipped after the page loaded. Same idea as Pitch 11 R8. | Architecture; pitch §4.4, §9.1; design doc Screen 1 |
| R14 | The seen point is monotonic (create, or compare-and-set forward; an older or equal id is a no-op), with no raw SQL lock. | An old tab must never re-arm entries. The single-writer model makes races rare, and their worst case is one repeat. | Architecture consistency model; judgment |
| R15 | The action accepts only an entry id (content, not identity). The account comes from `requireAccount()`. | CLAUDE.md "identity comes from the session" | CLAUDE.md first invariant |
| R16 | A failed mark is silent. The dialog retries once on close, and at worst the dialog appears once more on the next load. No toast. | A toast about bookkeeping is noise after the lifter has read it (design doc Screen 1 error state). | Design doc |
| R17 | When the tour opens by itself on a load, the dialog isn't evaluated or shown on that load. | Two stacked modals fight for focus. A new account normally has nothing unseen anyway. | Design doc Screen 1; pitch §4.7 |
| R18 | Presentation: stock shadcn `Dialog` (centered at every width, `max-h-[85dvh]`, scrolling body between fixed header and footer), `Button`, `Skeleton`. No new dependency. | Design doc and preview; pitch §4.11 | Design doc; preview; CLAUDE.md |
| R19 | The page is `/settings/whats-new`, a server component with no account read. Settings section after Tour. Back link like delete-account. | Design doc Screen 3–4 decisions; pitch §4.10 "don't redesign Settings" | Design doc; preview; codebase |
| R20 | No tour-step link in an entry (no `tourStep` field). | Design doc §13: it would be a call to action inside an entry (pitch §9.10) and meaningless publicly. The tour's `start({ from })` remains for a later pitch. | Design doc; pitch §9.10 |
| R21 | Public-reuse boundary: `types.ts`, `entries.ts`, `catalog.ts`, and `release-note.tsx` are import-clean (guard test). `ReleaseNoteView` carries no reader data, and seen state lives only in `seen.ts` (server-only). | Run prompt: a single source a future public changelog can consume, with seen state kept private | Run prompt; pitch §9.9 |
| R22 | No test-only content switch in production code. The dialog's browser behavior is verified by a scratch walkthrough with temporary, reverted entries (§14.4), and its logic by integration tests that inject a catalog parameter. | A runtime content override would be an untested production seam, and the shipped catalog is empty. Parameters with defaults keep tests honest without one. | Judgment; CLAUDE.md verification honesty |
| R23 | *(Amended in review, r4331392722.)* A catalog that fails runtime validation, **or a failed seen-state read** (a missing table, a pooler error), makes the layout show no dialog. It's logged by error name only. The page throws to the error boundary on an invalid catalog. CI blocks invalid content before either happens. Account deletion is deliberately not softened: it stays all-or-nothing, and the runbook's ordering rule (migrate before deploy) covers the missing-table case. | A bad entry must never take every signed-in page down. On the page an error is visible and honest. | Judgment |
| R24 | Migration name `9e_release_seen` (sorts after `9d_tour_progress`). Empty table, CHECK on the id, RLS deny-all, immutable-owner trigger, ASCII only. | Codebase migration conventions (9d) and guards | Codebase; CLAUDE.md RLS invariant |
| R25 | Dates display as "Nov 3, 2026" by pure string formatting (no `Date`, no `Intl`). | Identical on server and client in every timezone, so there's no hydration mismatch. | Design doc Screen 4; CLAUDE.md "today is per account" (an entry date isn't a moment) |
| R26 | No guidance ticket and no `/overload-onboarding` invocation in this pitch. The skill's contract is satisfied by §8 "Release-note content contract" and `docs/planning/method-note.md`. | Run prompt; pitch §14; the skill's availability rule | Run prompt; pitch; skill |
| R27 | Three tickets: (1) content mechanism + seen state + migration + action + signup/deletion/isolation; (2) UI: `ReleaseNote`, dialog, layout/shell wiring, Settings section, page, loading; (3) e2e, browser walkthrough, visual verification vs the preview. | Medium-large PR-sized chunks in dependency order (Pitch 11 shape) | Guide §5 step 6; precedent |
| R28 | The local Supabase stack stands in for preview-deployment verification with two accounts. | CLAUDE.md asks for preview verification of ownership/scoping work. Production-pointing previews don't exist, and `.env` is production (memory). | CLAUDE.md; owner memory; Pitch 10/11 R28 |
| R29 | The owner's uncommitted `.claude/CLAUDE.md`, the untracked `overload-onboarding` skill, and the repo-root backup dump are never staged. | Not this run's files | Precedent (Pitch 11 R29, R35) |
| R30 | No email work of any kind. | Pitch §10; run prompt | Pitch; run prompt |
| R31 | *(Review.)* The unknown-id fallback stays **strictly after** the last-seen date. | It's a defense path for a forbidden state (content rule 6 broken). Never repeating an entry, the core AC-1 guarantee, wins over catching one published later that same day. Finding r4331392867 skipped. | AC-1; judgment |
| R32 | *(Review.)* The layout reads What's New alongside appearance and tour. Folding `Profile.createdAt` into the `Account` resolution, to drop the extra profile read, is **deferred** to the same chokepoint refactor as Pitch 11 R34 / Pitch 10 R27. | Parallel reads remove the serial round trip now. The fold touches `resolveAccount`, which every page uses, and belongs with that refactor. Finding r4331392982 partly implemented. | Precedent (R34); judgment |
| R33 | *(Review.)* Calendar-date validity reuses `parseIsoDate` from `src/lib/plan/calendar.ts` (pure, import-free, so still public-safe). A non-object entry is reported as a problem, not a crash. | One home for date semantics; the contract promises every problem at once. Findings r4331393132, r4331393269. | Codebase pattern; spec §8 |

## 17. Open questions

None blocking. For owner taste (bucket C, listed in the run report): whether to add an introductory entry at deploy (R8), the existing-account rollout reading (R9), and the copy ("What's new", "Since you were last here", "Every update to Overload, newest first.", "See what's new", "See all updates", "Got it").

## 18. Future considerations

- **Public changelog.** A public route (outside `(app)`, so no auth) can render `orderedReleaseNotes().map(toReleaseNoteView)` with `<ReleaseNote headingLevel={2}>`, with no change to the content or the component and no access to `seen.ts`. If it lives in another codebase, a build step can emit `orderedReleaseNotes()` as JSON. The ids already work as per-entry anchors.
- **Linking an entry to a tour step** would add an optional, validated `tourStep` field (a `TourStepId`) and a control the design would have to approve. The tour already exposes `start({ from })`.
- **More fields** (an image, a "Learn more" path) are additive optional fields with validation. Older entries stay valid.
