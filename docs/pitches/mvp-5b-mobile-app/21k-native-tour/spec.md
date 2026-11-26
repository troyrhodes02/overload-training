---
version: 1.0.0
status: approved
author: Claude Code (unattended pipeline run, 2026-11-25)
last_updated: 2026-11-25
pitch_reference: docs/pitches/mvp-5b-mobile-app/21k-native-tour/pitch.md
design_reference: docs/pitches/mvp-5b-mobile-app/21k-native-tour/design.md
prd_reference: docs/planning/prd.md (Onboarding Tour)
architecture_reference: docs/planning/architecture.md (TourProgress)
linear_issue: Linear milestone "Pitch 21k — Native Tour"
---

# Native Tour — Technical Specification

**Design:** `design.md` in this folder. Its §15 (Mobile design) is the binding native visual contract. There is no `preview.tsx`. Step 3 is recorded as *Skipped — mobile-only pitch; the native visual contract is the Mobile design section, built with `/overload-mobile-ui`.* The visual review artifact is the design canvas (RD-21).

## 1. Summary

The iPhone app gets a native coach-mark tour of nine steps, launched from **More → Take a tour**. The words come from `@overload/shared/tour/content` (Pitch 11's registry; three native adaptations and the intro live in the same file). The mechanism is React Native core only: one transparent `Modal` over the whole app, a dim layer with a cut-out around a measured view, and a card. Anchors are named views registered while their screen is focused. The tour moves between the tabs with the app's router, never pops a tab stack the lifter left open, waits a bounded time for each target, measures it twice for stability, and falls back to words when it can't. Progress is the existing per-account `TourProgress` row, written through two additive endpoints over `tour/progress.ts`. The automatic first-login start is built but gated off by an additive `app-config.tourAutoStart` flag, false unless `MOBILE_TOUR_AUTO_START=true`; 21l turns it on.

No migration, no new table, no new dependency, no native-runtime change (the fingerprint must stay `2e4a65d9cda7675d9e8a7f1725dcc6b64468ac6c`), no web UI change, no release note.

## 2. Problem

See `pitch.md` §1. The web tour (`apps/web/src/components/tour/*`, `lib/tour/{engine,dom,steps}.ts`) is DOM-anchored and cannot run in React Native (audit §4).

## 3. Scope and non-scope

### In scope
- Shared: native copy beside the canonical copy; response DTOs; `AppConfigDto.tourAutoStart`.
- API: `PUT /me/tour/outcome`, `POST /me/tour/offered`; `app-config.tourAutoStart`.
- Native: the mechanism (`apps/mobile/src/tour/*`), the anchors on Today, Plan, History, Goals, and More, the Take a tour row, outcome writes, the dormant auto-start path.
- Tests: API contract and isolation; native machine, geometry, navigation-state, overlay, and real-router integration; static guards.
- Runbook and the staging update.

### Out of scope
Enabling auto-start anywhere (21l). A release note (RD-N). Web tour changes beyond moving one sentence to the shared package with identical text. The What's New "Show me" deep start on native. Highlighting tab bar items. OVE-255. Production, TestFlight, a Production OTA or build.

## 4. Core concepts

- **Step:** a shared id (`TourStepId`) with its native placement: the tab it lives on, its anchor names in priority order (zero for a note step), optional native body, and a "where" phrase for fallback.
- **Anchor:** a named native view, `TourAnchor`, registered in the tour's registry while its screen is focused, with a `measure()` and an optional scroller.
- **Run:** one pass from the intro to Done, Skip, or an interruption. `mode` is `manual` (from More) or `auto` (first login, gated).
- **Outcome:** `completed` or `skipped`, the latest run's, on `TourProgress` (Pitch 11 R7).
- **Offer:** `TourProgress.offeredAt`, spent when an automatic run first shows (Pitch 11 R8).

## 5. States and lifecycle

### 5.1 The machine (`apps/mobile/src/tour/machine.ts`, pure reducer)

```text
idle ──START(mode)──▶ intro ──BEGIN──▶ locating(i, token) ──FOUND(token,rect)──▶ showing(i, rect)
  ▲                    │ CANCEL (manual: no write)                 │ MISSING(token)──▶ showing(i, null)  (fallback)
  │                    │ CANCEL (auto: skipped)                     │
  │                    ▼                                            ▼
  └──── closed ◀── exiting(outcome|null) ◀── SKIP / DONE / INTERRUPT(reason) ─── showing / locating
                                showing ──NEXT/BACK──▶ locating(i±1, token+1)
```

- `idle`: nothing rendered. The Modal is unmounted (never merely hidden).
- `intro`: K1.
- `locating(i, token)`: going to step i and waiting for its target; K5. Each entry increments `token`; FOUND/MISSING with an old token are ignored (stale measurement).
- `showing(i, rect | null)`: K2 when `rect`, K3/K4 when null. `expectedPath` is recorded on entry.
- `exiting(outcome)`: overlay removed in the same render; the outcome write runs after, never blocking.
- NEXT/BACK/SKIP/DONE are accepted only from `showing` (SKIP also from `intro` and `locating`); anything else is a no-op, which is what makes repeated taps safe.
- Interruptions (`background`, `foreign_navigation`, `unmount`) are accepted from every non-idle state.

### 5.2 Locating a step (provider effect, keyed by `token`)

1. If the step's tab is not the current tab: if that tab's stack is not at its root (`tabAtRoot`, §7.4), dispatch MISSING at once (K3, "Find this in the X tab."). Otherwise `router.navigate("/<tab>")`.
2. A note step (no anchors) dispatches MISSING at once (K4 presentation is chosen by `step.kind === "note"`).
3. Poll every `TOUR_POLL_MS` = 100 ms until `TOUR_TARGET_TIMEOUT_MS` = 3,000 ms: take the first anchor in priority order that is registered and focused; measure it (§5.3). A valid rect → FOUND. The deadline → MISSING. Timers are cleared on every token change and unmount.

### 5.3 Measuring (`tour/geometry.ts`, pure; the provider does the I/O)

- `measureInWindow` twice, one animation frame apart; accept when both are within 1 pt (up to 5 tries).
- Visible band: top = safe-area top + 8; bottom = window height − safe-area bottom − `TAB_BAR_CLEARANCE` (64).
- A rect with zero width or height, or no overlap with the window, is invalid.
- A rect outside the band with a scroller: scroll by `rect.y − (band.top + 16)` (not animated), clamped to the scroller's known limits, then measure again. Still outside the band → invalid.
- The spotlight is the rect plus 6 pt padding, clipped to the band. The card goes below when the rect's center is in the upper half of the band, otherwise above; a note card sits above the tab bar; a fallback card is centered.

### 5.4 Ending

| Event | Write | Navigation afterwards |
| --- | --- | --- |
| DONE (last step) | `PUT /me/tour/outcome {completed}` | `router.navigate("/more")` (already there) |
| SKIP from a step or locating | `PUT … {skipped}` | `router.navigate("/more")` if More's stack is at root |
| CANCEL ("Not now") manual | none | stays on More |
| CANCEL auto | `PUT … {skipped}` (the offer is already spent) | stays on Today |
| INTERRUPT foreign_navigation | `PUT … {skipped}` (Pitch 11 R7) | left where it is |
| INTERRUPT background | none | left where it is |
| Unmount (sign-out, suspension, gate, account gone) | none | the gate owns it |

The write is fire-and-forget: one retry after 2 s on a network failure, nothing on any other error, never a visible error. On success `me` is invalidated so `tour.autoStart` refreshes.

## 6. Mobile API contract

### Shared contracts (`packages/shared/src/contracts`)

- `account.ts`: `TourOutcomeResponseDto = { outcome: TourOutcomeValue }`, `TourOfferedResponseDto = { spent: boolean }`. `TourOutcomeRequest` already exists in `requests.ts`.
- `app-config.ts`: `tourAutoStart: boolean` — whether the app may start the tour by itself for an account whose `me.tour.autoStart` is true. Added in 21k; an app built before it ignores it; an app reading a server without it treats `undefined` as false.

### Endpoints (both `mobileRoute`: bearer token, version gate, suspension refusal, rate limit, `no-store`)

| # | Method + path | Body | 200 | Errors | Retry |
| --- | --- | --- | --- | --- | --- |
| T1 | `PUT /api/mobile/v1/me/tour/outcome` | `{ outcome: "completed" \| "skipped" }`, JSON object, account body limit | `{ outcome }` | 400 `validation_error` (unknown outcome, non-object body); 401; 403 `account_suspended`; 426 | Absolute write: a repeat sets the same outcome (only `outcomeAt` moves) |
| T2 | `POST /api/mobile/v1/me/tour/offered` | none (ignored) | `{ spent }` — true only when this call spent a due offer | 401; 403; 426 | A repeat answers `{ spent: false }` and changes nothing |

Handlers (`apps/web/src/lib/api/mobile/account-settings.ts`): `putTourOutcome(account, request)` → `readJsonObject` → `recordTourOutcome(account, body.outcome)`; `postTourOffered(account)` → `markTourOffered(account)`. Neither reads an id from the body, query, or path; extra fields (`userId`) are ignored.

### App config (`apps/web/src/lib/api/mobile/version.ts`)

`tourAutoStart: env.MOBILE_TOUR_AUTO_START === "true"`. Documented in `.env.example` beside `MOBILE_MAINTENANCE`. Not set in any environment by this run.

### Compatibility

Additive only. Minimum app version unchanged. The installed build's current update ignores the new field and never calls T1/T2.

## 7. UI integration

### 7.1 Screen → endpoint map

| Surface | Reads | Writes |
| --- | --- | --- |
| K0 Take a tour row | — | — |
| K1–K5 overlay | `me` (cached; `tour.autoStart`), `app-config` (cached; `tourAutoStart`) | T1 on Done/Skip/foreign navigation/auto cancel; T2 when an auto run opens |
| Today, Plan, History, Goals, More | unchanged | unchanged |

### 7.2 Files (`apps/mobile/src`)

| File | Role |
| --- | --- |
| `tour/steps.ts` | `NATIVE_TOUR_STEPS`: `TOUR_CONTENT` joined to a `Record<TourStepId, NativePlacement \| null>` (null = not on native, with the reason in a comment). Anchor names `TOUR_ANCHORS`. |
| `tour/machine.ts` | The pure reducer (§5.1). |
| `tour/geometry.ts` | Band, validity, scroll delta, spotlight, card placement (pure). |
| `tour/navigation.ts` | `tabAtRoot(state, tab)`, `overTabs(state)` over the root navigation state (pure). |
| `tour/anchors.tsx` | `TourRegistryContext`, `TourAnchor` (a `View collapsable={false}` that registers on focus, unregisters on blur and unmount), `TourScrollProvider` (gives anchors a scroller: offset tracking, `scrollTo` limits). |
| `tour/TourProvider.tsx` | `useTour()` (`start(mode)`, `state`), effects (§5.2–5.4), `AppState` background interrupt, `usePathname` foreign-navigation interrupt, the gated auto-start. Takes an injectable `measure` (tests). |
| `tour/TourOverlay.tsx` | The Modal, dim rects, ring, cards, accessibility. |
| `api/account.ts` | `recordTourOutcome(api, outcome)`, `markTourOffered(api)`. |
| `app/(tabs)/_layout.tsx` | Wraps the tabs in `TourProvider`. |
| `ui/ScreenHeader.tsx`, `ui/TabScreen.tsx`, `ui/GroupedList.tsx` | Optional `tourAnchor` prop; `TabScreen` wraps its ScrollView in `TourScrollProvider`. |
| `today/TodayView.tsx` | Anchors `today-header`, `today-start` (Start/Resume button), `today-day` (the dashboard block). |
| `plan/PlanScreen.tsx`, `history/HistoryScreen.tsx`, `goals/GoalsScreen.tsx` | `plan-header`, `history-header`, `goals-header`. |
| `app/(tabs)/more/index.tsx` | The row; anchors `more-exercises`, `more-gyms`, `more-tour`; its ScrollView in `TourScrollProvider`. |

### 7.3 Steps (native placement)

| Id | Tab | Anchors (priority) | Native copy | Where (fallback) |
| --- | --- | --- | --- | --- |
| today | today | `today-header` | — | the Today tab |
| logging | today | `today-start`, `today-day` (body = `TOUR_LOGGING_NO_START_BODY`) | — | the Today tab |
| navigation | today | none (note) | `TOUR_NATIVE_BODIES.navigation` | — |
| plan | plan | `plan-header` | `TOUR_NATIVE_BODIES.plan` | the Plan tab |
| plan-import | — | not on native (web-only Pro import) | — | — |
| history | history | `history-header` | — | the History tab |
| goals | goals | `goals-header` | — | the Goals tab |
| exercises | more | `more-exercises` | — | More |
| gyms | more | `more-gyms` | — | More |
| plan-billing | — | not on native (no purchase path; read-only plan row) | — | — |
| settings | more | `more-tour` | `TOUR_NATIVE_BODIES.settings` | More |

When `logging` falls back with no anchor at all, its body is `TOUR_LOGGING_NO_START_BODY`.

### 7.4 Navigation rules

- `start()` refuses (K6 alert) unless the root stack shows the tabs with nothing over them (`overTabs` false) and the pathname is `/more` (manual) or `/today` (auto).
- `tabAtRoot(state, tab)`: true when the tab has no nested state yet (never visited) or its stack has exactly one route.
- The tour only ever calls `router.navigate` with `/today`, `/history`, `/plan`, `/goals`, `/more`. A guard test pins that list and forbids `/workout`, `push`, `replace`, and `back` in `tour/*`.
- Foreign navigation: in `showing`, a pathname different from `expectedPath` → INTERRUPT.

### 7.5 Shared content (`packages/shared/src/tour/content.ts`)

Unchanged `TOUR_CONTENT`. New:
- `TOUR_LOGGING_NO_START_BODY` — the web's `today-day` target body, moved verbatim; the web registry imports it.
- `TOUR_NATIVE_BODIES: Partial<Record<TourStepId, string>>` — navigation, plan, settings (design §6).
- `TOUR_NATIVE_INTRO = { title, body, start: "Start tour", dismiss: "Not now" }`.

### 7.6 Accessibility

- The Modal confines VoiceOver to the card. On each `showing`, `AccessibilityInfo.setAccessibilityFocus` on the title, whose label is "<title>, step n of N".
- The highlight is never the only cue. On a highlighted step VoiceOver hears "Highlighting <anchor label>" as the title's `accessibilityHint` (no extra visible text). On a fallback step everyone sees the "where" line.
- Dim rects: `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"`. `onAccessibilityEscape` on the card → SKIP.
- `AccessibilityInfo.isReduceMotionEnabled` (and its change event): Modal `animationType` "none" when on, "fade" otherwise.
- Dynamic Type: the card is a `ScrollView` capped at the space available; when `PixelRatio.getFontScale() > 1.3` the buttons stack vertically, full width.

### 7.7 Client scope and platform impact

Mobile. Web: one import change in `lib/tour/steps.ts` (same text). Server: §6.

### 7.8 User guidance

No tour change on the web, no release note (RD-N).

## 8. Data model

No change. `TourProgress` (Pitch 11) as is: one row per account, PK `userId`, `offeredAt`, `outcome`, `outcomeAt`. RLS on, deny-all (already). Owned-model scope coverage, export, and deletion already include it.

## 9. Authorization and access control

Both endpoints run the standard pipeline: the account comes from the verified token only, never from the request; a suspended account gets 403; a missing or invalid token 401; an old app 426. The handlers call `tour/progress.ts`, which uses `account.db` only. The native tour renders only inside the signed-in tabs, so a signed-out, suspended, or gated state unmounts it.

## 10. Storage model

No new storage. The app keeps no tour state on the device beyond memory for the current run, and one in-memory flag so an automatic run is attempted at most once per launch.

## 11. Cross-client account behavior

| # | Case | Behavior |
| --- | --- | --- |
| 1 | New account, no plan | Signup (web or native) made the row due. With the flag off (21k, everywhere) nothing opens by itself; Take a tour works; Today's logging step falls back to the no-plan block with the no-Start body; Plan shows its empty state under its title. |
| 2 | Finished the web tour | `offeredAt` set, `outcome=completed`: never auto-started on either client. Take a tour works. |
| 3 | Skipped the web tour | Same as 2 with `skipped`. |
| 4 | Training history | Nothing differs except real data under the highlights. Nothing is read or written beyond the row. |
| 5 | Native manual launch | Intro; nothing written until Done or Skip. |
| 6 | Skips a manual replay | `outcome=skipped`, `outcomeAt=now` (the latest run, R7). `offeredAt` untouched (or set if the row didn't exist). Auto-start can never re-arm. |
| 7 | Finishes a manual replay | `outcome=completed`. A completed tour stays completed; nothing becomes "unread" or due. |
| 8 | Signs out mid-tour | Tabs unmount → overlay gone, no write. |
| 9 | Auth expires mid-tour | The API client refreshes; if the refresh fails the session layer signs out (8). A failed T1 is dropped silently. |
| 10 | Suspended mid-tour | The next request's 403 moves the gate to Suspended; the tabs unmount (8). T1 is refused with 403 and nothing is written. |
| 11 | Web and native | One row. Whichever client records last owns `outcome`. An offer spent on one client is spent on both. |
| 12 | Target unavailable | Bounded wait → K3 with the "where" line; never a highlight. |

An account older than Pitch 11 has no row; T1 creates it (R7 "a replay by an account with no row creates one"), with `offeredAt = outcomeAt`, so it can never become due.

## 12. Validation rules

T1: body must be a JSON object within the account body limit; `outcome` must be a `TOUR_OUTCOMES` member (`isTourOutcome`), else 400 `validation_error` "Unknown tour outcome." T2: no body read.

## 13. Testing strategy

### API — `apps/web/tests/integration/mobile-tour.int.test.ts` (new; route handlers, real DB)
- T1 completed then skipped: the row holds the latest; a repeat is 200 and changes only `outcomeAt`; an unknown outcome and a non-object body are 400 and change nothing; an account with no row gets one with `offeredAt` set.
- T1 never re-arms: after T1, `GET /me` → `tour.autoStart` false.
- T2 on a due row → `{spent:true}`, then `{spent:false}`; on a no-row account `{spent:false}` and no row created; after T2, `me.tour.autoStart` false.
- `app-config.tourAutoStart` false by default, true only for exactly `"true"`.

### Isolation — `tests/integration/isolation/mobile-api.int.test.ts`
Both endpoints get `accountEndpointMatrix` (401 variants, 503, no-profile 401 with no profile created, suspended 403, version 426) and an isolation case: B's write with `userId: A` in the body changes only B's row; A's row is byte-identical.

### Static guards and contracts
- `tests/support/mobile-endpoints.ts` lists both (the registry guard fails otherwise).
- Unit: `mobileAppConfig` field; the handlers read no id.
- `tour-registry.test.ts` still pins the web copy; a new shared test pins that the web's logging target body is `TOUR_LOGGING_NO_START_BODY`.

### Mobile (`apps/mobile/tests`)
- `tour-machine.test.ts`: every transition; NEXT/SKIP/DONE double taps; stale tokens; CANCEL by mode; INTERRUPT from each state; counter.
- `tour-geometry.test.ts`: band, validity, scroll delta and clamps, spotlight clipping, card placement, stability.
- `tour-steps.test.ts`: every `TourStepId` has a native decision; native order = shared order; copy comes from shared (no literal tour sentence in `src/tour`); anchors used by placements exist in `TOUR_ANCHORS` and each is rendered by exactly one screen (source scan).
- `tour-navigation.test.ts`: `tabAtRoot` and `overTabs` on real states.
- `tour-flow.test.tsx` (real Expo Router via `renderRouter`, stack stand-ins for the native tabs as in `navigation.test.tsx`, an injected `measure`): manual start from More → intro → all nine steps → Done (one T1 `completed`, back on `/more`); Skip mid-way (one T1 `skipped`, overlay gone, More interactive); replay after completion and after skip; Not now (no write); a tab with a pushed screen is not popped and falls back; delayed anchor mount (found after the delay); missing anchor (fallback after the timeout, never a highlight); foreign navigation (interrupt, `skipped`); background (interrupt, no write); unmount mid-locate (no timer fires afterwards); repeated Next/Skip taps produce one transition and one write; no request other than T1/T2 is ever made (zero training calls); the start refusal when something is over the tabs.
- `tour-overlay.test.tsx`: accessibility (modal, title focus label, hint, escape → skip, dim hidden), Reduce Motion → no animation, large-text stacking, light and dark render with tokens only.
- `tour-autostart.test.tsx`: no auto-start when `tourAutoStart` is false or missing; with it true and `me.tour.autoStart` true on `/today`, one run and one T2; not on another path; once per launch.
- `fingerprint-inputs.test.ts` unchanged and green; the fingerprint is recomputed before the update (§15).

### Unverified by a run (owner checks, runbook §3)
How the overlay looks and feels on the device, that the Modal covers the native tab bar, real measurements, VoiceOver, and Dynamic Type on hardware.

## 14. Acceptance criteria

- [ ] More shows Take a tour for every account; it opens the intro.
- [ ] The tour shows the nine native steps in the shared order, with shared copy and the three native bodies.
- [ ] A highlight is drawn only around a measured, visible anchor; otherwise the card explains in words.
- [ ] Done records `completed`, Skip records `skipped`, Not now records nothing; each ends with the overlay unmounted and the app interactive.
- [ ] A tab stack the lifter left open is never popped; nothing over the tabs is ever dismissed.
- [ ] The tour makes no request except T1/T2.
- [ ] No automatic start anywhere while `MOBILE_TOUR_AUTO_START` is unset.
- [ ] Both endpoints pass the matrix and isolation cases.
- [ ] VoiceOver, Reduce Motion, and large text behave as §7.6.
- [ ] The fingerprint is unchanged; the update reaches build `c22ac9a0`.

## 15. Native runtime

No new dependency. `Modal`, `AccessibilityInfo`, `AppState`, `PixelRatio`, `measureInWindow`, and `Animated` are React Native core; `useRootNavigationState`, `usePathname`, `useFocusEffect`, and `router` are expo-router. `apps/mobile/package.json`, `app.config.ts`, and the lockfile are not touched. Before the update, `npx expo-updates fingerprint:generate` (or the publisher's own check) must give `2e4a65d9cda7675d9e8a7f1725dcc6b64468ac6c`; if it doesn't, the run stops at the native-build gate.

## Resolved Decisions

| # | Decision | Rationale | Authority |
| --- | --- | --- | --- |
| RD-1 | The overlay is one React Native `Modal` (transparent, over full screen) for the whole run, not a sibling view and not one Modal per step. | A Modal is the only React Native surface guaranteed to cover the UIKit tab bar and root-stack screens, it confines VoiceOver, and presenting once avoids iOS's "presentation in progress" failures between steps. Tab switches under a presented modal are allowed by UIKit. | RD-A, RD-M; design §8 |
| RD-2 | Native shows nine of the eleven shared steps; `plan-import` and `plan-billing` are not native steps. | Plan import is web-only (CLAUDE.md mobile rules), and the phone has no billing path; both would point at nothing. RD-C asks for a short journey. | RD-C; CLAUDE.md |
| RD-3 | Native wording: three bodies (navigation, plan, settings) and the intro live in `@overload/shared/tour/content` next to the canonical words; the web's logging alternate body moves there verbatim. | One file holds every tour sentence for both clients (RD-B). The three web sentences would be wrong on the phone: the menu, editing the plan, the "Account & app section". | RD-B |
| RD-4 | The tab bar is not highlighted. Tab steps highlight the screen title the tab opens; "Getting around" is a note card above the tab bar. | UIKit tab bar items aren't React Native views and can't be measured; a guessed rectangle is what RD-D forbids. | RD-D |
| RD-5 | A step whose tab stack isn't at its root is shown in words without moving there. | Navigating to a tab root pops its stack, which could discard a half-filled form (Goals → New goal). RD-G forbids forcing navigation away from edits. | RD-G |
| RD-6 | The launch is refused unless the tabs are on top and the pathname is `/more` (manual) or `/today` (auto). | The workout is a root-stack screen over the tabs; refusing whenever anything is over the tabs means a live workout screen can never be under the tour. | RD-G |
| RD-7 | The overlay absorbs every touch, including on the highlighted control. | RD-E: nothing pressed through the tour can start a workout or change a plan. | RD-E |
| RD-8 | Progress semantics are Pitch 11's, unchanged: Done → `completed`, Skip and foreign navigation → `skipped`, the latest run wins, replays never re-arm auto-start, no new table or column. | RD-H; Pitch 11 R5–R8 are the account-level semantics. "Completed" never becomes due or unread; the only consumer of `outcome` is the admin "Tour" column. | RD-H; Pitch 11 spec R7 |
| RD-9 | "Not now" on a manual intro records nothing; on an automatic intro it records `skipped`. | A manual intro dismissed is a cancelled tap, not a skipped tour. An automatic one has already spent its offer, and the lifter declined it. | Pitch 11 R7/R8 |
| RD-10 | Backgrounding ends the run with no write; foreign navigation ends it with `skipped`; sign-out, suspension, and gates unmount it with no write. | The web's mapping: reload/close records nothing, foreign navigation records skipped. RD-K/§9 require overlays removed on backgrounding. Only `background` counts, not `inactive` (Control Center). | Pitch 11 R7; RD-K |
| RD-11 | Outcome writes are fire-and-forget with one retry on a network error and no visible error. | Guidance must never block or alarm; a lost write only means the admin column is stale. | Judgment; Pitch 11 actions' behavior |
| RD-12 | Bounded waits: poll 100 ms up to 3,000 ms per step; stable when two measurements one frame apart agree within 1 pt (5 tries). | RD-K forbids infinite waits; 3 s covers a cold tab and a slow first read on cellular; the web uses 5 s for page loads. | RD-K; Pitch 11 R12 |
| RD-13 | Anchors register only while their screen is focused (`useFocusEffect`), keyed by name; the newest registration wins. | Unfocused tabs stay mounted in UIKit; measuring them would return stale or detached frames. | RD-D |
| RD-14 | Off-screen targets are scrolled into view by the screen's own ScrollView (not animated), then re-measured; still hidden → fallback. | Start workout often sits below the fold; scrolling is read-only. Not animated so measurement is stable and Reduce Motion is respected. | RD-D, RD-M |
| RD-15 | Automatic first-login start is implemented but gated by `app-config.tourAutoStart`, false unless `MOBILE_TOUR_AUTO_START` is exactly `"true"`, and unset everywhere by this run. An app also requires `me.tour.autoStart`, the Today tab, nothing over the tabs, and once per launch. 21l sets the variable. | RD-J: no automatic tour for testers or on an OTA; the gate is one additive field in the existing app-config, not a flag platform; 21l is then a config change. | RD-J; 21c app-config |
| RD-16 | T2 exists in 21k though nothing calls it while the flag is off. | It is the auto path's write; shipping it with its isolation coverage now keeps 21l to configuration. | RD-J; audit §2 |
| RD-17 | Both endpoints are Free, no capability check. | Guidance is never gated. | CLAUDE.md plans |
| RD-18 | No new native dependency; the fingerprint must stay `2e4a65d9cd…`; delivery is one staging OTA. | RD-L. Everything needed is React Native core or expo-router. | RD-L |
| RD-19 | No intro animation, no haptics, no completion card. | Quiet by default (overload-mobile-ui); RD-M Reduce Motion. | overload-mobile-ui |
| RD-20 | Tickets and delivery: a feature branch `feature/21k-native-tour` with four stacked ticket PRs: OVE-256 (API & shared), OVE-257 (mechanism), OVE-258 (sequence & integration), OVE-259 (verification, runbook & update), an independent review of the whole branch, fixes on the branch, then one squash merge into `staging` and one OTA. | The pipeline guide's canonical shape, and the run prompt asks for review before merging. | Pipeline guide §5 |
| RD-21 | The visual review artifact is the design canvas https://claude.ai/artifact/NGoZYaU5F3ZnUL2fHeLe2o (K0, K1, K2, K4, K3, large text, in light and dark, illustrative data). Design §15 wins where they differ. | The required step-3 artifact for a mobile-only slice. No owner design checkpoint is named by this run prompt, so it is presented with the owner notes, not as a stop. | Pipeline guide §5 step 3 |
| RD-22 | The owner's two iPhone scenarios use the retained staging account `21i-combined@example.com` (plan, history, goals, gyms); no new account. | RD-O. | RD-O |
| RD-23 | OVE-255 is not absorbed: no dependency on the delete screen. It stays in Backlog for before 21l. | The run prompt; no blocking link found. | Run prompt §1 |
| RD-24 | The 21b note "21k builds the native tour from `TOUR_CONTENT` with its own anchor map" is followed literally: `apps/mobile/src/tour/steps.ts` is the native anchor map. | 21b RD-20. | 21b spec |

## Open Questions

None block implementation. For the owner:

1. **When to set `MOBILE_TOUR_AUTO_START`.** 21l decides whether the friends' first TestFlight launch shows the tour. Existing friends who used the web already have `offeredAt` set and won't see it; only accounts created on the phone (or created since Pitch 11 and never toured) are due.

## 16. Future considerations

- 21l: set `MOBILE_TOUR_AUTO_START=true` on Production when the beta begins, write "Overload on iPhone", and check one fresh account sees the tour once (runbook §6).
- A native What's New "Show me" could call `start({ from })` like the web's.
- If the device shows the Modal fails to cover the tab bar, the fallback is a root-level sibling overlay; the machine and geometry are unchanged.
