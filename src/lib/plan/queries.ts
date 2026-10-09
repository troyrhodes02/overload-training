import "server-only";
import { prisma } from "@/lib/db";
import { isUuid } from "@/lib/actions/result";
import { exerciseImageUrl } from "@/lib/exercises/images";
import { equipmentLabel, muscleGroupLabel } from "@/lib/exercises/taxonomy";
import { cloneDefaultStartDate, plannedEndDate } from "./calendar";
import { copyName } from "./validation";
import { SPLIT_TYPE_LABELS, type SplitTypeValue } from "./presets";
import { evaluateReadiness, type Readiness } from "./readiness";
import {
  planInclude,
  startDateIso,
  toReadinessInput,
  type PlanRow,
} from "./snapshot";

/**
 * Plan reads for server components. Readiness, "needs attention", and the
 * archived state of a slot are all computed here on read (spec D43, D68).
 * Exercises are read without a `deletedAt` filter so archived ones still
 * resolve inside an existing plan.
 */

export type MesocycleStatusValue = "draft" | "active" | "archived";

export type MesocycleSummaryDto = {
  id: string;
  name: string;
  status: MesocycleStatusValue;
  splitType: SplitTypeValue;
  splitLabel: string;
  startDate: string | null;
  endDate: string | null;
  lengthWeeks: number;
  deloadWeek: number;
  sessionCount: number;
  issueCount: number;
};

export type SessionSummaryDto = {
  id: string;
  name: string;
  dayOfWeek: number | null;
  exerciseCount: number;
  archivedCount: number;
};

export type PlannedExerciseDto = {
  id: string;
  exerciseId: string;
  exerciseName: string;
  primaryMuscleLabel: string;
  equipmentLabel: string;
  isCustom: boolean;
  imageUrl: string | null;
  isArchived: boolean;
  plannedSets: number;
  targetRepMin: number;
  targetRepMax: number;
  position: number;
};

export type MesocycleWeekDto = MesocycleSummaryDto & {
  /** Index 0 = Monday … 6 = Sunday. */
  week: (SessionSummaryDto | null)[];
  unscheduled: SessionSummaryDto[];
  readiness: Readiness;
  /** The currently active block, when it is not this one. */
  activeOther: { id: string; name: string } | null;
};

export type MesocycleHomeDto = {
  active: MesocycleSummaryDto | null;
  drafts: MesocycleSummaryDto[];
  previous: MesocycleSummaryDto[];
};

function toSummary(row: PlanRow, readiness: Readiness): MesocycleSummaryDto {
  const startDate = startDateIso(row);
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    splitType: row.splitType,
    splitLabel: SPLIT_TYPE_LABELS[row.splitType],
    startDate,
    endDate: startDate ? plannedEndDate(startDate, row.lengthWeeks) : null,
    lengthWeeks: row.lengthWeeks,
    deloadWeek: row.deloadWeek,
    sessionCount: row.sessions.length,
    issueCount: readiness.issues.length,
  };
}

function toSessionSummary(s: PlanRow["sessions"][number]): SessionSummaryDto {
  return {
    id: s.id,
    name: s.name,
    dayOfWeek: s.dayOfWeek,
    exerciseCount: s.sessionExercises.length,
    archivedCount: s.sessionExercises.filter(
      (se) => se.exercise.deletedAt !== null,
    ).length,
  };
}

export function toPlannedExercise(
  se: PlanRow["sessions"][number]["sessionExercises"][number],
): PlannedExerciseDto {
  const e = se.exercise;
  return {
    id: se.id,
    exerciseId: e.id,
    exerciseName: e.name,
    primaryMuscleLabel: muscleGroupLabel(e.primaryMuscle),
    equipmentLabel: equipmentLabel(e.equipmentType),
    isCustom: e.isCustom,
    imageUrl: e.isCustom ? null : exerciseImageUrl(e.imageRef),
    isArchived: e.deletedAt !== null,
    plannedSets: se.plannedSets,
    targetRepMin: se.targetRepMin,
    targetRepMax: se.targetRepMax,
    position: se.position,
  };
}

export async function listMesocyclesForHome(): Promise<MesocycleHomeDto> {
  const rows = await prisma.mesocycle.findMany({
    include: planInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
  const summaries = rows.map((r) =>
    toSummary(r, evaluateReadiness(toReadinessInput(r))),
  );
  const byStartDesc = (a: MesocycleSummaryDto, b: MesocycleSummaryDto) =>
    (b.startDate ?? "").localeCompare(a.startDate ?? "");
  return {
    active: summaries.find((s) => s.status === "active") ?? null,
    drafts: summaries.filter((s) => s.status === "draft"),
    previous: summaries
      .filter((s) => s.status === "archived")
      .sort(byStartDesc),
  };
}

/** True when an active or archived mesocycle exists to clone forward. */
export async function hasCloneSource(): Promise<boolean> {
  const row = await prisma.mesocycle.findFirst({
    where: { status: { in: ["active", "archived"] } },
    select: { id: true },
  });
  return row !== null;
}

export async function getMesocycleWeek(
  id: string,
): Promise<MesocycleWeekDto | null> {
  if (!isUuid(id)) return null;
  const [row, active] = await Promise.all([
    prisma.mesocycle.findUnique({ where: { id }, include: planInclude }),
    prisma.mesocycle.findFirst({
      where: { status: "active" },
      select: { id: true, name: true },
    }),
  ]);
  if (!row) return null;
  const readiness = evaluateReadiness(toReadinessInput(row));
  const week: (SessionSummaryDto | null)[] = Array.from(
    { length: 7 },
    () => null,
  );
  const unscheduled: SessionSummaryDto[] = [];
  for (const s of row.sessions) {
    if (s.dayOfWeek === null) unscheduled.push(toSessionSummary(s));
    else week[s.dayOfWeek - 1] = toSessionSummary(s);
  }
  return {
    ...toSummary(row, readiness),
    week,
    unscheduled,
    readiness,
    activeOther: active && active.id !== row.id ? active : null,
  };
}

/** Which session (if any) sits on each weekday — for the day pickers. */
export type DayOccupancyDto = {
  dayOfWeek: number;
  sessionId: string | null;
  sessionName: string | null;
};

export type SessionDetailDto = {
  id: string;
  name: string;
  dayOfWeek: number | null;
  mesocycle: { id: string; name: string; status: MesocycleStatusValue };
  exercises: PlannedExerciseDto[];
  occupancy: DayOccupancyDto[];
};

export function occupancyOf(
  sessions: { id: string; name: string; dayOfWeek: number | null }[],
): DayOccupancyDto[] {
  return Array.from({ length: 7 }, (_, i) => {
    const s = sessions.find((x) => x.dayOfWeek === i + 1);
    return {
      dayOfWeek: i + 1,
      sessionId: s?.id ?? null,
      sessionName: s?.name ?? null,
    };
  });
}

/** A session inside its mesocycle (null when either id is wrong or mismatched). */
export async function getSessionDetail(
  mesocycleId: string,
  sessionId: string,
): Promise<SessionDetailDto | null> {
  if (!isUuid(mesocycleId) || !isUuid(sessionId)) return null;
  // Just this session's planned exercises, plus a light list of the
  // mesocycle's sessions for day occupancy — not the whole plan graph.
  const session = await prisma.session.findFirst({
    where: { id: sessionId, mesocycleId },
    include: {
      sessionExercises: planInclude.sessions.include.sessionExercises,
      mesocycle: {
        select: {
          id: true,
          name: true,
          status: true,
          sessions: { select: { id: true, name: true, dayOfWeek: true } },
        },
      },
    },
  });
  if (!session) return null;
  const m = session.mesocycle;
  return {
    id: session.id,
    name: session.name,
    dayOfWeek: session.dayOfWeek,
    mesocycle: { id: m.id, name: m.name, status: m.status },
    exercises: session.sessionExercises.map(toPlannedExercise),
    occupancy: occupancyOf(m.sessions),
  };
}

/** Prior blocks that can be cloned forward: the active one, then archived (spec D47). */
export async function listCloneSources(): Promise<MesocycleSummaryDto[]> {
  const rows = await prisma.mesocycle.findMany({
    where: { status: { in: ["active", "archived"] } },
    include: planInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
  const summaries = rows.map((r) =>
    toSummary(r, evaluateReadiness(toReadinessInput(r))),
  );
  const rank = (s: MesocycleSummaryDto) => (s.status === "active" ? 0 : 1);
  return summaries.sort(
    (a, b) =>
      rank(a) - rank(b) || (b.startDate ?? "").localeCompare(a.startDate ?? ""),
  );
}

export type CloneSetupDto = {
  source: MesocycleSummaryDto;
  defaults: {
    name: string;
    startDate: string | null;
    lengthWeeks: number;
    deloadWeek: number;
  };
  exerciseCount: number;
  archivedReferences: { exerciseName: string; sessionName: string }[];
};

/**
 * What a clone of `sourceId` would start from (spec D33–D35): "<name> Copy",
 * the day after the source's planned end, the same length and deload week —
 * all editable — plus the archived exercises that will arrive for repair.
 * Null when the source doesn't exist or is a draft.
 */
export async function getCloneSetup(
  sourceId: string,
): Promise<CloneSetupDto | null> {
  if (!isUuid(sourceId)) return null;
  const row = await prisma.mesocycle.findUnique({
    where: { id: sourceId },
    include: planInclude,
  });
  if (!row || row.status === "draft") return null;
  const readiness = evaluateReadiness(toReadinessInput(row));
  const startDate = startDateIso(row);
  return {
    source: toSummary(row, readiness),
    defaults: {
      name: copyName(row.name),
      startDate: cloneDefaultStartDate(startDate, row.lengthWeeks),
      lengthWeeks: row.lengthWeeks,
      deloadWeek: row.deloadWeek,
    },
    exerciseCount: row.sessions.reduce(
      (n, s) => n + s.sessionExercises.length,
      0,
    ),
    archivedReferences: readiness.issues.flatMap((i) =>
      i.code === "exercise_archived"
        ? [{ exerciseName: i.exerciseName, sessionName: i.sessionName }]
        : [],
    ),
  };
}
