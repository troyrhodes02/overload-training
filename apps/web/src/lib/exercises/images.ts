import { buildExerciseImageUrl } from "@overload/shared/exercises/images";

export { EXERCISE_IMAGE_BUCKET } from "@overload/shared/exercises/images";

/**
 * Public read URL for a stored exercise image, or null when the exercise has
 * none. The URL builder is shared (Pitch 21b); the web's default base is the
 * public Supabase URL, which is safe to ship to the browser.
 */
export function exerciseImageUrl(
  imageRef: string | null,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  return buildExerciseImageUrl(imageRef, supabaseUrl);
}
