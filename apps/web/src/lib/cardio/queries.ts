import "server-only";
import { type Account } from "@/lib/data/account";
import {
  addDays,
  formatPlanDate,
  parseIsoDate,
  toIsoDate,
} from "@overload/shared/plan/calendar";
import type { ScheduleContext } from "@overload/shared/logging/schedule";
import { cardioWeekEntries } from "@overload/shared/cardio/schedule";
import type { CardioOccurrenceDto } from "@overload/shared/contracts/cardio";
export type { CardioOccurrenceDto } from "@overload/shared/contracts/cardio";

/** The cardio entries of one week of the given (active) mesocycle. */
export async function getCardioWeek(
  account: Account,
  active: { mesocycleId: string; ctx: ScheduleContext },
  week: number,
  todayIso: string,
): Promise<CardioOccurrenceDto[]> {
  const weekStart = addDays(active.ctx.startDate, (week - 1) * 7);
  const [planned, logs] = await Promise.all([
    account.db.plannedCardio.findMany({
      where: { mesocycleId: active.mesocycleId },
    }),
    // Only this week's records (by occurrence date).
    account.db.cardioLog.findMany({
      where: {
        mesocycleId: active.mesocycleId,
        scheduledFor: {
          gte: parseIsoDate(weekStart) as Date,
          lte: parseIsoDate(addDays(weekStart, 6)) as Date,
        },
      },
    }),
  ]);
  return cardioWeekEntries(
    active.ctx,
    planned.map((p) => ({
      id: p.id,
      dayOfWeek: p.dayOfWeek,
      type: p.type,
      durationMin: p.durationMin,
      createdIso: toIsoDate(p.createdAt),
    })),
    logs.map((l) => ({
      id: l.id,
      scheduledFor: toIsoDate(l.scheduledFor),
      type: l.type,
      durationMin: l.durationMin,
      plannedType: l.plannedType,
      plannedDurationMin: l.plannedDurationMin,
      performedIso: toIsoDate(l.performedOn),
    })),
    week,
    todayIso,
  ).map((e) => ({
    ...e,
    mesocycleId: active.mesocycleId,
    dateLabel: formatPlanDate(e.dateIso),
  }));
}
