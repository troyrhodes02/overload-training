# Goals & Exercise History — Design Document

**Version:** 1.0 (pipeline run of 2026-11-24)
**Pitch Source:** Overload — Pitch 21i: Goals & Exercise History (`pitch.md` in this folder)
**Focus:** Strength goals (list, set, detail, archive, the one-time Goal-reached card, goal history) and an exercise's own history (sessions as logged, records, and one trend chart) on the iPhone, with the web's numbers and the web's Free/Pro split.
**Client scope:** Mobile (iOS). No web behavior changes. The web is the reference for every number, word, and rule.
**UI preview:** Skipped — mobile-only pitch; native visual contract provided by the Mobile design section (§15) and `/overload-mobile-ui`. The visual review artifact is the design canvas linked from §15.

---

## 1. Vision

Away from the bar, a lifter asks *what am I working toward, and how has this lift actually moved?* The web has answered both since Goals and Exercise History & PR Intelligence. 21i puts the same answers on the phone: the target and how close the best session is, every session as it was logged, the records, and one line that shows the trend.

**North star:** *the phone shows what the lifter did and what it adds up to — the server's numbers, in the web's words, nothing invented.*

## 2. Design principles

### 1. The server's numbers, verbatim

Every percentage, best session, record, trend point, and call comes from the mobile API as the web computes it. The phone formats; it never estimates, averages, interpolates, or compares. A goal with no qualifying session reads "No performance recorded yet", never 0%.

### 2. Logged is what happened

Exercise history lists sessions exactly as logged: the weight, the reps, the RIR when recorded, the swap note, the workout it belonged to, the date it was trained. The plan's prescription never stands in for a logged number.

### 3. Free sees everything they logged

Goals, goal progress, every session, best set, heaviest weight, and most reps are Free, as on the web. The e1RM trend, the best e1RM, the rep records, and the per-session calls are Pro and are withheld by the server. A Free lifter sees one quiet note where those would be, only when something was actually withheld.

### 4. One chart, honest at every size

One line chart per exercise: e1RM for a loaded lift, reps for a bodyweight lift. One point per finished workout, evenly spaced as on the web. Zero or one point is a sentence, never a chart. Long histories scroll sideways and start at the newest point. A table of the same points sits under the chart for VoiceOver.

### 5. Browsing never touches a workout

Opening goals, history, or a past workout writes nothing except the web's own goal-completion check. A history reached from a workout stacks over the workout, which stays mounted with everything typed.

## 3. Visual language

All styling inherits from Overload's design tokens (`packages/shared` → `apps/mobile/src/ui/theme.ts`) and the 21d–21h native components. This design doc only defines feature-specific usage, variants, and states. (The web's equivalent sentence names Tailwind and shadcn/ui; the native app maps the same tokens.)

### Color palette

| Token | Usage | Notes |
| --- | --- | --- |
| `background`, `card`, `border` | screens, `Surface` cards, list separators | as 21h |
| `foreground`, `mutedForeground` | numbers and labels; dates, footnotes | numbers lead |
| `primary` | the progress bar fill, the chart line and points, the selected point ring, links | the one accent |
| `secondary` | the progress bar track, the chart's selected-point readout | quiet |
| `progress`, `deload` | the per-session call chips (Pro) | words always present |

### State colors

| State | Treatment | Where |
| --- | --- | --- |
| Active goal | normal; progress bar in `primary` | G1, G3 |
| Reached goal | `Chip` "Reached" + checkmark symbol, muted | G2, X2 goals |
| Archived goal (manual) | `Chip` "Archived", muted | G2, X2 goals |
| Archived exercise or gym | `Chip` "Archived" beside the name; muted name | everywhere a name shows |
| Session call Progress / Deload / Stalled | the 21g `ProgressChip` | X2 sessions (Pro) |
| Session call Hold, Not enough history, Deload week, Not counted, In progress | muted word, no chip | X2 sessions (Pro) |
| Scheduled-deload point | hollow muted square, not a filled circle | chart |

Color is never the only signal: every chip has its word, and deload points differ by shape.

### Typography, spacing, radius

21d scale. Goal percent uses `size="3xl"` semibold tabular; the target uses `xl`. Chart axis labels use `xs` muted tabular. 16-point gutters, `radius.xl` cards.

### Appearance

Light and dark through tokens. The chart draws with tokens only (line `primary`, grid `border`, labels `mutedForeground`), so it inverts with the theme.

## 4. Information architecture

```text
Tab bar: Today · History · Plan · Goals · More

Goals (tab)                         ← replaces the 21d placeholder
 ├─ G1 Goals (root)  reached cards · active goals · Goal history (n) · [New goal]
 │   ├─ G3 Goal (active | archived)  → X2 Exercise history
 │   ├─ G2 Goal history              → G3
 │   └─ G4 Pick the lift (library)   → G5 Set goal (modal)
 ├─ X2 Exercise history              → H2 Logged workout, X1 Exercise, G3, G5
 ├─ X1 Exercise (21h)                → X2
 └─ H2 Logged workout (21e/21f)

More → Exercises (21h) → X1 Exercise → X2 Exercise history → H2 / G3 / G5
Plan → Session (21h)  → X1 Exercise → X2 Exercise history → H2 / G3 / G5
Workout card "About this exercise" (root, over the workout) → X1 → X2 (root)
Today: unchanged by 21i (see RD-8 in the spec)
```

G5 Set goal is a modal over everything, so every entry point opens the same form.

## 5. Surfaces affected

| Surface | Change |
| --- | --- |
| Goals tab | placeholder replaced by G1–G4 |
| X1 Exercise (21h) | "History and records · On the web" row becomes a native "History and records" row to X2 |
| H2 Logged workout | unchanged; reachable from X2 inside each stack |
| Workout summary (21g) | unchanged (already shows the goals a workout moved) |
| Today | unchanged by 21i |

## 6. Screen specifications

### G1 Goals (Goals tab root)

**Purpose.** See every active goal and how close it is; set a new one.

**Layout.** `TabScreen` eyebrow "STRENGTH TARGETS", title "Goals". Then, in order:
1. One Goal-reached card per unacknowledged completion (see G3 archived).
2. Active goals, oldest first (the web's order), each a `Surface` row: exercise name (and gym for a machine), target "225 lb × 5", the percent on the right, a thin progress bar. No percent → the line "No performance recorded yet" and no bar.
3. "Goal history (n)" row when n > 0.
4. Primary `Button` "New goal" at the bottom of the content.

**Empty.** No active goals and no reached cards: `StateView` "No goals yet." / "Set a weight × reps target for a lift to track it here." with action "New goal". Goal history row still shows when there is history.

**Loading.** Skeleton cards. **Error.** `LoadErrorState` "Goals". Pull to refresh.

**Behavior.** Opening G1 runs the web's completion check on the server first, so a met target arrives as a reached card, not as an active 100%.

### G2 Goal history

**Purpose.** Look back at reached and archived goals. Grouped list, most recently archived first: name, target, and "Reached Nov 3, 2026" or "Archived Nov 3, 2026". Archived exercise or gym → `Chip` "Archived". Row → G3. Empty: "No goals in your history yet."

### G3 Goal

**Active.** Header: exercise name (+ "Archived" chip), then "Downtown Gym · set Oct 12, 2026" or "Goal · set Oct 12, 2026". Big target "225 lb × 5" with the percent on the right and the progress bar under it, or "No performance recorded yet (at Downtown Gym)." Then a two-row `GroupedList`: Best "214 lb e1RM — from 195 × 5 · Nov 18" and Target "253 lb e1RM". A footnote: "Best session across all gyms. Epley estimate, same as the trend." or "Only sessions at Downtown Gym count toward this goal. …". An archived-exercise or archived-gym note when either applies (web's words). Rows: "Exercise history" → X2 (with the goal's gym for a machine). At the bottom: destructive-text `Button` "Archive goal" → system alert "Archive this goal? / Bench Press 225 lb × 5 moves to your goal history. This can't be undone." [Cancel] [Archive].

**Archived.** Unacknowledged reached → the Goal-reached card leads. Then the name, gym, "Reached Nov 3, 2026" or "Archived …", the target, "Set Oct 12, 2026", the "Exercise history" row, and "Set a new goal" when allowed (the server says when: the exercise isn't archived and has no other active goal) and the card isn't showing.

**Goal-reached card.** A calm `Surface` with a checkmark symbol: "Goal reached" / "Bench Press · 225 lb × 5 (at Downtown Gym)". If it was met by history at creation: "Your history already meets this target." Buttons: "Set a new goal" (primary) and "Done" (text). Either one acknowledges it on the server; the card never returns. A success haptic plays the first time the card appears on screen, once per goal per app session. No confetti, no animation beyond the system fade.

### G4 Pick the lift (Goals stack)

The 21h library (search, All/Favorites, muscle) with the title "New goal". A row whose exercise already has an active goal shows a "Goal set" chip. Tapping any row opens G5. Archived exercises are not listed (the library never lists them).

### G5 Set goal (modal)

**Purpose.** One weight × reps target for one lift.

**Layout.** `FormScreen` modal, header "New goal" with Cancel. The exercise (image, name, "Chest · Barbell"). For a machine or cable: "Measured at" with the active gyms as a `ChipGroup` (one gym preselected; the gym the history showed when still active, else the only gym). Fields: Target weight (lb, decimal keypad) and Target reps (number keypad), side by side. Footnote: "Progress is your best session's e1RM against this target's." Primary "Set goal" at the bottom.

**Fields.**

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| Gym | single choice | machine/cable only | the server's message ("Choose the gym this goal is measured at.") |
| Target weight | lb, decimal | yes | the shared goal parser's messages, shown under the field |
| Target reps | whole number | yes | the shared goal parser's messages |

**States from the server (the web's form context).** Exercise has an active goal → "Bench Press already has an active goal." with its target and percent and a "View goal" button (the form is not shown). Machine with no gyms → "Add a gym first. Machine goals are measured per gym." with a "Gyms" button. Bodyweight → "Goals need an external weight. Bodyweight-only lifts can't have one." Archived exercise → "This exercise is archived. Restore it to set a goal." Not found → "This exercise isn't available."

**Behavior.** "Set goal" is disabled while saving; a second tap does nothing. The same values resent after a failure carry the same retry key, so the server never makes two goals. A field error keeps every typed value. On success the modal closes and the goal opens in Goals (from G4) or the history screen shows a "Goal set." banner with View (from X2). If history already meets the target, the goal opens straight to its reached card. A duplicate raced in from the web answers with the existing goal's link.

### X2 Exercise history

**Purpose.** Everything this lift has done, and (Pro) what it adds up to.

**Layout (top to bottom, the web's order).**
1. Header: name (+ "Custom" / "Archived" chips), "Chest · Barbell"; row "About this exercise" → X1 (hidden when X1 is the screen below).
2. Machine/cable only: "History at" + the gym (a `SegmentedControl`-style chip row when 2+ gyms; archived gyms say "(archived)"; legacy rows "No gym recorded"), and "Machines differ between gyms, so each gym keeps its own records."
3. **Next time** (Pro, only when the server sent a call): the 21g insight block per recurring workout ("Push · 6–8 reps" label when 2+), or the not-enough-history line, or "Calls for machines are made per gym."
4. **Pro note** (when `locked`): one dismissible sentence "Strength insights are part of Pro." with no link.
5. **Records** (`Surface` of rows): Best set "205 × 5 lb · Nov 18"; Best e1RM · estimate "239 lb — from 205 × 5" (Free: "—  Part of Pro"); Heaviest weight "215 × 2 · Oct 30"; Rep records (Pro) as a small table Weight / Reps / Date. Bodyweight: "Most reps in a set 18 reps · Nov 2". Footnote "Working sets of finished workouts. Deload weeks don't count."
6. **Trend** (the chart, below).
7. **Sessions**, newest first, 10 then "View all n sessions": date (tappable → H2), workout name, gym (gym-consistent lifts), the call on the right (Pro), the set line "185 × 8, 8, 7", "RIR 2, 1, 0" when recorded, "3 of 4 planned sets" when not counted, "In place of Incline Press" after a swap.
8. **Goals**: the active goal row (percent) → G3; "Set a goal" (when eligible) → G5; past goals (Reached/Archived) → G3. Bodyweight: "Bodyweight lifts don't take weight × reps goals."

**Empty.** No logged sets: "No sets logged yet. Log it in a workout and its sessions, records, and trend show up here." The goals section still shows.

**Chart (one native line chart).**

```text
 e1RM                       Current 239 lb
 ┌────────────────────────────────────────┐
 │ 240 ┤                         ●──●     │
 │     │                ●──●──●/          │
 │ 220 ┤       ●──□──●/                   │
 │     │  ●──●/                           │
 │ 200 ┤                                  │
 │      Sep 8      Oct 6      Nov 3  Nov 18│
 └────────────────────────────────────────┘
 Selected: Nov 18 · 239 lb · 205 × 5, 5, 4
 9 sessions · Epley estimate · □ deload week
```

- Series: e1RM for a loaded lift (Pro; withheld on Free), reps for a bodyweight lift (Free). The weight view and the projected-RIR overlay stay on the web (RD-6).
- One point per finished workout in the selected scope, evenly spaced; no time-proportional gaps, no interpolated values, no zero points.
- Y axis: three gridlines with rounded labels spanning the server's min and max (padded); X axis: up to four date labels.
- Up to ~10 points fit the width; more scroll sideways, opening at the newest. Points are at least 28 pt apart.
- Tap or drag across the plot selects the nearest point (selection haptic); the readout line shows its date, value, and the sets behind it. VoiceOver: the chart is one element labelled "e1RM trend, 9 sessions, from 205 to 239 lb", and a "Show values" disclosure lists every point as text rows.
- 0 points: "No finished workouts yet." 1 point: "One session so far: e1RM 214 lb. The trend starts at two." Free with a withheld e1RM trend: the Pro note covers it; the section shows "The e1RM trend is part of Pro." in muted text.

**Loading.** Skeleton for the header and records. **Error.** `LoadErrorState` "This exercise's history"; a refetch keeps the last loaded answer visible with the "Can't reach Overload. Showing what was last loaded." banner. Pull to refresh.

### X1 Exercise (21h, one change)

The "History and records · On the web" row becomes "History and records" with a chevron, pushing X2 in the same stack. Nothing else changes.

## 7. Navigation flows

```text
Goals → [New goal] → G4 → row → G5 (modal) → Set goal → G3 (Goals stack: Goals › G3)
Goals → goal row → G3 → Exercise history → X2 → session date → H2 → edit a set (21f modal)
      → back → X2 re-reads (the edit changed records, trend, and goal %)
More → Exercises → X1 → History and records → X2 → Set a goal → G5 → banner "Goal set." [View] → G3 (Goals tab)
Workout card → About this exercise → X1 (over the workout) → History and records → X2 (over the workout)
      → back, back → the workout, unchanged
Goal-reached card → Set a new goal → G5 for the same lift (and gym, if still active)
                  → Done → card gone for good
```

## 8. Interaction specifications

- **Keyboard.** G5: weight (decimal pad) → Next → reps (number pad) → Done submits. The keyboard never covers the focused field (21f `keep-above-keyboard`).
- **Haptics.** Selection when a chart point changes; success when a goal is set and when a Goal-reached card first shows; warning on a failed save.
- **Loading and error.** Skeletons shaped like content; a failed load is never shown as empty (`LoadErrorState`).
- **Notifications.** Inline banners: "Goal set." (View), "Goal archived." Errors are banners or field messages; nothing floats.
- **Destructive actions.** Archive goal: system alert, no undo (the web's rule). Nothing else here removes anything.

## 9. Responsive behavior

iPhone portrait only, from SE (375 pt) up. The chart width follows the screen; Dynamic Type grows labels, and the chart's readout wraps rather than truncating. Every action is reachable one-handed; "New goal" and "Set goal" sit at the bottom of their content.

## 10. Component inventory (native, `apps/mobile/src`)

| Component | Location | New / reused | Notes |
| --- | --- | --- | --- |
| `GoalsScreen`, `GoalHistoryScreen`, `GoalScreen` | `goals/` | new | G1–G3 |
| `GoalReachedCard` | `goals/` | new | one per unacknowledged completion |
| `GoalProgressBar` | `goals/` | new | percent from the server |
| `GoalPickerScreen` | `goals/` | new | wraps 21h `LibraryScreen` |
| `NewGoalScreen` | `goals/` | new | G5 modal |
| `ExerciseHistoryScreen` | `exercise-history/` | new | X2 |
| `TrendChart` | `exercise-history/` | new | Views only; no new native module |
| `RecordsCard`, `SessionList`, `ExerciseGoals` | `exercise-history/` | new | X2 sections |
| `InsightBlock`, `ProgressChip`, `ProNote` | `insights/` | reused | 21g |
| `LibraryScreen`, `ExerciseScreen` | `library/` | reused, one row changed | 21h |
| `LoggedWorkoutScreen` | `history/` | reused | 21e/21f |

## 11. Accessibility, privacy, and data sensitivity

- Every row is one VoiceOver element with a full sentence ("Bench Press, 225 pounds times 5, 85 percent").
- Chips always carry words; deload chart points differ by shape.
- The chart has a text alternative (summary label and "Show values").
- 44-pt targets; chart selection works by tap, not only by drag.
- Gym names appear (they are not addresses). No address, share, or export affordance anywhere.

## 12. Out of scope

From the pitch: new formulas, new record kinds, goal suggestions, dated goals, more chart types, dashboards, sharing, account settings (21j), native tour (21k), TestFlight (21l), billing, Android. Deferred to a later native pass: the Weight trend view and the projected-RIR overlay (web only, RD-6), and Today's goals block (RD-8). Permanent non-goals: AI coach, social, ads, dated goals, rest timer, cardio progression.

## 13. User guidance

The native tour (21k) and native What's New (21j) don't exist. No tour step or release note (as 21g and 21h). Recorded as a Resolved Decision in the spec.

## 14. Plan placement and client scope

**Plan placement.** Free: goals (list, set, archive, history, progress percent, best session, target e1RM), every logged session with sets and RIR, best set, heaviest weight, most reps, the reps trend for bodyweight lifts, and links to logged workouts. Pro (withheld by the server, as on the web): the e1RM trend (`e1rm_trends`), best e1RM (`e1rm_trends`), rep records and per-session calls (`exercise_history_intelligence`), and "Next time" (`progression_insights`). A Free lifter sees the 21g quiet Pro note, with no purchase link, only when something was withheld.

**Client scope.**

| Surface | Shared logic | API | Web UI | Mobile UI | Why |
| --- | --- | --- | --- | --- | --- |
| Goals list, history, detail | goal progress (unchanged) | new reads (reconcile first, as the web pages) | unchanged | new G1–G3 | pitch §5.1–5.5 |
| Set / archive / acknowledge goal | goal parser (unchanged) | new writes; create retry-safe | unchanged | new G4, G5, G3 | pitch §5.2, §5.4 |
| Exercise history | history module (unchanged) | new gated read, serialized as-is | unchanged | new X2 + chart | pitch §5.6–5.10 |
| X1 history row | — | — | unchanged | row becomes native | pitch §5.11 |

## 15. Mobile design (the native visual contract)

Built with `overload-mobile-ui` on the 21d–21h system: `TabScreen` for G1, the system back header for pushed screens, `Surface` cards, `Chip` words, `GroupedList` rows, tokens only, tabular figures, 16-point gutters. The visual review artifact (key screens and states in light and dark, illustrative data labelled as such) is the design canvas https://claude.ai/artifact/4TV52JUVhE5TrH6YveNbk3 (spec RD-19). Where it and the layouts below differ, the layouts and tables in this document win.

### G1 Goals — Goals tab root

```text
┌──────────────────────────────────┐
│ STRENGTH TARGETS                 │
│ Goals                            │
│ ┌──────────────────────────────┐ │
│ │ ✓ Goal reached               │ │
│ │ Deadlift · 405 lb × 1        │ │
│ │ [ Set a new goal ]   Done    │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ Bench Press              85% │ │
│ │ 225 lb × 5                   │ │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░         │ │
│ ├──────────────────────────────┤ │
│ │ Leg Press · Downtown Gym     │ │
│ │ 400 lb × 10                  │ │
│ │ No performance recorded yet  │ │
│ └──────────────────────────────┘ │
│ Goal history (3)               › │
│ [          New goal          ]   │
└──────────────────────────────────┘
```

States: loading (skeleton), empty ("No goals yet." + New goal), error (`LoadErrorState`), unreachable (cached list + banner). Differs from the web: the web puts New goal in a fixed bottom bar on phones; native keeps it at the end of the content above the tab bar so it never sits on the system tab bar.

### G3 Goal — Goals stack

```text
┌──────────────────────────────────┐
│ ‹ Goals             Goal         │
│ Bench Press                      │
│ Goal · set Oct 12, 2026          │
│ 225 lb × 5                  85%  │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░             │
│ ┌──────────────────────────────┐ │
│ │ Best     214 lb e1RM         │ │
│ │          from 195 × 5 · Nov 18│ │
│ │ Target   253 lb e1RM         │ │
│ └──────────────────────────────┘ │
│ Best session across all gyms.    │
│ Epley estimate, same as the trend│
│ ┌──────────────────────────────┐ │
│ │ Exercise history           › │ │
│ └──────────────────────────────┘ │
│ Archive goal                     │
└──────────────────────────────────┘
```

### G5 Set goal — modal

```text
┌──────────────────────────────────┐
│ Cancel        New goal           │
│ [img] Leg Press                  │
│       Quads · Machine            │
│ Measured at                      │
│ (Downtown Gym) ( Harbor )        │
│ Target weight     Target reps    │
│ [   400   ] lb    [   10   ]     │
│ Progress is your best session's  │
│ e1RM against this target's.      │
│ [          Set goal          ]   │
└──────────────────────────────────┘
   decimal keypad with Next / Done
```

### X2 Exercise history — any stack, or over the workout

```text
┌──────────────────────────────────┐
│ ‹ Exercise      History          │
│ Barbell Bench Press              │
│ Chest · Barbell                  │
│ About this exercise            › │
│ NEXT TIME                        │
│ [Progress] Add 5 lb: 190 lb      │
│ RECORDS                          │
│ Best set        185 × 8 lb Nov 18│
│ Best e1RM       234 lb (estimate)│
│ Heaviest        195 × 3   Oct 30 │
│ Rep records  195·3  185·8  175·10│
│ TREND · e1RM        Current 234 lb│
│ ┌──────────────────────────────┐ │
│ │      (line chart)            │ │
│ └──────────────────────────────┘ │
│ Nov 18 · 234 lb · 185 × 8, 8, 7  │
│ SESSIONS                         │
│ Nov 18 · Push           Progress │
│ 185 × 8, 8, 7    RIR 2, 1, 0     │
│ Nov 11 · Push               Hold │
│ 180 × 8, 8, 8                    │
│ View all 14 sessions             │
│ GOALS                            │
│ 225 lb × 5                  85% ›│
└──────────────────────────────────┘
```

Free: Next time and the rep records are absent, Best e1RM reads "— Part of Pro", the chart is replaced by "The e1RM trend is part of Pro.", and session calls are blank; the Pro note sits where Next time would be. Machine: the gym row under the header. Differs from the web: the web shows Next time, records, trend, sessions, goals, About in one page; native keeps that order but moves "About" to a row at the top because X1 already shows it.
