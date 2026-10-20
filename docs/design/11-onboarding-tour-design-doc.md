# Onboarding Tour — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 11: Onboarding Tour (`pitches/11-onboarding-tour.md`)
**Focus:** A short, skippable, replayable walk over the real interface — Today, logging, Plan, History, Goals, Gyms, and Settings — on phone and desktop.

> Written by the autonomous pipeline run (2026-10-20). The skill's clarification interview does not apply in an unattended run (CLAUDE.md, Autonomous Pipeline Policy); questions it would have asked are decided below and marked **Decision**. The spec records each as a Resolved Decision.
>
> This pitch is the deliberate exception to the design-doc skill's "rule out tutorials and hand-holding copy": the product now has friends who did not build it (pitch §1). The tour is the only teaching surface, it appears once on its own, and it never leaves anything behind on a screen.

---

## 2. Vision

A friend opening Overload for the first time asks "what is all this, and where do I put my numbers?" The tour answers it in eight short stops on the screens they will actually use, then gets out of the way for good, and Settings can bring it back whenever they want a refresher.

**Design north star:** *point at the real thing, say one sentence, step aside.*

---

## 3. Design principles

### 1. The interface is the lesson

Every step highlights a real control on the real screen: a navigation item, a page heading, the Start button, the Replay button. No screenshots, no sample data, no reconstructed screens. If a control isn't on the screen, the step doesn't pretend it is (pitch §4.3, §9.8).

### 2. Explain, never require

The tour asks for nothing but Next, Back, Skip, and Done. Nothing in it creates a plan, logs a set, adds a gym, or sets a goal, and the highlighted control can't be activated during the tour, so following along can't change anything (pitch §4.1, no-gos).

### 3. Honest about an empty account

A new account has no plan, no history, and no gyms. Copy talks about what each area *is for* and what *will* appear ("When your plan has a workout today, it shows up here"). It never says a workout is waiting, and it never invents one (pitch §4.2 Today, Journey D).

### 4. Once on its own, any time on request

The tour opens by itself once, on a new account's first visit, and never again, whether it was finished, skipped, or abandoned. Settings → Tour replays the same tour at any time (pitch §4.4–4.6, §9.6).

### 5. The same tour at every width

There's one ordered list of steps. Each step names the controls it can point at, and the first one actually visible at the current width wins. On a computer, that's the rail item. On a phone, where the rail is gone, it's the menu button or the page heading. A step with nothing visible is skipped quietly (pitch §4.7, AC-3).

---

## 4. Visual language

All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

#### Color palette

| Token / theme path | Usage | Notes |
| ------------------ | ----- | ----- |
| `popover` / `popover-foreground` | The tour card surface and its text | The elevated surface in dark mode (`#1C1C1F`), white with a hairline border in light |
| `border` | Card hairline | Same as dialogs and menus |
| `muted-foreground` | Step counter ("3 of 8"), body copy | Body is secondary text, never on low contrast |
| `primary` | Spotlight ring around the target; Next / Done button | The accent is already the app's "this one" color (the active nav item); no new color |
| `ring` | Focus rings on card buttons | Stock |
| scrim `black/50` | The dimmed page around the spotlight | The value `DialogOverlay` already uses, so the tour reads like the app's other overlays |

No progress or deload color appears anywhere in the tour.

#### State colors (display only)

The tour has no status of its own to show. Inside the Settings Tour section, the replay button is a plain outline button whatever the account's history, so there's no "Completed" badge, no checkmark, and no "Not started". Whether someone finished or skipped is a fact the app keeps, not something to show back to them.

#### Typography, spacing, radius, elevation

| Element | Style |
| ------- | ----- |
| Step counter | `text-xs font-medium text-muted-foreground tabular-nums` |
| Step title | `text-base font-semibold` |
| Step body | `text-sm text-muted-foreground leading-relaxed`, one or two sentences |
| Card | `rounded-lg border bg-popover p-4 shadow-lg`, width `20rem` on desktop, full width minus `1rem` gutters on phone |
| Spotlight | the target's box plus `6px` padding, `rounded-lg`, `ring-2 ring-primary`, scrim cut around it |

The card is an overlay, so it gets the soft shadow that dialogs and menus get. Nothing else on the page changes elevation.

#### Appearance

Both modes come from tokens. In dark mode the scrim sits over a near-black page, so the spotlight's accent ring is what separates the target from its surroundings. The ring is always drawn and is never removed in dark mode. Motion is a 150 ms fade plus the spotlight sliding between targets (200 ms). Under `prefers-reduced-motion` both are instant.

---

## 5. Information architecture

```text
┌──────────────────────────────────────────────────────────────┐
│  Overload                                     [⋮ account]    │
├──────────────────────────────────────────────────────────────┤
│  Today ──────── 1 Today (heading)                            │
│                 2 Logging a workout (Start button, or the    │
│                   day's card when nothing is planned)        │
│                 3 Getting around (menu button, phone only)   │
│  Plan ───────── 4 Plan         (rail item · page heading)    │
│  History ────── 5 History      (rail item · page top)        │
│  Goals ──────── 6 Goals        (rail item · page heading)    │
│  Exercises      (not on the tour)                            │
│  Gyms ───────── 7 Gyms         (rail item · page heading)    │
│  Settings ───── 8 Settings     (Replay tour button)          │
│                 └ Tour section: [Replay tour]  ← entry point │
└──────────────────────────────────────────────────────────────┘
  md+: left rail (unchanged) · phone: header menu button → sheet (unchanged)
```

- The tour is an overlay over the authenticated shell. It has no route of its own and adds no navigation item.
- The tour visits Today, Plan, History, Goals, Gyms, and Settings in that order, using the app's own navigation, so the Back button and the URL stay truthful.
- **Decision:** Exercises is not a tour stop. The pitch and the PRD name seven areas, and Exercises isn't one of them. The phone "Getting around" step names it, so it isn't hidden. A later pitch can add a step as data.
- Settings is the only new visible element in the app: a **Tour** section with one button.

---

## Screen 1: The tour card and spotlight (shared presentation)

### Purpose
Show one step: highlight the real control and say what that area is for, with an obvious way on and an obvious way out.

### URL pattern
Overlay on the current step's route (`/`, `/plan`, `/history`, `/goals`, `/gyms`, `/settings`). `dialog`.

### Trigger
- The automatic first visit (Screen 3), or
- **Replay tour** in Settings (Screen 4).

### Layout — desktop (md+), card anchored beside its target

```text
┌───────────┬────────────────────────────────────────────────────┐
│ ▒▒▒▒▒▒▒▒▒ │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
│ ▒ Today ▒ │ ▒▒  Plan ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
│┌─────────┐│ ┌──────────────────────────────┐ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
││ ▦ Plan  ├┼─┤ 4 of 7                       │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
│└─────────┘│ │ Plan                         │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
│ ▒History▒ │ │ Build your training here …   │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
│ ▒ Goals ▒ │ │                              │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
│ ▒  …    ▒ │ │ [Skip tour]    [Back] [Next] │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
│ ▒▒▒▒▒▒▒▒▒ │ └──────────────────────────────┘ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
└───────────┴────────────────────────────────────────────────────┘
  ▒ = scrim (black/50). The spotlight is a clear, ring-outlined cut
  around the target. The card sits beside it, never on top of it.
```

### Layout — phone (below md), card docked at the bottom

```text
┌────────────────────────────────────┐
│ ┌──┐ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ ▒⋮▒│
│ │☰ │ ▒ Overload ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│  ← spotlight on the menu button
│ └──┘ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│
│ ▒ Welcome to Overload, Robin. ▒▒▒▒▒│
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│
│ ┌────────────────────────────────┐ │
│ │ 3 of 8                         │ │
│ │ Getting around                 │ │
│ │ Everything else is in this     │ │
│ │ menu: Plan, History, Goals, …  │ │
│ │                                │ │
│ │ [Skip tour]     [Back] [ Next ]│ │  ← 44px buttons, thumb reach
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

**Decision:** on a phone the card always docks at the bottom of the screen, `1rem` from each edge, and the target scrolls into view above it. Thumb reach outranks anchoring the card to the target: on phones the spotlight does the pointing, and the card stays where the thumb is. On desktop the card sits next to its target. It goes to the right of rail items and below or above everything else, whichever side fits. It's kept inside the viewport and never covers the target.

### Elements

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Scrim + spotlight** | one fixed element over the target's box: `rounded-lg ring-2 ring-primary` with the scrim drawn around it | Follows the target on scroll and resize. Catches every click outside the card, so nothing underneath can be pressed. A click on the scrim does nothing (it doesn't skip) |
| **Card** | `Dialog` content (modal, focus-trapped), `bg-popover border rounded-lg p-4 shadow-lg` | `role="dialog"`, labelled by the title and described by the body |
| **Counter** | `p` `text-xs font-medium text-muted-foreground tabular-nums` | "3 of 8". Counts the steps offered at this width (8 on a phone, 7 on desktop). If a step is skipped for a missing target, later numbers count the steps actually shown |
| **Title** | `DialogTitle` `text-base font-semibold` | The area's name |
| **Body** | `DialogDescription` `text-sm text-muted-foreground` | One or two sentences, from the registry |
| **Skip tour** | `Button variant="ghost"` (left) | Ends the tour and remembers it as skipped. The lifter stays on the current screen |
| **Back** | `Button variant="outline"` | Previous shown step (navigates back if it's on another screen). Hidden on the first step |
| **Next / Done** | `Button` (primary) | Next step, navigating if needed. On the last step it reads **Done**, ends the tour, records it as finished, and returns to the screen the tour started from |

Buttons are `h-9` on desktop and `h-11` on phones (44px targets). On narrow phones (below 360px), Skip tour wraps onto its own row above Back/Next and stays visible. It's never moved into a menu.

### Code reference

```tsx
<Dialog open modal onOpenChange={(open) => !open && skip()}>
  <Spotlight rect={targetRect} />
  <DialogContent
    showCloseButton={false}
    onInteractOutside={(e) => e.preventDefault()}
    className={cn(
      "w-[calc(100%-2rem)] max-w-none gap-3 border-border bg-popover p-4 shadow-lg",
      isPhone ? "inset-x-4 bottom-4 top-auto translate-x-0 translate-y-0" : "w-80",
    )}
    style={isPhone ? undefined : placement /* beside the target */}
  >
    <p className="text-xs font-medium text-muted-foreground tabular-nums">
      {position} of {total}
    </p>
    <DialogTitle className="text-base font-semibold">{step.title}</DialogTitle>
    <DialogDescription className="text-sm text-muted-foreground">
      {body}
    </DialogDescription>
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" onClick={skip} className="mr-auto h-11 md:h-9">
        Skip tour
      </Button>
      {position > 1 && (
        <Button variant="outline" onClick={back} className="h-11 md:h-9">Back</Button>
      )}
      <Button onClick={next} className="h-11 md:h-9" autoFocus>
        {isLast ? "Done" : "Next"}
      </Button>
    </div>
  </DialogContent>
</Dialog>
```

### Fields
None. The tour takes no input.

### Validation
None.

### Empty state
There's no empty tour. Empty *accounts* are handled by each step's copy and anchors (Screen 2). The step whose target can never be missing, the Today heading, is first, so the tour always has something to show.

### Loading state — moving between screens

```text
┌────────────────────────────────────┐
│ ▒▒ (previous screen, scrim, no ▒▒▒│
│ ▒▒  spotlight while it loads)  ▒▒▒│
│ ┌────────────────────────────────┐ │
│ │ 5 of 8                         │ │
│ │ History                        │ │
│ │ ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁       │ │  ← Skeleton in place of the body
│ │ [Skip tour]     [Back] [ Next ]│ │  ← Back/Next disabled; Skip works
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

- When Next or Back crosses to another screen, the card shows the next step's counter and title right away, with a one-line `Skeleton` in place of the body. Back and Next are disabled, and **Skip tour stays live**.
- The spotlight is hidden while the screen loads. It reappears, with the body, once the target is found on the new screen.
- On desktop, the card waits where it was until the new target is found, then moves beside it. On phones it doesn't move.

### Error state
- **A target that isn't there** (missing, hidden at this width, or inside a disabled region): the step is skipped silently, in the direction the lifter was going. There's no message, because nothing went wrong from their side (AC-3). If it was the last step, the tour ends as finished.
- **A screen that fails to load** (the app's error page): nothing on it matches the step, so it's skipped the same way after a short wait, and the next step navigates on. If nothing at all can be shown, the tour closes and records nothing.
- **Saving the outcome fails** (Skip or Done): the tour still closes at once. A toast says `Couldn't save your tour progress. It may open again next time.` (error, until dismissed). The lifter's actual training data is never involved.

### Behavior
- **Focus:** opening a step moves focus to **Next** (or **Done**). Tab cycles Skip → Back → Next inside the card. Nothing behind the scrim is focusable.
- **Escape** = Skip tour, the same outcome as the button.
- **While it's open**, the page behind can't be clicked, so the highlighted control can't be pressed. The page still scrolls (wheel/touch), and the spotlight follows.
- **Resizing across `md`** (rotating a tablet, resizing a window): the current step re-picks its target. For example, Plan moves from the rail item to the page heading. A phone-only step that's showing at the moment the window widens moves on to the next step.
- **Browser Back/Forward during the tour** ends it the way Skip does, because the lifter has chosen to go somewhere. The tour never fights the browser for the screen.
- Nothing is toasted on finish or skip. The tour closing is the confirmation.

---

## Screen 2: The steps

### Purpose
Fix the order, the targets, and the copy of the initial tour. They're data in one registry list, so a later pitch adds a step by adding an entry, and the `overload-onboarding` skill writes it.

### Rules every step follows
- **Order follows the lifter's journey**, from today's workout outward.
- **Stable id.** It never changes when the copy does.
- **Targets in priority order.** The first one present and visible at the current width is used. A target can carry its own body copy when the step should say something different there. That's how the logging step stays honest on an empty account.
- **Short copy.** A title and one or two plain sentences, second person, present tense, in the product's own words. No emoji, no "simply", no jokes.

### The initial tour

| # | id | Screen | Targets (first visible wins) | Title | Body |
| - | -- | ------ | ---------------------------- | ----- | ---- |
| 1 | `today` | Today `/` | Today heading (greeting + date) | **Today** | Each day starts here. When your plan has a workout today, it shows up below; rest days and finished days say so too. |
| 2 | `logging` | Today `/` | (a) **Start workout** / **Resume workout** button | **Logging a workout** | Start opens the workout one exercise at a time. On each card you enter the weight and reps you lifted, and Overload uses them to tell you when to progress, hold, or deload. |
| | | | (b) otherwise: the day's card (no plan, rest day, day complete, missed day) | **Logging a workout** | When a workout is planned, it appears here with a Start button. Each exercise gets its own card where you enter the weight and reps you lifted, and Overload uses them to tell you when to progress, hold, or deload. |
| 3 | `navigation` | Today `/` · **phone only** | Menu button | **Getting around** | Everything else is in this menu: Plan, History, Goals, Exercises, Gyms, and Settings. |
| 4 | `plan` | Plan `/plan` | (a) Plan rail item · (b) Plan heading | **Plan** | Build your training here: a mesocycle of weeks, sessions on the days you train, and the sets and rep ranges for each exercise. Overload follows the plan you write. |
| 5 | `history` | History `/history` | (a) History rail item · (b) the top of the History page | **History** | Every workout you log is kept here, week by week. Open a day to see what you lifted or correct a set. |
| 6 | `goals` | Goals `/goals` | (a) Goals rail item · (b) Goals heading | **Goals** | Set a weight-and-reps target for a lift and follow how close your best sets are getting. |
| 7 | `gyms` | Gyms `/gyms` | (a) Gyms rail item · (b) Gyms heading | **Gyms** | Machines and cables vary from gym to gym, so Overload keeps their working weights per gym. Free weights count the same everywhere. |
| 8 | `settings` | Settings `/settings` | **Replay tour** button | **Settings** | Your name, timezone, and appearance live here, under the ⋮ menu at the top. Come back to replay this tour any time. |

Width behavior, which the preview draws:

- **Desktop (md+):** 7 steps. Step 3 is phone-only and isn't offered. Steps 4–7 point at the rail item, and the page behind shows that area.
- **Phone:** 8 steps. Step 3 points at the menu button. Steps 4–7 point at the page heading (or, for History, the top of the page), because the rail doesn't exist on a phone. **Decision:** the tour doesn't open the navigation sheet. The sheet is a second modal layer and would fight the tour for focus and dismissal, and step 3 has already shown where the menu is (pitch §4.7 "how navigation sheets … work together"; §12 "must not leave the navigation sheet stuck open").

Empty account (Journey D): steps 1, 3–8 are unchanged. Plan, History, Goals, and Gyms show their own empty states behind the scrim ("No mesocycle yet. Create your first one.", "No active plan.", "No goals yet.", "No gyms yet. Add the gym you train at."), and the copy above never claims otherwise. Step 2 uses target (b), the "No active plan" card.

Missed day (replay only, since a new account can't have one): the dimmed workout under the missed-day prompt isn't usable, so step 2 points at the prompt's card with body (b).

### Layout
See Screen 1. The preview draws steps 1, 2 (both targets), 3, 4 (both widths), 5 (empty), 8, and the loading and missing-target frames.

### Behavior
- A step's body text never names a specific workout, exercise, or number from the account. It describes the area, so the same words work for every account.
- Highlighting is outline only. The target isn't moved, enlarged, or restyled.

---

## Screen 3: First visit — the tour opens by itself

### Purpose
Start the tour once for a new account, without a separate welcome screen.

### URL pattern
Any authenticated page, normally `/` right after signup. `dialog`.

### Trigger
The account's first authenticated page load, if the account has never been offered the tour.

### Layout
Today as it renders for the account (on a new account, the first-visit greeting and the "No active plan" card), with step 1 on top.

```text
┌────────────────────────────────────┐
│ [☰]  Overload                  [⋮] │
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │  ← spotlight
│ │ Welcome to Overload, Robin.    │ │
│ │ Today · Tue, Oct 20            │ │
│ └────────────────────────────────┘ │
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│
│ ▒ No active plan. ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│
│ ┌────────────────────────────────┐ │
│ │ 1 of 8                         │ │
│ │ Today                          │ │
│ │ Each day starts here. When …   │ │
│ │ [Skip tour]            [ Next ]│ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

### Behavior
- **Who gets it:** an account that has never been offered the tour, starting with the first visit after signup. **Accounts that existed before the tour shipped are treated as already offered** (standing resolution, pitch §4.6). They never see it open by itself, and Settings replays it for them.
- **Offered means used up.** **Decision:** the automatic offer is spent the moment the tour first appears. Whether the lifter finishes, skips, presses Escape, uses browser Back, closes the tab, or reloads mid-tour, it never opens by itself again. Settings is the way back. That keeps "a skipped or finished tour does not start again" true even for the lifter who just closes the tab, which is the same intent as pitch §9.6. It also means the tour doesn't follow someone around the app.
- If they land somewhere other than Today (a deep link on first sign-in), the tour opens there and its first step takes them to Today.
- The first-visit greeting ("Welcome to Overload, Robin.") is unchanged. The tour sits over it and doesn't replace it.
- The tour waits until the page underneath has rendered, then fades in. The page doesn't flash a different state first.
- **Done** returns them to Today, where they started. **Skip tour** leaves them on whichever screen they're on.

---

## Screen 4: Settings — Tour section (replay entry point)

### Purpose
The one permanent, recognizable way to take the tour again.

### URL pattern
`/settings`

### Trigger
Opening Settings from the account menu (all widths) or the phone navigation sheet.

### Layout

```text
┌────────────────────────────────────┐
│ Settings                           │
│ ┌ Profile ───────────────────────┐ │
│ │ …                              │ │
│ └────────────────────────────────┘ │
│ Appearance                         │
│ [ Light ] [ Dark ] [ System ]      │
│                                    │
│ Tour                               │  ← new section, h2
│ A short walk through Today, Plan,  │
│ History, Goals, Gyms, and Settings.│
│ [ Replay tour ]                    │  ← Button variant="outline"
│                                    │
│ ────────────────────────────────── │
│ Delete account                     │
│ …                                  │
└────────────────────────────────────┘
```

### Elements

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Section heading** | `h2` `text-base font-semibold` "Tour" | Same heading style as Appearance and Delete account |
| **Line** | `p` `text-sm text-muted-foreground` | "A short walk through Today, Plan, History, Goals, Gyms, and Settings." |
| **Replay tour** | `Button variant="outline"` with Lucide `RotateCcw` (`size-4`), `h-11 md:h-9` | Starts the tour at step 1. It's also step 8's target |

**Decision:** the section sits between Appearance and Delete account. It's a preference-level action, so it sits with the preferences, above the divider that sets the destructive action apart. The label is "Replay tour" because it names the action exactly and matches the pitch's "replay".

### Code reference

```tsx
<div className="space-y-2">
  <h2 className="text-base font-semibold">Tour</h2>
  <p className="text-sm text-muted-foreground">
    A short walk through Today, Plan, History, Goals, Gyms, and Settings.
  </p>
  <Button variant="outline" className="h-11 md:h-9" onClick={() => tour.start()}>
    <RotateCcw className="size-4" aria-hidden />
    Replay tour
  </Button>
</div>
```

### Fields / validation
None.

### Empty state
None. The button is always available, whether the tour was finished, skipped, never offered (an account from before the tour), or is open in another tab.

### Loading state
Settings already has its own loading skeleton. The Tour section renders with the page, so it needs no skeleton of its own.

### Error state
None to show. Replay needs nothing from the server to start.

### Behavior
- **Replay tour** → the tour opens at step 1, which takes the lifter to Today. The steps are the same as the first-visit tour.
- **Done** returns them to Settings, where they started. **Skip tour** leaves them where they are.
- Replaying never brings back the automatic offer, however the replay ends (pitch §4.5).
- Finishing or skipping a replay is remembered the same way, as the account's latest outcome. Nothing in the UI reads it back.

---

## 7. Navigation flows

```text
Signup ──► Today (first visit)
             └─ tour opens by itself (once, ever) ─┐
Settings ─► [Replay tour] ─────────────────────────┤
                                                   ▼
  1 Today ─► 2 Logging ─► 3 Getting around* ─► 4 Plan ─► 5 History ─► 6 Goals ─► 7 Gyms ─► 8 Settings ─► [Done]
     /          /              /               /plan    /history    /goals     /gyms     /settings      │
                                     * phone only                                                       ▼
                                                                                 back to where it started
  [Skip tour] / Escape / browser Back at any step ─► closes; stays on the current screen
  Target missing at this width ─► step skipped in the direction of travel
```

- The tour moves between screens with ordinary client navigation, so each screen's URL is real and its server-rendered content is the account's own.
- Back/Next between steps on the same screen doesn't navigate.
- Back from a step on another screen navigates back to that step's screen.
- No query parameters, no tour route, no deep link into the tour (**Decision:** a later What's New entry that wants to show a step uses the mechanism's "start at this step" entry point; nothing in this pitch exposes it in a URL).

---

## 8. Interaction specifications

#### Keyboard navigation

| Context | Key | Action |
| ------- | --- | ------ |
| Tour card | Enter / Space | Activates the focused button (Next by default) |
| Tour card | Tab / Shift+Tab | Cycles Skip tour → Back → Next/Done, trapped in the card |
| Tour card | Escape | Skip tour |
| Settings | Enter on **Replay tour** | Starts the tour |

No arrow-key shortcuts are added. The tour is three buttons.

#### Loading states
See Screen 1. The skeleton replaces only the body line. The card keeps its size so the buttons don't jump under the thumb.

#### Error states
Covered under Screen 1: a missing target is skipped silently, a failed screen is skipped, and a failed save gets a toast that the tour may reappear.

#### Notifications

| Action | Message | Severity | Duration |
| ------ | ------- | -------- | -------- |
| Saving the tour outcome failed | `Couldn't save your tour progress. It may open again next time.` | error | until dismissed |

There's no success toast for finishing, skipping, or replaying.

#### Destructive actions
None. Skipping is reversible from Settings, so there's no confirmation dialog: "Skip tour" closes at once.

---

## 9. Responsive behavior

| Breakpoint | Width | Behavior |
| ---------- | ----- | -------- |
| base | below 640px | Card docked at the bottom, full width minus 1rem gutters. 44px buttons. 8 steps, including "Getting around" on the menu button. Area steps point at page headings |
| `sm` | 640–767px | Same as base (the rail appears only at md) |
| `md` | 768px and up | Card anchored beside its target, 20rem wide. 7 steps. Area steps point at rail items |
| `lg` | 1024px and up | As md |

- Every action (Next, Back, Skip, Done, Replay) is available at every width.
- The tour never points at the rail on a phone, and never at the menu button on desktop. Both are guaranteed by "first *visible* target wins", not by hoping the widths line up (D4: every step's target exists on its screen at phone and desktop widths).
- The phone navigation sheet stays closed for the whole tour.

---

## 10. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `TourProvider` | app shell (wraps the authenticated app) | new | Owns whether the tour is open and which step it's on. Starts it automatically when the account is due. Exposes "start" to the Settings button |
| `TourOverlay` | app shell | new | Spotlight + card for the current step. Reads steps only from the registry |
| `TourCard` | inside the overlay | new | Variants: docked (phone), anchored (desktop), loading (body skeleton). Last step reads "Done" |
| `Spotlight` | inside the overlay | new | Ring-outlined cut in the scrim over the target's box |
| Tour step registry | data | new | The ordered list in Screen 2. The only place steps live |
| `ReplayTourButton` | Settings → Tour section | new | Outline button, Lucide `RotateCcw` |
| Tour targets | rail items (Plan, History, Goals, Gyms), menu button, Today heading, Today start button, Today day card, page headings, Replay button | reused | Each gets a stable target name. No visual change |
| `Dialog`, `Button`, `Skeleton`, Sonner | shadcn/ui | reused | No new dependency, no third-party tour library (standing resolution) |

---

## 11. Accessibility, privacy, and data sensitivity

Accessibility:

- The card is a modal dialog with a title and description. Screen-reader users hear "Plan, dialog. Build your training here…" and the counter as "Step 4 of 7".
- Focus moves into the card on every step and is trapped there. When the tour ends, focus returns to **Replay tour** if that's where it started, and otherwise to the top of the page.
- Escape always ends the tour.
- The spotlight is decorative (`aria-hidden`). The step's meaning is in the card text, never in the highlight alone.
- Buttons are 44px tall on phones.
- Reduced motion: no fades or sliding.

Privacy:

- What a step says comes only from the registry. It never includes another account's data, and it never names the lifter's own exercises, numbers, gyms, or addresses.
- Whether an account finished or skipped the tour is private to that account. Nothing displays it, and nothing about it can be seen from another account.
- The tour adds no analytics, tracking, or external requests.

---

## 12. Out of scope

From the pitch:

- Video or narration; tooltips on every control; contextual hints or help bubbles outside the tour; separate per-feature tutorials.
- Interactive exercises during the tour; any sample, fake, or seeded plan, workout, goal, gym, or history.
- AI or conversational onboarding.
- Changes to the desktop rail or the phone navigation sheet; a general Settings redesign.
- What's New (release-notes modal, page, release-seen tracking); email of any kind; third-party tour, analytics, or CMS services.
- A tour stop for Exercises (not one of the seven areas; addable later as data).

Deferred (roadmap): reps-in-reserve logging; exercise history and PR views; the Apple platform work; HealthKit and body metrics; nutrition.

Permanent non-goals: program or mesocycle generation; social features or any visibility between accounts; cardio progression analysis; a public product (open signup flows beyond what the owner set, billing, admin, social login, email verification); dated goals and a rest timer.

---

## 13. User guidance

This pitch *builds* the guidance mechanism, so the tour itself is its user guidance:

- **Tour steps:** the eight steps in Screen 2 are the initial registry. They're written to the `overload-onboarding` rubric, so the copy is short, anchored to real controls, follows the lifter's journey, uses stable ids, and works at phone and desktop widths.
- **Release-note entry:** none. What's New has not shipped. The `overload-onboarding` skill's availability rule means it does nothing for a mechanism that doesn't exist yet, so no entry and no substitute format are written. When What's New ships, the tour's introduction can be announced there if the owner wants.
- **How existing lifters learn about new steps later:** a new step never reopens the tour on its own. Lifters find it through a What's New entry (once that exists, which can start the tour at that step) or by replaying the tour from Settings.

---

## 14. Open questions

None. Every design-stage question the pitch left open is decided above (marked **Decision**) and carried into the spec's Resolved Decisions.
