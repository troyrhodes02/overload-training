---
version: 1.0.0
status: draft
author: autonomous pipeline run
last_updated: 2026-11-01
pitch_reference: docs/pitches/mvp-4-web-commercial/19-plans-billing-promo-codes/pitch.md
design_reference: docs/pitches/mvp-4-web-commercial/19-plans-billing-promo-codes/design.md
preview_reference: docs/pitches/mvp-4-web-commercial/19-plans-billing-promo-codes/preview.tsx
prd_reference: docs/planning/prd.md
architecture_reference: docs/planning/architecture.md
linear_issue: (milestone + OVE-xx, captured in docs/runs/19-...-progress.md (removed in the docs reorganization; see git history))
---

# Plans, Billing & Promo Codes — Technical Specification

## 2. Summary

Plans, Billing & Promo Codes gives Overload two plans — **Free** (capture) and **Pro** (interpretation) — enforced by **named capabilities on the server**, never by a plan-name check and never by hiding a control. An account's **effective plan is computed on read** from its entitlement records: a 14-day card-free **trial** (Overload-owned), an owner-granted **comp** (Overload-owned), and a **subscription** mirrored from verified, idempotent Stripe webhooks. If any valid source grants Pro, the account is Pro; when the last one lapses it becomes Free, and **no training record is ever deleted, locked, or altered** by that transition.

The core abstraction is a pure resolver, `resolveEntitlement(account) → { plan, capabilities, displayState }`, that reads `Entitlement` rows plus the `BillingAccount` Stripe mirror and returns the capability set the account currently holds. Every Pro surface (progression recommendations and evidence, e1RM trends and stall detection, RIR-in-recommendation, Exercise History & PR Intelligence) is gated through that resolver **in the query layer**, so a Free account cannot obtain a Pro result even by invoking a read path directly. Stripe Billing owns money and card data entirely: Overload creates hosted Checkout and Customer Portal sessions, receives signature-verified webhooks at one route handler, and mirrors subscription state — it stores no card data and treats a browser return as non-authoritative.

"Working" means: a new account has Pro for 14 days then silently becomes Free with everything intact; a Free account that calls `getPlannedProgression` receives the plan DTO with Pro fields withheld and a `locked` marker; a verified `customer.subscription.updated` reconciles the mirror to Stripe's current truth exactly once no matter how many times (or in what order) it arrives; the owner can grant and revoke complimentary Pro with a reason and an audit entry without ever touching Stripe; and BLIZZY applies 50% off for three monthly periods, stops at 200 redemptions, and discloses the regular renewal price — all verified in Stripe **test mode**, with no real charge and no production change.

## 3. Problem

- The app cannot yet tell a Free lifter from a Pro lifter — every account receives every progression recommendation, e1RM trend, and PR-intelligence result, because no capability gate exists (the whole surface is ungreenfield-gated today).
- The app cannot yet charge for interpretation without risking capture: there is no entitlement model, so there is no safe way to withhold Pro while guaranteeing logging, history, goals, and export stay free.
- The app cannot yet know whether a subscription is real: there is no verified billing-event path, so a browser return or a spoofed call could otherwise be mistaken for payment.
- The app cannot yet give the owner complimentary-access controls or a founding-member transition, so existing accounts would lapse to Free when plans ship.
- This unblocks the Landing Page (needs plan descriptions and a subscribe entry point), Plan Import (consumes a Pro capability), and Launch Readiness (the separate paid-launch gate).

## 4. Scope and non-scope

### In scope

1. Two plans, Free and Pro, expressed as **named capabilities** with a Free→{} / Pro→{all} mapping.
2. Server enforcement of every Pro result in the query/action layer (not the UI), returning withheld DTOs or `plan_required`.
3. A 14-day card-free trial created at signup, expiring to Free purely by date (no job, no page visit).
4. Monthly ($4.99) and annual ($39.99) Pro subscriptions via Stripe hosted Checkout (test-mode price IDs, env-configured).
5. Stripe Customer Portal for self-service management and cancellation.
6. One signature-verifying webhook route handler with event dedupe (`WebhookEvent`) and reconcile-to-Stripe-truth idempotency.
7. A subscription-state mirror (`BillingAccount`) written only from verified events, with a 7-day grace window on failed payment.
8. BLIZZY promotion (Stripe coupon + promotion code): 50% off first 3 monthly periods, 200-redemption cap, first-time-customer only, monthly price only; redemptions mirrored (`PromoRedemption`).
9. Owner-only complimentary Pro grant/revoke in the Admin Center, each a reason + optional end date + append-only audit entry, never touching Stripe.
10. Read-only admin billing visibility: resolved entitlement + Stripe mirror on the account page, and aggregate counts + BLIZZY redemptions on a new `/admin/billing` page.
11. Founding-member transition: an operator script that grants comp to existing accounts (dry-run default, named target set, one transaction) — run by a human against production.
12. Email-verified-before-first-checkout gate (reuses Public Accounts verification; gates nothing Free).
13. The quiet, dismissible upgrade note on withheld Pro surfaces; trial sub-label in Settings; Plan & Billing screen.
14. Tax-handling decision recorded as a configurable, default-off switch; full flow verified in test mode.
15. Final User Guidance ticket (tour step decision + What's New entry).

### Out of scope

- Native iOS/Android billing, Capacitor, StoreKit, Play Billing, Universal Links, native return handling, TestFlight (iOS Foundation postponed; **web-only this run**). Do not invoke `overload-cross-platform`.
- The public landing page, `/blizzy` creator page, public pricing page, public changelog (next pitch; this provides the authenticated entry points only).
- The Workout Plan Import & Review workflow and any language-model integration (later pitch; this only reserves the `plan_import` capability, unused).
- Additional tiers, referral/affiliate programs, creator payouts, any card-entry form or token storage.
- **Live Stripe mode, real charges, production migrations, enabling public signup, production entitlement changes** — all human-gated; the run uses test mode only and leaves the PR open.
- Any change to progression thresholds, the e1RM formula, RIR qualifiers, scheduled deloads, or gym baselines (adjacent engine logic — read, gate, never modify).

## 5. Core concepts

| Concept | Description |
| ------- | ----------- |
| `Plan` | `free` or `pro`. A label for a capability set; **server code never branches on it**, only on capabilities. |
| `Capability` | A named product capability: `progression_insights`, `e1rm_trends`, `exercise_history_intelligence`, `plan_import`. Free grants none; Pro grants all four. Capabilities grant features, never permissions or admin. |
| `Entitlement` | One owned record of an Overload-owned Pro source for an account: `trial` or `comp`. Carries `plan` (always `pro` here), `startedAt`, nullable `endsAt`, and for a comp a `reason`, optional note, `grantedByUserId`, and `revokedAt`. Subscriptions are **not** stored here. |
| `BillingAccount` | One owned 1:1 record per account mirroring Stripe: `stripeCustomerId`, `subscriptionId`, `status`, `interval`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `graceEndsAt`, `priceId`, `promoCode`. Written only by the webhook handler and checkout-session creation. Never the authority for anything money — Stripe is. |
| `PromoRedemption` | One owned mirror row per `(account, code)`: the promotion code, coupon id, and resulting subscription, written from verified events so the admin area can show redemptions. Not proof of conversion on its own. |
| `WebhookEvent` | An un-owned system row keyed by the Stripe event id, so a replay is recognized and changes nothing. RLS deny-all; added to `UNOWNED_SYSTEM_MODELS`. |
| Resolved entitlement | Computed on read by `resolveEntitlement(account)`: the effective `plan`, the capability set, the list of active sources, and a single `displayState` for the UI. Never stored. |
| `displayState` | A UI-only label derived from the sources: `free`, `trial`, `paid_monthly`, `paid_annual`, `comp`, `canceling`, `grace`. Not enforced; enforcement is only `plan`. |

Overload-specific invariants preserved:

- A plan grants **named capabilities, not permissions**; server code checks the capability; a Free account never receives a Pro result.
- **Capture is never gated.** Logging, plan building, RIR entry, cardio, goals + their progress, full basic history + correction, export, and account deletion are Free on every plan and after any downgrade. Goal progress and the e1RM used for it stay Free and unchanged.
- **Expiry of one source never revokes another.** Pro = (trial valid) OR (comp valid) OR (subscription grants Pro). A comp is never represented as a paying subscriber.
- Subscription state enters only through **verified, idempotent** webhooks; a comp never touches Stripe; a browser checkout return is never authoritative.
- Every owned new model (`Entitlement`, `BillingAccount`, `PromoRedemption`) carries a non-null indexed `userId` and is reached through the account-scoped layer, except the named exceptions (webhook handler, admin metrics/billing layer, account-deletion module, operator script).

## 6. States and lifecycle

### Entitlement sources → Pro validity (computed on read; `now` in the account's timezone where a calendar boundary matters)

| Source | Pro while | Becomes non-Pro when |
| ------ | --------- | -------------------- |
| `trial` | `startedAt ≤ now < endsAt` (endsAt = signup + `TRIAL_DURATION_DAYS` = 14) | `now ≥ endsAt` — automatic, no job, no page visit |
| `comp` | `revokedAt is null` AND (`endsAt is null` OR `now < endsAt`) | revoked by owner, or `now ≥ endsAt` |
| subscription (`BillingAccount`) | see mapping below | see mapping below |

### Stripe subscription `status` → Pro validity (the mirror)

| Mirrored `status` | Pro? | Notes |
| ----------------- | ---- | ----- |
| `active` | yes | if `cancelAtPeriodEnd` → still Pro until `currentPeriodEnd` (displayState `canceling`) |
| `trialing` | yes | not used by us (our trial is card-free, pre-subscription) but handled defensively |
| `past_due` | yes **until `graceEndsAt`** | displayState `grace`; `graceEndsAt = firstObservedPastDueAt + GRACE_PERIOD_DAYS` (7) |
| `canceled`, `unpaid`, `incomplete`, `incomplete_expired`, `paused` | no | subscription no longer grants Pro |
| no `BillingAccount` row / null status | no | never subscribed |

### Effective plan

```text
plan = pro  if (trial valid now) OR (comp valid now) OR (subscription grants Pro now)
plan = free otherwise
```

`displayState` priority for the single plan line (enforcement is unaffected): `grace` > `canceling` > `paid_monthly`/`paid_annual` > `comp` > `trial` > `free`. A comp present alongside a paid subscription shows the paid state (so Manage billing is reachable); a comp alone never shows a renewal price.

### Comp lifecycle

| From | To | Allowed? | Side effects |
| ---- | -- | -------- | ------------ |
| (none) | active comp | yes, owner only | `Entitlement(source=comp)` written + `comp_granted` audit entry, **same transaction** |
| active comp | revoked | yes, owner only | `revokedAt`/`revokedByUserId` set + `comp_revoked` audit entry, same transaction; effective plan recomputed from remaining sources |

### Subscription lifecycle (mirror maintained by the webhook, reconciled to Stripe truth)

`checkout.session.completed` → link `stripeCustomerId↔userId`, reconcile subscription. `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed` → re-fetch the authoritative subscription from Stripe and overwrite the mirror; set `graceEndsAt` on first `past_due`, clear it on recovery. All wrapped with the `WebhookEvent` insert in one transaction.

### Atomic writes (must succeed or fail together)

- Comp grant/revoke + its audit entry (reuse `inAdminTx` + `recordAudit`).
- Webhook: `WebhookEvent` insert (dedupe) + `BillingAccount` upsert + any `PromoRedemption` upsert — one transaction.
- Founding-member backfill: all comp `Entitlement` inserts for the named set — one transaction (operator script).

## 7. UI integration

The design doc (v1.0) and preview (`19-...-preview.tsx`) are the binding visual contract. This section adds the technical seam; no visual redesign.

### Screens

| Screen | Route | Purpose | Data needed | Actions |
| ------ | ----- | ------- | ----------- | ------- |
| Plan & Billing | `/settings/billing` (+ `?status=success\|cancelled`) | show resolved state; subscribe or manage | `BillingScreenDto` (displayState, label, explanation, canSubscribe, canManage, prices, emailVerified) | `createCheckoutSessionAction`, `createPortalSessionAction` |
| Verify-before-checkout (inline) | `/settings/billing` | require verified email before first checkout | `{ emailVerified, email }` | reuse Public Accounts `sendVerificationEmail` |
| Upgrade note (inline) | exercise card, Today list, day-complete, exercise page | explain a withheld Pro result once, dismissibly | `{ locked: true, feature }` on the progression/history DTO | link to `/settings/billing`; dismiss persists per surface |
| Settings index row | `/settings` | trial/plan sub-label | `displayState` short form | navigate |
| Admin account entitlement section | `/admin/accounts/[id]` | resolved entitlement + Stripe mirror; grant/revoke comp | `AdminAccountBillingDto` | `grantCompAction`, `revokeCompAction` |
| Admin billing overview | `/admin/billing` (+ `/admin` snapshot) | aggregate counts + BLIZZY redemptions | `AdminBillingOverviewDto` | none (read-only) |

### Components (client islands only where interactive)

- `PlanBillingPanel`, `PlanComparison`, `SubscribeButtons`, `VerifyBeforeCheckout`, `UpgradeNote` (client; holds per-surface dismiss state), `EntitlementStateLine` (pure), `AdminEntitlementSection`, `GrantCompDialog`/`RevokeCompDialog` (client), `AdminBillingOverview`. All read data server-side; mutations go through server actions. No client component touches Prisma, Stripe, or the data store.
- The `?status=success` return renders a bounded `aria-live` "finishing up" state and re-reads resolved entitlement on load; it never flips to Pro from the query param.

### Per-surface dismissal of the upgrade note

Stored client-side only (localStorage keyed by surface id). It is a cosmetic preference, not entitlement, so it carries no DB table and no `userId` scoping concern. The note never blocks the surrounding Free surface.

### User guidance (final ticket, via `overload-onboarding`)

- **Tour:** one step anchored to the Settings "Plan & Billing" row (copy in the design doc §13); the skill makes the final keep/skip decision against the shipped surface. No step on the upgrade note (it self-explains).
- **What's New:** one significant entry, "Introducing Free and Pro" (body in design doc §13), dated the production ship day at merge; must not announce live payments or public availability.

### Platform impact

Recorded **pending / web-only this run** (iOS Foundation postponed). The entitlement model is platform-neutral so a future native client consumes the same resolved access. Admin is web-only permanently. `overload-cross-platform` is not invoked.

## 8. Data model

### Relationship to existing schema

| From | Relation | To | Description |
| ---- | -------- | -- | ----------- |
| `Entitlement` | many-to-one | `Profile` (`userId`) | an account's trial/comp records |
| `BillingAccount` | one-to-one | `Profile` (`userId`) | the account's Stripe mirror |
| `PromoRedemption` | many-to-one | `Profile` (`userId`) | promo redemptions mirrored for the account |
| `WebhookEvent` | none (un-owned) | — | Stripe event dedupe ledger |
| `AdminAuditEntry` | (existing) | — | gains `comp_granted`, `comp_revoked` kinds |

### Enums

```prisma
enum Plan {
  free
  pro
}

enum EntitlementSource {
  trial
  comp
}

enum CompReason {
  friend
  creator
  tester
  founding_member
  other
}

/// Mirror of Stripe's subscription.status values we act on.
enum SubscriptionStatus {
  active
  trialing
  past_due
  canceled
  unpaid
  incomplete
  incomplete_expired
  paused
}

enum BillingInterval {
  month
  year
}
```

`AdminAuditAction` (existing enum) gains:

```prisma
  comp_granted
  comp_revoked
```

### New models

```prisma
/// An Overload-owned Pro entitlement source (trial or comp). Subscriptions are
/// NOT stored here — they live in BillingAccount as a Stripe mirror. Effective
/// plan is computed on read from these rows plus the mirror; nothing is stored.
model Entitlement {
  id              String            @id @default(uuid()) @db.Uuid
  userId          String            @map("user_id") @db.Uuid
  source          EntitlementSource
  plan            Plan              @default(pro) // trial and comp both grant Pro
  startedAt       DateTime          @map("started_at") @db.Timestamptz
  /// null = open-ended (a comp with no end date). Trial always has an end.
  endsAt          DateTime?         @map("ends_at") @db.Timestamptz
  // comp-only metadata (null for trial):
  compReason      CompReason?       @map("comp_reason")
  compNote        String?           @map("comp_note")
  grantedByUserId String?           @map("granted_by_user_id") @db.Uuid
  revokedAt       DateTime?         @map("revoked_at") @db.Timestamptz
  revokedByUserId String?           @map("revoked_by_user_id") @db.Uuid
  createdAt       DateTime          @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime          @updatedAt @map("updated_at") @db.Timestamptz

  profile Profile @relation(fields: [userId], references: [userId], onDelete: Cascade)

  @@index([userId])
  @@index([userId, source])
  @@map("entitlements")
}
```

Partial unique indexes (raw SQL in the migration, since Prisma cannot express `WHERE`):

```sql
-- At most one trial per account.
CREATE UNIQUE INDEX "entitlements_one_trial_per_account"
  ON "entitlements" ("user_id") WHERE "source" = 'trial';
-- At most one active (non-revoked) comp per account.
CREATE UNIQUE INDEX "entitlements_one_active_comp_per_account"
  ON "entitlements" ("user_id") WHERE "source" = 'comp' AND "revoked_at" IS NULL;
```

```prisma
/// The account's Stripe customer reference and a read-only mirror of its
/// subscription state. Written ONLY by the webhook handler and by checkout-
/// session creation (which may set stripeCustomerId). Never the source of
/// truth for money — Stripe is. One row per account, created lazily.
model BillingAccount {
  userId            String              @id @map("user_id") @db.Uuid
  stripeCustomerId  String              @unique @map("stripe_customer_id")
  subscriptionId    String?             @unique @map("subscription_id")
  status            SubscriptionStatus? // null until a subscription exists
  interval          BillingInterval?
  currentPeriodEnd  DateTime?           @map("current_period_end") @db.Timestamptz
  cancelAtPeriodEnd Boolean             @default(false) @map("cancel_at_period_end")
  /// Set when status first becomes past_due; Pro holds until this instant.
  graceEndsAt       DateTime?           @map("grace_ends_at") @db.Timestamptz
  priceId           String?             @map("price_id")
  /// The promotion code currently applied, for display only (e.g. "BLIZZY").
  promoCode         String?             @map("promo_code")
  createdAt         DateTime            @default(now()) @map("created_at") @db.Timestamptz
  updatedAt         DateTime            @updatedAt @map("updated_at") @db.Timestamptz

  profile Profile @relation(fields: [userId], references: [userId], onDelete: Cascade)

  @@map("billing_accounts")
}
```

```prisma
/// A mirror of a promotion code redeemed by an account, written from verified
/// Stripe events so the admin area can show redemptions. One row per (account, code).
model PromoRedemption {
  id               String   @id @default(uuid()) @db.Uuid
  userId           String   @map("user_id") @db.Uuid
  code             String   // e.g. "BLIZZY"
  couponId         String   @map("coupon_id")
  promotionCodeId  String?  @map("promotion_code_id")
  subscriptionId   String?  @map("subscription_id")
  redeemedAt       DateTime @map("redeemed_at") @db.Timestamptz
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz

  profile Profile @relation(fields: [userId], references: [userId], onDelete: Cascade)

  @@unique([userId, code])
  @@index([userId])
  @@index([code])
  @@map("promo_redemptions")
}
```

```prisma
/// Un-owned system ledger of received Stripe events, so a replayed delivery
/// changes nothing. No userId; classified in UNOWNED_SYSTEM_MODELS.
model WebhookEvent {
  id         String   @id // the Stripe event id, e.g. "evt_..."
  type       String
  receivedAt DateTime @default(now()) @map("received_at") @db.Timestamptz

  @@index([type])
  @@map("webhook_events")
}
```

### Updated models

`Profile` gains back-relations only (no new columns — `emailVerifiedAt` already exists and is the checkout gate):

```prisma
  entitlements     Entitlement[]
  billingAccount   BillingAccount?
  promoRedemptions PromoRedemption[]
```

### Row-level security (migration `9j_plans_billing`)

```sql
ALTER TABLE "entitlements"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_accounts"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promo_redemptions"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events"     ENABLE ROW LEVEL SECURITY;
-- Deny-all on every new table. No policies. The Data API must return nothing.
```

The migration must also add the owned-table ownership-immutability + same-owner triggers to `entitlements`, `billing_accounts`, and `promo_redemptions` (matching the pattern in `9_account_ownership_2_enforce`), because they carry `user_id`. `webhook_events` is un-owned and gets none.

### Scope-layer classification (required, or `unclassifiedModels()` breaks CI)

- `Entitlement`, `BillingAccount`, `PromoRedemption` → **owned** (scoped by `userId` like every owned model; reads/writes through `account.db`).
- `WebhookEvent` → add to `UNOWNED_SYSTEM_MODELS` in `src/lib/data/scope.ts` (sibling of `AuthThrottle`).
- Admin reads of entitlement/billing go through the admin metrics/billing layer (a named exception, metadata/aggregate only). The webhook handler and the operator founding-member script are named raw-Prisma exceptions (added to the ESLint `RAW_DATA_ACCESS` allowlist, like `throttle.ts`).

### Derived fields

| Field / Concept | Stored? | Computed From | Notes |
| --------------- | ------- | ------------- | ----- |
| effective `plan` | no | Entitlement rows + BillingAccount mirror + `now` | `resolveEntitlement`; never a column |
| capability set | no | the resolved plan via `PLAN_CAPABILITIES` | `capabilitiesFor(plan)` |
| `displayState` | no | the active sources + grace/cancel flags | UI label only |
| trial `endsAt` | yes | signup time + `TRIAL_DURATION_DAYS` | stored once on the trial Entitlement; expiry is pure date math on read |
| `graceEndsAt` | yes | first `past_due` observation + `GRACE_PERIOD_DAYS` | stored on the mirror; set/cleared by the webhook |
| `progressionTag`, e1RM, trend | no (unchanged) | logged sets | still computed on read; this feature only **gates** them |

Constants (added to a billing config module; Bucket values flagged for owner confirmation before live billing):

```ts
export const TRIAL_DURATION_DAYS = 14;        // pitch decision #3 (owner-confirmed value)
export const GRACE_PERIOD_DAYS = 7;           // pipeline-guide proposed default; owner-confirm before launch
export const PLAN_CAPABILITIES = {
  free: [] as Capability[],
  pro: ["progression_insights", "e1rm_trends", "exercise_history_intelligence", "plan_import"],
} as const;
```

## 9. Authorization and access control

### Capability enforcement (the center of the feature)

A single module, `src/lib/entitlements/`, owns resolution and enforcement:

```ts
// src/lib/entitlements/resolve.ts  (reads only via account.db + the mirror)
export async function resolveEntitlement(account: Account, now?: Date): Promise<ResolvedEntitlement>;
// { plan: "free" | "pro"; capabilities: ReadonlySet<Capability>; sources: ActiveSource[]; displayState: DisplayState }

export function capabilitiesFor(plan: Plan): ReadonlySet<Capability>;
export function can(resolved: ResolvedEntitlement, cap: Capability): boolean;

// src/lib/entitlements/require.ts
export async function requireCapability(account: Account, cap: Capability): Promise<ResolvedEntitlement>;
// throws DomainError("plan_required") (402) when the capability is absent.
```

- `resolveEntitlement` is **request-cached** (React `cache()`), so the capability read happens once per request across the server-component tree.
- **Enforcement lives in the read/query layer, not the page.** The progression and history query functions take (or internally resolve) the capability set and **withhold Pro fields server-side**:
  - `getPlannedProgression`, `getSessionProgressionSummary` → when `progression_insights` is absent, return the DTO with `tag`, `recommendation`, `suggestion`, and e1RM `points` set to `null` and `locked: "progression_insights"`. The pure engine still runs for Free-relevant data (e.g. nothing), but **no Pro value is placed on the DTO**.
  - `getExerciseHistory` → without `e1rm_trends`, `records.bestE1rm`, `trend.e1rm`, `trend.weight`, and `projected` are withheld; without `exercise_history_intelligence`, per-session `call`s and the rep-record frontier are withheld; `sessions` (plain logged sets), `records.heaviest`/`bestSet`, `trend.reps`, and goals remain. A `locked` marker per withheld group drives the single upgrade note.
- Any **dedicated Pro server action** (none strictly required this run; Pro surfaces are server-component reads) must call `requireCapability` first and return `plan_required` to a Free account.
- The UI adapts to `locked` markers (shows the note) but **UI hiding is never the enforcement** — the server already withheld the data.

### Account scoping

- `Entitlement`, `BillingAccount`, `PromoRedemption` are owned; all application reads/writes go through `account.db`. Fetching another account's billing by id behaves as not-found.
- The acting `userId` is always from the session. The **one exception** is the Stripe webhook, which resolves the account from `BillingAccount.stripeCustomerId` (never from the event payload beyond the verified signature), and for `checkout.session.completed` verifies `client_reference_id` matches an existing account.
- `createCheckoutSessionAction` / `createPortalSessionAction` resolve the account from the session, re-check auth, and (checkout) re-check `emailVerifiedAt != null`.

### Admin

- Every admin billing view and comp mutation re-checks `requireAdmin()` on the server; a non-admin gets `not_found`.
- Admin reads **entitlement + billing records only** (resolved plan, source, Stripe mirror, aggregate counts, redemptions) — never a plan, session, set, goal, gym, or cardio. This is the CLAUDE-named admin exception; the metrics/billing admin layer uses `adminDb()` restricted to these models' metadata.
- Comp grant/revoke writes a `comp_granted` / `comp_revoked` `AdminAuditEntry` in the **same transaction** via `inAdminTx` + `recordAudit`. Comp never creates or touches a Stripe subscription and never grants admin.
- Admin may **not** edit Stripe subscription state; the mirror is read-only in admin.

### Email-verification gate (not a Free gate)

The existing static guard (Public Accounts) forbids branching capabilities/Free features on `emailVerifiedAt`. This spec adds the **checkout gate**, which is not a Free gate: it blocks only `createCheckoutSessionAction`. The guard must be refined to allow a reference to `emailVerifiedAt` inside the billing checkout module while still forbidding it in any Free-feature path. Recorded as RD-11.

## 10. Storage model

Not applicable. This feature touches no Supabase Storage. Card data never touches Overload; it lives only on Stripe's hosted pages.

## 11. Server actions and API surface

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; details?: Record<string, string> } };

// --- Lifter billing actions (src/app/(app)/settings/billing/actions.ts) ---

// createCheckoutSessionAction(input: { interval: "month" | "year" }): Promise<ActionResult<{ url: string }>>
//   Auth: requireAccount. Precondition: emailVerifiedAt != null, else ActionResult error
//     code "invalid_state_transition" ("Verify your email to subscribe.") — UI shows the verify step first.
//   Side effects: ensures a Stripe customer (creates + stores BillingAccount.stripeCustomerId if absent);
//     creates a Checkout Session (mode=subscription, line item = env price id for the interval,
//     allow_promotion_codes=true, customer, client_reference_id=userId,
//     subscription_data.metadata.userId, automatic_tax.enabled=STRIPE_TAX_ENABLED,
//     success_url=/settings/billing?status=success, cancel_url=/settings/billing?status=cancelled).
//   Returns the session URL. Never trusts the return as payment.

// createPortalSessionAction(): Promise<ActionResult<{ url: string }>>
//   Auth: requireAccount. Precondition: BillingAccount.stripeCustomerId present, else "invalid_state_transition".
//   Side effects: creates a Billing Portal session; returns its URL.

// --- Admin comp actions (src/app/admin/accounts/[id]/actions.ts, extended) ---

// grantCompAction(input: { targetUserId: string; reason: CompReason; note?: string; endsAt?: string })
//   : Promise<ActionResult<{ granted: true }>>
//   Auth: requireAdmin. Validates reason; note required when reason="other"; endsAt (if set) must be future.
//   Side effects: inserts Entitlement(source=comp) + comp_granted audit, one inAdminTx transaction.
//     Blocked by the partial unique index if an active comp already exists → "duplicate_resource".

// revokeCompAction(input: { targetUserId: string }): Promise<ActionResult<{ revoked: true }>>
//   Auth: requireAdmin. Side effects: sets revokedAt/revokedByUserId on the active comp + comp_revoked audit,
//     one transaction. No-op (changed:false) if none active.

// --- Stripe webhook (the only route handler) ---

// POST /api/stripe/webhook  (src/app/api/stripe/webhook/route.ts)
//   No session. Verifies the Stripe signature against STRIPE_WEBHOOK_SECRET (raw body).
//   Unsigned/invalid signature → 400, nothing written.
//   Idempotent: INSERT the event id into webhook_events inside the transaction; a unique-violation
//     (replay) → commit nothing, return 200. Dedupe + mirror update + promo upsert are one transaction.
//   Handles: checkout.session.completed, customer.subscription.created|updated|deleted,
//     invoice.paid, invoice.payment_failed.
//   For each, re-fetches the authoritative Stripe object (subscription/customer) and overwrites the mirror
//     (so duplicate/late/out-of-order deliveries converge on Stripe's current truth). Resolves the account
//     from the Stripe customer id (checkout: also verifies client_reference_id). Unknown customer → 200 no-op (logged).
```

Stripe SDK access is wrapped in one adapter, `src/lib/billing/stripe.ts`, exporting pure functions over an injectable client (mirrors the recovery/signup injectable-deps pattern), so unit tests mock the adapter and integration tests use a fake/test-mode client. The client is never constructed in a component.

Error codes used: `invalid_state_transition` (unverified email, no customer), `duplicate_resource` (active comp exists), `validation_error` (bad reason/date), `plan_required` (402, Free hitting a Pro action), `not_found` (non-admin, foreign account), `internal_error` (Stripe/transport). `forbidden` is never used.

## 12. Validation rules

| Field | Validation | Error |
| ----- | ---------- | ----- |
| `interval` (checkout) | one of `month`, `year` | `validation_error` |
| email verified (checkout) | `Profile.emailVerifiedAt != null` | `invalid_state_transition` |
| `reason` (grant comp) | one of `CompReason` | `validation_error` |
| `note` (grant comp) | required non-empty when `reason = other`; ≤ 500 chars | `validation_error` |
| `endsAt` (grant comp) | optional; if set, a valid date strictly after `now` in the owner's timezone | `validation_error` |
| `targetUserId` (admin) | a UUID that resolves to an existing account | `not_found` |
| webhook body | valid Stripe signature | 400 (no ActionResult; raw handler) |

- All validation is server-side regardless of UI.
- The webhook never trusts amounts, plan, or account from the payload beyond the signed event; it re-fetches authoritative objects and resolves the account from the customer id.
- No internal/Stripe error detail is leaked to the client.

## 13. UI data contracts

```ts
type DisplayState = "free" | "trial" | "paid_monthly" | "paid_annual" | "comp" | "canceling" | "grace";

type BillingScreenDto = {
  displayState: DisplayState;
  label: string;            // e.g. "Pro — trial · 9 days left"
  explanation: string;
  canSubscribe: boolean;    // Free/trial (and email-verified path handled separately)
  canManage: boolean;       // has a Stripe subscription/customer
  emailVerified: boolean;
  trialDaysLeft: number | null;
  prices: { monthly: string; annual: string }; // display strings from config
  problem: boolean;         // grace
};

type Capability =
  | "progression_insights"
  | "e1rm_trends"
  | "exercise_history_intelligence"
  | "plan_import";

// Pro read DTOs gain a withheld marker rather than omitting the field silently.
type PlannedProgressionDto = {
  // ...existing fields...
  tag: "progress" | "deload" | "stalled" | null;   // null when locked OR genuine hold
  recommendation: RecommendationDto | null;        // null when locked
  suggestion: SuggestedLoadDto | null;
  points: E1rmPointDto[] | null;
  locked: Capability | null;                        // non-null => render one upgrade note
};

type AdminAccountBillingDto = {
  effectivePlan: "free" | "pro";
  source: "trial" | "subscription" | "comp" | "none";
  comp: { reason: CompReason; note: string | null; endsAt: string | null; grantedAt: string } | null;
  stripe: {
    status: SubscriptionStatus | null;
    interval: BillingInterval | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    promoCode: string | null;
    promoProgress: string | null; // e.g. "2 of 3 months" when known
  } | null; // null = no Stripe customer
};

type AdminBillingOverviewDto = {
  activeSubscriptions: number;      // paying only — never counts comps
  trials: number;
  complimentary: number;            // non-paying
  cancelingAtPeriodEnd: number;
  paymentProblems: number;          // in grace
  promo: { code: string; terms: string; redeemed: number; cap: number;
           recent: { handle: string; date: string }[] };
};
```

- `locked` drives exactly one upgrade note per surface; the Free-visible fields (plain history, goals, reps trend, heaviest, best set) are always present.
- Derived names (`progressionTag`/`tag`, `estimatedOneRepMax`, goal percent) are unchanged and identical across surfaces.
- No card data, Stripe secret, webhook secret, or raw Stripe error ever appears in a DTO or client bundle.

## 14. Testing strategy

Priority order follows CLAUDE.md. New standing coverage is added to `tests/integration/isolation/coverage.ts` for `Entitlement`, `BillingAccount`, `PromoRedemption` (each owned model gets the full read/change/detect-isolation suite); `WebhookEvent` gets the un-owned classification assertion (`scopeArgs` refuses it, `unclassifiedModels()` stays empty).

1. **Cross-account isolation (first, adversarial).** Account B's scoped client cannot read, count, change, or delete A's `Entitlement`/`BillingAccount`/`PromoRedemption`; a foreign id is indistinguishable from missing. B cannot resolve as Pro from A's comp. Deleting an account removes its billing rows (added to `ACCOUNT_DELETION_ORDER`) and nothing else's.
2. **Logged-history integrity.** Trial expiry, downgrade, cancellation, revocation, and failed payment never write, alter, or delete a `LoggedSet`, plan, goal, gym, or cardio row (assert row-level snapshots before/after each transition).
3. **Capability enforcement (the AC-2 core).**
   - A Free account calling `getPlannedProgression`/`getSessionProgressionSummary`/`getExerciseHistory` directly receives withheld Pro fields (`null` + `locked`), never a Pro value.
   - A dedicated Pro action (if present) returns `plan_required` to Free.
   - Trial grants Pro; after `endsAt` the same read returns Free (time injected).
   - Comp grants Pro independent of Stripe; revoke recomputes to the remaining source.
   - Overlap: trial+subscription, comp+subscription, trial expiring while comp active — Pro persists while any source is valid; a comp is never reported as a subscriber (`source` distinguishes).
4. **Billing-event security & idempotency.**
   - Unsigned/invalid-signature webhook → 400, nothing written.
   - The same event id processed twice → second is a no-op (mirror unchanged, no duplicate `PromoRedemption`).
   - Out-of-order/late events converge because the handler reconciles to the re-fetched Stripe object; an older snapshot cannot overwrite newer truth.
   - Subscription is associated with the correct account (customer-id resolution; a mismatched `client_reference_id` is rejected).
   - A browser return to `?status=success` with no webhook leaves the account non-Pro (resolver ignores the query param).
5. **Subscription lifecycle.** active → Pro; cancelAtPeriodEnd → Pro until period end then Free; past_due → Pro until `graceEndsAt` then Free; recovery (`invoice.paid`) → Pro again, grace cleared; canceled/unpaid → Free. No training data touched at any step.
6. **Promotion (Stripe test mode).** BLIZZY applies 50% for 3 monthly periods then regular price; stops accepting at the 200 cap; rejects a non-first-time customer; applies only to the monthly price; `PromoRedemption` mirrored once; regular renewal price disclosed. Verify the real repeating-coupon month-count semantics in test mode (not an invented day count).
7. **Founding-member transition.** The operator script, run against a seeded set, grants comp (reason=founding_member) to each named account in one transaction, changes no training data, and marks none as paying; a dry run writes nothing; re-run is blocked by the active-comp unique index (idempotent).
8. **Admin authorization & privacy.** A non-admin cannot reach `/admin/billing` or the comp actions (URL or direct action call → not_found). Grant/revoke write an audit entry in the same transaction (rollback leaves neither). Admin billing views expose no training content. The mirror is read-only (no admin path edits Stripe state).
9. **Email-verification gate.** `createCheckoutSessionAction` refuses an unverified account; every Free feature remains reachable for an unverified account (static guard asserts no Free path reads `emailVerifiedAt`).
10. **Card-data safety.** No test fixture, DTO, log line, or client bundle contains a card number; `verify:client-bundle` stays green (no Stripe secret/webhook secret in `.next/static`).
11. **Auth/RLS.** New tables RLS deny-all; anon Data API returns nothing for `entitlements`, `billing_accounts`, `promo_redemptions`, `webhook_events`.
12. **UI behavior.** The upgrade note renders once per surface and dismisses; the success-return "finishing up" state never asserts Pro; the Settings sub-label matches the resolved state; admin dialogs validate reason/date.

Stripe is exercised in **test mode only** (or a mocked adapter in unit tests). Any check needing live Stripe, a real charge, external email delivery, or a production environment is reported **unverified**, never passed.

## 15. Acceptance criteria

**Trial lifecycle (AC-1)**
- [ ] A new account has Pro (all four capabilities) for 14 days from signup.
- [ ] After 14 days with no other valid source, the same reads resolve Free; logging/history/goals/export continue; nothing is deleted.
- [ ] Trial expiry requires no page visit and no job (pure date math on read).

**Server-enforced Pro (AC-2)**
- [ ] A Free account cannot obtain a progression recommendation, e1RM trend, stall result, or PR-intelligence call through any read path or direct server-action call.
- [ ] Enforcement holds with the UI bypassed (query-layer withholding + `plan_required`).

**Complimentary access (AC-3)**
- [ ] The owner can grant and revoke comp; a grant has a reason (+ optional end date); both are audited.
- [ ] A comp account has Pro capabilities but is never shown or counted as a paying subscriber.
- [ ] Comp creates/touches no Stripe subscription and grants no admin.

**Billing events (AC-4)**
- [ ] Subscription state is established only through signature-verified events.
- [ ] A replayed/duplicate event changes nothing; out-of-order events converge on Stripe truth.

**Promotion (AC-5)**
- [ ] BLIZZY applies its 50%/3-month discount, then the regular price; stops at 200 redemptions; first-time + monthly-only; redemption mirrored once.
- [ ] The regular renewal price and cancellation terms are disclosed before and after checkout.

**Payment failure & card safety (AC-6)**
- [ ] Failed payment enters a 7-day grace (still Pro); recovery restores; expiry → Free; no training data changed.
- [ ] Overload stores/logs no card data; card entry is only on Stripe's hosted page.

**Supporting**
- [ ] Free retains plan building, logging, RIR entry, cardio, full basic history + correction, goals + progress, export, deletion, support.
- [ ] Founding members become comp with data intact and not labelled paying.
- [ ] First checkout requires a verified email; Free needs no verification.
- [ ] Admin billing views expose no training content and cannot edit Stripe state.
- [ ] New tables are RLS deny-all; cross-account isolation suite extended and green.
- [ ] The web purchase/management journey works on desktop and mobile browsers (no native dependency).

## 16. Explicit non-goals

- ❌ Native iOS/Android billing, Capacitor, StoreKit, Play Billing, Universal Links, native return handling. **Deferred** (iOS Foundation, postponed).
- ❌ Public landing/pricing/`/blizzy`/changelog pages. **Deferred** (next pitch).
- ❌ Plan import workflow / language-model integration. **Deferred** (reserves `plan_import` only).
- ❌ Additional tiers, referral/affiliate, creator payouts, card forms, token storage. **Permanent.**
- ❌ Live Stripe mode, real charges, production migration/entitlement change, public-signup activation. **Deferred** to the human launch gate.
- ❌ Any change to progression thresholds, the e1RM formula, RIR qualifiers, scheduled deloads, gym baselines. **Permanent** (read-and-gate only).
- ❌ Program/mesocycle generation, AI coach, social, ads, dated goals, rest timer, cardio progression, admin view of training content. **Permanent.**

## 17. Resolved Decisions

Recorded per the Autonomous Pipeline Policy; each has a rationale and the authority it rests on.

- **RD-1 — Capability names & mapping.** Four capabilities: `progression_insights` (recommendations, evidence, suggested load, stall gate, RIR qualifiers), `e1rm_trends` (e1RM/weight trend + best-e1RM record), `exercise_history_intelligence` (per-session calls + rep-record frontier), `plan_import` (reserved, unused). Free→{}; Pro→all. *Authority:* pitch §4.5/§4.3 + architecture capability model; spec owns names (pitch §14 "delegated to the spec").
- **RD-2 — Entitlement shape.** `Entitlement` stores only Overload-owned sources (`trial`, `comp`); subscription lives in `BillingAccount`; effective plan computed on read across both. *Authority:* architecture Data Model (Entitlement = trial/subscription/comp with start/end; BillingAccount = Stripe mirror) + CLAUDE "computed from records"; keeps Stripe the sole subscription authority.
- **RD-3 — Trial = 14 days from signup, stored as an endsAt on a trial Entitlement, expiry by date math on read.** No job, no page-visit dependency. *Authority:* pitch §4.6/§4.7 decision #3.
- **RD-4 — Subscription→Pro mapping** (table in §6), incl. `cancelAtPeriodEnd` Pro-until-period-end and `past_due` Pro-until-`graceEndsAt`. *Authority:* pitch §4.12/§4.13; architecture eventual-consistency.
- **RD-5 — Grace = 7 days**, stored as `graceEndsAt` set on first `past_due`. Flagged for owner confirmation before live billing. *Authority:* pitch §4.13 (pipeline-guide proposed default).
- **RD-6 — Webhook idempotency & ordering: dedupe by event id (`WebhookEvent`) + reconcile to the re-fetched authoritative Stripe object** rather than trusting the event snapshot. *Authority:* pitch §4.22/§9.8; architecture idempotency; standard Stripe practice.
- **RD-7 — BLIZZY = Stripe coupon (`percent_off=50, duration=repeating, duration_in_months=3`) + promotion code (`max_redemptions=200`, `restrictions.first_time_transaction=true`), coupon restricted to the monthly product.** Entered on Stripe's hosted page (`allow_promotion_codes`), not in Overload. Month-count semantics verified in test mode; no invented day count. *Authority:* pitch §4.17/§9.9; decision #9.
- **RD-8 — Prices via env-configured Stripe test-mode price IDs**; display strings ($4.99/mo, $39.99/yr) in config. Owner confirms real products/prices before live. *Authority:* pitch §4.9 decision #5.
- **RD-9 — Enforcement in the query/read layer (server-side withholding) + `requireCapability`/`plan_required` for actions.** UI `locked` markers are presentation only. *Authority:* pitch §4.5/§9.2 AC-2; CLAUDE "hiding a button is not enforcement".
- **RD-10 — Founding members via the comp mechanism, applied by a human-run operator script** (dry-run default, named set, one transaction); not run by this pipeline. *Authority:* pitch §4.8 decision #4; CLAUDE operator-task rules.
- **RD-11 — Email-verification checkout gate is not a Free gate.** Only `createCheckoutSessionAction` reads `emailVerifiedAt`; the Public Accounts static guard is refined to allow this one billing-module reference while still forbidding any Free-feature branch on verification. *Authority:* pitch §4 (verify before first checkout) decision #12; Public Accounts spec R-verification.
- **RD-12 — Tax: `automatic_tax` behind `STRIPE_TAX_ENABLED` (default off).** Not enabled by the run; owner decision before live. *Authority:* pitch §4.23 decision #14.
- **RD-13 — Migration `9j_plans_billing`** (follows the `9i` letter-suffix convention); additive; RLS deny-all + ownership/same-owner triggers on the three owned tables; `WebhookEvent` un-owned. *Authority:* codebase migration convention + CLAUDE RLS invariant.
- **RD-14 — Webhook handler & founding-member script are named raw-Prisma exceptions** added to the ESLint `RAW_DATA_ACCESS` allowlist (like `throttle.ts`); `WebhookEvent` added to `UNOWNED_SYSTEM_MODELS`. *Authority:* CLAUDE first-invariant named exceptions (billing webhook handler; operator tasks).
- **RD-15 — Upgrade-note dismissal is client-side (localStorage) per surface.** Cosmetic, not entitlement; no table. *Authority:* design doc §Screen 4; CLAUDE "no stored UI flag" spirit.

## 18. Open questions

1. **(blocking, owner)** Final production prices, the authoritative Stripe products, and whether to enable Stripe Tax — owner confirms before live billing. Default for the run: test-mode price IDs via env, `STRIPE_TAX_ENABLED=false`.
2. **(non-blocking)** Exact `promoProgress` ("N of 3 months") derivation from the Stripe discount object — display-only; default to showing the raw discount end when the month index is not directly available in test mode.
3. **(non-blocking)** Whether existing accounts should also keep a (now-moot) trial row in addition to the founding-member comp. Default: comp only; no trial backfilled (comp already grants Pro).
4. **(non-blocking)** Grace length (7 days) is a configurable default pending owner confirmation (RD-5); no code change needed to retune.

All architecture.md Open Questions this feature touches (entitlement/capability model shape, Free/Pro mapping, trial-vs-coupon interaction, grace length, tax, webhook event set) are resolved above as named constants/decisions or carried to #1 as owner-blocking for **live** billing only — none blocks the test-mode implementation.

## 19. Future considerations

- `plan_import` capability is defined and Pro-granted now so the later Plan Import pitch gates on it with no entitlement change.
- The platform-neutral resolver means a future native client calls the same `resolveEntitlement`; only the purchase/return transport differs (store-billing path decided in the mobile pitches).
- `BillingAccount` is shaped to add future fields (e.g. a lifetime or additional price) without touching training history; new capabilities are Pro-by-default per CLAUDE.
- The Landing Page will read plan descriptions and reuse `createCheckoutSessionAction`'s entry point rather than duplicating billing logic.
