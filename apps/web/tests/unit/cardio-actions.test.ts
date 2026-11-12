/**
 * Cardio Logging server actions (OVE-34; spec §11, R25, R34, R71).
 *
 *  - Each re-checks the auth session FIRST and writes nothing for an
 *    unauthenticated caller.
 *  - Cardio is a record only: no cardio action reconciles goals (or touches
 *    progression or baselines), even after a successful write.
 */
jest.mock("@/lib/goals/goals", () => ({
  reconcileGoalCompletionsSafely: jest.fn(async () => []),
}));
jest.mock("@/lib/cardio/cardio-logs", () => ({
  logCardio: jest.fn(),
  editCardioLog: jest.fn(),
}));
jest.mock("@/lib/logging/sessions", () => ({}));
jest.mock("@/lib/logging/logged-sets", () => ({}));
jest.mock("@/lib/logging/missed-days", () => ({}));
jest.mock("@/lib/data/account", () => ({ requireAccount: jest.fn() }));
jest.mock("next/cache", () => ({ refresh: jest.fn() }));

import { requireAccount } from "@/lib/data/account";
import { refresh } from "next/cache";
import * as goals from "@/lib/goals/goals";
import * as cardio from "@/lib/cardio/cardio-logs";
import { DomainError } from "@/lib/actions/result";
import { logCardioAction } from "@/app/(app)/log/actions";
import { editCardioLogAction } from "@/app/(app)/history/actions";

/** The acting account the mocked requireAccount() resolves (Multi-User Foundation). */
const TEST_ACCOUNT = { userId: "a0000000-0000-4000-8000-000000000001" };

const ID = "3f2c1d1e-8a7b-4c6d-9e0f-112233445566";
const logInput = {
  mesocycleId: ID,
  scheduledFor: "2026-10-13",
  type: "Incline Walk",
  durationMin: "23",
};
const editInput = { cardioLogId: ID, type: "Bike", durationMin: "25" };

describe("cardio actions re-check auth before doing anything", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAccount as jest.Mock).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT:/login");
    });
  });

  it.each([
    ["logCardioAction", () => logCardioAction(logInput)],
    ["editCardioLogAction", () => editCardioLogAction(editInput)],
  ])("%s redirects and writes nothing", async (_n, call) => {
    await expect(call()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(cardio.logCardio).not.toHaveBeenCalled();
    expect(cardio.editCardioLog).not.toHaveBeenCalled();
  });
});

describe("cardio actions never reach goals", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAccount as jest.Mock).mockResolvedValue(TEST_ACCOUNT);
  });

  it("logs, passes the idempotency flag through, refreshes, and reconciles nothing", async () => {
    (cardio.logCardio as jest.Mock).mockResolvedValue({
      cardioLogId: ID,
      alreadyLogged: true,
    });
    const res = await logCardioAction(logInput);
    expect(res).toEqual({
      ok: true,
      data: { cardioLogId: ID, alreadyLogged: true },
    });
    expect(cardio.logCardio).toHaveBeenCalledWith(TEST_ACCOUNT, logInput);
    expect(refresh).toHaveBeenCalled();
    expect(goals.reconcileGoalCompletionsSafely).not.toHaveBeenCalled();
  });

  it("corrects and reconciles nothing", async () => {
    (cardio.editCardioLog as jest.Mock).mockResolvedValue({ id: ID });
    expect(await editCardioLogAction(editInput)).toEqual({
      ok: true,
      data: { id: ID },
    });
    expect(goals.reconcileGoalCompletionsSafely).not.toHaveBeenCalled();
  });

  it("returns field errors without refreshing", async () => {
    (cardio.logCardio as jest.Mock).mockRejectedValue(
      new DomainError("validation_error", "Check the highlighted fields.", {
        durationMin: "Enter whole minutes, 1 or more.",
      }),
    );
    const res = await logCardioAction({ ...logInput, durationMin: "0" });
    expect(res).toEqual({
      ok: false,
      error: {
        code: "validation_error",
        message: "Check the highlighted fields.",
        details: { durationMin: "Enter whole minutes, 1 or more." },
      },
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
