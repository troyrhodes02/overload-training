import type { Account } from "@/lib/data/account";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";
import { beginExtraction, getImportStatus } from "@/lib/import/extract";
import { __setPlanExtractionPort } from "@/lib/import/extraction";
import {
  MockPlanExtractionPort,
  mockSuccess,
} from "@/lib/import/extraction/mock";
import { MAX_IMPORTS_PER_DAY } from "@/lib/import/constants";

/**
 * Workout Plan Import & Review (OVE-109, spec §14.8/§14.9, blueprint §5/§8) —
 * cost/kill-switch/lease hardening against forged direct calls, on the throwaway
 * Postgres with a MOCKED provider.
 *
 * These exercise the LIFECYCLE module directly (as a forged server-action call
 * would reach it, bypassing the UI): the kill switch / capability live in the
 * action's guardImport (proven in plan-import-gating), so here we prove the
 * module-level gates a direct call still hits — daily quota and the spend
 * reservation — plus the atomic lease claim.
 */

const DAY = "2026-11-09";
const CAP = process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS;

beforeAll(() => {
  process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS = "100000000"; // $100
});
afterAll(() => {
  if (CAP === undefined) delete process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS;
  else process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS = CAP;
});
afterEach(async () => {
  __setPlanExtractionPort(null);
  await getTestPrisma().importSpendLedger.deleteMany({});
});

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
            name: field("Bench"),
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

async function uploadedSession(account: Account): Promise<string> {
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
  return s.id;
}

describe("daily quota gate even for a forged direct call (P22-07)", () => {
  it("the 6th started attempt in a day is refused with rate_limited", async () => {
    const account = await createTestAccount();
    __setPlanExtractionPort(new MockPlanExtractionPort(plan()));

    // Five sessions, each a started attempt, exhaust the day.
    for (let i = 0; i < MAX_IMPORTS_PER_DAY; i++) {
      const sid = await uploadedSession(account);
      await beginExtraction(account, { sessionId: sid, dayKey: DAY });
    }
    // The 6th is refused BEFORE any model call — no Pro result.
    const sixth = await uploadedSession(account);
    await expect(
      beginExtraction(account, { sessionId: sixth, dayKey: DAY }),
    ).rejects.toMatchObject({ code: "rate_limited" });
  });
});

describe("fail closed when the spend cap is missing (P22-07)", () => {
  it("refuses a direct begin with import_unavailable and makes no model call", async () => {
    const account = await createTestAccount();
    delete process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS;
    const port = new MockPlanExtractionPort(plan());
    __setPlanExtractionPort(port);
    const sid = await uploadedSession(account);
    await expect(
      beginExtraction(account, { sessionId: sid, dayKey: "2026-11-10" }),
    ).rejects.toMatchObject({ code: "import_unavailable" });
    // No model call happened (fail-closed before the port).
    expect(port.requests).toHaveLength(0);
    process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS = "100000000";
  });
});

describe("atomic lease claim (P22-08)", () => {
  it("a stale extracting lease is reclaimed; the prior attempt cannot overwrite the winner", async () => {
    const account = await createTestAccount();
    const prisma = getTestPrisma();
    // Seed a STALE extracting session: a prior attempt that crashed, its lease
    // long expired, holding an old token.
    const s = await prisma.importSession.create({
      data: {
        userId: account.userId,
        status: "extracting",
        sourceKind: "text",
        expiresAt: new Date(Date.now() + 86_400_000),
        leaseToken: "stale-token",
        leaseExpiresAt: new Date(Date.now() - 10 * 60_000), // 10m ago
        attemptCount: 1,
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

    // A fresh begin reclaims the stale lease and succeeds to review.
    __setPlanExtractionPort(new MockPlanExtractionPort(plan()));
    const status = await beginExtraction(account, {
      sessionId: s.id,
      dayKey: "2026-11-11",
    });
    expect(status.step).toBe("review");

    // The prior attempt now tries to write a terminal failure under its STALE
    // token — it must update zero rows (CAS on leaseToken), never overwriting the
    // winner's review draft.
    const loserWrite = await prisma.importSession.updateMany({
      where: { id: s.id, leaseToken: "stale-token" },
      data: { status: "failed_final", errorCode: "provider_rejected" },
    });
    expect(loserWrite.count).toBe(0);
    const after = await getImportStatus(account, s.id);
    expect(after.status).toBe("review"); // winner stands
  });
});
