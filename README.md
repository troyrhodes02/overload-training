# Overload

A single-user strength training tracker. See `docs/planning/` for the product
brief, PRD, architecture, and pitch roadmap, and `CLAUDE.md` for the engineering
invariants.

## Stack

- Next.js (App Router) + React + TypeScript — server-first.
- Supabase — Postgres + Auth (the Supabase client is used for auth only).
- Prisma — schema authority and the only path to application data.
- Tailwind CSS + shadcn/ui — the single styling/component system.
- Vercel — hosting.

## Getting started

```bash
npx supabase start     # local Supabase stack (Docker): Postgres + Auth + Studio
cp .env.example .env    # fill the LOCAL block from `supabase start` output
npm install
npx prisma migrate deploy   # apply the schema to the local stack
npm run dev
```

Create your single local user in local Studio (http://127.0.0.1:54323 →
Authentication → Add user), then sign in at `/login`.

**Environment model:** local development runs against the **Supabase CLI local
stack** (`npx supabase start`). Vercel **Preview** deployments run against the
**`overload-dev`** Supabase project (synthetic data only), and Vercel
**Production** runs against **`overload-prod`**. There is no staging tier. A
Preview build or server whose database or Supabase variables name the
Production project refuses to run. Operator scripts identify their target by
Supabase project ref and need `--confirm-ref` for any hosted project. See
**`docs/technical/environment-isolation.md`**.

## Scripts

| Script | What it does |
| ------ | ------------ |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (`prisma generate` runs on `postinstall`) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run format` / `format:check` | Prettier write / check |
| `npm test` | Jest unit tests |
| `npm run test:integration` | Jest integration tests against a throwaway Postgres (`TEST_DATABASE_URL`; an embedded Postgres is provisioned automatically) |
| `npm run test:e2e` | Playwright auth-boundary tests (uses system Chrome via `channel`) |
| `npm run test:e2e:accounts` | Accounts lifecycle in a real browser (self-signup with username, isolation, sign out/in, Settings, deletion). Needs `npx supabase start`; uses only the local stack (refuses anything else) and removes the temporary accounts it creates |
| `npm run verify:client-bundle` | Fails if a server DB secret leaked into `.next/static` (run after `build`) |
| `npm run db:migrate:dev` | Guarded `prisma migrate status` / `deploy` (`--execute`) for the local stack or the confirmed dev project (`--confirm-ref`); refuses Production with no override |

## Database & migrations

The Prisma client connects at runtime through the **pooled** `DATABASE_URL`
(via the pg driver adapter in `src/lib/db.ts`). The migration CLI uses the
**direct** `DIRECT_URL` (configured in `prisma.config.ts`).

Every table has row-level security enabled with **no** policies (deny-all), so
the Supabase Data API is closed and Prisma is the only door into application
data. Do not add a policy to make a query work.

## Deployment

Deployment is via Vercel: **Production** (→ `overload-prod`) and **Preview**
(→ `overload-dev`). The build runs `next build` only — it does **not** apply
migrations. Production database migrations and all external provisioning are
performed by a human from a runbook, with a fresh backup. The development
project is initialized with the guarded procedure in
**`docs/technical/environment-isolation.md`**.
