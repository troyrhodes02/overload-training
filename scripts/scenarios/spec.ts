import type { MissedDayOutcome, SplitType } from "@prisma/client";

/**
 * The fact vocabulary a scenario is built from (dev tooling only).
 *
 * A scenario describes FACTS — plan rows, gyms, dated workouts with the sets
 * actually lifted, missed-day resolutions, goals as the lifter set them,
 * cardio done. It never describes a conclusion: there is no field for a
 * progression tag, e1RM, trend, stall flag, suggested weight, or goal
 * percentage, because the application derives all of those on read. Gym
 * baselines and goal completion are produced by the application's own
 * functions while the facts are written (see ./write.ts).
 */

/**
 * The library exercises scenarios use, by stable free-exercise-db source id
 * (the catalog import identity key). Looked up, never created: if one is
 * missing or archived, seeding stops with a message instead of duplicating a
 * canonical exercise.
 */
export const LIBRARY = {
  BENCH: "Barbell_Bench_Press_-_Medium_Grip",
  SQUAT: "Barbell_Squat",
  RDL: "Romanian_Deadlift",
  ROW: "Bent_Over_Barbell_Row",
  OHP: "Standing_Military_Press",
  INCLINE_DB: "Incline_Dumbbell_Press",
  LATERAL: "Side_Lateral_Raise",
  CURL: "Dumbbell_Bicep_Curl",
  PULLDOWN: "Wide-Grip_Lat_Pulldown",
  CABLE_ROW: "Seated_Cable_Rows",
  PUSHDOWN: "Triceps_Pushdown",
  LEG_PRESS: "Leg_Press",
  LEG_CURL: "Seated_Leg_Curl",
  CHEST_PRESS: "Leverage_Chest_Press",
} as const;

export type ExerciseKey = keyof typeof LIBRARY;

export type SlotSpec = {
  ex: ExerciseKey;
  sets: number;
  repMin: number;
  repMax: number;
};

export type SessionSpec = {
  key: string;
  name: string;
  /** Days after the mesocycle start (0–6); fixes the weekday. */
  dayOffset: number;
  slots: SlotSpec[];
};

export type MesocycleSpec = {
  key: string;
  name: string;
  splitType: SplitType;
  status: "active" | "archived";
  startIso: string;
  lengthWeeks: number;
  deloadEveryWeeks: number;
  sessions: SessionSpec[];
  /** Planned cardio: one item on a day offset (0–6), type + minutes only. */
  cardio?: { dayOffset: number; type: string; durationMin: number }[];
};

export type GymSpec = {
  key: string;
  name: string;
  address?: string;
  /** Archived (soft-deleted) on this date; history still references it. */
  archivedIso?: string;
};

export type SetSpec = { weightLbs: number; reps: number };

export type WorkoutSpec = {
  meso: string;
  session: string;
  /** The planned occurrence's authored date. */
  scheduledFor: string;
  gym: string;
  /** In slot order; `performed` names a same-muscle swap for that slot. */
  exercises: { ex: ExerciseKey; performed?: ExerciseKey; sets: SetSpec[] }[];
};

export type ResolutionSpec = {
  meso: string;
  missedOn: string;
  outcome: MissedDayOutcome;
};

export type CardioLogSpec = {
  meso: string;
  /** The planned cardio occurrence's authored date. */
  scheduledFor: string;
  type: string;
  durationMin: number;
};

export type GoalSpec = {
  key: string;
  ex: ExerciseKey;
  /** Measurement gym (required by Goals for machine/cable exercises). */
  gym?: string;
  targetWeightLbs: number;
  targetReps: number;
  createdIso: string;
  /**
   * When set, the application's own completion engine is run as of this date
   * after the history is written; it must archive the goal as completed.
   */
  reconcileOn?: string;
};

export type ScenarioFacts = {
  gyms: GymSpec[];
  mesocycles: MesocycleSpec[];
  workouts: WorkoutSpec[];
  resolutions: ResolutionSpec[];
  cardioLogs: CardioLogSpec[];
  goals: GoalSpec[];
};
