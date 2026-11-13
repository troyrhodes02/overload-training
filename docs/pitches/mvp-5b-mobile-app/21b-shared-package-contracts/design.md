# Shared Package & Contracts — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 21b: Shared Package & Contracts (`docs/pitches/mvp-5b-mobile-app/21b-shared-package-contracts/pitch.md`)
**Focus:** The rules and response shapes the iPhone app will need move into one shared package that the web already uses, so the two clients can never disagree about a weight, a date, a label, or an error, and a lifter on the web notices nothing.

> **No UI surface.** The pitch adds no screen, page, form, navigation element, or visible state, so the UI preview stage is skipped ("Skipped — no UI surface in this pitch", recorded in the feature PR). As with Monorepo Move (21a) and Multi-User Foundation (Pitch 8), this document specifies **behavior and boundaries**: what every existing web surface must keep doing, what lives in the shared package and what never may, how the web consumes it, what the mobile contracts promise about data, and how the run proves nothing changed. File-by-file moves, export lists, and type definitions belong to the spec.

---

## 1. Vision

A lifter logs a set on the web the day after this ships and every number, message, label, call, and date reads exactly as before. A developer starting the iPhone app finds one place that answers "what is a valid weight?", "which day is today for this account?", "what does a locked Pro result look like on the wire?", and "what is this muscle group called?", and that place is the same code the web already runs.

**Design north star:** *one rule, one place, two clients; the lifter notices nothing.*

---

## 2. Design principles

### 1. Move, don't modify

Each pure module arrives in the shared package byte-for-byte in behavior: the same formula, thresholds, rounding, edge cases, messages, and constants. The only edits are import paths, and, where a file mixes pure and web code, the line that splits it. A "while we're here" fix is a behavior change and is out of scope.

### 2. Pure or it stays

The shared package holds code that runs anywhere: no database, no framework, no server, no browser, no environment variables. A file that reads data, checks access, resolves an entitlement, or touches the page stays in the web. When a file is mixed, only its pure part moves; the server part is never dragged along to keep a file whole.

### 3. Shared is not authoritative over access

The package can describe a Pro result, but it can never grant one. Entitlement resolution, capability checks, gating, account scoping, and every write stay on the server. The progression engine is shared so the server and its tests use one copy; the iPhone app will receive calls from the API, already gated, and will never run the engine to unlock anything.

### 4. The contract is the server's real output

A mobile response type is not a hopeful sketch. Where the web already builds a response (Today, the workout, history, goals, the library), its type moves to the shared package and the server keeps building it, so the compiler proves the server's output and the contract are the same shape. New shapes (the error envelope, app config, `me`) are written once, beside them.

### 5. A guard that stops looking is a guard that fails

The guard tests that pin one e1RM formula, one gym-variable rule, one recommendation builder, one tour registry, and the release-note boundaries work by reading files. After the move they read the shared package too. A suite that passes because the file it guarded moved out of its view is a failure.

---

## 3. Visual language

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

No visual change. The design tokens (colors, radius, type scale, control heights, overlay, chart) are copied into the shared package as plain values for the iPhone app to use later. The web keeps `globals.css`, Tailwind, and shadcn/ui exactly as they are; a test keeps the two in step. Where the web holds a second copy of a color today (the browser chrome colors), it reads the shared value instead, with no change to the color itself.

### State colors

Unchanged. The progress and deload status colors are among the shared values, with their light and dark variants.

---

## 4. Information architecture

```text
overload-training/
├── apps/web              Next.js app (unchanged behavior)
│   └── src/lib/…         data access, auth, entitlements, gating, writes,
│                         server-only reads, and the web halves of split files
│        │
│        │ imports (one direction only)
│        ▼
├── packages/shared       @overload/shared — pure TypeScript, no runtime deps
│   ├── progression/      e1RM, constants, deload math, engine, history, recommendation wording
│   ├── logging/          RIR, logging-card rules, weight rule, effective schedule
│   ├── plan/             rep targets, calendar and "today", presets, weekdays, validation, readiness
│   ├── cardio/           validation, occurrences
│   ├── exercises/        taxonomy, gym-variable, loading mode, validation, image URL builder
│   ├── goals/            progress, dashboard rule, validation
│   ├── gyms/ accounts/ feedback/   field validation
│   ├── billing/ entitlements/      plan and capability names (no resolution)
│   ├── release-notes/ tour/ appearance/   content and values (no rendering)
│   ├── enums.ts          Prisma enum values as tuples
│   ├── contracts/        mobile API response and request types, error envelope
│   └── design/           tokens
│
└── apps/mobile           (21d) will import packages/shared and call the API only
```

The arrow is the whole architecture: the web and, later, the iPhone app depend on the shared package; the shared package depends on nothing in either app.

---

## 5. Surfaces affected

| Surface | Change a lifter can see | Change a developer sees |
| --- | --- | --- |
| Every web page and action | None | Imports of moved rules come from `@overload/shared/…` |
| Logging card (client) | None | Uses the shared weight and reps rules the server uses |
| Exercise history, goals, logging card, recommendation lines | None (same printed numbers) | One shared weight formatter instead of four |
| Tour, What's New, changelog | None (same copy, same order) | Copy and order come from the shared content; web anchors stay in the web |
| Theme colors, browser chrome color | None | Values pinned to the shared tokens by a test |
| Mobile API | Does not exist yet (21c) | Its response and error types exist, as types only |

---

## 6. Screen specifications

### Screen 1: Every existing web screen, after the extraction

#### Purpose
Prove that a lifter's web experience is identical.

#### URL pattern
All existing routes, unchanged.

#### Trigger
Any visit after the 21b feature merges into staging.

#### Layout
Unchanged.

#### Behavior
- Every validation message, limit, and refusal is word-for-word the same. A weight of 185.125 is still refused with "Use at most two decimal places."; reps of 0 still read "Enter reps above 0."
- Every printed load is the same string as before (185, 182.5, 102.5; never float noise).
- Every progress, hold, and deload call, every recommendation line, every e1RM figure, every goal percentage is the same for the same logged sets.
- "Today", the planned day, missed days, and history weeks fall on the same calendar dates in the account's time zone.
- Free and Pro see exactly what they saw: locked notes where they were, Pro content where it was.

#### Empty, loading, and error states
Unchanged.

### Screen 2: The shared package (developer surface)

#### Purpose
Give the next slices one obvious home for every portable rule and response shape.

#### Trigger
A developer (or a pipeline run) needs a rule or a type on both clients.

#### Layout
See Information architecture. Each shared module keeps its web name minus `src/lib/`, so `@/lib/plan/calendar` becomes `@overload/shared/plan/calendar`; anyone who knew the old path finds the new one.

#### Behavior
- Importing anything server-, framework-, browser-, or Node-specific into the package fails lint and `npm test`, naming the rule.
- The package type-checks without DOM or Node types, so a browser or Node global fails the build.
- Shared code is tested by the web's existing unit project, where those tests already lived; no second test runner.

#### Error state
A forbidden import, a runtime dependency, or a Prisma enum value added without its shared tuple fails `npm test` with a message naming the file and the rule.

### Screen 3: The mobile contract (developer surface for 21c onward)

#### Purpose
Fix what the mobile API will send and accept before any endpoint exists.

#### Behavior
- Every success body is plain JSON: no `Date`, no `Set`, no `Decimal`, no `undefined`-only meaning.
- A calendar date is `YYYY-MM-DD`; an instant is a full ISO-8601 timestamp; the two are never mixed in one field.
- `null` means "not recorded" or "none": a bodyweight set's weight, an unrecorded RIR, a goal with no performance yet. Zero is only ever a real zero.
- A gated Pro result arrives with its `locked` flag and its Pro fields `null`, exactly as the web's gated query returns it. The contract never offers a path to the unlocked shape without the server deciding.
- A failure is `{ error: { code, message, details? } }`, with the existing error codes plus the two the API adds (`account_suspended`, `upgrade_required`).

---

## 7. Navigation flows

None for the lifter. The developer flow:

```text
need a rule on both clients
   → is it pure? ── no ──→ it stays in apps/web; the API (21c) exposes its result
        │ yes
        ▼
   @overload/shared/<domain>/<module>  ←── web imports it
                                       ←── mobile (21d+) imports it
```

---

## 8. Interaction specifications

No new interaction. Keyboard behavior, loading, errors, and notifications are unchanged on every surface. The logging card's inline field errors keep their wording and focus behavior; the only difference is that the card and the server now read one reps rule instead of two copies.

---

## 9. Responsive behavior

Unchanged at every breakpoint.

---

## 10. Component inventory

No component is added or changed. Shared modules are listed in the spec.

| Component | Location | New / reused | Notes |
| --- | --- | --- | --- |
| `ExerciseCard` | logging flow | reused | Imports the shared weight and reps rules; same messages |
| Tour provider and overlay | shell | reused | Steps built from shared content plus web anchors |
| What's New, changelog | settings, marketing | reused | Read the shared catalog |

---

## 11. Accessibility, privacy, and data sensitivity

- No change to accessibility.
- The shared package contains no personal data, no secrets, and no environment reads; it is safe to ship inside a client bundle and, later, an app binary.
- The contracts describe one account's own data. Nothing in them names, lists, or reveals another account.
- The package holds no data access, so it cannot become a path around account isolation, logged-history integrity, or the gym-baseline rules.

---

## 12. Out of scope

Deferred to later slices (do not build, do not preclude):
- The mobile API routes, token verification, proxy exemption, idempotency table, version gate, and app-config handler (21c).
- Server extractions the API needs (`getTodayView`, `getWorkoutView`, one goal-reconcile function) (21c).
- The Expo app, navigation, native components, native tour, and Hermes `Intl` verification (21d onward).
- Request-body schema libraries for the API (21c decides whether to wrap the shared parsers).

Permanent non-goals: a second progression engine, a client-side unlock of Pro results, program generation, and any change to Free and Pro placement.

---

## 13. User guidance

No visible change, so no tour step and no release-note entry.

---

## 14. Plan placement and client scope

- **Plan placement.** Unchanged. No capability is added, removed, or moved. The shared package carries the capability names and the plan-to-capability map as data; enforcement stays in `apps/web`.
- **Client scope.** The shared package and the existing web app. Mobile impact: this slice is the foundation 21c and 21d consume.

| Surface | Shared logic | API | Web UI | Mobile UI | Reason |
| --- | --- | --- | --- | --- | --- |
| Training rules (e1RM, engine, schedule, rep targets, logging card rules) | moved | none yet (21c) | unchanged | later (21e+) | One rule for both clients |
| Validation parsers and limits | moved | 21c wraps them | unchanged | pre-validation later | Same messages on both clients |
| Enum values | tuples + parity test | — | unchanged | later | No drift from Prisma |
| Response types and error envelope | contracts | 21c serves them | unchanged | 21d+ consumes | Server output is the contract |
| Tour and release-note content | moved | 21h exposes notes | unchanged | 21k native tour | One copy of the words |
| Design tokens | values | — | unchanged (parity test) | 21d | One palette |

No Mobile design section: no mobile screen exists in this slice.
