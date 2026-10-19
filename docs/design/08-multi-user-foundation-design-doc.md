# Multi-User Foundation — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 8: Multi-User Foundation (`pitches/08-multi-user-foundation.md`)
**Focus:** Overload holds more than one lifter's data while every lifter, including the original one, sees exactly what they saw before: their own plan, history, gyms, goals, and day, and nothing of anyone else's.

> **Authority note.** This pitch traces to the approved multi-user planning set (PRD "Account Ownership & Isolation", Architecture "Ownership", "Profile", "Authorization", "Environments & Deployment", Roadmap "Pitch 8"). At run time those documents exist as the owner's approved downloads, not yet in `docs/planning/` (which still holds the single-user MVP 1 set). See the spec's Resolved Decision R1 and the run report's upstream amendments.
>
> **No UI surface.** The pitch adds no screen, page, form, navigation element, or visible state, so the UI preview stage is skipped (recorded in the run progress file). This document therefore specifies **behavior**: what every existing surface must keep doing, the few places where ownership changes what a control may do, what a second account experiences, how "today" is decided, and what the human operator sees while converting production. It does not define schemas, module names, or function signatures; those belong to the spec.

---

## 1. Vision

The original lifter opens Overload the morning after the conversion and cannot tell anything happened: same Today, same plan, same history, same tags, same goals, same day of the week. A friend's account, when one exists, is a sealed room — empty until they fill it, and with no window into anyone else's.

**Design north star:** *invisible to the owner, impenetrable to everyone else.*

---

## 2. Design principles

### 1. Nothing moves for the original lifter

Preservation is measured by behavior, not row survival. Every screen the lifter uses today — Today, the logging card, History, Plan, Library, Gyms, Goals — renders the same content, in the same order, with the same computed tags, on the same calendar day. If a change would alter what the lifter sees, it needs an explicit reason rooted in the pitch, and this document names it (§6, Screen 3).

### 2. Someone else's thing does not exist

An account never learns that another account exists. A link to another account's workout, mesocycle, goal, gym, or custom exercise behaves exactly like a link to something that was never created: the same not-found page, the same wording, the same response to an action. No "forbidden", no "belongs to another user", no different error, no different timing in kind.

### 3. The library is shared and read-only

The imported exercise library is common reference data. Any account can read it, plan with it, log against it, and set goals on it. No account can change it: not its name, not its archive state. What *is* personal about a library exercise — whether the lifter starred it — belongs to the lifter, not to the row everyone shares.

### 4. Today belongs to the account

"Today", the weekday, and "is this a past date?" are decided in the account's own stored timezone, never in the server's clock and never only in whatever the browser happens to report. The original account's stored timezone is the one its days already follow, so nothing shifts at midnight or across the week boundary.

### 5. The conversion is boring on purpose

Converting production is a staged, rehearsed, verifiable sequence where each stage either completes fully or changes nothing, every stage can be previewed before it writes, and a human — never the automated run — performs the production steps with a fresh backup in hand.

---

## 3. Visual language

All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

This pitch introduces **no new tokens, components, variants, or copy styles.** Every surface touched below reuses an existing component exactly as it renders today. Light, dark, and system appearance are unaffected.

| Token / theme path | Usage | Notes |
| ------------------ | ----- | ----- |
| (none new) | — | Existing not-found page, existing empty states, existing exercise detail header reused unchanged |

### State colors

No new states. The computed tag (Progress / Deload / no tag for Hold), the scheduled deload banner, mesocycle and goal `active`/`archived` treatments, and day states (Pending, Complete, Skipped, Shifted, Missed) are unchanged and must compute identically before and after the conversion.

---

## 4. Information architecture

The shell (Foundation design doc) is unchanged. Ownership lives *under* every node rather than at any node:

```text
┌──────────────────────────────────────────────────────────┐
│  Overload  (one authenticated account per browser)       │
├──────────────────────────────────────────────────────────┤
│  Today   ── account's today (account timezone)           │
│  Plan    ── account's mesocycles → sessions              │
│             Exercise library = shared library            │
│                               + account's custom         │
│                               (favorites per account)    │
│  History ── account's logged days and cardio             │
│  Goals   ── account's goals (one active per exercise     │
│             per account)                                  │
│  Gyms    ── account's gyms (+ their baselines)           │
├──────────────────────────────────────────────────────────┤
│  Every node: reads and writes are scoped to the acting   │
│  account; anything outside it is "not found".            │
└──────────────────────────────────────────────────────────┘
 Not part of the app: the operator's migration tooling (§6, Screen 6)
```

There is no account switcher, no "users" area, no settings for name or timezone (Accounts and later pitches), and no signup or invite surface (Accounts).

---

## 5. Surfaces affected

| # | Surface | Change for the original lifter | Change for a second account |
|---|---------|-------------------------------|-----------------------------|
| 1 | Every existing screen (Today, logging card, History, Plan, Library, Gyms, Goals, exercise detail, goal detail) | None | Sees only its own data; empty states where it has none |
| 2 | Direct links / actions with an id that is not the account's | n/a (all ids are theirs) | Not-found, identical to a nonexistent id |
| 3 | Exercise detail for a **library** exercise | Archive affordance no longer offered (custom exercises keep it); star unchanged | Same |
| 4 | Favorites (library star, Favorites view, swap picker ordering) | Same stars as before | Own stars only, independent of every other account |
| 5 | Today / weekday / past-date decisions | Same days (stored timezone = the zone they use today) | Their own stored timezone |
| 6 | Operator migration tooling (not app UI) | — | — |

---

## 6. Screen specifications

### Screen 1: Every existing screen, after conversion

#### Purpose
Show the acting account exactly its own data, with the original account's experience unchanged.

#### URL pattern
All existing routes (`/`, `/log/…`, `/history/…`, `/plan/…`, `/exercises/…`, `/gyms`, `/goals/…`). No route is added, removed, or renamed.

#### Trigger
Any authenticated visit.

#### Layout
Unchanged. Wireframes are the ones in the Pitch 1–7 design docs and previews.

#### Behavior
- Every list contains only the acting account's rows (plus, for exercises, the shared library). Counts, ordering, and pagination are computed over that set only.
- Every computed value — progress/deload tag, e1RM trend, stall flag, scheduled-deload suggestion, goal percentage, gym baseline shown on the card, missed-day detection, effective (shifted) schedule, cardio occurrences — is computed from the acting account's data only and is byte-for-byte the same for the original account before and after the conversion.
- "Only one active mesocycle" and "one active goal per exercise" now mean *per account*: two accounts may each have an active mesocycle, and each may have an active goal on Barbell Bench Press.
- Archived exercises and gyms still resolve in the acting account's history exactly as before.

#### Empty state
A brand-new second account sees the existing empty states, unchanged in wording:

```text
┌────────────────────────────────────┐
│ Today                              │
├────────────────────────────────────┤
│  No active plan.                   │
│  [Build a plan]                    │  ← existing Pitch 3/4 empty state
└────────────────────────────────────┘
```

The library is **not** empty for a new account: it shows the full shared catalog with no stars and no custom exercises. Gyms, History, Goals, and Plan show their existing empty states.

#### Loading state
Unchanged (existing `loading.tsx` skeletons).

#### Error state
Unchanged. A failure to resolve the acting account (no authenticated session) redirects to login exactly as today.

---

### Screen 2: A link or action that names another account's object

#### Purpose
Make another account's object indistinguishable from one that never existed.

#### URL pattern
Any id-bearing route, e.g. `/history/{loggedSessionId}`, `/log/{loggedSessionId}`, `/log/{id}/{id}/swap`, `/plan/{mesocycleId}`, `/plan/{mesocycleId}/sessions/{sessionId}`, `/plan/clone/{sourceId}`, `/goals/{goalId}`, `/goals/new/{exerciseId}`, `/exercises/{exerciseId}`.

#### Trigger
A pasted or guessed URL, or a server action invoked with an id the acting account does not own.

#### Layout
The existing app not-found page, exactly as rendered for a random id:

```text
┌────────────────────────────────────┐
│  Not found                         │
│  That page doesn't exist.          │  ← existing not-found.tsx, unchanged
│  [Back to Today]                   │
└────────────────────────────────────┘
```

#### Behavior
- Page routes: the same not-found response as for an id that has never existed. No redirect to a different place, no special copy.
- Server actions (log a set, edit a set, swap, start a workout, resolve a missed day, plan edits, archive, favorite, create goal on an exercise, log cardio, …): the same `not found` result — same code, same message — that a nonexistent id produces today. Where an action today answers a nonexistent reference with a validation message (for example, a swap candidate that "isn't available", or a gym that "isn't available"), a foreign reference gets that same message.
- A shared **library** exercise is not foreign: it resolves for every account.
- Another account's **custom** exercise is foreign: it does not appear in the library, search, pickers, swap candidates, or goal exercise picker, and its detail URL is not-found.
- Nothing about the foreign object leaks through a uniqueness rule: creating a goal, a session on a weekday, or an active mesocycle never fails because of another account's rows.

---

### Screen 3: Exercise detail — library exercise

#### Purpose
Let the lifter read and star a library exercise, without being able to change shared reference data.

#### URL pattern
`/exercises/{exerciseId}`

#### Trigger
Tapping an exercise in the library or a link from history/progression.

#### Layout

```text
Library exercise (shared)                Custom exercise (account's own)
┌──────────────────────────────────┐     ┌──────────────────────────────────┐
│ ‹ Library                        │     │ ‹ Library                        │
│ Barbell Bench Press        [☆]   │     │ Landmine Press   [Custom]  [☆]   │
│ Chest · Barbell                  │     │ Shoulders · Other                │
│ (image)                          │     │                                  │
│ …progression / e1RM trend…       │     │ …progression / e1RM trend…       │
│                                  │     │ [Archive exercise]               │
└──────────────────────────────────┘     └──────────────────────────────────┘
```

| Element | shadcn/ui component / styling | Behavior |
| ------- | ----------------------------- | -------- |
| **Star** | existing `FavoriteButton` | Toggles the acting account's favorite only; another account's stars are unaffected and invisible |
| **Archive exercise** | existing `ArchiveExerciseButton` + `ArchiveDialog` | Rendered **only for the acting account's custom exercises**. Not rendered for library exercises. |
| **Archived badge** | existing `Badge variant="secondary"` | Unchanged: shown for any archived exercise, including a library exercise archived before the conversion |

#### Behavior
- The PRD edge case "Library exercises cannot be edited or archived by any account" is enforced server-side regardless of the UI: an archive or restore attempt on a library exercise is refused and changes nothing. Removing the button is the visible consequence, not the protection.
- **Library exercises archived before the conversion stay archived.** In the single-user era the lifter could archive a library exercise; the conversion changes no library row. Those exercises remain hidden from selection lists (for every account) and still resolve in history, exactly as they do for the original lifter today. Whether to un-archive them is a product decision recorded in the run report, not a side effect of this pitch.
- Custom exercises: archive and undo work exactly as today, for the owning account only.

#### Empty / loading / error states
Unchanged.

---

### Screen 4: Favorites

#### Purpose
Keep the lifter's starred exercises personal now that the library rows are shared.

#### URL pattern
`/exercises?view=favorites`, the star on library rows and the detail page, and the swap picker (`/log/{id}/{id}/swap`) ordering.

#### Behavior
- A star is the acting account's statement about an exercise. Starring or un-starring never changes what another account sees.
- After the conversion the original lifter's stars are exactly the exercises they had starred before — library and custom alike — so the Favorites view lists the same exercises in the same order, and the swap picker still floats the same starred candidates to the top.
- A new account starts with no stars; "Favorites" shows the existing "no favorites yet" empty state.
- Archived exercises still cannot be starred (unchanged rule).

---

### Screen 5: Today, weekday, and past-date decisions

#### Purpose
Decide the account's calendar day from its own stored timezone.

#### Surfaces
Today's planned workout and day-complete state, missed-day detection and the three-way prompt, the effective (shifted) week, History's "is this a past date" corrections, cardio's "not before its day" rule, goal and progression displays that format dates.

#### Behavior
- The authority is the account profile's stored IANA timezone. It is read on the server for every request; it is not taken from a request parameter and not inferred only from the browser.
- **The original account keeps its days.** Its stored timezone is set during the conversion to the zone its days already follow — the zone the app is using for it today (the browser zone recorded in its `overload-tz` cookie, which the operator reads and supplies). Before and after the conversion, at any instant, Today shows the same session, the same day-complete state, and the same missed-day prompt.
- **One deliberate behavioral change:** today, the day follows whatever zone the current browser reports, so traveling shifts "today". After this pitch the day follows the stored zone, so traveling does not shift it until the stored zone is changed. Editing the stored zone is a later Settings capability; until then it is an operator task. At home, nothing changes.
- **A second account** gets a profile the first time it is used, with UTC as its stored timezone until Accounts captures the browser zone at signup. Its Today is computed in UTC meanwhile — acceptable for a controlled verification account and invisible to the original lifter.
- No screen displays the timezone in this pitch.

#### Edge cases the behavior must survive
| Moment | Expected |
| ------ | -------- |
| 11:30 pm local on a Sunday, original account | Still Sunday's plan (stored zone, not UTC Monday) |
| Week boundary during a shifted week | Shift still scoped to the current week of the stored zone; never compounds |
| Logging late for yesterday after midnight local | Yesterday is "yesterday" in the stored zone |
| Server clock in UTC (Vercel) | Irrelevant; never the authority |

---

### Screen 6: Operator conversion tooling (not part of the app)

#### Purpose
Let the human operator convert production safely: preview exactly what will happen, then perform each stage so it completes fully or changes nothing.

#### Trigger
The production runbook (`docs/runs/08-multi-user-foundation-runbook.md`), run by the product's owner from a trusted machine. Never run by the autonomous pipeline against production, never reachable from the app.

#### Stages (the approved staged shape)

```text
 Backup ──► Stage 1: Expand ──► Stage 2: Assign ──► Stage 3: Enforce ──► Deploy code ──► Verify
 (fresh)    ownership can       every existing      ownership required;   new code      counts, today,
            exist; nothing      owned row → the     per-account rules     reads only    isolation, RLS
            changes for the     named account;      authoritative;        the acting
            lifter              favorites copied;   refuses if anything   account
                                profile + timezone  is unassigned
```

#### Stage 2 output — dry run (what the operator sees; numbers illustrative)

```text
Overload ownership assignment — DRY RUN (no changes)
Target database host : db.<ref>.supabase.co            (no secrets printed)
Target account       : lifter@example.com  → resolved to account 6f1c…e2 (1 of 1 accounts)
Profile timezone     : America/Chicago (valid IANA zone)

Rows without an owner (will be assigned to this account):
  mesocycles              4      sessions                 21
  session_exercises     118      gyms                      3
  gym_exercise_baselines 14      logged_sessions          61
  logged_exercises      402      logged_sets            1,386
  missed_day_resolutions  5      goals                     6
  planned_cardio          3      cardio_logs              17
  custom exercises        2      favorites to copy         9
Library exercises (stay shared, unchanged): 876 (archived: 3)

Nothing written. Re-run with --execute to assign.
```

#### Stage 2 output — execute

```text
Assigning… (one transaction)
  before → after counts: identical for every table (0 rows added, 0 removed)
  unowned rows remaining: 0
  favorites copied: 9   profile created: 1
Done. Next: Stage 3 (enforce).
```

#### Behavior
- The target account is always named explicitly by email and echoed back as resolved before anything is written. It is never inferred. If the email does not resolve to exactly one account, or more than one account exists in auth, the tool refuses.
- The timezone is supplied explicitly and validated as an IANA zone; an invalid zone is refused.
- The dry run is the default and writes nothing. Execute repeats every check, then does all of Stage 2 in one transaction: a failure leaves nothing partial.
- Stage 2 creates only the profile and favorites and assigns ownership. It never deletes, overwrites, merges, or alters any existing value — no logged set, plan row, gym, baseline, goal, or library row changes.
- Stage 2 is safe to re-run: with nothing unassigned it reports zero changes.
- Stage 3 checks completeness itself and refuses — changing nothing — if any owned row is still unassigned.
- The before/after row counts and the post-migration verification queries are the evidence the operator keeps.
- The same tooling is rehearsed against a restored copy of production in the development environment before production is touched.

---

## 7. Navigation flows

No navigation changes. Two flows gain an explicit rule:

```text
Deep link with someone else's id
  /history/{foreign id} ──► existing not-found page      (same as /history/{random uuid})
  server action(foreign id) ──► "not found" result       (same as a random uuid)

Original lifter, morning after the conversion
  Open app ──► (missed-day prompt iff it would have appeared before) ──► Today
            ──► same session, same tags, same goals, same day
```

---

## 8. Interaction specifications

- **Keyboard:** unchanged everywhere.
- **Loading:** unchanged.
- **Errors:** unchanged copy. The only new refusal a lifter could ever reach is archiving or restoring a library exercise, which has no control after this pitch. If it is attempted anyway (a stale tab), it returns the existing not-found message for the action and changes nothing.
- **Notifications:** unchanged. No toast mentions accounts, ownership, or the conversion.
- **Destructive actions:** unchanged. No new destructive action exists. Account deletion belongs to Accounts.

---

## 9. Responsive behavior

Unchanged at every breakpoint. Removing the library Archive button frees space on the exercise detail page and moves nothing else.

---

## 10. Component inventory

| Component | Location | New / reused | Notes |
| --------- | -------- | ------------ | ----- |
| `ArchiveExerciseButton` | exercise detail | reused | Rendered only for the acting account's custom exercises |
| `FavoriteButton` | library rows, exercise detail | reused | State is the acting account's favorite |
| `SwapPicker` | logging | reused | Favorite ordering uses the acting account's stars |
| `TimeZoneSync` | app layout | **retired** | Renders nothing today; once the stored timezone is the authority it has no job (spec decides the removal) |
| Not-found page | app | reused | The single response for foreign and nonexistent ids |

---

## 11. Accessibility, privacy, and data sensitivity

Accessibility: unchanged. No new controls.

Privacy — the substance of this pitch:
- An account never sees, edits, counts, searches, or infers another account's plan, history, gyms (including addresses), goals, baselines, cardio, custom exercises, favorites, or profile.
- No surface says or implies another account exists: no names, no "shared with", no user list, no account switcher.
- Not-found is the single answer for anything outside the acting account.
- Names, emails, and training history never appear in logs, error messages, or analytics. The operator tooling prints the target email (supplied by the operator) and row counts, never another account's data and never connection secrets.
- Gym addresses remain visible only on the owning account's Gyms screen and gym picker.
- Row-level security stays deny-all, so the public Data API still returns nothing for every table, including the new ones.

---

## 12. Out of scope

From the pitch (belongs to Accounts or later):
- Signup, invite codes, login redesign, logout changes, password reset, SMTP, email verification, social login.
- Profile editing (name, timezone) and any Settings UI; timezone capture at signup.
- Account deletion.
- Enabling signup in production (stays disabled throughout).
- Roles, admin interface, impersonation, sharing, cross-account visibility.
- Any redesign of logging, progression, gym baselines, goals, cardio, missed days, swap, or plan construction.
- Un-archiving legacy library archives (product decision, flagged).

Deferred (roadmap; don't preclude): RIR logging; exercise history and PR views; the Apple platform work; HealthKit and body metrics; nutrition.

Permanent non-goals: program or mesocycle generation; social features of any kind; progression analysis of cardio; dated goals and a rest timer; a public product.

---

## Design checks (Overload)

- Core job unchanged for every account; tags, holds (no tag), scheduled vs. reactive deloads, lbs and tabular numerals, gym-only-for-gym-variable, Archive wording, editable history, calm goal completion, cardio-as-record, three-choice missed-day prompt, same-muscle swap: all untouched. ✔
- No share, social, leaderboard, streak, or account-visibility element added. ✔
- No new styling system, token, or component. ✔
- Every list keeps its existing empty, loading, and error states; a new account sees the empty states. ✔
- The document stays at behavior and does not define schema, modules, or signatures. ✔
