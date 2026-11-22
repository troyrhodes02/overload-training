import type {
  PlannedCardioDto,
  PlannedExerciseDto,
  PlanSessionDto,
} from "@overload/shared/contracts/plan";
import { dayName } from "@overload/shared/plan/calendar";
import { formatPrescription } from "@overload/shared/plan/rep-target";
import { exerciseCountLabel } from "./plan-model";

/**
 * P2 Session's words (Pitch 21h design §6 P2). Pure. The prescription is the
 * web's own wording (shared `formatPrescription`); the bodyweight flag is the
 * server's.
 */

export type PlannedRow = {
  id: string;
  exerciseId: string;
  number: number;
  name: string;
  prescription: string;
  /** "Chest · Barbell", or "Bodyweight · reps only". */
  detail: string;
  chip: "Custom" | "Archived" | null;
  archived: boolean;
  imageUrl: string | null;
  accessibilityLabel: string;
};

export function plannedRow(e: PlannedExerciseDto, index: number): PlannedRow {
  const prescription = formatPrescription(e);
  const detail = e.isArchived
    ? "Replace it on the web"
    : e.requiresExternalWeight
      ? `${e.primaryMuscleLabel} · ${e.equipmentLabel}`
      : "Bodyweight · reps only";
  const chip = e.isArchived ? "Archived" : e.isCustom ? "Custom" : null;
  return {
    id: e.id,
    exerciseId: e.exerciseId,
    number: index + 1,
    name: e.exerciseName,
    prescription,
    detail,
    chip,
    archived: e.isArchived,
    imageUrl: e.imageUrl,
    accessibilityLabel: [
      String(index + 1),
      e.exerciseName,
      chip,
      prescription.replace("–", " to "),
      detail,
    ]
      .filter(Boolean)
      .join(", "),
  };
}

/** "Monday · 5 exercises · Spring Strength". */
export function sessionContextLine(s: PlanSessionDto): string {
  const day =
    s.dayOfWeek === null ? "Not on the schedule" : dayName(s.dayOfWeek);
  return `${day} · ${exerciseCountLabel(s.exercises.length)} · ${s.mesocycle.name}`;
}

export function cardioLine(c: PlannedCardioDto): {
  title: string;
  note: string;
} {
  return {
    title: `Cardio · ${c.type} · ${c.durationMin} min`,
    note: `Planned for ${dayName(c.dayOfWeek)}`,
  };
}

export const PLAN_FOOTNOTE =
  "This is the plan. A swap, a skipped exercise, or an extra set in a workout changes that workout only.";
