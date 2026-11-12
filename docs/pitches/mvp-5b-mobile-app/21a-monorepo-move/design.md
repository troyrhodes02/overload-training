# Monorepo Move — Design Document

**Version:** 1.0
**Pitch Source:** Overload — Pitch 21a: Monorepo Move (`docs/pitches/mvp-5b-mobile-app/21a-monorepo-move/pitch.md`)
**Focus:** The repository becomes a workspace that can hold the web app, the future iPhone app, and the future shared package side by side, while every lifter keeps exactly the web product they have today.

> **No UI surface.** The pitch adds no screen, page, form, navigation element, or visible state, so the UI preview stage is skipped ("Skipped — no UI surface in this pitch", recorded in the feature PR). As with Multi-User Foundation (Pitch 8), this document therefore specifies **behavior**: what every existing web surface must keep doing, what a developer sees in the reorganized repository, which commands exist and where, how the boundary between the clients is drawn, and what the owner sees at the deployment checkpoint. It does not define file-by-file moves, configuration values, or scripts; those belong to the spec.

---

## 1. Vision

A lifter opens Overload the day after the move and nothing has changed: the same pages at the same addresses, the same sign-in, the same plan, history, calls, and Pro features. A developer opens the repository and finds three clearly named homes (`apps/web`, `apps/mobile`, `packages/shared`), one install, one lockfile, and the same commands they already know, run from the repository root.

**Design north star:** *the lifter notices nothing; the next slice needs nothing.*

---

## 2. Design principles

### 1. Move, don't modify

Every file of the web app arrives in `apps/web` with its contents unchanged, except where a path must change to keep the same behavior. Each such change is named in the spec with its reason and a check that proves the behavior is unchanged. Cleanup, refactoring, and upgrades wait for their own pitches.

### 2. A check that stops looking is a check that fails

The guard tests that protect account isolation, logged history, entitlements, the admin boundary, and secrets work by reading files. After the move they must read the same files, and the run proves it: the same test files are discovered, the same number of tests run, and source-scanning guards still find what they were written to find. A suite that passes because it found nothing is a failure.

### 3. One command surface, owned in one place

A developer runs the familiar commands (`npm run dev`, `npm test`, `npm run build`, and so on) from the repository root, and each delegates to the workspace that owns it. Each tool keeps one configuration in one place: the web's Next, Prisma, Jest, Playwright, ESLint, and TypeScript configuration lives with the web app, and only what truly spans the repository (the workspace list, the lockfile, formatting, ignore rules) lives at the root. There are no duplicate configurations to drift.

### 4. The boundary is enforced, not described

Server-only code stays with the web app. The future shared package must not depend on Prisma, Next.js, React, Supabase, or server-only modules, and the future mobile app must not depend on any server module. This slice makes those rules machine-checked before either package has content, so 21b and 21d start inside the fence rather than building it.

### 5. Production is not part of this pitch

The move changes where Vercel builds the app. That change is the owner's, made at a named checkpoint, with a validation path and a rollback that never touch Production data, Production variables, or the live Production deployment.

---

## 3. Visual language

> All styling inherits from Overload's Tailwind and shadcn/ui theme and design system. This design doc only defines feature-specific usage, variants, and states.

This pitch defines no feature-specific usage, variant, or state. No token, component, class, asset, font, or image changes. `globals.css`, `public/`, and every component move into `apps/web` byte-for-byte. Light, dark, and system appearance behave exactly as before.

### State colors

None. No status or state is displayed by this pitch.

---

## 4. Information architecture

The lifter's information architecture is unchanged (the shell is the authority of Foundation and Personalization & Navigation Polish). The developer's view of the repository changes:

```text
overload-training/                 one repository, one install, one lockfile
├── apps/
│   ├── web/                       the Next.js app, moved whole
│   │   ├── src/                   pages, components, lib (unchanged)
│   │   ├── prisma/                schema, migrations, seed (unchanged)
│   │   ├── public/                images, brand, marketing (unchanged)
│   │   ├── tests/  e2e/           every existing test (unchanged discovery)
│   │   ├── scripts/               client-bundle check, operator CLIs, demo seed
│   │   └── supabase/              local stack config
│   └── mobile/                    reserved for 21d (nothing to install yet)
├── packages/
│   └── shared/                    reserved for 21b: an empty, fenced package
├── docs/                          stays at the root; pitches, planning, runbooks
├── CLAUDE.md, README.md           point at the new paths
└── package.json                   the workspace list and the root commands
```

```text
Developer at the repository root
   npm install ─────────────► installs every workspace, one lockfile
   npm run dev / build / start ─► the web app
   npm run lint / typecheck ──► every workspace that has the check
   npm test ──────────────────► web unit tests + workspace boundary checks
   npm run test:integration ──► web integration suite (throwaway Postgres)
   npm run format:check ──────► the whole repository, one Prettier config
   npm run <operator command> ─► the same CLI, run from the web workspace
```

---

## 5. Surfaces affected

| Surface | Who sees it | What changes | What must not change |
| --- | --- | --- | --- |
| Every web page, route, and server action | Lifters, the owner | Nothing | URLs, redirects, auth, data, calls, Pro gating, styling, metadata |
| Public pages, `/login`, `/signup`, recovery | Visitors | Nothing | Signup defenses, Turnstile, throttle, closed mode |
| Admin area | The owner | Nothing | Allowlist check, not-found for non-admins, audit entries |
| Repository layout | Developers, agents | The web app lives under `apps/web` | Contents of every moved file except the named path fixes |
| Root commands | Developers, agents | Delegate to the owning workspace | Same names, same meaning, same checks run |
| Local environment file | The owner | `.env` lives in `apps/web/` | Its contents; local tools still never read Production |
| Vercel build | The owner | Root Directory becomes `apps/web` (owner step) | Every environment variable, the staging URL, Production |
| Docs, `CLAUDE.md`, skills | Agents, the owner | Path guidance points at `apps/web` | Every rule they state |

---

## 6. Screen specifications

### Screen 1: Every existing web screen, after the move

#### Purpose
Prove by behavior that the move is invisible to a lifter.

#### URL pattern
Every existing route, unchanged (`/`, `/login`, `/signup`, `/plan`, `/log/[loggedSessionId]`, `/history`, `/goals`, `/settings/*`, `/admin/*`, `/pricing`, `/changelog`, `/api/stripe/webhook`, and the rest).

#### Trigger
Any visit, before or after the Vercel change.

#### Layout
Unchanged. No wireframe changes.

#### Behavior
- The same pages render with the same content, assets, metadata, and appearance.
- Signed-out visitors to an authenticated route are redirected to `/login` exactly as before.
- PDF plan import still opens PDFs in the deployed function. This is the one behavior most at risk from the move, because the PDF reader is loaded in a way the deployment's file tracing cannot see; the spec names the fix and how it is checked.
- The build still refuses to run on a Preview whose database or Supabase variables name Production.

#### Empty, loading, and error states
Unchanged. The move must not introduce a new error state. A failed staging build after the Vercel change is a deployment state for the owner, never a lifter-facing state, because Vercel keeps serving the last good deployment.

### Screen 2: The repository root (developer surface)

#### Purpose
Let a developer or agent find each client and run every familiar command from one place.

#### Trigger
Cloning, pulling, or opening a worktree after the move.

#### Layout
See the information architecture tree in §4.

#### Behavior
- One `npm install` (or `npm ci`) at the root installs every workspace and generates the Prisma client.
- Running `npm install` from inside `apps/web` also installs at the root and never creates a second lockfile.
- Every existing root command keeps its name and meaning. Arguments after `--` reach the underlying tool unchanged (`npm run demo:seed -- --user-id …`, `npm test -- --silent`).
- Commands can also be run from inside `apps/web` directly, with the same result.

#### Empty state
`apps/mobile` holds only a short note that the Expo app arrives in 21d. `packages/shared` holds an empty, fenced package that 21b fills. Neither is installed into the web app.

#### Error state
- A dependency in the wrong workspace (a server-only package in the shared package, a server module in the mobile app, a dependency at the root) fails `npm test` with a message naming the package and the rule.
- A second copy of React in the install fails `npm test` with a message explaining the React lockstep rule.
- A missing `apps/web/.env` behaves exactly as a missing root `.env` did before: local commands that need it fail plainly.

### Screen 3: The owner's deployment checkpoint (Vercel)

#### Purpose
Let the owner switch the Vercel build to `apps/web` at a safe moment, check it, and undo it if needed.

#### Trigger
The feature PR is reviewed and green, and the owner decides to proceed.

#### Behavior
- The owner reads one runbook section: what the setting is now, what it becomes, which related settings to confirm, the order of steps relative to merging, how to validate, and how to roll back.
- The runbook says plainly that the Root Directory is a project-wide Vercel setting. Production and staging share one Vercel project, so the change also applies to the next Production build. The live Production deployment keeps serving, but a Production build from `main` before 21a is promoted would fail, and the runbook says how to handle that.
- Nothing in this pitch changes an environment variable, a domain, or a Supabase setting.

#### Error state
If the first build from `apps/web` fails, Vercel keeps the previous deployment live on the stable staging URL. The rollback is to restore the Root Directory and, if the merge already happened, revert it on `staging`.

---

## 7. Navigation flows

The lifter's navigation is unchanged. The owner's deployment flow:

```text
Feature PR green, review applied
   → owner reads runbook §4–§7
   → owner sets Root Directory = apps/web (project-wide)
   → feature branch Preview rebuilds from apps/web → owner validates it
        ├─ fails → restore Root Directory → nothing merged, staging untouched
        └─ passes → owner merges the feature PR into staging
              → staging rebuilds from apps/web → smoke test on the stable URL
                   ├─ fails → restore Root Directory, revert the merge on staging
                   └─ passes → 21a verified on staging; 21b may start
   → Production: promote 21a through the release workflow before any other
     Production deploy (the Root Directory already expects apps/web)
```

---

## 8. Interaction specifications

No new keyboard, loading, error, notification, or destructive interaction exists in the product. For developers:

| Context | Expectation |
| --- | --- |
| A failing boundary check | Names the workspace, the offending dependency or import, and the rule |
| A failing guard test after a path mistake | Fails loudly (missing file or zero matches), never passes vacuously |
| A destructive step | None. The move is renames and configuration; no data, migration, or history is touched |

---

## 9. Responsive behavior

Unchanged at every breakpoint. No layout, component, or style changes.

---

## 10. Component inventory

No component is added, removed, or changed. Developer-facing pieces this pitch introduces (named here, specified in the spec):

| Piece | Location | New / reused | Notes |
| --- | --- | --- | --- |
| Workspace definition and root commands | repository root | new | delegate to the owning workspace |
| Shared-package fence | `packages/shared` | new | empty package with the forbidden-import rule |
| Mobile placeholder | `apps/mobile` | new | a note only; the Expo app is 21d |
| Workspace boundary check | repository root | new | dependency placement and the single React runtime |
| Every web component, page, lib, test, script | `apps/web` | reused, moved | unchanged contents |

---

## 11. Accessibility, privacy, and data sensitivity

- Accessibility is unchanged: no markup, label, focus, or contrast change.
- No data is read, written, migrated, copied, or exported by this pitch. No migration is applied anywhere.
- Account isolation is unchanged and still proved by the same guard tests and the cross-account isolation suite, from their new location.
- Secrets stay where they are. The local `.env` moves to `apps/web/.env` on the owner's machine (it is git-ignored and never committed). Vercel environment variables are not touched. The client-bundle secret scan still inspects the built client output.
- Staging still reaches only `overload-dev`. The deployment tripwire still runs at build time from the moved `next.config.ts`.

---

## 12. Out of scope

From the pitch:
- The Expo app, React Native screens, EAS, TestFlight, and any Expo update.
- Shared package contents: training modules, contracts, enum tuples, tokens (21b).
- The mobile API (21c).
- Any change to authentication, authorization, business logic, Prisma models, migrations, billing, signup, or account management.
- Any Production deployment, Production setting, or Production data.

Permanent non-goals stay as they are: no program generation or AI coach, no social features, no ads, no dated goals, no rest timer, no cardio progression, and no admin view of training content.

---

## 13. User guidance

No tour step and no release-note entry. Nothing a lifter can see changes, so there is nothing to explain (`overload-onboarding` applies only to visible changes).

---

## 14. Plan placement and client scope

**Plan placement.** Unchanged. No capability is added, removed, or re-gated. Free and Pro lifters see exactly what they saw before.

**Client scope and platform impact.** Repository infrastructure, preserving existing web behavior.

| Surface | Shared logic | API | Web UI | Mobile UI | Reason |
| --- | --- | --- | --- | --- | --- |
| Repository workspace | Empty fenced package created; nothing extracted | none | none (moved, unchanged) | none (location reserved) | Foundation for 21b to 21d |
| Dependency boundaries | Forbidden-import rule and dependency checks | none | Server-only packages stay web-only | Mobile may not depend on server modules | Enforced before content exists |

**Mobile design.** Not applicable. No mobile surface exists in this slice.
