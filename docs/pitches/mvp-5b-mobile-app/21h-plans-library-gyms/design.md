# Plans, Library & Gyms — Design Document

**Version:** 1.0 (pipeline run of 2026-11-22)
**Pitch Source:** Overload — Pitch 21h: Plans, Library & Gyms (`pitch.md` in this folder)
**Focus:** The active plan, its week and sessions, the exercise library with favorites and custom exercises, and gyms on the iPhone, read-only for the plan and with the web's own create and archive actions for exercises and gyms.
**Client scope:** Mobile (iOS), with one shared-copy change on the web (the prescription line moves to the shared package so both clients print it identically). No web behavior changes.
**UI preview:** Skipped — mobile-only pitch; native visual contract provided by the Mobile design section (§15) and `/overload-mobile-ui`. The visual review artifact is the design canvas linked from §15.

---

## 1. Vision

Away from the bar, a lifter asks *what is my plan, where am I in it, and what is in Thursday's session?*, and in the gym, *what is this exercise, is it one of mine, and is this gym set up?* The web has answered these since Split & Mesocycle Builder and Library & Gyms Setup. 21h puts the same answers on the phone, in the same words, without turning the phone into a plan builder.

**North star:** *the phone shows the plan exactly as it is, and lets the lifter add what they need to train — nothing more.*

## 2. Design principles

### 1. The plan is read, not edited

Plan screens carry no edit controls, disabled or otherwise. One quiet line says where editing happens ("Edit the plan on the web"), once per screen at most. Nothing on a plan screen starts, skips, or changes a workout.

### 2. Planned is not performed

The session screen shows the authored template: the planned exercise, its planned sets, and its rep target. A swap, a skipped exercise, or an extra set in a workout never appears there, and the screen says so in one line. Logged state appears only as the week's day chips, in History's own words.

### 3. The server's calendar, verbatim

Week numbers, which week is a deload week, what "today" is, and where a shifted day landed all come from the server, which uses the account's time zone and the existing effective-schedule rules. The phone does no date math beyond formatting what it is given.

### 4. The web's actions, no new ones

Exercises and gyms get exactly what the web has: create, favorite (exercises), and archive with undo. The web has no edit for a custom exercise or a gym (Library & Gyms Setup deferred it pending an upstream decision), so the phone has none either. Archive is soft and the copy promises history stays.

### 5. Browsing never touches a workout

Opening an exercise from a workout card stacks the detail over the workout, which stays mounted with every typed value. The detail has no swap and no archive in that context. Back returns to the same card.

## 3. Visual language

All styling inherits from Overload's design system: on the phone, the shared design tokens (`packages/shared/src/design`) through the native theme (`apps/mobile/src/ui/theme.ts`), the same palette as the web's Tailwind and shadcn/ui theme. This design doc only defines feature-specific usage, variants, and states.

### Color palette

| Token | Usage | Notes |
| --- | --- | --- |
| `background` | screen behind cards | |
| `card`, `border` | `Surface`, `GroupedList`, rows | token border separates cards in dark |
| `foreground` | names, session names, prescriptions | |
| `mutedForeground` | dates, muscle and equipment line, footnotes | |
| `secondary` / `muted` | filter chips at rest, image tile behind a missing image, pressed rows | |
| `primary` | the Today marker, a selected filter chip, the favorite star when on | |
| `destructive` | Archive actions and their confirmation | |
| `progress` | "Done" day chip (History's tone) | reused, not new |

No new token. `packages/shared/src/design/tokens.ts` is not touched (it is a native fingerprint input).

### State colors

| State | Visual treatment | Usage |
| --- | --- | --- |
| Day: Upcoming | muted chip "Upcoming" | a planned day with nothing logged yet (History's word, also on a past unresolved day; Today's missed-day prompt handles that day) |
| Day: In progress | primary chip | a started workout |
| Day: Done | progress chip | a finished workout |
| Day: Skipped / Shifted | muted chip | a missed-day resolution, worded as History |
| Today | primary dot and "Today" in the date column | the account's today |
| Rest | muted "Rest" text, no chip | a day with no session |
| Scheduled deload week | muted line "Deload week" under the week header, and in the block card | planned recovery; never a reactive Deload chip |
| Custom exercise | outline chip "Custom" | the account's own |
| Archived exercise | muted chip "Archived", name in muted text | still resolves in plans and history |
| Favorite | filled star in `primary`; outline star at rest | always paired with an accessible label |

Color is never the only signal: every chip is a word.

### Typography, spacing, radius

The existing scale (`Text` sizes `xs`…`xxl`, Inter), 16-point gutters, `radius.xl` cards, tabular figures for week numbers, set counts, and rep targets. No deviation.

### Appearance

Light, dark, and system via tokens; the in-app setting overrides the system. Exercise images are photographs from free-exercise-db on a white background; in dark mode they sit inside a rounded tile with the `border` token so the white does not bleed into the card.

## 4. Information architecture

```text
Tab bar (unchanged):  Today · History · Plan · Goals · More

Plan (tab root, P1)                         [was a web-only placeholder]
 ├─ block card: name, Active, dates, Week N of L, deload cadence, split
 ├─ This week  ‹ Week N ›  (effective schedule, 7 days, Today marked)
 │    └─ a day's session ─────────────┐
 ├─ Sessions (authored template)      │
 │    └─ a session ──────────────────►├─► P2 Session (push)
 └─ other blocks on the web (line)    │      └─ an exercise ─► X1 Exercise (push)
                                      ┘
More (tab root, M1)
 ├─ Exercises ─► L1 Library (push) ─► X1 Exercise (push)
 │                 └─ [+] ─► L2 New exercise (modal over everything)
 └─ Gyms ─────► G1 Gyms (push) ─► G2 Gym (push)
                   └─ [+] ─► G3 New gym (modal)

Workout (root stack, over the tabs; 21e–21g)
 └─ card ••• → "About this exercise" ─► X1 Exercise (root stack, over the workout)

Today (21e)
 └─ no gym yet → [Add a gym] ─► G3 New gym (modal)      [was a web link]
```

Primary content per screen: P1 the block and this week; P2 the ordered exercise list; L1 the result list; X1 the name and classification; G1 the gym list.

## 5. Surfaces affected

| Surface | Change |
| --- | --- |
| Plan tab | new native screens P1, P2 replace the placeholder |
| More | the "Exercises" and "Gyms" rows open native screens instead of the web |
| Exercise library, detail, new exercise | new L1, X1, L2 |
| Gyms, gym, new gym | new G1, G2, G3 |
| Workout card ••• sheet | gains "About this exercise" |
| Today, no-gym state | "Add a gym" opens G3 instead of the web |
| Web plan session rows | the prescription line comes from the shared package (identical text) |

## 6. Screen specifications

Each screen is native; layouts are in §15. Behavior is specified here.

### P1 Plan

**Purpose.** Show which block is active, where the lifter is in it, this week's days, and the sessions it contains.

**Trigger.** The Plan tab.

**Content, top to bottom.**

1. Header: eyebrow "Your training block", title "Plan".
2. Block card (`Surface`): name (wraps, never truncates), "Active" chip, the date range ("Mon, Nov 2 – Sun, Dec 13"), a position line, a cadence line, a split line.
   - Position line: "Week 3 of 6" while the block runs; "Starts Mon, Dec 1" before it starts; "Ended Sun, Nov 30" after its planned end.
   - Cadence line: "Deload every 5 weeks · weeks 5, 10" (the weeks inside this block, from the server); "No deload week in this block" when the cadence is longer than the block. When the current week is a deload week the position line reads "Week 5 of 6 · Deload week".
   - Split line: "Upper / Lower · 4 sessions" (the server's split label).
   - When the server reports items needing attention: "2 items need attention on the web" (muted), as the web's plan card.
3. **This week** section header with a week stepper: `‹  Week 3 of 6  ›`. Stepper buttons are 44-point, labelled "Previous week" / "Next week", disabled at week 1 and the last week. Under the header: the week's date range, and "Deload week" when it is one.
4. The week list (`Surface`, one row per calendar day, all seven): a date column (weekday and day number; today in `primary` with "Today"), then the session name with its state chip in History's words (Upcoming, In progress, Done, Skipped, Shifted), or "Rest" in muted text. Planned cardio on that day prints as a second line "Cardio · Bike · 20 min" with its own state word. Two sessions on one day (a shift can do that) print as two lines in that row. A day row with a session is a button that opens P2 for that session; a rest day is not a button.
5. **Sessions** section (`GroupedList`): the block's scheduled sessions in weekday order ("Monday · Upper A · 5 exercises"), then any unscheduled ones under "Not on the schedule". Each row opens P2.
6. Footnote: "Edit this plan on the web." with a text button "Open Plan on the web" (opens the web plan page in the browser). When the account also has drafts or earlier blocks: "1 draft and 2 earlier blocks are on the web."

**Empty state (no active block).** The header, then a `StateView` card: icon `list.bullet.rectangle`, title "No active plan", message "Build a block on the web and activate it. Today and History follow it here." (or, when drafts exist, "You have 2 drafts on the web. Activate one to train it."). Action "Open Plan on the web". Not an error, and no fabricated week.

**Block with no start date.** Cannot be active (activation needs a date), so not designed; the server answers "no active plan" for it.

**Loading.** Header, then a skeleton card the height of the block card and a skeleton list of seven rows. Changing week keeps the previous week on screen, dimmed, until the next answers (no jump).

**Error.** `LoadErrorState` ("Couldn't load your plan", Try again) in place of the card and lists. A failed week change shows an inline error line under the stepper with Try again and keeps the previous week.

**Behavior.** Pull to refresh. The plan re-reads when the tab comes back into view after a workout write (the day chips change). Nothing on the screen writes.

### P2 Session

**Purpose.** Show one planned session as authored: its day, its ordered exercises, their planned sets and rep targets, and the day's planned cardio.

**Trigger.** A session row or a day row on P1.

**Content.**

1. Native header: title the session name (back: "Plan").
2. Context line: "Monday · 5 exercises · Spring Block" ("Not on the schedule" for an unscheduled session; "No exercises" when empty).
3. Exercise list (`Surface`, one row per planned exercise in plan order, numbered 1…n):
   - a 48-point image tile (the library image, or a neutral tile with the exercise's first letter when there is none);
   - the name (wraps to two lines, then truncates; full name in the accessibility label), with "Custom" or "Archived" chip;
   - the prescription in the web's words: "3 sets · 6–8 reps"; a fixed target reads "4 sets · 5 reps";
   - a muted line: "Chest · Barbell"; a bodyweight exercise reads "Bodyweight · reps only".
   - An archived exercise keeps its slot, muted, with "Archived" and the line "Replace it on the web".
   - Each row opens X1.
4. Planned cardio for the session's weekday (when any): a row "Cardio · Bike · 20 min", muted note "Planned for Monday". Not a button.
5. Footnote: "This is the plan. A swap, a skipped exercise, or an extra set in a workout changes that workout only."

**Empty.** "No exercises yet. Add them on the web." in the list's place.

**Loading / error.** Skeleton rows; `LoadErrorState` with Try again. A session that no longer exists (deleted on the web) answers not-found: "This session isn't in your plan anymore" with "Back to Plan".

### L1 Exercises (library)

**Purpose.** Find any exercise the account can use — the shared library and their own — by name, muscle, or favorite.

**Trigger.** More → Exercises.

**Content.**

1. Native header "Exercises" with a trailing "+" (accessibility label "Add your own exercise") that opens L2.
2. Search field (in content, not a header search bar): placeholder "Search exercises", clear button, returns key "Search". Every word must match, in any order, as on the web. Typing re-queries after a short pause; the list keeps the previous results until the next answer.
3. Scope control: a two-segment control "All" / "Favorites".
4. Muscle filter: one horizontal row of chips, "All muscles" then the 16 groups in the web's order; one selected at a time (primary muscle only, as on the web).
5. Count line: "873 exercises" or "Showing 50 of 873".
6. Result rows (`Surface` list): image tile, name (two lines), "Chest · Barbell", "Custom" chip for the account's own, and a star button at the trailing edge (44 × 44).
7. "Show more" button at the end while more remain (50 more each time, up to the web's limit).

**Favorites.** The star toggles at once (optimistic) and reverts with an inline error banner if the server refuses. Unstarring inside the Favorites view leaves the row in place until the next refresh, as on the web, so a mis-tap can be undone.

**Empty states (each a successful answer).**

- No exercises at all: "The exercise library isn't available yet." (the catalog was never imported).
- Favorites, none yet: "No favorites yet. Star exercises you use to keep them here."
- Favorites, none matching: "None of your favorites match these filters."
- No match: "No exercises match “landmine”." with action "Add your own exercise" (opens L2 with the name prefilled).

**Loading.** Skeleton rows under the controls (controls stay usable).

**Error.** `LoadErrorState` ("Couldn't load exercises") in the list's place; the controls stay.

**Notice.** After L2 saves, an info banner at the top: "Added Landmine Press." with "View" (opens X1).

### X1 Exercise

**Purpose.** Identify an exercise: what it is, what it trains, whether it is the lifter's own, and whether it is a favorite.

**Trigger.** A row in L1 or P2, or "About this exercise" on a workout card.

**Content.**

1. Native header: title "Exercise" (back to the opener).
2. Image: the library image at full width in a rounded tile (aspect preserved, never cropped to hide the movement). No image (every custom exercise, and some library ones): no tile at all; the screen is text-first, never a broken image.
3. Name (title size, wraps), then "Chest · Barbell".
4. Chips: "Custom" for the account's own; "Archived" when archived.
5. A grouped list: "Primary muscle — Chest", "Secondary muscles — Shoulders, Triceps" (or "None"), "Equipment — Barbell", "Type — Library exercise / Your exercise".
6. Favorite button (secondary button, full width): "Add to favorites" / "In favorites" with star; hidden for an archived exercise (the server refuses it, as the web hides it).
7. "History and records" row: "On the web" with the external accessory (21i brings them to the phone).
8. Archive (own custom exercise, not archived, not opened from a workout): a destructive text button "Archive exercise" at the end of the content.

**Archive.** A system alert: title "Archive Landmine Press?", message "It leaves the library and the pickers. Past workouts and plans keep it.", buttons "Cancel" and "Archive" (destructive). On success: a success haptic, the "Archived" chip, the favorite button hides, and an info banner "Archived. Past workouts keep it." with "Undo". Undo restores and the banner reads "Restored." Undo is offered until the lifter leaves the screen (the web's toast window is a few seconds; a screen-scoped undo is the native equivalent of an inline banner instead of a toast). After leaving, there is no unarchive, as on the web.

**Loading / error / not found.** Skeleton block; `LoadErrorState`; "This exercise isn't available" for another account's or a missing id (identical to missing).

### L2 New exercise (modal)

**Purpose.** Add an exercise the library does not have, with the web's fields and rules.

**Trigger.** "+" on L1, or "Add your own exercise" on an empty search.

**Content.** Modal with header "Cancel" / "New exercise" / "Save".

| Field | Type | Required | Default | Validation (the shared rules, identical to the web) |
| --- | --- | --- | --- | --- |
| Name | text, words capitalized | yes | the search text when opened from an empty search | trimmed, 1–100 characters: "Enter a name." / "Keep the name to 100 characters or fewer." |
| Primary muscle | one of 16 chips (wrapping grid) | yes | none | "Choose a primary muscle." |
| Equipment | one of 13 chips | yes | none | "Choose the equipment." |
| Secondary muscles | any of 16 chips except the primary | no | none | "The primary muscle can't also be a secondary muscle." (choosing a primary removes it from the secondaries) |

A footnote: "Your own exercises have no image. Machines and cables keep their own working weights at each gym."

**Validation.** The shared parser runs on Save; field errors print under each field and the first is announced. The server's field errors (same words) map to the same places. Save shows a spinner and the fields lock while saving.

**Retry safety.** One save intent is one request identity. Tapping Save again after a timeout resends the same request, and the server answers with the first result instead of a second exercise. Changing any field after a failure starts a new intent.

**Failure.** A banner above the fields: "Couldn't add the exercise — Overload needs a connection. Your entries are still here." Nothing typed is lost. Duplicate names are allowed, as on the web (no duplicate detection exists).

**Success.** A light haptic; the modal closes; L1 shows "Added Landmine Press." with View.

### G1 Gyms

**Purpose.** See the gyms the lifter trains at and add one.

**Trigger.** More → Gyms.

**Content.** Native header "Gyms" with "+" (label "Add a gym"). A `GroupedList` of active gyms, alphabetical: name, the free-text location as a second line when present, chevron → G2. Footer: "Machines and cables keep their own working weights at each gym."

**Empty.** "No gyms yet. Add the gym you train at." with action "Add a gym".

**Loading / error.** Skeleton rows; `LoadErrorState` ("Couldn't load your gyms").

**Notice.** After G3 saves: "Added Northside Strength."

### G2 Gym

**Purpose.** Show one gym and let the lifter archive it.

**Content.** Native header "Gym". Name (title), location (or "No location"), plain text, never a link or map. An info line: "Machines and cables keep their own working weights here. A new gym starts fresh: the first workout at it sets them." A destructive text button "Archive gym".

**Archive.** System alert "Archive Northside Strength?" / "It leaves the gym pickers. Past workouts keep it, and its machine weights stay with it." / Cancel, Archive. On success: "Archived" chip and banner "Archived. Past workouts keep it." with Undo, as X1.

**Not available.** A gym missing from the list (archived elsewhere): "This gym isn't available" with "Back to Gyms".

### G3 New gym (modal)

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| Name | text | yes | 1–80 characters: "Enter a name." / "Keep the name to 80 characters or fewer." |
| Location | text, optional | no | up to 200 characters, plain text: "Keep the location to 200 characters or fewer." Hint: "Optional. An address or a note — never a map." |

Same retry-safety, failure, and success rules as L2. On success from Today's no-gym state, Today re-reads its gyms so Start works on the next tap.

### Workout card — "About this exercise"

The card's ••• action sheet lists "About this exercise" first, for every card in any workout state (an in-progress, finished, or skipped card). It opens X1 for the **performed** exercise, stacked over the workout, with no archive button. Back returns to the same card with typed values intact. Nothing is saved or swapped by opening it.

### Today — no gym yet

The existing state ("Add the gym you train at…") gets a native action "Add a gym" (G3). Copy: "Add the gym you train at to start." The web link is removed.

## 7. Navigation flows

```text
Plan tab ─► P1 ─(session row / day row)─► P2 ─(exercise)─► X1 ─back─► P2 ─back─► P1
More ─► Exercises (L1) ─(row)─► X1 ─back─► L1 (search, filters, scroll kept)
L1 ─(+ / Add your own)─► L2 modal ─Save─► closes ─► L1 notice [View] ─► X1
More ─► Gyms (G1) ─(row)─► G2 ─Archive─► G2 (archived, Undo) ─back─► G1 (list re-read)
G1 ─(+)─► G3 modal ─Save─► G1 notice
Workout ─(•••)─► "About this exercise" ─► X1 (over the workout) ─back─► same card
Today (no gym) ─[Add a gym]─► G3 ─Save─► Today ─[Start]─► gym sheet or start
```

- Each tab keeps its own stack, so switching tabs keeps P2 or L1 where they were.
- L1's search text and filters persist while L1 is in the stack (component state), and reset when the lifter leaves More's stack root.
- Modals are dismissed by Cancel or the swipe; a save in flight when the modal is dismissed never pops the screen underneath (the existing modal-close rule).

## 8. Interaction specifications

### Keyboard

| Context | Key | Action |
| --- | --- | --- |
| L1 search | Search (return) | dismiss the keyboard; results already update while typing |
| L2 / G3 name field | Next / Done | name → (G3) location; the last field's Done dismisses the keyboard |
| Any form | tap outside a field | dismisses the keyboard |

The keyboard never covers the focused field (`automaticallyAdjustKeyboardInsets`), and Save is in the header where the keyboard cannot reach it.

### Haptics

Light on a successful create; success on archive and undo; warning on a validation or save failure. The favorite star gives a light selection haptic. Nothing else.

### Loading and error

Every read has a content-shaped skeleton and a described failure (`describeLoadError`), never shown as empty. A failed write keeps what was typed and says why in one banner.

### Notifications

No toasts. Inline banners: "Added X." (info, with View on L1), "Archived. Past workouts keep it." (info, with Undo), and failures (error).

### Destructive actions

Archive (exercise, gym) is a short system alert naming the item and what stays, then an Undo banner. There is no delete.

## 9. Responsive behavior

iPhone only, portrait. Long names wrap (two lines in lists, unlimited on detail screens). At the largest accessibility text sizes the week list's date column stacks above the session line, chips wrap below names, and the filter chip row scrolls horizontally. Every action stays reachable without a hidden gesture.

## 10. Component inventory (native, `apps/mobile/src`)

| Component | Location | New / reused | Notes |
| --- | --- | --- | --- |
| `PlanScreen` | `plan/` | new | P1: block card, week, sessions; empty, loading, error |
| `WeekList` | `plan/` | new | seven day rows, Today marker, chips in History's words |
| `SessionScreen` | `plan/` | new | P2 |
| `PlannedExerciseRow` | `plan/` | new | prescription, bodyweight line, Custom/Archived |
| `LibraryScreen` | `library/` | new | L1 |
| `ExerciseRow`, `FavoriteStar` | `library/` | new | star is 44 × 44 with label and state |
| `ExerciseScreen` | `library/` | new | X1, two contexts (browse, workout) |
| `NewExerciseScreen` | `library/` | new | L2 |
| `ChipGroup` | `ui/` | new | wrapping single- or multi-select chips for forms and filters |
| `ExerciseImage` | `ui/` | new | image tile with letter fallback |
| `GymsScreen`, `GymScreen`, `NewGymScreen` | `gyms/` | new | G1–G3 |
| `Surface`, `Chip`, `GroupedList`, `ListRow`, `TabScreen`, `StateView`, `LoadErrorState`, `Banner`, `TextField`, `Button`, `Skeleton` | `ui/` | reused | |
| History's day-state words and tones | `history/` | reused (moved to a shared module) | one wording for both |

## 11. Accessibility, privacy, and data sensitivity

- Every row is one VoiceOver element: P1 day "Tuesday, November 24, today, Upper A, upcoming"; P2 "1, Barbell Bench Press, 3 sets, 6 to 8 reps, Chest, Barbell"; L1 "Barbell Bench Press, Chest, Barbell" with the star a separate button "Add Barbell Bench Press to favorites" (selected state when on).
- The week stepper's buttons say which week they go to ("Previous week, week 2").
- Chips are words; the Today marker is a word.
- Form fields have labels, errors are announced, chip groups are labelled groups of buttons with selected state.
- Images carry no information beyond the name and are hidden from VoiceOver.
- Dynamic Type: no fixed-height row; nothing truncates on a detail screen.
- Privacy: gym locations appear only on G1 and G2, never in a header, banner, or the workout. No map, geocoding, location permission, or external link from a gym. No share affordance anywhere. No other account's data or name.

## 12. Out of scope

- 21h deferred elsewhere: native plan building and editing (web-only), archived and draft block browsing (on the web), exercise history, records, charts, and goals (21i), account settings (21j), a native tour step (21k).
- Not built because the web has no such feature: editing a custom exercise, editing a gym, an archived-items screen, baseline review or correction. Recorded for the owner (Library & Gyms Setup's pending upstream amendment).
- Permanent non-goals: program generation, an AI coach, social or sharing, ads, dated goals, a rest timer, cardio progression, maps or GPS for gyms, user-uploaded images, any purchase flow in the app.

## 13. User guidance

The native tour does not exist yet (21k), and What's New is not shown in the app before 21j. No tour step or release note is added in 21h, as in 21g. Recorded as a Resolved Decision in the spec.

## 14. Plan placement and client scope

**Plan placement.** Everything in 21h is Free: the plan, the week, sessions, the library, favorites, custom exercises, and gyms. No screen shows a progression call, a suggested load, evidence, or exercise history, so there is no locked state. The exercise detail deliberately omits the web's history block (Pro-gated in part), leaving it to 21i.

**Client scope.**

| Surface | Shared logic | API | Web UI | Mobile UI | Why |
| --- | --- | --- | --- | --- | --- |
| Plan overview and week | calendar and deload rules, effective schedule (unchanged) | new read | unchanged | new P1 | roadmap 21h |
| Session | rep-target and prescription wording (prescription moves to shared) | new read | same text from shared | new P2 | parity |
| Library and favorites | library filters (unchanged) | new read and write | unchanged | new L1, X1 | roadmap 21h |
| Custom exercise create and archive | shared validation (unchanged) | new writes; create retry-safe | unchanged | new L2, X1 | roadmap 21h |
| Gyms create and archive | shared validation (unchanged) | new writes; existing list | unchanged | new G1–G3 | roadmap 21h |
| Workout "About this exercise" | — | the exercise read | none (the web card names link nowhere) | new sheet row | pitch §5.12 |

## 15. Mobile design (the native visual contract)

Built with `overload-mobile-ui` on the 21d–21g system: `TabScreen` for P1, the system back header for pushed screens, `Surface` cards, `Chip` words, `GroupedList` rows, tokens only, tabular figures, 16-point gutters. The visual review artifact (key screens and states in light and dark, illustrative data labelled as such) is the design canvas linked in the spec's Resolved Decisions and the feature PR. Where it and the layouts below differ, the layouts and tables in this document win.

### P1 Plan — Plan tab root

```text
┌──────────────────────────────────┐
│ YOUR TRAINING BLOCK              │
│ Plan                             │
│ ┌──────────────────────────────┐ │
│ │ Spring Strength      (Active)│ │
│ │ Mon, Nov 2 – Sun, Dec 13     │ │
│ │ Week 3 of 6                  │ │
│ │ Deload every 5 weeks · wk 5  │ │
│ │ Upper / Lower · 4 sessions   │ │
│ └──────────────────────────────┘ │
│ THIS WEEK          (‹) Wk 3 (›)  │
│ Mon, Nov 16 – Sun, Nov 22        │
│ ┌──────────────────────────────┐ │
│ │ MON 16  Upper A       (Done) │ │
│ │ TUE 17  Lower A    (Shifted) │ │
│ │ WED 18  Lower A       (Done) │ │
│ │ THU 19  Rest                 │ │
│ │•FRI 20  Upper B    (Upcoming)│ │ today: primary dot + "Today"
│ │  Today  Cardio · Bike · 20min│ │
│ │ SAT 21  Lower B    (Upcoming)│ │
│ │ SUN 22  Rest                 │ │
│ └──────────────────────────────┘ │
│ SESSIONS                         │
│ ┌──────────────────────────────┐ │
│ │ Monday · Upper A        5  › │ │
│ │ Wednesday · Lower A     4  › │ │
│ │ Friday · Upper B        5  › │ │
│ │ Saturday · Lower B      4  › │ │
│ └──────────────────────────────┘ │
│ Edit this plan on the web.       │
│ [Open Plan on the web]           │
└──────────────────────────────────┘
```

- **Native patterns:** tab root with the shared header (no native large title, RD-24); an in-place week stepper rather than a pushed week screen, because the week is the screen's second purpose and a push would separate it from the block it belongs to; pull to refresh.
- **States:** loading (skeleton card and seven rows), active, before start, ended, no active plan, error, unreachable (the load error describes it).
- **Differs from the web:** the web plan page shows the authored Mon–Sun template and puts the dated, effective week on History. The phone shows both on one screen: the dated week first (what happens when, in the account's today), then the template (what the plan contains). Same data, same words.

### P2 Session — Plan stack

```text
┌──────────────────────────────────┐
│ ‹ Plan          Upper A          │
│ Monday · 5 exercises ·           │
│ Spring Strength                  │
│ ┌──────────────────────────────┐ │
│ │ 1 [img] Barbell Bench Press  │ │
│ │         3 sets · 6–8 reps    │ │
│ │         Chest · Barbell    › │ │
│ │ 2 [img] Pull-up              │ │
│ │         3 sets · 10 reps     │ │
│ │         Bodyweight · reps only│ │
│ │ 3 [ L ] Landmine Press(Custom)│ │
│ │         3 sets · 8–10 reps   │ │
│ │ 4 [ ! ] Cable Fly  (Archived)│ │ muted slot
│ │         Replace it on the web│ │
│ ├──────────────────────────────┤ │
│ │ Cardio · Bike · 20 min       │ │
│ │ Planned for Monday           │ │
│ └──────────────────────────────┘ │
│ This is the plan. A swap, a      │
│ skipped exercise, or an extra    │
│ set in a workout changes that    │
│ workout only.                    │
└──────────────────────────────────┘
```

- **Differs from the web:** the web row shows the thumbnail and prescription; the phone adds the muscle and equipment line (and the bodyweight "reps only" note) because there is no hover or detail panel, and numbers each row so order is explicit.

### L1 Exercises — More stack

```text
┌──────────────────────────────────┐
│ ‹ More        Exercises        + │
│ [🔍 Search exercises          ⊗] │
│ [   All   |   Favorites   ]      │
│ (All muscles)(Chest)(Back)(Lo… → │
│ Showing 50 of 873                │
│ ┌──────────────────────────────┐ │
│ │[img] Ab Roller            ☆  │ │
│ │      Core · Other            │ │
│ │[img] Arnold Press         ★  │ │
│ │      Shoulders · Dumbbell    │ │
│ │[ L ] Landmine Press (Custom)☆│ │
│ │      Shoulders · Barbell     │ │
│ └──────────────────────────────┘ │
│ [          Show more         ]   │
└──────────────────────────────────┘
```

- **Native patterns:** an in-content search field (consistent with the app's fields, and keeps the controls in one scroll); a segmented control for All / Favorites; a horizontally scrolling chip row for the 16 muscles (a picker would hide the choice); a star button per row instead of a swipe action (no hidden gesture).
- **Differs from the web:** the web uses URL parameters and a load-more link; the phone keeps the same filters in screen state and the same page size.

### X1 Exercise — Plan or More stack, or over the workout

```text
┌──────────────────────────────────┐
│ ‹ Exercises      Exercise        │
│ ┌──────────────────────────────┐ │
│ │        [ exercise image ]    │ │ only when there is one
│ └──────────────────────────────┘ │
│ Barbell Bench Press              │
│ Chest · Barbell                  │
│ (Custom)  (Archived)             │ only when true
│ ┌──────────────────────────────┐ │
│ │ Primary muscle         Chest │ │
│ │ Secondary   Shoulders, Triceps│ │
│ │ Equipment            Barbell │ │
│ │ Type        Library exercise │ │
│ └──────────────────────────────┘ │
│ [ ☆  Add to favorites          ] │
│ ┌──────────────────────────────┐ │
│ │ History and records  On the web↗│
│ └──────────────────────────────┘ │
│ Archive exercise                 │ own custom, browse context only
└──────────────────────────────────┘
```

### L2 New exercise — modal

```text
┌──────────────────────────────────┐
│ Cancel     New exercise     Save │
│ Name                             │
│ [ Landmine Press               ] │
│ Primary muscle                   │
│ (Chest)(Back)(Lower Back)(Traps) │
│ (Shoulders●)(Biceps)(Triceps)…   │
│ Equipment                        │
│ (Barbell●)(EZ bar)(Dumbbell)…    │
│ Secondary muscles (optional)     │
│ (Chest)(Triceps●)(Core)…         │
│ Your own exercises have no image.│
└──────────────────────────────────┘
```

- **Native patterns:** a modal with header actions (the 21f rule: the keyboard never covers Save); wrapping chip grids instead of pickers, so every choice is visible and one tap.
- **Differs from the web:** the web uses selects and checkboxes; the fields, rules, and messages are identical.

### G1 Gyms, G2 Gym, G3 New gym — More stack and modal

```text
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ ‹ More          Gyms           + │   │ ‹ Gyms          Gym              │
│ ┌──────────────────────────────┐ │   │ Northside Strength               │
│ │ Harbor Barbell             › │ │   │ 410 Main St, 2nd floor           │
│ │ Northside Strength         › │ │   │ Machines and cables keep their   │
│ │ 410 Main St, 2nd floor       │ │   │ own working weights here. A new  │
│ └──────────────────────────────┘ │   │ gym starts fresh.                │
│ Machines and cables keep their   │   │                                  │
│ own working weights at each gym. │   │ Archive gym                      │
└──────────────────────────────────┘   └──────────────────────────────────┘
```

- **Differs from the web:** the web lists gyms with an inline archive menu and has no gym page. The phone gives each gym a small page so the destructive action is never one tap from a list row and the per-gym baseline rule is stated where the lifter looks. Same fields, same archive, same undo.
