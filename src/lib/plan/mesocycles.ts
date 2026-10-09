import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError, isUuid } from "@/lib/actions/result";
import { parseIsoDate } from "./calendar";
import { PRESET_STRUCTURES } from "./presets";
import { evaluateReadiness, readinessIssueMessage } from "./readiness";
import { planInclude, toReadinessInput } from "./snapshot";
import {
  parseMesocycleDetails,
  parseSplitType,
  type RawMesocycleDetails,
} from "./validation";

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
 *  - Presets create named, EMPTY sessions only — never a SessionExercise, a
 *    set count, a rep range, or a weight (spec D13).
 *  - Archived mesocycles are read-only. Mesocycles are never deleted.
 *  - Nothing here reads or writes logged history, goals, or gym baselines.
 *  - Every function accepts an optional transaction client so callers compose.
 */

type Db = Prisma.TransactionClient;

const READ_ONLY =
  "Archived mesocycles are read-only. Clone it forward to change it.";

function inTx<T>(tx: Db | undefined, run: (t: Db) => Promise<T>): Promise<T> {
  return tx ? run(tx) : prisma.$transaction(run);
}

function toDbDate(iso: string | null): Date | null {
  return iso ? parseIsoDate(iso) : null;
}

/** A unique-index race (two activations, a day taken meanwhile) → conflict. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/** Loads a mesocycle for writing; archived ones are rejected. */
export async function requireEditableMesocycle(mesocycleId: string, tx: Db) {
  const row = isUuid(mesocycleId)
    ? await tx.mesocycle.findUnique({
        where: { id: mesocycleId },
        select: { id: true, status: true },
      })
    : null;
  if (!row) throw new DomainError("not_found", "That mesocycle doesn't exist.");
  if (row.status === "archived") {
    throw new DomainError("invalid_state_transition", READ_ONLY);
  }
  return row;
}

function invalid(details: Record<string, string>): DomainError {
  return new DomainError(
    "validation_error",
    "Check the highlighted fields.",
    details,
  );
}

export async function createMesocycle(
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
  return inTx(tx, async (t) => {
    const mesocycle = await t.mesocycle.create({
      data: {
        name: details.value.name,
        startDate: toDbDate(details.value.startDate),
        lengthWeeks: details.value.lengthWeeks,
        deloadWeek: details.value.deloadWeek,
        splitType: split.value,
        status: "draft",
      },
      select: { id: true },
    });
    // Structure only: named empty sessions on the preset's days.
    const structure = PRESET_STRUCTURES[split.value];
    if (structure.length > 0) {
      await t.session.createMany({
        data: structure.map((s) => ({
          mesocycleId: mesocycle.id,
          name: s.name,
          dayOfWeek: s.dayOfWeek,
        })),
      });
    }
    return { id: mesocycle.id };
  });
}

export async function updateMesocycleDetails(
  input: RawMesocycleDetails & { mesocycleId: string },
  tx?: Db,
): Promise<{ id: string }> {
  const parsed = parseMesocycleDetails(input);
  if (!parsed.ok) throw invalid(parsed.details);
  const v = parsed.value;
  return inTx(tx, async (t) => {
    const row = await requireEditableMesocycle(input.mesocycleId, t);
    // A draft may hold an incomplete configuration; the live plan may not
    // (spec D61; backed by the mesocycles_active_is_well_formed CHECK).
    if (row.status === "active") {
      const details: Record<string, string> = {};
      if (!v.startDate)
        details.startDate = "An active block needs a start date.";
      if (v.deloadWeek > v.lengthWeeks)
        details.deloadWeek = "An active block needs a deload week inside it.";
      if (Object.keys(details).length > 0) throw invalid(details);
    }
    await t.mesocycle.update({
      where: { id: row.id },
      data: {
        name: v.name,
        startDate: toDbDate(v.startDate),
        lengthWeeks: v.lengthWeeks,
        deloadWeek: v.deloadWeek,
      },
    });
    return { id: row.id };
  });
}

/**
 * Draft → active. One transaction: the target must be a draft, must be ready
 * when re-checked here, and the currently active block must be the one the
 * lifter confirmed replacing (`expectedActiveId`); that block is archived
 * first, then the draft becomes active.
 */
export async function activateMesocycle(
  input: { mesocycleId: string; expectedActiveId: string | null },
  tx?: Db,
): Promise<{ id: string; archivedId: string | null }> {
  try {
    return await inTx(tx, async (t) => {
      const plan = isUuid(input.mesocycleId)
        ? await t.mesocycle.findUnique({
            where: { id: input.mesocycleId },
            include: planInclude,
          })
        : null;
      if (!plan) {
        throw new DomainError("not_found", "That mesocycle doesn't exist.");
      }
      if (plan.status !== "draft") {
        throw new DomainError(
          "invalid_state_transition",
          plan.status === "active"
            ? "This mesocycle is already active."
            : READ_ONLY,
        );
      }

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
      const { count } = await t.mesocycle.updateMany({
        where: { id: plan.id, status: "draft" },
        data: { status: "active" },
      });
      if (count !== 1) {
        throw new DomainError(
          "conflict",
          "This mesocycle changed. Review and try again.",
        );
      }
      return { id: plan.id, archivedId: current?.id ?? null };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError(
        "conflict",
        "Another mesocycle became active. Review and try again.",
      );
    }
    throw error;
  }
}

/** Draft → archived (an abandoned draft). Never a delete (spec D46). */
export async function archiveDraftMesocycle(
  input: { mesocycleId: string },
  tx?: Db,
): Promise<{ id: string }> {
  return inTx(tx, async (t) => {
    const row = isUuid(input.mesocycleId)
      ? await t.mesocycle.findUnique({
          where: { id: input.mesocycleId },
          select: { id: true, status: true },
        })
      : null;
    if (!row)
      throw new DomainError("not_found", "That mesocycle doesn't exist.");
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
