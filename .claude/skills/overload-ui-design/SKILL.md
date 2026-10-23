---
name: overload-ui-design
description: >
  UI design guidance for Overload, a strength training tracker for a small group of
  lifters who build their own splits. Use when generating any Overload UI: the
  dashboard and its today's-plan and day-complete states, the exercise logging card,
  session summary, week-at-a-glance history, mesocycle and session builders,
  exercise library, gyms, goals, progression charts, cardio log, settings, the
  missed-day prompt, login, or any empty, loading, or error state. Produces polished,
  quiet-and-precise SaaS UI in Overload's brand system. Trigger whenever building,
  restyling, or mocking up an Overload screen, even for a small component. Also the
  mandatory UI design stage of the Overload pitch pipeline for every UI-bearing
  pitch, where it writes the preview to docs/previews/<slug>-preview.tsx.
---

# Overload UI Design

Design guidance for Overload's interface. Overload is a strength training tracker for individual lifters, each with a private account, standing in a gym with a phone in one hand. This skill governs how every Overload screen should look and feel.

## Design direction: a quiet, precise instrument

Overload's approved design direction is **a quiet, precise instrument**: calm, ordered, legible, unhurried, exact, restrained. Prioritize one obvious thing per screen, numbers that line up, and navigation that never makes the lifter hunt. Never drift toward a fitness-app dashboard, a playful consumer app, or an AI coaching product.

Copy is restrained. The only warm touch is a single greeting line on the dashboard, such as "Good morning, William. Push Day 1 is up." It is one line of plain text, with no emoji, no motivational language, no chat input behind it, and no persona.

## Output format

These rules apply when answering in chat. When invoked as the pipeline's UI design stage, follow Pipeline artifact mode (below): the preview is written to a file, and the single-code-block and brief-response rules do not apply.

- Code in TypeScript React (TSX) using shadcn/ui components and Tailwind utility classes, in a single code block. shadcn/ui with Tailwind is Overload's only component and styling system — do not introduce Material UI, styled-components, CSS modules, inline style objects for layout, or a second component library.
- Start with a brief response, then the code, then a brief closing response.
- Do not mention the implementation format, styling framework, or markup language in the response text.
- Use `lucide-react` icons at one stroke weight and one size scale. No filled or multicolor icons, and no emoji as icons.
- Charts (only if needed): Recharts, always inside `ResponsiveContainer`, styled from theme tokens.
- Prefer shadcn/ui's built-in transitions and Tailwind hover, focus, and ring states over custom animation code.
- Mobile-first. The primary context of use is a phone browser in a gym, so design the narrow layout first and let `md:` and up add width, not features.

## Pipeline artifact mode

When invoked as the UI design stage of the Overload pitch pipeline (step 3), this skill produces a file, not a chat reply.

1. Read the completed pitch and `docs/design/<slug>-design-doc.md` first.
2. Treat the design doc as the authority on product behavior and interaction. Do not invent features, flows, or states it does not contain.
3. Produce an implementation-grade, interactive preview covering the representative screens and states the pitch needs. Scale it to the pitch: a pitch with a thin UI gets a small preview of exactly those surfaces and states, not a tour of the app.
4. Write it to `docs/previews/<slug>-preview.tsx`, using the same slug as the pitch and design doc. The file default-exports one React component.
5. The preview is a downstream contract. `overload-spec` and `overload-ticket-worker` consume it, so it must establish:
   - visual hierarchy and layout
   - component treatment (which shadcn/ui components, which variants)
   - interaction controls, including the one-handed logging controls where relevant
   - empty, loading, and error states where the pitch has them
   - mobile-first behavior, with the narrow layout designed first
   - light and dark appearance, via theme tokens
6. Keep it self-contained. Realistic mock data lives inline in the file, in lbs, using the mock vocabulary below. Import only shadcn/ui components, `lucide-react`, Recharts, and React. Never import the Prisma client, the Supabase client, a server action, or application data modules, and never make a network request.
7. A small control that switches between screens, states, and light or dark is allowed as preview chrome. It sits outside the product frame and is not part of the product UI. The rule that appearance selection lives only in Settings applies to the product, not to this chrome.
8. Do not change product scope to make the preview more interesting. If the design doc leaves a purely visual choice open, resolve it with this skill's design system. If the design doc and this skill conflict on product behavior, the design doc wins. If they conflict only on visual styling, this skill governs.
9. `docs/previews` is excluded from type-checking, linting, and the production build (see `CLAUDE.md`), so the preview may reference components the application has not built yet.

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
- **Greeting** — one line above today's plan, using the first name, chosen from the time of day and the situation: a workout planned and not logged, done for the day, a rest day, no plan yet, a first visit. Several wordings per situation, such as "Good morning, William. Push Day 1 is up.", "Late night workout, William? Push Day 1 is still open.", "Done for today, William.", and "Welcome, William. Build your first plan to get started." Plain text, no emoji, no chat input, no persona, and it does not change while on screen.
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

- **Login, signup, and (once Public Accounts ships) password reset** — wordmark, the form, and nothing else, with no marketing copy. Login: email, password, the sign-in action, a quiet "Forgot password?" link once recovery exists, and a link to signup. Signup: first name, last name, email, password, invite code, the create-account action, and a link back to login. Reset: an email field and a submit, then a new-password field. Give each failure its own plain message: wrong credentials, expired session, invalid invite code, email already in use, and network error. A reset request always confirms in the same words.
- **Settings** — appearance (light, dark, system) lives here and only here, plus the name, a link to replay the tour, What's New, the gym and archive management links, and delete account, which is the one destructive action and uses a confirmation dialog.
- **Onboarding tour** — a quiet spotlight on the real control with a short popover: a title line, one or two sentences, a step count, and Next, Back, and Skip. No illustration, no animation beyond a short fade, never covering the control it describes, and usable one-handed on a phone.
- **What's New modal and page** — the modal shows a title, a date, and two or three plain sentences per entry with one dismiss action. The page is a dated list, newest first, in plain text.
- **Admin center (web-only)** — the same quiet system, utilitarian: a dashboard of a few large numbers, an account list with search, an account page with status, plan state, and actions, a feedback inbox, and an audit log. It never shows any lifter's training. Destructive actions (suspend, delete) use a confirmation dialog that names the account.
- **Plan import** — a paste area, then a review screen listing each proposed session and exercise with its planned sets and rep range, ambiguous matches as a quiet choice, unmatched exercises as an offer to add a custom exercise, and everything editable. One confirm action. Nothing implies it is saved until confirmed.
- **Upgrade note and trial status** — where a Pro feature would appear for a Free account, one short plain sentence and a link, dismissible. During the trial, a small line in Settings and nothing that interrupts. No countdowns, badges, or banners.
- **Feedback** — a short form: category, message, send.
- **Public pages (landing, pricing, changelog, creator page)** — the same quiet instrument, not a hype page: a clear one-line promise, real screenshots from a demo account, plain feature descriptions, the Free and Pro plans side by side, any offer stated plainly, and one call to action that matches the current mode. No countdowns, fake scarcity, or invented testimonials. Both appearances.
- **Not found and server error** — a short sentence and a single way back to the dashboard. No illustrations.

### States

- **Empty states** — plain and useful: a sentence naming what's missing and the one action to fix it. "No mesocycle yet. Create your first one." "No gyms yet. Add the gym you train at." No illustrations or jokes.
- **Error states** — inline, factual, with a retry. Never alarming red full-screen takeovers.
- **Loading states** — skeletons shaped like the final content; no spinners over empty screens. The logging card keeps its layout while loading so nothing jumps.
- **Mobile** — the primary layout. Primary actions sit within thumb reach at the bottom of the screen, and navigation is a simple bottom bar on mobile. Never hide core navigation behind a hamburger menu.

### Goal completion

Reaching 100% on a goal is acknowledged with a calm, full-width card: "Goal reached: Barbell Bench Press 315 × 1", with actions to set a new goal or dismiss. No confetti, no animation beyond a short fade, no sound.

## Respecting provided input

If the user provides design, code, or markup, respect its original design, fonts, colors, spacing, and style as much as possible — extend rather than override.