/**
 * Pitch 21j — account deletion from the iPhone app, end to end through the
 * route handlers (spec §5, §13 "Deletion"). Replaced: Supabase Auth's token
 * check (an opaque "t.<userId>.s" token verifies as that user, with the email
 * "<userId>@example.test"), the password re-check, the auth-identity removal,
 * and Stripe. The pipeline, the deletion module, and every row are real.
 */
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: async () => {},
}));
jest.mock("@/lib/data/access-token", () => ({
  verifyAccessToken: async (token: string) => {
    const userId = token.split(".")[1];
    return { kind: "user", userId, email: `${userId}@example.test` };
  },
}));
jest.mock("@/lib/accounts/password", () => ({
  verifyCurrentPassword: jest.fn(),
}));
jest.mock("@/lib/supabase/admin", () => ({
  ...jest.requireActual("@/lib/supabase/admin"),
  deleteAuthUser: jest.fn(),
}));
jest.mock("@/lib/billing/stripe", () => ({
  ...jest.requireActual("@/lib/billing/stripe"),
  stripeDeletionDeps: jest.fn(),
}));

import type { Account } from "@/lib/data/account";
import { POST as deleteRoute } from "@/app/api/mobile/v1/me/delete/route";
import { GET as inventoryRoute } from "@/app/api/mobile/v1/me/deletion-inventory/route";
import { GET as meRoute } from "@/app/api/mobile/v1/me/route";
import { verifyCurrentPassword } from "@/lib/accounts/password";
import { deleteAuthUser } from "@/lib/supabase/admin";
import { stripeDeletionDeps } from "@/lib/billing/stripe";
import { accountInventory } from "@/lib/accounts/deletion";
import { createGym } from "@/lib/gyms/gyms";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import { ownedRowCount, snapshotAccount } from "./isolation/support";

type Handler = (
  request: Request,
  route: { params: Promise<never> },
) => Promise<Response>;

const verify = verifyCurrentPassword as jest.MockedFunction<
  typeof verifyCurrentPassword
>;
const removeIdentity = deleteAuthUser as jest.MockedFunction<
  typeof deleteAuthUser
>;
const stripeDeps = stripeDeletionDeps as jest.MockedFunction<
  typeof stripeDeletionDeps
>;
const db = () => getTestPrisma();

async function call(handler: unknown, account: Account, json?: unknown) {
  const headers = new Headers({
    "x-overload-app-version": "9.9.9",
    authorization: `Bearer t.${account.userId}.s`,
  });
  if (json !== undefined) headers.set("content-type", "application/json");
  const res = await (handler as Handler)(
    new Request("http://localhost/api/mobile/v1/x", {
      method: json === undefined ? "GET" : "POST",
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
    }),
    { params: Promise.resolve({}) as Promise<never> },
  );
  const text = await res.text();
  return { status: res.status, text, body: text ? JSON.parse(text) : null };
}

async function withData(account: Account, gymName: string) {
  await createGym(account, { name: gymName, address: null });
  await account.db.goal.count(); // touch: the account is live
}

async function subscribe(account: Account, customer: string, sub: string) {
  await account.db.billingAccount.create({
    data: {
      userId: account.userId,
      stripeCustomerId: customer,
      subscriptionId: sub,
      status: "active",
      interval: "month",
    },
  });
}

let a: Account;
let b: Account;
let cancel: jest.Mock;

beforeEach(async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  verify.mockReset().mockResolvedValue("ok");
  removeIdentity.mockReset().mockResolvedValue("deleted");
  cancel = jest.fn(async () => ({ canceled: [] as string[] }));
  stripeDeps.mockReset().mockReturnValue({ cancelAllSubscriptions: cancel });
  a = await createTestAccount();
  b = await createTestAccount();
  await withData(a, "Alpha Gym");
  await withData(b, "Bravo Gym");
  // The pipeline stamps last-active once a day on an account's first request;
  // make that request now, so snapshots compare only what deletion touches.
  await call(inventoryRoute, a);
  await call(inventoryRoute, b);
});
afterEach(() => jest.restoreAllMocks());

const libraryCount = () => db().exercise.count({ where: { isCustom: false } });

describe("E8 GET /me/deletion-inventory", () => {
  it("is accountInventory for the token's account", async () => {
    const r = await call(inventoryRoute, a);
    expect([r.status, r.body]).toEqual([200, await accountInventory(a)]);
    expect(r.body.gyms).toBe(1);
  });
});

describe("E9 POST /me/delete", () => {
  it("a missing or empty password is a 400 and nothing is checked or deleted", async () => {
    const before = await snapshotAccount(a.userId);
    for (const body of [{}, { password: "" }, { password: 42 }]) {
      const r = await call(deleteRoute, a, body);
      expect([r.status, r.body.error.details]).toEqual([
        400,
        { password: "Enter your password to confirm." },
      ]);
    }
    expect(verify).not.toHaveBeenCalled();
    expect(await snapshotAccount(a.userId)).toEqual(before);
  });

  it("checks the password against the TOKEN's email, never a body field", async () => {
    await call(deleteRoute, a, {
      password: "pw",
      email: "someone-else@example.test",
      userId: b.userId,
    });
    expect(verify).toHaveBeenCalledWith(`${a.userId}@example.test`, "pw");
    expect(await ownedRowCount(b.userId)).toBeGreaterThan(0);
  });

  it("a wrong password is a 400 on the field; every row stays", async () => {
    verify.mockResolvedValue("wrong");
    const before = await snapshotAccount(a.userId);
    const r = await call(deleteRoute, a, { password: "nope" });
    expect([r.status, r.body.error.details]).toEqual([
      400,
      { password: "That password isn't right." },
    ]);
    expect(await snapshotAccount(a.userId)).toEqual(before);
    expect(removeIdentity).not.toHaveBeenCalled();
  });

  it("a rate-limited check is a 429 and an unavailable one a 500; nothing deleted", async () => {
    const before = await snapshotAccount(a.userId);
    verify.mockResolvedValue("rate_limited");
    expect((await call(deleteRoute, a, { password: "pw" })).status).toBe(429);
    verify.mockResolvedValue("unavailable");
    const r = await call(deleteRoute, a, { password: "pw" });
    expect([r.status, r.body.error.code]).toEqual([500, "internal_error"]);
    expect(r.body.error.message).toContain("Nothing was deleted");
    expect(await snapshotAccount(a.userId)).toEqual(before);
  });

  it("Free with no Stripe customer: deleted; only A's rows go; B and the library stay", async () => {
    const bBefore = await snapshotAccount(b.userId);
    const lib = await libraryCount();
    const r = await call(deleteRoute, a, { password: "pw" });
    expect([r.status, r.body]).toEqual([200, { outcome: "deleted" }]);
    expect(cancel).not.toHaveBeenCalled();
    expect(removeIdentity).toHaveBeenCalledWith(a.userId);
    expect(await ownedRowCount(a.userId)).toBe(0);
    expect(await snapshotAccount(b.userId)).toEqual(bBefore);
    expect(await libraryCount()).toBe(lib);
  });

  it("an active subscription is canceled on A's customer BEFORE any delete", async () => {
    await subscribe(a, "cus_app_a", "sub_app_a");
    await subscribe(b, "cus_app_b", "sub_app_b");
    let rowsAtCancel = -1;
    const rowsBefore = await ownedRowCount(a.userId);
    cancel.mockImplementation(async () => {
      rowsAtCancel = await ownedRowCount(a.userId);
      return { canceled: ["sub_app_a"] };
    });
    const r = await call(deleteRoute, a, { password: "pw" });
    expect([r.status, r.body]).toEqual([200, { outcome: "deleted" }]);
    expect(cancel).toHaveBeenCalledWith("cus_app_a");
    expect(rowsAtCancel).toBe(rowsBefore);
    expect(await ownedRowCount(a.userId)).toBe(0);
    expect(
      await db().billingAccount.count({ where: { userId: b.userId } }),
    ).toBe(1);
  });

  it("a Stripe cancel failure is a 409 billing_not_canceled; A is fully intact", async () => {
    await subscribe(a, "cus_app_fail", "sub_app_fail");
    cancel.mockRejectedValue(new Error("stripe down"));
    const before = await snapshotAccount(a.userId);
    const r = await call(deleteRoute, a, { password: "pw" });
    expect([r.status, r.body.error.code, r.body.error.details]).toEqual([
      409,
      "conflict",
      { reason: "billing_not_canceled" },
    ]);
    expect(r.body.error.message).toContain("nothing was deleted");
    expect(await snapshotAccount(a.userId)).toEqual(before);
    expect(removeIdentity).not.toHaveBeenCalled();
  });

  it("Stripe not configured: refused while the mirror says subscribed, allowed once it's over", async () => {
    stripeDeps.mockReturnValue({ cancelAllSubscriptions: null });
    await subscribe(a, "cus_app_nc", "sub_app_nc");
    const before = await snapshotAccount(a.userId);
    const refused = await call(deleteRoute, a, { password: "pw" });
    expect(refused.status).toBe(409);
    expect(await snapshotAccount(a.userId)).toEqual(before);
    await db().billingAccount.update({
      where: { userId: a.userId },
      data: { status: "canceled" },
    });
    const ok = await call(deleteRoute, a, { password: "pw" });
    expect([ok.status, ok.body]).toEqual([200, { outcome: "deleted" }]);
    expect(await ownedRowCount(a.userId)).toBe(0);
  });

  it("comp and trial entitlements are deleted with the account", async () => {
    await db().entitlement.create({
      data: {
        userId: a.userId,
        source: "trial",
        plan: "pro",
        startedAt: new Date(),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    expect(
      await db().entitlement.count({ where: { userId: a.userId } }),
    ).toBeGreaterThanOrEqual(2);
    const r = await call(deleteRoute, a, { password: "pw" });
    expect(r.body).toEqual({ outcome: "deleted" });
    expect(await db().entitlement.count({ where: { userId: a.userId } })).toBe(
      0,
    );
  });

  it("identity removal failing is identity_pending (data gone); a retry finishes", async () => {
    removeIdentity.mockRejectedValueOnce(new Error("auth down"));
    const first = await call(deleteRoute, a, { password: "pw" });
    expect([first.status, first.body]).toEqual([
      200,
      { outcome: "identity_pending" },
    ]);
    expect(await db().gym.count({ where: { userId: a.userId } })).toBe(0);
    // The identity still verifies; the next request recreates an empty
    // profile (the web's accepted semantics), and a retry closes it.
    await db().profile.upsert({
      where: { userId: a.userId },
      create: { userId: a.userId, timeZone: "UTC" },
      update: {},
    });
    const retry = await call(deleteRoute, a, { password: "pw" });
    expect([retry.status, retry.body]).toEqual([200, { outcome: "deleted" }]);
    expect(await ownedRowCount(a.userId)).toBe(0);
  });

  it("after deletion the token is refused: GET /me is 401, and a retry is 401", async () => {
    await call(deleteRoute, a, { password: "pw" });
    const me = await call(meRoute, a);
    expect([me.status, me.body.error.code]).toEqual([401, "unauthorized"]);
    const again = await call(deleteRoute, a, { password: "pw" });
    expect(again.status).toBe(401);
    expect(await db().profile.count({ where: { userId: a.userId } })).toBe(0);
  });

  it("never logs the password or the email", async () => {
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    removeIdentity.mockRejectedValueOnce(new Error("auth down"));
    await call(deleteRoute, a, { password: "s3cret-password" });
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("s3cret-password");
    expect(logged).not.toContain(`${a.userId}@example.test`);
  });
});
