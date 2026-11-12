import {
  inspectPdf,
  isTextLayerDefensible,
  PdfValidationError,
} from "@/lib/import/pdf";
import { MAX_PDF_PAGES } from "@/lib/import/constants";

/**
 * Workout Plan Import & Review (OVE-107) — the server-side PDF seam. NO provider
 * call and NO storage: pdfjs reads page count + per-page text layer from raw
 * bytes, and refuses encrypted / malformed / over-cap PDFs with a TYPED error
 * before anything downstream runs. The text-layer-vs-vision routing is a pure
 * function tested here too.
 *
 * Fixtures are built in-process so a "clean" PDF has a real text layer and a
 * "scanned" (image-only) PDF has none, without shipping binary blobs. Real
 * scanned-PDF accuracy is owner-gated and reported UNVERIFIED, never asserted.
 */

/**
 * Build a minimal valid PDF with one text-bearing page per entry. Each page is a
 * set of lines emitted as separate Tj runs with a correct stream /Length so the
 * full text layer extracts (a single very long run gets truncated by pdfjs).
 */
function buildTextPdf(pageLineSets: string[][]): Uint8Array {
  const kids: string[] = [];
  const objs: { n: number; body: string }[] = [];
  let objNum = 3; // 1 = catalog, 2 = pages
  for (const lines of pageLineSets) {
    const contentNum = objNum++;
    const pageNum = objNum++;
    const fontNum = objNum++;
    kids.push(`${pageNum} 0 R`);
    const stream = lines
      .map((t, i) => `BT /F1 12 Tf 20 ${260 - i * 16} Td (${t}) Tj ET`)
      .join("\n");
    objs.push({
      n: contentNum,
      body: `<</Length ${Buffer.byteLength(stream)}>>stream\n${stream}\nendstream`,
    });
    objs.push({
      n: pageNum,
      body: `<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]/Contents ${contentNum} 0 R/Resources<</Font<</F1 ${fontNum} 0 R>>>>>>`,
    });
    objs.push({
      n: fontNum,
      body: `<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>`,
    });
  }
  let out = `%PDF-1.4\n`;
  out += `1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n`;
  out += `2 0 obj<</Type/Pages/Kids[${kids.join(" ")}]/Count ${pageLineSets.length}>>endobj\n`;
  for (const o of objs) out += `${o.n} 0 obj${o.body}endobj\n`;
  out += `trailer<</Root 1 0 R>>\n%%EOF`;
  return new Uint8Array(Buffer.from(out));
}

/** An image-only page (no text layer) — stands in for a scanned page. */
function buildImageOnlyPdf(pageCount: number): Uint8Array {
  const kids: string[] = [];
  const objs: { n: number; body: string }[] = [];
  let objNum = 3;
  for (let i = 0; i < pageCount; i++) {
    const pageNum = objNum++;
    kids.push(`${pageNum} 0 R`);
    objs.push({
      n: pageNum,
      body: `<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>`,
    });
  }
  let out = `%PDF-1.4\n`;
  out += `1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n`;
  out += `2 0 obj<</Type/Pages/Kids[${kids.join(" ")}]/Count ${pageCount}>>endobj\n`;
  for (const o of objs) out += `${o.n} 0 obj${o.body}endobj\n`;
  out += `trailer<</Root 1 0 R>>\n%%EOF`;
  return new Uint8Array(Buffer.from(out));
}

describe("inspectPdf — page count and text layer", () => {
  it("reads the page count and per-page text from a clean text PDF", async () => {
    const pdf = buildTextPdf([
      ["Push Day", "Bench Press three by eight", "Overhead Press"],
      ["Pull Day", "Barbell Row four by twelve", "Deadlift"],
    ]);
    const out = await inspectPdf(pdf);
    expect(out.pageCount).toBe(2);
    expect(out.pages).toHaveLength(2);
    expect(out.pages[0]).toContain("Bench Press");
    expect(out.pages[1]).toContain("Barbell Row");
  });

  it("returns empty text for an image-only (scanned) page, never a guess", async () => {
    const pdf = buildImageOnlyPdf(1);
    const out = await inspectPdf(pdf);
    expect(out.pageCount).toBe(1);
    expect(out.pages).toEqual([""]);
  });

  it("does not detach the caller's bytes (vision path still gets them)", async () => {
    const pdf = buildTextPdf([
      ["A workout plan", "with enough text here", "to be defensible"],
    ]);
    const before = pdf.byteLength;
    await inspectPdf(pdf);
    // The original buffer is untouched — inspect copies before handing to pdfjs.
    expect(pdf.byteLength).toBe(before);
    expect(pdf[0]).toBe(0x25); // still "%"
  });
});

describe("inspectPdf — refusals before any provider call", () => {
  it("refuses a malformed / non-PDF byte stream as 'malformed'", async () => {
    const garbage = new Uint8Array(
      Buffer.from("%PDF-1.4\nnot a real pdf\n%%EOF"),
    );
    await expect(inspectPdf(garbage)).rejects.toMatchObject({
      name: "PdfValidationError",
      reason: "malformed",
    });
  });

  it("refuses a polyglot (a PDF header on non-PDF bytes) as 'malformed'", async () => {
    // "%PDF" magic bytes, but the body is a PNG — a spoof/polyglot.
    const polyglot = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    await expect(inspectPdf(polyglot)).rejects.toBeInstanceOf(
      PdfValidationError,
    );
  });

  it("refuses a PDF with more than MAX_PDF_PAGES pages", async () => {
    const pdf = buildImageOnlyPdf(MAX_PDF_PAGES + 1);
    await expect(inspectPdf(pdf)).rejects.toMatchObject({
      reason: "too_many_pages",
    });
  });

  it("accepts a PDF at exactly the page cap", async () => {
    const pdf = buildTextPdf(
      Array.from({ length: MAX_PDF_PAGES }, (_, i) => [`Day ${i + 1} squats`]),
    );
    const out = await inspectPdf(pdf);
    expect(out.pageCount).toBe(MAX_PDF_PAGES);
  });
});

describe("isTextLayerDefensible — path selection by actual characteristics", () => {
  it("routes a PDF with a full text layer to the text path", () => {
    const pages = [
      "Push Day: Bench Press 3x8, Overhead Press 3x10, Triceps 3x12",
      "Pull Day: Deadlift 1x5, Barbell Row 4x12, Curls 3x12",
    ];
    expect(isTextLayerDefensible(pages)).toBe(true);
  });

  it("routes to vision when any page is image-only (empty text)", () => {
    const pages = ["Push Bench Press 3x8 enough text to pass", ""];
    expect(isTextLayerDefensible(pages)).toBe(false);
  });

  it("routes to vision when the overall text volume is too thin (incidental layer)", () => {
    expect(isTextLayerDefensible(["pg1", "pg2"])).toBe(false);
  });

  it("routes an empty page list to vision", () => {
    expect(isTextLayerDefensible([])).toBe(false);
  });
});
