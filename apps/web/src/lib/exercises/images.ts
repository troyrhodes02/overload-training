/**
 * Exercise images live in Overload's own Supabase Storage bucket, copied there
 * once by the catalog import (spec D14/D15). The bucket is public-read and is
 * written only by the import; the app only builds read URLs. Custom exercises
 * have no image.
 *
 * Pure module (no server-only import): the public URL uses the public Supabase
 * URL, which is safe to ship to the browser.
 */
export const EXERCISE_IMAGE_BUCKET = "exercise-images";

/** Public read URL for a stored image, or null when the exercise has none. */
export function exerciseImageUrl(
  imageRef: string | null,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  if (!imageRef || !supabaseUrl) return null;
  const base = supabaseUrl.replace(/\/+$/, "");
  const objectPath = imageRef.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${EXERCISE_IMAGE_BUCKET}/${objectPath}`;
}
