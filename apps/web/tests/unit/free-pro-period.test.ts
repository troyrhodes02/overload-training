import type { BillingAccount, Entitlement } from "@prisma/client";

import {
  computeEntitlement,
  type ResolverOptions,
} from "@/lib/entitlements/resolve";
import {
  ALL_CAPABILITIES,
  addDays,
  isCheckoutEnabled,
  isFreeProPeriod,
} from "@/lib/billing/config";
import { startCheckout, startPortal } from "@/lib/billing/checkout";
import { getTrialNotice } from "@/lib/billing/trial-notice";
import { toEntitlementDto } from "@/lib/views/me";
import { resolveCta, type MarketingContext } from "@/lib/marketing/cta";
import type { Account } from "@/lib/data/account";
import type { BillingProvider } from "@/lib/billing/stripe";
import {
  FREE_PRO_PERIOD_NOTE,
  billingCopy,
} from "@overload/shared/billing/copy";

/**
 * The free-Pro period (OVE-266). One server switch, read in one place, makes
 * the PURE resolver grant Pro to every account while leaving each account's
 * own records, sources, and trial clock untouched; with it off the resolver is
 * exactly the normal rules. Checkout refuses before any Stripe call while it
 * is on, whatever STRIPE_BILLING_ENABLED says. Nothing here writes anything:
 * the integration suite (free-pro-period.int.test.ts) proves that against a
 * real database, through the web and the mobile API.
 */

const NOW = new Date("2026-11-27T12:00:00.000Z");
const UID = "11111111-1111-4111-8111-111111111111";
const ON: ResolverOptions = { freeProPeriod: true };

function ent(partial: Partial<Entitlement>): Entitlement {
  return {
    id: "e1",
    userId: UID,
    source: "trial",
    plan: "pro",
    startedAt: addDays(NOW, -1),
    endsAt: null,
    compReason: null,
    compNote: null,
    grantedByUserId: null,
    revokedAt: null,
    revokedByUserId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  } as Entitlement;
}

function sub(partial: Partial<BillingAccount> = {}): BillingAccount {
  return {
    userId: UID,
    stripeCustomerId: "cus_1",
    subscriptionId: "sub_1",
    status: "active",
    interval: "month",
    currentPeriodEnd: addDays(NOW, 20),
    cancelAtPeriodEnd: false,
    graceEndsAt: null,
    priceId: "price_m",
    promoCode: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  } as BillingAccount;
}

const activeTrial = () =>
  ent({
    source: "trial",
    startedAt: addDays(NOW, -4),
    endsAt: addDays(NOW, 10),
  });
const expiredTrial = () =>
  ent({
    source: "trial",
    startedAt: addDays(NOW, -30),
    endsAt: addDays(NOW, -16),
  });
const openComp = () =>
  ent({ source: "comp", compReason: "tester", endsAt: null });

function withEnv<T>(vars: Record<string, string | undefined>, run: () => T): T {
  const prev = Object.fromEntries(
    Object.keys(vars).map((k) => [k, process.env[k]]),
  );
  const set = (from: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(from)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  set(vars);
  let result: T;
  try {
    result = run();
  } catch (error) {
    set(prev);
    throw error;
  }
  // An async body keeps the variables until it settles.
  if (result instanceof Promise) {
    return result.finally(() => set(prev)) as T;
  }
  set(prev);
  return result;
}

describe("the switch", () => {
  it('is on only for exactly "true"', () => {
    for (const v of [undefined, "", "1", "TRUE", "yes", "true "]) {
      withEnv({ OVERLOAD_FREE_PRO_PERIOD: v }, () =>
        expect(isFreeProPeriod()).toBe(false),
      );
    }
    withEnv({ OVERLOAD_FREE_PRO_PERIOD: "true" }, () =>
      expect(isFreeProPeriod()).toBe(true),
    );
  });

  it("turns checkout off even when STRIPE_BILLING_ENABLED is true, and only while on", () => {
    withEnv(
      { STRIPE_BILLING_ENABLED: "true", OVERLOAD_FREE_PRO_PERIOD: "true" },
      () => expect(isCheckoutEnabled()).toBe(false),
    );
    // Re-enabling the normal model restores exactly the billing flag's value:
    // it never turns checkout ON by itself.
    withEnv(
      { STRIPE_BILLING_ENABLED: "true", OVERLOAD_FREE_PRO_PERIOD: undefined },
      () => expect(isCheckoutEnabled()).toBe(true),
    );
    withEnv(
      {
        STRIPE_BILLING_ENABLED: undefined,
        OVERLOAD_FREE_PRO_PERIOD: undefined,
      },
      () => expect(isCheckoutEnabled()).toBe(false),
    );
  });
});

describe("the resolver during and after the period", () => {
  type Case = {
    name: string;
    entitlements: Entitlement[];
    billing: BillingAccount | null;
    during: string;
    after: { plan: "free" | "pro"; displayState: string };
  };

  const cases: Case[] = [
    {
      name: "an ordinary Free account",
      entitlements: [],
      billing: null,
      during: "included",
      after: { plan: "free", displayState: "free" },
    },
    {
      name: "an expired trial",
      entitlements: [expiredTrial()],
      billing: null,
      during: "included",
      after: { plan: "free", displayState: "free" },
    },
    {
      name: "an active trial",
      entitlements: [activeTrial()],
      billing: null,
      during: "included",
      after: { plan: "pro", displayState: "trial" },
    },
    {
      name: "a new signup (trial starting now)",
      entitlements: [
        ent({ source: "trial", startedAt: NOW, endsAt: addDays(NOW, 14) }),
      ],
      billing: null,
      during: "included",
      after: { plan: "pro", displayState: "trial" },
    },
    {
      name: "an open-ended complimentary member",
      entitlements: [openComp()],
      billing: null,
      during: "comp",
      after: { plan: "pro", displayState: "comp" },
    },
    {
      name: "a revoked comp",
      entitlements: [ent({ source: "comp", revokedAt: addDays(NOW, -1) })],
      billing: null,
      during: "included",
      after: { plan: "free", displayState: "free" },
    },
    {
      name: "an active paid subscriber",
      entitlements: [],
      billing: sub(),
      during: "paid_monthly",
      after: { plan: "pro", displayState: "paid_monthly" },
    },
    {
      name: "an annual subscriber canceling at period end",
      entitlements: [],
      billing: sub({ interval: "year", cancelAtPeriodEnd: true }),
      during: "canceling",
      after: { plan: "pro", displayState: "canceling" },
    },
    {
      name: "a past-due subscriber within grace",
      entitlements: [],
      billing: sub({ status: "past_due", graceEndsAt: addDays(NOW, 3) }),
      during: "grace",
      after: { plan: "pro", displayState: "grace" },
    },
    {
      name: "a past-due subscriber beyond grace",
      entitlements: [],
      billing: sub({ status: "past_due", graceEndsAt: addDays(NOW, -1) }),
      during: "included",
      after: { plan: "free", displayState: "free" },
    },
    {
      name: "a canceled subscription",
      entitlements: [],
      billing: sub({ status: "canceled" }),
      during: "included",
      after: { plan: "free", displayState: "free" },
    },
  ];

  it.each(cases)("$name: Pro during, its own plan after", (c) => {
    const during = computeEntitlement(c.entitlements, c.billing, NOW, ON);
    const after = computeEntitlement(c.entitlements, c.billing, NOW);

    expect(during.plan).toBe("pro");
    expect([...during.capabilities].sort()).toEqual(
      [...ALL_CAPABILITIES].sort(),
    );
    expect(during.displayState).toBe(c.during);

    expect(after.plan).toBe(c.after.plan);
    expect(after.displayState).toBe(c.after.displayState);

    // The period never invents a source or touches the trial clock: the
    // account's own records read identically either way.
    expect(during.sources).toEqual(after.sources);
    expect(during.trialDaysLeft).toBe(after.trialDaysLeft);
  });

  it("off is exactly the normal rules (the option absent or false)", () => {
    for (const c of cases) {
      const absent = computeEntitlement(c.entitlements, c.billing, NOW);
      const off = computeEntitlement(c.entitlements, c.billing, NOW, {
        freeProPeriod: false,
      });
      expect(off).toEqual(absent);
    }
  });

  it("an expiring comp: comp while it lasts, included after it ends, Free once the period is off", () => {
    const comp = ent({ source: "comp", endsAt: addDays(NOW, 2) });
    const later = addDays(NOW, 5);
    expect(computeEntitlement([comp], null, NOW, ON).displayState).toBe("comp");
    expect(computeEntitlement([comp], null, later, ON).displayState).toBe(
      "included",
    );
    expect(computeEntitlement([comp], null, later)).toMatchObject({
      plan: "free",
      displayState: "free",
    });
  });

  it("a Free account during the period has Pro with no source of its own", () => {
    const r = computeEntitlement([], null, NOW, ON);
    expect(r).toMatchObject({ plan: "pro", sources: [], trialDaysLeft: null });
  });
});

describe("the words", () => {
  it("say Pro is included, temporarily, and never anything permanent", () => {
    const c = billingCopy("included", { trialDaysLeft: 3, endsOn: null });
    expect(c.label).toBe("Pro — included for everyone");
    expect(c.shortLabel).toBe("Pro — included");
    expect(c.explanation).toContain(FREE_PRO_PERIOD_NOTE);
    expect(FREE_PRO_PERIOD_NOTE).toBe(
      "Pro is currently included for everyone at no charge. Paid subscriptions are temporarily unavailable.",
    );
    const all = `${c.label} ${c.shortLabel} ${c.explanation}`.toLowerCase();
    for (const banned of [
      "forever",
      "lifetime",
      "complimentary",
      "canceled",
      "cancelled",
    ]) {
      expect(all).not.toContain(banned);
    }
  });

  it("an app build without the value reads it as Free, never as complimentary or paid", () => {
    // billingCopy's fallback is what a build that predates `included` runs
    // (TestFlight 1.0.0 (2) bundles that switch without the case).
    const fallback = billingCopy("not-a-state" as never, {
      trialDaysLeft: null,
      endsOn: null,
    });
    expect(fallback.shortLabel).toBe("Free");
  });
});

describe("the mobile wire shape is unchanged", () => {
  it("EntitlementDto keeps exactly its five fields", () => {
    const dto = toEntitlementDto(computeEntitlement([], null, NOW, ON));
    expect(Object.keys(dto).sort()).toEqual([
      "capabilities",
      "displayState",
      "plan",
      "sources",
      "trialDaysLeft",
    ]);
    expect(dto).toMatchObject({
      plan: "pro",
      sources: [],
      displayState: "included",
    });
    expect(dto.capabilities).toEqual([...ALL_CAPABILITIES].sort());
  });
});

describe("checkout and the portal during the period", () => {
  function fakeAccount(billingRow: { stripeCustomerId: string } | null) {
    const writes: string[] = [];
    const db = {
      profile: { findUnique: async () => ({ emailVerifiedAt: NOW }) },
      entitlement: { findMany: async () => [] },
      billingAccount: {
        findUnique: async () => billingRow,
        create: async () => {
          writes.push("billingAccount.create");
          return {};
        },
      },
      $queryRaw: async () => {
        writes.push("lock");
        return [];
      },
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        writes.push("transaction");
        return fn(db);
      },
    };
    return {
      account: {
        userId: UID,
        timeZone: "UTC",
        db: db as unknown as Account["db"],
      },
      writes,
    };
  }

  function provider(calls: string[]): BillingProvider {
    const record = (name: string) => async () => {
      calls.push(name);
      return undefined as never;
    };
    return {
      ensureCustomer: record("ensureCustomer"),
      createCheckoutSession: record("createCheckoutSession"),
      createPortalSession: async () => {
        calls.push("createPortalSession");
        return { url: "https://billing.stripe.test/p/xyz" };
      },
      getCheckoutSession: record("getCheckoutSession"),
      hasOpenSubscription: record("hasOpenSubscription"),
      expireOpenCheckoutSessions: record("expireOpenCheckoutSessions"),
    };
  }

  it("startCheckout refuses before any Stripe call or write, even with billing enabled", async () => {
    await withEnv(
      { STRIPE_BILLING_ENABLED: "true", OVERLOAD_FREE_PRO_PERIOD: "true" },
      async () => {
        const { account, writes } = fakeAccount(null);
        const calls: string[] = [];
        for (const interval of ["month", "year"] as const) {
          await expect(
            startCheckout(account, interval, {
              provider: provider(calls),
              ownEmail: async () => "a@b.c",
              inAppShell: async () => false,
              now: () => NOW,
            }),
          ).rejects.toMatchObject({
            code: "invalid_state_transition",
            message: FREE_PRO_PERIOD_NOTE,
          });
        }
        expect(calls).toEqual([]);
        expect(writes).toEqual([]);
      },
    );
  });

  it("the Customer Portal still opens for an existing customer, so a subscription can be canceled", async () => {
    await withEnv({ OVERLOAD_FREE_PRO_PERIOD: "true" }, async () => {
      const { account } = fakeAccount({ stripeCustomerId: "cus_1" });
      const calls: string[] = [];
      await expect(
        startPortal(account, {
          provider: provider(calls),
          inAppShell: async () => false,
        }),
      ).resolves.toEqual({ url: "https://billing.stripe.test/p/xyz" });
      expect(calls).toEqual(["createPortalSession"]);
    });
  });
});

describe("trial notices during the period", () => {
  it("are never due, and nothing is read or recorded", async () => {
    await withEnv({ OVERLOAD_FREE_PRO_PERIOD: "true" }, async () => {
      const touched: string[] = [];
      const db = new Proxy(
        {},
        {
          get: (_t, prop) => {
            touched.push(String(prop));
            throw new Error("no database access expected");
          },
        },
      );
      const account = {
        userId: UID,
        timeZone: "UTC",
        db: db as unknown as Account["db"],
      };
      await expect(
        getTrialNotice(account, { inAppShell: false, now: NOW }),
      ).resolves.toBeNull();
      expect(touched).toEqual([]);
    });
  });
});

describe("public calls to action during the period", () => {
  it("never route toward a purchase", () => {
    for (const signedIn of [true, false]) {
      for (const signupMode of ["public", "invite", "closed"] as const) {
        const ctx: MarketingContext = {
          signedIn,
          signupMode,
          billingEnabled: false, // isCheckoutEnabled() is false while on
          freeProPeriod: true,
        };
        expect(resolveCta(ctx).pro).toBeNull();
      }
    }
  });
});
