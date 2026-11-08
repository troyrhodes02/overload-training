import type { Account } from "@/lib/data/account";
import { AccountScopeError, unclassifiedModels } from "@/lib/data/scope";
import { bumpImportUsage } from "@/lib/import/usage";
import {
  sniffContentType,
  normalizeForStorage,
  SourceValidationError,
  sourceObjectPath,
} from "@/lib/import/storage";
import {
  createImportSession,
  addText,
  addFilePart,
  discardImport,
} from "@/lib/import/sessions";
import { MAX_TEXT_CHARS, MAX_PARTS } from "@/lib/import/constants";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";
import { expectForeignLikeMissing } from "./support";

/**
 * Cross-account isolation — Workout Plan Import & Review (Pitch 22, spec §9,
 * §14.1). An import attempt is the lifter's private, temporary state: another
 * account can't read, list, search, change, confirm, discard, poll, or detect
 * it — by id, by relation, or by object path. The un-owned global spend ledger
 * is unreachable through any account's scoped client. Plus the foundation
 * invariants: deny-all RLS, magic-byte validation over spoofed MIME, the caps,
 * and the atomic daily quota.
 *
 * File storage (Supabase) is not configured in the test DB, so file-part
 * uploads are exercised through the pure validation seam (normalizeForStorage /
 * sniffContentType); addFilePart's storage write is covered by the unit layer
 * and by a Vercel preview with real-shaped data before release.
 */

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]); // %PDF-1
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0,
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
const HEIC = new Uint8Array([
  0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a

let a: Account;
let b: Account;
let aSessionId: string;
let aPartId: string;

beforeEach(async () => {
  a = await createTestAccount();
  b = await createTestAccount();
  const { sessionId } = await createImportSession(a, { mode: "text" });
  aSessionId = sessionId;
  await addText(a, { sessionId, text: "A's PPL plan\nPush: Bench 3x8" });
  const part = await getTestPrisma().importSourcePart.findFirstOrThrow({
    where: { sessionId },
  });
  aPartId = part.id;
  // B has its own import so "only its own" assertions are meaningful.
  await createImportSession(b, { mode: "files" });
});

describe("ImportSession isolation", () => {
  it("a scoped create is stamped with the acting account", async () => {
    const row = await getTestPrisma().importSession.findUniqueOrThrow({
      where: { id: aSessionId },
    });
    expect(row.userId).toBe(a.userId);
    expect(row.status).toBe("uploaded");
  });

  it("B can't create a session as A", async () => {
    await expect(
      b.db.importSession.create({
        data: { userId: a.userId, sourceKind: "text", expiresAt: new Date() },
      }),
    ).rejects.toBeInstanceOf(AccountScopeError);
  });

  it("B can't read, list, or count A's sessions", async () => {
    expect(
      await b.db.importSession.findUnique({ where: { id: aSessionId } }),
    ).toBeNull();
    expect((await b.db.importSession.findMany()).map((s) => s.userId)).toEqual([
      b.userId,
    ]);
    expect(await b.db.importSession.count()).toBe(1);
    expect(
      await b.db.importSession.count({ where: { userId: a.userId } }),
    ).toBe(0);
  });

  it("naming A's session id looks exactly like naming a missing one", async () => {
    await expectForeignLikeMissing(aSessionId, (id) =>
      b.db.importSession.findUniqueOrThrow({ where: { id } }),
    );
  });

  it("B can't change, confirm, or discard A's session", async () => {
    const before = await getTestPrisma().importSession.findUniqueOrThrow({
      where: { id: aSessionId },
    });
    expect(
      await b.db.importSession.updateMany({
        where: { id: aSessionId },
        data: { status: "confirmed" },
      }),
    ).toEqual({ count: 0 });
    expect(
      await b.db.importSession.deleteMany({ where: { id: aSessionId } }),
    ).toEqual({ count: 0 });
    await expect(
      discardImport(b, { sessionId: aSessionId }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(
      await getTestPrisma().importSession.findUniqueOrThrow({
        where: { id: aSessionId },
      }),
    ).toEqual(before);
  });

  it("ownership of a session never changes (database trigger)", async () => {
    await expect(
      getTestPrisma().importSession.update({
        where: { id: aSessionId },
        data: { userId: b.userId },
      }),
    ).rejects.toThrow();
  });

  it("B can't point its session at another account's mesocycle (same-owner trigger)", async () => {
    // A owns a mesocycle via its default plan path only if created; instead
    // forge the cross-account mesocycle reference directly through raw Prisma.
    const meso = await getTestPrisma().mesocycle.create({
      data: {
        userId: a.userId,
        name: "A meso",
        lengthWeeks: 4,
        deloadEveryWeeks: 4,
        splitType: "custom",
      },
      select: { id: true },
    });
    const bSession = await getTestPrisma().importSession.findFirstOrThrow({
      where: { userId: b.userId },
    });
    await expect(
      getTestPrisma().importSession.update({
        where: { id: bSession.id },
        data: { mesocycleId: meso.id },
      }),
    ).rejects.toThrow();
  });
});

describe("ImportSourcePart isolation", () => {
  it("B can't read, list, or count A's parts", async () => {
    expect(
      await b.db.importSourcePart.findUnique({ where: { id: aPartId } }),
    ).toBeNull();
    expect(await b.db.importSourcePart.findMany()).toEqual([]);
    expect(await b.db.importSourcePart.count()).toBe(0);
  });

  it("naming A's part id looks exactly like naming a missing one", async () => {
    await expectForeignLikeMissing(aPartId, (id) =>
      b.db.importSourcePart.findUniqueOrThrow({ where: { id } }),
    );
  });

  it("B can't attach a part to A's session, even stamped as B (same-owner trigger)", async () => {
    await expect(
      b.db.importSourcePart.create({
        data: {
          userId: b.userId,
          sessionId: aSessionId,
          position: 9,
          text: "spoof",
        },
      }),
    ).rejects.toThrow();
  });

  it("B can't reach A's part by relation from its own session", async () => {
    const bSession = await b.db.importSession.findFirstOrThrow({
      include: { parts: true },
    });
    expect(bSession.parts).toEqual([]);
  });

  it("B can't change or delete A's part", async () => {
    expect(
      await b.db.importSourcePart.updateMany({
        where: { id: aPartId },
        data: { position: 3 },
      }),
    ).toEqual({ count: 0 });
    expect(
      await b.db.importSourcePart.deleteMany({ where: { id: aPartId } }),
    ).toEqual({ count: 0 });
    expect(
      (
        await getTestPrisma().importSourcePart.findUniqueOrThrow({
          where: { id: aPartId },
        })
      ).position,
    ).toBe(0);
  });
});

describe("ImportUsageDay isolation + atomic quota", () => {
  it("B's daily counter is independent of A's and capped per account", async () => {
    // A burns the whole day; the Nth is allowed, the (N+1)th refused.
    let last = { allowed: true };
    for (let i = 0; i < 6; i++)
      last = await bumpImportUsage(a.userId, "2026-11-07");
    expect(last.allowed).toBe(false);
    // B on the same day is untouched: its first attempt is allowed.
    expect(await bumpImportUsage(b.userId, "2026-11-07")).toEqual({
      allowed: true,
    });
  });

  it("B can't read or detect A's usage rows", async () => {
    await bumpImportUsage(a.userId, "2026-11-07");
    expect(await b.db.importUsageDay.findMany()).toEqual([]);
    expect(await b.db.importUsageDay.count()).toBe(0);
    expect(
      await b.db.importUsageDay.count({ where: { userId: a.userId } }),
    ).toBe(0);
  });

  it("the atomic bump can't be raced past the cap", async () => {
    const day = "2026-11-08";
    const results = await Promise.all(
      Array.from({ length: 10 }, () => bumpImportUsage(a.userId, day)),
    );
    const allowed = results.filter((r) => r.allowed).length;
    // Exactly MAX_IMPORTS_PER_DAY of the ten concurrent bumps are within cap.
    expect(allowed).toBe(5);
  });
});

describe("ImportSpendLedger (un-owned system table)", () => {
  it("exists with deny-all RLS and no policy", async () => {
    const [rls] = (await getTestPrisma().$queryRawUnsafe(
      `SELECT relrowsecurity AS on FROM pg_class WHERE relname = 'import_spend_ledger'`,
    )) as { on: boolean }[];
    expect(rls.on).toBe(true);
    const policies = (await getTestPrisma().$queryRawUnsafe(
      `SELECT 1 FROM pg_policies WHERE tablename = 'import_spend_ledger'`,
    )) as unknown[];
    expect(policies).toEqual([]);
  });

  it("has no foreign key, so it never blocks account deletion", async () => {
    const fks = (await getTestPrisma().$queryRawUnsafe(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'import_spend_ledger'::regclass AND contype = 'f'`,
    )) as unknown[];
    expect(fks).toEqual([]);
  });

  it("is unreachable through any account's scoped client", async () => {
    const delegate = (a.db as unknown as Record<string, unknown>)
      .importSpendLedger as { findMany: () => Promise<unknown> };
    await expect(delegate.findMany()).rejects.toBeInstanceOf(AccountScopeError);
  });
});

describe("deny-all RLS on every import table", () => {
  it("every owned import table has RLS on with no policy", async () => {
    for (const table of [
      "import_sessions",
      "import_source_parts",
      "import_usage_days",
    ]) {
      const [rls] = (await getTestPrisma().$queryRawUnsafe(
        `SELECT relrowsecurity AS on FROM pg_class WHERE relname = '${table}'`,
      )) as { on: boolean }[];
      expect([table, rls.on]).toEqual([table, true]);
      const policies = (await getTestPrisma().$queryRawUnsafe(
        `SELECT 1 FROM pg_policies WHERE tablename = '${table}'`,
      )) as unknown[];
      expect([table, policies]).toEqual([table, []]);
    }
  });
});

describe("magic-byte validation over spoofed MIME", () => {
  it("sniffs the real type from the leading bytes", () => {
    expect(sniffContentType(PDF)).toBe("application/pdf");
    expect(sniffContentType(PNG)).toBe("image/png");
    expect(sniffContentType(JPEG)).toBe("image/jpeg");
    expect(sniffContentType(WEBP)).toBe("image/webp");
    expect(sniffContentType(HEIC)).toBe("heic");
    expect(sniffContentType(GIF)).toBeNull();
  });

  it("a spoofed png that is really a GIF is refused", () => {
    expect(() =>
      normalizeForStorage({ bytes: GIF, sizeBytes: GIF.byteLength }),
    ).toThrow(SourceValidationError);
  });

  it("HEIC is cleanly refused in this slice (conversion is OVE-108)", () => {
    expect(() =>
      normalizeForStorage({ bytes: HEIC, sizeBytes: HEIC.byteLength }),
    ).toThrow(/HEIC/);
  });

  it("an accepted type passes through with its sniffed content type", () => {
    const out = normalizeForStorage({ bytes: PDF, sizeBytes: PDF.byteLength });
    expect(out.contentType).toBe("application/pdf");
    expect(out.bytes).toBe(PDF);
  });
});

describe("caps", () => {
  it("rejects pasted text over the character limit", async () => {
    const { sessionId } = await createImportSession(a, { mode: "text" });
    await expect(
      addText(a, { sessionId, text: "x".repeat(MAX_TEXT_CHARS + 1) }),
    ).rejects.toMatchObject({ code: "validation_error" });
  });

  it("rejects empty pasted text", async () => {
    const { sessionId } = await createImportSession(a, { mode: "text" });
    await expect(addText(a, { sessionId, text: "   " })).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("a size over the per-file cap is refused by the storage seam", () => {
    expect(() =>
      normalizeForStorage({ bytes: PDF, sizeBytes: 11 * 1024 * 1024 }),
    ).toThrow(SourceValidationError);
  });

  it("the object path is owner-prefixed", () => {
    const path = sourceObjectPath(a.userId, aSessionId, 2, "image/png");
    expect(path).toBe(`${a.userId}/${aSessionId}/2.png`);
  });

  it("a file part can't be added to a text session (mode mismatch)", async () => {
    await expect(
      addFilePart(a, {
        sessionId: aSessionId,
        bytes: PDF,
        sizeBytes: PDF.byteLength,
      }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
  });

  it("MAX_PARTS is the enforced bundle size", () => {
    expect(MAX_PARTS).toBe(5);
  });
});

describe("scope classification stays complete", () => {
  it("leaves no model unclassified (owned, shared, admin-only, or un-owned system)", () => {
    expect(unclassifiedModels()).toEqual([]);
  });
});
