import { FEEDBACK_SCREENSHOT_MAX_FILE_BYTES } from "@overload/shared/feedback/attachment-validation";

/**
 * The feedback screenshot's preparation rules (Pitch 21j RD-10). The picked
 * image is re-encoded on the phone as a JPEG no larger than MAX_EDGE on its
 * longest side: an iPhone screenshot (a 2–4 MB PNG) then fits the server's
 * 3 MB limit, and re-encoding drops EXIF metadata, including location.
 */
export const MAX_EDGE = 2048;
export const JPEG_COMPRESS = 0.8;

/** The one resize to ask for, or null when the image already fits. */
export function resizeFor(
  width: number,
  height: number,
): { width: number } | { height: number } | null {
  if (width <= MAX_EDGE && height <= MAX_EDGE) return null;
  return width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE };
}

/** Whether the prepared file is small enough to send (the server checks too). */
export function fitsUpload(sizeBytes: number | null | undefined): boolean {
  return (
    typeof sizeBytes !== "number" ||
    sizeBytes <= FEEDBACK_SCREENSHOT_MAX_FILE_BYTES
  );
}

export const ATTACH_NOTE =
  "Optional. Screenshots can show your training and account details, so only attach what you're happy to share.";
export const ATTACH_FAILED = "That image couldn't be attached. Try another.";
