/**
 * Normalization of free-exercise-db records into Overload's canonical
 * classification (spec "Source Import", D5/D6/D8/D21–D23; documented for
 * downstream pitches in docs/planning/method-note.md).
 *
 * Rules:
 *  - The mappings below are TOTAL over the pinned snapshot. Any value not in a
 *    mapping throws UnmappedSourceValueError, which aborts the import before a
 *    single row is written. Nothing is ever guessed.
 *  - No anatomy is invented: secondary muscles come only from the source's own
 *    lists. An empty source list stays empty.
 */
import type {
  EquipmentValue,
  MuscleGroupValue,
} from "../../../src/lib/exercises/taxonomy";
import type { SourceExercise } from "./source";

/** free-exercise-db muscle → canonical MuscleGroup. Only lats + middle back merge. */
export const SOURCE_MUSCLE_MAP: Readonly<Record<string, MuscleGroupValue>> = {
  chest: "chest",
  lats: "back",
  "middle back": "back",
  "lower back": "lower_back",
  traps: "traps",
  shoulders: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  forearms: "forearms",
  abdominals: "core",
  quadriceps: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  calves: "calves",
  adductors: "adductors",
  abductors: "abductors",
  neck: "neck",
};

/**
 * free-exercise-db equipment → canonical Equipment. `null` (no equipment
 * stated) maps to the no-claim catch-all `other`. No source value maps to
 * `plate_loaded`: the source does not distinguish plate-loaded machines.
 */
export const SOURCE_EQUIPMENT_MAP: Readonly<Record<string, EquipmentValue>> = {
  barbell: "barbell",
  "e-z curl bar": "ez_bar",
  dumbbell: "dumbbell",
  kettlebells: "kettlebell",
  cable: "cable",
  machine: "machine",
  "body only": "bodyweight",
  bands: "band",
  "medicine ball": "medicine_ball",
  "exercise ball": "exercise_ball",
  "foam roll": "foam_roller",
  other: "other",
};
export const NULL_EQUIPMENT: EquipmentValue = "other";

export class UnmappedSourceValueError extends Error {
  constructor(
    readonly sourceId: string,
    readonly field: "muscle" | "equipment",
    readonly value: string,
  ) {
    super(
      `free-exercise-db record "${sourceId}": unmapped ${field} value "${value}". ` +
        "Add it to the mapping in prisma/seed/free-exercise-db/normalize.ts and " +
        "docs/planning/method-note.md; the import never guesses.",
    );
    this.name = "UnmappedSourceValueError";
  }
}

export type NormalizedExercise = {
  sourceId: string;
  name: string;
  primaryMuscle: MuscleGroupValue;
  secondaryMuscles: MuscleGroupValue[];
  equipmentType: EquipmentValue;
  /** Path of the first source image (e.g. "Barbell_Squat/0.jpg"), or null. */
  imageSourcePath: string | null;
};

function mapMuscle(sourceId: string, value: string): MuscleGroupValue {
  const mapped = SOURCE_MUSCLE_MAP[value];
  if (!mapped) throw new UnmappedSourceValueError(sourceId, "muscle", value);
  return mapped;
}

function mapEquipment(sourceId: string, value: string | null): EquipmentValue {
  if (value === null) return NULL_EQUIPMENT;
  const mapped = SOURCE_EQUIPMENT_MAP[value];
  if (!mapped) throw new UnmappedSourceValueError(sourceId, "equipment", value);
  return mapped;
}

/**
 * Converts one source record to Overload's classification:
 *  1. primary = mapped primaryMuscles[0] (a record without one is rejected);
 *  2. any further source primaries become secondaries (source-supported);
 *  3. secondaries = mapped source secondaries in source order, minus the
 *     primary, de-duplicated (first occurrence kept);
 *  4. equipment via the equipment map (null → other);
 *  5. the name is the source name, trimmed — never renamed for uniqueness.
 */
export function normalizeSourceExercise(
  record: SourceExercise,
): NormalizedExercise {
  const [firstPrimary, ...extraPrimaries] = record.primaryMuscles;
  if (firstPrimary === undefined) {
    throw new Error(
      `free-exercise-db record "${record.id}" has no primary muscle; every Overload exercise requires exactly one.`,
    );
  }
  const primaryMuscle = mapMuscle(record.id, firstPrimary);

  const secondaryMuscles: MuscleGroupValue[] = [];
  for (const value of [...extraPrimaries, ...record.secondaryMuscles]) {
    const mapped = mapMuscle(record.id, value);
    if (mapped === primaryMuscle || secondaryMuscles.includes(mapped)) continue;
    secondaryMuscles.push(mapped);
  }

  return {
    sourceId: record.id,
    name: record.name.trim(),
    primaryMuscle,
    secondaryMuscles,
    equipmentType: mapEquipment(record.id, record.equipment),
    imageSourcePath: record.images[0] ?? null,
  };
}

/** Normalizes every record, failing fast (before any write) on the first problem. */
export function normalizeDataset(
  records: readonly SourceExercise[],
): NormalizedExercise[] {
  const seen = new Set<string>();
  return records.map((record) => {
    if (seen.has(record.id)) {
      throw new Error(`free-exercise-db: duplicate source id "${record.id}"`);
    }
    seen.add(record.id);
    return normalizeSourceExercise(record);
  });
}
