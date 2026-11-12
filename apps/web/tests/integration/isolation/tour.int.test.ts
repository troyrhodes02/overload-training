import { randomUUID } from "node:crypto";
import { establishProfile, type Account } from "@/lib/data/account";
import { accountFor } from "@/lib/data/operator";
import { AccountScopeError } from "@/lib/data/scope";
import { getTestPrisma } from "../support/db";
import {
  getTourAutoStart,
  markTourOffered,
  recordTourOutcome,
} from "@/lib/tour/progress";

/**
 * Cross-account isolation — TourProgress (Onboarding Tour, spec §9, §14.2).
 * One account's tour state can't be read, changed, or detected by another: a
 * finished tour for A never stops B's first tour, and nothing B does moves
 * A's row.
 */

let a: Account;
let b: Account;

const rowOf = (userId: string) =>
  getTestPrisma().$queryRawUnsafe(
    `SELECT to_jsonb(t) AS row FROM "tour_progress" t WHERE t.user_id = $1::uuid`,
    userId,
  );

/** A brand-new account (due its tour), through the real signup profile write. */
async function newAccount(): Promise<Account> {
  const id = randomUUID();
  await establishProfile(
    { id },
    {
      firstName: "Alex",
      lastName: "Kim",
      username: `a_${id.slice(0, 8)}`,
      timeZone: "UTC",
    },
  );
  return accountFor(id);
}

beforeEach(async () => {
  a = await newAccount();
  b = await newAccount();
  await markTourOffered(a);
  await recordTourOutcome(a, "completed");
});

it("A's finished tour does not stop B's first tour", async () => {
  expect(await getTourAutoStart(a)).toBe(false);
  expect(await getTourAutoStart(b)).toBe(true);
});

it("B's offer and outcome touch only B's row", async () => {
  const aBefore = await rowOf(a.userId);
  expect(await markTourOffered(b)).toEqual({ spent: true });
  await recordTourOutcome(b, "skipped");
  expect(await rowOf(a.userId)).toEqual(aBefore);
  const all = await getTestPrisma().tourProgress.findMany();
  expect(all).toHaveLength(2);
  expect(all.find((r) => r.userId === a.userId)?.outcome).toBe("completed");
  expect(all.find((r) => r.userId === b.userId)?.outcome).toBe("skipped");
});

it("B's scoped client can't read, count, change, or delete A's row", async () => {
  const aBefore = await rowOf(a.userId);
  expect(
    await b.db.tourProgress.findUnique({ where: { userId: a.userId } }),
  ).toBeNull();
  // B sees exactly its own row, never A's.
  expect((await b.db.tourProgress.findMany()).map((r) => r.userId)).toEqual([
    b.userId,
  ]);
  expect(await b.db.tourProgress.count()).toBe(1);
  expect(await b.db.tourProgress.count({ where: { userId: a.userId } })).toBe(
    0,
  );
  const updated = await b.db.tourProgress.updateMany({
    where: { userId: a.userId },
    data: { outcome: "skipped", outcomeAt: new Date() },
  });
  expect(updated.count).toBe(0);
  const deleted = await b.db.tourProgress.deleteMany({
    where: { userId: a.userId },
  });
  expect(deleted.count).toBe(0);
  expect(await rowOf(a.userId)).toEqual(aBefore);
});

it("B can't create a row for A, and an upsert naming A never reaches A's row", async () => {
  await expect(
    b.db.tourProgress.create({ data: { userId: a.userId } }),
  ).rejects.toBeInstanceOf(AccountScopeError);
  const aBefore = await rowOf(a.userId);
  // The scoped upsert intersects A's key with B's ownership: it can never
  // update A's row (it may only try to create one stamped as B).
  await b.db.tourProgress
    .upsert({
      where: { userId: a.userId },
      create: { userId: b.userId, outcome: "skipped", outcomeAt: new Date() },
      update: { outcome: "skipped", outcomeAt: new Date() },
    })
    .catch(() => undefined);
  expect(await rowOf(a.userId)).toEqual(aBefore);
});
