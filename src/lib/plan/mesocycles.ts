import "server-only";
import { DomainError } from "@/lib/actions/result";
import type { Account } from "@/lib/data/account";
import { parseIsoDate } from "./calendar";
import { plannedCardioCopies, plannedCardioSourceSelect } from "./cardio";
import { PRESET_STRUCTURES } from "./presets";
import { evaluateReadiness, readinessIssueMessage } from "./readiness";
import { planInclude, toReadinessInput } from "./snapshot";
import {
  parseMesocycleDetails,
  parseSplitType,
  type RawMesocycleDetails,
} from "./validation";
import {
  inTx,
  invalid,
  isUniqueViolation,
  lockMesocycle,
  mapDbErrors,
  plannedExerciseCopies,
  plannedExerciseSourceSelect,
  READ_ONLY,
  requireEditableMesocycle,
  sessionOrder,
  type Db,
} from "./write-support";

/**
 * The Mesocycle write module (Split & Mesocycle Builder). Mesocycle rows — and
 * the sessions a preset or a clone creates with them — are written only here
 * and in ./sessions.ts (spec D66).
 *
 * Invariants:
 *  - Every mesocycle is created as a DRAFT. `active` is reachable only through
 *    activateMesocycle, which re-checks readiness inside its transaction and
 *    archives the previous active block in the same transaction (spec D1–D3).
 *  - At most one active mesocycle: enforced here AND by the partial unique
 *    index `mesocycles_single_active` (spec D49).
 *  - Status checks happen under a row lock (write-support lockMesocycle), so a
 *    check and the write it guards can't interleave with another tab's
 *    activation, archive, or edit of the same block.
 *  - Presets create named, EMPTY sessions only — never a SessionExercise, a
 *    set count, a rep range, or a weight (spec D13).
 *  - Archived mesocycles are read-only. Mesocycles are never deleted.
 *  - Nothing here reads or writes logged history, goals, or gym baselines.
 *  - Every function takes the acting Account (Multi-User Foundation): all reads
 *    and writes go through its scoped client, so another account's block is
 *    "not found". Each also accepts an optional transaction client to compose.
 */

// Re-exported for ./sessions.ts and callers that compose plan writes.
export { isUniqueViolation, requireEditableMesocycle };

function toDbDate(iso: string | null): Date | null {
  return iso ? parseIsoDate(iso) : null;
}

export async function createMesocycle(
  account: Account,
  input: RawMesocycleDetails & { splitType?: unknown },
  tx?: Db,
): Promise<{ id: string }> {
  const details = parseMesocycleDetails(input);
  const split = parseSplitType(input.splitType);
  if (!details.ok || !split.ok) {
    throw invalid({
      ...(details.ok ? {} : details.details),
      ...(split.ok ? {} : split.details),
    });
  }
  return inTx(account, tx, async (t) => {
    const mesocycle = await t.mesocycle.create({
      data: {
        userId: account.userId,
        name: details.value.name,
        startDate: toDbDate(details.value.startDate),
        lengthWeeks: details.value.lengthWeeks,
        deloadEveryWeeks: details.value.deloadEveryWeeks,
        splitType: split.value,
        status: "draft",
      },
      select: { id: true },
    });
    // Structure only: named empty sessions on the preset's days.
    const structure = PRESET_STRUCTURES[split.value];
    if (structure.length > 0) {
      await t.session.createMany({
        data: structure.map((s, i) => ({
          userId: account.userId,
          mesocycleId: mesocycle.id,
          name: s.name,
          dayOfWeek: s.dayOfWeek,
          position: i,
        })),
      });
    }
    return { id: mesocycle.id };
  });
}

export async function updateMesocycleDetails(
  account: Account,
  input: RawMesocycleDetails & { mesocycleId: string },
  tx?: Db,
): Promise<{ id: string }> {
  const parsed = parseMesocycleDetails(input);
  if (!parsed.ok) throw invalid(parsed.details);
  const v = parsed.value;
  return inTx(account, tx, async (t) => {
    const row = await requireEditableMesocycle(account, input.mesocycleId, t);
    // A draft may hold an incomplete configuration; the live plan may not
    // (spec D61; backed by the mesocycles_active_is_well_formed CHECK).
    if (row.status === "active") {
      const details: Record<string, string> = {};
      if (!v.startDate)
        details.startDate = "An active block needs a start date.";
      if (v.deloadEveryWeeks > v.lengthWeeks)
        details.deloadEveryWeeks =
          "An active block needs its deload to happen at least once.";
      if (Object.keys(details).length > 0) throw invalid(details);
    }
    await t.mesocycle.update({
      where: { id: row.id },
      data: {
        name: v.name,
        startDate: toDbDate(v.startDate),
        lengthWeeks: v.lengthWeeks,
        deloadEveryWeeks: v.deloadEveryWeeks,
      },
    });
    return { id: row.id };
  });
}

/**
 * Draft → active. One transaction: the target is locked and must be a draft,
 * must be ready when re-checked here, and the currently active block must be
 * the one the lifter confirmed replacing (`expectedActiveId`); that block is
 * archived first, then the draft becomes active.
 */
export async function activateMesocycle(
  account: Account,
  input: { mesocycleId: string; expectedActiveId: string | null },
  tx?: Db,
): Promise<{ id: string; archivedId: string | null }> {
  return mapDbErrors(
    tx,
    () =>
      inTx(account, tx, async (t) => {
        const locked = await lockMesocycle(account, input.mesocycleId, t);
        if (locked.status !== "draft") {
          throw new DomainError(
            "invalid_state_transition",
            locked.status === "active"
              ? "This mesocycle is already active."
              : READ_ONLY,
          );
        }
        const plan = await t.mesocycle.findUniqueOrThrow({
          where: { id: locked.id },
          include: planInclude,
        });

        const readiness = evaluateReadiness(toReadinessInput(plan));
        if (!readiness.ready) {
          throw new DomainError(
            "invalid_state_transition",
            `This plan isn't ready: ${readinessIssueMessage(readiness.issues[0])}`,
            { issues: readiness.issues.map((i) => i.code).join(",") },
          );
        }

        const current = await t.mesocycle.findFirst({
          where: { status: "active" },
          select: { id: true },
        });
        if ((current?.id ?? null) !== (input.expectedActiveId ?? null)) {
          throw new DomainError(
            "conflict",
            "The active mesocycle changed. Review and try again.",
          );
        }

        if (current) {
          await t.mesocycle.update({
            where: { id: current.id },
            data: { status: "archived" },
          });
        }
        await t.mesocycle.update({
          where: { id: plan.id },
          data: { status: "active" },
        });
        return { id: plan.id, archivedId: current?.id ?? null };
      }),
    (error) =>
      isUniqueViolation(error)
        ? new DomainError(
            "conflict",
            "Another mesocycle became active. Review and try again.",
          )
        : null,
  );
}

/** Draft → archived (an abandoned draft). Never a delete (spec D46). */
export async function archiveDraftMesocycle(
  account: Account,
  input: { mesocycleId: string },
  tx?: Db,
): Promise<{ id: string }> {
  return inTx(account, tx, async (t) => {
    const row = await lockMesocycle(account, input.mesocycleId, t);
    if (row.status !== "draft") {
      throw new DomainError(
        "invalid_state_transition",
        "Only a draft can be archived this way.",
      );
    }
    await t.mesocycle.update({
      where: { id: row.id },
      data: { status: "archived" },
    });
    return { id: row.id };
  });
}

/**
 * Clone-forward (spec D30–D36, D47): a NEW draft built from a prior block's
 * plan. The source must be active or archived and is only read. Copied, field
 * by field: split type, the lifter's name/start/length/deload choices (from
 * the clone form), every session's name, day, and order, and every planned
 * exercise's exercise, order, sets, and rep range — archived exercises
 * included, so they arrive as repair slots that block activation until
 * replaced or removed (never dropped, substituted, or un-archived) — and each
 * day's planned cardio (day, activity, minutes; Cardio Logging R12).
 *
 * Plan-forward, never history-forward: no logged session, logged exercise,
 * logged set, cardio log, goal, gym baseline, or completion state is read or
 * written.
 */
export async function cloneMesocycle(
  account: Account,
  input: RawMesocycleDetails & { sourceMesocycleId: string },
  tx?: Db,
): Promise<{ id: string }> {
  const parsed = parseMesocycleDetails(input);
  if (!parsed.ok) throw invalid(parsed.details);
  const v = parsed.value;
  return inTx(account, tx, async (t) => {
    const locked = await lockMesocycle(account, input.sourceMesocycleId, t);
    if (locked.status === "draft") {
      throw new DomainError(
        "invalid_state_transition",
        "Only an active or archived mesocycle can be cloned.",
      );
    }
    const source = await t.mesocycle.findUniqueOrThrow({
      where: { id: locked.id },
      select: {
        splitType: true,
        sessions: {
          orderBy: sessionOrder,
          select: {
            name: true,
            dayOfWeek: true,
            sessionExercises: {
              orderBy: [{ position: "asc" }, { createdAt: "asc" }],
              select: plannedExerciseSourceSelect,
            },
          },
        },
        plannedCardio: {
          orderBy: { dayOfWeek: "asc" },
          select: plannedCardioSourceSelect,
        },
      },
    });

    const clone = await t.mesocycle.create({
      data: {
        userId: account.userId,
        name: v.name,
        startDate: toDbDate(v.startDate),
        lengthWeeks: v.lengthWeeks,
        deloadEveryWeeks: v.deloadEveryWeeks,
        splitType: source.splitType,
        status: "draft",
      },
      select: { id: true },
    });
    for (const [i, s] of source.sessions.entries()) {
      const session = await t.session.create({
        data: {
          userId: account.userId,
          mesocycleId: clone.id,
          name: s.name,
          dayOfWeek: s.dayOfWeek,
          // Keep the source's order (createdAt is identical within one tx).
          position: i,
        },
        select: { id: true },
      });
      if (s.sessionExercises.length > 0) {
        await t.sessionExercise.createMany({
          data: plannedExerciseCopies(account, session.id, s.sessionExercises),
        });
      }
    }
    if (source.plannedCardio.length > 0) {
      await t.plannedCardio.createMany({
        data: plannedCardioCopies(account, clone.id, source.plannedCardio),
      });
    }
    return { id: clone.id };
  });
}
