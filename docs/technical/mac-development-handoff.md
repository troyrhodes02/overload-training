# macOS development handoff

**Written:** 2026-11-09, when development moved from a Windows machine to a Mac. Nothing here contains a secret or an `.env` value. Read `docs/technical/environment-isolation.md` (OVE-111) and `docs/technical/staging-environment.md` alongside this page.

> **Since Pitch 21a (monorepo move):** the web app lives in `apps/web` of an npm workspace. Code paths on this page are relative to `apps/web/`. Run `npm install` and `npm run …` from the repository root. Run direct `npx tsx …`, `npx prisma …`, and `npx supabase …` commands from `apps/web/`, as shown. A local `.env` / `.env.local` lives in `apps/web/`.

## What is where

| Thing | Location |
| --- | --- |
| Production code | `main` (deploys to Production; **never merge without the owner's explicit approval**) |
| Persistent integration branch | `staging` (Vercel Preview, database `overload-dev`) |
| Workout Plan Import (Pitch 22), restored | PR **#139**, branch `feature/pitch-22-workout-plan-import`, targets `staging`, **open, do not merge into `main`** |
| Older local-only work, now published | `chore/dev-scenario-seeding` (dev scenario seeding CLI, 2026-10-12); `handoff/ove-97-local-progress-doc` (a superseded progress-note edit, kept for completeness) |
| Development database | Supabase `overload-dev`, ref `vdxrmfadikwzodjljbdi` |
| Production database | Supabase `overload-prod`, ref `ycxvdiklpefyhdclxyau`. **Protected. Never use its credentials for development.** |

State of `overload-dev` at handoff: the 21 mainline migrations are applied, the exercise library is seeded (876 exercises, 873 images, public `exercise-images` bucket), the identity marker `overload-target:vdxrmfadikwzodjljbdi` is in place, and there are no profiles or Auth users. **The two Pitch 22 migrations (`9l_plan_import`, `9m_plan_import_retention`) are not applied and not yet authorized.**

## 1. Prerequisites (macOS)

The project uses **npm** (`package-lock.json`), **Node 22** (tested with 22.15), Prisma 7 and Next.js 16. There is no `.nvmrc`; install Node 22 explicitly.

```bash
# Homebrew (https://brew.sh) first, then:
brew install git gh node@22
brew link --overwrite --force node@22     # puts node 22 on PATH
brew install --cask docker                # Docker Desktop, required for the local Supabase stack
node -v                                   # expect v22.x
gh auth login                             # GitHub, HTTPS; needed to read and update PRs
```

If you prefer a version manager: `brew install nvm`, then `nvm install 22 && nvm use 22`.

The **Supabase CLI** is not an npm dependency; the repo uses `npx supabase …`, which downloads it. (`brew install supabase/tap/supabase` also works.) Open Docker Desktop once and let it finish starting before you run the stack.

## 2. Clone and resume PR #139

```bash
git clone https://github.com/troyrhodes02/overload-training.git
cd overload-training
git fetch --all --prune
git switch feature/pitch-22-workout-plan-import     # PR #139's existing branch
npm install                                         # runs `prisma generate` (postinstall)
npx playwright install                              # only if you will run the browser e2e suites
```

Do not copy `node_modules` or `.next` from the Windows machine: they hold platform-specific native binaries (`sharp`, Next's SWC, Prisma engines). Reinstall.

To keep working: commit on that branch and `git push`; PR #139 updates by itself. To pick up new `main` or `staging` work, `git fetch` and merge `origin/staging` into the branch (never rebase work that is already pushed and shared, and never force-push).

The branch's expected tip at handoff is the commit named in PR #139's header. Check with `git log --oneline origin/staging..HEAD`: you should see the Pitch 22 restore plus three fixes (cleanup-CLI guard, lockfile sync, Windows-safe test scripts).

## 3. Local development (the default: local stack, no cloud)

Everyday work should use the **Supabase CLI local stack**, which touches no hosted project:

```bash
cd apps/web                           # the local stack config is apps/web/supabase/
npx supabase start                    # Docker; API 127.0.0.1:54321, Postgres :54322 (ports 54320-54327 are this repo's)
npx supabase status -o env            # shows local URLs and keys (local-only demo keys)
```

Put the local values in a git-ignored `apps/web/.env.local` (see `apps/web/.env.example` for the names). `npm run db:migrate:dev` against the local stack needs no confirmation. Then:

```bash
npm run dev            # http://localhost:3000
npm run db:seed        # exercise library into the local stack (uses the local service key)
```

If another Supabase project is running locally, stop it first or its ports will collide.

## 4. Running the app against `overload-dev` without exposing Production

Only when you need hosted behavior. `overload-dev` holds synthetic data only.

1. Get the five `overload-dev` values from its Supabase dashboard (Connect, then API settings): transaction-pooler URL (port 6543), session-pooler URL (port 5432), project URL, anon key, service-role key. See section 7 for what to transfer.
2. Keep them **outside the repository**, for example `~/.config/overload/overload-dev.env` (`chmod 600`), as `NAME=value` lines for `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. **Never create a repo `.env` that holds Production values, and do not copy the Windows machine's `.env`** (it contains commented Production lines).
3. Export them into **one shell** only. Exported variables beat every `.env*` file, and Next's loader and `dotenv` never override them:

   ```bash
   set -a; . ~/.config/overload/overload-dev.env; set +a
   # Prove the target BEFORE anything runs (read-only: identity guard, marker, migration status):
   (cd apps/web && npx tsx scripts/operator/migrate-dev/cli.ts --confirm-ref vdxrmfadikwzodjljbdi)
   npm run dev
   ```

   Expect the dry run to print `hosted project vdxrmfadikwzodjljbdi … confirmed` and `identity marker: verified`. If it prints anything else, **stop**. Note that plain `next dev` has no tripwire (that only fires on Vercel Preview/Development), so this dry run is your check.
4. Close the shell afterwards; nothing persists.

Never run the wrapper with `--execute`, a seed, or any operator tool without the owner's approval for that specific action. Never use `prisma migrate dev`, `migrate reset` or `db push`.

## 5. Verifying the identity guards

Unit tests (no database, no network):

```bash
npm test -- tests/unit/target-identity.test.ts tests/unit/deployment-guard.test.ts tests/unit/operator-target-guards.test.ts tests/unit/import-target-and-images.test.ts
```

A real-process refusal with dummy values (no connection is ever opened; the password below is not real):

```bash
cd apps/web
DATABASE_URL='postgresql://postgres.ycxvdiklpefyhdclxyau:DUMMY@aws-0-us-east-1.pooler.supabase.com:6543/postgres' \
DIRECT_URL='postgresql://postgres.ycxvdiklpefyhdclxyau:DUMMY@aws-0-us-east-1.pooler.supabase.com:5432/postgres' \
NEXT_PUBLIC_SUPABASE_URL='https://ycxvdiklpefyhdclxyau.supabase.co' \
npx tsx scripts/operator/migrate-dev/cli.ts --confirm-ref ycxvdiklpefyhdclxyau --execute
# expect: REFUSED … PRODUCTION, exit 1
```

Preview tripwire: `VERCEL_ENV=preview DATABASE_URL=<the dummy production URL above> npx next build` must fail at config load, naming `DATABASE_URL` and never its value.

## 6. Windows and macOS differences that matter

- **Line endings.** `.gitattributes` forces LF (`* text=auto eol=lf`), so Prettier passes on both. Do not set `core.autocrlf` on the Mac.
- **Test scripts.** `npm test` / `npm run test:integration` previously used an inline `NODE_OPTIONS=…`, which cmd.exe cannot parse. They now call `node --experimental-vm-modules` directly (fixed in PR #139). They work in zsh as-is.
- **Embedded Postgres in the integration tests** listens on `TEST_PG_PORT` (default 5433). An interrupted run can leave an orphan holding the port, which makes the next run hang. On macOS: `lsof -i :5433`, then kill that process; or give each run a distinct port (`TEST_PG_PORT=5551 npm run test:integration`). On the Windows machine it used a WIN1252 encoding, which is why migrations must stay ASCII-only. Keep that rule.
- **Shell syntax.** Docs use bash/zsh syntax. In PowerShell, `npm run x -- --flag` drops options; the operator tools say to run them with `npx tsx` directly, which is also the safest form on macOS.
- **Next.js security notice.** `next.config.ts` enables `experimental.agentUpgrade: "security"`. The first `next build` of each command may stop with `SecurityFatalError` (the installed Next has a known advisory); running the same command again continues. Upgrading Next is a separate, unscheduled task.
- **Known failing browser tests** (same on `main`, unrelated to this work): the signed-out `/` redirect test, the tour step count (9 vs 10), the password-recovery signup step, and a What's New sign-in step.

## 7. Private transfers (never in Git)

Nothing needs to be copied from the Windows machine; everything can be re-issued from the dashboards. You need, on the Mac only:

- The five `overload-dev` values listed in section 4, from the Supabase dashboard. If the database password is lost, resetting it is a dashboard action that also requires updating Vercel's Preview variables; do that deliberately, not as a side effect.
- The dev-only invite code you chose for staging signups (`OVERLOAD_INVITE_CODE`).
- A GitHub login (`gh auth login`) and Vercel login.
- **Do not bring the Production credentials.** They live in Vercel's Production scope and Supabase's dashboard.
- Optional: Claude Code's project memory notes live outside the repo, under `~/.claude/projects/`. They are working notes (no secrets). Copying them is a convenience, not a requirement; the repo's `CLAUDE.md` files carry the rules.

## 8. Staging

- Branch: `staging`. Stable URL (after Vercel finishes a deployment): `https://overload-training-git-staging-wtrhodes02-gmailcoms-projects.vercel.app`. It sits behind Vercel Authentication: sign in to Vercel in the same browser first.
- A confirmed fact at handoff: Vercel builds `staging` as a Preview and the URL resolves (it redirects to Vercel's login).

### Manual staging steps still open (as of this handoff)

None of these has been confirmed done:

1. **Supabase → `overload-dev` → Authentication → URL Configuration:** Site URL = the staging URL; Redirect URLs = that URL with `/**` only; remove old feature-branch URLs.
2. **Vercel → Environment Variables (Preview):** `OVERLOAD_SIGNUP_MODE=invite`; `OVERLOAD_INVITE_CODE` (dev-only); `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` and `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA` (Cloudflare's published always-pass test keys); confirm every database and Supabase variable names `vdxrmfadikwzodjljbdi`; confirm "Automatically expose System Environment Variables" is on. Redeploy `staging` afterwards.
3. **Owner approval, then apply the two Pitch 22 migrations to `overload-dev`:** dry run first, then `--execute` with the guarded wrapper (see `staging-environment.md` and PR #139).
4. **Then** set `PLAN_IMPORT_ENABLED=true` scoped to the `staging` branch only, redeploy, sign up through the staging form, and run the smoke test in `staging-environment.md`.

## 9. Outstanding approvals

**Before meaningful Pitch 22 testing:** the development migrations (above). Even then, the review/edit/confirm screens cannot be reached in a browser until a provider exists; intake, uploads, gating, ownership and discard can.

**Before any Production release of Pitch 22** (none done): a provider spend limit (`PLAN_IMPORT_MONTHLY_SPEND_MICROS`) and the decision on consent and data terms; the evaluation gates in `docs/pitches/mvp-4-web-commercial/22-workout-plan-import-review/runbook.md`; a scheduled purge for abandoned imports (no scheduler exists, so only the manual cleanup CLI); a fresh backup and a human-run Production migration; and a separate PR to `main` containing only approved features. `ANTHROPIC_API_KEY` stays unset everywhere until then, and `PLAN_IMPORT_ENABLED` must never be set in Production.
