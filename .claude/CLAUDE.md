# Overload — CLAUDE.md

Overload is a strength training tracker whose job is to tell each lifter, per lift and per session, whether to progress, hold, or deload, based on logged performance against a plan they built themselves. It is invite-only today and is being opened to the public, with a free plan and a paid Pro plan. Every lifter has their own account, and no account can see, change, or learn anything about another account's data.

**Status.** The first three MVPs are shipped: the training product, the multi-user conversion, and the training-intelligence features. Overload is now moving from an invite-only product for friends to a commercial launch with a Free plan and a Pro plan (MVP 4). Until the launch-readiness checklist passes, signup stays invite-only and no payment is collected.

This file is persistent context for Claude Code. It encodes the non-obvious rules and invariants specific to this project. For product intent see `docs/planning/product-brief.md`; for features and acceptance criteria see `docs/planning/prd.md`; for technical decisions and rationale see `docs/planning/architecture.md`; for build sequencing see `docs/planning/pitch-roadmap.md`. This file is the "how we write code here" layer on top of those.

## Stack (ground truth)

- **Next.js (App Router), React, TypeScript** — the application framework. Server-first: pages are server components that read data directly. It is **not** a client-side SPA and has no REST layer for its own UI to call.
- **Supabase** — managed Postgres, Auth, and Storage. The Supabase client handles the auth session (via its Next.js cookie integration) and Storage for exercise images. It is **not** the query layer for application data; that is Prisma. Supabase's auto-generated Data API is closed (see security invariants).
- **Email** — none today. Password recovery was deliberately not built, to avoid a third-party email dependency, and the application sends no email. The Public Accounts pitch adds a custom SMTP provider configured in Supabase Auth (Supabase's built-in sender only reaches the project's own team and is capped at two messages an hour). Do not add email sending before that pitch.
- **Prisma** — schema authority, migrations, and the only path to application data. If a table exists, its shape is defined in `schema.prisma` and nowhere else.
- **Vercel** — hosting and deployment. Serverless: no process holds state between requests.
- **Recharts** — progression charts (e1RM trend lines, goal progress). Nothing else draws charts.
- **free-exercise-db** — public-domain exercise dataset, imported **once** by a Prisma seed script into the `Exercise` table and Supabase Storage. It is not queried at runtime. If it disappears tomorrow, nothing breaks.

- **Tailwind CSS with shadcn/ui** — the single component and styling system, with `lucide-react` icons. It owns layout, theming, and every UI primitive. It is **not** a license to mix in a second library: no Material UI, styled-components, CSS modules, or other component kit. Design rules for how it looks live in the `overload-ui-design` skill, not here.

Planned for the commercial launch, and not to be added before the pitch that introduces them: **Stripe** (Billing, hosted Checkout, and the Customer Portal; the only place money and card data live), a **custom SMTP provider** for account email (Public Accounts), a **language-model API** called from the server for plan import only (Plan Import), and **Capacitor** iOS and Android shells around the same web app (iOS Foundation, then Android Foundation).

Infrastructure Overload deliberately does **not** have, as decisions rather than omissions: no scheduler or cron job, no queue, no cache layer, no realtime subscriptions, no offline mode or sync layer (the lifter logs later if the gym has no signal), no staging environment, no maps or geocoding service (gym location is free text), no health-data integration (HealthKit is unreachable from a website), and no role system for lifters. The owner-only admin area, once built, is separate (see the admin boundary). An agent that does not know these were rejected will add them.

Do not add libraries or infrastructure not already decided in the Architecture Doc without flagging it first.

## The first invariant: every account's data is its own

**Account isolation outranks every other rule in this file.** A leak between accounts shows one person's training history, plan, and gyms to another, cannot be taken back, and produces no error. Prisma connects to Postgres in a way that bypasses row-level security, so the database does not protect accounts from each other. The application does, and only by scoping every query.

- **Ownership.** Every owned model, including child models, carries a `userId` for the owning account. Library `Exercise` rows are the one exception: they are shared, have no owner, and application code never writes to them. A custom exercise carries its owner's `userId`. Exercise reads return the shared library plus the acting account's own custom exercises.
- **Scoped access only.** Feature code reaches owned data only through the account-scoped data-access layer, whose functions take the acting `userId` as a required argument and apply it to every query. A raw `prisma.<model>` call on an owned model is allowed only inside that layer, the account-deletion module, the admin metrics layer (account metadata and aggregate counts only, never training content), the billing webhook handler (entitlement and billing records only), and operator tasks, and a static check in CI enforces it. The layer's location and shape are set in the Multi-User Foundation spec.
- **Identity comes from the session.** The acting `userId` is read from the authenticated session on the server. It is never a request parameter, a form field, a URL segment, or anything else a client supplies. The one exception is a verified Stripe webhook, which resolves the account from the stored Stripe customer id, never from the payload alone.
- **An id is not authorization.** Fetching or changing a record by id must also match the acting `userId`. A record owned by someone else is indistinguishable from one that does not exist: return not-found, never forbidden, and never an error that reveals it.
- **Uniqueness is per account.** Constraints such as one active goal per exercise include `userId`.
- **Deleting an account** is the single sanctioned way to destroy logged history. It is user-initiated, confirmed, handled by one dedicated module, and removes only that account's rows, in dependency order, in one transaction. Nothing else may bypass the history rules below.
- **Operator tasks** (applying the production migration, seeding a friend's plan) always name the target account explicitly and never infer it.

The cross-account isolation suite is the first standing check. It proves, for every owned model and every read and write path, that a second account cannot see, change, or detect the first account's data. Every later pitch keeps it green and extends it for any new owned model.

## The second invariant: logged sets are the only source of truth

**Together with account isolation, this is the most important rule in the codebase.** Everything the product tells the lifter (progress, hold, deload, e1RM trend, goal percentage) is derived from `LoggedSet` rows. If a logged set is lost, silently altered, or detached from the exercise and gym it was performed at, every conclusion built on it is wrong, and unlike a visible error, nobody can tell. A training history cannot be reconstructed after the fact. This outranks the gym-baseline invariant below; the baseline can be re-tuned from history, but history cannot be re-derived from the baseline.

Enforcement is layered, because neither layer is sufficient alone.

**Layer 1 — application (all feature code).** `LoggedSet` rows are written and edited only through `lib/logging/logged-sets.ts`. Nothing outside that module calls `prisma.loggedSet.create`, `.update`, or `.delete`. `Exercise` and `Gym` are never hard-deleted (the account-deletion module is the only exception); deletion sets `deletedAt` and removes the row from selection lists only. Queries that feed pickers filter `deletedAt: null`. Queries that render history must not filter it, or archived exercises vanish from the past.

**Layer 2 — database.** Foreign keys from `LoggedExercise` to `Exercise` and `Gym` use `onDelete: Restrict`, so even a buggy hard delete fails loudly rather than cascading history away. Row-level security is enabled on every table (see security invariants), so no path other than Prisma can write.

### Derived values are computed on read, never stored

The progress/hold/deload tag and the e1RM trend are pure functions of the logged sets, the planned rep range, and the mesocycle week. There is no `tag` column, no `e1rm` column, no cached "needs deload" flag, and no job that maintains them. Editing a past set therefore corrects every downstream tag and trend with no recompute path to forget. Do not add a stored copy "for performance"; the data per account is small. A stored copy is how history and conclusions drift apart.

`GymExerciseBaseline` is the one stored derived-ish value, because it holds per-gym state that logged sets alone cannot reconstruct. It is written only by the baseline-correction path described next.

### Gym baselines are isolated per gym and written atomically

Serverless functions can be retried, run concurrently, and cold-start on any request, and Postgres through Supabase's pooler cannot be assumed to give a function one long-lived connection. Therefore:

- Use the pooled connection string (`DATABASE_URL`) at runtime and the direct one (`DIRECT_URL`) only for migrations. Instantiate one `PrismaClient` per process in `lib/db.ts` and import it; never construct another.
- A logged set and any baseline correction it triggers happen in **one transaction**. A set that exists without its baseline update, or a baseline updated for a set that failed to save, is a correctness bug.
- A correction touches only the `(gymId, exerciseId)` row for the gym the set was logged at. It must never alter another gym's baseline, and it must never rewrite an existing `LoggedSet`.
- The first log of an exercise at a gym has no baseline to deviate from. It establishes the baseline and never counts as a correction.
- Free-weight and plate-loaded exercises have no `GymExerciseBaseline` row. Whether an exercise is gym-variable is decided in exactly one function, `isGymVariable(exercise)`.

If you are ever unsure whether a code path keeps a set and its baseline update in the same transaction, treat it as a blocking issue, not a detail.

### Multi-step writes must be atomic

Logging a set, applying a baseline correction, and marking a `LoggedSession` complete are dependent writes. They succeed or fail together. Use `prisma.$transaction`, and make every write function accept an optional transaction client so callers can compose.

```ts
// lib/logging/logged-sets.ts
import { Prisma, LoggedSet } from "@prisma/client";
import { prisma } from "@/lib/db";
import { applyBaselineCorrection } from "@/lib/gyms/baselines";
import { isGymVariable } from "@/lib/exercises/gym-variable";

export async function logSet(
  input: { loggedExerciseId: string; setNumber: number; weight: number; reps: number },
  tx?: Prisma.TransactionClient,
): Promise<LoggedSet> {
  if (!tx) return prisma.$transaction((t) => logSet(input, t)); // wrap if none passed
  return logSetInTx(input, tx); // compose if one was
}

async function logSetInTx(
  input: { loggedExerciseId: string; setNumber: number; weight: number; reps: number },
  tx: Prisma.TransactionClient,
): Promise<LoggedSet> {
  const loggedExercise = await tx.loggedExercise.findUniqueOrThrow({
    where: { id: input.loggedExerciseId },
    include: { exercise: true },
  });

  // Invariant: the set is stored exactly as entered. No tag, no e1RM, no derived value is written here.
  const set = await tx.loggedSet.create({
    data: {
      loggedExerciseId: input.loggedExerciseId,
      setNumber: input.setNumber,
      weight: input.weight,
      reps: input.reps,
    },
  });

  // Invariant: baseline correction runs in the same transaction, scoped to this gym and exercise only.
  if (loggedExercise.gymId && isGymVariable(loggedExercise.exercise)) {
    await applyBaselineCorrection(
      { gymId: loggedExercise.gymId, exerciseId: loggedExercise.exerciseId, loggedWeight: input.weight },
      tx,
    );
  }

  return set;
}
```

## Data access

**Application data is read and written through Prisma in server-side code. Never fetch application data with client-side `fetch()` or query the database from the browser.**

- Server components read through the account-scoped data-access layer, with the acting `userId` resolved from the Supabase session cookie. The auth check runs on every request, and the Prisma client in `lib/db.ts` is imported only by that layer and the other modules the first invariant names.
- Mutations run through server actions that call the write modules (`lib/logging/logged-sets.ts` and its siblings), not raw client fetches and not ad hoc `prisma` calls inside components.
- Client components are interactive islands only: the exercise logging card (set entry), the swap picker, the missed-day prompt, the exercise library search and muscle-group filter, and the Recharts charts. They call server actions. They never touch the data store or hold credentials.
- The Supabase client is used for the auth session and Storage only. It must not be used to query or mutate application tables.

## Security invariants (non-negotiable)

### Access and registration model

Identity is Supabase Auth with email and password. Accounts are created through the signup form (first name, last name, email, password). Signup is invite-only today: it requires a valid invite code checked on the server, and it stays that way until Public Accounts is verified, after which a server-side setting can switch it to public. There is no social login and no multi-factor authentication. Password recovery does not exist today, because it was deliberately removed to avoid a third-party email dependency. Public Accounts builds it over a custom SMTP provider, with the same response whether or not an email has an account, and adds email verification before a first checkout and abuse protection on signup and recovery. Every route except login, signup, and (later) recovery requires an authenticated session, enforced in middleware and re-checked in server actions. A suspended account is refused on every authenticated request. Do not enable public signup, loosen the invite gate, or add social login, a role system for lifters, or any email sending outside the pitch that scopes it.

### Row-level security: deny-all, Prisma is the only door

Prisma connects directly to Postgres and bypasses row-level security. Supabase also exposes every table through its public Data API, reachable with the anon key that ships to the browser. Therefore **RLS is enabled with no policies on every table**, so the Data API returns nothing. Every migration that creates a table must also enable RLS on it. A new table without RLS is publicly readable through the anon key; treat that as a blocking issue.

### Storage

Exercise images are public-domain assets from free-exercise-db. They are the only content in Storage. Custom exercises have no image. Do not add user-uploaded files without a pitch.

### Secrets

`DATABASE_URL`, `DIRECT_URL`, the Supabase service-role key, the invite code, the SMTP credentials, the Stripe secret and webhook signing keys, and the language-model API key are server-only and never appear in client bundles or in `NEXT_PUBLIC_` variables. Vercel preview deployments and local development point at the Supabase dev project, never at production.

### Personal data

Names, emails, and training history are personal data. Never log them, never put them in error messages, never show another account's name, and never add third-party tracking without a pitch that decides it. Aggregate counts for operating the product are allowed in the admin area, and the owner never sees an account's training content.

## Commercial and platform rules

### The admin boundary

- Admin identity is established on the server from an allowlist of auth user ids in a server-only environment variable. It is not a database role, nothing in the app can grant it, and every admin operation re-checks it. Hiding navigation is not authorization. A non-admin who reaches an admin route or action gets not-found.
- Admin code reads account metadata and counts only: name, email, status, signup and last-active dates, plan state, and aggregate metrics. It never returns a plan, gym, logged set, goal, or cardio record. There is no impersonation. If support ever genuinely needs more, that is a new pitch with explicit, narrow, audited access.
- Every admin mutation (suspend, reactivate, delete, grant or revoke comped access) writes an append-only audit entry: who, what, which account, when.
- Billing state in the admin area is a read-only mirror of Stripe and is never edited there. Comped access is Overload's own entitlement and is the only plan state the admin area changes.
- The admin area is web-only.

### Plans, entitlements, and billing

- There are two plans: Free (no ads, ever) and Pro. Capture is free and interpretation is paid. Everything a lifter enters, their full history, and their export stay free and are never gated, locked, or deleted, including on a downgrade.
- Code checks named capabilities (for example progression insights, plan import), and each plan grants a set of them. Never branch on a plan name. Later Pro additions are Pro by default, and every pitch states the capability that gates what it adds.
- Enforcement is on the server. A Free account must never receive a Pro result, even by calling a server action directly. Hiding a button is not enforcement.
- An entitlement has a source: trial (14 days from signup, no card), subscription, or comp. Trial and comp are Overload's own state. Subscription state comes only from verified, idempotent Stripe webhooks, and a replayed event must change nothing. Comp carries a reason, an optional end date, and an audit entry. It is not a role and never touches Stripe.
- Stripe is the only place money and card data live. Never store, log, or handle card numbers; use hosted Checkout and the Customer Portal. Runs use Stripe test mode only.
- Upgrade prompts are one quiet, dismissible note where a Pro feature would be. No countdowns, banners, or other dark patterns.

### Plan import (AI)

- The model call happens only on the server, never in the browser.
- Input has a size limit. Each account has rate and daily limits tied to its entitlement, and there is a global spend cap with a kill switch.
- Pasted text is data, never instructions. Output is validated against a strict schema, and every extracted item must trace back to the pasted text. It never invents an exercise, set, or load.
- Exercises are matched to the library, and ambiguous or unmatched ones are shown for the lifter to decide. Nothing is saved until the lifter confirms, and the existing plan-creation path does the saving.
- It parses a plan the lifter wrote. It never generates a program or coaches.

### Cross-platform

- There is one backend and one training model. Never build a second progression engine or separate mobile training records.
- Native capabilities sit behind adapters named by capability (haptics, notifications, location, health), with each platform's implementation behind them. The browser degrades gracefully and never renders a native-only control.
- Share UI by default. Use native code only for an actual platform requirement.
- Do not put a purchase flow inside an app shell until the billing path for that store is decided, because store rules differ.
- A check that needs an iOS or Android build or a real device, which an unattended run cannot do, is reported as unverified, never as passed.

## Business logic

### Progress, hold, and deload are computed, and the rep range comes from the plan

The rule is the same regardless of training phase: hit the top of the **planned rep range** for the required number of consecutive sessions and the lift is tagged progress; fall short consistently and it is tagged deload; anything else is hold, which renders with no tag at all. There is no "declared goal" or "training phase" object, and none should be added. A 3×5 bench and a 3×10 bench differ only in their planned rep range.

- The thresholds (consecutive sessions, misses before deload, weight increment) are named constants in `lib/progression/config.ts`, not magic numbers. Their values are open in `architecture.md` and are set in the controlling pitch.
- An exercise with insufficient history (first time performed) is never tagged progress or deload.
- The e1RM trend is the secondary stall-detector: if the rule says progress but e1RM has been flat across the recent window, flag it instead of blindly bumping weight.
- Goal progress and the e1RM trend use the **same** `estimateOneRepMax` function. A goal like 225×12 and a current best of 205×10 are both converted through it. Never write a second formula.

### Two deload systems that must stay separate

The **scheduled deload** is planned recovery: the mesocycle's designated week reduces load across the whole split, regardless of how any lift is doing. The **reactive deload** is a per-exercise call from the progression rule. They are independent. A valid state proving it: a lift can be tagged deload by the rule during week 2, while week 5 is a scheduled deload for everything, including lifts that never stalled.

During a scheduled deload week the reactive check is **suppressed entirely**. It resumes the moment the week ends. Editing a past log never retroactively applies the reactive check to a week that was a scheduled deload.

### Today is per account

Every computation of "today", a weekday, or a time of day uses the account's stored timezone (an IANA name on its profile), not the server's and not the browser's alone. The greeting, the day's planned workout, and missed-day detection all depend on it.

### Planned versus logged, and the word "Session"

`Session` always means a planned workout template inside a `Mesocycle` (for example "Push Day 1"). `LoggedSession` is a record of a day actually trained. Never call the auth session a `Session`; say "auth session". Never write to a `Session` or `SessionExercise` while logging; swapping an exercise mid-workout affects that `LoggedExercise` only, unless the lifter explicitly saves the swap back to the template. Swap candidates are restricted to the same muscle group as the planned exercise.

### Missed days: three outcomes, shift is scoped to one week

An uncompleted prior day prompts three choices: log it late, shift, or skip. Shift moves the remaining days of the **current week** forward by one; the following week returns to the split's normal alignment. A shift must never compound across weeks. Where skipped and shifted days are persisted is open in `architecture.md`; whatever the controlling pitch chooses, a skipped day must not re-prompt on every app open.

### Goals

One active goal per exercise, as a weight and rep target, undated. Reaching 100% archives the goal and offers a new one. Goals are never deleted by progress.

### Cardio is a record, nothing more

A `CardioLog` stores type and duration, assigned to a split day. No tag, no trend, no progression logic ever attaches to cardio.

## Product boundaries (do not build these)

Permanent non-goals from the Brief. These are "never" for this product:

- **No program generation.** The lifter designs every split and mesocycle. The app tracks and adjusts load inside the plan; it never authors one.
- **No social features of any kind.** No sharing, leaderboards, or visibility between accounts. Lifters never see each other.
- **Not open to the public yet.** Signup stays invite-only and no payment is collected until the launch-readiness checklist passes. Social login stays out.
- **No ads, ever.** The Free plan has no ads.
- **No AI coach.** AI is used only to parse a plan the lifter wrote (plan import). It never generates programs or coaches. A chat-style coach would be a separate, much later tier, and is not planned.
- **No dated goals and no rest timer.** Both were considered and decided against. A strength deadline can pressure someone to lift past what their readiness supports.
- **No progression analysis of cardio.**
- **No nutrition or body-composition features in this build.** Those are a deliberately separate, later build. Don't model them here, and don't preclude connecting to them later.

Deferred (planned in the roadmap; don't build unless a pitch calls for it, but don't preclude): the commercial launch features (admin center, public accounts and recovery, plans and billing, the landing page, plan import, launch readiness); the iOS and Android shells; gym location, notifications, Live Activity, and the Watch app; the App Store and Google Play releases; body metrics; nutrition. Cardio stays type and duration.

## Testing

Focus tests where correctness matters most. Highest-value targets, in order:

1. **Cross-account isolation (adversarial, and first).** For every owned model and every read and write path, prove a second account cannot see, change, or detect the first account's data: by id, by list, by search, and through relations. Prove an owned-model query cannot be written outside the allowed modules, that another account's id returns not-found, that the acting account is never taken from client input, and that deleting an account removes only that account's rows.
2. **Logged history integrity (adversarial).** Prove that soft-deleting an `Exercise` or `Gym` leaves every historical `LoggedExercise` readable, that hard deletes of referenced rows are rejected by `onDelete: Restrict`, and that no code path outside `lib/logging/logged-sets.ts` writes a `LoggedSet`. Everything else is derived from it.
3. **Gym baseline isolation and atomicity.** A correction at Gym A never changes Gym B's baseline; the first log at a gym establishes rather than corrects; a failed set write leaves the baseline untouched.
4. **The progression engine.** Threshold boundaries, insufficient-history behavior, scheduled-deload suppression, the e1RM stall override, and that editing a past set changes the computed tag. Pure functions; test them as such.
5. **Missed-day handling.** Each of the three outcomes, shift scoped to one week, and no compounding across weeks or across consecutive misses.
6. **Auth, signup, and RLS.** Unauthenticated requests are redirected, the anon-key Data API returns nothing for every table, signup rejects a missing or wrong invite code while it is invite-only, and a suspended account is refused. Once recovery exists, a request gives the same response for a known and an unknown email.
7. **Admin authorization and its privacy boundary.** A non-admin cannot reach any admin page or operation, by URL or by calling a server action directly. Admin lists and metrics expose no training content. Every admin mutation writes an audit entry.
8. **Plans, entitlements, and billing.** A Free account never receives a Pro result, even by calling a server action directly. Webhooks are authenticated and idempotent, and replaying one changes nothing. Trial, subscription, and comp resolve correctly, and a downgrade deletes nothing.

Test the risky logic hard; lean tests or manual verification are fine for low-risk UI and plain CRUD (the exercise library, gym list, cardio log). The exceptions that are never lean are anything that scopes data to an account, anything that enforces a plan, anything behind the admin boundary, and anything that writes or deletes logged history.

## Workflow

1. Work against the current pitch. Keep changes scoped to that pitch's in-scope list; don't wander into a later pitch. Expanded pitches live at `pitches/NN-pitch-name.md`, numbered and named to match the Pitch Roadmap (for example `pitches/04-guided-workout-logging.md`).
2. Commit with descriptive messages referencing the Linear issue ID. The team key is `OVE`, for example `OVE-123`.
3. Push and open a PR via `gh pr create`; use the Vercel preview deployment to verify before merging. Previews run against the Supabase dev project.

Anything touching `LoggedSet` writes, deletion behavior, or baseline correction gets verified on a preview deployment with real-shaped data before it reaches production, since there is no staging tier and a bad deploy there corrupts the only copy of a lifter's history. Anything touching ownership, scoping, authentication, or the production migration is also verified on a preview deployment with at least two accounts.

### UI-bearing pitches

A pitch is UI-bearing if it creates, changes, or materially specifies any screen, page, component, interaction, form, list, navigation, user-visible state, or responsive behavior. For every UI-bearing pitch the required artifact order is:

`pitch → design doc → UI preview → spec → tickets → implementation`

The UI preview is generated with `overload-ui-design` and saved at `docs/previews/<slug>-preview.tsx`, using the same slug as the pitch, design doc, and spec. Do not write the spec until it exists. The spec must read it and carry its decisions into the implementation contract, and the ticket worker must read it before implementing any UI ticket. It is the approved visual contract for the pitch unless a later recorded Resolved Decision changes it, not throwaway inspiration.

`docs/previews` is excluded from type-checking, linting, formatting checks, and the production build, because a preview may reference components the application has not built yet. The Foundation pitch adds those exclusions. A preview is self-contained: inline mock data, no data-layer imports, no network requests.

A pitch with genuinely no UI surface records the UI design step as skipped and continues from the design doc to the spec. Do not renumber the pipeline steps.

### Operator tasks

Some work is done by the product's owner directly, not as an application feature or a pipeline run: applying a migration to production, and seeding a friend's plan from their written plan. Seeding is run interactively with a Claude Code prompt that uses the seeding example already in the repository. Any operator task that writes production data follows these rules:

- Name the target account explicitly, by email, and confirm the resolved account before writing anything. Never infer it.
- Do a dry run first that shows exactly what would be created and changes nothing.
- Create only. Never delete, overwrite, or merge into existing data in the account.
- Use one transaction, so a failure leaves nothing partial.
- Report exercises that cannot be matched to the library for a human decision. Do not guess or silently create them.
- The plan comes from the lifter's own written plan. An operator task never authors a program.
- Applying a schema migration to production is done by a human from a runbook, with a backup taken immediately before.

### User guidance: the tour and release notes

Once the onboarding tour and What's New exist, every pitch that ships a visible change ends with a guidance ticket, done with the `overload-onboarding` skill: add or update tour steps where the change warrants one, and add a release-note entry. The tour's step registry and the release-note format are set by the Onboarding Tour and What's New specs. Do not invent a second mechanism.

### Platform impact and plan placement

Once the iOS foundation exists, every UI-bearing pitch records its platform impact with the `overload-cross-platform` skill: shared web UI, native-specific work, or web-only (the admin area is web-only). Every pitch that adds a user-facing feature also states the capability that gates it: Free, or a named Pro capability.

## Autonomous Pipeline Policy

When a pitch is run unattended from a one-shot run prompt, the following governs every decision. It overrides any skill step that asks the user a question or waits for approval.

### Decide, don't ask

Resolve open questions yourself. Do not present options or end a turn with a question. Resolve in this order of authority:

1. The approved planning docs.
2. `CLAUDE.md` and the skills.
3. Existing patterns in the codebase.
4. Your own judgment, stated as a decision rather than a preference.

The interview and checkpoint steps inside the skills do not apply in an unattended run: the clarification step in `overload-design-doc`, the risky-data-model checkpoint in `overload-spec`, and the scope checkpoint in `overload-ticket-worker`. Resolve each by decision and record it.

Every resolved question is recorded in the spec under a `## Resolved Decisions` heading placed immediately before Open Questions, each with a one-line rationale and the authority it rests on. Open Questions then holds only what genuinely could not be decided, and each of those is also listed in the run report.

### The four things that stop a run

Halt, write the reason to the run report, and stop if any of these arise:

1. **An invariant would be weakened.** A `LoggedSet` written outside its module, or destroyed, altered, or detached from its exercise and gym. A hard delete of an `Exercise` or `Gym`, or a cascade on the logged chain. A stored progression tag or e1RM. A baseline correction outside its set's transaction or across gyms. A table without row-level security, or a policy that opens the Data API. Any read or write of owned data that is not scoped to the acting account, an account id taken from client input, or anything that lets one account see or detect another's data. Signup opened to the public before Public Accounts is verified, or any signup path that skips the invite gate while signup is invite-only. A secret in a client bundle. Any admin operation without a server-side admin check, or any admin view of an account's training content. A Pro result delivered to a Free account. Card data stored or logged.
2. **An approved planning doc would be contradicted.**
3. **Irreplaceable-data or credential scope.** Anything that could lose or alter any account's logged history beyond what the pitch names, that could expose one account's data to another, or that touches production data, production credentials, the Supabase service-role key, live Stripe keys, or any real charge.
4. **A destructive or irreversible operation not named in the pitch.** Hard deletes, dropping or renaming a table or column that holds data, `prisma migrate reset`, a forced schema push, force-pushes, or rewriting history.

Everything else: decide and continue.

Migrations are applied only to the Supabase dev project during a run. Applying anything to production, including a migration, any plan seeding, enabling public signup, switching Stripe to live mode, and any store release, is a step for a human.

### Verification honesty

Never report a check you did not run. A check that needs an iOS or Android build or a real device, which an unattended run cannot do, is reported as unverified. Never mark a ticket complete on a failing check. Per commit: lint, typecheck, format, unit tests. Per ticket: plus build. Per feature branch: the full suite. Do not skip, disable, weaken an assertion, or mark as expected failure.

### Survive context exhaustion

Maintain `docs/runs/<slug>-progress.md`, updated at every ticket boundary and step transition: current step, tickets with real identifiers, branch and PR for each, every Resolved Decision so far, anything deferred. Write it so a fresh session can resume from it.

### The run report

On completion or halt, write `docs/runs/<slug>-report.md`: what shipped, decisions made on the user's behalf, review findings and dispositions, deferrals, anything undecidable, verification results, near-misses, required upstream amendments, and, if halted, the stop condition and how to resume. Do not edit `docs/planning/` during a run, with one exception: `docs/planning/method-note.md`, which a run may create and extend to record constants a later pitch consumes.

### Merge behavior

The run prompt states it. If it is silent, stop before merge.

### Ticket identifiers

Never reference a ticket number that has not been created. Capture assigned identifiers into the progress file and work from that list.

## Consistency with the planning docs

- Feature names must match `docs/planning/prd.md` and `docs/planning/pitch-roadmap.md` exactly.
- Data objects must match `docs/planning/architecture.md`'s data model: `Mesocycle`, `Session`, `SessionExercise`, `Exercise`, `Gym`, `GymExerciseBaseline`, `LoggedSession`, `LoggedExercise`, `LoggedSet`, `Goal`, `CardioLog`, `Profile`, `TourProgress`, `ReleaseSeen`, and the objects the commercial pitches add (see the Architecture Doc).
- If a task seems to require contradicting an approved doc, or weakening the account-isolation or logged-history invariants, stop and flag it rather than silently diverging.
