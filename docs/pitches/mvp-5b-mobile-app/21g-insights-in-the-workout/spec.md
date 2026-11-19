---
version: 1.0.0
status: approved (unattended pipeline run, Autonomous Pipeline Policy)
author: Claude Code (pipeline run of 2026-11-18)
last_updated: 2026-11-18
pitch_reference: docs/pitches/mvp-5b-mobile-app/21g-insights-in-the-workout/pitch.md
design_reference: docs/pitches/mvp-5b-mobile-app/21g-insights-in-the-workout/design.md
preview_reference: skipped — mobile-only pitch; native visual contract provided by the Mobile design section (design.md §15) and /overload-mobile-ui
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
roadmap_reference: docs/planning/mobile-roadmap.md → 21g — Insights in the Workout
linear_milestone: Pitch 21g — Insights in the Workout (Overload V1)
---

# Insights in the Workout — Technical Specification

## 1. Summary

21g renders, on the iPhone, the progression calls the server already computes and gates for the web: the logging card's call and its evidence, the scheduled-deload week, and the post-workout summary's "next time" calls, with the quiet Pro note where a Free account's call was withheld. The phone runs no progression rule: it reads `OccurrenceProgressionDto` and `SessionProgressionSummaryDto` from the existing gated readers (`getOccurrenceProgression`, `getSessionProgressionSummary`) through the existing endpoints `GET /workouts/{id}` and `GET /history/{id}` — which 21e has been calling with `?fields=core` to skip exactly these fields.

The mental model: **two reads per surface.** The fast core read (unchanged) drives logging; a second, independent "insights" read of the same endpoint without `?fields=core` drives the call. They have separate cache keys, so an insight that is slow, failed, or locked never touches the card's inputs, and every write that can change a call marks only the insight read stale. The server adds one additive field, `OccurrenceProgressionDto.insufficientNote`, so the phone can say "Not enough history yet…" in the server's words instead of inferring it.

"Working" means: for the same account, workout, and gym, the phone shows the same chip, action line, and evidence as the web runner and Today day-complete block; a Free account's responses carry `locked` and no Pro value; a corrected set, gym change, swap, or entitlement change produces the new call on the next read; and the 21e/21f logging behavior is unchanged. The run also ships fifteen engine-verified development test-account profiles.

## 2. Problem

- The app cannot yet tell a lifter on the phone whether Bench should go up today: the card reads `?fields=core`, so the server never computes the call.
- The app cannot yet say why: the evidence string the server builds is never requested.
- The app cannot yet show that this is a planned deload week except as " · Deload week" in Today's week line.
- The app's summary (21e RD-14) says only "4 exercises · 11 sets": no per-set facts, no next-time calls, no goal movement.
- A lift with too little history and a Free account's withheld call both render as nothing, so the lifter can't tell "no call yet" from "locked".
- The owner cannot test any of this on a device without accounts whose real history produces each call.

## 3. Scope and non-scope

### In scope

1. Card insight block (design §6) on W1 for in-progress workouts: call, chip, evidence disclosure, not-enough-history line, loading, error/retry, Pro note.
2. One additive API field: `insufficientNote` on `OccurrenceProgressionDto` (all surfaces that return it: `GET /workouts/{id}`; the web runner ignores it).
3. Scheduled-deload banner on W1 and Today (all plans).
4. Full S1 Summary (design §6): saved facts from the record, gated calls, goals moved, Pro note; "View summary" on Today's done day.
5. Freshness: insight reads refetch on mount, screen focus, app foreground, and after every write that can change a call; never show a call from a failed read.
6. Development test-account profiles for every 21g scenario, an access switch (Pro ↔ Free) for disposable dev accounts, and an engine check printed by the command.
7. Tests: API (Pro/Free/isolation/transition/freshness/parity), fixture-engine integration, mobile unit and screen tests, regression of 21e/21f.
8. Runbook, staging merge, staging OTA.

### Out of scope

- Any change to the engine, recommendation copy, thresholds, e1RM, schedule, or entitlement model.
- Calls on Today's planned list (deferred; RD-9), calls on the History record (the web has none), exercise history/records/trends/charts and goal screens (21i), plans/library/gyms (21h), the native tour (21k), any purchase flow.
- A new endpoint, migration, owned table, environment variable, or native dependency.

## 4. Core concepts

| Concept | Description |
| --- | --- |
| Call | `OccurrenceProgressionDto` for one in-progress `LoggedExercise`: `tag` (progress/deload/stalled/null), `recommendation` ({kind, tone, action, evidence} or null), `suggestion`, `rirEffect`, `scheduledDeloadWeek`, `locked`, and new `insufficientNote`. Derived on read; never stored anywhere, on the server or the phone. |
| Today vs next time | While the workout is in progress the call advises today, judged on finished workouts only (the set being logged doesn't change it). Once complete, the summary's call says next time. |
| Hold | `recommendation.kind = "hold"`, `tag = null`: rendered as a quiet line with no chip (the web's unflagged hold). Not a fabricated state: the server returns it only from the engine's hold branch. |
| Not enough history | engine state `insufficient` → `recommendation = null`, `tag = null`, and `insufficientNote = "Not enough history yet[ at <gym>]: <n> of <required> complete sessions."` (the exercise page's existing `insufficientNote()` builder). |
| Locked | `locked = "progression_insights"`: a Free account's call had something to withhold. Pro fields are already null in the response. |
| Scheduled deload week | `WorkoutDto.scheduledDeloadWeek` (Free and Pro; schedule rules on the server, including shifted/late workouts by their scheduled date). Per card, Pro gets the `scheduled_deload` recommendation; reactive tags are null. |
| Insight read | A second TanStack query of the same endpoint without `?fields=core`, keyed `["workout-insights", id]` / `["history-insights", id]`. Used only for the call fields. |

## 5. States and lifecycle

No stored state is added. The insight block's client states:

| State | Condition (insight query + response for this card) | Renders |
| --- | --- | --- |
| loading | no successful answer since mount/invalidation (`isPending` or `isFetching` after invalidation with `isStale`) | one skeleton line |
| error | latest fetch failed (`isError`) | "Couldn't load the call for this lift." + Retry |
| locked | `locked !== null` | Pro note (unless dismissed this session) |
| call | `recommendation !== null` | chip (from `tag`) + action; evidence on expand |
| insufficient | `recommendation === null && insufficientNote !== null` | the note |
| none | otherwise (no entry for this card, or nothing to say) | nothing |

A card in mode `not_done` or `unavailable` renders no block. A finished workout is not shown in W1 (21e).

## 6. Mobile API contract

No new endpoint. Every handler, pipeline step, registry entry, and isolation case is 21c/21e's.

| Endpoint | 21g use | Gate | Change |
| --- | --- | --- | --- |
| `GET /workouts/{loggedSessionId}?fields=core` | card core read (unchanged) | auth | none |
| `GET /workouts/{loggedSessionId}` | insight read: `progression[]` | `progression_insights` via `gateOccurrence` | `progression[].progression.insufficientNote` added |
| `GET /history/{loggedSessionId}?fields=core` | summary record (unchanged) | auth | none |
| `GET /history/{loggedSessionId}` | summary insight read: `summary`, `goals` | `progression_insights` via `gateSessionSummary`; goals Free | none |
| `GET /today?fields=core` | Today (unchanged; banner from `dashboard.scheduledDeloadWeek`) | auth | none |

```ts
// packages/shared/src/contracts/progression.ts (additive)
export type OccurrenceProgressionDto = {
  // …existing fields unchanged…
  /**
   * Pitch 21g: the not-enough-history line, built by the existing
   * `insufficientNote()` from the engine's `insufficient` evidence; null for
   * any other call and in a scheduled-deload week. A statement about the
   * lifter's own logged data, not a call: kept on a Free account, exactly as
   * `gateHistory` keeps it on the exercise page. Optional in the type so an
   * older server's answer still type-checks; the app treats absent as null.
   */
  insufficientNote?: string | null;
};
```

Server change (`apps/web/src/lib/progression/queries.ts`, `computeOccurrenceProgression`): in the deload-week branch `insufficientNote: null`; otherwise `insufficientNote: insufficientNote(decision.evidence, gymVariable ? (le.gym?.name ?? null) : null)`. `gateOccurrence` spreads the DTO, so the note survives the gate; `hasCall` is unchanged (the note never sets `locked`).

**Backward compatibility.** Additive optional field; no status, error code, or existing field changes. 21e/21f builds keep sending `?fields=core` and are unaffected. No `minimumVersion` change.

**Retry safety.** Reads only.

**Errors.** As today: 401, 403 `account_suspended`, 404 `not_found` (another account's id), 426, 429, 5xx.

## 7. UI integration

### Screen → endpoint map

| Screen | Reads | Writes that invalidate insights |
| --- | --- | --- |
| W1 Workout | core workout; insight workout | gym change, swap, skip/undo, edit set, planned-sets edit, start/resume (mount) |
| S1 Summary | core record; insight record | edit set / planned sets (from History) |
| T1 Today | core today | unchanged |

### Data layer (`apps/mobile/src/api/training.ts`)

```ts
TRAINING_KEYS.workoutInsights = (id: string) => ["workout-insights", id] as const;
TRAINING_KEYS.historyInsights = (id: string) => ["history-insights", id] as const;

export function useWorkoutInsights(loggedSessionId: string, opts: { enabled?: boolean } = {}) {
  // GET /workouts/{id} (no CORE) — staleTime 0, refetchOnMount "always",
  // refetchOnWindowFocus "always" (AppState-driven focusManager, 21d),
  // retry: the client default (temporary errors twice).
}
export function useHistoryInsights(loggedSessionId: string) { /* GET /history/{id}, same options */ }
```

- `markTrainingStale`, `invalidateTraining`, and `refreshWorkout` also invalidate the `["workout-insights"]` and `["history-insights"]` prefixes (refetch when shown). `useEditSet` and `useEditPlannedSets` invalidate them too. `useLogSet` does **not** invalidate insights (RD-5). `applyConfirmedCompletion` cancels `workout-insights` for the finished workout.
- `useRefetchWhenFocused(["workout-insights", id])` on W1 so returning from E1/X1/History refetches when stale.
- `clearAccountQueries` already removes everything but app-config on sign-out.

### Pure models (no I/O, unit-tested; `apps/mobile/src/workout/insight-model.ts`)

```ts
export type InsightView =
  | { kind: "loading" } | { kind: "error" } | { kind: "none" }
  | { kind: "locked" }
  | { kind: "insufficient"; note: string }
  | { kind: "call"; chip: { label: "Progress" | "Deload" | "Hold — trend flat"; tone: "progress" | "deload" } | null;
      strong: boolean; action: string; evidence: string; spokenWord: string };

export function insightFor(
  query: { status: "pending" | "error" | "success"; stale: boolean },
  call: OccurrenceProgressionDto | undefined,
): InsightView;

export function callWord(rec: RecommendationDto, tag: ProgressionTag | null): string; // Progress | Hold | Hold — trend flat | Reassess | Deload | Deload week
export function chipFor(tag: ProgressionTag | null): InsightChip | null;            // hold → null
```

Rules: `error` wins over a cached answer (RD-6); `locked` before `call`; an unknown future `recommendation.kind` renders its server action/evidence with the word "Call" (forward compatible, never dropped). The model reads only server fields.

`apps/mobile/src/workout/summary-model.ts`: joins the record's exercises with the summary's per-exercise calls by `performedExerciseId` in record order, keeping record exercises with no call (skipped, deload week, Free). Never adds an exercise that is not in the record.

### Components

| Component | Contract |
| --- | --- |
| `InsightBlock` | `{ view: InsightView; expanded: boolean; onToggle(): void; onRetry(): void }`. A `Pressable` (role button, `accessibilityState.expanded`) only for `call`. No `Keyboard`, focus, or scroll calls. |
| `ProgressChip` | `{ tag }` → `Chip` with tone `progress`/`deload`; null for hold/none. `Chip` gains tone `deload` (theme `colors.deload`). |
| `ProNote` | `{ surface: "exercise-card" \| "summary"; message }`, session-scoped dismissal in a module store (`pro-note-store.ts`), 44×44 dismiss with label "Dismiss: <message>". No link. |
| `DeloadWeekBanner` | no props; text "Deload week · 90% load across the split". Not an alert role. |
| `SummaryScreen` | rewritten per design §6 using `useLoggedWorkout` (core) + `useHistoryInsights`. |

Copy is the web's: card note "Progress, hold, and deload calls for this lift are part of Pro."; summary note "What to do next time on each lift, and why, is part of Pro."; summary deload line "Deload week — recovery, not a verdict."; banner "Deload week · 90% load across the split". The "90%" comes from `SCHEDULED_DELOAD_FACTOR` (shared), not a literal.

### Interaction details

- The block's expanded flags live in `WorkoutScreen` state keyed by `loggedExerciseId` and are passed to the card, so they survive Previous/Next.
- The card's weight box offer is unchanged (`cardOffer`: trusted working weight or "same as set N"); nothing reads `suggestion` for input.

### Client scope and platform impact

Mobile only. Shared logic: unchanged recommendation builder and `insufficientNote()`. API: one additive field. Web UI: none. Mobile UI: W1, S1, T1.

### User guidance

None in 21g (RD-14).

## 8. Data model

No schema change, no migration, no new table, no stored derived value.

| Field | Stored? | Computed from |
| --- | --- | --- |
| `tag`, `recommendation`, `suggestion`, `rirEffect` | no | logged sets of the comparable segment, plan snapshot, mesocycle week (engine) |
| `insufficientNote` | no | engine `insufficient` evidence |
| `scheduledDeloadWeek` | no | mesocycle start, `deloadEveryWeeks`, the workout's scheduled date |
| Pro note dismissal | no (process memory only) | — |

## 9. Authorization and access control

- Every read is `mobileRoute`: token → account (never from input) → scoped reads → gated readers. Another account's id is 404.
- Pro gate: `getWorkoutView` and `readLoggedWorkout` resolve the entitlement once per request and call `gateOccurrence` / `gateSessionSummary`. A Free account's JSON contains no tag, recommendation, suggestion, or rirEffect.
- `insufficientNote` is returned to Free by design (it is the lifter's own data count, same as `gateHistory`); it never reveals a call.
- Entitlement is resolved per request, so a revoked comp, lapsed trial, or canceled subscription is enforced on the next read with no client involvement.
- Dev tooling (`dev:test-account`) acts only on `overload-dev`, only on reserved test-domain emails, refuses Production with no override (unchanged guards).

## 10. Validation rules

No new inputs. `dev:test-account` arguments: `--profile` must be a known profile; `--access` must be `pro` or `free`; `--access` and `--profile` are mutually exclusive; both require `--email` and `--confirm-ref`.

## 11. Development-only test accounts

Extends the 21f tool (`apps/web/scripts/dev-test-account`, `apps/web/scripts/demo/fixture.ts` and `seed.ts`). Every account is still written by the application's own write modules in one transaction (createMesocycle, addSession, startOrResumeWorkout, logSet, completeWorkout); no call, e1RM, or entitlement value is fabricated.

**Fixture extensions** (pure data in `fixture.ts`):
- `FixturePerf` gains an optional third element: RIR per set (`number | null`), written through `logSet`'s `rir`.
- A variant may override the block plan (`blocks`: start offset, weeks trained, `deloadEveryWeeks`) and specific exercises' performances.
- A variant may leave today's workout started with sets logged (`inProgressToday`), through `startOrResumeWorkout` + `logSet` on the anchor date.

**Profiles** (anchor = the account's today in America/Chicago; today's workout is Upper A — Barbell Bench Press 3×6–8, Standing Military Press 3×6–8, Incline Dumbbell Press 3×8–12, Wide-Grip Lat Pulldown 3×10–12 — unless noted). "Expected" is asserted through the gated card reader in the integration test and printed by the command's engine check.

| Profile | Account plan | History / setup (facts only) | Expected on today's card (engine) |
| --- | --- | --- | --- |
| `progress` | Pro | demo `standard` | Bench: Progress, "Try 185 lb today (+5 lb)" |
| `hold` | Pro | Bench's last Upper A 180 × 8, 7, 7 | Bench: Hold, "Stay at 180 lb today", "Last time: 8, 7, 7 of 6–8" |
| `reactive-deload` | Pro | Bench's last two Upper A 180 × 7, 6, 5 and 180 × 6, 5, 5 | Bench: Deload, "Lower the weight today" |
| `rir` | Pro | Bench last 180 × 8, 8, 8 at RIR 2, 1, 0; Military Press 110 × 8, 8, 8 three times, last at RIR 2, 2, 3; Incline 60 × 12, 12, 12 three times, last at RIR 2, 2, (none) | Bench: Hold (held at limit, "…at your limit last time (0 RIR)"); Military Press: Progress (released stall, "…every set last time had 2+ in reserve"); Incline: Hold — trend flat (one RIR missing, no release) |
| `scheduled-deload` | Pro | active block `deloadEveryWeeks` 4: today is week 4 | banner; Bench "Deload week: 160 lb (90%)"; Military Press (reactive-deload history) shows the deload-week line, no Deload chip |
| `post-deload` | Pro | active block `deloadEveryWeeks` 3: week 3 was a lighter deload week; today is week 4 | no banner; Bench: Progress again (deload week excluded from the run) |
| `insufficient` | Pro | active block started 7 days ago: one Upper A of the new block | every lift: "Not enough history yet…: 1 of 2 complete sessions."; earlier block shows only as reference |
| `gym` | Pro | 21f `gym` (Upper B today; machines at Northside, Riverside; empty Harbor Barbell) | Leverage Chest Press: Hold at Northside; not enough history at Riverside (1 of 2) and Harbor (0 of 2) |
| `edit` | Pro | Bench last Upper A 180 × 8, 8, 7 at RIR 1, 1, 0 | Bench: Hold ("8, 8, 7 of 6–8"); correcting set 3 to 8 reps → Hold at the limit (0 RIR); then RIR 0 → 1 → Progress "Try 185 lb today" |
| `free` | Free (no comp, no trial) | demo `standard` | every lift with history: locked (Pro note); no Pro field in the JSON |
| `entitlement` | Pro, switchable | demo `standard` | as `progress`; after `--access free`: locked; after `--access pro`: the call again |
| `summary` | Pro | demo `standard` | Bench Progress, Military Press Deload, Incline Hold, Pulldown Hold (Northside) — finish with a swap and a skip |
| `recovery` | Pro | demo `standard` + today's Upper A started with Bench sets 1–2 logged (180 × 8, 8) | Resume opens Bench set 3; call Progress |
| `isolation-a` | Pro | demo `standard` | as `progress` |
| `isolation-b` | Pro | 21f `bodyweight` (Pullups, Crunches) | different exercises and gyms names from A's sets |

The exact action strings are asserted by `dev-test-account-profiles.int.test.ts`; where this table and the test disagree, the test (the engine) wins and this table is corrected.

**Access switch.** `npm run dev:test-account -- --email <e> --access free|pro --confirm-ref vdxrmfadikwzodjljbdi [--execute]`: `free` sets `revokedAt` on the account's active comp entitlement (the same column the admin revoke sets; operator action, `revokedByUserId` null); `pro` grants a new comp (reason `tester`). Refuses accounts with a Stripe billing row or an active trial (so the switch is the only access source), non-test emails, and every project but `overload-dev`. Prints the resolved plan before and after.

**Engine check.** After seeding (and after `--access`), the command reads today's planned calls through `getTodayView` (the gated reader the mobile Today uses, without core) and prints one line per lift: call word and action, "not enough history", "locked", or "waits for the gym" (machines on the planned list). For profiles with an expectation it prints `ENGINE CHECK PASSED` or `ENGINE CHECK MISMATCH` with the difference (exit code 2, nothing rolled back — the data is real; use a fresh email).

## 12. Testing strategy

### API — `apps/web/tests/integration/mobile-insights.int.test.ts` (new; route handlers, real DB)

```text
GIVEN a Pro account with a progress-shaped history WHEN GET /workouts/{id} (no core)
THEN the card's call equals getOccurrenceProgression's (web runner) and recommendation.kind is "progress" with suggestion +5
GIVEN the same account WHEN ?fields=core THEN progression is [] (backward compatibility)
GIVEN one finished workout in scope WHEN read THEN recommendation null, insufficientNote "Not enough history yet: 1 of 2 complete sessions."
GIVEN a machine at gym A (2 sessions) and gym B (1) WHEN the workout is at A, then changed to B THEN A: a call; B: insufficientNote "…at <B>…"
GIVEN a deload week WHEN read THEN workout.scheduledDeloadWeek, tag null, recommendation.kind "scheduled_deload", insufficientNote null; a reactive-deload history shows no Deload tag
GIVEN a Free account WHEN read THEN no tag/recommendation/suggestion/rirEffect anywhere in the JSON, locked "progression_insights", insufficientNote kept
GIVEN a Pro account WHEN its comp is revoked THEN the next read is locked (Pro → Free), and re-granting restores the call
GIVEN a hold WHEN a past set is corrected through PATCH /sets/{id} THEN the next read returns the new call (reps edit, then RIR edit)
GIVEN a swap WHEN read THEN the call is about the performed exercise
GIVEN account B WHEN it reads A's workout or history without core THEN 404 and no A data
GIVEN a completed workout WHEN GET /history/{id} THEN summary calls are "next time" and goals rows present; Free: locked summary, record intact
```

### Fixture engine check — `apps/web/tests/integration/dev-test-account-profiles.int.test.ts` (new)

For each new profile: seed into a fresh account on embedded Postgres with the anchor as today, start today's workout (the recovery profile resumes it), and assert each expected call through `getOccurrenceProgression` and the `free`/`entitlement` gating; assert no LoggedSet was written outside `logSet` (counts match `expectedCounts`), and the seed stays under the 2,500-statement budget for the largest profile.

### Static guards and contracts

Existing `progression-gate-guards`, mobile-route registry, and workspace-boundary tests stay green. Add a mobile guard test: no file under `apps/mobile/src` imports `@overload/shared/progression/engine`, `e1rm`, `recurring`, or `deload` (the phone never runs the engine).

### Web unit

`gateOccurrence` keeps `insufficientNote` on Free and never sets `locked` for it.

### Mobile (`apps/mobile/tests`)

- `insight-model.test.ts`: every state row of §5; error beats cached call; unknown kind; hold has no chip; spoken words.
- `insights.test.tsx` (screen): Pro card shows chip + action, toggle shows evidence, no `Keyboard.dismiss`/focus on load or toggle (spy), weight box keeps the trusted offer not the suggestion; Free shows the note with no link, dismiss hides it on every card; insight failure shows retry while Log set still saves; gym change / swap / edit invalidate and show loading then the new call; deload banner; logging a set does not refetch insights.
- `summary.test.tsx`: Pro calls, Free note, swapped/skipped/extra/RIR/short-of-plan lines from the record, goals rows, insight failure keeps the record, deload line.
- Regression: the existing keyboard, focus, InputAccessoryView, completion-sync, and set-correction suites stay green unchanged.

### Unverified by a run (owner checks)

Every on-device check (runbook §6): appearance, Dynamic Type, VoiceOver, keyboard feel, network loss, OTA.

## 13. Acceptance criteria

- [ ] A Pro account's card shows the same call, chip, action, and evidence as the web for the same workout and gym (Progress, Hold, Hold — trend flat, Reassess, Deload, Deload week).
- [ ] A suggested weight appears only inside the server's action line; the weight box offer is unchanged.
- [ ] Not enough history shows the server's note; nothing is invented.
- [ ] Evidence is one tap away, never moves focus or dismisses the keyboard.
- [ ] A failed insight read shows a retry line and never a previous call; logging continues.
- [ ] Deload week: banner on W1 and Today for every plan; no reactive chip; the card says the deload-week line.
- [ ] The summary lists the saved sets exactly as History (swaps, skips, extra sets, RIR, short of plan), the Pro calls, goals moved, and the Free note.
- [ ] A Free account's API responses contain no Pro value; its card and summary show the Pro note with no link; logging and History unchanged.
- [ ] A revoked Pro shows locked on the next read (screen focus, foreground, or reopen).
- [ ] A corrected set or RIR, a gym change, and a swap each produce the new call on the next read.
- [ ] Another account's workout or history is 404 on the full reads.
- [ ] 21e/21f behavior unchanged; existing suites green; no native fingerprint change.
- [ ] Each dev profile's engine check passes.

## 14. Explicit non-goals

- ❌ A mobile progression rule, formula, threshold, or stored call. **Permanent.**
- ❌ A purchase, pricing, or upgrade link in the app. **Until the store billing path is decided.**
- ❌ Today's planned-list calls on the phone. **Deferred** (RD-9).
- ❌ Exercise history, charts, goal screens. **Deferred** to 21i.
- ❌ Native tour step. **Deferred** to 21k.

## Resolved Decisions

| # | Decision | Rationale | Authority |
| --- | --- | --- | --- |
| RD-1 | No new endpoint: the insight reads are the existing gated `GET /workouts/{id}` and `GET /history/{id}` without `?fields=core`. | The contract already carries every call field and `locked`; reusing it gives web/phone parity by construction and adds no attack surface. | Q9, Q14; 21e RD-28 (`CORE_FIELDS_QUERY` exists precisely to be removed "when a screen starts rendering"); mobile-roadmap "never call an ungated builder" |
| RD-2 | Two queries per surface (core + insights) with separate keys. | A slow, failed, or locked call must not delay or block logging, and must never repaint the card's inputs. | pitch §5.3, §5.10; 21e RD-28 perf |
| RD-3 | Add `insufficientNote` (optional, additive) to `OccurrenceProgressionDto`, built by the existing `insufficientNote()`. Kept on Free. | The phone may not infer "insufficient" from nulls (Free nulls everything; a production mismatch also nulls). The server already has the exact sentence for the exercise page. | Q12; RD-C; `gateHistory` precedent (Free keeps the note) |
| RD-4 | Hold renders the quiet action line with no chip, exactly as the web; a spoken call word ("Hold") is given to VoiceOver only. | The web's hold is the PRD's unflagged state plus the explainable line; inventing a visible "Hold" badge would be a new classification. | Q2; design principle "Hold is a non-event"; pitch §5.1 |
| RD-5 | Insights refetch on mount, focus, foreground, and after gym change, swap, skip/undo, set or planned-set correction; NOT after logging a set. | Today's call is judged on finished workouts; the in-progress set is excluded by the engine (`complete`/`finished` gates), so refetching would cost ~1 s per set for nothing. | Q3; engine `qualifyingSequence`, `shortFailureSinceLastCounted` |
| RD-6 | An insight read that failed shows the retry line even if an older answer is cached. | "A failed evidence request does not display a stale conclusion as current." | pitch §5.3; Q11 |
| RD-7 | Evidence is an inline disclosure on the card, collapsed by default; expanded on the summary. | A sheet would dismiss the keyboard; the card must stay compact; the summary is a reading surface. | Q5; overload-mobile-ui; pitch §5.3 |
| RD-8 | The suggested weight stays inside the action sentence; no "use this weight" control; the weight box keeps the 21e/PAI offer rules. | Recommendations never act (RD-B); the web has no such control. | Q4; RD-B; PAI RD-9 |
| RD-9 | Today keeps `?fields=core`: no planned-list calls in 21g; Today adds only the deload-week banner and "View summary". | The roadmap names the card, banner, summary, and Pro note; Today's full read was the 21e slowness. The call is on the card where the lift is performed. | mobile-roadmap 21g; 21e RD-28 |
| RD-10 | Summary = record facts (as History) + gated next-time calls + goals moved (percent before → after); no chart. | PRD: "a progression chart or percentage-toward-goal view"; the one native chart is 21i's. Goal rows are already returned. | Q7, Q8; PRD §Guided logging; roadmap 21i |
| RD-11 | Deload-week banner shows for Free and Pro, copy from the web banner; the summary uses the web's "Deload week — recovery, not a verdict." | Scheduled deload is planned recovery the lifter wrote, needed for correct logging; the web shows it to Free. `gateOccurrence` already treats the bare deload line as non-Pro. | Q6, Q13; pitch §7 |
| RD-12 | Pro note copy = the web's per surface, no link, dismissible for the app session (in memory). | No purchase link in the app; the phone has no preference store and adding one is out of scope. | Q10; CLAUDE.md mobile rules; web `UpgradeNote` copy |
| RD-13 | Entitlement is never cached on the phone: each insight read reflects the server's per-request resolution; a locked answer replaces a call immediately. | Server is the capability authority. | Q11; CLAUDE.md plans rules |
| RD-14 | No tour step or release note in 21g. | Native tour is 21k; What's New isn't in the app until 21j; the web notes already cover calls. | CLAUDE.md user guidance; roadmap |
| RD-15 | Dev profiles extend the demo seed (RIR per set, per-variant blocks, in-progress today) and are verified by an integration test and the command's engine check. | Real history through the real write path; "a fixture name is not proof". | Q15; 21f RD-26 |
| RD-16 | `--access free|pro` toggles a disposable dev account's comp entitlement (revokedAt / new comp), dev project and test emails only; Free profiles are provisioned without comp. | The pitch requires a controlled Pro→Free fixture; comp is Overload's own entitlement, never Stripe; the provisioning tool already writes comp rows directly. | pitch scenario 11; CLAUDE.md "comp … never touches Stripe" |
| RD-17 | Calls on the History record (H2) stay absent. | The web's History detail has no calls; parity. | Q7 |
| RD-18 | A card marked Not done or Unavailable shows no call; the summary shows no call for an exercise with no sets. | The server already omits them from the summary ("a call about a lift the lifter skipped would read as a verdict on today"). | `computeSessionProgressionSummary` |
| RD-19 | `Chip` gains a `deload` tone using the existing `colors.deload` token; `tokens.ts` is not edited. | Status color exists; editing tokens.ts would change the native fingerprint. | 21e fingerprint trap |
| RD-20 | Mobile-only pitch; the web preview step is skipped and recorded. | Canonical mobile exception. | mobile-roadmap "How each slice runs" (4) |

## Open Questions

None blocking. Owner checks that a run cannot do are listed in the runbook.

## 15. Future considerations

- Today's planned-list calls can reuse `useInsights`-style reads of `GET /today` if the owner wants them (perf permitting).
- 21i's exercise history can link from the evidence line (`historyHref` is already in the DTO).
- When a preference store exists (21j), the Pro note dismissal can persist.
