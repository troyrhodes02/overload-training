# Logging Completeness — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 21f: Logging Completeness (`pitch.md` in this folder)
**Focus:** Everything a real workout needs beyond the plain loop, on the iPhone: changing the gym, swapping or skipping an exercise, reps in reserve, correcting saved sets, adjusting the set count, bodyweight and fixed-target lifts, and logging cardio.

> All styling inherits from Overload's design tokens (`@overload/shared/design/tokens` and `status-colors`) through the native theme from Pitch 21d (`apps/mobile/src/ui/theme.ts`). This design doc only defines feature-specific usage, variants, and states. The web's Tailwind and shadcn/ui system is untouched: this slice adds no web screen.

> **The native visual contract lives in §15 (Mobile design).** A mobile-only slice has no `preview.tsx` (pipeline guide §5 step 3; `overload-mobile-ui`), so the web-style preview is recorded as: *Skipped — mobile-only pitch; native visual contract provided by the Mobile design section and `/overload-mobile-ui`.* The visual review artifact the guide asks for is the design canvas linked in §15.

---

## 1. Vision

Pitch 21e let a lifter log the workout exactly as planned. 21f lets them log the workout that actually happened: the other gym, the machine that was taken, the set they cut, the number they mistyped, the walk after lifting. Each of those is one deliberate action that changes today's record and nothing else.

**North star:** *record what happened, keep what was planned.*

## 2. Design principles

### 1. The fast path doesn't move

Weight, reps, Log set. Nothing added in this slice sits between those three. Reps in reserve is one optional row under the numbers; every rarer action is behind one **More** button.

### 2. One occurrence, never the plan

A swap, a skip, a shorter set count, and a correction each change this workout only. Every confirmation says so in plain words, and no control in the workout can reach the plan.

### 3. Saved means the server said so

A swap, a gym change, a correction, and a cardio entry show as done only after the server's answer, exactly like a set in 21e. A failed request keeps what the lifter typed and says what failed.

### 4. Nothing is zero by accident

No reps in reserve, no weight on a bodyweight lift, and no history at this gym are each shown as what they are: "not recorded", reps only, "First time on this at Riverside Fitness". None is ever shown or sent as 0.

### 5. Locked is explained

The server locks the gym and the swap once a set exists, and locks new sets once the workout is finished. The phone shows the lock where the lifter would look for the action, with the reason.

## 3. Visual language

### Color palette

| Token | Usage | Notes |
| --- | --- | --- |
| `background`, `card`, `border` | Screens, cards, modal bodies | Unchanged from 21e |
| `secondary` | The active set row, unselected RIR chips, the reference panel | The RIR row sits inside the active row's fill |
| `foreground` on `accent` + `border` | The **selected** RIR chip | A neutral fill, never `primary`: RIR is a note, not the action |
| `primary` | Log set, Save, the selected muscle-group chip, saved-row tint (10%) | One primary per state |
| `mutedForeground` | Captions, "Not recorded.", locked reasons, Add set | |
| `destructive` | Field errors and failed saves | Text and a 2-point field border |
| `progress` | The "Done" chip on a logged cardio row | As History uses it in 21e |
| `attention` | Not used by this slice | It stays reserved for scheduling problems (21e RD-25) |

### State colors

| State | Visual treatment | Usage |
| --- | --- | --- |
| Saved set | Primary tint row, check, now pressable | Tap to correct |
| Extra set | "Set 4" with a small "extra" under it; value ends "· extra" | Beyond the plan; recorded, not counted |
| Swapped | "Swapped from Barbell Bench Press" under the name, muted | Card and History |
| Not done | Muted name, "Not done today." and **Undo** | No chip color; it is a fact, not an error |
| Unavailable (archived, no substitute) | "Unavailable — choose a substitute", destructive text, **Swap exercise** | |
| Gym locked | The **Change gym** control is removed; the gym stays in the progress line | After the first set |
| Cardio logged | Check, the record, "Planned 20 min" under it when different | |
| Cardio missed | Muted "Missed" and **Log** | A fact, never a prompt |

Hold shows no tag, and this slice renders no progression tag at all (21g).

### Typography, spacing, radius, elevation

The 21e scale. New uses: RIR chips are 44 × 44 minimum, `radius.lg`, `base` medium tabular; the edit sheet's two number fields reuse the card's `NumberField` (xl semibold tabular). No shadow anywhere.

### Appearance

Light, dark, and system through tokens. The selected RIR chip and the selected muscle chip must each read as selected in both appearances without relying on hue alone (a fill plus a heavier border, and VoiceOver "selected").

## 4. Information architecture

```text
Tabs:  Today · History · Plan · Goals · More
                │
Today (T1) ─────┼─ Start / Resume ──▶ Workout (W1)  ── root stack, over the tabs
  Also today:   │                       ├─ Change gym      (action sheet, before the first set)
  cardio rows ──┼──▶ Cardio (C1) modal  ├─ More ▸ Swap exercise ──▶ Swap (X1) modal
                │                       │        ▸ Didn't do this exercise
History (H1) ───┤                       │        ▸ I meant to do fewer sets (alert)
  cardio rows ──┼──▶ Cardio (C1) modal  ├─ saved set row ──▶ Edit set (E1) modal
  workout row ──┼──▶ Logged workout (H2)├─ Add set (extra row)
                │      ├─ set row ──▶ Edit set (E1) modal
                │      └─ I meant to do fewer (alert)
                └─ Finish ──▶ Summary (S1, unchanged)
```

Modals are native modal screens on the root stack: they slide up over whatever opened them, have their own header with **Cancel** and the confirming action, and return to the same screen in the same state.

## 5. Surfaces affected

| Surface | Change |
| --- | --- |
| T1 Today | Cardio rows become actionable; a cardio-only day gets a primary **Log cardio** |
| W1 Workout | Gym line with **Change gym**; card gains More, RIR, tappable saved rows, Add set, Undo, Swap for an archived exercise |
| X1 Swap | New modal |
| E1 Edit set | New modal |
| C1 Cardio | New modal (log and correct) |
| H1 History | Cardio rows open C1 |
| H2 Logged workout | Set rows open E1; "I meant to do fewer"; the "Edit on the web" hand-off is removed |
| S1 Summary, missed-day card, Plan, Goals, More | Unchanged |

## 6. Screen specifications

### Screen W1: Workout (amended)

**Purpose.** Log the exercise in front of the lifter, and change what today's record says about it when the day differs from the plan.

**Route.** `/workout/{loggedSessionId}` (unchanged).

**Layout.** §15 W1.

#### The gym line

| Element | Behavior |
| --- | --- |
| Progress line | "Exercise 2 of 4 · Tuesday, November 17 · Northside Strength" (unchanged) |
| **Change gym** (text button, under the progress line) | Shown only while the server says the gym is not locked (no set saved in this workout). Fetches the account's gyms, then opens the action sheet "Where are you training?" with the current gym marked "(current)". Choosing another sends it; the workout reloads, so every machine and cable card shows that gym's history |
| Locked | Once any set is saved the control is gone. The gym stays in the progress line, as in 21e, and on each machine and cable card |
| One gym | The sheet is not opened; an inline note reads "This is your only gym. Add another on the web." |
| Failure | An inline banner above the card: "Couldn't change the gym. …" with the client's network wording; nothing changes |

Changing the gym never touches a saved set: the server refuses it once one exists, and before that there is nothing to re-attach.

#### The card header and More

| Element | Behavior |
| --- | --- |
| Name, prescription, "Swapped from …" | Unchanged. A fixed target prints as "3 × 10"; a bodyweight lift adds "· bodyweight, reps only" |
| **More** (`ellipsis.circle`, 44 × 44, top right of the card; label "More for Barbell Bench Press") | Dismisses the keyboard, then opens an action sheet titled with the exercise name |

The sheet's rows depend on the server's state for this card:

| Row | Shown when | Action |
| --- | --- | --- |
| **Swap exercise** | In progress and no set saved on this exercise | Opens X1 |
| **Didn't do this exercise** | In progress and no set saved on this exercise | Marks it not done at once (the tap on More and then this row is the explicit choice; **Undo** is on the card) |
| **I meant to do fewer sets** | At least one planned set saved and fewer saved than planned | Opens the confirmation P1 |
| Cancel | Always | |

When a set is saved, the sheet's message reads "Sets are logged, so this exercise can't be swapped or marked not done." If only Cancel would remain, the message alone explains why.

#### Set rows

| Row | Behavior |
| --- | --- |
| Saved | Pressable. Label "Set 1, 185 pounds, 8 reps, 2 reps in reserve, logged", hint "Opens this set to correct it". Opens E1. The value reads "185 lbs × 8 · 2 RIR" |
| Active | Weight and reps exactly as 21e (offer, caption, keypad bars with Done). Under them, **RIR** |
| Waiting | "Set 3 —" (unchanged) |
| Extra, saved | "Set 4" with "extra" beneath; value ends "· extra"; pressable like any saved row |
| Extra, pending | Appears after **Add set**: an active row labelled "Set 4 · extra" |

**RIR (reps in reserve).** A labelled row inside the active set: "RIR" then five chips `0 1 2 3 4+`. Nothing is selected to begin with; tapping a chip selects it; tapping the selected chip clears it. It is never carried from one set to the next. It is sent with the set on **Log set**; untouched means "not recorded". Tapping a chip never moves focus or closes the keyboard, and the whole row (numbers, caption, RIR, any error) stays above the keyboard.

**After the planned sets.** "All 3 sets logged." and a quiet **Add set** text button. It adds one pending extra row and focuses it. The server allows up to ten extras, only once every planned set is saved; its refusal shows as the card notice.

#### Not done and unavailable

| State | Card |
| --- | --- |
| Not done | Muted name; "Not done today. It won't count toward progression."; **Undo — I'll log it** (secondary). Undo restores the logging rows |
| Unavailable | "Unavailable — choose a substitute"; "This planned exercise was archived. Pick a substitute to log it. Your plan isn't changed."; **Swap exercise** (primary on the card); **Didn't do this exercise** (text) |

Both failures show under the button, keep the card as it was, and can be retried.

#### Validation

| Field | Rule | Message |
| --- | --- | --- |
| Weight, reps | The shared rules, as in 21e | The shared messages |
| RIR | Only the five chips can be chosen | A server refusal (a stale build) shows as the card notice, never on the reps field |
| Extra set | The server's range | "That set isn't part of this exercise." as the card notice |

#### States

- **Loading / error / unreachable:** unchanged from 21e (the skeleton card; `LoadErrorState`).
- **Saving a change** (swap, skip, undo, fewer sets, gym): the control shows its busy state and cannot be pressed twice; the rest of the card stays usable only where it cannot conflict (Log set is disabled while the exercise itself is changing).
- **Finished elsewhere:** any write refused with "This workout is already finished." shows that message and reloads to the finished state.

### Screen X1: Swap exercise

**Purpose.** Pick what the lifter is doing instead, for today only.

**Route.** `/workout/{loggedSessionId}/swap?loggedExerciseId=…` (modal).

**Trigger.** More ▸ Swap exercise, or **Swap exercise** on an unavailable card.

**Layout.** §15 X1.

| Element | Behavior |
| --- | --- |
| Header | Title "Swap exercise"; **Cancel** on the left closes with nothing changed |
| Context | "Instead of Barbell Bench Press" and "Planned: Chest · today only, your plan stays the same" |
| Muscle group chips | One horizontally scrolling row of every muscle group: the planned exercise's group first and selected, then the rest in the library's order. Tapping another loads that group's list |
| Search | A search field over the list; filters the loaded group by name as the lifter types; a clear button |
| List | Every active exercise the account can see in the selected group (the library and the account's own), except the one already on the card; favorites first with a star, then by name. Rows are 56 tall |
| Choosing a row | Sends the swap. On the server's answer the modal closes and the card shows the new exercise with "Swapped from …" and its own history for this workout |

**Empty states.**

- No exercises in the group: "No active exercises for Calves." / "Pick another muscle group."
- No search match: "No exercises match “xyz”." / **Clear search**

**Locked.** If a set was logged meanwhile (another device): "Sets are logged — this exercise is locked." and only **Cancel**.

**Loading.** Skeleton rows under the chips; changing group dims the old list until the new one arrives. **Error.** `LoadErrorState` with Retry. A failed swap shows a banner above the list and keeps the list and the search text.

### Screen E1: Edit set

**Purpose.** Correct one saved set's numbers.

**Route.** `/workout/{loggedSessionId}/edit-set?loggedSetId=…&from=workout|history` (modal).

**Trigger.** A saved row on the card (W1) or a set row in the logged workout (H2), whether the workout is in progress or finished.

**Layout.** §15 E1.

| Element | Behavior |
| --- | --- |
| Header | Title "Edit set 2"; **Cancel** left; **Save** right (disabled until something changed; busy while saving) |
| Context | The exercise name and, for a finished workout, its date |
| Weight | Decimal keypad; opens holding the stored weight. Absent for a bodyweight lift, replaced by "Bodyweight — reps only." |
| Reps | Number keypad; opens holding the stored reps |
| RIR | The five chips, opening on the stored value. Under them "Not recorded." or "Tap the selected value to clear." |
| Footer note | "This corrects the record. It doesn't move the set to another exercise, gym, or day." |

**Fields.**

| Field | Type | Required | Default | Validation |
| --- | --- | --- | --- | --- |
| Weight | decimal | when the lift takes a weight | stored value | the shared weight rule |
| Reps | whole number | yes | stored value | the shared reps rule |
| RIR | 0–4 or none | no | stored value | chips only |

**Behavior.**

- Save sends the correction once. RIR is sent only if the lifter changed it, so correcting a weight can never erase a stored RIR.
- On the server's answer: a light haptic, the modal closes, and the row shows the server's values. Today, History, and the workout are marked stale so every screen reads the corrected record.
- On failure the modal stays open with everything typed and a banner: "Couldn't save — Overload needs a connection. Your correction is still here." Save again sends the same correction; sending it twice changes nothing more.
- A field error shows under its field and focuses it; nothing is sent.
- Because Save and Cancel are in the header, the keyboard can never cover them. Swiping the sheet down is Cancel.

### Confirmation P1: fewer sets today

**Trigger.** More ▸ I meant to do fewer sets (W1), or **I meant to do fewer** on an exercise in H2 that has fewer logged working sets than planned.

A system alert:

- Title: "Count 2 sets as the plan for this workout?" (the same words from the workout and from History, where "today" would be wrong)
- Message: "Barbell Bench Press was planned for 3 sets. This changes this workout only — your plan stays the same, and no logged set is removed. You can't raise it again."
- Buttons: **Cancel**, **Count 2 sets**.

The number is always the working sets already saved, so it can never be below what was logged. On success the card reads "All 2 sets logged." (and offers Add set); H2 drops the "2 of 3 planned sets" note. On failure a banner on the same screen says so and nothing changes.

There is no control that raises the planned count, on the phone or the web. Doing more than planned is **Add set**: the extra set is recorded and labelled, and the plan's count keeps its meaning.

### Screen T1: Today (cardio)

**Purpose.** Unchanged; the day's cardio can now be recorded here.

| State | Layout |
| --- | --- |
| Lifting day with cardio | The workout card keeps the primary action. Under "Also today", each cardio row: the activity and minutes, "Planned cardio", and a **Log** button (secondary, 44). Once logged: a check, the record, "Planned 20 min" when it differs, and a chevron; tapping it opens C1 to correct it |
| Cardio-only day | The rest card is replaced by a cardio card: "Cardio", "Week 4", each planned line, and a primary **Log cardio** (or "Log Incline Walk" per pending entry when there are two). When all are logged: "Cardio complete" with the records, each tappable |
| Missed lifting day | The cardio section still shows and still works: cardio is never blocked by a missed lifting day |

### Screen C1: Cardio

**Purpose.** Record or correct the activity and minutes for one planned cardio day.

**Route.** `/cardio` (modal) with the occurrence in its parameters.

**Layout.** §15 C1.

| Element | Behavior |
| --- | --- |
| Header | "Log cardio" or "Edit cardio"; **Cancel**; **Save** |
| Context | "Tue, Nov 17 · Planned Incline Walk · 20 min" (the date alone when correcting from an earlier block) |
| Activity | Text, prefilled from the plan when logging and from the record when correcting; under it the shared suggestions as chips (Incline Walk, Treadmill, Stair Climber, Bike, Elliptical, Rowing, Outdoor Walk); tapping one fills the field |
| Minutes | Number keypad, prefilled the same way; unit "min" |

**Validation.** The shared cardio rules and messages: "Enter the activity.", "Keep it to 40 characters or fewer.", "Enter whole minutes, 1 or more.", "Keep it to 600 minutes or fewer." Each shows under its field.

**Behavior.**

- Save sends once. On the answer: light haptic, close, and Today and History reload.
- If the server says that day was already logged, an alert: "Already logged" / "This cardio was recorded earlier. Tap it to correct it." The stored record is shown; nothing was overwritten.
- A failure keeps the form: "Couldn't save — Overload needs a connection. Your entries are still here."
- Nothing here has a tag, a chart, a total, or a timer.

### Screen H1: History (cardio rows)

Cardio rows become pressable where there is something to do: a logged row (any week, any block) opens C1 to correct it; a row for today or a missed day in the active week opens C1 to log it and its chip reads "Today" or "Missed"; an upcoming row stays inert. Workout rows are unchanged.

### Screen H2: Logged workout (amended)

**Purpose.** Read what was logged, and correct it.

| Element | Behavior |
| --- | --- |
| Set row | Pressable with a chevron; opens E1. Label "Set 2, 185 lbs × 8", hint "Opens this set to correct it" |
| Short exercise | Under its sets: "2 of 3 planned sets — counts toward your strength trend, not your progress check." and **I meant to do fewer** (opens P1) |
| Swapped, archived, not done | Unchanged from 21e ("swapped from …", "archived", "Not done") |
| Footer | "Corrections change this record only. Exercise, gym, and date can't be changed." The "Edit on the web" button and its note are removed |
| In progress | **Resume workout** as in 21e; its sets can also be corrected here |

## 7. Navigation flows

```text
Start (2+ gyms) ─ action sheet ─▶ W1 at Riverside
   W1 ─ Change gym ─ action sheet ─▶ W1 reloads at Northside        (before any set)
   W1 ─ More ▸ Swap ─▶ X1 ─ pick ─▶ W1, card shows the substitute
                         └ Cancel ─▶ W1 unchanged
   W1 ─ More ▸ Didn't do ─▶ card "Not done today." ─ Undo ─▶ card back
   W1 ─ saved row ─▶ E1 ─ Save ─▶ W1, row shows the server's values
   W1 ─ Add set ─▶ extra row ─ Log set ─▶ "Set 4 … · extra"
   W1 ─ More ▸ fewer sets ─ alert ─▶ "All 2 sets logged."
T1 ─ Log (cardio) ─▶ C1 ─ Save ─▶ T1, row logged          H1 shows it Done
H1 ─ workout ─▶ H2 ─ set row ─▶ E1 ─ Save ─▶ H2 corrected ─▶ web shows the same
```

State carried: only ids and what the opening screen already displayed. Every modal returns to its opener, which stays mounted, so a draft typed on the card survives opening and closing a modal.

## 8. Interaction specifications

### Keyboard

| Context | Behavior |
| --- | --- |
| Card inputs | Unchanged from 21e: one keypad bar per input, **Done** then **Next** or **Log set N**; the active row stays above the keyboard |
| RIR chips | Tapping never dismisses the keyboard or moves focus |
| More, Change gym, saved row, Add set | The keyboard is dismissed first, then the sheet or modal opens, so nothing opens over a half-covered screen |
| Moving between exercises | Unchanged; every field on the next card takes its first tap, including after a modal was opened and closed |
| E1, C1 | Save and Cancel live in the header. No field is focused on open, so no keyboard appears until the lifter taps a field; tapping one selects its value so typing replaces it |
| X1 search | Default keyboard with a Search return key; the list scrolls under it and dragging the list dismisses it |

### Haptics

Light on a confirmed set, correction, swap, skip, undo, fewer-sets change, gym change, and cardio save. Warning on a refused or failed write. Success only on finishing the workout (unchanged).

### Loading and error

Every write: busy state on its control, one request, no automatic retry, the lifter's input kept on failure. Every read: skeleton, then content or `LoadErrorState`. A failed load is never shown as empty.

### Messages (inline, never toasts)

| Event | Message |
| --- | --- |
| Set, correction, cardio could not be sent | "Couldn't save — Overload needs a connection. Your … still here." |
| Swap refused: sets logged | "Sets are logged — this exercise is locked." |
| Skip refused: sets logged | "Sets are logged for this exercise, so it can't be marked as not done." |
| Gym refused: sets logged | "The gym is locked once sets are logged." |
| Anything refused: finished | "This workout is already finished." |

The server's wording is shown as sent, so both clients say the same thing.

### Destructive actions

Nothing in this slice deletes anything. Lowering the planned sets is the one change that cannot be undone, so it alone asks first (P1). Skip is reversible (Undo), swap is reversible until a set is logged (swap again), a correction can be corrected again.

## 9. Responsive behavior

iPhone only. At the largest Dynamic Type size: the RIR chips wrap to a second line rather than shrink below 44; the weight and reps boxes stack as in 21e; the muscle chips still scroll; E1 and C1 scroll under their fixed headers. On the smallest supported phone the active row with RIR still fits above the keyboard (the screen scrolls it there, as in 21e).

## 10. Component inventory (native, `apps/mobile/src`)

| Component | Location | New / reused | Notes |
| --- | --- | --- | --- |
| `ExerciseCard` | `workout/` | amended | More, RIR, pressable saved rows, Add set, Undo, Swap for unavailable |
| `RirPicker` | `workout/` | new | Card and E1; five chips, clearable |
| `NumberField` | `workout/` | unchanged | The card's device-verified input is not touched; E1 and C1 use the shared labelled `TextField` |
| `exercise-actions` | `workout/` | new | Which More rows a card offers (pure) and the sheet |
| `SwapScreen` | `workout/` | new | X1 |
| `EditSetScreen` | `workout/` | new | E1 |
| `CardioScreen`, `CardioRows` | `cardio/` | new | C1; Today's rows and the cardio-only card |
| `HistoryScreen`, `LoggedWorkoutScreen`, `TodayView`, `WorkoutScreen` | existing | amended | Rows open the modals; gym line |
| `ModalHeader` actions | `ui/` | new | Cancel / Save header buttons for the three modals |

## 11. Accessibility, privacy, and data sensitivity

- Every new control has a label: "More for Barbell Bench Press", "Set 2 RIR, reps in reserve, optional", each chip "0" … "4 or more" with its selected state, "Change gym", "Log cardio: Incline Walk, Tuesday, November 17".
- A saved row announces that it can be corrected; a locked gym announces why.
- No state relies on color: selected chips have a fill and border and the selected trait; "Missed", "Done", "extra", and "Not done" are words.
- Modals move focus to their title and return it to the control that opened them.
- Gym names appear only where 21e already shows them. No address is shown anywhere in this slice.
- No share, export, or cross-account surface. No external link is added; one ("Edit on the web") is removed.

## 12. Out of scope

Deferred: progression calls, evidence, suggested loads, the scheduled-deload banner, and the full summary (21g); gym and library management and the plan screens (21h); goals and exercise history (21i); the native tour (21k). Editing the plan's set count from the phone is not part of this slice or any logging surface.

Permanent non-goals: a rest timer, offline logging, any second progression rule on the phone, cardio metrics beyond type and minutes, deleting a logged set.

## 13. User guidance

None in this slice: the native tour is 21k, and the app is staging-only with no What's New until 21j (the 21e decision stands). No web surface changes, so the web tour and release notes are untouched.

## 14. Plan placement and client scope

**Plan placement: Free.** Every action here is capture or correction of the lifter's own record. No capability is checked and no Pro note appears. The server keeps gating the progression parts of the existing reads exactly as before, and the app still asks for core fields only, so no Pro result reaches this slice's screens.

**Client scope: mobile, with additive mobile API endpoints in `apps/web`.**

| Surface | Shared logic | API | Web UI | Mobile UI | Reason |
| --- | --- | --- | --- | --- | --- |
| Gym change | — | new endpoint over the web's gym change | none | W1 gym line | The web already allows it before the first set |
| Swap | taxonomy labels (shared) | two new endpoints over the web's swap read and write | none | X1, card | Any-group filter is the web's current rule |
| Skip / undo | — | new endpoint over the web's write | none | card | |
| RIR | the shared RIR scale and wording | the existing set endpoint already accepts it | none | card, E1 | |
| Correct a set | shared weight, reps, RIR rules | new endpoint over the web's correction | none | E1, card, H2 | |
| Fewer sets | — | new endpoint over the web's correction | none | P1 | Lower only, this workout only |
| Extra sets | shared active-set rule | the existing set endpoint already accepts them | none | card | |
| Cardio | shared cardio validation and suggestions | two new endpoints over the web's log and correction | none | T1, C1, H1 | |
| Missed day | — | none (shipped in 21e) | none | none | Regression only |

**What 21e already delivered (regression coverage only):** choosing the gym at Start; reps-only entry for bodyweight lifts; display of swapped, extra, and RIR values the web recorded; missed-day resolution; read-only cardio lines.

## 15. Mobile design (the native visual contract)

Built with `overload-mobile-ui` on the 21d and 21e system: `Surface` cards, `Chip` status words, tokens only, tabular figures, 16-point gutters. The visual review artifact (key screens and states in both appearances, illustrative data) is the design canvas (private, owner's account): https://claude.ai/artifact/M2GCJ2n46QQozsErgEiPs5. Where it and the layouts below differ, the layouts and tables in this document win.

### W1 Workout — root stack, over the tabs

```text
┌──────────────────────────────────┐
│ ‹ Today      Upper A      Finish │ standard header
│ ▬▬▬▬ ▬▬▬▬ ──── ────              │ progress segments
│ Exercise 2 of 4 · Tue, Nov 17 ·  │ sm muted (the 21e line, unchanged)
│ Northside Strength               │
│ Change gym                       │ text button (before any set only)
│ ┌──────────────────────────────┐ │
│ │ Wide-Grip Lat Pulldown   (•••)│ │ 2xl semibold · More, 44×44
│ │ 3 × 10–12 · Northside Strength│ │ muted
│ │ Last time in Upper A · Nov 10 │ │ sm muted
│ │   · 130 × 11, 11, 10          │ │
│ │                               │ │
│ │ Set 1  130 lbs × 12 · 2 RIR ✓ │ │ saved: tint, tap to correct
│ │ ┌───────────────────────────┐ │ │
│ │ │ Set 2 [ 130 lbs ][   reps]│ │ │ active row (secondary fill)
│ │ │        same as set 1      │ │ │
│ │ │ RIR  (0)(1)(2)(3)(4+)     │ │ │ optional; none selected
│ │ └───────────────────────────┘ │ │
│ │ Set 3  —                      │ │
│ │ ┌───────────────────────────┐ │ │
│ │ │         Log set 2         │ │ │ primary, 48
│ │ └───────────────────────────┘ │ │
│ └──────────────────────────────┘ │
│ [ Previous ] [ Next: Incline D… ]│
└──────────────────────────────────┘
```

- **After the first set:** the Change gym button is gone; the gym stays in the progress line.
- **All planned sets saved:** "All 3 sets logged." then a text button **Add set**; an extra row reads "Set 4 · extra".
- **Bodyweight:** no weight box; "3 × 8–10 · bodyweight, reps only"; RIR as usual.
- **Fixed target:** "3 × 10".
- **First time at this gym (machine or cable):** "First time on this at Riverside Fitness."; the weight box is empty.
- **Not done:** the card is the name (muted), "Not done today. It won't count toward progression.", and **Undo — I'll log it**.
- **Unavailable:** destructive "Unavailable — choose a substitute", the explanation, **Swap exercise**, **Didn't do this exercise**.
- **More sheet:** native action sheet: title = the exercise, rows per §6, Cancel.
- **Differs from the web:** the web keeps Swap and "Didn't do this exercise" as full-width buttons under the sets; the phone folds them, with the fewer-sets correction, into one More button so the keypad path stays short. The web's gym change is a radio list in the page; here it is the same action sheet Start uses.

### X1 Swap exercise — modal

```text
┌──────────────────────────────────┐
│ Cancel     Swap exercise         │
│ Instead of Barbell Bench Press   │ base medium
│ Planned: Chest · today only,     │ sm muted
│ your plan stays the same         │
│ (Chest)(Back)(Lower Back)(Traps)▸│ chips, horizontal scroll
│ ┌──────────────────────────────┐ │
│ │ 🔍 Search exercises          │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ ★ Incline Dumbbell Press     │ │ favorites first
│ │   Decline Barbell Bench Press│ │ 56-tall rows
│ │   Dumbbell Bench Press       │ │
│ │   Leverage Chest Press       │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

- **States:** loading (skeleton rows), empty group, no search match, locked, load error, swap failed (banner, list kept).
- **Differs from the web:** the web's Select becomes a chip row (a native filter pattern, one tap instead of two); the page becomes a modal so Cancel is always one tap.

### E1 Edit set — modal

```text
┌──────────────────────────────────┐
│ Cancel      Edit set 2      Save │
│ Barbell Bench Press              │ base medium
│ Tuesday, November 10             │ sm muted (finished workouts)
│ Weight                           │
│ ┌──────────────────────────────┐ │
│ │ 175                      lbs │ │ decimal pad
│ └──────────────────────────────┘ │
│ Reps                             │
│ ┌──────────────────────────────┐ │
│ │ 8                       reps │ │ number pad
│ └──────────────────────────────┘ │
│ RIR (optional)                   │
│ (0)(1)[2](3)(4+)                 │ stored value selected
│ Tap the selected value to clear. │ xs muted
│                                  │
│ This corrects the record. It     │ xs muted
│ doesn't move the set to another  │
│ exercise, gym, or day.           │
└──────────────────────────────────┘
```

- **Bodyweight:** no Weight field; "Bodyweight — reps only."
- **States:** saving (Save shows progress, fields read-only), failed (banner, everything kept), field error (under the field), record missing ("This set isn't available." and Close).
- **Differs from the web:** a dialog becomes a modal sheet with header actions; no toast, the corrected row is the confirmation.

### C1 Cardio — modal

```text
┌──────────────────────────────────┐
│ Cancel      Log cardio      Save │
│ Tue, Nov 17 · Planned Incline    │ sm muted
│ Walk · 20 min                    │
│ Activity                         │
│ ┌──────────────────────────────┐ │
│ │ Incline Walk                 │ │
│ └──────────────────────────────┘ │
│ (Incline Walk)(Treadmill)(Stair ▸│ suggestion chips
│ Minutes                          │
│ ┌──────────────────────────────┐ │
│ │ 20                       min │ │ number pad
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

### T1 Today — the cardio rows

```text
│ ALSO TODAY                       │
│ ┌──────────────────────────────┐ │
│ │ 🏃 Incline Walk · 20 min [Log]│ │ pending
│ │    Planned cardio            │ │
│ └──────────────────────────────┘ │
   …after saving…
│ │ ✓ Incline Walk · 25 min    › │ │ logged, tap to correct
│ │    Planned 20 min            │ │
```

Cardio-only day: the same rows inside a card headed "Cardio · Week 4" with a full-width primary **Log cardio**.

### H2 Logged workout — History stack

```text
│ BARBELL BENCH PRESS              │
│ ┌──────────────────────────────┐ │
│ │ Set 1        175 lbs × 8   › │ │ tap to correct
│ │ Set 2        175 lbs × 8   › │ │
│ └──────────────────────────────┘ │
│ 2 of 3 planned sets — counts     │ xs muted
│ toward your strength trend, not  │
│ your progress check.             │
│ I meant to do fewer              │ text button
```

### States checklist (every new screen)

| Screen | Loading | Empty | Error | Unreachable | Locked |
| --- | --- | --- | --- | --- | --- |
| X1 | skeleton rows | group, search | `LoadErrorState` | its network wording | "Sets are logged — this exercise is locked." |
| E1 | header busy | — | banner, input kept | banner, input kept | n/a (always allowed) |
| C1 | header busy | — | banner, input kept | banner, input kept | n/a |
| W1 additions | control busy | — | inline under the control | same | gym lock, swap/skip message |

No Pro note appears in this slice: nothing here is a Pro feature.

### Differences from the web, and why (summary)

1. One **More** button instead of two full-width buttons: the keypad path on a phone must stay short.
2. Modals with header actions instead of dialogs: Save can never sit under the keyboard.
3. The fewer-sets correction is one confirmed tap to the count already logged, instead of a number field: on the phone the natural target is what was done, and it can never go below it.
4. The fewer-sets correction is also offered during the workout (More), not only from History: the server already allows it on any logged exercise, and the pitch asks for it while logging.
5. Chips for the muscle group instead of a select.
