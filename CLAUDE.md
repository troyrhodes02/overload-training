# Overload — CLAUDE.md

Overload is a strength training tracker whose job is to tell each lifter, per lift and per session, whether to progress, hold, or deload, based on logged performance against a plan they built themselves. Signup is open to the public, with a free plan and a paid Pro plan. Every lifter has their own account, and no account can see, change, or learn anything about another account's data.

**Status.** MVP 1 to 4 are shipped: the training product, the multi-user conversion, the training-intelligence features, and the web commercial foundation (admin center, public accounts, plans and billing, the landing page, and plan import; Pitch 23, now Paid-Launch Safeguards, sits in MVP 6 and no longer gates the first web payment). MVP 5A is done: Workout Logging Refinements with its two chores, the read-only mobile codebase audit (`docs/planning/mobile-audit.md`), and the pre-mobile hardening that fixed the web defects the audit found (account and billing fixes, logging correctness, all-time history, and signup hardening). The next work is the React Native (Expo) iPhone app, built on the existing backend in slices 21a to 21l (`docs/planning/mobile-roadmap.md`). Slice 21a (Monorepo Move) made the repository an npm workspace with the web app in `apps/web`; none of the mobile app's code exists yet. Overload is operated by an individual, with a Free plan and a paid Pro plan. Signup is open to everyone with no invite code, and the closed signup mode stays only as an emergency stop. Web subscriptions through Stripe Checkout can go live before Paid-Launch Safeguards is complete; the owner switches Stripe to live mode and sets the production keys (`docs/planning/payments-go-live-checklist.md`). No purchase flow is added inside a mobile app until the store billing path is decided.

**Paths.** The repository is an npm workspace (Pitch 21a): `apps/web` is the Next.js app (`@overload/web`), `packages/shared` is `@overload/shared`, and `apps/mobile` is reserved for the Expo app. Every web path in this file (`src/…`, `prisma/…`, `scripts/…`, `tests/…`, `e2e/…`, `next.config.ts`, `.env.example`) is relative to `apps/web/`. `docs/`, `CLAUDE.md`, and the single `package-lock.json` stay at the repository root. Run commands from the root; each delegates to the workspace that owns it.

This file is persistent context for Claude Code. It encodes the non-obvious rules and invariants specific to this project. For product intent see `docs/planning/product-brief.md`; for features and acceptance criteria see `docs/planning/prd.md`; for technical decisions and rationale see `docs/planning/architecture.md`; for build sequencing see `docs/planning/pitch-roadmap.md`. This file is the "how we write code here" layer on top of those.

## Stack (ground truth)

- **Next.js (App Router), React, TypeScript** — the application framework. Server-first: pages are server components that read data directly. It is **not** a client-side SPA and has no REST layer for its own UI to call.
- **Supabase** — managed Postgres, Auth, and Storage. The Supabase client handles the auth session (via its Next.js cookie integration) and Storage. It is **not** the query layer for application data; that is Prisma. Supabase's auto-generated Data API is closed (see security invariants).
- **Email** — account email (password recovery and email verification links) is sent by Supabase Auth through a custom SMTP provider configured in each Supabase project (`supabase/config.toml` documents the block; local development uses Mailpit). The application itself sends no email and never holds the SMTP credentials. Do not add application-side email sending without a pitch that decides it.
- **Prisma** — schema authority, migrations, and the only path to application data. If a table exists, its shape is defined in `prisma/schema.prisma` and nowhere else.
- **Vercel** — hosting and deployment. Serverless: no process holds state between requests.
- **Recharts** — progression charts (e1RM trend lines, goal progress). Nothing else draws charts.
- **free-exercise-db** — public-domain exercise dataset, imported **once** by a Prisma seed script into the `Exercise` table and Supabase Storage. It is not queried at runtime. If it disappears tomorrow, nothing breaks.

- **Tailwind CSS with shadcn/ui** — the single component and styling system, with `lucide-react` icons. It owns layout, theming, and every UI primitive. It is **not** a license to mix in a second library: no Material UI, styled-components, CSS modules, or other component kit. Design rules for how it looks live in the `overload-ui-design` skill, not here.

Added by the commercial pitches and in use now: **Stripe** (Billing, hosted Checkout, and the Customer Portal; the only place money and card data live), the **custom SMTP provider** behind Supabase Auth email, and a **language-model API** (Anthropic, `src/lib/import/extraction/anthropic.ts`) called from the server for plan import only. Planned and not to be added before its slice: **Expo with React Native** for the iPhone app, in the same repository as the web app (slices 21a to 21l of Pitch 21; Android later).

Infrastructure Overload deliberately does **not** have, as decisions rather than omissions: no scheduler or cron job, no queue, no cache layer, no realtime subscriptions, no offline mode or sync layer (the lifter logs later if the gym has no signal), no maps or geocoding service (gym location is free text), no health-data integration (HealthKit is unreachable from a website), and no role system for lifters. The owner-only admin area is separate (see the admin boundary). An agent that does not know these were rejected will add them.

Do not add libraries or infrastructure not already decided in the Architecture Doc without flagging it first.

## The first invariant: every account's data is its own

**Account isolation outranks every other rule in this file.** A leak between accounts shows one person's training history, plan, and gyms to another, cannot be taken back, and produces no error. Prisma connects to Postgres in a way that bypasses row-level security, so the database does not protect accounts from each other. The application does, and only by scoping every query.

- **Ownership.** Every owned model, including child models, carries a `userId` for the owning account. Library `Exercise` rows are the one exception: they are shared, have no owner, and application code never writes to them. A custom exercise carries its owner's `userId`. Exercise reads return the shared library plus the acting account's own custom exercises.
- **Scoped access only.** Feature code reaches owned data only through the account-scoped client `account.db`, built by `createAccountClient` (`src/lib/data/account-db.ts`) over `scopeArgs` (`src/lib/data/scope.ts`), which ANDs the acting `userId` into every read and targeted write, stamps it onto every create, refuses nested writes, and keeps library `Exercise` rows read-only. Interactive transactions on it stay scoped. Lib functions take the acting `Account` (from `requireAccount()` in `src/lib/data/account.ts`), never a bare `userId`. The raw client in `src/lib/db.ts` is imported only inside `src/lib/data/` (the scoped layer, the admin metrics layer in `src/lib/data/admin/`, the billing webhook handler `src/lib/data/billing-webhook.ts`, and the operator entry `src/lib/data/operator.ts`) and by three sanctioned modules for un-owned tables (`src/lib/accounts/throttle.ts`, `src/lib/import/usage.ts`, `src/lib/import/spend.ts`). `tests/unit/account-isolation-guards.test.ts` and an ESLint rule enforce it. There is no CI service, so these guards protect anything only when the unit suite (`npm test`) runs, which this file requires on every commit.
- **Identity comes from the session.** The acting `userId` is read from the authenticated session on the server. It is never a request parameter, a form field, a URL segment, or anything else a client supplies. The one exception is a verified Stripe webhook, which resolves the account from the stored Stripe customer id, never from the payload alone. The planned mobile API takes it from a bearer token verified on the server (see the mobile app rules).
- **An id is not authorization.** Fetching or changing a record by id must also match the acting `userId`. A record owned by someone else is indistinguishable from one that does not exist: return not-found, never forbidden, and never an error that reveals it.
- **Uniqueness is per account.** Constraints such as one active goal per exercise include `userId`.
- **Deleting an account** is the single sanctioned way to destroy logged history. It is user-initiated, confirmed with the current password, handled by one module (`src/lib/accounts/deletion.ts`), and removes only that account's rows. It first cancels every live Stripe subscription on the account's customer; if that fails, or Stripe is not configured while the mirror shows a subscription, nothing is deleted. Then one transaction deletes every owned model in dependency order through the scoped client, then the account's Storage objects and auth identity. A suspended account can still delete itself (see the access model). Nothing else may bypass the history rules below.
- **Operator tasks** (applying the production migration, seeding a friend's plan) always name the target account explicitly and never infer it.

The cross-account isolation suite is the first standing check. It proves, for every owned model and every read and write path, that a second account cannot see, change, or detect the first account's data. Every later pitch keeps it green and extends it for any new owned model.

## The second invariant: logged sets are the only source of truth

**Together with account isolation, this is the most important rule in the codebase.** Everything the product tells the lifter (progress, hold, deload, e1RM trend, goal percentage) is derived from `LoggedSet` rows. If a logged set is lost, silently altered, or detached from the exercise and gym it was performed at, every conclusion built on it is wrong, and unlike a visible error, nobody can tell. A training history cannot be reconstructed after the fact. This outranks the gym-baseline invariant below; the baseline can be re-tuned from history, but history cannot be re-derived from the baseline.

Enforcement is layered, because neither layer is sufficient alone.

**Layer 1 — application (all feature code).** `LoggedSet` rows are written and edited only through `src/lib/logging/logged-sets.ts`. Nothing outside that module calls `prisma.loggedSet.create`, `.update`, or `.delete`. `Exercise` and `Gym` are never hard-deleted (the account-deletion module is the only exception); deletion sets `deletedAt` and removes the row from selection lists only. Queries that feed pickers filter `deletedAt: null`. Queries that render history must not filter it, or archived exercises vanish from the past.

**Layer 2 — database.** Foreign keys from `LoggedExercise` to `Exercise` and `Gym` use `onDelete: Restrict`, so even a buggy hard delete fails loudly rather than cascading history away. Row-level security is enabled on every table (see security invariants), so no path other than Prisma can write.

### Derived values are computed on read, never stored

The progress/hold/deload tag and the e1RM trend are pure functions of the logged sets, the planned rep range, and the mesocycle week. There is no `tag` column, no `e1rm` column, no cached "needs deload" flag, and no job that maintains them. Editing a past set therefore corrects every downstream tag and trend with no recompute path to forget. Do not add a stored copy "for performance"; the data per account is small. A stored copy is how history and conclusions drift apart.

`GymExerciseBaseline` is the one stored derived-ish value, because it holds per-gym state that logged sets alone cannot reconstruct. It is written only by the baseline-correction path described next.

### Gym baselines are isolated per gym and written atomically

Serverless functions can be retried, run concurrently, and cold-start on any request, and Postgres through Supabase's pooler cannot be assumed to give a function one long-lived connection. Therefore:

- Use the pooled connection string (`DATABASE_URL`) at runtime and the direct one (`DIRECT_URL`) only for migrations. Instantiate one `PrismaClient` per process in `src/lib/db.ts` and import it; never construct another.
- A logged set and any baseline correction it triggers happen in **one transaction**. A set that exists without its baseline update, or a baseline updated for a set that failed to save, is a correctness bug.
- The baseline is applied by `applyBaselineOnCompletion` (`src/lib/gyms/baselines.ts`) inside the set's transaction, once the set completes every planned working set of a gym-variable exercise at a gym. Editing a past set never replays the baseline; the stored baseline stays the latest value live logging established or corrected.
- A correction touches only the `(gymId, exerciseId)` row for the gym the set was logged at. It must never alter another gym's baseline, and it must never rewrite an existing `LoggedSet`.
- The first log of an exercise at a gym has no baseline to deviate from. It establishes the baseline and never counts as a correction.
- Free-weight, plate-loaded, and bodyweight exercises have no `GymExerciseBaseline` row. Whether an exercise is gym-variable is decided in exactly one function, `isGymVariable(exercise)` (`src/lib/exercises/gym-variable.ts`).

If you are ever unsure whether a code path keeps a set and its baseline update in the same transaction, treat it as a blocking issue, not a detail.

### Multi-step writes must be atomic

Logging a set, applying a baseline correction, and marking a `LoggedSession` complete are dependent writes. They succeed or fail together. Every write function takes the acting `Account`, runs on its scoped client, and accepts an optional scoped transaction so callers can compose; without one it opens its own with `account.db.$transaction`. This is the shape of the real code in `src/lib/logging/logged-sets.ts` (abridged; read the file before changing it):

```ts
// src/lib/logging/logged-sets.ts (abridged)
import { DomainError, isUniqueViolation, isUuid } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import type { AccountTx } from "@/lib/data/account-db";
import { applyBaselineOnCompletion } from "@/lib/gyms/baselines";

export type LogSetInput = {
  loggedExerciseId: string;
  setNumber: number;
  weightLbs?: number | null; // null or omitted = bodyweight, stored as NULL, never 0
  reps: number;
  rir?: number | null; // null or omitted = not recorded, never 0
};

export async function logSet(account: Account, input: LogSetInput, tx?: AccountTx) {
  if (tx) return logSetInTx(account, input, tx); // compose with the caller's transaction
  const run = () => account.db.$transaction((t) => logSetInTx(account, input, t));
  try {
    return await run();
  } catch (error) {
    // A concurrent duplicate submit lost the (loggedExerciseId, setNumber) key:
    // re-run so it answers exactly like a replay, never an internal_error.
    if (isUniqueViolation(error)) return run();
    throw error;
  }
}

async function logSetInTx(account: Account, input: LogSetInput, tx: AccountTx) {
  // Scoped read: another account's id is "not found", never "forbidden".
  const le = isUuid(input.loggedExerciseId)
    ? await tx.loggedExercise.findUnique({ where: { id: input.loggedExerciseId }, select: { /* ... */ } })
    : null;
  if (!le) throw new DomainError("not_found", "That exercise isn't part of this workout.");
  // A finished workout refuses new sets; past sets are corrected with editLoggedSet.
  if (le.loggedSession.status !== "in_progress") throw new DomainError("invalid_state_transition", "...");
  const weight = validateValues(le.exercise, input.weightLbs, input.reps, input.rir); // two-decimal, range, RIR checks
  // ...skipped exercise, set-number range, and identical-replay checks...

  // Invariant: the set is stored exactly as entered. No tag, no e1RM, no derived value.
  const created = await tx.loggedSet.create({
    data: { userId: account.userId, loggedExerciseId: input.loggedExerciseId, setNumber: input.setNumber, weightLbs: weight, reps: input.reps, rir: input.rir ?? null },
  });

  // Invariant: same transaction, scoped to this (gymId, exerciseId) only. A bodyweight set has no load to baseline.
  if (weight !== null) await applyBaselineOnCompletion(account, input.loggedExerciseId, tx);

  return created;
}
```

## Data access

**Application data is read and written through Prisma in server-side code. Never fetch application data with client-side `fetch()` or query the database from the browser.** This is the web app's rule, and the web stays server-first. The mobile app is a separate client that calls the versioned mobile API and nothing else (see the mobile app rules).

- Server components read through the account-scoped data-access layer, with the acting account resolved by `requireAccount()` from the Supabase session cookie. The auth check runs on every request, and the Prisma client in `src/lib/db.ts` is imported only by the modules the first invariant names.
- Mutations run through server actions that call the write modules (`src/lib/logging/logged-sets.ts` and its siblings), not raw client fetches and not ad hoc `prisma` calls inside components.
- Client components are interactive islands only: the exercise logging card (set entry), the swap picker, the missed-day prompt, the exercise library search and muscle-group filter, and the Recharts charts. They call server actions. They never touch the data store or hold credentials.
- The Supabase client is used for the auth session and Storage only. It must not be used to query or mutate application tables.

## Security invariants (non-negotiable)

### Access and registration model

Identity is Supabase Auth with email and password. There is no social login, no multi-factor authentication, and no role system for lifters.

**Signup is open to everyone with no invite code.** The signup form (first name, last name, username, email, password) calls `signUp` in `src/lib/accounts/signup.ts`, which creates a confirmed user with the service-role key (Supabase's own public signup is off). The mode is read only by `src/lib/accounts/signup-gate.ts` from `OVERLOAD_SIGNUP_MODE`: `public` is the operating mode, and `closed` is the emergency stop that refuses every signup. An unset or invalid value resolves to `closed`, so a misconfigured environment fails closed. The code still recognizes a legacy `invite` value with `OVERLOAD_INVITE_CODE`; it is not the operating mode and is not to be brought back without a pitch. The signup defenses all run on the server and refuse neutrally, never revealing another account, a list, or a limit:

- a bot challenge (Cloudflare Turnstile, `src/lib/accounts/turnstile.ts`);
- a per-IP throttle: 10 attempts a minute per hashed request fingerprint, stored in `AuthThrottle` and failing closed (`src/lib/accounts/throttle.ts`);
- a global hourly cap on successful signups (default 30, `OVERLOAD_SIGNUP_HOURLY_CAP`), counted from `Profile.createdAt`;
- reserved usernames, ignoring case and separators, including anything starting with `admin` or `overload` (`isReservedUsername` in `src/lib/accounts/signup-guards.ts`);
- a disposable-email-domain blocklist (`src/lib/accounts/disposable-domains.ts`).

A new account gets a 14-day Pro trial. One trial per person is built and off by default: with `TRIAL_DEDUPE_ENABLED=true`, a hashed, normalized email key in the un-owned `TrialClaim` table makes a repeat person's new account start on Free, and with the flag off that table is never queried.

**Password recovery.** From `/forgot-password`, `requestPasswordReset` (`src/lib/accounts/recovery.ts`) verifies the bot challenge, counts the attempt in the throttle, and gives the same response whether or not the email has an account. Supabase Auth emails a link through the SMTP provider. `/auth/confirm` verifies it, and `/reset-password` accepts a new password only from a recovery auth session less than 30 minutes old, then signs out every auth session of that account.

**Email verification** is optional and gates only the first checkout. Settings sends a one-time link. `Profile.emailVerifiedAt` is written only by `confirmEmailVerificationLink` (`src/lib/data/email-verification.ts`), called from the `/auth/confirm` route once the link verifies. No page writes it.

**Auth sessions and suspension.** Every route except the public pages, login, signup, recovery, and the email-link landings requires an authenticated session. `src/proxy.ts` redirects optimistically, and `requireAccount()` is the authoritative check in every page and server action. A suspended account is refused on every authenticated request and sent to `/suspended`, with one narrow exception: `requireAccountForDataRights()` (`src/lib/data/account.ts`) lets it download its export and delete its account, and `tests/unit/data-rights-guard.test.ts` pins that function's callers to the export route and the delete-account flow. Nothing else accepts a suspended account. Web sign-out ends only the current browser's auth session (`signOut({ scope: "local" })`); a password reset is the one flow that signs out everywhere.

Do not loosen the signup defenses, remove the closed mode, or add social login, a role system for lifters, or application-side email sending outside a pitch that scopes it.

### Row-level security: deny-all, Prisma is the only door

Prisma connects directly to Postgres and bypasses row-level security. Supabase also exposes every table through its public Data API, reachable with the anon key that ships to the browser. Therefore **RLS is enabled with no policies on every table**, so the Data API returns nothing. Every migration that creates a table must also enable RLS on it. A new table without RLS is publicly readable through the anon key; treat that as a blocking issue.

### Storage

Storage holds three buckets. `exercise-images` is public-read and holds the public-domain free-exercise-db images; custom exercises have no image. `feedback-screenshots` (screenshots attached to in-app feedback) and `plan-import-sources` (files uploaded for plan import) are private with no Storage policies, reached only on the server with the service-role key and read back through short-lived signed URLs. Deleting an account removes its objects. Do not add another kind of user-uploaded file without a pitch.

### Secrets

`DATABASE_URL`, `DIRECT_URL`, the Supabase service-role key, the signup mode, the Turnstile secret, the SMTP credentials (held by Supabase, never by the app), the Stripe secret and webhook signing keys, and the language-model API key are server-only and never appear in client bundles or in `NEXT_PUBLIC_` variables. Vercel preview deployments and local development point at the Supabase dev project, never at production.

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
- Pro access has three sources. Two are Overload's own `Entitlement` rows, whose stored `source` is only `trial` (14 days from signup, no card) or `comp`. The third is the subscription, read from the `BillingAccount` mirror of Stripe (active or trialing, canceling until the period ends, past due within the grace period). `computeEntitlement` (`src/lib/entitlements/resolve.ts`) combines them. The mirror is written from verified, idempotent Stripe webhooks (a replayed event changes nothing) and by a best-effort refetch of the account's own subscription when the Plan & Billing page loads (`src/lib/billing/sync.ts`), never from client input. Comp carries a reason, an optional end date, and an audit entry. It is not a role and never touches Stripe.
- Stripe is the only place money and card data live. Never store, log, or handle card numbers; use hosted Checkout and the Customer Portal. Runs use Stripe test mode only.
- Web subscriptions can go live before Paid-Launch Safeguards (Pitch 23) is complete. Going live is an owner step: the owner switches Stripe to live mode, sets the production keys, and turns on `STRIPE_BILLING_ENABLED`, following `docs/planning/payments-go-live-checklist.md`. A run never uses live keys, makes a real charge, or changes a Production environment variable. Inside the mobile app there is still no purchase flow until the App Store pitch decides the store billing path.
- Upgrade prompts are one quiet, dismissible note where a Pro feature would be. No countdowns, banners, or other dark patterns.

### Plan import (AI)

- The model call happens only on the server, never in the browser. In Production the provider stays disabled until the owner approves its activation.
- Input has a size limit. Each account has rate and daily limits tied to its entitlement, and there is a global spend cap with a kill switch.
- Pasted text is data, never instructions. Output is validated against a strict schema, and every extracted item must trace back to the pasted text. It never invents an exercise, set, or load.
- Exercises are matched to the library, and ambiguous or unmatched ones are shown for the lifter to decide. Nothing is saved until the lifter confirms, and the existing plan-creation path does the saving.
- It parses a plan the lifter wrote. It never generates a program or coaches.

### Mobile app (React Native + Expo)

None of the mobile code exists yet. It is built in slices 21a to 21l, defined in `docs/planning/mobile-roadmap.md`, which owns their order and scope; `docs/planning/mobile-audit.md` holds the facts they were planned from. The rules below bind every slice.

- **One repository, workspace layout.** npm workspaces with `apps/web` (the current Next.js app, moved there in 21a), `apps/mobile` (the Expo app, 21d), and `packages/shared` (21b: source-only TypeScript holding the API contracts and error shape, the pure training rules, validation parsers and limits, the Prisma enum tuples with a parity test against `Prisma.$Enums`, release-note and tour content, and design tokens). Since 21a the layout exists: `packages/shared` is empty and fenced, and `apps/mobile` holds only a README. The shared package never depends on `@prisma/client`, `next`, `react`, `@supabase/*`, or `server-only`, enforced by an ESLint rule (`packages/shared/eslint.config.mjs`) and by the root workspace check (`scripts/workspace-boundaries.mjs`, run by `npm test`), which also keeps Node-only packages out of the root and the shared package, server modules out of the mobile app, and one React runtime across the workspace (React lockstep: the mobile app pins the web's exact React, so its Expo SDK is chosen to match; see the 21a spec §10). Prisma, the scoped data layer, entitlement resolution, and gating stay in `apps/web`, and the mobile app never imports server modules. Moving the hosting root directory to `apps/web` is a human step.
- **One backend and one training model.** Never build a second progression engine or separate mobile training records. The mobile API wraps the same business logic the web uses, and the app receives Pro calls (recommendations, evidence, trends) from the API and never runs the engine itself.
- **The mobile API (21c).** Versioned route handlers under `/api/mobile/v1`. Every handler:
  - verifies the bearer token with `supabase.auth.getUser(token)` on a cookie-less anon client, never by local JWT checking, because the profile loader lazily recreates a missing profile and a locally valid token for a deleted account would recreate an orphan; it takes the acting account from the verified user, never from the request;
  - returns 401 `unauthorized` for a missing or invalid token and 403 `account_suspended` for a suspended account;
  - calls account-scoped lib functions and the gated queries, serializing the gated result as-is including `locked`, and never calls an ungated progression builder (`gatherRows`, `describeScope`, `getExerciseProgression`);
  - returns a 2xx status with JSON on success, and on failure a status with `{ error: { code, message, details? } }` using the existing error codes;
  - reads the `X-Overload-App-Version` header and answers 426 `upgrade_required` below the minimum supported version;
  - is safe to retry: natural-key writes (logging a set, starting a workout, logging cardio, absolute edits) already are, and create endpoints (goals, gyms, custom exercises, mesocycles, feedback) take an `Idempotency-Key` header stored in a new owned table with RLS, scope-layer coverage, and isolation-suite coverage. Never accept client-supplied primary keys.
- **The proxy exemption.** `src/proxy.ts` and `src/lib/auth-routes.ts` must exempt `/api/mobile`, or every cookie-less request is redirected to `/login`.
- **App config.** A public `GET /api/mobile/v1/app-config` returns the minimum and latest app versions and kill switches, so the server can force an update. Changes within an API version are backward compatible, because old app versions stay installed, and breaking changes need a new version. Every endpoint is covered by the cross-account isolation suite.
- **The mobile app talks only to that API**, apart from Supabase Auth for its own auth session. Never to Supabase tables. Tokens are held in secure device storage, and no secret ships in the app bundle.
- **Accounts on the phone.** Sign-in, sign-up, and the password-reset request are native (21d), with no invite code and the same server-side signup defenses; the mobile bot challenge is decided in 21d. The reset itself completes on the web through the email link.
- **Parity means equivalent capability, not identical screens.** Native screens use native patterns, designed with `overload-mobile-ui`. Web-only for now: the admin area, billing and checkout, public pages, the plan builder, and plan import.
- **Online-only.** No offline logging.
- **No purchase flow in the app** until the billing path for that store is decided, because store rules differ. A Pro note on the phone has no purchase link.
- **Review loop.** Development builds connect to staging, and the friends' build connects to Production. A run may publish an over-the-air update to the Expo `staging` channel if a staging-only token is configured. Publishing to the `production` channel, building for or submitting to TestFlight or a store, and anything that needs a real device are human steps. A check that needs a simulator or a real device is reported as unverified, never as passed.

## Business logic

### Progress, hold, and deload are computed, and the rep range comes from the plan

The rule is the same regardless of training phase: hit the top of the **planned rep range** for the required number of consecutive sessions and the lift is tagged progress; fall short consistently and it is tagged deload; anything else is hold, which renders with no tag at all. There is no "declared goal" or "training phase" object, and none should be added. A 3×5 bench and a 3×10 bench differ only in their planned rep range.

- The thresholds (consecutive sessions, misses before deload, weight increment) are named constants in `src/lib/progression/config.ts`, not magic numbers. Their current values and rationale are in `docs/planning/method-note.md` and the controlling specs.
- An exercise with insufficient history (first time performed) is never tagged progress or deload.
- The e1RM trend is the secondary stall-detector: if the rule says progress but e1RM has been flat across the recent window, flag it instead of blindly bumping weight.
- Goal progress and the e1RM trend use the **same** `estimateOneRepMax` function. A goal like 225×12 and a current best of 205×10 are both converted through it. Never write a second formula.

### Two deload systems that must stay separate

The **scheduled deload** is planned recovery on a cadence: `Mesocycle.deloadEveryWeeks` (stored in the column `deload_week`, default 5) makes every Nth week of the block (N, 2N, 3N, ...) a deload week that reduces load across the whole split, regardless of how any lift is doing (`isScheduledDeloadWeek` in `src/lib/progression/deload.ts`). It is not a single designated week. The **reactive deload** is a per-exercise call from the progression rule. They are independent. A valid state proving it: a lift can be tagged deload by the rule during week 2, while week 5 is a scheduled deload for everything, including lifts that never stalled.

During a scheduled deload week the reactive check is **suppressed entirely**. It resumes the moment the week ends. Because tags are computed on read, editing a past set changes the computed call for its week, and a week that was a scheduled deload stays suppressed.

### Today is per account

Every computation of "today", a weekday, or a time of day uses the account's stored timezone (an IANA name on its profile), not the server's and not the browser's alone. The greeting, the day's planned workout, and missed-day detection all depend on it.

### Planned versus logged, and the word "Session"

`Session` always means a planned workout template inside a `Mesocycle` (for example "Push Day 1"). `LoggedSession` is a record of a day actually trained. Never call the auth session a `Session`; say "auth session". Never write to a `Session` or `SessionExercise` while logging. Swapping an exercise mid-workout changes only that `LoggedExercise`; there is no path that saves a swap back to the template. The swap picker opens on the planned exercise's muscle group and can be switched to any group (Workout Logging Refinements superseded the same-muscle-only rule). A swap is refused once the exercise has a logged set.

**Workout state rules.** Starting a new workout (`startOrResumeWorkout`, `src/lib/logging/sessions.ts`) is accepted only for a session of the active block, on a date that block schedules it, today or earlier in the account's timezone; resuming an existing workout is never re-validated. A completed workout refuses new sets and swaps (`invalid_state_transition`); its past sets stay correctable through `editLoggedSet`. Finishing an already finished workout succeeds and changes nothing. Weights are pounds, above 0, at most 9,999.99, with at most two decimal places (`checkWeightLbs`, `src/lib/logging/weight.ts`), and a value with more places is refused rather than rounded by the database.

**History is all-time.** `getHistoryWeek` (`src/lib/logging/history-week.ts`) reads one week at a time, across every block, back to the earliest logged workout or cardio. Weeks are anchored on the active block's start weekday (Monday with no active block). It is Free.

### Missed days: three outcomes, shift is scoped to one week

An uncompleted prior day prompts three choices: log it late, shift, or skip. Log it late is starting the workout for the missed date. Shift moves the remaining days of the **current week** forward by one; the following week returns to the split's normal alignment. A shift must never compound across weeks. Shift and skip are stored as `MissedDayResolution` rows, one per missed day, so a resolved day never re-prompts. `resolveMissedDay` (`src/lib/logging/missed-days.ts`) validates at runtime that the outcome is shift or skip and that the date is a real past occurrence of the active block that is not logged, not dropped by an earlier shift, and not already resolved. Replaying the same outcome returns the existing resolution, and a different outcome is a conflict. On an active block, a session's weekday and the block's start date cannot be changed (that would turn trained weeks into missed days), and a session added to an active block counts from the day it was created.

### Goals

One active goal per exercise, as a weight and rep target, undated. Reaching 100% archives the goal and offers a new one. Goals are never deleted by progress.

### Cardio is a record, nothing more

A `CardioLog` stores type and duration, assigned to a split day. No tag, no trend, no progression logic ever attaches to cardio.

## Product boundaries (do not build these)

Permanent non-goals from the Brief. These are "never" for this product:

- **No program generation.** The lifter designs every split and mesocycle. The app tracks and adjusts load inside the plan; it never authors one.
- **No social network.** No feed, following, comments, messaging, or leaderboards, and no account ever reads another account's data live. Limited, user-initiated sharing is planned (a workout template shared by copy, and progress cards through the phone's share sheet). Until those pitches ship, none exists. A shared template arrives as a copy the recipient confirms and owns.
- **No social login.** Signup is open with email and password only.
- **No ads, ever.** The Free plan has no ads.
- **No AI coach.** AI is used only to parse a plan the lifter wrote (plan import). It never generates programs or coaches. A chat-style coach would be a separate, much later tier, and is not planned.
- **No dated goals and no rest timer.** Both were considered and decided against. A strength deadline can pressure someone to lift past what their readiness supports.
- **No progression analysis of cardio.**
- **No nutrition or body-composition features in this build.** Those are a deliberately separate, later build. Don't model them here, and don't preclude connecting to them later.

Deferred (planned in the roadmap; don't build unless a pitch calls for it, but don't preclude): the React Native iPhone app (Pitch 21 and its slices) and its TestFlight beta; workout logging refinements; wing-it workouts; the history calendar; friends and template sharing; shareable progress cards; gym location and notifications; Paid-Launch Safeguards and the store releases; Android; the Live Activity and Watch app; advanced cardio and video attachments (discovery first); body metrics; nutrition. Cardio stays type and duration until a pitch decides otherwise. A built-in social platform is future exploration, not planned.

## Testing

Focus tests where correctness matters most. Highest-value targets, in order:

1. **Cross-account isolation (adversarial, and first).** For every owned model and every read and write path, prove a second account cannot see, change, or detect the first account's data: by id, by list, by search, and through relations. Prove an owned-model query cannot be written outside the allowed modules, that another account's id returns not-found, that the acting account is never taken from client input, and that deleting an account removes only that account's rows.
2. **Logged history integrity (adversarial).** Prove that soft-deleting an `Exercise` or `Gym` leaves every historical `LoggedExercise` readable, that hard deletes of referenced rows are rejected by `onDelete: Restrict`, and that no code path outside `src/lib/logging/logged-sets.ts` writes a `LoggedSet`, and that a completed workout refuses new sets. Everything else is derived from it.
3. **Gym baseline isolation and atomicity.** A correction at Gym A never changes Gym B's baseline; the first log at a gym establishes rather than corrects; a failed set write leaves the baseline untouched.
4. **The progression engine.** Threshold boundaries, insufficient-history behavior, scheduled-deload suppression, the e1RM stall override, and that editing a past set changes the computed tag. Pure functions; test them as such.
5. **Missed-day handling.** Each of the three outcomes, shift scoped to one week, and no compounding across weeks or across consecutive misses.
6. **Auth, signup, and RLS.** Unauthenticated requests are redirected, the anon-key Data API returns nothing for every table, signup needs no invite code and the closed mode refuses every signup, each signup defense refuses neutrally, a recovery request gives the same response for a known and an unknown email, and a suspended account is refused everywhere except its export and account deletion.
7. **Admin authorization and its privacy boundary.** A non-admin cannot reach any admin page or operation, by URL or by calling a server action directly. Admin lists and metrics expose no training content. Every admin mutation writes an audit entry.
8. **Plans, entitlements, and billing.** A Free account never receives a Pro result, even by calling a server action directly. Webhooks are authenticated and idempotent, and replaying one changes nothing. Trial, subscription, and comp resolve correctly, and a downgrade deletes nothing.

Test the risky logic hard; lean tests or manual verification are fine for low-risk UI and plain CRUD (the exercise library, gym list, cardio log). The exceptions that are never lean are anything that scopes data to an account, anything that enforces a plan, anything behind the admin boundary, and anything that writes or deletes logged history.

## Docs layout

```text
docs/
├── planning/   product-brief, prd, architecture, pitch-roadmap, mobile-roadmap, mobile-audit, method-note, payments-go-live-checklist (cross-milestone)
├── pipeline/   branching workflow, promotion prompt, pipeline guide, run prompts
├── technical/  environment isolation, staging environment, development handoff
├── releases/   release records
├── marketing/
└── pitches/
    └── <milestone>/            e.g. mvp-4-web-commercial
        └── <NN-pitch-name>/    e.g. 17-admin-center-feedback
            ├── pitch.md        expanded pitch (supplied by the owner)
            ├── design.md       design doc
            ├── preview.tsx     UI preview (UI-bearing pitches)
            ├── spec.md         technical spec
            ├── runbook.md      what the owner does outside the codebase
            ├── sql/            runbook SQL, when needed
            └── assets/         preview assets, when needed
```

The milestone folder is the phase the pitch sits under in `docs/planning/pitch-roadmap.md` (its table lists each folder name). Small chores that need a runbook go in `chores/<ticket>-<name>/` inside the milestone folder. Keep everything for one pitch in its own folder.

## Branching and release workflow

Overload uses three stages. This is a permanent rule, and `docs/pipeline/branching-and-release-workflow.md` has the same text.

**Production (`main`).** Connected to the Production Supabase project. Contains only approved, released functionality. Never merge untested features directly into `main`. Production migrations, AI-provider activation, billing changes, and destructive operations require explicit owner approval.

**Permanent staging (`staging`).** Connected exclusively to the `overload-dev` Supabase project, with a stable Vercel Preview URL. It is for rapid development, testing, experimentation, and bug fixing. Routine development migrations and disposable test-data changes proceed using the existing environment identity guards (OVE-111). Staging is persistent: never delete or recreate it as part of normal feature delivery.

**Feature branches.** Branch from the latest `staging`. Open feature PRs targeting `staging`, never `main`. Merge completed implementation into `staging` for browser testing. Keep unfinished features out of Production. A run never merges a feature into `main`.

**Production promotion.** After the owner approves a feature on staging:

1. Create a fresh release branch from the latest `main`.
2. Transfer only the approved feature changes and their tested fixes, using carefully selected commits, cherry-picks, or an equivalent verified method.
3. Include required dependencies, database migrations, documentation, and feature flags.
4. Compare the release diff with the approved staging implementation, and verify no unrelated staging features or development-only behavior are included.
5. Run the applicable quality, security, and Production-readiness checks.
6. Open a release PR targeting `main`. Never merge or deploy it automatically.
7. Report the outstanding Production approvals and the exact owner actions.
8. After the Production release succeeds, synchronize `main` back into `staging` without overwriting unfinished work.

Never open a Production PR directly from `staging`. Never treat passing staging tests as approval for a Production migration, provider spending, or an external integration. Prisma migrations are ordered: if an approved migration cannot be transferred without an unapproved one, stop and report. The paste-ready promotion prompt is `docs/pipeline/production-promotion-prompt.md`. A release that includes the mobile API also needs a backward-compatibility check against the app versions in the wild, and the Expo production channel and store builds are human steps.

**Working style.** Complete safe development tasks autonomously, handle routine development migrations, testing, and staging integration without repeated dry runs and approvals, and stop only at genuine Production safety boundaries. Explanations are concise, with explicit commands, clear checkpoints, and no repetitive infrastructure verification.

## Workflow

1. Work against the current pitch. Keep changes scoped to that pitch's in-scope list; don't wander into a later pitch. A pitch's documents live together in its pitch folder (see Docs layout below).
2. Commit with descriptive messages referencing the Linear issue ID. The team key is `OVE`, for example `OVE-123`.
3. Push and open the PR with `gh pr create --base staging`, never against `main`. Merge into `staging` once the suite is green and verify in the browser on the staging URL, which runs against the `overload-dev` Supabase project.

Anything touching `LoggedSet` writes, deletion behavior, or baseline correction gets verified on staging with real-shaped data before it is promoted, because a bad Production deploy corrupts the only copy of a lifter's history. Anything touching ownership, scoping, authentication, or a production migration is also verified on staging with at least two accounts.

### UI-bearing pitches

A pitch is UI-bearing if it creates, changes, or materially specifies any screen, page, component, interaction, form, list, navigation, user-visible state, or responsive behavior. For every UI-bearing pitch the required artifact order is:

`pitch → design doc → UI preview → spec → tickets → implementation`

The UI preview is generated with `overload-ui-design` and saved as `preview.tsx` in the pitch folder, beside the pitch, design doc, and spec. Do not write the spec until it exists. The spec must read it and carry its decisions into the implementation contract, and the ticket worker must read it before implementing any UI ticket. It is the approved visual contract for the pitch unless a later recorded Resolved Decision changes it, not throwaway inspiration.

Preview files (`docs/pitches/**/preview.*`) are excluded from type-checking, linting, formatting checks, and the production build, because a preview may reference components the application has not built yet. A preview is self-contained: inline mock data, no data-layer imports, no network requests.

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

Every pitch that touches the UI states its client scope: web, mobile, or both. Once the mobile app exists, a pitch for both clients builds both in one run, using `overload-cross-platform` and `overload-mobile-ui`, and leaves both for review (staging for the web, the Expo staging channel for the phone). The admin area is web-only. Every pitch that adds a user-facing feature also states the capability that gates it: Free, or a named Pro capability.

## Autonomous Pipeline Policy

When a pitch is run unattended from a one-shot run prompt, the following governs every decision. It overrides any skill step that asks the user a question or waits for approval.

### Decide, don't ask

Resolve open questions yourself. Do not present options or end a turn with a question. Resolve in this order of authority:

1. The approved planning docs.
2. `CLAUDE.md` and the skills.
3. Existing patterns in the codebase.
4. Your own judgment, stated as a decision rather than a preference.

The interview and checkpoint steps inside the skills do not apply in an unattended run: the clarification step in `overload-design-doc`, the risky-data-model checkpoint in `overload-spec`, and the scope checkpoint in `overload-ticket-worker`. Resolve each by decision and record it.

Every resolved question is recorded in the spec under a `## Resolved Decisions` heading placed immediately before Open Questions, each with a one-line rationale and the authority it rests on. Open Questions then holds only what genuinely could not be decided, and each of those is also listed in the owner notes.

### The four things that stop a run

Halt, state the reason in the final message and the feature PR description, and stop if any of these arise:

1. **An invariant would be weakened.** A `LoggedSet` written outside its module, or destroyed, altered, or detached from its exercise and gym. A hard delete of an `Exercise` or `Gym`, or a cascade on the logged chain. A stored progression tag or e1RM. A baseline correction outside its set's transaction or across gyms. A table without row-level security, or a policy that opens the Data API. Any read or write of owned data that is not scoped to the acting account, an account id taken from client input, or anything that lets one account see or detect another's data. A signup path that skips the server-side signup defenses (bot challenge, throttle, hourly cap, reserved usernames, disposable-email blocklist) or the closed-mode stop, or that removes the closed mode. A secret in a client bundle. Any admin operation without a server-side admin check, or any admin view of an account's training content. A Pro result delivered to a Free account. Card data stored or logged.
2. **An approved planning doc would be contradicted.**
3. **Irreplaceable-data or credential scope.** Anything that could lose or alter any account's logged history beyond what the pitch names, that could expose one account's data to another, or that touches production data, production credentials, the Supabase service-role key, live Stripe keys, or any real charge.
4. **A destructive or irreversible operation not named in the pitch.** Hard deletes, dropping or renaming a table or column that holds data, `prisma migrate reset`, a forced schema push, force-pushes, or rewriting history.

Everything else: decide and continue.

Migrations are applied only to the Supabase dev project during a run. Applying anything to production, including a migration, any plan seeding, enabling public signup, switching Stripe to live mode, any store release, publishing to the Expo production channel, uploading a build to TestFlight, and merging or deploying a release PR into `main`, is a step for a human. Migrations during a run go to the `overload-dev` project and proceed without repeated dry runs.

### Verification honesty

Never report a check you did not run. A check that needs an iOS or Android build or a real device, which an unattended run cannot do, is reported as unverified. Never mark a ticket complete on a failing check. Per commit: lint, typecheck, format, unit tests. Per ticket: plus build. Per feature branch: the full suite. Do not skip, disable, weaken an assertion, or mark as expected failure.

### Survive context exhaustion

There is no progress file. The state of a run is recoverable from its artifacts: which of `design.md`, `preview.tsx`, and `spec.md` exist in the pitch folder, the Linear milestone and its issues with their statuses, the feature branch, and the ticket PRs already merged into it. The Resolved Decisions in the spec are binding. A fresh session reads those, finds the first incomplete step, and continues.

### Owner notes, not a run report

Do not write a run report. On completion or halt, update the feature PR description and print the same as the final message: decisions made on the owner's behalf, required upstream doc amendments, anything unverified or undecidable, and, if halted, the stop condition and how to resume. The only run document is the runbook (`runbook.md` in the pitch folder), covering what the owner must do outside the codebase. Do not edit `docs/planning/` during a run, with one exception: `docs/planning/method-note.md`, which a run may create and extend to record constants a later pitch consumes.

### Linear status

Keep Linear current without being asked. A ticket moves to In Progress when its work starts, to In Review when its PR opens, and to Done when its PR is merged into the feature branch. The Linear milestone and its issues are the run's progress record.

### Merge behavior

Feature PRs target `staging` and merge into `staging` once the suite is green. A run never merges into `main`. A run prompt may ask a run to leave its PR open instead.

### Ticket identifiers

Never reference a ticket number that has not been created. Use the identifiers Linear assigned to the milestone's issues.

## Consistency with the planning docs

- Feature names must match `docs/planning/prd.md` and `docs/planning/pitch-roadmap.md` exactly.
- Data objects must match `docs/planning/architecture.md`'s data model: `Mesocycle`, `Session`, `SessionExercise`, `Exercise`, `Gym`, `GymExerciseBaseline`, `LoggedSession`, `LoggedExercise`, `LoggedSet`, `Goal`, `CardioLog`, `Profile`, `TourProgress`, `ReleaseSeen`, and the objects the commercial pitches add (see the Architecture Doc).
- If a task seems to require contradicting an approved doc, or weakening the account-isolation or logged-history invariants, stop and flag it rather than silently diverging.