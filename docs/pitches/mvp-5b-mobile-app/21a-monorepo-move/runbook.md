# Pitch 21a — Monorepo Move: Owner Runbook

What the owner does outside the codebase for the monorepo move. The run changed **no** Vercel setting, environment variable, Supabase setting, database, or Production deployment. Everything below marked **(owner)** is yours to do. Nothing here has been run against staging or Production; no staging result is recorded until you record it.

Spec: `spec.md` (§8 the file migration, §9.3 the Vercel facts, §10 React and Expo). Feature PR: #187, **left open** against `staging`.

**What the run verified locally** (not a substitute for §6): from the repository root, `npm ci` (also from inside `apps/web`), lint, typecheck, format, the unit suite (2,333 tests at the move, the same as before), the integration suite (952, the same), the default end-to-end suite (27, the same), the production build (identical route table), the client-bundle scan, the PDF-import tracing (14 `pdfjs-dist` files, the same; the old path would have traced 0), and a Preview build naming the Production ref still being refused. Not run: the accounts end-to-end suite (needs Docker) and anything on Vercel.

**Until you make the Vercel change, Preview builds of this feature branch and its ticket branches fail.** Nothing is left to build at the repository root. That is expected and harmless: no deployment is replaced, and `staging` is untouched until you merge.

---

## 1. Local workspace: install and commands

The repository is now an npm workspace:

```text
apps/web          the Next.js app (@overload/web), moved whole
apps/mobile       reserved for 21d (README only, not a workspace yet)
packages/shared   @overload/shared, empty and fenced, filled in 21b
package.json      the workspace list and the root commands
package-lock.json the single lockfile
```

**One-time clean-up of an existing checkout** (owner, after pulling the merged change):

```sh
# from the repository root
mv .env apps/web/.env            # if you keep a local .env; it stays git-ignored
rm -rf .next node_modules next-env.d.ts tsconfig.tsbuildinfo test-results
npm ci                           # installs every workspace and generates the Prisma client
```

Other worktrees need the same `npm ci` after they merge or rebase onto the new layout. A branch cut before the move merges cleanly in most cases, because git follows the renames. Its Vercel Preview builds only after it has the new layout (see §5).

**Commands, all from the repository root.** Each delegates to the workspace that owns it, and extra arguments after `--` pass through. Every command also works from inside `apps/web`.

| Command | What it runs |
| --- | --- |
| `npm ci` / `npm install` | Installs all workspaces into the root `node_modules`, then the web's `postinstall` runs `prisma generate`. Running it inside `apps/web` does the same and never creates a second lockfile. |
| `npm run lint` | ESLint in every workspace (web rules unchanged; shared has the forbidden-import fence), then the root `scripts/` |
| `npm run typecheck` | `tsc --noEmit` in every workspace. In a fresh checkout with no `.next`, run `npm run build` or `npx next typegen` in `apps/web` first, as before the move. |
| `npm run format:check` / `npm run format` | Prettier over the whole repository, one config |
| `npm test` | Web unit suite, then the workspace boundary check (`npm run verify:workspaces`) |
| `npm run verify:workspaces` | Dependency placement, no scheduler or queue, React lockstep, and its own tests |

## 2. Web development, test, and build

| Task | Command (root) |
| --- | --- |
| Dev server | `npm run dev` (http://localhost:3000; reads `apps/web/.env`) |
| Production build | `npm run build`, then `npm start` |
| Unit tests | `npm test` (or `npm test -- tests/unit/<file>`; paths are relative to `apps/web`) |
| Integration tests | `npm run test:integration` (throwaway embedded Postgres; never reads `DATABASE_URL`) |
| End-to-end (default) | `npm run test:e2e` (builds and starts the app on :3100 with dummy Supabase values; system Chrome) |
| End-to-end (accounts) | `cd apps/web && npx supabase start`, then `npm run test:e2e:accounts` from the root |
| Client-bundle secret scan | `npm run build && npm run verify:client-bundle` |
| Demo seed / operator CLIs | `npm run demo:seed -- --user-id <uuid> …`, `npm run import:plan -- …` (unchanged flags) |

The operator commands in `docs/technical/environment-isolation.md` that use `npx tsx scripts/…` or `npx tsx prisma/seed.ts` now run **from `apps/web`**: `cd apps/web && npx tsx scripts/operator/migrate-dev/cli.ts --confirm-ref …`.

## 3. Prisma generate and migrations

Nothing about the schema or migrations changed. They moved to `apps/web/prisma/`.

| Task | Command |
| --- | --- |
| Generate the client | Automatic on `npm ci` / `npm install`, or `cd apps/web && npx prisma generate` |
| Validate the schema | `cd apps/web && npx prisma validate` |
| Dev migration status (dry run) | `npm run db:migrate:dev -- --confirm-ref vdxrmfadikwzodjljbdi` (export the dev values first, as in `environment-isolation.md`) |
| Dev migration apply | add `--execute` |
| Exercise-library seed (local) | `npm run db:seed` |
| Production migration | Unchanged human runbook step with a fresh backup, now run from `apps/web` (`cd apps/web && npx prisma migrate deploy` with the Production `DIRECT_URL` exported). Not part of this pitch: 21a adds no migration. |

`apps/web/prisma.config.ts` still loads `.env` from the directory you run it in. Run Prisma from `apps/web` (directly or through the root delegates) so it finds `apps/web/.env`. Exported variables still win over `.env`.

## 4. The Vercel change: current and desired settings

Vercel → the Overload project → **Settings → Build and Deployment**.

| Setting | Current (confirm before changing) | Set to |
| --- | --- | --- |
| **Root Directory** | blank (the repository root) | **`apps/web`** |
| Include files outside of the Root Directory in the Build Step | Enabled (Vercel's default) | **Enabled**. The lockfile and the hoisted `node_modules` live at the repository root. |
| Skip deployments when there are no changes to the root directory or its dependencies | (appears once a Root Directory is set) | **Disabled**, so every push builds exactly as today |
| Framework Preset | Next.js | unchanged |
| Build Command / Install Command / Output Directory / Development Command | no overrides | unchanged, no overrides. Install runs `npm install` from `apps/web`, which npm resolves to the workspace root and its lockfile. |
| Node.js Version | (record the current value) | unchanged. Note the value here: ______ |
| Ignored Build Step | (record the current value) | unchanged. If it runs a command that inspects root paths (`src/`, `package.json`), tell the next run, because those paths moved. |
| Environment Variables, Domains, Deployment Protection, Git settings | current | **unchanged. Do not edit any variable.** |

**The Root Directory is project-wide.** Production (`main`) and staging (Preview) are one Vercel project, and Vercel has no per-branch Root Directory. Changing it affects **the next build of every branch, Production included**:

- The live Production deployment is **not** rebuilt and keeps serving. Vercel applies the setting "on your next deployment".
- Any new Production build from `main` fails until 21a is promoted to `main`, because `main` still has the root layout. That includes a merge into `main` and a Production "Redeploy". A failed build never replaces the live deployment, so lifters are unaffected, but **Production releases are frozen** until 21a is promoted.
- Branches that do not yet contain the move (any open feature branch cut before it) fail their Preview builds until they merge `staging`.

Choose one before you start:

- **Path A (recommended): short freeze.** Make the change, verify staging, then promote 21a to Production through the normal release workflow soon after approving it. 21a has no behavior, schema, or variable change, so its promotion is a structural release.
- **Path B: an urgent Production fix while frozen.** Set Root Directory back to blank, ship the fix through the release workflow, then set it to `apps/web` again. While it is blank, the staging branch, which by then has the new layout, fails to build, and its last good deployment keeps serving.

## 5. Sequencing: the change and the merge

Do these in order. Do not merge other PRs into `staging` or `main` between steps 2 and 6.

1. **(owner) Review the PR.** Confirm PR #187 is green and the review audit is applied. Note the latest successful staging deployment in Vercel (Deployments → filter Branch `staging`). That is your known-good fallback.
2. **(owner) Change the settings** in §4: Root Directory `apps/web`; include outside files Enabled; skip deployments Disabled. Save. Nothing redeploys by itself.
3. **(owner) Build the feature branch from `apps/web`.** Push an empty commit to the feature branch (a fresh deployment, so the new settings certainly apply):

   ```sh
   git fetch origin && git switch feature/21a-monorepo-move && git pull
   git commit --allow-empty -m "Trigger Preview build from apps/web (21a runbook)" && git push
   ```
4. **(owner) Validate that Preview** (§6, checks V1 to V6) on its deployment URL. It runs against `overload-dev` like every Preview.
   - If it fails, follow **Rollback R1** (§7). Nothing has been merged.
5. **(owner) Merge PR #187 into `staging`** with "Create a merge commit" or squash, as you normally do for feature PRs into staging. Never into `main`.
6. **(owner) Validate staging** on the stable URL (§6, all checks).
   - If it fails, follow **Rollback R2** (§7).
7. **(owner) Decide on promotion** (§4, Path A or B). When you promote, use `docs/pipeline/production-promotion-prompt.md`. The release PR carries the whole move. After the Production release, sync `main` back into `staging` as usual.

## 6. Staging deployment validation

Record each result in the PR or here. A local build is not proof of staging.

| # | Check | How | Pass |
| --- | --- | --- | --- |
| V1 | The build ran from `apps/web` | Vercel build log: install ran at the workspace root, `prisma generate` ran, `next build` ran in `apps/web` | Build succeeded |
| V2 | The deployment tripwire ran | The build did not fail at `next.config.ts`. It fails only if a Preview variable names Production; that is the intended behavior. | No tripwire error |
| V3 | The PDF reader is in the import function | Vercel → the deployment → Functions (or Source → Output): the function for `/plan/import` includes `node_modules/pdfjs-dist/legacy/build/pdf.mjs` | Present |
| V4 | The smoke test | `docs/technical/staging-environment.md` → Smoke test, steps 1 to 3 and 9 (isolation, login and logout, library 876 exercises with images, no Production writes) | All pass |
| V5 | Core flows | With the dev test account: Today loads; start a workout, log a set, finish; History shows it; open an exercise page (Pro recommendation visible for a comped account); Settings → Plan & Billing renders | Same as before the move |
| V6 | Plan import entry | `/plan` shows "Import existing plan" when `PLAN_IMPORT_ENABLED=true` (staging-only), or "temporarily unavailable" when off. Upload a small text PDF part: it is accepted, which needs pdfjs at runtime. | Same as before |
| V7 | Unauthenticated redirect | Signed out, open `/plan` on the staging URL | Redirects to `/login` |
| V8 | Isolation | Browser network calls go only to `https://vdxrmfadikwzodjljbdi.supabase.co` | Only the dev project |

## 7. Rollback

Nothing here touches Production, its variables, or any database.

**R1: the feature-branch Preview fails (before merging).**
1. Set Root Directory back to blank. Leave include-outside Enabled.
2. Staging and Production are untouched: nothing was merged, and the live deployments never changed.
3. Report the build log on PR #187. A follow-up run fixes the branch, and you retry from §5 step 2.

**R2: staging fails after the merge.**
1. If the staging **build failed**, the stable URL still serves the last good deployment, because a failed build never moves the branch alias. Lifters of staging see no change; continue below at your own pace. If the build **succeeded but the app misbehaves**, the stable URL now serves the bad deployment. Until step 3 lands, test on the last good deployment's own URL (noted in §5 step 1).
2. Set Root Directory back to blank.
3. Revert the merge on `staging` through a PR. Never force-push `staging`:

   ```sh
   git fetch origin && git switch -c revert/21a-monorepo-move origin/staging
   git revert -m 1 <merge-commit-sha>     # or: git revert <squash-commit-sha>
   git push -u origin revert/21a-monorepo-move
   gh pr create --base staging --title "Revert Pitch 21a monorepo move" --body "Rollback R2 (21a runbook)."
   ```
   Merge it; staging rebuilds from the root layout with Root Directory blank.
4. Run the smoke test (§6 V4) on the stable URL to confirm recovery.
5. Report on PR #187 so a follow-up run can fix and re-land the move.

**Production during any rollback:** unchanged. If you had chosen Path B mid-way, Root Directory blank is what `main` needs anyway.

## 8. Production is not changed by this pitch

- The run changed no Vercel setting, no environment variable (Production, Preview, or Development), no domain, no Supabase project setting, and no database. It applied no migration anywhere.
- The Root Directory change is **yours**, and it is project-wide (§4). It does not rebuild or alter the live Production deployment. It only changes how the next build runs.
- 21a reaches Production only through the release workflow, in a release PR you approve.

## 9. Before starting 21b

All of these must be true:

- [ ] §6 checks V1 to V8 passed on the **staging stable URL**, after the merge.
- [ ] The Vercel settings in §4 are recorded as changed, with the Node.js version and Ignored Build Step noted.
- [ ] A decision on Path A or B is recorded, and if Path A, 21a's promotion is scheduled or done.
- [ ] Your local checkout and worktrees ran the §1 clean-up (`apps/web/.env`, `npm ci`), and `npm test` passes from the root.
- [ ] Any open feature branches have merged `staging` (or were closed).
- [ ] Optional but recommended before 21c (audit Q-1): decide whether to add a CI workflow (spec Open Question 2).

When those hold, 21b (Shared Package & Contracts) can start from the latest `staging`.
