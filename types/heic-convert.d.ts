/**
 * Ambient types for `heic-convert` (OVE-108). The package ships no types; this
 * declares only the server-side Node entrypoint and the single call shape the
 * import image pipeline uses (decode one HEIC/HEIF buffer to JPEG or PNG bytes).
 */
declare module "heic-convert" {
  interface HeicConvertOptions {
    /** The HEIC/HEIF input bytes. */
    buffer: Buffer | Uint8Array | ArrayBuffer;
    /** Target raster format. */
    format: "JPEG" | "PNG";
    /** JPEG quality in [0, 1]; ignored for PNG. */
    quality?: number;
  }
  /** Decode a single HEIC/HEIF image to the requested raster format. */
  function convert(options: HeicConvertOptions): Promise<ArrayBuffer>;
  export = convert;
}
