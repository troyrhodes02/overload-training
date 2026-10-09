# Split & Mesocycle Builder — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch: Split & Mesocycle Builder (`pitches/03-split-mesocycle-builder.md`)
**Focus:** Authoring a training block on a phone: setting up a mesocycle, starting from a preset structure or a blank week, building each session's exercises, sets, and rep ranges, placing sessions on days, duplicating and cloning forward, repairing archived exercises, and activating the plan only once it is complete.

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

The run prompt's pre-resolved decisions (lifecycle draft → active → archived, one active mesocycle, readiness rules, preset skeletons, zero-or-one session per day, one occurrence of an exercise per session, clone defaults, archived-exercise repair) are binding here. The spec records them as Resolved Decisions D1–D37; this document references them by behavior, not number.

---

## 1. Vision

The plan screens answer one question: **"what is my week, and is it ready to train?"** The lifter lays out seven days, fills each training day with the movements he already knows he wants, and sees, in one list, exactly what stands between this draft and a live block. Overload arranges and checks; it never suggests a movement, a set count, or a rep range.

**Design north star:** *a week on one screen, a session in one hand, nothing filled in that he didn't type.*

---

## 2. Design principles

### 1. The week is the map
The mesocycle screen is a seven-row week, Monday to Sunday. Every session is reached from its day, every empty day reads "Rest", and nothing about the schedule lives on another screen. A session that is not on any day is listed separately under "Not on the schedule", never hidden.

### 2. Structure, never prescription
A preset fills in day names and nothing else. Every place an exercise, a set count, or a rep range could appear starts empty until the lifter types it. Copy says so once, plainly ("Structure only. You choose every exercise, set count, and rep range.") and never again.

### 3. Draft freely, activate deliberately
A draft can be half-built for days. Incompleteness is shown as a short, specific checklist, not as red errors on every row, and the single primary action at the bottom (Activate) stays unavailable until the list is empty. Activation is the only step that asks for confirmation, because it changes which block is current.

### 4. Copies are copies
Duplicating a session or cloning a mesocycle produces something new and separately editable. The UI names copies ("Push Day 1 Copy", "Hypertrophy Block 3 Copy"), lands the lifter on the copy, and never shows a link between copy and source.

### 5. Nothing is quietly repaired
An archived exercise inside a session stays visible in its slot, marked, until the lifter replaces or removes it. Overload never substitutes, drops, or un-archives on its own.

### 6. Thumb first
Primary actions (Create, Add exercise, Activate) sit at the bottom within thumb reach on phones. Ordering uses explicit up/down buttons in a reorder mode, not drag handles. Every tap target is at least 44px.

---

## 3. Visual language

Overload uses **Tailwind CSS with shadcn/ui** as the single component and styling system, `lucide-react` icons at one stroke and size (`size-4` inline, `size-5` in nav and row actions), and Inter.

### Color palette

| Token / theme path | Usage | Notes |
| ------------------ | ----- | ----- |
| `background` | page background, sticky action bar (`bg-background/95` + blur) | |
| `card` | week list, session exercise list, structure choice cards, readiness panel | hairline `border` |
| `border` | row dividers, input borders, **dashed** border on a slot that needs attention | |
| `foreground` | mesocycle, session, and exercise names; day abbreviations; numbers | high contrast |
| `muted-foreground` | "Rest", meta lines ("3 sets · 6–8 reps"), help text, dates line | |
| `muted` | monogram tiles, the "Rest" day row fill on md+ | |
| `primary` | primary buttons, selected structure card ring, Active badge, focus ring | the single accent |
| `secondary` | Draft badge fill | |
| `destructive` | inline field validation text and the load-error alert **only** | never on Remove buttons — plan removal is authoring, not destruction |

The `progress` and `deload` tokens are **not used** in this pitch. The scheduled deload week is configuration text ("deload week 5"), not a tag, and nothing is tagged.

### State colors

| State | Visual treatment | Usage |
| ----- | ---------------- | ----- |
| Draft mesocycle | `Badge variant="secondary"` "Draft" | Plan home, mesocycle header |
| Active mesocycle | `Badge` (default, `primary`) "Active" | Plan home lead card, mesocycle header |
| Archived mesocycle | `Badge variant="outline"` "Archived", name in `text-muted-foreground` | Plan home "Previous" list, header |
| Ready to activate | Readiness panel collapses to one line with `CircleCheck` icon: "Ready to activate." | draft mesocycle screen |
| Not ready | Readiness panel (`Alert`, default variant) titled "Before you can activate", one row per issue, each a link | draft mesocycle screen |
| Needs attention (active plan) | Same panel titled "Needs attention", informational — the plan stays active | active mesocycle screen |
| Slot needs attention (archived exercise) | Row with `border-dashed`, `TriangleAlert` icon (`text-foreground`), `Badge variant="outline"` "Archived", meta line "Replace or remove it" | session builder, week row count "1 to fix" |
| Empty session on a day | Meta line "No exercises yet" in `muted-foreground` | week row |
| Rest day | "Rest" in `muted-foreground`, `[+ Add session]` ghost button | week row |

Color is never the only indicator: each state carries a text badge or text line.

### Typography, spacing, radius, elevation

- Page titles (mesocycle or session name): `text-lg font-semibold`.
- Day abbreviation column in the week: `w-10 text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums`.
- Session name in a week row: `text-sm font-medium`; meta line `text-xs text-muted-foreground tabular-nums`.
- Planned exercise row: name `text-sm font-medium`; prescription line "3 sets · 6–8 reps" `text-sm tabular-nums` (it is the lifter's own number — it reads in `foreground`, not muted).
- Numeric inputs (sets, reps, weeks): `h-11 w-20 text-center text-base tabular-nums`, `inputMode="numeric"`.
- Order numbers in reorder mode: `text-xs tabular-nums text-muted-foreground w-5`.
- Radius from theme (`rounded-lg` lists, `rounded-md` rows and inputs). Elevation only on dialogs and menus.
- The en dash is the rep-range separator everywhere ("6–8", "5–5").

### Appearance

Light, dark, and system via theme tokens only. Dashed attention borders use `border-border` in both modes (no tinted fills), so the repair state reads as structure, not alarm. No theme toggle on any plan screen.

---

## 4. Information architecture

Foundation's shell is the authority. This pitch adds **Plan** as a top-level destination between Today and Exercises. Exercises and Gyms keep their routes and nav items.

```text
┌──────────────────────────────────────────────────────────────┐
│  (app) — authenticated                                        │
│                                                                │
│  /                     Today (unchanged)                       │
│                                                                │
│  /plan                 Plan home                               │
│    ├── /plan/new                   New mesocycle (setup +      │
│    │                               structure)                  │
│    ├── /plan/clone                 Choose a mesocycle to clone │
│    │     └── /plan/clone/[sourceId]  Clone setup               │
│    └── /plan/[mesocycleId]         Mesocycle: week + readiness │
│          ├── /details              Edit name/start/length/     │
│          │                         deload                      │
│          └── /sessions/[sessionId] Session builder             │
│                └── /add            Exercise picker             │
│                      ?replace=<slot> (replace an exercise)     │
│                                                                │
│  /exercises  …  (unchanged)          /gyms  …  (unchanged)     │
└──────────────────────────────────────────────────────────────┘
 Bottom bar (mobile) / left rail (md+):
   Today · Plan · Exercises · Gyms
```

- Primary content: the week (mesocycle screen). Secondary: session builder, reached from a day. Tertiary: picker and dialogs.
- Dialogs (no route): Add session, Rename session, Move to another day, Duplicate to another day, Replace occupied day, Remove session, Plan exercise (sets/reps), Edit planned exercise, Activate, Archive draft.
- The design-doc template's illustrative "Plan → Mesocycles → Session builder; Exercise library" hierarchy is honored as `/plan`; the library stays its own nav item because it is used outside planning.

---

## Screen 1: Plan home

### Purpose
Show which block is current, what is being drafted, and what came before, with the two ways to start a new block.

### URL pattern
`/plan`

### Trigger
Nav item "Plan"; "‹ Plan" back link from any plan screen.

### Layout (phone, populated)

```text
┌────────────────────────────────────┐
│ Overload                       (⋮) │
├────────────────────────────────────┤
│ Plan                               │
│ ┌────────────────────────────────┐ │
│ │ Hypertrophy Block 3   [Active] │ │ ← lead card → /plan/[id]
│ │ Mon, Sep 29 – Sun, Nov 2       │ │
│ │ 5 weeks · deload week 5        │ │
│ │ Push / Pull / Legs · 6 sessions│›│
│ └────────────────────────────────┘ │
│                                    │
│ Drafts                             │
│ ┌────────────────────────────────┐ │
│ │ Strength Block        [Draft]  │›│
│ │ 2 items to finish              │ │
│ └────────────────────────────────┘ │
│                                    │
│ Previous                           │
│ ┌────────────────────────────────┐ │
│ │ Hypertrophy Block 2 [Archived] │›│
│ │ Mon, Aug 18 – Sun, Sep 21      │ │
│ └────────────────────────────────┘ │
│                                    │
│ [ New mesocycle ][ Clone previous ]│ ← sticky bottom (mobile)
├────────────────────────────────────┤
│ Today   Plan   Exercises   Gyms    │
└────────────────────────────────────┘
```

### Sections

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Active card** | `Link` styled as card (`rounded-lg border bg-card p-4`), name `text-base font-medium`, `Badge` "Active", date range and config in `text-sm text-muted-foreground tabular-nums`, trailing `ChevronRight` | Opens `/plan/[id]`. Only one can exist. Absent when no mesocycle is active. If the active plan has issues, an extra line "1 item needs attention" appears. |
| **Drafts list** | `h2 text-sm font-medium text-muted-foreground` + `ul divide-y rounded-lg border bg-card` | Newest-updated first. Meta line: "Ready to activate" or "N items to finish". |
| **Previous list** | same list pattern; rows show `Badge variant="outline"` "Archived" and the date range (or "Never activated" for an archived draft) | Newest first. Opens the read-only mesocycle screen. |
| **New mesocycle** | `Button` (primary) → `/plan/new` | Always available. |
| **Clone previous** | `Button variant="outline"` → `/plan/clone` | Shown only when at least one active or archived mesocycle exists. |
| **Action bar** | `fixed inset-x-0 bottom-16 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:border-0 md:p-0` with two buttons side by side (`flex-1 h-11`) | At md+ the buttons sit inline under the title. |

### Code reference

```tsx
<section className="space-y-6 pb-24 md:pb-0">
  <h1 className="text-lg font-semibold">Plan</h1>
  {active && <ActiveMesocycleCard mesocycle={active} />}
  {drafts.length > 0 && <MesocycleList title="Drafts" items={drafts} />}
  {previous.length > 0 && <MesocycleList title="Previous" items={previous} />}
  <PlanActions canClone={hasCloneSource} />
</section>
```

### Empty state (no mesocycle of any kind)

```text
┌────────────────────────────────────┐
│ Plan                               │
│ ┌────────────────────────────────┐ │
│ │ No mesocycle yet.              │ │
│ │ Create your first one.         │ │
│ │ [ New mesocycle ]              │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

`EmptyState title="No mesocycle yet. Create your first one." action={<Button>New mesocycle</Button>}`. "Clone previous" is not rendered. With drafts but nothing active, the page shows the Drafts list first and a one-line note above it: "Nothing is active. Finish a draft and activate it."

### Loading state
Skeletons shaped like the active card (`h-28`) and two list rows (`h-14`). Buttons render disabled.

### Error state
`Alert variant="destructive"` "Couldn't load your plans." with `Button variant="outline"` "Try again" (re-render). No partial lists.

### Behavior
- No row actions on this screen; every action happens inside a mesocycle.
- Arriving here after archiving a draft shows the toast "Draft archived. It's under Previous."

---

## Screen 2: New mesocycle

### Purpose
Set the block's name, dates, length, and deload week, and choose a starting structure, then create it as a draft.

### URL pattern
`/plan/new`

### Trigger
"New mesocycle" on Plan home.

### Layout (phone)

```text
┌────────────────────────────────────┐
│ ‹ Plan                             │
│ New mesocycle                      │
│                                    │
│ Name                               │
│ [ Strength Block               ]   │
│ Start date                         │
│ [ mm/dd/yyyy                   ]   │
│ Week 1 begins on this date.        │
│ Length          Deload week        │
│ [  5 ] weeks    [  5 ]             │
│                                    │
│ Structure                          │
│ ┌────────────────────────────────┐ │
│ │(•) Push / Pull / Legs          │ │ ← selected: ring-2 ring-primary
│ │ Mon Push Day 1 · Tue Pull Day 1│ │
│ │ Wed Leg Day 1 · Thu Push Day 2 │ │
│ │ Fri Pull Day 2 · Sat Leg Day 2 │ │
│ │ Sun Rest                       │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │( ) Arnold Split                │ │
│ │ Mon Chest & Back 1 · …         │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │( ) Bro Split                   │ │
│ │ Mon Chest · Tue Back · …       │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │( ) Custom                      │ │
│ │ Start with an empty week.      │ │
│ └────────────────────────────────┘ │
│ Structure only. You choose every   │
│ exercise, set count, and rep range.│
│                                    │
│ [        Create draft          ]   │ ← sticky bottom (mobile)
└────────────────────────────────────┘
```

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Name | `Input` text, `maxLength` 80 | yes | empty | "Enter a name." Names need not be unique. |
| Start date | `Input type="date"` | no to save, yes to activate | **empty** (never today, never inferred) | Help: "Week 1 begins on this date." When set, a second help line shows the planned end: "Ends Sun, Dec 7." |
| Length | `Input type="number" inputMode="numeric" min=1` + suffix "weeks" | yes | **5** (editable pre-fill) | Whole number, at least 1: "Enter a whole number of weeks, 1 or more." Upper bound 52 is an input-sanity limit only: "Keep it to 52 weeks or fewer." |
| Deload week | `Input type="number" inputMode="numeric" min=1` | yes | **5** (editable pre-fill) | Whole number between 1 and the length. When length is lowered below it, the field shows (not silently changed): "Week 5 is past the end of a 4-week block. Choose a week from 1 to 4." |
| Structure | radio cards (`RadioGroup` + `RadioGroupItem` inside a labelled card) | yes | **none selected** | "Choose a structure." Each preset card lists its exact day skeleton; Custom says "Start with an empty week." |

Structure skeletons shown on the cards (and created exactly):

| | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
| - | - | - | - | - | - | - | - |
| Push / Pull / Legs | Push Day 1 | Pull Day 1 | Leg Day 1 | Push Day 2 | Pull Day 2 | Leg Day 2 | Rest |
| Arnold Split | Chest & Back 1 | Shoulders & Arms 1 | Legs 1 | Chest & Back 2 | Shoulders & Arms 2 | Legs 2 | Rest |
| Bro Split | Chest | Back | Shoulders | Legs | Arms | Rest | Rest |
| Custom | Rest | Rest | Rest | Rest | Rest | Rest | Rest |

### Validation
- Client checks on submit mirror the server; errors render under each field (`text-sm text-destructive`, `role="alert"`), focus moves to the first invalid field.
- **The deload-past-length state does not block creating the draft.** It is saved as entered and appears in the readiness checklist; the field error is shown inline as a warning-styled message. Name, length ≥ 1, deload ≥ 1, and a chosen structure do block the save.
- Values survive a failed save (form keeps its inputs; no React form reset).

### Loading / error
- Submit button shows "Creating…" and disables; inputs stay editable-looking but the form ignores a second submit.
- Unexpected failure: `Alert variant="destructive"` above the button: "Couldn't create the mesocycle. Your entries are still here."

### Behavior
- Success → `/plan/[id]` (the new draft's week) with toast "Draft created".
- A preset creates its named sessions on its days, each with **no exercises**. Custom creates no sessions.
- Back link returns to `/plan` without saving (no draft is created until "Create draft").

### Code reference

```tsx
<form onSubmit={onSubmit} noValidate className="space-y-6">
  <Field label="Name"><Input name="name" className="h-11" /></Field>
  <Field label="Start date" help="Week 1 begins on this date.">
    <Input type="date" name="startDate" className="h-11" />
  </Field>
  <div className="grid grid-cols-2 gap-4">
    <Field label="Length"><WeeksInput name="lengthWeeks" defaultValue={5} /></Field>
    <Field label="Deload week"><WeeksInput name="deloadWeek" defaultValue={5} /></Field>
  </div>
  <fieldset className="space-y-3">
    <legend className="text-sm font-medium">Structure</legend>
    <RadioGroup name="splitType" className="space-y-3">
      {SPLIT_OPTIONS.map((o) => <StructureCard key={o.value} option={o} />)}
    </RadioGroup>
    <p className="text-sm text-muted-foreground">
      Structure only. You choose every exercise, set count, and rep range.
    </p>
  </fieldset>
  <StickyActions><Button type="submit" className="h-11 w-full">Create draft</Button></StickyActions>
</form>
```

---

## Screen 3a: Choose a mesocycle to clone

### Purpose
Pick which earlier plan to carry forward.

### URL pattern
`/plan/clone`

### Layout

```text
┌────────────────────────────────────┐
│ ‹ Plan                             │
│ Clone a mesocycle                  │
│ Copies the plan only. Workout      │
│ history stays with the original.   │
│ ┌────────────────────────────────┐ │
│ │ Hypertrophy Block 3   [Active] │›│
│ │ Push / Pull / Legs · 6 sessions│ │
│ ├────────────────────────────────┤ │
│ │ Hypertrophy Block 2 [Archived] │›│
│ │ Push / Pull / Legs · 6 sessions│ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

- Sources: the active mesocycle and every archived one, active first, then newest archived. Drafts are not offered (a draft is not a prior block).
- Each row: name, status badge, structure label · session count, date range when known. Tap → `/plan/clone/[sourceId]`.
- Empty state (reached by URL only): "Nothing to clone yet. Create a mesocycle first." with `Button` "New mesocycle".

---

## Screen 3b: Clone setup

### Purpose
Confirm the new block's name and dates and see what comes across before creating the clone as a draft.

### URL pattern
`/plan/clone/[sourceId]`

### Layout

```text
┌────────────────────────────────────┐
│ ‹ Clone a mesocycle                │
│ Clone Hypertrophy Block 3          │
│                                    │
│ Name                               │
│ [ Hypertrophy Block 3 Copy     ]   │
│ Start date                         │
│ [ 11/03/2025                   ]   │
│ The day after Hypertrophy Block 3  │
│ ends (Sun, Nov 2).                 │
│ Length          Deload week        │
│ [  5 ] weeks    [  5 ]             │
│                                    │
│ What comes across                  │
│ ┌────────────────────────────────┐ │
│ │ Push / Pull / Legs             │ │
│ │ 6 sessions · 31 exercises      │ │
│ │ Days, order, sets, and rep     │ │
│ │ ranges, ready to edit.         │ │
│ │ Workout history, goals, and    │ │
│ │ gym weights are not copied.    │ │
│ └────────────────────────────────┘ │
│ ┌ ⚠ 2 exercises are archived ────┐ │
│ │ Barbell Row — Pull Day 1       │ │
│ │ Cable Fly — Push Day 2         │ │
│ │ They come across marked for    │ │
│ │ repair. Replace or remove them │ │
│ │ before activating.             │ │
│ └────────────────────────────────┘ │
│ [        Create draft          ]   │
└────────────────────────────────────┘
```

### Fields

| Field | Default | Notes |
| ----- | ------- | ----- |
| Name | `<source name> Copy` | Editable; same validation as Screen 2. |
| Start date | the day after the source's planned end (source start + length × 7 days) | Editable, may leave a gap. Help line names the source end date. If the source has no start date, the field is empty and the help line is omitted. |
| Length | source length | Editable; same validation. |
| Deload week | source deload week | Editable; same validation and same "past the end" message. |
| Structure | not shown as a choice | Carried from the source; displayed as text in "What comes across". |

### States
- **Archived references:** an `Alert` (default variant, `TriangleAlert` icon) listing up to 5 "Exercise — Session" lines, then "and N more". Absent when there are none.
- **Source not found / is a draft:** the page shows "That mesocycle can't be cloned." with a link back to `/plan/clone`.
- **Loading:** skeleton form + summary card.
- **Failed create:** destructive `Alert` above the button, entries kept: "Couldn't create the clone. Your entries are still here."

### Behavior
- "Create draft" creates a **new** draft with copies of every session (same days and names), every planned exercise (same order, sets, rep range, and the same exercise even when archived). The source is untouched.
- Success → `/plan/[newId]` with toast "Clone created as a draft".

---

## Screen 4: Mesocycle (the week)

### Purpose
See and edit the block's weekly schedule, know exactly what's left before it can go live, and activate it.

### URL pattern
`/plan/[mesocycleId]`

### Trigger
Any mesocycle row/card on Plan home; redirects after create/clone; back link from a session.

### Layout (phone, draft, not ready)

```text
┌────────────────────────────────────┐
│ ‹ Plan                         (⋯) │ ← header menu: Archive draft
│ Strength Block            [Draft]  │
│ Starts Mon, Nov 3 · ends Sun, Dec 7│
│ 5 weeks · deload week 5 · PPL      │
│ [ Edit details ]                   │
│                                    │
│ ┌ Before you can activate ───────┐ │
│ │ Leg Day 1 has no exercises.   ›│ │
│ │ Barbell Row in Pull Day 1 is  ›│ │
│ │ archived. Replace or remove it.│ │
│ └────────────────────────────────┘ │
│                                    │
│ Week                               │
│ ┌────────────────────────────────┐ │
│ │MON Push Day 1              (⋯)│ │
│ │    6 exercises                 │ │
│ ├────────────────────────────────┤ │
│ │TUE Pull Day 1              (⋯)│ │
│ │    5 exercises · 1 to fix      │ │
│ ├────────────────────────────────┤ │
│ │WED Leg Day 1               (⋯)│ │
│ │    No exercises yet            │ │
│ ├────────────────────────────────┤ │
│ │THU Push Day 2              (⋯)│ │
│ ├────────────────────────────────┤ │
│ │FRI Pull Day 2              (⋯)│ │
│ ├────────────────────────────────┤ │
│ │SAT Leg Day 2               (⋯)│ │
│ ├────────────────────────────────┤ │
│ │SUN Rest          [+ Add session]│ │
│ └────────────────────────────────┘ │
│                                    │
│ Not on the schedule                │ ← only when any exist
│ ┌────────────────────────────────┐ │
│ │    Upper A                 (⋯)│ │
│ │    4 exercises                 │ │
│ └────────────────────────────────┘ │
│                                    │
│ [ Activate ]  Fix 2 items first    │ ← sticky; disabled until ready
└────────────────────────────────────┘
```

### Header

| Element | Component | Behavior |
| ------- | --------- | -------- |
| Back | `Link` "‹ Plan" `text-sm text-muted-foreground` | → `/plan` |
| Name + status | `h1 text-lg font-semibold` + status `Badge` | |
| Dates line | `text-sm text-muted-foreground tabular-nums` | "Starts Mon, Nov 3 · ends Sun, Dec 7", or "No start date yet" |
| Config line | same style | "5 weeks · deload week 5 · Push / Pull / Legs" (full structure label; "PPL" in the wireframe is abbreviation for space only) |
| Edit details | `Button variant="outline" size="sm"` | → `/plan/[id]/details`. Hidden for archived. |
| Header menu | `DropdownMenu` (`modal={false}`) on `Button variant="ghost" size="icon"` `aria-label="Mesocycle actions"` | Draft: "Archive draft". Active and archived: "Clone forward" (→ `/plan/clone/[id]`). |

### Readiness panel

| State | Treatment |
| ----- | --------- |
| Draft, issues | `Alert` (default) with title "Before you can activate"; one `Link` row per issue (min-h 44px, `ChevronRight`), in this order: start date, length, deload week, nothing scheduled, empty sessions (by day order), archived exercises (by day, then exercise order) |
| Draft, ready | single line, `CircleCheck` icon: "Ready to activate." |
| Active, issues | `Alert` titled "Needs attention" with the same rows; copy under title: "This plan stays active." |
| Active, no issues / archived | panel omitted |

Issue copy (exact):

| Issue | Copy | Link target |
| ----- | ---- | ----------- |
| No start date | "Add a start date." | details |
| Length invalid | "Set a length of at least 1 week." | details |
| Deload outside block | "Deload week 6 is past the end of a 5-week block." | details |
| No session on any day | "Put at least one session on the schedule." | the week list (scroll) |
| Scheduled session empty | "Leg Day 1 (Wed) has no exercises." | that session |
| Archived exercise | "Barbell Row in Pull Day 1 is archived. Replace or remove it." | that session, slot highlighted |

### Week rows

| Element | Component | Behavior |
| ------- | --------- | -------- |
| Day column | `span` `w-10` "MON".."SUN" | Always Monday-first. Full day name is the accessible label ("Monday"). |
| Session row | `Link` (whole row, min-h 56px) to the session builder | Name + meta line ("6 exercises", "No exercises yet", "5 exercises · 1 to fix"). |
| Row menu | `DropdownMenu modal={false}` trigger `Button variant="ghost" size="icon"` (44px), `aria-label="Push Day 1 actions"` | Items: "Move to another day", "Duplicate to another day", separator, "Remove session". Hidden for archived. |
| Rest day | "Rest" muted + `Button variant="ghost" size="sm"` "+ Add session" (`aria-label="Add a session on Sunday"`) | Opens Add session dialog with that day preset. Archived: "Rest" only. |
| Not on the schedule | separate list, same row pattern without the day column | Same menu; "Move to another day" lists the seven days. |

### Sticky action bar (draft only)

`Button className="h-11 w-full"` "Activate". Disabled when not ready, with helper `text-xs text-muted-foreground` beside/under it: "Fix 2 items first." Enabled → opens the Activate dialog. Active and archived mesocycles have no sticky bar (archived shows `Button variant="outline"` "Clone forward" in its place).

### Read-only (archived)

Same layout, no Edit details, no row menus, no Add session; rows still open the session (read-only). A one-line note under the header: "Archived. Clone it forward to train it again."

### Empty week (Custom, just created)

All seven rows read "Rest" with "+ Add session". The readiness panel shows "Add a start date." (if missing) and "Put at least one session on the schedule."

### Loading state
Header skeleton (two lines), panel skeleton (`h-20`), seven row skeletons (`h-14`). Keeps layout to avoid jumps.

### Error state
- Load failure: destructive `Alert` "Couldn't load this mesocycle." + "Try again".
- Not found: Next not-found ("That mesocycle doesn't exist." → Plan).
- Action failure: error toast (until dismissed) with the specific message; the week re-renders from the server so nothing displays a change that didn't happen.

### Code reference

```tsx
<section className="space-y-6 pb-28 md:pb-0">
  <MesocycleHeader mesocycle={m} />
  <ReadinessPanel status={m.status} issues={readiness.issues} />
  <WeekList days={week} readOnly={m.status === "archived"} />
  {unscheduled.length > 0 && <UnscheduledList sessions={unscheduled} />}
  {m.status === "draft" && (
    <StickyActions>
      <ActivateButton mesocycle={m} ready={readiness.ready} issueCount={readiness.issues.length} activeName={currentActive?.name ?? null} />
    </StickyActions>
  )}
</section>
```

---

## Screen 5: Edit details

### Purpose
Change name, start date, length, and deload week.

### URL pattern
`/plan/[mesocycleId]/details`

### Layout
Same field block as Screen 2 (Name, Start date, Length, Deload week), no Structure section (structure is the block's starting point and is shown as text: "Started from Push / Pull / Legs"). Sticky "Save" button; "Cancel" link back.

### Validation
- Same rules as Screen 2.
- **Draft:** a deload week past the end may be saved; the field shows the message and the readiness panel lists it.
- **Active:** the server rejects a deload week past the end and an empty start date (an active block must stay well-formed): "An active block needs a deload week inside it." / "An active block needs a start date." Values stay in the form.
- Shrinking the length never changes the deload field's value.

### Behavior
Save → back to `/plan/[id]` with toast "Details saved". Archived mesocycles redirect to the read-only week (no edit).

---

## Screen 6: Session builder

### Purpose
Build one session: its name, its exercises in order, and each exercise's planned sets and target rep range.

### URL pattern
`/plan/[mesocycleId]/sessions/[sessionId]`

### Trigger
Tapping a session row in the week; after Add session or Duplicate (lands on the new session).

### Layout (phone, populated)

```text
┌────────────────────────────────────┐
│ ‹ Strength Block                   │
│ Push Day 1                (✎)(⋯)  │ ← rename; menu: Move, Duplicate, Remove
│ Monday · 4 exercises     [Reorder] │
│ ┌────────────────────────────────┐ │
│ │[img] Barbell Bench Press       │›│ ← tap → Edit dialog
│ │      3 sets · 6–8 reps         │ │
│ ├────────────────────────────────┤ │
│ │[img] Incline Dumbbell Press    │›│
│ │      3 sets · 8–10 reps        │ │
│ ├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤ │ ← dashed: needs attention
│ │[ ⚠ ] Cable Fly     [Archived]  │›│
│ │      3 sets · 12–15 reps       │ │
│ │      Replace or remove it      │ │
│ ├────────────────────────────────┤ │
│ │[img] Lateral Raise             │›│
│ │      4 sets · 12–15 reps       │ │
│ └────────────────────────────────┘ │
│                                    │
│ [        + Add exercise        ]   │ ← sticky bottom
└────────────────────────────────────┘
```

### Reorder mode

```text
│ Push Day 1                         │
│ Monday · 4 exercises       [Done]  │
│ ┌────────────────────────────────┐ │
│ │1 Barbell Bench Press    [↑][↓]│ │  ↑ disabled on first
│ │2 Incline Dumbbell Press [↑][↓]│ │
│ │3 Cable Fly              [↑][↓]│ │
│ │4 Lateral Raise          [↑][↓]│ │  ↓ disabled on last
│ └────────────────────────────────┘ │
```

- "Reorder" (`Button variant="outline" size="sm"`) toggles the mode; "Done" leaves it. Only shown with 2+ exercises.
- Each arrow is `Button variant="ghost" size="icon"` (44px), `aria-label="Move Cable Fly up"`. Each tap saves immediately; the row moves; focus stays on the same button of the moved row so repeated taps keep moving it. Failure: error toast "Couldn't reorder. Nothing changed." and the list re-renders from the server.
- No drag-and-drop.

### Elements

| Element | Component | Behavior |
| ------- | --------- | -------- |
| Back | `Link` "‹ {mesocycle name}" | → week |
| Session name | `h1` + rename `Button variant="ghost" size="icon"` (`Pencil`, `aria-label="Rename session"`) | Opens Rename dialog (name field, required, 80 max). Duplicate names are allowed. |
| Session menu | `DropdownMenu` | "Move to another day", "Duplicate to another day", "Remove session" (same dialogs as the week). |
| Day line | `text-sm text-muted-foreground` | "Monday · 4 exercises" or "Not on the schedule · 4 exercises". |
| Exercise row | `button` (whole row, min-h 64px) | Opens Edit planned exercise dialog. Shows `ExerciseThumb` (library image or monogram), name, `Badge variant="outline"` "Custom" for custom exercises, prescription "3 sets · 6–8 reps" (`tabular-nums`). A fixed target reads "3 sets · 5 reps". |
| Attention row | same row with `border-dashed` top/bottom, `TriangleAlert` tile instead of thumb, `Badge variant="outline"` "Archived", extra line "Replace or remove it" | Opens the same Edit dialog, whose primary action becomes "Replace exercise". |
| Add exercise | sticky `Button className="h-11 w-full"` with `Plus` | → `/plan/[m]/sessions/[s]/add` |

### Empty state

```text
│ Leg Day 1                          │
│ Wednesday · no exercises           │
│ ┌────────────────────────────────┐ │
│ │ No exercises yet.              │ │
│ │ Add the first one.             │ │
│ │ [ Add exercise ]               │ │
│ └────────────────────────────────┘ │
```

### Read-only (archived mesocycle)
No rename, no menu, no Reorder, no Add exercise; rows are not buttons. Archived exercises still show their badge.

### Loading / error
Skeleton header + four `h-16` rows. Load failure → destructive `Alert` + "Try again". Session not in this mesocycle → not found.

---

## Screen 7: Exercise picker

### Purpose
Choose an exercise from the library to add to the session, or to replace an archived/unwanted one.

### URL pattern
`/plan/[mesocycleId]/sessions/[sessionId]/add?view=all|favorites&muscle=<group>&q=<text>&limit=<n>[&replace=<slotId>]`

### Layout

```text
┌────────────────────────────────────┐
│ ‹ Push Day 1                       │
│ Add to Push Day 1                  │ ← or "Replace Cable Fly"
│ [ 🔍 Search exercises          ✕ ] │
│ [  All  |  Favorites  ] [Muscle ▾] │
│ 84 exercises · Chest       Clear   │
│ ┌────────────────────────────────┐ │
│ │[img] Barbell Bench Press       │ │
│ │      Chest · Barbell [In session]│ ← not selectable
│ ├────────────────────────────────┤ │
│ │[img] Cable Crossover          ›│ │ ← tap → Plan exercise dialog
│ │      Chest · Cable             │ │
│ ├────────────────────────────────┤ │
│ │[ PC] Pec Deck (Custom)        ›│ │
│ │      Chest · Machine           │ │
│ └────────────────────────────────┘ │
│        [ Show 50 more ]            │
└────────────────────────────────────┘
```

- **Same controls, same data rules as the Exercise Library**: name search (every word, any order), All/Favorites, primary-muscle `Select`, "Show more" paging, archived exercises never listed. The controls are the library's own component; only the destination URL differs.
- Rows have no favorite star here (favoriting stays a library action) and no link to the detail page; the whole row is the choose action.
- Exercises already in this session show `Badge variant="secondary"` "In session" and are not selectable (`aria-disabled`), because an exercise appears at most once per session.
- **Replace mode** (`?replace=`): title "Replace Cable Fly"; a muted line "Sets and reps stay 3 × 12–15."; choosing an exercise opens a confirm dialog "Replace Cable Fly with Cable Crossover?" [Replace] [Cancel]. The replaced exercise itself shows as "In session".
- Empty states (reuse library wording, adapted): "No exercise matches “zzz”." with `Button variant="outline"` "Add “zzz” as a custom exercise" (→ `/exercises/new?name=zzz`, a library action; the lifter returns to the picker afterwards); "No favorites yet. Star exercises in the library to keep them here."; "None of your favorites match these filters."; catalog missing: "The exercise catalog hasn't been imported yet. You can still add your own."

### Plan exercise dialog (add)

```text
┌──────────────────────────────┐
│ Cable Crossover              │
│ Chest · Cable                │
│                              │
│ Sets     Reps                │
│ [   ]    [   ] – [   ]       │
│                              │
│ [Cancel]   [Add to session]  │
└──────────────────────────────┘
```

| Field | Required | Default | Validation |
| ----- | -------- | ------- | ---------- |
| Sets | yes | **empty** | whole number ≥ 1: "Enter at least 1 set." (zero is not "optional") |
| Reps minimum | yes | **empty** | whole number ≥ 1: "Enter at least 1 rep." |
| Reps maximum | yes | **empty** | whole number ≥ 1 and ≥ minimum: "The top of the range can't be below the bottom." Values are never swapped for him. Equal values (5–5) are valid. |

Upper sanity bounds (sets ≤ 20, reps ≤ 100) produce "Keep sets to 20 or fewer." / "Keep reps to 100 or fewer." Nothing is pre-filled; Overload does not suggest a prescription.

- Focus starts in Sets; Enter moves Sets → min → max → submit.
- Success → back to the session builder with the new row last, toast "Cable Crossover added".
- Failure → inline errors / destructive alert inside the dialog; values kept.

---

## Dialogs

All dialogs: shadcn `Dialog` (or `AlertDialog` for confirmations), focus moves into the dialog, Escape closes and returns focus to the trigger, bottom-anchored on phones (`DialogContent` default centered is acceptable; buttons stack full-width at base).

### Add session
Fields: Name (required, 80 max, empty default; placeholder "e.g. Upper A"), Day (`Select`, defaulted to the day the lifter tapped; options Monday…Sunday and "Not on the schedule"). Submit "Add session". If the chosen day is taken (possible only when opened from somewhere without a day), the Replace occupied day dialog follows. Success → session builder of the new session, toast "Session added".

### Move to another day / Duplicate to another day
A list of the seven days as 44px rows, each showing what's there now ("Thu — Push Day 2", "Sun — Rest"), plus "Not on the schedule". The current day is marked "Current" and disabled for Move. Title: "Move Push Day 1" / "Duplicate Push Day 1". Duplicate subtitle: "Creates a separate copy named “Push Day 1 Copy”. Editing one won't change the other."
- Rest day chosen → done immediately. Toasts: "Push Day 1 moved to Thursday" / "Push Day 1 copied to Thursday" (Duplicate also navigates to the copy).
- Occupied day chosen → **Replace occupied day** dialog.

### Replace occupied day (confirmation)
"Thursday already has Push Day 2."
"Replace it? Push Day 2 stays in this mesocycle under Not on the schedule. Nothing is deleted."
Buttons: "Cancel" (default focus), "Replace". There is never a second session on one day and never a silent overwrite.

### Remove session (confirmation, `AlertDialog`)
"Remove Push Day 1?"
"Its 6 planned exercises go with it. Your exercise library, gyms, and other mesocycles are not affected."
Buttons: "Cancel", "Remove session" (`variant="outline"` — authoring, not destruction). Success → week, toast "Push Day 1 removed".

### Edit planned exercise
```text
┌──────────────────────────────┐
│ Cable Fly          [Archived]│
│ Chest · Cable                │
│ This exercise is archived.   │ ← only for archived
│ Replace it or remove it.     │
│                              │
│ Sets     Reps                │
│ [ 3 ]    [12] – [15]         │
│                              │
│ [Replace exercise]           │ ← outline; primary when archived
│ [Remove from session]        │ ← ghost
│ Removing it from this session│
│ leaves it in your library.   │
│ [Cancel]          [Save]     │
└──────────────────────────────┘
```
- Same validation as the add dialog. "Save" only when values changed.
- "Replace exercise" → picker in replace mode.
- "Remove from session" removes immediately (the dialog is the deliberate step), toast "Cable Fly removed from Push Day 1". The exercise stays in the library, un-archived state untouched.

### Activate (confirmation, `AlertDialog`)
- No active block: "Activate Strength Block?" / "It becomes your current plan, starting Mon, Nov 3." / [Cancel] [Activate].
- Another block active: "Activate Strength Block?" / "Hypertrophy Block 3 is active now. It will be archived. It stays readable and you can clone it later." / [Cancel] [Activate].
- If the plan stopped being ready or the active block changed since the page loaded, the dialog shows the server's message inline ("This plan isn't ready: …" / "The active mesocycle changed. Review and try again.") and nothing changes.
- Success → week re-renders as Active, toast "Strength Block is active".

### Archive draft (confirmation, `AlertDialog`)
"Archive this draft?" / "It moves to Previous. It won't become active, but you can still open it and clone it." / [Cancel] [Archive draft]. Success → `/plan`, toast "Draft archived. It's under Previous."

---

## 7. Navigation flows

```text
Plan home ──[New mesocycle]──► New mesocycle ──[Create draft]──► Week (draft)
    │                                     (preset → named empty sessions)
    ├──[Clone previous]──► Choose source ──► Clone setup ──[Create draft]──► Week (draft)
    │                                                     (archived slots marked)
    └──[row]──► Week (draft | active | archived)

Week ──[day row]──► Session builder ──[Add exercise]──► Picker ──[row]──► Plan dialog ──► Session builder
  │                     │  └─[row]──► Edit dialog ──[Replace]──► Picker(replace) ──► confirm ──► Session builder
  │                     └─[Reorder]──► reorder mode (in place)
  ├──[+ Add session]──► Add session dialog ──► Session builder (new)
  ├──[⋯ Move]──► day list ──(occupied)──► Replace dialog ──► Week
  ├──[⋯ Duplicate]──► day list ──(occupied?)──► Replace dialog ──► Session builder (copy)
  ├──[⋯ Remove]──► confirm ──► Week
  ├──[readiness row]──► Details | Session builder (slot highlighted)
  ├──[Edit details]──► Details ──[Save]──► Week
  └──[Activate]──► confirm ──► Week (active); previous active → Previous list
```

- Query state: the picker carries library filters in its URL (same parameters as `/exercises`) so Back/Forward and refresh behave like the library. `replace=<slotId>` survives filter changes.
- The readiness link to an archived slot uses `#slot-<id>`; the session builder scrolls it into view and briefly applies `ring-2 ring-ring` (no animation beyond the ring).
- Every save re-renders the affected server page; there is no client-side cache of plan data.

---

## 8. Interaction specifications

### Keyboard navigation

| Context | Key | Action |
| ------- | --- | ------ |
| Plan / edit dialogs | Enter | Next field; on the last field, submit |
| Any dialog | Escape | Close, focus returns to trigger |
| Week row menu | Enter / Space | Open menu; arrows move; Enter selects |
| Reorder mode | Tab | Moves through ↑/↓ buttons in row order; focus follows the moved row |
| Picker search | Enter | Apply search now; Escape clears |
| Structure cards | Arrow keys | Move selection between radio cards (RadioGroup) |

### Loading states
Route-level `loading.tsx` skeletons per screen as specified above. Buttons show progress text ("Creating…", "Saving…", "Activating…", "Adding…") and disable while pending. Reorder arrows disable while a move is pending.

### Error states
- Field errors inline (`text-sm text-destructive`, `role="alert"`, `aria-invalid`, `aria-describedby`).
- Unexpected failures: destructive `Alert` inside forms/dialogs, toast for row/menu actions. Entered values always stay.
- Server-side state conflicts (session moved meanwhile, plan not ready, active block changed) show the server message and re-render; no optimistic state is left on screen.

### Notifications (Sonner)

| Action | Message | Severity | Duration |
| ------ | ------- | -------- | -------- |
| Mesocycle created | `Draft created` | success | 4s |
| Clone created | `Clone created as a draft` | success | 4s |
| Details saved | `Details saved` | success | 4s |
| Session added | `Session added` | success | 4s |
| Session renamed | `Session renamed` | success | 4s |
| Session moved | `Push Day 1 moved to Thursday` | success | 4s |
| Session duplicated | `Push Day 1 copied to Thursday` | success | 4s |
| Session removed | `Push Day 1 removed` | info | 4s |
| Exercise added | `Cable Crossover added` | success | 4s |
| Exercise updated | `Saved` | success | 3s |
| Exercise replaced | `Cable Fly replaced with Cable Crossover` | success | 4s |
| Exercise removed | `Cable Fly removed from Push Day 1` | info | 4s |
| Activated | `Strength Block is active` | success | 4s |
| Draft archived | `Draft archived. It's under Previous.` | info | 5s |
| Any failure | specific message, e.g. `Couldn't save. Nothing changed.` | error | until dismissed |

### Destructive-looking actions (all are plan authoring, none touch history or the library)

| Action | Pattern | Why |
| ------ | ------- | --- |
| Remove session | `AlertDialog` confirm | Removes the session and its planned exercises from this mesocycle; not undoable |
| Remove exercise from session | Done from inside the Edit dialog, toast confirms | Single row of authoring, quick to re-add |
| Replace occupied day | `Dialog` confirm | Prevents accidental schedule changes; displaced session is kept unscheduled |
| Activate | `AlertDialog` confirm | Changes the current plan and archives the previous one |
| Archive draft | `AlertDialog` confirm | Moves a draft out of Drafts permanently (no unarchive) |

Copy says "Remove" for plan items (sessions and planned exercises, which are authoring) and "Archive" for mesocycles (kept, readable). Exercise Library records are never archived or deleted from plan screens.

---

## 9. Responsive behavior

| Breakpoint | Behavior |
| ---------- | -------- |
| base (<640) | Single column inside the shell's `max-w-screen-sm` main. Sticky bottom action bar above the bottom nav (`bottom-16`). Dialogs nearly full-width with stacked full-width buttons. Week rows: day column + session + menu. |
| `sm` | Same column, dialog buttons side by side. |
| `md` (≥768) | Left rail replaces bottom nav; sticky action bars become static buttons under the content; the New mesocycle Length/Deload fields stay side by side; structure cards stay one per row. |
| `lg` | Centered column; no extra panels. No list/detail split — the week and the session are separate screens at every size. |

Every action (create, clone, add/move/duplicate/remove session, add/edit/replace/remove/reorder exercise, activate, archive draft) is available at the base breakpoint. Nothing depends on hover or drag.

---

## 10. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `AppNav` | shell | extended | adds "Plan" (`CalendarRange` icon) |
| `EmptyState`, `CreatedToast` | feedback | reused | |
| `ExerciseThumb` / `MonogramTile` | rows | reused | |
| `LibraryControls` | picker | reused, base path parameter | same filters and URL contract as `/exercises` |
| `MesocycleStatusBadge` | home, header | new | draft / active / archived |
| `MesocycleSummaryRow` / `ActiveMesocycleCard` | home, clone source | new | |
| `MesocycleForm` | new, clone setup, details | new | variants: create (with structure), clone (prefilled), details (no structure) |
| `StructureCard` | new mesocycle | new | radio card with day skeleton |
| `ReadinessPanel` | week | new | draft (blocking) / active (informational) / ready |
| `WeekList` + `WeekDayRow` | week | new | session / rest / read-only |
| `SessionRowMenu` | week, session header | new | Move, Duplicate, Remove |
| `DayPickerDialog` | move, duplicate | new | shows occupancy; triggers replace confirm |
| `AddSessionDialog`, `RenameSessionDialog` | week, session | new | |
| `PlannedExerciseRow` | session builder | new | normal / needs attention / reorder / read-only |
| `PlannedExerciseDialog` | picker (add), session (edit) | new | sets + rep range fields, no defaults |
| `ActivateDialog`, `ArchiveDraftDialog`, `RemoveSessionDialog` | week | new | `AlertDialog` |
| `StickyActions` | plan screens | new (small) | the bottom action bar pattern already used by library/gyms |
| `RadioGroup`, `AlertDialog` | ui | new shadcn primitives | from the already-installed `radix-ui` package; no new dependency |

---

## 11. Accessibility, privacy, and data sensitivity

- Every icon-only button has an accessible name that includes its object ("Move Cable Fly up", "Push Day 1 actions", "Add a session on Sunday").
- Status and attention states are text (badges, lines), never color alone. The dashed border is reinforcement only.
- Day abbreviations expose full names (`<abbr title="Monday">` or `aria-label`).
- Number fields: `inputMode="numeric"`, `pattern="[0-9]*"`, labels "Sets", "Minimum reps", "Maximum reps" (visually "Reps … – …" with sr-only labels), 44px height.
- Structure radio cards are a real radio group with a legend; arrow keys move between them.
- Readiness rows are links with the full issue sentence as their text.
- Dialogs trap focus; confirmations default-focus Cancel.
- Errors use `role="alert"`; toasts are announced by Sonner's live region.
- Privacy: plan screens show no gym information at all (sessions are not tied to gyms). No share, export, template-publishing, or "community programs" affordance anywhere. No external links.

---

## 12. Out of scope

Designed nothing for (and none of these appear on any plan screen):

- Workout logging, set entry, today's workout on the dashboard, day completion, history, past-log editing (Guided Workout Logging).
- Working weights of any kind — no "starting weight", "target weight", or %1RM field on a planned exercise.
- Progress / hold / deload tags, e1RM, stall detection, charts (Progressive Overload Engine).
- Scheduled-deload load reduction (the deload week is recorded only).
- Missed days (log late / shift / skip) and in-workout exercise swap.
- Gym assignment for sessions or mesocycles.
- Cardio planning on split days (Cardio Logging).
- Goals.
- A "current week" indicator or calendar view of dated workouts.
- Unarchiving a mesocycle (clone forward instead), deleting a mesocycle, deleting library exercises from a plan.

Deferred (later pitch or version, not precluded): dated goals, RPE/RIR, native app, HealthKit, location-pinned gyms.

Permanent non-goals (never): program or mesocycle generation (presets are day names only; nothing is suggested), social features or shared templates, cardio progression, nutrition and body composition.

---

## Overload-specific design checks

- [x] No preset, default, or empty state fills in an exercise, set count, rep range, or weight.
- [x] 5 weeks / deload week 5 are editable pre-fills; other lengths and non-final deload weeks are representable.
- [x] A deload week past the end is shown, never silently moved.
- [x] At most one lifting session per day; occupied days always ask before replacing.
- [x] Duplicates and clones are named copies and land the lifter on the copy.
- [x] Archived exercises stay in their slot, marked, until replaced or removed; never auto-substituted.
- [x] Activation is the only gate; drafts save freely.
- [x] No progress/deload token, tag, or Hold badge appears.
- [x] Removal copy reassures that the library and other mesocycles are untouched.
- [x] All actions work one-handed at the base breakpoint; no drag-only interaction.
- [x] Tailwind + shadcn/ui only; light and dark via tokens; no theme toggle here.
- [x] Every list has empty, loading, and error states.
