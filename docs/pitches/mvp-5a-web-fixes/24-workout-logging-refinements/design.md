# Workout Logging Refinements — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 24: Workout Logging Refinements (`pitch.md`)
**Focus:** Six small refinements to surfaces that already exist: a clear call after a failed set, single rep targets in the plan and on the card, a swap picker that can cross muscle groups, a confirmed reps-only path for abs, plainer public trial wording, and a plan column in the admin account list.

---

## 1. Vision

The lifter who misses badly at 90 lb should not be told to "stay at 90 lb". The lifter who writes "3 × 10" should see "3 × 10", not "3 × 10–10". The lifter whose cable station is taken should be able to swap to anything, not only the same muscle. Everything else stays where it is.

**North star:** *Say what happened, in the lifter's own numbers, and change nothing else.*

## 2. Design principles

### 1. A failed set is named, not smoothed over

When a set lands below the planned minimum, the recommendation says so and asks the lifter to reassess. It doesn't print a number it can't stand behind, and one bad set never lowers the weight on its own. The existing two-session reactive deload still does that.

### 2. The plan reads the way the lifter wrote it

A single target prints as one number everywhere it appears: the plan row, Today's list, the logging card, and the recommendation's evidence. A range keeps its en dash. Internally the target is a range whose two ends are equal. The lifter never sees that.

### 3. The filter starts where the plan is, and goes anywhere

The swap picker opens on the planned exercise's muscle group, so the usual case is unchanged. One control widens it to any group. Nothing is suggested or ranked beyond the existing favorites-first order.

### 4. Copy over mechanics

The two chores are words and a label. The trial and billing behave exactly as before, and the admin list gains one column of account metadata.

## 3. Visual language

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

### Color palette

| Token / theme path | Usage | Notes |
| --- | --- | --- |
| `foreground` | the reassess action line | same strong treatment as Progress and Deload actions (`font-medium`) |
| `muted-foreground` | evidence lines, the trial sentence, "Planned: Chest", the "trial" note on the Plan column | unchanged roles |
| `border`, `card`, `muted` | the Range/Fixed segmented control, the muscle `Select`, the Plan badge | existing primitives |

No new tokens. No color is added for the reassess call: it is a sentence, not a tag.

### State colors

| State | Visual treatment | Usage |
| --- | --- | --- |
| Progress (computed tag) | progress token, "Progress" | unchanged |
| Deload (computed tag) | deload token, "Deload" | unchanged; still needs two sessions running below the minimum |
| Hold (computed) | no tag, no color | unchanged; still the call for an in-range miss |
| **Reassess** (hold after a below-minimum session) | **no tag**; action line in `foreground font-medium`, evidence in `muted-foreground` | new action wording only. The lift is still a hold, so it carries no badge |
| Scheduled deload week | existing quiet "Deload week" line | unchanged; a below-minimum set in that week is never judged |
| Plan: Pro | `Badge variant="outline"` "Pro" | admin directory |
| Plan: Pro on trial | outline "Pro" + muted "trial" | admin directory |
| Plan: Comped | `Badge variant="secondary"` "Comped" | admin directory; visibly different from a paid Pro |
| Plan: Free | plain muted "Free" text | a non-event, like "Active" |

### Typography, spacing, radius, elevation

Unchanged. Rep targets keep `tabular-nums`.

### Appearance

Light, dark, and system all work through tokens. Nothing here is mode-specific.

## 4. Information architecture

```text
Today ── planned list "3 × 10" ─→ Workout ─→ Exercise card (scheme, recommendation)
                                              └─ [Swap exercise] → Swap picker (muscle filter)
Plan ─── Mesocycle → Session → planned exercise row "3 sets · 10 reps"
                               └─ [row] → Planned exercise dialog (Range | Fixed)
Exercises → exercise page "Next time" (recommendation)
Public: / (CTA note) · /pricing (trial line) · /blizzy (trial fit)
Admin (owner only): Accounts directory ── new Plan column
```

## 5. Screen specifications

## Screen 1: Planned exercise dialog (plan builder)

### Purpose
Set the sets and either a rep range or a single rep target for one exercise in a session.

### URL pattern
Dialog over `/plan/[mesocycleId]/sessions/[sessionId]` (edit) and the add flow `/plan/[mesocycleId]/sessions/[sessionId]/add`.

### Trigger
Tapping a planned exercise row (edit), or choosing an exercise in the add flow.

### Layout

```text
┌──────────────────────────────────────┐
│ Barbell Bench Press                  │
│ Chest · Barbell                      │
│                                      │
│ Sets      Reps        [Range|Fixed]  │
│ [ 3 ]     [ 6 ] – [ 10 ]             │   Range (default for a new exercise)
│                                      │
│ Sets      Reps        [Range|Fixed]  │
│ [ 3 ]     [ 10 ]                     │   Fixed
│                                      │
│ (error line)                         │
├──────────────────────────────────────┤
│              [Cancel] [Add to session]│
└──────────────────────────────────────┘
```

| Element | shadcn/ui component / styling | Behavior |
| --- | --- | --- |
| **Range / Fixed** | `Tabs` + `TabsList` with two `TabsTrigger`s, small (`h-8`), beside the "Reps" label | Switches the reps inputs. Doesn't submit. Keyboard: arrow keys move between the two |
| **Reps (Range)** | two `Input`s, `inputMode="numeric"`, "Minimum reps" / "Maximum reps", en dash between | unchanged |
| **Reps (Fixed)** | one `Input`, aria-label "Target reps" | the value is saved as both the minimum and the maximum |

### Fields

| Field | Type | Required | Default | Validation / notes |
| --- | --- | --- | --- | --- |
| Sets | whole number | yes | empty (add) | 1–max, unchanged |
| Mode | Range / Fixed | — | Range for a new exercise; on edit, Fixed when min = max | presentation only |
| Minimum / Maximum (Range) | whole numbers | yes | empty | unchanged: a max below the min is an error, never swapped. Equal values are still accepted |
| Target (Fixed) | whole number | yes | empty, or the saved value on edit | "Enter at least 1 rep." / "Keep reps to N or fewer." |

### Validation
- Unchanged server rules. Fixed submits `min = max = target`.
- Switching Range → Fixed keeps the minimum as the target when one was typed. Fixed → Range puts the target into both boxes. Nothing typed is lost.
- On edit, Save stays disabled until a value changes. Switching mode alone, with the same numbers, is not a change.

### Empty / loading / error
- Add starts empty in both modes: Overload never suggests a prescription.
- Pending: the submit button reads "Adding…" / "Saving…". Errors appear inline under the inputs, unchanged.

### Behavior
- Enter moves Sets → reps → submit, as today. In Fixed mode, Enter on the target submits.
- The planned row shows "3 sets · 10 reps" for a fixed target. This already works for equal values; no change needed.

## Screen 2: Exercise logging card and Today's planned list

### Purpose
Show today's prescription the way it was planned, and the call for this lift.

### Layout (card header)

```text
┌────────────────────────────────────────┐
│ Cable Crunch                            │   no tag: reassess is a hold
│ 3 × 10                     Downtown Gym │   fixed target
│ Reassess the weight today               │   reassess (strong)
│ Last time: 10, 6, 4 of 10 at Downtown   │   evidence (muted)
│ Gym, below 10. A deload follows 2       │
│ complete sessions running below 10.     │
└────────────────────────────────────────┘
Today:  Barbell Bench Press   3 × 6–8
        Cable Crunch          3 × 10
```

| Element | Behavior |
| --- | --- |
| **Scheme** | "3 × 10" when min = max, "3 × 6–10" otherwise. Bodyweight keeps " · bodyweight, reps only" |
| **Recommendation** | the existing two-line `Recommendation` component. The reassess call uses the strong action style and never shows a tag |

### Reassess wording (the one source of copy is the recommendation builder)

| Case | Action | Evidence |
| --- | --- | --- |
| External load, next time | `Reassess the weight next time` | `Last time: 3, 8, 8 of 6–10, below 6. A deload follows 2 complete sessions running below 6.` |
| External load, during the workout | `Reassess the weight today` | same evidence |
| Bodyweight | `Reassess the difficulty next time` | same evidence shape |
| Fixed target 10 | as above | `Last time: 8, 8, 8 of 10, below 10. …` |
| Gym-variable | as above | ` at Downtown Gym` after the range, as in other evidence lines |
| Latest judged session isn't the last one | as above | `On Oct 13: …` instead of `Last time:`, as today |

No number is printed in the reassess action: the engine has none it can stand behind (an untrusted weight is withheld, never invented).

### When reassess appears (behavior, not a rule change)
- The most recent finished workout of the lift, outside a scheduled deload week, had a planned working set below the planned minimum. That includes a workout where the lifter stopped before finishing every planned set.
- Not when two complete sessions running were below the minimum: that is still the reactive **Deload**, with its tag and "Lower the weight" action.
- Not with too little history (fewer than two complete sessions): still no call at all.
- Not for an in-range miss (7 of 6–10): still a quiet hold, "Stay at 90 lb next time".
- Not for sets logged in the workout still in progress: today's advice is judged on finished workouts only, as before.

### Empty / loading / error
Unchanged. No recommendation renders when there's nothing to say.

## Screen 3: Swap picker

### Purpose
Pick a substitute for today's planned exercise, from any muscle group.

### URL pattern
`/log/[loggedSessionId]/[loggedExerciseId]/swap?muscle=<group>`. With no `muscle` param, or an unknown one, it opens on the planned exercise's primary muscle.

### Layout

```text
┌──────────────────────────────────────┐
│ Swap: Cable Fly                      │
│ Planned: Chest                       │
│ Muscle group  [ Chest            ▾ ] │
│ [ Search exercises…               ]  │
│ ┌──────────────────────────────────┐ │
│ │ ★ Dumbbell Fly                   │ │
│ │   Machine Fly                    │ │
│ │   Push-Up                        │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

| Element | shadcn/ui component / styling | Behavior |
| --- | --- | --- |
| **Planned: {muscle}** | muted text | replaces "Same muscle: {muscle}" |
| **Muscle group** | `Select` (labelled), every canonical muscle group in display order; the planned group is preselected | changing it replaces the URL's `muscle` param. The list dims while the new group loads. The typed search is kept |
| **Search** | `Input` | filters the current group by name, client-side, unchanged |
| **Rows** | unchanged buttons, favorites first | selecting swaps this occurrence only and returns to the workout |

### Empty state

```text
No active exercises for Neck.
Pick another muscle group, or add one in the library.
```

The muscle `Select` stays visible in the empty state, so the lifter can leave it. The old "Crossing muscle groups is never allowed" line is removed.

### Locked / error
- Unchanged: once a set is logged on the exercise, the picker shows "Sets are logged — this exercise is locked." and offers nothing.
- An archived exercise is never offered, and the one currently performed is excluded.
- A failed swap shows the existing destructive `Alert` and keeps the list.

### Archived planned exercise prompt (card)
"This planned exercise was archived. Pick a substitute to complete it. The plan is not changed." ("same-muscle" is removed.)

## Screen 4: Admin account directory

### Purpose
Let the owner see each account's plan (Pro, Comped, or Free) at a glance.

### Layout (md+ table)

```text
Account                    Status   Plan          Joined   Last seen   Tour
Ana Ruiz  @ana · a@…       Active   Pro           Nov 2    Today       Finished
Ben Lee   @ben · b@…       Active   Pro  trial    Nov 9    Yesterday   Not yet
Cy Park   @cy · c@…        Active   Comped        Oct 1    Nov 8       Skipped
Di Shaw   @di · d@…        Active   Free          Sep 3    Not seen    Not yet
```

Phone: the meta line becomes `Active · Pro · Joined Nov 2 · Seen today`.

| Element | Behavior |
| --- | --- |
| **Plan** | Pro (a paying subscription in good standing, canceling, or in its grace window), Pro with a muted "trial" note (an active trial and nothing else), Comped (owner-granted complimentary access, no subscription), Free (none of these). A subscription outranks a comp, and a comp outranks a trial, matching the account page's billing panel |
| Data | account metadata only: the plan is resolved from entitlement and billing records. No plan, set, gym, goal, or cardio content is read |

No filter by plan is added. The account page keeps its existing billing panel.

## Screen 5: Public trial wording

| Surface | Before | After |
| --- | --- | --- |
| `/pricing` under the plans | "New accounts get 14 days of Pro, no card. After that you're on Free unless you subscribe, and nothing is deleted." | "Try Pro free for 14 days. No credit card needed. After that, keep using Overload on the free plan or upgrade for $4.99 a month." |
| Landing and pricing CTA note (signup open) | "Free to use. New accounts get 14 days of Pro, no card." | the same full sentence as `/pricing` |
| `/blizzy` trial fit | "How it fits the trial: new accounts start with 14 days of Pro, no card. Use the code whenever you subscribe, during the trial or after it." | "How it fits the trial: try Pro free for 14 days, no credit card needed. Use the code whenever you subscribe, during the trial or after it." |

The numbers come from the existing constants (14 days, $4.99 a month). The pricing FAQ already says the account moves to Free and nothing is deleted, so that reassurance is not lost.

## 6. Navigation flows

```text
Workout card ─[Swap exercise]→ Swap picker (?muscle=planned)
   Swap picker ─[Muscle group: Core]→ same page (?muscle=core) ─[Crunches]→ back to the workout, card shows Crunches "· bodyweight, reps only"
Plan session ─[row]→ dialog ─[Fixed, 10, Save]→ row "3 sets · 10 reps"
Finish workout → summary/exercise page → "Reassess the weight next time"
```

## 7. Interaction specifications

| Context | Key | Action |
| --- | --- | --- |
| Range/Fixed control | ← / → | switch mode |
| Fixed target input | Enter | submit |
| Muscle group select | Enter / Space, arrows | open, move, choose |

Loading: the swap list dims (`opacity-60`) during a muscle change, as the library does. Errors: unchanged inline and `Alert` patterns. No new toasts.

## 8. Responsive behavior

All screens are single column at the base width. The Range/Fixed control sits on the "Reps" label row and fits at 320px. The swap `Select` is full width. The admin Plan column appears in the md+ table and in the phone meta line. Every action is available on a phone.

## 9. Component inventory

| Component | Location | New / reused | Notes |
| --- | --- | --- | --- |
| `PlannedExerciseDialog` | plan builder | changed | Range/Fixed mode |
| `ExerciseCard` header | logging | changed | single-number scheme |
| `Recommendation` | card, Today, exercise page, summary | reused | new reassess wording arrives from the builder |
| `SwapPicker` | swap page | changed | muscle `Select`, new empty state |
| `PlanBadge` | admin directory | new (small) | Pro / Pro trial / Comped / Free |
| marketing copy constants | public pages | changed | words only |

## 10. Accessibility, privacy, and data sensitivity

- The Range/Fixed control has an accessible name ("Rep target type"). The fixed input is labelled "Target reps".
- The muscle `Select` has a visible label "Muscle group".
- The Plan column is text, never color alone. "Comped" and "Pro" are different words.
- The admin directory reads plan state from entitlement and billing records only. It never reads or shows training content. The admin privacy sentinel test covers the new field.
- No share or cross-account affordance is added.

## 11. Out of scope

- Any progression rule change beyond the below-minimum case: no new thresholds, constants, or deload amounts. The reassess call never prints a reduced weight.
- Re-judging today's advice from sets logged in the workout in progress.
- Reclassifying library exercises' equipment (for example Ab Roller or Exercise Ball Crunch, filed as "other"/"exercise ball" and therefore loaded). See the spec's audit record.
- Swap suggestions, ranking, an "any muscle" mode, or cross-muscle substitution in plan import.
- Billing, trial, or pricing behavior; a plan filter or plan editing in the admin directory.
- Mobile (web only). Permanent non-goals (program generation, AI coach, social, ads, dated goals, rest timer, cardio progression, admin view of training content) are untouched.

## 12. User guidance

- **Tour.** No new step and no change. The Plan step's "sets and rep ranges" stays true, since a single target is a range with equal ends, and nothing new needs pointing at.
- **Release note** (proposed as list only; the guidance ticket made it **significant**, because it corrects a recommendation; spec RD-14):
  - Title: "Single rep targets and wider swaps"
  - Body: "Plan an exercise as 3 × 10 as well as 3 × 8–10. Swap can now reach any muscle group. And after a set below your planned minimum, Overload asks you to reassess the weight instead of telling you to stay at it."

## 13. Plan placement and client scope

- **Plan placement.** Plan building, single targets, swap, and logging (including reps-only): **Free**. The reassess recommendation is part of the existing **Pro** capability `progression_insights`. A Free lifter keeps the existing quiet upgrade note in its place and never receives the call. Public trial copy: public. Plan column: owner-only admin area.
- **Client scope: web only.** No mobile app exists yet.

| Surface | Shared logic | API | Web UI | Mobile UI | Reason |
| --- | --- | --- | --- | --- | --- |
| Reassess call | pure engine + builder (shareable later) | none | card, Today, summary, exercise page | pending (mobile slices) | the engine is client-agnostic |
| Fixed target | plan validation (unchanged) | none | dialog, scheme displays | pending | — |
| Swap filter | swap write rule | none | swap picker | pending | — |
| Admin Plan column | — | — | admin directory | never | the admin area is web-only |
| Trial copy | — | — | public pages | n/a | — |
