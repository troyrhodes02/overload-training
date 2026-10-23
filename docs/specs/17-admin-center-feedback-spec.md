---
version: 1.0.0
status: approved (autonomous pipeline run — Resolved Decisions recorded below)
author: Claude Code (autonomous pipeline, Pitch 17)
last_updated: 2026-10-22
pitch_reference: pitches/17-admin-center-feedback.md
design_reference: docs/design/17-admin-center-feedback-design-doc.md (v1.0)
preview_reference: docs/previews/17-admin-center-feedback-preview.tsx
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
linear_issue: see docs/runs/17-admin-center-feedback-progress.md
---

# Admin Center & Feedback — Technical Specification

## 1. Summary

Admin Center & Feedback gives the owner an owner-only, web-only area for operating Overload: aggregate operating metrics, an account directory, an account page with suspend and reactivate, a feedback inbox, and an append-only audit log. Every lifter also gets a feedback form. The admin area shows account metadata and aggregate counts only and never returns any account's training content.

The core abstraction is **a second, narrower door into the database**. Feature code reaches owned data only through the account-scoped client (`account.db`), which intersects every query with the acting account. This pitch adds an **admin client** (`src/lib/data/admin/db.ts`): the shared Prisma client wrapped in a query extension that runs every operation through a pure `adminArgs(model, operation, args)` gate. That gate permits exactly the metadata fields and aggregate shapes the admin boundary allows, and throws on anything else, including any read of a training model other than "which accounts have at least one row". Admin identity is a server-only allowlist of auth user ids, checked fresh by `requireAdmin()` on every admin page and action. A non-admin gets `notFound()`.

Two account-lifecycle rules ride on the existing per-request chokepoint, `requireAccount()`. It refuses a **suspended** account on every authenticated request, including a session that signed in before the suspension, by redirecting to `/suspended`. It also stamps a **date-only last-active** value at most once per calendar day. "Working" means:

- a non-admin can reach no admin page or action by any path;
- suspending an account blocks its very next request, and reactivating it restores access with nothing else changed;
- the metrics equal controlled fixture counts, and no admin response carries a training string or number;
- a lifter's feedback reaches the inbox and can be marked handled;
- every admin mutation commits together with its audit entry, or not at all.

## 2. Problem

- The app cannot yet tell the owner how many accounts exist, how many are in use, or whether new signups come back. Today that takes hand-run SQL against production, the only copy of everyone's history.
- The app cannot yet stop an account. There is no account status, so the only lever is deleting the identity in Supabase, which destroys the account.
- The app cannot yet receive feedback. Lifters have no in-product channel.
- The app cannot yet show who did what as operator. There is no audit record, and the Plans, Billing & Promo Codes comp controls depend on one.
- Public Accounts, Plans, Billing & Promo Codes, and Launch Readiness all depend on this pitch's account status, audit log, and feedback (roadmap dependency graph).

## 3. Scope and non-scope

### In scope

1. Admin identity: `OVERLOAD_ADMIN_USER_IDS` allowlist, `isAdminUserId`, `requireAdmin()`, and not-found for non-admins on every admin page and server action.
2. Admin shell and navigation (`/admin/**`) and the admin-only ⋮ menu item.
3. Overview: six aggregate counts and signup-cohort return rates, through the admin metrics layer.
4. Account directory (search, status filter, pagination) and the account page (permitted metadata only).
5. Suspend and reactivate, each atomic with its audit entry, enforced on the next authenticated request.
6. `Profile.lastActiveOn` (date only), updated at most once per account per calendar day.
7. Lifter feedback (`/feedback`): category + message, a daily cap, Free on every plan.
8. Feedback inbox and item: read, filter, recategorize, mark handled, reopen, each audited.
9. Append-only `AdminAuditEntry` with a database trigger that rejects UPDATE and DELETE, and an audit log page.
10. `/suspended` notice page.
11. Static and runtime guards for the admin boundary, plus extensions of the standing isolation, RLS, and deletion suites.
12. User guidance (final ticket, `overload-onboarding`).

### Out of scope

- **Administrative account deletion.** Halted under stop condition 2 (R7). No delete control, no deletion code path, no change to `deleteAccount`'s authority.
- Plan and entitlement display, comps, promo codes, Stripe. Plans, Billing & Promo Codes adds the plan column to the directory and a plan fact to the account page. No placeholder column is drawn now.
- Public signup, the signup switch, password recovery, email/SMTP. Untouched.
- Replies to feedback, threads, notes, assignment, ticketing, email.
- Impersonation, "view as", or any read of an account's training content by admin code.
- Pageview, clickstream, or presence tracking; any third-party analytics.
- Native admin screens (web-only).

## 4. Core concepts

| Concept | Description |
| ------- | ----------- |
| **Admin** | An authenticated account whose auth user id is in `OVERLOAD_ADMIN_USER_IDS`. Not stored anywhere in the database, not grantable in the app, re-checked on every admin request. |
| **Admin client** | `createAdminClient()`: the shared Prisma client, extended so every operation passes through `adminArgs`. The only door admin code has to the database. |
| **Admin metrics layer** | `src/lib/data/admin/metrics.ts`: computes the Overview DTO from Profile metadata plus "accounts with ≥1 Mesocycle" and "accounts with ≥1 LoggedSet". Returns numbers only. |
| `Profile.status` | `active` (default) or `suspended`. Changed only by the admin suspend and reactivate operations. |
| `Profile.lastActiveOn` | A calendar date (`@db.Date`) in the account's own timezone: the last day the account made an authenticated request while active. `NULL` until the first request after this ships. |
| `Feedback` | An owned row: one message from one lifter to the owner. Category, message, `createdAt`, `handledAt` (`NULL` means open). |
| `AdminAuditEntry` | An admin-only row (no owner): who (`actorUserId`), what (`kind` + optional `detail`), which account (`targetUserId`), when (`createdAt`), and for feedback actions the `feedbackId`. Append-only. |
| **Signup date** | `Profile.createdAt` rendered as a calendar date in the account's own timezone. |
| **Reference day / month** | "Today" and "this month" for the Overview, in the acting admin's timezone (`accountToday(admin)`). |

## 5. States and lifecycle

```text
Profile.status: active | suspended
Feedback: open (handledAt NULL) | handled (handledAt set)
AdminAuditEntry: created, never updated or deleted
```

| From | To | Allowed? | Side effects (one transaction) |
| ---- | -- | -------- | ------------------------------ |
| `active` | `suspended` | admin only, target not on the allowlist | `Profile.status` updated; audit `account_suspend`. Training data untouched. Next authenticated request of the target → `/suspended` |
| `suspended` | `active` | admin only | `Profile.status` updated; audit `account_reactivate`. Nothing else changes |
| `suspended` | `suspended` (repeat) | no-op | no write, no audit; returns `{ changed: false }` |
| open | handled | admin only | `handledAt = now()`; audit `feedback_handled` |
| handled | open | admin only | `handledAt = NULL`; audit `feedback_reopened` |
| category A | category B (A ≠ B) | admin only | `category = B`; audit `feedback_recategorized` with `detail {from, to}` |
| any audit row | changed / removed | **never** | trigger raises; the app has no update/delete path |

Suspension of an allowlisted account is refused (`invalid_state_transition`, "Admin accounts can't be suspended here."), which also prevents an owner from locking themself out.

## 6. Admin boundary (the heart of the pitch)

### 6.1 Identity — `src/lib/data/admin/identity.ts` (`server-only`)

```ts
/** Parses OVERLOAD_ADMIN_USER_IDS: comma/whitespace separated UUIDs, lowercased. Invalid entries are ignored; unset or empty → nobody is admin (fail closed). Read on every call, never cached. */
export function adminUserIds(env = process.env): ReadonlySet<string>;
export function isAdminUserId(userId: string, env = process.env): boolean;

export type AdminActor = { readonly userId: string; readonly timeZone: string; readonly name: string };

/** requireAccount() (auth + suspension + last-active), then the allowlist. Not an admin → notFound(). */
export const requireAdmin: () => Promise<AdminActor>; // React cache() per request
```

- Called at the top of `src/app/admin/layout.tsx`, of **every** admin `page.tsx` and its `generateMetadata`, and of **every** admin server action, before any argument is read.
- A signed-out caller is redirected to `/login` by `requireAccount()`, exactly like any other protected route. That reveals nothing.
- The variable is server-only. It is added to `scripts/check-client-bundle.mjs`'s forbidden tokens, and its value never reaches a client component. The shell receives only a boolean `isAdmin`.

### 6.2 The admin client — `src/lib/data/admin/db.ts` and the pure gate `src/lib/data/admin/gate.ts`

`adminArgs(model, operation, args)` is pure and unit-tested like `scopeArgs`. Rules:

| Model | Operations permitted | Field rule |
| ----- | -------------------- | ---------- |
| `Profile` | `findMany`, `findUnique`, `count`, `updateMany` | reads **must** carry `select` ⊆ `PROFILE_ADMIN_FIELDS` = {userId, firstName, lastName, username, timeZone, status, lastActiveOn, createdAt}; `updateMany.data` keys ⊆ {status}; `where`/`orderBy` keys ⊆ the same fields (+ AND/OR/NOT) |
| `TourProgress` | `findMany` | `select` ⊆ {userId, outcome} |
| `Feedback` | `findMany`, `findUnique`, `count`, `updateMany` | `select` ⊆ {id, userId, category, message, createdAt, handledAt}; `updateMany.data` ⊆ {category, handledAt} |
| `AdminAuditEntry` | `create`, `findMany`, `count` | create data ⊆ {actorUserId, kind, targetUserId, feedbackId, detail}; `select` ⊆ all its columns |
| `Mesocycle`, `LoggedSet` | `groupBy` only | `by` must equal `["userId"]`; no `where`, `having`, `_count`, `_sum`, `_avg`, `_min`, `_max`, `orderBy` other than userId. The result is a list of account ids: "has ≥1 row" |
| every other model | — | refused (`AdminScopeError`) |

Global rules: `include` is refused; a `select` value must be `true` (no relation traversal); `$queryRaw*`/`$executeRaw*` are not exposed (guard test); `$transaction` (interactive) keeps the gate.

The gate is the runtime proof. The static guards (§14.5) prove that admin code has no other door.

### 6.3 Read and write modules — `src/lib/data/admin/*.ts` (`server-only`, all take an `AdminActor`)

| Module | Exports | Notes |
| ------ | ------- | ----- |
| `metrics.ts` | `getAdminOverview(actor)` → `AdminOverviewDto` | §9 |
| `accounts.ts` | `listAccounts(actor, {q, status, page})`, `getAdminAccount(actor, id)`, `suspendAccount(actor, id)`, `reactivateAccount(actor, id)` | emails via the auth facade (§6.4) |
| `feedback.ts` | `listFeedback(actor, filters)`, `getFeedbackItem(actor, id)`, `setFeedbackHandled(actor, id, handled)`, `setFeedbackCategory(actor, id, category)` | |
| `audit.ts` | `listAudit(actor, {account, page})`, internal `recordAudit(tx, entry)` | `recordAudit` takes the transaction client only, so an audit write is always inside the mutation's transaction |

The accepting argument is `actor: AdminActor`, which only `requireAdmin()` produces. A module function cannot be called without having passed the check (a guard test keeps `AdminActor` construction inside `identity.ts`).

### 6.4 Emails — the auth-admin facade

Emails live in Supabase Auth. `src/lib/supabase/admin.ts` gains exactly one read operation:

```ts
/** Every auth user's id and email (paginated listUsers, perPage 1000, at most 20 pages). Read-only. */
export async function listAuthUserEmails(): Promise<Map<string, string>>;
```

Only `src/lib/data/admin/accounts.ts` and `feedback.ts` import it; the facade guard test is updated to that list. If the call fails, the directory renders with "—" and the design doc's quiet Alert (`emailsAvailable: false`). Search by email then matches nothing, and search by name and username still works.

### 6.5 Privacy boundary, stated as contract

No admin DTO has a field that can hold training content. The DTOs in §13 are exhaustive. The integration "sentinel" test (§14.3) seeds every training model with unique marker strings and numbers. It then asserts that the JSON of every admin read (overview, directory, account page, inbox, item, audit) contains none of them.

## 7. Suspension and last-active — `src/lib/data/account.ts` (changed)

`resolveAccount(userId)` already reads the profile on every request. It now selects `status` and `lastActiveOn` too and returns them to `requireAccount()` (the `Account` type gains no new public field):

```ts
export const requireAccount = cache(async (): Promise<Account> => {
  const user = await requireUser();
  const { account, status, lastActiveOn } = await resolveAccountState(user.id);
  if (status === "suspended") redirect("/suspended");
  await touchLastActive(account, lastActiveOn); // best effort, never throws
  return account;
});
```

- **Next-request enforcement.** Every authenticated page renders under `(app)/layout.tsx` or `admin/layout.tsx`, and both call `requireAccount()`. Every server action calls `requireAccount()` (or `requireAdmin()`) first. So the first request after suspension, whether a page load, a client navigation, or an action, reads the new status and is refused. No session cache exists to go stale. Exempt by design: `signOutAction` (uses `requireUser`, so a suspended lifter can sign out) and `/suspended` itself.
- **Inside a server action**, `redirect("/suspended")` performs a client navigation, and the action's write never runs.
- **Last-active rule.** `today = accountToday(account)`. If `lastActiveOn` is `NULL` or earlier than `today`, run `db.profile.updateMany({ where: { userId, OR: [{ lastActiveOn: null }, { lastActiveOn: { lt: today } }] }, data: { lastActiveOn: today } })`. The condition makes it at most one write per account per local day and race-safe. A failure is logged by error name only and never blocks the request. A suspended request does not touch it.
- `/suspended` (`src/app/suspended/page.tsx`, outside both shells) uses `getAccessState()` (new, data layer: `"signed_out" | "active" | "suspended"`, from the session). Signed out → `/login`. Active → `/`. Suspended → the notice with a Sign out form.

## 8. Data model

### Relationship to existing schema

| From | Relation | To | Description |
| ---- | -------- | -- | ----------- |
| `Feedback.userId` | many-to-one, `onDelete: Restrict` | `Profile.userId` | owned row; deleted by the account-deletion module with the rest of the account |
| `AdminAuditEntry.actorUserId` | none (plain uuid) | auth user | no FK, so audit rows never block account deletion and survive it |
| `AdminAuditEntry.targetUserId` | none (plain uuid) | auth user | same; rendered "Deleted account" once the profile is gone |
| `AdminAuditEntry.feedbackId` | none (plain uuid, nullable) | `Feedback.id` | same |

### New and updated models

```prisma
/// Admin Center & Feedback: whether the account may use Overload. Changed only by
/// the admin suspend/reactivate operations; enforced by requireAccount() on
/// every authenticated request.
enum AccountStatus {
  active
  suspended
}

model Profile {
  // … existing fields …
  status       AccountStatus @default(active)
  /// The last calendar day (account's own timezone) the account made an
  /// authenticated request while active. Date only; written at most once a day.
  lastActiveOn DateTime?     @map("last_active_on") @db.Date

  feedback     Feedback[]
}

enum FeedbackCategory {
  bug
  idea
  question
  other
}

/// A message a lifter chose to send to the owner. Owned by the sender.
model Feedback {
  id        String           @id @default(uuid()) @db.Uuid
  userId    String           @map("user_id") @db.Uuid
  category  FeedbackCategory
  /// Trimmed, 1–2000 characters (CHECK). Plain text; never rendered as HTML.
  message   String
  /// NULL = open. Set by the admin "Mark handled", cleared by "Reopen".
  handledAt DateTime?        @map("handled_at") @db.Timestamptz
  createdAt DateTime         @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime         @updatedAt @map("updated_at") @db.Timestamptz

  profile Profile @relation(fields: [userId], references: [userId], onDelete: Restrict, onUpdate: Restrict)

  @@index([userId, createdAt])
  @@index([handledAt, createdAt])
  @@map("feedback")
}

enum AdminAuditAction {
  account_suspend
  account_reactivate
  feedback_handled
  feedback_reopened
  feedback_recategorized
}

/// Append-only record of an admin action (Architecture: AdminAuditEntry).
/// Admin-only: no owner column, unreachable through the account-scoped client,
/// and a trigger rejects UPDATE and DELETE.
model AdminAuditEntry {
  id           String           @id @default(uuid()) @db.Uuid
  actorUserId  String           @map("actor_user_id") @db.Uuid
  /// "kind", not "action": that word is reserved by the no-stored-recommendation guard.
  kind         AdminAuditAction
  targetUserId String           @map("target_user_id") @db.Uuid
  feedbackId   String?          @map("feedback_id") @db.Uuid
  /// Only for feedback_recategorized: {"from": category, "to": category}.
  detail       Json?
  createdAt    DateTime         @default(now()) @map("created_at") @db.Timestamptz

  @@index([createdAt])
  @@index([targetUserId, createdAt])
  @@index([feedbackId])
  @@map("admin_audit_entries")
}
```

### Migration `prisma/migrations/9g_admin_center_feedback/migration.sql` (additive, ASCII only)

- `ALTER TABLE "profiles" ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'active', ADD COLUMN "last_active_on" DATE;`. Every existing account becomes active with no last-active date, and no row is otherwise written.
- `CREATE TABLE "feedback"` with FK to `profiles` (RESTRICT/RESTRICT) and `CHECK (char_length(btrim("message")) BETWEEN 1 AND 2000)`. The `overload_user_id_immutable` trigger is attached.
- `CREATE TABLE "admin_audit_entries"` and `CHECK (("kind" = 'feedback_recategorized') = ("detail" IS NOT NULL))` and a matching CHECK that exactly the feedback kinds carry `feedback_id`.
- `CREATE FUNCTION "overload_reject_change"() RETURNS trigger` (raises `'admin_audit_entries is append-only'`), with `REVOKE ALL … FROM PUBLIC, anon, authenticated` following the existing role-guarded pattern. Also `CREATE TRIGGER … BEFORE UPDATE OR DELETE ON "admin_audit_entries" FOR EACH ROW`.
- RLS on both new tables, no policies:

```sql
ALTER TABLE "feedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_audit_entries" ENABLE ROW LEVEL SECURITY;
-- Deny-all. Do not add policies for anon or authenticated.
```

No table or column is dropped or renamed. Rollback: the app's previous deploy ignores the new columns and tables. Dropping them is a human decision (runbook).

### Classification changes (deliberate, extended, not weakened)

- `src/lib/data/scope.ts` gains `ADMIN_ONLY_MODELS = ["AdminAuditEntry"]`. `unclassifiedModels()` excludes it. `scopeArgs` still throws for it (it has no owner column), so `account.db.adminAuditEntry.*` is a programming error.
- `Feedback` is an owned model. It joins `ACCOUNT_DELETION_ORDER` before `Profile` and `ISOLATION_COVERAGE` (new `isolation/feedback.int.test.ts`). Adding a newly owned model to the deletion order is required by "removes that account's data completely". It does not expand who can start a deletion.
- `tests/integration/support/db.ts` `APP_TABLES` gains `feedback` and `admin_audit_entries` (TRUNCATE does not fire the row trigger).

### Derived fields

| Field / concept | Stored? | Computed from | Notes |
| --------------- | ------- | ------------- | ----- |
| Overview counts and cohort rates | no | Profile metadata + `groupBy userId` on Mesocycle / LoggedSet | computed on every Overview load |
| "Suspended since" | no | latest `account_suspend` audit row for the account | |
| "Handled … by …" | no | `handledAt` + latest `feedback_handled` audit row | |
| Feedback count per account | no | `count` of Feedback for that userId | metadata about messages, not training |

## 9. Metrics definitions — `getAdminOverview(actor)`

Let `T` = `accountToday(actor)` (admin's timezone). `M1` = the first day of `T`'s month. For each profile `p`, `signup(p)` = `p.createdAt` as a date in `p.timeZone`, and `seen(p)` = `p.lastActiveOn`.

| Metric | Definition |
| ------ | ---------- |
| `registered` | count of profiles (any status) |
| `suspended` | profiles with `status = suspended` |
| `active7` | profiles with `seen ≥ T − 6 days` |
| `active30` | profiles with `seen ≥ T − 29 days` |
| `newThisMonth` | profiles with `signup ≥ M1` |
| `withPlan` | profiles whose userId appears in `Mesocycle groupBy userId` (any status, drafts included) |
| `loggedWorkout` | profiles whose userId appears in `LoggedSet groupBy userId` |
| percentages | `round(100 × n / registered)`; `registered = 0` → `null` (rendered "—") |
| cohorts | six rows: the month of `T` and the five before. Row month = `signup(p)`'s year-month. `signedUp` = members. `cameBack` = members with `seen > signup(p)`. `active30` = members with `seen ≥ T − 29`. Rates against `signedUp`; `signedUp = 0` → nulls |

Accepted limitations, stated in the UI footnote (R12):

- `lastActiveOn` keeps only the latest day. "Came back" therefore means "active on some later day", and it is permanent once true.
- Tracking starts at deploy, so pre-existing accounts read "Not seen" until their next visit.
- `seen` is in each account's own timezone, while `T` is the admin's, so window edges are exact to the day only within one timezone.
- Accounts created by the ownership backfill carry the backfill time as their signup date.

## 10. UI integration

The preview (`docs/previews/17-admin-center-feedback-preview.tsx`) is binding. Its hierarchy, controls, states, and copy are implemented as drawn. Departures are recorded as Resolved Decisions.

### 10.1 Routes

| Route | File | Data | Actions |
| ----- | ---- | ---- | ------- |
| `/admin` | `src/app/admin/page.tsx` | `getAdminOverview` | — |
| `/admin/accounts` | `src/app/admin/accounts/page.tsx` | `listAccounts` (`q`, `status`, `page` from `searchParams`, validated; bad values → defaults) | — |
| `/admin/accounts/[id]` | `…/[id]/page.tsx` | `getAdminAccount` (invalid uuid / missing → `notFound()`) | `suspendAccountAction`, `reactivateAccountAction` |
| `/admin/feedback` | `src/app/admin/feedback/page.tsx` | `listFeedback` (`view`, `category`, `account`, `page`) | — |
| `/admin/feedback/[id]` | `…/[id]/page.tsx` | `getFeedbackItem` | `setFeedbackHandledAction`, `setFeedbackCategoryAction` |
| `/admin/audit` | `src/app/admin/audit/page.tsx` | `listAudit` (`account`, `page`) | — |
| `/feedback` | `src/app/(app)/feedback/page.tsx` | — | `submitFeedbackAction` |
| `/suspended` | `src/app/suspended/page.tsx` | `getAccessState` | `signOutAction` (existing) |

`src/app/admin/layout.tsx`: `export const instant = false`. It calls `requireAdmin()`, reads the account appearance, and renders `AdminShell` with `Toaster` and `AppearanceSync`, without the tour provider and without What's New. `generateMetadata` awaits `requireAdmin()` and returns `"Admin · Overload"`. Pages have no static `metadata`, so a not-found response never carries an admin title.

### 10.2 Components

| Component | Path | Kind | Contract |
| --------- | ---- | ---- | -------- |
| `AdminShell`, `AdminNav` | `src/components/admin/admin-shell.tsx`, `admin-nav.tsx` | server + client island (active link via `usePathname`) | as preview |
| `MetricTile`, `CohortTable` | `src/components/admin/overview.tsx` | server | `AdminOverviewDto` |
| `AccountDirectory` | `src/components/admin/account-directory.tsx` | server (GET form) | `AdminAccountListDto`; phone rows `md:hidden`, table `hidden md:table` |
| `AccountStatusBadge` | `src/components/admin/account-status-badge.tsx` | server | `status` |
| `AccessSection` | `src/components/admin/access-section.tsx` | client island | `{ target: {id, label, email, status, isAdmin} }` → AlertDialog → action, toasts |
| `AuditList` | `src/components/admin/audit-list.tsx` | server | `AuditLineDto[]`; phone list, md table |
| `FeedbackInbox`, `FeedbackItemView`, `FeedbackItemControls` | `src/components/admin/feedback-*.tsx` | server + client island for controls | DTOs §13 |
| `FeedbackForm` | `src/components/feedback/feedback-form.tsx` | client island (`useActionState`) | as preview incl. success state |
| `Textarea` | `src/components/ui/textarea.tsx` | stock shadcn/ui | |
| `AccountMenu` | changed: `isAdmin` prop; + "Send feedback" | client | the Admin item only when `isAdmin` |
| `SECONDARY_NAV_ITEMS` | + `{ href: "/feedback", label: "Send feedback", icon: MessageSquare }` | | |

The phone/desktop split uses Tailwind breakpoints (the preview's `desktop` prop stands for `md:`). The admin content column is `max-w-4xl`. The lifter `/feedback` page stays in the 640px shell.

### 10.3 Forms and validation

| Form | Field | Type | Required | Validation |
| ---- | ----- | ---- | -------- | ---------- |
| Feedback | `category` | radio | yes | one of `bug, idea, question, other` → "Choose what it's about." |
| Feedback | `message` | textarea | yes | trimmed length 1–2000 → "Write a message." / "Keep it under 2,000 characters." |
| Directory search | `q` | text | no | trimmed, ≤ 100 chars, else ignored |
| Category change | `category` | select | yes | enum |

### 10.4 User guidance

Decided in the final ticket by `overload-onboarding`. Proposed (design doc §13): no new tour step, and a significant release note "Send feedback from Overload" dated the production day. The tour and What's New never mention the admin area.

### 10.5 Plan placement and platform

`submitFeedback` is **Free**: no capability check, and no upgrade note. Admin is not a plan capability (allowlist only). Platform: web-only admin. Feedback and suspended are shared web UI. `overload-cross-platform` is dormant (iOS foundation not shipped).

## 11. Server actions

All return `ActionResult<T>` (`src/lib/actions/result.ts`). Admin actions live in `src/app/admin/**/actions.ts`. They call `requireAdmin()` as their first statement and only then read `FormData` or arguments. A non-admin caller gets `notFound()` thrown before any input is parsed.

```ts
// src/app/(app)/feedback/actions.ts
type SubmitFeedbackState =
  | { status: "idle" | "sent" }
  | { status: "error"; fieldErrors?: { category?: string; message?: string }; formError?: "failed" | "limit"; draft: { category: string; message: string } };
submitFeedbackAction(prev: SubmitFeedbackState, formData: FormData): Promise<SubmitFeedbackState>
// requireAccount() → submitFeedback(account, raw) → account.db.feedback.create (stamped userId).
// Cap: FEEDBACK_DAILY_LIMIT = 10 per account per rolling 24h (count via account.db) → formError "limit".

// src/app/admin/accounts/[id]/actions.ts
suspendAccountAction(targetId: string): Promise<ActionResult<{ changed: boolean; status: "suspended" }>>
reactivateAccountAction(targetId: string): Promise<ActionResult<{ changed: boolean; status: "active" }>>
// targetId: uuid, else not_found. Missing profile → not_found. Allowlisted target (suspend) → invalid_state_transition.
// One adminDb.$transaction: conditional updateMany (status flip) → if count = 1, recordAudit(tx, …).
// revalidatePath of the account page, directory, overview, audit.

// src/app/admin/feedback/[id]/actions.ts
setFeedbackHandledAction(feedbackId: string, handled: boolean): Promise<ActionResult<{ changed: boolean }>>
setFeedbackCategoryAction(feedbackId: string, category: string): Promise<ActionResult<{ changed: boolean }>>
// Conditional updateMany (handledAt null ↔ set / category ≠ new) + recordAudit in one transaction; repeat → changed:false, no audit.
```

Errors: `validation_error`, `not_found`, `invalid_state_transition`, `internal_error` ("Couldn't change the account. Nothing changed."). Raw Prisma errors are never returned. Logs carry error names only, never names, emails, or messages (personal data).

## 12. Validation rules

| Field | Validation | Error |
| ----- | ---------- | ----- |
| `targetId`, `feedbackId`, `[id]` params | `isUuid` | `not_found` (indistinguishable from a missing row) |
| `category` | enum `bug \| idea \| question \| other` | `validation_error` |
| `message` | string; trimmed 1–2000; DB CHECK backs it | `validation_error` |
| `handled` | boolean | `validation_error` |
| `page` | integer ≥ 1, else 1 | — (coerced) |
| `status` / `view` filters | known value, else default | — (coerced) |
| `OVERLOAD_ADMIN_USER_IDS` entries | UUID, else ignored | — |

## 13. UI data contracts

```ts
type AdminOverviewDto = {
  timeZone: string;               // the admin's
  registered: number; suspended: number;
  active7: number; active30: number; newThisMonth: number; withPlan: number; loggedWorkout: number;
  pct: { active7: number | null; active30: number | null; withPlan: number | null; loggedWorkout: number | null };
  monthStart: string;             // "YYYY-MM-DD"
  cohorts: { month: string /* "YYYY-MM" */; signedUp: number; cameBack: number | null; cameBackPct: number | null; active30: number | null; active30Pct: number | null }[]; // 6, newest first
};

type AdminAccountRowDto = {
  id: string; firstName: string; lastName: string; username: string | null; email: string | null;
  status: "active" | "suspended"; isAdmin: boolean;
  signupOn: string;               // "YYYY-MM-DD", account tz
  lastActiveOn: string | null;
  tour: "finished" | "skipped" | "not_yet";
};
type AdminAccountListDto = { rows: AdminAccountRowDto[]; total: number; page: number; pageCount: number; emailsAvailable: boolean };

type AdminAccountDto = AdminAccountRowDto & {
  timeZone: string; suspendedSince: string | null /* "YYYY-MM-DD" */; feedbackCount: number; audit: AuditLineDto[] /* ≤ 10 */;
};

type AuditLineDto = {
  id: string; at: string /* ISO */; actorName: string; action: AdminAuditAction;
  detail: { from: FeedbackCategory; to: FeedbackCategory } | null;
  target: { id: string; label: string | null /* null = deleted */ }; feedbackId: string | null;
};

type FeedbackRowDto = { id: string; category: FeedbackCategory; message: string; createdAt: string; handledAt: string | null; sender: { id: string; label: string | null; email: string | null } };
type FeedbackItemDto = FeedbackRowDto & { senderUsername: string | null; history: AuditLineDto[] };
```

`FeedbackRowDto.message` is the full message; the list truncates with CSS `line-clamp-2`. Fields are exhaustive: nothing else is added to an admin DTO without amending this spec.

## 14. Testing strategy

### 14.1 Unit (jest)

- **`admin-identity.test.ts`**: parsing (commas, whitespace, case, invalid entries dropped, unset → empty set); `isAdminUserId`; `requireAdmin` calls `notFound` for a non-admin (mocked `requireAccount`) and returns an actor for an admin; it reads the env on every call.
- **`admin-gate.test.ts`**: for every model × operation, `adminArgs` accepts exactly the table in §6.2 and throws `AdminScopeError` otherwise. Covers: an extra Profile field (e.g. `appearance`), any `include`, a nested relation `select`, `Mesocycle.findMany`, `LoggedSet.groupBy` with `_sum` or `where`, `Gym` anything, `AdminAuditEntry.update` / `delete` / `deleteMany`, and `Feedback.updateMany` touching `message`.
- **`admin-metrics.test.ts`** (pure core `computeOverview(profiles, planIds, loggedIds, today)`): window boundaries (T−6 in, T−7 out; T−29 in, T−30 out), month start, `registered = 0` → null percentages, cohort assignment by account tz across a month edge, `cameBack` strictly later (same day = no), "—" months, suspended counted in registered.
- **`last-active.test.ts`**: `touchLastActive` writes only when `NULL` or earlier, never for suspended, swallows errors.
- **`feedback-validation.test.ts`**: category enum, trim, 0 / 1 / 2000 / 2001 chars.
- **`admin-guards.test.ts`** (static, §14.5).
- **UI** (`admin-ui.test.tsx`, `feedback-form.test.tsx`): the menu renders Admin only with `isAdmin`; Send feedback is always present; the AccessSection dialog names the account; admin-protected shows no button; the feedback form shows inline errors, keeps the draft on error, and shows the success state.
- Updated: `account-scope.test.ts` (`ADMIN_ONLY_MODELS`, Feedback owned), `accounts-deletion.test.ts` (order includes Feedback), the `src/lib/supabase/admin.ts` importer guard, and `check-client-bundle` tokens.

### 14.2 Integration (embedded Postgres)

- **Suspension** (`admin-accounts.int.test.ts`): suspend → `Profile.status` suspended + exactly one audit row (actor, action, target, createdAt). Repeat → `changed:false`, still one row. Reactivate → active + second row. Allowlisted target → refused, no row. Unknown or malformed id → not_found, no row. **Atomicity**: with `recordAudit` forced to throw (a test-only failing tx stub), status is unchanged. **Training untouched**: row counts of every training table equal before and after suspend and reactivate.
- **Append-only**: raw `UPDATE` and `DELETE` on `admin_audit_entries` raise. The admin client refuses update and delete.
- **Last-active**: first `resolveAccountState`-driven touch sets today; a second the same day issues no write (updatedAt unchanged); the next day advances; a suspended account is not touched.
- **Metrics** (`admin-metrics.int.test.ts`): controlled fixture of 7 accounts (mixed tz, signup months, last-active dates, statuses, one with a draft mesocycle only, one with sets, one with an in-progress session and no sets) → exact DTO equality.
- **Feedback** (`feedback.int.test.ts`): submit stores trimmed message with the acting userId; the 11th in 24h → limit; handled, reopen, and recategorize each write one audit row; repeats write none.
- **Privacy sentinel** (`admin-privacy.int.test.ts`): seed every training model (mesocycle "SENTINEL-MESO", session, exercise "SENTINEL-LIFT", gym "SENTINEL-GYM" + address, logged sets 987.5 × 13, goal 912.5, cardio "SENTINEL-CARDIO", planned cardio) for two accounts. Then `JSON.stringify` of every admin read DTO contains no sentinel string and no `987.5` / `912.5`.
- **Isolation** (`isolation/feedback.int.test.ts`): account B cannot read, count, update, or detect A's feedback through `account.db`. A feedback id from A looks missing to B. Account deletion removes A's feedback and not B's. `account.db.adminAuditEntry` throws.
- **Deletion** (`isolation/account-deletion.int.test.ts`, extended): deleting an account that has feedback and audit entries succeeds; its feedback is gone; audit rows remain (no FK).
- **RLS** (`rls.int.test.ts`, unchanged code): passes with the two new tables (RLS on, zero policies, anon sees nothing). The new function is not executable by anon (added to the function check).

### 14.3 E2E (Playwright, local Supabase stack — `e2e/accounts/admin-center.spec.ts`)

The web server runs with `OVERLOAD_ADMIN_USER_IDS` set to the admin test user's id. That user is created by the suite's setup with a fixed id through the auth admin API, or the id is resolved and written to the server env before start (implementation's choice, documented in the ticket).

1. **Non-admin URL**: a signed-in lifter visiting `/admin`, `/admin/accounts`, `/admin/accounts/<real id>`, `/admin/feedback`, `/admin/audit` → HTTP 404, body "We couldn't find that page.", no "Admin" in `<title>` or body. Signed-out → `/login`.
2. **Non-admin direct action**: the lifter POSTs the admin server action (action id scraped from the admin page as the admin, then replayed with the lifter's cookies) → 404 / not-found, and the target's status is unchanged in the DB.
3. **Suspend → next request**: the lifter is signed in with a page open. The admin suspends them. The lifter's next navigation lands on `/suspended`, and their next server action (logging a set) redirects there and writes nothing. The admin reactivates. The lifter's next request reaches Today, with history intact.
4. **Feedback end to end**: the lifter sends Bug feedback → it appears in the admin inbox (Open) → Mark handled → it moves to Handled → the audit log shows the line.
5. **Menu**: the lifter's ⋮ has no Admin item; the admin's has one.
6. **Screens vs preview**: screenshots at 375 light and 1280 dark of Overview, Accounts, Account page + suspend dialog, Inbox, Item, Audit, `/feedback`, `/suspended`.

### 14.4 Standing suites (must stay green)

RLS, isolation (with Feedback coverage), history integrity, baselines, deload suppression, signup gate (unchanged), tour anchors, What's New backlog, the client-bundle check, and all existing e2e.

### 14.5 Static guards — `tests/unit/admin-guards.test.ts`

1. Only `src/lib/data/admin/db.ts` (inside `src/lib/data`) builds the admin client. No file outside `src/lib/data/admin/` imports `@/lib/data/admin/db` or `gate`.
2. `src/lib/data/admin/*` (except `db.ts`) never imports `@/lib/db`, and never names `$queryRaw` / `$executeRaw`.
3. `src/app/admin/**` and `src/components/admin/**` import data only from `@/lib/data/admin/*` (and `@/lib/data/account` only through `requireAdmin`). They never import from `@/lib/(plan|logging|progression|goals|cardio|gyms|exercises)` or `@/lib/accounts/deletion`.
4. Every `src/app/admin/**/actions.ts` exported function's first `await` is `requireAdmin()`. Every admin `page.tsx` calls `requireAdmin()`. Both are checked by source pattern.
5. `AdminActor` objects are constructed only in `identity.ts`.
6. No file references `OVERLOAD_ADMIN_USER_IDS` except `identity.ts` (plus tests, e2e config, and the bundle checker).
7. No "use client" file imports `@/lib/data/admin/*`.
8. No Prisma model or field named `role`, `isAdmin`, or `admin*` on Profile (an admin flag can never be added silently). `schema.prisma` is scanned.

## 15. Acceptance criteria

### Admin authorization (AC-1)
- [ ] A non-admin gets not-found (404) from every admin URL, and the response contains no admin text.
- [ ] A non-admin invoking any admin server action directly gets not-found, and nothing changes.
- [ ] Admin identity comes only from `OVERLOAD_ADMIN_USER_IDS`. No database column, setting, or client value grants it.
- [ ] The Admin menu item renders only for admins.

### Suspension and reactivation (AC-2)
- [ ] After suspension, the account's next authenticated page load or server action is refused (→ `/suspended`), including in a session opened before the suspension.
- [ ] Reactivation restores access on the next request. No training row, preference, or tour/what's-new state changes in either direction.
- [ ] An admin account cannot be suspended from the admin area.

### Metrics (AC-3)
- [ ] The Overview equals the §9 definitions on controlled data.
- [ ] No admin response contains training content (sentinel test).
- [ ] Last-active is a date, written at most once per account per day.

### Feedback (AC-4)
- [ ] Any authenticated lifter (Free) can send feedback with a category and message, and sees confirmation or a clear failure.
- [ ] The owner can read it in the inbox, recategorize it, and mark it handled or reopen it.
- [ ] No lifter can read or modify another account's feedback.

### Audit (AC-5)
- [ ] Every admin mutation (suspend, reactivate, handled, reopened, recategorized) writes exactly one audit row in the same transaction. A failed audit write leaves the mutation undone.
- [ ] Audit rows cannot be updated or deleted (database trigger + no app path).
- [ ] The audit log lists actor, action, account, and time, newest first.

### Invariants
- [ ] New tables have RLS on and no policies.
- [ ] Account deletion still removes exactly the account's owned rows (now including Feedback) and nothing of another account's.
- [ ] Signup behavior is unchanged.

## 16. Explicit non-goals

- ❌ Any admin view of an account's training content, and impersonation. **Permanent.**
- ❌ Admin account deletion. **Halted** (R7). Resumes only after the upstream amendment.
- ❌ Admin role or flag in the database. **Permanent** (identity is the allowlist).
- ❌ Plan, entitlement, comp, and billing controls. **Deferred** to Plans, Billing & Promo Codes.
- ❌ Replies, threads, ticketing, email. **Deferred** (Public Accounts adds a support channel).
- ❌ Activity tracking beyond a last-active date; third-party analytics. **Permanent** for this build.
- ❌ Program generation, social features, ads, dated goals, rest timer, cardio progression. **Permanent.**

## 17. Ticket plan

| # | Title | Contents |
| - | ----- | -------- |
| 1 | Admin foundation | schema + migration 9g; scope/deletion classification; suspension + last-active in `requireAccount`; `/suspended`; identity + `requireAdmin`; admin gate + client; audit module; guards; unit + integration |
| 2 | Send feedback | `submitFeedback` + action, `/feedback` page, `Textarea`, menu + sheet entry, isolation suite |
| 3 | Admin center: overview, accounts, audit | admin shell/layout/nav, admin menu item, metrics layer, auth email facade read, directory, account page, suspend/reactivate actions + dialog, audit log page, privacy sentinel test |
| 4 | Admin feedback inbox + boundary e2e | inbox + item + actions; e2e admin-center suite (404s, direct action, suspend→next request, feedback end to end, screenshots) |
| 5 | User guidance | `overload-onboarding`: tour decision + release note |

## Resolved Decisions

Pre-resolved by the run prompt (approved planning authority, Appendix D2 of the pipeline guide). Adopted, not re-derived.

- **R1. Admin identity is a server-only allowlist.** `OVERLOAD_ADMIN_USER_IDS`, comma/whitespace-separated Supabase auth user UUIDs, fail-closed, read per request. Not a database role or Profile flag (a guard forbids one). Every admin page and action re-checks it. A non-admin gets not-found. *Authority: run prompt PRD 1; Architecture → Authorization → Admin; CLAUDE.md admin boundary; guide D2 (B/C).*
- **R2. Administrative privacy is absolute.** Admin reads only the §6.2 fields plus "has ≥1 row" sets for Mesocycle and LoggedSet. There is no impersonation. It is enforced at runtime by the admin gate and statically by guards, and proven by the sentinel test. *Authority: run prompt PRD 2; Architecture; CLAUDE.md admin boundary; guide D2 (A).*
- **R3. Suspension takes effect on the next request.** `Profile.status` is checked inside `requireAccount()`, the existing per-request chokepoint, so no competing authorization system is introduced. Reactivation changes only `status`. *Authority: run prompt PRD 3; Architecture → Auth & Identity; guide D2 (B).*
- **R4. Last-active is a date, written at most once a day.** `Profile.lastActiveOn @db.Date` with a conditional update. No timestamps, pageviews, or presence. *Authority: run prompt PRD 4; Architecture Data Model; guide D2 (C — flagged for review).*
- **R5. Feedback categories are Bug, Idea, Question, Other.** Feedback is Free for every authenticated lifter. The owner can read, recategorize, mark handled, and reopen. No threads or email. *Authority: run prompt PRD 5; guide D2 (C — flagged).*
- **R6. Every admin mutation is audited in the same transaction.** `recordAudit` accepts only a transaction client. A conditional update with `count = 0` writes nothing and no audit row. A failed audit write rolls back the mutation. A DB trigger enforces append-only. *Authority: run prompt PRD 6; CLAUDE.md admin boundary.*
- **R7. Administrative deletion is halted (stop condition 2) and is not implemented.** The current documents remain contradictory. CLAUDE.md's first invariant says deletion "is user-initiated", and the PRD's Accounts edge case says "Account deletion cannot be started by anyone but the signed-in owner". On the other side are the PRD's Admin Center & Feedback feature and owner journey, the Architecture API surface, the roadmap's Pitch 17, and CLAUDE.md's own admin-boundary list ("suspend, reactivate, delete"). `deleteAccount(account)` accepts only the session-derived `Account`, and letting an admin name a target would expand its authority. Per the run prompt this is not reinterpreted. There is no raw deletion, no second destructive path, and no change to the module. The pitch itself makes the capability conditional ("subject to reconciliation", §6 item 7, Journey F, §13–14), so the rest of the pitch proceeds. **Required upstream amendment:** amend CLAUDE.md's first invariant and the PRD Accounts edge case to permit owner-initiated deletion of a named account, through the same dedicated module, after `requireAdmin()`, with explicit typed-email confirmation, never of an allowlisted account, with an `account_delete` audit entry that survives the deletion. **Resumption path:** after the amendment, a follow-up ticket adds `deleteAccountAsAdmin(actor, targetId)` inside `src/lib/accounts/deletion.ts`. It reuses the same order and transaction, builds the target client only inside the module, records the audit entry (no FK) before the identity removal, and adds the `account_delete` enum value. It implements design doc Screen 12 and the preview's deferred frame. *Authority: run prompt PRD 7; CLAUDE.md stop condition 2.*
- **R8. No billing work.** No plan column, placeholder, or comp control. Admin is web-only, and `overload-cross-platform` is not invoked. *Authority: run prompt PRD 8; roadmap Pitch 17 Defers.*
- **R9. Guidance through the shipped mechanisms.** The final ticket runs `overload-onboarding`. The admin area is never toured or announced. *Authority: run prompt PRD 9.*

Resolved by this run (authority order: planning docs → CLAUDE.md/skills → codebase patterns → judgment):

- **R10. Preview format is `.tsx`.** The Oct 22 `overload-ui-design` rewrite, CLAUDE.md, the guide, and the run prompt all name `docs/previews/<slug>-preview.tsx`. They supersede the earlier `.html` gallery convention. *Authority: skill + CLAUDE.md.*
- **R11. `AdminAuditEntry` is admin-only, with no owner column and no foreign keys.** An audit row is the operator's record, not lifter data. Giving it a `userId` would let account deletion erase the trail, and a Restrict FK would block every self-deletion. It is classified explicitly in `ADMIN_ONLY_MODELS` and refused by the account-scoped client. **Upstream amendment:** Architecture → Data Model "Ownership" should name `AdminAuditEntry` as the second exception beside library exercises. The retained `targetUserId` of a later-deleted account is a bare UUID with no name or email (flag for review). *Authority: Architecture (append-only), CLAUDE.md admin boundary; judgment.*
- **R12. Metric definitions and their limitations are as in §9 and shown in the footnote.** Cohorts are signup months (last 6). "Came back" = last-active on a later day than signup. "Active, 30 days" is the second rate. Bucket C, flagged. *Authority: pitch §4.10 ("do not manufacture precision"); judgment.*
- **R13. Dates follow "today is per account".** `lastActiveOn` and signup dates are each account's own calendar dates. The Overview's "today" and "this month" are the acting admin's. *Authority: CLAUDE.md "Today is per account".*
- **R14. "Created a plan" = ≥1 Mesocycle in any state. "Logged a workout" = ≥1 LoggedSet.** Logged sets are the source of truth: an empty in-progress session is not a workout. *Authority: CLAUDE.md second invariant; judgment.*
- **R15. The admin layer lives in `src/lib/data/admin/`** behind a gated client, not raw Prisma. This keeps the existing "only `src/lib/data` reaches Prisma" guard and ESLint exemption unchanged. It realizes CLAUDE.md's "admin metrics layer" as a structural boundary instead of a convention. *Authority: CLAUDE.md first invariant; guide 4.3 "make silent-failure rules structural".*
- **R16. Emails come from Supabase Auth through one new read on the auth-admin facade.** No email copy is stored on Profile. If the facade fails, the page degrades gracefully. *Authority: pitch §4.2 "existing authentication and profile systems remain authoritative".*
- **R17. Suspend and reactivate are both confirmed with an AlertDialog. Feedback handled, reopen, and recategorize are not confirmed but are audited.** *Authority: design doc §8; skill (destructive actions name the account).*
- **R18. Admins cannot be suspended in the admin area.** This prevents owner lockout, and the account page shows the "Admin accounts can't be suspended here." state. *Authority: judgment (safe direction).*
- **R19. Feedback daily cap `FEEDBACK_DAILY_LIMIT = 10` per rolling 24h.** A cheap abuse guard with no infrastructure. Bucket C, flagged. *Authority: judgment; CLAUDE.md (no queue/cache).*
- **R20. Feedback attaches nothing**: no route, device, or training context. The message is ≤ 2000 characters and is rendered as plain text. *Authority: pitch §4.13.*
- **R21. Account-page facts exclude every per-account training fact**, including "has logged a workout". Only the account's feedback count (its messages to the owner) is shown. *Authority: CLAUDE.md admin boundary ("name, email, status, signup and last-active dates, plan state, and aggregate metrics").*
- **R22. `/suspended` reveals no admin identity, reason, or date, and allows sign-out.** A suspended account cannot self-delete while suspended (deletion runs through `requireAccount`). *Authority: judgment; R3.*
- **R23. A non-admin's admin URL is the root not-found with HTTP 404 and no admin metadata.** A signed-out visitor is redirected to `/login` like every protected path. Neither reveals the admin area. *Authority: CLAUDE.md "not-found"; design doc principle 2.*
- **R24. Signup is untouched.** The repository's current gate is OVE-50's `OVERLOAD_SIGNUP_OPEN` switch. CLAUDE.md's invite-only wording predates it (existing upstream amendment). This run neither opens nor loosens signup. *Authority: run prompt ("preserve … signup"); OVE-50 spec.*
- **R25. The admin shell is separate from the lifter shell** (`src/app/admin/layout.tsx`, wider column, sub-nav), with no tour or What's New. *Authority: design doc Screen 2; preview.*

## Open Questions

1. **Admin deletion contract (blocking for that capability only).** It is carried as R7's required upstream amendment. Everything else is decided.

## 18. Future considerations

- Plans, Billing & Promo Codes adds a plan column and fact. Comp grants and revokes become new `AdminAuditAction` values recorded through `recordAudit`, and comp reasons go in `detail`.
- Public Accounts can reuse `Profile.status` to refuse sign-in at the login step ("A suspended account cannot sign in") and can link the feedback form from its support channel.
- Admin deletion resumes per R7.
- If a future pitch ever needs narrow support access to training content, it is a new, audited capability. Nothing here leaves a hook for it.
