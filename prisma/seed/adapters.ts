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
      if (error && !/not.?found/i.test(error.message)) {
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
      const { data, error } = await supabase.storage
        .from(bucket)
        .exists(objectPath);
      if (error) {
        // storage-js reports a missing object as an error on some versions.
        if (/not.?found|400|404/i.test(error.message)) return false;
        throw new Error(`exists(${objectPath}) failed: ${error.message}`);
      }
      return Boolean(data);
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
      if (/already exists|duplicate|409/i.test(error.message)) {
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
