# Split & Mesocycle Builder — Autonomous Run Report

**Pitch:** Overload — Pitch 3: Split & Mesocycle Builder (slug `03-split-mesocycle-builder`)
**Project / milestone:** Overload V1 → Split & Mesocycle Builder
**Date:** 2026-10-08

## Feature PR and merge status

- **PR #17 — https://github.com/troyrhodes02/overload-training/pull/17** (`feat/03-split-mesocycle-builder` → `main`).
- **Merged into `main`** by squash under the run's merge-on-green rule, after review, audit, and a final full green verification of the exact tree that was merged. See "Final merge" at the end.
- ⚠️ **Merging to `main` deploys production.** The new code needs migrations `2_mesocycle_draft_status` and `3_split_mesocycle_builder`. Until a human applies them (runbook **B1**), `/plan` shows the error page. No data is at risk: reads fail and writes are rejected. `/`, `/exercises`, and `/gyms` keep working. The Pitch 2 code never reads plan tables, so B1 can be applied **before** the merge deploys.

## What was built

The lifter can author a training block on a phone:

- **Plan home** (`/plan`) shows the active block, drafts, and previous blocks, with New mesocycle and Clone previous.
- **New mesocycle** takes a name, a calendar start date (never pre-filled), length and deload week (5 / 5 as editable pre-fills), and a structure (Push / Pull / Legs, Arnold, Bro, or Custom), shown as radio cards that list the exact days they create.
- **The week** (`/plan/[id]`) shows seven rows, Monday first, with one session or "Rest" per day and "Not on the schedule" below. It has:
  - a readiness checklist whose rows link to each fix;
  - Activate, with confirmation, which archives the previous active block in the same transaction;
  - Archive draft and Edit details.
- **Sessions** can be added on a rest day, renamed, moved (occupied days ask before replacing, and the displaced session is kept unscheduled), duplicated onto another day as an independent "<name> Copy", and removed.
- **The session builder** lists exercises in the lifter's order with "3 sets · 6–8 reps"; tapping a row edits it, and reorder mode uses up/down buttons. Archived exercises stay in their slot, marked "Archived · Replace or remove it".
- **The exercise picker** (`…/add`) is the Exercise Library's own search, Favorites, and primary-muscle filter. Sets and reps are typed into empty fields; exercises already in the session show "In session". Replace mode keeps sets, reps, and position.
- **Clone-forward** (`/plan/clone…`) creates a new draft from an active or archived block, defaulting to "<name> Copy" and starting the day after the source ends. It copies the plan only, and archived exercises come across for repair.

## Linear issues (actual identifiers)

| Ticket | Title | PR | Squash commit on feature | State |
| ------ | ----- | -- | ------------------------ | ----- |
| OVE-15 | Mesocycle lifecycle & setup | #18 | 274b7a2 | Done |
| OVE-16 | Weekly schedule & sessions | #19 | 9bfb07a | Done |
| OVE-17 | Session exercises & picker | #20 | 0fa096e | Done |
| OVE-18 | Session duplication | #21 | d9c3988 | Done |
| OVE-19 | Clone-forward | #22 | ca1ac4d | Done |

Milestone **Split & Mesocycle Builder** (`ae401c89-53ef-4861-a927-383dc8fec443`). The blockedBy chain is OVE-15 ← 16 ← 17 ← 18 ← 19. The branches were stacked.

Each later PR needed the feature branch merged into its branch before it could squash, because of add/add conflicts left by the squash. Before resolving each one to the ticket side, I verified two things: the feature tree's code was byte-identical to the previous ticket's, and the resulting merge commit changed no code. No force-push was used.

## Product defaults introduced by this pitch

### Preset structures (structure only — no exercises, sets, reps, or weights)

| Preset | Mon | Tue | Wed | Thu | Fri | Sat | Sun |
| ------ | --- | --- | --- | --- | --- | --- | --- |
| **Push / Pull / Legs** | Push Day 1 | Pull Day 1 | Leg Day 1 | Push Day 2 | Pull Day 2 | Leg Day 2 | Rest |
| **Arnold Split** | Chest & Back 1 | Shoulders & Arms 1 | Legs 1 | Chest & Back 2 | Shoulders & Arms 2 | Legs 2 | Rest |
| **Bro Split** | Chest | Back | Shoulders | Legs | Arms | Rest | Rest |
| **Custom** | Rest | Rest | Rest | Rest | Rest | Rest | Rest |

Each preset session is its own record, starts empty, and is fully editable. Integration tests prove each preset creates exactly these sessions and **zero** `session_exercises`. A static test proves the preset module contains no exercise, set, rep, or weight data.

### Other defaults
- 5-week length and deload week 5 are pre-fills only. Any length from 1 to 52 is valid, and so is any deload week inside the block.
- **One occurrence of an exercise per session** is enforced in the app and by a unique index (pre-resolved §20).
- **Zero or one lifting session per weekday** is enforced in the app and by a unique index (§14).

## Mesocycle lifecycle and activation

- **States:** `draft` → `active` → `archived`, plus `draft` → `archived` (Archive draft).
  - New and cloned mesocycles are always drafts.
  - Archived mesocycles are read-only and cloneable; there is no unarchive.
  - Mesocycles are never deleted.
- **Activation (`activateMesocycle`)** is one transaction:
  1. The target must be a draft.
  2. `evaluateReadiness` is re-run inside the transaction.
  3. The currently active block must be the one the lifter confirmed replacing (`expectedActiveId`; a mismatch is a `conflict` and nothing changes).
  4. The previous active block is archived, then the draft is activated.
- **One active block at most**, enforced twice: by the transaction, and by the partial unique index `mesocycles_single_active` (the DB rejects a second active). A CHECK keeps an active block well-formed: it has a start date and a deload week inside the block.
- **Readiness** (computed on read, never stored): a name; a start date; a valid length; a deload week inside the length; at least one scheduled session; every scheduled session non-empty; every slot with valid sets and rep range; no archived exercise anywhere in the plan. Rest days are valid, and empty **unscheduled** sessions don't block.
- **An active block stays editable.** If an edit, or archiving an exercise in the library, makes it not-ready, it stays active and shows "Needs attention".

## Calendar semantics (D59)
`start_date` is a calendar `DATE`. Weeks are 7-day blocks anchored at the start date, whatever weekday it falls on. The planned end is `start + 7·length − 1`. All week math lives in `src/lib/plan/calendar.ts` (`mesocycleWeekForDate` is defined for Pitches 4 and 5; no "current week" UI was built).

## Clone-forward defaults and behavior

- **Sources:** the active block and archived blocks. Drafts are refused.
- **Defaults** (all editable):
  - name `"<source name> Copy"`;
  - start date = the **source's planned end + 1 calendar day** (empty if the source had no start date);
  - the source's length and deload week;
  - split type carried over.
- **Copies:** every session (name, day) and planned exercise (exercise, order, sets, rep range), field by field, in one transaction. The source is never mutated (tested by a deep snapshot).
- **Never copies:** logged sessions, exercises, or sets; goals; gym baselines; completion; progression. Tested with seeded history: counts are unchanged. No lineage column exists.

## Archived-exercise repair behavior

- An archived reference is **derived**: a planned exercise whose `Exercise.deletedAt` is set. No new column or table was needed (D43), so there's no data-model amendment for it.
- Duplicates and clones copy the slot as-is. It is never dropped, substituted (not even with a same-muscle favorite), or un-archived.
- The slot reads "Archived · Replace or remove it", the week row says "1 to fix", and the readiness checklist links straight to the slot.
- **Replace** keeps sets, rep range, and position. **Remove** deletes only the plan slot. Either one clears the readiness issue.

## UI preview and implementation fidelity

- **Preview:** `docs/previews/03-split-mesocycle-builder-preview.html`. It is a static, offline design-handoff gallery, regenerated in the format you asked for during the run.
- **Did the implementation match the preview?** Yes, for hierarchy, controls, state presentation, copy, and phone-first layout. I checked each ticket against the preview with headless-Chrome screenshots of the real app (local Supabase stack, local-only account), at 390px in light mode, with the repair flow also in dark mode.
- **Deviations:**
  - dialog buttons stack in shadcn's order (primary above Cancel at base), as the preview's dialogs do;
  - a few screens add small text the preview didn't show: a "draft can be saved incomplete" note on Edit details, and "Ends …" under the start date. Both come from the design doc.

## Final verification (the audited feature branch at `13361a8`, run with throwaway DB overrides)

Every check below actually ran on the final tree, after the review fixes:

| Check | Command | Result |
| ----- | ------- | ------ |
| Lint | `npm run lint` | ✅ |
| Format | `npm run format:check` | ✅ |
| Schema | `npx prisma validate` | ✅ |
| Build | `npm run build` | ✅ |
| Typecheck | `npm run typecheck` | ✅ |
| Unit | `npm test` | ✅ 158 / 15 suites |
| Integration | `npm run test:integration` (embedded Postgres 18) | ✅ 128 / 13 suites (54 standing + 74 plan) |
| Browser | `npm run test:e2e` (Playwright, system Chrome) | ✅ 17 |
| Client-bundle guard | `npm run verify:client-bundle` | ✅ |
| Manual browser flows | headless Chrome, 390px, against the local stack | ✅ every ticket's flows, plus a post-audit smoke (stale replace link, duplicate, clone); zero console errors |

The standing invariant tests from earlier pitches are included and green:
- RLS is on every table, with zero policies;
- the anon role reads nothing;
- `Restrict` blocks hard deletes;
- no derived columns, and no ownership column;
- the static `LoggedSet` write guard;
- secret hygiene;
- migration safety, which now also covers migrations 2 and 3: no DROP, RENAME, INSERT, DELETE, cascade, or policy;
- the schema-drift guard: migrations match `schema.prisma`, and a partial index and CHECKs are drift-compatible.

### Pitch 3 behaviors proven, and where

**Lifecycle** (`plan-lifecycle.int.test.ts`, `plan-review-fixes.int.test.ts`)
- New mesocycles are drafts, and incomplete drafts save.
- An incomplete draft can't activate, and a valid one does.
- Two active mesocycles are impossible: the app conflicts, and the DB unique index rejects both an insert and a raw UPDATE.
- Activation archives the previous active block in the same transaction.
- A stale confirmation is refused, and nothing changes.
- A concurrent archive and activation are serialized by the row lock.
- Archived blocks are readable, read-only, and cloneable.

**Configuration**
- Defaults are 5 / 5, any valid length or deload week works, and a deload week past the end is saved in a draft and surfaced, never moved.
- An active block rejects a missing start date or an out-of-range deload week (app and DB CHECK).
- The start date is required to activate.

**Presets**
- PPL, Arnold, Bro, and Custom create exactly the approved weeks, each verified.
- They create zero `session_exercises`, so no planned sets, rep ranges, or weights.
- A favorite in the library is not picked up.
- The preset module statically contains no programming data.

**Weekly schedule** (`plan-sessions.int.test.ts`)
- A rest day is valid, and one session on a day is valid.
- A second session on the same day is impossible (app and DB).
- An occupied day isn't overwritten without an explicit replace, and the displaced session is kept unscheduled.

**Session builder** (`plan-session-exercises.int.test.ts`)
- The session name is required; an empty draft session is OK, but an empty scheduled session blocks activation.
- Only active library exercises can be added, and archived ones are absent from the picker query.
- No duplicate exercise in a session.
- sets ≥ 1, reps ≥ 1, min ≤ max, equal values valid, never swapped.
- Order persists.
- Removing a slot leaves the Exercise row identical, including its favorite flag.

**Duplication** (`plan-duplicate.int.test.ts`)
- The copy is a separate row; its exercises, order, sets, and reps match.
- Edits are independent both ways, and removing the copy keeps the source.
- An archived slot is copied as a repair slot, and no history is copied.

**Clone-forward** (`plan-clone.int.test.ts`)
- The clone is a new draft, and the source is deep-unchanged.
- Sessions, days, names, exercises, order, sets, reps, length, deload week, and split type are copied, and the copy is independent.
- Defaults are "Copy" and end + 1 day, all editable.
- No logged sessions, sets, goals, or baselines are copied, tested against seeded history.
- Archived references are preserved, not reactivated, and not substituted (not even with a same-muscle favorite); the clone can't activate until they're repaired.
- A clone of a clone has no lineage column.

**UI contract**
- Every ticket was compared against the preview with real-app screenshots (see "UI preview and implementation fidelity").

**Deliberate absences** (`deliberate-absences.test.ts`)
- No logged-history, baseline, goal, or cardio write anywhere.
- Plan rows are written only by the two plan modules, and the plan modules never touch logged, goal, baseline, or cardio tables.
- No `isGymVariable`, progression, e1RM, swap, missed-day, or logging code; no completion or shift code.
- `SessionExercise` has no weight field, and `Session` / `Mesocycle` have no gym and no outcome fields.
- Plan code never consults Favorites and never generates or suggests programming.
- The only app routes are exercises, gyms, and plan.

**Auth boundary**
- Every plan action calls `requireUser()` first; a unit test enumerates every exported action.
- Every `/plan…` route redirects when signed out (Playwright, 8 routes).

## Review findings and dispositions

`/code-review high 17 --comment` left 9 inline findings on PR #17. `/overload-review-audit` dispositions were posted as replies on each comment. The fixes are in commit `13361a8`.

| # | Finding | Validity / scope | Disposition |
| - | ------- | ---------------- | ----------- |
| 1 | An active block's start date, length, deload week, or rep ranges can change after workouts are logged, remapping history | VALID as a future risk / NEW_TICKET. No logs can exist until Pitch 4, and pre-resolved §37 forbids pre-building versioning | **DEFERRED → OVE-20** (Backlog, Pitch 4/5) |
| 2 | Status checked and then written without a lock (race between tabs) | VALID / IN_SCOPE | **IMPLEMENTED:** `SELECT … FOR UPDATE` row lock in every plan write and in activation, with a concurrency regression test |
| 3 | A stale `expectedActiveId` conflict never refreshes | VALID / IN_SCOPE | **IMPLEMENTED:** refresh on a refused activation, with a unit test |
| 4 | A huge length crashes the form's "Ends …" line | VALID / IN_SCOPE | **IMPLEMENTED:** computed only within 1–52 |
| 5 | A stale `?replace=` silently becomes add mode | VALID / IN_SCOPE | **IMPLEMENTED:** explicit "isn't in this session anymore" state, browser-verified |
| 6 | Unscheduled session order isn't stable (same `createdAt` within one transaction) | VALID / IN_SCOPE | **IMPLEMENTED:** `Session.position` set by presets, add, duplicate, and clone; reads order by it; regression test |
| 7 | DB errors mapped to friendly errors inside a caller's (aborted) transaction | VALID / IN_SCOPE | **IMPLEMENTED:** `mapDbErrors` maps only when the module owns the transaction; tests cover both branches |
| 8 | Duplicated helpers and slot-copy logic | VALID / IN_SCOPE (drift hazard) | **IMPLEMENTED:** `write-support.ts`, one copy mapping shared by duplicate and clone |
| 9 | `getSessionDetail` over-fetches the plan graph (home, clone lists, clone loop) | VALID, negligible | **IMPLEMENTED** for `getSessionDetail`; **SKIPPED** for the lists (readiness counts need the graph) and the clone loop (needs each session id) |

Bugs caught before review:
- **Browser verification, OVE-17:** after a Replace round trip the edit dialog was still open. Next 16 keeps visited routes mounted, so its state survived. Fixed: the dialog closes before navigating.
- **Server-component boundary, OVE-17:** a helper exported from a `"use client"` module was called on the server. It was moved to the pure `library-params.ts` before it shipped.

## Deferrals

- **OVE-20** (Linear, Backlog): protect logged history from plan calendar and rep-range edits once workouts exist. Decide in the Pitch 4 spec between locking and snapshotting.
- No code comments or TODOs were added for deferrals.

## Near-misses (approached out-of-scope behavior)

- **Presets as programs:**
  - the structure cards show day names only;
  - the plan dialog's sets and reps start empty, with no defaults, which was considered and rejected;
  - a static guard forbids `suggest`, `recommend`, or default-sets code in plan code.
- **Hard delete outside the pitch:** abandoned drafts needed a way out. I chose **Archive draft** (a status change) over deleting a mesocycle, which the pitch doesn't name.
- **Plan versioning:** finding 1 invites a lock or snapshot now; deferred per §37 to OVE-20.
- **"Current week" UI:** `mesocycleWeekForDate` exists for Pitches 4 and 5, but no current-week indicator was built, because that would be executing the plan.
- **Production `.env`:** the local `.env` points at the local stack. Production was never touched, and migrations were applied locally only.
- **Local verification data:**
  - created a local-only account and `[verify]` rows for browser checks;
  - deliberately did not hard-delete them myself;
  - runbook A2 has the cleanup.

## Required upstream amendments (`docs/planning/` not edited)

1. **Mesocycle lifecycle:** add `draft` alongside active/archived; only one active at a time; activation archives the previous block atomically.
2. **Preset definitions:** document the PPL, Arnold, and Bro day/session skeletons above.
3. **Preset boundary:** presets create structure only, never exercises, sets, reps, weights, or a progression method.
4. **Schedule cardinality:** zero or one lifting session per weekday; sessions may be unscheduled ("Not on the schedule").
5. **Session exercise uniqueness:** one occurrence of an exercise per session in this version.
6. **Activation and readiness:** incomplete plans may stay drafts but can't become active (rules above). An active plan that later develops issues stays active with "Needs attention".
7. **Clone-forward defaults:** carry split type, length, and deload week; default the name to "<source> Copy" and the start to source end + 1 day; copy the plan only.
8. **Removal during authoring:** removing a session or planned exercise is plan editing, distinct from archiving an Exercise Library record.
9. **Data model:**
   - `Mesocycle.status` gains `draft`;
   - `splitType` is an enum (`ppl`/`arnold`/`bro`/`custom`);
   - `startDate` is a calendar `DATE`;
   - `Session.dayOfWeek` is ISO 1–7 or null, unique per mesocycle;
   - `Session.position` orders sessions;
   - `SessionExercise` is unique per (session, exercise).
   - **No model change is needed for archived-reference repair**, because it is derived from `Exercise.deletedAt`.
10. **UI previews:** previews are static, offline HTML design-handoff galleries (`docs/previews/*.html`, built from the `overload-ui-design` skill's template). This changed by your direction during this run, and the run prompt's `.tsx` path was superseded.

Still pending from earlier pitches: the Architecture "styling undecided" text and the "separate dev project" text, both of which predate Foundation's decisions.

## Genuinely undecidable

Nothing blocks this pitch. Owned by later pitches:
- OVE-20: plan edits versus logged history (Pitch 4/5).
- What "today's session" means if the active block's start date is in the future, or if the block has ended (Pitch 4). `mesocycleWeekForDate` returns null before the start and a week greater than the length after the end.

## External / manual steps still required (`docs/runs/03-split-mesocycle-builder-runbook.md`)

1. **B1:** apply migrations `2_mesocycle_draft_status` and `3_split_mesocycle_builder` to `overload-prod`. It's safe to do before the merge's deploy; until then `/plan` shows the error page.
2. **B2:** verify the enums, `DATE` type, indexes, constraints, RLS on every table with zero policies, and that the Data API returns `[]`.
3. **B3:** confirm the production deploy is green. No new environment variables.
4. **B4:** phone smoke test: presets, building sessions, schedule replace, duplicate, activation, archived repair, clone-forward, light/dark.
5. **A2 (optional, local):** remove the local verification account and `[verify]` rows.

## Downstream readiness

**Guided Workout Logging can rely on the completed plan contract: yes.**
- There is at most one active mesocycle (DB-enforced), with a start date and a deload week inside the block (DB CHECK).
- Week math lives in one place (`calendar.ts`).
- Sessions have stable ids, sit on ISO weekdays (unique), and hold ordered planned exercises with valid sets and rep ranges (DB CHECKs).
- Activation guarantees no unresolved archived references at the moment of activation.

Pitch 4 must still handle two things:
- an exercise archived in the library **after** activation (the plan shows "Needs attention");
- OVE-20.

Removing a session that has logged history already fails safely (Restrict FK → `invalid_state_transition`).

## Halt status

Not halted. No stop condition was hit:
- no invariant was weakened: no `LoggedSet` path, no stored tag or e1RM, no new table, RLS still deny-all with zero policies, no signup, and no secret in the client bundle;
- no approved planning doc was contradicted or edited;
- no production data, production credentials, or service-role key was touched;
- no destructive or irreversible operation outside the pitch: migrations are in place and additive, there was no force-push or history rewrite, and plan-row removal is named in the pitch.

## Final merge

All required checks were green on the audited tree, so PR #17 is **squash-merged into `main`** under the run's merge-on-green rule. If a reader finds PR #17 still open, the merge step didn't complete; see the progress file.
