# Mobile API & Auth Foundation — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 21c: Mobile API & Auth Foundation (`pitch.md`)
**Focus:** What the future iPhone app experiences when it talks to Overload, and the guarantee that nothing a lifter sees on the web changes.

> Non-UI pitch. There is no new screen, page, component, or visible state on the web or the phone. Following the 21a/21b precedent, the design sections describe (1) the web screens that must stay exactly as they are after the extraction, and (2) the "conversation" the API has with its client: the states a native screen will be built on in 21d onward. **UI preview: Skipped — no UI surface in this pitch.**

## 1. Vision

When the iPhone app opens, it asks Overload three questions — *can I run?* (app config), *who am I?* (`me`), and *what am I doing today?* (Today) — and gets the same answers the web gives, for that lifter only, with Pro calls withheld exactly as the web withholds them. When something is wrong (signed out, suspended, too old, too fast), the app gets one plain, structured answer it can turn into a calm screen, never a login page or a stack trace.

**Design north star:** *the phone sees the same truth through a narrower door.*

## 2. Design principles

### 1. One truth, two doors

Today on the phone is built by the same server function as Today on the web. A lifter never sees a different call, a different greeting, a different goal percentage, or a different "today" because they switched device. The web page is refactored to read from that shared composition; its markup and copy do not change.

### 2. The token proves who; the scoped layer decides what

Identity comes only from a token Supabase Auth itself confirms on every request. After that, every read goes through the account-scoped client, exactly like a web page. Another account's data is indistinguishable from data that doesn't exist.

### 3. Every failure is a state the app can draw

Each failure maps to one stable code and HTTP status: signed out (`unauthorized`), suspended (`account_suspended`), too old (`upgrade_required`), too many requests (`rate_limited`), not found, invalid input, or "something went wrong". The app never parses HTML or exception text, and the message is safe to show as-is.

### 4. Reads don't surprise

A mobile GET performs no Stripe call, no plan-import cleanup, and no hidden purchase logic. The only writes a read may make are the two the web already makes on every request for the same reasons: recording the last-active date, and completing a goal that the lifter's logged history has already reached.

### 5. A retry is never a second record

A create request carrying the same `Idempotency-Key` returns the first answer instead of creating again; the same key with a different request is refused. One account's keys are invisible to every other account.

## 3. Visual language

No visual change. All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states — and this feature defines none.

### State colors

Unchanged. The Today page keeps its progress and deload tags, the hold-is-no-tag rule, the scheduled-deload banner, and the quiet upgrade note, all from the same components with the same props.

## 4. Information architecture

```text
Web (unchanged)                         iPhone app (21d onward)
┌──────────────────────────┐            ┌──────────────────────────┐
│ /  Today page            │            │ launch → app config      │
│   └ reads getTodayView ──┼──┐      ┌──┼── /today                 │
│ /log/[id] Workout page   │  │      │  │  /me   /gyms             │
│   └ reads getWorkoutView │  │      │  └──────────────────────────┘
└──────────────────────────┘  │      │             │ Bearer token
                              ▼      ▼             ▼ X-Overload-App-Version
                  ┌──────────────────────────────────────────┐
                  │ account-scoped composition (apps/web lib) │
                  │  Today view · Workout view · goal reconcile│
                  │  gated progression queries (locked kept)  │
                  └──────────────────────────────────────────┘
                              ▲
              /api/mobile/v1/* handler: version gate → token check
              (getUser) → account state → rate limit → handler → JSON
```

The web keeps its proxy, cookies, redirects, and pages. `/api/mobile/*` is the one path family the proxy lets through untouched, because it authenticates with a token instead.

## 5. Surfaces affected

| Surface | Change a lifter can see | What changes underneath |
| --- | --- | --- |
| Today (`/`) | None | Reads one composed view instead of calling queries in several components |
| Workout (`/log/[id]`) | None | Reads one composed view; one entitlement check per page instead of one per exercise |
| Logging, editing past sets, finishing a workout | None | Goal completion after the write runs through one shared workflow function |
| Goal pages | None | Same pre-render reconciliation, through the same named function |
| Plan & Billing, Plan import | None | Their load-time writes stay where they are, web-only, and are fenced off from the API |
| `/api/mobile/v1/*` | New, used by no client yet | The four endpoints and the shared request pipeline |

## 6. Screen specifications

### Screen 1: Every existing web screen, after the extraction

#### Purpose
Prove the web is untouched while its composition moves into shared server functions.

#### URL pattern
`/`, `/log/[loggedSessionId]`, `/history/[loggedSessionId]`, `/goals/*`, `/settings/billing`, `/plan/import`.

#### Trigger
Any normal visit or action.

#### Layout
Unchanged, pixel for pixel. Today's states (no plan, rest, cardio-only rest, missed day with the dimmed day below, planned, in progress, complete with summary and goal rows, goals on the alternate state) render the same elements in the same order with the same copy.

#### Behavior
- The greeting is still composed on the server from the same facts at the same instant.
- Goal completion is still reconciled before goals render on Today and on the goal pages, and after logging a set, finishing a workout, editing a past set, or lowering planned sets — never inside a set's transaction.
- A Free account still sees the same locked notes; a Pro account the same calls.
- Plan & Billing still refreshes from Stripe when it loads; plan import still runs its retention when it loads.

#### Empty, loading, and error states
Unchanged (the existing `loading.tsx` skeletons and error boundary).

### Screen 2: The API conversation (developer surface for the app)

#### Purpose
Define the states a native screen can rely on.

#### Trigger
The app calls `/api/mobile/v1/<endpoint>` with `Authorization: Bearer <access token>` and `X-Overload-App-Version: <x.y.z>`.

#### Behavior — the answers, in the order they are decided

| Situation | What the app gets | What the app will show (21d) |
| --- | --- | --- |
| Version header missing or malformed | 400 `validation_error` | a developer error; never reached by a real build |
| Version below the minimum | 426 `upgrade_required` | the blocking "Update Overload" screen |
| No token, malformed token, expired token, signed-out or revoked session, deleted account | 401 `unauthorized` | refresh once, then sign-in |
| Supabase Auth unreachable | 503 `internal_error` | "Couldn't reach Overload" with retry; the lifter stays signed in |
| Suspended account | 403 `account_suspended` | the suspension wall |
| Too many requests from this account | 429 `rate_limited` with `Retry-After` | a quiet retry |
| Another account's id, or an id that doesn't exist | 404 `not_found`, same body either way | the not-found state |
| Unknown path under the API | 404 `not_found` (JSON, never an HTML page) | — |
| Anything unexpected | 500 `internal_error`, generic message | "Something went wrong" with retry |
| Success | 200 with the contract body | the screen |

Every response, success or failure, carries `Cache-Control: no-store`.

#### App config
Public, no token. It answers even an old app (so the app can learn it must update): minimum version, latest version, kill switches (plan import on/off, maintenance), and whether signup is open. Never the invite code, never a secret, never the reason a switch is set.

#### `me`
The acting account's profile (names, username, time zone), email and whether it is verified, appearance, resolved plan (plan, capabilities, sources, display state, trial days left), whether the tour should start, the What's New dialog, and the trial notice. The trial notice is never purchasable in the app.

#### Today
Exactly the web Today: today's date in the account's time zone, the greeting, the dashboard state, the planned call per exercise (gated, `locked` kept), the day-complete summary (gated), the goals the finished workout moved, and the goals block when no training action is pending.

#### Gyms
The account's active gyms (name and address), alphabetical. The address is personal location data and appears only here.

## 7. Navigation flows

```text
App launch (21d)
  → GET app-config ──426-equivalent (below minimum)──→ Update screen
  → GET me ──401──→ sign in ──→ GET me
           ──403──→ suspension wall
  → GET today ──→ Today tab
```

No web navigation changes.

## 8. Interaction specifications

- **Retries.** A client may resend any GET freely. Later create endpoints take an `Idempotency-Key` (a fresh random value per user intent, resent unchanged on retry); a replay returns the original answer with an `Idempotent-Replayed: true` header, a reused key with a different body is refused (409 `conflict`), and a request that failed leaves no trace, so the same key can be retried.
- **Rate limit.** Counted per account, generous for normal use (a full workout session makes a few requests a minute). A refused request says when to retry.
- **Maintenance.** The `maintenance` switch is advisory: the app shows its blocking screen; the API itself keeps answering so a lifter mid-workout loses nothing already logged.

## 9. Responsive behavior

Not applicable (no UI). The web pages' responsive behavior is unchanged.

## 10. Component inventory

| Component | Location | New / reused | Notes |
| --- | --- | --- | --- |
| `DashboardGoals`, `SessionGoalRows` | Today | reused | receive their rows from the Today view instead of fetching them; same markup |
| Today blocks (`TodayBlock`, `CompleteBlock`) | Today page | reused | read the composed view; same markup |
| `WorkoutRunner` | Workout page | reused | unchanged props |

## 11. Accessibility, privacy, and data sensitivity

- Every endpoint returns only the acting account's data; a foreign id reads exactly like a missing one.
- Error messages are safe to display and never contain an email, a name, a database error, or a hint that another account exists.
- Gym addresses appear only in the gyms response.
- No personal data is logged by the API; failures are logged by error name only.
- The rate limiter stores only a hash of the account id and a window counter; the idempotency table stores the account's own responses and is removed with the account and included in its export.

## 12. Out of scope

- **Deferred to later slices:** the Expo app and every native screen (21d+); workout, logging, history, cardio, swap, missed-day, plan, library, goal, settings, feedback, export, and deletion endpoints (21e–21j); any create endpoint that uses the idempotency mechanism (21f+); a data-rights exception for suspended accounts on the API (21j, with export and deletion); the mobile bot challenge and per-device signup limits (21d); pruning old idempotency records.
- **Web-only:** admin, billing and checkout, public pages, the plan builder, plan import.
- **Permanent non-goals:** program generation or an AI coach, social features, ads, dated goals, a rest timer, cardio progression, an admin view of training content, a purchase flow inside the app.

## 13. User guidance

No tour step and no release note: nothing a lifter can see changes.

## 14. Plan placement and client scope

**Plan placement.** No capability is added or moved. Today's planned calls and the day-complete summary stay gated by `progression_insights` and keep `locked` on the wire; everything else in these endpoints is Free. The app receives Pro calls only from these gated responses and never runs the engine.

**Client scope and platform impact** (`overload-cross-platform`):

| Surface | Shared logic | API | Web UI | Mobile UI | Reason |
| --- | --- | --- | --- | --- | --- |
| App config | `AppConfigDto` (21b) | `GET /app-config` (new) | — | 21d update screen | old builds must learn they are too old |
| Me | `MeDto` (21b) | `GET /me` (new) | unchanged | 21d shell | the app's launch state |
| Today | `TodayDto` (21b, finalized here) | `GET /today` (new) | Today page reads the same composition | 21e | one truth, two doors |
| Gyms | `GymListItemDto` (21b) | `GET /gyms` (new) | unchanged | 21f | gym picker and list |
| Workout view | `WorkoutViewDto` (21b) | none yet (21e) | workout page reads the composition | 21e | extraction only |
| Errors and version | `ApiErrorBody`, `API_ERROR_CODES` (21b) | every endpoint | — | 21d client | one taxonomy |

Mobile UI is pending: there is no app yet, and nothing in this slice can be verified on a device.
