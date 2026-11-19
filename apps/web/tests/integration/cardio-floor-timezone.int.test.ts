import type { Account } from "@/lib/data/account";
import { logCardio } from "@/lib/cardio/cardio-logs";
import { getCardioWeek } from "@/lib/cardio/queries";
import { loadScheduleContext } from "@/lib/logging/schedule-context";
import { parseIsoDate } from "@overload/shared/plan/calendar";
import { createTestAccount } from "./support/accounts";
import { getTestPrisma } from "./support/db";
import { createTestMesocycle } from "./support/plan-factories";

/**
 * Planned cardio's occurrence floor is the day it was added IN THE ACCOUNT'S
 * TIMEZONE, like a lifting session's (OVE-147), not the UTC date (21f owner
 * notes; "Today is per account"). Before, cardio added on a Chicago evening
 * (already tomorrow in UTC) didn't appear that day and couldn't be logged
 * for it; and cardio added on a Tokyo morning (still yesterday in UTC)
 * appeared on the day before it existed.
 *
 * Fixed dates, independent of the wall clock: the block starts Monday
 * 2026-11-02 and is long past, so every occurrence in it is "missed" unless
 * logged, and logging one is allowed.
 */

const START = "2026-11-02"; // Monday
const TUE = 2;
const WED = 3;

async function cardioBlock(
  account: Account,
  dayOfWeek: number,
  createdAt: string,
) {
  const m = await createTestMesocycle({
    userId: account.userId,
    status: "active",
    startDate: parseIsoDate(START)!,
    lengthWeeks: 5,
    // Built the week before, so only the cardio row's own floor is in play.
    createdAt: new Date("2026-10-26T12:00:00Z"),
  });
  await getTestPrisma().plannedCardio.create({
    data: {
      userId: account.userId,
      mesocycleId: m.id,
      dayOfWeek,
      type: "Incline Walk",
      durationMin: 20,
      createdAt: new Date(createdAt),
    },
  });
  return m;
}

async function weekOne(account: Account, mesocycleId: string) {
  const meso = await getTestPrisma().mesocycle.findUniqueOrThrow({
    where: { id: mesocycleId },
    include: { sessions: true },
  });
  const ctx = await loadScheduleContext(
    account.db,
    {
      id: meso.id,
      startDate: meso.startDate!,
      lengthWeeks: meso.lengthWeeks,
      createdAt: meso.createdAt,
      sessions: meso.sessions,
    },
    account.timeZone,
  );
  const entries = await getCardioWeek(
    account,
    { mesocycleId, ctx },
    1,
    "2026-11-18",
  );
  return entries.map((e) => `${e.scheduledFor}:${e.state}`);
}

describe("planned cardio counts from the day it was added, in the account's timezone", () => {
  it("Chicago: added Wednesday 7:30 pm (Thursday in UTC) — Wednesday's occurrence exists and can be logged", async () => {
    const chicago = await createTestAccount("America/Chicago");
    // 2026-11-05T01:30Z is Wednesday 2026-11-04, 19:30 in Chicago.
    const m = await cardioBlock(chicago, WED, "2026-11-05T01:30:00Z");
    expect(await weekOne(chicago, m.id)).toEqual(["2026-11-04:missed"]);
    const logged = await logCardio(chicago, {
      mesocycleId: m.id,
      scheduledFor: "2026-11-04",
      type: "Incline Walk",
      durationMin: 20,
    });
    expect(logged.alreadyLogged).toBe(false);
    expect(await weekOne(chicago, m.id)).toEqual(["2026-11-04:complete"]);
  });

  it("Tokyo: added Wednesday 8:30 am (still Tuesday in UTC) — no Tuesday occurrence before it existed", async () => {
    const tokyo = await createTestAccount("Asia/Tokyo");
    // 2026-11-03T23:30Z is Wednesday 2026-11-04, 08:30 in Tokyo.
    const m = await cardioBlock(tokyo, TUE, "2026-11-03T23:30:00Z");
    expect(await weekOne(tokyo, m.id)).toEqual([]);
    await expect(
      logCardio(tokyo, {
        mesocycleId: m.id,
        scheduledFor: "2026-11-03",
        type: "Incline Walk",
        durationMin: 20,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("UTC accounts are unchanged", async () => {
    const utc = await createTestAccount("UTC");
    const m = await cardioBlock(utc, WED, "2026-11-04T23:59:00Z");
    expect(await weekOne(utc, m.id)).toEqual(["2026-11-04:missed"]);
  });

  it("a cardio log already recorded always shows, whatever the floor", async () => {
    const tokyo = await createTestAccount("Asia/Tokyo");
    const m = await cardioBlock(tokyo, TUE, "2026-11-03T23:30:00Z");
    // A record made under the old floor (Tuesday counted then): still shown.
    await getTestPrisma().cardioLog.create({
      data: {
        userId: tokyo.userId,
        mesocycleId: m.id,
        scheduledFor: parseIsoDate("2026-11-03")!,
        performedOn: parseIsoDate("2026-11-03")!,
        type: "Incline Walk",
        durationMin: 20,
        plannedType: "Incline Walk",
        plannedDurationMin: 20,
      },
    });
    expect(await weekOne(tokyo, m.id)).toEqual(["2026-11-03:complete"]);
  });
});
