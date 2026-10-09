import "server-only";
import { DomainError, isUuid } from "@/lib/actions/result";
import { dayName } from "./calendar";
import {
  copyName,
  parseDayOfWeek,
  parseName,
  parsePlannedExercise,
  type PlannedExerciseInput,
} from "./validation";
import {
  inTx,
  invalid,
  isForeignKeyViolation,
  isUniqueViolation,
  mapDbErrors,
  plannedExerciseCopies,
  plannedExerciseSourceSelect,
  requireEditableMesocycle,
  type Db,
} from "./write-support";

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

const SESSION_NOT_FOUND = "That session doesn't exist.";

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
function dayRace<T>(tx: Db | undefined, run: () => Promise<T>): Promise<T> {
  return mapDbErrors(tx, run, (error) =>
    isUniqueViolation(error)
      ? new DomainError(
          "conflict",
          "That day already has a session. Review and try again.",
        )
      : null,
  );
}

/** New sessions go after the existing ones (stable order, spec review #6). */
async function nextSessionPosition(mesocycleId: string, tx: Db) {
  const last = await tx.session.aggregate({
    where: { mesocycleId },
    _max: { position: true },
  });
  return (last._max.position ?? -1) + 1;
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
  return dayRace(tx, () =>
    inTx(tx, async (t) => {
      const m = await requireEditableMesocycle(input.mesocycleId, t);
      await clearDayFor(
        { mesocycleId: m.id, dayOfWeek, replace: input.replace === true },
        t,
      );
      const session = await t.session.create({
        data: {
          mesocycleId: m.id,
          name,
          dayOfWeek,
          position: await nextSessionPosition(m.id, t),
        },
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
  return dayRace(tx, () =>
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

/**
 * A new, independent session copied from `sessionId`'s plan (spec D26–D29):
 * named "<name> Copy", with each planned exercise copied field by field —
 * exercise, position, sets, rep range. An archived exercise is copied as-is,
 * so the copy shows the same repair slot (never dropped, swapped, or
 * un-archived). Nothing else is copied: no logged history, gym, weight,
 * progression, or completion exists on a plan to copy, and none is read.
 */
export async function duplicateSession(
  input: { sessionId: string; dayOfWeek: unknown; replace?: boolean },
  tx?: Db,
): Promise<{ id: string }> {
  const dayOfWeek = parseDay(input.dayOfWeek);
  return dayRace(tx, () =>
    inTx(tx, async (t) => {
      const source = await requireEditableSession(input.sessionId, t);
      await clearDayFor(
        {
          mesocycleId: source.mesocycleId,
          dayOfWeek,
          replace: input.replace === true,
        },
        t,
      );
      const copy = await t.session.create({
        data: {
          mesocycleId: source.mesocycleId,
          name: copyName(source.name),
          dayOfWeek,
          position: await nextSessionPosition(source.mesocycleId, t),
        },
        select: { id: true },
      });
      const slots = await t.sessionExercise.findMany({
        where: { sessionId: source.id },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: plannedExerciseSourceSelect,
      });
      if (slots.length > 0) {
        await t.sessionExercise.createMany({
          data: plannedExerciseCopies(copy.id, slots),
        });
      }
      return { id: copy.id };
    }),
  );
}

/** Deletes the session and (by cascade) its planned exercises. */
export async function removeSession(
  input: { sessionId: string },
  tx?: Db,
): Promise<{ id: string; mesocycleId: string }> {
  return mapDbErrors(
    tx,
    () =>
      inTx(tx, async (t) => {
        const s = await requireEditableSession(input.sessionId, t);
        await t.session.delete({ where: { id: s.id } });
        return { id: s.id, mesocycleId: s.mesocycleId };
      }),
    // Logged history references sessions with onDelete: Restrict.
    (error) =>
      isForeignKeyViolation(error)
        ? new DomainError(
            "invalid_state_transition",
            "This session has logged workouts and can't be removed.",
          )
        : null,
  );
}

/* ------------------------------------------------------------------------ */
/* Planned exercises (SessionExercise)                                       */
/* ------------------------------------------------------------------------ */

const SLOT_NOT_FOUND = "That planned exercise doesn't exist.";
const ALREADY_IN_SESSION = "Already in this session.";

/** Loads a planned exercise whose mesocycle is editable. */
async function requireEditableSlot(sessionExerciseId: string, tx: Db) {
  const slot = isUuid(sessionExerciseId)
    ? await tx.sessionExercise.findUnique({
        where: { id: sessionExerciseId },
        select: {
          id: true,
          sessionId: true,
          exerciseId: true,
          session: { select: { mesocycleId: true } },
        },
      })
    : null;
  if (!slot) throw new DomainError("not_found", SLOT_NOT_FOUND);
  await requireEditableMesocycle(slot.session.mesocycleId, tx);
  return slot;
}

/**
 * The library contract (spec D19): only an existing, ACTIVE exercise can be
 * planned. An archived exercise is never offered or re-planned, and nothing
 * here ever reactivates one (spec D36).
 */
async function requireActiveExercise(exerciseId: unknown, tx: Db) {
  const row =
    typeof exerciseId === "string" && isUuid(exerciseId)
      ? await tx.exercise.findUnique({
          where: { id: exerciseId },
          select: { id: true, deletedAt: true },
        })
      : null;
  if (!row) throw new DomainError("not_found", "That exercise doesn't exist.");
  if (row.deletedAt !== null) {
    throw new DomainError("validation_error", "That exercise is archived.", {
      exerciseId: "That exercise is archived.",
    });
  }
  return row;
}

/** One occurrence of an exercise per session (spec D20). */
async function requireNotInSession(
  sessionId: string,
  exerciseId: string,
  tx: Db,
  exceptSlotId?: string,
) {
  const existing = await tx.sessionExercise.findFirst({
    where: {
      sessionId,
      exerciseId,
      ...(exceptSlotId ? { id: { not: exceptSlotId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new DomainError("validation_error", ALREADY_IN_SESSION, {
      exerciseId: ALREADY_IN_SESSION,
    });
  }
}

/** A duplicate inserted between the check and the write → the same error. */
function slotRace<T>(tx: Db | undefined, run: () => Promise<T>): Promise<T> {
  return mapDbErrors(tx, run, (error) =>
    isUniqueViolation(error)
      ? new DomainError("validation_error", ALREADY_IN_SESSION, {
          exerciseId: ALREADY_IN_SESSION,
        })
      : null,
  );
}

function parsePlan(raw: {
  plannedSets?: unknown;
  targetRepMin?: unknown;
  targetRepMax?: unknown;
}): PlannedExerciseInput {
  const parsed = parsePlannedExercise(raw);
  if (!parsed.ok) throw invalid(parsed.details);
  return parsed.value;
}

/** Adds an exercise at the end of the session, with the sets and reps typed. */
export async function addSessionExercise(
  input: {
    sessionId: string;
    exerciseId: unknown;
    plannedSets: unknown;
    targetRepMin: unknown;
    targetRepMax: unknown;
  },
  tx?: Db,
): Promise<{ id: string }> {
  const plan = parsePlan(input);
  return slotRace(tx, () =>
    inTx(tx, async (t) => {
      const session = await requireEditableSession(input.sessionId, t);
      const exercise = await requireActiveExercise(input.exerciseId, t);
      await requireNotInSession(session.id, exercise.id, t);
      const last = await t.sessionExercise.aggregate({
        where: { sessionId: session.id },
        _max: { position: true },
      });
      const slot = await t.sessionExercise.create({
        data: {
          sessionId: session.id,
          exerciseId: exercise.id,
          position: (last._max.position ?? -1) + 1,
          ...plan,
        },
        select: { id: true },
      });
      return { id: slot.id };
    }),
  );
}

export async function updateSessionExercise(
  input: {
    sessionExerciseId: string;
    plannedSets: unknown;
    targetRepMin: unknown;
    targetRepMax: unknown;
  },
  tx?: Db,
): Promise<{ id: string }> {
  const plan = parsePlan(input);
  return inTx(tx, async (t) => {
    const slot = await requireEditableSlot(input.sessionExerciseId, t);
    await t.sessionExercise.update({ where: { id: slot.id }, data: plan });
    return { id: slot.id };
  });
}

/**
 * Points a slot at a different (active) exercise, keeping its sets, rep range,
 * and position: the repair path for an archived exercise (spec D58).
 */
export async function replaceSessionExercise(
  input: { sessionExerciseId: string; exerciseId: unknown },
  tx?: Db,
): Promise<{ id: string }> {
  return slotRace(tx, () =>
    inTx(tx, async (t) => {
      const slot = await requireEditableSlot(input.sessionExerciseId, t);
      const exercise = await requireActiveExercise(input.exerciseId, t);
      if (exercise.id === slot.exerciseId) return { id: slot.id };
      await requireNotInSession(slot.sessionId, exercise.id, t, slot.id);
      await t.sessionExercise.update({
        where: { id: slot.id },
        data: { exerciseId: exercise.id },
      });
      return { id: slot.id };
    }),
  );
}

/** Rewrites positions as 0..n-1 in the current order. */
async function renumber(sessionId: string, tx: Db) {
  const slots = await tx.sessionExercise.findMany({
    where: { sessionId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, position: true },
  });
  for (const [i, slot] of slots.entries()) {
    if (slot.position !== i) {
      await tx.sessionExercise.update({
        where: { id: slot.id },
        data: { position: i },
      });
    }
  }
}

/** Removes the slot from the plan. The Exercise row is never touched. */
export async function removeSessionExercise(
  input: { sessionExerciseId: string },
  tx?: Db,
): Promise<{ id: string; sessionId: string }> {
  return inTx(tx, async (t) => {
    const slot = await requireEditableSlot(input.sessionExerciseId, t);
    await t.sessionExercise.delete({ where: { id: slot.id } });
    await renumber(slot.sessionId, t);
    return { id: slot.id, sessionId: slot.sessionId };
  });
}

/** Swaps a slot with its neighbor; a no-op at either end (spec D52). */
export async function moveSessionExercise(
  input: { sessionExerciseId: string; direction: unknown },
  tx?: Db,
): Promise<{ id: string }> {
  if (input.direction !== "up" && input.direction !== "down") {
    throw invalid({ direction: "Choose up or down." });
  }
  const step = input.direction === "up" ? -1 : 1;
  return inTx(tx, async (t) => {
    const slot = await requireEditableSlot(input.sessionExerciseId, t);
    await renumber(slot.sessionId, t);
    const ordered = await t.sessionExercise.findMany({
      where: { sessionId: slot.sessionId },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });
    const i = ordered.findIndex((s) => s.id === slot.id);
    const j = i + step;
    if (j < 0 || j >= ordered.length) return { id: slot.id };
    await t.sessionExercise.update({
      where: { id: ordered[i].id },
      data: { position: ordered[j].position },
    });
    await t.sessionExercise.update({
      where: { id: ordered[j].id },
      data: { position: ordered[i].position },
    });
    return { id: slot.id };
  });
}
