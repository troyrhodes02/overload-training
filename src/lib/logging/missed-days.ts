import "server-only";
import type { MissedDayOutcome } from "@prisma/client";
import { DomainError, isUuid } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import type { AccountTx } from "@/lib/data/account-db";
import { parseIsoDate } from "@/lib/plan/calendar";

/**
 * Missed-day resolution (Resolved Decisions 30–39). A resolution is a dated
 * historical fact: one per missed planned day, immutable in Pitch 4. The
 * effective schedule is derived from the Mesocycle plus these records; the
 * authored Session template is never mutated here.
 */

type Db = AccountTx;

/** ISO 1 = Monday … 7 = Sunday from a UTC-midnight calendar date. */
function isoWeekday(date: Date): number {
  return ((date.getUTCDay() + 6) % 7) + 1;
}

export async function resolveMissedDay(
  account: Account,
  input: { mesocycleId: string; missedOn: string; outcome: MissedDayOutcome },
  tx?: Db,
): Promise<void> {
  if (!tx)
    return void (await account.db.$transaction((t) =>
      resolveMissedDay(account, input, t),
    ));

  const date = parseIsoDate(input.missedOn);
  if (!date) throw new DomainError("validation_error", "Invalid date.");
  // The mesocycle must be the acting account's: another account's (or a
  // missing) one is "not found" — never a resolution pointing at it.
  const meso = isUuid(input.mesocycleId)
    ? await tx.mesocycle.findUnique({
        where: { id: input.mesocycleId },
        select: { id: true },
      })
    : null;
  if (!meso)
    throw new DomainError("not_found", "That mesocycle doesn't exist.");

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
      userId: account.userId,
      mesocycleId: input.mesocycleId,
      sessionId: session?.id ?? null,
      missedOn: date,
      outcome: input.outcome,
    },
  });
}
