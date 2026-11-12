# Overload

A strength training tracker that tells each lifter, per lift and per session, whether to progress, hold, or deload. See `docs/planning/` for the product brief, PRD, architecture, and roadmaps, and `CLAUDE.md` for the engineering invariants.

## Repository layout

The repository is an npm workspace (Pitch 21a):

| Path | What it is |
| --- | --- |
| `apps/web` | The Next.js web app (`@overload/web`): `src/`, `prisma/`, `public/`, `tests/`, `e2e/`, `scripts/`, `supabase/` |
| `apps/mobile` | Reserved for the Expo iPhone app (slice 21d) |
| `packages/shared` | `@overload/shared`: source-only, platform-independent TypeScript shared by both clients (filled in 21b) |
| `docs/` | Planning, pitches, runbooks, technical notes |

One `npm install` at the root installs every workspace into the root `node_modules`, using the single root `package-lock.json`. Run commands from the root; each one delegates to the workspace that owns it. They also work from inside `apps/web`.

## Stack

- Next.js (App Router) + React + TypeScript — server-first.
- Supabase — Postgres + Auth (the Supabase client is used for auth and Storage only).
- Prisma — schema authority and the only path to application data.
- Tailwind CSS + shadcn/ui — the single styling/component system.
- Vercel — hosting (Root Directory `apps/web`).

## Getting started

Prerequisites: Node 22 and Docker running (the Supabase CLI local stack runs in Docker).

**1. Create `apps/web/.env.local`** (git-ignored). Copy the two keys from `npx supabase status` (run in `apps/web`) after step 2 starts the stack:

```bash
# apps/web/.env.local — LOCAL stack only. Never put hosted or Production values here.
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<Publishable key, sb_publishable_…>"
SUPABASE_SERVICE_ROLE_KEY="<Secret key, sb_secret_…>"   # server-only; signup needs it

OVERLOAD_SIGNUP_MODE=public    # open signup locally
TURNSTILE_DISABLED=true        # no bot-challenge widget locally (refused on Vercel Production)
PLAN_IMPORT_ENABLED=false
STRIPE_BILLING_ENABLED=false   # set true with Stripe TEST keys: STRIPE_SECRET_KEY,
                               # STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID_MONTHLY, STRIPE_PRICE_ID_ANNUAL
```

**2. Install, start the stack, migrate, seed, run.** From the repository root:

```bash
npm ci                                       # all workspaces; generates the Prisma client
cd apps/web
npx supabase start                           # local Postgres + Auth + Studio + Mailpit (status: npx supabase status)
set -a; . ./.env.local; set +a               # Prisma and the operator scripts read exported vars, not .env.local
npm run db:migrate:dev -- --execute          # guarded migrate deploy: local stack OK, hosted needs --confirm-ref
npm run db:seed                              # exercise library (refuses a non-local DB without confirmation)
cd ../..
npm run dev                                  # http://localhost:3000
```

Re-running is safe: migrate applies only pending migrations, and the seed is idempotent. Day to day, only `npx supabase start` (in `apps/web`, if the stack is stopped) and `npm run dev` are needed; repeat the migrate step after pulling a branch that adds a migration.

Then sign up at `/signup` (or add a user in Studio, http://127.0.0.1:54323 → Authentication), and sign in at `/login`. Auth emails land in Mailpit (http://127.0.0.1:54324).

Env files live in `apps/web/`. A `.env` at the repository root is no longer read (Pitch 21a). `.env.local` is read by `next dev`; Prisma's CLI reads `apps/web/.env` or exported variables, hence the `set -a` line.

**Troubleshooting**

- *"Too many attempts" on the first signup* — the local database has no schema. The signup throttle fails closed when it can't write, so an unmigrated database shows up as a rate limit. Run the migrate step.
- *Signup fails after the throttle* — `SUPABASE_SERVICE_ROLE_KEY` is missing from `.env.local`.
- *Empty exercise library or plan builder* — run `npm run db:seed`.

**Environment model:** local development runs against the **Supabase CLI local stack**. Vercel **Preview** deployments (every branch, including the permanent `staging` branch) run against the **`overload-dev`** Supabase project (synthetic data only), and Vercel **Production** runs against **`overload-prod`**. A Preview build or server whose database or Supabase variables name the Production project refuses to run. Operator scripts identify their target by Supabase project ref and need `--confirm-ref` for any hosted project. See **`docs/technical/environment-isolation.md`** and **`docs/technical/staging-environment.md`**.

## Scripts (run from the repository root)

| Script | What it does |
| ------ | ------------ |
| `npm run dev` | Next.js dev server for the web app |
| `npm run build` / `npm start` | Production build / start (`prisma generate` runs on install) |
| `npm run lint` | ESLint in every workspace, then the root `scripts/` |
| `npm run typecheck` | `tsc --noEmit` in every workspace |
| `npm run format` / `format:check` | Prettier write / check over the whole repository |
| `npm test` | Web unit tests, then the workspace boundary check |
| `npm run verify:workspaces` | Workspace boundary check: dependency placement, no scheduler or queue, one React runtime |
| `npm run test:integration` | Jest integration tests against a throwaway Postgres (`TEST_DATABASE_URL`; an embedded Postgres is provisioned automatically) |
| `npm run test:e2e` | Playwright auth-boundary tests (uses system Chrome via `channel`) |
| `npm run test:e2e:accounts` | Accounts lifecycle in a real browser. Needs the local stack (`npx supabase start` in `apps/web`); refuses anything else and removes the temporary accounts it creates |
| `npm run verify:client-bundle` | Fails if a server secret leaked into `apps/web/.next/static` (run after `build`) |
| `npm run db:migrate:dev` | Guarded `prisma migrate status` / `deploy` (`--execute`) for the local stack or the confirmed dev project (`--confirm-ref`); refuses Production with no override |

Pass tool flags after `--`, for example `npm test -- tests/unit/scope.test.ts` or `npm run demo:seed -- --user-id <uuid>`. Paths are relative to `apps/web`.

## Database & migrations

The Prisma client connects at runtime through the **pooled** `DATABASE_URL` (via the pg driver adapter in `apps/web/src/lib/db.ts`). The migration CLI uses the **direct** `DIRECT_URL` (configured in `apps/web/prisma.config.ts`). Run Prisma commands from `apps/web`.

Every table has row-level security enabled with **no** policies (deny-all), so the Supabase Data API is closed and Prisma is the only door into application data. Do not add a policy to make a query work.

## Deployment

Deployment is via Vercel, with the project's Root Directory set to `apps/web`: **Production** (→ `overload-prod`) and **Preview** (→ `overload-dev`). The build runs `next build` only — it does **not** apply migrations. Production database migrations and all external provisioning are performed by a human from a runbook, with a fresh backup. The development project is initialized with the guarded procedure in **`docs/technical/environment-isolation.md`**.
