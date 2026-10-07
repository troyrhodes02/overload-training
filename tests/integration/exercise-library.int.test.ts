import type { MuscleGroup, Equipment } from "@prisma/client";
import { DomainError } from "@/lib/actions/result";
import {
  archiveExercise,
  createCustomExercise,
  restoreExercise,
  setExerciseFavorite,
} from "@/lib/exercises/exercises";
import { getExercise, listExercises } from "@/lib/exercises/queries";
import { getTestPrisma } from "./support/db";

/**
 * Library & Gyms Setup — Exercise Library behavior against the throwaway DB:
 * composable scope × primary muscle × name search, Favorites, custom
 * exercises, and archival that never destroys or detaches history.
 */

let seq = 0;
async function imported(
  name: string,
  primaryMuscle: MuscleGroup,
  secondaryMuscles: MuscleGroup[] = [],
  equipmentType: Equipment = "barbell",
) {
  seq += 1;
  return getTestPrisma().exercise.create({
    data: {
      name,
      primaryMuscle,
      secondaryMuscles,
      equipmentType,
      isCustom: false,
      sourceId: `Src_${seq}`,
      imageRef: `free-exercise-db/Src_${seq}/0.jpg`,
    },
  });
}

const names = (r: { items: { name: string }[] }) => r.items.map((i) => i.name);

async function seedLibrary() {
  const bench = await imported("Barbell Bench Press", "chest", [
    "shoulders",
    "triceps",
  ]);
  const incline = await imported(
    "Incline Dumbbell Press",
    "chest",
    ["shoulders"],
    "dumbbell",
  );
  const pulldown = await imported("Lat Pulldown", "back", ["biceps"], "cable");
  const row = await imported("Barbell Row", "back", ["biceps"]);
  const cableRow = await imported(
    "Seated Cable Row",
    "back",
    ["biceps"],
    "cable",
  );
  // Back is SECONDARY here: must never appear under the Back filter.
  const curl = await imported(
    "Hammer Curl",
    "biceps",
    ["back", "forearms"],
    "dumbbell",
  );
  const ohp = await imported("Overhead Press", "shoulders", ["triceps"]);
  const banded = await createCustomExercise({
    name: "Banded Row",
    primaryMuscle: "back",
    equipmentType: "band",
    secondaryMuscles: [],
  });
  return { bench, incline, pulldown, row, cableRow, curl, ohp, banded };
}

describe("exercise library queries compose (scope × primary muscle × search)", () => {
  it("All + Back returns primary-Back exercises only (not secondary-Back)", async () => {
    await seedLibrary();
    const result = await listExercises({ muscle: "back" });
    expect(names(result)).toEqual([
      "Banded Row",
      "Barbell Row",
      "Lat Pulldown",
      "Seated Cable Row",
    ]);
    expect(names(result)).not.toContain("Hammer Curl");
    expect(result.total).toBe(4);
  });

  it('All + Back + "row"', async () => {
    await seedLibrary();
    expect(
      names(await listExercises({ muscle: "back", search: "row" })),
    ).toEqual(["Banded Row", "Barbell Row", "Seated Cable Row"]);
  });

  it('Favorites + Back, Favorites + Chest + "press", Favorites + search', async () => {
    const s = await seedLibrary();
    for (const e of [s.bench, s.row, s.banded, s.ohp, s.curl]) {
      await setExerciseFavorite({ exerciseId: e.id, isFavorite: true });
    }

    expect(
      names(await listExercises({ view: "favorites", muscle: "back" })),
    ).toEqual(["Banded Row", "Barbell Row"]);
    expect(
      names(
        await listExercises({
          view: "favorites",
          muscle: "chest",
          search: "press",
        }),
      ),
    ).toEqual(["Barbell Bench Press"]);
    expect(
      names(await listExercises({ view: "favorites", search: "press" })),
    ).toEqual(["Barbell Bench Press", "Overhead Press"]);
    // Biceps favorite with Back as a secondary never shows under Favorites + Back.
    expect(
      names(await listExercises({ view: "favorites", muscle: "back" })),
    ).not.toContain("Hammer Curl");
  });

  it("search matches every word, in any order, case-insensitively, names only", async () => {
    await seedLibrary();
    expect(names(await listExercises({ search: "PRESS bench" }))).toEqual([
      "Barbell Bench Press",
    ]);
    expect(names(await listExercises({ search: "  barbell   " }))).toEqual([
      "Barbell Bench Press",
      "Barbell Row",
    ]);
    expect((await listExercises({ search: "triceps" })).total).toBe(0); // not a name
  });

  it("treats LIKE wildcards in a search literally", async () => {
    await seedLibrary();
    await imported("100% Effort Sled Push", "quads");
    expect(names(await listExercises({ search: "%" }))).toEqual([
      "100% Effort Sled Push",
    ]);
    expect((await listExercises({ search: "_" })).total).toBe(0);
  });

  it("paginates with a stable name order and reports the full total", async () => {
    await seedLibrary();
    const page = await listExercises({ limit: 3 });
    expect(page.items).toHaveLength(3);
    expect(page.total).toBe(8);
    expect(names(page)).toEqual([
      "Banded Row",
      "Barbell Bench Press",
      "Barbell Row",
    ]);
  });

  it("reports whether any active exercise / favorite exists (empty-state signals)", async () => {
    let r = await listExercises({ view: "favorites" });
    expect(r).toMatchObject({
      hasAnyActive: false,
      hasAnyFavorites: false,
      total: 0,
    });
    const s = await seedLibrary();
    r = await listExercises({ view: "favorites" });
    expect(r).toMatchObject({ hasAnyActive: true, hasAnyFavorites: false });
    await setExerciseFavorite({ exerciseId: s.ohp.id, isFavorite: true });
    r = await listExercises({ view: "favorites", muscle: "chest" });
    expect(r).toMatchObject({ hasAnyFavorites: true, total: 0 });
  });

  it("maps DTOs: labels, Overload Storage image URLs, no image for custom", async () => {
    const s = await seedLibrary();
    const item = (await listExercises({ search: "lat pulldown" })).items[0];
    expect(item).toMatchObject({
      id: s.pulldown.id,
      primaryMuscleLabel: "Back",
      equipmentLabel: "Cable",
      isCustom: false,
    });
    const custom = (await listExercises({ search: "banded" })).items[0];
    expect(custom).toMatchObject({ isCustom: true, imageUrl: null });
  });
});

describe("favorites persist for imported and custom exercises", () => {
  it("favorite and unfavorite persist", async () => {
    const s = await seedLibrary();
    const prisma = getTestPrisma();
    await setExerciseFavorite({ exerciseId: s.pulldown.id, isFavorite: true });
    await setExerciseFavorite({ exerciseId: s.banded.id, isFavorite: true });
    expect(
      (
        await prisma.exercise.findUniqueOrThrow({
          where: { id: s.pulldown.id },
        })
      ).isFavorite,
    ).toBe(true);
    expect(
      (await prisma.exercise.findUniqueOrThrow({ where: { id: s.banded.id } }))
        .isFavorite,
    ).toBe(true);
    expect(names(await listExercises({ view: "favorites" }))).toEqual([
      "Banded Row",
      "Lat Pulldown",
    ]);

    await setExerciseFavorite({ exerciseId: s.pulldown.id, isFavorite: false });
    expect(
      (
        await prisma.exercise.findUniqueOrThrow({
          where: { id: s.pulldown.id },
        })
      ).isFavorite,
    ).toBe(false);
    expect(names(await listExercises({ view: "favorites" }))).toEqual([
      "Banded Row",
    ]);
  });

  it("favoriting changes nothing but the favorite flag", async () => {
    const s = await seedLibrary();
    const prisma = getTestPrisma();
    const before = await prisma.exercise.findUniqueOrThrow({
      where: { id: s.bench.id },
    });
    await setExerciseFavorite({ exerciseId: s.bench.id, isFavorite: true });
    const after = await prisma.exercise.findUniqueOrThrow({
      where: { id: s.bench.id },
    });
    expect({
      ...after,
      isFavorite: false,
      updatedAt: before.updatedAt,
    }).toEqual(before);
  });

  it("rejects favoriting an unknown or archived exercise", async () => {
    const s = await seedLibrary();
    await expect(
      setExerciseFavorite({
        exerciseId: "00000000-0000-4000-8000-000000000000",
        isFavorite: true,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      setExerciseFavorite({ exerciseId: "not-a-uuid", isFavorite: true }),
    ).rejects.toMatchObject({ code: "not_found" });
    await archiveExercise({ exerciseId: s.row.id });
    await expect(
      setExerciseFavorite({ exerciseId: s.row.id, isFavorite: true }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
  });
});

describe("custom exercises", () => {
  it("require name, primary muscle, and equipment; secondaries optional; no image", async () => {
    const prisma = getTestPrisma();
    const attempt = (input: Record<string, unknown>) =>
      createCustomExercise(input).then(
        () => null,
        (e: DomainError) => e,
      );

    const missingAll = await attempt({});
    expect(missingAll).toBeInstanceOf(DomainError);
    expect(missingAll?.code).toBe("validation_error");
    expect(Object.keys(missingAll?.details ?? {}).sort()).toEqual([
      "equipmentType",
      "name",
      "primaryMuscle",
    ]);
    expect(
      (await attempt({ name: "X", primaryMuscle: "back" }))?.details,
    ).toHaveProperty("equipmentType");
    expect(
      (await attempt({ name: "X", equipmentType: "band" }))?.details,
    ).toHaveProperty("primaryMuscle");
    expect(
      (
        await attempt({
          primaryMuscle: "back",
          equipmentType: "band",
          name: "   ",
        })
      )?.details,
    ).toHaveProperty("name");
    expect(
      (
        await attempt({
          name: "X",
          primaryMuscle: "back",
          equipmentType: "band",
          secondaryMuscles: ["back"],
        })
      )?.details,
    ).toHaveProperty("secondaryMuscles");
    expect(
      (
        await attempt({
          name: "X",
          primaryMuscle: "back",
          equipmentType: "band",
          secondaryMuscles: ["biceps", "biceps"],
        })
      )?.details,
    ).toHaveProperty("secondaryMuscles");
    expect(await prisma.exercise.count()).toBe(0);

    const created = await createCustomExercise({
      name: "  Landmine Press ",
      primaryMuscle: "shoulders",
      equipmentType: "barbell",
      // An image or provenance smuggled in is ignored entirely.
      imageRef: "free-exercise-db/Anything/0.jpg",
      sourceId: "Anything",
      isFavorite: true,
    } as Record<string, unknown>);
    expect(created).toMatchObject({
      name: "Landmine Press",
      isCustom: true,
      sourceId: null,
      imageRef: null,
      isFavorite: false,
      secondaryMuscles: [],
    });
  });

  it("participate in search, primary filter, and Favorites exactly like imported ones", async () => {
    await seedLibrary();
    const custom = await createCustomExercise({
      name: "Landmine Press",
      primaryMuscle: "shoulders",
      equipmentType: "barbell",
      secondaryMuscles: ["triceps", "chest"],
    });
    expect(names(await listExercises({ muscle: "shoulders" }))).toEqual([
      "Landmine Press",
      "Overhead Press",
    ]);
    expect(names(await listExercises({ search: "landmine" }))).toEqual([
      "Landmine Press",
    ]);
    // Chest is secondary for the custom movement: not a Chest result.
    expect(names(await listExercises({ muscle: "chest" }))).not.toContain(
      "Landmine Press",
    );
    await setExerciseFavorite({ exerciseId: custom.id, isFavorite: true });
    expect(
      names(
        await listExercises({
          view: "favorites",
          muscle: "shoulders",
          search: "press",
        }),
      ),
    ).toEqual(["Landmine Press"]);
    const detail = await getExercise(custom.id);
    expect(detail).toMatchObject({
      isCustom: true,
      imageUrl: null,
      secondaryMuscleLabels: ["Triceps", "Chest"],
      isArchived: false,
    });
  });

  it("allows duplicate names (custom/custom and custom/imported)", async () => {
    await imported("Hip Thrust", "glutes");
    await createCustomExercise({
      name: "Hip Thrust",
      primaryMuscle: "glutes",
      equipmentType: "machine",
    });
    await createCustomExercise({
      name: "Hip Thrust",
      primaryMuscle: "glutes",
      equipmentType: "band",
    });
    expect((await listExercises({ search: "hip thrust" })).total).toBe(3);
  });
});

describe("exercise archival never destroys or detaches history", () => {
  it("excludes the exercise from All and Favorites but keeps the row and its favorite flag", async () => {
    const s = await seedLibrary();
    const prisma = getTestPrisma();
    await setExerciseFavorite({ exerciseId: s.row.id, isFavorite: true });

    await archiveExercise({ exerciseId: s.row.id });

    expect(names(await listExercises({ muscle: "back" }))).not.toContain(
      "Barbell Row",
    );
    expect(names(await listExercises({ view: "favorites" }))).not.toContain(
      "Barbell Row",
    );
    const stored = await prisma.exercise.findUniqueOrThrow({
      where: { id: s.row.id },
    });
    expect(stored.deletedAt).not.toBeNull();
    expect(stored.isFavorite).toBe(true); // archival does not rewrite favorites (D11)
    expect(await prisma.exercise.count()).toBe(8); // nothing hard-deleted

    const detail = await getExercise(s.row.id);
    expect(detail).toMatchObject({ name: "Barbell Row", isArchived: true });
  });

  it("archiving is idempotent and restore (Undo) brings it back exactly", async () => {
    const s = await seedLibrary();
    await setExerciseFavorite({ exerciseId: s.row.id, isFavorite: true });
    await archiveExercise({ exerciseId: s.row.id });
    const first = (
      await getTestPrisma().exercise.findUniqueOrThrow({
        where: { id: s.row.id },
      })
    ).deletedAt;
    await archiveExercise({ exerciseId: s.row.id });
    expect(
      (
        await getTestPrisma().exercise.findUniqueOrThrow({
          where: { id: s.row.id },
        })
      ).deletedAt,
    ).toEqual(first);

    await restoreExercise({ exerciseId: s.row.id });
    expect(names(await listExercises({ view: "favorites" }))).toContain(
      "Barbell Row",
    );
    await expect(
      archiveExercise({ exerciseId: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("historical references to an archived exercise remain readable", async () => {
    const prisma = getTestPrisma();
    const s = await seedLibrary();
    const gym = await prisma.gym.create({ data: { name: "Downtown Gym" } });
    const loggedSession = await prisma.loggedSession.create({
      data: { performedOn: new Date() },
    });
    const loggedExercise = await prisma.loggedExercise.create({
      data: {
        loggedSessionId: loggedSession.id,
        exerciseId: s.pulldown.id,
        gymId: gym.id,
      },
    });

    await archiveExercise({ exerciseId: s.pulldown.id });

    const history = await prisma.loggedExercise.findUniqueOrThrow({
      where: { id: loggedExercise.id },
      include: { exercise: true },
    });
    expect(history.exercise.name).toBe("Lat Pulldown");
    expect(history.exercise.deletedAt).not.toBeNull();
    expect(history.exerciseId).toBe(s.pulldown.id);
    // And the database still refuses a hard delete of the referenced row.
    await expect(
      prisma.exercise.delete({ where: { id: s.pulldown.id } }),
    ).rejects.toThrow();
  });
});
