import { randomUUID } from "node:crypto";
import type { Account } from "@/lib/data/account";
import { DomainError } from "@/lib/actions/result";
import { createGym } from "@/lib/gyms/gyms";
import { logSet } from "@/lib/logging/logged-sets";
import { completeWorkout, startOrResumeWorkout } from "@/lib/logging/sessions";
import { resolveMissedDay } from "@/lib/logging/missed-days";
import {
  rescheduleWorkout,
  skipUpcomingWorkout,
} from "@/lib/logging/schedule-adjustments";
import {
  getLoggedWorkoutDetail,
  getTodayDashboard,
  getWeekSchedule,
  listUnfinishedWorkouts,
} from "@/lib/logging/queries";
import { getThisWeek } from "@/lib/logging/this-week";
import { getHistoryWeek } from "@/lib/logging/history-week";
import { removeSession } from "@/lib/plan/sessions";
import { addDays, isoWeekday, todayIso } from "@overload/shared/plan/calendar";
import { getTestPrisma } from "../support/db";
import { createTestAccount } from "../support/accounts";
import { snapshotAccount } from "./support";

/**
 * This week's schedule on Today (OVE-240): skip ahead, train today, swap days.
 *
 * Each block starts on a day relative to the real "today" (UTC accounts), so
 * day k of the current week is today + k and nothing depends on the date the
 * suite runs. Every plan is the acting account's own; the second account
 * proves it can't see, change, or detect the first account's week.
 */

const p = () => getTestPrisma();
const today = () => todayIso("UTC");
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

type Plan = Awaited<ReturnType<typeof weekPlan>>;

/**
 * An active 4-week block starting `startOffset` days from today, with one
 * session per entry on the weekday of today + offset.
 */
async function weekPlan(
  account: Account,
  sessions: { name: string; offset: number }[],
  startOffset = 0,
) {
  const start = addDays(today(), startOffset);
  const exercise = await p().exercise.create({
    data: {
      name: `Bench ${randomUUID().slice(0, 6)}`,
      primaryMuscle: "chest",
      equipmentType: "barbell",
      isCustom: false,
      sourceId: randomUUID(),
    },
  });
  const meso = await p().mesocycle.create({
    data: {
      userId: account.userId,
      name: "Week Block",
      lengthWeeks: 4,
      deloadEveryWeeks: 4,
      splitType: "custom",
      status: "active",
      startDate: d(start),
    },
  });
  const byName: Record<string, { id: string; authored: string }> = {};
  for (const s of sessions) {
    const authored = addDays(today(), s.offset);
    const row = await p().session.create({
      data: {
        userId: account.userId,
        mesocycleId: meso.id,
        name: s.name,
        dayOfWeek: isoWeekday(authored),
      },
    });
    await p().sessionExercise.create({
      data: {
        userId: account.userId,
        sessionId: row.id,
        exerciseId: exercise.id,
        position: 0,
        plannedSets: 1,
        targetRepMin: 5,
        targetRepMax: 8,
      },
    });
    byName[s.name] = { id: row.id, authored };
  }
  const gym = await createGym(account, {
    name: `Gym ${randomUUID().slice(0, 4)}`,
  });
  return { meso, s: byName, gym, start };
}

const ref = (plan: Plan, name: string) => ({
  sessionId: plan.s[name].id,
  scheduledFor: plan.s[name].authored,
});

async function dayName(account: Account, offset: number) {
  const week = await getThisWeek(account);
  return (
    week?.days.find((x) => x.dateIso === addDays(today(), offset))?.workout
      ?.sessionName ?? null
  );
}

async function expectDomain(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(DomainError);
  await promise.catch((e: DomainError) => expect(e.code).toBe(code));
}

async function train(account: Account, plan: Plan, name: string) {
  const { loggedSessionId } = await startOrResumeWorkout(account, {
    ...ref(plan, name),
    gymId: plan.gym.id,
  });
  const le = await account.db.loggedExercise.findFirstOrThrow({
    where: { loggedSessionId },
  });
  await logSet(account, {
    loggedExerciseId: le.id,
    setNumber: 1,
    weightLbs: 135,
    reps: 6,
    rir: 2,
  });
  return { loggedSessionId, loggedExerciseId: le.id };
}

let a: Account;
let b: Account;

beforeEach(async () => {
  a = await createTestAccount("UTC");
  b = await createTestAccount("UTC");
});

describe("swap days", () => {
  it("swaps today's Pull with tomorrow's Push for this week only", async () => {
    const plan = await weekPlan(a, [
      { name: "Pull", offset: 0 },
      { name: "Push", offset: 1 },
      { name: "Legs", offset: 3 },
    ]);
    const res = await rescheduleWorkout(a, {
      mesocycleId: plan.meso.id,
      ...ref(plan, "Pull"),
      from: today(),
      to: addDays(today(), 1),
      occupant: ref(plan, "Push"),
    });
    expect(res.status).toBe("moved");

    expect(await dayName(a, 0)).toBe("Push");
    expect(await dayName(a, 1)).toBe("Pull");
    expect(await dayName(a, 3)).toBe("Legs");
    const dash = await getTodayDashboard(a);
    expect(dash.kind).toBe("pending");
    if (dash.kind === "pending") {
      expect(dash.sessionName).toBe("Push");
      // The start link keeps Push's identity: its authored date.
      expect(dash.scheduledFor).toBe(plan.s.Push.authored);
    }
    // History's week agrees with Today.
    const history = await getHistoryWeek(a);
    expect(
      history.view.kind === "active"
        ? history.view.days.map((x) => [x.dateIso, x.sessionName])
        : null,
    ).toEqual([
      [today(), "Push"],
      [addDays(today(), 1), "Pull"],
      [addDays(today(), 3), "Legs"],
    ]);
    // Next week is the authored schedule; the plan itself never changed.
    const next = await getWeekSchedule(a, 2);
    expect(next?.days.map((x) => [x.dateIso, x.sessionName])).toEqual([
      [addDays(today(), 7), "Pull"],
      [addDays(today(), 8), "Push"],
      [addDays(today(), 10), "Legs"],
    ]);
    const sessions = await p().session.findMany({
      where: { mesocycleId: plan.meso.id },
      orderBy: { dayOfWeek: "asc" },
    });
    expect(sessions.map((s) => s.dayOfWeek)).toEqual(
      [0, 1, 3]
        .map((o) => isoWeekday(addDays(today(), o)))
        .sort((x, y) => x - y),
    );
    // No set, no workout was created by the swap.
    expect(await p().loggedSession.count({ where: { userId: a.userId } })).toBe(
      0,
    );
  });

  it("starts Push today, keeps Pull tomorrow, and logs Push as trained today", async () => {
    const plan = await weekPlan(a, [
      { name: "Pull", offset: 0 },
      { name: "Push", offset: 1 },
    ]);
    await rescheduleWorkout(a, {
      mesocycleId: plan.meso.id,
      ...ref(plan, "Pull"),
      from: today(),
      to: addDays(today(), 1),
      occupant: ref(plan, "Push"),
    });
    const { loggedSessionId } = await train(a, plan, "Push");
    await completeWorkout(a, { loggedSessionId });
    const ls = await p().loggedSession.findUniqueOrThrow({
      where: { id: loggedSessionId },
    });
    expect(ls.scheduledFor.toISOString().slice(0, 10)).toBe(
      plan.s.Push.authored,
    );
    expect(ls.performedOn.toISOString().slice(0, 10)).toBe(today());
    const set = await p().loggedSet.findFirstOrThrow({
      where: { loggedExercise: { loggedSessionId } },
    });
    expect([Number(set.weightLbs), set.reps, set.rir]).toEqual([135, 6, 2]);
    expect((await getLoggedWorkoutDetail(a, loggedSessionId))?.dateIso).toBe(
      today(),
    );

    const week = await getThisWeek(a);
    expect(week?.days[0].workout).toMatchObject({
      sessionName: "Push",
      state: "complete",
    });
    expect(week?.days[1].workout).toMatchObject({
      sessionName: "Pull",
      state: "upcoming",
    });
    // Pull can't start before its new day.
    await expectDomain(
      startOrResumeWorkout(a, { ...ref(plan, "Pull"), gymId: plan.gym.id }),
      "validation_error",
    );
  });

  it("swaps with a rest day, and days several apart", async () => {
    const plan = await weekPlan(a, [
      { name: "Push", offset: 1 },
      { name: "Legs", offset: 5 },
    ]);
    await rescheduleWorkout(a, {
      mesocycleId: plan.meso.id,
      ...ref(plan, "Push"),
      from: addDays(today(), 1),
      to: addDays(today(), 2),
      occupant: null,
    });
    expect(await dayName(a, 1)).toBeNull();
    expect(await dayName(a, 2)).toBe("Push");
    await rescheduleWorkout(a, {
      mesocycleId: plan.meso.id,
      ...ref(plan, "Legs"),
      from: addDays(today(), 5),
      to: addDays(today(), 2),
      occupant: ref(plan, "Push"),
    });
    expect(await dayName(a, 2)).toBe("Legs");
    expect(await dayName(a, 5)).toBe("Push");
    const week = await getThisWeek(a);
    const names = week!.days.flatMap((x) =>
      x.workout ? [x.workout.sessionName] : [],
    );
    expect(names.sort()).toEqual(["Legs", "Push"]);
  });

  it("a retried swap changes nothing and never swaps back", async () => {
    const plan = await weekPlan(a, [
      { name: "Pull", offset: 0 },
      { name: "Push", offset: 1 },
    ]);
    const input = {
      mesocycleId: plan.meso.id,
      ...ref(plan, "Pull"),
      from: today(),
      to: addDays(today(), 1),
      occupant: ref(plan, "Push"),
    };
    expect((await rescheduleWorkout(a, input)).status).toBe("moved");
    const before = await p().scheduleMove.findMany({ orderBy: { id: "asc" } });
    expect((await rescheduleWorkout(a, input)).status).toBe("unchanged");
    expect(await p().scheduleMove.findMany({ orderBy: { id: "asc" } })).toEqual(
      before,
    );
    expect(await dayName(a, 0)).toBe("Push");
  });

  it("two tabs sending the same swap at once move it once", async () => {
    const plan = await weekPlan(a, [
      { name: "Pull", offset: 0 },
      { name: "Push", offset: 1 },
    ]);
    const input = {
      mesocycleId: plan.meso.id,
      ...ref(plan, "Pull"),
      from: today(),
      to: addDays(today(), 1),
      occupant: ref(plan, "Push"),
    };
    const results = await Promise.all([
      rescheduleWorkout(a, input),
      rescheduleWorkout(a, input),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["moved", "unchanged"]);
    expect(await p().scheduleMove.count()).toBe(2);
    expect(await dayName(a, 0)).toBe("Push");
  });

  it("a request built on a stale week is a conflict and writes nothing", async () => {
    const plan = await weekPlan(a, [
      { name: "Pull", offset: 0 },
      { name: "Push", offset: 1 },
    ]);
    // The lifter's page thinks tomorrow is a rest day.
    await expectDomain(
      rescheduleWorkout(a, {
        mesocycleId: plan.meso.id,
        ...ref(plan, "Pull"),
        from: today(),
        to: addDays(today(), 1),
        occupant: null,
      }),
      "conflict",
    );
    // Or that Pull is somewhere it isn't.
    await expectDomain(
      rescheduleWorkout(a, {
        mesocycleId: plan.meso.id,
        ...ref(plan, "Pull"),
        from: addDays(today(), 2),
        to: addDays(today(), 3),
        occupant: null,
      }),
      "conflict",
    );
    expect(await p().scheduleMove.count()).toBe(0);
  });

  it("never moves a started or finished workout, a past day, or out of the week", async () => {
    const plan = await weekPlan(a, [
      { name: "Pull", offset: 0 },
      { name: "Push", offset: 1 },
    ]);
    await train(a, plan, "Pull"); // in progress, one set saved
    const base = {
      mesocycleId: plan.meso.id,
      from: today(),
      to: addDays(today(), 1),
    };
    await expectDomain(
      rescheduleWorkout(a, {
        ...base,
        ...ref(plan, "Pull"),
        occupant: ref(plan, "Push"),
      }),
      "invalid_state_transition",
    );
    // Push can't take a started workout's day either.
    await expectDomain(
      rescheduleWorkout(a, {
        mesocycleId: plan.meso.id,
        ...ref(plan, "Push"),
        from: addDays(today(), 1),
        to: today(),
        occupant: ref(plan, "Pull"),
      }),
      "invalid_state_transition",
    );
    await expectDomain(
      rescheduleWorkout(a, {
        mesocycleId: plan.meso.id,
        ...ref(plan, "Push"),
        from: addDays(today(), 1),
        to: addDays(today(), 7),
        occupant: null,
      }),
      "validation_error",
    );
    await expectDomain(
      rescheduleWorkout(a, {
        mesocycleId: plan.meso.id,
        ...ref(plan, "Push"),
        from: addDays(today(), 1),
        to: addDays(today(), -1),
        occupant: null,
      }),
      "conflict",
    );
    expect(await p().scheduleMove.count()).toBe(0);
    const sets = await p().loggedSet.count();
    expect(sets).toBe(1);
  });
});

describe("train today", () => {
  it("moves a later workout onto a free today, trains it once, and leaves its day free", async () => {
    const plan = await weekPlan(a, [
      { name: "Upper", offset: 1 },
      { name: "Lower", offset: 3 },
    ]);
    await rescheduleWorkout(a, {
      mesocycleId: plan.meso.id,
      ...ref(plan, "Lower"),
      from: addDays(today(), 3),
      to: today(),
      occupant: null,
    });
    const { loggedSessionId } = await train(a, plan, "Lower");
    await completeWorkout(a, { loggedSessionId });

    expect(await dayName(a, 0)).toBe("Lower");
    expect(await dayName(a, 3)).toBeNull();
    // Exactly one Lower this week: done, on today, never missed later.
    const dash = await getTodayDashboard(a);
    expect(dash).toMatchObject({ kind: "complete", sessionName: "Lower" });
    const week = await getWeekSchedule(a);
    expect(week?.days.filter((x) => x.sessionName === "Lower")).toEqual([
      expect.objectContaining({ dateIso: today(), state: "complete" }),
    ]);
    // Next week's Lower is back on its authored day.
    const next = await getWeekSchedule(a, 2);
    expect(next?.days.find((x) => x.sessionName === "Lower")?.dateIso).toBe(
      addDays(today(), 10),
    );
  });

  it("a workout moved earlier and left unfinished is listed as unfinished the next day", async () => {
    const plan = await weekPlan(a, [{ name: "Lower", offset: 3 }]);
    await rescheduleWorkout(a, {
      mesocycleId: plan.meso.id,
      ...ref(plan, "Lower"),
      from: addDays(today(), 3),
      to: today(),
      occupant: null,
    });
    const { loggedSessionId } = await train(a, plan, "Lower");
    expect(await listUnfinishedWorkouts(a, today())).toEqual([]);
    const tomorrow = await listUnfinishedWorkouts(a, addDays(today(), 1));
    expect(tomorrow.map((w) => w.loggedSessionId)).toEqual([loggedSessionId]);
  });

  it("a future workout can't start until it is moved", async () => {
    const plan = await weekPlan(a, [{ name: "Lower", offset: 3 }]);
    await expectDomain(
      startOrResumeWorkout(a, { ...ref(plan, "Lower"), gymId: plan.gym.id }),
      "validation_error",
    );
  });
});

describe("skip ahead", () => {
  it("skips tomorrow's workout: never missed, never startable, next week unchanged", async () => {
    const plan = await weekPlan(a, [
      { name: "Pull", offset: 0 },
      { name: "Push", offset: 1 },
    ]);
    const input = { mesocycleId: plan.meso.id, ...ref(plan, "Push") };
    await skipUpcomingWorkout(a, input);
    await skipUpcomingWorkout(a, input); // a retry
    expect(await p().missedDayResolution.count()).toBe(1);

    const week = await getThisWeek(a);
    expect(week?.days[1].workout).toBeNull();
    expect(week?.days[1].skipped.map((x) => x.sessionName)).toEqual(["Push"]);
    const schedule = await getWeekSchedule(a);
    expect(schedule?.days.find((x) => x.sessionName === "Push")?.state).toBe(
      "skipped",
    );
    await expectDomain(
      startOrResumeWorkout(a, { ...ref(plan, "Push"), gymId: plan.gym.id }),
      "invalid_state_transition",
    );
    // It can't be moved either.
    await expectDomain(
      rescheduleWorkout(a, {
        mesocycleId: plan.meso.id,
        ...ref(plan, "Push"),
        from: addDays(today(), 1),
        to: addDays(today(), 2),
        occupant: null,
      }),
      "invalid_state_transition",
    );
    const next = await getWeekSchedule(a, 2);
    expect(next?.days.find((x) => x.sessionName === "Push")?.state).toBe(
      "upcoming",
    );
  });

  it("skips today's unstarted workout and frees today", async () => {
    const plan = await weekPlan(a, [{ name: "Pull", offset: 0 }]);
    await skipUpcomingWorkout(a, {
      mesocycleId: plan.meso.id,
      ...ref(plan, "Pull"),
    });
    expect((await getTodayDashboard(a)).kind).toBe("rest");
  });

  it("never skips a started or finished workout, and never touches its sets", async () => {
    const plan = await weekPlan(a, [{ name: "Pull", offset: 0 }]);
    const { loggedSessionId } = await train(a, plan, "Pull");
    const input = { mesocycleId: plan.meso.id, ...ref(plan, "Pull") };
    await expectDomain(
      skipUpcomingWorkout(a, input),
      "invalid_state_transition",
    );
    await completeWorkout(a, { loggedSessionId });
    await expectDomain(
      skipUpcomingWorkout(a, input),
      "invalid_state_transition",
    );
    expect(await p().missedDayResolution.count()).toBe(0);
    expect(await p().loggedSet.count()).toBe(1);
  });

  it("a skip and a start sent together never both happen", async () => {
    const plan = await weekPlan(a, [{ name: "Pull", offset: 0 }]);
    const results = await Promise.allSettled([
      skipUpcomingWorkout(a, {
        mesocycleId: plan.meso.id,
        ...ref(plan, "Pull"),
      }),
      startOrResumeWorkout(a, { ...ref(plan, "Pull"), gymId: plan.gym.id }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const skipped = await p().missedDayResolution.count();
    const started = await p().loggedSession.count();
    expect(skipped + started).toBe(1);
  });
});

describe("missed days and the plan", () => {
  it("a waiting missed day blocks moves until it is answered", async () => {
    // Yesterday's Pull was missed; Push is tomorrow.
    const plan = await weekPlan(
      a,
      [
        { name: "Pull", offset: -1 },
        { name: "Push", offset: 1 },
      ],
      -1,
    );
    const move = () =>
      rescheduleWorkout(a, {
        mesocycleId: plan.meso.id,
        ...ref(plan, "Push"),
        from: addDays(today(), 1),
        to: today(),
        occupant: null,
      });
    await expectDomain(move(), "invalid_state_transition");
    expect((await getThisWeek(a))?.blockedReason).not.toBeNull();
    await resolveMissedDay(a, {
      mesocycleId: plan.meso.id,
      missedOn: plan.s.Pull.authored,
      outcome: "skipped",
    });
    expect((await move()).status).toBe("moved");
    expect((await getTodayDashboard(a)).kind).toBe("pending");
  });

  it("removing a session from the plan clears its moves", async () => {
    const plan = await weekPlan(a, [
      { name: "Pull", offset: 0 },
      { name: "Push", offset: 1 },
    ]);
    await rescheduleWorkout(a, {
      mesocycleId: plan.meso.id,
      ...ref(plan, "Push"),
      from: addDays(today(), 1),
      to: addDays(today(), 2),
      occupant: null,
    });
    await removeSession(a, { sessionId: plan.s.Push.id });
    expect(await p().scheduleMove.count()).toBe(0);
  });
});

describe("isolation", () => {
  it("another account can't see, skip, or move this account's week", async () => {
    const plan = await weekPlan(a, [
      { name: "Pull", offset: 0 },
      { name: "Push", offset: 1 },
    ]);
    await rescheduleWorkout(a, {
      mesocycleId: plan.meso.id,
      ...ref(plan, "Pull"),
      from: today(),
      to: addDays(today(), 1),
      occupant: ref(plan, "Push"),
    });
    const before = await snapshotAccount(a.userId);

    // B has no plan: A's block is invisible.
    expect(await getThisWeek(b)).toBeNull();
    await expectDomain(
      skipUpcomingWorkout(b, {
        mesocycleId: plan.meso.id,
        ...ref(plan, "Push"),
      }),
      "not_found",
    );
    await expectDomain(
      rescheduleWorkout(b, {
        mesocycleId: plan.meso.id,
        ...ref(plan, "Push"),
        from: today(),
        to: addDays(today(), 2),
        occupant: null,
      }),
      "not_found",
    );
    // B's own block with A's session ids: not found, exactly like nonsense ids.
    const own = await weekPlan(b, [{ name: "Legs", offset: 2 }]);
    for (const sessionId of [plan.s.Push.id, randomUUID(), "nope"]) {
      await expectDomain(
        skipUpcomingWorkout(b, {
          mesocycleId: own.meso.id,
          sessionId,
          scheduledFor: plan.s.Push.authored,
        }),
        "not_found",
      );
      await expectDomain(
        rescheduleWorkout(b, {
          mesocycleId: own.meso.id,
          sessionId,
          scheduledFor: plan.s.Push.authored,
          from: today(),
          to: addDays(today(), 2),
          occupant: null,
        }),
        "not_found",
      );
    }
    // A swap naming A's workout as the occupant is stale for B, never applied.
    await expectDomain(
      rescheduleWorkout(b, {
        mesocycleId: own.meso.id,
        ...ref(own, "Legs"),
        from: addDays(today(), 2),
        to: today(),
        occupant: ref(plan, "Push"),
      }),
      "conflict",
    );
    // B's reads never include A's moves.
    expect(await b.db.scheduleMove.count()).toBe(0);
    expect(await snapshotAccount(a.userId)).toEqual(before);
  });
});
