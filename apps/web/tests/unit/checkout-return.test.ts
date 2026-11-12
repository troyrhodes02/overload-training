/**
 * Coming back from hosted Checkout without Stripe's redirect (OVE-112): the
 * per-tab note the page leaves before going to Stripe, read once, and the
 * decision for what the screen does next.
 */
import {
  CHECKOUT_CANCELLED_MESSAGE,
  CHECKOUT_CLOSED_MESSAGE,
  CHECKOUT_PENDING_KEY,
  CHECKOUT_PENDING_MAX_AGE_MS,
  checkoutReturn,
  notePendingCheckout,
  takePendingCheckout,
} from "@/lib/billing/checkout-return";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

const T = 1_800_000_000_000;

describe("the pending-checkout note", () => {
  it("is read once: a second read finds nothing", () => {
    const s = memoryStorage();
    notePendingCheckout(s, "cs_test_1", T);
    expect(takePendingCheckout(s, T + 5_000)).toBe("cs_test_1");
    expect(takePendingCheckout(s, T + 6_000)).toBeNull();
  });

  it("is ignored once stale (the lifter went elsewhere long ago), and cleared", () => {
    const s = memoryStorage();
    notePendingCheckout(s, "cs_test_1", T);
    expect(
      takePendingCheckout(s, T + CHECKOUT_PENDING_MAX_AGE_MS + 1),
    ).toBeNull();
    expect(s.getItem(CHECKOUT_PENDING_KEY)).toBeNull();
  });

  it("is ignored when malformed or from the future", () => {
    const s = memoryStorage();
    for (const raw of [
      "not json",
      "{}",
      '{"id":1,"at":1}',
      `{"id":"cs","at":${T + 3_600_000}}`,
    ]) {
      s.setItem(CHECKOUT_PENDING_KEY, raw);
      expect(takePendingCheckout(s, T)).toBeNull();
    }
  });

  it("never throws when storage is unavailable", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(() => notePendingCheckout(broken, "cs_test_1")).not.toThrow();
    expect(takePendingCheckout(broken)).toBeNull();
    expect(() => notePendingCheckout(null, "cs_test_1")).not.toThrow();
    expect(takePendingCheckout(null)).toBeNull();
  });
});

describe("what the screen does on return", () => {
  it("Stripe took the payment: the existing 'finishing up' state, never a cancelled toast", () => {
    expect(checkoutReturn("complete")).toEqual({ kind: "confirming" });
  });

  it.each(["open", "expired"] as const)(
    "left without paying (%s): checkout cancelled, plan unchanged",
    (outcome) => {
      expect(checkoutReturn(outcome)).toEqual({
        kind: "toast",
        message: CHECKOUT_CANCELLED_MESSAGE,
      });
    },
  );

  it.each(["unknown", null] as const)(
    "outcome unknown (%p): a neutral toast that claims nothing",
    (outcome) => {
      const next = checkoutReturn(outcome);
      expect(next).toEqual({ kind: "toast", message: CHECKOUT_CLOSED_MESSAGE });
      expect(CHECKOUT_CLOSED_MESSAGE).not.toMatch(/cancel|charged|paid/i);
    },
  );

  it("the toasts are plain and calm", () => {
    for (const m of [CHECKOUT_CANCELLED_MESSAGE, CHECKOUT_CLOSED_MESSAGE]) {
      expect(m).not.toContain("!");
      expect(m.length).toBeLessThan(60);
    }
  });
});
