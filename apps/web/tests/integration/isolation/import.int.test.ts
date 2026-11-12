import { randomUUID } from "node:crypto";
import type { Account } from "@/lib/data/account";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";
import {
  beginExtraction,
  getImportStatus,
  retryExtraction,
} from "@/lib/import/extract";
import { confirmImport } from "@/lib/import/confirm";
import { saveDraftEdit } from "@/lib/import/review";
import { discardImport } from "@/lib/import/sessions";
import { __setPlanExtractionPort } from "@/lib/import/extraction";
import {
  MockPlanExtractionPort,
  mockSuccess,
} from "@/lib/import/extraction/mock";

/**
 * Cross-account isolation — the import domain (ImportSession, ImportSourcePart).
 * Account A runs an import to review; Account B then tries every read and write
 * path against A's session and must be refused with NOT-FOUND (never forbidden,
 * never A's content). Also: a Free account is refused on begin/confirm by the
 * capability gate (P22-06/P22-08). Provider mocked throughout.
 */

const CAP = process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS;
const ENABLED = process.env.PLAN_IMPORT_ENABLED;

beforeAll(() => {
  process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS = "100000000";
  process.env.PLAN_IMPORT_ENABLED = "true";
});
afterAll(() => {
  if (CAP === undefined) delete process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS;
  else process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS = CAP;
  if (ENABLED === undefined) delete process.env.PLAN_IMPORT_ENABLED;
  else process.env.PLAN_IMPORT_ENABLED = ENABLED;
});
afterEach(() => __setPlanExtractionPort(null));

function field(raw: string | null) {
  return { raw, legible: true, evidence: null };
}
function planObs() {
  return mockSuccess({
    isWorkoutPlan: true,
    title: field("A's Plan"),
    days: [
      {
        order: 0,
        label: field("Push"),
        notes: field(null),
        exercises: [
          {
            order: 0,
            groupLabel: field(null),
            name: field("Barbell Bench Press"),
            sets: field("3"),
            reps: field("6-8"),
            load: field(null),
            rest: field(null),
            tempo: field(null),
            notes: field(null),
            alternativeReadings: [],
          },
        ],
      },
    ],
    generalNotes: field(null),
    unreadable: [],
    contradictions: [],
  });
}

async function seedUploaded(account: Account, text: string): Promise<string> {
  const prisma = getTestPrisma();
  const session = await prisma.importSession.create({
    data: {
      userId: account.userId,
      status: "uploaded",
      sourceKind: "text",
      expiresAt: new Date(Date.now() + 86_400_000),
    },
    select: { id: true },
  });
  await prisma.importSourcePart.create({
    data: { userId: account.userId, sessionId: session.id, position: 0, text },
  });
  return session.id;
}

async function seedLib(name: string) {
  return getTestPrisma().exercise.create({
    data: {
      name,
      primaryMuscle: "chest",
      equipmentType: "barbell",
      isCustom: false,
      sourceId: randomUUID(),
    },
  });
}

const DAY = "2026-11-07";

describe("account B cannot see, change, or detect account A's import", () => {
  let a: Account;
  let b: Account;
  let sessionId: string;

  beforeEach(async () => {
    a = await createTestAccount();
    b = await createTestAccount();
    await seedLib("Barbell Bench Press");
    __setPlanExtractionPort(new MockPlanExtractionPort(planObs()));
    sessionId = await seedUploaded(a, "Push\nBench 3x6-8");
    await beginExtraction(a, { sessionId, dayKey: DAY });
  });

  it("B's status poll of A's session is not-found", async () => {
    await expect(getImportStatus(b, sessionId)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("B cannot edit A's draft (not-found)", async () => {
    await expect(
      saveDraftEdit(b, {
        sessionId,
        version: 0,
        patch: { kind: "title", value: "pwned" },
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("B cannot confirm A's import (not-found)", async () => {
    await expect(
      confirmImport(b, { sessionId, version: 0 }),
    ).rejects.toMatchObject({ code: "not_found" });
    // A's session is untouched.
    const s = await getTestPrisma().importSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(s.status).toBe("review");
    expect(s.mesocycleId).toBeNull();
  });

  it("B cannot discard A's import (not-found)", async () => {
    await expect(discardImport(b, { sessionId })).rejects.toMatchObject({
      code: "not_found",
    });
    expect(
      await getTestPrisma().importSession.findUnique({
        where: { id: sessionId },
      }),
    ).not.toBeNull();
  });

  it("B cannot retry A's import (not-found)", async () => {
    await expect(
      retryExtraction(b, { sessionId, dayKey: DAY }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("A can still confirm its own import into one plan", async () => {
    const { mesocycleId } = await confirmImport(a, { sessionId, version: 0 });
    const meso = await getTestPrisma().mesocycle.findUniqueOrThrow({
      where: { id: mesocycleId },
    });
    expect(meso.userId).toBe(a.userId);
    expect(meso.status).toBe("draft");
  });
});

describe("Free account is denied on confirm (P22-06), even at a review session it owns", () => {
  it("confirm's own capability re-check refuses a Free (lapsed) account", async () => {
    // A lifter who started an import under a trial that then lapsed. The session
    // is owned by the account the whole time (ownership is immutable), so we seed
    // a review session directly for a Free account and prove confirm refuses it
    // by its OWN re-check — hiding the button is never the gate.
    const free = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const bench = await seedLib("Barbell Bench Press");
    const prisma = getTestPrisma();
    const draft = {
      version: 0,
      title: { value: "Plan", raw: "Plan", status: "explicit", evidence: null },
      days: [
        {
          key: "d0",
          label: {
            value: "Push",
            raw: "Push",
            status: "explicit",
            evidence: null,
          },
          exercises: [
            {
              key: "d0e0",
              match: {
                kind: "matched",
                exerciseId: bench.id,
                name: bench.name,
              },
              sets: { value: 3, raw: "3", status: "explicit", evidence: null },
              repMin: {
                value: 6,
                raw: "6",
                status: "explicit",
                evidence: null,
              },
              repMax: {
                value: 8,
                raw: "8",
                status: "explicit",
                evidence: null,
              },
              context: [],
            },
          ],
        },
      ],
      issues: [],
    };
    const session = await prisma.importSession.create({
      data: {
        userId: free.userId,
        status: "review",
        sourceKind: "text",
        draft: draft as object,
        draftVersion: 0,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
      select: { id: true },
    });

    await expect(
      confirmImport(free, { sessionId: session.id, version: 0 }),
    ).rejects.toMatchObject({ code: "plan_required" });
    // Nothing was created.
    expect(await prisma.mesocycle.count()).toBe(0);
  });
});
