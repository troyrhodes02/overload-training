/**
 * Workout Plan Import & Review (Pitch 22) — the caps that bound an import.
 *
 * Pure and client-safe: the source-intake UI shows the same limits the server
 * enforces, and the database CHECK constraints (9l_plan_import) back the
 * durable ones (text length, file size, page count). These are the named
 * constants spec section 12 / RD-12 adopts; a durable subset is also recorded
 * in docs/planning/method-note.md for later pitches that consume them.
 *
 * Nothing here is a magic number inlined elsewhere: storage.ts, usage.ts, the
 * server actions, and the migration all read from this one place.
 */

/** Pasted/typed plan text: trimmed non-empty, at most this many characters. */
export const MAX_TEXT_CHARS = 20_000;

/** Started import attempts per account per day (account-local calendar day). */
export const MAX_IMPORTS_PER_DAY = 5;

/** Most parts (files, or a single text part) in one source bundle. */
export const MAX_PARTS = 5;

/**
 * Largest single uploaded file, in bytes (4 MiB) — OVE-139 / audit F-A3.
 *
 * Each file travels in ONE request: the commit-part server action's FormData
 * body. Vercel caps a function's request body at 4.5 MB, and next.config sets
 * the server-action body limit to 5 MB, so a file much over 4 MB never reaches
 * the server and the lifter saw a generic failure. 4 MiB plus the multipart
 * overhead stays under both. (The database CHECK still allows up to 10 MiB, so
 * no migration is needed to lower the app limit.)
 */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

/** Largest combined upload across all parts: every part at the per-file cap. */
export const MAX_TOTAL_BYTES = MAX_PARTS * MAX_FILE_BYTES;

/** "4 MB" — the per-file cap as the lifter reads it. */
export const MAX_FILE_LABEL = `${MAX_FILE_BYTES / (1024 * 1024)} MB`;

/** The one message for a file over the cap, naming the file and the limit. */
export function fileTooLargeMessage(fileName?: string): string {
  const subject = fileName
    ? `"${fileName}" is too large`
    : "This file is too large";
  return `${subject}. Files can be up to ${MAX_FILE_LABEL} each — try a smaller PDF or a photo of each page.`;
}

/** Most pages a PDF part may have (server-checked). Mirrors the page CHECK. */
export const MAX_PDF_PAGES = 20;

/**
 * Image resize ceiling for the extraction step (OVE-108): an uploaded image is
 * downscaled so its LONGEST side is at most this many pixels before bytes are
 * sent to the provider, never enlarging a smaller image (see image.ts). There is
 * no lower bound — a small source is sent as-is — so only the ceiling is a named
 * constant here (the earlier 2000px floor from RD-12 was never used and is
 * dropped; see spec RD-16).
 */
export const IMAGE_RESIZE_MAX_PX = 2400;

/** Retention: unconfirmed import content is kept at most this long. */
export const RETENTION_HOURS = 24;

/** Parsed-output caps (enforced at review/confirm, OVE-106/107). */
export const MAX_DAYS = 14;
export const MAX_EXERCISES_PER_DAY = 20;
export const MAX_SETS_PER_EXERCISE = 15;

/**
 * The file content types the upload path accepts, after magic-byte sniffing.
 * HEIC/HEIF is accepted at the picker but converted to one of these (to JPEG via
 * the decoder in image.ts, shipped in OVE-108), or cleanly refused, before a
 * part is committed; see storage.ts. The browser picker also offers these plus
 * HEIC/HEIF.
 */
export const ACCEPTED_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AcceptedContentType = (typeof ACCEPTED_CONTENT_TYPES)[number];

/** The `accept` attribute for the upload dropzone (includes HEIC/HEIF). */
export const UPLOAD_ACCEPT_ATTR =
  "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

/** The object-path file extension for an accepted (post-conversion) type. */
export function contentTypeExtension(contentType: string): string {
  switch (contentType) {
    case "application/pdf":
      return "pdf";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
    default:
      return "bin";
  }
}
