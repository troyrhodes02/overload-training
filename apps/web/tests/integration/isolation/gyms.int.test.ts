import { randomUUID } from "node:crypto";
import type { Account } from "@/lib/data/account";
import { archiveGym, createGym, restoreGym } from "@/lib/gyms/gyms";
import { listActiveGyms } from "@/lib/gyms/queries";
import { getGoalFormContext } from "@/lib/goals/queries";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";
import { expectForeignLikeMissing, snapshotAccount } from "./support";

/**
 * Cross-account isolation — gyms. A gym (and its free-text address, personal
 * location data) is private to its account.
 */

let a: Account;
let b: Account;
let gym: { id: string };

beforeEach(async () => {
  a = await createTestAccount();
  b = await createTestAccount();
  gym = await createGym(a, { name: "Downtown Gym", address: "Near the river" });
});

it("a second account's gym list never includes another account's gyms", async () => {
  expect(await listActiveGyms(b)).toEqual([]);
  expect((await listActiveGyms(a)).map((g) => g.id)).toEqual([gym.id]);
});

it("archive/restore with another account's gym id behave like a missing id and change nothing", async () => {
  const before = await snapshotAccount(a.userId);
  for (const call of [
    (id: string) => archiveGym(b, { gymId: id }),
    (id: string) => restoreGym(b, { gymId: id }),
  ]) {
    expect(await expectForeignLikeMissing(gym.id, call)).toMatchObject({
      ok: false,
      code: "not_found",
    });
  }
  expect(await snapshotAccount(a.userId)).toEqual(before);
});

it("gym pickers elsewhere (goal form) never offer another account's gyms", async () => {
  const machine = await getTestPrisma().exercise.create({
    data: {
      name: "Chest Press Machine",
      primaryMuscle: "chest",
      equipmentType: "machine",
      isCustom: false,
      sourceId: randomUUID(),
    },
  });
  expect(await getGoalFormContext(b, machine.id)).toMatchObject({
    kind: "no_gyms",
  });
  expect(await getGoalFormContext(a, machine.id)).toMatchObject({
    kind: "ok",
    defaultGymId: gym.id,
  });
});

it("a gym a second account creates is its own", async () => {
  const mine = await createGym(b, { name: "Downtown Gym" });
  expect(mine.userId).toBe(b.userId);
  expect(await listActiveGyms(a)).toHaveLength(1);
});
