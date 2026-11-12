import { z } from "zod";
import type {
  EvidenceRef,
  ExtractedPlanObservation,
  ObservedField,
} from "./schema";

/**
 * Workout Plan Import & Review (Pitch 22) — the COMPACT structured-output format
 * the model actually writes, and its conversion into the internal
 * `ExtractedPlanObservation` the deterministic layer consumes.
 *
 * Why a separate wire format: the internal shape reports every field as
 * `{ raw, legible, evidence: { partIndex, page, quote, locationHint } }`, which
 * cost ~450 output tokens per exercise on a real run. A real 6-day, ~40-exercise
 * plan therefore needed ~19k output tokens, overran the cap, and failed as "too
 * long". Only the exercise NAME's evidence is ever used downstream (matching,
 * quote verification, page bounds), and every other field is read as `.raw`.
 * So the wire format carries plain nullable strings plus ONE location (part,
 * page) per exercise and per day; the name itself is the evidence quote, since
 * the model reports it verbatim. That is roughly 60–80 tokens per exercise.
 *
 * Still strict: every object rejects extra fields, and every value is nullable
 * so "not stated" is representable without a guess.
 */

const text = z.string().nullable();
const loc = {
  /** Which source part (0-based) this came from. */
  part: z.number().int().nullable(),
  /** 1-based PDF page; null for text and images. */
  page: z.number().int().nullable(),
};

export const WireExerciseSchema = z
  .object({
    name: text,
    ...loc,
    sets: text,
    reps: text,
    load: text,
    rest: text,
    tempo: text,
    notes: text,
    group: text,
  })
  .strict();

export const WireDaySchema = z
  .object({
    label: text,
    ...loc,
    exercises: z.array(WireExerciseSchema),
  })
  .strict();

export const WireObservationSchema = z
  .object({
    isWorkoutPlan: z.boolean(),
    title: text,
    days: z.array(WireDaySchema),
    unreadable: z.array(z.object({ ...loc, hint: text }).strict()),
    contradictions: z.array(
      z.object({ message: z.string(), ...loc, quote: text }).strict(),
    ),
  })
  .strict();

export type WireObservation = z.infer<typeof WireObservationSchema>;

/** Field names the prompt must mention (parity test). */
export const WIRE_TOP_FIELDS = Object.keys(WireObservationSchema.shape);
export const WIRE_DAY_FIELDS = Object.keys(WireDaySchema.shape);
export const WIRE_EXERCISE_FIELDS = Object.keys(WireExerciseSchema.shape);

/**
 * When one slot lists alternatives ("Machine Shoulder Press or Smith Machine
 * Shoulder Press"), the import keeps only the first. The prompt asks the model
 * to do this; this is the deterministic backstop. Only a standalone "or" splits,
 * so a name that merely contains the letters ("Rotator", "Floor Press") is safe.
 */
export function firstAlternative(name: string | null): string | null {
  if (name == null) return null;
  const [rawFirst, rawSecond] = name.split(/\s+or\s+/i);
  const first = rawFirst?.trim() ?? "";
  if (first.length === 0 || rawSecond == null) return name.trim();
  // "Seated or Lying Leg Curl": a lone modifier shares the rest of the name
  // with the second option, so the first option is "Seated Leg Curl".
  const firstWords = first.split(/\s+/);
  const secondWords = rawSecond.trim().split(/\s+/);
  if (firstWords.length === 1 && secondWords.length >= 3) {
    return [first, ...secondWords.slice(1)].join(" ");
  }
  return first;
}

function evidence(
  part: number | null,
  page: number | null,
  quote: string | null,
  locationHint: string | null = null,
): EvidenceRef | null {
  if (part == null && page == null && quote == null && locationHint == null) {
    return null;
  }
  return { partIndex: part, page, quote, locationHint };
}

function plain(raw: string | null): ObservedField {
  return { raw, legible: true, evidence: null };
}

/** Expand the compact wire answer into the internal observation shape. */
export function wireToObservation(
  wire: WireObservation,
): ExtractedPlanObservation {
  return {
    isWorkoutPlan: wire.isWorkoutPlan,
    title: plain(wire.title),
    generalNotes: plain(null),
    days: wire.days.map((day, dayIndex) => ({
      order: dayIndex,
      label: {
        raw: day.label,
        legible: true,
        evidence: evidence(day.part, day.page, day.label),
      },
      notes: plain(null),
      exercises: day.exercises.map((ex, exIndex) => {
        const name = firstAlternative(ex.name);
        return {
          order: exIndex,
          groupLabel: plain(ex.group),
          name: {
            raw: name,
            legible: name != null,
            evidence: evidence(ex.part ?? day.part, ex.page ?? day.page, name),
          },
          sets: plain(ex.sets),
          reps: plain(ex.reps),
          load: plain(ex.load),
          rest: plain(ex.rest),
          tempo: plain(ex.tempo),
          notes: plain(ex.notes),
          alternativeReadings: [],
        };
      }),
    })),
    unreadable: wire.unreadable.map(
      (u) =>
        evidence(u.part, u.page, null, u.hint) ?? {
          partIndex: null,
          page: null,
          quote: null,
          locationHint: null,
        },
    ),
    contradictions: wire.contradictions.map((c) => ({
      message: c.message,
      evidence: [evidence(c.part, c.page, c.quote)].filter(
        (e): e is EvidenceRef => e != null,
      ),
    })),
  };
}
