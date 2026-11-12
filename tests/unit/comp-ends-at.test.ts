jest.mock("@/lib/data/account", () => ({ requireAccount: jest.fn() }));
jest.mock("next/navigation", () => ({ notFound: jest.fn() }));
jest.mock("next/cache", () => ({ refresh: jest.fn() }));
jest.mock("@/lib/data/admin/identity", () => ({
  requireAdmin: jest.fn(async () => ({ adminUserId: "admin-1" })),
}));
jest.mock("@/lib/data/admin/accounts", () => ({
  suspendAccount: jest.fn(),
  reactivateAccount: jest.fn(),
}));
jest.mock("@/lib/data/admin/reset-email", () => ({
  sendAccountResetEmail: jest.fn(),
}));
jest.mock("@/lib/data/admin/billing", () => ({
  grantComp: jest.fn(async () => ({ granted: true })),
  revokeComp: jest.fn(),
}));

import { parseCompEndsAt } from "@/lib/admin/comp-ends-at";
import { grantComp } from "@/lib/data/admin/billing";
import { grantCompAction } from "@/app/admin/accounts/[id]/actions";

/** OVE-127 (mobile audit F-A16): the comp end date is validated. */
describe("parseCompEndsAt", () => {
  it("empty means no end date", () => {
    for (const v of [undefined, null, "", "   "]) {
      expect(parseCompEndsAt(v)).toBeNull();
    }
  });
  it("accepts a real calendar date and an ISO date-time", () => {
    expect(parseCompEndsAt("2027-02-28")).toEqual(
      new Date("2027-02-28T00:00:00.000Z"),
    );
    expect(parseCompEndsAt("2027-01-01T12:00:00Z")).toEqual(
      new Date("2027-01-01T12:00:00Z"),
    );
  });
  it("rejects impossible, malformed, or non-string values", () => {
    for (const v of [
      "2027-02-30",
      "2027-13-01",
      "not a date",
      "12/01/2027",
      "2027-1-1",
      42,
      {},
    ]) {
      expect([v, parseCompEndsAt(v)]).toEqual([v, "invalid"]);
    }
  });
});

describe("grantCompAction", () => {
  const TARGET = "55555555-5555-4555-8555-555555555555";
  beforeEach(() => jest.clearAllMocks());

  it("a malformed end date is a validation_error and grants nothing", async () => {
    const result = await grantCompAction({
      targetId: TARGET,
      reason: "founding_member",
      endsAt: "2027-02-30",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation_error" },
    });
    expect(grantComp).not.toHaveBeenCalled();
  });

  it("a past end date is a validation_error and grants nothing", async () => {
    const result = await grantCompAction({
      targetId: TARGET,
      reason: "founding_member",
      endsAt: "2020-01-01",
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "validation_error" },
    });
    expect(grantComp).not.toHaveBeenCalled();
  });

  it("a real future date or none is passed through as a Date or null", async () => {
    await grantCompAction({
      targetId: TARGET,
      reason: "founding_member",
      endsAt: "2099-01-01",
    });
    expect(grantComp).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ endsAt: new Date("2099-01-01T00:00:00.000Z") }),
    );
    await grantCompAction({ targetId: TARGET, reason: "founding_member" });
    expect(grantComp).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ endsAt: null }),
    );
  });
});
