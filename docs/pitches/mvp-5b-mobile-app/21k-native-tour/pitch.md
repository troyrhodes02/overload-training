# Pitch 21k — Native Tour

> Source: the expanded pitch the owner supplied to start the pipeline run of 2026-11-25, condensed here without changing its substance. It expands `docs/planning/mobile-roadmap.md` → "21k — Native Tour (M)": *a native coach-mark system, since the web tour is anchored to the page. It reuses the shared tour content and starts after the beta has begun.* The audit's notes for this slice are `docs/planning/mobile-audit.md` §2 (`POST /me/tour/offered`, `PUT /me/tour/outcome`) and §4 ("Native coach marks anchored by refs").

**Project:** Overload V1
**Parent:** Pitch 21 — Mobile App
**Milestone:** MVP 5B — Mobile App
**Type:** Feature — native mobile slice
**Appetite:** Medium (M)
**Client scope:** Native iOS, with two additive mobile API endpoints and one additive app-config field. The web gets no visible change.
**UI-bearing:** Yes (mobile-only: no `preview.tsx`; the visual contract is design.md §15)
**Plan placement:** Free. Guidance is never gated.
**Dependencies:** 21a–21j and OVE-241 (all released). Pitch 11 (Onboarding Tour) for the content and the progress model. Pitch 12 (What's New) stays separate.
**Downstream:** 21l — TestFlight Beta, which turns on the automatic first-login tour and writes the "Overload on iPhone" release note.

---

## 1. Problem

The iPhone app covers the whole training loop, but it has no guided introduction. The web tour (Pitch 11) is anchored to DOM elements and cannot run on the phone. A new lifter on the iPhone has to find Today, the workout, Plan, History, Goals, Exercises, Gyms, and Settings unaided.

## 2. Desired outcome

A lifter follows a short native tour that highlights the real controls of the app. The tour:

- introduces the core training journey with the existing approved tour words;
- follows the real native navigation;
- can be skipped at any time, finished, and replayed from More;
- records progress on the same per-account record the web uses;
- copes with missing or slow targets without trapping the lifter or drawing a wrong highlight;
- never changes training data;
- works in light and dark, with large text and VoiceOver.

## 3. Appetite

Medium. One focused native coach-mark system. Not a tutorial platform, not a navigation redesign, and not a new training workflow.

## 4. Owner-level decisions (pre-resolved)

| # | Decision |
| --- | --- |
| RD-A | Real native coach marks over the React Native app. No WebView. Existing native primitives where possible. |
| RD-B | Reuse the Pitch 11 tour content (`@overload/shared/tour/content`). Native wording adaptations are allowed where a sentence would be wrong on the phone. No second source of onboarding truth. |
| RD-C | A short journey covering Today, workout logging, Plan, History, Goals, Exercises and Gyms, and More/Settings. Related concepts can share a step. About one to two minutes. |
| RD-D | Point at real native elements. Never highlight an arbitrary place because a target is missing. No screenshots posing as UI. A clear fallback explanation when a precise anchor is unavailable. |
| RD-E | Zero training-data mutations: no workout created, started, logged, finished, skipped, or rescheduled; no plan, goal, gym, or schedule change. |
| RD-F | A no-plan account gets a useful tour from the empty states. No example data, no fabricated records. |
| RD-G | Protect active workouts: never interrupt logging or lose unsaved state. Refuse or defer launch from an unsafe state with an explanation. Never force navigation away from active edits. |
| RD-H | Reuse the Pitch 11 progress model (`TourProgress`). No duplicate progress table, no platform-specific records unless genuinely required. Never reset a completed web tour. Replay never restarts the first-login tour. |
| RD-I | A clear "Take a tour" action in the native Settings/Help hierarchy: discoverable, not dominant, available to every account, and it never resets completion. |
| RD-J | No automatic first-login tour in 21k. Manual launch works on staging. Existing testers never see it automatically, and an OTA never triggers it. A minimal gate compatible with app-config is acceptable. Record the 21l activation plan. |
| RD-K | A missing, unmounted, loading, or unavailable target never traps the lifter or draws a wrong highlight. Bounded retry or fallback, always advanceable and skippable, and normal navigation restored on exit. No infinite waits. |
| RD-L | Prefer existing dependencies. Deliver by OTA if the runtime fingerprint is unchanged; otherwise follow the native-build gate. |
| RD-M | Accessibility is part of the build: VoiceOver labels and focus order, clear actions, Dynamic Type, Reduce Motion, contrast, light and dark, safe areas, accessible dismissal. The tour must work without relying on the visual highlight. |
| RD-N | No 21k release note. The "Overload on iPhone" What's New entry is reserved for 21l (21j RD-6). |
| RD-O | The owner runs only two short iPhone scenarios on one retained staging account. Automated tests cover the detail. |

## 5. Solution shape

1. **Settings entry.** More gains a **Take a tour** row. It opens a short introduction card that says what the tour is, that it changes nothing in the lifter's training, and that it can be skipped.
2. **Coach marks.** A dimmed overlay with a cut-out around a real control, a short title, one or two sentences, a step counter, Back, Next or Done, and Skip tour.
3. **Navigation.** The tour moves between the tabs with the app's own router, waits for the target to mount (bounded), measures it, and drops stale measurements. It never pops a screen the lifter left open.
4. **Workout guidance.** Today's Start or Resume button when there is one, otherwise the day's block with an explanation. The tour never starts a workout to show the logging card.
5. **Ending.** Done records `completed`, Skip records `skipped` (the web's latest-outcome rule), the overlay is removed, and the lifter is back on More with everything interactive.
6. **Progress.** Two additive endpoints over the existing `tour/progress.ts`: `PUT /me/tour/outcome` and `POST /me/tour/offered`. Identity from the verified token, retry-safe.
7. **Rollout gate.** An additive `app-config` flag, off by default, decides whether the app may start the tour by itself. 21l turns it on.

## 6. Cross-client semantics to specify

New account without a plan; an account that finished the web tour; one that skipped it; an account with training history; manual launch; skipping and finishing a replay; signing out, auth expiry, and suspension mid-tour; switching between web and native; and an unavailable target. Account isolation is preserved throughout.

## 7. Rabbit holes

- Measuring native tab bar items (UIKit; not reachable from React Native) → the tour names the tab in words and highlights the screen it opens.
- Timing between a navigation and the target mounting → a bounded wait on anchor registration, a stable-measurement check, and a generation token.
- An overlay that keeps intercepting touches after it closes → the overlay is unmounted, never hidden.
- A third-party tour library → not needed; React Native core suffices.

## 8. Out of scope

Automatic first-login onboarding being switched on (21l). A 21k release note. A web tour change beyond moving one sentence into the shared package. A tour step registry for the web's What's New "Show me" on native. Production promotion, a Production OTA, TestFlight, a Production-connected build, App Store Connect, and 21l. OVE-255 (a separate pre-TestFlight chore).

## 9. Definition of done

The tour is implemented, independently reviewed, verified by the automated suite, merged into `staging`, and delivered to the owner's installed development build as one staging update, ready for two short iPhone checks.
