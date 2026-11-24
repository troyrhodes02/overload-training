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

export type ScreenshotType = (typeof FEEDBACK_SCREENSHOT_TYPES)[number];

/**
 * The image type a file's BYTES say it is (Pitch 21j RD-11; mobile audit
 * F-A15), or null when they are none of the accepted types. A declared
 * content type is a claim; the magic bytes are the fact:
 *   PNG  89 50 4E 47 0D 0A 1A 0A
 *   JPEG FF D8 FF
 *   WebP "RIFF" <4 bytes> "WEBP"
 */
export function sniffImageType(bytes: Uint8Array): ScreenshotType | null {
  const at = (i: number) => bytes[i];
  const ascii = (from: number, text: string) =>
    [...text].every((c, i) => at(from + i) === c.charCodeAt(0));
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (b, i) => at(i) === b,
    )
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 12 && ascii(0, "RIFF") && ascii(8, "WEBP")) {
    return "image/webp";
  }
  return null;
}

/** The message when a file's bytes don't match an accepted type. */
export const SCREENSHOT_TYPE_ERROR = "Screenshots must be PNG, JPEG, or WebP.";
