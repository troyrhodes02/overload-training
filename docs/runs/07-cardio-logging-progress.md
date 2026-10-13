# Pitch 7 — Cardio Logging — Run Progress

Resumable state for the autonomous pipeline run. Updated at every pipeline
transition and ticket boundary.

- **Slug:** `07-cardio-logging`
- **Linear project:** Overload V1 (`P-OVE-1`)
- **Pitch document:** Linear doc `9c2c46d3-8408-4211-9c00-7c1e74fe59d9` → `pitches/07-cardio-logging.md`
- **Classification:** UI-bearing; merge-on-green (adds PlannedCardio + CardioLog
  writes only; never writes/deletes/edits LoggedSet history, Gym baselines,
  auth, or RLS behavior).
- **Target branch:** `main` · **Feature branch:** `feat/07-cardio-logging`

## Key upstream contracts confirmed (main @ `e558578`)

- `CardioLog` table exists from Foundation (`type`, `durationMin`, `performedOn`, RLS deny-all), never written.
- Plan structure: `Session.dayOfWeek` 1–7 (zero/one session per weekday); plan rows written only in `src/lib/plan/{mesocycles,sessions}.ts`; active + draft editable, archived read-only; clone in `cloneMesocycle`.
- Effective schedule: pure `effectiveWeekSchedule(ctx, week)` / `occurrenceOnDate` in `src/lib/logging/schedule.ts` (shifts only Session occurrences, per week, never compounding). Missed-day prompt = `oldestUnresolvedMissedDay` (Session occurrences only).
- Dashboard `getTodayDashboard` / history `getWeekSchedule` in `src/lib/logging/queries.ts`.

## Pipeline status

- [x] 1. Pitch pulled + authority read
- [x] 2. Design doc — `docs/design/07-cardio-logging-design-doc.md`
- [x] 3. UI preview — `docs/previews/07-cardio-logging-preview.tsx`
- [x] 4. Spec — `docs/specs/07-cardio-logging-spec.md`
- [x] 5. Linear milestone + issues (OVE-33…35)
- [x] 6. Feature PR into `main` (#40)
- [x] 7. Implement tickets (PRs #41–#43)
- [x] 8. Runbook — `docs/runs/07-cardio-logging-runbook.md`
- [x] 9. Merge ticket PRs into feature branch (squash, dependency order)
- [x] 10. Full verification (lint, typecheck, format, unit 343, integration 270, build, e2e 22, client-bundle)
- [ ] 11. Review + audit
- [ ] 12. Merge on green + run report

## Linear

- Milestone: **Cardio Logging** (`eea0888a-1b50-47c8-b075-d4a8460b7c64`)
- Tickets (dependency order, chained via blockedBy):
  - **OVE-33** — Planned cardio: model, builder add/edit/remove, clone-forward
  - **OVE-34** — Cardio occurrences, idempotent CardioLog, and Today's cardio (blockedBy OVE-33)
  - **OVE-35** — Cardio in History: day-grouped week, missed, log-late, correction (blockedBy OVE-34)
- Feature branch: `feat/07-cardio-logging`

### Ticket PRs (all squash-merged into `feat/07-cardio-logging`)
- OVE-33 → **PR #41** · merged (`1e61aea`)
- OVE-34 → **PR #42** · merged (`87160c2`)
- OVE-35 → **PR #43** · merged (`918dba5`)

## Notes / decisions log

- Preview path: the run prompt gates the spec on `docs/previews/07-cardio-logging-preview.tsx`;
  written as `.tsx` following the Pitch 4/5/6 precedent (the ui-design skill and a stored
  preference default to `.html`; flagged again in the report).
- Local visual verification: production build against local Supabase auth with a
  throwaway database `overload_verify_p7` on the local Postgres and a temporary
  local-only user; both removed afterward. The existing local dev data was not
  touched; migration 6 was applied to the local dev DB (additive).
- Stacked ticket PRs: after squash-merging a parent, the child branch was brought
  up to date with a merge commit (conflicts were superset files; child kept), then
  retargeted to the feature branch — no force-push / history rewrite.
