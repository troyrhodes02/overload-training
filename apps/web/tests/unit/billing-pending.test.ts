import {
  isConfirmingCheckout,
  subscriptionConfirmed,
} from "@/lib/billing/pending";
import type { DisplayState } from "@overload/shared/entitlements/types";

/**
 * Plans, Billing & Promo Codes — the checkout "finishing up" indicator
 * (PR #112 preview bug: it stayed spinning forever even after the account was
 * Pro). The indicator must bridge only the gap until the subscription is
 * recognized, then clear automatically, and never show on an ordinary load.
 */

describe("subscriptionConfirmed", () => {
  it("is true only for states that reflect a Stripe subscription", () => {
    const paid: DisplayState[] = [
      "paid_monthly",
      "paid_annual",
      "canceling",
      "grace",
    ];
    for (const s of paid) expect(subscriptionConfirmed(s)).toBe(true);
    const notSub: DisplayState[] = ["free", "trial", "comp"];
    for (const s of notSub) expect(subscriptionConfirmed(s)).toBe(false);
  });
});

describe("isConfirmingCheckout", () => {
  it("clears the moment the subscription is recognized (the reported bug)", () => {
    // Pro — Monthly with ?status=success still in the URL must NOT spin.
    expect(isConfirmingCheckout("success", "paid_monthly")).toBe(false);
    expect(isConfirmingCheckout("success", "paid_annual")).toBe(false);
    expect(isConfirmingCheckout("success", "canceling")).toBe(false);
    expect(isConfirmingCheckout("success", "grace")).toBe(false);
  });

  it("shows while a success return is genuinely still pending", () => {
    expect(isConfirmingCheckout("success", "free")).toBe(true);
    expect(isConfirmingCheckout("success", "trial")).toBe(true);
    expect(isConfirmingCheckout("success", "comp")).toBe(true);
  });

  it("never shows on an ordinary load or a cancelled return", () => {
    expect(isConfirmingCheckout(null, "free")).toBe(false);
    expect(isConfirmingCheckout(null, "paid_monthly")).toBe(false);
    expect(isConfirmingCheckout(null, "trial")).toBe(false);
    expect(isConfirmingCheckout("cancelled", "free")).toBe(false);
    expect(isConfirmingCheckout("cancelled", "paid_monthly")).toBe(false);
  });
});
