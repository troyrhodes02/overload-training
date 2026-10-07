/**
 * Production adapters for the catalog import: Supabase Storage (service-role,
 * import process only) and the pinned free-exercise-db image source.
 *
 * The service-role key is read by the import CLI from the operator's shell.
 * It is never referenced under src/, never set in Vercel, and never shipped
 * to a browser.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { EXERCISE_IMAGE_BUCKET } from "../../src/lib/exercises/images";
import type { ExerciseImageSource, ExerciseImageStore } from "./catalog-import";
import { sourceImageUrl } from "./free-exercise-db/source";

/** HTTP status carried by a storage-js error (`status`, or `statusCode` on older shapes). */
export function storageErrorStatus(error: unknown): number | undefined {
  const e = error as { status?: unknown; statusCode?: unknown } | null;
  const raw = e?.status ?? e?.statusCode;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function supabaseImageStore(
  supabase: SupabaseClient,
  bucket: string = EXERCISE_IMAGE_BUCKET,
): ExerciseImageStore {
  return {
    async ensurePublicBucket() {
      const { data, error } = await supabase.storage.getBucket(bucket);
      if (data) {
        if (!data.public) {
          throw new Error(
            `Storage bucket "${bucket}" exists but is PRIVATE. The exercise-image bucket must be public-read ` +
              "(spec D15). Fix the bucket deliberately; the import never flips its posture.",
          );
        }
        return;
      }
      const status = storageErrorStatus(error);
      const missing =
        status === 400 ||
        status === 404 ||
        /not.?found/i.test(error?.message ?? "");
      if (error && !missing) {
        throw new Error(
          `Could not read Storage bucket "${bucket}": ${error.message}`,
        );
      }
      const created = await supabase.storage.createBucket(bucket, {
        public: true,
        allowedMimeTypes: ["image/jpeg"],
        fileSizeLimit: "1MB",
      });
      if (created.error) {
        throw new Error(
          `Could not create Storage bucket "${bucket}": ${created.error.message}`,
        );
      }
    },

    async exists(objectPath) {
      // storage-js resolves { data: true } when the object exists and
      // { data: false, error } for a 400/404 (missing); any other failure is
      // thrown, and the import records it as an image failure.
      const { data } = await supabase.storage.from(bucket).exists(objectPath);
      return data === true;
    },

    async upload(objectPath, bytes, contentType) {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(objectPath, bytes, {
          contentType,
          upsert: false,
          cacheControl: "31536000",
        });
      if (!error) return "uploaded";
      if (
        storageErrorStatus(error) === 409 ||
        /already exists|duplicate/i.test(error.message)
      ) {
        return "already_exists";
      }
      throw new Error(`upload(${objectPath}) failed: ${error.message}`);
    },
  };
}

export function githubImageSource(): ExerciseImageSource {
  return {
    async fetch(sourceImagePath) {
      const response = await fetch(sourceImageUrl(sourceImagePath));
      if (!response.ok) {
        throw new Error(
          `GET ${sourceImagePath} → HTTP ${response.status} ${response.statusText}`,
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    },
  };
}
