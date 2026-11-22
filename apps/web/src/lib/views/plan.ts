import "server-only";
import type { Account } from "@/lib/data/account";
import { accountToday } from "@/lib/data/account";
import { isUuid } from "@/lib/actions/result";
import { getWeekScheduleWithSessions } from "@/lib/logging/queries";
import { getMesocycleWeek, getSessionDetail } from "@/lib/plan/queries";
import {
  blockPosition,
  deloadWeeksOf,
  planWeekDays,
} from "@/lib/plan/week-grid";
import { addDays } from "@overload/shared/plan/calendar";
import { isScheduledDeloadWeek } from "@overload/shared/progression/deload";
import type {
  PlanOverviewDto,
  PlanSessionDto,
} from "@overload/shared/contracts/plan";

/**
 * The plan on the phone (Pitch 21h spec §6, E1 and E2): read-only views
 * composed from the reads the web's Plan and History pages already use, so
 * the two clients can never disagree about which block is active, which week
 * today is in (the account's time zone), which weeks deload, or where a
 * shifted day landed. Nothing here writes, and nothing here is Pro: no
 * progression reader is called.
 */

/** `GET /plan?week=n`. `week` outside the block is clamped; absent = today's week. */
export async function getPlanOverview(
  account: Account,
  week?: number,
): Promise<PlanOverviewDto> {
  const today = accountToday(account);
  const [active, drafts, previous] = await Promise.all([
    account.db.mesocycle.findFirst({
      where: { status: "active" },
      select: { id: true },
    }),
    account.db.mesocycle.count({ where: { status: "draft" } }),
    account.db.mesocycle.count({ where: { status: "archived" } }),
  ]);
  const otherBlocks = { drafts, previous };
  if (!active) return { today, block: null, otherBlocks };

  const [m, schedule] = await Promise.all([
    getMesocycleWeek(account, active.id),
    getWeekScheduleWithSessions(account, week),
  ]);
  // An active block always has a start date (activation requires one), so
  // the schedule exists; a block without one reads as no active plan.
  if (!m || !m.startDate || !schedule) {
    return { today, block: null, otherBlocks };
  }

  const weekStart = addDays(m.startDate, (schedule.weekNumber - 1) * 7);
  return {
    today,
    block: {
      summary: {
        id: m.id,
        name: m.name,
        status: m.status,
        splitType: m.splitType,
        splitLabel: m.splitLabel,
        startDate: m.startDate,
        endDate: m.endDate,
        lengthWeeks: m.lengthWeeks,
        deloadEveryWeeks: m.deloadEveryWeeks,
        sessionCount: m.sessionCount,
        issueCount: m.issueCount,
      },
      position: blockPosition(
        {
          startDate: m.startDate,
          lengthWeeks: m.lengthWeeks,
          deloadEveryWeeks: m.deloadEveryWeeks,
        },
        today,
      ),
      deloadWeeks: deloadWeeksOf(m.lengthWeeks, m.deloadEveryWeeks),
      template: m.week,
      templateCardio: m.cardio,
      unscheduled: m.unscheduled,
      week: {
        weekNumber: schedule.weekNumber,
        lengthWeeks: schedule.lengthWeeks,
        rangeLabel: schedule.rangeLabel,
        scheduledDeloadWeek: isScheduledDeloadWeek(
          schedule.weekNumber,
          m.deloadEveryWeeks,
        ),
        isCurrentWeek: schedule.weekNumber === schedule.currentWeek,
        days: planWeekDays({
          weekStart,
          today,
          occurrences: schedule.days,
          cardio: schedule.cardio,
        }),
      },
    },
    otherBlocks,
  };
}

/**
 * `GET /mesocycles/{mesocycleId}/sessions/{sessionId}`: the authored session
 * and its weekday's planned cardio. Null when either id is wrong, they don't
 * belong together, or they are another account's (identical answers).
 */
export async function getPlanSession(
  account: Account,
  mesocycleId: string,
  sessionId: string,
): Promise<PlanSessionDto | null> {
  const s = await getSessionDetail(account, mesocycleId, sessionId);
  if (!s) return null;
  const planned =
    s.dayOfWeek !== null && isUuid(mesocycleId)
      ? await account.db.plannedCardio.findFirst({
          where: { mesocycleId, dayOfWeek: s.dayOfWeek },
          select: { id: true, dayOfWeek: true, type: true, durationMin: true },
        })
      : null;
  return {
    id: s.id,
    name: s.name,
    dayOfWeek: s.dayOfWeek,
    mesocycle: s.mesocycle,
    exercises: s.exercises,
    cardio: planned,
  };
}
