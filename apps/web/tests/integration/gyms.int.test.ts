import { DomainError } from "@/lib/actions/result";
import { archiveGym, createGym, restoreGym } from "@/lib/gyms/gyms";
import { listActiveGyms } from "@/lib/gyms/queries";
import { getTestPrisma } from "./support/db";
import type { Account } from "@/lib/data/account";
import { defaultAccount } from "./support/accounts";

// Multi-User Foundation: these suites act as the default test account.
let account: Account;
beforeEach(async () => {
  account = await defaultAccount();
});

/**
 * Library & Gyms Setup — Gym Management against the throwaway DB. A gym is a
 * name plus optional free text; creating one creates no baseline; archiving
 * hides it from selection but never deletes or detaches history.
 */
describe("gym management", () => {
  it("requires a name; location is optional free text", async () => {
    const prisma = getTestPrisma();
    const err = await createGym(account, { name: "   ", address: "x" }).catch(
      (e: DomainError) => e,
    );
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).details).toHaveProperty("name");
    expect(await prisma.gym.count()).toBe(0);

    const home = await createGym(account, { name: " Home Garage " });
    expect(home).toMatchObject({ name: "Home Garage", address: null });
    const blankAddress = await createGym(account, {
      name: "Campus Rec Center",
      address: "   ",
    });
    expect(blankAddress.address).toBeNull();
    const downtown = await createGym(account, {
      name: "Downtown Gym",
      address: "Downtown, near the river",
    });
    expect(downtown.address).toBe("Downtown, near the river");
  });

  it("allows duplicate gym names (identity is the record)", async () => {
    await createGym(account, {
      name: "Downtown Gym",
      address: "Downtown, near the river",
    });
    await createGym(account, { name: "Downtown Gym", address: "5th & Main" });
    const gyms = await listActiveGyms(account);
    expect(gyms.map((g) => [g.name, g.address])).toEqual([
      ["Downtown Gym", "Downtown, near the river"],
      ["Downtown Gym", "5th & Main"],
    ]);
  });

  it("creating a gym creates no gym/exercise working-weight baseline", async () => {
    const prisma = getTestPrisma();
    await prisma.exercise.create({
      data: {
        name: "Chest Press Machine",
        primaryMuscle: "chest",
        equipmentType: "machine",
        isCustom: true,
        userId: account.userId,
      },
    });
    await createGym(account, { name: "Downtown Gym" });
    await createGym(account, { name: "Campus Rec Center" });
    expect(await prisma.gymExerciseBaseline.count()).toBe(0);
  });

  it("archiving excludes the gym from the active list but keeps the row; Undo restores", async () => {
    const prisma = getTestPrisma();
    const a = await createGym(account, { name: "Campus Rec Center" });
    const b = await createGym(account, { name: "Downtown Gym" });

    await archiveGym(account, { gymId: a.id });
    expect((await listActiveGyms(account)).map((g) => g.id)).toEqual([b.id]);
    const stored = await prisma.gym.findUniqueOrThrow({ where: { id: a.id } });
    expect(stored.deletedAt).not.toBeNull();
    expect(await prisma.gym.count()).toBe(2);

    await archiveGym(account, { gymId: a.id }); // idempotent
    await restoreGym(account, { gymId: a.id });
    expect((await listActiveGyms(account)).map((g) => g.id)).toEqual([
      a.id,
      b.id,
    ]);

    await expect(
      archiveGym(account, { gymId: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("historical references to an archived gym remain readable", async () => {
    const prisma = getTestPrisma();
    const gym = await createGym(account, {
      name: "Downtown Gym",
      address: "Downtown",
    });
    const exercise = await prisma.exercise.create({
      data: {
        name: "Chest Press Machine",
        primaryMuscle: "chest",
        equipmentType: "machine",
        isCustom: true,
        userId: account.userId,
      },
    });
    const loggedSession = await prisma.loggedSession.create({
      data: {
        userId: account.userId,
        performedOn: new Date(),
        scheduledFor: new Date(),
      },
    });
    const loggedExercise = await prisma.loggedExercise.create({
      data: {
        userId: account.userId,
        loggedSessionId: loggedSession.id,
        exerciseId: exercise.id,
        plannedExerciseId: exercise.id,
        gymId: gym.id,
        plannedSets: 3,
        targetRepMin: 6,
        targetRepMax: 8,
      },
    });

    await archiveGym(account, { gymId: gym.id });

    const history = await prisma.loggedExercise.findUniqueOrThrow({
      where: { id: loggedExercise.id },
      include: { gym: true, exercise: true },
    });
    expect(history.gymId).toBe(gym.id);
    expect(history.gym?.name).toBe("Downtown Gym");
    expect(history.gym?.deletedAt).not.toBeNull();
    // The database still refuses a hard delete of the referenced gym.
    await expect(
      prisma.gym.delete({ where: { id: gym.id } }),
    ).rejects.toThrow();
  });
});
