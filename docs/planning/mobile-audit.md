# Overload: Mobile Codebase Audit

**Status:** read-only audit of `staging` at `6f1614f` (2026-11-11), done to plan the React Native (Expo) rebuild described in `docs/planning/mobile-roadmap.md`. No application code, schema, configuration or data was changed. No Production or paid service was called.

Paths are relative to the repository root. `file:line` references are as of the audited commit.

---

## 1. Screens and routes

### Inventory

| Item | Count |
|---|---|
| `page.tsx` files | 47 |
| `loading.tsx` files | 27 |
| `error.tsx` files | 2: `(app)/error.tsx` and `admin/error.tsx` |
| `not-found.tsx` | 1, at the root only |
| Layouts | 4: root, `(app)`, `(marketing)`, `admin` |
| Route handlers | 3: `/settings/export`, `/auth/confirm`, `/api/stripe/webhook` |
| `global-error.tsx` | none |

**Capabilities** (`src/lib/billing/config.ts:18`): `progression_insights`, `e1rm_trends`, `exercise_history_intelligence`, `plan_import`. Free grants none of them; Pro grants all four.

**How the gates work:**
- **Read gates** are in `src/lib/entitlements/gate.ts`: `gatePlanned`, `gateOccurrence`, `gateSessionSummary`, `gateHistory`. They are called from `lib/progression/queries.ts:671,742,867` and `lib/progression/history-queries.ts:143`. A gate nulls the Pro fields and sets `locked`. The page then renders `components/billing/upgrade-note.tsx`.
- **The write gate** is `requireCapability` (`src/lib/entitlements/require.ts:13`). Only plan import uses it.

**The shell:** every `(app)` page runs inside `(app)/layout.tsx`. The layout calls `requireAccount`, `getAccountAppearance`, `getTourAutoStart`, `getWhatsNewDialog`, `getTrialNotice`, `getSettingsProfile`, `currentUser` and `isAdminUserId`, then renders `AppShell`. The shell holds the tour, What's New, the trial notice and the Toaster.

**State codes used in the tables:**

| Code | Meaning |
|---|---|
| L | own `loading.tsx` |
| L↑x | inherits the loading state from x |
| E | empty state |
| Lk | locked or upgrade note |
| Er | inline error |
| NF | calls `notFound()` |

### Today and logging

| Path | Purpose | Plan | Reads | Writes | States | Key components | Slice |
|---|---|---|---|---|---|---|---|
| `/` `(app)/page.tsx` | Today: no plan, rest, cardio-only rest, missed day, planned, in progress, complete (with summary). Greeting. | Free; calls, evidence and suggested load gated by `progression_insights` | `getTodayDashboard`, `getPlannedProgression` (×N exercises), `getSessionProgressionSummary`, `getGreetingFacts`, `composeGreeting`, `accountToday`, `dashboardShowsGoals`, `reconcileGoalCompletionsSafely` (**a write during render**) | `resolveMissedDayAction`, `logCardioAction`, `editCardioLogAction` | L, E, Lk ×2, missed-day `inert` | `logging/missed-day-prompt`, `progression/{progress-tag,recommendation,suggested-load,scheduled-deload-banner}`, `goals/{dashboard-goals,session-goal-rows}`, `cardio/cardio-today` | 21d (missed day and cardio: 21e) |
| `/log/start` | Pick a gym and start (`?sessionId&scheduledFor`) | Free | `listActiveGyms` | `startWorkoutAction`, `changeGymAction` | L, NF | `logging/gym-picker` | 21d |
| `/log/[loggedSessionId]` | Workout runner: cards, set entry, RIR, skip, extra set, change gym, finish | Free; card call gated by `progression_insights` | `getWorkout`, `getOccurrenceProgression` (×N), `listActiveGyms` | `logSetAction`, `setExerciseSkippedAction`, `completeWorkoutAction`, `changeGymAction`, `editLoggedSetAction` | L, NF, Lk, Er | `logging/{workout-runner,exercise-card,rir-picker,edit-set-dialog}` | 21d (RIR and Pro calls: 21e) |
| `/log/[id]/[loggedExerciseId]/swap` | Swap picker; opens on the planned muscle, `?muscle=` switches group | Free | `getSwapContext` | `swapExerciseAction` | L, NF, E | `logging/swap-picker` | 21e |

### History

| Path | Purpose | Plan | Reads | Writes | States | Components | Slice |
|---|---|---|---|---|---|---|---|
| `/history` | Week list for the **active mesocycle only** (`?week=`): lifting and cardio by day | Free | `getWeekSchedule`, `getCardioWeek` | `logCardioAction`, `editCardioLogAction` | L, E | `cardio/cardio-history-line` | 21d |
| `/history/[loggedSessionId]` | Logged workout detail; edit past sets and the planned-set count | Free | `getLoggedWorkoutDetail`, `rirSuffix` | `editLoggedSetAction`, `editPlannedSetsAction` | L, NF | `logging/{edit-set-dialog,edit-planned-sets-dialog}` | 21d view, 21e edit |

### Plan

| Path | Purpose | Plan | Reads | Writes | States | Slice |
|---|---|---|---|---|---|---|
| `/plan` | Mesocycle home (active, drafts, archived), import entry | Free; import entry locked without `plan_import` | `listMesocyclesForHome`, `hasCloneSource`, `resolveEntitlement` | — | L, E, Lk | 21f (read) |
| `/plan/new` | Create a mesocycle | Free | `DEFAULT_*` constants | `createMesocycleAction` | L↑plan | web-only (beta) |
| `/plan/clone`, `/plan/clone/[sourceId]` | Clone a block | Free | `listCloneSources`, `getCloneSetup` | `cloneMesocycleAction` | L↑plan, E, Er | web-only (beta) |
| `/plan/import` | AI plan import (intake → extraction → review → done) | **`plan_import`** + kill switch | `resolveEntitlement`, `isPlanImportEnabled`, `runImportRetention` (**a write on GET**), `readImportUsage`, `getImportStatus`, raw `account.db.importSession.findUnique` ×2 in the page | 16 import actions | L↑plan (wrong shape), Lk, unavailable card | web-only (beta) |
| `/plan/[mesocycleId]` | Week view: sessions by weekday, unscheduled list, cardio, readiness, activate and archive | Free | `getMesocycleWeek`, `occupancyOf`, `weekdaysFromNames` | `activateMesocycleAction`, `archiveDraftMesocycleAction`, session add, rename, move, remove and duplicate, planned-cardio add, update and remove | L, NF | 21f (read) |
| `/plan/[id]/details` | Edit block details | Free | `getMesocycleWeek` | `updateMesocycleDetailsAction` | L↑, NF | web-only (beta) |
| `/plan/[id]/sessions/[sessionId]` | Session template: planned exercises, reorder, edit | Free | `getSessionDetail` | `moveSessionExerciseAction`, `update/removeSessionExerciseAction`, `renameSessionAction` | L, NF, E | 21f (read) |
| `/plan/[id]/sessions/[sid]/add` | Library picker to add or replace an exercise | Free | `getSessionDetail`, `listExercises` | `add/replaceSessionExerciseAction` | L, NF, E ×7 | web-only (beta) |

### Exercises and gyms

| Path | Purpose | Plan | Reads | Writes | States | Slice |
|---|---|---|---|---|---|---|
| `/exercises` | Library: search, muscle filter, favorites, load more | Free | `listExercises`, `parseLibraryParams` | `setExerciseFavoriteAction` | L, E ×6 | 21f |
| `/exercises/new` | Custom exercise | Free | — | `createCustomExerciseAction` | L↑ | 21f |
| `/exercises/[id]` | Detail and history: records, trend (e1RM, weight, reps), sessions, goals, gym scope, archive | Free base; `progression_insights`, `e1rm_trends`, `exercise_history_intelligence` via `gateHistory` | `getExercise`, `getExerciseHistory`, `getExerciseGoals` | `archive/restoreExerciseAction`, `setExerciseFavoriteAction` | L, NF, Lk ×2 | 21g (archive: 21f) |
| `/gyms` | Active gyms, archive | Free | `listActiveGyms` | `archiveGymAction`, `restoreGymAction` (undo toast only) | L, E | 21f |
| `/gyms/new` | Add a gym | Free | — | `createGymAction` | L↑ | 21f |

### Goals (all Free)

| Path | Purpose | Reads | Writes | States | Slice |
|---|---|---|---|---|---|
| `/goals` | Active goals, reached cards | `listActiveGoals`, `listUnacknowledgedCompletions`, `countGoalHistory`, reconcile (write) | `acknowledgeGoalCompletionAction` | L, E | 21g |
| `/goals/new` | Pick an exercise | `listExercises`, `activeGoalExerciseMap`, reconcile | — | L, E ×6 | 21g |
| `/goals/new/[exerciseId]` | Target form | `getGoalFormContext`, reconcile | `createGoalAction` | L, NF, E ×3, Er | 21g |
| `/goals/[goalId]` | Detail, progress, archive | `getGoalDetail`, reconcile | `archiveGoalAction`, `acknowledgeGoalCompletionAction` | L, NF, Er | 21g |
| `/goals/history` | Archived and reached goals | `listGoalHistory`, reconcile | — | L, E | 21g |

### Cardio

There is no cardio route. Cardio lives in dialogs and lines on `/`, `/history` and `/plan/[id]`:
- components: `cardio/{cardio-today,cardio-log-dialog,cardio-fields,cardio-history-line}`, `plan/{cardio-controls,cardio-line}`
- actions: `logCardioAction`, `editCardioLogAction`, `add/update/removePlannedCardioAction`

It is Free. Logging is in 21e; planned-cardio editing is web-only for the beta.

### Settings and account

| Path | Purpose | Reads | Writes | States | Slice |
|---|---|---|---|---|---|
| `/settings` | Profile (name, username, timezone, verified), appearance, replay tour, export, delete link | `getSettingsProfile`, `timeZoneOptions`, `getAccountAppearance`, `getEmailVerification`, `requireUser` | `updateProfileAction`, `updateAppearanceAction`, `sendVerificationEmailAction` | L | 21h |
| `/settings/billing` | Plan & Billing; Checkout, Portal | `refreshBillingFromStripe` (**Stripe call and mirror write on GET**), `getBillingScreen`, `isAppShellRequest` | `createCheckoutSessionAction`, `createPortalSessionAction`, `checkoutOutcomeAction` | L↑ | 21h read-only; purchase web-only |
| `/settings/delete-account` | Inventory, then confirmed delete | `accountInventory` | `deleteAccountAction` | L | 21h (App Store) |
| `/settings/whats-new` | Release-note list | `orderedReleaseNotes` (static catalog) | `markReleaseNotesSeenAction` (shell) | L | 21h |
| `GET /settings/export` | JSON export, `no-store` | `buildAccountExport` | — | redirect if signed out or suspended | 21h (share sheet) |
| `/feedback` | Feedback with screenshots (bucket `feedback-screenshots`) | — | `submitFeedbackAction` | L↑(app) (Today-shaped skeleton) | 21h |
| shell actions | — | — | `markTourOfferedAction`, `recordTourOutcomeAction`, `markReleaseNotesSeenAction`, `markTrialNoticeShownAction`, `signOutAction` | — | 21c / 21h |

### Auth

Auth pages have no `loading.tsx` and no error boundary.

| Path | Purpose | Writes | Slice |
|---|---|---|---|
| `/login` | Email and password sign-in | `signInAction` | 21c (native sign-in through supabase-js) |
| `/signup` | Closed, invite or public mode; Turnstile | `signUpAction` | web-only (beta): link out |
| `/forgot-password`, `/reset-password` | Recovery request; set a new password from the recovery session | `requestPasswordResetAction`, `setNewPasswordAction` | web-only: link out |
| `/verify-email`, `GET /auth/confirm` | Email-link landings (`verifyOtp`) | `confirmEmailVerification` | web-only |
| `/suspended` | Suspension wall | `signOutAction` | 21b/21c as an API error plus a blocking screen |
| `/support` | Support email card | — | 21h (link) |

### Marketing and admin (web-only)

| Area | Routes | Notes |
|---|---|---|
| Marketing | `/welcome` (signed-out `/` is rewritten here in `src/proxy.ts`), `/pricing`, `/changelog`; `manifest.ts`, `robots.ts`, `sitemap.ts` | Public pages. |
| Admin | `/admin`, `/admin/accounts`, `/admin/accounts/[id]`, `/admin/feedback`, `/admin/feedback/[id]`, `/admin/audit`, `/admin/billing`, plus `POST /api/stripe/webhook` | `admin/layout.tsx` runs `requireAccount` then `requireAdmin`. Web-only by rule. |

### Web-only candidates and why

| Surface | Why it stays on the web |
|---|---|
| Admin (7 pages) | Web-only by rule. |
| Marketing (3) | Public pages. |
| Purchase path in `/settings/billing` | No in-app purchase until the store billing path is decided. The phone shows plan state read-only. |
| `/plan/import` | Synchronous LLM call of up to 240 s (`lib/import/extract.ts:49`), file uploads, a 1,391-line `import-flow.tsx`, kill switch. |
| Plan builder (`/plan/new`, `/plan/clone*`, `/plan/[id]/details`, `.../add`, session-editing dialogs) | Dense forms; low frequency. |
| Signup, recovery, `/verify-email`, `/auth/confirm` | Turnstile has no native SDK. Email links land in the browser. The invite gate stays entirely server-side. |

### Screen counts

| Area | Pages | Area | Pages |
|---|---|---|---|
| Today and logging | 4 | Goals | 5 |
| History | 2 | Settings | 5 (+ export) |
| Plan | 9 | Auth | 7 (+ confirm) |
| Exercises | 3 | Marketing | 3 |
| Gyms | 2 | Admin | 7 (+ webhook) |

Total: 47. If plan editing and import stay on the web, the native app needs about **22 screens**.

### Client islands that hold real logic (each needs a native rebuild)

| File | Lines | What it does |
|---|---|---|
| `components/logging/exercise-card.tsx` | 664 | Drafts for each set, active-set focus, client validation duplicated from the server (`:287-298`), conflict notices, extra set, skip. Uses `lib/logging/set-entry` (`activeSetNumber`, `offerFor`, `formatWeight`). |
| `components/logging/workout-runner.tsx` | 241 | Card navigation, change-gym flow, finish confirmation listing unfinished exercises. |
| `components/logging/swap-picker.tsx` | 169 | Muscle group held in URL state, client-side filter. |
| `components/logging/missed-day-prompt.tsx` | 136 | Three outcomes, shift confirmation. |
| `components/tour/tour-provider.tsx` + `tour-overlay.tsx` | 344 + 286 | DOM-anchored tour (`lib/tour/{engine,dom,steps}.ts`). Needs native coach marks. |
| `components/plan/import/*` | ~2,000 | Polling, review, matching. |
| `plan/session-controls.tsx`, `planned-exercise-dialog.tsx`, `mesocycle-form.tsx`, `cardio-controls.tsx` | 652, 337, 336, 379 | Plan-builder forms. |
| `billing/plan-billing.tsx` | 486 | Checkout return; pending state kept in localStorage. |
| `settings/profile-form.tsx` | 329 | Device time-zone detection (`lib/accounts/use-device-time-zone`). |
| `exercises/history/exercise-trend.tsx` + `trend-chart.tsx` | — | View tabs. Fewer than two points renders a sentence instead of a chart. |
| `billing/upgrade-note.tsx` | 156 | Per-surface dismissal in localStorage `overload.upgradeNote.dismissed.<surface>`. |
| `auth/bot-challenge.tsx` | 231 | Turnstile. |

---

## 2. Server logic and API readiness

### Summary

- **Training business logic is already in reusable lib modules.**
  - Every write is a lib function that takes `account: Account` explicitly and runs on `account.db` (the scoped client), with an optional scoped transaction.
  - Actions are thin. Each calls `requireAccount()` (`src/lib/data/account.ts:253`: cookies, `redirect()`, React `cache`) and wraps the result with `toActionResult` (`src/lib/actions/result.ts:51`).
- **No lib function takes a bare `userId`.** No `"use server"` file lives under `src/components`.
- **Extraction work is concentrated in four places:**
  1. The bearer-token auth path. `requireAccount` assumes cookies.
  2. View composition that lives in pages:
     - Today in `(app)/page.tsx`
     - the progression loop on the workout page
     - `components/goals/session-goal-rows.tsx:19` and `dashboard-goals.tsx:25`
  3. Effects that run after a commit or during a render: goal reconciliation, Stripe sync, import retention, and the verify-email write.
  4. FormData and `redirect()` coupling in create actions.

### 2a. Training-domain actions

| Action | Inputs → output | Logic lives in | Capability | Retry-safe? | Extraction before a route handler |
|---|---|---|---|---|---|
| `log/actions.ts:startWorkoutAction` | `{sessionId, scheduledFor, gymId}` → `{loggedSessionId}` | `startOrResumeWorkout` (`lib/logging/sessions.ts:27`) | — | **Mostly.** Natural key `(sessionId, scheduledFor)` resumes an existing workout. A concurrent P2002 surfaces as `internal_error`. No check that the date is on the schedule or not in the future, or that the block is active (F-T3). | `refresh()` only |
| `changeGymAction` | `{loggedSessionId, gymId}` | `changeGym` (`sessions.ts:106`) | — | Yes (absolute value; refused once a set exists) | `refresh()` |
| `logSetAction` | `{loggedExerciseId, setNumber, weightLbs?, reps, rir?}` → `{setId}` | `logSet` (`logged-sets.ts:138`). Set and `applyBaselineOnCompletion` (`gyms/baselines.ts:61`) in **one transaction** (`logged-sets.ts:222-238`). | — | **Yes for a replay.** Natural key `(loggedExerciseId, setNumber)`: an identical replay returns the row; different values return `conflict`. A concurrent P2002 surfaces as `internal_error` although the set saved. **No `loggedSession.status` check** (F-T1). | Post-commit `reconcileGoalCompletionsSafely` lives in the action (`log/actions.ts:63-65`), so it must move into lib. |
| `swapExerciseAction` | `{loggedExerciseId, newExerciseId}` | `swapExercise` (`sessions.ts:146`) | — | Yes. **No status check** (F-T2). | `refresh()` |
| `setExerciseSkippedAction` | `{loggedExerciseId, skipped}` | `setExerciseSkipped` (`sessions.ts:200`) | — | Yes, but a replay rewrites `skippedAt` | `refresh()` |
| `completeWorkoutAction` | `{loggedSessionId}` | `completeWorkout` (`sessions.ts:315`), one transaction | — | **No.** A replay rewrites `completedAt`. | Reconcile lives in the action (`:105-107`) |
| `resolveMissedDayAction` | `{mesocycleId, missedOn, outcome}` | `resolveMissedDay` (`missed-days.ts:22`) | — | **No.** Key `(mesocycleId, missedOn)`: a replay returns `conflict`. `missedOn` is unvalidated. `outcome` is checked only by TypeScript (F-T4). | `refresh()` |
| `logCardioAction` | `{mesocycleId, scheduledFor, type, durationMin}` → `{cardioLogId, alreadyLogged}` | `logCardio` (`cardio-logs.ts:164`) | — | **Yes.** Replay and P2002 return `alreadyLogged`. **The model to copy.** | `refresh()` |
| `history/actions.ts:editLoggedSetAction` | `{loggedSetId, weightLbs?, reps, rir?}` | `editLoggedSet` (`logged-sets.ts:249`), values only, no baseline replay | — | Yes | Reconcile in the action (`:31-33`) |
| `editPlannedSetsAction` | `{loggedExerciseId, plannedSets}` | `editPlannedSets` (`sessions.ts:261`), can only lower the count | — | Yes | Reconcile in the action (`:55-57`) |
| `editCardioLogAction` | `{cardioLogId, type, durationMin}` | `editCardioLog` (`cardio-logs.ts:193`) | — | Yes | `refresh()` |
| `goals/actions.ts:createGoalAction` | FormData → `GoalFormState` + redirect | `createGoal` (`goals.ts:107`) | Free | **No.** If the goal was reached on creation, it was archived, so a replay creates a duplicate goal (F-T7). | FormData and `redirect`. `parseGoalInput` already takes an object. |
| `archiveGoalAction`, `acknowledgeGoalCompletionAction` | `goalId` | `archiveGoal` (`:248`), `acknowledgeGoalCompletion` (`:277`) | Free | Archive: a replay returns `invalid_state_transition`. Acknowledge: yes. | — |
| `gyms/actions.ts:createGymAction` | FormData | `createGym` (`gyms.ts:34`) | — | **No: duplicate** | FormData, `redirect` |
| `archiveGymAction`, `restoreGymAction` | `gymId` | soft delete | — | Yes | `refresh` |
| `exercises/actions.ts:createCustomExerciseAction` | FormData | `createCustomExercise` (`exercises.ts:59`) | — | **No: duplicate** | FormData, `redirect` |
| `setExerciseFavoriteAction`, `archive/restoreExerciseAction` | id | `exercises.ts` | — | Yes | — |
| `plan/actions.ts` (19 actions) | mixed; create and clone take FormData | `lib/plan/{mesocycles,sessions,cardio}.ts` with a `FOR UPDATE` lock (`lib/data/locks.ts:23`) | — | Create, clone, duplicate and `addSession` without a day **duplicate**. `moveSessionExerciseAction` is relative up/down, so it **moves twice on replay** (F-T8). The rest are absolute or keyed. | FormData, `redirect`, `refresh` |

**"Log it late"** has no write path of its own. It is `startWorkoutAction` with `scheduledFor = missedOn`.

**Goal reconciliation** has one engine: `reconcileGoalCompletions` (`goals.ts:40`). It is called in four places: after the log, complete, edit-set and edit-planned-sets actions, and **before render on six pages**. It does **not** run on `/exercises/[id]`, which also shows goals.

### 2b. Account and commercial actions

| Action / route | Logic lives in | Account | Capability | Retry-safe? | Extraction |
|---|---|---|---|---|---|
| `settings/actions.ts:updateProfileAction` | `accounts/profile.ts:updateProfile` | explicit ✔ | Free | Yes | FormData, `refresh`, form-state echo |
| `updateAppearanceAction` | `accounts/appearance.ts:updateAppearance` | ✔ | Free | Yes | `refresh` |
| `sendVerificationEmailAction` | `accounts/verification.ts:sendVerificationEmail` | The email comes from `getAuthUser()` (cookies); the host comes from `headers()` (`:118`) | Free | **No.** Each call sends a new email. | Inject `ownEmail`, a cookie-less `auth` client, and a fixed `redirectUrl`. The deps seam already exists. |
| `settings/billing/actions.ts`: checkout, portal, outcome | `lib/billing/checkout.ts` | ✔ + cookie email | `STRIPE_BILLING_ENABLED` | Checkout is lock-guarded | **web-only** |
| `settings/delete-account/actions.ts:deleteAccountAction` | `accounts/password.ts:verifyCurrentPassword` + `accounts/deletion.ts:deleteAccount` | ✔ + a second `requireUser()` for the email | Free | Data deletion is idempotent. After the identity is removed, a retry gets 401, which the client must treat as done. | FormData, `redirect`, cookie `signOut` |
| `settings/export/route.ts:GET` | `accounts/export.ts:buildAccountExport` | ✔ | Free | read | Swap the auth line |
| `feedback/actions.ts:submitFeedbackAction` | `feedback/feedback.ts:submitFeedback` (10/day) + `feedback/screenshots.ts` (service-role Storage) | ✔ | Free | **No.** Each call creates a new row. Screenshots upload before the limit check. | Move file parsing into lib `submitFeedbackWithScreenshots`; add an idempotency key |
| `release-notes-actions.ts`, `tour-actions.ts`, `trial-notice-actions.ts` | `release-notes/seen.ts`, `tour/progress.ts`, `billing/trial-notice.ts` | ✔ | Free | Yes (forward-only CAS, upsert, first write wins) | Auth line only |
| `plan/import/actions.ts` (16 actions) | `lib/import/*` (~5,000 lines, 31 files) | `guardImport()` | `plan_import` (re-checked in `confirm.ts:126`) + `PLAN_IMPORT_ENABLED` | Mostly (lease and CAS, version locking, confirm returns the existing id). Start, add-text and commit create rows. | **web-only** (see below) |
| `login`, `signup`, `forgot-password`, `reset-password` actions; `auth/confirm/route.ts` | Supabase on the cookie client; `accounts/{signup,recovery,signup-gate,throttle,turnstile}.ts` | pre-auth | — | — | Native sign-in uses supabase-js directly. The rest stay web-only. |
| `admin/**/actions.ts`, `api/stripe/webhook/route.ts` | `lib/data/admin/*`, `lib/data/billing-webhook.ts` | `AdminActor`; webhook resolves the account from the stored customer id | admin allowlist | Yes (conditional updates; event-id ledger) | **web-only** |

### Read modules

Every read in `src/lib/{logging,plan,progression,goals,exercises,gyms,cardio,personalization}/queries*.ts` takes `account` and runs on `account.db`. None of them is coupled to the framework, apart from `resolveEntitlement`, which uses React `cache`.

| Concern | Detail |
|---|---|
| Gated reads (Pro withheld server-side) | `getPlannedProgression` (`progression/queries.ts:664`), `getOccurrenceProgression` (`:735`), `getSessionProgressionSummary` (`:860`), `getExerciseHistory` (`history-queries.ts:136`). |
| **Ungated but exported** | `getExerciseProgression` (`:556`), `describeScope` (`:501`), `gatherRows` (`:176`). These return Pro calls. A mobile handler that calls one of them would leak Pro results to Free accounts (F-T11). |
| `getQualifyingSessionE1rms` | Ungated by design (goals are Free, per the OVE-120 matrix). |
| `resolveEntitlement` | React `cache` does not memoize in route handlers, so a gated read of N exercises makes N entitlement queries. Resolve once per request and pass the result in. |
| Malformed ids | `getWorkout`, `getSwapContext`, `getLoggedWorkoutDetail`, `getOccurrenceProgression` and `getSessionProgressionSummary` skip the `isUuid` check. A malformed id gives a Prisma error, not not-found. |

### Entitlements

| Question | Answer |
|---|---|
| How a plan resolves | `computeEntitlement` (`entitlements/resolve.ts:120`) is pure. Pro comes from any of three sources: a **trial** `Entitlement` row (14 days, created by `establishProfile`, `data/account.ts:228-246`); an active **comp** row; or the **subscription** `BillingAccount` mirror (active or trialing, canceling until period end, past_due within grace). The capability map is in `billing/config.ts:32`. |
| Where it is enforced | Reads: the gate functions in the query layer. Writes: `requireCapability` throws `plan_required` (plan import only). |
| How mobile enforces it | Call the same gated queries and serialize the gated DTO as-is, including `locked`. Map `plan_required` to 402. The upgrade note on mobile says "Available with Pro" with **no purchase link**. |

### Plan import: web-only for the beta

| Aspect | Detail |
|---|---|
| Inputs | Text up to 20,000 characters, or up to 5 files (PDF, JPEG, PNG, WebP, HEIC), up to 10 MiB each and 25 MiB total. |
| Model call | Synchronous inside the action, up to 240 s, with `maxDuration = 300`. |
| Limits | 5 imports a day per account, a global monthly spend cap with reservations, and a lease. |
| Why it doesn't fit mobile | A 4-minute request does not survive the app going to the background. Uploads would need signed upload URLs. The review UI is large. |
| On the phone | Show "Import a plan on the web" (gated on `plan_import`). |
| If ported later | Split `beginExtraction` into a 202 start plus polling, and move uploads to signed upload URLs. |

### How the account-scoped layer meets a bearer token

**How scoping works today:**
- `src/lib/data/scope.ts` `scopeArgs` derives the owned-model list from the Prisma DMMF.
  - It ANDs `userId` into every read and targeted write, and stamps it onto every create.
  - Library `Exercise` rows are readable but never writable.
  - It refuses nested writes and refuses traversal from `Exercise` into owned relations.
- `account-db.ts` `createAccountClient(userId)` applies this through `$extends`. Interactive transactions stay scoped.
- `locks.ts` holds the only raw SQL, and it filters `user_id` explicitly.

**Functions that assume cookies and redirect instead of returning 401:** `requireAccount`, `currentUser`, `requireUser`, `getAuthUser`, `getAccessState`, `createServerSupabase`. Nothing below the `Account` object depends on cookies.

**Proposed for 21b:** add `src/lib/data/mobile-auth.ts` `requireAccountFromToken(request)`. It lives inside `src/lib/data` because the static guard in `tests/unit/account-isolation-guards.test.ts:145-154` restricts `resolveAccountState` to that folder. It runs these steps:

1. Parse `Authorization: Bearer`.
2. Call `supabase.auth.getUser(token)` on a cookie-less anon client (never the service role).
3. Call `resolveAccountState(user.id)`.
4. Return 403 `account_suspended` for a suspended account.
5. Call `touchLastActive`.

**Use `getUser`, not local JWKS verification.** `resolveAccountState` lazily recreates a missing Profile (`data/account.ts:75-89`). A token checked only locally would stay valid for up to 3,600 s after the account is deleted, and would recreate an orphan profile. `getUser` asks Supabase Auth, so it rejects deleted users and revoked sessions.

**Error shape:** `ActionResult` and `ErrorCode` (`result.ts`) already form a stable error shape that maps to HTTP status codes.

### Proposed endpoints per slice

All endpoints are under `/api/mobile/v1`.

**Conventions for every handler:**
- It takes the account from the token, calls the account-scoped lib function, enforces capabilities, and returns `{error:{code,message,details?}}` on failure.
- It reads `X-Overload-App-Version` and returns 426 `upgrade_required` below the minimum supported version.
- Writes accept an `Idempotency-Key` header.

**21b — foundation**

| Method + path | Wraps | Capability | Idempotency |
|---|---|---|---|
| `GET /app-config` (public) | new: minimum and latest app version, kill switches (`planImportEnabled`, maintenance), signup mode without the invite code | — | read |
| `GET /me` | `resolveAccountState`, `getSettingsProfile`, token email, `getEmailVerification`, `getAccountAppearance`, `resolveEntitlement` (plan, `displayState`, capabilities), `getTourAutoStart`, `getWhatsNewDialog`, `getTrialNotice({inAppShell:true})` | — | read |
| `GET /today` | **new `getTodayView(account)`**, extracted from `(app)/page.tsx`. It reconciles goals first and resolves the entitlement once. | gated inside | read |
| `GET /gyms` | `listActiveGyms` | — | read |

**21d — workout loop**

| Method + path | Wraps | Capability | Idempotency |
|---|---|---|---|
| `POST /workouts` | `startOrResumeWorkout` (+ F-T3 checks; P2002 → re-read) | — | natural key `(sessionId, scheduledFor)` |
| `GET /workouts/{id}` | **new `getWorkoutView`** = `getWorkout` + `getOccurrenceProgression` per exercise, with one entitlement resolve | `progression_insights` | read |
| `PUT /logged-exercises/{id}/sets/{setNumber}` | `logSet` + post-commit reconcile (extract to lib) + F-T1 status guard | — | natural key. Identical replay → 200; different values → 409. |
| `POST /workouts/{id}/complete` | `completeWorkout` + reconcile | — | **change lib**: already complete → 200, `completedAt` unchanged |
| `GET /history?week=`, `GET /history/{loggedSessionId}` | `getWeekSchedule`; `getLoggedWorkoutDetail` + `getSessionProgressionSummary` + `getSessionGoalSummary` | summary gated | read |

**21e — complete workout**

| Method + path | Wraps | Capability | Idempotency |
|---|---|---|---|
| `PUT /workouts/{id}/gym` | `changeGym` | — | absolute value |
| `GET /logged-exercises/{id}/swap-candidates?muscle=` | `getSwapContext` | — | read |
| `PUT /logged-exercises/{id}/exercise` | `swapExercise` + status guard | — | absolute value |
| `PUT /logged-exercises/{id}/skipped` | `setExerciseSkipped` (keep the existing timestamp) | — | absolute value |
| `PATCH /sets/{loggedSetId}` | `editLoggedSet` + reconcile | — | absolute value |
| `PATCH /logged-exercises/{id}/planned-sets` | `editPlannedSets` + reconcile | — | absolute value |
| `PUT /mesocycles/{id}/missed-days/{date}` | `resolveMissedDay` + validation; same-outcome replay → 200 | — | natural key |
| `PUT /mesocycles/{id}/cardio-logs/{date}` | `logCardio` | — | already idempotent |
| `PATCH /cardio-logs/{id}` | `editCardioLog` | — | absolute value |

**21f — plans, library, gyms**

| Method + path | Wraps | Capability | Idempotency |
|---|---|---|---|
| `GET /mesocycles`, `GET /mesocycles/{id}?week=`, `GET /mesocycles/{id}/sessions/{sid}` | `listMesocyclesForHome`, `getMesocycleWeek`, `getSessionDetail` | — | read |
| `GET /exercises?view&muscle&q`, `GET /exercises/{id}` | `listExercises`; `getExercise` + `getExerciseGoals` (reconcile first) | — | read |
| `POST /exercises` | `createCustomExercise` | — | **Idempotency-Key** |
| `PUT /exercises/{id}/favorite`, `POST /exercises/{id}/archive`, `POST /exercises/{id}/restore` | `exercises.ts` | — | already idempotent |
| `POST /gyms`, `POST /gyms/{id}/archive`, `POST /gyms/{id}/restore` | `gyms.ts` | — | create needs an **Idempotency-Key**; the others are idempotent |

**21g — goals and insights**

| Method + path | Wraps | Capability | Idempotency |
|---|---|---|---|
| `GET /goals`, `GET /goals/history`, `GET /goals/{id}`, `GET /goals/form-context` | reconcile, then the goal queries | Free | read |
| `POST /goals` | `createGoal` | Free | **Idempotency-Key** (F-T7) |
| `POST /goals/{id}/archive`, `POST /goals/{id}/acknowledge` | `archiveGoal`, `acknowledgeGoalCompletion` | Free | conditional update |
| `GET /exercises/{id}/history?scope&all` | `getExerciseHistory` (never `getExerciseProgression`) | `gateHistory` capabilities | read |

**21h — account and settings**

| Method + path | Wraps | Capability | Idempotency |
|---|---|---|---|
| `GET /me/profile`, `PUT /me/profile`, `PUT /me/appearance` | `accounts/profile.ts`, `accounts/appearance.ts` | — | full replace |
| `POST /me/email-verification` | `sendVerificationEmail` with injected deps | — | Idempotency-Key, or treat the OTP rate limit as "already sent" |
| `POST /me/tour/offered`, `PUT /me/tour/outcome` | `tour/progress.ts` | — | idempotent |
| `GET /release-notes`, `POST /me/release-notes/seen`, `POST /me/trial-notice/shown` | catalog + `release-notes/seen.ts`, `billing/trial-notice.ts` | — | idempotent |
| `POST /feedback` (multipart) | extracted `submitFeedbackWithScreenshots` | — | **Idempotency-Key** |
| `GET /me/export`, `GET /me/deletion-inventory` | `buildAccountExport`, `accountInventory` | — | read |
| `POST /me/delete` | `verifyCurrentPassword(tokenEmail)` + `deleteAccount` + the Stripe decision (F-A2) | — | effectively idempotent; 401 after removal = done |
| `GET /me/plan` | `getBillingScreen(account,{inAppShell:true})`, projected read-only (no prices, no `canSubscribe`, no promo) | — | read |

**Not exposed to mobile:** checkout, portal, checkout outcome, admin, webhook, signup, recovery, plan import, and plan-builder writes. A light-edit exception for 21f is optional; see section 9.

**Idempotency storage:** create endpoints need a new owned table keyed `(userId, key)`. It needs RLS, scope-layer coverage and isolation-suite coverage. Do not use client-supplied primary keys instead: a unique violation on another account's known id would reveal that the row exists.

---

## 3. Authentication and session

### How it works today

| Concern | Implementation |
|---|---|
| Sign-in | Email and password. `login/actions.ts:signInAction` calls `signInWithPassword` on the cookie client (`lib/supabase/server.ts:11`), and `classifySignInError` maps the error. There is no app-level throttle. Suspension is not checked at sign-in; the next request redirects to `/suspended`. |
| Signup | `lib/accounts/signup.ts:signUp`, in this order: mode gate → constant-time invite check (`signup-gate.ts:46`) → DB throttle (10/min per IP fingerprint, `throttle.ts`, fails closed) → Turnstile (`turnstile.ts:54`) → validation → username check → service-role `createConfirmedUser` (`supabase/admin.ts:36`) → cookie sign-in → `establishProfile` (profile, tour due, release notes caught up, 14-day trial). Failure after the user exists deletes the auth user. Supabase public signup is off (`supabase/config.toml:39`). |
| Signup mode | `OVERLOAD_SIGNUP_MODE` = `closed`, `invite` or `public` (deprecated alias `OVERLOAD_SIGNUP_OPEN`; unset means closed). The invite code is `OVERLOAD_INVITE_CODE`. Both are server-only. |
| Email verification | Settings → `signInWithOtp` magic link → `/auth/confirm` (`verifyOtp`, cookie) → `/verify-email` → `confirmEmailVerification()` sets `Profile.emailVerifiedAt`. It gates the first checkout only. See F-A1. |
| Recovery | `requestPasswordReset` (same response for known and unknown emails; Turnstile; throttle) → email → `/auth/confirm` → `/reset-password` (`getClaims` amr is otp or recovery, within 30 min) → `updateUser` → global sign-out. |
| Suspension | `Profile.status`, checked by `requireAccount()` (`data/account.ts:261`) on every page and action. Refresh tokens are not revoked; access is refused on each request. |
| Sessions | `@supabase/ssr` cookies. `src/proxy.ts` refreshes the session and calls `getUser()` on matched requests. Its redirects (`auth-routes.ts:104`) are optimistic; `requireAccount` and `requireAdmin` are the authoritative checks. JWT expiry is 3,600 s. |
| Admin | The `OVERLOAD_ADMIN_USER_IDS` allowlist, checked in the proxy and in `requireAdmin()` (`data/admin/identity.ts:52`). |

### What mobile needs

| Need | Recommendation |
|---|---|
| Getting a token | `@supabase/supabase-js` with the anon key and `signInWithPassword`. Public signup is off in Supabase, so the anon key cannot create accounts. |
| Verifying it on the server | `requireAccountFromToken` via `getUser(token)` (section 2). |
| **Proxy** | **Blocker for 21b.** Add `/api/mobile` to `PUBLIC_PATHS` (`auth-routes.ts:55-61`) or exclude it from the matcher (`proxy.ts:103`). Otherwise every cookie-less bearer request gets a 307 to `/login`. |
| Secure storage | `expo-secure-store` as the supabase-js storage adapter, chunked because SecureStore limits value size. `persistSession: true`, `detectSessionInUrl: false`. |
| Refresh | `autoRefreshToken`. Start and stop it on AppState foreground and background changes. The API client retries once on 401 after `refreshSession()`; a failed refresh returns to sign-in. |
| Sign-out | The client calls `signOut({scope:"local"})`. **The web's `signOutAction` (`login/actions.ts:51`) uses the default global scope**, so a web sign-out would end the phone's session. Change it to local, or record that the cross-device sign-out is intended. |
| Per-request status | No or invalid token → 401 `unauthorized`. Suspended → 403 `account_suspended`. Deleted → 401. |
| Version gate | Nothing exists today. Add `GET /app-config` and the `X-Overload-App-Version` → 426 check. |
| Things a handler must never use | `redirect()`, `notFound()`, `refresh()`, or FormData form-state. |

### Cookie and `next/headers` coupling, and whether each needs a token twin

| Location | Twin needed? |
|---|---|
| `lib/supabase/server.ts:2,12-34` (`cookies()` + `createServerClient`) | **Yes.** A cookie-less token client. |
| `lib/auth.ts:14-41` (`getAuthUser`, `requireUser`, `currentUser`) | **Yes.** `getUserFromToken`. |
| `lib/data/account.ts:253-264` (`requireAccount`) | **Yes.** `requireAccountFromToken`, the core of 21b. |
| `lib/data/account.ts:271-279` (`getAccessState`) | Fold into `/me`. |
| `lib/accounts/verification.ts:118` (`headers()` host), `:133-150` (cookie client and email) | **Yes.** Inject the dependencies. |
| `app/(app)/settings/delete-account/actions.ts:33,60` | **Yes.** Email from the token; no cookie sign-out. |
| `app/(app)/settings/export/route.ts:29` | **Yes.** Swap the auth line. |
| `app/(app)/settings/page.tsx:24` (`requireUser` for the email) | Covered by `/me`. |
| `proxy.ts:24-47` | No. Exclude `/api/mobile`. |
| `lib/data/admin/identity.ts:53,63`; `lib/billing/checkout.ts:41-42`; `lib/platform/request.ts:2,6-7`; `(app)/layout.tsx:31,41`; `settings/billing/page.tsx:27` | No (web-only, or composed by `/me`). |
| `login/actions.ts`, `signup/actions.ts:15-24`, `forgot-password/actions.ts:14-23`, `auth/confirm/route.ts:69`, `reset-password/page.tsx:24`, `verify-email/page.tsx:36`, `support`, `suspended`, `marketing/context.ts:23`, `data/admin/reset-email.ts:54`, `accounts/recovery.ts:113`, `accounts/signup.ts:108-119` | No. These are web-only, or replaced by client-side supabase-js. |

### Signup, recovery, Turnstile and Apple deletion

- **Signup and password recovery stay web-only at first.**
  - The app links out (`expo-web-browser`) and the lifter then signs in natively. This keeps the invite gate and Turnstile unchanged.
  - Turnstile has no native SDK. A native signup would need a WebView widget or App Attest / DeviceCheck, and either is new infrastructure that needs a pitch.
  - The throttle keys on `x-forwarded-for`. Behind carrier NAT, many phones share one IP.
- **Recovery ends with a global sign-out** (`recovery.ts:276`). The app must handle the refresh failure that follows.
- **Apple guideline 5.1.1(v), in-app deletion:**
  - `deleteAccount` (`accounts/deletion.ts:109`) already removes every owned model in one transaction, then Storage objects, then the auth identity.
  - Wrapping it in `POST /me/delete` with a password re-check meets the guideline. Two gaps remain: it does **not cancel a Stripe subscription** (F-A2), and **a suspended account cannot export or delete** (F-A7).

---

## 4. Shared code candidates

### Ground rules

- **What counts as shareable:** the file and everything it imports is free of `server-only`, `@/lib/db`, `next/*`, `react`, `@supabase/*`, `node:*`, `@prisma/client` values, the DOM, and server `process.env`.
- **`Intl` is noted, not blocking.** Hermes supports `Intl.DateTimeFormat` with `timeZone` and `formatToParts`, but that is **unverified on a device**.
- **No workspace exists yet.** There is no `workspaces` key, no `packages/` or `apps/`. The `@/*` alias maps to `./src/*`.

### Move as-is

| File | What it is |
|---|---|
| `lib/progression/e1rm.ts` | The one Epley `estimateOneRepMax`, plus `loadedSets`, `bestWorkingSet`, `sessionE1rm` |
| `lib/progression/config.ts` | Progression constants |
| `lib/progression/deload.ts` | `isScheduledDeloadWeek`, `scheduledDeloadLoad` |
| `lib/progression/engine.ts` | The reactive engine. Shared so the server and tests use one copy. **The app gets calls from the API and does not run the engine itself.** |
| `lib/progression/types.ts`, `history.ts` | Tags, evidence, recommendation types; history projections |
| `lib/progression/recommendation.ts` | The one source of recommendation wording (`process.env.NODE_ENV` at `:129` is inlined by Babel) |
| `lib/logging/rir.ts`, `set-entry.ts`, `schedule.ts` | RIR scale; logging-card rules; effective schedule and missed-day derivation |
| `lib/plan/rep-target.ts`, `calendar.ts`, `presets.ts`, `weekday-names.ts`, `validation.ts`, `readiness.ts` | Rep targets; week math and `todayIso`/`isoDateInZone` (Intl); presets; plan parsers |
| `lib/cardio/validation.ts`, `schedule.ts` | Cardio parsers and occurrences |
| `lib/exercises/taxonomy.ts`, `gym-variable.ts`, `loading-mode.ts` | Muscle and equipment taxonomy (with a parity test); `isGymVariable`; loading mode |
| `lib/goals/progress.ts`, `dashboard.ts` | Goal progress through `estimateOneRepMax`; `dashboardShowsGoals` |
| `lib/accounts/validation.ts`, `auth-errors.ts` | Account field rules; sign-in error classification (also needed by native sign-in) |
| `lib/feedback/validation.ts`, `attachment-validation.ts` | Categories, limits, attachment rules |
| `lib/release-notes/types.ts`, `entries.ts`, `catalog.ts` | Release-note content (consider a per-entry `platforms` field) |
| `lib/appearance/appearance.ts`, `choices.ts` | `APPEARANCES`, `THEME_COLORS`; "last tap wins" ordering |

### Move after splitting

| File | What to split |
|---|---|
| `lib/actions/result.ts` | Share `ErrorCode`, `ActionError`, `ActionResult` and `isUuid` as the seed of the API error contract. Keep `toActionResult` and `DomainError` on the server. |
| `lib/billing/config.ts` | Share Plan, Capability, `PLAN_CAPABILITIES`, trial and grace days. Keep `isCheckoutEnabled()` (server env, `:81`) and `UPGRADE_HREF` on the web. |
| `lib/entitlements/types.ts`, `lib/progression/history-types.ts` | Movable once `billing/config` is split. |
| `lib/progression/history-format.ts` | Share the formatters. Keep `exerciseHistoryHref` (`:66`, a web URL) on the web. |
| `lib/exercises/validation.ts`, `goals/validation.ts`, `gyms/validation.ts` | Share the parsers. Keep the FormData adapters (`:87`, `:69`, `:41`) on the web. |
| `lib/exercises/images.ts` | Share the builder that takes a base URL. Keep the `NEXT_PUBLIC_SUPABASE_URL` default on the web. |
| `lib/tour/steps.ts`, `tour/engine.ts` | Share step id, title, body and order. Routes, DOM anchors, media queries and pixel placement stay on the web; mobile gets its own anchor map. |
| `lib/personalization/greeting.ts` | It needs `DashboardDto` from a server-only module. Better: build the greeting on the server and return it from `/today`. |
| **DTO types (about 50)** in `lib/{logging,plan,progression,cardio,exercises}/queries.ts`, `lib/billing/screen.ts`, `lib/accounts/deletion.ts` | Move them to shared contracts, with `Date` fields as ISO strings. **They are the API's response types**, and today they sit inside `server-only` files. |
| `logged-sets.ts:76,87` input limits (9999.99, 1000) | Turn them into named shared validation, so mobile pre-validates with the same rules. |

### Looks shareable but isn't

| File | Why not |
|---|---|
| `lib/data/scope.ts` | No `server-only` marker, but it uses the Prisma runtime (`Prisma.dmmf`, `:38-41`). |
| `lib/entitlements/resolve.ts`, `gate.ts` | Enforcement, so it must stay on the server. `resolve.ts` also uses React `cache` and Prisma types. |
| `lib/billing/trial-notice-phase.ts`, `checkout-return.ts` | Prisma types; `sessionStorage`; billing is web-only. |
| `lib/admin/types.ts` | `CompReason` from `@prisma/client`; admin is web-only. |
| `lib/gyms/baselines.ts` | `medianWeight` and the threshold look pure, but they run on `Prisma.Decimal` in a server-only module. |
| `lib/logging/logged-sets.ts`, `goals/goals.ts` | `Prisma.Decimal` values; server-only. |
| `lib/tour/dom.ts`, `appearance/apply.ts`, `appearance/boot-script.ts`, `accounts/use-device-time-zone.ts` | DOM, `localStorage`, React hook. Mobile uses expo-localization. |
| `lib/accounts/support-email.ts`, `admin/allowlist.ts`, `marketing/site.ts`, `import/config.ts` | `process.env`, `next`. |
| `lib/import/*` pure parts (zod schemas, matcher, draft types) | Framework-free, but plan import is web-only for the beta. |

### Prisma enums and zod

- **No pure module imports a Prisma runtime value.** But React Native cannot depend on `@prisma/client` at all, and the code already mirrors enums by hand:

  | Mirror | Location | Parity test? |
  |---|---|---|
  | MuscleGroup, Equipment | `taxonomy.ts` | yes (`tests/unit/taxonomy.test.ts`) |
  | Appearance | `appearance.ts` | no |
  | FeedbackCategory | `feedback/validation.ts` | no |
  | SplitType | `presets.ts` | no |
  | `MesocycleStatusValue` | `plan/queries.ts:24`, `data/locks.ts:14` | no |
  | MissedDayOutcome, LoggedSessionStatus | `logging/schedule.ts:26,31,52-53`, `logging/queries.ts:56` | no |
  | `DashboardKind` | `goals/dashboard.ts:8` | no |

  **Recommendation:**
  - In the shared package, define each enum once as an `as const` tuple plus a union (optionally `z.enum`).
  - Add one parity test in the web workspace that compares every tuple with `Prisma.$Enums`.
  - Ban `@prisma/client` in the shared package with an ESLint import rule.
- **zod 4.6.5 is used only in `lib/import/extraction/{schema,wire}.ts`.** Every other validator is a hand-written, framework-free parser that returns `{ok, value} | {ok:false, details}`. For API request bodies, either wrap the existing parsers (keeps error messages identical) or write zod 4 schemas over the same named limits. Never keep two sets of rules.

---

## 5. Data model

### Migrations and protection

- **24 migrations**, from `0_init` to `9n_trial_notices`.
- **RLS is enabled on all 29 tables plus `_prisma_migrations`.** No `CREATE POLICY`, `DISABLE` or `FORCE` appears anywhere, and **no table is missing RLS**.
- `9_account_ownership_2_enforce` and later migrations also install three database triggers:
  - same-owner on every owned parent reference (library exercises allowed);
  - userId-never-changes on every table with `user_id`;
  - append-only on `admin_audit_entries`.

### Models

| Model | Owned / shared | Key fields | onDelete in the logged chain | Soft delete | Notes |
|---|---|---|---|---|---|
| Profile | Owned (PK `userId`) | names, `username` (global unique), timeZone, appearance, status, lastActiveOn, emailVerifiedAt, signupCampaign, trial-notice stamps | parent, `Restrict` | status = suspended | |
| Mesocycle | Owned | lengthWeeks, `deloadEveryWeeks` (column `deload_week`), splitType, status, startDate | LoggedSession, MissedDay, PlannedCardio, CardioLog `Restrict`; Session **Cascade** | — | partial unique: one active per user (SQL only) |
| Session | Owned via parent | name, dayOfWeek?, position | LoggedSession → Session `Restrict` | — | `@@unique(mesocycleId, dayOfWeek)` |
| SessionExercise | Owned via parent | plannedSets, targetRepMin/Max | Exercise `Restrict`; LoggedExercise → SessionExercise **SetNull** | — | `@@unique(sessionId, exerciseId)` |
| Exercise | **Shared** library (userId null) or owned custom | name, primaryMuscle, secondaryMuscles[], equipmentType, imageRef, isCustom, sourceId, **isFavorite (dead)** | `Restrict` from SessionExercise, LoggedExercise (performed and planned), Baseline, Goal, Favorite | `deletedAt` | CHECK custom ⇔ owned |
| ExerciseFavorite | Owned | PK (userId, exerciseId) | `Restrict` | — | replaces `Exercise.isFavorite` |
| Gym | Owned | name, address | `Restrict` from LoggedExercise, Baseline, Goal | `deletedAt` | |
| GymExerciseBaseline | Owned via gym | `weightLbs Decimal(6,2)` | `Restrict` | — | `@@unique(gymId, exerciseId)` |
| LoggedSession | Owned | mesocycleId?, sessionId?, performedOn, scheduledFor, status, completedAt | `Restrict` | — | `@@unique(sessionId, scheduledFor)` is the retry key. Rows with a NULL `sessionId` are unconstrained. |
| LoggedExercise | Owned | exerciseId (performed), plannedExerciseId (fixed), sessionExerciseId?, gymId?, plan snapshot, skippedAt | `Restrict`; SessionExercise SetNull | — | |
| LoggedSet | Owned | setNumber, `weightLbs Decimal(6,2)?` (null = bodyweight), reps, rir? | `Restrict` | — | `@@unique(loggedExerciseId, setNumber)` |
| MissedDayResolution | Owned | missedOn, outcome | `Restrict`; Session SetNull | — | `@@unique(mesocycleId, missedOn)` |
| Goal | Owned | gymId?, `targetWeightLbs`, targetReps, status, archiveReason, completionAcknowledgedAt | `Restrict` | archived | partial unique: one active per (user, exercise) (SQL only) |
| PlannedCardio, CardioLog | Owned | type, durationMin; CardioLog snapshots the plan | `Restrict` | — | unique `(mesocycleId, dayOfWeek)` and `(mesocycleId, scheduledFor)` |
| TourProgress, ReleaseSeen | Owned (PK userId) | outcome / lastSeenReleaseId | — | — | |
| Entitlement | Owned | source (**trial or comp only**), plan (default pro), window, comp fields | — | revokedAt | partial uniques: one trial, one active comp |
| BillingAccount, PromoRedemption | Owned | Stripe mirror; redemptions | — | — | |
| WebhookEvent | Global | Stripe event id | — | — | replay guard |
| Feedback, FeedbackAttachment | Owned | category, message; object path | `Restrict` | — | |
| AdminAuditEntry | Global, no FK | actor, target, kind, detail | — | append-only | survives account deletion by design |
| AuthThrottle | Global | keyHash, action (`signup`, `password_reset_request`), window | — | — | |
| ImportSession, ImportSourcePart, ImportUsageDay | Owned | 13-state status, lease, draft JSON; parts; daily count | `Restrict` | `purged` status | |
| ImportSpendLedger | Global | monthly micros | — | — | |

**Uniqueness:**
- These include `userId`: one active mesocycle, one active goal per exercise, PromoRedemption, ImportUsageDay, ExerciseFavorite, and the entitlement uniques.
- These are keyed on an owned parent and protected by the same-owner trigger: Session, SessionExercise, Baseline, LoggedSession, LoggedSet, MissedDay, PlannedCardio, CardioLog, ImportSourcePart.
- These are deliberately global: `Exercise.sourceId`, `Profile.username`, and the Stripe ids.

### What mobile needs that is not modelled or exposed today

1. **An API surface.** The only route handlers are the webhook, `/auth/confirm` and export.
2. **The bearer-token auth path** (section 3).
3. **Idempotency.** Natural keys already cover LoggedSet, start-workout, CardioLog and edits. These are **not** retry-safe: goal, custom exercise, gym, mesocycle and feedback creates, `completeWorkout`, and the missed-day resolve. They need an idempotency-key table.
4. **App config.** Minimum and latest version and kill switches; environment variables are enough.
5. **API rate-limit storage.** `AuthThrottle` allows only two actions. Extend it, or add a table; no cache layer is allowed.
6. **Optimistic concurrency.** There is no per-row version or ETag, so edits are last-write-wins. That is acceptable online-only, but worth knowing for two-device editing.
7. **A platform signal.** `lib/platform/app-shell.ts` detects a Capacitor user agent (`OverloadApp/`), which no longer matches the plan. Use the version header instead.
8. **Push or device tokens, and a units preference.** Neither exists, and neither is needed for the beta.

### Fields whose meaning is unclear from the code

| Field | Reading |
|---|---|
| `Mesocycle.deloadEveryWeeks` → column `deload_week` | The code uses a cadence (every Nth week). `.claude/CLAUDE.md` and `architecture.md` say "designated week". |
| `Exercise.isFavorite` | Deprecated and never read (`schema.prisma:215-217`). It is a global flag on shared rows, so any future use would leak across accounts. |
| `LoggedExercise.exerciseId` / `plannedExerciseId` / `sessionExerciseId` | Performed exercise / planned snapshot / live template link (SetNull). |
| `LoggedSession.performedOn` / `scheduledFor` / `completedAt`; nullable `mesocycleId` and `sessionId` | Started / occurrence date (the retry key) / finished. The null case has no current writer; probably reserved for wing-it workouts. |
| `Entitlement.plan` defaults to `pro`; `EntitlementSource` has no `subscription` | Subscription Pro comes from `BillingAccount`. `entitlements/types.ts` adds a `"subscription"` kind on top. |

### Weights and units

- **Everything is in pounds**: `weightLbs` and `targetWeightLbs` as `Decimal(6,2)`, max 9999.99.
- Queries convert with `Number(...)` before building DTOs, so **no `Decimal` reaches the client**.
- There is no kg support and no unit preference.
- Mobile sends pounds with at most two decimal places. **No server check enforces that precision** (F-D3).

---

## 6. Design system to port

**The web system:**
- Tailwind v4 (`@tailwindcss/postcss`, no `tailwind.config`; tokens declared in CSS with `@theme inline`), with `tw-animate-css`.
- shadcn new-york style, neutral base, lucide icons (`components.json`), built on Radix (`radix-ui` 1.7).
- `cn` in `src/lib/utils.ts`.

### Colors (`src/app/globals.css`)

| Token | Light | Dark |
|---|---|---|
| background | `#f7f7f8` | `#0b0b0c` |
| foreground | `#0e0e10` | `#f2f2f3` |
| card / card-fg | `#ffffff` / `#0e0e10` | `#141416` / `#f2f2f3` |
| popover | `#ffffff` | `#1c1c1f` |
| primary / primary-fg | `#0159fd` / `#ffffff` | `#1a66ff` / `#ffffff` |
| secondary, muted, accent | `#ececed` | `#1c1c1f` |
| muted-foreground | `#5f5f68` | `#a1a1a8` |
| destructive / fg | `#b42318` / `#ffffff` | `#e5484d` / `#0b0b0c` |
| border, input | `#e4e4e8` | `#26262a` |
| ring | `#0159fd` | `#2f7bff` |
| progress (status) | `#2f9e6b` | `#4cc38a` |
| deload (status, also "stalled") | `#b7791f` | `#e0a93b` |

**How colors are used:**
- Status tags are `bg-<status>/10` with `text-<status>`.
- Overlays are `bg-black/50`.
- The dark block is written twice: once for `.dark` and once in the media query.
- `THEME_COLORS` in `lib/appearance/appearance.ts` holds a third copy of the backgrounds.

### Type, spacing and icons

| Area | What the web uses |
|---|---|
| Font | Inter via `next/font/google`. Vendored variable font at `docs/pitches/_shared-assets/fonts/inter-latin-variable.woff2` (OFL); Expo can load it. |
| Weights | 400, 500 and 600 only (`font-medium` 178 uses, `font-semibold` 98, `font-bold` 0). |
| Sizes in use | `text-sm` 377 uses, `text-xs` 166, `text-lg` 50, `text-base` 48, `text-xl` 18 (page h1), `text-2xl` 12. Larger sizes are mostly on the landing page. |
| Numerals | `tabular-nums` on all numbers. |
| Radius | `--radius: 0.5rem`, giving sm 4, md 6, lg 8, xl 12. Cards are `rounded-lg border bg-card p-6`. |
| Control heights | Button 40 (sm 36, lg 44). Input 40. Touch targets 44. |
| Elevation | Shadows are rare and mostly on overlays. |
| Icons | `lucide-react` in 86 files, 49 distinct icons. Nav icons are in `shell/nav-items.ts`. Native uses `lucide-react-native` with the same names. |
| Chart | One in-app chart: `components/exercises/history/trend-chart.tsx` (Recharts `LineChart`; muted 11px axes, primary series, muted secondary series, custom dots). `landing/trend-reveal-chart.tsx` is marketing only. Goal progress is a CSS bar. |
| Toasts | Sonner (`components/ui/sonner.tsx`), about 27 call sites. The archive undo in `archive/archive-dialog.tsx` is the **only** way to restore an archived gym or exercise. |
| Appearance | `Profile.appearance` (system, light or dark). A boot script plus `localStorage` and `shell/appearance-sync.tsx`; `createChoiceTracker` orders saves. Native: `useColorScheme()` overridden by the profile value. |

### Tokens to share as plain TypeScript

| Group | Contents | Source |
|---|---|---|
| `colors.light`, `colors.dark` | The 21 semantic tokens above | `globals.css:34-92` |
| `status` | progress, deload | same |
| `radius` | `{sm:4, md:6, lg:8, xl:12}` | `--radius` |
| `font` | Inter; weights 400, 500, 600; sizes xs 12/16, sm 14/20, base 16/24, lg 18/28, xl 20/28, 2xl 24/32 | layout and usage |
| `controlHeight` | sm 36, md 40, lg 44; touch minimum 44 | `button.tsx`, `input.tsx` |
| `overlay` | `rgba(0,0,0,0.5)` | ui overlays |
| `chart` | grid = border, axis = muted-fg 11, series = primary, secondary = muted-fg | `trend-chart.tsx` |
| Copy and data | `APPEARANCES`, `MUSCLE_GROUP_LABELS`, tour step copy, release-note catalog, `PRO_HIGHLIGHTS` | lib |

The web would then generate its CSS variables from the shared tokens, or a parity test would check them. Either removes the three copies.

### Web components and their native patterns

| Web component | Native pattern |
|---|---|
| `shell/app-nav.tsx`, `mobile-nav.tsx`, `nav-more-group.tsx`, `nav-items.ts` | Bottom tab bar (Today, Plan, History, Goals, More) with a stack per tab |
| `shell/account-menu.tsx`, `account-footer.tsx` | More tab as a grouped list |
| `logging/exercise-card.tsx` | Custom set-entry rows, decimal and number keypads, keyboard avoidance, haptic on log |
| `logging/workout-runner.tsx` | Pager or stack; system alert to finish; success haptic |
| `logging/rir-picker.tsx` | Segmented control |
| `logging/gym-picker.tsx`, `progression/gym-selector.tsx` | Native picker or action sheet |
| `logging/swap-picker.tsx` | Bottom sheet with search and a grouped list; muscle filter |
| `logging/missed-day-prompt.tsx` | Inline card plus an action sheet |
| `logging/edit-set-dialog.tsx`, `edit-planned-sets-dialog.tsx`, `cardio/cardio-log-dialog.tsx` | Bottom-sheet form |
| `archive/archive-dialog.tsx`, `goals/archive-goal-button.tsx`, `plan/lifecycle-controls.tsx` | System alert plus an undo banner |
| `gyms/gym-row-menu.tsx`, `plan/session-controls.tsx` | Action sheet or context menu; swipe actions |
| `exercises/library-controls.tsx` | Header search bar, filter chips, paginated `FlatList` |
| `exercises/exercise-thumb.tsx` | Cached image or monogram tile |
| `exercises/history/exercise-trend.tsx` + `trend-chart.tsx` | Segmented control plus one native line chart (library chosen in 21c or 21g) |
| `goals/goal-progress-bar.tsx` | Native progress bar |
| `goals/goal-target-form.tsx`, `exercises/custom-exercise-form.tsx`, `gyms/gym-form.tsx` | Stack form screen with native pickers |
| `settings/profile-form.tsx`, `appearance-setting.tsx` | Grouped settings list; timezone picker; checkmark list |
| `settings/data-export-section.tsx` | Download, then share sheet |
| `settings/delete-account-form.tsx` | Stack screen with password confirmation |
| `tour/tour-provider.tsx` + `tour-overlay.tsx` | Native coach marks anchored by refs |
| `release-notes/whats-new-dialog.tsx`, `billing/trial-notice-dialog.tsx` | Modal sheet |
| `billing/upgrade-note.tsx` | Inline dismissible row (no purchase link); dismissal persisted on the device |
| `ui/sonner.tsx`, `feedback/created-toast.tsx` | Inline banner or haptic |
| `ui/skeleton.tsx` + 27 `loading.tsx` | Skeletons shaped like the content |
| `feedback/empty-state.tsx`, `(app)/error.tsx` | Shared empty state; error with retry; unreachable (offline) state |
| `send-feedback/screenshot-picker.tsx` | `expo-image-picker` |
| `auth/bot-challenge.tsx` | None (signup stays on the web) |
| `brand/overload-lockup.tsx` | Image asset plus an Inter wordmark; app icon |

---

## 7. Tests and quality gates

### Baseline (run on the audited commit, 2026-11-11)

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | **pass** (exit 0) |
| Typecheck | `npm run typecheck` | **pass** (exit 0) |
| Unit tests | `npm test` | **pass**: 129 suites, 2,201 tests, about 9 s |
| Integration tests | `npm run test:integration` | not run for this audit |
| End-to-end | `npm run test:e2e`, `npm run test:e2e:accounts` | not run for this audit |
| Format | `npm run format:check` | not run for this audit |
| Build and client-bundle scan | `npm run build && npm run verify:client-bundle` | not run for this audit |

### Inventory

| Layer | Location | Size | Runner | What it covers |
|---|---|---|---|---|
| Unit | `tests/unit/*.test.ts(x)` | 129 files | Jest + ts-jest, `jest.config.js`; `server-only` stubbed; no database, no network | Pure training logic (progression engine, e1RM, deload, RIR, schedule, set entry, rep targets); validation; action wrappers with injected deps (`accounts-verification`, `accounts-deletion`, `billing-checkout`, `stripe-webhook-route`, `login-actions`); UI components with Testing Library; **static guards** (below) |
| Integration | `tests/integration/*.int.test.ts` | 67 suites + `isolation/` (18 suites) | Jest, `jest.integration.config.js`, serial (`maxWorkers: 1`) | Lib modules against a real Postgres. `globalSetup` provisions an **embedded throwaway Postgres** when `TEST_DATABASE_URL` is unset and runs `prisma migrate deploy` on it. `@/lib/db` is remapped to `tests/integration/support/app-db.ts`, and `assert-test-db.ts` refuses any Supabase URL. So the suite needs no network or hosted database. |
| Isolation | `tests/integration/isolation/` | 18 suites, `coverage.ts`, `fixtures.ts`, `support.ts` | integration runner | Cross-account isolation per owned model and per read and write path |
| E2E (unauthenticated) | `e2e/*.spec.ts` | 5 specs | Playwright, `playwright.config.ts`; production build on port 3100 with dummy Supabase values and an unroutable database | Auth redirect, absence of a registration surface, basic page loads |
| E2E (accounts) | `e2e/accounts/*.spec.ts` | 12 specs | `playwright.accounts.config.ts`; **needs the local Supabase CLI stack (Docker)** and refuses anything but 127.0.0.1 | Signup, sign-in and out, two-account isolation, deletion, recovery, tour, What's New, feedback, logging and RIR, exercise history |

### Standing guards

| Guard | File | What it enforces |
|---|---|---|
| Account-scoped access is the only door | `tests/unit/account-isolation-guards.test.ts` | Only `src/lib/data`, `src/lib/db.ts` and three sanctioned modules (`accounts/throttle.ts`, `import/usage.ts`, `import/spend.ts`) import the raw Prisma client or use raw SQL. Application code never builds an `Account` for an arbitrary id (`createAccountClient`, `resolveAccount(State)`, `touchLastActive`, `@/lib/data/operator`). Outside the data layer, `userId` appears only as `account.userId`. Server actions name no `accountId`, `ownerId` or `tenantId`. The Supabase client never queries an application table. The ESLint exemptions match the sanctioned list exactly. |
| Logged-history and progression invariants | `tests/unit/invariant-guards.test.ts` | No `LoggedSet` write outside `lib/logging/logged-sets.ts`. Deletion goes only through the scoped client in one transaction. No code outside the deletion module deletes a Profile or a logged-history row. No stored tag, e1RM or recommendation column. Exactly one `estimateOneRepMax`. Progression modules never write. No cron, scheduler or queue dependency. Exercise and Gym are never hard-deleted. Secret hygiene in source and `.env.example`. |
| Isolation coverage registry | `tests/integration/isolation/coverage.ts` (`ISOLATION_COVERAGE`) | A meta-test fails when the schema gains an owned model that is missing from the registry, so every new owned model must arrive with its isolation suite. |
| RLS posture | `tests/integration/rls.int.test.ts` | RLS on every public table including `_prisma_migrations`; zero policies; the anon role cannot run the classification helper; the anon role reads no rows even when rows exist. |
| Client-bundle secret scan | `scripts/check-client-bundle.mjs` (`npm run verify:client-bundle`, after `next build`) | Scans `.next/static` for forbidden names (`DATABASE_URL`, `DIRECT_URL`, `service_role`, signup mode, invite code, admin ids, Turnstile secret, the import provider key) and for the actual values of the database and service-role variables when they are set. |
| Operator target guard | `tests/unit/operator-target-guards.test.ts` | Every operator script that opens a connection goes through `scripts/operator/target-identity.ts` and checks the dev identity marker. |
| Deployment guard | `tests/unit/deployment-guard.test.ts` | A Preview or Development deployment that names the Production ref fails. |
| Enum parity | `tests/unit/taxonomy.test.ts` | Muscle and equipment unions match the Prisma enums. No other enum mirror has a parity test (D-6). |

### CI: there is none

- There is no `.github/` directory, no Husky, and no git hooks (`.git/hooks` holds only samples).
- The guard file says this outright: "the repository has no separate CI service; lint + unit tests are the per-commit gate."
- The only automated check on a push is Vercel's `next build`, which runs the deployment guard from `next.config.ts`. **Integration, end-to-end, format and the client-bundle scan run only when an agent or the owner runs them.**
- A PR is "green" only in the sense that the Vercel preview built. **A PR can merge with failing tests.** This matters more once the mobile API exists, because its isolation coverage then becomes the main protection against cross-account leaks.

### Extending the isolation suite to mobile API endpoints

1. **Give the token verifier a seam.** `requireAccountFromToken(request, { getUser })` takes an injectable verifier. In tests, the verifier maps an opaque test token to a `createTestAccount` user id, and Supabase is never called.
2. **Call route handlers directly.** Import the handler's `GET`, `POST` or `PUT` and pass a `new Request(url, { headers: { authorization: "Bearer <B's token>" }, body })`. Assert on status and JSON. Add one `tests/integration/isolation/mobile-api.int.test.ts` that, for each endpoint:
   - B reading A's resource by id → 404 with the same body as a truly missing id;
   - B listing → none of A's rows;
   - B writing to A's id → 404 and A's row byte-identical (the existing `snapshotAccount` helper);
   - no token, a bad token, and a suspended account → 401, 401 and 403;
   - a Free account on a gated endpoint → Pro fields withheld and `locked` set.
3. **Add an endpoint coverage registry**, like `ISOLATION_COVERAGE`. A meta-test walks `src/app/api/mobile/**/route.ts`, lists every exported method, and fails when a method has no isolation case.
4. **Extend the static guards to route handlers.** The "accept no account id" check scans only `"use server"` files today. Add a guard that every `route.ts` under `api/mobile` calls `requireAccountFromToken` (or is on a small public list: `app-config`), and never reads `userId`, `accountId` or `ownerId` from `params`, `searchParams` or the body.
5. **Idempotency.** Once the idempotency table exists, `coverage.ts` picks it up automatically as an owned model. Add a case where B replays A's `Idempotency-Key` and gets B's own fresh result, not A's.

### Gaps that matter for the mobile API

- **No CI.** Isolation coverage for endpoints only protects anyone if something runs it on every PR. Recommend a GitHub Actions workflow, or Vercel checks, before 21b. Integration tests already run offline on embedded Postgres, so they suit CI.
- **No tests for:** logging a set into a completed workout (F-T1); retries and concurrent duplicate submits (F-T9); `completeWorkout` idempotency (F-T6); replaying a missed-day resolve.
- **No contract tests** for response shapes. Once old app versions stay installed, a DTO change can break them silently. Add snapshot or schema tests on the shared contract types in 21a or 21b.
- **The accounts end-to-end suite needs Docker.** It cannot run where Docker is unavailable. Device behaviour cannot be verified by any of these suites.

## 8. Environments and configuration

### Environment variables

The Preview column comes from `docs/technical/staging-environment.md`. The Production column comes from the runbooks. **Neither was checked against the Vercel dashboard.** "Local" means `.env`.

| Variable | Purpose | Exposure | Local | Preview / staging | Production | Read in |
|---|---|---|---|---|---|---|
| `DATABASE_URL` | Pooled runtime connection | server | yes | `overload-dev` transaction pooler | `overload-prod` pooler | `src/lib/db.ts`; deployment guard |
| `DIRECT_URL` | Direct connection for migrations and the CLI | server | yes | `overload-dev` session pooler | prod (human migrations only) | `prisma.config.ts`; operator scripts |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API | public | yes | dev project URL | prod URL | `proxy.ts`, `supabase/admin.ts`, `accounts/password.ts`, `exercises/images.ts`, `feedback/screenshots.ts`, `import/storage.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon (publishable) key | public | yes | dev key | prod key | `proxy.ts`, `accounts/password.ts`, `supabase/server.ts` |
| `SUPABASE_SERVICE_ROLE_KEY` | Auth admin, Storage | server | yes | dev key | prod key | `supabase/admin.ts`, `feedback/screenshots.ts`, `import/storage.ts` |
| `OVERLOAD_SIGNUP_MODE` (alias `OVERLOAD_SIGNUP_OPEN`) | closed, invite or public | server | optional | `invite` | `invite` or closed | `accounts/signup-gate.ts` |
| `OVERLOAD_INVITE_CODE` | Invite code | server | optional | dev-only code | prod code | `accounts/signup-gate.ts` |
| `OVERLOAD_ADMIN_USER_IDS` | Admin allowlist | server | optional | set | set | `admin/allowlist.ts` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Bot challenge | public / server | optional (non-production bypass when the secret is unset) | Cloudflare always-pass test keys | real keys (required) | signup and forgot pages; `accounts/turnstile.ts` |
| `NEXT_PUBLIC_APP_URL` | Canonical origin for auth and Stripe redirects | public | yes | staging URL | prod URL | `accounts/verification.ts`, `billing/stripe.ts` |
| `OVERLOAD_REDIRECT_HOSTS` | Extra allowed redirect hosts | server | optional | optional | optional | `accounts/verification.ts` |
| `NEXT_PUBLIC_SITE_URL` | Metadata base | public | optional | optional | set | `app/layout.tsx` |
| `NEXT_PUBLIC_OVERLOAD_SUPPORT_EMAIL` | Support mailto | public | optional | set | set | `accounts/support-email.ts` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe API and webhook verification | server | optional | **test-mode** keys | live keys (owner-gated) | `billing/stripe.ts` |
| `STRIPE_BILLING_ENABLED`, `STRIPE_TAX_ENABLED` | Checkout kill switch; tax | server | optional | staging-only | owner-gated | `billing/config.ts`, `billing/stripe.ts` |
| `PLAN_IMPORT_ENABLED`, `PLAN_IMPORT_MODEL`, `PLAN_IMPORT_MONTHLY_SPEND_MICROS`, `ANTHROPIC_API_KEY` | Plan import switch, model, spend cap, provider key | server | optional | `PLAN_IMPORT_ENABLED` staging-only; key and cap unset until provider approval | off until owner approval | `import/config.ts`, `import/extraction/anthropic.ts`, `import/spend.ts` |
| `VERCEL_ENV` | Set by Vercel ("Automatically expose System Environment Variables" must stay on) | system | unset | `preview` | `production` | `env/deployment-guard.ts` |
| `TEST_DATABASE_URL` | Throwaway Postgres for integration tests (embedded when unset) | test | optional | — | — | `tests/integration/support/*` |
| `OVERLOAD_IMPORT_CONFIRM_REF` | Seed target confirmation | command line only | — | — | — | `prisma/seed.ts`, operator scripts |
| SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SENDER`) | Auth email | **consumed by Supabase**, not the app | `supabase/config.toml` (Mailpit locally) | dev dashboard | prod dashboard | — |

**Documentation drift (Low):**
- `.env.example` documents none of: the Stripe variables, the plan-import variables, `ANTHROPIC_API_KEY`, `OVERLOAD_ADMIN_USER_IDS`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `OVERLOAD_REDIRECT_HOSTS`.
- The local `.env` (names only were read) holds three names that are in neither the code nor `.env.example`: `OVERLOAD_SUPABASE_AUTH`, `DB_PASSWORD`, and a misspelled `STAGING_ANTRHOPIC_KEY`.
- `.env.example` describes local development on the Docker Supabase stack, while `.claude/CLAUDE.md` says local development points at the dev project. The two disagree.

### How staging and Production stay apart

| Layer | Mechanism |
|---|---|
| Branches | `main` is Production (`overload-prod`, ref `ycxvdiklpefyhdclxyau`). `staging` and feature branches are Vercel Preview on `overload-dev` (`vdxrmfadikwzodjljbdi`). Promotion goes only through a `release/*` PR (`docs/pipeline/branching-and-release-workflow.md`). |
| Deployment guard | `src/lib/env/deployment-guard.ts` `assertDeploymentTarget` runs at build (`next.config.ts`) and at runtime (`src/instrumentation.ts`, `src/lib/db.ts`). When `VERCEL_ENV` is set and is not `production`, it throws if any of `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`, `POSTGRES_URL*` names the Production ref. Identification is by project ref, never hostname (`env/supabase-identity.ts`); unknown hosts are refused. Errors name the variable, never its value. |
| Operator guard | `scripts/operator/target-identity.ts`: a hosted target needs `--confirm-ref <ref>`, and the dev database must carry an identity marker (a comment on an empty schema) read back before any write. Production is refused outright for migrate-dev, demo seed and test-user provisioning; the other scripts need an explicit `--production` flag plus the ref. |
| Data | No Production data ever reaches staging. Cost-bearing flags are scoped to the `staging` branch only. |

### What a monorepo move touches

| Item | Today | Under `apps/web` |
|---|---|---|
| Vercel root directory | repository root | `apps/web` (**human step**). Keep "Include files outside the root directory" on so `packages/shared` is in the build. |
| `turbopack.root: __dirname` (`next.config.ts`) | pins the root to the project folder | **must become the repository root** (`path.join(__dirname, "..", "..")`), or Turbopack cannot resolve `packages/shared` or hoisted `node_modules` |
| `outputFileTracingIncludes["/plan/import"]` uses `./node_modules/pdfjs-dist/...` | relative to the project | **Breaks silently if npm hoists `pdfjs-dist` to the root `node_modules`.** PDF upload in plan import would then fail only in the deployed function. Set `outputFileTracingRoot` to the repository root and point the include at the hoisted path, or keep `pdfjs-dist` un-hoisted. |
| `postinstall: prisma generate`; `prisma.config.ts` (`prisma/schema.prisma`, `import "dotenv/config"` loads `.env` from cwd) | root | Moves to `apps/web`. `.env` must live in `apps/web` or be passed explicitly. |
| `tsconfig.json` `@/*` → `./src/*` | root | Per-app tsconfig, plus a path or package export for `@overload/shared` |
| `jest.config.js`, `jest.integration.config.js` (`<rootDir>/src`, `tests/...`, `tsconfig.jest.json`) | root | Move with the app. The shared package gets its own Jest project. |
| Guard tests that compute `REPO_ROOT = path.resolve(__dirname, "..", "..")` and read `eslint.config.mjs`, `src/`, `prisma/schema.prisma`, `.env.example` | root-relative | Still correct if `tests/` moves with the app. **Must be updated deliberately; do not weaken them.** |
| `playwright*.config.ts` (`npm run build && npm run start` webServer, `testDir: ./e2e`) | root | Move with the app |
| `scripts/check-client-bundle.mjs` (`process.cwd()/.next/static`) | root | Run from `apps/web` |
| `scripts/**`, `prisma/seed.ts`, operator CLIs (`tsx`, relative paths) | root | Move with the app; re-check every relative path |
| `public/`, `components.json`, `postcss.config.mjs`, `eslint.config.mjs`, `.prettierignore` | root | Move with the app, or split into root and app configs |
| `package-lock.json` | single app | One root lockfile for the workspace |
| `docs/` path references (CLAUDE.md, skills, specs, runbooks name `src/...`) | root-relative | Keep `docs/` at the root. Paths in docs become `apps/web/src/...`; update CLAUDE.md and the skills in 21a. |

### Monorepo risks

| Risk | Detail |
|---|---|
| React versions | The web pins React 19.3.0 and Next 16.4.5. Each Expo SDK pins its own React and React Native versions. If they differ, npm workspaces may hoist one React and give the other app the wrong copy (the classic "invalid hook call"). Mitigation: pin React per app and check with `npm ls react` in each workspace. If hoisting fights back, use `installConfig`/`nohoist`, or switch to pnpm with `node-linker=hoisted` for the mobile app. **Unverified:** choose the SDK in 21a and check before committing to the layout. |
| Metro | Recent Expo SDKs configure Metro for monorepos automatically (`watchFolders` and `nodeModulesPaths`). The shared package must be plain TypeScript with no Node or DOM imports (§4). |
| Native and Node-only dependencies | `sharp`, `heic-convert`, `pdfjs-dist`, `@prisma/client`, `stripe` and `@anthropic-ai/sdk` must stay dependencies of `apps/web` only, never of the root or the shared package. |
| Build-time guards | The deployment guard runs from `next.config.ts` and must keep running from the new location. Check that a staging build still fails on a Production ref. |

**Nothing found blocks a monorepo.** The real hazards are the Turbopack root, the `pdfjs-dist` tracing path, and React version alignment. All three are checkable in 21a before any mobile code exists.

---

## 9. Rebuild estimate and proposed order

### Size per slice

| Slice | Size | Why | Depends on | Risks |
|---|---|---|---|---|
| **21a** Monorepo & Shared Package | **M** (L if DTO extraction is included) | Move the web app into a workspace; extract about 30 pure modules; split about 8 mixed files; move about 50 DTO types out of `server-only` query files; enum tuples with a parity test; shared tokens; fix the Turbopack root and `pdfjs-dist` tracing path (§8) | none | Vercel root directory; Prisma generate path; the React version shared between Next and Expo; Metro hoisting; the guard tests' path assumptions |
| **21b** Mobile API & Auth Foundation | **L** | Token auth twin; proxy exemption; error mapping; version gate; idempotency table (migration + RLS + scope + isolation suite); rate limiting; extracting `getTodayView` and the post-commit reconcile from pages | 21a | New attack surface. Any handler that calls an ungated progression builder leaks Pro (F-T11). Lazy profile creation means local JWT checks are unsafe (F-A6). |
| **21c** App Shell & Design System | **M** | Expo + EAS; tabs; tokens; SecureStore; API client with refresh; sign-in; version gate; shared states | 21a, 21b | Device-only verification; Hermes `Intl` time zones unverified |
| **21d** Workout Loop | **L** | `exercise-card.tsx` (664 lines) and the runner logic; one-handed keyboards; haptics; Today composition; history list | 21b `/today`, `/workouts`, set PUT | F-T1 must be fixed first. Retry semantics on a weak gym signal. |
| **21e** Complete Workout Experience | **L** | Gym change, swap sheet, skip, RIR, Pro calls and evidence, cardio, missed-day prompt, past-set edits, bodyweight, full summary | 21d | The largest slice. F-T2, F-T4 and F-T9 sit on its paths. |
| **21f** Plans, Library & Gyms | **M**, if read-only plans | Plan, week and session views; library with search, favorites and custom exercises; gyms | 21b | Plan editing would make it L |
| **21g** Goals, Insights & Progress | **M** | Five goal screens; exercise history with one native chart | 21f (exercise detail) | Chart library choice; gated history DTO |
| **21h** Account & Settings | **M** (L with a native tour) | Profile, appearance, What's New, feedback with screenshots, export to share sheet, deletion, read-only plan, sign-out; the tour needs a native coach-mark system | 21b | F-A2 (Stripe on deletion) and F-A7 (suspended accounts) need owner decisions |
| **21i** TestFlight Beta | **M** (mostly human) | Promotion of the mobile API; Production build; App Store Connect; beta review | all prior | Backward compatibility of the API for installed builds |

### Proposed changes to `mobile-roadmap.md`

These are proposals only; the roadmap was not edited.

1. **Add a pre-mobile web chore, "21-pre", before 21b.** Fix the web defects that the mobile API would inherit or make worse:
   - F-A1: `/verify-email` marks any signed-in visitor verified.
   - F-T1, F-T2: logging and swapping on a completed workout.
   - F-T3, F-T4: no validation on start-workout and missed-day dates.
   - F-T6: `completeWorkout` not idempotent.
   - F-D3: no two-decimal weight check.
   - F-A3: the import upload limit mismatch.

   These are web bugs today, so they should not wait for a mobile slice.
2. **21a explicitly includes the API contract types**, meaning the DTOs and the `ActionResult` error shape. Otherwise 21b both creates the API and moves 50 types, and the slice is too big to review.
3. **Move all extraction out of pages and actions into 21b.** That covers `getTodayView`, `getWorkoutView`, the post-commit goal reconcile wrapper, and the GET-side effects (Stripe sync, import retention). Then every later slice is mostly route handler plus native UI.
4. **Split 21e** into:
   - **21e-1 Logging completeness:** gym, swap, skip, RIR, past-set edit, bodyweight, missed day.
   - **21e-2 Insights in the workout:** Pro calls and evidence, scheduled-deload banner, full summary, cardio.

   Each is about the size of 21d.
5. **Move the onboarding tour out of 21h.** Ship What's New, profile, export and deletion in 21h. Put a native tour in its own small slice after the beta starts; the web tour is DOM-anchored and cannot be reused.
6. **Pull account deletion and sign-out forward into 21c's or 21d's scope**, or at least keep them inside the beta gate (Option A already includes 21h). Apple expects in-app deletion. Resolve F-A2 before then.

### Plan builder and plan import

| Feature | Recommendation | Reason |
|---|---|---|
| Plan builder | **Web-only for the beta.** 21f is read-only. One possible light edit later: change planned sets and rep range on a session exercise (`updateSessionExercise`, an absolute write). | Low frequency; dense forms; `moveSessionExercise` is relative and unsafe to retry. |
| Plan import | **Web-only for the beta.** | Synchronous 240 s model call, file uploads, Pro plus a kill switch, about 5,000 lines. |

### Beta gate

**Option A** (beta after 21a–21e and 21h) is supported by this audit. The phone covers the daily loop, and plans and goals are already readable on the web.

### Recommended workspace layout for 21a

```text
overload-training/
├── apps/
│   ├── web/            # current Next.js app (src/, prisma/, public/, e2e/, tests/, scripts/, next.config.ts)
│   └── mobile/         # Expo app (21c)
├── packages/
│   └── shared/         # @overload/shared — source-only TypeScript, no build step
│       └── src/
│           ├── contracts/   # API DTOs, ActionResult/ErrorCode, enum tuples
│           ├── training/    # e1rm, progression engine/config/deload, rir, set-entry, schedule, calendar, rep-target
│           ├── validation/  # plan, cardio, goal, gym, exercise, account, feedback parsers and limits
│           ├── content/     # release-note catalog, tour step copy, taxonomy labels, PRO_HIGHLIGHTS
│           └── tokens/      # colors, radius, type, control heights
├── docs/
└── package.json        # workspaces: ["apps/*", "packages/*"]
```

**Rules for the layout:**
- **The shared package carries no dependencies on `@prisma/client`, `next`, `react`, `@supabase/*` or `server-only`.** An ESLint rule enforces this.
- Prisma, the scoped data layer, entitlement resolution and gating all stay in `apps/web`.
- The web consumes the package through `transpilePackages`.
- The **Vercel root directory** becomes `apps/web` (a human step).

**Package manager:** stay on **npm workspaces**, because the repository already uses npm and `package-lock.json`. Recent Expo SDKs detect monorepos in Metro. Confirm during 21a whether the Expo SDK's React version can coexist with the web's React 19.3.0, or whether the mobile app needs its own React pinned per workspace.

---

## 10. Findings

Ranked by severity. Prefixes show the area: T = training, A = account and commercial, D = data and shared code, S = screens and design system, Q = quality gates and configuration. Nothing was fixed.

| # | Sev | Location | Finding |
|---|---|---|---|
| F-A1 | **High** | `src/app/verify-email/page.tsx:55-57`; `src/lib/accounts/verification.ts:251-263` | **Any signed-in user who opens `/verify-email` directly is marked email-verified.** The page writes `emailVerifiedAt` whenever there is a session, without proof that `/auth/confirm` succeeded. This bypasses the verified-email gate on first checkout (`billing/checkout.ts:83-92`). It is also a write during a GET. Confirmed by reading the code. |
| F-A2 | **High** | `src/lib/accounts/deletion.ts:57-58,89,109-174`; `src/lib/data/billing-webhook.ts:183-185` | **Deleting an account does not cancel its Stripe subscription.** The `BillingAccount` mirror is deleted, later webhooks resolve to no account and are ignored, and the lifter keeps being charged with no portal left to cancel from. The delete page does not warn about this. It matters for Apple's deletion expectation and for the no-dark-patterns rule. Confirmed: `deletion.ts` has no Stripe call. |
| D-1 | **High (docs)** | `CLAUDE.md` (root) vs `.claude/CLAUDE.md` | The root `CLAUDE.md` is the old single-user file ("exactly one account… no signup… no invite flow", local Docker stack). Both files load into every agent session, and they contradict each other on the core access model. Retire or replace the root file. |
| F-T1 | Med (High for mobile) | `src/lib/logging/logged-sets.ts:152-241`; `src/app/(app)/log/[loggedSessionId]/page.tsx:18` | `logSet` never checks `loggedSession.status`, so a completed workout still accepts sets. Those sets immediately change goals, the e1RM trend, and possibly a gym baseline. The spec treats completion as terminal (`04-guided-workout-logging/spec.md:69`). A delayed mobile retry would hit this path. No test covers it. |
| F-T2 | Med | `src/lib/logging/sessions.ts:146-192` | `swapExercise` has no in-progress check. On a completed workout it can change the performed exercise of a not-done entry and clear `skippedAt`, rewriting a finished record. |
| F-T3 | Med | `src/lib/logging/sessions.ts:27-103` | `startOrResumeWorkout` accepts any `scheduledFor` and `sessionId`: future dates, off-schedule dates, and draft or archived blocks. |
| F-T4 | Med | `src/lib/logging/missed-days.ts:22-71` | `resolveMissedDay` does not check that `missedOn` is a real unresolved past occurrence. `outcome` is not validated at runtime, so `logged_late` and junk values reach Prisma. A replay returns `conflict`. |
| F-T5 | Med | `src/lib/plan/sessions.ts:179-209,128`; `src/lib/plan/mesocycles.ts:102-140` | Moving a session's day or changing `startDate` on an **active** block re-anchors past weeks, because the schedule is recomputed from the current plan. Days already trained can then be reported as missed. Found by reading the code; not reproduced. |
| D-3 | Med | `src/lib/logging/logged-sets.ts:70-110`; `goals/goals.ts:202` | No two-decimal check. `185.125` passes validation and `numeric(6,2)` silently stores `185.13`, which breaks "stored exactly as entered". An identical retry then fails the `sameWeight` comparison and returns `conflict`. |
| F-T11 | Med (latent) | `src/lib/progression/queries.ts:176,501,556` | `gatherRows`, `describeScope` and `getExerciseProgression` are exported and return Pro calls with no gate. A mobile handler that calls them would give Pro results to a Free account. Make them module-private, or add a static guard. |
| F-T7 | Med (mobile) | `src/lib/goals/goals.ts:107-237` | A replayed `createGoal` creates a duplicate when the first goal was reached on creation and archived. |
| F-A3 | Med | `src/lib/import/constants.ts:24`; `next.config.ts:28-32` | Plan import advertises 10 MB files, but the server-action body is capped at 5 MB, and Vercel's function payload limit is 4.5 MB. Larger files fail with a generic error. |
| F-A4 | Med | `src/app/login/actions.ts:51` | Web sign-out uses the global scope by default. Once the app exists, signing out on the web will end the phone's session. |
| F-A5 | Med (21b blocker) | `src/lib/auth-routes.ts:55-61`; `src/proxy.ts:62-63,103` | Cookie-less `/api/mobile/*` requests would get a 307 to `/login`. |
| F-A6 | Med (latent) | `src/lib/data/account.ts:67-89` | `resolveAccountState` lazily creates a Profile for any unseen user id. Local JWT verification would let a token issued before deletion recreate an orphan profile. Mobile auth must use `getUser(token)`. |
| F-A7 | Med | `src/lib/data/account.ts:261`; `settings/export/route.ts:29`; `settings/delete-account/actions.ts:32` | A suspended account cannot export its data or delete itself. This conflicts with "your data stays yours" and with Apple's deletion expectation. |
| F-A8 | Med (mobile) | `src/app/(app)/feedback/actions.ts:30-103` | Submitting feedback is not retry-safe, and screenshots upload before the daily-limit check. |
| S-3 | Med | `src/app/(app)/settings/billing/page.tsx:25` → `lib/billing/sync.ts` | The billing page calls Stripe and writes the mirror on every GET. This contradicts the rule that subscription state comes only from verified webhooks, and puts a network call in the render path. |
| S-4 / F-T12 | Med | `(app)/page.tsx:249` and five goal pages; `log/actions.ts:63,105`; `history/actions.ts:31,55`; missing on `exercises/[id]/page.tsx` | Goal reconciliation is business logic duplicated across actions and pages. It is missing on the exercise page, which shows goals. Extract one lib function. |
| S-5 | Med | `src/app/(app)/plan/import/page.tsx:69,93,100` | Import retention (a write) runs during the GET before the kill-switch check. Raw `account.db.importSession` queries sit in the page. |
| D-2 | Med (docs) | `.claude/CLAUDE.md` and `architecture.md:25` vs `schema.prisma:114-116` | The scheduled deload is described as a "designated week" in the docs, but implemented as a cadence (`deloadEveryWeeks`, stored in column `deload_week`). |
| D-6 | Med | `appearance.ts`, `feedback/validation.ts`, `presets.ts`, `plan/queries.ts:24`, `data/locks.ts:14`, `logging/schedule.ts`, `logging/queries.ts:56`, `goals/dashboard.ts:8` | Hand-copied Prisma enum mirrors with no parity test. They will drift once mobile depends on them. |
| D-8 | Med (docs) | `architecture.md:49` vs `schema.prisma:615` | The architecture doc lists Entitlement sources as trial, subscription and comp. The schema has trial and comp only; subscription access comes from `BillingAccount`. |
| S-6 | Med | `src/lib/logging/queries.ts:772` | `/history` covers only the active mesocycle. Workouts from earlier blocks are reachable only through per-exercise history. This affects 21d's scope. |
| S-2 | Med | `.claude/skills/overload-ui-design/SKILL.md:84,100-102` vs `globals.css:47,73` | The skill's accent (`#3F5BD9` / `#7B93FF`) differs from the shipped primary (`#0159fd` / `#1a66ff`), and the skill says no logo exists. Make `globals.css` canonical before sharing tokens. |
| Q-1 | Med | repository root (no `.github/`, no hooks); `tests/unit/account-isolation-guards.test.ts` header | **There is no CI.** Only Vercel's build runs on a push. Integration (including the isolation suite), end-to-end, format and the client-bundle scan run only when someone runs them by hand, so a PR can merge with failing tests. The mobile API's safety depends on the isolation suite, so a CI workflow should exist before 21b. |
| Q-2 | Med (latent, 21a) | `next.config.ts` (`turbopack.root: __dirname`; `outputFileTracingIncludes` `./node_modules/pdfjs-dist/...`) | Under a monorepo with hoisting, Turbopack cannot see `packages/shared`, and the `pdfjs-dist` tracing include would silently miss, which breaks PDF plan import only in the deployed function. |
| Q-3 | Low | `.env.example`; local `.env` (names only) | `.env.example` omits the Stripe, plan-import, admin-allowlist and app-URL variables. The local `.env` holds names that nothing in the code reads, including a misspelled `STAGING_ANTRHOPIC_KEY`. `.env.example` also describes Docker-based local development, while `.claude/CLAUDE.md` describes local development against the dev project. |
| F-T6 | Low | `src/lib/logging/sessions.ts:315-356` | `completeWorkout` re-stamps `completedAt` on replay. |
| F-T8 | Low (web), Med (mobile) | `src/lib/plan/sessions.ts:488-518` | `moveSessionExercise` is relative, so a replay moves the exercise twice. |
| F-T9 | Low | `logged-sets.ts:199-231`; `sessions.ts:50-83` | A concurrent duplicate submit surfaces as `internal_error` even though the write committed. `logCardio` handles the same case correctly. |
| F-T10 | Low | `lib/logging/queries.ts:540,691,853`; `progression/queries.ts:735,860` | No `isUuid` check before `findUnique`, so a malformed id causes a 500 instead of not-found. |
| F-A10 | Low | `src/lib/accounts/recovery.ts:53-66` | A session from a verification magic link passes `isRecoverySession`, so it can set a new password without the old one for 30 minutes. This requires control of the inbox, the same as recovery. The code comment that says no other OTP flow exists is stale. |
| F-A11 / S-9 | Low | `src/lib/platform/app-shell.ts:11-15` | The no-purchase-in-app rule depends on a Capacitor user-agent token. That contract is obsolete under React Native; mobile must exclude purchase endpoints structurally. |
| F-A14 | Low | `src/lib/supabase/admin.ts:5-12` | Its comment says it is the only reader of the service-role key, but `feedback/screenshots.ts` and `import/storage.ts` also read it. |
| F-A15 | Low | `src/lib/feedback/attachment-validation.ts:50` | The screenshot content type is whatever the client declares; there is no magic-byte check. |
| F-A16 | Low | `src/app/admin/accounts/[id]/actions.ts:83-89` | `grantCompAction` passes an unvalidated `endsAt` to `new Date`. An invalid date surfaces as `internal_error` instead of `validation_error`. |
| D-11 | Low | `prisma/schema.prisma:215-217` | `Exercise.isFavorite` is a dead global column on shared library rows. |
| D-13 | Low | `logged-sets.ts:76,87`; `goals/validation.ts:7-8`; `plan/validation.ts:16`; `components/logging/exercise-card.tsx:287-298` | Weight and reps limits are duplicated or written inline, and the client repeats the server rules. |
| D-14 | Low | `set-entry.ts:97`, `history-format.ts:13`, `recommendation.ts:67`, `goals/progress.ts:113` | Four weight formatters with slightly different rounding. |
| D-15 | Low | `billing/config.ts:89` vs `plan/calendar.ts:100` | Two `addDays` functions with different signatures. |
| D-10 | Low (docs) | root `CLAUDE.md:58,90`; `.claude/CLAUDE.md:77` | The canonical `logSet` example is stale. The real code uses `applyBaselineOnCompletion`, `weightLbs`, `rir` and the scoped transaction. Atomicity holds. |
| D-9 | Low (docs) | `architecture.md:39,98` | Says a set edit "triggers a recompute", which contradicts compute-on-read. The doc's data model omits about ten models and fields that now exist. |
| S-12 | Low (docs) | `.claude/CLAUDE.md:211` | Says a swap can be saved back to the template; no such action exists. |
| S-13 / A-19 | Low (docs) | `.claude/CLAUDE.md` | Says Storage holds only exercise images, but there are also feedback and import buckets. Says recovery and email "don't exist today", but both are built. |
| S-10 | Low | `src/app/(app)/plan/import/actions.ts:112,195` | `reserveUploadAction` and `reorderPartsAction` are exported and callable, but nothing in the app calls them. |
| S-11 | Low | `archive/archive-dialog.tsx` | An archived gym or exercise can be restored only from the undo toast. |
| S-14 / S-15 | Low | `(app)/loading.tsx`; `src/app/not-found.tsx` | Skeleton shapes don't match some pages. `notFound()` inside `(app)` renders outside the shell. There is no `global-error.tsx`. |
| S-18 | Low | `components/admin/overview.tsx:69`; `lib/billing/screen.ts:189` | Leftovers from the retired `/blizzy` campaign. |
| D-19 | Low (unverified) | `plan/calendar.ts:69-83`; `personalization/greeting.ts:148-153` | "Today" depends on `Intl.DateTimeFormat` with `timeZone` and `formatToParts`. Hermes support has to be confirmed on a device. |

**Checked and clean:**
- **No second e1RM formula.** Goals reuse `estimateOneRepMax`.
- **No progression logic in components.**
- **One gym-variable rule.** `isGymVariable` is the single decider.
- **Baseline correction is atomic.** It runs in the set's transaction, scoped to its `(gymId, exerciseId)`.
- **No unscoped queries in the training lib.**
- **RLS** is enabled on every table.
- **Same-owner triggers** cover every owned relation.
- **Free tier as designed.** No training write needs a capability.
