# Wing-It Workouts — Design Document

> Pitch 25. Inputs: `pitch.md`, the PRD feature "Wing-It Workouts", the roadmap entry, and the existing Today, workout runner, swap picker, and History surfaces on both clients. Visual contract for the web: `preview.tsx` (this folder). Native contract: §15 below, built with `overload-mobile-ui`. Client scope: both.

## 1. Vision

A Wing-It workout is an ordinary Overload workout with the plan taken away. It uses the same gym choice, the same logging card, the same Finish rule, and the same History. Only two things are new to the lifter: a way to start one from Today, and a way to add exercises while training. Everything that depends on a plan (the planned list, the rep target, the progress call, the deload week) is simply absent, never faked.

## 2. Design principles

1. **Beside the plan, never instead of it.** Today keeps the scheduled workout exactly where it was. Wing-It is a separate, quieter action under it, worded so it cannot be read as "do today's workout differently".
2. **Nothing invented.** No rep target, no "3 × 8–12", no suggested weight, no tag. A Wing-It card says what was logged and what the lifter did last time, and nothing about what they should do.
3. **The existing card.** Set entry, keypads, RIR, corrections, and save confirmation are the planned card's, unchanged. The card only stops counting planned rows: one open row at a time, a new one after each saved set.
4. **Additive, quiet, identical words.** One name everywhere: "Wing-It workout". Button: "Start Wing-It workout". The web and the phone use the same sentences (shared copy module).

## 3. Visual language

No new tokens, colors, or components. Existing card surfaces, `secondary`/`outline` buttons on the web and `Button variant="secondary"` on the phone, muted helper text, the existing ✓ complete line. Wing-It is not a status, so it has no status color. Light and dark come from the existing themes.

## 4. Information architecture

```
Today
├── (existing) unfinished workouts, today's plan / rest / missed / complete / no plan
└── Wing-It section  ← new, every state
    ├── Open Wing-It workout → Resume Wing-It workout
    ├── else Start Wing-It workout → gym → Wing-It runner
    └── Completed Wing-It workouts today → View workout
Wing-It runner (the workout runner, kind = wing_it)
├── Add exercise → exercise picker (muscle filter, search, favorites first)
├── Exercise cards (open-ended), Remove while no sets
└── Finish workout
History
├── week list: Wing-It workouts listed by date (active block weeks and other weeks)
└── logged workout detail (title "Wing-It workout")
```

## 5. Surfaces affected

| Surface | Web | iPhone |
| --- | --- | --- |
| Today | `(app)/page.tsx` + `WingItToday` component | `today/TodayView.tsx` + `WingItSection` |
| Start | `/log/wing-it` (gym choice) | action sheet when 2+ gyms, as the planned start |
| Runner | `WorkoutRunner` + `ExerciseCard` (open-ended mode) | `WorkoutScreen` + `ExerciseCard` (open-ended mode) |
| Add exercise | `/log/[id]/add` + `AddExercisePicker` | `/workout/[id]/add` modal + `AddExerciseScreen` |
| History week | history page, Wing-It rows | `HistoryScreen`, Wing-It rows |
| Logged detail | `/history/[id]` | `LoggedWorkoutScreen` |

## 6. Screen specifications

### 6.1 Today — no active plan

The existing "No active plan" card stays, with its copy changed to offer both paths: "Build a plan for progress calls, or log a Wing-It workout now." The Wing-It section follows immediately, with **Start Wing-It workout** as the primary (filled) button, because it is the one training action available. Goals follow as today.

### 6.2 Today — a workout is scheduled (pending or in progress)

The planned block and its **Start workout / Resume workout** primary button are unchanged. Below it (above cardio), the Wing-It section:

- Heading "Wing-It workout" (small, medium weight).
- Helper: "Train something that isn't in your plan. Today's planned workout stays as it is."
- **Start Wing-It workout** — secondary (outline) button, full width on phones.

The primary button keeps the visual priority; the two are never side by side, so neither looks like a variant of the other.

### 6.3 Today — rest day, cardio-only day, completed day

Rest day: the rest card, then the Wing-It section with a secondary button and the helper "Not on today's plan? Log it as a Wing-It workout." Completed planned day: the complete block, then the Wing-It section (same helper as 6.2).

### 6.4 Today — missed day

The missed-day prompt and the dimmed, inert planned block are unchanged. The Wing-It section sits **outside** the inert region, below it, fully interactive, with the 6.2 helper. Starting Wing-It never resolves the missed day; the prompt is still there afterward.

### 6.5 Today — Wing-It open, finished, or blocked

- **Open Wing-It workout:** the section shows "Wing-It workout · {gym} · {n} sets saved" (or "No sets yet") and **Resume Wing-It workout** (secondary; primary in the no-plan state). The Start button is not shown.
- **Finished today:** one line per finished Wing-It workout: "✓ Wing-It workout · {gym} · {exercises} exercises · {sets} sets" with **View workout** (text link). The Start button stays available for another one.
- **Another workout in progress with saved sets:** Start stays visible; activating it explains instead of starting: "Finish {workout} first. It's still in progress with sets saved." with **Resume {workout}**. Web: an inline alert under the button. iPhone: a system alert with Resume and Cancel. Nothing is discarded.

### 6.6 Gym selection

Web: `/log/wing-it`, the existing "Where are you training?" page and gym radio list (`GymPicker`), Start submits. iPhone: the planned start's rule — one active gym is used directly, two or more open the "Where are you training?" action sheet, none shows the existing "Add a gym first" note. The gym can be changed in the runner until the first set, exactly as for a planned workout.

### 6.7 Wing-It runner

Header: "Wing-It workout" with the gym ("Wing-It workout · Harbor Barbell") and Change gym while no set exists. No week line, no deload banner, no planned list.

- **Empty (no exercises):** a card "No exercises yet." / "Add the first one you're doing." and a primary **Add exercise** button. Finish is shown but disabled with the existing "Log at least one set before finishing." hint.
- **With exercises:** the existing one-card-at-a-time stepper (Previous / Next names the next exercise). An **Add exercise** button sits under the card navigation on every card, so an exercise can be added at any time. Adding returns to the runner on the new exercise.
- **Card (open-ended):** exercise name; the line "Logged as you go" (or "{n} sets logged") instead of "3 × 8–12"; the gym for a machine/cable; saved rows as today; exactly one open row (the next set number) with weight, reps, and RIR; Save. After a save a new open row appears. No "Add set" (every row is the next set), no "Didn't do", no Swap, no planned-sets correction. Weight box starts empty. If the exercise was done before, a reference line: "Last time: {date} · {sets}" (gym-scoped for machines) — reference only, never prefilled.
- **Remove:** while a card has no saved set, a quiet "Remove from workout" text button. It asks for no confirmation (nothing is lost; the entry is marked not done and hidden, never deleted, and adding the exercise again brings it back) and returns to the previous card. A card with saved sets has no Remove; its sets are corrected from the card or History.
- **Finish:** the existing Finish workout button and confirmation. An exercise with no sets is recorded as not done, as for planned workouts (the confirmation lists it).

### 6.8 Exercise picker (Add exercise)

The swap picker's layout and behavior, retitled: "Add an exercise". A muscle-group filter whose first option is **All muscle groups** (the default), a search field ("Search exercises"), and the list (favorites first, starred; custom exercises included; archived excluded). An exercise already in this workout is listed with "In this workout" and choosing it opens its card instead of adding a duplicate. Choosing a row adds it and returns to the runner on that card. A failure keeps the picker open with the server's sentence. Empty filter: "No exercises match."

### 6.9 History

- **Week list.** In an active block week, each Wing-It workout sits on its day, after that day's planned workout, as its own row: "{Tue, Nov 24} · Wing-It workout · Complete / In progress", opening the logged workout (both clients sort the week by day; a Wing-It workout with no saved set is left out). In a week outside the active block, Wing-It workouts appear in the day list like any other logged workout, named "Wing-It workout".
- **Detail.** Title "Wing-It workout", date, gym, each exercise and its sets as recorded, set corrections exactly as for planned workouts. No "x of y planned sets" line, no progression summary, no upgrade note.
- **Exercise history.** Wing-It sessions appear in Sessions named "Wing-It workout" with no call; they count toward records and the trend.

### 6.10 Error and recovery

| Case | Behavior |
| --- | --- |
| Start fails (network) | Web: the page's alert "Couldn't start the workout. Nothing was changed." iPhone: banner with the same words. Retrying resumes, never duplicates. |
| Double tap / two tabs / web and phone at once | One open Wing-It workout per account: every start returns the same one. |
| Add exercise fails | Picker stays open with the message; retrying adds once. |
| Set save fails | The existing card behavior (draft kept, retry is idempotent). |
| Workout finished elsewhere | The existing "This workout is already finished" handling; the runner reloads to History. |
| Token expired / signed out mid-workout | The existing auth handling; the open workout is resumed from Today after sign-in. |

## 7. Navigation flows

Web: Today → `/log/wing-it` → `/log/{id}` ⇄ `/log/{id}/add` → Finish → Today (the completed line) → `/history/{id}`.
iPhone: Today tab → (gym sheet) → `/workout/{id}` → Add exercise modal → back → Finish → summary-less return to Today → History tab → detail.

## 8. Interaction specifications

- Haptics on the phone as the planned flows use them (selection on choosing a gym or an exercise, success on Finish). No new haptic.
- Keyboard: the card's existing keypads and keypad bar. The picker's search field uses the default keyboard with search return key.
- Busy guards: every start, add, and remove ignores a second tap while in flight.

## 9. Responsive behavior

Web: the Wing-It section is a full-width card on phones, the same width as the planned block on desktop. The picker is the swap picker's single column. No layout breakpoints are added.

## 10. Component inventory

Web new: `components/logging/wing-it-today.tsx`, `components/logging/add-exercise-picker.tsx`, `app/(app)/log/wing-it/page.tsx`, `app/(app)/log/[id]/add/page.tsx`. Changed: `workout-runner.tsx`, `exercise-card.tsx`, `gym-picker.tsx` (a `wing_it` mode), Today page, history week and detail pages.
iPhone new: `today/WingItSection.tsx`, `today/useStartWingIt.ts`, `workout/AddExerciseScreen.tsx`, `app/workout/[loggedSessionId]/add.tsx`. Changed: `WorkoutScreen`, `ExerciseCard`, `card-model`, `exercise-actions`, `HistoryScreen`, `LoggedWorkoutScreen`, `api/training.ts`.
Shared: `packages/shared/src/logging/wing-it.ts` (copy and pure rules).

## 11. Accessibility

- Every new control is a real button or link with its visible label as its name; Start and Resume name "Wing-It workout" so a screen reader user can tell them from the planned Start.
- Web: the blocked-start alert is `role="alert"`; the picker's list is a list of buttons; focus returns to the runner's card heading after adding.
- iPhone: 44 pt minimum targets, Dynamic Type through the existing `Text`, VoiceOver labels ("Remove Leg Press from workout"), the section heading has `accessibilityRole="header"`.
- No color-only meaning: "In this workout" is text.

## 12. Empty states

Today has no empty state of its own (the section is always an action). Runner: "No exercises yet." Picker: "No exercises match." History: unchanged.

## 13. User guidance

A What's New entry, "Wing-It workouts": "Start a workout from Today without a plan — even on a planned day. Add exercises as you go; your plan stays as it is." No tour step: the Today step already covers the day's actions, and the native tour is under external TestFlight review, so its registry is left unchanged (recorded in the spec).

## 14. Plan placement and client scope

Free. No capability check anywhere in the Wing-It lifecycle; the progression calls that do not exist for Wing-It are not shown as locked. Both clients, one run.

## 15. Mobile design (the native visual contract)

- **Today:** `WingItSection` is a `Surface` below the dashboard block (inside the week strip's content when it shows) and above cardio. Title `Text size="lg" weight="semibold"` "Wing-It workout"; helper `Text size="sm" tone="muted"`; `Button variant="secondary"` (primary in the no-plan state). On a missed day it is placed after the dimmed block and is never inside the `pointerEvents="none"` view. Finished rows: `✓ Wing-It workout · gym · n exercises · m sets` with a `Button variant="text"` "View workout".
- **Runner:** `WorkoutScreen` header title "Wing-It workout", subtitle the gym. Empty state uses `StateView` (icon `plus.circle`) with "Add exercise". Below the card pager: `Button variant="secondary"` "Add exercise" (icon `plus`). The exercise action sheet offers "About this exercise" and, with no sets, "Remove from workout" (destructive style, no second confirmation).
- **Card:** `ExerciseCard` open-ended: the scheme line reads "Logged as you go" / "{n} sets logged"; one open row; no Add set; reference line from `referencePerformance` formatted without a rep range.
- **Add exercise:** a modal stack screen like Swap ("Add an exercise", Cancel left), chips "All" + muscle groups, a search `TextInput`, a `FlatList` of rows with a star for favorites and "In this workout" detail text. Choosing closes the modal only on the server's answer.
- **History:** in an active week, each Wing-It workout is a row on its day, after the planned workout, with the same row component.
- Light and dark from the theme; no new colors.

The web preview (`preview.tsx`) shows the same states; the iPhone renders them natively with the components above.
