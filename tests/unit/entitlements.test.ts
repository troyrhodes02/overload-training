import type { BillingAccount, Entitlement } from "@prisma/client";

import {
  capabilitiesFor,
  can,
  computeEntitlement,
  subscriptionResolution,
} from "@/lib/entitlements/resolve";
import { ALL_CAPABILITIES, addDays } from "@/lib/billing/config";

/**
 * The PURE entitlement resolver (spec 19 §9, RD-1/2/3/4). No database: effective
 * plan, capabilities, and display state are a function of the owned Entitlement
 * rows plus the Stripe mirror and `now`. This is where AC-1 (trial lifecycle)
 * and the overlap rules are proven at the unit level; billing.int.test.ts
 * proves isolation, and the gating tests (B2) prove a Free account gets no Pro.
 */

const NOW = new Date("2026-11-01T12:00:00.000Z");
const UID = "11111111-1111-1111-1111-111111111111";

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

function billing(partial: Partial<BillingAccount>): BillingAccount {
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

describe("capabilitiesFor / can", () => {
  it("Pro grants every capability; Free grants none", () => {
    const pro = capabilitiesFor("pro");
    for (const c of ALL_CAPABILITIES) expect(pro.has(c)).toBe(true);
    expect(capabilitiesFor("free").size).toBe(0);
  });

  it("can() reads the resolved set", () => {
    const resolved = computeEntitlement([], null, NOW); // free
    expect(can(resolved, "progression_insights")).toBe(false);
    const trial = computeEntitlement(
      [
        ent({
          source: "trial",
          startedAt: addDays(NOW, -1),
          endsAt: addDays(NOW, 13),
        }),
      ],
      null,
      NOW,
    );
    expect(can(trial, "progression_insights")).toBe(true);
    expect(can(trial, "plan_import")).toBe(true);
  });
});

describe("trial lifecycle (AC-1)", () => {
  it("an active trial grants Pro with days left", () => {
    const r = computeEntitlement(
      [ent({ source: "trial", startedAt: NOW, endsAt: addDays(NOW, 14) })],
      null,
      NOW,
    );
    expect(r.plan).toBe("pro");
    expect(r.displayState).toBe("trial");
    expect(r.trialDaysLeft).toBe(14);
  });

  it("an expired trial returns Free with nothing else to grant it", () => {
    const r = computeEntitlement(
      [
        ent({
          source: "trial",
          startedAt: addDays(NOW, -20),
          endsAt: addDays(NOW, -1),
        }),
      ],
      null,
      NOW,
    );
    expect(r.plan).toBe("free");
    expect(r.displayState).toBe("free");
    expect(r.trialDaysLeft).toBeNull();
  });

  it("is Free at the exact expiry instant (endsAt is exclusive, no off-by-one)", () => {
    // The window is startedAt <= now < endsAt. At precisely endsAt the trial is
    // already over — a lifter does not get a free extra day on the boundary.
    const r = computeEntitlement(
      [ent({ source: "trial", startedAt: addDays(NOW, -14), endsAt: NOW })],
      null,
      NOW,
    );
    expect(r.plan).toBe("free");
    expect(r.displayState).toBe("free");
    expect(r.trialDaysLeft).toBeNull();
  });
});

describe("comp", () => {
  it("an open-ended comp grants Pro and reads as complimentary", () => {
    const r = computeEntitlement(
      [ent({ source: "comp", endsAt: null, compReason: "founding_member" })],
      null,
      NOW,
    );
    expect(r.plan).toBe("pro");
    expect(r.displayState).toBe("comp");
    expect(r.sources).toContain("comp");
  });

  it("a dated comp lapses after its end date", () => {
    const active = computeEntitlement(
      [ent({ source: "comp", endsAt: addDays(NOW, 5) })],
      null,
      NOW,
    );
    expect(active.plan).toBe("pro");
    const lapsed = computeEntitlement(
      [ent({ source: "comp", endsAt: addDays(NOW, -1) })],
      null,
      NOW,
    );
    expect(lapsed.plan).toBe("free");
  });

  it("a revoked comp grants nothing", () => {
    const r = computeEntitlement(
      [ent({ source: "comp", revokedAt: addDays(NOW, -1) })],
      null,
      NOW,
    );
    expect(r.plan).toBe("free");
  });
});

describe("subscription mirror (spec §6)", () => {
  it("active monthly / annual map to paid states", () => {
    expect(
      computeEntitlement([], billing({ interval: "month" }), NOW).displayState,
    ).toBe("paid_monthly");
    expect(
      computeEntitlement([], billing({ interval: "year" }), NOW).displayState,
    ).toBe("paid_annual");
  });

  it("cancelAtPeriodEnd still grants Pro, shown as canceling", () => {
    const r = computeEntitlement([], billing({ cancelAtPeriodEnd: true }), NOW);
    expect(r.plan).toBe("pro");
    expect(r.displayState).toBe("canceling");
  });

  it("cancelAtPeriodEnd lapses at currentPeriodEnd even if the deletion webhook never lands", () => {
    // Paid through the period: still Pro.
    expect(
      computeEntitlement(
        [],
        billing({
          cancelAtPeriodEnd: true,
          currentPeriodEnd: addDays(NOW, 1),
        }),
        NOW,
      ).plan,
    ).toBe("pro");
    // At the instant the period ends (exclusive) and after: Free, with a
    // stale `active` mirror — no lingering Pro on stale server data.
    for (const end of [NOW, addDays(NOW, -2)]) {
      const r = computeEntitlement(
        [],
        billing({ cancelAtPeriodEnd: true, currentPeriodEnd: end }),
        NOW,
      );
      expect(r.plan).toBe("free");
      expect(r.capabilities.size).toBe(0);
      expect(r.displayState).toBe("free");
    }
  });

  it("an unknown period end defers to Stripe's status; a renewing subscription is never cut at its period end", () => {
    expect(
      computeEntitlement(
        [],
        billing({ cancelAtPeriodEnd: true, currentPeriodEnd: null }),
        NOW,
      ).plan,
    ).toBe("pro");
    // Not canceling: Stripe renews it; a delayed invoice.paid must not drop
    // a paying lifter, so the period end is not read here.
    expect(
      computeEntitlement(
        [],
        billing({
          cancelAtPeriodEnd: false,
          currentPeriodEnd: addDays(NOW, -1),
        }),
        NOW,
      ).plan,
    ).toBe("pro");
  });

  it("a lapsed canceling subscription falls back to a valid comp", () => {
    const r = computeEntitlement(
      [ent({ source: "comp", compReason: "tester" })],
      billing({ cancelAtPeriodEnd: true, currentPeriodEnd: addDays(NOW, -1) }),
      NOW,
    );
    expect(r.plan).toBe("pro");
    expect(r.sources).toEqual(["comp"]);
    expect(r.displayState).toBe("comp");
  });

  it("past_due grants Pro within grace, Free after", () => {
    const inGrace = computeEntitlement(
      [],
      billing({ status: "past_due", graceEndsAt: addDays(NOW, 3) }),
      NOW,
    );
    expect(inGrace.plan).toBe("pro");
    expect(inGrace.displayState).toBe("grace");
    const afterGrace = computeEntitlement(
      [],
      billing({ status: "past_due", graceEndsAt: addDays(NOW, -1) }),
      NOW,
    );
    expect(afterGrace.plan).toBe("free");
  });

  it("canceled / unpaid / incomplete grant nothing", () => {
    for (const status of ["canceled", "unpaid", "incomplete"] as const) {
      expect(subscriptionResolution(billing({ status }), NOW).pro).toBe(false);
    }
  });

  it("no mirror means no subscription Pro", () => {
    expect(subscriptionResolution(null, NOW).pro).toBe(false);
  });
});

describe("overlapping sources (spec §6 / pitch §4.14)", () => {
  it("an expired trial does not revoke an active comp", () => {
    const r = computeEntitlement(
      [
        ent({
          id: "t",
          source: "trial",
          startedAt: addDays(NOW, -20),
          endsAt: addDays(NOW, -1),
        }),
        ent({ id: "c", source: "comp", endsAt: null }),
      ],
      null,
      NOW,
    );
    expect(r.plan).toBe("pro");
    expect(r.displayState).toBe("comp");
  });

  it("a paying subscription shows the paid state even alongside a trial, and lists both sources", () => {
    const r = computeEntitlement(
      [ent({ source: "trial", startedAt: NOW, endsAt: addDays(NOW, 14) })],
      billing({ interval: "month" }),
      NOW,
    );
    expect(r.plan).toBe("pro");
    expect(r.displayState).toBe("paid_monthly");
    expect(r.sources).toEqual(
      expect.arrayContaining(["trial", "subscription"]),
    );
  });

  it("a comp alongside a payment problem surfaces grace but stays Pro", () => {
    const r = computeEntitlement(
      [ent({ source: "comp", endsAt: null })],
      billing({ status: "past_due", graceEndsAt: addDays(NOW, 2) }),
      NOW,
    );
    expect(r.plan).toBe("pro");
    expect(r.displayState).toBe("grace");
  });
});
