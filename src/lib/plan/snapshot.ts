import "server-only";
import type { Prisma } from "@prisma/client";
import { toIsoDate } from "./calendar";
import type { ReadinessInput } from "./readiness";

/**
 * The one shape a whole plan is read in: a mesocycle, its sessions, and each
 * session's planned exercises in order, with the referenced Exercise read
 * WITHOUT a `deletedAt` filter — an archived exercise must still resolve so
 * its slot can be shown and repaired (spec D43). Used by the queries and by
 * the activation transaction's readiness re-check.
 */
export const planInclude = {
  sessions: {
    // Explicit position first: rows created in one transaction share createdAt.
    orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    include: {
      sessionExercises: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              primaryMuscle: true,
              equipmentType: true,
              isCustom: true,
              imageRef: true,
              deletedAt: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.MesocycleInclude;

export type PlanRow = Prisma.MesocycleGetPayload<{
  include: typeof planInclude;
}>;

export function startDateIso(row: { startDate: Date | null }): string | null {
  return row.startDate ? toIsoDate(row.startDate) : null;
}

export function toReadinessInput(row: PlanRow): ReadinessInput {
  return {
    name: row.name,
    startDate: startDateIso(row),
    lengthWeeks: row.lengthWeeks,
    deloadWeek: row.deloadWeek,
    sessions: row.sessions.map((s) => ({
      id: s.id,
      name: s.name,
      dayOfWeek: s.dayOfWeek,
      exercises: s.sessionExercises.map((se) => ({
        id: se.id,
        exerciseName: se.exercise.name,
        isArchived: se.exercise.deletedAt !== null,
        plannedSets: se.plannedSets,
        targetRepMin: se.targetRepMin,
        targetRepMax: se.targetRepMax,
      })),
    })),
  };
}
