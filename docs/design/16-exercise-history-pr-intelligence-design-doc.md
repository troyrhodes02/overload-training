# Exercise History & PR Intelligence — Design Document

**Version:** 1.1
**Pitch Source:** Overload — Pitch 16: Exercise History & PR Intelligence (`pitches/16-exercise-history-pr-intelligence.md`)
**Focus:** One page per exercise that answers "how has this lift actually been going?": what to do next, the records, the trend, every session with the call it led to, and the goals set on it — all read from the logged sets, within the right gym for machines and cables.

> Written in an unattended pipeline run (CLAUDE.md, Autonomous Pipeline Policy). The skill's clarification step does not apply: every design-stage question the pitch delegates (pitch §14, "Decisions delegated to design and spec") is decided here, marked **Decision**, and carried into the spec's Resolved Decisions. Authority: the pitch; the approved multi-user planning set (Pitch Roadmap → Exercise History & PR Intelligence, three Definition-of-Done criteria); `CLAUDE.md`; the Progressive Overload Engine, Goals, Guided Workout Logging, RIR Logging & Autoregulation, and Smarter & Explainable Progression specs; `docs/planning/method-note.md`; and the code on `main` at `8752e94`. The spec owns the data contract; this document fixes what the lifter sees and the rules in the lifter's terms so the preview and the spec share one source.

---

## 1. What exists today (the baseline this changes)

The exercise page already exists at `/exercises/[id]`. It is reached from the exercise library, the logging card (`View trend ›`), the day-complete summary (`trend ›`), and a goal (`e1RM trend ›`). Today it shows:

| Region | Today |
| ------ | ----- |
| Header | Back link `‹ Exercises`, a large image (left column on desktop), name, Custom/Archived badges, favourite star, Primary / Also trains / Equipment, Archive (custom only). |
| Progression | The tag and the two-line recommendation (Smarter & Explainable Progression), or `Not enough history yet: 1 of 2 complete sessions.`; a gym selector when a machine/cable has history at 2+ gyms (`?gym=`); the e1RM chart (finished sessions, deload-week points as hollow squares), `Current 246 lb`, `N sessions · Epley estimate`. Bodyweight: `e1RM not available for bodyweight-only logging.` |

What it does not show, and the pitch requires: the sessions themselves, the loads and reps behind the trend, records (best set, best e1RM, heaviest weight, rep records), the calls the engine made along the way, and the goals set on this lift. That is the whole of this pitch: **the existing exercise page becomes the exercise's history.**

The facts this page may use, and nothing else:

| Fact | Source (unchanged by this pitch) |
| ---- | -------------------------------- |
| Sets, loads, reps, RIR | Logged sets, as corrected (Guided Workout Logging, RIR Logging) |
| Gym-variable or comparable everywhere | `isGymVariable(exercise)` — machine and cable only |
| Reps-only (bodyweight) | `requiresExternalWeight(exercise)` |
| e1RM | `estimateOneRepMax` (Epley; 1 rep = the weight), session e1RM = the best working set's |
| The call and its two lines | The engine's decision + `buildRecommendation` (Smarter & Explainable Progression) |
| Which sessions count | complete workout, every planned working set present, not a scheduled-deload week (Progressive Overload Engine) |
| Goal progress, reached, archived | The Goals feature, unchanged |

---

## 2. Vision

A lifter opens Bench Press and, without adding anything up in their head, sees what to do next and why, the best they have actually done, how the lift has moved, and every session with the call it led to. Nothing on the page is a number the logged sets can't back up, and a machine's numbers never leave the gym they were lifted at.

**Design north star:** *the lift's logbook, kept honest — records, not rewards.*

---

## 3. Design principles

### 1. Answer the lifter's questions in their order
The page reads top to bottom as: *what do I do next?* → *what's the best I've done?* → *is it going up?* → *what did I actually do each time?* → *what am I aiming for?* Every region answers one of those, in that order; nothing is a statistic for its own sake (pitch §9.11).

### 2. An estimate always says it is one
e1RM appears only labelled as an estimate (`Best e1RM · estimate`, `Epley estimate`), and always next to the actual set it came from. A performed set is shown as the weight and reps lifted (`205 × 10`), never reduced to an estimate (pitch §9.1).

### 3. One gym's machine is one record book
For a machine or cable, everything on the page — records, trend, sessions, calls — is one gym's. The page says which gym, and switching gym swaps the whole book. There is no "all gyms" view for a machine, so no figure can ever compare two gyms' plates (pitch §4.10, §9.2). Free weights, plate-loaded, and bodyweight lifts have one book for every gym, as today.

### 4. Records, not rewards
A record is a labelled row with a value, a date, and the set behind it. No badges on records, no colour reserved for "new PR", no icons, no streaks, no animation, no exclamation marks. The progress and deload colours stay reserved for the engine's calls (pitch §4.18, AC-3).

### 5. Missing is not zero
No history is a stated fact, never an empty chart or a `0`. One session shows its real numbers but no trend and no call. A call is shown only where the engine can make one from the sets as they stand (pitch §4.14, §4.15, §9.7).

---

## 4. Rules in the lifter's terms

These are the definitions the preview draws and the spec makes exact. They are design decisions because they decide what the lifter reads; none changes how the engine, Goals, or logging work.

### 4.1 The scope ("which book")

**Decision.** A gym-consistent exercise has one scope: all of its history at every gym. A machine or cable has one scope per gym it has history at, plus `No gym recorded` if any of its history has no gym (legacy rows; logging has required a gym since Guided Workout Logging). The page shows exactly one scope at a time; the default is the gym trained at most recently. The scope applies to every region except Goals (§4.7) and About.

### 4.2 What counts toward records and the trend

**Decision.** Records and the trend read the **working sets of finished workouts outside scheduled deload weeks** — the same sets Goals already measures against ("demonstrated strength": a finished workout's planned working sets, even when fewer were done than planned). Extra sets beyond the plan, an unfinished workout, and the deload week are left out of records, so a goal's "best" and this page's best e1RM are always the same set. They are still shown in Sessions. The trend chart keeps showing deload-week sessions as hollow points, as it does today, but they never set a record.

### 4.3 The records

| Record | Definition (lifter's terms) | Shows |
| ------ | --------------------------- | ----- |
| **Best set** | The working set with the highest e1RM — the same "best set" Goals and the e1RM trend already use. Ties: the earliest. | `205 × 10` · date |
| **Best e1RM** · *estimate* | That set's e1RM. Same set as Best set by construction, so the two can never disagree; one is what was lifted, the other what it estimates. | `273 lb` · `from 205 × 10` |
| **Heaviest weight** | The heaviest load on any working set; at that load, the most reps; ties: the earliest. A real completed set — never a planned weight, a suggestion, or an e1RM. | `225 × 3` · date |
| **Rep records** | For each load, the most reps done at that load **or heavier** — listed only where it beats every heavier load's best. A lighter, longer set never appears "above" a heavier one, and no two loads are scored against each other. Capped at 6 rows, heaviest first. | table: `225 lb — 3 reps`, `215 — 5`, `205 — 10`, `185 — 12` |
| **Bodyweight: Most reps** | Reps-only lifts have no load and no e1RM: the one record is the most reps in a single working set. | `20 reps` · date |

**Decision (rep records).** The pitch asks for rep records that "do not misleadingly equate performances at different loads" (§4.9, §9.6). The rule above is the standard rep-max frontier: a set is listed only if nothing heavier was done for as many reps. Reading down the table, load goes down and reps go up; nothing implies one row is "better" than another. The top row is always the Heaviest weight.

**Decision (best set).** The pitch requires a documented, non-arbitrary ranking (§4.7). The codebase already has one: `bestWorkingSet`, the set behind every session's e1RM and every goal's "best". Reusing it means no second ranking exists. The page keeps it distinct from the estimate by showing the set as lifted and the estimate as its own labelled row.

### 4.4 The calls (recent progression decisions)

**Decision.** There is no stored history of calls and there won't be one (pitch §9.9, CLAUDE.md "derived values are computed on read"). The call shown beside a session is **the engine's call on the history up to and including that session** — the same engine, same rules, same scope, run on the sets as they stand now. So:

- It is what the current rules say that history showed, not a record of what the screen said on that day. The section says so in one line.
- Correcting a set changes the calls after it, just as it changes the current one (pitch Journey I).
- The newest counted session's call is, by construction, the current call (§5 Screen 1 "Next time"); the page never shows two different calls for the same history.

What each row shows in the **Call** column:

| The session was… | Call column |
| ---------------- | ----------- |
| counted, enough history | the engine's tag as everywhere else: `Progress`, `Deload`, `Hold — trend flat`; an ordinary hold is the muted word `Hold` (no badge, no colour) |
| counted, not enough history yet | muted `Not enough history` |
| in a scheduled deload week | muted `Deload week` — the planned-recovery voice; no reactive call (suppression) |
| finished with fewer working sets than planned | muted `Not counted` (planned sets missing — it doesn't count toward progression, as History already says) |
| still in progress (today) | muted `In progress` |
| in the `No gym recorded` scope | nothing — machine calls are made per gym only (Progressive Overload Engine) |

No other value is ever shown; a row whose call cannot be worked out shows one of the muted states above rather than a guess.

### 4.5 Working weight and reps over time

**Decision.** Sessions are the primary record of load and reps: each row prints its sets exactly as logged (`185 × 8 · 8 · 7`, RIR beneath when recorded). The trend gives the picture over time in two views:

- **e1RM** (loaded lifts): the existing chart, unchanged — one point per finished session, Epley estimate, deload-week points hollow.
- **Weight** (loaded lifts): one point per finished session = the **heaviest working-set load** of that session, with its reps in the tooltip and the accessible table. Every plotted number is a load that was actually on the bar — never an average or median that nobody lifted. Deload-week points are hollow, exactly like the e1RM view, so a planned drop reads as planned.
- **Reps** (bodyweight lifts, the only view): one point per finished session = the most reps in a working set.

Neither chart colours a decrease, adds arrows, or computes a change percentage. A drop is just a lower point.

### 4.6 How little history is enough

| History in scope | Next time | Records | Trend | Sessions |
| ---------------- | --------- | ------- | ----- | -------- |
| none | hidden | hidden | hidden | one empty block covers all four |
| 1 finished session | `Not enough history yet: 1 of 2 complete sessions.` (existing line) | shown — they are real sets | the value as text, no chart: `One session so far: e1RM 246 lb. The trend starts at two.` | the session, call `Not enough history` |
| 2+ finished sessions | the call (or the insufficient line if fewer than 2 count) | shown | chart | all |

**Decision.** A chart needs at least 2 points to draw (a single point is not a trend, pitch §9.7). The call follows the engine's own minimum (`MIN_QUALIFYING_SESSIONS`, 2), never a page-specific threshold.

### 4.7 Goals on this lift

**Decision.** The Goals region lists every goal ever set on this exercise, regardless of the selected gym: the active one first (target, percent, best so far — exactly as the Goals page shows it), then past goals newest-archived first, each `Reached` or `Archived` with its date. A machine or cable goal names its gym (`at Downtown Gym`), because a goal is already measured at its own gym only; listing them together compares nothing. Each row opens the existing goal page. If there is no active goal and the exercise can take one (loaded, not archived), a quiet `Set a goal` link opens the existing goal form for this exercise (and the selected gym for a machine). Bodyweight lifts show one muted line instead: `Goals use a weight × reps target, so reps-only lifts don't have them.`

### 4.8 Archived exercise, archived gym

- An archived exercise's page shows its whole history exactly as an active one does, with the `Archived` badge; it loses only the actions that create something new (favourite, archive, Set a goal).
- An archived gym stays in the gym selector as `Downtown Gym (archived)`, and its sessions, records, and calls stay readable. Nothing is filtered by archive state on this page except those create-new actions.

---

## 5. Visual language

All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

| Token / theme path | Usage | Notes |
| ------------------ | ----- | ----- |
| `background`, `card`, `border` | page, the records block, the sessions list | records sit in one bordered card, not one card per record |
| `foreground` | record values, set lines, action line of a strong call | tabular numerals everywhere |
| `muted-foreground` | labels, dates, captions, `Hold`, muted call states, RIR line, estimate label | |
| `primary` | links (`View all`, workout dates, goal rows), the chart line | links are text, not buttons |
| `progress`, `deload` | only inside the existing `ProgressTag` | never on a record |

| State | Visual treatment | Usage |
| ----- | ---------------- | ----- |
| Progress (computed) | existing `ProgressTag` "Progress" | Next time, Call column |
| Deload (computed) | existing `ProgressTag` "Deload" | Next time, Call column |
| Hold — trend flat (computed) | existing `ProgressTag` with icon | Next time, Call column |
| Hold (computed) | no tag; the muted word `Hold` in the Call column only | Call column (Next time keeps its muted two lines) |
| Scheduled deload week | muted text `Deload week`; hollow chart point | Call column, charts |
| Archived exercise / gym | `Archived` badge / `(archived)` suffix, text stays readable | header, selector, session rows |
| Goal `Reached` / `Archived` | muted text label, never coloured | Goals |

**Typography.** Record values `text-xl font-semibold tabular-nums` (Best set) and `text-lg` (others); labels `text-xs text-muted-foreground`; set lines `text-sm tabular-nums`. Section headings `text-base font-medium`, as on the existing Progression section. Light and dark both through tokens; the charts already style from CSS variables.

---

## 6. Information architecture

```text
┌────────────────────────────────────────────────────────────┐
│  Overload shell (rail on md+, top bar + menu on phone)     │
├────────────────────────────────────────────────────────────┤
│  Exercises (/exercises) ── library                         │
│     └─ Exercise history (/exercises/[id])   ← THIS PAGE    │
│          ?gym=<id>|none   which record book (machines)     │
│          ?sessions=all    every session, not just recent   │
│          → workout detail (/history/[loggedSessionId])     │
│               (corrections happen there, unchanged)        │
│          → goal (/goals/[goalId]), new goal (/goals/new/…) │
│                                                            │
│  Entry points into this page (no new navigation item):     │
│   Library row ················ existing                    │
│   Logging card "View history ›" · renamed, gym kept        │
│   Day complete "history ›" ···· renamed                    │
│   Goal page "Exercise history ›" renamed                   │
│   Workout detail: exercise name → link (new)               │
└────────────────────────────────────────────────────────────┘
```

**Decision (entry points).** The page stays where it is and every existing way in keeps working; the links that said "trend" now say "history" because the page now holds more than the trend, and links from a machine's context carry its gym (`?gym=`) so the lifter lands in the right book. The one new way in is the exercise name on a logged workout (History → a day), which is where a lifter already is when asking "how has this been going?". No navigation item, tab, or route is added (pitch §14 "without introducing unrelated navigation changes"). The logging card's link appears whenever the exercise has finished history in the card's scope — bodyweight included, since the page now has something for it.

---

## 7. Screens

## Screen 1: Exercise history — populated, gym-consistent (Barbell Bench Press)

### Purpose
Show everything about one lift's history in the order a lifter asks about it.

### URL pattern
`/exercises/[id]` (`?from=` back-link context, unchanged; `?sessions=all`)

### Trigger
Any entry point in §6.

### Layout — phone (375)

```text
┌─────────────────────────────────────┐
│ ‹ Exercises                         │
│ [img] Barbell Bench Press        ☆  │
│       Chest · Barbell               │
├─────────────────────────────────────┤
│ Next time                           │
│ [Progress]                          │
│ Try 190 lb next time (+5 lb)        │
│ 8 reps on every set, 2 sessions     │
│ running                             │
├─────────────────────────────────────┤
│ Records                             │
│ ┌─────────────────────────────────┐ │
│ │ Best set                        │ │
│ │ 205 × 10            Oct 3       │ │
│ │─────────────────────────────────│ │
│ │ Best e1RM · estimate │ Heaviest │ │
│ │ 273 lb               │ 225 × 3  │ │
│ │ from 205 × 10        │ Sep 12   │ │
│ │─────────────────────────────────│ │
│ │ Rep records                     │ │
│ │ 225 lb ............ 3   Sep 12  │ │
│ │ 215 lb ............ 5   Sep 26  │ │
│ │ 205 lb ........... 10   Oct 3   │ │
│ │ 185 lb ........... 12   Aug 29  │ │
│ └─────────────────────────────────┘ │
│ Working sets of finished workouts.  │
│ Deload weeks don't count.           │
├─────────────────────────────────────┤
│ Trend            [ e1RM | Weight ]  │
│ Current 246 lb                      │
│ ╭─────── line chart ───────╮        │
│ 14 sessions · Epley estimate        │
├─────────────────────────────────────┤
│ Sessions                            │
│ The call each session led to, from  │
│ your sets as they are now.          │
│ Oct 17 · Downtown Gym   [Progress]  │
│ 190 × 8 · 8 · 8                     │
│ RIR 2 · 1 · 1                       │
│ ─────────────────────────────────── │
│ Oct 14 · Downtown Gym         Hold  │
│ 190 × 8 · 7 · 7                     │
│ ─────────────────────────────────── │
│ Oct 10 · Northside     Deload week  │
│ 170 × 8 · 8 · 8                     │
│ …                                   │
│ [View all 14 sessions]              │
├─────────────────────────────────────┤
│ Goals                               │
│ 225 × 5 ·············· 87%  ›       │
│ Best 205 × 10 · Oct 3               │
│ Past                                │
│ 205 × 5 · Reached Sep 26        ›   │
├─────────────────────────────────────┤
│ About                               │
│ [ large image ]                     │
│ Primary  Chest                      │
│ Also     Shoulders, Triceps         │
│ Equipment Barbell                   │
└─────────────────────────────────────┘
```

### Layout — desktop (md+)

```text
┌──────────────────────────────────────────────────────────────────────┐
│ ‹ Exercises                                                          │
│ [img] Barbell Bench Press                                        ☆   │
│       Chest · Barbell                                                │
├───────────────────────────────────────────┬──────────────────────────┤
│ Next time                                 │ Records                  │
│ [Progress] Try 190 lb next time (+5 lb)   │  Best set  205 × 10      │
│ 8 reps on every set, 2 sessions running   │  Best e1RM 273 lb est.   │
│                                           │  Heaviest  225 × 3       │
│ Trend                  [ e1RM | Weight ]  │  Rep records (table)     │
│ ╭──────────── wider chart ───────────╮    │                          │
│                                           │ Goals                    │
│ Sessions                                  │  active + past           │
│ date · gym · sets · RIR ········ call     │                          │
│ …                                         │ About                    │
│ [View all 14 sessions]                    │  image, muscles, equip.  │
└───────────────────────────────────────────┴──────────────────────────┘
```

**Decision (hierarchy).** Order at every width: Next time → Records → Trend → Sessions → Goals → About. The large image moves from the top of the page to About: on a history page the lifter came for numbers; the image is still one scroll away and unchanged for library browsing.

**v1.1 amendment (implementation, spec R30).** The two-column desktop layout above is superseded: the app shell keeps every authenticated page in one centered column (`max-w-screen-sm`, 640px), where a 20rem side column would leave the main column narrower than a phone. Desktop uses the phone order in that column; the chart gains height (240px), not a second column — the same rule as every other page (§10 `lg`: "charts gain width, not more elements"). The preview's desktop frames were regenerated to match.

### Header

| Element | Component / styling | Behavior |
| ------- | ------------------- | -------- |
| Back link | existing `‹ Exercises` (rebuilt from `?from=`) | unchanged |
| Thumb | `ExerciseThumb size="sm"` | decorative (`aria-hidden` via the existing component) |
| Name | `h1 text-xl font-semibold`; muted when archived | |
| Meta | `text-sm text-muted-foreground` `Chest · Barbell` | |
| Badges | `Badge` `Custom` / `Archived` (existing) | |
| Favourite | existing `FavoriteButton` | hidden when archived (existing) |

### Next time

The existing `ProgressTag` + `Recommendation` (two lines, "next time"), exactly what the page shows today and what the day-complete summary shows for the same evaluation. Insufficient: the existing note. Hidden when there is no history in scope. The heading is `Next time` because the page advises the next session (Smarter & Explainable Progression's time word for this page).

### Records

| Element | Component / styling | Behavior |
| ------- | ------------------- | -------- |
| Container | one `rounded-lg border bg-card` block, rows divided by `border-t` | no per-record cards, no icons |
| Best set | label `text-xs muted`; value `205 × 10` `text-xl font-semibold tabular-nums`; unit `lb` small; date muted right | static text |
| Best e1RM | label `Best e1RM` + `· estimate` muted; `273 lb`; `from 205 × 10` muted | static |
| Heaviest | `225 × 3`, date | static |
| Rep records | `<table>` with caption `Rep records`, columns Weight / Reps / Date (sr-visible headers), max 6 rows | static; overflow rows not shown (§4.3) |
| Caption | `Working sets of finished workouts. Deload weeks don't count.` | |

### Trend

| Element | Component / styling | Behavior |
| ------- | ------------------- | -------- |
| View switch | shadcn `Tabs` (`e1RM`, `Weight`), small, right of the heading | switches the chart; client island; default e1RM; not in the URL |
| e1RM view | existing `E1rmChart` + `Current 246 lb` + `14 sessions · Epley estimate` (+ `· ▫ deload week` when any) | unchanged |
| Weight view | the same chart frame plotting the heaviest working-set load per session; tooltip `190 lb × 8, 8, 8`; header `Last 190 lb` | hollow deload points |
| Bodyweight | no switch; heading `Trend` with a `Reps` chart (most reps in a working set per session); header `Last 20 reps` | |
| Accessible table | visually hidden table with every point (date, value, sets, deload) | as today |

### Sessions

| Element | Component / styling | Behavior |
| ------- | ------------------- | -------- |
| Caption | `The call each session led to, from your sets as they are now.` | one line |
| Row | `li` with a top border; line 1: date link (`text-primary`) `Oct 17` + ` · Downtown Gym` (gym-consistent only) left, call right; line 2: sets; line 3 (only when any RIR): `RIR 2 · 1 · 1` muted xs; line 4 (only when swapped): `In place of Incline Press` muted xs | the date opens the workout (`/history/[id]`), where the set can be corrected |
| Set line | working sets `190 × 8 · 8 · 7` when the load is the same on every set; `185 × 8 · 190 × 7 · 190 × 6` when it changes; extra sets after ` + ` muted (`+ 135 × 12`); bodyweight `18 · 16 reps` | exactly the logged values |
| Call | §4.4 table | `ProgressTag` or muted text, right-aligned, never wraps under the date on 320+ |
| Not counted reason | `title`/`sr-only`: `2 of 3 planned sets` | |
| More | `View all 14 sessions` link → `?sessions=all`; then `Show recent only` | shown only when more than 10 |

**Decision.** 10 most recent by default (newest first), all on request; a list, not a table, so it reads on a phone without sideways scrolling (pitch §13 "should not rely on desktop-sized tables").

### Goals

| Element | Component / styling | Behavior |
| ------- | ------------------- | -------- |
| Active goal | row link: `225 × 5` + gym when machine + `87%` + thin progress bar (existing Goals bar) + `Best 205 × 10 · Oct 3` / `No performance recorded yet` | opens `/goals/[goalId]` |
| Past goals | `Past` label; rows `205 × 5 · Reached Sep 26` / `Archived Aug 2` | open the goal |
| Empty, eligible | `No goal on this lift.` + `Set a goal` link | opens `/goals/new/[exerciseId]` (+`?gymId=` for a machine's selected gym, active gyms only) |
| Bodyweight | the one muted line in §4.7 | |

### About

The existing large `ExerciseThumb size="lg"`, the Primary / Also trains / Equipment list, and the custom exercise's Archive button, moved down unchanged.

### Empty state (Screen 3) · Loading state · Error state

- **Loading:** `loading.tsx` skeletons follow the new order: header line, a two-line block, a records block, a chart rectangle, three list rows. Nothing jumps when data arrives.
- **Error:** the app's existing error boundary; this page performs no writes, so there is nothing to preserve.

### Behavior
- Read-only. Opening, switching gym, switching chart view, or expanding sessions writes nothing: no set, weight, baseline, goal, plan, or seen-state changes (pitch §4.19).
- Switching gym replaces `?gym=` (no new history entry) and re-renders every scoped region on the server.
- Keyboard: the gym `Select` and the `Tabs` are standard shadcn keyboard controls; every link is a native link.

## Screen 2: Exercise history — machine or cable at two gyms (Chest Press Machine)

```text
┌─────────────────────────────────────┐
│ ‹ Exercises                         │
│ [img] Chest Press Machine        ☆  │
│       Chest · Machine               │
│ History at [ Downtown Gym      ▾ ]  │
│ Machines differ between gyms, so    │
│ each gym keeps its own records.     │
├─────────────────────────────────────┤
│ Next time                           │
│ Stay at 140 lb next time            │
│ Last time: 12, 11, 10 of 10–12 at   │
│ Downtown Gym                        │
├─────────────────────────────────────┤
│ Records · Downtown Gym              │
│ Best set 150 × 10 …                 │
├─────────────────────────────────────┤
│ Trend · Downtown Gym  [e1RM|Weight] │
├─────────────────────────────────────┤
│ Sessions · Downtown Gym             │
│ Oct 16                       Hold   │
│ 140 × 12 · 11 · 10                  │
├─────────────────────────────────────┤
│ Goals                               │
│ 160 × 10 at Northside ······ 74% ›  │
└─────────────────────────────────────┘
```

| Element | Component / styling | Behavior |
| ------- | ------------------- | -------- |
| Scope line | `History at` + shadcn `Select` (`size="sm"`, `aria-label="Gym for this history"`) listing gyms with history, most recent first; `Northside (archived)`; `No gym recorded` last when such rows exist | changes `?gym=`; whole page re-scopes |
| One gym only | the scope line reads `History at Downtown Gym` as plain text, no selector | |
| Explainer | one muted line under the scope, always shown for machines/cables | the only "why" copy on the page; it is the gym rule, not a tutorial |
| Section labels | `Records · Downtown Gym`, `Trend · Downtown Gym`, `Sessions · Downtown Gym` | so a screenshot of any region still names its gym |
| Session rows | no per-row gym (the scope is the gym) | |
| `No gym recorded` scope | records, trend, sessions as usual; Next time shows `Calls for machines are made per gym.`; Call column empty | §4.4 |

**Decision (gym context).** A selector, not stacked per-gym sections and not side-by-side columns: side-by-side numbers invite exactly the comparison the rule forbids. The default gym is the most recent one trained at, which is also where the lifter most likely is.

## Screen 3: Empty (never logged)

```text
┌─────────────────────────────────────┐
│ ‹ Exercises                         │
│ [img] Cable Fly                  ☆  │
│       Chest · Cable                 │
├─────────────────────────────────────┤
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│   No sets logged yet.               │
│   Log it in a workout and its       │
│   sessions, records, and trend      │
│   show up here.                     │
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
├─────────────────────────────────────┤
│ Goals                               │
│ No goal on this lift.  Set a goal   │
├─────────────────────────────────────┤
│ About …                             │
└─────────────────────────────────────┘
```

One dashed-border block (the existing chart empty style) replaces Next time, Records, Trend, and Sessions. No zeros, no empty axes, no sample data, no "Add to plan" (pitch §4.15). A machine with no history shows no gym selector.

## Screen 4: Sparse (one finished session)

```text
│ Next time                           │
│ Not enough history yet: 1 of 2      │
│ complete sessions.                  │
│ Records                             │
│ Best set 185 × 8 · Oct 20 …         │
│ Trend                               │
│ One session so far: e1RM 216 lb.    │
│ The trend starts at two.            │
│ Sessions                            │
│ Oct 20 · Downtown  Not enough history│
│ 185 × 8 · 8 · 7                     │
```

Rep records with one session hold that session's frontier (often one row). Nothing says "new record" — the first set is simply the record.

## Screen 5: Bodyweight (Pushups)

Records: one row `Most reps in a set 20 · Oct 6`. Trend: `Reps` chart, `Last 20 reps`. Sessions: `20 · 20 reps`. Next time: the existing bodyweight lines (`Next time, go past 20 reps or make it harder`). Goals: the one muted line. No e1RM anywhere, no `lb`.

## Screen 6: Archived exercise / archived gym

Archived exercise: header muted with `Archived` badge, no favourite; every history region as Screen 1; Goals without `Set a goal`. Archived gym: in the selector as `Northside (archived)`; on gym-consistent rows `Northside (archived)`.

## Screen 7: Entry-point copy (existing surfaces)

| Surface | Before | After |
| ------- | ------ | ----- |
| Logging card | `View trend ›` (loaded lifts with a trend) | `View history ›` when the exercise has finished history in this card's scope, any loading mode; machines link with `?gym=` of the card's gym |
| Today → day complete | `trend ›` | `history ›` (same condition, `?gym=` for machines at the workout's gym) |
| Goal page | `e1RM trend ›` | `Exercise history ›` (already carries `?gym=`) |
| History → a workout | exercise name is plain text | exercise name links to its history (`?gym=` for machines at that workout's gym); the `(as planned)` / `(swapped from …)` note stays plain |

---

## 8. Navigation flows

```text
Library ──tap row──▶ Exercise history ──date──▶ Workout detail ──edit set──▶ (saved)
                         ▲                                         │
                         └──────────── back / reopen ◀─────────────┘
                         (records, trend, calls recomputed on read)

Logging card ─View history›─▶ Exercise history (?gym=<card's gym>)
Day complete ─history›─────▶ Exercise history (?gym=<workout gym> for machines)
Goal page ─Exercise history›▶ Exercise history (?gym=<goal gym>)
Workout detail ─exercise name─▶ Exercise history (?gym=<workout gym> for machines)
Exercise history ─goal row─▶ Goal page;  ─Set a goal─▶ Goal form (existing)
```

`?gym=` with an id the account has no history at falls back to the default scope silently (it's navigation state, not data). `?sessions=all` survives a gym switch.

---

## 9. Interaction specifications

| Context | Key | Action |
| ------- | --- | ------ |
| Gym select | Enter / Space / arrows / Esc | standard shadcn `Select` |
| Trend view | Left / Right | standard shadcn `Tabs` |
| Everything else | Tab | links in reading order |

- **Loading:** server-rendered; route `loading.tsx` skeleton (§7 Screen 1).
- **Errors:** none specific; no mutation on this page.
- **Notifications:** none. No toast on opening, no "new record" notice anywhere.
- **Destructive actions:** only the existing custom-exercise Archive (unchanged, in About).

---

## 10. Responsive behavior

| Breakpoint | Behavior |
| ---------- | -------- |
| base (<640) | single column in the phone order; records block full width (Best e1RM and Heaviest side by side); session rows two to four lines; chart 180px; at 320px the call drops below the date line rather than truncating |
| `sm` | same, roomier |
| `md` | the same single column inside the shell's centered 640px column (R30); chart 240px; session rows keep the same lines (no table) |
| `lg` | content max width as the shell; chart gains width, not elements |

Every action (gym switch, chart view, view all sessions, goal links, workout links) exists at every width.

---

## 11. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `ProgressTag` | Next time, Call column | reused | unchanged |
| `Recommendation` | Next time | reused | unchanged |
| `E1rmChart` | Trend | reused | e1RM view unchanged |
| `GymSelector` | scope line | reused | label and archived suffix; adds `none` scope |
| `ExerciseRecords` | Records | new | server component; static text and a table |
| `ExerciseTrend` | Trend | new | client island: Tabs + one Recharts line chart per view (reusing the e1RM chart's frame and deload dot) |
| `SessionHistoryList` | Sessions | new | server component |
| `ExerciseGoals` | Goals | new | server component; reuses the Goals progress bar |
| `ExerciseThumb`, `FavoriteButton`, `ArchiveExerciseButton` | header / About | reused | |

---

## 12. Accessibility, privacy, and data sensitivity

- Every record row is text with a visible label; the estimate is labelled in words, not by style.
- The rep-record table has a caption and column headers; charts keep a visually hidden data table with every point, including the sets behind a Weight point.
- Calls are words (`Hold`, `Deload week`, `Not counted`), never colour alone; `ProgressTag` keeps its text and icon.
- The gym select has an accessible name; the Tabs announce the selected view.
- Account isolation: the page shows only the acting account's sets, records, calls, and goals; a library exercise is shared, but its history on this page is the viewer's own. Another account's exercise id is not-found, the same as a missing one.
- No share, export, compare-with-friends, or leaderboard element. Gym addresses never appear (names only, as today).

---

## 13. User guidance

This pitch adds a visible capability, so the last ticket runs `overload-onboarding` (tour and What's New both shipped).

- **Tour step — recommended, the skill decides.** The history lives on a page the tour never visits: the tour mentions "Exercises" only inside the phone menu list. The capability is discovered by opening an exercise, which a new lifter has no reason to do. Recommended: one step on `/exercises`, in journey order after Goals, anchored to the Exercises rail item on desktop and the page heading on a phone (two new anchors, the same pattern the Plan/History/Goals/Gyms steps use). Illustrative copy — **Exercises:** "Every lift in the library. Open one to see its history: your sessions, records, the trend, and what Overload suggests next." Existing steps stay unchanged and keep their ids.
### Tour steps added

Decided by `overload-onboarding` in OVE-72 (spec R31). Same columns as the Onboarding Tour's initial table; the registry's copy is pinned to this table.

| # | id | Screen | Targets (first visible wins) | Title | Body |
| - | -- | ------ | ---------------------------- | ----- | ---- |
| 7 | `exercises` | Exercises `/exercises` | (a) Exercises rail item · (b) Exercises heading | **Exercises** | Every exercise in the library, plus any you add. Open one to see its history: your sessions, best sets, the trend, and what to do next time. |

- **Release note — significant.** Illustrative — **Exercise history and records:** "Open any exercise to see every session you've logged, your best set and heaviest weight, rep records, the e1RM and weight trends, and the call each session led to. Machines and cables keep their records per gym." Dated the day it reaches production (merge day), never earlier.

---

## 14. Out of scope

From the pitch: new progression rules or thresholds; RIR rule changes; a second recommendation wording; new strength metrics (volume, fatigue, readiness, velocity); logging-card or set-entry changes beyond the link label; correction-flow changes (corrections stay on the workout detail); goal deadlines, suggested goals, or goal changes; gamification of any kind; social comparison; cross-gym machine comparison or an "all gyms" machine view; program generation; a general analytics dashboard (no date-range pickers, filters, exports, or custom charts); external services.

Deferred (roadmap): the Apple platform work, HealthKit, nutrition.

Permanent non-goals: program generation, social features, cardio progression analysis.

---

## 15. Open questions

None. Every pitch §14 question is decided above: entry points (§6), hierarchy (§7 Screen 1), best set (§4.3), rep records (§4.3), recent decisions (§4.4), gym context (§4.1, Screen 2), sparse data (§4.6), archived context (§4.8), responsive interaction (§10).
