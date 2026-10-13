import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError, isUuid } from "@/lib/actions/result";
import {
  mesocycleWeekForDate,
  parseIsoDate,
  toIsoDate,
  todayIso,
} from "@/lib/plan/calendar";
import { isUniqueViolation } from "@/lib/plan/write-support";
import { loadScheduleContext } from "@/lib/logging/schedule-context";
import { cardioWeekOccurrences } from "./schedule";
import { parseCardioEntry } from "./validation";

/**
 * The CardioLog write module (Cardio Logging spec §11c–§11d). CardioLog rows
 * are written ONLY here, and never deleted (R33).
 *
 * Invariants:
 *  - Plan-first (R13): a CardioLog records one planned cardio occurrence of
 *    the ACTIVE mesocycle, identified by (mesocycleId, scheduledFor = the
 *    occurrence's authored date). The unique index on that pair means a
 *    retried, double-tapped, or stale submission can never record it twice
 *    (R24, R25); a repeat returns the existing record UNCHANGED — correction
 *    is the separate, explicit editCardioLog.
 *  - The record holds what was actually done (type + whole minutes, which may
 *    differ from the plan, R19, R20) plus an immutable snapshot of the plan.
 *    It never writes the plan, a Session, a LoggedSession/Exercise/Set, a
 *    Gym baseline, or a Goal, and calls nothing in progression or goals
 *    (R26–R28, R34, R42–R47).
 *  - Occurrence placement reuses the effective schedule (src/lib/cardio/
 *    schedule.ts over Pitch 4's effectiveWeekSchedule); cardio never shifts
 *    anything.
 */

type Db = Prisma.TransactionClient;

export type LogCardioInput = {
  mesocycleId: string;
  scheduledFor: string;
  type: unknown;
  durationMin: unknown;
};

type LogCardioResult = { cardioLogId: string; alreadyLogged: boolean };

const NO_PLAN = "There's no planned cardio for that day.";

function parseEntry(raw: { type: unknown; durationMin: unknown }) {
  const entry = parseCardioEntry(raw);
  if (!entry.ok) {
    throw new DomainError(
      "validation_error",
      "Check the highlighted fields.",
      entry.details,
    );
  }
  return entry.value;
}

async function existingLog(
  db: Db,
  mesocycleId: string,
  date: Date,
): Promise<{ id: string } | null> {
  return db.cardioLog.findUnique({
    where: { mesocycleId_scheduledFor: { mesocycleId, scheduledFor: date } },
    select: { id: true },
  });
}

async function logCardioInTx(
  input: LogCardioInput,
  tx: Db,
): Promise<LogCardioResult> {
  const entry = parseEntry(input);
  const date = parseIsoDate(input.scheduledFor);
  if (!date) throw new DomainError("validation_error", "Invalid date.");
  if (!isUuid(input.mesocycleId)) throw new DomainError("not_found", NO_PLAN);

  // Idempotent: an occurrence already recorded is returned as-is.
  const existing = await existingLog(tx, input.mesocycleId, date);
  if (existing) return { cardioLogId: existing.id, alreadyLogged: true };

  const meso = await tx.mesocycle.findUnique({
    where: { id: input.mesocycleId },
    include: {
      sessions: { select: { id: true, name: true, dayOfWeek: true } },
      plannedCardio: true,
    },
  });
  if (!meso) throw new DomainError("not_found", NO_PLAN);
  if (meso.status !== "active" || !meso.startDate) {
    throw new DomainError(
      "invalid_state_transition",
      "Cardio can only be logged for the active plan.",
    );
  }

  const week = mesocycleWeekForDate(
    toIsoDate(meso.startDate),
    input.scheduledFor,
  );
  const ctx = await loadScheduleContext(tx, {
    id: meso.id,
    startDate: meso.startDate,
    lengthWeeks: meso.lengthWeeks,
    sessions: meso.sessions,
  });
  const planned = meso.plannedCardio.map((p) => ({
    id: p.id,
    dayOfWeek: p.dayOfWeek,
    type: p.type,
    durationMin: p.durationMin,
    createdIso: toIsoDate(p.createdAt),
  }));
  const occurrence =
    week === null
      ? undefined
      : cardioWeekOccurrences(ctx, planned, week).find(
          (o) => o.authoredIso === input.scheduledFor,
        );
  if (!occurrence) throw new DomainError("not_found", NO_PLAN);
  if (occurrence.effectiveIso === null) {
    throw new DomainError(
      "invalid_state_transition",
      "That day was shifted out of the week.",
    );
  }
  if (occurrence.effectiveIso > todayIso()) {
    throw new DomainError(
      "invalid_state_transition",
      "That cardio isn't due yet.",
    );
  }

  // The snapshot is the plan as it stands when the occurrence is logged.
  // Plan rows are edited in place (only a day move starts a new row), so a
  // late log after a same-day type/minutes edit snapshots the edited plan;
  // a true plan-at-occurrence record would need plan versioning, which is
  // out of scope for Pitch 7 (review finding, deferred; spec R51).
  const log = await tx.cardioLog.create({
    data: {
      mesocycleId: meso.id,
      scheduledFor: date,
      plannedType: occurrence.type,
      plannedDurationMin: occurrence.durationMin,
      type: entry.type,
      durationMin: entry.durationMin,
      performedOn: parseIsoDate(occurrence.effectiveIso) as Date,
    },
    select: { id: true },
  });
  return { cardioLogId: log.id, alreadyLogged: false };
}

/**
 * Record what was actually done for one planned cardio occurrence. Retries
 * are safe server-side: an existing record (or a concurrent insert that wins
 * the unique index) is returned with `alreadyLogged: true`, unchanged.
 */
export async function logCardio(
  input: LogCardioInput,
  tx?: Db,
): Promise<LogCardioResult> {
  if (tx) return logCardioInTx(input, tx);
  try {
    return await prisma.$transaction((t) => logCardioInTx(input, t));
  } catch (error) {
    // Only when this module opened the transaction: a concurrent submission
    // for the same occurrence won the unique index — it is already recorded.
    if (isUniqueViolation(error)) {
      const date = parseIsoDate(input.scheduledFor);
      const existing = date
        ? await existingLog(prisma, input.mesocycleId, date)
        : null;
      if (existing) return { cardioLogId: existing.id, alreadyLogged: true };
    }
    throw error;
  }
}

/**
 * Correct a recorded entry's activity and minutes (R32, R62). Nothing else
 * changes: not the plan snapshot, the occurrence, or the date — and nothing
 * downstream, because nothing downstream reads cardio (R34).
 */
export async function editCardioLog(
  input: { cardioLogId: string; type: unknown; durationMin: unknown },
  tx?: Db,
): Promise<{ id: string }> {
  const entry = parseEntry(input);
  const run = async (t: Db) => {
    const row = isUuid(input.cardioLogId)
      ? await t.cardioLog.findUnique({
          where: { id: input.cardioLogId },
          select: { id: true },
        })
      : null;
    if (!row) {
      throw new DomainError("not_found", "That cardio entry doesn't exist.");
    }
    await t.cardioLog.update({
      where: { id: row.id },
      data: { type: entry.type, durationMin: entry.durationMin },
    });
    return { id: row.id };
  };
  return tx ? run(tx) : prisma.$transaction(run);
}
