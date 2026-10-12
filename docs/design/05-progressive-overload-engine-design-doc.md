# Progressive Overload Engine — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch: Progressive Overload Engine
**Focus:** How the lifter sees whether each lift should Progress, Hold, or Deload — and the strength trend behind that call — without the app ever rewriting what he logged.

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

---

## 2. Vision

Until now Overload has recorded what the lifter did. This pitch makes it say what the numbers mean: next to a lift, a quiet **Progress** or **Deload** tag, a suggested next load he can take or ignore, and — one exercise at a time — the e1RM line that justifies the call. During a scheduled deload week the whole split reads as planned recovery, and the per-lift calls go silent so an intentionally light week is never mistaken for failure.

Every tag is computed on read from logged history. Nothing here is a setting, a stored flag, or a button that overrides the math. Edit a past set and the call moves with it.

**Design north star:** *the tag is a conclusion, not a control — it states what the history already decided, and stays out of the way until it has something to say.*

---

## 3. Design principles

### 1. Hold is a non-event

The overwhelmingly common state is Hold, and Hold shows **nothing** — no badge, no color, no "Hold" chip. A tag appearing is itself the signal. Symmetry is not a reason to fill the gap.

### 2. Two deloads, two voices

A **scheduled deload** is planned recovery across the entire split for one week; it reads as a calm week-level banner and a reduced suggested load. A **reactive deload** is one lift underperforming; it reads as a per-exercise amber tag. They must never share a treatment, and during a scheduled deload week no reactive tag appears at all.

### 3. The tag is a conclusion, never a control

Nothing in the UI sets, edits, overrides, or dismisses a Progress/Deload/stall state. The only way to change a call is to change history (edit a past set) or train differently. Suggested loads are displayed, never applied.

### 4. One readable trend, not a dashboard

The e1RM surface is one exercise at a time: one line, a handful of points, a current number. No multi-lift comparison, no muscle analytics, no forecasting. When space is tight, the chart loses width, not the numbers beside it.

### 5. Gym context is part of the number

For a machine or cable lift, "100 lb" at one gym is not "100 lb" at another. A machine's progression state, trend, and suggestion are always read in a gym context; before a gym is chosen the app says so rather than inventing a universal number.

---

## 4. Visual language

### Color palette

| Token / theme path | Usage | Notes |
| ------------------ | ----- | ----- |
| `--progress` → `text-progress` / `bg-progress` | the Progress tag | green; already in theme (Pitch 1) |
| `--deload` → `text-deload` / `bg-deload` | the reactive Deload tag **and** the stalled-attention state | amber; already in theme |
| `primary` (electric blue) | the e1RM trend line, the current-point dot, data emphasis | the one accent; Overload's charting color |
| `muted` / `muted-foreground` | scheduled-deload banner, scheduled-deload chart points, suggested-load helper text, "not enough history yet" | planned/low-salience context |
| `card` / `border` / `foreground` | surfaces, dividers, numbers | inherited |

Status color is always reinforcement. Every tag carries its text label; the chart never relies on color alone (scheduled-deload points also change shape).

### State colors

| State | Visual treatment | Usage |
| ----- | ---------------- | ----- |
| Progress (computed) | `bg-progress/10 text-progress` pill, label **"Progress"**, optional `+5 lb` sublabel | lift is ready to go up |
| Reactive Deload (computed) | `bg-deload/10 text-deload` pill, label **"Deload"** | one lift underperforming |
| Stalled Progress candidate (computed) | `bg-deload/10 text-deload` pill, label **"Hold — trend flat"**, `AlertTriangle` icon | rep threshold met but e1RM not rising; **not** a Deload |
| Hold (computed) | no tag, no color | ordinary row |
| Insufficient history (computed) | no tag; on the detail view only, muted line "Not enough history yet" | first/second time performed |
| Scheduled deload week | muted week-level banner "Deload week · 90% load", no per-lift reactive tags | planned recovery across the split |
| `active` / `archived` mesocycle, goal | (unchanged from prior pitches) | — |

The **stalled** state deliberately borrows the deload *color* (it is an attention/caution, warm) but never the word "Deload" and never the Deload semantics. Its label leads with "Hold —" so it reads as "still holding, here's why."

### Typography, spacing, radius, elevation

Inherited. The e1RM current value uses the large tabular-numeral treatment already used for logged weights (`tabular-nums`, `font-semibold`). Tags use the shared `Badge` sizing (`text-xs`, rounded-full). The chart sits in a standard `Card`.

### Appearance

Light, dark, system (system default; toggle in Settings only). `--progress`/`--deload` are tuned per theme already. The chart reads theme tokens for line (`primary`), grid (`border`), and axis labels (`muted-foreground`) so it inverts cleanly. Scheduled-deload points use `muted-foreground` fill in both modes.

---

## 5. Information architecture

Pitch 1 owns the shell; this feature adds no new top-level nav item. Progression state surfaces inside existing destinations.

```text
┌──────────────────────────────────────────────────────────┐
│  Overload                                                  │
├──────────────────────────────────────────────────────────┤
│  Today   ── today's session                                │
│             • pending/in-progress: per-exercise tag        │
│               once gym is known; scheduled-deload banner   │
│             → Exercise card (tag + suggested load)         │
│             → Session summary (per-lift results + links)   │ ← enhanced
│  Plan    ── (unchanged)                                    │
│             Exercise library → Exercise detail             │
│               → Progression detail (state + e1RM chart)   │ ← enhanced
│  History ── week at a glance → logged day → edit a set    │
│               edit propagates to every derived tag/trend   │
│  Goals   ── (Pitch 6; not here)                            │
│  Settings── (unchanged)                                   │
└──────────────────────────────────────────────────────────┘
 Bottom bar (mobile): Today · Plan · History · Goals
```

The e1RM chart and progression detail live on the **Exercise detail page** (`/exercises/[id]`), which already resolves archived exercises and is reachable from the library, the logging card, and session history.

---

## 6. Screen specifications

### Screen 1: Today — per-exercise progression on the planned session

#### Purpose
Tell the lifter, before and during today's workout, which lifts are ready to move — but only once there's enough context to say so honestly.

#### URL pattern
`/` (dashboard) and `/log/[loggedSessionId]` (active workout)

#### Trigger
Opening the app on a training day; starting/resuming the day's session.

#### Layout — pending (gym not yet chosen)

```text
┌────────────────────────────────────────────┐
│ Wednesday · Week 2                          │
│ Push Day 1                                   │
│                                             │
│  Barbell Bench Press     3 × 6–8   Progress │  ← free-weight: tag shows now
│  Overhead Press          3 × 5–6            │  ← Hold: no tag
│  Chest Press Machine     3 × 8–10   · gym   │  ← machine: "Select a gym" hint
│  Triceps Pushdown        3 × 10–12  · gym   │
│                                             │
│            [ Start workout ]                │
└────────────────────────────────────────────┘
```

Free-weight (gym-consistent) exercises show their progression tag immediately — their history is global. Gym-variable exercises show a muted `· once gym is set` affordance instead of a tag, because the call depends on which gym's baseline applies (principle 5; Resolved Decision 15). No fabricated universal machine recommendation.

#### Layout — scheduled deload week

```text
┌────────────────────────────────────────────┐
│ ▁▁ Deload week · 90% load across the split ▁▁│  ← muted banner, full width
│ Wednesday · Week 5                           │
│ Push Day 1                                    │
│                                              │
│  Barbell Bench Press     3 × 6–8    165 lb   │  ← 90% suggested, no tags
│  Overhead Press          3 × 5–6     95 lb   │
│  Chest Press Machine     3 × 8–10   · gym    │
│                                              │
│            [ Start workout ]                 │
└────────────────────────────────────────────┘
```

During a scheduled deload week: the banner is present, **every reactive tag is suppressed** (no Progress/Deload/stall anywhere on the day), set count and rep range are unchanged, and the suggested load reads as 90% of the normal working context rounded down to the nearest 5 lb. Machine lifts still defer their number to gym selection.

#### Component / section name
| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Scheduled-deload banner** | `div` with `bg-muted text-muted-foreground`, small caps label | shown only in a scheduled-deload week; never alongside reactive tags |
| **Exercise row** | existing dashboard preview row | adds a trailing `ProgressTag` slot (free-weight now; machine after gym) |
| **Gym-pending hint** | `span text-xs text-muted-foreground` | "once gym is set" for gym-variable lifts pre-gym |
| **Suggested load** | `span tabular-nums text-muted-foreground` | shown on the card, not forced into the dashboard row |

#### Behavior
- After the gym is selected on the workout (Pitch 4 locks it at first set), machine/cable lifts resolve to their gym-scoped tag and suggested load.
- Hold renders nothing; the row looks exactly like a lift with no opinion.
- The dashboard is a preview; the authoritative per-lift presentation is the logging card (Screen 2).

---

### Screen 2: Exercise logging card — the recommendation beside the bar

#### Purpose
Show the lift's current call and a suggested load where the lifter is about to act on it, without obstructing set entry.

#### URL pattern
`/log/[loggedSessionId]` (one card per exercise)

#### Trigger
Entering the guided logging flow for the day.

#### Layout — Progress, free-weight

```text
┌────────────────────────────────────────────┐
│ ‹ Push Day 1                        1 / 4   │
├────────────────────────────────────────────┤
│ Barbell Bench Press            [ Progress ] │
│ 3 × 6–8                     Try 190 lb (+5) │  ← suggestion, muted
│                                             │
│  Set 1   [ 185 ] lb   [  8 ] reps           │
│  Set 2   [ 185 ] lb   [  8 ] reps           │
│  Set 3   [ 185 ] lb   [    ] reps           │
│                                             │
│  [ Swap exercise ]        [ View trend › ]  │
├────────────────────────────────────────────┤
│              [ Next: Overhead Press ]       │
└────────────────────────────────────────────┘
```

#### Layout — reactive Deload, machine (gym known)

```text
┌────────────────────────────────────────────┐
│ Chest Press Machine   · Downtown  [ Deload ]│
│ 3 × 8–10                   Try 95 lb (−? )  │  ← deload is reactive; see note
│  Set 1   [     ] lb   [    ] reps           │
└────────────────────────────────────────────┘
```

> Reactive Deload shows the tag and the gym context; it does **not** compute a reduced numeric target in this version (the pitch defines a 90% reduction only for the *scheduled* deload). The reactive Deload tag is advice to back the weight down at the lifter's discretion; no fabricated number.

#### Layout — stalled Progress candidate

```text
┌────────────────────────────────────────────┐
│ Lateral Raise          [ Hold — trend flat ]│
│ 3 × 12–15              e1RM flat 3 sessions  │  ← muted explanation
│  Set 1   [     ] lb   [    ] reps           │
│          [ View trend › ]                   │
└────────────────────────────────────────────┘
```

#### Layout — scheduled deload week (reactive suppressed)

```text
┌────────────────────────────────────────────┐
│ Barbell Bench Press                          │  ← NO tag during scheduled deload
│ 3 × 6–8 · deload week      Try 165 lb (90%) │
│  Set 1   [     ] lb   [    ] reps           │
└────────────────────────────────────────────┘
```

#### Component / section name
| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **`ProgressTag`** | `Badge` with `progress`/`deload`/`stalled` variant | absent for Hold and during scheduled deload |
| **Suggested load line** | `text-sm text-muted-foreground tabular-nums` | "Try {n} lb (+5)" for Progress; "Try {n} lb (90%)" in scheduled deload; omitted when no working-weight context exists |
| **View trend link** | `Button variant="link"` → exercise detail | present whenever ≥1 historical point exists |
| **Set rows** | existing `SetRow` (Pitch 4) | unchanged; the engine never pre-fills entered values |

#### Code reference
```tsx
<Card className="bg-card border-border">
  <CardHeader className="flex-row items-start justify-between gap-2">
    <div>
      <CardTitle className="text-base font-medium">{performedName}</CardTitle>
      <p className="text-sm text-muted-foreground tabular-nums">
        {scheme}
        {gymVariable && gymName ? ` · ${gymName}` : null}
        {suggestedLoad && (
          <span className="ml-2">Try {suggestedLoad.lbs} lb ({suggestedLoad.note})</span>
        )}
      </p>
    </div>
    {tag && <ProgressTag state={tag} />}{/* nothing for Hold / scheduled-deload */}
  </CardHeader>
  <CardContent className="space-y-3 tabular-nums">{/* existing SetRows */}</CardContent>
</Card>
```

#### Validation
No new validation. Set entry rules are Pitch 4's. The suggestion is advisory and never pre-populates or constrains the entered weight.

#### Empty / insufficient-history state
A lift performed fewer than twice shows no tag and no suggestion beyond Pitch 4's existing `suggestedWeightLbs` prefill behavior (which is a convenience, not a progression call). The card looks like an ordinary Hold.

#### Behavior
- The tag and suggestion are read server-side with the workout DTO; the card is otherwise the Pitch 4 client island.
- Suggested load is **display only** — tapping nothing applies it; the lifter types what he actually does.
- "View trend" deep-links to the exercise detail progression section (Screen 4).

---

### Screen 3: Session summary — what the day's work implies

#### Purpose
After the last set, give a calm, factual read of each lift's resulting call and a path to the trend — the first time progression interpretation appears in the completion experience.

#### URL pattern
`/log/[loggedSessionId]` (complete state) — enhancement of Pitch 4's factual summary.

#### Trigger
Finishing the workout (all exercises complete).

#### Layout

```text
┌────────────────────────────────────────────┐
│ Push Day 1 · complete                        │
│ Wednesday · Week 2 · Downtown Gym            │
├────────────────────────────────────────────┤
│ Barbell Bench Press     [ Progress ]  › trend│
│   Suggested next: 190 lb (+5)                │
│ Overhead Press                         › trend│  ← Hold, no tag
│ Chest Press Machine     [ Deload ]    › trend│
│ Triceps Pushdown        [Hold—trend flat] ›  │
├────────────────────────────────────────────┤
│              [ Done ]                         │
└────────────────────────────────────────────┘
```

#### Component / section name
| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Result row** | list row: name · `ProgressTag` · trend link | one per performed exercise; Hold shows name only |
| **Suggested next** | muted sub-line under Progress rows | "Suggested next: {n} lb (+5)" / "(90%)" in scheduled deload |
| **Scheduled-deload note** | muted banner at top if the session was a deload-week session | "Deload week — recovery, not a verdict"; no reactive tags shown |

#### Behavior
- No celebration, confetti, streak, or PR. This is a quiet record (Overload has no social/gamification).
- If the session was in a scheduled-deload week, the summary shows the deload note and **no** reactive tags (suppression carries into the summary).
- Goals are **not** shown here (Pitch 6).
- "Done" returns to the day-complete dashboard; it does not hand off to tomorrow.

---

### Screen 4: Exercise progression detail — current state + e1RM trend

#### Purpose
In one place per exercise: what the lift's current call is, the suggested next load if any, and the e1RM line that explains it.

#### URL pattern
`/exercises/[id]` — a new **Progression** region below the existing identity block. (Reachable from the library, the logging card "View trend", and the session summary.)

#### Trigger
Opening an exercise's detail page.

#### Layout — gym-consistent (free weight), enough history

```text
┌───────────────────────────────────────────────┐
│ ‹ Exercises                                     │
│ Barbell Bench Press        [Barbell] [Chest]   │
├───────────────────────────────────────────────┤
│ Progression                                     │
│   [ Progress ]   Suggested next: 190 lb (+5)   │
│                                                 │
│ e1RM trend                            Current   │
│   ┌───────────────────────────────┐    234 lb  │
│   │              •────•            │            │
│   │        •────•                  │            │
│   │   •────•                       │            │
│   └───────────────────────────────┘            │
│    Aug 2   Aug 9   Aug16  Aug23  Aug30         │
│   7 sessions · Epley estimate                   │
└───────────────────────────────────────────────┘
```

#### Layout — gym-variable (machine/cable), multiple gyms

```text
┌───────────────────────────────────────────────┐
│ Chest Press Machine    [Machine] [Chest]       │
├───────────────────────────────────────────────┤
│ Progression          Gym: [ Downtown  ▾ ]      │  ← selector only if >1 gym has history
│   [ Progress ]   Suggested next: 95 lb (+5)    │
│                                                 │
│ e1RM trend · Downtown                 Current   │
│   ┌───────────────────────────────┐    128 lb  │
│   │        •────•────•             │            │
│   └───────────────────────────────┘            │
│    5 sessions at Downtown · Epley               │
└───────────────────────────────────────────────┘
```

The gym selector switches the entire progression region — state, suggestion, chart — to that gym's isolated history. There is no combined cross-gym machine line (Resolved Decisions 12–14). If history exists at only one gym, the selector is hidden and the single gym is named inline.

#### Component / section name
| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Progression header** | section title + `ProgressTag` (or nothing for Hold) | shows current computed call in the active scope |
| **Suggested next** | muted tabular line | Progress → "+5"; omitted otherwise or when no working-weight context |
| **Gym selector** | `Select` (shadcn) | gym-variable only, rendered only when ≥2 gyms have qualifying history; default = most-recent gym |
| **`E1rmChart`** | Recharts `LineChart` in a `Card` | one series, `primary` line, scheduled-deload points marked; read-only |
| **Current value** | large `tabular-nums` | latest qualifying session-level e1RM in scope |
| **Caption** | `text-xs text-muted-foreground` | "{n} sessions · Epley estimate" (+ gym name for gym-variable) |

#### Code reference
```tsx
<section aria-labelledby="progression-heading" className="space-y-4">
  <div className="flex items-center justify-between">
    <h2 id="progression-heading" className="text-base font-medium">Progression</h2>
    {gymVariable && gyms.length > 1 && (
      <GymSelector gyms={gyms} value={selectedGymId} />
    )}
  </div>
  {tag ? <ProgressTag state={tag} /> : <p className="text-sm text-muted-foreground">Holding</p>}
  {suggestion && (
    <p className="text-sm tabular-nums text-muted-foreground">
      Suggested next: {suggestion.lbs} lb ({suggestion.note})
    </p>
  )}
  <E1rmChart points={points} scope={gymVariable ? gymName : null} />
</section>
```

#### Empty / insufficient-history state
- **No history:** "No logged sessions yet. Train this lift to see its trend." (muted; no chart frame).
- **1 session:** a single point rendered as a dot with its date and value, caption "1 session — not enough to call progress yet." No tag.
- **2 sessions:** two points joined; a tag may appear (Progress/Deload eligible at 2 sessions) but the stall gate does not yet operate (needs 3). Caption notes "2 sessions."

#### Loading state
`Skeleton` for the chart card (fixed height so the page doesn't jump) and a one-line skeleton for the progression header.

#### Error state
If the trend query fails, an inline `Alert` with a retry; the exercise identity block above still renders.

#### Behavior
- The detail page is a server component; progression state and chart points are read server-side. The gym selector is a small client island that updates a query param (`?gym=`), re-rendering the region.
- Everything here is read-only. The only way to change the line is to edit a past set from History (Screen 5).
- Archived exercises still render their trend (history must survive archival).

---

### Screen 5: Edit a past set → derived calls follow

#### Purpose
Prove the core invariant to the lifter: correcting history corrects every conclusion, with no "recompute."

#### URL pattern
`/history/[loggedSessionId]` → existing edit-set dialog (Pitch 4).

#### Trigger
Editing a logged set's weight or reps.

#### Layout
Unchanged edit dialog (Pitch 4). The design change is downstream: after saving, any screen that reads the affected exercise shows the recomputed tag, suggestion, and trend on next render.

#### Behavior
- Save uses Pitch 4's `editLoggedSet` path (the only LoggedSet write path besides `logSet`). Pitch 5 writes nothing.
- On return to a surface showing that exercise, the tag/suggestion/trend reflect the edit automatically (derived on read).
- If the edited set belongs to a **scheduled-deload** occurrence, no reactive tag is produced for that occurrence — editing never resurrects a suppressed week (Resolved Decision 40/46).
- Toast: `Set updated` (Pitch 4). No extra "recomputed" messaging — there is nothing to recompute.

---

## 7. Navigation flows

```text
Today (day) ──select gym──▶ machine tags + suggestions resolve
   │
   ▼ Start / resume
Exercise card ──[View trend ›]──▶ Exercise detail · Progression + e1RM chart
   │                                        ▲
   ▼ last set → Finish                      │ [View trend ›]
Session summary (per-lift calls) ───────────┘
   │
   ▼ Done
Day-complete dashboard

History ▶ logged day ▶ edit a set ─save─▶ (return) every derived tag/trend updated
Library ▶ Exercise detail ▶ [Gym ▾] (gym-variable) ─▶ that gym's trend + call
```

- "View trend" carries the performed exercise id; for gym-variable lifts it defaults the gym scope to the one just trained.
- All progression surfaces are reached through existing destinations; no new nav entry, no deep-link that bypasses auth.

---

## 8. Interaction specifications

### Keyboard navigation

| Context | Key | Action |
| ------- | --- | ------ |
| Gym selector (detail) | Enter/Space | open; Up/Down choose; Enter commit; Esc cancel |
| "View trend" link | Enter | navigate to progression detail |
| Edit-set dialog | (Pitch 4) | unchanged; Esc closes and returns focus |
| Chart | Tab | focus the chart; points are summarized in an accessible caption/table for screen readers (chart is not keyboard-interactive beyond focus) |

No new global shortcuts.

### Loading states

- Dashboard/card: tags and suggestions arrive with the server DTO; no separate client fetch, so no tag "pops in."
- Detail chart: fixed-height `Skeleton` card.

### Error states

- Trend read failure: inline `Alert` + retry; identity block unaffected.
- A tag can never fail independently of the page it's on — it is part of the same server read.

### Notifications

| Action | Message | Severity | Duration |
| ------ | ------- | -------- | -------- |
| Past set edited (Pitch 4) | `Set updated` | success | 4s |

No toast announces a tag change; the change is simply visible. No celebration on Progress.

### Destructive actions

None introduced. Progression adds no delete/archive affordances. (Editing history remains Pitch 4's reversible edit.)

---

## 9. Responsive behavior

| Breakpoint | Width | Behavior |
| ---------- | ----- | -------- |
| base | <640px | Single column. Tag sits at the end of the exercise name row, wrapping under the name if cramped. Suggested-load line sits under the scheme. Chart spans full width at ~180px tall. Gym selector is a full-width `Select`. |
| `sm` | ≥640px | Roomier card; tag inline with the title. |
| `md` | ≥768px | Exercise detail uses the existing two-column identity grid; the progression region spans the content column full width; chart ~240px tall. |
| `lg` | ≥1024px | Centered max-width; chart gains width only — never more series or metrics. |

Every action (view trend, switch gym, edit a set) is reachable one-handed on the smallest viewport. The chart degrades to width, not to extra chrome.

---

## 10. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `ProgressTag` | dashboard, card, summary, detail | **new** | variants: `progress`, `deload`, `stalled`; renders **nothing** for Hold / insufficient / scheduled-deload suppression |
| `SuggestedLoad` (inline) | card, summary, detail | **new** | muted tabular line; `+5` (progress) or `90%` (scheduled deload); omitted when no working-weight context |
| `E1rmChart` | exercise detail | **new** | Recharts `LineChart`, single series, `primary` line, scheduled-deload points shaped differently + muted; read-only; empty/1/2/3+ states |
| `GymSelector` | exercise detail | **new** | gym-variable only; shown when ≥2 gyms have qualifying history; writes `?gym=` |
| `ScheduledDeloadBanner` | dashboard, summary | **new** | muted week-level banner; mutually exclusive with reactive tags |
| Exercise preview row / card | Today, logging | reused | gains a trailing tag slot + suggestion line |

`ProgressTag` is the load-bearing shared piece: Pitch 6 (Goals) and History reuse it, so it takes a `state` prop with the three visible variants and simply returns `null` for anything that should be silent.

---

## 11. Accessibility, privacy, and data sensitivity

**Accessibility**
- Every tag carries a text label; the stalled state additionally differs in icon and wording from Deload, so it is distinguishable without color.
- The chart is decorative-plus-data: it has an accessible name ("e1RM trend for {exercise}{, {gym}}") and an associated visually-hidden table or caption listing each point's date and value so screen-reader users get the data, not just a picture.
- Gym selector is a labeled `Select` with an accessible name ("Gym for this trend").
- Numbers use `tabular-nums`; suggested-load and e1RM values are real text, not images.

**Privacy**
- No share/export/compare-to-others anywhere; progression is for one lifter's eyes.
- Gym **names** appear as trend scope labels; gym **addresses** never appear on progression surfaces (addresses stay on the Gyms screen / picker only).
- No external links, no maps, no analytics surface leaving the product.

---

## 12. Out of scope

**This pitch (deferred to a later pitch — design nothing now, preclude nothing):**
- Goals: target weight×reps, percentage-to-goal, completion, archive, new-goal creation (Pitch 6). Pitch 5 only produces the shared `estimateOneRepMax` and the trend Goals will read.
- A numeric reduced target for *reactive* Deload (only scheduled deload gets the 90% number here).
- Multi-exercise comparison, muscle-group analytics, mesocycle-boundary annotations on the chart beyond simple point marking.
- RPE/RIR inputs; dated goals; any cardio trend.

**Permanent non-goals (never):**
- Program/mesocycle generation — a suggestion is a load hint, never a plan edit.
- Any social, sharing, leaderboard, streak, badge, or celebration element.
- Progression analysis of cardio.
- Nutrition / body composition.
- Any control that sets, edits, or overrides a computed tag.

---

## Open Questions

None blocking. All mechanics (session-level e1RM aggregation, 2-vs-3-session thresholds, stall copy, scheduled-deload rounding, machine gym-scoping, precedence) are fixed by the run's pre-resolved decisions and recorded in the spec's Resolved Decisions.
