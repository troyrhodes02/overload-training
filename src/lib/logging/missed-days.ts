import "server-only";
import { Prisma, type MissedDayOutcome } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/actions/result";
import { parseIsoDate } from "@/lib/plan/calendar";

/**
 * Missed-day resolution (Resolved Decisions 30–39). A resolution is a dated
 * historical fact: one per missed planned day, immutable in Pitch 4. The
 * effective schedule is derived from the Mesocycle plus these records; the
 * authored Session template is never mutated here.
 */

type Db = Prisma.TransactionClient;

/** ISO 1 = Monday … 7 = Sunday from a UTC-midnight calendar date. */
function isoWeekday(date: Date): number {
  return ((date.getUTCDay() + 6) % 7) + 1;
}

export async function resolveMissedDay(
  input: { mesocycleId: string; missedOn: string; outcome: MissedDayOutcome },
  tx?: Db,
): Promise<void> {
  if (!tx)
    return void (await prisma.$transaction((t) => resolveMissedDay(input, t)));

  const date = parseIsoDate(input.missedOn);
  if (!date) throw new DomainError("validation_error", "Invalid date.");

  const existing = await tx.missedDayResolution.findUnique({
    where: {
      mesocycleId_missedOn: { mesocycleId: input.mesocycleId, missedOn: date },
    },
    select: { id: true },
  });
  if (existing) {
    // Immutable: a confirmed resolution is historical fact (Decision 33).
    throw new DomainError("conflict", "That day is already resolved.");
  }

  // Record the planned Session occurrence for reference (one session per weekday).
  const session = await tx.session.findFirst({
    where: { mesocycleId: input.mesocycleId, dayOfWeek: isoWeekday(date) },
    select: { id: true },
  });

  await tx.missedDayResolution.create({
    data: {
      mesocycleId: input.mesocycleId,
      sessionId: session?.id ?? null,
      missedOn: date,
      outcome: input.outcome,
    },
  });
}
