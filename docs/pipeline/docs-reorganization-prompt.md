# Docs Reorganization — One-Shot Prompt

Paste into Claude Code once. Run it after the updated `CLAUDE.md`, skills, and `docs/pipeline/` files have been merged into `staging`, so the new layout and the paths in the skills already agree.

---

Chore for Overload: reorganize `docs/` so each pitch's documents live together under its milestone, and stop generating run files nobody reads. Do not change application code logic.

Branch from the latest `staging` as `chore/docs-reorg`. Open a PR into `staging` and merge it when the checks are green. Never touch `main`. Use `git mv` so history follows the files.

## Target layout

```text
docs/
├── planning/   (leave as is)
├── pipeline/   (leave as is)
├── marketing/  (leave as is)
└── pitches/
    └── <milestone>/<NN-slug>/
        ├── pitch.md      expanded pitch, if one exists in the repo
        ├── design.md
        ├── preview.tsx   (keep the original extension, .tsx or .html)
        ├── spec.md
        ├── runbook.md
        ├── sql/          runbook SQL, if any
        └── assets/       preview assets, if any
```

## Milestone folders

| Pitches | Folder |
| --- | --- |
| 01 to 07 | `mvp-1-core-training` |
| 08 to 13 | `mvp-2-multi-user` |
| 14 to 16 | `mvp-3-training-intelligence` |
| 17, 18, 19, 20, 22 | `mvp-4-web-commercial` |

Take each `<NN-slug>` from the existing file name prefix, for example `17-admin-center-feedback`. Use the full slug from the spec file name, minus the `-spec` suffix.

## Moves

- `docs/design/NN-*-design-doc.md` → `design.md`
- `docs/specs/NN-*-spec.md` → `spec.md`
- `docs/previews/NN-*-preview.*` → `preview.<same extension>`
- `docs/runs/NN-*-runbook.md` → `runbook.md`
- `docs/runs/NN-sql/` and similar SQL folders → `sql/` in the matching pitch folder
- Any expanded pitch document for the pitch (a root `pitches/` folder or elsewhere) → `pitch.md`
- `docs/specs/ove-50-*` and `docs/runs/ove-50-sql/` → `mvp-4-web-commercial/chores/ove-50-open-signup/` as `spec.md` and `sql/`
- `docs/previews/assets/*` → the `assets/` folder of the pitch that references each file. Anything unreferenced goes to `docs/pitches/_unsorted-assets/` and is listed in the PR.

## Delete

Delete every `docs/runs/NN-*-progress.md` and `docs/runs/NN-*-report.md`. They stay in git history. Keep nothing else in `docs/runs/`, then remove the empty folder, and remove the empty `docs/design`, `docs/specs`, and `docs/previews` folders.

## Fix references

1. Update every old path in `docs/`, `CLAUDE.md`, any README, `package.json` scripts, CI workflows, and `.claude/skills/` to the new location, and fix relative links inside the moved files.
2. Update `tsconfig.json` `exclude`, the ESLint ignore list, `.prettierignore`, and any other config that mentions `docs/previews` so it excludes `docs/pitches/**/preview.*` instead. Previews must stay out of type-checking, linting, formatting checks, and the production build.
3. Do not edit Linear tickets.

## Verify

Run lint, typecheck, format check, tests, and the build. Check that no relative link in `docs/` is broken, that `git status` shows only renames, deletions, and reference edits, and that no application logic changed.

## Report

In the PR description, list the old-to-new mapping, anything you left in place or put in `_unsorted-assets/`, and any reference you could not update. Finish with the PR link.
