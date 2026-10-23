# Overload — Architecture Doc

## Tech Stack

**Next.js (App Router) + React + TypeScript** as the application framework, chosen for consistency with the established pattern across other projects, and because a server-first rendering model fits a CRUD-heavy, low-interactivity-complexity app well while keeping the API layer cleanly separable for the mobile app planned in a later phase.

**Supabase (Postgres, Auth, Storage)** as the backing platform. Postgres fits the relational shape of the data — mesocycles, sessions, exercises, logs, and gyms all relate to each other in ways a relational model represents directly, with no need for a document or specialized store. Supabase Auth removes the need to hand-roll authentication for what is a small set of ordinary email-and-password accounts. Supabase Storage holds the imported exercise library images.

**Prisma** as schema authority and data-access layer over Supabase Postgres, giving type-safe queries and a single source of truth for the schema as it evolves.

**Vercel** as the hosting target, chosen for its native fit with Next.js and zero-ops deployment.

**Recharts** for the progression charts (e1RM trend lines, goal progress visualization), consistent with charting choices made elsewhere and well suited to line-based trend data.

**Tailwind CSS with shadcn/ui** is the single component and styling system.

**Planned for the commercial launch.** **Stripe Billing** with hosted Checkout and the Customer Portal handles all money and card data, so Overload never touches card numbers and its payment-card compliance burden stays minimal. A **custom SMTP provider** (Resend is the recommended default) carries account email for password recovery. A **language-model API**, called from the server only, powers plan import. **Capacitor** wraps the web app in iOS and Android shells, with native capabilities behind platform-neutral adapters. Each is introduced by its own pitch and is not to be added earlier.

## Data Model

**Ownership.** Every owned model below, including child models, carries a `userId` identifying the owning account, so any query can be scoped without a join and a test can assert that no owned table lacks it. The one exception is the shared exercise library: library `Exercise` rows have no owner and are read-only to application code. Custom exercises carry the owning `userId`.

**Profile** — one per account, keyed by the Supabase auth user id: first name, last name, the account's timezone, an account status (active or suspended), and the date it was last active (date only). Email and password live in Supabase Auth, not here.

**Mesocycle** — name, length in weeks, deload week number, split type (preset identifier or custom), status (active/archived), start date. Has many Sessions.

**Session** — a named workout template (e.g., "Push Day 1") belonging to a Mesocycle, assigned to a day of the week. Has many SessionExercises (join to Exercise, carrying planned set count and target rep range, ordered).

**Exercise** — name, muscle group, equipment type, image reference (nullable for custom exercises), custom flag, owner (null for shared library rows), soft-delete flag. Referenced by SessionExercise, LoggedExercise, GymExerciseBaseline, and Goal.

**Gym** — name, free-text address, soft-delete flag. Has many GymExerciseBaseline entries.

**GymExerciseBaseline** — links a Gym and an Exercise to a current working-weight baseline, tracked independently per gym for machine-based exercises only; free-weight/plate movements don't need an entry here since they're assumed consistent everywhere.

**LoggedSession** — a record of a completed or in-progress day, referencing the Mesocycle/Session it fulfills, with a date and completion status. Has many LoggedExercises.

**LoggedExercise** — references the Exercise performed (and the Gym, where a baseline is relevant). It carries no stored progress/hold/deload tag and no stored e1RM; both are computed on read from its LoggedSets. Has many LoggedSets.

**LoggedSet** — weight and reps for a single set, editable after creation, with edits triggering a recompute of the parent LoggedExercise's tag.

**Goal** — references an Exercise, target weight, target rep count, status (active/archived), timestamps. Multiple can exist per account, at most one active per Exercise per account.

**CardioLog** — type and duration, referencing the day it was assigned/logged against. No relationship to the progression system.

**TourProgress** — per account: whether the onboarding tour was finished or skipped, and when.

**ReleaseSeen** — per account: the latest release-notes entry shown. The release notes themselves are repository content, not rows.

**Entitlement** — per account: the plan whose capabilities it has and its source (trial, subscription, or comp), start and end dates, and for a comp the reason and who granted it. An account's current entitlement is computed from these records.

**BillingAccount** — per account: the Stripe customer reference and a read-only mirror of its subscription state, written only from verified Stripe events.

**PromoRedemption** — a mirror of a promotion code being redeemed by an account, written from Stripe events, so the admin area can show redemptions.

**WebhookEvent** — the id and type of each Stripe event received, so a replay is recognized and changes nothing.

**Feedback** — a message from a lifter to the owner: category, text, date, and handled flag.

**AdminAuditEntry** — an append-only record of an admin action: who, what, which account, when.

**Plan import state** — a draft created by an import and held only until the lifter confirms or discards it, with a retention limit decided in the plan-import pitch, plus per-account usage counts for the import limits.

## Consistency & State

Within an account this is a single-writer system by design — one person, and in practice one active session at a time — so there's no concurrency or conflict-resolution concern to design for. Between accounts nothing is shared except the read-only exercise library, so isolation comes from scoping every query to the acting account, not from locking or coordination. All reads and writes go through standard request/response against Postgres; there's no need for real-time subscriptions, optimistic UI reconciliation across clients, or a sync layer, since offline support was explicitly ruled out as a requirement and the user logs later the same day rather than needing the app to function without connectivity.

The one piece of state that must behave correctly rather than just persist is the progress/hold/deload tag on a LoggedExercise: it's derived, not authoritative, and must always reflect the LoggedSets underneath it — most notably after a past log is edited. The tag is not a value entered by the user, and it is never stored: it, and the e1RM trend, are computed on read as a pure function of the logged sets, the planned rep range, and the mesocycle week. No stored flag and no background job maintains them. Editing a past log therefore corrects every downstream tag and trend automatically, with no recompute path to forget. GymExerciseBaseline is the exception, since it holds per-gym state the logged sets alone cannot reconstruct.

Billing state is eventually consistent with Stripe. Webhooks can arrive late, twice, or out of order, so each event is recorded by id and applied idempotently, and an account's current entitlement is computed from its records rather than from whichever event arrived last.

## Auth & Identity

Supabase Auth handles identity with email and password. Accounts are created through a signup form collecting first name, last name, email, and password. Signup is invite-only today: a valid invite code, checked on the server, is required, and a server-side setting switches signup to public once Public Accounts is verified. There is no social login and no multi-factor authentication. Password recovery does not exist today: it was deliberately left out to avoid a third-party email dependency, and Supabase's built-in email sender only reaches the project's own team and is capped at two messages an hour, so it is not an option for strangers. Public Accounts builds recovery over a custom SMTP provider, with the same response whether or not an email has an account, adds email verification before a first checkout, and adds abuse protection (rate limits and a bot challenge) on signup and recovery.

All application routes except login, signup, and (once built) recovery are gated behind an authenticated session, managed through Supabase's session-cookie integration for Next.js. The acting account is always taken from that session on the server, never from a request parameter, form field, or any client-supplied value. A suspended account is refused on every authenticated request.

Because Prisma connects directly to Postgres, it bypasses row-level security, while Supabase also exposes every table through its public Data API reachable with the anon key. Row-level security is therefore enabled with no policies (deny-all) on every table, so Prisma is the only door into the data and the Data API is closed. Since row-level security is deny-all and not the isolation mechanism, separation between accounts is enforced by the application's account-scoped data access, which is why it has its own test suite.

## Authorization

There are no roles for lifters: every account has the same capabilities over its own data and none over anyone else's. Three mechanisms apply.

**Ownership.** Every read and write of owned data goes through a data-access layer that takes the acting account as a required argument, so a query that omits it cannot be written. Fetching a record that belongs to another account behaves exactly like fetching one that does not exist (not found, never forbidden). Library exercises are shared and read-only. Operator tasks, such as applying a production migration or creating a friend's plan from a written document, are run by the owner directly against the database, always name the target account explicitly, and are not an application role.

**Admin.** One owner-only admin area. Admin identity comes from a server-side allowlist of auth user ids held in an environment variable. It is not a database role, nothing in the app can grant it, and every admin operation re-checks it on the server. A non-admin who reaches an admin route gets not-found. Admin code reads account metadata and aggregate counts only, through its own metrics layer, and never returns training content. Every admin mutation writes an append-only audit entry. Billing state shown to the admin is a read-only mirror of Stripe. The admin area is web-only.

**Plans and capabilities.** A plan grants named capabilities, not permissions. Server code checks the capability, never the plan name, and a Free account never receives a Pro result. Entitlements come from three sources: a 14-day trial and owner-granted comps, which are Overload's own state, and subscriptions, which come only from verified, idempotent Stripe webhooks. A comp carries a reason, an optional end date, and an audit entry, and never touches Stripe. Capture, history, and export are never gated.

## API Surface

The spine of the API, organized around the PRD's data objects:

- **Mesocycles** — create, read, update, clone-forward.
- **Sessions** — create/update within a mesocycle, duplicate onto another day.
- **Exercises** — search/filter by muscle group, create (custom), soft-delete.
- **Gyms** — create, read, soft-delete.
- **Logged sessions** — create/read by date, mark day complete, resolve a missed day (log late / shift / skip).
- **Logged sets** — create during active logging, edit after the fact (triggers recompute of the parent exercise's tag).
- **Progression** — read the current tag and e1RM trend for a given exercise; this is largely a computed read rather than a stored-and-fetched value.
- **Goals** — create, read progress, archive.
- **Cardio logs** — create, read.
- **Accounts** — sign up (invite-only today), log in and out, edit the profile, delete the account, and export the account's data. Password recovery is added by Public Accounts.
- **Admin** (web-only, admin allowlist) — list and look up accounts, suspend, reactivate, delete, grant and revoke comps, read aggregate metrics, read and handle feedback, read the audit log.
- **Billing** — create hosted Checkout and Customer Portal sessions, apply a promotion code at checkout, and receive Stripe webhooks through a signature-verifying route handler.
- **Plan import** — submit pasted text, receive a proposed plan, confirm or discard it.
- **Feedback** — submit feedback.
- **Tour and release notes** — read and record the account's tour progress and last-seen release.

## External Integrations

**Stripe** (Billing, hosted Checkout, Customer Portal) handles payments, and its webhooks are the one place subscription state enters Overload. The webhook endpoint is a route handler that verifies the signature and records each event by id, so a replay changes nothing.

**Custom SMTP** (Resend recommended) carries password recovery and account email from a verified domain, with separate sender identities for authentication and support mail.

**A language-model API**, called from the server only, powers plan import, with input limits, per-account limits, and a global spend cap.

**Apple and Google store policies** shape billing inside the app shells. On the US App Store a link out to web checkout must open in the external browser, other storefronts require in-app purchase, and Google Play has its own billing policy. Billing is therefore a platform-neutral entitlement system, and no purchase flow lives in an app shell until each store's path is decided.

**free-exercise-db** (public domain exercise dataset with images) is imported once, at build/seed time, into the application's own database and storage rather than queried live — this removes any runtime dependency on an external service's uptime for a core feature.

No mapping/geocoding service is needed, since gym location is captured as a free-text name rather than a pinned geographic point in this version — that's explicitly deferred to the mobile, location-aware phase.

No health-data integration (Apple Health/HealthKit or otherwise) exists in this version. HealthKit specifically is only reachable from a native iOS app, not a website, so it's architecturally impossible for the web MVP regardless of preference — it becomes possible once a native or wrapped mobile app exists, and cardio's data model (type + duration) is deliberately minimal now to avoid rework when that door opens later.

## Environments & Deployment

Local development runs against a separate Supabase development project, with Prisma managing schema migrations across both environments. Production is a single Vercel deployment connected to a production Supabase project, with no staging tier. Production schema changes are applied by a human from a runbook with a fresh backup taken immediately before, and risky ones are rehearsed first on a restored copy in the development project.

Going commercial adds requirements. Production must run on hosting and database plans that allow commercial use and include backups (check the providers' current terms), with a tested restore. Stripe runs in test mode everywhere except production, and live mode is switched on only by a human. Mobile builds (Xcode, Android Studio) cannot be verified by an unattended run, so device checks are reported as unverified.

## Non-Functional Requirements

**Scale/performance** — modest. Low request volume at first, growing after a public launch; no capacity planning or query optimization work is warranted beyond normal competent practice.

**Responsiveness** — the web app must work well on a phone browser, since it will be used standing in a gym on a phone before the native mobile app exists. This isn't a "nice to have" — it's the actual primary usage context for the logging journey.

**Offline** — explicitly not required. The user has confirmed that logging later the same day is an acceptable fallback when connectivity is unavailable at a gym.

**Security/compliance** — account data is private: names, emails, and training history are personal data, scoped to their owner, never shown to another account, and never shared. The owner sees account metadata and aggregate counts, never training content. Card data never touches Overload because Stripe's hosted pages handle it. Public signup adds rate limiting and abuse protection, and plan import adds input limits, per-account limits, and a spend cap. Deleting an account must remove that account's data completely, and any account can export its data.

## Biggest Technical Risk

There are now three risks. The first is tuning the gym-baseline auto-correction threshold — the logic that decides whether a logged weight at a given gym differs enough from that gym's current baseline to mean the equipment is genuinely different, versus being an off day, a form issue, or ordinary session-to-session noise. Set the threshold too sensitively and a single rough session corrupts a gym's baseline; set it too loosely and it never corrects when the equipment genuinely does differ. This is a judgment call that will likely need real usage data to tune correctly rather than being solvable analytically up front, and it's the one piece of this system without a well-established convention to lean on — unlike the progression engine, which draws on standard strength-training practice.

The second risk is account isolation. The application reaches the database through a connection that bypasses row-level security, so separation between accounts rests on every query being scoped to the acting account. One unscoped query would expose one lifter's data to another with no visible error. It is mitigated by a scoped data-access layer, a static check that nothing else queries owned tables, and a cross-account isolation suite that every pitch keeps green.

The third risk is billing and entitlement correctness, together with the admin boundary. Webhooks arrive late, twice, and out of order, a Free account must never receive a Pro result, and the owner's admin tools must never expose training content. These are mitigated by idempotent event handling, server-side capability checks, an aggregate-only admin metrics layer, an audit log, and tests for each.

## Open Questions

**Settled during MVP 1 to 3.** The progression constants, baseline margin, e1RM formula, test runner, and image bucket posture, and the multi-user decisions (the ownership column, the scoped data-access layer, timezone handling, the invite gate, account deletion, the greeting, the tour, and What's New) were decided in their pitches' specs as Resolved Decisions. Read the specs and `docs/planning/method-note.md` for current values, not this document.

**Correction.** Password recovery, and the email dependency it needs, were not built in the multi-user phase. They are scoped to Public Accounts.

**Open for the commercial launch.** Each must be decided in the controlling pitch and recorded as a documented decision, not guessed by an implementing agent.

- iOS: how Capacitor runs a server-rendered Next.js app (loading the hosted site in the shell, or another approach), decided by the feasibility step and proven on a real iPhone.
- Admin: where the allowlist lives and its format, the shape of the metrics layer and the static check that keeps it aggregate-only, and the rule for updating the last-active date (date only, at most once a day).
- Signup abuse protection (rate limits plus a bot challenge provider) and whether email verification is required before checkout (the default is yes).
- Email provider and sending domain (Resend recommended), and the sender identities for authentication versus support mail.
- The entitlement and capability model: capability names, the Free and Pro mapping (the roadmap proposes one), the data shape, and how a lapse or trial end is applied.
- Stripe: plans and prices, how the trial interacts with a repeating coupon, grace-period length, tax handling, and the webhook events handled.
- Plan import: model provider and its data terms, how long pasted text and drafts are kept, the usage limits and spend cap, and how the existing plan-seed format is reused as the structured intermediate.
- The public pages: route structure alongside the signed-in app, whether any analytics beyond first-party counts is used, and how release-note content is shared with the public changelog.
- Launch readiness: error monitoring provider, rate limiting, the backup and restore drill, and the hosting and database plan changes.
- Store billing paths: how paid access works inside each app (US link-out in the external browser, in-app purchase, or sign-in only), decided in the store release pitches.
- Android equivalents: what replaces the Live Activity, and what Health Connect covers.
