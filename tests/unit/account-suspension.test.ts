jest.mock("@/lib/auth", () => ({
  requireUser: jest.fn(),
  getAuthUser: jest.fn(),
}));
jest.mock("@/lib/data/account-db", () => ({ createAccountClient: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

import { getAuthUser, requireUser } from "@/lib/auth";
import { createAccountClient } from "@/lib/data/account-db";
import { getAccessState, requireAccount } from "@/lib/data/account";
import { todayIso } from "@/lib/plan/calendar";

/**
 * Suspension and last-active in the per-request chokepoint (Admin Center &
 * Feedback, spec §7; R3, R4). requireAccount() refuses a suspended account
 * on every call — a session that signed in before the suspension included —
 * and records an active account's last-active day at most once.
 */

const USER = "33333333-3333-4333-8333-333333333333";
const findUnique = jest.fn();
const updateMany = jest.fn();
const db = { profile: { findUnique, updateMany, create: jest.fn() } };

beforeEach(() => {
  jest.clearAllMocks();
  (requireUser as jest.Mock).mockResolvedValue({ id: USER });
  (getAuthUser as jest.Mock).mockResolvedValue({ id: USER });
  (createAccountClient as jest.Mock).mockReturnValue(db);
  updateMany.mockResolvedValue({ count: 1 });
});

const profile = (over: object) => ({
  timeZone: "UTC",
  status: "active",
  lastActiveOn: null,
  ...over,
});

it("a suspended account is redirected to /suspended and nothing is recorded", async () => {
  findUnique.mockResolvedValue(profile({ status: "suspended" }));
  await expect(requireAccount()).rejects.toThrow("NEXT_REDIRECT:/suspended");
  expect(updateMany).not.toHaveBeenCalled();
});

it("the very next request after suspension is refused, with no session cache to go stale", async () => {
  findUnique.mockResolvedValueOnce(profile({ lastActiveOn: new Date() }));
  await expect(requireAccount()).resolves.toMatchObject({ userId: USER });
  findUnique.mockResolvedValueOnce(profile({ status: "suspended" }));
  await expect(requireAccount()).rejects.toThrow("NEXT_REDIRECT:/suspended");
  // Reactivated: the following request works again.
  findUnique.mockResolvedValueOnce(profile({ lastActiveOn: new Date() }));
  await expect(requireAccount()).resolves.toMatchObject({ userId: USER });
});

it("an active account with no last-active date records today, conditionally", async () => {
  findUnique.mockResolvedValue(profile({}));
  await requireAccount();
  const today = todayIso("UTC");
  expect(updateMany).toHaveBeenCalledWith({
    where: {
      userId: USER,
      OR: [
        { lastActiveOn: null },
        { lastActiveOn: { lt: new Date(`${today}T00:00:00.000Z`) } },
      ],
    },
    data: { lastActiveOn: new Date(`${today}T00:00:00.000Z`) },
  });
});

it("an account already seen today writes nothing", async () => {
  const today = todayIso("UTC");
  findUnique.mockResolvedValue(
    profile({ lastActiveOn: new Date(`${today}T00:00:00.000Z`) }),
  );
  await requireAccount();
  expect(updateMany).not.toHaveBeenCalled();
});

it("a failed last-active write never blocks the request", async () => {
  findUnique.mockResolvedValue(profile({}));
  updateMany.mockRejectedValue(new Error("pool exhausted"));
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  await expect(requireAccount()).resolves.toMatchObject({ userId: USER });
  expect(spy).toHaveBeenCalledWith(
    "last-active: could not record today",
    "Error",
  );
  spy.mockRestore();
});

it("getAccessState reads only the session's account", async () => {
  findUnique.mockResolvedValue({ status: "suspended" });
  await expect(getAccessState()).resolves.toBe("suspended");
  expect(createAccountClient).toHaveBeenCalledWith(USER);
  (getAuthUser as jest.Mock).mockResolvedValue(null);
  await expect(getAccessState()).resolves.toBe("signed_out");
});
