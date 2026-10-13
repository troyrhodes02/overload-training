# Pitch 7 — Cardio Logging — Run Report

Autonomous pipeline run for **Cardio Logging** (slug `07-cardio-logging`), Linear
project **Overload V1** (`P-OVE-1`). Classification: UI-bearing, merge-on-green
(adds `PlannedCardio` and `CardioLog` writes only; never writes, deletes, or edits
`LoggedSet` history, never alters Gym baselines, RLS posture, or auth).

> **Strength training is interpreted. Cardio is recorded.**

## Delivery

- **Feature PR:** [#40](https://github.com/troyrhodes02/overload-training/pull/40) — `feat/07-cardio-logging` → `main`
- **Merge status:** __MERGE_STATUS__
- **Linear issues** (milestone *Cardio Logging*, `eea0888a-1b50-47c8-b075-d4a8460b7c64`; chained via blockedBy; all In Review with PRs merged into the feature branch):
  - **OVE-33** — Planned cardio: model, builder add/edit/remove, clone-forward — PR #41
  - **OVE-34** — Cardio occurrences, idempotent CardioLog, and Today's cardio — PR #42
  - **OVE-35** — Cardio in History: day-grouped week, missed, log-late, correction — PR #43
- **Artifacts:** pitch `pitches/07-cardio-logging.md`; design `docs/design/07-cardio-logging-design-doc.md`; preview `docs/previews/07-cardio-logging-preview.tsx`; spec `docs/specs/07-cardio-logging-spec.md` (Resolved Decisions R1–R72); runbook `docs/runs/07-cardio-logging-runbook.md`; progress `docs/runs/07-cardio-logging-progress.md`.

## Planned cardio model

New model **`PlannedCardio`** (`planned_cardio`, migration `6_cardio_logging`):

| Field | Notes |
| ----- | ----- |
| `mesocycleId` | owning Mesocycle, FK `ON DELETE RESTRICT` (mesocycles are never deleted) |
| `dayOfWeek` | 1–7 (CHECK); planned cardio is always on a day |
| `type` | required human-readable text, trimmed, 1–40 chars (CHECK); no taxonomy table; static suggestions via native `<datalist>` only |
| `durationMin` | whole minutes 1–600 (CHECK) |

- **Ownership:** the Mesocycle's **day schedule** — not a `Session`, `SessionExercise`, or `Exercise`. A day may hold lifting, cardio, both, or neither; Pitch 3's zero-or-one Session per weekday is unchanged.
- **Cardinality:** zero or one per weekday — unique `(mesocycle_id, day_of_week)` plus an app-level `conflict` ("Thursday already has cardio."); the day picker disables days that have cardio.
- **Writes:** only `src/lib/plan/cardio.ts` (add / update / remove) and clone-forward in `src/lib/plan/mesocycles.ts` (static guard). Draft and active blocks are editable; archived blocks are read-only. Moving cardio to another day is delete + create in one transaction (so the new day's occurrences start now).
- **Session independence:** `duplicateSession` is untouched and never copies cardio (integration-tested). Activation readiness ignores cardio.
- **RLS:** `planned_cardio` has `ENABLE ROW LEVEL SECURITY` with no policy; the RLS integration test's anon-key sweep covers it.

## CardioLog model

`CardioLog` (existing Foundation table, never written before) extended:

| Field | Notes |
| ----- | ----- |
| `mesocycleId`, `scheduledFor` (DATE) | the planned occurrence: the authored date of that weekday in that week. **Unique together** — the identity and idempotency key |
| `plannedType`, `plannedDurationMin` | immutable snapshot of the plan the record fulfilled |
| `type`, `durationMin` | what was actually done (may differ from plan); correctable; CHECKed like the plan |
| `performedOn` | the occurrence's effective date at log time |

- **Planned-occurrence relationship:** no FK to `PlannedCardio`, so editing, moving, or removing the plan can never touch a record (integration-tested: the row is byte-identical after edit + move + remove).
- **Identity / idempotency:** `logCardio` returns `{ cardioLogId, alreadyLogged: true }` **unchanged** for an existing occurrence; a concurrent double submit loses the unique index (P2002) and is returned the same way. Integration-tested: retry with different values leaves the row untouched; `Promise.all` of two submissions records exactly one.
- **Loggable iff:** the block is active; the occurrence exists (planned cardio on that weekday, within the block, on/after the plan row's creation date); a shift did not drop it; effective date ≤ today (UTC). Plan-first: no ad-hoc logs.
- **Correction:** `editCardioLog` updates `type` and `durationMin` only, any mesocycle status.
- **No delete:** no delete path exists anywhere (static guard: no `cardioLog.delete*` in `src`).

## Completion

- An occurrence is **complete iff a CardioLog exists** for it; otherwise pending (today), upcoming, or missed — derived on read, nothing stored.
- **Independent of lifting:** logging cardio leaves the LoggedSession absent/in-progress; completing the workout leaves cardio pending; neither row is changed by the other (integration-tested both ways).
- **Cardio-only day:** the dashboard stays `kind: "rest"` for lifting and renders cardio as the focal block with a primary **Log cardio**; no Session or LoggedSession is created (integration-tested).

## Schedule integration

- **Effective dates reuse Pitch 4:** `src/lib/cardio/schedule.ts` consumes `effectiveWeekSchedule`/`authoredDate` — cardio on a weekday with a scheduled Session is bound to that occurrence (its `effectiveIso`; dropped with it); cardio-only weekdays use the authored date. No second shift algorithm; the shared `ScheduleContext` loader (`src/lib/logging/schedule-context.ts`) was extracted behavior-preservingly from `activeContext`.
- **Effective lifting shift:** a shifted Pull day carries its Incline Walk to the new date; the Saturday cardio-only Bike stays; the next week returns to the authored schedule (unit + integration tests, via the real `resolveMissedDay`).
- **Cardio never initiates a shift:** `oldestUnresolvedMissedDay` has no cardio input; a missed cardio-only day produces no `missed_day` dashboard state and no resolution (integration-tested; the scheduler, missed-day, and logged-set modules contain no cardio reference — static guard).
- **Missed cardio:** past unlogged occurrences are shown as **Missed** in History (muted second line) with an optional **Log**; no CardioLog is fabricated, no prompt, no interruption on app open.
- **Scheduled deload:** cardio has no deload input at all; a deload week's cardio is exactly as authored (unit-tested).

## Clone behavior

- `cloneMesocycle` copies each planned cardio item's day, type, and minutes via the single `plannedCardioCopies` helper; the clone summary shows "Cardio on N days" and states cardio logs aren't copied.
- **Proof no history copies:** integration test seeds a CardioLog on the source, clones, and asserts the clone has zero CardioLogs, the total is still one, and the source plan is untouched.

## Isolation

Stated and proven (static guards in `tests/unit/invariant-guards.test.ts` unless noted):

- **No progression:** cardio code (`src/lib/cardio`, `src/components/cardio`) never references `lib/progression`; progression code contains no cardio reference; cardio actions never call goal reconciliation, progression reads, or baseline functions (`tests/unit/cardio-actions.test.ts`).
- **No e1RM:** `estimateOneRepMax` / `sessionE1rm` never referenced by cardio code; still defined once.
- **No Goals:** no cardio reference in goal code; CardioLog creation leaves Goal rows byte-identical (integration).
- **No Gym baseline:** no `isGymVariable`, `gymExerciseBaseline`, or `lib/gyms` in cardio code; baselines unchanged by logging (integration). No Gym field anywhere on cardio.
- **No Exercise Library representation:** `PlannedCardio`/`CardioLog` have no exercise/session columns; planning cardio creates no Exercise, SessionExercise, LoggedExercise, or LoggedSet (integration).
- **No health data / extra metrics:** the cardio models contain no distance/pace/speed/incline/resistance/watts/calories/heart/zone/cadence/steps/elevation/GPS/route/RPE/notes column; no timer, HealthKit, wearable, or GPS dependency.

## UI

- **Preview:** `docs/previews/07-cardio-logging-preview.tsx` — written as `.tsx` per the run prompt's explicit gate and the Pitch 4–6 precedent; the `overload-ui-design` skill and a stored preference default to a standalone `.html` gallery. **Still unresolved upstream — see amendment 15.**
- **Conformance:** verified in a real browser (production build, local Supabase auth, a throwaway local database and a temporary local-only user, both removed afterward): phone 375px light + dark and desktop 1280px — plan week with cardio lines, Add cardio dialog and day picker (days with cardio disabled), add → toast → edit → remove confirm; cardio-only dashboard (focal block + primary Log cardio); combined day (Start workout the only primary, cardio card with secondary Log); log dialog prefilled, validation, save → "✓ Incline Walk — 23 min / Planned 20 min"; History week 4 and week 3 (changed-type comparison, Missed + Log, cardio-only Saturday), correction, log-late. Zero console errors; no horizontal overflow.
- **Justified deviations:** (1) Remove-from-plan uses an outline button, not destructive red — Pitch 3's established "authoring, not destruction" convention; the preview and design doc were aligned. (2) The cardio-only **Log cardio** sits directly under its card (where **Start workout** sits on lifting days) rather than in the thumb bar drawn in the preview. (3) A missed History line puts "Missed" on a muted second line so the activity never truncates at 375px.

## Verification

__VERIFICATION__

## Review

__REVIEW__

## Required upstream amendments

Recorded per the run prompt; no approved planning doc was edited.

1. **Planned cardio object:** the Architecture data model defines `CardioLog` but no planned-cardio representation; add `PlannedCardio` (Mesocycle-owned, weekday, type, minutes) to the entity list beside `Session`.
2. **One planned cardio item per day:** MVP cardinality is zero-or-one per Mesocycle weekday (DB-enforced).
3. **Cardio type:** required human-readable text (1–40 chars), not a canonical taxonomy.
4. **Plan-first logging:** a CardioLog records a planned occurrence; no detached ad-hoc cardio logging in MVP.
5. **Actual differs from plan:** logged type/minutes may differ without rewriting planned cardio; the log keeps a plan snapshot.
6. **Combined-day completion:** lifting and cardio completion are independent and derived.
7. **LoggedSession isolation:** cardio never alters the lifting LoggedSession completion invariant.
8. **Missed cardio:** past unlogged cardio is shown as missed and never invokes Log late / Shift / Skip; it may optionally be logged later from History (CLAUDE.md "logs later if the gym has no signal").
9. **Shift integration:** cardio on a weekday with a lifting Session follows that occurrence's effective (shifted) date; cardio-only days never move; cardio never initiates a shift.
10. **Scheduled deload:** no automatic cardio adjustment.
11. **Clone-forward:** copies planned cardio, never CardioLog history.
12. **Historical correction:** CardioLog type/minutes editable; deletion out of scope.
13. **Permanent isolation:** no progression, e1RM, Goals, Gym baseline, or health-data behavior for cardio.
14. **CardioLog identity:** Architecture's "referencing the day it was assigned/logged against" is realized as unique `(mesocycleId, scheduledFor)` (authored date), not a foreign key to the plan row; the API surface gains "correct" beside "create, read".
15. **Preview format:** run prompts name `.tsx` previews while the `overload-ui-design` skill and a stored preference say a standalone `.html` gallery. Pitches 4–7 followed the run prompts. One convention should be chosen upstream.
16. **CLAUDE.md client islands:** the enumerated interactive islands should add the cardio dialogs (plan cardio, log/correct cardio).
17. **CLAUDE.md Secrets/Workflow drift (pre-existing, observed):** the root `CLAUDE.md` says production is the only cloud project, while `.claude/CLAUDE.md` and the Workflow section still mention "Previews run against the Supabase dev project"; the two copies should be reconciled.

## MVP completion status

__MVP__

## Halt / resume

__HALT__
