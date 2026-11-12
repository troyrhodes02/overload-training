# Pitch 21a — Monorepo Move

> Source: Linear document "Pitch 21a: Monorepo Move" (Overload V1), pulled 2026-11-12 for the one-shot pipeline run. The text below is the Linear document unchanged except for list markers and heading levels. The owner approved it for implementation in the run prompt, which also supplied nine pre-resolved decisions; those are recorded in `spec.md` → Resolved Decisions. Open Questions are answered there too.
>
> **Consistency with the Mobile Roadmap.** The pitch matches `docs/planning/mobile-roadmap.md` → "21a — Monorepo Move (M)": move the web app into `apps/web`, set up the workspace, check the hosting root directory, Prisma, the path alias, Jest, Playwright, ESLint, scripts, the client-bundle check and the lockfile, spike React/Expo compatibility and Metro hoisting, and leave the hosting root directory to a human. The roadmap's "Done when" ("the web app builds and deploys on staging exactly as before") is the same as Definition of Done items 5 to 8 below, with the deployment half completed by the owner after the Vercel change. `docs/planning/mobile-audit.md` §9 sized an older "21a" that also extracted the shared package and DTOs; the revised roadmap moved that to 21b, and this pitch follows the roadmap.

**Product:** Overload
**Milestone:** MVP 5B — Mobile App (`mvp-5b-mobile-app`)
**Parent:** Pitch 21 — Mobile App (React Native + Expo)
**Type:** Foundational
**Appetite:** M — Medium
**Status:** Ready for pipeline
**UI-bearing:** No
**Client scope:** Repository infrastructure; preserve web behavior
**Plan placement:** No change to Free or Pro capabilities
**Pitch folder:** `docs/pitches/mvp-5b-mobile-app/21a-monorepo-move/`

## 1. Problem

Overload's existing Next.js web application is structured as a single application. The mobile roadmap now commits to building a React Native + Expo iPhone application in the same repository, with shared TypeScript code and one backend.

The current repository structure is not yet ready to support those applications side by side.

Beginning mobile implementation without first establishing workspace boundaries would introduce uncertainty about dependency resolution, build commands, shared code, deployment configuration, and the separation between mobile and server-only modules.

The immediate problem is therefore structural: prepare the repository for two clients without disrupting the already-shipped web product.

## 2. Appetite

**M — Medium.**

This is a bounded infrastructure change, but it affects several build and deployment assumptions across the existing repository.

The work should remain a mechanical reorganization wherever possible. It must not become a rewrite of the Next.js application, a mobile UI implementation, or a redesign of deployment infrastructure.

The meaningful outcome is a repository that can safely host the upcoming mobile application while keeping the existing web product fully operational.

## 3. Solution Shape

### A. Establish the monorepo structure

Prepare the repository around the approved mobile architecture:

- `apps/web` — the existing Next.js application.
- `apps/mobile` — the location reserved for the Expo application introduced by a later slice.
- `packages/shared` — the location reserved for shared contracts, pure training logic, validation, and design tokens.

Use npm workspaces, consistent with the approved Mobile Roadmap.

This pitch establishes the repository and workspace foundation. It does not implement the shared package contents or the mobile application.

### B. Preserve the existing web application

Move the existing web application into the web workspace while preserving its behavior and existing business logic.

Ensure the repository's build, testing, and developer tooling continues to operate correctly after the move.

The work must account for existing configuration and path assumptions, including Prisma, TypeScript, ESLint, Jest, Playwright, scripts, generated code, security checks, and the package lockfile.

Existing application features, URLs, authentication, database access, entitlements, and UI behavior must remain unchanged.

### C. Establish dependency compatibility

Before committing to the final workspace structure, investigate the compatibility of the existing web React version with the React Native and Expo versions selected for mobile development.

Verify the intended dependency boundaries and whether Metro can resolve workspace dependencies correctly.

The result should support independently managed web and mobile dependencies without introducing duplicate or incompatible React runtimes.

Do not build mobile screens or introduce mobile business logic as part of this verification.

### D. Preserve environment and deployment behavior

The existing staging environment must continue connecting exclusively to the development Supabase project.

The existing Production environment must remain untouched.

Moving the Next.js application changes the repository path from which Vercel builds the web product. The required Vercel Root Directory change is an explicit owner-operated deployment step.

The implementation must document the exact deployment configuration change, its timing relative to merging the repository move, the validation required afterward, and recovery steps if staging deployment fails.

The move must preserve the established environment-isolation protections and Production promotion workflow.

### E. Establish workspace development commands

The repository should offer a predictable way to run its existing quality checks and development commands from the new structure.

The implementation must maintain the existing linting, formatting, typechecking, testing, build, and security-check coverage.

The next mobile slices should not need to revisit the repository's fundamental layout.

## 4. UI-Bearing Status

**This pitch is not UI-bearing.**

It creates no new screen, navigation, interaction, component, or visible state.

The UI design preview step in the established pipeline is therefore recorded as skipped. The technical spec must still document how the existing web application's behavior is preserved.

No native UI design or mobile screen implementation is authorized here.

## 5. Plan Placement

No change.

The Free and Pro entitlement model, billing system, trial behavior, and named capability checks remain unchanged.

This pitch introduces no user-facing capability and does not change access enforcement.

## 6. Boundaries and No-Gos

### In scope

- Repository and workspace restructuring.
- Moving the existing Next.js application to `apps/web`.
- Establishing npm workspace configuration.
- Preparing the locations for the mobile and shared packages.
- Resolving dependency and tooling compatibility for the planned workspace architecture.
- Updating repository-relative configuration and commands.
- Preserving existing application, security, and test behavior.
- Documenting the staging Vercel Root Directory change and verification.

### Out of scope

- Building the Expo app or any React Native screens.
- Implementing shared training modules or API contracts.
- Creating the mobile API.
- Changing authentication or authorization.
- Modifying Prisma models or applying database migrations.
- Changing existing business logic or training algorithms.
- Redesigning the web interface.
- Changing billing, signup, or account-management behavior.
- Configuring TestFlight or publishing an Expo update.
- Modifying Production deployments or environment settings.

## 7. Rabbit Holes and Risks

**Workspace dependency resolution.** The existing web React dependency and the future Expo React dependency may require different versions or resolution behavior. The workspace must avoid forcing an incompatible dependency arrangement.

**Tooling paths.** The repository currently contains build and security checks that may assume source files exist at the repository root. A mechanical move can accidentally disable important checks even when the application still compiles.

**Prisma generation and migrations.** Schema location, generated-client behavior, and migration commands must remain correct. No database schema change is needed.

**Vercel deployment configuration.** Moving the web application without coordinating its Vercel Root Directory can break staging deployments.

**Existing developer workflows.** The change must not unnecessarily disrupt other Git worktrees or ongoing feature development.

**False confidence from passing builds.** Successful compilation alone is insufficient. Existing tests, account-isolation checks, and actual staging behavior must be preserved.

## 8. Dependencies

The web fixes, pre-mobile hardening, and codebase audit described in the approved roadmap are complete.

This pitch depends on the approved React Native + Expo architecture and the Mobile Roadmap's decision to use a same-repository npm workspace structure.

The next slice, Shared Package & Contracts, depends on this foundation being verified.

## 9. Definition of Done

The pitch is complete when:

1. The repository has the intended workspace structure with the existing web application in `apps/web`.
2. npm workspace dependency installation and resolution work correctly.
3. React and Expo compatibility concerns have been investigated and resolved sufficiently for the next slice.
4. Existing web development and build commands work from their documented locations.
5. Existing linting, formatting, typechecks, unit tests, integration tests, and build checks pass.
6. Existing account-isolation, logged-history, entitlement, and security guard tests remain active and pass.
7. No user-facing web behavior or existing account data has changed.
8. Staging deploys successfully after the owner completes the required Vercel Root Directory configuration.
9. The workspace and staging deployment procedure are documented for subsequent mobile slices.
10. Production is unchanged.

The next slice may begin only after staging is verified following the repository move.

## 10. Open Questions

### OQ1. Which React and Expo versions are compatible with the workspace?

**Technical decision.** Verify the supported versions and dependency resolution before finalizing the workspace structure. Record the chosen approach in the spec rather than assuming hoisting or package resolution will work.

### OQ2. How should root-level development and verification scripts delegate to the web workspace?

**Technical decision.** Preserve equivalent coverage and predictable commands without maintaining competing configurations.

### OQ3. Which repository scripts and tests depend on old root-relative paths?

**Technical decision.** Inspect actual references, including security checks, Prisma, TypeScript, Jest, Playwright, and deployment scripts. Maintain behavior and coverage after the move.

### OQ4. How will the staging Vercel Root Directory change be coordinated?

**OWNER ACTION.** The owner must carry out the required Vercel configuration change at the documented deployment checkpoint. The run must not modify Production Vercel configuration or silently make a Production deployment change.

### OQ5. How should a failed staging deployment be recovered?

**Technical decision with owner-operated deployment actions.** Define a bounded recovery procedure that restores staging operation without changing Production or deleting the permanent staging environment.

### OQ6. What minimum scaffolding belongs to the mobile and shared workspace locations now?

**Technical decision.** Establish only what is needed to make the workspace reliable. Defer the actual shared contracts and mobile application to their controlling slices.

## 11. Completion Handoff

At completion, the Overload repository is structurally ready for the React Native app and shared package.

The Next.js web application continues functioning on staging, all required verification remains intact, and the owner has a repeatable procedure for developing and deploying from the reorganized repository.

**The next pitch is 21b — Shared Package & Contracts.**

No mobile interface is built in this pitch. Its success is demonstrated by preserving the existing web product while establishing the workspace foundation for the mobile implementation.
