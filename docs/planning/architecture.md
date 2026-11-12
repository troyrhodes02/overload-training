# Overload — Architecture Doc

## Tech Stack

**Next.js (App Router) + React + TypeScript** as the application framework, chosen for consistency with the established pattern across other projects, and because a server-first rendering model fits a CRUD-heavy, low-interactivity-complexity app well while keeping the API layer cleanly separable for the mobile app planned in a later phase.

**Supabase (Postgres, Auth, Storage)** as the backing platform. Postgres fits the relational shape of the data — mesocycles, sessions, exercises, logs, and gyms all relate to each other in ways a relational model represents directly, with no need for a document or specialized store. Supabase Auth removes the need to hand-roll authentication for what is a small set of ordinary email-and-password accounts. Supabase Storage holds three buckets: the public `exercise-images` bucket for the imported library images, and two private buckets, `feedback-screenshots` for screenshots attached to in-app feedback and `plan-import-sources` for files uploaded to plan import. The private buckets have no Storage policies and are reached only on the server with the service-role key.

**Prisma** as schema authority and data-access layer over Supabase Postgres, giving type-safe queries and a single source of truth for the schema as it evolves.

**Vercel** as the hosting target, chosen for its native fit with Next.js and zero-ops deployment.

**Recharts** for the progression charts (e1RM trend lines, goal progress visualization), consistent with charting choices made elsewhere and well suited to line-based trend data.

**Tailwind CSS with shadcn/ui** is the single component and styling system.

**Added for the commercial launch and in use.** **Stripe Billing** with hosted Checkout and the Customer Portal handles all money and card data, so Overload never touches card numbers and its payment-card compliance burden stays minimal. A **custom SMTP provider**, configured in Supabase Auth, carries account email (password recovery and email verification); the application itself sends no email. A **language-model API** (Anthropic), called from the server only, powers plan import.

**Planned.** **Expo with React Native** builds the iPhone app in the same repository as the web app, with EAS for builds and over-the-air updates. The planned layout is npm workspaces with `apps/web` (the current app, moved in slice 21a), `apps/mobile` (21d), and `packages/shared` (21b: contracts, pure training rules, validation, content, and tokens, with no dependency on `@prisma/client`, `next`, `react`, `@supabase/*`, or `server-only`). None of it exists yet. The mobile app talks only to a versioned mobile API. Slices 21a to 21l are defined in `docs/planning/mobile-roadmap.md`.

## Data Model

This section summarizes `prisma/schema.prisma`, which is the authority. All weights are pounds stored as `Decimal(6,2)` (above 0, at most 9,999.99, at most two decimal places); queries convert them to numbers before they leave the server.

**Ownership.** Every owned model below, including child models, carries a `userId` identifying the owning account, so any query can be scoped without a join and a test can assert that no owned table lacks it. Database triggers keep `userId` immutable and require every owned parent reference to have the same owner. The exception is the shared exercise library: library `Exercise` rows have no owner and are read-only to application code. Custom exercises carry the owning `userId`. A few tables are deliberately global and un-owned (marked below); they hold no training content.

**Training**

- **Profile** — one per account, keyed by the Supabase auth user id: first and last name, a unique lowercase `username`, the account's IANA `timeZone`, `appearance` (system, light, or dark), `status` (active or suspended), `lastActiveOn` (date only), `emailVerifiedAt`, `signupCampaign`, and the trial-notice stamps. Email and password live in Supabase Auth, not here.
- **Mesocycle** — name, `lengthWeeks`, `deloadEveryWeeks` (the scheduled-deload cadence: every Nth week is a deload week; stored in the column `deload_week`, default 5), `splitType` (ppl, arnold, bro, or custom), `status` (draft, active, or archived; at most one active per account), and `startDate`. Has many Sessions, PlannedCardio rows, LoggedSessions, MissedDayResolutions, and CardioLogs.
- **Session** — a named workout template (for example "Push Day 1") in a Mesocycle, with an optional `dayOfWeek` (unique per mesocycle) and a `position`. Has many SessionExercises. Deleting a Mesocycle cascades to its Sessions, but a Session referenced by a LoggedSession cannot be deleted.
- **SessionExercise** — an Exercise planned in a Session: `position`, `plannedSets`, and the target rep range (`targetRepMin`, `targetRepMax`; equal for a fixed target such as 3 × 10). Unique per (session, exercise).
- **Exercise** — name, `primaryMuscle`, `secondaryMuscles`, `equipmentType`, `imageRef` (null for custom exercises), `isCustom`, `sourceId` (the free-exercise-db id), owner (null for library rows), and `deletedAt` (soft delete). The deprecated `isFavorite` column is never read.
- **ExerciseFavorite** — an account's favorite exercises, keyed by (userId, exerciseId).
- **Gym** — name, optional free-text `address`, `deletedAt` (soft delete).
- **GymExerciseBaseline** — the current working-weight baseline (`weightLbs`) for one (gym, exercise), for gym-variable exercises only. Free-weight, plate-loaded, and bodyweight movements have none.
- **LoggedSession** — a workout actually done: the `mesocycleId` and `sessionId` it fulfills, `scheduledFor` (the occurrence date and, with `sessionId`, the retry key), `performedOn`, `status` (in_progress or complete), and `completedAt`. Has many LoggedExercises.
- **LoggedExercise** — the `exerciseId` performed, the `plannedExerciseId` and a snapshot of the plan (`plannedSets`, `targetRepMin`, `targetRepMax`), the live `sessionExerciseId` link (set to null if the template row goes away), `gymId`, `position`, and `skippedAt`. It carries no stored progress/hold/deload tag and no stored e1RM; both are computed on read. Has many LoggedSets.
- **LoggedSet** — `setNumber` (unique per logged exercise), `weightLbs` (null for a bodyweight set), `reps`, and optional `rir` (reps in reserve, 0 to 4). Written and edited only through `src/lib/logging/logged-sets.ts`, never deleted except by account deletion.
- **MissedDayResolution** — a missed planned day resolved as shifted or skipped: `missedOn` (unique per mesocycle), `outcome`, and the `sessionId` it was planned for.
- **Goal** — an Exercise, an optional `gymId`, `targetWeightLbs`, `targetReps`, `status` (active or archived), `archiveReason` (completed or manual), `archivedAt`, and `completionAcknowledgedAt`. At most one active goal per exercise per account.
- **PlannedCardio** — planned cardio on a mesocycle weekday: `type` and `durationMin`.
- **CardioLog** — cardio actually done for a `scheduledFor` date in a mesocycle: `type`, `durationMin`, `performedOn`, and a snapshot of the plan. No relationship to the progression system.

Every reference from the logged chain (LoggedSession, LoggedExercise, LoggedSet, MissedDayResolution, CardioLog, Goal, GymExerciseBaseline) to Exercise, Gym, Mesocycle, Session, or Profile uses `onDelete: Restrict`, so a buggy hard delete fails loudly.

**Account features**

- **TourProgress** — per account: when the onboarding tour was offered, and its outcome (finished or skipped) and when.
- **ReleaseSeen** — per account: the latest release-notes entry shown. The release notes themselves are repository content, not rows.
- **Feedback** and **FeedbackAttachment** — a message from a lifter to the owner (`category`, `message`, `handledAt`) and its screenshots (`objectPath` in the private `feedback-screenshots` bucket, `contentType`, `sizeBytes`, `position`).

**Plans and billing**

- **Entitlement** — Overload's own grants of Pro: `source` is `trial` or `comp` only, with `plan`, `startedAt`, `endsAt`, and for a comp the `compReason`, `compNote`, granting admin, and revocation fields. At most one trial and one active comp per account. There is no subscription source here.
- **BillingAccount** — per account: the Stripe customer id and a read-only mirror of the subscription (`subscriptionId`, `status`, `interval`, `priceId`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `graceEndsAt`, `promoCode`). Subscription access comes from this mirror.
- **PromoRedemption** — a promotion code redeemed by an account, written from Stripe events so the admin area can show redemptions.
- **WebhookEvent** (global) — the id and type of each Stripe event received, so a replay is recognized and changes nothing.

**Operating and abuse protection**

- **AdminAuditEntry** (global, no foreign keys) — an append-only record of an admin action: actor, target account, kind, detail, and time. It survives account deletion by design.
- **AuthThrottle** (global) — a fixed-window counter keyed by a SHA-256 hash of the throttle key, for the `signup` and `password_reset_request` actions. No personal data.
- **TrialClaim** (global) — the SHA-256 hash of a normalized email key and the account that claimed a trial, used only while `TRIAL_DEDUPE_ENABLED` is on. Never queried with the flag off.

**Plan import**

- **ImportSession** — one import: `status` (a 13-state lifecycle), `sourceKind`, the `draft` JSON and its `draftVersion`, model and token usage, a processing lease, `errorCode`, the `mesocycleId` it created on confirm, `expiresAt`, and `sourcesPurgedAt`. Has many ImportSourceParts.
- **ImportSourcePart** — one pasted text or uploaded file (`objectPath` in the private `plan-import-sources` bucket) in an import.
- **ImportUsageDay** — per account and day, the count of imports, for the daily limit.
- **ImportSpendLedger** (global) — reserved and actual model spend per month, for the global spend cap.

## Consistency & State

Within an account this is a single-writer system by design — one person, and in practice one active session at a time — so there's no concurrency or conflict-resolution concern to design for. Between accounts nothing is shared except the read-only exercise library, so isolation comes from scoping every query to the acting account, not from locking or coordination. All reads and writes go through standard request/response against Postgres; there's no need for real-time subscriptions, optimistic UI reconciliation across clients, or a sync layer, since offline support was explicitly ruled out as a requirement and the user logs later the same day rather than needing the app to function without connectivity.

The one piece of state that must behave correctly rather than just persist is the progress/hold/deload call on a LoggedExercise: it's derived, not authoritative, and must always reflect the LoggedSets underneath it — most notably after a past log is edited. The tag is not a value entered by the user, and it is never stored: it, and the e1RM trend, are computed on read as a pure function of the logged sets, the planned rep range, and the mesocycle week. No stored flag and no background job maintains them. Editing a past log therefore corrects every downstream tag and trend automatically, with no recompute path to forget. GymExerciseBaseline is the exception, since it holds per-gym state the logged sets alone cannot reconstruct.

Billing state is eventually consistent with Stripe. Webhooks can arrive late, twice, or out of order, so each event is recorded by id and applied idempotently. The Plan & Billing page also refetches the account's own subscription from Stripe on load and converges the mirror, so a missed webhook heals itself. An account's current entitlement is computed on read from its Entitlement rows and its BillingAccount mirror rather than from whichever event arrived last.

## Auth & Identity

Supabase Auth handles identity with email and password. There is no social login and no multi-factor authentication.

**Signup is open to everyone with no invite code.** The signup form collects first name, last name, username, email, and password. The server creates a confirmed user with the service-role key (Supabase's own public signup is off), establishes the profile, and starts a 14-day Pro trial. A server-only setting, `OVERLOAD_SIGNUP_MODE`, is `public` in operation; `closed` is the emergency stop that refuses every signup, and an unset or invalid value resolves to closed. The code still recognizes a legacy `invite` value, which is not used. Signup defenses, all on the server and all neutral in what they reveal: a bot challenge (Cloudflare Turnstile), a per-IP throttle (10 attempts a minute per hashed request fingerprint, stored in Postgres, failing closed), a global hourly cap on successful signups (default 30), reserved usernames, and a disposable-email-domain blocklist. One trial per person is built behind a flag that is off by default.

**Password recovery.** The lifter asks for a reset on `/forgot-password`. The request passes the bot challenge and the throttle and gets the same response whether or not the email has an account. Supabase Auth emails a link through the custom SMTP provider; `/auth/confirm` verifies it, and `/reset-password` accepts a new password only from a recovery auth session less than 30 minutes old, then signs out every auth session of the account.

**Email verification** is optional and required only before a first checkout. Settings sends a one-time link, and only the `/auth/confirm` route records the verification.

**Auth sessions.** All application routes except the public pages, login, signup, recovery, and the email-link landings require an authenticated session, managed through Supabase's session-cookie integration for Next.js. The proxy redirects optimistically, and `requireAccount()` is the authoritative check in every page and server action. The acting account is always taken from that session on the server, never from a request parameter, form field, or any client-supplied value. A suspended account is refused on every authenticated request except two data-rights surfaces, downloading its export and deleting its account, which a narrow guard allows and a static test pins. Web sign-out ends only the current browser's auth session.

**The mobile app (planned)** signs in, signs up, and requests a password reset natively; the reset itself completes on the web through the email link. It holds its tokens in secure device storage and sends them to the mobile API, which verifies each token with Supabase Auth's `getUser(token)` on a cookie-less anon client, never by local JWT checking, because the profile loader lazily recreates a missing profile and a locally valid token for a deleted account would recreate an orphan. The proxy exempts `/api/mobile`, so cookie-less requests are not redirected to the login page.

Because Prisma connects directly to Postgres, it bypasses row-level security, while Supabase also exposes every table through its public Data API reachable with the anon key. Row-level security is therefore enabled with no policies (deny-all) on every table, so Prisma is the only door into the data and the Data API is closed. Since row-level security is deny-all and not the isolation mechanism, separation between accounts is enforced by the application's account-scoped data access, which is why it has its own test suite.

## Authorization

There are no roles for lifters: every account has the same capabilities over its own data and none over anyone else's. Three mechanisms apply.

**Ownership.** Every read and write of owned data goes through a data-access layer that takes the acting account as a required argument, so a query that omits it cannot be written. Fetching a record that belongs to another account behaves exactly like fetching one that does not exist (not found, never forbidden). Library exercises are shared and read-only. Sharing, when built, works by copy: the recipient reviews and imports their own copy, so no account ever reads another account's data live. Operator tasks, such as applying a production migration or creating a friend's plan from a written document, are run by the owner directly against the database, always name the target account explicitly, and are not an application role.

**Admin.** One owner-only admin area. Admin identity comes from a server-side allowlist of auth user ids held in an environment variable. It is not a database role, nothing in the app can grant it, and every admin operation re-checks it on the server. A non-admin who reaches an admin route gets not-found. Admin code reads account metadata and aggregate counts only, through its own metrics layer, and never returns training content. Every admin mutation writes an append-only audit entry. Billing state shown to the admin is a read-only mirror of Stripe. The admin area is web-only.

**Plans and capabilities.** A plan grants named capabilities (`progression_insights`, `e1rm_trends`, `exercise_history_intelligence`, and `plan_import`; Free grants none and Pro grants all four), not permissions. Server code checks the capability, never the plan name, and a Free account never receives a Pro result: read gates null the Pro fields and set `locked`, and `requireCapability` guards plan import's writes. Pro access has three sources. Two are stored Entitlement rows, whose source is only trial (14 days) or comp. The third is the subscription, read from the BillingAccount mirror, which verified, idempotent Stripe webhooks maintain and the Plan & Billing page refreshes from Stripe. A comp carries a reason, an optional end date, and an audit entry, and never touches Stripe. Capture, history, and export are never gated.

## API Surface

The spine of the API, organized around the PRD's data objects:

- **Mesocycles** — create, read, update, clone-forward.
- **Sessions** — create/update within a mesocycle, duplicate onto another day.
- **Exercises** — search/filter by muscle group, create (custom), soft-delete.
- **Gyms** — create, read, soft-delete.
- **Logged sessions** — start or resume a workout (only for a session of the active block, on a date it schedules, today or earlier), read by date, mark it complete (idempotent), resolve a missed day (log late / shift / skip, validated against the schedule). A completed workout refuses new sets and swaps.
- **Logged sets** — create during active logging, edit after the fact. An edit changes only the stored values; the tag and e1RM are computed on read, so there is no recompute to trigger.
- **Progression** — read the current call and e1RM trend for a given exercise; this is a computed read, never a stored value, and its Pro fields are gated.
- **History** — all-time, one week at a time, across every block, back to the earliest logged workout or cardio. Free.
- **Goals** — create, read progress, archive.
- **Cardio logs** — create, read.
- **Accounts** — sign up (open, no invite code), log in and out, request a password reset and set a new password, send and confirm email verification, edit the profile, delete the account (canceling any Stripe subscription first), and export the account's data. A suspended account can still export and delete.
- **Admin** (web-only, admin allowlist) — list and look up accounts, suspend, reactivate, delete, grant and revoke comps, read aggregate metrics, read and handle feedback, read the audit log.
- **Billing** — create hosted Checkout and Customer Portal sessions, apply a promotion code at checkout, and receive Stripe webhooks through a signature-verifying route handler.
- **Plan import** — submit pasted text, receive a proposed plan, confirm or discard it.
- **Feedback** — submit feedback.
- **Mobile API (planned, slice 21c)** — versioned route handlers under `/api/mobile/v1` over the same business logic as the web, for the mobile app only. Each verifies the bearer token with `getUser(token)` and takes the account from it, goes through the scoped layer and the gated queries (never an ungated progression builder), returns `{ error: { code, message, details? } }` on failure with the existing error codes, and answers 426 `upgrade_required` when the `X-Overload-App-Version` header is below the minimum. Natural-key writes are retry-safe; create endpoints (goals, gyms, custom exercises, mesocycles, feedback) take an `Idempotency-Key` stored in a new owned table, and client-supplied primary keys are never accepted. A public app-config endpoint carries the minimum and latest app versions and kill switches. The app receives Pro calls from the API and never runs the engine. Changes within a version are backward compatible, and breaking changes need a new version. Web-only and not exposed to mobile: admin, billing and checkout, public pages, the plan builder, and plan import.
- **Tour and release notes** — read and record the account's tour progress and last-seen release.

## External Integrations

**Stripe** (Billing, hosted Checkout, Customer Portal) handles payments. Subscription state enters Overload through its verified webhooks and through the Plan & Billing page's refetch of the account's own subscription. The webhook endpoint is a route handler that verifies the signature and records each event by id, so a replay changes nothing. Deleting an account cancels its live subscriptions first and deletes nothing if that fails.

**Custom SMTP**, configured in each Supabase project's Auth settings, carries password recovery and email verification links. The application holds no SMTP credentials and sends no email itself.

**A language-model API**, called from the server only, powers plan import, with input limits, per-account limits, and a global spend cap.

**Apple and Google store policies** shape billing inside the mobile apps. On the US App Store a link out to web checkout must open in the external browser, other storefronts require in-app purchase, and Google Play has its own billing policy. Billing is therefore a platform-neutral entitlement system, and no purchase flow lives in a mobile app until each store's path is decided.

**free-exercise-db** (public domain exercise dataset with images) is imported once, at build/seed time, into the application's own database and storage rather than queried live — this removes any runtime dependency on an external service's uptime for a core feature.

No mapping/geocoding service is needed, since gym location is captured as a free-text name rather than a pinned geographic point in this version — that's explicitly deferred to the mobile, location-aware phase.

No health-data integration (Apple Health/HealthKit or otherwise) exists in this version. HealthKit specifically is only reachable from a native iOS app, not a website, so it's architecturally impossible for the web MVP regardless of preference — it becomes possible once a native or wrapped mobile app exists, and cardio's data model (type + duration) is deliberately minimal now to avoid rework when that door opens later.

## Environments & Deployment

There are three stages. Production is the `main` branch, deployed on Vercel and connected to the Production Supabase project. Permanent staging is the `staging` branch, connected exclusively to the `overload-dev` Supabase project and served from a stable Vercel Preview URL, and it is where features are developed, tested, and fixed. Feature branches start from `staging` and open PRs into it. Environment identity guards (OVE-111) stop development code from touching Production data. Local development runs against the same development project, with Prisma managing schema migrations across environments.

A feature reaches Production only through a release branch cut fresh from `main`, containing just the approved feature and its tested fixes, opened as a PR into `main` and never merged automatically. Production schema changes are applied by a human from a runbook with a fresh backup taken immediately before, and risky ones are rehearsed first on a restored copy in the development project. After a release, `main` is synchronized back into `staging`. The full rule is in `docs/pipeline/branching-and-release-workflow.md`.

Going commercial adds requirements. Production must run on hosting and database plans that allow commercial use and include backups (check the providers' current terms), with a tested restore. Stripe runs in test mode everywhere except production, and live mode is switched on only by a human. Mobile builds run on Expo's EAS service. A development build connects to staging and the friends' build connects to Production. Over-the-air updates use a `staging` channel for review and a `production` channel that only a human publishes to. An unattended run cannot verify anything on a device, so device checks are reported as unverified.

## Non-Functional Requirements

**Scale/performance** — modest. Low request volume at first, growing after a public launch; no capacity planning or query optimization work is warranted beyond normal competent practice.

**Responsiveness** — the web app must work well on a phone browser, since it will be used standing in a gym on a phone before the native mobile app exists. This isn't a "nice to have" — it's the actual primary usage context for the logging journey.

**Offline** — explicitly not required. The user has confirmed that logging later the same day is an acceptable fallback when connectivity is unavailable at a gym.

**Security/compliance** — account data is private: names, emails, and training history are personal data, scoped to their owner, never shown to another account, and never shared. The owner sees account metadata and aggregate counts, never training content. Card data never touches Overload because Stripe's hosted pages handle it. Open signup is protected by a bot challenge, a per-IP throttle, an hourly cap, reserved usernames, and a disposable-email blocklist, and plan import adds input limits, per-account limits, and a spend cap. Deleting an account must remove that account's data completely, and any account, including a suspended one, can export its data and delete itself.

## Biggest Technical Risk

There are now three risks. The first is tuning the gym-baseline auto-correction threshold — the logic that decides whether a logged weight at a given gym differs enough from that gym's current baseline to mean the equipment is genuinely different, versus being an off day, a form issue, or ordinary session-to-session noise. Set the threshold too sensitively and a single rough session corrupts a gym's baseline; set it too loosely and it never corrects when the equipment genuinely does differ. This is a judgment call that will likely need real usage data to tune correctly rather than being solvable analytically up front, and it's the one piece of this system without a well-established convention to lean on — unlike the progression engine, which draws on standard strength-training practice.

The second risk is account isolation. The application reaches the database through a connection that bypasses row-level security, so separation between accounts rests on every query being scoped to the acting account. One unscoped query would expose one lifter's data to another with no visible error. It is mitigated by a scoped data-access layer, a static check that nothing else queries owned tables, and a cross-account isolation suite that every pitch keeps green. The mobile API extends this surface, so every endpoint takes the account from the token and is covered by the suite. Old app versions in the wild also constrain API changes, so breaking changes need a new API version.

The third risk is billing and entitlement correctness, together with the admin boundary. Webhooks arrive late, twice, and out of order, a Free account must never receive a Pro result, and the owner's admin tools must never expose training content. These are mitigated by idempotent event handling, server-side capability checks, an aggregate-only admin metrics layer, an audit log, and tests for each.

## Open Questions

**Settled.** The progression constants, baseline margin, e1RM formula, test runner, and image bucket posture, the multi-user decisions (the ownership column, the scoped data-access layer, timezone handling, account deletion, the greeting, the tour, and What's New), and the commercial decisions (the admin allowlist, signup abuse protection, the email provider, the capability model, Stripe, plan import, and the public pages) were decided in their pitches' specs as Resolved Decisions. Read the specs and `docs/planning/method-note.md` for current values, not this document. Password recovery and email verification were built in Public Accounts.

**Still open.** Each must be decided in the controlling pitch or slice and recorded as a documented decision, not guessed by an implementing agent.

- Mobile app: the navigation and data-fetching libraries, the styling approach and chart library, secure token storage and refresh, the mobile bot challenge for native sign-up (the recommended default is the web challenge in a small web view for the beta, with Apple's App Attest evaluated before the public release), per-email and per-device signup limits behind carrier networks, and the beta gate. Decided in slices 21a to 21l, starting from `docs/planning/mobile-audit.md`.
- Launch readiness: error monitoring provider, the backup and restore drill, and the hosting and database plan changes.
- Store billing paths: how paid access works inside each app (US link-out in the external browser, in-app purchase, or sign-in only), decided in the store release pitches.
- Android equivalents: what replaces the Live Activity, and what Health Connect covers.
- Sharing: what a friend is, the share link or code mechanism, and revocation, decided in the sharing pitch's planning step.
- Wing-it workouts: how progression treats an exercise with no planned rep range (the default is history and e1RM only, with no tag).
- Advanced cardio and video attachments: each begins with a discovery step before any build.
