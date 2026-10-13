# Goals — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch: Goals (`pitches/06-goals.md`)
**Focus:** How the lifter sets a long-term weight × reps target for a lift, sees how close his demonstrated strength is to it, and is told — once, calmly — when he gets there.

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

---

## 2. Vision

Progression answers "should this go up next time?". Goals answer a different, slower question: **"how close am I to the number I actually care about?"** The lifter types a target he chose — Bench 315 × 1 — and Overload shows one honest percentage computed from the best he has already demonstrated, through the same e1RM the trend chart uses. When the history meets the target, a single calm card says so and offers a blank form for the next one; it never picks the number for him.

**Design north star:** *the target is his; the percentage is the history's — Overload only does the arithmetic.*

---

## 3. Design principles

### 1. The lifter authors, the history measures

Every Goal field is something the lifter typed (Exercise, Gym where needed, weight, reps). Every number Overload adds (percentage, best e1RM, target e1RM) is derived and never editable. No suggested targets, no pre-filled numbers, no "next goal" proposal — the new-goal form after a completion is blank except for the Exercise.

### 2. Unknown is not zero

A Goal with no qualifying performance yet shows **"No performance recorded yet"** and no bar — never `0%` and never an empty bar that reads as zero. A measured percentage and an unmeasured state must look different at a glance.

### 3. One percentage, never more than 100

The primary number is a whole percentage, **floored** so the display only reads `100%` when the target is actually met (99.6% shows `99%`). It never exceeds 100. Above-target strength lives on the Exercise trend, not here.

### 4. Goals sit behind the workout

A pending or in-progress workout owns the dashboard. Goals appear on the dashboard only when there is nothing to do today (day complete, rest day, no plan). Goals never move, hide, or reorder anything in the training loop.

### 5. Reached is quiet, and said once

Completion is a calm full-width card — check icon, "Goal reached", the lift, the Gym where relevant, the target — with **Set a new goal** and **Done**. Either action acknowledges it; it is never shown as a blocking card again. No confetti, animation beyond the stock fade, badge, streak, or sound.

### 6. Archive, don't delete — and gym context is part of the target

Goals are never deleted. Manual archive moves a Goal to history; completed Goals live there too. A machine or cable Goal always shows its Gym, because "200 lb × 10" on one gym's chest press is not the same target at another.

---

## 4. Visual language

### Color palette

| Token / theme path | Usage | Notes |
| ------------------ | ----- | ----- |
| `primary` | progress-bar fill, Goal-reached check icon, Goal-reached card tint (`bg-primary/5`, `border-primary/30`), primary actions | the single accent; Goals use no status color |
| `muted` | progress-bar track | |
| `foreground` | target `315 lb × 1`, percentage numeral | high-contrast numbers |
| `muted-foreground` | Exercise sub-lines, Gym line, best/target e1RM context, dates, "No performance recorded yet" | |
| `card` / `border` | Goal rows, cards, dividers | inherited |
| `destructive` | inline field errors only | never on archive |

The **progress green and deload amber are not used anywhere in Goals.** Green means "Progress tag"; reusing it for "Goal reached" or a full bar would blur two different meanings. Goal completion uses the accent.

### State colors

| State | Visual treatment | Usage |
| ----- | ---------------- | ----- |
| `active` goal, measured | target + whole `NN%` + thin primary bar | currently pursued, history exists |
| `active` goal, no history | target + muted "No performance recorded yet", **no bar, no %** | unmeasured, not zero |
| `active` goal, Exercise archived | normal row + muted `Badge variant="outline"` "Exercise archived" | still readable; manual archive offered |
| `active` goal, Gym archived | normal row + muted outline badge "Gym archived" beside the gym name | still measured at that gym; manual archive offered |
| Goal reached (unacknowledged) | full-width card, `border-primary/30 bg-primary/5`, `CircleCheck` in `text-primary` | one-time acknowledgement |
| `archived` · reached | history row, `CircleCheck` icon (`text-muted-foreground`) + "Reached Oct 12, 2026" | completed by history |
| `archived` · archived manually | history row, `Archive` icon (`text-muted-foreground`) + "Archived Sep 3, 2026" | retired by the lifter |

Color is reinforcement only: every state also has its text label.

### Typography, spacing, radius, elevation

Inherited. Goal-specific usage:

- Target on cards/rows: `text-base font-medium tabular-nums` (`315 lb × 1`). On the detail page: `text-2xl font-semibold tabular-nums tracking-tight`.
- Percentage: `text-2xl font-semibold tabular-nums tracking-tight` on rows; `text-4xl` on detail.
- Progress bar: `h-1.5 rounded-full bg-muted` track, `bg-primary` fill. Decorative (`aria-hidden`); the percentage text is the accessible value.
- Cards: stock `rounded-lg border bg-card`. No shadows.

### Appearance

Light, dark, system (system default; toggle in Settings only). All Goal surfaces use tokens; `bg-primary/5` and `border-primary/30` resolve against each mode's accent. Nothing in Goals is mode-specific.

---

## 5. Information architecture

Pitch 1 owns the shell. This pitch adds one primary destination, **Goals**, to the nav (bottom bar on mobile, left rail at `md+`), between History and Exercises, with the lucide `Target` icon.

```text
┌──────────────────────────────────────────────────────────────┐
│  Overload                                                      │
├──────────────────────────────────────────────────────────────┤
│  Today   ── pending/in-progress workout (unchanged, primary)   │
│             day complete → session summary                     │
│                 + "Goals" rows for goals this workout touched  │ ← new
│                 + Goal-reached card(s) if any unacknowledged   │ ← new
│                 + compact active goals (≤3) → /goals           │ ← new
│             rest day / no plan → compact active goals          │ ← new
│  Plan    ── (unchanged)                                        │
│  History ── edit a past set → goal % follows on next view      │
│  Goals   ── /goals            active goals + reached card(s)   │ ← new
│               → /goals/new          pick an exercise           │
│                   → /goals/new/[exerciseId]  target form       │
│               → /goals/[goalId]     detail · archive           │
│               → /goals/history      reached + archived         │
│  Exercises ─ (unchanged; e1RM trend shows above-target best)  │
│  Gyms    ── (unchanged)                                        │
└──────────────────────────────────────────────────────────────┘
 Bottom bar (mobile): Today · Plan · History · Goals · Exercises · Gyms
```

Hierarchy on `/goals`: unacknowledged Goal-reached card(s) first (rare), then the active list (primary), then a single quiet link to history (secondary).

---

## 6. Screen specifications

### Screen 1: Goals overview

#### Purpose
Show every target the lifter is currently pursuing and how close he is to each.

#### URL pattern
`/goals`

#### Trigger
Goals in the nav; "All goals" from the dashboard; back from detail/history/creation.

#### Layout

```text
┌────────────────────────────────────┐
│ Overload                           │
├────────────────────────────────────┤
│ Goals                              │
│                                    │
│ ┌────────────────────────────────┐ │  ← only if a completion is
│ │ ✓ Goal reached                 │ │    unacknowledged (Screen 6)
│ │ Overhead Press                 │ │
│ │ 155 lb × 8                     │ │
│ │ [Set a new goal]  [Done]       │ │
│ └────────────────────────────────┘ │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ Barbell Bench Press        87% │ │
│ │ 315 lb × 1                     │ │
│ │ ███████████████████░░░         │ │
│ ├────────────────────────────────┤ │
│ │ Hack Squat                 92% │ │
│ │ 365 lb × 5                     │ │
│ │ ████████████████████░          │ │
│ ├────────────────────────────────┤ │
│ │ Chest Press Machine            │ │
│ │ Downtown Gym                   │ │
│ │ 200 lb × 10                    │ │
│ │ No performance recorded yet    │ │
│ └────────────────────────────────┘ │
│                                    │
│ Goal history (4)                 › │
├────────────────────────────────────┤
│          [ + New goal ]            │  ← h-11, thumb reach
├────────────────────────────────────┤
│ Today Plan History Goals Ex. Gyms  │
└────────────────────────────────────┘
```

#### Active goal row

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Row** | `<Link>` row inside a `divide-y rounded-lg border bg-card` list; `min-h-16 p-4` | whole row opens `/goals/[goalId]` |
| **Exercise name** | `text-sm font-medium` | truncates with ellipsis |
| **Gym line** | `text-xs text-muted-foreground` | gym-variable goals only; "· Gym archived" outline badge if archived |
| **Target** | `text-base font-medium tabular-nums` — `315 lb × 1` | |
| **Percentage** | `text-2xl font-semibold tabular-nums tracking-tight`, right-aligned | floored whole number, ≤ 100; absent when unmeasured |
| **Bar** | `GoalProgressBar` — `h-1.5 bg-muted` track, `bg-primary` fill at `percent%` | absent when unmeasured |
| **No history** | `text-sm text-muted-foreground` "No performance recorded yet" | replaces % and bar |
| **Exercise archived** | `Badge variant="outline"` muted "Exercise archived" after the name | row otherwise unchanged |

Order: oldest active goal first (the order he set them). Stable; percentages never reorder the list.

#### Code reference

```tsx
<ul className="divide-y divide-border rounded-lg border border-border bg-card">
  {goals.map((g) => (
    <li key={g.id}>
      <Link href={`/goals/${g.id}`} className="flex min-h-16 items-center gap-4 p-4">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-medium">{g.exerciseName}</p>
          {g.gymName && <p className="text-xs text-muted-foreground">{g.gymName}</p>}
          <p className="text-base font-medium tabular-nums">{g.targetLabel}</p>
          {g.percent == null ? (
            <p className="text-sm text-muted-foreground">No performance recorded yet</p>
          ) : (
            <GoalProgressBar percent={g.percent} />
          )}
        </div>
        {g.percent != null && (
          <span className="text-2xl font-semibold tabular-nums tracking-tight">{g.percent}%</span>
        )}
      </Link>
    </li>
  ))}
</ul>
```

#### Empty state

```text
│ Goals                              │
│ ┌────────────────────────────────┐ │
│ │ No goals yet.                  │ │
│ │ Set a weight × reps target for │ │
│ │ a lift to track it here.       │ │
│ └────────────────────────────────┘ │
│ Goal history (2)                 › │  ← only if history exists
├────────────────────────────────────┤
│          [ + New goal ]            │
```

`EmptyState` (existing component) with title "No goals yet." and description "Set a weight × reps target for a lift to track it here." The primary action stays in the bottom action bar.

#### Loading state
`Skeleton` rows shaped like the list (three `h-16` rows with a short line, a number block, and a bar line). The action bar renders immediately.

#### Error state
Route `error.tsx` (existing `(app)` boundary): "Couldn't load your goals." with **Try again**. No partial list.

#### Behavior
- Rendering this page first reconciles completion server-side (spec); a goal whose history now meets its target appears as a Goal-reached card, never as a `100%` active row.
- No inline edit; targets are immutable once set (to change a target, archive and set a new one — see Screen 4).

---

### Screen 2: New goal — pick an exercise

#### Purpose
Choose which lift the goal is for, from active exercises only.

#### URL pattern
`/goals/new` (library filter params: `?q=`, `?muscle=`, `?view=`)

#### Trigger
**New goal** on `/goals`; empty-state action.

#### Layout

```text
┌────────────────────────────────────┐
│ ‹ Goals                            │
│ New goal                           │
│ Pick the lift.                     │
│ [ Search exercises…            ]   │
│ [All] [Favorites]  Muscle ▾        │
│ ┌────────────────────────────────┐ │
│ │ ▣ Barbell Bench Press          │ │
│ │   Chest · Barbell   Active goal│ │ ← has active goal → links to it
│ ├────────────────────────────────┤ │
│ │ ▣ Chest Press Machine        › │ │
│ │   Chest · Machine              │ │
│ ├────────────────────────────────┤ │
│ │ IP Incline Press (custom)    › │ │ ← monogram tile, no image
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Search + filters** | existing `LibraryControls` (same as the session-builder picker) | same params and behavior as the library |
| **Exercise row** | existing thumb + name + `Muscle · Equipment` sub-line, `min-h-16` | opens `/goals/new/[exerciseId]` |
| **"Active goal" marker** | `Badge variant="secondary"` "Active goal" | row links to that goal's detail instead of the form |

Archived exercises never appear (the library query excludes them). Imported and custom exercises are equally eligible.

#### Empty / no-results states
Reuse the session-builder picker's empty states verbatim (catalog not imported; no favorites; no match → "Add “…” as a custom exercise"; clear filters).

#### Loading / error
Library list skeleton; `(app)` error boundary.

---

### Screen 3: New goal — target form

#### Purpose
Enter the target: Gym (machine/cable only), weight, reps.

#### URL pattern
`/goals/new/[exerciseId]` (optional `?gymId=` pre-selects the Gym — used by "Set a new goal")

#### Trigger
Choosing an exercise on Screen 2; **Set a new goal** on a Goal-reached card or a history row.

#### Layout — free weight (gym-consistent)

```text
┌────────────────────────────────────┐
│ ‹ Pick another lift                │
│ New goal                           │
│ ▣ Barbell Bench Press              │
│   Chest · Barbell                  │
│                                    │
│ Target                             │
│ [  315  ] lb   ×   [   1  ] reps   │  ← inputMode decimal / numeric
│                                    │
│ Counts your best session at any    │
│ gym.                               │
├────────────────────────────────────┤
│           [ Set goal ]             │
└────────────────────────────────────┘
```

#### Layout — machine / cable (gym-variable)

```text
│ ▣ Chest Press Machine              │
│   Chest · Machine                  │
│                                    │
│ Gym                                │
│ [ Downtown Gym                ▾ ]  │  ← required, active gyms only
│ Machine weights differ by gym, so  │
│ this goal counts sessions at this  │
│ gym only.                          │
│                                    │
│ Target                             │
│ [  200  ] lb   ×   [  10  ] reps   │
```

#### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Gym | `Select` of active gyms | gym-variable only | `?gymId=` if active, else none (or the only gym, if exactly one) | "Choose the gym this goal is measured at." |
| Target weight | `Input inputMode="decimal"`, suffix "lb" | yes | **blank** | > 0 and ≤ 9999.99 — "Enter a weight above 0." |
| Target reps | `Input inputMode="numeric"`, suffix "reps" | yes | **blank** | whole number 1–1000 — "Enter whole reps, 1 or more." |

No date, note, e1RM, percentage, mesocycle, or expected-completion field exists. Numbers are never pre-filled — not even after a completion.

#### Validation
- Inline errors under each field (`text-sm text-destructive`, `aria-describedby`). Submit stays enabled; server validation returns field details and the form re-renders with the typed values kept.
- **Duplicate active goal** (exercise already has one — possible if it was set in another tab): an `Alert` above the form replaces the fields:

```text
│ ┌────────────────────────────────┐ │
│ │ Barbell Bench Press already    │ │
│ │ has an active goal: 315 lb × 1 │ │
│ │ (87%). Archive it to set a     │ │
│ │ different one.                 │ │
│ │ [View goal]                    │ │
│ └────────────────────────────────┘ │
```
  This is also what the page shows if opened directly for an exercise that already has an active goal — at any gym. Picking a different gym never makes a second active goal possible.
- **No active gyms** (gym-variable exercise): `Alert` "Add a gym first — machine goals are measured at one gym." with **Add gym** (`/gyms/new`). Weight/reps hidden.
- **Archived exercise** (stale link): `EmptyState` "Barbell Row is archived. Goals can only be set for active exercises." with **Pick another lift**.

#### Behavior
- **Set goal** → creates the goal.
  - Not yet reached → navigate to `/goals/[goalId]`, toast "Goal set" (success, 4s).
  - **Already reached by existing history** → navigate to `/goals/[goalId]`, which leads with the Goal-reached card (Screen 6) reading "Already reached — your best session meets this target." No toast; the card is the message. The goal is in history immediately; it never appears as an active `100%` row.
- Pending state: button reads "Setting goal…" and is disabled; fields stay editable values.
- Server failure: toast error "Couldn't set the goal. Your numbers are still here." (until dismissed); values preserved.

---

### Screen 4: Goal detail

#### Purpose
One goal in full: target, percentage, the best performance behind it, and the archive action.

#### URL pattern
`/goals/[goalId]`

#### Trigger
A row on `/goals`, `/goals/history`, the dashboard, or a post-session goal row; redirect after creation.

#### Layout — active, measured

```text
┌────────────────────────────────────┐
│ ‹ Goals                            │
│ Barbell Bench Press                │
│ Goal · set Sep 2, 2026             │
│                                    │
│ 315 lb × 1                    87%  │  ← target; % text-4xl
│ ████████████████████░░░            │
│                                    │
│ Best      274 lb e1RM              │
│           from 235 × 5 · Sep 30    │
│ Target    315 lb e1RM              │
│ ────────────────────────────────── │
│ Best session across all gyms.      │
│ Epley estimate, same as the trend. │
│ e1RM trend ›                       │  → /exercises/[id]
│                                    │
├────────────────────────────────────┤
│        [ Archive goal ]            │  ← outline, not destructive
└────────────────────────────────────┘
```

#### Layout — active, gym-variable, no history

```text
│ Chest Press Machine                │
│ Downtown Gym · set Oct 1, 2026     │
│                                    │
│ 200 lb × 10                        │
│ No performance recorded yet        │
│ at Downtown Gym.                   │
│ Target    267 lb e1RM              │
│ ────────────────────────────────── │
│ Only sessions at Downtown Gym      │
│ count toward this goal.            │
```

#### Layout — active, Exercise or Gym archived

```text
│ Barbell Row  [Exercise archived]   │
│ ...target / % / best as usual...   │
│ ┌────────────────────────────────┐ │
│ │ This exercise is archived, so  │ │
│ │ new sessions won't add to this │ │
│ │ goal. Archive the goal when    │ │
│ │ you're done with it.           │ │
│ └────────────────────────────────┘ │
```
(Gym archived: "Downtown Gym is archived. This goal stays measured there; archive it when you're done with it.")

#### Layout — archived (history)

```text
│ ‹ Goal history                     │
│ Overhead Press                     │
│ ✓ Reached Oct 12, 2026             │   or   ▣ Archived Sep 3, 2026
│                                    │
│ 155 lb × 8                         │
│ Set Aug 4, 2026                    │
│ ────────────────────────────────── │
│ e1RM trend ›                       │
├────────────────────────────────────┤
│        [ Set a new goal ]          │  ← only if exercise active and
└────────────────────────────────────┘    no other active goal for it
```

No percentage is shown on an archived goal. Its lifecycle is the record; live history may since have changed (a later downward correction never reopens it), so showing a re-derived number beside "Reached" would contradict itself.

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Target** | `text-2xl font-semibold tabular-nums tracking-tight` | |
| **Percentage** | `text-4xl font-semibold tabular-nums tracking-tight` | active + measured only |
| **Best line** | `dl` grid, `text-sm tabular-nums`; label `text-muted-foreground` | best session e1RM (rounded lb) + the set that produced it + date |
| **Target e1RM** | same `dl` row | always shown on active goals; for a 1-rep target equals the weight |
| **Scope note** | `text-xs text-muted-foreground` | free weight: "Best session across all gyms."; machine: "Only sessions at {Gym} count toward this goal." |
| **e1RM trend ›** | `Link` `text-primary text-sm` | `/exercises/[id]` (`?gym=` for machine goals) |
| **Archive goal** | `Button variant="outline" className="h-11 w-full"` in the action bar | opens confirmation (below) |

#### Archive confirmation (dialog)

```text
┌────────────────────────────────┐
│ Archive this goal?             │
│ Barbell Bench Press · 315 lb   │
│ × 1 moves to goal history.     │
│ Your training history isn't    │
│ touched. To chase it again,    │
│ set it as a new goal.          │
│                                │
│ [ Archive goal ]               │
│ [ Cancel ]                     │
└────────────────────────────────┘
```

`Dialog` (not destructive red; archiving is soft). Confirm → toast "Goal archived" (info, 4s), navigate to `/goals`. **No Undo**: an archived goal is a lifecycle record and never reactivates; setting it again is a new goal (one tap from the history row).

#### Loading / error / not found
Skeleton of the header, target, and `dl`. Unknown id → app `not-found`. Archive failure → toast error "Couldn't archive the goal. Nothing changed." (until dismissed), dialog stays open.

---

### Screen 5: Goal history

#### Purpose
Review past targets — reached and retired — without cluttering the active list.

#### URL pattern
`/goals/history`

#### Layout

```text
│ ‹ Goals                            │
│ Goal history                       │
│ ┌────────────────────────────────┐ │
│ │ Overhead Press                 │ │
│ │ 155 lb × 8                     │ │
│ │ ✓ Reached Oct 12, 2026         │ │
│ ├────────────────────────────────┤ │
│ │ Chest Press Machine            │ │
│ │ Campus Rec Center (archived)   │ │
│ │ 180 lb × 10                    │ │
│ │ ▣ Archived Sep 3, 2026         │ │
│ ├────────────────────────────────┤ │
│ │ Barbell Row (archived)         │ │
│ │ 225 lb × 5                     │ │
│ │ ✓ Reached Jul 20, 2026         │ │
│ └────────────────────────────────┘ │
```

Rows ordered most-recently archived first; each opens `/goals/[goalId]`. Outcome line: `CircleCheck` + "Reached {date}" or `Archive` icon + "Archived {date}", both `text-muted-foreground` (no status color). Archived exercises/gyms are named with "(archived)" in muted text — never hidden.

Empty state: "No goal history yet. Reached and archived goals appear here."

---

### Screen 6: Goal reached (card)

#### Purpose
Tell the lifter, once, that his history met a target, and offer the next one.

#### Where it appears
At the top of `/goals`, at the top of `/goals/[goalId]` for that goal, and on the dashboard's day-complete / rest state — for every **completed goal not yet acknowledged**. Not on the history list, not in a dialog, not as a toast.

#### Layout

```text
┌────────────────────────────────────┐
│ ⊙ Goal reached                     │  ← CircleCheck text-primary
│                                    │
│ Barbell Bench Press                │
│ Downtown Gym                       │  ← gym-variable only
│ 315 lb × 1                         │  ← text-2xl semibold tabular
│                                    │
│ [ Set a new goal ]   [ Done ]      │
└────────────────────────────────────┘
```

Variant "already reached at creation": a muted line under the target — "Already reached — your best session meets this target."

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Card** | `rounded-lg border border-primary/30 bg-primary/5 p-5` | stock fade-in only |
| **Heading** | `CircleCheck` `size-5 text-primary` + "Goal reached" `text-sm font-medium` | `role="status"` on the card |
| **Set a new goal** | `Button` (primary) `h-11` | acknowledges, then opens `/goals/new/[exerciseId]` (+`?gymId=` if gym-variable and the gym is active); fields blank. If the exercise is archived it opens `/goals/new` instead. |
| **Done** | `Button variant="ghost"` `h-11` | acknowledges; card disappears in place |

Acknowledgement is stored once (spec); after it the goal only appears in history. Multiple unacknowledged completions stack, newest first (rare).

---

### Screen 7: Dashboard — goals when nothing is pending

#### Purpose
Let active goal progress fill the alternate front-facing state, without ever competing with a workout.

#### URL pattern
`/`

#### Rules
| Dashboard state | Goal content |
| --------------- | ------------ |
| Missed-day prompt | **none** |
| Workout pending / in progress | **none** |
| Day complete | session summary (with its Goals section, Screen 8) → Goal-reached card(s) → compact active goals |
| Rest day / no active plan | the existing message → Goal-reached card(s) → compact active goals |
| No active goals | a single muted line "No active goals. Set one ›" (day complete / rest / no plan only) |

#### Layout — day complete

```text
│ Today · Mon, Oct 12                │
│ ┌────────────────────────────────┐ │
│ │ ✓ Push Day 1 complete          │ │
│ │ Downtown Gym · 5 exercises …   │ │
│ │ …progression rows (Pitch 5)…   │ │
│ │ Goals                          │ │
│ │ Barbell Bench Press  87% → 90% │ │
│ │ [View workout]  History →      │ │
│ └────────────────────────────────┘ │
│                                    │
│ Goals                   All goals ›│
│ ┌────────────────────────────────┐ │
│ │ Barbell Bench Press        90% │ │
│ │ 315 lb × 1  ██████████████████ │ │
│ │ Hack Squat                 92% │ │
│ │ 365 lb × 5  ███████████████████│ │
│ │ Chest Press Machine            │ │
│ │ 200 lb × 10 · No performance … │ │
│ └────────────────────────────────┘ │
```

Compact list shows at most **three** active goals (same order as `/goals`), then "All goals ›". Each row opens the goal. No chart, no stats, no extra cards.

---

### Screen 8: Post-session — goals this workout touched

#### Purpose
In the day-complete summary, show only the goals today's work actually measured.

#### Rules
- A goal is **touched** when the completed workout includes a completed performance of its exercise — the performed exercise (swaps count to what was actually done) — and, for a machine goal, at the goal's gym.
- Untouched goals never appear here.
- Row content: exercise · target · `before% → after%` when both are measured and differ; `after%` alone when unchanged or when this was the first measured session; **"Goal reached"** (with `CircleCheck`, `text-primary`) when this workout completed it.
- No section at all when nothing was touched.

```text
│ Goals                              │
│ Barbell Bench Press · 315 × 1      │
│                         87% → 90%  │
│ Overhead Press · 155 × 8           │
│                     ⊙ Goal reached │
```

---

### Screen 9: Correcting a past set → goal follows

No new UI. Editing a set from History (Pitch 4 dialog) changes the derived best; the next view of `/goals`, a detail page, or the dashboard shows the new percentage. If the correction lifts an active goal to its target, the next view shows the Goal-reached card. If it lowers the best behind an already-reached goal, that goal stays "Reached" in history.

---

## 7. Navigation flows

```text
Goals ─[New goal]→ /goals/new ─[row]→ /goals/new/[ex] ─[Set goal]→ /goals/[id]
                                │                              (reached? card leads)
                                └[row with Active goal]→ /goals/[id]

/goals/[id] (active) ─[Archive goal]→ dialog ─[confirm]→ /goals + toast

Goal-reached card ─[Set a new goal]→ /goals/new/[ex]?gymId=… (blank numbers)
                  └[Done]→ card removed in place

History → day → edit set → (Today/Goals next view shows new %)

Today (day complete) → summary Goals rows ─[row]→ /goals/[id]
                     → compact goals ─[All goals]→ /goals
```

All navigation is full-page except the archive dialog. Back links are explicit (`‹ Goals`, `‹ Pick another lift`, `‹ Goal history`).

---

## 8. Interaction specifications

### Keyboard navigation

| Context | Key | Action |
| ------- | --- | ------ |
| Target form | Tab / Shift+Tab | Gym → weight → reps → Set goal |
| Target form | Enter | submits |
| Archive dialog | Escape | closes, focus returns to **Archive goal** |
| Goal rows | Enter | opens the goal |

### Loading states
`loading.tsx` skeletons for `/goals`, `/goals/history`, `/goals/[id]`, `/goals/new`. Action bars render immediately.

### Error states
Inline field errors on the form; `Alert` for duplicate / no gym; `(app)` error boundary with retry for failed loads. A failure to reconcile completion never blocks a page — the page renders from derived values regardless.

### Notifications

| Action | Message | Severity | Duration |
| ------ | ------- | -------- | -------- |
| Goal set (not yet reached) | `Goal set` | success | 4s |
| Goal archived | `Goal archived` | info | 4s |
| Set goal failed | `Couldn't set the goal. Your numbers are still here.` | error | until dismissed |
| Archive failed | `Couldn't archive the goal. Nothing changed.` | error | until dismissed |

Goal completion is **not** a toast; it is the card.

### Destructive actions
Only **Archive goal**, with the dialog above. No delete exists anywhere.

---

## 9. Responsive behavior

| Breakpoint | Behavior |
| ---------- | -------- |
| base | single column; **New goal**, **Set goal**, **Archive goal**, **Set a new goal** at the bottom within thumb reach (`h-11`) |
| `sm` | wider column |
| `md`+ | left rail with Goals; content `max-w-2xl` centered; Goals list rows unchanged; the target form's weight/reps sit in one row; detail `dl` gains width only |

Nothing is hidden at any width; every action exists on the phone.

---

## 10. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `AppNav` | shell | reused | + Goals item (`Target` icon) |
| `GoalProgressBar` | rows, detail, dashboard | new | decorative bar; `percent` 0–100 |
| `GoalRow` | `/goals`, dashboard (compact) | new | variants: measured, no history, exercise archived, gym archived |
| `GoalReachedCard` | `/goals`, detail, dashboard | new (client island) | `alreadyReached` variant; Set a new goal / Done |
| `GoalTargetForm` | `/goals/new/[exerciseId]` | new (client island) | gym select (variable only), weight, reps |
| `ArchiveGoalButton` | detail | new (client island) | dialog, no undo |
| `GoalHistoryRow` | `/goals/history` | new | reached / archived outcome |
| `SessionGoalRows` | dashboard summary | new | before → after / reached |
| `LibraryControls`, exercise thumb, `EmptyState`, `Alert`, `Dialog`, `Select`, `Input`, `Badge`, `Skeleton` | — | reused | |

---

## 11. Accessibility, privacy, and data sensitivity

- Percentage is real text; the bar is `aria-hidden`. Row link accessible name: "Barbell Bench Press, 315 pounds by 1, 87 percent" / "…, no performance recorded yet".
- Goal-reached card is `role="status"`; its buttons have explicit names ("Set a new goal for Barbell Bench Press", "Done").
- Weight `inputMode="decimal"`, reps `inputMode="numeric"`, labels visible, errors linked by `aria-describedby`; 44px targets.
- Dialog traps focus; Escape closes; focus returns to its trigger.
- Gym **names** appear on goal surfaces (they are measurement context); gym **addresses** never do.
- No share, export, or visibility affordance; no external links.

---

## 12. Out of scope

From the pitch (do not design): target dates, deadlines, reminders, expected completion, on-track/behind, pacing, feasibility or difficulty rating, rate prediction, AI coaching, suggested/generated/auto-increased goals, goal-driven program or rep-range changes, editing a goal's target in place, goal deletion, undoing an archive, multiple simultaneous goals for one exercise (including at different gyms), a per-goal chart, cardio/nutrition/body-composition goals.

Deferred (later pitch, don't preclude): dated goals and feasibility feedback; RPE/RIR.

Permanent non-goals: program generation; social features (sharing, leaderboards); progression analysis of cardio; nutrition and body composition in this build; streaks, badges, XP, confetti.

## Open Questions

None. Every UI decision above is settled by the pitch and the run's pre-resolved decisions; the remaining choices (floored percentage, no undo on archive, three-goal dashboard cap, stable creation order, history shows no re-derived %) are recorded as design decisions here and carried into the spec's Resolved Decisions.
