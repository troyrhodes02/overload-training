/**
 * Exercise History & PR Intelligence — the page's data contracts (spec §13).
 * Declared in a pure module so client islands (the trend chart) can import
 * them without pulling in the server-only read layer (history-queries.ts).
 */
import type { SessionCallKind } from "./history";
import type { ProgressionTag, RecommendationDto } from "./types";

export type { SessionCallKind } from "./history";

/** `global` for a gym-consistent exercise; a gym id, or `none`, for a machine. */
export type HistoryScopeDto = { key: string; label: string; archived: boolean };

export type SessionRowDto = {
  loggedExerciseId: string;
  loggedSessionId: string;
  dateIso: string;
  dateLabel: string;
  /** Set only for a gym-consistent exercise (a machine's scope is its gym). */
  gymName: string | null;
  gymArchived: boolean;
  workingSets: { weightLbs: number | null; reps: number; rir: number | null }[];
  extraSets: { weightLbs: number | null; reps: number }[];
  plannedSets: number;
  /** The planned exercise's name when a swap put this one in its place. */
  swappedFromName: string | null;
  call: SessionCallKind;
};

export type RecordSetDto = {
  weightLbs: number;
  reps: number;
  dateIso: string;
  dateLabel: string;
};

export type ExerciseRecordsDto =
  | {
      kind: "loaded";
      bestSet: RecordSetDto;
      /** Rounded estimate of the best set. */
      bestE1rm: number;
      heaviest: RecordSetDto;
      repRecords: RecordSetDto[];
    }
  | {
      kind: "bodyweight";
      mostReps: { reps: number; dateIso: string; dateLabel: string };
    };

export type TrendPointDto = {
  dateIso: string;
  dateLabel: string;
  value: number;
  scheduledDeload: boolean;
  /** The working sets behind the point, for the tooltip and hidden table. */
  setsLabel: string;
  /**
   * Speculative e1RM projected from this session's reported RIR (OVE-80), or
   * null when no set that session could project (no RIR, or 4+). Set only on
   * the e1RM trend; always null on the weight and reps trends. Presentation
   * only — never stored, never read by the engine, goals, or baselines.
   */
  projected?: number | null;
};

export type TrendDto = {
  points: TrendPointDto[];
  /** The latest point outside a scheduled-deload week (R29). */
  latest: number | null;
};

export type HistoryNextDto =
  | {
      kind: "call";
      tag: ProgressionTag | null;
      recommendation: RecommendationDto | null;
      insufficientNote: string | null;
    }
  | { kind: "no_gym" };

export type ExerciseHistoryDto = {
  exerciseId: string;
  gymVariable: boolean;
  externalLoad: boolean;
  hasHistory: boolean;
  /** Machine/cable scopes, most recent first, "No gym recorded" last; [] otherwise. */
  scopes: HistoryScopeDto[];
  selectedScope: HistoryScopeDto | null;
  next: HistoryNextDto | null;
  records: ExerciseRecordsDto | null;
  trend: {
    e1rm: TrendDto | null;
    weight: TrendDto | null;
    reps: TrendDto | null;
  };
  sessions: { rows: SessionRowDto[]; total: number; showingAll: boolean };
};
