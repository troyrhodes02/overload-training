# Smarter & Explainable Progression — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 15: Smarter & Explainable Progression (`pitches/15-smarter-explainable-progression.md`)
**Focus:** Every progression call says what to do next and, in one short line, why: the facts the engine actually judged, on the four surfaces that already show a call.

> Written in an unattended pipeline run (CLAUDE.md, Autonomous Pipeline Policy). The skill's clarification step does not apply: every design-stage question the pitch leaves open (pitch §14, "Decisions delegated to design and spec") is decided here, marked **Decision**, and carried into the spec's Resolved Decisions. Authority: the pitch; the approved multi-user planning set (Pitch Roadmap → Smarter & Explainable Progression); `CLAUDE.md`; the Progressive Overload Engine spec (`docs/specs/05-…`, R4–R40), the RIR Logging & Autoregulation spec (`14-…`, R11–R21, R33), the Faster Logging UX spec (`13-…`) and method note; and the code on `main` at `2ffad7d`. The spec owns the data contract; this document fixes the rules and words in the lifter's terms so the preview and the spec share one source.

---

## 1. What exists today (the baseline this changes)

| Surface | Today | Gap the pitch names |
| ------- | ----- | ------------------- |
| Exercise card (`/log/[id]`) | Tag top right (`Progress`, `Deload`, `Hold — trend flat`). One note line: the deload-week note, or the stall note, or the RIR reason. Then `Try 190 lb (+5)` on Progress. Ordinary Hold: nothing. | Deload says nothing about why. Hold says nothing at all. Progress says the number but not what earned it. |
| Today → planned list (`/`) | Per row: `Try 190 lb (+5)` + tag, or the scheme (`3 × 8–10`) when untagged. Machines say `once gym is set`. Deload week: banner + 90% loads. | A tagged row has no reason. |
| Today → day complete (`/`) | Per performed exercise: tag, `Try …` on Progress, a short RIR phrase, `trend ›`. Hold rows: the name only. | Same as the card, plus "what do I do next time?" is unanswered for Hold and Deload. |
| Exercise page → Progression (`/exercises/[id]`) | Tag or `Holding`, `Suggested next: Try 190 lb (+5)`, the RIR sentence, the e1RM chart. | No reason for any call other than the two RIR cases. |

What the engine actually decides (unchanged by this pitch, read from `src/lib/progression/engine.ts` and specs 05 and 14):

| Final call | How the engine reaches it | A number the engine can support |
| ---------- | ------------------------- | ------------------------------- |
| Not enough history | fewer than `MIN_QUALIFYING_SESSIONS` (2) complete, non-deload-week sessions in scope | none |
| Reactive Deload | a working set below the range minimum in each of the last `DELOAD_CONSECUTIVE_SESSIONS` (2) counted sessions — checked before Progress | **none.** No reactive load reduction exists in the engine or its config. |
| Progress | top of the range on every working set in each of the last `PROGRESS_CONSECUTIVE_SESSIONS` (2) counted sessions, and (from the `STALL_WINDOW_SESSIONS`-th (3rd) counted session) e1RM rose across the window; or the RIR case B release | working weight + `PROGRESS_INCREMENT_LBS` (5), only for a loaded exercise with a known working weight (Pitch 4's source; the gym's baseline for machines and cables) |
| Hold — trend flat | the Progress rule met, but e1RM did not rise across the last 3 counted sessions | the working weight (stay) |
| Hold at the limit (RIR case A) | the Progress rule met, but a working set last time was reported at 0 RIR | the working weight (stay) |
| Hold | anything else | the working weight (stay) |
| Scheduled deload week | the occurrence falls in a planned deload week; reactive evaluation is suppressed entirely | working weight × `SCHEDULED_DELOAD_FACTOR` (90%), floored to `LOAD_STEP_LBS` (5) |

Every figure in this document's copy is one of those constants or a value from the lifter's own logged sets; none is new.

---

## 2. Vision

When a lift shows a call, the lifter can act on it at a glance: try this weight, stay here, or back off, and the one fact that earned it is right underneath. The words come from the same evaluation that produced the call, so they cannot disagree with it, and they never claim more than the logged numbers show.

**Design north star:** *say what to do, then show the receipt.*

---

## 3. Design principles

### 1. The receipt, not the theory
The evidence line names the rule that fired, in the lifter's numbers: `10 reps on every set, 2 sessions running`. It does not explain why progressive overload works, diagnose fatigue, or mention a fact the engine didn't use. If RIR was logged but didn't change the call, it isn't mentioned.

### 2. A number only where the engine has one
Only two calls carry a load: Progress (`Try 190 lb`, the working weight plus the existing +5) and the scheduled deload week (the existing 90%). A reactive Deload says *lower the weight* without a figure, because the engine defines no reactive reduction; bodyweight progress names the plan's own top of range, never a weight. Inventing a number in the interface would be a new progression rule (pitch §9.1).

### 3. Hold is guidance, not a status
An ordinary hold still gets no tag and no colour (Pitch 5 R7, R53). It gets one muted line saying what holding means for this lift (`Stay at 185 lb`) and one muted line with what's left to earn the next step. Nothing about it reads as a warning.

### 4. One explanation everywhere
The card, the day-complete summary, and the exercise page show the same two lines for the same evaluation. Only the time word changes: the card and the planned list advise *today*; the day-complete summary and the exercise page advise *next time*. The planned list carries the evidence line for tagged lifts only.

### 5. Two deloads, two voices (kept)
A reactive Deload is evidence about one lift: `A set below 8 reps, 2 sessions running`. A deload week is the plan: `Planned recovery, not a verdict`. They never share words, and nothing reactive appears in a deload week.

---

## 4. The recommendation model

### 4.1 Two lines

Every recommendation is at most two lines, always in this order:

1. **Action** — what to do, with a load only where §1 says the engine has one.
2. **Evidence** — the facts that decided the call, in one line.

The existing tag (`Progress`, `Deload`, `Hold — trend flat`) is unchanged and keeps its place; the two lines sit beneath it. Not enough history shows neither line on the card, summary, or planned list (it is not a recommendation); the exercise page keeps its factual note.

### 4.2 "Today" and "next time"

| Surface | Which history it judges | Time word |
| ------- | ----------------------- | --------- |
| Exercise card (during the workout) | every counted session before today's (today's session isn't complete yet, so it doesn't count) | `today` |
| Today → planned list | same | (no action line; see §5 Screen 2) |
| Today → day complete | includes the session just finished | `next time` |
| Exercise page | the latest counted session | `next time` |

The card's recommendation therefore does not change while the lifter logs sets; it changes after the day is complete, which is when the summary appears.

### 4.3 "Last time" means last time

The evidence refers to the most recent **counted** session (complete, every planned set, not a deload week, at this gym for machines and cables). **Decision:** the words say `last time` only when that session is also the most recent finished session in scope; otherwise they name its date (`on Oct 14`). This keeps the evidence from contradicting the card's `Last time` context line after an incomplete workout or a deload week. The same rule now applies to the two RIR lines from RIR Logging.

### 4.4 The copy catalog

Placeholders: `{w}` the working weight (Pitch 4's source; this gym's baseline for a machine or cable), `{s}` = `{w}` + 5, `{d}` the 90% deload-week load, `{top}` / `{min}` the counted sessions' top / bottom of range, `{n}` the engine's consecutive count, `{last}` per §4.3, `{gym}` ` at <gym name>` for machines and cables only, `{when}` per §4.2. Weights are lbs with tabular numerals. Figures in the evidence come from logged sets and the engine's named constants; nothing else.

| # | Engine result | Tag | Action (loaded) | Action (bodyweight) | Evidence |
| - | ------------- | --- | --------------- | ------------------- | -------- |
| P1 | Progress (rep rule, trend rose or not yet checked) | Progress | `Try {s} lb {when} (+5 lb)` | `{When}, go past {top} reps or make it harder` | `{top} reps on every set, {n} sessions running{gym}` |
| P2 | Progress, no known working weight | Progress | `Ready to add weight {when}` | — (bodyweight is P1) | as P1 |
| P3 | Progress released by RIR (case B) | Progress | as P1 / P2 | — (bodyweight never stalls) | `e1RM flat, but every set {last} had 2+ in reserve{gym}` |
| H1 | Hold at the limit (RIR case A) | none | `Stay at {w} lb {when}` | `Hold steady {when}` | `Top of the range, but at your limit {last} (0 RIR){gym}` |
| H2 | Hold — trend flat (stall gate) | Hold — trend flat | `Stay at {w} lb {when}` | — (bodyweight never stalls) | `Top of the range {n} sessions running, but e1RM hasn't risen over 3 sessions{gym}` |
| H3 | Hold; the latest counted session hit the top on every set, the one before didn't | none | `Stay at {w} lb {when}` | `Hold steady {when}` | `{top} on every set {last}; progress needs {n} sessions running{gym}` |
| H4 | Hold; the latest counted session fell short of the top | none | `Stay at {w} lb {when}` | `Hold steady {when}` | `{Last}: {r1}, {r2}, {r3} of {min}–{top}{gym}` (that session's working-set reps, in set order) |
| D1 | Reactive Deload | Deload | `Lower the weight {when}` | `Back off {when}` | `A set below {min} reps, {n} sessions running{gym}` |
| S1 | Deload week (reactive suppressed) | none (banner on Today) | `Deload week: {d} lb (90%)` | `Deload week` | `Planned recovery, not a verdict. Calls resume next week.` |
| N1 | Not enough history | none | — | — | — (exercise page only: `Not enough history yet{gym}: {q} of 2 complete sessions.`) |

Rules the catalog encodes (each a **Decision**):

- **Hold without a known weight** says `Hold steady {when}` for loaded lifts too; never `Stay at 0 lb` or a guessed number.
- **Mixed ranges.** If the sessions in a window had different planned ranges (the plan changed between them), the evidence says `top of the range` / `below the range` instead of one number, because no single `{top}` or `{min}` is true for both.
- **The e1RM stall line names no e1RM figures.** The gate compares unrounded values (`end ≤ start`), so rounded numbers could read `228 → 228` for a small fall; `hasn't risen` is exactly the rule.
- **Progress names only the deciding rule.** When the stall gate checked the trend and it rose, the evidence still names the rep rule (the gate passing is the absence of a blocker, not the reason). The chart on the exercise page shows the trend for anyone who wants it.
- **RIR appears only in P3 and H1**, the two cases where the engine's `rirEffect` says it changed the call. A missing RIR is never shown, never treated as 0, and never "2+".
- **Bodyweight action (P1)** points at the plan's own `{top}`; it never names a weight, a variation, or a rep count the plan didn't set.
- **D1 has no load.** It says what to change (the weight) and leaves the amount to the lifter. No `-10%`, no 90% borrowed from the deload week.
- **No hedging words, no certainty words.** No "optimal", "guaranteed", "should", "fatigue", "recovery needed", "overtraining". `Try` keeps the advisory voice that `SuggestedLoad` already established.

---

## 5. Visual language

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

### Color palette

| Token | Usage | Notes |
| ----- | ----- | ----- |
| `foreground` | Action line for Progress and Deload | the one thing to read |
| `muted-foreground` | Action line for every Hold and the deload week; every evidence line | Hold stays quiet |
| `progress` / `deload` (10% fill) | the existing tags | unchanged |
| `muted` | the existing deload-week banner | unchanged |

No new token. No new colour on Hold. No icon on the lines.

### State treatments

| State | Tag | Action line | Evidence line |
| ----- | --- | ----------- | ------------- |
| Progress (P1–P3) | `Progress` | `text-sm font-medium text-foreground` | `text-xs text-muted-foreground` |
| Deload (D1) | `Deload` | `text-sm font-medium text-foreground` | `text-xs text-muted-foreground` |
| Hold — trend flat (H2) | `Hold — trend flat` (unchanged amber + icon) | `text-sm text-muted-foreground` | `text-xs text-muted-foreground` |
| Hold (H1, H3, H4) | none | `text-sm text-muted-foreground` | `text-xs text-muted-foreground` |
| Deload week (S1) | none | `text-sm text-muted-foreground` | `text-xs text-muted-foreground` |
| Not enough history (N1) | none | nothing | nothing |

### Typography and spacing

The two lines sit together (`space-y-0.5`), `mt-2` below the context line on the card. Numbers in both lines are `tabular-nums`. Lines wrap; they are never truncated, because a cut-off reason is a wrong reason.

### Appearance

Tokens only; light and dark read the same. The muted lines must stay ≥ 4.5:1 on `card` in both modes (the existing `muted-foreground` token already does).

---

## 6. Information architecture

```text
Today (/)
 ├─ planned list ─ per row: [Try 190 lb] [Progress]      ← unchanged right side
 │                 evidence under the name (tagged rows) ← new
 ├─ [Start] → Exercise card (/log/[id])
 │             tag · gym                                 ← unchanged
 │             Last time: …                              ← unchanged (Faster Logging UX)
 │             action + evidence (two lines)             ← replaces note + Try line
 │             set rows …                                ← unchanged
 └─ day complete ─ per performed exercise:
                   name [tag]                 trend ›
                   action (next time) + evidence         ← new
Exercises → /exercises/[id] → Progression
                   [tag] action (next time) + evidence   ← replaces tag + Suggested next + RIR line
                   e1RM chart                            ← unchanged
```

No new route, page, tab, dialog, or control.

---

## 7. Screen specifications

## Screen 1: Exercise card — the recommendation lines

### Purpose
Tell the lifter, before the first set, what today's target is for this lift and the one fact that set it.

### URL pattern
`/log/[loggedSessionId]` (unchanged)

### Trigger
Opening the card; it recomputes on every render (`router.refresh` after a set), but today's sets don't count until the day is complete, so it reads the same through the workout.

### Layout — Progress, loaded (P1)

```text
┌──────────────────────────────────────────────┐
│ Barbell Bench Press                [Progress]│
│ 3 × 8–10                                     │
│ Last time: 185 × 10, 10, 10 · Tue            │
│ Try 190 lb today (+5 lb)                     │  ← action, foreground
│ 10 reps on every set, 2 sessions running     │  ← evidence, muted xs
│                                              │
│ Set 1  [ 185 ] lbs  [    ] reps  [Log set]   │  ← weight offer unchanged (working weight)
│ Set 2  —                                     │
└──────────────────────────────────────────────┘
```

The active row's weight offer stays the working weight (Faster Logging UX), **not** the suggestion: the lifter types 190 if they take the advice. The suggestion never prefills (Pitch 5 R28; method note "Set entry and tap-count method").

### Layout — ordinary Hold, loaded (H4)

```text
│ Incline Dumbbell Press                       │
│ 3 × 8–10                                     │
│ Last time: 60 × 10, 9, 8 · Tue               │
│ Stay at 60 lb today                          │  ← muted, no tag
│ Last time: 10, 9, 8 of 8–10                  │  ← muted xs
```

**Decision:** H4's evidence repeats the reps even though the context line shows them, because the context line is "the last performance at this gym" and the evidence is "the session the engine judged"; when they're the same session the repetition is short, and when they aren't (§4.3) the evidence names its date and the difference matters.

### Layout — Reactive Deload, cable at a gym (D1)

```text
│ Cable Row                           [Deload] │
│ 3 × 10–12                     Downtown 🔒    │
│ Last time: 140 × 10, 9, 8 · Mon              │
│ Lower the weight today                       │
│ A set below 10 reps, 2 sessions running      │
│   at Downtown                                │  ← wraps; never truncated
```

### Layout — Hold at the limit (H1), Hold — trend flat (H2), released stall (P3)

```text
H1 │ Stay at 185 lb today                                     │
   │ Top of the range, but at your limit last time (0 RIR)    │
H2 │ Barbell Squat              [⚠ Hold — trend flat]         │
   │ Stay at 275 lb today                                     │
   │ Top of the range 2 sessions running, but e1RM hasn't     │
   │ risen over 3 sessions                                    │
P3 │ Romanian Deadlift                       [Progress]       │
   │ Try 230 lb today (+5 lb)                                 │
   │ e1RM flat, but every set last time had 2+ in reserve     │
```

### Layout — bodyweight (P1 bodyweight, H4 bodyweight)

```text
│ Pull-up                            [Progress]│
│ 3 × 8–12 · bodyweight, reps only             │
│ Today, go past 12 reps or make it harder     │
│ 12 reps on every set, 2 sessions running     │

│ Dip                                          │
│ 3 × 8–12 · bodyweight, reps only             │
│ Hold steady today                            │
│ Last time: 12, 10, 9 of 8–12                 │
```

### Layout — deload week (S1)

```text
│ Barbell Bench Press                          │
│ 3 × 8–10                                     │
│ Last time: 185 × 10, 10, 9 · Tue             │
│ Deload week: 165 lb (90%)                    │
│ Planned recovery, not a verdict. Calls       │
│ resume next week.                            │
```

No tag, no reactive words, even if the history would have produced a call (suppressed, not hidden).

### Elements

| Element | Component / styling | Behavior |
| ------- | ------------------- | -------- |
| Tag | existing `ProgressTag` | unchanged position (top right) |
| Action line | `<p className="text-sm …">` per §5 | text only; not a button, not a link, never fills a field |
| Evidence line | `<p className="text-xs text-muted-foreground">` | text only |

### Fields / validation
None. Nothing on this surface is editable.

### Empty state
Not enough history (N1): neither line; the card looks exactly as it does today for a new lift.

### Loading state
Server-rendered with the card; no separate skeleton. The lines occupy their space on first paint, so nothing shifts under the thumb.

### Error state
If the evaluation can't be read, the card renders without the lines (as it would with no history) and logging still works. Never a placeholder call.

### Behavior
- Logging a set, correcting a set, or swapping doesn't change the lines mid-workout (today's session isn't counted yet). A correction to a **past** set in History changes the lines the next time the card renders.
- Focus order is unchanged: the lines aren't focusable, so the Faster Logging UX focus sequence and the 18 taps / 18 keystrokes are untouched.

## Screen 2: Today → planned list

### Purpose
Before starting, see which lifts have a call today and why, without opening each card.

### URL pattern
`/`

### Layout

```text
┌──────────────────────────────────────────────┐
│ Push Day 1 · Downtown                        │
│ Week 3 · 5 exercises                         │
│ Barbell Bench Press     Try 190 lb [Progress]│
│   10 reps on every set, 2 sessions running   │  ← new, tagged rows only
│ Overhead Press                      3 × 6–8  │  ← hold: unchanged
│ Dip                                [Progress]│
│   12 reps on every set, 2 sessions running   │
│ Cable Fly                 once gym is set    │  ← unchanged
│ Lateral Raise              [Deload]          │
│   A set below 12 reps, 2 sessions running    │
└──────────────────────────────────────────────┘
          [ Start Push Day 1 ]
```

**Decision:** the planned list keeps one thing on the right of each row (Pitch 14 R20) and adds only the evidence under the name, only for rows with a tag. Hold rows stay as the scheme; the card says what to do for them. The action already sits on the right (`Try 190 lb`) for Progress; a reactive Deload's right side is the tag only (no number to show).

### Deload week
Unchanged: banner `Deload week · 90% load across the split`, and each row's 90% load. No evidence lines (there is no reactive call).

### Empty / loading / error
Unchanged from today.

## Screen 3: Today → day complete

### Purpose
After the last set, know what to do next time for each lift done today.

### Layout

```text
┌──────────────────────────────────────────────┐
│ ✓ Push Day 1 complete                        │
│ Downtown · 5 exercises · 15 working sets     │
│                                              │
│ Barbell Bench Press  [Progress]     trend ›  │
│ Try 195 lb next time (+5 lb)                 │
│ 10 reps on every set, 2 sessions running     │
│                                              │
│ Incline Dumbbell Press              trend ›  │
│ Stay at 60 lb next time                      │
│ Last time: 10, 10, 9 of 8–10                 │
│                                              │
│ Dip                                          │
│ Hold steady next time                        │
│ 12 on every set last time; progress needs 2  │
│ sessions running                             │
│                                              │
│ Lateral Raise          [Deload]     trend ›  │
│ Lower the weight next time                   │
│ A set below 12 reps, 2 sessions running      │
│                                              │
│ (goal rows, unchanged)                       │
│ [View workout]   History →                   │
└──────────────────────────────────────────────┘
```

- Each performed exercise is one block: name + tag + `trend ›` on the first line, then the two lines. Not enough history: the name (and `trend ›` if there is a point) only.
- **Decision:** Hold rows now carry their two muted lines here, because "what do I do next time" is exactly this screen's question; no tag is added.
- Deload week: unchanged (`Deload week — recovery, not a verdict.` and no per-lift rows).
- Exercises not done today: still no row.

## Screen 4: Exercise page → Progression

### Purpose
The current call for this lift (this gym for a machine or cable), what to do next time, and why, above the existing e1RM chart.

### Layout

```text
Progression                          [Downtown ▾]   ← gym selector, unchanged
[Progress]
Try 195 lb next time (+5 lb)
10 reps on every set, 2 sessions running at Downtown

e1RM trend · Downtown                     Current
                                          231 lb
(chart, unchanged)
```

- Hold: no tag (the word `Holding` is replaced by the action line, which says it more usefully), then the two lines.
- Not enough history (N1): `Not enough history yet at Downtown: 1 of 2 complete sessions.` Nothing else.
- The page never shows a deload-week line: it describes the lift's current call, which reactive suppression doesn't apply to (suppression is per occurrence, Pitch 5 R37). **Decision:** unchanged behaviour; noted so the preview doesn't invent one.
- Archived exercise: the lines still render (history-derived), exactly like the chart.

---

## 8. Navigation flows

```text
History → a day → edit a set → Save
   → (revalidated) Today day-complete / exercise page / next card
     show the recomputed tag, action, and evidence
```

No other flow changes. `trend ›` still opens the exercise page.

---

## 9. Interaction specifications

- **Keyboard:** nothing new is focusable. Screen readers read the action then the evidence after the heading and context line.
- **Loading:** no new skeletons.
- **Errors:** a failed read omits the lines; never a stale or placeholder recommendation.
- **Notifications:** none. A recommendation never produces a toast.
- **Destructive actions:** none. A recommendation has no control; nothing on these surfaces writes.
- **Motion:** none.

## 10. Responsive behavior

| Breakpoint | Behavior |
| ---------- | -------- |
| base (320–639) | Lines wrap under the heading block at full card width; no truncation. At 320 the longest evidence (H2 with a gym) wraps to three lines; acceptable, since it is the rarest case. Planned-list evidence indents under the name and wraps; the right side keeps its width. |
| `sm`–`md` | Same, wider; most evidence fits on one line. |
| `lg` | Content column max width unchanged; lines never stretch past it. |

## 11. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `ProgressTag` | card, list, summary, page | reused, unchanged | |
| `Recommendation` | card, day complete, exercise page | **new** | renders the action + evidence lines from one recommendation value; variants by tone (strong / muted) |
| `RecommendationEvidence` | planned list | **new** (or a prop of `Recommendation`) | the evidence line alone |
| `SuggestedLoad` | planned list | reused | still the right-side `Try 190 lb` on the list; elsewhere replaced by the action line |
| `ScheduledDeloadBanner` | Today | reused, unchanged | |

The words come from one shared place used by every surface, so the card, summary, and page can't drift. That place is also what Exercise History & PR Intelligence will reuse for "the current recommendation and why".

## 12. Accessibility, privacy, and data sensitivity

- The lines are plain text in reading order; no colour carries meaning on its own (the tag keeps its text label).
- No `aria-live`: the lines don't change while the lifter is on the card.
- The gym name appears in evidence only for machines and cables, and only the gym's name (never its location text).
- No new sharing, export, or external link. Evidence is derived from the signed-in account's own sets only.

## 13. User guidance

Proposed for the final guidance ticket, decided there by `overload-onboarding` against the shipped mechanisms (`src/lib/tour/steps.ts`; `src/lib/release-notes/entries.ts`).

- **Tour (proposed): no new step and no copy change.** The `logging` step already says Overload uses your weight and reps "to tell you when to progress, hold, or deload", which stays true. This pitch adds no control, and a richer line of text is not a discoverable control (pitch §12).
- **Release note (proposed):** one **significant** entry (it changes how the core decision reads):
  - title: `Clearer progression calls`
  - body (draft; final wording by the skill against what shipped): `Every progression call now says what to do and why. Ready to go up shows the weight to try and the sets that earned it; a hold says what to stay at and what's left to earn the next step; a deload shows the sets that fell short. Overload never changes your plan.`
  - dated the day it reaches production; the runbook covers setting it at merge.
- **Must not:** edit the tour or What's New components, add a second guidance mechanism, or invent a date.

## 14. Out of scope

From the pitch (§7, §10): new or changed thresholds; a second engine or any UI-side evaluation; a reactive-deload load reduction; bodyweight weight or variation prescriptions; AI or generated coaching text; stored recommendation text; plan, weight, or baseline changes from a recommendation; RIR rule changes; scheduled-deload changes; readiness, fatigue, or recovery inputs; new metrics; a per-exercise history view, PR timeline, or new chart (Exercise History & PR Intelligence); notifications; a rest timer; account or email changes.

Also not designed here: an expandable "why" disclosure (two lines are short enough to show always); a history of past calls; explanations on the History day page (it shows no calls today, and adding them is Exercise History & PR Intelligence's job).

Permanent non-goals stand.

## 15. Open questions

None. Each design-stage question in pitch §14 is decided above and carried into the spec's Resolved Decisions:

1. Actionable wording → the copy catalog (§4.4).
2. Evidence selection → one line naming the deciding rule; RIR only when `rirEffect` is set; the stall line by its rule, not rounded figures (§4.4).
3. Supported specificity → loads only for Progress (+5 on a known weight) and the deload week (90%); `Ready to add weight` without a known weight; no reactive-deload or bodyweight weight (§3.2, §4.4).
4. Hold presentation → no tag, two muted lines on the card, summary, and page; nothing new on the planned list (§5, Screens 1–4).
5. Reactive vs scheduled deload → distinct words and treatment; nothing reactive in a deload week (§4.4 S1, Screen 1).
6. Screen integration → the four existing surfaces; no new screen (§6).
7. Mixed RIR → RIR named only in P3 and H1; never inferred (§4.4).
