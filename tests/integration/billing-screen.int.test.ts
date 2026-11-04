import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";
import { getBillingScreen } from "@/lib/billing/screen";
import type { Account } from "@/lib/data/account";

/**
 * Plans, Billing & Promo Codes — the Plan & Billing screen over the real Stripe
 * mirror (PR #112 cancellation UX). A scheduled cancellation shows as such with
 * the real end date; an active subscription renews; an expired (canceled)
 * subscription is Free. Manage billing stays available while a customer exists.
 */

const PERIOD_END = new Date("2026-12-04T00:00:00.000Z");

async function withMirror(
  over: Record<string, unknown>,
  timeZone = "UTC",
): Promise<Account> {
  const account = await createTestAccount(timeZone, undefined, {
    entitlement: "none",
  });
  await getTestPrisma().billingAccount.create({
    data: {
      userId: account.userId,
      stripeCustomerId: `cus_${account.userId}`,
      subscriptionId: `sub_${account.userId}`,
      status: "active",
      interval: "month",
      currentPeriodEnd: PERIOD_END,
      cancelAtPeriodEnd: false,
      ...over,
    },
  });
  return account;
}

it("a scheduled cancellation reads as scheduled, with the real end date", async () => {
  const account = await withMirror({ cancelAtPeriodEnd: true });
  const screen = await getBillingScreen(account);
  expect(screen.displayState).toBe("canceling");
  expect(screen.label).toBe("Pro — cancellation scheduled");
  expect(screen.cancelAtPeriodEnd).toBe(true);
  expect(screen.endsOn).toBe("December 4, 2026");
  expect(screen.explanation).toContain("ends on December 4, 2026");
  expect(screen.explanation.toLowerCase()).not.toContain("renews");
  // Manage billing stays available to resume/manage the subscription.
  expect(screen.canManage).toBe(true);
  expect(screen.canSubscribe).toBe(false);
});

it("an active subscription renews, with the real date", async () => {
  const account = await withMirror({ cancelAtPeriodEnd: false });
  const screen = await getBillingScreen(account);
  expect(screen.displayState).toBe("paid_monthly");
  expect(screen.explanation).toBe(
    "Renews monthly on December 4, 2026. Manage or cancel anytime.",
  );
  expect(screen.canManage).toBe(true);
});

it("a reversed cancellation shows the normal active UI again", async () => {
  // Reversal = the mirror's cancelAtPeriodEnd goes back to false.
  const account = await withMirror({ cancelAtPeriodEnd: false });
  const screen = await getBillingScreen(account);
  expect(screen.displayState).toBe("paid_monthly");
  expect(screen.label).toBe("Pro — Monthly");
  expect(screen.explanation).toContain("Renews monthly");
});

it("an expired (canceled) subscription is Free, but Manage billing remains", async () => {
  const account = await withMirror({
    status: "canceled",
    cancelAtPeriodEnd: false,
  });
  const screen = await getBillingScreen(account);
  expect(screen.displayState).toBe("free");
  expect(screen.label).toBe("Free");
  expect(screen.endsOn).toBe("December 4, 2026"); // mirror still holds the date
  expect(screen.canManage).toBe(true); // the Stripe customer still exists
});

it("renders the billing date in UTC, matching Stripe, regardless of the account timezone", async () => {
  // The reported Dec 3 vs Dec 4 bug: a UTC-negative account must not see the
  // period end rolled back a day. America/Chicago is UTC-6.
  const account = await withMirror(
    { cancelAtPeriodEnd: true },
    "America/Chicago",
  );
  const screen = await getBillingScreen(account);
  expect(screen.endsOn).toBe("December 4, 2026");
  expect(screen.explanation).toContain("ends on December 4, 2026");
});
