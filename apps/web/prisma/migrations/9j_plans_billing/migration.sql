-- Plans, Billing & Promo Codes (spec 19 section 8). HAND-WRITTEN, reviewed.
--
-- Additive only. Nothing is dropped, renamed, truncated, or cascaded, and no
-- row is written. Four new tables and five new enums (plus two additive
-- AdminAuditAction values):
--   entitlements      - OWNED. One row per Overload-owned Pro source (trial or
--                       comp) for an account. Effective plan is derived on read
--                       from these rows plus the billing_accounts mirror;
--                       NOTHING here is a stored progression tag. FK to profiles
--                       ON DELETE RESTRICT; user_id immutable (shared trigger
--                       from 9_account_ownership_2_enforce). Two partial unique
--                       indexes: one trial per account, one active comp.
--   billing_accounts  - OWNED, one per account (user_id is the PK). The Stripe
--                       customer reference and a read-only mirror of subscription
--                       state, written only by the webhook handler and checkout
--                       creation. FK RESTRICT; user_id immutable.
--   promo_redemptions - OWNED. A mirror of a promo code redeemed by an account,
--                       written from verified events. FK RESTRICT; user_id
--                       immutable. Unique (user_id, code).
--   webhook_events    - UN-OWNED system table (like auth_throttle): the Stripe
--                       event-id ledger for idempotency. No owner column, no FK,
--                       no personal data. RLS deny-all.
-- Every new table enables RLS with NO policy (deny-all); Prisma bypasses RLS.
-- ASCII only: the embedded test Postgres runs in WIN1252.

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('free', 'pro');
CREATE TYPE "EntitlementSource" AS ENUM ('trial', 'comp');
CREATE TYPE "CompReason" AS ENUM ('friend', 'creator', 'tester', 'founding_member', 'other');
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused');
CREATE TYPE "BillingInterval" AS ENUM ('month', 'year');

-- AlterEnum: additive new values. Nothing in this migration USES them, so it is
-- safe alongside the other DDL (Postgres only forbids USING a newly added enum
-- value in the transaction that added it). The DB type is "AdminAuditAction"
-- (the Prisma enum has no @@map), not a snake_case name.
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'comp_granted';
ALTER TYPE "AdminAuditAction" ADD VALUE IF NOT EXISTS 'comp_revoked';

-- CreateTable: entitlements (owned)
CREATE TABLE "entitlements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" "EntitlementSource" NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'pro',
    "started_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ,
    "comp_reason" "CompReason",
    "comp_note" TEXT,
    "granted_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ,
    "revoked_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "entitlements_user_id_idx" ON "entitlements" ("user_id");
CREATE INDEX "entitlements_user_id_source_idx" ON "entitlements" ("user_id", "source");

-- At most one trial per account.
CREATE UNIQUE INDEX "entitlements_one_trial_per_account"
  ON "entitlements" ("user_id") WHERE "source" = 'trial';
-- At most one active (non-revoked) comp per account.
CREATE UNIQUE INDEX "entitlements_one_active_comp_per_account"
  ON "entitlements" ("user_id") WHERE "source" = 'comp' AND "revoked_at" IS NULL;

ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- CreateTable: billing_accounts (owned, one per account)
CREATE TABLE "billing_accounts" (
    "user_id" UUID NOT NULL,
    "stripe_customer_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "status" "SubscriptionStatus",
    "interval" "BillingInterval",
    "current_period_end" TIMESTAMPTZ,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "grace_ends_at" TIMESTAMPTZ,
    "price_id" TEXT,
    "promo_code" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "billing_accounts_pkey" PRIMARY KEY ("user_id")
);

CREATE UNIQUE INDEX "billing_accounts_stripe_customer_id_key" ON "billing_accounts" ("stripe_customer_id");
CREATE UNIQUE INDEX "billing_accounts_subscription_id_key" ON "billing_accounts" ("subscription_id");

ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- CreateTable: promo_redemptions (owned)
CREATE TABLE "promo_redemptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "promotion_code_id" TEXT,
    "subscription_id" TEXT,
    "redeemed_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "promo_redemptions_user_id_code_key" ON "promo_redemptions" ("user_id", "code");
CREATE INDEX "promo_redemptions_user_id_idx" ON "promo_redemptions" ("user_id");
CREATE INDEX "promo_redemptions_code_idx" ON "promo_redemptions" ("code");

ALTER TABLE "promo_redemptions" ADD CONSTRAINT "promo_redemptions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- CreateTable: webhook_events (un-owned system table)
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_events_type_idx" ON "webhook_events" ("type");

-- Deny-all RLS on every new table. The Data API must return nothing. Do not add
-- any policy for anon or authenticated.
ALTER TABLE "entitlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promo_redemptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;

-- Second layer (9_account_ownership_2_enforce): ownership is immutable on every
-- owned table. Each owned billing table's only FK is to profiles, so no
-- same-owner trigger is needed (there is no second owned parent to mismatch).
CREATE TRIGGER "entitlements_user_id_immutable" BEFORE UPDATE OF "user_id" ON "entitlements"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "billing_accounts_user_id_immutable" BEFORE UPDATE OF "user_id" ON "billing_accounts"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
CREATE TRIGGER "promo_redemptions_user_id_immutable" BEFORE UPDATE OF "user_id" ON "promo_redemptions"
  FOR EACH ROW EXECUTE FUNCTION "overload_user_id_immutable"();
