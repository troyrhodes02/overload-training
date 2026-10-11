# Guided Workout Logging — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 4: Guided Workout Logging
**Focus:** How the lifter records what actually happened on a training day — starting and resuming a workout, logging sets on a per-exercise card, swapping an unavailable movement, resolving a missed day, and correcting a past set — all one-handed on a phone in a gym.

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

---

## 2. Vision

Guided Workout Logging answers one question at a time: **"What did I just lift?"** The lifter opens the app in the gym, sees today's planned session as the single focal block, picks the gym, and walks exercise by exercise entering weight and reps — then closes the app knowing the day is permanently and correctly recorded. When life interferes — a missed day, a broken machine, a mistyped weight — the app offers a calm, explicit way to reconcile reality without ever rewriting the plan.

This pitch records facts; it never judges them. No progress call, no e1RM, no chart.

**North star:** *the card gets out of the way of the bar.*

---

## 3. Design principles

### 1. One thing now
The dashboard shows today's unresolved session as the single focal block. A completed day goes quiet; it does not hand off to tomorrow. A missed day is the one thing that can take precedence over today, and only until it is resolved.

### 2. Numbers over decoration
On the logging card, weight and reps are the largest things on screen, in tabular numerals that line up column-true. When space is tight, the chrome shrinks, not the numbers.

### 3. Missing is not zero
An un-entered set is incomplete, shown as an empty slot — never a logged `0 × 0`. A set becomes history only when both a positive weight and positive reps are saved. Unsaved input is always visually distinct from saved history.

### 4. Record reality, never rewrite the plan
A swap, a shift, a late log, a correction — all change the *logged* record or a *dated resolution*. None of them touch the authored Session, its exercises, its days, or its rep ranges. The plan is the question; the log is the answer.

### 5. History is editable, never destructible
A past set's weight and reps can be corrected and the stored value visibly follows. There is no delete — no "remove set," no "remove workout." Archived exercises and gyms still render in the workouts where they were used.

### 6. Thumb first
Primary actions (Start, Save set, Next exercise, Finish) sit at the bottom within reach. Numeric fields open the numeric keypad; tap targets stay at least 44px.

---

## 4. Visual language

#### Color palette

| Token | Usage | Notes |
| ----- | ----- | ----- |
| `background` / `foreground` | app canvas, primary text | |
| `card` / `card-foreground` | session block, exercise card, history rows | |
| `border` | card edges, set-row dividers, field outlines | |
| `muted` / `muted-foreground` | secondary context (gym name, rep range, dates), archived items, completed-day state | |
| `primary` / `primary-foreground` | the single bottom action per screen (Start, Save, Next, Finish) | |
| `destructive` | validation errors, failed-save alerts | plain text + icon, never color alone |

No progress/deload status tokens are used in this pitch — those tags do not exist yet (Pitch 5). This feature introduces **no** new status colors.

#### State colors (day/session state only — these are display labels, not stored enum names)

| State | Visual treatment | Usage |
| ----- | ---------------- | ----- |
| Pending (not started) | normal card, `primary` Start action | today's planned session, no sets yet |
| In progress | normal card, `primary` Resume action, "N of M logged" in `muted-foreground` | partially logged session |
| Complete | `muted` check affordance, quiet | finished day; no tag, no analytics |
| Skipped | `muted-foreground` text label "Skipped" | resolved missed day, no workout recorded |
| Shifted | `muted-foreground` text label "Shifted" on the week view | dated current-week resolution |
| Rest / no session | quiet empty state | no lifting session planned today |
| Needs substitution | `destructive`-tinted text "Unavailable — choose a substitute" | archived planned exercise in today's plan |

Color is always paired with a readable text label. Archived exercises/gyms in history render in `muted-foreground` with their name intact — never "Unknown exercise."

#### Typography, spacing, radius, elevation

Reference `overload-ui-design` for the scale. Feature-specific usage: set-entry weight/reps use the **large tabular-numeral** style; the rep-range context and gym name use the small `muted-foreground` style. The exercise card is a single elevated `Card`; set rows are divided by `border`, not nested cards.

#### Appearance

Light, dark, system (default), chosen in Settings only. Every surface here is defined in tokens and must read in both modes. The logging card's set rows rely on `border` + `muted-foreground` rather than fills, so they hold up identically in dark mode.

---

## 5. Information architecture

The app shell and bottom navigation come from Foundation (Pitch 1). Guided Workout Logging lives primarily under **Today** and adds a **History** surface.

```text
┌──────────────────────────────────────────────┐
│  Overload                                      │
├──────────────────────────────────────────────┤
│  Today  ── [missed-day prompt, if any]         │
│            today's session block               │
│              · Pending    → [Start]            │
│              · In progress→ [Resume]           │
│              · Complete   → quiet done state   │
│              · Rest       → quiet rest state   │
│            [Start]/[Resume] → Gym select (if   │
│                       new) → Workout runner    │
│                       → Exercise card (×N)     │
│                       → Swap picker            │
│                       → Completion summary     │
│  Plan   ── Mesocycles, Exercise library (P2/P3)│
│  History ─ Week at a glance → logged day       │
│                       → edit a set             │
│  Settings ─ Appearance, Gyms, Archive          │
└──────────────────────────────────────────────┘
 Bottom bar (mobile): Today · Plan · History · Settings
```

Primary content hierarchy on Today: (1) unresolved missed-day prompt, (2) today's session, (3) nothing else. History is secondary: training-record navigation, not statistics.

---

## 6. Screen specifications

## Screen 1: Today — Dashboard

### Purpose
Tell the lifter the one thing that matters right now: resolve a missed day, start/resume today's workout, or rest.

### URL pattern
`/` (the authenticated Today page)

### Trigger
App open; return to Today tab; navigation back after completing or leaving a workout.

### Layout — Pending (not started)

```text
┌────────────────────────────────────┐
│  Today · Mon, Nov 2                 │
│                                     │
│  Push Day 1                         │
│  Week 2 · 5 exercises               │
│  ┌─────────────────────────────┐    │
│  │ Barbell Bench Press  3×6–8  │    │
│  │ Incline DB Press     3×8–10 │    │
│  │ Cable Fly            3×12–15│    │
│  │ … 2 more                    │    │
│  └─────────────────────────────┘    │
│                                     │
│            [ Start workout ]        │
└────────────────────────────────────┘
```

### Layout — In progress (resume)

```text
┌────────────────────────────────────┐
│  Today · Mon, Nov 2                 │
│                                     │
│  Push Day 1 · Downtown Gym          │
│  Week 2 · 2 of 5 exercises logged   │
│  …exercise list with ✓ on done…     │
│                                     │
│            [ Resume workout ]       │
└────────────────────────────────────┘
```

### Layout — Complete (quiet)

```text
┌────────────────────────────────────┐
│  Today · Mon, Nov 2                 │
│                                     │
│  ✓ Push Day 1 complete              │
│  Downtown Gym · 5 exercises ·       │
│  14 sets logged                     │
│                                     │
│  [ View workout ]   History →       │
└────────────────────────────────────┘
```
No tomorrow's plan, no progression, no goal content. Just acknowledgment and navigation.

### Layout — Rest / no lifting session today

```text
┌────────────────────────────────────┐
│  Today · Sun, Nov 1                 │
│                                     │
│  No lifting planned today.          │
│  Rest up.                           │
│                                     │
│  History →                          │
└────────────────────────────────────┘
```

### Component / section table

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| Date header | plain `text-muted-foreground` | today's calendar date |
| Session block | `Card` | shows session name, mesocycle week, ordered planned exercises (read-only preview) |
| Exercise preview rows | list inside `CardContent`, `tabular-nums` for `3×6–8` | ✓ marker on exercises already complete when in progress |
| Primary action | `Button` size lg, `primary`, bottom | "Start workout" / "Resume workout" / "View workout" |
| Completed summary | `muted-foreground` text | session name, gym, exercise + set counts |

### Code reference
```tsx
<section className="space-y-6">
  <p className="text-muted-foreground">{formatPlanDate(today)}</p>
  <Card className="bg-card border-border">
    <CardHeader>
      <CardTitle className="text-base font-medium">{session.name}</CardTitle>
      <p className="text-sm text-muted-foreground">
        Week {week} · {session.exercises.length} exercises
      </p>
    </CardHeader>
    <CardContent className="space-y-1 tabular-nums">
      {session.exercises.map((e) => (
        <PlannedExerciseRow key={e.id} exercise={e} done={e.complete} />
      ))}
    </CardContent>
  </Card>
  <Button size="lg" className="w-full">{ctaLabel}</Button>
</section>
```

### Empty state
When no active mesocycle exists at all: "No active plan. Build one in Plan →". When an active plan exists but today is unscheduled: the Rest state above.

### Loading state
`Skeleton` for the session block (header line + 3 rows) and a disabled full-width button placeholder. Layout height matches the loaded state so nothing jumps.

### Error state
If today's plan fails to load, `Alert` (`destructive`) "Couldn't load today's plan." with a `[Retry]` button. The dashboard never silently shows "rest" when the real cause was a load failure.

### Behavior
- Start → if no LoggedSession exists for today's effective occurrence, open Gym selection, then create the LoggedSession and enter the runner. If one exists, resume it directly.
- A completed session for today shows the quiet complete state and never reverts to "pending."
- If an unresolved missed day exists, the **Missed-day prompt (Screen 2)** renders above the session block and takes visual precedence until resolved.

---

## Screen 2: Missed-day prompt

### Purpose
Let the lifter reconcile a planned training day that passed without completion or resolution — exactly three choices, one tap each.

### URL pattern
Rendered inline at the top of `/` (Today). Not a separate route. A blocking `Dialog` on first open of the day; thereafter an inline banner so it can be returned to.

### Trigger
On Today load, when the effective schedule contains the **oldest** unresolved missed planned lifting day (past calendar date, no complete LoggedSession, no persisted resolution).

### Layout

```text
┌────────────────────────────────────┐
│  You missed a workout               │
│                                     │
│  Push Day 1 — Fri, Oct 30           │
│  (2 days ago)                       │
│                                     │
│  [ Log it late ]                    │
│  [ Shift the week ]                 │
│  [ Skip it ]                        │
└────────────────────────────────────┘
```

### Component table

| Element | shadcn/ui component | Behavior |
| ------- | ------------------- | -------- |
| Container | `Dialog` (first encounter) → `Card` banner | focus trapped while dialog open |
| Missed day identity | title + `muted-foreground` date | names the session and its **original** planned date, with relative age |
| Three choices | three equal `Button`s, stacked, full width | each one tap; order fixed: Log late, Shift, Skip |

### Behavior & flows
- **Log it late** → opens Gym selection then the workout runner for that **missed occurrence**; the runner header shows the historical date prominently ("Logging Fri, Oct 30"). The LoggedSession's performed date is the missed day, not today.
- **Shift the week** → shows a one-line confirmation of the effect ("Remaining days this week each move forward one day. Next week is unchanged."), then persists a `shifted` resolution and recomputes the effective schedule.
- **Skip it** → persists a `skipped` resolution; the prompt closes and does not reappear for that occurrence. A Sonner toast: `Skipped. Past weeks stay as planned.` No undo dialog (resolution is immutable in Pitch 4; see Out of scope).
- **Consecutive missed days:** only the **oldest** unresolved day is prompted. After it is resolved, the effective schedule is recomputed and, if another unresolved missed day remains, the prompt re-renders for that next one. Shifts never stack beyond the current week.

### Edge cases
- Yesterday missed + today also has a session: the missed-day prompt resolves first; today's session block sits below, dimmed, until the prompt is cleared.
- A shift that would push the final remaining session beyond the current mesocycle week: that occurrence is dropped from the week's effective schedule (not carried into next week) and does **not** re-prompt as missed. The confirmation copy notes "The last day this week has no slot to move into and will be dropped."

---

## Screen 3: Gym selection

### Purpose
Attach the workout to the gym it is performed at, so gym-variable exercises get correct baseline attribution.

### URL pattern
`Drawer`/`Sheet` over Today, or a step in `/log/[loggedSessionId]/start`. Presented before the first set can be logged.

### Trigger
Start workout / Log it late, when no LoggedSession yet exists (or exists with zero sets).

### Layout

```text
┌────────────────────────────────────┐
│  Where are you training?            │
│                                     │
│  ◉ Downtown Gym                     │
│  ○ Campus Rec                       │
│  ○ Home Garage                      │
│                                     │
│          [ Start logging ]          │
└────────────────────────────────────┘
```

### Component table

| Element | shadcn/ui component | Behavior |
| ------- | ------------------- | -------- |
| Gym list | `RadioGroup` of active gyms (Pitch 2) | single select; addresses not shown here beyond name (privacy) |
| Confirm | `Button` `primary` | creates/attaches the LoggedSession's gym context and enters the runner |

### Empty state
No active gyms: "Add a gym first." with `[Go to Gyms]`. A workout cannot start without a gym.

### Behavior
- Only **active** gyms appear. No implicit gym creation.
- Gym can be changed freely here and from the runner **until the first LoggedSet is persisted**. After that the gym is locked (see Screen 4).
- Archived gyms never appear as choices; a historical workout performed at a now-archived gym still shows that gym's name in History.

---

## Screen 4: Workout runner — guided exercise card

### Purpose
Log all planned working sets for one exercise, then move to the next, until the day is done.

### URL pattern
`/log/[loggedSessionId]` with the current exercise in view (e.g. `?e=<loggedExerciseId>` or stepper state).

### Trigger
Entering/resuming a workout from Today or the missed-day log-late flow.

### Layout — logging a set

```text
┌────────────────────────────────────┐
│ ‹ Push Day 1                 2 / 5  │   ← runner header: session, progress
│   Downtown Gym                      │   ← gym (shown; locked once a set exists)
├────────────────────────────────────┤
│ Barbell Bench Press                 │
│ 3 × 6–8   ·   last: 185 lbs         │   ← planned rep range + prior context
│                                     │
│  Set 1   [ 185 ] lbs  [  8 ] reps ✓ │   ← saved (checkmark, settled style)
│  Set 2   [ 185 ] lbs  [  8 ] reps ✓ │
│  Set 3   [ 190 ] lbs  [    ] reps   │   ← in progress (unsaved, outlined)
│                                     │
│  [ Swap exercise ]                  │
├────────────────────────────────────┤
│        [ Save set 3 ]               │   ← saves current row
│   when all sets done: [ Next → ]    │
└────────────────────────────────────┘
```

### Component table

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| Runner header | back chevron + session name + `N / M` | progress through required exercises |
| Gym line | `muted-foreground` | present always; a small lock glyph + tooltip once locked |
| Exercise title | `CardTitle` | the **performed** exercise (planned, or substitute after swap) |
| Context line | `muted-foreground`, `tabular-nums` | `plannedSets × repMin–repMax` and prior/baseline weight context |
| Set rows | `SetRow` (new), `tabular-nums` | exactly `plannedSets` rows — no Add Set; weight + reps `Input` with `inputMode="decimal"` / `"numeric"` |
| Saved state | checkmark, settled (non-editable chrome, tappable to edit) | a saved set reads as history; tapping re-opens it for in-session correction |
| Swap | `Button` secondary | disabled once any set for this exercise is saved (see Behavior) |
| Primary action | `Button` `primary`, bottom | "Save set N" for the active row; "Next →" when the exercise is complete; "Finish workout" on the last exercise |

### Code reference
```tsx
<Card className="bg-card border-border">
  <CardHeader>
    <CardTitle className="text-base font-medium">{performed.name}</CardTitle>
    <p className="text-sm text-muted-foreground tabular-nums">
      {plannedSets} × {repMin}–{repMax}
      {priorWeight ? ` · last: ${priorWeight} lbs` : ""}
    </p>
  </CardHeader>
  <CardContent className="space-y-2 tabular-nums">
    {rows.map((r) => (
      <SetRow key={r.setNumber} {...r} saved={r.saved} onSave={saveSet} />
    ))}
    <Button variant="secondary" disabled={anySetSaved} onClick={openSwap}>
      Swap exercise
    </Button>
  </CardContent>
</Card>
```

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Weight (per set) | decimal lbs | yes to save | prefilled from prior/baseline context (editable, never auto-saved) | must be > 0 |
| Reps (per set) | integer | yes to save | empty | must be > 0 (integer) |

### Validation
- A set saves only when **both** weight > 0 and reps > 0. Zero/empty/negative → inline error under the offending field ("Enter a weight above 0." / "Enter reps above 0.") and the set is **not** persisted.
- Weight-only or reps-only is draft input, not a saved set; it persists in local draft state but never becomes history and never counts toward completion.
- The prefilled suggested weight is never saved on its own — the lifter must confirm each set.

### Empty state
First-ever workout, no prior context: the context line shows just `3 × 6–8` with no "last:" and weight fields start empty.

### Loading state
The card keeps its full layout with `Skeleton` set rows so nothing shifts under the thumb. The primary button is disabled during the initial load only.

### Error state
- **Save failure (network/write):** the set row stays in its unsaved/outlined state, an inline `Alert` (`destructive`) appears — `Couldn't save. Your numbers are still here.` — with `[Retry]`. The numbers are never cleared. A set is shown as saved (✓) only after the write confirms.
- **Retry/idempotency:** retrying a save for the same `(exercise, set number)` that already persisted shows the existing saved set, never a duplicate.

### Behavior
- **Gym lock:** before the first LoggedSet exists, a "Change gym" affordance is available in the runner header. After the first set saves, the gym is locked for the session; the affordance is replaced by a lock glyph.
- **Swap lock:** "Swap exercise" is enabled only while this exercise has zero saved sets. Once a set exists, swap is disabled with helper text "Sets are logged — exercise is locked."
- **Exercise completion:** when all `plannedSets` rows are saved, the exercise is complete; primary becomes "Next →" (or "Finish workout" on the last required exercise).
- **Navigation:** the lifter may move between exercises out of order via the header/back and a session overview; the UI encourages order but allows free navigation. Leaving mid-set keeps saved sets; the workout stays in progress.
- **Archived planned exercise:** if the planned exercise is archived, the card shows "Unavailable — choose a substitute" and only a `[Swap exercise]` action; no set rows until a substitute is chosen. The exercise cannot be completed until resolved.

---

## Screen 5: Exercise Swap picker

### Purpose
Replace the planned exercise for this one workout with a same-primary-muscle alternative.

### URL pattern
`Drawer`/`Sheet` over the runner, or `/log/[loggedSessionId]/[loggedExerciseId]/swap`.

### Trigger
"Swap exercise" on the card (only when no set is logged for that occurrence), or the required-substitution flow for an archived planned exercise.

### Layout

```text
┌────────────────────────────────────┐
│  Swap: Chest Press Machine          │
│  Same muscle: Chest                 │
│  [ search exercises…            ]   │
│                                     │
│  ★ Incline Dumbbell Press           │
│    Barbell Bench Press              │
│    Cable Fly                        │
│    Machine Chest Press (Hammer)     │
│                                     │
│  (planned exercise greyed if archvd)│
└────────────────────────────────────┘
```

### Component table

| Element | shadcn/ui component | Behavior |
| ------- | ------------------- | -------- |
| Heading | names planned exercise + its primary muscle | context |
| Search | `Input` | filters candidates by name (Pitch 2 search behavior) |
| Candidate list | list rows, ★ for favorites | selectable; Favorite is a navigation aid only, never an eligibility filter |
| Select | tap a row | sets the performed exercise for this LoggedExercise occurrence and returns to the card |

### Eligibility (binding)
A candidate must be **active** (not archived) and share the **same `primaryMuscle`** as the planned exercise. Secondary-muscle overlap does not qualify. Favorites do not affect eligibility.

### Empty state
No eligible same-primary-muscle active exercise: "No active exercises share this muscle group (Chest). Add one in the library, or leave this exercise unresolved for now." The occurrence stays incomplete; the workout cannot be falsely completed. Never cross muscle groups to unblock.

### Behavior
- Selecting a substitute sets the performed exercise on **this occurrence only**. The Session/SessionExercise template is never touched; other days and future workouts are unaffected.
- If the substitute is gym-variable, its baseline behavior uses the **substitute** exercise + this workout's gym — never the planned exercise's baseline.
- No "save swap to template" affordance exists in this pitch.

---

## Screen 6: Completion summary

### Purpose
A quiet, factual acknowledgment that today is recorded — nothing more.

### URL pattern
`/log/[loggedSessionId]/complete` (or an inline terminal state in the runner), then returning to Today's complete state.

### Trigger
Confirming "Finish workout" when every required exercise is complete.

### Layout

```text
┌────────────────────────────────────┐
│  ✓ Workout complete                 │
│                                     │
│  Push Day 1 · Downtown Gym          │
│  Mon, Nov 2                         │
│                                     │
│  5 exercises · 14 working sets      │
│                                     │
│          [ Done ]   History →       │
└────────────────────────────────────┘
```

### Component table

| Element | shadcn/ui component | Behavior |
| ------- | ------------------- | -------- |
| Confirmation | check glyph + title | calm, no animation/confetti |
| Facts | `muted-foreground` | session name, gym, date, exercise count, set count — **only Pitch-4-owned data** |
| Actions | `Button` + History link | returns to Today (complete state) or History |

### Out of this screen (enforced)
No progression chart, no e1RM, no progress/hold/deload, no goal percentage, no "PR." If "Finish" is pressed while an exercise is incomplete or an archived exercise is unresolved, completion is blocked with an inline note naming what remains.

### Behavior
Finishing is an explicit, atomic transition: the final set (if any pending) is persisted, any required baseline change is applied, and the LoggedSession is marked complete — all together. On failure, nothing is half-applied and the runner stays in progress with an error.

---

## Screen 7: History — Week at a glance

### Purpose
Navigate the training record: see which days are complete, upcoming, skipped, or shifted, and open any logged workout.

### URL pattern
`/history` (default: current week), `/history?week=<iso>` for other weeks.

### Trigger
History tab; "History →" links.

### Layout

```text
┌────────────────────────────────────┐
│ ‹ Week of Oct 27 – Nov 2        ›   │
│                                     │
│  Mon Nov 2   Push Day 1    ✓ Done   │
│  Tue Nov 3   Pull Day 1    Upcoming │
│  Wed Nov 4   Rest          —        │
│  Thu Nov 5   Leg Day 1     Upcoming │
│  Fri Oct 30  Push Day 1    Skipped  │
│  Sat Oct 31  —  (shifted)  Shifted  │
│  Sun Nov 1   Rest          —        │
└────────────────────────────────────┘
```

### Component table

| Element | shadcn/ui component | Behavior |
| ------- | ------------------- | -------- |
| Week nav | prev/next `Button`s + range label | moves by effective week |
| Day rows | list rows, `tabular-nums` dates | label per effective-schedule state: Done / In progress / Upcoming / Skipped / Shifted / Rest |
| Open | tap a Done/In-progress row | → Logged workout detail (Screen 8) |

### Empty state
A week before the mesocycle start or with no plan: "No training scheduled this week."

### Behavior
This is record navigation, not statistics — no charts, no totals-over-time, no trends. Day state is derived from the authored plan + missed-day resolutions + LoggedSession history (the same effective-schedule computation the dashboard uses).

---

## Screen 8: Logged workout detail

### Purpose
Inspect exactly what was performed on a past day, and enter the correction flow.

### URL pattern
`/history/[loggedSessionId]`

### Trigger
Opening a completed or in-progress day from the week view.

### Layout

```text
┌────────────────────────────────────┐
│ ‹ Push Day 1                        │
│   Mon, Nov 2 · Downtown Gym         │
├────────────────────────────────────┤
│ Barbell Bench Press    (as planned) │
│   Set 1   185 lbs × 8      [edit]    │
│   Set 2   185 lbs × 8      [edit]    │
│   Set 3   190 lbs × 7      [edit]    │
│                                     │
│ Incline DB Press  (swapped from     │
│                   Chest Press Mach.) │
│   Set 1   70 lbs × 10     [edit]     │
│   …                                 │
└────────────────────────────────────┘
```

### Component table

| Element | shadcn/ui component | Behavior |
| ------- | ------------------- | -------- |
| Header | session name, date, gym | gym shown even if now archived (muted, name intact) |
| Exercise groups | sections | label "as planned" or "swapped from <planned>" |
| Set rows | `tabular-nums` | weight × reps; `[edit]` opens the correction control (Screen 9) |
| Archived markers | `muted-foreground` | archived exercise/gym still named, never "Unknown" |

### Behavior
Read-only except for per-set weight/reps editing. No delete affordance anywhere. No progression values displayed.

---

## Screen 9: Past-log set correction

### Purpose
Fix a mistyped weight or rep count on a historical set.

### URL pattern
Inline `Dialog` on Screen 8 (`/history/[loggedSessionId]`).

### Trigger
`[edit]` on a logged set row.

### Layout

```text
┌────────────────────────────────────┐
│  Edit set 3 — Barbell Bench Press   │
│                                     │
│  Weight  [ 190 ] lbs                │
│  Reps    [   7 ] reps               │
│                                     │
│     [ Cancel ]      [ Save ]        │
└────────────────────────────────────┘
```

### Fields

| Field | Type | Required | Validation |
| ----- | ---- | -------- | ---------- |
| Weight | decimal lbs | yes | > 0 |
| Reps | integer | yes | > 0 |

### Validation
Same rule as logging: zero/empty/negative rejected inline. Only weight and reps are editable — not the exercise, gym, set number, date, session, or mesocycle. No delete.

### Behavior
- On save: the stored LoggedSet's weight/reps are corrected in place (the controlled write path), the dialog closes, Sonner toast `Set updated`.
- Editing a historical set **does not** replay or recompute gym baselines; the current baseline remains the latest value established/corrected by logging behavior. (Recorded as a Pitch-4 product default; see spec.)
- Editing works even if the exercise or gym is archived (history is always editable).

---

## 7. Navigation flows

```text
App open
  └─ unresolved missed day? ── yes ─▶ Missed-day prompt
  │                                     ├─ Log it late ─▶ Gym select ─▶ Runner (historical date)
  │                                     ├─ Shift ─▶ confirm ─▶ Today (recomputed)
  │                                     └─ Skip ─▶ Today
  └─ no ─▶ Today
            ├─ Pending ─▶ [Start] ─▶ Gym select ─▶ Runner
            │                 └─ Exercise card ×N ─▶ (Swap picker) ─▶ Finish ─▶ Completion ─▶ Today(complete)
            ├─ In progress ─▶ [Resume] ─▶ Runner (same LoggedSession, no duplicate)
            ├─ Complete ─▶ quiet state ─▶ [View workout] ─▶ History detail
            └─ Rest ─▶ quiet state

History ─▶ week view ─▶ logged day detail ─▶ [edit] set ─▶ Save ─▶ value updates in place
```

State carried: `loggedSessionId` through the runner; the missed occurrence's original date through log-late; the week ISO through History. Return paths always land on Today or the originating History view.

---

## 8. Interaction specifications

#### Keyboard navigation

| Context | Key | Action |
| ------- | --- | ------ |
| Set entry weight field | Enter | save weight, focus reps (if reps empty) or save the set |
| Set entry reps field | Enter | save the set if valid; focus next set's weight |
| Set rows | Tab / Shift+Tab | next / previous field in set order |
| Missed-day prompt | 1 / 2 / 3 or Tab+Enter | the three choices are focusable and operable |
| Dialog / drawer (gym, swap, edit) | Escape | close, return focus to the trigger |
| Swap search | Down / Up | move through candidates |

Set entry and the missed-day prompt are fully keyboard-operable even though touch is primary. Focus moves into dialogs on open and returns to the trigger on close.

#### Loading states
Per-screen `Skeleton` as noted. The logging card preserves layout height while loading.

#### Error states
`Alert` + inline patterns with `[Retry]`. A failed **save** of a set is visually distinct from a failed **load** and always keeps the entered numbers. Destructive errors cannot remove data — there is no destructive path in this feature.

#### Notifications (Sonner)

| Action | Message | Severity | Duration |
| ------ | ------- | -------- | -------- |
| Past set edited | `Set updated` | success | 4s |
| Missed day skipped | `Skipped. Past weeks stay as planned.` | info | 5s |
| Week shifted | `This week shifted forward a day.` | info | 5s |
| Set save failed | `Couldn't save. Your numbers are still here.` | error | until dismissed |
| Workout completed | (no toast — the Completion summary is the acknowledgment) | — | — |

Validation errors are always inline, never toast-only.

#### Destructive actions
None in this feature. Swap of an archived planned exercise is a substitution, not a deletion, and needs no confirmation dialog. Skip is a resolution, confirmed by its explicit button, surfaced with an info toast (no undo in Pitch 4). Missed-day **Shift** shows a one-line confirmation of its schedule effect before it is applied, because it changes the effective calendar.

---

## 9. Responsive behavior

| Breakpoint | Width | Behavior |
| ---------- | ----- | -------- |
| base | < 640px | Single column; bottom nav; Start/Resume/Save/Next pinned at the bottom within thumb reach; gym + swap as full-height `Drawer`s |
| `sm` | ≥ 640px | Wider single column, larger card, same bottom actions |
| `md` | ≥ 768px | Side nav; History week + day detail can sit side by side; gym/swap/edit as centered `Dialog`s |
| `lg` | ≥ 1024px | Centered max-width content; the card gains width, not more elements |

Every action remains available at the base breakpoint. The runner is designed for one hand: the current set's fields and the save action are always in the lower half of the screen.

---

## 10. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `TodaySessionBlock` | Today | new | variants: pending, in-progress, complete, rest; shows gym once chosen |
| `MissedDayPrompt` | Today | new | three equal choices; dialog-then-banner; oldest-first |
| `GymPicker` | start / log-late | new (wraps active-gym query from Pitch 2) | radio; active gyms only |
| `WorkoutRunner` | `/log/[id]` | new | header progress, exercise stepper, finish |
| `ExerciseCard` | runner | new | variants: planned, in-progress, complete, needs-substitution (archived) |
| `SetRow` | card, detail, edit | new | weight+reps; states: draft (unsaved), saved, error; tabular numerals |
| `SwapPicker` | runner | new | same-primary-muscle active candidates; favorites decorate only |
| `CompletionSummary` | runner terminal | new | factual only |
| `WeekAtAGlance` | History | new | effective-schedule day states |
| `LoggedWorkoutDetail` | History | new | read-only + per-set edit |
| `EditSetDialog` | History detail | new | weight/reps only |

No `ProgressTag` or chart components are introduced in this pitch.

---

## 11. Accessibility, privacy, and data sensitivity

**Accessibility**
- All controls have accessible names (Start, Save set 3, Swap exercise, Log it late, Edit set 3).
- Day/session state never relies on color alone — the text label (Done, Skipped, Shifted, Upcoming, Rest) is always present.
- Weight/reps fields have labels and inline error text wired via `aria-describedby`; they use `inputMode="decimal"`/`"numeric"` and ≥ 44px targets.
- Dialogs/drawers (gym, swap, edit, missed-day) trap focus and restore it on close.
- Set entry and the missed-day prompt are fully keyboard-operable; error messages are screen-reader accessible (`role="alert"`).

**Privacy**
- Single-user: no share, export-to-others, invite, or visibility affordance anywhere.
- Gym **addresses** are never shown in the runner, dashboard, history, or summaries — only gym **names**. Addresses live on the Gyms screen (Pitch 2). The gym picker shows names only.
- No maps, geolocation, or external links.

---

## 12. Out of scope

**This pitch's boundaries (designed nothing for these here):**
- Progress/hold/deload tags, e1RM, trends, progression charts, next-weight suggestions, scheduled-deload load reduction, PR detection.
- Goals and goal percentage; any progression/goal content in the completion summary or completed-day dashboard.
- LoggedSet deletion; whole-workout deletion.
- Editing exercise identity, gym, date, planned slot, or a missed-day resolution after it is confirmed.
- Extra/ad-hoc sets beyond the planned count; warm-up sets.
- "Save swap back to template"; any plan mutation from logging.
- Auto-resolving missed days; GPS/arrival/geofenced gym selection; implicit gym creation.
- RPE/RIR entry; cardio logging.

**Deferred (a later pitch; do not preclude):** dated goals, RPE/RIR, native/wrapped app, HealthKit/heart-rate/distance/pace/calories, location-pinned gyms and arrival notifications.

**Permanent non-goals (never):** program/mesocycle generation, social features of any kind, progression analysis of cardio, nutrition/body-composition in this build.

---

## Open questions

None blocking. All product-mechanics gaps are resolved by the run's Resolved Decisions (recorded in the spec). The 15% baseline-correction threshold is a tunable Bucket C default surfaced for review in the run report.
