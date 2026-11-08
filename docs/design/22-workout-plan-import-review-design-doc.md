# Workout Plan Import & Review — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 22: Workout Plan Import & Review
**Companion:** Document Intake & Extraction Technical Blueprint (`docs/technical/22-workout-plan-import-extraction-blueprint.md`)
**Focus:** The screens a lifter uses to bring an existing written plan (pasted text, PDF, screenshots, or photos) into Overload, review every proposed day and exercise with its source evidence, resolve what's unclear, and confirm — after which the normal plan-creation path builds a draft mesocycle. Nothing is saved until confirmation.

All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

---

## 2. Vision

A lifter already wrote their program somewhere — Notes, a coach's PDF, a photo of a whiteboard. Import answers one question: *"Can I get the plan I already have into Overload without retyping it?"* The feature translates what they wrote into Overload's plan shape, shows its work next to the original, and lets them fix anything before a single row is saved. It is migration, not programming: it never proposes a lift, a load, or a day the source didn't contain.

**Design north star:** *the lifter's own plan, shown back to them with its homework visible — editable, grounded in the source, and never guessed.*

---

## 3. Design principles

### 1. The source is always one tap away
Every proposed day, exercise, and value can be traced back to where it came from. On desktop the source sits beside the draft; on a phone it's a toggle. Nothing in the review is a black box the lifter has to trust blindly.

### 2. Missing is missing, and it looks like it
A field the source didn't contain renders blank with a quiet "not in source" marker — never a plausible guess. An unclear field renders with an "unclear" marker that invites a decision. The lifter can tell at a glance what Overload read, what it couldn't, and what it's asking about.

### 3. Overload stores sets and rep ranges; the rest is context
Overload's plan model holds the exercise, its sets, and its rep range. Loads, rest, tempo, percentages, RPE/RIR, and superset labels the source contained are shown as read-only *"from your source"* context so nothing is lost to the eye, but they are not invented into plan fields Overload doesn't have. One quiet line explains this once.

### 4. Confirm is a wall, not a nudge
No plan, session, or custom exercise exists until the lifter presses **Create plan**. That button stays disabled, with the reasons listed, until every blocking item is resolved. Closing the tab, refreshing, or a double-click never produces a half-made or duplicate plan.

### 5. Quiet about uncertainty, honest about it
No confidence percentages, no "AI thinks…", no chat. Uncertainty is shown as plain markers on the exact field that's unclear. Handwriting and blurry scans are flagged, never dressed up as certain.

---

## 4. Visual language

#### Color palette

| Token / theme path | Usage | Notes |
| ------------------ | ----- | ----- |
| `background` / `card` | Page and the two review panes (source, draft) | Review uses two side-by-side `card` surfaces on `md+` |
| `border` | Pane dividers, part tiles, day/exercise card edges | — |
| `foreground` | Extracted values, exercise names, set/rep numbers | Tabular numerals for all numbers |
| `muted-foreground` | Field provenance markers ("from source", "derived"), source-context chips, helper copy | The quiet layer |
| `primary` | The single primary action per step (Start import, Create plan) | One per screen |
| `destructive` | Blocking-issue markers and unsupported-file errors | Always paired with text |

#### State colors

This feature does **not** use the progress/hold/deload tag system — an imported plan has no logged history yet, so no lift is tagged. The only stateful visuals are **import status** and **per-field review status**.

Import session status (display labels; the stored enum lives in the spec):

| State | Visual treatment | Usage |
| ----- | ---------------- | ----- |
| Preparing | muted inline spinner + "Preparing your plan" | source accepted, pre-extraction |
| Reading | muted inline spinner + "Reading your plan" | model extraction in progress |
| Ready to review | normal; routes to review | extraction complete |
| Needs clarification | `muted` banner, count of items to resolve | draft has blocking issues |
| Couldn't read | `destructive` inline, with retry/re-upload | retryable failure |
| Not a plan | `muted` full-width card, no draft | source isn't a workout plan |
| Import unavailable | `muted` card | kill switch off or usage cap reached |
| Done | calm confirmation card | plan created |

Per-field review status (markers, never color-only):

| Field status | Marker | Meaning |
| ----- | ------ | ------- |
| From source | no marker; value shown normally | read legibly from the source |
| Derived | small `muted` "derived" dot + tooltip | mechanical normalization (e.g. `3×8` → 3 sets) |
| Not in source | blank field + `muted` "not in source" | source had nothing here |
| Unclear | `muted` "unclear" chip, tappable | ambiguous/illegible; invites a choice |
| Needs attention | `destructive` "needed to continue" chip | blocking; must be resolved to confirm |
| Edited | `muted` "edited" dot | the lifter changed it from what was read |

#### Typography, spacing, radius, elevation

Review values and all set/rep numbers use the tabular-numeral style from `overload-ui-design`. Source-context chips (load, rest, tempo) use the small muted label style. Two-pane review on `md+` uses the standard card radius and a 1px `border` divider, no elevation between panes.

#### Appearance

Light, dark, and system via tokens. The source pane for an uploaded image/PDF renders the raw page on a neutral `muted` mat in both modes so a light scan on a dark background (or vice-versa) stays legible; the mat does not invert the source image.

---

## 5. Information architecture

The feature lives under **Plan**, which Foundation owns. Import is a sibling entry to "New mesocycle" and produces a **draft** mesocycle that then behaves exactly like any other draft in the existing Split & Mesocycle experience.

```text
┌──────────────────────────────────────────────┐
│  Overload                                    │
├──────────────────────────────────────────────┤
│  Today                                        │
│  Plan   ── Mesocycles (list)                  │
│            ├─ [New mesocycle] → builder       │
│            └─ [Import existing plan] (Pro) ───┐│
│                 → /plan/import                ││
│                   Step 1 Source               ││
│                   Step 2 Processing           ││
│                   Step 3 Review ──────────────┼┼→ Create plan
│                   Step 4 Done → /plan/[id]    ││   (existing path)
│            Exercise library                   ││
│  History · Goals · Settings                   ││
└───────────────────────────────────────────────┘
 Bottom bar (mobile): Today · Plan · History · Goals
```

- A Free lifter sees the **Import existing plan** entry as a quiet, dismissible locked note (principle: one note, never a banner).
- The import route is a focused full-page flow with its own in-page steps, not a modal — there is too much content for a dialog and the primary context is a phone.
- The flow's only durable output is a draft mesocycle in the normal list; the import session itself is temporary.

---

## 6. Screen specifications

## Screen 1: Import entry point (Plan list)

### Purpose
Let a Pro lifter start an import from where they'd otherwise build a plan by hand.

### URL pattern
`/plan` (existing list screen; this adds one entry and its locked variant)

### Trigger
Viewing the Plan list.

### Layout
```text
┌────────────────────────────────────┐
│ Plan                                │
│                                     │
│  [ + New mesocycle ]                │
│  [ ⇪ Import existing plan ]         │
│                                     │
│  Active                             │
│  ▸ PPL Block 3        active        │
│  Drafts                             │
│  ▸ (none)                           │
└────────────────────────────────────┘
```

### Component / section
| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Import existing plan** | `Button` variant `outline`, `Upload` lucide icon | Pro: navigates to `/plan/import`. Free: not rendered as a button; replaced by the locked note below |
| **Locked note (Free)** | inline `muted` text + `lucide Lock`, dismissible | "Importing a written plan is part of Pro." One quiet line, dismiss persists; no countdown, no banner |

### Empty state
When the lifter has no mesocycles, the two actions sit in the existing Plan empty state, import second. Copy unchanged from Foundation except the added action.

### Behavior
- Entry visibility is decided by the `plan_import` capability on the server (not by hiding — the server route also enforces it).
- Dismissing the Free note hides it for that account; it does not reappear on every visit.

---

## Screen 2: Source intake

### Purpose
Collect the lifter's source — pasted text or one-or-more ordered files — for a single plan, and start processing.

### URL pattern
`/plan/import` (step 1)

### Trigger
Tapping **Import existing plan**.

### Layout (phone)
```text
┌────────────────────────────────────┐
│ ‹ Import plan                       │
│                                     │
│  How is your plan saved?            │
│  ┌─────────────┬─────────────────┐  │
│  │  Paste text │  Upload files   │  │  ← segmented
│  └─────────────┴─────────────────┘  │
│                                     │
│  �switch: Upload files              │
│  ┌──────────────────────────────┐  │
│  │  Drop files or [Choose]      │  │
│  │  PDF, JPG, PNG, HEIC         │  │
│  └──────────────────────────────┘  │
│                                     │
│  Your source (in order)            │
│  ① [img] gym-day1.jpg   ⠿ [✕]      │
│  ② [img] gym-day2.jpg   ⠿ [✕]      │
│  ③ [pdf] coach.pdf  2pg ⠿ [✕]      │
│                                     │
│  3 of 5 files · 4.2 / 25 MB        │
├────────────────────────────────────┤
│        [ Start import ]            │
└────────────────────────────────────┘
```

### Paste-text variant
```text
│  ┌──────────────────────────────┐  │
│  │ Paste your plan…             │  │  ← Textarea
│  │                              │  │
│  └──────────────────────────────┘  │
│  1,240 / 20,000 characters         │
```

### Component / section
| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Mode segmented** | `Tabs` (Paste text / Upload files) | Switching modes keeps entered content in each; a session is one mode's content (text *or* files), decided by what's present at Start |
| **Textarea** | `Textarea`, `tabular-nums` counter | Live character counter; turns `destructive` past 20,000; Start disabled over cap |
| **Dropzone** | bordered `card`, `Button` "Choose files", hidden `input type=file` `accept` list, `multiple`, `capture` hint absent (browser picker/photo picker handles camera) | Accepts PDF/JPEG/PNG/WebP/HEIC-HEIF; rejects others inline |
| **Part tiles** | ordered list of `card` rows, thumbnail, name, page badge for PDF, drag handle `⠿`, remove `✕` | Reorderable (drag on desktop, up/down controls on touch); order is the plan's part order; one plan per session |
| **Limits line** | `muted` tabular counts | files / max, total MB / max; turns `destructive` when exceeded |
| **Start import** | `Button` primary, bottom, thumb-reach | Disabled until ≥1 part/non-empty text and all limits satisfied |

### Fields
| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Pasted text | textarea | one of text/files | empty | ≤ 20,000 chars; non-empty after trim |
| Files | file[] | one of text/files | empty | ≤ 5 files; ≤ 10 MiB each; ≤ 25 MiB total; allowed types only; PDF ≤ 20 pages (checked server-side) |
| Order | implicit | yes | upload order | lifter-adjustable |

### Validation
- Over character cap, over file count/size, or unsupported type → inline `destructive` message on the offending control; Start disabled. Messages name the limit ("Images and PDFs only", "Up to 5 files", "This file is over 10 MB").
- Client checks are courtesy; the server re-validates type by magic bytes, size, and page count and can still reject after Start (see Screen 3 error states).

### Empty state
Before any input: the dropzone/textarea with one `muted` helper line — "Paste the plan you keep in Notes, or upload a PDF, screenshots, or photos of it."

### Loading state
Per-file: a tile shows a `Skeleton` thumbnail and a small spinner while the file is read/validated/uploaded to private storage; a failed file tile shows an inline `destructive` retry/remove.

### Error state
- Unsupported file: tile replaced by `destructive` "Can't read this file type. Images and PDFs only." with remove.
- HEIC that can't be converted: `destructive` "Couldn't read this photo format — try saving it as JPEG."

### Behavior
- Files upload to **private** per-account storage as they're added (direct signed upload), so Start only begins extraction. Removing a part deletes its stored object.
- Start transitions to Processing and is idempotent — a double-tap does not start two imports.

---

## Screen 3: Processing

### Purpose
Show that the plan is being read, and absorb interruption safely.

### URL pattern
`/plan/import?session=…` (step 2; status-driven)

### Trigger
Pressing **Start import**, or returning to an import still processing.

### Layout
```text
┌────────────────────────────────────┐
│ ‹ Import plan                       │
│                                     │
│          ◠ (quiet spinner)          │
│       Reading your plan             │
│   This usually takes a few seconds. │
│                                     │
│   Source: 3 files                   │
│                                     │
│        [ Cancel import ]            │
└────────────────────────────────────┘
```

### Component / section
| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Status line** | `muted-foreground`, swaps "Preparing" → "Reading your plan" | Polls session status; no progress percentage (honest — extraction isn't linearly measurable) |
| **Cancel** | `Button` variant `ghost` | Discards the session and its source; returns to Plan |

### Loading state
This screen *is* the loading state. Layout holds steady; only the status line changes.

### Error / interruption states
- **Tab closed / refresh / revisit:** returning to `/plan/import` resumes to the correct step from server status — Processing if still running, Review if done, an error card if it failed. No duplicate processing.
- **Couldn't read (retryable):** `destructive` card — "We couldn't read your plan. Try again?" with **[Try again]** (re-runs within the daily attempt budget) and **[Start over]**. States plainly if the model service is temporarily unavailable.
- **Not a plan:** `muted` full-width card — "This doesn't look like a workout plan. Nothing was saved." with **[Try a different source]**. No draft created.
- **Import unavailable:** if the kill switch is off or the model/budget is unconfigured, Start never reaches here; the entry shows a `muted` "Plan import is temporarily unavailable." (see Screen 7).
- **Daily cap reached:** `muted` card — "You've reached today's import limit. Try again tomorrow." (count/reset wording from spec).

### Behavior
- Extraction runs server-side; the client only polls status. Success writes a reviewable draft and routes to Review. A failure writes a retryable/terminal status — never a silent dead end.

---

## Screen 4: Review & resolve (the core screen)

### Purpose
Let the lifter see the proposed plan beside its source, understand what was read vs. unclear vs. missing, fix anything, resolve exercise matches, and decide to create the plan.

### URL pattern
`/plan/import?session=…` (step 3)

### Trigger
Extraction completes, or returning to a session in review.

### Layout (desktop `md+`, two panes)
```text
┌───────────────────────────────┬──────────────────────────────────┐
│ SOURCE                        │ PROPOSED PLAN           2 to fix  │
│ [① ② ③]  (part switcher)      │ ┌──────────────────────────────┐ │
│ ┌───────────────────────────┐ │ │ Title [ PPL — Summer      ]  │ │
│ │                           │ │ └──────────────────────────────┘ │
│ │   (rendered page / text)  │ │ Day 1  [ Push ]           ⠿      │
│ │                           │ │ ┌──────────────────────────────┐ │
│ │   highlighted quote ▓▓▓   │ │ │ Bench Press        ✓ matched │ │
│ │                           │ │ │  3 sets · 6–8 reps           │ │
│ └───────────────────────────┘ │ │  from source: 185 lb · 2 min │ │
│                               │ │ ┌──────────────────────────┐ │ │
│                               │ │ │ "DB row"      ⚠ unclear   │ │ │
│                               │ │ │  2 exercises match:       │ │ │
│                               │ │ │  ( ) Bent-Over DB Row     │ │ │
│                               │ │ │  ( ) Chest-Supported Row  │ │ │
│                               │ │ │  ( ) Create custom…       │ │ │
│                               │ │ └──────────────────────────┘ │ │
│                               │ │ │ Lateral Raise  3 sets·?reps│ │ │
│                               │ │ │   reps  ⚠ needed to continue│ │ │
│                               │ │ └──────────────────────────┘ │ │
│                               │ │ [+ Add exercise]  [Remove day]│ │
│                               │ Day 2 [ Pull ] …                 │
├───────────────────────────────┴──────────────────────────────────┤
│  2 items need attention        [ Discard ]     [ Create plan ]   │
└───────────────────────────────────────────────────────────────────┘
```

### Layout (phone — single column, source behind a toggle)
```text
┌────────────────────────────────────┐
│ ‹ Review plan        [ View source]│
│ 2 items need attention             │
│ ┌────────────────────────────────┐ │
│ │ Title [ PPL — Summer         ] │ │
│ └────────────────────────────────┘ │
│ Day 1  [ Push ]                 ⠿  │
│ ┌────────────────────────────────┐ │
│ │ Bench Press         ✓ matched  │ │
│ │ 3 sets · 6–8 reps              │ │
│ │ from source: 185 lb · 2 min →  │ │
│ ├────────────────────────────────┤ │
│ │ "DB row"        ⚠ choose match │ │
│ │ [ Bent-Over DB Row ▾ ]         │ │
│ ├────────────────────────────────┤ │
│ │ Lateral Raise                  │ │
│ │ sets[3]  reps[  ]⚠ needed      │ │
│ └────────────────────────────────┘ │
│ [+ Add exercise]                   │
│ Day 2 [ Pull ] …                   │
├────────────────────────────────────┤
│ [ Discard ]        [ Create plan ] │
└────────────────────────────────────┘
```

### Component / section
| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Source pane / toggle** | desktop: left `card`; phone: `Sheet` opened by "View source" | Part switcher `①②③`; renders text (selectable) or image/PDF page on a `muted` mat. Selecting a draft field highlights its source quote/region when one is known |
| **Title field** | `Input` | From source or "not in source" placeholder; editable |
| **Day card** | `card` with editable **Day name** `Input`, drag handle, `[Remove day]` | Reorder days; day order maps to weekday/position in the created plan |
| **Exercise row** | `card` row: name/match control, `sets` `Input` (inputMode numeric), `reps` min–max `Input`s, source-context line, status chips | All editable; set/rep use numeric keypad, 44px targets |
| **Match control** | matched: `✓ matched` + name, tap to change → `Select`/`Command` picker (same-library search); ambiguous: radio/`Select` of candidates + "Create custom…"; unknown: "Create custom…" primary | Deterministic library search; no model-chosen ID is trusted. "Create custom…" opens the custom-exercise mini-form (name prefilled from source, muscle/equipment required) and only stages a custom exercise — created on confirm |
| **Source-context line** | `muted` chips: `185 lb`, `2 min rest`, `@70%`, `RPE 8`, `A1/A2` | **Read-only**. Values the source had that Overload's plan doesn't store. One-time `muted` note on first appearance: "Overload plans track sets and rep ranges. Loads and rest from your source are shown here for reference." |
| **Status chips** | per field: "derived", "not in source", "unclear", "needed to continue", "edited" | Tapping "unclear"/"needed" scrolls to and focuses the control |
| **Issues summary** | header `muted`/`destructive` count "N items need attention" | Tapping steps through blocking items in order |
| **Add exercise / Add day** | `Button` `ghost` | Adds an empty row/day the lifter fills in manually (not invented) |
| **Create plan** | `Button` primary | Disabled while any blocking item is unresolved; tooltip/inline lists the blockers. Enabled → confirms |
| **Discard** | `Button` variant `ghost`/`destructive-outline` | Confirmation dialog (names that the source and draft will be deleted) → deletes session + source, returns to Plan |

### Code reference
```tsx
<div className="grid gap-4 md:grid-cols-2">
  <SourcePane parts={parts} activePart={activePart} highlight={activeEvidence} />
  <section className="space-y-4">
    <Input aria-label="Plan title" value={draft.title.value ?? ""} placeholder="Not in source" />
    {draft.days.map((day) => (
      <Card key={day.key} className="bg-card border-border">
        <CardHeader className="flex-row items-center justify-between gap-2">
          <Input aria-label="Day name" value={day.label.value ?? ""} />
          <DragHandle />
        </CardHeader>
        <CardContent className="space-y-3 tabular-nums">
          {day.exercises.map((ex) => (
            <ExerciseReviewRow key={ex.key} exercise={ex} onPickMatch={…} onEdit={…} />
          ))}
          <Button variant="ghost" size="sm">+ Add exercise</Button>
        </CardContent>
      </Card>
    ))}
  </section>
</div>
```

### Fields
| Field | Type | Required to confirm | Default | Validation / notes |
| ----- | ---- | ------------------- | ------- | ------------------ |
| Title | text | no | from source or blank | ≤ reasonable length; blank allowed (plan can be named later) |
| Day name | text | yes (per day) | from source or "Day N" | non-empty |
| Exercise match | selection | yes (per exercise) | matched / unresolved | must resolve to a library exercise or a staged custom exercise |
| Sets | integer | yes (per exercise) | from source or blank | 1–15; positive integer |
| Rep min / max | integer | yes (per exercise) | from source or blank | 1–… ; min ≤ max; positive |
| Source-context chips | read-only | n/a | from source | never become plan fields |

### Validation
- **Blocking (must resolve to enable Create plan):** every exercise resolved to a match or staged custom; every exercise has sets and a rep range; every day has a name and ≥1 exercise; plan has ≥1 day. Blockers are revalidated **server-side** on confirm — a client "resolved" flag can't waive them.
- **Non-blocking:** missing title; missing load/rest (those aren't stored anyway); out-of-scope notations (percentages, RPE, nested circuits) shown as context, not required.
- Draft edits autosave with an optimistic version so two open tabs can't silently overwrite each other (stale tab is told to reload).

### Empty / degenerate states
- **Partial plan:** a messy source yields some days/exercises with many "unclear"/"needed" chips — a real reviewable draft, not a confident fabrication.
- **One exercise unreadable:** that row shows "unclear" with the source region; the lifter types it in or removes it.

### Loading state
Returning to a ready session renders the draft immediately (it's stored). The source image/PDF lazy-loads behind a `Skeleton` mat.

### Error state
- Autosave failure: inline `Alert` "Couldn't save your change. It's still here — retry?" keeping the edited value on screen.
- Expired session (past retention) opened from a stale link: `muted` card "This import expired and was removed. Imports are kept for up to 24 hours." → **[Start a new import]**.

### Behavior
- Selecting a field highlights its source evidence when a quote/region is known; for photos/scans the highlight is an approximate region, and the UI says "near here" rather than implying pixel precision (honest about image evidence).
- **Create plan** → confirmation is a single server write through the existing plan-creation path, producing a **draft** mesocycle; routes to Done. Idempotent: a second press (or a retry after a dropped connection) returns the same created plan, never a duplicate.

---

## Screen 5: Done

### Purpose
Confirm the plan was created and hand off to the normal plan experience.

### URL pattern
`/plan/import?session=…&done=1` → then links to `/plan/[mesocycleId]`

### Layout
```text
┌────────────────────────────────────┐
│          ✓  Plan created            │
│                                     │
│  "PPL — Summer" is in your plans    │
│  as a draft. Review the days and    │
│  activate it when you're ready.     │
│                                     │
│     [ Open plan ]   [ Done ]        │
└────────────────────────────────────┘
```

### Component / section
| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Confirmation card** | calm `card`, `CheckCircle` icon, no animation/confetti | States the plan is a **draft** and where it lives |
| **Open plan** | `Button` primary | Navigates to the new draft mesocycle in the existing builder |
| **Done** | `Button` `ghost` | Returns to `/plan` |

### Behavior
- The source and temporary draft are cleaned up promptly after a successful create. If cleanup of a stored file lags, it never undoes the created plan and is retried in the background/next sweep (honest about the retention mechanism's limits — see spec/runbook).
- The created mesocycle is a normal draft: loads/rest weren't stored, so the lifter sees exactly the sets/rep-range plan they confirmed, editable as usual.

---

## Screen 6: Free upgrade note

### Purpose
Tell a Free lifter importing is a Pro capability — once, quietly — without blocking anything else.

### Layout
```text
│  Import existing plan                │
│  🔒 Importing a written plan is part │
│     of Pro.                    [×]   │
```

### Behavior
- One `muted` line with a lock icon where the import action would be. Dismissible; dismissal persists. No countdown, no modal, no repeated nagging. Manual plan building, logging, history, and export are untouched.
- The server route and action also enforce `plan_import`; a Free account hitting `/plan/import` directly gets the same quiet "part of Pro" state, never a Pro result.

---

## Screen 7: Import unavailable (operational)

### Purpose
Fail cleanly when the feature is disabled or unconfigured.

### Behavior
- If the server-side kill switch is off, or the model provider/budget is unconfigured, or the global spend cap is exhausted, the **Import existing plan** entry renders a `muted` "Plan import is temporarily unavailable." and `/plan/import` shows the same — no spinner, no false start, no charge. Distinct in copy from the Free locked note (this is operational, not entitlement).

---

## 7. Navigation flows

```text
Plan list
  └─[Import existing plan]→ /plan/import (Source)
        └─[Start import]→ Processing ──success──→ Review
                           │                        │
                           ├─retryable fail→ [Try again]→ Processing
                           ├─not a plan → card → [Try different source]→ Source
                           └─(tab closed / revisit)→ resume to current step
        Review
          ├─[View source] (phone)→ Sheet → back
          ├─ resolve matches / fields (autosave)
          ├─[Discard]→ confirm → delete → Plan list
          └─[Create plan]→ Done ─[Open plan]→ /plan/[mesocycleId] (existing builder)
```

- Carried state: the import session id (server-owned) drives every step; the client never carries the acting user or plan identity.
- Return path from Done's **Open plan** is the normal mesocycle detail; from there the lifter uses the existing activate flow — import never activates a plan.

---

## 8. Interaction specifications

#### Keyboard navigation

| Context | Key | Action |
| ------- | --- | ------ |
| Source textarea / set & rep fields | Tab / Shift+Tab | Next / previous field in reading order |
| Rep min field | Enter | Move to rep max, then next exercise |
| Match picker (`Command`) | Down / Up, Enter | Move through candidates, select |
| Issues summary | Enter | Jump to the next unresolved blocking field |
| Source `Sheet` (phone) | Escape | Close, return focus to the row that opened it |
| Discard dialog | Escape | Cancel discard |

- Review is fully keyboard-operable; the match picker is a `Command` combobox so a name can be typed.
- Focus moves into the source `Sheet`/dialog on open and returns to the trigger on close.

#### Loading states
`Skeleton` for file tiles (Screen 2) and the source image mat (Screen 4). The Processing screen holds a steady layout. The review draft itself never shows a skeleton once ready — it's stored data.

#### Error states
Use `Alert` for autosave and processing failures, inline `destructive` text for file/field validation. Every error keeps the lifter's entered values on screen and offers the next action (retry, remove, start over). No error silently discards a draft or a typed value.

#### Notifications (Sonner)

| Action | Message | Severity | Duration |
| ------ | ------- | -------- | -------- |
| Exercise match chosen | `Matched to Bent-Over Row` | success | 3s |
| Custom exercise staged | `Will be created when you confirm` | info | 4s |
| Draft autosave failed | `Couldn't save that change. It's still here.` | error | until dismissed |
| Plan created | `Plan created as a draft` | success | 4s |
| Import discarded | `Import discarded. Nothing was saved.` | info | 4s |

- Plan creation also shows the calm Done card (Screen 5); the toast is secondary.

#### Destructive actions
- **Discard import:** confirmation dialog naming that the source files and draft will be deleted and nothing will be saved. This is genuinely irreversible for the uploaded source, so it uses a dialog (unlike reversible archiving elsewhere in Overload).
- **Remove a source part / day / exercise during review:** inline, reversible within the session (re-add), so no dialog — a part removal before Start deletes its upload; a day/exercise removal just edits the draft.
- Import never deletes or overwrites any existing plan, logged set, or baseline, so none of those destructive patterns apply here.

---

## 9. Responsive behavior

| Breakpoint | Width | Behavior |
| ---------- | ----- | -------- |
| base | < 640px | Single column. Review draft full width; **source behind "View source"** `Sheet`. Primary action (`Start import` / `Create plan`) pinned at the bottom in thumb reach. Part reordering via up/down buttons. |
| `sm` | ≥ 640px | Wider single column, larger part tiles and day cards. |
| `md` | ≥ 768px | **Two-pane review**: source left, draft right, sticky action bar. Side nav replaces bottom bar (inherited). |
| `lg` | ≥ 1024px | Centered max-width; source pane gains width for large scans; no new elements. |

- Every action (choose match, create custom, edit fields, view source, discard, create) is available at the base breakpoint. Uploading uses the device's native file/photo picker; no native camera API is required.

---

## 10. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `ImportEntryButton` / locked note | Plan list | new | Pro button vs. one quiet Free note |
| `SourceIntake` | `/plan/import` step 1 | new | mode segmented, textarea + counter, dropzone |
| `SourcePartList` | step 1 | new | ordered, reorderable, removable tiles; page badge |
| `ImportProcessing` | step 2 | new | status line, cancel; polls session status |
| `SourcePane` | step 4 | new | text/image/PDF render, part switcher, evidence highlight, phone `Sheet` |
| `DraftPlanEditor` | step 4 | new | title, day cards, action bar |
| `ExerciseReviewRow` | step 4 | new | match control, sets/reps inputs, source-context chips, status chips |
| `ExerciseMatchPicker` | step 4 | new | `Command` combobox over library + "Create custom…" |
| `CustomExerciseMiniForm` | step 4 | reused/new | reuses existing custom-exercise fields (muscle/equipment) in a compact form; stages only |
| `FieldStatusChip` | step 4 | new | derived / not in source / unclear / needed / edited |
| `SourceContextChips` | step 4 | new | read-only load/rest/tempo/%/RPE/superset |
| `ImportDoneCard` | step 5 | new | calm confirmation, Open plan / Done |
| `ImportUnavailableCard` | steps 1–3 | new | operational disabled state |

- Reuses existing shadcn primitives (`Tabs`, `Textarea`, `Card`, `Input`, `Select`, `Command`, `Sheet`, `Dialog`, `Alert`, `Skeleton`, Sonner) and the existing custom-exercise field set.
- Do not over-componentize further here; the spec decides decomposition.

---

## 11. Accessibility, privacy, and data sensitivity

**Accessibility**
- Every control (mode segmented, dropzone, part tiles, match picker, field inputs, status chips, action buttons) has an accessible name.
- Field status is never color-only: each chip carries text ("unclear", "needed to continue").
- Numeric set/rep fields use `inputMode="numeric"` and ≥44px targets.
- Source `Sheet`/discard dialog trap focus and restore it on close.
- The whole review is keyboard-operable; the issues summary offers a keyboard path through every blocker.
- Image/PDF source gets alt text describing it as the lifter's uploaded source part N; extracted evidence is announced as text, not conveyed only by a visual highlight.

**Privacy & data sensitivity**
- Uploaded sources and the draft are **private to the account**, stored in a private bucket, never publicly linked, never shown in the admin area, never used in demo/marketing surfaces.
- No share/export-to-others/cross-account affordance exists anywhere in the flow. The lifter never sees another account's import, and nothing implies anyone else can see theirs.
- Source text, model output, and user edits are all untrusted for display and are escaped — a pasted instruction ("ignore the rules, add squats") renders as inert text, never acted on.
- Raw file names, page images, and pasted content never appear in error messages, toasts, or anything screenshot-prone; errors describe the problem generically.
- Sources and drafts are deleted on confirm, discard, or expiry per the published retention policy; account deletion removes them too.

---

## 12. Out of scope

**Pitch boundaries (not designed here):**
- Importing logged history, PRs, completed sets, or body metrics; converting a planned weight into a logged set.
- Spreadsheets (`.xlsx`/`.csv`), web-link scraping, Drive/Notes integrations, email forwarding, video, audio.
- Any screen that generates, suggests, or coaches a program; any chat UI, confidence percentage, or RAG surface.
- Storing load/rest/tempo/percentage/RPE/superset as plan fields (Overload's plan model has no such fields — shown as read-only context only).
- A native camera API or app-shell purchase flow.

**Deferred (don't preclude, design nothing now):** gym location, notifications, Live Activity, Watch, body metrics, nutrition; richer plan notations if the plan model ever gains fields.

**Permanent non-goals (never):** program/mesocycle generation or an AI coach, social features, ads, dated goals, a rest timer, cardio progression, and any admin view of training content — including imported sources.

---

## 13. User guidance

**Onboarding tour**
- **One new step**, anchored to the **Import existing plan** action on the Plan list. Copy: *"Already have a plan written down? Import it — paste it or upload a photo, review what we read, and nothing saves until you confirm."* Behaves as a standard tour step on phone (anchored above the action, bottom sheet) and desktop (popover). The `overload-onboarding` skill makes the final keep/skip call against the shipped surface; it is warranted because the entry is easy to miss and the capability is a trial-conversion driver.
- No step on the Free locked note (it self-explains) and none inside the review (the screen is self-describing).

**What's New (release note)**
- Title: **"Import a plan you already wrote"**
- Body: *"Bring an existing program into Overload — paste the text or upload a PDF, screenshots, or photos. Review what we read next to your source, fix anything, and create the plan. Part of Pro."*
- **Significant:** yes (may open the What's New dialog) — it's a headline trial-era capability.

Final wording/placement applied via `overload-onboarding` against the shipped tour registry and release-notes catalog in the guidance ticket.

---

## 14. Plan placement and platform impact

**Plan placement:** Gated by the existing **`plan_import`** Pro capability (already reserved in `PLAN_CAPABILITIES.pro`). Active trial, paid subscription, and comp accounts may import; Free sees the one quiet locked note (Screen 6). Enforcement is server-side on the route, the extraction trigger, and confirm — not by hiding the button. A plan created while Pro **remains fully usable on Free** after a lapse (it's just a plan); importing *new* plans requires Pro again. Capture, history, and export stay Free.

**Platform impact** (iOS foundation not yet shipped — recorded as pending; responsive web only this pitch):

| Surface | Web | iOS | Android | Reason |
| ------- | --- | --- | ------- | ------ |
| Entire import & review flow | shared | deferred | deferred | Native iOS/Android shells are a later pitch; this is responsive mobile-web. File/photo selection uses the browser's native picker, no Camera API. |

Native photo capture, HEIC handling nuances on device, and any app-shell behavior are explicitly **not** verified here and are flagged for the cross-platform skill once the iOS foundation exists.

---

## Appendix A — Implementation inventory (blueprint §2 prerequisite)

The design above is grounded in the real codebase (audited 2026-11-07; full digest in `docs/runs/22-workout-plan-import-review-progress.md`). Design-relevant facts:

- **Plan creation path to reuse on confirm:** `createMesocycle` / `addSession` / `addSessionExercise` / `addPlannedCardio` / `createCustomExercise` (`src/lib/plan/*`, `src/lib/exercises/exercises.ts`), all composable in one transaction — the pattern `scripts/import/real-plan/import.ts::applyImport` already uses. Confirm produces a **draft** mesocycle (`status:"draft"`); activation stays in the existing builder. The spec defines the thin adapter from draft → these writers.
- **Plan model shape (drives principle 3):** `SessionExercise` stores only `{ exerciseId, plannedSets, targetRepMin, targetRepMax, position }`. No load/rest/tempo/notes/superset fields → those source values are **review-only context chips**, never persisted. Mapping: source title→`Mesocycle.name`; day label→`Session.name`; day order→`Session.dayOfWeek`/`position`; sets→`plannedSets`; rep range→`targetRepMin/Max`.
- **Pro gate:** `requireCapability(account, "plan_import")` already exists (`src/lib/entitlements/require.ts`); no entitlement change.
- **Private storage pattern for sources:** mirror `src/lib/feedback/screenshots.ts` (private bucket, service-role, owner-prefixed keys, signed short-TTL URLs).
- **Custom-exercise mini-form** reuses existing muscle/equipment fields and `createCustomExercise`.
- **No scheduler exists** → the Done/retention copy is deliberately honest ("kept for up to 24 hours", background/next-sweep cleanup); the ≤24h *scheduled guarantee* is an owner-gated infra gap the spec/runbook flag (blueprint §4.4), not something this UI promises falsely.
- **Tour & What's New** mechanisms exist (Pitches 11/12) and are applied via `overload-onboarding`.

## Open questions

None blocking the UI preview. Numeric caps shown in copy (5 files / 10 MiB / 25 MiB / 20 pages / 20,000 chars / 5 per day / 24h) are the blueprint's adopted/proposed defaults; the spec pins them and flags the owner-review items (spend cap amount, provider data-terms) — none of which change the screens or states designed here.
