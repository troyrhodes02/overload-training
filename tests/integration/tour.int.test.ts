import { randomUUID } from "node:crypto";
import { establishProfile } from "@/lib/data/account";
import { accountFor } from "@/lib/data/operator";
import type { Account } from "@/lib/data/account";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";
import { snapshotAccount } from "./isolation/support";
import {
  getTourAutoStart,
  markTourOffered,
  recordTourOutcome,
} from "@/lib/tour/progress";
import { DomainError } from "@/lib/actions/result";

/**
 * Onboarding Tour — per-account tour progress (spec §6, §14.2; R5–R8). A new
 * account is made due at signup; the tour opens by itself only while due, and
 * nothing afterwards — finish, skip, abandon, replay — brings it back. An
 * account that predates the tour has no row and is never toured by itself.
 */

const raw = () => getTestPrisma();

async function row(userId: string) {
  return raw().tourProgress.findUnique({ where: { userId } });
}

/** A brand-new account, through the real signup profile write. */
async function newAccount(): Promise<Account> {
  const id = randomUUID();
  await establishProfile(
    { id },
    {
      firstName: "Robin",
      lastName: "Lee",
      username: `r_${id.slice(0, 8)}`,
      timeZone: "America/Chicago",
    },
  );
  return accountFor(id);
}

it("a new account is due its first tour", async () => {
  const a = await newAccount();
  expect(await row(a.userId)).toEqual(
    expect.objectContaining({
      offeredAt: null,
      outcome: null,
      outcomeAt: null,
    }),
  );
  expect(await getTourAutoStart(a)).toBe(true);
});

it("an account that predates the tour (no row) is never due", async () => {
  const old = await createTestAccount();
  expect(await row(old.userId)).toBeNull();
  expect(await getTourAutoStart(old)).toBe(false);
  // Spending an offer it never had does nothing.
  expect(await markTourOffered(old)).toEqual({ spent: false });
  expect(await row(old.userId)).toBeNull();
});

it("the offer is spent when the tour first appears, once (abandoning keeps it spent)", async () => {
  const a = await newAccount();
  expect(await markTourOffered(a)).toEqual({ spent: true });
  const offered = await row(a.userId);
  expect(offered?.offeredAt).toEqual(expect.any(Date));
  expect(offered?.outcome).toBeNull();
  expect(await getTourAutoStart(a)).toBe(false);
  expect(await markTourOffered(a)).toEqual({ spent: false });
  expect((await row(a.userId))?.offeredAt).toEqual(offered?.offeredAt);
});

it("skip, then a finished replay: the latest outcome wins and auto-start never returns", async () => {
  const a = await newAccount();
  await markTourOffered(a);
  expect(await recordTourOutcome(a, "skipped")).toBe("skipped");
  const skipped = await row(a.userId);
  expect(skipped).toEqual(
    expect.objectContaining({
      outcome: "skipped",
      outcomeAt: expect.any(Date),
    }),
  );
  expect(await getTourAutoStart(a)).toBe(false);

  await new Promise((r) => setTimeout(r, 5));
  await recordTourOutcome(a, "completed");
  const done = await row(a.userId);
  expect(done?.outcome).toBe("completed");
  expect(done!.outcomeAt!.getTime()).toBeGreaterThan(
    skipped!.outcomeAt!.getTime(),
  );
  expect(done!.offeredAt).toEqual(skipped!.offeredAt);
  expect(await getTourAutoStart(a)).toBe(false);
});

it("an outcome without a saved offer still ends auto-start", async () => {
  const a = await newAccount();
  await recordTourOutcome(a, "completed");
  expect((await row(a.userId))?.outcome).toBe("completed");
  expect(await getTourAutoStart(a)).toBe(false);
});

it("a replay by an account that predates the tour creates its row and stays not-due", async () => {
  const old = await createTestAccount();
  await recordTourOutcome(old, "skipped");
  expect(await row(old.userId)).toEqual(
    expect.objectContaining({
      offeredAt: expect.any(Date),
      outcome: "skipped",
    }),
  );
  expect(await getTourAutoStart(old)).toBe(false);
});

it("refuses an unknown outcome and writes nothing", async () => {
  const a = await newAccount();
  const before = await row(a.userId);
  for (const bad of [
    "finished",
    "",
    null,
    undefined,
    1,
    { outcome: "skipped" },
  ]) {
    await expect(recordTourOutcome(a, bad)).rejects.toBeInstanceOf(DomainError);
  }
  expect(await row(a.userId)).toEqual(before);
});

it("the database keeps an outcome and its time together", async () => {
  const a = await newAccount();
  for (const set of [`"outcome" = 'skipped'`, `"outcome_at" = now()`]) {
    await expect(
      raw().$executeRawUnsafe(
        `UPDATE "tour_progress" SET ${set} WHERE "user_id" = $1::uuid`,
        a.userId,
      ),
    ).rejects.toThrow(/tour_progress_outcome_at_check/);
  }
});

it("ownership is immutable and the profile can't be hard-deleted under the row", async () => {
  const a = await newAccount();
  const b = await createTestAccount();
  await expect(
    raw().$executeRawUnsafe(
      `UPDATE "tour_progress" SET "user_id" = $1::uuid WHERE "user_id" = $2::uuid`,
      b.userId,
      a.userId,
    ),
  ).rejects.toThrow(/never changes/);
  await expect(
    raw().$executeRawUnsafe(
      `DELETE FROM "profiles" WHERE "user_id" = $1::uuid`,
      a.userId,
    ),
  ).rejects.toThrow();
  expect(await row(a.userId)).not.toBeNull();
});

it("establishing a profile twice (a lazy profile raced in) leaves one due row", async () => {
  const id = randomUUID();
  await raw().profile.create({ data: { userId: id, timeZone: "UTC" } });
  await establishProfile(
    { id },
    {
      firstName: "Sam",
      lastName: "Park",
      username: `s_${id.slice(0, 8)}`,
      timeZone: "UTC",
    },
  );
  expect(await raw().tourProgress.count({ where: { userId: id } })).toBe(1);
  expect(await getTourAutoStart(await accountFor(id))).toBe(true);
});

it("tour operations never touch training data", async () => {
  const a = await newAccount();
  const before = await snapshotAccount(a.userId);
  await getTourAutoStart(a);
  await markTourOffered(a);
  await recordTourOutcome(a, "skipped");
  await recordTourOutcome(a, "completed");
  const after = await snapshotAccount(a.userId);
  for (const table of Object.keys(before).filter(
    (t) => t !== "tour_progress" && t !== "profiles",
  )) {
    expect([table, after[table]]).toEqual([table, before[table]]);
  }
  expect(after.profiles).toEqual(before.profiles);
  expect(after.tour_progress).toHaveLength(1);
});
