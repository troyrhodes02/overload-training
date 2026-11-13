---
version: 1.0.0
status: approved
author: Claude Code (unattended pipeline run, 2026-11-12)
last_updated: 2026-11-12
pitch_reference: docs/pitches/mvp-5b-mobile-app/21b-shared-package-contracts/pitch.md
design_reference: docs/pitches/mvp-5b-mobile-app/21b-shared-package-contracts/design.md
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
linear_issue: Pitch 21b — Shared Package & Contracts (milestone)
---

# Shared Package & Contracts — Technical Specification

> UI design step: **Skipped — no UI surface in this pitch.** No `preview.tsx` exists or is required.
>
> Paths: web paths are relative to `apps/web/` (`src/lib/…`, `tests/…`); shared paths are relative to `packages/shared/` (`src/…`). A shared module `src/<domain>/<name>.ts` is imported as `@overload/shared/<domain>/<name>`.

## 1. Summary

21b turns the empty, fenced `@overload/shared` package from 21a into the single home of Overload's portable rules and contracts, and makes the web consume it. The abstraction is **move, don't modify**: each pure module is moved with `git mv` so its body is unchanged, every import of it in the web is rewritten to `@overload/shared/<domain>/<name>`, and where a file mixes pure and web code only the pure part moves. The web's existing tests stay where they are and keep asserting the same behavior through the new import paths.

On top of the moved modules the package gains four things that did not exist as one source: an enum registry (Prisma enum values as `as const` tuples, all checked against `Prisma.$Enums`), the mobile API contracts (the response and request types for the endpoints in `mobile-audit.md` §2, the error envelope, app config, and `me`, with dates as ISO strings), the design tokens (checked against `globals.css`), and one weight formatter and one reps rule replacing the duplicates the audit found (D-13, D-14).

"Working" means: the web builds and behaves identically; every existing unit, integration, and end-to-end test passes unchanged in assertion; the package type-checks with no DOM or Node types and passes the workspace boundary check; the web's DTO builders type-check against the shared contracts; and no route, migration, entitlement path, or Production change exists.

## 2. Problem

- The app cannot yet give the iPhone app the same rules the web uses: the weight rule, the rep-target wording, "today" in the account's time zone, the gym-variable decision, the taxonomy labels. They live in `apps/web/src/lib`, behind the `@/` alias.
- The response shapes the mobile API will serve sit inside `server-only` query modules, which a React Native bundle cannot import (audit §4, "DTO types (about 50)").
- Enum values are mirrored by hand in seven places; four mirrors had no parity test before OVE-140 and the type mirrors are scattered (audit D-6).
- The weight and reps limits are written in more than one place, the client card repeats the server's reps rule without its upper bound, and four weight formatters differ in rounding code (audit D-13, D-14).
- There is no shared error envelope or app-config shape for 21c to implement against.

21c (Mobile API & Auth Foundation) is blocked on all of these.

## 3. Scope and non-scope

### In scope

1. Wiring: the web depends on `@overload/shared`; Next transpiles it; Jest, TypeScript (web and Jest configs), ESLint, and `tsx` resolve its subpath exports.
2. Moving the pure modules listed in §5.2, unchanged in behavior.
3. Splitting the mixed modules listed in §5.3: only the pure part moves.
4. Consolidating the duplicated weight/reps limits and weight formatters (§5.4).
5. The enum registry and the extended parity test (§5.5).
6. The mobile contracts (§5.6, §13).
7. Design tokens and the CSS parity test (§5.7).
8. Tour and release-note content in shared; web rendering, anchors, and placement stay in the web (§5.3).
9. Guard updates: every source-scanning guard that pinned a moved file now scans the shared package too (§14.3).
10. Workspace boundary extension: the shared package may read `process.env.NODE_ENV` only (§9).

### Out of scope

- **21c:** `/api/mobile/v1` route handlers, bearer-token verification, the proxy exemption, error-to-status mapping, the app-config handler, the version gate, the idempotency table, rate limiting, `getTodayView`/`getWorkoutView`, and the one goal-reconcile function.
- **21d and later:** the Expo app, Metro configuration, native components and navigation, Hermes `Intl` verification (audit D-19), and the native tour.
- Request-body schema libraries (zod) for the API. 21c decides whether to wrap the shared parsers; the audit's rule "never keep two sets of rules" binds it.
- Moving `lib/personalization/greeting.ts` (the audit recommends building the greeting on the server and returning it from `/today`; 21c).
- Plan-import pure parts (zod schemas, matcher): plan import is web-only for the beta.
- `lib/gyms/baselines.ts`, `lib/logging/logged-sets.ts`, `lib/goals/goals.ts`, `lib/data/*`, `lib/entitlements/resolve.ts`, `lib/entitlements/gate.ts`: server-only or enforcement (audit "Looks shareable but isn't").
- Any change to Prisma, the schema, migrations, environment variables, Vercel settings, or Production.

## 4. Core concepts

| Concept | Description |
| --- | --- |
| **Shared module** | A file under `packages/shared/src`. Pure: imports only other shared modules; no runtime dependency; no DOM, Node, framework, Prisma, Supabase, or `server-only`; reads no environment variable except `process.env.NODE_ENV`. Type-checks under `lib: ["es2022"]`, `types: []`. |
| **Moved module** | A web module moved whole with `git mv`. Its body is unchanged except import specifiers. Its web path no longer exists; every web consumer imports the shared path. |
| **Split module** | A web module whose pure part moved and whose web part (a `FormData` adapter, a `process.env` default, a web URL, DOM placement, a server error converter, a server kill switch) stays in the web. The web file may re-export the shared part (a thin compatibility re-export) so existing imports keep working; it never re-implements it. |
| **Enum registry** | `src/enums.ts`: one `as const` tuple per Prisma enum that crosses the client boundary, plus its union type. Prisma stays the authority; a web test checks every tuple against `Prisma.$Enums`. |
| **Contract** | A type under `src/contracts/` describing a mobile API request or response body. JSON-safe: strings, numbers, booleans, `null`, arrays, and plain objects only. Types only; no runtime code except the error-code tuple. |
| **Wire date conventions** | `IsoDate` (`"YYYY-MM-DD"`, a calendar date in the account's time zone) and `IsoDateTime` (an ISO-8601 instant with offset, `Date.prototype.toISOString()` form). Both are `string` aliases that document intent. A field is one or the other, never both. |
| **Missing vs zero** | `null` means not recorded or none (bodyweight weight, unrecorded RIR, no performance yet, no gym). Optional (`?`) is used only where the web DTO already omits the key. Zero is only a real zero. |
| **Locked result** | A gated Pro DTO keeps the shape the web's gate produces: `locked` is the capability that withheld it (`Capability | null`), and the Pro fields are `null` when locked. Contracts never describe an unlocked shape the server did not choose. |
| **Design tokens** | Plain values in `src/design/tokens.ts`. The web's `globals.css` stays the styling source; a test checks it matches the tokens. |

## 5. Module plan

### 5.1 Package wiring

| File | Change |
| --- | --- |
| `packages/shared/package.json` | `exports`: `"."` → `./src/index.ts`, `"./*"` → `./src/*.ts`. Still no `dependencies`; `type: module` unchanged. |
| `packages/shared/src/index.ts` | Stays an empty module with a comment: consumers import subpaths (no barrel, so module names that repeat across domains, such as two `addDays`, cannot collide). |
| `packages/shared/src/env.d.ts` | `declare const process: { readonly env: { readonly NODE_ENV?: string } };` — the one ambient global (RD-7). Not referenced by web code, so it never meets `@types/node`. |
| `packages/shared/README.md` | Status → filled by 21b; the module map; the `NODE_ENV` exception; "tests live in the web unit project". |
| `apps/web/package.json` | `dependencies["@overload/shared"] = "*"` (npm workspace link). |
| `apps/web/next.config.ts` | `transpilePackages: ["@overload/shared"]`. `turbopack.root` already covers `packages/`. |
| `apps/web/jest.config.js`, `jest.integration.config.js` | `moduleNameMapper["^@overload/shared/(.*)$"] = "<rootDir>/../../packages/shared/src/$1"`. |
| `apps/web/tsconfig.jest.json` | `paths` for `@/*` and `@overload/shared/*` (Node10 resolution cannot read `exports`). |
| `package-lock.json` | The workspace link entry. |

The web's own `tsconfig.json` (bundler resolution), ESLint, and `tsx` resolve `exports` without change (spike, §14.6).

### 5.2 Moved modules (whole, `git mv`)

Shared path = web path minus `src/lib/`.

| Domain | Modules |
| --- | --- |
| progression | `e1rm`, `config`, `deload`, `engine`, `types`, `history`, `history-types`, `recommendation` |
| logging | `rir`, `set-entry`, `schedule`, `weight` |
| plan | `rep-target`, `calendar`, `presets`, `weekday-names`, `validation`, `readiness` |
| cardio | `validation`, `schedule` |
| exercises | `taxonomy`, `gym-variable`, `loading-mode` |
| goals | `progress`, `dashboard` |
| accounts | `validation`, `auth-errors` |
| feedback | `validation`, `attachment-validation` |
| release-notes | `types`, `entries`, `catalog` |
| appearance | `appearance`, `choices` |
| entitlements | `types` |

`isGymVariable` stays the single decider; it simply lives at `@overload/shared/exercises/gym-variable`. `estimateOneRepMax` stays the single e1RM formula at `@overload/shared/progression/e1rm`.

### 5.3 Split modules

| Web module | Moves to shared | Stays in the web |
| --- | --- | --- |
| `lib/actions/result.ts` | `ErrorCode`, `ERROR_CODES`, `ActionError`, `ActionResult` → `src/contracts/errors.ts`; `isUuid` → `src/ids.ts` | `DomainError`, `toActionResult` (logs on the server), `isUniqueViolation` (Prisma error shape). Re-exports the shared names so its 87 importers are unchanged. |
| `lib/billing/config.ts` | `Plan`, `Capability`, `ALL_CAPABILITIES`, `PLAN_CAPABILITIES`, `TRIAL_DURATION_DAYS`, `GRACE_PERIOD_DAYS` → `src/billing/plans.ts` | `isCheckoutEnabled` (server env), `UPGRADE_HREF` (web URL), `PRICE_DISPLAY` and `BLIZZY` (web-only purchase surfaces), `MS_PER_DAY` and the instant `addDays` (entitlement resolution). Re-exports the shared names. |
| `lib/progression/history-format.ts` | the formatters → `src/progression/history-format.ts` | `exerciseHistoryHref` (a web URL) → `lib/progression/history-href.ts` |
| `lib/exercises/validation.ts` | the parsers → `src/exercises/validation.ts` | `customExerciseInputFromFormData` → `lib/exercises/form-data.ts` |
| `lib/goals/validation.ts` | the parsers → `src/goals/validation.ts` | `goalInputFromFormData` → `lib/goals/form-data.ts` |
| `lib/gyms/validation.ts` | the parsers → `src/gyms/validation.ts` | `gymInputFromFormData` → `lib/gyms/form-data.ts` |
| `lib/exercises/images.ts` | `EXERCISE_IMAGE_BUCKET`, `buildExerciseImageUrl(imageRef, supabaseUrl)` → `src/exercises/images.ts` | `exerciseImageUrl(imageRef, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL)`, delegating to the shared builder. |
| `lib/tour/steps.ts` | `TOUR_CONTENT` (each step's `id`, `title`, `body`, in journey order) → `src/tour/content.ts` | `TOUR_ANCHORS`, `tourAnchor`, the per-step route, layout, targets (with any target-specific body), and `TOUR_STEPS` built from `TOUR_CONTENT` plus that placement. `lib/tour/engine.ts` (layout and pixel placement) stays whole. |
| `lib/appearance/appearance.ts` (after move) | — | `THEME_COLORS` reads `tokens.colors.light.background` / `.dark.background` (same values). |

### 5.4 Consolidated duplicates

| Duplicate (audit) | Resolution | Behavior proof |
| --- | --- | --- |
| Reps rule (D-13): `reps > 1000` inline in `logged-sets.ts`; the card's `reps <= 0` check without the bound; `GOAL_REPS_MAX = 1000` | New `src/logging/reps.ts`: `LOGGED_REPS_MAX = 1000`, `REPS_MESSAGES.required = "Enter reps above 0."`, `checkLoggedReps(value)`. `logSet`/`editLoggedSet` validation and the card call it; the edit dialog reads the shared message (RD-13); `GOAL_REPS_MAX = LOGGED_REPS_MAX` (goal message unchanged). | Same accepted set (integers 1–1000). The card shows the same message on the reps field that the server refusal already put there (exercise-card maps `details.reps` to the reps field). |
| Weight limit (D-13) | Already one rule (`checkWeightLbs`, OVE-135); moves with `logging/weight`. Plan `REPS_MAX = 100` is a different rule (planned rep range), not a duplicate. | Unchanged code. |
| Weight formatters (D-14): `set-entry.formatWeight` (`String(x)`), `history-format.formatLoad` and `recommendation.lbs` (`String(Math.round(x*100)/100)`), `goals/progress.formatLbs` (`toFixed(2)`) | One implementation, `formatWeightLbs` in `src/logging/weight.ts`, using the `Math.round(x*100)/100` form (the one already used by the recommendation and history). The old exported names remain as aliases of it; the private ones call it. | All four produce identical strings for every value with at most two decimals, which is every stored weight (`Decimal(6,2)`, refused otherwise since OVE-135) and every engine load (whole or half pounds). An exhaustive test compares frozen copies of the four legacy bodies with the new one for every cent from 0.01 to 9,999.99 and for the engine's computed loads. |
| Two `addDays` (D-15) | Not consolidated: `plan/calendar.addDays(iso, n)` is calendar-date math and moves to shared; `billing/config.addDays(Date, n)` is instant math used only by server entitlement resolution and stays in the web. Different types, different domains. | — |

### 5.5 Enum registry

`src/enums.ts` exports, for each enum below, `<NAME>_VALUES` (or re-exports the existing domain tuple) and its union type:

| Prisma enum | Shared tuple | Existing mirror it replaces or anchors |
| --- | --- | --- |
| `MesocycleStatus` | `MESOCYCLE_STATUSES` | `MesocycleStatusValue` (`plan/queries.ts`), `LockedMesocycle["status"]` (`data/locks.ts`) become this union |
| `SplitType` | `SPLIT_TYPES` (from `plan/presets`) | — |
| `GoalStatus` | `GOAL_STATUSES` | — |
| `GoalArchiveReason` | `GOAL_ARCHIVE_REASONS` | — |
| `LoggedSessionStatus` | `LOGGED_SESSION_STATUSES` | `WorkoutDto.status` (was the Prisma type), schedule types |
| `MissedDayOutcome` | `MISSED_DAY_OUTCOMES` | schedule types |
| `MuscleGroup` | `MUSCLE_GROUPS` (from `exercises/taxonomy`) | — |
| `Equipment` | `EQUIPMENT` (from `exercises/taxonomy`) | — |
| `Appearance` | `APPEARANCES` (from `appearance/appearance`) | — |
| `Plan` | `PLANS` | `Plan` in `billing/plans` becomes this union |
| `TourOutcome` | `TOUR_OUTCOMES` | — |
| `AccountStatus` | `ACCOUNT_STATUSES` | — |
| `FeedbackCategory` | `FEEDBACK_CATEGORIES` (from `feedback/validation`) | — |

Web-only enums, deliberately not shared: `SignupCampaign`, `EntitlementSource`, `CompReason`, `SubscriptionStatus`, `BillingInterval`, `AdminAuditAction`, `AuthThrottleAction`, `ImportStatus`, `ImportSourceKind`. The parity test lists them, and fails when Prisma gains an enum that is in neither list, so every new enum is classified.

`DashboardKind` is not a Prisma enum; it becomes `DashboardDto["kind"]` from the contracts, so the goals rule and the DTO cannot drift.

### 5.6 Contracts (`src/contracts/`)

| File | Contents |
| --- | --- |
| `wire.ts` | `IsoDate`, `IsoDateTime`, `JsonValue`, and the compile-time `IsJsonSafe<T>` check used by the contract tests (unions are checked member by member). |
| `errors.ts` | `ERROR_CODES` tuple, `ErrorCode`, `ActionError`, `ActionResult<T>` (moved from `actions/result`), `API_ERROR_CODES` = the action codes plus `account_suspended` and `upgrade_required`, `ApiErrorCode`, `ApiError`, `ApiErrorBody = { error: ApiError }`. |
| `app-config.ts` | `AppConfigDto`: `minimumAppVersion`, `latestAppVersion`, `killSwitches: { planImportEnabled, maintenance }`, `signupMode: "public" | "closed"` (never the invite code). |
| `account.ts` | `EntitlementDto` (the wire form of `ResolvedEntitlement`: `capabilities: Capability[]`), `ProfileDto` (= `SettingsProfile`), `MeDto`, `MePlanDto` (read-only projection of the billing screen: no prices, no `canSubscribe`, no promo), `AccountInventoryDto`, `TourStateDto`, `TrialNoticeDto`. |
| `logging.ts` | `DashboardExercisePreview`, `MissedDayInfo`, `DashboardTodayDto`, `DashboardDto`, `ExerciseCardDto`, `PreviousPerformanceDto`, `WorkoutDto`, `SwapCandidate`, `SwapContextDto`, `WeekDayState`, `WeekDayDto`, `WeekScheduleDto`, `LoggedWorkoutDetailDto` (moved from `logging/queries.ts`). |
| `history.ts` | `LoggedHistoryDay`, `EarlierBlock`, `HistoryWeekView`, `HistoryWeekDto` (from `logging/history-week.ts`). |
| `plan.ts` | `MesocycleSummaryDto`, `SessionSummaryDto`, `PlannedExerciseDto`, `PlannedCardioDto`, `MesocycleWeekDto`, `MesocycleHomeDto`, `DayOccupancyDto`, `SessionDetailDto` (from `plan/queries.ts`). `CloneSetupDto` stays (plan builder is web-only). |
| `progression.ts` | `OccurrenceProgressionDto`, `SessionProgressionSummaryDto`, `PlannedProgressionDto` (gated; from `progression/queries.ts`); re-exports the gated history DTOs from `progression/history-types`. `ExerciseProgressionDto`, `PerformanceRow`, `ScopeDescription` stay server-side (ungated builders, audit F-T11). |
| `cardio.ts` | `CardioOccurrenceDto` (from `cardio/queries.ts`). |
| `exercises.ts` | `ExerciseListItemDto`, `ExerciseDetailDto`, `ExerciseList` (from `exercises/queries.ts`). |
| `goals.ts` | `GoalContextDto`, `GoalBestDto`, `ActiveGoalDto`, `GoalHistoryDto`, `GoalReachedDto`, `GoalDetailDto`, `SessionGoalRowDto`, `GoalFormContextDto`, `ExerciseGoalsDto` (from `goals/queries.ts`). |
| `gyms.ts` | `GymListItemDto` (from `gyms/queries.ts`). |
| `release-notes.ts` | `ReleaseNoteView` re-export; `ReleaseNotesDto`. |
| `requests.ts` | Request bodies for the audit's endpoints (§11): moved lib input types (`LogSetInput`, `EditLoggedSetInput`) plus the bodies that have no lib type yet. |
| `views.ts` | Composite responses 21c assembles from existing contracts: `TodayDto`, `WorkoutViewDto`, `LoggedWorkoutDetailViewDto`, `LoggedSetDto`. |

Each web query module imports its DTO types from the contracts and re-exports them (`export type { … }`), so existing importers are unchanged and the function's declared return type is the contract.

### 5.7 Design tokens (`src/design/tokens.ts`)

`colors.light` and `colors.dark` (the 21 semantic tokens of `globals.css`, including `progress` and `deload`), `radius` (`sm 4, md 6, lg 8, xl 12`), `font` (Inter; weights 400/500/600; sizes xs 12/16 … 2xl 24/32), `controlHeight` (`sm 36, md 40, lg 44`, `touchMin 44`), `overlay` (`rgba(0,0,0,0.5)`), `chart` (grid = border, axis = muted-foreground at 11, series = primary, secondary = muted-foreground). Values from audit §6, verified against the code.

## 6. States and lifecycle

None added. No stored state, no transition, no side effect.

## 7. UI integration

No screen changes. The two client islands that change imports (`components/logging/exercise-card.tsx`, the tour provider) keep their markup, copy, focus behavior, and messages. Client scope: shared package plus the web; the mobile impact is the foundation for 21c/21d (design doc §14). No tour step or release note (no visible change).

## 8. Data model

No change. No Prisma model, field, enum, index, migration, or RLS statement is added or altered. The enum registry reads Prisma's values in a test only.

## 9. Authorization and access control

Unchanged, and the package is built so it cannot change it:

- The shared package contains no data access, no Prisma, no Supabase, no session or token reading, no entitlement resolution, no capability check, and no gate. `computeEntitlement`, `resolveEntitlement`, `can`, `requireCapability`, the `gate*` functions, and the scoped layer stay in `apps/web`.
- Sharing the engine does not give the phone a path to Pro results: the engine runs on the server, behind the gated queries, for both clients (CLAUDE.md, mobile rules). The contracts carry `locked`.
- `PLAN_CAPABILITIES` in the package is a description of what a plan grants; the server still decides which plan an account has.
- Boundary enforcement (rule B3, 21a) is extended: shared sources may reference `process` only as `process.env.NODE_ENV` (new check B3e in `scripts/workspace-boundaries.mjs`, with a `node:test` case). The shared `tsconfig` (`lib: es2022`, `types: []`) already rejects DOM and Node globals at typecheck.

## 10. Storage model

Not touched. `buildExerciseImageUrl` only formats a public URL from a base URL the caller passes.

## 11. Server actions and API surface

No server action, route handler, or API is added or changed. The contracts describe the future `/api/mobile/v1` bodies; 21c implements them.

Contracted endpoints (from `mobile-audit.md` §2; request and response types in `src/contracts/`):

| Endpoint (21c+) | Response | Request |
| --- | --- | --- |
| `GET /app-config` | `AppConfigDto` | — |
| `GET /me` | `MeDto` | — |
| `GET /today` | `TodayDto` (`dashboard: DashboardDto`, planned progression, session summary, goals, greeting) | — |
| `GET /gyms`, `POST /gyms` | `GymListItemDto[]`, `GymListItemDto` | `CreateGymRequest` |
| `POST /workouts`, `GET /workouts/{id}` | `WorkoutViewDto` (`WorkoutDto` + `OccurrenceProgressionDto` per exercise) | `StartWorkoutRequest` |
| `PUT /logged-exercises/{id}/sets/{n}` | `LoggedSetDto` | `LogSetRequest` |
| `POST /workouts/{id}/complete` | `WorkoutDto` | — |
| `GET /history?week=`, `GET /history/{id}` | `HistoryWeekDto`, `LoggedWorkoutDetailViewDto` | — |
| `PUT /workouts/{id}/gym` | `WorkoutDto` | `ChangeGymRequest` |
| `GET /logged-exercises/{id}/swap-candidates` | `SwapContextDto` | — |
| `PUT /logged-exercises/{id}/exercise`, `/skipped`, `PATCH …/planned-sets` | `ExerciseCardDto` | `SwapExerciseRequest`, `SetSkippedRequest`, `EditPlannedSetsRequest` |
| `PATCH /sets/{id}` | `LoggedSetDto` | `EditLoggedSetRequest` |
| `PUT /mesocycles/{id}/missed-days/{date}` | `MissedDayResolutionDto` | `ResolveMissedDayRequest` |
| `PUT /mesocycles/{id}/cardio-logs/{date}`, `PATCH /cardio-logs/{id}` | `CardioOccurrenceDto` | `LogCardioRequest`, `EditCardioLogRequest` |
| `GET /mesocycles…` | `MesocycleHomeDto`, `MesocycleWeekDto`, `SessionDetailDto` | — |
| `GET /exercises…`, `POST /exercises`, favorite/archive/restore | `ExerciseList`, `ExerciseDetailDto` | `CreateCustomExerciseRequest`, `SetFavoriteRequest` |
| `GET /goals…`, `POST /goals`, archive/acknowledge | goal DTOs | `CreateGoalRequest` |
| `GET /exercises/{id}/history` | `ExerciseHistoryDto` (gated) | — |
| `GET/PUT /me/profile`, `PUT /me/appearance`, tour, release notes, trial notice | `ProfileDto`, `TourStateDto`, `ReleaseNotesDto` | `UpdateProfileRequest`, `UpdateAppearanceRequest`, `TourOutcomeRequest` |
| `POST /feedback` | `{ id: string }` | `FeedbackRequest` (screenshots travel as multipart parts; their metadata as `ScreenshotMeta`) |
| `GET /me/export`, `GET /me/deletion-inventory`, `POST /me/delete`, `GET /me/plan` | export JSON, `AccountInventoryDto`, —, `MePlanDto` | `DeleteAccountRequest` |
| any failure | `ApiErrorBody` | — |

Names for composite responses that 21c will assemble (`TodayDto`, `WorkoutViewDto`, `LoggedWorkoutDetailViewDto`, `LoggedSetDto`, `MissedDayResolutionDto`) are defined in the contracts as compositions of existing DTOs; 21c may extend them backward-compatibly.

## 12. Validation rules

Unchanged. Every parser, limit, and message moves byte-for-byte. The only edit is that the reps rule (§5.4) is one named function used by the server and the card. Accepted and refused inputs are identical on the server; on the card, an out-of-range reps value shows the same message without a round trip.

## 13. UI data contracts (wire conventions)

```ts
// src/contracts/wire.ts
/** A calendar date in the account's time zone: "2026-11-12". */
export type IsoDate = string;
/** An instant: "2026-11-12T18:04:05.123Z" (Date#toISOString). */
export type IsoDateTime = string;

/** Compile-time: T contains only JSON values (no Date, Set, Map, function, bigint, undefined-only key). */
export type IsJsonSafe<T> = /* recursive conditional type; true or false */;
```

Rules every contract follows:

1. No `Date`, `Set`, `Map`, `bigint`, class instance, or function. The web's `ResolvedEntitlement.capabilities` (`ReadonlySet`) is not a contract; `EntitlementDto.capabilities` is `Capability[]`.
2. Calendar dates (`scheduledFor`, `missedOn`, `today`, week starts, `dateIso`, release dates) are `IsoDate`. Instants (`completedAt`, `createdAt` where exposed) are `IsoDateTime`. Human-readable labels the server already builds (`createdLabel`, `endsOn` "December 4, 2026") stay strings and are documented as display text.
3. `null` = not recorded / none; `0` = zero. Weights in pounds, at most two decimals. RIR `0..4` or `null`.
4. Gated DTOs keep `locked` (the withholding `Capability`, or `null`) and `null` Pro fields when locked, exactly as `gatePlanned`/`gateOccurrence`/`gateSessionSummary`/`gateHistory` return them.
5. Enum-valued fields use the registry unions, never `@prisma/client` types.
6. Within API v1, contract changes are additive only (new optional fields, new union members only where clients handle unknowns). This is a 21c+ rule recorded here so contract edits follow it.

## 14. Testing strategy

### 14.1 Behavior preservation (moved code)

```text
GIVEN a moved module
WHEN its shared file is compared with its staging web file, import lines removed
THEN the bodies are identical (run verification, reported in the PR)

GIVEN every existing unit test of a moved module (progression-*, set-entry, rir, rep-target, plan-pure,
      plan-readiness, logging-schedule, cardio-*, taxonomy, gym-variable, bodyweight-loading, goal-*,
      weight-rule, time-zone, weekday-names, release-notes-*, tour-*, appearance*, feedback-validation,
      exercise-history-format, …)
WHEN only its import specifiers are rewritten
THEN it passes with the same assertions, and the suite count is unchanged (143 suites before; new suites only add)
```

Time-zone-sensitive cases (`time-zone.test.ts`, `logging-schedule.test.ts`, `history-week-math.test.ts`) run unchanged against the shared calendar and schedule.

### 14.2 New tests

| Test | Proves |
| --- | --- |
| `tests/unit/weight-format-consolidation.test.ts` | The canonical formatter equals frozen copies of all four legacy formatters for every cent 0.01–9,999.99 and for engine loads (progress +5, 90% deload, rounding cases). |
| `tests/unit/reps-rule.test.ts` | `checkLoggedReps` accepts 1–1000 integers and refuses 0, negatives, fractions, 1001, `NaN`, non-numbers with "Enter reps above 0."; `logSet` validation and the card use it; `GOAL_REPS_MAX === LOGGED_REPS_MAX`. |
| `tests/unit/enum-parity.test.ts` (extended) | Every registry tuple equals its `Prisma.$Enums` values; every Prisma enum is in the shared list or the web-only list; the former type mirrors equal the registry unions. |
| `tests/unit/design-tokens.test.ts` | Each `globals.css` block (`:root`, `.dark`, and the dark media query) equals `colors.light`/`colors.dark`; `--radius` equals `radius.lg`; `THEME_COLORS` equals the token backgrounds. |
| `tests/unit/mobile-contracts.test.ts` | Every exported contract is `IsJsonSafe` (compile-time); date fields are `string`; gated DTOs carry `locked`; `ApiErrorBody` codes include every action `ErrorCode` plus the two API codes; the contract source contains no `Date` type. |
| `tests/unit/shared-package-guards.test.ts` | No moved module exists at its old web path; no web file defines a moved rule again (`estimateOneRepMax`, `isGymVariable`, `checkWeightLbs`, `WEIGHT_LBS_MAX`, the 1000 reps bound, a weight formatter body); the web declares and transpiles `@overload/shared`; web files import moved modules from `@overload/shared/…` only; the shared package has no API route code and no Prisma-reaching import. |
| `scripts/workspace-boundaries.test.mjs` (extended) | B3e: `process.env.X` other than `NODE_ENV` in shared source fails; `NODE_ENV` passes. |

### 14.3 Guards that must keep finding what they guard

Each source-scanning guard that pinned a moved file is updated to scan `packages/shared/src` in addition to `src`, with the moved file's new path, never by deleting the check:

| Guard | Update |
| --- | --- |
| `invariant-guards.test.ts` (one Epley formula; no stored tag/e1RM in progression) | Scans `src` + shared; expects `packages/shared/src/progression/e1rm.ts`; progression scan covers both folders. |
| `deliberate-absences.test.ts` (recommendation wording only in one file; plan code never writes logs) | The recommendation path becomes the shared path; plan/logging scans include the shared folders. |
| `exercise-history-guards.test.ts` | The pure history files are read from the shared package. |
| `bodyweight-loading.test.ts` | The loading-mode exemption points at the shared path; the scan covers both trees. |
| `release-notes-guards.test.ts` | Reads the shared release-note files; their allowed imports are the shared relative paths. |
| `tour-extensibility.test.ts`, `tour-registry.test.ts` | Registry = web `steps.ts` (placement) + shared `tour/content.ts` (copy); copy pins unchanged. |
| `admin-guards.test.ts` | The allowed-import entry `@/lib/plan/calendar` becomes `@overload/shared/plan/calendar`. |
| any other guard that fails after the move | Same rule: widen, never weaken. |

### 14.4 Standing suites

Full unit suite, integration suite (including the cross-account isolation suite and the logged-history, baseline, entitlement, billing, and admin suites), end-to-end suites, lint, typecheck (web and shared), format, `verify:workspaces`, `verify:client-bundle`, and the production build with non-Production settings.

### 14.5 Security / privacy

- The isolation suite passes unchanged (no data path changed).
- `verify:client-bundle` passes: no server secret reaches a client chunk through the shared package.
- No file under `src/app/api/mobile` exists; no migration directory is added; no new entitlement or capability path (run verification).

### 14.6 Integration (resolution)

Spike on 2026-11-12 (moving `plan/calendar`): Jest (mapper), web `tsc` (bundler resolution of `exports`), `tsx` (`scripts/demo/seed.ts` loads), ESLint, the boundary check, and `next build` (Turbopack with `transpilePackages`) all resolved `@overload/shared/plan/calendar`. Each ticket re-runs them.

## 15. Acceptance criteria

**Wiring**
- [ ] `apps/web` declares `@overload/shared`; `next.config.ts` transpiles it; Jest, Jest's tsconfig, and `tsx` resolve its subpaths.
- [ ] `npm run build` passes with non-Production settings.

**Extraction**
- [ ] Every module in §5.2 lives in `packages/shared/src` and nowhere in `apps/web/src`.
- [ ] Every split in §5.3 is done; the web half holds no copy of the shared half.
- [ ] Moved bodies are identical to staging apart from import lines (verified in the run).
- [ ] The shared package passes its strict typecheck, lint, and B3 (including B3e).

**Consolidation**
- [ ] One reps rule, one weight rule, one weight formatter; the equivalence test passes.

**Enums**
- [ ] The registry covers §5.5; every tuple matches Prisma; every Prisma enum is classified.

**Contracts**
- [ ] The contract files in §5.6 exist; web query modules return the contract types; every contract is JSON-safe with ISO date strings and preserved `null`/`locked`.

**Tokens and content**
- [ ] Tokens match `globals.css`; `THEME_COLORS` reads them.
- [ ] Tour copy and release notes come from the shared package; the tour and What's New render the same.

**Unchanged behavior**
- [ ] All pre-existing tests pass with unchanged assertions; the unit suite count only grows.
- [ ] Integration, end-to-end, client-bundle, and boundary checks pass.
- [ ] No route under `/api/mobile`, no migration, no schema change, no entitlement change, no Production change.

## 16. Explicit non-goals

- ❌ The mobile API, auth, idempotency, version gate. **Deferred** to 21c.
- ❌ The Expo app and native UI. **Deferred** to 21d+.
- ❌ Any change to the engine, thresholds, e1RM, schedule, validation, or messages. **Permanent for this pitch** (behavior-preserving extraction).
- ❌ A client-side unlock of Pro results or a second progression engine. **Permanent.**
- ❌ Program generation, social features, ads. **Permanent.**

## Resolved Decisions

| # | Decision | Rationale | Authority |
| --- | --- | --- | --- |
| RD-1 | 21b is a behavior-preserving extraction: formulas, thresholds, rounding, messages, and constants move unchanged. | The pitch's purpose is one authoritative source, not new behavior. | Run prompt pre-resolved decision 1 |
| RD-2 | The package is framework-independent source-only TypeScript with no runtime dependencies; 21a's B3 fence stays and is extended (B3e). | Hermes and Node both run it; a forbidden import must fail `npm test`. | Pre-resolved 2; CLAUDE.md mobile rules; 21a RD-10 |
| RD-3 | Only pure code moves; mixed modules are split (§5.3). The pure-or-not test is the audit's ground rule (§4). | Moving server code to keep a file whole would break the fence or the server boundary. | Pre-resolved 3; mobile-audit §4 |
| RD-4 | The backend stays authoritative: no entitlement resolution, capability check, gate, data access, or write in the package; contracts keep `locked`. The engine is shared so the server and tests use one copy; the phone never runs it to unlock anything. | A second authority would let a Free account derive Pro results. | Pre-resolved 4; CLAUDE.md "One backend and one training model" |
| RD-5 | Established constants are reused, not re-derived; duplicates are consolidated only where the outputs are proven equal (§5.4). | `method-note.md` and the shipped code are the approved behavior. | Pre-resolved 5; method-note |
| RD-6 | DTOs are types only; no route, handler, middleware, idempotency, version gate, or response construction. | Those are 21c. | Pre-resolved 6; mobile-roadmap 21c |
| RD-7 | `recommendation.ts` keeps `process.env.NODE_ENV !== "production"` unchanged; the package declares only `process.env.NODE_ENV` ambiently (`src/env.d.ts`) and B3e forbids any other `process` use. | Behavior-preserving (the dev-only mismatch throw stays). `NODE_ENV` is a build-time constant every bundler inlines (Next, Jest sets `test`, `babel-preset-expo` inlines it for Metro); the ambient declaration avoids giving the package Node types. Hermes behavior is unverified until 21d. | Pre-resolved 1, 2; audit §4 ("inlined by Babel") |
| RD-8 | Module path in shared = web path minus `src/lib/`; consumers import subpaths (`@overload/shared/<domain>/<name>`) via the `"./*"` export; no barrel. | Anyone who knew the old path finds the new one; a barrel would collide on repeated names (two `addDays`, two `validation`). | Audit §4 module names; RD-3 |
| RD-9 | Moved modules: consumers import the shared path directly (codemod over `src`, `tests`, `e2e`, `scripts`, `prisma`, including `jest.mock` strings). Split modules may keep a thin re-export in their web file so large importer sets stay unchanged (`actions/result` 87, `billing/config` 25, query-module DTO types). | Direct imports make "the web uses the shared implementation" checkable; re-exports are allowed by pre-resolved 8 where they avoid churn and hold no logic. | Pre-resolved 8 |
| RD-10 | Shared code is tested in the web's existing unit project (`apps/web/tests/unit`); no test runner is added to the package. | Its tests already live there; ts-jest compiles the package through the mapper; adding Jest to the package would add dev dependencies and a second config for no gain. Root `npm test` runs it. | Pre-resolved 8, 11 (tests stay discoverable); 21a B3 (no new deps) |
| RD-11 | Resolution: Jest `moduleNameMapper` and `tsconfig.jest.json` `paths` (Node10 cannot read `exports`); web `tsconfig` (bundler), ESLint, and `tsx` read `exports` unchanged; Next uses `transpilePackages`. `type: module` stays. | All verified by the 2026-11-12 spike, including `next build` and `tsx scripts/demo/seed.ts`. | 21a spec §8.10 (`transpilePackages` planned) |
| RD-12 | Canonical weight formatter = `String(Math.round(x * 100) / 100)` (`formatWeightLbs`); the four legacy names become aliases or callers. | Already the form used by recommendation and history; equal to the other two for every ≤2-decimal value, which is every reachable input; proven exhaustively by test. | Audit D-14; pre-resolved 5 |
| RD-13 | One reps rule (`checkLoggedReps`, 1–1000, "Enter reps above 0.") for `logSet`, `editLoggedSet`, and the logging card; `GOAL_REPS_MAX` references the same bound; plan `REPS_MAX = 100` stays separate (a different rule). The past-set edit dialog keeps its exact lower-bound pre-check and reads the shared message; it does not add the upper bound. | Audit D-13. The card maps a server `details.reps` refusal to the reps field, so pre-checking 1001+ there shows the same text without a round trip. The dialog shows the server's top-level message ("Check the highlighted fields.") for 1001+, so adding the bound there would change visible text; left for an owner decision (owner notes). | Audit D-13; exercise-card and edit-set-dialog error mapping; pre-resolved 8 |
| RD-14 | The two `addDays` stay separate (calendar-date vs instant). | Different types and domains; consolidating would change a signature for no behavior gain. | Audit D-15; pre-resolved 5 |
| RD-15 | Enum registry covers enums that cross the client boundary or already had a mirror (§5.5); the rest are listed web-only; the parity test fails on an unclassified Prisma enum. Prisma stays the authority; no schema change. | Pre-resolved 7; audit D-6. | Pre-resolved 7 |
| RD-16 | Where the web already builds a DTO, the type moves to `src/contracts/` and the query module returns it (re-exporting the name), so the compiler proves server output = contract. New shapes (`AppConfigDto`, `MeDto`, `ApiErrorBody`, requests, composite views) are defined beside them. Ungated progression types (`ExerciseProgressionDto`, `PerformanceRow`, `ScopeDescription`) and web-only DTOs (`CloneSetupDto`, `BillingScreenDto`, `ImportSession…`) stay in the web. | Prevents a contract drifting from the server; keeps ungated Pro shapes off the API surface (audit F-T11). | Pre-resolved 6; mobile-audit §2, §4 |
| RD-17 | Wire conventions (§13): `IsoDate` vs `IsoDateTime`, `null` vs zero, `locked` preserved, enum unions only, additive-only within v1. | Pre-resolved 6; CLAUDE.md backward compatibility rule. | Pre-resolved 6; CLAUDE.md mobile API |
| RD-18 | API error codes = the existing action codes plus `account_suspended` and `upgrade_required` (`ApiErrorCode`); the server action `ErrorCode` union is unchanged. | CLAUDE.md names those two codes for the mobile API; adding them to actions would invite server actions to use them. | CLAUDE.md mobile API rules |
| RD-19 | `AppConfigDto.signupMode` is `"public" | "closed"` only; the legacy invite mode and its code never appear in a contract. | The invite mode is not the operating mode and its code is a secret-like value. | CLAUDE.md access model; audit §2 (`/app-config` "without the invite code") |
| RD-20 | Tour: shared holds step id, title, body, and order; the web keeps anchors, routes, layout filter, target bodies, and placement (`engine.ts` stays whole, being pixel placement). | Pre-resolved 9; audit §4 "Move after splitting". | Pre-resolved 9 |
| RD-21 | Release notes (`types`, `entries`, `catalog`) move whole; a per-entry `platforms` field is not added now (21h decides). | They are pure; adding a field would change content shape without a consumer. | Audit §4; pre-resolved 1 |
| RD-22 | Tokens are values in `src/design/tokens.ts`; `globals.css` stays the web's styling source and a parity test keeps them equal; `THEME_COLORS` reads the tokens. Generating CSS from tokens is not done. | Pre-resolved 9 ("without replacing Tailwind"); the audit offers parity test or generation, and the test changes nothing visible. | Pre-resolved 9; audit §6 |
| RD-23 | `greeting.ts`, `library-params.ts`, plan-import pure parts, `tour/engine.ts`, `gyms/baselines.ts` stay in the web. | Not needed by any planned mobile surface before 21c decides (greeting is server-built), or web-only, or server-only. | Audit §4; RD-3 |
| RD-24 | No runbook action beyond staging verification: no migration, env change, Vercel change, Expo or TestFlight step. | Pre-resolved 10. | Pre-resolved 10 |
| RD-25 | Tickets: four, in dependency order — OVE-168 (wiring + plan/logging/cardio/exercise rules), OVE-169 (progression engine, goals, and the formatter/reps consolidation), OVE-170 (validation splits, errors, content, appearance, tokens), OVE-171 (enum registry, contracts, final guards, runbook). | Grouped by module family and import dependency (progression imports plan and logging; contracts import everything). | Run prompt step 6 |
| RD-26 | The hand-written enum mirrors found while building the registry also point at it: `MesocycleStatusValue` (plan queries, row locks), the schedule's outcome and status, `Plan`, `TourOutcomeValue` (tour progress), and `DashboardKind` (= `DashboardDto["kind"]`). Type-only; equal by the parity test. | Audit D-6: one definition per enum. | Pre-resolved 7 |
| RD-27 | Contract count: 89 exported types across 14 contract files (the roadmap's "about 50" was an estimate). `BlockRef`, `WhatsNewDialogData`, `TrialNoticePhase`, `TrialNoticeData`, `EmailVerificationDto`, and `MissedDayResolutionDto` moved with the DTOs that reference them so every server-built shape has one definition. | The audit is authoritative for the inventory; the count is not a target. | Run prompt ("approximate DTO count") |

## Open questions

None blocking. Items that need a device or a later slice are listed under Future considerations and in the owner notes (Hermes `Intl` and `NODE_ENV` inlining, verified in 21d).

## 18. Future considerations

- 21c implements the contracted endpoints and maps `ApiErrorCode` to statuses; it extracts `getTodayView`/`getWorkoutView` returning `TodayDto`/`WorkoutViewDto`.
- 21c decides request validation for the API by wrapping the shared parsers (never a second rule set).
- 21d verifies on a device that Metro bundles the package, that `Intl.DateTimeFormat` with `timeZone`/`formatToParts` behaves on Hermes (audit D-19), and that `process.env.NODE_ENV` is inlined.
- 21h may add a `platforms` field to release notes and expose them on the API.
- 21k builds the native tour from `TOUR_CONTENT` with its own anchor map.
