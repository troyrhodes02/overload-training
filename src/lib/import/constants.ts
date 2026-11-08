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

/** Largest single uploaded file, in bytes (10 MiB). Mirrors the size CHECK. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Largest combined upload across all parts, in bytes (25 MiB). */
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

/** Most pages a PDF part may have (server-checked). Mirrors the page CHECK. */
export const MAX_PDF_PAGES = 20;

/**
 * Image resize bounds for the extraction step (OVE-108): an uploaded image is
 * downscaled to fit within this range before bytes are sent to the provider.
 * Recorded here as the single source of truth; not applied in this foundation
 * slice (no provider call ships yet).
 */
export const IMAGE_RESIZE_MIN_PX = 2000;
export const IMAGE_RESIZE_MAX_PX = 2400;

/** Retention: unconfirmed import content is kept at most this long. */
export const RETENTION_HOURS = 24;

/** Parsed-output caps (enforced at review/confirm, OVE-106/107). */
export const MAX_DAYS = 14;
export const MAX_EXERCISES_PER_DAY = 20;
export const MAX_SETS_PER_EXERCISE = 15;

/**
 * The file content types the upload path accepts, after magic-byte sniffing.
 * HEIC/HEIF is accepted at the picker but converted (or cleanly refused) to one
 * of these before a part is committed; see storage.ts (conversion stubbed for
 * OVE-108). The browser picker also offers these plus HEIC/HEIF.
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
