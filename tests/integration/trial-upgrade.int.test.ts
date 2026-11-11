import { getTestPrisma } from "./support/db";
import { createTestAccount, DEFAULT_USER_ID } from "./support/accounts";
import {
  createReadyDraft,
  historyCounts,
  seedLoggedHistory,
} from "./support/plan-factories";
import { accountFor } from "@/lib/data/operator";
import { startCheckout } from "@/lib/billing/checkout";
import { getBillingScreen } from "@/lib/billing/screen";
import {
  getTrialNotice,
  markTrialNoticeShown,
} from "@/lib/billing/trial-notice";
import {
  computeEntitlement,
  resolveEntitlement,
} from "@/lib/entitlements/resolve";
import {
  reconcileStripeEvent,
  type MirrorSnapshot,
} from "@/lib/data/billing-webhook";
import type { BillingProvider, CheckoutParams } from "@/lib/billing/stripe";
import type { Account } from "@/lib/data/account";

/**
 * Trial upgrade UX & trial notices (OVE-112) over the real database. Proves:
 * an active trial can start monthly and annual checkout; abandoning checkout
 * leaves the trial exactly as it was (no extension, no second trial); a
 * verified webhook turns the trial into subscription-backed Pro and a replay
 * changes nothing; concurrent checkout attempts are serialized so only one
 * session is ever left payable; paid and comped accounts are never offered a
 * purchase; the notices show once, never to comp or paid accounts; and trial
 * expiry deletes and hides no training history. Stripe is a fake (no network).
 */

process.env.STRIPE_BILLING_ENABLED = "true";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-11T12:00:00.000Z");
const prisma = () => getTestPrisma();

async function trialAccount(
  endsInMs: number,
  opts: { verified?: boolean; timeZone?: string; userId?: string } = {},
): Promise<Account> {
  const account = opts.userId
    ? await accountFor(opts.userId)
    : await createTestAccount(opts.timeZone ?? "UTC", undefined, {
        entitlement: "none",
      });
  const endsAt = new Date(NOW.getTime() + endsInMs);
  await prisma().entitlement.create({
    data: {
      userId: account.userId,
      source: "trial",
      plan: "pro",
      startedAt: new Date(endsAt.getTime() - 14 * DAY),
      endsAt,
    },
  });
  if (opts.verified !== false) {
    await prisma().profile.update({
      where: { userId: account.userId },
      data: { emailVerifiedAt: new Date(NOW.getTime() - 5 * DAY) },
    });
  }
  return account;
}

/** A fake Stripe that models customers, open sessions, and subscriptions. */
function fakeStripe(opts: { delayMs?: number } = {}) {
  const state = {
    customers: 0,
    open: [] as { id: string; params: CheckoutParams }[],
    expired: [] as string[],
    subscriptions: new Map<string, string>(), // customerId -> status
    inFlight: 0,
    maxInFlight: 0,
    created: 0,
  };
  const wait = () => new Promise((r) => setTimeout(r, opts.delayMs ?? 0));
  const provider: BillingProvider = {
    async ensureCustomer({ existingCustomerId }) {
      if (existingCustomerId) return existingCustomerId;
      state.customers += 1;
      return `cus_fake_${state.customers}`;
    },
    async hasOpenSubscription(customerId) {
      const s = state.subscriptions.get(customerId);
      return s !== undefined && s !== "canceled";
    },
    async expireOpenCheckoutSessions() {
      const n = state.open.length;
      state.expired.push(...state.open.map((s) => s.id));
      state.open = [];
      return n;
    },
    async createCheckoutSession(params) {
      state.inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      await wait();
      state.created += 1;
      const id = `cs_${state.created}`;
      state.open.push({ id, params });
      state.inFlight -= 1;
      return { url: `https://checkout.stripe.test/${id}` };
    },
    async createPortalSession() {
      return { url: "https://billing.stripe.test/portal" };
    },
  };
  return { provider, state };
}

const deps = (provider: BillingProvider) => ({
  provider,
  ownEmail: async () => "lifter@example.test",
  inAppShell: async () => false,
  now: () => NOW,
});

function snap(customerId: string, over: Partial<MirrorSnapshot> = {}) {
  return {
    subscriptionId: "sub_trial_upgrade",
    customerId,
    status: "active" as const,
    interval: "month" as const,
    currentPeriodEnd: new Date(NOW.getTime() + 30 * DAY),
    cancelAtPeriodEnd: false,
    priceId: "price_monthly",
    promo: null,
    ...over,
  };
}

const trialRows = (userId: string) =>
  prisma().entitlement.findMany({ where: { userId, source: "trial" } });

describe("subscribing during the free trial", () => {
  it.each(["month", "year"] as const)(
    "an active trial can start %s checkout; abandoning it changes nothing",
    async (interval) => {
      const account = await trialAccount(4 * DAY);
      const before = await trialRows(account.userId);
      const { provider, state } = fakeStripe();

      const out = await startCheckout(account, interval, deps(provider));
      expect(out.url).toContain("checkout.stripe.test");
      expect(state.open).toHaveLength(1);
      expect(state.open[0].params).toMatchObject({
        interval,
        accountId: account.userId,
      });

      // The lifter closes Stripe without paying (cancel return). The trial is
      // untouched: same single row, same end, still resolving to the trial.
      const after = await trialRows(account.userId);
      expect(after).toEqual(before);
      const resolved = await resolveEntitlement(account, NOW);
      expect(resolved.displayState).toBe("trial");
      expect(resolved.plan).toBe("pro");
      expect(resolved.trialDaysLeft).toBe(4);
      // Only the customer link was written to the mirror — no subscription.
      const mirror = await prisma().billingAccount.findUnique({
        where: { userId: account.userId },
      });
      expect(mirror?.subscriptionId).toBeNull();
      expect(mirror?.status).toBeNull();
    },
  );

  it("the screen offers Subscribe to an active trial on the web, and not in the app shell", async () => {
    const account = await trialAccount(4 * DAY);
    const web = await getBillingScreen(account);
    expect(web.displayState).toBe("trial");
    expect(web.canSubscribe).toBe(true);
    const shell = await getBillingScreen(account, { inAppShell: true });
    expect(shell.canSubscribe).toBe(false);
    expect(shell.canManage).toBe(false);
    expect(shell.inAppShell).toBe(true);
  });

  it("a verified webhook turns the trial into paid Pro; a replay changes nothing; no trial is extended or duplicated", async () => {
    const account = await trialAccount(4 * DAY);
    const before = await trialRows(account.userId);
    const { provider } = fakeStripe();
    await startCheckout(account, "month", deps(provider));
    const { stripeCustomerId } = (await prisma().billingAccount.findUnique({
      where: { userId: account.userId },
    }))!;

    const event = {
      id: "evt_trial_upgrade_1",
      type: "checkout.session.completed",
      object: {
        customer: stripeCustomerId,
        subscription: "sub_trial_upgrade",
        client_reference_id: account.userId,
      },
    };
    const getSubscription = async () => snap(stripeCustomerId);
    await expect(
      reconcileStripeEvent(event, { getSubscription, now: () => NOW }),
    ).resolves.toEqual({ status: "processed", userId: account.userId });

    const resolved = await resolveEntitlement(account, NOW);
    expect(resolved.displayState).toBe("paid_monthly");
    expect(resolved.sources).toContain("subscription");

    // Replay: deduped by event id, the mirror is identical.
    const mirrorBefore = await prisma().billingAccount.findUnique({
      where: { userId: account.userId },
    });
    await expect(
      reconcileStripeEvent(event, { getSubscription, now: () => NOW }),
    ).resolves.toEqual({ status: "duplicate" });
    expect(
      await prisma().billingAccount.findUnique({
        where: { userId: account.userId },
      }),
    ).toEqual(mirrorBefore);
    expect(
      await prisma().billingAccount.count({
        where: { userId: account.userId },
      }),
    ).toBe(1);

    // The trial entitlement was never touched: one row, original end date.
    expect(await trialRows(account.userId)).toEqual(before);

    // A paid subscriber is not offered (or allowed) another purchase.
    const screen = await getBillingScreen(account);
    expect(screen.canSubscribe).toBe(false);
    expect(screen.canManage).toBe(true);
    await expect(
      startCheckout(account, "year", deps(provider)),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
  });

  it("concurrent checkout attempts are serialized and leave exactly one payable session", async () => {
    const account = await trialAccount(4 * DAY);
    const { provider, state } = fakeStripe({ delayMs: 50 });
    const results = await Promise.all([
      startCheckout(account, "month", deps(provider)),
      startCheckout(account, "month", deps(provider)),
      startCheckout(account, "year", deps(provider)),
    ]);
    expect(results).toHaveLength(3);
    expect(state.maxInFlight).toBe(1); // never two creations at once
    expect(state.customers).toBe(1); // one Stripe customer, linked once
    expect(state.created).toBe(3);
    expect(state.open).toHaveLength(1); // the two older sessions were expired
    expect(state.expired).toHaveLength(2);
    expect(
      await prisma().billingAccount.count({
        where: { userId: account.userId },
      }),
    ).toBe(1);
  });

  it("a subscription Stripe already has (webhook not yet landed) blocks a second checkout", async () => {
    const account = await trialAccount(4 * DAY);
    const { provider, state } = fakeStripe();
    await startCheckout(account, "month", deps(provider));
    const { stripeCustomerId } = (await prisma().billingAccount.findUnique({
      where: { userId: account.userId },
    }))!;
    state.subscriptions.set(stripeCustomerId, "active"); // paid, no webhook yet
    await expect(
      startCheckout(account, "month", deps(provider)),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    expect(state.created).toBe(1);
  });

  it("a comped account is not offered a purchase and can't start one", async () => {
    const account = await createTestAccount(); // complimentary Pro
    await prisma().profile.update({
      where: { userId: account.userId },
      data: { emailVerifiedAt: NOW },
    });
    const screen = await getBillingScreen(account);
    expect(screen.displayState).toBe("comp");
    expect(screen.canSubscribe).toBe(false);
    const { provider, state } = fakeStripe();
    // The test comp starts at the real clock, so resolve at the real clock.
    await expect(
      startCheckout(account, "month", {
        ...deps(provider),
        now: () => new Date(),
      }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    expect(state.customers).toBe(0);
  });

  it("an expired-trial Free account keeps a straightforward upgrade entry", async () => {
    const account = await trialAccount(-2 * DAY);
    const screen = await getBillingScreen(account);
    expect(screen.displayState).toBe("free");
    expect(screen.canSubscribe).toBe(true);
  });
});

describe("trial notices", () => {
  const notice = (account: Account, now: Date, inAppShell = false) =>
    getTrialNotice(account, { inAppShell, now });

  it("the one-day notice appears the day before, once, and is recorded per account", async () => {
    const account = await trialAccount(DAY + 2 * 60 * 60 * 1000); // ends tomorrow 14:00Z
    expect(await notice(account, NOW)).toMatchObject({
      phase: "ending",
      endsToday: false,
      purchasable: true,
    });
    await expect(markTrialNoticeShown(account, "ending", NOW)).resolves.toEqual(
      { moved: true },
    );
    expect(await notice(account, NOW)).toBeNull();
    // First-write-wins: a second mark moves nothing.
    await expect(markTrialNoticeShown(account, "ending")).resolves.toEqual({
      moved: false,
    });
  });

  it("the expired notice appears after the actual end, once", async () => {
    const account = await trialAccount(-60 * 60 * 1000); // ended an hour ago
    expect(await notice(account, NOW)).toMatchObject({ phase: "ended" });
    await markTrialNoticeShown(account, "ended", NOW);
    expect(await notice(account, NOW)).toBeNull();
    expect(await notice(account, new Date(NOW.getTime() + 3 * DAY))).toBeNull();
  });

  it("in the app shell the notice carries no purchase", async () => {
    const account = await trialAccount(-60 * 60 * 1000);
    expect(await notice(account, NOW, true)).toMatchObject({
      phase: "ended",
      purchasable: false,
    });
  });

  it("with billing off the notice carries no purchase", async () => {
    const account = await trialAccount(-60 * 60 * 1000);
    process.env.STRIPE_BILLING_ENABLED = "false";
    try {
      expect(await notice(account, NOW)).toMatchObject({ purchasable: false });
    } finally {
      process.env.STRIPE_BILLING_ENABLED = "true";
    }
  });

  it("never shows to a comped account, before or after its trial ends", async () => {
    const account = await createTestAccount(); // complimentary Pro
    await trialAccount(DAY + 60 * 60 * 1000, { userId: account.userId });
    expect(await notice(account, NOW)).toBeNull();
    expect(await notice(account, new Date(NOW.getTime() + 3 * DAY))).toBeNull();
  });

  it("never shows to an active paid subscriber after the trial ends", async () => {
    const account = await trialAccount(-DAY);
    await prisma().billingAccount.create({
      data: {
        userId: account.userId,
        stripeCustomerId: `cus_${account.userId}`,
        subscriptionId: `sub_${account.userId}`,
        status: "active",
        interval: "year",
      },
    });
    expect(await notice(account, NOW)).toBeNull();
  });

  it("uses the account's timezone for the one-day boundary", async () => {
    // Ends 2026-11-12T03:00Z: Nov 12 in UTC (tomorrow), but Nov 11 in Chicago
    // (today) — Chicago says "ends today", UTC says "ends tomorrow".
    const ms = new Date("2026-11-12T03:00:00Z").getTime() - NOW.getTime();
    const utc = await trialAccount(ms, { timeZone: "UTC" });
    const chicago = await trialAccount(ms, { timeZone: "America/Chicago" });
    expect(await notice(utc, NOW)).toMatchObject({ endsToday: false });
    expect(await notice(chicago, NOW)).toMatchObject({ endsToday: true });
  });

  it("rejects an unknown phase", async () => {
    const account = await trialAccount(DAY);
    await expect(
      markTrialNoticeShown(account, "forever"),
    ).rejects.toMatchObject({ code: "validation_error" });
  });
});

describe("trial expiry never deletes or locks training history", () => {
  it("history stays complete and readable through expiry and the notice", async () => {
    // The default test account owns the plan factories' rows; make it a trial
    // account by replacing its test comp with a trial.
    const { mesocycle, session, exercise } = await createReadyDraft();
    await seedLoggedHistory({
      mesocycleId: mesocycle.id,
      sessionId: session.id,
      exerciseId: exercise.id,
    });
    await prisma().entitlement.deleteMany({
      where: { userId: DEFAULT_USER_ID },
    });
    const account = await trialAccount(-DAY, { userId: DEFAULT_USER_ID });
    const before = await historyCounts();
    expect(before.loggedSets).toBe(1);

    const resolved = await resolveEntitlement(account, NOW);
    expect(resolved.plan).toBe("free");
    await getTrialNotice(account, { inAppShell: false, now: NOW });
    await markTrialNoticeShown(account, "ended", NOW);

    expect(await historyCounts()).toEqual(before);
    const sets = await account.db.loggedSet.findMany();
    expect(sets).toHaveLength(1);
    expect(Number(sets[0].weightLbs)).toBe(185);
    expect(sets[0].reps).toBe(8);
    expect(await account.db.mesocycle.count()).toBe(1);
    // Dismissal is presentation state: the entitlement resolution is unchanged.
    expect(
      computeEntitlement(await account.db.entitlement.findMany(), null, NOW)
        .plan,
    ).toBe("free");
  });
});
