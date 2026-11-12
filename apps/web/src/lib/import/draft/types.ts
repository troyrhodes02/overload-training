/**
 * Workout Plan Import & Review (Pitch 22, OVE-106) — the ImportDraft and its DTO.
 *
 * Two shapes live here, and the distinction is load-bearing:
 *  - `ImportDraft` is the account-owned, versioned object STORED on
 *    `ImportSession.draft` (validated-shape JSON). It carries the deterministic
 *    interpretation of the observation plus user edits and the issues list. It is
 *    never a plan and never a stored progression/e1RM value.
 *  - `ImportDraftDto` is what crosses to the client island (spec §13). Exercise
 *    ids in a match come ONLY from deterministic library matching, never the
 *    model. No raw filenames, source text beyond quoted evidence, provider keys,
 *    or Prisma errors ever appear in a DTO.
 *
 * The DTO field names are fixed by the binding preview (title/days/label/
 * exercises with match/sets/repMin/repMax/context, issues[]).
 */

/** Review status chip (spec §13). "needed" = blocking "needed to continue". */
export type FieldStatus =
  "explicit" | "derived" | "missing" | "ambiguous" | "needed" | "user_edited";

export type EvidenceRef = {
  partIndex: number | null;
  page: number | null;
  quote: string | null;
  locationHint: string | null;
};

export type DraftField<T> = {
  value: T | null;
  raw: string | null;
  status: FieldStatus;
  evidence: EvidenceRef | null;
  candidates?: T[];
};

export type DraftMatch =
  | { kind: "matched"; exerciseId: string; name: string }
  | {
      kind: "ambiguous";
      candidates: { exerciseId: string; name: string }[];
      raw: string;
    }
  | { kind: "unknown"; raw: string }
  | {
      kind: "custom_staged";
      name: string;
      primaryMuscle: string;
      equipmentType: string;
    };

export type DraftSourceContext = { label: string; value: string };

export type DraftExercise = {
  key: string;
  match: DraftMatch;
  sets: DraftField<number>;
  repMin: DraftField<number>;
  repMax: DraftField<number>;
  /** read-only source context (never persisted): load, rest, tempo, %, RPE, superset. */
  context: DraftSourceContext[];
};

export type DraftDay = {
  key: string;
  label: DraftField<string>;
  exercises: DraftExercise[];
};

export type DraftIssue = {
  code: string;
  severity: "blocking" | "info";
  fieldPath: string;
  evidence: EvidenceRef | null;
};

/** The stored draft (also the DTO shape — identical by design; see build.ts). */
export type ImportDraft = {
  version: number;
  title: DraftField<string>;
  days: DraftDay[];
  issues: DraftIssue[];
};

export type ImportDraftDto = ImportDraft;

export type ImportStep = "source" | "processing" | "review" | "done";

export type ImportStatusDto = {
  sessionId: string;
  status: string;
  step: ImportStep;
  errorCode: string | null;
};
