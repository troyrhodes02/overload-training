# Overload — Payments Go-Live Checklist

This is how the owner switches web subscriptions through Stripe Checkout to live mode. It belongs to Pitch 23, Paid-Launch Safeguards, and its before-live items, and it does not wait for the rest of that pitch. Everything here is an owner step. A run never sets a Production environment variable, uses a live Stripe key, or makes a real charge.

Statements about the code were checked against the repository on 2026-11-12. Anything marked **(unverified)** depends on a dashboard, a provider, or the Production environment, which the code cannot show. This checklist is not legal or tax advice.

It replaces the "later, at Launch Readiness" wording in sections 11 and 13 of the Plans & Billing runbook (`docs/pitches/mvp-4-web-commercial/19-plans-billing-promo-codes/runbook.md`). The rest of that runbook still applies.

The iPhone app is out of scope. It has no purchase flow until the App Store pitch decides the store billing path, and the server enforces that: `startCheckout` and `startPortal` refuse a request from an app shell (`src/lib/billing/checkout.ts`).

## 1. Before going live

### Environment variables (Vercel, Production only)

All of these are server-only except `NEXT_PUBLIC_APP_URL`. Keep the Stripe values out of any `NEXT_PUBLIC_` variable. Vercel applies an environment-variable change only on the next deployment.

| Variable | Live value | Read in | What it does |
| --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | the live secret key, `sk_live_…` (a restricted key also works if it can read and write customers, Checkout sessions, subscriptions, invoices, refunds, and portal sessions **(unverified: test a restricted key in test mode first)**) | `src/lib/billing/stripe.ts:85` (the Stripe client) and `:279` (cancellation before account deletion) | Every Stripe call. If it is unset, account deletion is refused for any account whose mirror shows a subscription. |
| `STRIPE_WEBHOOK_SECRET` | the signing secret of the **live** webhook endpoint, `whsec_…` | `src/lib/billing/stripe.ts:336` | Verifies every webhook. The test endpoint's secret will not verify live events. |
| `STRIPE_PRICE_ID_MONTHLY` | the live monthly Pro price id | `src/lib/billing/stripe.ts:93-98` | Checkout's line item for the monthly plan. |
| `STRIPE_PRICE_ID_ANNUAL` | the live annual Pro price id | `src/lib/billing/stripe.ts:93-98` | Checkout's line item for the annual plan. |
| `STRIPE_BILLING_ENABLED` | `true`, exactly, and set **last** | `src/lib/billing/config.ts:81` | The checkout kill switch. Any other value, including unset, hides Subscribe and makes `startCheckout` refuse before any Stripe call. It is not listed in the Plans & Billing runbook's variable table or in `.env.example`. |
| `STRIPE_TAX_ENABLED` | leave unset until your tax decision (section 5) | `src/lib/billing/stripe.ts:103` | `true` turns on Stripe's automatic tax in Checkout. |
| `NEXT_PUBLIC_APP_URL` | the Production origin, `https://www.overloadtraining.app` **(unverified: confirm this is the canonical origin)** | `src/lib/billing/stripe.ts:327` (Checkout success and cancel URLs, portal return URL) and `src/lib/accounts/verification.ts:116` (the email-verification link) | If unset, these URLs fall back to `http://localhost:3000`. |

There is no publishable key. Checkout and the portal are hosted by Stripe, so the browser never needs one.

### Gates the code already enforces

- **Kill switch.** Checkout opens only when `STRIPE_BILLING_ENABLED` is `true` (`src/lib/billing/config.ts:80-82`). The billing screen, the trial notice, and the marketing context all read the same switch, so the page and the server agree.
- **Verified email.** Checkout is refused until `Profile.emailVerifiedAt` is set (`src/lib/billing/checkout.ts`). So account email must work in Production for real addresses before anyone outside the team can pay (section 5).
- **Who can subscribe.** Only an account on Free or on an active trial can start Checkout. A paid, canceling, past-due, or comped account is refused on the server.
- **One subscription per account.** Each account has a checkout lock. Before a session is created, Stripe is asked about open subscriptions, and older open sessions are expired. After each webhook, `enforceSingleSubscription` refunds and cancels any duplicate (`src/lib/data/billing-webhook.ts`).

### Live webhook endpoint

- In the live dashboard, add the endpoint `https://<production origin>/api/stripe/webhook`. The route is `src/app/api/stripe/webhook/route.ts`. It is exempt from auth redirects (`src/lib/auth-routes.ts:55`).
- Subscribe it to exactly the six event types the reconciler handles (`src/lib/data/billing-webhook.ts:79-86`):
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`

  Other events are accepted and ignored.
- Copy that endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`.
- The SDK is pinned to API version `2026-10-28.endive` (`src/lib/billing/stripe.ts:87`). The reconciler re-fetches the subscription with the SDK instead of trusting the payload. Even so, set the endpoint's API version to match **(unverified: what the live account defaults to)**.

### Products, prices, and promotion codes (live mode)

- **Product and prices.** Create one Pro product with two recurring prices: monthly and annual. The amounts shown in the app come from `PRICE_DISPLAY` in `src/lib/billing/config.ts`: **$4.99 a month** and **$39.99 a year**. These strings are display-only, so the live prices must match them. If you change a price, change those strings in a normal pitch or chore first.
- **No Stripe-side trial.** Do not add a trial to the live prices. Overload's 14-day trial is its own `Entitlement` row, and Checkout is created with no trial period, so payment is taken at checkout. The screen says so: "charged when you complete checkout" (`src/components/billing/plan-billing.tsx:76`).
- **Promotion codes.** Checkout sets `allow_promotion_codes: true`, so any active live promotion code on the Pro product is accepted. Only create codes you mean to honor.
  - **BLIZZY.** If you want the creator promotion live, recreate it in live mode: a coupon for 25% off the Pro product for three months, with a promotion code `BLIZZY` (maximum 200 redemptions, first-time transaction only). The `/blizzy` page was removed (OVE-118). The admin billing page still counts BLIZZY redemptions.
  - Test-mode coupons and codes do not carry over to live mode.

### Customer Portal (live mode)

The portal is configured separately in live mode. The code only opens a session (`src/lib/billing/stripe.ts:158-163`) and relies on the dashboard settings:

- Allow updating the payment method and viewing invoices.
- Allow cancellation. The mirror handles both cancel-at-period-end and a scheduled `cancel_at`, and access lasts until the period ends. Cancel at the period end is the setting that matches the in-app copy.
- **Plan switching** between monthly and annual is optional. If you turn it on, list only the two live Pro prices. The webhook re-reads the interval. **(Unverified: plan switching in the portal has no test in the repository.)**
- Fill in the business name, the support link, and the links to the terms and privacy pages (section 5).

### Data and environment

- **Backup.** Take a fresh Production backup before the switch-on.
- **No test-mode billing rows in Production.** A `BillingAccount` row made with test keys holds a test customer id, which live keys cannot find.
  - Checkout and the page-load refetch would fail for that account.
  - Worse, account deletion treats a missing customer as "nothing to cancel" (`src/lib/billing/stripe.ts:299-301`).

  Confirm on the admin billing page that Production has no paying or billing rows from test mode **(unverified: how Production has been configured until now)**. If any exist, stop and plan their cleanup in a chore.
- **Retry behavior.** In the live dashboard, set what Stripe does after the last failed payment retry. Canceling the subscription is what matches the app: when the grace window ends, the app shows Free anyway.

## 2. Switch-on order

1. Take a fresh Production backup.
2. Live dashboard: create the product, the two prices, any promotion codes, the Customer Portal settings, the retry and dunning settings, and the webhook endpoint.
3. Vercel Production:
   - set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_ANNUAL`, and `NEXT_PUBLIC_APP_URL`;
   - leave `STRIPE_BILLING_ENABLED` unset;
   - leave `STRIPE_TAX_ENABLED` as your tax decision says.
4. Redeploy Production and confirm the deployment succeeded.
5. With checkout still off, confirm that `/pricing` and `/settings/billing` load, that Subscribe is hidden, and that the webhook endpoint shows no delivery failures.
6. Set `STRIPE_BILLING_ENABLED=true` in Vercel Production and redeploy.
7. Run the first-hour checks (section 3) right away, with your own account first.

## 3. First hour

- **A real subscription.** Create a new account with a non-team email address. Verify the email, then subscribe monthly with a real card. Refund it afterwards from the Stripe dashboard if you like.
  - Stripe redirects to `/settings/billing?status=success`.
  - The live webhook log shows `checkout.session.completed`, `customer.subscription.created`, and `invoice.paid`, each answered with 200.
- **Entitlement.** `/settings/billing` shows the paid monthly state. A Pro surface, such as the progression call on an exercise, shows Pro results. The admin billing page counts one paying account.
- **Portal cancel and the downgrade.**
  - Open Manage billing, cancel, and return. The screen shows "canceling" with the end date, and Pro stays on until then.
  - To see the downgrade right away, cancel immediately from the Stripe dashboard instead. After `customer.subscription.deleted`, the account shows Free and every workout, set, plan, and goal is still there.
- **Failed payment.**
  - Use a card that is declined on renewal, or watch the first real failure. Live mode has no test cards **(unverified: a live failure cannot be staged without a real card that declines)**.
  - Expect `invoice.payment_failed`. The mirror moves to `past_due`, the screen shows the grace state, and Pro stays on for 7 days (`GRACE_PERIOD_DAYS`, `src/lib/billing/config.ts`).
  - The failed-payment path is already tested in test mode. Repeat it there if a live failure is impractical.
- **Webhook log.** Every delivery should be 2xx. A 400 means the signing secret is wrong, and a 500 means processing failed, which Stripe retries and replays safely.

## 4. Behavior to confirm

- **Deletion cancels billing first.** Deleting an account first cancels every open subscription on its Stripe customer, immediately, with no proration, no final invoice, and no automatic refund (`src/lib/billing/stripe.ts:265-322`, `src/lib/billing/cancel-on-deletion.ts`).
  - If that fails, or Stripe is not configured while the mirror shows a subscription, nothing is deleted.
  - Confirm once in live mode with a throwaway paid account. The cancellation should appear in Stripe before the account disappears.
  - Refunds are handled by support, not by the code.
- **Lapse.**
  - Once a subscription ends (canceled, unpaid, or past due beyond the grace window), the account resolves to Free (`subscriptionResolution`, `src/lib/entitlements/resolve.ts`).
  - Nothing is deleted or locked. Capture, history, and export stay free.
  - A canceling subscription keeps Pro until its period ends, even if a webhook is late.
- **Trial interaction.**
  - The 14-day trial is Overload's own entitlement, not a Stripe trial. A lifter can subscribe during the trial, is charged at checkout, and the screen then shows the paid state.
  - When the trial ends, nothing changes for a subscriber.
  - Comped accounts are refused at checkout. A comp never touches Stripe.

## 5. Owner-only decisions

The code cannot answer these. This list is not legal or tax advice.

- [ ] Stripe account activated as an individual, with identity verified, a bank account for payouts, and a payout schedule chosen.
- [ ] Tax handling decided, including whether and where to register for sales tax, before setting `STRIPE_TAX_ENABLED=true`. The runbook's rule stands: do not collect a tax you are not registered for.
- [ ] Refund and cancellation wording decided and shown. Today the billing screen says "Renews automatically. Cancel anytime" (`src/components/billing/plan-billing.tsx:399`) and `/pricing` has no refund or cancellation wording, and deletion copy points refund questions to support. There is no written refund policy in the code.
- [ ] Terms of service and privacy pages published and accurate. **No terms or privacy page exists in the code today** (there is no route for either under `src/app`). Publish them before going live, and link them from the portal settings.
- [ ] Account email works in Production for addresses outside the team. Test password recovery and email verification with a non-team address and confirm both emails arrive. This depends on the SMTP provider configured in the Production Supabase project **(unverified)**. Checkout requires a verified email.
- [ ] Hosting and database plans allow commercial use and include backups (check the Vercel and Supabase plans and their current terms) **(unverified)**.

## 6. Switching it off (rollback)

- **Stop new subscriptions.**
  - Remove `STRIPE_BILLING_ENABLED` (or set it to anything but `true`) in Vercel Production and redeploy.
  - Subscribe disappears and `startCheckout` refuses on the server.
  - Existing subscribers keep their access and can still open the portal to cancel, because the portal does not read the switch.
  - Webhooks keep updating the mirror.
- **Keep the live keys while any live subscription exists.** Switching back to test keys breaks the portal and the page-load refetch for paying accounts. It also makes account deletion treat their live customers as missing, so their subscriptions would not be canceled.
- **Stop charging existing subscribers** (only if you need to). Cancel their subscriptions in the Stripe dashboard. The webhook moves each account to Free and keeps all their data.
- **Do not delete the webhook endpoint** while live subscriptions exist, or cancellations and renewals stop reaching the mirror.
- Never revert code or force anything in Production to roll payments back. The flag is the off switch.
