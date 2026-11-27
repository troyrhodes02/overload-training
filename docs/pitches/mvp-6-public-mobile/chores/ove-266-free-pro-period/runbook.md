# OVE-266 — Free-Pro period: runbook

The owner does everything in this runbook. The chore's code adds one server switch, `OVERLOAD_FREE_PRO_PERIOD`. While it is exactly `true`, every account has Pro at no charge and paid checkout is refused on the server. Nothing in the code turns it on in Production.

This is not legal or tax advice.

## 1. Production billing audit (2026-11-27)

The audit was read-only. It printed only aggregate counts, never a customer id, email, or name.

| Check | Method | Finding |
| --- | --- | --- |
| Checkout switch | `vercel env run --environment production` from an empty directory, printing only `=== "true"` | **`STRIPE_BILLING_ENABLED` is `true` in Production.** Checkout is open today for any account with a verified email on Free or a trial. |
| Stripe key mode | the same, printing only the key prefix | **Unknown.** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are Vercel *Secret* values, so they can't be read back. Whether Production uses live or test keys can't be decided from here. |
| Price ids | the same | Both set (`price_…`). The id does not show the mode. |
| Billing mirror | `BEGIN TRANSACTION READ ONLY` on the Production database, counts only | **0 `billing_accounts` rows.** No Production account has a Stripe customer, so the app knows of no subscription. Every Checkout writes this row before it opens, so no Production checkout has ever been started by an account that still exists. |
| Webhook ledger | same | 14 events. All of them arrived on 2026-11-04 between 01:52 and 16:25 UTC: 1 `checkout.session.completed`, 1 `customer.subscription.created`, 1 `invoice.paid`, and 11 `customer.subscription.updated`. That is before the billing pitch merged to `main` (2026-11-04 18:17 UTC) and before environment isolation (OVE-111, 2026-11-09). The likeliest source is a test-mode deployment that wrote to the Production database before isolation. **No `customer.subscription.deleted` was ever received.** Nothing has arrived since. |
| Promotions | same | 0 promo redemptions. 0 accounts with a promo code. |
| Entitlements | same | 4 open-ended comps (none revoked), 2 trials still running, 6 ended trials. 11 profiles. 3 verified emails. |

### Could anyone still be charged?

- **Through an account Overload knows about: no.** No Production account has a billing row, so none has a subscription the app tracks.
- **Through an orphaned Stripe subscription: not ruled out from the code.** The one subscription created on 2026-11-04 never sent a `deleted` event, and its billing row is gone. If that subscription was created in **live** mode and is still active, Stripe would keep renewing it. A monthly plan started then would next renew around **2026-12-04**. The timing points to test mode, which can't charge a card, but only the Stripe dashboard can confirm it.
- **New purchases: yes, until you act.** `STRIPE_BILLING_ENABLED=true` means Subscribe is shown and Checkout opens today.

**Do not call Production billing paused** until steps 2.1 and 2.2 are done.

## 2. Stop payments now (before this release)

### 2.1 Close new checkouts with the existing switch

This works on the code already in Production.

1. Vercel → `overload-training` → Settings → Environment Variables → **Production** → remove `STRIPE_BILLING_ENABLED`, or set it to `false`.
2. Redeploy Production. Vercel applies a variable change only on the next deployment.
3. Check `/pricing`: the Pro card says "Not on sale yet". Signed in on Free or a trial, `/settings/billing` shows no Subscribe button.

On the server, `startCheckout` refuses before any Stripe call. Webhooks, the portal, and account deletion are unchanged.

### 2.2 Confirm there are no recurring subscriptions in Stripe

1. Stripe dashboard → turn **Test mode off** (live) → Billing → **Subscriptions**.
2. Filter on Active, Trialing, Past due, and Unpaid. Expected: none.
3. If one exists, open it and check whether it belongs to a real person or to your own testing. **Do not cancel or refund it from a run.** Decide yourself:
   - your own test subscription: cancel it immediately in the dashboard, and refund if you like;
   - a real customer: see section 5.
4. Repeat in test mode if you like. Test subscriptions charge nothing.
5. Optional: Developers → Webhooks → the live endpoint → check that it is subscribed to `customer.subscription.deleted` (section 1 of `docs/planning/payments-go-live-checklist.md`).

## 3. Turn on the free-Pro period (after the release reaches Production)

Do this only after the OVE-266 release PR is merged into `main` and deployed.

1. No backup is needed. The switch changes reads only and writes nothing.
2. Vercel Production → add `OVERLOAD_FREE_PRO_PERIOD` = `true` (server-only; never `NEXT_PUBLIC_`).
3. Redeploy Production.
4. Check:
   - `/pricing` → the Pro card says "Included for everyone right now" and "Pro is currently included for everyone at no charge. Paid subscriptions are temporarily unavailable." There is no Subscribe or pay link.
   - Sign in with an account on Free → `/settings/billing` reads "Pro — included for everyone". There is no Subscribe button. An exercise with history shows its call.
   - A comp account still reads "Pro — complimentary".
   - `/admin/billing` shows "The free-Pro period is on". The counts there are each account's own plan.
   - iPhone (TestFlight 1.0.0 (2)): More → the plan row reads "Free" (see section 6), and Plan & access reads "Pro — included for everyone" under "Included in your plan". Workouts and exercise history show Pro calls.

With the period on, checkout stays refused even if `STRIPE_BILLING_ENABLED` is `true`. Do 2.1 anyway, so turning the period off later can't reopen checkout by surprise.

### What it costs

- **Plan import** is Pro, so every account can use it during the period. In Production `PLAN_IMPORT_ENABLED` is off today, so there is no model spend. If you turn it on during the period, the global spend cap and the Pro daily limits apply to every account.
- No other paid service is called per account.

## 4. End the free-Pro period

1. Vercel Production → remove `OVERLOAD_FREE_PRO_PERIOD`, or set it to anything but `true`.
2. Redeploy Production.
3. Each account returns to its own records:
   - a trial still running reads as a trial again, with its real days left;
   - an ended trial, an expired comp, or no records at all reads as Free;
   - a comp reads as complimentary;
   - a subscription reads as its real Stripe state.
   Nothing is charged and nothing starts. No row changes.
4. Checkout returns to whatever `STRIPE_BILLING_ENABLED` says. If you did 2.1, it stays off until you set it to `true` deliberately (`docs/planning/payments-go-live-checklist.md`, section 2).
5. Trial notices: an account whose trial ended within the last 30 days may see the one-time "your trial has ended" notice on its next visit. That notice is true then, and it never offers a purchase while checkout is off.

Consider telling lifters before you end the period. The code sends no email.

## 5. If a real paid subscriber exists

The period never changes a Stripe subscription. A paying lifter keeps their own plan line ("Pro — Monthly", renewal date), with the note "Pro is currently included for everyone at no charge. Your subscription hasn't changed. Use Manage billing to change or cancel it." They can cancel in the Customer Portal.

Your choices, all owner decisions made in the Stripe dashboard, never from a run:

- **Leave it.** It renews as agreed. The lifter has been told Pro is included for everyone and that they can cancel.
- **Pause collection** (Subscription → Pause payment collection) for the period, then resume it. Before using this, check what the mirror shows: a paused subscription has no `paused` status in the mirror unless Stripe sets one. Test it in test mode first.
- **Cancel** at period end or immediately, with or without a refund. The webhook moves the account to its own plan, which is Pro during the period anyway. Tell the lifter.

## 6. TestFlight 1.0.0 (2) and the App Store review

- No new build, no Production OTA, no channel change, and no runtime change. The staging runtime fingerprint is unchanged (`2e4a65d9cd…`).
- The mobile API keeps every shape. The only change is that `displayState` has one more value, `included`. Build 1.0.0 (2) does no runtime validation of it, and its bundled plan words fall back to the Free words. So **its More tab plan row reads "Free"** during the period. Everything else is server-driven: Plan & access shows the server's label and explanation, the heading reads "Included in your plan", and every Pro result appears. A later build or Production OTA carrying the shared copy fixes the More row. That is your decision, after Apple's review.
- The Apple review account (on a trial until 2026-12-11) gets Pro throughout while the period is on.

## 7. Rollback

Remove `OVERLOAD_FREE_PRO_PERIOD` and redeploy (section 4). Rolling back the code isn't needed. With the switch unset, the release behaves exactly like the code before it.
