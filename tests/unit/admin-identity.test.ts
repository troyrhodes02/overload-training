jest.mock("@/lib/data/account", () => ({ requireAccount: jest.fn() }));
jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { notFound } from "next/navigation";
import { requireAccount } from "@/lib/data/account";
import {
  adminActorFor,
  adminUserIds,
  assertAdmin,
  isAdminUserId,
  NotAdminError,
  requireAdmin,
} from "@/lib/data/admin/identity";

/**
 * Admin identity (Admin Center & Feedback, spec §6.1; R1): a server-only
 * allowlist of auth user ids, fail closed, read on every call, and
 * requireAdmin() → not-found for anyone else.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const saved = process.env.OVERLOAD_ADMIN_USER_IDS;

afterEach(() => {
  process.env.OVERLOAD_ADMIN_USER_IDS = saved;
  jest.clearAllMocks();
});

describe("adminUserIds", () => {
  it("parses commas and whitespace, lowercases, and drops anything that is not a UUID", () => {
    const env = {
      OVERLOAD_ADMIN_USER_IDS: ` ${A.toUpperCase()} ,\n${B}  not-a-uuid, ,admin `,
    };
    expect([...adminUserIds(env)].sort()).toEqual([A, B]);
  });

  it("is empty — nobody is an admin — when unset or blank (fail closed)", () => {
    expect(adminUserIds({}).size).toBe(0);
    expect(adminUserIds({ OVERLOAD_ADMIN_USER_IDS: "" }).size).toBe(0);
    expect(adminUserIds({ OVERLOAD_ADMIN_USER_IDS: "  , " }).size).toBe(0);
    expect(isAdminUserId(A, {})).toBe(false);
  });

  it("reads the environment on every call (no cache)", () => {
    process.env.OVERLOAD_ADMIN_USER_IDS = A;
    expect(isAdminUserId(A)).toBe(true);
    process.env.OVERLOAD_ADMIN_USER_IDS = B;
    expect(isAdminUserId(A)).toBe(false);
    expect(isAdminUserId(B)).toBe(true);
  });

  it("never matches a non-string or a prefix", () => {
    const env = { OVERLOAD_ADMIN_USER_IDS: A };
    expect(isAdminUserId(undefined as unknown as string, env)).toBe(false);
    expect(isAdminUserId(A.slice(0, 20), env)).toBe(false);
  });
});

describe("actors", () => {
  it("adminActorFor refuses an id that is not allowlisted", () => {
    process.env.OVERLOAD_ADMIN_USER_IDS = A;
    expect(adminActorFor(A, "UTC")).toEqual({ userId: A, timeZone: "UTC" });
    expect(() => adminActorFor(B, "UTC")).toThrow(NotAdminError);
  });

  it("assertAdmin re-checks the allowlist at use", () => {
    process.env.OVERLOAD_ADMIN_USER_IDS = A;
    const actor = adminActorFor(A, "UTC");
    expect(() => assertAdmin(actor)).not.toThrow();
    process.env.OVERLOAD_ADMIN_USER_IDS = "";
    expect(() => assertAdmin(actor)).toThrow(NotAdminError);
  });
});

describe("requireAdmin", () => {
  it("returns the actor for an allowlisted account", async () => {
    process.env.OVERLOAD_ADMIN_USER_IDS = A;
    (requireAccount as jest.Mock).mockResolvedValue({
      userId: A,
      timeZone: "America/Chicago",
    });
    await expect(requireAdmin()).resolves.toEqual({
      userId: A,
      timeZone: "America/Chicago",
    });
    expect(notFound).not.toHaveBeenCalled();
  });

  it("is not-found for any other authenticated account", async () => {
    process.env.OVERLOAD_ADMIN_USER_IDS = A;
    (requireAccount as jest.Mock).mockResolvedValue({
      userId: B,
      timeZone: "UTC",
    });
    await expect(requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("propagates requireAccount's own refusal (signed out, suspended) untouched", async () => {
    (requireAccount as jest.Mock).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT");
    expect(notFound).not.toHaveBeenCalled();
  });
});

describe("isAdminPath (the proxy's early not-found, R23)", () => {
  it("matches the admin area and nothing that merely starts with the word", async () => {
    const { isAdminPath } = await import("@/lib/auth-routes");
    for (const p of [
      "/admin",
      "/admin/",
      "/admin/accounts",
      "/admin/feedback/x",
    ]) {
      expect([p, isAdminPath(p)]).toEqual([p, true]);
    }
    for (const p of [
      "/",
      "/administrator",
      "/adminx",
      "/settings",
      "/feedback",
    ]) {
      expect([p, isAdminPath(p)]).toEqual([p, false]);
    }
  });
});
