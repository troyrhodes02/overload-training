/**
 * POST /api/stripe/webhook route handler (Plans, Billing & Promo Codes;
 * OVE-92 + the proxy/auth fix). The route must accept an UNAUTHENTICATED Stripe
 * POST (the proxy lets it through — see public-accounts-routes.test.ts), verify
 * the signature before any work, and be idempotent on replay. The signature
 * verification and the DB reconcile are injected via module mocks so this runs
 * with no Stripe client and no database.
 */
const constructWebhookEvent = jest.fn();
const fetchSubscriptionSnapshot = jest.fn();
jest.mock("@/lib/billing/stripe", () => ({
  constructWebhookEvent: (...args: unknown[]) => constructWebhookEvent(...args),
  fetchSubscriptionSnapshot: (...args: unknown[]) =>
    fetchSubscriptionSnapshot(...args),
}));

const reconcileStripeEvent = jest.fn();
jest.mock("@/lib/data/billing-webhook", () => ({
  reconcileStripeEvent: (...args: unknown[]) => reconcileStripeEvent(...args),
}));

import { POST } from "@/app/api/stripe/webhook/route";

function post(opts: { signature?: string; body?: string } = {}) {
  const headers = new Headers();
  if (opts.signature !== undefined)
    headers.set("stripe-signature", opts.signature);
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers,
    body: opts.body ?? "{}",
  });
}

const EVENT = {
  id: "evt_1",
  type: "checkout.session.completed",
  data: { object: { customer: "cus_1", subscription: "sub_1" } },
};

beforeEach(() => {
  constructWebhookEvent.mockReset();
  reconcileStripeEvent.mockReset();
  fetchSubscriptionSnapshot.mockReset();
});

it("rejects a request with no stripe-signature header (400), verifying nothing", async () => {
  const res = await POST(post({ body: "{}" }));
  expect(res.status).toBe(400);
  expect(constructWebhookEvent).not.toHaveBeenCalled();
  expect(reconcileStripeEvent).not.toHaveBeenCalled();
});

it("rejects an invalid signature (400) and never touches the database", async () => {
  constructWebhookEvent.mockImplementation(() => {
    throw new Error("No signatures found matching the expected signature");
  });
  const res = await POST(post({ signature: "bad", body: "{}" }));
  expect(res.status).toBe(400);
  expect(reconcileStripeEvent).not.toHaveBeenCalled();
});

it("verifies then reconciles a signed event, returning 200", async () => {
  constructWebhookEvent.mockReturnValue(EVENT);
  reconcileStripeEvent.mockResolvedValue({
    status: "processed",
    userId: "u1",
  });
  const res = await POST(post({ signature: "good", body: "{raw}" }));
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ received: true });
  // The raw body + signature are what gets verified.
  expect(constructWebhookEvent).toHaveBeenCalledWith("{raw}", "good");
  // The parsed event is handed to the reconciler (id/type/object).
  const [event] = reconcileStripeEvent.mock.calls[0];
  expect(event).toEqual({
    id: EVENT.id,
    type: EVENT.type,
    object: EVENT.data.object,
  });
});

it("is idempotent: a replayed (duplicate) event still returns 200", async () => {
  constructWebhookEvent.mockReturnValue(EVENT);
  reconcileStripeEvent.mockResolvedValue({ status: "duplicate" });
  const res = await POST(post({ signature: "good" }));
  expect(res.status).toBe(200);
  await expect(res.json()).resolves.toEqual({ received: true });
});

it("returns 500 (so Stripe retries) when reconciling throws, leaking no internals", async () => {
  constructWebhookEvent.mockReturnValue(EVENT);
  reconcileStripeEvent.mockRejectedValue(new Error("db down"));
  const res = await POST(post({ signature: "good" }));
  expect(res.status).toBe(500);
  const body = await res.json();
  expect(JSON.stringify(body)).not.toContain("db down");
});
