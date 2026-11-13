import type { Account } from "@/lib/data/account";
import { defaultAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
  createTestSession,
  createTestSessionExercise,
} from "./support/plan-factories";
import { createGym } from "@/lib/gyms/gyms";
import { editLoggedSet, logSet } from "@/lib/logging/logged-sets";
import {
  completeWorkout,
  startOrResumeWorkout,
  swapExercise,
} from "@/lib/logging/sessions";
import { resolveMissedDay } from "@/lib/logging/missed-days";
import {
  getLoggedWorkoutDetail,
  getSwapContext,
  getWorkout,
} from "@/lib/logging/queries";
import {
  getOccurrenceProgression,
  getSessionProgressionSummary,
} from "@/lib/progression/queries";
import { WEIGHT_MESSAGES } from "@overload/shared/logging/weight";
import { addDays, isoWeekday, todayIso } from "@overload/shared/plan/calendar";

/**
 * Pre-mobile logging correctness (PR C): OVE-129 (no sets on a finished
 * workout), OVE-130 (no swap on a finished workout), OVE-131 (a new workout is
 * a real, due occurrence), OVE-132 (missed days are validated and replay-safe),
 * OVE-133 (finishing is idempotent), OVE-134 (concurrent duplicates re-read),
 * OVE-135 (two decimal places), OVE-136 (malformed ids are not found).
 */

let account: Account;
let today: string;
let start: string;
let sessionId: string;
let otherExerciseId: string;
let gymId: string;
let mesoId: string;

beforeEach(async () => {
  account = await defaultAccount();
  today = todayIso(account.timeZone);
  start = addDays(today, -14); // week 3 starts today
  const exercise = await createTestExercise({ equipmentType: "barbell" });
  const other = await createTestExercise({
    equipmentType: "barbell",
    name: "Incline Press",
  });
  otherExerciseId = other.id;
  const meso = await createTestMesocycle({
    status: "active",
    startDate: new Date(`${start}T00:00:00.000Z`),
    lengthWeeks: 6,
    deloadEveryWeeks: 6,
  });
  mesoId = meso.id;
  const session = await createTestSession(meso.id, {
    dayOfWeek: isoWeekday(start),
  });
  sessionId = session.id;
  await createTestSessionExercise(session.id, exercise.id, { plannedSets: 2 });
  gymId = (await createGym(account, { name: "Home" })).id;
});

const start_ = (scheduledFor: string) =>
  startOrResumeWorkout(account, { sessionId, scheduledFor, gymId });

async function firstExercise(loggedSessionId: string) {
  return getTestPrisma().loggedExercise.findFirstOrThrow({
    where: { loggedSessionId },
  });
}

describe("OVE-131: starting a workout", () => {
  it("today's and a past occurrence start (log it late); resume returns the same workout", async () => {
    const todays = await start_(today);
    expect(await start_(today)).toEqual(todays);
    const late = await start_(start);
    expect(late.loggedSessionId).not.toBe(todays.loggedSessionId);
  });

  it("a future occurrence, a wrong weekday, or a date outside the block is a validation_error", async () => {
    for (const day of [
      addDays(today, 7),
      addDays(today, 1),
      addDays(start, -7),
    ]) {
      await expect(start_(day)).rejects.toMatchObject({
        code: "validation_error",
      });
    }
    expect(await getTestPrisma().loggedSession.count()).toBe(0);
  });

  it("a session of a draft block is a validation_error", async () => {
    await getTestPrisma().mesocycle.update({
      where: { id: mesoId },
      data: { status: "draft" },
    });
    await expect(start_(today)).rejects.toMatchObject({
      code: "validation_error",
    });
  });

  it("resuming still works after the occurrence is no longer startable", async () => {
    const first = await start_(today);
    await getTestPrisma().mesocycle.update({
      where: { id: mesoId },
      data: { status: "draft" },
    });
    expect(await start_(today)).toEqual(first);
  });

  it("OVE-134: two concurrent starts of the same occurrence return the same workout", async () => {
    const [a, b] = await Promise.all([start_(today), start_(today)]);
    expect(a).toEqual(b);
    expect(await getTestPrisma().loggedSession.count()).toBe(1);
  });
});

describe("OVE-129/130/133: a finished workout", () => {
  async function finished() {
    const { loggedSessionId } = await start_(today);
    const le = await firstExercise(loggedSessionId);
    const set = await logSet(account, {
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: 135,
      reps: 8,
    });
    await completeWorkout(account, { loggedSessionId });
    return { loggedSessionId, le, set };
  }

  it("refuses a new set and writes nothing", async () => {
    const { le } = await finished();
    await expect(
      logSet(account, {
        loggedExerciseId: le.id,
        setNumber: 2,
        weightLbs: 135,
        reps: 8,
      }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    expect(await getTestPrisma().loggedSet.count()).toBe(1);
  });

  it("still allows editing a logged set", async () => {
    const { set } = await finished();
    const edited = await editLoggedSet(account, {
      loggedSetId: set.id,
      weightLbs: 140,
      reps: 8,
    });
    expect(Number(edited.weightLbs)).toBe(140);
  });

  it("refuses a swap", async () => {
    const { loggedSessionId } = await finished();
    const untouched = (
      await getTestPrisma().loggedExercise.findMany({
        where: { loggedSessionId },
      })
    ).find((le) => le.skippedAt !== null);
    const target = untouched ?? (await firstExercise(loggedSessionId));
    await expect(
      swapExercise(account, {
        loggedExerciseId: target.id,
        newExerciseId: otherExerciseId,
      }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
  });

  it("finishing again succeeds without moving completedAt", async () => {
    const { loggedSessionId } = await finished();
    const before = await getTestPrisma().loggedSession.findUniqueOrThrow({
      where: { id: loggedSessionId },
    });
    await completeWorkout(account, { loggedSessionId });
    const after = await getTestPrisma().loggedSession.findUniqueOrThrow({
      where: { id: loggedSessionId },
    });
    expect(after.completedAt).toEqual(before.completedAt);
  });
});

describe("OVE-134: concurrent duplicate sets", () => {
  it("two identical submits of the same set both succeed with the same row", async () => {
    const { loggedSessionId } = await start_(today);
    const le = await firstExercise(loggedSessionId);
    const input = {
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: 135,
      reps: 8,
    };
    const [a, b] = await Promise.all([
      logSet(account, input),
      logSet(account, input),
    ]);
    expect(a.id).toBe(b.id);
    expect(await getTestPrisma().loggedSet.count()).toBe(1);
  });
});

describe("OVE-135: at most two decimal places", () => {
  it("refuses 185.125 on a new set and on an edit, with the specific message", async () => {
    const { loggedSessionId } = await start_(today);
    const le = await firstExercise(loggedSessionId);
    await expect(
      logSet(account, {
        loggedExerciseId: le.id,
        setNumber: 1,
        weightLbs: 185.125,
        reps: 5,
      }),
    ).rejects.toMatchObject({
      code: "validation_error",
      details: { weightLbs: WEIGHT_MESSAGES.tooPrecise },
    });
    const set = await logSet(account, {
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: 185.25,
      reps: 5,
    });
    expect(Number(set.weightLbs)).toBe(185.25);
    await expect(
      editLoggedSet(account, {
        loggedSetId: set.id,
        weightLbs: 185.125,
        reps: 5,
      }),
    ).rejects.toMatchObject({
      details: { weightLbs: WEIGHT_MESSAGES.tooPrecise },
    });
  });
});

describe("OVE-132: resolving a missed day", () => {
  const week2 = () => addDays(start, 7);

  it("resolves a past, unlogged occurrence; a same-outcome replay returns it; a different outcome conflicts", async () => {
    const first = await resolveMissedDay(account, {
      mesocycleId: mesoId,
      missedOn: week2(),
      outcome: "skipped",
    });
    expect(first).toMatchObject({ missedOn: week2(), outcome: "skipped" });
    expect(
      await resolveMissedDay(account, {
        mesocycleId: mesoId,
        missedOn: week2(),
        outcome: "skipped",
      }),
    ).toEqual(first);
    await expect(
      resolveMissedDay(account, {
        mesocycleId: mesoId,
        missedOn: week2(),
        outcome: "shifted",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });

  it("refuses today, a future day, an unscheduled day, and a logged day", async () => {
    await start_(start); // week 1 logged
    for (const missedOn of [
      today,
      addDays(today, 7),
      addDays(start, 1),
      start,
    ]) {
      await expect(
        resolveMissedDay(account, {
          mesocycleId: mesoId,
          missedOn,
          outcome: "skipped",
        }),
      ).rejects.toMatchObject({ code: "validation_error" });
    }
    expect(await getTestPrisma().missedDayResolution.count()).toBe(0);
  });

  it("validates the outcome at runtime (logged_late and junk are refused)", async () => {
    for (const outcome of ["logged_late", "later", "", null, 3]) {
      await expect(
        resolveMissedDay(account, {
          mesocycleId: mesoId,
          missedOn: week2(),
          outcome,
        }),
      ).rejects.toMatchObject({ code: "validation_error" });
    }
  });
});

describe("OVE-136: malformed ids read as not found", () => {
  it.each(["not-a-uuid", "", "1234", "../etc"])("%p", async (id) => {
    expect(await getWorkout(account, id)).toBeNull();
    expect(await getSwapContext(account, id, null)).toBeNull();
    expect(await getLoggedWorkoutDetail(account, id)).toBeNull();
    expect(await getOccurrenceProgression(account, id)).toBeNull();
    expect(await getSessionProgressionSummary(account, id)).toBeNull();
  });
});
