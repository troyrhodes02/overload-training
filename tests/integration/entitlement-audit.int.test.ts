/**
 * Free/Pro Entitlement Audit — adversarial proof that the Pro boundary holds
 * on the real read path for every supported plan state, that Free responses
 * carry no Pro value even in their serialized form, that the upgrade marker
 * never stands in for missing data, and that a downgrade changes nothing a
 * lifter logged. Everything runs against the throwaway integration database;
 * the entitlement is resolved from stored rows on each read (never from the
 * caller), exactly as in production.
 */
const mockRequireAccount = jest.fn();
jest.mock("@/lib/data/account", () => ({
  ...jest.requireActual("@/lib/data/account"),
  requireAccount: () => mockRequireAccount(),
}));

import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
} from "./support/plan-factories";
import { createTestAccount } from "./support/accounts";
import {
  getOccurrenceProgression,
  getPlannedProgression,
  getSessionProgressionSummary,
} from "@/lib/progression/queries";
import { getExerciseHistory } from "@/lib/progression/history-queries";
import { resolveEntitlement } from "@/lib/entitlements/resolve";
import { editLoggedSet, logSet } from "@/lib/logging/logged-sets";
import { MS_PER_DAY } from "@/lib/billing/config";
import type { Account } from "@/lib/data/account";
import { startImportAction } from "@/app/(app)/plan/import/actions";

const DAY = MS_PER_DAY;
const at = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY);

/** Two complete sessions at the top of the range: a real Progress call. */
async function progressScenario(account: Account) {
  const p = getTestPrisma();
  const meso = await createTestMesocycle({
    status: "active",
    userId: account.userId,
  });
  const ex = await createTestExercise({
    equipmentType: "barbell",
    userId: account.userId,
  });
  let done = { loggedSessionId: "", loggedExerciseId: "" };
  const setIds: string[] = [];
  for (const [i, date] of ["2026-11-02", "2026-11-09"].entries()) {
    const ls = await p.loggedSession.create({
      data: {
        userId: account.userId,
        mesocycleId: meso.id,
        performedOn: new Date(`${date}T12:00:00Z`),
        scheduledFor: new Date(`${date}T00:00:00Z`),
        status: "complete",
      },
    });
    const le = await p.loggedExercise.create({
      data: {
        userId: account.userId,
        loggedSessionId: ls.id,
        exerciseId: ex.id,
        plannedExerciseId: ex.id,
        plannedSets: 3,
        targetRepMin: 6,
        targetRepMax: 8,
      },
    });
    for (let n = 0; n < 3; n++) {
      const s = await p.loggedSet.create({
        data: {
          userId: account.userId,
          loggedExerciseId: le.id,
          setNumber: n + 1,
          weightLbs: 185,
          reps: 8,
          rir: 2,
          createdAt: new Date(`2025${date.slice(4)}T12:0${n}:00Z`),
        },
      });
      setIds.push(s.id);
    }
    if (i === 1) done = { loggedSessionId: ls.id, loggedExerciseId: le.id };
  }
  return { exId: ex.id, mesoId: meso.id, done, setIds };
}

async function readAll(
  account: Account,
  s: {
    exId: string;
    done: { loggedSessionId: string; loggedExerciseId: string };
  },
) {
  const [planned, occurrence, summary, history] = await Promise.all([
    getPlannedProgression(account, s.exId, { scheduledDeloadWeek: false }),
    getOccurrenceProgression(account, s.done.loggedExerciseId),
    getSessionProgressionSummary(account, s.done.loggedSessionId),
    getExerciseHistory(account, s.exId),
  ]);
  return {
    planned,
    occurrence: occurrence!,
    summary: summary!,
    history: history!,
  };
}

function expectPro(r: Awaited<ReturnType<typeof readAll>>) {
  expect(r.planned.locked).toBeNull();
  expect(r.planned.tag).toBe("progress");
  expect(r.planned.recommendation).not.toBeNull();
  expect(r.occurrence.locked).toBeNull();
  expect(r.occurrence.recommendation).not.toBeNull();
  expect(r.summary.locked).toBeNull();
  expect(r.summary.exercises[0].recommendation).not.toBeNull();
  expect(r.history.locked).toBeNull();
  const rec = r.history.records;
  expect(rec?.kind === "loaded" ? rec.bestE1rm : null).not.toBeNull();
  expect(rec?.kind === "loaded" ? rec.repRecords : null).not.toBeNull();
  expect(r.history.trend.e1rm?.points.length).toBeGreaterThan(0);
  expect(r.history.sessions.rows.some((x) => x.call !== "none")).toBe(true);
}

function expectFree(r: Awaited<ReturnType<typeof readAll>>) {
  expect(r.planned.locked).toBe("progression_insights");
  expect(r.planned.tag).toBeNull();
  expect(r.planned.recommendation).toBeNull();
  expect(r.planned.suggestion).toBeNull();
  expect(r.occurrence.locked).toBe("progression_insights");
  expect(r.occurrence.tag).toBeNull();
  expect(r.occurrence.recommendation).toBeNull();
  expect(r.occurrence.suggestion).toBeNull();
  expect(r.occurrence.rirEffect).toBeNull();
  expect(r.summary.locked).toBe("progression_insights");
  for (const e of r.summary.exercises) {
    expect(e.tag).toBeNull();
    expect(e.recommendation).toBeNull();
    expect(e.suggestion).toBeNull();
  }
  expect(r.history.locked).toBe("progression_insights");
  const rec = r.history.records;
  if (rec?.kind !== "loaded") throw new Error("loaded records expected");
  expect(rec.bestE1rm).toBeNull();
  expect(rec.repRecords).toBeNull();
  expect(r.history.trend.e1rm).toBeNull();
  expect(r.history.trend.weight).toBeNull();
  expect(r.history.sessions.rows.every((x) => x.call === "none")).toBe(true);
  // Free keeps every logged value.
  expect(rec.bestSet).toMatchObject({ weightLbs: 185, reps: 8 });
  expect(r.history.sessions.rows).toHaveLength(2);
  for (const row of r.history.sessions.rows) {
    expect(row.workingSets).toEqual([
      { weightLbs: 185, reps: 8, rir: 2 },
      { weightLbs: 185, reps: 8, rir: 2 },
      { weightLbs: 185, reps: 8, rir: 2 },
    ]);
  }
  // A loaded lift's reps trend is null on every plan (reps-only lifts have one).
  expect(r.history.trend.reps).toBeNull();
}

// ---------------------------------------------------------------------------
// Plan-state matrix (the audit's section 5 table), resolved from stored rows.
// ---------------------------------------------------------------------------

type Setup = (userId: string) => Promise<void>;

const trial =
  (startedAt: Date, endsAt: Date): Setup =>
  async (userId) => {
    await getTestPrisma().entitlement.create({
      data: { userId, source: "trial", plan: "pro", startedAt, endsAt },
    });
  };
const comp =
  (opts: { endsAt?: Date | null; revokedAt?: Date | null } = {}): Setup =>
  async (userId) => {
    await getTestPrisma().entitlement.create({
      data: {
        userId,
        source: "comp",
        plan: "pro",
        startedAt: at(-30),
        endsAt: opts.endsAt ?? null,
        revokedAt: opts.revokedAt ?? null,
        revokedByUserId: opts.revokedAt ? userId : null,
        compReason: "tester",
        grantedByUserId: userId,
      },
    });
  };
const sub =
  (b: {
    status: "active" | "past_due" | "canceled" | "unpaid" | "incomplete";
    interval?: "month" | "year";
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd?: Date | null;
    graceEndsAt?: Date | null;
  }): Setup =>
  async (userId) => {
    await getTestPrisma().billingAccount.create({
      data: {
        userId,
        stripeCustomerId: `cus_${userId.slice(0, 8)}`,
        subscriptionId: `sub_${userId.slice(0, 8)}`,
        status: b.status,
        interval: b.interval ?? "month",
        cancelAtPeriodEnd: b.cancelAtPeriodEnd ?? false,
        currentPeriodEnd: b.currentPeriodEnd ?? at(20),
        graceEndsAt: b.graceEndsAt ?? null,
      },
    });
  };
const both =
  (...s: Setup[]): Setup =>
  async (userId) => {
    for (const f of s) await f(userId);
  };

const MATRIX: [string, Setup, "pro" | "free"][] = [
  ["trial within its 14 days", trial(at(-3), at(11)), "pro"],
  [
    "paid monthly subscription",
    sub({ status: "active", interval: "month" }),
    "pro",
  ],
  [
    "paid annual subscription",
    sub({ status: "active", interval: "year" }),
    "pro",
  ],
  ["open-ended complimentary grant", comp(), "pro"],
  ["dated complimentary grant still running", comp({ endsAt: at(5) }), "pro"],
  ["trial expired, no subscription", trial(at(-20), at(-6)), "free"],
  [
    "canceled but paid through the period",
    sub({ status: "active", cancelAtPeriodEnd: true, currentPeriodEnd: at(4) }),
    "pro",
  ],
  [
    "canceled, period over, deletion webhook late (stale mirror)",
    sub({
      status: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: at(-1),
    }),
    "free",
  ],
  ["subscription expired (canceled)", sub({ status: "canceled" }), "free"],
  ["subscription unpaid", sub({ status: "unpaid" }), "free"],
  [
    "checkout never completed (incomplete)",
    sub({ status: "incomplete" }),
    "free",
  ],
  [
    "payment failed, inside grace",
    sub({ status: "past_due", graceEndsAt: at(3) }),
    "pro",
  ],
  [
    "payment failed, grace over",
    sub({ status: "past_due", graceEndsAt: at(-1) }),
    "free",
  ],
  ["complimentary grant expired", comp({ endsAt: at(-1) }), "free"],
  ["complimentary grant revoked", comp({ revokedAt: at(-1) }), "free"],
  [
    "comp revoked, trial still running: falls back to the trial",
    both(comp({ revokedAt: at(-1) }), trial(at(-2), at(12))),
    "pro",
  ],
  [
    "comp expired, subscription active: falls back to the subscription",
    both(comp({ endsAt: at(-1) }), sub({ status: "active" })),
    "pro",
  ],
  ["no plan at all", async () => {}, "free"],
];

describe("every plan state resolves to the right access on the real read path", () => {
  it.each(MATRIX)("%s → %s", async (_label, setup, expected) => {
    const account = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    await setup(account.userId);
    const s = await progressScenario(account);
    const r = await readAll(account, s);
    if (expected === "pro") expectPro(r);
    else expectFree(r);
    expect((await resolveEntitlement(account)).plan).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Serialized Free payloads hold no Pro value (not merely hidden in the UI).
// ---------------------------------------------------------------------------

describe("a Free payload carries no Pro value once serialized", () => {
  it("the RSC-bound DTOs contain none of the Pro twin's call, evidence, estimate, or frontier", async () => {
    const pro = await createTestAccount("UTC", undefined, {
      entitlement: "pro",
    });
    const free = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const proR = await readAll(pro, await progressScenario(pro));
    const freeR = await readAll(free, await progressScenario(free));

    const proRec = proR.history.records;
    if (proRec?.kind !== "loaded") throw new Error("loaded records expected");
    const secrets = [
      proR.planned.recommendation!.action,
      proR.planned.recommendation!.evidence,
      proR.occurrence.recommendation!.action,
      proR.summary.exercises[0].recommendation!.evidence,
      `"bestE1rm":${proRec.bestE1rm}`,
      `"latest":${proR.history.trend.e1rm!.latest}`,
      '"tag":"progress"',
      '"call":"progress"',
    ];
    const payload = JSON.stringify(freeR);
    for (const s of secrets) expect(payload).not.toContain(s);
    // The rep-record frontier is absent, not an empty list to fill later.
    expect(payload).toContain('"repRecords":null');
  });
});

// ---------------------------------------------------------------------------
// Missing data is never presented as a paywall, on either plan.
// ---------------------------------------------------------------------------

describe("insufficient history shows its empty state, not an upgrade prompt", () => {
  async function oneSession(account: Account) {
    const p = getTestPrisma();
    const ex = await createTestExercise({
      equipmentType: "bodyweight",
      userId: account.userId,
    });
    const ls = await p.loggedSession.create({
      data: {
        userId: account.userId,
        performedOn: new Date("2026-11-02T12:00:00Z"),
        scheduledFor: new Date("2026-11-02T00:00:00Z"),
        status: "complete",
      },
    });
    const le = await p.loggedExercise.create({
      data: {
        userId: account.userId,
        loggedSessionId: ls.id,
        exerciseId: ex.id,
        plannedExerciseId: ex.id,
        plannedSets: 1,
        targetRepMin: 8,
        targetRepMax: 12,
      },
    });
    await p.loggedSet.create({
      data: {
        userId: account.userId,
        loggedExerciseId: le.id,
        setNumber: 1,
        reps: 10,
      },
    });
    return {
      exId: ex.id,
      done: { loggedSessionId: ls.id, loggedExerciseId: le.id },
    };
  }

  it.each(["pro", "none"] as const)(
    "a never-logged exercise has no history and no upgrade marker (entitlement: %s)",
    async (entitlement) => {
      const account = await createTestAccount("UTC", undefined, {
        entitlement,
      });
      const ex = await createTestExercise({
        equipmentType: "barbell",
        userId: account.userId,
      });
      const history = (await getExerciseHistory(account, ex.id))!;
      expect(history.hasHistory).toBe(false);
      expect(history.locked).toBeNull();
      const planned = await getPlannedProgression(account, ex.id, {
        scheduledDeloadWeek: false,
      });
      expect(planned.locked).toBeNull();
    },
  );

  it.each(["pro", "none"] as const)(
    "one session: the same not-enough-history line, and no upgrade marker (entitlement: %s)",
    async (entitlement) => {
      const account = await createTestAccount("UTC", undefined, {
        entitlement,
      });
      const s = await oneSession(account);
      const r = await readAll(account, s);
      expect(r.history.next).toMatchObject({
        kind: "call",
        tag: null,
        recommendation: null,
        insufficientNote: "Not enough history yet: 1 of 2 complete sessions.",
      });
      // A bodyweight lift has no e1RM and no call yet: nothing Pro to withhold.
      expect(r.history.locked).toBeNull();
      expect(r.occurrence.locked).toBeNull();
      expect(r.summary.locked).toBeNull();
      expect(r.planned.locked).toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
// Downgrade and re-upgrade: nothing logged changes; interpretation returns.
// ---------------------------------------------------------------------------

describe("losing Pro changes nothing the lifter logged", () => {
  it("a revoked comp withholds insights, keeps every set and RIR, and re-granting restores them", async () => {
    const p = getTestPrisma();
    const account = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    await comp()(account.userId);
    const s = await progressScenario(account);
    const before = await p.loggedSet.findMany({
      where: { userId: account.userId },
      orderBy: { id: "asc" },
    });
    const goal = await p.goal.create({
      data: {
        userId: account.userId,
        exerciseId: s.exId,
        targetWeightLbs: 225,
        targetReps: 5,
      },
    });
    expectPro(await readAll(account, s));

    await p.entitlement.updateMany({
      where: { userId: account.userId, source: "comp" },
      data: { revokedAt: at(-0.001), revokedByUserId: account.userId },
    });
    expectFree(await readAll(account, s));
    const after = await p.loggedSet.findMany({
      where: { userId: account.userId },
      orderBy: { id: "asc" },
    });
    expect(after).toEqual(before);
    expect(await p.goal.findUnique({ where: { id: goal.id } })).not.toBeNull();
    expect(
      await p.mesocycle.findUnique({ where: { id: s.mesoId } }),
    ).not.toBeNull();

    await comp()(account.userId);
    expectPro(await readAll(account, s));
  });
});

// ---------------------------------------------------------------------------
// Capture stays Free: a Free account logs and corrects sets, RIR included.
// ---------------------------------------------------------------------------

describe("a Free account records and corrects training data", () => {
  it("logs a set with RIR and edits it, through the one write module", async () => {
    const p = getTestPrisma();
    const account = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const ex = await createTestExercise({
      equipmentType: "barbell",
      userId: account.userId,
    });
    const ls = await p.loggedSession.create({
      data: {
        userId: account.userId,
        performedOn: new Date("2026-11-10T12:00:00Z"),
        scheduledFor: new Date("2026-11-10T00:00:00Z"),
        status: "in_progress",
      },
    });
    const le = await p.loggedExercise.create({
      data: {
        userId: account.userId,
        loggedSessionId: ls.id,
        exerciseId: ex.id,
        plannedExerciseId: ex.id,
        plannedSets: 3,
        targetRepMin: 6,
        targetRepMax: 8,
      },
    });
    const set = await logSet(account, {
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: 185,
      reps: 7,
      rir: 1,
    });
    expect({ ...set, weightLbs: Number(set.weightLbs) }).toMatchObject({
      weightLbs: 185,
      reps: 7,
      rir: 1,
    });
    const edited = await editLoggedSet(account, {
      loggedSetId: set.id,
      weightLbs: 190,
      reps: 6,
      rir: 0,
    });
    expect({ ...edited, weightLbs: Number(edited.weightLbs) }).toMatchObject({
      weightLbs: 190,
      reps: 6,
      rir: 0,
    });
    expect((await resolveEntitlement(account)).plan).toBe("free");
  });
});

// ---------------------------------------------------------------------------
// Another account's ids reveal nothing, Pro or not.
// ---------------------------------------------------------------------------

describe("another account's record ids expose no history or insight", () => {
  it("a Pro intruder reading a Pro owner's ids gets not-found everywhere", async () => {
    const owner = await createTestAccount("UTC", undefined, {
      entitlement: "pro",
    });
    const intruder = await createTestAccount("UTC", undefined, {
      entitlement: "pro",
    });
    const s = await progressScenario(owner);
    expect(await getExerciseHistory(intruder, s.exId)).toBeNull();
    expect(
      await getOccurrenceProgression(intruder, s.done.loggedExerciseId),
    ).toBeNull();
    expect(
      await getSessionProgressionSummary(intruder, s.done.loggedSessionId),
    ).toBeNull();
    const planned = await getPlannedProgression(intruder, s.exId, {
      scheduledDeloadWeek: false,
    });
    expect(planned.tag).toBeNull();
    expect(planned.recommendation).toBeNull();
    expect(planned.hasTrend).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Forged client entitlement flags change nothing; the kill switch holds for Pro.
// ---------------------------------------------------------------------------

describe("a Pro server action ignores client-supplied entitlement claims", () => {
  const prev = process.env.PLAN_IMPORT_ENABLED;
  afterEach(() => {
    if (prev === undefined) delete process.env.PLAN_IMPORT_ENABLED;
    else process.env.PLAN_IMPORT_ENABLED = prev;
  });

  it("a Free account posting isPro/plan/capabilities/userId is refused with plan_required", async () => {
    process.env.PLAN_IMPORT_ENABLED = "true";
    const free = await createTestAccount("UTC", undefined, {
      entitlement: "none",
    });
    const pro = await createTestAccount("UTC", undefined, {
      entitlement: "pro",
    });
    mockRequireAccount.mockResolvedValue(free);
    const forged = {
      mode: "text",
      isPro: true,
      plan: "pro",
      capabilities: ["plan_import"],
      userId: pro.userId,
    } as unknown as { mode: "text" };
    const res = await startImportAction(forged);
    expect(res).toMatchObject({ ok: false, error: { code: "plan_required" } });
    expect(
      await getTestPrisma().importSession.count({
        where: { userId: { in: [free.userId, pro.userId] } },
      }),
    ).toBe(0);
  });

  it("a Pro account cannot invoke import while the kill switch is off", async () => {
    delete process.env.PLAN_IMPORT_ENABLED;
    const pro = await createTestAccount("UTC", undefined, {
      entitlement: "pro",
    });
    mockRequireAccount.mockResolvedValue(pro);
    const res = await startImportAction({ mode: "text" });
    expect(res).toMatchObject({
      ok: false,
      error: { code: "import_unavailable" },
    });
  });
});
