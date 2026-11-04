import { billingCopy } from "@/lib/billing/screen";

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
