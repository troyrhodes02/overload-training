import { z } from "zod";

/**
 * Workout Plan Import & Review (Pitch 22, OVE-106) — the STRICT Zod schema the
 * extraction model must satisfy (blueprint §3.4). The model OBSERVES; it reports
 * only what it saw, as nullable raw strings plus evidence. It carries NO catalog
 * ids, NO Prisma ids, NO account identifiers, and NO progression/e1RM values —
 * the deterministic layer decides all of that from these observations.
 *
 * `.strict()` makes every object reject extra/invented fields: a model that
 * returns a key the schema does not name fails validation rather than smuggling
 * a hallucinated field through. Every observed value is `.nullable()` so "the
 * source did not state this" is representable without a guess.
 *
 * This schema is the single source of truth for the structured-output format AND
 * the prompt's field list: `promptFieldList()` derives the prompt's field
 * description from it so the two can never drift (the parity test asserts it).
 */

export const EvidenceRefSchema = z
  .object({
    /** Which source part (0-based) the quote came from. */
    partIndex: z.number().int().nullable(),
    /** 1-based page for a PDF part; null for text/images. */
    page: z.number().int().nullable(),
    /** The exact substring the model is pointing at, or null. */
    quote: z.string().nullable(),
    /** A coarse "near here" hint for images; never pixel-precise. */
    locationHint: z.string().nullable(),
  })
  .strict();

export const ObservedFieldSchema = z
  .object({
    /** The raw text exactly as written, or null if the source lacked it. */
    raw: z.string().nullable(),
    /** False when the model could see something was there but could not read it. */
    legible: z.boolean(),
    evidence: EvidenceRefSchema.nullable(),
  })
  .strict();

export const ObservedExerciseSchema = z
  .object({
    order: z.number().int(),
    /** Superset / grouping label like "A1" / "A2" only when present. */
    groupLabel: ObservedFieldSchema,
    name: ObservedFieldSchema,
    sets: ObservedFieldSchema,
    reps: ObservedFieldSchema,
    load: ObservedFieldSchema,
    rest: ObservedFieldSchema,
    tempo: ObservedFieldSchema,
    notes: ObservedFieldSchema,
    /** Other plausible readings of a hard-to-read line; never a guess promoted. */
    alternativeReadings: z.array(z.string()),
  })
  .strict();

export const ObservedDaySchema = z
  .object({
    order: z.number().int(),
    label: ObservedFieldSchema,
    exercises: z.array(ObservedExerciseSchema),
    notes: ObservedFieldSchema,
  })
  .strict();

export const ExtractedPlanObservationSchema = z
  .object({
    /** Is this pasted content actually a workout plan at all? */
    isWorkoutPlan: z.boolean(),
    title: ObservedFieldSchema,
    days: z.array(ObservedDaySchema),
    generalNotes: ObservedFieldSchema,
    /** Regions the model saw but could not read. */
    unreadable: z.array(EvidenceRefSchema),
    /** Internal contradictions in the source (e.g. two different set counts). */
    contradictions: z.array(
      z
        .object({
          message: z.string(),
          evidence: z.array(EvidenceRefSchema),
        })
        .strict(),
    ),
  })
  .strict();

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type ObservedField = z.infer<typeof ObservedFieldSchema>;
export type ObservedExercise = z.infer<typeof ObservedExerciseSchema>;
export type ObservedDay = z.infer<typeof ObservedDaySchema>;
export type ExtractedPlanObservation = z.infer<
  typeof ExtractedPlanObservationSchema
>;

/**
 * The exact set of observed field names the model is asked to report, derived
 * from the schema itself so the prompt and the schema can never drift (the
 * prompt/schema parity test asserts this list against the schema shape).
 */
export const OBSERVED_EXERCISE_FIELDS = [
  "order",
  "groupLabel",
  "name",
  "sets",
  "reps",
  "load",
  "rest",
  "tempo",
  "notes",
  "alternativeReadings",
] as const;

export const OBSERVED_TOP_FIELDS = [
  "isWorkoutPlan",
  "title",
  "days",
  "generalNotes",
  "unreadable",
  "contradictions",
] as const;
