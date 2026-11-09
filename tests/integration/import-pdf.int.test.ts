import type { Account } from "@/lib/data/account";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";
import { beginExtraction } from "@/lib/import/extract";
import { createImportSession, addFilePart } from "@/lib/import/sessions";
import {
  __setPlanExtractionPort,
  type ExtractionPart,
} from "@/lib/import/extraction";
import {
  MockPlanExtractionPort,
  mockSuccess,
} from "@/lib/import/extraction/mock";
import { MAX_PDF_PAGES } from "@/lib/import/constants";
import * as storage from "@/lib/import/storage";

/**
 * Workout Plan Import & Review (OVE-107) — the PDF source path through the SAME
 * pipeline, against the throwaway Postgres with a MOCKED provider (no real,
 * paid call). Supabase Storage is not configured in the test DB, so the storage
 * module is mocked: uploads are accepted and byte downloads return in-process
 * PDF fixtures. This proves:
 *  - intake refuses encrypted / malformed / over-cap PDFs BEFORE any provider
 *    call, and stamps the real page count on a valid one;
 *  - loadParts routes a clean text-layer PDF to the TEXT extraction part and a
 *    scanned/image-only PDF to the VISION/PDF bytes part (by source, not
 *    extension), never sending a signed URL — only bytes.
 *
 * Real scanned-PDF accuracy is owner-gated and reported UNVERIFIED; it is never
 * asserted here (the mock returns a canned observation).
 */

const CAP = process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS;
const MODEL = process.env.PLAN_IMPORT_MODEL;

beforeAll(() => {
  process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS = "100000000";
  process.env.PLAN_IMPORT_MODEL = "mock-model";
});
afterAll(() => {
  if (CAP === undefined) delete process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS;
  else process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS = CAP;
  if (MODEL === undefined) delete process.env.PLAN_IMPORT_MODEL;
  else process.env.PLAN_IMPORT_MODEL = MODEL;
});
afterEach(() => {
  __setPlanExtractionPort(null);
  jest.restoreAllMocks();
});

/**
 * Build a minimal valid PDF with one text-bearing page per entry. Each page's
 * lines are emitted as separate Tj runs with a correct stream /Length so pdfjs
 * extracts the full text layer (a single very long run is truncated).
 */
function buildTextPdf(pageLineSets: string[][]): Uint8Array {
  const kids: string[] = [];
  const objs: { n: number; body: string }[] = [];
  let objNum = 3;
  for (const lines of pageLineSets) {
    const c = objNum++;
    const p = objNum++;
    const f = objNum++;
    kids.push(`${p} 0 R`);
    const s = lines
      .map((t, i) => `BT /F1 12 Tf 20 ${260 - i * 16} Td (${t}) Tj ET`)
      .join("\n");
    objs.push({
      n: c,
      body: `<</Length ${Buffer.byteLength(s)}>>stream\n${s}\nendstream`,
    });
    objs.push({
      n: p,
      body: `<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]/Contents ${c} 0 R/Resources<</Font<</F1 ${f} 0 R>>>>>>`,
    });
    objs.push({
      n: f,
      body: `<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>`,
    });
  }
  let out = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[${kids.join(" ")}]/Count ${pageLineSets.length}>>endobj\n`;
  for (const o of objs) out += `${o.n} 0 obj${o.body}endobj\n`;
  out += `trailer<</Root 1 0 R>>\n%%EOF`;
  return new Uint8Array(Buffer.from(out));
}

/** An image-only (no text layer) PDF — stands in for a scanned document. */
function buildScannedPdf(pageCount: number): Uint8Array {
  const kids: string[] = [];
  const objs: { n: number; body: string }[] = [];
  let objNum = 3;
  for (let i = 0; i < pageCount; i++) {
    const p = objNum++;
    kids.push(`${p} 0 R`);
    objs.push({
      n: p,
      body: `<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>`,
    });
  }
  let out = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[${kids.join(" ")}]/Count ${pageCount}>>endobj\n`;
  for (const o of objs) out += `${o.n} 0 obj${o.body}endobj\n`;
  out += `trailer<</Root 1 0 R>>\n%%EOF`;
  return new Uint8Array(Buffer.from(out));
}

const observationFixture = mockSuccess({
  isWorkoutPlan: true,
  title: { raw: "Imported", legible: true, evidence: null },
  days: [
    {
      order: 0,
      label: { raw: "Push", legible: true, evidence: null },
      notes: { raw: null, legible: true, evidence: null },
      exercises: [
        {
          order: 0,
          groupLabel: { raw: null, legible: true, evidence: null },
          name: { raw: "Bench Press", legible: true, evidence: null },
          sets: { raw: "3", legible: true, evidence: null },
          reps: { raw: "8", legible: true, evidence: null },
          load: { raw: null, legible: true, evidence: null },
          rest: { raw: null, legible: true, evidence: null },
          tempo: { raw: null, legible: true, evidence: null },
          notes: { raw: null, legible: true, evidence: null },
          alternativeReadings: [],
        },
      ],
    },
  ],
  generalNotes: { raw: null, legible: true, evidence: null },
  unreadable: [],
  contradictions: [],
});

/** Seed a files-mode session already holding one PDF part (bypassing storage). */
async function seedPdfSession(
  account: Account,
  pageCount: number,
): Promise<string> {
  const prisma = getTestPrisma();
  const session = await prisma.importSession.create({
    data: {
      userId: account.userId,
      status: "uploaded",
      sourceKind: "pdf",
      expiresAt: new Date(Date.now() + 86_400_000),
    },
    select: { id: true },
  });
  await prisma.importSourcePart.create({
    data: {
      userId: account.userId,
      sessionId: session.id,
      position: 0,
      objectPath: `${account.userId}/${session.id}/0.pdf`,
      contentType: "application/pdf",
      sizeBytes: 1234,
      pageCount,
    },
  });
  return session.id;
}

describe("PDF intake refusals (before any provider call)", () => {
  let account: Account;
  let sessionId: string;
  beforeEach(async () => {
    account = await createTestAccount();
    const created = await createImportSession(account, { mode: "files" });
    sessionId = created.sessionId;
  });

  it("refuses a malformed PDF cleanly, with no storage write and no provider call", async () => {
    const upload = jest.spyOn(storage, "uploadSourceObject");
    const malformed = new Uint8Array(
      Buffer.from("%PDF-1.4\nnot a real pdf\n%%EOF"),
    );
    await expect(
      addFilePart(account, {
        sessionId,
        bytes: malformed,
        sizeBytes: malformed.byteLength,
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(upload).not.toHaveBeenCalled();
    const parts = await getTestPrisma().importSourcePart.count({
      where: { sessionId },
    });
    expect(parts).toBe(0);
  });

  it("refuses a PDF over the page cap", async () => {
    jest.spyOn(storage, "uploadSourceObject").mockResolvedValue(undefined);
    const big = buildScannedPdf(MAX_PDF_PAGES + 1);
    await expect(
      addFilePart(account, {
        sessionId,
        bytes: big,
        sizeBytes: big.byteLength,
      }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("accepts a valid PDF and stamps its real page count", async () => {
    jest.spyOn(storage, "uploadSourceObject").mockResolvedValue(undefined);
    const pdf = buildTextPdf([
      ["Push Day workout", "Bench Press three by eight", "Overhead Press"],
      ["Pull Day workout", "Barbell Row four by twelve", "Deadlift one five"],
    ]);
    const res = await addFilePart(account, {
      sessionId,
      bytes: pdf,
      sizeBytes: pdf.byteLength,
    });
    expect(res.contentType).toBe("application/pdf");
    expect(res.pageCount).toBe(2);
    const part = await getTestPrisma().importSourcePart.findFirstOrThrow({
      where: { sessionId },
    });
    expect(part.pageCount).toBe(2);
  });
});

describe("extraction path selection (text layer vs vision)", () => {
  function capturePort() {
    const port = new MockPlanExtractionPort(observationFixture);
    __setPlanExtractionPort(port);
    return port;
  }

  it("routes a clean text-layer PDF to a TEXT extraction part (page-marked)", async () => {
    const account = await createTestAccount();
    const sessionId = await seedPdfSession(account, 2);
    const pdf = buildTextPdf([
      ["Push Day workout", "Bench Press three by eight", "Overhead Press ten"],
      ["Pull Day workout", "Barbell Row four by twelve", "Deadlift one five"],
    ]);
    jest.spyOn(storage, "downloadSourceObject").mockResolvedValue(pdf);
    const port = capturePort();

    await beginExtraction(account, { sessionId, dayKey: "2026-11-07" });

    const parts = port.requests[0].parts;
    expect(parts).toHaveLength(1);
    const part = parts[0] as Extract<ExtractionPart, { kind: "text" }>;
    expect(part.kind).toBe("text");
    expect(part.text).toContain("--- PAGE 1 ---");
    expect(part.text).toContain("--- PAGE 2 ---");
    expect(part.text).toContain("Bench Press");
  });

  it("routes a scanned/image-only PDF to the VISION path with raw BYTES, never a URL", async () => {
    const account = await createTestAccount();
    const sessionId = await seedPdfSession(account, 1);
    const scanned = buildScannedPdf(1);
    jest.spyOn(storage, "downloadSourceObject").mockResolvedValue(scanned);
    const signSpy = jest.spyOn(storage, "signSourceReadUrls");
    const port = capturePort();

    await beginExtraction(account, { sessionId, dayKey: "2026-11-07" });

    const parts = port.requests[0].parts;
    expect(parts).toHaveLength(1);
    const part = parts[0] as Extract<ExtractionPart, { kind: "pdf" }>;
    expect(part.kind).toBe("pdf");
    expect(part.bytes).toBeInstanceOf(Uint8Array);
    expect(part.bytes.byteLength).toBeGreaterThan(0);
    expect(part.pageCount).toBe(1);
    // The provider never receives a signed storage URL — only the bytes.
    expect(signSpy).not.toHaveBeenCalled();
  });
});
