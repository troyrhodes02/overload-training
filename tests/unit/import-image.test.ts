import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  normalizeImage,
  ImageConversionError,
  type NormalizedImageMime,
} from "@/lib/import/image";
import {
  normalizeForStorage,
  sniffContentType,
  SourceValidationError,
} from "@/lib/import/storage";
import { IMAGE_RESIZE_MAX_PX } from "@/lib/import/constants";

/**
 * Workout Plan Import & Review (OVE-108) — server-side image normalization.
 * Proves the real work behind the storage seam: EXIF orientation is applied to
 * the pixels then STRIPPED (location with it), images downscale to the
 * longest-side bound and re-encode to the ACTUAL MIME (never mislabelled), and
 * HEIC/HEIF converts to an accepted MIME or is cleanly refused.
 *
 * JPEG/PNG/WebP fixtures are built in-process (sharp can encode them). The HEIC
 * conversion fixture is a small real HEVC-HEIC checked in at
 * tests/fixtures/images/sample.heic, because a real HEVC-HEIC can't be
 * generated in-process (the sharp build encodes only AV1/AVIF HEIF). No real
 * provider call is made anywhere here.
 */

const HEIC_FIXTURE = join(__dirname, "..", "fixtures", "images", "sample.heic");

/** A solid-color raster at the given dims, in the given format. */
async function makeImage(
  width: number,
  height: number,
  format: "jpeg" | "png" | "webp",
  opts?: { orientation?: number },
): Promise<Buffer> {
  let p = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 180, g: 90, b: 40 },
    },
  });
  if (opts?.orientation != null) {
    p = p.withMetadata({ orientation: opts.orientation });
  }
  if (format === "jpeg") return p.jpeg().toBuffer();
  if (format === "png") return p.png().toBuffer();
  return p.webp().toBuffer();
}

const sniffedMime = (b: Uint8Array) =>
  sniffContentType(b) as
    "image/jpeg" | "image/png" | "image/webp" | "heic" | null;

describe("normalizeImage — orientation", () => {
  it("bakes EXIF orientation into the pixels (90° swaps dimensions)", async () => {
    // A 120x40 landscape tagged orientation=6 (rotate 90° CW) is upright 40x120.
    const tagged = await makeImage(120, 40, "jpeg", { orientation: 6 });
    const before = await sharp(tagged).metadata();
    expect(before.width).toBe(120);
    expect(before.height).toBe(40);
    expect(before.orientation).toBe(6);

    const out = await normalizeImage(new Uint8Array(tagged), "image/jpeg");
    const after = await sharp(Buffer.from(out.bytes)).metadata();
    // Pixels are physically rotated: dimensions are swapped.
    expect(after.width).toBe(40);
    expect(after.height).toBe(120);
  });

  it("strips EXIF/orientation metadata from the output", async () => {
    const tagged = await makeImage(80, 60, "jpeg", { orientation: 6 });
    const out = await normalizeImage(new Uint8Array(tagged), "image/jpeg");
    const after = await sharp(Buffer.from(out.bytes)).metadata();
    // No EXIF block survives (location lives in EXIF too), and no residual
    // orientation tag remains to be re-applied by a viewer.
    expect(after.exif).toBeUndefined();
    expect(after.orientation).toBeUndefined();
  });
});

describe("normalizeImage — resize + re-encode", () => {
  it("downscales an oversized image to the longest-side bound", async () => {
    const big = await makeImage(4000, 3000, "jpeg");
    const out = await normalizeImage(new Uint8Array(big), "image/jpeg");
    const after = await sharp(Buffer.from(out.bytes)).metadata();
    expect(Math.max(after.width!, after.height!)).toBeLessThanOrEqual(
      IMAGE_RESIZE_MAX_PX,
    );
    // Aspect ratio preserved (4:3 → width is the long side).
    expect(after.width).toBe(IMAGE_RESIZE_MAX_PX);
  });

  it("never enlarges a small image", async () => {
    const small = await makeImage(300, 200, "png");
    const out = await normalizeImage(new Uint8Array(small), "image/png");
    const after = await sharp(Buffer.from(out.bytes)).metadata();
    expect(after.width).toBe(300);
    expect(after.height).toBe(200);
  });

  it.each<[NormalizedImageMime, "jpeg" | "png" | "webp", string]>([
    ["image/jpeg", "jpeg", "jpeg"],
    ["image/png", "png", "png"],
    ["image/webp", "webp", "webp"],
  ])(
    "re-encodes %s to its own format and reports the ACTUAL mime",
    async (mime, srcFormat, outFormat) => {
      const img = await makeImage(500, 400, srcFormat);
      const sniff = sniffedMime(new Uint8Array(img));
      expect(sniff).not.toBeNull();
      const out = await normalizeImage(new Uint8Array(img), sniff!);
      expect(out.contentType).toBe(mime);
      const after = await sharp(Buffer.from(out.bytes)).metadata();
      expect(after.format).toBe(outFormat);
      // The returned mime matches what the bytes actually are (never a label).
      expect(sniffedMime(out.bytes)).toBe(mime);
    },
  );
});

describe("normalizeImage — HEIC/HEIF conversion", () => {
  it("converts a real HEIC to JPEG and reports image/jpeg", async () => {
    const heic = new Uint8Array(readFileSync(HEIC_FIXTURE));
    // The fixture really is HEIC (not mislabelled as something sharp decodes).
    expect(sniffContentType(heic)).toBe("heic");

    const out = await normalizeImage(heic, "heic");
    // Converted MIME is the ACTUAL output, never "heic".
    expect(out.contentType).toBe("image/jpeg");
    expect(sniffedMime(out.bytes)).toBe("image/jpeg");

    const after = await sharp(Buffer.from(out.bytes)).metadata();
    expect(after.format).toBe("jpeg");
    expect(Math.max(after.width!, after.height!)).toBeLessThanOrEqual(
      IMAGE_RESIZE_MAX_PX,
    );
    expect(after.exif).toBeUndefined();
  });

  it("cleanly refuses an undecodable HEIC (never stores it unconverted)", async () => {
    // HEIC magic bytes but no decodable payload: refusal, not a stored source.
    const fakeHeic = new Uint8Array([
      0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0,
    ]);
    expect(sniffContentType(fakeHeic)).toBe("heic");
    await expect(normalizeImage(fakeHeic, "heic")).rejects.toThrow(
      ImageConversionError,
    );
  });

  it("cleanly refuses undecodable image bytes", async () => {
    const garbage = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]);
    await expect(normalizeImage(garbage, "image/jpeg")).rejects.toThrow(
      ImageConversionError,
    );
  });
});

describe("normalizeForStorage — magic-byte routing through the real pipeline", () => {
  it("a spoofed PNG that is really a JPEG is normalized by its real type", async () => {
    // Client may claim PNG; magic bytes say JPEG, so the output is JPEG.
    const jpeg = await makeImage(600, 400, "jpeg");
    const out = await normalizeForStorage({
      bytes: new Uint8Array(jpeg),
      sizeBytes: jpeg.byteLength,
    });
    expect(out.contentType).toBe("image/jpeg");
    expect(sniffedMime(out.bytes)).toBe("image/jpeg");
  });

  it("a PNG screenshot normalizes to PNG with EXIF-free output", async () => {
    const png = await makeImage(900, 1600, "png");
    const out = await normalizeForStorage({
      bytes: new Uint8Array(png),
      sizeBytes: png.byteLength,
    });
    expect(out.contentType).toBe("image/png");
    const after = await sharp(Buffer.from(out.bytes)).metadata();
    expect(after.exif).toBeUndefined();
    expect(Math.max(after.width!, after.height!)).toBeLessThanOrEqual(
      IMAGE_RESIZE_MAX_PX,
    );
  });

  it("a real HEIC uploads as a converted JPEG part", async () => {
    const heic = new Uint8Array(readFileSync(HEIC_FIXTURE));
    const out = await normalizeForStorage({
      bytes: heic,
      sizeBytes: heic.byteLength,
    });
    expect(out.contentType).toBe("image/jpeg");
    expect(sniffedMime(out.bytes)).toBe("image/jpeg");
  });

  it("a spoofed image (really a GIF) is refused by magic bytes", async () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0]);
    await expect(
      normalizeForStorage({ bytes: gif, sizeBytes: gif.byteLength }),
    ).rejects.toThrow(SourceValidationError);
  });

  it("an undecodable HEIC is a clean SourceValidationError, not a crash", async () => {
    const fakeHeic = new Uint8Array([
      0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0,
    ]);
    await expect(
      normalizeForStorage({ bytes: fakeHeic, sizeBytes: fakeHeic.byteLength }),
    ).rejects.toThrow(SourceValidationError);
  });

  it("a PDF is not image-processed and passes through", async () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    const out = await normalizeForStorage({
      bytes: pdf,
      sizeBytes: pdf.byteLength,
    });
    expect(out.contentType).toBe("application/pdf");
    expect(out.bytes).toBe(pdf);
  });
});
