/**
 * Feedback screenshot rules (Admin Center & Feedback). Pure and client-safe:
 * the picker shows the same limits the server enforces, and the database CHECK
 * backs the per-file type and size. Screenshots are optional; a message with
 * none is valid.
 *
 * The caps are deliberately conservative: screenshots upload through a server
 * action, whose whole request body must stay under the hosting limit, so the
 * total across a submission is capped below the per-file count times the
 * per-file size.
 */

/** Most screenshots one message may carry. Mirrors the position CHECK (0..3). */
export const FEEDBACK_SCREENSHOT_MAX_COUNT = 4;

/** Largest single screenshot, in bytes (3 MB). Mirrors the size CHECK. */
export const FEEDBACK_SCREENSHOT_MAX_FILE_BYTES = 3_000_000;

/** Largest combined screenshot payload per submission, in bytes (4 MB). */
export const FEEDBACK_SCREENSHOT_MAX_TOTAL_BYTES = 4_000_000;

/** The image types accepted. Mirrors the content_type CHECK. */
export const FEEDBACK_SCREENSHOT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type ScreenshotMeta = { name: string; type: string; size: number };

function mb(bytes: number): string {
  return `${Math.round(bytes / 100_000) / 10} MB`;
}

/**
 * Validate the chosen screenshots as a set. Empty is valid (optional). Returns
 * the first problem found so the form can show one clear message.
 */
export function validateScreenshots(
  files: ScreenshotMeta[],
): { ok: true } | { ok: false; error: string } {
  if (files.length === 0) return { ok: true };
  if (files.length > FEEDBACK_SCREENSHOT_MAX_COUNT) {
    return {
      ok: false,
      error: `Attach at most ${FEEDBACK_SCREENSHOT_MAX_COUNT} screenshots.`,
    };
  }
  let total = 0;
  for (const f of files) {
    if (!(FEEDBACK_SCREENSHOT_TYPES as readonly string[]).includes(f.type)) {
      return { ok: false, error: "Screenshots must be PNG, JPEG, or WebP." };
    }
    if (f.size > FEEDBACK_SCREENSHOT_MAX_FILE_BYTES) {
      return {
        ok: false,
        error: `Each screenshot must be under ${mb(FEEDBACK_SCREENSHOT_MAX_FILE_BYTES)}.`,
      };
    }
    total += f.size;
  }
  if (total > FEEDBACK_SCREENSHOT_MAX_TOTAL_BYTES) {
    return {
      ok: false,
      error: `Keep the screenshots under ${mb(FEEDBACK_SCREENSHOT_MAX_TOTAL_BYTES)} in total.`,
    };
  }
  return { ok: true };
}

/** The object-path file extension for a stored screenshot's content type. */
export function screenshotExtension(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}
