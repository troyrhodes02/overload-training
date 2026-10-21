# Faster Logging UX — Design Document

**Version:** 1.1
**Pitch Source:** Overload — Pitch 13: Faster Logging UX (`pitches/13-faster-logging-ux.md`)
**Focus:** The exercise logging card, refined so an ordinary set is one tap after the reps are typed, without ever logging a number the lifter didn't confirm.

> Written in an unattended pipeline run (CLAUDE.md, Autonomous Pipeline Policy). The skill's clarification step does not apply: every design-stage question the pitch leaves open (pitch §14) is decided here, marked **Decision**, and carried into the spec's Resolved Decisions. Authority: the pitch, the approved multi-user planning set (Pitch Roadmap → Faster Logging UX), `CLAUDE.md`, the Guided Workout Logging and Progressive Overload Engine specs, `method-note.md`, and the code as it ships today.

---

## 1. What exists today (the baseline this refines)

The card shipped by Guided Workout Logging (`src/components/logging/exercise-card.tsx`) and its runner (`workout-runner.tsx`) work, and this design keeps their structure: one exercise per card, all planned sets on it as rows, the runner's `n / m` header and Previous / Next bar, Swap, "Didn't do this exercise", Add set after the plan, View trend, the scheduled-deload and stall notes, and the suggested-load line. What costs taps and attention today:

| Today | Effect on the lifter |
| ----- | -------------------- |
| Every unsaved row shows its own weight input, reps input, and a small `Save` button (36px). | Three sets means six inputs and three Save buttons on screen at once. The button is below the 44px target. |
| Every unsaved row's weight is filled from the working weight when the page loads, and looks exactly like a typed number. | A row nobody has touched looks half-done. If set 1 goes up to 190, sets 2 and 3 still say 185, so each needs a tap and a retype. |
| After a save, nothing has focus. | Each set is: tap the reps field, type, tap Save. Enter does nothing. |
| A saved row keeps its inputs, disabled and greyed, with a small check. | "Logged" and "can't edit" look the same; a logged set reads as a disabled form, not as history. |
| The context line says `last: 185 lbs` — one number, and for a machine at a gym with no baseline yet it can come from **another gym**. | The lifter can't see what they actually did last time (sets and reps), and a machine weight can be borrowed across gyms (pitch §9.2). |
| A mistyped logged set can only be fixed from History → the day → edit. | Three screens and a dialog away, mid-workout. |

---

## 2. Vision

Between sets, the lifter has one question: "what did I just do?" The card already knows the weight they're likely using and what they did last time, so it shows both and asks only for the reps, then gets out of the way until the next set.

**Design north star:** *the weight carries, the reps are always yours.*

---

## 3. Design principles

### 1. A box is a draft; a plain number is history
Anything inside an input is not logged yet, however it got there. A logged set is plain text with a check. No other signal is needed to tell a prepared value from a confirmed one, and none may contradict it: a prefilled weight never appears outside a box, and a logged set never appears inside one.

### 2. The weight carries, the reps are always yours
Weight is the number that repeats, so it is offered: from the working weight for the first set, then from the set just logged. Reps are the number that changes as fatigue sets in, so they are never offered, copied, or guessed. Every set needs the lifter to type its reps and confirm it.

### 3. One set at a time
Only the next set to perform has fields. Sets already logged are history; sets still to come are quiet placeholders. The card shows one thing to do now, which is also how it shows fewer controls than before.

### 4. Focus follows the lifter, never leads them
The cursor moves only because the lifter did something: logged a set, moved to another exercise. It never jumps on page load, never moves while they're typing, and never moves to a field that is already logged.

### 5. Same truth, fewer steps
Nothing about what gets written changes: the same set write, the same validation, the same baseline rule, the same correction flow, the same gym scope for machines and cables. Only the number of taps to reach it does.

---

## 4. Visual language

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

### Color palette

| Token / theme path | Usage | Notes |
| ------------------ | ----- | ----- |
| `card`, `border` | the exercise card | unchanged |
| `foreground` | logged set numbers; typed values in the active row | high contrast: logged history is the most legible thing on the card |
| `muted-foreground` | context line, prefill source caption, upcoming placeholders, unit suffixes | |
| `primary` | logged-set check, the active row's left edge and focus ring, the `Log set` button | the accent marks "this is where you are" and "this is done", nothing decorative |
| `ring` | input focus ring | stock shadcn focus |
| `destructive` | inline save/validation error under the active row | text only |
| `progress`, `deload` | the existing tag only | untouched; never used for set states |

### Set states

The pitch's three states (pitch §4.7) plus the two transient ones a write needs.

| State | Visual treatment | Meaning |
| ----- | ---------------- | ------- |
| **Logged** | `Set 1` muted label · `185 lbs × 8` in `foreground`, `tabular-nums`, `text-base` · `Check` icon in `primary` at the right · no input chrome | a `LoggedSet` exists with exactly these values (rendered from the server's record, never from local state) |
| **Active — prepared** | rows' left edge `border-l-2 border-primary`, subtle `bg-muted/40` · weight box holds the offered value with a muted caption under it (`last time`, `same as set 1`) · reps box empty · `Log set` button | the next set to perform; nothing written |
| **Active — edited** | as prepared, caption removed once the lifter changes the weight | the lifter's own numbers; nothing written |
| **Saving** | as active, inputs and button disabled, button reads `Saving…` | the write is in flight; **not** shown as logged |
| **Upcoming** | `Set 3` muted label · `—` muted · no inputs | a planned set not yet reached |
| **Error** | as active (numbers kept, inputs enabled), `destructive` text under the row | the write failed or the input is invalid; nothing written |

Hold, progress, and deload tags are unaffected: the tag column and the stall/deload notes stay exactly as they are.

### Typography and spacing

- Set entry inputs: `h-12` (48px), value `text-lg font-medium tabular-nums tracking-tight`, unit (`lbs`, `reps`) as a muted suffix inside the box (`text-sm`). Numbers stay the largest thing on the card (Guided Workout Logging principle "Numbers over decoration").
- Logged rows: `min-h-11` (44px) so each is a comfortable tap target for correction, `text-base tabular-nums`.
- Upcoming rows: `min-h-9`, so the card does not grow taller than today's.
- Every action on the card and in the runner bar: 44px (`h-11`) minimum.

### Appearance

Light and dark via tokens only. In dark mode the active row's `bg-muted/40` is the near-black elevated step, never tinted.

---

## 5. Information architecture

Nothing moves. The flow is the one Guided Workout Logging established; this pitch refines one screen in it and lets one existing dialog open from it.

```text
┌──────────────────────────────────────────────────────────────┐
│  Overload                                     [≡] (phone)    │
├──────────────────────────────────────────────────────────────┤
│  Today ── [Start] → Where are you training? → Workout        │
│                                                              │
│  /log/[loggedSessionId]  Workout runner                      │
│     ├ Exercise card (one at a time)          ← refined       │
│     │    ├ Last time line                     ← new text     │
│     │    ├ Set rows: logged · active · upcoming ← refined    │
│     │    │    └ tap a logged set ─► Edit set dialog (reused) │
│     │    ├ Add set · View trend · Swap · Didn't do (as today)│
│     ├ [Previous]  [Next: <exercise>]          ← label only   │
│     └ last exercise: [Finish workout] → confirm if unfinished│
│                                                              │
│  History ── day ── edit (unchanged)                          │
└──────────────────────────────────────────────────────────────┘
  md+: left rail + centered column (unchanged) · phone: header menu sheet (unchanged)
```

- The card stays inside the runner at `/log/[loggedSessionId]`. No route, page, or navigation item is added.
- The Edit set dialog is the History correction dialog, reused as is. It now also opens from a logged row on the card.

---

## 6. Screen specifications

## Screen 1: Exercise card — logging a weighted exercise

### Purpose
Log the next planned set of the current exercise with as few taps as possible, seeing what was done last time.

### URL pattern
`/log/[loggedSessionId]` (runner; the current card is runner state, as today).

### Trigger
Opening or resuming a workout; Next / Previous in the runner.

### Layout — first set, history exists (Journey A, step 3)

```text
┌──────────────────────────────────────────┐
│ ‹ Push Day 1                       1 / 4 │
│ Downtown Gym                [Change gym] │
├──────────────────────────────────────────┤
│ Barbell Bench Press                      │
│ 3 × 6–8                                  │
│ Last time · Oct 13 · 185 × 8, 8, 7       │  ← previous performance (text)
│                                          │
│▌Set 1                                    │  ← active row (accent edge)
│▌[ 185          lbs ] [          reps ] [✓ Log set] │
│▌  last time                              │  ← prefill source caption
│  Set 2   —                               │  ← upcoming
│  Set 3   —                               │
│                                          │
│  View trend ›                            │
│  [ Swap exercise                       ] │
│  [ Didn't do this exercise             ] │
├──────────────────────────────────────────┤
│ [Previous]  [ Next: Incline Dumbbell P… ]│
└──────────────────────────────────────────┘
```

At 375px the active row's three controls sit on one line: weight box `flex-1`, reps box `w-24`, `Log set` button. On the narrowest supported width (320px) the button label shortens to `Log` (the icon stays); it never wraps below the fields, so it stays beside the field the lifter just typed in and above the phone keyboard.

### Layout — mid-exercise, weight reused (Journey A, step 5)

```text
│ Barbell Bench Press                      │
│ 3 × 6–8                                  │
│ Last time · Oct 13 · 185 × 8, 8, 7       │
│                                          │
│  Set 1   185 lbs × 8                  ✓  │  ← logged (tap to correct)
│▌Set 2                                    │
│▌[ 185          lbs ] [ 8|       reps ] [✓ Log set] │  ← cursor already in reps
│▌  same as set 1                          │
│  Set 3   —                               │
```

### Layout — weight changed between sets (Journey B)

```text
│  Set 1   190 lbs × 8                  ✓  │
│▌Set 2                                    │
│▌[ 195          lbs ] [ 6        reps ] [✓ Log set] │  ← caption gone: the lifter's own number
│  Set 3   —                               │
```

After set 2 logs at 195, set 3 offers 195 (`same as set 2`): reuse always follows the most recently logged set, never the original prefill.

### Layout — all planned sets logged

```text
│  Set 1   185 lbs × 8                  ✓  │
│  Set 2   185 lbs × 8                  ✓  │
│  Set 3   185 lbs × 7                  ✓  │
│  All 3 sets logged.                      │  ← muted, one line
│  [ + Add set                           ] │  ← existing ghost button
│  View trend ›                            │
│  [ Swap exercise · locked (sets logged)] │  ← existing, unchanged
├──────────────────────────────────────────┤
│ [Previous]  [ Next: Incline Dumbbell P… ]│  ← focus lands here
```

### Elements

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Title, scheme, tag, gym** | as today | unchanged |
| **Last time line** | `p`, `text-sm text-muted-foreground tabular-nums` | replaces today's `· last: 185 lbs`. See "Previous-performance context" below. Text only, never a control |
| **Logged row** | `button` (full-row, `min-h-11`, `text-left`, `rounded-md`, hover `bg-muted/50`, focus ring) wrapping `Set N`, `{w} lbs × {r}`, `Check` | tap or Enter opens the Edit set dialog (Screen 3). Accessible name: "Set 1, 185 pounds, 8 reps, logged. Correct this set" |
| **Active row** | `div` with `border-l-2 border-primary bg-muted/40 rounded-md p-2`; set-entry fields (bespoke, built on `Input`); `Button` `size="lg"` (h-11) `Log set` with `Check` icon | the only row with fields |
| **Weight field** | `Input` `h-12`, `inputMode="decimal"`, `enterKeyHint="next"`, `autoComplete="off"`, muted `lbs` suffix inside | prefilled per the rules below; focusing a prefilled value selects it, so typing replaces it |
| **Reps field** | `Input` `h-12`, `inputMode="numeric"`, `pattern="[0-9]*"`, `enterKeyHint="done"`, `autoComplete="off"`, muted `reps` suffix | always starts empty |
| **Prefill caption** | `p` `text-xs text-muted-foreground`, linked by `aria-describedby` to the weight field | `last time` (first set, from the working weight) or `same as set N` (from the set just logged). Removed as soon as the lifter changes the weight. Never shown on a bodyweight card |
| **Upcoming row** | `div` `min-h-9`, `Set N` and `—` muted | not interactive |
| **Completion line** | `p` `text-sm text-muted-foreground` | `All 3 sets logged.` once every planned set is logged |
| **Add set / View trend / Swap / Didn't do** | as today | unchanged in behavior and placement; View trend gets a 44px tap area (`inline-flex min-h-11 items-center`) |

### Previous-performance context

**Decision.** One line of text under the scheme: `Last time · Oct 13 · 185 × 8, 8, 7`.

- **Which workout.** The most recent earlier workout, on or before this workout's date, in which the lifter logged at least one set of the **performed** exercise (after a swap, the substitute's history). The current workout is never its own "last time". Any mesocycle counts.
- **Machines and cables (gym-variable).** Only workouts at **this workout's gym** count, and the line says so: `Last time here · Oct 13 · 50 × 12, 12, 11`. With no history at this gym — whether or not other gyms have some — the line reads `First time on this at Downtown Gym.` — no number. A weight from another gym is never shown or offered for a machine or cable (pitch §4.1, §9.2, Journey D). (v1.1: v1.0 named only the other-gym case; the rule is the same sentence either way, and it is true either way.)
- **Free weights and plate-loaded.** Any gym counts, matching the existing global rule.
- **Formatting.** Sets in set-number order, extras included. When every set used one weight: `185 × 8, 8, 7`. When the weight changed: `185 × 8, 190 × 6, 190 × 5`. Bodyweight: `12, 10, 9 reps`. Dates use the plan's short format (`Oct 13`); a workout in another calendar year adds the year (`Dec 29, 2025`).
- **No history.** `First time logging this.` (Journey C). Nothing is invented: no weight, no "suggested" number.
- It is information, not a recommendation. It does not replace the tag or the suggested load, and it never feeds the progression engine.
- Long lines (many sets) truncate with an ellipsis on one line; the full line is the row's `title` and is read in full by screen readers.

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Weight (active row) | decimal lbs | yes, to log a weighted set | **Set 1:** the existing working weight (this gym's baseline for a machine or cable, else that exercise's latest weight logged at this gym; for free weights the latest logged weight anywhere). **Set 2 on:** the weight of the most recently logged set in this card. **Extra set:** the last logged weight (as today). No source → empty. | > 0, ≤ 9999.99 — unchanged |
| Reps (active row) | whole number | yes | **always empty** | > 0, whole, ≤ 1000 — unchanged |

**Decision — what is never prefilled.** Reps, ever. The +5 Progress suggestion and the scheduled-deload 90% load stay display-only, as the Progressive Overload Engine decided; they never become the weight in the box. During a scheduled-deload week the box still offers the working weight, and the deload line above says what to use.

### Validation

- Unchanged rules, unchanged messages: `Enter a weight above 0.` / `Enter reps above 0.` shown under the active row, with focus moved to the field at fault. Nothing is written.
- A prefilled weight is validated exactly like a typed one. Clearing it is allowed; logging with it empty shows the weight error.
- `Log set` is never disabled for empty fields (a disabled button explains nothing); it validates on press. It is disabled only while that set is saving.

### Empty state

First time on the exercise (Journey C):

```text
│ Hack Squat                               │
│ 3 × 8–10                                 │
│ First time logging this.                 │
│▌Set 1                                    │
│▌[              lbs ] [          reps ] [✓ Log set] │  ← both empty, no caption
│  Set 2   —                               │
```

### Loading state
Unchanged: the runner's `loading.tsx` skeleton keeps the card's shape. A save in flight is the row's **Saving** state; nothing else on the card changes or jumps.

### Error state

- **Save failed:** the row returns to active with the lifter's numbers, and `Couldn't save. Your numbers are still here.` under it. `Log set` retries (the write is idempotent for identical values, so a retry after a lost response never duplicates). Focus returns to the reps field.
- **Conflict** (the set was logged elsewhere, e.g. another tab): the existing message (`That set is already logged. Edit it from history to change it.`) shows under the row and the card refreshes to the server's record, which then shows that set as logged.
- No error ever marks a set logged, and no error ever clears typed numbers.

### Behavior

- **Log set** (tap, or Enter in the reps field) validates, then writes the set through the existing logging action. Only after the write confirms does the row become **Logged**, and only then does the next set become active.
- **Reuse:** the new active row offers the weight just logged (`same as set N`). The lifter types the reps and logs again. Changing the weight first is one tap on the box (the value is selected) and the new number.
- **Never automatic.** No set is logged, completed, or advanced without the lifter's `Log set`. No row is filled in ahead of the active one. Leaving the card, changing exercise, or refreshing writes nothing.
- **Order.** The active row is the first planned set not yet logged, in set order. (A workout resumed with a gap — e.g. sets 1 and 3 logged from before — makes set 2 active.) Upcoming rows are not tappable: sets are entered in the order they are performed. **Decision** — the server still accepts any order, so nothing about history changes; the card simply asks for the next one.
- **Gym change** before the first set refreshes the card for the new gym: the Last time line and the set 1 prefill are recomputed for that gym. A prefilled weight the lifter has not edited always reflects the current records; one they typed stays theirs.

## Screen 2: Exercise card — bodyweight (reps only)

### Purpose
Log a pure bodyweight set by its reps alone, exactly as today, with the same speed-ups.

### Layout

```text
│ Push-Ups                                 │
│ 2 × 12–20 · bodyweight, reps only        │
│ Last time · Oct 13 · 18, 15 reps         │
│  Set 1   18 reps                      ✓  │
│▌Set 2                                    │
│▌[ 1|                       reps ] [✓ Log set] │  ← reps box takes the width; no weight, no caption
```

### Behavior
- No weight field, no prefill, no caption, no "same as" (Journey E; pitch §9.5). The logged row reads `18 reps`, never `0 lbs`.
- Focus, Log set, Saving, Logged, and errors behave as on Screen 1.

## Screen 3: Edit set dialog, opened from a logged row

### Purpose
Fix a mistyped logged set without leaving the workout.

### Trigger
Tapping (or Enter on) a logged row on the card.

### Layout

The existing History dialog, unchanged:

```text
┌──────────────────────────────────────┐
│ Edit set 1 — Barbell Bench Press     │
│ Weight (lbs)  [ 185            ]     │
│ Reps          [ 8              ]     │
│ [ Cancel ]          [ Save ]         │
└──────────────────────────────────────┘
```

### Behavior
- **Decision.** Correction stays the deliberate, confirmed dialog it is in History (pitch §4.9, §9.8): the card reuses it rather than editing a logged row inline, so a logged set never turns back into a box on the card and a slip of the thumb can't change history. It saves through the same correction path, with the same rules (weight and reps only, no delete, no baseline replay) and toasts `Set updated`.
- The dialog shows the **stored** values. On save, the card's row shows the corrected record. If the corrected set is the latest logged one and the active row's weight is still the unedited `same as` offer, the offer follows the correction.
- Escape or Cancel closes it and returns focus to the row. Bodyweight sets show reps only, as in History.
- History's own edit entry point is unchanged.

## Screen 4: Runner — moving between exercises

### Purpose
Make the step to the next exercise obvious once the current one is done, without doing it for the lifter.

### Layout
The existing bar, with the Next label naming the destination:

```text
│ [Previous]   [ Next: Incline Dumbbell P… ] │   ← h-11 both; label truncates
│ last exercise:  [Previous] [ Finish workout ] │
```

### Behavior
- **Decision.** No auto-advance to the next exercise (pitch §9.4): the last planned set logging shows `All 3 sets logged.` and moves focus to Next, so the lifter sees the full card before leaving it and can add an extra set or correct one. One tap (or Enter) moves on.
- Previous / Next and Finish are `h-11`. The Next label is `Next: {exercise}` truncated with an ellipsis; its accessible name is the full `Next: Incline Dumbbell Press`.
- On the new card, focus goes to its active row (see Focus rules). On a card with nothing left to log, focus goes to the card heading.
- Finish keeps its confirmation when exercises are unfinished — that dialog protects what counts toward progression and is kept (pitch §9.8). When everything is logged there is no dialog, as today.

---

## 7. Focus and keyboard rules

These are the heart of the tap savings, so they are exact.

| Moment | Focus goes to | Why |
| ------ | ------------- | --- |
| Workout page first loads | **nowhere** (no autofocus) | the lifter didn't ask; a keyboard popping over the card on arrival hides the context they came to read |
| Lifter taps a field | that field; a prefilled weight is selected | typing replaces it |
| Enter / Next in the weight field | the reps field | natural order |
| Enter / Done in the reps field | logs the set (same as `Log set`) | explicit confirmation by the lifter |
| `Log set` pressed | stays in the field the lifter was in while saving (the button does not take focus, so the phone keyboard stays up) | no keyboard flicker between sets |
| Set confirmed, more planned sets remain | the next set's **reps** field (or its weight field if it has no weight to offer) | the weight is carried; only the reps are needed |
| Set confirmed, it was the last planned set | the runner's **Next** button (or **Finish workout**); the keyboard closes | the card is done; the next action is visible |
| Validation or save error | the field at fault (reps for a save failure) | fix and retry in place |
| Next / Previous pressed | the new card's active field by the same rule; its heading if nothing is left to log | continue where the lifter is |
| Edit dialog closes | the logged row that opened it | standard dialog return |

Keyboard (desktop and hardware keyboards): Tab order inside the active row is weight → reps → `Log set`; logged rows are in the tab order before it (they are buttons); upcoming rows are not. Enter behaves as in the table. Nothing is bound to other keys.

Phone keyboards: weight opens the decimal pad, reps the number pad. On iOS the number pads have no return key, so `Log set` beside the fields is the confirm; on Android the keyboard's action key does the same as Enter. **Decision:** `Log set` stays visible beside the fields rather than in a sticky bottom bar, because a sticky bar would sit behind or above the phone keyboard unpredictably and push the card up.

---

## 8. Representative workflows and tap counts

The spec turns this into a repeatable, scripted measurement (same seeded workout, same phone viewport, before and after). The design's expectation, counting screen taps (not digits typed on the keyboard) from the open workout to the dashboard:

**Representative workout — Push Day 1 at Downtown Gym** (Tue Oct 20, 2026; last done Tue Oct 13):

| # | Exercise | Plan | History | Performed today |
| - | -------- | ---- | ------- | --------------- |
| 1 | Barbell Bench Press (barbell) | 3 × 6–8 | 185 × 8, 8, 7 | 185 × 8, 185 × 8, 185 × 7 (same weight) |
| 2 | Incline Dumbbell Press (dumbbell) | 3 × 8–10 | 60 × 10, 10, 9 | 65 × 9, 65 × 8, 65 × 8 (weight up on set 1, then reused) |
| 3 | Triceps Pushdown (cable — gym-variable) | 3 × 10–12 | Downtown Gym baseline 50; 50 × 12, 12, 11 here | 50 × 12, 50 × 12, 50 × 11 |
| 4 | Push-Ups (bodyweight) | 2 × 12–20 | 18, 15 | 18, 16 |

| Step | Before (today's card) | After (this design) |
| ---- | --------------------- | ------------------- |
| An unchanged-weight set | tap reps, tap Save = **2** | tap Log set = **1** (cursor already in reps); the very first set of the workout also needs one tap on reps, since nothing is focused on page load |
| A set with a new weight | tap weight, clear, retype, tap reps, tap Save = **3** | tap weight (selected), type, tap reps, Log set = **3** |
| A set after a weight change | tap weight, clear, retype, tap reps, tap Save = **3** (the box still says the old weight) | **1** (the new weight carries) |
| To the next exercise | tap Next = **1** | tap Next = **1** (focus already there; the new card's reps field is ready) |
| Finish | **1** | **1** |
| **Workout total** | **29 taps** | **18 taps** (−11) |

The keyboard work also drops (no clearing the old weight on sets 2 and 3 of a weight change), and the lifter's eyes stay on one row.

Journey checks against the pitch:

- **A — repeat weight:** set 1 offers 185 (`last time`); sets 2 and 3 offer 185 (`same as set …`); each is reps + Log set. ✓
- **B — change weight:** the offer is selected on tap; typing replaces it; the next set carries the new weight. ✓
- **C — first time:** `First time logging this.`, empty boxes, nothing invented. ✓
- **D — machine at another gym:** at Campus Rec Center with Pushdown history only at Downtown Gym → `First time on this at Campus Rec Center.`, empty weight box. ✓
- **E — bodyweight:** reps box only. ✓
- **F — whole workout on a phone:** the table above. ✓
- **G — editing a logged set:** tap the logged row → the History correction dialog with the stored values → Save → the row shows the corrected record. ✓

---

## 9. Interaction specifications

### Loading
Unchanged route skeleton. Per-set saving is the row's Saving state; the rest of the card is still.

### Errors
Inline under the active row (`text-xs text-destructive`, `role="alert"`). Never a toast for a set save. Typed numbers are never cleared.

### Notifications

| Action | Message | Severity | Duration |
| ------ | ------- | -------- | -------- |
| Set logged | none — the row turning into a logged row is the feedback | — | — |
| Logged set corrected from the card | `Set updated` | success | 4s (existing) |
| Save failed | inline only: `Couldn't save. Your numbers are still here.` | error | until fixed |

### Destructive actions
None are added. The Finish-with-unfinished confirmation and the correction dialog both stay (pitch §9.8). Nothing on the card deletes a set (no delete exists).

### Motion
None beyond the stock focus ring and button states. A row changing state does not animate, so nothing moves under the thumb.

---

## 10. Responsive behavior

| Breakpoint | Behavior |
| ---------- | -------- |
| base (< 640px) | The primary layout above. Active row on one line (weight `flex-1`, reps `w-24`, `Log set`); below 360px the button shows `Log` + icon. Every target ≥ 44px. No horizontal scroll at 320px. |
| `sm`–`md` | Same card in the centered column (`max-w-screen-sm`), roomier. |
| `md`+ | Left rail (unchanged). The card is identical; wider fields. Enter/Tab flow is the primary path on a keyboard. |

All actions are available at every width. Nothing is hidden at phone width.

---

## 11. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `ExerciseCard` | `src/components/logging/exercise-card.tsx` | refined | set-state rendering, prefill and reuse, focus rules, Last time line |
| Set-entry field | inside the card | new (bespoke, on `Input`) | number + muted unit suffix, `h-12`, select-on-focus for an offered weight |
| Logged set row | inside the card | new (a full-row `button`) | opens the edit dialog |
| `EditSetDialog` | `src/components/logging/edit-set-dialog.tsx` | reused | gains the ability to be opened by a caller-supplied trigger; content and rules unchanged |
| `WorkoutRunner` | `src/components/logging/workout-runner.tsx` | refined | Next label, 44px bar, focus hand-off between cards |
| `ProgressTag`, `SuggestedLoad`, `GymPicker`, swap | — | unchanged | |

**Always-visible control count** (pitch AC-2), a 3-set weighted card with set 1 logged:

| | Before | After |
| - | ------ | ----- |
| Weight inputs | 3 (one disabled) | 1 |
| Reps inputs | 3 (one disabled) | 1 |
| Save / Log buttons | 2 | 1 |
| Logged-set controls | 0 | 1 (the row itself, replacing the disabled inputs) |
| View trend, Swap, Previous, Next | 4 | 4 |
| **Total** | **12** | **8** |

No control is added that wasn't there in some form; the card has fewer controls in every state.

---

## 12. Accessibility, privacy, and data sensitivity

- Inputs keep labels (`Set 2 weight in pounds`, `Set 2 reps`); the prefill caption is the weight field's description, so a screen reader hears "185, Set 2 weight in pounds, same as set 1".
- A logged row's accessible name states the values and that it is logged; the check icon is decorative (`aria-hidden`).
- Upcoming rows read as `Set 3, not logged yet`.
- Errors are `role="alert"`. Focus moves are only the ones in §7, all caused by the lifter's own action.
- Every target ≥ 44px; contrast for logged numbers is `foreground` on `card`.
- Privacy: the Last time line shows the account's own records only, and for machines and cables only at the current gym. It never shows a gym's address. No share, export, or comparison with anyone else.

---

## 13. User guidance

Proposed for the final guidance ticket, decided there by `overload-onboarding` against the shipped mechanisms (Onboarding Tour spec: `src/lib/tour/steps.ts`; What's New spec: `src/lib/release-notes/entries.ts`, both on `main`).

- **Tour step:** **none, and no copy change (proposed).** The tour's "Logging a workout" step (`id: "logging"`, anchored to Today's Start button or the day block) says that each exercise gets a card where you enter the weight and reps you lifted. That stays exactly true: the card is the same card, still asking for weight and reps. Nothing in this pitch adds a screen or a control the lifter must discover to benefit — prefill, reuse, and focus work without being found, and correcting a logged set is also reachable from History, which the History step already covers. The skill's rubric puts "a performance improvement" in the no-step column.
- **Release-note entry (proposed):** one **significant** entry, because every lifter will notice how logging behaves:
  - title: `Faster workout logging`
  - body: `Logging a set now takes fewer taps. Each card shows what you did last time, your weight carries over from set to set, and the next set is ready for its reps as soon as you log one. Tap a logged set to fix a typo.`
  - dated the day it reaches production (not the day it was written); see the runbook for how the date is set at merge.
- **What the guidance ticket must not do:** add a tour step for the logged-row correction, edit the tour or What's New components, or change the entry format.

---

## 14. Out of scope

From the pitch (§7, §10): a rest timer; new always-visible card controls; RIR; any change to progress, hold, reactive deload, stall, e1RM, or scheduled-deload rules; new recommendations (the Last time line is not one); auto-logging, auto-completing, or auto-advancing; writing to the planned session; a card redesign; exercise history or PR pages; missed-day changes; auth or account changes; external services.

Also not designed here: changing the start-workout gym picker, the swap picker, or History's own layout; a sticky bottom logging bar; inline (non-dialog) editing of logged sets; prefilled reps.

Permanent non-goals stand (program generation, social features, cardio progression, nutrition in this build).

---

## 15. Open questions

None. Every design-stage question in pitch §14 is decided above (**Decision**) and carried into the spec's Resolved Decisions:

1. Previous-performance placement and wording → one `Last time …` line under the scheme (§6, Screen 1).
2. Suggested vs confirmed → "a box is a draft; a plain number is history", plus the source caption (§3, §4).
3. Set-state styling → the set-state table (§4).
4. Focus and keyboard progression → §7.
5. Touch targets → 44px everywhere, 48px set fields (§4, §10).
6. Transitions → no auto-advance; focus to Next; Next names the exercise (Screen 4).
7. Modals → correction dialog reachable from the card; Finish confirmation kept; nothing removed (Screen 3, Screen 4).
8. Responsive → §10.
