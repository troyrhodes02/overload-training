import { execFileSync } from "node:child_process";
import path from "node:path";
import { getTestPrisma } from "./support/db";
import { assertTestDatabaseUrl } from "./support/assert-test-db";

/**
 * Library & Gyms Setup — the database layer of the exercise classification
 * invariants (spec D3–D7, D20). Application validation is the first layer;
 * these CHECK constraints make a buggy write fail loudly instead of storing a
 * nonsensical classification.
 */
describe("exercise classification constraints", () => {
  const base = {
    name: "Landmine Press",
    primaryMuscle: "shoulders" as const,
    equipmentType: "barbell" as const,
    isCustom: true,
  };

  it("stores one primary muscle, optional secondaries, and canonical equipment", async () => {
    const prisma = getTestPrisma();
    const created = await prisma.exercise.create({
      data: { ...base, secondaryMuscles: ["triceps", "chest"] },
    });
    expect(created.primaryMuscle).toBe("shoulders");
    expect(created.secondaryMuscles).toEqual(["triceps", "chest"]);
    expect(created.equipmentType).toBe("barbell");
    expect(created.isFavorite).toBe(false);

    const noSecondaries = await prisma.exercise.create({ data: base });
    expect(noSecondaries.secondaryMuscles).toEqual([]);
  });

  it("rejects an exercise without a primary muscle (NOT NULL)", async () => {
    const prisma = getTestPrisma();
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO exercises (id, name, equipment_type, is_custom, updated_at)
         VALUES (gen_random_uuid(), 'No Primary', 'barbell', true, now())`,
      ),
    ).rejects.toThrow();
  });

  it("rejects a muscle or equipment value outside the canonical vocabulary", async () => {
    const prisma = getTestPrisma();
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO exercises (id, name, muscle_group, equipment_type, is_custom, updated_at)
         VALUES (gen_random_uuid(), 'Bad', 'lats', 'barbell', true, now())`,
      ),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO exercises (id, name, muscle_group, equipment_type, is_custom, updated_at)
         VALUES (gen_random_uuid(), 'Bad', 'chest', 'smith machine', true, now())`,
      ),
    ).rejects.toThrow();
  });

  it("rejects a primary muscle that also appears as a secondary", async () => {
    const prisma = getTestPrisma();
    await expect(
      prisma.exercise.create({
        data: { ...base, secondaryMuscles: ["triceps", "shoulders"] },
      }),
    ).rejects.toThrow();
    expect(await prisma.exercise.count()).toBe(0);
  });

  it("rejects duplicate secondary muscles", async () => {
    const prisma = getTestPrisma();
    await expect(
      prisma.exercise.create({
        data: { ...base, secondaryMuscles: ["triceps", "triceps"] },
      }),
    ).rejects.toThrow();
    expect(await prisma.exercise.count()).toBe(0);
  });

  it("enforces provenance: custom rows have no source id, imported rows require one", async () => {
    const prisma = getTestPrisma();
    await expect(
      prisma.exercise.create({ data: { ...base, sourceId: "Some_Source" } }),
    ).rejects.toThrow();
    await expect(
      prisma.exercise.create({ data: { ...base, isCustom: false } }),
    ).rejects.toThrow();

    const imported = await prisma.exercise.create({
      data: { ...base, isCustom: false, sourceId: "Landmine_Press" },
    });
    expect(imported.sourceId).toBe("Landmine_Press");
  });

  it("source ids are unique (import identity), names are not", async () => {
    const prisma = getTestPrisma();
    await prisma.exercise.create({
      data: { ...base, isCustom: false, sourceId: "Dup_Source" },
    });
    await expect(
      prisma.exercise.create({
        data: { ...base, isCustom: false, sourceId: "Dup_Source" },
      }),
    ).rejects.toThrow();

    // Same display name is fine (custom/custom and custom/imported).
    await prisma.exercise.create({ data: base });
    await prisma.exercise.create({ data: base });
    expect(await prisma.exercise.count({ where: { name: base.name } })).toBe(3);
  });

  it("custom exercises cannot carry an image", async () => {
    const prisma = getTestPrisma();
    await expect(
      prisma.exercise.create({
        data: { ...base, imageRef: "free-exercise-db/Anything/0.jpg" },
      }),
    ).rejects.toThrow();
  });

  it("rejects blank exercise and gym names", async () => {
    const prisma = getTestPrisma();
    await expect(
      prisma.exercise.create({ data: { ...base, name: "   " } }),
    ).rejects.toThrow();
    await expect(prisma.gym.create({ data: { name: "  " } })).rejects.toThrow();

    // Duplicate gym names are allowed; the address is optional.
    await prisma.gym.create({ data: { name: "Downtown Gym" } });
    await prisma.gym.create({
      data: { name: "Downtown Gym", address: "5th & Main" },
    });
    expect(await prisma.gym.count({ where: { name: "Downtown Gym" } })).toBe(2);
  });
});

describe("migrations match schema.prisma", () => {
  it("has no drift between the applied migrations and the Prisma schema", () => {
    const url = assertTestDatabaseUrl();
    const root = path.resolve(__dirname, "..", "..");
    // --exit-code: 0 = empty diff, 2 = drift. execFileSync throws on non-zero.
    const output = execFileSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      [
        "prisma",
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        path.join("prisma", "schema.prisma"),
        "--script",
        "--exit-code",
      ],
      {
        cwd: root,
        env: { ...process.env, DIRECT_URL: url, DATABASE_URL: url },
        encoding: "utf8",
        shell: process.platform === "win32",
      },
    );
    expect(output).not.toMatch(/ALTER|CREATE|DROP/);
  });
});
