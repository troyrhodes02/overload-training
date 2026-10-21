# RIR Logging & Autoregulation — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 14: RIR Logging & Autoregulation (`pitches/14-rir-logging-autoregulation.md`)
**Focus:** An optional reps-in-reserve choice on the set being logged, shown back on logged history and correctable like weight and reps, and the two places where it is allowed to change what Overload calls a lift.

> Written in an unattended pipeline run (CLAUDE.md, Autonomous Pipeline Policy). The skill's clarification step does not apply: every design-stage question the pitch leaves open (pitch §14) is decided here, marked **Decision**, and carried into the spec's Resolved Decisions. Authority: the pitch, the approved multi-user planning set (Pitch Roadmap → RIR Logging & Autoregulation), `CLAUDE.md`, the Progressive Overload Engine, Guided Workout Logging, and Faster Logging UX specs, `method-note.md` ("Set entry and tap-count method"), and the code as it ships on `main` (`003d72c`). The spec owns the exact data contract; this document states the rules in the lifter's terms so the preview and the spec have one source.

---

## 1. What exists today (the baseline this extends)

| Surface | Today | What this pitch changes |
| ------- | ----- | ----------------------- |
| Exercise card (`/log/[id]`) | Faster Logging UX: one **active** row with `[weight] [reps] [Log set]`; logged sets are plain text rows (`185 lbs × 8 ✓`) that open the correction dialog; upcoming sets are `Set 3 —`. 18 taps for the representative workout. | The active row gains one optional RIR choice under the fields. Logged rows show the RIR the lifter recorded, and nothing when none was. |
| Bodyweight card | Reps only, no weight field. | Reps plus the same optional RIR choice. Still no weight field. |
| Edit set dialog (card and History) | Weight and reps (reps only for bodyweight). | Adds RIR, which can be changed or cleared. |
| History → a day | `Set 1  185 lbs × 8  edit`. | Shows the recorded RIR beside the set. |
| Progression call (card, dashboard, day-complete summary, exercise page) | Progress / Deload / `Hold — trend flat` tags; ordinary Hold shows nothing; scheduled-deload weeks suppress every reactive call. | Two narrowly defined cases where reported RIR changes the call, each with a one-line reason. Everything else is unchanged. |

---

## 2. Vision

After a set, the lifter knows two things Overload has always asked for (the weight and the reps) and one it never has: how much was left. They can say it in one tap if they want to, and the card is exactly as fast as before if they don't. When what they said makes a difference to the call, Overload says so in one line.

**Design north star:** *one optional tap, never a guess.*

---

## 3. Design principles

### 1. Unsaid is not zero
A set with no RIR has no effort information, and the interface never fills the gap: no pre-selected chip, no RIR carried from the previous set, no `—` placeholder that reads like a missing answer, no inferred value on old workouts. `0 RIR` is an answer ("nothing left"); a blank is not an answer.

### 2. Optional means invisible when ignored
A lifter who never touches RIR logs every set with the same taps, keystrokes, and focus moves as Faster Logging UX. The choice sits below the fields, takes no focus, and is never required, highlighted, or nagged about.

### 3. Reps are what happened; RIR is what was left
The two never mix. RIR is never added to reps, never turned into "reps to failure", and never feeds the e1RM estimate. It is shown as its own small figure after the set, not folded into the numbers.

### 4. Effort can only qualify the rule, never replace it
The weights-and-reps rule stays the primary evidence and the same thresholds apply. RIR is consulted only after that rule has produced a Progress candidate, and it can change the call in exactly two documented ways. It never creates a Progress the reps didn't earn, never creates or cancels a Deload, and never speaks during a scheduled deload week.

### 5. When effort changes the call, say so once
Every RIR-influenced call carries one muted sentence naming the reason. An ordinary Hold stays silent.

---

## 4. How RIR relates to the progression call

This is the design's statement of the rules. The spec makes them exact and testable (constants, ordering, tests); the preview shows how each reads.

### 4.1 What is recorded

- **Values (Decision):** `0`, `1`, `2`, `3`, `4+`. `4+` means four or more. This follows the common RIR-based effort scale, where estimates past about four reps are too rough to distinguish, and it fits on one row at 320px. RIR is recorded per set, never per exercise or workout, and successive sets can differ.
- **Unset is the default** on every set, including the next set after one with RIR (**Decision:** RIR is never carried, like reps; pitch §4.2, §9.2).
- Only confirmed sets carry RIR. A chosen chip is part of the draft until **Log set** (or Enter in reps) writes it with the weight and reps in the same write. Nothing else writes it.

### 4.2 Which sets count

The progression rule already evaluates only **qualifying performances**: completed, all planned working sets present, not in a scheduled-deload week, and for machines and cables only at the gym being evaluated. RIR is read from the **planned working sets of the most recent qualifying performance** in that same scope, and nowhere else.

- Extra sets beyond the plan, unfinished performances, scheduled-deload weeks, and other gyms' machine sets never contribute RIR, because they never contribute reps either.
- Older performances' RIR is kept and shown but does not change today's call. **Decision:** effort is a reading of the most recent attempt, and the existing two-session rep window already supplies the repetition evidence, so one older difficult session cannot hold back a lift that has since been done with room to spare (pitch §9.5).

### 4.3 The two ways RIR can change the call

Both apply only when the existing rule, with its existing thresholds, says the lift reached the top of its planned range on every working set for the required consecutive sessions (a **Progress candidate**). Nothing else is touched.

| # | Situation (Progress candidate, plus…) | Without RIR (today) | With RIR | Reason line |
| - | ------------------------------------- | ------------------- | -------- | ----------- |
| **A** | …the call would otherwise be **Progress**, and the most recent qualifying performance has **at least one** working set reported at **0 RIR** | Progress | **Hold**, no tag | `Top of the range, but at your limit last time (0 RIR) — holding.` |
| **B** | …the e1RM gate would flag the trend as flat, **and every** working set of the most recent qualifying performance was reported at **2 RIR or more** | `Hold — trend flat` | **Progress** (with its usual suggested load) | `e1RM is flat, but every set last time had 2+ in reserve — ready to go up.` |

- **A (at the limit):** the top of the range was reached, but only by going to failure. The safe reading is to own that load first. It needs a single explicit `0` because a reported failure on a top-of-range set is the clearest effort statement the lifter can make, and holding is the conservative direction. It self-corrects: the next time the top of the range is reached with anything left, the existing two-session window still holds and the call is Progress again.
- **B (reps to spare):** the e1RM gate exists so Overload doesn't bump weight "blindly" on a flat trend. When the lifter has reported room on **every** working set, a flat trend reflects the load they chose to repeat, not a strength plateau, so the call is not blind. Because this is the less conservative direction, it needs complete coverage: one unrecorded set means the evidence is incomplete, and the stall stands.
- **A and B never meet** by construction (a `0` can't coexist with "every set 2+"). When the e1RM gate flags a flat trend and B doesn't apply, the existing `Hold — trend flat` stands; A does not re-word it.
- Order, for the spec: the existing rule runs first, unchanged (insufficient → Deload → Progress candidate → e1RM gate). Then B may turn `Hold — trend flat` into Progress, and A may turn a Progress into a Hold. A Progress produced by B can never meet A, because B requires every set at 2+.
- **Bodyweight:** there is no e1RM gate, so B never applies; A applies the same way.

### 4.4 What RIR never does

| Call | Effect of RIR | Why |
| ---- | ------------- | --- |
| Ordinary Hold (top of range not reached) | **none**: no tag, no note, even with `4+` everywhere | The reps didn't reach the top of the range; RIR can't stand in for reps that weren't done (principle 4). How to use leftover reps is Pitch 15's recommendation copy. |
| Reactive Deload (repeated below-minimum sessions) | **none**, in either direction | A deload is the defensive call and keeps its precedence. A low RIR can't trigger one (pitch §4.8, §9.5), and a high RIR can't cancel one: a reported "I had more" never outweighs repeated missed reps. |
| Insufficient history | **none** | The rule needs its minimum history first. |
| `Hold — trend flat` without full 2+ coverage | **none** | B only. |
| Scheduled deload week | **none**: the week's sets are not qualifying, and every reactive call stays suppressed | Pitch §4.10. The chips still work so the record is complete. |
| Gym baselines, working weight, prefill, e1RM, goals | **none** | RIR is not a load or a rep. Machines and cables keep their gym scope; RIR at one gym says nothing about another. |

### 4.5 Mixed history

- Sets logged before this pitch, and sets logged without RIR afterwards, are **valid, complete, and evaluated exactly as today.** They are never treated as incomplete, never shown with a placeholder, and never assigned a value.
- A history with no RIR at all produces the same call as today, byte for byte. (This is the regression test the spec writes first.)
- Partial coverage within the latest performance: A needs one reported `0`; B needs all working sets reported at 2+. An unrecorded set is never assumed to look like the recorded ones (pitch §9.6).

### 4.6 Corrections

Correcting or clearing RIR on a past set goes through the same correction dialog and the same set write as weight and reps. The call is computed on read, so the next screen that shows it reflects the correction. There is no stored call to refresh. Clearing a value returns the set to "no effort information", not to `0`.

---

## 5. Visual language

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

### Color palette

| Token / theme path | Usage | Notes |
| ------------------ | ----- | ----- |
| `card`, `border`, `foreground`, `muted-foreground` | as in Faster Logging UX | unchanged |
| `border` + `muted-foreground` | an unselected RIR chip (outline, muted figure) | quiet: the row must not compete with the weight and reps |
| `foreground` on `secondary` (or `accent`) | the selected RIR chip | a neutral fill, **not** `primary`: the accent stays reserved for "where you are" and "done" |
| `muted-foreground` | the logged RIR suffix (`· 2 RIR`), the reason lines | small and muted |
| `progress`, `deload` | the existing tags only | no new color; RIR never colors a tag |

### Set states (additions to the Faster Logging UX table)

| State | Visual treatment |
| ----- | ---------------- |
| **Active, no RIR** | the Faster Logging active row, plus one line below the fields: `RIR` label (muted, `text-xs`) and five outline chips `0 1 2 3 4+`, none selected |
| **Active, RIR chosen** | the chosen chip filled (`bg-secondary text-foreground`, `aria-pressed`); tapping it again clears it |
| **Saving** | inputs read-only and dimmed as today; chips dimmed and inert; nothing shown as logged |
| **Error** | as today; the chosen RIR is kept with the numbers |
| **Logged, with RIR** | `185 lbs × 8` then muted `· 2 RIR` (`· 4+ RIR` for the top value, `· 0 RIR` for zero) |
| **Logged, without RIR** | exactly as today: `185 lbs × 8` with nothing after it |
| **Upcoming** | unchanged (`Set 3 —`), no chips |

### Typography and spacing

- Chips: `h-11 min-w-11` (44px targets), `text-sm font-medium tabular-nums`, `rounded-md`, `gap-1.5`. On one line at 320px with the `RIR` label (5 × 44 + 4 × 6 + label ≈ 270px).
- The chip line adds one row (about 48px) to the **active** row only. Logged and upcoming rows keep their height (method note: a new card control belongs on the active row only).
- Logged suffix: `text-sm text-muted-foreground`, same baseline as `lbs`.
- Reason line: `text-xs text-muted-foreground`, in the slot the card already uses for `Deload week — …` and the stall note.

### Appearance

Light and dark via tokens only. The selected chip's neutral fill is the elevated `secondary` step in dark mode, never tinted.

---

## 6. Information architecture

Nothing moves. No route, page, navigation item, or settings entry is added.

```text
┌──────────────────────────────────────────────────────────────┐
│  Today ── [Start] → Workout (/log/[loggedSessionId])         │
│     Exercise card                                            │
│       ├ Set rows: logged (· n RIR) · active · upcoming       │
│       │    └ active row: [weight] [reps] [Log set]           │
│       │                   RIR  (0)(1)(2)(3)(4+)   ← new      │
│       │    └ tap a logged set ─► Edit set dialog (+ RIR)     │
│       └ reason line (A or B) when RIR changed the call ← new │
│  Today (day complete) ── summary row + reason line   ← new   │
│  History ── day ── set rows (· n RIR) ── edit (+ RIR) ← new  │
│  Exercises ── [id] ── Progression block + reason line ← new  │
└──────────────────────────────────────────────────────────────┘
  md+: left rail + centered column (unchanged) · phone: header menu (unchanged)
```

---

## 7. Screen specifications

## Screen 1: Exercise card — weighted set with optional RIR

### Purpose
Log the set just done, with RIR if the lifter wants to say how much was left.

### URL pattern
`/log/[loggedSessionId]` (unchanged)

### Trigger
Opening a workout, or Next/Previous to this exercise.

### Layout — first set, nothing chosen (Journey B)

```text
┌────────────────────────────────────┐
│ Barbell Bench Press - Medium Grip  │
│ 3 × 6–8                            │
│ Last time · Oct 13 · 185 × 8, 8, 7 │
│                                    │
│ ┃ Set 1                            │
│ ┃ [ 185      lbs ] [     reps ] [✓ Log set] │
│ ┃ last time                        │
│ ┃ RIR  (0) (1) (2) (3) (4+)        │
│   Set 2  —                         │
│   Set 3  —                         │
│                                    │
│ View trend ›                       │
└────────────────────────────────────┘
```

### Layout — mid-exercise, set 1 logged with RIR, set 2 RIR chosen (Journey A)

```text
│   Set 1  185 lbs × 8  · 2 RIR    ✓ │
│ ┃ Set 2                            │
│ ┃ [ 185      lbs ] [  8  reps ] [✓ Log set] │
│ ┃ same as set 1                    │
│ ┃ RIR  (0) (1) [2] (3) (4+)        │   ← [2] selected
│   Set 3  —                         │
```

### Layout — a set logged without RIR next to one with (mixed)

```text
│   Set 1  185 lbs × 8  · 1 RIR    ✓ │
│   Set 2  185 lbs × 8             ✓ │   ← nothing recorded, nothing shown
│ ┃ Set 3  …                         │
```

### Elements

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **RIR label** | `<span class="text-xs text-muted-foreground">RIR</span>`; the group's accessible name is `Set N reps in reserve (optional)` | static |
| **RIR chips** | a single-select toggle group (`ToggleGroup type="single"` on the existing Radix package, or equivalent buttons) with five items `0 1 2 3 4+`, each `h-11 min-w-11` outline | tap selects; tap the selected chip again to clear; no chip selected by default; pointer-down does not move focus (the phone keyboard stays up, as with Log set) |
| **Log set** | unchanged | writes weight, reps, and the chosen RIR (or none) in one write |
| **Logged row suffix** | `<span class="text-sm text-muted-foreground">· 2 RIR</span>` | part of the row button; the row's accessible name includes `2 reps in reserve` when recorded |

### Fields

| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |
| Weight | number (lbs) | yes (weighted) | the Faster Logging offer | unchanged |
| Reps | integer | yes | empty, never offered | unchanged |
| RIR | one of 0, 1, 2, 3, 4+ | **no** | **none** | only the five values can be chosen, so there is no free-text error; an absent RIR is never an error, a warning, or an unmet state |

### Validation

Unchanged for weight and reps. RIR adds no message, no blocked submit, and no "incomplete" marker. If the server ever rejects an RIR value (not reachable from the chips), the error reads `Choose an RIR from 0 to 4+.` under the row, numbers kept.

### Empty state
A first-time exercise: as today (`First time logging this.`), with the chip line under the fields. Nothing about RIR history is shown.

### Loading state
Unchanged. While saving, the chips are dimmed and ignore taps.

### Error state
As today: the numbers **and** the chosen RIR stay; the message sits under the row.

### Behavior
- After a confirmed set, the next active row starts with **no RIR selected**, the weight carried as today, and focus in reps (unchanged rules).
- RIR can be chosen before or after typing reps. Enter in reps logs the set with whatever is selected.
- Changing exercises with Next/Previous discards an unlogged draft's RIR along with its numbers, as today; nothing is written.

## Screen 2: Exercise card — bodyweight

### Purpose
Reps plus optional RIR for a pure bodyweight movement.

### Layout

```text
│ Pushups                            │
│ 2 × 12–20 · bodyweight, reps only  │
│ Last time · Oct 13 · 18, 15 reps   │
│ ┃ Set 1                            │
│ ┃ [            reps ] [✓ Log set]  │
│ ┃ RIR  (0) (1) (2) (3) (4+)        │
│   Set 2  —                         │
```

Logged: `15 reps · 1 RIR`. No weight field appears, with or without RIR (pitch §4.4).

## Screen 3: Edit set dialog (from a logged row or History)

### Purpose
Correct a past set's weight, reps, or RIR, including clearing RIR.

### Layout

```text
┌──────────────────────────────────────┐
│ Edit set 2 — Barbell Bench Press     │
│ Weight (lbs)  [ 185            ]     │
│ Reps          [ 8              ]     │
│ RIR (optional)                       │
│   (0) (1) [2] (3) (4+)               │
│   Tap the selected value to clear.   │
│ [ Cancel ]            [ Save ]       │
└──────────────────────────────────────┘
```

With nothing recorded, the helper reads `Not recorded.` instead.

### Behavior
- Opens with the **stored** values, including the stored RIR or none (as today, every open starts from the record).
- Save sends weight, reps, and RIR together; a value the lifter didn't touch is sent back unchanged, so no unrelated field is overwritten (pitch Journey E).
- Clearing RIR stores "not recorded", never `0`.
- Success toast `Set updated` (existing). The call shown anywhere afterwards is recomputed from the corrected record.
- Bodyweight: no weight field, as today; RIR present.

## Screen 4: History — a logged day

```text
│ Barbell Bench Press (as planned)                │
│ Set 1  185 lbs × 8  · 2 RIR             edit    │
│ Set 2  185 lbs × 8                      edit    │
│ Set 3  185 lbs × 8  · 0 RIR             edit    │
```

Days logged before this pitch read exactly as they do now.

## Screen 5: The reason line where RIR changed the call

| Surface | Case A (held at the limit) | Case B (stall released) |
| ------- | -------------------------- | ----------------------- |
| Exercise card (note slot under the context line) | `Top of the range, but at your limit last time (0 RIR) — holding.` — no tag | `Progress` tag as usual, plus `e1RM is flat, but every set last time had 2+ in reserve — ready to go up.`, plus the usual suggested load |
| Day-complete summary row | exercise name, no tag, muted `at your limit — holding` under the name | `Progress` tag + suggested load, muted `reps to spare` under the name |
| Exercise page → Progression | `Holding` (as today) + the case A sentence below | `Progress` + suggested next (as today) + the case B sentence below |
| Dashboard planned list | nothing extra (as an ordinary hold) | `Progress` tag (as today) |

- During a scheduled deload week none of these appear: the card shows only `Deload week — recovery, not a verdict.` (unchanged).
- **Decision:** the dashboard planned list stays one thing per row (tag or scheme) and carries no reason line; the card, summary, and exercise page do. This keeps the explanation sufficient to verify the call without starting Pitch 15's evidence lines (pitch §4.14, §9.11).
- The words name the rule exactly: "last time" is the most recent qualifying performance; `0 RIR` and `2+` are the constants the spec fixes.

---

## 8. Focus and keyboard rules

Faster Logging UX's table stands unchanged (method note). Additions:

| Moment | Rule |
| ------ | ---- |
| Lifter taps an RIR chip | the chip toggles; **focus does not move** (pointer-down is not allowed to take focus), so the keyboard stays up in reps or weight |
| Tab order in the active row | weight → reps → RIR group (one tab stop; Left/Right move within it, Space/Enter toggles) → Log set |
| Enter in reps | logs the set with the selected RIR (or none) |
| After a confirmed set | next set's reps; no chip selected |

---

## 9. Representative workflows and tap counts

The spec turns this into the repeatable measurement, reusing Faster Logging UX's method and seeded workout unchanged (method note).

| Run | Taps | Keystrokes | Notes |
| --- | ---- | ---------- | ----- |
| Faster Logging UX (`main` @ `003d72c`) | 18 | 18 | the baseline |
| This design, **RIR left unset** (AC-1) | **18** | **18** | the chip line is skipped entirely; no focus or step changes |
| This design, RIR on the last set of each exercise | 22 | 18 | +1 tap per exercise |
| This design, RIR on every set | 29 | 18 | +1 tap per set, 11 sets; still no extra keystroke, dialog, or screen |

**AC-1 decision:** "not meaningfully slower" is measured as **zero added taps and zero added keystrokes** with RIR unset on the same workout, plus the same focus sequence. Recording RIR costs exactly one tap per set where it is recorded.

Journey checks against the pitch:

- **A — with RIR:** reps, tap `2`, Log set → `185 lbs × 8 · 2 RIR`. ✓
- **B — without RIR:** reps, Log set → `185 lbs × 8`. ✓
- **C — same reps, different effort:** two top-of-range sessions; the latest reported `0` on set 3 → Hold with the case A line; reported `2, 2, 3` → Progress. With a flat e1RM: unreported → `Hold — trend flat`; all 2+ → Progress with the case B line. ✓
- **D — old history:** months without RIR read and evaluate as before. ✓
- **E — correct a past RIR:** History → edit → change or clear → Save → `Set updated`; the exercise page's call follows. ✓
- **F — bodyweight:** reps + optional RIR, no weight field. ✓
- **G — scheduled deload week:** chips work; only the deload-week line shows. ✓
- **H — different gym:** a machine's RIR at Campus doesn't change the Downtown call. ✓

---

## 10. Interaction specifications

### Loading
Unchanged.

### Errors
Inline under the active row; numbers and the chosen RIR kept. Never a toast for a set save.

### Notifications

| Action | Message | Severity | Duration |
| ------ | ------- | -------- | -------- |
| Set logged (with or without RIR) | none — the logged row is the feedback | — | — |
| Past set corrected (incl. RIR) | `Set updated` | success | 4s (existing) |

### Destructive actions
None added. Clearing RIR is a correction, not a deletion, and goes through Save.

### Motion
None. A chip's selected state changes without animation.

---

## 11. Responsive behavior

| Breakpoint | Behavior |
| ---------- | -------- |
| base (< 640px) | Active row: fields on one line (unchanged, including icon-only Log set below 360px); the chip line below it, left-aligned under the fields, five 44px chips, no wrap at 320px. |
| `sm`–`md` | Same, in the centered column. |
| `md`+ | Same card; the chip line still sits under the fields (not beside them) so the weight and reps keep their width. |

All actions are available at every width. Nothing scrolls horizontally.

---

## 12. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `RirPicker` | `src/components/logging/` | new | the five-chip optional single-select; used on the card's active row and in the edit dialog; `value: 0–4 \| null`, `onChange`, `disabled` |
| `ExerciseCard` | `exercise-card.tsx` | refined | draft gains RIR; logged rows gain the suffix; reason line |
| `EditSetDialog` | `edit-set-dialog.tsx` | refined | RIR field; opens with the stored RIR |
| History day page | `history/[loggedSessionId]/page.tsx` | refined | RIR suffix |
| Day-complete summary, exercise page | `(app)/page.tsx`, `exercises/[id]/page.tsx` | refined | reason line |
| `ProgressTag` | — | unchanged | no new tag |

**Always-visible control count** (Faster Logging UX's 3-set card with set 1 logged): 8 before → **9** (one RIR group, a single tab stop, on the active row only). This pitch's acceptance criterion is speed, not control count (pitch §8); the group is the "compact selector near reps" the roadmap asks for.

---

## 13. Accessibility, privacy, and data sensitivity

- The chip group is labelled `Set N reps in reserve (optional)`; each chip's name is its value (`4 or more` for `4+`); the selected chip is `aria-pressed`. No chip selected is announced as nothing selected, never as an error.
- The logged row's accessible name adds `, 2 reps in reserve` only when recorded.
- Reason lines are plain text in the reading order beside the call they explain, never color-only.
- 44px targets; chip contrast meets the card's text contrast in both modes.
- Privacy: RIR is part of the account's own training history and is shown only to that account, like weight and reps. No sharing, comparison, or export.

---

## 14. User guidance

Proposed for the final guidance ticket, decided there by `overload-onboarding` against the shipped mechanisms (`src/lib/tour/steps.ts`; `src/lib/release-notes/entries.ts`).

- **Tour step (proposed): no new step; check the logging step's copy.** The tour's `logging` step anchors to Today's Start/day block and says each exercise gets a card where you enter the weight and reps you lifted. That remains true; RIR is optional and sits on the same card. The skill's rubric decides whether a short mention of optional RIR belongs in that step's body; a separate step would point at a control that only exists inside a started workout, which the tour does not open.
- **Release-note entry (proposed):** one **significant** entry (a new training capability):
  - title: `Reps in reserve`
  - body (draft, final wording by the skill against what shipped): `You can now record how many reps you had left on a set, from 0 to 4+. It's optional, and it doesn't slow logging when you skip it. When you reach the top of your range at 0, Overload holds the weight; when every set has 2 or more to spare, a flat trend no longer holds you back.`
  - dated the day it reaches production; the runbook covers setting it at merge.
- **Must not:** edit the tour or What's New components, add a second guidance mechanism, or invent a shipping date.

---

## 15. Out of scope

From the pitch (§7, §10): required RIR; backfilled or inferred RIR; treating missing as zero; AI or learned autoregulation; a second engine; changed thresholds; plan or weight changes from a call; stored tags; scheduled-deload changes; cross-gym machine assumptions; baseline changes; a rest timer; readiness, fatigue, or recovery inputs; Pitch 15's recommendation copy and evidence lines; an RIR analytics view or chart; account or auth changes; external services.

Also not designed here: a planned (target) RIR in the session builder; RIR on cardio; RIR averages, trends, or badges; an RIR-adjusted e1RM; carrying RIR between sets; per-exercise RIR defaults; a Settings switch to hide RIR (**Decision:** not needed, because ignoring it costs nothing).

Permanent non-goals stand.

---

## 16. Open questions

None. Each design-stage question in pitch §14 is decided above and carried into the spec's Resolved Decisions:

1. Values and presentation → `0 1 2 3 4+`, inline chips under the fields, unset by default, tap again to clear (§4.1, Screen 1).
2. Progress qualification → case A (§4.3).
3. Hold behavior → ordinary Hold unchanged; case A produces a Hold with a reason (§4.3, §4.4).
4. Reactive deload → unchanged in both directions (§4.4).
5. Stall → case B (§4.3).
6. Mixed history → latest qualifying performance only; one reported `0` for A, full 2+ coverage for B; missing never counts (§4.2, §4.5).
7. AC-1 measurement → zero added taps/keystrokes with RIR unset on the Faster Logging UX workout (§9).
