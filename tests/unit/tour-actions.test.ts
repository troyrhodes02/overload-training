jest.mock("@/lib/data/account", () => ({ requireAccount: jest.fn() }));

import fs from "node:fs";
import path from "node:path";
import { requireAccount } from "@/lib/data/account";
import {
  markTourOfferedAction,
  recordTourOutcomeAction,
} from "@/app/(app)/tour-actions";
import { isTourOutcome } from "@/lib/tour/progress";

/**
 * Onboarding Tour server actions (spec §11, §12; R21). The acting account
 * comes from the auth session; the only client input is the outcome literal.
 */

const updateMany = jest.fn();
const upsert = jest.fn();
const account = {
  userId: "acting-user",
  timeZone: "UTC",
  db: { tourProgress: { updateMany, upsert } },
};

beforeEach(() => {
  jest.clearAllMocks();
  (requireAccount as jest.Mock).mockResolvedValue(account);
  updateMany.mockResolvedValue({ count: 1 });
  upsert.mockResolvedValue({});
});

it("isTourOutcome accepts exactly completed and skipped", () => {
  expect(isTourOutcome("completed")).toBe(true);
  expect(isTourOutcome("skipped")).toBe(true);
  for (const v of ["finished", "Completed", "", null, undefined, 0, {}]) {
    expect([v, isTourOutcome(v)]).toEqual([v, false]);
  }
});

it("markTourOfferedAction spends only the acting account's due offer", async () => {
  expect(await markTourOfferedAction()).toEqual({
    ok: true,
    data: { spent: true },
  });
  expect(requireAccount).toHaveBeenCalledTimes(1);
  expect(updateMany).toHaveBeenCalledWith({
    where: { userId: "acting-user", offeredAt: null },
    data: { offeredAt: expect.any(Date) },
  });
  updateMany.mockResolvedValueOnce({ count: 0 });
  expect(await markTourOfferedAction()).toEqual({
    ok: true,
    data: { spent: false },
  });
});

it("recordTourOutcomeAction upserts the acting account's row only", async () => {
  const result = await recordTourOutcomeAction("skipped");
  expect(result).toEqual({ ok: true, data: { outcome: "skipped" } });
  expect(upsert).toHaveBeenCalledWith({
    where: { userId: "acting-user" },
    create: {
      userId: "acting-user",
      offeredAt: expect.any(Date),
      outcome: "skipped",
      outcomeAt: expect.any(Date),
    },
    update: { outcome: "skipped", outcomeAt: expect.any(Date) },
  });
});

it("ignores anything a client adds besides the outcome (no account id input)", async () => {
  const call = recordTourOutcomeAction as unknown as (
    ...args: unknown[]
  ) => ReturnType<typeof recordTourOutcomeAction>;
  await call("completed", { userId: "someone-else" });
  expect(upsert).toHaveBeenCalledWith(
    expect.objectContaining({ where: { userId: "acting-user" } }),
  );
});

it.each([["finished"], [""], [null], [{ outcome: "skipped" }]])(
  "rejects %p without writing",
  async (v) => {
    expect(await recordTourOutcomeAction(v)).toEqual({
      ok: false,
      error: { code: "validation_error", message: "Unknown tour outcome." },
    });
    expect(upsert).not.toHaveBeenCalled();
  },
);

it("an unexpected failure returns the plain message, never internals", async () => {
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  upsert.mockRejectedValueOnce(new Error("connection refused at 10.0.0.1"));
  updateMany.mockRejectedValueOnce(new Error("db down"));
  const failed = await recordTourOutcomeAction("completed");
  const offered = await markTourOfferedAction();
  spy.mockRestore();
  for (const r of [failed, offered]) {
    expect(r).toEqual({
      ok: false,
      error: {
        code: "internal_error",
        message: "Couldn't save your tour progress.",
      },
    });
  }
});

it("both actions resolve the account from the auth session before anything else", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src/app/(app)/tour-actions.ts"),
    "utf8",
  );
  expect(src).toMatch(/^"use server";/);
  const bodies = src.split(/export async function /).slice(1);
  expect(bodies).toHaveLength(2);
  for (const body of bodies) {
    // No id-shaped parameter, and requireAccount() is the first statement.
    expect(body.split("{")[0]).not.toMatch(/userId|accountId|\bid\b/i);
    expect(body).toMatch(/\{\s*const account = await requireAccount\(\);/);
  }
});
