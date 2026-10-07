---
name: overload-design-doc
description: >
  Generate design documents for Overload features. Use when creating UI/UX
  specifications, screen-by-screen designs, or when the user mentions "design doc",
  "design document", "UX spec", "screen spec", or needs to document how an Overload
  pitch should look and behave, such as the dashboard, exercise logging card,
  mesocycle builder, goals, or missed-day prompt. Design docs define the visual and
  interaction layer: what the lifter sees, how they interact, what states exist,
  and how screens connect. Requires an expanded pitch document as input for scope
  and problem context. Use this before writing a spec or tickets for any UI work.
---

# Overload Design Document Generator

Generate design documents that specify the UI/UX experience for Overload features. Design docs sit between pitch documents and technical specs. They define what the lifter sees, how they interact, what states exist, and how the screens connect.

Overload is a single-user strength training tracker: one lifter, one account, usually a phone in one hand in a gym. Its job is to tell him, per lift and per session, whether to progress, hold, or deload, so he never has to eyeball his own numbers. Per Overload's approved **quiet, precise instrument** direction (calm, ordered, legible, unhurried, exact), the interface must be one obvious thing per screen with numbers that line up, and must never become a dense dashboard or a coaching product. The user is a CS-trained engineer who programs his own training, so assume he reads numbers fluently and rules out tutorials, hand-holding copy, and explainer chrome. See the `overload-ui-design` skill for full brand and visual-language detail (palette, typography, appearance modes).

## Where design docs fit

```text
Pitch Document → Design Document → Technical Spec → Tickets → Build
(why + scope)    (what he sees)    (how it's built)  (work units)
```

- **Pitch** answers: why are we building this? What is in scope? What is out of scope?
- **Design Doc** answers: what does the lifter see? How does he interact? What are the states?
- **Spec** answers: what is the data model? What are the server action contracts? How do we test it?
- **Tickets** answer: what specific implementation tasks need to be completed?

Design docs must stay in the UI/UX layer. Do not define database schemas, Prisma models, route handler contracts, server action signatures, or implementation tasks. That belongs to the technical spec and ticketing stages.

## Prerequisites

Before writing a design doc, ensure you have:

1. **Expanded pitch document** at `pitches/NN-pitch-name.md` (for example `pitches/04-guided-workout-logging.md`) — defines scope, problem, appetite, no-gos, and definition of done. This is the required input, supplied by the user; this skill does not generate pitches. If it is missing, stop and ask for it.
2. **`docs/planning/prd.md`** — MVP feature inventory, user journeys, acceptance criteria, edge cases.
3. **`docs/planning/architecture.md`** — technical ground truth, especially the stack and Open Questions.
4. **`docs/planning/product-brief.md`** — core job, success definition, non-goals, riskiest assumption.
5. **`CLAUDE.md`** — repo engineering context and invariants.
6. **`overload-ui-design`** — brand system, palette, typography, appearance modes.
7. **The theme in the codebase** — Tailwind config and shadcn/ui theme tokens, once Pitch 1 creates them. Reference them. Do not invent a second styling system.
8. **Workflow context** — reference real moments from the PRD journeys: tapping into a bench press card between sets, opening the app after a missed day, fixing a mistyped weight from last Tuesday, seeing a progress tag next to Hack Squat, setting 315 × 1 as a goal.

## File conventions

- **Filename:** `NN-pitch-name-design-doc.md`, using the same number and slug as the pitch file, for example `04-guided-workout-logging-design-doc.md`.
- **Location:** `docs/design/`
- **Format:** Markdown with TSX code blocks for component specifications and ASCII wireframes for layout.

## Required sections

Every design doc must include these sections in order.

### 1. Title & metadata

```markdown
# Feature Name — Design Document

**Version:** X.Y
**Pitch Source:** Overload — Pitch: Feature Name
**Focus:** One-line description of what this design doc covers
```

- Use the exact pitch name from `docs/planning/pitch-roadmap.md` (Foundation, Library & Gyms Setup, Split & Mesocycle Builder, Guided Workout Logging, Progressive Overload Engine, Goals, Cardio Logging).
- Do not rename PRD features. Names are load-bearing across pitch, design doc, spec, and tickets.
- Keep the focus line user-facing, not implementation-facing.

### 2. Vision

Write 2–3 sentences maximum. Frame the feature from the lifter's perspective: what question does this screen answer, and what decision does it help him make?

End with a **design north star**: a short phrase capturing the aesthetic and interaction philosophy for this feature. Worked example: "On the logging card, the lifter answers one question, 'what did I just lift?', and moves on. North star: *the card gets out of the way of the bar.*"

Frame around real training questions:

- What am I doing today, and in what order?
- What did I lift last time, and should it go up?
- How has this lift moved over the last few weeks?
- What needs my attention (a missed day, a progress call, a deload week)?

### 3. Design principles

Include 3–5 numbered principles. Each gets a short name and a 1–2 sentence explanation. These must be specific to the feature, not generic motivational wallpaper.

```markdown
### 1. Principle Name

What it means and how it affects design decisions for this feature.
```

Overload-specific principle themes to draw from:

- **One thing now** — the dashboard shows today's session as the single focal block, so never add widgets to be "helpful."
- **Numbers over decoration** — weights and reps are the largest thing on any logging surface, so when space is tight, shrink the chrome, not the numbers.
- **Hold is a non-event** — an unchanged lift shows no tag and no color, so absence of a tag is information; don't add a "Hold" badge to fill the gap.
- **Two deloads, two voices** — a scheduled deload week and a reactive per-exercise deload are different things and must read differently.
- **Computed truth, editable history** — tags are never entered, only derived; any past set can be edited and the result must visibly follow.
- **Thumb first** — the primary context is one hand in a gym, so primary actions sit at the bottom within reach and tap targets stay generous.
- **Archive, don't delete** — removal is soft and history persists, so copy and affordances say "Archive" and promise nothing disappears from the past.

### 4. Visual language

Overload uses **Tailwind CSS with shadcn/ui** as the single component and styling system. Design docs must specify visual behavior in terms of shadcn/ui components, theme tokens, and Tailwind patterns.

Do **not** introduce Material UI, styled-components, CSS modules, or a second component library.

Always include this sentence in the generated design doc:

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

#### Color palette

Document only the theme tokens this feature uses. Use semantic references first (`background`, `card`, `border`, `foreground`, `muted-foreground`, `primary`). See `overload-ui-design` for the canonical palette — do not reproduce the full theme or raw hex values here. The progress and deload status colors are exposed as theme tokens; if they do not exist in the theme yet, the pitch that needs them adds them to the theme rather than hardcoding a color in a component.

| Token / theme path | Usage | Notes |
| ------------------ | ----- | ----- |
| {token} | {usage} | {note} |

#### State colors

If the feature displays status or state, define the mapping. Use real values only: the tag is **computed**, never an enum or stored value, and has exactly three outcomes. Mesocycle and Goal status are `active` and `archived` per the Data Model. Other state values (a LoggedSession's completion status, how skipped and shifted days are stored) are open in `docs/planning/architecture.md` → Open Questions, so use plain display labels (Pending, Complete, Skipped, Shifted) and do not invent enum names.

| State | Visual treatment | Usage |
| ----- | ---------------- | ----- |
| Progress (computed tag) | progress token, text label "Progress" | exercise is ready to go up |
| Deload (computed tag) | deload token, text label "Deload" | reactive per-exercise call |
| Hold (computed) | no tag, no color | ordinary exercise row |
| Scheduled deload week | a week-level banner in muted treatment with its own label | planned recovery; reactive tags suppressed |
| `active` mesocycle / goal | normal | currently in use |
| `archived` mesocycle / goal | muted text, collapsed below active | kept, not selectable for new work |

- Use color as reinforcement, not the only indicator. Always pair state color with readable text.
- Archived items must be visually distinct from active ones but remain readable, since history still references them.

#### Typography, spacing, radius, elevation

Reference `overload-ui-design` for the scale. In the design doc, document only the variants this feature uses (for example, the large tabular numeral style on the logging card) and any feature-specific deviation with its justification.

#### Appearance

Overload supports light, dark, and system, with system as the default. Selection lives in Settings only. Design docs for any screen must consider both modes via theme tokens. If a screen has a distinct look per mode worth calling out, note it in that screen's Layout or Behavior subsection.

### 5. Information architecture

Include an ASCII diagram showing page hierarchy and navigation relationships, so a reader gets a birds-eye view before individual screens. The app shell and navigation are created by Pitch 1 (Foundation), so that pitch's design doc is the authority for the shell, and later docs inherit it. If it does not exist yet, use this illustrative shell and say so.

```text
┌──────────────────────────────────────────────┐
│  Overload                                    │
├──────────────────────────────────────────────┤
│  Today  ── greeting, today's session,        │
│            [Start]  → Exercise card          │
│                         → Session summary    │
│  Plan   ── Mesocycles → Session builder      │
│            Exercise library                  │
│  History ─ Week at a glance → logged day     │
│  Goals  ── active goals, archived            │
│  Settings ─ Appearance, Gyms, Archive        │
└──────────────────────────────────────────────┘
 Bottom bar (mobile): Today · Plan · History · Goals
```

- Show where this feature lives in Overload's navigation.
- Show how screens relate to the real primary screens.
- Indicate primary vs. secondary content hierarchy.
- Keep it simple. This is orientation, not detailed wireframing.

### 6. Screen specifications

This is the core of the design doc. Each screen gets its own section with the same structure.

````markdown
## Screen N: Screen Name

### Purpose
One sentence: what does this screen help the lifter accomplish?

### URL pattern
`/route/pattern`

### Trigger
What user action opens this screen, modal, panel, or state?

### Layout
ASCII wireframe showing the spatial arrangement of elements.

### Component / section name
| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Element** | component, props, Tailwind classes | interaction notes |

### Code reference
TSX snippet showing component structure.

### Fields
| Field | Type | Required | Default | Validation / notes |
| ----- | ---- | -------- | ------- | ------------------ |

### Validation
- Required field behavior
- Inline error messages
- Submit enabled/disabled behavior
- Non-blocking warnings
- Draft preservation behavior

### Empty state
Wireframe and code example for when there is no data.

### Loading state
Skeletons, disabled controls, progressive loading, dialog loading behavior.

### Error state
Recoverable errors, retry behavior, destructive-action safeguards.

### Behavior
- What happens on success and on error
- Notification messages
- Focus management
- Keyboard behavior
- Navigation after save/cancel
````

Screen specification guidelines:

- Every screen needs a **Purpose**. If you cannot explain the screen in one sentence, the screen is probably doing too much.
- Use ASCII wireframes before code. The wireframe communicates layout intent; the code communicates implementation shape.
- Use real component names and theme references, not vague instructions like "make it blue."
- Empty states are required for every list, block, section, and area that can have no data.
- Interactions must be explicit: hover, click, keyboard, focus, disabled, confirmation, cancellation.
- Form screens need fields tables with type, required/optional, validation, and defaults.
- Avoid implementation internals that belong in the technical spec.

### 7. Navigation flows

Document how screens connect to each other and to the rest of Overload, using ASCII flow diagrams.

Include: what triggers navigation; whether it is full-page, dialog, drawer, or inline; what state carries between screens; query params and return paths; deep-linking patterns.

Overload-specific flows:

- Open app → missed-day prompt (if a prior day was missed) → log late / shift / skip → today's session.
- Today → exercise card → next exercise card → all done → session summary → day-complete dashboard.
- History → a past day → edit a set → the tag on that exercise visibly updates.
- Exercise card → swap → same-muscle-group picker → back to the card with the substitute.
- Goals → set a goal → progress rows; goal reached → completion card → set a new one or dismiss.

### 8. Interaction specifications

#### Keyboard navigation

| Context | Key | Action |
| ------- | --- | ------ |
| Set entry field | Enter | Save the value and move to the next field |
| Set entry field | Tab / Shift+Tab | Next / previous field in set order |
| Dialog or drawer | Escape | Close and return focus to the trigger |
| Exercise library search | Down / Up | Move through results |

- Do not invent shortcuts unless they serve the feature and are documented visibly.
- Set entry and the missed-day prompt are the high-frequency flows and must be fully keyboard-operable, even though touch is primary.
- Focus should move into dialogs when opened and return to the trigger when closed.

#### Loading states

Document loading behavior per screen or major component using shadcn/ui's `Skeleton`. The logging card keeps its layout while loading so nothing jumps under the thumb.

#### Error states

Use shadcn/ui `Alert` and inline patterns with retry actions.

- Errors should be plain-English and action-oriented.
- Preserve user input whenever possible, especially mid-workout set values.
- Destructive errors must never silently remove user data.
- A failed save of a logged set must be distinguishable from a failed load and must keep the entered numbers on screen.

#### Notifications

Use shadcn/ui's toast (Sonner).

| Action | Message | Severity | Duration |
| ------ | ------- | -------- | -------- |
| Past set edited | `Set updated` | success | 4s |
| Session duplicated | `Push Day 1 copied to Thursday` | success | 4s |
| Exercise or gym archived | `Archived. Past workouts keep it.` | info | 5s |
| Save failed | `Couldn't save. Your numbers are still here.` | error | until dismissed |

- Do not use toasts as the only place for validation errors.
- Inline errors belong next to the field or action that caused them.
- Goal completion is not a toast; it is a calm full-width card (see `overload-ui-design`).

#### Destructive actions

Document confirmation patterns for: archiving an exercise, archiving a gym, archiving a mesocycle, archiving a goal, skipping a missed day, and replacing the day's planned exercise with a swap.

- All removal is soft and the UI says **Archive**, not Delete.
- Use confirmation dialogs only when the action is meaningfully irreversible. Archiving is reversible, so it needs a toast with undo rather than a dialog.
- Keep confirmation copy specific. Avoid generic "Are you sure?" copy.

### 9. Responsive behavior

Overload is mobile-first, since the primary context is a phone in a gym, with a roomier layout on larger screens.

| Breakpoint | Width | Behavior |
| ---------- | ----- | -------- |
| base | below 640px | Single column, bottom navigation bar, primary actions at the bottom within thumb reach |
| `sm` | 640px and up | Wider single column, larger cards |
| `md` | 768px and up | Side navigation replaces the bottom bar; list and detail can sit side by side |
| `lg` | 1024px and up | Centered content with a maximum width; charts gain width, not more elements |

For each screen, specify: what stacks first, what collapses, what becomes a drawer or dialog, what remains visible, what is hidden, and whether all actions remain available on the smallest viewport. Every action must remain available on mobile.

### 10. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `ExerciseCard` | logging flow | new | variants: planned, in progress, complete; tag shown or not |
| `SetRow` | logging card | new | weight and reps entry; tabular numerals |
| `ProgressTag` | dashboard, card, history | new | variants: progress, deload; hold renders nothing |
| `MissedDayPrompt` | app open | new | three equal choices |

- Identify components that should be reusable across pitches.
- Do not over-componentize in the design doc. Save implementation decomposition for the spec.
- Note key variants, especially for the tag (progress, deload, none) and day state (pending, complete, skipped, shifted).

### 11. Accessibility, privacy, and data sensitivity

Overload stores a person's complete training history and, as free text, the addresses of the places he trains. Treat the UI as handling private data, because it is.

Accessibility requirements:

- All interactive controls must have accessible names.
- Progress and deload tags must not rely on color alone; the text label is always present.
- Form fields must have labels and helper/error text.
- Dialogs must trap focus while open.
- Keyboard navigation must work for set entry and the missed-day prompt.
- Error messages must be screen-reader accessible.
- Numeric fields use the appropriate mobile keypad (`inputMode`) and have a minimum 44px tap target.

Privacy requirements:

- Design no share, export-to-others, invite, or visibility affordance. Overload is single-user and the UI must never imply anyone else can see anything.
- Gym addresses are personal location data. Show them only on the Gyms screen and in the gym picker, never in headers, summaries, or anywhere that could be screenshotted by accident.
- Do not link gym addresses to maps or any external service.
- Do not add external links leaving the product.

### 12. Out of scope

Bullet list of features explicitly not designed in this version. Reference the pitch's boundaries and Overload's permanent non-goals, and keep the two separate.

Deferred (a later pitch or version, design nothing for it now but don't preclude it): dated goals, RPE/RIR entry, a native or wrapped mobile app, HealthKit and heart rate, distance, pace, or calories on cardio, location-pinned gyms and arrival notifications.

Permanent non-goals (never, and not to be relitigated): program or mesocycle generation, social features of any kind, progression analysis of cardio, nutrition and body composition in this build.

## Style guidelines

### ASCII wireframes

- Use box-drawing characters: `┌ ─ ┐ │ └ ┘ ├ ┤`.
- Keep wireframes focused on spatial relationships.
- Label interactive elements with `[brackets]`.
- Use `→` for links or navigation.
- Show populated, empty, loading, and error states where relevant.

```text
┌────────────────────────────────────┐
│ ‹ Push Day 1                 2 / 5 │
├────────────────────────────────────┤
│ Barbell Bench Press     [Progress] │
│ Downtown Gym · 3 × 6–8             │
│                                    │
│  Set 1    [ 185 ] lbs  [  8 ] reps │
│  Set 2    [ 185 ] lbs  [  8 ] reps │
│  Set 3    [ 185 ] lbs  [    ] reps │
│                                    │
│  [Swap exercise]                   │
├────────────────────────────────────┤
│         [ Next: Incline Press ]    │
└────────────────────────────────────┘
```

### Code blocks

- Use TSX for component structure and styling.
- Prefer shadcn/ui components: `Card`, `Badge`, `Button`, `Input`, `Tabs`, `Dialog`, `Drawer`, `Sheet`, `Skeleton`, `Alert`, and Sonner for toasts.
- Use theme-aware classes (`bg-card`, `text-muted-foreground`), never raw hex values.
- Do not use Material UI, styled-components, or CSS modules.
- Include hover, focus, disabled, and selected states when they matter.
- Keep snippets structural, not full implementations.

```tsx
<Card className="bg-card border-border">
  <CardHeader className="flex-row items-center justify-between">
    <CardTitle className="text-base font-medium">Barbell Bench Press</CardTitle>
    <ProgressTag state="progress" />
  </CardHeader>
  <CardContent className="space-y-3 tabular-nums">
    <SetRow setNumber={1} weight={185} reps={8} />
  </CardContent>
</Card>
```

### Tone

- Write descriptions in plain English.
- Use the lifter's vocabulary: sets, reps, working weight, deload, mesocycle, split.
- Say "ready to go up" instead of `tag === "progress"`.
- Be direct about success, error, edge cases, and what the lifter can do next.

## Workflow

1. **Receive the expanded pitch** — read and understand the problem, scope, no-gos, appetite, definition of done.
2. **Cross-check upstream docs** — confirm alignment with `docs/planning/prd.md`, `product-brief.md`, `architecture.md`, and `pitch-roadmap.md`.
3. **Identify screens and surfaces** — list pages, dialogs, drawers, panels, empty states, navigation paths.
4. **Clarify with the user when needed** — ask only about decisions not already settled by the pitch or upstream docs.
5. **Draft information architecture.**
6. **Design screen-by-screen** — wireframes, component tables, code references, states, behaviors.
7. **Add interaction specs** — keyboard, loading, error, notification, destructive, responsive.
8. **Document component inventory.**
9. **Document accessibility and privacy requirements.**
10. **Confirm scope boundaries** — make sure no deferred or permanently excluded work slipped in.
11. **Finalize** — update version, confirm alignment with the pitch, leave open questions only where genuinely unresolved.

## Interview guidelines

When clarifying with the user:

- Start with flows, not screens: "After the last set of the last exercise, what should you see first?"
- Reference the pitch: "the pitch includes the missed-day prompt. Should it block the dashboard until resolved, or sit above it and let you ignore it?"
- Provide visual options when useful — sketch two ASCII layouts and ask which matches his mental model.
- Ask about edge cases: a lift with no history, a gym with no baseline yet, a week that is a scheduled deload, an archived exercise appearing in an old workout, two consecutive missed days.
- Surface version boundaries: "the pitch defers dated goals. Should the goal form show no date field at all, or hide it entirely?"
- Capture deferred decisions in **Out of Scope** or **Open Questions**.
- Do not ask questions already answered by the pitch, PRD, Architecture Doc, or Product Brief.

## Overload-specific design checks

Before finalizing a design doc, verify:

- The feature supports Overload's core job: telling the lifter whether to progress, hold, or deload so he doesn't have to eyeball his numbers.
- A hold shows no tag and no color anywhere in the design.
- No control lets the lifter set, edit, or override a progress or deload tag; tags are only ever displayed.
- Scheduled deload weeks and reactive per-exercise deloads are visually and verbally distinct, and no reactive tag appears during a scheduled deload week.
- Weights are in lbs and every number uses tabular numerals.
- The gym appears on the logging card only for gym-variable exercises, and free-weight movements carry no per-gym UI.
- Removal is worded "Archive", and archived exercises and gyms still render in past workouts.
- Editing a past logged set is reachable from History and the affected tag visibly updates.
- A completed day on the dashboard does not hand off to tomorrow's plan.
- No share, social, leaderboard, streak, badge, or confetti element appears anywhere.
- Goal completion is a calm card, not a celebration animation.
- Cardio has no tag, chart, or trend, only type and duration.
- The missed-day prompt offers exactly three choices (log it late, shift, skip), each one tap.
- The swap picker lists only same-muscle-group exercises and explains clearly when none exist.
- Tailwind with shadcn/ui is the only styling system present.
- The theme toggle appears only in Settings, and every screen works via tokens in light and dark.
- The primary actions are reachable one-handed on a phone at the base breakpoint.
- Every list or block has empty, loading, and error states.
- The design doc stops at UI/UX and does not drift into schema, server actions, or ticket-level implementation.
