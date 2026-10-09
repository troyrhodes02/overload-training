# Split & Mesocycle Builder — Autonomous Run Progress

> Resumable state log. A fresh Claude Code session should be able to continue from this file alone. Updated at every pipeline-step transition and ticket boundary.

**Run:** Overload — Pitch 3: Split & Mesocycle Builder (slug `03-split-mesocycle-builder`)
**Policy:** Autonomous Pipeline Policy / stop conditions as restated in the run prompt (invariant weakening, contradicting an approved doc, irreplaceable-data/credential scope, unnamed destructive ops). `CLAUDE.md` has no separate "Autonomous Pipeline Policy" section; the run prompt's restatement governs, as in Pitches 1–2.
**Merge rule for this run:** squash-merge the feature branch into `main` **only if every required check is green** after review/audit. Never merge past a failing check.
**Mandatory artifact order (UI-bearing):** pitch → design doc → UI preview → spec → tickets → implementation.

**Feature branch:** `feat/03-split-mesocycle-builder` (from `main` @ `c1b811c`)
**Feature PR:** https://github.com/troyrhodes02/overload-training/pull/17 (base `main`)

## SAFETY — read before running anything

- The local `.env` now points at the **local Supabase CLI stack** (`127.0.0.1:54322` / `:54321`), not production (verified 2026-10-08 by host only; secrets not printed). Still: **never** run `prisma migrate reset`, `db push`, or anything against `overload-prod`.
- Integration tests use embedded Postgres via `TEST_DATABASE_URL` (harness refuses Supabase hosts).
- Lint/typecheck/unit/build/e2e: export throwaway overrides first, as in Pitch 2:
  `export DATABASE_URL="postgresql://none:none@127.0.0.1:1/none" DIRECT_URL="$DATABASE_URL"`
- Production migrations are human steps (runbook). The autonomous run never touches production data or credentials or the service-role key.

## Linear

- **Project:** Overload V1 — `d85a1e9b-b2fe-4994-b24f-315f138415ad` (team `OVE`)
- **Pitch doc (Linear):** https://linear.app/overload-training/document/overload-pitch-3-split-and-mesocycle-builder-7972e1ce76ef
- **Milestone:** Split & Mesocycle Builder — `ae401c89-53ef-4861-a927-383dc8fec443`
- Statuses: Backlog, Todo, In Progress, Done (no "In Review"; In Progress while a PR is open, Done when squash-merged into the feature branch).

### Tickets (build order; stacked branches; blockedBy chain)

| # | ID | Title | blockedBy | Branch | PR | Status |
|---|----|-------|-----------|--------|----|--------|
| 1 | OVE-15 | Mesocycle lifecycle & setup | — | feat/ove-15-mesocycle-lifecycle | [#18](https://github.com/troyrhodes02/overload-training/pull/18) | squash-merged; Done |
| 2 | OVE-16 | Weekly schedule & sessions | OVE-15 | feat/ove-16-weekly-schedule | [#19](https://github.com/troyrhodes02/overload-training/pull/19) | squash-merged; Done |
| 3 | OVE-17 | Session exercises & picker | OVE-16 | feat/ove-17-session-exercises | [#20](https://github.com/troyrhodes02/overload-training/pull/20) | squash-merged; Done |
| 4 | OVE-18 | Session duplication | OVE-17 | feat/ove-18-session-duplication | [#21](https://github.com/troyrhodes02/overload-training/pull/21) | squash-merged; Done |
| 5 | OVE-19 | Clone-forward | OVE-18 | feat/ove-19-clone-forward | [#22](https://github.com/troyrhodes02/overload-training/pull/22) | squash-merged; Done |

Branch stacking: OVE-15 branches from `feat/03-split-mesocycle-builder`; each next ticket branches from the previous ticket branch; each ticket PR targets the previous branch (OVE-15 targets the feature branch).

## Artifacts

- `pitches/03-split-mesocycle-builder.md` — pitch (pulled from Linear)
- `docs/design/03-split-mesocycle-builder-design-doc.md` — design doc
- `docs/previews/03-split-mesocycle-builder-preview.html` — UI preview (visual contract; self-contained HTML, open by drag-and-drop)
- `docs/specs/03-split-mesocycle-builder-spec.md` — spec incl. `## Resolved Decisions`
- `docs/runs/03-split-mesocycle-builder-runbook.md` — runbook
- `docs/runs/03-split-mesocycle-builder-report.md` — (step 15)

## Pipeline step status

- [x] 1. Context read + pitch pulled → `pitches/03-split-mesocycle-builder.md`
- [x] 2. Design doc
- [x] 3. UI preview → `docs/previews/03-split-mesocycle-builder-preview.html` (user-directed 2026-10-08: preview is a static offline design-handoff HTML gallery built from `.claude/skills/overload-ui-design/references/preview-template.html`; skill rewritten to match the user-supplied model; regenerated)
- [x] 4–5. Spec + Resolved Decisions (D1–D37 pre-resolved; D38–D70 autonomous)
- [x] 6. Milestone + issues OVE-15..OVE-19 + blockedBy chain
- [x] 7. Feature PR into main — #17
- [x] 8. Ticket-worker per ticket — PRs #18–#22, each green and browser-verified against the local stack
- [x] 9. Runbook → `docs/runs/03-split-mesocycle-builder-runbook.md`
- [x] 10. Squash-merged #18→#22 into the feature branch (274b7a2, 9bfb07a, 0fa096e, d9c3988, ca1ac4d). Each later PR needed the feature branch merged into its branch first (add/add conflicts from the squash); resolved to the ticket side after verifying the feature code was byte-identical to the previous ticket and that the merge commit changed no code. No force-push.
- [x] 11. Full verification on the feature branch — green: lint, format, prisma validate, unit 157, integration 124, build, typecheck, e2e 17, client-bundle guard
- [ ] 12. `/code-review` → inline comments on the feature PR
- [ ] 13. Review audit + fixes
- [ ] 14. Re-verify; merge on green
- [ ] 15. Report

## Notes / decisions log

- Experiment (throwaway embedded Postgres): `prisma migrate diff --from-config-datasource --to-schema` reports an **empty** diff with an extra partial unique index and an extra CHECK constraint present, so a hand-written partial unique index (one active mesocycle) is compatible with the existing schema-drift guard.
- `radix-ui` (already installed) ships RadioGroup and AlertDialog, so the shadcn `radio-group` / `alert-dialog` primitives need no new dependency.

- Local dev DB (127.0.0.1:54322) now has migrations 2–3 applied (dev migration step). A local-only verification account `pitch3-verify@overload.local` was created through the local admin API for authenticated browser checks; delete it (and `[verify]` mesocycles) at the end of the run. Never production.
- OVE-15 verification: unit 142, integration 80, e2e 13, build, bundle guard, lint, typecheck, format — all green.
- Browser verification found and fixed one bug (OVE-17): Next 16 keeps visited routes mounted, so the planned-exercise edit dialog was still open after a Replace round trip; it now closes before navigating.
- Stray `next start` processes survive TaskStop on Windows; kill by port (3200) before rebuilding.
