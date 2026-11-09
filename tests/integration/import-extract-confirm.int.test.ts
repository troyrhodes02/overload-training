import { randomUUID } from "node:crypto";
import type { Account } from "@/lib/data/account";
import { getTestPrisma } from "./support/db";
import { createTestAccount } from "./support/accounts";
import { beginExtraction, retryExtraction } from "@/lib/import/extract";
import { confirmImport } from "@/lib/import/confirm";
import { stageCustomExercise } from "@/lib/import/review";
import {
  __setPlanExtractionPort,
  type PlanExtractionPort,
} from "@/lib/import/extraction";
import {
  MockPlanExtractionPort,
  mockSuccess,
} from "@/lib/import/extraction/mock";
import type { ExtractionResult } from "@/lib/import/extraction/port";
import type { ImportDraft } from "@/lib/import/draft/types";

/**
 * Workout Plan Import & Review (OVE-106) — the extraction → review → confirm
 * vertical, against the throwaway Postgres with a MOCKED provider (no real call).
 * Proves the adversarial invariants: idempotent confirm (one plan; retry → same
 * mesocycleId; rollback on nested failure; ZERO logged/baseline writes; goes
 * through the existing writers), stale-lease recovery, and the retry taxonomy.
 */

const CAP = process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS;
const MODEL = process.env.PLAN_IMPORT_MODEL;

beforeAll(() => {
  process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS = "100000000"; // $100 cap
  process.env.PLAN_IMPORT_MODEL = "mock-model";
});
afterAll(() => {
  if (CAP === undefined) delete process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS;
  else process.env.PLAN_IMPORT_MONTHLY_SPEND_MICROS = CAP;
  if (MODEL === undefined) delete process.env.PLAN_IMPORT_MODEL;
  else process.env.PLAN_IMPORT_MODEL = MODEL;
});
afterEach(() => __setPlanExtractionPort(null));

function field(raw: string | null) {
  return { raw, legible: true, evidence: null };
}

/** A two-exercise, one-day plan observation; one name matches a seeded lib row. */
function planObservation(benchName = "Barbell Bench Press") {
  return mockSuccess({
    isWorkoutPlan: true,
    title: field("Imported PPL"),
    days: [
      {
        order: 0,
        label: field("Push"),
        notes: field(null),
        exercises: [
          {
            order: 0,
            groupLabel: field(null),
            name: field(benchName),
            sets: field("3"),
            reps: field("6-8"),
            load: field("185 lb"),
            rest: field("2 min"),
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

async function seedUploadedTextSession(
  account: Account,
  text: string,
): Promise<string> {
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

async function seedLibraryExercise(name: string) {
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

async function reviewDraft(
  account: Account,
  sessionId: string,
): Promise<ImportDraft> {
  const s = await getTestPrisma().importSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { draft: true },
  });
  return s.draft as unknown as ImportDraft;
}

describe("extraction → review (mocked provider)", () => {
  it("a matched library name produces a confirmable review draft", async () => {
    const account = await createTestAccount();
    await seedLibraryExercise("Barbell Bench Press");
    __setPlanExtractionPort(new MockPlanExtractionPort(planObservation()));

    const sessionId = await seedUploadedTextSession(
      account,
      "Push\nBench Press 3x6-8 @185 lb",
    );
    const status = await beginExtraction(account, { sessionId, dayKey: DAY });
    expect(status.step).toBe("review");

    const draft = await reviewDraft(account, sessionId);
    expect(draft.days[0].exercises[0].match.kind).toBe("matched");
    // Load/rest are context only, never plan fields.
    const ctx = draft.days[0].exercises[0].context.map((c) => c.label);
    expect(ctx).toEqual(expect.arrayContaining(["Load", "Rest"]));
  });

  it("isWorkoutPlan:false → not_a_plan, no draft, nothing to confirm", async () => {
    const account = await createTestAccount();
    const notPlan = mockSuccess({
      isWorkoutPlan: false,
      title: field(null),
      days: [],
      generalNotes: field(null),
      unreadable: [],
      contradictions: [],
    });
    __setPlanExtractionPort(new MockPlanExtractionPort(notPlan));
    const sessionId = await seedUploadedTextSession(account, "a shopping list");
    const status = await beginExtraction(account, { sessionId, dayKey: DAY });
    expect(status.status).toBe("not_a_plan");
    await expect(
      confirmImport(account, { sessionId, version: 0 }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
  });
});

describe("idempotent confirm (P22-05)", () => {
  async function toReview(account: Account): Promise<string> {
    await seedLibraryExercise("Barbell Bench Press");
    __setPlanExtractionPort(new MockPlanExtractionPort(planObservation()));
    const sessionId = await seedUploadedTextSession(
      account,
      "Push\nBench 3x6-8",
    );
    await beginExtraction(account, { sessionId, dayKey: DAY });
    return sessionId;
  }

  it("creates exactly ONE draft mesocycle through the existing writers", async () => {
    const account = await createTestAccount();
    const prisma = getTestPrisma();
    const sessionId = await toReview(account);

    const before = await prisma.mesocycle.count();
    const { mesocycleId } = await confirmImport(account, {
      sessionId,
      version: 0,
    });
    const after = await prisma.mesocycle.count();
    expect(after).toBe(before + 1);

    const meso = await prisma.mesocycle.findUniqueOrThrow({
      where: { id: mesocycleId },
      include: { sessions: { include: { sessionExercises: true } } },
    });
    // Draft (never active) — activation stays separate.
    expect(meso.status).toBe("draft");
    expect(meso.sessions).toHaveLength(1);
    expect(meso.sessions[0].sessionExercises).toHaveLength(1);
    const slot = meso.sessions[0].sessionExercises[0];
    expect(slot.plannedSets).toBe(3);
    expect(slot.targetRepMin).toBe(6);
    expect(slot.targetRepMax).toBe(8);
    // Provenance attached.
    const session = await prisma.importSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(session.status).toBe("confirmed");
    expect(session.mesocycleId).toBe(mesocycleId);
  });

  it("a retried confirm returns the SAME mesocycle, never a second", async () => {
    const account = await createTestAccount();
    const prisma = getTestPrisma();
    const sessionId = await toReview(account);

    const first = await confirmImport(account, { sessionId, version: 0 });
    const beforeRetry = await prisma.mesocycle.count();
    // A dropped-connection double-click: same input again.
    const second = await confirmImport(account, { sessionId, version: 0 });
    const afterRetry = await prisma.mesocycle.count();

    expect(second.mesocycleId).toBe(first.mesocycleId);
    expect(afterRetry).toBe(beforeRetry); // no second plan
  });

  it("writes ZERO logged-history / baseline rows", async () => {
    const account = await createTestAccount();
    const prisma = getTestPrisma();
    const sessionId = await toReview(account);
    await confirmImport(account, { sessionId, version: 0 });

    expect(await prisma.loggedSession.count()).toBe(0);
    expect(await prisma.loggedExercise.count()).toBe(0);
    expect(await prisma.loggedSet.count()).toBe(0);
    expect(await prisma.gymExerciseBaseline.count()).toBe(0);
  });

  it("rolls the whole plan back when a nested write fails (no partial plan, no orphan custom)", async () => {
    const account = await createTestAccount();
    const prisma = getTestPrisma();
    // An unknown exercise the lifter stages as a custom with an INVALID muscle so
    // createCustomExercise throws inside the transaction.
    __setPlanExtractionPort(
      new MockPlanExtractionPort(planObservation("Totally Unknown Lift")),
    );
    const sessionId = await seedUploadedTextSession(
      account,
      "Push\nUnknown 3x8",
    );
    await beginExtraction(account, { sessionId, dayKey: DAY });

    // Stage a custom (valid), then corrupt the stored draft's staged muscle so the
    // writer rejects it mid-transaction — proving the rollback.
    const draft = await reviewDraft(account, sessionId);
    const exKey = draft.days[0].exercises[0].key;
    const staged = await stageCustomExercise(account, {
      sessionId,
      version: draft.version, // fresh draft after extraction is version 0
      exerciseKey: exKey,
      name: "Unknown Lift",
      primaryMuscle: "chest",
      equipmentType: "barbell",
    });
    // Tamper the stored staged match to an invalid muscle (bypassing the action's
    // validation) to force a mid-tx failure.
    const bad = structuredClone(staged) as ImportDraft;
    (
      bad.days[0].exercises[0].match as { primaryMuscle: string }
    ).primaryMuscle = "not_a_muscle";
    await prisma.importSession.update({
      where: { id: sessionId },
      data: { draft: bad as object },
    });

    const mesoBefore = await prisma.mesocycle.count();
    const exBefore = await prisma.exercise.count();
    await expect(
      confirmImport(account, { sessionId, version: bad.version }),
    ).rejects.toBeTruthy();
    expect(await prisma.mesocycle.count()).toBe(mesoBefore); // no partial plan
    expect(await prisma.exercise.count()).toBe(exBefore); // no orphan custom
    const session = await prisma.importSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(session.status).toBe("review"); // unchanged
    expect(session.mesocycleId).toBeNull();
  });
});

describe("confirm review fixes (Pitch 22 review)", () => {
  async function toReview(account: Account): Promise<string> {
    await seedLibraryExercise("Barbell Bench Press");
    __setPlanExtractionPort(new MockPlanExtractionPort(planObservation()));
    const sessionId = await seedUploadedTextSession(
      account,
      "Push\nBench 3x6-8",
    );
    await beginExtraction(account, { sessionId, dayKey: DAY });
    return sessionId;
  }

  it("refuses an intra-day duplicate (two matched exercises → same lib id) with a blocker, never a dead-end rollback", async () => {
    const account = await createTestAccount();
    const prisma = getTestPrisma();
    const sessionId = await toReview(account);

    // Tamper the stored draft to list the SAME library exercise twice in one day —
    // the shape that would collide on SessionExercise @@unique([sessionId,
    // exerciseId]) and roll the whole confirm back with no path to fix.
    const draft = await reviewDraft(account, sessionId);
    const first = draft.days[0].exercises[0];
    const dup = structuredClone(first);
    dup.key = "d0e1";
    draft.days[0].exercises.push(dup);
    await prisma.importSession.update({
      where: { id: sessionId },
      data: { draft: draft as object },
    });

    const mesoBefore = await prisma.mesocycle.count();
    // Confirm re-derives blockers server-side and refuses with a validation error
    // (the DUPLICATE_EXERCISE_IN_DAY blocker), NOT an opaque rollback.
    await expect(
      confirmImport(account, { sessionId, version: draft.version }),
    ).rejects.toMatchObject({ code: "validation_error" });
    expect(await prisma.mesocycle.count()).toBe(mesoBefore); // nothing created
    const session = await prisma.importSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(session.status).toBe("review"); // still fixable, not stuck
    expect(session.mesocycleId).toBeNull();
  });

  it("two overlapping confirms resolve to the SAME mesocycle (idempotent race)", async () => {
    const account = await createTestAccount();
    const prisma = getTestPrisma();
    const sessionId = await toReview(account);

    const before = await prisma.mesocycle.count();
    // Fire both confirms concurrently; the loser must recover the winner's plan
    // (the CAS-0-rows conflict is caught and re-read), not surface a conflict.
    const [a, b] = await Promise.all([
      confirmImport(account, { sessionId, version: 0 }),
      confirmImport(account, { sessionId, version: 0 }),
    ]);
    expect(a.mesocycleId).toBe(b.mesocycleId);
    // Exactly one plan was created across both calls.
    expect(await prisma.mesocycle.count()).toBe(before + 1);
    const session = await prisma.importSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(session.mesocycleId).toBe(a.mesocycleId);
  });
});

describe("retry / stale-lease recovery (P22-07)", () => {
  it("a retryable failure → failed_retryable; retry re-runs and can succeed", async () => {
    const account = await createTestAccount();
    await seedLibraryExercise("Barbell Bench Press");
    // First attempt: retryable failure; second: success.
    const script: ExtractionResult[] = [
      { ok: false, code: "provider_unavailable", retryable: true },
      planObservation(),
    ];
    __setPlanExtractionPort(new MockPlanExtractionPort(script));
    const sessionId = await seedUploadedTextSession(account, "Push\nBench 3x8");

    const first = await beginExtraction(account, { sessionId, dayKey: DAY });
    expect(first.status).toBe("failed_retryable");

    const retried = await retryExtraction(account, { sessionId, dayKey: DAY });
    expect(retried.step).toBe("review");
  });

  it("a terminal failure does not become retryable", async () => {
    const account = await createTestAccount();
    const port: PlanExtractionPort = {
      async extract() {
        return { ok: false, code: "provider_rejected", retryable: false };
      },
    };
    __setPlanExtractionPort(port);
    const sessionId = await seedUploadedTextSession(account, "Push\nBench 3x8");
    const status = await beginExtraction(account, { sessionId, dayKey: DAY });
    expect(status.status).toBe("failed_final");
    await expect(
      retryExtraction(account, { sessionId, dayKey: DAY }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
  });
});
