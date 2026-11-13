# Pitch 21b — Shared Package & Contracts

> Source: written for the one-shot pipeline run of 2026-11-12, because no approved 21b pitch existed in Linear or in this folder. It expands `docs/planning/mobile-roadmap.md` → "21b — Shared Package & Contracts (M to L)" using the facts in `docs/planning/mobile-audit.md` §4 (shared code candidates), §2 (endpoint inventory), §6 (tokens), and §10 (findings D-6, D-13, D-14, D-15, D-19). The owner approved the slice in the run prompt and supplied ten pre-resolved decisions; those are recorded in `spec.md` → Resolved Decisions.
>
> **Consistency with the Mobile Roadmap.** The roadmap's scope ("move into `packages/shared` the pure modules (e1RM and progression rules, logging card rules, schedule and calendar, rep targets, validation parsers and limits, taxonomy, goal progress, release-note and tour content), the API contract types (about 50 DTOs, with dates as ISO strings) and the error shape, the Prisma enum tuples with a parity test against `Prisma.$Enums`, and the design tokens. Remove the duplicated weight and reps limits and formatters.") is the solution shape below. Its "Done when" ("the web consumes the package, nothing a user sees changes, and the package has no forbidden imports") is the Definition of Done. Where the audit and the roadmap disagree about code facts, the audit wins; where either disagrees with the current code (several audit findings were fixed in MVP 5A), the code wins.

**Product:** Overload
**Milestone:** MVP 5B — Mobile App (`mvp-5b-mobile-app`)
**Parent:** Pitch 21 — React Native + Expo Mobile App
**Type:** Foundational
**Appetite:** M–L
**Status:** Ready for pipeline
**UI-bearing:** No
**Client scope:** The shared package and the existing web app, preparing for future React Native consumption. No mobile code.
**Plan placement:** Unchanged. No capability is added, removed, or moved.
**Pitch folder:** `docs/pitches/mvp-5b-mobile-app/21b-shared-package-contracts/`

## 1. Problem

Pitch 21a made the repository an npm workspace and fenced an empty `packages/shared`. The rules the iPhone app will need — how a weight is validated, how a rep target reads, which day is "today" in the account's time zone, which exercises are gym-variable, what a muscle group is called, what an API error looks like, what the Today response contains — still live only inside `apps/web/src/lib`, and many of the response types sit in `server-only` files a React Native bundle cannot import.

If the mobile slices start without one shared source, each native screen will copy a rule from the web. Copies drift silently: a weight limit that differs by one decimal, a muscle-group label spelled differently, an enum value added on one side. The audit already found the web copying itself — the weight and reps limits written in more than one place (D-13), four weight formatters (D-14), two `addDays` functions (D-15), and seven hand-made Prisma enum mirrors, only some of them pinned by a test (D-6).

## 2. Appetite

**M–L.** A behavior-preserving extraction across many small modules, plus type-only contracts. The work is wide but shallow: no new behavior, no schema, no route, no UI. It must not become a refactor of the engine, a redesign of the logging rules, or the start of the mobile API.

## 3. Solution shape

### A. Fill the shared package with the pure modules

Move the modules that are already pure (no Prisma, database, framework, server, DOM, or `process.env` dependency) into `packages/shared`, unchanged in behavior:

- e1RM, the progression constants, the scheduled-deload math, the reactive engine, its types, the history projections, and the one recommendation-wording builder;
- the RIR scale, the logging-card rules, the weight rule, the effective schedule and missed-day derivation;
- rep targets, calendar and "today" math, presets, weekday names, plan validation and readiness;
- cardio validation and occurrences;
- the exercise taxonomy, `isGymVariable`, and loading mode;
- goal progress and the dashboard-goals rule;
- the account, feedback, gym, exercise, and goal field validators;
- the release-note content and catalog, the tour step content, and the appearance values.

Where a module mixes a pure part with a web part (a `FormData` adapter, a `process.env` default, a web URL, a DOM anchor, a server-side error converter), move only the pure part and keep the rest in the web.

### B. Remove the duplicates

One named weight rule and one reps rule shared by the server, the client card, and goals. One weight formatter. Enum mirrors defined once, as `as const` tuples, with every one of them checked against `Prisma.$Enums`.

### C. Contracts for the mobile API, as types only

Define the response and request types the mobile API will serve (the audit's endpoint inventory, about fifty DTOs), the error envelope `{ error: { code, message, details? } }`, and the app-config and `me` shapes. Dates crossing the boundary are ISO strings; calendar dates stay `YYYY-MM-DD` and instants stay full ISO timestamps; `null` keeps meaning "missing", never zero; gated results keep their `locked` flag. Where the web already builds a DTO, the web keeps building it and the type moves to the shared package, so the server's output is checked against the contract by the compiler.

### D. Design tokens

The colors, radius, type scale, control heights, overlay, and chart values as plain TypeScript, with a test that the web's `globals.css` matches them. Tailwind and shadcn/ui stay exactly as they are.

### E. The web consumes the package

The web depends on `@overload/shared`, transpiles it, and imports the moved modules from it. Nothing a lifter sees changes.

## 4. Rabbit holes

- **Fixing the engine while moving it.** Every formula, threshold, rounding, and message is moved byte-for-byte. A "while we're here" improvement is a behavior change.
- **Making a whole file portable.** If a file reads the database or checks access, only its pure part moves. Do not drag `server-only` code into the package to keep a file intact.
- **Building the API.** The DTOs describe data. No route handler, no auth middleware, no idempotency table, no version gate (all 21c).
- **A second engine on the phone.** The engine is shared so the server and its tests use one copy. The phone receives Pro calls from the API and never runs it to unlock anything.
- **Replacing the web styling.** Tokens are values. Tailwind, shadcn/ui, and `globals.css` stay.

## 5. No-gos

- No change to Prisma, the schema, or migrations.
- No new runtime dependency in the shared package, and no `@prisma/client`, `next`, `react`, `@supabase/*`, or `server-only` reachable from it.
- No entitlement resolution, capability check, gating, data access, or authorization in the shared package.
- No mobile API route, Expo app, native screen, or authentication change.
- No Production change of any kind.

## 6. Definition of done

1. The web imports the moved modules from `@overload/shared`; no second copy of any moved rule remains in `apps/web`.
2. Every existing test passes, still discovered and still asserting the same behavior.
3. The shared package passes its own strict typecheck (no DOM, no Node types) and the workspace boundary check.
4. Every shared enum tuple is checked against `Prisma.$Enums`.
5. The mobile contract types exist, with the serialization conventions above, and the web's existing DTO builders type-check against them.
6. The production web build passes and the client-bundle check passes.
7. Nothing a lifter sees changes on staging.

## 7. Open questions (for the spec)

1. How tests for shared code are run (in the web's Jest project, or a new runner).
2. How the web resolves `@overload/shared` in Next.js, Jest, TypeScript, and `tsx` scripts.
3. Thin re-exports at the old web paths, or direct imports everywhere.
4. Which formatter is canonical when the four weight formatters differ.
5. How the one `process.env.NODE_ENV` check in the recommendation builder is kept without giving the package Node types.
6. Which DTOs move now and which wait for the slice that first needs them.
