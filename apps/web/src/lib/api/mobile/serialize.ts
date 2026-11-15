import "server-only";
import type { LoggedSet } from "@prisma/client";
import type { LoggedSetDto } from "@overload/shared/contracts/views";

/**
 * A stored LoggedSet as the mobile API sends it (Pitch 21e spec §6): exactly
 * as entered, no derived value. A bodyweight set's weight stays null (never
 * 0) and an unrecorded RIR stays null; the Decimal becomes a number and the
 * instants ISO strings (wire conventions, contracts/wire.ts).
 */
export function toLoggedSetDto(set: LoggedSet): LoggedSetDto {
  return {
    id: set.id,
    loggedExerciseId: set.loggedExerciseId,
    setNumber: set.setNumber,
    weightLbs: set.weightLbs === null ? null : Number(set.weightLbs),
    reps: set.reps,
    rir: set.rir,
    createdAt: set.createdAt.toISOString(),
    updatedAt: set.updatedAt.toISOString(),
  };
}
