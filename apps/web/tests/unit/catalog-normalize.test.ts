import crypto from "node:crypto";
import fs from "node:fs";
import {
  EQUIPMENT_TYPES,
  isEquipment,
  isMuscleGroup,
} from "@/lib/exercises/taxonomy";
import {
  SOURCE_EQUIPMENT_MAP,
  SOURCE_MUSCLE_MAP,
  UnmappedSourceValueError,
  normalizeDataset,
  normalizeSourceExercise,
} from "../../prisma/seed/free-exercise-db/normalize";
import {
  FREE_EXERCISE_DB_SHA256,
  VENDORED_DATASET_PATH,
  loadVendoredDataset,
  parseSourceDataset,
  sourceImageUrl,
  type SourceExercise,
} from "../../prisma/seed/free-exercise-db/source";

const records = loadVendoredDataset();
const normalized = normalizeDataset(records);

function record(overrides: Partial<SourceExercise>): SourceExercise {
  return {
    id: "Test_Exercise",
    name: "Test Exercise",
    equipment: "barbell",
    primaryMuscles: ["chest"],
    secondaryMuscles: [],
    images: ["Test_Exercise/0.jpg", "Test_Exercise/1.jpg"],
    ...overrides,
  };
}

describe("vendored free-exercise-db snapshot", () => {
  it("is byte-identical to the pinned upstream file", () => {
    const sha = crypto
      .createHash("sha256")
      .update(fs.readFileSync(VENDORED_DATASET_PATH))
      .digest("hex");
    expect(sha).toBe(FREE_EXERCISE_DB_SHA256);
  });

  it("contains 876 records with unique source ids", () => {
    expect(records).toHaveLength(876);
    expect(new Set(records.map((r) => r.id)).size).toBe(876);
  });

  it("builds image URLs pinned to the snapshot commit", () => {
    expect(sourceImageUrl("Barbell_Squat/0.jpg")).toMatch(
      /^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5\/exercises\/Barbell_Squat\/0\.jpg$/,
    );
  });

  it("rejects a malformed dataset instead of guessing", () => {
    expect(() => parseSourceDataset({})).toThrow();
    expect(() => parseSourceDataset([{ id: "x", name: "X" }])).toThrow();
  });
});

describe("normalization over the ENTIRE pinned dataset", () => {
  it("every record gets exactly one canonical primary muscle", () => {
    expect(normalized).toHaveLength(876);
    for (const n of normalized) {
      expect(typeof n.primaryMuscle).toBe("string");
      expect(isMuscleGroup(n.primaryMuscle)).toBe(true);
    }
  });

  it("every record gets a canonical equipment type", () => {
    for (const n of normalized) expect(isEquipment(n.equipmentType)).toBe(true);
  });

  it("secondary muscles are canonical, distinct, and never the primary", () => {
    for (const n of normalized) {
      expect(n.secondaryMuscles.every(isMuscleGroup)).toBe(true);
      expect(new Set(n.secondaryMuscles).size).toBe(n.secondaryMuscles.length);
      expect(n.secondaryMuscles).not.toContain(n.primaryMuscle);
    }
  });

  it("secondary muscles come ONLY from muscles the source itself lists (no invented anatomy)", () => {
    records.forEach((r, i) => {
      const sourceListed = new Set(
        [...r.primaryMuscles, ...r.secondaryMuscles].map(
          (m) => SOURCE_MUSCLE_MAP[m],
        ),
      );
      for (const s of normalized[i].secondaryMuscles) {
        expect(sourceListed.has(s)).toBe(true);
      }
    });
  });

  it("records with no source secondaries keep an empty secondary set", () => {
    const sourceEmpty = records
      .map((r, i) => [r, normalized[i]] as const)
      .filter(
        ([r]) =>
          r.secondaryMuscles.length === 0 && r.primaryMuscles.length === 1,
      );
    expect(sourceEmpty.length).toBe(272);
    for (const [, n] of sourceEmpty) expect(n.secondaryMuscles).toEqual([]);
    // 277 end up empty in total (some only listed their own primary's group).
    expect(
      normalized.filter((n) => n.secondaryMuscles.length === 0),
    ).toHaveLength(277);
  });

  it("never assigns plate_loaded to an imported exercise (the source can't distinguish it)", () => {
    expect(normalized.some((n) => n.equipmentType === "plate_loaded")).toBe(
      false,
    );
  });

  it("keeps source names (trimmed) and never renames for uniqueness", () => {
    records.forEach((r, i) => expect(normalized[i].name).toBe(r.name.trim()));
  });

  it("uses the first source image, or none when the source has none", () => {
    const imageless = normalized.filter((n) => n.imageSourcePath === null);
    expect(imageless.map((n) => n.sourceId).sort()).toEqual([
      "Kettlebell_Halo",
      "Kettlebell_Halo_With_Overhead_Extension",
      "Kettlebell_Overhead_Triceps_Extension",
    ]);
    const squat = normalized.find((n) => n.sourceId === "Barbell_Squat");
    expect(squat?.imageSourcePath).toBe("Barbell_Squat/0.jpg");
  });

  it("classifies the pitch's reference movements as the pitch expects", () => {
    const by = (id: string) => normalized.find((n) => n.sourceId === id)!;
    expect(by("Barbell_Bench_Press_-_Medium_Grip")).toMatchObject({
      primaryMuscle: "chest",
      secondaryMuscles: ["shoulders", "triceps"],
      equipmentType: "barbell",
    });
    expect(by("Wide-Grip_Lat_Pulldown").primaryMuscle).toBe("back");
    expect(by("Bent_Over_Barbell_Row").primaryMuscle).toBe("back");
    expect(by("Barbell_Squat").primaryMuscle).toBe("quads");
  });
});

describe("normalization rules", () => {
  it("merges lats and middle back into back and drops it from secondaries when primary", () => {
    const n = normalizeSourceExercise(
      record({
        primaryMuscles: ["middle back"],
        secondaryMuscles: ["biceps", "lats", "shoulders"],
      }),
    );
    expect(n.primaryMuscle).toBe("back");
    expect(n.secondaryMuscles).toEqual(["biceps", "shoulders"]);
  });

  it("collapses secondaries that map to the same canonical group", () => {
    const n = normalizeSourceExercise(
      record({
        primaryMuscles: ["chest"],
        secondaryMuscles: ["lats", "middle back"],
      }),
    );
    expect(n.secondaryMuscles).toEqual(["back"]);
  });

  it("demotes extra source primaries to secondaries (first primary wins)", () => {
    const n = normalizeSourceExercise(
      record({
        primaryMuscles: ["shoulders", "triceps"],
        secondaryMuscles: ["abdominals"],
      }),
    );
    expect(n.primaryMuscle).toBe("shoulders");
    expect(n.secondaryMuscles).toEqual(["triceps", "core"]);
    const halo = normalized.find(
      (x) => x.sourceId === "Kettlebell_Halo_With_Overhead_Extension",
    );
    expect(halo?.primaryMuscle).toBe("shoulders");
    expect(halo?.secondaryMuscles[0]).toBe("triceps");
  });

  it("maps null equipment to other and every source equipment value to a canonical one", () => {
    expect(
      normalizeSourceExercise(record({ equipment: null })).equipmentType,
    ).toBe("other");
    for (const v of Object.values(SOURCE_EQUIPMENT_MAP)) {
      expect((EQUIPMENT_TYPES as readonly string[]).includes(v)).toBe(true);
    }
  });

  it("rejects a record without a primary muscle", () => {
    expect(() =>
      normalizeSourceExercise(record({ primaryMuscles: [] })),
    ).toThrow(/no primary muscle/);
  });

  it("throws on an unmapped muscle or equipment value instead of guessing", () => {
    expect(() =>
      normalizeSourceExercise(record({ primaryMuscles: ["rotator cuff"] })),
    ).toThrow(UnmappedSourceValueError);
    expect(() =>
      normalizeSourceExercise(record({ secondaryMuscles: ["serratus"] })),
    ).toThrow(UnmappedSourceValueError);
    expect(() =>
      normalizeSourceExercise(record({ equipment: "smith machine" })),
    ).toThrow(UnmappedSourceValueError);
  });

  it("fails the whole dataset on the first problem (nothing partially normalized)", () => {
    expect(() =>
      normalizeDataset([
        record({ id: "A" }),
        record({ id: "B", equipment: "sled" }),
      ]),
    ).toThrow(UnmappedSourceValueError);
    expect(() =>
      normalizeDataset([record({ id: "A" }), record({ id: "A" })]),
    ).toThrow(/duplicate source id/);
  });
});
