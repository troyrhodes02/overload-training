import { randomUUID } from "node:crypto";
import type { Account } from "@/lib/data/account";
import {
  archiveExercise,
  createCustomExercise,
  restoreExercise,
  setExerciseFavorite,
} from "@/lib/exercises/exercises";
import { getExercise, listExercises } from "@/lib/exercises/queries";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";
import { expectForeignLikeMissing, snapshotAccount } from "./support";

/**
 * Cross-account isolation — the exercise library (Exercise, ExerciseFavorite).
 * The library is shared and read-only; custom exercises and favorites are
 * private to the account that made them (spec R5, R12, R13).
 */

let a: Account;
let b: Account;
let bench: { id: string };
let custom: { id: string };

const names = (list: { items: { name: string }[] }) =>
  list.items.map((i) => i.name);

beforeEach(async () => {
  a = await createTestAccount();
  b = await createTestAccount();
  bench = await getTestPrisma().exercise.create({
    data: {
      name: "Barbell Bench Press",
      primaryMuscle: "chest",
      equipmentType: "barbell",
      isCustom: false,
      sourceId: randomUUID(),
    },
  });
  custom = await createCustomExercise(a, {
    name: "Secret Landmine Press",
    primaryMuscle: "chest",
    equipmentType: "other",
  });
  await setExerciseFavorite(a, { exerciseId: bench.id, isFavorite: true });
  await setExerciseFavorite(a, { exerciseId: custom.id, isFavorite: true });
});

describe("library reads", () => {
  it("a second account sees the shared library but never another account's custom exercises", async () => {
    expect(names(await listExercises(b))).toEqual(["Barbell Bench Press"]);
    expect(names(await listExercises(b, { search: "landmine" }))).toEqual([]);
    expect(names(await listExercises(b, { muscle: "chest" }))).toEqual([
      "Barbell Bench Press",
    ]);
    expect((await listExercises(b)).total).toBe(1);
    expect(names(await listExercises(a))).toEqual([
      "Barbell Bench Press",
      "Secret Landmine Press",
    ]);
  });

  it("another account's custom exercise by id is not found", async () => {
    expect(
      await expectForeignLikeMissing(custom.id, (id) => getExercise(b, id)),
    ).toEqual({ ok: true, value: null });
  });

  it("favorites are private: another account's stars are invisible", async () => {
    const list = await listExercises(b);
    expect(list.items[0].isFavorite).toBe(false);
    expect(list.hasAnyFavorites).toBe(false);
    expect(names(await listExercises(b, { view: "favorites" }))).toEqual([]);
    expect((await getExercise(b, bench.id))?.isFavorite).toBe(false);
    expect((await getExercise(a, bench.id))?.isFavorite).toBe(true);
  });
});

describe("library writes", () => {
  it("writes naming another account's custom exercise behave like a missing id and change nothing", async () => {
    const before = await snapshotAccount(a.userId);
    for (const call of [
      (id: string) =>
        setExerciseFavorite(b, { exerciseId: id, isFavorite: true }),
      (id: string) =>
        setExerciseFavorite(b, { exerciseId: id, isFavorite: false }),
      (id: string) => archiveExercise(b, { exerciseId: id }),
      (id: string) => restoreExercise(b, { exerciseId: id }),
    ]) {
      expect(await expectForeignLikeMissing(custom.id, call)).toMatchObject({
        ok: false,
        code: "not_found",
      });
    }
    expect(await snapshotAccount(a.userId)).toEqual(before);
  });

  it("starring and un-starring the shared library never touches another account's favorites", async () => {
    await setExerciseFavorite(b, { exerciseId: bench.id, isFavorite: true });
    await setExerciseFavorite(b, { exerciseId: bench.id, isFavorite: false });
    expect((await getExercise(a, bench.id))?.isFavorite).toBe(true);
    expect(
      await getTestPrisma().exerciseFavorite.count({
        where: { exerciseId: bench.id },
      }),
    ).toBe(1);
  });

  it("concurrent stars of the same exercise both succeed and store one favorite", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        setExerciseFavorite(b, { exerciseId: bench.id, isFavorite: true }),
      ),
    );
    expect(results.every((r) => r.isFavorite)).toBe(true);
    expect(
      await getTestPrisma().exerciseFavorite.count({
        where: { userId: b.userId, exerciseId: bench.id },
      }),
    ).toBe(1);
  });

  it("no account can archive or restore a library exercise", async () => {
    for (const acct of [a, b]) {
      await expect(
        archiveExercise(acct, { exerciseId: bench.id }),
      ).rejects.toMatchObject({ code: "not_found" });
      await expect(
        restoreExercise(acct, { exerciseId: bench.id }),
      ).rejects.toMatchObject({ code: "not_found" });
    }
    const row = await getTestPrisma().exercise.findUniqueOrThrow({
      where: { id: bench.id },
    });
    expect(row.deletedAt).toBeNull();
    expect(row.userId).toBeNull();
  });

  it("a custom exercise is owned by its creator", async () => {
    const mine = await createCustomExercise(b, {
      name: "Zercher Hold",
      primaryMuscle: "chest",
      equipmentType: "band",
    });
    expect(mine.userId).toBe(b.userId);
    expect(names(await listExercises(a, { search: "zercher" }))).toEqual([]);
  });
});
