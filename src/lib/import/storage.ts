import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  ACCEPTED_CONTENT_TYPES,
  MAX_FILE_BYTES,
  fileTooLargeMessage,
  contentTypeExtension,
  type AcceptedContentType,
} from "./constants";
import { ImageConversionError, normalizeImage } from "./image";
import { StorageUploadError } from "./errors";

/**
 * Workout Plan Import & Review (Pitch 22) — private source storage, mirroring
 * src/lib/feedback/screenshots.ts. The plan-import-sources bucket is PRIVATE
 * with no Storage policies (deny-all, like every app table), so only the service
 * role can write an upload or mint a read URL; there is never a public URL.
 * Nothing here touches an application table — the Supabase client is for auth
 * and Storage only.
 *
 * Object paths are owner-prefixed (`<userId>/<sessionId>/<partIndex>.<ext>`);
 * the caller builds the prefix from the session-derived account id, so this
 * module never handles the account id itself. The review source pane reads back
 * through short-lived signed URLs; the bucket is never public.
 *
 * Server-side the module validates MAGIC BYTES (the real file signature)
 * independently of any client-supplied MIME or filename, re-verifies size, and
 * deletes a rejected object. For images it then NORMALIZES (OVE-108): honor EXIF
 * orientation, strip EXIF/location, downscale to the longest-side bound,
 * re-encode, and convert HEIC/HEIF to an accepted MIME (or refuse cleanly) — see
 * normalizeForStorage() below. Only accepted post-conversion types (PDF, JPEG,
 * PNG, WebP) are ever stored, always under their ACTUAL encoded MIME.
 */

export const PLAN_IMPORT_SOURCE_BUCKET = "plan-import-sources";

/** Minted read URLs expire quickly: the lifter views, they do not get a link. */
const SIGNED_URL_TTL_SECONDS = 120;

function storageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Plan-import source storage is not configured.");
  }
  // Named so it is never the Data-API `supabase.from(...)` the scope guard bans.
  const service = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return service.storage.from(PLAN_IMPORT_SOURCE_BUCKET);
}

/**
 * The owner-prefixed key for one part of a session's source bundle. `ownerPrefix`
 * is the caller's session-derived account id (passed as account.userId by
 * sessions.ts) — this module never handles the account id by name, mirroring the
 * feedback screenshot store's `keyPrefix`.
 */
export function sourceObjectPath(
  ownerPrefix: string,
  sessionId: string,
  partIndex: number,
  contentType: string,
): string {
  return `${ownerPrefix}/${sessionId}/${partIndex}.${contentTypeExtension(contentType)}`;
}

export class SourceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceValidationError";
  }
}

/**
 * Sniff the file's real content type from its leading bytes, independent of any
 * client MIME or filename. Returns an accepted type, "heic" (needs conversion),
 * or null (unrecognized / unsupported / polyglot). A spoofed `.png` holding a
 * PDF is caught here.
 */
export function sniffContentType(
  bytes: Uint8Array,
): AcceptedContentType | "heic" | null {
  const b = bytes;
  // PDF: "%PDF"
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    return "application/pdf";
  }
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return "image/png";
  }
  // RIFF....WEBP (WebP) vs ISO-BMFF "ftyp" boxes (WebP is RIFF, HEIC is ftyp).
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return "image/webp";
  }
  // HEIC/HEIF: ISO-BMFF "ftyp" at offset 4 with a heic/heif/mif1/heix brand.
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(
      b[8] ?? 0,
      b[9] ?? 0,
      b[10] ?? 0,
      b[11] ?? 0,
    );
    if (["heic", "heix", "heif", "mif1", "hevc", "msf1"].includes(brand)) {
      return "heic";
    }
    return null;
  }
  return null;
}

export type NormalizedSource = {
  bytes: Uint8Array;
  /** The content type AFTER any conversion — this is what is stored. */
  contentType: AcceptedContentType;
};

/**
 * Validate and normalize an uploaded file's bytes for storage:
 *  - sniff the real type from magic bytes (ignore client MIME/filename);
 *  - re-verify size against the per-file cap server-side;
 *  - for images: honor EXIF orientation, strip EXIF/location, downscale to the
 *    longest-side bound, re-encode, and convert HEIC/HEIF to an accepted MIME —
 *    or cleanly refuse if the photo can't be decoded;
 *  - PDFs pass through unchanged (page/encryption checks live in sessions.ts).
 *
 * The returned `contentType` is always the ACTUAL post-normalization type, so a
 * JPEG is never labelled HEIC or PNG. This runs server-side even when the client
 * pre-processed an image: every constraint (type, size) is re-verified here.
 *
 * Async because image decoding/re-encoding is async. HEIC conversion and the
 * EXIF strip live in ./image (the one place `sharp`/`heic-convert` are used).
 */
export async function normalizeForStorage(input: {
  bytes: Uint8Array;
  sizeBytes: number;
}): Promise<NormalizedSource> {
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_FILE_BYTES) {
    throw new SourceValidationError(fileTooLargeMessage());
  }
  if (input.bytes.byteLength !== input.sizeBytes) {
    throw new SourceValidationError(
      "We couldn't read this file. Try choosing it again.",
    );
  }
  const sniffed = sniffContentType(input.bytes);
  if (sniffed === null) {
    throw new SourceValidationError(
      "This file type isn't supported. Upload a PDF or a JPEG, PNG, WebP, or HEIC image.",
    );
  }

  // PDFs are stored as-is; the intake path inspects them separately.
  if (sniffed === "application/pdf") {
    return { bytes: input.bytes, contentType: "application/pdf" };
  }

  // Images (jpeg/png/webp/heic): normalize. HEIC that can't be decoded, or any
  // image that can't be processed, becomes a clean SourceValidationError.
  if (
    sniffed === "heic" ||
    sniffed === "image/jpeg" ||
    sniffed === "image/png" ||
    sniffed === "image/webp"
  ) {
    let normalized;
    try {
      normalized = await normalizeImage(input.bytes, sniffed);
    } catch (error) {
      if (error instanceof ImageConversionError) {
        throw new SourceValidationError(error.message);
      }
      throw error;
    }
    // The re-encoded output must be larger than zero and within the per-file cap
    // (re-encoding can grow a tiny source; a normalized image over the cap is a
    // clean refusal, never a stored oversize object).
    if (
      normalized.bytes.byteLength <= 0 ||
      normalized.bytes.byteLength > MAX_FILE_BYTES
    ) {
      throw new SourceValidationError(
        `This image is too large. Choose a file under ${MAX_FILE_BYTES / (1024 * 1024)} MB.`,
      );
    }
    return { bytes: normalized.bytes, contentType: normalized.contentType };
  }

  // Defensive: a sniffed type that is neither PDF nor a known image is refused.
  if (!(ACCEPTED_CONTENT_TYPES as readonly string[]).includes(sniffed)) {
    throw new SourceValidationError(
      "This file type isn't supported. Upload a PDF or a JPEG, PNG, WebP, or HEIC image.",
    );
  }
  return { bytes: input.bytes, contentType: sniffed };
}

/**
 * Upload one validated, normalized part to the private bucket at `objectPath`.
 * On any failure the object is removed best-effort and the error rethrown, so a
 * rejected or half-written object never lingers.
 */
export async function uploadSourceObject(
  objectPath: string,
  normalized: NormalizedSource,
): Promise<void> {
  const bucket = storageClient();
  const { error } = await bucket.upload(objectPath, normalized.bytes, {
    contentType: normalized.contentType,
    upsert: false,
    cacheControl: "3600",
  });
  if (error) {
    await removeSourceObjects([objectPath]);
    // Typed so the action reports "couldn't be uploaded", never an AI error.
    throw new StorageUploadError(error.message);
  }
}

/**
 * Download one stored source object's raw bytes (server-side only), for the
 * extraction path to feed a PDF/image to the provider or to read a PDF's text
 * layer. Never mints a public URL and never returns a signed URL to a client —
 * the bytes stay on the server. Returns null when the object can't be read.
 */
export async function downloadSourceObject(
  objectPath: string,
): Promise<Uint8Array | null> {
  const { data, error } = await storageClient().download(objectPath);
  if (error || !data) return null;
  const buffer = await data.arrayBuffer();
  return new Uint8Array(buffer);
}

/** Remove stored source objects by path. Best-effort: failures are swallowed. */
export async function removeSourceObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await storageClient().remove(paths);
  } catch {
    // Orphaned objects are a cleanup concern, never a correctness one.
  }
}

/**
 * Short-lived signed READ URLs for the review source pane, by object path. A
 * path that cannot be signed maps to null (shown as unavailable), never an
 * error that breaks the page. No public URL is ever minted.
 */
export async function signSourceReadUrls(
  paths: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (paths.length === 0) return out;
  for (const path of paths) out.set(path, null);
  try {
    const { data } = await storageClient().createSignedUrls(
      paths,
      SIGNED_URL_TTL_SECONDS,
    );
    for (const row of data ?? []) {
      if (row.path && !row.error) out.set(row.path, row.signedUrl);
    }
  } catch {
    // Storage unavailable/unconfigured: every path stays null (shown as
    // unavailable). Never throw — a signing blip must not break the review page.
  }
  return out;
}
