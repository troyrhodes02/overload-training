import "server-only";
import type { Prisma } from "@prisma/client";
import { DomainError, isUuid } from "@/lib/actions/result";
import { parseCardioEntry } from "@/lib/cardio/validation";
import { dayName } from "./calendar";
import { parseDayOfWeek } from "./validation";
import {
  inTx,
  invalid,
  isUniqueViolation,
  mapDbErrors,
  requireEditableMesocycle,
  type Db,
} from "./write-support";

/**
 * The PlannedCardio write module (Cardio Logging, spec §11e). Planned cardio
 * rows are written only here and by clone-forward in ./mesocycles.ts.
 *
 * Invariants:
 *  - Planned cardio belongs to a DAY of the mesocycle, never to a Session: a
 *    day may hold lifting, cardio, both, or neither (R2, R3). Nothing here
 *    reads or writes a Session, SessionExercise, or Exercise.
 *  - Zero or one planned cardio item per weekday (R4): enforced here (a
 *    `conflict` naming the day) AND by the unique index on
 *    (mesocycle_id, day_of_week).
 *  - Type + whole minutes only (R5–R7).
 *  - Editing or removing the plan never touches a CardioLog (R9, R10): there
 *    is no foreign key from a CardioLog to its plan row, and this module never
 *    references cardio history.
 *  - Moving cardio to another day is delete + create in one transaction, so
 *    the new day's occurrences begin now (the occurrence floor, R56) instead
 *    of inventing past occurrences on that day.
 *  - Archived mesocycles are read-only (requireEditableMesocycle).
 *  - Every function accepts an optional transaction client so callers compose.
 */

const NOT_FOUND = "That planned cardio doesn't exist.";

type CardioFields = { dayOfWeek: number; type: string; durationMin: number };

function parseFields(raw: {
  dayOfWeek: unknown;
  type: unknown;
  durationMin: unknown;
}): CardioFields {
  const entry = parseCardioEntry(raw);
  const day = parseDayOfWeek(raw.dayOfWeek);
  const details: Record<string, string> = {
    ...(entry.ok ? {} : entry.details),
  };
  // Planned cardio is always on a day: "Not on the schedule" isn't a choice.
  if (!day.ok || day.value === null) details.dayOfWeek = "Choose a day.";
  if (Object.keys(details).length > 0 || !entry.ok || !day.ok)
    throw invalid(details);
  return { dayOfWeek: day.value as number, ...entry.value };
}

function dayTaken(dayOfWeek: number): DomainError {
  return new DomainError(
    "conflict",
    `${dayName(dayOfWeek)} already has cardio.`,
    { dayOfWeek: `${dayName(dayOfWeek)} already has cardio.` },
  );
}

/** A day taken between the read and the write → the same conflict. */
function dayRace<T>(
  tx: Db | undefined,
  dayOfWeek: number,
  run: () => Promise<T>,
): Promise<T> {
  return mapDbErrors(tx, run, (error) =>
    isUniqueViolation(error) ? dayTaken(dayOfWeek) : null,
  );
}

async function requireFreeDay(
  mesocycleId: string,
  dayOfWeek: number,
  tx: Db,
  exceptId?: string,
): Promise<void> {
  const occupant = await tx.plannedCardio.findFirst({
    where: {
      mesocycleId,
      dayOfWeek,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (occupant) throw dayTaken(dayOfWeek);
}

/** Loads a planned cardio row whose mesocycle is editable (draft or active). */
async function requireEditablePlannedCardio(plannedCardioId: string, tx: Db) {
  const row = isUuid(plannedCardioId)
    ? await tx.plannedCardio.findUnique({
        where: { id: plannedCardioId },
        select: { id: true, mesocycleId: true, dayOfWeek: true },
      })
    : null;
  if (!row) throw new DomainError("not_found", NOT_FOUND);
  await requireEditableMesocycle(row.mesocycleId, tx);
  return row;
}

export async function addPlannedCardio(
  input: {
    mesocycleId: string;
    dayOfWeek: unknown;
    type: unknown;
    durationMin: unknown;
  },
  tx?: Db,
): Promise<{ id: string }> {
  const fields = parseFields(input);
  return dayRace(tx, fields.dayOfWeek, () =>
    inTx(tx, async (t) => {
      const m = await requireEditableMesocycle(input.mesocycleId, t);
      await requireFreeDay(m.id, fields.dayOfWeek, t);
      const row = await t.plannedCardio.create({
        data: { mesocycleId: m.id, ...fields },
        select: { id: true },
      });
      return { id: row.id };
    }),
  );
}

/**
 * Edit activity, minutes, or day. Same day → update in place. Another day →
 * that day must be free; the row is replaced (delete + create) so the moved
 * item's occurrences start from now on its new day.
 */
export async function updatePlannedCardio(
  input: {
    plannedCardioId: string;
    dayOfWeek: unknown;
    type: unknown;
    durationMin: unknown;
  },
  tx?: Db,
): Promise<{ id: string }> {
  const fields = parseFields(input);
  return dayRace(tx, fields.dayOfWeek, () =>
    inTx(tx, async (t) => {
      const row = await requireEditablePlannedCardio(input.plannedCardioId, t);
      if (row.dayOfWeek === fields.dayOfWeek) {
        await t.plannedCardio.update({
          where: { id: row.id },
          data: { type: fields.type, durationMin: fields.durationMin },
        });
        return { id: row.id };
      }
      await requireFreeDay(row.mesocycleId, fields.dayOfWeek, t, row.id);
      await t.plannedCardio.delete({ where: { id: row.id } });
      const moved = await t.plannedCardio.create({
        data: { mesocycleId: row.mesocycleId, ...fields },
        select: { id: true },
      });
      return { id: moved.id };
    }),
  );
}

/**
 * Takes the item off the plan (plan authoring, like removing a session).
 * Cardio already logged for earlier occurrences is a separate record and is
 * never touched.
 */
export async function removePlannedCardio(
  input: { plannedCardioId: string },
  tx?: Db,
): Promise<{ id: string; mesocycleId: string }> {
  return inTx(tx, async (t) => {
    const row = await requireEditablePlannedCardio(input.plannedCardioId, t);
    await t.plannedCardio.delete({ where: { id: row.id } });
    return { id: row.id, mesocycleId: row.mesocycleId };
  });
}

/** The plan content of one planned cardio item — the only fields a copy carries. */
export const plannedCardioSourceSelect = {
  dayOfWeek: true,
  type: true,
  durationMin: true,
} satisfies Prisma.PlannedCardioSelect;

/**
 * The single field-by-field copy of planned cardio (spec R12, R48), used by
 * clone-forward: day, activity, minutes. Never a CardioLog, completion, or
 * missed state — those are history, and history is never cloned.
 */
export function plannedCardioCopies(
  mesocycleId: string,
  sources: { dayOfWeek: number; type: string; durationMin: number }[],
): Prisma.PlannedCardioCreateManyInput[] {
  return sources.map((s) => ({
    mesocycleId,
    dayOfWeek: s.dayOfWeek,
    type: s.type,
    durationMin: s.durationMin,
  }));
}
