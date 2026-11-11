# Overload — Pitch: Foundation

**Type:** Foundational
**Appetite:** **S — Small**

> Source: pulled from Linear document "Pitch 1 — Foundation" (Overload V1), https://linear.app/overload-training/document/pitch-1-foundation-56c40bb9020e

This is a contained infrastructure slice with clear technologies already selected upstream and little product ambiguity. The exception allowing a non-user-facing foundation to stand alone applies directly here: auth, data-model substrate, and deployment scaffolding are specifically called out as legitimate standalone foundational work.

#### Problem

Overload ultimately needs to tell the lifter whether to progress, hold, or deload based on their logged performance against their own plan. Before any of that product behavior can exist, the application needs a trustworthy place to run, a single authenticated identity, and a data foundation capable of representing the product's later concepts.

Pitch 1 solves that prerequisite problem only. It does **not** attempt to deliver the core training experience yet.

#### Solution shape

Ship the smallest production-ready application foundation that later pitches can extend without revisiting basic platform decisions.

The application should use the stack already established by the Architecture Doc: Next.js with React and TypeScript for the application, Supabase for Postgres and authentication, Prisma as the schema authority/data-access layer, and Vercel as the hosting target.

At the end of this pitch:

* the lifter can authenticate and enter the application;
* unauthenticated application routes are inaccessible;
* the production database contains the base schema required by the approved architecture;
* the app has a minimal shell/navigation structure for later screens to attach to;
* changes can move from the codebase to the production deployment through the established deployment path.

This pitch should **point to the Architecture Doc for implementation decisions rather than redefining them**. The pitch stage defines what foundation must exist; the design stage decides the implementation details inside those established constraints.

#### Scope

Included:

* Supabase Auth login.
* Authenticated application access.
* Base Prisma schema covering the Architecture Doc's core entities.
* Production Supabase database setup.
* Minimal authenticated app shell and navigation.
* Vercel production deployment pipeline.
* Separate development and production database environments consistent with the Architecture Doc.

The architecture already specifies a separate Supabase development project and a production Supabase project connected to the production Vercel deployment, with Prisma managing migrations across them.

#### Boundaries / explicitly out of scope

No actual training functionality belongs here.

That means no:

* exercise library browsing or management;
* gym management;
* split or mesocycle creation;
* workout logging;
* progression calculations or recommendations;
* goals;
* cardio logging;
* imported exercise dataset or exercise images beyond whatever empty schema/storage preparation later work may require.

Those capabilities begin in subsequent pitches. The roadmap explicitly defines Pitch 1 as a deployed, authenticated **empty application** and defers all product functionality.

Visual design should also stay deliberately minimal. The Architecture Doc leaves the styling/component approach undecided for a later design phase, so Pitch 1 should not turn into a design-system project.

#### Definition of done

The definition of done should remain exactly aligned with the roadmap rather than inventing feature behavior that the PRD does not assign to this foundation:

1. The lifter can log in and reach an authenticated, otherwise empty application shell.
2. The production database contains the schema described by the approved Architecture Doc.
3. A code change can be deployed to the production application through the established deployment pipeline.

There's an important traceability nuance here: unlike later feature pitches, Pitch 1 has no directly corresponding MVP feature section in the PRD. Its acceptance criteria therefore originate from the **Pitch Roadmap and Architecture Doc**, not from feature-level PRD acceptance criteria. That's reasonable for a genuine foundation, but I'd explicitly record it as an exception so a downstream agent doesn't try to fabricate PRD traceability.

#### Rabbit holes

The main danger is allowing "foundation" to become a bucket for work that merely feels convenient to do early.

The biggest rabbit holes to avoid are building generic infrastructure the single-user product does not require: roles/permissions, multi-user tenancy, real-time synchronization, offline support, staging infrastructure, generalized API abstraction, elaborate error/observability platforms, or premature performance work. The architecture explicitly describes this as a single-writer, low-volume system without offline or real-time synchronization requirements.

Authentication can also expand unnecessarily. The Architecture Doc says Supabase Auth handles identity and that either email/password or a magic-link flow is sufficient because there is exactly one account. The design stage should choose the minimal viable flow rather than supporting every Supabase authentication mode.

#### No-gos

Do not use this pitch to "get ahead" on Pitch 2 by importing the exercise database, building exercise CRUD, or creating gym screens.

Do not create speculative fields or abstractions for features not represented by the approved Architecture Doc.

Do not add multi-user authorization machinery. The product is explicitly a single-user instrument, and social/multi-user behavior is a permanent non-goal for this version.

Do not polish the shell into a finished product UI. Its purpose is to prove authenticated navigation and provide a home for future surfaces.

#### Dependencies

**Prior pitches:** None. Pitch 1 is the root dependency for the roadmap.

**External prerequisites:** Supabase development and production projects, a Vercel project/deployment target, and the required environment configuration/credentials.

#### Downstream handoff

Pitch 1 should leave Pitch 2 with a boring, verified starting point: authentication already works, the application can deploy, the agreed entities exist in the data layer, and there is an authenticated shell in which the Exercise Library and Gym Management surfaces can be built.

I'd keep this pitch at **S**. If we start adding exercise seeding, reusable design-system work, generalized authorization, or feature CRUD, it has crossed the boundary and should be pushed back into the pitch that actually owns that vertical capability.
