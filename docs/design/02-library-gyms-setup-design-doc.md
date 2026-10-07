# Library & Gyms Setup — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch: Library & Gyms Setup (`pitches/02-library-gyms-setup.md`)
**Focus:** Browsing, searching, filtering, and favoriting the exercise library; adding custom exercises; archiving exercises; and keeping a plain list of the gyms the lifter trains at — all on a phone.

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

---

## 1. Vision

The library answers "which movement do I mean?" in two seconds, whether the lifter knows its name ("row"), its target (Back), or only that it is one of *his* movements (Favorites). The gym list answers "where do I train?" with nothing more than a name and an optional line of text. Neither screen trains anybody yet; they are the vocabulary every later plan and log will point at.

**Design north star:** *a catalog you can hold in one hand — find it, star it, move on.*

---

## 2. Design principles

### 1. Three filters, one list
Scope (All / Favorites), primary muscle, and name search are three independent narrowings of a single list, never three modes. Changing one never resets the others, and the current combination is always visible above the results.

### 2. Primary means primary
A muscle filter means "exercises whose primary target is this muscle." Secondary muscles are shown as quiet context ("Also trains: Triceps, Shoulders") and never make an exercise appear under another muscle's filter.

### 3. Favorites are a hand-picked shelf
The star is the only way an exercise becomes a favorite. Nothing is starred, ranked, or suggested for the lifter. An empty Favorites view says so plainly and points back at All.

### 4. Archive, don't delete
Removal is worded **Archive** everywhere. Archived items leave selection lists but keep their identity, and the confirmation copy promises that past workouts keep them.

### 5. Thumb first
Search sits at the top where the keyboard opens; the primary "add" action sits at the bottom within thumb reach on phones. Every row is a 44px+ tap target.

---

## 3. Visual language

Overload uses **Tailwind CSS with shadcn/ui** as the single component and styling system, with `lucide-react` icons at one stroke and size (`size-4` inline, `size-5` in nav) and **Inter**.

#### Color palette

| Token / theme path | Usage | Notes |
| ------------------ | ----- | ----- |
| `background` | page background | |
| `card` | list container, detail panel, forms | hairline `border` in light |
| `border` | row dividers, input borders, image/monogram tile outline | low contrast |
| `foreground` | exercise and gym names, counts | high contrast |
| `muted-foreground` | primary-muscle · equipment line, "Also trains" line, gym address, empty-state copy | |
| `muted` | monogram tile fill, image-fallback tile fill | |
| `primary` | active scope segment, filled favorite star, primary buttons, focus ring | the single accent |
| `destructive` | inline validation errors and the load-error alert only | never on the Archive button (archive is not destructive) |

The `progress` and `deload` tokens are **not used** in this pitch — there is nothing to tag.

#### State colors

| State | Visual treatment | Usage |
| ----- | ---------------- | ----- |
| Favorite | `Star` icon filled with `primary` (`fill-primary text-primary`) + accessible name "Remove from favorites" | exercise row, detail |
| Not favorite | `Star` outline, `muted-foreground`, accessible name "Add to favorites" | exercise row, detail |
| Custom exercise | `Badge variant="outline"` text "Custom" + monogram tile | rows, detail |
| Archived exercise (detail by direct link only) | `Badge variant="secondary"` text "Archived", muted name, no Archive/Favorite actions | detail page |
| Active gym | normal row | gym list |

Color is never the only indicator: the star always carries an accessible name and `aria-pressed`, and "Custom"/"Archived" are text badges.

#### Typography, spacing, radius, elevation

- Exercise/gym names: `text-sm font-medium` in rows, `text-xl font-semibold` on the detail page.
- Secondary lines: `text-xs text-muted-foreground`.
- Result count ("142 exercises"): `text-xs text-muted-foreground tabular-nums`.
- Thumbnails and monogram tiles: `size-12 rounded-md` in rows, `aspect-square w-full max-w-xs rounded-lg` on detail. Images use `object-cover`.
- Elevation only on Dialog/Select/DropdownMenu overlays.

#### Appearance

Light, dark, and system via existing theme tokens. Exercise photos are source JPEGs on a white background; in dark mode they sit inside a `bg-muted` tile with a `border` hairline so they don't glare. No per-screen theme toggle (Settings owns it, and Settings is not part of this pitch).

---

## 4. Information architecture

Foundation's shell is the authority. This pitch adds **two** real destinations to the nav — no placeholders.

```text
┌──────────────────────────────────────────────────────┐
│  (app) — authenticated                                │
│                                                        │
│  /            Today (Foundation, unchanged)            │
│                                                        │
│  /exercises   Exercise Library                         │
│     ?view=all|favorites  &muscle=<group>  &q=<text>    │
│     ├── /exercises/new        Add custom exercise      │
│     └── /exercises/[id]       Exercise detail          │
│              → [★ Favorite]  → [Archive] (confirm)      │
│                                                        │
│  /gyms        Gyms                                     │
│     ├── /gyms/new             Add gym                  │
│     └── row menu → [Archive] (confirm)                 │
└──────────────────────────────────────────────────────┘
 Bottom bar (mobile) / left rail (md+):
   Today · Exercises · Gyms
```

- Primary content: the exercise list. Secondary: detail and create screens, reached from the list.
- The design-doc template places the library under "Plan" and gyms under "Settings"; neither destination exists yet, so per Foundation's "one honest destination" principle they are top-level nav items now. When the Split & Mesocycle Builder adds "Plan", it may re-home them; the routes stay stable.

---

## Screen 1: Exercise Library

### Purpose
Find an exercise by scope, primary muscle, and name — and star the ones the lifter actually uses.

### URL pattern
`/exercises?view=all|favorites&muscle=<group>&q=<text>&limit=<n>` — every parameter optional. Defaults: `view=all`, no muscle, no search, first 50 results.

### Trigger
Nav item "Exercises"; returning from detail or create.

### Layout (phone, populated)

```text
┌────────────────────────────────────┐
│ Overload                       (•) │ ← shell header
├────────────────────────────────────┤
│ Exercises                          │
│ [ 🔍 Search exercises          ✕ ] │ ← search input
│ [  All  |  Favorites  ]            │ ← scope segmented control
│ [ Muscle: Back            ▾ ]      │ ← primary-muscle select
│ 38 exercises · Back · "row"  Clear │ ← active-filter summary
│ ┌────────────────────────────────┐ │
│ │[img] Barbell Row            ☆ │ │
│ │      Back · Barbell            │ │
│ ├────────────────────────────────┤ │
│ │[img] Seated Cable Row       ★ │ │
│ │      Back · Cable              │ │
│ ├────────────────────────────────┤ │
│ │[ BR] Banded Row  [Custom]   ☆ │ │ ← monogram, Custom badge
│ │      Back · Band               │ │
│ └────────────────────────────────┘ │
│        [ Show 50 more ]            │ ← only when more remain
│                                    │
│ ┌────────────────────────────────┐ │
│ │      [ + Add custom exercise ] │ │ ← sticky bottom action (mobile)
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│  Today    Exercises    Gyms        │ ← bottom nav
└────────────────────────────────────┘
```

### Search, scope, and filter controls

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Search** | `Input type="search"` with leading `Search` icon, trailing clear `Button variant="ghost" size="icon"` (only when non-empty); `aria-label="Search exercises"` | Debounced (~250 ms) update of `q` in the URL; Enter applies immediately; clear button empties and refocuses. Matches every word in any order, case-insensitive, against the name only. |
| **Scope** | Two-segment control built from `Tabs`/`TabsList`/`TabsTrigger` used as a toggle (no tab panels), labels "All" and "Favorites" | Updates `view`. Keeps `q` and `muscle`. Active segment uses `primary` text on `background` pill. |
| **Muscle** | `Select` with trigger label "Muscle: Any" / "Muscle: Back"; first item "Any muscle", then the canonical primary-muscle list in display order | Updates `muscle`. Filters by **primary** muscle only. Keeps `q` and `view`. |
| **Filter summary** | `p.text-xs.text-muted-foreground.tabular-nums` + `Button variant="link" size="sm"` "Clear" | "N exercises" plus the active muscle and quoted search. "Clear" resets search and muscle but **keeps the scope** (a lifter in Favorites stays in Favorites). Hidden when no muscle or search is set. |

### Exercise row

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Row** | `li` inside a `Card`-styled `ul` with `divide-y divide-border`; the name/meta area is a `Link` to `/exercises/[id]` | Whole left area is the tap target (min-h 56px). |
| **Thumbnail** | `img` `size-12 rounded-md object-cover bg-muted border` with `loading="lazy"`, empty `alt` (decorative — the name is adjacent) | Imported exercises with an image. On load error → swaps to the monogram tile. |
| **Monogram tile** | `div.size-12.rounded-md.bg-muted.border` with up to two initials, `text-xs font-medium text-muted-foreground` | Custom exercises, imported exercises without an image, and image load failures. Never an illustration. |
| **Name** | `text-sm font-medium` truncate | |
| **Custom badge** | `Badge variant="outline"` "Custom" | Only for custom exercises; also disambiguates a custom exercise from an imported one with the same name. |
| **Meta line** | `text-xs text-muted-foreground` "Primary · Equipment" (e.g. "Chest · Barbell") | Secondary muscles are **not** shown in the row (detail only) to keep rows one glance. |
| **Favorite star** | `Button variant="ghost" size="icon"` (44×44) containing `Star`; `aria-pressed`; accessible name "Add Barbell Row to favorites" / "Remove Barbell Row from favorites" | Toggles immediately (optimistic). On failure, reverts and shows an error toast. In the Favorites view, unstarring leaves the row in place until the next navigation/refresh (no row jumping under the thumb); it is gone on the next load. |

### Code reference

```tsx
<section className="space-y-4">
  <h1 className="text-lg font-semibold">Exercises</h1>
  <LibraryControls view={view} muscle={muscle} q={q} />   {/* client island */}
  <FilterSummary total={total} muscle={muscle} q={q} />
  <ul className="divide-y divide-border rounded-lg border border-border bg-card">
    {items.map((e) => (
      <li key={e.id} className="flex items-center gap-3 px-3 py-2">
        <Link href={`/exercises/${e.id}`} className="flex min-h-14 flex-1 items-center gap-3 min-w-0">
          <ExerciseThumb name={e.name} imageUrl={e.imageUrl} />
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-sm font-medium">
              {e.name}{e.isCustom && <Badge variant="outline">Custom</Badge>}
            </p>
            <p className="text-xs text-muted-foreground">{e.primaryMuscleLabel} · {e.equipmentLabel}</p>
          </div>
        </Link>
        <FavoriteButton exerciseId={e.id} name={e.name} isFavorite={e.isFavorite} />
      </li>
    ))}
  </ul>
</section>
```

### Empty states

Each empty state is a single `Card` with one sentence and at most one action. They are distinct so "nothing matches" never looks like "something broke".

| Situation | Copy | Action |
| --------- | ---- | ------ |
| Catalog empty (import has not run / failed) and no custom exercises | "The exercise catalog hasn't been imported yet." / secondary: "You can still add your own." | `[Add custom exercise]` |
| Favorites view, nothing starred at all | "No favorites yet. Star exercises you use to keep them here." | `[Browse all exercises]` → `?view=all` (keeps muscle/search) |
| Search (any scope) matches nothing | "No exercise matches "{q}"." | `[Add "{q}" as a custom exercise]` → `/exercises/new?name={q}` |
| Muscle filter (no search) matches nothing | "No {Muscle} exercises in {All exercises / your favorites}." | `[Clear filters]` |
| Favorites + muscle and/or search matches nothing, but favorites exist | "None of your favorites match these filters." | `[Search all exercises]` → same filters with `view=all` |

```text
┌────────────────────────────────────┐
│ No exercise matches "zercher".     │
│ [ Add "zercher" as a custom exercise ] │
└────────────────────────────────────┘
```

### Loading state
Route-level skeleton: a search-shaped `Skeleton` (h-10), a segmented-control skeleton (h-9 w-48), a select skeleton (h-9 w-40), then 8 row skeletons (`size-12` square + two text bars). While a filter change is in flight the controls stay interactive and the list dims slightly (`opacity-60`, `aria-busy="true"`) — no spinner over an empty screen.

### Error state
If the list fails to load, the existing `(app)/error.tsx` boundary shows "Something went wrong." with **Try again**. Filters are in the URL, so retry restores the same combination.

### Behavior
- Sort: name A→Z (case-insensitive).
- Page size 50; "Show 50 more" extends `limit` in the URL (keeps scroll position via normal navigation).
- Duplicate names are legal. Rows always show primary · equipment and the Custom badge, which tell two "Hip Thrust" rows apart.
- Archived exercises never appear here, in either scope.
- The "Add custom exercise" action: sticky full-width bottom button on phones (above the nav bar); an inline `Button` beside the heading at `md+`.

---

## Screen 2: Exercise Detail

### Purpose
Show one exercise's classification and image, and let the lifter star or archive it.

### URL pattern
`/exercises/[id]`

### Trigger
Tapping a row in the library; redirect after creating a custom exercise.

### Layout

```text
┌────────────────────────────────────┐
│ ‹ Exercises                        │ ← back link (keeps prior filters)
│                                    │
│  ┌──────────────┐                  │
│  │   [image]    │                  │ ← or monogram tile
│  └──────────────┘                  │
│  Barbell Bench Press          ☆    │
│  [Custom]                          │ ← only if custom
│                                    │
│  Primary       Chest               │
│  Also trains   Triceps, Shoulders  │ ← row omitted when none
│  Equipment     Barbell             │
│                                    │
│  [ Archive exercise ]              │ ← outline button, bottom
└────────────────────────────────────┘
```

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Back link** | `Link` with `ChevronLeft`, `text-sm text-muted-foreground` | Returns to `/exercises` with the filters the lifter came from (`?from=` carries the encoded query string; falls back to `/exercises`). |
| **Image** | `img` in `aspect-square w-full max-w-xs rounded-lg border bg-muted object-cover`, `alt="{name}"` | Error → monogram tile at the same size. |
| **Classification** | `dl` grid `grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm`; `dt` muted, `dd` foreground | "Also trains" row is omitted entirely when there are no secondary muscles (no "—"). |
| **Favorite** | same `FavoriteButton`, larger hit area | |
| **Archive** | `Button variant="outline"` "Archive exercise" | Opens the archive confirmation (see §8 Destructive actions). |
| **Archived badge** | `Badge variant="secondary"` "Archived" | Only when opened by direct link to an archived exercise. Favorite and Archive controls are hidden; the page stays readable because later history will link here. |

### Empty / not-found state
Unknown id → the app's `not-found` page ("That page doesn't exist." + way back).

### Loading state
Skeleton: image square, title bar, three `dl` row bars.

### Behavior
- Star toggles in place (optimistic, reverts on failure with error toast).
- Archive success → navigate to the library (preserving `from` filters) and show the archive toast with **Undo**.

---

## Screen 3: Add Custom Exercise

### Purpose
Add a movement the catalog lacks, with enough classification to behave like any other exercise.

### URL pattern
`/exercises/new` (optional `?name=` prefill from the "no match" empty state)

### Trigger
"Add custom exercise" button; "Add "{q}" as a custom exercise" empty-state action.

### Layout

```text
┌────────────────────────────────────┐
│ ‹ Exercises                        │
│ Add custom exercise                │
│                                    │
│ Name                               │
│ [ Landmine Press                 ] │
│                                    │
│ Primary muscle                     │
│ [ Choose a muscle             ▾ ]  │
│                                    │
│ Equipment                          │
│ [ Choose equipment            ▾ ]  │
│                                    │
│ Also trains (optional)             │
│ (Chest)(Back)(Shoulders✓)(Triceps✓)│ ← toggle chips, primary hidden
│ (Biceps)(Core) …                   │
│                                    │
│ Custom exercises don't have an     │ ← one muted line
│ image.                             │
│                                    │
│ [        Add exercise          ]   │ ← primary, full width, bottom
└────────────────────────────────────┘
```

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Name | `Input` text, `autoComplete="off"`, `maxLength=100` | yes | `?name=` prefill or empty | Trimmed; 1–100 characters after trimming. Duplicate names are allowed. |
| Primary muscle | `Select` over the canonical muscle list | yes | none (placeholder "Choose a muscle") | Must be a canonical value. |
| Equipment | `Select` over the canonical equipment list | yes | none (placeholder "Choose equipment") | Must be a canonical value. |
| Also trains | Group of `Toggle` chips (`variant="outline" size="sm"`), one per canonical muscle **except the selected primary** | no | none selected | Zero or more, no duplicates by construction. If the lifter picks a primary that is currently toggled as secondary, that chip is removed from the selection and hidden. |

There is **no image field**, no notes field, and no upload affordance.

### Validation
- Client-side: submit is enabled at all times; on submit, missing fields show inline `text-destructive text-sm` errors under each field ("Enter a name.", "Choose a primary muscle.", "Choose the equipment.") and focus moves to the first invalid field.
- Server-side validation is authoritative and returns field errors in the same places; entered values are preserved.
- No non-blocking duplicate-name warning (names are not unique by design; the Custom badge and classification distinguish rows).

### Loading state
On submit, the button shows "Adding…" and is disabled (`aria-disabled`); fields stay visible and editable state is preserved.

### Error state
Unexpected failure → `Alert variant="destructive"` above the button: "Couldn't add the exercise. Your entries are still here." Inputs are preserved; the lifter can resubmit.

### Behavior
- Success → navigate to the new exercise's detail page and toast `Exercise added` (success, 4s).
- Cancel = the back link; no confirm (nothing is lost but typing).

---

## Screen 4: Gyms

### Purpose
Keep a plain list of the gyms the lifter trains at.

### URL pattern
`/gyms`

### Trigger
Nav item "Gyms"; returning from Add gym.

### Layout (populated)

```text
┌────────────────────────────────────┐
│ Gyms                               │
│ ┌────────────────────────────────┐ │
│ │ Campus Rec Center          ⋯  │ │
│ ├────────────────────────────────┤ │
│ │ Downtown Gym               ⋯  │ │
│ │ Downtown, near the river       │ │ ← address line, only when set
│ ├────────────────────────────────┤ │
│ │ Downtown Gym               ⋯  │ │ ← duplicate name is fine;
│ │ 5th & Main                     │ │   address tells them apart
│ └────────────────────────────────┘ │
│                                    │
│ [            Add gym           ]   │ ← sticky bottom (mobile)
└────────────────────────────────────┘
```

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Row** | `li` in `divide-y` card list; name `text-sm font-medium`, address `text-xs text-muted-foreground` (plain text, never a link) | Rows are not links (there is no gym detail screen in this pitch). |
| **Row menu** | `DropdownMenu` trigger `Button variant="ghost" size="icon"` (`MoreHorizontal`, accessible name "Actions for Downtown Gym") with one item "Archive gym" | Opens the archive confirmation. |
| **Add gym** | `Button` full width sticky at bottom on phones; inline beside heading at `md+` | → `/gyms/new` |

Sort: name A→Z, then creation order for equal names.

### Empty state

```text
┌────────────────────────────────────┐
│ No gyms yet. Add the gym you train │
│ at.                                │
│ [ Add gym ]                        │
└────────────────────────────────────┘
```

### Loading state
Three row skeletons (name bar + shorter address bar).

### Error state
Shared `(app)/error.tsx` boundary with **Try again**.

---

## Screen 5: Add Gym

### Purpose
Name a gym (and optionally note where it is) so later workouts can be attributed to it.

### URL pattern
`/gyms/new`

### Layout

```text
┌────────────────────────────────────┐
│ ‹ Gyms                             │
│ Add gym                            │
│                                    │
│ Name                               │
│ [ Downtown Gym                   ] │
│                                    │
│ Location (optional)                │
│ [ Downtown, near the river       ] │
│ Plain text for your own reference. │ ← helper, muted
│                                    │
│ [           Add gym            ]   │
└────────────────────────────────────┘
```

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Name | `Input` text, `maxLength=80` | yes | empty | Trimmed; 1–80 characters. Duplicates allowed. |
| Location | `Input` text, `maxLength=200`, `autoComplete="off"` | no | empty | Trimmed; empty → stored as no location. Plain text only — no autocomplete, no map, no "use my location". |

### Validation
Inline "Enter a name." under Name on submit if blank; focus moves to it. Server validation mirrors it.

### Loading / error
Same patterns as Add custom exercise ("Adding…"; destructive `Alert` "Couldn't add the gym. Your entries are still here.").

### Behavior
Success → `/gyms` with toast `Gym added` (success, 4s). The new gym appears in its sorted position.

---

## 7. Navigation flows

```text
Nav "Exercises" → /exercises (All, no filters)
  ├─ type "row" ............ /exercises?q=row                         (URL replace, debounced)
  ├─ tap Favorites ......... /exercises?view=favorites&q=row
  ├─ choose Back ........... /exercises?view=favorites&muscle=back&q=row
  ├─ tap ☆ on a row ....... server action; row star fills; no navigation
  ├─ tap row ............... /exercises/[id]?from=<encoded query>
  │     ├─ tap ☆ ........... toggles in place
  │     └─ Archive → confirm → /exercises?<from> + toast "Archived. Past workouts keep it." [Undo]
  ├─ no-match "Add "row" as custom" → /exercises/new?name=row
  └─ Add custom exercise → /exercises/new → submit → /exercises/[newId] + toast "Exercise added"

Nav "Gyms" → /gyms
  ├─ Add gym → /gyms/new → submit → /gyms + toast "Gym added"
  └─ ⋯ → Archive gym → confirm → stays on /gyms, row gone, toast "Archived. Past workouts keep it." [Undo]
```

- All filter state lives in the URL, so back/forward, reload, and deep links reproduce the exact list.
- Search changes use history *replace* (typing doesn't flood history); scope and muscle changes *push*.
- Full-page navigation everywhere except the archive confirmation (`Dialog`) and the gym row menu (`DropdownMenu`).

---

## 8. Interaction specifications

#### Keyboard navigation

| Context | Key | Action |
| ------- | --- | ------ |
| Library search | Enter | Apply search immediately |
| Library search | Escape | Clear the search |
| Library | Tab / Shift+Tab | Search → scope → muscle → clear → each row link → its star |
| Scope control | Left / Right | Move between All and Favorites |
| Muscle select / equipment select | Up / Down, Enter, Escape | Standard `Select` behavior |
| Secondary chips | Space / Enter | Toggle chip (`aria-pressed`) |
| Dialog | Escape | Close; focus returns to the trigger |
| Forms | Enter in a text input | Submit |

No custom shortcuts.

#### Loading states
`Skeleton`s shaped like the final content for every route (`loading.tsx` per segment). Optimistic star toggle; submit buttons show progress text.

#### Error states
- Load failure → shared error boundary with **Try again** (filters preserved in URL).
- Mutation failure → inline `Alert` on forms (inputs kept); toast for star/archive failures.
- Messages are plain English; no database or network internals.

#### Notifications (Sonner toasts)

| Action | Message | Severity | Duration |
| ------ | ------- | -------- | -------- |
| Custom exercise created | `Exercise added` | success | 4s |
| Gym created | `Gym added` | success | 4s |
| Exercise or gym archived | `Archived. Past workouts keep it.` with **Undo** | info | 5s |
| Undo archive succeeded | `Restored` | success | 3s |
| Favorite toggle failed | `Couldn't update favorites. Try again.` | error | until dismissed |
| Archive failed | `Couldn't archive. Nothing changed.` | error | until dismissed |

Toasts are never the only place a validation error appears.

#### Destructive actions

Archiving is the only removal and is soft. Because this pitch has no "Archived" management screen to restore from later, the lifter gets **both** a short, specific confirmation and an immediate **Undo**:

```text
┌──────────────────────────────────────┐
│ Archive Barbell Row?                 │
│ It won't appear in the library or in │
│ new plans. Past workouts keep it.    │
│                                      │
│            [Cancel] [Archive]        │
└──────────────────────────────────────┘
```

- `Dialog` with title "Archive {name}?" and the body above; for gyms: "It won't appear when you pick a gym. Past workouts keep it."
- The confirm button is `variant="default"` (not destructive red): nothing is deleted.
- Archiving a favorite removes it from Favorites along with the rest of the library; the copy does not need to mention favorites.
- **Undo** in the toast restores the item exactly as it was (including its star).

---

## 9. Responsive behavior

| Breakpoint | Width | Behavior |
| ---------- | ----- | -------- |
| base | < 640px | Single column; controls stack (search, then scope + muscle on one row if they fit, else stacked); sticky bottom "Add" button above the nav bar; rows full width. |
| `sm` | ≥ 640px | Scope and muscle sit on one row beside each other; bottom button remains. |
| `md` | ≥ 768px | Left nav rail (Foundation). "Add" button moves inline beside the page heading; no sticky bottom bar. Detail page shows image left, classification right. |
| `lg` | ≥ 1024px | Content centered at Foundation's `max-w-screen-sm`; nothing added. |

Every action (search, scope, muscle, star, open detail, archive, create, add gym, archive gym) is available at base width.

---

## 10. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `AppNav` | shell | reused, extended | adds Exercises and Gyms items |
| `LibraryControls` | library | new (client island) | search + scope + muscle select; writes URL params |
| `FilterSummary` | library | new | count + active filters + Clear |
| `ExerciseRow` | library | new | thumb/monogram, name, Custom badge, meta, star |
| `ExerciseThumb` | library, detail | new (client) | image with error → `MonogramTile` fallback; sizes `sm`/`lg` |
| `MonogramTile` | library, detail | new | initials tile; reused by later pickers |
| `FavoriteButton` | library, detail | new (client island) | optimistic toggle, `aria-pressed`; reusable by the Split builder's picker |
| `ArchiveDialog` | exercise detail, gym rows | new (client) | shared confirm → action → toast with Undo |
| `CustomExerciseForm` | /exercises/new | new (client) | fields + chips; server action |
| `MuscleChips` | custom form | new | toggle chips excluding primary |
| `GymForm` | /gyms/new | new (client) | |
| `GymRow` | /gyms | new | name, address, row menu |
| `EmptyState` | library, gyms | new | one sentence + one action |
| shadcn `Badge`, `Card`, `Dialog`, `Select`, `Tabs`, `Toggle`, `Sonner` | various | added from shadcn/ui | the project's single component system |

Reusable later: `FavoriteButton`, `ExerciseThumb`/`MonogramTile`, `LibraryControls` (Split builder's exercise picker), `ArchiveDialog`.

---

## 11. Accessibility, privacy, and data sensitivity

Accessibility:
- Every icon button has an accessible name that includes the item ("Add Barbell Row to favorites", "Actions for Downtown Gym").
- The star uses `aria-pressed`; the scope control exposes the selected segment; chips use `aria-pressed`.
- Form fields have visible labels; errors are linked with `aria-describedby` and announced (`role="alert"` on the form alert).
- Dialogs trap focus and return focus to the trigger.
- The results region announces count changes politely (`aria-live="polite"` on the filter summary).
- Tap targets ≥ 44px; search uses `type="search"` and `enterKeyHint="search"`.
- Row thumbnails are decorative (`alt=""`) because the name is adjacent; the detail image has `alt="{name}"`.

Privacy:
- Gym locations appear only on the Gyms screen (and, later, in the gym picker). Never in headers, toasts, or titles. The archive toast does not repeat the address.
- Locations are plain text: no map link, no external link, no geolocation prompt.
- No share, export, or visibility affordance anywhere. Favorites are private to the single lifter.
- No external links leave the product; exercise images are served from Overload's own storage, not the source project.

---

## 12. Out of scope

From this pitch (designed nothing for these):
- Split, mesocycle, or session building; picking exercises into a plan.
- Workout logging, set entry, history, swaps, missed days.
- Gym-specific working weights or baselines; any weight shown on an exercise or gym.
- Progress/hold/deload tags, e1RM, charts.
- Editing a custom exercise, exercise notes, or editing a gym (no edit affordance exists).
- An "Archived items" screen or unarchive outside the immediate Undo toast.
- Custom exercise images, image upload, or any second image source.
- Maps, geocoding, coordinates, "use my location", proximity sorting.
- Recently used, most used, suggested/recommended exercises, auto-favoriting.
- Secondary-muscle filtering, secondary-muscle counts or volume.
- Settings screen and theme toggle.

Deferred (later pitch or version): location-pinned gyms and arrival notifications; native/wrapped mobile app.

Permanent non-goals: program or mesocycle generation (Favorites never become a recommended program); social features of any kind (no shared favorites); progression analysis of cardio; nutrition and body composition.
