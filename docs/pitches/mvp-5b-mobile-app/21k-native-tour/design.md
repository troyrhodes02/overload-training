# Native Tour — Design Document

**Version:** 1.0 (pipeline run of 2026-11-25)
**Pitch Source:** Overload — Pitch 21k: Native Tour (`pitch.md` in this folder)
**Focus:** A short guided tour of the iPhone app, drawn as native coach marks over the real screens, with the existing tour words and the existing per-account tour record.
**Client scope:** Mobile (iOS). The web gets no visible change. Server: two additive mobile API endpoints over the existing `tour/progress.ts`, and one additive `app-config` field. See §14.
**UI preview:** Skipped, because this is a mobile-only pitch. The native visual contract is the Mobile design section (§15), built with `/overload-mobile-ui`. The visual review artifact is the design canvas linked from §15.

---

## 1. Vision

A lifter who opens the tour sees the app they are about to use, not a slideshow about it. Each step dims the screen except for one real control, says in a sentence or two what it is for, and moves on. It takes about a minute, it never touches their training, and it gets out of the way the moment they tap Skip.

## 2. Design principles

### 1. Point at the real thing, or say so
A highlight is drawn only around a control that is on screen and measured. When the control isn't there (no plan yet, still loading, another tab busy), the card explains the step in words, with no cut-out. A highlight is never guessed.

### 2. A tour is read-only
The overlay absorbs every touch, so the highlighted Start button can't be pressed through it. The tour never calls a training endpoint, never starts a workout to show the logging card, and never pops a screen the lifter left open.

### 3. One set of words
The titles and bodies are the web tour's (`@overload/shared/tour/content`). Native changes a sentence only where the web wording would be wrong on the phone, and those adaptations live beside the canonical words in the same shared file.

### 4. Quiet
No confetti, no badges, no progress bar animation, no "you did it". A counter, a title, a sentence, three buttons.

### 5. Never in the way
Skip is on every card and during every wait. Leaving ends the tour completely: the overlay is unmounted, not hidden.

## 3. Visual language

The 21d–21j native system, tokens only.

| Element | Token |
| --- | --- |
| Dim layer | `theme.overlay` (black at 50%) in both appearances |
| Spotlight ring | 2 pt `colors.primary`, `radius.lg`, 6 pt padding around the target |
| Card | `colors.card`, 1 pt `colors.border`, `radius.xl`, 16 pt padding (the `Surface` treatment) |
| Counter | `Eyebrow` ("STEP 3 OF 9"), muted |
| Title | `Text size="lg" weight="semibold"`, `accessibilityRole="header"` |
| Body | `Text size="base"`, foreground |
| Where line (fallback only) | `Text size="sm" tone="muted"` |
| Buttons | `Button` primary (Next / Done / Start tour), secondary (Back), text (Skip tour / Not now) |

Dark mode: the 50% black dim over the charcoal background is subtle, so the primary ring and the card's border carry the emphasis. Light mode: the dim is strong and the card is clean white.

## 4. Information architecture

```text
More (tab root)
└── Updates & help
    ├── What's New
    ├── Take a tour            ← new row (subtitle: "A one-minute walkthrough of the app")
    ├── Send feedback
    └── Get help

Take a tour → Intro card (over More)
  → 1 Today          Today tab        screen title
  → 2 Logging        Today tab        Start/Resume button, else the day's block, else words
  → 3 Getting around Today tab        words above the tab bar (no highlight)
  → 4 Plan           Plan tab         screen title
  → 5 History        History tab      screen title
  → 6 Goals          Goals tab        screen title
  → 7 Exercises      More tab         Exercises row
  → 8 Gyms           More tab         Gyms row
  → 9 Settings       More tab         Take a tour row → Done
```

Nine steps, in the shared journey order. The web's `plan-import` (a web-only Pro feature) and `plan-billing` (no purchase path on the phone; the plan is one row on More) are not native steps.

## 5. Surfaces affected

| Surface | Change |
| --- | --- |
| M1 More | New **Take a tour** row in Updates & help. Exercises, Gyms, and Take a tour rows are tour anchors. |
| T1 Today | The screen title, the Start/Resume button, and the day's block are anchors. |
| P1 Plan, H1 History, G1 Goals | Each screen title is an anchor. |
| New: tour overlay | Intro card, step card, fallback card, locating state. |

No other screen changes.

## 6. Screen specifications

### K0 Take a tour row (M1)
A plain `ListRow`: title "Take a tour", subtitle "A one-minute walkthrough of the app", no chevron (it opens an overlay, not a screen). Always shown, for every account, whatever its tour record says.

### K1 Intro card
Centered on the dimmed More screen, no cut-out.
- Title: **Take a quick tour**
- Body: "A one-minute walk through the app. It only shows you around: nothing in your training changes, and you can skip at any time."
- Actions: **Start tour** (primary), **Not now** (text).
- "Not now" closes it and records nothing (a manual launch backed out of is not a skipped tour).

### K2 Step card (with a highlight)
The spotlight cut-out around the target, and the card placed below it when the target's center is in the top half of the screen, otherwise above it, always inside the safe area and clear of the tab bar.
- Counter "STEP n OF 9" (only steps shown count).
- Title and body.
- Actions: **Skip tour** (text, left), **Back** (secondary, hidden on step 1), **Next** (primary; **Done** on the last step).

### K3 Fallback card (no highlight)
Used when a target can't be measured (absent, still loading after the bounded wait, off screen and not scrollable into view, or on a tab whose stack the lifter left open). The card is centered, with no cut-out, and adds one muted "where" line, for example "Find this in the Goals tab." Same actions as K2. It is a normal step: advanceable, skippable, counted.

### K4 Note card (step 3, Getting around)
No highlight by design: the tab bar is a system control the app can't measure. The card sits just above the tab bar, with the native wording: "Use the tabs along the bottom to get around: Today, History, Plan, Goals, and More. Exercises, Gyms, and your settings are under More."

### K5 Locating state
While the tour switches tab and waits for the next target, the dim stays and the previous card is removed. After 400 ms with nothing found, a small spinner appears in the middle. **Skip tour** stays at the bottom the whole time. The wait is bounded (3 s), then K3.

### K6 Refused launch
If Take a tour is somehow pressed while something sits over the tabs (a workout, a form), the tour doesn't open and a system alert says: "Finish what you're doing first" / "Then open Take a tour from More." In practice the row is only reachable on the More tab's root, so this is a safety net.

### Step content (native)

| # | Id | Title | Body | Target |
| --- | --- | --- | --- | --- |
| 1 | today | Today | shared, verbatim | Today title |
| 2 | logging | Logging a workout | shared, verbatim, with the Start/Resume button; shared alternate body ("When a workout is planned, it appears here with a Start button. …", moved from the web registry) with the day's block or in words | Start/Resume → day block → K3 |
| 3 | navigation | Getting around | **native:** see K4 | none (K4) |
| 4 | plan | Plan | **native:** "Your training plan lives here: the weeks of your mesocycle, the sessions on the days you train, and the sets and rep ranges for each exercise. You build and edit it on the web; Overload follows the plan you write." | Plan title |
| 5 | history | History | shared, verbatim | History title |
| 6 | goals | Goals | shared, verbatim | Goals title |
| 7 | exercises | Exercises | shared, verbatim | Exercises row |
| 8 | gyms | Gyms | shared, verbatim | Gyms row |
| 9 | settings | Settings | **native:** "Your profile, time zone, and appearance live here in More. Come back to Take a tour to see this again any time." | Take a tour row |

The plan body changes because native Plan is read-only (21h). The settings body changes because the web's "Account & app section of the navigation" doesn't exist on the phone. History's "correct a set" holds on native (21f).

## 7. Navigation flows

- **Start.** More → Take a tour → K1 → Start tour → step 1 (switches to Today).
- **Between steps.** Next or Back re-runs "go to the step's tab, wait, measure". Switching tabs uses the app's router. A tab is entered only when its stack is at its root; otherwise the step is shown as K3 without moving, so a half-filled goal form or a pushed detail screen is never popped.
- **Done.** Records `completed`, removes the overlay, and returns to More (the last step is already on More).
- **Skip tour.** Records `skipped`, removes the overlay, and returns to More (where the tour was launched).
- **Interrupted.** Backgrounding the app, signing out, the session ending, a suspension, or a navigation the tour didn't make all end the tour at once with the overlay removed. Navigation is left where it is. Only the foreign navigation records `skipped` (the web's rule); the others record nothing.

## 8. Interaction specifications

- Every touch outside the card is absorbed. The highlighted control is not tappable.
- Next, Back, and Skip act once: a second tap during the move is ignored.
- Haptics: none. The tour is not an achievement.
- Motion: the overlay fades in and out (the system Modal fade). With Reduce Motion on, it appears and disappears with no animation. Steps swap with no animation in either case. Scrolling a target into view is never animated.
- Scrolling: when a target is outside the visible area of its screen, the tour scrolls that screen so the target sits near the top, then measures again. If it still can't be seen, K3.

## 9. Responsive behavior

iPhone portrait only (the app's support). The card width is the screen minus 32 pt. With large text the card scrolls inside itself up to the space available, and the buttons stack vertically (Next, Back, Skip tour), each full width. The spotlight is clipped to the visible area between the status bar and the tab bar.

## 10. Component inventory (native, `apps/mobile/src`)

| Component | New / changed |
| --- | --- |
| `tour/TourProvider` | New. State, navigation, measuring, writes, the dormant auto-start gate. |
| `tour/TourOverlay` | New. The Modal, the dim layer with its cut-out, the ring, and the cards. |
| `tour/anchors` (`TourAnchor`, `TourScrollProvider`) | New. Registers a measurable view under a name, while its screen is focused. |
| `ui/ScreenHeader`, `ui/TabScreen` | Optional `tourAnchor` prop on the title. |
| `ui/GroupedList` `ListRow` | Optional `tourAnchor` prop. |
| More, Today | Anchors and the new row. |

## 11. Accessibility, privacy, and data sensitivity

- The overlay is a Modal, so VoiceOver stays inside the card. Each step moves VoiceOver focus to the card's title, read as "Logging a workout, step 2 of 9, heading".
- The highlight is never the only cue: each card's accessibility label names what is highlighted ("Highlighting the Start workout button") or where to find it.
- The dim layer is hidden from VoiceOver. The two-finger scrub (escape) skips the tour.
- Buttons are 44 pt or taller and have plain labels.
- Dynamic Type: all card text scales; the card scrolls; buttons stack.
- Contrast: card text uses foreground on card in both appearances; the ring uses primary.
- Privacy: the tour reads nothing about the account beyond what each screen already shows, logs nothing, and adds no analytics.

## 12. Out of scope

Turning on the automatic first-login tour (21l). A release note (RD-N). The web's What's New "Show me" deep start on native. Highlighting individual tab bar items. Any change to the web tour's steps or words.

## 13. User guidance

This pitch is the guidance mechanism itself. The web tour is unchanged (its words are untouched; one alternate sentence moves into the shared package with the same text). No release note: the "Overload on iPhone" entry is 21l's (21j RD-6).

## 14. Plan placement and client scope

- **Plan placement:** Free. No capability check anywhere.
- **Client scope:** mobile. Platform impact:
  - **Shared:** native adaptations of three bodies, the intro card, and the moved alternate logging body in `@overload/shared/tour/content`; response types for the two endpoints; `AppConfigDto.tourAutoStart`.
  - **API:** `PUT /me/tour/outcome` and `POST /me/tour/offered`, additive, over `recordTourOutcome` and `markTourOffered`. `app-config.tourAutoStart` from `MOBILE_TOUR_AUTO_START` (unset = false).
  - **Web UI:** none.
  - **Mobile UI:** K0–K6.

## 15. Mobile design (the native visual contract)

Built with `overload-mobile-ui` on the 21d–21j system: `GroupedList` rows on More, the `Surface` card treatment, `Button` variants, tokens only. The visual review artifact (K0, K1, K2 with a highlight, K3, K4, K5, and large text, in light and dark, with illustrative data labelled as such) is the design canvas linked in the spec's RD-21. Where it and the layouts below differ, this document wins.

### K1 Intro — over More

```text
┌────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░│  dimmed More
│░░┌──────────────────────┐░░│
│░░│ Take a quick tour    │░░│
│░░│ A one-minute walk    │░░│
│░░│ through the app. It  │░░│
│░░│ only shows you       │░░│
│░░│ around: nothing in   │░░│
│░░│ your training        │░░│
│░░│ changes, and you can │░░│
│░░│ skip at any time.    │░░│
│░░│ ┌──────────────────┐ │░░│
│░░│ │   Start tour     │ │░░│
│░░│ └──────────────────┘ │░░│
│░░│       Not now        │░░│
│░░└──────────────────────┘░░│
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│ Today History Plan Goals More  (dimmed too)
└────────────────────────────┘
```

### K2 Step — Logging, highlighting Start workout on Today

```text
┌────────────────────────────┐
│░ TUESDAY, NOVEMBER 25 ░░░░░│
│░ Today ░░░░░░░░░░░░░░░░░░░░│
│░┌──────────────────────┐░░░│
│░│ Upper A · 6 exercises│░░░│  (dimmed card)
│░└──────────────────────┘░░░│
│ ╭────────────────────────╮ │  primary ring, cut-out
│ │     Start workout      │ │
│ ╰────────────────────────╯ │
│░┌──────────────────────┐░░░│
│░│ STEP 2 OF 9          │░░░│
│░│ Logging a workout    │░░░│
│░│ Start opens the      │░░░│
│░│ workout one exercise │░░░│
│░│ at a time. …         │░░░│
│░│ Skip tour [Back][Next]│░░│
│░└──────────────────────┘░░░│
└────────────────────────────┘
```

### K3 Fallback — Goals while the Goals tab has a form open

```text
┌────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│░░┌──────────────────────┐░░│
│░░│ STEP 6 OF 9          │░░│
│░░│ Goals                │░░│
│░░│ Set a weight-and-reps│░░│
│░░│ target for a lift …  │░░│
│░░│ Find this in the     │░░│
│░░│ Goals tab.           │░░│
│░░│ Skip tour [Back][Next]│░│
│░░└──────────────────────┘░░│
└────────────────────────────┘
```

### K4 Note — Getting around

```text
┌────────────────────────────┐
│░░░░░░░ dimmed Today ░░░░░░░│
│░┌──────────────────────┐░░░│
│░│ STEP 3 OF 9          │░░░│
│░│ Getting around       │░░░│
│░│ Use the tabs along   │░░░│
│░│ the bottom … under   │░░░│
│░│ More.                │░░░│
│░│ Skip tour [Back][Next]│░░│
│░└──────────────────────┘░░░│
│ Today History Plan Goals More  (dimmed, visible)
└────────────────────────────┘
```

### Large text — the card's buttons stack

```text
│░┌──────────────────────┐░│
│░│ STEP 7 OF 9          │░│
│░│ Exercises            │░│
│░│ Every exercise in    │░│
│░│ the library, …  (scrolls)
│░│ ┌──────────────────┐ │░│
│░│ │      Next        │ │░│
│░│ └──────────────────┘ │░│
│░│ ┌──────────────────┐ │░│
│░│ │      Back        │ │░│
│░│ └──────────────────┘ │░│
│░│      Skip tour       │░│
│░└──────────────────────┘░│
```

**How it differs from the web tour, and why.** The web walks pages and points at rail items on a desktop or the menu button on a phone. Native points at the screen each tab opens, because UIKit tab bar items can't be measured from React Native, and names the tab in the words of the card. The web has no intro card because its first run opens by itself; native adds one because the replay is always a deliberate tap and it is the right place to say that nothing changes.
