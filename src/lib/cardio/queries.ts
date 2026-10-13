import "server-only";
import { prisma } from "@/lib/db";
import {
  addDays,
  formatPlanDate,
  parseIsoDate,
  toIsoDate,
} from "@/lib/plan/calendar";
import type { ScheduleContext } from "@/lib/logging/schedule";
import { cardioWeekEntries, type CardioEntry } from "./schedule";

/**
 * Cardio reads for the dashboard and history (Cardio Logging spec §13). Facts
 * and the effective-schedule view only — nothing here is derived performance:
 * no trend, total, streak, or comparison beyond "differs from plan".
 */

export type CardioOccurrenceDto = CardioEntry & {
  mesocycleId: string;
  /** "Tue, Oct 13" — the effective date. */
  dateLabel: string;
};

/** The cardio entries of one week of the given (active) mesocycle. */
export async function getCardioWeek(
  active: { mesocycleId: string; ctx: ScheduleContext },
  week: number,
  todayIso: string,
): Promise<CardioOccurrenceDto[]> {
  const weekStart = addDays(active.ctx.startDate, (week - 1) * 7);
  const [planned, logs] = await Promise.all([
    prisma.plannedCardio.findMany({
      where: { mesocycleId: active.mesocycleId },
    }),
    // Only this week's records (by occurrence date).
    prisma.cardioLog.findMany({
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
