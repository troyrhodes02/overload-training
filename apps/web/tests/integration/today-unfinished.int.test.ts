/**
 * Pitch 21g correction OVE-228: a workout started on an earlier day and left
 * unfinished must never disappear from Today. Real database, real write
 * modules; the mobile route is the production handler (only Supabase Auth is
 * replaced). Warn and resolve, never forbid: another workout may still be
 * started, and nothing about the older one changes until the lifter acts.
 */
jest.mock("next/server", () => ({
  ...jest.requireActual("next/server"),
  connection: async () => {},
}));
jest.mock("@/lib/data/access-token", () => ({
  verifyAccessToken: async (token: string) => {
    const userId = token.split(".")[1];
    return { kind: "user", userId, email: `${userId}@example.test` };
  },
}));

import { addDays, isoWeekday, todayIso } from "@overload/shared/plan/calendar";
import type { Account } from "@/lib/data/account";
import { GET as todayRoute } from "@/app/api/mobile/v1/today/route";
import { logSet } from "@/lib/logging/logged-sets";
import {
  getTodayDashboard,
  getWorkout,
  listUnfinishedWorkouts,
} from "@/lib/logging/queries";
import { completeWorkout, startOrResumeWorkout } from "@/lib/logging/sessions";
import { resolveMissedDay } from "@/lib/logging/missed-days";
import { getTodayView } from "@/lib/views/today";
import type { TodayDto } from "@overload/shared/contracts/views";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import {
  createActiveTestMesocycle,
  createTestExercise,
  createTestSession,
  createTestSessionExercise,
} from "./support/plan-factories";

const db = () => getTestPrisma();
const TODAY = todayIso("UTC");

/**
 * A block that started `daysAgo` days before today, with one session on each
 * listed day offset (0 = the block's first day). Each session plans two
 * exercises, 3 sets each.
 */
async function block(
  account: Account,
  opts: { daysAgo: number; sessionsOn: number[]; name?: string },
) {
  const startIso = addDays(TODAY, -opts.daysAgo);
  const meso = await createActiveTestMesocycle({
    userId: account.userId,
    name: opts.name ?? "Block",
    startDate: new Date(`${startIso}T00:00:00Z`),
    lengthWeeks: 4,
    deloadEveryWeeks: 4,
  });
  const bench = await createTestExercise({
    userId: account.userId,
    name: `Bench ${opts.name ?? ""}`,
    equipmentType: "barbell",
    primaryMuscle: "chest",
  });
  const row = await createTestExercise({
    userId: account.userId,
    name: `Row ${opts.name ?? ""}`,
    equipmentType: "barbell",
    primaryMuscle: "back",
  });
  const gym = await db().gym.create({
    data: { userId: account.userId, name: `Gym ${opts.name ?? ""}`.trim() },
  });
  const sessions = [];
  for (const [i, offset] of opts.sessionsOn.entries()) {
    const s = await createTestSession(meso.id, {
      userId: account.userId,
      name: `Day ${String.fromCharCode(65 + i)}`,
      dayOfWeek: isoWeekday(addDays(startIso, offset)),
    });
    for (const ex of [bench, row]) {
      await createTestSessionExercise(s.id, ex.id, {
        userId: account.userId,
        plannedSets: 3,
        targetRepMin: 6,
        targetRepMax: 8,
      });
    }
    sessions.push({ ...s, date: addDays(startIso, offset) });
  }
  return { meso, sessions, gym, bench, row };
}

/** Start a session on its date and log `n` sets of its first exercise. */
async function startAndLog(
  account: Account,
  s: { id: string; date: string },
  gymId: string,
  n: number,
) {
  const { loggedSessionId } = await startOrResumeWorkout(account, {
    sessionId: s.id,
    scheduledFor: s.date,
    gymId,
  });
  const le = await db().loggedExercise.findFirstOrThrow({
    where: { loggedSessionId },
    orderBy: { position: "asc" },
  });
  for (let i = 1; i <= n; i++) {
    await logSet(account, {
      loggedExerciseId: le.id,
      setNumber: i,
      weightLbs: 100 + i,
      reps: 8,
      rir: i === 1 ? 2 : null,
    });
  }
  return { loggedSessionId, loggedExerciseId: le.id };
}

async function counts(userId: string) {
  return {
    sessions: await db().loggedSession.count({ where: { userId } }),
    sets: await db().loggedSet.count({ where: { userId } }),
  };
}

async function mobileToday(account: Account, query = "") {
  const res = await todayRoute(
    new Request(`http://localhost/api/mobile/v1/today${query}`, {
      headers: {
        "x-overload-app-version": "9.9.9",
        authorization: `Bearer t.${account.userId}.s`,
      },
    }),
    { params: Promise.resolve({}) as Promise<never> },
  );
  expect(res.status).toBe(200);
  return (await res.json()) as TodayDto;
}

describe("an earlier day's unfinished workout stays on Today", () => {
  it("1. yesterday unfinished, today ready: Today shows today's workout AND yesterday's reminder", async () => {
    const a = await createTestAccount();
    const b = await block(a, { daysAgo: 1, sessionsOn: [0, 1] });
    const old = await startAndLog(a, b.sessions[0], b.gym.id, 2);
    const view = await getTodayView(a);
    expect(view.dashboard.kind).toBe("pending");
    expect(view.unfinishedWorkouts).toEqual([
      {
        loggedSessionId: old.loggedSessionId,
        kind: "planned",
        sessionName: "Day A",
        scheduledFor: b.sessions[0].date,
        gymName: b.gym.name,
        setsLogged: 2,
      },
    ]);
  });

  it("2. today's workout already started: only the earlier one is a reminder", async () => {
    const a = await createTestAccount();
    const b = await block(a, { daysAgo: 1, sessionsOn: [0, 1] });
    const old = await startAndLog(a, b.sessions[0], b.gym.id, 1);
    await startAndLog(a, b.sessions[1], b.gym.id, 1);
    const view = await getTodayView(a);
    expect(view.dashboard.kind).toBe("in_progress");
    expect(view.unfinishedWorkouts?.map((w) => w.loggedSessionId)).toEqual([
      old.loggedSessionId,
    ]);
  });

  it("3, 9. several unfinished: newest first, and finishing one leaves the others", async () => {
    const a = await createTestAccount();
    const b = await block(a, { daysAgo: 2, sessionsOn: [0, 1, 2] });
    const older = await startAndLog(a, b.sessions[0], b.gym.id, 1);
    const newer = await startAndLog(a, b.sessions[1], b.gym.id, 3);
    expect(
      (await listUnfinishedWorkouts(a)).map((w) => [
        w.loggedSessionId,
        w.setsLogged,
      ]),
    ).toEqual([
      [newer.loggedSessionId, 3],
      [older.loggedSessionId, 1],
    ]);
    await completeWorkout(a, { loggedSessionId: newer.loggedSessionId });
    expect(
      (await listUnfinishedWorkouts(a)).map((w) => w.loggedSessionId),
    ).toEqual([older.loggedSessionId]);
  });

  it("4, 5, 15. resuming opens the original workout: its date, gym, and sets, with no duplicate", async () => {
    const a = await createTestAccount();
    const b = await block(a, { daysAgo: 1, sessionsOn: [0, 1] });
    const old = await startAndLog(a, b.sessions[0], b.gym.id, 2);
    const before = await counts(a.userId);
    await getTodayView(a);
    await listUnfinishedWorkouts(a);
    const w = (await getWorkout(a, old.loggedSessionId))!;
    expect(w.scheduledFor).toBe(b.sessions[0].date);
    expect(w.gymName).toBe(b.gym.name);
    expect(
      w.exercises[0].sets
        .filter((s) => s.saved)
        .map((s) => [s.weightLbs, s.rir]),
    ).toEqual([
      [101, 2],
      [102, null],
    ]);
    // Starting that same occurrence again is the same workout.
    const again = await startOrResumeWorkout(a, {
      sessionId: b.sessions[0].id,
      scheduledFor: b.sessions[0].date,
      gymId: b.gym.id,
    });
    expect(again.loggedSessionId).toBe(old.loggedSessionId);
    // Reads write nothing; logging the rest lands on the original workout.
    expect(await counts(a.userId)).toEqual(before);
    await logSet(a, {
      loggedExerciseId: old.loggedExerciseId,
      setNumber: 3,
      weightLbs: 103,
      reps: 8,
    });
    const after = (await getWorkout(a, old.loggedSessionId))!;
    expect(after.scheduledFor).toBe(b.sessions[0].date);
    expect(after.exercises[0].sets.filter((s) => s.saved)).toHaveLength(3);
  });

  it("6, 7. starting today's anyway works, and doesn't resolve the earlier workout", async () => {
    const a = await createTestAccount();
    const b = await block(a, { daysAgo: 1, sessionsOn: [0, 1] });
    const old = await startAndLog(a, b.sessions[0], b.gym.id, 1);
    const todays = await startOrResumeWorkout(a, {
      sessionId: b.sessions[1].id,
      scheduledFor: TODAY,
      gymId: b.gym.id,
    });
    expect(todays.loggedSessionId).not.toBe(old.loggedSessionId);
    const status = await db().loggedSession.findUniqueOrThrow({
      where: { id: old.loggedSessionId },
    });
    expect(status.status).toBe("in_progress");
    expect(
      (await listUnfinishedWorkouts(a)).map((w) => w.loggedSessionId),
    ).toEqual([old.loggedSessionId]);
  });

  it("8. finishing it (with what was saved) clears its reminder; unlogged exercises are recorded not done", async () => {
    const a = await createTestAccount();
    const b = await block(a, { daysAgo: 1, sessionsOn: [0, 1] });
    const old = await startAndLog(a, b.sessions[0], b.gym.id, 2);
    await completeWorkout(a, { loggedSessionId: old.loggedSessionId });
    expect(await listUnfinishedWorkouts(a)).toEqual([]);
    const w = (await getWorkout(a, old.loggedSessionId))!;
    expect(w.status).toBe("complete");
    expect(w.exercises[0].sets.filter((s) => s.saved)).toHaveLength(2);
  });

  it("10. a rest day still shows the reminder", async () => {
    const a = await createTestAccount();
    const b = await block(a, { daysAgo: 1, sessionsOn: [0] });
    const old = await startAndLog(a, b.sessions[0], b.gym.id, 1);
    const view = await getTodayView(a);
    expect(view.dashboard.kind).toBe("rest");
    expect(view.unfinishedWorkouts?.map((w) => w.loggedSessionId)).toEqual([
      old.loggedSessionId,
    ]);
  });

  it("11. the account's own midnight decides: today's workout is not 'earlier' until its day ends", async () => {
    const a = await createTestAccount();
    const b = await block(a, { daysAgo: 1, sessionsOn: [0, 1] });
    const todays = await startAndLog(
      a,
      { id: b.sessions[1].id, date: TODAY },
      b.gym.id,
      1,
    );
    expect(await listUnfinishedWorkouts(a, TODAY)).toEqual([]);
    expect(
      (await listUnfinishedWorkouts(a, addDays(TODAY, 1))).map(
        (w) => w.loggedSessionId,
      ),
    ).toEqual([todays.loggedSessionId]);
  });

  it("12. an unfinished day is never a missed day, and a missed day still prompts", async () => {
    const a = await createTestAccount();
    const b = await block(a, { daysAgo: 2, sessionsOn: [0, 1, 2] });
    // Day A (two days ago) started and left; Day B (yesterday) not started.
    await startAndLog(a, b.sessions[0], b.gym.id, 1);
    const dash = await getTodayDashboard(a);
    expect(dash.kind).toBe("missed_day");
    if (dash.kind !== "missed_day") throw new Error("expected a missed day");
    expect(dash.missed.missedOn).toBe(b.sessions[1].date);
    expect((await listUnfinishedWorkouts(a)).map((w) => w.sessionName)).toEqual(
      ["Day A"],
    );
  });

  it("13. an unfinished workout of an earlier block stays listed after a new block starts", async () => {
    const a = await createTestAccount();
    const first = await block(a, { daysAgo: 1, sessionsOn: [0], name: "One" });
    const old = await startAndLog(a, first.sessions[0], first.gym.id, 1);
    await block(a, { daysAgo: 0, sessionsOn: [0], name: "Two" });
    const view = await getTodayView(a);
    expect(view.unfinishedWorkouts?.map((w) => w.loggedSessionId)).toEqual([
      old.loggedSessionId,
    ]);
    // It is still its own block's workout.
    const row = await db().loggedSession.findUniqueOrThrow({
      where: { id: old.loggedSessionId },
    });
    expect(row.mesocycleId).toBe(first.meso.id);
  });

  it("a missed day shifted to today and started is today's workout, never ALSO 'unfinished' (review #1)", async () => {
    const a = await createTestAccount();
    const b = await block(a, { daysAgo: 1, sessionsOn: [0] });
    // Yesterday's Day A was missed; the lifter shifts it to today.
    await resolveMissedDay(a, {
      mesocycleId: b.meso.id,
      missedOn: b.sessions[0].date,
      outcome: "shifted",
    });
    const shown = await getTodayDashboard(a);
    if (shown.kind !== "pending")
      throw new Error(`expected pending, got ${shown.kind}`);
    // Started from Today: stored under its authored (earlier) date.
    const { loggedSessionId } = await startOrResumeWorkout(a, {
      sessionId: shown.sessionId,
      scheduledFor: shown.scheduledFor,
      gymId: b.gym.id,
    });
    const le = await db().loggedExercise.findFirstOrThrow({
      where: { loggedSessionId },
    });
    await logSet(a, {
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: 100,
      reps: 8,
    });
    const view = await getTodayView(a);
    expect(view.dashboard.kind).toBe("in_progress");
    expect(view.unfinishedWorkouts).toEqual([]);
  });

  it("a started workout with nothing saved isn't listed (nothing to resume; History keeps it)", async () => {
    const a = await createTestAccount();
    const b = await block(a, { daysAgo: 1, sessionsOn: [0, 1] });
    await startOrResumeWorkout(a, {
      sessionId: b.sessions[0].id,
      scheduledFor: b.sessions[0].date,
      gymId: b.gym.id,
    });
    expect(await listUnfinishedWorkouts(a)).toEqual([]);
  });
});

describe("web and phone read the same list; accounts never see each other's", () => {
  it("14, 16. GET /today (core and full) carries the web view's list; another account sees none of it", async () => {
    const a = await createTestAccount();
    const intruder = await createTestAccount();
    const b = await block(a, { daysAgo: 1, sessionsOn: [0, 1] });
    await startAndLog(a, b.sessions[0], b.gym.id, 2);
    const web = await getTodayView(a);
    expect((await mobileToday(a, "?fields=core")).unfinishedWorkouts).toEqual(
      web.unfinishedWorkouts,
    );
    expect((await mobileToday(a)).unfinishedWorkouts).toEqual(
      web.unfinishedWorkouts,
    );
    expect((await mobileToday(intruder)).unfinishedWorkouts).toEqual([]);
    expect(await listUnfinishedWorkouts(intruder)).toEqual([]);
  });
});
