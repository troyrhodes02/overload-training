# OVE-112 runbook — owner actions outside the codebase

Nothing here is needed for staging beyond the dev migration, which the pipeline applies to `overload-dev`. Everything below is for the eventual Production promotion and is a human step.

## 1. Production migration (human, with a backup)

`prisma/migrations/9n_trial_notices/migration.sql` adds two nullable `TIMESTAMPTZ` columns to `profiles`. It is additive only: nothing is dropped, renamed, or written, and the table already has deny-all RLS.

1. Take a backup of `overload-prod` immediately before.
2. Apply the migration from the release branch with the standard production-migration runbook (`DIRECT_URL` for `overload-prod`, `--confirm-ref`).
3. Verify:
   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'profiles' AND column_name LIKE 'trial_%_notice_at';
   -- expect two rows, timestamp with time zone, YES
   ```

Deploy order: migration first, then the code. The generated client selects these columns on any full-row `Profile` read (for example the data export), so code deployed before the migration would fail those reads.

## 2. Stripe (Production, owner-only, no code involved)

- The code now offers the promotion-code field on **annual** Checkout too. That matches the owner-stated live coupon: 25% off the Overload Pro product, three-month duration, 200 redemptions. Before promoting, confirm in the Stripe dashboard that the coupon applies to both Pro prices and is `duration: repeating, duration_in_months: 3`. On an annual price, Stripe then discounts only the first annual invoice, which is what `/blizzy` now says.
- Supersedes the Pitch 19 runbook note to "restrict the coupon to the monthly price".
- No coupon, promotion code, price, product, or webhook destination is created or changed by code.

## 3. Production environment

- Pricing, the 14-day trial, and founding-member comps are unchanged.
- Whether the trial notices offer a purchase in Production follows `STRIPE_BILLING_ENABLED`. While it is unset, the notices show facts only, with a single "Got it".
- `PLAN_IMPORT_ENABLED` stays off in Production, so the notices do not mention plan import there.

## 4. iOS Foundation contract

The app shell must append `OverloadApp/<version>` to its user agent (Capacitor `appendUserAgent`). With it, Plan & Billing is read-only and the notices carry no purchase. Without it, the shell behaves like a browser and would show web Checkout. Verify on a device; this is unverified until then.
