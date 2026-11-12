/**
 * `reconcileGoalCompletionsSafely` is the boundary wrapper the logging actions
 * and goal pages call after their own work: a goal failure is logged and
 * swallowed so it can never fail a logged set, a workout completion, or a page
 * render (spec §11b, R30, R54).
 */
jest.mock("@/lib/db", () => ({ prisma: {} }));
jest.mock("@/lib/auth", () => ({ requireUser: jest.fn() }));
jest.mock("@/lib/progression/queries", () => ({
  getQualifyingSessionE1rms: jest.fn(),
}));

import { reconcileGoalCompletionsSafely } from "@/lib/goals/goals";
import type { Account } from "@/lib/data/account";

/** An account whose scoped client fails like a dropped connection. */
const failingAccount = {
  userId: "a0000000-0000-4000-8000-000000000001",
  timeZone: "UTC",
  db: {
    goal: {
      findMany: jest.fn(async () => {
        throw new Error("connection reset");
      }),
    },
  },
} as unknown as Account;

describe("reconcileGoalCompletionsSafely", () => {
  it("swallows a reconciliation failure and returns no transitions", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      reconcileGoalCompletionsSafely(failingAccount),
    ).resolves.toEqual([]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
