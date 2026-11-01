# Runbook — Plans, Billing & Promo Codes (Pitch 19 / roadmap 20)

Human-only production steps. The autonomous run used **Stripe test mode only** and applied the migration to the **dev/embedded** database only. Nothing here runs by itself; the owner performs each step deliberately. Do not switch Stripe to live, collect real payments, or enable public signup until **Launch Readiness & Closed Beta** passes.

## 0. Pre-flight

- Merge gate: PR #112 (feature) stays **open for human approval**. Review the diff and the per-ticket PRs (#113–#119) first.
- This feature changes money/entitlements/access. Verify on a Vercel preview against the Supabase **dev** project with at least two accounts before anything reaches production.

## 1. Environment variables (server-only; never `NEXT_PUBLIC_`)

Add to Vercel (dev/preview first, production later) and local `.env`:

| Variable | Purpose | Notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Stripe API key | **test-mode** `sk_test_…` everywhere except production |
| `STRIPE_WEBHOOK_SECRET` | webhook signature secret | from the Stripe CLI (local) or the dashboard endpoint (deployed) |
| `STRIPE_PRICE_ID_MONTHLY` | monthly Pro price id | from the Stripe product (below) |
| `STRIPE_PRICE_ID_ANNUAL` | annual Pro price id | from the Stripe product |
| `STRIPE_TAX_ENABLED` | `"true"` to enable automatic tax | **leave unset/false** until the owner confirms tax registration (§6) |
| `NEXT_PUBLIC_APP_URL` | absolute app origin | for Stripe return URLs; this is the only billing var that is public |

The Stripe secret, webhook secret, and price ids are server-only. `verify:client-bundle` guards that no server DB secret leaks; keep Stripe keys out of any `NEXT_PUBLIC_` var.

## 2. Stripe products & prices (test mode first)

1. In the Stripe **test** dashboard, create a product "Overload Pro".
2. Add two recurring prices: **$4.99/month** and **$39.99/year** (the approved planning values — owner confirms before live). Copy their price ids into `STRIPE_PRICE_ID_MONTHLY` / `STRIPE_PRICE_ID_ANNUAL`.
3. Repeat in **live** mode only at launch, with owner-confirmed prices, and swap the env values.

## 3. Webhook registration & signing

1. Local: `stripe listen --forward-to localhost:3000/api/stripe/webhook`; copy the printed signing secret into `STRIPE_WEBHOOK_SECRET`.
2. Deployed: add an endpoint `https://<host>/api/stripe/webhook` in the Stripe dashboard; subscribe to `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`; copy its signing secret into the environment.
3. Verify (test mode): trigger `stripe trigger checkout.session.completed` and a `customer.subscription.updated`; confirm the `BillingAccount` mirror updates and a replay changes nothing (the `webhook_events` ledger dedupes).

## 4. BLIZZY promotion (test mode; verify month semantics)

1. Create a **coupon**: `percent_off=50`, `duration=repeating`, `duration_in_months=3`, restricted to the **monthly** Pro product.
2. Create a **promotion code** `BLIZZY` on that coupon: `max_redemptions=200`, `restrictions.first_time_transaction=true`.
3. **Verify in test mode** how Stripe counts the three repeating months against the monthly billing period (the pitch forbids inventing a day count). Confirm: the discount applies to the first three monthly invoices, then the regular $4.99 applies; the code stops being accepted at 200 redemptions; a non-first-time customer is rejected. Checkout's `allow_promotion_codes` field is where the lifter enters it.
4. Confirm the checkout page discloses the promotional price, its duration, the regular recurring price after, auto-renewal, and cancellation.

## 5. Founding-member comp migration (human-run)

After the production migration (§7) and deploy:

1. Dry run (prints exactly who, writes nothing):
   `DIRECT_URL=<prod direct url> npm run founding-members:grant -- --before <ISO cutoff>`
2. Confirm the resolved set, then execute (non-local host requires `--confirm-host`):
   `DIRECT_URL=<prod direct url> npm run founding-members:grant -- --before <ISO cutoff> --execute --confirm-host <db host>`
3. It grants complimentary Pro (`reason=founding_member`) to every existing account with no active comp, in one transaction, create-only, idempotent. It touches no training data and creates no Stripe subscription. Re-running is safe (the active-comp unique index skips the already-granted).

## 6. Tax decision (owner)

Stripe Tax is **off** by default (`STRIPE_TAX_ENABLED` unset). Enable it only after confirming business registration and nexus. Do not collect a tax you are not registered for. This is an owner/legal decision, not an engineering toggle; record the decision before flipping the flag in production.

## 7. Production migration (human, from a backup)

1. Take a fresh backup of `overload-prod` immediately before.
2. Apply `prisma/migrations/9j_plans_billing` with `prisma migrate deploy` against production (DIRECT_URL). It is additive: four new tables (`entitlements`, `billing_accounts`, `promo_redemptions`, `webhook_events`), five new enums, two additive `AdminAuditAction` values, RLS deny-all + ownership triggers on the owned tables. Nothing is dropped or backfilled.
3. New signups get a 14-day trial automatically (code). Existing accounts get Pro only via the founding-member script (§5).

## 8. Admin comp procedures (owner)

- Grant/revoke complimentary Pro per account at `/admin/accounts/[id]` → Plan & entitlement. Each requires a reason (+ optional end date) and writes an append-only audit entry; it never touches Stripe and never grants admin.
- `/admin/billing` shows aggregate counts (comps counted separately from paying) and BLIZZY redemptions, read-only.
- Admin identity is the `OVERLOAD_ADMIN_USER_IDS` allowlist (unchanged).

## 9. Failed-payment grace

7-day grace (`GRACE_PERIOD_DAYS`) is a configurable default — confirm before launch. On `past_due` the account keeps Pro until `graceEndsAt`; recovery clears it; otherwise it lapses to Free with no data lost. Configure Stripe's dunning/retry settings consistent with the 7-day window.

## 10. Security verification (before launch)

- Webhook rejects unsigned/invalid-signature requests (400) and is idempotent (replay no-op).
- A Free account receives no Pro result through any read path or server action.
- Card data never touches Overload (hosted Checkout + Portal only); `verify:client-bundle` green.
- Cross-account isolation suite green incl. the new owned models; deny-all RLS on all four new tables.
- Admin billing views expose no training content; comp grant/revoke audited; Stripe mirror read-only.

## 11. Deployment sequencing

backup → apply `9j` migration → set env (test-mode Stripe) → deploy → configure webhook endpoint → test-mode end-to-end on preview → founding-member comp migration → (later, at Launch Readiness) live Stripe + live prices + enable paid launch.

## 12. Rollback / recovery

- The migration is additive; rollback is dropping the four tables + enums (only if no production data was written to them). Prefer forward-fix.
- Billing state is reconstructable: the mirror is rebuilt from Stripe by re-fetching subscriptions; `webhook_events` can be cleared to allow reprocessing if ever needed (idempotency is by current Stripe truth, not stored deltas).
- Entitlement records (trial/comp) are the only Overload-owned billing state; a comp can be re-granted; a trial is pure date math.

## 13. Human-only / deferred

- Switching Stripe to **live mode**, real charges, live prices, enabling **paid launch** — gated on Launch Readiness & Closed Beta + owner sign-off.
- Enabling **public signup** — separate owner step, unchanged by this pitch.
- The founding-member comp migration and the production schema migration (above).
- **iOS/native billing — deferred.** iOS Foundation is postponed; this feature is web-only. Native purchase flows (App Store external-link rules, Play Billing) are decided in the later store-release pitches. The entitlement model is platform-neutral so the same resolved access serves a future native client.
