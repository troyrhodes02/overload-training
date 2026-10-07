---
name: overload-review-audit
description: >
  Audit PR review feedback for technical validity and scope alignment against
  Overload Linear tickets, acceptance criteria, and roadmap boundaries. Use this
  skill whenever the user asks to evaluate, audit, triage, or assess review
  comments on a pull request — including phrases like "check this review", "audit
  the feedback", "is this review valid", "should I implement this feedback",
  "scope check this review", or any situation where PR review comments need to be
  validated against a Linear ticket's acceptance criteria, the Overload PRD, the
  pitch roadmap, or current architecture decisions. Also trigger when the user
  pastes or references review comments and asks whether they should act on them.
  Requires Linear access and, when reviewing a PR directly, GitHub access or the
  GitHub CLI.
---

# Overload Review Audit

Evaluate PR review feedback along two dimensions before recommending action:

1. **Technical validity** — is the reviewer correct about the code?
2. **Scope alignment** — does the feedback belong in this ticket, another planned ticket, a new ticket, or not at all?

This skill is for analysis only. Do **not** implement the feedback. The goal is to help the user decide what to act on without turning every PR review into a scope-creep buffet.

## Prerequisites

- Linear access via MCP, connector, or equivalent integration
- GitHub access or the `gh` CLI when fetching PR comments directly
- A Linear ticket ID present or implied in the branch, PR title, PR body, or pasted context
- Planning docs at `docs/planning/` — brief, PRD, architecture, pitch roadmap
- `CLAUDE.md` for technical ground truth
- The controlling expanded pitch, design doc, and technical spec where relevant

## Technical ground truth

`CLAUDE.md` is authoritative for stack, invariants, security rules, and product boundaries. Where anything in this skill conflicts with it, `CLAUDE.md` wins — and a conflict is itself worth surfacing to the user.

## Overload context anchors

Scope narrows as you move right:

```text
Product Brief → PRD → Pitch Roadmap → Pitch → Design Doc → Technical Spec → Linear Ticket → PR
```

- **`docs/planning/product-brief.md`** — permanent product boundaries, core job, non-goals, riskiest assumption.
- **`docs/planning/prd.md`** — MVP features, acceptance criteria, edge cases, deferred features.
- **`docs/planning/architecture.md`** — technical ground truth, stack decisions, security model, consistency model, Open Questions.
- **`docs/planning/pitch-roadmap.md`** — pitch sequence, dependencies, what each pitch includes and defers.
- **Expanded pitch** at `pitches/NN-pitch-name.md` — slice-specific problem, scope, boundaries, no-gos, definition of done.
- **Design doc** — UI/UX behavior, screen states, component expectations. See `overload-design-doc`.
- **Technical spec** — data shape, server behavior, validation, tests, implementation constraints. See `overload-spec`.
- **Linear ticket** — the actual unit of work being reviewed.

If these disagree, do not quietly pick a favorite. Surface the conflict.

## Step 1: Gather context

### 1. Identify the ticket ID

```bash
git branch --show-current
```

Example: `feat/ove-42-gym-picker` → `OVE-42`. The team key is `OVE`.

If the branch has no ticket ID, check the PR title, PR body, commit messages, pasted context, and ticket references in code comments. If none can be found, ask for the ticket ID or text before making scope claims.

### 2. Fetch the Linear ticket

Capture: ID, title, description, acceptance criteria, status, parent project, linked issues, related documents, labels, and any comments that clarify scope.

### 3. Fetch roadmap and planning context

At minimum identify: which pitch this ticket belongs to; which PRD feature or acceptance criterion it maps to; what is deferred to later pitches; what is Post-MVP; and any architectural decision that constrains the implementation.

Overload examples:

- A comment asking for dated goals or RPE entry is likely **OUT_OF_SCOPE**, since both are Post-MVP in the PRD.
- A comment asking for goal tracking on a Cardio Logging PR is likely **ALREADY_PLANNED** under the Goals pitch.
- A comment proposing Material UI or a CSS-in-JS library conflicts with Tailwind and shadcn/ui, and is likely **OUT_OF_SCOPE** or **INVALID**.
- A comment proposing a "recommended program" or auto-generated mesocycle conflicts with the Brief's non-goals.
- A comment proposing a cron job to refresh progression tags conflicts with the computed-on-read decision in the Architecture Doc, unless a pitch changed it.

### 4. Search Linear for related tickets

Search the same project and feature family across Planned, Backlog, In Progress, Todo, Draft, and Blocked, to determine whether valid feedback is already tracked.

Useful search terms for this product: logging, logged set, mesocycle, split, deload, progression, e1RM, gym baseline, exercise library, swap, missed day, goals, cardio, history.

### 5. Get the review comments

**A. Pasted directly** — use them as the source. If file paths or line numbers are included, inspect those sections.

**B. PR number given:**

```bash
gh pr view <PR_NUMBER> --json title,body,headRefName,baseRefName,reviews,reviewRequests,comments,files
gh api repos/:owner/:repo/pulls/<PR_NUMBER>/comments
```

**C. Current branch has an open PR:**

```bash
gh pr view --json title,body,headRefName,baseRefName,reviews,reviewRequests,comments,files
gh api repos/:owner/:repo/pulls/$(gh pr view --json number -q .number)/comments
```

### 6. Read the actual code

For every comment, inspect the code being commented on — the lines, surrounding code, the related component or function, nearby patterns, tests, types, validation, error handling, and existing shadcn/ui usage.

Do not evaluate a reviewer's claim in the abstract. Reviewers are capable of being correct, confused, and overconfident, sometimes in the same sentence.

## Step 2: Evaluate each comment

### A. Technical validity

Ask: is the reviewer's understanding of the code correct? Does the code behave as claimed? Would the suggestion fix a real issue or improve correctness, security, accessibility, performance, maintainability, or readability? Does it introduce regressions or conflict with existing patterns? Does it align with the approved architecture? Or is it a stylistic preference wearing an engineering hat?

Rate as:

- **VALID** — identifies a real issue or meaningful improvement.
- **INVALID** — wrong, irrelevant, already handled, or would make the code worse.
- **UNCERTAIN** — needs more context or a product decision.

#### Overload-specific technical checks

**Logged history — check first**

- Logged sets are the only source of truth. A real bug is any path that can lose, silently alter, or detach a `LoggedSet` from its exercise and gym. That is not a style nit, whatever the acceptance criteria say.
- `LoggedSet` rows are written only through `lib/logging/logged-sets.ts`. A write anywhere else is a blocking issue.
- `Exercise` and `Gym` are never hard-deleted. Archive sets `deletedAt`. Pickers filter it out, but history views must not, or archived exercises vanish from past workouts.
- References in the logged chain use `onDelete: Restrict`. A cascade on that chain is blocking.
- Treat any ambiguity here as urgent, even when the ticket is about something else.

**Derived state**

- The progress, hold, and deload tag and the e1RM trend are computed on read. A stored tag column, a stored e1RM, a cached "needs deload" flag, or a job that maintains them is a defect.
- Gym baselines are the exception and are stored: `GymExerciseBaseline` holds per-gym state that logged sets cannot reconstruct. Do not flag it as a stored derived value.
- One shared e1RM function serves the trend and goal progress. A second formula is a defect.
- The progression thresholds are named constants in `lib/progression/config.ts`, not magic numbers.

**Gym baselines**

- A logged set and its baseline correction share one transaction, scoped to one gym and one exercise.
- The first log of a machine exercise at a gym establishes the baseline. It is not a correction.
- Free-weight exercises have no baseline row. Gym-variable status is decided in one function.

**Stack and styling**

- Tailwind CSS with shadcn/ui is the only component and styling system. Do not accept suggestions introducing Material UI, styled-components, CSS modules, or a second component library unless the project direction has changed.
- Data access is server-first. A client-side `fetch()` for application data, or the Supabase client used to query application tables, is a defect.

**Auth and privacy**

- There is one user and no ownership column. Do not accept a suggestion to add tenant or user columns, roles, or sharing.
- Public signups are disabled, and every action re-checks the session. Authentication only in middleware is a gap.
- Row-level security is enabled with no policies on every table, because Supabase's Data API is reachable with the anon key. A new table without RLS is blocking. A policy added for anon or authenticated "to make it work" is blocking.
- Secrets never appear in `NEXT_PUBLIC_` variables or client bundles.
- Gym addresses are personal location data, shown only on the gym screens, never linked to a map.

**Storage**

- Storage holds only public-domain exercise images, imported once by a seed script. User uploads are not in this build.

**Product logic**

- Scheduled deload and reactive deload are separate systems, and the reactive check is suppressed during the scheduled week, including when a past set from that week is edited.
- A hold has no tag and no color. A "Hold" badge is a defect.
- First-time exercises get no tag.
- The planned `Session` is never written to while logging, and swaps stay within the muscle group.
- A shift on a missed day affects only the current week, and a skipped day must not re-prompt on every open.
- Block structurally invalid input, but allow unusual-but-valid input: a weight far from a gym's baseline triggers correction, not rejection.
- Cardio is type and duration only, with no tag, trend, or chart.

**UI/UX**

- The dashboard leads with today's pending session, and a completed day does not hand off to tomorrow's plan.
- Set entry on the logging card must stay fast and one-handed, and entered numbers must survive a failed save.
- Empty, loading, and error states matter when the pitch or design doc includes them.
- Accessibility improvements are usually valid if they do not contradict the design or blow up scope.

Approved architecture that resembles a non-goal is not a violation. Do not flag these:

- `cloneMesocycle` copies a plan the lifter already built. It is not program generation.
- Presets supply day structure. They do not choose exercises.
- `getExerciseProgression` is a computed read, not a stored progression resource.
- Archiving is soft deletion by design, and the UI says "Archive".

### B. Scope alignment

Classify using the ticket, acceptance criteria, pitch boundaries, PRD, roadmap, design doc, and spec.

**IN_SCOPE** — directly matches the ticket's acceptance criteria or definition of done, or fixes a bug or regression this PR introduced. Also use for security, data-loss, privacy, and correctness bugs introduced by the PR, even when no acceptance criterion names them.

**ALREADY_PLANNED** — valid, but owned by another existing ticket or a later pitch. Always cite the ticket ID, its title, and why it owns the work.

**NEW_TICKET** — valid and worth tracking, not part of this ticket, and not already captured. Recommend a concise title and acceptance criteria.

**OUT_OF_SCOPE** — conflicts with the spec, architecture, brief, PRD, pitch boundaries, or non-goals; pulls in Post-MVP work early; adds unrelated features; expands past the ticket's appetite; or changes UX the design doc deliberately chose.

## Step 3: Recommend action

| Technical validity | Scope alignment | Recommendation |
| ------------------ | --------------- | -------------- |
| VALID | IN_SCOPE | **IMPLEMENT** — do it now |
| VALID | ALREADY_PLANNED | **DEFER** — cite the existing ticket |
| VALID | NEW_TICKET | **DEFER** — suggest creating a new ticket |
| VALID | OUT_OF_SCOPE | **DEFER** — explain the spec or architecture conflict |
| INVALID | Any | **SKIP** — explain why the reviewer is wrong |
| UNCERTAIN | Any | **DISCUSS** — identify the decision or missing context needed |

**IMPLEMENT** — state what to change, why it is required, and which acceptance criterion or bug it maps to.

**DEFER** — state why it is valid, why it is not part of this ticket, the existing ticket reference or suggested new ticket, and whether the PR should add a note, a TODO, or nothing.

**SKIP** — state why the claim does not hold, with evidence from the actual code and the supporting pattern or spec.

**DISCUSS** — state what is uncertain, what decision is needed, who should decide if clear, and the safe default until resolved.

## Step 4: Present the audit

```markdown
# PR Review Audit — OVE-123: Ticket Title

## Context

- **Ticket:** OVE-123 — Ticket Title
- **PR:** #45 — PR title
- **Branch:** `feat/ove-123-feature-name`
- **Pitch / Scope Area:** Pitch N: Pitch Name
- **Primary acceptance criteria checked:**
  - AC #1: ...
```

Then, per comment:

```markdown
## [RECOMMENDATION] — One-line summary

📎 `path/to/file:L42`

**Reviewer said:** "Brief quote or paraphrase."

**Technical assessment:** VALID / INVALID / UNCERTAIN

One or two sentences on whether the reviewer is correct, referencing actual code behavior, existing patterns, or tradeoffs.

**Scope assessment:** IN_SCOPE / ALREADY_PLANNED / NEW_TICKET / OUT_OF_SCOPE

One or two sentences mapping this to the acceptance criteria, another ticket, a roadmap boundary, the PRD, the design doc, or an architecture decision.

**Recommendation:** IMPLEMENT / DEFER / SKIP / DISCUSS

Exactly what to do and why.
```

Worked examples, one per recommendation type. Ticket IDs here are illustrative.

```markdown
## IMPLEMENT — logSet writes the baseline in a separate transaction

📎 `lib/logging/logged-sets.ts:L58`

**Reviewer said:** "The baseline update happens after the set is committed. If it fails, they drift."

**Technical assessment:** VALID
The set is created in one `prisma.$transaction` and `applyBaselineCorrection` runs on the global client afterward. A failure leaves a set with no baseline update.

**Scope assessment:** IN_SCOPE
Matches AC #4: "A logged set and its baseline correction commit together." It also breaks the Gym baseline isolation and atomicity rule in `CLAUDE.md`.

**Recommendation:** IMPLEMENT
Pass the transaction client into `applyBaselineCorrection` so both writes commit or roll back together.
```

```markdown
## DEFER — Add a progress chart to the session summary

📎 `app/(app)/session/[id]/summary/page.tsx:L12`

**Reviewer said:** "This summary should show the e1RM trend for each lift."

**Technical assessment:** VALID
The trend is a useful addition to the summary.

**Scope assessment:** ALREADY_PLANNED
The e1RM trend and charts belong to Pitch 5: Progressive Overload Engine, tracked in OVE-61 "e1RM trend charts". This ticket is Guided Workout Logging.

**Recommendation:** DEFER
Cite OVE-61 in the PR reply. Leave a plain placeholder, not a TODO.
```

```markdown
## SKIP — Block a set whose weight is far from the gym baseline

📎 `lib/logging/validate-set.ts:L33`

**Reviewer said:** "If someone logs 40 lbs on a machine that normally has 120, we should reject it."

**Technical assessment:** INVALID
A different gym can legitimately have a different machine. Rejecting it would defeat the point of per-gym baselines.

**Scope assessment:** OUT_OF_SCOPE
Contradicts the PRD edge case: a logged weight that deviates meaningfully updates that gym's baseline rather than blocking.

**Recommendation:** SKIP
Explain that unusual-but-valid input triggers baseline correction, not rejection.
```

```markdown
## DISCUSS — What should a set with zero reps mean?

📎 `lib/logging/validate-set.ts:L21`

**Reviewer said:** "Reps of 0 passes validation. Is that intended?"

**Technical assessment:** UNCERTAIN
It could be a failed attempt worth recording, or a data-entry mistake.

**Scope assessment:** IN_SCOPE
Matches AC #2 on logging a set, but the PRD flags zero-value handling as unsettled and the spec must record the decision.

**Recommendation:** DISCUSS
The user should decide. Safe default until then: reject zero reps with `validation_error`, which is easy to loosen later.
```

## Step 5: Summary

```markdown
## Summary

- **Implement:** X
- **Defer:** X
- **Skip:** X
- **Discuss:** X
```

Then a short final judgment naming what belongs in this PR and what does not.

## Important guidelines

- Always read the actual code the reviewer is commenting on.
- Cite specific acceptance criteria when classifying scope. Good: `Matches AC #3: "Archiving an exercise removes it from pickers but keeps it in past workouts."` Bad: `Seems in scope.`
- Cite specific ticket IDs when something is already planned. Good: `Tracked in OVE-58: Goal completion card.` Bad: `Already planned somewhere.`
- Cite specific docs when feedback conflicts with scope — brief for permanent non-goals, PRD for MVP boundaries, architecture for stack and security decisions, pitch for slice boundaries, design doc for UX behavior, spec for implementation constraints.
- Be honest when uncertain. **DISCUSS** is a valid answer.
- Do not implement anything. Do not rewrite the PR unless explicitly asked after the audit.
- Stylistic preferences default to **SKIP** unless they materially affect readability, maintainability, accessibility, or consistency.
- Security, privacy, data-loss, and auth issues deserve extra scrutiny and are usually IN_SCOPE when introduced by this PR. Anything that can lose or alter logged history is IN_SCOPE even when no acceptance criterion mentions it.
- Scope is not an excuse to ignore a real regression the PR introduced.
- Do not let reviewers drag deferred features into current work.
- Do not let the ticket grow because a comment sounded impressive.
- Do not accept suggestions that conflict with Overload's approved direction unless the planning docs have changed.

## Common Overload review patterns

**Implement:** a `LoggedSet` written outside its module; a new table with no row-level security; a baseline update outside the set's transaction; a stored tag or e1RM column; a hard delete of an `Exercise` or `Gym`; a client-side `fetch()` for application data; a missing empty or error state the design doc requires; a failed save that wipes the entered numbers; the reactive deload check firing during the scheduled deload week.

**Defer:** progression tags or charts arriving during Guided Workout Logging (Progressive Overload Engine); goal progress arriving during a charts ticket (Goals); dated goals or RPE entry (Post-MVP); heart rate or distance on cardio (deferred to the mobile phase); a map pin or arrival notification for gyms (mobile phase).

**Skip:** subjective naming; a Material UI or styled-components suggestion; blocking an odd weight where the PRD says correct the baseline; extracting an abstraction with no payoff for a one-user app; a duplicate auth check in a place that already inherits one; adding an index nobody queries; denormalizing "for performance" with a few hundred sets in the table.

**Discuss:** how zero-weight or zero-rep entries should behave; whether goal creation blocks or replaces an existing goal on the same lift; the thresholds and deload reduction values the Architecture Doc leaves open; whether the exercise image bucket is public or private; wording that changes how "Progress" and "Deload" read to the lifter; whether to extract a shared component now or after the second use.
