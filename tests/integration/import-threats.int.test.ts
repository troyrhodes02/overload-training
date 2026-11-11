import type { Account } from "@/lib/data/account";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";
import { sourceReadUrls, beginExtraction } from "@/lib/import/extract";
import { confirmImport } from "@/lib/import/confirm";
import { __setPlanExtractionPort } from "@/lib/import/extraction";
import {
  MockPlanExtractionPort,
  mockSuccess,
} from "@/lib/import/extraction/mock";

/**
 * Workout Plan Import & Review (OVE-109, blueprint §8 threat checklist) —
 * targeted threat tests for the gaps the ticket names (forged ids / tenant-mixed
 * access, ToCToU on confirm version). File MIME-spoof / magic-byte / path caps
 * are covered in the isolation + unit suites; capability/kill-switch forged calls
 * in plan-import-gating + import-hardening.
 */

const CAP = process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS;
beforeAll(() => {
  process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS = "100000000";
});
afterAll(() => {
  if (CAP === undefined) delete process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS;
  else process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS = CAP;
});
afterEach(() => __setPlanExtractionPort(null));

function field(raw: string | null) {
  return { raw, legible: true, evidence: null };
}
function plan() {
  return mockSuccess({
    isWorkoutPlan: true,
    title: field("P"),
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
            reps: field("8"),
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

async function seedUploaded(account: Account): Promise<string> {
  const prisma = getTestPrisma();
  const s = await prisma.importSession.create({
    data: {
      userId: account.userId,
      status: "uploaded",
      sourceKind: "image",
      expiresAt: new Date(Date.now() + 86_400_000),
    },
    select: { id: true },
  });
  await prisma.importSourcePart.create({
    data: {
      userId: account.userId,
      sessionId: s.id,
      position: 0,
      objectPath: `${account.userId}/${s.id}/0.png`,
      contentType: "image/png",
      sizeBytes: 10,
    },
  });
  return s.id;
}

describe("forged id / tenant-mixed source access (threat 1 & 6)", () => {
  it("B asking for A's session source URLs gets nothing (scoped read, not another tenant's keys)", async () => {
    const a = await createTestAccount();
    const b = await createTestAccount();
    const aSession = await seedUploaded(a);

    // B names A's real session id — the scoped read returns no parts (not-found
    // shaped), never A's object paths or a signed URL to them.
    const asB = await sourceReadUrls(b, aSession);
    expect(asB).toEqual([]);

    // A's own read still returns the part (with a null URL since storage is not
    // configured in the test DB) — proving the empty result above is isolation,
    // not a broken path.
    const asA = await sourceReadUrls(a, aSession);
    expect(asA).toHaveLength(1);
    expect(asA[0].position).toBe(0);
  });
});

describe("ToCToU on confirm version (threat 5)", () => {
  async function toReview(account: Account): Promise<string> {
    await getTestPrisma().exercise.create({
      data: {
        name: "Barbell Bench Press",
        primaryMuscle: "chest",
        equipmentType: "barbell",
        isCustom: false,
        sourceId: `syn-${Math.random()}`,
      },
    });
    __setPlanExtractionPort(new MockPlanExtractionPort(plan()));
    const prisma = getTestPrisma();
    const s = await prisma.importSession.create({
      data: {
        userId: account.userId,
        status: "uploaded",
        sourceKind: "text",
        expiresAt: new Date(Date.now() + 86_400_000),
      },
      select: { id: true },
    });
    await prisma.importSourcePart.create({
      data: {
        userId: account.userId,
        sessionId: s.id,
        position: 0,
        text: "Push\nBench 3x8",
      },
    });
    await beginExtraction(account, { sessionId: s.id, dayKey: "2026-11-12" });
    return s.id;
  }

  it("a confirm with a STALE version is refused (the draft moved under it)", async () => {
    const account = await createTestAccount();
    const sessionId = await toReview(account);
    // Draft is version 0 after extraction; a confirm quoting version 1 (as if the
    // client raced an edit) must not create a plan.
    await expect(
      confirmImport(account, { sessionId, version: 1 }),
    ).rejects.toMatchObject({ code: "conflict" });
    // Nothing was created.
    const session = await getTestPrisma().importSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(session.status).toBe("review");
    expect(session.mesocycleId).toBeNull();
  });

  it("the correct version confirms exactly once; a replay returns the same plan", async () => {
    const account = await createTestAccount();
    const sessionId = await toReview(account);
    const first = await confirmImport(account, { sessionId, version: 0 });
    const replay = await confirmImport(account, { sessionId, version: 0 });
    expect(replay.mesocycleId).toBe(first.mesocycleId);
  });
});
