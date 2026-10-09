# Split & Mesocycle Builder — Autonomous Run Progress

> Resumable state log. A fresh Claude Code session should be able to continue from this file alone. Updated at every pipeline-step transition and ticket boundary.

**Run:** Overload — Pitch 3: Split & Mesocycle Builder (slug `03-split-mesocycle-builder`)
**Policy:** Autonomous Pipeline Policy / stop conditions as restated in the run prompt (invariant weakening, contradicting an approved doc, irreplaceable-data/credential scope, unnamed destructive ops). `CLAUDE.md` has no separate "Autonomous Pipeline Policy" section; the run prompt's restatement governs, as in Pitches 1–2.
**Merge rule for this run:** squash-merge the feature branch into `main` **only if every required check is green** after review/audit. Never merge past a failing check.
**Mandatory artifact order (UI-bearing):** pitch → design doc → UI preview → spec → tickets → implementation.

**Feature branch:** `feat/03-split-mesocycle-builder` (from `main` @ `c1b811c`)
**Feature PR:** _(step 7)_

## SAFETY — read before running anything

- The local `.env` now points at the **local Supabase CLI stack** (`127.0.0.1:54322` / `:54321`), not production (verified 2026-10-08 by host only; secrets not printed). Still: **never** run `prisma migrate reset`, `db push`, or anything against `overload-prod`.
- Integration tests use embedded Postgres via `TEST_DATABASE_URL` (harness refuses Supabase hosts).
- Lint/typecheck/unit/build/e2e: export throwaway overrides first, as in Pitch 2:
  `export DATABASE_URL="postgresql://none:none@127.0.0.1:1/none" DIRECT_URL="$DATABASE_URL"`
- Production migrations are human steps (runbook). The autonomous run never touches production data or credentials or the service-role key.

## Linear

- **Project:** Overload V1 — `d85a1e9b-b2fe-4994-b24f-315f138415ad` (team `OVE`)
- **Pitch doc (Linear):** https://linear.app/overload-training/document/overload-pitch-3-split-and-mesocycle-builder-7972e1ce76ef
- **Milestone:** _(step 6)_

### Tickets (build order; stacked branches; blockedBy chain)

_(step 6)_

## Artifacts

- `pitches/03-split-mesocycle-builder.md` — pitch (pulled from Linear)
- `docs/design/03-split-mesocycle-builder-design-doc.md` — design doc
- `docs/previews/03-split-mesocycle-builder-preview.html` — UI preview (visual contract; self-contained HTML, open by drag-and-drop)
- `docs/specs/03-split-mesocycle-builder-spec.md` — spec incl. `## Resolved Decisions`
- `docs/runs/03-split-mesocycle-builder-runbook.md` — (step 9)
- `docs/runs/03-split-mesocycle-builder-report.md` — (step 15)

## Pipeline step status

- [x] 1. Context read + pitch pulled → `pitches/03-split-mesocycle-builder.md`
- [x] 2. Design doc
- [x] 3. UI preview → `docs/previews/03-split-mesocycle-builder-preview.html` (user-directed 2026-10-08: preview is a static offline design-handoff HTML gallery built from `.claude/skills/overload-ui-design/references/preview-template.html`; skill rewritten to match the user-supplied model; regenerated)
- [ ] 4–5. Spec + Resolved Decisions
- [ ] 6. Milestone + issues + blockedBy chain
- [ ] 7. Feature PR into main
- [ ] 8. Ticket-worker per ticket
- [ ] 9. Runbook
- [ ] 10. Squash-merge ticket PRs into the feature branch
- [ ] 11. Full verification
- [ ] 12. `/code-review` → inline comments on the feature PR
- [ ] 13. Review audit + fixes
- [ ] 14. Re-verify; merge on green
- [ ] 15. Report

## Notes / decisions log

- Experiment (throwaway embedded Postgres): `prisma migrate diff --from-config-datasource --to-schema` reports an **empty** diff with an extra partial unique index and an extra CHECK constraint present, so a hand-written partial unique index (one active mesocycle) is compatible with the existing schema-drift guard.
- `radix-ui` (already installed) ships RadioGroup and AlertDialog, so the shadcn `radio-group` / `alert-dialog` primitives need no new dependency.
