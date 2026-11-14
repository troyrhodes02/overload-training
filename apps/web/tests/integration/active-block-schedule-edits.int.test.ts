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
import { logSet } from "@/lib/logging/logged-sets";
import { completeWorkout, startOrResumeWorkout } from "@/lib/logging/sessions";
import { getTodayDashboard, getWeekSchedule } from "@/lib/logging/queries";
import { addSession, moveSession } from "@/lib/plan/sessions";
import { updateMesocycleDetails } from "@/lib/plan/mesocycles";
import { addDays, isoWeekday, todayIso } from "@overload/shared/plan/calendar";

/**
 * OVE-138 (mobile audit F-T5): does editing the schedule of an ACTIVE block
 * rewrite weeks already trained? The effective schedule is recomputed from the
 * CURRENT plan for every week, and a logged workout is matched to its
 * occurrence by (session, authored date). So moving a session's weekday, or
 * shifting the block's start, moves every past occurrence off the date it was
 * trained on, and those trained days come back as "missed".
 *
 * The REPRODUCES tests write the edit straight to the row (the guard would now
 * refuse it through the write module) and read the dashboard. The guard tests
 * prove the write modules now refuse these edits on an active block, while a
 * draft stays freely editable.
 */

let account: Account;
let today: string;
let start: string;

beforeEach(async () => {
  account = await defaultAccount();
  today = todayIso(account.timeZone);
  // Week 3 of the block starts today; weeks 1 and 2 are in the past.
  start = addDays(today, -14);
});

/** An active block whose one session falls on `start`'s weekday, trained in weeks 1 and 2. */
async function trainedActiveBlock(status: "active" | "draft" = "active") {
  const exercise = await createTestExercise({ equipmentType: "barbell" });
  const meso = await createTestMesocycle({
    status: "active",
    startDate: new Date(`${start}T00:00:00.000Z`),
    lengthWeeks: 6,
    deloadEveryWeeks: 6,
  });
  const session = await createTestSession(meso.id, {
    dayOfWeek: isoWeekday(start),
  });
  await createTestSessionExercise(session.id, exercise.id, { plannedSets: 1 });
  const gym = await createGym(account, { name: "Home" });
  for (const day of [start, addDays(start, 7)]) {
    const { loggedSessionId } = await startOrResumeWorkout(account, {
      sessionId: session.id,
      scheduledFor: day,
      gymId: gym.id,
    });
    const le = await account.db.loggedExercise.findFirstOrThrow({
      where: { loggedSessionId },
    });
    await logSet(account, {
      loggedExerciseId: le.id,
      setNumber: 1,
      weightLbs: 135,
      reps: 8,
    });
    await completeWorkout(account, { loggedSessionId });
  }
  if (status === "draft") {
    await account.db.mesocycle.update({
      where: { id: meso.id },
      data: { status: "draft" },
    });
  }
  return { meso, session };
}

const otherDay = (dow: number) => (dow % 7) + 1;

it("REPRODUCES F-T5: before any edit, the trained weeks are not missed", async () => {
  await trainedActiveBlock();
  const dash = await getTodayDashboard(account);
  expect(dash.kind).not.toBe("missed_day");
});

it("REPRODUCES F-T5: moving the weekday on the raw table turns a trained week into a missed day", async () => {
  // Bypass the new guard on purpose: write the move straight to the row, the
  // same change moveSession made before OVE-138.
  const { session } = await trainedActiveBlock();
  await account.db.session.update({
    where: { id: session.id },
    data: { dayOfWeek: otherDay(isoWeekday(start)) },
  });
  const dash = await getTodayDashboard(account);
  expect(dash.kind).toBe("missed_day");
  if (dash.kind === "missed_day") {
    // Week 1 was trained on `start`, yet the prompt asks about the day after.
    expect(dash.missed.missedOn).toBe(addDays(start, 1));
  }
});

it("F-T5, start date by one day: trained days still match (occurrences keep their weekday)", async () => {
  const { meso } = await trainedActiveBlock();
  await account.db.mesocycle.update({
    where: { id: meso.id },
    data: { startDate: new Date(`${addDays(start, -1)}T00:00:00.000Z`) },
  });
  expect((await getTodayDashboard(account)).kind).not.toBe("missed_day");
});

it("REPRODUCES F-T5, start date earlier by a week: a never-scheduled past week appears as missed", async () => {
  const { meso } = await trainedActiveBlock();
  await account.db.mesocycle.update({
    where: { id: meso.id },
    data: { startDate: new Date(`${addDays(start, -7)}T00:00:00.000Z`) },
  });
  const dash = await getTodayDashboard(account);
  expect(dash.kind).toBe("missed_day");
  if (dash.kind === "missed_day") {
    expect(dash.missed.missedOn).toBe(addDays(start, -7));
  }
});

describe("a session added to an active block (F-T5 follow-up)", () => {
  /** The block and its first session were built on its start day, like a real block. */
  async function builtOnStartDay() {
    const block = await trainedActiveBlock();
    const startInstant = new Date(`${start}T12:00:00.000Z`);
    await getTestPrisma().mesocycle.update({
      where: { id: block.meso.id },
      data: { createdAt: startInstant },
    });
    await getTestPrisma().session.update({
      where: { id: block.session.id },
      data: { createdAt: startInstant },
    });
    return block;
  }

  it("creates no past missed days", async () => {
    const { meso } = await builtOnStartDay();
    await addSession(account, {
      mesocycleId: meso.id,
      name: "Pull",
      dayOfWeek: otherDay(isoWeekday(start)),
    });
    expect((await getTodayDashboard(account)).kind).not.toBe("missed_day");
    // Its past weeks hold no occurrence of it at all.
    const week1 = await getWeekSchedule(account, 1);
    expect(week1!.days.map((d) => d.sessionName)).not.toContain("Pull");
  });

  it("counts normally from the day it was created onward", async () => {
    const { meso } = await builtOnStartDay();
    // Added today for tomorrow's weekday (today's weekday is the first
    // session's): this week's and every later week's occurrence is planned.
    await addSession(account, {
      mesocycleId: meso.id,
      name: "Pull",
      dayOfWeek: otherDay(isoWeekday(today)),
    });
    for (const week of [3, 4, 5]) {
      const days = (await getWeekSchedule(account, week))!.days;
      expect([week, days.map((d) => d.sessionName)]).toEqual([
        week,
        expect.arrayContaining(["Pull"]),
      ]);
    }
    for (const week of [1, 2]) {
      const days = (await getWeekSchedule(account, week))!.days;
      expect(days.map((d) => d.sessionName)).not.toContain("Pull");
    }
    expect((await getTodayDashboard(account)).kind).not.toBe("missed_day");
  });

  it("a block built and backdated in one sitting keeps every occurrence", async () => {
    // No backdating of createdAt: block and both sessions were created today.
    const { meso } = await trainedActiveBlock();
    await addSession(account, {
      mesocycleId: meso.id,
      name: "Pull",
      dayOfWeek: otherDay(isoWeekday(start)),
    });
    expect((await getTodayDashboard(account)).kind).toBe("missed_day");
  });
});

describe("the guard (OVE-138)", () => {
  it("refuses moving a session's weekday on an active block, and changes nothing", async () => {
    const { session } = await trainedActiveBlock();
    await expect(
      moveSession(account, {
        sessionId: session.id,
        dayOfWeek: otherDay(isoWeekday(start)),
      }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    const after = await account.db.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(after.dayOfWeek).toBe(isoWeekday(start));
    expect((await getTodayDashboard(account)).kind).not.toBe("missed_day");
  });

  it("refuses changing an active block's start date, but allows its other details", async () => {
    const { meso } = await trainedActiveBlock();
    await expect(
      updateMesocycleDetails(account, {
        mesocycleId: meso.id,
        name: "Renamed",
        startDate: addDays(start, -1),
        lengthWeeks: "6",
        deloadEveryWeeks: "6",
      }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    await updateMesocycleDetails(account, {
      mesocycleId: meso.id,
      name: "Renamed",
      startDate: start,
      lengthWeeks: "6",
      deloadEveryWeeks: "6",
    });
    const after = await account.db.mesocycle.findUniqueOrThrow({
      where: { id: meso.id },
    });
    expect(after.name).toBe("Renamed");
    expect((await getTodayDashboard(account)).kind).not.toBe("missed_day");
  });

  it("a draft block's weekday and start date stay freely editable", async () => {
    const { meso, session } = await trainedActiveBlock("draft");
    await moveSession(account, {
      sessionId: session.id,
      dayOfWeek: otherDay(isoWeekday(start)),
    });
    await updateMesocycleDetails(account, {
      mesocycleId: meso.id,
      name: "Draft",
      startDate: addDays(start, 7),
      lengthWeeks: "6",
      deloadEveryWeeks: "6",
    });
  });
});
