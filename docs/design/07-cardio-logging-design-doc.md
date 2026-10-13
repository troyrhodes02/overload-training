# Cardio Logging — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 7: Cardio Logging
**Focus:** How the lifter plans one cardio item on a Mesocycle day, sees it beside (or instead of) the day's lifting, records the type and minutes actually done, finds it in the week's history, and corrects a mistaken entry — without cardio ever becoming a second progression system.

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

---

## 2. Vision

Cardio Logging answers two plain questions: **"Is there cardio today?"** and **"What did I actually do?"** The lifter sees *Incline Walk — 20 min* sitting under Pull Day (or alone on a Saturday), taps once to record *Incline Walk — 23 min*, and the week's history now tells the whole truth about the day. Nothing is judged, nothing is trended, nothing is recommended.

Strength training is interpreted. Cardio is recorded.

**North star:** *two fields, one tap, then out of the way.*

---

## 3. Design principles

### 1. Lifting keeps the floor
When a day has both, the lifting Session is the focal block and owns the primary action. Cardio sits beneath it as a smaller, complete-able line — easy to see and log, never visually louder than an unresolved workout. On a cardio-only day, cardio becomes the focal block, because it is the day's training.

### 2. Type and minutes — nothing else, anywhere
Every cardio surface (builder, dashboard, logging, history, correction) shows exactly two facts: the activity and its whole minutes. No distance, pace, calories, heart rate, timer, chart, streak, or tag — not even as a disabled field or a "coming soon".

### 3. Plan and record are different sentences
The plan says *Incline Walk — 20 min*; the record says what happened. When they differ, history shows the record in full and the plan as a quiet secondary line ("Planned Incline Walk · 20 min"). Logging never edits the plan, and editing the plan never edits the record.

### 4. Missed is a fact, not a prompt
Unlogged past cardio reads "Missed" in history in muted text. It never interrupts the dashboard, never offers Log late / Shift / Skip, and never moves the week. If the lifter wants to record it after the fact, it is one optional tap from History.

### 5. Hold-like quiet
Cardio has no status color. Complete is a check and the minutes; pending is a plain action; missed is muted text. Progress green and deload amber never appear on a cardio surface, and the scheduled-deload banner never touches cardio.

---

## 4. Visual language

#### Color palette

| Token | Usage | Notes |
| ----- | ----- | ----- |
| `background` / `foreground` | canvas, primary text (activity, minutes) | |
| `card` / `card-foreground` | day rows, cardio block, dashboard cards | |
| `border` | the divider between the lifting line and the cardio line in a day | hairline only |
| `muted-foreground` | the "Cardio" label, "Planned …" comparison line, "Missed", "Upcoming", dates | |
| `primary` / `primary-foreground` | **Log cardio** only when cardio is the day's focal action (cardio-only day) | |
| `secondary` | **Log cardio** when lifting is the focal action (combined day) | keeps lifting's Start button the only primary |
| `destructive` | inline validation text and the remove-confirmation action | always with text |

No new tokens. **Progress and deload tokens are not used anywhere in this feature.**

#### State colors (display labels only — not stored values)

| State | Visual treatment | Usage |
| ----- | ---------------- | ----- |
| Pending (today) | plain text + **Log cardio** button | today's planned cardio, not yet logged |
| Complete | check glyph + actual "Type — N min", `foreground` | a CardioLog exists for the occurrence |
| Complete, differs from plan | as Complete, plus `muted-foreground` line "Planned Incline Walk · 20 min" | actual type and/or minutes differ |
| Upcoming | `muted-foreground` "Upcoming" | later this week |
| Missed | `muted-foreground` "Missed" (never amber, never red) | past occurrence with no log |
| Planned (builder) | `muted-foreground` "Cardio" label + `foreground` "Type · N min" | the plan |

#### Typography, spacing, radius, elevation

Reference `overload-ui-design`. Minutes always use `tabular-nums` ("20 min", "23 min"). The activity name uses the regular body style; the "Cardio" label uses the small `muted-foreground` style. In a day row, cardio is a second line inside the same row, separated by spacing (and, on the dashboard, by a `border-t` hairline) — never a nested card.

#### Appearance

Light, dark, system (default), chosen in Settings only. Every cardio element is defined with tokens and relies on text + hairlines rather than fills, so it reads identically in dark mode.

---

## 5. Information architecture

Cardio adds no new navigation item and no new top-level route. It appears inside existing surfaces.

```text
┌──────────────────────────────────────────────┐
│  Overload                                    │
├──────────────────────────────────────────────┤
│  Today  ── [missed-day prompt (lifting only)]│
│            today's lifting block  [Start]    │
│            today's cardio line    [Log] ─────┼─→ Log cardio (dialog)
│            · cardio-only day: cardio block   │
│              is the focal block [Log cardio] │
│  Plan   ── Mesocycle → Week                  │
│              day row: Session + Cardio line ─┼─→ Edit cardio (dialog)
│              [Add cardio] ───────────────────┼─→ Add cardio (dialog)
│            Clone forward (copies cardio plan)│
│  History ─ Week at a glance (day-grouped)    │
│              lifting line → logged workout   │
│              cardio line (logged) ───────────┼─→ Correct cardio (dialog)
│              cardio line (missed) ───────────┼─→ Log cardio (dialog, optional)
└──────────────────────────────────────────────┘
 Bottom bar (mobile): Today · Plan · History · Goals · …
```

Content hierarchy on Today: (1) missed lifting day prompt, if any; (2) today's lifting Session; (3) today's cardio; (4) Goals, only in the states Goals already uses. On a cardio-only day, (2) is absent and cardio is the focal block.

---

## 6. Screen specifications

## Screen 1: Plan — Mesocycle week with cardio

### Purpose
Show the authored week with each day's lifting Session and planned cardio side by side, and let the lifter add, edit, or remove the one cardio item per day.

### URL pattern
`/plan/[mesocycleId]` (existing page; the Week section changes).

### Trigger
Opening a mesocycle from Plan.

### Layout — phone

```text
┌────────────────────────────────────┐
│ ‹ Plan                          ⋯  │
│ Hypertrophy Block 3   [Active]     │
│ Starts Mon, Sep 21 · ends Sun, Oct 25│
│ 5 weeks · deload every 5 weeks · PPL│
├────────────────────────────────────┤
│ Week                               │
│ MON  Push Day 1                 ⋯  │
│      6 exercises                   │
│ TUE  Pull Day 1                 ⋯  │
│      6 exercises                   │
│      Cardio  Incline Walk · 20 min ›│  ← tap → Edit cardio
│ WED  Leg Day                    ⋯  │
│      5 exercises                   │
│ THU  Push Day 2                 ⋯  │
│      Cardio  Stair Climber · 15 min›│
│ FRI  Rest                [Add session]│
│ SAT  Rest                [Add session]│
│      Cardio  Bike · 30 min        › │  ← cardio-only day
│ SUN  Rest                [Add session]│
│                                    │
│ [ + Add cardio ]                   │  ← outline, opens Add cardio
└────────────────────────────────────┘
```

### Day row

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Lifting line** | existing `WeekList` row (session link + `SessionActionsMenu`, or "Rest" + `AddSessionButton`) | unchanged from Pitch 3 |
| **Cardio line** | a `button` row inside the same `li`, `min-h-11`, label "Cardio" `text-xs text-muted-foreground uppercase tracking-wide`, then "Incline Walk · 20 min" `text-sm tabular-nums`, trailing `ChevronRight` | tap opens **Edit cardio** (dialog). Absent when the day has no cardio. Read-only text (no chevron, not a button) on an archived mesocycle |
| **Add cardio** | `Button variant="outline" size="sm"` with `Plus` icon, under the week list | opens **Add cardio**. Disabled with helper "Every day already has cardio." when all seven days have one. Hidden on archived mesocycles |

The cardio line never appears inside the lifting Session's own screen (`/plan/[id]/sessions/[sessionId]`), never in its exercise list, and never in the exercise picker. Cardio belongs to the day.

### Code reference

```tsx
<li className="flex min-h-14 flex-col justify-center py-1 pr-1 pl-4">
  <div className="flex items-center gap-1">
    <abbr className="w-10 text-xs font-medium uppercase text-muted-foreground">Tue</abbr>
    {/* existing lifting link + SessionActionsMenu, or "Rest" + AddSessionButton */}
  </div>
  {cardio ? (
    <button
      type="button"
      onClick={openEdit}
      className="ml-10 flex min-h-11 items-center gap-2 rounded-md text-left text-sm focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-xs tracking-wide text-muted-foreground uppercase">Cardio</span>
      <span className="flex-1 truncate tabular-nums">{cardio.type} · {cardio.durationMin} min</span>
      <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
    </button>
  ) : null}
</li>
```

### Empty state
A mesocycle with no cardio shows no cardio lines and just the **Add cardio** button. No explanatory copy.

### Loading state
The existing plan skeleton; cardio lines are part of the server-rendered week, so there is no separate loading state.

### Error state
Plan-level errors are unchanged (Pitch 3). Dialog errors are handled in Screens 2–3.

### Behavior
- Draft and active mesocycles are editable; archived mesocycles show cardio lines as read-only text and no Add button.
- Duplicating a lifting Session to another day (Pitch 3 menu) copies the Session only. The destination day's cardio line is unchanged; the source day's cardio is not copied. The duplicate toast is unchanged.
- Cardio does not affect activation readiness. A day with only cardio is a valid day; a plan's readiness checklist never mentions cardio.

---

## Screen 2: Add cardio (dialog)

### Purpose
Put one planned cardio item on a day of the week.

### URL pattern
`dialog` on `/plan/[mesocycleId]`.

### Trigger
**+ Add cardio** under the week.

### Layout — phone (base breakpoint, buttons stacked)

```text
┌────────────────────────────────────┐
│ Add cardio                      ✕  │
│ One cardio item per day.           │
│                                    │
│ Day                                │
│ [ Tuesday                       ▾ ]│   Select; days with cardio are
│                                    │   disabled: "Thursday — has cardio"
│ Activity                           │
│ [ Incline Walk                  ]  │   Input + native suggestions
│                                    │
│ Minutes                            │
│ [ 20 ]  min                        │   inputMode="numeric"
│                                    │
│ [        Add cardio        ]       │   primary, h-11
│ [          Cancel          ]       │   outline
└────────────────────────────────────┘
```

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Day | `Select` of Mon–Sun | yes | the first day without cardio | days that already have cardio are listed but disabled, labelled "— has cardio". A day with a lifting Session is allowed (combined day); a rest day is allowed (cardio-only day) |
| Activity | `Input` (`autoComplete="off"`, `list` suggestions) | yes | empty | trimmed; "Enter the activity." if blank/whitespace; "Keep it to 40 characters or fewer." Suggestions (Incline Walk, Treadmill, Stair Climber, Bike, Elliptical, Rowing, Outdoor Walk) are a convenience only — any text is accepted |
| Minutes | `Input` `inputMode="numeric"` `pattern="[0-9]*"` + "min" suffix | yes | empty | whole minutes 1–600; "Enter whole minutes, 1 or more." for blank, 0, negative, or decimal; "Keep it to 600 minutes or fewer." |

### Validation
- Errors appear inline under the field (`text-destructive text-sm`), announced via `aria-describedby` / `role="alert"`; the dialog never closes on error and entries stay.
- **Add cardio** stays enabled; validation runs on submit (same pattern as the Pitch 3 planned-exercise dialog).
- A conflict from the server ("Thursday already has cardio.") shows as an inline error on Day.

### Behavior
- Success: dialog closes, toast `Incline Walk added to Tuesday` (success, 4s), the week re-renders with the new cardio line.
- Failure: `Couldn't add cardio. Your entries are still here.` inline `Alert` in the dialog.
- Focus moves to Day on open, returns to the Add button on close. Escape closes.

---

## Screen 3: Edit cardio (dialog) and Remove cardio (confirm)

### Purpose
Change a planned cardio item's activity, minutes, or day — or take it off the plan.

### URL pattern
`dialog` / `alertdialog` on `/plan/[mesocycleId]`.

### Trigger
Tapping a cardio line in the week.

### Layout

```text
┌────────────────────────────────────┐
│ Edit cardio                     ✕  │
│ Changes the plan only. Cardio      │
│ you've logged stays as recorded.   │
│                                    │
│ Day       [ Tuesday            ▾ ] │
│ Activity  [ Incline Walk         ] │
│ Minutes   [ 20 ] min               │
│                                    │
│ [          Save            ]       │
│ [ Remove from plan ]  (ghost, text-destructive)
│ [         Cancel           ]       │
└────────────────────────────────────┘

┌────────────────────────────────────┐   alertdialog
│ Remove Incline Walk from Tuesday?  │
│ It comes off the plan from now on. │
│ Cardio you've already logged stays │
│ in your history.                   │
│ [  Remove  ]   [ Keep it ]         │
└────────────────────────────────────┘
```

### Fields
Same as Screen 2, prefilled. Day lists the current day as selectable and other days that have cardio as disabled.

### Behavior
- **Save** — toast `Cardio updated` (4s). Moving it to another day re-renders both day rows.
- **Remove from plan** — opens the `AlertDialog` above. **Remove** removes the planned item; toast `Removed from Tuesday. Logged cardio stays.` (info, 5s). Removing is plan authoring: no undo toast is needed beyond re-adding, and logged history is untouched.
- Editing or removing planned cardio never changes any past cardio record; history keeps the actual type and minutes that were logged.

---

## Screen 4: Today — Dashboard with cardio

### Purpose
Show today's training — lifting, cardio, both, or neither — with lifting as the primary workflow and cardio easy to log.

### URL pattern
`/` (existing).

### Trigger
Opening the app; the **Today** tab.

### Layout — combined day, both pending

```text
┌────────────────────────────────────┐
│ Today · Tue, Oct 13                │
│ ┌────────────────────────────────┐ │
│ │ Pull Day 1                     │ │  focal block (unchanged, Pitch 4/5)
│ │ Week 4 · 6 exercises           │ │
│ │ Barbell Row          3 × 6–8   │ │
│ │ Lat Pulldown         3 × 8–10  │ │
│ │ …                              │ │
│ └────────────────────────────────┘ │
│ [         Start workout          ] │  primary, h-11 — the one primary action
│ ┌────────────────────────────────┐ │
│ │ CARDIO                         │ │  smaller card
│ │ Incline Walk — 20 min   [ Log ]│ │  secondary button, h-11
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

### Layout — lifting complete, cardio pending

```text
│ ┌────────────────────────────────┐ │
│ │ ✓ Pull Day 1 complete          │ │  existing CompleteBlock (summary, goal rows)
│ │ Downtown Gym · 6 exercises · … │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ CARDIO                         │ │
│ │ Incline Walk — 20 min   [ Log ]│ │  still pending — lifting doesn't complete it
│ └────────────────────────────────┘ │
│ Goals (unchanged rules)            │
```

### Layout — cardio complete, lifting pending

```text
│ ┌ Pull Day 1 … ┐  [ Start workout ] │  lifting still primary
│ ┌────────────────────────────────┐ │
│ │ CARDIO                         │ │
│ │ ✓ Incline Walk — 23 min      › │ │  tap → Correct cardio
│ │   Planned 20 min               │ │  only when different
│ └────────────────────────────────┘ │
```

### Layout — both complete
CompleteBlock (unchanged) followed by the completed cardio card (`✓ Incline Walk — 23 min`). Goals follow as today. Nothing hands off to tomorrow.

### Layout — cardio-only day, pending

```text
┌────────────────────────────────────┐
│ Today · Sat, Oct 17                │
│ ┌────────────────────────────────┐ │
│ │ Cardio                         │ │  focal block
│ │ Week 4                         │ │
│ │ Bike — 30 min                  │ │
│ └────────────────────────────────┘ │
│ [           Log cardio           ] │  primary, h-11
│ Goals (rest-day rules, unchanged)  │
└────────────────────────────────────┘
```

### Layout — cardio-only day, complete

```text
│ ┌────────────────────────────────┐ │
│ │ ✓ Cardio complete              │ │
│ │ Bike — 32 min                › │ │  tap → Correct cardio
│ │ Planned 30 min                 │ │
│ │ History →                      │ │
│ └────────────────────────────────┘ │
```

### Cardio card

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Card** | `div.rounded-lg border bg-card p-4` (combined) / `p-6` (cardio-only focal) | |
| **Label** | "Cardio", `text-xs uppercase tracking-wide text-muted-foreground` (combined); `font-medium` "Cardio" title (cardio-only) | |
| **Planned line** | "Incline Walk — 20 min", `text-sm tabular-nums` | |
| **Log** | `Button variant="secondary" className="h-11"` (combined) / `Button size="lg" className="w-full"` primary (cardio-only) | opens **Log cardio** |
| **Complete line** | `Check` icon + "Incline Walk — 23 min" + `ChevronRight`; a `button` `min-h-11` | opens **Correct cardio** |
| **Planned comparison** | `text-xs text-muted-foreground` "Planned 20 min" / "Planned Incline Walk · 20 min" | only when actual differs |

### Rules
- The scheduled-deload banner (Pitch 5) still appears above the lifting block in a deload week. Cardio inside a deload week is shown exactly as authored, with no deload marker.
- If a lifting missed-day prompt is showing, today's lifting and cardio render dimmed beneath it (Pitch 4 behaviour); cardio never produces its own prompt.
- If a past lifting shift moved this split day onto today, its cardio moves with it and appears here. A cardio-only day never moves.
- Rare overlap: if a shifted lifting day lands on a day that already had cardio-only, both cardio items are listed, each with its own Log action, in authored-day order.
- No plan: unchanged ("No active plan."). Rest with no cardio: unchanged ("No lifting planned today.").

### Loading state
The existing dashboard skeleton (`loading.tsx`) gains one short card-shaped skeleton line beneath the focal block.

### Error state
Dashboard load errors are unchanged (`error.tsx`). Logging errors live in the dialog.

---

## Screen 5: Log cardio (dialog)

### Purpose
Record what was actually done for one planned cardio occurrence.

### URL pattern
`dialog` on `/` and on `/history`.

### Trigger
**Log** / **Log cardio** on the dashboard; **Log** on a missed cardio line in History.

### Layout

```text
┌────────────────────────────────────┐
│ Log cardio                      ✕  │
│ Tue, Oct 13 · Planned Incline Walk │
│ · 20 min                           │
│                                    │
│ Activity                           │
│ [ Incline Walk                  ]  │  prefilled with the planned type
│                                    │
│ Minutes                            │
│ [ 20 ]  min                        │  prefilled with planned minutes,
│                                    │  focused & selected for quick edit
│ [           Save            ]      │  primary, h-11
│ [          Cancel           ]      │
└────────────────────────────────────┘
```

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Activity | `Input` + suggestions | yes | the planned type | may be changed to anything ("Bike"); trimmed; blank → "Enter the activity."; > 40 chars → "Keep it to 40 characters or fewer." |
| Minutes | `Input inputMode="numeric"` + "min" | yes | the planned minutes | whole minutes 1–600; blank/0/negative/decimal → "Enter whole minutes, 1 or more." |

No date field (the occurrence fixes the date), no Gym, no notes, no timer, no extra metric.

### Behavior
- Opening the dialog writes nothing. Cancel writes nothing.
- **Save** — dialog closes; toast `Cardio logged` (success, 4s); the card turns Complete. If the actual type or minutes differ, the card shows the "Planned …" line; the plan is unchanged.
- **Retry / double tap / stale tab** — if the occurrence was already logged, nothing new is recorded: the dialog closes with toast `Already logged` (info) and the existing record is shown. A stale submission never overwrites a record — correction is a separate, explicit action.
- **Failure** — `Couldn't save. Your entries are still here.` inline `Alert`; the dialog stays open with the values.
- While saving, Save shows "Saving…" and both buttons are disabled.

---

## Screen 6: History — week at a glance, day-grouped

### Purpose
Show each day of the week with its lifting and its cardio, so the record reads like the training actually done.

### URL pattern
`/history`, `/history?week=N` (existing).

### Layout

```text
┌────────────────────────────────────┐
│ ‹   Week 4 · Mon, Oct 12 – Sun, Oct 18   › │
│ ┌────────────────────────────────┐ │
│ │ Mon, Oct 12  Push Day 1   Done │ │ → logged workout
│ ├────────────────────────────────┤ │
│ │ Tue, Oct 13  Pull Day 1   Done │ │
│ │              Incline Walk      │ │ → Correct cardio
│ │              23 min          ✓ │ │
│ │              Planned 20 min    │ │
│ ├────────────────────────────────┤ │
│ │ Wed, Oct 14  Leg Day  Upcoming │ │
│ ├────────────────────────────────┤ │
│ │ Thu, Oct 15  Push Day 2 Upcoming│ │
│ │              Stair Climber     │ │
│ │              15 min   Upcoming │ │
│ ├────────────────────────────────┤ │
│ │ Sat, Oct 17  Bike              │ │  cardio-only day
│ │              30 min   Upcoming │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

Past week example (week 3), showing missed and changed-type cardio:

```text
│ Tue, Oct 6   Pull Day 1        Done │
│              Bike · 25 min        ✓ │
│              Planned Incline Walk · 20 min │
│ Thu, Oct 8   Push Day 2        Done │
│              Stair Climber · 15 min  Missed  [Log] │
│ Sat, Oct 10  Bike · 30 min        ✓ │
```

### Day group

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Date** | `w-28 text-muted-foreground tabular-nums` | the effective date (after any lifting shift) |
| **Lifting line** | existing row (session name + state label) | Done / In progress open the logged workout (unchanged) |
| **Cardio line** | indented under the lifting line (or alone on a cardio-only day), "Activity · N min" `tabular-nums` + state text | Complete → tap opens **Correct cardio**; Missed → trailing **Log** (`Button variant="ghost" size="sm"`, h-11 tap area) opens **Log cardio**; Pending today → **Log**; Upcoming → no action |
| **Planned comparison** | `text-xs text-muted-foreground` | Complete and differs from plan only |

States on the cardio line: `✓` (complete), `Pending` (today), `Upcoming`, `Missed`. No colour beyond `foreground`/`muted-foreground`.

### Empty state
"No training scheduled this week." when the week has neither lifting nor cardio (unchanged copy).

### Behavior
- Days are grouped by effective date. A day group shows lifting first, cardio second.
- A missed cardio line is shown only for occurrences that were on the plan at the time (cardio added mid-block does not invent misses for earlier weeks).
- Missed cardio never counts toward anything and never appears anywhere other than this week view.
- Opening History never prompts; Missed is display only.

---

## Screen 7: Correct cardio (dialog)

### Purpose
Fix a mistaken cardio entry's activity or minutes.

### URL pattern
`dialog` on `/history` and `/`.

### Trigger
Tapping a completed cardio line.

### Layout

```text
┌────────────────────────────────────┐
│ Edit cardio                     ✕  │
│ Tue, Oct 13 · Planned Incline Walk │
│ · 20 min                           │
│ Activity  [ Incline Walk        ]  │
│ Minutes   [ 23 ] min               │
│ [           Save            ]      │
│ [          Cancel           ]      │
└────────────────────────────────────┘
```

### Behavior
- Same fields and validation as Screen 5, prefilled with the logged values.
- **Save** → toast `Cardio updated` (4s); the line updates in place. An invalid value is rejected inline and nothing changes.
- There is **no delete or remove** action in this dialog or anywhere else for a cardio record.
- Correcting cardio has no other visible effect: no tag, no chart, no goal row changes.

---

## Screen 8: Clone forward with cardio

### Purpose
Make clear that cloning a block brings its cardio plan along, and nothing it recorded.

### URL pattern
`/plan/clone/[sourceId]` (existing).

### Layout
The existing "What comes across" card gains cardio where the source has any:

```text
│ What comes across                        │
│ ┌──────────────────────────────────────┐ │
│ │ Push / Pull / Legs                   │ │
│ │ 5 sessions · 28 exercises            │ │
│ │ Cardio on 3 days                     │ │  ← new line, only when > 0
│ │ Days, order, sets, and rep ranges,   │ │
│ │ ready to edit.                       │ │
│ │ Workout history, cardio logs, goals, │ │  ← "cardio logs" added
│ │ and gym weights are not copied.      │ │
│ └──────────────────────────────────────┘ │
```

### Behavior
After cloning, the new draft's week shows the same cardio lines on the same days with the same activity and minutes; its history is empty.

---

## 7. Navigation flows

```text
Plan → Mesocycle → [+ Add cardio] → Add cardio dialog → Save → week re-renders (toast)
Plan → Mesocycle → tap cardio line → Edit cardio → Save | Remove → confirm → week re-renders

Today (combined) → [Start workout] → Pitch 4 runner (unchanged)
Today (combined) → cardio [Log] → Log cardio dialog → Save → card ✓ (toast)
Today (cardio-only) → [Log cardio] → Log cardio dialog → Save → "✓ Cardio complete"
Today → ✓ cardio line → Correct cardio → Save

History → week → ✓ cardio line → Correct cardio → Save
History → week → Missed cardio [Log] → Log cardio → Save → line ✓

Plan → Clone forward → clone form → new draft (cardio lines copied, no history)
```

All cardio interactions are dialogs over the current page; closing returns focus to the trigger. No new routes, no query params.

---

## 8. Interaction specifications

#### Keyboard navigation

| Context | Key | Action |
| ------- | --- | ------ |
| Cardio dialogs | Tab / Shift+Tab | Day → Activity → Minutes → Save → Cancel |
| Cardio dialogs | Enter in a field | submit |
| Any dialog | Escape | close, focus returns to trigger |
| Cardio line (builder, history, dashboard) | Enter / Space | open its dialog |

#### Loading states
Dialogs are rendered from server data already on the page; Save shows "Saving…" with disabled buttons. Page skeletons are the existing ones.

#### Error states
Inline `Alert` in the dialog with plain copy; entries preserved. A conflict (day already has cardio) is a field error on Day.

#### Notifications

| Action | Message | Severity | Duration |
| ------ | ------- | -------- | -------- |
| Planned cardio added | `Incline Walk added to Tuesday` | success | 4s |
| Planned cardio edited | `Cardio updated` | success | 4s |
| Planned cardio removed | `Removed from Tuesday. Logged cardio stays.` | info | 5s |
| Cardio logged | `Cardio logged` | success | 4s |
| Retried log | `Already logged` | info | 4s |
| Cardio corrected | `Cardio updated` | success | 4s |
| Save failed | `Couldn't save. Your entries are still here.` | error (inline) | until fixed |

#### Destructive actions
- **Remove from plan** (planned cardio) — `AlertDialog` with the exact copy above; it never touches logged cardio.
- **Logged cardio** has no destructive action at all.

---

## 9. Responsive behavior

| Breakpoint | Behavior |
| ---------- | -------- |
| base (< 640px) | single column; cardio line wraps under the lifting line; dialog buttons stacked full-width (h-11); cardio-only **Log cardio** is the full-width primary action |
| `sm` | dialog becomes a centered `max-w-sm` panel; buttons inline right-aligned |
| `md`+ | side nav; centered column; layout otherwise identical — cardio gains no extra columns, totals, or charts |

Every cardio action is available at the smallest viewport.

---

## 10. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `WeekList` | plan builder | extended | day row gains an optional cardio line |
| `PlannedCardioDialog` | plan builder | new | modes: add, edit (+ remove) |
| `RemoveCardioConfirm` | plan builder | new | `AlertDialog` |
| `CardioCard` | dashboard | new | variants: combined-pending, combined-complete, focal-pending, focal-complete |
| `CardioLogDialog` | dashboard, history | new | modes: log (prefilled from plan), correct (prefilled from record) |
| `CardioHistoryLine` | history | new | states: complete (± planned comparison), pending, upcoming, missed |
| `CardioActivityInput` | all cardio dialogs | new | `Input` + suggestions list |
| `MinutesInput` | all cardio dialogs | new | numeric keypad, "min" suffix |

---

## 11. Accessibility, privacy, and data sensitivity

- Every cardio line that opens a dialog is a real `button` with an accessible name ("Edit cardio: Incline Walk, 20 minutes, Tuesday"; "Log cardio: Incline Walk, Tuesday, October 13").
- States are text ("Missed", "Upcoming", "Pending"), never colour alone; the check glyph is `aria-hidden` with the state in text for screen readers ("Logged").
- Minutes fields use `inputMode="numeric"`; tap targets ≥ 44px.
- Dialogs trap focus; errors use `role="alert"`.
- No location, gym, or address appears on any cardio surface. No share/export affordance.

---

## 12. Out of scope

**Deferred (design nothing now, don't preclude):** distance, pace, speed, incline, resistance, watts, calories, heart rate and zones, cadence, steps, elevation, route/GPS/maps, live timer/stopwatch, RPE/RIR, multiple cardio blocks per day, unplanned/ad-hoc cardio logging, cardio record deletion, HealthKit/Apple Health/Strava/Garmin/Fitbit/wearables.

**Permanent non-goals:** cardio progression of any kind (no Progress/Hold/Deload, no e1RM, no trend or weekly-minute chart, no PRs, no streaks), cardio Goals, generated conditioning programs or duration recommendations, cardio as an Exercise Library entry, scheduled-deload adjustment of cardio.

## Overload design checks

- [x] Cardio has no tag, chart, or trend — only type and duration.
- [x] Progress/deload colours never appear on a cardio surface; Hold-like quiet throughout.
- [x] Lifting remains the focal block and primary action on a combined day; cardio-only days get a real focal state.
- [x] Missed cardio never prompts; the three-choice missed-day prompt stays lifting-only.
- [x] No delete for logged cardio; removing planned cardio says so in its copy.
- [x] No share, social, streak, badge, or confetti element.
- [x] Every primary action is reachable one-handed at the base breakpoint.
- [x] Empty, loading, and error states are defined for every cardio surface.
- [x] This doc stops at UI/UX.
