import { editCardioLog, logCardio } from "@/lib/cardio/cardio-logs";
import { getWeekSchedule } from "@/lib/logging/queries";
import { resolveMissedDay } from "@/lib/logging/missed-days";
import { addDays, parseIsoDate, toIsoDate } from "@/lib/plan/calendar";
import { removePlannedCardio } from "@/lib/plan/cardio";
import { getTestPrisma } from "./support/db";
import {
  createTestExercise,
  createTestMesocycle,
  createTestSession,
  createTestSessionExercise,
} from "./support/plan-factories";

/**
 * Cardio Logging — the week at a glance (OVE-35; spec §13, R30–R33, R36–R37,
 * R56–R57, R60). History stays day-oriented: lifting and cardio for the same
 * effective date, missed cardio as a fact, logged cardio correctable and never
 * lost when the plan changes. Dates are relative to the real (UTC) today; each
 * block starts on today's weekday.
 */
const prisma = () => getTestPrisma();
const TODAY = toIsoDate(new Date());
const W = ((parseIsoDate(TODAY)!.getUTCDay() + 6) % 7) + 1;
const dayAfter = (n: number) => ((W - 1 + n) % 7) + 1;

/** Active block starting `startOffset` days away; Pull + Incline Walk on W, Bike-only on W+2. */
async function block(startOffset: number) {
  const start = addDays(TODAY, startOffset);
  const m = await createTestMesocycle({
    status: "active",
    startDate: parseIsoDate(start)!,
    lengthWeeks: 5,
  });
  const pull = await createTestSession(m.id, {
    name: "Pull Day 1",
    dayOfWeek: W,
  });
  const row = await createTestExercise({
    name: "Barbell Row",
    primaryMuscle: "back",
  });
  await createTestSessionExercise(pull.id, row.id);
  const longAgo = parseIsoDate(addDays(start, -30))!;
  const walk = await prisma().plannedCardio.create({
    data: {
      mesocycleId: m.id,
      dayOfWeek: W,
      type: "Incline Walk",
      durationMin: 20,
      createdAt: longAgo,
    },
  });
  await prisma().plannedCardio.create({
    data: {
      mesocycleId: m.id,
      dayOfWeek: dayAfter(2),
      type: "Bike",
      durationMin: 30,
      createdAt: longAgo,
    },
  });
  return { m, walk };
}

const cardioLines = (
  week: Awaited<ReturnType<typeof getWeekSchedule>>,
): [string, string, string, string][] =>
  week!.cardio.map((c) => [
    c.dateIso,
    (c.log ?? c.planned).type,
    String((c.log ?? c.planned).durationMin),
    c.state,
  ]);

describe("cardio in the week at a glance", () => {
  it("shows a combined day and a cardio-only day this week", async () => {
    await block(0);
    const week = await getWeekSchedule();
    expect(week!.weekNumber).toBe(1);
    expect(week!.days.map((d) => [d.dateIso, d.sessionName])).toEqual([
      [TODAY, "Pull Day 1"],
    ]);
    expect(cardioLines(week)).toEqual([
      [TODAY, "Incline Walk", "20", "pending"],
      [addDays(TODAY, 2), "Bike", "30", "upcoming"],
    ]);
  });

  it("shows last week's unlogged cardio as missed and creates nothing", async () => {
    await block(-14);
    const week = await getWeekSchedule(2);
    expect(cardioLines(week)).toEqual([
      [addDays(TODAY, -7), "Incline Walk", "20", "missed"],
      [addDays(TODAY, -5), "Bike", "30", "missed"],
    ]);
    expect(await prisma().cardioLog.count()).toBe(0);
  });

  it("a missed occurrence logged later reads complete, with the plan when it differs", async () => {
    const { m } = await block(-14);
    await logCardio({
      mesocycleId: m.id,
      scheduledFor: addDays(TODAY, -7),
      type: "Bike",
      durationMin: "25",
    });
    const week = await getWeekSchedule(2);
    expect(week!.cardio[0]).toMatchObject({
      dateIso: addDays(TODAY, -7),
      state: "complete",
      log: { type: "Bike", durationMin: 25 },
      planned: { type: "Incline Walk", durationMin: 20 },
      differsFromPlan: true,
    });
  });

  it("keeps logged cardio after its planned item is removed; unlogged ones go with the plan", async () => {
    const { m, walk } = await block(-14);
    await logCardio({
      mesocycleId: m.id,
      scheduledFor: addDays(TODAY, -7),
      type: "Incline Walk",
      durationMin: 22,
    });
    await removePlannedCardio({ plannedCardioId: walk.id });
    expect(cardioLines(await getWeekSchedule(2))).toEqual([
      [addDays(TODAY, -7), "Incline Walk", "22", "complete"],
      [addDays(TODAY, -5), "Bike", "30", "missed"],
    ]);
    // This week the removed walk no longer appears.
    expect(cardioLines(await getWeekSchedule(3)).map((l) => l[1])).toEqual([
      "Bike",
    ]);
  });

  it("a correction shows on the next read", async () => {
    const { m } = await block(0);
    const { cardioLogId } = await logCardio({
      mesocycleId: m.id,
      scheduledFor: TODAY,
      type: "Incline Walk",
      durationMin: 23,
    });
    await editCardioLog({ cardioLogId, type: "Treadmill", durationMin: 31 });
    expect(cardioLines(await getWeekSchedule())[0]).toEqual([
      TODAY,
      "Treadmill",
      "31",
      "complete",
    ]);
  });

  it("puts shifted cardio on the shifted lifting day; the cardio-only day stays", async () => {
    const { m } = await block(-14);
    const missedOn = addDays(TODAY, -7);
    await resolveMissedDay({ mesocycleId: m.id, missedOn, outcome: "shifted" });
    const week = await getWeekSchedule(2);
    expect(week!.days.map((d) => [d.dateIso, d.state])).toEqual([
      [addDays(missedOn, 1), "shifted"],
    ]);
    expect(cardioLines(week).map((l) => [l[0], l[1]])).toEqual([
      [addDays(missedOn, 1), "Incline Walk"],
      [addDays(missedOn, 2), "Bike"],
    ]);
    // The following week is authored again.
    expect((await getWeekSchedule(3))!.cardio.map((c) => c.dateIso)).toEqual([
      TODAY,
      addDays(TODAY, 2),
    ]);
  });
});
