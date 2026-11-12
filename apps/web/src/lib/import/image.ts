import "server-only";
import sharp from "sharp";
import heicConvert from "heic-convert";
import { IMAGE_RESIZE_MAX_PX } from "./constants";

/**
 * Workout Plan Import & Review (Pitch 22, OVE-108) — server-side image
 * normalization (spec §10, blueprint §3.2). This is the real work behind the
 * storage seam: it honors EXIF orientation, STRIPS all metadata (including
 * location), downscales to the longest-side bound, re-encodes to an accepted
 * raster MIME, and converts HEIC/HEIF to that MIME. It NEVER mislabels the
 * result — the returned `contentType` is always the actual encoded format.
 *
 * It runs only on the server (the private-bucket store and the extraction path
 * both call it there). `sharp` ships a native binary and `heic-convert` pulls a
 * WASM libheif; both are declared `serverExternalPackages` so Next never bundles
 * them. storage.ts (the only caller) is `server-only`, so nothing here can reach
 * the client bundle.
 *
 * Why two dependencies: `sharp`'s bundled libheif has no HEVC decoder (the
 * format real iPhone HEIC photos use), so `sharp` alone cannot read them.
 * `heic-convert` (WASM libheif with the HEVC decoder) decodes the HEIC to a JPEG
 * buffer, which `sharp` then orients/strips/resizes/re-encodes like any other
 * image. If decoding fails, the caller refuses cleanly — a HEIC is never stored
 * unconverted.
 */

/** The raster MIME types normalization can emit (never PDF, never HEIC). */
export type NormalizedImageMime = "image/jpeg" | "image/png" | "image/webp";

export type NormalizedImage = {
  bytes: Uint8Array;
  /** The ACTUAL encoded MIME of `bytes` — never a guess, never the input MIME. */
  contentType: NormalizedImageMime;
};

export class ImageConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageConversionError";
  }
}

/**
 * JPEG re-encode quality for photos/screenshots. High enough that small text in
 * a plan screenshot stays legible to the vision model, low enough to keep the
 * part well under the per-file cap after downscaling.
 */
const JPEG_QUALITY = 85;
const WEBP_QUALITY = 85;

/**
 * Decode HEIC/HEIF bytes to a JPEG buffer via libheif (HEVC-capable). Throws
 * `ImageConversionError` on any decode failure so the caller can refuse cleanly
 * rather than store an unreadable source.
 */
async function decodeHeicToJpeg(bytes: Uint8Array): Promise<Buffer> {
  try {
    const out = await heicConvert({
      buffer: bytes,
      format: "JPEG",
      quality: JPEG_QUALITY / 100,
    });
    return Buffer.from(out);
  } catch {
    // Never surface the decoder's message (it can echo source bytes/metadata).
    throw new ImageConversionError(
      "That photo format couldn't be read. Save it as JPG, PNG, or a PDF.",
    );
  }
}

/**
 * Map the sniffed image kind to the accepted output MIME. HEIC/HEIF and JPEG
 * round-trip to JPEG; PNG stays PNG (lossless — often a sharp screenshot);
 * WebP stays WebP. Choosing the output here keeps the "never mislabel" rule in
 * one place.
 */
function outputFormatFor(
  sniffed: "image/jpeg" | "image/png" | "image/webp" | "heic",
): NormalizedImageMime {
  switch (sniffed) {
    case "image/png":
      return "image/png";
    case "image/webp":
      return "image/webp";
    case "image/jpeg":
    case "heic":
      return "image/jpeg";
  }
}

/**
 * Normalize one image for storage and the provider:
 *  1. HEIC/HEIF → decode to JPEG bytes (libheif); other rasters pass through.
 *  2. `.rotate()` with no argument BAKES EXIF orientation into the pixels so the
 *     image is upright regardless of how the camera tagged it.
 *  3. Resize so the LONGEST side is at most IMAGE_RESIZE_MAX_PX, never enlarging
 *     a smaller image.
 *  4. Re-encode to the accepted output MIME. sharp drops all input metadata by
 *     default (no `.withMetadata()`), so EXIF — including GPS/location — is
 *     stripped.
 *
 * Returns the bytes and their ACTUAL encoded MIME.
 */
export async function normalizeImage(
  bytes: Uint8Array,
  sniffed: "image/jpeg" | "image/png" | "image/webp" | "heic",
): Promise<NormalizedImage> {
  const input =
    sniffed === "heic" ? await decodeHeicToJpeg(bytes) : Buffer.from(bytes);
  const outputMime = outputFormatFor(sniffed);

  let pipeline = sharp(input, { failOn: "error" })
    // Apply the camera's EXIF orientation to the pixels, then (because no
    // metadata is carried forward) strip it along with everything else.
    .rotate()
    .resize({
      width: IMAGE_RESIZE_MAX_PX,
      height: IMAGE_RESIZE_MAX_PX,
      fit: "inside",
      withoutEnlargement: true,
    });

  if (outputMime === "image/png") {
    pipeline = pipeline.png();
  } else if (outputMime === "image/webp") {
    pipeline = pipeline.webp({ quality: WEBP_QUALITY });
  } else {
    pipeline = pipeline.jpeg({ quality: JPEG_QUALITY });
  }

  let out: Buffer;
  try {
    out = await pipeline.toBuffer();
  } catch {
    throw new ImageConversionError(
      "That image couldn't be processed. Save it as JPG, PNG, or a PDF.",
    );
  }
  return { bytes: new Uint8Array(out), contentType: outputMime };
}
