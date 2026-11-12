import type { ExtractedPlanObservation } from "@/lib/import/extraction/schema";
import type { LibraryCandidate } from "@/lib/import/match/matcher";

/**
 * Workout Plan Import & Review (OVE-109, blueprint §7.3, spec §14.12) — the
 * golden-set fixture shape.
 *
 * A fixture is a SYNTHETIC ground-truth case: it contains NO real client or
 * customer training data (every name, plan, and note is invented for the test).
 * It pairs:
 *  - `observation`: what a correct extraction model WOULD report for this source
 *    (the strict-schema observed fields). In the default MOCKED run this stands in
 *    for the model's output; in a real-provider run (owner-gated) the real model
 *    produces this instead and the fixture's `expected` is the human annotation.
 *  - `library`: the synthetic catalog the deterministic matcher runs against.
 *  - `expected`: the HUMAN-annotated ground truth the eval scores against (day
 *    labels, per-exercise matched name / sets / rep range, which fields the source
 *    genuinely left unstated, and whether the whole thing is a plan).
 *
 * The eval runner turns `observation` into an ImportDraft through the SAME
 * deterministic parse + match + build the product uses, then scores the draft
 * against `expected`. Hallucination is any draft value that is not traceable to a
 * stated source field.
 */

export type GoldenSourceKind =
  | "pasted_text"
  | "text_pdf"
  | "scanned_pdf"
  | "screenshot"
  | "photo_handwriting";

/** The hard dimensions a fixture deliberately stresses (blueprint §7.3). */
export type GoldenHardCase =
  | "table"
  | "multi_column"
  | "mixed_units"
  | "supersets"
  | "handwriting"
  | "illegibility"
  | "non_plan"
  | "injection"
  | "week_by_week"
  | "clean";

/** Ground-truth for one exercise the source genuinely contained. */
export type GoldenExercise = {
  /** The library name the raw string SHOULD resolve to, or null if unknown. */
  matchName: string | null;
  /** Expected match outcome (catalog accuracy). */
  matchKind: "matched" | "ambiguous" | "unknown";
  /** Integer sets, or null if the source did not state it. */
  sets: number | null;
  /** Rep range the source stated, or null each when unstated. */
  repMin: number | null;
  repMax: number | null;
};

export type GoldenExpected = {
  isWorkoutPlan: boolean;
  dayLabels: string[];
  exercises: GoldenExercise[];
  /**
   * Field paths the source genuinely left unstated (explicit-missing ground
   * truth). The eval checks the draft marks these missing/needed, never guessed.
   */
  explicitlyMissing: string[];
};

export type GoldenFixture = {
  id: string;
  kind: GoldenSourceKind;
  hardCases: GoldenHardCase[];
  library: LibraryCandidate[];
  observation: ExtractedPlanObservation;
  expected: GoldenExpected;
  /** Synthetic token/latency accounting for the cost/latency metric (mocked). */
  mockUsage: { inputTokens: number; outputTokens: number; latencyMs: number };
};
