---
name: overload-ui-design
description: >
  UI design guidance for Overload, a single-user strength training tracker for one
  lifter who builds his own splits. Use when generating any Overload UI: the
  dashboard and its today's-plan and day-complete states, the exercise logging card,
  session summary, week-at-a-glance history, mesocycle and session builders,
  exercise library, gyms, goals, progression charts, cardio log, settings, the
  missed-day prompt, login, or any empty, loading, or error state. Also use when
  asked for a UI preview, design preview, mockup, screen gallery, or a viewable
  rendering of a design doc, which ships as a standalone offline HTML file under
  docs/previews/ (the mandatory UI-design stage of the pitch pipeline). Produces
  polished, quiet-and-precise SaaS UI in Overload's brand system. Trigger whenever
  building, restyling, or mocking up an Overload screen, even for a small component.
---

# Overload UI Design

Design guidance for Overload's interface. Overload is a single-user training tracker: one lifter, one account, standing in a gym with a phone in one hand. This skill governs how every Overload screen should look and feel.

## Design direction: a quiet, precise instrument

Overload's approved design direction is **a quiet, precise instrument**: calm, ordered, legible, unhurried, exact, restrained. Prioritize one obvious thing per screen, numbers that line up, and navigation that never makes the lifter hunt. Never drift toward a fitness-app dashboard, a playful consumer app, or an AI coaching product.

Copy is restrained. The only warm touch is a single greeting line on the dashboard, such as "Good morning, William. Push Day 1 is up." It is one line of plain text, with no emoji, no motivational language, no chat input behind it, and no persona.

## Output format

There are two output modes, and the request decides which.

**Product UI** is the default: a screen, a component, a restyle, or a ticket touching appearance. Output is application code as described below.

**A UI preview** is a standalone HTML file that renders a design doc's screens for review. Ask for it with "preview", "UI preview", "design preview", "mockup", "show me the screens", "visual", "gallery", or "render the design doc". It is also the mandatory UI-design stage of the pitch pipeline (pitch → design doc → **UI preview** → spec). A preview is a *picture of the design*, not product code, and it is the one place hand-authored CSS is permitted. Read **UI previews** below before writing one.

For product UI:

- Code in TypeScript React (TSX) using shadcn/ui components and Tailwind utility classes, in a single code block. shadcn/ui with Tailwind is Overload's only component and styling system. Do not introduce Material UI, styled-components, CSS modules, inline style objects for layout, or a second component library.
- Start with a brief response, then the code, then a brief closing response.
- Do not mention the implementation format, styling framework, or markup language in the response text.
- Use `lucide-react` icons at one stroke weight and one size scale. No filled or multicolor icons, and no emoji as icons.
- Charts (only if needed): Recharts, always inside `ResponsiveContainer`, styled from theme tokens.
- Prefer shadcn/ui's built-in transitions and Tailwind hover, focus, and ring states over custom animation code.
- Mobile-first. The primary context of use is a phone browser in a gym, so design the narrow layout first and let `md:` and up add width, not features.

## Aesthetic direction

Design in the style of a clean, modern SaaS product: the calm of a well-made note-taking or developer tool, not a fitness brand. Draw from the restraint of AI-platform home screens (a quiet greeting, generous space, one focal action) without any of their conversational chrome.

Core qualities for Overload:

- Decisive: every screen answers "what do I do next" before anything else.
- Fast to operate one-handed: weight and reps are the largest things on the logging card, with large tap targets.
- Low density: few elements, clear hierarchy, nothing that needs squinting. If a screen needs a second look to parse, remove something.
- The progress and deload tags are the only colored elements besides the accent, so they read instantly.

Avoid:

- **Cartoonish or playful styling** — no mascots, illustrations, rounded bubbly shapes, or whimsical empty states. This is a tool.
- **The dense analytics dashboard** — no grids of small widgets, sparkline confetti, or a wall of stats. One chart per view, large enough to read.
- **Punk or pop aesthetics** — no neon, glitch, grunge, loud gradients, or heavy display type.
- **Motivational fitness-influencer styling** — no slogans, "crush it" copy, hero banners, or gradient buttons.
- **An AI coach persona** — no avatar, chat bubble, typing indicator, or advice voice. The greeting is a line of text, nothing more.
- **Gamification** — no streaks, badges, points, or confetti. Goal completion is acknowledged calmly (see Goals below).

## Brand system

- The product name is **Overload** in the shell, titles, and metadata.
- A defined palette (see Appearance below) and a single typography family (Inter), used as consistent tokens throughout.
- Consistent iconography via `lucide-react`, used at one stroke and size scale.
- No screen should retain an un-themed default appearance.
- **Logo: none exists yet.** The creator will make one later. Do not design, ideate, or approximate a logo or icon mark. Until one is supplied, the brand is the wordmark "Overload" set in Inter semibold, plain text only.

## Typography

- **Inter** is the approved application font. Use it as the primary typeface throughout, loaded via `next/font`. Do not substitute another primary family.
- Weights: regular, medium, and semibold only. No bold or heavier, which would read as loud.
- Every weight, rep count, set number, and duration uses tabular numerals (`tabular-nums`) so columns of numbers align. Large numerals get slightly tightened tracking (`tracking-tight`).

## Appearance: light, dark, system

Overload supports light and dark, and **system** is the default when the lifter hasn't chosen. Appearance selection lives in **Settings** only.

- **Never** place a theme toggle in the header, the dashboard, or on the logging cards. It belongs in Settings.
- Dark mode is a true near-black, not navy and not tinted blue. Surfaces step up in lightness only slightly.
- Design every screen theme-aware using theme tokens, not hardcoded colors.

**Dark foundation:** app background `#0B0B0C`, surface `#141416`, elevated surface `#1C1C1F`, divider `#26262A`, primary text `#F2F2F3`, secondary text `#A1A1A8`, accent `#7B93FF` (hover `#93A6FF`, soft is accent at 14% opacity).

**Light foundation:** app background `#F7F7F8`, surface `#FFFFFF`, elevated surface `#FFFFFF` with a hairline divider border, divider `#E4E4E8`, primary text `#0E0E10`, secondary text `#5F5F68`, accent `#3F5BD9` (hover `#3350C4`, soft is accent at 10% opacity).

**Status colors (functional only):** progress green `#2F9E6B` light / `#4CC38A` dark; deload amber `#B7791F` light / `#E0A93B` dark. They appear only on the progress and deload tags. A hold has no tag and no color — it is simply an ordinary exercise. Never use these colors decoratively.

## Visual detailing

- Separate regions with dividers and small surface steps, not heavy shadows. Shadows are rare and soft, used only for overlays such as dialogs and menus.
- Contrast is high for numbers and primary text, and deliberately lower for secondary text and dividers. Never put secondary text on the elevated surface at low contrast.
- Use shadcn/ui's stock controls. Build a bespoke control only for the set-entry fields on the logging card, where reachability and tap size matter.
- Imagery: the exercise library's images are the only imagery. Show them small and consistent, never as hero banners. Custom exercises have no image, so show a quiet monogram tile, not a placeholder illustration.

## Mock data vocabulary

Use realistic training mock data, and units are always **lbs**:

- **Exercises:** Barbell Bench Press, Incline Dumbbell Press, Overhead Press, Hack Squat, Leg Press, Romanian Deadlift, Lat Pulldown, Seated Cable Row, Barbell Row, Cable Fly, Lateral Raise, Triceps Pushdown, Hammer Curl, Seated Leg Curl, Standing Calf Raise, Chest Press Machine.
- **Muscle groups:** Chest, Back, Shoulders, Quads, Hamstrings, Biceps, Triceps, Calves, Core (match the imported library's actual values).
- **Sessions:** Push Day 1, Pull Day 1, Leg Day, Push Day 2, Upper Body, Lower Body.
- **Splits:** Push / Pull / Legs, Arnold Split, Bro Split, Custom.
- **Mesocycles:** Hypertrophy Block 3, Strength Block, each 5 weeks with week 5 as the deload.
- **Gyms:** Downtown Gym, Campus Rec Center, Home Garage. Plain names, never real brands.
- **Logged sets:** realistic working numbers, such as 185 × 8, 185 × 8, 185 × 7, and 225 × 5.
- **Tags:** Progress, Deload. A hold shows nothing.
- **Day states:** Pending, Complete, Skipped, Shifted.
- **Missed-day actions:** "Log it late", "Shift the week", "Skip it".
- **Goals:** Barbell Bench Press 315 × 1, Hack Squat 365 × 5, Overhead Press 155 × 8, with a progress percentage.
- **Cardio:** Incline Walk 20 min, Cycling 30 min, Stair Climber 15 min.
- **Free text:** greeting lines such as "Good morning, William. Push Day 1 is up." and "Nothing planned today. Rest day." Gym addresses as plain text such as "Downtown, near the river".

## Per-screen guidance

### Primary surfaces

- **Dashboard (today's plan pending)** — the greeting line, then today's session as the single focal block: session name, the exercises in order, and a progress or deload tag beside any exercise that has one. One primary action to start or resume.
- **Dashboard (day complete)** — the day does not hand off to tomorrow's plan. Show a quiet alternate state: active goal progress as the lead element, and a link to the week at a glance.
- **Exercise logging card** — one exercise per card, all of its planned sets together as rows. Weight and reps are the largest elements, each an easy tap target with a numeric keypad. Show the planned rep range, the gym, and the tag if any. Nothing else competes.
- **Session summary** — short. One progression chart or a percentage toward a goal, and nothing resembling a statistics report.
- **Week at a glance (history)** — the week as a simple list of days with state and session name. Tapping a day opens its logged workout, which stays editable.
- **Mesocycle builder** — create and clone-forward. Length and deload week are pre-filled (5 weeks, week 5) and editable in place.
- **Session builder** — exercises with planned sets and target rep range, assign to a day, duplicate to another day.
- **Exercise library** — search by name and filter by muscle group on one screen. Library exercises show an image, custom ones a monogram tile.
- **Gyms** — a plain list with an add action. Each gym is a name and free-text address.
- **Goals** — active goals as large, calm progress rows with the lift, the weight × reps target, and the percentage. Archived goals sit below, collapsed.
- **Progression charts** — one e1RM trend line per exercise with the accent color, thin line, light grid, readable axes. No legend clutter.
- **Cardio log** — type and duration only. Two fields, nothing more.
- **Missed-day prompt** — shown on app open when a prior day was missed. Three equal-weight choices ("Log it late", "Shift the week", "Skip it"), one tap each, with a one-line description under each.

### Secondary surfaces

- **Login** — wordmark, email field, the sign-in action, and nothing else. There is no sign-up link, no "forgot" flourish beyond what the login method requires, and no marketing copy. Give each failure its own plain message: wrong credentials, expired session, and network error.
- **Settings** — appearance (light, dark, system) lives here and only here, plus the gym and archive management links.
- **Not found and server error** — a short sentence and a single way back to the dashboard. No illustrations.

### States

- **Empty states** — plain and useful: a sentence naming what's missing and the one action to fix it. "No mesocycle yet. Create your first one." "No gyms yet. Add the gym you train at." No illustrations or jokes.
- **Error states** — inline, factual, with a retry. Never alarming red full-screen takeovers.
- **Loading states** — skeletons shaped like the final content; no spinners over empty screens. The logging card keeps its layout while loading so nothing jumps.
- **Mobile** — the primary layout. Primary actions sit within thumb reach at the bottom of the screen, and navigation is a simple bottom bar on mobile. Never hide core navigation behind a hamburger menu.

### Goal completion

Reaching 100% on a goal is acknowledged with a calm, full-width card: "Goal reached: Barbell Bench Press 315 × 1", with actions to set a new goal or dismiss. No confetti, no animation beyond a short fade, no sound.

## UI previews

A UI preview is a single self-contained HTML file that renders **every screen and state** of a design doc, in both appearance modes, as a static design-handoff gallery for review before anything is built. It exists because a design doc describes screens in prose and ASCII wireframes, and a reviewer needs to see them. It is also the visual contract the spec and the implementation tickets are held to.

Start from `references/preview-template.html` (in this skill's folder). It carries the scaffolding, Overload's product tokens copied from `src/app/globals.css`, the font, and component recipes that reproduce the app's shadcn/ui components. Copy it and replace the example frames. Do not re-derive the token block or restyle the scaffolding; retyping hex values is how two visual systems start.

### Where it goes

- **Path:** `docs/previews/NN-pitch-slug-preview.html`, matching the pitch and design-doc number and slug (for example `docs/previews/04-guided-workout-logging-preview.html`).
- **One file per design doc.** A preview covering two features is two files.
- Never overwrite a pitch, design doc, or spec. If a requested output path is one of those, or names a `.tsx` file, say so and write the `.html` preview to `docs/previews/` instead.
- The template's asset paths (`assets/fonts/inter-latin-variable.woff2`) are relative to `docs/previews/`. If the preview is written anywhere else, fix them.

### The preview is not product code

This is the rule that keeps the hand-authored CSS from becoming a second styling system:

- The HTML and CSS in a preview are **a rendering of the design and are never copied into the application.** The app is built with Tailwind and shadcn/ui against the theme in `globals.css`.
- Say so on the page, in the lead's note pill. A reader who finds the file in six months must not mistake it for the implementation.
- When a preview and the app theme or a shadcn/ui component disagree, **the theme wins** and the preview is wrong. Fix the preview.
- Previews are review artifacts. They are not linked from the application, are never imported, and never ship inside it.

### Two token layers, kept apart

The template defines both. The separation is the point.

| Layer | Prefix | Rule |
| ----- | ------ | ---- |
| Preview chrome | `--pv-*` | The studio around the mocks. **Achromatic, greys only.** Overload's only colors (the accent, progress green, deload amber) carry meaning, so the scaffolding has none and can never be mistaken for a product surface. |
| Product tokens | `--ov-*`, scoped to `.ov` | `globals.css` values, verbatim: `:root` for light, `.dark` for dark under `.ov[data-ov="dark"]`. If the theme changes, re-copy the block. |

The appearance toggle sets `data-ov` on every `.js-ov` element at once, so all product surfaces flip together. It follows the OS on first load, because system is Overload's default appearance.

**Chrome conventions do not cross into `.ov`.** Uppercase eyebrows, letter-spaced labels, and pill-shaped segments are fine in the chrome. Anything inside a `.mock` obeys the brand system: the `.ov-*` component recipes only, Inter at regular, medium, and semibold weights, tabular numerals on every number, no gradients, shadows only on dialogs, menus, and toasts, and the progress and deload colors only on progress and deload tags.

### Component recipes, not a component library

The `.ov-*` classes in the template (`ov-btn`, `ov-badge`, `ov-input`, `ov-alert`, `ov-select`, `ov-tabs`, `ov-dialog`, `ov-menu`, `ov-toast`, `ov-sk`, `ov-list`, `ov-thumb`, the shell classes) reproduce the repo's own `src/components/ui/*` at their Tailwind sizes: buttons 40px (`h-11` = 44px for primary and thumb actions), inputs 40/44px, 6px control radius, 8px card radius, and the app's `h-11`, `size-11`, `min-h-14`, and `min-h-16` touch targets. Use them as they are. If a screen needs a component the template lacks, add a recipe that matches the shadcn/ui component the implementation will use, and name the mapping in a CSS comment. Never invent a control the app won't have.

### Icons and font

- **Icons are inline Lucide SVG**, using the exact paths of the `lucide-react` version the app ships. Get them with `node scripts/lucide-svg.mjs chevron-right triangle-alert plus` and paste the output. No icon CDN, no icon font, no hand-drawn approximations.
- **The font is Inter**, the vendored latin variable file in `docs/previews/assets/fonts/` (the same file `next/font` serves the app). No Google Fonts link.
- **No logo exists.** The studio header and the app header use the wordmark "Overload" in plain text. Do not draw a mark.

### Required structure

In order. The template lays it out.

1. **Studio header** (sticky). `Overload · [Pitch name]`, a one-line scope, jump links to every section, and the Light/Dark appearance toggle.
2. **Lead.** An eyebrow, a one-sentence thesis in the design doc's north-star language, two or three sentences of scope (what ships, what deliberately does not, and the one commitment to check every frame against), and the note pill stating that this is a rendering rather than product code.
3. **Numbered sections** (`01`, `02`, …), each with a title and a one-line description of the rule its screens demonstrate. Group by surface or flow, not by component.
4. **Framed screens.** Every screen sits in a `.pv-frame` whose caption carries its **name**, its **route** in monospace (or `dialog`, `alertdialog`, `toast`), and a right-aligned **tag** for the condition it shows. A screen without its route is not reviewable.
5. **A states section**: loading, empty, error, read-only, validation, and confirmation, given the same billing as the populated screens.
6. **A theme specimen**: the tokens this feature uses and the type sizes, with what each is for.
7. **Closing legend**: two cards restating the design commitments the frames are built to respect, as checkmark lists. This is what makes a preview reviewable rather than merely pretty.
8. **Footer**: the design doc filename and version it was generated from, plus a one-line summary of the commitments.

The page is static. The only script is the appearance toggle. Show every state as its own frame; do not hide states behind tabs, a screen switcher, or click-to-open dialogs. Dialogs, menus, and toasts are drawn open on a `.ov-stage` with a scrim.

### Frames

- **Phone first.** Every screen appears in a `.mock--phone` (375px) inside the full shell: the `Overload` header, the content, the thumb-reach action bar (`.ov-actions`) where the screen has a primary action, and the bottom nav with the right item active. Phone is the primary context, so this is the frame every screen gets.
- **Desktop where layout changes.** A screen's main populated state also appears in a `.mock--desktop` beside the phone, showing the md+ left rail and the centered column, so the responsive behavior is reviewed rather than assumed.
- **Dialogs** render on a phone-width `.ov-stage` with the scrim, with the dialog's real copy and its buttons stacked as they are at the base breakpoint.
- Use `.pv-grid3` and `.pv-grid2` for families of states and `.pv-row` to pair a phone with a desktop frame or with a short `.pv-aside` note.

### Coverage

A preview is complete when every screen and every state named in the design doc appears. Read its screen specifications and enumerate them. Each screen's empty, loading, error, validation, and read-only states are separate frames, not a note.

Overload-specific coverage that gets skipped and must not be:

- **Both appearance modes**, verified by flipping the toggle rather than assumed.
- **Hold looks like nothing.** Wherever exercises appear, an ordinary exercise has no tag and no color. Progress and deload tags appear only when the feature computes them; the progress and deload colors never appear anywhere else.
- **States that are legitimate answers, not failures**: an empty plan, a rest day, nothing planned today, a lift with no history, a scheduled deload week. They carry as much design weight as the populated case.
- **Archive, don't delete.** Archived exercises and gyms still render where history or an existing plan references them, visibly marked, and the copy says Archive or Remove as the design doc does, never Delete.
- **Thumb reach.** Every phone frame with a primary action shows it at the bottom, above the nav, at 44px.
- **Destructive-looking but non-destructive actions** (archive, remove from plan, replace) with their exact confirmation copy.

### Mock data

Use the vocabulary in **Mock data vocabulary** above. Keep numbers and names internally consistent across frames: the same mesocycle has the same dates, the same session has the same exercises and set counts, and the same set shows the same weight × reps everywhere it appears. Dates are real calendar dates whose weekdays are correct. Units are always lbs.

### Verification before handing it over

- [ ] Opens standalone from `docs/previews/` with **no network request**. The font resolves from `assets/fonts/`, and every icon is inline SVG.
- [ ] The appearance toggle flips every product surface, and both modes are correct on every frame.
- [ ] Dark surfaces are the theme's near-black. Nothing in dark mode is navy or tinted.
- [ ] No hex value inside a `.mock` that isn't an `--ov-*` token, and the token block matches `globals.css` exactly.
- [ ] Every number is tabular. No weight heavier than semibold anywhere in a `.mock`.
- [ ] No progress or deload color anywhere except a progress or deload tag, and no "Hold" badge.
- [ ] Shadows only on dialogs, menus, and toasts.
- [ ] Every frame carries a name and a route.
- [ ] Every screen from the design doc is present, with its empty, loading, error, validation, and read-only states.
- [ ] Every screen has a phone frame, and nothing scrolls horizontally inside one.
- [ ] No illustration, artwork, logo mark, emoji, or confetti anywhere in a `.mock`.
- [ ] The note pill states that this is a rendering, not product code.
- [ ] The footer names the design doc and version it came from.
- [ ] Checked in headless Chrome (Playwright with `channel: "chrome"` is in the repo): zero console errors, zero non-`file:` requests, Inter loaded (`document.fonts.check("16px Inter")`), no `.mock--phone` with `scrollWidth > clientWidth`, and screenshots of key sections in light and dark looked at.

## Respecting provided input

If the user provides design, code, or markup, respect its original design, fonts, colors, spacing, and style as much as possible — extend rather than override.
