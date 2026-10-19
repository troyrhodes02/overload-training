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
import type { Account } from "@/lib/data/account";
import { defaultAccount } from "./support/accounts";

// Multi-User Foundation: these suites act as the default test account.
let account: Account;
beforeEach(async () => {
  account = await defaultAccount();
});

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
  const banded = await createCustomExercise(account, {
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
    const result = await listExercises(account, { muscle: "back" });
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
      names(await listExercises(account, { muscle: "back", search: "row" })),
    ).toEqual(["Banded Row", "Barbell Row", "Seated Cable Row"]);
  });

  it('Favorites + Back, Favorites + Chest + "press", Favorites + search', async () => {
    const s = await seedLibrary();
    for (const e of [s.bench, s.row, s.banded, s.ohp, s.curl]) {
      await setExerciseFavorite(account, {
        exerciseId: e.id,
        isFavorite: true,
      });
    }

    expect(
      names(
        await listExercises(account, { view: "favorites", muscle: "back" }),
      ),
    ).toEqual(["Banded Row", "Barbell Row"]);
    expect(
      names(
        await listExercises(account, {
          view: "favorites",
          muscle: "chest",
          search: "press",
        }),
      ),
    ).toEqual(["Barbell Bench Press"]);
    expect(
      names(
        await listExercises(account, { view: "favorites", search: "press" }),
      ),
    ).toEqual(["Barbell Bench Press", "Overhead Press"]);
    // Biceps favorite with Back as a secondary never shows under Favorites + Back.
    expect(
      names(
        await listExercises(account, { view: "favorites", muscle: "back" }),
      ),
    ).not.toContain("Hammer Curl");
  });

  it("search matches every word, in any order, case-insensitively, names only", async () => {
    await seedLibrary();
    expect(
      names(await listExercises(account, { search: "PRESS bench" })),
    ).toEqual(["Barbell Bench Press"]);
    expect(
      names(await listExercises(account, { search: "  barbell   " })),
    ).toEqual(["Barbell Bench Press", "Barbell Row"]);
    expect((await listExercises(account, { search: "triceps" })).total).toBe(0); // not a name
  });

  it("treats LIKE wildcards in a search literally", async () => {
    await seedLibrary();
    await imported("100% Effort Sled Push", "quads");
    expect(names(await listExercises(account, { search: "%" }))).toEqual([
      "100% Effort Sled Push",
    ]);
    expect((await listExercises(account, { search: "_" })).total).toBe(0);
  });

  it("paginates with a stable name order and reports the full total", async () => {
    await seedLibrary();
    const page = await listExercises(account, { limit: 3 });
    expect(page.items).toHaveLength(3);
    expect(page.total).toBe(8);
    expect(names(page)).toEqual([
      "Banded Row",
      "Barbell Bench Press",
      "Barbell Row",
    ]);
  });

  it("reports whether any active exercise / favorite exists (empty-state signals)", async () => {
    let r = await listExercises(account, { view: "favorites" });
    expect(r).toMatchObject({
      hasAnyActive: false,
      hasAnyFavorites: false,
      total: 0,
    });
    const s = await seedLibrary();
    r = await listExercises(account, { view: "favorites" });
    expect(r).toMatchObject({ hasAnyActive: true, hasAnyFavorites: false });
    await setExerciseFavorite(account, {
      exerciseId: s.ohp.id,
      isFavorite: true,
    });
    r = await listExercises(account, { view: "favorites", muscle: "chest" });
    expect(r).toMatchObject({ hasAnyFavorites: true, total: 0 });
  });

  it("maps DTOs: labels, Overload Storage image URLs, no image for custom", async () => {
    const s = await seedLibrary();
    const item = (await listExercises(account, { search: "lat pulldown" }))
      .items[0];
    expect(item).toMatchObject({
      id: s.pulldown.id,
      primaryMuscleLabel: "Back",
      equipmentLabel: "Cable",
      isCustom: false,
    });
    const custom = (await listExercises(account, { search: "banded" }))
      .items[0];
    expect(custom).toMatchObject({ isCustom: true, imageUrl: null });
  });
});

describe("favorites persist for imported and custom exercises", () => {
  // Multi-User Foundation (spec R12): a favorite is the acting account's
  // ExerciseFavorite row. The shared exercise row is never written.
  const favoriteIds = async () =>
    (
      await getTestPrisma().exerciseFavorite.findMany({
        where: { userId: account.userId },
        orderBy: { exerciseId: "asc" },
      })
    ).map((f) => f.exerciseId);

  it("favorite and unfavorite persist", async () => {
    const s = await seedLibrary();
    await setExerciseFavorite(account, {
      exerciseId: s.pulldown.id,
      isFavorite: true,
    });
    await setExerciseFavorite(account, {
      exerciseId: s.banded.id,
      isFavorite: true,
    });
    expect(await favoriteIds()).toEqual([s.pulldown.id, s.banded.id].sort());
    expect(names(await listExercises(account, { view: "favorites" }))).toEqual([
      "Banded Row",
      "Lat Pulldown",
    ]);
    expect(
      (await listExercises(account, { search: "lat pulldown" })).items[0]
        .isFavorite,
    ).toBe(true);
    expect((await getExercise(account, s.pulldown.id))?.isFavorite).toBe(true);

    await setExerciseFavorite(account, {
      exerciseId: s.pulldown.id,
      isFavorite: false,
    });
    expect(await favoriteIds()).toEqual([s.banded.id]);
    expect(names(await listExercises(account, { view: "favorites" }))).toEqual([
      "Banded Row",
    ]);
    // Favoriting twice is idempotent.
    await setExerciseFavorite(account, {
      exerciseId: s.banded.id,
      isFavorite: true,
    });
    expect(await favoriteIds()).toEqual([s.banded.id]);
  });

  it("favoriting never writes the shared exercise row", async () => {
    const s = await seedLibrary();
    const prisma = getTestPrisma();
    const before = await prisma.exercise.findUniqueOrThrow({
      where: { id: s.bench.id },
    });
    await setExerciseFavorite(account, {
      exerciseId: s.bench.id,
      isFavorite: true,
    });
    await setExerciseFavorite(account, {
      exerciseId: s.bench.id,
      isFavorite: false,
    });
    await setExerciseFavorite(account, {
      exerciseId: s.bench.id,
      isFavorite: true,
    });
    expect(
      await prisma.exercise.findUniqueOrThrow({ where: { id: s.bench.id } }),
    ).toEqual(before);
  });

  it("rejects favoriting an unknown or archived exercise", async () => {
    const s = await seedLibrary();
    await expect(
      setExerciseFavorite(account, {
        exerciseId: "00000000-0000-4000-8000-000000000000",
        isFavorite: true,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      setExerciseFavorite(account, {
        exerciseId: "not-a-uuid",
        isFavorite: true,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await archiveExercise(account, { exerciseId: s.banded.id });
    await expect(
      setExerciseFavorite(account, {
        exerciseId: s.banded.id,
        isFavorite: true,
      }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    // A library exercise archived in the single-user era stays unstarrable.
    await getTestPrisma().exercise.update({
      where: { id: s.row.id },
      data: { deletedAt: new Date() },
    });
    await expect(
      setExerciseFavorite(account, { exerciseId: s.row.id, isFavorite: true }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
  });
});

describe("custom exercises", () => {
  it("require name, primary muscle, and equipment; secondaries optional; no image", async () => {
    const prisma = getTestPrisma();
    const attempt = (input: Record<string, unknown>) =>
      createCustomExercise(account, input).then(
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

    const created = await createCustomExercise(account, {
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
    const custom = await createCustomExercise(account, {
      name: "Landmine Press",
      primaryMuscle: "shoulders",
      equipmentType: "barbell",
      secondaryMuscles: ["triceps", "chest"],
    });
    expect(
      names(await listExercises(account, { muscle: "shoulders" })),
    ).toEqual(["Landmine Press", "Overhead Press"]);
    expect(names(await listExercises(account, { search: "landmine" }))).toEqual(
      ["Landmine Press"],
    );
    // Chest is secondary for the custom movement: not a Chest result.
    expect(
      names(await listExercises(account, { muscle: "chest" })),
    ).not.toContain("Landmine Press");
    await setExerciseFavorite(account, {
      exerciseId: custom.id,
      isFavorite: true,
    });
    expect(
      names(
        await listExercises(account, {
          view: "favorites",
          muscle: "shoulders",
          search: "press",
        }),
      ),
    ).toEqual(["Landmine Press"]);
    const detail = await getExercise(account, custom.id);
    expect(detail).toMatchObject({
      isCustom: true,
      imageUrl: null,
      secondaryMuscleLabels: ["Triceps", "Chest"],
      isArchived: false,
    });
  });

  it("allows duplicate names (custom/custom and custom/imported)", async () => {
    await imported("Hip Thrust", "glutes");
    await createCustomExercise(account, {
      name: "Hip Thrust",
      primaryMuscle: "glutes",
      equipmentType: "machine",
    });
    await createCustomExercise(account, {
      name: "Hip Thrust",
      primaryMuscle: "glutes",
      equipmentType: "band",
    });
    expect((await listExercises(account, { search: "hip thrust" })).total).toBe(
      3,
    );
  });
});

describe("exercise archival never destroys or detaches history", () => {
  it("excludes the exercise from All and Favorites but keeps the row and its favorite", async () => {
    const s = await seedLibrary();
    const prisma = getTestPrisma();
    await setExerciseFavorite(account, {
      exerciseId: s.banded.id,
      isFavorite: true,
    });

    await archiveExercise(account, { exerciseId: s.banded.id });

    expect(
      names(await listExercises(account, { muscle: "back" })),
    ).not.toContain("Banded Row");
    expect(
      names(await listExercises(account, { view: "favorites" })),
    ).not.toContain("Banded Row");
    const stored = await prisma.exercise.findUniqueOrThrow({
      where: { id: s.banded.id },
    });
    expect(stored.deletedAt).not.toBeNull();
    // Archival does not rewrite favorites (D11).
    expect(
      await prisma.exerciseFavorite.count({
        where: { exerciseId: s.banded.id },
      }),
    ).toBe(1);
    expect(await prisma.exercise.count()).toBe(8); // nothing hard-deleted

    const detail = await getExercise(account, s.banded.id);
    expect(detail).toMatchObject({ name: "Banded Row", isArchived: true });
  });

  it("archiving is idempotent and restore (Undo) brings it back exactly", async () => {
    const s = await seedLibrary();
    await setExerciseFavorite(account, {
      exerciseId: s.banded.id,
      isFavorite: true,
    });
    await archiveExercise(account, { exerciseId: s.banded.id });
    const first = (
      await getTestPrisma().exercise.findUniqueOrThrow({
        where: { id: s.banded.id },
      })
    ).deletedAt;
    await archiveExercise(account, { exerciseId: s.banded.id });
    expect(
      (
        await getTestPrisma().exercise.findUniqueOrThrow({
          where: { id: s.banded.id },
        })
      ).deletedAt,
    ).toEqual(first);

    await restoreExercise(account, { exerciseId: s.banded.id });
    expect(
      names(await listExercises(account, { view: "favorites" })),
    ).toContain("Banded Row");
    await expect(
      archiveExercise(account, {
        exerciseId: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toMatchObject({
      code: "not_found",
    });
  });

  // Multi-User Foundation (PRD edge case; spec R13): library exercises are
  // shared reference data - no account can archive or restore them.
  it("a library exercise cannot be archived or restored, and is left untouched", async () => {
    const s = await seedLibrary();
    const prisma = getTestPrisma();
    const before = await prisma.exercise.findUniqueOrThrow({
      where: { id: s.row.id },
    });
    await expect(
      archiveExercise(account, { exerciseId: s.row.id }),
    ).rejects.toMatchObject({
      code: "not_found",
      message: "That exercise doesn't exist.",
    });
    expect(
      await prisma.exercise.findUniqueOrThrow({ where: { id: s.row.id } }),
    ).toEqual(before);
    await prisma.exercise.update({
      where: { id: s.row.id },
      data: { deletedAt: new Date("2026-01-01T00:00:00Z") },
    });
    const archivedLegacy = await prisma.exercise.findUniqueOrThrow({
      where: { id: s.row.id },
    });
    await expect(
      restoreExercise(account, { exerciseId: s.row.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(
      await prisma.exercise.findUniqueOrThrow({ where: { id: s.row.id } }),
    ).toEqual(archivedLegacy);
    expect((await getExercise(account, s.row.id))?.canArchive).toBe(false);
    expect((await getExercise(account, s.banded.id))?.canArchive).toBe(true);
  });

  it("historical references to an archived exercise remain readable", async () => {
    const prisma = getTestPrisma();
    const s = await seedLibrary();
    const gym = await prisma.gym.create({ data: { name: "Downtown Gym" } });
    const loggedSession = await prisma.loggedSession.create({
      data: { performedOn: new Date(), scheduledFor: new Date() },
    });
    const loggedExercise = await prisma.loggedExercise.create({
      data: {
        loggedSessionId: loggedSession.id,
        exerciseId: s.banded.id,
        plannedExerciseId: s.banded.id,
        gymId: gym.id,
        plannedSets: 3,
        targetRepMin: 6,
        targetRepMax: 8,
      },
    });

    await archiveExercise(account, { exerciseId: s.banded.id });

    const history = await prisma.loggedExercise.findUniqueOrThrow({
      where: { id: loggedExercise.id },
      include: { exercise: true },
    });
    expect(history.exercise.name).toBe("Banded Row");
    expect(history.exercise.deletedAt).not.toBeNull();
    expect(history.exerciseId).toBe(s.banded.id);
    // And the database still refuses a hard delete of the referenced row.
    await expect(
      prisma.exercise.delete({ where: { id: s.banded.id } }),
    ).rejects.toThrow();
  });
});
