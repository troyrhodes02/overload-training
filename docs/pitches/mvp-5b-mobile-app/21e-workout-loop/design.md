# Workout Loop — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 21e: Workout Loop (`pitch.md` in this folder)
**Focus:** Today, the native logging card, finishing a workout with a basic summary, and all-time History on the iPhone app, on the same records the web shows.

> All styling inherits from Overload's design tokens (`@overload/shared/design/tokens`) through the native theme from Pitch 21d (`apps/mobile/src/ui/theme.ts`). This design doc only defines feature-specific usage, variants, and states. The web's Tailwind and shadcn/ui system is untouched: this slice adds no web screen.

> **The native visual contract lives in §15 (Mobile design).** A mobile-only slice has no `preview.tsx` (pipeline guide §5 step 3; `overload-mobile-ui`), so step 3 is recorded as skipped. The owner approves the design on the simulator and the iPhone at the runbook's checkpoints, before the feature branch merges into `staging`.

---

## 1. Vision

The phone in the lifter's hand answers three questions in order: what am I doing today, what did I lift last time in *this* workout, and did that set save. Everything the app shows about weights comes from the server, which already knows which history belongs to which recurring workout; the phone's job is to put the right number in the box, or leave the box honestly empty, and get out of the way.

**North star:** *the set saves, or it says so.*

## 2. Design principles

### 1. The server decides, the card displays
The offered weight, the "Last time" line, the reference line, completion, and every week of History are the server's answers. The app never picks a weight from history, never compares rep ranges, and never decides that two workouts are the same workout. When the server says there is nothing trustworthy, the weight box is empty.

### 2. Saved means the server said so
A row turns logged only when the server confirms the set. Until then it is a draft (typed numbers) or saving (a spinner on the button). A failed save keeps the numbers and says why. There is no "probably saved" state and no offline queue.

### 3. A reference is not an offer
Another workout's numbers appear as one quieter line under the context line, starting "For reference:". They never fill the weight box, never get a caption under the box, and never look like the box's value.

### 4. Thumb first, keypad aware
Weight and reps are the largest things on the logging screen. The decimal keypad for weight and the number keypad for reps, with a bar above the keypad that moves forward and logs the set, so the primary action is always just above the thumb and never under the keyboard.

### 5. Honest edges
Swaps, skips, gym changes, RIR, past-set edits, missed days, and cardio belong to 21f. Where a workout needs one of them, the app says so in one sentence and links to the web. It never hides or rewrites a record to make it fit.

## 3. Visual language

### Color palette

| Token | Usage | Notes |
| --- | --- | --- |
| `background` | screen background | |
| `card` | exercise card, Today's workout card, grouped History rows | |
| `foreground` | exercise names, logged values, input values | |
| `mutedForeground` | context line, reference line, captions, dates, "Not done" | the reference line is `xs` in this color |
| `primary` / `primaryForeground` | Start or Resume workout, Log set, Finish workout, logged-row check | |
| `secondary` | Previous, the week arrows, "Open on the web" | |
| `border` / `input` | input borders, separators | |
| `ring` | the focused input's border | |
| `destructive` | field errors and the failed-save message | |
| `muted` | the saved-row background tint, the dimmed missed-day block | |

### State colors

| State | Visual treatment | Usage |
| --- | --- | --- |
| Draft set | active row with two inputs; no badge | typed, not saved |
| Saving | Log set shows a spinner and "Saving…"; inputs read-only | request in flight |
| Saved set | a plain row with the values and a `checkmark` symbol in `primary`; VoiceOver "logged" | server confirmed |
| Failed save | the numbers stay in the inputs; one `destructive` line under the row | nothing saved |
| Workout pending / in progress / done | plain text labels "Today", "In progress", "Done" | Today and History |
| Skipped / shifted / upcoming (History) | plain text labels in `mutedForeground` | from the server's week states |
| Progress / deload tags | **not shown in this slice** | 21g |

Color always pairs with text or a symbol. No state is color-only.

### Typography, spacing, radius, elevation

The 21d scale, plus one variant: **set-entry numerals** are `xl` (20/28) semibold tabular figures inside 52-point-tall inputs on the active row, and logged rows use `base` tabular figures. Everything else uses the 21d sizes. Every number uses tabular figures.

### Appearance

Light, dark, and system, applied by the 21d theme. Every new surface uses tokens only, so both appearances follow; the decimal and number keypads follow the system appearance the theme already sets.

## 4. Information architecture

```text
Signed-in shell (21d): system tab bar
┌───────────────────────────────────────────────────────────────┐
│ Today (stack)                                                 │
│   T1 Today ── [Start workout] ─► (gym sheet when 2+ gyms) ─┐  │
│              [Resume workout] ───────────────────────────────┤ │
│              [View workout] (done) ─► H2 (History tab)       │ │
│ History (stack)                                              │ │
│   H1 History week ‹ › ─► H2 Logged workout (read-only)       │ │
│      Earlier blocks ─► H1 at that block's first week         │ │
│ Plan · Goals · More   (unchanged 21d placeholders and More)  │ │
└──────────────────────────────────────────────────────────────┼─┘
                                                               ▼
  Over the tabs (root stack, tab bar hidden while logging):
   W1 Workout ── one exercise card at a time, ‹ Previous · Next › 
        └─ [Finish] ─► confirm (if unfinished) ─► S1 Summary
   S1 Summary ── [Done] ─► Today   [View in History] ─► H2
```

The workout and the summary sit above the tabs so the keypad, the card, and Log set get the whole screen and no tab switch can happen mid-set. Back from the workout returns to the tab that opened it.

## 5. Surfaces affected

| Surface | Change |
| --- | --- |
| T1 Today tab | placeholder → the real dashboard |
| W0 Start | new: start or resume; a gym action sheet only when the account has two or more active gyms |
| W1 Workout | new screen over the tabs: the logging card, one exercise at a time |
| S1 Summary | new screen over the tabs after Finish |
| H1 History tab | placeholder → week-by-week, all-time |
| H2 Logged workout | new, read-only, in the History stack (Today's View workout opens it there) |
| Web | none. The web's screens, actions, and behavior are unchanged |

## 6. Screen specifications

The layouts, native components, and states for each screen are in §15. This section fixes purpose, trigger, content, and behavior.

### Screen T1: Today

**Purpose.** Show today's training state and the one action that matters.

**Trigger.** The Today tab (the app's home after sign-in), and returning to the app (it refetches on foreground).

**Content by server state** (the dashboard's `kind`; nothing is derived on the phone):

| State | Shows | Primary action |
| --- | --- | --- |
| Pending | the greeting, the date, the workout card: name, "Week N · M exercises", each exercise with its scheme ("3 × 8–10") | **Start workout** |
| In progress | the same card, "Week N · 2 of 4 exercises logged", done exercises with a check and muted | **Resume workout** |
| Done | "Push · Done", "4 of 4 exercises logged", the exercise names with their checks | **View workout** (secondary) → H2 |
| Rest (no lifting) | "No lifting planned today." / "Rest up." | none; History is a tab away |
| Rest with planned cardio | the rest card, then each cardio item as a read-only line ("Run · 30 min") with "Cardio logging comes to the app in a later update." | none |
| No active plan | "No active plan." / "Build and activate a plan on the web to start training." | **Open Overload on the web** (secondary) |
| Missed day | "You missed Push on Tuesday." / "Choose log it late, shift, or skip on the web, then today's workout opens here." | **Open Overload on the web**; the day below shows dimmed and inert, exactly as on the web |

The date line is the account's date (`today` from the server, formatted with the 21d date wording), never the device's.

**Not on Today in this slice:** progress or deload tags, suggested loads, the scheduled-deload banner, the day-complete progression summary, the goals block, goal rows, and the Pro note. They are 21g (and goals 21i). A Pro and a Free account see the same Today.

**Loading.** A skeleton shaped like the workout card under the title. **Error.** The 21d StateView with the server's message and **Try again**. **Unreachable with cached data.** The last loaded Today stays, with a one-line banner "Can't reach Overload. Showing what was last loaded."; Start is disabled until a refetch succeeds.

**Behavior.** Pull to refresh. Today never advances to tomorrow's workout after a finish: the server keeps the day "Done".

### Screen W0: Start or resume

**Purpose.** Turn the planned workout into a logged one, or reopen the one already started.

**Behavior.**
- **Resume** opens W1 for the workout the server already has. No request is made to start it again.
- **Start** asks the server to start or resume this occurrence (the same call the web makes; a repeat returns the same workout). The workout needs a gym:
  - **one active gym:** it is used; no question;
  - **two or more:** a native action sheet "Where are you training?" lists them alphabetically, plus Cancel. Choosing one starts the workout;
  - **none:** the start is refused before any request with an inline note "Add the gym you train at on the web first." and **Open Overload on the web**.
- While starting, the button shows a spinner. On failure, an inline banner with the server's message (for example "That workout's day hasn't come yet.") and the button is available again. Starting twice is harmless: the server returns the same workout.
- Changing the gym after the start, and the gym on gym-variable exercises, are 21f. The chosen gym is shown on W1.

### Screen W1: Workout (the logging card)

**Purpose.** Log each planned set of the current exercise, then move on.

**Trigger.** Start or Resume on Today, or an in-progress workout in History.

**Opens on** the first exercise that still has an unlogged planned set (skipped and unavailable exercises are passed over), or the last exercise when everything is logged. Previous and Next move one exercise at a time, as on the web; there is no exercise list to jump around (Jump to Exercise is a separate feature, and the screen keeps room for it).

**Header (navigation bar).** Title: the workout name. Subtitle line under the bar: the date ("Saturday, November 15", or "Tuesday, November 11 · a past day" for a late log) and the gym. Right: **Finish**, enabled once any set is saved. Position "2 / 4" sits beside the exercise name.

**The card, top to bottom:**
1. Exercise name (the performed exercise), and "3 × 8–10" (the copied plan: planned sets × the rep target, a single target reads "3 × 5"). A bodyweight exercise adds "· bodyweight, reps only". A gym-variable exercise shows the gym name.
2. **Context line** (`sm`, muted) and, only when the server sends one, the **reference line** (`xs`, muted), both worded by the shared `formatCardContext` so the web and the phone say the same words:
   - trusted: "Last time in Push · Nov 8 · 255 × 5, 5, 4";
   - reference only: "Nothing logged in Upper at 6–8 reps yet." then "For reference: Push · 3–5 reps · Nov 8 · 255 × 5, 5, 4";
   - deload week with no comparable history: "Nothing logged in Upper for a deload week yet." then the reference line if one exists;
   - nothing: "First time logging this." (or "First time on this at Downtown Gym." for a machine or cable).
3. **Set rows**, 1 to the planned count, then any extra sets already logged on the web ("extra"):
   - **logged:** "Set 1 · 255 lbs × 5" with a check (and "· 2 RIR" when the web recorded one). Read-only in this slice;
   - **active** (the lowest unlogged planned set): a weight input with "lbs" and a reps input with "reps". The weight box holds the **offer**: the weight of the highest set already saved on this card ("same as set 1"), else the server's trusted weight ("last time"), else nothing. The caption sits under the weight box only while the lifter hasn't typed over it. Reps are never offered;
   - **upcoming:** "Set 3" with a dash.
4. **Log set N** (primary, full width) under the active row, and the same action on the keypad bar.
5. Footer: **Previous** and **Next: Incline Dumbbell Press**. On the last exercise, Next becomes **Finish workout**.

**The weight offer, state by state** (the server's `weightContext` and `suggestedWeightLbs`; the app adds nothing):

| Server says | Weight box on set 1 | Caption | Context lines |
| --- | --- | --- | --- |
| trusted, with a weight | that weight, e.g. 255 | "last time" | "Last time in Push · …" |
| trusted, bodyweight | no weight box | — | "Last time in Pull · … · 12, 10, 9 reps" |
| reference only | **empty** | none | "Nothing logged in Upper at 6–8 reps yet." + "For reference: …" |
| none | **empty** | none | "First time logging this." |
| any value the app doesn't recognize | **empty** | none | the context line from what was sent |

From set 2 on, the box offers the last saved set's weight ("same as set 1") in every state, because that weight was just lifted and confirmed in this workout. A failed or unsaved set never sets the offer.

**Save states (per active row):**
- **Draft:** the inputs; Log set enabled.
- **Checking:** the shared weight and reps rules run first, with the web's messages ("Enter a weight above 0.", "Use at most two decimal places.", "Enter reps above 0."). The field turns `destructive`, the message sits under it, and focus returns to it. Nothing is sent.
- **Saving:** Log set shows a spinner and "Saving…"; the inputs are read-only; a second tap does nothing.
- **Saved:** the server's set appears as a logged row with a check, a light haptic, and focus moves to the next set's reps (its weight box already offers the same weight). After the last planned set the keypad closes and Next (or Finish workout) becomes the obvious next tap.
- **Failed, no connection or no answer:** "Couldn't save — Overload needs a connection. Your numbers are still here." The numbers stay; tapping Log set again resends the same set. If the first attempt had actually reached the server, the repeat is recognized as the same set and simply shows it saved.
- **Already logged elsewhere** (the set was saved from the web or with different numbers): "Set 2 was already logged." and the card refreshes to show the server's set.
- **Workout already finished elsewhere:** "This workout is already finished." and the card refreshes to its finished state.

**Exercises the app can't log in this slice (honest edges):**
- **Marked "Didn't do" on the web:** "Not done today." and "To log it, undo that on the web." No inputs.
- **Archived planned exercise with no substitute:** "Unavailable — this exercise was archived." and "Swap it on the web, or finish without it." No inputs.
- **Extra sets** beyond the plan are shown when the web logged them; adding one is 21f.
- **Correcting a logged set** is 21f; History says where to do it on the web.

**Loading.** The card's skeleton keeps the layout so nothing jumps under the thumb. **Error.** StateView with **Try again**. **Unreachable after load.** The card stays; saving fails with the connection message above.

### Screen F1: Finish

**Purpose.** End the workout through the server's own rule.

**Behavior.**
- Finish (nav bar) or **Finish workout** (last card) is enabled once any set is saved, the same as the web.
- If any exercise is unfinished, a system alert first: title "Finish with unfinished exercises?", message lists each one ("Incline Dumbbell Press — not done", "Lateral Raise — 1 of 3 sets") and "Exercises with no sets are recorded as not done. Partly logged ones keep what you logged." Buttons **Keep logging** and **Finish workout**.
- Finishing shows a spinner on the button. On success: a success haptic, and the workout is replaced by S1 (Back from the summary goes to the tab the workout came from).
- On failure: an inline banner "Couldn't finish — Overload needs a connection. Your sets are saved." with the button available again. Finishing twice is harmless: the server keeps the first finish.

### Screen S1: Summary

**Purpose.** Confirm the workout was recorded and what was done.

**Content** (from the server's record of the finished workout): a check symbol, "Push complete", the date and gym, "4 exercises · 11 sets" (exercises with at least one set, and saved sets), and one row per exercise with the shared set summary ("255 × 5, 5, 4", "12, 10, 9 reps", or "Not done"). **Done** (primary) returns to Today; **View in History** opens H2.

**Not in the basic summary:** progression calls, the e1RM chart, goal percentages, a duration, and any Pro note. The full summary is 21g; a duration has no reliable source (a workout can be started long before the first set).

### Screen H1: History

**Purpose.** Find any logged workout, from this week back to the first one.

**Content.** The server's week: a header with ‹ and ›, the week's range ("Nov 10 – 16"), and its subtitle (the active block: "Push Pull Legs · Week 3 of 5"; a past week: the blocks whose work it holds). Then the days in order:
- **active-block week:** each scheduled day with its state (Upcoming, In progress, Done, Skipped, Shifted) and the planned cardio as read-only lines;
- **logged week** (outside the active block): each day that has a logged workout or cardio, showing only what was logged.

A day with a workout opens H2. **This week** (text button) appears when another week is shown. Below the days, **Earlier blocks**: each past block with logged work and its range; tapping one opens H1 at that block's first logged week. ‹ stops at the week of the first logged workout; › stops at this week (or the active block's last week).

**Empty.** No workout ever and no active plan: "No workouts yet." / "Your logged workouts appear here." A week with nothing logged: "Nothing logged this week."

**Loading.** First load: skeleton rows. Moving to another week: the header changes at once, the previous week's rows dim with a small spinner until the new week arrives. **Error.** StateView with **Try again**, keeping the header so the lifter can move on.

### Screen H2: Logged workout

**Purpose.** Read exactly what was logged.

**Content.** Title: the workout name. Under it: the date and gym, and "In progress" when the workout isn't finished. One section per exercise: its performed name, "swapped from …" when it was swapped, "archived" when its exercise is archived, then each set ("Set 1 · 255 lbs × 5", "· 2 RIR" when recorded, "extra" beyond the plan) or "Not done". Read-only.

**Actions.** For an in-progress workout: **Resume workout** (opens W1). Always: **Edit on the web** (text button, opens this workout's page on the web) with the footer "Correcting a set comes to the app in a later update."

**Archived records** render by name, never "Unknown", and never disappear.

## 7. Navigation flows

```text
App opens (signed in) → T1 Today
  pending  → [Start workout] → (gym sheet if 2+) → W1 at exercise 1
  in prog. → [Resume workout] → W1 at the first unfinished exercise
  done     → [View workout] → H2

W1 → log sets → [Next: …] → … → last card → [Finish workout]
   → (alert if unfinished) → S1 Summary → [Done] → T1 (shows Done)
                                        → [View in History] → H2

History tab → H1 this week → ‹ earlier weeks … → Earlier blocks → H1 (that block)
   → a day → H2 → (in progress) [Resume workout] → W1

Force-close mid-workout → reopen → T1 shows In progress → [Resume] → W1
   (every saved set is there; unsaved drafts are not)
```

W1 and S1 are full-screen pushes over the tabs. H2 is a push in the History stack; Today's "View workout" opens it there. No deep link performs an action.

## 8. Interaction specifications

**Keypad.** Weight uses the decimal pad, reps the number pad. Neither has a Return key, so a native keypad bar sits on top of the keypad: on the weight field **Next** (to reps); on the reps field **Log set**. Log set from the bar behaves exactly like the button on the card.

**Focus.** Nothing is focused when W1 opens. Tapping an input focuses it. After a saved set, focus moves to the next set's reps (the weight is offered); if its weight box is empty, to the weight. After the last planned set, the keypad closes. Previous and Next keep the keypad closed.

**Keyboard avoidance.** The card scrolls so the active row and Log set stay above the keypad bar on every iPhone size from SE up. Tapping outside the inputs closes the keypad.

**Haptics.** A light impact when a set saves; a success notification when the workout finishes; a warning notification on a field error or a failed save. Nothing else.

**Loading.** Skeletons shaped like the content; button spinners keep the button's width; no spinner flashes for under about 300 ms.

**Errors.** Inline, next to what failed, in `destructive`, announced to VoiceOver. No toasts. A failed save never clears typed numbers.

**Repeated taps.** Log set, Start, and Finish ignore taps while their request is in flight. Every one of the three is safe to repeat at the server anyway.

**Lifecycle.** On returning to the foreground, Today, the workout, and History refetch. Drafts (typed, unsaved numbers) live only while the workout screen is open; a force-close keeps every saved set and drops drafts, which is the honest online-only behavior.

**Destructive actions.** None. Finishing with unfinished exercises is confirmed because it records them as not done.

## 9. Responsive behavior

iPhone portrait, SE (375 points) to Pro Max. The active row's two inputs sit side by side down to 375 points; at the largest Dynamic Type sizes they stack (weight above reps) rather than clip. Landscape works but isn't designed for. iPad runs the iPhone layout.

## 10. Component inventory (native, `apps/mobile/src`)

| Component | Location | New / reused | Notes |
| --- | --- | --- | --- |
| `StateView`, `GroupedList`, `ListRow`, `Button`, `Text`, `Banner`, `Symbol` | `ui/` | reused (21d) | |
| `TodayWorkoutCard` | Today | new | pending, in progress, done |
| `ExerciseCard` | W1 | new | variants: normal, bodyweight, not done, unavailable |
| `SetRow` | W1 | new | logged, active (draft, checking, saving, failed), upcoming, extra |
| `NumberField` | W1 | new | large tabular input with unit suffix, error line, caption |
| `KeypadBar` | W1 | new | Next / Log set above the keypad |
| `WeekHeader` | H1 | new | ‹ range › with subtitle |
| `Skeleton` | `ui/` | new | a muted block for loading layouts |
| `haptic.light` | `ui/haptics` | extended | the set-saved haptic |

## 11. Accessibility, privacy, and data sensitivity

- Every input has a label: "Set 2 weight in pounds", "Set 2 reps" (the web's labels). A logged row reads "Set 1, 255 pounds, 5 reps, logged".
- The offered weight is announced with its caption ("255, last time"); the reference line is announced as "For reference, …" and is not part of any input's label.
- Save state is announced: "Saving set 2", "Set 2 saved", or the failure message.
- Dynamic Type scales every text and input; layouts wrap and stack, never clip. Reduce Motion: no animation is required to understand a state.
- Gym addresses never appear in this slice; gym names only.
- No sharing, no other account's data, no tracking.

## 12. Out of scope

**21f:** changing the gym after starting, gym-variable baseline management, swap, skip and undo, RIR entry, adding an extra set, correcting a logged set or the planned-set count, the missed-day prompt's choices, cardio logging, and the full bodyweight and fixed-target experience. **21g:** progress, hold, and deload tags and evidence, suggested loads, the scheduled-deload banner, the full summary, and the Pro note. **21i:** goals on Today and in the summary. **Separate pitches:** Jump to Exercise, the History Calendar, Exercise History Contexts, Planned Workout Guidance, Deload Customization. **Later mobile slices:** plans, library, goals, wing-it, offline logging, notifications, Watch, Android, TestFlight.

**Permanent non-goals:** program generation, an AI coach, social features, ads, dated goals, a rest timer, cardio progression.

## 13. User guidance

- **Tour steps:** none. The web tour's anchors are web controls; the native tour is slice 21k, which will anchor to these screens.
- **Release note:** none in this slice. The app is a staging development build; What's New is a web surface and the app shows none until 21j. A note announcing a feature no lifter can install would be wrong. The beta slice (21l) announces the app.

## 14. Plan placement and client scope

**Plan placement: Free.** Starting, logging, finishing, the trusted weight offer, the reference line, the summary, and all-time History are capture and history, which are Free and never gated. No Pro surface is added, so there is no locked state; a Pro account sees the same screens. The server keeps computing gated calls where its existing views do, and the app shows none of them.

**Client scope: mobile, with additive mobile API endpoints.**

| Surface | Shared logic | API | Web UI | Mobile UI | Why |
| --- | --- | --- | --- | --- | --- |
| Today | the dashboard (server), date wording | existing `today` | none | T1 | the same view the web renders |
| Start / resume | the server's start rule | new: start a workout | none | W0 | the web's start action, over the API |
| Logging card | `formatCardContext`, `offerFor`, `activeSetNumber`, weight and reps rules | new: the workout; log a set | none | W1 | the card rules are already shared |
| Finish | the server's completion rule | new: finish a workout | none | F1 | the same completion as the web |
| Summary | `formatSetSummary` | the logged-workout read | none | S1 | from the finished record |
| History | the week (server) | new: a history week; a logged workout | none | H1, H2 | the web's all-time week, over the API |

## 15. Mobile design (the native visual contract)

Built with `overload-mobile-ui` on the 21d system. Tokens only; tabular figures everywhere; 16-point gutters; cards on `card` with `radius.lg`, grouped lists with `radius.xl`.

### T1 Today — Today tab root (large title)

```text
┌──────────────────────────────────┐
│ Today                            │ large title
│ Good morning, Sam.               │ greeting (base)
│ Saturday, November 15            │ sm muted (account date)
│ ┌──────────────────────────────┐ │
│ │ Push                         │ │ lg semibold
│ │ Week 3 · 4 exercises         │ │ sm muted
│ │                              │ │
│ │ Barbell Bench Press   3 × 3–5│ │ base / sm muted, tabular
│ │ Incline Dumbbell Press 3×8–10│ │
│ │ Shoulder Press       2 × 6–10│ │
│ │ Lateral Raise       3 × 12–15│ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │        Start workout         │ │ primary, 48
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│ Today  History  Plan  Goals  More│ system tab bar
└──────────────────────────────────┘
```

- **In progress:** "Week 3 · 2 of 4 exercises logged"; done exercises show `checkmark` and muted names; the button reads **Resume workout**.
- **Done:** the card title "Push · Done", "4 of 4 exercises logged", the names with checks; a secondary **View workout**. No primary button.
- **Rest / rest with cardio / no plan / missed day:** a `StateView` card (icons `moon.zzz`, `figure.run` for the cardio lines, `list.bullet.rectangle`, `calendar.badge.exclamationmark`) with the §6 copy; the missed day's planned card below at 50% opacity and not pressable; **Open Overload on the web** where §6 says.
- **Two or more gyms:** Start opens a native action sheet (`ActionSheetIOS`) "Where are you training?" with the gym names and Cancel. An action sheet is the native pattern for a short choice.
- **Loading:** a skeleton card (title bar, four rows) and a skeleton button. **Error / unreachable:** §6. Pull to refresh.
- **Differs from the web:** no tags, suggested loads, deload banner, goals, or Pro note (21g/21i); the web's separate start page for the gym becomes an action sheet only when a choice exists.

### W1 Workout — root stack, over the tabs (standard title, no tab bar)

```text
┌──────────────────────────────────┐
│ ‹ Today         Push       Finish│ nav bar; Finish enabled after a set
│ Saturday, November 15 · Downtown │ xs muted
│ ┌──────────────────────────────┐ │
│ │ Barbell Bench Press     1 / 4│ │ lg semibold · position xs muted
│ │ 3 × 3–5                      │ │ sm muted
│ │ Last time in Push · Nov 8 ·  │ │ sm muted (wraps)
│ │   255 × 5, 5, 4              │ │
│ │──────────────────────────────│ │
│ │ Set 1   255 lbs × 5        ✓ │ │ logged row, base tabular
│ │ Set 2  ┌───────┐  ┌───────┐  │ │ active row: 52-tall inputs
│ │        │ 255   │lbs│      │reps│ │ xl semibold tabular
│ │        └───────┘  └───────┘  │ │
│ │        same as set 1         │ │ xs muted caption (offer only)
│ │ Set 3   —                    │ │ upcoming
│ │ ┌──────────────────────────┐ │ │
│ │ │        Log set 2         │ │ │ primary, 48
│ │ └──────────────────────────┘ │ │
│ └──────────────────────────────┘ │
│ ┌────────┐ ┌───────────────────┐ │
│ │Previous│ │Next: Incline DB P…│ │ secondary / primary when sets done
│ └────────┘ └───────────────────┘ │
└──────────────────────────────────┘
┌──────────────────────────────────┐
│                         Log set ▸│ keypad bar (InputAccessoryView)
│  1   2   3                       │ number pad (reps)
│  4   5   6                       │
└──────────────────────────────────┘
```

**Reference-only variant** (Upper, first time at 6–8):

```text
│ │ Barbell Bench Press     1 / 5│ │
│ │ 3 × 6–8                      │ │
│ │ Nothing logged in Upper at   │ │ sm muted
│ │   6–8 reps yet.              │ │
│ │ For reference: Push · 3–5    │ │ xs muted, a separate line
│ │   reps · Nov 8 · 255 × 5,5,4 │ │
│ │──────────────────────────────│ │
│ │ Set 1  ┌───────┐  ┌───────┐  │ │ weight box EMPTY, placeholder "lbs"
│ │        │       │lbs│      │reps│ │ no caption
```

- **Native patterns:** a `ScrollView` that keeps the active row above the keypad (`automaticallyAdjustKeyboardInsets`); `TextInput` with `keyboardType="decimal-pad"` and `"number-pad"`; an `InputAccessoryView` keypad bar (Next / Log set); `Alert.alert` for the unfinished-exercise confirmation; `expo-haptics` light impact on a saved set and success on finish. All from React Native and the build's existing modules.
- **Save failure** sits under the active row: `destructive`, `sm`, the numbers kept. **Saving:** Log set's spinner; inputs non-editable.
- **Not done / unavailable / bodyweight** variants replace the set area as §6 describes (bodyweight: one reps input, no lbs box).
- **Loading:** skeleton card with three row placeholders. **Error:** StateView with Try again. **Unreachable:** writes fail inline; the card stays.
- **Differs from the web:** Finish also lives in the nav bar (the iOS place for a screen's completion action); the keypad bar replaces Enter; no Swap, Didn't do, RIR chips, Add set, Change gym, tags, or recommendation (21f/21g); logged rows aren't tappable (correction is 21f).

### S1 Summary — root stack, over the tabs (no back arrow; Done returns)

```text
┌──────────────────────────────────┐
│               ✓                  │ checkmark.circle, 44, primary
│          Push complete           │ xl semibold
│ Saturday, November 15 · Downtown │ sm muted
│      4 exercises · 11 sets       │ sm tabular
│ ┌──────────────────────────────┐ │
│ │ Barbell Bench Press  255×5,5,4│ │ grouped list, value muted tabular
│ │ Incline DB Press   70×10,9,8 │ │
│ │ Shoulder Press       95×8,7  │ │
│ │ Lateral Raise        Not done│ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │             Done             │ │ primary 48
│ └──────────────────────────────┘ │
│          View in History         │ text button
└──────────────────────────────────┘
```

- Calm: no confetti, no animation beyond the system push. Loading: the header shows at once from the finished workout, the list from the record (skeleton rows meanwhile). Error loading the list: the header stays with "Couldn't load the details. Your workout is saved." and **Try again**.
- **Differs from the web:** the web returns to Today's day-complete block (with gated calls); the phone shows this basic confirmation and Today shows "Done".

### H1 History — History tab root (large title)

```text
┌──────────────────────────────────┐
│ History                          │ large title
│ ┌──┐   Nov 10 – 16         ┌──┐  │ week header: secondary 44×44 arrows
│ │‹ │ Push Pull Legs · Wk 3/5│ ›│  │ sm muted subtitle
│ └──┘                       └──┘  │
│                    This week ▸   │ text button (other weeks only)
│ ┌──────────────────────────────┐ │
│ │ Mon, Nov 10  Push     Done  ›│ │ grouped list rows
│ │ Wed, Nov 12  Upper    Done  ›│ │
│ │ Thu, Nov 13  Run · 30 min    │ │ cardio, read-only
│ │ Fri, Nov 14  Legs   Skipped  │ │
│ │ Sat, Nov 15  Push  In prog. ›│ │
│ └──────────────────────────────┘ │
│ EARLIER BLOCKS                   │ section header
│ ┌──────────────────────────────┐ │
│ │ Block 2 · Sep 1 – Oct 5     ›│ │
│ │ Block 1 · Jul 7 – Aug 10    ›│ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

- **Native patterns:** a grouped list; arrow buttons with VoiceOver "Previous week" / "Next week" (disabled at the bounds); pull to refresh. Swiping between weeks is not added (buttons are always reachable; a swipe could be a later addition).
- **Loading / empty / error:** §6. **Differs from the web:** the same week and states, laid out as a grouped list; the web's tour anchors don't apply.

### H2 Logged workout — History stack, standard title

```text
┌──────────────────────────────────┐
│ ‹ History        Push            │
│ Saturday, November 8 · Downtown  │ sm muted
│ ┌──────────────────────────────┐ │ (In progress → Resume workout button)
│ BARBELL BENCH PRESS              │ section header
│ │ Set 1           255 lbs × 5  │ │
│ │ Set 2           255 lbs × 5  │ │
│ │ Set 3      255 lbs × 4 · 1 RIR│ │
│ INCLINE PRESS · SWAPPED FROM …   │
│ │ Not done                     │ │
│ └──────────────────────────────┘ │
│ Correcting a set comes to the    │ xs muted footer
│ app in a later update.           │
│          Edit on the web ↗       │ text button
└──────────────────────────────────┘
```

- Read-only rows (no press state). Loading: skeleton sections. Not found (another account's id, or a removed workout): StateView "This workout isn't available." with **Back to History**.

### States checklist (every new screen)

Loading (skeletons or a button spinner), empty (H1; T1's rest and no-plan), error (StateView with Try again), unreachable (inline save failures, the Today banner, and the 21d G4 gate at launch), locked (none: no Pro surface), and the version gate (21d G2). A failed save never discards what the lifter typed.

### Differences from the web, and why (summary)

- The workout runs over the tabs, so the keypad, the card, and Log set own the screen.
- A keypad bar replaces Enter, because iOS numeric keypads have no Return key.
- Errors are inline and haptics confirm saves; no floating toasts (`overload-mobile-ui`).
- The gym question is an action sheet, asked only when there is a choice.
- Insight, correction, and completeness features are absent until 21f/21g, and each edge says where to go on the web.
