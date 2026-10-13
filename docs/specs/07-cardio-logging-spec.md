---
version: 1.0.0
status: approved
author: Autonomous pipeline (Claude Code)
last_updated: 2026-10-12
pitch_reference: pitches/07-cardio-logging.md
design_reference: docs/design/07-cardio-logging-design-doc.md
preview_reference: docs/previews/07-cardio-logging-preview.tsx
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
linear_issue: OVE-33, OVE-34, OVE-35 (milestone Cardio Logging)
---

# Cardio Logging — Technical Spec

## 2. Summary

Cardio Logging adds a second, deliberately small training record beside lifting. A **`PlannedCardio`** row puts at most one cardio item (activity text + whole minutes) on one weekday of a `Mesocycle`; a **`CardioLog`** row records what was actually done for one dated occurrence of that plan, keyed by `(mesocycleId, scheduledFor)` and carrying a snapshot of the plan it fulfilled. Plan and record never write each other.

The core abstraction is **"cardio consumes the effective schedule, it never produces it."** A planned-cardio occurrence on a weekday that also has a scheduled lifting `Session` is *bound* to that Session's occurrence and takes its effective date straight from Pitch 4's pure `effectiveWeekSchedule` (so a lifting shift carries it); a cardio-only weekday is never shifted. Completion is a pure derivation — an occurrence is complete iff a `CardioLog` exists for it — and is independent of `LoggedSession` completion. Nothing about cardio is stored beyond the plan row and the factual log; nothing about cardio reaches the progression engine, e1RM, Goals, Gym baselines, or the missed-day prompt.

"Working" means: the lifter puts *Incline Walk — 20 min* on Tuesday next to Pull Day 1, sees it under Pull on Tuesday's dashboard, logs *Bike — 25 min* in one dialog (once, however many times the request is retried), sees *Bike · 25 min — Planned Incline Walk · 20 min* in that week's History, can correct it, and nothing else in the app — tags, trends, goals, baselines, the plan — changes.

## 3. Problem

- The app cannot yet put cardio on the plan: a `CardioLog` table exists (Foundation) but no plan object, and `Session` cannot carry it (a cardio-only day has no Session).
- The app cannot yet show Tuesday as "Pull + 20 min incline walk" (PRD journey *Logging cardio*), so the week-at-a-glance is an incomplete record of training.
- The app cannot yet record cardio at all — `cardio_logs` has never been written (static guard in `deliberate-absences.test.ts`).
- The roadmap's last pitch: after it, all seven MVP pitches have shipped.

## 4. Scope and non-scope

### In scope
- `PlannedCardio` model + migration; add / edit (type, minutes, day) / remove in the mesocycle builder for draft and active mesocycles.
- Zero-or-one planned cardio per Mesocycle weekday, enforced in app and DB.
- Clone-forward copies planned cardio (type, minutes, day), never CardioLogs.
- `CardioLog` extended with occurrence identity and plan snapshot; `logCardio` (idempotent) and `editCardioLog` (type/minutes correction).
- Cardio occurrence derivation bound to the existing effective schedule.
- Dashboard: combined, cardio-only, and lifting-only days; independent completion states.
- History week view: cardio lines (complete / pending / upcoming / missed), planned comparison, log-late of a missed occurrence, correction.
- Static isolation guards and tests.

### Out of scope
- Any cardio metric beyond type + minutes; timers; health/sensor integrations (deferred/permanent per pitch).
- Multiple cardio items per day; ad-hoc (unplanned) cardio logs; CardioLog deletion (deferred).
- Any cardio progression, e1RM, trend, Goal, Gym baseline, deload adjustment, or missed-day prompt (permanent).
- Changing the lifting scheduler, the missed-day engine, LoggedSession semantics, Goals, or the progression engine.

## 5. Core concepts

| Concept | Description |
| ------- | ----------- |
| `PlannedCardio` | Plan row: `mesocycleId`, `dayOfWeek` (1–7), `type` (trimmed text, 1–40 chars), `durationMin` (1–600). Unique per `(mesocycleId, dayOfWeek)`. Belongs to the day, not to a `Session`. Persisted. |
| Cardio occurrence | Derived: one `PlannedCardio` in one mesocycle week. Identity = `(mesocycleId, authoredIso)` where `authoredIso = authoredDate(startDate, week, dayOfWeek)` (Pitch 4's function). Never stored. |
| Bound occurrence | A cardio occurrence whose weekday also has a scheduled `Session`. Its effective date is that Session occurrence's `effectiveIso` from `effectiveWeekSchedule`; `null` (dropped) when the Session occurrence was dropped by a shift. |
| Unbound occurrence | Cardio-only weekday. Effective date = authored date, always. |
| Occurrence floor | An occurrence exists only if `authoredIso ≥ toIsoDate(plannedCardio.createdAt)` — cardio added mid-block never invents occurrences (or misses) in earlier weeks. |
| `CardioLog` | Factual record for one occurrence: `mesocycleId`, `scheduledFor` (= `authoredIso`, DATE), `plannedType`/`plannedDurationMin` (immutable snapshot), `type`/`durationMin` (actual, correctable), `performedOn` (the occurrence's effective date at log time). Unique per `(mesocycleId, scheduledFor)`. |
| Cardio state | Derived per occurrence: `complete` (a CardioLog exists) · `pending` (effective = today) · `upcoming` (effective > today) · `missed` (effective < today, no log). |

Invariants: no ownership column; no stored completion/missed/day-complete flag; no FK or column linking cardio to `Session`, `SessionExercise`, `Exercise`, `LoggedSession`, `LoggedExercise`, `LoggedSet`, `Gym`, `GymExerciseBaseline`, or `Goal`.

## 6. States and lifecycle

```text
PlannedCardio: exists (draft/active mesocycle: editable) → removed (row deleted; plan authoring)
               archived mesocycle: read-only
CardioLog:     (none) → logged → corrected* ; no delete, no "unlog"
Occurrence state (derived): upcoming → pending → missed | complete ; missed → complete (optional log later)
```

| From | To | Allowed? | Side effects |
| ---- | -- | -------- | ------------ |
| no PlannedCardio on day | PlannedCardio | yes (draft/active) | none |
| PlannedCardio | edited type/minutes | yes (draft/active) | none on CardioLog |
| PlannedCardio | moved to another free day | yes | implemented as delete + create in one tx (fresh `createdAt` = fresh occurrence floor) |
| PlannedCardio | removed | yes (draft/active) | none on CardioLog (no FK) |
| occurrence (no log) | CardioLog | yes if loggable (§11c) | none elsewhere |
| CardioLog | corrected | yes, any mesocycle status | `type`/`durationMin` only |
| CardioLog | deleted | **no** | — |

## 7. UI integration

Binding visual contract: `docs/previews/07-cardio-logging-preview.tsx`. Design detail: the design doc.

| Screen | Data | Actions |
| ------ | ---- | ------- |
| `/plan/[mesocycleId]` | `MesocycleWeekDto.cardio[0..6]` | Add cardio, Edit cardio (+ Remove) — client island `PlannedCardioDialog` → plan actions |
| `/plan/clone/[sourceId]` | `CloneSetupDto.cardioDayCount` | — |
| `/` | `DashboardDto.cardio: CardioOccurrenceDto[]` on `rest`, `missed_day`, and the today states | Log (CardioLogDialog log mode), correct (correct mode) |
| `/history` | `WeekScheduleDto.cardio: CardioOccurrenceDto[]` | Log (missed/pending), correct (complete) |

Client islands: `PlannedCardioDialog`, `RemoveCardioConfirm` (inside it), `CardioLogDialog`. They call server actions only. Shared field components `CardioActivityInput` (Input + `<datalist>` of suggestions) and `MinutesInput` (`inputMode="numeric"`, "min" suffix). Combined-day dashboard: lifting block → "Start/Resume workout" (only `primary`) → `CardioCard` (secondary `Log`). Cardio-only: focal `CardioCard` with primary full-width "Log cardio". History groups `days` + `cardio` by effective date (lifting line first).

## 8. Data model

### Relationship to existing schema

| From | Relation | To | Description |
| ---- | -------- | -- | ----------- |
| `PlannedCardio.mesocycleId` | many-to-one, Restrict | `Mesocycle` | plan ownership; mesocycles are never deleted |
| `CardioLog.mesocycleId` | many-to-one, Restrict | `Mesocycle` | the block the occurrence belonged to |
| `CardioLog` ↔ `PlannedCardio` | **none** | — | identity is `(mesocycleId, scheduledFor)`; plan edits/removal can't touch history |

### New model

```prisma
/// Cardio Logging (Pitch 7): the cardio planned for one weekday of a mesocycle.
/// Belongs to the DAY (not a Session). Zero or one per weekday.
model PlannedCardio {
  id          String   @id @default(uuid()) @db.Uuid
  mesocycleId String   @map("mesocycle_id") @db.Uuid
  /// 1 = Monday … 7 = Sunday (always scheduled; there is no unscheduled cardio).
  dayOfWeek   Int      @map("day_of_week")
  type        String
  durationMin Int      @map("duration_min")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz

  mesocycle Mesocycle @relation(fields: [mesocycleId], references: [id], onDelete: Restrict)

  @@unique([mesocycleId, dayOfWeek])
  @@map("planned_cardio")
}
```

### Updated model

```prisma
model CardioLog {
  id                 String   @id @default(uuid()) @db.Uuid
  mesocycleId        String   @map("mesocycle_id") @db.Uuid
  /// The authored date of the planned occurrence (the idempotency key with mesocycleId).
  scheduledFor       DateTime @map("scheduled_for") @db.Date
  /// Immutable snapshot of what was planned for this occurrence.
  plannedType        String   @map("planned_type")
  plannedDurationMin Int      @map("planned_duration_min")
  /// What was actually done (correctable).
  type               String
  durationMin        Int      @map("duration_min")
  performedOn        DateTime @map("performed_on") @db.Timestamptz
  createdAt / updatedAt (unchanged)

  mesocycle Mesocycle @relation(fields: [mesocycleId], references: [id], onDelete: Restrict)

  @@unique([mesocycleId, scheduledFor])
  @@index([performedOn])
  @@map("cardio_logs")
}
```

`Mesocycle` gains `plannedCardio PlannedCardio[]` and `cardioLogs CardioLog[]`.

### Migration `6_cardio_logging` (hand-written, additive)

- `CREATE TABLE "planned_cardio"` + PK + unique `(mesocycle_id, day_of_week)` + FK `ON DELETE RESTRICT`.
- `ALTER TABLE "planned_cardio" ENABLE ROW LEVEL SECURITY;` (deny-all, no policy).
- CHECKs on `planned_cardio`: `day_of_week BETWEEN 1 AND 7`; `duration_min BETWEEN 1 AND 600`; `type = btrim(type) AND char_length(type) BETWEEN 1 AND 40`.
- `ALTER TABLE "cardio_logs" ADD COLUMN mesocycle_id UUID NOT NULL, scheduled_for DATE NOT NULL, planned_type TEXT NOT NULL, planned_duration_min INTEGER NOT NULL` — the table has never been written (static guard since Foundation), so NOT NULL needs no default; if rows somehow exist the migration fails loudly and changes nothing.
- FK `cardio_logs.mesocycle_id → mesocycles ON DELETE RESTRICT`; unique `(mesocycle_id, scheduled_for)`.
- CHECKs on `cardio_logs`: actual and planned minutes `BETWEEN 1 AND 600`; actual and planned type trimmed, 1–40 chars.
- No DROP / RENAME / DELETE / INSERT / CASCADE / POLICY. `cardio_logs` keeps its 0_init RLS.

### Derived fields

| Field / Concept | Stored? | Computed from | Notes |
| --------------- | ------- | ------------- | ----- |
| occurrence effective date | no | plan + `effectiveWeekSchedule` | bound/unbound rule |
| cardio state (complete/pending/upcoming/missed) | no | occurrence + CardioLog + today | |
| "differs from plan" | no | CardioLog actual vs snapshot | display only |
| day / overall completion | no | lifting state + cardio states | display only |

## 9. Authorization and access control

Every new server action calls `requireUser()` first, then a write module. All reads are Prisma in server components. RLS deny-all on `planned_cardio` (new) and `cardio_logs` (existing); both added to the RLS anon-key integration test's table list. No Supabase client access to application tables.

| Resource | Read | Create | Update | Delete |
| -------- | ---- | ------ | ------ | ------ |
| PlannedCardio | authed server components | `addPlannedCardio` (draft/active) | `updatePlannedCardio` (draft/active) | `removePlannedCardio` (draft/active; plan authoring) |
| CardioLog | authed server components | `logCardio` (loggable occurrence) | `editCardioLog` (type/minutes) | **none** |

## 10. Storage model

Not touched.

## 11. Server actions and API surface

```ts
// src/app/(app)/plan/actions.ts
addPlannedCardioAction(input: { mesocycleId: string; dayOfWeek: number; type: string; durationMin: string })
  : Promise<ActionResult<{ id: string }>>
updatePlannedCardioAction(input: { plannedCardioId: string; dayOfWeek: number; type: string; durationMin: string })
  : Promise<ActionResult<{ id: string }>>
removePlannedCardioAction(plannedCardioId: string): Promise<ActionResult<{ id: string }>>

// src/app/(app)/log/actions.ts
logCardioAction(input: { mesocycleId: string; scheduledFor: string; type: string; durationMin: string })
  : Promise<ActionResult<{ cardioLogId: string; alreadyLogged: boolean }>>

// src/app/(app)/history/actions.ts
editCardioLogAction(input: { cardioLogId: string; type: string; durationMin: string })
  : Promise<ActionResult<{ id: string }>>
```

Each: `requireUser()` → write module → `toActionResult` → `refresh()` on success. **No** cardio action calls `reconcileGoalCompletionsSafely`, any progression read, or any baseline function.

### 11a. Domain modules

| Module | Role | Writes |
| ------ | ---- | ------ |
| `src/lib/cardio/validation.ts` | pure: `parseCardioType`, `parseCardioMinutes`, `CARDIO_TYPE_MAX = 40`, `CARDIO_MINUTES_MAX = 600`, `CARDIO_TYPE_SUGGESTIONS` | — |
| `src/lib/cardio/schedule.ts` | pure: `cardioWeekOccurrences(ctx, planned, week)`, `cardioState(occ, logged, today)` — consumes `effectiveWeekSchedule`/`authoredDate` from `src/lib/logging/schedule.ts`; never re-implements shifting | — |
| `src/lib/plan/cardio.ts` | `addPlannedCardio`, `updatePlannedCardio`, `removePlannedCardio`, `plannedCardioCopies` | `plannedCardio` only |
| `src/lib/plan/mesocycles.ts` | `cloneMesocycle` copies planned cardio via `plannedCardioCopies` | adds `plannedCardio.createMany` |
| `src/lib/cardio/cardio-logs.ts` | `logCardio`, `editCardioLog` | `cardioLog` only (the single CardioLog writer) |
| `src/lib/cardio/queries.ts` | `getCardioForDate`, `getCardioForWeek` (server reads, used by logging/history queries) | — |
| `src/lib/logging/queries.ts` | `DashboardDto` / `WeekScheduleDto` gain `cardio` (read-only composition) | — |
| `src/lib/plan/queries.ts` | `MesocycleWeekDto.cardio`, `CloneSetupDto.cardioDayCount` | — |

Every write function accepts an optional `tx`. Planned-cardio writes lock the mesocycle via `requireEditableMesocycle` (archived → `invalid_state_transition`).

### 11b. Occurrence derivation (pure)

```ts
type PlannedCardioInput = { id: string; dayOfWeek: number; type: string; durationMin: number; createdIso: string };
type CardioOccurrence = {
  plannedCardioId: string; dayOfWeek: number; week: number;
  authoredIso: string; effectiveIso: string | null; // null = dropped with its shifted lifting day
  bound: boolean; type: string; durationMin: number;
};

function cardioWeekOccurrences(ctx: ScheduleContext, planned: PlannedCardioInput[], week: number): CardioOccurrence[] {
  const lifting = effectiveWeekSchedule(ctx, week);      // Pitch 4, unchanged
  return planned.flatMap((p) => {
    const authoredIso = authoredDate(ctx.startDate, week, p.dayOfWeek);
    if (authoredIso < p.createdIso) return [];          // occurrence floor
    const bound = lifting.find((o) => o.dayOfWeek === p.dayOfWeek);
    const effectiveIso = bound ? (bound.dropped ? null : bound.effectiveIso) : authoredIso;
    return [{ ..., authoredIso, effectiveIso, bound: Boolean(bound) }];
  });
}
```

Rules: a lifting `skipped`/`logged_late` resolution leaves `effectiveIso = authoredIso` (scheduler semantics), so the bound cardio stays put and is independently loggable. `oldestUnresolvedMissedDay` is untouched and never sees cardio.

### 11c. logCardio (idempotent)

In one transaction:
1. Parse `type`, `durationMin`, `scheduledFor` (ISO date) → `validation_error` with `details`.
2. Load the mesocycle; must be `active` with a start date → else `invalid_state_transition` ("Cardio can only be logged for the active plan.").
3. Existing `CardioLog` for `(mesocycleId, scheduledFor)` → return `{ cardioLogId, alreadyLogged: true }` **unchanged** (a stale retry never overwrites).
4. Derive the occurrence: `week = mesocycleWeekForDate(start, scheduledFor)` in `1..lengthWeeks`; a `PlannedCardio` on `isoWeekday(scheduledFor)` whose occurrence for that week has `authoredIso === scheduledFor`, is above the floor, has non-null `effectiveIso`, and `effectiveIso ≤ today` → else `not_found` ("There's no planned cardio for that day.") or `invalid_state_transition` ("That cardio isn't due yet.").
5. `cardioLog.create` with snapshot `plannedType/plannedDurationMin` from the plan row, actual `type/durationMin`, `performedOn = effectiveIso`.
6. A concurrent insert (P2002) → re-read and return `alreadyLogged: true` (only when this function opened the transaction; same pattern as `mapDbErrors`).

Never writes the plan, a Session, a LoggedSession/Exercise/Set, a baseline, or a Goal.

### 11d. editCardioLog

Parse type/minutes; `findUnique` → `not_found`; `update` `type`, `durationMin` only (never the snapshot, `scheduledFor`, `mesocycleId`, `performedOn`). Allowed regardless of mesocycle status.

### 11e. Planned cardio writes

- `addPlannedCardio({ mesocycleId, dayOfWeek, type, durationMin })`: parse; `requireEditableMesocycle`; existing row on that day → `conflict` ("Thursday already has cardio.", `details.dayOfWeek`); create. P2002 race → same conflict.
- `updatePlannedCardio({ plannedCardioId, dayOfWeek, type, durationMin })`: parse; load row → `not_found`; lock mesocycle; same day → update type/minutes; different day → target day free else `conflict`; then **delete + create** in the same tx (fresh occurrence floor on the new day).
- `removePlannedCardio({ plannedCardioId })`: load; lock; delete the plan row. CardioLogs untouched.
- `plannedCardioCopies(mesocycleId, sources)`: the single field-by-field copy (dayOfWeek, type, durationMin) used by clone.
- `duplicateSession` is unchanged and never reads/writes planned cardio.

## 12. Validation rules

| Field | Validation | Error |
| ----- | ---------- | ----- |
| `type` (plan + log) | string; trimmed; 1–40 chars | `validation_error`, `details.type`: "Enter the activity." / "Keep it to 40 characters or fewer." |
| `durationMin` (plan + log) | whole number string or integer via `parseWholeNumber`; 1–600 | `validation_error`, `details.durationMin`: "Enter whole minutes, 1 or more." / "Keep it to 600 minutes or fewer." |
| `dayOfWeek` | integer 1–7 | `validation_error`, `details.dayOfWeek`: "Choose a day." |
| `scheduledFor` | real ISO date | `validation_error` |
| ids | UUID | `not_found` |

Rejected: blank, whitespace-only, 0, negative, decimal ("2.5"), exponent, non-numeric. The same pure functions run in the dialogs before submit. DB CHECKs back them.

## 13. UI data contracts

```ts
type PlannedCardioDto = { id: string; dayOfWeek: number; type: string; durationMin: number };
// MesocycleWeekDto.cardio: (PlannedCardioDto | null)[]   // index 0 = Monday
// CloneSetupDto.cardioDayCount: number

type CardioOccurrenceDto = {
  mesocycleId: string;
  scheduledFor: string;        // authored ISO date (occurrence identity)
  dateIso: string;             // effective ISO date (where it shows)
  dateLabel: string;           // "Tue, Oct 13"
  planned: { type: string; durationMin: number };   // the plan (snapshot if logged)
  state: "complete" | "pending" | "upcoming" | "missed";
  log: { id: string; type: string; durationMin: number } | null;
  differsFromPlan: boolean;
};
// DashboardDto: `rest`, `missed_day`, and today states gain `cardio: CardioOccurrenceDto[]`
//   (today's effective date only; authored order). no_plan has none.
// WeekScheduleDto gains `cardio: CardioOccurrenceDto[]` for that week (logged
//   occurrences whose plan row was later removed/moved are still included,
//   placed by the same binding rule on their scheduledFor).
```

`dashboardShowsGoals` is unchanged (kind-based) — cardio does not change when Goals render.

## 14. Testing strategy

### Unit (`tests/unit`)
- `cardio-validation.test.ts`: type/minutes accept/reject table (blank, whitespace, 41 chars, 0, -5, 2.5, "1e2", 601, "20", 20).
- `cardio-schedule.test.ts`: unbound occurrence = authored; bound follows a shifted Session (Tue → Wed); dropped Session → dropped cardio; cardio-only day never moves under a shift; skipped lifting leaves cardio on its date; next week back to authored; occurrence floor; `oldestUnresolvedMissedDay` unchanged by cardio (no cardio input exists); state derivation table (complete/pending/upcoming/missed); scheduled-deload week leaves type/minutes as authored.
- `cardio-actions.test.ts`: each action requires auth first; no action imports goals reconciliation.
- Static guards (`invariant-guards` / `deliberate-absences`): CardioLog written only in `src/lib/cardio/cardio-logs.ts`; PlannedCardio written only in `src/lib/plan/{cardio,mesocycles}.ts`; no `cardioLog.delete*` anywhere; cardio modules never reference `estimateOneRepMax`, `sessionE1rm`, `lib/progression`, `lib/goals`, `isGymVariable`, `gymExerciseBaseline`, `lib/gyms`, `loggedSet`, `loggedExercise`, `sessionExercise`, `exercise.`; progression and goals code never references cardio; `PlannedCardio`/`CardioLog` models carry no metric column (distance, pace, speed, incline, calorie, heart, hr, zone, cadence, step, gps, route, rpe, watt, elevation, note, gym); no timer/health dependency; app routes unchanged.

### Integration (`tests/integration/cardio.int.test.ts`, embedded Postgres)
- Plan: zero/one per day; second on same day → `conflict` and raw insert fails on the unique index; cardio-only and combined days valid; validation rejections write nothing; archived mesocycle read-only; edit type/minutes; move day (conflict when taken); remove keeps CardioLogs; creates no Exercise/SessionExercise/LoggedExercise/LoggedSet.
- Duplicate session: destination day gets no cardio; source cardio unchanged.
- Clone: copies type/minutes/day; copies zero CardioLogs; source untouched.
- logCardio: happy path with snapshot; actual type/minutes differ, plan unchanged; validation (blank, 0, negative, decimal, missing) writes nothing; retry returns `alreadyLogged` without changing the record; concurrent double submit → one row; future occurrence rejected; no planned cardio that day → `not_found`; below floor → `not_found`; non-active mesocycle rejected; no LoggedSession created/changed; Goal rows and baselines byte-identical; LoggedSet rows unchanged.
- editCardioLog: type/minutes persist; invalid rejected and unchanged; snapshot immutable.
- Plan edits after logging never rewrite a CardioLog.
- Shift: Tue Pull + walk missed lifting → `resolveMissedDay(shifted)` → dashboard-for-Wed composition shows the walk; cardio-only Sat unmoved; next week authored.
- Completion independence: logging cardio leaves the LoggedSession `in_progress`/absent; completing a workout leaves cardio pending; cardio-only day completes without any LoggedSession.
- Missed: past unlogged occurrence → `missed`, zero rows created; missed-day prompt query unchanged.
- RLS: `planned_cardio` and `cardio_logs` return nothing via anon key; RLS enabled on every table.

### E2E
- Auth boundary unchanged (no new route). Existing suites stay green.

### Regression
All earlier suites: LoggedSet write path, history integrity, baselines, progression (scheduled-deload suppression), goals, missed-day handling, RLS, migrations safety.

## 15. Acceptance criteria

**Plan**
- [ ] One cardio item (type + minutes) can be added to a day with or without a lifting Session (DoD 1–3).
- [ ] A second planned cardio on the same day is prevented in UI and rejected server/DB-side.
- [ ] Type, minutes, and day can be edited; it can be removed; none of this changes a CardioLog (DoD 4).
- [ ] Duplicating a Session doesn't copy cardio; clone-forward copies planned cardio, not logs (DoD 5).

**Dashboard / logging**
- [ ] Today's cardio shows with today's lifting; lifting keeps the only primary action; cardio-only days get a focal block with primary Log cardio (DoD 6).
- [ ] Logging records actual type + minutes; type and minutes may differ from plan; plan unchanged (DoD 7–9).
- [ ] Invalid minutes/type create no log (DoD 10).
- [ ] At most one CardioLog per occurrence; retry/reopen never duplicates.
- [ ] Cardio and lifting completion are independent (DoD 11).

**History**
- [ ] Logged cardio appears in the week with date, type, minutes; planned comparison when different (DoD 12).
- [ ] Past unlogged cardio shows Missed, no prompt, optional Log.
- [ ] Type/minutes correction persists; no delete exists (DoD 13).

**Isolation**
- [ ] No progression state, e1RM, trend, Goal change, or Gym baseline read/write from cardio (DoD 14–17).
- [ ] Shifted lifting day carries its cardio; cardio never creates a shift; scheduled deload leaves cardio unchanged.

**UI**
- [ ] Implementation materially matches the preview frames.

## 16. Explicit non-goals

- ❌ Cardio progression / Progress / Hold / Deload / e1RM / trend / PRs / streaks. **Permanent.**
- ❌ Cardio Goals. **Permanent** for this product version.
- ❌ Distance, pace, speed, incline, resistance, watts, calories, heart rate/zones, cadence, steps, elevation, GPS/route. **Deferred.**
- ❌ HealthKit / Apple Health / Strava / Garmin / Fitbit / wearables. **Deferred** (needs native app).
- ❌ Timer/stopwatch. **Deferred** (not planned).
- ❌ Multiple cardio blocks per day; ad-hoc cardio logs; CardioLog deletion. **Deferred**, deliberately.

## Resolved Decisions

### Pre-resolved by the run (approved authority)

| # | Decision | Rationale |
| - | -------- | --------- |
| R1 | Planned cardio (`PlannedCardio`) and `CardioLog` are separate records; neither writes the other. | Plan is intent, log is history (mirrors Session vs LoggedSession). |
| R2 | Planned cardio belongs to the Mesocycle weekday schedule, not `SessionExercise`; never an Exercise/SessionExercise/LoggedExercise/LoggedSet; no cardio in the Exercise Library. | Cardio is its own domain; cardio-only days have no Session. |
| R3 | A day may have lifting, cardio, both, or neither; Pitch 3's zero-or-one Session rule unchanged. | PRD "Tuesday = Pull + 20 min incline walk". |
| R4 | At most one planned cardio item per Mesocycle weekday (product default introduced by Pitch 7). | Approved docs describe one cardio session per day; keep MVP minimal. |
| R5 | Planned cardio fields: type + planned minutes only. | PRD: type + duration only. |
| R6 | Cardio type = required human-readable text; static suggestions only; no CardioType table. | No taxonomy needed; free text accepted. |
| R7 | Minutes are required positive whole numbers; no seconds; no timer. | Records duration, doesn't time it. |
| R8 | Planned cardio can be added in draft and active mesocycle builders. | Same editability as Pitch 3 plan rows. |
| R9 | Planned cardio type, minutes, and day can be edited; edits never rewrite CardioLogs. | Plan ≠ history. |
| R10 | Removing planned cardio never deletes CardioLogs. | History is factual. |
| R11 | Session duplication never copies cardio. | Cardio belongs to the day, not the Session template. |
| R12 | Clone-forward copies planned cardio type, minutes, and day; never CardioLogs or completion. | Plan-forward, never history-forward. |
| R13 | Plan-first logging only; no detached "log cardio" flow (product default introduced by Pitch 7). | Approved definition: cardio is assigned to days, then logged. |
| R14 | Today's planned cardio shows with today's training. | Pitch DoD 6. |
| R15 | An unresolved lifting Session stays the primary dashboard action; cardio's Log is secondary on a combined day. | Lifting is the main workflow. |
| R16 | Cardio-only days get a real dashboard state; no fake LoggedSession/Session. | A cardio-only day is a training day. |
| R17 | CardioLog stores actual type + minutes plus occurrence context; no strength fields. | |
| R18 | The log dialog is prefilled with the planned type and minutes; nothing persists until a valid Save. | Easy confirm; opening writes nothing. |
| R19 | Actual minutes may differ from plan; the plan is never auto-changed. | Record reality, no judgment. |
| R20 | Actual type may differ from plan; no Cardio Swap model. | |
| R21 | Actual minutes must be positive whole numbers; invalid input writes nothing. | |
| R22 | Actual type is required; blank/whitespace rejected. | |
| R23 | Cardio never asks for a Gym, location, GPS, or equipment. | |
| R24 | One planned occurrence ⇒ at most one CardioLog; reopening shows the existing record. | Stable identity. |
| R25 | Retries are safe server-side (unique key + idempotent return), not by client assumption. | |
| R26 | An occurrence is complete iff a valid CardioLog exists; never inferred from lifting, date, or opening the form. | |
| R27 | Lifting and cardio completion are independent; no combined transaction; no fake LoggedSession. | |
| R28 | Cardio never changes LoggedSession completion semantics. | Pitch 4 authority. |
| R29 | Day-level status is derived for display; no stored "day complete". | Derived-on-read posture. |
| R30 | Cardio appears in the existing week history, day-oriented. | No second history app. |
| R31 | History detail is date, type, minutes, and planned comparison only; no analytics. | |
| R32 | CardioLog type and minutes can be corrected via an authenticated server action. | Entry mistakes. |
| R33 | No CardioLog deletion (hard or soft). | Architecture lists create/read; correction only beyond that. |
| R34 | Correcting cardio has no progression/Goal/baseline side effect. | Cardio is isolated. |
| R35 | Missed cardio never triggers Log late / Shift / Skip. | That workflow has lifting-week semantics. |
| R36 | Past unlogged cardio is shown as Missed; no CardioLog fabricated; no shift. | |
| R37 | Missed cardio never prompts or interrupts. | Dashboard focuses on today. |
| R38 | Cardio bound to a split day follows Pitch 4's effective (shifted) date. | One calendar. |
| R39 | Cardio never initiates a shift; a missed cardio-only day changes nothing. | Only the lifting engine shifts. |
| R40 | Cardio reuses `effectiveWeekSchedule` / `authoredDate`; no second date-resolution algorithm. | |
| R41 | Scheduled deload never modifies cardio; no cardio deload state. | Deload is a strength-load system. |
| R42 | No CardioLog reaches any progression evaluator. Permanent. | |
| R43 | No e1RM for cardio; `estimateOneRepMax` is never imported by cardio code. | |
| R44 | No cardio trend, minutes chart, PRs, or streaks. | Roadmap: no trend for cardio. |
| R45 | No cardio Goals; CardioLog never changes Goal progress. | Goals are strength-Exercise only. |
| R46 | Cardio types are not Exercise records (no muscle, equipment, Favorite, Swap). | |
| R47 | Cardio never calls baseline establishment/correction or `isGymVariable`. | |
| R48 | Clone copies cardio plan, never history or missed state; new block starts with new occurrences. | |

### Resolved during this run

| # | Decision | Rationale |
| - | -------- | --------- |
| R49 | New model `PlannedCardio` (`planned_cardio`): `mesocycleId`, `dayOfWeek` 1–7, `type`, `durationMin`; `@@unique([mesocycleId, dayOfWeek])`; FK Restrict; RLS deny-all; CHECKs. | Zero/one per day enforced in DB too; Restrict because later migrations never cascade and mesocycles are never deleted. Upstream amendment (planned-cardio object). |
| R50 | `CardioLog` identity = `@@unique([mesocycleId, scheduledFor])` (authored date); no FK to `PlannedCardio`. | ≤ 1 planned cardio per weekday makes (mesocycle, authored date) the natural occurrence key — same shape as `MissedDayResolution` and `LoggedSession.scheduledFor`. No FK means plan edits/removal cannot touch history. Satisfies Architecture's "referencing the day it was assigned/logged against". |
| R51 | `CardioLog` stores an immutable plan snapshot (`plannedType`, `plannedDurationMin`) of the plan as it stands when logged. | History stays intelligible after plan edits (mirrors Pitch 4's LoggedExercise snapshot). A late log after an in-place plan edit snapshots the edited plan; true plan-at-occurrence needs plan versioning (deferred, review finding 2). |
| R52 | New `cardio_logs` columns are NOT NULL without defaults. | The table has never been written (static guard since Foundation); a non-empty table would make the migration fail loudly and change nothing — never silent backfill. |
| R53 | Limits: type ≤ 40 chars; minutes 1–600. | Input-sanity bounds like Pitch 3's (`PLANNED_SETS_MAX`), not product rules. |
| R54 | Bound vs unbound: cardio on a weekday with a scheduled Session takes that Session occurrence's `effectiveIso` (null if dropped); cardio-only weekdays use the authored date. | Pitch rule 31 ("moves only if bound to that day's effective schedule"); reuses the scheduler's output instead of re-implementing shift. |
| R55 | A lifting `skipped`/`logged_late` resolution leaves bound cardio on its authored date and independently loggable/missable. | The scheduler leaves `effectiveIso` unchanged for those outcomes; cardio completion is independent (R27). |
| R56 | Occurrence floor: occurrences exist only from the PlannedCardio row's `createdAt` UTC date onward; moving cardio to another day is delete + create (new floor). | Adding cardio mid-block (the likely first use after deploy) must not invent "Missed" rows in earlier weeks. Derived, no new column. |
| R57 | A CardioLog shows on the day it was performed (`performedOn`, the occurrence's effective date when logged); a later lifting shift never moves cardio already done, and a log stays visible after its plan row is moved or removed. Unlogged occurrences follow the binding rule. | Amended by review (finding 1): the stored fact beats re-deriving from a schedule that changed afterward. |
| R58 | `performedOn` = the occurrence's effective date (UTC midnight) at log time. | Mirrors `LoggedSession.performedOn = date`; no wall-clock time is meaningful for a duration record. |
| R59 | Loggable iff: mesocycle is active; occurrence exists (planned cardio on that weekday, within the block's weeks, above the floor); not dropped; effective date ≤ today (UTC). | Plan-first; no future logs; "today" follows the app's all-UTC convention. |
| R60 | Missed cardio can optionally be logged later from History (no prompt). | CLAUDE.md: the lifter "logs later if the gym has no signal"; plan-first is preserved (it is still a planned occurrence). |
| R61 | Retry semantics: an existing CardioLog for the occurrence → `ok: true, alreadyLogged: true`, record unchanged; P2002 race → same. | Idempotent and never a silent overwrite; correction is the explicit separate action. |
| R62 | `editCardioLog` updates `type` and `durationMin` only, in any mesocycle status. | Factual correction; snapshot and identity are immutable. |
| R63 | Planned-cardio writes live in `src/lib/plan/cardio.ts` (plus clone in `mesocycles.ts`); CardioLog writes only in `src/lib/cardio/cardio-logs.ts`; plan modules still never touch `cardioLog`. | Plan vs history separation enforced by static guards. |
| R64 | Removing planned cardio is a hard delete of the plan row (plan authoring, like `removeSession`), behind an AlertDialog. | It is plan, not history; logs are unaffected (no FK). |
| R65 | No new routes; all cardio interactions are dialogs on `/`, `/plan/[id]`, `/history`. | Smallest integration; routes guard unchanged. |
| R66 | Dashboard DTO adds `cardio[]` to existing kinds instead of new kinds; a cardio-only day stays `kind: "rest"` (no lifting) and renders cardio as the focal block. | Keeps Pitch 4/5/6 state machines and `dashboardShowsGoals` unchanged (Goals isolation). |
| R67 | During a lifting missed-day prompt, today's cardio renders dimmed below it like today's lifting. | Pitch 4 behavior: the prompt is resolved first (one tap); cardio never prompts. |
| R68 | Two cardio occurrences may share an effective date (a shifted bound one landing on a cardio-only day); both are listed in authored order, each loggable. | One-per-day is a plan rule; effective collisions are rare and honest. |
| R69 | Cardio activity suggestions: static list (Incline Walk, Treadmill, Stair Climber, Bike, Elliptical, Rowing, Outdoor Walk) via native `<datalist>`. | Convenience only; no new library or table. |
| R70 | Plan readiness/activation ignores cardio. | Cardio has no repair states; activation rules are Pitch 3's. |
| R71 | No cardio action calls goal reconciliation, progression reads, or baseline functions. | Isolation (R34, R42–R47). |
| R72 | Preview written as `.tsx` at the run's gated path (Pitch 4–6 precedent). | Run prompt gate; skill/stored-preference conflict re-flagged in the report. |

## 17. Open questions

None blocking. Carried to the report as upstream amendments: planned-cardio object in the Architecture data model; the eleven pitch amendments; the preview-format convention.

## 18. Future considerations

- `PlannedCardio`/`CardioLog` are shaped so a later mobile/health build could add optional metric columns or multiple items per day without touching the plan-first identity (a multi-item future would add an item index to the key).
- Ad-hoc cardio could be added later as logs with a null occurrence, deliberately — not in this pitch.
