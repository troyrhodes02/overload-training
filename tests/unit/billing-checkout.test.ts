import { startCheckout, startPortal } from "@/lib/billing/checkout";
import type { Account } from "@/lib/data/account";
import type { BillingProvider } from "@/lib/billing/stripe";

// Default posture for these tests: checkout enabled (the kill switch is on).
// The disabled-path test toggles it off and restores it.
process.env.STRIPE_BILLING_ENABLED = "true";

/**
 * Plans, Billing & Promo Codes — checkout/portal logic (spec §11, §12; RD-11).
 * The Stripe provider and the session email are injected, so these run with no
 * network and no live Stripe. Proves the first-checkout email gate, the Stripe
 * customer is created once and stored, and the portal needs a prior customer. A
 * browser return is never asserted as payment here — that is the webhook (B4).
 */

function fakeAccount(opts: {
  emailVerifiedAt: Date | null;
  stripeCustomerId: string | null;
}): { account: Account; created: Record<string, unknown>[] } {
  const created: Record<string, unknown>[] = [];
  const db = {
    profile: {
      findUnique: async () => ({ emailVerifiedAt: opts.emailVerifiedAt }),
    },
    billingAccount: {
      findUnique: async () =>
        opts.stripeCustomerId
          ? { stripeCustomerId: opts.stripeCustomerId }
          : null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return data;
      },
    },
  };
  return {
    account: {
      userId: "11111111-1111-4111-8111-111111111111",
      timeZone: "UTC",
      db: db as unknown as Account["db"],
    },
    created,
  };
}

function fakeProvider(overrides: Partial<BillingProvider> = {}): {
  provider: BillingProvider;
  calls: string[];
} {
  const calls: string[] = [];
  const provider: BillingProvider = {
    ensureCustomer: async ({
      existingCustomerId,
    }: {
      existingCustomerId: string | null;
    }) => {
      calls.push("ensureCustomer");
      return existingCustomerId ?? "cus_new";
    },
    createCheckoutSession: async () => {
      calls.push("createCheckoutSession");
      return { url: "https://checkout.stripe.test/s/abc" };
    },
    createPortalSession: async () => {
      calls.push("createPortalSession");
      return { url: "https://billing.stripe.test/p/xyz" };
    },
    ...overrides,
  };
  return { provider, calls };
}

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
        startCheckout(account, "month", {
          provider,
          ownEmail: async () => "a@b.c",
        }),
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
      startCheckout(account, "month", {
        provider,
        ownEmail: async () => "a@b.c",
      }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    expect(calls).toEqual([]); // never reached Stripe
  });

  it("creates and stores the Stripe customer once, then returns the hosted URL", async () => {
    const { account, created } = fakeAccount({
      emailVerifiedAt: new Date(),
      stripeCustomerId: null,
    });
    const { provider, calls } = fakeProvider();
    const out = await startCheckout(account, "month", {
      provider,
      ownEmail: async () => "a@b.c",
    });
    expect(out.url).toContain("checkout.stripe.test");
    expect(calls).toEqual(["ensureCustomer", "createCheckoutSession"]);
    expect(created).toEqual([
      { userId: account.userId, stripeCustomerId: "cus_new" },
    ]);
  });

  it("reuses an existing Stripe customer without creating a new BillingAccount row", async () => {
    const { account, created } = fakeAccount({
      emailVerifiedAt: new Date(),
      stripeCustomerId: "cus_existing",
    });
    const { provider } = fakeProvider();
    await startCheckout(account, "year", {
      provider,
      ownEmail: async () => "a@b.c",
    });
    expect(created).toEqual([]); // row already existed
  });
});

describe("startPortal", () => {
  it("throws when there is no Stripe customer yet", async () => {
    const { account } = fakeAccount({
      emailVerifiedAt: new Date(),
      stripeCustomerId: null,
    });
    const { provider } = fakeProvider();
    await expect(startPortal(account, { provider })).rejects.toMatchObject({
      code: "invalid_state_transition",
    });
  });

  it("returns the portal URL for an existing customer", async () => {
    const { account } = fakeAccount({
      emailVerifiedAt: new Date(),
      stripeCustomerId: "cus_existing",
    });
    const { provider, calls } = fakeProvider();
    const out = await startPortal(account, { provider });
    expect(out.url).toContain("billing.stripe.test");
    expect(calls).toEqual(["createPortalSession"]);
  });
});
