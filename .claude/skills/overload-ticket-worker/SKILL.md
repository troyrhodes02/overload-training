---
name: overload-ticket-worker
description: >
  End-to-end engineering workflow for taking an Overload Linear ticket from
  assignment through implementation, verification, PR creation, and review
  handoff. Reads the Linear ticket, finds the referenced pitch, design, and spec
  docs, follows repo coding conventions, plans the work, writes tests, implements
  against the spec, runs verification, commits, opens a PR, and moves the ticket
  to review when tool access allows. Use this skill whenever the user says things
  like "work on OVE-123", "pick up this ticket", "implement this Linear issue",
  "build this ticket", "finish this ticket", "start on [ticket ID]", or pastes a
  Linear URL and wants the ticket implemented. Also use when the user assigns an
  Overload ticket and expects engineering execution rather than planning.
---

# Overload Ticket Worker

Take an Overload Linear ticket end-to-end:

```text
Linear Ticket → Planning Docs → Work Plan → Tests → Implementation → Verification → PR → Review Handoff
```

This skill is for implementation work, not analysis. It must still protect scope, because otherwise every ticket becomes a swamp with a login screen.

## Core rule

Build exactly what the ticket and upstream docs require.

Do not pull in Post-MVP work, adjacent pitches, architectural rewrites, UI redesigns, or "while I'm in here" cleanup unless the ticket explicitly includes it or the user approves it.

Overload is a strength training tracker for individual lifters, each with a private account, with a free plan and a paid Pro plan. It is not a social fitness app, a program generator, a nutrition tracker, or an AI coach. Two things must never break: no account can see or affect another account's data, and logged sets are the only source of truth. Any change that could expose, lose, rewrite, or detach either is a blocking issue.

## Technical ground truth

**Read `CLAUDE.md` before writing code.** It is authoritative for stack, invariants, security rules, and product boundaries; where anything here conflicts with it, `CLAUDE.md` wins. Read `docs/planning/architecture.md` when a ticket requires understanding *why* a decision was made, and check its Open Questions before assuming a value.

Inlined here because implementation applies them constantly:

- **Styling / components:** Tailwind CSS with shadcn/ui. Do not introduce Material UI, styled-components, CSS modules, or a second component library.
- **Data access:** server-first. Read through Prisma in server components, and mutate through server actions that call the write modules under `lib/`. Never call `fetch()` from a component for application data, and never query application tables with the Supabase client.
- **Account scoping:** every owned model carries `userId`. Reach owned data only through the account-scoped data-access layer, take the acting account from the session and never from client input, and return not-found for another account's record. A raw `prisma.<model>` call on an owned model outside the allowed modules is a blocking issue.
- **Plans and the admin boundary:** features check named capabilities on the server and never branch on a plan name, and a Free account never receives a Pro result. Capture, history, and export are never gated. Admin operations re-check the server-side admin allowlist, return account metadata and counts only, never training content, and write an audit entry for each mutation. Stripe is the only place money and card data live, and runs use test mode only.
- **Logged history:** write `LoggedSet` rows only through `lib/logging/logged-sets.ts`, never archive by hard-deleting an `Exercise` or `Gym` (set `deletedAt`), and never store a progression tag or e1RM. Both are computed on read. Treat any code path that is unclear about this as a blocking issue.

Do not introduce libraries, background jobs, realtime sync, offline support, or external integrations unless the ticket and `CLAUDE.md` support it.

## Prerequisites

- Linear access via MCP, connector, CLI, or pasted ticket text
- GitHub access via MCP, connector, or `gh`
- Repo-local engineering instructions: `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`
- Planning docs at `docs/planning/` — brief, PRD, architecture, pitch roadmap
- The controlling pitch folder (`docs/pitches/<milestone>/NN-pitch-name/`), which holds the expanded pitch (`pitch.md`), design doc (`design.md`), UI preview for UI-bearing pitches (`preview.tsx`), and technical spec (`spec.md`) for this ticket
- Package scripts for test, lint, type-check, build, format

If a tool is unavailable, continue as far as possible and provide the exact manual command the user needs to run. Do not pretend a PR was opened or a ticket was moved if the tool did not do it.

## Phase 1: Gather context

### 1. Identify the Linear ticket

Extract the ticket ID from whatever the user provides: direct ID, Linear URL, branch name, PR title or body, or pasted text.

```bash
git branch --show-current
```

Example: `feat/ove-42-gym-picker` → `OVE-42`. The team key is `OVE`.

If no ticket ID can be found, ask before making scope decisions.

### 2. Fetch and read the ticket

Read: ID, title, description, acceptance criteria, status, priority, parent, blocking and blocked-by, linked PRs and docs, comments that clarify scope, project.

If Linear access is unavailable, use pasted text and ask for any missing acceptance criteria before implementing. Otherwise move the ticket to In Progress now.

### 3. Find the controlling docs

Search the ticket for referenced paths. Preferred source order:

1. Ticket acceptance criteria
2. Technical spec
3. Design doc (for UI behavior), then the UI preview (for the visual contract)
4. Expanded pitch
5. `docs/planning/prd.md` feature section
6. `docs/planning/architecture.md`
7. `docs/planning/product-brief.md`

If a required spec is not referenced, search `docs/pitches/`, fuzzy-match the ticket title, and search for the ticket ID. If still ambiguous, ask which spec controls the work. Do not guess.

### 4. Read repo instructions

Read `CLAUDE.md` first, then any other repo-local instructions, `package.json`, and test, lint, and type configs.

Capture: test framework, formatting rules, naming conventions, commit and branch conventions, PR body requirements, verification commands, migration conventions.

If instructions conflict, prefer the most specific repo-local instruction, then the technical spec, then the planning docs. Surface serious conflicts rather than choosing silently.

### 5. Determine whether this is frontend work

Treat as frontend if it touches: components, the Tailwind and shadcn/ui theme, routes, forms, dialogs, the dashboard, the exercise logging card, session summary, week at a glance, the mesocycle and session builders, the exercise library, gyms, goals, progression charts, the cardio log, settings, the missed-day prompt, login, empty, loading, or error states, accessibility, or responsive behavior.

For frontend work, locate the design source: ticket links, spec references, the design doc, the UI preview, existing component patterns, theme files. See `overload-design-doc` for what a design doc contains and `overload-ui-design` for brand and visual language.

For a UI-bearing pitch, the UI preview is the visual contract. Read it before implementing any UI, and preserve its hierarchy, interaction model, responsive behavior, states, and visual system. Do not substitute a different layout because another one would be easier to build. If the preview is missing for a UI-bearing pitch, stop and report it. For a ticket that sits outside a pitch run, continue from the ticket and spec, and do not block on a missing preview unless the ticket requires one.

### 6. Determine the base branch

Default base is `staging`, the permanent staging branch. Never base a feature on `main` and never open a PR into `main`: production promotion is a separate release workflow. Before branching, check whether this ticket depends on another in-progress ticket via Linear parent or blocked-by, related comments, or open PRs.

```bash
git fetch --all --prune
git branch -r | grep ove-120
```

- No parent or blocker → `staging`.
- Depends on a ticket with an open branch → base on that branch.
- Depends on a ticket with no branch → `staging` only if this ticket can be developed independently.
- Multiple candidates → present the options and ask.

```bash
git checkout <base-branch> && git pull
git checkout -b feat/ove-123-short-description
```

## Phase 2: Plan the work

Before editing code, produce a short implementation plan.

```markdown
# Implementation Plan — OVE-123: Ticket Title

## Scope
## Out of Scope
## Acceptance Criteria Mapping
- AC #1 → planned change
## Files / Areas
## Test Plan
## Implementation Sequence
## Risks / Questions
## Verification Commands
```

### Scope checkpoint

If the ticket is small, clear, and directly implementable, proceed after presenting the plan. If it is large, ambiguous, or touches risky areas, get approval before writing code.

Large-ticket warning signs: multiple unrelated features; schema changes plus large UI work; anything that writes, edits, archives, or deletes logged history; gym baseline correction; ownership, account scoping, authentication, signup, password recovery, account deletion, admin operations, plans and entitlements, billing and webhooks, the language-model call, or the mobile shells; new tables or RLS changes; the progression or e1RM logic; the exercise image import or Storage; cross-pitch dependencies; missing spec or acceptance criteria; and any item from `docs/planning/architecture.md` → Open Questions that the ticket quietly assumes an answer to.

## Phase 3: Execute

### 1. Handle sequential prerequisites

Do these first if they unblock the rest: Prisma migrations (each with RLS enabled on any new table), regenerated Prisma client, shared types, validation schemas, test factories, theme tokens, and the data-access helpers under `lib/`.

### 2. Write tests

Base them on the ticket's acceptance criteria, the spec's testing section, the design doc's states, and the PRD's edge cases.

Overload-specific test examples:

- Logging a set of 185 × 8 stores exactly that, and no tag or e1RM value is written anywhere.
- Archiving an `Exercise` sets `deletedAt`, drops it from pickers, and leaves every historical `LoggedExercise` readable.
- A direct hard delete of an `Exercise` referenced by logged history is rejected by the database.
- A baseline correction at Downtown Gym leaves the Campus Rec Center baseline for the same exercise unchanged.
- The first log of a machine exercise at a new gym creates its baseline and is not treated as a correction.
- A failed `logSet` leaves no `LoggedSet` and no baseline change behind.
- An exercise performed for the first time gets no progress or deload tag.
- During the scheduled deload week no reactive deload tag appears, and it resumes the following week.
- Editing a past set changes the computed tag with no stored value to update.
- A swap to an archived exercise returns `validation_error`; a different muscle group is allowed (Workout Logging Refinements).
- Choosing shift on a missed day moves only the current week, and the prompt does not return on the next open.
- A second account cannot read, change, or detect the first account's data by id, by list, or by search.
- A non-admin cannot reach any admin operation, and admin results contain no training content.
- A Free account never receives a Pro result, and replaying a webhook changes nothing.
- Every table in the public schema has row-level security enabled.

**If a test implied by an acceptance criterion cannot be satisfied without contradicting the spec, stop and surface the conflict.** Do not delete or weaken tests to get a green build. A green checkmark obtained that way is a false report about the state of the system.

### 3. Implement

Follow existing patterns for server components, server actions, the write modules under `lib/`, the Prisma client singleton in `lib/db.ts`, and shadcn/ui composition.

Frontend rules:

- Use shadcn/ui and the project theme. Do not introduce Material UI, styled-components, CSS modules, or a second component library.
- Match the design doc and `overload-ui-design`.
- Include empty, loading, and error states when the design or spec requires them.
- Keep the logging card fast and one-handed. Never block set entry on a network round trip's visual state, and keep entered numbers on screen when a save fails.
- Client components are interactive islands only; they call server actions and never hold data access.

Backend and data rules:

- Read and write application data through Prisma in server-side code only.
- Logged history is the source of truth: no stored tag, no stored e1RM, no `LoggedSet` write outside `lib/logging/logged-sets.ts`, no hard delete of anything the lifter can see.
- Keep a logged set and its baseline correction in one transaction, scoped to one gym and one exercise.
- Every migration that creates a table also enables row-level security with no policies. Never add a policy for the anon or authenticated role to make something work.
- Do not add background jobs, cron, queues, caching layers, or realtime subscriptions.

### 4. Iterate until local tests pass

Detect the package manager from the lockfile: `package-lock.json` → npm, `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `bun.lockb` or `bun.lock` → bun. Use it consistently.

## Phase 4: Verification

Run the full suite before committing. Check `package.json` and repo instructions for exact commands.

Required categories, every one the repo supports: unit tests, component tests, integration tests, E2E if available, linter, type-checker, build, formatter, migration validation if the schema changed, accessibility checks if supported, and a manual UI check for frontend work.

If the repo does not define a command, do not invent success. Report that the command is unavailable.

**Frontend visual verification:** compare against the design doc and the UI preview, checking hierarchy, visible controls, states, and mobile behavior; check a phone-width viewport first, then desktop; check loading, empty, error, and success states; check keyboard navigation and focus behavior in dialogs; check light and dark themes; confirm no competing styling system was introduced.

**Data and security verification:** migrations apply cleanly; the Prisma client is regenerated; every new table has row-level security enabled; logged history is untouched by the change; no tag or e1RM column exists; the Supabase client is not used for application data; no secret appears in a `NEXT_PUBLIC_` variable. For any change touching `LoggedSet` writes, archival, or baseline correction, verify it on staging, against the `overload-dev` Supabase project, with realistic data before it is promoted. Routine development migrations and disposable test data on staging proceed without repeated dry runs.

**Mobile verification:** a run can type-check, lint, and unit test the mobile app, run the API contract and isolation tests, and publish an over-the-air update to the Expo `staging` channel when a staging-only token is configured. It cannot run a simulator or a device, publish to the `production` channel, or build for TestFlight. Report those checks as unverified, never as passed, and list the manual steps for the owner: which build, which screens, which states, in which appearance. See `overload-cross-platform` and `overload-mobile-ui`.

**Do not proceed until green.** Do not commit, push, open a PR, or move the ticket until verification passes. If a check fails: fix straightforward failures, re-run, and if the failure reveals a scope or spec conflict, stop and report it.

## Phase 5: Commit

```bash
git status && git diff
```

Confirm: no unrelated files, no secrets, no generated junk, no debug logs, no stray TODOs, tests reflect the acceptance criteria, scope stayed inside the ticket.

```bash
git add . && git commit -m "OVE-123 implement set logging with gym baseline correction"
```

## Phase 6: Push and open PR

```bash
git push -u origin feat/ove-123-short-description

gh pr create \
  --base <base-branch> \
  --head feat/ove-123-short-description \
  --title "OVE-123: Ticket title" \
  --body-file /tmp/pr-body.md
```

```markdown
## Summary
## Linear
- OVE-123
## Scope
This PR covers:
Out of scope:
## Acceptance Criteria
- [x] AC #1: ...
## Tests / Verification
- [x] `<test command>`
- [x] `<lint command>`
- [x] `<typecheck command>`
- [x] `<build command>`
## Screenshots / UI Notes
## Migrations / Setup
## Notes for Reviewer
```

Use the actual commands that were run. Mention the staging URL when the change touched logged history.

## Phase 7: Move the ticket to In Review

Move the ticket only after the PR exists, verification passed or its limitations are documented, and the PR link is ready to attach. If Linear access is unavailable, tell the user to move it manually and provide the PR link.

**Done.** In a pipeline run, the ticket moves to Done when its PR is merged into the feature branch, and the run does this as it merges each ticket PR. A standalone ticket moves to Done when its PR is merged into `staging`. Never leave a merged ticket in In Review.

That is the end of the workflow. There is no reviewer handoff step beyond this.

## When things go wrong

For each case, output the specific text rather than a vague apology.

**Spec not found** — list every location checked (`docs/pitches/`, the ticket text) and ask for the controlling spec path.

**Design source not found for frontend work** — offer to continue from the ticket and spec, noting that visual fidelity may be weaker. If the ticket requires pixel-perfect implementation from a preview, stop and ask for it.

**Tests cannot be satisfied** — state the ticket's requirement, the conflicting doc's requirement, and recommend resolving the conflict before implementation continues.

**Tooling unavailable** — be specific about which tool, what could not be done, and the exact manual command. Never claim completion for something that did not happen. If `gh` fails, say the PR was not opened and give the `gh pr create` command. If Linear is unreachable, say the ticket was not moved.

**Large ticket** — propose a split into named sub-tickets with the reason, and continue only if the user wants the larger scope.

**Scope conflict** — state what the ticket asks for, what the upstream doc says, the risk, and recommend resolving before implementing.

**Safety / privacy issue** — if implementation would weaken the logged-history invariant or the access model, stop and propose a safer approach. Examples: adding a stored tag or e1RM column, hard-deleting an exercise or gym, writing a `LoggedSet` outside its module, creating a table without row-level security, querying application tables with the Supabase client, putting a secret in a `NEXT_PUBLIC_` variable, linking a gym address to a map, or adding any share or social affordance.

## Final response format

```markdown
## Done — OVE-123: Ticket Title

- **PR:** URL
- **Branch:** `feat/ove-123-short-description`
- **Base:** `staging` or stacked branch
- **Linear:** URL
- **Status:** Moved to In Review / manual action needed

## What Changed
## Verification
## Notes
```

If partial: state what was completed, what is blocked, why, and the next manual action.

## Important guidelines

- Read the ticket, the controlling spec, and repo conventions before coding.
- Plan before editing.
- Keep work scoped to the ticket.
- Do not implement deferred work unless explicitly scoped.
- Do not introduce a second styling system.
- Do not weaken the logged-history invariant, the access model, or the deny-all RLS posture.
- Do not skip verification.
- Do not open a PR with failing checks unless the user asks and the PR body documents the failure.
- Do not move the ticket to review if no PR exists.
- Do not pretend unavailable tools worked.
- Do not let a ticket become a full-product redesign because one acceptance criterion had ambition issues.

## Common Overload ticket patterns

The patterns below cover the pitches most likely to be touched again. `CLAUDE.md` carries the standing rules for the shipped foundation, library, plan builder, and cardio work.

### Guided Workout Logging tickets

Likely touches: `lib/logging/logged-sets.ts`, `lib/gyms/baselines.ts`, the dashboard, the exercise card, the swap picker, the missed-day prompt.

Watch for:

- Writing a `LoggedSet` anywhere but its module, or doing the baseline correction in a separate transaction from the set.
- Treating the first log at a gym as a correction. It establishes the baseline.
- Creating a baseline for a free-weight exercise. Gym-variable status is decided in one function, `isGymVariable`.
- Letting a swap write to the planned `Session`. (Cross-muscle-group alternatives are allowed since Workout Logging Refinements.)
- Showing tomorrow's plan once today is complete. The dashboard moves to its alternate state instead.
- Letting a shift carry past the current week, or failing to persist a skip so the prompt reappears on every open.
- Building deletion of a logged set. The planning docs do not specify it.
- Deciding what a zero weight or zero reps entry means without recording the decision. The spec must settle it.

### Progressive Overload Engine tickets

Likely touches: `lib/progression/config.ts`, the pure progression and e1RM functions, the scheduled deload logic, charts built with Recharts.

Watch for:

- Storing the tag or the e1RM "for performance". It is computed on read, and a stored copy is how history and conclusions drift apart.
- Magic numbers for consecutive sessions, misses, or increments. They are named constants in `lib/progression/config.ts`, and their values are an open question the spec must settle.
- Running the reactive check during the scheduled deload week, including when a past set from that week is edited.
- Writing a second e1RM formula. One shared function serves the trend and goal progress.
- Tagging an exercise with no history. First time performed means no tag.
- Adding a Hold badge. A hold has no tag and no color.
- Adding a cron job or background worker to "keep tags fresh".

### Goals tickets

Likely touches: the `Goal` model, goal progress read, the goals screen, the completion card.

Watch for:

- Computing progress with anything other than the shared e1RM function.
- Adding a date field. Dated goals are deferred.
- Silently replacing an existing active goal on the same exercise. Block or replace is an open question the spec must settle.
- Confetti, animation, or streak language on completion. It is a calm card, then the goal archives.
- Deleting a completed goal instead of archiving it.

### Multi-User Foundation tickets

Likely touches: `schema.prisma`, the ownership migration, the account-scoped data-access layer, every existing read and write path, the profile record, the isolation test suite.

Watch for:

- Taking the acting account from anything but the session.
- A raw `prisma.<model>` call on an owned model left behind in a page, action, or helper. The static check must catch it.
- A uniqueness rule that does not include `userId`, such as one active goal per exercise.
- Letting any account write to a shared library exercise, or hide a library exercise for everyone.
- Making ownership required before every existing row has been backfilled. The migration runs in stages: add, backfill and verify counts, then require.
- Applying the migration to production from a run. That is a human step from a runbook, with a backup taken first.
- Computing "today" from the server's zone instead of the account's stored timezone.

### Onboarding Tour, What's New, and guidance tickets

Likely touches: the tour step registry, the tour component, the release-notes content and its modal and page, per-account state.

Watch for:

- Hardcoding a step into the tour mechanism instead of adding it to the registry.
- A tour step anchored to a control that does not exist at the current screen size.
- Showing a new account a backlog of old release notes as unread.
- Showing the modal more than once for the same entry.
- For a guidance ticket: inventing a second mechanism, or adding a step for a change that does not need one. Use the `overload-onboarding` skill.

### Admin Center & Feedback tickets

Likely touches: the admin allowlist check, the admin metrics layer, account actions, the audit log, the feedback form and inbox, account status enforcement.

Watch for:

- Hiding admin navigation and calling it authorization. Every admin operation re-checks the allowlist on the server.
- An admin query that returns a plan, gym, set, goal, or cardio record, even "just for the count". Counts come from the aggregate layer.
- Making admin identity a database role, or something an account can be granted.
- A suspended account that can still act. Suspension is enforced on every authenticated request.
- An admin mutation without an audit entry, or an audit log that can be edited.
- Building impersonation.

### Public Accounts tickets (recovery and signup)

Likely touches: the signup mode setting, abuse protection, password recovery, the email integration, email verification, export, account deletion.

Watch for:

- Turning public signup on in production from a run. That is a human step.
- Treating password recovery as already built. It was deliberately not shipped and is built here.
- A recovery response that differs for a known and an unknown email.
- Using Supabase's built-in email sender, which only reaches the project's own team.
- An export that includes any other account's data, or a deletion that leaves data behind.

### Plans, Billing & Promo Codes tickets

Likely touches: the entitlement model, capability checks, Stripe Checkout and the Customer Portal, the webhook handler, promo codes, comped access in the admin area.

Watch for:

- Branching on a plan name instead of a capability, or enforcing only in the UI.
- Gating capture, history, or export, or deleting anything when access ends.
- A webhook that does not verify its signature, or is not idempotent, or trusts the payload to pick the account.
- Handling, storing, or logging card data. Use hosted Checkout and the Customer Portal.
- Touching live Stripe keys or any real charge from a run. Test mode only.
- Making comped access a role, or creating fake Stripe subscriptions for comps.
- Countdowns, banners, or other dark patterns in the upgrade note.

### Plan Import tickets

Likely touches: the server-side model call, the strict output schema, matching to the library, the review screen, usage limits, the spend cap and kill switch.

Watch for:

- Calling the model from the browser, or exposing the API key.
- Treating pasted text as instructions. It is data.
- Saving anything before the lifter confirms, or creating a second path for creating a plan.
- Accepting a model output that is not validated against the schema, or one that contains an exercise, set, or load that does not trace back to the pasted text.
- Missing input limits, per-account limits, or the global cap.
- Generating a program. It parses a plan the lifter wrote.

### Monorepo & Shared Package tickets

Likely touches: the workspace layout, the hosting project's root directory, the shared package, CI, and path references.

Watch for:

- Changing the web app's behavior. This slice moves and shares code and changes nothing a user sees.
- Moving server code that touches Prisma into the shared package. The shared package holds only pure code and data, and the mobile app never imports server modules.
- Breaking the staging deployment or the build, lint, and test commands for either workspace.
- Forgetting the hosting root-directory change, which is a human step in the runbook.

### Mobile API tickets

Likely touches: the versioned route handlers, token verification, the app-config endpoint, shared validation schemas, and the isolation tests.

Watch for:

- Taking the account from the request instead of the verified token.
- An endpoint that reaches the database without the scoped layer, or skips the capability check.
- A write that duplicates data when retried.
- Changing the shape of an existing version in a breaking way.
- An endpoint missing from the cross-account isolation suite.
- Reimplementing a business rule in the handler instead of calling the shared module.

### Mobile app tickets

Likely touches: the Expo app, navigation, screens, the API client, secure storage, and the theme.

Watch for:

- Calling Supabase tables directly, or putting a secret in the app bundle.
- A second copy of a training rule in the app instead of the shared package.
- A purchase flow, or any Stripe or store checkout, inside the app.
- Building a screen from the web layout instead of the Mobile design section and `overload-mobile-ui`.
- Hover-only or gesture-only actions, and a keyboard that covers the field being edited.
- Discarding typed numbers when a save fails.
- Reporting a device check as passed when it was not run.
