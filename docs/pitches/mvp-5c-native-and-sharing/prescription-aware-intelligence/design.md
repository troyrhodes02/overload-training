# Prescription-Aware Intelligence — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch: Prescription-Aware Intelligence (`pitch.md`)
**Focus:** The weight a card offers, the "Last time" line, and every progression call come from the same recurring workout, so bench in Push and bench in Upper each remember their own numbers.

## 1. Vision

Between sets the lifter asks one question: "what did I put on the bar last time I did *this* workout?" Today Overload answers with whatever bench was logged most recently, which on Wednesday is Saturday's heavier top set. This feature answers it per recurring workout, says plainly when there is no answer yet, and shows other workouts' numbers only as labeled reference.

**North star:** *the box only holds a number you have lifted in this workout before.*

## 2. Design principles

### 1. A prefilled number is a promise

A weight in the box means "you lifted this here last time, for these reps." If that isn't true, the box is empty. Nothing estimated, converted, or borrowed from another workout ever sits in the box.

### 2. Reference is quieter than history

Another workout's numbers can help, so they appear, but one step quieter than the "Last time" line, marked "For reference", and never next to the box as a caption. The lifter can tell at a glance which number is theirs for today.

### 3. Facts, not categories

The card names the workout and its reps ("Push · 3–5 reps"), never "heavy" or "volume". The lifter wrote the plan; the card repeats their words.

### 4. One workout, one voice

The card, Today's planned list, the finish summary, and the exercise page give the same call for the same workout. When an exercise is in two workouts, the exercise page shows one line per workout instead of one call that would contradict one of them.

### 5. Hold is still a non-event

Nothing about hold changes: no tag, no color. A first workout with no comparable history also shows no tag.

## 3. Visual language

All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

| Token / theme path | Usage | Notes |
| --- | --- | --- |
| `foreground` | exercise name, typed weights | unchanged |
| `muted-foreground` | "Last time in Push" line, offer caption | unchanged weight, `text-sm` |
| `muted-foreground` at `text-xs` | "For reference" line | one step quieter than the Last-time line |
| `progress` / `deload` tokens | existing `ProgressTag` | unchanged |
| `border`, `card` | card shell | unchanged |

State mapping (the tags are computed, never entered):

| State | Visual treatment | Usage |
| --- | --- | --- |
| Trusted prefill | number in the weight box, caption `last time` | this workout's last comparable performance |
| No comparable history | empty box, no caption; primary line says nothing is logged for this workout yet | first time, a changed rep range, or a deload week with no deload history |
| Reference available | quieter `For reference:` line under the primary line | another workout, or this workout at another rep range |
| Progress / Deload | existing tags | per workout |
| Hold / not enough history | no tag | per workout |

Numbers stay tabular (`tabular-nums`), weights in lbs. Appearance: tokens only, so light and dark need nothing extra.

## 4. Information architecture

The shell is unchanged. This feature changes content inside four existing surfaces and adds no route.

```text
Today ── planned list (per-exercise call for TODAY's workout)
  └─ [Start] → Workout runner → Exercise card  ← main change
                                  └─ finish → Session summary (per-exercise call)
Plan ── unchanged (clone keeps each workout's history; duplicate starts fresh)
Exercises → Exercise page ── Next time (one line per workout)  ← change
                          ── Records / Trend (unchanged, exercise-wide)
                          ── Sessions (each row names its workout)  ← small change
```

## Screen 1: Exercise card — weight offer and context line

### Purpose
Tell the lifter what they lifted last time in this workout and put that weight in the box, or say clearly that this workout has no number yet.

### URL pattern
`/log/[loggedSessionId]` (the workout runner; unchanged)

### Trigger
Opening a workout, or moving to a card with Next / Previous.

### Layout

Trusted prefill (second Saturday):

```text
┌────────────────────────────────────────────┐
│ Barbell Bench Press                        │
│ 3 × 3–5                                    │
│ Last time in Push · Nov 8 · 255 × 5, 5, 4  │
│                                            │
│  Set 1  [ 255 ] lbs  [    ] reps  [Log set]│
│          last time                         │
│  Set 2   —                                 │
│  Set 3   —                                 │
└────────────────────────────────────────────┘
```

First Wednesday, Saturday logged (reference from another workout):

```text
┌────────────────────────────────────────────┐
│ Barbell Bench Press                        │
│ 3 × 6–8                                    │
│ Nothing logged in Upper at 6–8 reps yet.   │
│ For reference: Push · 3–5 reps · Nov 8 ·   │
│ 255 × 5, 5, 4                              │
│                                            │
│  Set 1  [     ] lbs  [    ] reps  [Log set]│
└────────────────────────────────────────────┘
```

Never performed anywhere:

```text
│ Barbell Bench Press                        │
│ 3 × 3–5                                    │
│ First time logging this.                   │
│  Set 1  [     ] lbs  [    ] reps  [Log set]│
```

Machine at a gym (Tuesday hip abduction, EOS):

```text
│ Hip Abduction Machine          EOS Fitness │
│ 2 × 12–15                                  │
│ Last time in Lower · Nov 11 · 100 × 15, 14 │
│  Set 1  [ 100 ] lbs  [    ] reps  [Log set]│
│          last time                         │
```

### Context line

| Element | shadcn/ui component / styling | Behavior |
| --- | --- | --- |
| **Last-time line** | `<p className="text-sm text-muted-foreground tabular-nums">` | `Last time in {workout} · {date} · {sets}` when this workout has a comparable performance before today |
| **Nothing-yet line** | same style | `Nothing logged in {workout} at {reps} reps yet.`; in a scheduled deload week: `Nothing logged in {workout} for a deload week yet.` |
| **First-time line** | same style | existing copy when the exercise was never logged in scope: `First time logging this.` / `First time on this at {gym}.` |
| **Reference line** | `<p className="text-xs text-muted-foreground tabular-nums">` starting `For reference:` | `For reference: {workout} · {reps} reps · {date} · {sets}`. Never shown together with a Last-time line. Never sets the box. |
| **Weight box** | existing `Input` (`inputMode="decimal"`) | prefilled only from the Last-time performance; empty otherwise |
| **Offer caption** | existing caption under the box | `last time` or `same as set N`. The old `working weight` caption (gym baseline) no longer appears, because the baseline is no longer a weight source. |

`{workout}` is the session's name (Push, Upper). `{reps}` is the rep target as the plan writes it (`3–5`, `10`). Sets use the existing summary (`255 × 5, 5, 4`; `18, 15 reps` for bodyweight).

The reference is the most recent earlier performance of this exercise that isn't usable for today: another workout, the same workout at a different rep range, or a normal week when today is a deload week. For machines it comes from the same gym only, as today.

### Code reference

```tsx
<div className="min-w-0">
  <h2 className="font-medium">{exercise.performedExerciseName}</h2>
  <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">{scheme}</p>
  <p className="mt-1 text-sm tabular-nums text-muted-foreground">{contextLine}</p>
  {referenceLine ? (
    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{referenceLine}</p>
  ) : null}
</div>
```

### Fields
No new fields. The weight box keeps its validation (above 0, at most 9,999.99, two decimals) and the reps box stays empty (reps are never offered).

### Validation
Unchanged. An empty box with no offer behaves exactly like today's first-time card: Log set with an empty weight shows the existing inline weight error.

### Empty state
"First time logging this." with an empty box (unchanged).

### Loading state
Unchanged: the runner is server-rendered, so the card arrives complete. The card never shows a box that later fills in.

### Error state
Unchanged. A failed Log set keeps the typed numbers. Nothing in this feature can fail separately on the card.

### Behavior
- Logging set 1 makes set 2 offer `same as set 1` (unchanged).
- After a past set is corrected in History, the next card read reflects it (computed on read).
- Renaming Push or moving it to another weekday keeps "Last time in Push". Cloning a block keeps it too. A duplicated session starts with "Nothing logged in {copy} …".

## Screen 2: Exercise card — progression line (Pro)

### Purpose
Give today's call for this workout only.

### Trigger
Same card, below the context lines (existing position).

### Layout

```text
│ Barbell Bench Press              [Progress]│
│ 3 × 3–5                                    │
│ Last time in Push · Nov 15 · 255 × 5, 5, 5 │
│ Add 5 lb → 260 lbs                         │
│ Top of the range two sessions in a row     │
```

Wednesday the same week (independent):

```text
│ Barbell Bench Press                        │
│ 3 × 6–8                                    │
│ Last time in Upper · Nov 12 · 230 × 8, 8, 7│
│ Stay at 230 lbs                            │
```

| Element | Component | Behavior |
| --- | --- | --- |
| **Tag** | existing `ProgressTag` | from this workout's comparable history only |
| **Recommendation** | existing `Recommendation` | its number is always this workout's own last weight (+5, or 90% in a deload week); withheld rather than borrowed |
| **Not enough history** | existing (no tag, no line) | a new workout, or a changed rep range, has no call until it has its own history |
| **Locked (Free)** | existing single `UpgradeNote` | unchanged |

Wording is the existing recommendation copy. This feature adds no new phrases to the call.

## Screen 3: Today — planned list and finish summary

### Purpose
Show the call for today's workout before starting, and after finishing.

### Layout
Unchanged. Each planned exercise's tag and recommendation is now the one Screen 2 would show for that exercise in today's workout. In a scheduled deload week the 90% number comes from this workout's own last normal week.

### States
Unchanged (pending, in progress, complete, rest, missed-day). A pending workout uses the plan's rep ranges; a started workout uses the rep ranges copied when it started.

## Screen 4: Exercise page — Next time and Sessions

### Purpose
Keep the exercise page truthful when the lift is in more than one workout.

### URL pattern
`/exercises/[id]` (unchanged, including `?gym=` for machines)

### Layout

One workout (unchanged):

```text
Next time
[Progress] Add 5 lb → 260 lbs
Top of the range two sessions in a row
```

Two workouts:

```text
Next time
Push · 3–5 reps
  [Progress] Add 5 lb → 260 lbs
  Top of the range two sessions in a row
Upper · 6–8 reps
  Stay at 230 lbs
```

Sessions list rows gain the workout name in their date line:

```text
Nov 15 · Push          255 × 5, 5, 5      Progress
Nov 12 · Upper         230 × 8, 8, 7
```

| Element | Component | Behavior |
| --- | --- | --- |
| **Workout label** | `<p className="text-sm font-medium tabular-nums">` | `{workout} · {reps} reps`; shown only when there are two or more lines |
| **Per-workout call** | existing `ProgressTag` + `Recommendation` | the same call that workout's card would show next time |
| **Not enough history** | existing `insufficientNote` line, per workout | e.g. Upper just changed its rep range |
| **Session row workout name** | existing row meta, `text-muted-foreground` | the workout that session belonged to |
| **Session row call** | existing call column | computed from that workout's own history up to that session |

The lines listed are the workouts in the active block that plan this exercise, in the block's session order. If the exercise isn't in the active block, one line for the workout it was last performed in. Records, Trend, and Goals are unchanged and exercise-wide (one gym at a time for machines).

### Empty / loading / error states
Unchanged: no history → existing empty copy; server-rendered page; existing error boundary.

## 5. Navigation flows

```text
Today → [Start] → card (Last time in Push) → … → Finish → summary → Today
History → past day → edit set → exercise page / next card reflect it
Plan → clone block → next block's cards keep "Last time in Push"
Plan → duplicate session → copy's cards start "Nothing logged in {copy} …"
```

No new navigation. The card's existing history link still opens the exercise page.

## 6. Interaction specifications

**Keyboard:** unchanged. Focus lands in the weight box when it is empty and in reps when an offer is present (existing rule: an offered weight is selected, so typing replaces it).

**Notifications:** none added.

**Destructive actions:** none added.

## 7. Responsive behavior

| Breakpoint | Behavior |
| --- | --- |
| base | Context and reference lines wrap under the scheme; the reference line wraps before the sets summary at `·` boundaries naturally; nothing truncates numbers |
| `sm`+ | Same lines, wider |
| `md`+ | Exercise page's per-workout lines stack in the existing Next time section |

## 8. Component inventory

| Component | Location | New / reused | Notes |
| --- | --- | --- | --- |
| `ExerciseCard` | runner | reused | adds the reference line; context line wording changes |
| `Recommendation`, `ProgressTag` | card, Today, summary, exercise page | reused | unchanged |
| Exercise page Next time | exercise page | reused | renders one entry or a labeled list |
| `SessionHistoryList` | exercise page | reused | row meta gains the workout name |

## 9. Accessibility, privacy, and data sensitivity

- The reference line is plain text read in order after the Last-time / Nothing-yet line, so a screen reader hears "Nothing logged in Upper at 6–8 reps yet. For reference: Push, 3–5 reps …".
- The weight box's accessible name is unchanged. An empty box has no caption, so nothing implies a number.
- Workout names are the lifter's own words and stay inside their account. No cross-account content.

## 10. Out of scope

Deferred to separate pitches: planned target RIR and its display, rest guidance, notes (Planned Workout Guidance); custom deload percentages, Free deload numbers, a Use weight action (Deload Customization); chart series and a workout selector on the exercise page (Exercise History Contexts); jump to exercise (Jump to Exercise); an "earlier best" line after an off day.

Permanent non-goals: program generation, AI coaching, a rest timer, social features, ads, dated goals, cardio progression.

## 11. User guidance

- **Tour:** no step. The card's anatomy is unchanged and its existing tour step still describes it.
- **Release note (significant: yes — decided in the spec, RD-15, because the offered weight and calls change):** title "Each workout remembers its own weights". Body: "If an exercise is in two workouts, each one now offers the weight you lifted last time in that workout, and gets its own progress call. Other workouts' numbers show as reference only."

## 12. Plan placement and client scope

**Plan placement.** Prefill, the Last-time line, and the reference line are **Free**. Tags, recommendations, and their numbers stay **Pro** (`progression_insights`); the Free locked state is the existing single quiet note.

**Client scope: both.**

| Surface | Shared logic | API | Web UI | Mobile UI | Reason |
| --- | --- | --- | --- | --- | --- |
| Workout identity and comparable history | pure rule in `@overload/shared` | — | — | — | one rule for every reader |
| Exercise card weight and lines | formatting in `@overload/shared` | card contract gains additive fields | changed | 21e builds it from the contract | the phone's card must say the same thing |
| Progression calls | server only | `/today` planned progression keeps its shape | unchanged UI | 21e/21g | behavior only |
| Exercise page | server only | not in the mobile API yet | changed | 21i | per-workout lines |

## 13. Mobile design

No native screen is built in this pitch. When slice 21e builds the native exercise card it follows the same three states:

```text
┌─────────────────────────────────┐
│ Barbell Bench Press             │
│ 3 × 6–8                         │
│ Nothing logged in Upper at 6–8  │
│ reps yet.                       │
│ For reference: Push · 3–5 reps  │
│ · Nov 8 · 255 × 5, 5, 4         │
│ ┌──────────┐  ┌──────────┐      │
│ │  lbs     │  │  reps    │      │
│ └──────────┘  └──────────┘      │
│        [ Log set ]              │
└─────────────────────────────────┘
```

- The numeric keypad opens on the weight field when it is empty, and on reps when a weight is offered.
- The reference line uses the native footnote style; it is never tappable to copy into the field.
- States: loading uses the existing native skeleton; unreachable and locked follow the 21d gates. No state is added.
- The app renders the server's lines and fields; it does not compute which history is comparable.
