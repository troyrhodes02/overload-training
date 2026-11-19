# Insights in the Workout — Design Document

**Version:** 1.0 (pipeline run of 2026-11-18)
**Pitch Source:** Overload — Pitch 21g: Insights in the Workout (`pitch.md` in this folder)
**Focus:** The progression call, its evidence, the scheduled-deload week, and the full session summary on the iPhone, with a quiet locked state for Free.
**Client scope:** Mobile only (iOS). The web is the reference behavior and does not change.
**UI preview:** Skipped — mobile-only pitch; native visual contract provided by the Mobile design section and /overload-mobile-ui.

---

## 1. Vision

Between sets, a lifter on the phone asks one question about the lift in front of them: *go up, stay, or back off — and why?* The web has answered it since Smarter & Explainable Progression. 21g puts the same answer, in the same words, on the native logging card and at the end of the workout, without slowing the next set down.

**North star:** *the answer sits above the bar, the reasons are one tap away, and the keypad never moves for either.*

## 2. Design principles

### 1. The server's words, verbatim

Every call, number, and reason on the phone is a string or value the server built with the one recommendation builder the web uses. The phone renders; it never decides. If the server says nothing, the phone says nothing (or the server's own "not enough history" line).

### 2. Hold is a non-event, Progress and Deload are not

A hold renders the quiet action line ("Stay at 60 lb today") with no chip and no color, exactly like the web. Progress and reactive Deload get a word chip in their status color; a stalled lift gets "Hold — trend flat". Color never carries meaning alone.

### 3. Two deloads, two voices

The scheduled deload week is a banner across the workout ("Deload week · 90% load across the split") for every plan. A reactive Deload is a chip on one lift. They never appear together: in a deload week the server suppresses reactive calls, and the card says "Deload week" in the quiet voice.

### 4. Advice is not input

A suggested weight lives in a sentence ("Try 185 lb today (+5 lb)"). It never fills the weight box, never changes the plan, and has no "use this" button. The weight box keeps the 21e/21f offer rules (trusted working weight, then "same as set N").

### 5. Insights may fail; logging may not

The call loads separately from the workout. A slow, failed, or locked call never delays the card, moves focus, or blocks Log set. A failed call shows a one-line retry, never the previous answer dressed as current.

## 3. Visual language

All styling inherits from Overload's shared design tokens (`packages/shared/src/design`) as mapped into the native theme (`apps/mobile/src/ui/theme.ts`). This design doc only defines feature-specific usage, variants, and states. (The native app has no Tailwind or shadcn/ui; its components are the 21d/21e system: `Surface`, `Chip`, `Text`, `Button`, `Banner`, `GroupedList`.)

### Color palette

| Token | Usage | Notes |
| --- | --- | --- |
| `card`, `border` | the logging card and summary exercise surfaces | unchanged |
| `foreground` | a strong action line (Progress, Deload, Reassess) | semibold |
| `mutedForeground` | quiet action line (Hold, Deload week), evidence, insufficient-history line, Pro note | |
| `progress` | Progress chip text on its 14% tint | exists in tokens.ts; no token change |
| `deload` | Deload and "Hold — trend flat" chip text on its 14% tint | exists in tokens.ts; no token change |
| `muted` / `secondary` | the scheduled-deload banner fill; the insight skeleton | |
| `primary` | the summary's check mark; Retry text button | |

No new color. `tokens.ts` is not edited (it is a native fingerprint input; editing it would strand the installed build).

### State colors

| State (from the server) | Visual treatment | Where |
| --- | --- | --- |
| Progress (`tag: progress`) | `Chip` "Progress", progress tone; strong action line | card, summary |
| Reactive Deload (`tag: deload`) | `Chip` "Deload", deload tone; strong action line | card, summary |
| Stalled (`tag: stalled`) | `Chip` "Hold — trend flat", deload tone; quiet action line | card, summary |
| Reassess (`recommendation.kind: reassess`, no tag) | no chip; strong action line | card, summary |
| Hold (`recommendation.kind: hold`, no tag) | no chip, no color; quiet action line | card, summary |
| Not enough history (`insufficientNote`) | no chip; one muted line | card |
| Scheduled deload week | muted banner with its own words; the card's quiet "Deload week…" line | workout, Today, summary |
| Locked (Free, something withheld) | one quiet muted sentence with a dismiss control | card, summary |

### Typography, spacing, radius

Action line: `md` (17pt) — semibold when strong, regular muted when quiet. Evidence and Pro note: `sm`. Chip: `xs` medium. Summary set lines: `sm` with tabular figures. Spacing and radius follow the 21e card (`spacing.sm` between the insight lines, `radius.lg` for the banner).

### Appearance

Light, dark, and system, from the existing theme. The status chips use the tokens' light and dark values, which meet AA on `card`.

## 4. Information architecture

```text
Tabs: Today · History · Plan · Goals · More
 Today ── [deload-week banner]  (new: planned or in-progress day in a deload week)
       ── Start / Resume ──▶ W1 Workout (root stack)
       ── Done day: [View summary] (new) ──▶ S1 Summary
 W1 Workout ── [deload-week banner] (new)
            ── Exercise card
                 ├─ context line(s) (21e/21f)
                 ├─ INSIGHT (new): chip · action · [Why ▾] → evidence
                 │     or not-enough-history line, or Pro note, or loading / retry
                 └─ set rows · Log set (unchanged)
            ── Finish ──▶ S1 Summary (expanded)
 S1 Summary ── header, deload line, exercises (sets + call), goals moved, Pro note
            ── [Done] → Today   [View in History] → H2
 H2 Logged workout (History) — unchanged; no calls (the web's History has none)
```

## 5. Surfaces affected

| Surface | Change |
| --- | --- |
| W1 Workout | scheduled-deload banner above the progress line |
| Exercise card (W1) | the insight block between the context lines and the set rows |
| S1 Summary | from the 21e "basic" confirmation to the full summary |
| T1 Today | deload-week banner; "View summary" on the done day |
| H2 Logged workout, Edit set, Swap, Cardio, Gym change | unchanged; their writes now also mark insights stale |

## 6. Screen specifications

### Exercise card — the insight block

**Purpose.** Say what to do with this lift today and, on request, why.

**Trigger.** Opening a workout, moving to another exercise, or coming back to the workout.

**Placement.** Inside the card, after the context line ("Last time in Upper A · Nov 10 · 180 × 8, 8, 8") and the reference panel, before the set rows. It is never below the active row, so the keypad bar and Log set keep their positions relative to the inputs.

**Layout — Pro, Progress, collapsed (default):**

```text
│ Barbell Bench Press            (•••)│
│ 3 × 6–8                             │
│ Last time in Upper A · Nov 11 ·     │
│ 180 × 8, 8, 8                       │
│ ┌─────────────────────────────────┐ │
│ │ (Progress)                      │ │ chip
│ │ Try 185 lb today (+5 lb)     ▾  │ │ action, semibold; Why chevron
│ └─────────────────────────────────┘ │
│ Set 1 [ 180 lbs ][    reps]         │ weight box: the trusted offer, NOT 185
```

**Expanded (after tapping the block):**

```text
│ (Progress)                          │
│ Try 185 lb today (+5 lb)         ▴  │
│ 8 reps on every set, 2 sessions     │ evidence, sm muted
│ running                             │
```

| Server state | Chip | Action line | Expanded evidence |
| --- | --- | --- | --- |
| Progress | Progress | strong: "Try 185 lb today (+5 lb)" / "Ready to add weight today" / bodyweight "Today, go past 10 reps or make it harder" | e.g. "8 reps on every set, 2 sessions running"; RIR release: "e1RM flat, but every set last time had 2+ in reserve" |
| Hold | none | quiet: "Stay at 60 lb today" / "Hold steady today" | "Last time: 12, 11, 10 of 8–12"; at the limit: "Top of the range, but at your limit last time (0 RIR)" |
| Stalled | Hold — trend flat | quiet: "Stay at 180 lb today" | "Top of the range 2 sessions running, but e1RM hasn't risen over 3 sessions" |
| Reassess | none | strong: "Reassess the weight today" | "Last time: 7, 6, 5 of 6–8, below 6. A deload follows 2 complete sessions running below 6." |
| Reactive Deload | Deload | strong: "Lower the weight today" | "A set below 6 reps, 2 sessions running" |
| Deload week | none | quiet: "Deload week: 160 lb (90%)" / "Deload week" | "Planned recovery, not a verdict. Calls resume next week." |
| Not enough history | none | muted single line, no chevron: "Not enough history yet at Riverside Fitness: 1 of 2 complete sessions." | — |
| No call and no note | — | nothing rendered | — |
| Locked (Free) | none | the Pro note (below) | — |

Gym-variable lifts carry the gym in the evidence ("…at Northside Strength"), as the server writes it.

**The Pro note (Free, `locked` set):**

```text
│ Progress, hold, and deload calls for   ✕ │ sm muted; ✕ = 44×44 dismiss
│ this lift are part of Pro.               │
```

No link, no button, no price, no "upgrade". Dismissing hides the note on every card for the rest of the app session; it returns on the next launch (the web remembers dismissal per browser; the phone has no preference store and adds none). A Free lift with nothing withheld (no history yet) shows the not-enough-history line exactly as Pro does, never the Pro note.

**Loading state.** One line-height `Skeleton` bar (60% width) where the action line will be. It is the same height as the collapsed block's action line, so the set rows move at most by the chip's height when a Progress or Deload call arrives. Inputs are usable while it shows.

**Error state.** One muted line: "Couldn't load the call for this lift." with a text button **Retry** (44pt). It replaces any earlier answer for this workout; it never shows a stale call. Set entry is unaffected.

**Behavior.**
- Tapping the block toggles the evidence. It is a plain disclosure: it never dismisses the keyboard, never focuses a field, and never scrolls. The expanded state is remembered per exercise while the workout screen is open.
- A finished workout's card is not shown (21e: the workout screen shows "This workout is finished").
- A card marked Not done or Unavailable shows no insight block (no call about a lift not done today).
- After a gym change, a swap, an undo of Not done, a corrected set, or returning from the background, the block shows the loading bar again until the fresh answer arrives (the previous answer is not shown as current).
- Logging a set does not reload the call: today's call is judged on finished workouts, and the set just logged belongs to this unfinished one.

### W1 Workout — the scheduled-deload banner

**Purpose.** Say, once and for the whole workout, that this is a planned recovery week.

```text
│ ‹ Today       Upper A        Finish │
│ ┌─────────────────────────────────┐ │
│ │ Deload week · 90% load across   │ │ muted fill, sm medium
│ │ the split                       │ │
│ └─────────────────────────────────┘ │
│ ▬▬▬▬ ──── ──── ────                 │
│ Exercise 1 of 4 · Tue, Nov 18 · …   │
```

Shown when the server's workout says it falls in a scheduled-deload week (Free and Pro). The words are the web banner's. It is not an alert role (it isn't news); VoiceOver reads it as text first on the screen. It disappears the first workout of the next week because the server's flag does.

### S1 Summary — full

**Purpose.** Confirm what was saved and, for Pro, what each lift means for next time.

**Trigger.** A confirmed Finish (21e) or "View summary" on Today's done day. Opening it only reads; it never finishes anything again.

```text
┌───────────────────────────────────┐
│           Workout complete        │
│                (✓)                │
│        Upper A complete           │ xl semibold
│  Tue, Nov 18 · Northside Strength │ sm muted
│        4 exercises · 11 sets      │
│ ┌───────────────────────────────┐ │
│ │ Deload week — recovery, not a │ │ deload week only (all plans)
│ │ verdict.                      │ │
│ └───────────────────────────────┘ │
│ EXERCISES                         │ SectionHeader
│ ┌───────────────────────────────┐ │
│ │ Barbell Bench Press (Progress)│ │ name + chip (Pro)
│ │ 1  185 lbs × 8 · 2 RIR        │ │ the saved sets, as History
│ │ 2  185 lbs × 8                │ │
│ │ 3  185 lbs × 8                │ │
│ │ Try 190 lb next time (+5 lb)  │ │ action (Pro), strong
│ │ 8 reps on every set, 2 …      │ │ evidence (Pro), sm muted
│ ├───────────────────────────────┤ │
│ │ Seated Cable Rows             │ │
│ │ swapped from Lat Pulldown     │ │
│ │ 1  145 lbs × 12 …             │ │
│ │ 2 of 3 planned sets — counts  │ │ short of plan
│ │ toward your strength trend,   │ │
│ │ not your progress check.      │ │
│ ├───────────────────────────────┤ │
│ │ Overhead Press                │ │
│ │ Not done                      │ │ skipped / no sets
│ └───────────────────────────────┘ │
│ GOALS                             │ only when the workout moved one
│ Bench Press · 225 × 5   82% → 85% │
│ What to do next time on each      │ Free + locked only
│ lift, and why, is part of Pro.  ✕ │
│ [            Done             ]   │ primary
│        View in History            │ text button
└───────────────────────────────────┘
```

- **Saved facts (all plans)** come from the logged-workout record, the same data History shows: performed name, "swapped from", each saved set with weight (or reps only), reps, RIR when recorded ("· 2 RIR"; a missing RIR shows nothing, a 0 shows "· 0 RIR"), "· extra" on extra sets, "Not done" for an exercise with no sets, and the short-of-plan line when fewer working sets were logged than planned.
- **Calls (Pro)** are the server's "next time" calls: chip and both lines, shown expanded (the summary is a reading surface, not a working one). In a deload week no per-exercise call shows; the deload line stands in for them, as on the web.
- **Goals (all plans)** are the goals this workout moved: exercise · target, then "before% → after%" or "Goal reached". No chart: the one native chart belongs to 21i, and the PRD asks for "a chart or percentage-toward-goal view", which this is.
- **Cardio** is not on the strength summary (its completion is separate, as on the web).
- **Loading:** the record shows as soon as it arrives (skeleton before); the calls and goals area shows a skeleton line per exercise until its answer arrives.
- **Errors:** a failed record shows the 21e LoadErrorState with Retry. A failed calls read shows "Couldn't load next-time calls." with Retry under the exercises; the saved facts stay.
- **Pro note:** one sentence, dismissible for the session, no link.

### T1 Today — two small additions

- A planned or in-progress day in a scheduled-deload week shows the same banner as W1, above the day card (web parity: the Today page shows `ScheduledDeloadBanner`). The existing "Week 4 · Deload week" line stays.
- The done day keeps **View workout** and adds a text button **View summary**, which opens S1 for that workout.

Today's planned list stays without calls in 21g (see the spec's Resolved Decisions: the call lives on the card where the lift is performed and at the end; Today's read stays on the fast core fields).

## 7. Navigation flows

```text
Today ─Start/Resume─▶ W1 ─(card insight loads in place)
W1 ─tap insight─▶ evidence expands inline (no navigation)
W1 ─More ▸ Swap─▶ X1 ─choose─▶ W1 (card reloads; insight reloads for the substitute)
W1 ─Change gym─▶ action sheet ─▶ W1 (every card's insight reloads)
W1 ─tap saved set─▶ E1 ─save─▶ W1 (insights reload)
W1 ─Finish─▶ (confirm) ─▶ S1 ─Done─▶ Today │ ─View in History─▶ H2
Today (done) ─View summary─▶ S1
History ▸ H2 ─tap set─▶ E1 ─save─▶ H2 (any open workout or summary insight is stale and reloads when shown)
```

## 8. Interaction specifications

### Keyboard

Unchanged from 21e/21f: decimal pad for weight, number pad for reps, one keypad bar per input with Done and Log set, focus moves to reps after weight and to the next set's weight after a save. The insight block takes no focus and dismisses no keyboard. Its arrival or reload never calls focus or scroll. When it expands, the active row's own layout handler keeps the row above the keyboard (21e OVE-213).

### Haptics

None new. (A call is not an event to feel.)

### Loading and error

As specified per surface: one-line skeleton, one-line retry, never the previous call. The workout, summary record, and Today load exactly as before.

### Entitlement changes

The phone keeps no copy of a call beyond the screen showing it. Every open of the workout, every return to it, every return from the background, and every write that can change a call reads it again. When the answer comes back locked, the call is replaced by the Pro note at once. Sign-out removes every cached call (21d).

### Destructive actions

None.

## 9. Responsive behavior

iPhone only, portrait. Long exercise names wrap in the card title (unchanged). At the largest accessibility text sizes the chip wraps above the action line and the action and evidence wrap freely; nothing truncates a reason. The block never becomes a horizontal row.

## 10. Component inventory (native, `apps/mobile/src`)

| Component | Location | New / reused | Notes |
| --- | --- | --- | --- |
| `InsightBlock` | `workout/` | new | the card's call: loading, error, call (collapsed/expanded), not-enough-history, locked |
| `ProgressChip` | `ui/` or `workout/` | new, on `Chip` | progress / deload / stalled; hold renders nothing |
| `ProNote` | `ui/` | new | one quiet sentence + dismiss; no link |
| `DeloadWeekBanner` | `ui/` | new | the muted week banner (W1, Today) |
| `Chip` | `ui/Surface.tsx` | reused, one tone added | `deload` tone |
| `SummaryScreen` | `workout/` | rewritten | full summary |
| `Skeleton`, `Text`, `Surface`, `Button`, `SectionHeader` | `ui/` | reused | |

## 11. Accessibility, privacy, and data sensitivity

- The insight block is one VoiceOver element, role button, label "<call word>: <action>." with state expanded/collapsed and hint "Shows why" / "Hides why"; when expanded its label adds the evidence. Call words: Progress, Hold, Hold — trend flat, Reassess, Deload, Deload week. A hold therefore has a spoken word even though it has no visible chip.
- The not-enough-history line, error line, and Pro note are plain text (Retry and dismiss are buttons, 44×44).
- The banner and chips pair color with words; nothing relies on color.
- Dynamic Type: all text uses the theme sizes, which scale; no fixed-height container clips them.
- Privacy: no share, no external link, no other account's data. Gym names appear only where the server already puts them (machine evidence, the date line).

## 12. Out of scope

- 21g deferred elsewhere: Today's planned-list calls; calls on the History record (the web has none); exercise history, records, trend charts, and goal screens (21i); plan, library, and gym screens (21h); a native tour step (21k).
- Permanent non-goals: program generation, an AI coach, social, ads, dated goals, a rest timer, cardio progression, any purchase flow in the app.

## 13. User guidance

The native tour does not exist yet (21k), and What's New is not shown in the app before 21j. No tour step or release note is added in 21g; the web's release notes already describe the calls and evidence. Recorded as a Resolved Decision in the spec.

## 14. Plan placement and client scope

**Plan placement.** Capture, history, the summary's saved facts, goals rows, and the deload-week banner are Free. The calls, suggested loads, and evidence are the existing Pro capability `progression_insights`, enforced on the server (the gated readers). Free sees one quiet note where a call was withheld; Pro sees the call.

**Client scope.**

| Surface | Shared logic | API | Web UI | Mobile UI | Why |
| --- | --- | --- | --- | --- | --- |
| Card call + evidence | recommendation builder (unchanged) | existing gated `GET /workouts/{id}`; one additive field | unchanged | new | parity |
| Not enough history | `insufficientNote` (unchanged) | additive field on the card call | unchanged | new | a truthful neutral state |
| Deload-week banner | schedule rules (unchanged) | existing `scheduledDeloadWeek` | unchanged | new | parity |
| Summary | — | existing gated `GET /history/{id}` | unchanged | rewritten | PRD summary |

## 15. Mobile design (the native visual contract)

Built with `overload-mobile-ui` on the 21d/21e/21f system: `Surface` cards, `Chip` status words, tokens only, tabular figures, 16-point gutters.

### W1 Workout — root stack, over the tabs

```text
┌──────────────────────────────────┐
│ ‹ Today      Upper A      Finish │
│ ┌──────────────────────────────┐ │ deload week only
│ │ Deload week · 90% load across│ │
│ │ the split                    │ │
│ └──────────────────────────────┘ │
│ ▬▬▬▬ ──── ──── ────              │
│ Exercise 1 of 4 · Tue, Nov 18 ·  │
│ Northside Strength               │
│ ┌──────────────────────────────┐ │
│ │ Barbell Bench Press     (•••)│ │
│ │ 3 × 6–8                      │ │
│ │ Last time in Upper A · Nov 11│ │
│ │ · 180 × 8, 8, 8              │ │
│ │ (Progress)                   │ │ ← insight block
│ │ Try 185 lb today (+5 lb)   ▾ │ │
│ │ ┌──────────────────────────┐ │ │
│ │ │ Set 1 [180 lbs][   reps] │ │ │ active row (unchanged)
│ │ │        last time         │ │ │
│ │ │ RIR (0)(1)(2)(3)(4+)     │ │ │
│ │ └──────────────────────────┘ │ │
│ │ Set 2 —                      │ │
│ │ Set 3 —                      │ │
│ │ [        Log set 1         ] │ │
│ └──────────────────────────────┘ │
│ [Previous] [Next: Overhead Press]│
└──────────────────────────────────┘
```

- **Native pattern:** an inline disclosure (press state, chevron that rotates), not a sheet: a sheet would dismiss the keyboard and hide the inputs the evidence is about.
- **States:** loading (one skeleton line), call (collapsed/expanded), not-enough-history line, error + Retry, locked note, nothing.
- **Differs from the web:** the web prints both lines always and puts the chip at the card's top right. The phone's top right holds More, and the phone is narrower, so the chip sits on the block's first line and the evidence is one tap away.

### S1 Summary — root stack (replaces W1)

As laid out in §6. `ScrollView` with `contentInsetAdjustmentBehavior="automatic"`; one `Surface` with a row per exercise separated by hairlines; `SectionHeader` for Exercises and Goals. The primary action (Done) is at the end of the content. Differs from the web's day-complete block: the phone lists the saved sets under each lift (the web block lists counts only and links to History), because there is no separate day-complete card on the phone's summary route and the pitch asks the summary to reflect swaps, skips, extra sets, and RIR.

### T1 Today — additions

```text
│ ┌──────────────────────────────┐ │
│ │ Deload week · 90% load across│ │ deload week, day not done
│ │ the split                    │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ UPPER A               (Ready)│ │ (21e card, unchanged)
│ ...
│ Done day: [ View workout ]  View summary │
```
