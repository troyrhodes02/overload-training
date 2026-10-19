import { DomainError } from "@/lib/actions/result";
import { editCardioLog, logCardio } from "@/lib/cardio/cardio-logs";
import { getCardioWeek } from "@/lib/cardio/queries";
import { getTodayDashboard } from "@/lib/logging/queries";
import { loadScheduleContext } from "@/lib/logging/schedule-context";
import { logSet } from "@/lib/logging/logged-sets";
import { resolveMissedDay } from "@/lib/logging/missed-days";
import { completeWorkout, startOrResumeWorkout } from "@/lib/logging/sessions";
import { addDays, parseIsoDate, toIsoDate } from "@/lib/plan/calendar";
import { updatePlannedCardio } from "@/lib/plan/cardio";
import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
  createTestSession,
  createTestSessionExercise,
  historyCounts,
} from "./support/plan-factories";
import type { Account } from "@/lib/data/account";
import { defaultAccount } from "./support/accounts";

// Multi-User Foundation: these suites act as the default test account.
let account: Account;
beforeEach(async () => {
  account = await defaultAccount();
});

/**
 * Cardio Logging — the CardioLog write path and today's cardio (OVE-34; spec
 * §11b–§11d, R13–R29, R34, R38–R47, R54–R62, R66). Dates are relative to the
 * real (UTC) today, because "due" and "today" are wall-clock rules; each
 * mesocycle starts on a date whose weekday is today's, so a lifting shift of
 * a today-weekday occurrence never leaves its week.
 */
const prisma = () => getTestPrisma();
const TODAY = toIsoDate(new Date());

function weekday(iso: string): number {
  return ((parseIsoDate(iso)!.getUTCDay() + 6) % 7) + 1;
}
const W = weekday(TODAY); // today's ISO weekday
const dayAfter = (n: number) => ((W - 1 + n) % 7) + 1; // W+n, wrapped

async function fails(p: Promise<unknown>): Promise<DomainError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DomainError);
  return err as DomainError;
}

/**
 * An active block starting `startOffset` days from today (a multiple of 7, so
 * its weeks start on today's weekday). Optional Pull Day on today's weekday,
 * planned cardio on today's weekday (Incline Walk 20) and on W+2 (cardio-only
 * Bike 30), both created long before the block (no occurrence floor in play).
 */
async function block(
  opts: {
    startOffset?: number;
    lifting?: boolean;
    status?: "active" | "draft";
  } = {},
) {
  const start = addDays(TODAY, opts.startOffset ?? 0);
  const m = await createTestMesocycle({
    status: opts.status ?? "active",
    startDate: parseIsoDate(start)!,
    lengthWeeks: 5,
  });
  let session = null;
  let exercise = null;
  if (opts.lifting !== false) {
    session = await createTestSession(m.id, {
      name: "Pull Day 1",
      dayOfWeek: W,
    });
    exercise = await createTestExercise({
      name: "Barbell Row",
      primaryMuscle: "back",
    });
    await createTestSessionExercise(session.id, exercise.id, {
      plannedSets: 1,
    });
  }
  const longAgo = parseIsoDate(addDays(start, -30))!;
  const walk = await prisma().plannedCardio.create({
    data: {
      userId: account.userId,
      mesocycleId: m.id,
      dayOfWeek: W,
      type: "Incline Walk",
      durationMin: 20,
      createdAt: longAgo,
    },
  });
  const bike = await prisma().plannedCardio.create({
    data: {
      userId: account.userId,
      mesocycleId: m.id,
      dayOfWeek: dayAfter(2),
      type: "Bike",
      durationMin: 30,
      createdAt: longAgo,
    },
  });
  return { m, start, session, exercise, walk, bike };
}

async function weekEntries(mesocycleId: string, week: number) {
  const meso = await prisma().mesocycle.findUniqueOrThrow({
    where: { id: mesocycleId },
    include: { sessions: true },
  });
  const ctx = await loadScheduleContext(prisma(), {
    id: meso.id,
    startDate: meso.startDate!,
    lengthWeeks: meso.lengthWeeks,
    sessions: meso.sessions,
  });
  return getCardioWeek({ mesocycleId, ctx }, week, TODAY);
}

const strengthSnapshot = async () => ({
  counts: await historyCounts(),
  sets: await prisma().loggedSet.findMany({ orderBy: { id: "asc" } }),
  loggedSessions: await prisma().loggedSession.findMany({
    orderBy: { id: "asc" },
  }),
  goals: await prisma().goal.findMany({ orderBy: { id: "asc" } }),
  baselines: await prisma().gymExerciseBaseline.findMany(),
  plan: await prisma().plannedCardio.findMany({ orderBy: { id: "asc" } }),
});

describe("logCardio — the factual record", () => {
  it("records actual type and minutes with a snapshot of the plan; the plan is unchanged", async () => {
    const { m, walk } = await block();
    const before = await strengthSnapshot();
    const res = await logCardio({
      mesocycleId: m.id,
      scheduledFor: TODAY,
      type: " Incline Walk ",
      durationMin: "23",
    });
    expect(res.alreadyLogged).toBe(false);
    const row = await prisma().cardioLog.findUniqueOrThrow({
      where: { id: res.cardioLogId },
    });
    expect(row).toMatchObject({
      mesocycleId: m.id,
      plannedType: "Incline Walk",
      plannedDurationMin: 20,
      type: "Incline Walk",
      durationMin: 23,
    });
    expect(toIsoDate(row.scheduledFor)).toBe(TODAY);
    expect(toIsoDate(row.performedOn)).toBe(TODAY);
    // Nothing else moved: plan, lifting history, goals, baselines.
    expect(await strengthSnapshot()).toEqual(before);
    expect(
      await prisma().plannedCardio.findUniqueOrThrow({
        where: { id: walk.id },
      }),
    ).toEqual(walk);
  });

  it("records a different activity without touching the plan (no swap engine)", async () => {
    const { m, walk } = await block();
    const { cardioLogId } = await logCardio({
      mesocycleId: m.id,
      scheduledFor: TODAY,
      type: "Bike",
      durationMin: 25,
    });
    expect(
      await prisma().cardioLog.findUniqueOrThrow({
        where: { id: cardioLogId },
      }),
    ).toMatchObject({
      type: "Bike",
      durationMin: 25,
      plannedType: "Incline Walk",
    });
    expect(
      await prisma().plannedCardio.findUniqueOrThrow({
        where: { id: walk.id },
      }),
    ).toMatchObject({ type: "Incline Walk", durationMin: 20 });
  });

  it.each([
    [{ type: "", durationMin: "20" }, "type"],
    [{ type: "   ", durationMin: "20" }, "type"],
    [{ type: "Bike", durationMin: "" }, "durationMin"],
    [{ type: "Bike", durationMin: "0" }, "durationMin"],
    [{ type: "Bike", durationMin: "-5" }, "durationMin"],
    [{ type: "Bike", durationMin: "2.5" }, "durationMin"],
  ])("rejects %p and records nothing", async (fields, key) => {
    const { m } = await block();
    const err = await fails(
      logCardio({ mesocycleId: m.id, scheduledFor: TODAY, ...fields }),
    );
    expect(err.code).toBe("validation_error");
    expect(err.details?.[key]).toBeTruthy();
    expect(await prisma().cardioLog.count()).toBe(0);
  });

  it("a retry returns the existing record unchanged — never a second copy", async () => {
    const { m } = await block();
    const first = await logCardio({
      mesocycleId: m.id,
      scheduledFor: TODAY,
      type: "Incline Walk",
      durationMin: "23",
    });
    const row = await prisma().cardioLog.findUniqueOrThrow({
      where: { id: first.cardioLogId },
    });
    const retry = await logCardio({
      mesocycleId: m.id,
      scheduledFor: TODAY,
      type: "Bike",
      durationMin: "99",
    });
    expect(retry).toEqual({
      cardioLogId: first.cardioLogId,
      alreadyLogged: true,
    });
    expect(await prisma().cardioLog.count()).toBe(1);
    expect(
      await prisma().cardioLog.findUniqueOrThrow({
        where: { id: first.cardioLogId },
      }),
    ).toEqual(row);
  });

  it("concurrent submissions for one occurrence record exactly once", async () => {
    const { m } = await block();
    const input = {
      mesocycleId: m.id,
      scheduledFor: TODAY,
      type: "Incline Walk",
      durationMin: "20",
    };
    const results = await Promise.all([logCardio(input), logCardio(input)]);
    expect(await prisma().cardioLog.count()).toBe(1);
    expect(new Set(results.map((r) => r.cardioLogId)).size).toBe(1);
    expect(results.map((r) => r.alreadyLogged).sort()).toEqual([false, true]);
  });

  it("refuses an occurrence that isn't due yet", async () => {
    const { m } = await block();
    const err = await fails(
      logCardio({
        mesocycleId: m.id,
        scheduledFor: addDays(TODAY, 7),
        type: "Incline Walk",
        durationMin: 20,
      }),
    );
    expect(err.code).toBe("invalid_state_transition");
    expect(await prisma().cardioLog.count()).toBe(0);
  });

  it("refuses a day with no planned cardio (plan-first, no ad-hoc logs)", async () => {
    const { m } = await block({ startOffset: -14 });
    // W+1 has neither cardio nor lifting.
    const err = await fails(
      logCardio({
        mesocycleId: m.id,
        scheduledFor: addDays(TODAY, -6),
        type: "Outdoor Walk",
        durationMin: 30,
      }),
    );
    expect(err.code).toBe("not_found");
    expect(await prisma().cardioLog.count()).toBe(0);
  });

  it("refuses an occurrence from before the cardio was planned (occurrence floor)", async () => {
    const { m } = await block({ startOffset: -14 });
    await prisma().plannedCardio.create({
      data: {
        userId: account.userId,
        mesocycleId: m.id,
        dayOfWeek: dayAfter(3),
        type: "Rowing",
        durationMin: 15,
      },
    });
    const err = await fails(
      logCardio({
        mesocycleId: m.id,
        scheduledFor: addDays(TODAY, -4),
        type: "Rowing",
        durationMin: 15,
      }),
    );
    expect(err.code).toBe("not_found");
  });

  it("refuses a block that isn't active", async () => {
    const { m } = await block({ status: "draft" });
    const err = await fails(
      logCardio({
        mesocycleId: m.id,
        scheduledFor: TODAY,
        type: "Incline Walk",
        durationMin: 20,
      }),
    );
    expect(err.code).toBe("invalid_state_transition");
  });

  it("logs a missed past occurrence later — no prompt involved", async () => {
    const { m } = await block({ startOffset: -14 });
    const res = await logCardio({
      mesocycleId: m.id,
      scheduledFor: addDays(TODAY, -5), // last week's cardio-only Bike
      type: "Bike",
      durationMin: 30,
    });
    expect(res.alreadyLogged).toBe(false);
    expect(await prisma().missedDayResolution.count()).toBe(0);
  });
});

describe("editCardioLog — correction, never deletion", () => {
  it("corrects type and minutes; the snapshot and occurrence never change", async () => {
    const { m } = await block();
    const { cardioLogId } = await logCardio({
      mesocycleId: m.id,
      scheduledFor: TODAY,
      type: "Incline Walk",
      durationMin: 23,
    });
    const before = await prisma().cardioLog.findUniqueOrThrow({
      where: { id: cardioLogId },
    });
    await editCardioLog({ cardioLogId, type: "Treadmill", durationMin: "32" });
    const after = await prisma().cardioLog.findUniqueOrThrow({
      where: { id: cardioLogId },
    });
    expect(after).toMatchObject({
      type: "Treadmill",
      durationMin: 32,
      plannedType: before.plannedType,
      plannedDurationMin: before.plannedDurationMin,
      scheduledFor: before.scheduledFor,
      performedOn: before.performedOn,
      mesocycleId: before.mesocycleId,
    });
  });

  it("rejects an invalid correction and leaves the record unchanged", async () => {
    const { m } = await block();
    const { cardioLogId } = await logCardio({
      mesocycleId: m.id,
      scheduledFor: TODAY,
      type: "Incline Walk",
      durationMin: 23,
    });
    const before = await prisma().cardioLog.findUniqueOrThrow({
      where: { id: cardioLogId },
    });
    for (const bad of [
      { type: "Bike", durationMin: "-5" },
      { type: "Bike", durationMin: "0" },
      { type: "  ", durationMin: "20" },
    ]) {
      expect((await fails(editCardioLog({ cardioLogId, ...bad }))).code).toBe(
        "validation_error",
      );
    }
    expect(
      await prisma().cardioLog.findUniqueOrThrow({
        where: { id: cardioLogId },
      }),
    ).toEqual(before);
  });

  it("returns not_found for an unknown entry", async () => {
    const err = await fails(
      editCardioLog({
        cardioLogId: "00000000-0000-4000-8000-000000000000",
        type: "Bike",
        durationMin: 20,
      }),
    );
    expect(err.code).toBe("not_found");
  });

  it("editing the plan after logging never rewrites the record", async () => {
    const { m, walk } = await block();
    const { cardioLogId } = await logCardio({
      mesocycleId: m.id,
      scheduledFor: TODAY,
      type: "Incline Walk",
      durationMin: 23,
    });
    const before = await prisma().cardioLog.findUniqueOrThrow({
      where: { id: cardioLogId },
    });
    await updatePlannedCardio(account, {
      plannedCardioId: walk.id,
      dayOfWeek: W,
      type: "Stair Climber",
      durationMin: 45,
    });
    expect(
      await prisma().cardioLog.findUniqueOrThrow({
        where: { id: cardioLogId },
      }),
    ).toEqual(before);
  });
});

describe("independent completion (R26–R28)", () => {
  it("logging cardio leaves lifting pending, and today's dashboard shows both", async () => {
    const { m } = await block();
    await logCardio({
      mesocycleId: m.id,
      scheduledFor: TODAY,
      type: "Incline Walk",
      durationMin: 23,
    });
    const dash = await getTodayDashboard();
    expect(dash.kind).toBe("pending");
    if (dash.kind !== "pending") return;
    expect(dash.sessionName).toBe("Pull Day 1");
    expect(dash.cardio).toEqual([
      expect.objectContaining({
        state: "complete",
        log: expect.objectContaining({ durationMin: 23 }),
        differsFromPlan: true,
      }),
    ]);
    expect(await prisma().loggedSession.count()).toBe(0);
  });

  it("completing the workout leaves cardio pending, and cardio never changes the LoggedSession", async () => {
    const { m, session, exercise } = await block();
    const gym = await prisma().gym.create({
      data: { userId: account.userId, name: "Downtown Gym" },
    });
    const { loggedSessionId } = await startOrResumeWorkout({
      sessionId: session!.id,
      scheduledFor: TODAY,
      gymId: gym.id,
    });
    const le = await prisma().loggedExercise.findFirstOrThrow({
      where: { loggedSessionId, exerciseId: exercise!.id },
    });
    await logSet({
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: 185,
      reps: 8,
    });
    await completeWorkout({ loggedSessionId });

    let dash = await getTodayDashboard();
    expect(dash.kind).toBe("complete");
    if (dash.kind !== "complete") return;
    expect(dash.cardio.map((c) => c.state)).toEqual(["pending"]);

    const ls = await prisma().loggedSession.findUniqueOrThrow({
      where: { id: loggedSessionId },
    });
    await logCardio({
      mesocycleId: m.id,
      scheduledFor: TODAY,
      type: "Incline Walk",
      durationMin: 20,
    });
    expect(
      await prisma().loggedSession.findUniqueOrThrow({
        where: { id: loggedSessionId },
      }),
    ).toEqual(ls);
    dash = await getTodayDashboard();
    expect(dash.kind).toBe("complete");
    if (dash.kind === "complete")
      expect(dash.cardio.map((c) => c.state)).toEqual(["complete"]);
  });

  it("a cardio-only day is a rest day for lifting with cardio to log — no fake workout", async () => {
    const { m } = await block({ lifting: false });
    let dash = await getTodayDashboard();
    expect(dash.kind).toBe("rest");
    if (dash.kind !== "rest") return;
    expect(dash.cardio).toEqual([
      expect.objectContaining({
        state: "pending",
        planned: { type: "Incline Walk", durationMin: 20 },
        log: null,
      }),
    ]);
    await logCardio({
      mesocycleId: m.id,
      scheduledFor: TODAY,
      type: "Incline Walk",
      durationMin: 20,
    });
    dash = await getTodayDashboard();
    if (dash.kind !== "rest") throw new Error("expected rest");
    expect(dash.cardio[0].state).toBe("complete");
    expect(await prisma().loggedSession.count()).toBe(0);
    expect(await prisma().session.count()).toBe(0);
  });
});

describe("missed cardio is a fact, not a prompt (R35–R37, R39)", () => {
  it("past unlogged cardio-only days read missed, create nothing, and never prompt", async () => {
    const { m } = await block({ startOffset: -14, lifting: false });
    const lastWeek = await weekEntries(m.id, 2);
    expect(lastWeek.map((e) => e.state)).toEqual(["missed", "missed"]);
    expect(await prisma().cardioLog.count()).toBe(0);
    const dash = await getTodayDashboard();
    expect(dash.kind).toBe("rest"); // never missed_day for cardio
    expect(await prisma().missedDayResolution.count()).toBe(0);
  });
});

describe("cardio follows an existing lifting shift and never makes one (R38–R40)", () => {
  it("the shifted Pull day carries its cardio; the cardio-only day stays; next week is authored", async () => {
    const { m } = await block({ startOffset: -14 });
    // Last week's Pull (W) was missed: the lifting engine shifts it to W+1.
    const missedOn = addDays(TODAY, -7);
    await resolveMissedDay({ mesocycleId: m.id, missedOn, outcome: "shifted" });

    const lastWeek = await weekEntries(m.id, 2);
    expect(
      lastWeek.map((e) => [e.scheduledFor, e.dateIso, e.planned.type]),
    ).toEqual([
      [missedOn, addDays(missedOn, 1), "Incline Walk"],
      [addDays(missedOn, 2), addDays(missedOn, 2), "Bike"],
    ]);
    // This week is back to the authored schedule.
    expect((await weekEntries(m.id, 3)).map((e) => e.dateIso)).toEqual([
      TODAY,
      addDays(TODAY, 2),
    ]);
    // Logging the shifted occurrence records it on its effective day.
    const { cardioLogId } = await logCardio({
      mesocycleId: m.id,
      scheduledFor: missedOn,
      type: "Incline Walk",
      durationMin: 20,
    });
    const row = await prisma().cardioLog.findUniqueOrThrow({
      where: { id: cardioLogId },
    });
    expect(toIsoDate(row.performedOn)).toBe(addDays(missedOn, 1));
    // Cardio created no resolution of its own.
    expect(await prisma().missedDayResolution.count()).toBe(1);
  });
});
