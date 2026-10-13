/**
 * `reconcileGoalCompletionsSafely` is the boundary wrapper the logging actions
 * and goal pages call after their own work: a goal failure is logged and
 * swallowed so it can never fail a logged set, a workout completion, or a page
 * render (spec §11b, R30, R54).
 */
jest.mock("@/lib/db", () => ({
  prisma: {
    goal: {
      findMany: jest.fn(async () => {
        throw new Error("connection reset");
      }),
    },
  },
}));
jest.mock("@/lib/progression/queries", () => ({
  getQualifyingSessionE1rms: jest.fn(),
}));

import { reconcileGoalCompletionsSafely } from "@/lib/goals/goals";

describe("reconcileGoalCompletionsSafely", () => {
  it("swallows a reconciliation failure and returns no transitions", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(reconcileGoalCompletionsSafely()).resolves.toEqual([]);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
