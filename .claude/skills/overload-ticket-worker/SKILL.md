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

Overload is a single-user strength training tracker: one lifter, one account. It is not a social fitness app, a program generator, a nutrition tracker, or an AI coach. Logged sets are the only source of truth, so any change that could lose, rewrite, or detach them is a blocking issue.

## Technical ground truth

**Read `CLAUDE.md` before writing code.** It is authoritative for stack, invariants, security rules, and product boundaries; where anything here conflicts with it, `CLAUDE.md` wins. Read `docs/planning/architecture.md` when a ticket requires understanding *why* a decision was made, and check its Open Questions before assuming a value.

Inlined here because implementation applies them constantly:

- **Styling / components:** Tailwind CSS with shadcn/ui. Do not introduce Material UI, styled-components, CSS modules, or a second component library.
- **Data access:** server-first. Read through Prisma in server components, and mutate through server actions that call the write modules under `lib/`. Never call `fetch()` from a component for application data, and never query application tables with the Supabase client.
- **Logged history:** write `LoggedSet` rows only through `lib/logging/logged-sets.ts`, never archive by hard-deleting an `Exercise` or `Gym` (set `deletedAt`), and never store a progression tag or e1RM. Both are computed on read. Treat any code path that is unclear about this as a blocking issue.

Do not introduce libraries, background jobs, realtime sync, offline support, or external integrations unless the ticket and `CLAUDE.md` support it.

## Prerequisites

- Linear access via MCP, connector, CLI, or pasted ticket text
- GitHub access via MCP, connector, or `gh`
- Repo-local engineering instructions: `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`
- Planning docs at `docs/planning/` — brief, PRD, architecture, pitch roadmap
- The controlling expanded pitch (`pitches/NN-pitch-name.md`), design doc (`docs/design/NN-pitch-name-design-doc.md`), and technical spec (`docs/specs/NN-pitch-name-spec.md`) for this ticket
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

If Linear access is unavailable, use pasted text and ask for any missing acceptance criteria before implementing.

### 3. Find the controlling docs

Search the ticket for referenced paths. Preferred source order:

1. Ticket acceptance criteria
2. Technical spec
3. Design doc (for UI behavior)
4. Expanded pitch
5. `docs/planning/prd.md` feature section
6. `docs/planning/architecture.md`
7. `docs/planning/product-brief.md`

If a required spec is not referenced, search `docs/specs/` and `pitches/`, fuzzy-match the ticket title, and search for the ticket ID. If still ambiguous, ask which spec controls the work. Do not guess.

### 4. Read repo instructions

Read `CLAUDE.md` first, then any other repo-local instructions, `package.json`, and test, lint, and type configs.

Capture: test framework, formatting rules, naming conventions, commit and branch conventions, PR body requirements, verification commands, migration conventions.

If instructions conflict, prefer the most specific repo-local instruction, then the technical spec, then the planning docs. Surface serious conflicts rather than choosing silently.

### 5. Determine whether this is frontend work

Treat as frontend if it touches: components, the Tailwind and shadcn/ui theme, routes, forms, dialogs, the dashboard, the exercise logging card, session summary, week at a glance, the mesocycle and session builders, the exercise library, gyms, goals, progression charts, the cardio log, settings, the missed-day prompt, login, empty, loading, or error states, accessibility, or responsive behavior.

For frontend work, locate the design source: ticket links, spec references, the design doc, existing component patterns, theme files. See `overload-design-doc` for what a design doc contains and `overload-ui-design` for brand and visual language.

Do not block frontend implementation solely because a visual preview is missing, unless the ticket explicitly requires pixel-perfect implementation from one.

### 6. Determine the base branch

Default base is `main`. Before branching, check whether this ticket depends on another in-progress ticket via Linear parent or blocked-by, related comments, or open PRs.

```bash
git fetch --all --prune
git branch -r | grep ove-120
```

- No parent or blocker → `main`.
- Depends on a ticket with an open branch → base on that branch.
- Depends on a ticket with no branch → `main` only if this ticket can be developed independently.
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

Large-ticket warning signs: multiple unrelated features; schema changes plus large UI work; anything that writes, edits, archives, or deletes logged history; gym baseline correction; new tables or RLS changes; the progression or e1RM logic; the exercise image import or Storage; cross-pitch dependencies; missing spec or acceptance criteria; and any item from `docs/planning/architecture.md` → Open Questions that the ticket quietly assumes an answer to.

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
- A swap to an exercise in a different muscle group returns `validation_error`.
- Choosing shift on a missed day moves only the current week, and the prompt does not return on the next open.
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

**Frontend visual verification:** compare against the design doc; check a phone-width viewport first, then desktop; check loading, empty, error, and success states; check keyboard navigation and focus behavior in dialogs; check light and dark themes; confirm no competing styling system was introduced.

**Data and security verification:** migrations apply cleanly; the Prisma client is regenerated; every new table has row-level security enabled; logged history is untouched by the change; no tag or e1RM column exists; the Supabase client is not used for application data; no secret appears in a `NEXT_PUBLIC_` variable. For any change touching `LoggedSet` writes, archival, or baseline correction, verify it on a Vercel preview deployment against the Supabase dev project with realistic data before merging, because there is no staging tier.

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

Use the actual commands that were run. Mention the Vercel preview URL when the change touched logged history.

## Phase 7: Move the ticket to In Review

Move the ticket only after the PR exists, verification passed or its limitations are documented, and the PR link is ready to attach. If Linear access is unavailable, tell the user to move it manually and provide the PR link.

That is the end of the workflow. There is no reviewer handoff step beyond this.

## When things go wrong

For each case, output the specific text rather than a vague apology.

**Spec not found** — list every location checked (`docs/specs/`, `pitches/`, the ticket text) and ask for the controlling spec path.

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
- **Base:** `main` or stacked branch
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

### Foundation tickets

Likely touches: Supabase Auth and middleware, `schema.prisma` and the first migrations, `lib/db.ts`, the Tailwind and shadcn/ui theme, the app shell and navigation, Vercel configuration.

Watch for:

- A first migration that creates tables without enabling row-level security. Every table needs it from day one.
- Leaving public signups enabled in Supabase. The single account is created by hand.
- Constructing a second `PrismaClient`, or using the direct connection string at runtime. Runtime uses the pooled `DATABASE_URL`; `DIRECT_URL` is for migrations only.
- Checking auth only in middleware. Server actions must re-check it.
- Reaching for a component library other than shadcn/ui, or hardcoding the progress and deload colors instead of adding theme tokens.

### Library & Gyms Setup tickets

Likely touches: the Prisma seed script, exercise and gym models, Supabase Storage, the library search and muscle-group filter, gym screens.

Watch for:

- Calling free-exercise-db at runtime. It is imported once by a seed script, and the seed must be safe to re-run.
- Hard-deleting an `Exercise` or `Gym`. Archive sets `deletedAt`, pickers filter on it, and history views must not.
- Leaving the image bucket's public-or-private posture undecided. It is an open question the spec must settle.
- Giving custom exercises an image or a placeholder illustration. They have none, and the UI shows a monogram tile.
- Treating a gym address as anything but free text, or linking it to a map.

### Split & Mesocycle Builder tickets

Likely touches: `Mesocycle`, `Session`, and `SessionExercise` models, the builder screens, the clone-forward action.

Watch for:

- Making a preset (Push / Pull / Legs, Arnold, bro split) populate exercises, sets, or rep ranges. A preset supplies day structure only; filling in a program is generation, which is a permanent non-goal.
- Letting `cloneMesocycle` copy logged history. It copies the plan, never the logs.
- Cloning a mesocycle that references archived exercises without flagging those slots.
- Hardcoding the 5-week, deload-on-week-5 default as a rule. It is a pre-filled, editable default.
- A duplicated `Session` that still shares state with its source. A copy is independent after creation.

### Guided Workout Logging tickets

Likely touches: `lib/logging/logged-sets.ts`, `lib/gyms/baselines.ts`, the dashboard, the exercise card, the swap picker, the missed-day prompt.

Watch for:

- Writing a `LoggedSet` anywhere but its module, or doing the baseline correction in a separate transaction from the set.
- Treating the first log at a gym as a correction. It establishes the baseline.
- Creating a baseline for a free-weight exercise. Gym-variable status is decided in one function, `isGymVariable`.
- Letting a swap write to the planned `Session`, or offering cross-muscle-group alternatives.
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

### Cardio Logging tickets

Likely touches: the `CardioLog` model, the day assignment, the cardio log screen.

Watch for:

- Adding distance, pace, calories, or heart rate. Cardio is type and duration only.
- Reusing the progression or e1RM code for cardio. No tag, trend, or chart ever attaches to it.
- Introducing HealthKit or any health-data integration. It is unreachable from a website and deferred to the mobile phase.
