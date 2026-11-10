import "server-only";
import { MAX_PDF_PAGES } from "./constants";
import { PdfEngineError } from "./errors";

/**
 * Workout Plan Import & Review (Pitch 22, OVE-107) — the single server-side PDF
 * seam. Every PDF fact the import flow needs (page count, per-page text layer,
 * and whether a document is encrypted or malformed) is read HERE and nowhere
 * else, so the storage/intake and extraction modules never import a PDF library
 * directly.
 *
 * Dependency (RD-13): `pdfjs-dist` (Mozilla, pure JavaScript, no native
 * binaries, pinned exactly in package.json). The legacy build is used because it
 * runs in a plain Node/serverless context without a browser worker; text and
 * page count are read without ever rasterizing a page, so the optional canvas
 * renderer is never loaded. This file is server-only; pdfjs never reaches a
 * client bundle (verified by verify:client-bundle).
 *
 * The module NEVER calls the model and NEVER touches an application table. It
 * refuses encrypted / password-protected / malformed / polyglot PDFs with a
 * typed error BEFORE any provider call, so a bad file costs nothing.
 */

/**
 * Why a PDF was refused. Each maps to an honest, filename-free user message in
 * the intake path (sessions.ts) — the error itself never carries source content.
 */
export type PdfRejectionReason =
  | "encrypted" // password-protected / encrypted — we don't prompt for a password
  | "malformed" // not a real PDF / corrupt / polyglot that pdfjs can't open
  | "too_many_pages"; // over MAX_PDF_PAGES

export class PdfValidationError extends Error {
  constructor(readonly reason: PdfRejectionReason) {
    super(`PDF rejected: ${reason}`);
    this.name = "PdfValidationError";
  }
}

export type PdfInspection = {
  /** Actual page count, as reported by the parser (1..MAX_PDF_PAGES). */
  pageCount: number;
  /**
   * Extracted text layer, one string per page (index 0 = page 1). A page with
   * no text layer (a scanned/image-only page) yields an empty string, never a
   * guess. Order follows the document's page order.
   */
  pages: string[];
};

/**
 * pdfjs is loaded lazily and dynamically so a request that never imports a PDF
 * pays nothing for it, and so the ESM-only legacy build is imported correctly
 * from the server bundle. The module is cached after first load.
 */
type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfjsModule> | null = null;
// A native dynamic import built at runtime so a CommonJS transpile (ts-jest)
// cannot rewrite it to `require()` — the legacy build is ESM-only and must be
// loaded through Node's ESM loader even under the test transform.
const nativeImport = new Function("specifier", "return import(specifier);") as (
  specifier: string,
) => Promise<PdfjsModule>;
async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = nativeImport("pdfjs-dist/legacy/build/pdf.mjs");
  }
  try {
    return await pdfjsPromise;
  } catch {
    // The library itself could not load (a deployment problem, not a bad PDF):
    // report it as such, and allow the next request to try loading again.
    pdfjsPromise = null;
    throw new PdfEngineError();
  }
}

/**
 * Open a PDF from its raw bytes and read its page count and per-page text layer.
 *
 * Throws `PdfValidationError`:
 *  - "encrypted" for a password-protected / encrypted document (pdfjs raises a
 *    PasswordException because we never supply a password);
 *  - "malformed" for a corrupt or non-PDF byte stream (InvalidPDFException or any
 *    other open/parse failure);
 *  - "too_many_pages" when the page count exceeds MAX_PDF_PAGES — checked BEFORE
 *    any page text is read, so an oversized document is cheap to refuse.
 *
 * pdfjs is told not to evaluate embedded scripts, fetch remote fonts, or use
 * system fonts: text extraction needs none of that, and disabling it keeps a
 * hostile document inert.
 */
export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  const pdfjs = await loadPdfjs();
  // A fresh copy: pdfjs transfers/detaches the buffer it is handed, and the
  // caller may still need the original bytes (e.g. to send to the vision path).
  const data = new Uint8Array(bytes);

  const loadingTask = pdfjs.getDocument({
    data,
    // Keep a hostile document inert: no script eval, no remote/system fonts. The
    // keys are set via a cast because this pdfjs d.ts omits some of the optional
    // hardening flags, though the runtime honours them.
    disableFontFace: true,
    useSystemFonts: false,
    ...({ isEvalSupported: false } as Record<string, unknown>),
  });

  let doc: Awaited<typeof loadingTask.promise>;
  try {
    doc = await loadingTask.promise;
  } catch (error) {
    await loadingTask.destroy().catch(() => {});
    throw toValidationError(pdfjs, error);
  }

  try {
    const pageCount = doc.numPages;
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      throw new PdfValidationError("malformed");
    }
    if (pageCount > MAX_PDF_PAGES) {
      throw new PdfValidationError("too_many_pages");
    }

    const pages: string[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => (item != null && "str" in item ? item.str : ""))
        .join(" ")
        .replace(/[ \t]+/g, " ")
        .trim();
      pages.push(text);
      // Release page resources eagerly for large documents.
      page.cleanup();
    }
    return { pageCount, pages };
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}

/** Map a pdfjs/transport error to the typed rejection, never leaking its body. */
function toValidationError(
  pdfjs: PdfjsModule,
  error: unknown,
): PdfValidationError {
  if (error instanceof PdfValidationError) return error;
  if (error instanceof pdfjs.PasswordException) {
    return new PdfValidationError("encrypted");
  }
  // InvalidPDFException and anything else from open/parse is treated as malformed
  // (corrupt bytes, a truncated upload, or a polyglot pdfjs cannot open).
  return new PdfValidationError("malformed");
}

/**
 * How confident we are that the text layer preserves the source's reading order
 * well enough to feed the text model path instead of the multimodal/vision path.
 *
 * Decision (RD-14): the choice is made from ACTUAL source characteristics, not
 * the `.pdf` extension. A PDF is sent through the text path only when:
 *  - every page carries SOME extractable text (no image-only / scanned page), and
 *  - the overall text volume clears a small floor (a near-empty layer means the
 *    real content is in the raster, i.e. a scan with an incidental text layer).
 *
 * When the text layer can't be defended this way (a scanned PDF, an image-only
 * page, or a column/table layout that extraction may interleave), the caller
 * falls back to the vision path and sends the PDF BYTES. We never CLAIM
 * scanned-PDF accuracy here; this heuristic only routes, and the review UI shows
 * exactly what was read.
 */

/** A page with fewer than this many non-space characters is treated as empty. */
const MIN_PAGE_TEXT_CHARS = 16;
/** Total text below this across all pages routes to the vision path. */
const MIN_TOTAL_TEXT_CHARS = 64;

export function isTextLayerDefensible(pages: string[]): boolean {
  if (pages.length === 0) return false;
  let total = 0;
  for (const page of pages) {
    const chars = page.replace(/\s/g, "").length;
    // Any image-only page (empty text layer) forfeits the text path: that page's
    // content lives in the raster the text model cannot see.
    if (chars < MIN_PAGE_TEXT_CHARS) return false;
    total += chars;
  }
  return total >= MIN_TOTAL_TEXT_CHARS;
}
