import type { Account } from "@/lib/data/account";
import { createTestAccount, defaultAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import {
  createActiveTestMesocycle,
  createTestExercise,
  createTestSession,
  createTestSessionExercise,
} from "./support/plan-factories";
import { createGym } from "@/lib/gyms/gyms";
import { logSet } from "@/lib/logging/logged-sets";
import { completeWorkout, startOrResumeWorkout } from "@/lib/logging/sessions";
import { getLoggedWorkoutDetail, getWeekSchedule } from "@/lib/logging/queries";
import { getHistoryWeek } from "@/lib/logging/history-week";
import { addDays, isoWeekday, todayIso } from "@overload/shared/plan/calendar";

/**
 * All-time history (OVE-141–145): any past week, every block, logged-only
 * outside the active block, bounded by the earliest logged day, and scoped to
 * the acting account.
 *
 * Timeline (today = T): an archived block "Strength Block" ran from T-63 for
 * two weeks with a workout and a cardio log in its first week; then a gap;
 * then the active block "Hypertrophy Block 3" from T-14.
 */

const db = () => getTestPrisma();
let account: Account;
let today: string;
let oldStart: string;
let activeStart: string;
let oldWorkoutId: string;
let oldExerciseId: string;
let oldGymId: string;

async function trainOn(
  sessionId: string,
  gymId: string,
  day: string,
  who: Account,
) {
  const { loggedSessionId } = await startOrResumeWorkout(who, {
    sessionId,
    scheduledFor: day,
    gymId,
  });
  const le = await db().loggedExercise.findFirstOrThrow({
    where: { loggedSessionId },
  });
  await logSet(who, {
    loggedExerciseId: le.id,
    setNumber: 1,
    weightLbs: 185,
    reps: 8,
  });
  await completeWorkout(who, { loggedSessionId });
  return loggedSessionId;
}

beforeEach(async () => {
  account = await defaultAccount();
  today = todayIso(account.timeZone);
  oldStart = addDays(today, -63);
  activeStart = addDays(today, -14);

  // The old block, trained while it was active, then archived.
  const oldExercise = await createTestExercise({ name: "Hack Squat" });
  oldExerciseId = oldExercise.id;
  const old = await createActiveTestMesocycle({
    name: "Strength Block",
    startDate: new Date(`${oldStart}T00:00:00.000Z`),
    lengthWeeks: 2,
    deloadEveryWeeks: 2,
  });
  const oldSession = await createTestSession(old.id, {
    name: "Leg Day",
    dayOfWeek: isoWeekday(oldStart),
  });
  await createTestSessionExercise(oldSession.id, oldExercise.id, {
    plannedSets: 1,
  });
  const oldGym = await createGym(account, { name: "Campus Rec Center" });
  oldGymId = oldGym.id;
  oldWorkoutId = await trainOn(oldSession.id, oldGym.id, oldStart, account);
  await db().cardioLog.create({
    data: {
      userId: account.userId,
      mesocycleId: old.id,
      scheduledFor: new Date(`${addDays(oldStart, 2)}T00:00:00.000Z`),
      plannedType: "Cycling",
      plannedDurationMin: 30,
      type: "Cycling",
      durationMin: 30,
      performedOn: new Date(`${addDays(oldStart, 2)}T12:00:00.000Z`),
    },
  });

  // The active block (archives the old one).
  const exercise = await createTestExercise({ name: "Barbell Bench Press" });
  const active = await createActiveTestMesocycle({
    name: "Hypertrophy Block 3",
    startDate: new Date(`${activeStart}T00:00:00.000Z`),
    lengthWeeks: 5,
    deloadEveryWeeks: 5,
  });
  const session = await createTestSession(active.id, {
    name: "Push Day 1",
    dayOfWeek: isoWeekday(activeStart),
  });
  await createTestSessionExercise(session.id, exercise.id, { plannedSets: 1 });
  const gym = await createGym(account, { name: "Downtown Gym" });
  await trainOn(session.id, gym.id, activeStart, account);
});

it("defaults to this week, anchored on the active block's weekday, rendered exactly as the plan", async () => {
  const week = await getHistoryWeek(account);
  expect(week.isThisWeek).toBe(true);
  expect(week.weekStart).toBe(today); // week 3 of the active block starts today
  expect(isoWeekday(week.weekStart)).toBe(isoWeekday(activeStart));
  expect(week.view.kind).toBe("active");
  const plan = await getWeekSchedule(account, 3);
  if (week.view.kind === "active") {
    expect(week.view.weekNumber).toBe(3);
    expect(week.view.days).toEqual(plan!.days);
  }
});

it("an archived block's week shows only what was logged there, with the block's name", async () => {
  const week = await getHistoryWeek(account, oldStart);
  expect(week.weekStart).toBe(oldStart);
  expect(week.view.kind).toBe("logged");
  if (week.view.kind !== "logged") return;
  expect(week.view.blocks).toEqual([
    expect.objectContaining({ name: "Strength Block", status: "archived" }),
  ]);
  expect(week.view.days.map((d) => d.dateIso)).toEqual([
    oldStart,
    addDays(oldStart, 2),
  ]);
  expect(week.view.days[0].workouts).toEqual([
    expect.objectContaining({
      loggedSessionId: oldWorkoutId,
      sessionName: "Leg Day",
      state: "complete",
    }),
  ]);
  expect(week.view.days[1].cardio).toEqual([
    expect.objectContaining({ type: "Cycling", durationMin: 30 }),
  ]);
  // Never inferred: no planned or missed entries for the old block's second week.
  const second = await getHistoryWeek(account, addDays(oldStart, 7));
  expect(second.view).toEqual({ kind: "logged", blocks: [], days: [] });
});

it("a gap week between blocks is a plain empty logged week", async () => {
  const gap = await getHistoryWeek(account, addDays(oldStart, 28));
  expect(gap.view).toEqual({ kind: "logged", blocks: [], days: [] });
  expect(gap.prevWeekStart).toBe(addDays(oldStart, 21));
  expect(gap.nextWeekStart).toBe(addDays(oldStart, 35));
});

it("back navigation stops at the earliest logged week; forward stops at the active block's last week", async () => {
  const first = await getHistoryWeek(account, oldStart);
  expect(first.prevWeekStart).toBeNull();
  // Asking for anything earlier clamps to that first week.
  const clamped = await getHistoryWeek(account, addDays(oldStart, -400));
  expect(clamped.weekStart).toBe(oldStart);
  const last = await getHistoryWeek(account, addDays(activeStart, 28));
  expect(last.nextWeekStart).toBeNull();
  const beyond = await getHistoryWeek(account, addDays(activeStart, 400));
  expect(beyond.weekStart).toBe(addDays(activeStart, 28));
});

it("lists earlier blocks to jump to, opening on their first logged week", async () => {
  const week = await getHistoryWeek(account);
  expect(week.earlierBlocks).toEqual([
    expect.objectContaining({
      name: "Strength Block",
      status: "archived",
      weekStart: oldStart,
    }),
  ]);
});

it("an old workout's detail renders even after its exercise and gym are archived", async () => {
  await db().exercise.update({
    where: { id: oldExerciseId },
    data: { deletedAt: new Date() },
  });
  await db().gym.update({
    where: { id: oldGymId },
    data: { deletedAt: new Date() },
  });
  const detail = await getLoggedWorkoutDetail(account, oldWorkoutId);
  expect(detail).not.toBeNull();
  expect(detail!.gymName).toBe("Campus Rec Center");
  expect(detail!.exercises[0]).toMatchObject({
    performedName: "Hack Squat",
    archived: true,
  });
  const week = await getHistoryWeek(account, oldStart);
  expect(week.view.kind === "logged" && week.view.days.length).toBe(2);
});

it("another account sees none of it: no weeks, no blocks, no history", async () => {
  const other = await createTestAccount();
  const week = await getHistoryWeek(other, oldStart);
  expect(week.hasAnyHistory).toBe(false);
  expect(week.earlierBlocks).toEqual([]);
  expect(week.view).toEqual({ kind: "logged", blocks: [], days: [] });
  expect(await getLoggedWorkoutDetail(other, oldWorkoutId)).toBeNull();
});
