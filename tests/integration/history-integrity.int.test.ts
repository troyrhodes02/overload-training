import { getTestPrisma } from "./support/db";

/**
 * Logged-history integrity (schema layer). CLAUDE.md Layer 2: foreign keys from
 * the logged chain use onDelete: Restrict, so a hard delete of a referenced row
 * fails loudly rather than cascading history away.
 */
describe("logged-history referential integrity", () => {
  async function seedLoggedChain() {
    const prisma = getTestPrisma();
    const exercise = await prisma.exercise.create({
      data: {
        name: "Chest Press Machine",
        muscleGroup: "chest",
        equipmentType: "machine",
      },
    });
    const gym = await prisma.gym.create({
      data: { name: "Downtown Gym", address: "Downtown, near the river" },
    });
    const loggedSession = await prisma.loggedSession.create({
      data: { performedOn: new Date() },
    });
    const loggedExercise = await prisma.loggedExercise.create({
      data: {
        loggedSessionId: loggedSession.id,
        exerciseId: exercise.id,
        gymId: gym.id,
        position: 0,
      },
    });
    return { exercise, gym, loggedExercise };
  }

  it("rejects a hard delete of an Exercise referenced by logged history", async () => {
    const prisma = getTestPrisma();
    const { exercise } = await seedLoggedChain();

    await expect(
      prisma.exercise.delete({ where: { id: exercise.id } }),
    ).rejects.toThrow();

    // History row is untouched.
    expect(await prisma.exercise.count()).toBe(1);
    expect(await prisma.loggedExercise.count()).toBe(1);
  });

  it("rejects a hard delete of a Gym referenced by logged history", async () => {
    const prisma = getTestPrisma();
    const { gym } = await seedLoggedChain();

    await expect(
      prisma.gym.delete({ where: { id: gym.id } }),
    ).rejects.toThrow();

    expect(await prisma.gym.count()).toBe(1);
    expect(await prisma.loggedExercise.count()).toBe(1);
  });

  it("rejects a hard delete of a LoggedExercise's parent LoggedSession (Restrict down the chain)", async () => {
    const prisma = getTestPrisma();
    const { loggedExercise } = await seedLoggedChain();

    await expect(
      prisma.loggedSession.delete({
        where: { id: loggedExercise.loggedSessionId },
      }),
    ).rejects.toThrow();
  });
});
