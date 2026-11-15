# Prescription-Aware Intelligence — Runbook

What the owner does outside the codebase. The run applied nothing to any hosted database.

## 1. Migration: `9q_session_lineage`

Additive and non-destructive. It adds `sessions.lineage_id`, backfills every existing session to its own id, sets NOT NULL, adds a unique index per mesocycle and an index, and adds an immutability trigger. No logged table is touched. Rehearsed on the legacy dataset (`tests/integration/session-lineage-migration.int.test.ts`).

**Order matters.** The new code reads `sessions.lineage_id`. Apply the migration to a database **before** code that reads it is deployed against that database.

### overload-dev (required before the staging merge)

From the repository root, with the dev project's URLs exported in your shell (never from a file that might point at Production):

```bash
export DATABASE_URL='<overload-dev pooled URL>'
export DIRECT_URL='<overload-dev direct URL>'
export NEXT_PUBLIC_SUPABASE_URL='https://vdxrmfadikwzodjljbdi.supabase.co'
npm run db:migrate:dev -- --confirm-ref vdxrmfadikwzodjljbdi            # dry run: shows 9q pending
npm run db:migrate:dev -- --confirm-ref vdxrmfadikwzodjljbdi --execute  # applies it
```

Then merge the feature PR into `staging` (if the run left it open), or confirm the staging deployment is healthy (Today, a workout card, an exercise page).

### Production (at release, human step)

Take a backup, then apply with `prisma migrate deploy` from the release runbook, **before** the release PR is merged. The backfill is one `UPDATE` over `sessions` (small table); it takes no lock on logged tables.

### What lifters see right after the release (expected, RD-19)

Blocks cloned before this release are not linked to the block they were cloned from (no automatic relinking, by decision). In such a block, the first time each workout comes up it shows an empty weight box with a "For reference" line, and no progress call until that workout has its own history in the block. Every later occurrence in the block, and every block cloned after the release, links normally. Logged history is untouched and fully visible. Worth a line in the release announcement if you send one.

## 2. Staging verification (browser)

Use a throwaway overload-dev account (see the Pitch 24 verification notes: provision tool with `HOME` override, demo seed). Create a block with **Push** (Saturday) and **Upper** (Wednesday), both planning Barbell Bench Press: Push 3 × 3–5, Upper 3 × 6–8.

| Check | Expect |
| --- | --- |
| Log Saturday 255 × 5, 5, 4; open the next Wednesday | Empty weight box; "Nothing logged in Upper at 6–8 reps yet."; "For reference: Push · 3–5 reps · … · 255 × 5, 5, 4" |
| Log Wednesday 230; open the next Saturday | Box 255, "last time"; "Last time in Push · …" |
| Open the next Wednesday | Box 230; "Last time in Upper · …" |
| Pro: Saturday hits 5, 5, 5 twice | Saturday card shows Progress and "+5 → 260"; Wednesday shows no Progress and only 230 |
| Exercise page for bench | "Next time" has two labeled lines (Push · 3–5 reps, Upper · 6–8 reps); session rows show "· Push" / "· Upper" |
| Free account | Box and reference lines unchanged; no tag, recommendation, or number; one upgrade note |
| Machine (cable) at one gym: 50 then 55 | Next card offers 55 (not 50) |
| Clone the block, rename Upper to "Upper A", move it to Thursday | Its first card offers Upper's last weight, labeled "Last time in Upper" |
| Change a rep range in the clone | Its first card is empty with a reference line |
| Phone width and desktop, light and dark | Lines wrap; nothing truncates numbers; reference line is quieter |

Not verified by the run: a live browser pass (no overload-dev credentials were available to it) and any native device check (no native screen is built here).

## 3. Mobile

No mobile endpoint serves the card or the exercise page yet. The card contract gained `referencePerformance`, `weightContext`, `previousPerformance.sessionName/repRange`, and `WorkoutDto.scheduledDeloadWeek`; slice 21e should render `formatCardContext` from `@overload/shared/logging/set-entry` and never compute comparability on the device. `/today` keeps its shape; its values are now per recurring workout. No Expo update is needed.

## 4. Production promotion prerequisites

- The roadmap and PRD list this pitch and give it a number (owner amendment; see the feature PR's owner notes).
- `9q_session_lineage` applied to Production with a fresh backup, before merging the release PR.
- Re-date the release note (`packages/shared/src/release-notes/entries.ts`, id and date) if Production ships after 2026-11-15.
- Release review per `docs/pipeline/production-promotion-prompt.md`, including the mobile API backward-compatibility check: additive fields only; `ExerciseHistoryDto.next` is null when an exercise has two or more recurring workouts.

## 5. Rollback

- **Code:** reverting the release restores exercise-wide reads and baseline-first offers. The `lineage_id` column is harmless to old code (Prisma ignores unknown columns), so the migration does not need to be reverted.
- **Migration (only if required):** `DROP TRIGGER "sessions_lineage_id_immutable" ON "sessions"; DROP FUNCTION "overload_session_lineage_immutable"(); DROP INDEX "sessions_lineage_id_idx"; DROP INDEX "sessions_mesocycle_id_lineage_id_key"; ALTER TABLE "sessions" DROP COLUMN "lineage_id";` and remove the `_prisma_migrations` row. Dropping the column loses the cross-block links created by clones made since release (logged sets are untouched). Prefer leaving the column.
