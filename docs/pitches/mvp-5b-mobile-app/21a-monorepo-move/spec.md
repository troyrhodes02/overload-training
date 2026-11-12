---
version: 1.0.0
status: approved
author: Claude Code (autonomous pipeline run)
last_updated: 2026-11-12
pitch_reference: docs/pitches/mvp-5b-mobile-app/21a-monorepo-move/pitch.md
design_reference: docs/pitches/mvp-5b-mobile-app/21a-monorepo-move/design.md
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
roadmap_reference: docs/planning/mobile-roadmap.md (21a), docs/planning/mobile-audit.md (§4, §8, §9, Q-2)
linear_milestone: Pitch 21a — Monorepo Move (Overload V1)
---

# Monorepo Move — Technical Specification

UI design step: **Skipped — no UI surface in this pitch.** There is no `preview.tsx`.

## 1. Summary

Monorepo Move turns the single-application repository into an **npm workspace** with three homes: `apps/web` (the existing Next.js app, moved whole), `apps/mobile` (reserved for the Expo app in 21d), and `packages/shared` (an empty, fenced, source-only package that 21b fills). One root `package.json` lists the workspaces and offers the familiar commands, one root `package-lock.json` pins every dependency, and every tool's configuration lives with the workspace it serves.

The core abstraction is **"move, don't modify."** Every web file arrives in `apps/web` with its contents unchanged, except a short, enumerated list of path fixes (§8). Each fix exists to keep a behavior identical, and each has a check. The web app's routes, server actions, data access, auth, entitlements, styling, and assets do not change. No Prisma model, migration, or business rule changes.

"Working" means: `npm ci` at the root installs everything, generates the Prisma client, and leaves exactly one React runtime in the tree. Lint, typecheck, format, the unit and integration suites, and the production build all pass from the root and discover the same tests as before the move (140 unit files and 2,333 tests, 90 integration files, and 27 browser tests in the default end-to-end config). The source-scanning guards still find what they were written to find. PDF plan import still traces `pdfjs-dist` into the deployed function. The build still refuses a Preview that names Production. On the hosting side, "working" is completed by the owner: after the Vercel Root Directory becomes `apps/web`, staging builds and passes its smoke test.

## 2. Problem

- The repository cannot yet hold a second client. There is no `workspaces` key and no `apps/` or `packages/`, and the `@/*` alias, Prisma, Jest, Playwright, ESLint, and every script assume the web app is the repository root (`mobile-audit.md` §4, §8).
- The repository cannot yet tell whether the Expo SDK's React can live beside the web's React 19.3.0. A wrong arrangement gives one app the other app's React, the classic "invalid hook call", and it can fail silently in the web's server bundle (§10).
- Two deployment-critical settings would break silently under hoisting (audit Q-2). Turbopack's root pins resolution to the project folder, and the `pdfjs-dist` tracing include points at `./node_modules`. The second failure would surface only in the deployed PDF import.
- The guard tests that protect account isolation, history, entitlements, and secrets read files by path. A careless move could make them pass by reading nothing.
- 21b (shared package), 21c (mobile API), and 21d (Expo shell) all depend on this layout. The roadmap requires staging to be verified after the move before 21b starts.

## 3. Scope and non-scope

### In scope

1. npm workspaces at the repository root: `apps/*` and `packages/*`.
2. Moving the web app and everything that belongs to it into `apps/web` (§8.1).
3. Root commands that delegate to the owning workspace (§8.3).
4. Path fixes needed to keep identical behavior: Turbopack and tracing roots, the `pdfjs-dist` tracing include, the Jest launcher, tests that read `docs/`, the Lucide SVG helper, `.gitignore`, `.prettierignore` (§8.4–§8.9).
5. A minimal `packages/shared` workspace that enforces the forbidden-import rule, and an `apps/mobile` placeholder note (§8.10).
6. A root workspace-boundary check: dependency placement, the banned-infrastructure list across every manifest, and a single React runtime (§8.11).
7. Two web guard tests for the migration: the monorepo build configuration, and test-file discovery (§8.12).
8. The React/Expo compatibility investigation and the rules it sets for 21b and 21d (§10).
9. Documentation: README, the path note in `CLAUDE.md` and the skills, the current operational docs in `docs/technical/`, and the runbook with the Vercel handoff (§11, `runbook.md`).

### Out of scope

- The Expo app, React Native, EAS, Metro configuration, TestFlight, and Expo updates (21d, 21l).
- Shared package contents: pure training modules, DTOs and the error contract, enum tuples and the parity test, tokens, and `transpilePackages` wiring (21b).
- The mobile API, the proxy exemption, and token auth (21c).
- Any change to a route, server action, component, style, business rule, Prisma model, migration, entitlement, billing, signup, or admin behavior.
- Dependency upgrades, including React, Next, TypeScript, and Prisma. No dependency version changes.
- A CI service (audit Q-1). It remains a separate decision; see Open Questions.
- Any Production action: Vercel Production settings, Production environment variables, Production data, or a Production deployment.
- Rewriting historical pitch documents, specs, and runbooks that name pre-move paths. They are records of what was true when written.

Adjacent temptations, and why they are excluded: extracting "just the obvious" pure modules into `packages/shared` belongs to 21b. Fixing `.env.example` drift (audit Q-3) is a cleanup with no relation to the move. Renaming the guard tests' `REPO_ROOT` constant to `WEB_ROOT` would be churn across about fifteen files for no behavior.

## 4. Core concepts

| Concept | Description |
| --- | --- |
| **Monorepo root** | The repository root. Holds the workspace list, the single lockfile, repository-wide formatting and ignore rules, `docs/`, `CLAUDE.md`, `README.md`, `.claude/`, and the workspace-boundary check. Has no runtime dependencies. |
| **Web workspace** (`apps/web`, package `@overload/web`) | The existing Next.js app. Owns Next, Prisma, Jest, Playwright, ESLint, TypeScript, Tailwind, shadcn configuration, every test, every script, and the local Supabase config. Its own root is what the guard tests call `REPO_ROOT`. |
| **Shared workspace** (`packages/shared`, package `@overload/shared`) | A source-only TypeScript package with no runtime dependencies. In 21a it exports nothing and is consumed by nothing; it exists so the forbidden-import fence is live before 21b adds content. |
| **Mobile location** (`apps/mobile`) | A directory holding only a README. It has no `package.json`, so npm does not treat it as a workspace until 21d creates the Expo app. |
| **Delegating command** | A root script of the form `npm run <name> -w @overload/web --`. The trailing `--` makes any extra arguments reach the underlying tool unchanged. |
| **Workspace boundary** | The machine-checked rules for which packages may depend on what (§8.11). |
| **React lockstep** | The rule that every workspace which depends on React pins the same exact version, so the install has exactly one React runtime (§10). |
| **Hoisting** | npm places each dependency in the root `node_modules` when one version satisfies every workspace. Under hoisting, `next`, `pdfjs-dist`, `jest`, `@prisma/client`, and the rest live at the root, not under `apps/web/node_modules`. |

Invariants this pitch must not disturb (from `CLAUDE.md`), each still proved by its existing test from the new location: account isolation, logged history as the only source of truth, atomic baselines, compute-on-read progression, RLS deny-all, server-only secrets, the admin boundary, and capability gating.

## 5. States and lifecycle

No product state or lifecycle changes. The only "state machine" is the owner's deployment sequence (§9.3 and `runbook.md`):

| From | To | Who | Effect |
| --- | --- | --- | --- |
| Root Directory blank, feature PR open | Root Directory `apps/web` | Owner | Applies to the next build of every branch, Production included. Nothing redeploys by itself. |
| `apps/web`, feature Preview built | Feature PR merged into `staging` | Owner | Staging builds from `apps/web` |
| Any failure | Root Directory blank, merge reverted on `staging` | Owner | Staging builds from the root layout again |

## 6. UI integration

None. No screen, component, form, or visible state changes (design doc §6). No tour step or release note (design doc §13).

**Client scope and platform impact:** repository infrastructure, preserving existing web behavior. Shared logic: a fenced, empty package. API: none. Web UI: none (moved, unchanged). Mobile UI: none (location reserved).

**Plan placement:** unchanged. No capability is added, removed, or re-gated.

## 7. Data model

**No change.** `apps/web/prisma/schema.prisma` and every migration under `apps/web/prisma/migrations/` move byte-for-byte. No migration is created or applied anywhere. RLS is unchanged on every table. The Prisma generator (`prisma-client-js`, default output) writes the generated client beside `@prisma/client`, which npm hoists to the root `node_modules`. Only the web workspace depends on `@prisma/client`, and the boundary check (§8.11) forbids any other workspace from depending on it.

| Command (from `apps/web`, or the root delegate) | Before | After |
| --- | --- | --- |
| Generate the client | `postinstall: prisma generate` (root) | `postinstall: prisma generate` in `apps/web/package.json`. npm runs workspace lifecycle scripts during the root install, with cwd `apps/web`. |
| Config | `prisma.config.ts` at the root; schema at `prisma/schema.prisma`; migrations at `prisma/migrations`; seed `tsx prisma/seed.ts` | Same file and same relative paths, now under `apps/web/`. Unchanged contents. |
| `.env` for the CLI | `import "dotenv/config"` loads `./.env` from the cwd | Same; the cwd is `apps/web`, so the local file is `apps/web/.env` |
| Dev migration wrapper | `npm run db:migrate:dev -- --confirm-ref <ref>` | Same, from the root (delegates) or from `apps/web` |
| Integration tests | `globalSetup` runs `npx prisma migrate deploy` with cwd = three levels above `tests/integration/support` | Unchanged code; that cwd is now `apps/web` |

## 8. Implementation contract

### 8.1 File migration

Moves use `git mv` so history follows each file (`git log --follow`).

| Today (root) | After | Contents |
| --- | --- | --- |
| `src/` | `apps/web/src/` | unchanged |
| `prisma/`, `prisma.config.ts` | `apps/web/prisma/`, `apps/web/prisma.config.ts` | unchanged |
| `public/` | `apps/web/public/` | unchanged |
| `tests/`, `e2e/` | `apps/web/tests/`, `apps/web/e2e/` | unchanged except §8.7 |
| `scripts/` | `apps/web/scripts/` | unchanged except §8.8; adds `scripts/jest.cjs` (§8.6) |
| `types/` | `apps/web/types/` | unchanged |
| `supabase/` | `apps/web/supabase/` | unchanged. The local stack is the web app's backend. `npx supabase …` and `playwright.accounts.config.ts` run from `apps/web`. |
| `next.config.ts` | `apps/web/next.config.ts` | §8.5 |
| `tsconfig.json`, `tsconfig.jest.json` | `apps/web/` | unchanged |
| `jest.config.js`, `jest.integration.config.js` | `apps/web/` | unchanged (`<rootDir>` is the config's directory) |
| `playwright.config.ts`, `playwright.accounts.config.ts` | `apps/web/` | unchanged (`testDir` and `webServer` resolve from the config's directory) |
| `eslint.config.mjs` | `apps/web/eslint.config.mjs` | unchanged rules; one comment notes previews now sit outside every workspace |
| `postcss.config.mjs`, `components.json` | `apps/web/` | unchanged |
| `AGENTS.md` | `apps/web/AGENTS.md` | unchanged. `next dev` writes it to the project directory, so it must live with the app or `next dev` recreates it. |
| `.env.example` | `apps/web/.env.example` | unchanged. Next and `dotenv/config` read env files from `apps/web`, and the invariant guard reads it from the web root. |
| `package.json` | `apps/web/package.json` (renamed `@overload/web`) plus a new root `package.json` | §8.2 |
| `package-lock.json` | stays at the root, regenerated for the workspace | §8.2 |
| `docs/`, `CLAUDE.md`, `README.md`, `.claude/`, `.gitattributes`, `.prettierrc.json` | stay at the root | `README.md` and `CLAUDE.md` updated (§11) |
| `.gitignore`, `.prettierignore` | stay at the root | §8.9 |
| (new) `apps/mobile/README.md` | | §8.10 |
| (new) `packages/shared/*` | | §8.10 |
| (new) `scripts/workspace-boundaries.mjs`, `scripts/workspace-boundaries.test.mjs` | root | §8.11 |

Untracked local artifacts at the old root (`.next/`, `node_modules/`, `tsconfig.tsbuildinfo`, `next-env.d.ts`, `test-results/`) are git-ignored. The runbook tells the owner to remove them and to move a local `.env` to `apps/web/.env`.

### 8.2 Package manifests and lockfile

Root `package.json`:

```json
{
  "name": "overload-training",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": { "…": "see §8.3" },
  "devDependencies": { "prettier": "<the version the web declared>" }
}
```

- The root has **no `dependencies`**. Repository-wide tooling is the one exception: Prettier formats the whole repository, so its declaration moves from the web's `devDependencies` to the root's, at the same version range.
- No `engines` field is added at either level. Vercel reads `engines.node` from the Root Directory's `package.json`, and adding one would change Vercel's Node.js selection.
- `apps/web/package.json` keeps every dependency and devDependency at the same version range (minus `prettier`), keeps every web script (§8.3), keeps `"private": true`, and is renamed `@overload/web`.
- **Lockfile.** Regenerated with `npm install` at the root. The verification (§13, M-3) proves that the multiset of resolved `name@version` pairs, excluding the workspace link entries, is identical before and after. The move changes placement, never versions.

### 8.3 Commands (pitch OQ2)

Every existing root command keeps its name. Root scripts delegate to the web workspace with a trailing `--` so extra arguments reach the tool. Lint, typecheck, and test run in every workspace that defines them. Formatting stays a single root run with one config.

| Root command | Delegates to | Notes |
| --- | --- | --- |
| `dev`, `build`, `start` | `npm run <x> -w @overload/web --` | `npm start -- -p 3100` still works |
| `postinstall` | (none at root) | the web workspace's own `postinstall: prisma generate` runs during the root install |
| `lint` | `npm run lint --workspaces --if-present` | web: `eslint` (unchanged); shared: `eslint` (§8.10) |
| `typecheck` | `npm run typecheck --workspaces --if-present` | web: `tsc --noEmit` (unchanged); shared: `tsc --noEmit -p .` |
| `test` | `npm run test --workspaces --if-present --`, then the root `posttest` runs `npm run verify:workspaces` | web unit suite, then the boundary check. `posttest` (not `&&`) so `npm test -- <args>` still delivers its arguments to Jest. |
| `verify:workspaces` | `node scripts/workspace-boundaries.mjs && node --test scripts/workspace-boundaries.test.mjs` | root only |
| `format`, `format:check` | `prettier --write .` / `prettier --check .` at the root | one config, one ignore file; no workspace format scripts |
| `test:integration`, `test:e2e`, `test:e2e:accounts`, `verify:client-bundle`, `db:seed`, `db:migrate:dev`, `import:plan`, `ownership:backfill`, `founding-members:grant`, `plan-import:cleanup`, `demo:seed` | `npm run <x> -w @overload/web --` | unchanged web definitions, run with cwd `apps/web` |

The same commands also work when run from inside `apps/web`.

### 8.4 TypeScript

- `apps/web/tsconfig.json` is unchanged. `@/*` still maps to `./src/*` relative to `apps/web`. `include` globs are relative to `apps/web`, so the type-checked file set is the same as before. The `docs/pitches/**/preview.*` exclude becomes inert, because previews now live outside the workspace, and it is kept so the D5 rule stays visibly intact.
- `packages/shared/tsconfig.json`: `strict`, `noEmit`, `module`/`moduleResolution` `esnext`/`bundler`, `lib: ["es2022"]` with **no DOM**, and `types: []`, so neither DOM nor Node globals are available to shared code. `include: ["src"]`.
- No root `tsconfig.json`. Editors resolve each file's nearest `tsconfig.json`.

### 8.5 Next.js configuration (audit Q-2)

```ts
// apps/web/next.config.ts (changed lines only)
import path from "node:path";

// The npm workspace root (two levels up). Turbopack resolves modules only
// inside its root, and npm hoists `next` and most dependencies there, so the
// root must be the workspace root, not this folder. Tracing must agree with it.
const WORKSPACE_ROOT = path.join(__dirname, "..", "..");
// pdfjs-dist is loaded through a runtime-built import() that the tracer cannot
// see. Resolve wherever npm placed it (hoisted today) instead of assuming
// ./node_modules, and express it relative to this project, as Next expects.
const PDFJS_DIR = path
  .relative(__dirname, path.dirname(require.resolve("pdfjs-dist/package.json")))
  .split(path.sep)
  .join("/");

const nextConfig: NextConfig = {
  // …unchanged…
  outputFileTracingRoot: WORKSPACE_ROOT,
  outputFileTracingIncludes: {
    "/plan/import": [`${PDFJS_DIR}/package.json`, `${PDFJS_DIR}/legacy/build/**/*`],
  },
  turbopack: { root: WORKSPACE_ROOT },
};
```

- `turbopack.root` and `outputFileTracingRoot` must be equal (Next warns otherwise), and both are the workspace root. That is the directory holding the root `package-lock.json`, which is what Next itself auto-detects. Pinning it explicitly keeps the existing protection against a stray lockfile in a parent directory, such as the main checkout that contains `.claude/worktrees/*`.
- `outputFileTracingIncludes` globs resolve from the Next project root (`apps/web`) per `node_modules/next/dist/docs/…/output.md`. Today the computed value is `../../node_modules/pdfjs-dist`.
- `assertDeploymentTarget(process.env)` still runs first, unchanged.
- Everything else in the file is unchanged.

### 8.6 Jest

Configs move unchanged; `<rootDir>` is `apps/web`. The npm scripts can no longer name `node_modules/jest/bin/jest.js`, because Jest is hoisted to the root. A three-line launcher resolves Jest from the web workspace wherever npm placed it:

```js
// apps/web/scripts/jest.cjs
// Runs the Jest CLI this workspace depends on, wherever npm placed it
// (hoisted to the repository root today). Arguments pass through unchanged.
require(require.resolve("jest/bin/jest", { paths: [__dirname] }));
```

```json
"test": "node --experimental-vm-modules scripts/jest.cjs --config jest.config.js",
"test:integration": "node --experimental-vm-modules scripts/jest.cjs --config jest.integration.config.js"
```

The flag and config are identical to today's. Resolving from the workspace means a different Jest version installed later for the mobile app cannot be picked up by mistake.

### 8.7 Tests whose paths change (pitch OQ3)

Every guard test that resolves `REPO_ROOT = path.resolve(__dirname, "..", "..")` now resolves `apps/web`. Every file those tests read moves with them (`src/`, `prisma/`, `scripts/`, `eslint.config.mjs`, `package.json`, `.env.example`), so those tests keep their exact meaning without edits. The same holds for `process.cwd()`-relative reads, because the web scripts run with cwd `apps/web`.

The only tests that read something that does not move are the ones reading `docs/`:

| Test | Reads | Change |
| --- | --- | --- |
| `tests/unit/tour-registry.test.ts` | `docs/pitches/mvp-2-multi-user/11-onboarding-tour/design.md` and every `docs/pitches/**/design.md` | Read through a `MONOREPO_ROOT` (`path.resolve(REPO_ROOT, "..", "..")`) |
| `tests/unit/greeting.test.ts` | `docs/pitches/mvp-2-multi-user/10-personalization-navigation-polish/design.md` | Same |

A wrong path in either test throws `ENOENT` or finds zero design docs and fails, so neither can pass vacuously. A scan of every `docs/` reference in tests, e2e, and scripts found no other read; the remaining hits are comments.

### 8.8 Scripts

| Script | Path assumption | Change |
| --- | --- | --- |
| `scripts/check-client-bundle.mjs` | `process.cwd()/.next/static` | none; runs with cwd `apps/web`, where `.next` is built |
| `scripts/lucide-svg.mjs` | `process.cwd()/node_modules/lucide-react/…` | resolve the package directory with `createRequire(import.meta.url).resolve("lucide-react/package.json")`, because `lucide-react` is hoisted |
| `scripts/demo/*`, `scripts/import/*`, `scripts/operator/*`, `prisma/seed.ts` | cwd-relative (`prisma/migrations`, `scripts/demo/server-only-shim.cjs`) | none; cwd `apps/web` |
| `scripts/operator/migrate-dev/cli.ts` | `require.resolve("prisma/build/index.js")` | none; resolution walks up to the hoisted package |

### 8.9 Ignore files

`.gitignore` (root) turns root-anchored build patterns into patterns that match in any workspace, so `apps/web/.next`, `apps/web/node_modules`, `apps/web/test-results`, and the rest stay ignored:

| Before | After |
| --- | --- |
| `/node_modules`, `/.next/`, `/out/`, `/build`, `/coverage`, `/test-results`, `/playwright-report`, `/blob-report`, `/playwright/.cache` | `node_modules/`, `.next/`, `out/`, `build/`, `coverage/`, `test-results/`, `playwright-report/`, `blob-report/`, `playwright/.cache/` |
| `supabase/.branches`, `supabase/.temp`, `supabase/.env` | `**/supabase/.branches`, `**/supabase/.temp`, `**/supabase/.env` |

No tracked source directory is named `build`, `out`, or `coverage` (checked), so un-anchoring hides nothing.

`.prettierignore` (root) keeps every rule, re-pointed: `apps/web/prisma/migrations`, `apps/web/prisma/seed/free-exercise-db/exercises.json`, `next-env.d.ts` (matches anywhere), `.next`, `node_modules`, `coverage`, `package-lock.json`, `*.md`, the preview globs, and `.claude/skills/**/*.html`. Prettier also honors `.gitignore`. Verification M-5 proves that the formatted file set equals the pre-move set under the new prefix.

### 8.10 Placeholders (pitch OQ6)

`apps/mobile/README.md` says the Expo app arrives in 21d, restates the dependency rules in §8.11, and points at §10 for the version assumptions. There is no `package.json`, so npm ignores the directory (npm workspace globs match only folders with a `package.json`).

`packages/shared/`:

```text
packages/shared/
├── package.json        name @overload/shared, private, version 0.0.0, type module,
│                       exports { ".": "./src/index.ts" }, no dependencies;
│                       devDependencies: eslint, typescript, typescript-eslint
│                       (same versions the lockfile already resolves for the web);
│                       scripts: lint, typecheck
├── eslint.config.mjs   typescript-eslint parser + the forbidden-import rule below
├── tsconfig.json       §8.4
├── README.md           what belongs here (21b) and the rules
└── src/index.ts        `export {};` with a comment naming 21b
```

The forbidden-import rule (`no-restricted-imports`, error) bans `@prisma/client` and `@prisma/*`, `prisma`, `next` and `next/*`, `react` and `react/*`, `react-dom`, `react-native`, `@supabase/*`, `server-only`, `node:*` and the bare Node built-ins, `@/*` (the web alias), `@overload/web`, and the web's Node-only packages (`sharp`, `heic-convert`, `pdfjs-dist`, `stripe`, `@anthropic-ai/sdk`). The roadmap names the first five groups. The rest follow from the audit's shareability rules (§4: no `node:*`, no DOM, no web alias) and its native-dependency rule (§8). `react`, `react-dom`, and `react-native` are banned because the package is consumed by both clients and must stay renderer-free.

The web does **not** depend on `@overload/shared` in 21a and gets no `transpilePackages` entry. 21b adds both when there is content to consume.

### 8.11 Workspace boundary check

`scripts/workspace-boundaries.mjs` (root) exports pure check functions and runs them as a CLI over the real repository. `scripts/workspace-boundaries.test.mjs` uses Node's built-in `node:test` (no new dependency) to prove each rule fails on a crafted violation and passes on the real tree. Rules:

| # | Rule | Why |
| --- | --- | --- |
| B1 | The workspace list is exactly `apps/*` and `packages/*`, and every workspace has a unique name | Vercel skip-unaffected requires unique names; the layout is fixed |
| B2 | The root manifest has no `dependencies`, and its `devDependencies` are limited to repository-wide tooling (`prettier`) | Audit §8: Node-only and native packages stay in `apps/web` |
| B3 | `packages/shared` declares none of the forbidden packages (§8.10) in any dependency field, has no runtime `dependencies` at all, and none of its `src` files imports a forbidden module | Roadmap: the shared package has no server dependency |
| B4 | `apps/mobile`, once it has a manifest, declares none of `@prisma/client`, `prisma`, `next`, `server-only`, `@overload/web`, `sharp`, `heic-convert`, `pdfjs-dist`, `stripe`, `@anthropic-ai/sdk`, or `@supabase/ssr` | `CLAUDE.md`: the mobile app never imports server modules |
| B5 | No workspace depends on `@overload/web` | The web app is a leaf, not a library |
| B6 | No manifest (root or any workspace) declares a scheduler or queue package (the list from `invariant-guards.test.ts`) | Preserves the "no cron / queue" guard across the whole repository; the web test still covers the web manifest |
| B7 | **React lockstep.** Every workspace that declares `react` or `react-dom` pins one identical exact version, and `package-lock.json` contains exactly one `react` package entry and exactly one `react-dom` entry | One React runtime (§10) |

Each failure message names the workspace, the dependency or import, and the rule.

### 8.12 Migration guard tests (web)

- `apps/web/tests/unit/monorepo-config.test.ts` imports `next.config.ts` and asserts that `turbopack.root === outputFileTracingRoot`, that it is the directory whose `package.json` declares `workspaces`, and that both include patterns for `/plan/import` resolve to the real `pdfjs-dist` directory (whose `legacy/build/pdf.mjs` exists).
- `apps/web/tests/unit/test-discovery.test.ts` walks `apps/web` (excluding `node_modules`, `.next`, `test-results`) and asserts that every `*.test.ts`/`*.test.tsx` file is collected by the unit config (under `src/` or `tests/unit/`) or the integration config (`tests/integration/**/*.int.test.ts`), and every `*.spec.ts` is under `e2e/`. A test file that no config collects fails this test.

## 9. Authorization, environments, and deployment

### 9.1 Authorization

Unchanged. `requireAccount()`, `requireAccountForDataRights()`, the account-scoped client, the admin allowlist, capability gating, and the proxy redirects are moved unchanged. The ESLint data-access restrictions and the guard tests that pin them move with `src/`, and their path allowlists (`src/lib/data/**` and the rest) are relative to the web root, so they are unchanged.

### 9.2 Environment isolation (pre-resolved decision 6)

- No environment variable value changes anywhere. Vercel environment variables are project-level and do not depend on the Root Directory.
- The deployment tripwire still runs at build (`next.config.ts`), at server start (`src/instrumentation.ts`), and at client construction (`src/lib/db.ts`). Verification M-7 runs a real build with `VERCEL_ENV=preview` and a Production-ref `DATABASE_URL` and expects it to fail. That value is a syntactically valid URL that is never contacted.
- The client-bundle secret scan runs against `apps/web/.next/static` after the build.
- The local `.env` moves to `apps/web/.env` on the owner's machine. It stays git-ignored (`.env*` matches at any depth).

### 9.3 Vercel transition (pre-resolved decision 5; pitch OQ4, OQ5)

**Facts established by the run:**

- Vercel's Root Directory is a **project setting**. Vercel's docs list no per-branch or per-environment override, and `vercel.json` cannot set it. Overload has **one** Vercel project serving Production (`main`) and Preview (`staging` and feature branches), so the setting cannot be scoped to staging alone.
- Vercel's docs say: "If you update the root directory setting, it will be applied on your next deployment." The live Production deployment is not rebuilt by the change, and a failed build never replaces a live deployment or moves a branch's stable alias.
- "Include files outside of the Root Directory in the Build Step" is on by default and must stay on, because the lockfile and hoisted `node_modules` live at the repository root.
- Install runs from the Root Directory. Run from `apps/web`, npm resolves the workspace root as its prefix, uses the root lockfile, and creates no nested lockfile (verified locally with npm 10.9.9). Whether Vercel's own install wrapper behaves identically is **unverified** until the first Preview build.

| Setting (Project → Settings → Build and Deployment) | Current (expected) | Desired |
| --- | --- | --- |
| Root Directory | blank (repository root) | `apps/web` |
| Include files outside of the Root Directory in the Build Step | Enabled | **Enabled** |
| Skip deployments when there are no changes to the root directory or its dependencies | n/a (no root directory) | **Disabled**, to keep today's behavior of building every push |
| Framework Preset | Next.js | Next.js (unchanged) |
| Build / Install / Output / Development command overrides | none | none (unchanged) |
| Node.js Version | the project's current value | unchanged (Expo's Node requirement applies to local mobile tooling only) |
| Ignored Build Step | the project's current value | unchanged; if it inspects root paths, the owner re-checks it |
| Environment Variables, Domains, Deployment Protection | current | **unchanged** |

**Consequence for Production (the key owner decision).** After the switch, every new Production build of `main` builds from `apps/web`. `main` still has the root layout until 21a is promoted, so a merge into `main` (or a Production redeploy) would fail its build. The live Production deployment keeps serving, but Production releases are effectively frozen until 21a is promoted. The runbook gives two paths: promote 21a promptly after staging approval (recommended, because 21a is behavior-neutral), or for an urgent hotfix, restore the Root Directory temporarily, ship the hotfix, and switch back. The run changes no Vercel setting.

**Sequencing.** Change the setting, validate the feature-branch Preview, merge into `staging`, then validate staging. Every rollback is recorded in `runbook.md` §4–§7.

## 10. React, Expo, and dependency compatibility (pitch OQ1; pre-resolved decision 3)

Investigation, run on 2026-11-12 against the npm registry with no Expo install in the repository:

| Fact | Value | Source |
| --- | --- | --- |
| Web React / React DOM | 19.3.0 / 19.3.0 (exact pins) | `apps/web/package.json`, `npm ls` |
| Web Next | 16.4.5 | same |
| Latest stable Expo SDK | **58** (`expo@58.0.24`, released 2026-09-29) | `npm view expo dist-tags` |
| SDK 58 pins | `react` **19.3.0**, `react-native` 0.88.1, `@types/react` ~19.3.0, template `typescript` ~6.0.3 | `expo-template-blank-typescript@sdk-58` |
| SDK 57 / 56 pin | `react` 19.2.3 (RN 0.86.3 / 0.85.3) | the matching templates |
| `react-native@0.88.1` peer | `react ^19.3.0` | `npm view` |
| Expo 58 / RN 0.88 Node engines | `^22.13.0 \|\| ^24.3.0 \|\| …` / `^22.13.0 \|\| ^24.3.0 \|\| >= 26` | `npm view` |
| `@expo/metro-config` for SDK 58 | 58.0.22 | `npm view` |
| Local toolchain | Node 22.23.5, npm 10.9.9 | this machine |

**Hoisting experiment.** Two scratch workspaces (`apps/web` with `next@16.4.5` and React 19.3.0, `apps/mobile` with an Expo SDK and its React) were resolved with `npm install --package-lock-only --ignore-scripts`, which fetches metadata only, downloads no tarballs, and runs no scripts:

- **SDK 58 (React 19.3.0):** one `node_modules/react@19.3.0`, one `react-dom`, `react-native@0.88.1` and `expo` hoisted to the root, with no nested React anywhere. A single React runtime.
- **SDK 57 (React 19.2.3):** npm hoisted the **mobile** app's `react@19.2.3` to the root and nested the web's `react@19.3.0` and `react-dom` under `apps/web/node_modules`. `next` was nested correctly, but `styled-jsx` (a Next dependency that peers on React) was hoisted to the root, where it would resolve the mobile app's React 19.2.3 inside the web's server bundle: two Reacts in one process.

**Decisions this sets (binding on 21b and 21d):**

1. **React lockstep.** The mobile app pins the same exact React as the web, and the Expo SDK is chosen to match the web's React, never the other way round. Today that is **Expo SDK 58** with React 19.3.0 and React Native 0.88.1. B7 (§8.11) enforces a single React runtime from the moment `apps/mobile/package.json` exists.
2. **Upgrades move together.** A web React upgrade that the current Expo SDK does not pin waits for a matching SDK, or the pitch that wants it decides an explicit isolation strategy (for example a Metro resolver pin plus npm `overrides`) and proves it. B7 fails until then, deliberately.
3. **Independent declarations.** Each app declares its own `react`, `react-dom`, and platform dependencies (pre-resolved decision 3). npm dedupes them because the versions match. No root-level React and no `nohoist` (npm has none).
4. **Metro.** Expo's default `expo/metro-config` detects npm workspaces and sets `watchFolders` and `nodeModulesPaths`. With a single hoisted React, 21d needs no custom resolver. 21d must verify this with `npx expo-doctor` and a development build on a device; this run did not and could not.
5. **TypeScript.** The workspace stays on TypeScript 5.9.3. The Expo template's `typescript ~6.0.3` is a template default, not a peer requirement. If 21d needs TypeScript 6, that is a workspace-wide upgrade decided in 21d.
6. **Node and npm.** Node ^22.13 satisfies Expo 58 and the web, and the owner's Mac runs Node 22. No `engines` field is added (§8.2). npm 10 workspaces (lockfile v3) remain the package manager; no pnpm, Yarn, Turborepo, or Nx.
7. **The shared package stays renderer-free** (no React), so it never takes part in React resolution.

**Unverified (for 21d):** Metro bundling of a workspace package on a device, Hermes `Intl` time-zone behavior (audit D-19), `expo-doctor` on the real tree, and EAS builds.

## 11. Documentation changes

| File | Change |
| --- | --- |
| `README.md` | Layout, install, and commands from the root; `.env` location |
| `CLAUDE.md` | Status line and the mobile section's "Until 21a lands…" sentence updated; one note that web paths in the file (`src/…`, `prisma/…`, `scripts/…`, `tests/…`) are relative to `apps/web/`. Rules unchanged. |
| `.claude/skills/*` that name web paths (`overload-ui-design`, `overload-spec`, `overload-ticket-worker`, `overload-cross-platform`) | The same one-line path note |
| `docs/technical/environment-isolation.md`, `staging-environment.md`, `mac-development-handoff.md` | Commands run from the root (delegates) or from `apps/web`; `.env` location; local Supabase from `apps/web` |
| `docs/pitches/mvp-5b-mobile-app/21a-monorepo-move/runbook.md` | Owner handoff (pipeline step 9) |
| `docs/planning/*` | **Not edited** (run policy). Amendments are listed in the owner notes. |
| Historical pitch docs, specs, runbooks | Not edited. They are records. |

## 12. Validation rules

None. No input surface changes.

## 13. Testing strategy

### Standing suites (must pass, unchanged assertions)

Lint, typecheck, `format:check`, the unit suite (including every guard: account isolation, invariants, admin, release notes, tour registry, deployment guard, data rights, operator target guards, demo seed guard, exercise history guards), the integration suite on the throwaway embedded Postgres (including the cross-account isolation suite, RLS, logged-history integrity, baselines, the progression engine, missed days, auth and signup, admin, billing and entitlements, plan import), the production build, and `verify:client-bundle`. The Playwright default suite is run if a local Chrome is available. The accounts suite needs the local Supabase Docker stack, which this machine does not have; it is reported as not executable.

### Migration verification (M-checks, run on the feature branch)

```text
M-1 Discovery parity
GIVEN the pre-move lists of unit, integration, and e2e test files (captured on staging before any change)
WHEN the same lists are captured from apps/web after the move
THEN they are identical apart from the apps/web/ prefix, and the unit run reports the same suite and test counts (140 / 2,333 at baseline)

M-2 Integration count parity
GIVEN the pre-move integration run totals
WHEN the integration suite runs after the move
THEN the suite and test totals are identical and all pass

M-3 Lockfile version parity
GIVEN the pre-move package-lock.json
WHEN the workspace lockfile is generated
THEN the multiset of resolved name@version pairs (excluding workspace links) is identical, and `npm ci` from a clean tree succeeds

M-4 Install from the workspace folder
GIVEN a clean tree
WHEN `npm ci` runs inside apps/web
THEN it installs at the root, creates no apps/web/package-lock.json, and the Prisma client is generated

M-5 Format coverage parity
GIVEN `prettier --list-different`/file lists before and after
WHEN compared with the apps/web/ prefix applied
THEN the checked file set is identical (plus the new root files)

M-6 Build output parity
GIVEN `next build` on the pre-move tree and the post-move tree (safe placeholder env, no Production values)
WHEN the route manifests are compared
THEN the app routes and their static/dynamic classification are identical, and `/plan/import`'s traced files include pdfjs-dist/legacy/build/pdf.mjs

M-7 Deployment tripwire still fires at build
GIVEN VERCEL_ENV=preview and a DATABASE_URL naming the Production ref (never contacted)
WHEN `npm run build` runs
THEN it fails in next.config.ts naming the variable, never its value

M-8 Client bundle scan inspects real output
GIVEN the post-move build
WHEN `npm run verify:client-bundle` runs
THEN it scans a non-empty apps/web/.next/static and passes

M-9 Guards still look
GIVEN the source-scanning guard tests
WHEN a deliberate violation is placed in apps/web/src (a temporary `prisma.loggedSet.create` outside logged-sets.ts, and a raw `@/lib/db` import in a component)
THEN the guard test and lint fail; the violation is then removed (not committed)

M-10 Boundary check bites
GIVEN the workspace boundary check
WHEN a forbidden dependency is added to packages/shared, or a second React is simulated in a lockfile fixture
THEN `npm test` fails naming the rule (node:test fixtures make this permanent)

M-11 Arguments pass through delegates
GIVEN the root delegates
WHEN `npm test -- --listTests` and `npm run demo:seed -- --help` run from the root
THEN the flags reach Jest and the demo CLI

M-12 No Production surface changed
GIVEN the feature diff
WHEN searched for vercel.json, engines fields, environment-variable values, and migrations
THEN none were added or changed
```

### Regression

The full standing suites above are the regression net. No test assertion is weakened, skipped, or deleted; the only test edits are §8.7's docs paths.

## 14. Acceptance criteria

**Workspace**
- [ ] Root `package.json` declares `workspaces: ["apps/*", "packages/*"]`, has no `dependencies`, and holds only `prettier` in `devDependencies`.
- [ ] The web app lives in `apps/web` (`@overload/web`) with unchanged file contents apart from §8.5–§8.8.
- [ ] `packages/shared` (`@overload/shared`) exists with no runtime dependencies, an empty export, the forbidden-import ESLint rule, and lint and typecheck scripts.
- [ ] `apps/mobile` holds only a README; npm does not treat it as a workspace.
- [ ] One `package-lock.json` at the root; resolved versions identical to before (M-3).

**Tooling and checks**
- [ ] `npm ci`, `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm test`, `npm run test:integration`, `npm run build`, and `npm run verify:client-bundle` succeed from the root.
- [ ] The same unit, integration, and e2e test files are discovered (M-1, M-2), and the new discovery guard passes.
- [ ] The workspace boundary check enforces B1–B7 and its tests prove each rule fails on a violation.
- [ ] `turbopack.root` and `outputFileTracingRoot` are the workspace root; the PDF include resolves to the real `pdfjs-dist` and is traced (M-6).
- [ ] A Preview build naming Production still fails (M-7).

**Behavior**
- [ ] No route, server action, component, style, asset, Prisma model, migration, entitlement, or environment variable changed.
- [ ] Production Vercel settings, Production variables, and Production deployments were not touched by the run.

**Handoff**
- [ ] `runbook.md` gives the current and desired Vercel settings, the project-wide consequence for Production, the sequencing, validation, rollback, and the pre-21b checklist.
- [ ] The feature PR is open against `staging` and not merged.

## 15. Explicit non-goals

- ❌ The Expo app, Metro config, EAS, TestFlight. **Deferred** to 21d and 21l.
- ❌ Shared package contents and web consumption of it. **Deferred** to 21b.
- ❌ The mobile API. **Deferred** to 21c.
- ❌ A CI service. **Deferred**; owner decision (Open Questions).
- ❌ Dependency upgrades. **Deferred**; out of this pitch.
- ❌ Any behavior change to the web product. **Permanent for this pitch.**
- ❌ Program generation, social features, ads, dated goals, rest timer, cardio progression, admin view of training content. **Permanent** (unchanged).

## Resolved Decisions

### Pre-resolved by the owner (run prompt; binding, not reopened)

| # | Decision | Applied as |
| --- | --- | --- |
| PR-1 | One repository, npm workspaces; `apps/web`, `apps/mobile`, `packages/shared`; no Turborepo, Nx, Yarn, or pnpm | §8.1–§8.3 |
| PR-2 | Web behavior identical; no cleanup, refactor, unrelated upgrade, or UI change | §3, §8 (each path fix justified) |
| PR-3 | Keep existing versions; don't change React for an assumed Expo need; inspect real constraints; prefer independent workspace dependencies; record React, RN, Expo, Node, npm, and Metro assumptions; smallest practical investigation | §10 |
| PR-4 | Shared is source-only and platform-safe; no Prisma, Next, React, Supabase, or server-only; establish the boundary without extracting logic | §8.10, §8.11 |
| PR-5 | The Vercel change is an owner-operated gate; document current and desired config, timing, validation, and rollback; leave the PR open; never touch Production settings; a local build is not proof of staging | §9.3, `runbook.md` |
| PR-6 | Preserve environment isolation; no env value changes, no secrets exposed, no migrations | §9.2 |
| PR-7 | Preserve the full verification surface; compare pre- and post-move discovery | §13 M-1, M-2, M-5, M-9 |
| PR-8 | Respect concurrent development; work in an isolated worktree | Run used `.claude/worktrees/21a-monorepo-move` on `feature/21a-monorepo-move`; the main checkout was not modified |
| PR-9 | No mobile build expected; no simulator, device, EAS, or TestFlight claims | §10 "Unverified" |

### Decided by the run

| # | Decision | Rationale | Authority |
| --- | --- | --- | --- |
| RD-1 | Everything the web app owns moves into `apps/web`, including `scripts/`, `tests/`, `e2e/`, `types/`, `supabase/`, `AGENTS.md`, and `.env.example`. The root keeps `docs/`, `CLAUDE.md`, `README.md`, `.claude/`, git and Prettier config, and the lockfile. | Matches the audit's layout. Every guard test's `REPO_ROOT` then still points at the files it reads, so guards need no edits. | mobile-audit §8/§9; codebase |
| RD-2 | Package names: root `overload-training` (unchanged), `@overload/web`, `@overload/shared`. | Unique names are required by Vercel's skip-unaffected feature; `@overload/shared` is the audit's name. | mobile-audit §9; Vercel docs |
| RD-3 | Root scripts delegate with `-w @overload/web --`; lint, typecheck, and test fan out with `--workspaces --if-present`; formatting is one root run. | Same commands and meaning, one config per tool, arguments pass through. Answers pitch OQ2. | pitch OQ2; PR-1 |
| RD-4 | `prettier` moves from the web's `devDependencies` to the root's, at the same range; the root has no `dependencies`. | Prettier formats the whole repository from the root; a root that relied on a hoisted, undeclared binary would break silently. No version change. | audit §8 (no app deps at root) |
| RD-5 | No `engines` field and no `vercel.json` are added. | Either would change Vercel's build behavior beyond the Root Directory. | PR-5; Vercel docs |
| RD-6 | `turbopack.root` = `outputFileTracingRoot` = the workspace root; the `pdfjs-dist` include is computed from `require.resolve`. | Next docs: Turbopack resolves only inside its root, and tracing includes resolve from the project root. Computing the path survives future hoisting changes; a unit test pins it. | audit Q-2; Next docs |
| RD-7 | A three-line Jest launcher replaces the `node_modules/jest/bin/jest.js` path. | That path no longer exists in `apps/web`. Resolving from the workspace stays correct if mobile later installs a different Jest. | codebase |
| RD-8 | The local `.env` lives in `apps/web/.env`; `prisma.config.ts` is unchanged. | Next and `dotenv/config` read from the project directory and cwd. Changing how env loads is a behavior change. | PR-2, PR-6 |
| RD-9 | Only the two `docs/`-reading tests change; `REPO_ROOT` is not renamed. | The minimal edit that keeps every guard reading the same files. | PR-2, PR-7 |
| RD-10 | `packages/shared` is a real but empty workspace with its lint fence and typecheck; the web does not consume it yet. | Makes the boundary machine-checked now (pitch OQ6) without extracting anything early (PR-4). | PR-4; pitch OQ6 |
| RD-11 | `apps/mobile` holds only a README. | A manifest would make it a workspace with nothing in it; 21d creates the Expo app. | pitch OQ6 |
| RD-12 | A root boundary check (B1–B7) using `node:test`, wired into `npm test`. | No new dependency; runs on every commit with the unit suite (`CLAUDE.md` requires `npm test` per commit). B6 keeps the "no scheduler or queue" invariant repository-wide. | CLAUDE.md Stack; PR-4 |
| RD-13 | React lockstep: one React runtime; Expo SDK 58 / React 19.3.0 / RN 0.88.1 recommended for 21d; TypeScript stays 5.9.3. | The registry and the hoisting experiment show that matched versions give one runtime and mismatched ones give two (§10). | PR-3; §10 evidence |
| RD-14 | `.gitignore` build patterns become un-anchored; `.prettierignore` paths are re-pointed. | Keeps generated output ignored in every workspace; keeps format coverage identical (M-5). | codebase |
| RD-15 | `scripts/lucide-svg.mjs` resolves `lucide-react` through Node resolution. | `lucide-react` is hoisted; the old cwd path would fail. | codebase |
| RD-16 | Vercel target settings: Root Directory `apps/web`; include outside files Enabled; skip-unaffected **Disabled**; framework, commands, Node, and env vars unchanged. | Preserves today's "every push builds" behavior and the build inputs. | Vercel docs; PR-5 |
| RD-17 | Recommend promoting 21a to Production soon after staging approval; give a temporary-restore path for an urgent hotfix. | Root Directory is project-wide (§9.3); a long gap blocks Production releases. The decision is the owner's. | §9.3 facts; branching workflow |
| RD-18 | `CLAUDE.md` and the skills get a path-root note and the status updates, not a rewrite of every path. | Keeps every rule's wording intact and the diff reviewable, while making paths correct for agents. `docs/planning/` is not edited (run policy). | audit §8 ("update CLAUDE.md and the skills in 21a"); CLAUDE.md run policy |
| RD-19 | Four tickets, chained: OVE-163, the test-fixture fix (RD-23); OVE-164, the workspace and the web move with every path fix, which must land atomically to stay green; OVE-165, workspace boundaries, the React lockstep (compatibility) guard, and the migration guard tests; OVE-166, documentation and the Vercel handoff runbook. | Each is reviewable and green on its own. Tooling and test paths cannot be split from the move without a red commit. | run prompt step 6 |
| RD-20 | No CI service is added. | Not in the pitch's scope; the audit's Q-1 remains open for the owner. | pitch §6 |
| RD-21 | Leave the feature PR open; do not merge into `staging`. | Run prompt merge exception: the Vercel change must be coordinated first. | run prompt |
| RD-22 | `apps/web/supabase/` (local stack config) moves with the app. | The local stack is the web backend; `playwright.accounts.config.ts` runs `npx supabase status` from `apps/web`. | codebase |
| RD-23 | Fix the date-dependent integration test "never shows to a comped account" (`trial-upgrade.int.test.ts`) before the move, by moving that test's comp `startedAt` before its fixed clock. No assertion or product change. | The pre-move baseline on `staging` (fb0a1c3) had 951/952 passing. The fixture grants the comp at real time while the test clock is 2026-11-11, so the test started failing at 2026-11-12T13:00Z. The product rule (OVE-112) is correct. A green baseline is required for M-2 parity, and the policy forbids continuing on a failing check. | CLAUDE.md Verification honesty |

## Open Questions

1. **Promotion timing (owner).** When to promote 21a to Production after staging verification, given that the Root Directory change also applies to Production builds (§9.3, RD-17). Non-blocking for this run; the runbook gives both paths.
2. **CI service (owner).** The audit (Q-1) recommends a CI workflow before 21c so the isolation suite runs on every PR. Not decided here. Non-blocking.

## 16. Future considerations

- 21b adds the shared package's content, the web's dependency on `@overload/shared`, and `transpilePackages: ["@overload/shared"]`. `turbopack.root` already covers `packages/`.
- 21d adds `apps/mobile/package.json` with Expo SDK 58 (or whichever SDK matches the web's React at the time). The boundary check starts enforcing B4 and B7 on it immediately.
- Vercel's skip-unaffected deployments can be enabled once a second deployable exists and the owner wants it. Workspace names are already unique.
- A CI workflow would run `npm ci && npm run lint && npm run typecheck && npm run format:check && npm test && npm run test:integration && npm run build` from the root.
