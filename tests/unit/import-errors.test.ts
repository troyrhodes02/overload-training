import { DomainError } from "@/lib/actions/result";
import {
  EXTRACTION_UNAVAILABLE_MESSAGE,
  PDF_ENGINE_MESSAGE,
  PdfEngineError,
  SESSION_EXPIRED_MESSAGE,
  StorageUploadError,
  UPLOAD_FAILED_MESSAGE,
  importResult,
  mapImportError,
} from "@/lib/import/errors";
import { extractionFailureCopy } from "@/lib/import/failure-copy";
import { sniffContentType, normalizeForStorage } from "@/lib/import/storage";
import { inspectPdf, PdfValidationError } from "@/lib/import/pdf";

jest.mock("@/lib/import/image", () => ({
  ImageConversionError: class extends Error {},
  normalizeImage: jest.fn(),
}));

const FALLBACK = "Couldn't add that file. Nothing was changed.";

describe("mapImportError", () => {
  it("keeps a DomainError's own message and code", () => {
    expect(
      mapImportError(new DomainError("validation_error", "Too big."), FALLBACK),
    ).toEqual({ code: "validation_error", message: "Too big." });
  });

  it("maps Next's redirect signal (expired login) to a sign-in message", () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/login;307;",
    });
    expect(mapImportError(redirect, FALLBACK)).toEqual({
      code: "unauthorized",
      message: SESSION_EXPIRED_MESSAGE,
    });
  });

  it("maps a Storage failure to an upload message, never an AI one", () => {
    const m = mapImportError(
      new StorageUploadError("Bucket not found"),
      FALLBACK,
    );
    expect(m.message).toBe(UPLOAD_FAILED_MESSAGE);
    expect(m.message).not.toMatch(/extract|\bAI\b|plan import/i);
  });

  it("maps a PDF-engine load failure distinctly from a bad PDF", () => {
    expect(mapImportError(new PdfEngineError(), FALLBACK).message).toBe(
      PDF_ENGINE_MESSAGE,
    );
  });

  it("falls back to the generic message and never exposes the raw error", () => {
    const m = mapImportError(
      new Error("connect ECONNREFUSED postgres://u:secret@host/db"),
      FALLBACK,
    );
    expect(m).toEqual({ code: "internal_error", message: FALLBACK });
  });
});

describe("importResult", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns data on success", async () => {
    await expect(importResult("op", async () => 1, FALLBACK)).resolves.toEqual({
      ok: true,
      data: 1,
    });
  });

  it("logs a sanitized line (name/codes only) for unexpected errors", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("password=hunter2 in query"), {
      code: "P1001",
    });
    const res = await importResult(
      "commitPartAction",
      async () => {
        throw err;
      },
      FALLBACK,
    );
    expect(res).toEqual({
      ok: false,
      error: { code: "internal_error", message: FALLBACK },
    });
    const logged = spy.mock.calls.flat().join(" ");
    expect(logged).toContain("commitPartAction");
    expect(logged).toContain("P1001");
    expect(logged).not.toContain("hunter2");
  });

  it("does not log expected validation or auth outcomes as errors", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await importResult(
      "x",
      async () => {
        throw new DomainError("validation_error", "No.");
      },
      FALLBACK,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("includes Storage's own message in the log but not to the user", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await importResult(
      "commitPartAction",
      async () => {
        throw new StorageUploadError("Bucket not found");
      },
      FALLBACK,
    );
    expect(spy.mock.calls.flat().join(" ")).toContain("Bucket not found");
    expect(JSON.stringify(res)).not.toContain("Bucket");
  });
});

describe("extraction failure copy", () => {
  it("says extraction is unavailable for provider and budget failures", () => {
    for (const code of [
      "provider_unavailable",
      "provider_rate_limited",
      "provider_unconfigured",
      "provider_unauthorized",
    ]) {
      expect(extractionFailureCopy(code, false).body).toMatch(
        /temporarily unavailable/,
      );
    }
    expect(EXTRACTION_UNAVAILABLE_MESSAGE).toMatch(/temporarily unavailable/);
  });

  it("never names a provider or status code", () => {
    for (const code of [null, "provider_rejected", "malformed_output", "x"]) {
      for (const r of [true, false]) {
        const { title, body } = extractionFailureCopy(code, r);
        expect(`${title} ${body}`).not.toMatch(
          /anthropic|claude|\b[45]\d\d\b/i,
        );
      }
    }
  });
});

describe("file validation messages", () => {
  const pdfBytes = (tail = "") => new TextEncoder().encode("%PDF-1.4\n" + tail);

  it("rejects an unsupported format with a clear message", async () => {
    const bytes = new TextEncoder().encode("hello, this is plain text");
    await expect(
      normalizeForStorage({ bytes, sizeBytes: bytes.byteLength }),
    ).rejects.toThrow(/file type isn't supported/);
  });

  it("rejects an oversized file with a clear message", async () => {
    await expect(
      normalizeForStorage({
        bytes: pdfBytes(),
        sizeBytes: 11 * 1024 * 1024,
      }),
    ).rejects.toThrow(/too large.*10 MB/);
  });

  it("recognizes a PDF by its signature", () => {
    expect(sniffContentType(pdfBytes())).toBe("application/pdf");
  });

  it("rejects a corrupt PDF as unreadable (not an AI or upload error)", async () => {
    await expect(
      inspectPdf(pdfBytes("garbage, no objects")),
    ).rejects.toBeInstanceOf(PdfValidationError);
  });
});
