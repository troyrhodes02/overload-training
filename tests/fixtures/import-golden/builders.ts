import type {
  ExtractedPlanObservation,
  ObservedDay,
  ObservedExercise,
  ObservedField,
} from "@/lib/import/extraction/schema";
import type { LibraryCandidate } from "@/lib/import/match/matcher";

/**
 * Compact builders for the golden-set fixtures (OVE-109). These only assemble the
 * strict-schema observation shape; they contain no product logic, so a fixture
 * remains an independent ground-truth statement, not a re-run of the code under
 * test.
 */

export function f(raw: string | null, legible = true): ObservedField {
  return { raw, legible, evidence: null };
}

/** An observed field that cites a text quote (for quote-to-source scoring). */
export function fq(
  raw: string | null,
  quote: string,
  partIndex = 0,
  page: number | null = null,
): ObservedField {
  return {
    raw,
    legible: true,
    evidence: { partIndex, page, quote, locationHint: null },
  };
}

export function ex(
  name: string | null,
  sets: string | null,
  reps: string | null,
  opts: {
    load?: string | null;
    rest?: string | null;
    tempo?: string | null;
    notes?: string | null;
    groupLabel?: string | null;
    legibleName?: boolean;
    alternativeReadings?: string[];
    order?: number;
  } = {},
): ObservedExercise {
  return {
    order: opts.order ?? 0,
    groupLabel: f(opts.groupLabel ?? null),
    name: f(name, opts.legibleName ?? true),
    sets: f(sets),
    reps: f(reps),
    load: f(opts.load ?? null),
    rest: f(opts.rest ?? null),
    tempo: f(opts.tempo ?? null),
    notes: f(opts.notes ?? null),
    alternativeReadings: opts.alternativeReadings ?? [],
  };
}

export function day(
  label: string | null,
  exercises: ObservedExercise[],
  order = 0,
): ObservedDay {
  return {
    order,
    label: f(label),
    exercises: exercises.map((e, i) => ({ ...e, order: i })),
    notes: f(null),
  };
}

export function observation(
  isWorkoutPlan: boolean,
  title: string | null,
  days: ObservedDay[],
  opts: {
    unreadable?: ExtractedPlanObservation["unreadable"];
    contradictions?: ExtractedPlanObservation["contradictions"];
  } = {},
): ExtractedPlanObservation {
  return {
    isWorkoutPlan,
    title: f(title),
    days: days.map((d, i) => ({ ...d, order: i })),
    generalNotes: f(null),
    unreadable: opts.unreadable ?? [],
    contradictions: opts.contradictions ?? [],
  };
}

/** A small synthetic library shared by most fixtures (NO real data). */
export const SYN_LIBRARY: LibraryCandidate[] = [
  { id: "lib-bench", name: "Barbell Bench Press" },
  { id: "lib-incline", name: "Incline Barbell Bench Press" },
  { id: "lib-squat", name: "Barbell Back Squat" },
  { id: "lib-front-squat", name: "Barbell Front Squat" },
  { id: "lib-dead", name: "Barbell Deadlift" },
  { id: "lib-romanian", name: "Romanian Deadlift" },
  { id: "lib-ohp", name: "Overhead Press" },
  { id: "lib-row", name: "Barbell Row" },
  { id: "lib-pulldown", name: "Lat Pulldown" },
  { id: "lib-curl", name: "Dumbbell Biceps Curl" },
  { id: "lib-pushdown", name: "Triceps Pushdown" },
  { id: "lib-legpress", name: "Leg Press" },
  { id: "lib-legcurl", name: "Lying Leg Curl" },
  { id: "lib-latraise", name: "Dumbbell Lateral Raise" },
  { id: "lib-pullup", name: "Pull-Up" },
];
