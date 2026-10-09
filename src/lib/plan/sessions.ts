import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError, isUuid } from "@/lib/actions/result";
import { dayName } from "./calendar";
import { isUniqueViolation, requireEditableMesocycle } from "./mesocycles";
import { parseDayOfWeek, parseName } from "./validation";

/**
 * The Session / SessionExercise write module (Split & Mesocycle Builder).
 * Plan rows are written only here and in ./mesocycles.ts (spec D66).
 *
 * Invariants:
 *  - Zero or one session per weekday (spec D14). Placing a session on an
 *    occupied day never overwrites silently: without `replace` it is a
 *    `conflict` naming the occupant; with `replace` the occupant moves to
 *    "Not on the schedule" — it is kept, never deleted (spec D15, D56).
 *  - Removing a session or a planned exercise is plan authoring: it deletes
 *    plan rows only, never an Exercise, a Gym, or another mesocycle's rows
 *    (spec D24, D25, D53). Logged history references sessions with
 *    onDelete: Restrict, so a session that has been trained can't be removed.
 *  - Archived mesocycles are read-only.
 *  - Nothing here reads or writes logged history, goals, or gym baselines.
 *  - Every function accepts an optional transaction client so callers compose.
 */

type Db = Prisma.TransactionClient;

function inTx<T>(tx: Db | undefined, run: (t: Db) => Promise<T>): Promise<T> {
  return tx ? run(tx) : prisma.$transaction(run);
}

const SESSION_NOT_FOUND = "That session doesn't exist.";

function invalid(details: Record<string, string>): DomainError {
  return new DomainError(
    "validation_error",
    "Check the highlighted fields.",
    details,
  );
}

/** Loads a session whose mesocycle is editable (draft or active). */
export async function requireEditableSession(sessionId: string, tx: Db) {
  const session = isUuid(sessionId)
    ? await tx.session.findUnique({
        where: { id: sessionId },
        select: { id: true, name: true, dayOfWeek: true, mesocycleId: true },
      })
    : null;
  if (!session) throw new DomainError("not_found", SESSION_NOT_FOUND);
  await requireEditableMesocycle(session.mesocycleId, tx);
  return session;
}

function parseDay(raw: unknown): number | null {
  const day = parseDayOfWeek(raw);
  if (!day.ok) throw invalid(day.details);
  return day.value;
}

/**
 * Frees `dayOfWeek` for `sessionId` (null = a new session). If another session
 * holds the day: without `replace`, a conflict naming it; with `replace`, that
 * session moves off the schedule.
 */
export async function clearDayFor(
  input: {
    mesocycleId: string;
    dayOfWeek: number | null;
    replace: boolean;
    sessionId?: string;
  },
  tx: Db,
): Promise<{ displacedId: string | null }> {
  if (input.dayOfWeek === null) return { displacedId: null };
  const occupant = await tx.session.findFirst({
    where: {
      mesocycleId: input.mesocycleId,
      dayOfWeek: input.dayOfWeek,
      ...(input.sessionId ? { id: { not: input.sessionId } } : {}),
    },
    select: { id: true, name: true },
  });
  if (!occupant) return { displacedId: null };
  if (!input.replace) {
    throw new DomainError(
      "conflict",
      `${dayName(input.dayOfWeek)} already has ${occupant.name}.`,
      { occupiedBy: occupant.name, dayOfWeek: String(input.dayOfWeek) },
    );
  }
  await tx.session.update({
    where: { id: occupant.id },
    data: { dayOfWeek: null },
  });
  return { displacedId: occupant.id };
}

/** A day taken between the read and the write → the same conflict. */
async function dayRace<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError(
        "conflict",
        "That day already has a session. Review and try again.",
      );
    }
    throw error;
  }
}

export async function addSession(
  input: {
    mesocycleId: string;
    name: unknown;
    dayOfWeek: unknown;
    replace?: boolean;
  },
  tx?: Db,
): Promise<{ id: string }> {
  const details: Record<string, string> = {};
  const name = parseName(input.name, details);
  if (Object.keys(details).length > 0) throw invalid(details);
  const dayOfWeek = parseDay(input.dayOfWeek);
  return dayRace(() =>
    inTx(tx, async (t) => {
      const m = await requireEditableMesocycle(input.mesocycleId, t);
      await clearDayFor(
        { mesocycleId: m.id, dayOfWeek, replace: input.replace === true },
        t,
      );
      const session = await t.session.create({
        data: { mesocycleId: m.id, name, dayOfWeek },
        select: { id: true },
      });
      return { id: session.id };
    }),
  );
}

export async function renameSession(
  input: { sessionId: string; name: unknown },
  tx?: Db,
): Promise<{ id: string }> {
  const details: Record<string, string> = {};
  const name = parseName(input.name, details);
  if (Object.keys(details).length > 0) throw invalid(details);
  return inTx(tx, async (t) => {
    const s = await requireEditableSession(input.sessionId, t);
    await t.session.update({ where: { id: s.id }, data: { name } });
    return { id: s.id };
  });
}

export async function moveSession(
  input: { sessionId: string; dayOfWeek: unknown; replace?: boolean },
  tx?: Db,
): Promise<{ id: string; displacedId: string | null }> {
  const dayOfWeek = parseDay(input.dayOfWeek);
  return dayRace(() =>
    inTx(tx, async (t) => {
      const s = await requireEditableSession(input.sessionId, t);
      if (s.dayOfWeek === dayOfWeek) return { id: s.id, displacedId: null };
      const { displacedId } = await clearDayFor(
        {
          mesocycleId: s.mesocycleId,
          dayOfWeek,
          replace: input.replace === true,
          sessionId: s.id,
        },
        t,
      );
      await t.session.update({ where: { id: s.id }, data: { dayOfWeek } });
      return { id: s.id, displacedId };
    }),
  );
}

/** Deletes the session and (by cascade) its planned exercises. */
export async function removeSession(
  input: { sessionId: string },
  tx?: Db,
): Promise<{ id: string; mesocycleId: string }> {
  try {
    return await inTx(tx, async (t) => {
      const s = await requireEditableSession(input.sessionId, t);
      await t.session.delete({ where: { id: s.id } });
      return { id: s.id, mesocycleId: s.mesocycleId };
    });
  } catch (error) {
    // Logged history references sessions with onDelete: Restrict.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      throw new DomainError(
        "invalid_state_transition",
        "This session has logged workouts and can't be removed.",
      );
    }
    throw error;
  }
}
