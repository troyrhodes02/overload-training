/**
 * Goals server actions (OVE-31) and the goal-completion boundaries on the
 * logging actions (spec §11b, R30, R55).
 *
 *  - Every goal action re-checks the auth session FIRST and writes nothing for
 *    an unauthenticated caller.
 *  - The logging actions reconcile goal completion only AFTER their write
 *    succeeded, and a failed write never triggers it.
 */
jest.mock("@/lib/goals/goals", () => ({
  createGoal: jest.fn(),
  archiveGoal: jest.fn(),
  acknowledgeGoalCompletion: jest.fn(),
  reconcileGoalCompletionsSafely: jest.fn(async () => []),
}));
jest.mock("@/lib/logging/sessions", () => ({
  changeGym: jest.fn(),
  completeWorkout: jest.fn(),
  startOrResumeWorkout: jest.fn(),
  swapExercise: jest.fn(),
}));
jest.mock("@/lib/logging/logged-sets", () => ({
  logSet: jest.fn(),
  editLoggedSet: jest.fn(),
}));
jest.mock("@/lib/logging/missed-days", () => ({ resolveMissedDay: jest.fn() }));
jest.mock("@/lib/cardio/cardio-logs", () => ({
  logCardio: jest.fn(),
  editCardioLog: jest.fn(),
}));
jest.mock("@/lib/data/account", () => ({ requireAccount: jest.fn() }));
jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
jest.mock("next/cache", () => ({ refresh: jest.fn() }));

import { requireAccount } from "@/lib/data/account";
import * as goals from "@/lib/goals/goals";
import * as sessions from "@/lib/logging/sessions";
import * as loggedSets from "@/lib/logging/logged-sets";
import { DomainError } from "@/lib/actions/result";
import * as goalActions from "@/app/(app)/goals/actions";
import { completeWorkoutAction, logSetAction } from "@/app/(app)/log/actions";
import { editLoggedSetAction } from "@/app/(app)/history/actions";

/** The acting account the mocked requireAccount() resolves (Multi-User Foundation). */
const TEST_ACCOUNT = { userId: "a0000000-0000-4000-8000-000000000001" };

const ID = "3f2c1d1e-8a7b-4c6d-9e0f-112233445566";
const reconcile = goals.reconcileGoalCompletionsSafely as jest.Mock;

describe("goal actions re-check auth before doing anything", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAccount as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT:/login");
    });
  });

  it("exports exactly the goal actions", () => {
    const names = Object.entries(goalActions)
      .filter(([, v]) => typeof v === "function")
      .map(([n]) => n)
      .sort();
    expect(names).toEqual([
      "acknowledgeGoalCompletionAction",
      "archiveGoalAction",
      "createGoalAction",
    ]);
  });

  it("writes nothing when unauthenticated", async () => {
    const empty = {
      result: null,
      values: {
        exerciseId: "",
        gymId: "",
        targetWeightLbs: "",
        targetReps: "",
      },
    };
    await expect(
      goalActions.createGoalAction(empty, new FormData()),
    ).rejects.toThrow(/login/);
    await expect(goalActions.archiveGoalAction(ID)).rejects.toThrow(/login/);
    await expect(
      goalActions.acknowledgeGoalCompletionAction(ID),
    ).rejects.toThrow(/login/);
    expect(goals.createGoal).not.toHaveBeenCalled();
    expect(goals.archiveGoal).not.toHaveBeenCalled();
    expect(goals.acknowledgeGoalCompletion).not.toHaveBeenCalled();
  });
});

describe("createGoalAction outcomes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAccount as jest.Mock).mockResolvedValue(TEST_ACCOUNT);
  });

  const form = () => {
    const fd = new FormData();
    fd.set("exerciseId", ID);
    fd.set("targetWeightLbs", "315");
    fd.set("targetReps", "1");
    return fd;
  };
  const prev = {
    result: null,
    values: { exerciseId: "", gymId: "", targetWeightLbs: "", targetReps: "" },
  };

  it("an active goal redirects to its detail with the 'Goal set' flag", async () => {
    (goals.createGoal as jest.Mock).mockResolvedValue({
      id: ID,
      outcome: "active",
    });
    await expect(goalActions.createGoalAction(prev, form())).rejects.toThrow(
      `NEXT_REDIRECT:/goals/${ID}?created=1`,
    );
  });

  it("an already-reached goal redirects to its detail without a toast flag", async () => {
    (goals.createGoal as jest.Mock).mockResolvedValue({
      id: ID,
      outcome: "completed",
    });
    await expect(goalActions.createGoalAction(prev, form())).rejects.toThrow(
      `NEXT_REDIRECT:/goals/${ID}`,
    );
  });

  it("a duplicate returns the conflict and keeps the typed values", async () => {
    (goals.createGoal as jest.Mock).mockRejectedValue(
      new DomainError("conflict", "Bench already has an active goal.", {
        existingGoalId: ID,
      }),
    );
    const state = await goalActions.createGoalAction(prev, form());
    expect(state.result).toMatchObject({
      ok: false,
      error: { code: "conflict", details: { existingGoalId: ID } },
    });
    expect(state.values).toMatchObject({
      targetWeightLbs: "315",
      targetReps: "1",
    });
  });
});

describe("logging actions reconcile goals only after a committed write", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAccount as jest.Mock).mockResolvedValue(TEST_ACCOUNT);
  });

  it("completeWorkoutAction reconciles after success, not after failure", async () => {
    (sessions.completeWorkout as jest.Mock).mockResolvedValueOnce(undefined);
    const ok = await completeWorkoutAction({ loggedSessionId: ID });
    expect(ok.ok).toBe(true);
    expect(reconcile).toHaveBeenCalledTimes(1);
    const order = [
      (sessions.completeWorkout as jest.Mock).mock.invocationCallOrder[0],
      reconcile.mock.invocationCallOrder[0],
    ];
    expect(order[0]).toBeLessThan(order[1]);

    reconcile.mockClear();
    (sessions.completeWorkout as jest.Mock).mockRejectedValueOnce(
      new DomainError("validation_error", "Finish every exercise first."),
    );
    const failed = await completeWorkoutAction({ loggedSessionId: ID });
    expect(failed.ok).toBe(false);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("logSetAction and editLoggedSetAction reconcile after success only", async () => {
    (loggedSets.logSet as jest.Mock).mockResolvedValueOnce({ id: "s1" });
    expect(
      (
        await logSetAction({
          loggedExerciseId: ID,
          setNumber: 1,
          weightLbs: 185,
          reps: 8,
        })
      ).ok,
    ).toBe(true);
    (loggedSets.editLoggedSet as jest.Mock).mockResolvedValueOnce(undefined);
    expect(
      (await editLoggedSetAction({ loggedSetId: ID, weightLbs: 185, reps: 8 }))
        .ok,
    ).toBe(true);
    expect(reconcile).toHaveBeenCalledTimes(2);

    reconcile.mockClear();
    (loggedSets.logSet as jest.Mock).mockRejectedValueOnce(
      new Error("db down"),
    );
    expect(
      (
        await logSetAction({
          loggedExerciseId: ID,
          setNumber: 1,
          weightLbs: 185,
          reps: 8,
        })
      ).ok,
    ).toBe(false);
    expect(reconcile).not.toHaveBeenCalled();
  });
});
