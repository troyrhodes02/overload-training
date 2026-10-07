import {
  importCatalog,
  type ExerciseImageSource,
  type ExerciseImageStore,
} from "../../prisma/seed/catalog-import";
import {
  loadVendoredDataset,
  type SourceExercise,
} from "../../prisma/seed/free-exercise-db/source";
import { getTestPrisma } from "./support/db";

/**
 * Library & Gyms Setup — the catalog import against a real (throwaway)
 * Postgres, with in-memory Storage and image-source fakes. Proves the import is
 * safe to re-run, keys identity on the source id (not the name), never touches
 * custom exercises or user preference, and tolerates image failures.
 */

class FakeStore implements ExerciseImageStore {
  objects = new Map<string, Uint8Array>();
  uploads = 0;
  bucketPublic: boolean | null = null;
  ensureError: Error | null = null;

  async ensurePublicBucket() {
    if (this.ensureError) throw this.ensureError;
    this.bucketPublic = true;
  }
  async exists(path: string) {
    return this.objects.has(path);
  }
  async upload(path: string, bytes: Uint8Array) {
    if (this.objects.has(path)) return "already_exists" as const;
    this.objects.set(path, bytes);
    this.uploads += 1;
    return "uploaded" as const;
  }
}

class FakeSource implements ExerciseImageSource {
  fetches = 0;
  failFor = new Set<string>();
  async fetch(path: string) {
    this.fetches += 1;
    if (this.failFor.has(path)) throw new Error("HTTP 503");
    return new TextEncoder().encode(`jpeg:${path}`);
  }
}

const ALL = loadVendoredDataset();
const pick = (...ids: string[]) =>
  ids.map((id) => {
    const r = ALL.find((x) => x.id === id);
    if (!r) throw new Error(`fixture ${id} missing`);
    return r;
  });

const FIXTURE = pick(
  "Barbell_Squat",
  "Barbell_Bench_Press_-_Medium_Grip",
  "Wide-Grip_Lat_Pulldown",
  "Bent_Over_Barbell_Row",
  "Kettlebell_Halo", // no source image
  "Kettlebell_Halo_With_Overhead_Extension", // two source primaries, no image
);

function run(
  records: readonly SourceExercise[],
  store = new FakeStore(),
  source = new FakeSource(),
) {
  return importCatalog({
    prisma: getTestPrisma(),
    records,
    imageStore: store,
    imageSource: source,
  });
}

describe("free-exercise-db catalog import", () => {
  it("imports the ENTIRE pinned catalog with images, classified canonically", async () => {
    const prisma = getTestPrisma();
    const store = new FakeStore();
    const report = await run(ALL, store);

    expect(report.sourceRecords).toBe(876);
    expect(report.inserted).toBe(876);
    expect(report.imagesUploaded).toBe(873);
    expect(report.imagesLinked).toBe(873);
    expect(report.imagesMissingInSource).toBe(3);
    expect(report.imageFailures).toEqual([]);
    expect(store.bucketPublic).toBe(true);

    expect(await prisma.exercise.count()).toBe(876);
    expect(await prisma.exercise.count({ where: { isCustom: true } })).toBe(0);
    expect(await prisma.exercise.count({ where: { isFavorite: true } })).toBe(
      0,
    );
    expect(
      await prisma.exercise.count({ where: { deletedAt: { not: null } } }),
    ).toBe(0);
    expect(await prisma.exercise.count({ where: { imageRef: null } })).toBe(3);

    const bench = await prisma.exercise.findUniqueOrThrow({
      where: { sourceId: "Barbell_Bench_Press_-_Medium_Grip" },
    });
    expect(bench).toMatchObject({
      name: "Barbell Bench Press - Medium Grip",
      primaryMuscle: "chest",
      secondaryMuscles: ["shoulders", "triceps"],
      equipmentType: "barbell",
      imageRef: "free-exercise-db/Barbell_Bench_Press_-_Medium_Grip/0.jpg",
    });
  });

  it("re-running does not duplicate exercises or image objects", async () => {
    const prisma = getTestPrisma();
    const store = new FakeStore();
    const source = new FakeSource();
    await run(FIXTURE, store, source);
    const rowsAfterFirst = await prisma.exercise.findMany({
      orderBy: { sourceId: "asc" },
    });
    const objectsAfterFirst = store.objects.size;

    const second = await run(FIXTURE, store, source);
    expect(second.inserted).toBe(0);
    expect(second.alreadyPresent).toBe(FIXTURE.length);
    expect(second.imagesUploaded).toBe(0);
    expect(store.objects.size).toBe(objectsAfterFirst);
    expect(store.uploads).toBe(objectsAfterFirst);

    const rowsAfterSecond = await prisma.exercise.findMany({
      orderBy: { sourceId: "asc" },
    });
    expect(rowsAfterSecond).toEqual(rowsAfterFirst);
  });

  it("does not re-upload an image object that already exists in the bucket", async () => {
    const prisma = getTestPrisma();
    const store = new FakeStore();
    const source = new FakeSource();
    store.objects.set(
      "free-exercise-db/Barbell_Squat/0.jpg",
      new Uint8Array([1]),
    );

    const report = await run(pick("Barbell_Squat"), store, source);
    expect(report.imagesUploaded).toBe(0);
    expect(report.imagesAlreadyStored).toBe(1);
    expect(source.fetches).toBe(0);
    const squat = await prisma.exercise.findUniqueOrThrow({
      where: { sourceId: "Barbell_Squat" },
    });
    expect(squat.imageRef).toBe("free-exercise-db/Barbell_Squat/0.jpg");
  });

  it("keys identity on the source id, not the display name", async () => {
    const prisma = getTestPrisma();
    const [squat] = pick("Barbell_Squat");
    const twin: SourceExercise = { ...squat, id: "Barbell_Squat_Twin" }; // same name
    const report = await run([squat, twin]);
    expect(report.inserted).toBe(2);
    expect(await prisma.exercise.count({ where: { name: squat.name } })).toBe(
      2,
    );
  });

  it("never overwrites or converts a custom exercise with a similar name", async () => {
    const prisma = getTestPrisma();
    const custom = await prisma.exercise.create({
      data: {
        name: "Barbell Squat",
        primaryMuscle: "glutes",
        equipmentType: "plate_loaded",
        isCustom: true,
        isFavorite: true,
      },
    });

    await run(FIXTURE);
    await run(FIXTURE);

    const after = await prisma.exercise.findUniqueOrThrow({
      where: { id: custom.id },
    });
    expect(after).toEqual(custom);
    expect(
      await prisma.exercise.count({ where: { name: "Barbell Squat" } }),
    ).toBe(2);
  });

  it("does not clear or manufacture favorites, and does not unarchive", async () => {
    const prisma = getTestPrisma();
    await run(FIXTURE);
    await prisma.exercise.update({
      where: { sourceId: "Barbell_Squat" },
      data: { isFavorite: true },
    });
    const archivedAt = new Date("2026-10-01T12:00:00Z");
    await prisma.exercise.update({
      where: { sourceId: "Wide-Grip_Lat_Pulldown" },
      data: { deletedAt: archivedAt },
    });

    await run(FIXTURE);

    const squat = await prisma.exercise.findUniqueOrThrow({
      where: { sourceId: "Barbell_Squat" },
    });
    expect(squat.isFavorite).toBe(true);
    const pulldown = await prisma.exercise.findUniqueOrThrow({
      where: { sourceId: "Wide-Grip_Lat_Pulldown" },
    });
    expect(pulldown.deletedAt).toEqual(archivedAt);
    expect(await prisma.exercise.count({ where: { isFavorite: true } })).toBe(
      1,
    );
  });

  it("an image failure leaves the exercise usable and is retried by a later run", async () => {
    const prisma = getTestPrisma();
    const store = new FakeStore();
    const source = new FakeSource();
    source.failFor.add("Barbell_Squat/0.jpg");

    const first = await run(FIXTURE, store, source);
    expect(first.imageFailures).toEqual([
      { sourceId: "Barbell_Squat", reason: "HTTP 503" },
    ]);
    const squat = await prisma.exercise.findUniqueOrThrow({
      where: { sourceId: "Barbell_Squat" },
    });
    expect(squat.imageRef).toBeNull();
    expect(squat.deletedAt).toBeNull(); // still a normal, selectable exercise
    expect(
      (
        await prisma.exercise.findUniqueOrThrow({
          where: { sourceId: "Bent_Over_Barbell_Row" },
        })
      ).imageRef,
    ).not.toBeNull();

    source.failFor.clear();
    const second = await run(FIXTURE, store, source);
    expect(second.inserted).toBe(0);
    expect(second.imagesUploaded).toBe(1);
    expect(
      (
        await prisma.exercise.findUniqueOrThrow({
          where: { sourceId: "Barbell_Squat" },
        })
      ).imageRef,
    ).toBe("free-exercise-db/Barbell_Squat/0.jpg");
  });

  it("records without a source image get no image reference", async () => {
    const prisma = getTestPrisma();
    const report = await run(FIXTURE);
    expect(report.imagesMissingInSource).toBe(2);
    const halo = await prisma.exercise.findUniqueOrThrow({
      where: { sourceId: "Kettlebell_Halo_With_Overhead_Extension" },
    });
    expect(halo.imageRef).toBeNull();
    expect(halo.primaryMuscle).toBe("shoulders");
    expect(halo.secondaryMuscles).toContain("triceps");
  });

  it("writes nothing when the bucket posture check fails", async () => {
    const prisma = getTestPrisma();
    const store = new FakeStore();
    store.ensureError = new Error("bucket is private");
    await expect(run(FIXTURE, store)).rejects.toThrow(/private/);
    expect(await prisma.exercise.count()).toBe(0);
  });

  it("writes nothing when a source value is unmapped", async () => {
    const prisma = getTestPrisma();
    const bad: SourceExercise = {
      ...FIXTURE[0],
      id: "Bad_Record",
      equipment: "sled",
    };
    await expect(run([...FIXTURE, bad])).rejects.toThrow(
      /unmapped equipment value "sled"/,
    );
    expect(await prisma.exercise.count()).toBe(0);
  });

  it("creates no plan, history, gym, baseline, goal, or cardio rows", async () => {
    const prisma = getTestPrisma();
    await run(FIXTURE);
    const counts = await Promise.all([
      prisma.mesocycle.count(),
      prisma.session.count(),
      prisma.sessionExercise.count(),
      prisma.gym.count(),
      prisma.gymExerciseBaseline.count(),
      prisma.loggedSession.count(),
      prisma.loggedExercise.count(),
      prisma.loggedSet.count(),
      prisma.goal.count(),
      prisma.cardioLog.count(),
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
