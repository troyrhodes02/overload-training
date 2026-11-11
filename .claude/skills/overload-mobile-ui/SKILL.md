---
name: overload-mobile-ui
description: >
  Design guidance for Overload's native iPhone app (React Native with Expo). Use
  when writing the Mobile design section of a design doc, when building or
  reviewing any mobile screen or component, and when the user says "mobile UI",
  "native screen", "React Native", "Expo", "tab bar", "bottom sheet", "iPhone
  layout", or "map this to mobile". Maps a web design to native navigation,
  sheets, pickers, keyboards, haptics, and states while keeping Overload's quiet,
  precise brand. Reads the mobile slice specs for the chosen libraries and does
  not guess them.
---

# Overload Mobile UI

Overload's iPhone app is a native interface on the same backend as the web product. This skill turns a web design into a native one. It shares the brand, palette, and typography with `overload-ui-design` (a quiet, precise instrument), and it adds the native patterns the web does not have.

## Before you start

1. Read `docs/planning/mobile-roadmap.md` and the Mobile App slice specs (`spec.md` in the `21a` to `21c` pitch folders under `docs/pitches/mvp-5b-mobile-app/`). They record the navigation, styling, data-fetching, chart, and storage choices. Follow them exactly and do not choose libraries here.
2. Read the feature's `design.md` for the intended behavior, and the web screen it maps from. Parity means equivalent capability, not identical screens.
3. Read `CLAUDE.md`, especially the mobile app rules and the plan rules.

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
- **Quiet by default.** No gamification, streaks, confetti, or countdowns. The dashboard greeting is one plain line. The upgrade note for a Pro feature is one dismissible sentence.

## States every screen needs

Loading (a skeleton shaped like the content), empty (one sentence and one action), error (plain words and a retry), unreachable (the app is online-only, so say it needs a connection and keep what the lifter entered), locked (the quiet Pro note), and the version-gate screen that asks for an update. A failed save must never discard numbers the lifter typed.

## Accessibility

VoiceOver labels on every control, sensible reading order, Dynamic Type without clipping, sufficient contrast in both appearances, and respect for Reduce Motion.

## What to produce

There is no standalone mobile preview file. The visual contract for a mobile screen is the **Mobile design** section of the feature's design doc, which lists for each screen: its place in the navigation, an ASCII layout, the native components and patterns used, the states above, and how it differs from the web screen and why. Build from that section and the slice spec.

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

A run can type-check, lint, and unit test mobile code, but it cannot see the screen on a device. Report the visual and interaction checks as unverified and list what you should look at on the phone: which screen, which states, which gestures, and in both appearances.

## In an unattended run

Decide, do not ask. Record native-pattern choices as Resolved Decisions in the spec. If the slice specs have not chosen a library the screen needs, record that as an open question for the controlling slice.
