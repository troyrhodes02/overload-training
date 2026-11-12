/**
 * free-exercise-db — the pinned, vendored import source (spec D26).
 *
 * The dataset is an INGEST dependency only. Nothing under src/ may import this
 * module or the vendored JSON; the running app reads Overload's own `exercises`
 * table and `exercise-images` bucket (spec D14).
 */
import fs from "node:fs";
import path from "node:path";

/** Upstream commit the vendored snapshot and the image URLs are pinned to. */
export const FREE_EXERCISE_DB_COMMIT =
  "f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5";

/** SHA-256 of the vendored `exercises.json` (byte-identical to upstream). */
export const FREE_EXERCISE_DB_SHA256 =
  "5bb747e3fc658f095a60dcbf6d53c96627acdcc6ffb6fffde86f7e26995d40bf";

export const VENDORED_DATASET_PATH = path.join(__dirname, "exercises.json");

/** One record as it appears in the source dataset. */
export type SourceExercise = {
  id: string;
  name: string;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  images: string[];
};

/** Raw GitHub URL of a source image at the pinned commit. */
export function sourceImageUrl(imagePath: string): string {
  return `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${FREE_EXERCISE_DB_COMMIT}/exercises/${imagePath}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * Validates the shape of the parsed dataset and keeps only the fields the
 * import uses. Throws on anything malformed — the import must never guess.
 */
export function parseSourceDataset(raw: unknown): SourceExercise[] {
  if (!Array.isArray(raw)) {
    throw new Error("free-exercise-db: expected a top-level array");
  }
  return raw.map((record, index) => {
    const r = record as Record<string, unknown>;
    const where = `free-exercise-db record #${index} (${String(r?.id)})`;
    if (typeof r?.id !== "string" || r.id.length === 0) {
      throw new Error(`${where}: missing id`);
    }
    if (typeof r.name !== "string" || r.name.trim().length === 0) {
      throw new Error(`${where}: missing name`);
    }
    if (r.equipment !== null && typeof r.equipment !== "string") {
      throw new Error(`${where}: equipment must be a string or null`);
    }
    if (!isStringArray(r.primaryMuscles)) {
      throw new Error(`${where}: primaryMuscles must be a string array`);
    }
    if (!isStringArray(r.secondaryMuscles)) {
      throw new Error(`${where}: secondaryMuscles must be a string array`);
    }
    if (!isStringArray(r.images)) {
      throw new Error(`${where}: images must be a string array`);
    }
    return {
      id: r.id,
      name: r.name,
      equipment: r.equipment as string | null,
      primaryMuscles: r.primaryMuscles,
      secondaryMuscles: r.secondaryMuscles,
      images: r.images,
    };
  });
}

/** Reads and validates the vendored snapshot. */
export function loadVendoredDataset(
  file: string = VENDORED_DATASET_PATH,
): SourceExercise[] {
  return parseSourceDataset(JSON.parse(fs.readFileSync(file, "utf8")));
}
