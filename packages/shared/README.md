# @overload/shared

Source-only, platform-independent TypeScript shared by the web app (`apps/web`) and the iPhone app (`apps/mobile`). There is no build step: consumers compile it from `src/`.

**Status:** filled by slice **21b — Shared Package & Contracts**; the web consumes it (`transpilePackages`). Import a module by its subpath: `@overload/shared/<domain>/<name>`, which is the web's old `@/lib/<domain>/<name>` path (spec `docs/pitches/mvp-5b-mobile-app/21b-shared-package-contracts/spec.md` §5). There is no barrel export.

Tests for this package live in the web's unit project (`apps/web/tests/unit`), which compiles it through a Jest mapper; `npm test` from the root runs them.

## What is here (21b)

| Path | Contents |
| --- | --- |
| `progression/` | e1RM (the one formula), constants, scheduled-deload math, the reactive engine, its types, history projections, the one recommendation-wording builder |
| `logging/` | RIR scale, logging-card rules, the weight rule and the one weight formatter, the reps rule, effective schedule and missed days |
| `plan/` | rep targets, calendar and "today" in a time zone, presets, weekday names, plan validation and readiness |
| `cardio/`, `exercises/`, `goals/`, `gyms/`, `accounts/`, `feedback/` | validation parsers and limits, taxonomy, `isGymVariable`, loading mode, goal progress, the exercise image URL builder |
| `billing/plans.ts`, `entitlements/types.ts` | plan and capability names and the plan-capability map (data only; the server resolves and enforces) |
| `release-notes/`, `tour/content.ts`, `appearance/` | release notes, tour copy and order, appearance values |
| `design/tokens.ts` | colors, radius, type, control heights, overlay, chart (kept equal to the web's `globals.css` by a test) |
| `enums.ts` | Prisma enum values as tuples (checked against `Prisma.$Enums` by a test) |
| `contracts/` | mobile API request and response types, the error envelope, app config, wire conventions (`wire.ts`) |
| `ids.ts`, `env.d.ts` | `isUuid`; the one ambient global (`process.env.NODE_ENV`) |

## What may be added here later

- More pure rules, content, and contracts as later slices need them, always moved (never copied) from the web.

## What never belongs here

Enforced by `eslint.config.mjs` (lint) and by the root workspace check (`npm test` → `scripts/workspace-boundaries.mjs`, rule B3):

- `@prisma/client` or any Prisma module, `next`, `react`, `react-dom`, `react-native`, `@supabase/*`, or `server-only`.
- Node built-ins (`node:*`, `fs`, `path`, …), the DOM, and `process.env` other than `NODE_ENV` (rule B3e). The code also runs on Hermes.
- The web app's `@/` alias, `@overload/web`, and the web's Node-only packages (`sharp`, `heic-convert`, `pdfjs-dist`, `stripe`, `@anthropic-ai/sdk`).
- Any runtime `dependencies`.
- Anything that enforces access: the account-scoped data layer, entitlement resolution, and gating stay in `apps/web`. The mobile app receives Pro results from the API and never runs the engine itself.

## Commands

From the repository root: `npm run lint` and `npm run typecheck` include this package.
