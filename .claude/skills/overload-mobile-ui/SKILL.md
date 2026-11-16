---
name: overload-mobile-ui
description: >
  Design guidance for Overload's native iPhone app (React Native with Expo). Use
  when writing the Mobile design section of a design doc, when building or
  reviewing any mobile screen or component, and when the user says "mobile UI",
  "native screen", "React Native", "Expo", "tab bar", "bottom sheet", "iPhone
  layout", or "map this to mobile". Maps a web design to native navigation,
  sheets, pickers, keyboards, haptics, visual hierarchy, and states while keeping
  Overload's quiet, premium, precise brand. Reads the mobile slice specs for the
  chosen libraries and does not guess them.
---

# Overload Mobile UI

Overload's iPhone app is a native interface on the same backend as the web product. This skill turns a web design into a native one. It shares the brand, palette, and typography with `overload-ui-design` (the shipped colors in `globals.css`, exposed to native as the shared design tokens in `packages/shared`) — a quiet, precise instrument — and adds the native patterns the web does not have.

**Design identity: premium, minimal, athletic, focused, native.** The app should feel like a polished strength-training product, not a collection of functional placeholders. Borrow the visual hierarchy, typography, spacing, and surface quality of premium mobile apps without copying their branding or adding decorative complexity.

## Before you start

1. Read `docs/planning/mobile-roadmap.md` and the Mobile App slice specs (`spec.md` in the `21b` to `21d` pitch folders, and `21i` for the chart, under `docs/pitches/mvp-5b-mobile-app/`). They record the navigation, styling, data-fetching, chart, and storage choices. Follow them exactly and do not choose libraries here.
2. Read the feature's `design.md` for the intended behavior, and the web screen it maps from. Parity means equivalent capability, not identical screens.
3. Read `CLAUDE.md`, especially the mobile app rules and the plan rules.
4. Inspect existing native screens and shared components before introducing a new layout pattern. Preserve approved brand decisions and maintain consistency across tabs.

## Visual direction

- **Strong hierarchy.** Every primary tab needs an intentional screen header: recognizable title or personalized greeting, useful context, and consistently placed actions. Avoid floating controls, missing page titles, and large unexplained gaps above content.
- **Purposeful density.** Put meaningful content near the top. Use compact sections, readable cards, and deliberate spacing. Neither crowd the screen nor leave it looking unfinished. One clear primary action per state.
- **Layered surfaces.** Use the existing tokens to distinguish backgrounds, cards, and interactive elements. Dark mode should have subtle charcoal depth rather than uninterrupted black; light mode should feel clean and comfortable. Do not invent a competing palette.
- **Typography first.** Workout names, exercise prescriptions, weights, and actions lead. Supporting dates, labels, and explanations are quieter but remain legible. Prefer typography and spacing over decorative borders, oversized icons, or imagery.
- **Training over decoration.** Show actual workout context, progress, and next actions. No fake statistics, decorative athlete photos, gratuitous gradients, or dashboard widgets without a real function.
- **Consistent composition.** Reuse established screen headers, section headings, card treatments, empty states, and action placement across Today, History, Plan, Goals, and More. Adapt to each screen's purpose rather than making every tab the same dashboard.
- **Intentional unfinished states.** A feature deferred to a later pitch still needs a polished, honest screen with a clear explanation and useful handoff. Never invent data or imply unavailable functionality exists.
- **The shared composition (in `apps/mobile/src/ui`).** A tab's root screen is `TabScreen`, which renders `ScreenHeader` (a small uppercase context line, the title, an optional subtitle) and sets `headerShown: false` on that route. Pushed screens keep the system back header, so two headers never compete. Do not rely on the native large title until it is verified on a device. Cards are `Surface` (card color, token border, `radius.xl`). Status is a `Chip` in words. Section headings use `SectionHeader`. Add a new pattern only when these can't express the screen.
- **Realistic density.** Judge a screen with realistic content: a full workout, a long exercise name, a week with five rows. Judge it too with the thinnest real state, such as a rest day or one exercise. Neither may look broken or empty.
- **Blocked states.** When the server blocks an action (a missed day before today's workout), say what is blocking and offer the resolution in place where the backend supports it. Keep the blocked content visible but inert. The `attention` token marks only scheduling problems that need the lifter. It is never decoration or a second accent.

## Mapping a web design to native

| Web | Native |
| --- | --- |
| Sidebar or top navigation | A bottom tab bar for the few primary areas, with a stack per tab and the system back gesture |
| Dialog | A bottom sheet for choices and forms, a system alert only for a short confirmation |
| Select or dropdown | A native picker, or an action sheet for a short list |
| Table | A grouped list with clear row hierarchy |
| Hover and tooltips | Press states. Nothing may depend on hover |
| Toast | An inline banner or a haptic, not a floating web toast |
| Popover tour | Native coach marks anchored to real controls |
| Chart | A native chart with large touch targets and no tiny legends |
| Settings page | A grouped settings list |

## Interaction rules

- **One-handed set entry.** Weight and reps are the largest elements on the logging screen. Use the decimal keypad for weight and the number keypad for reps, move focus forward on submit, keep the primary action within thumb reach, and never let the keyboard cover the field being edited.
- **Haptics.** A light haptic when a set is logged, and a success haptic when a workout is finished. Nothing decorative.
- **Targets and gestures.** Touch targets are at least 44 points. Every action is reachable without a hidden gesture. Swipe actions are an addition, not the only way.
- **Layout.** Respect safe areas and Dynamic Type. Use pull to refresh on lists that can be stale. Support light and dark following the system, with the in-app setting overriding.
- **Navigation.** Keep screen titles, back actions, settings access, and bottom-tab behavior predictable. Avoid duplicate or isolated navigation controls.
- **Quiet by default.** No gamification, streaks, confetti, or countdowns. The dashboard greeting is one plain line. The upgrade note for a Pro feature is one dismissible sentence.

## States every screen needs

Loading (a skeleton shaped like the content), empty (one sentence and one action), error (plain words and a retry), unreachable (the app is online-only, so say it needs a connection and keep what the lifter entered), locked (the quiet Pro note), and the version-gate screen that asks for an update. A failed save must never discard numbers the lifter typed.

**A failed load is never shown as empty, and never as the server's words.** Use the shared load-error description (`describeLoadError` with `LoadErrorState`). It says what failed: no connection, not responding, signed out, or a server older than the app. Developer builds also show the request and status. "Empty" is only for a successful answer with nothing in it.

**Design every state with the same visual care as the populated screen.** Distinguish empty data from failed loading, explain blocked actions, and place recovery controls where users expect them. Do not center a lone placeholder card in an otherwise empty tab unless the layout has an intentional reason.

## Accessibility

VoiceOver labels on every control, sensible reading order, Dynamic Type without clipping, sufficient contrast in both appearances, and respect for Reduce Motion. Visual hierarchy must survive larger text and smaller supported screens.

## What to produce

There is no standalone mobile preview file by default. The visual contract for a mobile screen is the **Mobile design** section of the feature's design doc, which lists for each screen: its place in navigation, an ASCII layout, native components and patterns, visual hierarchy, primary action, states, and how it differs from the web screen and why.

For UI-bearing features, also review the design across related screens in both appearances. Where the established workflow requires an owner visual checkpoint, provide the supported preview or review artifact before approval. An ASCII layout alone does not establish visual polish.

Example, the logging card:

```text
┌────────────────────────────┐
│ ‹ Push Day 1          2 / 5│
│ Barbell Bench Press        │
│ Downtown Gym · 3 × 6–8     │
│ [Progress]                 │
│                            │
│  Set 1   185 lb   8 reps ✓ │
│  Set 2   185 lb   8 reps ✓ │
│  Set 3  [ 185 ] [  _ ]     │
│                            │
│ ┌──────────┐ ┌───────────┐ │
│ │  Swap    │ │ Log set   │ │
│ └──────────┘ └───────────┘ │
└────────────────────────────┘
 decimal keypad appears here
```

## Verifying honestly

A run can type-check, lint, and unit test mobile code, but it cannot establish how the screen actually feels on a device. Report visual and interaction checks as unverified until performed.

Review screen hierarchy, content density, top spacing, card consistency, keyboard behavior, navigation, loading/empty/error states, and light/dark parity. Test actual workout flows, not just isolated screens. Check both simulator and physical-device requirements from the controlling runbook.

A simulator or device review that the owner signs off on needs this setup, written into the runbook:

- **API origin.** Confirm the API the app is talking to (More → Diagnostics → API) before judging any state. A development build pointed at the wrong server shows failures that aren't in the code.
- **Fresh test data.** Use a fresh, disposable seeded account for each state under review: pending, in progress, done, missed day, empty. Never reuse a modified QA account, or the owner's own account.
- **Clean screenshots.** Hide the development-only tools (the Expo tools button: shake, then "Show tools button" off) before capturing anything for visual review.
- **Both appearances.** Review the actual flows in light and dark, not only static screens.

## In an unattended run

Decide, do not ask. Record native-pattern choices as Resolved Decisions in the spec. If the slice specs have not chosen a library the screen needs, record that as an open question for the controlling slice. Preserve mandatory owner design approvals and stop at those checkpoints rather than treating autonomous design choices as approved.
