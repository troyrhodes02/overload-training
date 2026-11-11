import { startCheckout, startPortal } from "@/lib/billing/checkout";
import type { Account } from "@/lib/data/account";
import type { BillingProvider, CheckoutParams } from "@/lib/billing/stripe";

// Default posture for these tests: checkout enabled (the kill switch is on).
// The disabled-path test toggles it off and restores it.
process.env.STRIPE_BILLING_ENABLED = "true";

/**
 * Plans, Billing & Promo Codes — checkout/portal logic (spec §11, §12; RD-11),
 * plus the trial-upgrade rules (OVE-112). The Stripe provider, the session
 * email, the app-shell check, and the clock are injected, so these run with no
 * network and no live Stripe. A browser return is never asserted as payment
 * here — that is the webhook (B4).
 */

const NOW = new Date("2026-11-11T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const USER = "11111111-1111-4111-8111-111111111111";

type Ent = {
  source: "trial" | "comp" | "subscription";
  startedAt: Date;
  endsAt: Date | null;
  revokedAt: Date | null;
};

const activeTrial = (): Ent => ({
  source: "trial",
  startedAt: new Date(NOW.getTime() - 10 * DAY),
  endsAt: new Date(NOW.getTime() + 4 * DAY),
  revokedAt: null,
});

function fakeAccount(opts: {
  emailVerifiedAt: Date | null;
  stripeCustomerId: string | null;
  entitlements?: Ent[];
  billing?: Record<string, unknown>;
}): { account: Account; created: Record<string, unknown>[]; locks: number } {
  const created: Record<string, unknown>[] = [];
  const state = { locks: 0 };
  const billingRow = opts.stripeCustomerId
    ? {
        userId: USER,
        stripeCustomerId: opts.stripeCustomerId,
        subscriptionId: null,
        status: null,
        interval: null,
        cancelAtPeriodEnd: false,
        graceEndsAt: null,
        currentPeriodEnd: null,
        ...opts.billing,
      }
    : null;
  const db = {
    profile: {
      findUnique: async () => ({ emailVerifiedAt: opts.emailVerifiedAt }),
    },
    entitlement: {
      findMany: async () => opts.entitlements ?? [activeTrial()],
    },
    billingAccount: {
      findUnique: async () => billingRow,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return data;
      },
    },
    $queryRaw: async () => {
      state.locks += 1;
      return [{ locked: 1 }];
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return {
    account: {
      userId: USER,
      timeZone: "UTC",
      db: db as unknown as Account["db"],
    },
    created,
    get locks() {
      return state.locks;
    },
  };
}

function fakeProvider(overrides: Partial<BillingProvider> = {}): {
  provider: BillingProvider;
  calls: string[];
  sessions: CheckoutParams[];
} {
  const calls: string[] = [];
  const sessions: CheckoutParams[] = [];
  const provider: BillingProvider = {
    ensureCustomer: async ({ existingCustomerId }) => {
      calls.push("ensureCustomer");
      return existingCustomerId ?? "cus_new";
    },
    createCheckoutSession: async (params) => {
      calls.push("createCheckoutSession");
      sessions.push(params);
      return { url: "https://checkout.stripe.test/s/abc" };
    },
    createPortalSession: async () => {
      calls.push("createPortalSession");
      return { url: "https://billing.stripe.test/p/xyz" };
    },
    hasOpenSubscription: async () => {
      calls.push("hasOpenSubscription");
      return false;
    },
    expireOpenCheckoutSessions: async () => {
      calls.push("expireOpenCheckoutSessions");
      return 0;
    },
    ...overrides,
  };
  return { provider, calls, sessions };
}

const web = {
  ownEmail: async () => "a@b.c",
  inAppShell: async () => false,
  now: () => NOW,
};

describe("startCheckout", () => {
  it("refuses when the billing kill switch is off, before touching Stripe", async () => {
    const prev = process.env.STRIPE_BILLING_ENABLED;
    process.env.STRIPE_BILLING_ENABLED = "false";
    try {
      const { account } = fakeAccount({
        emailVerifiedAt: new Date(),
        stripeCustomerId: null,
      });
      const { provider, calls } = fakeProvider();
      await expect(
        startCheckout(account, "month", { provider, ...web }),
      ).rejects.toMatchObject({ code: "invalid_state_transition" });
      expect(calls).toEqual([]); // never reached Stripe — no key, no charge
    } finally {
      process.env.STRIPE_BILLING_ENABLED = prev;
    }
  });

  it("refuses an unverified email (first-checkout gate)", async () => {
    const { account } = fakeAccount({
      emailVerifiedAt: null,
      stripeCustomerId: null,
    });
    const { provider, calls } = fakeProvider();
    await expect(
      startCheckout(account, "month", { provider, ...web }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    expect(calls).toEqual([]); // never reached Stripe
  });

  it("refuses inside an app shell, before touching Stripe (OVE-112)", async () => {
    const { account } = fakeAccount({
      emailVerifiedAt: new Date(),
      stripeCustomerId: null,
    });
    const { provider, calls } = fakeProvider();
    await expect(
      startCheckout(account, "month", {
        provider,
        ...web,
        inAppShell: async () => true,
      }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    expect(calls).toEqual([]);
  });

  it("creates and stores the Stripe customer once, then returns the hosted URL", async () => {
    const { account, created } = fakeAccount({
      emailVerifiedAt: new Date(),
      stripeCustomerId: null,
    });
    const { provider, calls } = fakeProvider();
    const out = await startCheckout(account, "month", { provider, ...web });
    expect(out.url).toContain("checkout.stripe.test");
    expect(calls).toEqual([
      "ensureCustomer",
      "hasOpenSubscription",
      "expireOpenCheckoutSessions",
      "createCheckoutSession",
    ]);
    expect(created).toEqual([{ userId: USER, stripeCustomerId: "cus_new" }]);
  });

  it("reuses an existing Stripe customer without creating a new BillingAccount row", async () => {
    const { account, created } = fakeAccount({
      emailVerifiedAt: new Date(),
      stripeCustomerId: "cus_existing",
    });
    const { provider, calls } = fakeProvider();
    await startCheckout(account, "year", { provider, ...web });
    expect(created).toEqual([]); // row already existed
    expect(calls).not.toContain("ensureCustomer");
  });

  describe("an active free trial can subscribe early (OVE-112)", () => {
    it.each(["month", "year"] as const)(
      "starts %s checkout for the trial account, under the checkout lock",
      async (interval) => {
        const fake = fakeAccount({
          emailVerifiedAt: new Date(),
          stripeCustomerId: "cus_trial",
          entitlements: [activeTrial()],
        });
        const { provider, sessions } = fakeProvider();
        const out = await startCheckout(fake.account, interval, {
          provider,
          ...web,
        });
        expect(out.url).toContain("checkout.stripe.test");
        expect(sessions).toHaveLength(1);
        expect(sessions[0]).toMatchObject({
          customerId: "cus_trial",
          interval,
          accountId: USER,
        });
        // Both locked steps took the per-account checkout lock.
        expect(fake.locks).toBe(2);
      },
    );

    it("a Free account whose trial has expired can still subscribe", async () => {
      const expired: Ent = {
        ...activeTrial(),
        startedAt: new Date(NOW.getTime() - 20 * DAY),
        endsAt: new Date(NOW.getTime() - 6 * DAY),
      };
      const { account } = fakeAccount({
        emailVerifiedAt: new Date(),
        stripeCustomerId: null,
        entitlements: [expired],
      });
      const { provider, sessions } = fakeProvider();
      await startCheckout(account, "month", { provider, ...web });
      expect(sessions).toHaveLength(1);
    });
  });

  describe("never a second subscription (OVE-112)", () => {
    it.each([
      [
        "active monthly",
        { subscriptionId: "sub_1", status: "active", interval: "month" },
      ],
      [
        "active annual",
        { subscriptionId: "sub_1", status: "active", interval: "year" },
      ],
      [
        "canceling",
        {
          subscriptionId: "sub_1",
          status: "active",
          interval: "month",
          cancelAtPeriodEnd: true,
        },
      ],
      [
        "past_due within grace",
        {
          subscriptionId: "sub_1",
          status: "past_due",
          interval: "month",
          graceEndsAt: new Date(NOW.getTime() + DAY),
        },
      ],
    ])(
      "refuses a %s subscriber before touching Stripe",
      async (_label, billing) => {
        const { account } = fakeAccount({
          emailVerifiedAt: new Date(),
          stripeCustomerId: "cus_paid",
          billing,
        });
        const { provider, calls } = fakeProvider();
        await expect(
          startCheckout(account, "month", { provider, ...web }),
        ).rejects.toMatchObject({ code: "invalid_state_transition" });
        expect(calls).toEqual([]);
      },
    );

    it("refuses a complimentary account (comp is never solicited for payment)", async () => {
      const { account } = fakeAccount({
        emailVerifiedAt: new Date(),
        stripeCustomerId: null,
        entitlements: [
          { source: "comp", startedAt: NOW, endsAt: null, revokedAt: null },
        ],
      });
      const { provider, calls } = fakeProvider();
      await expect(
        startCheckout(account, "month", { provider, ...web }),
      ).rejects.toMatchObject({ code: "invalid_state_transition" });
      expect(calls).toEqual([]);
    });

    it("refuses when Stripe already has an open subscription the webhook hasn't mirrored yet", async () => {
      const { account } = fakeAccount({
        emailVerifiedAt: new Date(),
        stripeCustomerId: "cus_just_paid",
        entitlements: [activeTrial()],
      });
      const { provider, calls } = fakeProvider({
        hasOpenSubscription: async () => true,
      });
      await expect(
        startCheckout(account, "year", { provider, ...web }),
      ).rejects.toMatchObject({ code: "invalid_state_transition" });
      expect(calls).not.toContain("createCheckoutSession");
    });

    it("expires any older open session before creating the new one (refresh / second click)", async () => {
      const { account } = fakeAccount({
        emailVerifiedAt: new Date(),
        stripeCustomerId: "cus_trial",
      });
      const order: string[] = [];
      const { provider } = fakeProvider({
        expireOpenCheckoutSessions: async () => {
          order.push("expire");
          return 1;
        },
        createCheckoutSession: async () => {
          order.push("create");
          return { url: "https://checkout.stripe.test/s/new" };
        },
      });
      await startCheckout(account, "month", { provider, ...web });
      expect(order).toEqual(["expire", "create"]);
    });
  });
});

describe("startPortal", () => {
  it("throws when there is no Stripe customer yet", async () => {
    const { account } = fakeAccount({
      emailVerifiedAt: new Date(),
      stripeCustomerId: null,
    });
    const { provider } = fakeProvider();
    await expect(
      startPortal(account, { provider, inAppShell: async () => false }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
  });

  it("returns the portal URL for an existing customer", async () => {
    const { account } = fakeAccount({
      emailVerifiedAt: new Date(),
      stripeCustomerId: "cus_existing",
    });
    const { provider, calls } = fakeProvider();
    const out = await startPortal(account, {
      provider,
      inAppShell: async () => false,
    });
    expect(out.url).toContain("billing.stripe.test");
    expect(calls).toEqual(["createPortalSession"]);
  });

  it("refuses inside an app shell (OVE-112)", async () => {
    const { account } = fakeAccount({
      emailVerifiedAt: new Date(),
      stripeCustomerId: "cus_existing",
    });
    const { provider, calls } = fakeProvider();
    await expect(
      startPortal(account, { provider, inAppShell: async () => true }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    expect(calls).toEqual([]);
  });
});
