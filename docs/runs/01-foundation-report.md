# Foundation — Autonomous Run Report

**Pitch:** Overload — Pitch: Foundation (slug `01-foundation`)
**Project / milestone:** Overload V1 → Foundation
**Date:** 2026-10-06

## Feature PR

- **PR #1 — https://github.com/troyrhodes02/overload-training/pull/1** (`feat/01-foundation` → `main`).
- **The feature branch was intentionally NOT merged into `main`.** Foundation changes authentication, row-level security, and the schema scaffold, and production Supabase/Vercel provisioning requires human action (see the runbook). The PR is left open, green, and reviewed for human verification and merge.

## What was built

An authenticated, RLS-secured, Prisma-backed, deployable Next.js substrate — and **no training behavior**:

- Supabase **email/password** auth, single account, **no signup/registration** surface. `proxy.ts` optimistic redirect + `requireUser()` authoritative gate in the protected layout + independent re-check in every server action.
- Full approved **11-entity** Prisma schema with the Architecture Doc's invariants (logged chain `onDelete: Restrict`, soft-delete on `Exercise`/`Gym`, **no** stored progression tag / e1RM, **no** ownership column).
- One migration that creates every table **and** enables **deny-all RLS** (no policies) on all 11 tables + `_prisma_migrations`.
- Single shared Prisma client on the pooled `DATABASE_URL` (pg driver adapter); `DIRECT_URL` for migrations only; secrets server-only.
- Jest unit + integration (throwaway Postgres via `TEST_DATABASE_URL`, never Supabase, no `DATABASE_URL` fallback); Playwright for the auth boundary.
- Tailwind v4 + shadcn/ui theme; minimal phone-first authenticated shell with one honest destination (Today) and an extensible nav.

## Tickets (all Done)

| Ticket | Title | Ticket PR (squash-merged into feature) |
| ------ | ----- | -------------------------------------- |
| OVE-5 | Project tooling, styling system & conventions | #2 |
| OVE-6 | Prisma schema, shared client, migration & deny-all RLS | #3 |
| OVE-7 | Integration test harness & schema/RLS invariant tests | #4 |
| OVE-8 | Supabase auth: login, sign-out, proxy & DAL | #5 |
| OVE-9 | Protected app shell, nav, states, E2E & deploy config | #6 |

Each ticket was implemented on a stacked branch with its own green PR, then squash-merged into `feat/01-foundation` in build order. (The squash landing was done locally and the ticket PRs closed with a pointer comment, because GitHub's squash-merge API conflicts on a stacked diff; the per-ticket squash commits are on the feature branch.)

## Final verification results (all actually run on the audited feature branch, green)

| Check | Command | Result |
| ----- | ------- | ------ |
| Lint | `npm run lint` (eslint) | ✅ pass |
| Typecheck | `npm run typecheck` (`tsc --noEmit`, after build generates route types) | ✅ pass |
| Format | `npm run format:check` (prettier) | ✅ pass |
| Unit tests | `npm test` (jest) | ✅ 23 passed / 5 suites |
| Integration tests | `npm run test:integration` (jest + embedded Postgres) | ✅ 10 passed / 3 suites |
| Build | `npm run build` (`next build`) | ✅ pass |
| Browser tests | `npm run test:e2e` (Playwright, system Chrome) | ✅ 3 passed |
| Client-bundle secret guard | `npm run verify:client-bundle` | ✅ pass |

### Foundation-specific invariant verification (all proven, green)

- **RLS enabled on every table created by the schema** — integration `rls.int.test.ts`: zero public tables without `relrowsecurity`, `_prisma_migrations` included.
- **Supabase anon-key Data API cannot read application rows** — integration: an `anon` role granted table `SELECT` (as Supabase grants) reads **0** rows from every table even when a row exists; zero policies in `public`.
- **Unauthenticated requests to protected routes are redirected** — Playwright: `/` (and unknown routes) redirect to `/login`; also enforced by `proxy.ts` + the `requireUser()` layout gate.
- **Protected server actions reject an unauthenticated caller** — unit: `signOutAction` calls `requireUser()` first and does not sign out when unauthenticated; `requireUser()` redirects on null session.
- **Public signup not exposed / no registration route** — Playwright: login has no sign-up affordance; `/register` and `/signup` expose no sign-up surface (bounced to `/login`).
- **Tests cannot target `DATABASE_URL` when `TEST_DATABASE_URL` is absent** — unit + `assertTestDatabaseUrl()`: throws when unset, when it equals `DATABASE_URL`, or when it targets a Supabase host.
- **Build does not expose server DB credentials to client code** — `verify:client-bundle` scans `.next/static` for `DATABASE_URL`/`DIRECT_URL`/`service_role` and secret values → none.
- **Prisma schema contains the Architecture Doc's required core entities** — integration: all 11 tables present.
- **Foundation did not seed demo/training data** — integration: all 11 app tables empty on a clean migrate; unit: no seed script and no `INSERT` in the migration.
- **No `LoggedSet` write outside `lib/logging/logged-sets.ts`** — unit static scan (vacuously true; guard established for later pitches).

## Decisions made autonomously and their rationale

All are recorded in `docs/specs/01-foundation-spec.md` → **Resolved Decisions**. Summary:

- **D1–D9** — the pre-resolved platform decisions from the run instruction (email/password + no signup; Prisma-only data access; deny-all RLS; full schema, no behavior; Jest + throwaway Postgres; pooled/direct connection split + one client; separate dev/prod, no staging; minimal shell; Tailwind/shadcn, styling-doc discrepancy is upstream). Recorded as approved doc authority.
- **D10** — Next.js 16's middleware is `src/proxy.ts` (installed framework is 16.4.0). Rationale: current framework convention.
- **D11** — keep `cacheComponents` enabled (committed scaffold convention); the protected segment uses `export const instant = false` to block on the server for the auth check. Rationale: instant-navigation optimization is an explicit Foundation rabbit hole; `instant` is a documented Next 16 route-segment config.
- **D12** — login/sign-out are server actions using the `@supabase/ssr` server client; `requireUser()` uses `supabase.auth.getUser()` (validates with the Auth server). Rationale: keep auth server-side, re-check in actions.
- **D13** — Tailwind v4 + shadcn/ui + lucide-react + Inter. **D14** — npm. **D15** — Prettier; explicit `typecheck`/`format:check` scripts.
- **D16** — integration DB uses `embedded-postgres` here; honors an external `TEST_DATABASE_URL` (CI). Rationale: no local PG server / Docker; embedded PG runs full DDL + RLS.
- **D17** — Vercel build runs `next build` only; `prisma generate` on `postinstall`; **no** `prisma migrate deploy` in the build. Rationale: production migrations are a human step (D7 + stop conditions).
- **D18** — only `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` are public; DB URLs/service-role are server-only.
- **D19** — honest, extensible nav with exactly one real destination (Today); no placeholder feature routes.
- **D20** — the static-write guard, RLS/anon/Restrict/derived-column/no-seed checks run in CI as part of the suite.

## Review findings and dispositions

`/review` (3 finder angles + verification) left 3 inline findings on PR #1; `/overload-review-audit` classified and I applied them:

| Finding | Validity / Scope | Disposition |
| ------- | ---------------- | ----------- |
| `proxy.ts` redirect responses dropped refreshed session cookies (mid-session logout) | VALID / IN_SCOPE (auth correctness) | **IMPLEMENTED** — `redirectTo()` copies `response` cookies onto the redirect |
| `app-nav.tsx` active state hardcoded (breaks when a 2nd item is added) | VALID / IN_SCOPE (Foundation shell; D19 promise) | **IMPLEMENTED** — derive active from `usePathname()` |
| `package.json` redundant `--runInBand` vs `maxWorkers: 1` | VALID / IN_SCOPE | **IMPLEMENTED** — dropped the flag |

**Refuted / verified-clean (no action):**
- `export const instant = false` flagged as an unrecognized no-op → **refuted**: it is a documented Next.js 16 route-segment config (`node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md`).
- Invariants & conventions audit: **no violations** (RLS, history, connection roles, secrets, test isolation, no-seed all conform).
- Shared cookie-adapter shape (proxy vs server) — deliberately distinct request contexts; not extracted.
- `assertTestDatabaseUrl` DATABASE_URL-equality guard — intentional defense-in-depth; kept.

## Deferrals

None. All review findings dispositioned as IMPLEMENT were applied within Foundation scope. No findings warranted a future Linear issue or a deferral code comment.

## Anything genuinely undecidable

None. All Foundation-relevant open questions were resolvable under the authority order. The Architecture Doc open questions that Foundation does **not** own (progression thresholds, deload reduction, gym-baseline margin, gym-variable equipment set, working-weight home, skipped/shifted-day persistence, e1RM formula, exercise image bucket, goal block-vs-replace, zero weight/reps handling) are carried forward to their owning pitches (spec §17).

## Near-misses where Foundation approached later-feature scope

- **Schema is present but inert.** All 11 entities exist with full relationships, but no read/write path, no write modules, no UI touches them. Having a table did not authorize building its feature.
- **App shell / navigation.** Kept to one real destination (Today) with an honest empty state; resisted adding Plan/History/Goals placeholder routes that would imply functionality.
- **No seed data.** The schema is created empty; the free-exercise-db import and Storage posture were deliberately left to Library & Gyms Setup.
- **Auth stayed minimal.** Email/password only; no magic link, OAuth, invite, onboarding, or password-reset UX.

## Required upstream amendments (for a human to apply; not edited this run)

1. **Styling-system discrepancy (required report item).** `docs/planning/architecture.md` (Tech Stack) says the "Frontend styling/component approach … is intentionally left undecided," while `CLAUDE.md` states **Tailwind CSS with shadcn/ui** is "the single component and styling system." These contradict. Foundation followed `CLAUDE.md` (authoritative for stack). **Amend `architecture.md` to record Tailwind + shadcn/ui as the decided styling system.** (`docs/planning/` was not edited during this run.)
2. **Pitch-1 PRD traceability exception.** As the pitch itself notes, Foundation has no corresponding PRD feature section; its acceptance criteria derive from the Pitch Roadmap + Architecture Doc. Worth recording explicitly in the planning docs so a downstream agent doesn't fabricate PRD traceability.

## Platform / framework notes a human should know

- **Prisma 7.10.0** is pinned; the `prisma` package's `latest` dist-tag currently points at an **8.0 RC** — do not `npm i prisma@latest`. Connection URLs live in `prisma.config.ts` (not `schema.prisma`); the runtime client uses the `@prisma/adapter-pg` driver adapter.
- **Playwright** uses the **system Google Chrome** via `channel` because the bundled-browser download is blocked in this environment. CI without system Chrome should run `npx playwright install chromium` and unset `PLAYWRIGHT_CHANNEL`, or provide a Chrome channel.

## Required external / manual steps still pending

All of `docs/runs/01-foundation-runbook.md` — none were performed this run (no Supabase/Vercel/production changes, no production credentials used). In brief: create/confirm dev + prod Supabase projects; disable signups; obtain dev `DATABASE_URL`/`DIRECT_URL` + public auth values; create the Vercel project; set preview envs (→ dev) and production envs (→ prod); apply the reviewed migration to production; create the single production user; verify prod RLS posture; first production login; verify unauthenticated prod access is redirected and the authenticated shell loads; rollback guidance.

## Readiness for Library & Gyms Setup (Pitch 2)

**Yes — after a human completes the runbook.** The code substrate is complete and green: authentication works, deny-all RLS is enforced, the full entity schema exists with correct referential guarantees, the shell is ready to host new surfaces, and the deploy pipeline is wired. Pitch 2 can build the Exercise Library and Gym Management on top without revisiting platform decisions. The only gate is the human-performed production/external setup in the runbook (and merging PR #1).

## Halt status

Not halted. The pipeline ran end to end. The run stopped exactly where instructed — **after** committing/pushing the audited branch and re-running the full green suite, **without** merging `feat/01-foundation` into `main`.
