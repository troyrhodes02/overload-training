/**
 * The free-exercise-db catalog import (spec "Source Import", D14–D17, D25–D27).
 *
 * Safe to re-run:
 *  - Exercises are inserted by their stable source id (unique `source_id`)
 *    with ON CONFLICT DO NOTHING. Existing rows are NEVER updated, so a rerun
 *    cannot change a name, a classification, a favorite, or archive state.
 *  - Custom exercises have no source id and are outside every predicate here,
 *    so the import can never overwrite or convert them.
 *  - An image object that already exists in the bucket is not re-uploaded;
 *    `image_ref` is linked only after the object is known to exist.
 *  - An image failure is reported and leaves that exercise fully usable
 *    (image_ref stays null; the UI shows a monogram).
 *
 * This module writes ONLY the `exercises` table (and Storage objects). It never
 * touches favorites, archive state, logged history, plans, gyms, baselines,
 * goals, or cardio.
 */
import type { PrismaClient } from "@prisma/client";
import {
  normalizeDataset,
  type NormalizedExercise,
} from "./free-exercise-db/normalize";
import type { SourceExercise } from "./free-exercise-db/source";

/** Storage object path for an imported exercise's (single) image (spec D25). */
export function importedImageObjectPath(sourceId: string): string {
  return `free-exercise-db/${sourceId}/0.jpg`;
}

/** Overload's Storage bucket for exercise images (adapter over Supabase Storage). */
export interface ExerciseImageStore {
  /** Creates the bucket public-read if missing; throws if it exists but is private. */
  ensurePublicBucket(): Promise<void>;
  exists(objectPath: string): Promise<boolean>;
  /** Uploads without overwriting. An existing object is reported, not replaced. */
  upload(
    objectPath: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<"uploaded" | "already_exists">;
}

/** Where source images are downloaded from at import time (pinned GitHub in production). */
export interface ExerciseImageSource {
  fetch(sourceImagePath: string): Promise<Uint8Array>;
}

export type CatalogImportDeps = {
  prisma: PrismaClient;
  records: readonly SourceExercise[];
  imageStore: ExerciseImageStore;
  imageSource: ExerciseImageSource;
  log?: (line: string) => void;
  /** Parallel image transfers. */
  concurrency?: number;
};

export type CatalogImportReport = {
  sourceRecords: number;
  inserted: number;
  alreadyPresent: number;
  imagesUploaded: number;
  imagesAlreadyStored: number;
  imagesLinked: number;
  imagesMissingInSource: number;
  imageFailures: { sourceId: string; reason: string }[];
};

async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next++];
        await worker(item);
      }
    },
  );
  await Promise.all(runners);
}

export async function importCatalog(
  deps: CatalogImportDeps,
): Promise<CatalogImportReport> {
  const { prisma, imageStore, imageSource } = deps;
  const log = deps.log ?? (() => {});
  const concurrency = deps.concurrency ?? 6;

  // 1. Normalize everything first: an unmapped value aborts before any write.
  const normalized = normalizeDataset(deps.records);
  log(`Normalized ${normalized.length} free-exercise-db records.`);

  // 2. The bucket must exist and be public-read before anything is linked.
  await imageStore.ensurePublicBucket();

  // 3. Insert missing exercises by source id. Existing rows are untouched.
  const { count: inserted } = await prisma.exercise.createMany({
    data: normalized.map((n) => ({
      name: n.name,
      primaryMuscle: n.primaryMuscle,
      secondaryMuscles: n.secondaryMuscles,
      equipmentType: n.equipmentType,
      sourceId: n.sourceId,
      isCustom: false,
    })),
    skipDuplicates: true,
  });
  log(
    `Exercises: ${inserted} inserted, ${normalized.length - inserted} already present.`,
  );

  // 4. Images for imported rows that do not have one linked yet.
  const bySourceId = new Map<string, NormalizedExercise>(
    normalized.map((n) => [n.sourceId, n]),
  );
  const unlinked = await prisma.exercise.findMany({
    where: { isCustom: false, sourceId: { not: null }, imageRef: null },
    select: { id: true, sourceId: true },
  });

  const report: CatalogImportReport = {
    sourceRecords: normalized.length,
    inserted,
    alreadyPresent: normalized.length - inserted,
    imagesUploaded: 0,
    imagesAlreadyStored: 0,
    imagesLinked: 0,
    imagesMissingInSource: 0,
    imageFailures: [],
  };

  await runPool(unlinked, concurrency, async (row) => {
    const sourceId = row.sourceId as string;
    const source = bySourceId.get(sourceId);
    if (!source) return; // Imported from a different snapshot; leave it alone.
    if (!source.imageSourcePath) {
      report.imagesMissingInSource += 1;
      return;
    }
    const objectPath = importedImageObjectPath(sourceId);
    try {
      if (await imageStore.exists(objectPath)) {
        report.imagesAlreadyStored += 1;
      } else {
        const bytes = await imageSource.fetch(source.imageSourcePath);
        const outcome = await imageStore.upload(
          objectPath,
          bytes,
          "image/jpeg",
        );
        if (outcome === "uploaded") report.imagesUploaded += 1;
        else report.imagesAlreadyStored += 1;
      }
      const { count } = await prisma.exercise.updateMany({
        where: { id: row.id, isCustom: false, imageRef: null },
        data: { imageRef: objectPath },
      });
      report.imagesLinked += count;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      report.imageFailures.push({ sourceId, reason });
      log(`Image failed for ${sourceId}: ${reason}`);
    }
  });

  log(
    `Images: ${report.imagesUploaded} uploaded, ${report.imagesAlreadyStored} already stored, ` +
      `${report.imagesLinked} linked, ${report.imagesMissingInSource} have no source image, ` +
      `${report.imageFailures.length} failed.`,
  );
  return report;
}
