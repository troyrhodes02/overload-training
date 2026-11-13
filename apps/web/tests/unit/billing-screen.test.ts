import { billingCopy, formatEndsOn } from "@/lib/billing/screen";

/**
 * Plans, Billing & Promo Codes — Plan & Billing copy (PR #112 cancellation UX).
 * A scheduled cancellation must read as scheduled, name the REAL end date, and
 * never imply another renewal; active renews (with its date); a reversed
 * cancellation is just active again; an expired/canceled subscription is Free.
 */

const END = "December 4, 2026";

describe("billingCopy", () => {
  it("active monthly renews, with the date when known", () => {
    const withDate = billingCopy("paid_monthly", {
      trialDaysLeft: null,
      endsOn: END,
    });
    expect(withDate.label).toBe("Pro — Monthly");
    expect(withDate.explanation).toBe(
      `Renews monthly on ${END}. Manage or cancel anytime.`,
    );
    const noDate = billingCopy("paid_monthly", {
      trialDaysLeft: null,
      endsOn: null,
    });
    expect(noDate.explanation).toBe(
      "Renews monthly. Manage or cancel anytime.",
    );
  });

  it("scheduled cancellation says so, names the end date, and promises no renewal", () => {
    const c = billingCopy("canceling", { trialDaysLeft: null, endsOn: END });
    expect(c.label).toBe("Pro — cancellation scheduled");
    expect(c.explanation).toContain("Cancellation scheduled");
    expect(c.explanation).toContain(`ends on ${END}`);
    expect(c.explanation).toContain("won't be charged for another renewal");
    expect(c.explanation).toContain("moves to Free");
    // Never the misleading "renews" wording.
    expect(c.explanation.toLowerCase()).not.toContain("renews");
  });

  it("scheduled cancellation still reads sensibly without a known end date", () => {
    const c = billingCopy("canceling", { trialDaysLeft: null, endsOn: null });
    expect(c.label).toBe("Pro — cancellation scheduled");
    expect(c.explanation).toContain("Cancellation scheduled");
    expect(c.explanation.toLowerCase()).not.toContain("renews");
  });

  it("a reversed cancellation is just the active renewal copy again", () => {
    // After un-canceling, the resolved state is paid_* again (not canceling).
    const r = billingCopy("paid_annual", { trialDaysLeft: null, endsOn: END });
    expect(r.label).toBe("Pro — Annual");
    expect(r.explanation).toContain("Renews yearly");
    expect(r.explanation).not.toContain("Cancellation scheduled");
  });

  it("an expired/canceled subscription is Free", () => {
    const f = billingCopy("free", { trialDaysLeft: null, endsOn: null });
    expect(f.label).toBe("Free");
  });
});

describe("formatEndsOn (billing date = UTC calendar date, matches Stripe)", () => {
  it("is null when there is no period end", () => {
    expect(formatEndsOn(null)).toBeNull();
  });

  it("renders the UTC calendar date, not a timezone-rolled one (the Dec 3 vs Dec 4 bug)", () => {
    // An early-morning-UTC instant would render as the previous day in
    // US-negative timezones. It must stay on its UTC date to match Stripe.
    expect(formatEndsOn(new Date("2026-12-04T00:00:00Z"))).toBe(
      "December 4, 2026",
    );
    expect(formatEndsOn(new Date("2026-12-04T05:00:00Z"))).toBe(
      "December 4, 2026",
    );
    expect(formatEndsOn(new Date("2026-12-04T23:59:59Z"))).toBe(
      "December 4, 2026",
    );
  });

  it("does not drift across a month/year boundary", () => {
    expect(formatEndsOn(new Date("2026-12-31T23:30:00Z"))).toBe(
      "December 31, 2026",
    );
    expect(formatEndsOn(new Date("2027-01-01T00:00:00Z"))).toBe(
      "January 1, 2027",
    );
  });
});
