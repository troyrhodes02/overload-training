# @overload/shared

Source-only, platform-independent TypeScript shared by the web app (`apps/web`) and the iPhone app (`apps/mobile`). There is no build step: consumers compile it from `src/`.

**Status:** empty and fenced (Pitch 21a). Slice **21b — Shared Package & Contracts** fills it and makes the web consume it (`transpilePackages`). Until then nothing imports it.

## What belongs here (21b and later)

- API contracts: the DTOs (dates as ISO strings) and the `{ error: { code, message, details? } }` shape.
- Pure training rules: e1RM, the progression rules and constants, the logging-card rules, schedule and calendar math, and rep targets.
- Validation parsers and their named limits.
- Prisma enum values as `as const` tuples, with a parity test against `Prisma.$Enums` that lives in `apps/web`.
- Content (release notes, tour copy, taxonomy labels) and design tokens.

## What never belongs here

Enforced by `eslint.config.mjs` (lint) and by the root workspace check (`npm test` → `scripts/workspace-boundaries.mjs`, rule B3):

- `@prisma/client` or any Prisma module, `next`, `react`, `react-dom`, `react-native`, `@supabase/*`, or `server-only`.
- Node built-ins (`node:*`, `fs`, `path`, …), the DOM, and server `process.env`. The code also runs on Hermes.
- The web app's `@/` alias, `@overload/web`, and the web's Node-only packages (`sharp`, `heic-convert`, `pdfjs-dist`, `stripe`, `@anthropic-ai/sdk`).
- Any runtime `dependencies`.
- Anything that enforces access: the account-scoped data layer, entitlement resolution, and gating stay in `apps/web`. The mobile app receives Pro results from the API and never runs the engine itself.

## Commands

From the repository root: `npm run lint` and `npm run typecheck` include this package.
