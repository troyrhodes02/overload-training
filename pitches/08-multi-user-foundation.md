# Overload — Pitch 8: Multi-User Foundation

> Source: Linear document "Overload — Pitch 8: Multi-User Foundation"
> (`064aad1b-a72c-459e-a9d1-2c58ecc5a687`, project Overload V1), copied verbatim
> on 2026-10-18 for the autonomous pipeline run. Linear is the original.

## Status

**Planned — top priority**

## Type

**Foundational**

## Appetite

**L — Large**

This is a large pitch because it changes the ownership assumptions underneath essentially every existing area of Overload, introduces an account boundary that every read and write must respect, migrates irreplaceable production data, establishes per-account timezone behavior, and adds an isolation test suite that becomes a permanent invariant for every later pitch.

It should **not** be split simply because it is large. This is the legitimate foundation exception to the normal vertical-slice rule: the product cannot safely admit a second account until ownership, access scoping, migration, and verification work as one coherent substrate. Splitting those concerns would create intermediate states in which the application appears multi-user-capable without actually being safe.

---

## Problem

Overload has already shipped as a working single-user strength-training product. Its core job is to tell a lifter whether to progress, hold, or deload based on their own logged performance against their own plan. The next product phase expands that experience to a small group of friends, each of whom must have an entirely private account with their own plan, gyms, history, goals, and training state.

The current production application predates that model. Its data was created under the assumption that there was only one lifter, so the application does not yet have a structural account boundary around all user-owned data. Adding signup before fixing that would create a dangerous failure mode: two people could exist while some reads or writes still operate without an account scope.

That failure would be unusually severe because it can be silent. Overload reaches Postgres through Prisma in a way that bypasses row-level security for application queries, so account separation cannot rely on the database automatically filtering one account away from another. If one application query forgets its ownership constraint, another lifter's plan, gyms, goals, or training history could become visible or mutable without an obvious application error. The Product Brief identifies this as a risk equal in importance to the product's original gym-baseline risk.

At the same time, the existing production account contains the only real copy of the original lifter's training data. Converting the product to account ownership therefore cannot be treated as a clean-slate schema change. Every existing owned record must end up belonging to the existing account without losing, duplicating, reassigning, or changing that account's history, plan, gyms, goals, or current day behavior.

This pitch creates that safe multi-user substrate. It does **not** create the user-facing account experience.

---

## Why this pitch comes first

The entire multi-user phase depends on one guarantee:

> Every piece of private training data belongs to one account, and every application path operates only inside the acting account.

Accounts, signup, onboarding, personalization, release-note state, and later account-owned features all assume that guarantee already holds.

For that reason, Multi-User Foundation precedes Accounts. Production signup remains disabled until this pitch has been verified in production.

The sequencing is intentional. The roadmap treats the conversion of existing production data as the most irreversible operation in the current phase and isolates it into its own gated foundational pitch rather than hiding it inside the later signup feature.

---

## Product outcome

When this pitch is complete, Overload can safely contain data belonging to more than one account.

The existing production lifter still sees the same plan, history, gyms, goals, logged workouts, progression behavior, and calendar-day behavior they had before the conversion.

A second account can exist in verification without being able to read, modify, enumerate, infer, or otherwise detect the first account's private data.

This pitch establishes the isolation substrate. The following Accounts pitch supplies the product-facing means for a friend to sign up, authenticate, recover access, edit their profile, and delete their account.

---

## Included scope

### 1. Account Ownership & Isolation

Every user-owned object belongs to exactly one account.

This includes the existing training and planning domains: mesocycles, sessions and their owned children, gyms and gym-specific baselines, logged sessions and their logged exercise/set history, goals, cardio records, and custom exercises.

The shared exercise library remains the intentional exception. Library exercises are common reference data rather than one lifter's private records, remain ownerless, and are read-only to application accounts. Custom exercises remain private to the account that created them.

Ownership must apply deeply enough that a child record cannot become an accidental cross-account path merely because its parent is owned. The architecture already establishes the governing ownership model; this pitch adopts it rather than redesigning it.

### 2. Account-scoped application access

Ownership in the data is insufficient if feature code can still accidentally make an unscoped query.

All reads and writes of owned application data must therefore operate through an account-scoped access boundary that requires the acting account. Forgetting the account scope should become structurally difficult rather than something every feature author has to remember manually.

The acting account comes from the authenticated server-side identity. It is never trusted from a client-supplied account id, form value, route parameter, or similar input.

A lookup for another account's object behaves like a lookup for an object that does not exist. The product must not reveal that the foreign object is real.

These rules are established architectural invariants and should be consumed by the downstream design/spec stages rather than re-decided here.

### 3. Account-relative constraints

Any rule that was globally unique only because the product had one lifter must become correct in a world with several independent accounts.

The clearest existing example is Goals: one active goal for an exercise means one active goal for that exercise **within a single account**, not one active goal globally across every lifter.

The downstream technical design must review existing owned-data constraints through this lens so one account's legitimate data cannot conflict with another account's.

### 4. Safe conversion of existing production data

The production system already contains live, irreplaceable data created before account ownership existed.

The conversion must preserve that data while assigning every existing owned record to the existing account. The approved shape is staged rather than an all-at-once destructive conversion:

* ownership is introduced in a state that can coexist temporarily with the old rows;
* every existing owned row is assigned to the existing production account;
* completeness is verified;
* only then does ownership become mandatory and the account-relative constraints become authoritative.

The exact migration mechanics belong in the downstream design/spec and runbook. This pitch establishes the required safety shape and outcomes.

The migration must first be rehearsed against a restored copy of production data in the development environment. A fresh production backup is taken immediately before the real migration, and a restore path must be known before the human production step occurs. The actual production application of the migration is a human operator action, not something the autonomous implementation run performs.

### 5. Per-account timezone foundation

Each account has a profile carrying its timezone as an IANA timezone name.

That timezone becomes the authority anywhere Overload reasons about a calendar day, weekday, or local time for that account.

For the existing production account, the migration must set the timezone so today's workout, missed-day handling, and other existing date-sensitive behavior remain unchanged from the lifter's perspective.

Timezone *capture during signup* and normal user-facing editing belong to Accounts and later Settings work. This pitch establishes the account-owned timezone foundation and preserves the existing account's current behavior.

The architectural invariant is that "today" is per account rather than based on the deployment server's clock or an unpersisted browser assumption.

### 6. Permanent cross-account isolation verification

This pitch creates the cross-account isolation suite that every later pitch must keep green.

For every owned model and every meaningful access path, verification must establish that Account B cannot:

* read Account A's private object;
* alter Account A's private object;
* detect Account A's object by directly addressing its identifier;
* encounter Account A's objects in lists, searches, or relations;
* cause a write to be attributed to Account A by supplying Account A's id.

The suite is not temporary migration scaffolding. It becomes one of Overload's highest-priority standing checks and expands whenever a later pitch introduces a new account-owned model.

### 7. Existing deny-all RLS posture remains intact

Row-level security remains enabled with no policies that expose application tables through Supabase's public Data API.

RLS is not being turned into Overload's account-isolation mechanism in this pitch. Application isolation comes from account-scoped access. RLS continues to close the separate public Data API path so Prisma remains the only application-data door.

---

## Solution shape

The solution has five layers of behavior.

First, private records acquire explicit ownership so the system can answer unambiguously which account owns every piece of training data.

Second, application access becomes account-scoped by construction. Feature code does not choose whether to apply ownership; it enters through an access boundary that already requires the acting account.

Third, global assumptions are corrected where multi-user operation changes their meaning, including uniqueness rules and any other constraint that previously relied on there being exactly one person.

Fourth, existing production data is converted through a staged, rehearsed, verifiable migration whose primary objective is preservation rather than speed.

Fifth, adversarial isolation verification becomes permanent infrastructure for the product, so later work cannot quietly regress the foundation.

The Architecture Doc and `CLAUDE.md` are the controlling technical references for the concrete implementation of those layers. This pitch intentionally does not prescribe schemas, helper signatures, module names, migration commands, or endpoint contracts.

---

## Out of scope

### User-facing account creation

No signup interface, account creation flow, login redesign, invite-code UI, password recovery, or logout work is included here.

Those belong to **Accounts: Signup, Login & Password Reset**.

### Profile editing

Although this pitch establishes the account profile and its timezone foundation, it does not provide Settings UI for editing first name, last name, or timezone.

### Password reset and transactional email

No SMTP provider is configured as part of this pitch, and no password-reset delivery work belongs here.

### Account deletion

The user-facing and destructive account-deletion capability belongs to Accounts, where its confirmation and deletion semantics can be treated as a dedicated risk.

### Public signup

Signup remains disabled in production throughout this pitch.

Verifying multi-account behavior with controlled test accounts is not permission to expose registration publicly.

### Roles, administration, or cross-account visibility

There is no admin role, friend role, owner dashboard, shared plan, sharing feature, leader board, support impersonation mode, or other account-to-account visibility.

Overload's authorization model remains ownership only.

### Reworking existing training behavior

This pitch does not redesign the progression engine, logging workflow, goals experience, gym baseline behavior, cardio, missed days, exercise swapping, or mesocycle structure except where account ownership/scoping is strictly required to preserve their existing behavior.

### New user-facing UI

This foundation intentionally has no new product screen, page, form, navigation element, or visible state. It exists underneath the currently shipped application.

---

## Definition of done

The pitch is complete when all of the following are true.

### Account isolation

A second account cannot read, change, or detect the existence of any private object belonging to the first account, including access by id, through collections, or through relationships.

**Trace:** PRD — Account Ownership & Isolation acceptance criterion: "A second account cannot read, change, or detect the existence of any of the first account's data."

### Production data preservation

After the production migration is applied by the human operator, the existing account's history, plan, gyms, and goals are unchanged, and the migration's before/after verification shows no unexplained row loss or duplication.

**Trace:** PRD — Account Ownership & Isolation acceptance criterion covering unchanged history, plan, gyms, goals, and matching row counts.

### Account-relative uniqueness

Rules that are unique within a lifter's data operate independently per account, including one active goal per exercise.

**Trace:** PRD — Account Ownership & Isolation acceptance criterion requiring uniqueness rules to apply per account.

### Foreign-object lookup does not leak existence

Requesting an object belonging to another account behaves exactly like requesting an object that does not exist.

**Trace:** PRD — Account Ownership & Isolation edge case.

### Shared exercise library remains shared and read-only

Library exercises remain ownerless shared reference data and cannot be edited or archived by individual accounts. Custom exercises remain account-owned.

**Trace:** PRD — Account Ownership & Isolation description and edge case.

### Migration is recoverable

The production conversion can be rehearsed against a copy of production and has a backup/restore path before any real production change occurs.

**Trace:** PRD — Account Ownership & Isolation migration edge case.

---

## Additional roadmap completion conditions requiring upstream PRD traceability

The roadmap also requires two completion conditions that are clearly authoritative for this pitch but are **not expressed as explicit PRD acceptance criteria**:

1. Row-level security remains deny-all on every table.
2. "Today" resolves using each account's timezone, with the existing account's day behavior preserved.

Both requirements are consistent with the Architecture Doc and `CLAUDE.md`, and both should be implemented and verified in this pitch. However, under the pitch-expansion rule that acceptance criteria must trace to PRD acceptance criteria rather than being silently invented, they should be recorded as an **upstream PRD amendment** rather than disguised as already-traced acceptance criteria.

Suggested PRD amendment:

* Every computation of today or weekday uses the acting account's stored timezone, and migration preserves the existing account's current calendar-day behavior.
* Row-level security remains enabled in its deny-all posture on every application table after the ownership migration.

Until that amendment is applied, the roadmap and Architecture Doc remain controlling authority for those requirements.

---

## Rabbit holes

### An internal path that bypasses account scoping

The most dangerous temptation is to preserve or create a "trusted internal" helper that can query owned data without an account because it is convenient for existing code.

That recreates exactly the class of silent failure this pitch exists to eliminate. Internal convenience is not a second authorization model.

### Trusting an account id supplied by the caller

Making reusable operations accept an arbitrary account id from the browser, URL, or form may look flexible but breaks the identity boundary.

The acting account must come from authenticated server identity.

### Turning signup on to test the migration

Creating the ability to hold multiple accounts is not the same as approving public account creation.

Signup remains disabled in production until the foundation has been migrated and verified there.

### Making ownership mandatory before the backfill is proven complete

The production conversion has to pass through a safe intermediate state. Tightening the final constraint before every live row has been accounted for would turn a preservation exercise into a destructive migration risk.

### Applying production migration automatically

The implementation run may prepare, rehearse, verify, and document the migration. It does not autonomously apply it to production.

Production application is a human runbook step with a fresh backup.

### Solving account isolation with permissive RLS policies

The existing architecture deliberately keeps RLS deny-all and uses Prisma as the application data path. Adding user-facing RLS policies would create a second data-access model instead of strengthening the approved one.

### Per-account copies of shared library exercises

Ownership work must not accidentally turn the imported exercise library into private duplicated data or let one account archive a shared exercise for everyone.

The shared library remains the explicit ownerless exception.

### Quiet date regressions

Moving "today" to account timezone affects behavior that can look correct in development while being wrong around midnight or across time zones. Preserving the existing account's current day behavior is part of the migration, not cleanup for a later UI pitch.

---

## No-gos

* No public signup.
* No invite-code flow.
* No email verification.
* No social login.
* No password-reset implementation.
* No SMTP integration.
* No account-deletion flow.
* No roles or admin interface.
* No cross-account sharing.
* No application-data access through the Supabase client.
* No RLS policy that opens the Data API.
* No client-supplied acting account identity.
* No unscoped exception for "internal" feature code.
* No autonomous production migration.
* No alteration or destruction of existing logged history as a side effect of ownership migration.
* No redesign of progression, logging, gym baselines, goals, cardio, or plan construction beyond the ownership changes required by this pitch.

These boundaries preserve the Product Brief's permanent non-goals and keep account creation itself in the following Accounts pitch.

---

## Dependencies

### Depends on

**MVP 1**, already complete and in production.

This pitch assumes the existing application, authentication system, training data model, logging history, goals, gyms, cardio, and progression behavior are the production baseline that must be preserved.

### Blocks

**Accounts: Signup, Login & Password Reset**

Signup cannot safely open until Account Ownership & Isolation exists and has been verified in production.

It also forms the account-owned substrate used by the remainder of the multi-user phase and by every later feature that introduces private per-account state.

---

## Rollout boundary

Code completion is not equivalent to production completion for this pitch.

The implementation pipeline should produce:

* the ownership/scoping foundation;
* the migration itself;
* migration rehearsal results;
* isolation verification;
* a production runbook;
* backup and restore instructions;
* the evidence a human needs to make the production change safely.

A human then applies the migration to production from that runbook.

After production application, the row counts, existing account behavior, account isolation, RLS posture, and timezone behavior are verified against production.

Only after that gate succeeds may the following Accounts pitch enable the path toward additional real users.

Public signup remains disabled throughout this pitch and is never automatically enabled by its pipeline.

---

## Risks

### 1. Silent cross-account leakage

This is the primary correctness and privacy risk.

A missed ownership scope may produce perfectly valid data from the database — just belonging to the wrong person. That means normal error monitoring cannot be relied on to reveal the defect.

Mitigation at the pitch level is structural account scoping plus adversarial isolation verification rather than code-review convention alone.

### 2. Irreplaceable migration damage

Existing logged history cannot be reconstructed reliably after the fact.

The migration therefore optimizes for preservation and reversibility: rehearse first, account for every row, back up immediately before production, and have a known restore path.

### 3. Partial ownership

It is possible to create the appearance of account isolation while leaving a less-obvious child model, relation, list query, search path, or constraint global.

This is why the definition of ownership covers every owned model and why the isolation suite operates across paths rather than proving only a few top-level pages.

### 4. Existing-account behavioral drift

Even if all rows survive, the migration is not successful if the original lifter suddenly sees a different Today state, altered plan, missing history, changed gym baselines, different goals, or timezone-induced date shift.

Preservation includes behavior, not merely database row survival.

### 5. Shared-library confusion

The exercise library intentionally violates the normal "everything has an owner" rule. Treating that exception casually could either leak future private custom exercises into shared data or accidentally make the common library account-specific.

The boundary must stay explicit: shared imported library versus owned custom exercise.

---

## Open questions

There are **no product-level open questions that should block pitch expansion**.

The Architecture Doc lists implementation questions around the exact shape of the account-scoped access layer and production migration runbook. Those belong to the downstream design/spec stages because this pitch already establishes the required behavior and invariants.

The pipeline's standing decisions also resolve the previously open direction for ownership, scoped access, foreign-record behavior, migration staging, and timezone representation. They should be adopted rather than re-derived by downstream work.

The only documentation gap discovered during expansion is the PRD traceability issue noted above: the roadmap's explicit RLS and timezone completion conditions should be promoted into the PRD's Account Ownership & Isolation acceptance criteria.

---

## Handoff to the design-doc stage

The design-doc stage should answer **how** this foundation is realized while preserving the boundaries above.

It has freedom to design the concrete ownership migration, account-scoped access structure, verification mechanics, and runbook details inside the approved Architecture and `CLAUDE.md` constraints.

It does **not** have freedom to weaken these outcomes:

* every private object belongs to one account;
* the acting account is server-authenticated rather than client-selected;
* account isolation applies to every read and write;
* another account's object is indistinguishable from a nonexistent one;
* the shared library remains the deliberate ownerless exception;
* existing production data and behavior survive the conversion;
* RLS remains deny-all;
* account-local date behavior uses the profile timezone;
* signup stays disabled until production isolation is verified;
* production migration is applied by a human, not by the autonomous run.

That is the edge of this pitch. Everything more concrete belongs to the next stage.
