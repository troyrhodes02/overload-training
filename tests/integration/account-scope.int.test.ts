import { randomUUID } from "node:crypto";
import { getTestPrisma } from "./support/db";
import { createTestAccount, unknownId } from "./support/accounts";
import { resolveAccount, inAccountTx, accountToday } from "@/lib/data/account";
import { accountFor } from "@/lib/data/operator";
import { lockMesocycleForUpdate } from "@/lib/data/locks";
import { AccountScopeError } from "@/lib/data/scope";

/**
 * Multi-User Foundation — the account-scoped client end to end against a real
 * Postgres (spec §9, §11). Feature modules are converted in later tickets;
 * this proves the substrate they will stand on.
 */
const raw = () => getTestPrisma();

async function libraryExercise(name = "Barbell Bench Press") {
  return raw().exercise.create({
    data: {
      name,
      primaryMuscle: "chest",
      equipmentType: "barbell",
      isCustom: false,
      sourceId: randomUUID(),
    },
  });
}

describe("account-scoped client", () => {
  it("stamps creates with the acting account and hides them from others", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const gym = await a.db.gym.create({ data: { name: "Downtown" } });
    expect(gym.userId).toBe(a.userId);

    expect(await b.db.gym.findMany()).toEqual([]);
    expect(await b.db.gym.count()).toBe(0);
    expect(await b.db.gym.findUnique({ where: { id: gym.id } })).toBeNull();
    expect(await b.db.gym.findFirst({ where: { id: gym.id } })).toBeNull();
    expect((await a.db.gym.findUnique({ where: { id: gym.id } }))?.id).toBe(
      gym.id,
    );
  });

  it("a foreign row is indistinguishable from a nonexistent one on writes", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const gym = await a.db.gym.create({ data: { name: "Downtown" } });

    const foreign = await b.db.gym
      .update({ where: { id: gym.id }, data: { name: "x" } })
      .catch((e: { code?: string }) => e.code);
    const missing = await b.db.gym
      .update({ where: { id: unknownId() }, data: { name: "x" } })
      .catch((e: { code?: string }) => e.code);
    expect(foreign).toBe("P2025");
    expect(missing).toBe(foreign);

    expect(
      (
        await b.db.gym.updateMany({
          where: { id: gym.id },
          data: { name: "x" },
        })
      ).count,
    ).toBe(0);
    expect((await b.db.gym.deleteMany({ where: { id: gym.id } })).count).toBe(
      0,
    );
    expect(
      (await raw().gym.findUniqueOrThrow({ where: { id: gym.id } })).name,
    ).toBe("Downtown");
  });

  it("interactive transactions keep the scope", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    await a.db.gym.create({ data: { name: "A gym" } });
    expect(await b.db.$transaction((tx) => tx.gym.findMany())).toEqual([]);
    expect(await inAccountTx(a, undefined, (tx) => tx.gym.count())).toBe(1);
    const created = await inAccountTx(b, undefined, (tx) =>
      tx.gym.create({ data: { name: "B gym" } }),
    );
    expect(created.userId).toBe(b.userId);
  });

  it("refuses to attribute a write to another account", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    await expect(
      b.db.gym.create({ data: { name: "spoof", userId: a.userId } }),
    ).rejects.toBeInstanceOf(AccountScopeError);
    const g = await b.db.gym.create({ data: { name: "mine" } });
    await expect(
      b.db.gym.update({ where: { id: g.id }, data: { userId: a.userId } }),
    ).rejects.toBeInstanceOf(AccountScopeError);
    expect(await raw().gym.count({ where: { userId: a.userId } })).toBe(0);
  });

  it("refuses nested relation writes", async () => {
    const a = await createTestAccount();
    await expect(
      a.db.mesocycle.create({
        data: {
          name: "Block",
          lengthWeeks: 5,
          deloadEveryWeeks: 5,
          splitType: "custom",
          sessions: { create: [{ name: "Push" }] },
        },
      }),
    ).rejects.toBeInstanceOf(AccountScopeError);
    expect(await raw().mesocycle.count()).toBe(0);
  });
});

describe("Exercise: the shared library and private custom exercises", () => {
  it("every account reads the library; custom exercises are private", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const lib = await libraryExercise();
    const custom = await a.db.exercise.create({
      data: {
        name: "Landmine Press",
        primaryMuscle: "shoulders",
        equipmentType: "other",
        isCustom: true,
      },
    });
    expect(custom.userId).toBe(a.userId);

    expect((await a.db.exercise.findMany()).map((e) => e.id).sort()).toEqual(
      [lib.id, custom.id].sort(),
    );
    expect((await b.db.exercise.findMany()).map((e) => e.id)).toEqual([lib.id]);
    expect(
      await b.db.exercise.findUnique({ where: { id: custom.id } }),
    ).toBeNull();
  });

  it("no account can change or archive a library exercise", async () => {
    const a = await createTestAccount();
    const lib = await libraryExercise();
    const { count } = await a.db.exercise.updateMany({
      where: { id: lib.id },
      data: { deletedAt: new Date(), name: "Hijacked" },
    });
    expect(count).toBe(0);
    const after = await raw().exercise.findUniqueOrThrow({
      where: { id: lib.id },
    });
    expect(after.deletedAt).toBeNull();
    expect(after.name).toBe("Barbell Bench Press");
  });

  it("refuses to traverse from an exercise into owned rows", async () => {
    const a = await createTestAccount();
    await libraryExercise();
    await expect(
      a.db.exercise.findMany({ include: { goals: true } }),
    ).rejects.toBeInstanceOf(AccountScopeError);
  });

  it("favorites are per account", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const lib = await libraryExercise();
    await a.db.exerciseFavorite.create({
      data: { exerciseId: lib.id, userId: a.userId },
    });
    expect(await a.db.exerciseFavorite.count()).toBe(1);
    expect(await b.db.exerciseFavorite.count()).toBe(0);
    await b.db.exerciseFavorite.create({
      data: { exerciseId: lib.id, userId: b.userId },
    });
    expect(await raw().exerciseFavorite.count()).toBe(2);
    expect(
      (
        await b.db.exerciseFavorite.deleteMany({
          where: { exerciseId: lib.id },
        })
      ).count,
    ).toBe(1);
    expect(await a.db.exerciseFavorite.count()).toBe(1);
  });
});

describe("profiles and the acting account", () => {
  it("resolveAccount creates a UTC profile the first time an account is used", async () => {
    const userId = randomUUID();
    const account = await resolveAccount(userId);
    expect(account.timeZone).toBe("UTC");
    expect(
      await raw().profile.findUniqueOrThrow({ where: { userId } }),
    ).toMatchObject({
      userId,
      timeZone: "UTC",
      firstName: null,
      lastName: null,
    });
    // Idempotent: a second resolution reuses the profile.
    await resolveAccount(userId);
    expect(await raw().profile.count({ where: { userId } })).toBe(1);
  });

  it("resolveAccount keeps an existing profile's timezone", async () => {
    const userId = randomUUID();
    await raw().profile.create({
      data: { userId, timeZone: "America/Chicago" },
    });
    expect((await resolveAccount(userId)).timeZone).toBe("America/Chicago");
  });

  it("accountFor refuses an account with no profile (operators never create accounts implicitly)", async () => {
    await expect(accountFor(randomUUID())).rejects.toThrow(/no profile/);
  });

  it("an account sees only its own profile", async () => {
    const a = await createTestAccount("America/Chicago");
    const b = await createTestAccount("Europe/Berlin");
    expect((await a.db.profile.findMany()).map((p) => p.userId)).toEqual([
      a.userId,
    ]);
    expect(
      await b.db.profile.findUnique({ where: { userId: a.userId } }),
    ).toBeNull();
  });

  it("accountToday uses the account's stored zone", async () => {
    const a = await createTestAccount("Pacific/Kiritimati");
    const b = await createTestAccount("Pacific/Pago_Pago");
    // UTC+14 and UTC-11 are never on the same calendar day.
    expect(accountToday(a)).not.toBe(accountToday(b));
  });
});

describe("scoped row lock", () => {
  it("locks the acting account's mesocycle and never another's", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const meso = await a.db.mesocycle.create({
      data: {
        name: "Block",
        lengthWeeks: 5,
        deloadEveryWeeks: 5,
        splitType: "custom",
      },
    });
    expect(
      await a.db.$transaction((tx) => lockMesocycleForUpdate(a, tx, meso.id)),
    ).toEqual({ id: meso.id, status: "draft" });
    expect(
      await b.db.$transaction((tx) => lockMesocycleForUpdate(b, tx, meso.id)),
    ).toBeNull();
    expect(
      await b.db.$transaction((tx) => lockMesocycleForUpdate(b, tx, "nope")),
    ).toBeNull();
  });
});
